/* ════════════════════════════════════════════════════════════════════════
   CEREBRO DEL SISTEMA · ANDRÓMEDA · datos
   Cada registro real del sistema es una estrella. Las conexiones salen de lo que
   los registros comparten (cliente, terreno, cotización ↔ visita ↔ registro).
   No inventa nada: todo lo que muestra está en Firebase o en Orange.
   ════════════════════════════════════════════════════════════════════════ */
const CB_REG = [
  { id: 'ventas',       n: 'Ventas',             z: 'Núcleo',           c: '#D88B6E', p: [ .00,  .00,  .00] },
  { id: 'callcenter',   n: 'Call Center',        z: 'Brazo B',          c: '#8FC7B8', p: [ .53,  .00, -2.13] },
  { id: 'cotizaciones', n: 'Cotizaciones',       z: 'Brazo A',          c: '#E0B865', p: [-.53,  .00,  2.13] },
  { id: 'cartera',      n: 'Cartera · Cobranza', z: 'Brazos C y D',     c: '#E7A3C4', p: [ 1.30, .00, -1.90] },
  { id: 'marketing',    n: 'Marketing',          z: 'Brazo menor',      c: '#B8A3D9', p: [-1.55, .00, -.92] },
  { id: 'inventario',   n: 'Inventario · Orange',z: 'Anillo',           c: '#D9CDB4', p: [ .00,  .00,  2.05] },
  { id: 'expensas',     n: 'Expensas',           z: 'Satélites',        c: '#7FBF7A', p: [-1.75, .30, -1.25] },
];
const CB_RI = Object.fromEntries(CB_REG.map((r, i) => [r.id, i]));
const CB_MAX = 40000;

const _cbN = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const _cbTs = (ts, fecha) => {
  if (ts && ts > 1e11) return ts;
  if (fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha)) return new Date(fecha.slice(0, 10) + 'T12:00:00').getTime();
  return 0;
};
const _cbUsd = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-BO');
const _cbHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const _cbHace = ts => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'ahora'; if (m < 60) return m + ' min';
  const h = Math.round(m / 60); if (h < 24) return h + ' h';
  const d = Math.round(h / 24); return d + (d === 1 ? ' día' : ' días');
};
const _cbFecha = ts => ts ? new Date(ts).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }) + ' ' + new Date(ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '';
const _cbHoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const _cbGestion0 = () => { const d = new Date(); const g = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return new Date(g, 3, 1).getTime(); };

/* Lee todo lo que el sistema ya tiene cargado y lo convierte en neuronas */
function cbRecolectar() {
  const out = [];
  const add = o => { if (o.k) out.push(o); };
  const regs = typeof todosRegs !== 'undefined' ? todosRegs : [];
  regs.forEach(r => {
    const cierre = typeof _esCierreVenta === 'function' ? _esCierreVenta(r) : r.conclusion === 'Reserva';
    add({ k: 'reg:' + (r._asesorId || '') + '/' + r._key, reg: 'ventas', ts: _cbTs(r.ts, r.fecha), tipo: cierre ? 'Reserva' : 'Visita registrada',
      titulo: (cierre ? 'Reserva · ' : '') + (r.nombre || 'Cliente'), cliente: r.nombre, terreno: r.terrenoInteres, asesor: r.asesorNombre,
      monto: cierre ? (r.precioVenta || r.precio || 0) : 0, estado: r.conclusion || r.estado || '', big: cierre, raw: r });
    // cuando el cliente vuelve: cada visita nueva es su propio movimiento
    Object.entries(r.visitas || {}).forEach(([vk, v]) => { if (v && v.ts && v.tipo !== 'Virtual') add({ k: 'reg:' + (r._asesorId || '') + '/' + r._key + '/v/' + vk, reg: 'ventas', ts: v.ts, tipo: (v.n || 2) + 'ª visita',
      titulo: (v.n || 2) + 'ª visita · ' + (r.nombre || 'Cliente'), cliente: r.nombre, terreno: r.terrenoInteres, asesor: r.asesorNombre, monto: 0, estado: r.conclusion || '', big: false, raw: r }); });
  });
  (typeof cotizacionesData !== 'undefined' ? cotizacionesData : []).forEach(c => {
    const perfil = c.tipo === 'perfil';
    add({ k: 'cot:' + c._key, reg: 'cotizaciones', ts: c.ts || 0, tipo: perfil ? 'Perfil de búsqueda' : 'Cotización',
      titulo: (c.codigo || 'Cotización') + ' · ' + (c.cliente || ''), cliente: c.cliente, terreno: c.terreno || (c.sugeridos?.[0]?.terreno) || '',
      terrenos: perfil ? (c.sugeridos || []).map(s => s.terreno) : [c.terreno], asesor: c.asesorNombre, monto: c.precioFinal || 0,
      estado: typeof _estadoRealCotizacion === 'function' ? _estadoRealCotizacion(c) : c.estado, raw: c });
  });
  (typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : []).forEach(v => {
    add({ k: 'vis:' + v._key, reg: 'callcenter', ts: _cbTs(v.ts, v.fecha), tipo: v.cotizacionKey ? 'Asignación con cotización' : 'Visita asignada',
      titulo: 'Asignado a ' + (v.asesorNombre || '—') + ' · ' + (v.nombre || ''), cliente: v.nombre, asesor: v.asesorNombre, estado: v.estado, raw: v });
  });
  (typeof leadsSemanalesData !== 'undefined' ? leadsSemanalesData : []).forEach(l => {
    if (!(l.cantidad > 0)) return;
    add({ k: 'lead:' + l._key, reg: 'marketing', ts: _cbTs(l.ts, l.desde), tipo: 'Leads de campaña', titulo: l.cantidad + ' leads · ' + (l.campaniaCodigo || 'sin campaña'),
      campania: l.campaniaCodigo, peso: Math.min(3, 1 + l.cantidad / 40), raw: l });
  });
  const comps = typeof cobCompromisos !== 'undefined' ? cobCompromisos : {};
  Object.entries(comps || {}).forEach(([id, c]) => add({ k: 'comp:' + id, reg: 'cartera', ts: c.ts || _cbTs(0, c.fecha), tipo: 'Compromiso de ' + (c.tipo || 'pago').toLowerCase(),
    titulo: 'Compromiso · ' + (c.cliente || ''), cliente: c.cliente, terrenos: c.terrenos || [], terreno: (c.terrenos || [])[0] || '', monto: c.monto || 0, estado: c.estado, fecha: c.fecha, raw: c }));
  const crm = typeof cobClientesCRM !== 'undefined' ? cobClientesCRM : {};
  Object.entries(cb.gestiones || {}).forEach(([cli, gs]) => Object.entries(gs || {}).forEach(([id, g]) => add({ k: 'gest:' + cli + '/' + id, reg: 'cartera', ts: g.ts || _cbTs(0, g.fecha),
    tipo: 'Gestión de cobranza', titulo: (g.resultado || 'Gestión') + ' · ' + (crm[cli]?.nombre || ''), cliente: crm[cli]?.nombre, terrenos: crm[cli]?.terrenos || [], asesor: g.autor, raw: g })));
  (typeof orangeCarteraDetalleRaw !== 'undefined' ? orangeCarteraDetalleRaw : []).forEach(p => add({ k: 'pag:' + p.key, reg: 'cartera', ts: p.fechaOrden || 0, tipo: 'Pago de ' + (p.tipoPago || 'cuota').toLowerCase(),
    titulo: 'Pago ' + _cbUsd(p.monto) + ' · ' + (p.cliente || ''), cliente: p.cliente, terreno: p.terreno, asesor: p.asesor, monto: p.monto, raw: p }));
  (typeof orangeExpensasDetalleRaw !== 'undefined' ? orangeExpensasDetalleRaw : []).forEach(p => add({ k: 'exp:' + p.key, reg: 'expensas', ts: p.fechaOrden || 0, tipo: 'Cobro de expensas',
    titulo: 'Expensa Bs ' + Math.round(p.monto).toLocaleString('es-BO') + ' · ' + (p.cliente || ''), cliente: p.cliente, terreno: p.terreno, monto: p.monto, raw: p }));
  (typeof todosLotes !== 'undefined' ? todosLotes : []).forEach(l => {
    const cod = typeof _terrenoDeLote === 'function' ? _terrenoDeLote(l) : l.terreno;
    add({ k: 'lote:' + l._key, reg: 'inventario', ts: 0, tipo: 'Terreno', titulo: 'Terreno ' + cod, terreno: cod, estado: l.estado || 'Disponible', monto: l.precio || 0, raw: l, fijo: true });
  });
  // tope de seguridad: las más recientes por región
  if (out.length > CB_MAX) { out.sort((a, b) => (b.fijo ? 1e15 : b.ts) - (a.fijo ? 1e15 : a.ts)); out.length = CB_MAX; }
  return out;
}

/* Índices por cliente y terreno → conexiones */
function cbConectar() {
  const porCli = new Map(), porTer = new Map(), porKey = new Map();
  cb.N.forEach((n, i) => {
    porKey.set(n.k, i);
    const c = _cbN(n.cliente); if (c && c.length > 3) (porCli.get(c) || porCli.set(c, []).get(c)).push(i);
    (n.terrenos || [n.terreno]).filter(Boolean).forEach(t => { const tn = _cbN(t); (porTer.get(tn) || porTer.set(tn, []).get(tn)).push(i); });
  });
  const L = new Set(), vec = cb.N.map(() => []);
  const unir = (a, b) => { if (a === b || a == null || b == null) return; const k = a < b ? a + ':' + b : b + ':' + a; if (L.has(k)) return; L.add(k); vec[a].push(b); vec[b].push(a); };
  const porReg = new Map(); cb.N.forEach((n, i) => { if (n.k.startsWith('reg:')) porReg.set(n.raw._key, i); });
  cb.N.forEach((n, i) => {
    const r = n.raw || {};
    if (n.k.startsWith('cot:')) { if (r.visitaKey) unir(i, porKey.get('vis:' + r.visitaKey)); if (r.registroKey) unir(i, porReg.get(r.registroKey)); }
    if (n.k.startsWith('vis:') && r.cotizacionKey) unir(i, porKey.get('cot:' + r.cotizacionKey));
  });
  const encadenar = arr => { const s = arr.slice().sort((a, b) => cb.N[a].ts - cb.N[b].ts); for (let j = 1; j < s.length && j < 60; j++) unir(s[j - 1], s[j]); };
  porCli.forEach(encadenar);
  porTer.forEach(arr => { const lote = arr.find(i => cb.N[i].reg === 'inventario'); if (lote == null) return; arr.slice(-40).forEach(i => unir(lote, i)); });
  cb.vec = vec; cb.links = [...L].map(s => s.split(':').map(Number)); cb.porKey = porKey;
}

/* Camino de una neurona: todo lo conectado (2 saltos), ordenado en el tiempo */
function cbCamino(i, max = 14) {
  const vis = new Set([i]); let frente = [i];
  for (let d = 0; d < 2; d++) { const nx = []; frente.forEach(a => (cb.vec[a] || []).forEach(b => { if (!vis.has(b) && vis.size < max) { vis.add(b); nx.push(b); } })); frente = nx; }
  return [...vis].sort((a, b) => (cb.N[a].fijo ? -1 : cb.N[a].ts) - (cb.N[b].fijo ? -1 : cb.N[b].ts));
}

/* Historia de una neurona: lo del MISMO cliente + lo enlazado directo + su terreno.
   Para un terreno: todo lo que se hizo sobre ese terreno. */
function cbHistoria(i, max = 12) {
  const n = cb.N[i]; if (!n) return [];
  const out = new Set([i]), cli = _cbN(n.cliente);
  if (n.reg === 'inventario') (cb.vec[i] || []).forEach(j => out.add(j));
  else {
    (cb.vec[i] || []).forEach(j => { const m = cb.N[j]; if (m.reg === 'inventario' || (cli && _cbN(m.cliente) === cli) || !m.cliente) out.add(j); });
    if (cli) cb.N.forEach((m, j) => { if (out.size < max * 2 && _cbN(m.cliente) === cli) out.add(j); });
  }
  return [...out].sort((a, b) => (cb.N[a].fijo ? -1 : cb.N[a].ts) - (cb.N[b].fijo ? -1 : cb.N[b].ts)).slice(-max);
}

/* Temperatura de una cotización: cuántas veces la abrió y qué tan reciente */
function cbTemperatura(c) {
  if (!c || !c.vistas) return { v: .08, t: 'Fría' };
  const h = (Date.now() - (c.ultimaVista || 0)) / 3600000;
  const v = Math.min(1, c.vistas * .2 + (h < 2 ? .55 : h < 24 ? .3 : h < 72 ? .1 : 0));
  return { v, t: v > .66 ? 'Caliente' : v > .33 ? 'Tibia' : 'Fría' };
}

/* Siguiente paso sugerido: reglas simples sobre datos reales */
function cbSiguientePaso(n) {
  const r = n.raw || {}, ahora = Date.now();
  if (n.k.startsWith('cot:')) {
    const est = n.estado;
    if (est === 'vencido') return 'Renovar la cotización: venció el ' + new Date(r.fechaVencimiento).toLocaleDateString('es-BO') + '.';
    if (r.ultimaVista && ahora - r.ultimaVista < 3 * 3600000) return `Llamarlo hoy: abrió la cotización hace ${_cbHace(r.ultimaVista)}${r.visita?.fecha ? ' y la visita es el ' + r.visita.fecha.split('-').reverse().slice(0, 2).join('/') : ''}.`;
    if (!r.vistas && ahora - r.ts > 86400000) return 'Reenviar por WhatsApp: todavía no abrió la cotización.';
    if (r.fechaVencimiento && r.fechaVencimiento - ahora < 86400000) return 'Vence en menos de 24 h: confirmar o renovar.';
    if (!r.visita) return 'Agendar la visita guiada para mostrarle el terreno.';
    return 'Confirmar la visita y preparar la reserva.';
  }
  if (n.k.startsWith('vis:')) return r.estado === 'pendiente' ? `El asesor todavía no atendió esta asignación${r.fecha ? ' (' + r.fecha.split('-').reverse().join('/') + (r.hora ? ' ' + r.hora : '') + ')' : ''}.` : r.estado === 'en_proceso' ? 'El asesor la está atendiendo: falta cargar el registro.' : 'Asignación atendida.';
  if (n.k.startsWith('comp:')) { const hoy = new Date().toISOString().slice(0, 10); return r.estado !== 'Pendiente' ? 'Compromiso cerrado.' : (r.fecha < hoy ? 'Gestionar ya: el compromiso venció el ' + r.fecha.split('-').reverse().join('/') + '.' : 'Recordarle el compromiso del ' + r.fecha.split('-').reverse().join('/') + '.'); }
  if (n.k.startsWith('reg:')) { if (n.tipo === 'Reserva') return 'Reserva hecha: seguir con materia reservada y contrato.'; const d = Math.round((ahora - n.ts) / 86400000); return d > 7 ? `Hacer seguimiento: último registro hace ${d} días.` : 'En seguimiento.'; }
  if (n.k.startsWith('lote:')) { const usado = cb.N.some(m => m.reg === 'cotizaciones' && (m.terrenos || []).some(t => _cbN(t) === _cbN(n.terreno)) && ahora - m.ts < 60 * 86400000); return n.estado === 'Disponible' ? (usado ? 'Disponible y con cotizaciones recientes.' : 'Ofrecerlo: nadie lo cotizó en los últimos 60 días.') : 'Figura ' + n.estado + ' en Orange.'; }
  return '';
}

/* "Lo que el cerebro notó": solo cosas medibles, y solo si los números alcanzan */
function cbInsights() {
  const out = [], ahora = Date.now(), hoyIso = new Date().toISOString().slice(0, 10);
  const manana = new Date(ahora + 86400000).toISOString().slice(0, 10);
  const comps = cb.N.filter(n => n.k.startsWith('comp:') && n.estado === 'Pendiente' && n.fecha && n.fecha <= manana);
  if (comps.length) out.push({ t: 'al', k: 'Alerta', r: 'Cartera', m: `${comps.length} compromiso${comps.length > 1 ? 's' : ''} de pago ${comps.some(c => c.fecha < hoyIso) ? 'vencido' + (comps.length > 1 ? 's' : '') + ' o' : ''} para hoy/mañana sin cerrar.`, idx: comps.map(n => cb.porKey.get(n.k)) });
  const cal = cb.N.filter(n => n.k.startsWith('cot:') && (n.raw.vistas || 0) >= 2 && ahora - (n.raw.ultimaVista || 0) < 3 * 3600000 && n.estado !== 'vencido').sort((a, b) => b.raw.ultimaVista - a.raw.ultimaVista)[0];
  if (cal) out.push({ t: 'cal', k: 'Cliente caliente', r: 'Cotizaciones', m: `${cal.cliente} abrió su cotización ${cal.raw.vistas} veces; la última hace ${_cbHace(cal.raw.ultimaVista)}.`, s: `Buen momento para que ${cal.asesor || 'el asesor'} lo llame.`, idx: [cb.porKey.get(cal.k)] });
  const desde = ahora - 60 * 86400000;
  const con = cb.N.filter(n => n.k.startsWith('vis:') && n.ts > desde && n.raw.cotizacionKey), sin = cb.N.filter(n => n.k.startsWith('vis:') && n.ts > desde && !n.raw.cotizacionKey);
  if (con.length >= 8 && sin.length >= 8) {
    const pc = Math.round(con.filter(n => n.estado === 'completada').length * 100 / con.length), ps = Math.round(sin.filter(n => n.estado === 'completada').length * 100 / sin.length);
    out.push({ t: 'pat', k: 'Patrón', r: '60 días', m: `Las asignaciones con cotización llegan a visita atendida el ${pc}% de las veces; sin cotización, el ${ps}%.`, s: `Medido sobre ${con.length + sin.length} asignaciones.` });
  }
  const mesKey = ts => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
  const res = cb.N.filter(n => n.tipo === 'Reserva' && n.ts >= _cbGestion0()); const porMes = {};
  res.forEach(n => porMes[mesKey(n.ts)] = (porMes[mesKey(n.ts)] || 0) + 1);
  const actual = porMes[mesKey(ahora)] || 0, previos = Object.entries(porMes).filter(([k]) => +k !== mesKey(ahora)).map(([, v]) => v);
  if (actual > 0 && previos.length && actual > Math.max(...previos)) out.push({ t: 'rec', k: 'Récord', r: 'Ventas', m: `Este mes ya tiene ${actual} reservas: más que cualquier mes de la gestión.` });
  const cotiz = new Set(cb.N.filter(n => n.reg === 'cotizaciones' && n.ts > desde).flatMap(n => (n.terrenos || []).map(_cbN)));
  const dorm = cb.N.filter(n => n.k.startsWith('lote:') && n.estado === 'Disponible' && !cotiz.has(_cbN(n.terreno)));
  if (dorm.length) out.push({ t: 'dor', k: 'Estrellas dormidas', r: 'Inventario', m: `${dorm.length} terreno${dorm.length > 1 ? 's' : ''} disponible${dorm.length > 1 ? 's' : ''} sin cotizar en 60 días.`, idx: dorm.map(n => cb.porKey.get(n.k)) });
  const h0 = _cbHoy0(), cuenta = {};
  cb.N.filter(n => n.ts >= h0 && n.asesor).forEach(n => cuenta[n.asesor] = (cuenta[n.asesor] || 0) + 1);
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) out.push({ t: 'top', k: 'Estrella del día', r: 'Equipo', m: `${top[0]} movió ${top[1]} acciones hoy.` });
  return out;
}

/* Diferencias entre una lectura y la siguiente → impulsos en vivo */
function cbCambios(prev, nuevo) {
  const ev = [];
  nuevo.forEach(n => {
    const p = prev.get(n.k);
    if (!p) { if (!n.fijo && Date.now() - n.ts < 15 * 60000) ev.push({ k: n.k, nueva: true, txt: n.tipo, sub: n.titulo, ts: n.ts }); return; }
    if (n.k.startsWith('cot:') && (n.raw.vistas || 0) > (p.vistas || 0)) ev.push({ k: n.k, txt: 'Cliente abrió su cotización', sub: n.cliente + ' · ' + n.raw.vistas + '.ª vez', color: '#7FBF7A' });
    if (n.estado !== p.estado && p.estado !== undefined) ev.push({ k: n.k, txt: n.tipo + ': ' + (n.estado || 'actualizado'), sub: n.titulo });
  });
  return ev;
}


/* ════════════════════════════════════════════════════════════════════════
   CEREBRO DEL SISTEMA · ANDRÓMEDA · acceso con PIN propio, 3D, tarjeta, modos
   ════════════════════════════════════════════════════════════════════════ */
const CB_THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const CB_SES = 'uv-cerebro-ok', CB_SES_H = 4;          // la llave del cerebro dura 4 h en esta pestaña
let cb = {
  abierto: false, listo: false, N: [], vec: [], links: [], porKey: new Map(), prev: new Map(), gestiones: null,
  modo: 'vivo', periodo: 'todo', ocultas: new Set(), sel: null, aislado: null, cine: false, sonido: true,
  feed: [], pulsos: [], flotantes: [], replay: null, comparar: null, ultimoSync: 0, volverA: 'home', pinFallos: 0,
};

