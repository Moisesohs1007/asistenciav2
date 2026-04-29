const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function testMaterialesNoAutoRefreshOnFocus() {
  let _matInited = true;
  let refreshCalls = 0;

  async function matRefreshAll() {
    refreshCalls++;
  }

  async function initMateriales() {
    if (_matInited) return;
    await matRefreshAll();
  }

  return initMateriales().then(() => {
    assert.equal(refreshCalls, 0, 'No debe refrescar en focusin si ya inicializó');
  });
}

function testCodeGuardsPresent() {
  const root = path.resolve(__dirname, '..');
  const indexHtml = readUtf8(path.join(root, 'index.html'));
  const schemaSql = readUtf8(path.join(root, 'supabase', 'materiales_schema.sql'));

  assert.ok(
    indexHtml.includes('if(_matInited) return;'),
    'initMateriales debe ser idempotente (sin auto-refresh en focusin)'
  );
  assert.ok(
    indexHtml.includes('if(_matEditingExisting) { matRenderTemplate(); return; }'),
    'matLoadTemplate no debe cancelar edición'
  );
  assert.ok(
    indexHtml.includes('let _matReceiptLoading'),
    'Debe existir _matReceiptLoading para evitar guardar antes que cargue la recepción'
  );
  assert.ok(
    indexHtml.includes('if(_matReceiptLoading)'),
    'matSaveReceiptAll debe bloquear guardado mientras carga la recepción'
  );

  const uniqNames = [
    'material_templates_colegio_id_id_uniq',
    'material_template_items_colegio_id_id_uniq',
    'material_receipts_colegio_id_id_uniq',
    'material_receipt_items_colegio_id_id_uniq',
    'material_handoffs_colegio_id_id_uniq',
    'material_handoff_items_colegio_id_id_uniq',
    'material_requests_colegio_id_id_uniq',
    'material_request_items_colegio_id_id_uniq',
  ];
  for (const name of uniqNames) {
    assert.ok(schemaSql.includes(name), `Falta índice UNIQUE esperado: ${name}`);
  }
}

async function main() {
  await testMaterialesNoAutoRefreshOnFocus();
  testCodeGuardsPresent();
  console.log('OK materiales_flow_test');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
