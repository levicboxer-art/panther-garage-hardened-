// One-off upstream probe for the new OpenRouter key (not streamed through the app).
// Reads the key from .env.local; prints only statuses and answer text.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const KEY = process.env.OPENROUTER_TEST_KEY || env.DEEPSEEK_API_KEY;
const BASE = (env.DEEPSEEK_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const MODEL = env.DEEPSEEK_MODEL || "deepseek/deepseek-v4.1-flash-1017";

const r = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "Reply with exactly: streaming-works" }],
    stream: true,
    max_tokens: 32,
  }),
});
console.log("status:", r.status, "| model:", MODEL, "| base:", BASE);
if (!r.ok) {
  console.log((await r.text()).slice(0, 300));
  process.exit(1);
}
const reader = r.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let answer = "";
let rawSamples = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") continue;
    if (rawSamples.length < 2) rawSamples.push(payload.slice(0, 160));
    try {
      const j = JSON.parse(payload);
      const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
      if (delta) answer += delta;
    } catch {
      /* keep buffering */
    }
  }
}
console.log("raw data-line samples:", JSON.stringify(rawSamples, null, 1));
console.log("streamed answer:", JSON.stringify(answer));