/* ── 1 · Acceso: panel de bloqueo con PIN del cerebro ─────────────────── */
function cbLeer(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function cbGuardar(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
function cbLeerL(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function cbGuardarL(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function cbDesbloqueado() { const t = parseInt(cbLeer(CB_SES) || '0', 10); return t > Date.now(); }

async function cbMostrarBloqueo() {
  const p = document.getElementById('panel-cerebro'); if (!p) return;
  if (!(typeof modoAdmin !== 'undefined' && modoAdmin)) { p.innerHTML = '<div class="cb-lock"><p>Solo para el administrador.</p></div>'; return; }
  if (cbDesbloqueado()) { p.innerHTML = cbLockHTML('abrir'); cbAbrir(); return; }
  p.innerHTML = cbLockHTML('cargando');
  let cfg = null;
  try { cfg = await window._fbSeg.get('seguridad/cerebro'); } catch (e) {}
  cb.cfg = cfg;
  p.innerHTML = cbLockHTML(cfg && cfg.pinHash ? 'pin' : 'crear');
  setTimeout(() => document.getElementById('cb-pin1')?.focus(), 60);
}
function cbLockHTML(est) {
  const glifo = `<svg class="cb-glifo" viewBox="0 0 120 90" aria-hidden="true">${Array.from({ length: 70 }, (_, i) => { const a = i * 2.39996, r = 4 + Math.sqrt(i) * 4.6, x = 60 + Math.cos(a) * r * 1.25, y = 46 + Math.sin(a) * r * .82; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + (i % 5) * .25).toFixed(2)}" fill="${CB_REG[i % 7].c}" opacity=".85"/>`; }).join('')}</svg>`;
  const pin = (id, ph) => `<input id="${id}" class="cb-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="${ph}" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)" onkeydown="if(event.key==='Enter')cbEntrar()">`;
  let cuerpo = '';
  if (est === 'cargando' || est === 'abrir') cuerpo = '<p class="cb-l-s">Abriendo…</p>';
  else if (est === 'crear') cuerpo = `<p class="cb-l-s">Primera vez: creá el PIN del cerebro (4 a 6 números). Es aparte del PIN de admin.</p>${pin('cb-pin1', 'Nuevo PIN')}${pin('cb-pin2', 'Repetir PIN')}<button class="cb-l-b" onclick="cbEntrar()">Crear y entrar</button>`;
  else cuerpo = `<p class="cb-l-s">Ingresá el PIN del cerebro.</p>${pin('cb-pin1', 'PIN')}<button class="cb-l-b" onclick="cbEntrar()">Entrar</button>`;
  return `<div class="cb-lock">${glifo}<div class="cb-l-k">Urubó Village · Andrómeda</div><h2 class="cb-l-t">Cerebro del sistema</h2>${cuerpo}<p class="cb-l-e" id="cb-l-e"></p>
    ${cbDesbloqueado() ? '' : '<p class="cb-l-n">Solo vos lo ves. Se pide de nuevo cada 4 horas o en una pestaña nueva.</p>'}</div>`;
}
async function cbEntrar() {
  const e = document.getElementById('cb-l-e'), p1 = document.getElementById('cb-pin1')?.value || '', p2 = document.getElementById('cb-pin2');
  const bloq = parseInt(cbLeer('uv-cerebro-bloq') || '0', 10);
  if (bloq > Date.now()) { e.textContent = 'Demasiados intentos. Probá de nuevo en ' + Math.ceil((bloq - Date.now()) / 60000) + ' min.'; return; }
  if (p1.length < 4) { e.textContent = 'El PIN tiene entre 4 y 6 números.'; return; }
  if (p2) {
    if (p1 !== p2.value) { e.textContent = 'Los PIN no coinciden.'; return; }
    try { const s = await segNuevoPinSeguro(p1); await window._fbSeg.set('seguridad/cerebro', { pinHash: s.pinHash, pinSalt: s.pinSalt, pinIter: s.pinIter, creado: Date.now() }); }
    catch (err) { e.textContent = 'No se pudo guardar el PIN.'; return; }
  } else {
    const ok = cb.cfg && (await segHashPin(p1, cb.cfg.pinSalt)) === cb.cfg.pinHash;
    if (!ok) {
      cb.pinFallos++; e.textContent = 'PIN incorrecto.';
      if (cb.pinFallos >= 5) { cbGuardar('uv-cerebro-bloq', String(Date.now() + 5 * 60000)); cb.pinFallos = 0; e.textContent = 'Demasiados intentos: el cerebro queda bloqueado 5 minutos.'; }
      try { window._fbSeg.push('seguridad/cerebro_accesos', { ok: false, ts: Date.now() }); } catch (x) {}
      return;
    }
  }
  cb.pinFallos = 0;
  cbGuardar(CB_SES, String(Date.now() + CB_SES_H * 3600000));
  try { window._fbSeg.push('seguridad/cerebro_accesos', { ok: true, ts: Date.now() }); } catch (x) {}
  document.getElementById('panel-cerebro').innerHTML = cbLockHTML('abrir');
  cbAbrir();
}
async function cbCambiarPin() {
  const actual = prompt('PIN actual del cerebro:'); if (actual == null) return;
  if (!cb.cfg || (await segHashPin(actual, cb.cfg.pinSalt)) !== cb.cfg.pinHash) { toastErr('PIN incorrecto.'); return; }
  const n1 = prompt('Nuevo PIN (4 a 6 números):'); if (!n1 || !/^\d{4,6}$/.test(n1)) { toastErr('El PIN tiene entre 4 y 6 números.'); return; }
  const s = await segNuevoPinSeguro(n1);
  cb.cfg = { pinHash: s.pinHash, pinSalt: s.pinSalt, pinIter: s.pinIter, creado: Date.now() };
  await window._fbSeg.set('seguridad/cerebro', cb.cfg); toastOk('PIN del cerebro cambiado.');
}

/* ── 2 · Abrir / cerrar ───────────────────────────────────────────────── */
async function cbAbrir() {
  let root = document.getElementById('cb-root');
  if (!root) { root = document.createElement('div'); root.id = 'cb-root'; root.innerHTML = cbHTML(); document.body.appendChild(root); cbEventos(); }
  root.classList.add('on'); document.body.classList.add('cb-abierto'); cb.abierto = true; cb.dirPref = cbLeerL('uv-andromeda-auto') !== '0'; cb.voz = cbLeerL('uv-andromeda-voz') === '1'; document.getElementById('cb-b-voz')?.classList.toggle('on', cb.voz); document.getElementById('cb-hoy')?.classList.toggle('min', cbLeerL('uv-andromeda-hoy-min') === '1');
  if (typeof iniciarCobCRM === 'function') try { iniciarCobCRM(); } catch (e) {}
  if (typeof orangeCarteraDetalleRaw !== 'undefined' && !orangeCarteraDetalleRaw.length && typeof cargarDetalleCobrosCartera === 'function') try { cargarDetalleCobrosCartera(true); } catch (e) {}
  if (typeof orangeExpensasDetalleRaw !== 'undefined' && !orangeExpensasDetalleRaw.length && typeof cargarDetalleExpensas === 'function') try { cargarDetalleExpensas(true); } catch (e) {}
  if (cb.gestiones == null && window._fbCob) window._fbCob.get('cobcrm_gestiones').then(g => { cb.gestiones = g || {}; cbSync(true); }).catch(() => { cb.gestiones = {}; });
  if (typeof cotzCargarIndiceFotos === 'function') cotzCargarIndiceFotos();
  if (!window.THREE) {
    cbEstado('Cargando el motor 3D…');
    try { await new Promise((ok, no) => { const s = document.createElement('script'); s.src = CB_THREE; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
    catch (e) { cbEstado('No se pudo cargar el motor 3D. Revisá la conexión a internet y volvé a abrir.'); return; }
  }
  if (!cb.listo) cbIniciar3D();
  cbEstado('');
  cbSync(true); cbIntro();
  clearInterval(cb.timer); cb.timer = setInterval(() => { if (cb.abierto) cbSync(false); }, 2500);
  cbAnimar();
  if (cb.dirPref && !cb.dir?.on) setTimeout(() => cb.abierto && cbDir(true), 5000);
}
function cbCerrar() {
  if (cb.musica) cbMusica();
  cb.abierto = false; clearInterval(cb.timer); cancelAnimationFrame(cb.raf);
  document.getElementById('cb-root')?.classList.remove('on'); document.body.classList.remove('cb-abierto');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (typeof switchAdminTab === 'function') switchAdminTab(cb.volverA && cb.volverA !== 'cerebro' ? cb.volverA : 'home');
}
function cbEstado(t) { const e = document.getElementById('cb-estado'); if (e) { e.textContent = t; e.style.display = t ? '' : 'none'; } }

/* ── 3 · Marcado del HUD ──────────────────────────────────────────────── */
function cbHTML() {
  const seg = [['vivo', 'En vivo'], ['hoy', 'Hoy'], ['mes', 'Mes'], ['gestion', 'Gestión'], ['replay', 'Replay'], ['comparar', 'Comparar']];
  return `<canvas id="cb-gl"></canvas><div class="cb-vig"></div><div class="cb-scan"></div>
  <div class="cb-lb t"></div><div class="cb-lb b"></div>
  <div class="cb-mira" id="cb-mira"><svg viewBox="-70 -70 140 140"><circle class="r1" r="30"/><circle class="r2" r="40"/><circle class="r3" r="52"/><g class="tk"><path d="M0-46v-10M0 46v10M-46 0h-10M46 0h10"/></g><path class="ld" d="M38-22 L78-46 L150-46"/></svg>
    <div class="cb-mira-n"><span class="k" id="cb-mira-k"></span><b id="cb-mira-t"></b><span class="s" id="cb-mira-s"></span><div class="sat" id="cb-mira-sat"></div></div></div>
  <div class="cb-hov" id="cb-hov" style="display:none"></div><div class="cb-sub" id="cb-sub"></div><div id="cb-fl"></div><svg id="cb-ov"></svg>
  <div class="cb-dir" id="cb-dir"><i class="rec" id="cb-dir-rec"></i><span id="cb-dir-esc">Vista general</span><span class="pg"><b id="cb-dir-pg"></b></span><span class="cnt" id="cb-dir-cnt"></span><button type="button" id="cb-dir-b" onclick="cbDirBoton()">Tomar control</button></div>
  <div class="cb-io" id="cb-io"><div class="e">Andrómeda notó</div><div class="ty" id="cb-io-t"></div><div class="m" id="cb-io-m"></div><div class="s" id="cb-io-s"></div></div>
  <div class="cb-zoom" id="cb-zoom"></div><div class="cb-np" id="cb-np"></div>
  <div class="cb-intro" id="cb-intro"><div class="k">Urubó Village</div><div class="t">ANDRÓMEDA</div><div class="s">Todo lo que pasa en el área comercial, en vivo</div></div>
  <div class="cb-top">
    <div class="cb-brand"><span class="cb-lg">Urubó Village · </span><b>Andrómeda</b></div>
    <div class="cb-tr">
      <span class="cb-live"><i></i><span id="cb-live-t">En vivo</span></span>
      <button type="button" class="cb-ico cb-auto" id="cb-b-auto" onclick="cbDir()" title="Recorrido automático por lo importante"><i></i>Auto</button>
      <div class="cb-seg" id="cb-seg">${seg.map(([v, t]) => `<button type="button" data-m="${v}" onclick="cbModo('${v}')">${t}</button>`).join('')}</div>
      <button type="button" class="cb-ico" id="cb-b-res" onclick="cbResumen()">Resumen del día</button>
      <button type="button" class="cb-ico on" id="cb-b-son" onclick="cbSonido()">Sonido</button>
      <button type="button" class="cb-ico" id="cb-b-voz" onclick="cbVoz()" title="Una voz narra lo que pasa">Voz</button>
      <button type="button" class="cb-ico" id="cb-b-mus" onclick="cbMusica()" title="Los Planetas, de Holst (dominio público)">Música</button>
      <button type="button" class="cb-ico" onclick="cbCine(true)">Modo cine</button>
      <details class="cb-mas"><summary class="cb-ico">Más</summary><div><button type="button" onclick="cbPantalla();this.closest('details').open=false">Pantalla completa</button><button type="button" onclick="window.open(location.pathname+'?cerebro=1','_blank');this.closest('details').open=false">Abrir en otra pestaña</button><button type="button" onclick="cbIntro();this.closest('details').open=false">Ver la entrada de nuevo</button><button type="button" onclick="cbCambiarPin();this.closest('details').open=false">Cambiar PIN</button></div></details>
      <button type="button" class="cb-ico cb-vol" onclick="cbCerrar()">Volver</button>
    </div>
  </div>
  <div class="cb-left" id="cb-left">
    <div class="cb-kpis"><div>Estrellas<b id="cb-k-n">—</b></div><div>Conexiones<b id="cb-k-c">—</b></div><div>Hoy<b id="cb-k-h">—</b></div></div>
    <div class="cb-hoy" id="cb-hoy"><div class="cb-hoy-hd"><span id="cb-hoy-h">Hoy</span><span><button type="button" onclick="cbCronica()">Crónica</button><button type="button" class="tg" onclick="cbHoyToggle()" title="Achicar / agrandar">–</button></span></div><div class="cb-hoy-g" id="cb-hoy-g"></div></div>
    <div class="cb-h"><span>Señales en vivo</span><button type="button" onclick="cb.pausa=!cb.pausa;this.textContent=cb.pausa?'seguir':'pausar'">pausar</button></div>
    <div id="cb-feed"></div>
  </div>
  <div class="cb-right" id="cb-right">
    <div class="cb-search"><input id="cb-q" placeholder="Buscar: cliente, terreno, código…" autocomplete="off" oninput="cbBuscar()"><kbd>Ctrl K</kbd></div>
    <div id="cb-res" class="cb-res"></div>
    <div class="cb-h"><span>Lo que Andrómeda notó</span><span id="cb-ins-n"></span></div>
    <div id="cb-ins"></div>
  </div>
  <div class="cb-chips" id="cb-chips">${CB_REG.map((r, i) => `<button type="button" data-r="${i}" onclick="cbRegion(${i})"><i style="background:${r.c};box-shadow:0 0 8px ${r.c}"></i><small>${r.z}</small>${r.n}<em id="cb-rc-${i}"></em></button>`).join('')}</div>
  <div class="cb-time" id="cb-time">
    <button type="button" class="cb-play" id="cb-play" onclick="cbReplayToggle()" title="Replay"><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="none" stroke="currentColor"/><path id="cb-play-i" d="M12 10 L20 15 L12 20 Z" fill="currentColor"/></svg></button>
    <div class="cb-trow"><span id="cb-t-l"></span><span id="cb-t-r"></span></div>
    <div class="cb-bars" id="cb-bars"></div>
  </div>
  <div class="cb-big" id="cb-big"><div class="d" id="cb-big-d"></div><div class="s" id="cb-big-s"></div>
    <div class="sp" id="cb-big-sp">${[['1', '×1'], ['2', '×2'], ['5', '×5']].map(([v, t]) => `<button type="button" data-v="${v}" onclick="cbReplayVel(${v})">${t}</button>`).join('')}</div></div>
  <div class="cb-card" id="cb-card"></div>
  <div class="cb-res-dia" id="cb-resumen"></div>
  <div class="cb-res-dia cb-cro" id="cb-cro"></div>
  <div class="cb-cmp" id="cb-cmp"></div>
  <div class="cb-cine-cap" id="cb-cine-cap"><div class="k" id="cb-cine-k">Andrómeda · recorrido automático</div><div class="t" id="cb-cine-t"></div><div class="s" id="cb-cine-s"></div></div>
  <div class="cb-cine-r" id="cb-cine-r"></div>
  <button type="button" class="cb-cine-x" id="cb-cine-x" onclick="cbCine(false)">Salir del modo cine</button>
  <div class="cb-aviso" id="cb-aviso"></div>
  <div class="cb-estado" id="cb-estado"></div>
  <div class="cb-mob" id="cb-mob"><button type="button" onclick="document.getElementById('cb-root').classList.toggle('m-feed')">Señales</button><button type="button" onclick="document.getElementById('cb-root').classList.toggle('m-ins')">Notó <b id="cb-mob-n"></b></button><button type="button" onclick="document.getElementById('cb-q').focus();document.getElementById('cb-root').classList.add('m-ins')">Buscar</button></div>`;
}

function cbEventos() {
  document.addEventListener('keydown', e => {
    if (!cb.abierto) return;
    if (e.key === '/' || e.key === 'Escape') e.stopPropagation();
    if (e.key !== 'Escape' && typeof cbDirPausa === 'function') cbDirPausa();
    if (e.key === 'Escape') { if (cb.cine) cbCine(false); else if (cb.aislado) cbAislar(null); else if (cb.sel != null) cbSeleccionar(null); else if (document.getElementById('cb-resumen').classList.contains('on')) cbResumen(false); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); document.getElementById('cb-q').focus(); }
  }, true);
}


/* ── 4 · Motor 3D · Andrómeda ─────────────────────────────────────────────
   Forma de M31: núcleo con barra (Ventas), dos brazos espirales principales
   (Cotizaciones y Call center), un brazo menor (Marketing), el anillo de
   polvo con los terrenos (Inventario, un sector por módulo), el disco rosado
   entre brazos con la Cartera (gira como reloj: cada mes de la gestión tiene
   su sector) y los dos satélites de Expensas (M32: últimos 45 días; M110: lo
   anterior). En los brazos la posición dice la edad: lo nuevo nace en la punta
   y lo viejo queda cerca del núcleo. La galaxia gira siempre.
   ─────────────────────────────────────────────────────────────────────── */
const CB_GX = { R: 3.3, armIn: .78, tight: 1.75, core: .42, barL: .95, barW: .17, anillo: 2.05, m32: [-1.75, .3, -1.25], m110: [2.75, -.42, 1.85] };
const CB_MOVIL = innerWidth < 700 || /Mobi|Android/i.test(navigator.userAgent);
const CB_VISTA = () => innerWidth < 700 ? { th: .62, ph: .72, rad: 12.5 } : { th: .62, ph: 1.13, rad: 8 };
const CB_GIRO = .028;      // rad/s: una vuelta completa cada ~4 minutos

/* Generador determinístico (mismo registro → misma posición siempre) */
function _cbRnd(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }
const _cbGauss = R => Math.sqrt(-2 * Math.log(Math.max(1e-9, R()))) * Math.cos(6.2831853 * R());
/* Punto sobre un brazo espiral logarítmico */
function _cbBrazo(off, r, perp, y, tight = CB_GX.tight, rIn = CB_GX.armIn) {
  const th = off + Math.log(Math.max(r, rIn) / rIn) * tight;
  return [Math.cos(th) * r - Math.sin(th) * perp, y, Math.sin(th) * r + Math.cos(th) * perp];
}
/* Brazos: [desfase, radio final, enrollado, región]. Cartera tiene dos brazos secundarios (es la que más registros tiene) */
const CB_BRAZO = { cotizaciones: [0, 3.3, 1.75, 'cotizaciones'], callcenter: [Math.PI, 3.3, 1.75, 'callcenter'], cartera: [Math.PI / 2, 3.15, 1.75, 'cartera'], cartera2: [Math.PI * 1.5, 3.15, 1.75, 'cartera'], marketing: [Math.PI / 4, 2.1, 2.1, 'marketing'] };
/* Edad → radio en el brazo: lo nuevo en la punta, lo de más de 6 meses repartido (sin amontonarse) en la parte interior */
function _cbRadioEdad(edad, R, rOut) { const f = edad <= 180 ? Math.exp(-(edad + R() * 1.5) / 110) : .05 + .16 * R(); return CB_GX.armIn + .05 + (rOut - CB_GX.armIn - .05) * f; }

function cbIniciar3D() {
  const T = THREE, cv = document.getElementById('cb-gl');
  T.ColorManagement.enabled = false;                 // los colores se usan tal cual (igual con o sin brillo)
  const r = new T.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, powerPreference: 'high-performance' });
  r.outputColorSpace = T.LinearSRGBColorSpace;
  cb.prMax = Math.min(CB_MOVIL ? 1.25 : 1.5, window.devicePixelRatio || 1); cb.pr = cb.prMax;
  r.setPixelRatio(cb.pr); r.setClearColor(0x050509);
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(38, 1, .02, 160);
  const g = new T.Group(); scene.add(g);
  const v = CB_VISTA();
  Object.assign(cb, { T, r, scene, cam, g, orb: { th: v.th, ph: v.ph, rad: v.rad, tgt: new T.Vector3(0, 0, 0), auto: true }, tiempo: 0, perf: { acc: 0, n: 0, bien: 0 } });
  cb.glowTex = cbTexturaGlow();

  // ── Galaxia de fondo (no interactiva) ──
  const R = _cbRnd(31), P = [], C = [], S = [], c = new T.Color(), tinte = new T.Color();
  const push = (p, col, s) => { P.push(p[0], p[1], p[2]); C.push(col.r, col.g, col.b); S.push(s); };
  const total = CB_MOVIL ? 11000 : 26000, cuota = f => Math.round(total * f);
  for (let i = 0; i < cuota(.17); i++) {                  // bulbo + barra (cálido)
    const enBarra = R() < .5, rr = Math.abs(_cbGauss(R)) * CB_GX.core;
    const p = enBarra ? [_cbGauss(R) * CB_GX.barL * .5, _cbGauss(R) * .06, _cbGauss(R) * CB_GX.barW] : (() => { const a = R() * 6.283, b = Math.acos(2 * R() - 1); return [rr * Math.sin(b) * Math.cos(a) * 1.2, rr * Math.cos(b) * .5, rr * Math.sin(b) * Math.sin(a)]; })();
    c.set('#FFD9A3').lerp(tinte.set('#FFF3DC'), R() * .6).multiplyScalar(.24 + R() * .26); push(p, c, 1.2 + R() * 1.5);
  }
  Object.entries(CB_BRAZO).forEach(([key, [off, rOut, tight, reg]]) => {   // brazos: blanco cálido-lavanda teñido de la región, nudos rosados
    const sec = reg === 'cartera', n = cuota(reg === 'marketing' ? .05 : sec ? .09 : .2), col = CB_REG[CB_RI[reg]].c;
    for (let i = 0; i < n; i++) {
      const t = Math.pow(R(), .7), rr = CB_GX.armIn + t * (rOut - CB_GX.armIn), perp = _cbGauss(R) * (.08 + rr * .055) * (sec ? 1.5 : 1);
      const p = _cbBrazo(off, rr, perp, _cbGauss(R) * .035 * (1 + rr * .3), tight);
      const hii = R() < .03; c.set(hii ? '#FF8FB8' : '#EDE4FF').lerp(tinte.set(col), hii ? .1 : .45).multiplyScalar((hii ? .85 : .32 + R() * .3) * (1 - t * .25) * (sec ? .7 : 1)); push(p, c, hii ? 2.6 + R() * 1.5 : 1 + R() * 1.5);
      if (R() < .4) { const d = _cbBrazo(off - .2, rr, perp * .6, _cbGauss(R) * .02, tight); c.set('#9A6236').multiplyScalar(.2 + R() * .15); push(d, c, 1.1 + R()); }   // polvo
    }
  });
  for (let i = 0; i < cuota(.11); i++) {                  // disco entre brazos
    const rr = .5 + -Math.log(Math.max(.03, R())) * .95; if (rr > CB_GX.R + .1) continue;
    const a = R() * 6.283; c.set('#F2DCCB').lerp(tinte.set('#C9B8E8'), R() * .4).multiplyScalar(.12 + R() * .14); push([Math.cos(a) * rr, _cbGauss(R) * .045, Math.sin(a) * rr], c, 1 + R() * 1.2);
  }
  for (let i = 0; i < cuota(.09); i++) {                  // anillo de polvo (inventario)
    const a = R() * 6.283, rr = CB_GX.anillo + _cbGauss(R) * .13, du = R() < .45; c.set(du ? '#A0683C' : '#F3E6CC').multiplyScalar(du ? .25 : .2 + R() * .2); push([Math.cos(a) * rr, _cbGauss(R) * .03, Math.sin(a) * rr], c, 1 + R() * 1.3);
  }
  [[CB_GX.m32, .15, .55], [CB_GX.m110, .3, .45]].forEach(([q, s, f]) => {   // satélites (expensas)
    for (let i = 0; i < cuota(.06) * f; i++) { c.set('#FFE9C4').lerp(tinte.set(CB_REG[CB_RI.expensas].c), .4).multiplyScalar(.3 + R() * .3); push([q[0] + _cbGauss(R) * s * 1.3, q[1] + _cbGauss(R) * s * .7, q[2] + _cbGauss(R) * s], c, 1 + R() * 1.2); }
  });
  cb.amb = cbPuntos(P, C, S, null, .95); cb.amb.frustumCulled = false; g.add(cb.amb);
  // cielo profundo: pocas estrellas, neutras y lejanas
  const fp = [], fc = [];
  for (let i = 0; i < (CB_MOVIL ? 350 : 800); i++) { const rr = 60 + R() * 40, a = R() * 6.283, b = Math.acos(2 * R() - 1), k = .1 + R() * .28; fp.push(rr * Math.sin(b) * Math.cos(a), rr * Math.cos(b), rr * Math.sin(b) * Math.sin(a)); fc.push(k, k * .96, k * .9); }
  const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3)); fg.setAttribute('color', new T.Float32BufferAttribute(fc, 3));
  scene.add(new T.Points(fg, new T.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .8, depthWrite: false })));
  // bruma procedural: espiral luminosa con color que respira (un solo plano, todo en la GPU)
  cb.bruma = new T.Mesh(new T.PlaneGeometry(9, 9), new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uT: { value: 0 }, uOp: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main(){ vU=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uT; uniform float uOp; varying vec2 vU;
      void main(){ vec2 p=vec2(vU.x,-vU.y); float r=length(p), a=atan(p.y,p.x);
        float core=exp(-r*r*7.)*.38 + exp(-r*1.8)*.16;
        float ph=a-log(max(r,.78)/.78)*1.75; float arms=pow(max(0.,cos(ph)),6.)+pow(max(0.,cos(ph-3.14159)),6.)+.45*(pow(max(0.,cos(ph-1.5708)),8.)+pow(max(0.,cos(ph-4.7124)),8.));
        arms*=smoothstep(.45,1.,r)*(1.-smoothstep(2.6,3.9,r));
        float ring=exp(-pow((r-2.05)/.2,2.))*.35;
        float h=.5+.5*sin(uT*.07+r*.9);
        vec3 cArm=mix(vec3(.55,.42,.95),vec3(.95,.45,.72),h); vec3 cRing=vec3(.95,.72,.5);
        vec3 col=vec3(1.,.82,.55)*core + cArm*arms*.16 + cRing*ring*.22 + vec3(.6,.45,.7)*exp(-r*.9)*.05;
        col*=1.-smoothstep(3.6,4.5,r);
        gl_FragColor=vec4(col*uOp,1.); }` }));
  cb.bruma.rotation.x = -Math.PI / 2; g.add(cb.bruma);
  // brillo del núcleo y de los satélites
  [[[0, 0, 0], '#FFD9A0', 2.2, .24], [[0, 0, 0], '#FFF4DC', .6, .42], [CB_GX.m32, '#FFE2B8', .5, .3], [CB_GX.m110, '#FFE2B8', .85, .2]].forEach(([p, col, s, op], k) => { const gl = cbGlow(p, col, s, op); if (k === 0) cb.nucleo = gl; if (k === 1) cb.nucleo2 = gl; g.add(gl); });
  // ── Estrellas reales: buffers con capacidad fija ──
  const cap = CB_MAX, geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(cap * 3), 3));
  geo.setAttribute('color', new T.BufferAttribute(new Float32Array(cap * 3), 3));
  geo.setAttribute('size', new T.BufferAttribute(new Float32Array(cap), 1));
  geo.setAttribute('born', new T.BufferAttribute(new Float32Array(cap).fill(-99), 1));
  geo.setAttribute('alpha', new T.BufferAttribute(new Float32Array(cap).fill(1), 1));
  geo.setDrawRange(0, 0);
  cb.geo = geo; cb.pts = cbPuntos(null, null, null, geo, 1); cb.pts.frustumCulled = false; g.add(cb.pts);
  cb.lgeo = new T.BufferGeometry(); cb.lin = new T.LineSegments(cb.lgeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false }));
  cb.lin.frustumCulled = false; g.add(cb.lin);
  cb.fx = new T.Group(); g.add(cb.fx); cb.selFx = new T.Group(); g.add(cb.selFx);
  cb.ray = new T.Raycaster();
  cbControles(cv);
  if (typeof cbShowIniciar === 'function') cbShowIniciar();
  window.addEventListener('resize', cbResize); cbResize();
  cb.listo = true;
}
function cbTexturaGlow() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(.16, 'rgba(255,226,170,.8)'); gr.addColorStop(.42, 'rgba(230,190,120,.22)'); gr.addColorStop(1, 'rgba(230,190,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function cbPuntos(P, C, S, geoDada, op) {
  const T = cb.T || THREE; let geo = geoDada;
  if (!geo) { geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(C, 3)); geo.setAttribute('size', new T.Float32BufferAttribute(S, 1));
    geo.setAttribute('born', new T.Float32BufferAttribute(new Array(S.length).fill(-99), 1)); geo.setAttribute('alpha', new T.Float32BufferAttribute(new Array(S.length).fill(1), 1)); }
  const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
    uniforms: { uT: { value: 0 }, uOp: { value: op }, uSz: { value: 1 }, uPx: { value: cb.pr || 1 }, uR: { value: 8 }, uFl: { value: geoDada ? 0 : 1 }, uK: { value: geoDada ? .95 : 1 } },
    vertexShader: `attribute float size; attribute float born; attribute float alpha; uniform float uT; uniform float uPx; uniform float uSz; uniform float uR; uniform float uFl; varying vec3 vC; varying float vF; varying float vA;
      void main(){ vC=color; vA=alpha; float e=uT-born; float boost = e>=0. ? 1.+4.*exp(-e*1.6) : 1.;
        float tw = .88+.12*sin(uT*1.3+position.x*37.+position.z*23.);
        vec3 q=position; if(uFl>0.){ float rr=max(length(q.xz),.25); float w=uFl*sin(uT*.22+q.x*9.+q.z*7.)*.035/rr; float cw=cos(w), sw=sin(w); q.xz=vec2(q.x*cw-q.z*sw, q.x*sw+q.z*cw); }
        vec4 mv=modelViewMatrix*vec4(q,1.); float d=max(-mv.z,.05);
        float at = d > 3. ? 8.5/d : 2.833*pow(3./d, .5);
        gl_PointSize=min(size*boost*tw*uPx*uSz*at, 60.);
        vF=smoothstep(uR+.5, uR+6., d); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOp; uniform float uK; varying vec3 vC; varying float vF; varying float vA;
      void main(){ if(vA<.01) discard; float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=pow(1.-d*2.,1.8);
        gl_FragColor=vec4(vC*uK*(1.+a*.55-vF*.35), a*(1.-vF*.55)*uOp*vA); }` });
  return new T.Points(geo, mat);
}
function cbResize() {
  if (!cb.r) return; const w = innerWidth, h = innerHeight;
  cb.r.setSize(w, h, false); cb.cam.aspect = w / h; cb.cam.fov = w < 700 ? 46 : 38; cb.cam.updateProjectionMatrix();
  if (typeof cbBloomTam === 'function') cbBloomTam();
}
/* Calidad adaptable: si la compu no llega a ~40 fps baja la resolución; si sobra, la sube */
function cbCalidad(dt) {
  const p = cb.perf; p.acc += dt; p.n++;
  if (p.acc < 2) return;
  const fps = p.n / p.acc; p.acc = 0; p.n = 0;
  let pr = cb.pr;
  if (fps < 40) { p.bien = 0; if (cb.bloomOn && !cb.forzarBloom) { cb.bloomOn = false; p.malo = (p.malo || 0) + 1; } else if (pr > .7) pr = Math.max(.7, pr - .25); }
  else if (fps > 57) { if (++p.bien >= 3) { p.bien = 0; if (pr < cb.prMax) pr = Math.min(cb.prMax, pr + .25); else if (!cb.bloomOn && cb.bl && (p.malo || 0) < 3) cb.bloomOn = true; } }
  else p.bien = 0;
  cb.fps = Math.round(fps);
  if (pr !== cb.pr) { cb.pr = pr; cb.r.setPixelRatio(pr); cb.r.setSize(innerWidth, innerHeight, false); [cb.pts, cb.amb, cb.flujo].forEach(o => o && (o.material.uniforms.uPx.value = pr)); if (typeof cbBloomTam === 'function') cbBloomTam(); }
}

