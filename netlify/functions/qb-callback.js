/* Intuit redirects here with a code. Exchange it for tokens and store them in
   Supabase, which is the only place they ever live. */
const { checkState, saveConnection, log, INTUIT_TOKEN } = require('./lib/qb');

exports.handler = async (event) => {
  const { code, realmId, state, error } = event.queryStringParameters || {};
  if (error) return { statusCode: 400, body: `QuickBooks returned: ${error}` };
  if (!checkState(state)) return { statusCode: 400, body: 'Invalid or expired state — start again from /admin.' };
  if (!code || !realmId)  return { statusCode: 400, body: 'Missing code or realmId.' };

  const basic = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(INTUIT_TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: process.env.QB_REDIRECT_URI
    })
  });
  if (!res.ok) {
    await log(`Authorisation exchange failed: ${res.status}`, 'error');
    return { statusCode: 502, body: 'Could not exchange the authorisation code.' };
  }
  const t = await res.json();
  await saveConnection({
    realm_id: realmId,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    connected_at: new Date().toISOString()
  });
  await log(`Connected to QuickBooks company ${realmId}`);
  return { statusCode: 302, headers: { Location: '/admin?qb=connected' } };
};
