-- Add optional repair/service details to the sale record while leaving existing
-- workshop jobs intact for open cases and their status history.
alter table public.sales
  add column if not exists service_performed boolean not null default false,
  add column if not exists service_fee numeric(14,2) not null default 0 check (service_fee >= 0),
  add column if not exists mechanic_name text,
  add column if not exists motorcycle_plate text,
  add column if not exists service_description text;

-- The live schema keeps unit_cost non-null and records uncertainty explicitly in cost_known.
alter table public.sale_items
  add column if not exists item_type text not null default 'INVENTORY'
    check (item_type in ('INVENTORY','USED'));
alter table public.sale_items alter column product_id drop not null;
alter table public.sale_items add column if not exists cost_known boolean not null default true;

create or replace function public.create_pos_sale_v2(
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_amount_paid numeric,
  p_discount numeric default 0,
  p_notes text default null,
  p_service_performed boolean default false,
  p_service_fee numeric default 0,
  p_mechanic_name text default null,
  p_motorcycle_plate text default null,
  p_service_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_invoice text;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_item jsonb;
  v_item_type text;
  v_product public.products%rowtype;
  v_qty integer;
  v_price numeric(14,2);
  v_cost numeric(14,2);
  v_manual_cost numeric(14,2);
  v_description text;
  v_alloc record;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Sale items must be an array';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Add between 1 and 100 sale items';
  end if;
  if p_payment_method is null or p_payment_method not in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD','CREDIT') then
    raise exception 'Invalid payment method';
  end if;
  if p_discount is null or p_discount < 0 or p_discount > 100000000 then raise exception 'Discount is invalid'; end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > 100000000 then raise exception 'Amount paid is invalid'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'Customer not found'; end if;

  if coalesce(p_service_performed,false) then
    if coalesce(p_service_fee,0) < 0 or p_service_fee > 100000000 then raise exception 'Service fee is invalid'; end if;
    if nullif(trim(coalesce(p_mechanic_name,'')),'') is null or length(trim(p_mechanic_name)) > 120 then
      raise exception 'Enter the mechanic name for this service';
    end if;
    if nullif(trim(coalesce(p_motorcycle_plate,'')),'') is null or length(trim(p_motorcycle_plate)) > 32 then
      raise exception 'Enter the motorcycle plate for this service';
    end if;
    if length(trim(coalesce(p_service_description,''))) > 240 then raise exception 'Service description is too long'; end if;
  elsif coalesce(p_service_fee,0) <> 0 or nullif(trim(coalesce(p_mechanic_name,'')),'') is not null
      or nullif(trim(coalesce(p_motorcycle_plate,'')),'') is not null
      or nullif(trim(coalesce(p_service_description,'')),'') is not null then
    raise exception 'Service details require service to be selected';
  end if;

  -- Validate and calculate before creating the invoice; transaction rollback protects stock.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_type := coalesce(v_item->>'item_type','');
    v_qty := coalesce(nullif(v_item->>'quantity','')::integer,0);
    if v_qty < 1 or v_qty > 1000 then raise exception 'Each quantity must be a positive whole number'; end if;

    if v_item_type = 'INVENTORY' then
      select * into v_product from public.products
        where id=(v_item->>'product_id')::uuid and active=true;
      if not found then raise exception 'A selected product is unavailable'; end if;
      if v_product.selling_price <= 0 then raise exception 'Set a selling price for % before selling',v_product.name; end if;
      v_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.selling_price);
      if v_price <= 0 or v_price > 100000000 then raise exception 'Sale price is invalid'; end if;
      if v_price < v_product.selling_price then raise exception 'Sale price cannot be below the listed price'; end if;
      v_subtotal := v_subtotal + (v_price * v_qty);
    elsif v_item_type = 'USED' then
      v_description := trim(coalesce(v_item->>'product_name',''));
      if length(v_description) < 2 or length(v_description) > 200 then raise exception 'Enter a used part description (2 to 200 characters)'; end if;
      v_price := coalesce(nullif(v_item->>'unit_price','')::numeric,0);
      if v_price <= 0 or v_price > 100000000 then raise exception 'Used part price is invalid'; end if;
      v_manual_cost := nullif(v_item->>'unit_cost','')::numeric;
      if v_manual_cost is not null and (v_manual_cost < 0 or v_manual_cost > 100000000) then raise exception 'Used part cost is invalid'; end if;
      v_subtotal := v_subtotal + (v_price * v_qty);
    else
      raise exception 'Choose a stock item or a used/non-stock item';
    end if;
  end loop;

  v_subtotal := v_subtotal + case when coalesce(p_service_performed,false) then coalesce(p_service_fee,0) else 0 end;
  v_total := v_subtotal - p_discount;
  if v_total < 0 then raise exception 'Discount cannot exceed the invoice subtotal'; end if;
  if p_amount_paid > v_total then raise exception 'Amount paid cannot exceed invoice total'; end if;
  if p_payment_method <> 'CREDIT' and p_amount_paid <> v_total then
    raise exception 'For non-credit payments, amount paid must equal the total';
  end if;

  v_invoice := 'PG-' || to_char(clock_timestamp(),'YYMMDD-HH24MISS') || '-' || upper(substr(replace(v_sale_id::text,'-',''),1,6));
  insert into public.sales(id,invoice_number,customer_id,payment_method,subtotal,discount,total,amount_paid,balance_due,notes,sold_by,
    service_performed,service_fee,mechanic_name,motorcycle_plate,service_description)
  values(v_sale_id,v_invoice,p_customer_id,p_payment_method,v_subtotal,p_discount,v_total,p_amount_paid,
    greatest(v_total-p_amount_paid,0),nullif(trim(p_notes),''),auth.uid(),coalesce(p_service_performed,false),
    case when coalesce(p_service_performed,false) then coalesce(p_service_fee,0) else 0 end,
    case when coalesce(p_service_performed,false) then nullif(trim(p_mechanic_name),'') else null end,
    case when coalesce(p_service_performed,false) then nullif(trim(p_motorcycle_plate),'') else null end,
    case when coalesce(p_service_performed,false) then nullif(trim(p_service_description),'') else null end);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_type := v_item->>'item_type';
    v_qty := (v_item->>'quantity')::integer;
    if v_item_type = 'INVENTORY' then
      select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true for update;
      v_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.selling_price);
      v_cost := 0;
      for v_alloc in select * from public.consume_stock_fifo(v_product.id,v_qty,'SALE','SALE',v_sale_id) loop
        v_cost := v_cost + (v_alloc.unit_cost * v_alloc.quantity_consumed);
      end loop;
      insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,item_type,cost_known)
      values(v_sale_id,v_product.id,v_product.name,v_product.sku,v_qty,v_price,v_cost/v_qty,v_price*v_qty,'INVENTORY',true);
    else
      v_description := trim(v_item->>'product_name');
      v_price := (v_item->>'unit_price')::numeric;
      v_manual_cost := nullif(v_item->>'unit_cost','')::numeric;
      insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,item_type,cost_known)
      values(v_sale_id,null,v_description,'USED-NONSTOCK',v_qty,v_price,coalesce(v_manual_cost,0),v_price*v_qty,'USED',v_manual_cost is not null);
    end if;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'SALE_CREATED','sale',v_sale_id,jsonb_build_object(
    'invoice_number',v_invoice,'total',v_total,'payment_method',p_payment_method,
    'service_performed',coalesce(p_service_performed,false),'service_fee',case when coalesce(p_service_performed,false) then coalesce(p_service_fee,0) else 0 end,
    'item_count',jsonb_array_length(p_items)));
  return v_sale_id;
end; $$;

revoke all on function public.create_pos_sale_v2(uuid,jsonb,text,numeric,numeric,text,boolean,numeric,text,text,text) from public;
grant execute on function public.create_pos_sale_v2(uuid,jsonb,text,numeric,numeric,text,boolean,numeric,text,text,text) to authenticated;
