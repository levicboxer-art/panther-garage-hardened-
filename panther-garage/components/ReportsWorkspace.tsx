"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, FileBarChart, FileSpreadsheet, FileText, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

type Role = "BOSS" | "EMPLOYEE";
type Category = "complete" | "financial" | "sales" | "inventory" | "payments" | "repairs" | "expenses" | "customers";
type Format = "pdf" | "xlsx";

const money = (value: unknown) => value === null || value === undefined ? "Not available" : new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
const date = (value: Date) => value.toISOString().slice(0, 10);
function rangeFor(preset: string) {
  const end = new Date(`${today()}T00:00:00Z`);
  const start = new Date(end);
  if (preset === "today") return { from: today(), to: today() };
  if (preset === "week") { const day = end.getUTCDay(); start.setUTCDate(end.getUTCDate() - (day === 0 ? 6 : day - 1)); }
  if (preset === "month") start.setUTCDate(1);
  if (preset === "last_month") { start.setUTCMonth(end.getUTCMonth() - 1, 1); end.setUTCDate(0); }
  if (preset === "quarter") { start.setUTCMonth(Math.floor(end.getUTCMonth() / 3) * 3, 1); }
  if (preset === "year") start.setUTCMonth(0, 1);
  return { from: date(start), to: date(end) };
}

