import type { SupabaseClient } from "@supabase/supabase-js";

type DbRow = Record<string, any>;
type CsvEvent = {
  eventAt: string;
  eventType: string;
  reference?: unknown;
  status?: unknown;
  actor?: unknown;
  counterparty?: unknown;
  description?: unknown;
  sku?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
  paid?: unknown;
  balance?: unknown;
  paymentMethod?: unknown;
  recordId?: unknown;
  details?: unknown;
};
export type ReportWindow = {
  label: string;
  filename: string;
  start: string | null;
  end: string | null;
  startDate: string | null;
  endDate: string | null;
};

const PAGE_SIZE = 500;
const MAX_ROWS_PER_SOURCE = 50_000;
const MAX_EVENT_ROWS = 100_000;

export function reportWindowFromParams(params: URLSearchParams): ReportWindow | null {
  const month = params.get("month");
  const allHistory = params.get("period") === "all";
  if (params.has("period") && !allHistory) return null;
  if (params.has("month") && allHistory) return null;

  if (allHistory && !month) {
    return {
      label: "All recorded history",
      filename: "panther-legacy-garage-all-history-report.csv",
      start: null,
      end: null,
      startDate: null,
      endDate: null,
    };
  }
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;

  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2000 || year > 2100) return null;
  const startDate = `${month}-01`;
  const startTime = Date.UTC(year, monthNumber - 1, 1);
  const endTime = Date.UTC(year, monthNumber, 1);
  const currentMonthTime = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  if (startTime > currentMonthTime) return null;

  const monthName = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" })
    .format(new Date(startTime));
  const endDate = new Date(endTime).toISOString().slice(0, 10);
  return {
    label: `${monthName} ${year}`,
    filename: `panther-legacy-garage-${monthName.toLowerCase()}-${year}-report.csv`,
    start: new Date(startTime).toISOString(),
    end: new Date(endTime).toISOString(),
    startDate,
    endDate,
  };
}

