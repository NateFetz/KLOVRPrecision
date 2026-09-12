-- Site events.
--
-- First-party, on purpose. The privacy page tells customers this site runs no
-- third-party trackers, and firearms customers have a particular reason to care
-- who holds a list with their name on it. Keeping the measurement here means
-- that sentence stays true, and it costs nothing.
--
-- What is deliberately NOT here: no cookie, no durable visitor id, no IP
-- address, no user agent string, no full referrer, no city, and no link of any
-- kind between an event and an order or a customer. The session column is a
-- random value the browser keeps in sessionStorage — it dies with the tab, and
-- its only job is to let a funnel count one person once.

create table if not exists public.site_events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  -- ephemeral, per browser tab; not a visitor id and never joined to anything
  session   text not null,
  name      text not null,
  props     jsonb not null default '{}'::jsonb,
  path      text,
  -- host only. "duckduckgo.com", never the URL somebody arrived from.
  ref_host  text,
  -- country and state. A shop that cannot ship certain items to certain states
  -- has a real use for this; the city would be precision nobody asked for.
  country   text,
  region    text,
  device    text check (device in ('mobile','desktop'))
);

create index if not exists site_events_at_idx    on public.site_events (at desc);
create index if not exists site_events_name_idx  on public.site_events (name, at desc);
create index if not exists site_events_props_idx on public.site_events using gin (props);

-- Deny by default, like everything else. There is no insert policy at all:
-- writes arrive through netlify/functions/collect.js with the service key,
-- which is the only place event names are validated.
alter table public.site_events enable row level security;

drop policy if exists site_events_staff_read on public.site_events;
create policy site_events_staff_read on public.site_events
  for select to authenticated using (is_staff());

-- ---------------------------------------------------------------- reporting
-- security definer so one is_staff() check gates the lot, search_path pinned so
-- these cannot be shadowed.

-- What happened, and how much of it.
create or replace function public.events_summary(p_days int default 30)
returns table (name text, events bigint, sessions bigint)
language sql stable security definer set search_path = public as $$
  select e.name, count(*), count(distinct e.session)
  from site_events e
  where is_staff() and e.at > now() - make_interval(days => greatest(p_days, 1))
  group by e.name
  order by 2 desc
$$;

-- Searches that found nothing. For a shop this is the most directly actionable
-- thing on the page: it is a list of what people came for and did not get.
create or replace function public.search_gaps(p_days int default 30)
returns table (q text, times bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(e.props->>'q'), count(*), max(e.at)
  from site_events e
  where is_staff()
    and e.name = 'search'
    and coalesce((e.props->>'n')::int, 0) = 0
    and coalesce(e.props->>'q', '') <> ''
    and e.at > now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc, 3 desc
$$;

-- What people actually spec when they build a rifle. This is stock intelligence
-- that cannot be got any other way — a chambering nobody picks is barrel money
-- sitting on a shelf.
create or replace function public.build_choices(p_days int default 30)
returns table (step text, choice text, picks bigint, sessions bigint)
language sql stable security definer set search_path = public as $$
  select e.props->>'k', e.props->>'v', count(*), count(distinct e.session)
  from site_events e
  where is_staff()
    and e.name = 'build_step'
    and coalesce(e.props->>'k', '') <> ''
    and e.at > now() - make_interval(days => greatest(p_days, 1))
  group by 1, 2
  order by 1, 3 desc
$$;

-- Where checkout loses people. Counted by session so one person hitting Back
-- does not read as two.
create or replace function public.checkout_funnel(p_days int default 30)
returns table (step int, sessions bigint)
language sql stable security definer set search_path = public as $$
  select (e.props->>'step')::int, count(distinct e.session)
  from site_events e
  where is_staff()
    and e.name = 'checkout_step'
    and (e.props->>'step') ~ '^[1-4]$'
    and e.at > now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 1
$$;

-- Looked at versus put in a basket, per product.
create or replace function public.product_interest(p_days int default 30)
returns table (sku text, views bigint, carted bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(v.sku, c.sku), coalesce(v.n, 0), coalesce(c.n, 0)
  from (select props->>'sku' as sku, count(*) n from site_events
        where name = 'product_view' and at > now() - make_interval(days => greatest(p_days, 1))
        group by 1) v
  full join
       (select props->>'sku' as sku, count(*) n from site_events
        where name = 'add_to_cart' and at > now() - make_interval(days => greatest(p_days, 1))
        group by 1) c on c.sku = v.sku
  where is_staff()
  order by 2 desc nulls last
$$;

revoke execute on function public.events_summary(int)   from anon;
revoke execute on function public.search_gaps(int)      from anon;
revoke execute on function public.build_choices(int)    from anon;
revoke execute on function public.checkout_funnel(int)  from anon;
revoke execute on function public.product_interest(int) from anon;

-- Nothing here is worth keeping for years. Run this on a schedule (Supabase
-- dashboard → Database → Cron) or call it by hand now and then.
create or replace function public.prune_site_events(p_keep_days int default 400)
returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from site_events where at < now() - make_interval(days => greatest(p_keep_days, 30));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.prune_site_events(int) from anon, authenticated;
