// ============================================================
// SUPABASE COMPAT — emula la API de Firebase para index.html
//
// Permite migrar sin reescribir las 40+ llamadas a db.collection()
// ni toda la lógica de auth dispersa en 9,800 líneas.
//
// CAMBIOS en index.html para activar Supabase:
//   1. Reemplazar líneas 13-17 (Firebase SDK scripts) con:
//        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//        <script src="supabase/compat.js"></script>
//        <script src="supabase/db_supabase.js"></script>    ← en vez de db.js
//   2. Eliminar líneas 3120-3134 (firebaseConfig + initializeApp)
//      El init ya está aquí abajo — editar SUPABASE_URL y SUPABASE_ANON_KEY.
//   3. Eliminar la línea que carga db.js
//
// El resto de index.html no necesita cambios.
// ============================================================

// ╔══════════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN DEL COLEGIO — EDITAR SOLO AQUÍ              ║
// ║  Aplica en toda la app: index.html Y apoderado.html        ║
// ║  header, login, reportes, PDFs, Excel, WhatsApp            ║
// ╚══════════════════════════════════════════════════════════════╝
window.COLEGIO_NOMBRE  = 'I.E. Nº 1049 Juana Alarco De Dammert';
window.COLEGIO_ESLOGAN = '';
window.COLEGIO_LOGO    = 'img/logo-colegio.png'; // reemplaza este archivo para cambiar el logo
window.COLEGIO_ANIO    = '2026';
window.APO_DOMAIN      = '@apo.jad.pe';          // dominio de cuentas de apoderados (se actualiza desde config/general)

// ── Conexión Supabase — no editar ────────────────────────────
const SUPABASE_URL      = 'https://bqnhlzwdibcmstqzspmj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbmhsendkaWJjbXN0cXpzcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODY2MTAsImV4cCI6MjA5MDY2MjYxMH0.mm7eMEOMzylzKeWJbcI_gHaHbwnGpQo0UVhZUOB9q2s';
window.COLEGIO_ID       = 'sigece'; // slug del colegio, debe existir en tabla colegios

// ── Inicializar cliente Supabase ─────────────────────────────
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'asmqr_auth_' + COLEGIO_ID }
});
window._sb = _sb; // disponible para db_supabase.js

