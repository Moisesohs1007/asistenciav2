const fs = require('fs');
const path = require('path');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function argVal(argv, name, def) {
  const idx = argv.indexOf(name);
  if (idx === -1) return def;
  const v = argv[idx + 1];
  if (!v || v.startsWith('--')) return def;
  return v;
}

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function isoDay(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function isWeekday(d) {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
}

function clamp0(x) {
  return x < 0 ? 0 : x;
}

function estimateQueryBytes({ rows = 0, rowSize = 200, overhead = 900 }) {
  return overhead + clamp0(rows) * clamp0(rowSize);
}

function spreadWeekly(total, days) {
  const base = Math.floor(total / days);
  const rem = total - base * days;
  const out = Array(days).fill(base);
  for (let i = 0; i < rem; i++) out[i] += 1;
  return out;
}

function costFromPricing({ pricing, planKey, usage }) {
  const plan = (pricing.plans || {})[planKey] || null;
  if (!plan) throw new Error('Plan inválido: ' + planKey);

  const included = plan.included || {};
  const over = plan.overage || {};

  const mau = usage.mau || 0;
  const dbDiskGb = usage.db_disk_gb || 0;
  const egressGb = usage.egress_gb || 0;
  const cachedEgressGb = usage.cached_egress_gb || 0;
  const storageGb = usage.storage_gb || 0;

  const billableMau = clamp0(mau - (included.mau || 0));
  const billableDisk = clamp0(dbDiskGb - (included.db_disk_gb || 0));
  const billableEgress = clamp0(egressGb - (included.egress_gb || 0));
  const billableCached = clamp0(cachedEgressGb - (included.cached_egress_gb || 0));
  const billableStorage = clamp0(storageGb - (included.storage_gb || 0));

  const mauCost = over.mau_usd_per_user == null ? 0 : billableMau * over.mau_usd_per_user;
  const diskCost = over.db_disk_usd_per_gb == null ? 0 : billableDisk * over.db_disk_usd_per_gb;
  const egressCost = over.egress_usd_per_gb == null ? 0 : billableEgress * over.egress_usd_per_gb;
  const cachedCost = over.cached_egress_usd_per_gb == null ? 0 : billableCached * over.cached_egress_usd_per_gb;
  const storageCost = over.storage_usd_per_gb == null ? 0 : billableStorage * over.storage_usd_per_gb;

  const total =
    (plan.monthly_fee_usd || 0) +
    mauCost +
    diskCost +
    egressCost +
    cachedCost +
    storageCost;

  return {
    plan: planKey,
    monthly_fee_usd: plan.monthly_fee_usd || 0,
    components_usd: {
      mau: round2(mauCost),
      db_disk: round2(diskCost),
      egress: round2(egressCost),
      cached_egress: round2(cachedCost),
      storage: round2(storageCost)
    },
    total_usd: round2(total),
    billable: {
      mau: billableMau,
      db_disk_gb: round2(billableDisk),
      egress_gb: round2(billableEgress),
      cached_egress_gb: round2(billableCached),
      storage_gb: round2(billableStorage)
    }
  };
}

function main() {
  const argv = process.argv.slice(2);
  const scenarioKey = argVal(argv, '--scenario', 'medio');
  const planKey = argVal(argv, '--plan', 'free');
  const outDirArg = argVal(argv, '--out', path.join(__dirname, 'out'));
  const startArg = argVal(argv, '--start', null);
  const weeksPerMonth = num(argVal(argv, '--weeksPerMonth', '4.345'), 4.345);
  const dbDiskGbInput = num(argVal(argv, '--dbDiskGb', '0'), 0);
  const storageGbBase = num(argVal(argv, '--storageGbBase', '0'), 0);

  const pricing = readJson(path.join(__dirname, 'pricing.supabase.json'));
  const workloads = readJson(path.join(__dirname, 'workloads.json'));
  const scenario = (workloads.scenarios || {})[scenarioKey];
  if (!scenario) throw new Error('Escenario inválido: ' + scenarioKey);

  const a = workloads.assumptions || {};
  const rowSize = a.row_size_bytes || {};
  const overhead = num(a.http_overhead_bytes_per_request, 900);
  const authUserBytes = num(a.auth_user_fetch_bytes, 2500);
  const edgeOverhead = num(a.edge_invocation_overhead_bytes, 1200);

  const now = new Date();
  const start = startArg ? new Date(startArg + 'T00:00:00') : addDays(now, -6);

  const days = a.week_days || 7;
  const attendanceDays = scenario.workload.attendance_days_per_week || 5;
  const dayFlags = [];
  for (let i = 0; i < days; i++) dayFlags.push(false);
  let filled = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    if (isWeekday(d) && filled < attendanceDays) {
      dayFlags[i] = true;
      filled++;
    }
  }

  const alumnosTotal = scenario.school.alumnos_total || 0;
  const scansPerDay = scenario.workload.scans_per_attendance_day || 0;
  const tardRate = scenario.workload.scan_tardanza_rate || 0;
  const scansByDay = dayFlags.map(on => (on ? scansPerDay : 0));

  const reportRuns = scenario.workload.report_runs_per_week || { dia: 0, mes: 0, rango: 0, anio: 0 };
  const reportDia = spreadWeekly(reportRuns.dia || 0, days);
  const reportMes = spreadWeekly(reportRuns.mes || 0, days);
  const reportRango = spreadWeekly(reportRuns.rango || 0, days);
  const reportAnio = spreadWeekly(reportRuns.anio || 0, days);

  const wpp = spreadWeekly(scenario.workload.whatsapp_messages_per_week || 0, days);
  const comunicados = spreadWeekly(scenario.workload.comunicados_per_week || 0, days);
  const prompts = spreadWeekly(scenario.workload.ai_prompts_per_week || 0, days);
  const materialOps = spreadWeekly(scenario.workload.material_ops_per_week || 0, days);
  const uploads = spreadWeekly(scenario.workload.storage_uploads_per_week || 0, days);
  const downloads = spreadWeekly(scenario.workload.storage_downloads_per_week || 0, days);

  const upMb = num(scenario.workload.storage_upload_avg_mb, 0.5);
  const dlMb = num(scenario.workload.storage_download_avg_mb, 0.5);

  const maus = scenario.actors.maus || 0;

  const daily = [];
  const totals = {
    api_requests: 0,
    auth_requests: 0,
    db_reads: 0,
    db_writes: 0,
    db_deletes: 0,
    rpc_calls: 0,
    edge_invocations: 0,
    realtime_peak_conns: 0,
    realtime_messages: 0,
    egress_bytes: 0,
    cached_egress_bytes: 0,
    storage_bytes: 0
  };

  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const dayIso = isoDay(d);

    const scans = scansByDay[i];
    const tard = Math.round(scans * tardRate);
    const punt = Math.max(0, scans - tard);

    const dayDbWrites = scans;
    const dayRpc = scans;
    const dayAuth = scans;

    const alumnosReads = 1;
    const configReads = 1;
    const readsForReportDia = reportDia[i] * 2;
    const readsForReportMes = reportMes[i] * 3;
    const readsForReportRango = reportRango[i] * 3;
    const readsForReportAnio = reportAnio[i] * 3;
    const dayDbReadsSmall = alumnosReads + configReads + readsForReportDia;

    const monthRowsEstimate = Math.round(scansPerDay * attendanceDays * 1.02);
    const rangeRowsEstimate = Math.round(monthRowsEstimate * 0.6);
    const yearRowsEstimate = Math.round(monthRowsEstimate * 9);

    const dayDbReadsBigRows =
      reportMes[i] * monthRowsEstimate +
      reportRango[i] * rangeRowsEstimate +
      reportAnio[i] * yearRowsEstimate;

    const dayDbReads = dayDbReadsSmall + readsForReportMes + readsForReportRango + readsForReportAnio;

    const dayEdge = wpp[i] + comunicados[i] + prompts[i];
    const dayEdgeDbReads = wpp[i] * 2 + comunicados[i] * 1 + prompts[i] * 0;
    const dayEdgeDbWrites = prompts[i] * 1;

    const dayMaterialWrites = Math.round(materialOps[i] * 0.35);
    const dayMaterialReads = Math.round(materialOps[i] * 0.65);

    const bytesRegistrosReads = estimateQueryBytes({ rows: dayDbReadsBigRows, rowSize: rowSize.registros || 220, overhead });
    const bytesAlumnosReads = estimateQueryBytes({ rows: alumnosTotal, rowSize: rowSize.alumnos || 260, overhead }) * alumnosReads;
    const bytesResumenReads = estimateQueryBytes({ rows: alumnosTotal, rowSize: rowSize.resumen_mensual || 80, overhead }) * (reportMes[i] + reportRango[i]);

    const bytesWritesReg = estimateQueryBytes({ rows: dayDbWrites, rowSize: rowSize.registros || 220, overhead: 450 });
    const bytesWritesMat = estimateQueryBytes({ rows: dayMaterialWrites, rowSize: rowSize.materiales_item || 140, overhead: 450 });
    const bytesWritesEdge = estimateQueryBytes({ rows: dayEdgeDbWrites, rowSize: 160, overhead: 450 });

    const bytesAuth = dayAuth * authUserBytes;
    const bytesEdge = dayEdge * edgeOverhead;
    const bytesStorageUp = uploads[i] * upMb * 1024 * 1024;
    const bytesStorageDl = downloads[i] * dlMb * 1024 * 1024;

    const dayEgress =
      bytesRegistrosReads +
      bytesAlumnosReads +
      bytesResumenReads +
      bytesWritesReg +
      bytesWritesMat +
      bytesWritesEdge +
      bytesAuth +
      bytesEdge +
      bytesStorageUp +
      bytesStorageDl;

    const apiReq =
      dayDbReads +
      dayDbWrites +
      dayRpc +
      dayEdgeDbReads +
      dayEdgeDbWrites +
      uploads[i] +
      downloads[i] +
      dayEdge +
      dayAuth;

    const peak = Math.max(1, Math.round(maus / 6));

    const dayTotals = {
      day: dayIso,
      attendance: { scans, puntuales: punt, tardanzas: tard },
      operations: {
        api_requests: apiReq,
        auth_requests: dayAuth,
        db_reads_requests: dayDbReads + dayMaterialReads + dayEdgeDbReads,
        db_writes_requests: dayDbWrites + dayMaterialWrites + dayEdgeDbWrites,
        db_deletes_requests: 0,
        rpc_calls: dayRpc,
        edge_invocations: dayEdge,
        realtime_peak_conns: peak,
        realtime_messages: 0
      },
      bytes: {
        egress_bytes: Math.round(dayEgress),
        cached_egress_bytes: 0,
        storage_bytes: Math.round(bytesStorageUp - bytesStorageDl)
      }
    };

    daily.push(dayTotals);

    totals.api_requests += apiReq;
    totals.auth_requests += dayAuth;
    totals.db_reads += dayDbReads + dayMaterialReads + dayEdgeDbReads;
    totals.db_writes += dayDbWrites + dayMaterialWrites + dayEdgeDbWrites;
    totals.db_deletes += 0;
    totals.rpc_calls += dayRpc;
    totals.edge_invocations += dayEdge;
    totals.realtime_peak_conns = Math.max(totals.realtime_peak_conns, peak);
    totals.realtime_messages += 0;
    totals.egress_bytes += Math.round(dayEgress);
    totals.cached_egress_bytes += 0;
    totals.storage_bytes += Math.round(bytesStorageUp - bytesStorageDl);
  }

  const weekEgressGb = totals.egress_bytes / (1024 * 1024 * 1024);
  const weekCachedGb = totals.cached_egress_bytes / (1024 * 1024 * 1024);
  const storageGb = Math.max(0, totals.storage_bytes / (1024 * 1024 * 1024));

  const projectedMonthly = {
    mau: maus,
    egress_gb: round2(weekEgressGb * weeksPerMonth),
    cached_egress_gb: round2(weekCachedGb * weeksPerMonth),
    storage_gb: round2(storageGbBase + storageGb),
    db_disk_gb: round2(dbDiskGbInput)
  };

  const cost = costFromPricing({
    pricing,
    planKey,
    usage: {
      mau: projectedMonthly.mau,
      egress_gb: projectedMonthly.egress_gb,
      cached_egress_gb: projectedMonthly.cached_egress_gb,
      storage_gb: projectedMonthly.storage_gb,
      db_disk_gb: projectedMonthly.db_disk_gb || 0
    }
  });

  const output = {
    meta: {
      generated_at: new Date().toISOString(),
      scenario: scenarioKey,
      plan: planKey,
      weeks_per_month: weeksPerMonth,
      start_day: isoDay(start),
      days
    },
    inputs: {
      actors: scenario.actors,
      school: scenario.school,
      workload: scenario.workload
    },
    totals_week: {
      ...totals,
      egress_gb: round2(weekEgressGb),
      cached_egress_gb: round2(weekCachedGb),
      storage_gb_delta: round2(storageGb)
    },
    projected_month: {
      ...projectedMonthly,
      db_disk_gb: projectedMonthly.db_disk_gb
    },
    pricing_estimate: cost,
    daily
  };

  fs.mkdirSync(outDirArg, { recursive: true });
  const outPath = path.join(outDirArg, `usage_week_${scenarioKey}_${planKey}_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  process.stdout.write(outPath + '\n');
}

main();
