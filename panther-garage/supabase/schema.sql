-- Consolidated Panther Garage schema. Apply this file once to a fresh Supabase project.

-- Panther Garage Management System: secure backend foundation
-- Apply once in Supabase SQL Editor or through Supabase migrations.
create extension if not exists pgcrypto;
do $$ begin
  create type public.pgms_role as enum ('BOSS','EMPLOYEE');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Staff member',
  role public.pgms_role not null default 'EMPLOYEE',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- New auth users receive EMPLOYEE by default. Public sign-up should be disabled;
-- the Boss creates employee accounts using the protected admin API.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Staff member'), 'EMPLOYEE')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_pgms on auth.users;
create trigger on_auth_user_created_pgms after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.current_pgms_role()
returns public.pgms_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active = true limit 1;
$$;
create or replace function public.is_pgms_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and active=true);
$$;
create or replace function public.is_pgms_boss()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and active=true and role='BOSS');
$$;
grant execute on function public.current_pgms_role() to authenticated;
grant execute on function public.is_pgms_staff() to authenticated;
grant execute on function public.is_pgms_boss() to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), sku text unique not null,
  name text not null, category text, brand text, description text, compatibility text,
  unit text not null default 'piece', image_url text,
  selling_price numeric(14,2) not null default 0 check(selling_price>=0),
  minimum_stock integer not null default 0 check(minimum_stock>=0),
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(), name text not null,
  phone text, email text, address text, notes text, created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists updated_at timestamptz not null default now();
create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  supplier_id uuid references public.suppliers(id),
  quantity_received integer not null check(quantity_received>0),
  quantity_remaining integer not null check(quantity_remaining>=0 and quantity_remaining<=quantity_received),
  unit_cost numeric(14,2) not null check(unit_cost>=0),
  received_at timestamptz not null default now(), receipt_reference text,
  received_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists inventory_batches_fifo_idx on public.inventory_batches(product_id, received_at, created_at) where quantity_remaining > 0;
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  batch_id uuid references public.inventory_batches(id),
  movement_type text not null check(movement_type in ('OPENING','PURCHASE_RECEIPT','SALE','REPAIR_ISSUE','CUSTOMER_RETURN','SUPPLIER_RETURN','DAMAGE','LOSS','ADJUSTMENT','WRITE_OFF')),
  quantity_delta integer not null check(quantity_delta<>0), reason text,
  reference_type text, reference_id uuid, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_date_idx on public.stock_movements(product_id,created_at desc);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id uuid,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "boss reads audit logs" on public.audit_logs;
create policy "boss reads audit logs" on public.audit_logs for select to authenticated using(public.is_pgms_boss());
grant select on public.audit_logs to authenticated;

create or replace view public.inventory_summary with (security_invoker = true) as
select p.id as product_id,
       coalesce(sum(b.quantity_remaining),0)::bigint as physical_stock,
       p.minimum_stock,
       greatest(coalesce(sum(b.quantity_remaining),0),0)::bigint as available_stock
from public.products p left join public.inventory_batches b on b.product_id=p.id
group by p.id,p.minimum_stock;

create or replace function public.audit_product_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'PRODUCT_CREATED','product',new.id,to_jsonb(new));
    return new;
  elsif tg_op='UPDATE' then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'PRODUCT_UPDATED','product',new.id,to_jsonb(old),to_jsonb(new));
    return new;
  end if;
  return new;
end; $$;
drop trigger if exists products_audit_trigger on public.products;
create trigger products_audit_trigger after insert or update on public.products
for each row execute procedure public.audit_product_changes();

-- RLS: no user can grant themselves BOSS. Profile role changes are admin-only.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.stock_movements enable row level security;
drop policy if exists "profile self or boss read" on public.profiles;
create policy "profile self or boss read" on public.profiles for select to authenticated
using (id=(select auth.uid()) or public.is_pgms_boss());
drop policy if exists "staff read products" on public.products;
create policy "staff read products" on public.products for select to authenticated using(public.is_pgms_staff());
drop policy if exists "public read active catalogue" on public.products;
create policy "public read active catalogue" on public.products for select to anon using(active=true);
drop policy if exists "staff create products" on public.products;
create policy "staff create products" on public.products for insert to authenticated with check(public.is_pgms_staff());
drop policy if exists "boss update products" on public.products;
create policy "boss update products" on public.products for update to authenticated using(public.is_pgms_boss()) with check(public.is_pgms_boss());
drop policy if exists "staff read suppliers" on public.suppliers;
create policy "staff read suppliers" on public.suppliers for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff manage suppliers" on public.suppliers;
create policy "staff insert suppliers" on public.suppliers for insert to authenticated with check(public.is_pgms_staff());
drop policy if exists "boss update suppliers" on public.suppliers;
create policy "boss update suppliers" on public.suppliers for update to authenticated using(public.is_pgms_boss()) with check(public.is_pgms_boss());
drop policy if exists "staff read batches" on public.inventory_batches;
drop policy if exists "boss read batches" on public.inventory_batches;
create policy "boss read batches" on public.inventory_batches for select to authenticated using(public.is_pgms_boss());
drop policy if exists "staff read movements" on public.stock_movements;
create policy "staff read movements" on public.stock_movements for select to authenticated using(public.is_pgms_staff());
-- Intentionally no direct INSERT/UPDATE/DELETE policies on batches or movements.
-- Stock changes must use the SECURITY DEFINER RPCs below.

