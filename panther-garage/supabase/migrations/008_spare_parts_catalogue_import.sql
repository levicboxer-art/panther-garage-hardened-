-- Panther Garage: spare-parts catalogue, compatibility, price review and
-- idempotent opening-stock import from the supplied workbooks.
-- Apply after 007_customer_portal.sql. Existing migrations are not modified.

-- ---------------------------------------------------------------------------
-- 1. Product fields used by the catalogue and inventory screens
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists keywords text;
alter table public.products add column if not exists price_status text not null default 'CONFIRMED';
alter table public.products add column if not exists price_confirmed_at timestamptz;
alter table public.products add column if not exists price_confirmed_by uuid references public.profiles(id);
alter table public.products add column if not exists source_kind text not null default 'MANUAL';

-- Existing prices that were already saved are treated as previously confirmed.
-- Zero-priced products need a BOSS decision before a price is published.
update public.products
set price_status = case when selling_price > 0 then 'CONFIRMED' else 'PRICE NEEDS REVIEW' end
where price_status is null or price_status = 'CONFIRMED';

update public.products
set compatibility = 'UNCONFIRMED'
where compatibility is null or trim(compatibility) = '';

alter table public.products alter column compatibility set default 'UNCONFIRMED';
alter table public.products alter column category set default 'UNCLASSIFIED';

do $$ begin
  alter table public.products add constraint products_price_status_check
    check (price_status in ('CONFIRMED','PRICE NEEDS REVIEW'));
exception when duplicate_object then null; end $$;

create index if not exists products_catalogue_idx
  on public.products(active, category, compatibility, name);
create index if not exists products_price_status_idx
  on public.products(price_status);

-- Keep updated_at accurate even when a BOSS edits a price or category.
create or replace function public.pgms_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.pgms_set_updated_at();

-- A confirmed price must be a real positive amount. Anything else is parked in
-- review, so a purchase cost can never accidentally become a selling price.
create or replace function public.pgms_sync_product_price_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.price_status = 'CONFIRMED' and coalesce(new.selling_price,0) > 0 then
    new.price_confirmed_at := coalesce(new.price_confirmed_at, now());
    new.price_confirmed_by := coalesce(new.price_confirmed_by, auth.uid());
  else
    new.price_status := 'PRICE NEEDS REVIEW';
    new.price_confirmed_at := null;
    new.price_confirmed_by := null;
  end if;
  return new;
end; $$;

drop trigger if exists products_sync_price_status on public.products;
create trigger products_sync_price_status
before insert or update on public.products
for each row execute procedure public.pgms_sync_product_price_status();

-- EMPLOYEE accounts may register products, but may not set a selling price.
-- BOSS accounts can create a product with a confirmed price.
drop policy if exists "staff create products" on public.products;
create policy "staff create products" on public.products for insert to authenticated
with check (
  public.is_pgms_staff()
  and (
    public.is_pgms_boss()
    or (selling_price = 0 and price_status = 'PRICE NEEDS REVIEW')
  )
);

-- ---------------------------------------------------------------------------
-- 2. Import traceability tables
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_imports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('IMP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REVIEW','APPROVED','APPLIED','CANCELLED')),
  primary_file text not null,
  source_summary jsonb not null default '{}'::jsonb,
  report jsonb,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.inventory_imports(id) on delete cascade,
  source_file text not null,
  source_sheet text not null default 'Spare Parts Inventory',
  source_row integer not null,
  source_role text not null check (source_role in ('PRIMARY','COMPARISON')),
  original_name text not null,
  original_reference text,
  original_model text,
  quantity integer,
  unit_cost numeric(14,2),
  suggested_sell numeric(14,2),
  stock_purchase_value numeric(14,2),
  potential_sales_value numeric(14,2),
  recalculated_stock_value numeric(14,2),
  compatibility text not null default 'UNCONFIRMED',
  category text not null default 'UNCLASSIFIED',
  proposed_sku text,
  decision text not null default 'PENDING'
    check (decision in ('PENDING','CREATE','MATCH','ADD_BATCH','SKIP')),
  review_status text not null default 'NEEDS_REVIEW'
    check (review_status in ('NEEDS_REVIEW','APPROVED','SKIPPED')),
  matched_product_id uuid references public.products(id),
  approved_selling_price numeric(14,2) check (approved_selling_price is null or approved_selling_price > 0),
  approved_category text,
  approved_compatibility text,
  notes text,
  conflicts jsonb not null default '[]'::jsonb,
  has_blocking_conflict boolean not null default false,
  applied boolean not null default false,
  applied_batch_id uuid references public.inventory_batches(id),
  applied_movement_id uuid references public.stock_movements(id),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, source_file, source_row)
);

