/* Every suite, one command: node tests/all.js
 *
 * CI runs them as separate steps so a failure is named in the summary; this is
 * for running the lot before pushing. No dependencies, nothing to install.
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.test.js')).sort();
const verbose = process.argv.includes('-v');

console.log(`\n${files.length} suites\n`);
const failed = [];
const t0 = Date.now();

for (const f of files) {
  const started = Date.now();
  const r = spawnSync('node', [path.join(DIR, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  /* The tally is the last non-empty line of stdout. Reading it from the
     combined streams picked up whatever a suite had logged to stderr on a
     deliberate negative case instead. */
  const tally = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '(no output)';
  const secs = ((Date.now() - started) / 1000).toFixed(1) + 's';
  const bad = r.status !== 0;
  if (bad) failed.push(f);
  console.log(`${bad ? '✗' : '✓'} ${f.replace('.test.js', '').padEnd(22)} ${tally.padEnd(16)} ${secs.padStart(6)}`);
  if (bad || verbose) console.log(out.split('\n').map(l => '    ' + l).join('\n'));
}

console.log(`\n${failed.length ? failed.length + ' suite(s) failed: ' + failed.join(', ')
                                : 'all suites passed'} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
process.exitCode = failed.length ? 1 : 0;
