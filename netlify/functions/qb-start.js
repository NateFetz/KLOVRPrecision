/* Kicks off the QuickBooks OAuth handshake. Staff hit this from /admin. */
const { makeState, INTUIT_AUTH } = require('./lib/qb');

exports.handler = async () => {
  for (const k of ['QB_CLIENT_ID', 'QB_REDIRECT_URI']) {
    if (!process.env[k]) return { statusCode: 500, body: `${k} is not configured` };
  }
  const url = `${INTUIT_AUTH}?` + new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QB_REDIRECT_URI,
    state: makeState()
  });
  return { statusCode: 302, headers: { Location: url } };
};