window.ASMQR_COST_AUDIT = window.ASMQR_COST_AUDIT || (function(){
  function _nowIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function _safeJsonParse(s) { try { return JSON.parse(s); } catch(e) { return null; } }
  function _byteLen(x) {
    try {
      if (x == null) return 0;
      if (typeof x === 'string') return new TextEncoder().encode(x).length;
      if (x instanceof ArrayBuffer) return x.byteLength;
      if (ArrayBuffer.isView(x)) return x.byteLength;
      if (typeof Blob !== 'undefined' && x instanceof Blob) return x.size || 0;
      return new TextEncoder().encode(JSON.stringify(x)).length;
    } catch(e) { return 0; }
  }
  const KEY = 'asmqr_cost_audit_v1';
  const state = {
    enabled: false,
    deepBytes: false,
    day: _nowIso(),
    counters: {
      rest: 0,
      auth: 0,
      functions: 0,
      storage: 0,
      other: 0,
      bytesOut: 0,
      bytesIn: 0,
      errors: 0
    },
    byPath: {}
  };
  function _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if(!raw) return;
      const obj = _safeJsonParse(raw);
      if(!obj || typeof obj !== 'object') return;
      if(obj.day) state.day = obj.day;
      if(obj.counters) state.counters = { ...state.counters, ...obj.counters };
      if(obj.byPath) state.byPath = obj.byPath;
      if(typeof obj.enabled === 'boolean') state.enabled = obj.enabled;
      if(typeof obj.deepBytes === 'boolean') state.deepBytes = obj.deepBytes;
    } catch(e) {}
  }
  function _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        enabled: state.enabled,
        deepBytes: state.deepBytes,
        day: state.day,
        counters: state.counters,
        byPath: state.byPath
      }));
    } catch(e) {}
  }
  function reset() {
    state.day = _nowIso();
    state.counters = { rest:0, auth:0, functions:0, storage:0, other:0, bytesOut:0, bytesIn:0, errors:0 };
    state.byPath = {};
    _save();
  }
  function enable(v=true, { deepBytes=false } = {}) {
    state.enabled = !!v;
    state.deepBytes = !!deepBytes;
    const today = _nowIso();
    if(state.day !== today) reset();
    _save();
  }
  function isEnabled() { return !!state.enabled; }
  function setDeepBytes(v) { state.deepBytes = !!v; _save(); }
  function _bump(kind, urlStr, outBytes, inBytes, ok) {
    const today = _nowIso();
    if(state.day !== today) reset();
    state.counters[kind] = (state.counters[kind] || 0) + 1;
    state.counters.bytesOut += outBytes || 0;
    state.counters.bytesIn  += inBytes || 0;
    if(!ok) state.counters.errors += 1;
    const u = String(urlStr || '');
    const key = u.replace(SUPABASE_URL, '').split('?')[0];
    const bp = state.byPath[key] || { count: 0, bytesOut: 0, bytesIn: 0, errors: 0 };
    bp.count += 1;
    bp.bytesOut += outBytes || 0;
    bp.bytesIn += inBytes || 0;
    if(!ok) bp.errors += 1;
    state.byPath[key] = bp;
    _save();
  }
  function exportData() {
    const today = _nowIso();
    if(state.day !== today) reset();
    return {
      schema: 'asmqr-cost-audit-v1',
      colegio_id: (typeof COLEGIO_ID !== 'undefined') ? COLEGIO_ID : null,
      supabase_url: SUPABASE_URL,
      day: state.day,
      enabled: state.enabled,
      deepBytes: state.deepBytes,
      counters: state.counters,
      byPath: state.byPath
    };
  }
  _load();
  return { enable, isEnabled, setDeepBytes, reset, export: exportData, _bump, _byteLen };
})();

if(!window.__asmqrFetchWrapped) {
  window.__asmqrFetchWrapped = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const audit = window.ASMQR_COST_AUDIT;
    const enabled = audit && audit.isEnabled && audit.isEnabled();
    if(!enabled) return _origFetch(input, init);
    const urlStr = (typeof input === 'string') ? input : (input && input.url) ? input.url : String(input || '');
    const m = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
    let kind = 'other';
    try {
      if(urlStr.startsWith(SUPABASE_URL + '/rest/v1/')) kind = 'rest';
      else if(urlStr.startsWith(SUPABASE_URL + '/auth/v1/')) kind = 'auth';
      else if(urlStr.startsWith(SUPABASE_URL + '/functions/v1/')) kind = 'functions';
      else if(urlStr.includes('/storage/v1/')) kind = 'storage';
    } catch(e) {}
    const outBytes = (function(){
      try {
        const b = init && init.body;
        if(!b) return 0;
        if(typeof b === 'string') return audit._byteLen(b);
        if(b instanceof URLSearchParams) return audit._byteLen(b.toString());
        if(typeof FormData !== 'undefined' && b instanceof FormData) return 0;
        return audit._byteLen(b);
      } catch(e) { return 0; }
    })();
    let res;
    try {
      res = await _origFetch(input, init);
    } catch(e) {
      try { audit._bump(kind, urlStr, outBytes, 0, false); } catch(_) {}
      throw e;
    }
    let inBytes = 0;
    try {
      const cl = res.headers && res.headers.get ? res.headers.get('content-length') : null;
      if(cl) inBytes = parseInt(cl, 10) || 0;
      else if(audit && audit.export && audit.export().deepBytes) {
        try {
          const ab = await res.clone().arrayBuffer();
          inBytes = ab.byteLength || 0;
        } catch(_) {}
      }
    } catch(e) {}
    try { audit._bump(kind, urlStr, outBytes, inBytes, res.ok); } catch(_) {}
    return res;
  };
}

