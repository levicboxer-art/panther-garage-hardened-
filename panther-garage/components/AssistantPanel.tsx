"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, ArrowUp, Square, PanelRightOpen, X } from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  stock: number;
  available_stock: number;
  selling_price: number;
};

type Turn = { role: "user" | "assistant"; content: string; navigation?: string };
const NAV_TARGETS = new Set([
  "Overview", "Inventory", "Import", "Catalogue review", "Sales", "Repairs", "Customers",
  "Bookings", "Online Orders", "Employees", "Purchases", "Restocking", "Reports",
  "Shift reports", "Team chat", "Insights", "Settings",
]);
function parseNavigation(text: string, role: "BOSS" | "EMPLOYEE") {
  const match = text.match(/\[\[NAV:([^\]]+)\]\]/i);
  const target = match?.[1]?.trim() || "";
  const allowed = NAV_TARGETS.has(target) && (role === "BOSS" || !["Import", "Catalogue review", "Employees", "Purchases", "Restocking", "Insights"].includes(target));
  return { content: text.replace(/\s*\[\[NAV:[^\]]+\]\]\s*/gi, "\n").trim(), navigation: allowed ? target : undefined };
}

/* ---------- instant, fully local navigation index (zero network latency) ---------- */
type Feature = { label: string; desc: string; tab?: string; href?: string; bossOnly?: boolean; keywords: string };
const FEATURES: Feature[] = [
  { label: "Overview", desc: "Live stock summary and attention list", tab: "Overview", keywords: "home summary stats dashboard start" },
  { label: "Inventory", desc: "Product register & live stock — costs, editing and receiving are owner-only", tab: "Inventory", keywords: "stock parts products receive goods quantity add edit image photo barcode" },
  { label: "Import workbook", desc: "Stage and apply the spare-parts Excel import", tab: "Import", bossOnly: true, keywords: "excel xlsx upload workbook spiro import sheet" },
  { label: "Catalogue review", desc: "Confirm prices, categories and compatibility", tab: "Catalogue review", bossOnly: true, keywords: "price confirm category compatibility publish catalogue review" },
  { label: "Sales / POS", desc: "Point of sale, invoices, payments", tab: "Sales", keywords: "sell sale invoice cash mobile money card credit receipt pos counter" },
  { label: "Repairs workshop", desc: "Job cards, labour, parts issues, statuses", tab: "Repairs", keywords: "repair job workshop mechanic labour fix service status" },
  { label: "Customers", desc: "Customer register and purchase history", tab: "Customers", keywords: "customer client phone contact repeat history" },
  { label: "Bookings", desc: "Customer service bookings from the portal", tab: "Bookings", keywords: "booking appointment reserve schedule service request" },
  { label: "Online Orders", desc: "Web-store orders to contact, confirm, fulfil", tab: "Online Orders", keywords: "web order online shop fulfil cart enquiry" },
  { label: "Employees", desc: "Create or deactivate staff accounts", tab: "Employees", bossOnly: true, keywords: "employee staff user account role hire access" },
  { label: "Purchases", desc: "Purchase orders, supplier invoices, expenses", tab: "Purchases", bossOnly: true, keywords: "purchase order supplier invoice expense cost buy ordering finance payment" },
  { label: "Restocking", desc: "Lead times, safety stock, reorder plan", tab: "Restocking", bossOnly: true, keywords: "reorder restock lead time safety stock minimum supply shortage" },
  { label: "Reports", desc: "Period operations and finance reports", tab: "Reports", keywords: "report summary period export daily monthly" },
  { label: "Shift reports", desc: "Daily handover: opening/closing stock, comments, recommendations, challenge & solution", tab: "Shift reports", keywords: "shift handover daily opening closing stock comments recommendation challenge solution issue submit employee" },
  { label: "Insights (AI analytics)", desc: "Revenue trends, margins, forecasts, boss briefing", tab: "Insights", bossOnly: true, keywords: "analytics insight forecast margin trend intelligence boss chart profit" },
  { label: "Settings", desc: "Profile, theme and language", tab: "Settings", keywords: "settings theme language password profile" },
  { label: "Public storefront", desc: "The catalogue customers see", href: "/", keywords: "website storefront public catalogue shop customer view" },
  { label: "Customer portal", desc: "Bookings, repair tracking, order status", href: "/portal", keywords: "portal track tracking job number customer self service" },
  { label: "Part detail page", desc: "Open any part's public page from search results below", keywords: "part page detail link share" },
];

const money = new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 });
const fmt = (n: number) => money.format(Number(n || 0));

