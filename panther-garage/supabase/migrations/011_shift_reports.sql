-- 011: Employee shift reports.
-- Each staff member files a daily report: opening stock, closing stock, comments,
-- recommendations, challenge and solution. Employees see their own rows; the BOSS
-- sees everything. One report per employee per day (the API upserts on that key).

create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  employee_name text not null default '',
  report_date date not null default current_date,
  opening_stock integer not null default 0 check(opening_stock>=0),
  closing_stock integer not null default 0 check(closing_stock>=0),
  comments text not null default '',
  recommendations text not null default '',
  challenges text not null default '',
  solution text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, report_date)
);
create index if not exists shift_reports_date_idx on public.shift_reports(report_date desc);

alter table public.shift_reports enable row level security;

drop policy if exists "staff read shift reports" on public.shift_reports;
create policy "staff read shift reports" on public.shift_reports
  for select to authenticated
  using (public.is_pgms_boss() or employee_id = auth.uid());

drop policy if exists "employee submit shift report" on public.shift_reports;
create policy "employee submit shift report" on public.shift_reports
  for insert to authenticated
  with check (employee_id = auth.uid() and public.is_pgms_staff());

drop policy if exists "employee amend own shift report" on public.shift_reports;
create policy "employee amend own shift report" on public.shift_reports
  for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

grant select, insert, update on public.shift_reports to authenticated;
