# Panther Garage Management System (PGMS)

Dark-premium motorcycle parts storefront and garage operations portal. Currency: RWF. Roles: exactly `BOSS` and `EMPLOYEE`.

## Implemented in this backend-integration stage
- Supabase Auth sign-in using secure cookie sessions (`@supabase/ssr`).
- Session refresh middleware and server-protected dashboard.
- PostgreSQL profile roles and active-account checks.
- Row Level Security policies for profiles, products, suppliers, inventory batches and stock movements.
- Boss-only employee creation/deactivation API using a server-only service-role client.
- Persistent product registration API. Registering a product does not create stock.
- Goods-receipt API that calls a PostgreSQL transaction/RPC and creates a costed inventory batch plus stock movement.
- Atomic FIFO consumption RPC for SALE and REPAIR_ISSUE stock issues.
- Staff inventory dashboard reads live products and batch balances from Supabase.
- Public catalogue reads active products and prices from Supabase.

## 1. Install and run
Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## 2. Configure Supabase
1. Create a Supabase project.
2. In Project Settings > API, copy the project URL and anon/publishable key into `.env.local`.
3. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY`. This key is server-only. Never prefix it with `NEXT_PUBLIC_`, commit it, or expose it in browser code.
4. Apply `supabase/migrations/001_pgms_backend.sql` in the Supabase SQL Editor (or use the Supabase CLI migration workflow).
5. In Supabase Authentication settings, disable public sign-ups. Only the Boss should create employee accounts.
6. In Authentication > Users, create the initial owner account. The auth trigger creates a profile with the safe default role `EMPLOYEE`.
7. Copy that user's Auth UUID and run this once in SQL Editor:

```sql
update public.profiles
set role = 'BOSS', full_name = 'Garage Owner'
where id = 'PASTE-OWNER-AUTH-UUID-HERE';
```

8. Add `http://localhost:3000/auth/callback` to the allowed redirect URLs if using email/OAuth callback flows. For password sign-in, `/login` is used directly.
9. Restart the Next.js server after editing `.env.local`.

## 3. Test the first workflow
1. Sign in at `/login` with the Boss user.
2. Open Employees and create an EMPLOYEE account (temporary password must be at least 12 characters).
3. Open Inventory > New product. Register a product and confirm stock remains zero.
4. Select Receive stock. Enter a whole quantity, purchase cost per unit in RWF and optional supplier invoice reference.
5. Refresh Inventory and confirm the new quantity appears.
6. Create a second receipt for the same product at a different unit cost. Both receipts remain separate batches for FIFO costing.

## 4. Backend security model
- Exactly two account roles exist: `BOSS` and `EMPLOYEE`.
- Employee account creation is protected by a server-side Boss role check and the Supabase service-role key.
- Product creation is available to authenticated staff. Product price edits are Boss-only by RLS.
- Batches and stock movements have no direct client write policies. They are changed through security-definer database functions.
- `receive_stock` records the physical receipt, a separate batch cost and an immutable movement row.
- `consume_stock_fifo` locks the product and oldest eligible batches, consumes oldest first and rolls back the whole transaction if stock is insufficient.
- The dashboard reads stock from batch balances; the browser cannot increment/decrement inventory directly.
- Product deletion is not exposed; historical records should be corrected or products deactivated rather than erased.

## 5. Important scope and production caveats
This is an integrated development stage, not yet a complete live garage platform. It requires your own Supabase project and credentials before it can connect to a real database. Do not put real business data into it until you have deployed and tested your own project.

Not yet implemented: stock reservations for online orders, online payment processing, returns/refunds, email/SMS alerts, backup automation and Rwandan e-invoicing integration. Sales checkout and invoices, customer orders, customer/motorcycle records, repair job cards, purchase orders, supplier invoices/payments, the expense ledger and in-app notifications are implemented in stages 2–10. Sales, repair job cards and online-order fulfilment all consume stock through the same transactional FIFO RPC.

The inventory summary currently reports physical and available stock as the same quantity because online orders do not reserve stock. Stock is deducted at the point of sale, when repair parts are issued, or when an online order is fulfilled. Treat "available" as physical stock until a reservation phase is added.

