"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, CircleDollarSign, Info, Mail, RefreshCw, ShieldAlert, X } from "lucide-react";

type Notice = { id: string; title: string; message: string; category: string; read_at: string | null; created_at: string };
type EmailState = "idle" | "sent" | "none" | "off" | "error";

const categoryStyle: Record<string, { icon: typeof Bell; label: string; tone: string }> = {
  LOW_STOCK: { icon: AlertTriangle, label: "Stock alert", tone: "text-amber-300 bg-amber-300/10 border-amber-300/20" },
  OUT_OF_STOCK: { icon: AlertTriangle, label: "Out of stock", tone: "text-red-300 bg-red-300/10 border-red-300/20" },
  APPROVAL: { icon: ShieldAlert, label: "Approval", tone: "text-orange-300 bg-orange-300/10 border-orange-300/20" },
  EXPENSE: { icon: CircleDollarSign, label: "Finance", tone: "text-cyan-300 bg-cyan-300/10 border-cyan-300/20" },
  PURCHASE: { icon: Bell, label: "Purchasing", tone: "text-violet-300 bg-violet-300/10 border-violet-300/20" },
  MESSAGE: { icon: Mail, label: "New message", tone: "text-lime bg-lime/10 border-lime/20" },
};

export default function NotificationCenter({ role }: { role: "BOSS" | "EMPLOYEE" }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [emailState, setEmailState] = useState<EmailState>("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setItems(data.notifications || []);
        setUnread(Number(data.unread) || 0);
        setError("");
      } else {
        setError(data.error || "Notifications unavailable.");
      }
    } catch {
      setError("Notifications unavailable. Check the connection and refresh.");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [role]);

  async function sendDigest() {
    setSendingEmail(true);
    setEmailMessage("");
    setEmailState("idle");
    try {
      const response = await fetch("/api/notifications/email", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setEmailState("error");
        setEmailMessage(data.error || "Could not send the digest.");
      } else if (data.configured === false) {
        setEmailState("off");
        setEmailMessage("Boss email delivery is not configured.");
      } else if (Number(data.sent) > 0) {
        setEmailState("sent");
        setEmailMessage(`${data.sent} alert${data.sent === 1 ? "" : "s"} emailed to the Boss.`);
      } else {
        setEmailState("none");
        setEmailMessage("There are no pending Boss alerts to email.");
      }
    } catch {
      setEmailState("error");
      setEmailMessage("Could not send the digest. Try again shortly.");
    } finally {
      setSendingEmail(false);
    }
  }

  async function mark(id?: string) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { mark_all: true }),
      });
      if (response.ok) void load();
      else {
        const data = await response.json();
        setError(data.error || "Could not update notifications.");
      }
    } catch {
      setError("Could not update notifications. Check the connection and try again.");
    }
  }

  const highPriority = useMemo(() => items.filter((item) => !item.read_at && ["LOW_STOCK", "OUT_OF_STOCK"].includes(item.category)).length, [items]);

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) void load(); }}
        className={`relative p-2 rounded-lg border ${highPriority ? "border-amber-300/50 text-amber-300" : "border-line text-gray-400"}`}
      >
        <Bell size={17} />
        {unread > 0 && <span className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-black text-[9px] font-bold grid place-items-center ${highPriority ? "bg-amber-300" : "bg-lime"}`}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <div className="notification-panel absolute right-0 top-12 z-40 w-[min(420px,92vw)] card shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-line">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="flex items-center gap-2"><b className="text-sm">Notification center</b>{highPriority > 0 && <span className="badge badge-warn">{highPriority} stock alert{highPriority === 1 ? "" : "s"}</span>}</div>
              <div className="text-[10px] muted mt-1">{unread} unread · alerts refresh automatically</div>
            </div>
            <div className="flex gap-2"><button title="Refresh" aria-label="Refresh notifications" onClick={() => void load()} className="p-1 muted"><RefreshCw size={15} /></button><button title="Mark all as read" aria-label="Mark all as read" onClick={() => void mark()} className="p-1 muted"><CheckCheck size={16} /></button><button title="Close" aria-label="Close notifications" onClick={() => setOpen(false)} className="p-1 muted"><X size={16} /></button></div>
          </div>
          {role === "BOSS" && <div className="mt-3 rounded-lg border border-line px-3 py-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 muted"><Mail size={13} />{emailMessage || "Send a pending alert digest to the Boss email."}</span>
              <button type="button" onClick={() => void sendDigest()} disabled={sendingEmail} className="btn btn-ghost text-[10px] shrink-0 disabled:opacity-50">
                {sendingEmail ? "Sending…" : "Send digest"}
              </button>
            </div>
            <span className="sr-only" aria-live="polite">{emailState === "sent" || emailState === "none" || emailState === "off" || emailState === "error" ? emailMessage : ""}</span>
          </div>}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {error && <p className="p-4 text-xs text-red-300" role="alert">{error}</p>}
          {items.map((item) => {
            const style = categoryStyle[item.category] || { icon: Info, label: "Update", tone: "text-gray-300 bg-white/5 border-line" };
            const Icon = style.icon;
            return <button key={item.id} onClick={() => void mark(item.id)} className={`w-full text-left p-4 border-b border-line hover:bg-white/5 ${!item.read_at ? "bg-lime/5" : "opacity-70"}`}>
              <div className="flex gap-3">
                <span className={`w-8 h-8 rounded-lg border grid place-items-center shrink-0 ${style.tone}`}><Icon size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-3"><b className="text-xs">{item.title}</b>{!item.read_at && <span className="w-2 h-2 rounded-full bg-lime shrink-0 mt-1" />}</span>
                  <span className="text-[10px] uppercase tracking-wider muted">{style.label}</span>
                  <p className="text-xs muted mt-1 leading-5">{item.message}</p>
                  <span className="text-[10px] muted mt-2 block">{new Date(item.created_at).toLocaleString()}</span>
                </span>
              </div>
            </button>;
          })}
          {!items.length && !error && <div className="p-8 text-center"><Info className="mx-auto text-lime mb-2" size={22} /><p className="text-sm muted">You are all caught up.</p></div>}
        </div>
      </div>}
    </div>
  );
}
