/* Find licensed dealers near a ZIP.
 *
 * Public — checkout needs it before anyone signs in. Uses the anon key against
 * find_ffls(), a security-definer function that returns only the columns a
 * customer needs. The ffl_dealers table itself stays staff-only.
 *
 * The directory comes from the ATF listing of active FFLs, imported by
 * scripts/import-ffl-list.js. Nothing here contacts ATF; eZ Check has no API.
 */
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body) });

exports.handler = async (event) => {
  const zip   = String((event.queryStringParameters || {}).zip || '').replace(/\D/g, '').slice(0, 5);
  const state = String((event.queryStringParameters || {}).state || '').toUpperCase().slice(0, 2) || null;
  if (zip.length !== 5) return json(400, { error: 'A five digit ZIP code is needed.' });
  if (!process.env.SUPABASE_URL) return json(503, { error: 'Dealer search is not configured yet.' });

  try {
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/rest/v1/rpc/find_ffls`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY,
                 Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_zip: zip, p_state: state, p_limit: 12 })
    });
    if (!res.ok) { console.error('find_ffls:', await res.text()); return json(500, { error: 'Dealer search failed.' }); }
    const rows = await res.json();
    return json(200, {
      dealers: rows.map(d => ({
        licence: d.licence, name: d.business_name, address1: d.address1,
        city: d.city, state: d.state, zip: d.zip, phone: d.phone,
        expires: d.expires_on, near: d.proximity
      }))
    });
  } catch (e) {
    console.error('ffl-search:', e);
    return json(500, { error: 'Dealer search failed.' });
  }
};
