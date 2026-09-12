/* Generates a real, separately-indexable HTML file per route from one source.
   Client-side navigation still runs; this just means crawlers and no-JS visitors
   get a complete page, and each route can carry its own title and preview card. */
const fs = require('fs'), path = require('path');

const SRC  = 'site/index.html';
const OUT  = 'dist';
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
];

const src   = fs.readFileSync(SRC, 'utf8');

/* Read the catalogue straight out of the page so there is one source of truth. */
const SHOP = new Function(src.match(/const SHOP=\[[\s\S]*?\n\];/)[0] + '; return SHOP;')();
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

rm(OUT);
fs.mkdirSync(OUT, { recursive: true });
copy('site/web', path.join(OUT, 'web'));

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
  let b = body.replace('id="home" class="view on"', 'id="home" class="view"');
  b = b.replace(`id="${r.view}" class="view"`, `id="${r.view}" class="view on"`);
  if (r.view !== 'home') b = b.replace('<button data-v="home" aria-current="page">', '<button data-v="home">');
  if (r.inject) b = b.replace('<div id="productBody"></div>', '<div id="productBody">' + r.inject + '</div>');

  const doc = `<!doctype html>
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

  const dir = r.path ? path.join(OUT, r.path) : OUT;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), doc);
}


/* ---- staff area: its own document, not part of the public bundle ---- */
{
  const adminSrc = fs.readFileSync('site/admin.html', 'utf8');
  // single source of truth: tokens and the logo come from the public page
  const tokens = src.match(/:root\{[\s\S]*?\n\}/)[0];
  const logo   = src.match(/<span class="on-dark">([\s\S]*?)<\/span>/)[1];

  const cut  = adminSrc.indexOf('<div class="demobar"');
  if (cut < 0) throw new Error('admin.html: could not find the start of the body content');
  let head   = adminSrc.slice(0, cut).replace(/\/\* %TOKENS%[^\n]*\*\//, tokens);
  const body = adminSrc.slice(cut).split('<!-- %LOGO% -->').join(logo);
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
${body}
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
console.log(ROUTES.map(r => '  /' + r.path).join('\n'));
