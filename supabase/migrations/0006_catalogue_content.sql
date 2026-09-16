-- Catalogue content, generated from site/index.html by build tooling.
-- Regenerate rather than editing by hand.

update public.products set
  summary = '700 footprint · integral 20 MOA rail · fluted bolt',
  filter_key = 'action',
  sort_order = 0,
  description = array['Cut from 416R stainless, nitrided, then finished in the burnt bronze that started the company. The recoil lug is machined as part of the receiver rather than sandwiched behind the barrel nut, so there is one less joint to move under recoil.','The rail is integral and cut at 20 MOA, which means there is no base to shoot loose and no screws to check. The bolt body is fluted to shed debris and throws at 70°, clearing a 50 mm objective without changing your cheek weld.'],
  specs = '[["Footprint","Remington 700, short action"],["Bolt face",".473 standard"],["Rail","Integral, 20 MOA"],["Bolt","Fluted body, 70° throw, M16 extractor"],["Material","416R stainless, nitrided"],["Finish","Burnt bronze Cerakote"],["Barrel tenon","1.0625 × 16"],["Weight","31.4 oz"],["In the box","Action, bolt, recoil lug"]]'::jsonb,
  images = array['web/p-action-short.jpg','web/hero-action.jpg','web/feat-profile.jpg','web/feat-muzzle.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'act-short';
update public.products set
  summary = 'Magnum bolt face · 70° throw · M16 extractor',
  filter_key = 'action',
  sort_order = 10,
  description = array['The same receiver, opened up for belted and beltless magnums. Magnum bolt face, longer magazine cut, and the same integral 20 MOA rail.','Built for .300 Win Mag, 7mm Rem Mag, and the PRC family. If you are chambering something long and you want one action to carry it, this is the one.'],
  specs = '[["Footprint","Remington 700, long action"],["Bolt face",".532 magnum"],["Rail","Integral, 20 MOA"],["Bolt","Fluted body, 70° throw, M16 extractor"],["Material","416R stainless, nitrided"],["Finish","Burnt bronze Cerakote"],["Weight","33.8 oz"],["In the box","Action, bolt, recoil lug"]]'::jsonb,
  images = array['web/p-action-magnum.jpg','web/gal-1.jpg','web/hero-action.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'act-magnum';
update public.products set
  summary = 'Billet 7075 · AICS mags · engraved forend',
  filter_key = 'chassis',
  sort_order = 20,
  description = array['Cut from a single billet of 7075-T6 and hollowed where the material was carrying nothing. What is left is thick where the action sits and where the forend takes a bipod load.','Takes AICS magazines, adjusts for comb height and length of pull, and carries M-LOK along the forend. The roll mark is engraved, not printed.'],
  specs = '[["Material","Billet 7075-T6 aluminium"],["Magazine","AICS pattern, detachable"],["Forend","12″, M-LOK"],["Adjustment","Comb height and length of pull"],["Fits","Remington 700 footprint"],["Finish","Burnt bronze Cerakote"],["Weight","3 lb 2 oz"],["Hardware","Action screws and torque spec included"]]'::jsonb,
  images = array['web/p-chassis-bronze.jpg','web/hero-chassis.jpg','web/gal-5.jpg','web/gal-4.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'chs-bronze';
update public.products set
  summary = 'Adjustable comb and length of pull',
  filter_key = 'chassis',
  sort_order = 30,
  description = array['The same chassis with the skeleton cuts opened further. Four ounces lighter, and you can see straight through it, which some people love and some people do not.','Built to order in the finish you pick.'],
  specs = '[["Material","Billet 7075-T6 aluminium"],["Magazine","AICS pattern, detachable"],["Forend","12″, M-LOK"],["Adjustment","Comb height and length of pull"],["Fits","Remington 700 footprint"],["Finish","Your choice of house colours"],["Weight","2 lb 14 oz"],["Lead time","4–6 weeks"]]'::jsonb,
  images = array['web/p-chassis-black.jpg','web/gal-2.jpg','web/gal-3.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'chs-skel';
update public.products set
  summary = '22″ fluted · bronze chassis · sub‑MOA proofed',
  filter_key = 'rifle',
  sort_order = 40,
  description = array['A complete rifle on our own action and chassis, chambered, trued, and bedded on the bench. It leaves with a three-shot group at 100 yards and that target in the case.','Six-five Creedmoor because it does most of what most people need: flat enough for open country, mild enough to shoot well, and cheap enough to practise with.'],
  specs = '[["Chambering","6.5 Creedmoor"],["Barrel","22″ fluted, 1:8, 416R stainless"],["Action","KLOVR short action, integral 20 MOA rail"],["Chassis","KLOVR billet, burnt bronze"],["Muzzle","Threaded 5/8 × 24, capped"],["Trigger","Adjustable, set at 2 lb 8 oz"],["Weight","8 lb 4 oz bare"],["Accuracy","Sub-MOA three-shot guarantee"],["Lead time","10–14 weeks"]]'::jsonb,
  images = array['web/p-rifle-cm.jpg','web/hero-rifle.jpg','web/cfg-stage.jpg','web/gal-1.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'rifle-cm';
update public.products set
  summary = '24″ fluted · magnum action · sub‑MOA proofed',
  filter_key = 'rifle',
  sort_order = 50,
  description = array['The magnum build, for elk country and the long shots that come with it. Twenty-four inches to get the most out of the case, on the magnum action.','Proofed to the same standard as every complete rifle: three shots, 100 yards, under an inch, target in the case.'],
  specs = '[["Chambering",".300 Winchester Magnum"],["Barrel","24″ fluted, 1:10, 416R stainless"],["Action","KLOVR magnum action, integral 20 MOA rail"],["Chassis","KLOVR billet"],["Muzzle","Threaded 5/8 × 24, radial brake"],["Trigger","Adjustable, set at 2 lb 8 oz"],["Weight","9 lb 1 oz bare"],["Accuracy","Sub-MOA three-shot guarantee"],["Lead time","10–14 weeks"]]'::jsonb,
  images = array['web/p-rifle-mag.jpg','web/gal-1.jpg','web/hero-rifle.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'rifle-wm';
update public.products set
  summary = '416R stainless · 1:8 · threaded 5/8×24',
  filter_key = 'barrel',
  sort_order = 60,
  description = array['Chambered and headspaced to drop onto a KLOVR action or any 700 footprint with a barrel nut. No gunsmith, no lathe — a wrench and a go gauge.','Fluted to shed weight and heat without giving up much stiffness.'],
  specs = '[["Chambering","6.5 Creedmoor"],["Length","22″"],["Twist","1:8"],["Contour","Fluted sporter"],["Material","416R stainless"],["Muzzle","Threaded 5/8 × 24 with cap"],["Fitment","KLOVR and 700-footprint actions"],["Finish","Nitride"]]'::jsonb,
  images = array['web/p-barrel.jpg','web/cfg-stage.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'bbl-65';
update public.products set
  summary = 'Fluted body · M16 extractor · short action',
  filter_key = 'barrel',
  sort_order = 70,
  description = array['A second bolt, headspaced to your action if you send us the serial number. Useful if you run more than one barrel.'],
  specs = '[["Action length","Short"],["Bolt face",".473 standard"],["Body","Fluted"],["Extractor","M16-style"],["Throw","70°"],["Finish","Nitride"],["Note","Send your action serial for headspacing"]]'::jsonb,
  images = array['web/p-bolt.jpg','web/hero-action.jpg'],
  no_ship_states = '{}',
  note = null
where sku = 'bolt-sa';
update public.products set
  summary = '30 mm tube · capped turrets · second focal',
  filter_key = 'optic',
  sort_order = 80,
  description = array['A general-purpose hunting scope. Capped turrets so nothing moves in a scabbard, and enough magnification for anything inside four hundred yards.'],
  specs = '[["Magnification","3.5–10×"],["Objective","40 mm"],["Tube","30 mm"],["Focal plane","Second"],["Turrets","Capped, 1/4 MOA"],["Length","12.6″"],["Weight","19.2 oz"]]'::jsonb,
  images = '{}',
  no_ship_states = '{}',
  note = null
where sku = 'opt-3510';
update public.products set
  summary = 'Exposed elevation · 0.1 mil clicks',
  filter_key = 'optic',
  sort_order = 90,
  description = array['Exposed elevation with a zero stop, for people who dial rather than hold over. Fifty millimetre objective for the first and last half hour of light.'],
  specs = '[["Magnification","4–16×"],["Objective","50 mm"],["Tube","34 mm"],["Focal plane","First"],["Turrets","Exposed elevation, 0.1 mil, zero stop"],["Length","13.9″"],["Weight","29.6 oz"]]'::jsonb,
  images = '{}',
  no_ship_states = '{}',
  note = null
where sku = 'opt-41650';
update public.products set
  summary = 'Matched pair · 1.1″ height · 4‑screw caps',
  filter_key = 'mount',
  sort_order = 100,
  description = array['Matched pair, lapped, finished to match our actions. Four screws per cap so the clamping load spreads evenly across the tube.'],
  specs = '[["Tube","34 mm"],["Height","1.1″ centre over rail"],["Caps","Four screws each"],["Material","7075-T6 aluminium"],["Finish","Burnt bronze Cerakote"],["Torque","18 in-lb caps, 65 in-lb clamps"]]'::jsonb,
  images = '{}',
  no_ship_states = '{}',
  note = null
where sku = 'rings-34';
update public.products set
  summary = '20 rounds · boat tail · brass case',
  filter_key = 'ammo',
  sort_order = 110,
  description = array['Match ammunition for load development and practice. Twenty rounds, brass case, boat tail.'],
  specs = '[["Chambering","6.5 Creedmoor"],["Bullet","140 gr boat tail"],["Case","Brass, reloadable"],["Count","20 rounds"],["Restrictions","Cannot ship to CA, MA, NY, IL, NJ"]]'::jsonb,
  images = '{}',
  no_ship_states = array['CA','MA','NY','IL','NJ'],
  note = 'Ammunition cannot ship to CA, MA, NY, IL, or NJ.'
where sku = 'ammo-65';
update public.products set
  summary = 'Picatinny mount · cant and pan',
  filter_key = 'gear',
  sort_order = 120,
  description = array['Carbon legs, aluminium head, cant and pan with a single tension knob. Mounts straight to a rail.'],
  specs = '[["Height","7–10″"],["Mount","Picatinny"],["Movement","Cant and pan, lockable"],["Weight","11.4 oz"],["Legs","Carbon fibre, notched"]]'::jsonb,
  images = '{}',
  no_ship_states = '{}',
  note = null
where sku = 'bipod-carb';
update public.products set
  summary = 'Foam‑lined · lockable · airline rated',
  filter_key = 'gear',
  sort_order = 130,
  description = array['Rated for airline checked baggage, which means lockable with a non-TSA lock as the law requires for firearms.'],
  specs = '[["Internal length","48″"],["Lining","Pluck foam"],["Locks","Two, non-TSA"],["Rating","Airline checked baggage"],["Weight","11 lb"],["Wheels","Yes"]]'::jsonb,
  images = '{}',
  no_ship_states = '{}',
  note = null
where sku = 'case-48';
update public.products set
  summary = '11.4 oz · direct thread 5/8×24',
  filter_key = 'nfa',
  sort_order = 140,
  description = array['Titanium, direct thread, rated to magnum pressures in 6.5. Eleven and a half ounces on the end of a hunting rifle is about as light as this gets.','This is an NFA item. It requires ATF Form 4, fingerprints, and a $200 transfer stamp, and it stays in our safe until your stamp clears — currently 20 to 45 days on eForms.'],
  specs = '[["Calibre","6.5 mm, magnum rated"],["Mount","Direct thread 5/8 × 24"],["Material","Titanium"],["Weight","11.4 oz"],["Length","7.2″"],["Paperwork","ATF Form 4, $200 stamp"],["Restrictions","Not transferable to CA, DC, DE, HI, IL, IA, MA, NJ, NY, RI"]]'::jsonb,
  images = '{}',
  no_ship_states = array['CA','DC','DE','HI','IL','IA','MA','NJ','NY','RI'],
  note = 'Form 4 and $200 stamp. Held in our safe until approval.'
where sku = 'sup-65';

-- The Atlas PSR bipod, added after the original catalogue content. Copy supplied
-- by the manufacturer; the photograph is their studio shot, padded to 3:2 so the
-- legs are not cropped by the card.
update public.products set
  images = array['web/p-bipod-atlas.jpg']
where sku = 'bipod-atlas';
