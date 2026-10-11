-- MXVA order metadata. Applied by `npm run db:migrate`.
-- PRIVACY RULE: these tables hold order/payment/delivery metadata only. Never add
-- columns for photos, generated images, face descriptions, embeddings, report text
-- or any biometric data.

create table if not exists orders (
  id                         uuid primary key,
  version                    integer     not null default 1,
  payment_mode               text        not null check (payment_mode in ('mock', 'stripe')),
  stripe_checkout_session_id text        unique,
  stripe_payment_intent_id   text,
  email                      text        not null check (length(email) <= 254),
  currency                   text        not null check (currency = 'usd'),
  amount_minor               integer     not null check (amount_minor > 0),
  country_hint               char(2),
  price_variant              text        not null,
  status                     text        not null check (status in (
                               'pending_payment', 'paid', 'processing', 'delivered_to_provider',
                               'generated_email_failed', 'failed_retryable', 'needs_support',
                               'refunded', 'expired', 'withdrawn')),
  consent_version            text        not null,
  terms_version              text        not null,
  marketing_opt_in           boolean     not null default false,
  created_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  fulfillment_attempts       integer     not null default 0 check (fulfillment_attempts >= 0),
  processing_started_at      timestamptz,
  email_provider_message_id  text,
  last_failure_code          text,
  fulfillment_version        text        not null,
  completed_at               timestamptz,
  refunded_at                timestamptz,
  updated_at                 timestamptz not null default now()
);

create index if not exists orders_status_created_idx on orders (status, created_at);
create index if not exists orders_payment_intent_idx on orders (stripe_payment_intent_id);

comment on table orders is
  'Order metadata only. Never store photos, generated images, face descriptions, embeddings or report contents.';

create table if not exists order_events (
  id          bigserial   primary key,
  order_id    uuid        not null references orders (id) on delete cascade,
  type        text        not null,
  from_status text,
  to_status   text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, created_at);

create table if not exists processed_webhook_events (
  provider     text        not null,
  event_id     text        not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);
