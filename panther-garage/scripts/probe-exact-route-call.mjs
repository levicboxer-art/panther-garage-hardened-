// Replicates the EXACT upstream call the assistant route makes (same headers,
// body shape, streaming), to determine whether the stall is provider-side or
// inside the Next dev server process. Reads config from .env.local.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const KEY = env.DEEPSEEK_API_KEY;
const BASE = (env.DEEPSEEK_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const MODEL = env.DEEPSEEK_MODEL || "deepseek/deepseek-v4.1-flash-1017";

const SYSTEM = `You are the Panther Garage AI assistant. Answer concisely. ${"PANTHER GARAGE PLATFORM MAP filler for size parity. ".repeat(60)}`;
const body = {
  model: MODEL,
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: "How do I submit my shift report?" },
  ],
  stream: true,
  temperature: 0.3,
  max_tokens: 1200,
};

const t0 = Date.now();
const r = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(90_000),
});
console.log(`status: ${r.status} after ${Date.now() - t0}ms`);
if (!r.ok) {
  console.log((await r.text()).slice(0, 300));
  process.exit(1);
}
const reader = r.body.getReader();
const dec = new TextDecoder();
let buffer = "";
let answer = "";
let firstTokenAt = 0;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += dec.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload);
      const piece = j.choices?.[0]?.delta?.content;
      if (typeof piece === "string" && piece) {
        if (!firstTokenAt) firstTokenAt = Date.now();
        answer += piece;
      }
    } catch {}
  }
  if (Date.now() - t0 > 60_000) {
    console.log("BAILED at 60s — stream stalled before completion");
    break;
  }
}
console.log(`first token: ${firstTokenAt ? firstTokenAt - t0 + "ms" : "NONE"}`);
console.log(`total: ${Date.now() - t0}ms, answer chars: ${answer.length}`);
console.log("answer:", answer.slice(0, 400));
