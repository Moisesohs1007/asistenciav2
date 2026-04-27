const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

(() => {
  const tmpDir = path.join(__dirname, '..', 'cost_sim', 'out_audit_test');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const auditFile = path.join(tmpDir, 'audit.json');
  fs.writeFileSync(auditFile, JSON.stringify({
    schema: 'asmqr-cost-audit-v1',
    colegio_id: 'sigece',
    supabase_url: 'https://example.supabase.co',
    day: '2026-04-27',
    enabled: true,
    deepBytes: false,
    counters: { rest: 10, auth: 2, functions: 1, storage: 3, other: 0, bytesOut: 1000, bytesIn: 9000, errors: 0 },
    byPath: {}
  }), 'utf8');

  const script = path.join(__dirname, '..', 'cost_sim', 'analyze_audit.js');
  const r = spawnSync(process.execPath, [script, '--in', tmpDir, '--plan', 'free', '--mau', '10', '--out', tmpDir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const outPath = (r.stdout || '').trim();
  assert.ok(outPath.endsWith('.json'));
  const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.strictEqual(out.meta.source, 'asmqr-cost-audit');
  assert.ok(out.daily.length >= 1);
  assert.strictEqual(out.totals_week.api_requests, 16);
})();

console.log('OK analyze_audit_test');

