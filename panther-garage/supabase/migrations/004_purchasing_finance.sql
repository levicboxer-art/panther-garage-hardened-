-- Stage 4: purchasing, supplier balances and expense controls.
-- Apply after migrations 001-003. All amounts are RWF.
create table if not exists public.purchase_orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 supplier_id uuid not null references public.suppliers(id), status text not null default 'DRAFT'
 check(status in ('DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
 order_date date not null default current_date, expected_date date, notes text,
 subtotal numeric(14,2) not null default 0 check(subtotal>=0), created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.purchase_order_items (
 id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id),
 product_id uuid not null references public.products(id), product_name text not null, sku text not null,
 quantity_ordered integer not null check(quantity_ordered>0), quantity_received integer not null default 0 check(quantity_received>=0 and quantity_received<=quantity_ordered),
 unit_cost numeric(14,2) not null check(unit_cost>=0), line_total numeric(14,2) not null check(line_total>=0)
);
create table if not exists public.supplier_invoices (
 id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.suppliers(id),
 purchase_order_id uuid references public.purchase_orders(id), invoice_number text not null,
 invoice_date date not null default current_date, due_date date, amount numeric(14,2) not null check(amount>0),
 paid_amount numeric(14,2) not null default 0 check(paid_amount>=0 and paid_amount<=amount),
 status text not null default 'UNPAID' check(status in ('UNPAID','PART_PAID','PAID')),
 notes text, recorded_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 unique(supplier_id,invoice_number)
);
create table if not exists public.supplier_payments (
 id uuid primary key default gen_random_uuid(), supplier_invoice_id uuid not null references public.supplier_invoices(id),
 amount numeric(14,2) not null check(amount>0), method text not null check(method in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD')),
 reference text, paid_at timestamptz not null default now(), recorded_by uuid references public.profiles(id)
);
create table if not exists public.garage_expenses (
 id uuid primary key default gen_random_uuid(), category text not null, description text not null,
 amount numeric(14,2) not null check(amount>0), expense_date date not null default current_date,
 payment_method text not null check(payment_method in ('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD')),
 reference text, status text not null default 'APPROVED' check(status in ('PENDING','APPROVED','REJECTED')),
 recorded_by uuid references public.profiles(id), approved_by uuid references public.profiles(id),
 approved_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists purchase_orders_date_idx on public.purchase_orders(created_at desc);
create index if not exists supplier_invoices_due_idx on public.supplier_invoices(status,due_date);
create index if not exists garage_expenses_date_idx on public.garage_expenses(expense_date desc);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.garage_expenses enable row level security;

do $$ declare t text; begin
 foreach t in array array['purchase_orders','purchase_order_items','supplier_invoices','supplier_payments','garage_expenses'] loop
  execute format('drop policy if exists "staff read %s" on public.%I',t,t);
  execute format('create policy "staff read %s" on public.%I for select to authenticated using(public.is_pgms_staff())',t,t);
 end loop;
end $$;
drop policy if exists "staff insert supplier invoices" on public.supplier_invoices;
create policy "staff insert supplier invoices" on public.supplier_invoices for insert to authenticated with check(public.is_pgms_staff());
drop policy if exists "staff insert expenses" on public.garage_expenses;
create policy "staff insert expenses" on public.garage_expenses for insert to authenticated with check(public.is_pgms_boss() or (status='PENDING' and approved_by is null and approved_at is null));
grant select,insert on public.supplier_invoices to authenticated;
grant select,insert on public.garage_expenses to authenticated;
grant select on public.purchase_orders,public.purchase_order_items,public.supplier_payments to authenticated;

create or replace function public.create_purchase_order(p_supplier_id uuid,p_expected_date date,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid(); v_no text; x jsonb; p public.products%rowtype; q int; c numeric; v_total numeric:=0;
begin
 if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'Supplier not found'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one order item'; end if;
 v_no:='PG-PO-'||to_char(clock_timestamp(),'YYMMDD-HH24MISS')||'-'||upper(substr(replace(v_id::text,'-',''),1,4));
 insert into public.purchase_orders(id,order_number,supplier_id,status,expected_date,notes,created_by) values(v_id,v_no,p_supplier_id,'ORDERED',p_expected_date,nullif(trim(p_notes),''),auth.uid());
 for x in select value from jsonb_array_elements(p_items) loop
  q:=(x->>'quantity')::int; c:=(x->>'unit_cost')::numeric;
  if q is null or q<1 or c is null or c<0 then raise exception 'Invalid order quantity or unit cost'; end if;
  select * into p from public.products where id=(x->>'product_id')::uuid and active=true;
  if not found then raise exception 'An order product is unavailable'; end if;
  insert into public.purchase_order_items(purchase_order_id,product_id,product_name,sku,quantity_ordered,unit_cost,line_total)
  values(v_id,p.id,p.name,p.sku,q,c,q*c);
  v_total:=v_total+q*c;
 end loop;
 update public.purchase_orders set subtotal=v_total where id=v_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'PURCHASE_ORDER_CREATED','purchase_order',v_id,jsonb_build_object('order_number',v_no,'subtotal',v_total));
 return v_id;
end; $$;
revoke all on function public.create_purchase_order(uuid,date,text,jsonb) from public;
grant execute on function public.create_purchase_order(uuid,date,text,jsonb) to authenticated;

create or replace function public.receive_purchase_order_item(p_item_id uuid,p_quantity integer,p_receipt_reference text default null)
returns void language plpgsql security definer set search_path='' as $$
declare i public.purchase_order_items%rowtype; o public.purchase_orders%rowtype;
begin
 if not public.is_pgms_staff() then raise exception 'Not authorized'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'Receipt quantity must be positive'; end if;
 select * into i from public.purchase_order_items where id=p_item_id for update;
 if not found then raise exception 'Purchase order item not found'; end if;
 select * into o from public.purchase_orders where id=i.purchase_order_id for update;
 if o.status not in ('ORDERED','PARTIALLY_RECEIVED') then raise exception 'Only ordered purchase orders can receive goods'; end if;
 if i.quantity_received+p_quantity>i.quantity_ordered then raise exception 'Receipt exceeds outstanding ordered quantity'; end if;
 perform public.receive_stock(i.product_id,p_quantity,i.unit_cost,o.supplier_id,p_receipt_reference);
 update public.purchase_order_items set quantity_received=quantity_received+p_quantity where id=i.id;
 if not exists(select 1 from public.purchase_order_items where purchase_order_id=o.id and quantity_received<quantity_ordered) then
  update public.purchase_orders set status='RECEIVED',updated_at=now() where id=o.id;
 else
  update public.purchase_orders set status='PARTIALLY_RECEIVED',updated_at=now() where id=o.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'PURCHASE_GOODS_RECEIVED','purchase_order',o.id,jsonb_build_object('item_id',i.id,'quantity',p_quantity,'receipt_reference',p_receipt_reference));
end; $$;
revoke all on function public.receive_purchase_order_item(uuid,integer,text) from public;
grant execute on function public.receive_purchase_order_item(uuid,integer,text) to authenticated;

create or replace function public.record_supplier_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.supplier_invoices%rowtype; v_id uuid:=gen_random_uuid(); v_paid numeric;
begin
 if not public.is_pgms_boss() then raise exception 'Only BOSS can record supplier payments'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment must be greater than zero'; end if;
 select * into i from public.supplier_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Supplier invoice not found'; end if;
 if i.paid_amount+p_amount>i.amount then raise exception 'Payment exceeds outstanding invoice balance'; end if;
 insert into public.supplier_payments(id,supplier_invoice_id,amount,method,reference,recorded_by) values(v_id,p_invoice_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid());
 v_paid:=i.paid_amount+p_amount;
 update public.supplier_invoices set paid_amount=v_paid,status=case when v_paid=i.amount then 'PAID' else 'PART_PAID' end where id=i.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'SUPPLIER_PAYMENT_RECORDED','supplier_invoice',i.id,jsonb_build_object('payment_id',v_id,'amount',p_amount,'method',p_method));
 return v_id;
end; $$;
revoke all on function public.record_supplier_payment(uuid,numeric,text,text) from public;
grant execute on function public.record_supplier_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.review_expense(p_expense_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if not public.is_pgms_boss() then raise exception 'Only BOSS can review expenses'; end if;
 select status into v_status from public.garage_expenses where id=p_expense_id for update;
 if not found then raise exception 'Expense not found'; end if;
 if v_status<>'PENDING' then raise exception 'Expense has already been reviewed'; end if;
 update public.garage_expenses set status=case when p_approve then 'APPROVED' else 'REJECTED' end,approved_by=auth.uid(),approved_at=now() where id=p_expense_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'EXPENSE_REVIEWED','garage_expense',p_expense_id,jsonb_build_object('approved',p_approve));
end; $$;
revoke all on function public.review_expense(uuid,boolean) from public;
grant execute on function public.review_expense(uuid,boolean) to authenticated;