create table if not exists public.inventory_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.inventory_imports(id) on delete cascade,
  item_id uuid references public.inventory_import_items(id) on delete cascade,
  conflict_type text not null,
  severity text not null default 'WARNING' check (severity in ('INFO','WARNING','BLOCKING')),
  detail text not null,
  source_file text,
  source_row integer,
  comparison_file text,
  comparison_row integer,
  resolved boolean not null default false,
  resolution text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_imports_created_idx
  on public.inventory_imports(created_at desc);
create index if not exists inventory_import_items_import_idx
  on public.inventory_import_items(import_id, source_role, source_row);
create index if not exists inventory_import_items_review_idx
  on public.inventory_import_items(import_id, review_status);
create index if not exists inventory_import_conflicts_import_idx
  on public.inventory_import_conflicts(import_id, severity);

drop trigger if exists inventory_imports_set_updated_at on public.inventory_imports;
create trigger inventory_imports_set_updated_at
before update on public.inventory_imports
for each row execute procedure public.pgms_set_updated_at();

drop trigger if exists inventory_import_items_set_updated_at on public.inventory_import_items;
create trigger inventory_import_items_set_updated_at
before update on public.inventory_import_items
for each row execute procedure public.pgms_set_updated_at();

-- Batch/movement provenance. The unique keys make a repeated workbook import
-- unable to create a second opening batch or movement for the same source row.
alter table public.inventory_batches add column if not exists import_source_key text;
alter table public.inventory_batches add column if not exists source_import_item_id uuid;
alter table public.stock_movements add column if not exists import_source_key text;

create unique index if not exists inventory_batches_opening_source_unique
  on public.inventory_batches(import_source_key)
  where import_source_key is not null;
create unique index if not exists stock_movements_opening_source_unique
  on public.stock_movements(import_source_key)
  where import_source_key is not null;
create index if not exists inventory_batches_import_item_idx
  on public.inventory_batches(source_import_item_id)
  where source_import_item_id is not null;

alter table public.inventory_imports enable row level security;
alter table public.inventory_import_items enable row level security;
alter table public.inventory_import_conflicts enable row level security;

drop policy if exists "boss manages imports" on public.inventory_imports;
create policy "boss manages imports" on public.inventory_imports
  for all to authenticated using (public.is_pgms_boss()) with check (public.is_pgms_boss());
drop policy if exists "boss manages import items" on public.inventory_import_items;
create policy "boss manages import items" on public.inventory_import_items
  for all to authenticated using (public.is_pgms_boss()) with check (public.is_pgms_boss());
drop policy if exists "boss manages import conflicts" on public.inventory_import_conflicts;
create policy "boss manages import conflicts" on public.inventory_import_conflicts
  for all to authenticated using (public.is_pgms_boss()) with check (public.is_pgms_boss());