Before production, add and test: reservation-aware availability, approval workflow, audit logging for all business entities, rate limiting, password reset/change, employee first-login password change, stronger input validation, supplier foreign-key selection UI, database backup/restore, monitoring, and independent security review. Confirm Rwanda tax/e-invoicing and data-protection requirements with the relevant authorities or adviser.

## Next recommended build phase
Add reservation-aware availability so a confirmed online order holds its units instead of competing with the POS, then add returns/refunds that restore FIFO batches with an auditable reason. After that, finish production hardening: rate limiting, password reset, backup automation, monitoring and Rwandan e-invoicing integration.

## Stage 2 — customers, point of sale and invoices

After applying migration `001_pgms_backend.sql`, apply `002_sales_customers.sql` in the Supabase SQL Editor. This adds:

- Customer register with phone, email and motorcycle details.
- Point-of-sale invoices with walk-in or registered customers.
- Cash, Mobile Money, bank transfer, card and credit/partial-payment methods.
- Server-calculated prices from the product catalogue (the browser cannot submit its own unit price).
- Atomic FIFO stock deduction. If any item has insufficient stock, the sale and all stock changes roll back.
- Invoice history with subtotal, discount, total, paid amount and outstanding balance.
- Staff-only Row Level Security policies for customer and sales data.

The dashboard's **Sales** and **Customers** tabs now use these live APIs. The printable invoice summary is a basic print action; a branded PDF invoice, payment collection against an existing credit invoice, void/refund controls and tax/e-invoicing remain future work. Do not use this as a compliant tax invoice until Rwanda tax requirements and invoice numbering have been reviewed.

### Stage 2 verification checklist

1. Apply `002_sales_customers.sql` after migration 001.
2. Register a test customer and verify it appears after refresh.
3. Create a test sale using a product with stock and a non-zero selling price.
4. Confirm the invoice appears in Recent invoices and stock decreases by the sold quantity.
5. Attempt a sale above available stock and confirm it is rejected without changing stock.
6. Test a CREDIT sale with a partial amount paid and verify the outstanding balance.

## Stage 3 — Workshop management

Apply `supabase/migrations/003_workshop_management.sql` after migrations 001 and 002. The consolidated `supabase/schema.sql` contains all three migrations for a fresh database; do not run both the consolidated schema and the individual migrations.

The Repairs workspace supports customer-linked motorcycle intake, make/model/registration, reported fault, mechanic assignment, labour fee, spare parts issued, repair status history, and collection status. Creating a repair job and deducting selected spare parts is one PostgreSQL transaction using the same FIFO batch logic as sales. If stock is insufficient, the repair job and all stock movements roll back together. A job with issued parts cannot be cancelled until a stock-return workflow exists.

Repair statuses: `RECEIVED`, `DIAGNOSIS`, `WAITING_PARTS`, `IN_PROGRESS`, `READY`, `COLLECTED`, `CANCELLED`. Only a `READY` job can be marked `COLLECTED`; closed jobs cannot be reopened. Labour and parts are recorded as the job's estimate/charge total. This stage does not yet collect repair payments, print job cards, or implement return-to-stock processing.

## Stage 4 — Purchasing and Finance

Apply `supabase/migrations/004_purchasing_finance.sql` after migrations 001–003.

This stage adds supplier records, purchase orders with multiple product lines, partial goods receipts, supplier invoices, supplier payment records, garage expenses and boss approval of employee-entered expenses. All amounts are recorded in RWF. A purchase order does not increase stock; only a physically confirmed receipt creates a costed FIFO inventory batch through the existing `receive_stock` function. Supplier payments are boss-only and cannot exceed an invoice's remaining balance. Historical transactions are retained and audited.

The Purchases workspace is available from the dashboard navigation. Full accounting ledger, tax/e-invoicing integration, cash/bank reconciliation, refunds and supplier returns remain future work. Supplier invoice entry is a separate bookkeeping record and should be matched to the physical receipt and order before use in live accounting.

## Stage 5 — Management reports and notifications

Apply `supabase/migrations/005_reports_notifications.sql` after migrations 001–004.

