#!/usr/bin/env node
/**
 * Creates (or re-creates) the demo EMPLOYEE login used to exercise the
 * employee dashboard. Safe to run repeatedly: the account is deleted and
 * rebuilt so the demo password always matches what is printed.
 *
 * Usage: node scripts/create-demo-employee.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
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
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
}

// Remove any previous instance (profiles/shift reports cascade with the user).
const list = await api(`/auth/v1/admin/users?page=1&per_page=200`);
const existing = (list.body?.users || []).find((u) => u.email === EMAIL);
if (existing) {
  const del = await api(`/auth/v1/admin/users/${existing.id}`, { method: "DELETE" });
  console.log(`removed previous demo user (HTTP ${del.status})`);
}

const created = await api("/auth/v1/admin/users", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD, email_confirm: true, data: { full_name: "Demo Employee" } },
});
if (!created.body?.id) {
  console.error("FAILED to create demo employee:", JSON.stringify(created.body).slice(0, 200));
  process.exit(1);
}

const profile = await api(`/rest/v1/profiles?select=role,active&id=eq.${created.body.id}`, {});
console.log("demo employee ready:");
console.log(`  email:    ${EMAIL}`);
console.log(`  password: ${PASSWORD}`);
console.log(`  role:     ${JSON.stringify(profile.body)}`);
