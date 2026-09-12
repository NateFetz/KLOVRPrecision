/* Event collection.
 *
 * Public and unauthenticated, so it assumes the caller is hostile. The browser
 * cannot decide what an event is called or what shape it has: every name is on
 * an allow-list here, every property is validated against that entry, and
 * anything else is dropped without comment. A visitor who wants to fill the
 * table with rubbish has to work at it, and still cannot invent a column.
 *
 * What this refuses to store, whatever the browser sends: IP addresses, user
 * agent strings, full referrer URLs, city-level location, and any free text
 * beyond a search query. The privacy page describes exactly this, so the two
 * have to stay in step.
 *
 * SUPABASE_SERVICE_KEY is read here because site_events has no insert policy —
 * writes are service_role only. It must never reach a browser.
 */

const SB  = () => process.env.SUPABASE_URL.replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_KEY;

/* Beacons are fire-and-forget; the browser never reads these. 204 for
   everything that is not a server fault, so a rejected event is silent. */
const done = (code = 204) => ({ statusCode: code, body: '' });

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, lo, hi) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

/* The whole vocabulary. Adding an event means adding it here as well as in the
   page — deliberately, so nothing starts being collected by accident. */
const EVENTS = {
  page:           p => ({ view: str(p.view, 40) }),
  search:         p => ({ q: str(p.q, 80).toLowerCase(), n: int(p.n, 0, 999) }),
  product_view:   p => ({ sku: str(p.sku, 60) }),
  add_to_cart:    p => ({ sku: str(p.sku, 60), qty: int(p.qty, 1, 99) }),
  remove_from_cart: p => ({ sku: str(p.sku, 60) }),
  checkout_step:  p => ({ step: int(p.step, 1, 4) }),
  order_sent:     p => ({ dest: p.dest === 'ffl' ? 'ffl' : 'door',
                          items: int(p.items, 1, 99), value: int(p.value, 0, 1_000_000) }),
  build_step:     p => ({ k: str(p.k, 24), v: str(p.v, 60) }),
  build_saved:    p => ({ code: str(p.code, 40) }),
  build_shared:   p => ({ code: str(p.code, 40) }),
  build_submitted: p => ({ code: str(p.code, 40), price: int(p.price, 0, 1_000_000) }),
  /* Count only. The ZIP somebody types into the dealer finder is the closest
     thing on this site to a home address, and it is not written down. */
  ffl_search:     p => ({ n: int(p.n, 0, 99) }),
};

/* Per-instance, so it only catches the clumsy — same caveat as create-order.
   A beacon batch is one request, so the ceiling is on batches, not events. */
const seen = new Map();
function tooFast(ip) {
  const now = Date.now(), hits = (seen.get(ip) || []).filter(t => now - t < 60_000);
  hits.push(now); seen.set(ip, hits);
  if (seen.size > 500) seen.clear();
  return hits.length > 40;
}

/* Host only, and only if it is somewhere else. Arriving from our own pages is
   not a referral, and the path somebody came from is their business. */
function refHost(ref, self) {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return (self && h === self.replace(/^www\./, '')) ? null : h.slice(0, 80);
  } catch { return null; }
}

/* Netlify hands us city, latitude and longitude as well. We take the country
   and the state and drop the rest on the floor. */
function place(header) {
  if (!header) return {};
  try {
    const geo = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    return { country: str(geo?.country?.code, 2) || null,
             region:  str(geo?.subdivision?.code, 6) || null };
  } catch { return {}; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return done(405);
  /* Not configured is not an error — the site works without any of this. */
  if (!process.env.SUPABASE_URL || !KEY()) return done();

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
  if (tooFast(ip)) return done(429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return done(); }

  const session = str(body.s, 40);
  if (!/^[a-z0-9]{8,40}$/.test(session)) return done();

  const host    = event.headers.host || '';
  const geo     = place(event.headers['x-nf-geo']);
  const ua      = event.headers['user-agent'] || '';
  const device  = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  const referrer = refHost(str(body.r, 300), host);

  const rows = (Array.isArray(body.e) ? body.e : []).slice(0, 30).flatMap(raw => {
    const name = str(raw?.n, 40);
    const shape = Object.prototype.hasOwnProperty.call(EVENTS, name) ? EVENTS[name] : null;
    if (!shape) return [];
    const props = shape(raw?.p || {});
    /* Drop empties rather than storing {"sku":""} and counting it later. */
    for (const k of Object.keys(props)) if (props[k] === '' || props[k] === null) delete props[k];
    return [{
      session, name, props,
      path: str(raw?.u, 120) || null,
      ref_host: referrer,
      country: geo.country || null,
      region: geo.region || null,
      device
    }];
  });
  if (!rows.length) return done();

  try {
    const res = await fetch(`${SB()}/rest/v1/site_events`, {
      method: 'POST',
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`,
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows)
    });
    /* A measurement failure must never become a visitor's problem, so nothing
       here is reported back to the page. */
    if (!res.ok) console.error('collect: insert failed', res.status, await res.text());
  } catch (e) {
    console.error('collect: ' + (e.message || e));
  }
  return done();
};

/* exported for the tests */
exports.EVENTS = EVENTS;
exports.refHost = refHost;
