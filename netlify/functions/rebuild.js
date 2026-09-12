/* Publish: rebuild the storefront so catalogue edits go live.
 *
 * The Netlify build hook URL is a bearer credential — anyone holding it can
 * trigger builds — so it stays in the environment and is only reached through
 * here, behind a staff check. It is never sent to a browser.
 */
const SB = () => process.env.SUPABASE_URL.replace(/\/$/, '');

async function staffFrom(event) {
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const who = await fetch(`${SB()}/auth/v1/user`,
    { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: auth } });
  if (!who.ok) return null;
  const user = await who.json();
  const res = await fetch(`${SB()}/rest/v1/staff?id=eq.${user.id}&select=email,role`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY,
               Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } });
  const rows = await res.json();
  return rows.length ? rows[0] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  if (!process.env.NETLIFY_BUILD_HOOK)
    return { statusCode: 503, body: 'No build hook configured. Add NETLIFY_BUILD_HOOK.' };

  const staff = await staffFrom(event);
  if (!staff) return { statusCode: 401, body: 'Staff sign-in required' };

  const hook = await fetch(process.env.NETLIFY_BUILD_HOOK, { method: 'POST' });
  if (!hook.ok) return { statusCode: 502, body: `Netlify refused the build: ${hook.status}` };

  const at = new Date().toISOString();
  await fetch(`${SB()}/rest/v1/site_meta?id=eq.true`, {
    method: 'PATCH',
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY,
               Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ last_published_at: at, last_published_by: staff.email })
  }).catch(() => {});

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ started: true, at }) };
};
