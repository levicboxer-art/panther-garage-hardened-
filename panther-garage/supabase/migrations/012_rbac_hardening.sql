-- 012: Role-based access hardening for the employee dashboard.
--
-- Staff keep day-to-day operations (POS sales, repairs, bookings, deliveries,
-- shift reports). Cost and quantity authority moves to the owner at the
-- database layer, so direct REST/RPC calls are blocked the same way the app
-- screens are.

-- Goods receipt writes supplier costs into FIFO batches: owner-only now.
-- The signature is unchanged, so existing execute grants carry over.
create or replace function public.receive_stock(
  p_product_id uuid, p_quantity integer, p_unit_cost numeric,
  p_supplier_id uuid default null, p_receipt_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_batch_id uuid;
begin
  if not public.is_pgms_boss() then raise exception 'Only the owner can receive goods and set supplier costs'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;
  if not exists(select 1 from public.products where id=p_product_id and active=true) then raise exception 'Product not found or inactive'; end if;
  insert into public.inventory_batches(product_id,supplier_id,quantity_received,quantity_remaining,unit_cost,receipt_reference,received_by)
  values(p_product_id,p_supplier_id,p_quantity,p_quantity,p_unit_cost,p_receipt_reference,auth.uid()) returning id into v_batch_id;
  insert into public.stock_movements(product_id,batch_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
  values(p_product_id,v_batch_id,'PURCHASE_RECEIPT',p_quantity,'Confirmed physical goods receipt','INVENTORY_BATCH',v_batch_id,auth.uid());
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'STOCK_RECEIVED','inventory_batch',v_batch_id,jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'unit_cost',p_unit_cost));
  return v_batch_id;
end; $$;

-- Product registration is owner-only (updates were already boss-only in 001/010).
drop policy if exists "staff create products" on public.products;
create policy "boss create products" on public.products for insert to authenticated
  with check(public.is_pgms_boss());
