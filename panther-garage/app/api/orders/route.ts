import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { staffInventorySummary } from "@/lib/inventory-summary";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, invalidBodyResponse, rateLimit, rateLimitedResponse, readJson, requestKey } from "@/lib/api-security";

const ORDER_STATUSES = ["PENDING", "CONTACTED", "CONFIRMED", "FULFILLED", "CANCELLED"];
const RANK: Record<string, number> = { PENDING: 0, CONTACTED: 1, CONFIRMED: 2 };
const PAYMENT_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT"];

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("active,role")
    .eq("id", user.id)
    .single();
  if (!profile?.active) {
    return { supabase, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, role: profile.role, response: null };
}

// The invoice is linked back to the online order through its note. No schema
// change is needed because `sales.notes` already exists and is staff-readable.
function invoiceNote(orderReference: string, customerName: string, phone: string) {
  return `Online order ${orderReference} · ${customerName} · ${phone}`;
}

function invoiceReference(notes: string | null | undefined) {
  const parts = String(notes || "").split(" ");
  return parts[0] === "Online" && parts[1] === "order" ? parts[2] : null;
}

export async function POST(req: Request) {
  const limited = rateLimit(requestKey(req, "order"), 5);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);
  let body: any;
  try { body = await readJson(req, 48 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const name = String(body.customer_name || "").trim();
  const phone = String(body.phone || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (name.length < 2 || name.length > 120 || phone.length < 7 || phone.length > 30 || String(body.email || "").length > 254 || String(body.delivery_note || "").length > 1000 || !items.length || items.length > 30) {
    return NextResponse.json(
      { error: "Enter your name, valid phone number and at least one cart item." },
      { status: 400 }
    );
  }
  const lines = items.map((item: any) => ({
    product_id: String(item.product_id || ""),
    quantity: Number(item.quantity),
  }));
  if (
    lines.some(
      (line: any) =>
        !line.product_id || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100
    )
  ) {
    return NextResponse.json(
      { error: "Check product quantities and try again." },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("submit_customer_order", {
    p_customer_name: name,
    p_phone: phone,
    p_email: String(body.email || "").trim(),
    p_delivery_note: String(body.delivery_note || "").trim(),
    p_lines: lines,
  });
  if (error) return dbErrorResponse(400);
  return NextResponse.json({ order_reference: data }, { status: 201 });
}

export async function GET() {
  const s = await staff();
  if (s.response) return s.response;

  const { data: orders, error } = await s.supabase
    .from("customer_orders")
    .select(
      "id,order_reference,customer_name,phone,email,delivery_note,status,total,created_at,updated_at,customer_order_items(id,product_id,product_name,sku,quantity,unit_price,line_total)"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return dbErrorResponse(400);

  const rows: any[] = orders || [];
  const productIds = Array.from(
    new Set(
      rows
        .flatMap((order) => (order.customer_order_items || []).map((item: any) => item.product_id))
        .filter(Boolean)
    )
  );

  const [summaryRows, invoiceResult] = await Promise.all([
    productIds.length
      ? staffInventorySummary(s.supabase).then((rows) =>
          rows.filter((row) => productIds.includes(row.product_id)),
        )
      : Promise.resolve([]),
    s.supabase
      .from("sales")
      .select("id,invoice_number,payment_method,total,amount_paid,balance_due,notes,created_at")
      .like("notes", "Online order %")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const stockByProduct = new Map<string, number>(
    summaryRows.map((row) => [row.product_id, Number(row.available_stock || 0)])
  );
  const invoiceByReference = new Map<string, any>();
  for (const invoice of invoiceResult.data || []) {
    const reference = invoiceReference(invoice.notes);
    if (reference && !invoiceByReference.has(reference)) {
      const { notes, ...rest } = invoice;
      invoiceByReference.set(reference, rest);
    }
  }

  const enriched = rows.map((order) => {
    const items = (order.customer_order_items || []).map((item: any) => {
      const available = stockByProduct.get(item.product_id) ?? 0;
      return { ...item, available_stock: available, sufficient: available >= item.quantity };
    });
    const canFulfil =
      order.status === "CONFIRMED" && items.length > 0 && items.every((item: any) => item.sufficient);
    return {
      ...order,
      customer_order_items: items,
      can_fulfil: canFulfil,
      shortage_count: items.filter((item: any) => !item.sufficient).length,
      invoice: invoiceByReference.get(order.order_reference) || null,
    };
  });

  return NextResponse.json({ orders: enriched });
}

export async function PATCH(req: Request) {
  const s = await staff();
  if (s.response) return s.response;
  if (s.role !== "BOSS" && s.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "You are not authorized for order actions." }, { status: 403 });
  }

  let body: any;
  try { body = await readJson(req, 32 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !ORDER_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Choose a valid order and status." }, { status: 400 });
  }

  const { data: order, error: loadError } = await s.supabase
    .from("customer_orders")
    .select("id,order_reference,customer_name,phone,status,customer_order_items(product_id,product_name,quantity)")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return dbErrorResponse(503);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  if (order.status === status) {
    return NextResponse.json({ message: "No change needed.", status });
  }
  if (order.status === "FULFILLED") {
    return NextResponse.json(
      { error: "This order is already fulfilled. Stock has been issued; use a return instead of changing it." },
      { status: 409 }
    );
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "A cancelled order cannot be reopened. Ask the customer to submit a new order." },
      { status: 409 }
    );
  }

  if (status === "CANCELLED") {
    const { error } = await s.supabase
      .from("customer_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", order.status);
    if (error) return dbErrorResponse(400);
    return NextResponse.json({ message: "Order cancelled. No stock was issued.", status });
  }

  if (status === "FULFILLED") {
    return await fulfilOrder(s.supabase, order, body.payment_method);
  }

  if (!(RANK[status] > RANK[order.status])) {
    return NextResponse.json(
      { error: "Orders can only move forward: Pending → Contacted → Confirmed." },
      { status: 400 }
    );
  }

  const { error } = await s.supabase
    .from("customer_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", order.status);
  if (error) return dbErrorResponse(400);
  return NextResponse.json({
    message: status === "CONFIRMED" ? "Order confirmed. Fulfil it to create the invoice and issue stock." : "Order updated.",
    status,
  });
}

async function fulfilOrder(supabase: any, order: any, rawMethod: unknown) {
  if (order.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Confirm the order before issuing stock and creating the invoice." },
      { status: 400 }
    );
  }
  const paymentMethod = String(rawMethod || "CREDIT").toUpperCase();
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Choose a valid payment method." }, { status: 400 });
  }

  const items: any[] = order.customer_order_items || [];
  if (!items.length) {
    return NextResponse.json({ error: "This order has no items." }, { status: 400 });
  }

  // Claim the order atomically so two staff members cannot issue stock twice.
  const { data: claimed, error: claimError } = await supabase
    .from("customer_orders")
    .update({ status: "FULFILLED", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "CONFIRMED")
    .select("id")
    .maybeSingle();
  if (claimError) return dbErrorResponse(409);
  if (!claimed) {
    return NextResponse.json(
      { error: "This order was changed by someone else. Refresh and try again." },
      { status: 409 }
    );
  }

  async function releaseClaim() {
    await supabase
      .from("customer_orders")
      .update({ status: "CONFIRMED" })
      .eq("id", order.id)
      .eq("status", "FULFILLED");
  }

  const productIds = items.map((item) => item.product_id);
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id,name,selling_price,price_status")
    .in("id", productIds);
  if (productError) {
    await releaseClaim();
    return dbErrorResponse(503);
  }

  const productById = new Map<string, any>((products || []).map((product: any) => [product.id, product]));
  let total = 0;
  for (const item of items) {
    const product = productById.get(item.product_id);
    if (!product) {
      await releaseClaim();
      return NextResponse.json(
        { error: `A product in this order is no longer available (${item.product_name}).` },
        { status: 400 }
      );
    }
    if (product.price_status !== "CONFIRMED" || Number(product.selling_price) <= 0) {
      await releaseClaim();
      return NextResponse.json(
        { error: `Set a confirmed selling price for "${product.name}" before issuing this order.` },
        { status: 400 }
      );
    }
    total += Number(product.selling_price) * Number(item.quantity);
  }

  const amountPaid = paymentMethod === "CREDIT" ? 0 : total;
  const { data: saleId, error: saleError } = await supabase.rpc("create_pos_sale", {
    p_customer_id: null,
    p_items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
    p_payment_method: paymentMethod,
    p_amount_paid: amountPaid,
    p_discount: 0,
    p_notes: invoiceNote(order.order_reference, order.customer_name, order.phone),
  });
  if (saleError) {
    await releaseClaim();
    return dbErrorResponse(400);
  }

  const { data: sale } = await supabase
    .from("sales")
    .select("id,invoice_number,total,amount_paid,balance_due,payment_method,created_at")
    .eq("id", saleId)
    .single();

  return NextResponse.json({
    message: sale
      ? `Order fulfilled. Invoice ${sale.invoice_number} created and stock issued using FIFO.`
      : "Order fulfilled and stock issued using FIFO.",
    status: "FULFILLED",
    sale,
  });
}
