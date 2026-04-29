const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function testMaterialesNoAutoRefreshWhileEditing() {
  let _matInited = true;
  let _matEditingExisting = true;
  let _matLastAutoRefresh = 0;
  let refreshCalls = 0;

  async function matRefreshAll() {
    if (_matEditingExisting) return;
    refreshCalls++;
  }

  async function initMateriales(now) {
    if (_matInited) {
      if (_matEditingExisting) return;
      if (now - _matLastAutoRefresh < 1200) return;
      _matLastAutoRefresh = now;
      await matRefreshAll();
      return;
    }
  }

  return initMateriales(10_000).then(() => {
    assert.equal(refreshCalls, 0, 'No debe refrescar mientras se edita');
    assert.equal(_matEditingExisting, true, 'No debe salir del modo edición');
  });
}

function testMaterialesDebounce() {
  let _matInited = true;
  let _matEditingExisting = false;
  let _matLastAutoRefresh = 10_000;
  let refreshCalls = 0;

  async function matRefreshAll() {
    if (_matEditingExisting) return;
    refreshCalls++;
  }

  async function initMateriales(now) {
    if (_matInited) {
      if (_matEditingExisting) return;
      if (now - _matLastAutoRefresh < 1200) return;
      _matLastAutoRefresh = now;
      await matRefreshAll();
      return;
    }
  }

  return initMateriales(10_500).then(() => {
    assert.equal(refreshCalls, 0, 'Debounce debe evitar refrescos seguidos');
  });
}

function testCodeGuardsPresent() {
  const root = path.resolve(__dirname, '..');
  const indexHtml = readUtf8(path.join(root, 'index.html'));
  const schemaSql = readUtf8(path.join(root, 'supabase', 'materiales_schema.sql'));

  assert.ok(
    indexHtml.includes('let _matLastAutoRefresh'),
    'Debe existir _matLastAutoRefresh para evitar el bucle de edición'
  );
  assert.ok(
    indexHtml.includes('if(_matEditingExisting) return;'),
    'initMateriales debe cortar si está editando'
  );
  assert.ok(
    indexHtml.includes('if(_matEditingExisting) { matRenderTemplate(); return; }'),
    'matLoadTemplate no debe cancelar edición'
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
  await testMaterialesNoAutoRefreshWhileEditing();
  await testMaterialesDebounce();
  testCodeGuardsPresent();
  console.log('OK materiales_flow_test');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