/* Posición estable de cada estrella según qué es y cuándo pasó */
function cbPos(n) {
  const R = _cbRnd(_cbHash(n.k)), g = () => _cbGauss(R), ahora = Date.now();
  const edad = n.ts ? Math.max(0, (ahora - n.ts) / 864e5) : 400;
  if (n.reg === 'ventas') {
    if (n.big) { const rr = Math.abs(g()) * .16 + .03, a = R() * 6.283, b = Math.acos(2 * R() - 1); return [rr * Math.sin(b) * Math.cos(a) * 1.25, rr * Math.cos(b) * .55, rr * Math.sin(b) * Math.sin(a)]; }
    return R() < .6 ? [g() * CB_GX.barL * .48, g() * .055, g() * CB_GX.barW * .9] : (() => { const rr = Math.abs(g()) * CB_GX.core * .9, a = R() * 6.283, b = Math.acos(2 * R() - 1); return [rr * Math.sin(b) * Math.cos(a) * 1.2, rr * Math.cos(b) * .5, rr * Math.sin(b) * Math.sin(a)]; })();
  }
  const key = n.reg === 'cartera' ? (R() < .5 ? 'cartera' : 'cartera2') : n.reg;
  if (CB_BRAZO[key]) {
    const [off, rOut, tight] = CB_BRAZO[key], rr = _cbRadioEdad(edad, R, rOut), ancho = (n.reg === 'cartera' ? 1.5 : 1) * (edad > 180 ? 1.6 : 1);
    return _cbBrazo(off, rr, g() * (.06 + rr * .045) * ancho, g() * .03 * (1 + rr * .3), tight);
  }
  if (n.reg === 'inventario') {
    const t = String(n.terreno || '').split('-').map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    const mod = t.length ? t[0] : 1, lote = t.length ? t[t.length - 1] : Math.floor(R() * 99);
    const nm = cb.nMods || 8, sec = 6.2832 / nm, a = ((mod - 1) % nm) * sec + ((lote * 7) % 53) / 53 * sec * .85 + R() * .02;
    const rr = CB_GX.anillo + (((lote * 37) % 101) / 101 - .5) * .34 + g() * .02;
    return [Math.cos(a) * rr, g() * .02, Math.sin(a) * rr];
  }
  if (n.reg === 'cartera') {
    const g0 = _cbGestion0(), anio = Math.min(2, Math.max(0, Math.floor((g0 - (n.ts || g0)) / 3.156e10) + (n.ts && n.ts < g0 ? 1 : 0)));
    const frac = n.ts ? (((n.ts - g0) / 3.156e10) % 1 + 1) % 1 : R();
    const a = -Math.PI / 2 + frac * 6.2832 + g() * .03, rr = Math.max(.95, 3.15 - anio * .55 - R() * 1.5);
    return [Math.cos(a) * rr, g() * .045, Math.sin(a) * rr];
  }
  if (n.reg === 'expensas') { const [q, s] = edad < 45 ? [CB_GX.m32, .2] : [CB_GX.m110, .42]; return [q[0] + g() * s * 1.3, q[1] + g() * s * .7, q[2] + g() * s]; }
  return [g(), g() * .2, g()];
}

/* ── 5 · Sincronizar con los datos del sistema ───────────────────────────
   Solo recalcula si algún dato del sistema cambió (los listeners reemplazan
   los arreglos), o cada 30 s para refrescar lo que depende de la hora. */
function _cbFirma() {
  return [typeof todosRegs !== 'undefined' ? todosRegs : null, typeof cotizacionesData !== 'undefined' ? cotizacionesData : null,
    typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : null, typeof leadsSemanalesData !== 'undefined' ? leadsSemanalesData : null,
    typeof cobCompromisos !== 'undefined' ? cobCompromisos : null, typeof orangeCarteraDetalleRaw !== 'undefined' ? orangeCarteraDetalleRaw : null,
    typeof orangeExpensasDetalleRaw !== 'undefined' ? orangeExpensasDetalleRaw : null, typeof todosLotes !== 'undefined' ? todosLotes : null, cb.gestiones];
}
function cbSync(inicial) {
  if (!cb.listo) return;
  const firma = _cbFirma(), largo = firma.map(x => x ? (x.length ?? Object.keys(x).length) : 0);
  if (!inicial && cb.firma && firma.every((x, i) => x === cb.firma[i]) && largo.every((x, i) => x === cb.largo[i]) && Date.now() - cb.ultFull < 30000) return;
  cb.firma = firma; cb.largo = largo; cb.ultFull = Date.now();
  const nuevos = cbRecolectar();
  cb.nMods = Math.max(4, ...nuevos.filter(n => n.reg === 'inventario').map(n => parseInt(String(n.terreno).split('-')[0], 10) || 1));
  const eventos = inicial || !cb.prev.size ? [] : cbCambios(cb.prev, nuevos);
  const porK = new Map(nuevos.map(n => [n.k, n])), lista = [];
  cb.N.forEach(n => { if (porK.has(n.k)) { lista.push(Object.assign(n, porK.get(n.k), { born: n.born, pos: n.pos })); porK.delete(n.k); } });
  porK.forEach(n => { n.pos = cbPos(n); n.born = inicial ? -99 : cb.tiempo; lista.push(n); });
  const cambioEstructura = lista.length !== cb.N.length || porK.size;
  cb.N = lista;
  cb.prev = new Map(cb.N.map(n => [n.k, { vistas: n.raw?.vistas || 0, estado: n.estado }]));
  if (cambioEstructura || inicial) { cbConectar(); cbBuffers(); cbFlujoVelocidad(); } else cbColores();
  cbVisibilidad();
  cbHoyCalc(); cbKpis(); cbPintarInsights(); cbBarras(); cbHoyPintar(); cb.hoyN = cb.hoyL.length;
  if (!inicial && !cb.pausa) eventos.slice(0, 12).forEach(ev => cbImpulso(ev, true));
  if (inicial) { const ult = cb.N.filter(n => !n.fijo).sort((a, b) => b.ts - a.ts).slice(0, 8); cb.feed = ult.map(n => ({ k: n.k, txt: n.tipo, sub: n.titulo, ts: n.ts })); cbPintarFeed(); }
  else cbPintarFeed();
}
/* Color y tamaño: dinero = más brillo; vencido/vendido = estrella apagada */
function _cbAspecto(nu) {
  let k = nu.big ? 1.35 : 1, s = nu.big ? 9 : nu.fijo ? 2.6 : 3.8, gris = 0;
  if (nu.monto && (nu.reg === 'cartera' || nu.reg === 'expensas')) s *= Math.min(1.9, 1 + Math.log10(1 + nu.monto / 800) * .35);
  if (nu.k.startsWith('cot:')) { if (nu.estado === 'vencido') { k = .55; gris = .6; s *= .8; } else if ((nu.raw?.vistas || 0) >= 2) s *= 1.35; }
  if (nu.fijo) { if (nu.estado && nu.estado !== 'Disponible') { k = .5; gris = .5; s *= .75; } }
  const d = (cb.dens || {})[nu.reg] ?? 1; if (!nu.big) { s *= d; k *= .55 + .45 * d; }       // regiones con miles de registros: estrellas más finas para no tapar la galaxia
  return { k, s: s * (nu.peso || 1), gris };
}
function cbColores() {
  const cnt = {}; cb.N.forEach(n => cnt[n.reg] = (cnt[n.reg] || 0) + 1); cb.dens = {}; Object.entries(cnt).forEach(([r, v]) => cb.dens[r] = Math.max(.38, Math.min(1, Math.sqrt(450 / v))));
  const col = cb.geo.attributes.color.array, siz = cb.geo.attributes.size.array, c = new cb.T.Color();
  cb.N.forEach((nu, i) => { const a = _cbAspecto(nu); c.set(CB_REG[CB_RI[nu.reg]].c); if (a.gris) { const l = (c.r + c.g + c.b) / 3; c.r += (l - c.r) * a.gris; c.g += (l - c.g) * a.gris; c.b += (l - c.b) * a.gris; }
    col[i * 3] = Math.min(1, c.r * a.k); col[i * 3 + 1] = Math.min(1, c.g * a.k); col[i * 3 + 2] = Math.min(1, c.b * a.k); siz[i] = a.s; });
  cb.geo.attributes.color.needsUpdate = true; cb.geo.attributes.size.needsUpdate = true;
}
function cbBuffers() {
  const T = cb.T, n = cb.N.length, pos = cb.geo.attributes.position.array, born = cb.geo.attributes.born.array;
  cb.N.forEach((nu, i) => { nu.i = i; pos.set(nu.pos, i * 3); born[i] = nu.born; });
  cbColores();
  ['position', 'born'].forEach(a => cb.geo.attributes[a].needsUpdate = true);
  cb.geo.setDrawRange(0, n);
  const col = cb.geo.attributes.color.array;
  const emb = new Set(['ventas', 'cotizaciones', 'callcenter', 'marketing']);   // líneas fijas solo en el embudo; las demás aparecen al elegir una estrella
  cb.linksVis = cb.links.filter(([a, b]) => { const A = cb.N[a], B = cb.N[b]; if (!emb.has(A.reg) || !emb.has(B.reg)) return false; const p = A.pos, q = B.pos; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < .6; });
  const lp = new Float32Array(cb.linksVis.length * 6), lc = new Float32Array(cb.linksVis.length * 6);
  cb.linksVis.forEach(([a, b], j) => { lp.set(cb.N[a].pos, j * 6); lp.set(cb.N[b].pos, j * 6 + 3); for (const [o, idx] of [[0, a], [3, b]]) { lc[j * 6 + o] = col[idx * 3] * .5; lc[j * 6 + o + 1] = col[idx * 3 + 1] * .5; lc[j * 6 + o + 2] = col[idx * 3 + 2] * .5; } });
  cb.lgeo.setAttribute('position', new T.BufferAttribute(lp, 3)); cb.lgeo.setAttribute('color', new T.BufferAttribute(lc, 3));
  cb.lcolBase = lc.slice();
}
function cbRango() {
  const ahora = Date.now();
  if (cb.replay) return [cb.replay.desde, cb.replay.t];
  if (cb.modo === 'hoy') return [_cbHoy0(), ahora + 1];
  if (cb.modo === 'mes') { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), ahora + 1]; }
  if (cb.modo === 'gestion') return [_cbGestion0(), ahora + 1];
  return [0, ahora + 864e5];
}
function cbVisibilidad() {
  if (!cb.geo) return;
  const [d, h] = cbRango(), al = cb.geo.attributes.alpha.array, foco = cb.aislado ? new Set(cb.aislado) : null, cuenta = new Array(CB_REG.length).fill(0);
  cb.N.forEach((n, i) => {
    const ri = CB_RI[n.reg]; let a = (n.fijo || (n.ts >= d && n.ts <= h)) && !cb.ocultas.has(ri) ? 1 : 0;
    if (a) cuenta[ri]++;
    if (a && foco && !foco.has(i)) a = .38; else if (a && !foco && cb.focoSuave && !cb.focoSuave.has(i)) a = .3;
    al[i] = a;
  });
  cb.geo.attributes.alpha.needsUpdate = true;
  if (cb.lcolBase && cb.lgeo.attributes.color) {
    const lc = cb.lgeo.attributes.color.array;
    cb.linksVis.forEach(([a, b], j) => { const v = Math.min(al[a], al[b]) * (foco ? (foco.has(a) && foco.has(b) ? 2.2 : .5) : 1); for (let o = 0; o < 6; o++) lc[j * 6 + o] = cb.lcolBase[j * 6 + o] * v; });
    cb.lgeo.attributes.color.needsUpdate = true;
  }
  cb.amb.material.uniforms.uOp.value = foco ? .6 : cb.comparar ? .55 : .95;
  cuenta.forEach((v, i) => { const el = document.getElementById('cb-rc-' + i); if (el) el.textContent = v.toLocaleString('es-BO'); });
  document.querySelectorAll('#cb-chips button').forEach(b => b.classList.toggle('off', cb.ocultas.has(+b.dataset.r)));
}
function cbRegion(i) { cb.ocultas.has(i) ? cb.ocultas.delete(i) : cb.ocultas.add(i); cbVisibilidad(); cbKpis(); }

/* ── 6 · Animación ────────────────────────────────────────────────────── */
function cbAnimar() {
  cancelAnimationFrame(cb.raf);
  let ult = performance.now();
  const paso = t => {
    if (!cb.abierto) return;
    const dt = Math.min(.25, (t - ult) / 1000); ult = t; cb.tiempo += dt;
    cbCalidad(dt);
    const o = cb.orb;
    if (!cb.comparar) cb.g.rotation.y += dt * CB_GIRO;
    cb.g.updateMatrixWorld();
    cb._w = cb._w || new cb.T.Vector3(); const W = q => cb._w.set(q[0], q[1], q[2]).applyMatrix4(cb.g.matrixWorld);
    if (o.vuelo) { const v = o.vuelo; v.t = Math.min(1, v.t + dt / v.dur); const e = v.ease === 'out' ? 1 - (1 - v.t) ** 4 : v.t < .5 ? 4 * v.t ** 3 : 1 - (-2 * v.t + 2) ** 3 / 2;
      if (v.local) v.t1.copy(W(v.local));
      o.tgt.lerpVectors(v.t0, v.t1, e); o.rad = v.r0 + (v.r1 - v.r0) * e; o.th = v.th0 + (v.th1 - v.th0) * e; if (v.ph1 != null) o.ph = v.ph0 + (v.ph1 - v.ph0) * e;
      if (v.t >= 1) { o.vuelo = null; o.sigue = v.local || null; } }
    else { if (o.sigue) o.tgt.copy(W(o.sigue)); if (o.auto && !o.arrastrando && !cb.ruta) o.th += dt * (cb.dir?.on ? .03 : .012); }
    cbDirPaso(dt); cbLatido();
    [cb.pts, cb.amb].forEach(p => { const u = p.material.uniforms; u.uT.value = cb.tiempo; u.uR.value = o.rad; });
    cb.bruma.material.uniforms.uT.value = cb.tiempo; if (cb.flujo) cb.flujo.material.uniforms.uT.value = cb.tiempo;
    cb.ray.params.Points.threshold = Math.max(.012, o.rad * .0065);
    if (cb.salto) cbSaltoPaso(dt);
    else if (cb.ruta) cbRutaPaso(dt);
    else { cb.cam.position.set(o.tgt.x + o.rad * Math.sin(o.ph) * Math.cos(o.th), o.tgt.y + o.rad * Math.cos(o.ph), o.tgt.z + o.rad * Math.sin(o.ph) * Math.sin(o.th)); cb.cam.lookAt(o.tgt); }
    { const dc = cb.cam.position.length(), kc = Math.max(0, Math.min(1, (dc - .8) / 2.6)); cb.kNucleo = kc; cb.bruma.material.uniforms.uOp.value = .3 + .7 * kc; if (cb.nucleo2) cb.nucleo2.material.opacity = .42 * kc; if (cb.bl) cb.bl.comp.uniforms.k.value = .95 * (.45 + .55 * kc) + .55 * (cb.musNivel || 0); }
    cbPulsosPaso(dt); cbReplayPaso(dt); cbAnimsPaso(dt);
    cbEscalarFx(cb.fx, false); cbEscalarFx(cb.selFx, true);
    if (cb.comparar) cbCompararRender(); else if (cb.bloomOn && cb.bl) cbBloomRender(); else cb.r.render(cb.scene, cb.cam);
    cbFlotantesPaso(dt); cbNombresPaso(dt);
    cb.raf = requestAnimationFrame(paso);
  };
  cb.raf = requestAnimationFrame(paso);
}
/* Anillos y halos: tamaño según la distancia a la cámara (no tapan todo al acercarse) */
function cbEscalarFx(grupo, sel) {
  const cp = cb.cam.position;
  grupo.children.forEach(s => { const u = s.userData; if (u.nb || u.base == null && !u.ring) return;
    const k = Math.max(.1, Math.min(1.3, s.position.distanceTo(cp) / 7)) * (u.base ?? 1);
    if (u.ring) { s.lookAt(cp); if (sel) { s.scale.setScalar(k); s.material.opacity = .45 + .25 * Math.sin(cb.tiempo * 2.5 + u.ring); } else s.scale.setScalar(k * (1 + .08 * Math.sin(cb.tiempo * 3 + u.ring))); }
    else s.scale.setScalar(k); });
}
function cbProy(p) { const v = new cb.T.Vector3(p[0], p[1], p[2]).applyMatrix4(cb.g.matrixWorld).project(cb.cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; }

/* Controles: arrastrar gira, rueda o pellizco acerca (hasta entrar en un brazo), tocar elige */
function cbControles(cv) {
  const o = () => cb.orb; let p0 = null, mov = 0, pinch = null;
  const tocar = () => { if (typeof cbDirPausa === 'function') cbDirPausa(); };
  cv.addEventListener('pointerdown', e => { p0 = [e.clientX, e.clientY]; mov = 0; o().arrastrando = true; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!p0 || pinch) return; const dx = e.clientX - p0[0], dy = e.clientY - p0[1]; mov += Math.abs(dx) + Math.abs(dy); p0 = [e.clientX, e.clientY];
    if (mov > 6) { o().auto = false; o().vuelo = null; cb.ruta = null; if (cb.salto) cbSaltoFin(); tocar(); } o().th += dx * .006; o().ph = Math.max(.12, Math.min(2.95, o().ph - dy * .005)); });
  cv.addEventListener('pointerup', e => { o().arrastrando = false; if (p0 && mov < 6) { tocar(); cbClick(e.clientX, e.clientY); } p0 = null; clearTimeout(cb.autoT); cb.autoT = setTimeout(() => { if (cb.sel == null) o().auto = true; }, 15000); });
  cv.addEventListener('wheel', e => { e.preventDefault(); tocar(); if (cb.ruta) cbRutaFin(); if (cb.salto) cbSaltoFin(); o().rad = Math.max(.7, Math.min(16, o().rad * (1 + Math.sign(e.deltaY) * .1))); o().vuelo = null; }, { passive: false });
  cv.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); tocar(); } }, { passive: true });
  cv.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); o().rad = Math.max(.7, Math.min(18, o().rad * pinch / d)); pinch = d; } }, { passive: true });
  cv.addEventListener('touchend', () => { pinch = null; });
}
function cbClick(x, y) {
  const m = new cb.T.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  cb.ray.setFromCamera(m, cb.cam);
  const al = cb.geo.attributes.alpha.array;
  const hits = cb.ray.intersectObject(cb.pts).filter(h => h.index < cb.N.length && al[h.index] > .5).sort((a, b) => a.distanceToRay - b.distanceToRay);
  cbSeleccionar(hits.length ? hits[0].index : null);
}
/* Volar hacia una estrella (o un punto). rad = qué tan cerca; ph opcional */
function cbVolarA(i, rad, dur = 1.6, ph, ease) {
  const n = typeof i === 'number' ? cb.N[i] : null, o = cb.orb, T = cb.T;
  const p = n ? n.pos : i; if (!p) return;
  if (cb.ruta) cbRutaFin(); if (cb.salto) cbSaltoFin();
  const t1 = new T.Vector3(p[0], p[1], p[2]).applyMatrix4(cb.g.matrixWorld);
  const ang = Math.atan2(t1.z, t1.x), dth = ((((ang - o.th) % 6.2832) + 9.4248) % 6.2832) - 3.1416;
  o.vuelo = { t: 0, dur, t0: o.tgt.clone(), t1, local: [p[0], p[1], p[2]], r0: o.rad, r1: rad || 2.6, th0: o.th, th1: o.th + dth * .35, ph0: o.ph, ph1: ph, ease };
  o.sigue = null; o.auto = false;
}


