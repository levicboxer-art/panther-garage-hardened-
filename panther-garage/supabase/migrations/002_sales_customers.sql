-- Panther Garage: customer register, point of sale and invoice records.
-- Apply after 001_pgms_backend.sql.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  motorcycle_details text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create unique index if not exists customers_phone_unique on public.customers(phone) where phone is not null and phone <> '';

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  customer_id uuid references public.customers(id),
  status text not null default 'COMPLETED' check(status in ('COMPLETED','VOIDED')),
  payment_method text not null check(payment_method in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD','CREDIT')),
  subtotal numeric(14,2) not null check(subtotal >= 0),
  discount numeric(14,2) not null default 0 check(discount >= 0),
  total numeric(14,2) not null check(total >= 0),
  amount_paid numeric(14,2) not null default 0 check(amount_paid >= 0),
  balance_due numeric(14,2) not null check(balance_due >= 0),
  notes text,
  sold_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists sales_customer_idx on public.sales(customer_id);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  sku text not null,
  quantity integer not null check(quantity > 0),
  unit_price numeric(14,2) not null check(unit_price >= 0),
  unit_cost numeric(14,2) not null default 0 check(unit_cost >= 0),
  line_total numeric(14,2) not null check(line_total >= 0)
);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
drop policy if exists "staff read customers" on public.customers;
create policy "staff read customers" on public.customers for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff create customers" on public.customers;
create policy "staff create customers" on public.customers for insert to authenticated with check(public.is_pgms_staff());
drop policy if exists "staff read sales" on public.sales;
create policy "staff read sales" on public.sales for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff read sale items" on public.sale_items;
create policy "staff read sale items" on public.sale_items for select to authenticated using(public.is_pgms_staff());
grant select, insert on public.customers to authenticated;
grant select on public.sales, public.sale_items to authenticated;

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
  v_balance numeric(14,2);
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;
  if p_payment_method not in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD','CREDIT') then raise exception 'Invalid payment method'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Discount cannot be negative'; end if;
  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Amount paid cannot be negative'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'Customer not found'; end if;

  -- Validate and calculate using authoritative database prices, not browser values.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Each quantity must be a positive whole number'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true;
    if not found then raise exception 'A selected product is unavailable'; end if;
    if v_product.selling_price <= 0 then raise exception 'Set a selling price for % before selling',v_product.name; end if;
    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
  end loop;
  v_total := v_subtotal - p_discount;
  if v_total < 0 then raise exception 'Discount cannot exceed subtotal'; end if;
  if p_amount_paid > v_total then raise exception 'Amount paid cannot exceed invoice total'; end if;
  if p_payment_method <> 'CREDIT' and p_amount_paid <> v_total then raise exception 'For non-credit payments, amount paid must equal the total'; end if;

  v_invoice := 'PG-' || to_char(clock_timestamp(),'YYMMDD-HH24MISS') || '-' || upper(substr(replace(v_sale_id::text,'-',''),1,6));
  insert into public.sales(id,invoice_number,customer_id,payment_method,subtotal,discount,total,amount_paid,balance_due,notes,sold_by)
  values(v_sale_id,v_invoice,p_customer_id,p_payment_method,v_subtotal,p_discount,v_total,p_amount_paid,v_total-p_amount_paid,nullif(trim(p_notes),''),auth.uid());

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true for update;
    -- consume_stock_fifo locks batches and writes stock movements; all calls share this transaction.
    v_cost := 0;
    for v_alloc in select * from public.consume_stock_fifo(v_product.id,v_qty,'SALE','SALE',v_sale_id) loop
      v_cost := v_cost + (v_alloc.unit_cost * v_alloc.quantity_consumed);
    end loop;
    insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total)
    values(v_sale_id,v_product.id,v_product.name,v_product.sku,v_qty,v_product.selling_price,v_cost / v_qty,v_product.selling_price*v_qty);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'SALE_CREATED','sale',v_sale_id,jsonb_build_object('invoice_number',v_invoice,'total',v_total,'payment_method',p_payment_method));
  return v_sale_id;
end; $$;
revoke all on function public.create_pos_sale(uuid,jsonb,text,numeric,numeric,text) from public;
grant execute on function public.create_pos_sale(uuid,jsonb,text,numeric,numeric,text) to authenticated;
