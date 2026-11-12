import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { staffInventorySummary } from "@/lib/inventory-summary";

const LOOKBACK_DAYS = 90;
const DAY_MS = 86400000;

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("id", user.id).single();
  if (!profile?.active) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, user, profile, response: null };
}

export async function GET() {
  const s = await session();
  if (s.response) return s.response;
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const [products, inventory, movements] = await Promise.all([
    s.supabase.from("products").select("id,name,sku,category,minimum_stock,supplier_lead_time_days,safety_stock,target_stock_days,active").eq("active", true).order("name"),
    staffInventorySummary(s.supabase),
    s.supabase.from("stock_movements").select("product_id,movement_type,quantity_delta,created_at").in("movement_type", ["SALE", "REPAIR_ISSUE"]).lt("quantity_delta", 0).gte("created_at", since).order("created_at", { ascending: false }).limit(10000)
  ]);
  const failed = [products, movements].find(x => x.error);
  if (failed) return NextResponse.json({ error: failed.error?.message || "Could not calculate restocking recommendations." }, { status: 400 });

  const stockByProduct = new Map(inventory.map(x => [x.product_id, Number(x.physical_stock || 0)]));
  const demandByProduct = new Map<string, { units: number; events: number; days: Set<string> }>();
  for (const movement of movements.data || []) {
    const current = demandByProduct.get(movement.product_id) || { units: 0, events: 0, days: new Set<string>() };
    current.units += Math.abs(Number(movement.quantity_delta || 0));
    current.events += 1;
    current.days.add(String(movement.created_at).slice(0, 10));
    demandByProduct.set(movement.product_id, current);
  }

  const recommendations = (products.data || []).map(product => {
    const stock = stockByProduct.get(product.id) || 0;
    const demand = demandByProduct.get(product.id) || { units: 0, events: 0, days: new Set<string>() };
    const averageDailyDemand = demand.units / LOOKBACK_DAYS;
    const leadTime = Number(product.supplier_lead_time_days || 7);
    const safetyStock = Number(product.safety_stock || 0);
    const targetDays = Number(product.target_stock_days || 30);
    const reorderPoint = Math.ceil(averageDailyDemand * leadTime + safetyStock);
    const targetStock = Math.ceil(averageDailyDemand * (leadTime + targetDays) + safetyStock);
    const reliable = demand.events >= 3 && demand.days.size >= 3;
    const needsReview = stock <= Math.max(reorderPoint, Number(product.minimum_stock || 0));
    return {
      id: product.id, name: product.name, sku: product.sku, category: product.category,
      stock, minimum_stock: Number(product.minimum_stock || 0), lead_time_days: leadTime,
      safety_stock: safetyStock, target_stock_days: targetDays,
      demand_units_90d: demand.units, demand_events_90d: demand.events,
      average_daily_demand: Number(averageDailyDemand.toFixed(3)),
      reorder_point: reorderPoint, target_stock: targetStock,
      suggested_order_quantity: reliable && needsReview ? Math.max(0, targetStock - stock) : null,
      confidence: reliable ? "USABLE" : demand.events ? "LIMITED" : "NO_HISTORY",
      needs_review: needsReview
    };
  }).sort((a, b) => Number(b.needs_review) - Number(a.needs_review) || (b.suggested_order_quantity || 0) - (a.suggested_order_quantity || 0) || a.name.localeCompare(b.name));

  return NextResponse.json({ lookback_days: LOOKBACK_DAYS, generated_at: new Date().toISOString(), role: s.profile!.role, recommendations });
}

export async function PATCH(req: Request) {
  const s = await session();
  if (s.response) return s.response;
  if (s.profile!.role !== "BOSS") return NextResponse.json({ error: "Only the BOSS can change restocking parameters." }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const lead = Number(body.supplier_lead_time_days);
  const safety = Number(body.safety_stock);
  const target = Number(body.target_stock_days);
  if (!body.product_id || !Number.isInteger(lead) || lead < 1 || lead > 365 || !Number.isInteger(safety) || safety < 0 || safety > 1000000 || !Number.isInteger(target) || target < 1 || target > 365) {
    return NextResponse.json({ error: "Enter a lead time of 1–365 days, safety stock of 0 or more, and target coverage of 1–365 days." }, { status: 400 });
  }
  const { data, error } = await s.supabase.from("products").update({ supplier_lead_time_days: lead, safety_stock: safety, target_stock_days: target }).eq("id", body.product_id).eq("active", true).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Active product not found." }, { status: 404 });
  return NextResponse.json({ message: "Restocking parameters updated." });
}
