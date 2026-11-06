-- Stage 6: configurable replenishment parameters for demand-based restocking.
-- Lead time and safety stock are configured per product by the Boss.
alter table public.products
  add column if not exists supplier_lead_time_days integer not null default 7
    check (supplier_lead_time_days between 1 and 365),
  add column if not exists safety_stock integer not null default 0
    check (safety_stock >= 0),
  add column if not exists target_stock_days integer not null default 30
    check (target_stock_days between 1 and 365);

comment on column public.products.supplier_lead_time_days is 'Boss-configured expected replenishment lead time in calendar days.';
comment on column public.products.safety_stock is 'Boss-configured extra units held as a demand/lead-time buffer.';
comment on column public.products.target_stock_days is 'Desired stock coverage after replenishment, in calendar days.';
