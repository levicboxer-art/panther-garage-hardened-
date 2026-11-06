"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export default function PartRequest({
  productId,
  productName,
  canOrder,
}: {
  productId: string;
  productName: string;
  canOrder: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  if (!canOrder) {
    return (
      <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-50/90">
        <div className="font-semibold text-amber-100">Ordering is paused for this part</div>
        <p className="mt-2 text-xs">
          The garage has not yet published a confirmed selling price, or the part is currently out
          of stock. Ask the garage to confirm the price and the next availability before ordering.
        </p>
        <a href="/#contact" className="btn btn-ghost mt-4 text-xs">
          Contact the garage
        </a>
      </div>
    );
  }

  if (reference) {
    return (
      <div className="rounded-xl border border-lime/30 bg-lime/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-lime">
          <CheckCircle2 size={17} /> Request received
        </div>
        <p className="mt-2">
          Reference: <span className="lime">{reference}</span>
        </p>
        <p className="mt-2 text-xs leading-6 muted">
          The garage will contact you to confirm availability, collection or delivery, and payment
          arrangements. No payment is taken online.
        </p>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          phone,
          email,
          delivery_note: note,
          items: [{ product_id: productId, quantity: 1 }],
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not submit the request.");
      setReference(json.order_reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <h3 className="text-lg font-bold">Request this part</h3>
      <p className="text-xs leading-6 muted">
        This creates a request for one unit of <b>{productName}</b>. The garage confirms current
        availability and payment arrangements before anything is finalised.
      </p>
      <input
        className="field"
        required
        minLength={2}
        placeholder="Your full name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className="field"
        required
        minLength={7}
        placeholder="Phone number"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <input
        className="field"
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <textarea
        className="field min-h-20"
        placeholder="Collection, delivery or motorcycle details (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        <Send size={15} /> {busy ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
