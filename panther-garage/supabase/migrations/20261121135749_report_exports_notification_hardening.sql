-- Stage 21: harden staff notification access, stock-alert concurrency, and Boss email delivery.
-- Additive only: no inventory, sales, orders, or notification history is deleted.

-- Restrict direct notification reads and acknowledgement to active staff who own the row.
drop policy if exists "users read own notifications" on public.notifications;
create policy "active staff read own notifications" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) and public.is_pgms_staff());

drop policy if exists "users update own notifications" on public.notifications;
create policy "active staff update own notifications" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()) and public.is_pgms_staff())
  with check (recipient_id = (select auth.uid()) and public.is_pgms_staff());

create index if not exists notifications_unread_recipient_created_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

-- Delivery rows written by the previous version represent already-sent email.
alter table public.notification_email_deliveries
  add column if not exists delivery_status text not null default 'SENT',
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

alter table public.notification_email_deliveries
  drop constraint if exists notification_email_deliveries_status_check;
alter table public.notification_email_deliveries
  add constraint notification_email_deliveries_status_check
  check (delivery_status in ('SENDING','SENT','FAILED'));
alter table public.notification_email_deliveries
  drop constraint if exists notification_email_deliveries_attempt_count_check;
alter table public.notification_email_deliveries
  add constraint notification_email_deliveries_attempt_count_check
  check (attempt_count >= 0);
alter table public.notification_email_deliveries
  alter column sent_at drop not null,
  alter column sent_at drop default;

-- Atomically claim eligible notifications before contacting the email provider.
-- Existing SENT claims remain immutable; stale SENDING rows become reclaimable after 10 minutes.
create or replace function public.claim_boss_email_notifications(
  p_boss_id uuid,
  p_notification_ids uuid[]
) returns table(notification_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles
    where id = p_boss_id and active = true and role = 'BOSS'
  ) then
    raise exception 'Active Boss recipient required';
  end if;
  if p_notification_ids is null or cardinality(p_notification_ids) > 20 then
    raise exception 'Invalid notification claim';
  end if;

  return query
  insert into public.notification_email_deliveries as delivery (
    notification_id, boss_id, delivery_status, claimed_at, attempt_count
  )
  select distinct notice.id, p_boss_id, 'SENDING', v_now, 1
  from public.notifications notice
  where notice.recipient_id = p_boss_id
    and notice.read_at is null
    and notice.id = any(p_notification_ids)
  on conflict (notification_id, boss_id) do update
    set delivery_status = 'SENDING',
        claimed_at = excluded.claimed_at,
        attempt_count = delivery.attempt_count + 1
    where delivery.delivery_status = 'FAILED'
       or (delivery.delivery_status = 'SENDING'
           and delivery.claimed_at < v_now - interval '10 minutes')
  returning delivery.notification_id;
end;
$$;

create or replace function public.finish_boss_email_notifications(
  p_boss_id uuid,
  p_notification_ids uuid[],
  p_delivery_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_delivery_status not in ('SENT','FAILED') then
    raise exception 'Invalid email delivery status';
  end if;
  if p_notification_ids is null or cardinality(p_notification_ids) > 20 then
    raise exception 'Invalid notification delivery update';
  end if;
  update public.notification_email_deliveries
  set delivery_status = p_delivery_status,
      sent_at = case when p_delivery_status = 'SENT' then clock_timestamp() else null end,
      claimed_at = null
  where boss_id = p_boss_id
    and notification_id = any(p_notification_ids)
    and delivery_status = 'SENDING';
end;
$$;

revoke all on function public.claim_boss_email_notifications(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.finish_boss_email_notifications(uuid,uuid[],text) from public, anon, authenticated;
grant execute on function public.claim_boss_email_notifications(uuid,uuid[]) to service_role;
grant execute on function public.finish_boss_email_notifications(uuid,uuid[],text) to service_role;

-- Serialize low-stock checks per product. Without a row lock, two concurrent stock
-- movements could both observe no recent alert and create duplicate notices.
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

  select prod.name, prod.minimum_stock
    into v_name, v_min
    from public.products prod
    where prod.id = new.product_id
    for update;
  if not found then
    return new;
  end if;

  select coalesce(sum(batch.quantity_remaining), 0)::bigint
    into v_total
    from public.inventory_batches batch
    where batch.product_id = new.product_id;

  if v_total <= greatest(coalesce(v_min, 0), 2) then
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
