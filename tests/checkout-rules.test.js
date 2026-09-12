/* The rules that decide where a thing may go.
 *
 * create-order.test.js proves the server refuses a bad order. This proves the
 * cart refuses it first — which is what the customer actually experiences, and
 * the only reason nobody reaches step four and gets rejected. Two independent
 * checks over the same rules is the point; a change to one must not silently
 * diverge from the other.
 *
 * Nothing is re-implemented here. The predicates and both step gates are read
 * verbatim out of site/index.html and evaluated, so editing a gate changes what
 * this tests, and restructuring one past the anchors fails the run rather than
 * quietly leaving a stale copy behind.
 *
 * Run: node tests/checkout-rules.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); fail++; }
};

/* Pull a fragment out of the page and refuse to continue without it. */
function lift(re, what) {
  const m = src.match(re);
  if (!m) { console.error(`\nCannot find ${what} in site/index.html — it has been renamed or restructured.\n` +
                          'Update this test to match rather than deleting the assertion.\n'); process.exit(1); }
  return m[1] !== undefined ? m[1] : m[0];
}

const SHOP_LITERAL = lift(/const SHOP=\[[\s\S]*?\n\];/, 'the catalogue');
const byId         = lift(/const byId=[^\n]*/, 'byId()');
const linesFn      = lift(/const lines=\(\)=>[^\n]*/, 'lines()');
const needFFL      = lift(/const needFFL=\(\)=>[^\n]*/, 'needFFL()');
const needDoor     = lift(/const needDoor=\(\)=>[^\n]*/, 'needDoor()');
const hasNFA       = lift(/const hasNFA=\(\)=>[^\n]*/, 'hasNFA()');
const blockedFn    = lift(/function blocked\(\)\{[\s\S]*?\n\}/, 'blocked()');

