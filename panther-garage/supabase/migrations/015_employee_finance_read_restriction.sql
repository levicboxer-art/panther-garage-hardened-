-- 015: employee finance confidentiality
-- Employees may submit pending expenses, but supplier costs, purchase orders,
-- payables and expense records are management data and must not be readable
-- through direct Supabase queries.

do $$ declare t text; begin
  foreach t in array array['purchase_orders','purchase_order_items','supplier_invoices','supplier_payments','garage_expenses'] loop
    execute format('drop policy if exists "staff read %s" on public.%I', t, t);
    execute format('drop policy if exists "boss read %s" on public.%I', t, t);
    execute format('create policy "boss read %s" on public.%I for select to authenticated using(public.is_pgms_boss())', t, t);
  end loop;
end $$;
