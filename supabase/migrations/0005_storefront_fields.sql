-- Fields the storefront renders that the first cut of the schema did not carry.
--
-- filter_key is the shop's filter slug ('action', 'chassis', …) as opposed to
-- `category`, which is the human label ('Actions'). Keeping both means the
-- filter chips do not depend on how a label is spelled.

alter table public.products add column if not exists summary    text;
alter table public.products add column if not exists filter_key text;
alter table public.products add column if not exists sort_order integer not null default 100;

create index if not exists products_filter_idx on public.products (filter_key);

-- Records the last time the storefront was rebuilt, so staff can see whether an
-- edit is live yet. One row.
create table if not exists public.site_meta (
  id                boolean primary key default true check (id),
  last_published_at timestamptz,
  last_published_by text
);
insert into public.site_meta (id) values (true) on conflict (id) do nothing;

alter table public.site_meta enable row level security;
create policy site_meta_staff_read on public.site_meta
  for select to authenticated using (public.is_staff());
-- writes happen from the rebuild function with the service key only
