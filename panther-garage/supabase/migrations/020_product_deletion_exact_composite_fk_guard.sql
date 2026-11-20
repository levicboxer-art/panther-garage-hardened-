-- Stage 20: match the complete FK tuple when it contains products.id.
-- This avoids both unsafe cascades and false-positive blocks on unrelated composite values.
create or replace function public.delete_product_if_unreferenced(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_reference record;
  v_references text[] := array[]::text[];
  v_has_reference boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.active = true
      and profile.role = 'BOSS'
  ) then
    raise exception using errcode = '42501', message = 'Only an active BOSS can remove products.';
  end if;

  -- Prevent a concurrent transaction from attaching a new child record between
  -- the reference scan and the delete (foreign-key checks require a key-share lock).
  perform 1
  from public.products product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Product not found.';
  end if;

  -- Match every key column in each FK containing products.id, including composite
  -- keys and constraints configured with CASCADE or SET NULL.
  for v_reference in
    select
      child_ns.nspname as child_schema,
      child_table.relname as child_table,
      pg_catalog.string_agg(
        pg_catalog.format('child_row.%I = product_row.%I', child_column.attname, parent_column.attname),
        ' AND ' order by parent_key.key_position
      ) as key_match
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class child_table
      on child_table.oid = fk.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child_table.relnamespace
    join lateral pg_catalog.unnest(fk.confkey) with ordinality as parent_key(attnum, key_position)
      on true
    join pg_catalog.pg_attribute child_column
      on child_column.attrelid = fk.conrelid
     and child_column.attnum = fk.conkey[parent_key.key_position::integer]
    join pg_catalog.pg_attribute parent_column
      on parent_column.attrelid = fk.confrelid
     and parent_column.attnum = parent_key.attnum
    where fk.contype = 'f'
      and fk.confrelid = 'public.products'::regclass
      and pg_catalog.cardinality(fk.conkey) = pg_catalog.cardinality(fk.confkey)
      and parent_column.attname = 'id'
    group by fk.oid, child_ns.nspname, child_table.relname
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I as child_row ' ||
      'join public.products as product_row on %s where product_row.id = $1)',
      v_reference.child_schema,
      v_reference.child_table,
      v_reference.key_match
    ) into v_has_reference using p_product_id;

    if v_has_reference then
      v_references := pg_catalog.array_append(
        v_references,
        pg_catalog.format('%I.%I', v_reference.child_schema, v_reference.child_table)
      );
    end if;
  end loop;

  if pg_catalog.cardinality(v_references) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Product is referenced by existing records and cannot be deleted.',
      detail = 'Referenced by: ' || pg_catalog.array_to_string(v_references, ', ');
  end if;

  delete from public.products where id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Product not found.';
  end if;

  return pg_catalog.jsonb_build_object('deleted', true, 'product_id', p_product_id);
end;
$function$;

revoke all on function public.delete_product_if_unreferenced(uuid) from public, anon;
grant execute on function public.delete_product_if_unreferenced(uuid) to authenticated;