// ============================================================
// CONVERSIÓN snake_case ↔ camelCase
// ============================================================
function _toSnake(str) {
  return str.replace(/([A-Z])/g, c => '_' + c.toLowerCase());
}
function _toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function _rowToDoc(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[_toCamel(k)] = v;
  // Asegurar que 'id' esté al nivel raíz
  if (row.id !== undefined && !out.id) out.id = row.id;
  return out;
}
function _docToRow(data, colegioId) {
  const out = { colegio_id: colegioId || COLEGIO_ID };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id') { out.id = v; continue; }
    if (k === 'timestamp') continue; // created_at tiene DEFAULT NOW() en Supabase
    if (v === null || v === undefined) continue; // dejar que Supabase use DEFAULT
    // Ignorar FieldValues especiales — se manejan abajo
    if (v && v.__type === 'serverTimestamp') { out[_toSnake(k)] = new Date().toISOString(); continue; }
    if (v && v.__type === 'increment')       { /* manejar con RPC */ continue; }
    out[_toSnake(k)] = v;
  }
  return out;
}

// ============================================================
// MAPEO ESPECIAL: colección "config" → tabla "colegios"
// Firestore guarda config en docs separados (general, factiliza).
// Supabase los guarda como columnas JSONB en la tabla colegios.
// ============================================================
const _CONFIG_FIELD_MAP = {
  general:    ['nombre','anio','eslogan','logo_url','apo_domain','niveles','grados','secciones','banner_imagenes','rol_examenes_config'],
  factiliza:  ['factiliza_token','factiliza_instancia'],
  alumnos_ts: [], // solo se usaba como señal — Realtime lo reemplaza
};

async function _getConfig(docId) {
  if (docId === 'alumnos_ts') return { exists: false, data: () => ({}) };
  if (docId === 'factiliza') {
    const { data, error } = await _sb
      .from('colegios')
      .select('id,factiliza_token,factiliza_instancia')
      .eq('id', COLEGIO_ID)
      .single();
    if (error || !data) return { exists: false, data: () => ({ token: '', instancia: '' }) };
    return {
      exists: true,
      data: () => ({
        token:     data.factiliza_token || '',
        instancia: data.factiliza_instancia || '',
      })
    };
  }
  let data = null;
  let error = null;
  ({ data, error } = await _sb
    .from('colegios')
    .select('id,nombre,anio,eslogan,logo_url,apo_domain,niveles,grados,secciones,banner_imagenes,rol_examenes_config')
    .eq('id', COLEGIO_ID)
    .single());
  if (error && String(error.message || '').includes('rol_examenes_config')) {
    ({ data, error } = await _sb
      .from('colegios')
      .select('id,nombre,anio,eslogan,logo_url,apo_domain,niveles,grados,secciones,banner_imagenes')
      .eq('id', COLEGIO_ID)
      .single());
  }
  if (error || !data) return { exists: false, data: () => ({}) };
  // general: devuelve todo el colegio como config
  try {
    const d = String(data.apo_domain || '').trim().toLowerCase();
    if(d) window.APO_DOMAIN = '@' + d.replace(/^@+/, '');
  } catch(e) {}
  return {
    exists: true,
    data: () => ({
      nombreColegio: data.nombre,
      anio:          data.anio,
      eslogan:       data.eslogan,
      logoUrl:       data.logo_url,
      apoDomain:     data.apo_domain,
      niveles:       Array.isArray(data.niveles)   ? data.niveles   : JSON.parse(data.niveles   || '[]'),
      grados:        typeof data.grados === 'object'? data.grados   : JSON.parse(data.grados    || '{}'),
      secciones:     Array.isArray(data.secciones) ? data.secciones : JSON.parse(data.secciones || '[]'),
      bannerImagenes: Array.isArray(data.banner_imagenes) ? data.banner_imagenes : JSON.parse(data.banner_imagenes || '[]'),
      rolExamenesConfig: (data.rol_examenes_config && typeof data.rol_examenes_config === 'object')
        ? data.rol_examenes_config
        : (data.rol_examenes_config ? JSON.parse(data.rol_examenes_config || '{}') : {}),
    })
  };
}

