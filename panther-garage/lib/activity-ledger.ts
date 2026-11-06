import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Activity follow-up & transparency layer for Business Intelligence (BOSS only).
 * Every workflow on the platform is attributed to its actor (who did what, when,
 * at what value) and cross-checked against the ledger so numbers stay honest.
 */

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (iso: string) => iso.slice(0, 10);

export type ActivityItem = {
  ts: string;
  type: string;
  ref: string;
  actor: string;
  detail: string;
  amount: number | null;
};
export type StaffActivity = {
  id: string;
  name: string;
  role: string;
  sales_count: number;
  sales_revenue: number;
  repairs_received: number;
  receipts_units: number;
  receipts_value: number;
  purchases_ordered: number;
  invoices_recorded: number;
  supplier_payments: number;
  expenses_recorded: number;
  stock_adjustments: number;
  prices_confirmed: number;
  reports_filed: number;
};
export type Check = { key: string; label: string; status: "OK" | "WATCH" | "FLAG"; value: number; detail: string };
export type ReconciliationRow = {
  date: string;
  employee: string;
  reported_delta: number;
  actual_movement: number;
  variance: number;
};
export type LedgerResult = { ok: true; data: LedgerData } | { ok: false; error: string };
export type LedgerData = {
  stream: ActivityItem[];
  staff_activity: StaffActivity[];
  checks: Check[];
  shift_reconciliation: ReconciliationRow[];
};

