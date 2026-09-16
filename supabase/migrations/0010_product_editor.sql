-- What the full product editor needs that the schema did not already have.
--
-- Almost nothing, as it turns out: description, specs, images, no_ship_states,
-- summary, filter_key and sort_order were all there from 0001 and 0005. Only
-- two things were missing — a label for how a built-to-order item is described,
-- and somewhere to put a photograph.

-- "Built to order" is right for a rifle we machine and wrong for a bipod we
-- order in from a distributor. Both are the same flag; only the wording differs.
alter table public.products
  add column if not exists made_label text;

comment on column public.products.made_label is
  'How built_to_order reads on the storefront: "Built to order", "Ordered in". Null falls back to the default wording.';

-- ---------------------------------------------------------------- photographs
-- Product photos live in Supabase Storage rather than the repository, because
-- the whole point of this editor is that adding a product does not require a
-- commit. The trade: photos in site/web/ are committed with an AVIF rendition
-- beside them, and these are not — there is no AVIF encoder on a Linux build
-- box. They are served as uploaded. build.js says how many, on every build.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at a product photo — they are on a public shop page. Only
-- staff may put one there or take one away.
drop policy if exists product_photos_public_read on storage.objects;
create policy product_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-photos');

drop policy if exists product_photos_staff_write on storage.objects;
create policy product_photos_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and is_staff());

drop policy if exists product_photos_staff_update on storage.objects;
create policy product_photos_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and is_staff());

drop policy if exists product_photos_staff_delete on storage.objects;
create policy product_photos_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and is_staff());

-- ---------------------------------------------------------------- guard rails
-- The editor is a form, and a form can be filled in wrongly. These are the
-- mistakes that would reach a customer as a broken page or, worse, as a firearm
-- routed somewhere it may not go.

-- Two-letter state codes, uppercase. 'Ca' or 'Calif' would silently never match
-- the destination and the item would ship somewhere it must not.
alter table public.products drop constraint if exists products_no_ship_states_are_codes;
alter table public.products add constraint products_no_ship_states_are_codes
  check (no_ship_states <@ array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
    'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
    'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP']::text[]);

-- specs is [["Label","Value"], …]. Anything else and the product page renders
-- empty cells rather than a table.
alter table public.products drop constraint if exists products_specs_are_pairs;
alter table public.products add constraint products_specs_are_pairs
  check (
    jsonb_typeof(specs) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(specs) e
      where jsonb_typeof(e) <> 'array'
         or jsonb_array_length(e) <> 2
         or jsonb_typeof(e->0) <> 'string'
         or jsonb_typeof(e->1) <> 'string'
    )
  );

-- A live product with no name, no price or no SKU is a broken card in the shop.
alter table public.products drop constraint if exists products_live_ones_are_complete;
alter table public.products add constraint products_live_ones_are_complete
  check (not is_live or (length(trim(name)) > 0 and length(trim(sku)) > 0));