grant select on public.products to authenticated;
grant insert on public.products to authenticated;
grant update on public.products to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select on public.inventory_batches, public.stock_movements to authenticated;
grant select on public.inventory_summary to authenticated;

create or replace function public.receive_stock(
  p_product_id uuid, p_quantity integer, p_unit_cost numeric,
  p_supplier_id uuid default null, p_receipt_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_batch_id uuid;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
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
revoke all on function public.receive_stock(uuid,integer,numeric,uuid,text) from public;
grant execute on function public.receive_stock(uuid,integer,numeric,uuid,text) to authenticated;

-- Atomic FIFO consumption. Any failure rolls back all batch changes and movement rows.
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
    select id, quantity_remaining, unit_cost from public.inventory_batches
    where product_id=p_product_id and quantity_remaining>0
    order by received_at asc, created_at asc, id asc for update
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
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'FIFO_STOCK_CONSUMED','product',p_product_id,jsonb_build_object('quantity',p_quantity,'movement_type',p_movement_type,'reference_id',p_reference_id));
end; $$;
revoke all on function public.consume_stock_fifo(uuid,integer,text,text,uuid) from public;
grant execute on function public.consume_stock_fifo(uuid,integer,text,text,uuid) to authenticated;

-- Bootstrap the first Boss safely:
-- 1) Create the owner's auth user in Supabase Dashboard > Authentication > Users.
-- 2) Run this statement with that exact auth user UUID in SQL Editor:
-- update public.profiles set role='BOSS', full_name='Garage Owner' where id='OWNER-AUTH-USER-UUID';
-- Do not expose the service-role key or let a browser set profiles.role.


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


