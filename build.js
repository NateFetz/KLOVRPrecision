/* Generates a real, separately-indexable HTML file per route from one source.
   Client-side navigation still runs; this just means crawlers and no-JS visitors
   get a complete page, and each route can carry its own title and preview card. */
const fs = require('fs'), path = require('path');

/* Overridable so a test can build a doctored copy of the source into a
   throwaway directory without touching site/ or dist/. */
const SRC  = process.env.BUILD_SRC || 'site/index.html';
const OUT  = process.env.BUILD_OUT || 'dist';
const ASSETS = path.join(path.dirname(SRC), 'web');
const SITE = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://klovrprecision.netlify.app').replace(/\/$/, '');
const PLAUSIBLE = process.env.PLAUSIBLE_DOMAIN || '';

const ROUTES = [
  { path: '',              view: 'home',
    title: 'KLOVR Precision — Rifle Actions, Chassis & Custom Rifles',
    desc : 'Precision rifle actions and billet chassis machined in-house, finished in burnt bronze. Complete rifles built to order and proofed sub-MOA. FFL transfers and gunsmithing.',
    img  : 'web/hero-rifle.jpg' },
  { path: 'shop',          view: 'shop',
    title: 'Shop Actions, Chassis & Complete Rifles — KLOVR Precision',
    desc : 'KLOVR actions with integral 20 MOA rail, skeletonized billet chassis, pre-fit barrels, and complete rifles. Components ship to your door; rifles ship to your FFL.',
    img  : 'web/p-action-short.jpg' },
  { path: 'custom-rifles', view: 'build',
    title: 'Build a Custom Rifle — KLOVR Precision',
    desc : 'Spec chambering, action, chassis, barrel, and finish and get a priced build sheet. Sub-MOA guarantee, 10–14 week lead time, no deposit until we have talked it through.',
    img  : 'web/cfg-stage.jpg' },
  { path: 'gallery',       view: 'gallery',
    title: 'Recent Builds — KLOVR Precision',
    desc : 'Rifles and components that went home. Every complete rifle is photographed before it ships and leaves with its target card.',
    img  : 'web/gal-1.jpg' },
  { path: 'calendar',      view: 'calendar',
    title: 'Classes, Range Days & Matches — KLOVR Precision',
    desc : 'Long-range classes, open range days, club matches, and shop hours in central Utah. Add any of it to your own calendar.',
    img  : 'web/gal-2.jpg' },
  { path: 'search',        view: 'search',
    title: 'Search — KLOVR Precision',
    desc : 'Search actions, chassis, barrels, optics and gear.',
    img  : 'web/p-action-short.jpg', noindex: true },
  { path: 'cart',          view: 'cart',
    title: 'Your Cart — KLOVR Precision',
    desc : 'Review your cart. Components ship direct; firearms are delivered to a licensed dealer for transfer.',
    img  : 'web/p-action-short.jpg', noindex: true },
  { path: 'wishlist',      view: 'wishlist',
    title: 'Your Wishlist — KLOVR Precision',
    desc : 'Items you have saved.',
    img  : 'web/p-chassis-bronze.jpg', noindex: true },
  { path: 'checkout',      view: 'checkout',
    title: 'Checkout — KLOVR Precision',
    desc : 'Contact details, delivery or dealer selection, and compliance checks.',
    img  : 'web/p-rifle-cm.jpg', noindex: true },
  { path: 'contact',       view: 'contact',
    title: 'Contact, Hours & FFL Transfers — KLOVR Precision',
    desc : 'Shop hours, service pricing, and what to bring to an FFL transfer. Incoming transfers processed the day they land.',
    img  : 'web/feat-profile.jpg' },
  { path: 'transfers',     view: 'transfers',
    title: 'FFL Transfers — KLOVR Precision',
    desc : 'How an incoming firearm transfer works at KLOVR Precision: what to send, what to bring, what the background check can do, and what we will not accept.',
    img  : 'web/feat-profile.jpg', policy: true },
  { path: 'shipping-returns', view: 'shipping',
    title: 'Shipping & Returns — KLOVR Precision',
    desc : 'Components ship to your door, firearms to a licensed dealer, ammunition ground only. Return windows, damaged shipments, and what cannot come back.',
    img  : 'web/p-action-short.jpg', policy: true },
  { path: 'warranty',      view: 'warranty',
    title: 'Warranty — KLOVR Precision',
    desc : 'What we cover on actions, chassis, barrels and complete rifles, what the sub-MOA guarantee means in practice, and how to make a claim.',
    img  : 'web/hero-action.jpg', policy: true },
  { path: 'terms',         view: 'terms',
    title: 'Terms of Sale — KLOVR Precision',
    desc : 'Who may buy, how orders are confirmed, how firearms are delivered, custom build terms, and the limits of our liability.',
    img  : 'web/feat-profile.jpg', policy: true },
  { path: 'privacy',       view: 'privacy',
    title: 'Privacy — KLOVR Precision',
    desc : 'Everything this site collects, where it goes, what stays in your own browser, and how federal firearms records are kept separate.',
    img  : 'web/feat-profile.jpg', policy: true },
];

