/* Order creation.
 *
 * This is a public endpoint, so it assumes the caller is hostile. The browser
 * sends SKUs, quantities, and a destination — it does not send prices, and any
 * price it sends is ignored. Everything is priced and re-validated in Postgres
 * by create_order(), in one transaction, against the live catalogue.
 *
 * SUPABASE_SERVICE_KEY is read here and only here. It bypasses row level
 * security and must never reach a browser.
 */

const mail = require('./lib/mail');

const SB  = () => process.env.SUPABASE_URL.replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_KEY;

const bad  = (msg, code = 400) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' },
                                     body: JSON.stringify({ error: msg }) });
const ok   = (data) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(data) });

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/* Per-instance, so it only catches the clumsy. Real protection needs Netlify's
   edge rate limiting or a shared store. */
const seen = new Map();
function tooFast(ip) {
  const now = Date.now(), hits = (seen.get(ip) || []).filter(t => now - t < 60_000);
  hits.push(now); seen.set(ip, hits);
  if (seen.size > 500) seen.clear();
  return hits.length > 6;
}

/* Postgres raises 'CODE:detail'. Turn that into something a customer can act on
   without telling them anything about the internals. */
function explain(message = '') {
  const raw = message.replace(/^.*?(?=[A-Z_]+(?::|$))/, '');
  const [code, a, b] = raw.split(':');
  switch (code) {
    case 'EMPTY_CART':          return 'Your cart is empty.';
    case 'CART_TOO_LARGE':      return 'That is more items than we can take in one order — please split it.';
    case 'FFL_REQUIRED':        return 'Choose the licensed dealer this order should go to.';
    case 'SHIP_STATE_REQUIRED': return 'A delivery state is needed.';
    case 'UNKNOWN_SKU':         return 'One of the items is no longer in the catalogue. Refresh and try again.';
    case 'NOT_FOR_SALE':        return `${a} is not currently for sale.`;
    case 'NEEDS_DEALER':        return `${a} can only be delivered to a licensed dealer. Pick one to continue.`;
    case 'NOT_PERMITTED':       return `${a} cannot be shipped to ${b}.`;
    case 'OUT_OF_STOCK':        return `${a} is no longer in stock in that quantity.`;
    case 'QTY_TOO_LARGE':       return 'That quantity is too large — call us and we will sort it out.';
    default:                    return null;      // unknown: treat as a server fault
  }
}

/* create_order returns the totals; the names and prices it used are the
   catalogue's, not the browser's, so they are read back rather than trusted
   from the request. */
