// ============================================================
// DB_SUPABASE — reemplazo drop-in de db.js para Supabase
// Misma API que DB en db.js → index.html no necesita cambios.
//
// Depende de:
//   - window._sb  (cliente Supabase, expuesto por compat.js)
//   - window.COLEGIO_ID (ej: 'sigece')
//   - LSC (cache localStorage, definido en index.html)
// ============================================================
// eslint-disable-next-line no-var
var supabase = window._sb; // sobreescribir referencia de librería con el cliente activo

const DB = {

  // ── ALUMNOS ───────────────────────────────────────────────

  _alumnosCache: null,
  _alumnosScopedCache: {},

  async getAlumnos() {
    if (this._alumnosCache) return this._alumnosCache;
    const lsData = LSC.get('alumnos');
    if (lsData) { this._alumnosCache = lsData; return lsData; }

    const { data, error } = await supabase
      .from('alumnos')
      .select('*')
      .eq('colegio_id', COLEGIO_ID);

    if (error) { console.error('[DB] getAlumnos:', error.message); return []; }

    // Normalizar nombres de campos (snake_case → camelCase para compat. con código actual)
    this._alumnosCache = data.map(_normAlumno);
    LSC.set('alumnos', this._alumnosCache, LSC.TTL_ALUMNOS);
    return this._alumnosCache;
  },

  // Carga solo los alumnos de los grados/secciones asignadas al profesor.
  // asignaciones: { 'grado': ['A','B'] }
  async getAlumnosScoped(asignaciones) {
    const grados = Object.keys(asignaciones || {});
    if (!grados.length) return this.getAlumnos();

    const cacheKey = 'scoped:' + grados.sort().join(',');
    if (this._alumnosScopedCache[cacheKey]) return this._alumnosScopedCache[cacheKey];
    const lsData = LSC.get(cacheKey);
    if (lsData) { this._alumnosScopedCache[cacheKey] = lsData; return lsData; }

    // Supabase: WHERE grado IN (...) — sin límite de 10 como Firestore
    const { data, error } = await supabase
      .from('alumnos')
      .select('*')
      .eq('colegio_id', COLEGIO_ID)
      .in('grado', grados);

    if (error) { console.error('[DB] getAlumnosScoped:', error.message); return []; }

    const result = data
      .map(_normAlumno)
      .filter(a => {
        const seccs = asignaciones[a.grado];
        if (!Array.isArray(seccs) || !seccs.length) return true;
        return seccs.includes(a.seccion);
      });

    this._alumnosScopedCache[cacheKey] = result;
    LSC.set(cacheKey, result, LSC.TTL_ALUMNOS);
    return result;
  },

  invalidarAlumnos() {
    this._alumnosCache = null;
    this._alumnosScopedCache = {};
    LSC.del('alumnos');
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('asmqr_scoped:'))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  },

  async bumpAlumnosVersion() {
    // En Supabase usamos Realtime — no necesitamos doc de versión.
    // El canal de Realtime notifica automáticamente a otros dispositivos.
    // Este método existe solo para compatibilidad con el código actual.
  },

  async saveAlumno(alumno) {
    const cleanId = (alumno.id || '').trim().replace(/\s+/g, '');
    const row = _alumnoToRow({ ...alumno, id: cleanId });

    const { error } = await supabase
      .from('alumnos')
      .upsert(row, { onConflict: 'colegio_id,id' });

    if (error) throw new Error(error.message);
    this._alumnosCache = null;
    this._alumnosScopedCache = {};
    LSC.del('alumnos');
  },

  async deleteAlumno(id) {
    const { error } = await supabase
      .from('alumnos')
      .delete()
      .eq('colegio_id', COLEGIO_ID)
      .eq('id', id);

    if (error) throw new Error(error.message);
    this._alumnosCache = null;
    this._alumnosScopedCache = {};
    LSC.del('alumnos');
  },

  async updateAlumnoId(oldId, newData) {
    // En SQL: borrar viejo e insertar nuevo (igual que Firestore batch)
    const { error: errDel } = await supabase
      .from('alumnos').delete()
      .eq('colegio_id', COLEGIO_ID).eq('id', oldId);
    if (errDel) throw new Error(errDel.message);

    const { error: errIns } = await supabase
      .from('alumnos')
      .insert(_alumnoToRow(newData));
    if (errIns) throw new Error(errIns.message);

    this._alumnosCache = null;
    this._alumnosScopedCache = {};
    LSC.del('alumnos');
  },

  // ── REGISTROS ─────────────────────────────────────────────

  _registrosCache: {},
  _registrosCacheTime: {},
  _CACHE_TTL: 5 * 60 * 1000,

  _cacheKey(filtros) {
    if (filtros.fecha && filtros.alumnoId) return 'fecha_alumno:' + filtros.fecha + '_' + filtros.alumnoId;
    if (filtros.fecha)    return 'fecha:' + filtros.fecha;
    if (filtros.alumnoId) return 'alumno:' + filtros.alumnoId;
    if (filtros.mes)      return 'mes:' + filtros.mes;
    if (filtros.anio)     return 'anio:' + filtros.anio;
    if (filtros.desde && filtros.hasta) return 'rango:' + filtros.desde + '_' + filtros.hasta;
    return 'todos';
  },

  _cacheValido(key) {
    const t = this._registrosCacheTime[key];
    if (!t) return false;
    const mesActual  = _mesLocalActual();
    const anioActual = new Date().getFullYear();
    const esMesPasado  = key.startsWith('mes:')  && key.slice(4) < mesActual;
    const esAnioPasado = key.startsWith('anio:') && parseInt(key.slice(5)) < anioActual;
    const esMesActual  = key === 'mes:' + mesActual;
    const ttl = (esMesPasado || esAnioPasado) ? LSC.TTL_REGISTROS_MES_PASADO
              : esMesActual                   ? 30 * 60 * 1000
              :                                 this._CACHE_TTL;
    return (Date.now() - t) < ttl;
  },

  async getRegistros(filtros = {}) {
    const key = this._cacheKey(filtros);
    if (this._registrosCache[key] && this._cacheValido(key)) return this._registrosCache[key];
    if (key === 'todos' || key.startsWith('fecha:')) {
      const lsData = LSC.get('reg_' + key);
      if (lsData) {
        this._registrosCache[key] = lsData;
        this._registrosCacheTime[key] = Date.now();
        return lsData;
      }
    }

    try {
      let q = supabase
        .from('registros')
        .select('*')
        .eq('colegio_id', COLEGIO_ID);

      if (filtros.fecha)    q = q.eq('fecha', filtros.fecha);
      if (filtros.alumnoId) q = q.eq('alumno_id', filtros.alumnoId);
      if (filtros.mes) {
        const [y, m] = filtros.mes.split('-').map(Number);
        const desde  = filtros.mes + '-01';
        const hasta  = filtros.mes + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
        q = q.gte('fecha', desde).lte('fecha', hasta).order('fecha');
      }
      if (filtros.anio) {
        q = q.gte('fecha', filtros.anio + '-01-01').lte('fecha', filtros.anio + '-12-31').order('fecha');
      }
      if (filtros.desde && filtros.hasta) {
        q = q.gte('fecha', filtros.desde).lte('fecha', filtros.hasta).order('fecha');
      }

      const { data, error } = await q;
      if (error) { console.error('[DB] getRegistros:', error.message); return []; }

      const resultado = data.map(_normRegistro).sort((a, b) => (b.hora || '').localeCompare(a.hora || ''));

      this._registrosCache[key] = resultado;
      this._registrosCacheTime[key] = Date.now();
      if (key === 'todos' || key.startsWith('fecha:') || key.startsWith('mes:')) {
        const mesActual   = _mesLocalActual();
        const esMesPasado = key.startsWith('mes:') && key.slice(4) < mesActual;
        const esMesActual = key === 'mes:' + mesActual;
        const ttlLS = esMesPasado ? LSC.TTL_REGISTROS_MES_PASADO
                    : esMesActual ? 30 * 60 * 1000
                    :               LSC.TTL_REGISTROS;
        LSC.set('reg_' + key, resultado, ttlLS);
      }
      return resultado;
    } catch (e) {
      console.error('[DB] getRegistros error:', e);
      return [];
    }
  },

  invalidarRegistros(fecha = null) {
    if (fecha) {
      delete this._registrosCache['fecha:' + fecha];
      delete this._registrosCacheTime['fecha:' + fecha];
      delete this._registrosCache['todos'];
      delete this._registrosCacheTime['todos'];
      LSC.del('reg_fecha:' + fecha);
      LSC.del('reg_todos');
      Object.keys(this._registrosCache)
        .filter(k => k.startsWith('fecha_alumno:' + fecha))
        .forEach(k => { delete this._registrosCache[k]; delete this._registrosCacheTime[k]; });
      const mes = fecha.substring(0, 7);
      delete this._resumenMesCache[mes];
      delete this._resumenMesCacheTime[mes];
    } else {
      this._registrosCache = {};
      this._registrosCacheTime = {};
      this._resumenMesCache = {};
      this._resumenMesCacheTime = {};
      try {
        Object.keys(localStorage).filter(k => k.startsWith('asmqr_reg_')).forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }
  },

  async saveRegistro(reg) {
    // Obtener usuario actual de Supabase Auth
    const { data: { user } } = await _sb.auth.getUser();
    if (!reg.registradoPor && user) reg.registradoPor = user.email || user.id;

    const row = {
      colegio_id:     COLEGIO_ID,
      alumno_id:      reg.alumnoId,
      tipo:           reg.tipo,
      fecha:          reg.fecha,
      hora:           reg.hora,
      estado:         reg.estado || 'Puntual',
      nombre:         reg.nombre  || '',
      grado:          reg.grado   || '',
      seccion:        reg.seccion || '',
      turno:          reg.turno   || '',
      registrado_por: reg.registradoPor || '',
    };

    const { error } = await _sb.from('registros').insert(row);
    if (error) throw new Error(error.message);

    this.invalidarRegistros(reg.fecha);

    // Actualizar resumen_mensual usando la función SQL (equivale a FieldValue.increment)
    if (reg.tipo === 'INGRESO') {
      const mes        = reg.fecha.substring(0, 7);
      const esTardanza = (reg.estado || '').trim() === 'Tardanza';
      const { error: eRes } = await _sb.rpc('upsert_resumen_mensual', {
        p_colegio_id:  COLEGIO_ID,
        p_mes:         mes,
        p_alumno_id:   reg.alumnoId,
        p_es_tardanza: esTardanza,
      });
      if (eRes) console.warn('[DB] resumen_mensual update failed:', eRes.message);
    }
  },

  // ── RESUMEN MENSUAL ───────────────────────────────────────

  _resumenMesCache: {},
  _resumenMesCacheTime: {},

  async getResumenMes(mes) {
    const mesActual = _mesLocalActual();
    const esPasado  = mes < mesActual;
    const ttl       = esPasado ? (30 * 24 * 60 * 60 * 1000) : (5 * 60 * 1000);
    const cached    = this._resumenMesCache[mes];
    const t         = this._resumenMesCacheTime[mes];
    if (cached && t && (Date.now() - t) < ttl) return cached;

    const { data, error } = await supabase
      .from('resumen_mensual')
      .select('alumno_id, puntual, tardanza')
      .eq('colegio_id', COLEGIO_ID)
      .eq('mes', mes);

    if (error) { console.warn('[DB] getResumenMes:', error.message); return []; }

    const result = data.map(r => ({
      alumnoId: r.alumno_id,
      puntual:  r.puntual  || 0,
      tardanza: r.tardanza || 0,
    }));

    this._resumenMesCache[mes] = result;
    this._resumenMesCacheTime[mes] = Date.now();
    return result;
  },

  async deleteRegistrosByFecha(fecha) {
    // Obtener alumnoIds afectados antes de borrar (para recalcular resumen)
    const { data: prevData } = await supabase
      .from('registros')
      .select('alumno_id')
      .eq('colegio_id', COLEGIO_ID)
      .eq('fecha', fecha)
      .eq('tipo', 'INGRESO');

    const alumnoIds = [...new Set((prevData || []).map(r => r.alumno_id))];

    const { error } = await supabase
      .from('registros')
      .delete()
      .eq('colegio_id', COLEGIO_ID)
      .eq('fecha', fecha);

    if (error) throw new Error(error.message);
    this.invalidarRegistros(fecha);

    // Recalcular resumen para los alumnos afectados
    if (alumnoIds.length) {
      const mes = fecha.substring(0, 7);
      for (const alumnoId of alumnoIds) {
        _sb.rpc('recalcular_resumen_mes', {
          p_colegio_id: COLEGIO_ID,
          p_mes:        mes,
          p_alumno_id:  alumnoId,
        }).then(({ error: e }) => {
          if (e) console.warn('[DB] recalcular_resumen_mes:', alumnoId, e.message);
        });
      }
    }
  },

};  // fin DB

