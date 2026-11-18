/* ═══════════════════════════════════════════
   TOASTS — reemplaza alert()
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   SEGURIDAD — ESCAPE HTML (anti-XSS)
═══════════════════════════════════════════ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Alias corto para usar en templates: ${esc(c.nombre)}
const esc = escapeHtml;

/* ═══════════════════════════════════════════
   MODO OSCURO / CLARO
═══════════════════════════════════════════ */
function alternarTema() {
  const esOscuroAhora = document.documentElement.getAttribute('data-theme') === 'dark';
  const nuevoOscuro = !esOscuroAhora;
  if (nuevoOscuro) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('uv-tema', nuevoOscuro ? 'dark' : 'light'); } catch(e) {}
  _actualizarBotonTema();
}
function _actualizarBotonTema() {
  const oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  const icon2 = document.getElementById('theme-toggle-icon-2');
  if (icon)  icon.textContent  = oscuro ? '☀️' : '🌙';
  if (label) label.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
  if (icon2) icon2.textContent = oscuro ? '☀️' : '🌙';
}
document.addEventListener('DOMContentLoaded', _actualizarBotonTema);

// Escapa para insertar de forma segura dentro de un atributo onclick="...('texto')"
function escJs(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ═══════════════════════════════════════════
   MANEJO GLOBAL DE ERRORES
═══════════════════════════════════════════ */
window.addEventListener('error', function(e) {
  console.error('Error no capturado:', e.error || e.message);
  // No mostramos toast por cada error de runtime para no saturar,
  // pero queda registrado en consola para diagnostico.
});

window.addEventListener('unhandledrejection', function(e) {
  console.error('Promesa rechazada sin manejar:', e.reason);
  const msg = e.reason?.message || '';
  if (msg.includes('PERMISSION_DENIED') || msg.includes('permission_denied')) {
    showToast('No tenes permiso para realizar esta accion. Verifica tu conexion.', 'error', 5000);
  } else if (msg.includes('network') || msg.includes('Network')) {
    showToast('Error de conexion. Verifica tu internet e intenta de nuevo.', 'error', 5000);
  }
});

/* Wrapper seguro para operaciones Firebase con feedback automático */
async function fbSafe(promiseFn, opts = {}) {
  try {
    const result = await promiseFn();
    if (opts.successMsg) toastOk(opts.successMsg);
    return result;
  } catch (e) {
    console.error('Firebase error:', e);
    const friendly = e.message?.includes('PERMISSION_DENIED')
      ? 'Sin permiso para esta accion.'
      : e.message?.includes('network') || !navigator.onLine
      ? 'Sin conexion a internet. Revisa tu red e intenta de nuevo.'
      : (opts.errorMsg || 'Ocurrio un error. Intenta de nuevo.');
    toastErr(friendly);
    return null;
  }
}

/* Aviso si se pierde la conexión a internet */
window.addEventListener('offline', () => {
  showToast('Sin conexion a internet. Los cambios no se guardaran hasta reconectar.', 'error', 6000);
  const b = document.getElementById('offline-banner');
  if (b) b.style.display = 'block';
});
window.addEventListener('online', () => {
  showToast('Conexion restablecida.', 'success', 2500);
  const b = document.getElementById('offline-banner');
  if (b) b.style.display = 'none';
});
// Check estado inicial
if (!navigator.onLine) {
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'block';
  });
}

/* ═══════════════════════════════════════════
   COUNT-UP ANIMATION
═══════════════════════════════════════════ */
function countUp(el, target, duration=900, prefix='', suffix='') {
  if (!el) return;
  const start   = parseFloat(el.dataset.prev || 0);
  const diff    = target - start;
  if (diff === 0) { el.textContent = prefix + target.toLocaleString('es-BO') + suffix; return; }
  const startTs = performance.now();
  function step(now) {
    const elapsed = now - startTs;
    const progress = Math.min(elapsed / duration, 1);
    // ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + diff * ease;
    el.textContent = prefix + (Number.isInteger(target) ? Math.round(current) : current.toFixed(2)).toLocaleString('es-BO') + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else { el.dataset.prev = target; }
  }
  requestAnimationFrame(step);
}

function countUpMoney(el, target, duration=900, prefix='$') {
  if (!el) return;
  const start = parseFloat(el.dataset.prev || 0);
  const diff  = target - start;
  const startTs = performance.now();
  function step(now) {
    const elapsed  = now - startTs;
    const progress = Math.min(elapsed / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    const current  = start + diff * ease;
    el.textContent = prefix + current.toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});
    if (progress < 1) requestAnimationFrame(step);
    else el.dataset.prev = target;
  }
  requestAnimationFrame(step);
}

