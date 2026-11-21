import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "@/lib/ai-provider";

type NotificationRow = { id: string; title: string; message: string; category: string; created_at: string };
type Boss = { id: string };
type ClaimedNotification = NotificationRow & { bossId: string };
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
function config() {
  const ai = aiConfig();
  return {
    resendKey: process.env.RESEND_API_KEY || "",
    from: process.env.NOTIFICATION_EMAIL_FROM?.trim() || "",
    bossEmail: process.env.BOSS_ALERT_EMAIL?.trim() || "",
    aiKey: ai.apiKey,
    aiBase: ai.baseUrl,
    aiModel: ai.model,
  };
}
async function recipientForBoss(admin: SupabaseClient, bossId: string, configuredEmail: string) {
  if (configuredEmail) return configuredEmail;
  const result = await admin.auth.admin.getUserById(bossId);
  return result.data.user?.email?.trim() || "";
}
async function evaluateWithAi(items: NotificationRow[]) {
  const urgent = items.some((item) => ["LOW_STOCK", "OUT_OF_STOCK"].includes(item.category));
  const fallback = {
    subject: `Panther Garage: ${items.length} new notification${items.length === 1 ? "" : "s"}${urgent ? " · stock alert" : ""}`,
    summary: urgent ? "A stock alert needs review. Check the current inventory before the next sale." : `${items.length} new garage notification${items.length === 1 ? "" : "s"} need review.`,
    priority: urgent ? "HIGH" : "NORMAL",
  };
  const cfg = config();
  if (!cfg.aiKey || !items.length) return fallback;
  try {
    const response = await fetch(`${cfg.aiBase}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.aiModel, temperature: 0.1, max_tokens: 240,
        messages: [
          { role: "system", content: "You triage garage business alerts. Return only JSON with subject, summary, priority where priority is HIGH, MEDIUM, or NORMAL. Do not invent facts." },
          { role: "user", content: JSON.stringify(items.map(({ title, message, category, created_at }) => ({ title, message, category, created_at }))) },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(text).replace(/^```json\s*|\s*```$/g, ""));
    if (typeof parsed.subject !== "string" || typeof parsed.summary !== "string") return fallback;
    return {
      subject: parsed.subject.slice(0, 140),
      summary: parsed.summary.slice(0, 1200),
      priority: ["HIGH", "MEDIUM", "NORMAL"].includes(parsed.priority) ? parsed.priority : fallback.priority,
    };
  } catch { return fallback; }
}
async function pendingForBoss(admin: SupabaseClient, bossId: string) {
  const { data, error } = await admin.from("notifications")
    .select("id,title,message,category,created_at").eq("recipient_id", bossId).is("read_at", null)
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const rows = (data || []) as NotificationRow[];
  if (!rows.length) return [] as ClaimedNotification[];
  const { data: claims, error: claimError } = await admin.rpc("claim_boss_email_notifications", {
    p_boss_id: bossId, p_notification_ids: rows.map((row) => row.id),
  });
  if (claimError) throw claimError;
  const claimedIds = new Set(((claims || []) as { notification_id: string }[]).map((row) => row.notification_id));
  return rows.filter((row) => claimedIds.has(row.id)).map((row) => ({ ...row, bossId }));
}
async function finishClaims(admin: SupabaseClient, items: ClaimedNotification[], status: "SENT" | "FAILED") {
  const grouped = new Map<string, string[]>();
  for (const item of items) grouped.set(item.bossId, [...(grouped.get(item.bossId) || []), item.id]);
  for (const [bossId, notificationIds] of grouped) {
    const { error } = await admin.rpc("finish_boss_email_notifications", { p_boss_id: bossId, p_notification_ids: notificationIds, p_delivery_status: status });
    if (error) throw error;
  }
}
async function sendDigest(resendKey: string, from: string, recipient: string, items: ClaimedNotification[]) {
  const evaluation = await evaluateWithAi(items);
  const list = items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.message)} <small>(${escapeHtml(item.category)})</small></li>`).join("");
  const ids = items.map((item) => item.id).sort().join(",");
  const idempotencyKey = createHash("sha256").update(`${recipient.trim().toLowerCase()}|${ids}`).digest("hex");
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from, to: [recipient], subject: evaluation.subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(evaluation.subject)}</h2><p><strong>Priority: ${escapeHtml(evaluation.priority)}</strong></p><p>${escapeHtml(evaluation.summary)}</p><hr><ul>${list}</ul><p style="color:#666;font-size:12px">Open Panther Garage to review and mark notifications as read.</p></div>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
}
/** Send pending Boss alerts; claims and provider idempotency make retries safe. */
export async function dispatchBossNotificationEmail(admin: SupabaseClient) {
  const cfg = config();
  if (!cfg.resendKey || !cfg.from) return { configured: false, sent: 0 };
  const { data: bosses, error } = await admin.from("profiles").select("id").eq("role", "BOSS").eq("active", true);
  if (error) throw error;
  if (!bosses?.length) return { configured: false, sent: 0 };
  const groups = new Map<string, string[]>();
  for (const boss of bosses as Boss[]) {
    const recipient = await recipientForBoss(admin, boss.id, cfg.bossEmail);
    if (!recipient) continue;
    const normalized = recipient.toLowerCase();
    groups.set(normalized, [...(groups.get(normalized) || []), boss.id]);
  }
  if (!groups.size) return { configured: false, sent: 0 };
  let sent = 0;
  for (const [normalizedRecipient, bossIds] of groups) {
    const recipient = cfg.bossEmail || normalizedRecipient;
    const claimed: ClaimedNotification[] = [];
    try {
      for (const bossId of bossIds) claimed.push(...await pendingForBoss(admin, bossId));
      if (!claimed.length) continue;
      const response = await sendDigest(cfg.resendKey, cfg.from, recipient, claimed);
      if (!response.ok) throw new Error("Notification email provider rejected the digest");
      await finishClaims(admin, claimed, "SENT");
      sent += claimed.length;
    } catch (error) {
      if (claimed.length) {
        try { await finishClaims(admin, claimed, "FAILED"); } catch { /* Stale claims can be reclaimed safely. */ }
      }
      throw error;
    }
  }
  return { configured: true, sent };
}
