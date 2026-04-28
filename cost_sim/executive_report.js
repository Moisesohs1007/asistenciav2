const fs = require('fs');
const path = require('path');

function argVal(argv, name, def) {
  const idx = argv.indexOf(name);
  if (idx === -1) return def;
  const v = argv[idx + 1];
  if (!v || v.startsWith('--')) return def;
  return v;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fmtInt(n) {
  const x = Math.round(Number(n || 0));
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtGB(n) {
  return Number(n || 0).toFixed(2) + ' GB';
}

function fmtUSD(n) {
  return '$' + Number(n || 0).toFixed(2);
}

function pick(rows, scenario, plan) {
  return rows.find(r => r.scenario === scenario && r.plan === plan) || null;
}

function main() {
  const argv = process.argv.slice(2);
  const inPath = argVal(argv, '--in', null);
  const outDir = argVal(argv, '--out', path.join(__dirname, 'out'));
  if (!inPath) throw new Error('Uso: node cost_sim/executive_report.js --in <summary.json> [--out <dir>]');

  const summary = readJson(inPath);
  const rows = summary.summary || [];

  const md = [];
  md.push('# Informe ejecutivo semanal — Consumo y costos (Supabase)');
  md.push('');
  md.push('Este informe se genera automáticamente con una simulación de 7 días basada en los componentes reales del proyecto (DB/API, Auth, Storage, Edge Functions, Realtime).');
  md.push('');
  md.push('## Resumen (sensibilidad)');
  md.push('');
  md.push('| Escenario | Plan | Egress semana | API req semana | Auth req semana | Edge inv semana | Egress mensual (proj) | MAU (proj) | Costo mensual (estimado) |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  rows.forEach(r => {
    md.push([
      r.scenario,
      r.plan.toUpperCase(),
      fmtGB(r.week_egress_gb),
      fmtInt(r.week_api_requests),
      fmtInt(r.week_auth_requests),
      fmtInt(r.week_edge_invocations),
      fmtGB(r.projected_month_egress_gb),
      fmtInt(r.projected_month_mau),
      fmtUSD(r.estimated_monthly_usd)
    ].join(' | ').replace(/^/, '| ') + ' |');
  });

  md.push('');
  md.push('## Hallazgos clave');
  md.push('- El principal driver de costo típico en Supabase es egress y storage; en este proyecto, reportes masivos (consultas grandes a `registros`) y descargas (PDF/Excel) empujan egress.');
  md.push('- Edge Functions se consumen por WhatsApp, comunicados y módulos de IA/horarios; su costo depende del plan y del número de invocaciones.');
  md.push('- MAU en Free es amplio; el salto relevante suele llegar al pasar a Pro por producción y por límites de egress/almacenamiento.');
  md.push('');

  md.push('## Recomendaciones accionables (prioridad alta)');
  md.push('- Reportes: usar agregados (`resumen_mensual`) para vistas grandes y cargar detalle por día/alumno bajo demanda para reducir egress.');
  md.push('- Reportes: paginación y selección de columnas (evitar `select *`) en consultas grandes; reducir tamaño de payload.');
  md.push('- Cache: aumentar TTL para consultas históricas y precalcular reportes mensuales cuando el mes cierra.');
  md.push('- PDF/Excel: generar server-side (Edge/RPC) y devolver archivos comprimidos, o limitar rango por defecto.');
  md.push('');

  md.push('## Archivos de evidencia');
  md.push('- JSON/CSV de resumen: generado en la carpeta `cost_sim/out/`.');
  md.push('- Dashboard: abrir `cost_sim/dashboard.html` o ejecutar `node cost_sim/server.js`.');
  md.push('');

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `informe_ejecutivo_${Date.now()}.md`);
  fs.writeFileSync(outPath, md.join('\n'), 'utf8');
  process.stdout.write(outPath + '\n');
}

main();