/* The policy pages carry [data-draft] notices and gold "tbd" markers for every
   fact only the shop can supply. They stay out of the index until somebody
   says they are finished; POLICIES_FINAL=1 strips the notices, lets them be
   indexed, and refuses to build if any marker is still unresolved. */
const POLICIES_FINAL = process.env.POLICIES_FINAL === '1';
for (const r of ROUTES) if (r.policy && !POLICIES_FINAL) r.noindex = true;

let src = fs.readFileSync(SRC, 'utf8');
if (POLICIES_FINAL) {
  const left = (src.match(/class="tbd"/g) || []).length;
  if (left) throw new Error(
    `POLICIES_FINAL=1 but ${left} unresolved marker(s) remain in the policy pages. ` +
    'Search site/index.html for class="tbd" and settle each one first.');
  const before = src.length;
  src = src.replace(/\s*<div class="draftbox" data-draft>[\s\S]*?<\/div>/g, '');
  if (src.length === before) throw new Error('POLICIES_FINAL=1 but no draft notices were found to remove');
}

/* The privacy page states that nothing third-party is tracking the visitor.
   Switching Plausible on with PLAUSIBLE_DOMAIN makes that sentence false, so
   the build stops rather than publishing a privacy policy that lies. */
if (PLAUSIBLE && src.includes('no third&#8209;party analytics')) throw new Error(
  'PLAUSIBLE_DOMAIN is set, but the privacy page still says the site runs no ' +
  'third-party analytics. Rewrite that paragraph (search site/index.html for ' +
  '"no advertising trackers") to name Plausible and what it collects, then build again.');

/* The catalogue in the page is the fallback. When Supabase is configured we
   read it from there instead, so a price changed in /admin reaches the
   storefront on the next build. */
const BIZ = new Function(src.match(/const BIZ=\{[\s\S]*?\n\};/)[0] + '; return BIZ;')();

/* Name, address and phone have to agree everywhere or they are worth less than
   nothing — a search engine that finds three versions of an address trusts
   none of them. So the address is all-or-nothing. */
/* region and country are known from the outset; these three are the ones that
   pin a specific door, and they travel together. */
const ADDR_FIELDS = ['street', 'city', 'postal'];
const addrGiven = ADDR_FIELDS.filter(f => BIZ[f]);
if (addrGiven.length && addrGiven.length !== ADDR_FIELDS.length) throw new Error(
  'BIZ has a partial address (' + addrGiven.join(', ') + ' set, missing ' +
  ADDR_FIELDS.filter(f => !BIZ[f]).join(', ') + '). Fill all of it or none of it.');
