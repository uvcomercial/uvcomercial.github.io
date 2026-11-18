/* ═══════════════════════════════════════════════════════════════════════
   SEGURIDAD Y SESIONES
   - Sesión recordada por dispositivo (como un ERP): token aleatorio de 256 bits
     en el navegador; en Firebase solo se guarda su huella SHA-256 (sesiones/{huella}),
     con vencimiento, dispositivo y último uso. Se puede revocar desde Sistema.
   - PIN nunca más en texto: PBKDF2-SHA256 (150.000 iteraciones, sal por usuario).
     Los PIN viejos se convierten solos la primera vez que la persona entra.
   - 5 intentos fallidos → usuario bloqueado 5 minutos. Registro de accesos.
   - Bloqueo de pantalla por inactividad: se desbloquea solo con el PIN.
   - Cambiar el PIN de alguien cierra todas sus sesiones.
═══════════════════════════════════════════════════════════════════════ */
const SEG_ITER = 150000;
const SEG_MAX_INTENTOS = 5;
const SEG_BLOQUEO_MIN = 5;
let segConfig = { diasSesion: 30, bloqueoMin: 20 };
let segAdminSeguro = null;          // config/adminPinSeguro {hash, salt, ts}
let segAdminCargado = false;
let segSesionId = null;             // huella de la sesión actual
let segRecordar = true;
let segUltimaActividad = Date.now();
let segBloqueada = false;
let segRestauracionHecha = false;

