"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, TrendingUp, Wallet, Package, Wrench, ShoppingBag, AlertTriangle } from "lucide-react";

type Props = { role: "BOSS" | "EMPLOYEE" };
type ExportTarget = "month" | "all";

const money = (amount: number) => new Intl.NumberFormat("en-RW", {
  style: "currency",
  currency: "RWF",
  maximumFractionDigits: 0,
}).format(amount || 0);

function currentUtcMonth() {
  return new Date().toISOString().slice(0, 7);
}

function latestCompletedUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function monthReportLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function monthReportFilename(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .toLowerCase();
  return `panther-legacy-garage-${monthName}-${year}-report.csv`;
}

export default function ReportsWorkspace({ role }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reportMonth, setReportMonth] = useState(latestCompletedUtcMonth);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reports?from=${from}&to=${to}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not load reports.");
        return;
      }
      setData(result);
    } catch {
      setError("Could not load reports. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function downloadReport(target: ExportTarget) {
    if (target === "month" && !reportMonth) return;
    setExporting(target);
    setExportError("");
    setExportMessage("");
    try {
      const query = target === "all" ? "period=all" : `month=${encodeURIComponent(reportMonth)}`;
      const response = await fetch(`/api/reports/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setExportError(result.error || "The CSV report could not be downloaded.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = target === "all" ? "panther-legacy-garage-all-history-report.csv" : monthReportFilename(reportMonth);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
      setExportMessage(target === "all" ? "All-history event report downloaded." : `${monthReportLabel(reportMonth)} event report downloaded.`);
    } catch {
      setExportError("The CSV report could not be downloaded. Check the connection and try again.");
    } finally {
      setExporting(null);
    }
  }

  const metric = (label: string, value: string, sub: string, Icon: any) => (
    <div className="card p-5">
      <div className="flex justify-between text-xs muted"><span>{label}</span><Icon size={17} className="lime" /></div>
      <div className="stat text-xl mt-3">{value}</div>
      <div className="text-[11px] muted mt-2">{sub}</div>
    </div>
  );

  return <div className="space-y-5">
    <div className="card p-5">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h3 className="font-bold">Business performance</h3>
          <p className="text-xs muted mt-1">Reports are calculated from recorded transactions for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs muted">From<input className="field mt-1" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-xs muted">To<input className="field mt-1" type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label>
          <button className="btn btn-primary text-xs" onClick={() => void load()} disabled={busy}><RefreshCw size={14} />{busy ? "Loading…" : "Generate"}</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-300 mt-4" role="alert">{error}</p>}

      {role === "BOSS" && <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div className="max-w-xl">
            <h4 className="font-semibold text-sm">Download event ledger</h4>
            <p className="text-xs muted mt-1">Download one chronological CSV for the selected calendar month. Each recorded event is a separate row with a readable category, status, reference and event details; transactions, workshop, inventory, purchasing, reports, audit history and business alerts are included. Staff chat is excluded.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs muted">Report month<input className="field mt-1" type="month" value={reportMonth} min="2000-01" max={currentUtcMonth()} onChange={(event) => setReportMonth(event.target.value)} /></label>
            <button className="btn btn-ghost text-xs" onClick={() => void downloadReport("month")} disabled={!!exporting || !reportMonth}>
              <Download size={14} />{exporting === "month" ? "Preparing…" : "Download month CSV"}
            </button>
            <button className="btn btn-primary text-xs" onClick={() => void downloadReport("all")} disabled={!!exporting}>
              <Download size={14} />{exporting === "all" ? "Preparing…" : "Download all history"}
            </button>
          </div>
        </div>
        {exportError && <p className="text-sm text-red-300 mt-3" role="alert">{exportError}</p>}
        {exportMessage && <p className="text-xs text-lime mt-3" role="status">{exportMessage}</p>}
      </div>}
    </div>

    {data && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {metric("Sales completed", String(data.operations.sales_count), "Completed invoices", TrendingUp)}
        {metric("Repairs received", String(data.operations.repairs_received), `${data.operations.repairs_open} currently open`, Wrench)}
        {metric("Active products", String(data.inventory.active_products), `${data.inventory.units_on_hand} units on hand`, Package)}
        {metric("Low-stock products", String(data.inventory.low_stock), "At or below minimum quantity", AlertTriangle)}
      </div>

      {role === "BOSS" && data.finance && <>
        <h3 className="font-bold">Financial summary <span className="text-xs muted font-normal">· RWF</span></h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {metric("Sales revenue", money(data.finance.revenue), "Completed sales value", TrendingUp)}
          {metric("Payments collected", money(data.finance.collected), "Cash received against sales", Wallet)}
          {metric("Approved expenses", money(data.finance.approved_expenses), "Approved operating expenses", Wallet)}
          {metric("Customer balances", money(data.finance.customer_balance), "Outstanding customer amounts", AlertTriangle)}
          {metric("Pending expenses", money(data.finance.pending_expenses), "Awaiting boss review", AlertTriangle)}
          {metric("Purchase order value", money(data.finance.purchase_order_value), "Non-cancelled orders created in period", ShoppingBag)}
          {metric("Supplier invoice outstanding", money(data.finance.supplier_invoice_outstanding), "Balances on invoices created in period", Wallet)}
          {metric("Repairs completed", String(data.operations.repairs_completed), "Ready or collected repair jobs", Wrench)}
        </div>
        <div className="card p-5">
          <h3 className="font-bold mb-3">Sales by payment method</h3>
          {data.sales_by_method.length ? data.sales_by_method.map((item: any) => (
            <div key={item.method} className="flex justify-between py-2 border-b border-line text-sm"><span>{item.method.replaceAll("_", " ")}</span><b>{money(item.total)}</b></div>
          )) : <p className="muted text-sm">No completed sales in this period.</p>}
        </div>
        <div className="card p-5">
          <h3 className="font-bold mb-3">Recent completed invoices</h3>
          <div className="table-wrap"><table><thead><tr><th>INVOICE</th><th>DATE</th><th>TOTAL</th><th>COLLECTED</th><th>BALANCE</th></tr></thead><tbody>
            {data.recent_sales.map((sale: any) => <tr key={sale.id}><td>{sale.invoice_number}</td><td>{new Date(sale.created_at).toLocaleDateString()}</td><td>{money(sale.total)}</td><td>{money(sale.amount_paid)}</td><td>{money(sale.balance_due)}</td></tr>)}
          </tbody></table>{!data.recent_sales.length && <p className="muted p-4 text-sm">No invoices recorded in this period.</p>}</div>
        </div>
      </>}

      <div className="card p-5">
        <h3 className="font-bold mb-3">Low-stock review</h3>
        {data.inventory.low_stock_products.length ? data.inventory.low_stock_products.map((product: any) => (
          <div key={product.sku} className="flex justify-between items-center border-b border-line py-3 text-sm">
            <div><b>{product.name}</b><div className="text-xs muted">{product.sku}</div></div>
            <span className="badge badge-warn">{product.stock} / min {product.minimum_stock}</span>
          </div>
        )) : <p className="muted text-sm">No products currently meet the low-stock condition.</p>}
      </div>
    </>}
  </div>;
}
