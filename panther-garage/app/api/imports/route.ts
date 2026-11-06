import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildStagingPayload } from "@/lib/import/source";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";

export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireBoss(): Promise<
  { supabase: Supabase; response: null } | { supabase: Supabase; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "BOSS") {
    return { supabase, response: NextResponse.json({ error: "BOSS access is required." }, { status: 403 }) };
  }
  return { supabase, response: null };
}

function schemaMissing(message: string) {
  return /does not exist|schema cache|Could not find the function|Could not find the table/i.test(message);
}

function migrationError(message: string) {
  return NextResponse.json(
    {
      error:
        "The spare-parts import schema is not installed yet. Apply supabase/migrations/008_spare_parts_catalogue_import.sql, then reload this page.",
      migrationRequired: true,
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = await requireBoss();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const url = new URL(request.url);
  const requestedId = url.searchParams.get("id");

  let query = supabase
    .from("inventory_imports")
    .select("id,reference,status,primary_file,source_summary,report,created_by,approved_by,approved_at,applied_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (requestedId) query = query.eq("id", requestedId);
  const { data: imports, error } = await query;
  if (error) {
    if (schemaMissing(error.message)) return migrationError(error.message);
    return dbErrorResponse(400);
  }

  const selected = imports?.[0];
  if (!selected) return NextResponse.json({ imports: imports || [], selected: null });

  const [itemsResult, conflictsResult] = await Promise.all([
    supabase
      .from("inventory_import_items")
      .select(
        "id,import_id,source_file,source_sheet,source_row,source_role,original_name,original_reference,original_model,quantity,unit_cost,suggested_sell,stock_purchase_value,potential_sales_value,recalculated_stock_value,compatibility,category,proposed_sku,decision,review_status,matched_product_id,approved_selling_price,approved_category,approved_compatibility,notes,has_blocking_conflict,applied,applied_batch_id,applied_movement_id,errors,created_at,updated_at",
      )
      .eq("import_id", selected.id)
      .order("source_role", { ascending: true })
      .order("source_row", { ascending: true }),
    supabase
      .from("inventory_import_conflicts")
      .select(
        "id,import_id,item_id,conflict_type,severity,detail,source_file,source_row,comparison_file,comparison_row,resolved,resolution,created_at",
      )
      .eq("import_id", selected.id)
      .order("severity", { ascending: false })
      .order("source_row", { ascending: true }),
  ]);

  if (itemsResult.error) {
    if (schemaMissing(itemsResult.error.message)) return migrationError(itemsResult.error.message);
    return dbErrorResponse(503);
  }

  return NextResponse.json({
    imports: imports || [],
    selected: {
      ...selected,
      items: itemsResult.data || [],
      conflicts: conflictsResult.data || [],
    },
  });
}

export async function POST() {
  const auth = await requireBoss();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { data: active, error: activeError } = await supabase
    .from("inventory_imports")
    .select("id,reference,status")
    .in("status", ["REVIEW", "APPROVED"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (activeError) {
    if (schemaMissing(activeError.message)) return migrationError(activeError.message);
    return dbErrorResponse(503);
  }
  if (active?.length) {
    return NextResponse.json(
      {
        error: `Import ${active[0].reference} is still awaiting review or application. Apply or cancel it before reading the workbooks again.`,
        import_id: active[0].id,
      },
      { status: 409 },
    );
  }

  try {
    const payload = buildStagingPayload();
    const { data, error } = await supabase.rpc("stage_inventory_import", {
      p_primary_file: payload.primaryFile,
      p_source_summary: payload.sourceSummary,
      p_items: payload.items,
      p_conflicts: payload.conflicts,
    });
    if (error) {
      if (schemaMissing(error.message)) return migrationError(error.message);
      return dbErrorResponse(400);
    }
    return NextResponse.json({ ...(data as object), staged: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "The import bundle could not be read." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireBoss();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: any;
  try {
    body = await readJson(request, 64 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const importId = String(body.import_id || "");
  if (!importId) return NextResponse.json({ error: "Select an import first." }, { status: 400 });

  if (body.action === "approve_all") {
    const { data, error } = await supabase.rpc("approve_inventory_import", {
      p_import_id: importId,
      p_include_blocking: Boolean(body.include_blocking),
    });
    if (error) {
      if (schemaMissing(error.message)) return migrationError(error.message);
      return dbErrorResponse(400);
    }
    return NextResponse.json({ result: data });
  }

  if (body.action === "cancel") {
    const { error } = await supabase
      .from("inventory_imports")
      .update({ status: "CANCELLED" })
      .eq("id", importId)
      .neq("status", "APPLIED");
    if (error) return dbErrorResponse(400);
    return NextResponse.json({ cancelled: true });
  }

  if (body.action === "item") {
    const itemId = String(body.item_id || "");
    if (!itemId) return NextResponse.json({ error: "Select a row first." }, { status: 400 });
    const { data: ownedItem, error: itemLookupError } = await supabase.from("inventory_import_items").select("id").eq("id", itemId).eq("import_id", importId).maybeSingle();
    if (itemLookupError) return dbErrorResponse(503);
    if (!ownedItem) return NextResponse.json({ error: "That import row does not belong to the selected import." }, { status: 400 });
    const price =
      body.selling_price === "" || body.selling_price === null || body.selling_price === undefined
        ? null
        : Number(body.selling_price);
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      return NextResponse.json(
        { error: "A confirmed selling price must be a positive amount." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase.rpc("set_import_item_review", {
      p_item_id: itemId,
      p_decision: String(body.decision || "PENDING"),
      p_product_id: body.product_id || null,
      p_selling_price: price,
      p_category: body.category || null,
      p_compatibility: body.compatibility || null,
      p_review_status: String(body.review_status || "APPROVED"),
      p_notes: body.notes || null,
    });
    if (error) {
      if (schemaMissing(error.message)) return migrationError(error.message);
      return dbErrorResponse(400);
    }
    return NextResponse.json({ result: data });
  }

  if (body.action === "resolve_conflict") {
    const conflictId = String(body.conflict_id || "");
    if (!conflictId) return NextResponse.json({ error: "Select a conflict first." }, { status: 400 });
    const { data: ownedConflict, error: conflictLookupError } = await supabase.from("inventory_import_conflicts").select("id").eq("id", conflictId).eq("import_id", importId).maybeSingle();
    if (conflictLookupError) return dbErrorResponse(503);
    if (!ownedConflict) return NextResponse.json({ error: "That conflict does not belong to the selected import." }, { status: 400 });
    const { error } = await supabase
      .from("inventory_import_conflicts")
      .update({ resolved: true, resolution: String(body.resolution || "Reviewed by BOSS") })
      .eq("id", conflictId);
    if (error) return dbErrorResponse(400);
    return NextResponse.json({ resolved: true });
  }

  return NextResponse.json({ error: "Unknown import action." }, { status: 400 });
}
