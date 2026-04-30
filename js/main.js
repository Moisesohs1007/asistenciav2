
// ============================================================
// FIREBASE CONFIG
// ============================================================
const LOGO_B64 = 'img/logo-colegio.png';

// Logo activo: usa el subido en config si existe, si no el hardcodeado
// ═══════════════════════════════════════════════════════
// Nombre, eslogan y logo vienen de compat.js (editar solo ahí)
// COLEGIO_NOMBRE, COLEGIO_ESLOGAN, COLEGIO_LOGO, COLEGIO_ANIO ya están definidos
// Dominio virtual de apoderados — cambiar aquí si se despliega en otro colegio
// IMPORTANTE: también actualizar firestore.rules (función esEmailApoderado e isApoderado)
const APO_DOMAIN      = '@apo.marello.pe';

function getLogo() {
  return COLEGIO_LOGO;
}

// ============================================================
// ORDENAMIENTO ESTÁNDAR: nivel → grado (numérico) → sección → apellido
// ============================================================
const _NIVEL_ORDEN = { 'Inicial': 0, 'Primaria': 1, 'Secundaria': 2 };

function _nivelIdx(turno) {
  return _NIVEL_ORDEN[turno] !== undefined ? _NIVEL_ORDEN[turno] : 99;
}

// Extrae el primer número de un string: "3 años"→3, "10mo"→10, "1er"→1
function _gradoNum(g) {
  const m = (g||'').match(/\d+/);
  return m ? parseInt(m[0], 10) : 999;
}

// Comparador principal: nivel → grado numérico → sección → nombre/apellido
function _cmpFilaReporte(a, b) {
  const nd = _nivelIdx(a.turno) - _nivelIdx(b.turno);
  if(nd !== 0) return nd;
  const gd = _gradoNum(a.grado) - _gradoNum(b.grado);
  if(gd !== 0) return gd;
  const sc = (a.seccion||'').localeCompare(b.seccion||'');
  if(sc !== 0) return sc;
  return (a.nombre||'').localeCompare(b.nombre||'');
}

function _cmpAlumnoReporte(a, b) {
  const nd = _nivelIdx(a.turno) - _nivelIdx(b.turno);
  if(nd !== 0) return nd;
  const gd = _gradoNum(a.grado) - _gradoNum(b.grado);
  if(gd !== 0) return gd;
  const sc = (a.seccion||'').localeCompare(b.seccion||'');
  if(sc !== 0) return sc;
  const ap = (a.apellidos||'').localeCompare(b.apellidos||'');
  if(ap !== 0) return ap;
  return (a.nombres||'').localeCompare(b.nombres||'');
}

async function _buildGradoIdx() { return {}; } // mantenido por compatibilidad

// Aplica nombre, eslogan y logo del colegio en toda la app
// COLEGIO_NOMBRE, COLEGIO_ESLOGAN y COLEGIO_LOGO vienen SOLO de compat.js — no se sobreescriben desde BD
function _aplicarConfigColegio(cfg) {
  if (!cfg) return;
  // NO sobreescribir COLEGIO_NOMBRE / COLEGIO_ESLOGAN / COLEGIO_LOGO desde BD
  // Editar solo en compat.js

  // Header: logo + nombre + eslogan
  const headerImg = document.getElementById('header-logo-img');
  if (headerImg && cfg.logoUrl) headerImg.src = cfg.logoUrl;
  const headerTxt = document.getElementById('header-nombre-txt');
  if (headerTxt) {
    const partes = COLEGIO_NOMBRE.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
    headerTxt.innerHTML = partes
      ? `I.E.P.<span> "${partes[2].replace(/^["']+|["']+$/g,'')}"</span>`
      : COLEGIO_NOMBRE;
  }
  const headerEslogan = document.getElementById('header-eslogan-txt');
  if (headerEslogan) headerEslogan.textContent = COLEGIO_ESLOGAN || '';
  // Login
  const loginImg = document.getElementById('login-img-colegio');
  if (loginImg && cfg.logoUrl) loginImg.src = cfg.logoUrl;
  // Sidebar móvil
  const msbImg = document.getElementById('msb-logo-img');
  if (msbImg && cfg.logoUrl) msbImg.src = cfg.logoUrl;
  const msbName = document.getElementById('msb-school-name');
  if (msbName) msbName.textContent = COLEGIO_NOMBRE;
  // Login título y eslogan
  cargarInfoColegioLogin();
  // Campos de configuración visibles
  const cfgNombre = document.getElementById('cfg-nombre-colegio');
  if (cfgNombre && cfgNombre.type !== 'hidden') cfgNombre.value = COLEGIO_NOMBRE;
  const cfgEslogan = document.getElementById('cfg-eslogan-colegio');
  if (cfgEslogan) cfgEslogan.value = COLEGIO_ESLOGAN;
  // Encabezado colegio en sección Configuración
  const schLogo2 = document.getElementById('cfg-school-logo');
  if (schLogo2 && cfg.logoUrl) schLogo2.src = cfg.logoUrl;
  const schNom2 = document.getElementById('cfg-school-nombre');
  if (schNom2) schNom2.textContent = COLEGIO_NOMBRE;
  const schEsl2 = document.getElementById('cfg-school-eslogan');
  if (schEsl2) schEsl2.textContent = COLEGIO_ESLOGAN || '';
}
const firebaseConfig = {
  apiKey: "AIzaSyBLI0I41vWjMK2q1ZjH1c1BK4SAFno7sfY",
  authDomain: "asistencia-qr-a3346.firebaseapp.com",
  projectId: "asistencia-qr-a3346",
  storageBucket: "asistencia-qr-a3346.firebasestorage.app",
  messagingSenderId: "617000910031",
  appId: "1:617000910031:web:ccc2454260d8b4e7704bba"
};
// db, auth, firebase ya vienen de compat.js (Supabase)

// Usuario actual
let currentUser = null;

// ── CONTROL DE CÁMARA ENTRE PESTAÑAS ──
const _sessionId = Math.random().toString(36).slice(2);
let _cameraChannel = null;

function initSessionControl() {
  if(!window.BroadcastChannel) return;
  _cameraChannel = new BroadcastChannel('asistencia_qr_camera');

  _cameraChannel.onmessage = (e) => {
    if(e.data.type === 'CAMERA_STARTED' && e.data.sid !== _sessionId) {
      // Otra pestaña activó la cámara — detener la nuestra si está activa
      if(scannerRunning) {
        stopScanner();
        mostrarAvisoCamara();
      }
    }
    if(e.data.type === 'CAMERA_PING' && e.data.sid !== _sessionId) {
      // Otra pestaña pregunta si alguien tiene la cámara — responder si la tenemos
      if(scannerRunning) {
        _cameraChannel.postMessage({ type: 'CAMERA_STARTED', sid: _sessionId });
      }
    }
  };
}

function anunciarSesion() {
  // Al iniciar sesión preguntar si hay cámara activa en otra pestaña
  if(_cameraChannel) {
    _cameraChannel.postMessage({ type: 'CAMERA_PING', sid: _sessionId });
  }
}

function anunciarCamaraActiva() {
  // Llamar cuando se activa la cámara en esta pestaña
  if(_cameraChannel) {
    _cameraChannel.postMessage({ type: 'CAMERA_STARTED', sid: _sessionId });
  }
}

function mostrarAvisoCamara() {
  let modal = document.getElementById('modal-camara-duplicada');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-camara-duplicada';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--surface);border:1px solid rgba(239,68,68,0.4);border-radius:18px;padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <div style="font-size:2.5rem;margin-bottom:12px;">📷</div>
        <div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:8px;">Cámara tomada por otra pestaña</div>
        <div style="font-size:0.83rem;color:var(--muted);margin-bottom:20px;line-height:1.6;">
          Otra ventana del sistema activó la cámara de este dispositivo.<br>
          La cámara de esta pestaña fue detenida automáticamente para evitar conflictos.
        </div>
        <button onclick="document.getElementById('modal-camara-duplicada').remove();"
          style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;font-size:0.9rem;">
          Entendido
        </button>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}
let currentRol = null; // admin | director | profesor | portero
let _repContextoPDF = {}; // contexto guardado para exportar PDF de reportes

// ── Auto-logout por inactividad (desactivado) ────────────────
const ENABLE_AUTO_LOGOUT = false;
const INACTIVIDAD_MS = 20 * 60 * 1000; // (no se usa si ENABLE_AUTO_LOGOUT=false)
let _inactTimer = null;
let _inactWarning = null;
const WARN_MS = 2 * 60 * 1000; // avisar 2 min antes

function resetInactTimer() {
  clearTimeout(_inactTimer);
  clearTimeout(_inactWarning);
  // Ocultar aviso si estaba visible
  const warn = document.getElementById('inact-warning');
  if(warn) warn.style.display = 'none';
  if(!ENABLE_AUTO_LOGOUT) return;
  if(!currentUser) return;
  // Aviso 2 min antes
  _inactWarning = setTimeout(() => {
    const w = document.getElementById('inact-warning');
    if(w) w.style.display = 'flex';
  }, INACTIVIDAD_MS - WARN_MS);
  // Cerrar sesión
  _inactTimer = setTimeout(() => {
    if(currentUser) {
      auth.signOut();
      toast('Sesión cerrada por inactividad', 'warning');
    }
  }, INACTIVIDAD_MS);
}

// Detectar cualquier actividad del usuario
if(ENABLE_AUTO_LOGOUT) {
  ['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(evt => {
    document.addEventListener(evt, resetInactTimer, { passive: true });
  });
}

// ============================================================
// LOGIN / AUTH
// ============================================================
window.toggleUsuarioPass = function() {
  const btn = document.getElementById('btn-toggle-upass');
  togglePassField('u-pass', btn);
};

// Función central de toggle contraseña con auto-ocultar en 3 segundos
let _passTimers = {};
function togglePassField(inputId, btnEl) {
  const inp = document.getElementById(inputId);
  if(!inp) return;
  if(inp.type === 'password') {
    inp.type = 'text';
    if(btnEl) btnEl.textContent = '🙈';
    // Auto-ocultar después de 3 segundos
    if(_passTimers[inputId]) clearTimeout(_passTimers[inputId]);
    _passTimers[inputId] = setTimeout(() => {
      inp.type = 'password';
      if(btnEl) btnEl.textContent = '👁';
    }, 3000);
  } else {
    inp.type = 'password';
    if(btnEl) btnEl.textContent = '👁';
    if(_passTimers[inputId]) clearTimeout(_passTimers[inputId]);
  }
}

window.togglePass = function() {
  const btn = document.getElementById('btn-toggle-pass');
  togglePassField('login-pass', btn);
};

// ══════════════════════════════════════════════
// SISTEMA LOGIN APODERADO
// ══════════════════════════════════════════════
let _loginTab = 'personal'; // 'personal' | 'apoderado'
let _loginIntentos = 0;
let _blockTimer = null;
let _apoderadoUID = null; // UID Firebase del apoderado logueado
let _apoderadoAlumno = null; // datos del alumno del apoderado

// Cargar nombre/logo del colegio en login
function cargarInfoColegioLogin() {
  // Nombre dividido en dos líneas: "Institución Educativa" + nombre propio
  const tituloEl = document.getElementById('login-titulo-colegio');
  if(tituloEl) {
    const partes = COLEGIO_NOMBRE.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
    if(partes) {
      const n2 = partes[2].length;
      const fs = n2 > 30 ? '0.72rem' : n2 > 20 ? '0.82rem' : '0.92rem';
      tituloEl.innerHTML =
        '<div style="font-size:0.7rem;font-weight:400;opacity:0.8;">' + partes[1] + '</div>'
        + '<div style="font-size:' + fs + ';font-weight:700;">' + partes[2] + '</div>';
    } else {
      const n = COLEGIO_NOMBRE.length;
      tituloEl.style.fontSize = n > 35 ? '0.72rem' : n > 25 ? '0.82rem' : '0.95rem';
      tituloEl.textContent = COLEGIO_NOMBRE;
    }
  }
  // Eslogan desde constante
  const esloganEl = document.getElementById('login-eslogan-colegio');
  if(esloganEl) esloganEl.textContent = COLEGIO_ESLOGAN;
}
cargarInfoColegioLogin();
// Aplicar nombre/logo en header, sidebar, etc. con los valores del código
_aplicarConfigColegio({ nombreColegio: COLEGIO_NOMBRE, eslogan: COLEGIO_ESLOGAN, logoUrl: COLEGIO_LOGO });

// ── Banner login ──
var _bannerCurrent = 0;
var _bannerTimer = null;
var _bannerTotal = 4;

function goBannerSlide(n) {
  var slides = document.querySelectorAll('.banner-slide');
  var dots = document.querySelectorAll('.b-dot');
  if(slides[_bannerCurrent]) slides[_bannerCurrent].classList.remove('active');
  if(dots[_bannerCurrent]) dots[_bannerCurrent].classList.remove('active');
  _bannerCurrent = n;
  if(slides[_bannerCurrent]) slides[_bannerCurrent].classList.add('active');
  if(dots[_bannerCurrent]) dots[_bannerCurrent].classList.add('active');
  clearInterval(_bannerTimer);
  _bannerTimer = setInterval(function(){ goBannerSlide((_bannerCurrent + 1) % _bannerTotal); }, 4000);
}

function startBanner() {
  aplicarImagenesBanner(); // aplicar imágenes reales o defaults
  if(_bannerTimer) clearInterval(_bannerTimer);
  _bannerTimer = setInterval(function(){ goBannerSlide((_bannerCurrent + 1) % _bannerTotal); }, 4000);
}

function switchLoginTab(tab) {
  _loginTab = tab;
  const isPersonal = tab === 'personal';
  document.getElementById('panel-login-personal').style.display = isPersonal ? 'block' : 'none';
  document.getElementById('panel-login-apoderado').style.display = isPersonal ? 'none' : 'block';
  var tP = document.getElementById('tab-login-personal');
  var tA = document.getElementById('tab-login-apoderado');
  if(tP) { tP.classList.toggle('active', isPersonal); tP.style.background=''; tP.style.color=''; }
  if(tA) { tA.classList.toggle('active', !isPersonal); tA.style.background=''; tA.style.color=''; }
  document.getElementById('login-error').style.display = 'none';
}

function togglePassApoderado() {
  togglePassField('login-pass-apoderado', event.currentTarget);
}



window.doLogin = function() {
  const email  = document.getElementById('login-email').value.trim();
  const pass   = document.getElementById('login-pass').value;
  const errEl  = document.getElementById('login-error');
  const loadEl = document.getElementById('login-loading');
  errEl.style.display = 'none';
  if(!email || !pass) { errEl.textContent = 'Completa todos los campos'; errEl.style.display = 'block'; return; }
  document.getElementById('btn-login').disabled = true;
  loadEl.style.display = 'block';
  auth.signInWithEmailAndPassword(email, pass)
    .then(cred => {
      console.log('Auth OK, uid:', cred.user.uid);
    })
    .catch(err => {
      loadEl.style.display = 'none';
      document.getElementById('btn-login').disabled = false;
      console.error('Login error:', err.code, err.message);
      const msgs = {
        'auth/invalid-email':        'Correo inválido',
        'auth/user-not-found':       'Usuario no encontrado',
        'auth/wrong-password':       'Contraseña incorrecta',
        'auth/invalid-credential':   'Correo o contraseña incorrectos',
        'auth/too-many-requests':    'Demasiados intentos, espera unos minutos',
        'auth/network-request-failed':'Error de conexión a internet',
        'auth/user-disabled':        'Usuario desactivado',
      };
      errEl.textContent = msgs[err.code] || ('Error: ' + err.code);
      errEl.style.display = 'block';
    });
};

window.doLoginApoderado = async function() {
  const dni   = document.getElementById('login-dni-apoderado').value.trim();
  const pass  = document.getElementById('login-pass-apoderado').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if(!dni || !pass) { errEl.textContent = 'Ingresa el DNI y la contraseña'; errEl.style.display = 'block'; return; }
  if(!/^\d{8}$/.test(dni)) { errEl.textContent = 'El DNI debe tener 8 dígitos'; errEl.style.display = 'block'; return; }

  document.getElementById('btn-login-apoderado').disabled = true;
  document.getElementById('login-loading').style.display  = 'block';

  try {
    const emailVirtual = `${dni}${APO_DOMAIN}`;

    // Intentar login normal primero
    try {
      await auth.signInWithEmailAndPassword(emailVirtual, pass);
      _loginIntentos = 0;
      // onAuthStateChanged redirige a apoderado.html
      return;
    } catch(loginErr) {
      // Firebase 10+ devuelve 'auth/invalid-credential' tanto para contraseña incorrecta
      // como para usuario inexistente. Si la contraseña es el DNI intentamos crear la cuenta.
      const puedeSerNuevo = loginErr.code === 'auth/user-not-found' ||
                            loginErr.code === 'auth/invalid-credential';
      if(puedeSerNuevo && pass === dni) {
        // Intentar crear la cuenta — si ya existe lanzará auth/email-already-in-use
        // (significa que la contraseña es incorrecta)
        let cuentaCreada = false;
        try {
          const tmpApp  = firebase.initializeApp(firebaseConfig, 'new_apo_' + Date.now());
          const tmpAuth = tmpApp.auth();
          await tmpAuth.createUserWithEmailAndPassword(emailVirtual, dni);
          await tmpAuth.signOut();
          await tmpApp.delete();
          cuentaCreada = true;
        } catch(createErr) {
          if(createErr.code === 'auth/email-already-in-use') {
            // Cuenta existe pero contraseña incorrecta
            throw { code: 'auth/wrong-password' };
          }
          throw createErr;
        }
        if(cuentaCreada) {
          // Hacer login — onAuthStateChanged redirige a apoderado.html
          // apoderado.html ya verifica que el alumno exista y maneja el primer ingreso
          await auth.signInWithEmailAndPassword(emailVirtual, dni);
          _loginIntentos = 0;
          return;
        }
      }
      throw loginErr;
    }
  } catch(err) {
    _creandoCuentaApoderado = false;
    document.getElementById('login-loading').style.display  = 'none';
    document.getElementById('btn-login-apoderado').disabled = false;
    _loginIntentos++;
    if(err.code === 'alumno-no-encontrado') {
      errEl.textContent = err.message;
      _loginIntentos = 0;
    } else if(_loginIntentos % 3 === 0) {
      errEl.textContent = 'DNI o contraseña incorrectos. Si no recuerdas tu contraseña, acércate a la administración del colegio.';
    } else if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      errEl.textContent = 'DNI o contraseña incorrectos.';
    } else {
      errEl.textContent = 'Error: ' + (err.message || err.code);
    }
    errEl.style.display = 'block';
  }
};

// Crear cuenta apoderado en Firebase Auth
// Mostrar modal cambio de contraseña obligatorio
function mostrarModalCambioPass(alumnoData) {
  document.getElementById('nueva-pass-telefono').value = alumnoData.telefono || '';
  document.getElementById('nueva-pass-1').value = '';
  document.getElementById('nueva-pass-2').value = '';
  document.getElementById('cambiar-pass-error').style.display = 'none';
  document.getElementById('modal-cambiar-pass').style.display = 'flex';
}

async function confirmarCambioPass() {
  const pass1 = document.getElementById('nueva-pass-1').value;
  const pass2 = document.getElementById('nueva-pass-2').value;
  const telefono = document.getElementById('nueva-pass-telefono').value.trim();
  const errEl = document.getElementById('cambiar-pass-error');
  errEl.style.display = 'none';

  if(pass1.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return; }
  if(pass1 !== pass2) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.style.display = 'block'; return; }
  if(!telefono || !/^\d{9}$/.test(telefono)) { errEl.textContent = 'Ingresa un número de celular válido de 9 dígitos'; errEl.style.display = 'block'; return; }

  try {
    const user = auth.currentUser;
    await user.updatePassword(pass1);
    // Actualizar telefono en alumno y marcar primerIngreso = false
    const alumnoId = _apoderadoAlumno?.id;
    if(alumnoId) {
      await db.collection('alumnos').doc(alumnoId).update({ telefono });
      await db.collection('apoderados').doc(alumnoId).update({ primerIngreso: false, telefono });
    }
    document.getElementById('modal-cambiar-pass').style.display = 'none';
    toast('✅ Contraseña actualizada correctamente', 'success');
    // Mostrar portal apoderado
    mostrarPortalApoderado(_apoderadoAlumno);
  } catch(err) {
    errEl.textContent = 'Error al cambiar contraseña: ' + err.message;
    errEl.style.display = 'block';
  }
}

// Recuperar contraseña por WhatsApp
// ── PERFIL DE USUARIO ──
async function abrirMisDatos() {
  const user = auth.currentUser;
  if(!user) return;
  // Pre-llenar con datos actuales
  const doc = await db.collection('usuarios').doc(user.uid).get();
  const data = doc.exists ? doc.data() : {};
  document.getElementById('datos-nombre').value    = data.nombre    || '';
  document.getElementById('datos-telefono').value  = data.telefono  || '';
  document.getElementById('datos-email').value     = user.email     || '';
  document.getElementById('err-mis-datos').style.display = 'none';
  document.getElementById('ok-mis-datos').style.display  = 'none';
  document.getElementById('modal-mis-datos').style.display = 'flex';
}

async function guardarMisDatos() {
  const nombre   = document.getElementById('datos-nombre').value.trim();
  const telefono = document.getElementById('datos-telefono').value.trim();
  const errEl = document.getElementById('err-mis-datos');
  const okEl  = document.getElementById('ok-mis-datos');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if(!nombre) { errEl.textContent = 'El nombre no puede estar vacío'; errEl.style.display = 'block'; return; }

  try {
    const user = auth.currentUser;
    await db.collection('usuarios').doc(user.uid).update({ nombre, telefono });
    // Actualizar nombre en el avatar
    const partes = nombre.trim().split(' ');
    const iniciales = partes.length >= 2
      ? (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
      : nombre.substring(0,2).toUpperCase();
    document.getElementById('avatar-initials').textContent = iniciales;
    document.getElementById('avatar-initials-menu').textContent = iniciales;
    document.getElementById('menu-user-name').textContent = nombre;
    document.getElementById('user-name-display').textContent = nombre;
    setTimeout(() => msbUpdateUser && msbUpdateUser(), 100);
    okEl.textContent = 'Datos actualizados correctamente'; okEl.style.display = 'block';
    setTimeout(() => { document.getElementById('modal-mis-datos').style.display = 'none'; }, 1500);
  } catch(e) {
    errEl.textContent = 'Error al guardar: ' + e.message; errEl.style.display = 'block';
  }
}

async function cambiarPassPersonal() {
  const actual  = document.getElementById('pass-actual').value;
  const nueva1  = document.getElementById('pass-nueva-1').value;
  const nueva2  = document.getElementById('pass-nueva-2').value;
  const errEl   = document.getElementById('err-pass-personal');
  errEl.style.display = 'none';

  if(!actual)        { errEl.textContent = 'Ingresa tu contraseña actual'; errEl.style.display = 'block'; return; }
  if(nueva1.length < 6) { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return; }
  if(nueva1 !== nueva2) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.style.display = 'block'; return; }

  try {
    const user = auth.currentUser;
    // Re-autenticar antes de cambiar contraseña
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, actual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nueva1);
    document.getElementById('modal-cambiar-pass-personal').style.display = 'none';
    document.getElementById('pass-actual').value  = '';
    document.getElementById('pass-nueva-1').value = '';
    document.getElementById('pass-nueva-2').value = '';
    toast('✅ Contraseña actualizada correctamente', 'success');
  } catch(e) {
    if(e.code === 'auth/wrong-password') {
      errEl.textContent = 'La contraseña actual es incorrecta';
    } else {
      errEl.textContent = 'Error: ' + e.message;
    }
    errEl.style.display = 'block';
  }
}

function toggleUserMenu(e) {
  if(e) e.stopPropagation();
  const menu = document.getElementById('user-dropdown-menu');
  if(menu.style.display === 'block') { closeUserMenu(); return; }

  // Elegir el botón de referencia según el modo
  const isMobile = window.innerWidth <= 700;
  const refBtn = isMobile
    ? document.getElementById('msb-avatar')
    : document.getElementById('avatar-btn');

  if(refBtn) {
    const rect = refBtn.getBoundingClientRect();
    menu.style.top   = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    menu.style.left  = 'auto';
  }
  menu.style.display = 'block';
}
function closeUserMenu() {
  const menu = document.getElementById('user-dropdown-menu');
  if(menu) menu.style.display = 'none';
}
document.addEventListener('click', function(e) {
  const btn   = document.getElementById('avatar-btn');
  const msbAv = document.getElementById('msb-avatar');
  const menu  = document.getElementById('user-dropdown-menu');
  const clickedAvatar = (btn && btn.contains(e.target)) || (msbAv && msbAv.contains(e.target));
  if(menu && !clickedAvatar && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function doLogout() {
  clearTimeout(_inactTimer);
  clearTimeout(_inactWarning);
  if(!confirm('¿Cerrar sesión?')) return;
  sessionStorage.removeItem('splashMostrado');
  try { localStorage.removeItem('asmqr_lastTab'); } catch(e) {}
  if(_alumnosTsUnsubscribe) { _alumnosTsUnsubscribe(); _alumnosTsUnsubscribe = null; }
  if(_configUnsubscribe) { _configUnsubscribe(); _configUnsubscribe = null; }
  auth.signOut();
  // Resetear splash y mostrarlo
  var splash = document.getElementById('splash-screen');
  if(splash) {
    splash.classList.remove('ocultar');
    splash.style.display = 'flex';
  }
  iniciarSplash();
  setTimeout(function() {
    document.getElementById('login-screen').style.display = 'flex';
  }, 5000);
}

// Escuchar cambios de sesión
auth.onAuthStateChanged(async user => {
  if(user) {
    // Detectar si es apoderado (email virtual) o personal
    if(user.email && user.email.includes(APO_DOMAIN)) {
      // ── ES APODERADO — redirigir a apoderado.html ──
      window.location.href = 'apoderado.html';
      return;
    }

    // ── ES PERSONAL DEL COLEGIO ──
    let doc;
    try {
      doc = await db.collection('usuarios').doc(user.uid).get();
    } catch(e) {
      console.error('Firestore error:', e);
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('login-loading').style.display = 'none';
      document.getElementById('btn-login').disabled = false;
      const errEl = document.getElementById('login-error');
      errEl.textContent = 'Error de conexión a la base de datos: ' + e.message;
      errEl.style.display = 'block';
      auth.signOut();
      return;
    }
    if(!doc.exists) {
      auth.signOut();
      const errEl = document.getElementById('login-error');
      errEl.textContent = 'Usuario no tiene permisos configurados. Contacta al administrador.';
      errEl.style.display = 'block';
      document.getElementById('login-loading').style.display = 'none';
      document.getElementById('btn-login').disabled = false;
      return;
    }
    currentUser = user;
    currentRol = doc.data().rol;
    const nombre = doc.data().nombre || user.email;

    // Marcar sesión activa para evitar splash al refrescar
    try { sessionStorage.setItem('asmqr_haySession', '1'); } catch(e) {}
    // Ocultar login, mostrar app
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-header').style.display = '';
    const navEl = document.getElementById('nav-tabs');
    if(navEl) navEl.style.display = '';
    document.getElementById('app-main').style.display = '';
    const bnav = document.getElementById('bottom-nav');
    if(bnav) bnav.style.display = '';
    resetInactTimer(); // Iniciar contador de inactividad
    document.getElementById('user-name-display').textContent = nombre;
    document.getElementById('user-rol-badge').textContent = currentRol.toUpperCase();
    // Mostrar avatar con iniciales
    const partes = nombre.trim().split(' ');
    const iniciales = partes.length >= 2
      ? (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
      : nombre.substring(0,2).toUpperCase();
    document.getElementById('avatar-initials').textContent = iniciales;
    document.getElementById('avatar-initials-menu').textContent = iniciales;
    document.getElementById('menu-user-name').textContent = nombre;
    document.getElementById('menu-user-rol').textContent = currentRol.toUpperCase();
    document.getElementById('avatar-btn').style.display = 'inline-flex';
    setTimeout(() => msbUpdateUser && msbUpdateUser(), 200);

    // Aplicar permisos según rol (incluye mostrar/ocultar tab usuarios)
    aplicarPermisos(currentRol);

    // Cargar datos y configuración
    await cargarPrivilegiosActuales();
    cargarConfigBanner(); // cargar imágenes banner en segundo plano
    await inicializarFiltros();
    await actualizarTodosLosFiltros();
    updateStats();
    iniciarAlumnosListener(); // Listener en tiempo real para alumnos — sincroniza importación Excel entre dispositivos
    iniciarConfigListener(); // Listener en tiempo real para config — sincroniza horarios entre dispositivos
    initSessionControl();   // Iniciar control de sesión duplicada
    anunciarSesion();        // Avisar a otras pestañas
  } else {
    // SIN SESION — mostrar login solo si splash ya terminó
    var _ls = document.getElementById('login-screen');
    var _sp = document.getElementById('splash-screen');
    var splashActivo = _sp && _sp.style.display !== 'none';
    if(_ls && !splashActivo) { _ls.style.display = 'flex'; _ls.style.zIndex = '10005'; startBanner(); cargarConfigBanner(); }
    else if(_ls && splashActivo) {
      setTimeout(function() {
        var sp2 = document.getElementById('splash-screen');
        if(sp2) sp2.style.display = 'none';
        if(_ls) { _ls.style.display = 'flex'; _ls.style.zIndex = '10005'; startBanner(); cargarConfigBanner(); }
      }, 6500);
    }
    // Luego resetear el resto con protección de errores
    try {
      try { sessionStorage.removeItem('asmqr_haySession'); sessionStorage.removeItem('asmqr_lastSection'); } catch(e) {}
      currentUser = null;
      currentRol = null;
      if(_cameraChannel) { _cameraChannel.close(); _cameraChannel = null; }
      ['scan','alumnos','registro','reportes','incidentes','usuarios','config'].forEach(t => {
        const el = document.getElementById('tab-'+t);
        if(el) el.style.display = 'none';
      });
      const toggleCarnets = document.getElementById('toggle-modo-carnets');
      if(toggleCarnets) toggleCarnets.checked = false;
      try { toggleModoCarnets(false); } catch(e2) {}
      document.querySelectorAll('.chk-alumno').forEach(c => c.checked = false);
      const btnImprimir = document.getElementById('btn-imprimir-carnets');
      if(btnImprimir) { btnImprimir.style.display = 'none'; btnImprimir.disabled = true; btnImprimir.textContent = '🖨 Imprimir Carnets'; }
      const tbody = document.querySelector('#tabla-alumnos tbody');
      if(tbody) tbody.innerHTML = '';
      document.getElementById('app-header').style.display = 'none';
      const navEl2 = document.getElementById('nav-tabs');
      if(navEl2) navEl2.style.display = 'none';
      document.getElementById('app-main').style.display = 'none';
      const bnav2 = document.getElementById('bottom-nav');
      if(bnav2) bnav2.style.display = 'none';
      document.getElementById('login-loading').style.display = 'none';
      document.getElementById('login-error').style.display = 'none';
      document.getElementById('btn-login').disabled = false;
      document.getElementById('login-email').value = '';
      document.getElementById('login-pass').value = '';
      document.getElementById('user-name-display').style.display = 'none';
      document.getElementById('user-rol-badge').style.display = 'none';
      document.getElementById('btn-logout').style.display = 'none';
      document.getElementById('avatar-btn').style.display = 'none';
      try { closeUserMenu(); } catch(e3) {}
    } catch(e) {
      console.error('Error en bloque sin sesion:', e);
    }
    // Garantizar login visible al final pase lo que pase
    if(_ls) { _ls.style.display = 'flex'; _ls.style.zIndex = '10005'; }
  }
});

function aplicarPermisos(rol) {
  setTimeout(renderBottomNav, 100);
  // Pestañas visibles según rol
  const permisos = {
    admin:    ['inicio','scan','alumnos','registro','reportes','incidentes','usuarios','config'],
    director: ['inicio','registro','reportes','incidentes'],
    profesor: ['inicio','alumnos','registro','incidentes'],
    portero:  ['inicio','scan'],
  };
  const tabs = permisos[rol] || ['scan'];

  // Mostrar/ocultar tabs
  ['scan','alumnos','registro','reportes','incidentes','usuarios','config'].forEach(t => {
    const el = document.getElementById('tab-'+t);
    if(el) el.style.display = tabs.includes(t) ? '' : 'none';
  });
  const comTab = document.getElementById('tab-comunicacion');
  if(comTab) comTab.style.display = (rol === 'portero') ? 'none' : '';

  // Restaurar última sección activa si existe y está permitida
  var lastSection = null;
  try { lastSection = sessionStorage.getItem('asmqr_lastSection'); } catch(e) {}
  if(lastSection && tabs.includes(lastSection)) {
    showSectionDirect(lastSection);
    setActiveTab('tab-' + lastSection);
    if(lastSection === 'inicio') cargarDashboardInicio();
  } else {
    showSectionDirect('inicio');
    setActiveTab('tab-inicio');
    cargarDashboardInicio();
  }
}

function _isDocenteAula() {
  const c = String(currentCargo || '').trim().toLowerCase();
  return c.includes('docente de aula') || c.includes('docente aula');
}

/**
 * Auto-selecciona la tutoría si el usuario es docente de aula única.
 * Bloquea los campos si se auto-selecciona.
 */
async function _autoSelectTutoria(nivelId, gradoId, seccionId) {
  if (!_isDocenteAula()) return; 
  const g = String(currentTutorInfo?.tutorGrado || '').trim();
  const s = String(currentTutorInfo?.tutorSeccion || '').trim().toUpperCase();
  if (!g || !s) return;
  const nEl = document.getElementById(nivelId);
  const gEl = document.getElementById(gradoId);
  const sEl = document.getElementById(seccionId);
  
  // 1. Asegurar que el nivel esté poblado y seleccionado
  let nivel = nEl?.value || '';
  if (!nivel) {
    const alumnos = await getAlumnosFiltrados();
    nivel = alumnos[0]?.turno || '';
  }
  if (nEl) { 
    if (![...nEl.options].some(o => o.value === nivel)) {
      await poblarFiltroNivel(nivelId);
    }
    nEl.value = nivel; nEl.disabled = true; 
  }

  // 2. Asegurar que el grado esté poblado y seleccionado
  if (gEl) {
    if (![...gEl.options].some(o => o.value === g)) {
      gEl.innerHTML = `<option value="${g}">${g}</option>`;
    }
    gEl.value = g; gEl.disabled = true;
  }

  // 3. Asegurar que la sección esté poblada y seleccionada
  if (sEl) {
    if (![...sEl.options].some(o => o.value === s)) {
      sEl.innerHTML = `<option value="${s}">${s}</option>`;
    }
    sEl.value = s; sEl.disabled = true;
  }
}

function showSectionDirect(id) {
  currentSection = id;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('scan-action-bar').style.display = 'none';
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById('sec-'+id);
  const tab = document.getElementById('tab-'+id);
  if(sec) sec.classList.add('active');
  if(tab) tab.classList.add('active');

  // ── Controlar altura del scanner: clase scanner-mode solo en pestaña Escanear ──
  const mainEl = document.querySelector('main');
  if(id === 'scan') {
    mainEl.classList.add('scanner-mode');
    mainEl.style.overflow = 'hidden';
    mainEl.style.paddingBottom = '0';
  } else {
    mainEl.classList.remove('scanner-mode');
    mainEl.style.overflow = '';
    mainEl.style.paddingBottom = '';
  }

  // Scroll al top siempre al cambiar sección
  window.scrollTo({ top: 0, behavior: 'instant' });
  if(id==='alumnos') { 
    limpiarFiltrosAlumnos(); 
    const labelCarnets = document.getElementById('label-modo-carnets');
    if(labelCarnets) {
      labelCarnets.style.display = _isAdminDirectorOrCoord() ? 'flex' : 'none';
    }
  }
  if(id==='registro') {
    poblarSelectorMes('reg-mes-select'); 
    limpiarFiltrosRegistro(); 
    const btnBorrar = document.getElementById('btn-borrar-registros-hoy');
    if(btnBorrar) {
      // Solo administrador puede borrar registros (user instruction)
      btnBorrar.style.display = (_normRol(currentRol) === 'admin') ? '' : 'none';
    }
  }
  if(id==='reportes') {
    poblarSelectorMes('rep-mes-select');
    iniciarFiltrosReportes();
    mostrarBtnAnio();
    renderReportes();
  }
  if(id==='scan') updateStats();
  if(id==='rol-examenes' && typeof initRolExamenes === 'function') initRolExamenes();
  if(id==='usuarios') renderUsuarios();
  if(id==='config') renderConfig();
  updateBottomNavActive(id);
  if(id==='incidentes') {
    poblarSelectorMesInc();
    renderIncidentes();
  }
}

// ============================================================
// SPLASH SCREEN
// ============================================================
const FRASES_SPLASH = [
  '"Ser Santo Dominguino es ser el mejor"',
  '"El futuro pertenece a quienes creen en la belleza de sus sueños."',
  '"Invertir en conocimiento siempre paga el mejor interés."',
  '"La disciplina es el puente entre las metas y los logros."',
  '"Cada día es una nueva oportunidad para aprender algo nuevo."',
];

function iniciarSplash() {
  const splash = document.getElementById('splash-screen');
  if(!splash) return;

  // Año escolar
  const yearEl = document.getElementById('splash-year');
  if(yearEl) yearEl.textContent = 'Año Escolar ' + new Date().getFullYear();

  // Eslogan del colegio (si está vacío, frase aleatoria de respaldo)
  const fraseEl = document.getElementById('splash-frase');
  if(fraseEl) {
    if(COLEGIO_ESLOGAN && COLEGIO_ESLOGAN.trim()) {
      fraseEl.textContent = COLEGIO_ESLOGAN;
    } else {
      const idx = Math.floor(Math.random() * FRASES_SPLASH.length);
      fraseEl.textContent = FRASES_SPLASH[idx];
    }
  }

  // Nombre dividido en dos líneas
  const nomEl  = document.getElementById('splash-nombre');
  const preEl  = document.getElementById('splash-prefijo');
  const partes = COLEGIO_NOMBRE.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
  if(nomEl && preEl && partes) {
    preEl.textContent = partes[1];
    nomEl.textContent = partes[2];
  } else if(nomEl) {
    nomEl.textContent = COLEGIO_NOMBRE;
  }

  getConfig().catch(function(){});

  // Iniciar barra de progreso
  setTimeout(function() {
    const bar = document.getElementById('splash-bar');
    if(bar) bar.classList.add('go');
  }, 100);

  // Ocultar splash después de 6 segundos
  setTimeout(function() {
    splash.classList.add('ocultar');
    setTimeout(function() {
      splash.style.display = 'none';
      // Mostrar login cuando splash termina
      var ls = document.getElementById('login-screen');
      if(ls && !firebase.auth().currentUser) {
        ls.style.display = 'flex';
        ls.style.zIndex = '10005';
      }
    }, 600);
  }, 6000);
}

// Iniciar splash solo una vez por sesión — no en cada recarga
document.addEventListener('DOMContentLoaded', function() {
  // Ocultar app hasta que Firebase resuelva
  var header = document.getElementById('app-header');
  var main   = document.getElementById('app-main');
  var nav    = document.getElementById('nav-tabs');
  var bnav   = document.getElementById('bottom-nav');
  var login  = document.getElementById('login-screen');
  if(header) header.style.display = 'none';
  if(main)   main.style.display   = 'none';
  if(nav)    nav.style.display    = 'none';
  if(bnav)   bnav.style.display   = 'none';
  // Ocultar login — el splash lo tapa primero, luego aparece el login
  if(login)  login.style.display = 'none';

  var forzarSplash = new URLSearchParams(window.location.search).get('splash') === '1';
  if(forzarSplash) {
    history.replaceState(null, '', window.location.pathname);
    sessionStorage.removeItem('splashMostrado');
  }
  // Splash solo si no hay sesión guardada (va al login)
  // Si hay sesión activa, Firebase onAuthStateChanged se encargará de mostrar la app
  var haySession = sessionStorage.getItem('asmqr_haySession') === '1';
  if(haySession) {
    // Hay sesión → ocultar splash y esperar a que Firebase restaure
    var splash = document.getElementById('splash-screen');
    if(splash) splash.style.display = 'none';
    // login también oculto — Firebase restaurará la app
  } else if(!sessionStorage.getItem('splashMostrado')) {
    sessionStorage.setItem('splashMostrado', '1');
    // Splash visible, login oculto hasta que splash termine
    var splash = document.getElementById('splash-screen');
    if(splash) { splash.style.display = 'flex'; splash.style.zIndex = '10006'; }
    if(login)  login.style.display = 'none';
    iniciarSplash();
  } else {
    // Ya se mostró el splash antes — ir directo al login
    var splash = document.getElementById('splash-screen');
    if(splash) splash.style.display = 'none';
    if(login)  { login.style.display = 'flex'; login.style.zIndex = '10005'; }
  }
});

// ============================================================
// CACHE PERSISTENTE — localStorage con TTL
// Reduce lecturas Firestore entre sesiones del mismo día
// ============================================================
const LSC = {
  TTL_ALUMNOS:              8 * 60 * 60 * 1000,  // 8 horas
  TTL_CONFIG:               8 * 60 * 60 * 1000,  // 8 horas
  TTL_REGISTROS:           10 * 60 * 1000,        // 10 minutos (mes actual)
  TTL_REGISTROS_MES_PASADO: 60 * 60 * 1000,       // 1 hora (meses/años cerrados)
  TTL_INCIDENTES:          15 * 60 * 1000,        // 15 minutos
  TTL_USUARIOS:            30 * 60 * 1000,        // 30 minutos

  set(key, data, ttl) {
    try {
      const serialized = JSON.stringify({ data, ts: Date.now(), ttl });
      try {
        localStorage.setItem('asmqr_' + key, serialized);
      } catch(e) {
        // Storage lleno: limpiar entradas viejas y reintentar una vez
        try {
          const ahora = Date.now();
          Object.keys(localStorage)
            .filter(k => k.startsWith('asmqr_'))
            .forEach(k => {
              try {
                const obj = JSON.parse(localStorage.getItem(k));
                if(ahora - obj.ts > obj.ttl) localStorage.removeItem(k);
              } catch(_) { localStorage.removeItem(k); }
            });
          localStorage.setItem('asmqr_' + key, serialized);
        } catch(_) { /* Si aun falla, continuar solo con cache en memoria */ }
      }
    } catch(e) { /* Error de serialización — ignorar */ }
  },

  get(key) {
    try {
      const raw = localStorage.getItem('asmqr_' + key);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(Date.now() - obj.ts > obj.ttl) {
        localStorage.removeItem('asmqr_' + key);
        return null;
      }
      return obj.data;
    } catch(e) { return null; }
  },

  del(key) {
    try { localStorage.removeItem('asmqr_' + key); } catch(e) {}
  },

  // Limpiar todas las claves del sistema
  clear() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('asmqr_'))
        .forEach(k => localStorage.removeItem(k));
    } catch(e) {}
  }
};




// ============================================================
// NAVIGATION
// ============================================================
// ── Dashboard Inicio ──
async function cargarDashboardInicio() {
  try {
    const fechaStr = new Date().toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    const f = document.getElementById('inicio-fecha');
    if(f) f.textContent = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
    const bienvenida = document.getElementById('inicio-bienvenida');
    if(bienvenida && currentUser) {
      const nombre = document.getElementById('menu-user-name')?.textContent || '';
      bienvenida.textContent = 'Bienvenido' + (nombre ? ', ' + nombre.split(' ')[0] : '');
    }

    const [alumnos, regsHoy] = await Promise.all([DB.getAlumnos(), DB.getRegistros({fecha:hoy()})]);
    const total = alumnos.length;
    const presentes = new Set(regsHoy.filter(r=>r.tipo==='INGRESO').map(r=>r.alumnoId)).size;
    const ausentes = Math.max(0, total - presentes);
    const pct = total ? Math.round(presentes/total*100) : 0;

    document.getElementById('inicio-kpi-total').textContent = total;
    document.getElementById('inicio-kpi-presentes').textContent = presentes;
    document.getElementById('inicio-kpi-ausentes').textContent = ausentes;
    document.getElementById('inicio-kpi-pct').textContent = pct + '% asistencia';
    document.getElementById('inicio-kpi-aus-pct').textContent = (100-pct) + '% del total';

    // Aulas únicas
    const aulas = new Set(alumnos.map(a=>a.grado+a.seccion));
    const nAulasEl = document.getElementById('inicio-kpi-aulas');
    if(nAulasEl) nAulasEl.textContent = aulas.size + ' aulas';

    // Barras por nivel
    const cfg = await getConfig();
    const niveles = (cfg.niveles||[]).map(n=>n.nombre);
    const barsEl = document.getElementById('inicio-niveles-bars');
    if(barsEl && niveles.length) {
      const colors = ['#378ADD','#16a34a','#854F0B','#534AB7'];
      barsEl.innerHTML = niveles.map((niv,i) => {
        const alNiv = alumnos.filter(a=>a.turno===niv);
        const presNiv = new Set(regsHoy.filter(r=>r.tipo==='INGRESO'&&r.turno===niv).map(r=>r.alumnoId)).size;
        const pNiv = alNiv.length ? Math.round(presNiv/alNiv.length*100) : 0;
        const col = colors[i % colors.length];
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<div style="font-size:0.78rem;color:var(--text);width:72px;flex-shrink:0;">' + niv + '</div>' +
          '<div style="flex:1;height:7px;background:var(--surface2);border-radius:4px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:4px;background:' + col + ';width:' + pNiv + '%;"></div></div>' +
          '<div style="font-size:0.75rem;color:' + col + ';width:32px;text-align:right;">' + pNiv + '%</div></div>';
      }).join('');
    }

    // Últimos ingresos
    const ultimos = regsHoy
      .filter(r=>r.tipo==='INGRESO')
      .sort((a,b)=>(b.hora||'').localeCompare(a.hora||''))
      .slice(0,5);
    const ulEl = document.getElementById('inicio-ultimos-ingresos');
    if(ulEl) {
      if(!ultimos.length) {
        ulEl.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;text-align:center;padding:16px;">Sin ingresos registrados hoy</div>';
      } else {
        const bgColors = ['#E6F1FB','#EAF3DE','#EEEDFE','#FAEEDA','#E1F5EE'];
        const txColors = ['#0C447C','#27500A','#3C3489','#633806','#085041'];
        ulEl.innerHTML = ultimos.map((r,i) => {
          const initials = (r.nombre||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
          const est = r.estado||'';
          const badgeColor = est.includes('Tardanza') ? '#FAEEDA' : '#EAF3DE';
          const badgeTx = est.includes('Tardanza') ? '#633806' : '#27500A';
          const badgeLbl = est.includes('Tardanza') ? 'Tardanza' : 'Puntual';
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);">' +
            '<div style="width:28px;height:28px;border-radius:50%;background:' + bgColors[i%5] + ';color:' + txColors[i%5] + ';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;">' + initials + '</div>' +
            '<div style="flex:1;min-width:0;"><div style="font-size:0.8rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.nombre||'') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--muted);">' + (r.grado||'') + ' ' + (r.seccion||'') + ' · ' + (r.hora||'') + '</div></div>' +
            '<span style="background:' + badgeColor + ';color:' + badgeTx + ';padding:2px 7px;border-radius:4px;font-size:9px;font-weight:600;">' + badgeLbl + '</span></div>';
        }).join('');
      }
    }
  } catch(e) { console.error('cargarDashboardInicio:', e); }
}

// ── Funciones del nuevo menú con dropdowns ──
function openNavDrop(id, btn) {
  closeNavDrops();
  const drop = document.getElementById(id);
  if(!drop) return;
  drop.classList.add('open');
  btn.classList.add('active');
}
function toggleNavDrop(id, btn) {
  openNavDrop(id, btn);
}
function closeNavDrops() {
  document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
}
function setActiveTab(id) {
  closeNavDrops();
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
}
// Cerrar dropdowns al salir del nav-tabs o al click fuera
const _navTabs = document.getElementById('nav-tabs');
if(_navTabs) {
  _navTabs.addEventListener('mouseleave', function() {
    setTimeout(closeNavDrops, 80);
  });
}
document.addEventListener('click', function(e) {
  if(!e.target.closest('.nav-tab') && !e.target.closest('#nav-tabs')) closeNavDrops();
});

function showSection(id) {
  try { sessionStorage.setItem('asmqr_lastSection', id); } catch(e) {}
  showSectionDirect(id);
  // Guardar pestaña activa
  try { localStorage.setItem('asmqr_lastTab', id); } catch(e) {}
}

// ============================================================
// QR SCANNER — getUserMedia + BarcodeDetector/jsQR
// ============================================================
let videoStream = null;
let scannerRunning = false;
let scanInterval = null;
let lastScanned = '';
let lastScanTime = 0;
let pendingStudent = null;
let currentSection = 'scan';

let _cameraIdleTimer = null;
const CAMERA_IDLE_MS = 3 * 60 * 1000;

function _isMobileLike() {
  try {
    if(window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return true;
  } catch(e) {}
  const ua = String(navigator.userAgent || '');
  return /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
}

function _resetCameraIdleTimer() {
  if(_cameraIdleTimer) { clearTimeout(_cameraIdleTimer); _cameraIdleTimer = null; }
  if(!_isMobileLike()) return;
  if(!scannerRunning || !videoStream) return;
  _cameraIdleTimer = setTimeout(() => {
    if(scannerRunning) {
      stopScanner();
      const st = document.getElementById('scan-status');
      if(st) st.textContent = 'Cámara detenida por inactividad — presiona Iniciar para escanear';
      toast('Cámara desactivada por inactividad', 'warning');
    }
  }, CAMERA_IDLE_MS);
}

['touchstart','mousemove','keydown','click','scroll'].forEach(evt => {
  document.addEventListener(evt, () => {
    if(scannerRunning) _resetCameraIdleTimer();
  }, { passive: true });
});

// ── SET DE REGISTROS DEL DÍA (pre-cargado al iniciar cámara) ──
// Evita consultar Firestore en cada escaneo
// Estructura: { alumnoId: { ingreso: bool, salida: bool } }
let _hoyRegs = {};
let _hoyRegsLoaded = false;
let _hoyRegsUnsubscribe = null; // handle del listener onSnapshot

// Suscribe un listener en tiempo real sobre los registros de hoy.
// Ventajas vs polling: 0 lecturas periódicas, sincronización inmediata entre dispositivos,
// Firestore solo cobra 1 read por documento que cambia (no releer todo el día cada 10 min).
function iniciarHoyRegsListener() {
  if(_hoyRegsUnsubscribe) _hoyRegsUnsubscribe(); // limpiar listener previo si existe
  const hoyStr = hoy();
  _hoyRegsUnsubscribe = db.collection('registros')
    .where('fecha', '==', hoyStr)
    .onSnapshot(snap => {
      _hoyRegs = {};
      snap.docs.forEach(d => {
        const r = d.data();
        if(!_hoyRegs[r.alumnoId]) _hoyRegs[r.alumnoId] = { ingreso: false, salida: false, tardanza: false };
        if(r.tipo === 'INGRESO') {
          _hoyRegs[r.alumnoId].ingreso = true;
          if(r.estado === 'Tardanza') _hoyRegs[r.alumnoId].tardanza = true;
        }
        if(r.tipo === 'SALIDA') _hoyRegs[r.alumnoId].salida = true;
      });
      _hoyRegsLoaded = true;
      updateStats(); // actualiza contadores en tiempo real para todos los operadores
    }, err => {
      console.warn('[Scanner] listener registros error:', err);
      _hoyRegsLoaded = false;
    });
}

function detenerHoyRegsListener() {
  if(_hoyRegsUnsubscribe) { _hoyRegsUnsubscribe(); _hoyRegsUnsubscribe = null; }
  _hoyRegsLoaded = false;
}

function actualizarHoyRegs(alumnoId, tipo, esTardanza=false) {
  if(!_hoyRegs[alumnoId]) _hoyRegs[alumnoId] = { ingreso: false, salida: false, tardanza: false };
  if(tipo === 'INGRESO') {
    _hoyRegs[alumnoId].ingreso = true;
    if(esTardanza) _hoyRegs[alumnoId].tardanza = true;
  }
  if(tipo === 'SALIDA') _hoyRegs[alumnoId].salida = true;
}

function getRegsHoyLocal(alumnoId) {
  return _hoyRegs[alumnoId] || { ingreso: false, salida: false, tardanza: false };
}

function setUIScanning(active) {
  document.getElementById('btn-start-scan').disabled = active;
  document.getElementById('btn-stop-scan').disabled = !active;
  const ov = document.getElementById('qr-frame-overlay');
  if(ov) ov.style.display = active ? 'flex' : 'none';
}

function showPlaceholder(show) {
  const ph  = document.getElementById('cam-placeholder');
  const vid = document.getElementById('qr-video');
  const ovl = document.getElementById('qr-frame-overlay');
  if(ph)  ph.style.display  = show ? 'flex'  : 'none';
  if(vid) vid.style.display = show ? 'none'  : 'block';
  if(ovl) ovl.style.display = show ? 'none'  : 'flex';
  // Forzar reflow para que el video tome dimensiones correctas en móvil
  if(!show && vid) {
    vid.style.width = '100%';
    requestAnimationFrame(() => { vid.style.width = '100%'; });
  }
}

function startScanner() {
  document.getElementById('scan-status').textContent = '⏳ Solicitando cámara...';
  document.getElementById('btn-start-scan').disabled = true;

  // Suscribir listener en tiempo real — reemplaza el polling de 10 min
  iniciarHoyRegsListener();

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
    .then(stream => {
      videoStream = stream;
      const video = document.getElementById('qr-video');
      video.srcObject = stream;
      showPlaceholder(false);
      video.play().catch(() => {});
      const onReady = () => {
        if(scannerRunning) return;
        scannerRunning = true;
        setUIScanning(true);
        document.getElementById('scan-status').textContent = '🟢 Cámara activa — apunta al QR';
        anunciarCamaraActiva();
        _resetCameraIdleTimer();
        startScanLoop();
      };
      video.onloadedmetadata = onReady;
      video.oncanplay = onReady;
      setTimeout(onReady, 1500);
    })
    .catch(err => {
      document.getElementById('btn-start-scan').disabled = false;
      showPlaceholder(true);
      document.getElementById('scan-status').textContent = '⚠ Sin acceso a cámara';
      toast('Error cámara: ' + err.message, 'error');
    });
}

function stopScanner() {
  scannerRunning = false;
  if(scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  detenerHoyRegsListener();
  if(videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  if(_cameraIdleTimer) { clearTimeout(_cameraIdleTimer); _cameraIdleTimer = null; }
  const video = document.getElementById('qr-video');
  if(video) video.srcObject = null;
  setUIScanning(false);
  showPlaceholder(true);
  document.getElementById('scan-status').textContent = 'Cámara detenida — presiona Iniciar para escanear';
}

// Pausa temporal del escáner mientras el usuario escribe el DNI manual
function _pausarEscaner() {
  if(scannerRunning) scannerRunning = false;
}
function _reanudarEscaner() {
  if(videoStream && scanInterval) scannerRunning = true;
}

async function escanearFotoQR(input) {
  const file = input.files[0];
  if(!file) return;

  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    let detected = false;

    // Intentar con BarcodeDetector nativo primero
    if('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(img);
        if(barcodes.length > 0) {
          detected = true;
          toast('QR detectado ✅', 'success');
          onQRSuccess(barcodes[0].rawValue);
        }
      } catch(e) {}
    }

    // Fallback jsQR
    if(!detected) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if(code && code.data) {
        detected = true;
        toast('QR detectado ✅', 'success');
        onQRSuccess(code.data);
      }
    }

    if(!detected) {
      toast('No se detectó QR. Intenta con mejor luz y enfoque.', 'error');
    }
  };
  img.src = url;
  input.value = '';
}

function startScanLoop() {
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if(scanInterval) clearInterval(scanInterval);

  // Usar BarcodeDetector nativo si está disponible (Android Chrome, Samsung Browser)
  if('BarcodeDetector' in window) {
    document.getElementById('scan-status').textContent = '🟢 Cámara activa (detector nativo) — apunta al QR';
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scanInterval = setInterval(async () => {
      if(!scannerRunning || video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        if(barcodes.length > 0) {
          const text = barcodes[0].rawValue;
          const now = Date.now();
          if(text !== lastScanned || now - lastScanTime > 3000) {
            lastScanned = text;
            lastScanTime = now;
            onQRSuccess(text);
          }
        }
      } catch(e) {}
    }, 100);
  } else {
    // Fallback jsQR
    document.getElementById('scan-status').textContent = '🟢 Cámara activa — apunta al QR';
    scanInterval = setInterval(() => {
      if(!scannerRunning || video.readyState < 2) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if(code && code.data) {
          const now = Date.now();
          if(code.data !== lastScanned || now - lastScanTime > 3000) {
            lastScanned = code.data;
            lastScanTime = now;
            onQRSuccess(code.data);
          }
        }
      } catch(e) {}
    }, 100);
  }
}

function onQRSuccess(text) {
  _resetCameraIdleTimer();
  processQR(text.trim());
}

function flashGreenFrame() {
  const frame = document.querySelector('.qr-frame');
  if(!frame) return;
  frame.classList.add('detected');
  setTimeout(() => frame.classList.remove('detected'), 1000);
}

// ── OVERLAY: mostrar resultado visual en la columna derecha ──
let _overlayTimer = null;

function showOverlay(tipo, nombre, grado, msg, sub) {
  const el = document.getElementById('scan-result-overlay');
  if(!el) return;
  if(_overlayTimer) { clearTimeout(_overlayTimer); _overlayTimer = null; }

  // Ocultar tarjeta antigua
  document.getElementById('result-empty').style.display = 'none';
  document.getElementById('result-student').style.display = 'none';
  document.getElementById('scan-action-bar').style.display = 'none';

  // Círculos SVG sin fondo de color
  const R = 48, CX = 52, CY = 52, SIZE = 104;
  function svgCircle(stroke, fill, symbol) {
    return `<div class="sro-circle"><svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="3.5"/>
      ${symbol}
    </svg></div>`;
  }
  // Check verde — ingreso puntual
  const iconOk = svgCircle('#10b981','rgba(16,185,129,0.15)',
    `<polyline points="33,52 46,65 71,39" fill="none" stroke="#10b981" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
  // Check amarillo — tardanza
  const iconTardanza = svgCircle('#f59e0b','rgba(245,158,11,0.15)',
    `<polyline points="33,52 46,65 71,39" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
  // Triángulo rojo — error / ya registrado / QR inválido
  const iconError = svgCircle('#ef4444','rgba(239,68,68,0.15)',
    `<polygon points="52,30 72,74 32,74" fill="none" stroke="#ef4444" stroke-width="4" stroke-linejoin="round"/>
     <line x1="52" y1="44" x2="52" y2="60" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
     <circle cx="52" cy="68" r="2.5" fill="#ef4444"/>`);

  // Puerta naranja — salida sin ingreso previo
  const iconSinIngreso = svgCircle('#f97316','rgba(249,115,22,0.15)',
    `<text x="52" y="62" text-anchor="middle" font-size="34" fill="#f97316" font-family="sans-serif">!</text>`);

  const configs = {
    loading:     { icon: `<div class="sro-spinner"></div>`, dur: null  },
    ok:          { icon: iconOk,          dur: 3000  },
    tardanza:    { icon: iconTardanza,    dur: 3500  },
    sinIngreso:  { icon: iconSinIngreso,  dur: 4000  },
    yaing:       { icon: iconError,       dur: 3000  },
    yasal:       { icon: iconError,       dur: 3000  },
    noqr:        { icon: iconError,       dur: 2500  },
    nored:       { icon: iconError,       dur: 3000  },
    salida:      { icon: iconOk,          dur: 3000  },
  };
  const cfg = configs[tipo] || configs.noqr;

  el.className = 'show';
  el.innerHTML = cfg.icon
    + (nombre ? `<div class="sro-name">${nombre}</div>` : '')
    + (grado  ? `<div class="sro-sub">${grado}</div>` : '')
    + `<div class="sro-msg">${msg}</div>`
    + (sub    ? `<div class="sro-sub">${sub}</div>` : '');

  if(cfg.dur) {
    _overlayTimer = setTimeout(hideOverlay, cfg.dur);
  }
}

function hideOverlay() {
  const el = document.getElementById('scan-result-overlay');
  if(el) el.className = '';
  document.getElementById('result-empty').style.display = 'flex';
  pendingStudent = null;
}

let _procesandoQR = false;
async function processQR(rawId) {
  if(_procesandoQR) return;
  _procesandoQR = true;
  try {
    let id = (rawId||'').trim().replace(/\s+/g, '');
    if(!id) return;
    // Soporte para token diario: "DNI|YYYY-MM-DD"
    // Los carnets digitales incluyen la fecha; carnets impresos (solo DNI) siguen funcionando
    if(id.includes('|')) {
      const partes = id.split('|');
      const tokenFecha = partes[1];
      if(tokenFecha !== hoy()) {
        showOverlay('noqr', '', '', 'QR expirado', `QR del ${tokenFecha} — muestra el QR de hoy`);
        return;
      }
      id = partes[0];
    }
    flashGreenFrame();
    // Mostrar spinner mientras busca
    showOverlay('loading', '', '', 'Buscando alumno...', '');
    try {
      const alumnos = await DB.getAlumnos();
      const alumno = alumnos.find(a => a.id === id) ||
                     alumnos.find(a => a.id.trim() === id) ||
                     alumnos.find(a => a.id.toLowerCase() === id.toLowerCase());
      if(!alumno) {
        showOverlay('noqr', '', '', 'QR no válido', `ID "${id}" no encontrado`);
        return;
      }
      // Registrar automáticamente
      await autoRegistrar(alumno);
    } catch(e) {
      showOverlay('nored', '', '', 'Error de conexión', 'Intenta de nuevo');
      console.error(e);
    }
  } finally {
    _procesandoQR = false;
  }
}

function manualRegister() {
  const id = document.getElementById('manual-id').value.trim();
  if(!id){ toast('Ingresa un ID', 'warning'); return; }
  _resetCameraIdleTimer();
  processQR(id);
  document.getElementById('manual-id').value = '';
}

async function autoRegistrar(alumno) {
  const now   = new Date();
  const today = hoy();
  const nombre = (alumno.apellidos + ' ' + alumno.nombres).trim();
  const grado  = alumno.grado + ' ' + alumno.seccion + ' — ' + alumno.turno;

  try {
    // ── Usar Set local (sin consulta Firestore) ──
    // Si no está precargado aún, fallback a Firestore
    let tieneIngreso, tieneSalida;
    if(_hoyRegsLoaded) {
      const local = getRegsHoyLocal(alumno.id);
      tieneIngreso = local.ingreso;
      tieneSalida  = local.salida;
    } else {
      const regsHoy = await DB.getRegistros({fecha: today, alumnoId: alumno.id});
      tieneIngreso = regsHoy.some(r => r.tipo === 'INGRESO');
      tieneSalida  = regsHoy.some(r => r.tipo === 'SALIDA');
    }

    // ── Ya registró INGRESO y SALIDA ──
    if(tieneIngreso && tieneSalida) {
      showOverlay('yasal', nombre, grado, 'Ya registró ingreso y salida hoy', '');
      return;
    }

    // ── Obtener horario del nivel y calcular ventanas ──
    const horario  = await getHorarioByNivel(alumno.turno);
    const toMin    = s => { const [h,m] = (s||'00:00').split(':').map(Number); return h*60+m; };
    const ahoraMin = now.getHours() * 60 + now.getMinutes();
    const apertura = toMin(horario.horaApertura);
    const limite   = toMin(horario.horaLimite);
    const corte    = toMin(horario.horaCorte);
    const salida   = toMin(horario.horaSalida);

    // ── Determinar tipo según estado del alumno y ventana horaria ──
    let tipo;
    let sinIngresoPrevio = false;
    if (!tieneIngreso) {
      // Ventana de INGRESO
      if (ahoraMin < apertura) {
        showOverlay('noqr', nombre, grado, 'Fuera de horario', `El ingreso abre a las ${horario.horaApertura}`);
        return;
      }
      if (ahoraMin > corte) {
        // Opción B: si ya es hora de salida, registrar salida sin ingreso previo
        if (ahoraMin >= salida) {
          tipo = 'SALIDA';
          sinIngresoPrevio = true;
        } else {
          showOverlay('noqr', nombre, grado, 'Ventana de ingreso cerrada', `Solo se acepta ingreso hasta las ${horario.horaCorte}`);
          return;
        }
      } else {
        tipo = 'INGRESO';
      }
    } else {
      // Ya ingresó → ventana de SALIDA
      if (ahoraMin < salida) {
        showOverlay('yaing', nombre, grado, 'Ya registró su ingreso', `La salida es desde las ${horario.horaSalida}`);
        return;
      }
      tipo = 'SALIDA';
    }

    // ── Estado ──
    const tardanza = tipo === 'INGRESO' && ahoraMin > limite;
    const estado   = sinIngresoPrevio ? 'Sin ingreso previo' : (tipo === 'SALIDA' ? 'Salida normal' : (tardanza ? 'Tardanza' : 'A tiempo'));

    const reg = {
      alumnoId: alumno.id,
      nombre, grado: alumno.grado, seccion: alumno.seccion, turno: alumno.turno,
      tipo, estado,
      hora: now.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit', second:'2-digit'}),
      fecha: today,
    };

    // Mostrar spinner mientras guarda
    showOverlay('loading', nombre, grado, 'Registrando ' + tipo.toLowerCase() + '...', '');
    await DB.saveRegistro(reg);
    // Actualizar Set local inmediatamente — sin esperar re-carga
    actualizarHoyRegs(alumno.id, tipo, tardanza);
    await updateStatsForce();
    pendingStudent = alumno;

    // Mostrar resultado según caso
    if(tipo === 'INGRESO' && tardanza) {
      showOverlay('tardanza', nombre, grado, '⚠ Tardanza registrada', reg.hora);
    } else if(tipo === 'INGRESO') {
      showOverlay('ok', nombre, grado, '✔ Ingreso registrado', reg.hora);
    } else if(sinIngresoPrevio) {
      showOverlay('sinIngreso', nombre, grado, '⚠ Salida sin ingreso previo', reg.hora);
    } else {
      showOverlay('salida', nombre, grado, '🚪 Salida registrada', reg.hora);
    }

    // Enviar WhatsApp al apoderado
    if(alumno.telefono) {
      const enc = _waEncabezado();
      const pie = _waPie();
      let msg = '';
      if(tipo === 'INGRESO' && estado === 'A tiempo') {
        msg = `✅ *INGRESO REGISTRADO*\n${enc}\n\n👤 *Alumno:* ${nombre}\n🏫 *Grado:* ${alumno.grado} ${alumno.seccion} — ${alumno.turno}\n🕐 *Hora:* ${reg.hora}\n📅 *Fecha:* ${reg.fecha}\n\n✔️ Su hijo/a ingresó *puntualmente* al colegio.${pie}`;
      } else if(tipo === 'INGRESO' && estado === 'Tardanza') {
        msg = `⚠️ *TARDANZA REGISTRADA*\n${enc}\n\n👤 *Alumno:* ${nombre}\n🏫 *Grado:* ${alumno.grado} ${alumno.seccion} — ${alumno.turno}\n🕐 *Hora:* ${reg.hora}\n📅 *Fecha:* ${reg.fecha}\n\n⏰ Su hijo/a ingresó *con tardanza* al colegio.${pie}`;
      } else if(tipo === 'SALIDA' && sinIngresoPrevio) {
        msg = `⚠️ *SALIDA SIN INGRESO PREVIO*\n${enc}\n\n👤 *Alumno:* ${nombre}\n🏫 *Grado:* ${alumno.grado} ${alumno.seccion} — ${alumno.turno}\n🕐 *Hora de salida:* ${reg.hora}\n📅 *Fecha:* ${reg.fecha}\n\n⚠️ Su hijo/a registró salida pero *no tiene ingreso registrado* hoy. Por favor comuníquese con el colegio.${pie}`;
      } else if(tipo === 'SALIDA') {
        msg = `🚪 *SALIDA REGISTRADA*\n${enc}\n\n👤 *Alumno:* ${nombre}\n🏫 *Grado:* ${alumno.grado} ${alumno.seccion} — ${alumno.turno}\n🕐 *Hora:* ${reg.hora}\n📅 *Fecha:* ${reg.fecha}\n\n🏠 Su hijo/a ha salido del colegio.${pie}`;
      }
      if(msg) {
        sendWhatsApp(alumno.telefono, msg);
        if(alumno.telefono2) sendWhatsApp(alumno.telefono2, msg);
      }
    }

  } catch(e) {
    const errMsg = e?.message || String(e) || 'Error desconocido';
    console.error('[registrar]', errMsg, e);
    showOverlay('nored', nombre, grado, 'Error al registrar', errMsg.length < 60 ? errMsg : 'Ver consola (F12)');
    toast('❌ Error: ' + errMsg, 'error');
  }
}

// Mantener confirmRegister por compatibilidad (ya no se usa en flujo normal)
async function confirmRegister(tipo) {
  if(!pendingStudent){ return; }
  const alumno = pendingStudent;
  await autoRegistrar(alumno);
}

// ============================================================
// ALUMNOS
// ============================================================
let editingId = null;

async function openModalAlumno(id) {
  editingId = id || null;
  document.getElementById('modal-title-text').textContent = id ? 'Editar Alumno' : 'Nuevo Alumno';
  if(id) {
    const alumnos = await DB.getAlumnos();
    const a = alumnos.find(x => x.id === id);
    document.getElementById('f-id').value = a.id;
    document.getElementById('f-id').readOnly = false;
    document.getElementById('f-id').style.opacity = '1';
    document.getElementById('f-id').title = '';
    document.getElementById('f-nombres').value = a.nombres;
    document.getElementById('f-apellidos').value = a.apellidos;
    const cfgTemp = await getConfig();
    const fTurno = document.getElementById('f-turno');
    fTurno.innerHTML = '<option value="">Seleccionar</option>';
    (cfgTemp.niveles||[]).forEach(n => {
      fTurno.innerHTML += `<option value="${n.nombre}">${n.nombre}</option>`;
    });
    fTurno.value = a.turno;
    // Luego cargar grados y secciones
    await cargarGradosPorNivel(a.turno);
    document.getElementById('f-grado').value = a.grado;
    await cargarSeccionesPorGrado();
    document.getElementById('f-seccion').value = a.seccion;
    document.getElementById('f-telefono').value = a.telefono||'';
    document.getElementById('f-apoderado-nombres').value = a.apoderadoNombres||'';
    document.getElementById('f-apoderado-apellidos').value = a.apoderadoApellidos||'';
    document.getElementById('f-telefono2').value = a.telefono2||'';
    document.getElementById('f-apoderado2-nombres').value = a.apoderado2Nombres||'';
    document.getElementById('f-apoderado2-apellidos').value = a.apoderado2Apellidos||'';
    const fotoData = a.foto||'';
    document.getElementById('f-foto-data').value = fotoData;
    document.getElementById('f-foto-url').value = fotoData.startsWith('http') ? fotoData : '';
    const fotoImg = document.getElementById('foto-preview-img');
    const fotoPh  = document.getElementById('foto-preview-placeholder');
    if(fotoData){ fotoImg.src=fotoData; fotoImg.style.display='block'; fotoPh.style.display='none'; }
    else        { fotoImg.style.display='none'; fotoPh.style.display='block'; }
  } else {
    document.getElementById('f-id').readOnly = false;
    document.getElementById('f-id').style.opacity = '1';
    document.getElementById('f-id').title = '';
    ['f-id','f-nombres','f-apellidos','f-telefono','f-apoderado-nombres','f-apoderado-apellidos','f-telefono2','f-apoderado2-nombres','f-apoderado2-apellidos','f-foto-url','f-foto-data'].forEach(x => document.getElementById(x).value='');
    document.getElementById('foto-preview-img').style.display='none';
    document.getElementById('foto-preview-placeholder').style.display='block';
    const fGrado = document.getElementById('f-grado');
    const fSecc  = document.getElementById('f-seccion');
    fGrado.value = '';
    fGrado.innerHTML = '<option value="">Seleccionar</option>';
    _disableSelect('f-grado');
    fSecc.value = '';
    fSecc.innerHTML = '<option value="">Seleccionar</option>';
    _disableSelect('f-seccion');
    
    const cfgTemp = await getConfig();
    const fTurno = document.getElementById('f-turno');
    fTurno.innerHTML = '<option value="">Seleccionar</option>';
    (cfgTemp.niveles||[]).forEach(n => {
      fTurno.innerHTML += `<option value="${n.nombre}">${n.nombre}</option>`;
    });
    fTurno.value = '';
  }
  const mAlumno = document.getElementById('modal-alumno');
  mAlumno.style.display = ''; // reset por si closeModal dejó display:none
  mAlumno.classList.add('open');
}

async function saveAlumno() {
  const id = document.getElementById('f-id').value.trim();
  const nombres = document.getElementById('f-nombres').value.trim();
  const apellidos = document.getElementById('f-apellidos').value.trim();
  const grado = document.getElementById('f-grado').value;
  if(!id||!nombres||!apellidos||!grado){ toast('Completa los campos obligatorios','warning'); return; }
  if(!/^\d{8}$/.test(id)){ toast('El DNI debe tener exactamente 8 dígitos','warning'); return; }

  try {
    const alumnos = await DB.getAlumnos();
    if(alumnos.find(a => a.id === id && a.id !== editingId)){ toast('Ese DNI ya está registrado','error'); return; }

    const alumno = {
      id, nombres, apellidos, grado,
      seccion: document.getElementById('f-seccion').value,
      turno: document.getElementById('f-turno').value,
      limite: await getLimiteByNivel(document.getElementById('f-turno').value),
      telefono: document.getElementById('f-telefono').value.trim(),
      apoderadoNombres: document.getElementById('f-apoderado-nombres').value.trim(),
      apoderadoApellidos: document.getElementById('f-apoderado-apellidos').value.trim(),
      telefono2: document.getElementById('f-telefono2').value.trim(),
      apoderado2Nombres: document.getElementById('f-apoderado2-nombres').value.trim(),
      apoderado2Apellidos: document.getElementById('f-apoderado2-apellidos').value.trim(),
      foto: document.getElementById('f-foto-data').value.trim(),
    };

    if(editingId && editingId !== id) {
      // Editar alumno con cambio de DNI
      await DB.updateAlumnoId(editingId, alumno);
      const snap = await db.collection('registros').where('alumnoId','==',editingId).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, {alumnoId: id}));
      await batch.commit();
      toast('Alumno actualizado','success');
    } else if(editingId && editingId === id) {
      // Editar alumno con mismo DNI — solo actualizar datos, NO tocar cuenta apoderado
      await DB.saveAlumno(alumno);
      toast('Alumno actualizado','success');
    } else {
      // Nuevo alumno — crear datos y cuenta apoderado
      await DB.saveAlumno(alumno);
      await crearCuentaApoderadoSilencioso(alumno);
      toast('Alumno registrado','success');
    }
    DB.bumpAlumnosVersion(); // Notificar a otros dispositivos
    _invalidarCacheAlumnos();
    closeModal('modal-alumno');
    renderAlumnos();
    updateStats();
  } catch(e) { toast('Error al guardar','error'); console.error(e); }
}

async function verificarCuentasHuerfanas() {
  const el = document.getElementById('huerfanas-result');
  el.innerHTML = '<span style="color:var(--muted);">Verificando...</span>';
  try {
    // Obtener todos los alumnos actuales
    const alumnos = await DB.getAlumnos();
    const dnisActivos = new Set(alumnos.map(a => a.id));
    // Obtener todos los documentos de apoderados en Firestore
    const apoSnap = await db.collection('apoderados').get();
    const huerfanos = apoSnap.docs.filter(d => !dnisActivos.has(d.id));
    if(huerfanos.length === 0) {
      el.innerHTML = '<span style="color:var(--success);">✅ No hay cuentas huérfanas en Firestore.</span>';
    } else {
      el.innerHTML = '<div style="color:#f59e0b;margin-bottom:8px;">⚠️ Se encontraron <strong>' + huerfanos.length + '</strong> documentos de apoderados huérfanos en Firestore:</div>' +
        huerfanos.map(d => '<div style="font-family:monospace;font-size:0.78rem;color:var(--muted);padding:2px 0;">• DNI: ' + d.id + ' → <code>' + d.id + APO_DOMAIN + '</code></div>').join('') +
        '<button class="btn" style="margin-top:10px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);font-size:0.8rem;" onclick="limpiarApoderadosHuerfanos()">🗑 Limpiar documentos huérfanos de Firestore</button>';
    }
  } catch(e) {
    el.innerHTML = '<span style="color:var(--danger);">Error: ' + e.message + '</span>';
  }
}

async function limpiarApoderadosHuerfanos() {
  if(!confirm('¿Eliminar los documentos de apoderados huérfanos de Firestore? Los emails en Firebase Auth deberás borrarlos manualmente.')) return;
  try {
    const alumnos = await DB.getAlumnos();
    const dnisActivos = new Set(alumnos.map(a => a.id));
    const apoSnap = await db.collection('apoderados').get();
    const huerfanos = apoSnap.docs.filter(d => !dnisActivos.has(d.id));
    const batch = db.batch();
    huerfanos.forEach(d => batch.delete(d.ref));
    await batch.commit();
    toast('✅ ' + huerfanos.length + ' documentos huérfanos eliminados', 'success');
    verificarCuentasHuerfanas();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteAlumno(id) {
  if(!confirm('¿Eliminar este alumno y todos sus registros de asistencia?')) return;
  try {
    toast('Eliminando...','info');
    // Eliminar registros de asistencia del alumno
    const regsSnap = await db.collection('registros').where('alumnoId','==',id).get();
    if(!regsSnap.empty) {
      // Firestore permite máx 500 por batch
      const batches = [];
      let batch = db.batch();
      let count = 0;
      regsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
        if(count === 499) {
          batches.push(batch.commit());
          batch = db.batch();
          count = 0;
        }
      });
      if(count > 0) batches.push(batch.commit());
      await Promise.all(batches);
    }
    // Eliminar incidentes del alumno
    const incSnap = await db.collection('incidentes').where('alumnoId','==',id).get();
    if(!incSnap.empty) {
      const batchInc = db.batch();
      incSnap.docs.forEach(doc => batchInc.delete(doc.ref));
      await batchInc.commit();
    }
    // Eliminar cuenta de apoderado si existe
    await db.collection('apoderados').doc(id).delete().catch(()=>{});
    // Eliminar alumno
    await DB.deleteAlumno(id);
    DB.bumpAlumnosVersion(); // Notificar a otros dispositivos
    _invalidarCacheAlumnos();
    toast('Alumno y sus registros eliminados','info');
    renderAlumnos();
    updateStats();
  } catch(e) { 
    console.error('Error al eliminar alumno:', e);
    toast('Error al eliminar: ' + e.message,'error'); 
  }
}


async function limpiarFiltrosAlumnos() {
  await poblarFiltroNivel('fa-nivel');
  document.getElementById('fa-nivel').value   = '';
  document.getElementById('fa-grado').value   = '';
  document.getElementById('fa-seccion').value = '';
  document.getElementById('search-alumnos').value = '';
  await poblarFiltroGrado('fa-grado', null);
  await poblarFiltroSeccion('fa-seccion', null);
  _disableSelect('fa-grado');
  _disableSelect('fa-seccion');
  await _autoSelectTutoria('fa-nivel', 'fa-grado', 'fa-seccion');
  const n = document.getElementById('fa-nivel').value;
  const g = document.getElementById('fa-grado').value;
  const s = document.getElementById('fa-seccion').value;
  if(n || g || s) renderAlumnos();
  else mostrarEstadoInicial();
}

async function mostrarEstadoInicial() {
  document.getElementById('alumnos-tbody').innerHTML = '';
  document.getElementById('alumnos-empty').style.display = 'block';
  document.getElementById('alumnos-empty').querySelector('p').textContent =
    'Usa los filtros de arriba para buscar alumnos';
  try {
    const alumnos = await DB.getAlumnos();
    document.getElementById('alumnos-count').textContent =
      alumnos.length + ' alumno' + (alumnos.length!==1?'s':'') + ' registrado' + (alumnos.length!==1?'s':'') + ' en total';
  } catch(e) { document.getElementById('alumnos-count').textContent = ''; }
}

async function renderAlumnos() {
  const grado   = document.getElementById('fa-grado').value;
  const seccion = document.getElementById('fa-seccion').value;
  const nivel   = document.getElementById('fa-nivel').value;
  const q       = (document.getElementById('search-alumnos').value||'').toLowerCase();

  // "" = sin tocar (no muestra nada), "TODOS" = sin filtro en ese campo, valor específico = filtra
  const filtroActivo = grado || seccion || nivel || q;
  if(!filtroActivo) { mostrarEstadoInicial(); return; }

  const tbody = document.getElementById('alumnos-tbody');
  const empty = document.getElementById('alumnos-empty');
  const count = document.getElementById('alumnos-count');

  try {
    // getAlumnosFiltrados: profesores restringidos cargan solo sus aulas (28 lecturas vs 1,300)
    let alumnos = await getAlumnosFiltrados();
    const totalDB = alumnos.length;
    if(grado   && grado   !== 'TODOS') alumnos = alumnos.filter(a => a.grado === grado);
    if(seccion && seccion !== 'TODOS') alumnos = alumnos.filter(a => a.seccion === seccion);
    if(nivel   && nivel   !== 'TODOS') alumnos = alumnos.filter(a => a.turno === nivel);
    if(q) {
      const qClean = q.trim();
      alumnos = alumnos.filter(a =>
        a.nombres.toLowerCase().includes(qClean) ||
        a.apellidos.toLowerCase().includes(qClean) ||
        a.id.trim().toLowerCase().includes(qClean)
      );
    }

    count.textContent = 'Mostrando ' + alumnos.length + ' de ' + totalDB + ' alumno' + (totalDB!==1?'s':'');

    if(!alumnos.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('p').textContent = 'No se encontraron alumnos con ese filtro';
      return;
    }
    empty.style.display = 'none';

    const ordenNivel = { 'Inicial':1,'Primaria':2,'Secundaria':3 };
    const ordenGrado = { '3 años':1,'4 años':2,'5 años':3,'1er':4,'2do':5,'3er':6,'4to':7,'5to':8,'6to':9,'7mo':10,'8vo':11,'9no':12,'10mo':13,'11mo':14 };
    alumnos = [...alumnos].sort((a,b) => {
      const nA = ordenNivel[a.turno]||99, nB = ordenNivel[b.turno]||99;
      const gA = ordenGrado[a.grado]||99, gB = ordenGrado[b.grado]||99;
      if(nA !== nB) return nA - nB;
      if(gA !== gB) return gA - gB;
      const sComp = (a.seccion||'').localeCompare(b.seccion||'');
      if(sComp !== 0) return sComp;
      const apComp = (a.apellidos||'').localeCompare(b.apellidos||'');
      if(apComp !== 0) return apComp;
      return (a.nombres||'').localeCompare(b.nombres||'');
    });

    // Paginación: mostrar de a 50
    const PAGE_SIZE = 50;
    window._alumnosPaginados = alumnos;
    window._alumnosPagina = 1;
    _renderAlumnosPagina();

  } catch(e) { console.error('renderAlumnos:', e); toast('Error al cargar alumnos','error'); }
}

function _filaAlumno(a) {
  return `<tr>
    <td class="td-id">${a.id}</td>
    <td class="td-name">${a.nombres} ${a.apellidos}</td>
    <td>${a.grado}</td>
    <td>${a.seccion}</td>
    <td>${a.turno}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-accion-alumno" style="padding:5px 10px;font-size:0.78rem;" onclick="showQR('${a.id}')">QR</button>
      <button class="btn btn-ghost btn-accion-alumno" style="padding:5px 10px;font-size:0.78rem;" onclick="openModalAlumno('${a.id}')">✏</button>
      ${currentRol !== 'profesor' ? `<button class="btn btn-ghost btn-accion-alumno" style="padding:5px 10px;font-size:0.78rem;color:#f59e0b;border-color:#f59e0b44;" title="Resetear contraseña apoderado" onclick="resetPassApoderado('${a.id}')">🔑</button>` : ''}
      ${currentRol !== 'profesor' ? `<button class="btn btn-danger btn-accion-alumno" style="padding:5px 10px;font-size:0.78rem;" onclick="deleteAlumno('${a.id}')">✕</button>` : ''}
    </td>
    <td class="td-chk-alumno" style="display:none;text-align:center;"><input type="checkbox" class="chk-alumno" value="${a.id}" onchange="updateSeleccionados()"></td>
  </tr>`;
}

function _renderAlumnosPagina() {
  const todos   = window._alumnosPaginados || [];
  const pagina  = window._alumnosPagina || 1;
  const PAGE_SIZE = 50;
  const hasta   = pagina * PAGE_SIZE;
  const tbody   = document.getElementById('alumnos-tbody');
  const visible = todos.slice(0, hasta);

  tbody.innerHTML = visible.map(_filaAlumno).join('');

  // Botón "Ver más" si quedan alumnos
  const quedan = todos.length - hasta;
  const existente = document.getElementById('btn-ver-mas-alumnos');
  if(existente) existente.remove();
  if(quedan > 0) {
    const wrap = tbody.closest('table')?.parentElement;
    if(wrap) {
      const btn = document.createElement('div');
      btn.id = 'btn-ver-mas-alumnos';
      btn.style.cssText = 'text-align:center;padding:12px 0;';
      btn.innerHTML = `<button class="btn btn-ghost" onclick="window._alumnosPagina++;_renderAlumnosPagina()">
        Ver ${Math.min(quedan, PAGE_SIZE)} más de ${quedan} restantes
      </button>`;
      wrap.appendChild(btn);
    }
  }
}

// ============================================================
// QR GENERATION (via API)
// ============================================================
async function showQR(id) {
  const alumnos = await DB.getAlumnos();
  const a = alumnos.find(x => x.id === id);
  if(!a) return;

  const cfg = await getConfig();
  const nombreColegio = COLEGIO_NOMBRE;
  const anio = COLEGIO_ANIO || cfg?.anio || new Date().getFullYear();

  // Logo y marca de agua
  document.getElementById('carnet-logo').src = getLogo();
  // Separar prefijo del nombre propio
  const schoolEl  = document.getElementById('carnet-school');
  const prefijoEl = document.getElementById('carnet-prefijo');
  const mC = nombreColegio.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
  if(mC) {
    if(prefijoEl) prefijoEl.textContent = mC[1].toUpperCase();
    schoolEl.textContent = mC[2];
    schoolEl.style.fontSize = mC[2].length > 25 ? '7.5px' : mC[2].length > 16 ? '9px' : '10px';
  } else {
    if(prefijoEl) prefijoEl.textContent = '';
    schoolEl.textContent = nombreColegio;
    schoolEl.style.fontSize = nombreColegio.length > 30 ? '7.5px' : nombreColegio.length > 22 ? '9px' : '10px';
  }

  // Marca de agua en body
  const body = document.querySelector('#carnet-print .carnet-body-wm');
  if(body) body.style.setProperty('--wm', `url('${getLogo()}')`);
  // Aplicar via style directo al div con position absolute
  const wmDiv = document.querySelector('#carnet-print [style*="--wm"]');
  if(wmDiv) wmDiv.style.backgroundImage = `url('${getLogo()}');
`
  // Foto o iniciales
  const fotoEl = document.getElementById('carnet-foto');
  const initEl = document.getElementById('carnet-initials');
  if(a.foto) {
    fotoEl.src = a.foto;
    fotoEl.style.display = 'block';
    initEl.style.display = 'none';
  } else {
    fotoEl.style.display = 'none';
    initEl.style.display = 'inline';
    initEl.textContent = (a.nombres[0]||'?') + (a.apellidos[0]||'?');
  }

  // Nombre en dos líneas — auto-ajuste font-size para nombres largos
  const fullName = a.nombres + ' ' + a.apellidos;
  const words = fullName.split(' ');
  const mid = Math.ceil(words.length/2);
  const l1 = words.slice(0,mid).join(' ');
  const l2 = words.slice(mid).join(' ');
  const nameEl = document.getElementById('carnet-name');
  nameEl.innerHTML = l2 ? `${l1}<br>${l2}` : l1;
  nameEl.style.fontSize = fullName.length > 36 ? '9px' : fullName.length > 28 ? '10.5px' : '12px';

  document.getElementById('carnet-grade').textContent = `${a.grado}  ·  Sección ${a.seccion}  ·  ${a.turno}`;
  document.getElementById('carnet-dni').textContent = a.id;
  document.getElementById('carnet-vigencia').textContent = `VIGENCIA 31 DE DICIEMBRE DEL ${anio}`;

  // QR
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(a.id)}&bgcolor=ffffff&color=000000&margin=6&ecc=H`;
  document.getElementById('carnet-qr').src = qrUrl;

  const mQr = document.getElementById('modal-qr');
  mQr.style.display = '';
  mQr.classList.add('open');
}

function printCarnet() {
  // Open carnet in print-friendly new window
  const carnet = document.getElementById('carnet-print').outerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap" rel="stylesheet">
    
  </head><body>${carnet}<script>window.onload=()=>window.print();<\/script>
  <!-- ===== MODAL PRIVILEGIOS PROFESOR ===== -->
  <div class="modal-bg" id="modal-privilegios">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:520px;">
      <div class="modal-header">
        <div class="modal-title">📚 Grados y Secciones asignados</div>
        <button class="modal-close" onclick="closeModal('modal-privilegios')">✕</button>
      </div>
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:14px;">
        Marca los grados que dicta y las secciones correspondientes a cada uno. Solo verá los alumnos de los grados y secciones que marques.
      </div>
      <div id="u-niveles-checks" style="max-height:60vh;overflow-y:auto;"></div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-primary" onclick="savePrivilegios()" style="flex:1;justify-content:center;">💾 Guardar privilegios</button>
        <button class="btn btn-ghost" onclick="closeModal('modal-privilegios')" style="flex:1;justify-content:center;">Cancelar</button>
      </div>
    </div>
  </div>

</body></html>`);
  win.document.close();
}

function downloadCarnet() {
  // Use html2canvas if available, otherwise just print
  printCarnet();
}

// Foto preview functions
function previewFotoUrl(url) {
  const img = document.getElementById('foto-preview-img');
  const ph  = document.getElementById('foto-preview-placeholder');
  if(url) {
    img.src = url;
    img.style.display = 'block';
    ph.style.display  = 'none';
    document.getElementById('f-foto-data').value = url;
  } else {
    img.style.display = 'none';
    ph.style.display  = 'block';
    document.getElementById('f-foto-data').value = '';
  }
}

function previewFotoFile(input) {
  if(!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = e.target.result;
    const img = document.getElementById('foto-preview-img');
    const ph  = document.getElementById('foto-preview-placeholder');
    img.src = data;
    img.style.display = 'block';
    ph.style.display  = 'none';
    document.getElementById('f-foto-data').value = data;
    document.getElementById('f-foto-url').value = '';
  };
  reader.readAsDataURL(input.files[0]);
}

// ============================================================
// REGISTRO
// ============================================================
function setTodayFilter() {
  const hoyStr = hoy();
  document.getElementById('filter-desde').value = hoyStr;
  document.getElementById('filter-hasta').value = hoyStr;
}

async function limpiarFiltrosRegistro() {
  await poblarFiltroNivel('filter-nivel');
  document.getElementById('filter-desde').value   = '';
  document.getElementById('filter-hasta').value   = '';
  document.getElementById('filter-nivel').value   = '';
  document.getElementById('filter-grado').value   = '';
  document.getElementById('filter-seccion').value = '';
  document.getElementById('filter-tipo').value    = '';
  document.getElementById('filter-search').value  = '';
  // Repoblar y deshabilitar grado y sección (requieren nivel primero)
  await poblarFiltroGrado('filter-grado', null);
  await poblarFiltroSeccion('filter-seccion', null);
  _disableSelect('filter-grado');
  _disableSelect('filter-seccion');
  await _autoSelectTutoria('filter-nivel', 'filter-grado', 'filter-seccion');
  const n = document.getElementById('filter-nivel').value;
  const g = document.getElementById('filter-grado').value;
  const s = document.getElementById('filter-seccion').value;
  if(n || g || s) {
    renderRegistros();
  } else {
    document.getElementById('registro-tbody').innerHTML = '';
    document.getElementById('registro-empty').style.display = 'block';
    document.getElementById('registro-empty').querySelector('p').textContent = 'Selecciona una fecha u otro filtro para ver los registros';
    document.getElementById('registro-count').textContent = '';
  }
}

function validarRangoFecha() {
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value;
  // Si desde > hasta, corregir automáticamente
  if(desde && hasta && desde > hasta) {
    document.getElementById('filter-hasta').value = desde;
  }
  // Saltar fines de semana en el campo desde
  if(desde) {
    const d = new Date(desde + 'T00:00:00');
    if(d.getDay() === 6) { // sábado → lunes
      d.setDate(d.getDate() + 2);
      document.getElementById('filter-desde').value = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    } else if(d.getDay() === 0) { // domingo → lunes
      d.setDate(d.getDate() + 1);
      document.getElementById('filter-desde').value = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    }
  }
  if(hasta) {
    const h = new Date(hasta + 'T00:00:00');
    if(h.getDay() === 6) { // sábado → viernes
      h.setDate(h.getDate() - 1);
      document.getElementById('filter-hasta').value = h.getFullYear()+'-'+String(h.getMonth()+1).padStart(2,'0')+'-'+String(h.getDate()).padStart(2,'0');
    } else if(h.getDay() === 0) { // domingo → viernes
      h.setDate(h.getDate() - 2);
      document.getElementById('filter-hasta').value = h.getFullYear()+'-'+String(h.getMonth()+1).padStart(2,'0')+'-'+String(h.getDate()).padStart(2,'0');
    }
  }
}

// ── FILTROS DE REGISTRO — lógica en cascada ──
// Nivel → Grado → Sección → Resultado
// Buscador es modo alternativo — mutuamente excluyente con nivel/grado/sección

function _enableSelect(id) {
  const el = document.getElementById(id);
  el.disabled = false; el.style.opacity = '1'; el.style.cursor = 'pointer';
}
function _disableSelect(id) {
  const el = document.getElementById(id);
  el.disabled = true; el.style.opacity = '0.45'; el.style.cursor = 'not-allowed';
}

// Al cambiar NIVEL → repoblar grado, deshabilitar sección, limpiar buscador
async function onNivelChangeRegistro() {
  document.getElementById('filter-search').value  = '';
  document.getElementById('filter-grado').value   = '';
  document.getElementById('filter-seccion').value = '';
  _disableSelect('filter-seccion');
  const nivel = document.getElementById('filter-nivel').value;
  if(nivel && nivel !== 'TODOS') {
    await poblarFiltroGrado('filter-grado', nivel);
    _enableSelect('filter-grado');
  } else if(nivel === 'TODOS') {
    await poblarFiltroGrado('filter-grado', null);
    _enableSelect('filter-grado');
  } else {
    // Sin nivel → deshabilitar grado también
    _disableSelect('filter-grado');
  }
  await poblarFiltroSeccion('filter-seccion', null);
  renderRegistro();
}

// Al cambiar GRADO → auto-detectar nivel, repoblar sección, limpiar buscador
async function onGradoChangeRegistro() {
  document.getElementById('filter-search').value = '';
  const grado = document.getElementById('filter-grado').value;
  // Guardar sección previa para restaurarla si sigue siendo válida
  const seccionPrevia = document.getElementById('filter-seccion').value;

  if(grado && grado !== 'TODOS') {
    // Auto-detectar nivel del grado
    const cfg = await getConfig();
    for(const [niv, lista] of Object.entries(cfg.grados || {})) {
      if(lista.includes(grado)) {
        document.getElementById('filter-nivel').value = niv;
        break;
      }
    }
    await poblarFiltroSeccion('filter-seccion', grado);
  } else {
    // Grado vacío o TODOS → repoblar sección sin filtro de grado
    const nivel = document.getElementById('filter-nivel').value;
    const alumnos = await DB.getAlumnos();
    const secs = [...new Set(alumnos
      .filter(a => !nivel || nivel === 'TODOS' || a.turno === nivel)
      .map(a => a.seccion)
    )].sort();
    const el = document.getElementById('filter-seccion');
    el.innerHTML = '<option value="" disabled selected>-- Sección --</option><option value="TODOS">Todas</option>';
    secs.forEach(s => { el.innerHTML += `<option value="${s}">${s}</option>`; });
  }

  // Restaurar sección previa si sigue siendo una opción válida
  if(seccionPrevia) {
    const elSec = document.getElementById('filter-seccion');
    const opcionExiste = [...elSec.options].some(o => o.value === seccionPrevia);
    elSec.value = opcionExiste ? seccionPrevia : '';
  }

  // Habilitar/deshabilitar sección según si hay grado
  if(grado && grado !== 'TODOS') {
    _enableSelect('filter-seccion');
  } else {
    document.getElementById('filter-seccion').value = '';
    _disableSelect('filter-seccion');
  }

  renderRegistro();
}

// Al cambiar SECCIÓN → limpiar buscador, respetar grado activo
function onSeccionChangeRegistro() {
  document.getElementById('filter-search').value = '';
  renderRegistro();
}

// Al escribir en BUSCADOR → limpiar nivel/grado/sección y repoblar a estado inicial
async function onSearchRegistro() {
  const q = document.getElementById('filter-search').value;
  if(q.trim()) {
    document.getElementById('filter-nivel').value   = '';
    document.getElementById('filter-grado').value   = '';
    document.getElementById('filter-seccion').value = '';
    await poblarFiltroGrado('filter-grado', null);
    await poblarFiltroSeccion('filter-seccion', null);
    _disableSelect('filter-grado');
    _disableSelect('filter-seccion');
  } else {
    // Campo vacío → rehabilitar grado
    _enableSelect('filter-grado');
  }
  renderRegistro();
}

async function renderRegistro() {
  const desde   = document.getElementById('filter-desde').value;
  const hasta   = document.getElementById('filter-hasta').value;
  // Si no hay filtro de fecha manual, usar el mes seleccionado
  const mesSel  = document.getElementById('reg-mes-select')?.value || mesActual();
  const grado   = document.getElementById('filter-grado').value;
  const seccion = document.getElementById('filter-seccion').value;
  const nivel   = document.getElementById('filter-nivel').value;
  const tipo    = document.getElementById('filter-tipo').value;
  const q       = (document.getElementById('filter-search').value||'').toLowerCase();

  const filtroActivo = desde || hasta || grado || seccion || nivel || tipo || q;
  const tbody = document.getElementById('registro-tbody');
  const empty = document.getElementById('registro-empty');
  const count = document.getElementById('registro-count');

  if(!filtroActivo) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'Selecciona una fecha u otro filtro para ver los registros';
    const cachedMes = DB._registrosCache['mes:' + mesSel];
    if(cachedMes) count.textContent = cachedMes.length + ' registro' + (cachedMes.length!==1?'s':'') + ' en el período';
    else DB.getResumenMes(mesSel).then(resumen => { const total = resumen.reduce((s,r) => s + (r.puntual||0) + (r.tardanza||0), 0); count.textContent = total + ' asistencias en el período'; }).catch(()=>{});
    return;
  }

  // Sección sin grado no tiene sentido — puede pertenecer a múltiples grados
  if(seccion && seccion !== 'TODOS' && (!grado || grado === 'TODOS') && !q) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'Selecciona un grado antes de filtrar por sección';
    count.textContent = '';
    return;
  }

  try {
    // 1. Obtener registros del mes seleccionado (no todo el año)
    let regs = desde || hasta
      ? await DB.getRegistros({ mes: mesSel })
      : await DB.getRegistros({ mes: mesSel });

    // Filtrar por rango de fechas y excluir siempre sábado y domingo
    regs = regs.filter(r => {
      if(!r.fecha) return false;
      const d = new Date(r.fecha + 'T12:00:00');
      const dia = d.getDay();
      if(dia === 0 || dia === 6) return false;
      if(desde && r.fecha < desde) return false;
      if(hasta && r.fecha > hasta) return false;
      return true;
    });
    if(nivel   && nivel   !== 'TODOS') regs = regs.filter(r => r.turno === nivel);
    if(grado   && grado   !== 'TODOS') regs = regs.filter(r => r.grado === grado);
    if(seccion && seccion !== 'TODOS') regs = regs.filter(r => r.seccion === seccion);
    if(q) regs = regs.filter(r => r.nombre.toLowerCase().includes(q.trim()) || r.alumnoId.trim().toLowerCase().includes(q.trim()));

    // 2. Agrupar por alumnoId + fecha → una fila por alumno por día
    // Mapa de alumnos para normalizar nombre — profesores restringidos usan scoped cache
    const alumnosMapa = {};
    (await getAlumnosFiltrados()).forEach(a => { alumnosMapa[a.id] = a; });
    const grupos = {};
    regs.forEach(r => {
      const key = r.alumnoId + '_' + r.fecha;
      const aDat = alumnosMapa[r.alumnoId];
      const nombreNorm = aDat ? ((aDat.apellidos||'')+' '+(aDat.nombres||'')).trim() : r.nombre;
      if(!grupos[key]) {
        grupos[key] = {
          alumnoId: r.alumnoId,
          nombre:   nombreNorm,
          grado:    r.grado,
          seccion:  r.seccion,
          turno:    r.turno || '-',
          fecha:    r.fecha,
          ingreso:  null,
          salida:   null,
          estadoIngreso: '-',
        };
      }
      if(r.tipo === 'INGRESO') {
        grupos[key].ingreso = r.hora;
        grupos[key].estadoIngreso = r.estado;
      }
      if(r.tipo === 'SALIDA') {
        grupos[key].salida = r.hora;
      }
    });

    // 3. Si hay filtro de alumno, agregar filas "Sin registro" para días hábiles sin datos
    let filas = Object.values(grupos);

    if(q) {
      // Rango: si hay desde/hasta usar ese, si no usar el mes seleccionado hasta hoy
      const rangoDesde = desde || mesSel + '-01';
      const rangoHasta = hasta || (() => {
        const [y,m] = mesSel.split('-').map(Number);
        const hoyStr = hoy();
        const finMes = mesSel + '-' + String(new Date(y,m,0).getDate()).padStart(2,'0');
        return finMes < hoyStr ? finMes : hoyStr;
      })();

      // Alumnos que coinciden con la búsqueda
      const todosAlumnos = await DB.getAlumnos();
      const alumnosFiltrados = todosAlumnos.filter(a =>
        (a.nombre||'').toLowerCase().includes(q.trim()) ||
        (a.id||'').toLowerCase().includes(q.trim())
      );

      const fechasHabiles = [];
      let cur = new Date(rangoDesde + 'T12:00:00');
      const fin = new Date(rangoHasta + 'T12:00:00');
      while(cur <= fin) {
        const dia = cur.getDay();
        if(dia !== 0 && dia !== 6) fechasHabiles.push(cur.toISOString().slice(0,10));
        cur.setDate(cur.getDate() + 1);
      }

      alumnosFiltrados.forEach(a => {
        fechasHabiles.forEach(fecha => {
          const key = a.id + '_' + fecha;
          if(!grupos[key]) {
            filas.push({ alumnoId: a.id, nombre: ((a.apellidos||'') + ' ' + (a.nombres||'')).trim() || a.nombre || '', grado: a.grado, seccion: a.seccion, turno: a.turno||'-', fecha, ingreso: null, salida: null, estadoIngreso: 'Sin registro' });
          }
        });
      });
    }

    // 3b. Si hay filtro de nivel/grado (sin búsqueda por texto), agregar "Sin registro"
    //     para alumnos del nivel/grado que no tienen registro en el período
    if(!q && (nivel || grado)) {
      const rangoDesde = desde || mesSel + '-01';
      const rangoHasta = hasta || (() => {
        const [y,m] = mesSel.split('-').map(Number);
        const hoyStr = hoy();
        const finMes = mesSel + '-' + String(new Date(y,m,0).getDate()).padStart(2,'0');
        return finMes < hoyStr ? finMes : hoyStr;
      })();

      const todosAlumnos = await getAlumnosFiltrados();
      const alumnosFilt = todosAlumnos.filter(a => {
        if(nivel && nivel !== 'TODOS' && (a.turno||'') !== nivel) return false;
        if(grado && grado !== 'TODOS' && (a.grado||'') !== grado) return false;
        if(seccion && seccion !== 'TODOS' && (a.seccion||'') !== seccion) return false;
        return true;
      });

      const fechasHabiles = [];
      let cur = new Date(rangoDesde + 'T12:00:00');
      const fin = new Date(rangoHasta + 'T12:00:00');
      while(cur <= fin) {
        const dia = cur.getDay();
        if(dia !== 0 && dia !== 6) fechasHabiles.push(cur.toISOString().slice(0,10));
        cur.setDate(cur.getDate() + 1);
      }

      alumnosFilt.forEach(a => {
        fechasHabiles.forEach(fecha => {
          const key = a.id + '_' + fecha;
          if(!grupos[key]) {
            filas.push({ alumnoId: a.id, nombre: ((a.apellidos||'') + ' ' + (a.nombres||'')).trim() || a.nombre || '', grado: a.grado, seccion: a.seccion, turno: a.turno||'-', fecha, ingreso: null, salida: null, estadoIngreso: 'Sin registro' });
          }
        });
      });
    }


    // Ordenar: nivel → grado numérico → sección → apellido
    // Para vista de grado específico: fecha desc → apellido → nombre
    const esTodos = (!grado || grado === 'TODOS');
    if(esTodos) {
      filas.sort(_cmpFilaReporte);
    } else {
      filas.sort((a, b) => {
        const fc = (b.fecha||'').localeCompare(a.fecha||'');
        if(fc !== 0) return fc;
        return (a.nombre||'').localeCompare(b.nombre||'');
      });
    }

    // Filtrar por tipo si está seleccionado
    if(tipo && tipo !== 'TODOS') {
      if(tipo === 'INGRESO') filas = filas.filter(f => f.ingreso);
      if(tipo === 'SALIDA')  filas = filas.filter(f => f.salida);
      if(tipo === 'AUSENTE') filas = filas.filter(f => f.estadoIngreso === 'Sin registro');
    }

    const rangoTexto = (desde && hasta && desde !== hasta) ? ` (${desde} al ${hasta})` : (desde ? ` (${desde})` : '');
    count.textContent = 'Mostrando ' + filas.length + ' registro' + (filas.length!==1?'s':'') + rangoTexto;

    if(!filas.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('p').textContent = 'No hay registros con ese filtro';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = filas.map(f => {
      const sinIngreso = !f.ingreso;
      const badgeColor = f.estadoIngreso === 'Sin registro' ? 'red' : (f.estadoIngreso === 'Tardanza' ? 'yellow' : (f.estadoIngreso === 'A tiempo' ? 'green' : 'blue'));
      const cls = f.estadoIngreso === 'Sin registro' ? 'row-salida' : (f.estadoIngreso === 'Tardanza' ? 'row-tarde' : 'row-ingreso');
      return `<tr class="${cls}">
        <td class="ts">${f.fecha}</td>
        <td class="td-id">${f.alumnoId}</td>
        <td class="td-name">${f.nombre}</td>
        <td>${f.grado} ${f.seccion}</td>
        <td>${f.turno}</td>
        <td class="ts">${f.ingreso || '<span style="color:var(--muted);">—</span>'}</td>
        <td><span class="badge ${badgeColor}">${f.estadoIngreso}</span></td>
        <td class="ts">${f.salida || '<span style="color:var(--muted);">—</span>'}</td>
      </tr>`;
    }).join('');
  } catch(e) { console.error('renderRegistro:', e); toast('Error al cargar registros','error'); }
}

async function clearToday() {
  if(!confirm('¿Borrar todos los registros de hoy?')) return;
  try {
    await DB.deleteRegistrosByFecha(hoy());
    renderRegistro();
    updateStats();
    toast('Registros de hoy eliminados','info');
  } catch(e) { toast('Error al eliminar','error'); }
}

// Helper: obtener registros agrupados (igual que la tabla) respetando filtros activos
async function getRegistrosFiltrados() {
  const desde   = document.getElementById('filter-desde').value;
  const hasta   = document.getElementById('filter-hasta').value;
  const grado   = document.getElementById('filter-grado').value;
  const seccion = document.getElementById('filter-seccion').value;
  const nivel   = document.getElementById('filter-nivel').value;
  const q       = (document.getElementById('filter-search').value||'').toLowerCase();

  // Construir filtro DB: si hay rango de fechas usarlo, si no, solo hoy como default
  // (evita cargar ~52k docs del mes entero cuando el usuario no ha especificado rango)
  let filtroDb;
  if(desde && hasta)   filtroDb = { desde, hasta };
  else if(desde)       filtroDb = { desde, hasta: hoy() };
  else                 filtroDb = { fecha: hoy() };
  let regs = await DB.getRegistros(filtroDb);

  // Aplicar filtros adicionales en cliente (nivel, grado, sección, búsqueda)
  if(desde || hasta) {
    regs = regs.filter(r => {
      if(!r.fecha) return false;
      if(desde && r.fecha < desde) return false;
      if(hasta && r.fecha > hasta) return false;
      return true;
    });
  }
  if(nivel   && nivel   !== 'TODOS') regs = regs.filter(r => r.turno === nivel);
  if(grado   && grado   !== 'TODOS') regs = regs.filter(r => r.grado === grado);
  if(seccion && seccion !== 'TODOS') regs = regs.filter(r => r.seccion === seccion);
  if(q) regs = regs.filter(r => (r.nombre||'').toLowerCase().includes(q) || (r.alumnoId||'').includes(q));

  // Agrupar por alumnoId + fecha → una fila por alumno por día (igual que la tabla)
  const alumnosMapa2 = {};
  (await DB.getAlumnos()).forEach(a => { alumnosMapa2[a.id] = a; });
  const grupos = {};
  regs.forEach(r => {
    const key = r.alumnoId + '_' + r.fecha;
    if(!grupos[key]) {
      const aDat2 = alumnosMapa2[r.alumnoId];
      const nombreNorm2 = aDat2 ? ((aDat2.apellidos||'')+' '+(aDat2.nombres||'')).trim() : r.nombre;
      grupos[key] = {
        fecha:    r.fecha,
        dni:      r.alumnoId,
        nombre:   nombreNorm2,
        turno:    r.turno || '-',
        nivel:    r.turno || '-',
        grado:    r.grado,
        seccion:  r.seccion,
        ingreso:  null,
        salida:   null,
        estado:   'Sin registro'
      };
    }
    if(r.tipo === 'INGRESO') {
      grupos[key].ingreso = r.hora;
      grupos[key].estado  = r.estado;
    }
    if(r.tipo === 'SALIDA') {
      grupos[key].salida = r.hora;
    }
  });

  let filasPDF = Object.values(grupos);

  // Excluir sábados y domingos
  filasPDF = filasPDF.filter(f => {
    if(!f.fecha) return true;
    const d = new Date(f.fecha + 'T12:00:00');
    return d.getDay() !== 0 && d.getDay() !== 6;
  });

  // Generar ausentes si hay filtro individual (alumno) o por nivel/grado/sección
  // No generar si no hay filtro — evita 14k+ filas
  const hayFiltroEspecifico = q || (nivel && nivel !== 'TODOS') || (grado && grado !== 'TODOS') || (seccion && seccion !== 'TODOS');

  if(hayFiltroEspecifico) {
    const mesSel = document.getElementById('reg-mes-select')?.value || mesActual();
    const rangoDesde = desde || mesSel + '-01';
    const rangoHasta = hasta || (() => {
      const [y,m] = mesSel.split('-').map(Number);
      const hoyStr = hoy();
      const finMes = mesSel + '-' + String(new Date(y,m,0).getDate()).padStart(2,'0');
      return finMes < hoyStr ? finMes : hoyStr;
    })();

    const todosAlumnos = await DB.getAlumnos();
    const alumnosFiltrados = todosAlumnos.filter(a => {
      if(q && !(
        (a.nombre||'').toLowerCase().includes(q.trim()) ||
        (a.id||'').toLowerCase().includes(q.trim())
      )) return false;
      if(nivel   && nivel   !== 'TODOS' && (a.turno||'') !== nivel)   return false;
      if(grado   && grado   !== 'TODOS' && (a.grado||'') !== grado)   return false;
      if(seccion && seccion !== 'TODOS' && (a.seccion||'') !== seccion) return false;
      return true;
    });

    const fechasHabiles = [];
    let cur = new Date(rangoDesde + 'T12:00:00');
    const fin = new Date(rangoHasta + 'T12:00:00');
    while(cur <= fin) {
      const dia = cur.getDay();
      if(dia !== 0 && dia !== 6) fechasHabiles.push(cur.toISOString().slice(0,10));
      cur.setDate(cur.getDate() + 1);
    }

    alumnosFiltrados.forEach(a => {
      fechasHabiles.forEach(fecha => {
        const key = a.id + '_' + fecha;
        if(!grupos[key]) {
          filasPDF.push({ fecha, dni: a.id, nombre: ((a.apellidos||'') + ' ' + (a.nombres||'')).trim() || a.nombre || '', turno: a.turno||'-', nivel: a.turno||'-', grado: a.grado, seccion: a.seccion, ingreso: null, salida: null, estado: 'Sin registro' });
        }
      });
    });
  }

  // Ordenar: nivel → grado numérico → sección → apellido → nombre
  return filasPDF.sort(_cmpFilaReporte);
}

async function exportCSV() {
  const regs = await getRegistrosFiltrados();
  if(!regs.length){ toast('No hay registros','warning'); return; }
  const header = 'Fecha,DNI,Nombre,Nivel,Grado,Seccion,Hora Ingreso,Hora Salida,Estado';
  const rows = regs.map(r =>
    `${r.fecha},${r.dni},"${r.nombre}",${r.nivel},${r.grado},${r.seccion},${r.ingreso||'-'},${r.salida||'-'},${r.estado}`
  );
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `asistencia_${hoy()}.csv`;
  a.click();
  toast('CSV exportado','success');
}

// ============================================================
// EXPORT XLSX
// ============================================================
async function exportXLSX() {
  const grado   = document.getElementById('filter-grado').value;
  const seccion = document.getElementById('filter-seccion').value;
  const q       = (document.getElementById('filter-search').value||'').trim();
  const mesSel  = document.getElementById('reg-mes-select')?.value || mesActual();
  const desde   = document.getElementById('filter-desde').value || mesSel+'-01';
  const hasta   = document.getElementById('filter-hasta').value || (() => {
    const [y,m]=mesSel.split('-').map(Number);
    const hs=hoy();
    const fm=mesSel+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
    return fm<hs?fm:hs;
  })();
  const esPorAlumno = q.length > 0;
  const esPorAula   = grado && grado !== 'TODOS' && seccion && seccion !== 'TODOS';

  if(!esPorAlumno && !esPorAula) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">⚠️</div><div style="font-weight:800;font-size:1rem;margin-bottom:8px;">Filtro requerido</div><div style="font-size:0.85rem;color:var(--muted);margin-bottom:20px;">Selecciona un aula especifica o busca un alumno.</div><button onclick="this.closest('div[style*=fixed]').remove()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 28px;font-weight:700;cursor:pointer;">Entendido</button></div>`;
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return;
  }

  const regs = await getRegistrosFiltrados();
  if(!regs.length){ toast('No hay registros','warning'); return; }

  if(!window.XLSX) {
    toast('Cargando libreria Excel...','info');
    await new Promise((res,rej) => {
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('Error'));
      document.head.appendChild(s);
    });
  }

  const cfg = await getConfig();
  const nombreColegio = COLEGIO_NOMBRE;
  const fechaExport = new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const diasSemana  = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];

  if(esPorAula) {
    // ── FORMATO MATRICIAL — por aula ──
    const todosAlumnos = await DB.getAlumnos();
    const alumnosAula = todosAlumnos
      .filter(a => a.grado===grado && a.seccion===seccion)
      .sort((a,b)=>(a.apellidos||'').localeCompare(b.apellidos||'')||( a.nombres||'').localeCompare(b.nombres||''));

    // Días hábiles del rango
    const diasHabiles=[];
    let cur=new Date(desde+'T12:00:00'), fin=new Date(hasta+'T12:00:00');
    while(cur<=fin) {
      const dow=cur.getDay();
      if(dow!==0&&dow!==6) diasHabiles.push({
        fecha:cur.toISOString().slice(0,10),
        label:diasSemana[dow].substring(0,3)+' '+String(cur.getDate()).padStart(2,'0')
      });
      cur.setDate(cur.getDate()+1);
    }

    // Mapa alumnoId → fecha → cod
    const mapa={};
    regs.forEach(r=>{
      if(!mapa[r.dni]) mapa[r.dni]={};
      const st=(r.estado||'').toLowerCase();
      let cod='A';
      if(st.includes('tardanza')) cod='T';
      else if(st.includes('tiempo')||st.includes('puntual')||r.ingreso) cod='P';
      mapa[r.dni][r.fecha]=cod;
    });

    const nCols=2+diasHabiles.length+3;
    const aoa=[],merges=[],styleMap={};

    aoa.push([nombreColegio,...Array(nCols-1).fill('')]); merges.push({s:{r:0,c:0},e:{r:0,c:nCols-1}}); styleMap[0]='title';
    const nivel=alumnosAula[0]?.turno||'';
    aoa.push([`${nivel} ${grado} Seccion ${seccion} - Registro de Asistencia - ${fechaExport}`,...Array(nCols-1).fill('')]); merges.push({s:{r:1,c:0},e:{r:1,c:nCols-1}}); styleMap[1]='subtitle';
    aoa.push(Array(nCols).fill(''));
    aoa.push(['DNI','Alumno',...diasHabiles.map(d=>d.label),'P','T','A']); styleMap[aoa.length-1]='header';

    alumnosAula.forEach((a,ai)=>{
      const nombre=((a.apellidos||'')+' '+(a.nombres||'')).trim();
      const row=[a.id,nombre];
      let pC=0,tC=0,aC=0;
      diasHabiles.forEach(d=>{
        const cod=(mapa[a.id]&&mapa[a.id][d.fecha])||'A';
        row.push(cod);
        if(cod==='P') pC++; else if(cod==='T') tC++; else aC++;
      });
      row.push(pC,tC,aC);
      aoa.push(row); styleMap[aoa.length-1]=ai%2===0?'even':'odd';
    });

    // Fila presentes por día
    const totRow=['','Presentes'];
    diasHabiles.forEach(d=>{
      const pres=alumnosAula.filter(a=>{const c=mapa[a.id]&&mapa[a.id][d.fecha];return c==='P'||c==='T';}).length;
      totRow.push(pres);
    });
    totRow.push('','','');
    aoa.push(totRow); styleMap[aoa.length-1]='summary';
    aoa.push(Array(nCols).fill(''));
    aoa.push(['P = Puntual   T = Tardanza   A = Ausente',...Array(nCols-1).fill('')]); styleMap[aoa.length-1]='legend';
    merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:nCols-1}});

    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:12},{wch:32},...diasHabiles.map(()=>({wch:7})),{wch:5},{wch:5},{wch:5}];
    ws['!merges']=merges;

    aoa.forEach((row,ri)=>{
      row.forEach((_,ci)=>{
        const addr=XLSX.utils.encode_cell({r:ri,c:ci});
        if(!ws[addr]) return;
        const st=styleMap[ri];
        let fill,font,alignment;
        if(st==='title')   {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'FFFFFF'},sz:13};alignment={horizontal:'center'};}
        else if(st==='subtitle'){fill={fgColor:{rgb:'0D1A3A'}};font={color:{rgb:'B0C4E8'},sz:9};alignment={horizontal:'center'};}
        else if(st==='header')  {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'C9A84C'},sz:9};alignment={horizontal:'center'};}
        else if(st==='even')    {fill={fgColor:{rgb:'F0F2F8'}};font={sz:8,color:{rgb:'1E293B'}};alignment={horizontal:'center'};}
        else if(st==='odd')     {fill={fgColor:{rgb:'FFFFFF'}};font={sz:8,color:{rgb:'1E293B'}};alignment={horizontal:'center'};}
        else if(st==='summary') {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'FFFFFF'},sz:8};alignment={horizontal:'center'};}
        else if(st==='legend')  {font={italic:true,sz:8,color:{rgb:'64748B'}};}
        if(ci===1&&(st==='even'||st==='odd'||st==='summary')) alignment={horizontal:'left'};
        if((st==='even'||st==='odd')&&ci>=2&&ci<2+diasHabiles.length){
          const v=ws[addr].v;
          if(v==='P') font={...font,color:{rgb:'16A34A'},bold:true};
          else if(v==='T') font={...font,color:{rgb:'D97706'},bold:true};
          else if(v==='A') font={...font,color:{rgb:'DC2626'},bold:true};
        }
        if((st==='even'||st==='odd')&&ci>=2+diasHabiles.length){
          if(ci===2+diasHabiles.length)   font={...font,color:{rgb:'16A34A'},bold:true};
          else if(ci===3+diasHabiles.length) font={...font,color:{rgb:'D97706'},bold:true};
          else if(ci===4+diasHabiles.length) font={...font,color:{rgb:'DC2626'},bold:true};
        }
        ws[addr].s={fill,font,alignment,border:{bottom:{style:'thin',color:{rgb:'DCE2EE'}}}};
      });
    });

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Asistencia');
    XLSX.writeFile(wb,'asistencia_'+grado+seccion+'_'+hoy()+'.xlsx');

  } else {
    // ── FORMATO LISTA CON SEPARADORES — alumno individual ──
    const COLS=['Fecha','DNI','Nombre','Nivel','Grado','Seccion','H. Ingreso','H. Salida','Estado'];
    const WIDTHS=[13,12,32,12,10,10,14,12,16];
    const aoa=[],merges=[],styles={};

    aoa.push([nombreColegio,...Array(COLS.length-1).fill('')]); merges.push({s:{r:0,c:0},e:{r:0,c:COLS.length-1}}); styles[0]='title';
    aoa.push([`${q} - Registro de Asistencia - ${fechaExport}`,...Array(COLS.length-1).fill('')]); merges.push({s:{r:1,c:0},e:{r:1,c:COLS.length-1}}); styles[1]='subtitle';
    aoa.push(Array(COLS.length).fill(''));
    aoa.push(COLS); styles[aoa.length-1]='header';

    regs.forEach((r,i)=>{
      const fp=(r.fecha||'').split('-');
      const ff=fp.length===3?fp[2]+'/'+fp[1]+'/'+fp[0]:r.fecha;
      aoa.push([ff,r.dni,r.nombre,r.nivel,r.grado,r.seccion,r.ingreso||'-',r.salida||'-',r.estado||'Sin registro']);
      styles[aoa.length-1]=i%2===0?'even':'odd';
    });

    aoa.push(Array(COLS.length).fill(''));
    aoa.push([`Total: ${regs.length} registro${regs.length!==1?'s':''}`,...Array(COLS.length-1).fill('')]); styles[aoa.length-1]='total';

    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=WIDTHS.map(w=>({wch:w}));
    ws['!merges']=merges;

    aoa.forEach((row,ri)=>{
      row.forEach((_,ci)=>{
        const addr=XLSX.utils.encode_cell({r:ri,c:ci});
        if(!ws[addr]) return;
        const st=styles[ri];
        let fill,font,alignment;
        if(st==='title')   {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'FFFFFF'},sz:13};alignment={horizontal:'center'};}
        else if(st==='subtitle'){fill={fgColor:{rgb:'0D1A3A'}};font={color:{rgb:'B0C4E8'},sz:9};alignment={horizontal:'center'};}
        else if(st==='header')  {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'FFFFFF'},sz:9};alignment={horizontal:'center'};}
        else if(st==='daterow') {fill={fgColor:{rgb:'0D1A3A'}};font={bold:true,color:{rgb:'C9A84C'},sz:9};alignment={horizontal:'left'};}
        else if(st==='even')    {fill={fgColor:{rgb:'F0F2F8'}};font={sz:8,color:{rgb:'1E293B'}};alignment={horizontal:'center'};}
        else if(st==='odd')     {fill={fgColor:{rgb:'FFFFFF'}};font={sz:8,color:{rgb:'1E293B'}};alignment={horizontal:'center'};}
        else if(st==='total')   {font={italic:true,sz:8,color:{rgb:'64748B'}};}
        if(ci===2&&(st==='even'||st==='odd')) alignment={horizontal:'left'};
        if((st==='even'||st==='odd')&&ci===COLS.length-1&&ws[addr].v){
          const v=String(ws[addr].v).toLowerCase();
          if(v.includes('tardanza')) font={...font,color:{rgb:'D97706'},bold:true};
          else if(v.includes('tiempo')||v.includes('puntual')) font={...font,color:{rgb:'16A34A'},bold:true};
          else if(v.includes('sin registro')||v.includes('ausente')) font={...font,color:{rgb:'DC2626'},bold:true};
        }
        ws[addr].s={fill,font,alignment,border:{bottom:{style:'thin',color:{rgb:'DCE2EE'}}}};
      });
    });

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Asistencia');
    XLSX.writeFile(wb,'asistencia_'+q.substring(0,20).replace(/\s/g,'_')+'_'+hoy()+'.xlsx');
  }

  toast('Excel exportado','success');
}


async function exportPDFRegistro() {
  const grado   = document.getElementById('filter-grado').value;
  const seccion = document.getElementById('filter-seccion').value;
  const q       = (document.getElementById('filter-search').value||'').trim();
  const mesSel  = document.getElementById('reg-mes-select')?.value || mesActual();
  const desde   = document.getElementById('filter-desde').value || mesSel+'-01';
  const hasta   = document.getElementById('filter-hasta').value || (() => {
    const [y,m]=mesSel.split('-').map(Number);
    const hs=hoy();
    const fm=mesSel+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
    return fm<hs?fm:hs;
  })();
  const esPorAlumno = q.length > 0;
  const esPorAula   = grado && grado !== 'TODOS' && seccion && seccion !== 'TODOS';

  if(!esPorAlumno && !esPorAula) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">⚠️</div><div style="font-weight:800;font-size:1rem;margin-bottom:8px;">Filtro requerido</div><div style="font-size:0.85rem;color:var(--muted);margin-bottom:20px;">Selecciona un aula especifica o busca un alumno.</div><button onclick="this.closest('div[style*=fixed]').remove()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 28px;font-weight:700;cursor:pointer;">Entendido</button></div>`;
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return;
  }

  const regs = await getRegistrosFiltrados();
  if(!regs.length){ toast('No hay registros para exportar','warning'); return; }

  await cargarJsPDF();
  if(!window.jspdf){ toast('Error cargando jsPDF','error'); return; }
  const { jsPDF } = window.jspdf;
  const cfg = await getConfig();
  const nombreColegio = COLEGIO_NOMBRE;
  const fechaExport = new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const diasSemana = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
  const NAVY=[13,26,58],GOLD=[201,168,76],WHITE=[255,255,255],GRAY=[240,242,248],MUTED=[100,116,139],TEXT=[30,41,59];
  const GREEN=[22,163,74],AMBER=[202,138,4],RED=[220,38,38];
  const logoB64 = await cargarLogoBase64();

  if(esPorAula) {
    // ── FORMATO MATRICIAL — por aula ──
    const todosAlumnos = await DB.getAlumnos();
    const alumnosAula = todosAlumnos
      .filter(a=>a.grado===grado&&a.seccion===seccion)
      .sort((a,b)=>(a.apellidos||'').localeCompare(b.apellidos||'')||( a.nombres||'').localeCompare(b.nombres||''));

    const diasHabiles=[];
    let cur=new Date(desde+'T12:00:00'),fin=new Date(hasta+'T12:00:00');
    while(cur<=fin){const dow=cur.getDay();if(dow!==0&&dow!==6)diasHabiles.push({fecha:cur.toISOString().slice(0,10),label:diasSemana[dow].substring(0,3)+' '+String(cur.getDate()).padStart(2,'0')});cur.setDate(cur.getDate()+1);}

    const mapa={};
    regs.forEach(r=>{if(!mapa[r.dni])mapa[r.dni]={};const st=(r.estado||'').toLowerCase();let cod='A';if(st.includes('tardanza'))cod='T';else if(st.includes('tiempo')||st.includes('puntual')||r.ingreso)cod='P';mapa[r.dni][r.fecha]=cod;});

    const landscape=diasHabiles.length>12;
    const doc=new jsPDF({orientation:landscape?'landscape':'portrait',unit:'mm',format:'a4'});
    const PW=landscape?297:210,PH=landscape?210:297;
    const COL_DNI=18,COL_NOMBRE=landscape?50:42,COL_TOT=8;
    const ancho=PW-20-COL_DNI-COL_NOMBRE-(COL_TOT*3);
    const COL_DIA=Math.max(5,Math.min(10,ancho/(diasHabiles.length||1)));
    const TABLE_X=10,TABLE_W=COL_DNI+COL_NOMBRE+(COL_DIA*diasHabiles.length)+(COL_TOT*3);
    const ROW_H=6.5,HEAD_H=8;
    let pageNum=1,curY=0;
    const nivel=alumnosAula[0]?.turno||'';

    function drawPH(){
      curY = pdfHeaderColegio(doc, PW, logoB64, {
        subtitulo: 'Registro de Asistencia',
        infoExtra: `${nivel} ${grado} Sección ${seccion}  ·  ${fechaExport}  Pág. ${pageNum}`,
      });
    }
    function drawTH(){
      doc.setFillColor(...NAVY);doc.rect(TABLE_X,curY,TABLE_W,HEAD_H,'F');
      doc.setTextColor(...GOLD);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
      let cx=TABLE_X;
      doc.text('DNI',cx+COL_DNI/2,curY+HEAD_H/2+2,{align:'center'});cx+=COL_DNI;
      doc.text('Alumno',cx+4,curY+HEAD_H/2+2);cx+=COL_NOMBRE;
      diasHabiles.forEach(d=>{doc.text(d.label,cx+COL_DIA/2,curY+HEAD_H/2+2,{align:'center'});cx+=COL_DIA;});
      doc.setTextColor(...WHITE);
      ['P','T','A'].forEach(l=>{doc.text(l,cx+COL_TOT/2,curY+HEAD_H/2+2,{align:'center'});cx+=COL_TOT;});
      curY+=HEAD_H;
    }
    function chk(){if(curY+ROW_H>PH-12){doc.addPage();pageNum++;drawPH();drawTH();}}

    drawPH();drawTH();

    alumnosAula.forEach((a,ai)=>{
      chk();
      if(ai%2===0){doc.setFillColor(...GRAY);doc.rect(TABLE_X,curY,TABLE_W,ROW_H,'F');}
      doc.setDrawColor(220,226,238);doc.setLineWidth(0.15);doc.line(TABLE_X,curY+ROW_H,TABLE_X+TABLE_W,curY+ROW_H);
      let cx=TABLE_X;
      doc.setTextColor(...MUTED);doc.setFontSize(6);doc.setFont('helvetica','normal');
      doc.text(a.id||'-',cx+COL_DNI/2,curY+ROW_H/2+2,{align:'center'});cx+=COL_DNI;
      const nom=((a.apellidos||'')+' '+(a.nombres||'')).trim();
      doc.setTextColor(...TEXT);doc.setFontSize(6.5);
      doc.text(nom.length>26?nom.substring(0,24)+'..':nom,cx+2,curY+ROW_H/2+2);cx+=COL_NOMBRE;
      let pC=0,tC=0,aC=0;
      diasHabiles.forEach(d=>{
        const cod=(mapa[a.id]&&mapa[a.id][d.fecha])||'A';
        if(cod==='P'){doc.setTextColor(...GREEN);pC++;}else if(cod==='T'){doc.setTextColor(...AMBER);tC++;}else{doc.setTextColor(...RED);aC++;}
        doc.setFontSize(6.5);doc.setFont('helvetica','bold');
        doc.text(cod,cx+COL_DIA/2,curY+ROW_H/2+2,{align:'center'});cx+=COL_DIA;
      });
      doc.setFontSize(7);doc.setFont('helvetica','bold');
      doc.setTextColor(...GREEN);doc.text(String(pC),cx+COL_TOT/2,curY+ROW_H/2+2,{align:'center'});cx+=COL_TOT;
      doc.setTextColor(...AMBER);doc.text(String(tC),cx+COL_TOT/2,curY+ROW_H/2+2,{align:'center'});cx+=COL_TOT;
      doc.setTextColor(...RED);doc.text(String(aC),cx+COL_TOT/2,curY+ROW_H/2+2,{align:'center'});
      curY+=ROW_H;
    });

    // Fila presentes
    chk();
    doc.setFillColor(...NAVY);doc.rect(TABLE_X,curY,TABLE_W,ROW_H,'F');
    let cx2=TABLE_X;
    doc.setTextColor(...GOLD);doc.setFontSize(6);doc.setFont('helvetica','bold');
    doc.text('',cx2+COL_DNI/2,curY+ROW_H/2+2,{align:'center'});cx2+=COL_DNI;
    doc.text('Presentes',cx2+2,curY+ROW_H/2+2);cx2+=COL_NOMBRE;
    diasHabiles.forEach(d=>{
      const pres=alumnosAula.filter(a=>{const c=mapa[a.id]&&mapa[a.id][d.fecha];return c==='P'||c==='T';}).length;
      doc.setTextColor(...WHITE);doc.text(String(pres),cx2+COL_DIA/2,curY+ROW_H/2+2,{align:'center'});cx2+=COL_DIA;
    });
    curY+=ROW_H;

    doc.setDrawColor(...NAVY);doc.setLineWidth(0.4);doc.rect(TABLE_X,22,TABLE_W,curY-22);
    curY+=4;doc.setFontSize(7);doc.setFont('helvetica','italic');
    doc.setTextColor(...GREEN);doc.text('P = Puntual',TABLE_X,curY);
    doc.setTextColor(...AMBER);doc.text('T = Tardanza',TABLE_X+22,curY);
    doc.setTextColor(...RED);doc.text('A = Ausente',TABLE_X+46,curY);
    doc.setTextColor(...MUTED);doc.text(`Total: ${alumnosAula.length} alumnos / ${diasHabiles.length} dias habiles`,TABLE_X+70,curY);
    doc.save(`asistencia_${grado}${seccion}_${hoy()}.pdf`);

  } else {
    // ── FORMATO LISTA CON SEPARADORES — alumno individual ──
    const COLS=[{label:'Fecha',key:'fecha',w:22},{label:'DNI',key:'dni',w:20},{label:'Nombre',key:'nombre',w:56},{label:'Nivel',key:'nivel',w:22},{label:'Grado',key:'grado',w:16},{label:'Seccion',key:'seccion',w:16},{label:'H. Ingreso',key:'ingreso',w:22},{label:'H. Salida',key:'salida',w:22},{label:'Estado',key:'estado',w:28}];
    const TABLE_X=10,TABLE_W=COLS.reduce((s,c)=>s+c.w,0),ROW_H=7,HEAD_H=8,DATE_H=6;
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const PW=297,PH=210;
    let pageNum=1,curY=0;

    function drawH(){
      curY = pdfHeaderColegio(doc, PW, logoB64, {
        subtitulo: 'Registro de Asistencia',
        infoExtra: `${q}  ·  ${fechaExport}  Pág. ${pageNum}`,
      });
    }
    function drawTH2(){
      doc.setFillColor(...NAVY);doc.rect(TABLE_X,curY,TABLE_W,HEAD_H,'F');
      doc.setTextColor(...WHITE);doc.setFontSize(8);doc.setFont('helvetica','bold');
      let cx=TABLE_X;
      COLS.forEach(col=>{doc.text(col.label,cx+col.w/2,curY+HEAD_H/2+2,{align:'center'});cx+=col.w;});
      curY+=HEAD_H;
    }
    function chk2(){if(curY+ROW_H>PH-10){doc.addPage();pageNum++;drawH();drawTH2();}}
    function eColor(e){if(!e)return MUTED;const v=e.toLowerCase();if(v.includes('tiempo')||v.includes('puntual'))return GREEN;if(v.includes('tardanza'))return AMBER;if(v.includes('sin registro')||v.includes('ausente'))return RED;return TEXT;}

    drawH();drawTH2();
    regs.forEach((r,i)=>{
      chk2();
      if(i%2===0){doc.setFillColor(...GRAY);doc.rect(TABLE_X,curY,TABLE_W,ROW_H,'F');}
      doc.setDrawColor(220,226,238);doc.setLineWidth(0.2);doc.line(TABLE_X,curY+ROW_H,TABLE_X+TABLE_W,curY+ROW_H);
      doc.setFontSize(8);doc.setFont('helvetica','normal');
      let cx=TABLE_X;
      COLS.forEach(col=>{
        let val=r[col.key]||'-';
        if(col.key==='nombre'&&val.length>30)val=val.substring(0,28)+'...';
        if(col.key==='fecha'&&val&&val!=='-'){const fp=val.split('-');if(fp.length===3)val=fp[2]+'/'+fp[1]+'/'+fp[0];}
        if(col.key==='estado'){doc.setTextColor(...eColor(val));doc.setFont('helvetica','bold');}
        else{doc.setTextColor(...TEXT);doc.setFont('helvetica','normal');}
        doc.text(String(val),cx+col.w/2,curY+ROW_H/2+2,{align:'center'});cx+=col.w;
      });
      curY+=ROW_H;
    });

    doc.setDrawColor(...NAVY);doc.setLineWidth(0.4);doc.rect(TABLE_X,24,TABLE_W,curY-24);
    curY+=4;doc.setTextColor(...MUTED);doc.setFontSize(8.5);doc.setFont('helvetica','italic');
    doc.text(`Total: ${regs.length} registro${regs.length!==1?'s':''}`,TABLE_X,curY);
    doc.save(`asistencia_${q.substring(0,15).replace(/\s/g,'_')}_${hoy()}.pdf`);
  }

  toast('PDF exportado','success');
}


// IMPORT CSV
// ============================================================
async function exportPDFAlumnos() {
  const grado   = document.getElementById('fa-grado').value;
  const seccion = document.getElementById('fa-seccion').value;
  const nivel   = document.getElementById('fa-nivel').value;
  const q       = (document.getElementById('search-alumnos').value||'').toLowerCase();

  let alumnos = await DB.getAlumnos();
  if(nivel   && nivel   !== 'TODOS') alumnos = alumnos.filter(a => a.turno === nivel);
  if(grado   && grado   !== 'TODOS') alumnos = alumnos.filter(a => a.grado === grado);
  if(seccion && seccion !== 'TODOS') alumnos = alumnos.filter(a => a.seccion === seccion);
  if(q) alumnos = alumnos.filter(a =>
    (a.nombres+' '+a.apellidos).toLowerCase().includes(q) || (a.id||'').includes(q)
  );

  if(!alumnos.length) { toast('No hay alumnos para exportar','warning'); return; }

  // Ordenar: nivel → grado numérico → sección → apellidos
  alumnos.sort(_cmpAlumnoReporte);

  await cargarJsPDF();
  if(!window.jspdf) { toast('Error cargando jsPDF','error'); return; }
  const { jsPDF } = window.jspdf;
  const cfgp = await getConfig();
  const nombreColegio = COLEGIO_NOMBRE;
  const fechaExport = new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});

  const logoB64 = await cargarLogoBase64();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297;
  const NAVY = [13,26,58], GOLD = [201,168,76], WHITE = [255,255,255];
  const GRAY = [240,242,248], TEXT = [30,41,59], MUTED = [100,116,139];

  const COLS = [
    { label:'#',         key:'num',      w:10 },
    { label:'DNI',       key:'id',       w:22 },
    { label:'Apellidos', key:'apellidos',w:46 },
    { label:'Nombres',   key:'nombres',  w:46 },
    { label:'Grado',     key:'grado',    w:18 },
    { label:'Sección',   key:'seccion',  w:16 },
    { label:'Nivel',     key:'turno',    w:22 },
  ];
  const TABLE_X = 10;
  const TABLE_W = COLS.reduce((s,c)=>s+c.w,0);
  const ROW_H = 7, HEAD_H = 8;
  let pageNum = 1, curY = 0;

  function drawHeader() {
    const subtitulo = (nivel && nivel !== 'TODOS' ? nivel : '') +
      (grado && grado !== 'TODOS' ? ' — ' + grado : '') +
      (seccion && seccion !== 'TODOS' ? ' ' + seccion : '') +
      (q ? ' — "' + q + '"' : '') || 'Lista General';
    curY = pdfHeaderColegio(doc, PW, logoB64, {
      subtitulo: 'Lista de Alumnos',
      infoExtra: `${subtitulo.trim()}  ·  ${fechaExport}  Pág. ${pageNum}`,
    });
  }

  function drawTableHeader() {
    doc.setFillColor(...NAVY); doc.rect(TABLE_X,curY,TABLE_W,HEAD_H,'F');
    doc.setTextColor(...WHITE); doc.setFontSize(8); doc.setFont('helvetica','bold');
    let cx = TABLE_X;
    COLS.forEach(col => { doc.text(col.label, cx+col.w/2, curY+HEAD_H/2+2,{align:'center'}); cx+=col.w; });
    curY += HEAD_H;
  }

  function checkNewPage() {
    if(curY + ROW_H > PH - 10) {
      doc.addPage(); pageNum++; drawHeader(); drawTableHeader();
    }
  }

  drawHeader(); drawTableHeader();
  let gradoActual = null;

  alumnos.forEach((a, i) => {
    // Separador por grado+sección
    const grupoKey = (a.grado||'') + '|' + (a.seccion||'');
    if(grupoKey !== gradoActual) {
      gradoActual = grupoKey;
      if(curY + 6 + ROW_H > PH - 10) { doc.addPage(); pageNum++; drawHeader(); drawTableHeader(); }
      doc.setFillColor(...NAVY); doc.rect(TABLE_X,curY,TABLE_W,6,'F');
      doc.setTextColor(...GOLD); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
      doc.text(`${a.turno||''} — ${a.grado||''} Sección ${a.seccion||''}`, TABLE_X+4, curY+4.2);
      curY += 6;
    }
    checkNewPage();
    if(i % 2 === 0) { doc.setFillColor(...GRAY); doc.rect(TABLE_X,curY,TABLE_W,ROW_H,'F'); }
    doc.setDrawColor(220,226,238); doc.setLineWidth(0.2);
    doc.line(TABLE_X, curY+ROW_H, TABLE_X+TABLE_W, curY+ROW_H);
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(...TEXT);
    let cx = TABLE_X;
    COLS.forEach(col => {
      let val = col.key === 'num' ? String(i+1) : (a[col.key]||'-');
      if(col.key === 'apellidos' && val.length > 20) val = val.substring(0,18)+'...';
      if(col.key === 'nombres'   && val.length > 20) val = val.substring(0,18)+'...';
      doc.text(String(val), cx+col.w/2, curY+ROW_H/2+2, {align:'center'});
      cx += col.w;
    });
    curY += ROW_H;
  });

  // Borde exterior
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
  doc.rect(TABLE_X, 24, TABLE_W, curY-24);

  curY += 4;
  doc.setTextColor(...MUTED); doc.setFontSize(8); doc.setFont('helvetica','italic');
  doc.text(`Total: ${alumnos.length} alumno${alumnos.length!==1?'s':''}`, TABLE_X, curY);

  const sufijo = grado && grado !== 'TODOS' ? `_${grado}${seccion && seccion !== 'TODOS' ? seccion : ''}` : '_general';
  doc.save(`alumnos${sufijo}_${hoy()}.pdf`);
  toast('✅ PDF exportado', 'success');
}

function importCSV() {
  document.getElementById('csv-input').click();
}

function handleCSV(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev) {
    const lines = ev.target.result.split('\n').filter(l => l.trim());
    const alumnosExistentes = await DB.getAlumnos();
    const existingIds = new Set(alumnosExistentes.map(a => a.id));
    let added = 0, updated = 0;
    for(let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if(idx === 0 && (line.toLowerCase().includes('dni') || line.toLowerCase().includes('nombres'))) continue;
      const cols = line.split(',').map(c => c.replace(/"/g,'').trim());
      if(cols.length < 4) continue;
      const [id, nombres, apellidos, turno, grado, seccion, foto, apoderadoNombres, apoderadoApellidos, telefono, correoApoderado] = cols;
      if(!id || !/^\d{8}$/.test(id)) continue;
      const limite = await getLimiteByNivel(turno||'Primaria');
      const alumno = { id, nombres, apellidos, grado: grado||'', seccion: seccion||'A', turno: turno||'Primaria', limite, foto: foto||'', apoderadoNombres: apoderadoNombres||'', apoderadoApellidos: apoderadoApellidos||'', telefono: telefono||'', correoApoderado: correoApoderado||'' };
      if(existingIds.has(id)) {
        // Actualizar alumno existente preservando foto si CSV no trae una
        const existente = alumnosExistentes.find(a => a.id === id);
        if(!alumno.foto && existente && existente.foto) alumno.foto = existente.foto;
        await DB.saveAlumno(alumno);
        updated++;
      } else {
        await DB.saveAlumno(alumno);
        added++;
      }
    }
    DB.bumpAlumnosVersion(); // Notificar a otros dispositivos
    renderAlumnos();
    updateStats();
    toast(`${added} alumnos nuevos, ${updated} actualizados`, 'success');
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
}




function importExcel() {
  document.getElementById('excel-input').click();
}

async function handleExcel(e) {
  const file = e.target.files[0];
  if(!file) return;
  e.target.value = '';

  // Cargar SheetJS dinámicamente
  if(!window.XLSX) {
    toast('Cargando librería Excel...', 'info');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
      document.head.appendChild(s);
    });
  }

  const reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const alumnosExistentes = await DB.getAlumnos();
      const existingIds = new Set(alumnosExistentes.map(a => a.id));
      let added = 0, updated = 0, skipped = 0;

      // Detectar fila de encabezado
      let startRow = 0;
      for(let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i].map(c => String(c).toLowerCase());
        if(row.some(c => c.includes('dni') || c.includes('nombres'))) {
          startRow = i + 1;
          break;
        }
      }

      // Filtrar filas válidas primero
      const filasValidas = [];
      for(let i = startRow; i < rows.length; i++) {
        const cols = rows[i].map(c => String(c).trim());
        const [id] = cols;
        if(!id || !/^\d{8}$/.test(id)) { skipped++; continue; }
        if(!cols[1] && !cols[2]) { skipped++; continue; }
        filasValidas.push(cols);
      }
      const total = filasValidas.length;

      // Mostrar barra de progreso
      let progEl = document.getElementById('import-progress-bar');
      if(!progEl) {
        const div = document.createElement('div');
        div.id = 'import-progress-container';
        div.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 24px;min-width:300px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.4);text-align:center;';
        div.innerHTML = '<div style="font-size:0.85rem;font-weight:700;color:var(--text);margin-bottom:10px;" id="import-progress-label">Importando alumnos...</div><div style="background:var(--border);border-radius:20px;height:8px;overflow:hidden;"><div id="import-progress-bar" style="height:100%;background:var(--accent);border-radius:20px;width:0%;transition:width 0.3s;"></div></div><div style="font-size:0.78rem;color:var(--muted);margin-top:8px;" id="import-progress-count">0 / '+total+'</div>';
        document.body.appendChild(div);
        progEl = document.getElementById('import-progress-bar');
      }

      for(let i = 0; i < filasValidas.length; i++) {
        const cols = filasValidas[i];
        const [id, nombres, apellidos, turno, grado, seccion, foto, apoderadoNombres, apoderadoApellidos, telefono, correoApoderado] = cols;
        const limite = await getLimiteByNivel(turno || 'Primaria');
        const alumno = {
          id,
          nombres:            nombres || '',
          apellidos:          apellidos || '',
          grado:              grado || '',
          seccion:            seccion || 'A',
          turno:              turno || 'Primaria',
          limite,
          foto:               foto || '',
          apoderadoNombres:   apoderadoNombres || '',
          apoderadoApellidos: apoderadoApellidos || '',
          telefono:           telefono || '',
          correoApoderado:    correoApoderado || ''
        };
        if(existingIds.has(id)) {
          const existente = alumnosExistentes.find(a => a.id === id);
          if(!alumno.foto && existente?.foto) alumno.foto = existente.foto;
          await DB.saveAlumno(alumno);
          updated++;
        } else {
          await DB.saveAlumno(alumno);
          added++;
        }
        // Actualizar barra de progreso
        const pct = Math.round(((i+1)/total)*100);
        progEl.style.width = pct + '%';
        document.getElementById('import-progress-count').textContent = (i+1) + ' / ' + total + ' alumnos';
        document.getElementById('import-progress-label').textContent = 'Importando... ' + pct + '%';
      }

      // Quitar barra de progreso
      const cont = document.getElementById('import-progress-container');
      if(cont) cont.remove();
      DB.invalidarAlumnos(); // Refrescar cache local
      DB.bumpAlumnosVersion(); // Notificar a otros dispositivos (1 write total)

      renderAlumnos();
      updateStats();
      // Toast especial que dura más para importación masiva
      const toastEl = document.createElement('div');
      toastEl.className = 'toast success';
      toastEl.style.cssText = 'max-width:380px;padding:14px 18px;font-size:0.88rem;';
      toastEl.innerHTML = `<span style="font-size:1rem;">✓</span><span class="toast-msg">✅ Importación completa<br><strong>${added} nuevos</strong>${updated ? ', '+updated+' actualizados' : ''}${skipped ? ', '+skipped+' omitidos' : ''}<br><span style="font-size:0.78rem;opacity:0.8;">Este mensaje desaparece en 8 segundos</span></span>`;
      document.getElementById('toast-container').appendChild(toastEl);
      setTimeout(() => toastEl.remove(), 8000);
    } catch(err) {
      console.error('Excel import error:', err);
      toast('Error al leer el archivo Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function guardarFactiliza() {
  const token    = document.getElementById('factiliza-token').value.trim();
  const instancia = document.getElementById('factiliza-instancia').value.trim();
  if(!token || !instancia) { toast('Completa token e instancia','warning'); return; }
  try {
    await db.collection('config').doc('factiliza').set({ token, instancia });
    toast('✅ Configuración WhatsApp guardada','success');
  } catch(e) { toast('Error al guardar: '+e.message,'error'); }
}

async function probarFactiliza() {
  const token    = document.getElementById('factiliza-token').value.trim();
  const instancia = document.getElementById('factiliza-instancia').value.trim();
  if(!token || !instancia) { toast('Completa token e instancia primero','warning'); return; }
  try {
    await guardarFactiliza();
  } catch(e) { toast('Error al guardar: '+e.message,'error'); return; }
  toast('Enviando mensaje de prueba...','info');
  const cfg = await getConfig();
  const msg = `✅ *Conexión exitosa*\n${_waEncabezado()}\n\nLa integración WhatsApp está funcionando correctamente. 🎉${_waPie()}`;
  const ok = await sendWhatsApp('51972898389', msg);
  if(ok) toast('✅ Mensaje de prueba enviado correctamente','success');
  else toast('❌ Error al enviar. Verifica token e instancia','error');
}

// ============================================================
// WHATSAPP — ENCABEZADO Y PIE INSTITUCIONAL
// ============================================================
function _waEncabezado() {
  const linea1 = `🏫 *${COLEGIO_NOMBRE}*`;
  const linea2 = COLEGIO_ESLOGAN ? `_${COLEGIO_ESLOGAN}_` : '';
  return linea2 ? `${linea1}\n${linea2}` : linea1;
}
function _waPie() {
  return `\n\n⚠️ _Este número es exclusivo para mensajes automáticos del colegio. Por favor no responda ni llame a este número._`;
}

// ============================================================
// WHATSAPP — FACTILIZA
// ============================================================
async function sendWhatsApp(telefono, mensaje, imageUrl = null) {
  let num = telefono.replace(/[^0-9]/g, '');
  if(num.startsWith('0')) num = num.substring(1);
  if(num.length === 9) num = '51' + num;
  if(!num || num.length < 10) {
    toast('WhatsApp: número de teléfono inválido','warning');
    return false;
  }
  try {
    const { data: { session } } = await _sb.auth.getSession();
    const jwt = session?.access_token;
    if(!jwt) { toast('Inicia sesión para enviar WhatsApp','warning'); return false; }
    const baseImg = imageUrl || new URL(COLEGIO_LOGO || 'img/logo-colegio.png', window.location.href).href;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ telefono: num, mensaje, urlImagen: baseImg })
    });
    const body = await res.json().catch(() => ({}));
    if(!res.ok) {
      toast('❌ WhatsApp no enviado: ' + (body.error || ('HTTP ' + res.status)), 'warning');
      return false;
    }
    return true;
  } catch(e) {
    toast('❌ Error conexión WhatsApp: ' + e.message, 'error');
    return false;
  }
}

// ============================================================
// IMPRESIÓN MASIVA DE CARNETS
// ============================================================
function toggleModoCarnets(activo) {
  // Mostrar/ocultar columna checkbox thead
  document.getElementById('th-chk-all').style.display = activo ? '' : 'none';
  // Mostrar/ocultar checkboxes de cada fila y DESMARCARLOS siempre
  document.querySelectorAll('.td-chk-alumno').forEach(td => {
    td.style.display = activo ? '' : 'none';
    const chk = td.querySelector('.chk-alumno');
    if(chk) chk.checked = false;
  });
  // Reset chk-all
  const chkAll = document.getElementById('chk-all');
  if(chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
  // Mostrar/ocultar botón imprimir — siempre deshabilitado al activar
  const btnImprimir = document.getElementById('btn-imprimir-carnets');
  btnImprimir.style.display = activo ? '' : 'none';
  btnImprimir.disabled = true;
  btnImprimir.textContent = '🖨 Imprimir Carnets';
  // Deshabilitar/habilitar botones de acción
  document.querySelectorAll('.btn-accion-alumno').forEach(btn => {
    btn.disabled = activo;
    btn.style.opacity = activo ? '0.35' : '';
    btn.style.pointerEvents = activo ? 'none' : '';
  });
  // Deshabilitar/habilitar Nuevo Alumno e Importar CSV/Excel
  const btnNuevo = document.getElementById('btn-nuevo-alumno');
  const btnImportarXL = document.getElementById('btn-importar-excel');
  if(btnNuevo)      { btnNuevo.disabled = activo;      btnNuevo.style.opacity = activo ? '0.35' : '';  btnNuevo.style.pointerEvents = activo ? 'none' : ''; }
  if(btnImportarXL) { btnImportarXL.disabled = activo; btnImportarXL.style.opacity = activo ? '0.35' : '1'; btnImportarXL.style.pointerEvents = activo ? 'none' : ''; }
}

function toggleSelectAll(chk) {
  document.querySelectorAll('.chk-alumno').forEach(c => c.checked = chk.checked);
  updateSeleccionados();
}

function updateSeleccionados() {
  const total = document.querySelectorAll('.chk-alumno').length;
  const sel = document.querySelectorAll('.chk-alumno:checked').length;
  const btn = document.getElementById('btn-imprimir-carnets');
  btn.textContent = sel > 0 ? `🖨 Imprimir Carnets (${sel})` : '🖨 Imprimir Carnets';
  btn.disabled = sel === 0;
  btn.style.opacity = sel === 0 ? '0.5' : '1';
  const chkAll = document.getElementById('chk-all');
  if(chkAll) chkAll.indeterminate = sel > 0 && sel < total;
  if(chkAll) chkAll.checked = sel === total && total > 0;
}

async function imprimirCarnetsMasivo() {
  const selIds = [...document.querySelectorAll('.chk-alumno:checked')].map(c => c.value);
  if(!selIds.length) { toast('Selecciona al menos un alumno', 'warning'); return; }

  const btn = document.getElementById('btn-imprimir-carnets');
  btn.disabled = true;
  btn.textContent = '⏳ Generando PDF...';

  try {
    await cargarJsPDF();
  } catch(e) {
    toast('Error cargando jsPDF, verifica tu conexión', 'error');
    btn.disabled = false; btn.textContent = '🖨 Imprimir Carnets';
    return;
  }
  if(!window.jspdf) {
    toast('jsPDF no disponible', 'error');
    btn.disabled = false; btn.textContent = '🖨 Imprimir Carnets';
    return;
  }

  // Cargar config del colegio
  const cfg = await getConfig();
  const nombreColegio = COLEGIO_NOMBRE;
  const anio = COLEGIO_ANIO || cfg?.anio || new Date().getFullYear();

  // Cargar alumnos seleccionados
  const todosAlumnos = await DB.getAlumnos();
  const alumnos = todosAlumnos.filter(a => selIds.includes(a.id));

  // Generar QR para cada alumno (cargar imágenes)
  const qrPromises = alumnos.map(a =>
    new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve({ alumno: a, qrImg: img });
      img.onerror = () => resolve({ alumno: a, qrImg: null });
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(a.id)}&bgcolor=ffffff&color=000000&margin=5&ecc=H`;
    })
  );

  // Cargar logo
  const logoPromise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = getLogo();
  });

  const [qrResults, logoImg] = await Promise.all([Promise.all(qrPromises), logoPromise]);

  try {
  // Generar PDF con jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PAGE_W = 210, PAGE_H = 297;
  const COLS = 3, ROWS = 3;
  const W = 57, H = 92;
  const MX = (PAGE_W - COLS * W) / (COLS + 1);   // ~10.5mm
  const MY = (PAGE_H - ROWS * H) / (ROWS + 1);   // ~9.8mm

  // Colores
  const NAVY_DARK = [13, 26, 58];
  const NAVY      = [26, 43, 94];
  const GOLD      = [201, 168, 76];
  const LIGHT_BG  = [240, 244, 255];
  const MUTED_C   = [107, 122, 153];
  const TEXT_DARK = [13, 26, 58];

  function roundRect(doc, x, y, w, h, r) {
    doc.roundedRect(x, y, w, h, r, r, 'F');
  }

  function drawCarnet(doc, x, y, alumno, qrImg, pageLogoImg) {
    const HEADER_H = 12;
    const FOOTER_H = 7;
    const BORDER   = 0.6;

    // Borde dorado exterior grueso
    doc.setFillColor(...GOLD);
    doc.roundedRect(x, y, W, H, 2.5, 2.5, 'F');

    // Fondo header azul marino
    doc.setFillColor(...NAVY_DARK);
    doc.roundedRect(x+BORDER, y+BORDER, W-BORDER*2, HEADER_H-BORDER, 2, 2, 'F');
    doc.rect(x+BORDER, y+BORDER+2, W-BORDER*2, HEADER_H-BORDER-2, 'F');

    // Línea dorada bajo header
    doc.setFillColor(...GOLD);
    doc.rect(x+BORDER, y+HEADER_H, W-BORDER*2, 0.7, 'F');

    // Logo izquierda en header
    const LOGO_S = 10;
    if(pageLogoImg) {
      try { doc.addImage(pageLogoImg, 'PNG', x+BORDER+1.5, y+BORDER+1, LOGO_S, LOGO_S); } catch(e) {}
    }

    // Textos header — separar prefijo del nombre propio
    const hcx   = x + BORDER + LOGO_S + 2 + (W - BORDER - LOGO_S - 3) / 2;
    const mCpdf = nombreColegio.match(/^(Institución Educativa|I\.E\.P\.?|I\.E\.)\s+(.+)$/i);
    const prefijoTxt = mCpdf ? mCpdf[1].toUpperCase() : '';
    const nombreTxt  = mCpdf ? mCpdf[2] : nombreColegio;
    doc.setTextColor(176, 196, 232);
    doc.setFontSize(4.5); doc.setFont('helvetica','normal');
    if(prefijoTxt) doc.text(prefijoTxt, hcx, y+BORDER+3.5, {align:'center'});
    doc.setTextColor(255,255,255);
    const fs = nombreTxt.length > 25 ? 5.5 : nombreTxt.length > 16 ? 6.5 : 7;
    doc.setFontSize(fs); doc.setFont('helvetica','bold');
    doc.text(nombreTxt, hcx, y+BORDER+(prefijoTxt?7:5.5), {align:'center', maxWidth: W - BORDER - LOGO_S - 5});

    // Fondo blanco body
    doc.setFillColor(255,255,255);
    const bodyTop = y + HEADER_H + 0.7;
    const bodyH   = H - HEADER_H - 0.7 - FOOTER_H - BORDER;
    doc.rect(x+BORDER, bodyTop, W-BORDER*2, bodyH, 'F');

    // Marca de agua
    if(pageLogoImg) {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({opacity: 0.06}));
      try {
        const wSize = (W - BORDER*2) * 0.55;
        const wX = x + BORDER + (W-BORDER*2-wSize)/2;
        const wY = bodyTop + (bodyH-wSize)/2;
        doc.addImage(pageLogoImg, 'PNG', wX, wY, wSize, wSize);
      } catch(e) {}
      doc.restoreGraphicsState();
    }

    const contCX  = x + W/2;
    const contTop = bodyTop + 2;

    // Foto circular con anillo dorado
    const fotoR = 9.5;
    const fotoCY = contTop + fotoR + 0.5;
    doc.setFillColor(...GOLD);
    doc.circle(contCX, fotoCY, fotoR + 1, 'F');
    doc.setFillColor(30, 50, 100);
    doc.circle(contCX, fotoCY, fotoR, 'F');

    if(alumno.foto) {
      try { doc.addImage(alumno.foto, contCX-fotoR, fotoCY-fotoR, fotoR*2, fotoR*2); }
      catch(e) {
        doc.setTextColor(255,255,255); doc.setFontSize(11); doc.setFont('helvetica','bold');
        doc.text((alumno.nombres[0]||'?')+(alumno.apellidos[0]||'?'), contCX, fotoCY+3, {align:'center'});
      }
    } else {
      doc.setTextColor(255,255,255); doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text((alumno.nombres[0]||'?')+(alumno.apellidos[0]||'?'), contCX, fotoCY+3, {align:'center'});
    }

    // Nombre alumno
    const afterFoto = fotoCY + fotoR + 2;
    const words = (alumno.nombres + ' ' + alumno.apellidos).split(' ');
    const mid = Math.ceil(words.length/2);
    const l1 = words.slice(0,mid).join(' ');
    const l2 = words.slice(mid).join(' ');
    doc.setTextColor(...NAVY_DARK);
    doc.setFontSize(7.5); doc.setFont('helvetica','bold');
    doc.text(l1, contCX, afterFoto + 1, {align:'center', maxWidth: W - BORDER*2 - 12});
    if(l2) doc.text(l2, contCX, afterFoto + 5.5, {align:'center', maxWidth: W - BORDER*2 - 12});

    // Línea dorada
    const lineY = afterFoto + (l2 ? 7 : 4);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(x+BORDER+5, lineY, x+W-BORDER-5, lineY);

    // DNI centrado grande
    const dataY = lineY + 4;
    doc.setFontSize(6); doc.setFont('helvetica','bold');
    doc.setTextColor(20, 20, 20);
    doc.text('DNI', contCX, dataY-1.5, {align:'center'});
    doc.setTextColor(...NAVY_DARK);
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text(alumno.id, contCX - 2, dataY+1, {align:'center', charSpace:1});

    // QR — ocupa el resto del body
    const qrTop  = dataY + 3;
    const qrBot  = bodyTop + bodyH - 4;
    const QR_S   = Math.min(qrBot - qrTop, W - BORDER*2 - 8);
    const qrX    = x + (W - QR_S) / 2;

    doc.setFillColor(255,255,255);
    doc.setDrawColor(200,200,200);
    doc.setLineWidth(0.4);
    doc.roundedRect(qrX-1, qrTop-1, QR_S+2, QR_S+2, 1, 1, 'FD');
    if(qrImg) {
      try { doc.addImage(qrImg, 'PNG', qrX, qrTop, QR_S, QR_S); } catch(e) {}
    }

    // Texto bajo QR
    doc.setTextColor(150,150,150);
    doc.setFontSize(3); doc.setFont('helvetica','normal');
    doc.text('ESCANEA PARA REGISTRAR ASISTENCIA', contCX, qrTop+QR_S+2.5, {align:'center'});

    // VIGENCIA vertical — pegada al borde izquierdo interior del body
    doc.saveGraphicsState();
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(3.8); doc.setFont('helvetica','bold');
    doc.setFontSize(6.5); doc.setFont('helvetica','bold');
    doc.text(`VIGENCIA 31 DE DICIEMBRE DEL ${anio}`, x + BORDER + 22, bodyTop + bodyH / 2 - 18, {angle: -90, align:'center'});
    doc.restoreGraphicsState();

    // Footer azul
    const footerY = y + H - FOOTER_H - BORDER;
    doc.setFillColor(...NAVY_DARK);
    doc.rect(x+BORDER, footerY, W-BORDER*2, FOOTER_H, 'F');
    doc.roundedRect(x+BORDER, footerY, W-BORDER*2, FOOTER_H, 0, 2, 'F');

    // Línea dorada sobre footer
    doc.setFillColor(...GOLD);
    doc.rect(x+BORDER, footerY, W-BORDER*2, 0.7, 'F');

    doc.setTextColor(...GOLD);
    doc.setFontSize(6.2); doc.setFont('helvetica','bold');
    doc.text(`${alumno.grado}  ·  Sección ${alumno.seccion}  ·  ${alumno.turno}`, contCX, footerY+4.5, {align:'center', maxWidth: W - BORDER*2 - 4});
  }

  // Dibujar carnets paginados
  let idx = 0;
  for(const { alumno, qrImg } of qrResults) {
    if(idx > 0 && idx % (COLS * ROWS) === 0) doc.addPage();
    const pos = idx % (COLS * ROWS);
    const col = pos % COLS;
    const row = Math.floor(pos / COLS);
    const x = MX + col * (W + MX);
    const y = MY + row * (H + MY);
    drawCarnet(doc, x, y, alumno, qrImg, logoImg);

    // Líneas de corte
    if(pos === 0) {
      doc.setDrawColor(180,180,180);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5,2], 0);
      for(let c=0;c<=COLS;c++) {
        const lx = c===0 ? MX/2 : c===COLS ? PAGE_W-MX/2 : MX+c*(W+MX)-MX/2;
        doc.line(lx, 2, lx, PAGE_H-2);
      }
      for(let r=0;r<=ROWS;r++) {
        const ly = r===0 ? MY/2 : r===ROWS ? PAGE_H-MY/2 : MY+r*(H+MY)-MY/2;
        doc.line(2, ly, PAGE_W-2, ly);
      }
      doc.setLineDashPattern([], 0);
    }
    idx++;
  }

  doc.save(`carnets_${hoy()}.pdf`);
  toast(`✅ PDF generado con ${alumnos.length} carnet${alumnos.length!==1?'s':''}`, 'success');
  } catch(err) {
    console.error('Error generando PDF:', err);
    toast('Error al generar PDF: ' + err.message, 'error');
  }
  btn.disabled = false;
  updateSeleccionados();
}

// ============================================================
// REPORTES
// ============================================================
// ============================================================
// SELECTORES DE MES — Reportes y Registro
// ============================================================
function mesActual() {
  return hoy().slice(0,7); // 'YYYY-MM'
}

function poblarSelectorMes(selectId, valorDefault) {
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const hoyMes = mesActual();
  // Año lectivo: marzo(3) a diciembre(12)
  // Admin/director ven todos los meses del año lectivo transcurridos
  // Otros roles: máximo 3 meses, pero solo desde marzo
  const mesActualNum = new Date().getMonth() + 1; // 1-12
  const MES_INICIO_LECTIVO = 3; // marzo
  const mesesLectivos = Math.max(0, mesActualNum - MES_INICIO_LECTIVO + 1); // cuántos meses lectivos han pasado
  const cantMeses = (currentRol === 'admin' || currentRol === 'director')
    ? mesesLectivos
    : Math.min(3, mesesLectivos);
  const meses = [];
  for(let i = 0; i < cantMeses; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const val = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('es-PE', { month: 'long' });
    meses.push({ val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  sel.innerHTML = meses.map(m =>
    `<option value="${m.val}" ${m.val === (valorDefault||hoyMes) ? 'selected' : ''}>${m.label}</option>`
  ).join('');
}

function mostrarBtnAnio() {
  // Solo admin y director pueden ver año completo
  const wrap = document.getElementById('rep-anio-btn-wrap');
  if(wrap) wrap.style.display = (currentRol === 'admin' || currentRol === 'director') ? 'block' : 'none';
}

async function exportarReportePDF() {
  if(!window.jspdf) { alert('La librería PDF aún está cargando, intenta en un momento.'); return; }
  const { jsPDF } = window.jspdf;
  const logoB64 = await cargarLogoBase64();
  const ctx = _repContextoPDF;
  if(!ctx || !ctx.total && ctx.total !== 0) { alert('Primero carga el reporte.'); return; }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesStr = ctx.mesSel || new Date().toISOString().slice(0,7);
  const [anioStr, mesNum] = mesStr.split('-');
  const periodoLabel = ctx.anioCompleto ? ('Año ' + anioStr) : (MESES[parseInt(mesNum)-1] + ' ' + anioStr);

  // Título dinámico según filtros activos
  const partes = [];
  if(ctx.nivel)   partes.push(ctx.nivel);
  if(ctx.grado)   partes.push(ctx.grado + ' Grado');
  if(ctx.seccion) partes.push('Sección ' + ctx.seccion);
  const subtituloFiltros = partes.length ? partes.join(' · ') : 'Todos los niveles y grados';
  let subtituloExtra = '';
  if(ctx.diaSel) {
    const [dy,dm,dd] = ctx.diaSel.split('-');
    subtituloExtra = 'Día: ' + dd + '/' + dm + '/' + dy;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, marginL = 14, marginR = 14, contentW = W - marginL - marginR;
  const fechaGen = new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' });

  // ── Encabezado institucional ──
  let yPos = pdfHeaderColegio(doc, W, logoB64, {
    subtitulo: 'Reporte de Asistencia',
    infoExtra: 'Período: ' + periodoLabel,
  });

  // Subtítulo del reporte (filtros activos)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtituloFiltros + (subtituloExtra ? '  ·  ' + subtituloExtra : '') + '   ·   ' + fechaGen, marginL, yPos + 2);

  yPos += 10;

  // ── KPIs ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('ESTADÍSTICAS', marginL, yPos);
  yPos += 5;

  const kpis = [
    { label: 'Alumnos',            value: ctx.total,          r:59,  g:130, b:246 },
    { label: 'Puntuales',          value: ctx.puntuales,      r:29,  g:158, b:117 },
    { label: 'Tardanzas',          value: ctx.tardanzas,      r:239, g:159, b:39  },
    { label: 'Ausencias',          value: ctx.ausencias,      r:226, g:75,  b:74  },
    { label: ctx.presentesLabel,   value: ctx.presentes,      r:99,  g:102, b:241 },
  ];
  const bW = (contentW - 4 * 3) / 5;
  kpis.forEach((k, i) => {
    const xK = marginL + i * (bW + 3);
    doc.setFillColor(k.r, k.g, k.b);
    doc.roundedRect(xK, yPos, bW, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(String(k.value), xK + bW/2, yPos + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(k.label, xK + bW/2, yPos + 15.5, { align: 'center' });
  });
  yPos += 26;

  // ── Distribución P/T/A ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('DISTRIBUCIÓN P / T / A', marginL, yPos);
  yPos += 6;

  const totalPTA = (ctx.puntuales + ctx.tardanzas + ctx.ausencias) || 1;
  const dist = [
    { label:'Puntual',  val: ctx.puntuales, r:29,  g:158, b:117 },
    { label:'Tardanza', val: ctx.tardanzas,  r:239, g:159, b:39  },
    { label:'Ausente',  val: ctx.ausencias,  r:226, g:75,  b:74  },
  ];

  // Barra apilada horizontal (visual tipo dona simplificada)
  const stackX = marginL, stackY = yPos, stackW = contentW, stackH = 8;
  doc.setFillColor(220, 228, 240);
  doc.rect(stackX, stackY, stackW, stackH, 'F');
  let stackOffset = 0;
  dist.forEach(d => {
    const segW = stackW * d.val / totalPTA;
    if(segW > 0) {
      doc.setFillColor(d.r, d.g, d.b);
      doc.rect(stackX + stackOffset, stackY, segW, stackH, 'F');
      stackOffset += segW;
    }
  });
  yPos += stackH + 6;

  // Filas de detalle
  const barMaxW = contentW - 55;
  dist.forEach(d => {
    const pct = Math.round(d.val / totalPTA * 100);
    // Cuadro de color (swatch)
    doc.setFillColor(d.r, d.g, d.b);
    doc.rect(marginL, yPos - 3, 4, 4, 'F');
    // Etiqueta
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 65, 85);
    doc.text(d.label, marginL + 7, yPos);
    // Porcentaje y cantidad
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 40, 55);
    doc.text(pct + '%  (' + d.val + ')', marginL + 35, yPos);
    // Barra de progreso (fondos y relleno con rect básico)
    doc.setFillColor(230, 235, 245);
    doc.rect(marginL + 55, yPos - 3, barMaxW, 4.5, 'F');
    if(pct > 0) {
      doc.setFillColor(d.r, d.g, d.b);
      doc.rect(marginL + 55, yPos - 3, Math.max(1.5, barMaxW * pct / 100), 4.5, 'F');
    }
    yPos += 9;
  });
  yPos += 4;

  // ── Dona visual P/T/A ──
  const donutCX = marginL + 35;
  const donutCY = yPos + 32;
  const outerR  = 28;
  const innerR  = 16;

  // Fondo gris (círculo completo)
  const bgSteps = 48;
  const bgLines = [];
  for(let i = 0; i < bgSteps; i++) {
    const a  = -Math.PI + 2*Math.PI*i/bgSteps;
    const an = -Math.PI + 2*Math.PI*(i+1)/bgSteps;
    bgLines.push([outerR*Math.cos(an)-outerR*Math.cos(a), outerR*Math.sin(an)-outerR*Math.sin(a)]);
  }
  doc.setFillColor(220, 228, 240);
  doc.lines(bgLines, donutCX - outerR, donutCY, [1,1], 'F', true);

  // Segmentos de la dona
  let donutAngle = -Math.PI / 2;
  dist.forEach(d => {
    const sliceAngle = 2 * Math.PI * d.val / totalPTA;
    if(sliceAngle > 0.01) {
      const steps = Math.max(8, Math.ceil(sliceAngle / (2*Math.PI) * 60));
      const sl = [[outerR * Math.cos(donutAngle), outerR * Math.sin(donutAngle)]];
      for(let i = 1; i <= steps; i++) {
        const a  = donutAngle + sliceAngle * i / steps;
        const ap = donutAngle + sliceAngle * (i-1) / steps;
        sl.push([outerR*(Math.cos(a)-Math.cos(ap)), outerR*(Math.sin(a)-Math.sin(ap))]);
      }
      sl.push([-outerR * Math.cos(donutAngle + sliceAngle), -outerR * Math.sin(donutAngle + sliceAngle)]);
      doc.setFillColor(d.r, d.g, d.b);
      doc.lines(sl, donutCX, donutCY, [1,1], 'F', true);
      donutAngle += sliceAngle;
    }
  });

  // Agujero central blanco
  const holeSteps = 48;
  const holeLines = [];
  for(let i = 0; i < holeSteps; i++) {
    const a  = -Math.PI + 2*Math.PI*i/holeSteps;
    const an = -Math.PI + 2*Math.PI*(i+1)/holeSteps;
    holeLines.push([innerR*Math.cos(an)-innerR*Math.cos(a), innerR*Math.sin(an)-innerR*Math.sin(a)]);
  }
  doc.setFillColor(255, 255, 255);
  doc.lines(holeLines, donutCX - innerR, donutCY, [1,1], 'F', true);

  // Texto central: % puntual
  const puntPct = Math.round(ctx.puntuales / totalPTA * 100);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 40, 55);
  doc.text(puntPct + '%', donutCX, donutCY + 1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('puntual', donutCX, donutCY + 5.5, { align: 'center' });

  // Leyenda a la derecha de la dona
  const legX = marginL + 72;
  let legY = yPos + 18;
  dist.forEach(d => {
    const pct = Math.round(d.val / totalPTA * 100);
    doc.setFillColor(d.r, d.g, d.b);
    doc.rect(legX, legY - 3.5, 5, 5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50, 65, 85);
    doc.text(d.label, legX + 8, legY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 40, 55);
    doc.text(pct + '%  (' + d.val + ')', legX + 38, legY);
    legY += 16;
  });

  yPos += outerR * 2 + 14;

  // ── Gráfico de barras por día ──
  if(ctx.datosDiarios && ctx.datosDiarios.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('ASISTENCIA POR DÍA DEL MES', marginL, yPos);
    yPos += 5;

    const chartH = 35;
    const maxAl  = ctx.total || 1;
    const datos  = ctx.datosDiarios;
    const barGap = 1;
    const bWBar  = Math.max(2, Math.min(7, (contentW - barGap * (datos.length - 1)) / datos.length));
    const totalBarW = bWBar * datos.length + barGap * (datos.length - 1);
    const startX = marginL + (contentW - totalBarW) / 2;

    datos.forEach((d, i) => {
      const x = startX + i * (bWBar + barGap);
      const hPres = chartH * (d.pres / maxAl);
      const hTard = chartH * (d.tard / maxAl);
      const hAus  = chartH * (d.aus  / maxAl);
      let yBar = yPos + chartH;
      if(hAus > 0)  { doc.setFillColor(226,75,74);   doc.rect(x, yBar - hAus, bWBar, hAus, 'F'); yBar -= hAus; }
      if(hTard > 0) { doc.setFillColor(239,159,39);  doc.rect(x, yBar - hTard, bWBar, hTard, 'F'); yBar -= hTard; }
      if(hPres > 0) { doc.setFillColor(29,158,117);  doc.rect(x, yBar - hPres, bWBar, hPres, 'F'); }
      // Etiqueta de día (solo si hay espacio)
      if(bWBar >= 4) {
        const dd = d.dia.split('-')[2];
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        doc.text(dd, x + bWBar/2, yPos + chartH + 4, { align: 'center' });
      }
    });

    // Leyenda del gráfico
    yPos += chartH + 9;
    const leyenda = [
      { label:'Puntual',  r:29,  g:158, b:117 },
      { label:'Tardanza', r:239, g:159, b:39  },
      { label:'Ausente',  r:226, g:75,  b:74  },
    ];
    let xLey = marginL;
    leyenda.forEach(l => {
      doc.setFillColor(l.r, l.g, l.b);
      doc.rect(xLey, yPos - 2.5, 4, 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(l.label, xLey + 6, yPos);
      xLey += 28;
    });
    yPos += 8;
  }

  // ── Pie de página ──
  doc.setFillColor(240, 244, 248);
  doc.rect(0, 285, W, 12, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Sistema AsistenciaQR  ·  ' + new Date().toLocaleString('es-PE'), W/2, 291, { align: 'center' });

  // Nombre del archivo
  const nivelSlug  = ctx.nivel   ? '-' + ctx.nivel.toLowerCase().replace(/\s/g,'-') : '';
  const gradoSlug  = ctx.grado   ? '-' + ctx.grado.replace(/\s/g,'')               : '';
  const secSlug    = ctx.seccion ? '-sec' + ctx.seccion                              : '';
  const diaSlug    = ctx.diaSel  ? '-' + ctx.diaSel                                  : '';
  doc.save(`reporte-asistencia-${mesStr}${nivelSlug}${gradoSlug}${secSlug}${diaSlug}.pdf`);
}

function onRepMesChange() {
  const diaEl = document.getElementById('rep-dia-select');
  if(diaEl) diaEl.value = '';
  renderReportes();
}

async function onRepNivelChange() {
  const nivel = document.getElementById('rep-nivel').value;
  const gradoEl = document.getElementById('rep-grado');
  const secEl   = document.getElementById('rep-seccion');
  gradoEl.innerHTML = '<option value="">Todos</option>';
  secEl.innerHTML   = '<option value="">Todas</option>';
  gradoEl.value = ''; secEl.value = '';
  if(nivel) {
    const cfg = await getConfig();
    const grados = (cfg.grados||{})[nivel] || [];
    grados.forEach(g => { gradoEl.innerHTML += `<option value="${g}">${g}</option>`; });
    gradoEl.disabled = false; gradoEl.style.opacity = '1';
  } else {
    gradoEl.disabled = true; gradoEl.style.opacity = '0.45';
  }
  secEl.disabled = true; secEl.style.opacity = '0.45';
  renderReportes();
}

async function onRepGradoChange() {
  const grado = document.getElementById('rep-grado').value;
  const secEl = document.getElementById('rep-seccion');
  secEl.innerHTML = '<option value="">Todas</option>';
  secEl.value = '';
  if(grado) {
    const alumnos = await getAlumnosFiltrados();
    const secs = [...new Set(alumnos.filter(a=>a.grado===grado).map(a=>a.seccion))].sort();
    secs.forEach(s => { secEl.innerHTML += `<option value="${s}">${s}</option>`; });
    secEl.disabled = false; secEl.style.opacity = '1';
  } else {
    secEl.disabled = true; secEl.style.opacity = '0.45';
  }
  renderReportes();
}

function onRepSearchChange() {
  const q = document.getElementById('rep-search').value.trim();
  if(q) {
    document.getElementById('rep-nivel').value   = '';
    document.getElementById('rep-grado').value   = '';
    document.getElementById('rep-seccion').value = '';
  }
  renderReportes();
}

async function limpiarFiltrosReportes() {
  document.getElementById('rep-nivel').value   = '';
  document.getElementById('rep-grado').value   = '';
  document.getElementById('rep-seccion').value = '';
  document.getElementById('rep-search').value  = '';
  const diaEl = document.getElementById('rep-dia-select');
  if(diaEl) diaEl.value = '';
  const gradoEl = document.getElementById('rep-grado');
  const secEl   = document.getElementById('rep-seccion');
  gradoEl.disabled = true; gradoEl.style.opacity = '0.45';
  secEl.disabled   = true; secEl.style.opacity   = '0.45';
  renderReportes();
}

async function iniciarFiltrosReportes() {
  const cfg = await getConfig();
  const nivEl = document.getElementById('rep-nivel');
  if(!nivEl) return;
  nivEl.innerHTML = '<option value="">Todos</option>';
  (cfg.niveles||[]).forEach(n => { nivEl.innerHTML += `<option value="${n.nombre}">${n.nombre}</option>`; });
}

// Meses ya reconciliados en esta sesión — evita escribir repetidamente si la diferencia persiste
const _resumenReconciliado = new Set();

// Reconcilia resumen_mensual contra registros reales en background (sin lecturas extra)
// ingRegs = array de registros INGRESO ya cargados; resumenActual = array del resumen cargado
async function _reconciliarResumenBackground(mes, ingRegs, resumenActual) {
  if(_resumenReconciliado.has(mes)) return; // ya revisado esta sesión
  // Construir conteo real desde registros
  const actual = {};
  ingRegs.forEach(r => {
    if(!actual[r.alumnoId]) actual[r.alumnoId] = {puntual: 0, tardanza: 0};
    if((r.estado||'').trim() === 'Tardanza') actual[r.alumnoId].tardanza++;
    else actual[r.alumnoId].puntual++;
  });
  // Construir mapa del resumen actual
  const resumenMap = {};
  resumenActual.forEach(r => { resumenMap[r.alumnoId] = r; });
  // Detectar diferencias
  const todosIds = new Set([...Object.keys(actual), ...resumenActual.map(r => r.alumnoId)]);
  const aCorregir = [];
  todosIds.forEach(alumnoId => {
    const act = actual[alumnoId]    || {puntual: 0, tardanza: 0};
    const res = resumenMap[alumnoId] || {puntual: -1, tardanza: -1}; // -1 fuerza escritura si falta
    if(act.puntual !== res.puntual || act.tardanza !== res.tardanza) {
      aCorregir.push({alumnoId, puntual: act.puntual, tardanza: act.tardanza});
    }
  });
  if(!aCorregir.length) { _resumenReconciliado.add(mes); return; }
  console.log(`[resumen] Reconciliando ${aCorregir.length} alumnos en ${mes}`);
  // Escribir correcciones en lotes de 500 (límite de Firestore batch)
  const LOTE = 500;
  for(let i = 0; i < aCorregir.length; i += LOTE) {
    const batch = db.batch();
    aCorregir.slice(i, i + LOTE).forEach(({alumnoId, puntual, tardanza}) => {
      batch.set(db.collection('resumen_mensual').doc(mes + '_' + alumnoId), {
        mes, alumnoId, puntual, tardanza,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
  // Invalidar cache para que la próxima apertura del reporte use datos correctos
  if(DB._resumenMesCache)     delete DB._resumenMesCache[mes];
  if(DB._resumenMesCacheTime) delete DB._resumenMesCacheTime[mes];
  _resumenReconciliado.add(mes); // no volver a reconciliar este mes en la sesión
  console.log(`[resumen] ${aCorregir.length} correcciones aplicadas en ${mes}`);
}

// Días hábiles (lun–vie) desde el primer día del mes hasta hoy (o fin de mes si ya cerró)
function _calcDiasHabilesHasta(mesClave) {
  const hoyStr = hoy();
  const [y, m] = mesClave.split('-').map(Number);
  const mesActualStr = hoyStr.slice(0, 7);
  const primerDia = new Date(y, m - 1, 1);
  const ultimoDia = mesClave === mesActualStr ? new Date(hoyStr) : new Date(y, m, 0);
  let count = 0;
  for(let d = new Date(primerDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if(dow !== 0 && dow !== 6) count++;
  }
  return count;
}

async function renderReportes(anioCompleto=false) {
  try {
  const today   = hoy();
  const anio    = today.slice(0,4);
  const mesSel  = document.getElementById('rep-mes-select')?.value || mesActual();
  // Limitar el selector de día al mes activo
  const diaInputEl = document.getElementById('rep-dia-select');
  if(diaInputEl) {
    const [my,mm] = (mesSel||today.slice(0,7)).split('-').map(Number);
    const ultimoDiaMes = new Date(my,mm,0).getDate();
    diaInputEl.min = `${mesSel||today.slice(0,7)}-01`;
    diaInputEl.max = `${mesSel||today.slice(0,7)}-${String(ultimoDiaMes).padStart(2,'0')}`;
    // Si el día guardado no pertenece al mes, limpiarlo
    if(diaInputEl.value && !diaInputEl.value.startsWith(mesSel||today.slice(0,7))) diaInputEl.value = '';
  }
  const diaSel  = diaInputEl?.value || '';
  const nivel   = document.getElementById('rep-nivel')?.value   || '';
  const grado   = document.getElementById('rep-grado')?.value   || '';
  const seccion = document.getElementById('rep-seccion')?.value || '';
  const q       = (document.getElementById('rep-search')?.value || '').toLowerCase().trim();
  const label   = document.getElementById('rep-periodo-label');

  // Cargar alumnos — profesores restringidos usan scoped (28 lecturas vs 1,300)
  let alumnos = await getAlumnosFiltrados();
  if(nivel)   alumnos = alumnos.filter(a => a.turno   === nivel);
  if(grado)   alumnos = alumnos.filter(a => a.grado   === grado);
  if(seccion) alumnos = alumnos.filter(a => a.seccion === seccion);
  if(q)       alumnos = alumnos.filter(a =>
    (a.nombres+' '+a.apellidos).toLowerCase().includes(q) || (a.id||'').includes(q)
  );
  const alumnosIds = new Set(alumnos.map(a=>a.id));
  document.getElementById('rep-total').textContent = alumnos.length;

  // ── Fase 1: KPIs rápidos desde resumen_mensual (~433 lecturas vs miles) ──────
  // Solo para vista mensual sin filtro de día específico
  let _resumenFase1 = null; // guardado para reconciliación automática tras cargar registros
  if(!diaSel && !anioCompleto) {
    const resumen = await DB.getResumenMes(mesSel);
    _resumenFase1 = resumen;
    const resFilt = resumen.filter(r => alumnosIds.has(r.alumnoId));
    const kpiP = resFilt.reduce((s,r) => s + (r.puntual||0), 0);
    const kpiT = resFilt.reduce((s,r) => s + (r.tardanza||0), 0);
    const diasHab = _calcDiasHabilesHasta(mesSel);
    const kpiF = Math.max(0, diasHab * alumnos.length - kpiP - kpiT);
    document.getElementById('rep-puntual').textContent   = kpiP;
    document.getElementById('rep-tardanzas').textContent = kpiT;
    document.getElementById('rep-faltas').textContent    = kpiF;
    if(label) label.textContent = 'KPIs del período (detalle cargando...)';
  }

  // ── Fase 2: Registros completos para gráficos ────────────────────────────────
  // Vista mensual sin día → usar resumen_mensual ya cargado (0 lecturas extra)
  // Vista día/año → cargar registros reales del período específico
  let registros;
  let _soloResumen = false;
  if(anioCompleto && (currentRol==='admin'||currentRol==='director')) {
    registros = await DB.getRegistros({anio});
    if(label) label.textContent = 'Año ' + anio + ' (' + registros.length + ' registros)';
  } else if(diaSel) {
    registros = await DB.getRegistros({fecha: diaSel});
    if(label) label.textContent = registros.length + ' registros del ' + diaSel;
  } else {
    // Vista mensual: resumen_mensual ya cargado en Fase 1 — ahorra hasta 57,000 lecturas
    registros = [];
    _soloResumen = true;
    if(label) label.textContent = 'Resumen del período';
  }

  // Filtrar registros al universo de alumnos seleccionados
  const regs = registros.filter(r => alumnosIds.has(r.alumnoId));
  const mesStr = mesSel || today.slice(0,7);
  const ingMes = regs.filter(r=>r.fecha.startsWith(mesStr)&&r.tipo==='INGRESO');

  // ── Reconciliación automática en background ──────────────────────────────────
  // Compara resumen_mensual con registros reales y corrige diferencias sin bloquear la UI
  // Usa datos ya cargados → 0 lecturas extra de Firestore
  if(!diaSel && !anioCompleto && !_soloResumen && _resumenFase1) {
    _reconciliarResumenBackground(mesSel, ingMes, _resumenFase1).catch(e =>
      console.warn('[resumen] reconciliación:', e.message)
    );
  }

  // Si hay día seleccionado, filtrar métricas sólo a ese día
  const ingFiltro = diaSel ? ingMes.filter(r=>r.fecha===diaSel) : ingMes;
  let puntFiltro = ingFiltro.filter(r=>r.estado==='A tiempo'||r.estado==='Puntual').length;
  let _tardFiltro = ingFiltro.filter(r=>r.estado==='Tardanza').length;

  const diasMes = new Set(ingMes.map(r=>r.fecha));
  let faltas = 0;
  if(diaSel) {
    const presD = new Set(ingMes.filter(r=>r.fecha===diaSel).map(r=>r.alumnoId));
    faltas = alumnos.filter(a=>!presD.has(a.id)).length;
  } else {
    diasMes.forEach(dia => {
      const pres = new Set(regs.filter(r=>r.fecha===dia&&r.tipo==='INGRESO').map(r=>r.alumnoId));
      faltas += alumnos.filter(a=>!pres.has(a.id)).length;
    });
  }

  // Vista mensual sin registros crudos: derivar métricas desde resumen_mensual (ya en memoria)
  if(_soloResumen && _resumenFase1) {
    const _rf = _resumenFase1.filter(r => alumnosIds.has(r.alumnoId));
    puntFiltro  = _rf.reduce((s,r) => s + (r.puntual||0),  0);
    _tardFiltro = _rf.reduce((s,r) => s + (r.tardanza||0), 0);
    faltas = Math.max(0, _calcDiasHabilesHasta(mesSel) * alumnos.length - puntFiltro - _tardFiltro);
  }

  // Actualizar KPIs exactos desde registros cuando hay filtro de día o vista anual
  // (en vista mensual sin día, los KPIs rápidos ya fueron mostrados en Fase 1)
  if(diaSel || anioCompleto) {
    document.getElementById('rep-puntual').textContent   = puntFiltro;
    document.getElementById('rep-tardanzas').textContent = _tardFiltro;
    document.getElementById('rep-faltas').textContent    = faltas;
  }

  const totalEsperado = _soloResumen ? (puntFiltro + _tardFiltro + faltas) : (ingFiltro.length + faltas);
  const pct = totalEsperado ? Math.round(puntFiltro/totalEsperado*100) : 0;
  const fechaPresentes = diaSel || today;
  const presHoy = _soloResumen
    ? (() => { const hc = DB._registrosCache['fecha:' + today] || []; return new Set(hc.filter(r=>r.tipo==='INGRESO'&&alumnosIds.has(r.alumnoId)).map(r=>r.alumnoId)).size; })()
    : new Set(regs.filter(r=>r.fecha===fechaPresentes&&r.tipo==='INGRESO').map(r=>r.alumnoId)).size;
  document.getElementById('rep-hoy').textContent = presHoy;
  const labelHoy = document.getElementById('rep-hoy-label');
  if(labelHoy) labelHoy.textContent = diaSel ? 'Presentes ese día' : 'Presentes hoy';

  // ── GRÁFICO 1: Barras apiladas por día ──
  const diasHabiles = [];
  const [y,m] = mesStr.split('-').map(Number);
  const primerDia = new Date(y,m-1,1);
  const ultimoDia = new Date(y,m,0);
  for(let d=new Date(primerDia); d<=ultimoDia; d.setDate(d.getDate()+1)) {
    const dow = d.getDay();
    if(dow!==0&&dow!==6) {
      diasHabiles.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    }
  }
  // Guardar contexto para exportar PDF
  const mesStr2 = mesStr; // alias para usar en _repContextoPDF
  _repContextoPDF = {
    mesSel, diaSel, nivel, grado, seccion,
    total: alumnos.length,
    puntuales: puntFiltro,
    tardanzas: _tardFiltro,
    ausencias: faltas,
    presentes: presHoy,
    presentesLabel: diaSel ? 'Presentes ese día' : 'Presentes hoy',
    datosDiarios: [],
    anioCompleto,
  };

  const chartBarras = document.getElementById('chart-barras-dia');
  if(chartBarras) {
    if(_soloResumen) {
      chartBarras.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:80px;color:var(--muted);font-size:0.8rem;text-align:center;padding:10px;">Selecciona un día para ver el detalle diario</div>';
    } else {
    const barW = Math.max(6, Math.min(16, Math.floor(260/diasHabiles.length)));
    const maxAl = alumnos.length || 1;
    let barsHtml = `<div style="display:flex;align-items:flex-end;gap:2px;height:80px;padding-bottom:18px;position:relative;">`;
    diasHabiles.forEach(dia => {
      const presD = new Set(regs.filter(r=>r.fecha===dia&&r.tipo==='INGRESO'&&r.estado!=='Tardanza').map(r=>r.alumnoId)).size;
      const tardD = new Set(regs.filter(r=>r.fecha===dia&&r.tipo==='INGRESO'&&r.estado==='Tardanza').map(r=>r.alumnoId)).size;
      const ausD  = Math.max(0, alumnos.length - presD - tardD);
      _repContextoPDF.datosDiarios.push({ dia, pres: presD, tard: tardD, aus: ausD });
      const hP = Math.round(presD/maxAl*62);
      const hT = Math.round(tardD/maxAl*62);
      const hA = Math.round(ausD/maxAl*62);
      const isToday = dia===today;
      const isSelected = diaSel ? dia===diaSel : false;
      const dimBar = diaSel && !isSelected;
      const fp=dia.split('-'); const dLabel=fp[2];
      barsHtml += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:${barW}px;position:relative;opacity:${dimBar?0.25:1};">
        <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:62px;">
          ${hA>0?`<div style="width:100%;height:${hA}px;background:#E24B4A;border-radius:2px 2px 0 0;"></div>`:''}
          ${hT>0?`<div style="width:100%;height:${hT}px;background:#EF9F27;"></div>`:''}
          ${hP>0?`<div style="width:100%;height:${hP}px;background:${isToday||isSelected?'#185FA5':'#1D9E75'};border-radius:${hA===0&&hT===0?'2px 2px':''} 0 0;"></div>`:''}
        </div>
        <span style="font-size:7px;color:${isToday||isSelected?'var(--accent)':'var(--muted)'};margin-top:2px;font-weight:${isToday||isSelected?'700':'400'}">${dLabel}</span>
      </div>`;
    });
    barsHtml += `</div>`;
    barsHtml += `<div style="display:flex;gap:10px;font-size:10px;color:var(--muted);margin-top:4px;">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#1D9E75;margin-right:3px;"></span>Puntual</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#EF9F27;margin-right:3px;"></span>Tardanza</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#E24B4A;margin-right:3px;"></span>Ausente</span>
    </div>`;
    chartBarras.innerHTML = barsHtml;
    } // end else !_soloResumen
  }

  // ── GRÁFICO 2: Dona distribución ──
  const chartDona = document.getElementById('chart-dona');
  if(chartDona) {
    const nPunt = puntFiltro;
    const nTard = _tardFiltro;
    const nAus  = faltas;
    const tot   = nPunt + nTard + nAus || 1;
    const pPunt = Math.round(nPunt/tot*100);
    const pTard = Math.round(nTard/tot*100);
    const pAus  = Math.round(nAus/tot*100);
    const circ  = 2*Math.PI*28;
    const dPunt = circ*nPunt/tot;
    const dTard = circ*nTard/tot;
    const dAus  = circ*nAus/tot;
    const oPunt = circ/4;
    const oTard = -(dPunt - circ/4);
    const oAus  = -(dPunt+dTard - circ/4);
    chartDona.innerHTML = `
      <svg width="110" height="110" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r="28" fill="none" stroke="var(--surface2)" stroke-width="10"/>
        <circle cx="35" cy="35" r="28" fill="none" stroke="#1D9E75" stroke-width="10"
          stroke-dasharray="${dPunt} ${circ}" stroke-dashoffset="${oPunt}"/>
        <circle cx="35" cy="35" r="28" fill="none" stroke="#EF9F27" stroke-width="10"
          stroke-dasharray="${dTard} ${circ}" stroke-dashoffset="${oTard}"/>
        <circle cx="35" cy="35" r="28" fill="none" stroke="#E24B4A" stroke-width="10"
          stroke-dasharray="${dAus} ${circ}" stroke-dashoffset="${oAus}"/>
        <text x="35" y="32" text-anchor="middle" font-size="9" font-weight="700" fill="var(--text)" font-family="sans-serif">${pPunt}%</text>
        <text x="35" y="43" text-anchor="middle" font-size="6" fill="var(--muted)" font-family="sans-serif">puntual</text>
      </svg>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:11px;">
        <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:50%;background:#1D9E75;flex-shrink:0;"></div><span>Puntual</span><span style="color:var(--muted);margin-left:auto;">${pPunt}% (${nPunt})</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:50%;background:#EF9F27;flex-shrink:0;"></div><span>Tardanza</span><span style="color:var(--muted);margin-left:auto;">${pTard}% (${nTard})</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:50%;background:#E24B4A;flex-shrink:0;"></div><span>Ausente</span><span style="color:var(--muted);margin-left:auto;">${pAus}% (${nAus})</span></div>
      </div>`;
  }

  // ── GRÁFICO 3: Mapa de calor (solo sin alumno individual) ──
  const heatmapCard = document.getElementById('card-heatmap');
  const chartHeatmap = document.getElementById('chart-heatmap');
  if(heatmapCard && chartHeatmap) {
    if(q) { heatmapCard.style.display='none'; }
    else {
      heatmapCard.style.display='';
      const cfg2 = await getConfig();
      // Aulas a mostrar según filtros
      let aulasList = [];
      const niveles = nivel ? [nivel] : (cfg2.niveles||[]).map(n=>n.nombre);
      niveles.forEach(niv => {
        const grados2 = grado ? [grado] : ((cfg2.grados||{})[niv]||[]);
        grados2.forEach(g => {
          const secs = seccion ? [seccion] : [...new Set(alumnos.filter(a=>a.grado===g).map(a=>a.seccion))].sort();
          secs.forEach(s => { aulasList.push({niv,g,s}); });
        });
      });
      if(aulasList.length===0) { chartHeatmap.innerHTML='<p style="color:var(--muted);font-size:.82rem;">Sin datos</p>'; }
      else if(_soloResumen && _resumenFase1) {
        // Heatmap mensual desde resumen_mensual — 0 lecturas extra
        const _dh = _calcDiasHabilesHasta(mesSel);
        let tbl = `<table style="border-collapse:collapse;font-size:9px;width:100%;"><thead><tr>
          <th style="padding:2px 6px;color:var(--muted);font-weight:500;text-align:left;">Aula</th>
          <th style="padding:2px 8px;color:var(--muted);font-weight:400;text-align:center;">Asistencia</th>
        </tr></thead><tbody>`;
        aulasList.forEach(({niv,g,s}) => {
          const aulaAlumnos = alumnos.filter(a=>a.grado===g&&a.seccion===s);
          if(!aulaAlumnos.length) return;
          const aulaIds = new Set(aulaAlumnos.map(a=>a.id));
          const aulaRes = _resumenFase1.filter(r=>aulaIds.has(r.alumnoId));
          const totalAsis = aulaRes.reduce((sum,r)=>sum+(r.puntual||0)+(r.tardanza||0),0);
          const esperado = aulaAlumnos.length * _dh;
          const pct2 = esperado ? Math.round(totalAsis/esperado*100) : 0;
          let bg='#F0F2F8',tc='#64748B';
          if(pct2>=95){bg='#97C459';tc='#173404';}
          else if(pct2>=85){bg='#C0DD97';tc='#27500A';}
          else if(pct2>=70){bg='#FAC775';tc='#633806';}
          else if(pct2>0){bg='#F09595';tc='#A32D2D';}
          tbl+=`<tr><td style="padding:2px 6px;color:var(--muted);white-space:nowrap;">${g} ${s}</td>
            <td style="padding:1px 4px;text-align:center;"><div style="background:${bg};color:${tc};border-radius:3px;padding:2px 4px;font-size:8px;font-weight:500;">${pct2>0?pct2+'%':'—'}</div></td></tr>`;
        });
        tbl+=`</tbody></table><div style="display:flex;gap:8px;margin-top:6px;font-size:9px;color:var(--muted);">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#97C459;margin-right:3px;"></span>≥95%</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#C0DD97;margin-right:3px;"></span>85-95%</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#FAC775;margin-right:3px;"></span>70-85%</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#F09595;margin-right:3px;"></span>&lt;70%</span>
        </div>`;
        chartHeatmap.innerHTML = tbl;
      } else {
        const dias7 = diasHabiles.filter(d=>d<=today).slice(-10);
        let tbl = `<table style="border-collapse:collapse;font-size:9px;width:100%;">
          <thead><tr>
            <th style="padding:2px 6px;color:var(--muted);font-weight:500;text-align:left;min-width:60px;">Aula</th>`;
        dias7.forEach(d=>{ const fp=d.split('-'); tbl+=`<th style="padding:2px 4px;color:var(--muted);font-weight:400;text-align:center;min-width:28px;">${fp[2]}</th>`; });
        tbl += '</tr></thead><tbody>';
        aulasList.forEach(({niv,g,s}) => {
          const aulaAlumnos = alumnos.filter(a=>a.grado===g&&a.seccion===s);
          if(!aulaAlumnos.length) return;
          tbl += `<tr><td style="padding:2px 6px;color:var(--muted);white-space:nowrap;">${g} ${s}</td>`;
          dias7.forEach(d => {
            const pres = new Set(regs.filter(r=>r.fecha===d&&r.tipo==='INGRESO'&&aulaAlumnos.some(a=>a.id===r.alumnoId)).map(r=>r.alumnoId)).size;
            const pct2 = aulaAlumnos.length ? Math.round(pres/aulaAlumnos.length*100) : 0;
            let bg='#F0F2F8',tc='#64748B';
            if(pct2>=95){bg='#97C459';tc='#173404';}
            else if(pct2>=85){bg='#C0DD97';tc='#27500A';}
            else if(pct2>=70){bg='#FAC775';tc='#633806';}
            else if(pct2>0){bg='#F09595';tc='#A32D2D';}
            tbl += `<td style="padding:1px 2px;text-align:center;"><div style="background:${bg};color:${tc};border-radius:3px;padding:2px 1px;font-size:8px;font-weight:500;">${pct2>0?pct2:'—'}</div></td>`;
          });
          tbl += '</tr>';
        });
        tbl += '</tbody></table>';
        tbl += `<div style="display:flex;gap:8px;margin-top:6px;font-size:9px;color:var(--muted);">
          <span style="display:flex;align-items:center;gap:3px;"><span style="width:9px;height:9px;border-radius:2px;background:#97C459;display:inline-block;"></span>≥95%</span>
          <span style="display:flex;align-items:center;gap:3px;"><span style="width:9px;height:9px;border-radius:2px;background:#C0DD97;display:inline-block;"></span>85-95%</span>
          <span style="display:flex;align-items:center;gap:3px;"><span style="width:9px;height:9px;border-radius:2px;background:#FAC775;display:inline-block;"></span>70-85%</span>
          <span style="display:flex;align-items:center;gap:3px;"><span style="width:9px;height:9px;border-radius:2px;background:#F09595;display:inline-block;"></span>&lt;70%</span>
        </div>`;
        chartHeatmap.innerHTML = tbl;
      } // end else (heatmap con registros reales)
    }
  }

  // ── Top tardanzas ──
  const topTard = document.getElementById('top-tardanzas');
  if(topTard) {
    if(_soloResumen && _resumenFase1) {
      const _rfT = _resumenFase1.filter(r=>alumnosIds.has(r.alumnoId)&&(r.tardanza||0)>0)
        .sort((a,b)=>(b.tardanza||0)-(a.tardanza||0)).slice(0,5);
      if(!_rfT.length) topTard.innerHTML='<p style="color:var(--muted);font-size:.85rem;">Sin tardanzas 🎉</p>';
      else topTard.innerHTML=_rfT.map(r=>{
        const a=alumnos.find(x=>x.id===r.alumnoId);
        const name=a?a.apellidos+' '+a.nombres:r.alumnoId;
        const det=a?`${a.grado} ${a.seccion} · ${a.turno||''}`:'-';
        const cnt=r.tardanza||0;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:500;font-size:.85rem;">${name}</div><div style="font-size:.75rem;color:var(--muted);">${det}</div></div><span class="badge yellow">${cnt} tardanza${cnt>1?'s':''}</span></div>`;
      }).join('');
    } else {
      const tardMap={};
      regs.filter(r=>r.estado==='Tardanza').forEach(r=>{ tardMap[r.alumnoId]=(tardMap[r.alumnoId]||0)+1; });
      const sortedTard=Object.entries(tardMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(!sortedTard.length) topTard.innerHTML='<p style="color:var(--muted);font-size:.85rem;">Sin tardanzas 🎉</p>';
      else topTard.innerHTML=sortedTard.map(([id,cnt])=>{
        const a=alumnos.find(x=>x.id===id);
        const name=a?a.apellidos+' '+a.nombres:id;
        const det=a?`${a.grado} ${a.seccion} · ${a.turno||''}`:'-';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:500;font-size:.85rem;">${name}</div><div style="font-size:.75rem;color:var(--muted);">${det}</div></div><span class="badge yellow">${cnt} tardanza${cnt>1?'s':''}</span></div>`;
      }).join('');
    }
  }

  // ── Top ausencias ──
  const topAus = document.getElementById('top-ausencias');
  if(topAus) {
    if(_soloResumen && _resumenFase1) {
      const _dhTop = _calcDiasHabilesHasta(mesSel);
      const _rfA = _resumenFase1.filter(r=>alumnosIds.has(r.alumnoId)).map(r=>({
        id: r.alumnoId,
        faltas: Math.max(0, _dhTop - (r.puntual||0) - (r.tardanza||0))
      })).filter(r=>r.faltas>0).sort((a,b)=>b.faltas-a.faltas).slice(0,5);
      if(!_rfA.length) topAus.innerHTML='<p style="color:var(--muted);font-size:.85rem;">Sin ausencias 🎉</p>';
      else topAus.innerHTML=_rfA.map(({id,faltas:cnt})=>{
        const a=alumnos.find(x=>x.id===id);
        const name=a?a.apellidos+' '+a.nombres:id;
        const det=a?`${a.grado} ${a.seccion} · ${a.turno||''}`:'-';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:500;font-size:.85rem;">${name}</div><div style="font-size:.75rem;color:var(--muted);">${det}</div></div><span class="badge red">${cnt} falta${cnt>1?'s':''}</span></div>`;
      }).join('');
    } else {
      const ausMap={};
      diasMes.forEach(dia=>{
        const pres=new Set(regs.filter(r=>r.fecha===dia&&r.tipo==='INGRESO').map(r=>r.alumnoId));
        alumnos.forEach(a=>{ if(!pres.has(a.id)) ausMap[a.id]=(ausMap[a.id]||0)+1; });
      });
      const sortedAus=Object.entries(ausMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(!sortedAus.length) topAus.innerHTML='<p style="color:var(--muted);font-size:.85rem;">Sin ausencias 🎉</p>';
      else topAus.innerHTML=sortedAus.map(([id,cnt])=>{
        const a=alumnos.find(x=>x.id===id);
        const name=a?a.apellidos+' '+a.nombres:id;
        const det=a?`${a.grado} ${a.seccion} · ${a.turno||''}`:'-';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:500;font-size:.85rem;">${name}</div><div style="font-size:.75rem;color:var(--muted);">${det}</div></div><span class="badge red">${cnt} falta${cnt>1?'s':''}</span></div>`;
      }).join('');
    }
  }

  } catch(e) { console.error('renderReportes:', e); }
}

let _repAlertasCache = { weekStart:'', weekEnd:'', mes:'', tardTh:3, ausTh:3, tardyRows:[], absentRows:[] };

function _repIsoToDate(iso) {
  const s = String(iso||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function _repDateToIso(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _repWeekMonFri(iso) {
  const d = _repIsoToDate(iso) || _repIsoToDate(hoy());
  const dow = d.getDay(); // 0 dom..6 sab
  const deltaMon = (dow === 0) ? -6 : (1 - dow);
  const mon = new Date(d); mon.setDate(mon.getDate() + deltaMon);
  const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  return { weekStart: _repDateToIso(mon), weekEnd: _repDateToIso(fri) };
}

async function _repGetAlumnosActuales() {
  const nivel   = document.getElementById('rep-nivel')?.value   || '';
  const grado   = document.getElementById('rep-grado')?.value   || '';
  const seccion = document.getElementById('rep-seccion')?.value || '';
  const q       = (document.getElementById('rep-search')?.value || '').toLowerCase().trim();
  let alumnos = await getAlumnosFiltrados();
  if(nivel)   alumnos = alumnos.filter(a => a.turno   === nivel);
  if(grado)   alumnos = alumnos.filter(a => a.grado   === grado);
  if(seccion) alumnos = alumnos.filter(a => a.seccion === seccion);
  if(q)       alumnos = alumnos.filter(a =>
    (a.nombres+' '+a.apellidos).toLowerCase().includes(q) || (a.id||'').includes(q)
  );
  return alumnos;
}

async function generarAlertasAsistencia() {
  const status = document.getElementById('rep-alertas-status');
  const wrap = document.getElementById('rep-alertas-wrap');
  try {
    const tardTh = Math.max(1, parseInt(document.getElementById('rep-alert-tard')?.value || '3', 10) || 3);
    const ausTh  = Math.max(1, parseInt(document.getElementById('rep-alert-aus')?.value  || '3', 10) || 3);
    const mesSel = document.getElementById('rep-mes-select')?.value || mesActual();
    const diaRef = document.getElementById('rep-dia-select')?.value || hoy();
    const { weekStart, weekEnd } = _repWeekMonFri(diaRef);

    if(status) status.textContent = 'Calculando alertas...';
    if(wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }

    const alumnos = await _repGetAlumnosActuales();
    const alumnosIds = new Set(alumnos.map(a=>a.id));
    if(!alumnos.length) throw new Error('No hay alumnos con los filtros actuales');

    const regsSemana = await DB.getRegistros({ desde: weekStart, hasta: weekEnd });
    const tardMap = {};
    regsSemana
      .filter(r => alumnosIds.has(r.alumnoId) && r.tipo === 'INGRESO' && r.estado === 'Tardanza')
      .forEach(r => { tardMap[r.alumnoId] = (tardMap[r.alumnoId] || 0) + 1; });
    const tardyRows = alumnos
      .map(a => ({ alumnoId: a.id, nombre: (a.apellidos+' '+a.nombres).trim(), grado: a.grado, seccion: a.seccion, nivel: a.turno, tardanzas: tardMap[a.id] || 0 }))
      .filter(x => x.tardanzas >= tardTh)
      .sort((a,b) => b.tardanzas - a.tardanzas || a.nombre.localeCompare(b.nombre));

    const diasHab = _calcDiasHabilesHasta(mesSel);
    const resumen = await DB.getResumenMes(mesSel);
    const resMap = {};
    resumen.forEach(r => { if(alumnosIds.has(r.alumnoId)) resMap[r.alumnoId] = { puntual: r.puntual||0, tardanza: r.tardanza||0 }; });
    const absentRows = alumnos
      .map(a => {
        const r = resMap[a.id] || { puntual: 0, tardanza: 0 };
        const aus = Math.max(0, diasHab - (r.puntual + r.tardanza));
        return { alumnoId: a.id, nombre: (a.apellidos+' '+a.nombres).trim(), grado: a.grado, seccion: a.seccion, nivel: a.turno, ausencias: aus };
      })
      .filter(x => x.ausencias >= ausTh)
      .sort((a,b) => b.ausencias - a.ausencias || a.nombre.localeCompare(b.nombre));

    _repAlertasCache = { weekStart, weekEnd, mes: mesSel, tardTh, ausTh, tardyRows, absentRows };

    const mkTable = (title, cols, rows) => {
      if(!rows.length) return `<div style="color:var(--muted);font-size:.85rem;margin-top:6px;">${title}: sin resultados.</div>`;
      return `
        <div style="margin-top:10px;">
          <div style="font-weight:800;color:var(--text);margin-bottom:8px;">${title}</div>
          <div style="overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
            <table class="table" style="width:100%;">
              <thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${_escHtml(r.alumnoId)}</td>
                    <td>${_escHtml(r.nombre)}</td>
                    <td>${_escHtml(String(r.grado||''))}</td>
                    <td>${_escHtml(String(r.seccion||''))}</td>
                    <td>${_escHtml(String(r.nivel||''))}</td>
                    <td style="font-weight:800;">${_escHtml(String(r.tardanzas ?? r.ausencias ?? ''))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    };

    const html = []
    html.push(`<div style="font-size:0.82rem;color:var(--muted);">Semana: ${weekStart} a ${weekEnd} · Mes: ${mesSel} · Días hábiles (mes): ${diasHab}</div>`);
    html.push(mkTable(`Tardanzas ≥ ${tardTh} (semana)`, ['DNI','Alumno','Grado','Sección','Nivel','Tardanzas'], tardyRows));
    html.push(mkTable(`Ausencias ≥ ${ausTh} (mes)`, ['DNI','Alumno','Grado','Sección','Nivel','Ausencias'], absentRows));

    if(wrap) { wrap.innerHTML = html.join(''); wrap.style.display = ''; }
    if(status) status.textContent = `✅ Alertas generadas: ${tardyRows.length} con tardanzas y ${absentRows.length} con ausencias.`;
  } catch(e) {
    if(status) status.textContent = '❌ ' + e.message;
    if(wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    toast('❌ ' + e.message, 'error');
  }
}

async function exportarAlertasAsistenciaXLSX() {
  try {
    if(!_repAlertasCache?.weekStart) {
      await generarAlertasAsistencia();
      if(!_repAlertasCache?.weekStart) return;
    }
    if(!window.XLSX) {
      toast('Cargando libreria Excel...','info');
      await new Promise((res,rej) => {
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload=res; s.onerror=()=>rej(new Error('Error'));
        document.head.appendChild(s);
      });
    }
    const { weekStart, weekEnd, mes, tardTh, ausTh, tardyRows, absentRows } = _repAlertasCache;
    const wb = XLSX.utils.book_new();

    const aoa1 = [['DNI','Alumno','Grado','Sección','Nivel','Tardanzas','SemanaInicio','SemanaFin','Umbral'], ...tardyRows.map(r => [r.alumnoId,r.nombre,r.grado,r.seccion,r.nivel,r.tardanzas,weekStart,weekEnd,tardTh])];
    const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
    XLSX.utils.book_append_sheet(wb, ws1, 'TardanzasSemana');

    const aoa2 = [['DNI','Alumno','Grado','Sección','Nivel','Ausencias','Mes','Umbral'], ...absentRows.map(r => [r.alumnoId,r.nombre,r.grado,r.seccion,r.nivel,r.ausencias,mes,ausTh])];
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    XLSX.utils.book_append_sheet(wb, ws2, 'AusenciasMes');

    XLSX.writeFile(wb, `alertas_asistencia_${weekStart}_${mes}.xlsx`);
    toast('✅ Excel de alertas generado','success');
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
}


// ============================================================
// STATS
// ============================================================
let _updateStatsTime = 0;
async function updateStatsForce() {
  _updateStatsTime = 0; // Resetear throttle para forzar ejecución
  await updateStats();
}
async function updateStats() {
  // Throttle: no ejecutar más de 1 vez cada 30 segundos (aplica solo al fallback con Firestore)
  const now = Date.now();
  if(now - _updateStatsTime < 30000) return;
  _updateStatsTime = now;
  try {
    const alumnos = await DB.getAlumnos(); // 0 lecturas Firestore: siempre en cache de memoria
    let ingresosHoy, tardanzasHoy;
    if(_hoyRegsLoaded) {
      // Contar desde Set local — 0 lecturas Firestore
      const entries = Object.values(_hoyRegs);
      ingresosHoy  = entries.filter(r => r.ingreso).length;
      tardanzasHoy = entries.filter(r => r.tardanza).length;
    } else {
      // Fallback solo si precargar aún no terminó (ocurre muy al inicio de sesión)
      const regsHoy = await DB.getRegistros({fecha: hoy()});
      ingresosHoy  = new Set(regsHoy.filter(r=>r.tipo==='INGRESO').map(r=>r.alumnoId)).size;
      tardanzasHoy = regsHoy.filter(r=>r.estado==='Tardanza').length;
    }
    const ausentes = Math.max(0, alumnos.length - ingresosHoy);
    // Desktop (stats inline bar)
    document.getElementById('stat-total').textContent = alumnos.length;
    document.getElementById('stat-hoy').textContent = ingresosHoy;
    document.getElementById('stat-tarde').textContent = tardanzasHoy;
    document.getElementById('stat-ausentes').textContent = ausentes;
    // Móvil (stats-row-mobile) — pueden no existir si se eliminaron
    const tm = document.getElementById('stat-total-m');
    const hm = document.getElementById('stat-hoy-m');
    const tdm = document.getElementById('stat-tarde-m');
    const am = document.getElementById('stat-ausentes-m');
    if(tm) tm.textContent = alumnos.length;
    if(hm) hm.textContent = ingresosHoy;
    if(tdm) tdm.textContent = tardanzasHoy;
    if(am) am.textContent = ausentes;
  } catch(e) { console.error('updateStats:', e); }
}

// ============================================================
// UTILS
// ============================================================
function hoy() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('open');
  el.classList.remove('active');
  el.style.display = ''; // reset inline style para que CSS tome control
}

function toast(msg, type='success') {
  const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type==='info'?'success':type}`;
  el.innerHTML = `<span style="font-size:1rem;">${icons[type]||'ℹ'}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Modal close handled via onclick on modal-bg elements directly

// ============================================================
// GESTIÓN DE USUARIOS
// ============================================================
let editingUsuarioId = null;

async function openModalUsuario(uid, nombre, rol, email) {
  editingUsuarioId = uid || null;
  document.getElementById('modal-usuario-title').textContent = uid ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('u-pass').value = '';
  document.getElementById('btn-toggle-upass').textContent = '👁';
  document.getElementById('u-pass').type = 'password';

  if(uid) {
    document.getElementById('u-pass-group').style.display = 'block';
    document.getElementById('u-pass-label').textContent = 'Nueva contraseña (opcional)';
    document.getElementById('u-pass-note').style.display = 'block';
    document.getElementById('u-email').readOnly = true;
    document.getElementById('u-email').style.opacity = '0.6';
    if(nombre) document.getElementById('u-nombre').value = nombre;
    if(email)  document.getElementById('u-email').value  = email;
    if(rol) {
      document.getElementById('u-rol').value = rol;
    }
    // Cargar cargo desde Firestore
    try {
      const uDoc = await db.collection('usuarios').doc(uid).get();
      const uData = uDoc.exists ? uDoc.data() : {};
      const cargo = uData.cargo || '';
      // Cargar teléfono
      document.getElementById('u-telefono').value = uData.telefono || '';
      // Mostrar botón recuperar solo si tiene teléfono
      document.getElementById('u-recuperar-msg').style.display = 'none';
      const cargoSel = document.getElementById('u-cargo-select');
      const cargoCustom = document.getElementById('u-cargo-custom');
      const cargoHidden = document.getElementById('u-cargo');
      const opciones = Array.from(cargoSel.options).map(o => o.value);
      if(opciones.includes(cargo)) {
        cargoSel.value = cargo;
        cargoCustom.style.display = 'none';
      } else if(cargo) {
        cargoSel.value = 'otro';
        cargoCustom.style.display = 'block';
        cargoCustom.value = cargo;
      } else {
        cargoSel.value = '';
      }
      cargoHidden.value = cargo;
    } catch(e) {}
  } else {
    document.getElementById('u-pass-group').style.display = 'block';
    document.getElementById('u-pass-label').textContent = 'Contraseña';
    document.getElementById('u-pass-note').style.display = 'none';
    document.getElementById('u-email').readOnly = false;
    document.getElementById('u-email').style.opacity = '1';
    ['u-nombre','u-email','u-telefono'].forEach(x => document.getElementById(x).value = '');
    document.getElementById('u-rol').value = 'portero';
    document.getElementById('u-cargo-select').value = '';
    document.getElementById('u-cargo-custom').value = '';
    document.getElementById('u-cargo-custom').style.display = 'none';
    document.getElementById('u-cargo').value = '';
    tempAsignaciones = {};
    document.getElementById('u-restringir').checked = false;
  }

  // Cargar checkboxes de privilegios
  await cargarCheckboxesPrivilegios(uid);
  togglePrivilegios();
  toggleBtnConfigurar();
  const mUsr = document.getElementById('modal-usuario');
  if(mUsr) { mUsr.style.display = ''; mUsr.classList.add('open'); }
}

async function saveUsuario() {
  const nombre = document.getElementById('u-nombre').value.trim();
  const email  = document.getElementById('u-email').value.trim();
  const pass   = document.getElementById('u-pass').value;
  const rol    = document.getElementById('u-rol').value;
  // Sync cargo hidden field
  toggleCargoCustum();
  const cargo  = document.getElementById('u-cargo').value.trim();

  if(!nombre){ toast('Completa el nombre','warning'); return; }
  if(!editingUsuarioId && !email){ toast('Completa el correo','warning'); return; }

  try {
    // Obtener asignaciones si es profesor
    const restringir = rol === 'profesor' ? document.getElementById('u-restringir').checked : false;
    const asignaciones = (rol === 'profesor' && restringir) ? tempAsignaciones : {};

    if(!editingUsuarioId) {
      // NUEVO usuario
      if(!pass || pass.length < 6){ toast('La contraseña debe tener al menos 6 caracteres','warning'); return; }
      const secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary_' + Date.now());
      const secondaryAuth = secondaryApp.auth();
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
      const uid = cred.user.uid;
      await secondaryAuth.signOut();
      await secondaryApp.delete();
      const telefono3 = document.getElementById('u-telefono').value.trim();
      await db.collection('usuarios').doc(uid).set({ nombre, email, rol, cargo, telefono: telefono3, restringir, asignaciones, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      _invalidarUsuarios();
      toast('Usuario creado correctamente','success');
    } else {
      // EDITAR usuario
      const telefonoEdit = document.getElementById('u-telefono').value.trim();
      await db.collection('usuarios').doc(editingUsuarioId).update({ nombre, rol, cargo, telefono: telefonoEdit, restringir, asignaciones });
      _invalidarUsuarios();
      // Mostrar/ocultar botón recuperar según teléfono
      // Si se ingresó nueva contraseña, cambiarla
      if(pass && pass.length >= 6) {
        // Re-autenticar como admin no es posible en client SDK para otros usuarios
        // Usamos workaround: crear app secundaria con las credenciales actuales no es posible
        // Mejor opción: mostrar mensaje informativo
        toast('Datos actualizados. Para cambiar la contraseña el usuario debe usar "¿Olvidé mi contraseña?" en el login.','info');
      } else {
        toast('Usuario actualizado correctamente','success');
      }
    }
    closeModal('modal-usuario');
    renderUsuarios();
  } catch(e) {
    console.error(e);
    if(e.code === 'auth/email-already-in-use') toast('Ese correo ya está registrado','error');
    else if(e.code === 'auth/invalid-email') toast('Correo inválido','error');
    else toast('Error: ' + e.message,'error');
  }
}


async function deleteUsuario(uid) {
  if(uid === currentUser.uid){ toast('No puedes eliminar tu propia cuenta','warning'); return; }
  if(!confirm('¿Eliminar este usuario? No podrá ingresar al sistema.')) return;
  try {
    await db.collection('usuarios').doc(uid).delete();
    _invalidarUsuarios();
    toast('Usuario eliminado','info');
    renderUsuarios();
  } catch(e) { toast('Error al eliminar','error'); }
}

// Cache de usuarios
let _usuariosCacheData = null;
async function _cargarUsuariosCache() {
  if(_usuariosCacheData) return _usuariosCacheData;
  const lsUsr = LSC.get('usuarios');
  if(lsUsr) { _usuariosCacheData = lsUsr; return lsUsr; }
  const snap = await db.collection('usuarios').get();
  _usuariosCacheData = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  LSC.set('usuarios', _usuariosCacheData, LSC.TTL_USUARIOS);
  return _usuariosCacheData;
}
function _invalidarUsuarios() {
  _usuariosCacheData = null;
  LSC.del('usuarios');
}

async function renderUsuarios() {
  const tbody = document.getElementById('usuarios-tbody');
  if(!tbody) return;
  try {
    const usuarios = await _cargarUsuariosCache();
    const rolLabels = { admin:'⚙️ Admin', director:'🏫 Director', coordinador:'📊 Coordinador', profesor:'📋 Profesor', portero:'🚪 Portero' };
    const rolColors = { admin:'var(--accent)', director:'#a78bfa', coordinador:'#60a5fa', profesor:'#34d399', portero:'#fb923c' };
    tbody.innerHTML = usuarios.map(u => {
      const esYo = u.uid === currentUser.uid ? ' (tú)' : '';
      return `<tr>
        <td style="font-weight:500;">${u.nombre}${esYo}</td>
        <td style="color:var(--muted);font-size:0.85rem;">${u.email}</td>
        <td><span style="color:${rolColors[u.rol]||'#fff'};font-weight:600;">${rolLabels[u.rol]||u.rol}</span>${u.cargo?`<br><span style="font-size:0.72rem;color:var(--muted);">${u.cargo}</span>`:''} ${u.rol==='profesor'&&u.restringir?`<br><span style="font-size:0.72rem;color:var(--accent);">Restringido: ${Object.keys(u.asignaciones||{}).join(', ')||'sin asignar'}</span>`:''}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:0.78rem;" onclick="openModalUsuario('${u.uid}','${u.nombre}','${u.rol}','${u.email}')">✏</button>
          ${u.uid !== currentUser.uid ? `<button class="btn btn-danger" style="padding:5px 10px;font-size:0.78rem;" onclick="deleteUsuario('${u.uid}')">✕</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);">Error al cargar usuarios</td></tr>'; }
}



// ============================================================
// PRIVILEGIOS DE PROFESOR
// ============================================================

// Almacén temporal de asignaciones mientras edita
let tempAsignaciones = {};

function toggleCargoCustum() {
  const sel = document.getElementById('u-cargo-select').value;
  const custom = document.getElementById('u-cargo-custom');
  const hidden = document.getElementById('u-cargo');
  if(sel === 'otro') {
    custom.style.display = 'block';
    custom.oninput = () => hidden.value = custom.value;
    hidden.value = custom.value;
  } else {
    custom.style.display = 'none';
    hidden.value = sel;
  }
}

function toggleBtnConfigurar() {
  const checked = document.getElementById('u-restringir').checked;
  const btn = document.getElementById('btn-configurar-privilegios');
  if(btn) btn.disabled = !checked;
}

function togglePrivilegios() {
  const rol = document.getElementById('u-rol').value;
  document.getElementById('u-privilegios-group').style.display = rol === 'profesor' ? 'block' : 'none';
}

function actualizarResumenPrivilegios() {
  const resumen = document.getElementById('u-privilegios-resumen');
  if(!resumen) return;
  const grados = Object.keys(tempAsignaciones);
  if(!grados.length) {
    resumen.textContent = 'Sin restricciones configuradas';
    return;
  }
  resumen.textContent = grados.map(g => {
    const s = (tempAsignaciones[g]||[]);
    return g + (s.length ? ' ('+s.join(',')+')' : ' (todas)');
  }).join(' · ');
}

async function abrirModalPrivilegios() {
  await cargarCheckboxesPrivilegios(null); // usa tempAsignaciones
  document.getElementById('modal-privilegios').classList.add('open');
}

async function savePrivilegios() {
  // Leer checks del modal privilegios
  tempAsignaciones = {};
  document.querySelectorAll('.chk-grado:checked').forEach(chk => {
    const g = chk.dataset.grado;
    const seccs = Array.from(
      document.querySelectorAll(`.chk-seccion[data-grado="${g}"]:checked`)
    ).map(c => c.value);
    tempAsignaciones[g] = seccs;
  });
  actualizarResumenPrivilegios();
  closeModal('modal-privilegios');
  // Auto-check restringir si hay asignaciones
  if(Object.keys(tempAsignaciones).length) {
    document.getElementById('u-restringir').checked = true;
  }
}

async function cargarCheckboxesPrivilegios(uid) {
  const cfg = await getConfig();
  const secciones = cfg.secciones || ['A','B','C','D'];

  // Si uid, cargar desde Firestore; si no, usar tempAsignaciones
  if(uid) {
    try {
      const doc = await db.collection('usuarios').doc(uid).get();
      if(doc.exists) {
        tempAsignaciones = doc.data().asignaciones || {};
        document.getElementById('u-restringir').checked = doc.data().restringir || false;
      }
    } catch(e) {}
  }

  const asignaciones = tempAsignaciones;

  // Render por nivel en modal-privilegios
  const nivelesEl = document.getElementById('u-niveles-checks');
  nivelesEl.innerHTML = (cfg.niveles||[]).map(n => {
    const grados = (cfg.grados||{})[n.nombre] || [];
    const nivelKey = n.nombre.replace(/[^a-z0-9]/gi,'_');
    return `
      <div style="margin-bottom:16px;padding:12px;background:var(--surface2);border-radius:10px;">
        <div style="font-size:0.82rem;font-weight:700;color:var(--accent);margin-bottom:10px;">${n.nombre}</div>
        ${grados.map(g => {
          const seccsAsignadas = asignaciones[g] || [];
          const gradoKey = nivelKey + '_' + g.replace(/[^a-z0-9]/gi,'_');
          return `
            <div style="margin-bottom:8px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;font-weight:600;margin-bottom:5px;">
                <input type="checkbox" class="chk-grado" data-grado="${g}" data-key="${gradoKey}"
                  onchange="toggleGradoSecciones(this)"
                  ${seccsAsignadas.length?'checked':''}
                  style="accent-color:var(--accent);width:15px;height:15px;">
                ${g}
              </label>
              <div id="secc-${gradoKey}" style="display:${seccsAsignadas.length?'flex':'none'};flex-wrap:wrap;gap:8px;padding-left:22px;margin-top:4px;">
                ${secciones.map(s => `
                  <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.82rem;">
                    <input type="checkbox" class="chk-seccion" data-grado="${g}" data-key="${gradoKey}" value="${s}"
                      ${seccsAsignadas.includes(s)?'checked':''}
                      style="accent-color:var(--accent);width:14px;height:14px;">
                    ${s}
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
  actualizarResumenPrivilegios();
}

function toggleGradoSecciones(chk) {
  const key = chk.dataset.key;
  const secDiv = document.getElementById('secc-' + key);
  if(secDiv) secDiv.style.display = chk.checked ? 'flex' : 'none';
  if(!chk.checked && secDiv) {
    secDiv.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
  }
}

function getAsignaciones() {
  const result = {};
  document.querySelectorAll('.chk-grado:checked').forEach(chk => {
    const g = chk.dataset.grado;
    const key = chk.dataset.key;
    const seccs = Array.from(
      document.querySelectorAll(`.chk-seccion[data-key="${key}"]:checked`)
    ).map(c => c.value);
    result[g] = seccs;
  });
  return result;
}

// Privilegios del usuario actual
let currentPrivilegios = { restringir: false, asignaciones: {} };

async function cargarPrivilegiosActuales() {
  if(!currentUser || currentRol !== 'profesor') {
    currentPrivilegios = { restringir: false, asignaciones: {} };
    return;
  }
  try {
    const doc = await db.collection('usuarios').doc(currentUser.uid).get();
    if(doc.exists) {
      currentPrivilegios = {
        restringir:   doc.data().restringir   || false,
        asignaciones: doc.data().asignaciones || {},
      };
    }
  } catch(e) {
    currentPrivilegios = { restringir: false, asignaciones: {} };
  }
}

// Aplicar restricción a lista de alumnos
function aplicarFiltroProfesor(alumnos) {
  if(currentRol !== 'profesor') return alumnos;
  if(!currentPrivilegios.restringir) return alumnos;
  const asig = currentPrivilegios.asignaciones;
  if(!Object.keys(asig).length) return alumnos;
  return alumnos.filter(a => {
    if(!asig[a.grado]) return false;
    const seccs = asig[a.grado];
    // Si no hay secciones marcadas para ese grado, ve todas las secciones de ese grado
    if(!seccs.length) return true;
    return seccs.includes(a.seccion);
  });
}


// Helper: retorna solo los alumnos visibles para el usuario actual.
// Para profesores con restricciones usa getAlumnosScoped() —
// consulta Firestore solo por sus grados/secciones (28 lecturas vs 1,300).
// Para admins/directores/sin restricción usa getAlumnos() (cache completo).
let _alumnosCacheFull = null;
let _alumnosCacheTs = 0;
function _invalidarCacheAlumnos() { _alumnosCacheFull = null; _alumnosCacheTs = 0; }

async function getAlumnosFiltrados() {
  if(currentRol === 'profesor' && currentPrivilegios?.restringir) {
    const asig = currentPrivilegios.asignaciones || {};
    if(Object.keys(asig).length) return DB.getAlumnosScoped(asig);
  }
  const now = Date.now();
  if(_alumnosCacheFull && now - _alumnosCacheTs < 90000) return _alumnosCacheFull;
  _alumnosCacheFull = await DB.getAlumnos();
  _alumnosCacheTs = now;
  return _alumnosCacheFull;
}

// ============================================================
// FILTROS DINÁMICOS POR NIVEL → GRADO → SECCIÓN
// ============================================================

async function poblarFiltroNivel(selectId, onchangeFn) {
  const cfg = await getConfig();
  const el = document.getElementById(selectId);
  if(!el) return;
  const niveles = (cfg.niveles||[]).map(n => n.nombre);
  // Si es profesor con restricciones, solo sus niveles
  let nivelesVisibles = niveles;
  if(currentRol === 'profesor' && currentPrivilegios.restringir) {
    const gradosAsig = Object.keys(currentPrivilegios.asignaciones || {});
    const nivelesAsig = new Set();
    niveles.forEach(nv => {
      const grados = (cfg.grados||{})[nv] || [];
      if(grados.some(g => gradosAsig.includes(g))) nivelesAsig.add(nv);
    });
    nivelesVisibles = niveles.filter(n => nivelesAsig.has(n));
  }
  el.innerHTML = `<option value="" disabled selected>-- Nivel --</option><option value="TODOS">Todos</option>`;
  nivelesVisibles.forEach(n => { el.innerHTML += `<option value="${n}">${n}</option>`; });
}

async function poblarFiltroGrado(selectId, nivel) {
  const cfg = await getConfig();
  const el = document.getElementById(selectId);
  if(!el) return;

  // Obtener alumnos (siempre cacheado)
  const alumnos = await DB.getAlumnos();
  const alumnosFiltrados = alumnos.filter(a => !nivel || nivel === 'TODOS' || a.turno === nivel);
  const gradosConAlumnos = new Set(alumnosFiltrados.map(a => a.grado).filter(Boolean));

  // Intentar obtener grados ordenados desde config; si no hay, usar los de alumnos directamente
  let gradosCfg = nivel && nivel !== 'TODOS'
    ? (cfg.grados||{})[nivel] || []
    : [...new Set(Object.values(cfg.grados||{}).flat())];

  // Si config no tiene grados configurados para este nivel, caer al set de alumnos
  let grados = gradosCfg.length > 0
    ? gradosCfg.filter(g => gradosConAlumnos.has(g))
    : [...gradosConAlumnos].sort();

  // Si es profesor con restricciones, solo sus grados
  if(currentRol === 'profesor' && currentPrivilegios.restringir) {
    const gradosAsig = Object.keys(currentPrivilegios.asignaciones || {});
    grados = grados.filter(g => gradosAsig.includes(g));
  }
  el.innerHTML = `<option value="" disabled selected>-- Grado --</option><option value="TODOS">Todos</option>`;
  grados.forEach(g => { el.innerHTML += `<option value="${g}">${g}</option>`; });
}

async function poblarFiltroSeccion(selectId, grado) {
  const cfg = await getConfig();
  const el = document.getElementById(selectId);
  if(!el) return;

  // Obtener secciones reales de los alumnos (incluir vacíos como 'A' por defecto)
  const alumnos = await DB.getAlumnos();
  const alumnosFiltrados = alumnos.filter(a => !grado || grado === 'TODOS' || a.grado === grado);
  const seccionesDeAlumnos = [...new Set(alumnosFiltrados.map(a => a.seccion || 'A').filter(Boolean))].sort();

  // Usar config como orden preferido; si no hay coincidencias, usar secciones de alumnos directamente
  const seccCfg = (cfg.secciones || []).filter(Boolean);
  let secciones = seccCfg.length > 0
    ? seccCfg.filter(s => seccionesDeAlumnos.includes(s))
    : seccionesDeAlumnos;
  // Si la config no cubrió ninguna sección real, mostrar las de alumnos
  if(secciones.length === 0) secciones = seccionesDeAlumnos.length > 0 ? seccionesDeAlumnos : seccCfg;

  if(currentRol === 'profesor' && currentPrivilegios.restringir) {
    const asig = currentPrivilegios.asignaciones || {};
    if(grado && grado !== 'TODOS') {
      const seccsAsig = asig[grado] || [];
      if(seccsAsig.length) secciones = secciones.filter(s => seccsAsig.includes(s));
    } else {
      const todasPermitidas = new Set();
      Object.values(asig).forEach(seccs => seccs.forEach(s => todasPermitidas.add(s)));
      if(todasPermitidas.size) secciones = secciones.filter(s => todasPermitidas.has(s));
    }
  }
  el.innerHTML = `<option value="" disabled selected>-- Sección --</option><option value="TODOS">Todas</option>`;
  secciones.forEach(s => { el.innerHTML += `<option value="${s}">${s}</option>`; });
}

async function onNivelChangeAlumnos() {
  document.getElementById('fa-grado').value   = '';
  document.getElementById('fa-seccion').value = '';
  document.getElementById('search-alumnos').value = '';
  _disableSelect('fa-seccion');
  const nivel = document.getElementById('fa-nivel').value;
  if(nivel && nivel !== 'TODOS') {
    await poblarFiltroGrado('fa-grado', nivel);
    _enableSelect('fa-grado');
  } else if(nivel === 'TODOS') {
    await poblarFiltroGrado('fa-grado', null);
    _enableSelect('fa-grado');
  } else {
    _disableSelect('fa-grado');
  }
  await poblarFiltroSeccion('fa-seccion', null);
  if(nivel) _enableSelect('fa-seccion');
  else _disableSelect('fa-seccion');
  renderAlumnos();
}

async function onGradoChangeAlumnos() {
  document.getElementById('fa-seccion').value = '';
  document.getElementById('search-alumnos').value = '';
  const grado = document.getElementById('fa-grado').value;
  const seccionPrevia = document.getElementById('fa-seccion').value;
  if(grado && grado !== 'TODOS') {
    // Auto-detectar nivel
    const cfg = await getConfig();
    for(const [niv, lista] of Object.entries(cfg.grados || {})) {
      if(lista.includes(grado)) { document.getElementById('fa-nivel').value = niv; break; }
    }
    await poblarFiltroSeccion('fa-seccion', grado);
    _enableSelect('fa-seccion');
  } else {
    const nivel = document.getElementById('fa-nivel').value;
    const alumnos = await DB.getAlumnos();
    const secs = [...new Set(alumnos
      .filter(a => !nivel || nivel === 'TODOS' || a.turno === nivel)
      .map(a => a.seccion)
    )].sort();
    const el = document.getElementById('fa-seccion');
    el.innerHTML = '<option value="" disabled selected>-- Sección --</option><option value="TODOS">Todas</option>';
    secs.forEach(s => { el.innerHTML += `<option value="${s}">${s}</option>`; });
    _disableSelect('fa-seccion');
  }
  // Restaurar sección previa si sigue válida
  if(seccionPrevia) {
    const elSec = document.getElementById('fa-seccion');
    const existe = [...elSec.options].some(o => o.value === seccionPrevia);
    if(existe) { elSec.value = seccionPrevia; }
  }
  if(grado && grado !== 'TODOS') _enableSelect('fa-seccion');
  renderAlumnos();
}

function onSeccionChangeAlumnos() {
  document.getElementById('search-alumnos').value = '';
  renderAlumnos();
}

async function onSearchAlumnos() {
  const q = document.getElementById('search-alumnos').value;
  if(q.trim()) {
    document.getElementById('fa-nivel').value   = '';
    document.getElementById('fa-grado').value   = '';
    document.getElementById('fa-seccion').value = '';
    _disableSelect('fa-grado');
    _disableSelect('fa-seccion');
  } else {
    _enableSelect('fa-grado');
  }
  renderAlumnos();
}

// Cargar imágenes del banner al abrir configuración
async function onShowConfig() {
  await cargarConfigBanner();
}

async function inicializarFiltros() {
  await poblarFiltroNivel('fa-nivel', 'onNivelChangeAlumnos');
  await poblarFiltroGrado('fa-grado', null);
  await poblarFiltroSeccion('fa-seccion', null);
  await poblarFiltroNivel('filter-nivel', 'onNivelChangeRegistro');
  await poblarFiltroGrado('filter-grado', null);
  await poblarFiltroSeccion('filter-seccion', null);
  // Grado y sección deshabilitados hasta que se seleccione nivel
  if(typeof _disableSelect === 'function') {
    _disableSelect('filter-grado');
    _disableSelect('filter-seccion');
    _disableSelect('fa-grado');
    _disableSelect('fa-seccion');
  }
}

// ============================================================
// CONFIGURACIÓN — Firestore collection: 'config'
// ============================================================

// Config defaults
const CONFIG_DEFAULTS = {
  nombreColegio: COLEGIO_NOMBRE,
  anio: '2026',
  niveles: [
    { nombre: 'Inicial',    horaApertura: '07:00', horaLimite: '08:00', horaCorte: '10:30', horaSalida: '13:00' },
    { nombre: 'Primaria',   horaApertura: '07:00', horaLimite: '08:00', horaCorte: '10:30', horaSalida: '13:00' },
    { nombre: 'Secundaria', horaApertura: '06:30', horaLimite: '07:45', horaCorte: '10:00', horaSalida: '13:00' },
  ],
  grados: {
    'Inicial':    ['3 años','4 años','5 años'],
    'Primaria':   ['1er','2do','3er','4to','5to','6to'],
    'Secundaria': ['7mo','8vo','9no','10mo','11mo'],
  },
  secciones: ['A','B','C','D'],
};

let configCache = null;

async function getConfig() {
  if(configCache) return configCache;
  // Intentar desde localStorage
  const lsConfig = LSC.get('config');
  if(lsConfig) { configCache = lsConfig; _aplicarConfigColegio(configCache); return configCache; }
  try {
    const doc = await db.collection('config').doc('general').get();
    configCache = doc.exists ? { ...CONFIG_DEFAULTS, ...doc.data() } : { ...CONFIG_DEFAULTS };
    LSC.set('config', configCache, LSC.TTL_CONFIG);
  } catch(e) {
    configCache = { ...CONFIG_DEFAULTS };
  }
  _aplicarConfigColegio(configCache);
  return configCache;
}

function invalidateConfig() {
  configCache = null;
  LSC.del('config');
}

let _alumnosTsUnsubscribe = null;
function iniciarAlumnosListener() {
  if(_alumnosTsUnsubscribe) return; // ya activo
  let _primerFire = true; // ignorar el disparo inicial (solo refleja estado actual, no un cambio real)
  // Observa solo el documento de versión (1 lectura por cambio, no 1,300)
  _alumnosTsUnsubscribe = db.collection('config').doc('alumnos_ts')
    .onSnapshot(snap => {
      if(_primerFire) { _primerFire = false; return; } // skip estado inicial
      if(!snap.exists) return;
      // Invalidar cache local — el próximo getAlumnos() recargará desde Firestore
      DB.invalidarAlumnos();
      // Si el tab alumnos está visible, re-renderizar automáticamente
      const secAlumnos = document.getElementById('sec-alumnos');
      if(secAlumnos && secAlumnos.style.display !== 'none' && secAlumnos.style.display !== '') {
        renderAlumnos();
      }
    }, err => {
      console.warn('[Alumnos] listener error:', err);
    });
}

let _configUnsubscribe = null;
function iniciarConfigListener() {
  if(_configUnsubscribe) return; // ya activo
  let _primerFire = true; // ignorar el disparo inicial
  _configUnsubscribe = db.collection('config').doc('general')
    .onSnapshot(snap => {
      if(_primerFire) { _primerFire = false; return; } // skip estado inicial
      if(!snap.exists) return;
      // Invalidar cache local — fuerza re-fetch desde Firestore en próximo getConfig()
      configCache = null;
      LSC.del('config');
      // Si el tab config está visible, re-renderizar para reflejar los cambios
      const secConfig = document.getElementById('sec-config');
      if(secConfig && secConfig.style.display !== 'none' && secConfig.style.display !== '') {
        renderConfig();
      }
    }, err => {
      console.warn('[Config] listener error:', err);
    });
}

async function getLimiteByNivel(nivel) {
  const cfg = await getConfig();
  const n = (cfg.niveles||[]).find(x => x.nombre === nivel);
  return n ? n.horaLimite : '08:00';
}

async function getHorarioByNivel(nivel) {
  const cfg = await getConfig();
  const n = (cfg.niveles||[]).find(x => x.nombre === nivel);
  return {
    horaApertura: n?.horaApertura || '07:00',
    horaLimite:   n?.horaLimite   || '08:00',
    horaCorte:    n?.horaCorte    || '10:30',
    horaSalida:   n?.horaSalida   || '13:00',
  };
}

function abrirConfigAvanzada() {
  document.getElementById('cfg-adv-pass-input').value = '';
  document.getElementById('cfg-adv-pass-err').style.display = 'none';
  document.getElementById('modal-cfg-adv-pass').style.display = 'flex';
  setTimeout(() => document.getElementById('cfg-adv-pass-input').focus(), 100);
}

function verificarPassCfgAdv() {
  const pass = document.getElementById('cfg-adv-pass-input').value;
  if(pass === 'Chapica2010') {
    document.getElementById('modal-cfg-adv-pass').style.display = 'none';
    document.getElementById('panel-cfg-avanzada').style.display = 'block';
    document.getElementById('panel-cfg-avanzada').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.getElementById('cfg-adv-pass-err').style.display = 'block';
    document.getElementById('cfg-adv-pass-input').value = '';
    document.getElementById('cfg-adv-pass-input').focus();
  }
}

function cerrarConfigAvanzada() {
  document.getElementById('panel-cfg-avanzada').style.display = 'none';
}

async function renderConfig() {
  const cfg = await getConfig();

  // Info colegio — encabezado visible en sección configuración
  const schLogo   = document.getElementById('cfg-school-logo');
  const schNombre = document.getElementById('cfg-school-nombre');
  const schEslogan= document.getElementById('cfg-school-eslogan');
  const schAnio   = document.getElementById('cfg-school-anio');
  if(schLogo)    schLogo.src          = COLEGIO_LOGO;
  if(schNombre)  schNombre.textContent = COLEGIO_NOMBRE;
  if(schEslogan) schEslogan.textContent= COLEGIO_ESLOGAN || '';
  if(schAnio)    schAnio.textContent   = COLEGIO_ANIO;

  // Niveles y horarios
  const nivelesEl = document.getElementById('cfg-niveles-list');
  nivelesEl.innerHTML = (cfg.niveles||[]).map((n,i) => `
    <div style="margin-bottom:16px;padding:12px 14px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.07);">
      <div style="font-weight:700;font-size:0.95rem;margin-bottom:10px;color:var(--accent);">${n.nombre}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:130px;margin:0;">
          <label style="font-size:0.72rem;">🟢 Apertura (desde)</label>
          <input type="time" id="cfg-apertura-${i}" value="${n.horaApertura||'07:00'}">
        </div>
        <div class="form-group" style="flex:1;min-width:130px;margin:0;">
          <label style="font-size:0.72rem;">⚠️ Límite puntualidad</label>
          <input type="time" id="cfg-hora-${i}" value="${n.horaLimite||'08:00'}">
        </div>
        <div class="form-group" style="flex:1;min-width:130px;margin:0;">
          <label style="font-size:0.72rem;">🔴 Corte ingreso (hasta)</label>
          <input type="time" id="cfg-corte-${i}" value="${n.horaCorte||'10:30'}">
        </div>
        <div class="form-group" style="flex:1;min-width:130px;margin:0;">
          <label style="font-size:0.72rem;">🚪 Salida (desde)</label>
          <input type="time" id="cfg-salida-${i}" value="${n.horaSalida||'13:00'}">
        </div>
      </div>
    </div>
  `).join('');

  // Grados
  const gradosEl = document.getElementById('cfg-grados-list');
  gradosEl.innerHTML = (cfg.niveles||[]).map((n,i) => {
    const grados = (cfg.grados||{})[n.nombre] || [];
    return `
      <div style="margin-bottom:14px;">
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:6px;">${n.nombre}</div>
        <input type="text" id="cfg-grados-${i}" value="${grados.join(', ')}" placeholder="1°, 2°, 3°" style="width:100%;box-sizing:border-box;">
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">Separados por coma</div>
      </div>
    `;
  }).join('');

  // Secciones
  document.getElementById('cfg-secciones').value = (cfg.secciones||[]).join(', ');
}

// ── Imágenes del banner ──
var _bannerImgs = []; // array de {url, nombre} max 5

async function cargarConfigBanner() {
  try {
    const cfg = await getConfig();
    _bannerImgs = cfg.bannerImagenes || [];
    renderBannerImgsGrid();
    // Aplicar al banner de login si hay imágenes
    if(_bannerImgs.length > 0) aplicarImagenesBanner();
  } catch(e) {}
}

function renderBannerImgsGrid() {
  const grid = document.getElementById('banner-imgs-grid');
  if(!grid) return;
  const slots = 5;
  let html = '';
  for(let i = 0; i < slots; i++) {
    const img = _bannerImgs[i];
    html += `<div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid var(--border);position:relative;background:var(--surface2);display:flex;align-items:center;justify-content:center;">
      ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;">
        <button onclick="eliminarBannerImg(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;border-radius:50%;width:20px;height:20px;color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>`
      : `<span style="font-size:1.5rem;opacity:0.3;">${i+1}</span>`}
    </div>`;
  }
  grid.innerHTML = html;
}

function eliminarBannerImg(idx) {
  _bannerImgs.splice(idx, 1);
  renderBannerImgsGrid();
  document.getElementById('banner-imgs-status').textContent = 'Sin guardar — presiona Guardar';
}

function cargarImagenesBanner(input) {
  const files = Array.from(input.files).slice(0, 5 - _bannerImgs.length);
  if(!files.length) return;
  const status = document.getElementById('banner-imgs-status');
  status.textContent = 'Procesando...';
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e) {
      // Redimensionar a max 1200px para no exceder límite Firestore
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        _bannerImgs.push(dataUrl);
        if(_bannerImgs.length > 5) _bannerImgs = _bannerImgs.slice(0,5);
        loaded++;
        if(loaded === files.length) {
          renderBannerImgsGrid();
          status.textContent = loaded + ' imagen(es) lista(s) — presiona Guardar';
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

async function guardarImagenesBanner() {
  const status = document.getElementById('banner-imgs-status');
  status.textContent = 'Guardando...';
  try {
    await db.collection('config').doc('general').set(
      { bannerImagenes: _bannerImgs },
      { merge: true }
    );
    LSC.del('config'); // invalidar caché
    _configCache = null;
    aplicarImagenesBanner();
    status.textContent = '✅ Guardado';
    setTimeout(() => { status.textContent = ''; }, 3000);
    toast('Imágenes del banner guardadas','success');
  } catch(e) {
    status.textContent = '❌ Error: ' + e.message;
    toast('Error al guardar','error');
  }
}

var _bannerImgsDefault = ["img/banner-default-1.jpg", "img/banner-default-2.jpg", "img/banner-default-3.jpg", "img/banner-default-4.jpg", "img/banner-default-5.jpg"];

function aplicarImagenesBanner() {
  var imgs = _bannerImgs.length ? _bannerImgs : _bannerImgsDefault;
  if(!imgs.length) return;
  _bannerImgs = imgs;
  // Mostrar solo los slides que tienen imagen, ocultar el resto
  for(var i = 0; i < 5; i++) {
    var slide = document.getElementById('bslide-' + i);
    if(!slide) continue;
    if(i < imgs.length) {
      var imgDiv = slide.querySelector('.banner-img');
      if(imgDiv) { imgDiv.style.backgroundImage = 'url(' + imgs[i] + ')'; imgDiv.style.backgroundSize = 'cover'; imgDiv.style.backgroundPosition = 'center'; }
      slide.style.display = '';
    } else {
      slide.style.display = 'none';
    }
  }
  // Actualizar total de dots y slides activos
  _bannerTotal = imgs.length;
  // Actualizar dots
  var dots = document.querySelectorAll('.b-dot');
  dots.forEach(function(d, i) {
    d.style.display = i < _bannerTotal ? '' : 'none';
  });
  // Resetear al primer slide
  _bannerCurrent = 0;
  var firstSlide = document.getElementById('bslide-0');
  if(firstSlide) {
    document.querySelectorAll('.banner-slide').forEach(function(s){ s.classList.remove('active'); });
    firstSlide.classList.add('active');
    dots[0] && dots[0].classList.add('active');
  }
}

// ── Insignia del colegio ──
function previsualizarLogo(input) {
  const file = input.files[0];
  if(!file) return;
  const MAX = 300 * 1024; // 300 KB
  if(file.size > MAX) { toast('La imagen supera 300 KB. Reduce el tamaño.','warning'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const src = e.target.result;
    const prev = document.getElementById('cfg-logo-preview');
    const ph   = document.getElementById('cfg-logo-placeholder');
    if(prev) { prev.src = src; prev.style.display = 'block'; }
    if(ph)   ph.style.display = 'none';
    document.getElementById('cfg-logo-status').textContent = '✔ Imagen lista para guardar';
  };
  reader.readAsDataURL(file);
}

async function guardarLogo() {
  toast('Para cambiar la insignia: reemplaza el archivo img/logo-colegio.png y actualiza COLEGIO_LOGO en el código','info');
}
async function eliminarLogo() {
  toast('Para cambiar la insignia: reemplaza el archivo img/logo-colegio.png','info');
}
async function guardarInfoColegio() {
  toast('Para cambiar nombre o eslogan: edita COLEGIO_NOMBRE y COLEGIO_ESLOGAN en el código','info');
}

async function guardarHorarios() {
  const cfg = await getConfig();
  const niveles = (cfg.niveles||[]).map((n,i) => {
    const apertura = document.getElementById('cfg-apertura-'+i)?.value || '07:00';
    const limite   = document.getElementById('cfg-hora-'+i)?.value    || '08:00';
    const corte    = document.getElementById('cfg-corte-'+i)?.value   || '10:30';
    const salida   = document.getElementById('cfg-salida-'+i)?.value  || '13:00';
    const toMin = s => { const [h,m] = (s||'00:00').split(':').map(Number); return h*60+m; };
    if(toMin(apertura) >= toMin(limite)) { toast(`${n.nombre}: La apertura debe ser antes del límite de puntualidad`, 'warning'); return null; }
    if(toMin(limite) >= toMin(corte))    { toast(`${n.nombre}: El límite de puntualidad debe ser antes del corte de ingreso`, 'warning'); return null; }
    if(toMin(corte) >= toMin(salida))    { toast(`${n.nombre}: El corte de ingreso debe ser antes de la hora de salida`, 'warning'); return null; }
    return { nombre: n.nombre, horaApertura: apertura, horaLimite: limite, horaCorte: corte, horaSalida: salida };
  });
  if(niveles.some(x => x === null)) return;
  try {
    await db.collection('config').doc('general').set({ niveles }, { merge: true });
    invalidateConfig();
    toast('Horarios guardados','success');
  } catch(e) { toast('Error al guardar','error'); }
}

async function guardarGrados() {
  const cfg = await getConfig();
  const grados = {};
  (cfg.niveles||[]).forEach((n,i) => {
    const val = document.getElementById('cfg-grados-'+i)?.value || '';
    grados[n.nombre] = val.split(',').map(x => x.trim()).filter(Boolean);
  });
  try {
    await db.collection('config').doc('general').set({ grados }, { merge: true });
    invalidateConfig();
    // Update filter combos
    await actualizarFiltrosGrado();
    toast('Grados guardados','success');
  } catch(e) { toast('Error al guardar','error'); }
}

async function guardarSecciones() {
  const val = document.getElementById('cfg-secciones').value;
  const secciones = val.split(',').map(x => x.trim()).filter(Boolean);
  if(!secciones.length){ toast('Ingresa al menos una sección','warning'); return; }
  try {
    await db.collection('config').doc('general').set({ secciones }, { merge: true });
    invalidateConfig();
    await actualizarFiltrosSeccion();
    toast('Secciones guardadas','success');
  } catch(e) { toast('Error al guardar','error'); }
}

// Cargar grados en el formulario de alumno según nivel seleccionado
async function cargarGradosPorNivel(nivelParam) {
  const nivel = (typeof nivelParam === 'string') ? nivelParam : document.getElementById('f-turno').value;
  const gradoSel = document.getElementById('f-grado');
  gradoSel.innerHTML = '<option value="">Seleccionar</option>';
  if(!nivel) { _disableSelect('f-grado'); _disableSelect('f-seccion'); return; }
  _enableSelect('f-grado');
  const cfg = await getConfig();
  const gradosMap = cfg.grados || {};
  const nivelNorm = String(nivel || '').trim().toLowerCase();
  let grados = gradosMap[nivel] || gradosMap[String(nivel || '').trim()] || [];
  if(!grados.length) {
    const k = Object.keys(gradosMap).find(x => String(x||'').trim().toLowerCase() === nivelNorm);
    if(k) grados = gradosMap[k] || [];
  }
  grados.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    gradoSel.appendChild(opt);
  });
  if(!grados.length) toast('No hay grados configurados para este nivel','warning');
  await cargarSeccionesPorGrado();
  _enableSelect('f-seccion');
}

async function cargarSeccionesPorGrado() {
  const seccionSel = document.getElementById('f-seccion');
  if(!seccionSel) return;
  const cfg = await getConfig();
  const secciones = cfg.secciones || ['A','B','C','D'];
  seccionSel.innerHTML = '<option value="">Seleccionar</option>';
  secciones.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    seccionSel.appendChild(opt);
  });
}

// Cargar niveles, grados y secciones en todos los selects del sistema
async function actualizarTodosLosFiltros() {
  const cfg = await getConfig();
  const niveles = (cfg.niveles||[]).map(n => n.nombre);
  const secciones = cfg.secciones || ['A','B','C','D'];
  const todosGrados = [...new Set(Object.values(cfg.grados||{}).flat())];

  // Helper to rebuild select
  function rebuildSelect(id, opciones, addTodos=true) {
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="" disabled selected>-- ${el.closest('.form-group')?.querySelector('label')?.textContent||''} --</option>`;
    if(addTodos) el.innerHTML += `<option value="TODOS">Todos</option>`;
    opciones.forEach(o => { el.innerHTML += `<option value="${o}">${o}</option>`; });
    if(cur) el.value = cur;
  }

  // Filtros alumnos
  rebuildSelect('fa-nivel', niveles);
  rebuildSelect('fa-seccion', secciones);
  rebuildSelect('fa-grado', todosGrados);

  // Filtros registro
  rebuildSelect('filter-nivel', niveles);
  rebuildSelect('filter-seccion', secciones);
  rebuildSelect('filter-grado', todosGrados);

  // Modal alumno — nivel
  const fTurno = document.getElementById('f-turno');
  if(fTurno) {
    fTurno.innerHTML = '<option value="">Seleccionar</option>';
    niveles.forEach(n => { fTurno.innerHTML += `<option value="${n}">${n}</option>`; });
  }

  // Modal alumno — secciones
  const fSeccion = document.getElementById('f-seccion');
  if(fSeccion) {
    fSeccion.innerHTML = '<option value="">Seleccionar</option>';
    secciones.forEach(s => { fSeccion.innerHTML += `<option value="${s}">${s}</option>`; });
  }
}

async function actualizarFiltrosGrado() {
  const cfg = await getConfig();
  const todosGrados = [...new Set(Object.values(cfg.grados||{}).flat())];
  ['fa-grado','filter-grado'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = `<option value="" disabled selected>-- Grado --</option><option value="TODOS">Todos los grados</option>`;
    todosGrados.forEach(g => { el.innerHTML += `<option value="${g}">${g}</option>`; });
  });
}

async function actualizarFiltrosSeccion() {
  const cfg = await getConfig();
  const secciones = cfg.secciones || ['A','B','C','D'];
  ['fa-seccion','filter-seccion','f-seccion'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const addTodos = id.startsWith('fa-') || id.startsWith('filter-');
    el.innerHTML = addTodos
      ? `<option value="" disabled selected>-- Sección --</option><option value="TODOS">Todas</option>`
      : `<option value="">Seleccionar</option>`;
    secciones.forEach(s => { el.innerHTML += `<option value="${s}">${s}</option>`; });
  });
}


// ============================================================
// INCIDENTES
// ============================================================

// jsPDF via CDN — loaded dynamically
function cargarJsPDF() {
  return new Promise((resolve) => {
    if(window.jspdf) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

// ── Logo en base64 cacheado (se carga una sola vez) ──────────────────────────
let _logoB64 = null;
async function cargarLogoBase64() {
  if(_logoB64) return _logoB64;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      try { _logoB64 = c.toDataURL('image/png'); resolve(_logoB64); }
      catch(e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = COLEGIO_LOGO;
  });
}

// ── Encabezado institucional estándar para todos los PDFs ────────────────────
// Dibuja logo + nombre del colegio + eslogan + tipo de documento.
// Solo hay que cambiar COLEGIO_NOMBRE, COLEGIO_ESLOGAN y COLEGIO_LOGO
// para que el cambio se refleje en todos los reportes automáticamente.
// Retorna el Y donde empieza el contenido del PDF.
function pdfHeaderColegio(doc, W, logoB64, {
  bgColor     = [13, 26, 58],    // azul marino por defecto
  accentColor = [201, 168, 76],  // dorado por defecto
  subtitulo   = '',              // tipo de reporte (esquina derecha)
  infoExtra   = '',              // info secundaria (esquina derecha, debajo)
} = {}) {
  const H = 30;
  doc.setFillColor(...bgColor);
  doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...accentColor);
  doc.rect(0, H, W, 0.8, 'F');

  // Logo a la izquierda
  const LH = 22, LW = 22, LX = 7, LY = (H - LH) / 2;
  if(logoB64) {
    try { doc.addImage(logoB64, 'PNG', LX, LY, LW, LH); } catch(e) {}
  }
  const TX = logoB64 ? LX + LW + 5 : 10;

  // Nombre del colegio: separa prefijo del nombre propio
  const mC = COLEGIO_NOMBRE.match(/^(Institución Educativa|I\.E\.P?\.?)\s+(.+)$/i);
  const tipoColegio = mC ? mC[1].toUpperCase() : '';
  const nomColegio  = mC ? mC[2] : COLEGIO_NOMBRE;
  if(tipoColegio) {
    doc.setTextColor(148,163,184); doc.setFontSize(6); doc.setFont('helvetica','normal');
    doc.text(tipoColegio, TX, LY + 5);
  }
  doc.setTextColor(226,232,240); doc.setFontSize(9.5); doc.setFont('helvetica','bold');
  const nomLines = doc.splitTextToSize(nomColegio, W - TX - (subtitulo ? 55 : 10));
  doc.text(nomLines[0], TX, LY + (tipoColegio ? 12 : 10));

  // Eslogan
  if(COLEGIO_ESLOGAN) {
    doc.setTextColor(...accentColor); doc.setFontSize(6.5); doc.setFont('helvetica','italic');
    doc.text(COLEGIO_ESLOGAN, TX, LY + 21);
  }

  // Tipo de documento (derecha superior)
  if(subtitulo) {
    doc.setTextColor(226,232,240); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(subtitulo, W - 8, LY + 10, { align: 'right' });
  }
  // Info secundaria (derecha inferior)
  if(infoExtra) {
    doc.setTextColor(148,163,184); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
    doc.text(infoExtra, W - 8, LY + 20, { align: 'right' });
  }
  return H + 3; // Y donde empieza el contenido
}

let incAlumnoSeleccionado = null;


async function getCargoUsuario(uid) {
  try {
    // Usar cache de usuarios si está disponible — sin lectura extra a Firestore
    if(_usuariosCacheData) {
      const u = _usuariosCacheData.find(x => x.uid === uid);
      return u ? (u.cargo || '') : '';
    }
    // Fallback: cargar cache completo y buscar
    const usuarios = await _cargarUsuariosCache();
    const u = usuarios.find(x => x.uid === uid);
    return u ? (u.cargo || '') : '';
  } catch(e) { return ''; }
}

function limpiarFiltroFechaInc() {
  const f = document.getElementById('inc-filter-fecha');
  if(f && document.getElementById('inc-filter-search').value) f.value = '';
}
function limpiarFiltroAlumnoInc() {
  const s = document.getElementById('inc-filter-search');
  if(s && document.getElementById('inc-filter-fecha').value) s.value = '';
}
function limpiarFiltrosIncidentes() {
  document.getElementById('inc-filter-fecha').value = '';
  document.getElementById('inc-filter-search').value = '';
  renderIncidentes();
}
function abrirModalIncidente() {
  incAlumnoSeleccionado = null;
  document.getElementById('inc-buscar').value = '';
  document.getElementById('inc-alumno-resultado').innerHTML = '';
  document.getElementById('inc-alumno-id').value = '';
  document.getElementById('inc-fecha').value = hoy();
  document.getElementById('inc-hora').value = new Date().toTimeString().slice(0,5);
  document.getElementById('inc-tipo').value = '';
  document.getElementById('inc-descripcion').value = '';
  document.getElementById('inc-medidas').value = '';
  document.getElementById('inc-foto-data').value = '';
  document.getElementById('inc-foto-preview').style.display = 'none';
  document.getElementById('inc-foto-grid').innerHTML = '';
  document.getElementById('inc-foto').value = '';
  document.querySelector('input[name="inc-sev"][value="Moderado"]').checked = true;
  const mInc = document.getElementById('modal-incidente'); if(mInc){mInc.style.display='';mInc.classList.add('open');}
}

async function buscarAlumnoIncidente(q) {
  const res = document.getElementById('inc-alumno-resultado');
  if(!q || q.length < 2) { res.innerHTML = ''; return; }
  const alumnos = await DB.getAlumnos();
  const filtrados = alumnos.filter(a =>
    a.id.includes(q) ||
    (a.nombres + ' ' + a.apellidos).toLowerCase().includes(q.toLowerCase())
  ).slice(0, 5);

  if(!filtrados.length) {
    res.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:8px;">No se encontraron alumnos</div>';
    return;
  }
  res.innerHTML = filtrados.map(a => `
    <div onclick="seleccionarAlumnoIncidente('${a.id}')"
      style="padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;margin-bottom:6px;display:flex;align-items:center;gap:10px;"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="font-size:1.2rem;">👤</span>
      <div>
        <div style="font-weight:600;font-size:0.88rem;">${a.nombres} ${a.apellidos}</div>
        <div style="font-size:0.75rem;color:var(--muted);">DNI: ${a.id} · ${a.grado} ${a.seccion} · ${a.turno}</div>
      </div>
    </div>
  `).join('');
}

async function seleccionarAlumnoIncidente(id) {
  const alumnos = await DB.getAlumnos();
  const a = alumnos.find(x => x.id === id);
  if(!a) return;
  incAlumnoSeleccionado = a;
  document.getElementById('inc-alumno-id').value = id;
  document.getElementById('inc-buscar').value = a.nombres + ' ' + a.apellidos;
  document.getElementById('inc-alumno-resultado').innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--accent);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-top:4px;">
      <span style="font-size:1.3rem;">✅</span>
      <div>
        <div style="font-weight:600;font-size:0.88rem;">${a.nombres} ${a.apellidos}</div>
        <div style="font-size:0.75rem;color:var(--muted);">DNI: ${a.id} · ${a.grado} ${a.seccion} · ${a.turno}</div>
      </div>
    </div>
  `;
}

// ── Helpers de imágenes ──────────────────────────────────────────────────────
// Comprime una imagen a JPEG ≤400KB, max 1200px — obligatorio antes de subir
async function comprimirImagen(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1200;
      let w = img.width, h = img.height;
      if(w > MAX_DIM || h > MAX_DIM) {
        if(w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
        else      { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Convierte base64 Data URL a Blob para subir a Storage
function base64ToBlob(base64) {
  const [header, data] = base64.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Descarga una imagen desde URL y la convierte a base64 (para jsPDF en reimprimir)
async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch(e) { return null; }
}

function previewIncFotos(input) {
  const files = Array.from(input.files).slice(0, 4); // máx 4 fotos
  if(!files.length) return;

  const grid    = document.getElementById('inc-foto-grid');
  const preview = document.getElementById('inc-foto-preview');
  const count   = document.getElementById('inc-foto-count');
  grid.innerHTML = '';
  preview.style.display = 'block';
  count.textContent = `Procesando ${files.length} foto${files.length>1?'s':''}...`;

  const fotosData = new Array(files.length);
  let loaded = 0;

  files.forEach((file, i) => {
    comprimirImagen(file).then(blob => {
      const reader = new FileReader();
      reader.onload = e => {
        fotosData[i] = e.target.result;
        loaded++;
        // Preview
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;';
        const imgEl = document.createElement('img');
        imgEl.src = e.target.result;
        imgEl.style.cssText = 'width:100%;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);';
        const badge = document.createElement('span');
        badge.textContent = `Foto ${i+1}`;
        badge.style.cssText = 'position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.55);color:#fff;font-size:0.7rem;padding:2px 6px;border-radius:4px;';
        wrap.appendChild(imgEl);
        wrap.appendChild(badge);
        grid.appendChild(wrap);
        if(loaded === files.length) {
          // Mostrar tamaño total comprimido
          const totalKB = Math.round(fotosData.reduce((s,f) => s + f.length * 0.75, 0) / 1024);
          count.textContent = `${files.length} foto${files.length>1?'s':''} · ~${totalKB} KB comprimido`;
          document.getElementById('inc-foto-data').value = JSON.stringify(fotosData);
        }
      };
      reader.readAsDataURL(blob);
    });
  });
}

async function guardarIncidente() {
  const alumnoId = document.getElementById('inc-alumno-id').value;
  if(!alumnoId || !incAlumnoSeleccionado) { toast('Selecciona un alumno','warning'); return; }
  const tipo = document.getElementById('inc-tipo').value;
  if(!tipo) { toast('Selecciona el tipo de incidente','warning'); return; }
  const descripcion = document.getElementById('inc-descripcion').value.trim();
  if(!descripcion) { toast('Escribe la descripción del incidente','warning'); return; }

  // Deshabilitar botón para evitar doble clic
  const btnGuardar = document.querySelector('#modal-incidente .btn-primary');
  if(btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = '⏳ Guardando...'; }
  const reactivarBtn = () => {
    if(btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerHTML = '🖨️ Guardar y Generar PDF'; }
  };

  const severidad = document.querySelector('input[name="inc-sev"]:checked').value;
  const fecha = document.getElementById('inc-fecha').value;
  const hora = document.getElementById('inc-hora').value;
  const medidas = document.getElementById('inc-medidas').value.trim();
  const fotoDataRaw = document.getElementById('inc-foto-data').value;
  let fotoData = null;
  if(fotoDataRaw) {
    try { fotoData = JSON.parse(fotoDataRaw); } // array de fotos
    catch(e) { fotoData = [fotoDataRaw]; }       // legacy: una sola foto
  }
  const a = incAlumnoSeleccionado;
  const alumnoData = incAlumnoSeleccionado;

  // PDF en Storage: staff puede verlo 365 días, apoderado 7 días (link WhatsApp)
  const _expStaff = new Date(); _expStaff.setDate(_expStaff.getDate() + 365);
  const _expApo   = new Date(); _expApo.setDate(_expApo.getDate() + 7);
  const tieneImg = !!(fotoData && fotoData.length);

  const incidente = {
    alumnoId: a.id,
    alumnoNombre: a.nombres + ' ' + a.apellidos,
    grado: a.grado, seccion: a.seccion, turno: a.turno,
    tipo, severidad, fecha, hora, descripcion, medidas,
    // Metadatos del PDF con fotos embebidas (un solo archivo en Storage)
    tieneImagenes: tieneImg,
    cantImagenes: tieneImg ? fotoData.length : 0,
    pdfUrl: null,              // URL pública (para WhatsApp y reimprimir)
    pdfRef: null,              // ruta en Storage (para borrar al eliminar)
    pdfExpiraStaff: _expStaff.toISOString().slice(0, 10),  // 365 días
    pdfExpiraApoderado: _expApo.toISOString().slice(0, 10), // 7 días
    pdfActivo: false,          // true tras subir el PDF a Storage
    responsableId: currentUser.uid,
    responsableNombre: document.getElementById('user-name-display').textContent,
    responsableCargo: await getCargoUsuario(currentUser.uid),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    // 1. Guardar en Firestore → obtener ID del documento
    const docRef = await db.collection('incidentes').add(incidente);
    _invalidarIncidentes();
    toast('Reporte guardado','success');
    reactivarBtn();
    closeModal('modal-incidente');
    renderIncidentes();

    // 2. Mostrar botón de llamada INMEDIATAMENTE en móvil
    if(alumnoData?.telefono && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      mostrarBotonLlamada(
        alumnoData.telefono,
        (alumnoData.apoderadoNombres||'') + ' ' + (alumnoData.apoderadoApellidos||''),
        alumnoData.telefono2||'',
        (alumnoData.apoderado2Nombres||'') + ' ' + (alumnoData.apoderado2Apellidos||'')
      );
    }

    // 3. Generar imagen JPEG y subir a Supabase Storage
    let imgLinkApo = null;
    try {
      const blob = await generarImagenIncidente(incidente, fotoData);
      if (blob && window._sbStorage) {
        const path = `${window.COLEGIO_ID}/${docRef.id}/reporte.jpg`;
        await _sbStorage.upload('incidentes', path, blob, 'image/jpeg');
        imgLinkApo         = await _sbStorage.signedUrl('incidentes', path,   7 * 24 * 3600);
        const imgLinkStaff = await _sbStorage.signedUrl('incidentes', path, 365 * 24 * 3600);
        await docRef.update({ pdfUrl: imgLinkStaff, pdfRef: path, pdfActivo: true });
        _invalidarIncidentes();
      }
    } catch(eImg) { console.warn('[incidente] Error generando/subiendo imagen:', eImg); }

    // 4. Enviar WhatsApp — imagen del reporte directamente en el chat
    if(alumnoData?.telefono) {
      const enc = _waEncabezado();
      const pie = _waPie();
      const sevEmoji = incidente.severidad === 'Grave' ? '🔴' : incidente.severidad === 'Moderado' ? '🟡' : '🟢';
      const nombre1 = ((alumnoData.apoderadoNombres||'') + ' ' + (alumnoData.apoderadoApellidos||'')).trim() || 'Apoderado';
      const nombre2 = alumnoData.telefono2 ? (((alumnoData.apoderado2Nombres||'') + ' ' + (alumnoData.apoderado2Apellidos||'')).trim() || 'Apoderado 2') : '';
      const contactos = alumnoData.telefono2
        ? `👨‍👩‍👧 *Apoderados notificados:*\n• ${nombre1}: ${alumnoData.telefono}\n• ${nombre2}: ${alumnoData.telefono2}`
        : `👤 *Apoderado notificado:* ${nombre1}: ${alumnoData.telefono}`;
      const msg = `🚨 *REPORTE DE INCIDENCIA*\n${enc}\n\n👤 *Alumno:* ${incidente.alumnoNombre}\n🏫 *Grado:* ${incidente.grado} ${incidente.seccion} — ${incidente.turno}\n📋 *Tipo:* ${incidente.tipo}\n${sevEmoji} *Severidad:* ${incidente.severidad}\n📅 *Fecha:* ${incidente.fecha} ${incidente.hora}\n\n📝 El colegio ha registrado un incidente con su hijo/a. Por favor comuníquese con la institución a la brevedad.\n\n${contactos}\n📞 Para más información contacte a la dirección del colegio.${pie}`;
      const enviado = await sendWhatsApp(alumnoData.telefono, msg, imgLinkApo);
      if(alumnoData.telefono2) sendWhatsApp(alumnoData.telefono2, msg, imgLinkApo);
      if(enviado) toast('✅ WhatsApp enviado al apoderado' + (alumnoData.telefono2 ? 's' : '') + (imgLinkApo ? ' con imagen ✅' : ''), 'success');
      else toast('⚠️ WhatsApp no pudo enviarse — revisa la configuración de Factiliza','warning');
    }
  } catch(e) { reactivarBtn(); toast('Error al guardar: ' + e.message, 'error'); }
}

function mostrarBotonLlamada(telefono, nombreApoderado, telefono2, nombreApoderado2) {
  // Limpiar número
  let num = telefono.replace(/[^0-9]/g, '');
  if(num.length === 9) num = '51' + num;

  // Segundo apoderado
  const tieneApo2 = telefono2 && telefono2.trim();
  let num2 = '';
  if(tieneApo2) {
    num2 = telefono2.replace(/[^0-9]/g, '');
    if(num2.length === 9) num2 = '51' + num2;
  }

  // Eliminar modal anterior si existe
  const existing = document.getElementById('modal-llamada');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-llamada';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:20px;padding:28px 24px;max-width:320px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <div style="font-size:2.5rem;margin-bottom:8px;">📞</div>
      <div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:16px;">Llamar al apoderado</div>

      <!-- Apoderado 1 -->
      <div style="margin-bottom:${tieneApo2 ? '12px' : '20px'};">
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:3px;">${nombreApoderado || 'Apoderado 1'}</div>
        <div style="font-size:1rem;font-weight:700;color:var(--accent);margin-bottom:8px;letter-spacing:1px;">${telefono}</div>
        <a href="tel:+${num}" style="display:block;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;text-decoration:none;border-radius:12px;padding:12px;font-size:0.95rem;font-weight:700;" onclick="document.getElementById('modal-llamada').remove()">
          📞 Llamar
        </a>
      </div>

      <!-- Apoderado 2 (si existe) -->
      ${tieneApo2 ? `
      <div style="margin-bottom:20px;padding-top:12px;border-top:1px solid var(--border);">
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:3px;">${nombreApoderado2 || 'Apoderado 2'}</div>
        <div style="font-size:1rem;font-weight:700;color:#f59e0b;margin-bottom:8px;letter-spacing:1px;">${telefono2}</div>
        <a href="tel:+${num2}" style="display:block;background:linear-gradient(135deg,#b45309,#f59e0b);color:#fff;text-decoration:none;border-radius:12px;padding:12px;font-size:0.95rem;font-weight:700;" onclick="document.getElementById('modal-llamada').remove()">
          📞 Llamar
        </a>
      </div>` : ''}

      <button onclick="document.getElementById('modal-llamada').remove()" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px;color:var(--muted);font-size:0.9rem;cursor:pointer;">
        Omitir
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  // Cerrar al tocar el fondo
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

// Cache de incidentes — se carga UNA vez, filtros se aplican en memoria
let _incidentesCacheIdx = null;

async function _cargarIncidentesCache() {
  if(_incidentesCacheIdx) return _incidentesCacheIdx;
  // Intentar desde localStorage
  const lsInc = LSC.get('incidentes');
  if(lsInc) { _incidentesCacheIdx = lsInc; return lsInc; }
  const snap = await db.collection('incidentes').limit(200).get();
  _incidentesCacheIdx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  LSC.set('incidentes', _incidentesCacheIdx, LSC.TTL_INCIDENTES);
  return _incidentesCacheIdx;
}

function _invalidarIncidentes() {
  _incidentesCacheIdx = null;
  LSC.del('incidentes');
}

function poblarSelectorMesInc() {
  const sel = document.getElementById('inc-filter-mes');
  if(!sel || sel.options.length > 1) return;
  const hoy = new Date();
  let opts = '';
  // Admin/director pueden ver hasta 6 meses atrás
  const mesActualNum = new Date().getMonth() + 1;
  const mesesLectivosInc = Math.max(0, mesActualNum - 3 + 1);
  const meses = (currentRol === 'admin' || currentRol === 'director')
    ? mesesLectivosInc
    : Math.min(3, mesesLectivosInc);
  for(let i = 0; i < meses; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('es-PE', { month: 'long' });
    opts += `<option value="${val}">${label.charAt(0).toUpperCase()+label.slice(1)}</option>`;
  }
  sel.innerHTML = opts;
}

async function renderIncidentes() {
  const tbody = document.getElementById('incidentes-tbody');
  const empty = document.getElementById('incidentes-empty');
  if(!tbody) return;
  try {
    // Cargar desde cache — sin nueva consulta a Firestore
    let docs = await _cargarIncidentesCache();

    // Filtro por rol
    if(currentRol === 'profesor' && currentPrivilegios.restringir) {
      docs = docs.filter(d => aplicarFiltroProfesor([{ grado: d.grado, seccion: d.seccion }]).length > 0);
    }
    if(currentRol === 'profesor') {
      docs = docs.filter(d => d.responsableId === currentUser.uid);
    }

    // Filtro por mes seleccionado
    const mesSel = document.getElementById('inc-filter-mes')?.value || hoy().slice(0,7);
    docs = docs.filter(d => (d.fecha||'').startsWith(mesSel));

    // Filtros UI — todo en memoria, sin tocar Firestore
    const fecha = document.getElementById('inc-filter-fecha')?.value;
    const q = (document.getElementById('inc-filter-search')?.value||'').toLowerCase();
    if(fecha) docs = docs.filter(d => d.fecha === fecha);
    if(q) docs = docs.filter(d =>
      (d.alumnoNombre||'').toLowerCase().includes(q) ||
      (d.alumnoId||'').includes(q)
    );

    docs.sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));

    if(!docs.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const sevColors = { Leve: 'green', Moderado: 'yellow', Grave: 'red' };
    const todayStr = hoy();
    tbody.innerHTML = docs.map(d => {
      const pdfVencido = d.pdfExpiraStaff && d.pdfExpiraStaff < todayStr;
      const imgBadge   = d.tieneImagenes
        ? (pdfVencido
            ? `<span title="PDF con fotos vencido el ${d.pdfExpiraStaff}" style="font-size:0.8rem;opacity:0.4;cursor:default;">📷</span>`
            : `<span title="${d.cantImagenes} foto(s) en el PDF" style="font-size:0.8rem;cursor:default;">📷</span>`)
        : '';
      return `
      <tr>
        <td class="ts">${d.fecha}</td>
        <td class="td-id">${d.alumnoId||'-'}</td>
        <td class="td-name">${d.alumnoNombre}</td>
        <td>${d.grado} ${d.seccion}</td>
        <td>${d.tipo} ${imgBadge}</td>
        <td><span class="badge ${sevColors[d.severidad]||'blue'}">${d.severidad}</span></td>
        <td style="font-size:0.82rem;">${d.responsableNombre||'-'}${d.responsableCargo?`<br><span style="color:var(--muted);font-size:0.72rem;">${d.responsableCargo}</span>`:''}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:0.78rem;" onclick="reimprimirIncidente('${d.id}')">🖨️ PDF</button>
          ${currentRol==='admin'||currentRol==='director' ? `<button class="btn btn-danger" style="padding:4px 10px;font-size:0.78rem;" onclick="eliminarIncidente('${d.id}')">✕</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
}

async function eliminarIncidente(id) {
  if(!confirm('¿Eliminar este reporte?')) return;
  const cached = _incidentesCacheIdx || [];
  const inc = cached.find(d => d.id === id);
  await db.collection('incidentes').doc(id).delete();
  // Borrar el PDF de Storage en background
  if(inc?.pdfRef && window._sbStorage) _sbStorage.remove('incidentes', inc.pdfRef).catch(() => {});
  _invalidarIncidentes();
  toast('Reporte eliminado','info');
  renderIncidentes();
}

async function reimprimirIncidente(id) {
  toast('Cargando reporte...','info');
  const snap = await db.collection('incidentes').doc(id).get();
  if(!snap.exists) { toast('Reporte no encontrado','error'); return; }
  const inc = { id, ...snap.data() };

  // Si el PDF con fotos sigue activo en Storage, descargarlo directamente
  const pdfVencido = inc.pdfExpiraStaff && inc.pdfExpiraStaff < hoy();
  if(inc.pdfActivo && !pdfVencido && inc.pdfUrl) {
    // Abrir el PDF guardado en Storage (ya tiene las fotos embebidas)
    window.open(inc.pdfUrl, '_blank');
    return;
  }

  // PDF vencido o sin Storage: regenerar sin fotos
  await generarPDFIncidente({ ...inc, fotoData: null, _descargar: true });
}

async function generarPDFIncidente(inc) {
  await cargarJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = await getConfig();
  const anio = cfg.anio || new Date().getFullYear();
  const W = 210, margin = 20;
  const logoB64 = await cargarLogoBase64();

  // Encabezado institucional estándar (igual que todos los demás PDFs)
  let y = pdfHeaderColegio(doc, W, logoB64, {
    subtitulo: 'Reporte de Incidente',
    infoExtra: 'Año Escolar ' + anio,
  });

  // Datos alumno
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, W - margin*2, 28, 3, 3, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, W - margin*2, 28, 3, 3, 'S');
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('ALUMNO', margin+4, y+6);
  doc.text('DNI', margin+80, y+6);
  doc.text('ID / DNI', margin+80, y+6);
  doc.text('GRADO / SECCIÓN', margin+120, y+6);
  doc.text('NIVEL', margin+155, y+6);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(inc.alumnoNombre||'-', margin+4, y+13);
  doc.text(inc.alumnoId||'-', margin+80, y+13);
  doc.text((inc.grado||'-') + ' — Secc. ' + (inc.seccion||'-'), margin+120, y+13);
  doc.text(inc.turno||'-', margin+155, y+13);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('FECHA', margin+4, y+21);
  doc.text('HORA', margin+60, y+21);
  doc.text('TIPO', margin+100, y+21);
  doc.text('SEVERIDAD', margin+150, y+21);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(inc.fecha||'-', margin+4, y+27);
  doc.text(inc.hora||'-', margin+60, y+27);
  doc.text(inc.tipo||'-', margin+100, y+27);
  const sevColor = inc.severidad==='Grave'?[239,68,68]:inc.severidad==='Moderado'?[245,158,11]:[16,185,129];
  doc.setTextColor(...sevColor);
  doc.setFont('helvetica','bold');
  doc.text(inc.severidad||'-', margin+150, y+27);

  y += 36;

  // Descripción
  doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('DESCRIPCIÓN DEL INCIDENTE', margin, y);
  y += 4;
  doc.setFillColor(248,250,252);
  doc.setDrawColor(226,232,240);
  const descLines = doc.splitTextToSize(inc.descripcion||'-', W - margin*2 - 8);
  const descH = Math.max(20, descLines.length * 5 + 8);
  doc.roundedRect(margin, y, W-margin*2, descH, 2, 2, 'FD');
  doc.setTextColor(51,65,85); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(descLines, margin+4, y+6);
  y += descH + 6;

  // Medidas
  if(inc.medidas) {
    doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.text('MEDIDAS TOMADAS', margin, y);
    y += 4;
    const medLines = doc.splitTextToSize(inc.medidas, W-margin*2-8);
    const medH = Math.max(14, medLines.length * 5 + 8);
    doc.setFillColor(248,250,252); doc.setDrawColor(226,232,240);
    doc.roundedRect(margin, y, W-margin*2, medH, 2, 2, 'FD');
    doc.setTextColor(51,65,85); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(medLines, margin+4, y+6);
    y += medH + 6;
  }

  // Fotos (array de hasta 4)
  let fotosArray = [];
  if(Array.isArray(inc.fotoData)) fotosArray = inc.fotoData.filter(f => f && f.startsWith('data:image'));
  else if(inc.fotoData && inc.fotoData.startsWith && inc.fotoData.startsWith('data:image')) fotosArray = [inc.fotoData];

  if(fotosArray.length > 0) {
    // Verificar espacio — nueva página si no alcanza
    const fotoSecH = 10 + (fotosArray.length <= 2 ? 65 : 130);
    if(y + fotoSecH > 270) { doc.addPage(); y = 20; }

    doc.setTextColor(100,116,139); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.text(`EVIDENCIA FOTOGRÁFICA (${fotosArray.length} foto${fotosArray.length>1?'s':''})`, margin, y);
    y += 5;

    const gap   = 4;
    const cols  = fotosArray.length <= 2 ? fotosArray.length : 2;
    const imgW  = (W - margin*2 - gap*(cols-1)) / cols;
    const imgH  = 58;

    fotosArray.forEach((foto, i) => {
      try {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const fx  = margin + col*(imgW + gap);
        const fy  = y + row*(imgH + gap);
        doc.addImage(foto, 'JPEG', fx, fy, imgW, imgH);
        // Número de foto
        doc.setFillColor(0,0,0);
        doc.rect(fx, fy, 10, 6, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(5.5);
        doc.text(`Foto ${i+1}`, fx+5, fy+4, {align:'center'});
      } catch(e) { console.warn('No se pudo agregar foto ' + (i+1)); }
    });

    const rows = Math.ceil(fotosArray.length / 2);
    y += rows*(imgH + gap) + 4;
  }

  // Firmas
  y = Math.max(y, 230);
  doc.setDrawColor(148,163,184);
  doc.line(margin, y, margin+70, y);
  doc.line(W-margin-70, y, W-margin, y);
  doc.setTextColor(100,116,139); doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(inc.responsableNombre||'Responsable', margin+35, y+5, { align:'center' });
  doc.text('Director(a) / V°B°', W-margin-35, y+5, { align:'center' });
  doc.setFontSize(7);
  const cargoLabel = inc.responsableCargo || 'Responsable';
  doc.text(cargoLabel, margin+35, y+9, { align:'center' });
  doc.text('Firma y sello', W-margin-35, y+9, { align:'center' });

  // Footer
  doc.setFillColor(239,68,68);
  doc.rect(0, 287, W, 10, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7);
  doc.text('Documento generado por AsistenciaQR · ' + new Date().toLocaleString('es-PE'), W/2, 293, { align:'center' });

  const filename = 'incidente_' + (inc.alumnoNombre||'').replace(/\s+/g,'_') + '_' + (inc.fecha||'') + '.pdf';

  // Solo descargar si se llama manualmente (reimprimir), no al guardar automáticamente
  if(inc._descargar) doc.save(filename);

  // Devolver blob para que guardarIncidente() lo suba a Firebase Storage
  return { blob: doc.output('blob'), filename };
}


// ── SUPABASE STORAGE (fallback si compat.js no lo definió) ──
if (!window._sbStorage && window._sb) {
  window._sbStorage = {
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
}

// ============================================================
// GENERAR IMAGEN DE INCIDENTE (html2canvas → JPEG)
// Reemplaza el PDF para envío por WhatsApp y almacenamiento seguro.
// ============================================================
async function generarImagenIncidente(inc, fotoData) {
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const cfg = await getConfig();
  const anio = cfg.anio || new Date().getFullYear();
  const logoB64 = await cargarLogoBase64();

  let fotosArray = [];
  if (Array.isArray(fotoData)) fotosArray = fotoData.filter(f => f && f.startsWith && f.startsWith('data:image'));
  else if (fotoData && fotoData.startsWith && fotoData.startsWith('data:image')) fotosArray = [fotoData];

  const fotoItems = fotosArray.map((f, i) => `
    <div style="position:relative;display:inline-block;margin:4px;">
      <img src="${f}" style="width:172px;height:128px;object-fit:cover;border-radius:4px;" crossorigin="anonymous"/>
      <span style="position:absolute;top:4px;left:4px;background:#000;color:#fff;font-size:10px;padding:2px 6px;border-radius:2px;">Foto ${i+1}</span>
    </div>`).join('');

  const sevColor = inc.severidad==='Grave'?'#ef4444':inc.severidad==='Moderado'?'#f59e0b':'#10b981';
  const logoHtml = logoB64 ? `<img src="${logoB64}" style="width:54px;height:54px;object-fit:contain;" crossorigin="anonymous"/>` : '';

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;font-family:Arial,sans-serif;color:#1e293b;';
  el.innerHTML = `<div style="padding:28px 32px;">
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:3px solid #ef4444;margin-bottom:16px;">
      ${logoHtml}
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:bold;color:#0d1a3a;">${COLEGIO_NOMBRE||''}</div>
        <div style="font-size:10px;color:#64748b;">${COLEGIO_ESLOGAN||''}</div>
        <div style="font-size:9px;color:#94a3b8;">Año Escolar ${anio}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:bold;color:#ef4444;text-transform:uppercase;">Reporte de Incidente</div>
        <div style="font-size:9px;color:#94a3b8;">Documento oficial</div>
      </div>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:14px;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Alumno</div><div style="font-size:11px;font-weight:bold;">${inc.alumnoNombre||'-'}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">DNI/ID</div><div style="font-size:11px;">${inc.alumnoId||'-'}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Grado/Secc.</div><div style="font-size:11px;">${inc.grado||'-'} ${inc.seccion||''}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Turno</div><div style="font-size:11px;">${inc.turno||'-'}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:10px;">
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Fecha</div><div style="font-size:11px;">${inc.fecha||'-'}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Hora</div><div style="font-size:11px;">${inc.hora||'-'}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Tipo</div><div style="font-size:11px;">${inc.tipo||'-'}</div></div>
        <div><div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Severidad</div><div style="font-size:11px;font-weight:bold;color:${sevColor};">${inc.severidad||'-'}</div></div>
      </div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Descripción del Incidente</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;font-size:11px;line-height:1.5;">${inc.descripcion||'-'}</div>
    </div>
    ${inc.medidas ? `<div style="margin-bottom:12px;">
      <div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Medidas Tomadas</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;font-size:11px;line-height:1.5;">${inc.medidas}</div>
    </div>` : ''}
    ${fotosArray.length ? `<div style="margin-bottom:12px;">
      <div style="font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Evidencia Fotográfica (${fotosArray.length} foto${fotosArray.length>1?'s':''})</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">${fotoItems}</div>
    </div>` : ''}
    <div style="display:flex;justify-content:space-around;margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;">
      <div style="text-align:center;width:200px;">
        <div style="border-top:1px solid #94a3b8;padding-top:6px;">
          <div style="font-size:10px;font-weight:bold;">${inc.responsableNombre||'Responsable'}</div>
          <div style="font-size:9px;color:#64748b;">${inc.responsableCargo||'Responsable'}</div>
        </div>
      </div>
      <div style="text-align:center;width:200px;">
        <div style="border-top:1px solid #94a3b8;padding-top:6px;">
          <div style="font-size:10px;font-weight:bold;">Director(a) / V°B°</div>
          <div style="font-size:9px;color:#64748b;">Firma y sello</div>
        </div>
      </div>
    </div>
    <div style="margin-top:18px;background:#ef4444;padding:7px;text-align:center;border-radius:4px;">
      <div style="font-size:9px;color:white;">Documento generado por AsistenciaQR · ${new Date().toLocaleString('es-PE')}</div>
    </div>
  </div>`;

  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.78));
  } finally {
    document.body.removeChild(el);
  }
}

// ============================================================
// BOTTOM NAV MOBILE
// ============================================================
// ─── SIDEBAR MÓVIL ───────────────────────────────────────
function msbIsMobile() { return window.innerWidth <= 700; }

function msbExpand() {
  if(!msbIsMobile()) return;
  document.getElementById('mobile-sidebar').classList.add('open');
  document.getElementById('msb-overlay').classList.add('show');
  const tb = document.getElementById('mobile-topbar');
  if(tb) tb.classList.add('sidebar-open');
  document.body.classList.add('sidebar-open');
}
function msbCollapse() {
  document.getElementById('mobile-sidebar').classList.remove('open');
  document.getElementById('msb-overlay').classList.remove('show');
  const tb = document.getElementById('mobile-topbar');
  if(tb) tb.classList.remove('sidebar-open');
  document.body.classList.remove('sidebar-open');
  // cerrar submenús
  document.querySelectorAll('.msb-sub').forEach(s=>s.classList.remove('open'));
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('open'));
}
function msbToggleHeader() {
  document.getElementById('mobile-sidebar').classList.contains('open') ? msbCollapse() : msbExpand();
}
function msbToggleSub(id) {
  if(!document.getElementById('mobile-sidebar').classList.contains('open')){ msbExpand(); return; }
  const sub = document.getElementById('msb-sub-'+id);
  const btn = document.getElementById('msb-btn-'+id);
  const isOpen = sub && sub.classList.contains('open');
  document.querySelectorAll('.msb-sub').forEach(s=>s.classList.remove('open'));
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('open'));
  if(!isOpen && sub && btn){ sub.classList.add('open'); btn.classList.add('open'); }
}
function msbGoInicio() {
  if(!document.getElementById('mobile-sidebar').classList.contains('open')){ msbExpand(); return; }
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('active'));
  document.querySelectorAll('.msb-subitem').forEach(i=>i.classList.remove('active'));
  document.getElementById('msb-btn-inicio').classList.add('active');
  const tb = document.getElementById('mobile-topbar-title');
  if(tb) tb.textContent = '🏠 Inicio';
  showSection('inicio');
  msbCollapse();
}
function msbPickDirect(el, sectionId, label) {
  if(!document.getElementById('mobile-sidebar').classList.contains('open')){ msbExpand(); return; }
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('active'));
  document.querySelectorAll('.msb-subitem').forEach(i=>i.classList.remove('active'));
  el.classList.add('active');
  const tb = document.getElementById('mobile-topbar-title');
  if(tb) tb.textContent = label || sectionId;
  showSection(sectionId);
  msbCollapse();
}
function msbPickSub(el, sectionId, parentId, label) {
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('active'));
  document.querySelectorAll('.msb-subitem').forEach(i=>i.classList.remove('active'));
  const parentBtn = document.getElementById('msb-btn-'+parentId);
  if(parentBtn) parentBtn.classList.add('active');
  el.classList.add('active');
  const tb = document.getElementById('mobile-topbar-title');
  if(tb) tb.textContent = label || sectionId;
  showSection(sectionId);
  msbCollapse();
}
function msbSetActive(sectionId) {
  if(!msbIsMobile()) return;
  // Actualizar el topbar con la sección activa
  const sectionLabels = {
    inicio: '🏠 Inicio', scan: '📷 Escanear QR', registro: '📋 Registro del día',
    reportes: '📊 Reportes', alumnos: '👥 Alumnos', usuarios: '👤 Usuarios',
    incidentes: '🚨 Incidentes', mensajes: '💬 Mensajes',
    comunicado: '📢 Comunicado', agenda: '📅 Agenda', 'rol-examenes': '📝 Rol de Exámenes',
    'generadores-ia': '🤖 Generadores IA', 'ia-horarios': '🗓️ Horarios (prompt)', 'horarios-grado': '🗂️ Horarios por grado',
    config: '⚙️ Configuración',
  };
  const tb = document.getElementById('mobile-topbar-title');
  if(tb) tb.textContent = sectionLabels[sectionId] || sectionId;

  // Mapeo sección → menú padre
  const parentMap = {
    scan:'asistencia',registro:'asistencia',reportes:'asistencia',
    alumnos:'aula',usuarios:'aula',incidentes:'aula',
    mensajes:'comunicacion', comunicado:'comunicacion', agenda:'comunicacion', 'rol-examenes':'comunicacion',
    'generadores-ia':'comunicacion', 'ia-horarios':'comunicacion', 'horarios-grado':'comunicacion',
  };
  document.querySelectorAll('.msb-item').forEach(i=>i.classList.remove('active'));
  document.querySelectorAll('.msb-subitem').forEach(i=>i.classList.remove('active'));
  const parent = parentMap[sectionId];
  if(parent) {
    const btn = document.getElementById('msb-btn-'+parent);
    if(btn) btn.classList.add('active');
  } else {
    const btn = document.getElementById('msb-btn-'+sectionId) || document.getElementById('msb-btn-config');
    if(sectionId==='config' && document.getElementById('msb-btn-config')) document.getElementById('msb-btn-config').classList.add('active');
    else if(sectionId==='inicio') document.getElementById('msb-btn-inicio').classList.add('active');
    else if(btn) btn.classList.add('active');
  }
}
function msbInit() {
  if(!msbIsMobile()) return;
  document.body.classList.add('mobile-active');
  const tb = document.getElementById('mobile-topbar');
  if(tb) tb.style.display = 'flex';
  // Logo
  try {
    const logo = getLogo ? getLogo() : COLEGIO_LOGO;
    const img = document.getElementById('msb-logo-img');
    if(img && logo) img.src = logo;
  } catch(e){}
  // Nombre colegio
  const schoolEl = document.getElementById('msb-school-name');
  if(schoolEl) try { schoolEl.textContent = COLEGIO_NOMBRE || 'I.E.P.'; } catch(e){}
  // Nombre usuario
  msbUpdateUser();
  // Visibilidad usuarios según rol
  const usuariosBtn = document.getElementById('msb-sub-usuarios');
  if(usuariosBtn) usuariosBtn.style.display = (currentRol==='profesor'||currentRol==='portero') ? 'none' : 'flex';
  // Topbar right (iniciales)
  const tbRight = document.getElementById('mobile-topbar-right');
  if(tbRight) {
    tbRight.innerHTML = `
      <span style="color:#C9A84C;font-size:10px;border:0.5px solid rgba(201,168,76,0.4);padding:2px 7px;border-radius:4px;">${new Date().getFullYear()}</span>
      <div id="msb-avatar" onclick="toggleUserMenu(event)" style="width:28px;height:28px;border-radius:50%;background:#7B1535;border:1.5px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;cursor:pointer;user-select:none;">
        <span id="msb-avatar-text">?</span>
      </div>`;
  }
  msbUpdateUser();
}
function msbUpdateUser() {
  if(!msbIsMobile()) return;
  const nameEl = document.getElementById('user-name-display');
  const rolEl  = document.getElementById('user-rol-badge');
  const avatarEl = document.getElementById('avatar-initials');
  const msbName = document.getElementById('msb-user-name');
  const msbRole = document.getElementById('msb-user-role');
  const msbAvatarText = document.getElementById('msb-avatar-text');
  if(nameEl && msbName) msbName.textContent = nameEl.textContent || '—';
  if(rolEl  && msbRole) msbRole.textContent  = rolEl.textContent  || '—';
  if(avatarEl && msbAvatarText) msbAvatarText.textContent = avatarEl.textContent || '?';
}

// Compatibilidad: renderBottomNav llama msbInit en móvil
function renderBottomNav() {
  if(msbIsMobile()) { msbInit(); return; }
  const inner = document.getElementById('bottom-nav-inner');
  if(!inner) return;
  const menus = [
    { id: 'inicio', icon: '🏠', label: 'Inicio', action: () => { showSection('inicio'); closeMobileMenu(); } },
    { id: 'asistencia', icon: '✅', label: 'Asistencia', sub: [
      { id: 'scan',      icon: '📷', label: 'Escanear QR' },
      { id: 'registro',  icon: '📋', label: 'Registro del día' },
      { id: 'reportes',  icon: '📊', label: 'Reportes' },
    ]},
    { id: 'aula', icon: '👥', label: 'Aula', sub: [
      { id: 'alumnos',    icon: '👥', label: 'Alumnos' },
      { id: 'usuarios',   icon: '👤', label: 'Usuarios' },
      { id: 'incidentes', icon: '🚨', label: 'Incidentes' },
    ]},
    { id: 'mas', icon: '⋯', label: 'Más', sub: [
      { id: 'config', icon: '⚙', label: 'Configuración' },
    ]},
  ];
  const permisos = {
    admin:    ['inicio','asistencia','aula','mas'],
    director: ['inicio','asistencia','mas'],
    profesor: ['inicio','aula'],
    portero:  ['inicio','asistencia'],
  };
  const allowed = permisos[currentRol] || ['inicio','asistencia'];
  inner.innerHTML = menus
    .filter(m => allowed.includes(m.id))
    .map(m => `
      <button class="bnav-btn ${currentSection===m.id?'active':''}" id="bnav-${m.id}"
        onclick="${m.action ? `(${m.action.toString()})()` : `openMobileMenu('${m.id}')`}">
        <span class="bnav-icon">${m.icon}</span>
        <span>${m.label}</span>
      </button>
    `).join('');
}
function openMobileMenu(menuId) {}
function closeMobileMenu() {}
function updateBottomNavActive(id) {
  if(msbIsMobile()) { msbSetActive(id); return; }
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('bnav-' + id);
  if(btn) btn.classList.add('active');
}
// INIT — auth listener maneja el inicio

// Portal apoderado → apoderado.html

async function crearCuentaApoderado(alumno) {
  const email = `${alumno.id}${APO_DOMAIN}`;

  const pass  = alumno.id;
  let intentos = 0;
  while(intentos < 3) {
    try {
      const appName = 'apo_' + alumno.id + '_' + Date.now();
      const tmpApp  = firebase.initializeApp(firebaseConfig, appName);
      const tmpAuth = tmpApp.auth();
      try {
        await tmpAuth.createUserWithEmailAndPassword(email, pass);
      } catch(e) {
        if(e.code !== 'auth/email-already-in-use') throw e;
        // Ya existe en Firebase Auth — mostrar aviso al admin
        await tmpAuth.signOut().catch(()=>{});
        await tmpApp.delete().catch(()=>{});
        // Mostrar modal de aviso
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
          <div style="background:var(--surface);border:1px solid rgba(245,158,11,0.5);border-radius:16px;padding:28px 24px;max-width:420px;width:100%;">
            <div style="font-size:1.5rem;margin-bottom:12px;text-align:center;">⚠️</div>
            <div style="font-weight:700;font-size:1rem;margin-bottom:8px;color:#f59e0b;">Cuenta de apoderado ya existe</div>
            <div style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;line-height:1.6;">
              El alumno fue registrado correctamente, pero la cuenta del portal apoderado 
              (<strong style="color:var(--text);">${email}</strong>) ya existe en Firebase Auth 
              con una contraseña desconocida.
            </div>
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px 14px;font-size:0.82rem;color:var(--muted);margin-bottom:20px;line-height:1.7;">
              <strong style="color:#f59e0b;">Para que el apoderado pueda ingresar:</strong><br>
              1. Ve a <a href="https://console.firebase.google.com/project/asistencia-qr-a3346/authentication/users" target="_blank" style="color:#60a5fa;">Firebase Console → Authentication</a><br>
              2. Busca el email <code style="color:#f59e0b;">${email}</code><br>
              3. Elimínalo y vuelve a registrar el alumno<br><br>
              <em>O el apoderado puede entrar con su contraseña anterior si la recuerda.</em>
            </div>
            <button onclick="this.closest('div[style*=fixed]').remove()" 
              style="width:100%;background:#f59e0b;color:#000;border:none;border-radius:8px;padding:10px;font-size:0.9rem;font-weight:700;cursor:pointer;">
              Entendido
            </button>
          </div>`;
        overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        // Aun así actualizar Firestore con primerIngreso:true
        await db.collection('apoderados').doc(alumno.id).set({
          alumnoId: alumno.id, email, primerIngreso: true,
          telefono: alumno.telefono || '',
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: false });
        return true;
      }
      await tmpAuth.signOut();
      await tmpApp.delete();
      // Al reingresar alumno: resetear primerIngreso a true para forzar cambio de contraseña
      await db.collection('apoderados').doc(alumno.id).set({
        alumnoId: alumno.id, email, primerIngreso: true,
        telefono: alumno.telefono || '',
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: false }); // merge:false para resetear completamente
      return true;
    } catch(e) {
      intentos++;
      console.warn(`crearCuentaApoderado intento ${intentos}:`, e.code, alumno.id);
      if(e.code === 'auth/too-many-requests' || e.code === 'auth/quota-exceeded') {
        // Esperar más ante rate limit
        await new Promise(r => setTimeout(r, 3000 * intentos));
      } else if(intentos < 3) {
        await new Promise(r => setTimeout(r, 800));
      } else {
        return false;
      }
    }
  }
  return false;
}

async function crearCuentaApoderadoSilencioso(alumno) {
  try { await crearCuentaApoderado(alumno); } catch(e) { console.warn(e); }
}

async function crearCuentasApoderadosMasivo() {
  const statusEl = document.getElementById('apo-bulk-status');
  statusEl.style.display = 'block';
  statusEl.style.background = 'rgba(59,130,246,0.12)';
  statusEl.style.border = '1px solid rgba(59,130,246,0.3)';
  statusEl.style.color = '#60a5fa';
  statusEl.textContent = 'Obteniendo lista de alumnos...';
  try {
    const alumnos = await DB.getAlumnos();
    let creados = 0, yaExistian = 0, errores = 0;
    const fallidos = [];
    for(let i = 0; i < alumnos.length; i++) {
      const a = alumnos[i];
      const pct = Math.round(((i+1)/alumnos.length)*100);
      statusEl.textContent = `Procesando ${i+1}/${alumnos.length} (${pct}%): ${a.apellidos} ${a.nombres}...`;
      const email = `${a.id}${APO_DOMAIN}`;
      try {
        const appName = 'bulk_' + a.id + '_' + Date.now();
        const tmpApp  = firebase.initializeApp(firebaseConfig, appName);
        const tmpAuth = tmpApp.auth();
        let nuevo = false;
        try {
          await tmpAuth.createUserWithEmailAndPassword(email, a.id);
          nuevo = true; creados++;
        } catch(e) {
          if(e.code === 'auth/email-already-in-use') { yaExistian++; }
          else if(e.code === 'auth/too-many-requests') {
            // Rate limit — esperar y reintentar
            await new Promise(r => setTimeout(r, 5000));
            try {
              await tmpAuth.createUserWithEmailAndPassword(email, a.id);
              nuevo = true; creados++;
            } catch(e2) {
              if(e2.code === 'auth/email-already-in-use') yaExistian++;
              else { errores++; fallidos.push(a.id); }
            }
          } else throw e;
        }
        await tmpAuth.signOut();
        await tmpApp.delete();
        // Siempre asegurar doc en Firestore
        await db.collection('apoderados').doc(a.id).set({
          alumnoId: a.id, email, primerIngreso: true,
          telefono: a.telefono || '',
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch(e) {
        errores++;
        fallidos.push(a.id);
        console.warn('Error alumno', a.id, e.code, e.message);
      }
      // Pausa entre creaciones para evitar rate limit
      await new Promise(r => setTimeout(r, 600));
    }
    statusEl.style.background = errores ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
    statusEl.style.border = errores ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(16,185,129,0.3)';
    statusEl.style.color = errores ? '#f59e0b' : '#10b981';
    statusEl.textContent = `✅ Listo: ${creados} nuevas, ${yaExistian} ya existían${errores ? ', ⚠ ' + errores + ' errores (ver consola)' : ''}.`;
  } catch(e) {
    statusEl.style.background = 'rgba(239,68,68,0.12)';
    statusEl.style.color = '#ef4444';
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function resetPassApoderado(dni) {
  if(!confirm(`¿Resetear la contraseña del apoderado DNI ${dni}?\n\nLa nueva contraseña será el DNI: ${dni}`)) return;
  const email = `${dni}${APO_DOMAIN}`;
  toast('Procesando...', 'info');
  try {
    const tmpApp  = firebase.initializeApp(firebaseConfig, 'reset_' + Date.now());
    const tmpAuth = tmpApp.auth();
    let   exito   = false;
    try {
      await tmpAuth.createUserWithEmailAndPassword(email, dni);
      exito = true; // Cuenta nueva creada con DNI
    } catch(e) {
      if(e.code === 'auth/email-already-in-use') {
        // Usar REST API para cambiar contraseña
        const intentos = [dni];
        for(const pass of intentos) {
          try {
            const loginRes = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
              { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ email, password: pass, returnSecureToken: true }) }
            );
            const loginData = await loginRes.json();
            if(!loginData.idToken) continue;
            const updateRes = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`,
              { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ idToken: loginData.idToken, password: dni, returnSecureToken: true }) }
            );
            const updateData = await updateRes.json();
            if(updateData.idToken) { exito = true; break; }
          } catch(e2) {}
        }
      } else { throw e; }
    }
    await tmpAuth.signOut();
    await tmpApp.delete();
    await db.collection('apoderados').doc(dni).set({
      primerIngreso: true, alumnoId: dni,
      reseteadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      passBackup: firebase.firestore.FieldValue.delete()
    }, { merge: true });
    if(exito) {
      toast(`✅ Reseteado. El apoderado ingresa con DNI: ${dni}`, 'success');
    } else {
      toast(`⚠️ No se pudo resetear. Borra la cuenta manualmente en Firebase Console.`, 'warning');
    }
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function recalcularResumenMensual() {
  const mes = mesActual();
  const statusEl = document.getElementById('recalc-status');
  statusEl.style.display = 'block';
  statusEl.style.background = 'rgba(59,130,246,0.1)';
  statusEl.style.color = 'var(--accent)';
  statusEl.textContent = 'Obteniendo alumnos...';
  try {
    const alumnos = await DB.getAlumnos();
    statusEl.textContent = `Recalculando ${alumnos.length} alumnos para ${mes}...`;
    const ids = alumnos.map(a => a.id);
    // Procesar en lotes de 20 para no saturar Firestore
    const LOTE = 20;
    for(let i = 0; i < ids.length; i += LOTE) {
      await DB._recalcularResumenMes(mes, ids.slice(i, i + LOTE));
      const pct = Math.min(100, Math.round((i + LOTE) / ids.length * 100));
      statusEl.textContent = `Recalculando... ${pct}%`;
    }
    // Invalidar cache del resumen mensual
    if(DB._resumenMesCache) delete DB._resumenMesCache[mes];
    if(DB._resumenMesCacheTime) delete DB._resumenMesCacheTime[mes];
    statusEl.style.background = 'rgba(29,158,117,0.1)';
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = `✅ Resumen de ${mes} recalculado para ${alumnos.length} alumnos.`;
    toast('Resumen mensual recalculado', 'success');
  } catch(e) {
    statusEl.style.background = 'rgba(239,68,68,0.1)';
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function resetearTodoElSistema() {
  // Solo el admin principal puede hacer esto
  if(currentRol !== 'admin') { toast('Solo el administrador principal puede hacer esto', 'error'); return; }

  const confirm1 = confirm('ATENCION: Esta accion borrara TODOS los datos del sistema.\n\nSe eliminara:\n- Todos los alumnos\n- Todos los registros de asistencia\n- Todos los incidentes\n- Todas las cuentas de apoderados\n- Todos los usuarios del personal (excepto tu cuenta)\n\n¿Deseas continuar?');
  if(!confirm1) return;

  const confirmTxt = prompt('Para confirmar escribe exactamente: BORRAR TODO');
  if(confirmTxt !== 'BORRAR TODO') { toast('Confirmacion incorrecta. Operacion cancelada.', 'error'); return; }

  const statusEl = document.getElementById('reset-status');
  statusEl.style.display = 'block';
  statusEl.style.background = 'rgba(239,68,68,0.12)';
  statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
  statusEl.style.color = '#ef4444';

  const ADMIN_UID = 'vNDKTaM6Aha8w3lDHl5iAFfaDKa2';

  async function borrarColeccion(nombre) {
    statusEl.textContent = 'Borrando ' + nombre + '...';
    const snap = await db.collection(nombre).get();
    const batch_size = 400;
    let docs = snap.docs;
    let total = 0;
    while(docs.length > 0) {
      const lote = db.batch();
      docs.slice(0, batch_size).forEach(d => lote.delete(d.ref));
      await lote.commit();
      total += Math.min(docs.length, batch_size);
      docs = docs.slice(batch_size);
    }
    return total;
  }

  try {
    // 1. Borrar alumnos
    const nAlumnos = await borrarColeccion('alumnos');

    // 2. Borrar registros
    const nRegistros = await borrarColeccion('registros');

    // 3. Borrar incidentes
    const nIncidentes = await borrarColeccion('incidentes');

    // 4. Borrar apoderados
    const nApoderados = await borrarColeccion('apoderados');

    // 5. Borrar usuarios excepto el admin principal
    statusEl.textContent = 'Borrando usuarios del personal...';
    const usuariosSnap = await db.collection('usuarios').get();
    const batchUsuarios = db.batch();
    let nUsuarios = 0;
    usuariosSnap.docs.forEach(d => {
      if(d.id !== ADMIN_UID) {
        batchUsuarios.delete(d.ref);
        nUsuarios++;
      }
    });
    if(nUsuarios > 0) await batchUsuarios.commit();

    statusEl.style.background = 'rgba(16,185,129,0.12)';
    statusEl.style.border = '1px solid rgba(16,185,129,0.3)';
    statusEl.style.color = '#10b981';
    DB.invalidarAlumnos();
    DB.invalidarRegistros();
    _invalidarIncidentes();
    _invalidarUsuarios();
    invalidateConfig();
    LSC.clear(); // Limpiar todo el localStorage del sistema
    statusEl.textContent = 'Sistema reseteado correctamente. Eliminados: ' + nAlumnos + ' alumnos, ' + nRegistros + ' registros, ' + nIncidentes + ' incidentes, ' + nApoderados + ' apoderados, ' + nUsuarios + ' usuarios.';

    // Limpiar cache local
    if(window.DB && window.DB._cache) window.DB._cache = {};
    toast('Sistema reseteado correctamente', 'success');

    // Recargar datos de la UI
    setTimeout(() => { showSection('config'); }, 2000);

  } catch(e) {
    statusEl.textContent = 'Error durante el reset: ' + e.message;
    console.error(e);
    toast('Error: ' + e.message, 'error');
  }
}
