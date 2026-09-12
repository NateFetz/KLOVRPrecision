-- Row level security.
-- Default posture: deny. Every table below has RLS on, so anything without a
-- matching policy is invisible — including to a leaked anon key.

-- Membership of public.staff is the definition of "is an employee".
-- security definer so the policy can read the table without recursing into its
-- own RLS; search_path pinned so it cannot be shadowed.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where id = auth.uid())
$$;
revoke execute on function public.is_staff() from anon;
grant  execute on function public.is_staff() to authenticated;

alter table public.staff         enable row level security;
alter table public.products      enable row level security;
alter table public.ffl_dealers   enable row level security;
alter table public.orders        enable row level security;
alter table public.order_lines   enable row level security;
alter table public.qb_connection enable row level security;
alter table public.qb_sync_log   enable row level security;

-- ---------------------------------------------------------------- staff
-- An employee may see their own row and nobody else's. Adding employees is done
-- from the Supabase dashboard, or by the service_role key. There is no signup.
create policy staff_read_self on public.staff
  for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------- products
-- The storefront reads live products with the anon key. That is the only thing
-- the anon key can see anywhere in this database.
create policy products_public_read on public.products
  for select to anon, authenticated using (is_live);

create policy products_staff_read on public.products
  for select to authenticated using (public.is_staff());
create policy products_staff_write on public.products
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- dealers
-- Dealer records include licence numbers. Staff only.
create policy dealers_staff_all on public.ffl_dealers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- orders
-- Customer names, addresses, and the dealer they are transferring through.
-- Staff only, with no public read of any kind.
--
-- Note there is deliberately no INSERT policy for anon. Orders are created
-- server-side by a Netlify Function using the service_role key, so a browser
-- cannot forge prices or bypass the destination rules.
create policy orders_staff_all on public.orders
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy order_lines_staff_all on public.order_lines
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- quickbooks
-- qb_connection holds OAuth access and refresh tokens.
-- RLS is ON and there are NO policies, by design: neither the anon key nor a
-- signed-in employee can read it from a browser. Only the service_role key,
-- which bypasses RLS and never leaves the server, can touch this table.

-- The log has no secrets, so staff may read it.
create policy qb_log_staff_read on public.qb_sync_log
  for select to authenticated using (public.is_staff());