export async function computeActivityLedger(supabase: SupabaseClient, days: number): Promise<LedgerResult> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [
    salesRes, itemsRes, jobsRes, batchesRes, movementsRes, poRes, invRes, payRes, expRes,
    ordersRes, bookingsRes, reportsRes, importsRes, pricedRes, profilesRes, stockRes,
  ] = await Promise.all([
    supabase.from("sales")
      .select("id,invoice_number,total,amount_paid,balance_due,payment_method,status,created_at,created_by")
      .gte("created_at", since).limit(5000),
    supabase.from("sale_items")
      .select("sale_id,line_total,sales!inner(created_at)")
      .gte("sales.created_at", since).limit(8000),
    supabase.from("repair_jobs")
      .select("id,job_number,status,labour_fee,parts_total,total_cost,received_at,collected_at,assigned_to,received_by")
      .gte("received_at", since).limit(3000),
    supabase.from("inventory_batches")
      .select("id,quantity_received,unit_cost,received_at,receipt_reference,received_by")
      .gte("received_at", since).limit(3000),
    // The full FIFO ledger for the window: powers adjustments stream + shift reconciliation.
    supabase.from("stock_movements")
      .select("product_id,movement_type,quantity_delta,reason,created_at,created_by")
      .gte("created_at", since).limit(10000),
    supabase.from("purchase_orders")
      .select("order_number,status,subtotal,order_date,created_at,created_by")
      .gte("created_at", since).limit(1000),
    supabase.from("supplier_invoices")
      .select("invoice_number,amount,paid_amount,status,due_date,created_at,recorded_by")
      .gte("created_at", since).limit(1000),
    supabase.from("supplier_payments")
      .select("amount,method,paid_at,recorded_by")
      .gte("paid_at", since).limit(1000),
    supabase.from("garage_expenses")
      .select("category,description,amount,expense_date,status,recorded_by,created_at")
      .gte("created_at", since).limit(1000),
    supabase.from("customer_orders")
      .select("order_reference,customer_name,status,total,created_at")
      .gte("created_at", since).limit(1000),
    supabase.from("service_bookings")
      .select("booking_reference,customer_name,status,motorcycle_make,created_at")
      .gte("created_at", since).limit(1000),
    supabase.from("inventory_imports")
      .select("reference,primary_file,status,created_at,approved_at,created_by,approved_by")
      .gte("created_at", since).limit(100),
    supabase.from("products")
      .select("id,name,active,price_confirmed_at,price_confirmed_by")
      .gte("price_confirmed_at", since).limit(2000),
    supabase.from("profiles").select("id,full_name,role,active").limit(100),
    supabase.from("inventory_summary").select("product_id,physical_stock,available_stock").limit(3000),
    // Soft dependency: works once migration 011 is applied; missing table never breaks the ledger.
    supabase.from("shift_reports")
      .select("employee_id,employee_name,report_date,opening_stock,closing_stock,challenges")
      .gte("report_date", since.slice(0, 10)).order("report_date", { ascending: false }).limit(400),
  ]);

  const core = [salesRes, itemsRes, jobsRes, batchesRes, movementsRes, poRes, invRes, payRes, expRes, ordersRes, bookingsRes, importsRes, pricedRes, profilesRes, stockRes];
  const failed = core.find((x) => x.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  const sales = (salesRes.data || []) as any[];
  const completed = sales.filter((s) => s.status === "COMPLETED");
  const items = (itemsRes.data || []) as any[];
  const jobs = (jobsRes.data || []) as any[];
  const batches = (batchesRes.data || []) as any[];
  const movements = (movementsRes.data || []) as any[];
  const pos = (poRes.data || []) as any[];
  const invoices = (invRes.data || []) as any[];
  const payments = (payRes.data || []) as any[];
  const expenses = (expRes.data || []) as any[];
  const orders = (ordersRes.data || []) as any[];
  const bookings = (bookingsRes.data || []) as any[];
  const imports = (importsRes.data || []) as any[];
  const priced = (pricedRes.data || []) as any[];
  const profiles = (profilesRes.data || []) as any[];
  const stock = (stockRes.data || []) as any[];
  const reports = ((reportsRes.data || []) as any[]); // [] when migration 011 not applied yet

  const nameOf = (id: string | null | undefined) =>
    profiles.find((p: any) => p.id === id)?.full_name || (id ? "Former staff" : "System/customer");

  /* ---------- per-actor accountability rollup ---------- */
  type Acc = StaffActivity & Record<string, any>;
  const staff = new Map<string, Acc>();
  const touch = (id: string | null | undefined, role = "EMPLOYEE") => {
    if (!id) return null;
    const key = id;
    if (!staff.has(key)) {
      const p = profiles.find((x: any) => x.id === id);
      staff.set(key, {
        id, name: p?.full_name || "Former staff", role: p?.role || role,
        sales_count: 0, sales_revenue: 0, repairs_received: 0, receipts_units: 0, receipts_value: 0,
        purchases_ordered: 0, invoices_recorded: 0, supplier_payments: 0, expenses_recorded: 0,
        stock_adjustments: 0, prices_confirmed: 0, reports_filed: 0,
      });
    }
    return staff.get(key)!;
  };
  for (const s of completed) { const r = touch(s.created_by); if (r) { r.sales_count += 1; r.sales_revenue += num(s.total); } }
  for (const j of jobs) { const r = touch(j.received_by); if (r) r.repairs_received += 1; }
  for (const b of batches) { const r = touch(b.received_by); if (r) { r.receipts_units += num(b.quantity_received); r.receipts_value += num(b.quantity_received) * num(b.unit_cost); } }
  for (const p of pos) { const r = touch(p.created_by); if (r) r.purchases_ordered += 1; }
  for (const i of invoices) { const r = touch(i.recorded_by); if (r) r.invoices_recorded += 1; }
  for (const p of payments) { const r = touch(p.recorded_by); if (r) r.supplier_payments += 1; }
  for (const e of expenses) { const r = touch(e.recorded_by); if (r) r.expenses_recorded += 1; }
  for (const p of priced) { const r = touch(p.price_confirmed_by, "BOSS"); if (r) r.prices_confirmed += 1; }
  for (const rep of reports) { const r = touch(rep.employee_id); if (r) r.reports_filed += 1; }
  const ADJUST_TYPES = new Set(["DAMAGE", "LOSS", "ADJUSTMENT", "WRITE_OFF", "SUPPLIER_RETURN", "CUSTOMER_RETURN"]);
  for (const m of movements) { if (ADJUST_TYPES.has(m.movement_type)) { const r = touch(m.created_by); if (r) r.stock_adjustments += 1; } }

  /* ---------- unified activity stream ---------- */
  const stream: ActivityItem[] = [];
  const push = (ts: string | null, type: string, ref: string, actor: string, detail: string, amount: number | null) => {
    if (ts) stream.push({ ts, type, ref, actor, detail, amount: amount === null ? null : round2(amount) });
  };
  for (const s of sales)
    push(s.created_at, "SALE", s.invoice_number, nameOf(s.created_by),
      `${s.status}${s.payment_method ? ` · ${s.payment_method.toLowerCase().replace("_", " ")}` : ""}${num(s.balance_due) > 0 ? ` · balance ${Math.round(num(s.balance_due))}` : ""}`,
      num(s.total));
  for (const j of jobs)
    push(j.received_at, "REPAIR", j.job_number, nameOf(j.received_by),
      `${j.status.toLowerCase()}${j.assigned_to ? ` · assigned ${nameOf(j.assigned_to)}` : ""}${j.collected_at ? " · collected" : ""}`,
      num(j.total_cost));
  for (const b of batches)
    push(b.received_at, "RECEIPT", b.receipt_reference || "batch", nameOf(b.received_by),
      `${num(b.quantity_received)} units @ ${Math.round(num(b.unit_cost))}`,
      num(b.quantity_received) * num(b.unit_cost));
  for (const m of movements)
    if (ADJUST_TYPES.has(m.movement_type))
      push(m.created_at, m.movement_type, m.reason || "stock", nameOf(m.created_by), `${num(m.quantity_delta)} units`, null);
  for (const p of pos)
    push(p.created_at, "PURCHASE", p.order_number, nameOf(p.created_by), p.status.toLowerCase(), num(p.subtotal));
  for (const i of invoices)
    push(i.created_at, "SUPPLIER_INVOICE", i.invoice_number, nameOf(i.recorded_by),
      `${i.status.toLowerCase()}${i.due_date ? ` · due ${i.due_date}` : ""}`, num(i.amount));
  for (const p of payments)
    push(p.paid_at, "SUPPLIER_PAYMENT", p.method.toLowerCase(), nameOf(p.recorded_by), "", num(p.amount));
  for (const e of expenses)
    push(e.created_at, "EXPENSE", e.category, nameOf(e.recorded_by), `${e.status.toLowerCase()} · ${(e.description || "").slice(0, 60)}`, num(e.amount));
  for (const o of orders)
    push(o.created_at, "WEB_ORDER", o.order_reference, o.customer_name, o.status.toLowerCase(), num(o.total));
  for (const b of bookings)
    push(b.created_at, "BOOKING", b.booking_reference, b.customer_name, `${b.status.toLowerCase()} · ${b.motorcycle_make}`, null);
  for (const im of imports)
    push(im.created_at, "IMPORT", im.primary_file || im.reference || "import", nameOf(im.created_by),
      `${im.status.toLowerCase()}${im.approved_at ? ` by ${nameOf(im.approved_by)}` : ""}`, null);
  for (const p of priced)
    push(p.price_confirmed_at, "PRICE_CONFIRM", p.name, nameOf(p.price_confirmed_by), "price published", null);
  for (const r of reports)
    push(`${r.report_date}T12:00:00Z`, "SHIFT_REPORT", r.report_date, r.employee_name,
      `opening ${r.opening_stock} → closing ${r.closing_stock}${r.challenges ? ` · challenge noted` : ""}`, null);
  stream.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  /* ---------- transparency checks (accuracy of the numbers BI shows) ---------- */
  const checks: Check[] = [];

  // 1. Invoice totals must equal their line items.
  const linesBySale = new Map<string, number>();
  for (const it of items) linesBySale.set(it.sale_id, (linesBySale.get(it.sale_id) || 0) + num(it.line_total));
  let invoiceMismatches = 0;
  for (const s of completed) {
    const lines = linesBySale.get(s.id);
    if (lines !== undefined && Math.abs(lines - num(s.total)) > 1) invoiceMismatches += 1;
  }
  checks.push({
    key: "invoice_vs_items", label: "Invoice totals match line items",
    status: invoiceMismatches === 0 ? "OK" : "FLAG",
    value: invoiceMismatches,
    detail: invoiceMismatches === 0
      ? `All ${completed.length} invoices in the window reconcile with their sale lines.`
      : `${invoiceMismatches} invoice(s) differ from their line-item sums by more than 1 RWF — review before trusting revenue figures.`,
  });

  // 2. Credit exposure.
  const credit = completed.reduce((a, s) => a + num(s.balance_due), 0);
  const creditCount = completed.filter((s) => num(s.balance_due) > 0).length;
  const revenue = completed.reduce((a, s) => a + num(s.total), 0);
  checks.push({
    key: "credit_outstanding", label: "Customer credit outstanding",
    status: credit === 0 ? "OK" : credit > revenue * 0.15 ? "FLAG" : "WATCH",
    value: round2(credit),
    detail: credit === 0 ? "No unpaid balances." : `${creditCount} invoice(s) carry unpaid balances (${Math.round((credit / Math.max(1, revenue + credit)) * 100)}% of expected revenue).`,
  });

  // 3. Supplier payables.
  const payables = invoices.reduce((a, i) => a + Math.max(0, num(i.amount) - num(i.paid_amount)), 0);
  checks.push({
    key: "supplier_payables", label: "Supplier invoices not fully paid",
    status: payables === 0 ? "OK" : "WATCH",
    value: round2(payables),
    detail: payables === 0 ? "All recorded supplier invoices are settled." : `${invoices.filter((i) => i.status !== "PAID").length} invoice(s) still owed in window — cash-plan accordingly.`,
  });

  // 4. Workshop work in progress.
  const ready = jobs.filter((j) => j.status === "READY");
  const inWork = jobs.filter((j) => ["RECEIVED", "DIAGNOSIS", "WAITING_PARTS", "IN_PROGRESS"].includes(j.status));
  checks.push({
    key: "repairs_wip", label: "Repairs ready for collection / still in workshop",
    status: ready.length > 5 || inWork.length > 10 ? "WATCH" : "OK",
    value: ready.length + inWork.length,
    detail: `${ready.length} READY uncollected (worth ${Math.round(ready.reduce((a, j) => a + num(j.total_cost), 0))} RWF), ${inWork.length} in progress.`,
  });

  // 5. Ledger integrity: nobody should be able to push stock negative.
  const negatives = stock.filter((s: any) => num(s.physical_stock) < 0 || num(s.available_stock) < 0);
  checks.push({
    key: "negative_stock", label: "Stock levels non-negative everywhere",
    status: negatives.length === 0 ? "OK" : "FLAG",
    value: negatives.length,
    detail: negatives.length === 0 ? "FIFO ledger is consistent across all products." : `${negatives.length} product(s) show negative stock — a movement bypassed the RPC checks.`,
  });

  // 6. Catalogue trust: active products without a BOSS-confirmed price.
  const { data: activeProducts, error: activeErr } = await supabase
    .from("products").select("id,active,price_confirmed_at").eq("active", true).limit(3000);
  if (!activeErr) {
    const unconfirmed = (activeProducts || []).filter((p: any) => !p.price_confirmed_at).length;
    checks.push({
      key: "price_confidence", label: "Active parts with BOSS-confirmed prices",
      status: unconfirmed === 0 ? "OK" : "WATCH",
      value: unconfirmed,
      detail: unconfirmed === 0 ? "Every active part has a confirmed price." : `${unconfirmed} active product(s) still await price confirmation in Catalogue review.`,
    });
  }

  // 7. Approvals backlog.
  const pendingExpenses = expenses.filter((e) => e.status === "PENDING").length;
  const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
  const pendingBookings = bookings.filter((b) => b.status === "PENDING").length;
  const openImports = imports.filter((i) => i.status !== "APPROVED").length;
  checks.push({
    key: "approval_backlog", label: "Waiting for follow-up (expenses/orders/bookings/imports)",
    status: pendingExpenses + pendingOrders + pendingBookings + openImports > 10 ? "WATCH" : "OK",
    value: pendingExpenses + pendingOrders + pendingBookings + openImports,
    detail: `${pendingExpenses} expenses · ${pendingOrders} web orders · ${pendingBookings} bookings · ${openImports} imports.`,
  });

  // 8. Accountability: employees who filed no shift report in the window.
  const activeEmployees = profiles.filter((p: any) => p.active && p.role === "EMPLOYEE");
  if (activeEmployees.length) {
    const filers = new Set(reports.map((r: any) => r.employee_id));
    const silent = activeEmployees.filter((p: any) => !filers.has(p.id));
    checks.push({
      key: "report_coverage", label: "Employees filing shift reports",
      status: silent.length === 0 ? "OK" : "WATCH",
      value: reports.length,
      detail: silent.length === 0
        ? `All ${activeEmployees.length} employee(s) filed reports (${reports.length} total).`
        : `${silent.length} of ${activeEmployees.length} employee(s) filed nothing in ${days} days: ${silent.map((p: any) => p.full_name).slice(0, 6).join(", ")}.`,
    });
  }

  /* ---------- shift reports vs physical ledger reconciliation ---------- */
  const movementByDay = new Map<string, number>();
  for (const m of movements) {
    const k = dayKey(m.created_at);
    movementByDay.set(k, (movementByDay.get(k) || 0) + num(m.quantity_delta));
  }
  const shift_reconciliation: ReconciliationRow[] = [];
  for (const r of reports) {
    const date = String(r.report_date).slice(0, 10);
    const reported = num(r.closing_stock) - num(r.opening_stock);
    const actual = movementByDay.get(date) || 0;
    const variance = actual - reported;
    if (variance !== 0)
      shift_reconciliation.push({ date, employee: r.employee_name, reported_delta: reported, actual_movement: actual, variance });
  }
  shift_reconciliation.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const staff_activity = [...staff.values()]
    .map((r) => ({ ...r, sales_revenue: round2(r.sales_revenue), receipts_value: round2(r.receipts_value) }))
    .sort((a, b) => b.sales_revenue + b.repairs_received * 1000 - (a.sales_revenue + a.repairs_received * 1000));

  return { ok: true, data: { stream: stream.slice(0, 60), staff_activity, checks, shift_reconciliation: shift_reconciliation.slice(0, 12) } };
}
