-- Stage 11: SQL hardening for public RPCs, catalogue exposure, orders and imports.
-- Idempotent and applied after 009_fix_fifo_stock_consumption.sql.

-- Trigger-only helper: SECURITY DEFINER trigger execution does not require callers
-- to have EXECUTE on the notification helper.
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from public;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from anon;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from authenticated;

-- Catalogue data is exposed only through the shaped, active-product RPCs.
drop policy if exists "public read active catalogue" on public.products;
revoke select on public.products from anon;

-- Public inputs have bounded lengths and cannot inject staff-only fields.
drop policy if exists "public create service booking" on public.service_bookings;
create policy "public create service booking" on public.service_bookings
  for insert to anon, authenticated with check (
    length(trim(customer_name)) between 2 and 120
    and length(trim(phone)) between 7 and 30
    and coalesce(length(trim(email)),0) <= 254
    and length(trim(motorcycle_make)) between 1 and 80
    and coalesce(length(trim(motorcycle_model)),0) <= 120
    and coalesce(length(trim(registration_number)),0) <= 40
    and length(trim(reported_issue)) between 5 and 2000
    and status='PENDING' and staff_note is null
  );

create or replace function public.track_customer_repair(p_job_number text, p_phone text)
returns table(job_number text, motorcycle_make text, motorcycle_model text, status text,
              received_at timestamptz, completed_at timestamptz, collected_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_job_number,''))) not between 1 and 80
     or length(trim(coalesce(p_phone,''))) not between 7 and 30 then
    return;
  end if;
  return query
    select j.job_number, j.motorcycle_make, j.motorcycle_model, j.status,
           j.received_at, j.completed_at, j.collected_at
    from public.repair_jobs j
    join public.customers c on c.id=j.customer_id
    where upper(trim(j.job_number))=upper(trim(p_job_number))
      and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(trim(p_phone),'[^0-9]','','g')
    limit 1;
end; $$;
revoke all on function public.track_customer_repair(text,text) from public;
revoke execute on function public.track_customer_repair(text,text) from anon, authenticated;
grant execute on function public.track_customer_repair(text,text) to service_role;

-- Customer orders are requests only: this function never checks, deducts or
-- reserves stock. Duplicate product lines are aggregated before insertion and
-- the per-product quantity cap applies to the aggregate.
create or replace function public.submit_customer_order(
  p_customer_name text, p_phone text, p_email text, p_delivery_note text, p_lines jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid; v_reference text; v_total numeric(14,2) := 0;
  v_line record; v_product public.products%rowtype; v_price numeric(14,2);
begin
  if length(trim(coalesce(p_customer_name,''))) not between 2 and 120
     or length(trim(coalesce(p_phone,''))) not between 7 and 30
     or coalesce(length(trim(p_email)),0) > 254
     or coalesce(length(trim(p_delivery_note)),0) > 2000 then
    raise exception 'Customer details exceed allowed limits';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
    where x.product_id is null or x.quantity is null or x.quantity not between 1 and 100
  ) then raise exception 'Invalid item quantity or product'; end if;
  if exists (
    select x.product_id from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
    group by x.product_id having sum(x.quantity) > 100
  ) then raise exception 'A product quantity cannot exceed 100 per order'; end if;

  insert into public.customer_orders(customer_name,phone,email,delivery_note)
  values(trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),
         nullif(trim(coalesce(p_delivery_note,'')),''))
  returning id, order_reference into v_order_id, v_reference;

  for v_line in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity integer)
    group by x.product_id
    order by x.product_id
  loop
    select * into v_product from public.products
    where id=v_line.product_id and active=true;
    if not found then raise exception 'A selected product is no longer available'; end if;
    if v_product.price_status <> 'CONFIRMED' or v_product.selling_price <= 0 then
      raise exception 'The price for "%" is still awaiting confirmation', v_product.name;
    end if;
    v_price := v_product.selling_price;
    insert into public.customer_order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    values(v_order_id,v_product.id,v_product.name,v_product.sku,v_line.quantity,v_price,v_line.quantity*v_price);
    v_total := v_total + (v_line.quantity * v_price);
  end loop;
  update public.customer_orders set total=v_total where id=v_order_id;
  return v_reference;
