/* Sending email.
 *
 * One provider, Resend, because a shop needs one that works rather than a
 * choice of five. Swapping it is the `send` function below and nothing else —
 * everything upstream deals in {to, subject, text, html}.
 *
 * Unconfigured is a valid state, not an error: without MAIL_FROM and
 * RESEND_API_KEY this reports what it would have sent to the function log and
 * says so, which is exactly what you want on a preview deploy.
 */

const FROM   = () => process.env.MAIL_FROM || '';
const KEY    = () => process.env.RESEND_API_KEY || '';
const REPLYTO = () => process.env.MAIL_REPLY_TO || process.env.ORDER_NOTIFY_TO || '';

const configured = () => !!(FROM() && KEY());

/* Escape before anything customer-typed goes near the HTML part. A name is
   free text and the shop's own mail client will render it. */
const esc = t => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const money = cents => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function send({ to, subject, text, html, replyTo }) {
  if (!to) return { ok: false, error: 'no recipient' };
  if (!configured()) {
    console.log(`mail: not configured, would have sent "${subject}" to ${to}`);
    return { ok: false, error: 'mail not configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM(), to: [to], subject, text, html,
        reply_to: replyTo || REPLYTO() || undefined
      })
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/* ------------------------------------------------------------------ orders */

const addressLines = o => o.destination === 'ffl'
  ? [o.ffl?.business_name, o.ffl?.address1,
     [o.ffl?.city, o.ffl?.state, o.ffl?.zip].filter(Boolean).join(', '),
     o.ffl?.licence ? 'FFL ' + o.ffl.licence : ''].filter(Boolean)
  : [o.ship_address?.line1,
     [o.ship_address?.city, o.ship_address?.state, o.ship_address?.zip].filter(Boolean).join(', ')]
    .filter(Boolean);

/* The shop's copy. Everything needed to act on it without opening anything. */
function shopEmail(o, site) {
  const where = o.destination === 'ffl' ? 'to a dealer' : 'to the door';
  const lines = o.lines.map(l => `  ${l.qty} × ${l.name} — ${money(l.unit_price_cents * l.qty)}`);
  const text = [
    `${o.reference} — ${o.items} item${o.items === 1 ? '' : 's'}, ${where}`,
    '',
    `${o.customer_name}`,
    `${o.customer_email}${o.customer_phone ? '  ·  ' + o.customer_phone : ''}`,
    '',
    o.destination === 'ffl' ? 'Receiving dealer:' : 'Ship to:',
    ...addressLines(o).map(l => '  ' + l),
    '',
    'Ordered:',
    ...lines,
    `  Subtotal — ${money(o.subtotal_cents)}`,
    '',
    'No payment has been taken. Confirm stock, then arrange payment directly.',
    o.destination === 'ffl' ? 'Confirm the dealer licence is current before anything ships.' : '',
    '',
    `${site}/admin`
  ].filter(l => l !== '').join('\n');

  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
    <p style="font-size:19px;margin:0 0 4px"><b>${esc(o.reference)}</b></p>
    <p style="margin:0 0 18px;color:#555">${o.items} item${o.items === 1 ? '' : 's'} · ${where}</p>
    <p style="margin:0 0 4px"><b>${esc(o.customer_name)}</b></p>
    <p style="margin:0 0 18px"><a href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a>${
      o.customer_phone ? ' · ' + esc(o.customer_phone) : ''}</p>
    <p style="margin:0 0 4px;color:#555">${o.destination === 'ffl' ? 'Receiving dealer' : 'Ship to'}</p>
    <p style="margin:0 0 18px">${addressLines(o).map(esc).join('<br>')}</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px">
      ${o.lines.map(l => `<tr>
        <td style="padding:4px 18px 4px 0">${l.qty} × ${esc(l.name)}</td>
        <td style="padding:4px 0;text-align:right">${money(l.unit_price_cents * l.qty)}</td></tr>`).join('')}
      <tr><td style="padding:8px 18px 0 0;border-top:1px solid #ddd"><b>Subtotal</b></td>
          <td style="padding:8px 0 0;border-top:1px solid #ddd;text-align:right"><b>${money(o.subtotal_cents)}</b></td></tr>
    </table>
    <p style="margin:0 0 6px">No payment has been taken. Confirm stock, then arrange payment directly.</p>
    ${o.destination === 'ffl' ? '<p style="margin:0 0 18px">Confirm the dealer licence is current before anything ships.</p>' : ''}
    <p style="margin:18px 0 0"><a href="${site}/admin">Open in the staff area</a></p>
  </div>`;

  return { subject: `${o.reference} — ${o.items} item${o.items === 1 ? '' : 's'} ${where}`,
           text, html, replyTo: o.customer_email };
}

/* The customer's copy. It has to survive being found again in three weeks, so
   it carries the reference, what they ordered, and what happens next — and it
   does not pretend a payment was taken. */
function customerEmail(o, site) {
  const lines = o.lines.map(l => `  ${l.qty} × ${l.name} — ${money(l.unit_price_cents * l.qty)}`);
  const next = o.destination === 'ffl'
    ? ['Firearms are delivered to the dealer you chose, never to a home address. You will',
       'complete ATF Form 4473 and the background check in person there.']
    : ['Your order ships to the address above.'];

  const text = [
    `Thanks — we have your order.`,
    '',
    `Reference: ${o.reference}`,
    '',
    'You ordered:',
    ...lines,
    `  Subtotal — ${money(o.subtotal_cents)}`,
    '',
    o.destination === 'ffl' ? 'Going to:' : 'Shipping to:',
    ...addressLines(o).map(l => '  ' + l),
    '',
    'Nothing has been charged. We will confirm stock and come back to you to arrange',
    'payment before anything ships.',
    '',
    ...next,
    '',
    'Reply to this email if anything is wrong, and quote the reference above.',
    '',
    'KLOVR Precision',
    site
  ].join('\n');

  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">
    <p style="margin:0 0 18px">Thanks &mdash; we have your order.</p>
    <p style="margin:0 0 18px;font-size:19px">Reference <b>${esc(o.reference)}</b></p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px">
      ${o.lines.map(l => `<tr>
        <td style="padding:4px 18px 4px 0">${l.qty} × ${esc(l.name)}</td>
        <td style="padding:4px 0;text-align:right">${money(l.unit_price_cents * l.qty)}</td></tr>`).join('')}
      <tr><td style="padding:8px 18px 0 0;border-top:1px solid #ddd"><b>Subtotal</b></td>
          <td style="padding:8px 0 0;border-top:1px solid #ddd;text-align:right"><b>${money(o.subtotal_cents)}</b></td></tr>
    </table>
    <p style="margin:0 0 4px;color:#555">${o.destination === 'ffl' ? 'Going to' : 'Shipping to'}</p>
    <p style="margin:0 0 18px">${addressLines(o).map(esc).join('<br>')}</p>
    <p style="margin:0 0 18px"><b>Nothing has been charged.</b> We will confirm stock and come back to
      you to arrange payment before anything ships.</p>
    <p style="margin:0 0 18px">${next.join(' ')}</p>
    <p style="margin:0 0 18px">Reply to this email if anything is wrong, and quote the reference above.</p>
    <p style="margin:0;color:#555">KLOVR Precision<br><a href="${site}">${site.replace(/^https?:\/\//, '')}</a></p>
  </div>`;

  return { subject: `We have your order — ${o.reference}`, text, html };
}

module.exports = { send, configured, shopEmail, customerEmail, esc, money, addressLines };
