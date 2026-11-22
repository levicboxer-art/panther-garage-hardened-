"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCw, X } from "lucide-react";

type InvoiceItem = {
  product_id: string | null;
  product_name: string;
  sku: string;
  item_type?: "STOCK" | "USED_NONSTOCK";
  quantity: number;
  unit_price: number;
  effective_unit_price: number;
  current_stock: number | null;
  unit_cost?: number | null;
  gross_profit?: number | null;
};
type Invoice = {
  id: string;
  invoice_number: string;
  payment_method: string;
  total: number;
  balance_due: number;
  created_at: string;
  seller?: { full_name: string } | null;
  service_performed?: boolean;
  service_fee?: number;
  mechanic_name?: string | null;
  registration_number?: string | null;
  service_notes?: string | null;
  customers: { full_name: string; phone: string | null } | null;
  sale_items: InvoiceItem[];
};
type SaleAlert = {
  id: string;
  title: string;
  message: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

const money = (n: number) => new Intl.NumberFormat("en-RW", {
  style: "currency",
  currency: "RWF",
  maximumFractionDigits: 0,
}).format(n);
const paymentLabel: Record<string, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CREDIT: "Credit / partial",
};

async function readJsonResponse(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function RecentInvoicesWorkspace({ role }: { role: "BOSS" | "EMPLOYEE" }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [alerts, setAlerts] = useState<SaleAlert[]>([]);
  const [isBoss, setIsBoss] = useState(role === "BOSS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [salesResult, noticeResult] = await Promise.allSettled([
        fetch("/api/sales", { cache: "no-store" }),
        fetch("/api/notifications?category=SALE&unread=true", { cache: "no-store" }),
      ]);

      if (salesResult.status === "fulfilled") {
        const salesData = await readJsonResponse(salesResult.value);
        if (salesResult.value.ok) {
          setInvoices(Array.isArray(salesData.sales) ? salesData.sales : []);
          setIsBoss(Boolean(salesData.is_boss));
          setError("");
        } else {
          setError(salesData.error || "Could not load recent invoices.");
        }
      } else {
        setError("Could not connect to load recent invoices. Please try again.");
      }

      if (noticeResult.status === "fulfilled" && noticeResult.value.ok) {
        const noticeData = await readJsonResponse(noticeResult.value);
        setAlerts((Array.isArray(noticeData.notifications) ? noticeData.notifications : []).filter((item: SaleAlert) =>
          item.category === "SALE" && item.entity_type === "SALE" && !item.read_at,
        ));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function dismiss(alertId: string) {
    setDismissing(alertId);
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: alertId }),
    });
    setDismissing(null);
    if (response.ok) setAlerts((current) => current.filter((item) => item.id !== alertId));
    else await load();
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="tag">PANTHER GARAGE · SALES RECORD</div>
        <h2 className="text-xl font-bold mt-2">Recent invoices</h2>
        <p className="muted text-xs mt-1">All completed sales, payment method, sold-part prices and live stock remaining.</p>
      </div>
      <button onClick={() => { setLoading(true); void load(); }} className="btn btn-ghost text-xs"><RefreshCw size={14}/> Refresh</button>
    </div>

    {alerts.map((alert) => <div key={alert.id} className="card border-lime/40 bg-lime/5 p-4 flex items-start gap-3" role="alert">
      <span className="w-9 h-9 rounded-lg bg-lime/10 text-lime grid place-items-center shrink-0"><Bell size={17}/></span>
      <div className="min-w-0 flex-1">
        <div className="tag">SALE MADE · FOLLOW UP</div>
        <p className="font-semibold text-sm mt-1">{alert.title}</p>
        <p className="muted text-xs mt-1">{alert.message}</p>
        <p className="muted text-[10px] mt-2">{new Date(alert.created_at).toLocaleString()}</p>
      </div>
      <button disabled={dismissing === alert.id} onClick={() => void dismiss(alert.id)} className="btn btn-ghost p-2" aria-label="Dismiss sale notification" title="Dismiss"><X size={16}/></button>
    </div>)}

    {error && <div className="card p-3 text-sm text-red-300">{error}</div>}
    <div className="card">
      <div className="p-5 flex items-center justify-between gap-3">
        <div><h3 className="font-bold">Invoice history</h3><p className="muted text-xs mt-1">Per-part sale price after allocated invoice discount; current quantity is shared across staff.</p></div>
        <span className="muted text-xs shrink-0">Latest 100</span>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>INVOICE / DATE</th><th>SOLD BY / SERVICE</th><th>SOLD PARTS · QTY · SALE PRICE · STOCK</th>{isBoss && <th>PURCHASE COST · GROSS PROFIT</th>}<th>PAYMENT</th><th>CUSTOMER</th><th>TOTAL</th><th>BALANCE</th></tr></thead>
        <tbody>{invoices.map((invoice) => <tr key={invoice.id}>
          <td><div className="font-semibold">{invoice.invoice_number}</div><div className="muted text-xs mt-1">{new Date(invoice.created_at).toLocaleString()}</div></td>
          <td><div className="font-semibold text-xs">{invoice.seller?.full_name || "Staff member"}</div>{invoice.service_performed && <div className="mt-2 min-w-[150px] text-[11px]"><div className="lime">Service fee: {money(Number(invoice.service_fee || 0))}</div><div className="muted">Mechanic: {invoice.mechanic_name || "—"}</div><div className="muted">Plate: {invoice.registration_number || "—"}</div>{invoice.service_notes && <div className="muted mt-1">{invoice.service_notes}</div>}</div>}</td>
          <td><div className="space-y-2">{(invoice.sale_items || []).map((item, index) => <div key={`${invoice.id}-${item.product_id}-${index}`} className="min-w-[230px]">
            <div className="font-semibold text-xs">{item.product_name} <span className="muted">· {item.item_type === "USED_NONSTOCK" ? "Used · non-stock" : item.sku}</span></div>
            <div className="text-[11px] muted">{item.quantity} sold · {money(Number(item.effective_unit_price))} / unit</div>
            <div className="text-[11px]">{item.item_type === "USED_NONSTOCK" ? <b className="muted">Not tracked in inventory</b> : <>Remaining stock: <b className={item.current_stock === 0 ? "text-amber-300" : "lime"}>{item.current_stock == null ? "Unavailable" : `${item.current_stock} units`}</b></>}</div>
          </div>)}</div></td>
          {isBoss && <td><div className="space-y-2">{(invoice.sale_items || []).map((item, index) => <div key={`${invoice.id}-profit-${item.product_id}-${index}`} className="min-w-[180px]">
            <div className="text-[11px] muted">{item.unit_cost == null ? "Cost not recorded" : `${money(Number(item.unit_cost))} / unit ${item.item_type === "USED_NONSTOCK" ? "recorded" : "FIFO"}`}</div>
            <div className="text-xs">Gross profit: {item.gross_profit == null ? <b className="text-amber-200">Unknown</b> : <b className={Number(item.gross_profit) >= 0 ? "lime" : "text-red-300"}>{money(Number(item.gross_profit))}</b>}</div>
          </div>)}</div></td>}
          <td>{paymentLabel[invoice.payment_method] || invoice.payment_method}</td>
          <td>{invoice.customers?.full_name || "Walk-in"}</td>
          <td>{money(Number(invoice.total))}</td>
          <td className={Number(invoice.balance_due) > 0 ? "text-amber-300" : "lime"}>{money(Number(invoice.balance_due))}</td>
        </tr>)}</tbody>
      </table>{!invoices.length && !loading && !error && <p className="p-5 muted text-sm">No invoices have been issued yet.</p>}</div>
      {isBoss && <p className="px-5 pb-4 text-[11px] muted">Gross profit is sale revenue after allocated invoice discount minus FIFO purchase cost. It excludes overhead, tax and other operating expenses.</p>}
    </div>
    {loading && <p className="muted text-xs">Loading live invoices…</p>}
    <p className="muted text-[10px]">Signed in as {role === "BOSS" ? "Boss" : "Employee"}{!isBoss && role === "BOSS" ? " · cost details unavailable" : ""}.</p>
  </div>;
}
