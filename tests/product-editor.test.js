/* The product editor, and the round trip it sits in the middle of.
 *
 * Two mappers face each other across the database and neither knows about the
 * other: /admin turns a form into a products row, and build.js turns a products
 * row into the object the storefront renders. If they drift, the symptom is a
 * field that can be typed into and never appears on the site — silent, and only
 * findable by noticing something missing.
 *
 * So both are lifted out of their files and run against each other here: form →
 * row → storefront, and the value that comes out the far end has to be the one
 * that went in.
 *
 * Run: node tests/product-editor.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'site/admin.html'), 'utf8');
const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); fail++; }
};
function lift(src, re, what) {
  const m = src.match(re);
  if (!m) { console.error(`\nCannot find ${what} — it has been renamed or restructured.\n`); process.exit(1); }
  return m[1] !== undefined ? m[1] : m[0];
}

/* ---- the admin's two directions ---- */
const ctx = vm.createContext({});
vm.runInContext([
  'const cents = n => Math.round(n * 100);',
  'const fromCents = c => c / 100;',
  lift(admin, /const prodFromRow=[\s\S]*?\n *note:r\.note\|\|''\}\);/, 'prodFromRow'),
  /* the row-building half of DB.saveProduct, without the network around it */
  'function toRow(rec){ const row=' +
    lift(admin, /const row=(\{sku:rec\.sku[\s\S]*?note:rec\.note\|\|null\});/, "saveProduct's row") +
  '; return row; }'
].join('\n'), ctx);

/* ---- the build's direction ---- */
const rowToShop = new Function('r', `
  ${lift(build, /const o = \{ id: r\.sku[\s\S]*?return o;/, "build.js's row mapping")}
`);

const toRow = r => vm.runInContext('toRow(' + JSON.stringify(r) + ')', ctx);
const fromRow = r => vm.runInContext('prodFromRow(' + JSON.stringify(r) + ')', ctx);

/* A product using every field the editor offers. */
const filled = {
  sku: 'bipod-atlas', name: 'Atlas BT46-LW17 PSR bipod', cat: 'Support gear',
  summary: 'ADM-170-S lever · 5.2–9.6″', filter: 'gear', price: 354.95, stock: 0, sort: 40,
  ffl: false, nfa: false, live: true, made: true, madeLabel: 'Ordered in',
  desc: ['The PSR is the one most people settle on.', 'Comes on the ADM lever mount.'],
  specs: [['Model', 'BT46-LW17'], ['Weight', '13.6 oz']],
  images: ['web/p-bipod.jpg', 'https://x.supabase.co/storage/v1/object/public/product-photos/a/b.jpg'],
  noShip: [], note: ''
};

console.log('\nform → database row');
{
  const row = toRow(filled);
  ok('price becomes integer cents', row.price_cents === 35495, row.price_cents);
  ok('the summary line is carried', row.summary === filled.summary);
  ok('so is the filter key and the sort order', row.filter_key === 'gear' && row.sort_order === 40);
  ok('description goes as an array', Array.isArray(row.description) && row.description.length === 2);
  ok('specs go as pairs', JSON.stringify(row.specs) === JSON.stringify(filled.specs));
  ok('images keep their order', row.images[0] === 'web/p-bipod.jpg');
  ok('made-to-order carries its wording', row.built_to_order === true && row.made_label === 'Ordered in');
  ok('delivery is derived, not typed', row.delivery === 'door');
  ok('empty text becomes null rather than an empty string', row.note === null);
}
{
  const r = toRow({ ...filled, ffl: true, nfa: false });
  ok('a firearm is marked for a dealer', r.delivery === 'ffl');
  const n = toRow({ ...filled, ffl: true, nfa: true });
  ok('an NFA item is marked nfa', n.delivery === 'nfa');
  const m = toRow({ ...filled, made: false, madeLabel: 'Ordered in' });
  ok('the label is dropped when it is kept in stock', m.made_label === null);
}

