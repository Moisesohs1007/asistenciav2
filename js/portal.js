

// Nombre, eslogan, logo y APO_DOMAIN vienen de compat.js (editar solo ahí)

var alumno    = null;
var apoData   = {};
var registros = [];
var _registrosCargados = false; // true una vez que cargarRegistros termina
var _configCache   = null; // config/general cacheada
var _incidentesCache = null; // incidentes del alumno cacheados
var _registrosPorMes     = {}; // cache en memoria: { '03': [...], '04': [...] }
var _registrosPorMesTime = {}; // timestamps de cache por mes (para TTL del mes actual)
var _MES_ACTUAL_TTL      = 3 * 60 * 1000; // 3 min — tiempo máximo de datos rancios para hoy
var _resumenMensualCache = {}; // { 'YYYY-MM': {puntual, tardanza} | null }
var _registrosRecientes     = null; // últimos 5 días procesados (para pestaña Resumen)
var _registrosRecientesTime = 0;    // timestamp de última carga
var _RECIENTES_TTL = 5 * 60 * 1000; // 5 minutos

var _agendaPorMes     = {};
var _agendaPorMesTime = {};
var _AGENDA_TTL = 5 * 60 * 1000;

// Cargar config una sola vez
function getConfigCache() {
  if(_configCache) return Promise.resolve(_configCache);
  return db.collection('config').doc('general').get().then(function(snap) {
    _configCache = snap.exists ? snap.data() : {};
    try {
      var nombre = String(_configCache.nombreColegio || window.COLEGIO_NOMBRE || '').trim();
      var eslogan = String(_configCache.esloganColegio || _configCache.eslogan || window.COLEGIO_ESLOGAN || '').trim();
      var logo = String(_configCache.logoColegio || _configCache.logoUrl || window.COLEGIO_LOGO || '').trim();
      var anio = String(_configCache.anio || window.COLEGIO_ANIO || '').trim();
      var apoDom = String(_configCache.apoDomain || _configCache.apo_domain || '').trim().toLowerCase();
      if(nombre) window.COLEGIO_NOMBRE = nombre;
      window.COLEGIO_ESLOGAN = eslogan;
      if(logo) window.COLEGIO_LOGO = logo;
      if(anio) window.COLEGIO_ANIO = anio;
      if(apoDom) window.APO_DOMAIN = '@' + apoDom.replace(/^@+/, '');
      window.__branding = { nombre: window.COLEGIO_NOMBRE, eslogan: window.COLEGIO_ESLOGAN, logo: window.COLEGIO_LOGO, anio: window.COLEGIO_ANIO };
    } catch(e) {}
    return _configCache;
  }).catch(function() {
    _configCache = {};
    return _configCache;
  });
}



// Boton salir — ahora está en el menú del avatar con onclick inline

// Boton guardar nueva pass
document.getElementById('btn-guardar-pass').addEventListener('click', guardarNuevaPass);

// Fallback: si después de 6s apo-app sigue oculto, mostrarlo
setTimeout(function() {
  var app = document.getElementById('apo-app');
  if(app && app.style.display === 'none' || app && !app.style.display) {
    // Solo mostrar si hay usuario logueado
    if(firebase.auth().currentUser) {
      app.style.display = '';
    }
  }
}, 6000);

// Verificar sesion
auth.onAuthStateChanged(function(user) {
  console.log('[APO] auth state:', user ? user.email : 'NO SESSION');
  if(!user) { 
    // Sin sesión — mostrar loading antes de redirigir
    document.getElementById('apo-app').style.display = 'none';
    window.location.href = 'index.html'; 
    return; 
  }
  var dni = null;
  if(user.email.indexOf(APO_DOMAIN) !== -1) {
    dni = user.email.replace(APO_DOMAIN, '');
    console.log('[APO] email virtual, dni:', dni);
  } else {
    console.log('[APO] correo real, intentando alumno_id desde JWT...');
    user.getIdToken(true).then(function(tok) {
      try {
        var b64 = tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        b64 += '='.repeat((4 - (b64.length % 4)) % 4);
        var payload = JSON.parse(atob(b64));
        var aid = (payload && payload.app_metadata && payload.app_metadata.alumno_id) ? String(payload.app_metadata.alumno_id).trim() : '';
        if(/^\d{8}$/.test(aid)) {
          console.log('[APO] alumno_id desde JWT:', aid);
          continuarCargaApoderado(user, aid);
          return;
        }
      } catch(e) {}
      console.log('[APO] JWT sin alumno_id, buscando emailReal:', user.email);
      db.collection('apoderados').where('emailReal', '==', user.email).limit(1).get().then(function(snap) {
        console.log('[APO] emailReal snap.empty:', snap.empty, 'docs:', snap.docs.length);
        if(snap.empty) { auth.signOut(); window.location.href = 'index.html'; return; }
        var dniReal = snap.docs[0].id;
        console.log('[APO] dniReal:', dniReal);
        continuarCargaApoderado(user, dniReal);
      }).catch(function(e) {
        console.error('[APO] ERROR emailReal query:', e.message);
        auth.signOut(); window.location.href = 'index.html';
      });
    }).catch(function() {
      auth.signOut(); window.location.href = 'index.html';
    });
    return;
  }
  continuarCargaApoderado(user, dni);
});

function continuarCargaApoderado(user, dni) {
  console.log('[APO] continuarCarga dni:', dni);
  db.collection('alumnos').doc(dni).get().then(function(snap) {
    console.log('[APO] alumno snap.exists:', snap.exists);
    if(!snap.exists) { auth.signOut(); window.location.href = 'index.html'; return; }
    alumno = Object.assign({ id: dni }, snap.data());
    console.log('[APO] Alumno OK — cargando apoderado...');
    llenarDatos();
    return db.collection('apoderados').doc(dni).get().catch(function() {
      // Si no se puede leer el doc de apoderado (permisos o no existe), continuar igual
      return { exists: false, data: function(){ return {}; } };
    });
  }).then(function(apoSnap) {
    if(!apoSnap) return;
    apoData = apoSnap.exists ? apoSnap.data() : {};
    // Actualizar iniciales con datos del apoderado si están disponibles
    if(apoData.nombres || apoData.apellidos) {
      var n = ((apoData.apellidos||'') + ' ' + (apoData.nombres||'')).trim();
      var p = n.split(' ').filter(function(x){ return x.length > 0; });
      var ini = p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : n.substring(0,2).toUpperCase();
      var el1 = document.getElementById('apo-avatar-initials');
      var el2 = document.getElementById('apo-avatar-initials-menu');
      var el3 = document.getElementById('apo-menu-nombre');
      if(el1) el1.textContent = ini;
      if(el2) el2.textContent = ini;
      if(el3) el3.textContent = n || 'Apoderado';
    }
    var esPrimerIngreso = !apoSnap.exists || apoData.primerIngreso !== false;
    console.log('[APO] primerIngreso=', esPrimerIngreso + ' | existe=' + apoSnap.exists);

    if(esPrimerIngreso) {
      // Mostrar formulario de datos de contacto
      document.getElementById('apo-app').style.display = 'block';
      document.getElementById('inp-apo-nombres').value    = apoData.nombres    || alumno.apoderadoNombres    || '';
      document.getElementById('inp-apo-apellidos').value  = apoData.apellidos  || alumno.apoderadoApellidos  || '';
      document.getElementById('inp-apo-consanguinidad').value = apoData.consanguinidad || '';
      document.getElementById('inp-apo-consanguinidad-otro').value = apoData.consanguinidadDetalle || '';
      document.getElementById('inp-telefono').value       = apoData.telefono   || alumno.telefono            || '';
      document.getElementById('inp-apo-correo').value     = apoData.emailReal  || '';
      document.getElementById('inp-apo2-nombres').value   = apoData.nombres2   || alumno.apoderado2Nombres   || '';
      document.getElementById('inp-apo2-apellidos').value = apoData.apellidos2 || alumno.apoderado2Apellidos || '';
      document.getElementById('inp-apo2-consanguinidad').value = apoData.consanguinidad2 || '';
      document.getElementById('inp-apo2-consanguinidad-otro').value = apoData.consanguinidadDetalle2 || '';
      document.getElementById('inp-apo2-telefono').value  = apoData.telefono2  || alumno.telefono2           || '';
      document.getElementById('inp-apo2-correo').value    = apoData.emailReal2 || '';
      _bindConsanguinidadSelects();
      document.getElementById('modal-cambiar-pass').style.display = 'flex';
    } else {
      var lastTab = null;
      try { lastTab = sessionStorage.getItem('asmqr_apo_lastTab'); } catch(e) {}
      var tabInicial = lastTab || 'resumen';
      cargarRegistros().then(function() {
        showTab(tabInicial);
        apoMsbInit();
        // Mostrar app DESPUÉS de posicionar la pestaña correcta — sin flash
        document.getElementById('apo-app').style.display = '';
      }).catch(function(e) {
        document.getElementById('apo-app').style.display = '';
        document.getElementById('lista-ultimos').innerHTML =
          '<div style="padding:16px;text-align:center;color:#f87171;font-size:0.83rem;">Error al cargar registros: ' + e.message + '</div>';
      });
    }
  }).catch(function(e) {
    console.error(e);
    console.log('[APO] ERROR general: ', e.message);
    document.getElementById('lista-ultimos').innerHTML = '<div style="padding:16px;text-align:center;color:#f87171;font-size:0.83rem;">❌ Error: ' + e.message + '</div>';
  });
}

