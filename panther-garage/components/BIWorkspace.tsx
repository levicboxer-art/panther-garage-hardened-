"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  IndianRupee,
  Lightbulb,
  Loader2,
  RefreshCw,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BiData = {
  period: { days: number; from: string; to: string; generated_at: string };
  kpis: {
    revenue: number;
    revenue_change_pct: number | null;
    sales_count: number;
    avg_ticket: number;
    gross_profit: number;
    gross_margin_pct: number | null;
    credit_balance: number;
    repeat_rate_pct: number;
    repairs_closed: number;
  };
  sales: {
    revenue_trend: { date: string; revenue: number; orders: number }[];
    payment_methods: { method: string; count: number; total: number }[];
    guest_sales: number;
  };
  products: {
    best_sellers: { product_id: string; name: string; sku: string; units: number; revenue: number; gross_profit: number; margin_pct: number | null }[];
    slow_movers: { product_id: string; name: string; sku: string; stock: number; units_last_90d: number; last_sold_at: string | null }[];
  };
  profitability: {
    parts_gross_profit: number;
    parts_margin_pct: number | null;
    repairs: {
      jobs_closed: number;
      labour_revenue: number;
      parts_revenue: number;
      parts_cost: number;
      parts_profit: number;
      total_revenue: number;
      avg_per_job: number;
    };
    by_product: { product_id: string; name: string; sku: string; units: number; revenue: number; cost: number; gross_profit: number; margin_pct: number | null }[];
  };
  customers: {
    total: number;
    with_purchases: number;
    repeat_customers: number;
    repeat_rate_pct: number;
    segments: { champions: number; at_risk: number; dormant: number; new_buyers: number };
    top: { id: string; name: string; phone: string | null; visits: number; revenue: number; last_purchase: string | null }[];
  };
  demand: {
    monthly: { month: string; units: number; revenue: number | null }[];
    forecast: {
      next_month_units: number;
      trend: string;
      monthly_slope_units: number;
      r2: number;
      confidence: string;
      method: string;
    };
    by_product: {
      product_id: string;
      name: string;
      sku: string;
      avg_monthly_units: number;
      forecast_next_month_units: number;
      trend: string;
      confidence: string;
      stock: number;
      days_cover: number | null;
      lead_time_days: number;
      suggested_reorder: number;
      months_of_history: number;
    }[];
  };
  recommendations: { priority: "HIGH" | "MEDIUM" | "INFO"; title: string; detail: string }[];
  activity?: {
    stream: { ts: string; type: string; ref: string; actor: string; detail: string; amount: number | null }[];
    staff_activity: {
      id: string; name: string; role: string; sales_count: number; sales_revenue: number;
      repairs_received: number; receipts_units: number; receipts_value: number; purchases_ordered: number;
      invoices_recorded: number; supplier_payments: number; expenses_recorded: number;
      stock_adjustments: number; prices_confirmed: number; reports_filed: number;
    }[];
    checks: { key: string; label: string; status: "OK" | "WATCH" | "FLAG"; value: number; detail: string }[];
    shift_reconciliation: { date: string; employee: string; reported_delta: number; actual_movement: number; variance: number }[];
  };
};

const WINDOWS = [30, 90, 180, 365];
const PIE_COLORS = ["#c7f36b", "#7dd3fc", "#fbbf24", "#f472b6", "#a78bfa"];

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(
    Number(value || 0),
  );

const shortMoney = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);

