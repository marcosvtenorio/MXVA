-- One open checkout per browser: a second tab is shown the same PIX code instead of a new charge.
-- The copy-and-paste code is a payment instruction, not personal data.

alter table orders add column if not exists provider_br_code text;
