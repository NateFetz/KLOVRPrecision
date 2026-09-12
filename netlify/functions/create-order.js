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
    return ok({ reference: result.reference, subtotal_cents: result.subtotal_cents, items: result.items });
  } catch (e) {
    console.error('create-order:', e);
    return bad('We could not place that order. Nothing has been charged — please call the shop.', 500);
  }
};
