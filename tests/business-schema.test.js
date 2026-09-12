/* The business facts have one home — the BIZ block in site/index.html — and
 * everything else is derived from it: the address on the contact page, the
 * phone in the header, the hours table, the social links, and the structured
 * data a search engine reads.
 *
 * What this proves is the gate. While the facts are unknown the build must emit
 * Organization and nothing that claims a place; once they are filled in it must
 * emit Store with the address, the map pin and the hours, and turn the same
 * values into a tel: link and real social hrefs. A half-filled address must
 * fail the build outright.
 *
 * Run: node tests/business-schema.test.js
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); fail++; }
};

/* Build a doctored copy of the source. The real site/ and dist/ are untouched. */
function build(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klovr-biz-'));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'web'), { recursive: true });
  let src = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const block = src.match(/const BIZ=\{[\s\S]*?\n\};/)[0];
  const next = mutate(block);
  /* A function replacer, so a $ in the block is not read as a substitution
     pattern — BIZ.priceRange is literally '$$$'. */
  src = src.replace(block, () => next);
  fs.writeFileSync(path.join(site, 'index.html'), src);
  fs.copyFileSync(path.join(ROOT, 'site/admin.html'), path.join(site, 'admin.html'));

  const out = path.join(tmp, 'dist');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, BUILD_SRC: path.join(site, 'index.html'), BUILD_OUT: out,
             URL: 'https://klovrprecision.com' } });
  } catch (e) {
    return { error: (e.stderr || '') + (e.stdout || '') };
  }
  const read = p => fs.readFileSync(path.join(out, p), 'utf8');
  const ld = p => [...read(p).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
                    .map(m => JSON.parse(m[1]));
  const slot = (p, key) => {
    const m = read(p).match(new RegExp('<[^>]*data-biz="' + key + '"[^>]*>([\\s\\S]*?)</'));
    return m ? m[1] : null;
  };
  return { read, ld, slot };
}

/* ---------- as it stands today: nothing filled in ---------- */
console.log('\nunknown facts — must not claim a place');
{
  const b = build(s => s);
  ok('build succeeds', !b.error, b.error);
  if (!b.error) {
    const org = b.ld('index.html').find(x => x['@id'] && x['@id'].endsWith('#business'));
    ok('emits Organization, not Store', org && org['@type'] === 'Organization', org && org['@type']);
    ok('no address claimed', org && !org.address);
    ok('no opening hours claimed', org && !org.openingHoursSpecification);
    ok('no telephone claimed', org && !org.telephone);
    ok('logo still points at a real file',
      org && org.logo === 'https://klovrprecision.com/web/logo-klovr.png', org && org.logo);
    ok('canonical follows the custom domain',
      b.read('index.html').includes('<link rel="canonical" href="https://klovrprecision.com/">'));
    ok('address slot shows a marker, not a fake street',
      (b.slot('contact/index.html', 'address') || '').includes('class="tbd"'));
    /* (000) 000-0000 is fine inside an input's placeholder — that shows the
       format being asked for. It must not appear as the shop's own number. */
    const fakeNumber = p => b.read(p).replace(/placeholder="\(000\)[^"]*"/g, '').includes('(000)');
    ok('no fake phone number presented as the shop\'s',
      !fakeNumber('index.html') && !fakeNumber('contact/index.html'));
    ok('phone label dropped from the header',
      !b.read('index.html').includes('data-biz="tel-util"'));
    ok('calendar carries no Event schema', b.ld('calendar/index.html').length === 0);
    ok('hours table still renders', (b.slot('contact/index.html', 'hours') || '').includes('<tr>'));
    ok('hours marked unconfirmed',
      (b.slot('contact/index.html', 'hours-note') || '').includes('class="tbd"'));
    ok('socials stay on the not-linked-yet handler',
      b.read('index.html').includes("soon.social('Instagram')"));
  }
}