async function readPages<T>(buildPage: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("REPORT_EXPORT_QUERY_FAILED");
    const page = (data || []) as T[];
    if (rows.length + page.length > MAX_ROWS_PER_SOURCE) throw new Error("REPORT_EXPORT_TOO_LARGE");
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readTable(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  dateField: string,
  orderField: string,
  window: ReportWindow,
  filter?: (query: any) => any,
) {
  return readPages<DbRow>((from, to) => {
    let query: any = supabase.from(table).select(columns);
    if (window.start && window.end) {
      const fromValue = dateField === "report_date" ? window.startDate! : window.start;
      const toValue = dateField === "report_date" ? window.endDate! : window.end;
      query = query.gte(dateField, fromValue).lt(dateField, toValue);
    }
    if (filter) query = filter(query);
    return query.order(orderField, { ascending: true }).order("id", { ascending: true }).range(from, to);
  });
}

async function readRowsByIds(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  foreignKey: string,
  ids: Array<string | null | undefined>,
) {
  const values = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const result: DbRow[] = [];
  for (let index = 0; index < values.length; index += 150) {
    const chunk = values.slice(index, index + 150);
    result.push(...await readPages<DbRow>((from, to) =>
      supabase.from(table).select(columns).in(foreignKey, chunk).order("id", { ascending: true }).range(from, to),
    ));
    if (result.length > MAX_ROWS_PER_SOURCE) throw new Error("REPORT_EXPORT_TOO_LARGE");
  }
  return result;
}

const numberOrNull = (value: unknown) => value === null || value === undefined || value === "" ? null : value;
const text = (value: unknown) => value === null || value === undefined ? "" : String(value);
const json = (value: unknown) => value === null || value === undefined ? "" : JSON.stringify(value);
const isoDay = (value: string) => value.length === 10 ? `${value}T12:00:00.000Z` : value;

const CSV_COLUMNS = [
  "Report period",
  "Generated (UTC)",
  "Event time (UTC)",
  "Event type",
  "Reference",
  "Status",
  "Actor",
  "Customer / supplier",
  "Description",
  "Product SKU",
  "Quantity",
  "Unit price (RWF)",
  "Amount (RWF)",
  "Paid (RWF)",
  "Balance (RWF)",
  "Payment method",
  "Record ID",
  "Details (JSON)",
] as const;

function csvCell(value: unknown) {
  let raw: string;
  if (value === null || value === undefined) raw = "";
  else if (typeof value === "string") raw = value;
  else if (typeof value === "number") raw = Number.isFinite(value) ? String(value) : "";
  else if (typeof value === "bigint") raw = value.toString();
  else if (typeof value === "boolean") raw = String(value);
  else raw = JSON.stringify(value);

  // Prefix dangerous untrusted text so Excel/LibreOffice won't interpret it as a formula.
  if (typeof value === "string" && /^[\u0000-\u0020]*[=+\-@]/.test(raw)) raw = `'${raw}`;
  return `"${raw.replaceAll('"', '""')}"`;
}

export function serializeReportCsv(events: CsvEvent[], window: ReportWindow, generatedAt: string) {
  const ordered = [...events].sort((a, b) =>
    a.eventAt.localeCompare(b.eventAt) || a.eventType.localeCompare(b.eventType) || text(a.reference).localeCompare(text(b.reference)),
  );
  if (ordered.length > MAX_EVENT_ROWS) throw new Error("REPORT_EXPORT_TOO_LARGE");

  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const event of ordered) {
    const row = [
      window.label,
      generatedAt,
      event.eventAt,
      event.eventType,
      event.reference,
      event.status,
      event.actor,
      event.counterparty,
      event.description,
      event.sku,
      numberOrNull(event.quantity),
      numberOrNull(event.unitPrice),
      numberOrNull(event.amount),
      numberOrNull(event.paid),
      numberOrNull(event.balance),
      event.paymentMethod,
      event.recordId,
      typeof event.details === "string" ? event.details : json(event.details),
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildReportCsv(
  supabase: SupabaseClient,
  window: ReportWindow,
  generatedAt = new Date().toISOString(),
) {
  const [
    sales, repairs, repairHistory, movements, orders, invoices, payments, expenses,
    webOrders, bookings, imports, importItems, importConflicts, shifts, audit, notifications,
    customers, suppliers,
  ] = await Promise.all([
    readTable(supabase, "sales", "id,invoice_number,customer_id,status,payment_method,subtotal,discount,total,amount_paid,balance_due,notes,sold_by,created_at", "created_at", "created_at", window),
    readTable(supabase, "repair_jobs", "id,job_number,customer_id,motorcycle_make,motorcycle_model,registration_number,reported_issue,diagnosis,status,labour_fee,parts_total,total_cost,received_by,received_at,completed_at,collected_at", "received_at", "received_at", window),
    readTable(supabase, "repair_status_history", "id,repair_job_id,old_status,new_status,changed_by,note,created_at", "created_at", "created_at", window),
    readTable(supabase, "stock_movements", "id,product_id,batch_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_by,created_at", "created_at", "created_at", window),
    readTable(supabase, "purchase_orders", "id,order_number,supplier_id,status,order_date,expected_date,notes,subtotal,created_by,created_at,updated_at", "created_at", "created_at", window),
    readTable(supabase, "supplier_invoices", "id,supplier_id,purchase_order_id,invoice_number,invoice_date,due_date,amount,paid_amount,status,recorded_by,created_at", "created_at", "created_at", window),
    readTable(supabase, "supplier_payments", "id,supplier_invoice_id,amount,method,reference,paid_at,recorded_by", "paid_at", "paid_at", window),
    readTable(supabase, "garage_expenses", "id,category,description,amount,expense_date,payment_method,reference,status,recorded_by,approved_by,approved_at,created_at", "created_at", "created_at", window),
    readTable(supabase, "customer_orders", "id,order_reference,customer_name,status,total,delivery_note,created_at,updated_at", "created_at", "created_at", window),
    readTable(supabase, "service_bookings", "id,booking_reference,customer_name,motorcycle_make,motorcycle_model,reported_issue,preferred_date,status,staff_note,created_at,updated_at", "created_at", "created_at", window),
    readTable(supabase, "inventory_imports", "id,reference,status,primary_file,created_by,approved_by,approved_at,applied_at,created_at,updated_at", "created_at", "created_at", window),
    readTable(supabase, "inventory_import_items", "id,import_id,source_file,source_sheet,source_row,source_role,original_name,original_reference,quantity,unit_cost,suggested_sell,decision,review_status,matched_product_id,compatibility,category,proposed_sku,approved_selling_price,approved_category,approved_compatibility,applied,applied_batch_id,applied_movement_id,notes,errors,created_at,updated_at", "created_at", "created_at", window),
    readTable(supabase, "inventory_import_conflicts", "id,import_id,item_id,conflict_type,severity,detail,source_file,source_row,comparison_file,comparison_row,resolved,resolution,created_at", "created_at", "created_at", window),
    readTable(supabase, "shift_reports", "id,employee_id,employee_name,report_date,opening_stock,closing_stock,comments,recommendations,challenges,solution,created_at,updated_at", "report_date", "report_date", window),
    readTable(supabase, "audit_logs", "id,actor_id,action,entity_type,entity_id,before_data,after_data,created_at", "created_at", "created_at", window),
    readTable(supabase, "notifications", "id,recipient_id,title,message,category,entity_type,entity_id,created_at", "created_at", "created_at", window, (query) => query.neq("category", "MESSAGE")),
    readTable(supabase, "customers", "id,full_name,created_by,created_at", "created_at", "created_at", window),
    readTable(supabase, "suppliers", "id,name,created_at", "created_at", "created_at", window),
  ]);

  const sourceRows = [sales, repairs, repairHistory, movements, orders, invoices, payments, expenses,
    webOrders, bookings, imports, importItems, importConflicts, shifts, audit, notifications, customers, suppliers];
  if (sourceRows.reduce((sum, rows) => sum + rows.length, 0) > MAX_EVENT_ROWS) {
    throw new Error("REPORT_EXPORT_TOO_LARGE");
  }

  const [saleItems, repairParts, orderItems, webOrderItems, batchRows, movementProducts, actors] = await Promise.all([
    readRowsByIds(supabase, "sale_items", "id,sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total", "sale_id", sales.map((row) => row.id)),
    readRowsByIds(supabase, "repair_parts", "id,repair_job_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total", "repair_job_id", repairs.map((row) => row.id)),
    readRowsByIds(supabase, "purchase_order_items", "id,purchase_order_id,product_name,sku,quantity_ordered,quantity_received,unit_cost,line_total", "purchase_order_id", orders.map((row) => row.id)),
    readRowsByIds(supabase, "customer_order_items", "id,order_id,product_name,sku,quantity,unit_price,line_total", "order_id", webOrders.map((row) => row.id)),
    readRowsByIds(supabase, "inventory_batches", "id,unit_cost,supplier_id,receipt_reference", "id", movements.map((row) => row.batch_id)),
    readRowsByIds(supabase, "products", "id,name,sku", "id", movements.map((row) => row.product_id)),
    readPages<DbRow>((from, to) => supabase.from("profiles").select("id,full_name,role").order("id", { ascending: true }).range(from, to)),
  ]);
  if (saleItems.length + repairParts.length + orderItems.length + webOrderItems.length + batchRows.length
    + movementProducts.length + actors.length > MAX_EVENT_ROWS) {
    throw new Error("REPORT_EXPORT_TOO_LARGE");
  }

  const jobsById = new Map(repairs.map((row) => [row.id, row]));
  const missingJobIds = repairHistory.map((row) => row.repair_job_id).filter((id) => !jobsById.has(id));
  const relatedHistoryJobs = await readRowsByIds(supabase, "repair_jobs", "id,job_number,customer_id", "id", missingJobIds);
  for (const row of relatedHistoryJobs) jobsById.set(row.id, row);

  const importsById = new Map(imports.map((row) => [row.id, row]));
  const invoicesById = new Map(invoices.map((row) => [row.id, row]));
  const customerIds = [
    ...sales.map((row) => row.customer_id),
    ...repairs.map((row) => row.customer_id),
  ];
  const supplierIds = [...orders.map((row) => row.supplier_id), ...invoices.map((row) => row.supplier_id)];
  const [customerRows, supplierRows] = await Promise.all([
    readRowsByIds(supabase, "customers", "id,full_name", "id", customerIds),
    readRowsByIds(supabase, "suppliers", "id,name", "id", supplierIds),
  ]);
  const profiles = new Map(actors.map((row) => [row.id, row.full_name || row.role || "Staff member"]));
  const customerNames = new Map(customerRows.map((row) => [row.id, row.full_name]));
  const supplierNames = new Map(supplierRows.map((row) => [row.id, row.name]));
  const batchById = new Map(batchRows.map((row) => [row.id, row]));
  const productById = new Map(movementProducts.map((row) => [row.id, row]));
  const saleLines = new Map<string, DbRow[]>();
  const repairLines = new Map<string, DbRow[]>();
  const purchaseLines = new Map<string, DbRow[]>();
  const webOrderLines = new Map<string, DbRow[]>();
  const groupLines = (map: Map<string, DbRow[]>, rows: DbRow[], key: string) => {
    for (const row of rows) map.set(row[key], [...(map.get(row[key]) || []), row]);
  };
  groupLines(saleLines, saleItems, "sale_id");
  groupLines(repairLines, repairParts, "repair_job_id");
  groupLines(purchaseLines, orderItems, "purchase_order_id");
  groupLines(webOrderLines, webOrderItems, "order_id");

  const events: CsvEvent[] = [];
  for (const row of sales) events.push({
    eventAt: row.created_at, eventType: "SALE", reference: row.invoice_number, status: row.status,
    actor: profiles.get(row.sold_by) || "Staff member", counterparty: customerNames.get(row.customer_id) || "Walk-in customer",
    description: row.notes || "Sales invoice", amount: row.total, paid: row.amount_paid, balance: row.balance_due,
    paymentMethod: row.payment_method, recordId: row.id,
    details: { subtotal_rwf: row.subtotal, discount_rwf: row.discount, items: saleLines.get(row.id) || [] },
  });

  for (const row of repairs) events.push({
    eventAt: row.received_at, eventType: "REPAIR_RECEIVED", reference: row.job_number, status: row.status,
    actor: profiles.get(row.received_by) || "Staff member", counterparty: customerNames.get(row.customer_id) || "",
    description: `${row.motorcycle_make || ""} ${row.motorcycle_model || ""} · ${row.reported_issue || ""}`.trim(),
    amount: row.total_cost, recordId: row.id,
    details: { diagnosis: row.diagnosis, labour_fee_rwf: row.labour_fee, parts_total_rwf: row.parts_total,
      completed_at: row.completed_at, collected_at: row.collected_at, items: repairLines.get(row.id) || [] },
  });
  for (const row of repairHistory) {
    const job = jobsById.get(row.repair_job_id);
    events.push({
      eventAt: row.created_at, eventType: "REPAIR_STATUS", reference: job?.job_number || row.repair_job_id,
      status: row.new_status, actor: profiles.get(row.changed_by) || "Staff member",
      description: `${row.old_status || "NEW"} → ${row.new_status}${row.note ? ` · ${row.note}` : ""}`,
      recordId: row.id, details: { repair_job_id: row.repair_job_id },
    });
  }

  for (const row of movements) {
    const product = productById.get(row.product_id);
    const batch = batchById.get(row.batch_id);
    events.push({
      eventAt: row.created_at, eventType: `STOCK_${row.movement_type}`, reference: row.reference_id || row.id,
      actor: profiles.get(row.created_by) || "Staff member", counterparty: supplierNames.get(batch?.supplier_id) || "",
      description: `${product?.name || "Product"}${row.reason ? ` · ${row.reason}` : ""}`,
      sku: product?.sku || "", quantity: row.quantity_delta, recordId: row.id,
      details: { reference_type: row.reference_type, batch_id: row.batch_id, receipt_reference: batch?.receipt_reference || null,
        unit_cost_rwf: batch?.unit_cost ?? null },
    });
  }

  for (const row of orders) events.push({
    eventAt: row.created_at, eventType: "PURCHASE_ORDER", reference: row.order_number, status: row.status,
    actor: profiles.get(row.created_by) || "Staff member", counterparty: supplierNames.get(row.supplier_id) || "",
    description: row.notes || `Order date ${row.order_date || ""}`, amount: row.subtotal, recordId: row.id,
    details: { created_at: row.created_at, expected_date: row.expected_date, items: purchaseLines.get(row.id) || [] },
  });
  for (const row of invoices) events.push({
    eventAt: row.created_at, eventType: "SUPPLIER_INVOICE", reference: row.invoice_number, status: row.status,
    actor: profiles.get(row.recorded_by) || "Staff member", counterparty: supplierNames.get(row.supplier_id) || "",
    description: `Invoice date ${row.invoice_date || ""}${row.due_date ? ` · due ${row.due_date}` : ""}`,
    amount: row.amount, paid: row.paid_amount, balance: Math.max(0, Number(row.amount) - Number(row.paid_amount)),
    recordId: row.id, details: { purchase_order_id: row.purchase_order_id },
  });
  for (const row of payments) {
    const invoice = invoicesById.get(row.supplier_invoice_id);
    events.push({
      eventAt: row.paid_at, eventType: "SUPPLIER_PAYMENT", reference: row.reference || row.id,
      actor: profiles.get(row.recorded_by) || "Staff member", counterparty: invoice ? supplierNames.get(invoice.supplier_id) || "" : "",
      description: invoice ? `Payment for invoice ${invoice.invoice_number}` : "Supplier invoice payment",
      amount: row.amount, paid: row.amount, paymentMethod: row.method, recordId: row.id,
      details: { supplier_invoice_id: row.supplier_invoice_id },
    });
  }
  for (const row of expenses) events.push({
    eventAt: row.created_at, eventType: "EXPENSE", reference: row.reference || row.id, status: row.status,
    actor: profiles.get(row.recorded_by) || "Staff member", description: `${row.category}: ${row.description} · expense date ${row.expense_date}`,
    amount: row.amount, paid: row.status === "APPROVED" ? row.amount : null, paymentMethod: row.payment_method, recordId: row.id,
    details: { approved_by: profiles.get(row.approved_by) || null, approved_at: row.approved_at },
  });

  for (const row of webOrders) events.push({
    eventAt: row.created_at, eventType: "CUSTOMER_ORDER", reference: row.order_reference, status: row.status,
    counterparty: row.customer_name, description: row.delivery_note || "Customer spare-parts order request",
    amount: row.total, recordId: row.id, details: { created_at: row.created_at, items: webOrderLines.get(row.id) || [] },
  });
  for (const row of bookings) events.push({
    eventAt: row.created_at, eventType: "SERVICE_BOOKING", reference: row.booking_reference, status: row.status,
    counterparty: row.customer_name, description: `${row.motorcycle_make || ""} ${row.motorcycle_model || ""} · ${row.reported_issue || ""}`.trim(),
    recordId: row.id, details: { created_at: row.created_at, preferred_date: row.preferred_date, staff_note: row.staff_note },
  });

  for (const row of imports) events.push({
    eventAt: row.created_at, eventType: "INVENTORY_IMPORT", reference: row.reference, status: row.status,
    actor: profiles.get(row.created_by) || "Staff member", description: row.primary_file,
    recordId: row.id, details: { created_at: row.created_at, approved_by: profiles.get(row.approved_by) || null,
      approved_at: row.approved_at, applied_at: row.applied_at },
  });
  for (const row of importItems) events.push({
    eventAt: row.created_at, eventType: "INVENTORY_IMPORT_ITEM", reference: `${row.source_file}:${row.source_row}`,
    status: row.review_status, description: row.original_name, sku: row.proposed_sku || "", quantity: row.quantity,
    unitPrice: row.unit_cost, amount: row.unit_cost !== null && row.quantity !== null ? Number(row.unit_cost) * Number(row.quantity) : null,
    recordId: row.id, details: { import_id: row.import_id, source_sheet: row.source_sheet, source_role: row.source_role,
      original_reference: row.original_reference, suggested_sell_rwf: row.suggested_sell,
      approved_selling_price_rwf: row.approved_selling_price, compatibility: row.compatibility, category: row.category,
      approved_category: row.approved_category, approved_compatibility: row.approved_compatibility,
      decision: row.decision, matched_product_id: row.matched_product_id, applied: row.applied,
      applied_batch_id: row.applied_batch_id, applied_movement_id: row.applied_movement_id, notes: row.notes, errors: row.errors },
  });
  for (const row of importConflicts) {
    const parent = importsById.get(row.import_id);
    events.push({
      eventAt: row.created_at, eventType: "INVENTORY_IMPORT_CONFLICT", reference: parent?.reference || row.import_id,
      status: row.resolved ? "RESOLVED" : row.severity, description: row.detail, recordId: row.id,
      details: { conflict_type: row.conflict_type, source_file: row.source_file, source_row: row.source_row,
        comparison_file: row.comparison_file, comparison_row: row.comparison_row, resolution: row.resolution },
    });
  }

  for (const row of shifts) events.push({
    eventAt: isoDay(row.report_date), eventType: "SHIFT_REPORT", reference: row.report_date,
    actor: row.employee_name || profiles.get(row.employee_id) || "Staff member",
    description: `Opening stock ${row.opening_stock} → closing stock ${row.closing_stock}`,
    recordId: row.id, details: { comments: row.comments, recommendations: row.recommendations, challenges: row.challenges, solution: row.solution },
  });
  for (const row of audit) events.push({
    eventAt: row.created_at, eventType: `AUDIT_${row.action}`, reference: row.entity_type, actor: profiles.get(row.actor_id) || "System",
    description: `${row.entity_type}${row.entity_id ? ` · ${row.entity_id}` : ""}`, recordId: row.id,
    details: { entity_id: row.entity_id, before: row.before_data, after: row.after_data },
  });
  for (const row of notifications) events.push({
    eventAt: row.created_at, eventType: `NOTIFICATION_${row.category}`, reference: row.entity_type || "",
    counterparty: profiles.get(row.recipient_id) || "Staff member", description: row.title,
    recordId: row.id, details: { message: row.message, entity_id: row.entity_id },
  });
  for (const row of customers) events.push({
    eventAt: row.created_at, eventType: "CUSTOMER_REGISTERED", reference: row.id,
    actor: profiles.get(row.created_by) || "Staff member", counterparty: row.full_name,
    description: "Customer account created", recordId: row.id,
  });
  for (const row of suppliers) events.push({
    eventAt: row.created_at, eventType: "SUPPLIER_REGISTERED", reference: row.id,
    counterparty: row.name, description: "Supplier record created", recordId: row.id,
  });

  return serializeReportCsv(events, window, generatedAt);
}
