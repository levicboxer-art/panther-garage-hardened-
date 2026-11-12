-- Stage 17: platform notifications for new staff messages.
-- Boss and employees receive an in-app notification when a new direct message arrives.

create or replace function public.pgms_notify_staff_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_name text;
begin
  select full_name into v_sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.notifications(
    recipient_id, title, message, category, entity_type, entity_id
  ) values (
    new.recipient_id,
    'New message from ' || coalesce(nullif(v_sender_name, ''), 'staff member'),
    left(new.body, 1200),
    'MESSAGE',
    'STAFF_MESSAGE',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.pgms_notify_staff_message() from public, anon, authenticated;
drop trigger if exists pgms_staff_message_notification on public.staff_messages;
create trigger pgms_staff_message_notification
after insert on public.staff_messages
for each row execute function public.pgms_notify_staff_message();
