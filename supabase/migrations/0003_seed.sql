-- Seed the catalogue to match what the storefront currently ships.
-- Safe to re-run: conflicts on sku are updated, not duplicated.

insert into public.products (sku,name,category,price_cents,stock,built_to_order,delivery,no_ship_states,note,is_live) values
 ('act-short','KLOVR Short Action — Burnt Bronze','Actions',139500,8,false,'door','{}',null,true),
 ('act-magnum','KLOVR Magnum Action — Burnt Bronze','Actions',149500,3,false,'door','{}',null,true),
 ('chs-bronze','KLOVR Chassis — Burnt Bronze','Chassis',115000,5,false,'door','{}',null,true),
 ('chs-skel','KLOVR Chassis — Skeletonized','Chassis',115000,0,true,'door','{}',null,true),
 ('rifle-cm','KLOVR Complete Rifle — 6.5 Creedmoor','Rifles',485000,0,true,'ffl','{}',null,true),
 ('rifle-wm','KLOVR Complete Rifle — .300 Win Magnum','Rifles',529000,0,true,'ffl','{}',null,true),
 ('bbl-65','Pre-fit barrel — 6.5 CM, 22″ fluted','Barrels',52000,11,false,'door','{}',null,true),
 ('bolt-sa','Spare bolt assembly','Barrels',38500,6,false,'door','{}',null,true),
 ('opt-3510','3.5–10×40 hunting scope','Optics',64900,6,false,'door','{}',null,true),
 ('opt-41650','4–16×50 long-range scope','Optics',119900,2,false,'door','{}',null,true),
 ('rings-34','34 mm rings — burnt bronze','Mounts',18900,9,false,'door','{}',null,true),
 ('ammo-65','6.5 Creedmoor — 140 gr match','Ammunition',4150,34,false,'door',
   '{CA,MA,NY,IL,NJ}','Ammunition cannot ship to CA, MA, NY, IL, or NJ.',true),
 ('bipod-carb','Carbon bipod, 7–10″','Gear',37900,7,false,'door','{}',null,true),
 ('case-48','Takedown rifle case, 48″','Gear',18900,4,false,'door','{}',null,true),
 ('sup-65','Titanium suppressor — 6.5 mm','Suppressors',94900,1,false,'nfa',
   '{CA,DC,DE,HI,IL,IA,MA,NJ,NY,RI}','Form 4 and $200 stamp. Held in our safe until approval.',true)
on conflict (sku) do update set
  name = excluded.name, category = excluded.category, price_cents = excluded.price_cents,
  stock = excluded.stock, built_to_order = excluded.built_to_order, delivery = excluded.delivery,
  no_ship_states = excluded.no_ship_states, note = excluded.note, is_live = excluded.is_live;

insert into public.qb_connection (id) values (true) on conflict (id) do nothing;