const BOSS_CHIPS = ["How is revenue trending?", "What should I reorder this week?", "Find item costs for brake pads", "What problems did staff report in shift reports?"];
const STAFF_CHIPS = ["How do I submit my shift report?", "Find a part and its price", "How do I record a sale?", "How do I open a repair job in Repairs?"];

/* Minimal, safe markdown-lite: **bold** and line breaks, no HTML injection. */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((seg, si) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={si}>{seg.slice(2, -2)}</strong>
            ) : (
              <span key={si}>{seg}</span>
            ),
          )}
          {li < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

const stockBadgeClass = (n: number) => (n <= 0 ? "badge badge-red" : n <= 5 ? "badge badge-warn" : "badge");

export default function AssistantPanel({
  open,
  onClose,
  role,
  products,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  role: "BOSS" | "EMPLOYEE";
  products: Product[];
  onNavigate: (tab: string) => void;
}) {
  const [view, setView] = useState<"search" | "ask">("search");
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Panel stays mounted for the animation, so focus is driven explicitly on open.
  useEffect(() => {
    if (open && view === "search") inputRef.current?.focus();
  }, [open, view]);

  // One cheap health probe so the chat tab can say up-front if the provider is down.
  useEffect(() => {
    if (!open || view !== "ask" || aiStatus !== null) return;
    let alive = true;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.configured) setAiStatus("AI key is not configured on the server yet.");
        else if (j.upstream !== "ok")
          setAiStatus(j.upstream === "http-402" ? "AI provider balance is empty — top up the DeepSeek account." : `AI provider status: ${j.upstream}.`);
        else setAiStatus("");
      })
      .catch(() => alive && setAiStatus("Could not reach the assistant service."));
    return () => { alive = false; };
  }, [open, view, aiStatus]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, []);

  /* ---------- instant local search ---------- */
  const q = query.trim().toLowerCase();
  const featureHits = useMemo(() => {
    if (!q) return [];
    return FEATURES
      .filter((f) => (role === "BOSS" || !f.bossOnly))
      .map((f) => {
        const hay = `${f.label} ${f.desc} ${f.keywords}`.toLowerCase();
        let score = 0;
        for (const t of q.split(/\s+/)) if (t && hay.includes(t)) score += 1;
        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.f);
  }, [q, role]);

  const productHits = useMemo(() => {
    if (q.length < 2) return [];
    return products
      .filter((p) => `${p.name} ${p.sku} ${p.category || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, products]);

  const go = (f: Feature) => {
    if (f.tab) onNavigate(f.tab);
    else if (f.href) window.open(f.href, "_blank");
    onClose();
  };

  /* ---------- streaming AI chat ---------- */
  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    setDraft("");
    const next: Turn[] = [...turns, { role: "user" as const, content }].slice(-12);
    setTurns([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    scrollDown();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Assistant is unavailable (HTTP ${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            if (obj.error) throw new Error(obj.error);
            if (typeof obj.c === "string") {
              answer += obj.c;
              const parsed = parseNavigation(answer, role);
              setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, content: parsed.content, navigation: parsed.navigation } : x)));
              scrollDown();
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
      if (!answer)
        setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, content: "(no answer returned)" } : x)));
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setTurns((t) => (t[t.length - 1]?.content ? t : [...t.slice(0, -1), { role: "assistant", content: "(stopped)" }]));
      } else {
        const msg = e instanceof Error ? e.message : "The assistant hit a problem.";
        setTurns((t) => [...t.slice(0, -1), { role: "assistant", content: `⚠ ${msg}` }]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      scrollDown();
    }
  };

  const chips = role === "BOSS" ? BOSS_CHIPS : STAFF_CHIPS;

  return (
    <aside
      className={`fixed right-3 top-[64px] z-50 flex h-[min(480px,calc(100vh-5.5rem))] w-[min(352px,calc(100vw-1.5rem))] origin-top-right flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${
        open ? "visible scale-100 opacity-100" : "invisible pointer-events-none scale-90 opacity-0"
      }`}
      role="dialog"
      aria-label="Garage assistant"
      aria-hidden={!open}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Sparkles className="h-4 w-4 text-lime-300" />
        <span className="text-sm font-semibold tracking-wide">GARAGE ASSISTANT</span>
        <span className="tag ml-auto">{role}</span>
        <button
          onClick={onClose}
          aria-label="Close assistant"
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

          <div className="flex gap-1 px-3 pt-3">
            {(["search", "ask"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`pill flex-1 ${view === v ? "!bg-lime-300 !text-black font-semibold" : ""}`}
              >
                {v === "search" ? "Find anything" : "Ask AI"}
              </button>
            ))}
          </div>

          {view === "search" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative p-3">
                <Search className="pointer-events-none absolute left-[24px] top-[20px] h-4 w-4 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search features, pages, parts…"
                  className="field w-full pl-9"
                />
              </div>
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {!q && (
                  <p className="muted p-2 text-sm">
                    Instant offline search over the platform: type “reorder”, “invoice”, “brake”, any SKU or feature name.
                  </p>
                )}
                {featureHits.map((f) => (
                  <button key={f.label} onClick={() => go(f)} className="mb-1.5 block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-lime-300/40 hover:bg-white/10">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <PanelRightOpen className="h-3.5 w-3.5 text-lime-300" />
                      {f.label}
                    </span>
                    <span className="muted block text-xs">{f.desc}</span>
                  </button>
                ))}
                {productHits.length > 0 && (
                  <p className="tag mt-2 px-1">IN THE CATALOGUE ({productHits.length})</p>
                )}
                {productHits.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => window.open(`/parts/${p.id}`, "_blank")}
                    title="Open the public part page"
                    className="mb-1.5 block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-lime-300/40 hover:bg-white/10"
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="truncate">{p.name}</span>
                      <span className={`shrink-0 ${stockBadgeClass(p.stock)}`}>{p.stock} in stock</span>
                    </span>
                    <span className="muted flex justify-between text-xs">
                      <span>{p.sku}</span>
                      <span>{fmt(p.selling_price)}</span>
                    </span>
                  </button>
                ))}
                {q && !featureHits.length && !productHits.length && (
                  <p className="muted p-2 text-sm">No match for “{query}”. Try “sale”, “stock”, “report”…</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {aiStatus !== null && aiStatus !== "" && (
                  <div className="badge badge-warn w-full whitespace-normal p-2 text-xs">⚠ {aiStatus}</div>
                )}
                {!turns.length && (
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-sm font-medium">Your garage copilot — it knows every screen, every workflow and your live numbers.</p>
                    <p className="muted mt-1 text-xs">
                      {role === "BOSS"
                        ? "Ask for insights, item costs, staff activity, what to reorder — or how any feature works."
                        : "Ask how anything works, find a part and its selling price, or get help with your daily workflows."}
                    </p>
                  </div>
                )}
                {!turns.length && (
                  <div className="flex flex-wrap gap-1.5 p-1">
                    {chips.map((c) => (
                      <button key={c} onClick={() => send(c)} className="pill text-left text-xs transition hover:!bg-lime-300/80">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {turns.map((t, i) =>
                  t.role === "user" ? (
                    <div key={i} className="ml-auto max-w-[85%] overflow-hidden rounded-2xl rounded-br-sm bg-lime-300/90 px-3 py-2 text-sm text-black">
                      <Rich text={t.content} />
                    </div>
                  ) : (
                    <div key={i} className="mr-auto max-w-[92%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      {!t.content && busy && i === turns.length - 1 ? (
                        <span className="flex gap-1 py-0.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lime-300" style={{ animationDelay: "-0.3s" }} />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lime-300" style={{ animationDelay: "-0.15s" }} />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lime-300" />
                        </span>
                      ) : (
                        <>
                          <Rich text={t.content} />
                          {t.navigation && <button onClick={() => { onNavigate(t.navigation!); onClose(); }} className="mt-2 block rounded-lg border border-lime-300/30 bg-lime-300/10 px-2.5 py-1.5 text-xs font-semibold text-lime-200 hover:bg-lime-300/20">Open {t.navigation} →</button>}
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>
              <div className="border-t border-white/10 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={busy ? "Assistant is answering…" : "Ask about sales, stock, customers or how anything works…"}
                    className="field max-h-28 flex-1 resize-none text-sm"
                    disabled={busy}
                  />
                  {busy ? (
                    <button onClick={() => abortRef.current?.abort()} aria-label="Stop" className="btn btn-ghost !px-3">
                      <Square className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => send()} aria-label="Send" className="btn btn-primary !px-3">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="muted mt-1 flex items-center justify-between text-[11px]">
                  <span>Grounded in live garage data · {role === "BOSS" ? "full analytics" : "operations only for staff"}</span>
                  {turns.length > 0 && !busy && (
                    <span className="flex gap-2">
                      <button
                        className="hover:text-lime-300"
                        onClick={() => {
                          const last = [...turns].reverse().find((t) => t.role === "assistant" && t.content && !t.content.startsWith("⚠"));
                          if (last) navigator.clipboard?.writeText(last.content).catch(() => {});
                        }}
                      >
                        Copy last
                      </button>
                      <button className="hover:text-lime-300" onClick={() => setTurns([])}>
                        Clear
                      </button>
                    </span>
                  )}
                </p>
              </div>
            </div>
      )}
    </aside>
  );
}
