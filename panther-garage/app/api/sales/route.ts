import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";
import { flushBossAlertEmail } from "@/lib/alert-delivery";
import { staffInventorySummary } from "@/lib/inventory-summary";

async function staff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("active,role").eq("id", user.id).single();
  if (!profile?.active) return { supabase, user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, user, role: profile.role, response: null };
}

export async function GET() {
  const s = await staff();
  if (s.response) return s.response;
  const isBoss = s.role === "BOSS";
  const itemFields = isBoss
    ? "product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,item_type,cost_known"
    : "product_id,product_name,sku,quantity,unit_price,line_total,item_type";
  const sellerField = isBoss ? ",seller:profiles!sales_sold_by_fkey(full_name)" : "";
  const [salesResult, stockResult] = await Promise.all([
    s.supabase.from("sales").select(`id,invoice_number,status,payment_method,subtotal,discount,total,amount_paid,balance_due,created_at,service_performed,service_fee,mechanic_name,motorcycle_plate,service_description${sellerField},customers(full_name,phone),sale_items(${itemFields})`).eq("status", "COMPLETED").order("created_at", { ascending: false }).limit(100),
    staffInventorySummary(s.supabase).catch((error) => {
      console.error("Could not load current stock for invoice details", error);
      return [];
    }),
  ]);
  const { data, error } = salesResult;
  if (error) return dbErrorResponse(503, error);
  const stockByProduct = new Map(stockResult.map((row) => [row.product_id, row.physical_stock]));
  const sales = (data || []).map((sale: any) => {
    const lineItems = sale.sale_items || [];
    const subtotal = Number(sale.subtotal) || 0;
    const discount = Number(sale.discount) || 0;
    return {
      ...sale,
      registration_number: sale.motorcycle_plate || null,
      service_notes: sale.service_description || null,
      sale_items: lineItems.map((item: any) => {
        const quantity = Number(item.quantity) || 0;
        const lineTotal = Number(item.line_total) || 0;
        const allocatedDiscount = subtotal > 0 ? Math.round((discount * lineTotal / subtotal) * 100) / 100 : 0;
        const result = {
          ...item,
          item_type: item.item_type === "USED" || item.item_type === "USED_NONSTOCK" ? "USED_NONSTOCK" : "STOCK",
          quantity,
          unit_price: Number(item.unit_price) || 0,
          line_total: lineTotal,
          current_stock: item.product_id ? stockByProduct.get(item.product_id) ?? null : null,
          effective_unit_price: quantity > 0 ? (lineTotal - allocatedDiscount) / quantity : 0,
        } as Record<string, unknown>;
        if (isBoss) {
          const costIsKnown = item.cost_known !== false && item.unit_cost !== null && item.unit_cost !== undefined;
          result.unit_cost = costIsKnown ? Number(item.unit_cost) : null;
          result.gross_profit = costIsKnown
            ? Math.round((lineTotal - allocatedDiscount - Number(item.unit_cost) * quantity) * 100) / 100
            : null;
        }
        return result;
      }),
    };
  });
  return NextResponse.json({ sales, is_boss: isBoss });
}