async function _setConfig(docId, data, options = {}) {
  if (docId === 'alumnos_ts') return; // no necesario con Realtime
  const update = {};
  if (docId === 'factiliza') {
    if (data.token     !== undefined) update.factiliza_token     = data.token;
    if (data.instancia !== undefined) update.factiliza_instancia = data.instancia;
  } else {
    // general
    if (data.niveles   !== undefined) update.niveles   = data.niveles;
    if (data.grados    !== undefined) update.grados    = data.grados;
    if (data.secciones !== undefined) update.secciones = data.secciones;
    if (data.bannerImagenes !== undefined) update.banner_imagenes = data.bannerImagenes;
    if (data.nombreColegio !== undefined) update.nombre = data.nombreColegio;
    if (data.nombre !== undefined) update.nombre = data.nombre;
    if (data.anio   !== undefined) update.anio   = data.anio;
    if (data.eslogan !== undefined) update.eslogan = data.eslogan;
    if (data.logoUrl !== undefined) update.logo_url = data.logoUrl;
    if (data.apoDomain !== undefined) update.apo_domain = data.apoDomain;
    if (data.rolExamenesConfig !== undefined) update.rol_examenes_config = data.rolExamenesConfig;
  }
  if (!Object.keys(update).length) return;
  let res = await _sb.from('colegios').update(update).eq('id', COLEGIO_ID);
  if (res.error && String(res.error.message || '').includes('rol_examenes_config')) {
    const retry = { ...update };
    delete retry.rol_examenes_config;
    res = await _sb.from('colegios').update(retry).eq('id', COLEGIO_ID);
  }
  if (res.error) throw new Error(res.error.message);
}

// ============================================================
// CLASE DocumentRef — emula firebase.firestore.DocumentReference
// ============================================================
class _DocRef {
  constructor(collection, id) {
    this._col = collection;
    this._id  = id;
  }
  get id() { return this._id; }

  onSnapshot(callback, errorCallback) {
    // 1. Carga inicial
    this.get()
      .then(snap => callback(snap))
      .catch(err => errorCallback && errorCallback(err));
    // 2. Realtime para cambios en este documento
    const channelName = this._col + '_doc_' + this._id + '_' + Date.now();
    const channel = _sb.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: this._col,
        filter: `colegio_id=eq.${COLEGIO_ID}` }, (payload) => {
        if (payload.new?.id !== this._id && payload.old?.id !== this._id) return;
        this.get()
          .then(snap => callback(snap))
          .catch(err => errorCallback && errorCallback(err));
      })
      .subscribe();
    return () => { _sb.removeChannel(channel); };
  }

  async get() {
    if (this._col === 'config') return _getConfig(this._id);

    const { data, error } = await _sb.from(this._col).select('*')
      .eq('colegio_id', COLEGIO_ID).eq('id', this._id).maybeSingle();
    console.log('[compat.get]', this._col, this._id, 'data:', data, 'error:', error);
    if (error) throw new Error(error.message);
    return {
      exists: !!data,
      id:     this._id,
      data:   () => data ? _rowToDoc(data) : null,
    };
  }

  async set(data, options = {}) {
    if (this._col === 'config') return _setConfig(this._id, data, options);
    const row = _docToRow(data);
    row.id = this._id;
    // apoderados usa alumno_id como FK histórica — siempre incluirlo
    if (this._col === 'apoderados') row.alumno_id = this._id;
    let res = await _sb.from(this._col).upsert(row, { onConflict: 'colegio_id,id' });
    if (res.error) {
      const msg = String(res.error.message || '');
      if (msg.includes('no unique or exclusion constraint matching the ON CONFLICT specification')) {
        res = await _sb.from(this._col).upsert(row, { onConflict: 'id' });
      }
    }
    if (res.error) throw new Error(res.error.message);
  }

  async update(data) {
    if (this._col === 'config') return _setConfig(this._id, data, { merge: true });
    const update = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && v.__type === 'serverTimestamp') { update[_toSnake(k)] = new Date().toISOString(); continue; }
      update[_toSnake(k)] = v;
    }
    const { error } = await _sb.from(this._col)
      .update(update).eq('colegio_id', COLEGIO_ID).eq('id', this._id);
    if (error) throw new Error(error.message);
  }

  async delete() {
    const { error } = await _sb.from(this._col)
      .delete().eq('colegio_id', COLEGIO_ID).eq('id', this._id);
    if (error) throw new Error(error.message);
  }
}

