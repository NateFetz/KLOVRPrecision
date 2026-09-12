#!/usr/bin/env node
/* Import the ATF listing of active Federal Firearms Licensees.
 *
 *   node scripts/import-ffl-list.js <file.csv|file.txt> [--dry-run]
 *
 * Get the file from eZ Check (fflezcheck.atf.gov → Download), which ATF makes
 * available to licence holders, or from the monthly state listings on atf.gov.
 * Re-run it monthly; licences expire and dealers close.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY — ffl_dealers is staff-only, so
 * the anon key cannot write to it. Run this locally, never from a browser.
 */
const fs = require('fs');

const [file, ...flags] = process.argv.slice(2);
const DRY = flags.includes('--dry-run');
if (!file) { console.error('usage: node scripts/import-ffl-list.js <file> [--dry-run]'); process.exit(1); }
if (!DRY && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (or pass --dry-run)'); process.exit(1);
}

/* ATF has shipped this file as comma, tab, and pipe separated over the years.
   Sniff rather than assume. */
function splitRows(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  const head = lines[0];
  const delim = [',', '\t', '|'].sort((a, b) =>
    head.split(b).length - head.split(a).length)[0];
  const parse = (line) => {
    if (delim !== ',') return line.split(delim).map(s => s.trim());
    const out = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim()); return out;
  };
  const cols = parse(lines[0]).map(c => c.replace(/^"|"$/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '_'));
  return lines.slice(1).map(l => {
    const v = parse(l), row = {};
    cols.forEach((c, i) => row[c] = (v[i] || '').replace(/^"|"$/g, '').trim());
    return row;
  });
}

const pick = (row, ...names) => { for (const n of names) if (row[n]) return row[n]; return ''; };
const pad = (v, n) => String(v || '').replace(/\D/g, '').padStart(n, '0');

/* The file carries the licence in parts. Reassemble it the way it is printed on
   the licence itself: region-district-county-type-expiry-sequence. */
function licenceNumber(row) {
  const whole = pick(row, 'LICENSE_NUMBER', 'LIC_NUMBER', 'FFL_NUMBER', 'LICENCE');
  if (whole) return whole.trim();
  const parts = [
    pad(pick(row, 'LIC_REGN', 'REGION'), 1),
    pad(pick(row, 'LIC_DIST', 'DISTRICT'), 2),
    pad(pick(row, 'LIC_CNTY', 'COUNTY'), 3),
    pad(pick(row, 'LIC_TYPE', 'TYPE'), 2),
    (pick(row, 'LIC_XPRDTE', 'EXPIRATION') || '').replace(/\D/g, '').slice(0, 2).padStart(2, '0'),
    pad(pick(row, 'LIC_SEQN', 'SEQUENCE'), 5)
  ];
  return parts.every(Boolean) ? parts.join('-') : '';
}

function expiry(row) {
  const raw = pick(row, 'EXPIRATION_DATE', 'LIC_EXPIRE', 'EXPIRES');
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

const TRANSFERABLE = new Set(['01', '02', '07', '08', '09', '10', '11']);

const rows = splitRows(fs.readFileSync(file, 'utf8'));
console.log(`read ${rows.length} rows from ${file}`);

const seen = new Set();
const records = [];
let skippedType = 0, skippedBad = 0;

for (const r of rows) {
  const licence = licenceNumber(r);
  const type = pad(pick(r, 'LIC_TYPE', 'TYPE'), 2);
  if (!licence) { skippedBad++; continue; }
  if (!TRANSFERABLE.has(type)) { skippedType++; continue; }   // 03 collectors, 06 ammo
  if (seen.has(licence)) continue;
  seen.add(licence);
  records.push({
    licence,
    licence_type: type,
    licence_name:  pick(r, 'LICENSE_NAME', 'LICENSEE_NAME') || null,
    business_name: pick(r, 'BUSINESS_NAME', 'TRADE_NAME', 'LICENSE_NAME') || null,
    address1: pick(r, 'PREMISE_STREET', 'PREM_STREET', 'STREET') || null,
    city:     pick(r, 'PREMISE_CITY', 'PREM_CITY', 'CITY') || null,
    state:   (pick(r, 'PREMISE_STATE', 'PREM_STATE', 'STATE') || '').toUpperCase().slice(0, 2) || null,
    zip:     (pick(r, 'PREMISE_ZIP_CODE', 'PREM_ZIP', 'ZIP') || '').replace(/\D/g, '').slice(0, 5) || null,
    phone:    pick(r, 'VOICE_PHONE', 'PHONE') || null,
    expires_on: expiry(r),
    source: 'ATF FFL listing',
    imported_at: new Date().toISOString()
  });
}

console.log(`  ${records.length} transferable licences`);
console.log(`  ${skippedType} skipped (type 03 collector / 06 ammunition — cannot receive a transfer)`);
if (skippedBad) console.log(`  ${skippedBad} skipped (no licence number could be read)`);

if (!records.length) { console.error('\nNothing to import. Check the file has a header row.'); process.exit(1); }

if (DRY) {
  console.log('\n--dry-run, nothing written. First three records:\n');
  console.log(JSON.stringify(records.slice(0, 3), null, 2));
  process.exit(0);
}

(async () => {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const res = await fetch(`${base}/rest/v1/ffl_dealers?on_conflict=licence`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) { console.error(`\nbatch at ${i} failed: ${res.status} ${await res.text()}`); process.exit(1); }
    done += batch.length;
    process.stdout.write(`\r  imported ${done}/${records.length}`);
  }
  console.log('\ndone.');
})();
