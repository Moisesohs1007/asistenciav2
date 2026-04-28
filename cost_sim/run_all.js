const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').trim();
    throw new Error(`Falló: ${cmd} ${args.join(' ')}\n${msg}`);
  }
  return (r.stdout || '').trim();
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function main() {
  const root = path.join(__dirname, '..');
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const scenarios = ['bajo', 'medio', 'alto'];
  const plans = ['free', 'pro'];

  const artifacts = [];
  const rows = [];

  scenarios.forEach(sc => {
    plans.forEach(pl => {
      const outPath = run(process.execPath, [
        path.join(__dirname, 'simulate_week.js'),
        '--scenario', sc,
        '--plan', pl,
        '--out', outDir
      ], root);
      const data = readJson(outPath);
      artifacts.push({ scenario: sc, plan: pl, file: path.basename(outPath) });

      const t = data.totals_week || {};
      const est = data.pricing_estimate || {};
      rows.push({
        scenario: sc,
        plan: pl,
        week_egress_gb: round2(t.egress_gb || 0),
        week_api_requests: t.api_requests || 0,
        week_auth_requests: t.auth_requests || 0,
        week_edge_invocations: t.edge_invocations || 0,
        projected_month_egress_gb: data.projected_month?.egress_gb ?? 0,
        projected_month_mau: data.projected_month?.mau ?? 0,
        estimated_monthly_usd: est.total_usd ?? 0
      });
    });
  });

  const summary = {
    generated_at: new Date().toISOString(),
    artifacts,
    summary: rows
  };

  const summaryJson = path.join(outDir, `summary_week_${Date.now()}.json`);
  fs.writeFileSync(summaryJson, JSON.stringify(summary, null, 2), 'utf8');

  const summaryCsv = path.join(outDir, `summary_week_${Date.now()}.csv`);
  fs.writeFileSync(summaryCsv, toCSV(rows), 'utf8');

  const execMdPath = run(process.execPath, [
    path.join(__dirname, 'executive_report.js'),
    '--in', summaryJson,
    '--out', outDir
  ], root);

  process.stdout.write(
    [
      summaryJson,
      summaryCsv,
      execMdPath
    ].join('\n') + '\n'
  );
}

main();