/* ---------- everything filled in ---------- */
console.log('\nfacts confirmed — must claim the place properly');
{
  const b = build(() => `const BIZ={
 name:'KLOVR Precision', legal:'KLOVR Precision LLC',
 desc:'Test description.', logo:'web/logo-klovr.png',
 street:'145 W 1300 S', city:'Richfield', region:'UT', country:'US', postal:'84701',
 geo:{lat:38.7725,lon:-112.0838},
 tel:'+14355550123', telText:'(435) 555-0123',
 email:'shop@klovrprecision.com', ffl:'5-87-041-07-2C-01234',
 hours:[{d:['Tuesday','Wednesday','Thursday','Friday'],o:'10:00',c:'18:00'},
        {d:['Saturday'],o:'09:00',c:'16:00'}],
 hoursNote:'Closed Sunday and Monday',
 hoursConfirmed:true, calendarConfirmed:true,
 social:{Instagram:'https://instagram.com/klovrprecision',YouTube:null,Facebook:null,X:null},
 priceRange:'$$$'
};`);
  ok('build succeeds', !b.error, b.error);
  if (!b.error) {
    const org = b.ld('index.html').find(x => x['@id'] && x['@id'].endsWith('#business'));
    ok('upgrades to Store', org && org['@type'] === 'Store', org && org['@type']);
    ok('address complete in schema',
      org && org.address.streetAddress === '145 W 1300 S' && org.address.postalCode === '84701'
         && org.address.addressRegion === 'UT');
    ok('map pin present', org && org.geo.latitude === 38.7725 && org.geo.longitude === -112.0838);
    ok('telephone in E.164', org && org.telephone === '+14355550123');
    ok('legal name carried', org && org.legalName === 'KLOVR Precision LLC');
    ok('opening hours emitted for both blocks',
      org && org.openingHoursSpecification.length === 2
          && org.openingHoursSpecification[0].opens === '10:00'
          && org.openingHoursSpecification[0].dayOfWeek.length === 4);
    ok('only the social that exists is claimed',
      org && org.sameAs.length === 1 && org.sameAs[0].includes('instagram'), org && org.sameAs);

    ok('address rendered on the contact page',
      (b.slot('contact/index.html', 'address') || '').includes('145 W 1300 S'));
    ok('phone is a tel: link',
      (b.slot('contact/index.html', 'tel') || '').includes('href="tel:+14355550123"'));
    ok('phone back in the header', b.read('index.html').includes('data-biz="tel-util"'));
    ok('email is a mailto: link',
      (b.slot('contact/index.html', 'email') || '').includes('mailto:shop@klovrprecision.com'));
    ok('FFL number rendered', (b.slot('contact/index.html', 'ffl') || '').includes('5-87-041-07-2C-01234'));
    ok('footer carries the address',
      (b.slot('index.html', 'address-inline') || '').includes('Richfield, UT 84701'));
    ok('footer hours only appear once confirmed',
      (b.slot('index.html', 'hours-inline') || '').includes('10:00'));
    ok('hours-unconfirmed marker gone',
      !(b.slot('contact/index.html', 'hours-note') || '').includes('class="tbd"'));
    ok('Instagram icon became a real link',
      b.read('index.html').includes('href="https://instagram.com/klovrprecision"')
      && b.read('index.html').includes('rel="me noopener"'));
    ok('the unlinked socials keep the honest fallback',
      b.read('index.html').includes("soon.social('YouTube')"));

    /* One script tag holding an array of Event nodes, which is valid JSON-LD. */
    const evs = b.ld('calendar/index.html').flat();
    ok('calendar emits one Event per entry', evs.length >= 4, String(evs.length));
    ok('events are dated and located',
      evs.every(e => e['@type'] === 'Event' && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate) && e.location.name));
    ok('a two-day class keeps its end date',
      evs.some(e => e.endDate && e.endDate !== e.startDate));
    ok('prose prices become numbers',
      evs.every(e => typeof e.offers.price === 'number')
      && evs.some(e => e.offers.price === 40), JSON.stringify(evs.map(e => e.offers.price)));
    ok('a shop event gets the shop address',
      evs.filter(e => /shop/i.test(e.location.name))
         .every(e => e.location.address.streetAddress === '145 W 1300 S'));
  }
}

/* ---------- the guards ---------- */
console.log('\nguards');
{
  const partial = build(() => `const BIZ={name:'KLOVR Precision',legal:null,desc:'d',logo:'web/logo-klovr.png',
 street:'145 W 1300 S', city:null, region:'UT', country:'US', postal:null, geo:null,
 tel:null,telText:null,email:null,ffl:null,hours:[{d:['Saturday'],o:'09:00',c:'16:00'}],
 hoursNote:null,hoursConfirmed:false,calendarConfirmed:false,
 social:{Instagram:null,YouTube:null,Facebook:null,X:null},priceRange:'$$$'};`);
  ok('a half-filled address fails the build',
    partial.error && /partial address/.test(partial.error), partial.error && partial.error.slice(0, 80));

  const badTel = build(s => s.replace("tel:null,", "tel:'435-555-0123',"));
  ok('a phone number that is not E.164 fails the build',
    badTel.error && /E\.164/.test(badTel.error), badTel.error && badTel.error.slice(0, 80));

  const noText = build(s => s.replace("tel:null,", "tel:'+14355550123',"));
  ok('a phone with no display form fails the build',
    noText.error && /telText/.test(noText.error), noText.error && noText.error.slice(0, 80));

  const badGeo = build(s => s.replace("geo:null,", "geo:{lat:'38.77',lon:null},"));
  ok('a geo pin that is not numeric fails the build',
    badGeo.error && /numeric lat and lon/.test(badGeo.error), badGeo.error && badGeo.error.slice(0, 80));
}

console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
process.exitCode = fail ? 1 : 0;