const _segLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
const _segSS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };
const _segHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const _segRand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return _segHex(a); };
async function _segSha256(txt) { return _segHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))); }
async function segHashPin(pin, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:new TextEncoder().encode(salt), iterations:SEG_ITER }, k, 256);
  return _segHex(bits);
}
async function segNuevoPinSeguro(pin) { const salt = _segRand(16); return { pinHash: await segHashPin(pin, salt), pinSalt: salt, pinIter: SEG_ITER, pinCambiadoTs: Date.now() }; }
function _segIgual(a, b) { if (!a || !b || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

function segDispositivo() {
  const ua = navigator.userAgent || '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return nav + (so ? ' · ' + so : '');
}

/* Registro de usuario actual para seguridad */
function _segUid() { return modoAdmin ? 'admin' : (asesorActual?._key || ''); }
function _segNombre() { return modoAdmin ? 'Administrador' : (asesorActual?.nombre || ''); }

/* ── Verificación de PIN (con migración desde texto plano) ── */
async function segVerificarPin(uid, pin) {
  if (uid === 'admin') {
    if (segAdminSeguro?.hash) return { ok: _segIgual(await segHashPin(pin, segAdminSeguro.salt), segAdminSeguro.hash) };
    if (pinAdminLocal !== null && pinAdminLocal !== undefined) {
      const ok = pin === String(pinAdminLocal);
      if (ok) { // convertir el PIN de admin a hash y borrar el texto plano
        const s = await segNuevoPinSeguro(pin);
        segAdminSeguro = { hash: s.pinHash, salt: s.pinSalt, ts: 0 };   // migrar no cierra sesiones
        try { await window._fbSeg.multi({ 'config/adminPinSeguro': segAdminSeguro, 'config/adminPin': null }); pinAdminLocal = null; } catch (e) { console.error('[SEG] migrar admin', e); }
      }
      return { ok };
    }
    return { ok: false, cargando: true };
  }
  const a = asesores.find(x => x._key === uid); if (!a) return { ok: false };
  if (a.pinHash && a.pinSalt) {
    const h = await segHashPin(pin, a.pinSalt);
    return { ok: _segIgual(h, a.pinHash) };
  }
  const ok = a.pin !== undefined && a.pin !== null && pin === String(a.pin);
  if (ok) {
    const s = await segNuevoPinSeguro(pin);
    delete s.pinCambiadoTs;                 // migrar no es "cambiar el PIN": no cierra sesiones
    try { await window._fbSeg.update('asesores_planilla/' + uid, { ...s, pin: null }); Object.assign(a, s); delete a.pin; } catch (e) { console.error('[SEG] migrar pin', e); }
  }
  return { ok };
}

/* ── Bloqueo por intentos fallidos ── */
async function _segEstadoBloqueo(uid) {
  try { return (await window._fbSeg.get('seguridad/bloqueos/' + uid)) || {}; } catch (e) { return {}; }
}
async function _segRegistrarFallo(uid, nombre) {
  const b = await _segEstadoBloqueo(uid);
  const intentos = (b.hasta && b.hasta < Date.now() ? 0 : (b.intentos || 0)) + 1;
  const upd = { intentos, ultimoFallo: Date.now() };
  if (intentos >= SEG_MAX_INTENTOS) upd.hasta = Date.now() + SEG_BLOQUEO_MIN * 60000;
  try { await window._fbSeg.set('seguridad/bloqueos/' + uid, { ...upd, nombre }); } catch (e) {}
  _segLog(uid, nombre, upd.hasta ? 'bloqueado' : 'pin-incorrecto');
  return { intentos, bloqueadoHasta: upd.hasta || null };
}
function _segLog(uid, nombre, resultado) {
  try { window._fbSeg.push('seguridad/accesos', { uid, nombre, resultado, ts: Date.now(), dispositivo: segDispositivo() }); } catch (e) {}
}

/* ── Reemplaza verificarPin del login ── */
async function verificarPin() {
  const card = document.querySelector('.login-card');
  const numpad = document.querySelector('.numpad');
  const err = document.getElementById('pin-err');
  const uid = _segUid(), nombre = _segNombre();
  const pin = pinBuf;
  if (numpad) numpad.style.opacity = '.5';
  const fallar = (msg) => {
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    if (numpad) numpad.style.opacity = '1';
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    pinBuf = ''; actualizarDots();
  };
  if (!uid) return fallar('Elegí un usuario.');
  const b = await _segEstadoBloqueo(uid);
  if (b.hasta && b.hasta > Date.now()) return fallar(`Usuario bloqueado por intentos fallidos. Probá de nuevo en ${Math.ceil((b.hasta - Date.now()) / 60000)} min, o pedile al administrador que lo desbloquee.`);
  const r = await segVerificarPin(uid, pin);
  if (r.cargando) return fallar('Todavía está cargando — esperá un segundo y probá de nuevo.');
  if (!r.ok) {
    const f = await _segRegistrarFallo(uid, nombre);
    return fallar(f.bloqueadoHasta ? `PIN incorrecto. Por seguridad el usuario quedó bloqueado ${SEG_BLOQUEO_MIN} minutos.` : `PIN incorrecto. Te quedan ${SEG_MAX_INTENTOS - f.intentos} intento(s).`);
  }
  if (b.intentos) { try { await window._fbSeg.set('seguridad/bloqueos/' + uid, null); } catch (e) {} }
  segRecordar = document.getElementById('seg-recordar')?.checked !== false;
  _segLS('uv-recordar-pref', segRecordar ? '1' : '0');
  await segCrearSesion(uid, nombre);
  _segLog(uid, nombre, 'ingreso');
  _segAgregarReciente(uid, nombre);
  document.getElementById('pin-step').style.display = 'none';
  if (modoAdmin) entrarAdmin(); else entrarAsesor();
  segIniciarVigilancia();
}

/* ── Sesiones ── */
async function segCrearSesion(uid, nombre) {
  const token = _segRand(32);
  const id = await _segSha256(token);
  const ahora = Date.now();
  const dias = segRecordar ? (segConfig.diasSesion || 30) : 1;
  const ses = { uid, nombre, esAdmin: uid === 'admin', creado: ahora, ultimoUso: ahora, expira: ahora + dias * 86400000, recordar: segRecordar, dispositivo: segDispositivo(), revocada: false };
  try { await window._fbSeg.set('sesiones/' + id, ses); } catch (e) { console.error('[SEG] crear sesión', e); }
  const guardado = JSON.stringify({ token, uid, nombre });
  if (segRecordar) { _segLS('uv-ses', guardado); _segSS('uv-ses', null); }
  else { _segSS('uv-ses', guardado); _segLS('uv-ses', null); }
  segSesionId = id;
}
function _segLeerLocal() { try { return JSON.parse(_segLS('uv-ses') || _segSS('uv-ses') || 'null'); } catch (e) { return null; } }
function _segBorrarLocal() { _segLS('uv-ses', null); _segSS('uv-ses', null); }

function _segUsuarioValido(ses) {
  if (ses.uid === 'admin') return !segAdminSeguro?.ts || ses.creado >= segAdminSeguro.ts - 1000;
  const a = asesores.find(x => x._key === ses.uid);
  if (!a) return false;
  if (a.pinCambiadoTs && ses.creado < a.pinCambiadoTs) return false;   // le cambiaron el PIN después de esta sesión
  if (a.activo === false) return false;
  return true;
}

async function segIntentarRestaurar() {
  if (segRestauracionHecha) return;
  if (!_asesoresRecibidos || !segAdminCargado) return;
  segRestauracionHecha = true;
  const ls = document.getElementById('login-screen');
  if (window._fbAuth?.usuario) return segEntrarMicrosoft(ls);
  const loc = _segLeerLocal();
  if (!loc?.token) { ls?.classList.remove('uv-restaurando'); return; }
  try {
    const id = await _segSha256(loc.token);
    const ses = await window._fbSeg.get('sesiones/' + id);
    const desde = await window._fbSeg.get('seguridad/config/sesionesValidasDesde');
    const ahora = Date.now();
    if (!ses || ses.revocada || ses.expira < ahora || (desde && ses.creado < desde) || !_segUsuarioValido(ses)) {
      _segBorrarLocal(); ls?.classList.remove('uv-restaurando');
      if (ses && !ses.revocada && ses.expira < ahora) toastInfo('Tu sesión venció. Ingresá tu PIN para continuar.');
      return;
    }
    // sesión válida: se extiende (máximo 90 días desde que se creó)
    const dias = ses.recordar ? (segConfig.diasSesion || 30) : 1;
    const nuevaExp = Math.min(ahora + dias * 86400000, ses.creado + 90 * 86400000);
    window._fbSeg.update('sesiones/' + id, { ultimoUso: ahora, expira: nuevaExp, dispositivo: segDispositivo() });
    segSesionId = id; segRecordar = !!ses.recordar;
    if (ses.uid === 'admin') { asesorActual = null; modoAdmin = true; entrarAdmin(); }
    else { asesorActual = asesores.find(x => x._key === ses.uid); modoAdmin = false; entrarAsesor(); }
    ls?.classList.remove('uv-restaurando');
    segIniciarVigilancia();
  } catch (e) {
    console.error('[SEG] restaurar', e); ls?.classList.remove('uv-restaurando');
  }
}

async function segCerrarSesionActual(todas) {
  try {
    if (todas) {
      const uid = _segUid();
      const all = (await window._fbSeg.get('sesiones')) || {};
      const upd = {};
      Object.entries(all).forEach(([k, s]) => { if (s.uid === uid && !s.revocada) { upd['sesiones/' + k + '/revocada'] = true; upd['sesiones/' + k + '/cerradaTs'] = Date.now(); } });
      if (Object.keys(upd).length) await window._fbSeg.multi(upd);
    } else if (segSesionId) {
      await window._fbSeg.update('sesiones/' + segSesionId, { revocada: true, cerradaTs: Date.now(), motivo: 'salió' });
    }
  } catch (e) {}
  _segLog(_segUid(), _segNombre(), todas ? 'salió (todos los dispositivos)' : 'salió');
  _segBorrarLocal();
}

/* ── Ingreso con la cuenta de Microsoft (correo @urubovillage.com) ──
   El usuario ya viene identificado por Firebase; acá se elige su perfil y se registra la sesión
   (así sigue apareciendo en Sesiones activas y el administrador la puede cerrar). */
async function segEntrarMicrosoft(ls) {
  const u = window._fbAuth.usuario;
  const fuera = async msg => { _segBorrarLocal(); await window._fbAuth.salir(); toastErr(msg); setTimeout(() => location.reload(), 2500); };
  if (u.uid !== 'admin') { const a = asesores.find(x => x._key === u.uid); if (!a || a.activo === false) return fuera('Tu usuario está desactivado en la plataforma. Hablá con el administrador.'); }
  const loc = _segLeerLocal(), ahora = Date.now();
  let reusar = false;
  if (loc?.token && loc.uid === u.uid) {
    try {
      const id = await _segSha256(loc.token), ses = await window._fbSeg.get('sesiones/' + id), desde = await window._fbSeg.get('seguridad/config/sesionesValidasDesde');
      if (ses && (ses.revocada || (desde && ses.creado < desde))) return fuera('Tu sesión fue cerrada por el administrador. Volvé a ingresar con Microsoft.');
      if (ses && ses.expira > ahora) { segSesionId = id; segRecordar = true; reusar = true; window._fbSeg.update('sesiones/' + id, { ultimoUso: ahora, expira: Math.min(ahora + (segConfig.diasSesion || 30) * 864e5, ses.creado + 90 * 864e5), dispositivo: segDispositivo() }); }
    } catch (e) {}
  }
  const nombre = u.uid === 'admin' ? 'Administrador' : (asesores.find(x => x._key === u.uid)?.nombre || u.nombre);
  if (!reusar) { segRecordar = true; await segCrearSesion(u.uid, nombre); try { await window._fbSeg.update('sesiones/' + segSesionId, { correo: u.correo, metodo: 'microsoft' }); } catch (e) {} _segLog(u.uid, nombre, 'ingreso con Microsoft'); }
  if (u.uid === 'admin') { asesorActual = null; modoAdmin = true; entrarAdmin(); }
  else { asesorActual = asesores.find(x => x._key === u.uid); modoAdmin = false; entrarAsesor(); }
  ls?.classList.remove('uv-restaurando');
  segIniciarVigilancia();
}

/* Accesos con Microsoft: qué correo entra como qué usuario (solo administrador) */
let segAccesoData = null;
function segAccesoIniciar() {
  if (window._segAccIni || !modoAdmin || !window._fbAcceso) return; window._segAccIni = true;
  window._fbAcceso.listen(m => { segAccesoData = m; segRenderAdmin(); });
}
function _segAccNombre(uid) { return uid === 'admin' ? 'Administrador' : (asesores.find(a => a._key === uid)?.nombre || '(usuario borrado)'); }
async function segAccesoGuardar() {
  const correo = (document.getElementById('ms-acc-correo')?.value || '').trim().toLowerCase(), uid = document.getElementById('ms-acc-uid')?.value;
  if (!/^[^@\s]+@urubovillage\.com$/.test(correo)) return toastErr('Escribí un correo @urubovillage.com.');
  if (!uid) return toastErr('Elegí el usuario de la plataforma.');
  try { await window._fbAcceso.set(correo, { uid, nombre: _segAccNombre(uid), correo, activo: true, ts: Date.now() }); toastOk(correo + ' ya puede entrar como ' + _segAccNombre(uid) + '.'); document.getElementById('ms-acc-correo').value = ''; }
  catch (e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function segAccesoQuitar(correo) {
  const ok = await confirmDialog(correo + ' no va a poder entrar más a la plataforma.', { title: 'Quitar acceso', okText: 'Quitar acceso' });
  if (!ok) return;
  try { await window._fbAcceso.quitar(correo); toastOk('Acceso quitado.'); } catch (e) { toastErr('No se pudo quitar: ' + e.message); }
}
function _segAccHtml() {
  if (!window._fbAcceso) return '';
  const filas = Object.values(segAccesoData || {}).sort((a, b) => String(a.correo).localeCompare(b.correo));
  const vinculados = new Set(filas.map(f => f.uid));
  const sinCorreo = asesores.filter(a => a.activo !== false && !vinculados.has(a._key)).map(a => a.nombre);
  const ultimo = {}; Object.values(segSesionesData || {}).forEach(s => { if (s.metodo === 'microsoft' && s.correo && (!ultimo[s.correo] || s.ultimoUso > ultimo[s.correo])) ultimo[s.correo] = s.ultimoUso; });
  const opts = `<option value="">Usuario de la plataforma…</option><option value="admin">Administrador</option>` + asesores.filter(a => a.activo !== false).map(a => `<option value="${esc(a._key)}">${esc(a.nombre)} · ${esc(a.rol || '')}</option>`).join('');
  return `<h4 class="seg-h">Ingreso con Microsoft (${filas.length} correos)</h4>
    ${window._fbAuth?.pinTemporal ? `<div class="seg-nota">Período de transición: todavía se puede entrar con PIN. Cuando todos hayan entrado una vez con Microsoft, se cierra la base y el PIN deja de funcionar.${sinCorreo.length ? ' Usuarios activos sin correo vinculado: <b>' + sinCorreo.map(esc).join(', ') + '</b>.' : ''}</div>` : ''}
    <div class="ms-acc-form"><label>Correo<input id="ms-acc-correo" type="email" placeholder="nombre@urubovillage.com" autocomplete="off"></label><label>Entra como<select id="ms-acc-uid">${opts}</select></label><button class="btn-primary btn-sm" onclick="segAccesoGuardar()">Dar acceso</button></div>
    <div class="tabla-wrap"><table class="tabla-compacta"><thead><tr><th>Correo</th><th>Entra como</th><th>Último ingreso con Microsoft</th><th></th></tr></thead><tbody>
      ${segAccesoData === null ? '<tr><td colspan="4">Cargando…</td></tr>' : filas.length ? filas.map(f => `<tr><td><b>${esc(f.correo)}</b></td><td>${esc(_segAccNombre(f.uid))}</td><td>${ultimo[f.correo] ? _segF(ultimo[f.correo]) : '<span style="color:var(--t-faint,#9A8F76)">todavía no entró</span>'}</td><td><button class="btn-secondary btn-sm" onclick="segAccesoQuitar('${esc(f.correo)}')">Quitar</button></td></tr>`).join('') : '<tr><td colspan="4">Ningún correo vinculado.</td></tr>'}
    </tbody></table></div>`;
}

/* Salir: cierra la sesión de verdad (no solo recarga) */
async function cerrarSesion() {
  await segCerrarSesionActual(false);
  if (window._fbAuth?.usuario) await window._fbAuth.salir();
  location.reload();
}
async function confirmarSalir() {
  const ok = await confirmDialog('Se cierra tu sesión en este dispositivo. La próxima vez vas a entrar con tu PIN.', { title:'Cerrar sesión', okText:'Salir', icon:'⏻' });
  if (ok) cerrarSesion();
}

/* ── Recientes en este dispositivo (sin datos sensibles: solo id y nombre) ── */
function _segRecientes() { try { return JSON.parse(_segLS('uv-recientes') || '[]'); } catch (e) { return []; } }
function _segAgregarReciente(uid, nombre) {
  const l = _segRecientes().filter(x => x.uid !== uid);
  l.unshift({ uid, nombre, ts: Date.now() });
  _segLS('uv-recientes', JSON.stringify(l.slice(0, 4)));
}
function segQuitarReciente(uid, ev) { ev?.stopPropagation(); _segLS('uv-recientes', JSON.stringify(_segRecientes().filter(x => x.uid !== uid))); segRenderRecientes(); }
function segRenderRecientes() {
  const box = document.getElementById('seg-recientes'); if (!box) return;
  const lista = _segRecientes().filter(r => r.uid === 'admin' || asesores.some(a => a._key === r.uid));
  const grid = document.getElementById('step-usuario');
  if (!lista.length) { box.innerHTML = ''; grid?.classList.remove('seg-con-recientes'); return; }
  grid?.classList.add('seg-con-recientes');
  box.innerHTML = `<p class="step-title">Continuar como</p>` + lista.map(r => {
    const a = asesores.find(x => x._key === r.uid);
    const rol = r.uid === 'admin' ? 'Controller / Gerente Comercial' : ((typeof ROL_LABELS !== 'undefined' && ROL_LABELS[a?.rol]?.label) || 'Usuario');
    const ini = r.uid === 'admin' ? 'A' : iniciales(a?.nombre || r.nombre);
    return `<button class="asesor-btn seg-rec" onclick="${r.uid === 'admin' ? 'seleccionarAdmin(this)' : `seleccionarAsesor('${r.uid}', this)`}">
      <div class="av ${r.uid === 'admin' ? 'av-admin' : ''}">${esc(ini)}</div>
      <div class="info"><div class="name">${esc(a?.nombre || r.nombre)}</div><div class="role">${esc(rol)}</div></div>
      <span class="seg-rec-x" title="Quitar de este dispositivo" onclick="segQuitarReciente('${r.uid}', event)">×</span>
    </button>`;
  }).join('') + `<button class="seg-otro" onclick="document.getElementById('step-usuario').classList.toggle('seg-ver-todos')">Otro usuario</button>`;
}

/* ── Bloqueo por inactividad ── */
function segIniciarVigilancia() {
  if (window._segVigilando) return; window._segVigilando = true;
  const marcar = () => { if (!segBloqueada) segUltimaActividad = Date.now(); };
  ['mousemove','mousedown','keydown','touchstart','wheel','scroll'].forEach(ev => document.addEventListener(ev, marcar, { passive:true, capture:true }));
  setInterval(() => {
    const min = Number(segConfig.bloqueoMin) || 0;
    if (min > 0 && !segBloqueada && Date.now() - segUltimaActividad > min * 60000) segBloquear();
  }, 15000);
  // la sesión puede ser cerrada por el administrador: se verifica cada 2 minutos
  setInterval(async () => {
    if (!segSesionId) return;
    try {
      if (_segUid() === 'admin') segAdminSeguro = await window._fbSeg.get('config/adminPinSeguro');
      const s = await window._fbSeg.get('sesiones/' + segSesionId);
      const desde = await window._fbSeg.get('seguridad/config/sesionesValidasDesde');
      if (!s || s.revocada || s.expira < Date.now() || (desde && s.creado < desde) || !_segUsuarioValido(s)) { _segBorrarLocal(); if (window._fbAuth?.usuario) await window._fbAuth.salir(); alert('Tu sesión fue cerrada (vencida o cerrada por el administrador). Volvé a ingresar con tu PIN.'); location.reload(); }
    } catch (e) {}
  }, 120000);
  // salir en otra pestaña → esta también
  window.addEventListener('storage', e => { if (e.key === 'uv-ses' && !e.newValue && segSesionId && segRecordar) location.reload(); });
}

function segBloquear() {
  if (segBloqueada || !_segUid()) return;
  segBloqueada = true;
  let o = document.getElementById('seg-lock');
  if (!o) { o = document.createElement('div'); o.id = 'seg-lock'; document.body.appendChild(o); }
  const nombre = _segNombre();
  if (window._fbAuth?.usuario) {
    o.innerHTML = `<div class="seg-lock-box">
      <div class="seg-lock-av">${esc(modoAdmin ? 'A' : iniciales(nombre))}</div>
      <div class="seg-lock-n">${esc(nombre)}</div>
      <div class="seg-lock-s">Pantalla bloqueada${Number(segConfig.bloqueoMin) ? ' por ' + segConfig.bloqueoMin + ' min sin actividad' : ''}. Confirmá tu cuenta de Microsoft para seguir donde estabas.</div>
      <button class="ms-btn" style="width:100%" onclick="segDesbloquearMs()">Continuar con Microsoft</button>
      <div id="seg-lock-err" class="seg-lock-err"></div>
      <button class="seg-lock-salir" onclick="cerrarSesion()">No soy ${esc(nombre.split(' ')[0])} · cerrar sesión</button>
    </div>`;
    o.classList.add('open'); return;
  }
  o.innerHTML = `<div class="seg-lock-box">
    <div class="seg-lock-av">${esc(modoAdmin ? 'A' : iniciales(nombre))}</div>
    <div class="seg-lock-n">${esc(nombre)}</div>
    <div class="seg-lock-s">Pantalla bloqueada${Number(segConfig.bloqueoMin) ? ' por ' + segConfig.bloqueoMin + ' min sin actividad' : ''}. Ingresá tu PIN para seguir donde estabas.</div>
    <input id="seg-lock-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="4" placeholder="••••" oninput="this.value=this.value.replace(/\\D/g,''); if(this.value.length===4) segDesbloquear();"/>
    <div id="seg-lock-err" class="seg-lock-err"></div>
    <button class="seg-lock-salir" onclick="cerrarSesion()">No soy ${esc(nombre.split(' ')[0])} · cerrar sesión</button>
  </div>`;
  o.classList.add('open');
  setTimeout(() => document.getElementById('seg-lock-pin')?.focus(), 60);
}
async function segDesbloquearMs() {
  const err = document.getElementById('seg-lock-err');
  try {
    const correo = await window._fbAuth.reautenticar();
    if (correo !== window._fbAuth.usuario.correo) { if (err) err.textContent = 'Esa no es la cuenta de esta sesión (' + window._fbAuth.usuario.correo + ').'; return; }
    segBloqueada = false; segUltimaActividad = Date.now(); document.getElementById('seg-lock')?.classList.remove('open');
  } catch (e) { if (err) err.textContent = /popup-closed|cancelled/.test(e.code || '') ? '' : 'No se pudo confirmar la cuenta (' + (e.code || e.message) + ').'; }
}
async function segDesbloquear() {
  const inp = document.getElementById('seg-lock-pin'), err = document.getElementById('seg-lock-err');
  const uid = _segUid(), pin = inp.value;
  inp.disabled = true;
  const b = await _segEstadoBloqueo(uid);
  if (b.hasta && b.hasta > Date.now()) { await segCerrarSesionActual(false); location.reload(); return; }
  const r = await segVerificarPin(uid, pin);
  inp.disabled = false;
  if (r.ok) {
    if (b.intentos) { try { await window._fbSeg.set('seguridad/bloqueos/' + uid, null); } catch (e) {} }
    segBloqueada = false; segUltimaActividad = Date.now();
    document.getElementById('seg-lock')?.classList.remove('open');
    _segLog(uid, _segNombre(), 'desbloqueo');
    return;
  }
  const f = await _segRegistrarFallo(uid, _segNombre());
  if (f.bloqueadoHasta) { alert('Demasiados intentos. Se cerró la sesión por seguridad.'); await segCerrarSesionActual(false); location.reload(); return; }
  err.textContent = `PIN incorrecto. Te quedan ${SEG_MAX_INTENTOS - f.intentos} intento(s).`;
  inp.value = ''; inp.focus();
}

/* ── Panel de administración: Sistema → Seguridad y sesiones ── */
let segSesionesData = {}, segAccesosData = {}, segBloqueosData = {};
function segIniciarAdmin(forzar) {
  if (window._segAdminIni || (!modoAdmin && !forzar)) return; window._segAdminIni = true;
  window._fbSeg.listen('sesiones', m => { segSesionesData = m || {}; segRenderAdmin(); });
  window._fbSeg.listen('seguridad/bloqueos', m => { segBloqueosData = m || {}; segRenderAdmin(); });
  window._fbSeg.listenUltimos('seguridad/accesos', 80, m => { segAccesosData = m || {}; segRenderAdmin(); });
}
function _segF(ts) { return ts ? new Date(ts).toLocaleString('es-BO', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'; }
function segRenderAdmin() {
  const box = document.getElementById('seg-admin'); if (!box) return;
  const ahora = Date.now();
  const activas = Object.entries(segSesionesData).map(([k, s]) => ({ ...s, _k: k })).filter(s => !s.revocada && s.expira > ahora).sort((a, b) => b.ultimoUso - a.ultimoUso);
  const bloq = Object.entries(segBloqueosData).filter(([, b]) => b.hasta && b.hasta > ahora);
  const acc = Object.values(segAccesosData).sort((a, b) => b.ts - a.ts).slice(0, 60);
  const sinHash = asesores.filter(a => !a.pinHash).length + (segAdminSeguro?.hash ? 0 : 1);
  segAccesoIniciar();
  box.innerHTML = _segAccHtml() + `
    <div class="seg-cfg">
      <label>Mantener sesión iniciada
        <select onchange="segGuardarConfig('diasSesion', Number(this.value))">${[1,7,15,30,60,90].map(d => `<option value="${d}" ${segConfig.diasSesion == d ? 'selected' : ''}>${d} día${d > 1 ? 's' : ''}</option>`).join('')}</select></label>
      <label>Bloquear pantalla tras
        <select onchange="segGuardarConfig('bloqueoMin', Number(this.value))">${[[5,'5 min'],[10,'10 min'],[20,'20 min'],[30,'30 min'],[60,'1 hora'],[0,'Nunca']].map(([v,l]) => `<option value="${v}" ${Number(segConfig.bloqueoMin) === v ? 'selected' : ''}>${l} sin actividad</option>`).join('')}</select></label>
      <button class="btn-secondary btn-sm" onclick="segCerrarTodas()">Cerrar todas las sesiones</button>
    </div>
    ${sinHash ? `<div class="seg-nota">${sinHash} usuario(s) todavía tienen el PIN guardado en texto (incluye admin si figura). Se protege solo la próxima vez que cada uno entre.</div>` : '<div class="seg-nota ok">Todos los PIN están protegidos (cifrado PBKDF2). Ninguno queda en texto en la base.</div>'}
    ${bloq.length ? `<h4 class="seg-h">Usuarios bloqueados</h4><table class="tabla-compacta"><thead><tr><th>Usuario</th><th>Hasta</th><th></th></tr></thead><tbody>${bloq.map(([uid, b]) => `<tr><td>${esc(b.nombre || uid)}</td><td>${_segF(b.hasta)}</td><td><button class="btn-secondary btn-sm" onclick="segDesbloquearUsuario('${uid}')">Desbloquear</button></td></tr>`).join('')}</tbody></table>` : ''}
    <h4 class="seg-h">Sesiones activas (${activas.length})</h4>
    <div class="tabla-wrap"><table class="tabla-compacta"><thead><tr><th>Usuario</th><th>Dispositivo</th><th>Inició</th><th>Último uso</th><th>Vence</th><th>Tipo</th><th></th></tr></thead><tbody>
      ${activas.length ? activas.map(s => `<tr><td><b>${esc(s.nombre)}</b>${s._k === segSesionId ? ' <span class="seg-tag">esta</span>' : ''}</td><td>${esc(s.dispositivo || '—')}</td><td>${_segF(s.creado)}</td><td>${_segF(s.ultimoUso)}</td><td>${_segF(s.expira)}</td><td>${s.recordar ? 'Recordada' : 'Solo hoy'}</td><td>${s._k === segSesionId ? '' : `<button class="btn-del" onclick="segRevocar('${s._k}')">Cerrar</button>`}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Sin sesiones activas.</div></td></tr>'}
    </tbody></table></div>
    <h4 class="seg-h">Últimos accesos</h4>
    <div class="tabla-wrap"><table class="tabla-compacta"><thead><tr><th>Fecha</th><th>Usuario</th><th>Resultado</th><th>Dispositivo</th></tr></thead><tbody>
      ${acc.length ? acc.map(a => `<tr${/incorrecto|bloqueado/.test(a.resultado) ? ' class="seg-fallo"' : ''}><td>${_segF(a.ts)}</td><td>${esc(a.nombre || a.uid)}</td><td>${esc(a.resultado)}</td><td>${esc(a.dispositivo || '')}</td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state">Sin registros todavía.</div></td></tr>'}
    </tbody></table></div>`;
}
async function segGuardarConfig(k, v) { segConfig[k] = v; try { await window._fbSeg.update('seguridad/config', { [k]: v }); toastOk('Configuración de seguridad guardada.'); } catch (e) { toastErr('No se pudo guardar.'); } }
async function segRevocar(k) { const ok = await confirmDialog('Ese dispositivo va a tener que volver a ingresar el PIN.', { title:'Cerrar sesión remota', okText:'Cerrar sesión' }); if (!ok) return; await window._fbSeg.update('sesiones/' + k, { revocada: true, cerradaTs: Date.now(), motivo: 'cerrada por administrador' }); toastOk('Sesión cerrada.'); }
async function segCerrarTodas() {
  const ok = await confirmDialog('Todos los usuarios, en todos los dispositivos (incluida esta), van a tener que volver a ingresar el PIN.', { title:'Cerrar todas las sesiones', okText:'Cerrar todas' });
  if (!ok) return;
  await window._fbSeg.update('seguridad/config', { sesionesValidasDesde: Date.now() });
  _segLog('admin', 'Administrador', 'cerró todas las sesiones');
  _segBorrarLocal(); location.reload();
}
async function segDesbloquearUsuario(uid) { await window._fbSeg.set('seguridad/bloqueos/' + uid, null); toastOk('Usuario desbloqueado.'); }

/* ── Arranque: config, PIN admin protegido, restaurar sesión ── */
document.addEventListener('fb-ready', async () => {
  const ls = document.getElementById('login-screen');
  if (_segLeerLocal()?.token && !new URLSearchParams(location.search).get('cotizacion')) ls?.classList.add('uv-restaurando');
  setTimeout(() => ls?.classList.remove('uv-restaurando'), 6000);   // nunca dejar la pantalla trabada
  try { const c = await window._fbSeg.get('seguridad/config'); if (c) segConfig = { ...segConfig, ...c }; } catch (e) {}
  try { segAdminSeguro = await window._fbSeg.get('config/adminPinSeguro'); } catch (e) {}
  segAdminCargado = true;
  const pref = _segLS('uv-recordar-pref'); const chk = document.getElementById('seg-recordar'); if (chk && pref) chk.checked = pref === '1';
  segIntentarRestaurar();
});