function llenarDatos() {
  // Nombre completo: nombres + apellidos
  var nombre = ((alumno.nombres||'') + ' ' + (alumno.apellidos||'')).trim();
  var grado  = (alumno.grado||'') + ' ' + (alumno.seccion||'') + (alumno.turno ? ' - ' + alumno.turno : '');
  // Iniciales: primer nombre + primer apellido
  var partsN = (alumno.nombres||'').trim().split(' ');
  var partsA = (alumno.apellidos||'').trim().split(' ');
  var inicialesAlumno = ((partsN[0]||'')[0]||'').toUpperCase() + ((partsA[0]||'')[0]||'').toUpperCase();
  if(!inicialesAlumno) inicialesAlumno = (alumno.id||'').substring(0,2).toUpperCase();

  document.getElementById('apo-nombre-header').textContent = nombre;
  document.getElementById('apo-grado-header').textContent  = grado;
  document.getElementById('apo-nombre-card').textContent   = nombre;
  document.getElementById('apo-grado-card').textContent    = grado;
  document.getElementById('apo-dni-card').textContent      = 'DNI: ' + alumno.id;
  // Iniciales del alumno en header y card
  var inicialH = document.getElementById('apo-inicial-header');
  var inicialC = document.getElementById('apo-inicial-card');
  if(inicialH) inicialH.textContent = inicialesAlumno;
  if(inicialC) inicialC.textContent = inicialesAlumno;

  if(alumno.foto) {
    var fotoH = document.getElementById('apo-foto-header');
    var fotoC = document.getElementById('apo-foto-card');
    if(fotoH) { fotoH.src = alumno.foto; fotoH.style.display = ''; if(inicialH) inicialH.style.display='none'; }
    if(fotoC) { fotoC.src = alumno.foto; fotoC.style.display = ''; if(inicialC) inicialC.style.display='none'; }
  } else {
    var fotoH = document.getElementById('apo-foto-header');
    var fotoC = document.getElementById('apo-foto-card');
    if(fotoH) fotoH.style.display = 'none';
    if(fotoC) fotoC.style.display = 'none';
    if(inicialH) inicialH.style.display = 'flex';
    if(inicialC) inicialC.style.display = 'flex';
  }
  poblarMeses();
  // Iniciales del apoderado
  var apoNombres   = (apoData && apoData.nombres)   ? apoData.nombres   : '';
  var apoApellidos = (apoData && apoData.apellidos) ? apoData.apellidos : '';
  var nombreCompleto = (apoApellidos + ' ' + apoNombres).trim() || alumno.apoderadoNombres || '';
  var partes = nombreCompleto.split(' ').filter(function(p){ return p.length > 0; });
  var iniciales = partes.length >= 2
    ? (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
    : nombreCompleto.substring(0,2).toUpperCase() || 'AP';
  var avatarEl     = document.getElementById('apo-avatar-initials');
  var avatarMenuEl = document.getElementById('apo-avatar-initials-menu');
  var menuNombreEl = document.getElementById('apo-menu-nombre');
  if(avatarEl)     avatarEl.textContent     = iniciales;
  if(avatarMenuEl) avatarMenuEl.textContent = iniciales;
  if(menuNombreEl) menuNombreEl.textContent = nombreCompleto || 'Apoderado';
}
function poblarMeses() {
  // Solo mostrar mes actual y hasta 2 meses anteriores,
  // pero nunca antes de marzo (inicio del año lectivo).
  var opts = '';
  var hoy = new Date();
  for(var i = 0; i < 3; i++) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    if(d.getMonth() + 1 < 3) break; // no mostrar enero ni febrero
    var val = String(d.getMonth()+1).padStart(2,'0');
    var label = d.toLocaleDateString('es-PE', { month: 'long' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    opts += '<option value="'+val+'">'+label+'</option>';
  }
  document.getElementById('sel-mes-hist').innerHTML = opts;
  // Por defecto mes actual (primera opción)
  var mesActual = String(new Date().getMonth()+1).padStart(2,'0');
  document.getElementById('sel-mes-hist').value = mesActual;
}

function poblarMesesAgenda(force) {
  var sel = document.getElementById('apo-age-mes');
  if(!sel) return;
  if(!force && sel.options && sel.options.length) return;
  var opts = '';
  var hoy = new Date();
  for(var i = -2; i <= 2; i++) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2,'0');
    var val = y + '-' + m;
    var label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    opts += '<option value="' + val + '">' + label + '</option>';
  }
  sel.innerHTML = opts;
  var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
  if(!sel.value) sel.value = mesActual;
}

function onMesChange(origen) {
  var mes = document.getElementById('sel-mes-hist').value;
  // Recargar registros del mes seleccionado
  cargarRegistros(mes).then(function() {
    if(origen === 'resumen') renderResumen();
    else renderHistorial();
  });
}

// ── CARGA DE REGISTROS ──
// Se hace UNA sola vez al iniciar sesión y se guarda en memoria.
// Las pestañas usan los datos ya cargados sin volver a Firestore.

