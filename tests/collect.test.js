/* The event collector is a public, unauthenticated endpoint writing to the
 * database with the service key, so the thing worth testing is what it refuses.
 * A browser must not be able to invent an event name, smuggle an extra column,
 * store an unbounded string, or get an IP address or a ZIP code written down.
 *
 * The privacy page makes specific promises about all of that. These assertions
 * are that page, expressed as code.
 *
 * Run: node tests/collect.test.js
 */
const http = require('http');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { handler, EVENTS, refHost } = require(path.join(ROOT, 'netlify/functions/collect.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); fail++; }
};

/* A fake PostgREST that records what it was asked to insert. */
let inserted = [];
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d);
  req.on('end', () => { inserted.push(JSON.parse(b || '[]')); res.writeHead(201); res.end(''); });
});

const geo = o => Buffer.from(JSON.stringify(o)).toString('base64');

async function post(body, headers = {}) {
  inserted = [];
  const res = await handler({
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { host: 'klovrprecision.com', 'user-agent': 'Mozilla/5.0', ...headers }
  });
  return { res, rows: inserted.flat() };
}

const S = 'abcd1234efgh5678';

server.listen(0, async () => {
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_KEY = 'service-test-key';

  console.log('\nwhat it accepts');
  {
    const { res, rows } = await post({ s: S, e: [{ n: 'add_to_cart', p: { sku: 'act-short', qty: 2 }, u: '/shop' }] });
    ok('a known event is stored', rows.length === 1, rows);
    ok('and keeps its properties', rows[0] && rows[0].props.sku === 'act-short' && rows[0].props.qty === 2, rows[0]);
    ok('the response tells the browser nothing', res.statusCode === 204 && res.body === '');
  }
  {
    const { rows } = await post({ s: S, e: [
      { n: 'page', p: { view: 'shop' } }, { n: 'search', p: { q: 'BRAKE', n: 0 } }] });
    ok('a batch goes in one insert', rows.length === 2, rows.length);
    ok('search queries are lowercased for grouping', rows[1].props.q === 'brake', rows[1].props);
    ok('a zero-result search keeps its zero', rows[1].props.n === 0, rows[1].props);
  }

  console.log('\nwhat it refuses');
  {
    const { rows } = await post({ s: S, e: [{ n: 'not_an_event', p: { x: 1 } }] });
    ok('an event name that is not on the list is dropped', rows.length === 0, rows);
  }
  {
    const { rows } = await post({ s: S, e: [
      { n: 'add_to_cart', p: { sku: 'act-short', qty: 1, email: 'a@b.com', ip: '1.2.3.4' } }] });
    ok('properties outside the shape are dropped',
      rows[0] && !('email' in rows[0].props) && !('ip' in rows[0].props), rows[0] && rows[0].props);
  }
  {
    const { rows } = await post({ s: S, e: [{ n: 'search', p: { q: 'x'.repeat(500), n: 3 } }] });
    ok('long strings are truncated, not stored whole', rows[0].props.q.length === 80, rows[0].props.q.length);
  }
  {
    const { rows } = await post({ s: S, e: [{ n: 'checkout_step', p: { step: 99 } }] });
    ok('out-of-range numbers are clamped', rows[0].props.step === 4, rows[0].props);
  }
  {
    const { rows } = await post({ s: 'no', e: [{ n: 'page', p: { view: 'home' } }] });
    ok('a malformed session id is rejected outright', rows.length === 0);
  }
  {
    const { rows } = await post({ s: S, e: Array.from({ length: 80 }, () => ({ n: 'page', p: { view: 'home' } })) });
    ok('a batch is capped at 30', rows.length === 30, rows.length);
  }
  {
    const { rows } = await post({ s: S, e: [{ n: 'product_view', p: { sku: '' } }] });
    ok('an empty property is dropped rather than stored blank',
      rows.length === 1 && !('sku' in rows[0].props), rows[0] && rows[0].props);
  }
  {
    const res = await handler({ httpMethod: 'GET', headers: {} });
    ok('GET is refused', res.statusCode === 405);
  }

  console.log('\nwhat it must never write down');
  {
    const { rows } = await post({ s: S, e: [{ n: 'page', p: { view: 'home' } }] },
      { 'x-nf-client-connection-ip': '203.0.113.9', 'client-ip': '203.0.113.9',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15' });
    const row = rows[0], flat = JSON.stringify(row);
    ok('no IP address reaches the row', !flat.includes('203.0.113'), flat);
    ok('no user agent string reaches the row', !flat.includes('AppleWebKit'), flat);
    ok('the device is reduced to one word', row.device === 'mobile', row.device);
    ok('there is no column for anything else',
      Object.keys(row).sort().join(',') === 'country,device,name,path,props,ref_host,region,session');
  }
  {
    /* The dealer finder is the one place a visitor types something close to a
       home address. The event shape has no field for it at all. */
    ok('ffl_search cannot carry a ZIP',
      !('zip' in EVENTS.ffl_search({ zip: '84701', n: 3 })), EVENTS.ffl_search({ zip: '84701', n: 3 }));
    const { rows } = await post({ s: S, e: [{ n: 'ffl_search', p: { zip: '84701', n: 3 } }] });
    ok('and one sent anyway is not stored', !JSON.stringify(rows[0]).includes('84701'), rows[0]);
  }
  {
    const { rows } = await post({ s: S, r: 'https://duckduckgo.com/?q=klovr+precision+rifle+action',
      e: [{ n: 'page', p: { view: 'home' } }] });
    ok('only the referring host is kept, never the query somebody searched',
      rows[0].ref_host === 'duckduckgo.com', rows[0].ref_host);
  }
  {
    const { rows } = await post({ s: S, r: 'https://klovrprecision.com/shop', e: [{ n: 'page', p: { view: 'cart' } }] });
    ok('arriving from our own page is not a referral', rows[0].ref_host === null, rows[0].ref_host);
  }
  {
    const { rows } = await post({ s: S, e: [{ n: 'page', p: { view: 'home' } }] },
      { 'x-nf-geo': geo({ country: { code: 'US', name: 'United States' },
                          subdivision: { code: 'UT' }, city: 'Richfield',
                          latitude: 38.77, longitude: -112.08 }) });
    ok('country and state are kept', rows[0].country === 'US' && rows[0].region === 'UT', rows[0]);
    ok('the city and coordinates are not',
      !JSON.stringify(rows[0]).match(/Richfield|38\.77|112\.08/), rows[0]);
  }

  console.log('\nnot configured');
  {
    const url = process.env.SUPABASE_URL; delete process.env.SUPABASE_URL;
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ s: S, e: [] }), headers: {} });
    ok('no database means a quiet no-op, not an error', res.statusCode === 204);
    process.env.SUPABASE_URL = url;
  }

  console.log('\nthe page half');
  {
    const src = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
    const used = [...src.matchAll(/track\('([a-z_]+)'/g)].map(m => m[1]);
    const unknown = used.filter(u => !Object.prototype.hasOwnProperty.call(EVENTS, u));
    ok('every event the page sends is on the collector\'s list', !unknown.length, unknown);
    ok('the page respects Global Privacy Control', /globalPrivacyControl/.test(src));
    ok('and Do Not Track', /doNotTrack/.test(src));
    ok('the session id lives in sessionStorage, not a cookie',
      /sessionStorage\.setItem\('kp_s'/.test(src) && !/document\.cookie/.test(src));
    ok('measurement is off unless the build switches it on', /const COLLECT='__COLLECT__'==='1'/.test(src));

    const built = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
    ok('and it is off in the current build', /const COLLECT='0'==='1'/.test(built));
  }

  console.log('\nreferrer parsing');
  ok('a junk referrer does not throw', refHost('not a url', 'x.com') === null);
  ok('www is normalised', refHost('https://www.google.com/search', 'klovrprecision.com') === 'google.com');
  ok('an empty referrer is null', refHost('', 'x.com') === null);

  server.close();
  console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
  process.exitCode = fail ? 1 : 0;
});
