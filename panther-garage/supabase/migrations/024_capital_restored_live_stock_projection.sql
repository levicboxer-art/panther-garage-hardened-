-- Lifetime executive analytics: separate restored capital from gross profit and
-- calculate remaining-stock opportunity from the live FIFO inventory batches.
create or replace function public.get_lifetime_sales_analytics()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_first_sale timestamptz;
  v_period_end timestamptz := now();
  v_sales_count bigint;
  v_units_sold bigint;
  v_revenue numeric(14,2);
  v_collected numeric(14,2);
  v_capital_restored numeric(14,2);
  v_gross_profit numeric(14,2);
  v_stock_units bigint;
  v_stock_revenue numeric(14,2);
  v_stock_cost numeric(14,2);
  v_trend jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.active = true and profile.role = 'BOSS'
  ) then
    raise exception using errcode = '42501', message = 'Only an active BOSS can view lifetime analytics.';
  end if;

  with completed as (
    select id, total, amount_paid, created_at
    from public.sales
    where status = 'COMPLETED'
  )
  select min(created_at), count(*), coalesce(sum(total),0), coalesce(sum(amount_paid),0)
    into v_first_sale, v_sales_count, v_revenue, v_collected
  from completed;

  -- Capital restored is the FIFO cost basis recovered through completed sales.
  -- It is intentionally separate from gross profit, including any sale-price gain.
  select coalesce(sum(si.quantity),0),
         coalesce(sum(coalesce(si.unit_cost,0) * si.quantity),0),
         coalesce(sum(si.line_total - (coalesce(si.unit_cost,0) * si.quantity)),0)
    into v_units_sold, v_capital_restored, v_gross_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'COMPLETED';

  -- This is deliberately read from current live batch balances on every request:
  -- sales reduce quantity_remaining and receipts increase it automatically.
  select coalesce(sum(ib.quantity_remaining),0),
         coalesce(sum(ib.quantity_remaining * p.selling_price),0),
         coalesce(sum(ib.quantity_remaining * coalesce(ib.unit_cost,0)),0)
    into v_stock_units, v_stock_revenue, v_stock_cost
  from public.inventory_batches ib
  join public.products p on p.id = ib.product_id
  where p.active = true and ib.quantity_remaining > 0;

  with daily as (
    select date_trunc('day', s.created_at)::date as sale_day,
           sum(s.total)::numeric(14,2) as revenue,
           sum(si.line_total - (coalesce(si.unit_cost,0) * si.quantity))::numeric(14,2) as gross_profit
    from public.sales s
    left join public.sale_items si on si.sale_id = s.id
    where s.status = 'COMPLETED'
    group by date_trunc('day', s.created_at)::date
  ), cumulative as (
    select sale_day, revenue, gross_profit,
           sum(revenue) over (order by sale_day)::numeric(14,2) as cumulative_revenue,
           sum(gross_profit) over (order by sale_day)::numeric(14,2) as cumulative_gross_profit
    from daily
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', sale_day,
    'revenue', revenue,
    'gross_profit', gross_profit,
    'cumulative_revenue', cumulative_revenue,
    'cumulative_gross_profit', cumulative_gross_profit
  ) order by sale_day), '[]'::jsonb)
  into v_trend
  from cumulative;

  return jsonb_build_object(
    'period_start', v_first_sale,
    'period_end', v_period_end,
    'realized', jsonb_build_object(
      'sales_count', v_sales_count,
      'units_sold', v_units_sold,
      'revenue', v_revenue,
      'collected', v_collected,
      'capital_restored', v_capital_restored,
      'gross_profit', v_gross_profit,
      'gross_margin_pct', case when v_revenue > 0 then round((v_gross_profit / v_revenue) * 100, 1) else null end
    ),
    'inventory_projection', jsonb_build_object(
      'units_remaining', v_stock_units,
      'revenue_if_all_sold', v_stock_revenue,
      'cost_of_remaining_stock', v_stock_cost,
      'gross_profit_if_all_sold', v_stock_revenue - v_stock_cost,
      'total_revenue_if_all_sold', v_revenue + v_stock_revenue,
      'total_gross_profit_if_all_sold', v_gross_profit + v_stock_revenue - v_stock_cost,
      'calculated_at', v_period_end
    ),
    'trend', v_trend
  );
end;
$function$;

revoke all on function public.get_lifetime_sales_analytics() from public, anon;
grant execute on function public.get_lifetime_sales_analytics() to authenticated;