async function orderForEmail(reference) {
  const res = await fetch(
    `${SB()}/rest/v1/orders?reference=eq.${encodeURIComponent(reference)}` +
    '&select=reference,customer_name,customer_email,customer_phone,destination,ship_address,' +
    'subtotal_cents,order_lines(sku,name,qty,unit_price_cents),ffl_dealers(business_name,address1,city,state,zip,licence)',
    { headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` } });
  if (!res.ok) throw new Error(`read back failed: ${res.status}`);
  const [row] = await res.json();
  if (!row) throw new Error('order vanished between writing and reading it');
  const d = row.ffl_dealers;
  return {
    reference: row.reference,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    customer_phone: row.customer_phone,
    destination: row.destination,
    ship_address: row.ship_address,
    ffl: d ? { business_name: d.business_name, address1: d.address1, city: d.city,
               state: d.state, zip: d.zip, licence: d.licence } : null,
    subtotal_cents: row.subtotal_cents,
    lines: row.order_lines || [],
    items: (row.order_lines || []).reduce((n, l) => n + l.qty, 0)
  };
}

async function markNotified(reference, error) {
  await fetch(`${SB()}/rest/v1/rpc/mark_order_notified`, {
    method: 'POST',
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_reference: reference, p_error: error || null })
  }).catch(e => console.error('mark_order_notified:', e.message || e));
}

/* Both emails, and a row that records whether they went. The shop's copy is
   the one that matters — a customer who gets no confirmation will chase; a
   shop that never hears about the order will not. */
async function notify(reference) {
  const site = (process.env.URL || 'https://klovrprecision.netlify.app').replace(/\/$/, '');
  const to = process.env.ORDER_NOTIFY_TO || '';
  let order;
  try { order = await orderForEmail(reference); }
  catch (e) { await markNotified(reference, 'could not read the order back: ' + (e.message || e)); return; }

  const problems = [];
  if (!to) problems.push('ORDER_NOTIFY_TO is not set, so the shop was not told');
  else {
    const r = await mail.send({ to, ...mail.shopEmail(order, site) });
    if (!r.ok) problems.push('shop: ' + r.error);
  }
  const c = await mail.send({ to: order.customer_email, ...mail.customerEmail(order, site) });
  if (!c.ok) problems.push('customer: ' + c.error);

  await markNotified(reference, problems.length ? problems.join('; ') : null);
  if (problems.length) console.error(`notify ${reference}: ${problems.join('; ')}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return bad('POST only', 405);
  if (!process.env.SUPABASE_URL || !KEY()) return bad('Ordering is not configured yet.', 503);

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
  if (tooFast(ip)) return bad('Too many attempts. Wait a minute and try again.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return bad('Malformed request.'); }

  if (str(body.company, 40)) return ok({ reference: 'ok' });   // honeypot: pretend it worked

  const name  = str(body.customer_name, 120);
  const email = str(body.customer_email, 160).toLowerCase();
  if (!name)           return bad('A name is needed.');
  if (!isEmail(email)) return bad('That email address does not look right.');

  const dest = body.destination === 'ffl' ? 'ffl' : 'door';
  const lines = Array.isArray(body.lines) ? body.lines
    .filter(l => l && typeof l.sku === 'string')
    .slice(0, 40)
    .map(l => ({ sku: str(l.sku, 60), qty: Math.min(99, Math.max(1, parseInt(l.qty, 10) || 1)) }))
    : [];
  if (!lines.length) return bad('Your cart is empty.');

  const payload = {
    customer_name: name,
    customer_email: email,
    customer_phone: str(body.customer_phone, 40) || null,
    destination: dest,
    note: str(body.note, 600) || null,
    lines,
    ship_address: dest === 'door' ? {
      line1: str(body.ship_address?.line1, 160),
      city:  str(body.ship_address?.city, 80),
      state: str(body.ship_address?.state, 2).toUpperCase(),
      zip:   str(body.ship_address?.zip, 12)
    } : null,
    ffl: dest === 'ffl' ? {
      licence:       str(body.ffl?.licence, 40),
      business_name: str(body.ffl?.business_name, 160),
      address1:      str(body.ffl?.address1, 160),
      city:          str(body.ffl?.city, 80),
      state:         str(body.ffl?.state, 2).toUpperCase(),
      zip:           str(body.ffl?.zip, 12)
    } : null
  };

  try {
    const res = await fetch(`${SB()}/rest/v1/rpc/create_order`, {
      method: 'POST',
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload })
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try { const j = JSON.parse(text); detail = j.message || j.error || text; } catch {}
      const friendly = explain(detail);
      if (friendly) return bad(friendly);
      console.error('create_order failed:', detail);        // server log only
      return bad('We could not place that order. Nothing has been charged — please call the shop.', 500);
    }
    const result = JSON.parse(text);

    /* The order is committed. Telling people about it is a separate job that is
       allowed to fail on its own — but not silently, because an order nobody
       has been told about is the same as no order at all. */
    await notify(result.reference).catch(e => console.error('notify:', e));

    return ok({ reference: result.reference, subtotal_cents: result.subtotal_cents, items: result.items });
  } catch (e) {
    console.error('create-order:', e);
    return bad('We could not place that order. Nothing has been charged — please call the shop.', 500);
  }
};