/* Both gates, exactly as the page writes them. */
const GATE2 = lift(/const ok=(\(!needDoor\(\)[^;]*);/, "step 2's continue condition");
const GATE3 = lift(/nav\(true,(\(![\s\S]{0,60}?\))\?"CO\.step=4/, "step 3's continue condition");

const ctx = vm.createContext({});
vm.runInContext([SHOP_LITERAL, byId, linesFn, needFFL, needDoor, hasNFA, blockedFn,
  'var CART=[], CO={};',
  `function gate2(){ return !!(${GATE2}) }`,
  `function gate3(){ const b=blocked(); return !!(${GATE3}) }`,
  'function reset(){ CART=[]; CO={step:1,name:"",email:"",st:"",ffl:null,age:false,truth:false}; }'
].join('\n'), ctx);

const SHOP = vm.runInContext('SHOP', ctx);
const set = (cart, co) => vm.runInContext(
  `reset(); CART=${JSON.stringify(cart)}; Object.assign(CO,${JSON.stringify(co || {})});`, ctx);
const call = fn => vm.runInContext(fn + '()', ctx);

const dealerIn = s => ({ l: '5-00-000-00-0X-00000', n: 'Test Dealer', a: '1 Main', c: 'Town', s, z: '00000' });
const item = id => SHOP.find(i => i.id === id);
const anyFFL   = SHOP.find(i => i.ffl && !i.nfa);
const anyDoor  = SHOP.find(i => !i.ffl && !i.noShip);
const restricted = SHOP.filter(i => Array.isArray(i.noShip) && i.noShip.length);

console.log('\nthe catalogue still has the cases worth testing');
ok('something ships to a door', !!anyDoor, anyDoor && anyDoor.id);
ok('something needs a dealer', !!anyFFL, anyFFL && anyFFL.id);
ok('something is restricted by state', restricted.length > 0, restricted.map(i => i.id));
ok('something is NFA', SHOP.some(i => i.nfa));

console.log('\nrouting');
{
  set([{ id: anyDoor.id, qty: 1 }]);
  ok('a component alone needs no dealer', call('needFFL') === false && call('needDoor') === true);

  set([{ id: anyFFL.id, qty: 1 }]);
  ok('a firearm alone needs a dealer and no door',
    call('needFFL') === true && call('needDoor') === false);

  set([{ id: anyDoor.id, qty: 1 }, { id: anyFFL.id, qty: 1 }]);
  ok('a mixed cart needs both', call('needFFL') === true && call('needDoor') === true);
}

console.log('\nstep 2 will not let you past without a destination');
{
  set([{ id: anyDoor.id, qty: 1 }]);
  ok('a direct item with no state is blocked', call('gate2') === false);
  set([{ id: anyDoor.id, qty: 1 }], { st: 'UT' });
  ok('and passes once a state is chosen', call('gate2') === true);

  set([{ id: anyFFL.id, qty: 1 }]);
  ok('a firearm with no dealer is blocked', call('gate2') === false);
  set([{ id: anyFFL.id, qty: 1 }], { st: 'UT' });
  ok('a shipping state is not a substitute for a dealer', call('gate2') === false);
  set([{ id: anyFFL.id, qty: 1 }], { ffl: dealerIn('UT') });
  ok('and passes with a dealer', call('gate2') === true);

  set([{ id: anyDoor.id, qty: 1 }, { id: anyFFL.id, qty: 1 }], { st: 'UT' });
  ok('a mixed cart needs the dealer too', call('gate2') === false);
  set([{ id: anyDoor.id, qty: 1 }, { id: anyFFL.id, qty: 1 }], { ffl: dealerIn('UT') });
  ok('a mixed cart needs the address too', call('gate2') === false);
  set([{ id: anyDoor.id, qty: 1 }, { id: anyFFL.id, qty: 1 }], { st: 'UT', ffl: dealerIn('UT') });
  ok('and passes with both', call('gate2') === true);
}

console.log('\nevery restricted item, against every state it may not go to');
{
  let blockedAll = true, allowedAll = true, wrongName = [];
  for (const i of restricted) {
    for (const st of i.noShip) {
      /* Direct items are judged on the ship-to state; firearms on the state the
         dealer is in, because that is where it physically lands. */
      set([{ id: i.id, qty: 1 }], i.ffl ? { ffl: dealerIn(st) } : { st });
      const b = vm.runInContext('blocked()', ctx);
      if (b.length !== 1 || b[0].dest !== st) blockedAll = false;
      if (b.length === 1 && b[0].n !== i.n) wrongName.push(i.id);
      if (call('gate3') !== false) allowedAll = false;
    }
  }
  const combos = restricted.reduce((n, i) => n + i.noShip.length, 0);
  ok(`all ${combos} item/state combinations are refused`, blockedAll);
  ok('and none of them can pass step 3', allowedAll);
  ok('the refusal names the item the customer has to remove', !wrongName.length, wrongName);
}

console.log('\nand not more than that');
{
  const amm = restricted.find(i => !i.ffl) || restricted[0];
  const allowed = ['UT', 'AZ', 'ID', 'WY', 'MT', 'NV'].filter(s => !amm.noShip.includes(s));
  let clean = true;
  for (const st of allowed) {
    set([{ id: amm.id, qty: 1 }], amm.ffl ? { ffl: dealerIn(st) } : { st });
    if (vm.runInContext('blocked()', ctx).length) clean = false;
  }
  ok(`${amm.id} is fine in ${allowed.join(', ')}`, clean);

  set([{ id: anyDoor.id, qty: 1 }], { st: 'CA' });
  ok('an unrestricted item is not blocked anywhere', vm.runInContext('blocked()', ctx).length === 0);

  /* A destination nobody has chosen yet cannot be a violation. */
  set([{ id: amm.id, qty: 1 }]);
  ok('nothing is blocked before a destination is picked', vm.runInContext('blocked()', ctx).length === 0);
}

console.log('\nthe dealer\'s state is what counts for a firearm, not the billing address');
{
  const fflRestricted = restricted.find(i => i.ffl);
  if (!fflRestricted) { ok('no state-restricted firearm in the catalogue to check', true); }
  else {
    const bad = fflRestricted.noShip[0];
    set([{ id: fflRestricted.id, qty: 1 }], { st: 'UT', ffl: dealerIn(bad) });
    ok(`a dealer in ${bad} blocks it even with a ${'UT'} address`,
      vm.runInContext('blocked()', ctx).length === 1);
    set([{ id: fflRestricted.id, qty: 1 }], { st: bad, ffl: dealerIn('UT') });
    ok(`and a ${bad} address does not block a dealer in UT`,
      vm.runInContext('blocked()', ctx).length === 0);
  }
}

console.log('\nstep 3 needs both attestations as well');
{
  const c = [{ id: anyFFL.id, qty: 1 }], d = { ffl: dealerIn('UT') };
  set(c, { ...d });
  ok('neither ticked is blocked', call('gate3') === false);
  set(c, { ...d, age: true });
  ok('age alone is blocked', call('gate3') === false);
  set(c, { ...d, truth: true });
  ok('the transfer statement alone is blocked', call('gate3') === false);
  set(c, { ...d, age: true, truth: true });
  ok('both ticked passes', call('gate3') === true);

  const amm = restricted.find(i => !i.ffl);
  if (amm) {
    set([{ id: anyFFL.id, qty: 1 }, { id: amm.id, qty: 1 }],
        { ffl: dealerIn('UT'), st: amm.noShip[0], age: true, truth: true });
    ok('ticking both cannot override a blocked item', call('gate3') === false);
  }
}

console.log('\nNFA');
{
  const nfa = SHOP.find(i => i.nfa);
  set([{ id: nfa.id, qty: 1 }]);
  ok('an NFA item is recognised', call('hasNFA') === true);
  ok('and it routes to a dealer', call('needFFL') === true);
  set([{ id: anyDoor.id, qty: 1 }]);
  ok('a plain component is not NFA', call('hasNFA') === false);
}

console.log('\nthe two halves agree');
{
  /* The server enforces the same rules in Postgres. If the lists ever drift,
     a customer is either refused something the cart allowed or allowed
     something the database will refuse — both are bugs, in opposite directions. */
  const seed = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0003_seed.sql'), 'utf8');
  /* Postgres array literals, so the states arrive as '{CA,MA,NY}' rather than
     as separately quoted values. One per row, and it is the only one. */
  const inSeed = [];
  for (const i of SHOP) {
    const row = seed.match(new RegExp(`\\('${i.id}',[\\s\\S]*?'\\{([^}]*)\\}'`));
    if (!row) continue;
    const states = row[1].split(',').map(x => x.trim()).filter(Boolean);
    inSeed.push([i.id, (i.noShip || []).slice().sort().join(','), states.sort().join(',')]);
  }
  ok('the seed carries every catalogue SKU', inSeed.length === SHOP.length,
    { found: inSeed.length, expected: SHOP.length });
  const drifted = inSeed.filter(([, page, db]) => page !== db).map(([id, page, db]) => ({ id, page, db }));
  ok('no-ship lists match between the page and the seed', !drifted.length, drifted);
}

console.log(`\n${fail ? fail + ' failed, ' : ''}${pass} passed\n`);
process.exitCode = fail ? 1 : 0;
