"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Save, Info } from "lucide-react";

type Recommendation = {
  id: string; name: string; sku: string; category: string | null; stock: number;
  minimum_stock: number; lead_time_days: number; safety_stock: number; target_stock_days: number;
  demand_units_90d: number; demand_events_90d: number; average_daily_demand: number;
  reorder_point: number; target_stock: number; suggested_order_quantity: number | null;
  confidence: "USABLE" | "LIMITED" | "NO_HISTORY"; needs_review: boolean;
};
type Props = { role: "BOSS" | "EMPLOYEE" };
const number = (n: number) => new Intl.NumberFormat("en-RW", { maximumFractionDigits: 2 }).format(n || 0);

export default function RestockingWorkspace({ role }: Props) {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { lead: string; safety: string; target: string }>>({});

  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/restocking", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load restocking analysis.");
      setItems(data.recommendations || []);
      setDrafts(Object.fromEntries((data.recommendations || []).map((p: Recommendation) => [p.id, { lead: String(p.lead_time_days), safety: String(p.safety_stock), target: String(p.target_stock_days) }])));
    } catch (e: any) { setError(e.message || "Could not load restocking analysis."); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(product: Recommendation) {
    const draft = drafts[product.id]; if (!draft) return;
    setSaving(product.id); setError(""); setNotice("");
    const response = await fetch("/api/restocking", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, supplier_lead_time_days: Number(draft.lead), safety_stock: Number(draft.safety), target_stock_days: Number(draft.target) }) });
    const data = await response.json(); setSaving(null);
    if (!response.ok) { setError(data.error || "Could not save settings."); return; }
    setNotice(`${product.name}: restocking settings saved.`); await load();
  }

  const visible = useMemo(() => items.filter(p => `${p.name} ${p.sku} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const reviewCount = items.filter(p => p.needs_review).length;
  const reliableCount = items.filter(p => p.suggested_order_quantity !== null && p.suggested_order_quantity > 0).length;

  return <div className="space-y-5">
    <div className="card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Smart restocking analysis</h3><p className="text-xs muted mt-1">Demand is calculated from recorded sales and repair-part issues over the last 90 days.</p></div><button className="btn btn-primary text-xs" onClick={load} disabled={busy}><RefreshCw size={14}/>{busy ? "Analysing…" : "Refresh analysis"}</button></div>
      <div className="grid sm:grid-cols-3 gap-3 mt-5"><div className="rounded-xl border border-line p-4"><div className="text-xs muted">Active products analysed</div><div className="stat text-2xl mt-2">{items.length}</div></div><div className="rounded-xl border border-line p-4"><div className="text-xs muted">Need restock review</div><div className="stat text-2xl mt-2">{reviewCount}</div></div><div className="rounded-xl border border-line p-4"><div className="text-xs muted">Usable quantity suggestions</div><div className="stat text-2xl mt-2">{reliableCount}</div></div></div>
      <div className="mt-4 flex gap-2 items-start text-xs muted"><Info size={15} className="shrink-0 mt-0.5"/><p>Formula: reorder point = average daily demand × supplier lead time + safety stock. Suggested quantity aims to cover the supplier lead time plus the configured stock coverage after delivery. Recommendations are decision support—not automatic purchase orders.</p></div>
      {error && <p role="alert" className="text-sm text-red-300 mt-4">{error}</p>}{notice && <p className="text-sm text-lime-300 mt-4">{notice}</p>}
    </div>
    <div className="card"><div className="p-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Product recommendations</h3><p className="text-xs muted mt-1">Review urgent items first; limited history is clearly flagged.</p></div><input className="field max-w-xs" placeholder="Search product or SKU…" value={search} onChange={e => setSearch(e.target.value)}/></div>
      {busy ? <p className="p-6 text-sm muted">Calculating demand and stock positions…</p> : <div className="divide-y divide-line">{visible.map(p => <div key={p.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><b>{p.name}</b>{p.needs_review ? <span className="badge badge-warn">Review restock</span> : <span className="badge">Stock healthy</span>}</div><div className="text-xs muted mt-1">{p.sku} · {p.category || "Uncategorised"}</div></div><div className="text-right"><div className="text-xs muted">Current stock</div><div className="stat text-xl">{number(p.stock)}</div></div></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4"><div><div className="text-[11px] muted">Avg. daily demand</div><b>{number(p.average_daily_demand)} units</b></div><div><div className="text-[11px] muted">Reorder point</div><b>{number(p.reorder_point)} units</b></div><div><div className="text-[11px] muted">Target stock</div><b>{number(p.target_stock)} units</b></div><div><div className="text-[11px] muted">Suggested order</div><b>{p.suggested_order_quantity === null ? "Not enough data" : `${number(p.suggested_order_quantity)} units`}</b></div></div>
        <div className="text-[11px] muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1"><span>90-day usage: {number(p.demand_units_90d)} units</span><span>{p.demand_events_90d} issue events</span><span className={p.confidence === "USABLE" ? "text-lime-300" : "text-amber-300"}>{p.confidence === "USABLE" ? "Demand data usable" : p.confidence === "LIMITED" ? "Limited demand history" : "No recorded demand"}</span></div>
        {role === "BOSS" && <div className="mt-4 pt-4 border-t border-line"><div className="text-xs font-semibold mb-2">Restocking settings · Boss only</div><div className="flex flex-wrap items-end gap-2"><label className="text-[11px] muted">Supplier lead time (days)<input className="field mt-1 w-28" type="number" min="1" max="365" step="1" value={drafts[p.id]?.lead ?? "7"} onChange={e => setDrafts(v => ({ ...v, [p.id]: { ...v[p.id], lead: e.target.value } }))}/></label><label className="text-[11px] muted">Safety stock (units)<input className="field mt-1 w-28" type="number" min="0" step="1" value={drafts[p.id]?.safety ?? "0"} onChange={e => setDrafts(v => ({ ...v, [p.id]: { ...v[p.id], safety: e.target.value } }))}/></label><label className="text-[11px] muted">Target coverage (days)<input className="field mt-1 w-28" type="number" min="1" max="365" step="1" value={drafts[p.id]?.target ?? "30"} onChange={e => setDrafts(v => ({ ...v, [p.id]: { ...v[p.id], target: e.target.value } }))}/></label><button className="btn btn-ghost text-xs" onClick={() => save(p)} disabled={saving === p.id}><Save size={14}/>{saving === p.id ? "Saving…" : "Save settings"}</button></div></div>}
      </div>)}{!visible.length && <p className="p-6 text-sm muted">No products match this search.</p>}</div>}
    </div>
    <div className="text-[11px] muted flex items-start gap-2"><AlertTriangle size={14} className="shrink-0"/><span>Products with fewer than 3 demand events or fewer than 3 distinct demand days are not given an order quantity. No sales history is not treated as zero future demand. Confirm supplier lead times and unusual seasonal demand before ordering.</span></div>
  </div>;
}