export async function POST(req: Request) {
  const s = await staff();
  if (s.response) return s.response;
  if (!(s.role === "BOSS" || s.role === "EMPLOYEE")) return NextResponse.json({ error: "You are not authorized to record sales." }, { status: 403 });
  let body: any;
  try { body = await readJson(req, 64 * 1024); } catch (error) { return invalidBodyResponse(error); }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    return NextResponse.json({ error: "Add between 1 and 100 sale items." }, { status: 400 });
  }
  const items = body.items.map((item: any) => {
    const itemType = String(item.item_type || "");
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
    if (itemType === "STOCK") {
      const productId = String(item.product_id || "").trim();
      const unitPrice = item.unit_price === undefined ? undefined : Number(item.unit_price);
      if (!productId || (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100000000))) return null;
      return { item_type: "INVENTORY", product_id: productId, quantity, ...(unitPrice === undefined ? {} : { unit_price: unitPrice }) };
    }
    if (itemType === "USED_NONSTOCK") {
      const description = String(item.description || "").trim();
      const unitPrice = Number(item.unit_price);
      const unitCost = item.unit_cost === null || item.unit_cost === undefined || item.unit_cost === "" ? null : Number(item.unit_cost);
      if (description.length < 2 || description.length > 200 || !Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100000000) return null;
      if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 100000000)) return null;
      return { item_type: "USED", product_name: description, quantity, unit_price: unitPrice, unit_cost: unitCost };
    }
    return null;
  });
  if (items.some((item: any) => item === null)) {
    return NextResponse.json({ error: "Check each stock or used-part description, quantity, and price." }, { status: 400 });
  }

  const paymentMethod = String(body.payment_method || "CASH").toUpperCase();
  const paid = Number(body.amount_paid);
  const discount = Number(body.discount || 0);
  if (!["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT"].includes(paymentMethod)
    || !Number.isFinite(paid) || paid < 0 || paid > 100000000
    || !Number.isFinite(discount) || discount < 0 || discount > 100000000) {
    return NextResponse.json({ error: "Enter valid payment and discount amounts." }, { status: 400 });
  }

  const submittedService = body.service && typeof body.service === "object" ? body.service : {};
  const servicePerformed = submittedService.performed === true;
  const serviceFee = servicePerformed ? Number(submittedService.fee ?? 0) : 0;
  const mechanicName = servicePerformed ? String(submittedService.mechanic_name || "").trim() : "";
  const registrationNumber = servicePerformed ? String(submittedService.registration_number || "").trim() : "";
  const serviceNotes = servicePerformed ? String(submittedService.notes || "").trim() : "";
  if (!Number.isFinite(serviceFee) || serviceFee < 0 || serviceFee > 100000000
    || mechanicName.length > 120 || registrationNumber.length > 32 || serviceNotes.length > 240
    || (servicePerformed && (!mechanicName || !registrationNumber))) {
    return NextResponse.json({ error: "For a service sale, enter a valid fee, mechanic name, and motorcycle plate." }, { status: 400 });
  }

  const saleArgs = {
    p_customer_id: body.customer_id || null,
    p_items: items,
    p_payment_method: paymentMethod,
    p_amount_paid: paid,
    p_discount: discount,
    p_notes: String(body.notes || "") || null,
    p_service_performed: servicePerformed,
    p_service_fee: serviceFee,
    p_mechanic_name: mechanicName || null,
    p_motorcycle_plate: registrationNumber || null,
    p_service_description: serviceNotes || null,
  };
  let saleId: string | null = null;
  let saleError: any = null;
  if (s.role === "EMPLOYEE") {
    const { data: shift, error: shiftError } = await s.supabase.rpc("start_employee_shift");
    if (shiftError) return dbErrorResponse(503, shiftError);
    if (!shift?.id) return NextResponse.json({ error: "Could not open an active employee shift." }, { status: 503 });
    const result = await s.supabase.rpc("create_pos_sale_for_shift", { p_shift_id: shift.id, ...saleArgs });
    saleId = result.data;
    saleError = result.error;
  } else {
    const result = await s.supabase.rpc("create_pos_sale_v2", saleArgs);
    saleId = result.data;
    saleError = result.error;
  }
  if (saleError) return dbErrorResponse(400, saleError);
  if (!saleId) return NextResponse.json({ error: "Sale was not created." }, { status: 500 });
  const { data: sale } = await s.supabase.from("sales")
    .select("id,invoice_number,total,amount_paid,balance_due,created_at,service_performed,service_fee,mechanic_name,motorcycle_plate,service_description")
    .eq("id", saleId).single();
  await flushBossAlertEmail();
  return NextResponse.json({ sale, message: "Sale completed and stock deducted using FIFO." }, { status: 201 });
}
