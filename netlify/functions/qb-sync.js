/* Raise a QuickBooks invoice for one order.
   POST { orderId } with a staff bearer token. */
const { sb, log, qbFetch } = require('./lib/qb');

/* The caller must be a signed-in employee. We verify their token against
   Supabase rather than trusting anything the browser says about itself. */
async function requireStaff(event) {
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: auth }
  });
  if (!res.ok) return null;
  const user = await res.json();
  const rows = await sb(`staff?id=eq.${user.id}&select=id,role`);
  return rows.length ? rows[0] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  const staff = await requireStaff(event);
  if (!staff) return { statusCode: 401, body: 'Staff sign-in required' };

  try {
    const { orderId } = JSON.parse(event.body || '{}');
    const [order] = await sb(`orders?id=eq.${orderId}&select=*,order_lines(*)`);
    if (!order) return { statusCode: 404, body: 'Order not found' };
    if (order.qb_invoice_id) return { statusCode: 200, body: JSON.stringify({ already: order.qb_invoice_no }) };

    const customers = await qbFetch(
      `query?query=${encodeURIComponent(`select * from Customer where PrimaryEmailAddr = '${order.customer_email}'`)}`);
    let customerId = customers?.QueryResponse?.Customer?.[0]?.Id;
    if (!customerId) {
      const made = await qbFetch('customer', { method: 'POST', body: JSON.stringify({
        DisplayName: `${order.customer_name} (${order.customer_email})`,
        PrimaryEmailAddr: { Address: order.customer_email }
      })});
      customerId = made.Customer.Id;
    }

    const invoice = await qbFetch('invoice', { method: 'POST', body: JSON.stringify({
      CustomerRef: { value: customerId },
      DocNumber: order.reference,
      Line: order.order_lines.map(l => ({
        DetailType: 'SalesItemLineDetail',
        Amount: (l.unit_price_cents * l.qty) / 100,
        Description: l.name,
        SalesItemLineDetail: { Qty: l.qty, UnitPrice: l.unit_price_cents / 100 }
      }))
    })});

    await sb(`orders?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({
      qb_invoice_id: invoice.Invoice.Id, qb_invoice_no: invoice.Invoice.DocNumber
    })});
    await log(`Invoice ${invoice.Invoice.DocNumber} raised for ${order.reference}`);
    return { statusCode: 200, body: JSON.stringify({ invoice: invoice.Invoice.DocNumber }) };
  } catch (e) {
    await log(e.message, 'error');
    return { statusCode: 500, body: e.message };
  }
};
