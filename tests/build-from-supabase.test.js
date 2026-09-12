/* Proves the publish loop: a price in the database reaches the built pages.
 * Run: node tests/build-from-supabase.test.js
 * Stands up a fake PostgREST so no real project is needed.
 */
const http = require('http'), { execFile, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const rows = [
  { sku:'act-short', name:'KLOVR Short Action — Burnt Bronze', summary:'700 footprint', filter_key:'action',
    category:'Actions', price_cents:1499_00, stock:4, built_to_order:false, delivery:'door',
    description:['From the database.'], specs:[['Rail','Integral, 20 MOA']], images:['web/p-action-short.jpg'],
    no_ship_states:[], note:null, is_live:true, sort_order:0 },
  { sku:'rifle-cm', name:'KLOVR Complete Rifle — 6.5 Creedmoor', summary:'22″ fluted', filter_key:'rifle',
    category:'Complete rifles', price_cents:4995_00, stock:0, built_to_order:true, delivery:'ffl',
    description:['Also from the database.'], specs:[], images:['web/p-rifle-cm.jpg'],
    no_ship_states:[], note:null, is_live:true, sort_order:10 }
];

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}).listen(0, () => {
  const port = server.address().port;
  // execFile, not execFileSync: the child fetches from this very process, so the
  // event loop has to stay free to answer it.
  execFile('node', ['build.js'], { cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_ANON_KEY: 'anon-test-key' } },
  (err, out) => {
  server.close();
  if (err) { console.error('build failed:', out || err.message); process.exitCode = 1; return; }

  const read = p => fs.readFileSync(path.join(ROOT, 'dist', p), 'utf8');
  const shop = read('shop/index.html');
  const pdp  = read('product/act-short/index.html');
  const t = [
    ['catalogue came from Supabase', /from Supabase/.test(out)],
    ['only live rows built',         /catalogue: 2 products/.test(out)],
    // the shop grid is client-rendered, so assert on the catalogue it ships
    ['new price in the catalogue',   /"id":"act-short"[^}]*"price":1499/.test(shop)],
    ['old price gone',               !shop.includes('1,395')],
    // the product page is pre-rendered, so the formatted price is in the HTML
    ['new price on the product page', pdp.includes('$1,499')],
    ['product page pre-rendered',    pdp.includes('From the database.')],
    ['product route generated',      fs.existsSync(path.join(ROOT,'dist/product/rifle-cm/index.html'))],
    ['stale product route dropped',  !fs.existsSync(path.join(ROOT,'dist/product/sup-65/index.html'))],
    ['embedded catalogue replaced',  shop.includes('"sku"') === false && shop.includes('const SHOP=[{"id":"act-short"')],
    ['ffl flag survived the trip',   /"id":"rifle-cm"[^}]*"ffl":1/.test(shop)],
    ['anon key not in output',       !shop.includes('anon-test-key')]
  ];
  t.forEach(([l, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${l}`));
  const pass = t.every(x => x[1]);
  console.log('\n' + (pass ? 'all passed' : 'FAILURES PRESENT'));
  execFileSync('node', ['build.js'], { cwd: ROOT });      // restore the normal build
  process.exitCode = pass ? 0 : 1;
  });
});