-- Panther Garage workshop operations. Apply after 001 and 002.
create table if not exists public.repair_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer_id uuid references public.customers(id),
  motorcycle_make text not null,
  motorcycle_model text,
  registration_number text,
  reported_issue text not null,
  diagnosis text,
  status text not null default 'RECEIVED' check(status in ('RECEIVED','DIAGNOSIS','WAITING_PARTS','IN_PROGRESS','READY','COLLECTED','CANCELLED')),
  labour_fee numeric(14,2) not null default 0 check(labour_fee >= 0),
  parts_total numeric(14,2) not null default 0 check(parts_total >= 0),
  total_cost numeric(14,2) not null default 0 check(total_cost >= 0),
  assigned_to uuid references public.profiles(id),
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  collected_at timestamptz,
  notes text
);
create index if not exists repair_jobs_status_date_idx on public.repair_jobs(status, received_at desc);
create index if not exists repair_jobs_customer_idx on public.repair_jobs(customer_id);
create table if not exists public.repair_parts (
  id uuid primary key default gen_random_uuid(),
  repair_job_id uuid not null references public.repair_jobs(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  sku text not null,
  quantity integer not null check(quantity > 0),
  unit_price numeric(14,2) not null check(unit_price >= 0),
  unit_cost numeric(14,2) not null default 0 check(unit_cost >= 0),
  line_total numeric(14,2) not null check(line_total >= 0)
);
create table if not exists public.repair_status_history (
  id uuid primary key default gen_random_uuid(),
  repair_job_id uuid not null references public.repair_jobs(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists repair_parts_job_idx on public.repair_parts(repair_job_id);
alter table public.repair_jobs enable row level security;
alter table public.repair_parts enable row level security;
alter table public.repair_status_history enable row level security;
drop policy if exists "staff read repair jobs" on public.repair_jobs;
create policy "staff read repair jobs" on public.repair_jobs for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff read repair parts" on public.repair_parts;
create policy "staff read repair parts" on public.repair_parts for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff read repair history" on public.repair_status_history;
create policy "staff read repair history" on public.repair_status_history for select to authenticated using(public.is_pgms_staff());
grant select on public.repair_jobs, public.repair_parts, public.repair_status_history to authenticated;

create or replace function public.create_repair_job(
  p_customer_id uuid,
  p_motorcycle_make text,
  p_motorcycle_model text,
  p_registration_number text,
  p_reported_issue text,
  p_assigned_to uuid,
  p_labour_fee numeric,
  p_parts jsonb,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_number text;
  v_part jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_cost numeric(14,2);
  v_alloc record;
  v_parts_total numeric(14,2) := 0;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if nullif(trim(p_motorcycle_make),'') is null then raise exception 'Motorcycle make is required'; end if;
  if nullif(trim(p_reported_issue),'') is null then raise exception 'Reported problem is required'; end if;
  if p_labour_fee is null or p_labour_fee < 0 then raise exception 'Labour fee cannot be negative'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'Customer not found'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and active=true) then raise exception 'Assigned employee is not active'; end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then raise exception 'Parts must be an array'; end if;
  v_number := 'PG-R-' || to_char(clock_timestamp(),'YYMMDD-HH24MISS') || '-' || upper(substr(replace(v_id::text,'-',''),1,5));
  insert into public.repair_jobs(id,job_number,customer_id,motorcycle_make,motorcycle_model,registration_number,reported_issue,assigned_to,labour_fee,notes,received_by)
  values(v_id,v_number,p_customer_id,trim(p_motorcycle_make),nullif(trim(p_motorcycle_model),''),nullif(trim(p_registration_number),''),trim(p_reported_issue),p_assigned_to,p_labour_fee,nullif(trim(p_notes),''),auth.uid());
  for v_part in select value from jsonb_array_elements(p_parts) loop
    v_qty := (v_part->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Part quantities must be positive whole numbers'; end if;
    select * into v_product from public.products where id=(v_part->>'product_id')::uuid and active=true for update;
    if not found then raise exception 'A selected spare part is unavailable'; end if;
    if v_product.selling_price <= 0 then raise exception 'Set a selling price for % before using it in a repair',v_product.name; end if;
    v_cost := 0;
    for v_alloc in select * from public.consume_stock_fifo(v_product.id,v_qty,'REPAIR_ISSUE','REPAIR',v_id) loop
      v_cost := v_cost + (v_alloc.unit_cost * v_alloc.quantity_consumed);
    end loop;
    insert into public.repair_parts(repair_job_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total)
    values(v_id,v_product.id,v_product.name,v_product.sku,v_qty,v_product.selling_price,v_cost/v_qty,v_product.selling_price*v_qty);
    v_parts_total := v_parts_total + (v_product.selling_price*v_qty);
  end loop;
  update public.repair_jobs set parts_total=v_parts_total,total_cost=v_parts_total+p_labour_fee where id=v_id;
  insert into public.repair_status_history(repair_job_id,new_status,changed_by,note) values(v_id,'RECEIVED',auth.uid(),'Repair job created');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'REPAIR_JOB_CREATED','repair_job',v_id,jsonb_build_object('job_number',v_number,'parts_total',v_parts_total,'labour_fee',p_labour_fee));
  return v_id;
end; $$;
revoke all on function public.create_repair_job(uuid,text,text,text,text,uuid,numeric,jsonb,text) from public;
grant execute on function public.create_repair_job(uuid,text,text,text,text,uuid,numeric,jsonb,text) to authenticated;

create or replace function public.update_repair_status(p_job_id uuid,p_status text,p_diagnosis text default null,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if p_status not in ('RECEIVED','DIAGNOSIS','WAITING_PARTS','IN_PROGRESS','READY','COLLECTED','CANCELLED') then raise exception 'Invalid repair status'; end if;
  select status into v_old from public.repair_jobs where id=p_job_id for update;
  if not found then raise exception 'Repair job not found'; end if;
  if v_old in ('COLLECTED','CANCELLED') and p_status <> v_old then raise exception 'Closed repair jobs cannot be reopened'; end if;
  if v_old='CANCELLED' or v_old='COLLECTED' then raise exception 'Repair job is already closed'; end if;
  if p_status='CANCELLED' and exists(select 1 from public.repair_parts where repair_job_id=p_job_id) then raise exception 'This job has issued spare parts. Process a stock return before cancelling it.'; end if;
  if p_status='COLLECTED' and v_old<>'READY' then raise exception 'Only a READY repair can be marked COLLECTED'; end if;
  update public.repair_jobs set status=p_status,
    diagnosis=coalesce(nullif(trim(p_diagnosis),''),diagnosis),
    completed_at=case when p_status='READY' then coalesce(completed_at,now()) else completed_at end,
    collected_at=case when p_status='COLLECTED' then now() else collected_at end
  where id=p_job_id;
  insert into public.repair_status_history(repair_job_id,old_status,new_status,changed_by,note)
  values(p_job_id,v_old,p_status,auth.uid(),nullif(trim(p_note),''));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'REPAIR_STATUS_CHANGED','repair_job',p_job_id,jsonb_build_object('from',v_old,'to',p_status));
end; $$;
revoke all on function public.update_repair_status(uuid,text,text,text) from public;
grant execute on function public.update_repair_status(uuid,text,text,text) to authenticated;




-- Stage 4: purchasing, supplier balances and expense controls.
-- Apply after migrations 001-003. All amounts are RWF.
create table if not exists public.purchase_orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 supplier_id uuid not null references public.suppliers(id), status text not null default 'DRAFT'
 check(status in ('DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
 order_date date not null default current_date, expected_date date, notes text,
 subtotal numeric(14,2) not null default 0 check(subtotal>=0), created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.purchase_order_items (
 id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id),
 product_id uuid not null references public.products(id), product_name text not null, sku text not null,
 quantity_ordered integer not null check(quantity_ordered>0), quantity_received integer not null default 0 check(quantity_received>=0 and quantity_received<=quantity_ordered),
 unit_cost numeric(14,2) not null check(unit_cost>=0), line_total numeric(14,2) not null check(line_total>=0)
);
create table if not exists public.supplier_invoices (
 id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.suppliers(id),
 purchase_order_id uuid references public.purchase_orders(id), invoice_number text not null,
 invoice_date date not null default current_date, due_date date, amount numeric(14,2) not null check(amount>0),
 paid_amount numeric(14,2) not null default 0 check(paid_amount>=0 and paid_amount<=amount),
 status text not null default 'UNPAID' check(status in ('UNPAID','PART_PAID','PAID')),
 notes text, recorded_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 unique(supplier_id,invoice_number)
);
create table if not exists public.supplier_payments (
 id uuid primary key default gen_random_uuid(), supplier_invoice_id uuid not null references public.supplier_invoices(id),
 amount numeric(14,2) not null check(amount>0), method text not null check(method in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD')),
 reference text, paid_at timestamptz not null default now(), recorded_by uuid references public.profiles(id)
);
create table if not exists public.garage_expenses (
 id uuid primary key default gen_random_uuid(), category text not null, description text not null,
 amount numeric(14,2) not null check(amount>0), expense_date date not null default current_date,
 payment_method text not null check(payment_method in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD')),
 reference text, status text not null default 'APPROVED' check(status in ('PENDING','APPROVED','REJECTED')),
 recorded_by uuid references public.profiles(id), approved_by uuid references public.profiles(id),
 approved_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists purchase_orders_date_idx on public.purchase_orders(created_at desc);
create index if not exists supplier_invoices_due_idx on public.supplier_invoices(status,due_date);
create index if not exists garage_expenses_date_idx on public.garage_expenses(expense_date desc);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.garage_expenses enable row level security;

do $$ declare t text; begin
 foreach t in array array['purchase_orders','purchase_order_items','supplier_invoices','supplier_payments','garage_expenses'] loop
  execute format('drop policy if exists "staff read %s" on public.%I',t,t);
  execute format('drop policy if exists "boss read %s" on public.%I',t,t);
  execute format('create policy "boss read %s" on public.%I for select to authenticated using(public.is_pgms_boss())',t,t);
 end loop;
end $$;
drop policy if exists "staff insert supplier invoices" on public.supplier_invoices;
create policy "staff insert supplier invoices" on public.supplier_invoices for insert to authenticated with check(public.is_pgms_staff());
drop policy if exists "staff insert expenses" on public.garage_expenses;
create policy "staff insert expenses" on public.garage_expenses for insert to authenticated with check(public.is_pgms_boss() or (status='PENDING' and approved_by is null and approved_at is null));
grant select,insert on public.supplier_invoices to authenticated;
grant select,insert on public.garage_expenses to authenticated;
grant select on public.purchase_orders,public.purchase_order_items,public.supplier_payments to authenticated;

create or replace function public.create_purchase_order(p_supplier_id uuid,p_expected_date date,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid(); v_no text; x jsonb; p public.products%rowtype; q int; c numeric; v_total numeric:=0;
begin
 if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'Supplier not found'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one order item'; end if;
 v_no:='PG-PO-'||to_char(clock_timestamp(),'YYMMDD-HH24MISS')||'-'||upper(substr(replace(v_id::text,'-',''),1,4));
 insert into public.purchase_orders(id,order_number,supplier_id,status,expected_date,notes,created_by) values(v_id,v_no,p_supplier_id,'ORDERED',p_expected_date,nullif(trim(p_notes),''),auth.uid());
 for x in select value from jsonb_array_elements(p_items) loop
  q:=(x->>'quantity')::int; c:=(x->>'unit_cost')::numeric;
  if q is null or q<1 or c is null or c<0 then raise exception 'Invalid order quantity or unit cost'; end if;
  select * into p from public.products where id=(x->>'product_id')::uuid and active=true;
  if not found then raise exception 'An order product is unavailable'; end if;
  insert into public.purchase_order_items(purchase_order_id,product_id,product_name,sku,quantity_ordered,unit_cost,line_total)
  values(v_id,p.id,p.name,p.sku,q,c,q*c);
  v_total:=v_total+q*c;
 end loop;
 update public.purchase_orders set subtotal=v_total where id=v_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'PURCHASE_ORDER_CREATED','purchase_order',v_id,jsonb_build_object('order_number',v_no,'subtotal',v_total));
 return v_id;
end; $$;
revoke all on function public.create_purchase_order(uuid,date,text,jsonb) from public;
grant execute on function public.create_purchase_order(uuid,date,text,jsonb) to authenticated;

create or replace function public.receive_purchase_order_item(p_item_id uuid,p_quantity integer,p_receipt_reference text default null)
returns void language plpgsql security definer set search_path='' as $$
declare i public.purchase_order_items%rowtype; o public.purchase_orders%rowtype;
begin
 if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'Receipt quantity must be positive'; end if;
 select * into i from public.purchase_order_items where id=p_item_id for update;
 if not found then raise exception 'Purchase order item not found'; end if;
 select * into o from public.purchase_orders where id=i.purchase_order_id for update;
 if o.status not in ('ORDERED','PARTIALLY_RECEIVED') then raise exception 'Only ordered purchase orders can receive goods'; end if;
 if i.quantity_received+p_quantity>i.quantity_ordered then raise exception 'Receipt exceeds outstanding ordered quantity'; end if;
 perform public.receive_stock(i.product_id,p_quantity,i.unit_cost,o.supplier_id,p_receipt_reference);
 update public.purchase_order_items set quantity_received=quantity_received+p_quantity where id=i.id;
 if not exists(select 1 from public.purchase_order_items where purchase_order_id=o.id and quantity_received<quantity_ordered) then
  update public.purchase_orders set status='RECEIVED',updated_at=now() where id=o.id;
 else
  update public.purchase_orders set status='PARTIALLY_RECEIVED',updated_at=now() where id=o.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'PURCHASE_GOODS_RECEIVED','purchase_order',o.id,jsonb_build_object('item_id',i.id,'quantity',p_quantity,'receipt_reference',p_receipt_reference));
end; $$;
revoke all on function public.receive_purchase_order_item(uuid,integer,text) from public;
grant execute on function public.receive_purchase_order_item(uuid,integer,text) to authenticated;

create or replace function public.record_supplier_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.supplier_invoices%rowtype; v_id uuid:=gen_random_uuid(); v_paid numeric;
begin
 if not public.is_pgms_boss() then raise exception 'Only BOSS can record supplier payments'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment must be greater than zero'; end if;
 select * into i from public.supplier_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Supplier invoice not found'; end if;
 if i.paid_amount+p_amount>i.amount then raise exception 'Payment exceeds outstanding invoice balance'; end if;
 insert into public.supplier_payments(id,supplier_invoice_id,amount,method,reference,recorded_by) values(v_id,p_invoice_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid());
 v_paid:=i.paid_amount+p_amount;
 update public.supplier_invoices set paid_amount=v_paid,status=case when v_paid=i.amount then 'PAID' else 'PART_PAID' end where id=i.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'SUPPLIER_PAYMENT_RECORDED','supplier_invoice',i.id,jsonb_build_object('payment_id',v_id,'amount',p_amount,'method',p_method));
 return v_id;
end; $$;
revoke all on function public.record_supplier_payment(uuid,numeric,text,text) from public;
grant execute on function public.record_supplier_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.review_expense(p_expense_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if not public.is_pgms_boss() then raise exception 'Only BOSS can review expenses'; end if;
 select status into v_status from public.garage_expenses where id=p_expense_id for update;
 if not found then raise exception 'Expense not found'; end if;
 if v_status<>'PENDING' then raise exception 'Expense has already been reviewed'; end if;
 update public.garage_expenses set status=case when p_approve then 'APPROVED' else 'REJECTED' end,approved_by=auth.uid(),approved_at=now() where id=p_expense_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'EXPENSE_REVIEWED','garage_expense',p_expense_id,jsonb_build_object('approved',p_approve));
end; $$;
revoke all on function public.review_expense(uuid,boolean) from public;
grant execute on function public.review_expense(uuid,boolean) to authenticated;
-- Stage 5: management reporting, in-app notifications and employee activity.
-- Apply after migrations 001-004.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null default 'GENERAL',
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Boss alerts are generated server-side by database triggers; clients cannot create alerts.
create or replace function public.notify_pgms_bosses(
  p_title text, p_message text, p_category text, p_entity_type text, p_entity_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id,title,message,category,entity_type,entity_id)
  select id,p_title,p_message,p_category,p_entity_type,p_entity_id
  from public.profiles where role='BOSS' and active=true;
end;
$$;

create or replace function public.pgms_notify_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_pgms_bosses('Sale completed',
    'Invoice '||new.invoice_number||' was completed for RWF '||to_char(new.total,'FM999,999,999,990'),
    'SALE','SALE',new.id);
  return new;
end; $$;
drop trigger if exists pgms_sale_notification on public.sales;
create trigger pgms_sale_notification after insert on public.sales
for each row when (new.status='COMPLETED') execute function public.pgms_notify_sale();

create or replace function public.pgms_notify_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='PENDING' then
    perform public.notify_pgms_bosses('Expense approval required',
      new.category||': '||new.description||' — RWF '||to_char(new.amount,'FM999,999,999,990'),
      'APPROVAL','EXPENSE',new.id);
  elsif new.status='APPROVED' then
    perform public.notify_pgms_bosses('Expense recorded',
      new.category||' expense approved: RWF '||to_char(new.amount,'FM999,999,999,990'),
      'EXPENSE','EXPENSE',new.id);
  end if;
  return new;
end; $$;
drop trigger if exists pgms_expense_notification on public.garage_expenses;
create trigger pgms_expense_notification after insert or update of status on public.garage_expenses
for each row execute function public.pgms_notify_expense();

create or replace function public.pgms_notify_purchase_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('ORDERED','PARTIALLY_RECEIVED','RECEIVED') and (tg_op='INSERT' or (tg_op='UPDATE' and old.status is distinct from new.status)) then
    perform public.notify_pgms_bosses('Purchase order updated',
      new.order_number||' status: '||new.status||' · RWF '||to_char(new.subtotal,'FM999,999,999,990'),
      'PURCHASE','PURCHASE_ORDER',new.id);
  end if;
  return new;
end; $$;
drop trigger if exists pgms_purchase_order_notification on public.purchase_orders;
create trigger pgms_purchase_order_notification after insert or update of status on public.purchase_orders
for each row execute function public.pgms_notify_purchase_order();

create or replace function public.pgms_notify_low_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_min integer; v_total bigint;
begin
  if new.movement_type not in ('PURCHASE_RECEIPT','SALE','REPAIR_ISSUE','DAMAGE','LOSS','ADJUSTMENT','WRITE_OFF') then return new; end if;
  select p.name,p.minimum_stock,coalesce(sum(b.quantity_remaining),0)::bigint
    into v_name,v_min,v_total
    from public.products p left join public.inventory_batches b on b.product_id=p.id
    where p.id=new.product_id group by p.id,p.name,p.minimum_stock;
  if v_name is not null and v_total <= v_min then
    perform public.notify_pgms_bosses('Low stock warning',
      v_name||' has '||v_total||' units remaining against a minimum of '||v_min||'. Review stock levels.',
      'LOW_STOCK','PRODUCT',new.product_id);
  end if;
  return new;
end; $$;
drop trigger if exists pgms_low_stock_notification on public.stock_movements;
create trigger pgms_low_stock_notification after insert on public.stock_movements
for each row execute function public.pgms_notify_low_stock();

-- Audit history is read-only for staff; the boss gets the full audit view.
-- Reports are computed from source transactions, not manually entered totals.


-- Stage 6: Smart restocking configuration
alter table public.products
  add column if not exists supplier_lead_time_days integer not null default 7
    check (supplier_lead_time_days between 1 and 365),
  add column if not exists safety_stock integer not null default 0
    check (safety_stock >= 0),
  add column if not exists target_stock_days integer not null default 30
    check (target_stock_days between 1 and 365);
comment on column public.products.supplier_lead_time_days is 'Boss-configured expected replenishment lead time in calendar days.';
comment on column public.products.safety_stock is 'Boss-configured extra units held as a demand/lead-time buffer.';
comment on column public.products.target_stock_days is 'Boss-configured desired stock coverage after replenishment, in calendar days.';



-- Stage 7: customer self-service portal, repair booking requests and product imagery.
create table if not exists public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique default ('PG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_name text not null,
  phone text not null,
  email text,
  motorcycle_make text not null,
  motorcycle_model text,
  registration_number text,
  reported_issue text not null,
  preferred_date date,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','DECLINED','CONVERTED','CANCELLED')),
  staff_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_bookings_created_idx on public.service_bookings(created_at desc);
create index if not exists service_bookings_phone_idx on public.service_bookings(phone);
alter table public.service_bookings enable row level security;
drop policy if exists "staff read service bookings" on public.service_bookings;
create policy "staff read service bookings" on public.service_bookings for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff update service bookings" on public.service_bookings;
create policy "staff update service bookings" on public.service_bookings for update to authenticated using(public.is_pgms_staff()) with check(public.is_pgms_staff());
grant select, update on public.service_bookings to authenticated;
grant insert on public.service_bookings to authenticated;
drop policy if exists "public create service booking" on public.service_bookings;
create policy "public create service booking" on public.service_bookings for insert to anon, authenticated with check (
  length(trim(customer_name)) between 2 and 120 and length(trim(phone)) between 7 and 30
  and length(trim(motorcycle_make)) between 1 and 80 and length(trim(reported_issue)) between 5 and 2000
  and status='PENDING' and staff_note is null
);

-- Public tracking only reveals a minimal repair status after matching BOTH job number and customer phone.
create or replace function public.track_customer_repair(p_job_number text, p_phone text)
returns table(job_number text, motorcycle_make text, motorcycle_model text, status text, received_at timestamptz, completed_at timestamptz, collected_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_job_number,''))) not between 1 and 80
     or length(trim(coalesce(p_phone,''))) not between 7 and 30 then
    return;
  end if;
  return query
  select j.job_number, j.motorcycle_make, j.motorcycle_model, j.status, j.received_at, j.completed_at, j.collected_at
  from public.repair_jobs j
  join public.customers c on c.id=j.customer_id
  where upper(trim(j.job_number))=upper(trim(p_job_number))
    and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(trim(p_phone),'[^0-9]','','g')
  limit 1;
end;
$$;
revoke all on function public.track_customer_repair(text,text) from public;
grant execute on function public.track_customer_repair(text,text) to service_role;

-- Product photos live in a public-read bucket; only authenticated PGMS staff can upload/replace files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images" on storage.objects for select to public using(bucket_id='product-images');
drop policy if exists "Staff upload product images" on storage.objects;
create policy "Staff upload product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_pgms_staff());
drop policy if exists "Staff update product images" on storage.objects;
create policy "Staff update product images" on storage.objects for update to authenticated using(bucket_id='product-images' and public.is_pgms_staff()) with check(bucket_id='product-images' and public.is_pgms_staff());
drop policy if exists "Staff delete product images" on storage.objects;
create policy "Staff delete product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and public.is_pgms_staff());

-- Guest spare-parts requests: prices are looked up in PostgreSQL, never trusted from the browser.
create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique default ('PO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_name text not null, phone text not null, email text,
  delivery_note text,
  status text not null default 'PENDING' check(status in ('PENDING','CONTACTED','CONFIRMED','FULFILLED','CANCELLED')),
  total numeric(14,2) not null default 0 check(total>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null, sku text not null,
  quantity integer not null check(quantity between 1 and 100),
  unit_price numeric(14,2) not null check(unit_price>=0),
  line_total numeric(14,2) not null check(line_total>=0)
);
create index if not exists customer_orders_created_idx on public.customer_orders(created_at desc);
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;
drop policy if exists "staff read customer orders" on public.customer_orders;
create policy "staff read customer orders" on public.customer_orders for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff update customer orders" on public.customer_orders;
create policy "staff update customer orders" on public.customer_orders for update to authenticated using(public.is_pgms_staff()) with check(public.is_pgms_staff());
drop policy if exists "staff read customer order items" on public.customer_order_items;
create policy "staff read customer order items" on public.customer_order_items for select to authenticated using(public.is_pgms_staff());
grant select,update on public.customer_orders to authenticated;
grant select on public.customer_order_items to authenticated;
create or replace function public.submit_customer_order(p_customer_name text,p_phone text,p_email text,p_delivery_note text,p_lines jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_order_id uuid; v_reference text; v_total numeric(14,2):=0; v_line record; v_product public.products%rowtype; v_price numeric(14,2);
begin
  if length(trim(coalesce(p_customer_name,''))) not between 2 and 120
     or length(trim(coalesce(p_phone,''))) not between 7 and 30
     or coalesce(length(trim(p_email)),0)>254
     or coalesce(length(trim(p_delivery_note)),0)>2000 then
    raise exception 'Customer details exceed allowed limits';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
            where x.product_id is null or x.quantity is null or x.quantity not between 1 and 100) then
    raise exception 'Invalid item quantity or product';
  end if;
  if exists(select x.product_id from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
            group by x.product_id having sum(x.quantity)>100) then
    raise exception 'A product quantity cannot exceed 100 per order';
  end if;
  insert into public.customer_orders(customer_name,phone,email,delivery_note)
  values(trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_delivery_note,'')),''))
  returning id,order_reference into v_order_id,v_reference;
  for v_line in select x.product_id,sum(x.quantity)::integer as quantity
                from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
                group by x.product_id order by x.product_id loop
    select * into v_product from public.products where id=v_line.product_id and active=true;
    if not found then raise exception 'A selected product is no longer available'; end if;
    if v_product.price_status <> 'CONFIRMED' or v_product.selling_price<=0 then
      raise exception 'The price for "%" is still awaiting confirmation',v_product.name;
    end if;
    v_price:=v_product.selling_price;
    insert into public.customer_order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    values(v_order_id,v_product.id,v_product.name,v_product.sku,v_line.quantity,v_price,v_line.quantity*v_price);
    v_total:=v_total+(v_line.quantity*v_price);
  end loop;
  update public.customer_orders set total=v_total where id=v_order_id;
  return v_reference;
end; $$;
revoke all on function public.submit_customer_order(text,text,text,text,jsonb) from public;
grant execute on function public.submit_customer_order(text,text,text,text,jsonb) to service_role;


-- Fresh-install hardening: public catalogue RPCs are the only anon product read path.
drop policy if exists "public read active catalogue" on public.products;
revoke select on public.products from anon;
-- Trigger-only notification helper; trigger execution remains available to its owner.
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from public;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from anon;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from authenticated;
revoke execute on function public.track_customer_repair(text,text) from anon, authenticated;
grant execute on function public.track_customer_repair(text,text) to service_role;
revoke execute on function public.submit_customer_order(text,text,text,text,jsonb) from anon, authenticated;
grant execute on function public.submit_customer_order(text,text,text,text,jsonb) to service_role;
revoke insert on public.service_bookings from anon;

-- Stage 14: low-stock alerts for all active staff, boss email delivery tracking,
-- and direct staff chat.

create table if not exists public.notification_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  boss_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique(notification_id, boss_id)
);

alter table public.notification_email_deliveries enable row level security;
revoke all on public.notification_email_deliveries from anon, authenticated;

create table if not exists public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists staff_messages_thread_idx
  on public.staff_messages(sender_id, recipient_id, created_at desc);
create index if not exists staff_messages_recipient_idx
  on public.staff_messages(recipient_id, read_at, created_at desc);

alter table public.staff_messages enable row level security;
drop policy if exists "staff read own messages" on public.staff_messages;
create policy "staff read own messages" on public.staff_messages
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "staff send messages" on public.staff_messages;
create policy "staff send messages" on public.staff_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_pgms_staff()
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.active = true)
  );
