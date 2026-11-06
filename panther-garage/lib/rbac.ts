/**
 * Role-based access control registry for the dashboard.
 *
 * This file drives the UI (which sidebar modules appear, and what is hidden
 * inside shared workspaces). It is intentionally mirrored by server-side
 * checks: API routes re-validate roles, and Supabase RLS/policies are the
 * final authority. Hiding a module is an experience decision; the route and
 * database rules are what actually protect the data.
 *
 * Employee dashboard policy (Stage 9):
 *  - Staff run day-to-day operations: sell, service, book, deliver, report.
 *  - Owner-only money levers: supplier costs and payments (Purchases),
 *    reorder economics (Restocking), catalogue creation/price confirmation
 *    (New product, Edit, Receive goods), staff accounts, bulk imports and
 *    business analytics (Insights/BI).
 */

export type Role = "BOSS" | "EMPLOYEE";

/** Modules that require the owner role. Everything else is staff-accessible. */
export const BOSS_MODULES: ReadonlySet<string> = new Set([
  "Employees",
  "Import",
  "Catalogue review",
  "Purchases",
  "Restocking",
  "Insights",
]);

export function canAccess(role: Role, module: string): boolean {
  return !BOSS_MODULES.has(module) || role === "BOSS";
}

export const RESTRICTED_TITLE = "Restricted area";
export const RESTRICTED_NOTE =
  "This workspace involves supplier costs, price control, purchasing or staff accounts and is reserved for the owner. Ask the owner if you need something from it.";