This stage adds:
- Date-filtered operational and management reports sourced from recorded sales, repairs, purchases, expenses, products and stock movements.
- Boss-only financial summary values in the reports API; employee report responses omit financial totals.
- CSV export for the displayed period summary.
- In-app notifications scoped to the signed-in recipient.
- Database-generated boss alerts for completed sales, expense approvals, purchase-order status changes and low stock.
- Notification read state and mark-all-as-read support.

Reports are management summaries, not audited financial statements or a double-entry general ledger. Purchase order values are order values, not necessarily cash paid. Supplier invoice outstanding totals reflect invoices created in the selected period. The report API currently reads up to 2,000 rows per transaction type and should be upgraded to database aggregation/RPC pagination before high-volume production use. Email delivery is not included in this stage; notifications are in-app only.

## Stage 6 — Smart Restocking

Apply `supabase/migrations/006_smart_restocking.sql` after migrations 001–005.

This stage adds a demand-based restocking workspace:
- Calculates average daily demand from recorded SALE and REPAIR_ISSUE stock movements over a rolling 90-day window.
- Reads current physical stock from the FIFO inventory summary.
- Stores configurable supplier lead time, safety stock and target stock coverage per product.
- Calculates reorder point as `average daily demand × supplier lead time + safety stock`.
- Calculates a suggested order quantity to cover the configured supplier lead time plus target stock coverage after delivery, but only when demand history is usable (at least 3 issue events across 3 distinct days).
- Sorts products needing review before healthy-stock products and labels sparse/no-history products instead of inventing demand.
- Allows only the BOSS role to change restocking parameters. Employees can view operational recommendations.

The 90-day average is a simple historical baseline, not a machine-learning forecast. Lead times are configurable product-level estimates and should be confirmed with suppliers. This module does not create purchase orders, reserve stock, or alter inventory. A Boss must review the recommendation and use the Purchases workspace to place an order; physical stock changes only after a goods receipt is recorded. The API reads up to 10,000 demand movements per analysis and should move to database-side aggregation/pagination for very high-volume garages.

### Stage 6 verification checklist

1. Apply `006_smart_restocking.sql` after migrations 001–005.
2. Open Dashboard → Restocking and confirm active products appear with current stock.
3. For a product with at least three recorded sales/repair issue events across three distinct days, verify the 90-day usage, average daily demand, reorder point and suggested quantity.
4. Confirm a product with no or sparse demand history shows `No recorded demand` or `Limited demand history` and no suggested order quantity.
5. Sign in as EMPLOYEE and confirm settings cannot be changed; sign in as BOSS and save a product's lead time, safety stock and target coverage.
6. Confirm recommendations do not create a purchase order or change stock. Record a goods receipt separately to change inventory.

## Stage 7 — Customer Portal, Online Orders & Product Photos

Apply `supabase/migrations/007_customer_portal.sql` after migrations 001–006. For a fresh database, `supabase/schema.sql` now includes Stage 7 as well; use either the ordered migrations or the consolidated schema, not both.

### Customer-facing experience
- `/portal` provides a guest repair appointment request form and repair tracking.
- Repair tracking requires both the repair job number and the phone number on the linked customer record. It returns only the motorcycle and status/timing fields, not internal diagnosis, notes, prices or employee information.
- The public spare-parts catalogue cart now submits an online order request. The database function reads current product names and selling prices itself; it does not trust prices sent by the browser.
- Online order requests receive a reference and appear in the staff **Online Orders** workspace. Staff can update request status. This is a request/confirmation workflow, not online payment, stock reservation or automatic sale posting.
- Repair booking requests receive a reference and appear in the staff **Bookings** workspace. Staff can confirm, decline, convert or cancel the request. A request is not a confirmed appointment until staff confirms it.

### Product photo requirement
- Registering a new product now requires a real product photograph.
- Supported formats: JPEG, PNG and WebP; maximum 5 MB.
- The form previews the image before upload. Images are stored in the Supabase Storage `product-images` bucket and their public URLs are saved on the product record. The public catalogue uses the same image.
- Staff can upload/replace/delete objects in the product-images bucket; the public can only read images. Do not upload customer faces, private documents or unrelated images.
- Product registration still does not create inventory. Use **Receive stock** only after physically receiving the goods.

