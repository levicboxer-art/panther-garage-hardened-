# Report exports and notification hardening plan

## Product behavior

The existing Panther Garage reporting workspace keeps its current dashboard style, date-range summary and role-sensitive financial summary. A new Boss-only export produces a normalized event ledger as a single CSV for either a chosen calendar month or the complete recorded history. The ledger includes operational, financial, stock, purchasing, repair/status, customer-order/booking, import, shift-report, notification and audit events. It excludes staff-chat message bodies and authentication/secret data. Monthly downloads use a readable month-name filename.

The export is generated server-side, checks the authenticated active Boss role, paginates every source instead of silently truncating rows, includes stable columns and period metadata, is UTF-8/BOM compatible with spreadsheet software, and neutralizes spreadsheet formula injection in text cells.

Notification hardening is defense in depth: staff can read/acknowledge only their own alerts while active; the Boss-only email flush is rate-limited and no longer runs automatically from every staff member's polling loop; email delivery claims are atomic and retryable; low-stock checks serialize per product to reduce duplicate alerts; alert emails continue escaping HTML and remain non-blocking for the underlying business operation.

## Existing structure and implementation

- `components/ReportsWorkspace.tsx`: preserve the current report dashboard and add Boss-only month/all-history download actions.
- `app/api/reports/export/route.ts`: authenticated Boss-only export endpoint, range validation, pagination and CSV response headers.
- `lib/report-export.ts`: event-source queries, normalization, deterministic ordering, CSV serialization and formula-safe cells.
- `components/NotificationCenter.tsx`: keep in-app refresh and read controls; remove periodic email dispatch and offer a Boss-only manual digest action.
- `app/api/notifications/route.ts` and `app/api/notifications/email/route.ts`: apply active-role checks, explicit ownership, input validation, no-store headers and rate limits.
- `lib/notification-email.ts`: atomic per-Boss delivery claims, retry-safe state updates and provider idempotency keys.
- `supabase/migrations/021_report_exports_notification_hardening.sql`: additive delivery-state/RPC and low-stock concurrency hardening; no inventory or business rows are changed.

## Design

Reuse the existing Panther Garage charcoal-and-lime workshop dashboard visual language: compact cards, clear labels, restrained accents, and direct action wording. The month picker and all-history button should be visible but compact, clearly distinct from summary generation, and report loading/export errors should remain inline and accessible.
