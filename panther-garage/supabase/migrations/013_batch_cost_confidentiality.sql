-- 013: Supplier-cost confidentiality (found by the Stage 9 RBAC evaluation).
--
-- The live employee-token audit showed inventory_batches readable by any
-- staff member ("staff read batches"), exposing every supplier unit cost via
-- a direct REST call even though the UI hides it. Batch costs are the source
-- of margin data, so the read scope now matches the owner-only write rules.
-- Stock movement history (no cost columns) stays staff-readable.

drop policy if exists "staff read batches" on public.inventory_batches;
create policy "boss read batches" on public.inventory_batches
  for select to authenticated using(public.is_pgms_boss());
