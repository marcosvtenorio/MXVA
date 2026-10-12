-- PIX payments through AbacatePay (transparent checkout): BRL orders and the charge reference.
-- Still metadata only: never photos, generated images or report contents.

alter table orders drop constraint if exists orders_currency_check;
alter table orders add constraint orders_currency_check check (currency in ('usd', 'brl'));

alter table orders drop constraint if exists orders_payment_mode_check;
alter table orders add constraint orders_payment_mode_check check (payment_mode in ('mock', 'stripe', 'abacatepay'));

alter table orders add column if not exists provider_charge_id text unique;
alter table orders add column if not exists charge_expires_at timestamptz;
