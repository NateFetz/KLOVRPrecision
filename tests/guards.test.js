/* The build's refusals.
 *
 * Several things in this repo are true only because the build stops when they
 * stop being true: policy drafts do not get published as final, measurement
 * does not get switched on while the privacy page says it is off, and a
 * half-known address does not become structured data. Those guards are load
 * bearing, and a guard nobody tests is a guard that quietly stops working.
 *
 * Each case builds a doctored copy of the source into a throwaway directory.
 * site/ and dist/ are never touched.
 *
 * Run: node tests/guards.test.js
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail ? '  ' + String(detail).slice(0, 140) : '')); fail++; }
};

/* Build `mutate(source)` with `env`, and report what happened. */
function build(mutate, env = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klovr-guard-'));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(site, { recursive: true });
  /* Symlinked: the AVIF guard wants the real photos and copying 11MB per case
     would make this suite crawl. */
  fs.symlinkSync(path.join(ROOT, 'site', 'web'), path.join(site, 'web'), 'dir');
  fs.writeFileSync(path.join(site, 'index.html'),
    mutate(fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8')));
  fs.copyFileSync(path.join(ROOT, 'site/admin.html'), path.join(site, 'admin.html'));

  const out = path.join(tmp, 'dist');
  try {
    const stdout = execFileSync('node', ['build.js'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, BUILD_SRC: path.join(site, 'index.html'), BUILD_OUT: out, ...env } });
    return { built: true, stdout, read: p => fs.readFileSync(path.join(out, p), 'utf8'),
             exists: p => fs.existsSync(path.join(out, p)) };
  } catch (e) {
    return { built: false, error: (e.stderr || '') + (e.stdout || '') };
  }
}

const same = s => s;
/* Settle every blank the way the shop eventually will. */
const resolveMarkers = s => s.replace(/<span class="tbd">[^<]*<\/span>/g, 'the agreed wording');

console.log('\npolicy drafts');
{
  const r = build(same, { POLICIES_FINAL: '1' });
  ok('a blank left in a policy page stops POLICIES_FINAL', !r.built && /unresolved marker/.test(r.error), r.error);
  ok('and the message names the file and the search to run',
    !r.built && /site\/index\.html/.test(r.error) && /class="tbd"/.test(r.error));
}
{
  const r = build(resolveMarkers, { POLICIES_FINAL: '1' });
  ok('with every blank settled it builds', r.built, r.error);
  if (r.built) {
    const w = r.read('warranty/index.html');
    /* Specifically a policy draft notice. The calendar has a box that looks the
       same and is governed by BIZ.calendarConfirmed instead, so matching the
       class alone counted that one as a survivor. */
    ok('the draft notice is gone', !/<div class="draftbox" data-draft>/.test(w));
    ok('the page is no longer noindex', !/name="robots" content="noindex"/.test(w));
    ok('and it reaches the sitemap', /\/warranty</.test(r.read('sitemap.xml')));
    ok('all five policy pages are indexable',
      ['transfers', 'shipping-returns', 'terms', 'privacy'].every(
        p => !/name="robots" content="noindex"/.test(r.read(p + '/index.html'))));
    ok('the cart is still noindex — it was never a policy page',
      /name="robots" content="noindex"/.test(r.read('cart/index.html')));
  }
}
{
  /* Markers settled but the notices already deleted by hand: the flag has
     nothing left to strip, which means somebody has edited around it. */
  const r = build(s => resolveMarkers(s).replace(/<div class="draftbox" data-draft>[\s\S]*?<\/div>/g, ''),
    { POLICIES_FINAL: '1' });
  ok('notices already stripped by hand is caught', !r.built && /no draft notices/.test(r.error), r.error);
}
{
  const r = build(same);
  ok('without the flag the drafts build and stay out of the index',
    r.built && /name="robots" content="noindex"/.test(r.read('terms/index.html')));
  ok('and stay out of the sitemap', r.built && !/\/terms</.test(r.read('sitemap.xml')));
}

console.log('\nmeasurement and the privacy page');
{
  const r = build(same, { PLAUSIBLE_DOMAIN: 'klovrprecision.com' });
  ok('a third-party tracker cannot be switched on while the page denies one',
    !r.built && /third-party analytics/.test(r.error), r.error);
}
{
  const r = build(s => s.replace('id="pr-measure"', 'id="pr-gone"'),
    { SUPABASE_URL: 'https://example.supabase.co' });
  ok('collection cannot be switched on with no section describing it',
    !r.built && /no section describing it/.test(r.error), r.error);
  ok('and the message says how to opt out instead', !r.built && /ANALYTICS=off/.test(r.error));
}
{
  const r = build(same, { SUPABASE_URL: 'https://example.supabase.co' });
  ok('with the section present it builds', r.built, r.error);
  ok('and the page is told to collect', r.built && /const COLLECT='1'==='1'/.test(r.read('index.html')));
}
{
  const r = build(same, { SUPABASE_URL: 'https://example.supabase.co', ANALYTICS: 'off' });
  ok('ANALYTICS=off turns it back off', r.built && /const COLLECT='0'==='1'/.test(r.read('index.html')));
}

console.log('\nthe business facts');
{
  /* Set one field and blank another, so this makes a partial address whether
     or not the real one has been filled in yet. */
  const r = build(s => s.replace(/ street:[^,]*,/, " street:'1 Test St',")
                        .replace(/ postal:[^,]*,/, ' postal:null,'));
  ok('half an address stops the build', !r.built && /partial address/.test(r.error), r.error);
}
{
  const r = build(same);
  ok('none of it known is fine, and claims nothing',
    r.built && !/"@type":"Store"/.test(r.read('index.html')));
}

console.log('\nphotos');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klovr-guard-'));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'web'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'site/web'))) {
    if (f.endsWith('.avif')) continue;                       /* the one left undone */
    fs.symlinkSync(path.join(ROOT, 'site/web', f), path.join(site, 'web', f));
  }
  fs.copyFileSync(path.join(ROOT, 'site/index.html'), path.join(site, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'site/admin.html'), path.join(site, 'admin.html'));
  let err = '';
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, BUILD_SRC: path.join(site, 'index.html'), BUILD_OUT: path.join(tmp, 'dist') } });
  } catch (e) { err = (e.stderr || '') + (e.stdout || ''); }
  ok('a photo added without encoding it stops the build', /AVIF rendition\(s\) missing/.test(err), err);
}

console.log('\nthe build itself');
{
  const r = build(same);
  ok('a clean build says what it did', r.built && /built \d+ routes/.test(r.stdout));
  ok('and reports how much it is willing to claim about the shop',
    r.built && /local search: Organization only/.test(r.stdout), r.stdout);
  ok('and that measurement is off', r.built && /measurement: off/.test(r.stdout));
}

console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
process.exitCode = fail ? 1 : 0;
