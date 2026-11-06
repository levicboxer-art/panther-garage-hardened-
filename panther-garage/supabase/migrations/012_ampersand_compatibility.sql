-- Stage 8 extension: Ampersand electric compatibility.
--
-- The replacement workbooks classify parts by source file:
--   Spiro_Garage_Spare_Parts_Inventory.xlsx -> SPIRO ELECTRIC
--   Ampersand workbook                     -> AMPERSAND ELECTRIC
--   fuel_powered_moto_spare_parts.xlsx      -> FUEL-POWERED
--
-- `apply_inventory_import` already accepts any approved compatibility value, but
-- the manual review RPC had a fixed list. This migration extends that list so an
-- Ampersand import can also be reviewed row by row. Idempotent and applied after
-- 011_shift_reports.sql.

create or replace function public.set_import_item_review(
  p_item_id uuid,
  p_decision text,
  p_product_id uuid default null,
  p_selling_price numeric default null,
  p_category text default null,
  p_compatibility text default null,
  p_review_status text default 'APPROVED',
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_import_items%rowtype;
  v_import public.inventory_imports%rowtype;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can review import rows'; end if;
  select * into v_item from public.inventory_import_items where id=p_item_id for update;
  if not found then raise exception 'Import row not found'; end if;
  select * into v_import from public.inventory_imports where id=v_item.import_id for update;
  if v_import.status = 'APPLIED' then raise exception 'This import has already been applied'; end if;

  if p_decision not in ('CREATE','MATCH','ADD_BATCH','SKIP') then raise exception 'Invalid import decision'; end if;
  if p_review_status not in ('NEEDS_REVIEW','APPROVED','SKIPPED') then raise exception 'Invalid review status'; end if;
  if p_compatibility is not null and p_compatibility not in ('SPIRO ELECTRIC','AMPERSAND ELECTRIC','FUEL-POWERED','UNIVERSAL','UNCONFIRMED') then
    raise exception 'Invalid compatibility value';
  end if;
  if p_selling_price is not null and p_selling_price <= 0 then raise exception 'A confirmed selling price must be greater than zero'; end if;

  if p_decision='MATCH' and p_product_id is null then raise exception 'Choose an existing product to match'; end if;
  if p_decision in ('CREATE','ADD_BATCH') and p_review_status='APPROVED'
     and (v_item.quantity is null or v_item.quantity <= 0 or v_item.unit_cost is null) then
    raise exception 'This row cannot be approved without a quantity and purchase cost';
  end if;

  update public.inventory_import_items
  set decision=p_decision,
      matched_product_id=p_product_id,
      approved_selling_price=p_selling_price,
      approved_category=nullif(trim(coalesce(p_category,'')),''),
      approved_compatibility=nullif(trim(coalesce(p_compatibility,'')),''),
      review_status=case when p_decision='SKIP' then 'SKIPPED' else p_review_status end,
      notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_item_id;

  return jsonb_build_object('item_id',p_item_id,'decision',p_decision,'review_status',p_review_status);
end; $$;
revoke all on function public.set_import_item_review(uuid,text,uuid,numeric,text,text,text,text) from public;
grant execute on function public.set_import_item_review(uuid,text,uuid,numeric,text,text,text,text) to authenticated;
