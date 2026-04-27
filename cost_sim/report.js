const fs = require('fs');
const path = require('path');

function argVal(argv, name, def) {
  const idx = argv.indexOf(name);
  if (idx === -1) return def;
  const v = argv[idx + 1];
  if (!v || v.startsWith('--')) return def;
  return v;
}

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const inPath = argVal(argv, '--in', null);
  const outDir = argVal(argv, '--out', path.join(__dirname, 'out'));
  if (!inPath) throw new Error('Uso: node cost_sim/report.js --in <archivo.json> [--out <carpeta>]');

  const raw = fs.readFileSync(inPath, 'utf8');
  const data = JSON.parse(raw);
  const daily = data.daily || [];

  const rows = daily.map(d => ({
    day: d.day,
    egress_gb: (d.bytes.egress_bytes / (1024 * 1024 * 1024)).toFixed(3),
    api_requests: d.operations.api_requests,
    auth_requests: d.operations.auth_requests,
    db_requests: (d.operations.db_reads_requests || 0) + (d.operations.db_writes_requests || 0),
    edge_invocations: d.operations.edge_invocations,
    scans: d.attendance.scans,
    puntuales: d.attendance.puntuales,
    tardanzas: d.attendance.tardanzas
  }));

  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(inPath).replace(/\.json$/i, '');
  const csvPath = path.join(outDir, base + '_daily.csv');
  fs.writeFileSync(csvPath, toCSV(rows), 'utf8');
  process.stdout.write(csvPath + '\n');
}

main();