export default function ReportsWorkspace({ role }: { role: Role }) {
  const initial = rangeFor("month");
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [category, setCategory] = useState<Category>("complete");
  const [format, setFormat] = useState<Format>("xlsx");
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const periodLabel = useMemo(() => `${from} → ${to}`, [from, to]);
  function selectPreset(value: string) { setPreset(value); if (value !== "custom") { const next = rangeFor(value); setFrom(next.from); setTo(next.to); } }
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/business-reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&category=${category}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not generate the report.");
      setReport(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not generate the report."); }
    finally { setBusy(false); }
  }
  async function download() {
    setExporting(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/business-reports/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&category=${category}&format=${format}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Could not prepare the export."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `panther-legacy-garage-${category}-${from}-to-${to}.${format}`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); setNotice(`${format === "xlsx" ? "Excel" : "PDF"} report downloaded.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not prepare the export."); }
    finally { setExporting(false); }
  }

  if (role !== "BOSS") return <div className="card border-amber-300/30 p-6"><div className="flex items-center gap-2 text-amber-200"><AlertTriangle size={18} /> <b>Business reports are restricted to the BOSS account.</b></div><p className="muted mt-2 text-sm">Employees can continue using the operational workspaces. Owner-level financial calculations and exports are not exposed to employee accounts.</p></div>;

  const kpis = report?.executive_summary || {};
  return <div className="space-y-5">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="tag flex items-center gap-2"><FileBarChart size={14} /> OWNER REPORTING</div><h2 className="mt-2 text-2xl font-bold">Business Reports</h2><p className="muted mt-1 max-w-2xl text-sm">Actual recorded PGMS transactions only. Profit is withheld when verified FIFO cost data is incomplete.</p></div>
        <span className="badge">BOSS · RWF</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs muted">Reporting period<select className="field mt-1" value={preset} onChange={(e) => selectPreset(e.target.value)}><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="last_month">Last Month</option><option value="quarter">This Quarter</option><option value="year">This Year</option><option value="custom">Custom Range</option></select></label>
        <label className="text-xs muted">Start date<input className="field mt-1" type="date" value={from} max={to} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} /></label>
        <label className="text-xs muted">End date<input className="field mt-1" type="date" value={to} min={from} max={today()} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} /></label>
        <label className="text-xs muted">Report category<select className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value as Category)}><option value="complete">Complete Business Report</option><option value="financial">Financial Report</option><option value="sales">Sales Report</option><option value="inventory">Inventory Report</option><option value="payments">Payment Report</option><option value="repairs">Repair Report</option><option value="expenses">Expense Report</option><option value="customers">Customer Report</option></select></label>
        <label className="text-xs muted">Export format<select className="field mt-1" value={format} onChange={(e) => setFormat(e.target.value as Format)}><option value="xlsx">Professional Excel (.xlsx)</option><option value="pdf">PDF</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-primary text-xs" onClick={() => void generate()} disabled={busy}><RefreshCw size={14} />{busy ? "Generating…" : "Generate Report"}</button><button className="btn btn-ghost text-xs" onClick={() => void download()} disabled={exporting}><Download size={14} />{exporting ? "Preparing Excel…" : format === "xlsx" && (preset === "month" || preset === "last_month") ? "Download Month Excel" : format === "xlsx" ? "Download Excel" : "Download PDF"}</button></div>
      {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}{notice && <p className="mt-3 text-sm text-lime" role="status">{notice}</p>}
    </div>

    {report && <>
      <div className="card p-5"><div className="flex flex-wrap justify-between gap-2"><div><div className="tag">EXECUTIVE SUMMARY</div><h3 className="mt-1 text-xl font-bold">{report.meta.business_name}</h3></div><div className="text-right text-xs muted">{periodLabel}<br />Generated {new Date(report.meta.generated_at).toLocaleString()}</div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Sales revenue", kpis.total_sales_revenue, TrendingUp], ["Successful payments", kpis.total_successful_payments_collected, FileText], ["Customer balances", kpis.outstanding_customer_balances, AlertTriangle], ["Cost of goods sold", kpis.total_cost_of_goods_sold, FileSpreadsheet], ["Gross profit", kpis.gross_profit, TrendingUp], ["Operating expenses", kpis.total_operating_expenses, FileText], ["Net operating result", kpis.net_operating_result, TrendingUp], ["Stock purchase value", kpis.total_stock_purchase_value, FileSpreadsheet], ["Potential stock sales", kpis.estimated_potential_sales_value, TrendingUp], ["Completed repairs", kpis.total_completed_repairs, FileText], ["Pending repairs", kpis.total_pending_repairs, AlertTriangle], ["Products in stock", kpis.total_products_in_stock, FileSpreadsheet]].map(([label, value, Icon]: any) => <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4" key={label}><div className="flex items-center justify-between text-xs muted"><span>{label}</span><Icon size={15} className="lime" /></div><div className="stat mt-2 text-xl">{typeof value === "number" && !String(label).includes("repairs") && !String(label).includes("Products") ? money(value) : value ?? "Not available"}</div><div className="mt-1 text-[10px] muted">{value === null ? "Not available – incomplete cost data" : report.meta.from + " to " + report.meta.to}</div></div>)}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[.08] p-4 text-sm">Revenue change: <b className={kpis.revenue_change_pct !== null && kpis.revenue_change_pct < 0 ? "text-red-300" : "lime"}>{kpis.revenue_change_pct === null ? "No comparable previous period" : `${kpis.revenue_change_pct >= 0 ? "+" : ""}${kpis.revenue_change_pct}%`}</b></div><div className="rounded-xl border border-white/[.08] p-4 text-sm">Expense change: <b className={kpis.expense_change_pct !== null && kpis.expense_change_pct > 0 ? "text-amber-200" : "lime"}>{kpis.expense_change_pct === null ? "No comparable previous period" : `${kpis.expense_change_pct >= 0 ? "+" : ""}${kpis.expense_change_pct}%`}</b></div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2"><div className="card p-5"><h3 className="font-bold">Financial performance</h3><div className="mt-4 space-y-2 text-sm">{Object.entries(report.financial).filter(([key]) => key !== "note").map(([key, value]) => <div className="flex justify-between gap-4 border-b border-line py-2" key={key}><span className="muted capitalize">{key.replaceAll("_", " ")}</span><b>{typeof value === "number" ? money(value) : value === null ? "Not available – incomplete cost data" : String(value)}</b></div>)}</div><p className="muted mt-4 text-xs">{report.financial.note}</p></div><div className="card p-5"><h3 className="font-bold">Management insights</h3><div className="mt-4 space-y-3">{report.insights.length ? report.insights.map((item: any, index: number) => <div className={`rounded-xl border p-3 ${item.severity === "RED" ? "border-red-300/30 bg-red-300/5" : "border-amber-300/25 bg-amber-300/5"}`} key={index}><div className="flex gap-2 text-sm font-semibold"><span className="badge">{item.severity}</span>{item.issue}</div><p className="muted mt-2 text-xs">Metric: {item.metric}. Recommended action: {item.recommended_action}</p></div>) : <p className="muted text-sm">No alerts were generated for this period.</p>}</div></div></div>

      <div className="card p-5"><h3 className="font-bold">Data availability</h3><div className="mt-3 grid gap-2 text-xs muted sm:grid-cols-3"><p>{report.availability.profit}</p><p>{report.availability.payments}</p><p>{report.availability.repair_payments}</p></div></div>
    </>}
  </div>;
}