/* ── 7 · Impulsos, etiquetas flotantes y lista en vivo ─────────────────── */
function cbGlow(p, color, sc, op = 1) {
  const T = cb.T, s = new T.Sprite(new T.SpriteMaterial({ map: cb.glowTex, color: new T.Color(color), transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }));
  s.position.set(p[0], p[1], p[2]); s.scale.set(sc, sc, sc); s.userData.base = sc; return s;
}
function cbCurva(a, b, lift = .25) {
  const T = cb.T, A = new T.Vector3(...a), B = new T.Vector3(...b), M = A.clone().add(B).multiplyScalar(.5);
  M.multiplyScalar(1 + lift); M.y += lift * .4; return new T.QuadraticBezierCurve3(A, M, B);
}
/* Un impulso viaja de una neurona a otra dejando estela */
function cbPulso(desde, hasta, color, dur = 1.6) {
  if (!desde || !hasta || cb.pulsos.length > 60) return;
  const curva = cbCurva(desde, hasta, .2 + Math.random() * .2), T = cb.T;
  const linea = new T.Line(new T.BufferGeometry().setFromPoints(curva.getPoints(40)), new T.LineBasicMaterial({ color: new T.Color(color), transparent: true, opacity: .6, blending: T.AdditiveBlending, depthWrite: false }));
  const estela = Array.from({ length: 12 }, (_, k) => cbGlow([0, 0, 0], k ? color : '#FFF6DE', k ? .15 * (1 - k / 13) : .36, (1 - k / 12) * (k ? .75 : 1)));
  cb.fx.add(linea); estela.forEach(s => cb.fx.add(s));
  cb.pulsos.push({ curva, linea, estela, t: 0, dur });
}
function cbPulsosPaso(dt) {
  cb.pulsos = cb.pulsos.filter(p => {
    p.t += dt / p.dur;
    p.estela.forEach((s, k) => { const tt = Math.max(0, Math.min(1, p.t - k * .018)); s.position.copy(p.curva.getPoint(tt)); s.visible = p.t - k * .018 > 0 && p.t < 1.25; });
    p.linea.material.opacity = Math.max(0, .6 * (1 - Math.max(0, p.t - .8) * 2.2));
    if (p.t > 1.3) { cb.fx.remove(p.linea); p.estela.forEach(s => cb.fx.remove(s)); p.linea.geometry.dispose(); return false; }
    return true;
  });
  cb.fx.children.filter(s => s.userData.vida != null).forEach(s => { s.userData.vida -= dt; if (s.userData.vida <= 0) cb.fx.remove(s); else if (s.material) s.material.opacity = Math.min(s.userData.op || 1, s.userData.vida / 2); });
}
/* Una acción nueva: la neurona se enciende, aparece su etiqueta y salen impulsos a lo que toca */
function cbImpulso(ev, vivo) {
  const i = cb.porKey.get(ev.k), n = cb.N[i]; if (!n) return;
  if (vivo && typeof cbDirAvisar === 'function') cbDirAvisar(i, ev);
  const color = ev.color || CB_REG[CB_RI[n.reg]].c;
  cb.geo.attributes.born.array[i] = cb.tiempo; cb.geo.attributes.born.needsUpdate = true;
  const anillo = new cb.T.Mesh(new cb.T.RingGeometry(.12, .126, 48), new cb.T.MeshBasicMaterial({ color: new cb.T.Color(color), transparent: true, opacity: .8, side: cb.T.DoubleSide, blending: cb.T.AdditiveBlending }));
  anillo.position.set(...n.pos); anillo.userData = { ring: Math.random() * 6, vida: 6, op: .8 }; cb.fx.add(anillo);
  const halo = cbGlow(n.pos, color, .5, .95); halo.userData = { vida: 5, op: .95, base: .5 }; cb.fx.add(halo);
  if (n.tipo === 'Reserva' && ev.nueva) cbSupernova(n.pos, color);
  if (ev.color === '#7FBF7A' && n.k.startsWith('cot:')) cbPulso(n.pos, [0, 0, 0], '#9BE29A', 2.6);   // cometa: el cliente se acerca al núcleo
  const vec = (cb.vec[i] || []).slice(-4);
  if (vec.length) vec.forEach((j, k) => setTimeout(() => cbPulso(cb.N[j].pos, n.pos, color), k * 220));
  else cbPulso(CB_REG[CB_RI[n.reg]].p, n.pos, color);
  cbFlotante(i, `<b style="color:${color}">${ev.nueva ? '+ ' : ''}${_cbEsc(ev.txt)}</b> ${_cbEsc((ev.sub || '').slice(0, 46))}`, color);
  cb.feed.unshift({ k: ev.k, txt: ev.txt, sub: ev.sub, ts: ev.ts || Date.now(), color }); cb.feed.length = Math.min(cb.feed.length, 14); cbPintarFeed(true);
  cbSonar(CB_RI[n.reg]);
}
function _cbEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cbFlotante(i, html, color, vida = 6) {
  const d = document.createElement('div'); d.className = 'cb-fl'; d.style.setProperty('--c', color); d.innerHTML = html;
  document.getElementById('cb-fl').appendChild(d);
  cb.flotantes.push({ i, d, fin: performance.now() + vida * 1000, total: vida });
  while (cb.flotantes.length > 3) { const f = cb.flotantes.shift(); f.d.remove(); }
}
function cbFlotantesPaso(dt = 1 / 60) {
  cb.flotantes = cb.flotantes.filter(f => {
    const vida = (f.fin - performance.now()) / 1000, n = cb.N[f.i];
    if (vida <= 0 || !n) { f.d.remove(); return false; }
    const [x, y, z] = cbProy(n.pos); f.d.style.transform = `translate(${x + 14}px,${y - 16}px)`; f.d.style.opacity = z > 1 ? 0 : Math.min(1, vida / 1.2, (f.total - vida) * 3);
    return true;
  });
  // etiquetas del camino aislado
  (cb.etiquetas || []).forEach(e => { const n = cb.N[e.i]; if (!n) return; const [x, y, z] = cbProy(n.pos); e.d.style.transform = `translate(${x + e.dx}px,${y + e.dy}px)`; e.d.style.opacity = z > 1 ? 0 : 1; });
  // línea guía a la tarjeta
  const ov = document.getElementById('cb-ov');
  if (!cb.ovP) { ov.innerHTML = '<path fill="none" stroke="#E0B865" stroke-opacity=".6"/><circle r="3" fill="#E0B865"/>'; cb.ovP = ov.firstChild; cb.ovC = ov.lastChild; }
  if (cb.sel != null && !cb.cine && innerWidth > 900 && cb.N[cb.sel]) {
    const [x, y] = cbProy(cb.N[cb.sel].pos); if ((cb.cardT = (cb.cardT || 0) - dt) <= 0 || !cb.cardR) { cb.cardR = document.getElementById('cb-card').getBoundingClientRect(); cb.cardT = .5; }
    const card = cb.cardR; cb.ovP.setAttribute('d', `M${x + 12},${y} L${x + 60},${card.top + 40} L${card.left},${card.top + 40}`); cb.ovC.setAttribute('cx', card.left); cb.ovC.setAttribute('cy', card.top + 40); ov.style.display = '';
  } else ov.style.display = 'none';
}
function cbPintarFeed(nuevo) {
  const el = document.getElementById('cb-feed'); if (!el) return;
  el.innerHTML = cb.feed.slice(0, 9).map((f, j) => { const n = cb.N[cb.porKey.get(f.k)], c = f.color || (n ? CB_REG[CB_RI[n.reg]].c : '#8F8676');
    return `<button type="button" class="cb-ev${j === 0 && nuevo ? ' new' : ''}" onclick="cbSeleccionar(${n ? n.i : 'null'},true)"><i style="background:${c};box-shadow:0 0 8px ${c}"></i><div>${_cbEsc(f.txt)}<span>${_cbEsc((f.sub || '').slice(0, 52))}</span></div><em>${_cbHace(f.ts)}</em></button>`; }).join('') || '<p class="cb-vacio">Esperando acciones…</p>';
}
function cbKpis() {
  const al = cb.geo?.attributes.alpha.array; if (!al) return;
  let vis = 0; cb.N.forEach((n, i) => { if (al[i] > 0) vis++; });
  const hoy = (cb.hoyL || []).length;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('cb-k-n', vis.toLocaleString('es-BO')); set('cb-k-c', cb.links.length.toLocaleString('es-BO')); set('cb-k-h', '+' + hoy.toLocaleString('es-BO'));
}
function cbPintarInsights() {
  cb.ins = cbInsights();
  const el = document.getElementById('cb-ins'); if (!el) return;
  document.getElementById('cb-ins-n').textContent = cb.ins.length ? cb.ins.length + ' hoy' : '';
  const mob = document.getElementById('cb-mob-n'); if (mob) mob.textContent = cb.ins.length || '';
  const col = { al: '#E07A5F', cal: '#E0B865', pat: '#8FC7B8', rec: '#7FBF7A', dor: '#BFB39A', top: '#D8C9A3' };
  el.innerHTML = cb.ins.length ? cb.ins.map((x, j) => `<div class="cb-th${x.t === 'al' ? ' al' : ''}"><div class="k" style="color:${col[x.t]}"><span>${x.k}</span><span>${x.r}</span></div>${_cbEsc(x.m)}${x.s ? `<span>${_cbEsc(x.s)}</span>` : ''}
    ${x.idx && x.idx.length ? `<div class="acc"><button type="button" onclick="cbVerInsight(${j})">Ver estrellas</button>${x.t === 'al' ? `<button type="button" onclick="cbCerrar();switchAdminTab('cartera')">Ir al CRM</button>` : ''}</div>` : ''}</div>`).join('')
    : '<p class="cb-vacio">Nada fuera de lo normal por ahora.</p>';
  // alerta: aura roja en la región
  cb.fx.children.filter(s => s.userData.alerta).forEach(s => cb.fx.remove(s));
  const al = cb.ins.find(x => x.t === 'al');
  if (al) (al.idx || []).filter(i => cb.N[i]).slice(0, 30).forEach(i => { const a = cbGlow(cb.N[i].pos, '#E07A5F', .2, .7); a.userData.alerta = 1; cb.fx.add(a);
    const rg = new cb.T.Mesh(new cb.T.RingGeometry(.05, .054, 40), new cb.T.MeshBasicMaterial({ color: 0xE07A5F, transparent: true, opacity: .6, side: cb.T.DoubleSide, blending: cb.T.AdditiveBlending })); rg.position.set(...cb.N[i].pos); rg.userData = { alerta: 1, ring: 1 + i % 5 }; cb.fx.add(rg); });
}
function cbVerInsight(j) { const x = cb.ins[j]; if (!x || !x.idx) return; const idx = x.idx.filter(i => i != null); if (idx.length === 1) cbSeleccionar(idx[0], true); else cbAislar(idx, x.k + ' · ' + idx.length + ' estrellas'); }

/* Barras de actividad (abajo): hoy por 15 min, o el período elegido por día */
function cbBarras() {
  const el = document.getElementById('cb-bars'); if (!el) return;
  let [d, h] = cbRango();
  if (cb.replay) { d = cb.replay.desde; h = cb.replay.hasta; } else if (cb.modo === 'vivo') { d = _cbHoy0(); h = d + 864e5; }
  if (!d) d = Math.min(...cb.N.filter(n => n.ts).map(n => n.ts), Date.now() - 30 * 864e5);
  const B = 72, paso = (h - d) / B, bins = new Array(B).fill(0);
  cb.N.forEach(n => { if (n.ts >= d && n.ts < h) bins[Math.floor((n.ts - d) / paso)]++; });
  const mx = Math.max(1, ...bins), ahoraB = Math.floor((Date.now() - d) / paso);
  el.innerHTML = bins.map((v, i) => `<i style="height:${4 + v / mx * 32}px" class="${cb.replay ? (i < (cb.replay.t - d) / paso ? 'past' : '') : (i === ahoraB ? 'hot' : '')}" title="${v} acciones"></i>`).join('');
  const f = ts => new Date(ts).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  document.getElementById('cb-t-l').textContent = cb.replay ? 'Replay · ' + f(d) + ' → ' + f(h) : (cb.modo === 'vivo' || cb.modo === 'hoy' ? 'Hoy · cada barra = 20 min' : f(d) + ' → hoy');
  document.getElementById('cb-t-r').textContent = cb.replay ? '' : 'Tocá ▶ para ver cómo creció';
}

/* ── 8 · Tarjeta de la neurona ─────────────────────────────────────────── */
function cbSeleccionar(i, volar) {
  if (volar && cb.dir?.on) cbDirPausa(45000);
  cb.sel = i; const card = document.getElementById('cb-card');
  cb.selFx.clear();
  if (i == null) { card.classList.remove('on'); return; }
  const n = cb.N[i]; if (!n) return;
  const color = CB_REG[CB_RI[n.reg]].c;
  cb.selFx.add(cbGlow(n.pos, color, .55, .9)); cb.selFx.add(cbGlow(n.pos, '#FFF6DE', .2, 1));
  [.14, .22].forEach((r, k) => { const m = new cb.T.Mesh(new cb.T.RingGeometry(r, r + .006, 64), new cb.T.MeshBasicMaterial({ color: new cb.T.Color('#E0B865'), transparent: true, opacity: .6, side: cb.T.DoubleSide, blending: cb.T.AdditiveBlending })); m.position.set(...n.pos); m.userData.ring = k + 1; m.userData.base = 1; cb.selFx.add(m); });
  (cb.vec[i] || []).slice(0, 10).forEach(j => { const c = cbCurva(n.pos, cb.N[j].pos, .15); const l = new cb.T.Line(new cb.T.BufferGeometry().setFromPoints(c.getPoints(30)), new cb.T.LineDashedMaterial({ color: 0xFFE7B0, transparent: true, opacity: .5, dashSize: .04, gapSize: .03 })); l.computeLineDistances(); cb.selFx.add(l); cb.selFx.add(cbGlow(cb.N[j].pos, '#FFE7B0', .14, .9)); });
  card.innerHTML = cbCardHTML(n); card.classList.add('on');
  if (volar) cbVolarA(i);
}
function cbCardHTML(n) {
  const r = n.raw || {}, color = CB_REG[CB_RI[n.reg]].c;
  const ter = n.terreno || (n.terrenos || [])[0];
  const foto = ter && typeof cotzFotos === 'function' ? cotzFotos(ter)[0] : null;
  const filas = []; const f = (k, v) => { if (v !== undefined && v !== null && v !== '' && v !== 0) filas.push(`<span>${k}</span><b>${_cbEsc(v)}</b>`); };
  f('Cliente', n.cliente); f('Terreno', n.terrenos && n.terrenos.length > 1 ? n.terrenos.join(', ') : ter);
  if (n.k.startsWith('cot:')) { f('Precio final', r.precioFinal ? _cbUsd(r.precioFinal) + (r.nroCuotas && r.modalidad !== 'Contado' ? ' · ' + r.nroCuotas + ' cuotas' : '') : (r.perfil?.presupuesto ? 'hasta ' + _cbUsd(r.perfil.presupuesto) : '')); f('Origen', [r.origen, r.campaniaCodigo].filter(Boolean).join(' · ')); }
  else if (n.monto) f(n.reg === 'expensas' ? 'Monto' : 'Monto', n.reg === 'expensas' ? 'Bs ' + Math.round(n.monto).toLocaleString('es-BO') : _cbUsd(n.monto));
  f('Asesor', n.asesor); f('Estado', n.estado); f('Fecha', n.ts ? _cbFecha(n.ts) : '');
  const temp = n.k.startsWith('cot:') ? cbTemperatura(r) : null;
  const camino = cbHistoria(n.i, 9);
  const hist = camino.map(j => { const m = cb.N[j]; return `<div style="--c:${CB_REG[CB_RI[m.reg]].c}"${j === n.i ? ' class="yo"' : ''}>${_cbEsc(m.tipo)}<small>${_cbEsc((m.titulo || '').replace(/^.*· /, '').slice(0, 30))}</small><span>${m.fijo ? '' : _cbFecha(m.ts)}</span></div>`; }).join('');
  const sig = cbSiguientePaso(n);
  const wa = typeof _czCelularWa === 'function' ? _czCelularWa(r.celular || r.telefono) : '';
  const modulo = { ventas: 'tabla', cotizaciones: 'cotizaciones', callcenter: 'tabla', cartera: 'cartera', marketing: 'marketing-admin', inventario: 'inventario', expensas: 'expensas' }[n.reg];
  return `<button type="button" class="cb-x" onclick="cbSeleccionar(null)">×</button>
    <div class="cb-c-k" style="color:${color}"><span>Estrella · ${_cbEsc(n.tipo)}</span><span>${n.ts && Date.now() - n.ts < 864e5 ? '● activa' : CB_REG[CB_RI[n.reg]].n}</span></div>
    <div class="cb-c-t">${_cbEsc(n.titulo)}</div>
    ${foto ? `<div class="cb-c-img" style="background-image:url('${foto}')"><span>${_cbEsc(ter)}</span></div>` : ''}
    ${temp ? `<div class="cb-temp"><span>Temperatura</span><div class="bar"><i style="left:${Math.round(temp.v * 100)}%"></i></div><b class="t-${temp.t.toLowerCase()}">${temp.t}</b></div>` : ''}
    <div class="cb-c-g">${filas.join('')}</div>
    ${cbHoyBloque(n)}
    ${camino.length > 1 ? `<div class="cb-h"><span>Historia · ${camino.length} estrellas conectadas</span></div><div class="cb-tl">${hist}</div>` : '<p class="cb-vacio">Sin otras estrellas conectadas todavía.</p>'}
    ${sig ? `<div class="cb-sug"><b>Siguiente paso sugerido:</b> ${_cbEsc(sig)}</div>` : ''}
    <div class="cb-c-b">
      <button type="button" class="p" onclick="cbSeguir(${n.i})">Seguir el impulso</button>
      ${n.k.startsWith('cot:') ? `<button type="button" onclick="cotzAbrirHoja('${r._key}')">Abrir hoja</button>` : `<button type="button" onclick="cbCerrar();switchAdminTab('${modulo}')">Ir al módulo</button>`}
      ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      <button type="button" onclick="cbAislar(cbHistoria(${n.i},14),'Camino de ${_cbEsc((n.cliente || n.titulo || '').replace(/'/g, ''))}')">Aislar</button>
    </div>`;
}
/* Seguir el impulso: la cámara recorre la historia y un pulso viaja de neurona en neurona */
function cbSeguir(i) {
  if (cb.dir?.on) cbDirPausa(45000);
  const camino = cbHistoria(i, 9).filter(j => !cb.N[j].fijo || j === i); if (camino.length < 2) { cbVolarA(i, 2.6); return; }
  camino.forEach((j, k) => setTimeout(() => { if (!cb.abierto) return; cbVolarA(j, 3); if (k) cbPulso(cb.N[camino[k - 1]].pos, cb.N[j].pos, CB_REG[CB_RI[cb.N[j].reg]].c, 1.1); cbFlotante(j, `<b>${k + 1}</b> ${_cbEsc(cb.N[j].tipo)}`, CB_REG[CB_RI[cb.N[j].reg]].c, 4); }, k * 1500));
}
/* Aislar: el resto queda en segundo plano (visible) y el camino se numera */
function cbAislar(idx, titulo) {
  (cb.etiquetas || []).forEach(e => e.d.remove()); cb.etiquetas = [];
  cb.aislado = idx && idx.length ? idx : null;
  if (cb.aislado && cb.dir?.on) cbDirPausa(60000);
  const av = document.getElementById('cb-aviso');
  if (cb.aislado) {
    av.innerHTML = `<b>Aislar</b> · ${_cbEsc(titulo || '')} · <button type="button" onclick="cbAislar(null)">Esc para volver</button>`; av.classList.add('on');
    const orden = cb.aislado.slice().sort((a, b) => (cb.N[a].fijo ? -1 : cb.N[a].ts) - (cb.N[b].fijo ? -1 : cb.N[b].ts)).slice(0, 14);
    orden.forEach((j, k) => { const d = document.createElement('div'); d.className = 'cb-path'; d.innerHTML = `<b>${k + 1}</b>${_cbEsc(cb.N[j].tipo)}`; document.getElementById('cb-fl').appendChild(d); cb.etiquetas.push({ i: j, d, dx: k % 2 ? 14 : -10 - 8 * cb.N[j].tipo.length, dy: k % 2 ? -6 : -26 }); });
    for (let k = 1; k < orden.length; k++) cbPulso(cb.N[orden[k - 1]].pos, cb.N[orden[k]].pos, '#E0B865', 1.2 + k * .15);
    const c = orden.reduce((s, j) => s.map((v, q) => v + cb.N[j].pos[q] / orden.length), [0, 0, 0]);
    cbVolarA(c, 4.6, 1.2);
  } else av.classList.remove('on');
  cbVisibilidad();
}

/* ── 9 · Búsqueda ──────────────────────────────────────────────────────── */
function cbBuscar() {
  const q = _cbN(document.getElementById('cb-q').value), el = document.getElementById('cb-res');
  if (q.length < 2) { el.innerHTML = ''; return; }
  const r = cb.N.filter(n => [n.cliente, n.terreno, n.titulo, n.asesor, n.raw?.codigo].some(v => _cbN(v).includes(q))).sort((a, b) => b.ts - a.ts).slice(0, 8);
  const [d, h] = cbRango(), ases = [...new Set(cb.N.filter(n => n.asesor && _cbN(n.asesor).includes(q)).map(n => n.asesor))].slice(0, 2);
  const cons = ases.map(a => { const idx = cb.N.filter(n => n.asesor === a && n.ts >= d && n.ts <= h).map(n => n.i); return idx.length > 1 ? `<button type="button" class="cons" onclick="cbAislar([${idx.slice(-300)}],'Constelación de ${_cbEsc(a).replace(/'/g, '')}');document.getElementById('cb-res').innerHTML=''"><i style="background:#F1ECE2"></i>Constelación de ${_cbEsc(a)}<em>${idx.length} estrellas</em></button>` : ''; }).join('');
  el.innerHTML = cons + (r.length ? r.map(n => `<button type="button" onclick="cbSeleccionar(${n.i},true);document.getElementById('cb-res').innerHTML='';document.getElementById('cb-root').classList.remove('m-ins')"><i style="background:${CB_REG[CB_RI[n.reg]].c}"></i>${_cbEsc(n.titulo)}<em>${cbClienteHoyTxt(n.cliente) ? '<b class="hoy">hoy ' + cbClienteHoyTxt(n.cliente) + '</b>' : _cbEsc(n.tipo)}</em></button>`).join('') : (cons ? '' : '<p class="cb-vacio">Sin coincidencias.</p>'));
}