### Setup and test
1. Apply migration `007_customer_portal.sql` after 001–006.
2. Confirm the `product-images` bucket exists in Supabase Storage (the migration creates it).
3. Sign in as staff, register a test product with a JPEG/PNG/WebP image, and verify it appears in Inventory and on the public catalogue.
4. Submit a test repair booking at `/portal`; verify it appears in Dashboard → Bookings and test status updates.
5. Create a repair job linked to a customer record with a phone number, then test `/portal` repair tracking with the job number and that same phone number.
6. Add catalogue products to the public cart and submit a test order; verify its reference and items in Dashboard → Online Orders.

### Stage 7 scope and important limitations
- Customer access is guest-based; customer passwords/accounts and account history are not implemented in this stage.
- Online orders are requests only. The garage must contact the customer, confirm stock/price/fulfilment, and record the actual sale through the staff POS. No stock is reserved or deducted when an order request is submitted.
- No online payment, delivery integration, SMS/email notifications, automatic booking-to-repair conversion or customer-facing booking status lookup is included yet.
- Repair tracking works only for repair jobs linked to a customer record whose phone number matches the supplied number. Existing unlinked jobs cannot be tracked through the public portal until linked appropriately.
- The booking form accepts public submissions; add rate limiting, CAPTCHA/abuse monitoring, privacy notice and data-retention policy before public production launch.
- The product-images bucket is public-read by design so catalogue photographs can display without login. Do not store confidential files in it.
- A full production build and TypeScript check pass in this workspace. No live Supabase test of this stage has been completed here. Apply the migration and run the test checklist in your own Supabase project before production use.

## Stage 8 — Spare-parts workbook import and catalogue review

Apply `supabase/migrations/008_spare_parts_catalogue_import.sql` after migrations 001–007. Do not edit or re-run the earlier migrations.

### Source data and reproducibility
- Original workbooks are kept in `data/source/`; the generated import bundle is `data/spare-parts-import.json`.
- Regenerate the bundle with `node scripts/build-spare-parts-import.mjs`. If a workbook itself changes, refresh the parsed snapshots first with `npm i --no-save xlsx` and `node scripts/extract-source-workbooks.mjs`.
- Workbook 1, `fuel_powered_moto_spare_parts.xlsx`, is the fuel-powered motorcycle inventory. Workbook 2, `Spiro_Garage_Spare_Parts_Inventory.xlsx`, is the Spiro electric motorcycle inventory. Both are independent primary inventories and both create opening stock.
- A part's catalogue category and compatibility are derived from the workbook it belongs to: fuel → `FUEL-POWERED`, Spiro → `SPIRO ELECTRIC`. An Ampersand workbook follows the same rule as `AMPERSAND ELECTRIC` when it is supplied.
- Apply `supabase/migrations/012_ampersand_compatibility.sql` (after 011) before importing an Ampersand workbook: it extends the manual review RPC's compatibility list. The bundle builder, product APIs, review/inventory screens and storefront filter already accept `AMPERSAND ELECTRIC`.
- The generated bundle contains 132 staged rows, 129 proposed products and 103 conflicts (all `INFO`/`WARNING`; no blocking rows).
- Names, quantities, purchase costs and the workbook-supplied totals are preserved exactly. Workbook-calculated purchase values differ from the fuel workbook's summary sheet (RWF 3,036,380.23 calculated across both files vs the sheet totals, which double-count the summary blocks). Both values remain available for review; neither is silently overwritten.
- Two duplicate names in the fuel workbook (`RURUMA 6205`, `IBINYOTERI (125) IMBERE`) become a second FIFO batch under the first occurrence's SKU. One row without quantity/cost (`SHAMBURAYERI`) is intentionally skipped. Source oddities (`AMPURE NYC` and `IGICOMEKO KIZA` sell below cost, `GREASE` stock-value mismatch) are preserved and flagged with warnings.

