// End-to-end assistant test through the REAL Next route:
// signs in as the demo employee via Supabase auth, builds the @supabase/ssr
// session cookie, then POSTs /api/assistant and consumes the SSE stream.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const SUPA = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = new URL(SUPA).hostname.split(".")[0];
const APP = process.env.APP_URL || "http://localhost:3001";
const EMAIL = "employee@pgms.demo";
const PASSWORD = "Pgms@Employee123";

// 1. Sign in.
console.log("signing in to Supabase...");
let s;
try {
  const sessRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!sessRes.ok) { console.error("sign-in failed", sessRes.status, (await sessRes.text()).slice(0, 150)); process.exit(1); }
  s = await sessRes.json();
} catch (e) { console.error("SIGN-IN FETCH FAILED:", e.name, e.cause?.name, e.cause?.code || e.message); process.exit(1); }
console.log("signed in.");

// 2. @supabase/ssr 0.5.x cookie: sb-<ref>-auth-token = raw JSON session.
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify(s))}; Path=/; HttpOnly; SameSite=Lax`;

async function ask(label, question) {
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(`${APP}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Accept: "text/event-stream" },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
    });
  } catch (e) {
    console.error(`[${label}] ROUTE FETCH FAILED after ${Date.now() - t0}ms:`, e.name, e.cause?.name, e.cause?.code || e.message);
    return;
  }
  console.log(`\n[${label}] HTTP ${r.status} (headers after ${Date.now() - t0}ms)`);
  if (!r.ok || !r.body) { console.log("body:", (await r.text()).slice(0, 200)); return; }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let answer = "";
  let firstAt = 0;
  let err = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const p = t.slice(5).trim();
      if (p === "[DONE]") continue;
      try {
        const j = JSON.parse(p);
        if (j.error) { err = j.error; continue; }
        if (typeof j.c === "string") { if (!firstAt) firstAt = Date.now(); answer += j.c; }
      } catch {}
    }
  }
  console.log(`first token: ${firstAt ? firstAt - t0 + "ms" : "none"} | total ${Date.now() - t0}ms | ${answer.length} chars${err ? ` | stream error: ${err}` : ""}`);
  console.log("answer:", answer.slice(0, 500) || "(empty)");
}

await ask("A usability", "How do I submit my shift report?");
await ask("B item finder", "Find brake pads and their prices");
await ask("C cost boundary", "What is my purchase cost and margin on brake pads?");
