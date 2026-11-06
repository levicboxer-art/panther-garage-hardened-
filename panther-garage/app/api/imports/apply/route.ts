import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "BOSS") {
    return NextResponse.json({ error: "BOSS access is required." }, { status: 403 });
  }

  let body: any;
  try {
    body = await readJson(request, 16 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const importId = String(body.import_id || "");
  if (!importId) return NextResponse.json({ error: "Select an import first." }, { status: 400 });

  const { data, error } = await supabase.rpc("apply_inventory_import", {
    p_import_id: importId,
  });
  if (error) {
    const missing = /does not exist|schema cache|Could not find the function/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "The import function is not installed. Apply supabase/migrations/008_spare_parts_catalogue_import.sql first."
          : "The import could not be applied.",
        migrationRequired: missing,
      },
      { status: missing ? 503 : 400 },
    );
  }

  return NextResponse.json({ report: data });
}
