"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCheck, MessageCircle, Send, Users } from "lucide-react";

type Contact = { id: string; full_name: string; role: "BOSS" | "EMPLOYEE"; active: boolean };
type Message = { id: string; sender_id: string; recipient_id: string; body: string; read_at: string | null; created_at: string };

export default function ChatWorkspace({ profileId, role }: { profileId: string; role: "BOSS" | "EMPLOYEE" }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [peer, setPeer] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeContact = useMemo(() => contacts.find((contact) => contact.id === peer), [contacts, peer]);

  async function load(nextPeer = peer) {
    const url = nextPeer ? `/api/chat?peer=${encodeURIComponent(nextPeer)}` : "/api/chat";
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Chat is unavailable."); return; }
    setContacts(data.contacts || []);
    if (!nextPeer && !peer && data.contacts?.[0]) setPeer(data.contacts[0].id);
    setMessages(data.messages || []);
    if (nextPeer) await fetch("/api/chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer_id: nextPeer }) });
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!peer) return;
    void load(peer);
    const timer = window.setInterval(() => void load(peer), 12000);
    return () => window.clearInterval(timer);
  }, [peer]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !peer) return;
    setBusy(true); setError("");
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient_id: peer, body }) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) { setError(data.error || "Message could not be sent."); return; }
    setDraft("");
    setMessages((current) => [...current, data.message]);
  }

  return <section className="card overflow-hidden">
    <div className="p-5 border-b border-line flex items-center justify-between gap-3">
      <div><div className="tag flex items-center gap-2"><MessageCircle size={12} /> TEAM CHANNEL</div><h2 className="font-bold text-lg mt-2">Staff chat</h2><p className="text-xs muted mt-1">Private, direct communication between the Boss and active staff.</p></div>
      <div className="badge"><Users size={13} /> {contacts.length} contact{contacts.length === 1 ? "" : "s"}</div>
    </div>
    <div className="grid md:grid-cols-[240px_1fr] min-h-[520px]">
      <aside className="border-b md:border-b-0 md:border-r border-line p-3">
        <div className="text-[10px] muted uppercase tracking-[0.16em] px-2 py-2">{role === "BOSS" ? "Employees" : "Garage leadership"}</div>
        <div className="space-y-1">{contacts.map((contact) => <button key={contact.id} onClick={() => setPeer(contact.id)} className={`w-full text-left rounded-xl p-3 transition ${peer === contact.id ? "bg-lime/10 border border-lime/30" : "hover:bg-white/5 border border-transparent"}`}><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-lime" /><span className="text-sm font-semibold truncate">{contact.full_name}</span></div><div className="text-[10px] muted mt-1 pl-4">{contact.role}</div></button>)}</div>
        {!contacts.length && <p className="text-xs muted p-2">No active contacts are available yet.</p>}
      </aside>
      <div className="flex flex-col min-h-[520px]">
        <div className="px-5 py-4 border-b border-line flex justify-between items-center"><div><div className="text-sm font-semibold">{activeContact?.full_name || "Select a colleague"}</div><div className="text-[10px] muted">{activeContact ? "Messages are visible only to this conversation" : "Choose a contact to start"}</div></div><CheckCheck size={17} className="muted" /></div>
        <div className="flex-1 p-5 space-y-3 overflow-y-auto bg-black/10">{messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === profileId ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.sender_id === profileId ? "bg-lime text-black rounded-br-sm" : "bg-white/5 border border-line rounded-bl-sm"}`}><p className="text-sm whitespace-pre-wrap break-words">{message.body}</p><div className={`text-[10px] mt-2 ${message.sender_id === profileId ? "text-black/60" : "muted"}`}>{new Date(message.created_at).toLocaleString()}</div></div></div>)}{!messages.length && <div className="h-full grid place-items-center text-center"><div><MessageCircle className="mx-auto text-lime/60 mb-3" size={28} /><p className="text-sm muted">{activeContact ? "No messages yet. Start the conversation." : "Select a colleague to open a conversation."}</p></div></div>}</div>
        <form onSubmit={send} className="p-4 border-t border-line flex gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!peer || busy} maxLength={2000} rows={2} className="field flex-1 resize-none" placeholder={peer ? "Write a clear update…" : "Select a colleague first"} /><button disabled={!peer || !draft.trim() || busy} className="btn btn-primary self-end"><Send size={15} /> Send</button></form>
        {error && <p role="alert" className="px-4 pb-4 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  </section>;
}
