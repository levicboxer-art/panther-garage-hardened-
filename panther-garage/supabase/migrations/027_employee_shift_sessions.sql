-- 027: Employee shifts are explicit authenticated sessions, not inferred calendar-day windows.
-- Existing rows and legacy RPCs remain untouched. New application RPC wrappers attach work to
-- an explicit employee shift, preventing old Production code sharing this database from being
-- attributed to a concurrently open Preview shift.

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  employee_name text not null default '',
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint staff_shifts_valid_window check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists staff_shifts_one_open_per_employee_idx
  on public.staff_shifts(employee_id) where ended_at is null;
create index if not exists staff_shifts_employee_started_idx
  on public.staff_shifts(employee_id, started_at desc);

alter table public.staff_shifts enable row level security;
create policy "staff read own shifts" on public.staff_shifts
  for select to authenticated
  using (public.is_pgms_boss() or employee_id = auth.uid());
grant select on public.staff_shifts to authenticated;

alter table public.sales
  add column if not exists shift_id uuid references public.staff_shifts(id) on delete set null;
alter table public.repair_jobs
  add column if not exists shift_id uuid references public.staff_shifts(id) on delete set null;
alter table public.repair_status_history
  add column if not exists shift_id uuid references public.staff_shifts(id) on delete set null;
create index if not exists sales_shift_created_idx on public.sales(shift_id, created_at desc) where shift_id is not null;
create index if not exists repair_jobs_shift_received_idx on public.repair_jobs(shift_id, received_at desc) where shift_id is not null;
create index if not exists repair_status_history_shift_created_idx on public.repair_status_history(shift_id, created_at desc) where shift_id is not null;

create or replace function public.start_employee_shift()
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.staff_shifts%rowtype;
begin
  if auth.uid() is null or not public.is_pgms_staff() then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'EMPLOYEE'
  ) then
    raise exception 'Only an active employee can start an employee shift';
  end if;

  -- Serialize same-employee starts; the partial unique index is the final concurrency guard.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 27027));
  select * into v_shift
  from public.staff_shifts
  where employee_id = auth.uid() and ended_at is null
  order by started_at desc
  limit 1
  for update;
  if found then return v_shift; end if;

  insert into public.staff_shifts(employee_id, employee_name)
  select id, coalesce(nullif(trim(full_name), ''), 'Staff member')
  from public.profiles
  where id = auth.uid() and active = true and role = 'EMPLOYEE'
  returning * into v_shift;
  if not found then raise exception 'Active employee profile not found'; end if;
  return v_shift;
end;
$$;

create or replace function public.end_employee_shift()
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.staff_shifts%rowtype;
begin
  if auth.uid() is null or not public.is_pgms_staff() then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'EMPLOYEE'
  ) then
    raise exception 'Only an active employee can end an employee shift';
  end if;

  update public.staff_shifts
  set ended_at = clock_timestamp(), ended_by = auth.uid()
  where employee_id = auth.uid() and ended_at is null
  returning * into v_shift;
  return v_shift;
end;
$$;

revoke all on function public.start_employee_shift() from public;
revoke all on function public.end_employee_shift() from public;
grant execute on function public.start_employee_shift() to authenticated;
grant execute on function public.end_employee_shift() to authenticated;

-- The updated Preview uses this wrapper for employee sales. It delegates to the unchanged
-- checkout RPC, then links the completed sale in the same transaction under a locked session.
create or replace function public.create_pos_sale_for_shift(
  p_shift_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_amount_paid numeric,
  p_discount numeric,
  p_notes text,
  p_service_performed boolean,
  p_service_fee numeric,
  p_mechanic_name text,
  p_motorcycle_plate text,
  p_service_description text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  if auth.uid() is null or not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'EMPLOYEE') then
    raise exception 'Only an active employee can create a shift-linked sale';
  end if;
  perform 1 from public.staff_shifts
    where id = p_shift_id and employee_id = auth.uid() and ended_at is null
    for update;
  if not found then raise exception 'Active employee shift not found'; end if;

  v_sale_id := public.create_pos_sale_v2(
    p_customer_id, p_items, p_payment_method, p_amount_paid, p_discount, p_notes,
    p_service_performed, p_service_fee, p_mechanic_name, p_motorcycle_plate, p_service_description
  );
  update public.sales set shift_id = p_shift_id
    where id = v_sale_id and sold_by = auth.uid();
  if not found then raise exception 'Could not link the sale to the active employee shift'; end if;
  return v_sale_id;
