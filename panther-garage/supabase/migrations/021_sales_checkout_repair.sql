-- 021: Repair POS failures on deployments with an older consolidated schema.
-- Safe to apply after any existing migrations: both functions are CREATE OR REPLACE.
-- The FIFO function's OUT parameter `unit_cost` must not be confused with the
-- inventory_batches column of the same name. The POS function also needs to
-- accept the unit_price override sent by the current one-item additional-gain UI.

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
  if (select coalesce(sum(b.quantity_remaining),0)
      from public.inventory_batches b where b.product_id=p_product_id) < p_quantity then
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
    update public.inventory_batches b
      set quantity_remaining=b.quantity_remaining-v_take where b.id=v_batch.id;
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

create or replace function public.create_pos_sale(
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_amount_paid numeric,
  p_discount numeric default 0,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_invoice text;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_price numeric(14,2);
  v_cost numeric(14,2);
  v_alloc record;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;
  if p_payment_method not in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD','CREDIT') then raise exception 'Invalid payment method'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Discount cannot be negative'; end if;
  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Amount paid cannot be negative'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'Customer not found'; end if;

  -- Validate and calculate using current database prices plus the optional
  -- server-validated unit_price sent by the one-item additional-gain UI.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Each quantity must be a positive whole number'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true;
    if not found then raise exception 'A selected product is unavailable'; end if;
    if v_product.selling_price <= 0 then raise exception 'Set a selling price for % before selling',v_product.name; end if;
    v_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.selling_price);
    if v_price < v_product.selling_price then raise exception 'Sale price cannot be below the listed price'; end if;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;
  v_total := v_subtotal - p_discount;
  if v_total < 0 then raise exception 'Discount cannot exceed subtotal'; end if;
  if p_amount_paid > v_total then raise exception 'Amount paid cannot exceed invoice total'; end if;
  if p_payment_method <> 'CREDIT' and p_amount_paid <> v_total then raise exception 'For non-credit payments, amount paid must equal the total'; end if;

  v_invoice := 'PG-' || to_char(clock_timestamp(),'YYMMDD-HH24MISS') || '-' || upper(substr(replace(v_sale_id::text,'-',''),1,6));
  insert into public.sales(id,invoice_number,customer_id,payment_method,subtotal,discount,total,amount_paid,balance_due,notes,sold_by)
  values(v_sale_id,v_invoice,p_customer_id,p_payment_method,v_subtotal,p_discount,v_total,p_amount_paid,greatest(v_total-p_amount_paid,0),nullif(trim(p_notes),''),auth.uid());

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true for update;
    v_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.selling_price);
    v_cost := 0;
    for v_alloc in select * from public.consume_stock_fifo(v_product.id,v_qty,'SALE','SALE',v_sale_id) loop
      v_cost := v_cost + (v_alloc.unit_cost * v_alloc.quantity_consumed);
    end loop;
    insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total)
    values(v_sale_id,v_product.id,v_product.name,v_product.sku,v_qty,v_price,v_cost / v_qty,v_price*v_qty);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'SALE_CREATED','sale',v_sale_id,jsonb_build_object('invoice_number',v_invoice,'total',v_total,'payment_method',p_payment_method));
  return v_sale_id;
end; $$;
revoke all on function public.create_pos_sale(uuid,jsonb,text,numeric,numeric,text) from public;
grant execute on function public.create_pos_sale(uuid,jsonb,text,numeric,numeric,text) to authenticated;