function showToast(msg, type='info', duration=3500) {
  const cont = document.getElementById('toast-container');
  if (!cont) { console.log(msg); return; }
  const icons = { success:'✅', error:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<div class="toast-icon">${icons[type]||icons.info}</div>
    <div class="toast-body">${msg}</div>
    <button class="toast-close" onclick="_removeToast(this.parentElement)">×</button>`;
  cont.appendChild(el);
  setTimeout(() => _removeToast(el), duration);
}
function _removeToast(el) {
  if (!el || el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 250);
}
// Alias cortos
function toastOk(msg)   { showToast(msg, 'success'); }
function toastErr(msg)  { showToast(msg, 'error'); }
function toastInfo(msg) { showToast(msg, 'info'); }

/* ═══════════════════════════════════════════
   CONFIRM MODAL — reemplaza confirm()
═══════════════════════════════════════════ */
let _confirmResolver = null;
function confirmDialog(message, opts={}) {
  return new Promise(resolve => {
    _confirmResolver = resolve;
    document.getElementById('confirm-title').textContent = opts.title || '¿Estás seguro?';
    document.getElementById('confirm-msg').textContent   = message || 'Esta acción no se puede deshacer.';
    const btnOk = document.getElementById('confirm-btn-ok');
    btnOk.textContent = opts.okText || 'Eliminar';
    btnOk.className = 'confirm-btn-ok' + (opts.positive ? ' ok-positive' : '');
    document.getElementById('confirm-icon').textContent = opts.icon || (opts.positive ? '✓' : '🗑');
    document.getElementById('confirm-icon').style.background = opts.positive ? '#f0f7ee' : '#fef2f2';
    document.getElementById('confirm-icon').style.color = opts.positive ? 'var(--verde)' : 'var(--danger)';
    document.getElementById('confirm-overlay').classList.add('open');
  });
}
function _confirmResolve(val) {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolver) { _confirmResolver(val); _confirmResolver = null; }
}

/* ═══════════════════════════════════════════
   BOTÓN GUARDAR — estado loading/success
═══════════════════════════════════════════ */
function btnLoading(btn, on) {
  if (!btn) return;
  if (on) {
    btn.dataset.origText = btn.dataset.origText || btn.textContent;
    btn.classList.add('is-loading','btn-state');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>Guardando...';
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}
function btnSuccess(btn, duration=1800) {
  if (!btn) return;
  btn.classList.remove('is-loading'); // crítico: sin esto, pointer-events:none queda pegado para siempre
  btn.disabled = false;
  btn.classList.add('is-success','btn-state');
  btn.innerHTML = '✓ Guardado';
  setTimeout(() => {
    btn.classList.remove('is-success');
    btn.textContent = btn.dataset.origText || '✓ Guardar';
  }, duration);
}

/* ═══════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════ */
let asesores    = [];        /* [{nombre, pin, _key}] */
let todosRegs   = [];        /* admin: todos los registros */
let misRegs     = [];        /* asesor: solo los suyos */
let asesorActual = null;     /* {nombre, pin, _key} */
let modoAdmin   = false;

let pinAdminLocal = null; // se carga desde Firebase apenas arranca la app (ver fb-ready) — ya no depende del dispositivo
let pinBuf = '';

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
let _asesoresRecibidos = false;
document.addEventListener('fb-ready', () => {
  // Si la URL trae ?cotizacion=KEY, es un cliente viendo su cotización por link — mostramos
  // esa vista pública sola, sin login, y cortamos acá (no seguimos con el flujo normal).
  const cotizKey = new URLSearchParams(window.location.search).get('cotizacion');
  if (cotizKey) { mostrarCotizacionPublica(cotizKey); return; }

  window._fbListenAsesores(arr => {
    _asesoresRecibidos = true;
    asesores = arr;
    renderAsesorGrid();
    segRenderRecientes();
    segIntentarRestaurar();
    if (modoAdmin) renderAsesoresAdmin();
    if (asesorActual) renderMisRegistros();
    poblarSelectAsesorCallCenter();
  });

  // PIN de admin: se carga UNA vez de Firebase, así es el mismo en cualquier computadora.
  // Si Firebase todavía no tiene ninguno cargado, migramos el que esta máquina tenía
  // guardado localmente (si tenía) — para no invalidar de golpe el PIN que ya usaban.
  window._fbGetAdminPinOnce().then(async pinFirebase => {
    if (pinFirebase) {
      pinAdminLocal = pinFirebase;
    } else if ((await window._fbSeg.get('config/adminPinSeguro'))?.hash) {
      pinAdminLocal = null;   // PIN de admin ya cifrado: no hay nada en texto
    } else {
      const pinLocalViejo = localStorage.getItem('uv_planilla_pin') || '0000';
      pinAdminLocal = pinLocalViejo;
      window._fbSetAdminPin(pinLocalViejo);
    }
  });
});

/* Fallback: si Firebase conectó pero no hay asesores, mostrar estado vacío rápido */
setTimeout(() => {
  if (window._fbReady && asesores.length === 0 && document.getElementById('asesor-grid')) {
    renderAsesorGrid(); // mostrará el empty state con instrucciones
  }
}, 3000);

/* Fallback si Firebase no respondió en absoluto (típicamente: reglas de seguridad bloqueando) */
setTimeout(() => {
  if (!window._fbReady || !_asesoresRecibidos) {
    const grid = document.getElementById('asesor-grid');
    if (grid) grid.innerHTML = `<div style="text-align:center;padding:16px;color:var(--rojo);font-size:var(--fs-base);line-height:1.6;">
      ⚠️ <strong>No se pudo leer la base de datos.</strong><br>
      Esto suele pasar porque las <strong>reglas de seguridad de Firebase expiraron</strong>
      (el modo de prueba dura 30 días).<br><br>
      Solución: Firebase Console → Realtime Database → Reglas → pegar:<br>
      <code style="background:#fff;padding:2px 6px;border-radius:4px;font-size:var(--fs-xs);">{"rules":{".read":true,".write":true}}</code>
      → Publicar → recargar esta página.
    </div>`;
  }
}, 6000);

/* ═══════════════════════════════════════════
   LOGIN — PASO 1: GRILLA ASESORES
═══════════════════════════════════════════ */
function renderAsesorGrid() {
  const grid = document.getElementById('asesor-grid');
  if (!asesores.length) {
    grid.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ink-500);font-size:var(--fs-base);line-height:1.6;">
      <div style="font-size:var(--fs-3xl);margin-bottom:8px;">👋</div>
      <strong>Sin usuarios configurados</strong><br>
      Entrá como <strong>Administrador</strong> para crear usuarios.
    </div>`;
    return;
  }
  grid.innerHTML = asesores.map(a => {
    const rolInfo = (typeof ROL_LABELS !== 'undefined' && ROL_LABELS[a.rol]) || { label:'Asesor comercial', color:'var(--cartera)', bg:'var(--verde-bg)', icon:'' };
    return `
    <button class="asesor-btn" onclick="seleccionarAsesor('${a._key}', this)">
      <div class="av" style="background:linear-gradient(155deg,${rolInfo.color},${rolInfo.color}dd);">${iniciales(a.nombre)}</div>
      <div class="info">
        <div class="name">${esc(a.nombre)}</div>
        <div class="role" style="background:${rolInfo.bg||'var(--verde-bg)'};color:${rolInfo.color};">${rolInfo.label}</div>
      </div>
    </button>`;
  }).join('');
}

function iniciales(nombre) {
  return nombre.split(' ').map(p=>p[0]).join('').toUpperCase().slice(0,2);
}

/* ═══════════════════════════════════════════
   LOGIN — PASO 2: PIN
═══════════════════════════════════════════ */
function seleccionarAsesor(key, btnEl) {
  const a = asesores.find(x => x._key === key);
  if (!a) return;
  asesorActual = a;
  modoAdmin = false;
  transicionarAPin(a.nombre, false, btnEl);
}

function seleccionarAdmin(btnEl) {
  asesorActual = null;
  modoAdmin = true;
  transicionarAPin('Administrador', true, btnEl);
}

/* Transición moderna: feedback en el botón elegido + fade/slide entre pasos */
function transicionarAPin(nombre, esAdmin, btnEl) {
  if (btnEl) btnEl.classList.add('asesor-btn-picked');
  const stepU = document.getElementById('step-usuario');
  stepU.classList.add('step-fade-out');
  setTimeout(() => {
    stepU.style.display = 'none';
    stepU.classList.remove('step-fade-out');
    if (btnEl) btnEl.classList.remove('asesor-btn-picked');
    mostrarPinStep(nombre, esAdmin);
  }, 220);
}

