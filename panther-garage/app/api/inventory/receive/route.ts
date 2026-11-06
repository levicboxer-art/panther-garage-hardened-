import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("active,role").eq("id", user.id).single();
  // RBAC: receiving goods writes supplier costs into FIFO batches, so it is
  // owner-only (the receive_stock RPC enforces the same rule in the database).
  if (!profile?.active || profile.role !== "BOSS") return NextResponse.json({ error: "Only BOSS can receive goods and set supplier costs." }, { status: 403 });
  let body: any; try { body = await readJson(request, 32 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const productId = String(body.product_id || ""); const quantity = Number(body.quantity); const unitCost = Number(body.unit_cost);
  if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100000 || !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 100000000)
    return NextResponse.json({ error: "Select a product and enter a positive whole quantity and valid unit cost." }, { status: 400 });
  const { data, error } = await supabase.rpc("receive_stock", { p_product_id: productId, p_quantity: quantity, p_unit_cost: unitCost, p_supplier_id: body.supplier_id || null, p_receipt_reference: body.receipt_reference || null });
  if (error) return dbErrorResponse(400);
  return NextResponse.json({ batch_id: data, message: "Goods receipt recorded." }, { status: 201 });
}
