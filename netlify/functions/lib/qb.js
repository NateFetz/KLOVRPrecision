/* Shared QuickBooks + Supabase helpers.
   No dependencies: Supabase is reached over PostgREST with fetch, which keeps
   cold starts fast and the bundle empty.

   SUPABASE_SERVICE_KEY bypasses row level security and must only ever be read
   here, on the server. It must never be sent to a browser. */
const SB   = () => process.env.SUPABASE_URL.replace(/\/$/, '');
const KEY  = () => process.env.SUPABASE_SERVICE_KEY;
const INTUIT_AUTH  = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const apiBase = () => process.env.QB_ENV === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

async function sb(path, init = {}) {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY(),
      Authorization: `Bearer ${KEY()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const log = (message, level = 'info') =>
  sb('qb_sync_log', { method: 'POST', body: JSON.stringify({ message, level }) }).catch(() => {});

const getConnection = async () => (await sb('qb_connection?id=eq.true&select=*'))[0] || null;
const saveConnection = (patch) =>
  sb('qb_connection?id=eq.true', { method: 'PATCH', body: JSON.stringify(patch) });

/* Access tokens last an hour; refresh tokens roll on every use and must be
   written back, or the connection dies quietly a few days later. */
async function accessToken() {
  const c = await getConnection();
  if (!c || !c.refresh_token) throw new Error('QuickBooks is not connected');
  if (c.access_token && c.expires_at && new Date(c.expires_at) > new Date(Date.now() + 60_000)) {
    return { token: c.access_token, realm: c.realm_id };
  }
  const basic = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(INTUIT_TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token })
  });
  if (!res.ok) {
    await log(`Token refresh failed: ${res.status}`, 'error');
    throw new Error('QuickBooks token refresh failed — reconnect required');
  }
  const t = await res.json();
  await saveConnection({
    access_token: t.access_token,
    refresh_token: t.refresh_token,          // rolls each time; must be persisted
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString()
  });
  return { token: t.access_token, realm: c.realm_id };
}

async function qbFetch(path, init = {}) {
  const { token, realm } = await accessToken();
  const res = await fetch(`${apiBase()}/v3/company/${realm}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
               'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`quickbooks ${res.status}: ${await res.text()}`);
  return res.json();
}

/* Stateless CSRF state for the OAuth round trip, signed with a server secret. */
const crypto = require('crypto');
const sign = (v) => crypto.createHmac('sha256', process.env.QB_STATE_SECRET || KEY()).update(v).digest('hex').slice(0, 32);
const makeState = () => { const n = `${Date.now()}.${crypto.randomBytes(8).toString('hex')}`; return `${n}.${sign(n)}`; };
function checkState(state) {
  if (!state) return false;
  const i = state.lastIndexOf('.');
  const nonce = state.slice(0, i), mac = state.slice(i + 1);
  if (sign(nonce) !== mac) return false;
  return Date.now() - Number(nonce.split('.')[0]) < 10 * 60 * 1000;   // 10 minutes
}

module.exports = { sb, log, getConnection, saveConnection, qbFetch, makeState, checkState, INTUIT_AUTH, INTUIT_TOKEN };
