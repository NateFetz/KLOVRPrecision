/* Telling people the order arrived.
 *
 * An order that lands in a table nobody opened is the same as no order, so the
 * two things worth holding down are that the emails carry what somebody needs
 * to act, and that a failure to send is recorded rather than swallowed. The
 * order itself is already committed by then — email must never be able to
 * lose one.
 *
 * Run: node tests/order-notify.test.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const mail = require(path.join(ROOT, 'netlify/functions/lib/mail.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail !== undefined ? '  ' + String(detail).slice(0, 160) : '')); fail++; }
};

const SITE = 'https://klovrprecision.com';

const doorOrder = {
  reference: 'KP-1059', customer_name: 'Dale Hatch', customer_email: 'dale@example.com',
  customer_phone: '(435) 555-0142', destination: 'door',
  ship_address: { line1: '18 Canyon Rd', city: 'Salina', state: 'UT', zip: '84654' },
  ffl: null, subtotal_cents: 172_900, items: 2,
  lines: [{ sku: 'chs-bronze', name: 'KLOVR Chassis — Burnt Bronze', qty: 1, unit_price_cents: 115_000 },
          { sku: 'rings-34', name: '34 mm rings', qty: 1, unit_price_cents: 57_900 }]
};

const fflOrder = {
  ...doorOrder, reference: 'KP-1060', destination: 'ffl', ship_address: null,
  ffl: { business_name: 'Canyon Arms', address1: '9 Main St', city: 'Richfield',
         state: 'UT', zip: '84701', licence: '5-87-041-07-2C-01234' },
  subtotal_cents: 139_500, items: 1,
  lines: [{ sku: 'act-short', name: 'KLOVR Short Action', qty: 1, unit_price_cents: 139_500 }]
};

console.log('\nthe shop\'s copy');
{
  const m = mail.shopEmail(fflOrder, SITE);
  ok('the subject leads with the reference', m.subject.startsWith('KP-1060'), m.subject);
  ok('and says where it is going', /to a dealer/.test(m.subject), m.subject);
  ok('the customer is reachable', m.text.includes('dale@example.com') && m.text.includes('(435) 555-0142'));
  ok('reply goes to the customer, not into a void', m.replyTo === 'dale@example.com');
  ok('the dealer is named with its licence',
    m.text.includes('Canyon Arms') && m.text.includes('5-87-041-07-2C-01234'));
  ok('every line item is listed with its quantity', m.text.includes('1 × KLOVR Short Action'));
  ok('the subtotal is money, not cents', m.text.includes('$1,395.00'), m.text.match(/\$[\d,.]+/g));
  ok('it says no payment was taken', /No payment has been taken/.test(m.text));
  ok('a firearm order says to check the licence', /licence is current/.test(m.text));
  ok('and links straight to the staff area', m.text.includes(SITE + '/admin'));

  const d = mail.shopEmail(doorOrder, SITE);
  ok('a direct order says to the door instead', /to the door/.test(d.subject), d.subject);
  ok('and carries the shipping address', d.text.includes('18 Canyon Rd') && d.text.includes('Salina, UT, 84654'));
  ok('with no licence check it does not need', !/licence is current/.test(d.text));
  ok('the item count is pluralised', /2 items/.test(d.subject), d.subject);
  const one = mail.shopEmail(fflOrder, SITE).subject;
  ok('and not when there is one', /\b1 item\b/.test(one) && !/items/.test(one), one);
}

console.log('\nthe customer\'s copy');
{
  const m = mail.customerEmail(fflOrder, SITE);
  ok('the subject is findable in three weeks', m.subject.includes('KP-1060'), m.subject);
  ok('the reference is in the body too', m.text.includes('KP-1060'));
  ok('it lists what they ordered', m.text.includes('KLOVR Short Action'));
  ok('it states plainly that nothing was charged', /Nothing has been charged/.test(m.text));
  ok('a firearm order explains the dealer and the 4473',
    /Form 4473/.test(m.text) && /never to a home address/.test(m.text));
  ok('and names the dealer it is going to', m.text.includes('Canyon Arms'));

  const d = mail.customerEmail(doorOrder, SITE);
  ok('a direct order does not mention a dealer', !/4473/.test(d.text));
  ok('and gives the address it is shipping to', d.text.includes('18 Canyon Rd'));
  ok('neither copy invents a tracking promise', !/tracking/i.test(d.text) && !/ship(s|ped) on/.test(d.text));
}

console.log('\ncustomer-typed text cannot become markup');
{
  const hostile = { ...doorOrder, customer_name: '<img src=x onerror="alert(1)">Dale',
                    lines: [{ ...doorOrder.lines[0], name: '<script>alert(2)</script>Chassis' }] };
  const m = mail.shopEmail(hostile, SITE);
  ok('a script tag in the name is escaped in the HTML part',
    !/<img src=x/.test(m.html) && m.html.includes('&lt;img src=x'), m.html.match(/.{0,40}img src.{0,20}/));
  ok('and in a product name', !/<script>alert\(2\)/.test(m.html));
  ok('the plain-text part is unchanged, as it should be', m.text.includes('<img src=x'));
}

console.log('\nmoney');
{
  ok('cents become dollars', mail.money(139_500) === '$1,395.00', mail.money(139_500));
  ok('and keep both decimal places', mail.money(4_150) === '$41.50', mail.money(4_150));
  ok('zero is zero', mail.money(0) === '$0.00', mail.money(0));
}

console.log('\nunconfigured is a state, not a crash');
{
  delete process.env.MAIL_FROM; delete process.env.RESEND_API_KEY;
  ok('configured() says so', mail.configured() === false);
  mail.send({ to: 'a@b.com', subject: 's', text: 't' }).then(r => {
    ok('send reports why rather than throwing', r.ok === false && /not configured/.test(r.error), r);
    run();
  });
}

/* ---------------------------------------------------------------- the flow */
async function run() {
  console.log('\nthe whole path, with the network stubbed');

  const realFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://db.example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  process.env.ORDER_NOTIFY_TO = 'shop@klovrprecision.com';
  process.env.MAIL_FROM = 'orders@klovrprecision.com';
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.URL = SITE;

  function stub({ mailStatus = 200 } = {}) {
    const seen = { sent: [], marked: [] };
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (u.includes('/rpc/create_order'))
        return { ok: true, text: async () => JSON.stringify({ reference: 'KP-1060', subtotal_cents: 139_500, items: 1 }) };
      if (u.includes('/rest/v1/orders?reference='))
        return { ok: true, json: async () => [{
          reference: 'KP-1060', customer_name: 'Dale Hatch', customer_email: 'dale@example.com',
          customer_phone: null, destination: 'ffl', ship_address: null, subtotal_cents: 139_500,
          order_lines: [{ sku: 'act-short', name: 'KLOVR Short Action', qty: 1, unit_price_cents: 139_500 }],
          ffl_dealers: { business_name: 'Canyon Arms', address1: '9 Main St', city: 'Richfield',
                         state: 'UT', zip: '84701', licence: '5-87-041-07-2C-01234' } }] };
      if (u.includes('/rpc/mark_order_notified')) { seen.marked.push(body); return { ok: true, text: async () => '' }; }
      if (u.includes('api.resend.com')) {
        seen.sent.push(body);
        return { ok: mailStatus === 200, status: mailStatus, text: async () => 'rejected' };
      }
      throw new Error('unexpected call: ' + u);
    };
    return seen;
  }

  const order = () => require(path.join(ROOT, 'netlify/functions/create-order.js')).handler({
    httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.' + Math.floor(Math.random() * 250) },
    body: JSON.stringify({ customer_name: 'Dale Hatch', customer_email: 'dale@example.com',
      destination: 'ffl', ffl: { licence: '5-87-041-07-2C-01234', business_name: 'Canyon Arms' },
      lines: [{ sku: 'act-short', qty: 1 }] })
  });

  {
    const seen = stub();
    const res = await order();
    ok('the order still succeeds', res.statusCode === 200, res.body);
    ok('two emails go out', seen.sent.length === 2, seen.sent.length);
    ok('one to the shop', seen.sent.some(m => m.to[0] === 'shop@klovrprecision.com'));
    ok('one to the customer', seen.sent.some(m => m.to[0] === 'dale@example.com'));
    ok('both from the configured address', seen.sent.every(m => m.from === 'orders@klovrprecision.com'));
    ok('the row is marked notified with no error',
      seen.marked.length === 1 && seen.marked[0].p_error === null, seen.marked);
    ok('the prices came from the database, not the browser',
      seen.sent[0].text.includes('$1,395.00'), seen.sent[0].text.match(/\$[\d,.]+/g));
  }

  {
    const seen = stub({ mailStatus: 422 });
    const res = await order();
    ok('a mail failure does not fail the order', res.statusCode === 200, res.body);
    ok('the reference still reaches the customer\'s screen', JSON.parse(res.body).reference === 'KP-1060');
    ok('and the row records why nobody was told',
      seen.marked.length === 1 && /422/.test(seen.marked[0].p_error || ''), seen.marked);
    ok('naming both halves that failed',
      /shop:/.test(seen.marked[0].p_error) && /customer:/.test(seen.marked[0].p_error), seen.marked[0].p_error);
  }

  {
    delete process.env.ORDER_NOTIFY_TO;
    const seen = stub();
    await order();
    ok('with no shop address set, that is recorded as the problem',
      /ORDER_NOTIFY_TO is not set/.test(seen.marked[0].p_error || ''), seen.marked[0]);
    ok('and the customer is still told', seen.sent.length === 1 && seen.sent[0].to[0] === 'dale@example.com');
    process.env.ORDER_NOTIFY_TO = 'shop@klovrprecision.com';
  }

  global.fetch = realFetch;
  console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
  process.exitCode = fail ? 1 : 0;
}