/* ── 10 · Modos ────────────────────────────────────────────────────────── */
function cbModo(m) {
  if (m === 'replay') { cbReplayToggle(true); return; }
  if (cb.replay) cbReplayToggle(false);
  if (m === 'comparar') { cbComparar(); return; }
  if (cb.comparar) cbComparar(false);
  cb.modo = m; document.querySelectorAll('#cb-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  document.getElementById('cb-live-t').textContent = m === 'vivo' ? 'En vivo' : 'En vivo · filtrando ' + { hoy: 'hoy', mes: 'este mes', gestion: 'la gestión' }[m];
  cbVisibilidad(); cbKpis(); cbBarras();
}
/* Replay: el cerebro se arma en el tiempo y aparecen los hitos de cada mes */
function cbReplayToggle(on) {
  if (on === undefined) on = !cb.replay;
  if (on && cb.dir?.on) cbDirPausa(36e5);
  const root = document.getElementById('cb-root');
  if (!on) { cb.replay = null; root.classList.remove('replay'); document.getElementById('cb-play-i').setAttribute('d', 'M12 10 L20 15 L12 20 Z'); document.querySelectorAll('#cb-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === cb.modo)); cbVisibilidad(); cbKpis(); cbBarras(); return; }
  const mes0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const desde = cb.replayHoy || cb.modo === 'hoy' ? _cbHoy0() : cb.modo === 'mes' ? mes0 : _cbGestion0();
  cb.replayHoy = false;
  const hasta = Date.now(), dur = cb.replayDur || 40; cb.replayDur = null;
  cb.replay = { desde, hasta, t: desde, vel: 1, dur, hitos: cbHitos(desde, hasta), mostrado: new Set() };
  root.classList.add('replay'); document.getElementById('cb-play-i').setAttribute('d', 'M10 9 h4 v12 h-4 z M16 9 h4 v12 h-4 z');
  document.querySelectorAll('#cb-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === 'replay'));
  document.querySelectorAll('#cb-big-sp button').forEach(b => b.classList.toggle('on', b.dataset.v === '1'));
  cb.orb.auto = true;
}
function cbReplayVel(v) { if (cb.replay) cb.replay.vel = v; document.querySelectorAll('#cb-big-sp button').forEach(b => b.classList.toggle('on', +b.dataset.v === v)); }
function cbHitos(d, h) {
  const out = [], mes = {};
  cb.N.forEach(n => { if (n.ts >= d && n.ts <= h) { const k = new Date(n.ts).getFullYear() * 12 + new Date(n.ts).getMonth(); (mes[k] = mes[k] || { n: 0, res: 0, ts: n.ts }); mes[k].n++; if (n.tipo === 'Reserva') mes[k].res++; mes[k].ts = Math.min(mes[k].ts, n.ts); } });
  const ks = Object.keys(mes).map(Number).sort((a, b) => a - b), maxRes = Math.max(0, ...ks.map(k => mes[k].res));
  const M = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  ks.forEach(k => out.push({ ts: mes[k].ts, k: M[k % 12], m: `+${mes[k].n.toLocaleString('es-BO')} estrellas${mes[k].res ? ' · ' + mes[k].res + ' reservas' + (mes[k].res === maxRes && ks.length > 1 ? ' (récord)' : '') : ''}` }));
  const primC = cb.N.filter(n => n.k.startsWith('vis:') && n.raw?.cotizacionKey && n.ts >= d).sort((a, b) => a.ts - b.ts)[0];
  if (primC) out.push({ ts: primC.ts, k: 'Primera vez', m: 'Call center asigna con cotización' });
  return out.sort((a, b) => a.ts - b.ts);
}
function cbReplayPaso(dt) {
  const R = cb.replay; if (!R) return;
  const antes = R.t; R.t = Math.min(R.hasta, R.t + (R.hasta - R.desde) * dt * R.vel / R.dur);
  const al = cb.geo.attributes.alpha.array, born = cb.geo.attributes.born.array; let nacidas = 0;
  cb.N.forEach((n, i) => { if (!n.fijo && n.ts > antes && n.ts <= R.t) { born[i] = cb.tiempo; nacidas++; if (nacidas < 3 && Math.random() < .25) { const v = cb.vec[i]; if (v && v.length) cbPulso(cb.N[v[0]].pos, n.pos, CB_REG[CB_RI[n.reg]].c, .9); } } });
  if (nacidas) cb.geo.attributes.born.needsUpdate = true;
  R.acc = (R.acc || 0) + dt; if (R.acc > .1) { R.acc = 0; cbVisibilidad(); } void al;
  const d = new Date(R.t);
  document.getElementById('cb-big-d').textContent = (R.hasta - R.desde < 2 * 864e5) ? d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('cb-big-s').textContent = 'Replay · ' + document.getElementById('cb-k-n').textContent + ' estrellas';
  R.hitos.forEach((h, j) => { if (h.ts <= R.t && !R.mostrado.has(j)) { R.mostrado.add(j); cbHitoMostrar(h); } });
  if (Math.floor(antes / 6e5) !== Math.floor(R.t / 6e5)) { cbKpis(); cbBarras(); }
  if (R.t >= R.hasta) { R.fin = (R.fin || 0) + dt; if (R.fin > 4) cbReplayToggle(false); }
}
function cbHitoMostrar(h) {
  const d = document.createElement('div'); d.className = 'cb-mile'; d.innerHTML = `<span>${_cbEsc(h.k)}</span>${_cbEsc(h.m)}`;
  const box = document.getElementById('cb-fl'); box.appendChild(d);
  const cant = box.querySelectorAll('.cb-mile').length; d.style.left = (18 + (cant % 3) * 26) + '%'; d.style.top = (26 + (cant % 4) * 13) + '%';
  setTimeout(() => d.classList.add('fuera'), 4200); setTimeout(() => d.remove(), 5200);
}

/* Comparar: dos cerebros lado a lado (mes vs. mes anterior, o gestión vs. anterior) */
function cbComparar(on = true, tipo) {
  const root = document.getElementById('cb-root'), el = document.getElementById('cb-cmp');
  if (!on) { (cb.cmpLin || []).forEach(l => { cb.g.remove(l); l.geometry.dispose(); }); cb.cmpLin = []; cb.comparar = null; Object.assign(cb.orb, CB_VISTA()); cb.orb.tgt.set(0, 0, 0); cb.pts.material.uniforms.uSz.value = 1; root.classList.remove('comparar'); el.classList.remove('on'); document.querySelectorAll('#cb-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === cb.modo)); cbVisibilidad(); return; }
  tipo = tipo || cb.comparar?.tipo || 'mes';
  const d = new Date(), M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  let A, B, la, lb;
  if (tipo === 'mes') { B = [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Date.now()]; A = [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), B[0]]; la = M[new Date(A[0]).getMonth()]; lb = M[d.getMonth()] + ' (hasta hoy)'; }
  else { const g = _cbGestion0(); B = [g, Date.now()]; A = [new Date(new Date(g).getFullYear() - 1, 3, 1).getTime(), g]; la = 'Gestión ' + (new Date(g).getFullYear() - 1); lb = 'Gestión ' + new Date(g).getFullYear(); }
  const en = ([x, y]) => cb.N.filter(n => n.ts >= x && n.ts < y);
  const nA = en(A), nB = en(B);
  const cnt = (arr, f) => arr.filter(f).length;
  const met = [['Estrellas', nA.length, nB.length], ['Cotizaciones', cnt(nA, n => n.reg === 'cotizaciones'), cnt(nB, n => n.reg === 'cotizaciones')], ['Reservas', cnt(nA, n => n.tipo === 'Reserva'), cnt(nB, n => n.tipo === 'Reserva')],
    ['Asignaciones atendidas', cnt(nA, n => n.k.startsWith('vis:') && n.estado === 'completada'), cnt(nB, n => n.k.startsWith('vis:') && n.estado === 'completada')]];
  const crec = CB_REG.map((r, i) => ({ r, a: cnt(nA, n => CB_RI[n.reg] === i), b: cnt(nB, n => CB_RI[n.reg] === i) })).filter(x => !['inventario'].includes(x.r.id)).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
  const dl = (a, b) => { const v = b - a; return `<em class="${v < 0 ? 'n' : ''}">${v >= 0 ? '+' : ''}${a ? Math.round(v * 100 / a) + '%' : v}</em>`; };
  const al = cb.geo.attributes.alpha.array;
  cb.comparar = { tipo, A: Float32Array.from(cb.N, n => (n.fijo || (n.ts >= A[0] && n.ts < A[1])) && !cb.ocultas.has(CB_RI[n.reg]) ? 1 : 0), B: Float32Array.from(cb.N, n => (n.fijo || (n.ts >= B[0] && n.ts < B[1])) && !cb.ocultas.has(CB_RI[n.reg]) ? 1 : 0), la, lb, nA: nA.length, nB: nB.length };
  void al;
  const lineas = arr => { const ls = cb.linksVis.filter(([a, b]) => arr[a] && arr[b]); const lp = new Float32Array(ls.length * 6), lc = new Float32Array(ls.length * 6), col = cb.geo.attributes.color.array;
    ls.forEach(([a, b], j) => { lp.set(cb.N[a].pos, j * 6); lp.set(cb.N[b].pos, j * 6 + 3); for (const [o, idx] of [[0, a], [3, b]]) for (let q = 0; q < 3; q++) lc[j * 6 + o + q] = col[idx * 3 + q] * .6; });
    const gg = new cb.T.BufferGeometry(); gg.setAttribute('position', new cb.T.BufferAttribute(lp, 3)); gg.setAttribute('color', new cb.T.BufferAttribute(lc, 3)); return gg; };
  (cb.cmpLin || []).forEach(l => { cb.g.remove(l); l.geometry.dispose(); });
  cb.cmpLin = [cb.comparar.A, cb.comparar.B].map(arr => { const l = new cb.T.LineSegments(lineas(arr), cb.lin.material); l.visible = false; cb.g.add(l); return l; });
  root.classList.add('comparar'); el.classList.add('on'); cb.orb.rad = 11.5; cb.orb.ph = .62; cb.orb.tgt.set(0, 0, 0); cb.orb.vuelo = null; cb.pts.material.uniforms.uSz.value = 1.6; cb.amb.material.uniforms.uOp.value = .55; if (cb.dir?.on) cbDirPausa(36e5);
  el.innerHTML = `<div class="cb-cmp-t l">${_cbEsc(la)}<b>${nA.length.toLocaleString('es-BO')} estrellas</b></div><div class="cb-cmp-t r">${_cbEsc(lb)}<b>${nB.length.toLocaleString('es-BO')} estrellas ${dl(nA.length, nB.length)}</b></div><div class="cb-cmp-mid"></div>
    <div class="cb-cmp-d"><div class="k"><span>Qué cambió</span><span class="sw"><button type="button" class="${tipo === 'mes' ? 'on' : ''}" onclick="cbComparar(true,'mes')">Mes vs. mes</button><button type="button" class="${tipo === 'gestion' ? 'on' : ''}" onclick="cbComparar(true,'gestion')">Gestión vs. gestión</button></span></div>
    <div class="g">${met.slice(1).map(([t, a, b]) => `<div><b>${b.toLocaleString('es-BO')}${dl(a, b)}</b>${t}</div>`).join('')}</div>
    ${crec && crec.b > crec.a ? `<p>La región que más creció fue <b>${crec.r.n}</b> (${crec.a.toLocaleString('es-BO')} → ${crec.b.toLocaleString('es-BO')}).</p>` : '<p>Ninguna región creció respecto al período anterior.</p>'}</div>`;
  document.querySelectorAll('#cb-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === 'comparar'));
  cbSeleccionar(null);
}
function cbCompararRender() {
  const r = cb.r, w = innerWidth, h = innerHeight, al = cb.geo.attributes.alpha;
  r.setScissorTest(true); cb.lin.visible = false; cb.fx.visible = false; const rad0 = cb.orb.rad; cb.orb.rad = rad0;
  [[cb.comparar.A, 0, 0], [cb.comparar.B, w / 2, 1]].forEach(([arr, x, q]) => {
    al.array.set(arr); al.needsUpdate = true; cb.cmpLin.forEach((l, k) => l.visible = k === q);
    r.setViewport(x, 0, w / 2, h); r.setScissor(x, 0, w / 2, h); cb.cam.aspect = (w / 2) / h; cb.cam.updateProjectionMatrix(); r.render(cb.scene, cb.cam);
  });
  r.setScissorTest(false); r.setViewport(0, 0, w, h); cb.cam.aspect = w / h; cb.cam.updateProjectionMatrix(); cb.lin.visible = true; cb.fx.visible = true; cb.cmpLin.forEach(l => l.visible = false);
}

/* Modo cine: sin paneles, la cámara va sola a cada acción y la cuenta en grande */
function cbCine(on) {
  cb.cine = on; const root = document.getElementById('cb-root'); root.classList.toggle('cine', on);
  cbSeleccionar(null); cb.orb.auto = true;
  if (on) { cbPantalla(true); cbDir(true); }
  else { document.getElementById('cb-cine-cap').classList.remove('on'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
}
function cbCineMostrar(i, t, s) {
  if (i != null) cbVolarA(i, 3.1);
  document.getElementById('cb-cine-t').textContent = t || ''; document.getElementById('cb-cine-s').textContent = s || '';
  const cap = document.getElementById('cb-cine-cap'); cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on');
}
function cbCinePaso() {
  if (!cb.cine) return;
  const d = new Date(), h0 = _cbHoy0();
  const T = Object.fromEntries((cb.hoyT || []).map(x => [x.id, x])); void h0;
  document.getElementById('cb-cine-r').innerHTML = `<span>${d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span><b>${(cb.hoyL || []).length}</b> movimientos hoy` + (T.pag ? `<br>Cartera <b>${_cbHoyValor(T.pag)}</b> · Expensas <b>${_cbHoyValor(T.exp)}</b><br><b>${T.vis.n}</b> visitas · <b>${T.res.n}</b> reservas · <b>${T.cot.n}</b> cotizaciones · <b>${T.age.n}</b> agendas` : '');
}
function cbPantalla(forzar) { const el = document.getElementById('cb-root'); if (document.fullscreenElement && !forzar) document.exitFullscreen().catch(() => {}); else if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {}); }

/* Sonido: un toque suave por cada impulso, con tono por región */
function cbSonido() { cb.sonido = !cb.sonido; document.getElementById('cb-b-son').classList.toggle('on', cb.sonido); }
function cbSonar(ri) {
  if (!cb.sonido) return;
  try {
    cb.ac = cb.ac || new (window.AudioContext || window.webkitAudioContext)(); const ac = cb.ac, t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = [392, 440, 523, 587, 349, 330, 494][ri] || 440;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .65);
  } catch (e) {}
}

/* Resumen del día: números, momentos clave, la neurona del día y replay de 30 s */
function cbResumen(on = true) {
  const el = document.getElementById('cb-resumen');
  if (!on) { el.classList.remove('on'); document.getElementById('cb-root').classList.remove('resumen'); return; }
  const h0 = _cbHoy0(), hoy = cb.N.filter(n => n.ts >= h0).sort((a, b) => a.ts - b.ts);
  const res = hoy.filter(n => n.tipo === 'Reserva'), cot = hoy.filter(n => n.reg === 'cotizaciones'), gest = hoy.filter(n => n.k.startsWith('gest:') || n.k.startsWith('comp:')), asig = hoy.filter(n => n.k.startsWith('vis:'));
  const bins = new Array(96).fill(0); hoy.forEach(n => bins[Math.floor((n.ts - h0) / 9e5)]++);
  const pico = bins.indexOf(Math.max(...bins)), hhmm = ts => new Date(ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const mom = [];
  const pa = asig.find(n => n.raw?.cotizacionKey); if (pa) mom.push([pa.ts, '#8FC7B8', 'Primera asignación con cotización: ' + (pa.cliente || '')]);
  if (bins[pico] >= 3) mom.push([h0 + pico * 9e5, '#E0B865', `Pico de actividad: ${bins[pico]} acciones en 15 minutos`]);
  res.slice(0, 3).forEach(n => mom.push([n.ts, '#D88B6E', `${n.asesor || ''} reservó ${n.terreno || ''}${n.monto ? ' · ' + _cbUsd(n.monto) : ''}`]));
  (cb.ins || []).filter(x => x.t === 'al').forEach(x => mom.push([Date.now(), '#E07A5F', x.m]));
  mom.sort((a, b) => a[0] - b[0]);
  const cuenta = {}; hoy.filter(n => n.asesor).forEach(n => cuenta[n.asesor] = (cuenta[n.asesor] || 0) + 1);
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  const fecha = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
  el.innerHTML = `<button type="button" class="cb-x" onclick="cbResumen(false)">×</button>
    <div class="cb-c-k"><span>Resumen del día</span><span>se abre solo a las 19:00</span></div>
    <div class="cb-rs-t">${fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
    <div class="cb-rs-g">${[[hoy.length, 'estrellas nuevas'], [cot.length, 'cotizaciones'], [res.length, 'reservas' + (res.length ? ' · ' + _cbUsd(res.reduce((s, n) => s + (n.monto || 0), 0)) : '')], [gest.length, 'gestiones de cobranza'], [asig.length, 'asignaciones'], [(cb.ins || []).filter(x => x.t === 'al').length, 'alertas']].map(([v, t]) => `<div><b>${v.toLocaleString('es-BO')}</b><span>${t}</span></div>`).join('')}</div>
    <div class="cb-h"><span>Momentos del día</span></div>
    ${mom.length ? mom.map(([ts, c, t]) => `<div class="cb-rs-m"><span>${hhmm(ts)}</span><i style="background:${c}"></i>${_cbEsc(t)}</div>`).join('') : '<p class="cb-vacio">Todavía no hubo momentos destacados hoy.</p>'}
    ${top ? `<div class="cb-h"><span>Estrella del día</span></div><div class="cb-rs-star"><b>${_cbEsc(top[0])}</b> · ${top[1]} acciones hoy</div>` : ''}
    <div class="cb-c-b"><button type="button" class="p" onclick="cbResumen(false);cb.replayHoy=true;cb.replayDur=30;cbReplayToggle(true)">Ver el día en 30 s</button><button type="button" onclick="cbGuardarImagen()">Guardar como imagen</button></div>`;
  el.classList.add('on'); document.getElementById('cb-root').classList.add('resumen');
}
function cbGuardarImagen() {
  try {
    cb.r.render(cb.scene, cb.cam);
    const src = cb.r.domElement, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const k = c.width / innerWidth, box = document.getElementById('cb-resumen');
    x.fillStyle = 'rgba(14,13,11,.86)'; x.fillRect(20 * k, 20 * k, 420 * k, (box.querySelectorAll('.cb-rs-m').length * 26 + 250) * k);
    x.fillStyle = '#E0B865'; x.font = `${11 * k}px Montserrat, Arial`; x.fillText('URUBÓ VILLAGE · RESUMEN DEL DÍA', 40 * k, 50 * k);
    x.fillStyle = '#F1ECE2'; x.font = `600 ${22 * k}px Montserrat, Arial`; x.fillText(box.querySelector('.cb-rs-t').textContent, 40 * k, 82 * k);
    let y = 120; box.querySelectorAll('.cb-rs-g div').forEach((d, j) => { const cx = 40 + (j % 3) * 130, cy = y + Math.floor(j / 3) * 56; x.fillStyle = '#F1ECE2'; x.font = `600 ${22 * k}px Montserrat, Arial`; x.fillText(d.querySelector('b').textContent, cx * k, cy * k); x.fillStyle = '#8F8676'; x.font = `${10 * k}px Montserrat, Arial`; x.fillText(d.querySelector('span').textContent.slice(0, 24), cx * k, (cy + 16) * k); });
    y += 130; box.querySelectorAll('.cb-rs-m').forEach(m => { x.fillStyle = '#CFC6B3'; x.font = `${11.5 * k}px Montserrat, Arial`; x.fillText(m.textContent.trim().slice(0, 64), 40 * k, y * k); y += 26; });
    const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', .9); a.download = 'Andromeda-resumen-' + new Date().toISOString().slice(0, 10) + '.jpg'; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toastErr('No se pudo armar la imagen.'); }
}
/* A las 19:00, si el cerebro está abierto, se muestra solo el resumen (una vez por día) */
setInterval(() => {
  if (!cb.abierto) return; const d = new Date(), k = 'uv-cerebro-res-' + d.toISOString().slice(0, 10);
  if (d.getHours() >= 19 && !cbLeer(k)) { cbGuardar(k, '1'); cbResumen(true); }
}, 60000);

/* Integración con el sistema: acordeón propio, ícono, y ?cerebro=1 abre directo */
(function () {
  if (typeof UV_ICONOS !== 'undefined') UV_ICONOS.cerebro = '<circle cx="9" cy="10" r="1.3"/><circle cx="15" cy="8" r="1.3"/><circle cx="12" cy="14" r="1.3"/><circle cx="17" cy="14" r="1.1"/><circle cx="7" cy="15" r="1.1"/><path d="M9 10l6-2M9 10l3 4M15 8l-3 6M12 14l5 0M12 14l-5 1"/><path d="M4 12a8 7 0 0 1 16 0 8 7 0 0 1-16 0"/>';
  const f = window.switchAdminTab;
  if (typeof f === 'function') window.switchAdminTab = function (id, ...r) {
    if (id !== 'cerebro') { if (cb.abierto) { cb.abierto = false; clearInterval(cb.timer); document.getElementById('cb-root')?.classList.remove('on'); document.body.classList.remove('cb-abierto'); } cb.volverA = id; }
    const out = f.call(this, id, ...r);
    if (id === 'cerebro') cbMostrarBloqueo();
    return out;
  };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) {
    const out = ea.apply(this, a);
    const nav = document.getElementById('nav-grupo-cerebro'); if (nav) nav.style.display = '';
    if (new URLSearchParams(location.search).get('cerebro') === '1') setTimeout(() => switchAdminTab('cerebro'), 400);
    return out;
  };
})();


/* ── 11 · Director: recorrido automático por lo importante ────────────────
   Vista general → se acerca a una región → enfoca la estrella más relevante
   (reserva, cliente caliente, compromiso vencido, pago grande, lo más nuevo)
   → muestra su tarjeta y su historia → vuelve. Cada 3 vueltas cuenta algo que
   Andrómeda notó. Si entra una acción real, interrumpe y va a verla.
   Cualquier toque del usuario lo pausa 25 s y después retoma solo.        */
cb.dir = { on: false, pausa: 0, esc: 'general', t: 0, dur: 7, ciclo: 0, ri: -1, foco: null, cola: [], vistos: [], ultIns: 0, insI: 0, reloj: 0 };
cb.anims = [];
const CB_ESC = { general: ['Vista general', 7], region: ['Acercando', 3.6], estrella: ['Enfocando', 3], detalle: ['Detalle', 8], vuelta: ['Volviendo', 2.6], insight: ['Andrómeda notó', 7.5], ahora: ['Ahora mismo', 6.5], viaje: ['Viaje por un brazo', 12.4], vuelo: ['Viaje espacial', 4.5] };
const CB_RONDA = ['cotizaciones', 'callcenter', 'ventas', 'cartera', 'marketing', 'expensas', 'inventario'];

function cbDir(on) {
  if (on === undefined) on = !cb.dir.on;
  const d = cb.dir; d.on = on; cbGuardarL('uv-andromeda-auto', on ? '1' : '0');
  document.getElementById('cb-b-auto')?.classList.toggle('on', on);
  document.getElementById('cb-root')?.classList.toggle('dir', on);
  if (on) { d.pausa = 0; d.ciclo = 0; d.cola = []; d.diaIni = false; d.diaFin = false; d.vistos = []; cbDirEscena('general'); cbCalmaDespertar?.(); }
  else { cbDirLimpiar(); cbDirCaption(null); document.getElementById('cb-io')?.classList.remove('on'); cb.orb.auto = true; if (cb.cine) cbCine(false); }
  cbDirBarra();
}
function cbDirPausa(ms = 25000) {
  const d = cb.dir; if (!d.on || !cb.abierto) return;
  d.pausa = performance.now() + ms; if (cb.ruta) cbRutaFin(); cbDirLimpiar(); cbDirCaption(null); document.getElementById('cb-io')?.classList.remove('on'); cbDirBarra();
}
function cbDirLimpiar() { if (cb.salto && cb.dir.esc !== 'vuelo' && cb.dir.esc !== 'ahora') cbSaltoFin(); cbHistoriaCortar(); cbMira(null); cbNarrar(''); if (cb.cam && Math.abs(cb.cam.fov - (innerWidth < 700 ? 46 : 38)) > .5) cbLente(null, 1); }
function cbDirBoton() { const d = cb.dir; if (d.pausa) { d.pausa = 0; cbDirEscena('vuelta'); cbDirBarra(); } else cbDir(false); }
function cbDirAvisar(i, ev) { const d = cb.dir; if (!d.on || d.pausa) return; d.cola.push({ i, txt: ev.txt, sub: ev.sub, reserva: cb.N[i]?.tipo === 'Reserva' && ev.nueva }); d.cola = d.cola.slice(-3); }

function cbDirCaption(k, t, s) {
  const cap = document.getElementById('cb-cine-cap'); if (!cap) return;
  if (k == null) { cap.classList.remove('on'); return; }
  document.getElementById('cb-cine-k').textContent = k; document.getElementById('cb-cine-t').textContent = t || ''; document.getElementById('cb-cine-s').textContent = s || '';
  cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on');
}
function cbDirBarra() {
  const d = cb.dir, el = document.getElementById('cb-dir'); if (!el) return;
  const pausa = d.pausa && d.pausa > performance.now();
  document.getElementById('cb-dir-rec').classList.toggle('p', !!pausa);
  document.getElementById('cb-dir-esc').textContent = pausa ? 'En pausa · retoma en ' + Math.ceil((d.pausa - performance.now()) / 1000) + ' s' : CB_ESC[d.esc][0] + (d.region && ['region', 'estrella', 'detalle'].includes(d.esc) ? ' · ' + CB_REG[CB_RI[d.region]].n : '');
  document.getElementById('cb-dir-cnt').textContent = 'vuelta ' + Math.max(1, d.ciclo);
  document.getElementById('cb-dir-b').textContent = pausa ? 'Retomar ahora' : 'Tomar control';
}

function cbDirPaso(dt) {
  const d = cb.dir;
  if ((d.reloj += dt) > 1) { d.reloj = 0; if (cb.cine) cbCinePaso(); if (d.on) cbDirBarra(); }
  if (!d.on || cb.comparar || cb.replay) return;
  if (d.pausa) { if (performance.now() < d.pausa) return; d.pausa = 0; cbDirEscena('vuelta'); return; }
  d.t += dt;
  const pg = document.getElementById('cb-dir-pg'); if (pg) pg.style.width = Math.min(100, d.t / d.dur * 100) + '%';
  if (d.cola.length && d.esc !== 'ahora' && d.t > 1.2) { cbDirEscena('ahora'); return; }
  if (d.t < d.dur) return;
  const sig = { general: 'vuelo', vuelo: 'estrella', viaje: 'vuelo', region: 'estrella', estrella: 'detalle', insight: 'vuelo', vuelta: 'vuelo' }[d.esc] || cbDirTras();
  cbDirEscena(sig);
}

/* Después de contar una estrella: cada tanto una vista general, un viaje por un brazo o algo que notó */
function cbDirTras() {
  const d = cb.dir; d.n = (d.n || 0) + 1;
  if (d.n % 7 === 0 && (cb.ins || []).length) return 'insight';
  if (d.n % 5 === 0) return 'general';
  if (d.n % 3 === 0) return 'viaje';
  return 'vuelo';
}
/* Próxima estrella: primero TODOS los movimientos reales recientes (de cualquier módulo,
   del más nuevo al más viejo, sin repetir región dos veces seguidas); si no queda ninguno
   sin ver, una estrella al azar de cualquier parte de la galaxia. */
function cbDirSiguiente() {
  if (cb.focoSuave) cbHistoriaCortar();
  const d = cb.dir, ahora = Date.now(), al = cb.geo.attributes.alpha.array, vistos = new Set(d.vistos);
  // 1) el día de hoy, en orden: de la mañana a ahora
  const hoy = (cb.hoyL || []).filter(n => al[n.i] > .5 && !vistos.has(n.k));
  if (hoy.length) { const pri = !d.diaIni; d.diaIni = true; return { n: hoy[0], motivo: 'hoy', primero: pri, quedan: hoy.length - 1 }; }
  if (d.diaIni && !d.diaFin) { d.diaFin = true; d.avisoFin = true; }
  const recientes = cb.N.filter(n => !n.fijo && al[n.i] > .5 && n.ts && ahora - n.ts < 72 * 36e5 && !vistos.has(n.k)).sort((a, b) => b.ts - a.ts);
  if (recientes.length) {   // ronda por módulos: así se ven todos los movimientos, no solo los del módulo más activo
    const porReg = {}; recientes.forEach(n => (porReg[n.reg] = porReg[n.reg] || []).push(n));
    for (let k = 0; k < CB_RONDA.length; k++) { d.rr = ((d.rr ?? -1) + 1) % CB_RONDA.length; const l = porReg[CB_RONDA[d.rr]]; if (l && l.length) return { n: l[0], motivo: 'nuevo' }; }
  }
  const regs = [...new Set(cb.N.filter(n => al[n.i] > .5).map(n => n.reg))].filter(r => r !== d.ultReg);
  const reg = regs[Math.floor(Math.random() * regs.length)] || d.ultReg;
  const pool = cb.N.filter(n => n.reg === reg && al[n.i] > .5 && !vistos.has(n.k)); if (!pool.length) return null;
  const conHist = pool.filter(n => (cb.vec[n.i] || []).length > 1), lista = conHist.length && Math.random() < .7 ? conHist : pool;
  return { n: lista[Math.floor(Math.random() * lista.length)], motivo: 'azar' };
}
/* Qué tan "contable" es una estrella para el recorrido */
function _cbInteres(n, ahora) {
  const dias = n.ts ? (ahora - n.ts) / 864e5 : 60, r = n.raw || {};
  let s = Math.exp(-dias / 6) * 3 + Math.random() * .6;
  if (n.tipo === 'Reserva') s += 4;
  if (n.k.startsWith('cot:')) s += Math.min(4, (r.vistas || 0) * 1.1) * (ahora - (r.ultimaVista || 0) < 864e5 ? 1.5 : .5) - (n.estado === 'vencido' ? 2 : 0);
  if (n.k.startsWith('comp:') && n.estado === 'Pendiente' && n.fecha && n.fecha <= new Date().toISOString().slice(0, 10)) s += 3.5;
  if (n.k.startsWith('vis:') && n.estado === 'pendiente') s += 1.5;
  if (n.monto) s += Math.log10(1 + n.monto) * .25;
  if (n.fijo) s = (n.estado === 'Disponible' ? 1.2 : .2) + Math.random();
  if (cb.dir.vistos.includes(n.k)) s -= 6;
  return s;
}
function cbDirEscena(nombre) {
  const d = cb.dir, ahora = Date.now(), al = cb.geo?.attributes.alpha.array; if (!al) return;
  d.esc = nombre; d.t = 0; d.dur = CB_ESC[nombre][1];
  const v = CB_VISTA(), vis = n => al[n.i] > .5;
  document.getElementById('cb-io')?.classList.remove('on');
  if (nombre === 'general') {
    d.ciclo++; cbSeleccionar(null); cb.orb.auto = true;
    cbVolarA([0, 0, 0], v.rad, 2.4, v.ph + Math.sin(d.ciclo) * .12);
    const hoy = cb.hoyL || [];
    cbDirLimpiar();
    const nr = hoy.filter(n => n.tipo === 'Reserva').length, nc = hoy.filter(n => n.reg === 'cotizaciones').length, nk = hoy.filter(n => n.reg === 'cartera').length;
    cbDirCaption('Andrómeda · Urubó Village', `+${hoy.length.toLocaleString('es-BO')} estrellas hoy`, '');
    void nr; void nc; void nk; if (d.ciclo === 1 || d.ciclo % 2 === 0) d.dur = Math.max(d.dur, cbNarrar(cbCronicaTexto()) + .5);
  } else if (nombre === 'vuelo') {
    cbHistoriaCortar();
    const s = cbDirSiguiente(); if (!s) { d.vistos = []; cbDirEscena('general'); return; }
    const n = s.n; d.foco = n.i; d.region = n.reg; d.ultReg = n.reg; d.vistos.push(n.k); d.vistos = d.vistos.slice(-150);
    cbSeleccionar(null); cbDirLimpiar();
    d.dur = cbSalto(n.i, innerWidth < 700 ? 1.6 : 1.2) + .2;
    const rg = CB_REG[CB_RI[n.reg]];
    const hh = _cbHora(n.ts);
    cbDirCaption(s.motivo === 'hoy' ? `Hoy${hh ? ' · ' + hh : ''} · ${s.quedan ? 'quedan ' + s.quedan : 'último del día'}` : s.motivo === 'nuevo' ? 'Rumbo a un movimiento · hace ' + _cbHace(n.ts) : 'Explorando la galaxia', rg.z + ' · ' + rg.n, '');
    if (s.motivo === 'hoy' && s.primero) { const tot = (cb.hoyL || []).length; cbNarrar(`Este es tu día: ${tot} ${tot === 1 ? 'movimiento' : 'movimientos'} hasta ahora. Empecemos por ${hh && +hh.slice(0, 2) < 12 ? 'la mañana' : 'el primero'}.`); }
    else if (s.motivo === 'hoy') cbNarrar(hh ? hh : '');
    else if (d.avisoFin) { d.avisoFin = false; cbNarrar('Eso es todo lo que pasó hoy hasta ahora. Ahora te muestro lo de los últimos días.'); }
    else cbNarrar(s.motivo === 'nuevo' ? `${n.tipo} en ${rg.n}, hace ${_cbHace(n.ts)}.` : `Sin movimientos nuevos. Exploremos ${rg.n}.`);
  } else if (nombre === 'viaje') {
    const rid = ['cotizaciones', 'cartera', 'callcenter', 'marketing', 'cartera2'][(d.viajes = (d.viajes || 0) + 1) % 5];
    d.region = CB_BRAZO[rid][3];
    cbSeleccionar(null); cbRuta(rid, d.dur - .4); cb.ruta.desde = cb.cam.position.clone();
    const rg = CB_REG[CB_RI[d.region]]; cbDirCaption('Viaje por un brazo', rg.n, 'Pasando por…'); cbNarrar(`Viajamos por el brazo de ${rg.n}: desde el núcleo, lo más antiguo, hasta la punta, donde nace lo nuevo.`);
  } else if (nombre === 'region') {
    let cands = [];
    for (let k = 0; k < CB_RONDA.length && !cands.length; k++) {
      d.ri = (d.ri + 1) % CB_RONDA.length; const rid = CB_RONDA[d.ri];
      cands = cb.N.filter(n => n.reg === rid && vis(n) && (n.fijo || ahora - n.ts < 30 * 864e5));
      if (cands.length) d.region = rid;
    }
    if (!cands.length) { cbDirEscena('insight'); return; }
    d.cands = cands;
    const c = cands.reduce((s, n) => s.map((x, q) => x + n.pos[q] / cands.length), [0, 0, 0]);
    cbVolarA(c, d.region === 'ventas' || d.region === 'expensas' ? 2.2 : 3.4, 2.8, 1.0); cb.orb.auto = true;
    const rg = CB_REG[CB_RI[d.region]];
    cbDirCaption(rg.z, rg.n, d.region === 'inventario' ? `${cands.filter(n => n.estado === 'Disponible').length} terrenos disponibles de ${cands.length}` : `${cands.length.toLocaleString('es-BO')} estrellas en los últimos 30 días`);
  } else if (nombre === 'estrella') {
    const best = cb.N[d.foco]; if (!best) { cbDirEscena('vuelo'); return; }
    cb.orb.auto = true; cbDirCaption(null); cbLente(innerWidth < 700 ? 40 : 31, 2);
    const hh = best.ts >= _cbHoy0() ? _cbHora(best.ts) : '';
    cbMira(best.i, (hh ? hh + ' · ' : '') + CB_REG[CB_RI[best.reg]].n + ' · ' + best.tipo, best.cliente || best.titulo, [best.asesor, best.ts ? (best.ts >= _cbHoy0() ? 'hoy' : 'hace ' + _cbHace(best.ts)) : best.estado].filter(Boolean).join(' · '), cbDatosDe(best));
    if (cb.sonido) cbSonar(CB_RI[best.reg]);
  } else if (nombre === 'detalle') {
    if (d.foco == null || !cb.N[d.foco]) { cbDirEscena('vuelta'); return; }
    cb.orb.auto = true; cbDirCaption(null);
    d.dur = Math.min(30, cbDiaViaje(d.foco));
  } else if (nombre === 'vuelta') {
    cbSeleccionar(null); cbDirCaption(null); cbDirLimpiar(); cb.orb.auto = true;
    cbVolarA([0, 0, 0], v.rad * .9, 2.4, v.ph);
  } else if (nombre === 'insight') {
    d.ultIns = d.ciclo; cbSeleccionar(null); cbDirLimpiar();
    const pr = { al: 5, cal: 4, rec: 3, pat: 2, dor: 1, top: 1 }, ins = (cb.ins || []).slice().sort((a, b) => (pr[b.t] || 0) - (pr[a.t] || 0));
    if (!ins.length) { cbDirEscena('general'); return; }
    const x = ins[d.insI++ % ins.length];
    document.getElementById('cb-io-t').textContent = x.k; document.getElementById('cb-io-t').className = 'ty ' + x.t;
    document.getElementById('cb-io-m').textContent = x.m; document.getElementById('cb-io-s').textContent = x.s || '';
    document.getElementById('cb-io').classList.add('on'); cbDirCaption(null); d.dur = Math.max(d.dur, cbNarrar(x.m + (x.s ? ' ' + x.s : '')) + 1.5);
    const idx = (x.idx || []).filter(i => cb.N[i]).slice(0, 25);
    if (idx.length) { const c = idx.reduce((s, i) => s.map((q, k) => q + cb.N[i].pos[k] / idx.length), [0, 0, 0]); cbVolarA(c, idx.length === 1 ? 1.4 : 3, 2.4); idx.slice(0, 8).forEach((i, k) => setTimeout(() => cb.N[i] && cbPulso([0, 0, 0], cb.N[i].pos, '#E0B865', 1.4), k * 220)); }
    else cbVolarA([0, 0, 0], v.rad * .85, 2.2, v.ph);
    cb.orb.auto = true;
  } else if (nombre === 'ahora') {
    const ev = d.cola.shift(); if (!ev || !cb.N[ev.i]) { cbDirEscena('vuelta'); return; }
    cbDirLimpiar(); d.foco = ev.i; const m = cb.N[ev.i]; d.vistos.push(m.k); d.ultReg = m.reg;
    const vt = cbSalto(ev.i, 1.2, 3); cbDirCaption(ev.reserva ? 'Nueva reserva' : 'Ahora mismo', ev.txt, ''); cbNarrar(ev.reserva ? '¡Nueva reserva!' : 'Algo acaba de pasar.');
    setTimeout(() => { if (cb.dir.esc !== 'ahora' || !cb.N[ev.i]) return; cbDirCaption(null); cbLente(innerWidth < 700 ? 40 : 32, 1.5); cbMira(ev.i, ev.reserva ? 'Nueva reserva' : 'Ahora mismo', m.cliente || ev.txt, ev.txt, cbDatosDe(m)); cbNarrar(cbLineaHoy(m, false)); cbHoyFlash(m); }, vt * 1000 + 100);
    d.dur = vt + 7;
  }
  cbDirBarra();
}

/* ── 12 · Efectos con duración: supernova (reserva nueva) ─────────────── */
function cbAnim(dur, fn, fin) { cb.anims.push({ t: 0, dur, fn, fin }); }
function cbAnimsPaso(dt) {
  if (!cb.anims.length) return;
  cb.anims = cb.anims.filter(a => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k); if (k >= 1) { a.fin && a.fin(); return false; } return true; });
}
function cbSupernova(pos, color) {
  const T = cb.T, flash = cbGlow(pos, '#FFF8E6', .2, 1), aura = cbGlow(pos, color, .4, .9), nucleo = cbGlow([0, 0, 0], '#FFD9A0', 1.2, .0);
  const ring = new T.Mesh(new T.RingGeometry(.3, .318, 64), new T.MeshBasicMaterial({ color: new T.Color(color), transparent: true, opacity: .9, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  ring.position.set(...pos); [flash, aura, ring, nucleo].forEach(o => { o.userData.nb = 1; cb.fx.add(o); });
  cbAnim(2.8, k => {
    const e = 1 - (1 - k) ** 3; flash.scale.setScalar(.2 + e * 1.4); flash.material.opacity = (1 - k) ** 2;
    aura.scale.setScalar(.4 + e * 2.2); aura.material.opacity = .9 * (1 - k);
    ring.scale.setScalar(.2 + e * 7); ring.material.opacity = .9 * (1 - k); ring.lookAt(cb.cam.position);
    nucleo.scale.setScalar(1.2 + e * 2.4); nucleo.material.opacity = .55 * Math.sin(k * Math.PI);
  }, () => { [flash, aura, ring, nucleo].forEach(o => cb.fx.remove(o)); ring.geometry.dispose(); });
  if (cb.sonido) { cbSonar(0); setTimeout(() => cbSonar(2), 140); setTimeout(() => cbSonar(6), 280); }
}



/* ── 14 · Espectáculo: corrientes, brillo, estrellas fugaces, intro, viaje y música ── */

/* Corrientes: partículas que fluyen por cada brazo hacia el núcleo (el embudo cae
   hacia las ventas). La velocidad de cada brazo sale de su actividad de los últimos 7 días. */
function cbFlujoIniciar() {
  const T = cb.T, R = _cbRnd(77), arm = [], seed = [], perp = [], yy = [], lag = [];
  const por = CB_MOVIL ? 140 : 260, cola = 4;
  for (let k = 0; k < 4; k++) {
    const n = k === 3 ? (CB_MOVIL ? 160 : 320) : k === 2 ? por * .6 : por;
    for (let i = 0; i < n; i++) { const s = R(), pp = _cbGauss(R), y = _cbGauss(R);
      for (let j = 0; j < (k === 3 ? 1 : cola); j++) { arm.push(k); seed.push(s); perp.push(pp); yy.push(y); lag.push(j); } }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(new Array(arm.length * 3).fill(0), 3));
  [['arm', arm], ['seed', seed], ['perp', perp], ['yy', yy], ['lag', lag]].forEach(([k, a]) => g.setAttribute(k, new T.Float32BufferAttribute(a, 1)));
  const col = k => new T.Color(CB_REG[CB_RI[['cotizaciones', 'callcenter', 'marketing', 'ventas'][k]]].c).lerp(new T.Color('#FFF6E8'), .35);
  cb.flujo = new T.Points(g, new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPx: { value: cb.pr }, uVel: { value: new T.Vector4(1, 1, .6, 1) }, uC0: { value: col(0) }, uC1: { value: col(1) }, uC2: { value: col(2) }, uC3: { value: new T.Color('#FFE2AE') } },
    vertexShader: `attribute float arm; attribute float seed; attribute float perp; attribute float yy; attribute float lag;
      uniform float uT; uniform float uPx; uniform vec4 uVel; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
      varying vec3 vC; varying float vA;
      void main(){
        vec3 p; float a;
        if (arm < 2.5) {
          float vel = arm < .5 ? uVel.x : arm < 1.5 ? uVel.y : uVel.z;
          float off = arm < .5 ? 0. : arm < 1.5 ? 3.14159 : .7854;
          float rOut = arm < 1.5 ? 3.3 : 2.1; float tight = arm < 1.5 ? 1.75 : 2.1;
          float s = fract(seed + uT * .016 * vel) - lag * .0045;
          float r = mix(rOut, .22, clamp(s, 0., 1.)); float rr = max(r, .78);
          float th = off + log(rr / .78) * tight + (r < .78 ? (.78 - r) * 2.6 : 0.);
          float pp = perp * (.04 + r * .035);
          p = vec3(cos(th) * r - sin(th) * pp, yy * .025, sin(th) * r + cos(th) * pp);
          a = smoothstep(0., .07, s) * (1. - smoothstep(.86, 1., s)) * (1. - lag * .22);
          vC = arm < .5 ? uC0 : arm < 1.5 ? uC1 : uC2;
        } else {
          float r = .12 + seed * .55; float th = seed * 40. + uT * (.55 / (r + .15)) * uVel.w;
          p = vec3(cos(th) * r * 1.25, yy * .035, sin(th) * r); a = .55; vC = uC3;
        }
        vA = a;
        vec4 mv = modelViewMatrix * vec4(p, 1.); float d = max(-mv.z, .05);
        gl_PointSize = min((2.1 - lag * .35) * uPx * (d > 3. ? 8.5 / d : 2.833 * pow(3. / d, .5)), 28.);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); if(d>.5||vA<.01) discard; gl_FragColor=vec4(vC*1.2, pow(1.-d*2.,1.6)*vA*.9); }` }));
  cb.flujo.frustumCulled = false; cb.g.add(cb.flujo);
}
function cbFlujoVelocidad() {
  if (!cb.flujo) return; const d7 = Date.now() - 7 * 864e5, n = r => cb.N.filter(x => x.reg === r && x.ts > d7).length;
  const v = c => .45 + 2.4 * Math.min(1, c / 60);
  cb.flujo.material.uniforms.uVel.value.set(v(n('cotizaciones')), v(n('callcenter')), v(n('marketing') * 4), .7 + 1.6 * Math.min(1, n('ventas') / 50));
}

/* Brillo cinematográfico (bloom propio, liviano): se apaga solo si la compu no da */
function cbBloomIniciar() {
  const T = cb.T, rt = d => new T.WebGLRenderTarget(4, 4, { depthBuffer: d, magFilter: T.LinearFilter, minFilter: T.LinearFilter });
  const vs = 'varying vec2 vU; void main(){ vU=uv; gl_Position=vec4(position.xy,0.,1.); }';
  const m = (fs, u) => new T.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const bl = cb.bl = { main: rt(true), a: rt(false), b: rt(false), cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), esc: new T.Scene(), q: new T.Mesh(new T.PlaneGeometry(2, 2)) };
  bl.esc.add(bl.q);
  bl.brillo = m(`uniform sampler2D t; uniform vec2 px; varying vec2 vU; void main(){ vec3 c=(texture2D(t,vU+px*vec2(-1.,-1.)).rgb+texture2D(t,vU+px*vec2(1.,-1.)).rgb+texture2D(t,vU+px*vec2(-1.,1.)).rgb+texture2D(t,vU+px*vec2(1.,1.)).rgb)*.25;
    float l=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c*smoothstep(.3,.9,l),1.); }`, { t: { value: null }, px: { value: new T.Vector2() } });
  bl.blur = m(`uniform sampler2D t; uniform vec2 dir; varying vec2 vU; void main(){ vec3 c=texture2D(t,vU).rgb*.2270;
    c+=(texture2D(t,vU+dir*1.3846).rgb+texture2D(t,vU-dir*1.3846).rgb)*.3162; c+=(texture2D(t,vU+dir*3.2308).rgb+texture2D(t,vU-dir*3.2308).rgb)*.0703; gl_FragColor=vec4(c,1.); }`, { t: { value: null }, dir: { value: new T.Vector2() } });
  bl.comp = m(`uniform sampler2D t; uniform sampler2D b; uniform float k; varying vec2 vU; void main(){ vec3 c=texture2D(t,vU).rgb+texture2D(b,vU).rgb*k; gl_FragColor=vec4(c,1.); }`, { t: { value: null }, b: { value: null }, k: { value: .95 } });
  cbBloomTam();
  cb.bloomOn = !CB_MOVIL;
}
function cbBloomTam() {
  const bl = cb.bl; if (!bl || !cb.r) return; const v = cb.r.getDrawingBufferSize(new cb.T.Vector2());
  bl.main.setSize(v.x, v.y); bl.a.setSize(Math.max(4, v.x >> 2), Math.max(4, v.y >> 2)); bl.b.setSize(Math.max(4, v.x >> 2), Math.max(4, v.y >> 2));
  bl.w = v.x; bl.h = v.y;
}
function cbBloomRender() {
  const r = cb.r, bl = cb.bl, q = bl.q, pase = (mat, dst) => { q.material = mat; r.setRenderTarget(dst); r.render(bl.esc, bl.cam); };
  r.setRenderTarget(bl.main); r.render(cb.scene, cb.cam);
  bl.brillo.uniforms.t.value = bl.main.texture; bl.brillo.uniforms.px.value.set(1.5 / bl.w, 1.5 / bl.h); pase(bl.brillo, bl.a);
  const qw = 1 / bl.a.width, qh = 1 / bl.a.height;
  [1, 2.2].forEach(s => { bl.blur.uniforms.t.value = bl.a.texture; bl.blur.uniforms.dir.value.set(qw * s, 0); pase(bl.blur, bl.b); bl.blur.uniforms.t.value = bl.b.texture; bl.blur.uniforms.dir.value.set(0, qh * s); pase(bl.blur, bl.a); });
  bl.comp.uniforms.t.value = bl.main.texture; bl.comp.uniforms.b.value = bl.a.texture; pase(bl.comp, null);
}

/* Estrellas fugaces de fondo */
function cbFugaz() {
  if (!cb.abierto || !cb.T) return;
  const T = cb.T, R = Math.random, a = R() * 6.283, b = .3 + R() * 1.2, rr = 26 + R() * 10;
  const p0 = new T.Vector3(rr * Math.sin(b) * Math.cos(a), rr * Math.cos(b), rr * Math.sin(b) * Math.sin(a));
  const dir = new T.Vector3(R() - .5, -.3 - R() * .4, R() - .5).normalize().multiplyScalar(6 + R() * 5);
  const geo = new T.BufferGeometry().setFromPoints([p0, p0.clone()]);
  const ln = new T.Line(geo, new T.LineBasicMaterial({ color: 0xFFF1D6, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false }));
  cb.scene.add(ln);
  cbAnim(1.1, k => { const pa = geo.attributes.position; const cab = p0.clone().addScaledVector(dir, k), col = p0.clone().addScaledVector(dir, Math.max(0, k - .35));
    pa.setXYZ(0, col.x, col.y, col.z); pa.setXYZ(1, cab.x, cab.y, cab.z); pa.needsUpdate = true; ln.material.opacity = .9 * (1 - k); }, () => { cb.scene.remove(ln); geo.dispose(); });
}

function cbShowIniciar() {
  cbFlujoIniciar(); cbWarpIniciar();
  try { cbBloomIniciar(); } catch (e) { cb.bl = null; cb.bloomOn = false; }
  clearInterval(cb.fugazT); cb.fugazT = setInterval(() => { if (cb.abierto && Math.random() < .6) cbFugaz(); }, 5200);
}

/* Entrada: la cámara llega desde el espacio profundo hasta la galaxia */
function cbIntro() {
  const root = document.getElementById('cb-root'), v = CB_VISTA(), o = cb.orb;
  o.tgt.set(0, 0, 0); o.sigue = null; o.rad = 42; o.ph = .42; o.th = v.th - 1.6;
  o.vuelo = { t: 0, dur: 5.2, t0: o.tgt.clone(), t1: o.tgt.clone(), local: [0, 0, 0], r0: 42, r1: v.rad, th0: o.th, th1: v.th, ph0: .42, ph1: v.ph, ease: 'out' };
  root.classList.add('intro'); const el = document.getElementById('cb-intro'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(cb.introT); cb.introT = setTimeout(() => { root.classList.remove('intro'); el.classList.remove('on'); }, 4800);
}

/* Viaje por un brazo: la cámara vuela rasante del núcleo a la punta (de lo antiguo a lo nuevo) */
function cbRuta(reg, dur = 12) {
  if (!CB_BRAZO[reg]) return; cb.orb.vuelo = null; cb.orb.sigue = null;
  cb.ruta = { reg, t: 0, dur, k: 0 };
}
function cbRutaPaso(dt) {
  const R = cb.ruta, [off, rOut, tight] = CB_BRAZO[R.reg], T = cb.T;
  R.t = Math.min(1, R.t + dt / R.dur); const s = R.t < .5 ? 2 * R.t * R.t : 1 - (-2 * R.t + 2) ** 2 / 2;
  const r = .55 + s * (rOut + .15 - .55);
  const pc = _cbBrazo(off, r, -.32, .2 + .12 * Math.sin(s * Math.PI), tight), pm = _cbBrazo(off, Math.min(rOut + .5, r + .75), .05, 0, tight);
  R.cam = new T.Vector3(...pc).applyMatrix4(cb.g.matrixWorld); R.mira = new T.Vector3(...pm).applyMatrix4(cb.g.matrixWorld); R.miraL = pm;
  if (R.t < .16 && R.desde) { const k = R.t / .16, e = k * k * (3 - 2 * k); R.cam.lerpVectors(R.desde, R.cam, e); R.mira.lerpVectors(cb.orb.tgt, R.mira, e); }
  cb.cam.position.copy(R.cam); cb.cam.lookAt(R.mira); cb.orb.rad = 1.3;
  if ((R.k -= dt) <= 0) { R.k = .6; const f = (r - CB_GX.armIn - .05) / (rOut - CB_GX.armIn - .05);
    const txt = f >= 1 ? 'Ahora' : f > .2 ? new Date(Date.now() + 110 * Math.log(f) * 864e5).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' }) : 'Lo más antiguo';
    const el = document.getElementById('cb-cine-s'); if (el && cb.dir?.esc === 'viaje') el.textContent = 'Pasando por: ' + txt; }
  if (R.t >= 1) cbRutaFin();
}
function cbRutaFin() {
  const R = cb.ruta; if (!R) return; cb.ruta = null; if (!R.cam) return;
  const o = cb.orb, d = R.cam.clone().sub(R.mira); o.tgt.copy(R.mira); o.rad = d.length(); o.ph = Math.acos(Math.max(-1, Math.min(1, d.y / o.rad))); o.th = Math.atan2(d.z, d.x); o.sigue = R.miraL;
}

/* HUD en calma: con el recorrido andando y el mouse quieto, los paneles se esfuman para ver la galaxia */
(function () {
  let t = null;
  const despertar = () => { const root = document.getElementById('cb-root'); if (!root) return; root.classList.remove('calma'); clearTimeout(t); t = setTimeout(() => { if (cb.abierto && cb.dir?.on && !cb.sel) root.classList.add('calma'); }, 6000); };
  ['mousemove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => cb.abierto && despertar(), { passive: true }));
  window.cbCalmaDespertar = despertar;
})();

/* ── 16 · Viaje espacial entre estrellas ──────────────────────────────────
   La cámara despega, sube en arco por encima de la galaxia con estelas de
   velocidad (salto) y baja en picada sobre la estrella elegida.          */
function cbWarpIniciar() {
  const T = cb.T, n = CB_MOVIL ? 120 : 260, P = new Float32Array(n * 6), C = new Float32Array(n * 6), R = Math.random;
  cb.warpD = [];
  for (let i = 0; i < n; i++) { const a = R() * 6.283, r = .6 + R() * 5, z = -2 - R() * 34, l = 1.2 + R() * 2.4; cb.warpD.push([Math.cos(a) * r, Math.sin(a) * r * .7, z, l]);
    const k = .5 + R() * .5, warm = R() < .5; C.set([k, k * (warm ? .86 : .92), k * (warm ? .62 : 1), k * .1, k * .1, k * .1], i * 6); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('color', new T.BufferAttribute(C, 3));
  cb.warp = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  cb.warp.frustumCulled = false; cb.cam.add(cb.warp); cb.scene.add(cb.cam);
}
function cbWarpPaso(dt, w) {
  if (!cb.warp) return; cb.warp.visible = w > .02; if (!cb.warp.visible) return;
  const pa = cb.warp.geometry.attributes.position, v = 18 + 60 * w;
  cb.warpD.forEach((d, i) => { d[2] += v * dt; if (d[2] > -1) d[2] -= 34; const l = d[3] * (.4 + 2.6 * w); pa.setXYZ(i * 2, d[0], d[1], d[2]); pa.setXYZ(i * 2 + 1, d[0], d[1], d[2] - l); });
  pa.needsUpdate = true; cb.warp.material.opacity = Math.min(.85, w * 1.1);
}
function cbSalto(i, rad = 1.2, dur) {
  const n = typeof i === 'number' ? cb.N[i] : null, p = n ? n.pos : i; if (!p || !cb.cam) return 0;
  if (cb.ruta) cbRutaFin(); cb.orb.vuelo = null; cb.orb.sigue = null;
  const T = cb.T, P0 = cb.cam.position.clone(), L0 = cb.orb.tgt.clone(), T1 = new T.Vector3(...p).applyMatrix4(cb.g.matrixWorld);
  const dist = P0.distanceTo(T1); dur = dur || Math.max(3.2, Math.min(5.5, 2.4 + dist * .38));
  cb.salto = { local: p.slice(), P0, L0, t: 0, dur, rad, alto: 1.6 + dist * .32, th: Math.atan2(T1.z, T1.x) + .55 + (Math.random() - .5) * .6, ph: .95 + Math.random() * .25, fov0: cb.cam.fov };
  if (cb.sonido) { try { const ac = cb.ac = cb.ac || new (window.AudioContext || window.webkitAudioContext)(), t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(240, t + dur * .5); o.frequency.exponentialRampToValueAtTime(55, t + dur);
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.025, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + .1); } catch (e) {} }
  return dur;
}
function cbSaltoPaso(dt) {
  const S = cb.salto, T = cb.T; S.t = Math.min(1, S.t + dt / S.dur);
  const e = S.t < .5 ? 4 * S.t ** 3 : 1 - (-2 * S.t + 2) ** 3 / 2;
  const T1 = new T.Vector3(...S.local).applyMatrix4(cb.g.matrixWorld);
  const P2 = new T.Vector3(T1.x + S.rad * Math.sin(S.ph) * Math.cos(S.th), T1.y + S.rad * Math.cos(S.ph), T1.z + S.rad * Math.sin(S.ph) * Math.sin(S.th));
  const M = S.P0.clone().add(P2).multiplyScalar(.5); M.y += S.alto; M.multiplyScalar(1.12);
  const u = 1 - e, pos = S.P0.clone().multiplyScalar(u * u).add(M.clone().multiplyScalar(2 * u * e)).add(P2.clone().multiplyScalar(e * e));
  const lk = Math.min(1, Math.max(0, (S.t - .12) / .55)), le = lk * lk * (3 - 2 * lk);
  const mira = S.L0.clone().lerp(T1, le);
  cb.cam.position.copy(pos); cb.cam.lookAt(mira);
  const w = Math.sin(Math.PI * S.t) ** 2; S.w = w;
  cb.cam.fov = S.fov0 + 14 * w; cb.cam.updateProjectionMatrix();
  cbWarpPaso(dt, w);
  if (S.t >= 1) cbSaltoFin();
}
function cbSaltoFin() {
  const S = cb.salto; if (!S) return; cb.salto = null; cbWarpPaso(0, 0);
  cb.cam.fov = S.fov0; cb.cam.updateProjectionMatrix();
  const o = cb.orb; o.tgt.copy(new cb.T.Vector3(...S.local).applyMatrix4(cb.g.matrixWorld)); const d = cb.cam.position.clone().sub(o.tgt);
  o.rad = d.length(); o.ph = Math.acos(Math.max(-1, Math.min(1, d.y / o.rad))); o.th = Math.atan2(d.z, d.x); o.sigue = S.local; o.auto = true;
}


/* ── 15 · Experiencia inmersiva ───────────────────────────────────────────
   En el recorrido automático no hay paneles ni nombres sueltos: la cámara
   llega a UNA estrella, la mira la encierra, su nombre se "decodifica",
   alrededor orbitan sus datos y una voz (opcional) cuenta su historia
   mientras la cámara salta por cada paso del cliente.                    */

/* Mira holográfica sobre la estrella enfocada */
function cbMira(i, k, t, s, datos) {
  const el = document.getElementById('cb-mira'); if (!el) return;
  cb.miraI = i;
  if (i == null || !cb.N[i]) { el.classList.remove('on'); return; }
  const n = cb.N[i], col = CB_REG[CB_RI[n.reg]].c;
  el.style.setProperty('--c', col);
  document.getElementById('cb-mira-k').textContent = k || '';
  cbDecodificar(document.getElementById('cb-mira-t'), t || n.cliente || n.titulo || '');
  document.getElementById('cb-mira-s').textContent = s || '';
  const sat = document.getElementById('cb-mira-sat');
  sat.innerHTML = (datos || []).slice(0, 4).map((d, j) => `<div class="st" style="--j:${j}"><span>${_cbEsc(d[0])}</span><b>${_cbEsc(d[1])}</b></div>`).join('');
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function cbMiraPaso() {
  const el = document.getElementById('cb-mira'); if (!el || cb.miraI == null) return;
  const n = cb.N[cb.miraI]; if (!n) return;
  const [x, y, z] = cbProy(n.pos);
  el.style.transform = `translate(${x}px,${y}px)`; el.style.visibility = z > 1 ? 'hidden' : '';
  const izq = innerWidth > 900 && x > innerWidth - 430; if (izq !== el._izq) { el._izq = izq; el.classList.toggle('izq', izq); }
}
/* Efecto de texto que se decodifica letra por letra */
function cbDecodificar(el, txt) {
  if (!el) return; clearInterval(el._t); const abc = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789·/';
  let k = 0; const tot = txt.length;
  el._t = setInterval(() => { k += Math.max(1, tot / 18);
    el.textContent = txt.split('').map((ch, j) => j < k || ch === ' ' ? ch : abc[Math.floor(Math.random() * abc.length)]).join('');
    if (k >= tot) { clearInterval(el._t); el.textContent = txt; } }, 38);
}
/* Datos que orbitan la mira según el tipo de estrella */
function cbDatosDe(n) {
  const r = n.raw || {}, out = [];
  if (n.k.startsWith('cot:')) { if (r.precioFinal) out.push(['Precio final', _cbUsd(r.precioFinal) + (r.nroCuotas && r.modalidad !== 'Contado' ? ' · ' + r.nroCuotas + ' cuotas' : '')]); if (n.terreno) out.push(['Terreno', n.terreno]); out.push(['Temperatura', cbTemperatura(r).t + (r.vistas ? ' · ' + r.vistas + ' vistas' : '')]); }
  else { if (n.monto) out.push([n.reg === 'expensas' ? 'Monto' : 'Monto', n.reg === 'expensas' ? 'Bs ' + Math.round(n.monto).toLocaleString('es-BO') : _cbUsd(n.monto)]); if (n.terreno) out.push(['Terreno', n.terreno]); if (n.estado) out.push(['Estado', n.estado]); }
  if (n.asesor) out.push(['Asesor', n.asesor]);
  if (n.ts) out.push(['Fecha', _cbFecha(n.ts)]);
  return out.slice(0, 4);
}

/* Subtítulos que se escriben solos y, si querés, voz */
function cbNarrar(txt) {
  const el = document.getElementById('cb-sub'); if (!el) return 2;
  clearInterval(el._t); txt = txt || '';
  if (!txt) { el.classList.remove('on'); if (window.speechSynthesis) speechSynthesis.cancel(); return 0; }
  el.classList.add('on'); el.textContent = ''; let k = 0;
  el._t = setInterval(() => { k += 2; el.textContent = txt.slice(0, k); if (k >= txt.length) clearInterval(el._t); }, 28);
  if (cb.voz && window.speechSynthesis) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt.replace(/·/g, ',').replace(/\$/g, '').replace(/US?D/g, 'dólares'));
      const vs = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang)); u.voice = vs.find(v => /es-(MX|US|419)/i.test(v.lang)) || vs.find(v => /google/i.test(v.name)) || vs[0] || null;
      u.lang = u.voice?.lang || 'es-ES'; u.rate = 1.03; u.pitch = .95; u.volume = .9; u.onstart = () => cbMusicaDuck?.(true); u.onend = u.onerror = () => cbMusicaDuck?.(false); speechSynthesis.speak(u); } catch (e) {}
  }
  return Math.max(2.4, txt.length / (cb.voz ? 13 : 17) + 1.2);
}
function cbVoz() {
  cb.voz = !cb.voz; cbGuardarL('uv-andromeda-voz', cb.voz ? '1' : '0');
  document.getElementById('cb-b-voz')?.classList.toggle('on', cb.voz);
  if (!cb.voz && window.speechSynthesis) speechSynthesis.cancel();
  else cbNarrar('Hola. Soy Andrómeda. Te voy a contar lo que pasa en el área comercial.');
}

/* La historia de una estrella, contada en frases cortas */
const _cbDia = ts => new Date(ts).toLocaleDateString('es-BO', { day: 'numeric', month: 'long' });
function cbLineaParada(m) {
  const r = m.raw || {}, f = m.ts ? _cbDia(m.ts) : '';
  if (m.k.startsWith('reg:')) return m.tipo === 'Reserva' ? `${f}: reservó ${m.terreno ? 'el terreno ' + m.terreno : ''}${m.monto ? ' por ' + _cbUsd(m.monto) : ''}.` : `${f}: visitó el proyecto${m.asesor ? ' con ' + m.asesor : ''}${m.terreno ? ', interesado en el ' + m.terreno : ''}.`;
  if (m.k.startsWith('cot:')) return r.tipo === 'perfil' ? `${f}: le armaron un perfil de búsqueda${r.perfil?.presupuesto ? ' de hasta ' + _cbUsd(r.perfil.presupuesto) : ''}.` : `${f}: recibió la cotización ${r.codigo || ''}${r.precioFinal ? ' por ' + _cbUsd(r.precioFinal) : ''}${r.vistas ? '; la abrió ' + r.vistas + (r.vistas > 1 ? ' veces' : ' vez') : ', todavía sin abrir'}.`;
  if (m.k.startsWith('vis:')) return `${f}: el call center lo asignó a ${m.asesor || 'un asesor'}${m.estado === 'completada' ? ', y ya fue atendido' : m.estado === 'pendiente' ? '; sigue pendiente' : ''}.`;
  if (m.k.startsWith('pag:')) return `${f}: pagó ${_cbUsd(m.monto)}${r.tipoPago ? ' de ' + String(r.tipoPago).toLowerCase() : ''}.`;
  if (m.k.startsWith('comp:')) return `Se comprometió a pagar ${m.monto ? _cbUsd(m.monto) + ' ' : ''}el ${r.fecha ? _cbDia(new Date(r.fecha + 'T12:00').getTime()) : ''}${m.estado === 'Pendiente' ? '' : ' (' + String(m.estado).toLowerCase() + ')'}.`;
  if (m.k.startsWith('gest:')) return `${f}: gestión de cobranza, ${String(r.resultado || 'contacto').toLowerCase()}.`;
  if (m.k.startsWith('exp:')) return `${f}: pagó expensas por Bs ${Math.round(m.monto || 0).toLocaleString('es-BO')}.`;
  if (m.k.startsWith('lead:')) return `${f}: entraron ${r.cantidad || ''} leads de ${m.campania || 'una campaña'}.`;
  if (m.k.startsWith('lote:')) return `El terreno ${m.terreno} figura ${String(m.estado).toLowerCase()} en Orange.`;
  return `${f}: ${m.tipo}.`;
}
function cbRelatoInicio(n) {
  if (n.reg === 'inventario') { const c = (cb.vec[n.i] || []).filter(j => cb.N[j].reg === 'cotizaciones').length; return `Terreno ${n.terreno}. ${n.estado === 'Disponible' ? 'Está disponible' : 'Figura ' + String(n.estado).toLowerCase()}${c ? ' y aparece en ' + c + (c > 1 ? ' cotizaciones.' : ' cotización.') : '.'}`; }
  if (n.reg === 'marketing') return `${n.titulo}.`;
  const h = cbHistoria(n.i, 20).filter(j => !cb.N[j].fijo), pri = h.length ? cb.N[h[0]] : n;
  return `${n.cliente || n.titulo}. ${h.length > 1 ? `Su historia empieza el ${_cbDia(pri.ts)} y suma ${h.length} momentos.` : 'Es su primer paso con nosotros.'}`;
}

/* Recorrido por la historia: la cámara salta de paso en paso del cliente */
function cbHistoriaViaje(i) {
  const n = cb.N[i]; if (!n) return 6;
  const pasos = cbHistoria(i, 7).filter(j => cb.N[j] && (!cb.N[j].fijo || cb.N[j].reg === n.reg)).slice(-6);
  if (!pasos.includes(i)) pasos.push(i);
  cb.focoSuave = new Set(pasos); cbVisibilidad();
  const T0 = cbNarrar(cbRelatoInicio(n));
  let t = T0 * 1000;
  (cb.histT || []).forEach(clearTimeout); cb.histT = [];
  const ir = (j, k) => cb.histT.push(setTimeout(() => {
    if (cb.dir.esc !== 'detalle' || !cb.N[j]) return; const m = cb.N[j];
    cbVolarA(j, .95, 1.5);
    if (k) cbPulso(cb.N[pasos[k - 1]].pos, m.pos, CB_REG[CB_RI[m.reg]].c, 1.4);
    cbMira(j, `${k + 1} de ${pasos.length} · ${m.ts && !m.fijo ? _cbDia(m.ts) : CB_REG[CB_RI[m.reg]].n}`, m.tipo, (m.titulo || '').replace(/^.*· /, ''), cbDatosDe(m));
    cbNarrar(cbLineaParada(m));
    if (cb.sonido) cbSonar(CB_RI[m.reg]);
  }, t));
  pasos.forEach((j, k) => { ir(j, k); t += (Math.max(2.8, cbLineaParada(cb.N[j]).length / (cb.voz ? 13 : 17) + 1.1)) * 1000; });
  cb.histT.push(setTimeout(() => {
    if (cb.dir.esc !== 'detalle' || !cb.N[i]) return;
    cbVolarA(i, 1.05, 1.4); cbMira(i, 'Lo que sigue', n.cliente || n.titulo, n.tipo, cbDatosDe(n));
    cbNarrar('Lo que sigue: ' + (cbSiguientePaso(n) || 'seguir de cerca este caso.').replace(/\.$/, '') + '.');
  }, t));
  return t / 1000 + 5;
}
function cbHistoriaCortar() { (cb.histT || []).forEach(clearTimeout); cb.histT = []; if (cb.focoSuave) { cb.focoSuave = null; cbVisibilidad(); } }

/* Lente: la cámara cierra el ángulo al llegar a una estrella (sensación de zoom de cine) */
function cbLente(fov, dur = 1.8) {
  if (!cb.cam) return; const f0 = cb.cam.fov, base = innerWidth < 700 ? 46 : 38, f1 = fov == null ? base : fov;
  cbAnim(dur, k => { const e = k * k * (3 - 2 * k); cb.cam.fov = f0 + (f1 - f0) * e; cb.cam.updateProjectionMatrix(); });
}

/* Nombre al pasar el mouse (una sola etiqueta, nunca una lluvia de nombres) */
function cbElegirEn(x, y, radio = 16) {
  const al = cb.geo.attributes.alpha.array, v = cb._pv || (cb._pv = new cb.T.Vector3()), m = cb.g.matrixWorld, W = innerWidth, H = innerHeight;
  let best = null, bd = radio * radio;
  for (let i = 0; i < cb.N.length; i++) { if (al[i] < .5) continue; const p = cb.N[i].pos; v.set(p[0], p[1], p[2]).applyMatrix4(m).project(cb.cam); if (v.z > 1) continue;
    const dx = (v.x + 1) / 2 * W - x, dy = (1 - v.y) / 2 * H - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  return best;
}
function cbNombresPaso(dt) {
  const o = cb.orb;
  cb.nmT = (cb.nmT || 0) - dt;
  if (cb.nmT <= 0) { cb.nmT = .3; const z = document.getElementById('cb-zoom'); if (z) z.innerHTML = `<b>${o.rad > 5.5 ? 'Galaxia' : o.rad > 2 ? 'Región' : 'Estrellas'}</b> ×${(CB_VISTA().rad / o.rad).toFixed(1)}`; }
  cbMiraPaso();
  const h = document.getElementById('cb-hov'); if (!h) return;
  if (cb.hov == null || !cb.N[cb.hov] || cb.hov === cb.sel || cb.hov === cb.miraI) { h.style.display = 'none'; return; }
  const n = cb.N[cb.hov], [x, y, z] = cbProy(n.pos); if (z > 1) { h.style.display = 'none'; return; }
  h.style.display = ''; h.style.transform = `translate(${x + 12}px,${y - 12}px)`;
  if (h.dataset.i != cb.hov) { h.dataset.i = cb.hov; h.style.setProperty('--c', CB_REG[CB_RI[n.reg]].c); h.innerHTML = `<i></i><b>${_cbEsc((n.cliente || n.titulo || '').slice(0, 30))}</b><em>${_cbEsc(n.fijo ? n.estado : n.tipo)}${n.ts && !n.fijo ? ' · ' + _cbHace(n.ts) : ''}</em>`; }
}
(function () {
  let ult = 0;
  document.addEventListener('pointermove', e => {
    if (!cb.abierto || !cb.listo || e.target.id !== 'cb-gl' || e.buttons) { if (cb.hov != null && e.target.id !== 'cb-gl') cb.hov = null; return; }
    const t = performance.now(); if (t - ult < 70) return; ult = t;
    cb.hov = cbElegirEn(e.clientX, e.clientY); document.getElementById('cb-gl').style.cursor = cb.hov != null ? 'pointer' : '';
  }, { passive: true });
})();

/* El latido del núcleo: más actividad hoy, más rápido late */
function cbLatido() {
  if (!cb.nucleo) return; const hoy = cb.hoyN || 0;
  const P = Math.max(1.1, 4.5 - hoy / 25), f = (cb.tiempo % P) / P;
  const pulso = Math.exp(-(((f - .05) / .035) ** 2)) + .6 * Math.exp(-(((f - .16) / .04) ** 2));
  const mus = typeof cbMusicaNivel === 'function' ? cbMusicaNivel() : 0;   // con música: la galaxia late con los graves
  cb.amb.material.uniforms.uOp.value = (cb.aislado ? .6 : cb.comparar ? .55 : .95) * (1 + .25 * mus);
  const b = cb.nucleo.userData.b0 || (cb.nucleo.userData.b0 = cb.nucleo.scale.x); cb.nucleo.scale.setScalar(b * (1 + .1 * pulso + .45 * mus)); cb.nucleo.material.opacity = (.24 + .1 * pulso) * (cb.kNucleo ?? 1);
}


/* ── 17 · El día de hoy ───────────────────────────────────────────────────
   Panel sutil con todo lo que se movió hoy (cobros de cartera y expensas,
   visitas, reservas, cotizaciones, agendas, leads, gestiones), la crónica
   del día, y frases que cuentan cada movimiento EN EL CONTEXTO DE HOY
   ("es el 5.º pago del día; la cartera ya suma $4.300").                */
const CB_HOY_DEF = [
  ['pag', 'cartera', 'Cobrado cartera', n => n.k.startsWith('pag:'), 'usd', 'pago', 'pagos'],
  ['exp', 'expensas', 'Cobrado expensas', n => n.k.startsWith('exp:'), 'bs', 'cobro de expensas', 'cobros de expensas'],
  ['res', 'ventas', 'Reservas', n => n.tipo === 'Reserva', 'usd', 'reserva', 'reservas'],
  ['vis', 'ventas', 'Visitas registradas', n => n.k.startsWith('reg:') && n.tipo !== 'Reserva', 'n', 'visita', 'visitas'],
  ['cot', 'cotizaciones', 'Cotizaciones', n => n.k.startsWith('cot:'), 'n', 'cotización', 'cotizaciones'],
  ['age', 'callcenter', 'Agendas del call center', n => n.k.startsWith('vis:'), 'n', 'agenda', 'agendas'],
  ['lead', 'marketing', 'Leads', n => n.k.startsWith('lead:'), 'leads', 'carga de leads', 'cargas de leads'],
  ['ges', 'cartera', 'Gestiones de cobranza', n => n.k.startsWith('gest:'), 'n', 'gestión', 'gestiones'],
  ['com', 'cartera', 'Compromisos de pago', n => n.k.startsWith('comp:'), 'n', 'compromiso', 'compromisos'],
];
const _cbHora = ts => { const d = new Date(ts); if ((!d.getHours() && !d.getMinutes()) || (d.getHours() === 12 && !d.getMinutes() && !d.getSeconds() && !d.getMilliseconds())) return ''; return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }); };
const _cbOrd = (k, fem) => k + (fem ? '.ª' : '.º');
const _cbBs = v => 'Bs ' + Math.round(v || 0).toLocaleString('es-BO');
function cbHoyTipo(n) { return CB_HOY_DEF.find(d => d[3](n)); }

function cbHoyCalc() {
  const h0 = _cbHoy0(), hoy = cb.N.filter(n => !n.fijo && n.ts >= h0 && n.ts < h0 + 864e5).sort((a, b) => a.ts - b.ts);
  cb.hoyL = hoy;
  cb.hoyT = CB_HOY_DEF.map(([id, reg, t, f, tipo]) => { const l = hoy.filter(f); return { id, reg, t, tipo, n: l.length, m: l.reduce((s, n) => s + (tipo === 'leads' ? (n.raw?.cantidad || 0) : (n.monto || 0)), 0), idx: l.map(n => n.i) }; });
  return cb.hoyT;
}
function _cbHoyValor(x) { return x.tipo === 'usd' ? (x.n ? _cbUsd(x.m) : '—') : x.tipo === 'bs' ? (x.n ? _cbBs(x.m) : '—') : x.tipo === 'leads' ? (x.m || x.n || '—') : (x.n || '—'); }
function cbHoyPintar() {
  const el = document.getElementById('cb-hoy-g'); if (!el || !cb.hoyT) return;
  const ant = cb.hoyAnt || {};
  el.innerHTML = cb.hoyT.map(x => { const v = _cbHoyValor(x), cambio = ant[x.id] != null && ant[x.id] !== v;
    return `<button type="button" class="${x.n ? '' : 'cero'}${cambio ? ' sube' : ''}" data-id="${x.id}" onclick="cbHoyVer('${x.id}')" title="Ver en la galaxia"><i style="background:${CB_REG[CB_RI[x.reg]].c}"></i><span>${x.t}</span><b>${v}</b>${(x.tipo === 'usd' || x.tipo === 'bs') && x.n ? `<em>${x.n}</em>` : ''}</button>`; }).join('');
  cb.hoyAnt = Object.fromEntries(cb.hoyT.map(x => [x.id, _cbHoyValor(x)]));
  const tot = (cb.hoyL || []).length, d = new Date();
  document.getElementById('cb-hoy-h').innerHTML = `Hoy · ${d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })} <em>${tot} movimiento${tot === 1 ? '' : 's'}</em>`;
}
function cbHoyVer(id) {
  const x = (cb.hoyT || []).find(q => q.id === id); if (!x || !x.n) return;
  if (x.idx.length === 1) cbSeleccionar(x.idx[0], true); else cbAislar(x.idx, x.t + ' de hoy · ' + x.idx.length);
  cbNarrar(`${x.t} de hoy: ${x.n} ${x.n === 1 ? CB_HOY_DEF.find(d => d[0] === id)[5] : CB_HOY_DEF.find(d => d[0] === id)[6]}${x.tipo === 'usd' && x.m ? ' por ' + _cbUsd(x.m) : x.tipo === 'bs' ? ' por ' + _cbBs(x.m) : ''}.`);
}
function cbHoyToggle() { const r = document.getElementById('cb-hoy'); r.classList.toggle('min'); cbGuardarL('uv-andromeda-hoy-min', r.classList.contains('min') ? '1' : '0'); }
function cbHoyFlash(n) { const t = cbHoyTipo(n); if (!t) return; const b = document.querySelector(`#cb-hoy-g button[data-id="${t[0]}"]`); if (b) { b.classList.remove('foco'); void b.offsetWidth; b.classList.add('foco'); } }

/* Una frase por movimiento, con sujeto (quién hizo qué) */
function cbFraseHoy(m) {
  const r = m.raw || {}, cli = m.cliente || 'un cliente', as = m.asesor;
  if (m.k.startsWith('pag:')) return `${cli} pagó ${_cbUsd(m.monto)}${r.tipoPago ? ' de ' + String(r.tipoPago).toLowerCase() : ''}${m.terreno ? ' (' + m.terreno + ')' : ''}`;
  if (m.k.startsWith('exp:')) return `${cli} pagó expensas por ${_cbBs(m.monto)}${m.terreno ? ' (' + m.terreno + ')' : ''}`;
  if (m.tipo === 'Reserva') return `${as || 'Un asesor'} cerró una reserva con ${cli}${m.terreno ? ' por el ' + m.terreno : ''}${m.monto ? ', ' + _cbUsd(m.monto) : ''}`;
  if (m.k.startsWith('reg:')) return `${cli} visitó el proyecto${as ? ' con ' + as : ''}${m.terreno ? ', interesado en el ' + m.terreno : ''}`;
  if (m.k.startsWith('cot:')) return r.tipo === 'perfil' ? `${as || 'Se'} armó un perfil de búsqueda para ${cli}` : `${as || 'Se'} envió una cotización a ${cli}${r.precioFinal ? ' por ' + _cbUsd(r.precioFinal) : ''}${r.vistas ? '; ya la abrió ' + r.vistas + (r.vistas > 1 ? ' veces' : ' vez') : ''}`;
  if (m.k.startsWith('vis:')) return `el call center agendó a ${cli} con ${as || 'un asesor'}`;
  if (m.k.startsWith('lead:')) return `entraron ${r.cantidad || ''} leads de ${m.campania || 'una campaña'}`;
  if (m.k.startsWith('gest:')) return `gestión de cobranza a ${cli}: ${String(r.resultado || 'contacto').toLowerCase()}`;
  if (m.k.startsWith('comp:')) return `${cli} se comprometió a pagar${m.monto ? ' ' + _cbUsd(m.monto) : ''}${r.fecha ? ' el ' + _cbDia(new Date(r.fecha + 'T12:00').getTime()) : ''}`;
  return `${m.tipo}: ${m.titulo}`;
}
const _cbMay = s => s.charAt(0).toUpperCase() + s.slice(1);
/* El contexto del día: qué número es y cuánto va acumulado hasta ese momento */
function cbContextoHoy(m) {
  const t = cbHoyTipo(m); if (!t || !cb.hoyL) return '';
  const fem = /cotización|reserva|visita|agenda|gestión/.test(t[5]), lista = cb.hoyL.filter(t[3]), k = lista.indexOf(m) + 1; if (!k) return '';
  const hasta = lista.slice(0, k).reduce((s, n) => s + (n.monto || 0), 0);
  let out = k === 1 ? `Es ${fem ? 'la primera' : 'el primer'} ${t[5]} del día` : `Es ${fem ? 'la' : 'el'} ${_cbOrd(k, fem)} ${t[5]} del día`;
  if (t[4] === 'usd' && hasta) out += `; ${t[0] === 'pag' ? 'la cartera' : 'las reservas'} ya ${t[0] === 'pag' ? 'suma' : 'suman'} ${_cbUsd(hasta)}`;
  if (t[4] === 'bs' && hasta) out += `; expensas ya suma ${_cbBs(hasta)}`;
  return out + '.';
}
function cbLineaHoy(m, conHora = true) {
  const h = conHora ? _cbHora(m.ts) : ''; return (h ? `A las ${h}, ` : '') + (h ? cbFraseHoy(m) : _cbMay(cbFraseHoy(m))) + '. ' + cbContextoHoy(m);
}
/* Lo que el MISMO cliente hizo hoy (y nada de días anteriores) */
function cbClienteHoy(cli) {
  const c = _cbN(cli); if (!c || !cb.hoyL) return [];
  return cb.hoyL.filter(n => _cbN(n.cliente) === c);
}
function cbClienteHoyTxt(cli) {
  const l = cbClienteHoy(cli); if (!l.length) return '';
  const usd = l.filter(n => n.k.startsWith('pag:') || n.tipo === 'Reserva').reduce((s, n) => s + (n.monto || 0), 0), bs = l.filter(n => n.k.startsWith('exp:')).reduce((s, n) => s + (n.monto || 0), 0);
  return [usd ? _cbUsd(usd) : '', bs ? _cbBs(bs) : '', !usd && !bs ? l.length + ' mov.' : ''].filter(Boolean).join(' · ');
}
function cbHoyBloque(n) {
  const l = cbClienteHoy(n.cliente); if (!l.length) return '';
  const sin = m => { let f = cbFraseHoy(m); if (m.cliente && f.startsWith(m.cliente)) f = f.slice(m.cliente.length).trim(); return _cbMay(f); };
  const filas = l.map(m => `<div style="--c:${CB_REG[CB_RI[m.reg]].c}"><span>${_cbHora(m.ts) || 'hoy'}</span>${_cbEsc(sin(m))}</div>`).join('');
  return `<div class="cb-c-hoy"><div class="h"><span>Hoy</span><b>${cbClienteHoyTxt(n.cliente)}</b></div>${filas}</div>`;
}

/* El recorrido de una estrella de hoy: su frase en contexto y lo demás que ese cliente hizo hoy */
function cbDiaViaje(i) {
  const n = cb.N[i]; if (!n) return 6;
  (cb.histT || []).forEach(clearTimeout); cb.histT = [];
  const esHoy = n.ts >= _cbHoy0() && n.ts < _cbHoy0() + 864e5, otros = esHoy ? cbClienteHoy(n.cliente).filter(m => m !== n).slice(0, 3) : [];
  cb.focoSuave = new Set([i, ...otros.map(m => m.i)]); cbVisibilidad(); cbHoyFlash(n);
  otros.forEach(m => cb.dir.vistos.push(m.k));
  let t = cbNarrar(esHoy ? cbLineaHoy(n) : `${_cbMay(cbFraseHoy(n))}. Fue ${n.ts ? 'el ' + _cbDia(n.ts) : 'hace un tiempo'}.`) * 1000;
  otros.forEach((m, k) => {
    cb.histT.push(setTimeout(() => {
      if (cb.dir.esc !== 'detalle' || !cb.N[m.i]) return;
      cbVolarA(m.i, .95, 1.5); cbPulso(cb.N[k ? otros[k - 1].i : i].pos, m.pos, CB_REG[CB_RI[m.reg]].c, 1.4);
      cbMira(m.i, `${_cbHora(m.ts) || 'Hoy'} · también hoy`, m.cliente || m.titulo, m.tipo, cbDatosDe(m)); cbNarrar('También hoy: ' + cbFraseHoy(m) + '.'); cbHoyFlash(m);
    }, t)); t += 3600;
  });
  return t / 1000 + 1.5;
}

/* Crónica del día: todo lo que se movió, hora por hora */
function cbCronicaTexto() {
  const T = Object.fromEntries((cb.hoyT || cbHoyCalc()).map(x => [x.id, x])), L = cb.hoyL || [];
  if (!L.length) return 'Todavía no hubo movimientos hoy.';
  const p = [], h = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  if (T.pag.n || T.exp.n) p.push(`Hoy, hasta las ${h}, ${[T.pag.n ? `la cartera cobró ${_cbUsd(T.pag.m)} en ${T.pag.n} ${T.pag.n === 1 ? 'pago' : 'pagos'}` : '', T.exp.n ? `expensas cobró ${_cbBs(T.exp.m)} en ${T.exp.n} ${T.exp.n === 1 ? 'cobro' : 'cobros'}` : ''].filter(Boolean).join(' y ')}.`);
  else p.push(`Hoy, hasta las ${h}, no entraron cobros.`);
  const v = [T.vis.n ? `${T.vis.n} ${T.vis.n === 1 ? 'visita registrada' : 'visitas registradas'}` : '', T.res.n ? `${T.res.n} ${T.res.n === 1 ? 'reserva' : 'reservas'}${T.res.m ? ' por ' + _cbUsd(T.res.m) : ''}` : '', T.cot.n ? `${T.cot.n} ${T.cot.n === 1 ? 'cotización' : 'cotizaciones'}` : '', T.age.n ? `${T.age.n} ${T.age.n === 1 ? 'agenda' : 'agendas'} del call center` : '', T.lead.m ? `${T.lead.m} leads` : ''].filter(Boolean);
  if (v.length) p.push('En lo comercial hubo ' + v.slice(0, -1).join(', ') + (v.length > 1 ? ' y ' : '') + v.slice(-1) + '.');
  if (T.ges.n || T.com.n) p.push(`Cobranza hizo ${T.ges.n} ${T.ges.n === 1 ? 'gestión' : 'gestiones'}${T.com.n ? ` y consiguió ${T.com.n} ${T.com.n === 1 ? 'compromiso' : 'compromisos'} de pago` : ''}.`);
  const porH = {}; L.forEach(n => { const k = new Date(n.ts).getHours(); if (_cbHora(n.ts)) porH[k] = (porH[k] || 0) + 1; }); const pico = Object.entries(porH).sort((a, b) => b[1] - a[1])[0];
  if (pico && pico[1] >= 3) p.push(`El momento más intenso fue entre las ${pico[0]} y las ${+pico[0] + 1} (${pico[1]} movimientos).`);
  return p.join(' ');
}
function cbCronica(on = true) {
  const el = document.getElementById('cb-cro'); if (!el) return;
  if (!on) { el.classList.remove('on'); return; }
  cbHoyCalc(); const L = (cb.hoyL || []).slice().reverse();
  let hora = null;
  const filas = L.map(n => { const hh = _cbHora(n.ts), k = hh ? hh.slice(0, 2) + ':00' : 'Sin hora', cab = k !== hora ? (hora = k, `<div class="hh">${k}</div>`) : '';
    return cab + `<button type="button" onclick="cbSeleccionar(${n.i},true)" style="--c:${CB_REG[CB_RI[n.reg]].c}"><span>${hh}</span>${_cbEsc(_cbMay(cbFraseHoy(n)))}</button>`; }).join('');
  el.innerHTML = `<button type="button" class="cb-x" onclick="cbCronica(false)">×</button><div class="cb-c-k"><span>Crónica del día</span><span>${L.length} movimientos</span></div>
    <p class="cb-cro-p" id="cb-cro-p">${_cbEsc(cbCronicaTexto())}</p><div class="cb-c-b"><button type="button" class="p" onclick="cbCronicaEscuchar()">Escuchar</button><button type="button" onclick="cbCronica(false);cb.replayHoy=true;cb.replayDur=30;cbReplayToggle(true)">Ver el día en 30 s</button></div>
    <div class="cb-cro-l">${filas || '<p class="cb-vacio">Todavía no hubo movimientos hoy.</p>'}</div>`;
  el.classList.add('on'); if (cb.dir?.on) cbDirPausa(60000);
}
function cbCronicaEscuchar() { const v = cb.voz; cb.voz = true; cbNarrar(cbCronicaTexto()); cb.voz = v; }


/* ── 18 · Banda sonora: "Los Planetas" de Gustav Holst ──────────────────
   La música más famosa sobre el espacio que se puede usar libremente:
   la obra es de dominio público (1916) y las grabaciones son de la Banda
   de la Fuerza Aérea de EE.UU. (obra del gobierno de EE.UU. = dominio
   público), alojadas en Wikimedia Commons. Si subís tus propios MP3 a la
   carpeta musica/ con un musica/lista.json, se usan esos primero.
   Cuando la música se puede analizar, la galaxia late con ella.         */
const CB_PLANETAS = [
  ['jupiter', 'Júpiter', 'el que trae la alegría'], ['mercury', 'Mercurio', 'el mensajero alado'], ['venus', 'Venus', 'la que trae la paz'],
  ['mars', 'Marte', 'el que trae la guerra'], ['uranus', 'Urano', 'el mago'], ['saturn', 'Saturno', 'el que trae la vejez'], ['neptune', 'Neptuno', 'el místico'],
];
const CB_MD5 = { mercury: '2/28', venus: '4/4c', mars: '8/85', jupiter: '1/11', saturn: '6/65', uranus: '9/97', neptune: 'c/c1' };
function _cbPista(k) {
  const [id, t, s] = CB_PLANETAS[k], f = 'Holst-_' + id + '.ogg';
  return { titulo: 'Holst · ' + t, sub: s, autor: 'Banda de la Fuerza Aérea de EE.UU. · dominio público',
    fuentes: [['https://upload.wikimedia.org/wikipedia/commons/' + CB_MD5[id] + '/' + f, true], ['https://commons.wikimedia.org/wiki/Special:FilePath/' + f, false],
      ['https://upload.wikimedia.org/wikipedia/commons/transcoded/' + CB_MD5[id] + '/' + f + '/' + f + '.mp3', false]] };
}
async function cbMusicaLista() {
  if (cb.musLista) return cb.musLista;
  try { const r = await fetch('musica/lista.json', { cache: 'no-store' }); if (r.ok) { const l = await r.json(); if (Array.isArray(l) && l.length) return (cb.musLista = l.map(x => ({ titulo: x.titulo || x.src, sub: x.sub || '', autor: x.autor || '', fuentes: [[x.src.startsWith('http') ? x.src : 'musica/' + x.src, true]] }))); } } catch (e) {}
  return (cb.musLista = CB_PLANETAS.map((_, k) => _cbPista(k)));
}
function cbMusica() {
  cb.musica = !cb.musica; document.getElementById('cb-b-mus')?.classList.toggle('on', cb.musica);
  if (cb.musica) cbMusicaIniciar(); else cbMusicaParar();
}
async function cbMusicaIniciar() {
  const lista = await cbMusicaLista(); if (!cb.musica) return;
  cb.musK = cb.musK ?? 0; cbMusicaPista(cb.musK, 0);
}
function cbMusicaPista(k, intento) {
  const lista = cb.musLista; if (!lista || !cb.musica) return;
  if (intento == null) intento = 0;
  const p = lista[k % lista.length], f = p.fuentes[intento];
  if (!f) { cb.musFallos = (cb.musFallos || 0) + 1; if (cb.musFallos > lista.length) { cbMusicaParar(); cb.musica = false; document.getElementById('cb-b-mus')?.classList.remove('on'); toastErr('No se pudo cargar la música (revisá la conexión).'); return; } cbMusicaPista(k + 1, 0); return; }
  if (cb.audio) { try { cb.audio.pause(); } catch (e) {} cb.audio.remove?.(); }
  const a = new Audio(); cb.audio = a; a.preload = 'auto'; if (f[1]) a.crossOrigin = 'anonymous'; a.src = f[0]; a.volume = 0;
  a.onerror = () => { if (cb.audio === a) cbMusicaPista(k, intento + 1); };
  a.onended = () => { if (cb.audio === a) { cb.musK = k + 1; cbMusicaPista(k + 1, 0); } };
  a.onplaying = () => { cb.musFallos = 0; cb.musK = k; cbMusicaConectar(a, f[1]); cbMusicaFade(a, cb.musDuck ? .18 : .55, 2.5); cbMusicaChip(p); };
  a.play().catch(() => { if (cb.audio === a) cbMusicaPista(k, intento + 1); });
}
/* Si el archivo permite análisis (CORS), la galaxia escucha la música */
function cbMusicaConectar(a, cors) {
  cb.musAn = null; if (!cors) return;
  try { const ac = cb.ac = cb.ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
    const src = ac.createMediaElementSource(a), an = ac.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = .8; src.connect(an); an.connect(ac.destination);
    cb.musAn = an; cb.musBuf = new Uint8Array(an.frequencyBinCount); } catch (e) { cb.musAn = null; }
}
function cbMusicaNivel() {
  if (!cb.musAn || !cb.audio || cb.audio.paused) { cb.musNivel = (cb.musNivel || 0) * .9; return cb.musNivel; }
  cb.musAn.getByteFrequencyData(cb.musBuf); let s = 0; for (let i = 1; i < 12; i++) s += cb.musBuf[i]; const v = s / (11 * 255);
  cb.musNivel = Math.max(v, (cb.musNivel || 0) * .86); return cb.musNivel;
}
function cbMusicaFade(a, vol, seg) { clearInterval(a._f); const v0 = a.volume, t0 = performance.now(); a._f = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / (seg * 1000)); try { a.volume = v0 + (vol - v0) * k; } catch (e) {} if (k >= 1) clearInterval(a._f); }, 60); }
function cbMusicaParar() { const a = cb.audio; document.getElementById('cb-np')?.classList.remove('on'); if (!a) return; cbMusicaFade(a, 0, 1.2); setTimeout(() => { try { a.pause(); } catch (e) {} }, 1300); cb.audio = null; cb.musAn = null; }
function cbMusicaSiguiente() { if (!cb.musica) return; cbMusicaPista((cb.musK || 0) + 1, 0); }
function cbMusicaChip(p) {
  const el = document.getElementById('cb-np'); if (!el) return;
  el.innerHTML = `<i class="eq"><b></b><b></b><b></b></i><div><b>${_cbEsc(p.titulo)}</b><span>${_cbEsc(p.sub ? p.sub + ' · ' : '')}${_cbEsc(p.autor)}</span></div><button type="button" onclick="cbMusicaSiguiente()" title="Siguiente">›</button>`;
  el.classList.add('on');
}
/* Cuando habla la voz, la música baja sola */
function cbMusicaDuck(on) { cb.musDuck = on; if (cb.audio && !cb.audio.paused) cbMusicaFade(cb.audio, on ? .18 : .55, on ? .4 : 1.6); }