if (BIZ.tel && !/^\+1\d{10}$/.test(BIZ.tel)) throw new Error(
  'BIZ.tel must be E.164 for the tel: link — +1 then ten digits, no spaces. Got: ' + BIZ.tel);
if (BIZ.tel && !BIZ.telText) throw new Error('BIZ.tel is set but BIZ.telText (how it reads on the page) is not');
if (BIZ.geo && !(Number.isFinite(BIZ.geo.lat) && Number.isFinite(BIZ.geo.lon))) throw new Error(
  'BIZ.geo needs numeric lat and lon');

const HAS_ADDR  = addrGiven.length === ADDR_FIELDS.length;
const LOCAL_OK  = HAS_ADDR && !!BIZ.tel;          /* enough to claim a place */

const SHOP_LITERAL = src.match(/const SHOP=\[[\s\S]*?\n\];/)[0];
let SHOP = new Function(SHOP_LITERAL + '; return SHOP;')();

/* Only live products are readable with the anon key, which is exactly what a
   storefront wants — no service key needed at build time. */
async function catalogueFromSupabase() {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(
    `${base}/rest/v1/products?select=*&is_live=eq.true&order=sort_order.asc`,
    { headers: { apikey: process.env.SUPABASE_ANON_KEY,
                 Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`catalogue fetch failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (!rows.length) throw new Error('catalogue came back empty — refusing to build an empty shop');
  return rows.map(r => {
    const o = { id: r.sku, c: r.filter_key || 'gear', n: r.name, m: r.summary || '',
                price: r.price_cents / 100 };
    if (r.stock)          o.stock = r.stock;
    if (r.built_to_order) o.made = 1;
    if (r.delivery !== 'door') o.ffl = 1;
    if (r.delivery === 'nfa')  o.nfa = 1;
    if (r.category)            o.cat = r.category;
    if (r.images && r.images.length) { o.img = r.images[0]; if (r.images.length > 1) o.gal = r.images; }
    if (r.description && r.description.length) o.d = r.description;
    if (r.specs && r.specs.length)             o.specs = r.specs;
    if (r.no_ship_states && r.no_ship_states.length) o.noShip = r.no_ship_states;
    if (r.note) o.note = r.note;
    return o;
  });
}
const usd = n => '$' + n.toLocaleString('en-US',
  { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const CAT = { action:'Actions', chassis:'Chassis', rifle:'Complete rifles', barrel:'Barrels & bolts' };

/* A plain-HTML version of each product so crawlers and no-JS visitors get the
   real content; the script replaces it with the interactive version on load. */
const prerender = i => {
  const gal = (i.gal && i.gal.length) ? i.gal : (i.img ? [i.img] : []);
  return `<nav class="crumb"><a href="/shop">Shop</a><span>/</span><em>${esc(i.n)}</em></nav>
<div class="pdp">
 <div class="pdpgal"><div class="pdphero">${gal.length?`<img src="${gal[0]}" alt="${esc(i.n)}">`:''}</div></div>
 <div class="pdpinfo">
  <h1>${esc(i.n)}</h1>
  <p class="pdpprice num">${usd(i.price)}</p>
  <div class="pdpdesc">${(i.d||[i.m]).map(x=>`<p>${esc(x)}</p>`).join('')}</div>
  ${i.nfa?'<div class="fulfil nfa"><b>NFA item — stamp required</b>Requires ATF Form 4, fingerprints, and a $200 transfer stamp.</div>'
    :i.ffl?'<div class="fulfil ffl"><b>Ships to a licensed dealer</b>Delivered to an FFL near you, never to a home.</div>'
    :'<div class="fulfil door"><b>Ships to your door</b>No transfer needed for this item.</div>'}
  <h3 class="spec-h">Specification</h3>
  <div class="tablewrap"><table class="spectable">${(i.specs||[]).map(s=>`<tr><th>${esc(s[0])}</th><td>${esc(s[1])}</td></tr>`).join('')}</table></div>
 </div>
</div>`;
};
const split = src.indexOf('<div class="util"');
if (split < 0) throw new Error('index.html: could not find the start of the body content');
let head = src.slice(0, split);
const body = src.slice(split);

head = head.replace(/<title>[\s\S]*?<\/title>\n?/, '');           // per-route title instead
head = head.replace(/<meta charset="utf-8">\n?/, '')
           .replace(/<meta name="viewport"[^>]*>\n?/, '');

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

const rm = (dir) => fs.existsSync(dir) && fs.rmSync(dir, { recursive: true });
const copy = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true }))
    e.isDirectory() ? copy(path.join(from, e.name), path.join(to, e.name))
                    : fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
};

async function main() {

let source = 'site/index.html';
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  SHOP = await catalogueFromSupabase();
  source = 'Supabase';
}

/* Whatever the catalogue came from, the page must ship that same catalogue —
   otherwise the shop grid would render one thing and the product pages another. */
const bodyRaw = source === 'Supabase'
  ? body.replace(SHOP_LITERAL, () => 'const SHOP=' + JSON.stringify(SHOP) + ';')
  : body;

for (const r of ROUTES) {
  if (r.path === '')         r.ld = orgSchema();
  if (r.path === 'calendar') r.ld = eventSchema() || undefined;
}

rm(OUT);
fs.mkdirSync(OUT, { recursive: true });
copy(ASSETS, path.join(OUT, 'web'));

/* Replaces the contents of <tag data-biz="key"> … </tag>. Build-time rather
   than runtime so the address and phone are in the HTML a crawler reads. */
function slot(html, key, inner) {
  const re = new RegExp('(<[^>]*\\bdata-biz="' + key + '"[^>]*>)([\\s\\S]*?)(</[a-z]+>)', 'g');
  if (!re.test(html)) throw new Error(`no data-biz="${key}" slot found in site/index.html`);
  return html.replace(re, (m, open, _old, close) => open + inner + close);
}
/* An unresolved fact reads the same here as it does on the policy pages. */
const tbd  = t => `<span class="tbd">${t}</span>`;
const nbsp = t => String(t).replace(/ /g, '&nbsp;');

function applyBusiness(html) {
  const telLink = BIZ.tel ? `<a href="tel:${BIZ.tel}">${nbsp(BIZ.telText)}</a>` : null;

  html = slot(html, 'address', HAS_ADDR
    ? `${BIZ.street}<br>${BIZ.city}, ${BIZ.region} ${BIZ.postal}`
    : tbd('street address, city and ZIP'));
  html = slot(html, 'tel',   telLink || tbd('phone number'));
  html = slot(html, 'email', BIZ.email ? `<a href="mailto:${BIZ.email}">${BIZ.email}</a>` : tbd('email address'));
  html = slot(html, 'ffl',   BIZ.ffl || tbd('FFL number'));

  /* Hours: one table, built from the same array the schema uses. */
  const h12 = t => { const [H, M] = t.split(':').map(Number);
    return `${H % 12 || 12}:${String(M).padStart(2, '0')}`; };
  const span = d => d.length === 1 ? d[0] : `${d[0].slice(0,3)} – ${d[d.length-1].slice(0,3)}`;
  html = slot(html, 'hours', BIZ.hours.map(b =>
    `<tr><th>${span(b.d)}</th><td class="n">${h12(b.o)} – ${h12(b.c)}</td></tr>`).join('')
    + (BIZ.hoursNote ? `<tr><th>${BIZ.hoursNote.replace(/^Closed /, '')}</th><td class="n">Closed</td></tr>` : ''));
  html = slot(html, 'hours-note', BIZ.hoursConfirmed ? ''
    : tbd('confirm these hours — they were written to fill the page'));

  /* Footer block. Each line disappears rather than showing a blank. */
  html = slot(html, 'address-inline', HAS_ADDR ? `${BIZ.street}, ${BIZ.city}, ${BIZ.region} ${BIZ.postal}` : '');
  html = slot(html, 'hours-inline',   BIZ.hoursConfirmed
    ? BIZ.hours.map(b => `${span(b.d)} ${h12(b.o)}–${h12(b.c)}`).join(' &middot; ') : '');
  html = slot(html, 'tel-inline',     telLink || '');
  /* Three empty paragraphs would still hold their space under the logo. */
  if (!HAS_ADDR && !BIZ.tel && !BIZ.hoursConfirmed)
    html = html.replace(/<div class="nap">[\s\S]*?<\/div>\n/, '');
  /* No number means no phone label in the header of every page. */
  if (!BIZ.tel) html = html.replace(/<span class="lab" data-biz="tel-util">[\s\S]*?<\/span><\/span>/, '');

  /* A social icon that has a real address becomes a real link. */
  for (const [net, url] of Object.entries(BIZ.social)) {
    if (!url) continue;
    html = html.replace(
      new RegExp(`<a href="#" data-social="${net}" onclick="soon.social\\('${net}'\\);return false" aria-label="[^"]*"`),
      () => `<a href="${url}" data-social="${net}" rel="me noopener" target="_blank" aria-label="KLOVR Precision on ${net}"`);
  }
  return html;
}

