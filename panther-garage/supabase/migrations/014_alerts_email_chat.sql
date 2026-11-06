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
