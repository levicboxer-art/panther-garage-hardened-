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
create policy "staff read batches" on public.inventory_batches for select to authenticated using(public.is_pgms_staff());
drop policy if exists "staff read movements" on public.stock_movements;
create policy "staff read movements" on public.stock_movements for select to authenticated using(public.is_pgms_staff());
-- Intentionally no direct INSERT/UPDATE/DELETE policies on batches or movements.
-- Stock changes must use the SECURITY DEFINER RPCs below.

grant select on public.products to anon, authenticated;
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