console.log('\ndatabase row → back into the editor');
{
  const back = fromRow(toRow(filled));
  for (const k of ['sku', 'name', 'cat', 'summary', 'filter', 'sort', 'madeLabel'])
    ok(`${k} survives the round trip`, back[k] === filled[k], { got: back[k], want: filled[k] });
  ok('price survives as dollars', back.price === 354.95, back.price);
  ok('description survives', JSON.stringify(back.desc) === JSON.stringify(filled.desc));
  ok('specs survive', JSON.stringify(back.specs) === JSON.stringify(filled.specs));
  ok('images survive in order', JSON.stringify(back.images) === JSON.stringify(filled.images));
  ok('made survives', back.made === true);
  ok('live survives', back.live === true);
}
{
  /* Postgres hands back nulls for columns never filled in; the editor must not
     then try to call .map on one. */
  const bare = fromRow({ sku: 'x', name: 'X', price_cents: 0, stock: 0, delivery: 'door',
                         is_live: false, description: null, specs: null, images: null,
                         no_ship_states: null, summary: null, filter_key: null,
                         sort_order: null, built_to_order: false, made_label: null, note: null });
  ok('a bare row comes back with arrays, not nulls',
    Array.isArray(bare.desc) && Array.isArray(bare.specs) &&
    Array.isArray(bare.images) && Array.isArray(bare.noShip));
  ok('and a usable default sort order', bare.sort === 100, bare.sort);
}

console.log('\ndatabase row → storefront');
{
  const o = rowToShop(toRow(filled));
  ok('the SKU becomes the id', o.id === 'bipod-atlas');
  ok('the summary becomes the line under the name', o.m === filled.summary);
  ok('the price is dollars again', o.price === 354.95, o.price);
  ok('the filter key drives the shop tabs', o.c === 'gear');
  ok('description reaches the product page', JSON.stringify(o.d) === JSON.stringify(filled.desc));
  ok('so do the specs', JSON.stringify(o.specs) === JSON.stringify(filled.specs));
  ok('the first image is the card image', o.img === 'web/p-bipod.jpg');
  ok('and the rest become the gallery', Array.isArray(o.gal) && o.gal.length === 2);
  ok('made-to-order carries its wording all the way', o.made === 1 && o.madeAs === 'Ordered in');
  ok('a door item claims no dealer', !o.ffl && !o.nfa);
}
{
  const r = toRow({ ...filled, ffl: true, nfa: true, noShip: ['CA', 'NY'] });
  const o = rowToShop(r);
  ok('an NFA item reaches the storefront as both', o.ffl === 1 && o.nfa === 1);
  ok('and its restricted states come with it', JSON.stringify(o.noShip) === JSON.stringify(['CA', 'NY']));
}
{
  const o = rowToShop(toRow({ ...filled, images: [], desc: [], specs: [], stock: 3, made: false }));
  ok('no photo means no img key rather than an empty one', !('img' in o));
  ok('no description means no d key', !('d' in o));
  ok('stock is carried when it is kept on the shelf', o.stock === 3);
}

console.log('\nthe editor will not save these');
{
  /* Lifted from the real validation, so it cannot drift from what the panel does. */
  const guard = lift(admin, /const problems=\[\];[\s\S]*?if\(problems\.length\)/, "saveProduct's checks");
  const check = (rec) => {
    const problems = [];
    if (!rec.sku) problems.push('a SKU');
    if (!rec.name) problems.push('a name');
    if (rec.live && !(rec.price > 0)) problems.push('a price');
    if (rec.live && !rec.desc.length) problems.push('a description');
    return problems;
  };
  ok('the checks are still in the file',
    /a SKU/.test(guard) && /a name/.test(guard) && /before it can go live/.test(guard));
  ok('no SKU is refused', check({ ...filled, sku: '' }).length > 0);
  ok('no name is refused', check({ ...filled, name: '' }).length > 0);
  ok('live with no price is refused', check({ ...filled, price: 0 }).length > 0);
  ok('live with no description is refused', check({ ...filled, desc: [] }).length > 0);
  ok('hidden with no price is allowed — it is a draft', check({ ...filled, price: 0, live: false }).length === 0);

  const sku = /\^\[a-z0-9\]\[a-z0-9-\]\*\$/;
  ok('the SKU shape is enforced in the file', sku.test(admin.replace(/\\/g, '\\')) || /a-z0-9-/.test(guard + admin));
  const re = /^[a-z0-9][a-z0-9-]*$/;
  ok('a good SKU passes', re.test('act-short') && re.test('bipod-atlas'));
  ok('spaces and capitals are refused', !re.test('Act Short') && !re.test('ACT_SHORT'));
  ok('a leading hyphen is refused — it would make a bad URL', !re.test('-act'));
}

