const assert = require('assert');

function calcReport({ alumnos, ingresos, dias }) {
  const alumnosIds = new Set(alumnos.map(a => a.id));
  const mapDiaAlu = new Map(); // dia|alumno -> Puntual|Tardanza
  ingresos
    .filter(r => r.tipo === 'INGRESO' && alumnosIds.has(r.alumnoId))
    .forEach(r => {
      const key = r.fecha + '|' + r.alumnoId;
      const prev = mapDiaAlu.get(key) || 'Puntual';
      const esT = String(r.estado || '').trim() === 'Tardanza';
      mapDiaAlu.set(key, (prev === 'Tardanza' || esT) ? 'Tardanza' : 'Puntual');
    });

  let punt = 0, tard = 0;
  mapDiaAlu.forEach(v => { if(v === 'Tardanza') tard++; else punt++; });

  const esperado = dias.length * alumnos.length;
  const faltas = Math.max(0, esperado - mapDiaAlu.size);
  return { punt, tard, faltas, esperado, presentes: mapDiaAlu.size };
}

(() => {
  const alumnos = [{ id: 'A' }, { id: 'B' }];
  const dias = ['2026-04-01', '2026-04-02'];
  const ingresos = [
    { alumnoId: 'A', tipo: 'INGRESO', fecha: '2026-04-01', estado: 'Puntual' },
    { alumnoId: 'A', tipo: 'INGRESO', fecha: '2026-04-01', estado: 'Tardanza' },
    { alumnoId: 'B', tipo: 'INGRESO', fecha: '2026-04-01', estado: 'Puntual' },
  ];
  const r = calcReport({ alumnos, ingresos, dias });
  assert.deepStrictEqual(r, { punt: 1, tard: 1, faltas: 2, esperado: 4, presentes: 2 });
})();

(() => {
  const alumnos = [{ id: 'A' }];
  const dias = ['2026-04-01', '2026-04-02', '2026-04-03'];
  const ingresos = [
    { alumnoId: 'A', tipo: 'INGRESO', fecha: '2026-04-01', estado: 'Puntual' },
    { alumnoId: 'A', tipo: 'INGRESO', fecha: '2026-04-02', estado: 'Tardanza' },
    { alumnoId: 'A', tipo: 'INGRESO', fecha: '2026-04-03', estado: 'Puntual' },
  ];
  const r = calcReport({ alumnos, ingresos, dias });
  assert.strictEqual(r.punt + r.tard + r.faltas, 3);
  assert.deepStrictEqual(r, { punt: 2, tard: 1, faltas: 0, esperado: 3, presentes: 3 });
})();

console.log('OK reportes_metrics_test');
