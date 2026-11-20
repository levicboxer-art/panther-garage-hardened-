-- Allow staff to sell a spare part above its catalogue price.
-- The optional item.unit_price is validated server-side and becomes the invoice line price.
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
