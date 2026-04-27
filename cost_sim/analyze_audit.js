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

function clamp0(x) {
  return x < 0 ? 0 : x;
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
  const inArg = argVal(argv, '--in', null);
  const planKey = argVal(argv, '--plan', 'free');
  const outDir = argVal(argv, '--out', path.join(__dirname, 'out'));
  const mau = num(argVal(argv, '--mau', '0'), 0);
  const weeksPerMonth = num(argVal(argv, '--weeksPerMonth', '4.345'), 4.345);
  const dbDiskGb = num(argVal(argv, '--dbDiskGb', '0'), 0);
  const storageGbBase = num(argVal(argv, '--storageGbBase', '0'), 0);

  if (!inArg) throw new Error('Uso: node cost_sim/analyze_audit.js --in <archivo|carpeta> [--plan free|pro] [--mau N]');

  const pricing = readJson(path.join(__dirname, 'pricing.supabase.json'));

  const inputs = [];
  const stat = fs.statSync(inArg);
  if (stat.isDirectory()) {
    fs.readdirSync(inArg)
      .filter(f => f.endsWith('.json'))
      .forEach(f => inputs.push(path.join(inArg, f)));
  } else {
    inputs.push(inArg);
  }

  const daily = [];
  let colegioId = null;
  inputs.forEach(p => {
    const j = readJson(p);
    if (!j || j.schema !== 'asmqr-cost-audit-v1') return;
    colegioId = colegioId || j.colegio_id || null;
    const c = j.counters || {};
    const bytesOut = c.bytesOut || 0;
    const bytesIn = c.bytesIn || 0;
    const bytes = bytesOut + bytesIn;
    daily.push({
      day: j.day,
      operations: {
        api_requests: (c.rest || 0) + (c.auth || 0) + (c.functions || 0) + (c.storage || 0) + (c.other || 0),
        auth_requests: c.auth || 0,
        db_requests: c.rest || 0,
        edge_invocations: c.functions || 0,
        storage_requests: c.storage || 0,
        errors: c.errors || 0
      },
      bytes: {
        egress_bytes: bytes
      }
    });
  });

  daily.sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const totals = daily.reduce((acc, d) => {
    acc.api_requests += d.operations.api_requests;
    acc.auth_requests += d.operations.auth_requests;
    acc.db_requests += d.operations.db_requests;
    acc.edge_invocations += d.operations.edge_invocations;
    acc.storage_requests += d.operations.storage_requests;
    acc.errors += d.operations.errors;
    acc.egress_bytes += d.bytes.egress_bytes;
    return acc;
  }, { api_requests: 0, auth_requests: 0, db_requests: 0, edge_invocations: 0, storage_requests: 0, errors: 0, egress_bytes: 0 });

  const weekEgressGb = totals.egress_bytes / (1024 * 1024 * 1024);
  const projectedMonth = {
    mau,
    egress_gb: round2(weekEgressGb * weeksPerMonth),
    cached_egress_gb: 0,
    storage_gb: round2(storageGbBase),
    db_disk_gb: round2(dbDiskGb)
  };

  const estimate = costFromPricing({ pricing, planKey, usage: projectedMonth });

  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      source: 'asmqr-cost-audit',
      colegio_id: colegioId,
      plan: planKey,
      weeks_per_month: weeksPerMonth
    },
    totals_week: {
      ...totals,
      egress_gb: round2(weekEgressGb)
    },
    projected_month: projectedMonth,
    pricing_estimate: estimate,
    daily
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `audit_week_${planKey}_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  process.stdout.write(outPath + '\n');
}

main();

