-- KLOVR Precision — staff/admin schema
-- Money is stored in integer cents. Never floats.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type delivery_rule as enum ('door','ffl','nfa');
create type order_status  as enum ('new','paid','hold','at_dealer','shipped','complete','cancelled');
create type destination   as enum ('door','ffl');

-- ---------------------------------------------------------------- staff
-- One row per employee, keyed to the Supabase auth user. Membership of this
-- table is what "is an employee" means; there is no self-signup.
create table public.staff (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'staff' check (role in ('staff','manager','owner')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text unique not null,
  name            text not null,
  category        text,
  description     text[]  not null default '{}',
  specs           jsonb   not null default '[]',
  images          text[]  not null default '{}',
  price_cents     integer not null check (price_cents >= 0),
  stock           integer not null default 0 check (stock >= 0),
  built_to_order  boolean not null default false,
  -- how this item is allowed to reach a buyer. Drives checkout, not just labels.
  delivery        delivery_rule not null default 'door',
  -- states we may not send it to at all, e.g. ammunition to CA
  no_ship_states  text[] not null default '{}',
  note            text,
  is_live         boolean not null default false,
  qb_item_id      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_live_idx on public.products (is_live) where is_live;
create index products_category_idx on public.products (category);

-- ---------------------------------------------------------------- dealers
create table public.ffl_dealers (
  id                 uuid primary key default gen_random_uuid(),
  licence            text unique not null,
  business_name      text not null,
  address1           text,
  city               text,
  state              char(2),
  zip                text,
  phone              text,
  transfer_fee_cents integer,
  -- set when the licence was last confirmed current against ATF eZ Check
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index ffl_dealers_zip_idx on public.ffl_dealers (zip);

-- ---------------------------------------------------------------- orders
create sequence if not exists order_ref_seq start 1059;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  reference       text unique not null default 'KP-' || nextval('order_ref_seq'),
  placed_at       timestamptz not null default now(),
  customer_name   text not null,
  customer_email  text not null,
  customer_phone  text,
  destination     destination not null,
  ship_address    jsonb,                 -- used when destination = 'door'
  ffl_dealer_id   uuid references public.ffl_dealers,
  status          order_status not null default 'new',
  subtotal_cents  integer not null default 0,
  carrier         text,
  tracking        text,
  note            text,
  qb_invoice_id   text,
  qb_invoice_no   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a firearm order must name the dealer it is going to. Enforced here so no
  -- application bug can create one without a destination dealer.
  constraint ffl_orders_need_a_dealer
    check (destination <> 'ffl' or ffl_dealer_id is not null),
  constraint door_orders_need_an_address
    check (destination <> 'door' or ship_address is not null)
);
create index orders_status_idx on public.orders (status);
create index orders_placed_idx on public.orders (placed_at desc);

create table public.order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders on delete cascade,
  product_id       uuid references public.products on delete set null,
  sku              text not null,
  name             text not null,
  qty              integer not null check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index order_lines_order_idx on public.order_lines (order_id);

-- ---------------------------------------------------------------- quickbooks
-- Single row. OAuth refresh tokens live here and must never leave the server;
-- see 0002_rls.sql — this table gets RLS on and no policies at all, so only the
-- service_role key (server-side) can read it.
create table public.qb_connection (
  id            boolean primary key default true check (id),
  realm_id      text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  connected_at  timestamptz,
  last_sync_at  timestamptz
);

create table public.qb_sync_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  level   text not null default 'info' check (level in ('info','warn','error')),
  message text not null
);
create index qb_sync_log_at_idx on public.qb_sync_log (at desc);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
