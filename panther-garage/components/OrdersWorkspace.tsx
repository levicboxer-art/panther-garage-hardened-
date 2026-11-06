"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Phone,
  ReceiptText,
  RefreshCw,
  Truck,
  UserCheck,
  XCircle,
} from "lucide-react";

type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  available_stock: number;
  sufficient: boolean;
};

type Invoice = {
  id: string;
  invoice_number: string;
  payment_method: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  created_at: string;
};

type Order = {
  id: string;
  order_reference: string;
  customer_name: string;
  phone: string;
  email: string | null;
  delivery_note: string | null;
  status: string;
  total: number;
  created_at: string;
  updated_at: string | null;
  can_fulfil: boolean;
  shortage_count: number;
  invoice: Invoice | null;
  customer_order_items: OrderItem[];
};

const PAYMENT_METHODS = [
  { code: "CASH", label: "Cash" },
  { code: "MOBILE_MONEY", label: "Mobile money" },
  { code: "BANK_TRANSFER", label: "Bank transfer" },
  { code: "CARD", label: "Card" },
  { code: "CREDIT", label: "Credit (pay on collection)" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

const paymentLabel = (code: string) =>
  PAYMENT_METHODS.find((method) => method.code === code)?.label || code;

function statusClass(status: string) {
  if (status === "FULFILLED") return "badge";
  if (status === "CANCELLED") return "badge";
  if (status === "CONFIRMED") return "badge";
  return "badge badge-warn";
}

export default function OrdersWorkspace() {
  const [rows, setRows] = useState<Order[]>([]);
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load orders.");
      setRows(payload.orders || []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }

  async function update(id: string, status: string, paymentMethod?: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, payment_method: paymentMethod }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update order.");
      setNotice(
        status === "FULFILLED"
          ? "Stock issued and invoice created."
          : status === "CONFIRMED"
            ? "Order confirmed. Fulfil it to issue stock."
            : status === "CANCELLED"
              ? "Order cancelled. No stock was issued."
              : "Order updated."
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update order.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const openOrders = rows.filter((order) => order.status !== "FULFILLED" && order.status !== "CANCELLED");

  return (
    <div className="card">
      <div className="p-5 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-bold">Online spare-parts orders</h3>
          <p className="text-xs muted mt-1">
            Guest orders from the public catalogue. Fulfilling an order creates an invoice and issues
            stock using FIFO; nothing is reserved before that.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs muted">
            Open orders: <b className="lime">{openOrders.length}</b>
          </span>
          <button onClick={load} className="btn btn-ghost text-xs" disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-5 mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mx-5 mb-3 rounded-lg border border-lime/30 bg-lime/10 px-3 py-2 text-sm text-lime">
          {notice}
        </p>
      )}

      <div className="divide-y divide-line">
        {rows.map((order) => {
          const busyOrder = busy === order.id;
          return (
            <article key={order.id} className="p-5 grid lg:grid-cols-[1fr_320px] gap-5">
              <div>
                <div className="flex flex-wrap gap-2 items-center">
                  <b>{order.customer_name}</b>
                  <span className="badge">{order.order_reference}</span>
                  <span className={statusClass(order.status)}>{order.status}</span>
                  {order.shortage_count > 0 && order.status !== "FULFILLED" && order.status !== "CANCELLED" && (
                    <span className="badge badge-warn flex items-center gap-1">
                      <AlertTriangle size={12} /> Not enough stock
                    </span>
                  )}
                </div>

                <div className="text-xs muted mt-2 flex flex-wrap gap-4">
                  <span className="flex gap-1 items-center">
                    <Phone size={12} /> {order.phone}
                  </span>
                  {order.email && <span>{order.email}</span>}
                </div>

                <div className="mt-3 space-y-2">
                  {order.customer_order_items.map((item) => (
                    <div key={item.id} className="text-sm">
                      <p>
                        <Package size={12} className="inline mr-2 lime" />
                        {item.product_name} ({item.sku}) × {item.quantity} ·{" "}
                        {money(Number(item.line_total))}
                      </p>
                      <p className={`text-[11px] ml-5 ${item.sufficient ? "muted" : "text-amber-300"}`}>
                        {item.available_stock} in stock
                      </p>
                    </div>
                  ))}
                </div>

                {order.delivery_note && (
                  <p className="text-xs muted mt-3">Note: {order.delivery_note}</p>
                )}

                <p className="font-bold lime mt-3">{money(Number(order.total))}</p>

                {order.status === "FULFILLED" && order.invoice && (
                  <div className="mt-3 rounded-xl border border-line p-3 text-xs grid gap-1">
                    <p className="flex flex-wrap gap-2 items-center">
                      <ReceiptText size={13} />
                      <span className="muted">Invoice</span>
                      <b>{order.invoice.invoice_number}</b>
                      <span className="badge">{paymentLabel(order.invoice.payment_method)}</span>
                    </p>
                    <p>
                      <span className="muted">Paid</span> {money(Number(order.invoice.amount_paid))} ·{" "}
                      <span className="muted">Balance due</span> {money(Number(order.invoice.balance_due))}
                    </p>
                  </div>
                )}

                <p className="text-[10px] muted mt-3">
                  Created {new Date(order.created_at).toLocaleString()}
                </p>
              </div>

              <div className="grid content-start gap-2">
                {order.status === "PENDING" && (
                  <button
                    className="btn btn-ghost text-xs"
                    disabled={busyOrder}
                    onClick={() => void update(order.id, "CONTACTED")}
                  >
                    <UserCheck size={14} /> Mark contacted
                  </button>
                )}

                {(order.status === "PENDING" || order.status === "CONTACTED") && (
                  <button
                    className="btn text-xs"
                    disabled={busyOrder}
                    onClick={() => void update(order.id, "CONFIRMED")}
                  >
                    <CheckCircle2 size={14} /> Confirm order
                  </button>
                )}

                {order.status === "CONFIRMED" && (
                  <div className="rounded-xl border border-line p-3 grid gap-2">
                    <label className="text-xs muted">
                      Payment method
                      <select
                        className="field mt-1"
                        value={methods[order.id] || "CREDIT"}
                        onChange={(event) =>
                          setMethods((current) => ({ ...current, [order.id]: event.target.value }))
                        }
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.code} value={method.code}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="btn text-xs"
                      disabled={busyOrder || !order.can_fulfil}
                      onClick={() =>
                        void update(order.id, "FULFILLED", methods[order.id] || "CREDIT")
                      }
                    >
                      <Truck size={14} /> Fulfil and issue stock
                    </button>

                    {!order.can_fulfil && (
                      <p className="text-[11px] text-amber-300">
                        This order is short of stock. Add stock before fulfilling it.
                      </p>
                    )}
                    <p className="text-[10px] muted">
                      Creates an invoice and issues stock using FIFO. The invoice uses the current
                      confirmed prices.
                    </p>
                  </div>
                )}

                {(order.status === "PENDING" ||
                  order.status === "CONTACTED" ||
                  order.status === "CONFIRMED") && (
                  <button
                    className="btn btn-ghost text-xs"
                    disabled={busyOrder}
                    onClick={() => void update(order.id, "CANCELLED")}
                  >
                    <XCircle size={14} /> Cancel order
                  </button>
                )}

                {order.status === "FULFILLED" && (
                  <p className="text-xs muted flex gap-1 items-center">
                    <CheckCircle2 size={12} /> Stock issued and invoice created
                  </p>
                )}
                {order.status === "CANCELLED" && (
                  <p className="text-xs muted flex gap-1 items-center">
                    <XCircle size={12} /> Cancelled. No stock issued.
                  </p>
                )}
              </div>
            </article>
          );
        })}
        {!loading && !rows.length && (
          <p className="p-8 text-center text-sm muted">No online orders yet.</p>
        )}
        {loading && <p className="p-8 text-center text-sm muted">Loading orders…</p>}
      </div>
    </div>
  );
}