function cargarRegistros(mes) {
  // mes = '03' formato. Por defecto mes actual
  var mesNum = mes || String(new Date().getMonth()+1).padStart(2,'0');
  var mesActual = String(new Date().getMonth()+1).padStart(2,'0');

  // Cache en memoria: meses anteriores = indefinido; mes actual = TTL 3 min.
  if(_registrosPorMes[mesNum]) {
    var ttlCache = (mesNum === mesActual) ? _MES_ACTUAL_TTL : Infinity;
    if((Date.now() - (_registrosPorMesTime[mesNum] || 0)) < ttlCache) {
      console.log('[APO] Registros del mes', mesNum, 'desde cache');
      registros = _registrosPorMes[mesNum];
      _registrosCargados = true;
      return Promise.resolve();
    }
  }

  _registrosCargados = false;
  var anio   = new Date().getFullYear();
  var desde  = anio + '-' + mesNum + '-01';
  var ultimo = new Date(anio, parseInt(mesNum), 0).getDate();
  var hasta  = anio + '-' + mesNum + '-' + String(ultimo).padStart(2,'0');
  console.log('[APO] Cargando registros de:', alumno.id, 'mes:', mesNum);
  // Filtrar en Firestore por alumnoId y rango de fechas del mes.
  // Requiere índice compuesto (alumnoId ASC, fecha ASC) — ver firestore.indexes.json.
  return db.collection('registros')
    .where('alumnoId','==',alumno.id)
    .where('fecha','>=',desde)
    .where('fecha','<=',hasta)
    .limit(500)
    .get().then(function(snap) {
      console.log('[APO] Registros del mes recibidos:', snap.docs.length);
      var docsDelMes = snap.docs;
      console.log('[APO] Registros del mes:', docsDelMes.length);
      var grupos = {};
      docsDelMes.forEach(function(d) {
        var r = d.data();
        if(!r.fecha) return;
        var key = r.alumnoId + '_' + r.fecha;
        if(!grupos[key]) grupos[key] = { fecha: r.fecha, estado: '', horaIngreso: null, horaSalida: null };
        var esIngreso = !r.tipo || r.tipo.toLowerCase() === 'ingreso';
        if(esIngreso) {
          if(!grupos[key].horaIngreso) grupos[key].horaIngreso = r.hora;
        } else {
          grupos[key].horaSalida = r.hora;
        }
        // Normalizar: 'A tiempo' → 'Puntual' (index.html guarda 'A tiempo')
        var est = (r.estado || '').trim();
        if(est === 'A tiempo') est = 'Puntual';
        // Prioridad: Tardanza > Puntual > otros
        if(est === 'Tardanza') {
          grupos[key].estado = 'Tardanza';
        } else if(est === 'Puntual' && grupos[key].estado !== 'Tardanza') {
          grupos[key].estado = 'Puntual';
        } else if(est && !grupos[key].estado) {
          grupos[key].estado = est;
        }
      });
      // Determinar estado final por día (para grupos que SI tienen documento)
      Object.values(grupos).forEach(function(g) {
        if(g.estado === 'Tardanza') return;
        if(g.horaIngreso) {
          if(!g.estado || g.estado === '') g.estado = 'Puntual';
          return;
        }
        if(g.horaSalida) {
          if(!g.estado || g.estado === '') g.estado = 'Puntual';
          return;
        }
        g.estado = 'Falta';
      });

      // Inyectar dias habiles sin registro como Falta
      // Genera lunes-viernes del mes hasta hoy — cero lecturas Firestore extra.
      var hoyStr = (function() {
        var d = new Date();
        return d.getFullYear() + '-'
          + String(d.getMonth()+1).padStart(2,'0') + '-'
          + String(d.getDate()).padStart(2,'0');
      })();
      var cursor = new Date(desde + 'T12:00:00');
      var finMes = new Date(hasta + 'T12:00:00');
      var tope   = finMes < new Date(hoyStr + 'T12:00:00') ? finMes : new Date(hoyStr + 'T12:00:00');
      while(cursor <= tope) {
        var dow = cursor.getDay();
        if(dow !== 0 && dow !== 6) {
          var fechaStr = cursor.getFullYear() + '-'
            + String(cursor.getMonth()+1).padStart(2,'0') + '-'
            + String(cursor.getDate()).padStart(2,'0');
          var key2 = alumno.id + '_' + fechaStr;
          if(!grupos[key2]) {
            grupos[key2] = { fecha: fechaStr, estado: 'Falta', horaIngreso: null, horaSalida: null };
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      registros = Object.values(grupos).sort(function(a,b){
        return b.fecha.localeCompare(a.fecha);
      });
      _registrosCargados = true;
      // Guardar en cache siempre — el mes actual expira en 3 min, los anteriores no expiran
      _registrosPorMes[mesNum]     = registros;
      _registrosPorMesTime[mesNum] = Date.now();
      console.log('[APO] Procesados:', registros.length, 'dias (incl. faltas hábiles)');
    }).catch(function(e) {
      console.error('cargarRegistros error:', e);
      console.log('[APO] ERROR cargarRegistros: ', e.message);
      registros = registros || [];
    });
}

// ── Resumen mensual pre-agregado — 1 lectura para KPIs ──
function cargarResumenMensual(mesNum) {
  var anio      = new Date().getFullYear();
  var mesClave  = anio + '-' + mesNum; // 'YYYY-MM'
  var mesActual = String(new Date().getMonth()+1).padStart(2,'0');
  // El mes actual NO se cachea — sus datos cambian durante el día al escanear QR
  if(mesNum !== mesActual && _resumenMensualCache[mesClave] !== undefined) {
    return Promise.resolve(_resumenMensualCache[mesClave]);
  }
  return db.collection('resumen_mensual').doc(mesClave + '_' + alumno.id).get()
    .then(function(snap) {
      var data = snap.exists ? snap.data() : null;
      if(mesNum !== mesActual) _resumenMensualCache[mesClave] = data; // cachear solo meses pasados
      return data;
    }).catch(function(e) {
      console.warn('[APO] resumen_mensual read error:', e.message);
      return null;
    });
}

// Trae los últimos 7 días de registros (≤ 14 docs) para la sección "Últimas asistencias"
function cargarRegistrosRecientes() {
  if(_registrosRecientes !== null && (Date.now() - _registrosRecientesTime) < _RECIENTES_TTL) {
    return Promise.resolve(_registrosRecientes);
  }
  var hoy   = new Date();
  var hace7 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6);
  var desde = hace7.getFullYear() + '-'
    + String(hace7.getMonth()+1).padStart(2,'0') + '-'
    + String(hace7.getDate()).padStart(2,'0');
  return db.collection('registros')
    .where('alumnoId','==',alumno.id)
    .where('fecha','>=',desde)
    .limit(500)
    .get().then(function(snap) {
      var grupos = {};
      snap.docs.forEach(function(d) {
        var r = d.data();
        if(!r.fecha) return;
        var key = r.fecha;
        if(!grupos[key]) grupos[key] = { fecha: r.fecha, estado: '', horaIngreso: null, horaSalida: null };
        var esIngreso = !r.tipo || r.tipo.toUpperCase() === 'INGRESO';
        if(esIngreso) {
          if(!grupos[key].horaIngreso) grupos[key].horaIngreso = r.hora;
          var est = (r.estado || '').trim();
          if(est === 'A tiempo') est = 'Puntual';
          if(est === 'Tardanza')       grupos[key].estado = 'Tardanza';
          else if(est === 'Puntual' && grupos[key].estado !== 'Tardanza') grupos[key].estado = 'Puntual';
          else if(est && !grupos[key].estado) grupos[key].estado = est;
        } else {
          grupos[key].horaSalida = r.hora;
        }
      });
      Object.values(grupos).forEach(function(g) {
        if(g.horaIngreso) { if(!g.estado) g.estado = 'Puntual'; return; }
        if(g.horaSalida)  { if(!g.estado) g.estado = 'Puntual'; return; }
        g.estado = 'Falta';
      });
      _registrosRecientes     = Object.values(grupos)
        .sort(function(a,b){ return b.fecha.localeCompare(a.fecha); })
        .slice(0,5);
      _registrosRecientesTime = Date.now();
    }).catch(function(e) {
      console.warn('[APO] cargarRegistrosRecientes error:', e.message);
      _registrosRecientes = _registrosRecientes || [];
    });
}

// Días hábiles (lun-vie) transcurridos en el mes hasta hoy
function calcularDiasHabilesHasta(mesClave) {
  var anio  = parseInt(mesClave.substring(0,4));
  var mes   = parseInt(mesClave.substring(5,7));
  var hoy   = new Date();
  var inicio = new Date(anio, mes-1, 1);
  var finMes = new Date(anio, mes, 0);
  var tope   = hoy < finMes ? hoy : finMes;
  var count  = 0;
  var d = new Date(inicio);
  while(d <= tope) {
    var dow = d.getDay();
    if(dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate()+1);
  }
  return count;
}

// ── Menú apoderado — igual lógica que index.html ──
function openApoDropdown(id, btn) {
  closeApoDropdowns();
  var drop = document.getElementById(id);
  if(!drop) return;
  drop.classList.add('open');
  btn.classList.add('active');
}
function closeApoDropdowns() {
  document.querySelectorAll('.apo-nav-dropdown').forEach(function(d){ d.classList.remove('open'); });
  document.querySelectorAll('.apo-nav-tab').forEach(function(b){ b.classList.remove('active'); });
}
function setApoTabActive(tabId, subId) {
  closeApoDropdowns();
  var btn = document.getElementById('apo-tab-' + tabId);
  if(btn) btn.classList.add('active');
  // Resaltar subitem
  document.querySelectorAll('.apo-drop-item').forEach(function(el){ el.classList.remove('active'); });
  if(subId) {
    var dropItem = document.getElementById('apo-drop-' + subId);
    if(dropItem) dropItem.classList.add('active');
  }
}

// Cerrar al salir del nav
document.addEventListener('DOMContentLoaded', function() {
  var nav = document.getElementById('apo-nav-tabs');
  if(nav) nav.addEventListener('mouseleave', function(){ setTimeout(closeApoDropdowns, 80); });
  _bindConsanguinidadSelects();
});

// Cerrar al click fuera
document.addEventListener('click', function(e) {
  if(!e.target.closest('#apo-nav-tabs')) closeApoDropdowns();
  var btn = document.getElementById('apo-avatar-btn');
  var menu = document.getElementById('apo-user-menu');
  if(btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) menu.style.display = 'none';
});

function _bindConsanguinidadSelects() {
  function bind(selId, wrapId) {
    var sel = document.getElementById(selId);
    var wrap = document.getElementById(wrapId);
    if(!sel || !wrap) return;
    function apply() { wrap.style.display = sel.value === 'otro' ? '' : 'none'; }
    sel.addEventListener('change', apply);
    apply();
  }
  bind('inp-apo-consanguinidad', 'wrap-apo-consanguinidad-otro');
  bind('inp-apo2-consanguinidad', 'wrap-apo2-consanguinidad-otro');
}

function showTab(tab) {
  ['resumen','historial','incidentes','agenda','carnet','comunicados','contacto'].forEach(function(t) {
    var panel = document.getElementById('panel-'+t);
    if(panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  // Actualizar topbar móvil
  apoMsbSetActive(tab);
  // Resaltar menú activo
  var _map = {resumen:'inicio',historial:'asistencia',incidentes:'academico',agenda:'academico',comunicados:'comunicacion',carnet:'cuenta',contacto:'cuenta'};
  setApoTabActive(_map[tab]||'inicio', tab);
  try { sessionStorage.setItem('asmqr_apo_lastTab', tab); } catch(e) {}
  if(tab === 'resumen') {
    var mesActual = String(new Date().getMonth()+1).padStart(2,'0');
    var anio      = new Date().getFullYear();
    var mesClave  = anio + '-' + mesActual;
    var p1 = cargarResumenMensual(mesActual).catch(function(){ return {}; });
    var p2 = (_registrosRecientes !== null && (Date.now() - _registrosRecientesTime) < _RECIENTES_TTL)
      ? Promise.resolve() : cargarRegistrosRecientes().catch(function(e){
          console.warn('[APO] cargarRegistrosRecientes error:', e.message);
          _registrosRecientes = [];
        });
    Promise.all([p1, p2]).then(function() { renderResumen(); });
    return;
  }
  if(tab === 'historial') {
    if(!_registrosCargados) {
      var mesActual = String(new Date().getMonth()+1).padStart(2,'0');
      cargarRegistros(mesActual).then(function() { renderHistorial(); }).catch(function(e){
        console.error('[APO] historial error:', e.message);
        renderHistorial();
      });
      return;
    }
    renderHistorial();
    return;
  }
  if(tab === 'incidentes') renderIncidentes();
  if(tab === 'agenda')    renderApoAgenda();
  if(tab === 'carnet')     renderCarnet();
  if(tab === 'comunicados') renderApoComunicados();
  if(tab === 'contacto')   renderContacto();
}

let _comunicadosCache = null;
let _comunicadosCacheTime = 0;
const _COMUNICADOS_TTL = 2 * 60 * 1000;
let _apoAgendaLastList = [];

function _comunicadosCacheValido() {
  return !!_comunicadosCache && (Date.now() - _comunicadosCacheTime) < _COMUNICADOS_TTL;
}

function _safeDateTimeLabel(v) {
  if(!v) return '';
  try {
    const d = new Date(String(v));
    if(isNaN(d.getTime())) return String(v);
    return d.toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch(e) {
    return String(v || '');
  }
}

function cargarComunicadosApo() {
  if(_comunicadosCacheValido()) return Promise.resolve(_comunicadosCache);
  return db.collection('comunicados')
    .where('alumnoId','==', alumno.id)
    .orderBy('createdAt')
    .limit(200)
    .get()
    .then(function(snap) {
      const list = (snap.docs || []).map(function(d) {
        const it = d.data() || {};
        it.id = d.id;
        return it;
      });
      list.sort(function(a,b){
        const ta = String(a.createdAt || a.created_at || '');
        const tb = String(b.createdAt || b.created_at || '');
        return tb.localeCompare(ta);
      });
      _comunicadosCache = list;
      _comunicadosCacheTime = Date.now();
      return list;
    });
}

function renderApoComunicados() {
  const cont = document.getElementById('apo-comunicados-list');
  if(!cont) return;
  cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.83rem;">Cargando...</div>';
  cargarComunicadosApo().then(function(list) {
    if(!list || !list.length) {
      cont.innerHTML = '<div class="card" style="padding:22px 16px;text-align:center;color:var(--muted);font-size:0.83rem;">Sin comunicados</div>';
      return;
    }
    cont.innerHTML = list.slice(0, 120).map(function(it) {
      const titulo = _h(it.titulo || 'Comunicado');
      const fecha = _safeDateTimeLabel(it.createdAt || it.created_at);
      const autor = String(it.createdByName || it.created_by_name || '').trim();
      const hasPrev = !!(it.previewBase64 || it.preview_base64);
      const badgePrev = hasPrev ? '<span style="margin-left:8px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.28);color:#34d399;border-radius:999px;padding:2px 8px;font-size:0.7rem;font-weight:800;">Adjunto</span>' : '';
      return '<div class="card" style="padding:14px 14px;margin-bottom:10px;border-radius:14px;">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">'
        +   '<div style="min-width:0;">'
        +     '<div style="font-weight:900;font-size:0.94rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + titulo + badgePrev + '</div>'
        +     ((fecha || autor) ? '<div style="margin-top:2px;color:var(--muted);font-size:0.74rem;">'
              + (fecha ? _h(fecha) : '')
              + (fecha && autor ? ' · ' : '')
              + (autor ? ('Publicado por ' + _h(autor)) : '')
              + '</div>' : '')
        +   '</div>'
        +   '<button class="btn-login-apo" onclick="_apoOpenDetalle(\'comunicado\',\'' + _h(String(it.id||'')) + '\')" style="max-width:none;width:auto;padding:8px 12px;border-radius:10px;font-size:0.8rem;">Detalle</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }).catch(function(e) {
    cont.innerHTML = '<div class="card" style="padding:22px 16px;text-align:center;color:#f87171;font-size:0.83rem;">Error al cargar comunicados: ' + _h(e.message) + '</div>';
  });
}

function _apoOpenDetalle(kind, id) {
  const m = document.getElementById('modal-apo-detalle');
  if(!m) return;
  const titleEl = document.getElementById('apo-detalle-title');
  const metaEl  = document.getElementById('apo-detalle-meta');
  const textEl  = document.getElementById('apo-detalle-text');
  const imgWrap = document.getElementById('apo-detalle-img-wrap');
  const imgEl   = document.getElementById('apo-detalle-img');
  const setImg = (b64) => {
    const s = String(b64 || '');
    if(imgEl) imgEl.src = s ? ('data:image/jpeg;base64,' + s) : '';
    if(imgWrap) imgWrap.style.display = s ? '' : 'none';
  };
  const set = (t, meta, text, b64) => {
    if(titleEl) titleEl.textContent = t || '';
    if(metaEl) metaEl.textContent = meta || '';
    if(textEl) textEl.textContent = text || '';
    setImg(b64);
    m.style.display = 'flex';
  };

  if(kind === 'comunicado') {
    const list = _comunicadosCache || [];
    const it = list.find(x => String(x.id || '') === String(id || ''));
    if(!it) { set('Comunicado', '', 'No se encontró el comunicado.', ''); return; }
    const titulo = String(it.titulo || 'Comunicado');
    const fecha = _safeDateTimeLabel(it.createdAt || it.created_at);
    const autor = String(it.createdByName || it.created_by_name || '').trim();
    const parts = [];
    if(fecha) parts.push('Publicado: ' + fecha);
    if(autor) parts.push('Publicado por ' + autor);
    const meta = parts.join(' · ');
    const detalle = String(it.detalle || '');
    const b64 = it.previewBase64 || it.preview_base64 || '';
    set(titulo, meta, detalle, b64);
    return;
  }

  if(kind === 'agenda') {
    const ev = (_apoAgendaLastList || []).find(x => String(x.id || '') === String(id || ''));
    if(!ev) { set('Evento', '', 'No se encontró el evento.', ''); return; }
    const titulo = String(ev.titulo || 'Evento');
    const hora = String(ev.hora || '').trim();
    const autor = String(ev.createdByName || ev.created_by_name || '').trim();
    const g = String(ev.grado||'');
    const s = String(ev.seccion||'');
    const scope = (g === '*' && s === '*') ? 'Todo el colegio' : ((s === '*' && g.indexOf('nivel:') === 0) ? ('Todo el nivel ' + g.slice(6)) : '');
    const parts = [];
    if(ev.fecha) parts.push(_fechaLarga(String(ev.fecha)));
    if(hora) parts.push(hora);
    if(scope) parts.push(scope);
    if(autor) parts.push('Publicado por ' + autor);
    const meta = parts.join(' · ');
    const detalle = String(ev.detalle || '');
    const b64 = ev.previewBase64 || ev.preview_base64 || '';
    set(titulo, meta, detalle, b64);
    return;
  }
}

function filtrarMes(lista, mes) {
  return mes ? lista.filter(function(r){ return r.fecha && r.fecha.substring(5,7) === mes; }) : lista;
}
function fStr(f) {
  if(!f) return '';
  var p = f.split('-');
  return p[2]+'/'+p[1]+'/'+p[0];
}
function normEstado(estado) {
  var e = String(estado || '').trim();
  if(!e) return 'Falta';
  if(e === 'Ausente') return 'Falta';
  return e;
}
function badge(estado) {
  var e = normEstado(estado);
  if(e==='Puntual')  return '<span class="badge badge-puntual">Puntual</span>';
  if(e==='Tardanza') return '<span class="badge badge-tardanza">Tardanza</span>';
  return '<span class="badge badge-ausente">Falta</span>';
}
function ico(estado) {
  var e = normEstado(estado);
  return e==='Puntual' ? '&#9989;' : e==='Tardanza' ? '&#9888;&#65039;' : '&#10060;';
}

function renderResumen() {
  // Resumen siempre muestra el mes actual — sin selector
  var mesNum   = String(new Date().getMonth()+1).padStart(2,'0');
  var anio     = new Date().getFullYear();
  var mesClave = anio + '-' + mesNum;
  var nombreMes = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  var lbl = document.getElementById('lbl-mes-resumen');
  if(lbl) lbl.textContent = nombreMes;

  var resumen = _resumenMensualCache[mesClave];
  if(resumen) {
    // Datos pre-agregados: 0 lecturas extra para KPIs
    var diasHabiles = calcularDiasHabilesHasta(mesClave);
    var puntual  = resumen.puntual  || 0;
    var tardanza = resumen.tardanza || 0;
    var ausentes = Math.max(0, diasHabiles - (puntual + tardanza));
    document.getElementById('kpi-puntual').textContent  = puntual;
    document.getElementById('kpi-tardanza').textContent = tardanza;
    document.getElementById('kpi-ausente').textContent  = ausentes;
  } else {
    // Fallback: calcular desde registros del mes completo (si ya estaban cargados)
    var list = filtrarMes(registros || [], mesNum);
    document.getElementById('kpi-puntual').textContent  = list.filter(function(r){return r.estado==='Puntual';}).length;
    document.getElementById('kpi-tardanza').textContent = list.filter(function(r){return r.estado==='Tardanza';}).length;
    document.getElementById('kpi-ausente').textContent  = list.filter(function(r){return normEstado(r.estado)==='Falta';}).length;
  }

  // Últimas asistencias: usar _registrosRecientes (carga ligera) o fallback a registros
  var ult = (_registrosRecientes !== null
    ? _registrosRecientes
    : filtrarMes(registros || [], mesNum).slice(0,5));
  var cont = document.getElementById('lista-ultimos');
  if(!ult.length) { cont.innerHTML='<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.83rem;">Sin registros en este periodo</div>'; return; }
  cont.innerHTML = ult.map(function(r) {
    var hi = r.horaIngreso || '-';
    var hs = r.horaSalida  || '-';
    var det = (hi === '-' && hs === '-') ? 'Sin registro' : ('Ingreso: ' + hi + ' - Salida: ' + hs);
    return '<div class="registro-row"><div style="display:flex;align-items:center;gap:10px;"><span>'+ico(r.estado)+'</span><div><div style="font-size:0.83rem;font-weight:600;">'+fStr(r.fecha)+'</div><div style="font-size:0.74rem;color:var(--muted);">'+det+'</div></div></div>'+badge(r.estado)+'</div>';
  }).join('');
}

function renderHistorial() {
  var mes  = document.getElementById('sel-mes-hist').value;
  var tipo = document.getElementById('sel-tipo-hist').value;
  var cont = document.getElementById('lista-historial');

  var list = filtrarMes(registros || [], mes);

  // Filtro por estado — comparación normalizada
  if(tipo) {
    list = list.filter(function(r) {
      var est = normEstado(r.estado);
      return est === tipo;
    });
  }

  if(!list.length) {
    var lbl = tipo ? tipo : 'ningún estado';
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.83rem;">'
      + 'Sin registros de <strong style="color:var(--text);">' + lbl + '</strong>'
      + (mes ? ' en este mes' : '') + '</div>';
    return;
  }

  cont.innerHTML = list.map(function(r) {
    var estado = normEstado(r.estado);
    var hi = r.horaIngreso || '-';
    var hs = r.horaSalida  || '-';
    var det = (hi === '-' && hs === '-') ? '⭕ Sin registro' : ('🟢 Ingreso: ' + hi + ' · 🔵 Salida: ' + hs);
    return '<div class="card" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:1.1rem;">'+ico(estado)+'</span>'
      + '<div>'
      + '<div style="font-size:0.85rem;font-weight:700;">'+fStr(r.fecha)+'</div>'
      + '<div style="font-size:0.75rem;color:var(--muted);">'
      + det
      + '</div></div></div>'
      + badge(estado)
      + '</div>';
  }).join('');
}

function renderIncidentes() {
  // Filtrar solo mes actual
  var hoy = new Date();
  var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');

  // Usar cache si ya está cargado — filtrar por mes en memoria
  if(_incidentesCache !== null) {
    var filtrados = _incidentesCache.filter(function(i){ return (i.fecha||'').startsWith(mesActual); });
    _renderIncidentesLista(filtrados);
    return;
  }
  var cont = document.getElementById('lista-incidentes');
  cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.83rem;">Cargando...</div>';
  // Solo filtrar por alumnoId — evita índice compuesto en Firestore.
  // El filtro de mes se aplica en cliente (pocos incidentes por alumno).
  db.collection('incidentes')
    .where('alumnoId','==',alumno.id)
    .limit(200)
    .get().then(function(snap) {
    _incidentesCache = snap.docs.map(function(d){ return Object.assign({_id: d.id}, d.data()); })
      .sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||''); });
    var filtrados = _incidentesCache.filter(function(i){ return (i.fecha||'').startsWith(mesActual); });
    _renderIncidentesLista(filtrados);
  }).catch(function(e){
    cont.innerHTML='<div style="padding:16px;text-align:center;color:#f87171;font-size:0.83rem;">Error: '+e.message+'</div>';
  });
}

function _renderIncidentesLista(lista) {
  var cont = document.getElementById('lista-incidentes');
  window._incidentesData = lista;
  if(!lista.length) {
    cont.innerHTML = '<div style="padding:48px 20px;text-align:center;color:var(--muted);font-size:0.85rem;">'
      + '<div style="font-size:2.5rem;margin-bottom:10px;">✅</div>'
      + '<div style="font-weight:700;margin-bottom:4px;">Sin incidentes registrados</div>'
      + '<div style="font-size:0.78rem;">No hay reportes de incidencia para este alumno</div>'
      + '</div>';
    return;
  }
  cont.innerHTML = lista.map(function(inc, idx) {
    var sev = (inc.severidad || inc.gravedad || '').toLowerCase();
    var sevColor = sev.includes('alta') || sev.includes('grave') ? '#f87171'
                 : sev.includes('media') || sev.includes('moderada') ? '#f59e0b'
                 : '#94a3b8';
    var sevBg = sev.includes('alta') || sev.includes('grave') ? 'rgba(248,113,113,0.1)'
              : sev.includes('media') || sev.includes('moderada') ? 'rgba(245,158,11,0.1)'
              : 'rgba(148,163,184,0.1)';
    var sevLabel = inc.severidad || inc.gravedad || 'No especificada';
    return '<div class="card" style="padding:14px 16px;margin-bottom:10px;border-left:3px solid '+sevColor+';">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">'
      +   '<div style="font-size:0.88rem;font-weight:800;color:#f87171;">🚨 '+(inc.tipo||'Incidente')+'</div>'
      +   '<div style="font-size:0.74rem;color:var(--muted);text-align:right;white-space:nowrap;">'
      +     '<div>📅 Fecha: <strong style="color:var(--text);">'+fStr(inc.fecha)+'</strong></div>'
      +     (inc.hora ? '<div>🕐 Hora: <strong style="color:var(--text);">'+inc.hora+'</strong></div>' : '')
      +   '</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +   '<div style="display:inline-flex;align-items:center;gap:5px;background:'+sevBg+';border:1px solid '+sevColor+'40;border-radius:20px;padding:3px 10px;">'
      +     '<span style="font-size:0.68rem;font-weight:700;color:'+sevColor+';text-transform:uppercase;letter-spacing:0.5px;">⚡ '+sevLabel+'</span>'
      +   '</div>'
      +   '<button onclick="descargarIncidente('+idx+')" style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:0.72rem;font-weight:600;font-family:var(--font-body);white-space:nowrap;">⬇ PDF</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function descargarIncidente(idx) {
  var inc = window._incidentesData && window._incidentesData[idx];
  if(!inc) return;
  if(typeof window.jspdf === 'undefined') { alert('PDF no disponible, intenta nuevamente'); return; }

  var jsPDF = window.jspdf.jsPDF;
  var doc   = new jsPDF({ unit:'mm', format:'a4' });
  var W = 210, mg = 20, y = 0;

  // ── Cabecera roja ──
  doc.setFillColor(239,68,68);
  doc.rect(0,0,W,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text((inc.alumnoNombre ? inc.alumnoNombre.split(' ').slice(0,2).join(' ') : (window.COLEGIO_NOMBRE || 'I.E.')).toUpperCase(), W/2, 11, {align:'center'});
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('REPORTE DE INCIDENTE', W/2, 19, {align:'center'});
  doc.text(new Date().getFullYear().toString(), W/2, 25, {align:'center'});
  y = 38;

  // ── Datos alumno ──
  doc.setFillColor(248,250,252); doc.setDrawColor(226,232,240);
  doc.roundedRect(mg,y,W-mg*2,28,3,3,'FD');
  doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('ALUMNO', mg+4, y+6);
  doc.text('DNI', mg+90, y+6);
  doc.text('GRADO / SECCIÓN', mg+125, y+6);
  doc.setTextColor(30,41,59); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(inc.alumnoNombre || (alumno.nombres+' '+alumno.apellidos), mg+4, y+13);
  doc.text(inc.alumnoId || alumno.id, mg+90, y+13);
  doc.text((inc.grado||alumno.grado)+' — Secc. '+(inc.seccion||alumno.seccion), mg+125, y+13);
  doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('FECHA', mg+4, y+21);
  doc.text('HORA', mg+55, y+21);
  doc.text('TIPO', mg+90, y+21);
  doc.text('SEVERIDAD', mg+145, y+21);
  doc.setTextColor(30,41,59); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(inc.fecha||'-', mg+4, y+27);
  doc.text(inc.hora||'-', mg+55, y+27);
  doc.text(inc.tipo||'-', mg+90, y+27);
  var sev = inc.severidad || inc.gravedad || '-';
  var sevRGB = sev==='Grave'?[239,68,68]:sev==='Moderado'?[245,158,11]:[16,185,129];
  doc.setTextColor(sevRGB[0],sevRGB[1],sevRGB[2]);
  doc.setFont('helvetica','bold');
  doc.text(sev, mg+145, y+27);
  y += 36;

  // ── Descripción ──
  doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('DESCRIPCIÓN DEL INCIDENTE', mg, y); y += 4;
  doc.setFillColor(248,250,252); doc.setDrawColor(226,232,240);
  var descLines = doc.splitTextToSize(inc.descripcion||'-', W-mg*2-8);
  var descH = Math.max(18, descLines.length*5+8);
  doc.roundedRect(mg,y,W-mg*2,descH,2,2,'FD');
  doc.setTextColor(51,65,85); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(descLines, mg+4, y+6);
  y += descH + 6;

  // ── Medidas ──
  if(inc.medidas) {
    doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.text('MEDIDAS TOMADAS', mg, y); y += 4;
    var medLines = doc.splitTextToSize(inc.medidas, W-mg*2-8);
    var medH = Math.max(14, medLines.length*5+8);
    doc.setFillColor(248,250,252); doc.setDrawColor(226,232,240);
    doc.roundedRect(mg,y,W-mg*2,medH,2,2,'FD');
    doc.setTextColor(51,65,85); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(medLines, mg+4, y+6);
    y += medH + 6;
  }

  // ── Firmas ──
  y = Math.max(y, 230);
  doc.setDrawColor(148,163,184);
  doc.line(mg, y, mg+70, y);
  doc.line(W-mg-70, y, W-mg, y);
  doc.setTextColor(100,116,139); doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(inc.responsableNombre||inc.reportadoPor||'Responsable', mg+35, y+5, {align:'center'});
  doc.text('Director(a) / V°B°', W-mg-35, y+5, {align:'center'});
  doc.setFontSize(7);
  doc.text(inc.responsableCargo||'Responsable', mg+35, y+9, {align:'center'});
  doc.text('Firma y sello', W-mg-35, y+9, {align:'center'});

  // ── Footer ──
  doc.setFillColor(239,68,68);
  doc.rect(0,287,W,10,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7);
  doc.text('Documento generado por AsistenciaQR · '+new Date().toLocaleString('es-PE'), W/2, 293, {align:'center'});

  doc.save('incidente_'+(inc.alumnoId||alumno.id)+'_'+(inc.fecha||'sin-fecha')+'.pdf');
}

function renderCarnet() {
  getConfigCache().then(function(cfg) {
    // Separar "Institución Educativa" del nombre en dos líneas
    var partes = COLEGIO_NOMBRE.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
    var linea1 = partes ? partes[1] : COLEGIO_NOMBRE;
    var linea2 = partes ? partes[2] : '';
    document.getElementById('carnet-colegio').innerHTML =
      '<div style="color:#c9a84c;font-size:0.62rem;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">' + linea1 + '</div>'
      + (linea2 ? '<div style="color:#c9a84c;font-size:0.72rem;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">' + linea2 + '</div>' : '');
  }).catch(function(){
    document.getElementById('carnet-colegio').innerHTML =
      '<div style="color:#c9a84c;font-size:0.72rem;font-weight:800;text-transform:uppercase;">' + COLEGIO_NOMBRE + '</div>';
  });
  if(alumno.foto) { var cf = document.getElementById('carnet-foto'); if(cf) cf.src = alumno.foto; }
  document.getElementById('carnet-nombre').textContent = alumno.nombres+' '+alumno.apellidos;
  document.getElementById('carnet-grado').textContent  = alumno.grado+' '+alumno.seccion+' - '+alumno.turno;
  document.getElementById('carnet-dni').textContent    = 'DNI: '+alumno.id;
  document.getElementById('carnet-year').textContent   = new Date().getFullYear();
  var qrEl = document.getElementById('carnet-qr');
  qrEl.crossOrigin = 'anonymous';
  // Token diario: "DNI|YYYY-MM-DD" — usa fecha local (no UTC) igual que el scanner
  var _hoy = new Date();
  var _qrFecha = _hoy.getFullYear() + '-' + String(_hoy.getMonth()+1).padStart(2,'0') + '-' + String(_hoy.getDate()).padStart(2,'0');
  var qrToken = alumno.id + '|' + _qrFecha;
  qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&ecc=H&color=000000&data='+encodeURIComponent(qrToken);
}

function renderContacto() {
  var cont = document.getElementById('contenido-contacto');
  getConfigCache().then(function(d) {
    cont.innerHTML = '<div class="card" style="padding:20px;">'
      +(d.nombreColegio?'<div style="margin-bottom:12px;"><div style="font-size:0.74rem;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:3px;">Institucion</div><div style="font-size:0.88rem;">'+d.nombreColegio+'</div></div>':'')
      +(d.telefono?'<div style="margin-bottom:12px;"><div style="font-size:0.74rem;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:3px;">Telefono</div><a href="tel:'+d.telefono+'" style="font-size:0.88rem;color:var(--accent);text-decoration:none;">'+d.telefono+'</a></div>':'')
      +(d.email?'<div style="margin-bottom:12px;"><div style="font-size:0.74rem;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:3px;">Correo</div><a href="mailto:'+d.email+'" style="font-size:0.88rem;color:var(--accent);text-decoration:none;">'+d.email+'</a></div>':'')
      +(d.direccion?'<div><div style="font-size:0.74rem;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:3px;">Direccion</div><div style="font-size:0.88rem;">'+d.direccion+'</div></div>':'')
      +(!d.telefono&&!d.email&&!d.direccion?'<div style="text-align:center;color:var(--muted);font-size:0.83rem;padding:16px 0;">No hay datos de contacto configurados</div>':'')
      +'</div>';
  }).catch(function(e){ cont.innerHTML='<div style="padding:16px;text-align:center;color:#f87171;font-size:0.83rem;">Error: '+e.message+'</div>'; });
}

function compartirCarnet() {
  // Capturar el carnet como imagen usando canvas
  var carnetEl = document.getElementById('carnet-visual');
  if(!carnetEl) {
    alert('No se pudo capturar el carnet'); return;
  }

  // Verificar si html2canvas está disponible
  if(typeof html2canvas === 'undefined') {
    // Fallback: compartir texto + link QR
    var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=' + alumno.id;
    var texto = '🪪 Carnet Digital — ' + (window.COLEGIO_NOMBRE || 'I.E.') + '\n'
      + alumno.nombres + ' ' + alumno.apellidos + '\n'
      + alumno.grado + ' ' + alumno.seccion + '\n'
      + 'DNI: ' + alumno.id + '\n'
      + 'QR: ' + qrUrl;
    if(navigator.share) {
      navigator.share({ title: 'Carnet QR — ' + alumno.nombres, text: texto }).catch(function(){});
    } else {
      navigator.clipboard && navigator.clipboard.writeText(texto).then(function(){ alert('Datos copiados al portapapeles'); });
    }
    return;
  }

  var btn = document.querySelector('[onclick="compartirCarnet()"]');
  if(btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true; }

  // Esperar que la imagen QR cargue antes de capturar
  var qrImg = document.getElementById('carnet-qr');
  var capturar = function() {
    html2canvas(carnetEl, {
      backgroundColor: '#0d1a3a',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      imageTimeout: 5000,
      logging: false
    }).then(function(canvas) {
      if(btn) { btn.textContent = '📤 Compartir imagen'; btn.disabled = false; }
      canvas.toBlob(function(blob) {
        if(!blob) { alert('Error al generar imagen'); return; }
        var file = new File([blob], 'carnet-' + alumno.id + '.png', { type: 'image/png' });
        if(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ title: 'Carnet — ' + alumno.nombres + ' ' + alumno.apellidos, files: [file] })
            .catch(function(e) { if(e.name !== 'AbortError') descargarCarnet(canvas); });
        } else {
          descargarCarnet(canvas);
        }
      }, 'image/png');
    }).catch(function(e) {
      if(btn) { btn.textContent = '📤 Compartir imagen'; btn.disabled = false; }
      console.error(e);
      alert('Error al generar imagen: ' + e.message);
    });
  };

  // Si el QR ya cargó, capturar de inmediato; si no, esperar
  if(qrImg && qrImg.complete && qrImg.naturalWidth > 0) {
    capturar();
  } else if(qrImg) {
    qrImg.onload = capturar;
    qrImg.onerror = capturar; // capturar igual aunque falle la imagen
    // Timeout de seguridad
    setTimeout(capturar, 3000);
  } else {
    capturar();
  }
}

function descargarCarnet(canvas) {
  var link = document.createElement('a');
  link.download = 'carnet-' + alumno.id + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Toggle contraseña con auto-ocultar 3 segundos
var _passTimersApo = {};
function togglePassFieldApo(inputId, btnEl) {
  var inp = document.getElementById(inputId);
  if(!inp) return;
  if(inp.type === 'password') {
    inp.type = 'text';
    if(btnEl) btnEl.textContent = '🙈';
    if(_passTimersApo[inputId]) clearTimeout(_passTimersApo[inputId]);
    _passTimersApo[inputId] = setTimeout(function() {
      inp.type = 'password';
      if(btnEl) btnEl.textContent = '👁';
    }, 3000);
  } else {
    inp.type = 'password';
    if(btnEl) btnEl.textContent = '👁';
    if(_passTimersApo[inputId]) clearTimeout(_passTimersApo[inputId]);
  }
}

function cancelarPrimerIngreso() {
  auth.signOut().then(function() { window.location.href = 'index.html'; });
}

async function sendWhatsAppApo(telefono, mensaje) {
  try {
    const { data: { session } } = await window._sb.auth.getSession();
    const jwt = session?.access_token;
    if(!jwt) return false;
    var num = '51' + telefono.replace(/\D/g,'');
    if(num.length < 11) return false;
    var logoUrl = new URL('img/wa-logo.png', window.location.href).href;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ telefono: num, mensaje, urlImagen: logoUrl })
    });
    if(res.ok) return true;
    const body = await res.json().catch(() => ({}));
    console.warn('WhatsApp error:', body.error || ('HTTP '+res.status));
    return false;
  } catch(e) {
    console.warn('WhatsApp error:', e.message);
    return false;
  }
}

function guardarNuevaPass() {
  var nuevaPass     = document.getElementById('inp-nueva-pass').value;
  var confirmarPass = document.getElementById('inp-confirmar-pass').value;
  var nombres   = document.getElementById('inp-apo-nombres').value.trim();
  var apellidos = document.getElementById('inp-apo-apellidos').value.trim();
  var consang = document.getElementById('inp-apo-consanguinidad').value;
  var consangOtro = document.getElementById('inp-apo-consanguinidad-otro').value.trim();
  var telefono  = document.getElementById('inp-telefono').value.trim();
  var correo    = document.getElementById('inp-apo-correo').value.trim();
  var nombres2   = document.getElementById('inp-apo2-nombres').value.trim();
  var apellidos2 = document.getElementById('inp-apo2-apellidos').value.trim();
  var consang2 = document.getElementById('inp-apo2-consanguinidad').value;
  var consangOtro2 = document.getElementById('inp-apo2-consanguinidad-otro').value.trim();
  var telefono2  = document.getElementById('inp-apo2-telefono').value.trim();
  var correo2    = document.getElementById('inp-apo2-correo').value.trim();
  var errEl = document.getElementById('err-cambiar-pass');
  errEl.style.display = 'none';

  if(!nuevaPass || nuevaPass.length < 6) { errEl.textContent='La contraseña debe tener mínimo 6 caracteres'; errEl.style.display='block'; return; }
  if(nuevaPass !== confirmarPass) { errEl.textContent='Las contraseñas no coinciden'; errEl.style.display='block'; return; }
  if(!nombres)   { errEl.textContent='Ingresa tus nombres'; errEl.style.display='block'; return; }
  if(!apellidos) { errEl.textContent='Ingresa tus apellidos'; errEl.style.display='block'; return; }
  if(!consang)   { errEl.textContent='Selecciona el grado de consanguinidad'; errEl.style.display='block'; return; }
  if(!telefono || !/^\d{9}$/.test(telefono)) { errEl.textContent='Ingresa un celular de 9 dígitos'; errEl.style.display='block'; return; }
  if(correo && !/^[^@]+@[^@]+\.[^@]+$/.test(correo)) { errEl.textContent='El correo del apoderado 1 no es válido'; errEl.style.display='block'; return; }
  if(telefono2 && !/^\d{9}$/.test(telefono2)) { errEl.textContent='El celular del apoderado 2 debe tener 9 dígitos'; errEl.style.display='block'; return; }
  if(correo2 && !/^[^@]+@[^@]+\.[^@]+$/.test(correo2)) { errEl.textContent='El correo del apoderado 2 no es válido'; errEl.style.display='block'; return; }
  if(consang2 && !nombres2 && !apellidos2 && !telefono2 && !correo2) { consang2 = ''; consangOtro2 = ''; }

  var btn = document.getElementById('btn-guardar-pass');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  if(!auth.currentUser) {
    errEl.textContent = 'Sesión expirada. Vuelve a iniciar sesión.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Guardar y continuar';
    setTimeout(function(){ auth.signOut().then(function(){ window.location.href='index.html'; }); }, 2000);
    return;
  }

  var dataApo = {
    alumnoId:      alumno.id,
    nombres:       nombres,
    apellidos:     apellidos,
    telefono:      telefono,
    primerIngreso: false,
    actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
  };
  if(correo)     dataApo.emailReal  = correo;
  dataApo.consanguinidad = consang;
  if(consang === 'otro' && consangOtro) dataApo.consanguinidadDetalle = consangOtro;
  if(nombres2)   dataApo.nombres2   = nombres2;
  if(apellidos2) dataApo.apellidos2 = apellidos2;
  if(telefono2)  dataApo.telefono2  = telefono2;
  if(correo2)    dataApo.emailReal2 = correo2;
  if(consang2) dataApo.consanguinidad2 = consang2;
  if(consang2 === 'otro' && consangOtro2) dataApo.consanguinidadDetalle2 = consangOtro2;

  // Cargar config general PRIMERO
  Promise.all([
    db.collection('config').doc('general').get().catch(function(){ return { exists: false }; })
  ]).then(function(results) {
    var genSnap = results[0];
    var _nomColegio = (genSnap && genSnap.exists && genSnap.data().nombre) ? genSnap.data().nombre : 'Portal Apoderado';

  auth.currentUser.getIdToken(true).then(function() {
    return auth.currentUser.updatePassword(nuevaPass);
  }).then(function() {
    return db.collection('apoderados').doc(alumno.id).set(dataApo, { merge: true });
  }).then(function() {
    return auth.currentUser.updateProfile({ displayName: (nombres + ' ' + apellidos).trim() });
  }).then(function() {
    document.getElementById('modal-cambiar-pass').style.display = 'none';
    alumno.telefono           = telefono;
    alumno.apoderadoNombres   = nombres;
    alumno.apoderadoApellidos = apellidos;
    apoData.nombres    = nombres;
    apoData.apellidos  = apellidos;
    apoData.telefono   = telefono;
    llenarDatos();
    // Forzar iniciales del apoderado directamente
    var _n = (apellidos + ' ' + nombres).trim();
    var _p = _n.split(' ').filter(function(x){ return x.length > 0; });
    var _ini = _p.length >= 2 ? (_p[0][0]+_p[_p.length-1][0]).toUpperCase() : _n.substring(0,2).toUpperCase();
    var _e1 = document.getElementById('apo-avatar-initials');
    var _e2 = document.getElementById('apo-avatar-initials-menu');
    var _e3 = document.getElementById('apo-menu-nombre');
    if(_e1) _e1.textContent = _ini;
    if(_e2) _e2.textContent = _ini;
    if(_e3) _e3.textContent = _n;
    btn.disabled = false;
    btn.textContent = 'Guardar y continuar';
    // Enviar WhatsApp con config pre-cargada
    var nombreApo = nombres.split(' ')[0];
    var portal = window.location.href.replace(/apoderado\.html.*$/, '');
    var _waEnc = '🏫 *' + (window.COLEGIO_NOMBRE || _nomColegio) + '*'
      + (window.COLEGIO_ESLOGAN ? '\n_' + window.COLEGIO_ESLOGAN + '_' : '');
    var _waPie = '\n\n⚠️ _Este número es exclusivo para mensajes automáticos del colegio. Por favor no responda ni llame a este número._';
    var msgApo = '✅ *CUENTA DE PORTAL CONFIGURADA*\n' + _waEnc + '\n\n'
      + 'Hola *' + nombreApo + '*,\n\n'
      + 'Tu cuenta ha sido configurada exitosamente.\n\n'
      + '👤 *Apoderado 1*\n'
      + '• Nombre: ' + apellidos + ' ' + nombres + '\n'
      + '• Celular: ' + telefono + '\n'
      + (correo ? '• Correo: ' + correo + '\n' : '')
      + (nombres2 ? '\n👤 *Apoderado 2*\n'
          + '• Nombre: ' + apellidos2 + ' ' + nombres2 + '\n'
          + (telefono2 ? '• Celular: ' + telefono2 + '\n' : '')
          + (correo2 ? '• Correo: ' + correo2 + '\n' : '')
        : '')
      + '\n📱 *Usuario:* ' + alumno.id + '\n'
      + '🔑 *Contraseña:* la que acabas de registrar\n\n'
      + '🌐 Acceso: ' + portal
      + _waPie;
    // Mostrar resultado WhatsApp en pantalla
    function mostrarResultadoWA(tel, ok, detalle) {
      var div = document.createElement('div');
      div.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;'
        + 'background:' + (ok ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)') + ';'
        + 'color:#fff;padding:12px 16px;border-radius:10px;font-size:0.82rem;max-width:90vw;text-align:center;cursor:pointer;';
      div.innerHTML = (ok
        ? '✅ WhatsApp enviado a ' + tel
        : '❌ WhatsApp falló (' + tel + '):<br><span style="word-break:break-all;font-size:0.75rem;">' + detalle + '</span>');
      div.addEventListener('click', function(){ div.remove(); });
      document.body.appendChild(div);
      setTimeout(function(){ if(div.parentNode) div.remove(); }, 3000);
    }

    function enviarWA(tel, msg) {
      sendWhatsAppApo(tel, msg).then(function(ok) {
        mostrarResultadoWA(tel, ok, ok ? '' : 'no se pudo enviar');
      }).catch(function(e){ mostrarResultadoWA(tel, false, e.message); });
    }
    enviarWA(telefono, msgApo);
    if(telefono2) enviarWA(telefono2, msgApo);
    return cargarRegistros();
  }).then(function() {
    showTab('resumen');
    apoMsbInit();
    renderResumen();
    // Actualizar iniciales con múltiples intentos para garantizar que se apliquen
    var _apdNombre = nombres;
    var _apdApellido = apellidos;
    function _actualizarIniciales() {
      var _n = (_apdApellido + ' ' + _apdNombre).trim();
      var _p = _n.split(' ').filter(function(x){ return x.length > 0; });
      var _ini = _p.length >= 2 ? (_p[0][0]+_p[_p.length-1][0]).toUpperCase() : _n.substring(0,2).toUpperCase() || 'AP';
      var _e1 = document.getElementById('apo-avatar-initials');
      var _e2 = document.getElementById('apo-avatar-initials-menu');
      var _e3 = document.getElementById('apo-menu-nombre');
      if(_e1) { _e1.textContent = _ini; _e1.style.display = ''; }
      if(_e2) { _e2.textContent = _ini; _e2.style.display = ''; }
      if(_e3) _e3.textContent = _n;
    }
    _actualizarIniciales();
    setTimeout(_actualizarIniciales, 500);
    setTimeout(_actualizarIniciales, 1500);
  }).catch(function(e) {
    btn.disabled = false;
    btn.textContent = 'Guardar y continuar';
    var _msgs = {
      'auth/same-password': '⚠️ La nueva contraseña debe ser diferente a la actual. Elige otra contraseña.',
      'auth/weak-password':  '⚠️ La contraseña es muy débil. Usa al menos 6 caracteres.',
      'auth/update-failed':  '⚠️ ' + (e.message || 'No se pudo actualizar la contraseña.'),
    };
    errEl.textContent = _msgs[e.code] || ('Error (' + (e.code||'?') + '): ' + e.message);
    errEl.style.display = 'block';
  });

  }); // fin carga config Factiliza
}
// ── AVATAR APODERADO ──
function toggleApoMenu(e) {
  if(e) e.stopPropagation();
  closeApoDropdowns(); // cerrar nav dropdowns primero
  var menu = document.getElementById('apo-user-menu');
  if(!menu) return;
  var isOpen = menu.style.display === 'block';
  if(isOpen) { menu.style.display = 'none'; return; }
  menu.style.display = 'block';
  try {
    var btn = document.getElementById('apo-avatar-btn') || (e && e.currentTarget) || null;
    if(btn && btn.getBoundingClientRect) {
      var r = btn.getBoundingClientRect();
      var gap = 8;
      var vw = window.innerWidth || document.documentElement.clientWidth || 360;
      var vh = window.innerHeight || document.documentElement.clientHeight || 640;
      var mw = menu.offsetWidth || 220;
      var mh = menu.offsetHeight || 10;
      var left = Math.round(r.right - mw);
      if(left < gap) left = gap;
      if(left + mw > vw - gap) left = Math.max(gap, vw - gap - mw);
      var top = Math.round(r.bottom + gap);
      if(top + mh > vh - gap) top = Math.round(r.top - gap - mh);
      if(top < gap) top = gap;
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }
  } catch(e2) {}
}
function closeApoMenu() {
  var menu = document.getElementById('apo-user-menu');
  if(menu) menu.style.display = 'none';
}


function abrirApoMisDatos() {
  db.collection('apoderados').doc(alumno.id).get().then(function(snap) {
    var d = snap.exists ? snap.data() : {};
    document.getElementById('apo-datos-nombres').value    = d.nombres   || alumno.apoderadoNombres   || '';
    document.getElementById('apo-datos-apellidos').value  = d.apellidos  || alumno.apoderadoApellidos || '';
    document.getElementById('apo-datos-telefono').value   = d.telefono   || alumno.telefono           || '';
    document.getElementById('apo-datos-email').value      = d.emailReal  || '';
    document.getElementById('err-apo-datos').style.display = 'none';
    document.getElementById('ok-apo-datos').style.display  = 'none';
    document.getElementById('modal-apo-datos').style.display = 'flex';
  });
}

function guardarApoMisDatos() {
  var nombres   = document.getElementById('apo-datos-nombres').value.trim();
  var apellidos = document.getElementById('apo-datos-apellidos').value.trim();
  var telefono  = document.getElementById('apo-datos-telefono').value.trim();
  var emailReal = document.getElementById('apo-datos-email').value.trim();
  var errEl = document.getElementById('err-apo-datos');
  var okEl  = document.getElementById('ok-apo-datos');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if(!nombres || !apellidos) { errEl.textContent = 'Nombres y apellidos son requeridos'; errEl.style.display = 'block'; return; }

  var update = { nombres, apellidos, telefono };
  if(emailReal) update.emailReal = emailReal;

  db.collection('apoderados').doc(alumno.id).set(update, { merge: true }).then(function() {
    // Actualizar avatar
    var nombreCompleto = (apellidos + ' ' + nombres).trim();
    var partes = nombreCompleto.split(' ').filter(function(p){ return p.length > 0; });
    var iniciales = partes.length >= 2
      ? (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
      : nombreCompleto.substring(0,2).toUpperCase();
    document.getElementById('apo-avatar-initials').textContent = iniciales;
    document.getElementById('apo-avatar-initials-menu').textContent = iniciales;
    document.getElementById('apo-menu-nombre').textContent = nombreCompleto;
    okEl.textContent = 'Datos actualizados correctamente';
    okEl.style.display = 'block';
    setTimeout(function() { document.getElementById('modal-apo-datos').style.display = 'none'; }, 1500);
  }).catch(function(e) {
    errEl.textContent = 'Error al guardar: ' + e.message; errEl.style.display = 'block';
  });
}

// ─── SIDEBAR MÓVIL APODERADO ───────────────────────────────────────
function apoMsbIsMobile() { return window.innerWidth <= 700; }

function apoMsbExpand() {
  if(!apoMsbIsMobile()) return;
  document.getElementById('apo-mobile-sidebar').classList.add('open');
  document.getElementById('apo-msb-overlay').classList.add('show');
  var tb = document.getElementById('apo-mobile-topbar');
  if(tb) tb.classList.add('sidebar-open');
  document.body.classList.add('apo-sidebar-open');
}
function apoMsbCollapse() {
  document.getElementById('apo-mobile-sidebar').classList.remove('open');
  document.getElementById('apo-msb-overlay').classList.remove('show');
  var tb = document.getElementById('apo-mobile-topbar');
  if(tb) tb.classList.remove('sidebar-open');
  document.body.classList.remove('apo-sidebar-open');
  document.querySelectorAll('.apo-msb-sub').forEach(function(s){ s.classList.remove('open'); });
  document.querySelectorAll('.apo-msb-item').forEach(function(i){ i.classList.remove('open'); });
}
function apoMsbToggleHeader() {
  document.getElementById('apo-mobile-sidebar').classList.contains('open') ? apoMsbCollapse() : apoMsbExpand();
}
function apoMsbToggleSub(id) {
  if(!document.getElementById('apo-mobile-sidebar').classList.contains('open')){ apoMsbExpand(); return; }
  var sub = document.getElementById('apo-msb-sub-'+id);
  var btn = document.getElementById('apo-msb-btn-'+id);
  var isOpen = sub && sub.classList.contains('open');
  document.querySelectorAll('.apo-msb-sub').forEach(function(s){ s.classList.remove('open'); });
  document.querySelectorAll('.apo-msb-item').forEach(function(i){ i.classList.remove('open'); });
  if(!isOpen && sub && btn){ sub.classList.add('open'); btn.classList.add('open'); }
}
function apoMsbPickDirect(el, sectionId, label) {
  if(!document.getElementById('apo-mobile-sidebar').classList.contains('open')){ apoMsbExpand(); return; }
  document.querySelectorAll('.apo-msb-item').forEach(function(i){ i.classList.remove('active'); });
  document.querySelectorAll('.apo-msb-subitem').forEach(function(i){ i.classList.remove('active'); });
  el.classList.add('active');
  var tb = document.getElementById('apo-topbar-title');
  if(tb) tb.textContent = label || sectionId;
  showTab(sectionId);
  apoMsbCollapse();
}
function apoMsbPickSub(el, sectionId, parentId, label) {
  document.querySelectorAll('.apo-msb-item').forEach(function(i){ i.classList.remove('active'); });
  document.querySelectorAll('.apo-msb-subitem').forEach(function(i){ i.classList.remove('active'); });
  var parentBtn = document.getElementById('apo-msb-btn-'+parentId);
  if(parentBtn) parentBtn.classList.add('active');
  el.classList.add('active');
  var tb = document.getElementById('apo-topbar-title');
  if(tb) tb.textContent = label || sectionId;
  showTab(sectionId);
  apoMsbCollapse();
}
function apoMsbSetActive(tab) {
  if(!apoMsbIsMobile()) return;
  var labels = {resumen:'🏠 Inicio',historial:'📅 Historial',incidentes:'🚨 Incidencias',agenda:'📅 Agenda',comunicados:'💬 Comunicados',carnet:'🪪 Carnet',contacto:'📞 Contacto'};
  var tb = document.getElementById('apo-topbar-title');
  if(tb) tb.textContent = labels[tab] || tab;
  var parentMap = {historial:'asistencia',resumen:'inicio',incidentes:'academico',agenda:'academico',comunicados:'comunicacion',carnet:'cuenta',contacto:'cuenta'};
  document.querySelectorAll('.apo-msb-item').forEach(function(i){ i.classList.remove('active'); });
  document.querySelectorAll('.apo-msb-subitem').forEach(function(i){ i.classList.remove('active'); });
  var parent = parentMap[tab];
  if(parent === 'inicio') {
    var b = document.getElementById('apo-msb-btn-inicio');
    if(b) b.classList.add('active');
  } else if(parent) {
    var b = document.getElementById('apo-msb-btn-'+parent);
    if(b) b.classList.add('active');
  }
}
function apoMsbInit() {
  if(!apoMsbIsMobile()) return;
  // Poblar header del sidebar con datos del alumno
  if(typeof alumno !== 'undefined' && alumno) {
    var nombre = ((alumno.nombres||'') + ' ' + (alumno.apellidos||'')).trim();
    var grado  = ((alumno.grado||'') + ' ' + (alumno.seccion||'')).trim();
    var nEl = document.getElementById('apo-msb-nombre');
    var gEl = document.getElementById('apo-msb-grado');
    if(nEl) nEl.textContent = nombre || '—';
    if(gEl) gEl.textContent = grado  || '—';
    // Iniciales
    var partsN = (alumno.nombres||'').trim().split(' ');
    var partsA = (alumno.apellidos||'').trim().split(' ');
    var ini = ((partsN[0]||'')[0]||'') + ((partsA[0]||'')[0]||'');
    var iniEl = document.getElementById('apo-msb-inicial');
    if(iniEl) iniEl.textContent = ini.toUpperCase() || '?';
    // Foto
    if(alumno.foto) {
      var fEl = document.getElementById('apo-msb-foto-img');
      if(fEl){ fEl.src = alumno.foto; fEl.style.display = 'block'; if(iniEl) iniEl.style.display = 'none'; }
    }
  }
  // Topbar derecha: avatar apoderado
  var tbRight = document.getElementById('apo-topbar-right');
  if(tbRight) {
    var ini2 = (document.getElementById('apo-avatar-initials')||{}).textContent || '?';
    tbRight.innerHTML = '<div onclick="toggleApoMenu(event)" style="width:28px;height:28px;border-radius:50%;background:#C9A84C;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0D1A3A;cursor:pointer;user-select:none;">' + ini2 + '</div>';
  }
}
// ──────────────────────────────────────────────────────────────────

function _h(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
  });
}

function _agendaCacheValido(mes) {
  var t = _agendaPorMesTime[mes] || 0;
  return (Date.now() - t) < _AGENDA_TTL;
}

function cargarAgendaMes(mes) {
  if(_agendaPorMes[mes] && _agendaCacheValido(mes)) return Promise.resolve(_agendaPorMes[mes]);
  return db.collection('agenda')
    .where('mes','==', mes)
    .orderBy('fecha')
    .limit(500)
    .get()
    .then(function(snap) {
      var eventos = (snap.docs || []).map(function(d) {
        var ev = d.data() || {};
        ev.id = d.id;
        return ev;
      });
      eventos.sort(function(a,b){
        var fa = (a.fecha||'').localeCompare(b.fecha||'');
        if(fa !== 0) return fa;
        return (a.hora||'').localeCompare(b.hora||'');
      });
      _agendaPorMes[mes] = eventos;
      _agendaPorMesTime[mes] = Date.now();
      return eventos;
    });
}

function _fechaLarga(f) {
  if(!f) return '';
  var d = new Date(f + 'T00:00:00');
  if(isNaN(d.getTime())) return f;
  var s = d.toLocaleDateString('es-PE', { weekday:'long', day:'2-digit', month:'long' });
  return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : f;
}

function renderApoAgenda() {
  poblarMesesAgenda(false);
  var sel = document.getElementById('apo-age-mes');
  var mes = sel ? sel.value : '';
  var cont = document.getElementById('apo-agenda-list');
  if(!cont) return;
  if(!mes) { cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.83rem;">Selecciona un mes</div>'; return; }
  cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.83rem;">Cargando...</div>';
  cargarAgendaMes(mes).then(function(eventos) {
    if(!eventos || !eventos.length) {
      cont.innerHTML = '<div class="card" style="padding:22px 16px;text-align:center;color:var(--muted);font-size:0.83rem;">Sin eventos en este mes</div>';
      return;
    }
    var uniq = [];
    var seen = {};
    (eventos || []).forEach(function(ev) {
      var k = [
        String(ev.fecha || ''),
        String(ev.hora || ''),
        String(ev.titulo || ''),
        String(ev.detalle || ''),
        String(ev.createdByName || ev.created_by_name || '')
      ].join('|');
      if(seen[k]) return;
      seen[k] = 1;
      uniq.push(ev);
    });
    eventos = uniq;
    _apoAgendaLastList = eventos;
    var grupos = {};
    eventos.forEach(function(ev){
      var f = ev.fecha || '';
      if(!grupos[f]) grupos[f] = [];
      grupos[f].push(ev);
    });
    var fechas = Object.keys(grupos).sort();
    cont.innerHTML = fechas.map(function(f){
      var items = grupos[f].map(function(ev){
        var hora = (ev.hora || '').trim();
        var titulo = _h(ev.titulo || 'Evento');
        var autor = _h(ev.createdByName || ev.created_by_name || '');
        var g = String(ev.grado||'');
        var s = String(ev.seccion||'');
        var scope = (g === '*' && s === '*') ? 'Todo el colegio' : ((s === '*' && g.indexOf('nivel:') === 0) ? ('Todo el nivel ' + g.slice(6)) : '');
        var hasPrev = !!(ev.previewBase64 || ev.preview_base64);
        var badgePrev = hasPrev ? '<span style="margin-left:8px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.28);color:#34d399;border-radius:999px;padding:2px 8px;font-size:0.7rem;font-weight:800;">Adjunto</span>' : '';
        var scopeHtml = scope ? ('<div style="margin-top:6px;color:var(--muted);font-size:0.74rem;">Evento: <strong style="color:var(--text);">' + _h(scope) + '</strong></div>') : '';
        var autHtml = autor ? ('<div style="margin-top:6px;color:var(--muted);font-size:0.74rem;">Publicado por: <strong style="color:var(--text);">' + autor + '</strong></div>') : '';
        return '<div class="card" style="padding:14px 14px;margin-top:8px;border-radius:14px;">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">'
          +   '<div style="min-width:0;">'
          +     '<div style="font-weight:800;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + titulo + badgePrev + '</div>'
          +     (hora ? '<div style="margin-top:2px;color:var(--muted);font-size:0.78rem;">' + _h(hora) + '</div>' : '')
          +     scopeHtml
          +     autHtml
          +   '</div>'
          +   '<button class="btn-login-apo" onclick="_apoOpenDetalle(\'agenda\',\'' + _h(String(ev.id||'')) + '\')" style="max-width:none;width:auto;padding:8px 12px;border-radius:10px;font-size:0.8rem;">Detalle</button>'
          + '</div>'
          + '</div>';
      }).join('');
      return '<div class="card" style="padding:14px 14px;border-radius:16px;margin-bottom:10px;">'
        + '<div style="font-weight:900;color:var(--text);font-size:0.9rem;">' + _h(_fechaLarga(f)) + '</div>'
        + items
        + '</div>';
    }).join('');
  }).catch(function(e){
    cont.innerHTML = '<div class="card" style="padding:22px 16px;text-align:center;color:#f87171;font-size:0.83rem;">Error al cargar agenda: ' + _h(e.message) + '</div>';
  });
}

function cambiarApoPass() {
  var actual = document.getElementById('apo-pass-actual').value;
  var nueva1 = document.getElementById('apo-pass-nueva-1').value;
  var nueva2 = document.getElementById('apo-pass-nueva-2').value;
  var errEl  = document.getElementById('err-apo-pass');
  errEl.style.display = 'none';

  if(!actual)       { errEl.textContent = 'Ingresa tu contraseña actual'; errEl.style.display = 'block'; return; }
  if(nueva1.length < 6) { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return; }
  if(nueva1 !== nueva2) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.style.display = 'block'; return; }

  var user = auth.currentUser;
  var cred = firebase.auth.EmailAuthProvider.credential(user.email, actual);
  user.reauthenticateWithCredential(cred).then(function() {
    return user.updatePassword(nueva1);
  }).then(function() {
    document.getElementById('modal-apo-pass').style.display = 'none';
    document.getElementById('apo-pass-actual').value  = '';
    document.getElementById('apo-pass-nueva-1').value = '';
    document.getElementById('apo-pass-nueva-2').value = '';
    alert('Contraseña actualizada correctamente');
  }).catch(function(e) {
    errEl.textContent = e.code === 'auth/wrong-password'
      ? 'La contraseña actual es incorrecta'
      : 'Error: ' + e.message;
    errEl.style.display = 'block';
  });
}
