-- Whether anybody was told the order arrived.
--
-- An order sitting in a table nobody opened is the same as no order. Email is
-- sent after the order is committed, so it can fail on its own — and when it
-- does, the row has to say so, or the failure is invisible and the customer is
-- waiting on a reply that was never sent.

alter table public.orders
  add column if not exists notified_at    timestamptz,
  add column if not exists notify_error   text;

comment on column public.orders.notified_at is
  'When the shop and the customer were emailed about this order. Null means nobody has been told.';
comment on column public.orders.notify_error is
  'Why the email did not go out, if it did not. Shown in /admin so it cannot pass unnoticed.';

-- Orders nobody has been told about, oldest first. The one query worth having
-- as a view: if this returns rows, somebody is waiting.
create or replace view public.unnotified_orders
  with (security_invoker = on) as
  select reference, placed_at, customer_name, customer_email, status, notify_error
  from public.orders
  where notified_at is null
  order by placed_at;

-- The function marks its own work. Only service_role reaches this.
create or replace function public.mark_order_notified(p_reference text, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders
     set notified_at = case when p_error is null then now() else notified_at end,
         notify_error = p_error,
         updated_at = now()
   where reference = p_reference
$$;
revoke execute on function public.mark_order_notified(text, text) from anon, authenticated;