drop policy if exists "recipient marks messages read" on public.staff_messages;
create policy "recipient marks messages read" on public.staff_messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
revoke update on public.staff_messages from authenticated;
grant select, insert on public.staff_messages to authenticated;
grant update (read_at) on public.staff_messages to authenticated;

-- Low-stock warnings are operational alerts for every active staff member.
-- The explicit 2-unit floor keeps the alert useful even when minimum_stock is 0.
create or replace function public.pgms_notify_low_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_min integer;
  v_total bigint;
begin
  if new.movement_type not in ('PURCHASE_RECEIPT','SALE','REPAIR_ISSUE','DAMAGE','LOSS','ADJUSTMENT','WRITE_OFF') then
    return new;
  end if;
  select p.name, p.minimum_stock, coalesce(sum(b.quantity_remaining),0)::bigint
    into v_name, v_min, v_total
    from public.products p
    left join public.inventory_batches b on b.product_id = p.id
    where p.id = new.product_id
    group by p.id, p.name, p.minimum_stock;
  if v_name is not null and v_total <= greatest(coalesce(v_min, 0), 2) then
    insert into public.notifications(recipient_id, title, message, category, entity_type, entity_id)
    select p.id,
      'Low stock: ' || v_name,
      v_name || ' has only ' || v_total || ' unit' || case when v_total = 1 then '' else 's' end ||
        ' remaining. Restock review is recommended now.',
      'LOW_STOCK', 'PRODUCT', new.product_id
    from public.profiles p
    where p.active = true
      and not exists (
        select 1 from public.notifications n
        where n.recipient_id = p.id
          and n.category = 'LOW_STOCK'
          and n.entity_type = 'PRODUCT'
          and n.entity_id = new.product_id
          and n.created_at > now() - interval '24 hours'
      );
  end if;
  return new;