// ============================================================
// REALTIME — reemplaza onSnapshot de Firestore
// Notifica a todos los dispositivos conectados cuando cambian
// alumnos o config, invalidando su cache automáticamente.
// ============================================================

let _realtimeChannel = null;

function iniciarRealtimeListeners() {
  if (_realtimeChannel) return;

  _realtimeChannel = supabase
    .channel('db-changes')

    // Cambios en alumnos → invalidar cache (equivale a onSnapshot config/alumnos_ts)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'alumnos', filter: `colegio_id=eq.${COLEGIO_ID}` },
      () => {
        DB.invalidarAlumnos();
        const secAlumnos = document.getElementById('sec-alumnos');
        if (secAlumnos && secAlumnos.style.display !== 'none' && secAlumnos.style.display !== '') {
          if (typeof renderAlumnos === 'function') renderAlumnos();
        }
      }
    )

    // Cambios en config (colegios) → invalidar cache de config
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'colegios', filter: `id=eq.${COLEGIO_ID}` },
      () => {
        if (typeof invalidateConfig === 'function') invalidateConfig();
        const secConfig = document.getElementById('sec-config');
        if (secConfig && secConfig.style.display !== 'none' && secConfig.style.display !== '') {
          if (typeof renderConfig === 'function') renderConfig();
        }
      }
    )

    .subscribe();
}