const bodyBase = applyBusiness(bodyRaw);

function page(r, b, url) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="/">
<title>${esc(r.title)}</title>
<meta name="description" content="${esc(r.desc)}">
<link rel="canonical" href="${url}">${r.noindex ? '\n<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="KLOVR Precision">
<meta property="og:title" content="${esc(r.title)}">
<meta property="og:description" content="${esc(r.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/${r.img}">
<meta property="og:image:width" content="1800">
<meta property="og:image:height" content="1200">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(r.title)}">
<meta name="twitter:description" content="${esc(r.desc)}">
<meta name="twitter:image" content="${SITE}/${r.img}">
<meta name="theme-color" content="#0D0D0D">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230D0D0D'/%3E%3Cg fill='%23769F76'%3E%3Ccircle cx='34' cy='34' r='17'/%3E%3Ccircle cx='66' cy='34' r='17'/%3E%3Ccircle cx='34' cy='66' r='17'/%3E%3Ccircle cx='66' cy='66' r='17'/%3E%3C/g%3E%3Ccircle cx='50' cy='50' r='8' fill='%23D2A85F'/%3E%3C/svg%3E">
${r.ld ? '<script type="application/ld+json">' + JSON.stringify(r.ld) + '</script>' : ''}
${PLAUSIBLE ? `<script defer data-domain="${PLAUSIBLE}" src="https://plausible.io/js/script.js"></script>` : ''}
${head}
</head>
<body data-view="${r.view}">
${b}
</body>
</html>`;
}

/* Organization is safe with nothing but a name and a logo, and it is what puts
   the mark in a knowledge panel. Store adds the parts that need a real
   address, and is emitted only when there is one. */
function orgSchema() {
  const o = {
    '@context':'https://schema.org',
    '@type': LOCAL_OK ? 'Store' : 'Organization',
    '@id'  : SITE + '/#business',
    name   : BIZ.name,
    url    : SITE + '/',
    logo   : SITE + '/' + BIZ.logo,
    image  : [SITE + '/web/hero-rifle.jpg'],
    description: BIZ.desc,
  };
  if (BIZ.legal) o.legalName = BIZ.legal;
  const sameAs = Object.values(BIZ.social).filter(Boolean);
  if (sameAs.length) o.sameAs = sameAs;
  if (BIZ.email) o.email = BIZ.email;
  if (BIZ.tel) o.telephone = BIZ.tel;
  if (!LOCAL_OK) return o;

  o.address = { '@type':'PostalAddress', streetAddress:BIZ.street, addressLocality:BIZ.city,
                addressRegion:BIZ.region, postalCode:BIZ.postal, addressCountry:BIZ.country };
  if (BIZ.geo) o.geo = { '@type':'GeoCoordinates', latitude:BIZ.geo.lat, longitude:BIZ.geo.lon };
  if (BIZ.priceRange) o.priceRange = BIZ.priceRange;
  if (BIZ.hoursConfirmed) o.openingHoursSpecification = BIZ.hours.map(b => ({
    '@type':'OpeningHoursSpecification', dayOfWeek:b.d, opens:b.o, closes:b.c }));
  return o;
}

/* The calendar's events are placeholders until somebody says otherwise, and an
   Event in search results is a promise that something happens at a time and a
   place. */
function eventSchema() {
  if (!BIZ.calendarConfirmed) return null;
  const EVENTS = new Function(src.match(/const EVENTS=\[[\s\S]*?\n\];/)[0] + '; return EVENTS;')();
  return EVENTS.map(e => {
    const ev = {
      '@context':'https://schema.org','@type':'Event',
      name: e.t, description: e.d,
      startDate: e.date, endDate: e.end || e.date,
      eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
      eventStatus:'https://schema.org/EventScheduled',
      url: SITE + '/calendar',
      location:{ '@type':'Place', name:e.loc,
        address: HAS_ADDR && /shop/i.test(e.loc)
          ? { '@type':'PostalAddress', streetAddress:BIZ.street, addressLocality:BIZ.city,
              addressRegion:BIZ.region, postalCode:BIZ.postal, addressCountry:BIZ.country }
          : { '@type':'PostalAddress', addressRegion:BIZ.region, addressCountry:BIZ.country } },
      organizer:{ '@type':'Organization', name:BIZ.name, url:SITE + '/' },
    };
    /* A price in schema has to be a number; "$40 entry" is prose. */
    const n = e.price && e.price.match(/\$([\d,]+)/);
    ev.offers = { '@type':'Offer', url:SITE + '/calendar', availability:'https://schema.org/InStock',
                  price: n ? Number(n[1].replace(/,/g,'')) : 0, priceCurrency:'USD' };
    return ev;
  });
}

for (const i of SHOP) {
  ROUTES.push({
    path : 'product/' + i.id,
    view : 'product',
    title: i.n + ' — KLOVR Precision',
    desc : (i.d ? i.d[0] : i.m).slice(0, 155),
    img  : i.img || 'web/hero-rifle.jpg',
    inject: prerender(i),
    ld: {
      '@context':'https://schema.org','@type':'Product',
      name:i.n, sku:i.id, description:(i.d?i.d[0]:i.m),
      image:[SITE+'/'+(i.img||'web/hero-rifle.jpg')],
      brand:{'@type':'Brand',name:'KLOVR Precision'},
      offers:{'@type':'Offer',url:SITE+'/product/'+i.id,priceCurrency:'USD',
        price:i.price, availability:'https://schema.org/'+(i.made?'PreOrder':'InStock')}
    }
  });
}

for (const r of ROUTES) {
  const url = SITE + '/' + r.path;
  // mark this route's view as the visible one in the delivered HTML
  let b = bodyBase.replace('id="home" class="view on"', 'id="home" class="view"');
  // checkout talks to the order function only once Supabase is configured
  b = b.replace("'__ORDERS_API__'", process.env.SUPABASE_URL ? "'1'" : "'0'");
  b = b.replace(`id="${r.view}" class="view"`, `id="${r.view}" class="view on"`);
  if (r.view !== 'home') b = b.replace('<button data-v="home" aria-current="page">', '<button data-v="home">');
  if (r.inject) b = b.replace('<div id="productBody"></div>', () => '<div id="productBody">' + r.inject + '</div>');

  const doc = page(r, b, url);

  const dir = r.path ? path.join(OUT, r.path) : OUT;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), doc);
}


/* ---- staff area: its own document, not part of the public bundle ---- */
{
  const adminSrc = fs.readFileSync(path.join(path.dirname(SRC), 'admin.html'), 'utf8');
  // single source of truth: tokens and the logo come from the public page
  const tokens = src.match(/:root\{[\s\S]*?\n\}/)[0];
  const logo   = src.match(/<span class="on-dark">([\s\S]*?)<\/span>/)[1];

  const cut  = adminSrc.indexOf('<div class="demobar"');
  if (cut < 0) throw new Error('admin.html: could not find the start of the body content');
  let head   = adminSrc.slice(0, cut).replace(/\/\* %TOKENS%[^\n]*\*\//, () => tokens);
  const adminBody = adminSrc.slice(cut).split('<!-- %LOGO% -->').join(logo);
  // Publishable values only. SUPABASE_SERVICE_KEY must never be injected here —
  // it bypasses row level security and belongs to the Netlify Functions alone.
  head = head.replace('__SUPABASE_URL__', process.env.SUPABASE_URL || '__SUPABASE_URL__')
             .replace('__SUPABASE_ANON_KEY__', process.env.SUPABASE_ANON_KEY || '__SUPABASE_ANON_KEY__');
  head = head.replace(/<meta charset="utf-8">\n?/, '').replace(/<meta name="viewport"[^>]*>\n?/, '');

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D0D0D">
${head}
</head>
<body>
${adminBody}
</body>
</html>`;
  fs.mkdirSync(path.join(OUT, 'admin'), { recursive: true });
  for (const ph of ['%TOKENS%', '%LOGO%']) {
    if (doc.includes(ph)) throw new Error(`admin.html: ${ph} was never substituted`);
  }
  fs.writeFileSync(path.join(OUT, 'admin', 'index.html'), doc);
  console.log(process.env.SUPABASE_URL
    ? '  /admin  (noindex, wired to Supabase)'
    : '  /admin  (noindex, prototype — set SUPABASE_URL and SUPABASE_ANON_KEY to go live)');
}

