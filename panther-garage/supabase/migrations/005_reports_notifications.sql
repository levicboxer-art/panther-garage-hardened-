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

-- Trigger functions invoke this SECURITY DEFINER helper; clients must not execute it.
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from public;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from anon;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from authenticated;