function detenerRealtimeListeners() {
  if (_realtimeChannel) {
    _sb.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

// ============================================================
// NORMALIZACIÓN — convierte snake_case (SQL) ↔ camelCase (JS)
// ============================================================

function _normAlumno(row) {
  return {
    id:                  row.id,
    nombres:             row.nombres             || '',
    apellidos:           row.apellidos           || '',
    grado:               row.grado               || '',
    seccion:             row.seccion             || '',
    turno:               row.turno               || '',
    limite:              row.limite              || '08:00',
    foto:                row.foto                || '',
    apoderadoNombres:    row.apoderado_nombres   || '',
    apoderadoApellidos:  row.apoderado_apellidos || '',
    telefono:            row.telefono            || '',
    apoderado2Nombres:   row.apoderado2_nombres  || '',
    apoderado2Apellidos: row.apoderado2_apellidos|| '',
    telefono2:           row.telefono2           || '',
    correoApoderado:     row.correo_apoderado    || '',
  };
}

function _alumnoToRow(alumno) {
  return {
    colegio_id:           COLEGIO_ID,
    id:                   alumno.id,
    nombres:              alumno.nombres             || '',
    apellidos:            alumno.apellidos           || '',
    grado:                alumno.grado               || '',
    seccion:              alumno.seccion             || 'A',
    turno:                alumno.turno               || 'Primaria',
    limite:               alumno.limite              || '08:00',
    foto:                 alumno.foto                || '',
    apoderado_nombres:    alumno.apoderadoNombres    || '',
    apoderado_apellidos:  alumno.apoderadoApellidos  || '',
    telefono:             alumno.telefono            || '',
    apoderado2_nombres:   alumno.apoderado2Nombres   || '',
    apoderado2_apellidos: alumno.apoderado2Apellidos || '',
    telefono2:            alumno.telefono2           || '',
    correo_apoderado:     alumno.correoApoderado     || '',
  };
}

function _normRegistro(row) {
  return {
    // El código actual usa alumnoId (camelCase)
    alumnoId:      row.alumno_id,
    tipo:          row.tipo,
    fecha:         typeof row.fecha === 'string' ? row.fecha : row.fecha.toISOString().slice(0, 10),
    hora:          row.hora,
    estado:        row.estado || 'Puntual',
    nombre:        row.nombre  || '',
    grado:         row.grado   || '',
    seccion:       row.seccion || '',
    turno:         row.turno   || '',
    registradoPor: row.registrado_por || '',
  };
}

function _mesLocalActual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
