/* Writes an AVIF beside every JPEG in site/web.
 *
 * Run: node scripts/make-avif.js          (only what has changed)
 *      node scripts/make-avif.js --force  (everything)
 *      AVIF_Q=45 node scripts/make-avif.js
 *
 * The output is committed, because this uses macOS `sips` and Netlify builds on
 * Linux — there is no encoder there. build.js refuses to build if a JPEG has no
 * AVIF beside it, so adding a photo and forgetting this step fails loudly
 * rather than shipping a broken <picture>.
 *
 * Why AVIF and not WebP: sips can write AVIF and cannot write WebP, and AVIF
 * compresses harder anyway — these photos come out near a fifth of the JPEG.
 * Anything too old to decode it gets the JPEG from the <img> inside <picture>.
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const DIR   = path.join(__dirname, '..', 'site', 'web');
const Q     = process.env.AVIF_Q || '55';
const FORCE = process.argv.includes('--force');

if (process.platform !== 'darwin') {
  console.error('This needs macOS `sips`. On another platform use cavif/avifenc at quality ' + Q + '.');
  process.exit(1);
}

const jpegs = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg')).sort();
if (!jpegs.length) { console.error('no JPEGs in ' + DIR); process.exit(1); }

let made = 0, skipped = 0, jBytes = 0, aBytes = 0, failed = [];

for (const jpg of jpegs) {
  const src = path.join(DIR, jpg);
  const out = path.join(DIR, jpg.replace(/\.jpg$/, '.avif'));
  const jStat = fs.statSync(src);

  /* Rebuild only when the source is newer, so this is quick to re-run. */
  const fresh = !FORCE && fs.existsSync(out) && fs.statSync(out).mtimeMs >= jStat.mtimeMs;
  if (!fresh) {
    try {
      execFileSync('sips', ['-s', 'format', 'avif', '-s', 'formatOptions', Q, src, '--out', out],
        { stdio: 'pipe' });
      made++;
    } catch (e) { failed.push(jpg); continue; }
  } else skipped++;

  if (!fs.existsSync(out)) { failed.push(jpg); continue; }
  jBytes += jStat.size;
  aBytes += fs.statSync(out).size;
}

const kb = n => (n / 1024).toFixed(0).padStart(5) + 'KB';
console.log(`${made} written, ${skipped} already current, quality ${Q}`);
console.log(`jpeg ${kb(jBytes)}  →  avif ${kb(aBytes)}   (${Math.round(aBytes / jBytes * 100)}% of the bytes)`);
if (failed.length) {
  console.error('\nfailed: ' + failed.join(', '));
  process.exit(1);
}
