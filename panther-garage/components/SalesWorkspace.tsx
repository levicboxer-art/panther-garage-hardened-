"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, ShoppingCart, Search } from "lucide-react";

type Product = { id: string; name: string; sku: string; stock: number; selling_price: number; active: boolean };
type Customer = { id: string; full_name: string; phone: string | null; email: string | null; motorcycle_details: string | null };
const money = (n: number) => new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);

export default function SalesWorkspace({
  mode,
  products,
  onProductsChanged,
}: {
  mode: "Sales" | "Customers";
  products: Product[];
  onProductsChanged?: () => Promise<Product[] | void> | Product[] | void;
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
  const [cart, setCart] = useState<{ product_id: string; quantity: number }[]>([]);
  const [payment, setPayment] = useState("CASH");
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const customerResponse = await fetch("/api/customers", { cache: "no-store" });
    const customerJson = await customerResponse.json();
    if (customerResponse.ok) setCustomers(customerJson.customers || []);
    else setError(customerJson.error || "Could not load customers");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const cartRows = cart.map(item => ({ ...item, product: products.find(product => product.id === item.product_id) })).filter(item => item.product);
  const subtotal = cartRows.reduce((sum, item) => sum + item.product!.selling_price * item.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const received = Number(paid || 0);
  const additionalGain = cartRows.length === 1 && received > total ? received - total : 0;
  const visibleCustomers = customers.filter(customer => (customer.full_name + " " + (customer.phone || "")).toLowerCase().includes(search.toLowerCase()));

  async function addCustomer(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: customerName, phone, email, motorcycle_details: bike }) });
    const json = await response.json(); setSaving(false);
    if (!response.ok) { setError(json.error || "Could not save customer"); return; }
    setCustomers([json.customer, ...customers]); setCustomerName(""); setPhone(""); setEmail(""); setBike(""); setSelectedCustomer(json.customer.id); setNotice("Customer saved successfully.");
  }

  function addToCart() {
    const product = products.find(item => item.id === productId); const amount = Number(qty);
    if (!product || !Number.isInteger(amount) || amount < 1) { setError("Choose a product and valid quantity."); return; }
    const already = cart.find(item => item.product_id === productId)?.quantity || 0;
    if (already + amount > product.stock) { setError(`Only ${product.stock} units of ${product.name} are currently in stock.`); return; }
    setCart(old => old.some(item => item.product_id === productId ? true : false)
      ? old.map(item => item.product_id === productId ? { ...item, quantity: item.quantity + amount } : item)
      : [...old, { product_id: productId, quantity: amount }]);
    setError("");
  }

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const override = cartRows.length === 1 && received > total ? (received + Number(discount || 0)) / cartRows[0].quantity : undefined;
    const saleItems = cart.map(item => ({ ...item, ...(override === undefined ? {} : { unit_price: override }) }));
    const response = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: selectedCustomer || null, items: saleItems, payment_method: payment, amount_paid: received, discount: Number(discount || 0) }) });
    const json = await response.json(); setSaving(false);
    if (!response.ok) { setError(json.error || "Sale could not be completed"); return; }
    await onProductsChanged?.();
    setCart([]); setPaid(""); setDiscount("0"); setNotice(`Sale ${json.sale.invoice_number} completed. Stock updated. Find it in Recent invoices.`); await load();
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><div><div className="tag">PANTHER GARAGE · OPERATIONS</div><h2 className="text-xl font-bold mt-2">{mode === "Sales" ? "Point of sale" : "Customer register"}</h2><p className="muted text-xs mt-1">{mode === "Sales" ? "Record counter sales, collect payment and deduct stock atomically." : "Keep customer contact and motorcycle details in one place."}</p></div><button onClick={() => void load()} className="btn btn-ghost text-xs"><RefreshCw size={14}/> Refresh</button></div>
    {error && <div className="card p-3 text-sm text-red-300">{error}</div>}{notice && <div className="card p-3 text-sm text-lime">{notice}</div>}
    {mode === "Customers" ? <div className="grid xl:grid-cols-[.8fr_1.2fr] gap-4">
      <form onSubmit={addCustomer} className="card p-5 space-y-3"><h3 className="font-bold flex items-center gap-2"><Plus size={16}/> Register customer</h3><label className="block text-xs muted">Full name<input className="field mt-1" required value={customerName} onChange={event => setCustomerName(event.target.value)}/></label><label className="block text-xs muted">Phone number<input className="field mt-1" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07…"/></label><label className="block text-xs muted">Email (optional)<input className="field mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)}/></label><label className="block text-xs muted">Motorcycle details<input className="field mt-1" value={bike} onChange={event => setBike(event.target.value)} placeholder="e.g. TVS HLX 125, plate…"/></label><button disabled={saving} className="btn btn-primary w-full">{saving ? "Saving…" : "Save customer"}</button></form>
      <div className="card"><div className="p-5 flex items-center justify-between"><h3 className="font-bold">Customers <span className="muted">({customers.length})</span></h3><div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2"><Search size={14}/><input className="bg-transparent outline-none text-xs w-36" placeholder="Search customers" value={search} onChange={event => setSearch(event.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>NAME</th><th>PHONE</th><th>MOTORCYCLE</th><th>EMAIL</th></tr></thead><tbody>{visibleCustomers.map(customer => <tr key={customer.id}><td className="font-semibold">{customer.full_name}</td><td>{customer.phone || "—"}</td><td>{customer.motorcycle_details || "—"}</td><td>{customer.email || "—"}</td></tr>)}</tbody></table>{!visibleCustomers.length && <p className="p-5 muted text-sm">No customers found.</p>}</div></div>
    </div> : <>
      <div className="grid xl:grid-cols-[1fr_.9fr] gap-4">
        <div className="card p-5 space-y-4"><div className="flex items-center gap-2 font-bold"><ShoppingCart size={17}/> New sale</div><label className="block text-xs muted">Customer (optional)<select className="field mt-1" value={selectedCustomer} onChange={event => setSelectedCustomer(event.target.value)}><option value="">Walk-in customer</option>{customers.map(customer => <option value={customer.id} key={customer.id}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label><div className="grid sm:grid-cols-[1fr_100px_auto] gap-2 items-end"><label className="block text-xs muted">Product<select className="field mt-1" value={productId} onChange={event => setProductId(event.target.value)}><option value="">Select product</option>{products.filter(product => product.active && product.stock > 0).map(product => <option key={product.id} value={product.id}>{product.name} · {product.stock} in stock · {money(product.selling_price)}</option>)}</select></label><label className="block text-xs muted">Qty<input className="field mt-1" type="number" min="1" step="1" value={qty} onChange={event => setQty(event.target.value)}/></label><button type="button" onClick={addToCart} className="btn btn-ghost"><Plus size={15}/> Add</button></div><div className="table-wrap"><table><thead><tr><th>ITEM</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th></th></tr></thead><tbody>{cartRows.map(item => <tr key={item.product_id}><td>{item.product!.name}</td><td>{item.quantity}</td><td>{money(item.product!.selling_price)}</td><td>{money(item.quantity * item.product!.selling_price)}</td><td><button type="button" className="text-red-300" onClick={() => setCart(cart.filter(row => row.product_id !== item.product_id))}>Remove</button></td></tr>)}</tbody></table>{!cartRows.length && <p className="p-4 text-xs muted">Add products to start an invoice.</p>}</div><div className="flex justify-between text-sm"><span className="muted">Subtotal</span><b>{money(subtotal)}</b></div><label className="block text-xs muted">Discount (RWF)<input className="field mt-1" type="number" min="0" step="1" max={subtotal} value={discount} onChange={event => setDiscount(event.target.value)}/></label><div className="flex justify-between border-t border-line pt-3"><span className="font-bold">Total due</span><strong className="text-xl lime">{money(total)}</strong></div></div>
        <form onSubmit={checkout} className="card p-5 space-y-4"><h3 className="font-bold">Payment & completion</h3><label className="block text-xs muted">Payment method<select className="field mt-1" value={payment} onChange={event => setPayment(event.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="CREDIT">Credit / partial payment</option></select></label><label className="block text-xs muted">Amount received (RWF)<input className="field mt-1" type="number" min="0" step="1" required value={paid} onChange={event => setPaid(event.target.value)} placeholder={payment === "CREDIT" ? "Enter amount received" : "Enter full amount"}/></label>{additionalGain > 0 && <div className="rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm"><div className="flex justify-between"><span className="muted">Additional gain</span><b className="lime">{money(additionalGain)}</b></div><p className="text-[11px] muted mt-1">This one-item sale will be invoiced at {money(received)} instead of the listed {money(total)}.</p></div>}<p className="text-xs muted">For standard sales, payment must equal the invoice total. For a one-item sale, a higher amount is recorded as the actual sale price and shown as additional gain. Credit supports a remaining balance.</p><button disabled={saving || !cart.length || total < 0} className="btn btn-primary w-full">{saving ? "Processing…" : "Complete sale & issue invoice"}</button><div className="text-[11px] muted">Stock is deducted inside the database transaction using FIFO cost batches. If stock is insufficient, the entire sale is rejected.</div></form>
      </div>
    </>}
    {loading && <p className="muted text-xs">Loading live records…</p>}
  </div>;
}
