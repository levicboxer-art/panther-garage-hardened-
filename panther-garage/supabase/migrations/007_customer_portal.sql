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
grant insert on public.service_bookings to anon, authenticated;
drop policy if exists "public create service booking" on public.service_bookings;
create policy "public create service booking" on public.service_bookings for insert to anon, authenticated with check (
  length(trim(customer_name)) between 2 and 120 and length(trim(phone)) between 7 and 30
  and length(trim(motorcycle_make)) between 1 and 80 and length(trim(reported_issue)) between 5 and 2000
  and status='PENDING' and staff_note is null
);

-- Public tracking only reveals a minimal repair status after matching BOTH job number and customer phone.
create or replace function public.track_customer_repair(p_job_number text, p_phone text)
returns table(job_number text, motorcycle_make text, motorcycle_model text, status text, received_at timestamptz, completed_at timestamptz, collected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.job_number, j.motorcycle_make, j.motorcycle_model, j.status, j.received_at, j.completed_at, j.collected_at
  from public.repair_jobs j
  join public.customers c on c.id=j.customer_id
  where upper(trim(j.job_number))=upper(trim(p_job_number))
    and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(trim(p_phone),'[^0-9]','','g')
  limit 1;
$$;
revoke all on function public.track_customer_repair(text,text) from public;
grant execute on function public.track_customer_repair(text,text) to anon, authenticated;

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
declare v_order_id uuid; v_reference text; v_total numeric(14,2):=0; v_line jsonb; v_product public.products%rowtype; v_qty integer; v_price numeric(14,2);
begin
  if length(trim(coalesce(p_customer_name,'')))<2 or length(trim(coalesce(p_phone,'')))<7 then raise exception 'Customer name and valid phone are required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>30 then raise exception 'Cart must contain between 1 and 30 products'; end if;
  insert into public.customer_orders(customer_name,phone,email,delivery_note) values(trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_delivery_note,'')),'')) returning id,order_reference into v_order_id,v_reference;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    if v_qty<1 or v_qty>100 then raise exception 'Invalid item quantity'; end if;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid and active=true;
    if not found then raise exception 'A selected product is no longer available'; end if;
    v_price:=v_product.selling_price;
    insert into public.customer_order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    values(v_order_id,v_product.id,v_product.name,v_product.sku,v_qty,v_price,v_qty*v_price);
    v_total:=v_total+(v_qty*v_price);
  end loop;
  update public.customer_orders set total=v_total where id=v_order_id;
  return v_reference;
end; $$;
revoke all on function public.submit_customer_order(text,text,text,text,jsonb) from public;
grant execute on function public.submit_customer_order(text,text,text,text,jsonb) to anon,authenticated;

-- Bound public booking fields and tracking probes; detailed hardening follows in 010.
drop policy if exists "public create service booking" on public.service_bookings;
create policy "public create service booking" on public.service_bookings for insert to anon, authenticated with check (
  length(trim(customer_name)) between 2 and 120 and length(trim(phone)) between 7 and 30
  and coalesce(length(trim(email)),0) <= 254
  and length(trim(motorcycle_make)) between 1 and 80
  and coalesce(length(trim(motorcycle_model)),0) <= 120
  and coalesce(length(trim(registration_number)),0) <= 40
  and length(trim(reported_issue)) between 5 and 2000
  and status='PENDING' and staff_note is null
);
