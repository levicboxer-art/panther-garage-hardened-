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