grant select, insert, update, delete on public.inventory_imports to authenticated;
grant select, insert, update, delete on public.inventory_import_items to authenticated;
grant select, insert, update, delete on public.inventory_import_conflicts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. BOSS staging / review RPCs
-- ---------------------------------------------------------------------------
create or replace function public.stage_inventory_import(
  p_primary_file text,
  p_source_summary jsonb,
  p_items jsonb,
  p_conflicts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_import_id uuid;
  v_reference text;
  v_conflict jsonb;
  v_item_id uuid;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can stage an inventory import'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No import rows were supplied';
  end if;

  insert into public.inventory_imports(reference, status, primary_file, source_summary, created_by)
  values (
    'IMP-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),
    'REVIEW', p_primary_file, coalesce(p_source_summary,'{}'::jsonb), auth.uid()
  )
  returning id, reference into v_import_id, v_reference;

  insert into public.inventory_import_items(
    import_id, source_file, source_sheet, source_row, source_role,
    original_name, original_reference, original_model,
    quantity, unit_cost, suggested_sell, stock_purchase_value,
    potential_sales_value, recalculated_stock_value,
    compatibility, category, proposed_sku, decision, review_status,
    approved_selling_price, approved_category, approved_compatibility,
    notes, conflicts, has_blocking_conflict
  )
  select
    v_import_id, x.source_file, coalesce(x.source_sheet,'Spare Parts Inventory'), x.source_row, x.source_role,
    x.original_name, x.original_reference, x.original_model,
    x.quantity, x.unit_cost, x.suggested_sell, x.stock_purchase_value,
    x.potential_sales_value, x.recalculated_stock_value,
    coalesce(nullif(trim(x.compatibility),''),'UNCONFIRMED'),
    coalesce(nullif(trim(x.category),''),'UNCLASSIFIED'),
    x.proposed_sku,
    case when x.source_role='COMPARISON' then 'SKIP'
         when x.decision in ('PENDING','CREATE','MATCH','ADD_BATCH','SKIP') then x.decision
         else 'PENDING' end,
    case when x.source_role='COMPARISON' then 'SKIPPED'
         when x.review_status in ('NEEDS_REVIEW','APPROVED','SKIPPED') then x.review_status
         else 'NEEDS_REVIEW' end,
    x.approved_selling_price, x.approved_category, x.approved_compatibility,
    x.notes, coalesce(x.conflicts,'[]'::jsonb), coalesce(x.has_blocking_conflict,false)
  from jsonb_to_recordset(p_items) as x(
    source_file text, source_sheet text, source_row integer, source_role text,
    original_name text, original_reference text, original_model text,
    quantity integer, unit_cost numeric, suggested_sell numeric,
    stock_purchase_value numeric, potential_sales_value numeric,
    recalculated_stock_value numeric, compatibility text, category text,
    proposed_sku text, decision text, review_status text,
    approved_selling_price numeric, approved_category text,
    approved_compatibility text, notes text, conflicts jsonb,
    has_blocking_conflict boolean
  );

  for v_conflict in select value from jsonb_array_elements(coalesce(p_conflicts,'[]'::jsonb)) loop
    select id into v_item_id
    from public.inventory_import_items
    where import_id = v_import_id
      and source_file = v_conflict->>'sourceFile'
      and source_row = nullif(v_conflict->>'sourceRow','')::integer
    limit 1;

    insert into public.inventory_import_conflicts(
      import_id, item_id, conflict_type, severity, detail,
      source_file, source_row, comparison_file, comparison_row
    ) values (
      v_import_id, v_item_id,
      coalesce(v_conflict->>'conflictType','UNCLASSIFIED_CONFLICT'),
      case when v_conflict->>'severity' in ('INFO','WARNING','BLOCKING') then v_conflict->>'severity' else 'WARNING' end,
      coalesce(v_conflict->>'detail','No detail supplied.'),
      v_conflict->>'sourceFile',
      nullif(v_conflict->>'sourceRow','')::integer,
      v_conflict->>'comparisonFile',
      nullif(v_conflict->>'comparisonRow','')::integer
    );
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'INVENTORY_IMPORT_STAGED','inventory_import',v_import_id,
    jsonb_build_object('reference',v_reference,'primary_file',p_primary_file));

  return jsonb_build_object('import_id',v_import_id,'reference',v_reference,'status','REVIEW');
