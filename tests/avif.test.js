/* Every photo ships as AVIF and as JPEG, and the JPEG is what saves a browser
 * that cannot decode AVIF. The failure mode that matters is a <picture> whose
 * <source> points at a file that is not there: format fallback is decided by
 * what the browser supports, not by whether the fetch succeeded, so a missing
 * AVIF shows the visitor nothing at all rather than the JPEG.
 *
 * So this checks the invariant the build leans on (a .avif beside every .jpg),
 * that the files are real AVIFs of the right size, that the markup pairs them
 * correctly, and that a missing rendition stops the build.
 *
 * Run: node tests/avif.test.js
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRCDIR = path.join(ROOT, 'site', 'web');
const DIST = path.join(ROOT, 'dist');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); fail++; }
};

/* ---------- the renditions themselves ---------- */
console.log('\nrenditions');
const jpegs = fs.readdirSync(SRCDIR).filter(f => f.endsWith('.jpg')).sort();
ok('there are photos to check', jpegs.length > 0, String(jpegs.length));

const orphans = jpegs.filter(j => !fs.existsSync(path.join(SRCDIR, j.replace(/\.jpg$/, '.avif'))));
ok(`every one of the ${jpegs.length} JPEGs has an AVIF beside it`, !orphans.length, orphans.join(', '));

/* ftyp box with the avif brand — catches a truncated or mislabelled file. */
const notAvif = [];
for (const j of jpegs) {
  const f = path.join(SRCDIR, j.replace(/\.jpg$/, '.avif'));
  if (!fs.existsSync(f)) continue;
  const head = Buffer.alloc(12);
  const fd = fs.openSync(f, 'r'); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
  if (head.slice(4, 8).toString() !== 'ftyp' || head.slice(8, 12).toString() !== 'avif') notAvif.push(j);
}
ok('all of them are actually AVIF', !notAvif.length, notAvif.join(', '));

const bigger = jpegs.filter(j => {
  const a = path.join(SRCDIR, j.replace(/\.jpg$/, '.avif'));
  return fs.existsSync(a) && fs.statSync(a).size >= fs.statSync(path.join(SRCDIR, j)).size;
});
ok('none of them is larger than its JPEG', !bigger.length, bigger.join(', '));

/* Same pixels, or the <picture> would swap dimensions under the reader. This
   one needs sips, so on a Linux CI runner it says so rather than failing. */
const sample = ['hero-rifle.jpg', 'hero-rifle-sm.jpg', 'hero-rifle-xl.jpg',
                'p-action-short.jpg', 'gal-1-xl.jpg', 'cfg-stage-sm.jpg'].filter(f => jpegs.includes(f));
if (process.platform === 'darwin') {
  const dims = f => execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path.join(SRCDIR, f)],
    { encoding: 'utf8' }).match(/\d+/g).slice(-2).join('x');
  const mismatched = sample.filter(j => dims(j) !== dims(j.replace(/\.jpg$/, '.avif')));
  ok(`${sample.length} sampled pairs have identical dimensions`, !mismatched.length, mismatched.join(', '));
} else {
  console.log('  – dimension check skipped (needs macOS sips)');
}

/* ---------- the markup ---------- */
console.log('\nbuilt markup');
const home = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

ok('picture is display:contents, so it cannot become a layout box',
  /picture\{display:contents\}/.test(home));

/* Pair up every static <picture> and check the AVIF list mirrors the JPEG one. */
const pairs = [...home.matchAll(
  /<picture><source type="image\/avif" srcset="([^"]*)"(?: sizes="([^"]*)")?>(<img\b[^>]*>)<\/picture>/g)];
ok('the static photos are wrapped', pairs.length >= 6, String(pairs.length));

const widths = list => list.split(',').map(x => x.trim().split(/\s+/)[1] || '').join(',');
const files  = list => list.split(',').map(x => x.trim().split(/\s+/)[0]);
let drift = [], missing = [], sizesDrift = [];
for (const [, avifList, srcSizes, imgTag] of pairs) {
  const ss = imgTag.match(/srcset="([^"]*)"/);
  const jpegList = ss ? ss[1] : imgTag.match(/src="([^"]*)"/)[1];
  if (widths(avifList) !== widths(jpegList)) drift.push(files(avifList)[0]);
  const imgSizes = imgTag.match(/sizes="([^"]*)"/);
  if ((imgSizes ? imgSizes[1] : undefined) !== srcSizes) sizesDrift.push(files(avifList)[0]);
  for (const f of files(avifList)) if (!fs.existsSync(path.join(DIST, f))) missing.push(f);
  for (const f of files(jpegList)) if (!fs.existsSync(path.join(DIST, f))) missing.push(f);
}
ok('each AVIF srcset carries the same widths as its JPEG srcset', !drift.length, drift.join(', '));
ok('sizes is on the source as well as the img', !sizesDrift.length, sizesDrift.join(', '));
ok('every file either list names exists in dist', !missing.length, [...new Set(missing)].join(', '));