### Import workflow
1. Sign in as `BOSS` and open Dashboard → Import.
2. Stage the bundle. The API reads `data/spare-parts-import.json`; staging does not change stock or products.
3. Review conflicts and rows. Rows are marked for review, matched to an existing product, or intentionally left unresolved. Conflicts are never discarded.
4. Resolve blocking conflicts or explicitly approve the import while including them.
5. Apply the import. Products are created/updated, and opening stock is posted once through FIFO batches and `OPENING` stock movements.
6. Re-applying the same import is safe: a deterministic `import_source_key` prevents duplicate batches and movements. Product registration on its own never creates stock.

### Price policy
- The workbooks' **sale price / unit** column is the confirmed customer price. The bundle carries it as the BOSS-approved selling price, so imported parts are published immediately with `price_status = CONFIRMED`.
- Rows without a usable sell price keep `selling_price = 0` and are marked `PRICE NEEDS REVIEW`. They are not published with a misleading amount.
- Rows whose sell price is below purchase cost are imported at the source price and flagged for BOSS review rather than silently corrected.
- The BOSS can still change or clear a price per product or import row. The public catalogue only shows a positive confirmed price.
- The BOSS role is enforced server-side by the import, product and price-update APIs as well as database policies.

### Catalogue and inventory behaviour
- Public catalogue search covers name, SKU, category, compatibility and keywords, with category/compatibility/availability filters and sorting.
- Only approved, active products are returned. The public RPC exposes price and an availability band, never purchase cost, supplier data or exact internal stock quantities.
- Out-of-stock products remain visible but cannot be ordered. Unconfirmed prices show `PRICE NEEDS REVIEW` / price on request and are rejected by the customer order RPC.
- Management inventory shows photo, name, SKU, category, compatibility, stock, purchase cost, selling price, stock purchase value, reorder level, available/reserved quantities, status, supplier and last update.
- Compatibility values used by the import are `SPIRO ELECTRIC`, `FUEL-POWERED`, `UNIVERSAL` and `UNCONFIRMED`. Both workbooks use the title `SPIRO GARAGE | SPARE PARTS INVENTORY`, so compatibility/category classification is flagged for review rather than assumed.

### Product images
- Stage 7's `product-images` bucket and the 4-field image workflow remain in use: upload, preview, replace and remove.
- Allowed formats are JPG/JPEG, PNG and WebP, maximum 5 MB.
- Products without an image use a neutral placeholder; the catalogue never reuses one generic stock photo for unrelated parts.

### Stage 8 live verification
- Migration 008 was applied to the live Supabase project and the replacement workbook import was executed through the BOSS dashboard/RPC flow.
- Final import result: 131 approved rows, 129 products created, 1 intentionally skipped row (`SHAMBURAYERI`, no quantity/cost), 131 FIFO batches, 131 `OPENING` movements, 984 units and RWF 3,036,380.23 purchase value. No rows were left needing review.
- Catalogue split: 90 products `FUEL-POWERED` (`PG-FP-###`) and 39 products `SPIRO ELECTRIC` (`PG-SP-###`); the two duplicate fuel names each share one product with two FIFO batches.
- All 129 products were published as `CONFIRMED` with their workbook sell price, and `public_catalogue` returned a price for every row. `public_catalogue_product` and the storefront card both show the amount.
- The previous 90-product imported catalogue was removed first. Before deletion the reset exported backups of `products`, `inventory_batches`, `stock_movements`, `inventory_imports`, `inventory_import_items` and `inventory_import_conflicts`; no sales, repairs, orders, purchase documents or invoices referenced those products.
- The import ran under a temporary BOSS identity (the RPCs require `is_pgms_boss()`), then its rows were re-attributed to the garage owner and the temporary Auth user/profile were deleted.
- Re-applying the same import returned the same report and left the counts at 129 products / 131 batches / 131 movements, confirming the `import_source_key` idempotency guard.
- `SUPABASE_SERVICE_ROLE_KEY` is configured locally in `.env.local` (never committed). The live catalogue returned only availability, price status and approved price fields; no purchase cost, supplier or exact stock quantity.
- Run `npx tsc --noEmit` and `npm run build` after any change.

## Stage 9 — BOSS catalogue price & classification review

This phase adds a dedicated BOSS-only review workspace. It does not need a new migration: it reuses the existing `products` table, BOSS update policy, price-status trigger and product audit trigger.