const dayLabel = (d: string) => d.slice(5).replace("-", "/");
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mm) - 1]} ${y.slice(2)}`;
};

const tooltipStyle = {
  contentStyle: {
    background: "rgba(14,17,20,.96)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: "#e6ebe6" },
  itemStyle: { color: "#c7f36b" },
};

export default function BIWorkspace() {
  const [data, setData] = useState<BiData | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/bi?days=${days}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load business insights.");
      setData(json as BiData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load business insights.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      {
        label: "Revenue",
        value: money(k.revenue),
        sub:
          k.revenue_change_pct === null
            ? `No previous ${data.period.days}-day period to compare`
            : `${k.revenue_change_pct >= 0 ? "+" : ""}${k.revenue_change_pct}% vs previous period`,
        icon: k.revenue_change_pct !== null && k.revenue_change_pct < 0 ? TrendingDown : IndianRupee,
        warn: k.revenue_change_pct !== null && k.revenue_change_pct < 0,
      },
      {
        label: "Gross profit (parts)",
        value: money(k.gross_profit),
        sub: k.gross_margin_pct === null ? "No costed sales yet" : `${k.gross_margin_pct}% margin on counter sales`,
        icon: Wallet,
      },
      {
        label: "Transactions",
        value: String(k.sales_count),
        sub: `Avg ticket ${money(k.avg_ticket)} · ${k.repairs_closed} repairs closed`,
        icon: Repeat2,
      },
      {
        label: "Repeat customer rate",
        value: `${k.repeat_rate_pct}%`,
        sub: k.credit_balance > 0 ? `Credit outstanding: ${money(k.credit_balance)}` : "No unpaid credit balance",
        icon: k.credit_balance > 0 ? AlertTriangle : Sparkles,
        warn: k.credit_balance > 0,
      },
    ];
  }, [data]);

  if (error)
    return (
      <div className="card border-red-300/30 p-5 text-sm text-red-200 flex items-center gap-3">
        <AlertTriangle size={17} /> {error}
        <button onClick={load} className="pill ml-auto">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );

  if (loading && !data)
    return (
      <div className="card flex items-center gap-3 p-8 text-sm muted">
        <Loader2 size={18} className="animate-spin" /> Analysing your garage data…
      </div>
    );

  if (!data) return null;

  const paymentPie = data.sales.payment_methods.map((m) => ({ name: m.method, value: m.total }));

  return (
    <div className="space-y-4">
      {/* Header + window selector */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="tag flex items-center gap-2">
            <BrainCircuit size={14} /> BUSINESS INTELLIGENCE · AI INSIGHTS · BOSS ONLY
          </div>
          <h3 className="mt-1 text-xl font-bold">Every number below comes from your own records.</h3>
          <p className="mt-1 text-xs muted">
            Sales, margins, customer behaviour and demand forecasts are computed from live PostgreSQL
            data (FIFO movements, invoices, repair jobs). Forecasts use least-squares regression with a
            published confidence rating — evidence, not guesswork.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`pill ${days === w ? "!border-lime !text-lime" : ""}`}
              title={`Analyse the last ${w} days`}
            >
              {w === 365 ? "1 year" : `${w} days`}
            </button>
          ))}
          <button onClick={load} className="btn btn-ghost text-xs" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalculate
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <div className={`flex items-center justify-between text-xs ${k.warn ? "text-amber-300" : "muted"}`}>
              <span>{k.label}</span>
              <k.icon size={17} className={k.warn ? "text-amber-300" : "lime"} />
            </div>
            <div className="stat mt-3 text-2xl">{k.value}</div>
            <div className="mt-2 text-[11px] muted">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Boss briefing */}
      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Lightbulb size={18} className="lime" />
          <h3 className="font-bold">Boss briefing — actionable recommendations</h3>
        </div>
        <p className="mt-1 text-xs muted">
          Generated from this period's evidence. Highest-impact items first; each cites the numbers behind it.
        </p>
        <div className="mt-4 space-y-3">
          {data.recommendations.length ? (
            data.recommendations.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  r.priority === "HIGH"
                    ? "border-red-300/30 bg-red-300/5"
                    : r.priority === "MEDIUM"
                      ? "border-amber-300/25 bg-amber-300/5"
                      : "border-white/[.07] bg-white/[.02]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`badge ${r.priority === "HIGH" ? "badge-red" : r.priority === "MEDIUM" ? "badge-warn" : ""}`}
                  >
                    {r.priority}
                  </span>
                  <span className="text-sm font-semibold">{r.title}</span>
                </div>
                <p className="mt-2 text-xs leading-6 muted">{r.detail}</p>
              </div>
            ))
          ) : (
            <p className="text-sm muted">Nothing needs attention in this window. Clean sheet.</p>
          )}
        </div>
      </div>

      {/* Sales analytics */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="card p-5">
          <h3 className="font-bold">Revenue trend</h3>
          <p className="mt-1 text-xs muted">Completed invoices per day, last {data.period.days} days</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sales.revenue_trend}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c7f36b" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#c7f36b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 10, fill: "#8b9491" }} minTickGap={40} />
                <YAxis tickFormatter={shortMoney} tick={{ fontSize: 10, fill: "#8b9491" }} width={48} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => String(v)}
                  formatter={(value: any, name: any) => [name === "revenue" ? money(Number(value)) : value, name]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#c7f36b" strokeWidth={2} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold">Payment methods</h3>
          <p className="mt-1 text-xs muted">
            {data.sales.guest_sales} walk-in sales without a customer record
          </p>
          {paymentPie.length ? (
            <>
              <div className="mt-4 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentPie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={3}>
                      {paymentPie.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(value: any) => money(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {paymentPie.map((slice, i) => {
                  const row = data.sales.payment_methods[i];
                  return (
                    <div key={slice.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1">{slice.name.replace("_", " ")}</span>
                      <span className="muted">{row.count} sales</span>
                      <span className="font-semibold">{money(row.total)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm muted">No payments in this window yet.</p>
          )}
        </div>
      </div>

      {/* Product performance */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">Product performance</h3>
            <p className="mt-1 text-xs muted">Best sellers combine counter sales and repair issues</p>
          </div>
          <span className="text-[11px] muted">
            {data.products.best_sellers.length} selling · {data.products.slow_movers.length} dormant with stock
          </span>
        </div>
        {data.products.best_sellers.length ? (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.products.best_sellers.slice(0, 8)}>
                <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#8b9491" }} interval={0} height={58} angle={-18} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "#8b9491" }} width={36} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => (name === "units" ? [value, "units sold"] : [money(Number(value)), name])} />
                <Bar dataKey="units" fill="#c7f36b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm muted">No product sales inside this window.</p>
        )}
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>PART</th>
                <th>UNITS</th>
                <th>REVENUE</th>
                <th>GROSS PROFIT</th>
                <th>MARGIN</th>
              </tr>
            </thead>
            <tbody>
              {data.products.best_sellers.map((p) => (
                <tr key={p.product_id}>
                  <td>
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-[10px] muted">{p.sku}</div>
                  </td>
                  <td>{p.units}</td>
                  <td className="text-xs">{money(p.revenue)}</td>
                  <td className={`text-xs ${p.gross_profit < 0 ? "text-red-300" : ""}`}>{money(p.gross_profit)}</td>
                  <td>{p.margin_pct === null ? "—" : `${p.margin_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.products.slow_movers.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <TrendingDown size={17} className="text-amber-300" />
            <h3 className="font-bold">Slow-moving stock (zero movement in 90 days)</h3>
          </div>
          <p className="mt-1 text-xs muted">
            Held units with no sale or repair issue in the last 90 days, regardless of the selected window.
          </p>
          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>PART</th>
                  <th>UNITS ON HAND</th>
                  <th>LAST MOVED</th>
                </tr>
              </thead>
              <tbody>
                {data.products.slow_movers.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-[10px] muted">{p.sku}</div>
                    </td>
                    <td>{p.stock}</td>
                    <td className="text-xs muted">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profitability */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Wrench size={17} className="lime" />
            <h3 className="font-bold">Workshop profitability</h3>
          </div>
          <p className="mt-1 text-xs muted">Closed and ready jobs in the selected window</p>
          <div className="mt-5 space-y-3 text-sm">
            <Row label="Jobs closed" value={String(data.profitability.repairs.jobs_closed)} />
            <Row label="Labour revenue" value={money(data.profitability.repairs.labour_revenue)} />
            <Row label="Parts billed" value={money(data.profitability.repairs.parts_revenue)} />
            <Row label="Parts cost (FIFO)" value={money(data.profitability.repairs.parts_cost)} />
            <Row label="Parts profit" value={money(data.profitability.repairs.parts_profit)} accent />
            <Row label="Total workshop revenue" value={money(data.profitability.repairs.total_revenue)} accent />
            <Row label="Average per job" value={money(data.profitability.repairs.avg_per_job)} />
          </div>
          <p className="mt-5 text-[11px] leading-5 muted">
            Labour carries no material cost, so workshop margin is usually the healthiest number in the garage.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="font-bold">Product margins</h3>
          <p className="mt-1 text-xs muted">
            Top {data.profitability.by_product.length} lines by gross profit (≥ 2 units sold). Selling price minus FIFO cost.
          </p>
          <div className="table-wrap mt-4 max-h-[380px] overflow-y-auto">
            <table>
              <thead>
                <tr>
                  <th>PART</th>
                  <th>UNITS</th>
                  <th>REVENUE</th>
                  <th>COST</th>
                  <th>PROFIT</th>
                  <th>MARGIN</th>
                </tr>
              </thead>
              <tbody>
                {data.profitability.by_product.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-[10px] muted">{p.sku}</div>
                    </td>
                    <td>{p.units}</td>
                    <td className="text-xs">{money(p.revenue)}</td>
                    <td className="text-xs muted">{money(p.cost)}</td>
                    <td className={`text-xs ${p.gross_profit < 0 ? "text-red-300" : ""}`}>{money(p.gross_profit)}</td>
                    <td>
                      <span className={p.margin_pct !== null && p.margin_pct < 15 ? "badge badge-warn" : "badge"}>
                        {p.margin_pct === null ? "—" : `${p.margin_pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data.profitability.by_product.length && (
                  <tr>
                    <td colSpan={6} className="text-sm muted">
                      No costed multi-unit sales in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Customer insights */}
      <div className="card p-5">
        <h3 className="font-bold">Customer insights</h3>
        <p className="mt-1 text-xs muted">
          {data.customers.with_purchases} of {data.customers.total} registered customers bought in this window
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SegmentCard label="Champions" value={data.customers.segments.champions} hint="3+ visits, active in 60 days" tone="lime" />
          <SegmentCard label="New buyers" value={data.customers.segments.new_buyers} hint="First purchase in 30 days" tone="sky" />
          <SegmentCard label="At risk" value={data.customers.segments.at_risk} hint="Repeat buyers gone quiet 60+ days" tone="amber" />
          <SegmentCard label="Dormant" value={data.customers.segments.dormant} hint="No purchase for 150+ days" tone="red" />
        </div>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>TOP CUSTOMER</th>
                <th>PURCHASES</th>
                <th>LIFETIME (WINDOW)</th>
                <th>LAST VISIT</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.top.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[10px] muted">{c.phone || "No phone"}</div>
                  </td>
                  <td>
                    {c.visits}
                    {c.visits >= 2 && <span className="badge ml-2">REPEAT</span>}
                  </td>
                  <td className="text-xs">{money(c.revenue)}</td>
                  <td className="text-xs muted">{c.last_purchase ? new Date(c.last_purchase).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {!data.customers.top.length && (
                <tr>
                  <td colSpan={4} className="text-sm muted">
                    No identified-customer purchases in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Demand analysis & forecast */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="lime" />
              <h3 className="font-bold">Demand analysis &amp; forecast</h3>
            </div>
            <p className="mt-1 text-xs muted">{data.demand.forecast.method}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[.16em] muted">Forecast next month</div>
            <div className="stat text-2xl">{data.demand.forecast.next_month_units} units</div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
              {data.demand.forecast.trend === "rising" ? (
                <TrendingUp size={13} className="text-lime" />
              ) : data.demand.forecast.trend === "falling" ? (
                <TrendingDown size={13} className="text-amber-300" />
              ) : null}
              <span className="capitalize">{data.demand.forecast.trend}</span>
              <span className="muted">·</span>
              <span>
                confidence {data.demand.forecast.confidence.toLowerCase()} (R² {data.demand.forecast.r2})
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.demand.monthly}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: "#8b9491" }} />
              <YAxis yAxisId="units" tick={{ fontSize: 10, fill: "#8b9491" }} width={40} allowDecimals={false} />
              <YAxis yAxisId="revenue" orientation="right" tickFormatter={shortMoney} tick={{ fontSize: 10, fill: "#8b9491" }} width={48} />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: any, name: any) =>
                  value === null ? ["outside window", name] : [name === "units" ? value : money(Number(value)), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="units" dataKey="units" fill="#7dd3fc" radius={[5, 5, 0, 0]} name="units" />
              <Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#c7f36b" strokeWidth={2} name="revenue" dot={{ r: 2 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] muted">
          Bars are monthly FIFO consumption units (full year, always). The revenue line covers only the selected window.
          The forecast excludes the current partial month so an unfinished month never distorts the trend.
        </p>

        {data.demand.by_product.length > 0 && (
          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>PART</th>
                  <th>AVG / MONTH</th>
                  <th>FORECAST / MONTH</th>
                  <th>TREND</th>
                  <th>CONFIDENCE</th>
                  <th>STOCK</th>
                  <th>DAYS COVER</th>
                  <th>SUGGESTED REORDER</th>
                </tr>
              </thead>
              <tbody>
                {data.demand.by_product.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-[10px] muted">{p.sku}</div>
                    </td>
                    <td>{p.avg_monthly_units}</td>
                    <td>{p.forecast_next_month_units}</td>
                    <td>
                      <span className="flex items-center gap-1 text-xs capitalize">
                        {p.trend === "rising" ? (
                          <TrendingUp size={13} className="text-lime" />
                        ) : p.trend === "falling" ? (
                          <TrendingDown size={13} className="text-amber-300" />
                        ) : null}
                        {p.trend}
                      </span>
                    </td>
                    <td>
                      <span className={p.confidence === "Low" ? "badge badge-warn" : "badge"}>
                        {p.confidence}
                        <span className="ml-1 text-[9px] opacity-70">{p.months_of_history}m</span>
                      </span>
                    </td>
                    <td>{p.stock}</td>
                    <td className={p.days_cover !== null && p.days_cover < p.lead_time_days ? "text-red-300 text-xs" : "text-xs"}>
                      {p.days_cover === null ? "∞" : p.days_cover}
                    </td>
                    <td>
                      {p.suggested_reorder > 0 ? (
                        <span className="badge badge-warn">+{p.suggested_reorder}</span>
                      ) : (
                        <span className="text-[11px] muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 border-t border-white/[.06] pt-3 text-[11px] muted">
          Reorder suggestions combine the fitted demand slope with your per-product lead time, safety stock and target
          coverage from the Restocking workspace. Confidence below “Medium” means the history is too short or too noisy to
          trust the number — verify manually before purchasing.
        </p>
      </div>

      {/* Activity follow-up & transparency */}
      {data.activity && (
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="lime" />
            <h3 className="font-bold">Activity follow-up &amp; transparency</h3>
          </div>
          <p className="mt-1 text-xs muted">
            Every action on the platform attributed to its actor and cross-checked against the FIFO ledger — accuracy you can audit.
          </p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {data.activity.checks.map((c) => (
              <div key={c.key} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{c.label}</span>
                  <span className={c.status === "OK" ? "badge" : c.status === "WATCH" ? "badge badge-warn" : "badge badge-red"}>
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] muted leading-5">{c.detail}</p>
              </div>
            ))}
          </div>

          {data.activity.staff_activity.length > 0 && (
            <>
              <div className="tag mt-5">Accountability — who moved the business</div>
              <div className="table-wrap mt-2">
                <table>
                  <thead>
                    <tr>
                      <th>EMPLOYEE</th>
                      <th>SALES</th>
                      <th>SALES VALUE</th>
                      <th>REPAIRS</th>
                      <th>RECEIPTS VALUE</th>
                      <th>EXPENSES</th>
                      <th>ADJUSTMENTS</th>
                      <th>REPORTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.staff_activity.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="text-sm font-semibold">{s.name}</div>
                          <div className="text-[10px] muted">{s.role.toLowerCase()}</div>
                        </td>
                        <td>{s.sales_count}</td>
                        <td>{money(s.sales_revenue)}</td>
                        <td>{s.repairs_received || "—"}</td>
                        <td>{s.receipts_value ? money(s.receipts_value) : "—"}</td>
                        <td>{s.expenses_recorded || "—"}</td>
                        <td className={s.stock_adjustments ? "text-amber-300 text-xs" : "text-xs"}>{s.stock_adjustments || "—"}</td>
                        <td>{s.reports_filed || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {data.activity.shift_reconciliation.length > 0 && (
            <>
              <div className="tag mt-5">Shift reports vs physical ledger — variances</div>
              <div className="table-wrap mt-2">
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>EMPLOYEE</th>
                      <th>REPORTED Δ</th>
                      <th>LEDGER Δ</th>
                      <th>VARIANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.shift_reconciliation.map((r, i) => (
                      <tr key={`${r.date}-${i}`}>
                        <td>{r.date}</td>
                        <td>{r.employee}</td>
                        <td>{r.reported_delta > 0 ? `+${r.reported_delta}` : r.reported_delta}</td>
                        <td>{r.actual_movement > 0 ? `+${r.actual_movement}` : r.actual_movement}</td>
                        <td>
                          <span className={Math.abs(r.variance) > 5 ? "badge badge-red" : "badge badge-warn"}>
                            {r.variance > 0 ? `+${r.variance}` : r.variance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] muted">
                Reported = closing minus opening stock; ledger = actual FIFO movements that day. Shared shifts or mid-day
                receipts explain small gaps — large variances deserve a physical count.
              </p>
            </>
          )}

          <div className="tag mt-5">Latest activity</div>
          <div className="table-wrap mt-2">
            <table>
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>TYPE</th>
                  <th>REFERENCE</th>
                  <th>WHO</th>
                  <th>DETAIL</th>
                  <th className="text-right">VALUE</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.stream.slice(0, 30).map((a, i) => (
                  <tr key={`${a.ts}-${i}`}>
                    <td className="whitespace-nowrap text-[11px] muted">
                      {new Date(a.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <span className="pill !py-0.5 text-[10px]">
                        <ScrollText size={11} className="mr-1 inline opacity-70" />
                        {a.type.replace("_", " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate text-xs">{a.ref}</td>
                    <td className="text-xs">{a.actor}</td>
                    <td className="max-w-[220px] truncate text-[11px] muted">{a.detail}</td>
                    <td className="whitespace-nowrap text-right text-xs">{a.amount === null ? "—" : money(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 border-t border-white/[.06] pt-3 text-[11px] muted">
            This stream is read live from the same tables every workspace writes through RLS-guarded APIs — it cannot be
            edited from the UI, so it is an honest follow-up trail for sales, repairs, receiving, purchasing, expenses,
            imports, catalogue approvals, portal activity and shift reports.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs muted">{label}</span>
      <span className={accent ? "font-bold text-lime" : "font-semibold"}>{value}</span>
    </div>
  );
}

function SegmentCard({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  const tones: Record<string, string> = {
    lime: "text-lime",
    sky: "text-sky-300",
    amber: "text-amber-300",
    red: "text-red-300",
  };
  return (
    <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[.14em] muted">
        <span>{label}</span>
        <span className={tones[tone] || "text-lime"}>●</span>
      </div>
      <div className="stat mt-2 text-2xl">{value}</div>
      <div className="mt-1 text-[10px] muted">{hint}</div>
    </div>
  );
}
