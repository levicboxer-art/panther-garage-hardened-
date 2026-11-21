-- Allow an active BOSS to permanently remove a product regardless of references.
-- Historical rows are preserved with their product link cleared; inventory batches
-- and import matches for the removed product are deleted/cleared.
alter table public.sale_items alter column product_id drop not null;
alter table public.repair_parts alter column product_id drop not null;
alter table public.purchase_order_items alter column product_id drop not null;
alter table public.customer_order_items alter column product_id drop not null;
alter table public.stock_movements alter column product_id drop not null;

create or replace function public.delete_product_if_unreferenced(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_name text;
  v_sale_items integer := 0;
  v_repair_parts integer := 0;
  v_purchase_items integer := 0;
  v_customer_items integer := 0;
  v_movements integer := 0;
  v_batches integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.active = true and profile.role = 'BOSS'
  ) then
    raise exception using errcode = '42501', message = 'Only an active BOSS can remove products.';
  end if;

  select product.name into v_product_name
  from public.products product
  where product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Product not found.';
  end if;

  -- Preserve completed and operational history, but remove the FK dependency.
  update public.sale_items set product_id = null where product_id = p_product_id;
  get diagnostics v_sale_items = row_count;
  update public.repair_parts set product_id = null where product_id = p_product_id;
  get diagnostics v_repair_parts = row_count;
  update public.purchase_order_items set product_id = null where product_id = p_product_id;
  get diagnostics v_purchase_items = row_count;
  update public.customer_order_items set product_id = null where product_id = p_product_id;
  get diagnostics v_customer_items = row_count;
  update public.inventory_import_items set matched_product_id = null where matched_product_id = p_product_id;
  update public.stock_movements set product_id = null, batch_id = null where product_id = p_product_id;
  get diagnostics v_movements = row_count;

  delete from public.inventory_batches where product_id = p_product_id;
  get diagnostics v_batches = row_count;
  delete from public.products where id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Product not found.';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (
    auth.uid(), 'PRODUCT_FORCE_DELETED', 'product', p_product_id,
    jsonb_build_object(
      'name', v_product_name,
      'sale_items_unlinked', v_sale_items,
      'repair_parts_unlinked', v_repair_parts,
      'purchase_items_unlinked', v_purchase_items,
      'customer_order_items_unlinked', v_customer_items,
      'stock_movements_unlinked', v_movements,
      'inventory_batches_deleted', v_batches
    )
  );

  return jsonb_build_object(
    'deleted', true,
    'product_id', p_product_id,
    'history_preserved', true,
    'inventory_batches_deleted', v_batches
  );
end;
$function$;

revoke all on function public.delete_product_if_unreferenced(uuid) from public, anon;
grant execute on function public.delete_product_if_unreferenced(uuid) to authenticated;