- Dashboard → **Catalogue review** is visible only to `BOSS`. Employees do not see the tab, and the bulk API returns `403` for non-BOSS accounts.
- Search and filters cover review state (needs review, needs price, needs classification, ready to publish), category and compatibility.
- Each row has an inline selling price, category and compatibility editor. Rows stay in a local draft until saved, so a bulk edit is never applied by accident.
- Selected rows can be classified in bulk (category and/or compatibility); prices remain per product because every part needs its own confirmed amount.
- **Save changes** writes all dirty rows, and a row-level **Save** writes just that row. `PATCH /api/products/bulk` validates every row before writing, then applies updates in small batches. Partial failures are reported by row.
- A positive saved price becomes `CONFIRMED` and is published immediately. A blank or zero price returns the part to `PRICE NEEDS REVIEW` and hides the amount. Stock, batches and purchase costs are never touched.
- Product changes are recorded in `audit_logs` by the existing `products_audit_trigger`.
- All new interface phrases are present in both the French and Kinyarwanda dictionaries.

### Stage 9 live verification
- The screen loaded all 90 imported products with `90` needing a price, `90` needing classification and `0` ready to publish.
- `PG-SP-020` (`RURUMA 6205`) was bulk-classified as `BEARINGS` / `UNIVERSAL` and priced at RWF 2,500. The save returned `200`; the public catalogue then returned `selling_price: 2500`, `price_status: CONFIRMED` and the new classification. The row was then returned to `0` / `UNCLASSIFIED` / `UNCONFIRMED`, and the public price became `null` with `PRICE NEEDS REVIEW` again. Its 20 units did not change.
- A two-row bulk category save and revert (`PG-SP-077`, `PG-SP-081`) also returned `200`, and the audit log recorded the before/after values.
- Final database state after testing: 90 products, 92 batches, 92 movements, all products back to `PRICE NEEDS REVIEW`, `UNCLASSIFIED` and `UNCONFIRMED`.
- French and Kinyarwanda rendering of the new screen was checked in the browser.
- The catalogue was later replaced by the two current workbooks (see Stage 8): 129 products, all with confirmed published prices and workbook-derived categories, so this review screen now opens with `0` needing a price. It remains the place to adjust a price or classification.

## Stage 10 — online order fulfilment with invoice and FIFO stock issue

Apply `supabase/migrations/009_fix_fifo_stock_consumption.sql` after migrations 001–008. It repairs `consume_stock_fifo`, whose unqualified `unit_cost` reference made every stock-issue call fail with `column reference "unit_cost" is ambiguous`. The order screens then reuse the existing `customer_orders` tables and the transactional `create_pos_sale` RPC, which validates confirmed prices and consumes batches through the repaired FIFO function.

### Why migration 009 is required
- A live fulfilment attempt on the running project returned `column reference "unit_cost" is ambiguous`. The transaction rolled back, leaving the order confirmed and stock unchanged.
- The live database showed **0 sale rows and 0 sale items**, and the 92 stock movements were all `OPENING`. Nothing had ever consumed stock, so sales checkout, repair part issues and online-order fulfilment were all blocked even though their UI was wired.
- Migration 009 re-creates the function with table-qualified column names. Until it is applied, the API returns the database error instead of reporting a false success.

### Staff workflow
- Dashboard → **Online Orders** lists guest orders with the customer, contact details, items, current available stock per line and the order total.
- Orders move forward only: `PENDING → CONTACTED → CONFIRMED → FULFILLED`. Cancelled and fulfilled orders cannot be reopened.
- **Confirm order** records the commitment but reserves nothing.
- **Fulfil and issue stock** is enabled only on a confirmed order whose lines are all in stock. Two staff members cannot issue the same order twice: the API claims the order with a conditional status update before creating the sale.
- Fulfilment creates a real invoice number and consumes stock oldest-batch-first. Cash, Mobile Money, Bank transfer and Card are recorded as fully paid; Credit leaves the balance due. No money is collected online, so Credit is the default and the customer pays on collection.
- The invoice is linked back to the order through the sale note (`Online order <reference> · <name> · <phone>`), so the order card shows the invoice number, payment method, paid amount and balance due.
- If stock is insufficient, or a price has returned to `PRICE NEEDS REVIEW`, the claim is released, no partial stock is consumed and the order stays confirmed.
- The invoice uses the current confirmed selling price, not the price shown when the guest submitted the order.

