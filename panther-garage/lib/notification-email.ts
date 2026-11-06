import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: string;
  created_at: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function config() {
  return {
    resendKey: process.env.RESEND_API_KEY || "",
    from: process.env.NOTIFICATION_EMAIL_FROM || "Panther Garage <alerts@example.com>",
    bossEmail: process.env.BOSS_ALERT_EMAIL || "",
    aiKey: process.env.DEEPSEEK_API_KEY || "",
    aiBase: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    aiModel: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  };
}

async function evaluateWithAi(items: NotificationRow[]) {
  const fallback = {
    subject: `Panther Garage: ${items.length} new notification${items.length === 1 ? "" : "s"}`,
    summary: items.map((item) => `${item.title}: ${item.message}`).join(" "),
    priority: items.some((item) => item.category === "LOW_STOCK") ? "HIGH" : "NORMAL",
  };
  const cfg = config();
  if (!cfg.aiKey || !items.length) return fallback;
  try {
    const response = await fetch(`${cfg.aiBase}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.aiModel,
        temperature: 0.1,
        max_tokens: 240,
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
  } catch {
    return fallback;
  }
}

export async function dispatchBossNotificationEmail(admin: SupabaseClient) {
  const cfg = config();
  if (!cfg.resendKey || !cfg.bossEmail) return { configured: false, sent: 0 };

  const { data: bosses, error: bossError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "BOSS")
    .eq("active", true);
  if (bossError) throw bossError;

  let sent = 0;
  for (const boss of bosses || []) {
    const { data: notifications, error } = await admin
      .from("notifications")
      .select("id,title,message,category,created_at")
      .eq("recipient_id", boss.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = (notifications || []) as NotificationRow[];
    if (!rows.length) continue;

    const { data: delivered, error: deliveryError } = await admin
      .from("notification_email_deliveries")
      .select("notification_id")
      .eq("boss_id", boss.id)
      .in("notification_id", rows.map((row) => row.id));
    if (deliveryError) throw deliveryError;
    const deliveredIds = new Set((delivered || []).map((row) => row.notification_id));
    const pending = rows.filter((row) => !deliveredIds.has(row.id));
    if (!pending.length) continue;

    const evaluation = await evaluateWithAi(pending);
    const list = pending.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.message)} <small>(${escapeHtml(item.category)})</small></li>`).join("");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [cfg.bossEmail],
        subject: evaluation.subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:680px"><h2>${escapeHtml(evaluation.subject)}</h2><p><strong>AI priority: ${escapeHtml(evaluation.priority)}</strong></p><p>${escapeHtml(evaluation.summary)}</p><hr><ul>${list}</ul><p style="color:#666;font-size:12px">Open Panther Garage to review and mark notifications as read.</p></div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) continue;
    const { error: markError } = await admin.from("notification_email_deliveries").insert(
      pending.map((item) => ({ notification_id: item.id, boss_id: boss.id })),
    );
    if (markError && markError.code !== "23505") throw markError;
    sent += pending.length;
  }
  return { configured: true, sent };
}