// ============================================================
// CLASE Query — emula firebase.firestore.Query (encadenamiento)
// ============================================================
class _Query {
  constructor(collection) {
    this._col      = collection;
    this._filters  = [];
    this._orderCol = null;
    this._limitN   = null;
    this._onSnapCb = null;
  }

  where(field, op, value) {
    const q = this._clone();
    q._filters.push({ field: _toSnake(field), op, value });
    return q;
  }

  orderBy(field) {
    const q = this._clone();
    q._orderCol = _toSnake(field);
    return q;
  }

  limit(n) {
    const q = this._clone();
    q._limitN = n;
    return q;
  }

  startAfter(doc) {
    // Para paginación — devuelve un nuevo query con offset implícito
    // Supabase usa .range() o .gt() — implementación simplificada
    const q = this._clone();
    q._startAfterDoc = doc;
    return q;
  }

  _clone() {
    const q = new _Query(this._col);
    q._filters  = [...this._filters];
    q._orderCol = this._orderCol;
    q._limitN   = this._limitN;
    q._startAfterDoc = this._startAfterDoc;
    return q;
  }

  _buildQuery() {
    let q = _sb.from(this._col).select('*').eq('colegio_id', COLEGIO_ID);
    for (const { field, op, value } of this._filters) {
      if (op === '=='  || op === '===') q = q.eq(field,  value);
      else if (op === '>=' )            q = q.gte(field, value);
      else if (op === '<=' )            q = q.lte(field, value);
      else if (op === '>' )             q = q.gt(field,  value);
      else if (op === '<' )             q = q.lt(field,  value);
      else if (op === 'in')             q = q.in(field,  value);
      else if (op === 'array-contains') q = q.contains(field, [value]);
    }
    if (this._orderCol) q = q.order(this._orderCol);
    if (this._limitN)   q = q.limit(this._limitN);
    return q;
  }

  async get() {
    const { data, error } = await this._buildQuery();
    if (error) throw new Error(error.message);
    const docs = (data || []).map(row => ({
      id:     row.id,
      exists: true,
      data:   () => _rowToDoc(row),
      ref:    new _DocRef(this._col, row.id),
    }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  // Emula onSnapshot usando Supabase Realtime + polling inicial
  onSnapshot(callback, errorCallback) {
    // 1. Carga inicial
    this.get()
      .then(snap => callback(snap))
      .catch(err => errorCallback && errorCallback(err));

    // 2. Suscripción Realtime para actualizaciones
    const channelName = this._col + '_' + Date.now();
    let filter = `colegio_id=eq.${COLEGIO_ID}`;

    // Añadir filtro de fecha si existe (optimización para scanner)
    const fechaFilter = this._filters.find(f => f.field === 'fecha' && f.op === '==');
    if (fechaFilter) filter += `,fecha=eq.${fechaFilter.value}`;

    const channel = _sb.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: this._col, filter }, () => {
        this.get()
          .then(snap => callback(snap))
          .catch(err => errorCallback && errorCallback(err));
      })
      .subscribe();

    // Devuelve función para cancelar la suscripción (como hace Firebase)
    return () => { _sb.removeChannel(channel); };
  }
}

// ============================================================
// CLASE CollectionRef — emula firebase.firestore.CollectionReference
// ============================================================
class _CollectionRef extends _Query {
  doc(id) { return new _DocRef(this._col, id); }

  async add(data) {
    const row = _docToRow(data);
    if (!row.id) row.id = crypto.randomUUID();
    console.log('[compat.add] inserting into', this._col, JSON.stringify(row));
    const { data: inserted, error } = await _sb.from(this._col).insert(row).select().single();
    if (error) {
      console.error('[compat.add] ERROR:', JSON.stringify(error));
      throw new Error(error.message);
    }
    return new _DocRef(this._col, inserted.id);
  }
}

// ============================================================
// OBJETO db — reemplaza firebase.firestore()
// ============================================================
const db = {
  collection: (name) => new _CollectionRef(name),
  batch: () => new _Batch(),
};

// ============================================================
// CLASE Batch — emula firebase.firestore.WriteBatch
// ============================================================
class _Batch {
  constructor() { this._ops = []; }

