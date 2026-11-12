import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { staffInventorySummary } from "@/lib/inventory-summary";

export const dynamic = "force-dynamic";

const BASE_PRODUCT_COLUMNS =
  "id,sku,name,category,brand,description,compatibility,unit,image_url,selling_price,minimum_stock,active,created_at,updated_at";
const DETAIL_PRODUCT_COLUMNS = `${BASE_PRODUCT_COLUMNS},price_status,keywords,source_kind`;
const COMPATIBILITY_VALUES = ["SPIRO ELECTRIC", "AMPERSAND ELECTRIC", "FUEL-POWERED", "UNIVERSAL", "UNCONFIRMED"];

type Supabase = Awaited<ReturnType<typeof createClient>>;

function missingColumn(message: string) {
  return /column .* does not exist|schema cache/i.test(message);
}

function validImageUrl(value: string) {
  try {
    const image = new URL(value);
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    return (
      image.hostname === project.hostname &&
      image.pathname.includes("/storage/v1/object/public/product-images/") &&
      (image.protocol === "https:" ||
        (image.protocol === "http:" && ["localhost", "127.0.0.1"].includes(image.hostname)))
    );
  } catch {
    return false;
  }
}

function normaliseCompatibility(value: unknown) {
  const compatibility = String(value || "").trim().toUpperCase();
  return COMPATIBILITY_VALUES.includes(compatibility) ? compatibility : "UNCONFIRMED";
}

function stockStatus(active: boolean, physical: number, minimum: number, reserved: number) {
  if (!active) return "INACTIVE";
  if (reserved > 0) return "RESERVED";
  if (physical <= 0) return "OUT OF STOCK";
  if (physical <= Math.max(minimum, 2)) return "LOW STOCK";
  return "IN STOCK";
}

