import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The single business-intelligence engine, shared by /api/bi (charts) and
 * /api/assistant (AI grounding) so both always quote the same numbers.
 */

const num = (v: unknown) => Number(v ?? 0);
const dayKey = (iso: string) => iso.slice(0, 10);
const monthKey = (iso: string) => iso.slice(0, 7);

type Trend = { slope: number; intercept: number; r2: number };

// Least-squares fit over evenly spaced buckets; the evidence behind every forecast.
function regression(ys: number[]): Trend {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  const ssTot = ys.reduce((a, y) => a + (y - mean) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * i)) ** 2, 0);
  return { slope, intercept, r2: ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot) };
}

function confidence(r2: number, months: number): "High" | "Medium" | "Low" {
  if (months >= 4 && r2 >= 0.6) return "High";
  if (months >= 3 && r2 >= 0.3) return "Medium";
  return "Low";
}

const PAYMENT_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT"];

export type BiResult = { ok: true; data: Record<string, any> } | { ok: false; error: string };

export function normaliseWindow(raw: unknown): number {
  const d = Number(raw);
  return Math.min(365, Math.max(30, Number.isFinite(d) ? d : 90));
}

export async function computeBusinessIntelligence(supabase: SupabaseClient, days: number): Promise<BiResult> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const prevSince = new Date(now.getTime() - 2 * days * 86400000).toISOString();
  const since90 = new Date(now.getTime() - 90 * 86400000).toISOString();

  const [salesRes, prevSalesRes, itemsRes, jobsRes, partsRes, customersRes, productsRes, stockRes, movementsRes] =
    await Promise.all([
      supabase.from("sales")
        .select("id,invoice_number,customer_id,total,amount_paid,balance_due,payment_method,status,created_at")
        .gte("created_at", since).limit(5000),
      supabase.from("sales")
        .select("id,total,created_at")
        .eq("status", "COMPLETED").gte("created_at", prevSince).lt("created_at", since).limit(5000),
      supabase.from("sale_items")
        .select("product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,sale_id,sales!inner(created_at,status)")
        .eq("sales.status", "COMPLETED").gte("sales.created_at", since).limit(8000),
      supabase.from("repair_jobs")
        .select("id,job_number,customer_id,status,labour_fee,parts_total,total_cost,received_at,completed_at,collected_at")
        .gte("received_at", since).limit(3000),
      supabase.from("repair_parts")
        .select("product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,repair_jobs!inner(received_at,status)")
        .not("repair_jobs.status", "in", "(CANCELLED)").gte("repair_jobs.received_at", since).limit(8000),
      supabase.from("customers").select("id,full_name,phone,created_at").limit(5000),
      supabase.from("products")
        .select("id,name,sku,category,compatibility,selling_price,minimum_stock,safety_stock,supplier_lead_time_days,target_stock_days,active")
        .limit(3000),
      supabase.from("inventory_summary").select("product_id,physical_stock,available_stock"),
      // A full year of demand history powers the monthly trend and the forecast.
      supabase.from("stock_movements")
        .select("product_id,movement_type,quantity_delta,created_at")
        .in("movement_type", ["SALE", "REPAIR_ISSUE"])
        .gte("created_at", new Date(now.getTime() - 365 * 86400000).toISOString())
        .limit(10000),
    ]);

  const failed = [salesRes, prevSalesRes, itemsRes, jobsRes, partsRes, customersRes, productsRes, stockRes, movementsRes]
    .find((x) => x.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  const sales = (salesRes.data || []) as any[];
  const completed = sales.filter((s) => s.status === "COMPLETED");
  const prevCompleted = (prevSalesRes.data || []) as any[];
  const items = (itemsRes.data || []) as any[];
  const jobs = (jobsRes.data || []) as any[];
  const repairParts = (partsRes.data || []) as any[];
  const customers = (customersRes.data || []) as any[];
  const products = (productsRes.data || []) as any[];
  const movements = (movementsRes.data || []) as any[];
  const stockMap = new Map((stockRes.data || []).map((s: any) => [s.product_id, num(s.physical_stock)]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  /* ---------- 1. Sales analytics ---------- */
  const revenue = completed.reduce((a, s) => a + num(s.total), 0);
  const prevRevenue = prevCompleted.reduce((a, s) => a + num(s.total), 0);
  const revenueChange = prevRevenue === 0 ? null : ((revenue - prevRevenue) / prevRevenue) * 100;

  const daily = new Map<string, { revenue: number; orders: number }>();
  for (const s of completed) {
    const k = dayKey(s.created_at);
    const d = daily.get(k) || { revenue: 0, orders: 0 };
    d.revenue += num(s.total);
    d.orders += 1;
    daily.set(k, d);
  }
  const revenueTrend = [...daily.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({ date, revenue: round2(v.revenue), orders: v.orders }));

  const paymentMethods = PAYMENT_METHODS.map((method) => {
    const rows = completed.filter((s) => s.payment_method === method);
    return { method, count: rows.length, total: round2(rows.reduce((a, s) => a + num(s.total), 0)) };
  }).filter((m) => m.count > 0);

  const creditBalance = round2(completed.reduce((a, s) => a + num(s.balance_due), 0));
  const avgTicket = completed.length ? revenue / completed.length : 0;

  /* ---------- 2. Product performance (counter sales + repair issues) ---------- */
  type Perf = { product_id: string; name: string; sku: string; units: number; revenue: number; cost: number };
  const perfMap = new Map<string, Perf>();
  const bump = (id: string | null, name: string, sku: string, units: number, rev: number, cost: number) => {
    if (!id) return;
    const row = perfMap.get(id) || { product_id: id, name, sku, units: 0, revenue: 0, cost: 0 };
    row.units += units;
    row.revenue += rev;
    row.cost += cost;
    perfMap.set(id, row);
  };
  for (const it of items)
    bump(it.product_id, it.product_name, it.sku, num(it.quantity), num(it.line_total), num(it.unit_cost) * num(it.quantity));
  for (const rp of repairParts)
    bump(rp.product_id, rp.product_name, rp.sku, num(rp.quantity), num(rp.line_total), num(rp.unit_cost) * num(rp.quantity));

  const perf = [...perfMap.values()].map((r) => ({
    ...r,
    revenue: round2(r.revenue),
    cost: round2(r.cost),
    gross_profit: round2(r.revenue - r.cost),
    margin_pct: r.revenue > 0 ? round1(((r.revenue - r.cost) / r.revenue) * 100) : null,
  }));
  const bestSellers = [...perf].sort((a, b) => b.units - a.units).slice(0, 10);

  // Exact 90-day consumption per product from the FIFO movement ledger.
  const units90Map = new Map<string, number>();
  for (const m of movements) {
    if (m.created_at < since90) continue;
    units90Map.set(m.product_id, (units90Map.get(m.product_id) || 0) + Math.abs(num(m.quantity_delta)));
  }
  const lastSoldMap = new Map<string, string>();
  for (const m of movements) {
    const prev = lastSoldMap.get(m.product_id);
    if (!prev || m.created_at > prev) lastSoldMap.set(m.product_id, m.created_at);
  }
  const slowMovers = products
    .filter((p: any) => p.active)
    .map((p: any) => {
      const stock = stockMap.get(p.id) || 0;
      const units90 = units90Map.get(p.id) || 0;
      return {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        stock,
        units_last_90d: units90,
        last_sold_at: lastSoldMap.get(p.id) || null,
      };
    })
    .filter((r) => r.stock > 0 && r.units_last_90d === 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 15);

  /* ---------- 3. Profitability ---------- */
  const byMargin = [...perf]
    .filter((r) => r.units >= 2)
    .sort((a, b) => b.gross_profit - a.gross_profit)
    .slice(0, 15);
  const soldItemsRevenue = items.reduce((a, i) => a + num(i.line_total), 0);
  const soldItemsCost = items.reduce((a, i) => a + num(i.unit_cost) * num(i.quantity), 0);
  const closedJobs = jobs.filter((j) => j.status === "COLLECTED" || j.status === "READY");
  const repairLabour = closedJobs.reduce((a, j) => a + num(j.labour_fee), 0);
  const repairPartsRev = closedJobs.reduce((a, j) => a + num(j.parts_total), 0);
  const repairPartsCost = repairParts.reduce((a, p) => a + num(p.unit_cost) * num(p.quantity), 0);
  const profitability = {
    parts_gross_profit: round2(soldItemsRevenue - soldItemsCost),
    parts_margin_pct: soldItemsRevenue > 0 ? round1(((soldItemsRevenue - soldItemsCost) / soldItemsRevenue) * 100) : null,
    repairs: {
      jobs_closed: closedJobs.length,
      labour_revenue: round2(repairLabour),
      parts_revenue: round2(repairPartsRev),
      parts_cost: round2(repairPartsCost),
      parts_profit: round2(repairPartsRev - repairPartsCost),
      total_revenue: round2(repairLabour + repairPartsRev),
      avg_per_job: closedJobs.length ? round2((repairLabour + repairPartsRev) / closedJobs.length) : 0,
    },
    by_product: byMargin,
  };
  const lossLeaders = perf
    .filter((r) => r.units > 0 && r.revenue > 0 && r.cost >= r.revenue)
    .sort((a, b) => a.gross_profit - b.gross_profit)
    .slice(0, 8);

  /* ---------- 4. Customer insights ---------- */
  const purchasesByCustomer = new Map<string, { visits: number; revenue: number; last: string | null }>();
  for (const s of completed) {
    if (!s.customer_id) continue;
    const row = purchasesByCustomer.get(s.customer_id) || { visits: 0, revenue: 0, last: null };
    row.visits += 1;
    row.revenue += num(s.total);
    if (!row.last || s.created_at > row.last) row.last = s.created_at;
    purchasesByCustomer.set(s.customer_id, row);
  }
  const repeat = [...purchasesByCustomer.values()].filter((v) => v.visits >= 2).length;
  const withPurchases = purchasesByCustomer.size;
  const repeatRate = withPurchases ? (repeat / withPurchases) * 100 : 0;
  const daysAgo = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  const segments = { champions: 0, at_risk: 0, dormant: 0, new_buyers: 0 };
  for (const v of purchasesByCustomer.values()) {
    const recency = v.last ? daysAgo(v.last) : 9999;
    if (v.visits >= 3 && recency <= 60) segments.champions += 1;
    else if (v.visits >= 2 && recency > 60 && recency <= 150) segments.at_risk += 1;
    else if (recency > 150) segments.dormant += 1;
    else if (recency <= 30) segments.new_buyers += 1;
  }
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const topCustomers = [...purchasesByCustomer.entries()]
    .map(([id, v]) => ({
      id,
      name: customerMap.get(id)?.full_name || "Unknown customer",
      phone: customerMap.get(id)?.phone || null,
      visits: v.visits,
      revenue: round2(v.revenue),
      last_purchase: v.last,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const guestSales = completed.filter((s) => !s.customer_id).length;

  /* ---------- 5. Demand analysis + evidence-based forecast ---------- */
  const monthlyUnits = new Map<string, number>();
  for (const m of movements) {
    const k = monthKey(m.created_at);
    monthlyUnits.set(k, (monthlyUnits.get(k) || 0) + Math.abs(num(m.quantity_delta)));
  }
  const monthLabels = lastMonths(13);
  const monthlySeries = monthLabels.map((month) => ({
    month,
    units: monthlyUnits.get(month) || 0,
    // Revenue only exists inside the selected window; null keeps the chart honest outside it.
    revenue: month >= monthKey(since).slice(0, 7) ? round2(
      completed.filter((s) => monthKey(s.created_at) === month).reduce((a, s) => a + num(s.total), 0)
    ) : null,
  }));
  // Exclude the current partial month from the fit so the forecast is not dragged down.
  const fitUnits = monthlySeries.slice(0, -1).map((r) => r.units);
  const fit = regression(fitUnits.length >= 2 ? fitUnits : monthlySeries.map((r) => r.units));
  const horizon = fitUnits.length >= 2 ? fitUnits.length : monthlySeries.length;
  const forecastNextMonthUnits = Math.max(0, Math.round(fit.intercept + fit.slope * horizon));
  const demandTrend = fit.slope > fit.intercept * 0.05 && fit.intercept > 0 ? "rising" : fit.slope < -fit.intercept * 0.05 ? "falling" : "flat";

  // Per-product demand from the movement ledger (authoritative for SALE + REPAIR_ISSUE).
  const productMonthly = new Map<string, Map<string, number>>();
  for (const m of movements) {
    const byMonth = productMonthly.get(m.product_id) || new Map<string, number>();
    const k = monthKey(m.created_at);
    byMonth.set(k, (byMonth.get(k) || 0) + Math.abs(num(m.quantity_delta)));
    productMonthly.set(m.product_id, byMonth);
  }
  const productForecasts = [...productMonthly.entries()]
    .map(([pid, byMonth]) => {
      const p = productMap.get(pid);
      if (!p) return null;
      const series = monthLabels.slice(0, -1).map((m) => byMonth.get(m) || 0);
      const totalMonths = series.filter((v) => v > 0).length;
      const f = regression(series);
      const forecastPerMonth = Math.max(0, f.intercept + f.slope * series.length);
      const avg = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);
      const stock = stockMap.get(pid) || 0;
      const perDay = forecastPerMonth / 30;
      const daysCover = perDay > 0 ? Math.floor(stock / perDay) : null;
      const leadTime = p.supplier_lead_time_days ?? 7;
      const targetDays = p.target_stock_days ?? 30;
      const safety = p.safety_stock ?? 0;
      const suggested = perDay > 0 ? Math.max(0, Math.ceil(perDay * targetDays + safety - stock)) : 0;
      return {
        product_id: pid,
        name: p.name,
        sku: p.sku,
        avg_monthly_units: round1(avg),
        forecast_next_month_units: round1(forecastPerMonth),
        trend: f.slope > avg * 0.1 ? "rising" : f.slope < -avg * 0.1 ? "falling" : "flat",
        confidence: confidence(f.r2, totalMonths),
        stock,
        days_cover: daysCover,
        lead_time_days: leadTime,
        suggested_reorder: daysCover !== null && daysCover < leadTime + 14 && suggested > 0 ? suggested : 0,
        months_of_history: totalMonths,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.avg_monthly_units > 0)
    .sort((a, b) => b.forecast_next_month_units - a.forecast_next_month_units)
    .slice(0, 12);

  /* ---------- 6. BOSS recommendations (evidence-backed rules) ---------- */
  const recommendations: { priority: "HIGH" | "MEDIUM" | "INFO"; title: string; detail: string }[] = [];
  const stockoutRisks = productForecasts.filter((r) => r.suggested_reorder > 0);
  if (stockoutRisks.length)
    recommendations.push({
      priority: "HIGH",
      title: `Reorder ${stockoutRisks.length} part${stockoutRisks.length === 1 ? "" : "s"} before stock runs out`,
      detail: stockoutRisks
        .slice(0, 4)
        .map((r) => `${r.name}: buy ~${r.suggested_reorder} units (covers ${r.days_cover ?? 0} days vs ${r.lead_time_days}-day lead time)`)
        .join("; "),
    });
  for (const ll of lossLeaders.slice(0, 3))
    recommendations.push({
      priority: "HIGH",
      title: `${ll.name} sells at or below cost`,
      detail: `${ll.units} units moved for ${fmt(ll.revenue)} against ${fmt(ll.cost)} purchase cost. Raise the confirmed price or renegotiate the supplier cost.`,
    });
  if (slowMovers.length) {
    const units = slowMovers.reduce((a, r) => a + r.stock, 0);
    recommendations.push({
      priority: "MEDIUM",
      title: `${slowMovers.length} parts had zero demand for 90 days`,
      detail: `${units} units are tied up without a single sale or repair issue in 90 days. Consider a promotion, bundling with fast movers, or returning to the supplier.`,
    });
  }
  if (profitability.parts_margin_pct !== null && profitability.parts_margin_pct < 20 && soldItemsRevenue > 0)
    recommendations.push({
      priority: "MEDIUM",
      title: `Counter margin is ${profitability.parts_margin_pct}%`,
      detail: `Gross profit of ${fmt(profitability.parts_gross_profit)} on ${fmt(soldItemsRevenue)} sales. Review pricing on the lowest-margin lines in the profitability table.`,
    });
  if (creditBalance > 0)
    recommendations.push({
      priority: creditBalance > revenue * 0.15 ? "HIGH" : "MEDIUM",
      title: `Outstanding customer credit: ${fmt(creditBalance)}`,
      detail: `${completed.filter((s) => num(s.balance_due) > 0).length} invoices carry unpaid balances (${revenue > 0 ? round1((creditBalance / (revenue + creditBalance)) * 100) : 0}% of expected revenue). Follow up before extending more CREDIT sales.`,
    });
  if (segments.at_risk > 0)
    recommendations.push({
      priority: "MEDIUM",
      title: `${segments.at_risk} repeat customers are going quiet`,
      detail: "They bought at least twice but not in the last 60 days. A quick service-reminder call is the cheapest revenue you can recover.",
    });
  if (revenueChange !== null && revenueChange <= -10)
    recommendations.push({
      priority: "HIGH",
      title: `Revenue fell ${round1(Math.abs(revenueChange))}% versus the previous ${days} days`,
      detail: `Down from ${fmt(prevRevenue)} to ${fmt(revenue)}. Check stockouts on best sellers and pricing gaps first.`,
    });
  else if (revenueChange !== null && revenueChange >= 15)
    recommendations.push({
      priority: "INFO",
      title: `Revenue grew ${round1(revenueChange)}% period over period`,
      detail: `Up from ${fmt(prevRevenue)} to ${fmt(revenue)}. Growing lines are the safest place to add stock.`,
    });
  if (bestSellers.length && productForecasts.length)
    recommendations.push({
      priority: "INFO",
      title: "Forecast basis is real movement history",
      detail: `Demand fits use up to ${monthLabels.length - 1} months of FIFO SALE/REPAIR_ISSUE movements (${movements.length} rows analysed). Confidence per part is shown with each forecast.`,
    });
  const priorities = { HIGH: 0, MEDIUM: 1, INFO: 2 } as const;
  recommendations.sort((a, b) => priorities[a.priority] - priorities[b.priority]);

  return {
    ok: true,
    data: {
      period: { days, from: since, to: now.toISOString(), generated_at: now.toISOString() },
      kpis: {
        revenue: round2(revenue),
        revenue_change_pct: revenueChange === null ? null : round1(revenueChange),
        sales_count: completed.length,
        avg_ticket: round2(avgTicket),
        gross_profit: round2(soldItemsRevenue - soldItemsCost),
        gross_margin_pct: profitability.parts_margin_pct,
        credit_balance: creditBalance,
        repeat_rate_pct: round1(repeatRate),
        repairs_closed: closedJobs.length,
      },
      sales: { revenue_trend: revenueTrend, payment_methods: paymentMethods, guest_sales: guestSales },
      products: { best_sellers: bestSellers, slow_movers: slowMovers },
      profitability,
      customers: {
        total: customers.length,
        with_purchases: withPurchases,
        repeat_customers: repeat,
        repeat_rate_pct: round1(repeatRate),
        segments,
        top: topCustomers,
      },
      demand: {
        monthly: monthlySeries,
        forecast: {
          next_month_units: forecastNextMonthUnits,
          trend: demandTrend,
          monthly_slope_units: round1(fit.slope),
          r2: round2(fit.r2),
          confidence: confidence(fit.r2, fitUnits.filter((v) => v > 0).length),
          method: "Least-squares linear regression over monthly FIFO consumption (SALE + REPAIR_ISSUE).",
        },
        by_product: productForecasts,
      },
      recommendations,
    },
  };
}

/* helpers */
function lastMonths(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const rwf = new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 });
const fmt = (n: number) => rwf.format(n);