end; $$;
revoke all on function public.submit_customer_order(text,text,text,text,jsonb) from public;
revoke execute on function public.submit_customer_order(text,text,text,text,jsonb) from anon, authenticated;
grant execute on function public.submit_customer_order(text,text,text,text,jsonb) to service_role;

-- Public writes must pass through the bounded API routes and their abuse controls.
revoke insert on public.service_bookings from anon;

-- Child provenance relationships represented by columns are real foreign keys.
do $$ begin
  alter table public.inventory_batches
    add constraint inventory_batches_source_import_item_fk
    foreign key (source_import_item_id) references public.inventory_import_items(id);
exception when duplicate_object then null; end $$;

-- A matched import row may only point at an active product.
create or replace function public.enforce_active_import_match()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.decision in ('MATCH','ADD_BATCH') and new.matched_product_id is not null
     and not exists (select 1 from public.products where id=new.matched_product_id and active=true) then
    raise exception 'Matched import product must be active';
  end if;
  return new;
end; $$;
drop trigger if exists inventory_import_items_active_match on public.inventory_import_items;
create trigger inventory_import_items_active_match
before insert or update of decision, matched_product_id on public.inventory_import_items
for each row execute function public.enforce_active_import_match();

-- Failed/unresolved rows cannot be hidden behind terminal APPLIED state.
create or replace function public.enforce_import_terminal_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='APPLIED' and exists (
    select 1 from public.inventory_import_items i
    where i.import_id=new.id and i.source_role='PRIMARY'
      and (i.review_status='NEEDS_REVIEW' or jsonb_array_length(i.errors) > 0
           or (i.review_status <> 'SKIPPED' and not i.applied)
           or (i.matched_product_id is not null and not exists (
                 select 1 from public.products p where p.id=i.matched_product_id and p.active=true
               )))
  ) then
    raise exception 'Import has unresolved, failed, or unapplied rows';
  end if;
  return new;
end; $$;
drop trigger if exists inventory_imports_terminal_state on public.inventory_imports;
create trigger inventory_imports_terminal_state
before update of status on public.inventory_imports
for each row execute function public.enforce_import_terminal_state();

-- Approval is terminally meaningful only when every primary row is resolved.
create or replace function public.approve_inventory_import(p_import_id uuid, p_include_blocking boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_import public.inventory_imports%rowtype; v_approved integer; v_remaining integer;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can approve an inventory import'; end if;
  select * into v_import from public.inventory_imports where id=p_import_id for update;
  if not found then raise exception 'Import not found'; end if;
  if v_import.status in ('APPLIED','CANCELLED') then raise exception 'Import is not reviewable'; end if;
  update public.inventory_import_items set review_status='APPROVED', decision=case when decision='PENDING' then 'CREATE' else decision end
  where import_id=p_import_id and source_role='PRIMARY' and applied=false and review_status <> 'SKIPPED'
    and quantity is not null and quantity > 0 and unit_cost is not null and unit_cost >= 0
    and (p_include_blocking or has_blocking_conflict=false);
  get diagnostics v_approved = row_count;
  select count(*) into v_remaining from public.inventory_import_items
  where import_id=p_import_id and source_role='PRIMARY' and review_status='NEEDS_REVIEW';
  if v_remaining > 0 then raise exception 'Resolve all import rows before approval'; end if;
  update public.inventory_imports set status='APPROVED', approved_by=auth.uid(), approved_at=now() where id=p_import_id;
  return jsonb_build_object('approved',v_approved,'remaining_review',0,'status','APPROVED');
end; $$;
revoke all on function public.approve_inventory_import(uuid,boolean) from public;
grant execute on function public.approve_inventory_import(uuid,boolean) to authenticated;