/* Netlify serves 404.html from the publish root for any unmatched path. */
{
  const r = { view:'notfound',
    title:'Page not found — KLOVR Precision',
    desc :'That page is not here. Search the shop, or start from the front page.',
    img  :'web/hero-rifle.jpg', noindex:true };
  let b = bodyBase.replace('id="home" class="view on"', 'id="home" class="view"')
                  .replace('id="notfound" class="view"', 'id="notfound" class="view on"')
                  .replace('<button data-v="home" aria-current="page">', '<button data-v="home">');
  const doc = page(r, b, SITE + '/404');
  fs.writeFileSync(path.join(OUT, '404.html'), doc);
  console.log('  /404.html');
}

// sitemap + robots so the new routes get found
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.filter(r => !r.noindex).map(r => `  <url><loc>${SITE}/${r.path}</loc></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /cart\nDisallow: /wishlist\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`built ${ROUTES.length} routes into ${OUT}/ against ${SITE}`);
console.log(`catalogue: ${SHOP.length} products from ${source}`);
console.log(LOCAL_OK
  ? `local search: Store schema with address${BIZ.geo ? ', map pin' : ' (no map pin — set BIZ.geo)'}` +
    `${BIZ.hoursConfirmed ? ', opening hours' : ' (hours withheld — BIZ.hoursConfirmed is false)'}`
  : `local search: Organization only — fill BIZ.${ADDR_FIELDS.filter(f => !BIZ[f]).concat(BIZ.tel ? [] : ['tel']).join(', BIZ.')} to claim the shop's location`);
if (!BIZ.calendarConfirmed) console.log('calendar: no Event schema — BIZ.calendarConfirmed is false');
console.log(ROUTES.map(r => '  /' + r.path).join('\n'));

}

main().catch(err => { console.error('\nBUILD FAILED:', err.message); process.exit(1); });
