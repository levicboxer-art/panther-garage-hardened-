"use client";

import { useMemo, useState } from "react";
import { Boxes, Bot, Check, ShoppingCart, X } from "lucide-react";

type Product = { id: string; name: string; sku: string; stock: number; active: boolean };

export default function AssistantPanel({
  open,
  onClose,
  products,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onNavigate: (tab: string, product?: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => !term || `${product.name} ${product.sku}`.toLowerCase().includes(term))
      .slice(0, 5);
  }, [products, query]);
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  if (!open) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] card p-4 shadow-2xl" aria-label="Garage assistant">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold"><Bot size={17} className="lime" /> Garage assistant</div>
        <button onClick={onClose} aria-label="Close assistant"><X size={17} /></button>
      </div>
      <p className="mb-3 text-xs muted">Search a product, select it, then choose Sales or Inventory.</p>
      <input
        className="field mb-3"
        aria-label="Search products by name or SKU"
        placeholder="Search product or SKU"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedProductId("");
        }}
      />
      <div className="space-y-1">
        {matches.map((product) => {
          const selected = selectedProductId === product.id;
          return (
            <button
              type="button"
              key={product.id}
              aria-pressed={selected}
              className={`flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs transition ${selected ? "border-lime bg-lime/10" : "border-line hover:border-lime"}`}
              onClick={() => setSelectedProductId(product.id)}
            >
              <span>{product.name}<span className="block muted">SKU: {product.sku}</span></span>
              <span className="flex items-center gap-1.5 whitespace-nowrap lime">{selected && <Check size={13} />}{product.stock} left</span>
            </button>
          );
        })}
        {query && !matches.length && <p className="text-xs muted">No matching product.</p>}
      </div>
      {selectedProduct && (
        <div className="mt-3 rounded-xl border border-lime/30 bg-lime/5 p-3">
          <div className="tag">SELECTED PRODUCT</div>
          <p className="mt-1 text-sm font-semibold">{selectedProduct.name}</p>
          <p className="text-[11px] muted">SKU: {selectedProduct.sku} · {selectedProduct.stock} in stock</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-primary justify-center px-2 text-[11px]"
              disabled={!selectedProduct.active || selectedProduct.stock < 1}
              onClick={() => onNavigate("Sales", selectedProduct)}
              title={!selectedProduct.active || selectedProduct.stock < 1 ? "This product is not available to sell" : "Open Sales with this product selected"}
            >
              <ShoppingCart size={13} /> Select in Sales
            </button>
            <button
              type="button"
              className="btn btn-ghost justify-center px-2 text-[11px]"
              onClick={() => onNavigate("Inventory", selectedProduct)}
            >
              <Boxes size={13} /> Open Inventory
            </button>
          </div>
          {(!selectedProduct.active || selectedProduct.stock < 1) && (
            <p className="mt-2 text-[10px] muted">This item is unavailable to sell; open Inventory to review it.</p>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button className="pill" onClick={() => onNavigate("Inventory")}>Inventory</button>
        <button className="pill" onClick={() => onNavigate("Sales")}>Sales</button>
      </div>
    </aside>
  );
}