### Stage 10 verification
- Live, against the running development server and the hosted Supabase project:
  - A mobile dashboard tab bar was added because the sidebar is hidden below 1024 px; **Online Orders** became reachable at an 800 px window width.
  - A test order was created through `POST /api/orders`, appeared in the workspace with `20 in stock`, and showed **Mark contacted**, **Confirm order** and **Cancel order**.
  - Fulfilling the pending order returned `400` with "Confirm the order before issuing stock and creating the invoice."
  - Confirming through the UI returned `200`, changed the badge to `CONFIRMED` and revealed the payment selector and fulfil button.
  - Fulfilment then returned `column reference "unit_cost" is ambiguous`; the sale transaction rolled back and stock stayed at 20. This exposed the FIFO defect described above.
- Pending: apply migration 009, then repeat confirm → fulfil and verify the invoice number, FIFO deduction, audit row and the double-fulfil rejection.
- Cleanup after the test: temporary price reverted, test order deleted and QA account removed. Final state: 90 products, 92 batches, 92 movements, 0 sales, 0 orders, 20 units for `PG-SP-020`, only the owner account remains.

### Remaining limitation
Online orders still do not reserve stock while pending or confirmed. Until reservations are added, two confirmed orders can compete for the same units; the second fulfilment fails cleanly with an insufficient-stock error and no partial deduction.

## Dashboard look and feel

The BOSS dashboard has a black / white canvas switch in the header.

- Dark mode uses a solid `#000` canvas; light mode uses solid `#fff`. The rest of the public site keeps its original branded background.
- Cards, panels, the sidebar and the header are styled as glass surfaces inside `.dashboard-shell` only, with translucent fills, 24px backdrop blur, hairline borders and inset top highlights. The light theme uses a soft white-to-grey glass so cards stay visible on a pure white page.
- The switch is a literal black/white control: black track with a white thumb in dark mode, white track with a black thumb in light mode. The preference is still BOSS-only and persists in `pgms-dashboard-theme`; employees always get dark mode.
- Below 1024 px the sidebar is replaced by a horizontally scrollable glass tab bar under the header, so every workspace stays reachable in narrow windows.
- All existing dashboard workspaces inherit the glass styling automatically because they use the shared `.card`, `.surface`, `.glass` and `.glass-panel` classes.

## UI component structure — `components/ui`

This project already used Tailwind CSS, TypeScript and the `@/*` path alias, but it did not have the shadcn-style `components/ui` folder. That folder is now created for the supplied `LiquidNavbar`:

- `components/ui/liquid-glass-navbar.tsx` — the reusable navbar and icon set.
- `components/ui/demo.tsx` — the supplied standalone demo usage.

`components/ui` is the conventional destination for shadcn and copy-paste registry components. Keeping primitives there separates reusable UI from feature components (`components/InventoryWorkspace.tsx`, `components/DashboardClient.tsx`, and so on) and lets future shadcn CLI commands write to the expected location without moving files. The navbar itself has no runtime dependencies beyond React and does not require `components.json`; adding one with `npx shadcn@latest init` later would make the project fully CLI-compatible without changing the current import paths.

The storefront header uses `LiquidNavbar` on medium and larger screens with links to Home, Spare parts, Services, Portal and Contact. It runs with `tone="dark"`, uses lucide icons, and keeps the existing mobile header/cart controls. At 768–1023 px the labels collapse to icons so the header does not overflow; from 1024 px the full labels are shown.

## Multilingual interface

The interface supports English (`en`), French (`fr`) and Kinyarwanda (`rw`). English is the source language and remains the fallback.

