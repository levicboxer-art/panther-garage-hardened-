"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw, Search, ShoppingCart, Wrench } from "lucide-react";
import WorkshopWorkspace from "@/components/WorkshopWorkspace";

type Product = { id: string; name: string; sku: string; stock: number; selling_price: number; active: boolean };
type Customer = { id: string; full_name: string; phone: string | null; email: string | null; motorcycle_details: string | null };
type CartLine = {
  id: string;
  item_type: "STOCK" | "USED_NONSTOCK";
  product_id?: string;
  description: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
};
const money = (n: number) => new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);

export default function SalesWorkspace({
  mode,
  products,
  onProductsChanged,
  initialProductId,
  onAssistantProductHandled,
}: {
  mode: "Sales" | "Customers";
  products: Product[];
  onProductsChanged?: () => Promise<Product[] | void> | Product[] | void;
  initialProductId?: string;
  onAssistantProductHandled?: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bike, setBike] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [usedDescription, setUsedDescription] = useState("");
  const [usedQty, setUsedQty] = useState("1");
  const [usedPrice, setUsedPrice] = useState("");
  const [usedCost, setUsedCost] = useState("");
  const [servicePerformed, setServicePerformed] = useState(false);
  const [serviceFee, setServiceFee] = useState("0");
  const [mechanicName, setMechanicName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [payment, setPayment] = useState("CASH");
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [salesPane, setSalesPane] = useState<"checkout" | "workshop">("checkout");
  const productPickerRef = useRef<HTMLDivElement>(null);
  const productSearchInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const customerResponse = await fetch("/api/customers", { cache: "no-store" });
      const customerJson = await customerResponse.json();
      if (customerResponse.ok) setCustomers(customerJson.customers || []);
      else setError(customerJson.error || "Could not load customers");
    } catch {
      setError("Could not load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!productPickerOpen) return;
    productSearchInputRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (productPickerRef.current && !productPickerRef.current.contains(event.target as Node)) setProductPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [productPickerOpen]);

  useEffect(() => {
    if (!initialProductId) return;
    const product = products.find((item) => item.id === initialProductId && item.active && item.stock > 0);
    if (product) {
      setProductSearch(""); setProductPickerOpen(false); setProductId(product.id); setError("");
    } else setError("This product is no longer available to sell. Refresh the product list and try again.");
    onAssistantProductHandled?.();
  }, [initialProductId, onAssistantProductHandled, products]);

  const stockLinesTotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const fee = servicePerformed ? Number(serviceFee || 0) : 0;
  const subtotal = stockLinesTotal + fee;
  const total = Math.max(0, subtotal - Number(discount || 0));
  const received = Number(paid || 0);
  const additionalGain = cart.length === 1 && cart[0].item_type === "STOCK" && received > total ? received - total : 0;
  const visibleCustomers = customers.filter((customer) => (customer.full_name + " " + (customer.phone || "")).toLowerCase().includes(search.toLowerCase()));
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const visibleProducts = products.filter((product) => product.active && product.stock > 0)
    .filter((product) => !normalizedProductSearch || `${product.name} ${product.sku}`.toLowerCase().includes(normalizedProductSearch));

  async function addCustomer(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: customerName, phone, email, motorcycle_details: bike }) });
    const json = await response.json(); setSaving(false);
    if (!response.ok) { setError(json.error || "Could not save customer"); return; }
    setCustomers([json.customer, ...customers]); setCustomerName(""); setPhone(""); setEmail(""); setBike(""); setSelectedCustomer(json.customer.id); setNotice("Customer saved successfully.");
  }

  function addStockToCart() {
    const product = products.find((item) => item.id === productId); const amount = Number(qty);
    if (!product || !Number.isInteger(amount) || amount < 1) { setError("Choose an in-stock product and valid quantity."); return; }
    const already = cart.find((item) => item.item_type === "STOCK" && item.product_id === productId)?.quantity || 0;
    if (already + amount > product.stock) { setError(`Only ${product.stock} units of ${product.name} are currently in stock.`); return; }
    setCart((old) => old.some((item) => item.item_type === "STOCK" && item.product_id === productId)
      ? old.map((item) => item.item_type === "STOCK" && item.product_id === productId ? { ...item, quantity: item.quantity + amount } : item)
      : [...old, { id: crypto.randomUUID(), item_type: "STOCK", product_id: product.id, description: product.name, sku: product.sku, quantity: amount, unit_price: Number(product.selling_price) }]);
    setError(""); setQty("1"); setProductId(""); setProductSearch("");
  }

  function addUsedPart() {
    const description = usedDescription.trim(); const amount = Number(usedQty); const price = Number(usedPrice);
    const cost = usedCost.trim() === "" ? null : Number(usedCost);
    if (description.length < 2 || description.length > 200) { setError("Enter a used-part description between 2 and 200 characters."); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) { setError("Enter a valid whole-number quantity."); return; }
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) { setError("Enter a valid used-part sale price."); return; }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 100000000)) { setError("Enter a valid purchase cost or leave it blank if unknown."); return; }
    setCart((old) => [...old, { id: crypto.randomUUID(), item_type: "USED_NONSTOCK", description, sku: "USED-NONSTOCK", quantity: amount, unit_price: price, unit_cost: cost }]);
    setUsedDescription(""); setUsedQty("1"); setUsedPrice(""); setUsedCost(""); setError("");
  }

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const override = additionalGain > 0 ? (received + Number(discount || 0) - fee) / cart[0].quantity : undefined;
    const saleItems = cart.map((item) => item.item_type === "STOCK"
      ? { item_type: item.item_type, product_id: item.product_id, quantity: item.quantity, ...(item.id === cart[0]?.id && override !== undefined ? { unit_price: override } : { unit_price: item.unit_price }) }
      : { item_type: item.item_type, description: item.description, quantity: item.quantity, unit_price: item.unit_price, unit_cost: item.unit_cost ?? null });
    const response = await fetch("/api/sales", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: selectedCustomer || null,
        items: saleItems,
        payment_method: payment,
        amount_paid: received,
        discount: Number(discount || 0),
        service: { performed: servicePerformed, fee, mechanic_name: servicePerformed ? mechanicName.trim() : "", registration_number: servicePerformed ? registrationNumber.trim() : "", notes: servicePerformed ? serviceNotes.trim() : "" },
      }),
    });
    const json = await response.json(); setSaving(false);
    if (!response.ok) { setError(json.error || "Sale could not be completed"); return; }
    await onProductsChanged?.();
    setCart([]); setPaid(""); setDiscount("0"); setServicePerformed(false); setServiceFee("0"); setMechanicName(""); setRegistrationNumber(""); setServiceNotes("");
    setNotice(`Sale ${json.sale.invoice_number} completed. Stock updated. Find it in Recent invoices.`); await load();
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="tag">PANTHER GARAGE · OPERATIONS</div><h2 className="mt-2 text-xl font-bold">{mode === "Sales" ? "Sales & service" : "Customer register"}</h2>
        <p className="muted mt-1 text-xs">{mode === "Sales" ? "Create one invoice for stocked or used parts, with optional workshop service." : "Keep customer contact and motorcycle details in one place."}</p>
      </div>
      <button onClick={() => void load()} className="btn btn-ghost text-xs"><RefreshCw size={14}/> Refresh</button>
    </div>
    {error && <div className="card p-3 text-sm text-red-300" role="alert">{error}</div>}{notice && <div className="card p-3 text-sm text-lime" role="status">{notice}</div>}
    {mode === "Customers" ? <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={addCustomer} className="card space-y-3 p-5"><h3 className="flex items-center gap-2 font-bold"><Plus size={16}/> Register customer</h3>
        <label className="block text-xs muted">Full name<input className="field mt-1" required value={customerName} onChange={(event) => setCustomerName(event.target.value)}/></label>
        <label className="block text-xs muted">Phone number<input className="field mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07…"/></label>
        <label className="block text-xs muted">Email (optional)<input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
        <label className="block text-xs muted">Motorcycle details<input className="field mt-1" value={bike} onChange={(event) => setBike(event.target.value)} placeholder="e.g. TVS HLX 125, plate…"/></label>
        <button disabled={saving} className="btn btn-primary w-full">{saving ? "Saving…" : "Save customer"}</button>
      </form>
      <div className="card"><div className="flex items-center justify-between p-5"><h3 className="font-bold">Customers <span className="muted">({customers.length})</span></h3><div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"><Search size={14}/><input className="w-36 bg-transparent text-xs outline-none" placeholder="Search customers" value={search} onChange={(event) => setSearch(event.target.value)}/></div></div>
        <div className="table-wrap"><table><thead><tr><th>NAME</th><th>PHONE</th><th>MOTORCYCLE</th><th>EMAIL</th></tr></thead><tbody>{visibleCustomers.map((customer) => <tr key={customer.id}><td className="font-semibold">{customer.full_name}</td><td>{customer.phone || "—"}</td><td>{customer.motorcycle_details || "—"}</td><td>{customer.email || "—"}</td></tr>)}</tbody></table>{!visibleCustomers.length && <p className="muted p-5 text-sm">No customers found.</p>}</div>
      </div>
    </div> : <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sales workspace">
        <button type="button" role="tab" aria-selected={salesPane === "checkout"} onClick={() => setSalesPane("checkout")} className={`btn text-xs ${salesPane === "checkout" ? "btn-primary" : "btn-ghost"}`}><ShoppingCart size={14}/> New sale</button>
        <button type="button" role="tab" aria-selected={salesPane === "workshop"} onClick={() => setSalesPane("workshop")} className={`btn text-xs ${salesPane === "workshop" ? "btn-primary" : "btn-ghost"}`}><Wrench size={14}/> Existing workshop jobs</button>
      </div>
      {salesPane === "workshop" ? <WorkshopWorkspace products={products}/> : <div className="grid gap-4 xl:grid-cols-[1fr_.9fr]">
        <div className="card space-y-4 p-5">
          <div className="flex items-center gap-2 font-bold"><ShoppingCart size={17}/> New sale</div>
          <label className="block text-xs muted">Customer (optional)<select className="field mt-1" value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_100px_auto]">
            <label className="block text-xs muted">Inventory product<div ref={productPickerRef} className="relative mt-1">
              <button type="button" role="combobox" aria-label="Select product" aria-haspopup="listbox" aria-expanded={productPickerOpen} aria-controls="sales-product-options" className="field flex w-full items-center justify-between gap-2 text-left" onClick={() => setProductPickerOpen((open) => !open)}>
                <span className="min-w-0 truncate">{productId ? (() => { const selected = products.find((product) => product.id === productId); return selected ? `${selected.name} · SKU ${selected.sku} · ${selected.stock} in stock` : "Select product"; })() : "Select in-stock product"}</span><ChevronDown size={15} className={`shrink-0 transition-transform ${productPickerOpen ? "rotate-180" : ""}`}/>
              </button>
              {productPickerOpen && <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-line bg-[#101010] shadow-2xl">
                <div className="relative border-b border-line px-2"><Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 muted" aria-hidden="true"/><input ref={productSearchInputRef} className="w-full bg-transparent py-3 pl-8 pr-2 text-xs outline-none" type="search" aria-label="Search products by name or SKU" aria-controls="sales-product-options" placeholder="Search by name or SKU…" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(""); }} onKeyDown={(event) => { if (event.key === "Escape") setProductPickerOpen(false); if (event.key === "Enter" && visibleProducts.length === 1) { event.preventDefault(); setProductId(visibleProducts[0].id); setProductSearch(""); setProductPickerOpen(false); setError(""); }}}/></div>
                <div id="sales-product-options" role="listbox" aria-label="In-stock products" className="max-h-64 overflow-y-auto">{visibleProducts.map((product) => <button key={product.id} type="button" role="option" aria-selected={productId === product.id} className="flex w-full items-center justify-between gap-3 border-b border-white/[.05] px-3 py-2.5 text-left text-xs last:border-0 hover:bg-lime/10 focus:bg-lime/10 focus:outline-none" onClick={() => { setProductId(product.id); setProductSearch(""); setProductPickerOpen(false); setError(""); }}><span className="min-w-0"><span className="block truncate font-medium">{product.name}</span><span className="muted mt-1 block text-[10px]">SKU: {product.sku}</span></span><span className="shrink-0 text-right"><span className="block lime">{product.stock} in stock</span><span className="muted mt-1 block text-[10px]">{money(product.selling_price)}</span></span></button>)}{!visibleProducts.length && <p className="muted p-4 text-xs">No matching in-stock products.</p>}</div>
              </div>}
            </div></label>
            <label className="block text-xs muted">Qty<input className="field mt-1" type="number" min="1" max="1000" step="1" value={qty} onChange={(event) => setQty(event.target.value)}/></label>
            <button type="button" onClick={addStockToCart} className="btn btn-ghost"><Plus size={15}/> Add</button>
          </div>
          <div className="rounded-xl border border-line p-4">
            <h4 className="text-sm font-semibold">Used / second-hand part · not in inventory</h4>
            <p className="muted mt-1 text-[11px]">This records the item and sale price on the invoice without creating or deducting inventory stock.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs muted sm:col-span-2">Description<input className="field mt-1" maxLength={200} value={usedDescription} onChange={(event) => setUsedDescription(event.target.value)} placeholder="e.g. Used left mirror, second-hand"/></label>
              <label className="text-xs muted">Quantity<input className="field mt-1" type="number" min="1" max="1000" step="1" value={usedQty} onChange={(event) => setUsedQty(event.target.value)}/></label>
              <label className="text-xs muted">Sale price per item (RWF)<input className="field mt-1" type="number" min="1" step="1" value={usedPrice} onChange={(event) => setUsedPrice(event.target.value)} placeholder="Required"/></label>
              <label className="text-xs muted sm:col-span-2">Purchase cost per item (RWF, optional)<input className="field mt-1" type="number" min="0" step="1" value={usedCost} onChange={(event) => setUsedCost(event.target.value)} placeholder="Leave blank if unknown"/><span className="muted mt-1 block text-[10px]">If unknown, profit reporting will be marked incomplete rather than assuming zero cost.</span></label>
            </div>
            <button type="button" onClick={addUsedPart} className="btn btn-ghost mt-3 text-xs"><Plus size={14}/> Add used part to invoice</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>TYPE / SKU</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th></th></tr></thead><tbody>{cart.map((item) => <tr key={item.id}><td>{item.description}</td><td>{item.item_type === "STOCK" ? item.sku : "Used · non-stock"}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.unit_price * item.quantity)}</td><td><button type="button" className="text-red-300" onClick={() => setCart((old) => old.filter((line) => line.id !== item.id))}>Remove</button></td></tr>)}</tbody></table>{!cart.length && <p className="muted p-4 text-xs">Add an inventory item or a used part to start an invoice.</p>}</div>
          <div className="flex justify-between text-sm"><span className="muted">Parts subtotal</span><b>{money(stockLinesTotal)}</b></div>
          <label className="block text-xs muted">Discount (RWF)<input className="field mt-1" type="number" min="0" step="1" max={subtotal} value={discount} onChange={(event) => setDiscount(event.target.value)}/></label>
          <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm"><input type="checkbox" checked={servicePerformed} onChange={(event) => setServicePerformed(event.target.checked)}/><span><b>Repair / maintenance service included</b><span className="muted mt-1 block text-xs">Leave unchecked or enter a zero fee when no service was performed.</span></span></label>
          {servicePerformed && <div className="grid gap-3 rounded-xl border border-lime/20 bg-lime/[.03] p-4 sm:grid-cols-2">
            <label className="block text-xs muted">Repair / maintenance fee (RWF)<input className="field mt-1" type="number" min="0" step="1" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)}/></label>
            <label className="block text-xs muted">Mechanic name<input className="field mt-1" required maxLength={120} value={mechanicName} onChange={(event) => setMechanicName(event.target.value)} placeholder="Who performed the work?"/></label>
            <label className="block text-xs muted">Motorcycle plate / registration<input className="field mt-1" required maxLength={40} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} placeholder="e.g. RA…"/></label>
            <label className="block text-xs muted">Service note (optional)<input className="field mt-1" maxLength={500} value={serviceNotes} onChange={(event) => setServiceNotes(event.target.value)} placeholder="Brief work performed"/></label>
          </div>}
          <div className="flex justify-between border-t border-line pt-3"><span className="font-bold">Total due</span><strong className="lime text-xl">{money(total)}</strong></div>
        </div>
        <form onSubmit={checkout} className="card space-y-4 p-5">
          <h3 className="font-bold">Payment & completion</h3>
          <label className="block text-xs muted">Payment method<select className="field mt-1" value={payment} onChange={(event) => setPayment(event.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="CREDIT">Credit / partial payment</option></select></label>
          <label className="block text-xs muted">Amount received (RWF)<input className="field mt-1" type="number" min="0" step="1" required value={paid} onChange={(event) => setPaid(event.target.value)} placeholder={payment === "CREDIT" ? "Enter amount received" : "Enter full amount"}/></label>
          {additionalGain > 0 && <div className="rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm"><div className="flex justify-between"><span className="muted">Additional gain</span><b className="lime">{money(additionalGain)}</b></div><p className="muted mt-1 text-[11px]">The one-stock-item sale price will be adjusted to the amount received; the service fee remains unchanged.</p></div>}
          <p className="muted text-xs">Non-credit payment must equal the invoice total. Credit supports a remaining balance. Inventory items are deducted with FIFO costing in the same database transaction; used items never change stock.</p>
          <button disabled={saving || !cart.length || total < 0 || (servicePerformed && (!mechanicName.trim() || !registrationNumber.trim()))} className="btn btn-primary w-full">{saving ? "Processing…" : "Complete sale & issue invoice"}</button>
          <div className="muted text-[11px]">The invoice records the logged-in employee, sale date, line items and any included service details.</div>
        </form>
      </div>}
    </>}
    {loading && <p className="muted text-xs">Loading live records…</p>}
  </div>;
}