async function loadProducts(supabase: Supabase, isBoss: boolean) {
  let detail = true;
  let { data: products, error } = await supabase
    .from("products")
    .select(DETAIL_PRODUCT_COLUMNS)
    .order("name");
  if (error && missingColumn(error.message)) {
    detail = false;
    const fallback = await supabase.from("products").select(BASE_PRODUCT_COLUMNS).order("name");
    products = fallback.data as any;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);

  const ids = (products || []).map((p: any) => p.id);
  const [summary, batchesResult] = await Promise.all([
    ids.length ? staffInventorySummary(supabase) : Promise.resolve([]),
    // FIFO batches carry supplier costs; RLS (migration 013) only lets the
    // BOSS read them, so the query itself must be skipped for staff sessions.
    isBoss && ids.length
      ? supabase
          .from("inventory_batches")
          .select("product_id,quantity_remaining,unit_cost,received_at,supplier_id,suppliers(name)")
          .in("product_id", ids)
          .gt("quantity_remaining", 0)
          .order("received_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let batches: any[] = (batchesResult as any).data || [];
  if ((batchesResult as any).error) {
    const fallback = ids.length
      ? await supabase
          .from("inventory_batches")
          .select("product_id,quantity_remaining,unit_cost,received_at,supplier_id")
          .in("product_id", ids)
          .gt("quantity_remaining", 0)
          .order("received_at", { ascending: true })
      : { data: [] as any[] };
    batches = (fallback as any).data || [];
  }

  const summaryById: Record<string, any> = {};
  for (const row of summary) summaryById[row.product_id] = row;
  const batchesByProduct: Record<string, any[]> = {};
  for (const batch of batches) {
    if (!batchesByProduct[batch.product_id]) batchesByProduct[batch.product_id] = [];
    batchesByProduct[batch.product_id].push(batch);
  }

  return {
    detail,
    products: (products || []).map((product: any) => {
      const productBatches = batchesByProduct[product.id] || [];
      const remaining = productBatches.reduce(
        (sum, batch) => sum + Number(batch.quantity_remaining || 0),
        0,
      );
      const stockValue = productBatches.reduce(
        (sum, batch) =>
          sum + Number(batch.quantity_remaining || 0) * Number(batch.unit_cost || 0),
        0,
      );
      const purchaseCost = remaining > 0 ? stockValue / remaining : null;
      const latestBatch = productBatches[productBatches.length - 1];
      const physical = Number(summaryById[product.id]?.physical_stock ?? remaining);
      const available = Number(summaryById[product.id]?.available_stock ?? physical);
      const reserved = Math.max(0, physical - available);
      const minimum = Number(product.minimum_stock || 0);
      const priceStatus =
        product.price_status ??
        (Number(product.selling_price) > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW");
      return {
        ...product,
        price_status: priceStatus,
        keywords: product.keywords ?? null,
        stock: physical,
        available_stock: available,
        reserved_stock: reserved,
        purchase_cost: purchaseCost,
        stock_value: stockValue,
        supplier: latestBatch?.suppliers?.name || null,
        last_stock_update: latestBatch?.received_at || null,
        status: stockStatus(Boolean(product.active), physical, minimum, reserved),
      };
    }),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isBoss = profile?.role === "BOSS";

  try {
    const result = await loadProducts(supabase, isBoss);
    // RBAC: supplier costs, stock value and sourcing never leave the server
    // for employee sessions. The UI hides these columns, but this strip is
    // what actually protects them.
    if (!isBoss) {
      for (const product of result.products) {
        delete product.purchase_cost;
        delete product.stock_value;
        delete product.supplier;
        delete product.last_stock_update;
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load products." },
      { status: 400 },
    );
  }
}

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
    return NextResponse.json(
      { error: "Only BOSS can register products." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const sku =
    String(body.sku || "").trim() ||
    `PG-MAN-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const imageUrl = String(body.image_url || "").trim();
  const minimumStock = Number(body.minimum_stock ?? 0);
  const requestedPrice = Number(body.selling_price ?? 0);
  const isBoss = profile.role === "BOSS";
  const sellingPrice = isBoss && Number.isFinite(requestedPrice) ? requestedPrice : 0;
  const compatibility = normaliseCompatibility(body.compatibility);
  const category = String(body.category || "").trim() || "UNCLASSIFIED";

  if (!name) return NextResponse.json({ error: "Enter the exact product name." }, { status: 400 });
  if (imageUrl && !validImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "The product image must be a public file in the product-images storage bucket." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return NextResponse.json({ error: "Enter a valid selling price." }, { status: 400 });
  }
  if (!Number.isInteger(minimumStock) || minimumStock < 0) {
    return NextResponse.json({ error: "Enter a valid reorder level." }, { status: 400 });
  }

  const record: Record<string, any> = {
    sku,
    name,
    category,
    brand: String(body.brand || "").trim() || null,
    description: String(body.description || "").trim() || null,
    compatibility,
    unit: String(body.unit || "piece").trim() || "piece",
    image_url: imageUrl || null,
    selling_price: sellingPrice,
    minimum_stock: minimumStock,
    price_status: sellingPrice > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW",
    keywords: String(body.keywords || "").trim() || null,
    source_kind: "MANUAL",
  };

  let { data, error } = await supabase.from("products").insert(record).select().single();
  if (error && missingColumn(error.message)) {
    const legacy = {
      sku,
      name,
      category,
      brand: record.brand,
      description: record.description,
      compatibility,
      unit: record.unit,
      image_url: record.image_url,
      selling_price: sellingPrice,
      minimum_stock: minimumStock,
    };
    const fallback = await supabase.from("products").insert(legacy).select().single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ product: data }, { status: 201 });
}

export async function PATCH(request: Request) {
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
    return NextResponse.json(
      { error: "Only BOSS can edit product records, prices or images." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Select a product first." }, { status: 400 });

  const update: Record<string, any> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Product name cannot be blank." }, { status: 400 });
    update.name = name;
  }
  if (body.category !== undefined) {
    update.category = String(body.category || "").trim() || "UNCLASSIFIED";
  }
  if (body.brand !== undefined) update.brand = String(body.brand || "").trim() || null;
  if (body.description !== undefined) {
    update.description = String(body.description || "").trim() || null;
  }
  if (body.keywords !== undefined) update.keywords = String(body.keywords || "").trim() || null;
  if (body.compatibility !== undefined) {
    update.compatibility = normaliseCompatibility(body.compatibility);
  }
  if (body.unit !== undefined) update.unit = String(body.unit || "piece").trim() || "piece";
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (body.minimum_stock !== undefined) {
    const minimum = Number(body.minimum_stock);
    if (!Number.isInteger(minimum) || minimum < 0) {
      return NextResponse.json({ error: "Enter a valid reorder level." }, { status: 400 });
    }
    update.minimum_stock = minimum;
  }
  if (body.image_url !== undefined) {
    const imageUrl = body.image_url === null ? "" : String(body.image_url).trim();
    if (imageUrl && !validImageUrl(imageUrl)) {
      return NextResponse.json(
        { error: "The product image must be a public file in the product-images storage bucket." },
        { status: 400 },
      );
    }
    update.image_url = imageUrl || null;
  }
  if (body.selling_price !== undefined) {
    const price = Number(body.selling_price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Enter a valid selling price." }, { status: 400 });
    }
    update.selling_price = price;
    update.price_status = price > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW";
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "No changes were supplied." }, { status: 400 });
  }

  let { data, error } = await supabase
    .from("products")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error && missingColumn(error.message)) {
    // The price-status lifecycle arrives with migration 008. Until it is
    // applied, fall back to the original product columns.
    const legacy = { ...update };
    delete legacy.keywords;
    delete legacy.price_status;
    const fallback = await supabase.from("products").update(legacy).eq("id", id).select().single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ product: data });
}