end;
$$;
revoke all on function public.create_pos_sale_for_shift(uuid,uuid,jsonb,text,numeric,numeric,text,boolean,numeric,text,text,text) from public;
grant execute on function public.create_pos_sale_for_shift(uuid,uuid,jsonb,text,numeric,numeric,text,boolean,numeric,text,text,text) to authenticated;

-- The original intake RPC remains available to the older Production application. The new
-- Preview wrapper links only requests that explicitly use this shift-aware endpoint.
create or replace function public.create_repair_job_for_shift(
  p_shift_id uuid,
  p_customer_id uuid,
  p_motorcycle_make text,
  p_motorcycle_model text,
  p_registration_number text,
  p_reported_issue text,
  p_assigned_to uuid,
  p_labour_fee numeric,
  p_parts jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if auth.uid() is null or not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'EMPLOYEE') then
    raise exception 'Only an active employee can create a shift-linked repair intake';
  end if;
  perform 1 from public.staff_shifts
    where id = p_shift_id and employee_id = auth.uid() and ended_at is null
    for update;
  if not found then raise exception 'Active employee shift not found'; end if;

  v_job_id := public.create_repair_job(
    p_customer_id, p_motorcycle_make, p_motorcycle_model, p_registration_number,
    p_reported_issue, p_assigned_to, p_labour_fee, p_parts, p_notes
  );
  update public.repair_jobs set shift_id = p_shift_id
    where id = v_job_id and received_by = auth.uid();
  if not found then raise exception 'Could not link the repair intake to the active employee shift'; end if;
  return v_job_id;
end;
$$;
revoke all on function public.create_repair_job_for_shift(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,text) from public;
grant execute on function public.create_repair_job_for_shift(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,text) to authenticated;

-- Record the employee's status change and its shift ID together, without changing the legacy
-- status RPC used by Production. Validation mirrors update_repair_status in migration 003.
create or replace function public.update_repair_status_for_shift(
  p_shift_id uuid,
  p_job_id uuid,
  p_status text,
  p_diagnosis text default null,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if auth.uid() is null or not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'EMPLOYEE') then
    raise exception 'Only an active employee can update a shift-linked repair';
  end if;
  perform 1 from public.staff_shifts
    where id = p_shift_id and employee_id = auth.uid() and ended_at is null
    for update;
  if not found then raise exception 'Active employee shift not found'; end if;

  if p_status not in ('RECEIVED','DIAGNOSIS','WAITING_PARTS','IN_PROGRESS','READY','COLLECTED','CANCELLED') then
    raise exception 'Invalid repair status';
  end if;
  select status into v_old from public.repair_jobs where id = p_job_id for update;
  if not found then raise exception 'Repair job not found'; end if;
  if v_old in ('COLLECTED','CANCELLED') and p_status <> v_old then raise exception 'Closed repair jobs cannot be reopened'; end if;
  if v_old = 'CANCELLED' or v_old = 'COLLECTED' then raise exception 'Repair job is already closed'; end if;
  if p_status = 'CANCELLED' and exists(select 1 from public.repair_parts where repair_job_id = p_job_id) then
    raise exception 'This job has issued spare parts. Process a stock return before cancelling it.';
  end if;
  if p_status = 'COLLECTED' and v_old <> 'READY' then raise exception 'Only a READY repair can be marked COLLECTED'; end if;

  update public.repair_jobs set status = p_status,
    diagnosis = coalesce(nullif(trim(p_diagnosis), ''), diagnosis),
    completed_at = case when p_status = 'READY' then coalesce(completed_at, now()) else completed_at end,
    collected_at = case when p_status = 'COLLECTED' then now() else collected_at end
  where id = p_job_id;
  insert into public.repair_status_history(repair_job_id, old_status, new_status, changed_by, note, shift_id)
  values(p_job_id, v_old, p_status, auth.uid(), nullif(trim(p_note), ''), p_shift_id);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values(auth.uid(), 'REPAIR_STATUS_CHANGED', 'repair_job', p_job_id, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;
revoke all on function public.update_repair_status_for_shift(uuid,uuid,text,text,text) from public;
grant execute on function public.update_repair_status_for_shift(uuid,uuid,text,text,text) to authenticated;