end; $$;

drop trigger if exists pgms_low_stock_notification on public.stock_movements;
create trigger pgms_low_stock_notification after insert on public.stock_movements
for each row execute function public.pgms_notify_low_stock();

revoke all on function public.pgms_notify_low_stock() from public;


-- Consolidated stage 16 migration: staff quantities, hardened chat and stock alerts.
-- Stage 16: safe staff quantity visibility, hardened direct chat, and stock alerts.
-- Apply after migrations 001-015. This is additive and does not alter inventory rows.

-- Quantity-only SECURITY DEFINER aggregate: staff can see the same physical and
-- available counts as the BOSS without receiving inventory batch or cost access.
create or replace function public.staff_inventory_summary()
returns table(
  product_id uuid,
  physical_stock bigint,
  available_stock bigint,
  minimum_stock integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    prod.id,
    coalesce(sum(batch.quantity_remaining), 0)::bigint,
    greatest(coalesce(sum(batch.quantity_remaining), 0), 0)::bigint,
    prod.minimum_stock
  from public.products prod
  left join public.inventory_batches batch on batch.product_id = prod.id
  where exists (
    select 1
    from public.profiles staff
    where staff.id = (select auth.uid())
      and staff.active = true
      and staff.role in ('BOSS', 'EMPLOYEE')
  )
  group by prod.id, prod.minimum_stock;
$$;
revoke all on function public.staff_inventory_summary() from public, anon;
grant execute on function public.staff_inventory_summary() to authenticated;

-- The previous stage is not fully present on the current production database.
-- Provision its delivery-tracking table and the API-backed staff chat table.
create table if not exists public.notification_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  boss_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique(notification_id, boss_id)
);
alter table public.notification_email_deliveries enable row level security;
revoke all on public.notification_email_deliveries from public, anon, authenticated;