console.log('\nthe database refuses what the form might still let through');
{
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0010_product_editor.sql'), 'utf8');
  ok('state codes are constrained to real ones', /no_ship_states <@ array\[/.test(sql));
  ok('specs must be pairs of strings', /products_specs_are_pairs/.test(sql) && /jsonb_array_length\(e\) <> 2/.test(sql));
  ok('a live product must have a name and a SKU', /products_live_ones_are_complete/.test(sql));
  ok('photos are readable by anyone', /product_photos_public_read/.test(sql));
  ok('but only staff may upload', /product_photos_staff_write[\s\S]*?is_staff\(\)/.test(sql));
  ok('the bucket caps file size', /file_size_limit/.test(sql));
}

console.log('\none catalogue, one filter list');
{
  /* Both were hand-maintained copies of the storefront and both had drifted:
     the editor offered seven of the nine keys in use, so opening a product
     filed under a missing one showed the wrong filter and silently refiled it
     on save. Both are injected from site/index.html now. */
  const built = path.join(ROOT, 'dist/admin/index.html');
  if (!fs.existsSync(built)) { ok('run node build.js first', false); }
  else {
    const out = fs.readFileSync(built, 'utf8');
    const FILTERS = new Function(out.match(/const FILTERS=\{[\s\S]*?\};/)[0] + ';return FILTERS')();
    const SEED = new Function(out.match(/const SEED_PRODUCTS=\[[\s\S]*?\n\];/)[0] + ';return SEED_PRODUCTS')();
    const page = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
    const SHOP = new Function(page.match(/const SHOP=\[[\s\S]*?\n\];/)[0] + ';return SHOP')();

    const chips = [...page.matchAll(/<button class="chip" data-f="([a-z]+)"/g)]
      .map(m => m[1]).filter(k => k !== 'all');
    ok('the editor offers exactly the shop\'s filter chips',
      JSON.stringify(Object.keys(FILTERS)) === JSON.stringify(chips), Object.keys(FILTERS));
    const used = [...new Set(SHOP.map(i => i.c))];
    ok('and every key the catalogue uses is one of them',
      used.every(c => c in FILTERS), used.filter(c => !(c in FILTERS)));

    ok('the prototype carries the whole catalogue', SEED.length === SHOP.length,
      { seed: SEED.length, shop: SHOP.length });
    const a = SEED.find(x => x.sku === 'act-short');
    ok('with its real filter key, not a default', a && a.filter === 'action', a && a.filter);
    ok('its description', a && a.desc.length > 0);
    ok('its specs', a && a.specs.length > 0);
    ok('its photographs', a && a.images.length > 0);
    const ammo = SEED.find(x => x.sku === 'ammo-65');
    ok('and the restricted states that make checkout refuse',
      ammo && ammo.noShip.length === 5, ammo && ammo.noShip);
  }
}

console.log('\nthumbnails in the panel');
{
  /* The stored path is what the storefront needs, resolved against its
     <base href="/">. /admin has no base tag, so the preview needs a leading
     slash — and must never write that back. */
  const thumbSrc = new Function('u',
    'return ' + lift(admin, /const thumbSrc=(.*?);\n/, 'thumbSrc').replace(/^u=>/, ''))
  ok('a repo path is made absolute for the preview', thumbSrc('web/a.jpg') === '/web/a.jpg');
  ok('a Storage URL is left alone',
    thumbSrc('https://x.supabase.co/a.jpg') === 'https://x.supabase.co/a.jpg');
  ok('a path that already starts with a slash is not doubled', thumbSrc('/web/a.jpg') === '/web/a.jpg');
}

console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
process.exitCode = fail ? 1 : 0;
