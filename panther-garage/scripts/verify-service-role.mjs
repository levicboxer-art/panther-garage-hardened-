#!/usr/bin/env node
/**
 * Verifies the server-only Supabase service-role key without ever printing it.
 *
 * Usage: node scripts/verify-service-role.mjs
 *
 * Checks:
 *   1. SUPABASE_SERVICE_ROLE_KEY is present in .env.local
 *   2. REST reads of `profiles` bypass RLS and return rows
 *   3. Auth Admin API (`/auth/v1/admin/users`) accepts the key
 *   4. Stage 8 catalogue RPC/table state (informational)
 *
 * Exit code 0 means the key was accepted by both REST and the Auth Admin API.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", ".env.local");

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

const env = parseEnv(envPath);
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url) {
  fail("NEXT_PUBLIC_SUPABASE_URL is empty in .env.local");
  process.exit();
}

console.log(`Project host: ${new URL(url).host}`);

if (!key) {
  fail("SUPABASE_SERVICE_ROLE_KEY is empty in .env.local (line 8)");
  process.exit();
}

const isNewSecret = key.startsWith("sb_secret_");
const isLegacyJwt = key.startsWith("eyJ");
console.log(
  `Key loaded: ${isNewSecret ? "new sb_secret_ key" : isLegacyJwt ? "legacy JWT key" : "unrecognised format"}, length ${key.length}`
);

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function request(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function describeError(body) {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 160);
  return body.message || body.error_description || body.error || JSON.stringify(body).slice(0, 160);
}

// 1. REST read: service-role bypasses RLS, so this returns every profile.
try {
  const { response, body } = await request("/rest/v1/profiles?select=id,role,active&limit=1000");
  if (response.ok) {
    const rows = Array.isArray(body) ? body : [];
    const roles = rows.reduce((acc, row) => {
      const role = row.role || "UNKNOWN";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const active = rows.filter((row) => row.active).length;
    console.log(`PASS  REST profiles read: HTTP ${response.status}, ${rows.length} row(s), active ${active}`);
    console.log(`      roles: ${Object.keys(roles).length ? JSON.stringify(roles) : "none"}`);
  } else {
    fail(`REST profiles read: HTTP ${response.status} ${describeError(body)}`);
  }
} catch (error) {
  fail(`REST profiles read threw: ${error.message}`);
}

// 2. Auth Admin API: only a service-role/secret key is accepted here.
try {
  const { response, body } = await request("/auth/v1/admin/users?page=1&per_page=1");
  if (response.ok) {
    const total = response.headers.get("x-total-count");
    const users = Array.isArray(body?.users) ? body.users.length : 0;
    console.log(`PASS  Auth Admin users: HTTP ${response.status}, total ${total ?? "unknown"}, page size ${users}`);
  } else {
    fail(`Auth Admin users: HTTP ${response.status} ${describeError(body)}`);
  }
} catch (error) {
  fail(`Auth Admin users threw: ${error.message}`);
}

// 3. Stage 8 state (informational only; does not affect the exit code).
try {
  const { response, body } = await request("/rest/v1/rpc/public_catalogue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (response.ok) {
    const count = Array.isArray(body) ? body.length : "unknown";
    console.log(`INFO  Stage 8 public_catalogue RPC: HTTP ${response.status}, ${count} item(s)`);
  } else {
    console.log(`INFO  Stage 8 public_catalogue RPC: HTTP ${response.status} ${describeError(body)}`);
  }
} catch (error) {
  console.log(`INFO  Stage 8 public_catalogue RPC threw: ${error.message}`);
}

if (process.exitCode) {
  console.error("\nKey verification failed. Nothing was changed in the database.");
} else {
  console.log("\nKey verification passed. Safe to restart the dev server and run the BOSS flow.");
}
