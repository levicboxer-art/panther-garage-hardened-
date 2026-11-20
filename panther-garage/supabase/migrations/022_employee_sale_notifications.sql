-- Employees need the same sale-made follow-up alert already generated for Boss accounts.
-- Keep the existing Boss notification function intact (including its email workflow)
-- and create one recipient-specific notification for each active employee.
create or replace function public.pgms_notify_employee_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id, title, message, category, entity_type, entity_id)
  select p.id,
         'Sale completed',
         'Invoice ' || new.invoice_number || ' was completed for RWF ' || to_char(new.total, 'FM999,999,999,990'),
         'SALE', 'SALE', new.id
  from public.profiles p
  where p.role = 'EMPLOYEE' and p.active = true;
  return new;
end;
$$;

drop trigger if exists pgms_employee_sale_notification on public.sales;
create trigger pgms_employee_sale_notification after insert on public.sales
for each row when (new.status = 'COMPLETED') execute function public.pgms_notify_employee_sale();
