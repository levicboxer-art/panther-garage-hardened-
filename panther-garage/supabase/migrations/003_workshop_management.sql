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
