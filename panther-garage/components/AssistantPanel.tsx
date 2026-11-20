"use client";

import { useMemo, useState } from "react";
import { Bot, X } from "lucide-react";

type Product = { id: string; name: string; sku: string; stock: number; active: boolean };

export default function AssistantPanel({
  open,
  onClose,
  products,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  role: "BOSS" | "EMPLOYEE";
  products: Product[];
  onNavigate: (tab: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => !term || `${product.name} ${product.sku}`.toLowerCase().includes(term)).slice(0, 5);
  }, [products, query]);
  if (!open) return null;
  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] card p-4 shadow-2xl" aria-label="Garage assistant">
      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Bot size={17} className="lime" /> Garage assistant</div><button onClick={onClose} aria-label="Close assistant"><X size={17} /></button></div>
      <p className="mb-3 text-xs muted">Search the live product register or jump to a workspace.</p>
      <input className="field mb-3" placeholder="Search product or SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="space-y-1">{matches.map((product) => <button key={product.id} className="flex w-full justify-between rounded-lg border border-line p-2 text-left text-xs hover:border-lime" onClick={() => onNavigate("Inventory")}><span>{product.name}<span className="block muted">{product.sku}</span></span><span className="lime">{product.stock} left</span></button>)}{query && !matches.length && <p className="text-xs muted">No matching product.</p>}</div>
      <div className="mt-3 flex gap-2"><button className="pill" onClick={() => onNavigate("Inventory")}>Inventory</button><button className="pill" onClick={() => onNavigate("Sales")}>Sales</button></div>
    </aside>
  );
}
