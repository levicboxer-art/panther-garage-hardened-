import type { SupabaseClient } from "@supabase/supabase-js";

export const REPORT_CATEGORIES = [
  "complete",
  "financial",
  "sales",
  "inventory",
  "payments",
  "repairs",
  "expenses",
  "customers",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportWindow = { from: string; to: string; previousFrom: string; previousTo: string };

type Row = Record<string, any>;
const n = (v: unknown) => Number(v ?? 0);
const round = (v: number) => Math.round(v * 100) / 100;
const dayStart = (date: string) => `${date}T00:00:00.000Z`;
const addDays = (date: string, days: number) => {
  const d = new Date(dayStart(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monthStart = (date: string, offset: number) => {
  const [year, month] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
};
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function normaliseReportWindow(from: unknown, to: unknown): ReportWindow | null {
  if (!validDate(from) || !validDate(to) || from > to) return null;
  const start = new Date(dayStart(from));
  const end = new Date(dayStart(to));
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return { from, to, previousFrom, previousTo };
}

function inWindow(row: Row, field: string, from: string, to: string) {
  const value = String(row[field] || "").slice(0, 10);
  return value >= from && value <= to;
}

function change(current: number, previous: number) {
  return previous === 0 ? null : round(((current - previous) / previous) * 100);
}

export async function buildBusinessReport(supabase: SupabaseClient, window: ReportWindow, category: ReportCategory = "complete") {
  const after = dayStart(window.from);
  const before = new Date(new Date(dayStart(window.to)).getTime() + 86_400_000).toISOString();
  const previousAfter = dayStart(window.previousFrom);
  const previousBefore = new Date(new Date(dayStart(window.previousTo)).getTime() + 86_400_000).toISOString();
  const trendFrom = monthStart(window.to, -5);

  const [salesRes, trendSalesRes, previousSalesRes, saleItemsRes, repairsRes, repairPartsRes, expensesRes, previousExpensesRes,
    productsRes, batchesRes, movementsRes, purchaseOrdersRes, invoicesRes, customersRes, previousCustomersRes] = await Promise.all([
    supabase.from("sales").select("id,invoice_number,customer_id,payment_method,subtotal,discount,total,amount_paid,balance_due,status,created_at").gte("created_at", after).lt("created_at", before).order("created_at", { ascending: false }).limit(10000),
    supabase.from("sales").select("total,amount_paid,status,created_at").gte("created_at", dayStart(trendFrom)).lt("created_at", before).limit(20000),
    supabase.from("sales").select("id,total,created_at,status").eq("status", "COMPLETED").gte("created_at", previousAfter).lt("created_at", previousBefore).limit(10000),
    supabase.from("sale_items").select("id,sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,sales!inner(created_at,status)").eq("sales.status", "COMPLETED").gte("sales.created_at", after).lt("sales.created_at", before).limit(20000),
    supabase.from("repair_jobs").select("id,job_number,customer_id,motorcycle_make,motorcycle_model,reported_issue,status,labour_fee,parts_total,total_cost,received_at,completed_at,collected_at").gte("received_at", after).lt("received_at", before).limit(10000),
    supabase.from("repair_parts").select("id,repair_job_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,repair_jobs!inner(received_at,status)").gte("repair_jobs.received_at", after).lt("repair_jobs.received_at", before).limit(20000),
    supabase.from("garage_expenses").select("id,category,description,amount,expense_date,payment_method,reference,status,created_at").gte("expense_date", window.from).lte("expense_date", window.to).limit(10000),
    supabase.from("garage_expenses").select("id,amount,expense_date,status").gte("expense_date", window.previousFrom).lte("expense_date", window.previousTo).limit(10000),
    supabase.from("products").select("id,name,sku,category,compatibility,selling_price,minimum_stock,active").limit(10000),
    supabase.from("inventory_batches").select("id,product_id,quantity_remaining,unit_cost,received_at").gt("quantity_remaining", 0).limit(30000),
    supabase.from("stock_movements").select("id,product_id,batch_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_at").gte("created_at", after).lt("created_at", before).order("created_at", { ascending: false }).limit(30000),
    supabase.from("purchase_orders").select("id,order_number,supplier_id,status,subtotal,created_at,order_date").gte("created_at", after).lt("created_at", before).limit(10000),
    supabase.from("supplier_invoices").select("id,invoice_number,supplier_id,amount,paid_amount,status,due_date,created_at").gte("created_at", after).lt("created_at", before).limit(10000),
    supabase.from("customers").select("id,full_name,created_at").limit(10000),
    supabase.from("customers").select("id,created_at").gte("created_at", previousAfter).lt("created_at", previousBefore).limit(10000),
  ]);

  const failed = [salesRes, trendSalesRes, previousSalesRes, saleItemsRes, repairsRes, repairPartsRes, expensesRes, previousExpensesRes, productsRes, batchesRes, movementsRes, purchaseOrdersRes, invoicesRes, customersRes, previousCustomersRes].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const sales = (salesRes.data || []) as Row[];
  const completedSales = sales.filter((row) => row.status === "COMPLETED");
  const trendSales = (trendSalesRes.data || []) as Row[];
  const previousSales = (previousSalesRes.data || []) as Row[];
  const saleItems = (saleItemsRes.data || []) as Row[];
  const repairs = (repairsRes.data || []) as Row[];
  const repairParts = (repairPartsRes.data || []) as Row[];
  const expenses = (expensesRes.data || []) as Row[];
  const previousExpenses = (previousExpensesRes.data || []) as Row[];
  const products = (productsRes.data || []) as Row[];
  const batches = (batchesRes.data || []) as Row[];
  const movements = (movementsRes.data || []) as Row[];
  const purchaseOrders = (purchaseOrdersRes.data || []) as Row[];
  const invoices = (invoicesRes.data || []) as Row[];
  const customers = (customersRes.data || []) as Row[];
  const previousCustomers = (previousCustomersRes.data || []) as Row[];

  const salesRevenue = round(completedSales.reduce((sum, row) => sum + n(row.total), 0));
  const grossSales = round(completedSales.reduce((sum, row) => sum + n(row.subtotal), 0));
  const discounts = round(completedSales.reduce((sum, row) => sum + n(row.discount), 0));
  const collected = round(completedSales.reduce((sum, row) => sum + n(row.amount_paid), 0));
  const customerBalance = round(completedSales.reduce((sum, row) => sum + n(row.balance_due), 0));
  const partsRevenue = round(saleItems.reduce((sum, row) => sum + n(row.line_total), 0));
  const partsCost = round(saleItems.reduce((sum, row) => sum + n(row.unit_cost) * n(row.quantity), 0));
  const repairClosed = repairs.filter((row) => ["READY", "COLLECTED"].includes(row.status));
  const repairPending = repairs.filter((row) => !["READY", "COLLECTED", "CANCELLED"].includes(row.status));
  const repairCancelled = repairs.filter((row) => row.status === "CANCELLED");
  const repairRevenue = round(repairClosed.reduce((sum, row) => sum + n(row.total_cost), 0));
  const serviceGroups = repairs.reduce((groups: Record<string, Row>, row) => {
    const service = String(row.reported_issue || "Motorcycle repair").trim() || "Motorcycle repair";
    groups[service] = groups[service] || { service, label: service, jobs: 0, revenue: 0 };
    groups[service].jobs += 1;
    if (["READY", "COLLECTED"].includes(row.status)) groups[service].revenue += n(row.total_cost);
    return groups;
  }, {});
  const serviceRevenue = Object.values(serviceGroups).map((item) => ({ service: item.service, revenue: round(item.revenue), jobs: item.jobs })).sort((a, b) => b.revenue - a.revenue);
  const serviceDemand = Object.values(serviceGroups).map((item) => ({ label: item.label, value: item.jobs })).sort((a, b) => b.value - a.value);
  const repairPartsRevenue = round(repairClosed.reduce((sum, row) => sum + n(row.parts_total), 0));
  const repairLabourRevenue = round(repairClosed.reduce((sum, row) => sum + n(row.labour_fee), 0));
  const repairPartsCost = round(repairParts.filter((row) => ["READY", "COLLECTED"].includes(row.repair_jobs?.status || ""))
    .reduce((sum, row) => sum + n(row.unit_cost) * n(row.quantity), 0));
  const cogs = round(partsCost + repairPartsCost);
  const grossProfit = round(partsRevenue + repairPartsRevenue - cogs);
  const approvedExpenses = expenses.filter((row) => row.status === "APPROVED");
  const operatingExpenses = round(approvedExpenses.reduce((sum, row) => sum + n(row.amount), 0));
  const netOperatingResult = round(grossProfit + repairLabourRevenue - operatingExpenses);
  const hasCompleteCostData = saleItems.length === 0 || saleItems.every((row) => row.unit_cost !== null && row.unit_cost !== undefined);
  const previousRevenue = round(previousSales.reduce((sum, row) => sum + n(row.total), 0));
  const previousExpenseTotal = round(previousExpenses.filter((row) => row.status === "APPROVED").reduce((sum, row) => sum + n(row.amount), 0));
  const trendByMonth = new Map<string, { revenue: number; collected: number }>();
  for (let offset = 0; offset < 6; offset += 1) trendByMonth.set(monthStart(window.to, offset - 5).slice(0, 7), { revenue: 0, collected: 0 });
  for (const sale of trendSales) {
    if (sale.status !== "COMPLETED") continue;
    const month = String(sale.created_at || "").slice(0, 7);
    const entry = trendByMonth.get(month);
    if (entry) { entry.revenue += n(sale.total); entry.collected += n(sale.amount_paid); }
  }
  const salesTrend = [...trendByMonth].map(([month, totals]) => ({ month, revenue: round(totals.revenue), collected: round(totals.collected) }));

  const stockByProduct = new Map<string, { units: number; cost: number }>();
  for (const batch of batches) {
    const entry = stockByProduct.get(batch.product_id) || { units: 0, cost: 0 };
    entry.units += n(batch.quantity_remaining);
    entry.cost += n(batch.quantity_remaining) * n(batch.unit_cost);
    stockByProduct.set(batch.product_id, entry);
  }
  const movementByProduct = new Map<string, number>();
  for (const movement of movements) {
    if (["SALE", "REPAIR_ISSUE"].includes(movement.movement_type)) movementByProduct.set(movement.product_id, (movementByProduct.get(movement.product_id) || 0) + Math.abs(n(movement.quantity_delta)));
  }
  const inventory = products.filter((p) => p.active).map((product) => {
    const stock = stockByProduct.get(product.id) || { units: 0, cost: 0 };
    const potential = stock.units * n(product.selling_price);
    const minimum = Math.max(n(product.minimum_stock), 0);
    const status = stock.units <= 0 ? "OUT_OF_STOCK" : stock.units <= minimum ? "LOW_STOCK" : "HEALTHY";
    return { product_id: product.id, name: product.name, sku: product.sku, category: product.category, compatibility: product.compatibility, quantity_in_stock: stock.units, unit_purchase_cost: stock.units ? round(stock.cost / stock.units) : null, unit_selling_price: n(product.selling_price), stock_purchase_value: round(stock.cost), estimated_potential_sales_value: round(potential), reorder_level: minimum, stock_status: status, units_moved: movementByProduct.get(product.id) || 0 };
  });
  const stockPurchaseValue = round(inventory.reduce((sum, row) => sum + row.stock_purchase_value, 0));
  const potentialSalesValue = round(inventory.reduce((sum, row) => sum + row.estimated_potential_sales_value, 0));

  const salesByProduct = new Map<string, Row>();
  for (const item of saleItems) {
    const entry = salesByProduct.get(item.product_id) || { product_id: item.product_id, product_name: item.product_name, sku: item.sku, units: 0, revenue: 0, cost: 0 };
    entry.units += n(item.quantity); entry.revenue += n(item.line_total); entry.cost += n(item.unit_cost) * n(item.quantity); salesByProduct.set(item.product_id, entry);
  }
  const productSales = (([...salesByProduct.values()] as Row[]).map((row) => ({ ...row, revenue: round(row.revenue), cost: round(row.cost), gross_profit: round(row.revenue - row.cost) })) as Row[]).sort((a, b) => n(b.units) - n(a.units));
  const mostPurchasedProduct = productSales[0] || null;
  const highestRevenueProduct = [...productSales].sort((a, b) => n(b.revenue) - n(a.revenue))[0] || null;
  const highestProfitProduct = hasCompleteCostData ? [...productSales].sort((a, b) => n(b.gross_profit) - n(a.gross_profit))[0] || null : null;

  const expensesByCategory = Object.values(approvedExpenses.reduce((map: Record<string, Row>, row) => { const key = row.category || "Unclassified"; map[key] = map[key] || { category: key, amount: 0, count: 0 }; map[key].amount += n(row.amount); map[key].count += 1; return map; }, {})).map((row) => ({ ...row, amount: round(row.amount) })).sort((a, b) => b.amount - a.amount);
  const paymentsByMethod = Object.values(completedSales.reduce((map: Record<string, Row>, row) => { const key = row.payment_method || "UNSPECIFIED"; map[key] = map[key] || { method: key, count: 0, amount: 0 }; map[key].count += 1; map[key].amount += n(row.amount_paid); return map; }, {})).map((row) => ({ ...row, amount: round(row.amount) }));

  const repairsTable = repairs.map((row) => ({ repair_reference: row.job_number, service_type: row.reported_issue || "Motorcycle repair", status: row.status, received_date: row.received_at, completion_date: row.completed_at, labour_charge: n(row.labour_fee), parts_charge: n(row.parts_total), total_charge: n(row.total_cost), amount_paid: null, outstanding_balance: null }));
  const customersInPeriod = customers.filter((row) => inWindow(row, "created_at", window.from, window.to));
  const customerIds = new Set(completedSales.filter((row) => row.customer_id).map((row) => row.customer_id));
  const returningCustomerIds = new Set<string>();
  const visits = new Map<string, number>();
  for (const row of completedSales) if (row.customer_id) visits.set(row.customer_id, (visits.get(row.customer_id) || 0) + 1);
  visits.forEach((count, id) => { if (count > 1) returningCustomerIds.add(id); });

  const alerts = [
    ...inventory.filter((row) => row.stock_status === "OUT_OF_STOCK").map((row) => ({ severity: "RED", issue: `${row.name} is out of stock`, metric: "0 units available", recommended_action: "Review replenishment before accepting the next sale." })),
    ...inventory.filter((row) => row.stock_status === "LOW_STOCK").map((row) => ({ severity: "AMBER", issue: `${row.name} is below its reorder level`, metric: `${row.quantity_in_stock} units vs ${row.reorder_level} minimum`, recommended_action: "Review the restocking recommendation." })),
    ...(customerBalance > 0 ? [{ severity: customerBalance > salesRevenue * 0.15 ? "RED" : "AMBER", issue: "Customer balances require collection follow-up", metric: `RWF ${customerBalance.toLocaleString("en-RW")}`, recommended_action: "Review credit invoices and contact customers before extending more credit." }] : []),
    ...(change(salesRevenue, previousRevenue) !== null && (change(salesRevenue, previousRevenue) as number) <= -10 ? [{ severity: "AMBER", issue: "Revenue decreased versus the previous equivalent period", metric: `${change(salesRevenue, previousRevenue)}%`, recommended_action: "Review stockouts, pricing and completed invoice volume." }] : []),
    ...(change(operatingExpenses, previousExpenseTotal) !== null && (change(operatingExpenses, previousExpenseTotal) as number) >= 20 ? [{ severity: "AMBER", issue: "Operating expenses increased materially", metric: `${change(operatingExpenses, previousExpenseTotal)}%`, recommended_action: "Review the expense-category detail and approval records." }] : []),
    ...(repairPending.length > 0 ? [{ severity: repairPending.length >= 5 ? "RED" : "AMBER", issue: "Repair backlog is open", metric: `${repairPending.length} pending repair jobs`, recommended_action: "Review jobs waiting for diagnosis, parts or completion." }] : []),
  ];

  const resultStatus = !hasCompleteCostData ? "INCOMPLETE" : netOperatingResult > 0 ? "PROFIT" : netOperatingResult < 0 ? "LOSS" : "BREAK_EVEN";
  return {
    meta: { business_name: "Panther Legacy Garage", currency: "RWF", category, from: window.from, to: window.to, previous_from: window.previousFrom, previous_to: window.previousTo, generated_at: new Date().toISOString(), timezone: "UTC" },
    availability: { profit: hasCompleteCostData ? "AVAILABLE" : "Not available – incomplete cost data", payments: "Sales amount_paid records only; external PowerPay transaction records are not present in the PGMS schema.", repair_payments: "Not available – repair payment records are not present in the PGMS schema." },
    executive_summary: {
      total_sales_revenue: salesRevenue, total_successful_payments_collected: collected, outstanding_customer_balances: customerBalance,
      total_cost_of_goods_sold: hasCompleteCostData ? cogs : null, gross_profit: hasCompleteCostData ? grossProfit : null, total_operating_expenses: operatingExpenses,
      net_operating_result: hasCompleteCostData ? netOperatingResult : null, total_stock_purchase_value: stockPurchaseValue, estimated_potential_sales_value: potentialSalesValue,
      total_completed_repairs: repairClosed.length, total_pending_repairs: repairPending.length, total_products_in_stock: inventory.filter((row) => row.quantity_in_stock > 0).length,
      total_units_in_stock: inventory.reduce((sum, row) => sum + row.quantity_in_stock, 0), revenue_change_pct: change(salesRevenue, previousRevenue), expense_change_pct: change(operatingExpenses, previousExpenseTotal), result_status: resultStatus,
      completed_sales_count: completedSales.length, average_sale_value: completedSales.length ? round(salesRevenue / completedSales.length) : 0,
      most_purchased_product: mostPurchasedProduct?.product_name || null, most_purchased_quantity: mostPurchasedProduct ? n(mostPurchasedProduct.units) : null,
      highest_revenue_product: highestRevenueProduct?.product_name || null, highest_revenue_product_amount: highestRevenueProduct ? n(highestRevenueProduct.revenue) : null,
      highest_gross_profit_product: highestProfitProduct?.product_name || null, highest_gross_profit_product_amount: highestProfitProduct ? n(highestProfitProduct.gross_profit) : null,
    },
    financial: { gross_sales: grossSales, discounts, net_sales_revenue: salesRevenue, spare_parts_revenue: partsRevenue, repair_service_revenue: repairRevenue, cost_of_goods_sold: hasCompleteCostData ? cogs : null, gross_profit: hasCompleteCostData ? grossProfit : null, gross_profit_margin_pct: hasCompleteCostData && salesRevenue > 0 ? round((grossProfit / salesRevenue) * 100) : null, operating_expenses: operatingExpenses, net_operating_result: hasCompleteCostData ? netOperatingResult : null, result_status: resultStatus, refunds: null, note: "Refund records are not present in the PGMS schema; refund amount is not available rather than zero." },
    sales: { invoices: completedSales.map((row) => ({ invoice: row.invoice_number, date: row.created_at, total: n(row.total), discount: n(row.discount), amount_paid: n(row.amount_paid), balance_due: n(row.balance_due), payment_method: row.payment_method })), trend: salesTrend, product_sales: productSales, average_order_value: completedSales.length ? round(salesRevenue / completedSales.length) : 0 },
    payments: { successful_count: completedSales.filter((row) => n(row.amount_paid) > 0).length, successful_value: collected, pending_count: null, failed_count: null, refunded_count: null, unreconciled_count: null, by_method: paymentsByMethod, transactions: completedSales.map((row) => ({ reference: row.invoice_number, date: row.created_at, amount: n(row.amount_paid), status: n(row.amount_paid) > 0 ? "RECORDED_COLLECTION" : "OUTSTANDING_BALANCE", method: row.payment_method, related_sale: row.id, reconciliation_status: "SALE_RECORD_ONLY" })) },
    inventory: { summary: { distinct_products: inventory.length, units_in_stock: inventory.reduce((sum, row) => sum + row.quantity_in_stock, 0), stock_purchase_value: stockPurchaseValue, estimated_potential_sales_value: potentialSalesValue, low_stock_products: inventory.filter((row) => row.stock_status === "LOW_STOCK").length, out_of_stock_products: inventory.filter((row) => row.stock_status === "OUT_OF_STOCK").length }, products: inventory, movements },
    repairs: { summary: { total_jobs: repairs.length, completed_jobs: repairClosed.length, pending_jobs: repairPending.length, cancelled_jobs: repairCancelled.length, repair_service_revenue: repairRevenue, parts_consumed: repairParts.reduce((sum, row) => sum + n(row.quantity), 0), average_completion_days: repairClosed.length ? round(repairClosed.reduce((sum, row) => sum + (row.completed_at ? (new Date(row.completed_at).getTime() - new Date(row.received_at).getTime()) / 86_400_000 : 0), 0) / repairClosed.length) : null }, service_demand: serviceDemand, service_revenue: serviceRevenue, jobs: repairsTable },
    expenses: { summary: { total_expenses: operatingExpenses, supplier_purchases: round(purchaseOrders.filter((row) => row.status !== "CANCELLED").reduce((sum, row) => sum + n(row.subtotal), 0)), purchase_orders: purchaseOrders.length, outstanding_supplier_balances: round(invoices.reduce((sum, row) => sum + Math.max(0, n(row.amount) - n(row.paid_amount)), 0)) }, by_category: expensesByCategory, transactions: expenses.map((row) => ({ date: row.expense_date, reference: row.reference || row.id, category: row.category, description: row.description, amount: n(row.amount), status: row.status, payment_method: row.payment_method })) },
    purchases: purchaseOrders.map((row) => ({ purchase_order: row.order_number || row.id, date: row.order_date || row.created_at, supplier_id: row.supplier_id, status: row.status, subtotal: n(row.subtotal), accounting_treatment: "INVENTORY_PURCHASE_NOT_OPERATING_EXPENSE" })),
    customers: { registered: customers.length, new_customers: customersInPeriod.length, returning_customers: returningCustomerIds.size, total_customer_orders: customerIds.size, average_order_value: completedSales.length ? round(salesRevenue / completedSales.length) : 0, most_active_customer_count: [...visits.values()].sort((a, b) => b - a).slice(0, 10), outstanding_balances: customerBalance },
    insights: alerts.map((alert) => ({ ...alert, color: alert.severity === "RED" ? "RED" : alert.severity === "AMBER" ? "AMBER" : "BLUE" })),
  };
}