const loose = [...home.matchAll(/<img\b[^>]*src="(web\/[^"]*\.jpg)"[^>]*>/g)]
  .filter(m => !home.slice(Math.max(0, m.index - 260), m.index).includes('type="image/avif"'))
  .map(m => m[1]);
ok('no static photo is left outside a picture', !loose.length, loose.join(', '));

/* ---------- the helper the page uses at runtime ---------- */
console.log('\npic() helper');
const pageSrc = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
const helper = pageSrc.match(/const inRepo=[\s\S]*?\n\}/)[0];
const { pic, avifOf, inRepo } = new Function(helper + '; return { pic, avifOf, inRepo };')();

ok('a srcset tag gets a matching avif source',
  pic('<img src="web/a.jpg" srcset="web/a-sm.jpg 700w, web/a.jpg 1800w" sizes="50vw" alt="x">')
  === '<picture><source type="image/avif" srcset="web/a-sm.avif 700w, web/a.avif 1800w" sizes="50vw">'
    + '<img src="web/a.jpg" srcset="web/a-sm.jpg 700w, web/a.jpg 1800w" sizes="50vw" alt="x"></picture>');

ok('a single-src tag works too',
  pic('<img src="web/b-sm.jpg" alt="">')
  === '<picture><source type="image/avif" srcset="web/b-sm.avif"><img src="web/b-sm.jpg" alt=""></picture>');

ok('a tag with no jpeg is left alone',
  pic('<img src="web/logo-klovr.png" alt="">') === '<img src="web/logo-klovr.png" alt="">');

ok('an srcless tag is left alone', pic('<img id="lboxImg" alt="">') === '<img id="lboxImg" alt="">');

ok('avifOf only touches the extension',
  avifOf('web/p-jpg-thing-sm.jpg 700w, web/p-jpg-thing.jpg 1800w')
  === 'web/p-jpg-thing-sm.avif 700w, web/p-jpg-thing.avif 1800w');

/* A product photograph uploaded through /admin lives in Supabase Storage, where
   nothing made an AVIF for it. Rewriting the extension would point <source> at
   a file that is not there — and <picture> picks by format support, not by
   whether the fetch worked, so an AVIF-capable browser would show nothing. */
console.log('\nphotos that live outside the repo');
ok('a Storage URL is not rewritten',
  avifOf('https://x.supabase.co/storage/v1/object/public/product-photos/a/b.jpg')
  === 'https://x.supabase.co/storage/v1/object/public/product-photos/a/b.jpg');
ok('and is left as a plain img, not a picture',
  pic('<img src="https://x.supabase.co/storage/v1/object/public/product-photos/a/b.jpg" alt="">')
  === '<img src="https://x.supabase.co/storage/v1/object/public/product-photos/a/b.jpg" alt="">');
ok('a repo path in the same srcset still converts',
  avifOf('web/a-sm.jpg 700w, web/a.jpg 1800w') === 'web/a-sm.avif 700w, web/a.avif 1800w');
ok('inRepo tells them apart',
  inRepo('web/a.jpg') === true && inRepo('https://x.supabase.co/a.jpg') === false);

/* ---------- the guard ---------- */
console.log('\nguard');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klovr-avif-'));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'web'), { recursive: true });   /* deliberately empty */
  fs.copyFileSync(path.join(ROOT, 'site/index.html'), path.join(site, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'site/admin.html'), path.join(site, 'admin.html'));
  let err = '';
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, BUILD_SRC: path.join(site, 'index.html'), BUILD_OUT: path.join(tmp, 'dist') } });
  } catch (e) { err = (e.stderr || '') + (e.stdout || ''); }
  ok('a missing AVIF stops the build', /AVIF rendition\(s\) missing/.test(err), err.slice(0, 90));
  ok('and says how to fix it', /scripts\/make-avif\.js/.test(err));
}

console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
process.exitCode = fail ? 1 : 0;
