#!/usr/bin/env node
/**
 * Confirms the BOSS side of migration 013: with a boss profile, the same
 * employee token must be able to read inventory_batches (supplier costs).
 * The demo account is promoted, tested, and demoted back to EMPLOYEE.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL = "employee@pgms.demo";
const PASSWORD = "Pgms@Employee123";

async function api(path, init = {}) {
  if (init.body && typeof init.body !== "string") init = { ...init, body: JSON.stringify(init.body) };
  const r = await fetch(`${url}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${init.token || key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
}

// Locate the existing demo user and sign in.
const users = await api("/auth/v1/admin/users?page=1&per_page=200");
const demo = (users.body?.users || []).find((u) => u.email === EMAIL);
if (!demo) { console.error("demo user not found — run create-demo-employee.mjs first"); process.exit(1); }
const tokenRes = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
const token = tokenRes.body?.access_token;
if (!token) { console.error("sign-in failed", tokenRes.status); process.exit(1); }

try {
  const empRead = await api("/rest/v1/inventory_batches?select=unit_cost&limit=1", { token });
  const empBlocked = empRead.status >= 400 || (Array.isArray(empRead.body) && empRead.body.length === 0);
  console.log(`${empBlocked ? "PASS" : "FAIL"}  as EMPLOYEE: batches unreadable (HTTP ${empRead.status}, ${(empRead.body || []).length ?? "?"} row(s))`);

  await api(`/rest/v1/profiles?id=eq.${demo.id}`, { method: "PATCH", body: { role: "BOSS" } });

  const bossRead = await api("/rest/v1/inventory_batches?select=unit_cost&limit=3", { token });
  const bossOk = bossRead.status === 200 && Array.isArray(bossRead.body) && bossRead.body.length > 0;
  console.log(`${bossOk ? "PASS" : "FAIL"}  as BOSS (same token, promoted profile): costs readable (HTTP ${bossRead.status}, ${(bossRead.body || []).length ?? 0} row(s))`);

  console.log(empBlocked && bossOk ? "\n013 verified: owner view intact, staff view sealed." : "\nInvestigate the FAIL line above.");
  process.exitCode = empBlocked && bossOk ? 0 : 1;
} finally {
  await api(`/rest/v1/profiles?id=eq.${demo.id}`, { method: "PATCH", body: { role: "EMPLOYEE" } });
  console.log("cleanup: demo profile restored to EMPLOYEE");
}