grant usage on schema public to authenticated;
create table if not exists public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists staff_messages_thread_idx
  on public.staff_messages(sender_id, recipient_id, created_at desc);
create index if not exists staff_messages_recipient_idx
  on public.staff_messages(recipient_id, read_at, created_at desc);
alter table public.staff_messages enable row level security;
revoke all on public.staff_messages from public, anon, authenticated;

-- RLS helper keeps direct Supabase access aligned with the API's active,
-- opposite-role BOSS<->EMPLOYEE conversation rule.
create or replace function public.pgms_can_chat_with(p_peer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles peer on peer.id = p_peer_id
    where me.id = (select auth.uid())
      and me.active = true
      and peer.active = true
      and me.role in ('BOSS', 'EMPLOYEE')
      and peer.role in ('BOSS', 'EMPLOYEE')
      and me.role <> peer.role
  );
$$;
revoke all on function public.pgms_can_chat_with(uuid) from public, anon;
grant execute on function public.pgms_can_chat_with(uuid) to authenticated;

drop policy if exists "staff read own messages" on public.staff_messages;
create policy "staff read own messages" on public.staff_messages
  for select to authenticated
  using (
    public.is_pgms_staff()
    and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
    and public.pgms_can_chat_with(
      case when sender_id = (select auth.uid()) then recipient_id else sender_id end
    )
  );