  set(ref, data, options = {}) {
    this._ops.push({ type: 'set', ref, data, options });
    return this;
  }
  update(ref, data) {
    this._ops.push({ type: 'update', ref, data });
    return this;
  }
  delete(ref) {
    this._ops.push({ type: 'delete', ref });
    return this;
  }

  async commit() {
    for (const op of this._ops) {
      if (op.type === 'set')    await op.ref.set(op.data, op.options);
      if (op.type === 'update') await op.ref.update(op.data);
      if (op.type === 'delete') await op.ref.delete();
    }
  }
}

// ============================================================
// FIREBASE COMPAT — emula los helpers de firebase.* usados en index.html
// ============================================================
const firebase = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => ({ __type: 'serverTimestamp' }),
      increment:       (n) => ({ __type: 'increment', value: n }),
    }
  },
  auth: () => ({
    currentUser: _sb.auth.getUser ? null : null, // se actualiza en onAuthStateChanged
  }),
  initializeApp: (_config, name) => {
    // Usado para crear usuarios con app secundaria — delegar a Edge Function
    return { auth: () => new _SecondaryAuth(), delete: async () => {} };
  },
  storage: () => ({
    ref: (path) => new _StorageRef(path),
  }),
};

// Estado global del usuario autenticado (actualizado por onAuthStateChange)
let _currentAuthUser = null;
firebase.auth = () => ({ currentUser: _currentAuthUser });

// ============================================================
// AUTH — emula firebase.auth()
// ============================================================
const auth = {
  currentUser: null,

  setPersistence: async () => {}, // Supabase maneja persistencia automáticamente

  async signInWithEmailAndPassword(email, pass) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      // Traducir errores de Supabase al formato de Firebase
      const map = {
        'Invalid login credentials':    { code: 'auth/invalid-credential' },
        'Email not confirmed':          { code: 'auth/user-not-found' },
        'Too many requests':            { code: 'auth/too-many-requests' },
        'User not found':               { code: 'auth/user-not-found' },
      };
      const matched = Object.entries(map).find(([k]) => error.message.includes(k));
      const code = matched ? matched[1].code : 'auth/unknown';
      throw { code, message: error.message };
    }
    return { user: _mapUser(data.user) };
  },

  async signOut() {
    await _sb.auth.signOut();
  },

  onAuthStateChanged(callback) {
    // Llamar con sesión actual si existe
    _sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        _currentAuthUser = _mapUser(session.user);
        auth.currentUser = _currentAuthUser;
        callback(_currentAuthUser);
      } else {
        _currentAuthUser = null;
        auth.currentUser = null;
        callback(null);
      }
    });

    // Suscribirse a cambios de sesión
    const { data: { subscription } } = _sb.auth.onAuthStateChange((_event, session) => {
      // TOKEN_REFRESHED y SIGNED_IN repetidos: Supabase refresca el JWT al volver
      // el foco a la pestaña. Solo actualizar en memoria, NO re-inicializar la app.
      if (_event === 'TOKEN_REFRESHED') {
        if (session) { _currentAuthUser = _mapUser(session.user); auth.currentUser = _currentAuthUser; }
        return;
      }
      if (_event === 'SIGNED_IN' && _currentAuthUser) {
        // Ya estaba autenticado — solo actualizar token silenciosamente
        if (session) { _currentAuthUser = _mapUser(session.user); auth.currentUser = _currentAuthUser; }
        return;
      }
      if (session) {
        _currentAuthUser = _mapUser(session.user);
        auth.currentUser = _currentAuthUser;
        callback(_currentAuthUser);
      } else {
        _currentAuthUser = null;
        auth.currentUser = null;
        callback(null);
      }
    });

    return () => subscription.unsubscribe();
  },
};

