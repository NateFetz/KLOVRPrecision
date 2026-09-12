-- Order creation.
--
-- The browser sends SKUs, quantities, and a destination. It does not send
-- prices, and nothing it sends about price is read. Everything is priced and
-- re-validated here, inside one transaction, against the catalogue.
--
-- security definer so it can write despite RLS; execute is revoked from anon
-- and authenticated so it can only be reached by the service_role key from
-- netlify/functions/create-order.js.

create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dest        destination;
  v_ffl_id      uuid;
  v_dest_state  text;
  v_order_id    uuid;
  v_reference   text;
  v_subtotal    integer := 0;
  v_line        jsonb;
  v_prod        public.products%rowtype;
  v_qty         integer;
  v_count       integer := 0;
  v_ffl         jsonb;
begin
  v_dest := (payload->>'destination')::destination;

  if jsonb_typeof(payload->'lines') <> 'array'
     or jsonb_array_length(payload->'lines') = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if jsonb_array_length(payload->'lines') > 40 then
    raise exception 'CART_TOO_LARGE';
  end if;

  -- ---- destination -------------------------------------------------------
  if v_dest = 'ffl' then
    v_ffl := payload->'ffl';
    if v_ffl is null or v_ffl->>'licence' is null then
      raise exception 'FFL_REQUIRED';
    end if;
    -- Cache the dealer. verified_at stays null until the licence has actually
    -- been confirmed current against ATF eZ Check.
    insert into public.ffl_dealers (licence, business_name, address1, city, state, zip)
    values (v_ffl->>'licence', v_ffl->>'business_name', v_ffl->>'address1',
            v_ffl->>'city', upper(v_ffl->>'state'), v_ffl->>'zip')
    on conflict (licence) do update set business_name = excluded.business_name
    returning id, state into v_ffl_id, v_dest_state;
  else
    v_dest_state := upper(payload->'ship_address'->>'state');
    if v_dest_state is null then
      raise exception 'SHIP_STATE_REQUIRED';
    end if;
  end if;

  -- ---- the order ---------------------------------------------------------
  insert into public.orders
    (customer_name, customer_email, customer_phone, destination, ship_address, ffl_dealer_id, note)
  values
    (payload->>'customer_name', lower(payload->>'customer_email'), payload->>'customer_phone',
     v_dest,
     case when v_dest = 'door' then payload->'ship_address' else null end,
     v_ffl_id,
     payload->>'note')
  returning id, reference into v_order_id, v_reference;

  -- ---- lines, priced from the catalogue ----------------------------------
  for v_line in select * from jsonb_array_elements(payload->'lines')
  loop
    v_qty := greatest(1, coalesce((v_line->>'qty')::integer, 1));
    if v_qty > 99 then raise exception 'QTY_TOO_LARGE:%', v_line->>'sku'; end if;

    select * into v_prod from public.products where sku = v_line->>'sku';
    if not found        then raise exception 'UNKNOWN_SKU:%', v_line->>'sku'; end if;
    if not v_prod.is_live then raise exception 'NOT_FOR_SALE:%', v_prod.name; end if;

    -- An item that may only go to a dealer cannot be on a door order.
    if v_prod.delivery <> 'door' and v_dest <> 'ffl' then
      raise exception 'NEEDS_DEALER:%', v_prod.name;
    end if;

    -- And it cannot go somewhere it is not permitted at all.
    if v_dest_state = any (v_prod.no_ship_states) then
      raise exception 'NOT_PERMITTED:%:%', v_prod.name, v_dest_state;
    end if;

    if not v_prod.built_to_order and v_prod.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_prod.name;
    end if;

    insert into public.order_lines (order_id, product_id, sku, name, qty, unit_price_cents)
    values (v_order_id, v_prod.id, v_prod.sku, v_prod.name, v_qty, v_prod.price_cents);

    v_subtotal := v_subtotal + v_prod.price_cents * v_qty;
    v_count := v_count + v_qty;
  end loop;

  update public.orders set subtotal_cents = v_subtotal where id = v_order_id;

  return jsonb_build_object(
    'reference', v_reference,
    'subtotal_cents', v_subtotal,
    'items', v_count
  );
end $$;

revoke execute on function public.create_order(jsonb) from public, anon, authenticated;