- `lib/i18n.ts` holds the locale list, the French and Kinyarwanda dictionaries, and the `translate()` helper.
- `components/LanguageProvider.tsx` stores the chosen language in `localStorage` under `pgms-locale`, updates `<html lang>`, and applies translations to the rendered interface. It uses a `MutationObserver` so text added later (workspace tabs, dialogs, fetched records) is translated too, without rewriting every workspace component.
- `components/LanguageSwitcher.tsx` is mounted in the storefront header, login page, customer portal, part-detail page and dashboard header.
- Language choice persists across pages and reloads via `localStorage`.

Translation is deliberately phrase-based. Database values such as product names, SKUs, customer names, references and status codes are never machine-translated; unknown phrases fall back to English. To add a language, extend `LOCALES`, `LOCALE_LABELS`, and provide another dictionary in `lib/i18n.ts`.

### Dashboard light/dark switch

- The dashboard header shows a switch only for `BOSS` accounts (`components/ThemeToggle.tsx`). Employees keep the standard dark dashboard.
- The choice is stored in `localStorage` under `pgms-dashboard-theme` and applied through `data-dashboard-theme` on the dashboard shell only.
- Light styles are scoped under `.dashboard-shell[data-dashboard-theme="light"]` in `app/globals.css`, so the storefront, login and portal keep their current dark identity.
- Theme and language both survive reloads. Dashboard charts, tables, cards, fields, modals and badges are covered by the light overrides.

### Verification for this stage

- `npx tsc --noEmit` passes.
- `npm run build` passes.
- Browser checks at 800 px confirmed: French and Kinyarwanda translations apply on `/`, `/login` and `/portal`; the language persists after reload; the dashboard renders in both themes; the theme toggle is visible only for a BOSS profile; no horizontal overflow and no console errors on public pages.
- The dashboard was exercised with a temporary mock-profile route, which was removed before the final build.



## Stage 14 — Staff alerts, Boss email digest and team chat

Apply `supabase/migrations/014_alerts_email_chat.sql` after the existing migrations, or use the updated consolidated `supabase/schema.sql` for a fresh database. Low-stock alerts are generated for every active staff member when a product reaches two units or fewer, while still respecting a higher product-specific minimum stock level. Duplicate warnings for the same product are suppressed for 24 hours.

The dashboard notification center now refreshes automatically, distinguishes stock, approval, finance and purchasing alerts, and shows a clear unread/high-priority state. The **Team chat** workspace provides private direct messages between the BOSS and active EMPLOYEE accounts; employees can message the Boss and the Boss can message each employee.

Boss email digests are optional and server-only. To enable them, set `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM`, and `BOSS_ALERT_EMAIL` in `.env.local`. The dashboard periodically dispatches new unread notification alerts through the server, uses the configured AI provider to triage the digest priority and summary, and records successful deliveries so the same notification is not repeatedly emailed. If these values are unset, in-app alerts and chat continue to work without email.


## Stage 16 — Hugging Face AI, staff stock quantities, chat, and alerts

The Panther AI assistant and Boss email-digest triage use the Hugging Face Inference Providers OpenAI-compatible router by default. Store `HUGGINGFACE_API_KEY` as a server-only sensitive Vercel variable, with `HUGGINGFACE_BASE_URL=https://router.huggingface.co/v1` and the selected `HUGGINGFACE_MODEL`; never commit the token or expose it through a `NEXT_PUBLIC_` variable. The chat request/stream path remains behind authenticated server routes.

Employees and the BOSS now receive the same exact physical and available quantities through `staff_inventory_summary()`, a restricted aggregate that returns no batch, supplier, or purchase-cost fields. BOSS-only product create/edit/price controls and batch-cost RLS remain in force. POS sales, repair issues, and online-order fulfillment continue using the transactional FIFO stock consumer. Customer order submissions remain requests until staff confirms and fulfills them; an unconfirmed request does not consume or reserve stock.

Migration `supabase/migrations/016_staff_stock_chat_alerts.sql` installs the quantity-only aggregate, provisions the missing staff-chat and email-delivery tables, enforces active opposite-role Boss↔employee chat access at both the API and RLS layers, and sends low-stock and distinct out-of-stock alerts to all active staff. Stock alerts are generated on eligible stock movements and deduplicated per product/recipient/category for 24 hours. The same migration is appended to `supabase/schema.sql` for fresh installs.
