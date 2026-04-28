const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runSim() {
  const simPath = path.join(__dirname, '..', 'cost_sim', 'simulate_week.js');
  const outDir = path.join(__dirname, '..', 'cost_sim', 'out_test_tmp', String(Date.now()));
  fs.mkdirSync(outDir, { recursive: true });
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [simPath, '--scenario', 'bajo', '--plan', 'pro', '--out', outDir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const outPath = (r.stdout || '').trim();
  assert.ok(outPath.endsWith('.json'));
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  return data;
}

(() => {
  const data = runSim();
  assert.ok(data.meta);
  assert.strictEqual(data.meta.days, 7);
  assert.ok(Array.isArray(data.daily));
  assert.strictEqual(data.daily.length, 7);
  assert.ok(data.totals_week);
  assert.ok(data.pricing_estimate);
  assert.strictEqual(data.pricing_estimate.plan, 'pro');
  assert.ok(typeof data.pricing_estimate.total_usd === 'number');
})();

(() => {
  const root = path.join(__dirname, '..');
  const script = path.join(root, 'cost_sim', 'run_all.js');
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const outLines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(outLines.length >= 3);
  outLines.forEach(p => {
    const full = path.isAbsolute(p) ? p : path.join(root, p);
    assert.ok(fs.existsSync(full), 'No existe: ' + full);
  });
})();

console.log('OK cost_sim_test');
