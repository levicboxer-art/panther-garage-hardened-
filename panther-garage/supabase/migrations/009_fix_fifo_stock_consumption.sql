-- Stage 10: repair FIFO stock consumption before enabling online-order fulfilment.
-- Apply after 008_spare_parts_catalogue_import.sql. Earlier migrations are not edited.
--
-- consume_stock_fifo declares an OUT column named unit_cost and then selected the
-- unqualified column unit_cost from inventory_batches. PL/pgSQL treats a column
-- name that matches an OUT parameter as ambiguous, so every call failed with:
--   column reference "unit_cost" is ambiguous
-- Because create_pos_sale and create_repair_job both call this function, no sale,
-- repair part issue or online-order fulfilment could deduct stock. Qualifying the
-- columns with a table alias removes the ambiguity.

create or replace function public.consume_stock_fifo(
  p_product_id uuid, p_quantity integer, p_movement_type text,
  p_reference_type text default null, p_reference_id uuid default null
) returns table(batch_id uuid, quantity_consumed integer, unit_cost numeric)
language plpgsql security definer set search_path = '' as $$
declare v_needed integer; v_take integer; v_batch record;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_movement_type not in ('SALE','REPAIR_ISSUE') then raise exception 'Unsupported stock issue type'; end if;
  perform 1 from public.products where id=p_product_id and active=true for update;
  if not found then raise exception 'Product not found or inactive'; end if;
  if (select coalesce(sum(quantity_remaining),0) from public.inventory_batches where product_id=p_product_id) < p_quantity then
    raise exception 'Insufficient available stock';
  end if;
  v_needed := p_quantity;
  for v_batch in
    select b.id, b.quantity_remaining, b.unit_cost
    from public.inventory_batches b
    where b.product_id=p_product_id and b.quantity_remaining>0
    order by b.received_at asc, b.created_at asc, b.id asc
    for update
  loop
    exit when v_needed=0;
    v_take := least(v_needed,v_batch.quantity_remaining);
    update public.inventory_batches set quantity_remaining=quantity_remaining-v_take where id=v_batch.id;
    insert into public.stock_movements(product_id,batch_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
    values(p_product_id,v_batch.id,p_movement_type,-v_take,'FIFO stock consumption',p_reference_type,p_reference_id,auth.uid());
    batch_id := v_batch.id; quantity_consumed := v_take; unit_cost := v_batch.unit_cost; return next;
    v_needed := v_needed-v_take;
  end loop;
  if v_needed<>0 then raise exception 'FIFO allocation incomplete; transaction rolled back'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'FIFO_STOCK_CONSUMED','product',p_product_id,
    jsonb_build_object('quantity',p_quantity,'movement_type',p_movement_type,'reference_id',p_reference_id));
end; $$;
revoke all on function public.consume_stock_fifo(uuid,integer,text,text,uuid) from public;
grant execute on function public.consume_stock_fifo(uuid,integer,text,text,uuid) to authenticated;
