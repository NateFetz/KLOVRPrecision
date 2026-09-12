-- FFL directory.
--
-- Source is the ATF listing of active Federal Firearms Licensees, which ATF
-- publishes monthly and makes available to licence holders through eZ Check.
-- It excludes type 03 collectors and type 06 ammunition manufacturers.
--
-- There is no API for eZ Check — ATF has said so. Verifying that one licence is
-- currently valid is therefore a manual lookup a member of staff performs, and
-- verified_at records when they did it. Nothing here scrapes ATF.

alter table public.ffl_dealers add column if not exists licence_name text;
alter table public.ffl_dealers add column if not exists licence_type char(2);
alter table public.ffl_dealers add column if not exists expires_on   date;
alter table public.ffl_dealers add column if not exists source       text;
alter table public.ffl_dealers add column if not exists imported_at  timestamptz;
alter table public.ffl_dealers add column if not exists verified_by  text;

-- Which licence types may actually receive a firearm transfer.
-- 01 dealer · 02 pawnbroker · 07 manufacturer · 08 importer
-- 09/10/11 destructive devices. Deliberately excludes 03 (collector, curio and
-- relic only) and 06 (ammunition manufacturer) — neither can take a transfer.
alter table public.ffl_dealers
  add column if not exists can_transfer boolean
  generated always as (licence_type in ('01','02','07','08','09','10','11')) stored;

create index if not exists ffl_zip_idx    on public.ffl_dealers (zip);
create index if not exists ffl_zip3_idx   on public.ffl_dealers (left(zip, 3));
create index if not exists ffl_state_idx  on public.ffl_dealers (state);

-- ---------------------------------------------------------------- search
-- Public: the checkout needs this before anyone has signed in. security definer
-- so it can read a staff-only table, returning only the columns a customer
-- needs — never the whole row.
--
-- Proximity without geocoding: an exact ZIP beats a shared 4-digit prefix,
-- which beats a shared 3-digit prefix (the same sectional centre), which beats
-- merely being in the same state. Good enough to put the right dealer first.
create or replace function public.find_ffls(p_zip text, p_state text default null, p_limit int default 12)
returns table (
  licence       text,
  business_name text,
  address1      text,
  city          text,
  state         char(2),
  zip           text,
  phone         text,
  expires_on    date,
  proximity     int
)
language sql
stable
security definer
set search_path = public
as $$
  select d.licence, coalesce(d.business_name, d.licence_name) as business_name,
         d.address1, d.city, d.state, d.zip, d.phone, d.expires_on,
         case when d.zip = p_zip                              then 0
              when left(d.zip,4) = left(p_zip,4)              then 1
              when left(d.zip,3) = left(p_zip,3)              then 2
              else 3 end as proximity
  from public.ffl_dealers d
  where d.can_transfer
    and (d.expires_on is null or d.expires_on >= current_date)
    and ( left(d.zip,3) = left(p_zip,3)
          or (p_state is not null and d.state = upper(p_state)) )
  order by proximity, coalesce(d.business_name, d.licence_name)
  limit least(greatest(p_limit,1), 25)
$$;

grant execute on function public.find_ffls(text, text, int) to anon, authenticated;

-- Staff record a manual eZ Check the moment they do one.
create or replace function public.mark_ffl_verified(p_licence text, p_by text)
returns void language sql security definer set search_path = public as $$
  update public.ffl_dealers
     set verified_at = now(), verified_by = p_by
   where licence = p_licence
$$;
revoke execute on function public.mark_ffl_verified(text, text) from public, anon;
grant  execute on function public.mark_ffl_verified(text, text) to authenticated;