drop policy if exists "staff send messages" on public.staff_messages;
create policy "staff send messages" on public.staff_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.pgms_can_chat_with(recipient_id)
  );
drop policy if exists "recipient marks messages read" on public.staff_messages;
create policy "recipient marks messages read" on public.staff_messages
  for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.pgms_can_chat_with(sender_id)
  )
  with check (
    recipient_id = (select auth.uid())
    and public.pgms_can_chat_with(sender_id)
  );
grant select, insert on public.staff_messages to authenticated;
grant update (read_at) on public.staff_messages to authenticated;

-- Every active staff member gets a low-stock notice. A zero balance uses a
-- distinct category/title so it cannot be hidden by an earlier low-stock alert.
create or replace function public.pgms_notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_min integer;
  v_total bigint;
  v_category text;
begin
  if new.movement_type not in (
    'PURCHASE_RECEIPT', 'SALE', 'REPAIR_ISSUE', 'DAMAGE', 'LOSS', 'ADJUSTMENT', 'WRITE_OFF'
  ) then
    return new;
  end if;

  select prod.name, prod.minimum_stock, coalesce(sum(batch.quantity_remaining), 0)::bigint
    into v_name, v_min, v_total
    from public.products prod
    left join public.inventory_batches batch on batch.product_id = prod.id
    where prod.id = new.product_id
    group by prod.id, prod.name, prod.minimum_stock;

  if v_name is not null and v_total <= greatest(coalesce(v_min, 0), 2) then
    v_category := case when v_total <= 0 then 'OUT_OF_STOCK' else 'LOW_STOCK' end;
    insert into public.notifications(recipient_id, title, message, category, entity_type, entity_id)
    select
      staff.id,
      case when v_total <= 0 then 'Out of stock: ' else 'Low stock: ' end || v_name,
      case
        when v_total <= 0 then v_name || ' is out of stock (0 units remaining). Replenish before the next sale.'
        else v_name || ' has only ' || v_total || ' unit' || case when v_total = 1 then '' else 's' end ||
          ' remaining against a minimum of ' || coalesce(v_min, 0) || '. Restock review is recommended now.'
      end,
      v_category,
      'PRODUCT',
      new.product_id
    from public.profiles staff
    where staff.active = true
      and not exists (
        select 1
        from public.notifications notice
        where notice.recipient_id = staff.id
          and notice.category = v_category
          and notice.entity_type = 'PRODUCT'
          and notice.entity_id = new.product_id
          and notice.created_at > now() - interval '24 hours'
      );
  end if;
  return new;
end;
$$;
revoke all on function public.pgms_notify_low_stock() from public, anon, authenticated;
drop trigger if exists pgms_low_stock_notification on public.stock_movements;
create trigger pgms_low_stock_notification
after insert on public.stock_movements
for each row execute function public.pgms_notify_low_stock();