function mostrarPinStep(nombre, esAdmin) {
  const pinStep = document.getElementById('pin-step');
  pinStep.style.display = 'block';
  pinStep.classList.remove('step-fade-in');
  void pinStep.offsetWidth; /* fuerza reflow para reiniciar la animación */
  pinStep.classList.add('step-fade-in');

  const av = document.getElementById('sel-av');
  av.textContent  = esAdmin ? '⚙' : iniciales(nombre);
  av.className    = 'av' + (esAdmin ? ' av-admin' : '');
  document.getElementById('sel-name').textContent = nombre;
  document.getElementById('pin-err').style.display = 'none';
  pinBuf = '';
  actualizarDots();
}

function cerrarTodosLosModales() {
  document.querySelectorAll('.open').forEach(el => el.classList.remove('open'));
  const notifDd = document.getElementById('notif-dropdown');
  if (notifDd) notifDd.style.display = 'none';
}

function volverPaso1() {
  const pinStep = document.getElementById('pin-step');
  const stepU   = document.getElementById('step-usuario');
  pinStep.classList.add('step-fade-out');
  setTimeout(() => {
    pinStep.style.display = 'none';
    pinStep.classList.remove('step-fade-out');
    stepU.style.display = 'block';
    stepU.classList.remove('step-fade-in');
    void stepU.offsetWidth;
    stepU.classList.add('step-fade-in');
  }, 220);
  pinBuf = '';
}

function pinPress(v) {
  if (v==='del') pinBuf = pinBuf.slice(0,-1);
  else if (v==='clr') pinBuf = '';
  else if (pinBuf.length < 4) pinBuf += v;
  document.getElementById('pin-err').style.display = 'none';
  actualizarDots();
  if (pinBuf.length === 4) setTimeout(verificarPin, 120);
}

function actualizarDots() {
  for (let i=0;i<4;i++)
    document.getElementById('pd'+i).classList.toggle('filled', i < pinBuf.length);
}

/* Soporte de teclado físico para el PIN (además del numpad en pantalla).
   Solo actúa cuando el paso de PIN está visible, para no interferir
   con otros inputs de la app. */
document.addEventListener('keydown', (e) => {
  const pinStep = document.getElementById('pin-step');
  if (!pinStep || pinStep.offsetParent === null) return; // no interceptar si no está realmente visible
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    pinPress(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    pinPress('del');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    volverPaso1();
  }
});

/* verificarPin: definida más abajo */

/* ═══════════════════════════════════════════
   ENTRAR
═══════════════════════════════════════════ */
function entrarAsesor() {
  const a = asesorActual;
  const rol = a.rol || 'ventas';
  const modulos = a.modulos || ROL_MODULOS[rol] || ['ventas'];

  // Gerencia → admin panel completo, sin restricciones
  if (rol === 'gerencia') {
    entrarAdmin();
    return;
  }

  // Estos 4 módulos solo existen en el panel admin (no hay una versión "simple" de
  // Cartera/Inventario/Dashboard/Reportes para el panel de vendedores). Si la persona
  // tiene AUNQUE SEA UNO de estos, va al admin — pero restringido a TODOS los módulos
  // que tenga, no solo al primero que matchee (ese era el bug: Cartera + Expensas
  // juntos, por ejemplo, antes solo dejaba ver Cartera y la Expensas se perdía).
  const modulosSoloAdmin = ['cobranza', 'inventario', 'dashboard', 'reportes'];
  const necesitaAdmin = modulos.some(m => modulosSoloAdmin.includes(m));
  if (necesitaAdmin) {
    window._tabsPermitidos = _tabsDeModulos(modulos);   // antes de entrar, para que no arranque en un panel que no le corresponde
    entrarAdmin();
    setTimeout(() => {
      _restrictAdminPanelForRole(modulos);
      // Arranca en el primer módulo relevante que tenga, con esta prioridad
      if (modulos.includes('cobranza'))        switchAdminTab('cartera');
      else if (modulos.includes('expensas'))   switchAdminTab('expensas');
      else if (modulos.includes('inventario')) switchAdminTab('inventario');
      else if (modulos.includes('dashboard'))  switchAdminTab('dashboard');
    }, 200);
    return;
  }

  // Ventas / Call Center / Marketing / Expensas (sin ningún módulo "solo admin") →
  // panel simple de usuario, que ya soporta cualquier combinación de estos a la vez.
  entrarUsuario();
}

