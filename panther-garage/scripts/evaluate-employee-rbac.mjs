#!/usr/bin/env node
/**
 * Live evaluation of the Stage 9 employee-dashboard RBAC.
 *
 * Creates a throwaway EMPLOYEE account (Admin API, auto-confirmed), signs in
 * with it, and runs the sensitive operations the policy says staff may NOT do
 * — plus a few they MUST be able to do. Nothing secret is printed: the
 * password and tokens live only in memory and the user is deleted at the end.
 *
 * Usage: node scripts/evaluate-employee-rbac.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", ".env.local");

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = parseEnv(envPath);
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("FAIL  NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, { asAdmin = false, token = null, method = "GET", body = null, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      apikey: key,
      ...(asAdmin || token
        ? { Authorization: `Bearer ${token || key}` }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const response = await fetch(`${url}${path}`, init);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const email = `rbac-eval-${randomUUID().slice(0, 8)}@eval.invalid`;
const password = randomUUID() + randomUUID();
let userId = null;

try {
  // 1. Create the ephemeral employee (DB trigger assigns role EMPLOYEE).
  const created = await call("/auth/v1/admin/users", {
    asAdmin: true,
    method: "POST",
    body: { email, password, email_confirm: true, data: { full_name: "RBAC Evaluation" } },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`could not create eval user: HTTP ${created.status}`);

  // 2. Sign in as that employee.
  const tokenRes = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  const token = tokenRes.body?.access_token;
  if (!token) throw new Error(`employee sign-in failed: HTTP ${tokenRes.status}`);
  const emp = (p, opts = {}) => call(p, { ...opts, token });

  // Reference rows via service role (reads only).
  const product = await call("/rest/v1/products?select=id,selling_price&active=eq.true&limit=1", { asAdmin: true });
  const productId = product.body?.[0]?.id;
  const bossRow = await call("/rest/v1/profiles?select=id&role=eq.BOSS&limit=1", { asAdmin: true });
  const bossId = bossRow.body?.[0]?.id;

  // --- attacks that MUST be blocked -------------------------------------
  const insertProduct = await emp("/rest/v1/products", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { sku: `EVAL-${randomUUID().slice(0, 6)}`, name: "Eval smuggled product", selling_price: 1, minimum_stock: 0, unit: "piece" },
  });
  check("Employee cannot register products (RLS insert policy)", insertProduct.status >= 400, `HTTP ${insertProduct.status}`);

  const receive = await emp("/rest/v1/rpc/receive_stock", {
    method: "POST",
    body: { p_product_id: productId, p_quantity: 1, p_unit_cost: 500 },
  });
  const receiveMsg = JSON.stringify(receive.body || "");
  const blocked = receive.status >= 400 && /owner/i.test(receiveMsg);
  check("Employee cannot receive goods (012 boss-guard in receive_stock)", blocked, `HTTP ${receive.status} ${receiveMsg.slice(0, 90)}`);
  if (receive.status >= 400 && !/owner/i.test(receiveMsg)) {
    console.log("      note: blocked, but with the OLD error text — was 012 applied to this project?");
  }

  const patchPrice = await emp(`/rest/v1/products?id=eq.${productId}`, {
    method: "PATCH",
    body: { selling_price: 1.23 },
  });
  const after = await call("/rest/v1/products?select=selling_price&id=eq." + productId, { asAdmin: true });
  const unchanged = String(after.body?.[0]?.selling_price) === String(product.body?.[0]?.selling_price);
  check("Employee cannot edit prices (products update leaves data untouched)", unchanged, `HTTP ${patchPrice.status}, price ${unchanged ? "UNCHANGED" : "CHANGED!"}`);

  const batches = await emp("/rest/v1/inventory_batches?select=unit_cost&limit=1");
  check("Employee cannot read supplier costs (inventory_batches RLS)", batches.status >= 400 || (Array.isArray(batches.body) && batches.body.length === 0), `HTTP ${batches.status}`);

  if (bossId) {
    const fakeReport = await emp("/rest/v1/shift_reports", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { employee_id: bossId, employee_name: "Impersonator", report_date: "2026-11-04", opening_stock: 1, closing_stock: 1 },
    });
    check("Employee cannot file reports as someone else (self-scope check)", fakeReport.status >= 400, `HTTP ${fakeReport.status}`);
  }

  // --- legitimate staff capabilities that MUST work ----------------------
  const readProducts = await emp("/rest/v1/products?select=id&limit=1");
  check("Employee CAN read the catalogue (operations unaffected)", readProducts.status === 200, `HTTP ${readProducts.status}`);

  const ownReport = await emp("/rest/v1/shift_reports", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { employee_id: userId, employee_name: "RBAC Evaluation", report_date: "2026-11-03", opening_stock: 42, closing_stock: 40, comments: "eval", challenges: "none", solution: "n/a" },
  });
  check("Employee CAN submit own shift report (011 table live)", ownReport.status < 300, `HTTP ${ownReport.status}`);

  const readReports = await emp("/rest/v1/shift_reports?select=employee_id");
  const onlyOwn = Array.isArray(readReports.body) && readReports.body.length > 0 && readReports.body.every((r) => r.employee_id === userId);
  check("Employee sees ONLY own shift reports (RLS read scope)", onlyOwn, `${Array.isArray(readReports.body) ? readReports.body.length : "?"} row(s)`);
} catch (error) {
  check("evaluation ran to completion", false, error.message);
} finally {
  // 3. Clean up: delete the ephemeral user (profiles + reports cascade).
  if (userId) {
    const removed = await call(`/auth/v1/admin/users/${userId}`, { asAdmin: true, method: "DELETE" });
    console.log(`\ncleanup: eval user removed (HTTP ${removed.status})`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail || ""}`);
  process.exitCode = 1;
}