// Añadir helpers estáticos al objeto auth (como firebase.auth.Auth.Persistence)
auth.Auth = { Persistence: { SESSION: 'session', LOCAL: 'local' } };
auth.EmailAuthProvider = {
  credential: (email, pass) => ({ email, pass, __type: 'credential' })
};

// ============================================================
// USER OBJECT — emula el usuario de Firebase Auth
// ============================================================
function _mapUser(sbUser) {
  if (!sbUser) return null;
  const meta = sbUser.app_metadata || {};
  return {
    uid:   sbUser.id,
    email: sbUser.email,
    async getIdToken(forceRefresh) {
      if (forceRefresh) {
        const { data } = await _sb.auth.refreshSession();
        return data?.session?.access_token || '';
      }
      const { data: { session } } = await _sb.auth.getSession();
      return session?.access_token || '';
    },
    async updateProfile(profile) {
      // displayName no es nativo en Supabase — ignorar
    },
    async reauthenticateWithCredential(cred) {
      const { error } = await _sb.auth.signInWithPassword({ email: cred.email, password: cred.pass });
      if (error) throw { code: 'auth/wrong-password', message: error.message };
    },
    async updatePassword(newPass) {
      await _sb.auth.refreshSession();
      const { error } = await _sb.auth.updateUser({ password: newPass });
      if (error) {
        const esMismaPass = error.message.toLowerCase().includes('different');
        throw {
          code: esMismaPass ? 'auth/same-password' : 'auth/update-failed',
          message: esMismaPass ? 'La nueva contraseña debe ser diferente a la actual.' : error.message,
        };
      }
    },
  };
}

// ============================================================
// AUTH SECUNDARIA — emula firebase.initializeApp(config, name).auth()
// Usado para crear cuentas de apoderados sin cerrar la sesión actual.
// En Supabase esto requiere una Edge Function con service_role key.
// ============================================================
class _SecondaryAuth {
  async createUserWithEmailAndPassword(email, pass, extra = {}) {
    // _SecondaryAuth solo crea apoderados (self-registro sin token)
    // La Edge Function verifica el DNI en la tabla alumnos
    const dni = typeof extra.dni === 'string' ? extra.dni.trim() : '';
    const emailReal = typeof extra.emailReal === 'string' ? extra.emailReal.trim().toLowerCase() : '';
    const res = await fetch(`${SUPABASE_URL}/functions/v1/crear-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password: pass, colegioId: COLEGIO_ID, dni, emailReal }),
    });
    const result = await res.json();
    if (!res.ok) {
      const code = result.code || 'auth/unknown';
      throw { code, message: result.error || 'Error creando usuario' };
    }
    return { user: result.user };
  }
  async signOut() {}
  async delete() {}
}

// Exponer storage (si Firebase Storage aún se usa para PDFs)
// Se puede dejar en Firebase Storage sin migrar en esta fase
const storage = {
  ref: (path) => ({ put: async () => {}, getDownloadURL: async () => '' })
};

// ============================================================
// SUPABASE STORAGE HELPER — para imágenes de incidentes
// ============================================================
const _sbStorage = {
  async upload(bucket, path, blob, contentType = 'image/jpeg') {
    const { error } = await _sb.storage.from(bucket)
      .upload(path, blob, { upsert: true, contentType });
    if (error) throw new Error('[storage] ' + error.message);
  },
  async signedUrl(bucket, path, seconds) {
    const { data, error } = await _sb.storage.from(bucket)
      .createSignedUrl(path, seconds);
    if (error) throw new Error('[storage] ' + error.message);
    return data.signedUrl;
  },
  async remove(bucket, path) {
    await _sb.storage.from(bucket).remove([path]);
  }
};
window._sbStorage = _sbStorage;

// Exponer globalmente para que index.html los use sin Firebase CDN
window.firebase = firebase;
window.db       = db;
window.auth     = auth;

// ============================================================
// INICIAR REALTIME al cargar
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof iniciarRealtimeListeners === 'function') {
    // Se llama desde db_supabase.js tras el login
  }
});