/* Qué ítems del menú habilita cada módulo. Cartera (módulo Finanzas) ve solo Cartera y Expensas. */
const MAPA_MODULO_NAV = {
  dashboard:  ['nav-dashboard'],
  marketing:  ['nav-marketing-admin'],
  cobranza:   ['nav-cartera','nav-expensas'],
  expensas:   ['nav-expensas'],
  inventario: ['nav-inventario'],
  ventas:     ['nav-tabla','nav-contratos'],
};
function _navDeModulos(modulos) {
  const ids = new Set();
  (modulos || []).forEach(m => (MAPA_MODULO_NAV[m] || []).forEach(id => ids.add(id)));
  // Inicio (resumen de todas las áreas) solo si la persona tiene algo más que Finanzas
  if ((modulos || []).some(m => m !== 'cobranza' && m !== 'expensas')) ids.add('nav-home');
  return ids;
}
function _tabsDeModulos(modulos) {
  const t = new Set([..._navDeModulos(modulos)].map(id => id.replace(/^nav-/, '')));
  if (t.has('cartera')) t.add('cobranza');
  return t;
}
// Restricción de sidebar según rol del usuario
function _restrictAdminPanelForRole(modulos) {
  const a = asesorActual;
  if (!a) return;
  modulos = Array.isArray(modulos) ? modulos : (a.modulos || []);
  const rolInfo = ROL_LABELS[a.rol] || ROL_LABELS.ventas;

  // Actualizar sidebar user info con el usuario real
  const sbAv  = document.getElementById('sidebar-av');
  const sbNom = document.getElementById('sidebar-nombre');
  const sbRol = document.getElementById('sidebar-rol');
  const tbAv  = document.getElementById('topbar-av');
  const tbNom = document.getElementById('topbar-nombre');
  if (sbAv)  sbAv.textContent  = iniciales(a.nombre);
  if (sbNom) sbNom.textContent = a.nombre;
  if (sbRol) sbRol.textContent = rolInfo.icon + ' ' + rolInfo.label;
  if (tbAv)  tbAv.textContent  = iniciales(a.nombre);
  if (tbNom) tbNom.textContent = a.nombre;

  if (a.rol === 'gerencia') return; // gerencia ve todo el panel, sin restricción

  // Qué ítems del menú habilita CADA módulo — antes esto solo miraba UN rol y
  // ocultaba todo lo demás; ahora se suman los ítems de TODOS los módulos que
  // tenga la persona, así "Cartera + Expensas" muestra las dos, no solo una.
  const idsPermitidos = _navDeModulos(modulos);
  window._tabsPermitidos = _tabsDeModulos(modulos);

  document.querySelectorAll('.nav-item').forEach(el => {
    el.style.display = idsPermitidos.has(el.id) ? '' : 'none';
  });
  // Los ítems de sistema (usuarios, config, panel de control, eliminaciones) son
  // exclusivos de gerencia, se quedan ocultos para cualquier otra combinación.
  ['nav-asesores','nav-config','nav-panelcontrol','nav-eliminaciones','nav-cambios-categoria','nav-directorio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });

  // Ocultar grupos del acordeón que quedan sin ningún item visible
  setTimeout(() => {
    document.querySelectorAll('.nav-acc-body').forEach(body => {
      const visibles = Array.from(body.children).some(item => item.style.display !== 'none');
      const head = body.previousElementSibling;
      if (head?.classList.contains('nav-acc-head')) head.style.display = visibles ? '' : 'none';
      body.style.display = visibles ? '' : 'none';
    });
  }, 50);
}

function entrarAdmin() {
  cerrarTodosLosModales();
  document.getElementById('login-screen').style.display = 'none';
  const ap = document.getElementById('admin-panel');
  ap.style.display = 'flex';
  ap.classList.add('visible');
  // Populate sidebar user info
  document.getElementById('sidebar-av').textContent    = '⚙';
  document.getElementById('sidebar-nombre').textContent = 'Administrador';
  document.getElementById('sidebar-rol').textContent    = 'Controller / Gerente';
  document.getElementById('topbar-av').textContent     = 'A';
  document.getElementById('topbar-nombre').textContent  = 'Admin';

  /* Registros de ventas */
  window._fbListenTodos(arr => {
    todosRegs = arr;
    poblarFiltroAsesor();
    renderDashboard();
    renderTablaAdmin();
    renderHome();
    renderAdminMarketing();
  });

  /* Asesores e inventario */
  renderAsesoresAdmin();
  iniciarInventario();



  /* ── CATEGORÍAS DE COBRO ── */
  window._fbListenCategorias(arr => {
    categoriasData = arr;
    renderCategoriasConfig();
  });

  /* ── COBROS MANUALES ── */
  window._fbListenCobros(arr => {
    cobrosData = arr;
    renderCobros();
    calcularMetaManual('cartera');
    calcularMetaManual('expensas');
    renderResumenCobranza();
    renderMetasPorUsuario();
    renderHome();
  });

  /* ── LEADS MARKETING (admin ve todos) ── */
  window._fbListenLeads(arr => {
    leadsData = arr;
    renderAdminMarketing();
    renderDashboard();
  });

  /* ── CAMPAÑAS Y VISITAS PROGRAMADAS (admin ve todas) ── */
  window._fbListenCampanias(arr => { campaniasData = arr; renderCampanias(); renderAdminMarketing(); });
  window._fbListenLeadsSemanales(arr => { leadsSemanalesData = arr; renderLeadsSemanales(); renderDashboard(); renderAdminMarketing(); });
  window._fbListenVisitasProgramadasTodas(arr => {
    visitasProgramadasData = arr;
    try { if (modoAdmin) renderCotizacionesGuardadas(); else renderMisCotizacionesVendedor(); } catch(e) {}
    if (typeof mkpRefrescar === 'function') mkpRefrescar();
    renderDashboard();
    renderAdminMarketing();
  });
  window._fbListenSolicitudesEliminacion(arr => { solicitudesEliminacionData = arr; renderSolicitudesEliminacionAdmin(); });
  window._fbListenSolicitudesCambioCategoria(arr => { solicitudesCambioCategoriaData = arr; renderSolicitudesCambioCategoriaAdmin(); renderBuscarCobroCategorizado(); });
  window._fbListenOrigenes(arr => { origenesData = arr; renderOrigenes(); });
  window._fbListenOrangeMora(arr => { orangeMoraData = arr; renderOrangeMoraPanel(); });
  window._fbListenDirReservas(m => { dirReservasIncl = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirEmbudo(m => { dirEmbudoManual = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirMinutas(m => { dirMinutas = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirTC(m => { dirTCMes = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirAlias(m => { dirAlias = { modalidad:{}, asesor:{}, ...(m||{}) }; _dirRefrescarSiAbierto(); });
  window._fbListenDirCanales(m => { dirCanalMap = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirEmbudoIdeal(m => { dirEmbudoIdeal = m || {}; _dirRefrescarSiAbierto(); });
  window._fbListenDirCorte(m => { dirCorte = m || {}; _dirRefrescarSiAbierto(); });
  iniciarCobCRM(); // Seguimiento de Cobranza (CRM): cortes, fichas y alertas de compromisos
  iniciarMarketingPlanilla(); // Planilla de leads por campaña: inversión / costo por lead
  window._fbListenOrangeCartera(arr => { orangeCarteraData = arr; renderOrangeCarteraPanel(); });
  window._fbListenOrangeSyncInfo(info => renderOrangeSyncInfo(info));
  window._fbListenOrangeCarteraSyncInfo(info => renderOrangeCarteraSyncInfo(info));
  window._fbListenOrangeCarteraAgregados(agr => { orangeCarteraAgregados = agr; renderOrangeCarteraAgregados(); });
  window._fbListenCategoriasCobros(cats => { carteraCategoriasData = cats; renderCategorizacionCobros(); renderResumenMensualCartera(); renderSemanalCartera(); });
  // OJO: esta suscripción faltaba — expensasCategoriasData se declaraba pero nunca se llenaba
  // desde Firebase, así que la cola de "Categorizar cobros" de Expensas mostraba TODO como
  // pendiente para siempre (aunque la categorización automática ya lo hubiera guardado), y los
  // resúmenes mensual/semanal/búsqueda de cliente nunca veían ninguna categoría. Esto es lo que
  // hacía que la categorización se sintiera "no automática" — ya estaba calculada, pero la
  // pantalla nunca se enteraba de que se había guardado.
  window._fbListenCategoriasExpensas(cats => {
    expensasCategoriasData = cats;
    renderCategorizacionExpensas();
    renderResumenMensualExpensas();
    renderHistoricoMensualExpensas();
    renderSemanalExpensas();
    renderDetalleSemanaExpensas();
    renderBusquedaClienteExpensas();
    renderOrangeMoraTabla();
  });
  window._fbListenDocumentosReserva(arr => { documentosReservaData = arr; renderDocumentosGuardados(); });
  window._fbListenCotizaciones(arr => { cotizacionesData = arr; renderCotizacionesGuardadas(); });
  window._fbListenVentasConcretadas(arr => { ventasConcretadasData = arr; renderVentasConcretadasAdmin(); _dirRefrescarSiAbierto(); });
  window._fbListenPoliticaDescuento(arr => { politicaDescuentoData = arr; });
  window._fbListenPlazosModalidad(data => { plazosModalidadData = data; if (document.getElementById('pc-plazos-tbody')) renderPlazosModalidad(); });

  /* ── CARTERA META ── */
  window._fbListenCartaMeta(arr => {
    cartaMetaData = arr;
    renderCartaMeta();
    renderCartaKPIs();
  });

  /* ── CARTERA COBROS ── */
  window._fbListenCartaCobros(arr => {
    cartaCobroData = arr;
    cartaAdminData = arr;  // legacy compat
    renderCartaCobros();
    renderCartaKPIs();
    renderHome();
  });

  /* ── CATEGORÍAS CARTERA ── */
  window._fbListenCatCartera(arr => {
    catCarteraData = arr;
    renderCatCarteraConfig();
  });

  /* ── CATEGORÍAS EXPENSAS ── */
  window._fbListenCatExpensas(arr => {
    catExpensasData = arr;
    renderCatExpensasConfig();
  });

  /* ── EXPENSAS ADMIN ── */
  window._fbListenExpAdmin(arr => {
    expAdminData = arr;
    renderExpensasAdmin();
    renderHome();
  });

  /* ── COBRANZA EXCEL ── */
  window._fbListenCobranzaExcel(arr => {
    cobranzaExcelData = arr;
  });

  /* ── EXPENSAS MANUALES ── */
  window._fbListenExpensas_manual(arr => {
    expensasManualData = arr;
    renderResumenExpensas();
  });

  /* API Orange (intento, puede fallar por CORS) */
  /* Intentar Orange al inicio */

  /* Auto-refresh cada 10 minutos */
  setInterval(() => {
    if (modoAdmin) {
          renderHome();
    }
  }, 10 * 60 * 1000);

  /* Fecha de hoy en formulario */
  const hoy = new Date().toISOString().split('T')[0];
  const nc_fecha = document.getElementById('nc-fecha');
  if (nc_fecha) nc_fecha.value = hoy;
}

/* cerrarSesion: definida más abajo */

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const open = sb?.classList.toggle('open');
  ov?.classList.toggle('open', open);
}

/* confirmarSalir: definida más abajo */

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
function switchAsesorTab(id) {
  document.querySelectorAll('.a-tab').forEach((b,i) => {
    const ids = ['cargar','mis-registros'];
    b.classList.toggle('active', ids[i]===id);
  });
  document.querySelectorAll('.a-tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('atab-' + (id==='mis-registros'?'mis-registros':'cargar')).classList.add('active');
}

const TAB_TITLES = {
  'home':'Inicio', 'dashboard':'Ventas', 'marketing-admin':'Marketing',
  'cartera':'Cartera', 'expensas':'Expensas', 'cobranza':'Cartera',
  'tabla':'Registros', 'contratos':'Ventas Concretadas', 'inventario':'Inventario', 'eliminaciones':'Eliminaciones',
  'cambios-categoria':'Cambios de categoría', 'directorio':'Informe para Directorio',
  'panelcontrol':'Panel de Control', 'asesores':'Usuarios', 'config':'Config',
  'materia-reserva':'Materia Reservada de Venta', 'cotizaciones':'Cotizaciones', 'cerebro':'Cerebro del sistema', 'decisiones':'Tablero de decisiones', 'embudo':'Embudo de asesores'
};

const NAV_GRUPOS = {
  home:'resumen',
  dashboard:'comercial', contratos:'comercial', 'marketing-admin':'comercial', tabla:'comercial',
  'materia-reserva':'comercial', 'cotizaciones':'comercial',
  cartera:'finanzas', expensas:'finanzas', cobranza:'finanzas',
  inventario:'operaciones', directorio:'directorio',
  eliminaciones:'sistema', 'cambios-categoria':'sistema', panelcontrol:'sistema', asesores:'sistema', config:'sistema',
  cerebro:'cerebro', decisiones:'decisiones', embudo:'embudo',
};

/* navAbrirGrupo: definida más abajo */

function switchAdminTab(id) {
  navAbrirGrupo(NAV_GRUPOS[id] || 'resumen', true);
  // Update sidebar active
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById('nav-' + id);
  if (navBtn) navBtn.classList.add('active');
  // Update panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  // Update topbar title
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = TAB_TITLES[id] || id;
  // Close sidebar on mobile
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  }
  // Render hooks
  if (id === 'home')            renderHome();
  if (id === 'marketing-admin') renderAdminMarketing();
  if (id === 'contratos')       renderVentasConcretadasAdmin();
  if (id === 'panelcontrol')    { renderPanelControl(); renderPlazosModalidad(); }
  if (id === 'directorio') iniciarInformeDirectorio();
  if (id === 'config' && (modoAdmin || asesorActual?.rol === 'gerencia')) { segIniciarAdmin(true); segRenderAdmin(); }
  if (id === 'materia-reserva') cambiarModoMateriaReserva('nuevo');
  if (id === 'cotizaciones') cambiarModoCotizaciones('nueva');
  if (id === 'cartera') {
    const mes = mesActual(); const anio = anioActual();
    const lbl = document.getElementById('cart-periodo-label');
    if (lbl) lbl.textContent = mes + ' ' + anio;
    if (!orangeCarteraDetalleRaw.length) { cargarDetalleCobrosCartera(true); sincronizarOrangeCartera(); } // primera carga, silenciosa
    iniciarAutoSyncCarteraOrange();
  }
  if (id === 'expensas') {
    if (!orangeExpensasDetalleRaw.length) { cargarDetalleExpensas(true); sincronizarOrangeExpensas(); }
    iniciarAutoSyncExpensasOrange();
  }
}

/* ═══════════════════════════════════════════
   RADIO PILLS — interactividad
═══════════════════════════════════════════ */
document.addEventListener('change', e => {
  if (e.target.type !== 'radio') return;
  const row = e.target.closest('.radio-row');
  if (!row) return;
  row.querySelectorAll('.radio-pill').forEach(p => {
    p.classList.remove('sel-si','sel-no','sel-gen');
    const inp = p.querySelector('input');
    if (inp && inp.checked) {
      p.classList.add(inp.value==='SI' ? 'sel-si' : 'sel-no');
    }
  });
});

function poblarSugerenciasClientes() {
  const dl = document.getElementById('f-nombre-sugerencias');
  if (!dl) return;
  const nombres = [...new Set(misRegs.map(r => r.nombre).filter(Boolean))].sort();
  dl.innerHTML = nombres.map(n => `<option value="${esc(n)}"></option>`).join('');
}

function autocompletarClienteExistente() {
  const inp = document.getElementById('f-nombre');
  if (!inp) return;
  inp.classList.remove('input-error');
  const nombre = inp.value.trim().toLowerCase();
  if (!nombre) return;
  // Si el nombre coincide EXACTO con un cliente que este vendedor ya cargó antes,
  // le autocompletamos ciudad/origen con su registro más reciente — así no
  // tiene que volver a tipear todo de cero cada vez que avanza de etapa con el mismo cliente.
  const previos = misRegs.filter(r => (r.nombre||'').trim().toLowerCase() === nombre);
  if (!previos.length) return;
  const masReciente = previos.sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
  const ciudad = document.getElementById('f-ciudad');
  const origen = document.getElementById('f-origen');
  if (ciudad && !ciudad.value && masReciente.ciudadProcedencia) ciudad.value = masReciente.ciudadProcedencia;
  if (origen && !origen.value && masReciente.origen) origen.value = masReciente.origen;
}

/* ═══════════════════════════════════════════
   NOTIFICACIONES
═══════════════════════════════════════════ */
let misNotificaciones = [];

function renderNotificaciones() {
  const badge = document.getElementById('notif-badge');
  const lista = document.getElementById('notif-lista');
  const noLeidas = misNotificaciones.filter(n => !n.leida);
  if (badge) {
    badge.style.display = noLeidas.length ? 'block' : 'none';
    badge.textContent = noLeidas.length > 9 ? '9+' : noLeidas.length;
  }
  if (!lista) return;
  if (!misNotificaciones.length) { lista.innerHTML = '<div class="empty-state" style="padding:16px;">Sin notificaciones.</div>'; return; }
  lista.innerHTML = misNotificaciones.map(n => `
    <div onclick="window._fbMarcarNotifLeida('${asesorActual._key}','${n._key}')" style="padding:10px 12px;border-radius:var(--r-sm);cursor:pointer;background:${n.leida?'transparent':'var(--info-bg,#eef4fb)'};margin-bottom:2px;">
      <div style="font-size:var(--fs-sm);${n.leida?'':'font-weight:600;'}">${n.leida?'':'🔵 '}${esc(n.mensaje)}</div>
      <div style="font-size:var(--fs-xs);color:var(--gris);margin-top:2px;">${new Date(n.ts).toLocaleString('es-BO')}</div>
    </div>`).join('');
}

function toggleNotifDropdown() {
  const dd = document.getElementById('notif-dropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function marcarTodasNotifLeidas() {
  const keys = misNotificaciones.filter(n=>!n.leida).map(n=>n._key);
  if (!keys.length) return;
  await window._fbMarcarTodasLeidas(asesorActual._key, keys);
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('notif-bell-wrap');
  const dd = document.getElementById('notif-dropdown');
  if (wrap && dd && !wrap.contains(e.target)) dd.style.display = 'none';
});

/* ═══════════════════════════════════════════
   SOLICITUDES DE ELIMINACIÓN (Call Center / Marketing → aprueba Administrador)
═══════════════════════════════════════════ */
let solicitudesEliminacionData = [];

async function solicitarEliminacion(coleccionPath, descripcion) {
  const ok = await confirmDialog(
    'No se borra al toque: queda pendiente de autorización del Administrador, y recién ahí se elimina.',
    { title:'Solicitar eliminación', okText:'Solicitar', icon:'🗑' }
  );
  if (!ok) return;
  await window._fbPushSolicitudEliminacion({
    coleccionPath, descripcion,
    solicitadoPorKey: asesorActual?._key || '',
    solicitadoPorNombre: asesorActual?.nombre || '',
  });
  toastOk('Solicitud enviada — queda pendiente de autorización.');
}

function renderSolicitudesEliminacionAdmin() {
  const pend = solicitudesEliminacionData.filter(s => s.estado === 'pendiente');
  const resueltas = solicitudesEliminacionData.filter(s => s.estado !== 'pendiente').slice(0, 30);

  const badge = document.getElementById('nav-elim-badge');
  if (badge) {
    badge.style.display = pend.length ? 'flex' : 'none';
    badge.textContent = pend.length;
  }

  const contP = document.getElementById('elim-pendientes-lista');
  if (contP) {
    contP.innerHTML = pend.length ? pend.map(s => `
      <div class="vendor-item" style="align-items:flex-start;">
        <div>
          <span class="v-name">${esc(s.descripcion)}</span>
          <div style="font-size:var(--fs-xs);color:var(--gris);margin-top:2px;">Pedido por ${esc(s.solicitadoPorNombre||'—')} · ${new Date(s.ts).toLocaleString('es-BO')}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="aprobarSolicitudEliminacion('${s._key}','${esc(s.coleccionPath)}')" style="padding:6px 12px;background:var(--danger);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);cursor:pointer;">🗑 Aprobar y eliminar</button>
          <button onclick="rechazarSolicitudEliminacion('${s._key}')" style="padding:6px 12px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);cursor:pointer;">Rechazar</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Sin solicitudes pendientes.</div>';
  }

  const contR = document.getElementById('elim-resueltas-lista');
  if (contR) {
    contR.innerHTML = resueltas.length ? resueltas.map(s => `
      <div class="vendor-item">
        <span class="v-name" style="text-decoration:${s.estado==='aprobada'?'line-through':'none'};color:var(--gris);">${esc(s.descripcion)}</span>
        <span style="font-size:var(--fs-xs);font-weight:600;color:${s.estado==='aprobada'?'var(--danger)':'var(--ok)'};">${s.estado==='aprobada'?'Eliminado':'Rechazado'}</span>
      </div>`).join('') : '<div class="empty-state">Sin historial todavía.</div>';
  }
}

async function aprobarSolicitudEliminacion(key, coleccionPath) {
  const ok = await confirmDialog('Se va a eliminar definitivamente. Esta acción no se puede deshacer.', { title:'Aprobar y eliminar', okText:'Sí, eliminar' });
  if (!ok) return;
  await window._fbRemoveGenerico(coleccionPath);
  await window._fbResolverSolicitudEliminacion(key, true);
  toastOk('Eliminado.');
}

async function rechazarSolicitudEliminacion(key) {
  await window._fbResolverSolicitudEliminacion(key, false);
  toastOk('Solicitud rechazada — el dato sigue intacto.');
}

/* ═══════════════════════════════════════════
   SOLICITUDES DE CAMBIO DE CATEGORÍA (Cartera pide corregir → aprueba Gerencia)
   Mismo patrón que Solicitudes de Eliminación: quien categoriza NO puede editar
   una categoría ya asignada directamente — solo puede pedir el cambio, y recién
   se aplica cuando Gerencia lo aprueba acá. Queda todo registrado (quién pidió,
   qué cambio, quién aprobó y cuándo).
═══════════════════════════════════════════ */
let solicitudesCambioCategoriaData = [];

async function solicitarCambioCategoria(cobroKey, categoriaActual, categoriaNueva, contextoTxt) {
  if (!categoriaNueva || categoriaNueva === categoriaActual) return;
  // No duplicar: si ya hay una solicitud pendiente para este mismo cobro, no dejar pedir otra.
  const yaPendiente = solicitudesCambioCategoriaData.some(s => s.cobroKey === cobroKey && s.estado === 'pendiente');
  if (yaPendiente) { toastErr('Ya hay una solicitud pendiente para este cobro — esperá a que Gerencia la resuelva.'); renderBuscarCobroCategorizado(); return; }
  const ok = await confirmDialog(
    'Se va a pedir cambiar la categoría de "' + (categoriaActual||'Sin categorizar') + '" a "' + categoriaNueva + '". No se aplica todavía: queda pendiente de autorización de Gerencia.',
    { title:'Solicitar cambio de categoría', okText:'Solicitar', icon:'🔁' }
  );
  if (!ok) { renderBuscarCobroCategorizado(); return; }
  await window._fbPushSolicitudCambioCategoria({
    cobroKey, contexto: contextoTxt || '',
    categoriaActual: categoriaActual || 'Sin categorizar', categoriaNueva,
    solicitadoPorKey: asesorActual?._key || '', solicitadoPorNombre: asesorActual?.nombre || '',
  });
  toastOk('Solicitud enviada — queda pendiente de autorización de Gerencia.');
  renderBuscarCobroCategorizado();
}

function renderSolicitudesCambioCategoriaAdmin() {
  const pend = solicitudesCambioCategoriaData.filter(s => s.estado === 'pendiente');
  const resueltas = solicitudesCambioCategoriaData.filter(s => s.estado !== 'pendiente').slice(0, 30);

  const badge = document.getElementById('nav-cambiocat-badge');
  if (badge) {
    badge.style.display = pend.length ? 'flex' : 'none';
    badge.textContent = pend.length;
  }

  const contP = document.getElementById('cambiocat-pendientes-lista');
  if (contP) {
    contP.innerHTML = pend.length ? pend.map(s => `
      <div class="vendor-item" style="align-items:flex-start;">
        <div>
          <span class="v-name">${esc(s.contexto || s.cobroKey)}</span>
          <div style="font-size:var(--fs-sm);margin-top:2px;"><b>${esc(s.categoriaActual)}</b> → <b style="color:var(--warn);">${esc(s.categoriaNueva)}</b></div>
          <div style="font-size:var(--fs-xs);color:var(--gris);margin-top:2px;">Pedido por ${esc(s.solicitadoPorNombre||'—')} · ${new Date(s.ts).toLocaleString('es-BO')}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="aprobarCambioCategoria('${s._key}')" style="padding:6px 12px;background:var(--ok);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);cursor:pointer;">✓ Aprobar y aplicar</button>
          <button onclick="rechazarCambioCategoria('${s._key}')" style="padding:6px 12px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);cursor:pointer;">Rechazar</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Sin solicitudes pendientes.</div>';
  }

  const contR = document.getElementById('cambiocat-resueltas-lista');
  if (contR) {
    contR.innerHTML = resueltas.length ? resueltas.map(s => `
      <div class="vendor-item">
        <span class="v-name">${esc(s.contexto || s.cobroKey)} — <span style="color:var(--gris);font-weight:400;">${esc(s.categoriaActual)} → ${esc(s.categoriaNueva)}</span></span>
        <span style="font-size:var(--fs-xs);font-weight:600;color:${s.estado==='aprobada'?'var(--ok)':'var(--danger)'};">${s.estado==='aprobada'?('Aplicado por '+esc(s.aprobadoPorNombre||'—')):'Rechazado'}</span>
      </div>`).join('') : '<div class="empty-state">Sin historial todavía.</div>';
  }
}

async function aprobarCambioCategoria(key) {
  const s = solicitudesCambioCategoriaData.find(x => x._key === key);
  if (!s) return;
  const ok = await confirmDialog(
    'Se va a cambiar la categoría de este cobro de "' + s.categoriaActual + '" a "' + s.categoriaNueva + '".',
    { title:'Aprobar cambio de categoría', okText:'Sí, aplicar' }
  );
  if (!ok) return;
  await window._fbSetCategoriaCobro(s.cobroKey, { categoria: s.categoriaNueva, asignadoPorNombre: 'Corrección aprobada por ' + (asesorActual?.nombre || 'Gerencia') });
  await window._fbResolverSolicitudCambioCategoria(key, true, asesorActual?.nombre || 'Gerencia');
  toastOk('Categoría corregida y solicitud aprobada.');
}

async function rechazarCambioCategoria(key) {
  await window._fbResolverSolicitudCambioCategoria(key, false, asesorActual?.nombre || 'Gerencia');
  toastOk('Solicitud rechazada — la categoría no cambió.');
}

/* ── Buscar un cobro YA categorizado (por cliente o terreno) para pedir su corrección ── */
function renderBuscarCobroCategorizado() {
  const tbody = document.getElementById('cartera-categorizado-tbody');
  if (!tbody) return;
  const term = (document.getElementById('cartera-buscar-categorizado')?.value || '').trim().toLowerCase();
  if (!term) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Escribí un cliente o terreno para buscar.</div></td></tr>'; return; }
  if (typeof orangeCarteraDetalleRaw === 'undefined' || typeof carteraCategoriasData === 'undefined') return;

  let categorizados = orangeCarteraDetalleRaw.filter(r => carteraCategoriasData[r.key] &&
    (String(r.cliente||'').toLowerCase().includes(term) || String(r.terreno||'').toLowerCase().includes(term)));
  categorizados = categorizados.sort((a,b) => (b.fechaOrden||0) - (a.fechaOrden||0)).slice(0, 100);

  if (!categorizados.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Sin coincidencias entre los cobros ya categorizados.</div></td></tr>'; return; }

  const opciones = (typeof CARTERA_CATEGORIAS !== 'undefined' ? CARTERA_CATEGORIAS : []).map(c=>`<option value="${c}">${c}</option>`).join('');
  tbody.innerHTML = categorizados.map(r => {
    const catActual = carteraCategoriasData[r.key]?.categoria || 'Sin categorizar';
    const pendiente = solicitudesCambioCategoriaData.some(s => s.cobroKey === r.key && s.estado === 'pendiente');
    const contexto = r.cliente + ' — ' + r.terreno + ' (' + r.tipoPago + ', $' + Math.round(r.monto).toLocaleString('es-BO') + ', ' + r.fecha + ')';
    return `<tr>
      <td style="font-size:var(--fs-sm);">${esc(r.fecha)}</td>
      <td>${esc(r.cliente)}</td>
      <td style="font-family:monospace;font-size:var(--fs-sm);">${esc(r.terreno)}</td>
      <td style="font-size:var(--fs-sm);">${r.tipoPago}</td>
      <td style="font-weight:600;color:var(--cartera);">$${r.monto.toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
      <td><span style="font-weight:600;">${esc(catActual)}</span></td>
      <td>${pendiente
        ? '<span style="font-size:var(--fs-xs);font-weight:700;color:var(--warn);">⏳ Pendiente de aprobación</span>'
        : `<select onchange="solicitarCambioCategoria('${r.key}','${escJs(catActual)}',this.value,'${escJs(contexto)}');this.value='';" style="padding:6px 10px;border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-family:'DM Sans',sans-serif;">
            <option value="">Corregir a...</option>${opciones}
          </select>`
      }</td>
    </tr>`;
  }).join('');
}


/* ═══════════════════════════════════════════
   ORÍGENES DE VENTA (gestionables desde Config)
═══════════════════════════════════════════ */
let origenesData = [];
let ventasConcretadasData = [];
let politicaDescuentoData = [];
let plazosModalidadData = {};

function renderOrigenes() {
  const cont = document.getElementById('origenes-lista');
  if (cont) {
    cont.innerHTML = origenesData.length ? origenesData.map(o => `
      <div class="vendor-item">
        <span class="v-name">${esc(o.nombre)}</span>
        <button class="btn-remove-vendor" onclick="window._fbRemoveOrigen('${o._key}')">×</button>
      </div>`).join('') : '<div class="empty-state">Sin orígenes cargados todavía.</div>';
  }
  ['f-origen','cc-origen'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      origenesData.map(o => `<option value="${esc(o.nombre)}">${esc(o.nombre)}</option>`).join('');
    sel.value = actual;
  });
}

async function agregarOrigen() {
  const inp = document.getElementById('nuevo-origen-nombre');
  const nombre = inp.value.trim();
  if (!nombre) { toastErr('Escribí el nombre del nuevo origen.'); return; }
  if (origenesData.some(o => o.nombre.toLowerCase() === nombre.toLowerCase())) { toastErr('Ya existe ese origen.'); return; }
  await window._fbPushOrigen(nombre);
  inp.value = '';
  toastOk('Origen "'+nombre+'" agregado.');
}

/* ═══════════════════════════════════════════
   CALL CENTER — Agendar visitas para un asesor
═══════════════════════════════════════════ */
function mostrarFichaVisita(v) {
  setText('ficha-nombre', v.nombre);
  setText('ficha-telefono', v.telefono || 'Sin teléfono');
  setText('ficha-asesor', v.asesorNombre || '—');
  const fechaFmt = v.fecha ? new Date(v.fecha+'T00:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  setText('ficha-fecha', fechaFmt + (v.hora?' · '+v.hora:''));
  const badges = document.getElementById('ficha-badges');
  if (badges) {
    let html = '';
    if (v.origen) html += `<span style="padding:5px 12px;border-radius:999px;background:var(--info-bg,#eef4fb);color:var(--info);font-size:var(--fs-sm);font-weight:600;">${esc(v.origen)}</span>`;
    if (v.campaniaCodigo) html += `<span style="padding:5px 12px;border-radius:999px;background:var(--verde-bg);color:var(--verde);font-size:var(--fs-sm);font-weight:600;font-family:monospace;">${esc(v.campaniaCodigo)}</span>`;
    badges.innerHTML = html;
  }
  const interesWrap = document.getElementById('ficha-interes-wrap');
  if (interesWrap) {
    if (v.interes) { setText('ficha-interes', v.interes); interesWrap.style.display = 'block'; }
    else interesWrap.style.display = 'none';
  }
  document.getElementById('modal-ficha-visita').classList.add('open');
}
function cerrarFichaVisita() {
  document.getElementById('modal-ficha-visita').classList.remove('open');
}

function poblarSelectAsesorCallCenter() {
  const sel = document.getElementById('cc-asesor');
  if (!sel) return;
  const vendedores = asesores.filter(a => (a.modulos || ROL_MODULOS[a.rol] || []).includes('ventas'));
  const actual = sel.value;
  sel.innerHTML = '<option value="">Seleccionar asesor...</option>' +
    vendedores.map(a => `<option value="${a._key}">${esc(a.nombre)}</option>`).join('');
  sel.value = actual;
}

// Devuelve el AÑO EN QUE EMPIEZA la gestión (ej: abril 2026 a marzo 2027 = gestión "2026").
function _gestionDeFecha(fecha) {
  if (!fecha) return null;
  const anio = fecha.getFullYear(), mes = fecha.getMonth(); // 0=enero, 3=abril
  return mes >= 3 ? anio : anio - 1;
}
function _gestionActual() {
  return _gestionDeFecha(new Date());
}
function _labelGestion(anioInicio) {
  return 'Abr ' + anioInicio + ' – Mar ' + (anioInicio+1);
}
/* ═══════════════════════════════════════════
   CONTRATO FIRMADO — Reserva → pendiente de autorización → Venta Concretada
═══════════════════════════════════════════ */
let _cfRegistroActual = null;