end; $$;
revoke all on function public.stage_inventory_import(text,jsonb,jsonb,jsonb) from public;
grant execute on function public.stage_inventory_import(text,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.approve_inventory_import(
  p_import_id uuid,
  p_include_blocking boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_import public.inventory_imports%rowtype;
  v_approved integer;
  v_remaining integer;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can approve an inventory import'; end if;
  select * into v_import from public.inventory_imports where id=p_import_id for update;
  if not found then raise exception 'Import not found'; end if;
  if v_import.status = 'APPLIED' then raise exception 'This import has already been applied'; end if;

  update public.inventory_import_items
  set review_status='APPROVED',
      decision = case when decision='PENDING' then 'CREATE' else decision end
  where import_id=p_import_id
    and source_role='PRIMARY'
    and applied=false
    and review_status <> 'SKIPPED'
    and quantity is not null and quantity > 0
    and unit_cost is not null and unit_cost >= 0
    and (p_include_blocking or has_blocking_conflict=false);
  get diagnostics v_approved = row_count;

  select count(*) into v_remaining
  from public.inventory_import_items
  where import_id=p_import_id and source_role='PRIMARY' and review_status='NEEDS_REVIEW';

  update public.inventory_imports
  set status='APPROVED', approved_by=auth.uid(), approved_at=now()
  where id=p_import_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'INVENTORY_IMPORT_APPROVED','inventory_import',p_import_id,
    jsonb_build_object('approved',v_approved,'remaining_review',v_remaining,'include_blocking',p_include_blocking));

  return jsonb_build_object('approved',v_approved,'remaining_review',v_remaining,'status','APPROVED');
end; $$;
revoke all on function public.approve_inventory_import(uuid,boolean) from public;
grant execute on function public.approve_inventory_import(uuid,boolean) to authenticated;

create or replace function public.set_import_item_review(
  p_item_id uuid,
  p_decision text,
  p_product_id uuid default null,
  p_selling_price numeric default null,
  p_category text default null,
  p_compatibility text default null,
  p_review_status text default 'APPROVED',
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_import_items%rowtype;
  v_import public.inventory_imports%rowtype;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can review import rows'; end if;
  select * into v_item from public.inventory_import_items where id=p_item_id for update;
  if not found then raise exception 'Import row not found'; end if;
  select * into v_import from public.inventory_imports where id=v_item.import_id for update;
  if v_import.status = 'APPLIED' then raise exception 'This import has already been applied'; end if;

  if p_decision not in ('CREATE','MATCH','ADD_BATCH','SKIP') then raise exception 'Invalid import decision'; end if;
  if p_review_status not in ('NEEDS_REVIEW','APPROVED','SKIPPED') then raise exception 'Invalid review status'; end if;
  if p_compatibility is not null and p_compatibility not in ('SPIRO ELECTRIC','FUEL-POWERED','UNIVERSAL','UNCONFIRMED') then
    raise exception 'Invalid compatibility value';
  end if;
  if p_selling_price is not null and p_selling_price <= 0 then raise exception 'A confirmed selling price must be greater than zero'; end if;

  if p_decision='MATCH' and p_product_id is null then raise exception 'Choose an existing product to match'; end if;
  if p_decision in ('CREATE','ADD_BATCH') and p_review_status='APPROVED'
     and (v_item.quantity is null or v_item.quantity <= 0 or v_item.unit_cost is null) then
    raise exception 'This row cannot be approved without a quantity and purchase cost';
  end if;

  update public.inventory_import_items
  set decision=p_decision,
      matched_product_id=p_product_id,
      approved_selling_price=p_selling_price,
      approved_category=nullif(trim(coalesce(p_category,'')),''),
      approved_compatibility=nullif(trim(coalesce(p_compatibility,'')),''),
      review_status=case when p_decision='SKIP' then 'SKIPPED' else p_review_status end,
      notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_item_id;

  return jsonb_build_object('item_id',p_item_id,'decision',p_decision,'review_status',p_review_status);
end; $$;
revoke all on function public.set_import_item_review(uuid,text,uuid,numeric,text,text,text,text) from public;
grant execute on function public.set_import_item_review(uuid,text,uuid,numeric,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Idempotent opening-stock application
-- ---------------------------------------------------------------------------
create or replace function public.apply_inventory_import(p_import_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_import public.inventory_imports%rowtype;
  v_item public.inventory_import_items%rowtype;
  v_product_id uuid;
  v_product_found uuid;
  v_batch_id uuid;
  v_movement_id uuid;
  v_existing_batch uuid;
  v_sku text;
  v_price numeric(14,2);
  v_price_status text;
  v_category text;
  v_compatibility text;
  v_key text;
  v_created integer := 0;
  v_matched integer := 0;
  v_batches integer := 0;
  v_movements integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_units integer := 0;
  v_value numeric(14,2) := 0;
  v_errors jsonb := '[]'::jsonb;
  v_pending integer := 0;
  v_report jsonb;
begin
  if not public.is_pgms_boss() then raise exception 'Only BOSS can apply an inventory import'; end if;
  select * into v_import from public.inventory_imports where id=p_import_id for update;
  if not found then raise exception 'Import not found'; end if;
  if v_import.status = 'APPLIED' then return coalesce(v_import.report,'{}'::jsonb); end if;
  if v_import.status <> 'APPROVED' then raise exception 'Approve the import before applying it'; end if;

  for v_item in
    select * from public.inventory_import_items
    where import_id=p_import_id and source_role='PRIMARY'
    order by source_row
  loop
    begin
      if v_item.review_status <> 'APPROVED' or v_item.decision = 'SKIP' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if v_item.quantity is null or v_item.quantity <= 0 or v_item.unit_cost is null then
        raise exception 'Row % has no usable quantity or purchase cost', v_item.source_row;
      end if;

      v_key := lower(v_item.source_file) || '#' || lower(v_item.source_sheet) || '#' || v_item.source_row::text;
      select id into v_existing_batch from public.inventory_batches where import_source_key=v_key;
      if v_existing_batch is not null then
        update public.inventory_import_items
        set applied=true, applied_batch_id=v_existing_batch,
            notes=concat_ws(E'\n',notes,'Source row was already applied by an earlier import; stock was not increased again.')
        where id=v_item.id;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_product_id := null;
      if v_item.decision in ('MATCH','ADD_BATCH') then
        if v_item.matched_product_id is not null then
          select id into v_product_id from public.products where id=v_item.matched_product_id;
        elsif nullif(trim(v_item.proposed_sku),'') is not null then
          select id into v_product_id from public.products where sku=trim(v_item.proposed_sku);
        end if;
        if v_product_id is null then
          raise exception 'No existing product was matched for row %', v_item.source_row;
        end if;
        v_matched := v_matched + 1;
      elsif v_item.decision = 'CREATE' then
        v_sku := coalesce(nullif(trim(v_item.proposed_sku),''), 'PG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
        select id into v_product_found from public.products where sku=v_sku;
        if v_product_found is not null then
          -- A duplicate row deliberately split into a variant needs its own SKU.
          v_sku := v_sku || '-' || v_item.source_row::text;
          select id into v_product_found from public.products where sku=v_sku;
          if v_product_found is not null then
            v_sku := 'PG-' || upper(substr(md5(v_item.source_file || '#' || v_item.source_row::text || '#' || clock_timestamp()::text),1,10));
          end if;
        end if;

        v_price := coalesce(v_item.approved_selling_price, 0);
        v_price_status := case when v_price > 0 then 'CONFIRMED' else 'PRICE NEEDS REVIEW' end;
        v_category := coalesce(nullif(trim(v_item.approved_category),''), nullif(trim(v_item.category),''), 'UNCLASSIFIED');
        v_compatibility := coalesce(nullif(trim(v_item.approved_compatibility),''), nullif(trim(v_item.compatibility),''), 'UNCONFIRMED');

        insert into public.products(
          sku,name,category,brand,description,compatibility,unit,image_url,
          selling_price,minimum_stock,active,price_status,keywords,source_kind
        ) values (
          v_sku,v_item.original_name,v_category,null,null,v_compatibility,'piece',null,
          v_price,0,true,v_price_status,null,'IMPORT'
        ) returning id into v_product_id;
        v_created := v_created + 1;
      else
        raise exception 'Row % has no import decision', v_item.source_row;
      end if;

      -- Apply BOSS-approved catalogue values to an existing product without
      -- overwriting a price that was already confirmed.
      if v_item.approved_selling_price is not null then
        update public.products
        set selling_price=v_item.approved_selling_price, price_status='CONFIRMED'
        where id=v_product_id
          and (price_status <> 'CONFIRMED' or selling_price <= 0);
      end if;
      if nullif(trim(v_item.approved_category),'') is not null then
        update public.products
        set category=trim(v_item.approved_category)
        where id=v_product_id and (category is null or category='' or category='UNCLASSIFIED');
      end if;
      if nullif(trim(v_item.approved_compatibility),'') is not null then
        update public.products
        set compatibility=trim(v_item.approved_compatibility)
        where id=v_product_id and (compatibility is null or compatibility='' or compatibility='UNCONFIRMED');
      end if;

      insert into public.inventory_batches(
        product_id, quantity_received, quantity_remaining, unit_cost,
        received_at, receipt_reference, received_by, import_source_key, source_import_item_id
      ) values (
        v_product_id, v_item.quantity, v_item.quantity, v_item.unit_cost,
        now(), 'OPENING ' || v_import.reference || ' / ' || v_item.source_file || ' row ' || v_item.source_row,
        auth.uid(), v_key, v_item.id
      ) returning id into v_batch_id;
      v_batches := v_batches + 1;

      insert into public.stock_movements(
        product_id,batch_id,movement_type,quantity_delta,reason,
        reference_type,reference_id,created_by,import_source_key
      ) values (
        v_product_id,v_batch_id,'OPENING',v_item.quantity,
        'Opening stock from ' || v_item.source_file || ' row ' || v_item.source_row || ' (import ' || v_import.reference || ')',
        'INVENTORY_IMPORT_ITEM',v_item.id,auth.uid(),v_key
      ) returning id into v_movement_id;
      v_movements := v_movements + 1;

      update public.inventory_import_items
      set applied=true, matched_product_id=v_product_id,
          applied_batch_id=v_batch_id, applied_movement_id=v_movement_id
      where id=v_item.id;

      v_imported := v_imported + 1;
      v_units := v_units + v_item.quantity;
      v_value := v_value + (v_item.quantity * v_item.unit_cost);
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'source_file', v_item.source_file,
        'source_row', v_item.source_row,
        'message', sqlerrm
      ));
      update public.inventory_import_items
      set errors = errors || jsonb_build_array(jsonb_build_object('message',sqlerrm)),
          review_status='NEEDS_REVIEW'
      where id=v_item.id;
    end;
  end loop;

  select count(*) into v_pending
  from public.inventory_import_items
  where import_id=p_import_id and source_role='PRIMARY' and review_status='NEEDS_REVIEW';

  v_report := jsonb_build_object(
    'import_reference', v_import.reference,
    'primary_file', v_import.primary_file,
    'records_read', (select count(*) from public.inventory_import_items where import_id=p_import_id),
    'primary_records', (select count(*) from public.inventory_import_items where import_id=p_import_id and source_role='PRIMARY'),
    'comparison_records', (select count(*) from public.inventory_import_items where import_id=p_import_id and source_role='COMPARISON'),
    'records_approved', (select count(*) from public.inventory_import_items where import_id=p_import_id and source_role='PRIMARY' and review_status='APPROVED'),
    'records_imported', v_imported,
    'products_created', v_created,
    'products_matched', v_matched,
    'inventory_batches_created', v_batches,
    'stock_movements_created', v_movements,
    'records_skipped', v_skipped,
    'records_requiring_review', v_pending,
    'units_imported', v_units,
    'purchase_value_imported', v_value,
    'errors', v_errors,
    'applied_at', now()
  );

  update public.inventory_imports
  set status='APPLIED', applied_at=now(), report=v_report
  where id=p_import_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'INVENTORY_IMPORT_APPLIED','inventory_import',p_import_id,v_report);

  return v_report;
end; $$;
revoke all on function public.apply_inventory_import(uuid) from public;
grant execute on function public.apply_inventory_import(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Safe public catalogue reads
-- ---------------------------------------------------------------------------
create or replace function public.public_catalogue(
  p_search text default null,
  p_category text default null,
  p_compatibility text default null,
  p_availability text default null,
  p_sort text default 'name'
) returns table(
  id uuid, sku text, name text, category text, brand text, description text,
  compatibility text, unit text, image_url text, keywords text,
  selling_price numeric, price_status text, availability text, in_stock boolean,
  updated_at timestamptz
) language sql stable security definer set search_path = '' as $$
  with stock as (
    select b.product_id, coalesce(sum(b.quantity_remaining),0)::bigint as quantity
    from public.inventory_batches b
    group by b.product_id
  ),
  rows as (
    select p.id, p.sku, p.name, p.category, p.brand, p.description,
           p.compatibility, p.unit, p.image_url, p.keywords,
           case when p.price_status='CONFIRMED' and p.selling_price > 0 then p.selling_price else null end as selling_price,
           p.price_status,
           case
             when coalesce(s.quantity,0) <= 0 then 'OUT OF STOCK'
             when coalesce(s.quantity,0) <= p.minimum_stock then 'LOW STOCK'
             else 'IN STOCK'
           end as availability,
           coalesce(s.quantity,0) > 0 as in_stock,
           p.updated_at
    from public.products p
    left join stock s on s.product_id=p.id
    where p.active=true
      and (
        p_search is null or trim(p_search)=''
        or (coalesce(p.name,'') || ' ' || coalesce(p.sku,'') || ' ' || coalesce(p.category,'') || ' ' ||
            coalesce(p.compatibility,'') || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.description,'') || ' ' ||
            coalesce(p.keywords,''))
           ilike '%' || trim(p_search) || '%'
      )
      and (p_category is null or trim(p_category)='' or lower(coalesce(p.category,''))=lower(trim(p_category)))
      and (p_compatibility is null or trim(p_compatibility)='' or lower(coalesce(p.compatibility,''))=lower(trim(p_compatibility)))
  )
  select r.id, r.sku, r.name, r.category, r.brand, r.description,
         r.compatibility, r.unit, r.image_url, r.keywords,
         r.selling_price, r.price_status, r.availability, r.in_stock, r.updated_at
  from rows r
  where p_availability is null or trim(p_availability)=''
     or lower(r.availability)=lower(trim(p_availability))
     or (lower(trim(p_availability))='in_stock' and r.in_stock=true)
  order by
    case when lower(coalesce(p_sort,'name'))='price_asc' then coalesce(r.selling_price, 999999999) end asc,
    case when lower(coalesce(p_sort,'name'))='price_desc' then coalesce(r.selling_price, -1) end desc,
    case when lower(coalesce(p_sort,'name'))='stock' then case when r.in_stock then 1 else 0 end end desc,
    case when lower(coalesce(p_sort,'name'))='recent' then r.updated_at end desc,
    r.name asc;
$$;
revoke all on function public.public_catalogue(text,text,text,text,text) from public;
grant execute on function public.public_catalogue(text,text,text,text,text) to anon, authenticated;

create or replace function public.public_catalogue_product(p_id uuid)
returns table(
  id uuid, sku text, name text, category text, brand text, description text,
  compatibility text, unit text, image_url text, keywords text,
  selling_price numeric, price_status text, availability text, in_stock boolean,
  updated_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select c.id, c.sku, c.name, c.category, c.brand, c.description,
         c.compatibility, c.unit, c.image_url, c.keywords,
         c.selling_price, c.price_status, c.availability, c.in_stock, c.updated_at
  from public.public_catalogue(null,null,null,null,'name') c
  where c.id = p_id
  limit 1;
$$;
revoke all on function public.public_catalogue_product(uuid) from public;
grant execute on function public.public_catalogue_product(uuid) to anon, authenticated;

-- Customer orders must not publish an unconfirmed price or promise stock that
-- does not exist. This replaces the function from 007 without editing it.
create or replace function public.submit_customer_order(
  p_customer_name text,p_phone text,p_email text,p_delivery_note text,p_lines jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid; v_reference text; v_total numeric(14,2):=0;
  v_line jsonb; v_product public.products%rowtype; v_qty integer; v_price numeric(14,2);
begin
  if length(trim(coalesce(p_customer_name,'')))<2 or length(trim(coalesce(p_phone,'')))<7 then
    raise exception 'Customer name and valid phone are required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  insert into public.customer_orders(customer_name,phone,email,delivery_note)
  values(trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_delivery_note,'')),''))
  returning id,order_reference into v_order_id,v_reference;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    if v_qty<1 or v_qty>100 then raise exception 'Invalid item quantity'; end if;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid and active=true;
    if not found then raise exception 'A selected product is no longer available'; end if;
    if v_product.price_status <> 'CONFIRMED' or v_product.selling_price <= 0 then
      raise exception 'The price for "%" is still awaiting confirmation', v_product.name;
    end if;
    if (select coalesce(sum(quantity_remaining),0) from public.inventory_batches where product_id=v_product.id) < v_qty then
      raise exception 'There is not enough stock for "%"', v_product.name;
    end if;
    v_price:=v_product.selling_price;
    insert into public.customer_order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    values(v_order_id,v_product.id,v_product.name,v_product.sku,v_qty,v_price,v_qty*v_price);
    v_total:=v_total+(v_qty*v_price);
  end loop;
  update public.customer_orders set total=v_total where id=v_order_id;
  return v_reference;
end; $$;
revoke all on function public.submit_customer_order(text,text,text,text,jsonb) from public;
grant execute on function public.submit_customer_order(text,text,text,text,jsonb) to anon,authenticated;

-- Direct product reads are disabled for anon; public access remains through the
-- shaped public_catalogue/public_catalogue_product RPCs. Full idempotent state,
-- input, and import hardening is applied by 010_sql_hardening.sql.
drop policy if exists "public read active catalogue" on public.products;
revoke select on public.products from anon;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from public;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from anon;
revoke all on function public.notify_pgms_bosses(text,text,text,text,uuid) from authenticated;
