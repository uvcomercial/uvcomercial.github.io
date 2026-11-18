/* ═══════════════════════════════════════════════════════════════════════
   SEGUIMIENTO DE COBRANZA (CRM) — módulo Cartera
   ─────────────────────────────────────────────────────────────────────
   Fuente: Excel mensual "Cuotas por día" de Orange (cuotas pendientes al
   corte). Cada fila = una cuota vencida sin pagar. Se carga una vez por mes.

   Firebase (todo bajo cobcrm_*):
     cobcrm_cortes/{AAAA-MM}      resumen del corte + porCliente {key:[total,cuotas,dias]}
     cobcrm_cuotas/{AAAA-MM}      [ {v,t,p,s,z,c,f,m} ]  (las cuotas de ese corte)
     cobcrm_clientes/{clienteKey} ficha CRM: contacto, responsable, estado, prioridad, última gestión
     cobcrm_gestiones/{clienteKey}/{id}  bitácora de gestiones de cobranza
     cobcrm_compromisos/{id}      promesas de pago / avances / recordatorios → alertas
   Las gestiones y compromisos NUNCA se borran al cargar un corte nuevo.
═══════════════════════════════════════════════════════════════════════ */
let cobCortes = {};
let cobCorteSel = null;
let cobCuotas = [];
let cobAgg = [];
let cobClientesCRM = {};
let cobCompromisos = {};
let cobGestionesTodas = null;
let cobVista = 'lista';
let cobOrden = { campo: 'total', dir: -1 };
let cobFichaKey = null;
let cobFichaUnsub = null;
let cobFichaGestiones = [];
let cobImportPend = null;
let cobIniciado = false;
let cobAvisoMostrado = false;
const cobCacheCuotas = {};

const COB_ESTADOS = ['Sin gestionar','En contacto','Promesa de pago','Pago parcial','Plan de pagos / Reprogramación','No contactable','Disputa / Reclamo','Derivado a legal','Regularizado'];
const COB_ESTADO_COLOR = {
  'Sin gestionar':'#98A2B3','En contacto':'#2E90FA','Promesa de pago':'#7C3AED','Pago parcial':'#12B76A',
  'Plan de pagos / Reprogramación':'#0E9384','No contactable':'#F79009','Disputa / Reclamo':'#EC4899',
  'Derivado a legal':'#F04438','Regularizado':'#027A48'
};
const COB_CANALES = ['Llamada','WhatsApp','Email','Visita','Reunión en oficina','Carta / Notificación'];
const COB_RESULTADOS = ['Contactado','Promesa de pago','Promesa de avance','Pagó','Solicita reprogramación','No contesta','Dejó mensaje','Número equivocado','Se niega a pagar','Reclamo / disputa'];
const COB_RESULTADO_ESTADO = {
  'Contactado':'En contacto','Promesa de pago':'Promesa de pago','Promesa de avance':'Promesa de pago','Pagó':'Pago parcial',
  'Solicita reprogramación':'Plan de pagos / Reprogramación','No contesta':'No contactable','Número equivocado':'No contactable',
  'Se niega a pagar':'Derivado a legal','Reclamo / disputa':'Disputa / Reclamo'
};
const COB_TIPOS_COMP = ['Pago','Avance','Volver a llamar','Reunión','Otro'];
const COB_TRAMOS = [
  { id:'pv',   lbl:'Por vencer',   min:-99999, max:0 },
  { id:'30',   lbl:'1–30 días',    min:1,   max:30 },
  { id:'60',   lbl:'31–60 días',   min:31,  max:60 },
  { id:'90',   lbl:'61–90 días',   min:61,  max:90 },
  { id:'180',  lbl:'91–180 días',  min:91,  max:180 },
  { id:'365',  lbl:'181–365 días', min:181, max:365 },
  { id:'mas',  lbl:'+365 días',    min:366, max:999999 },
];
const COB_TRAMO_COLOR = { pv:'#98A2B3', '30':'#12B76A', '60':'#FDB022', '90':'#F79009', '180':'#F97066', '365':'#F04438', mas:'#912018' };

/* ── utilidades ── */
const _cobPad = n => String(n).padStart(2,'0');
const _cobHoy = () => { const d = new Date(); return d.getFullYear()+'-'+_cobPad(d.getMonth()+1)+'-'+_cobPad(d.getDate()); };
const _cobUTC = s => { const [y,m,d] = String(s).split('-').map(Number); return Date.UTC(y, m-1, d||1); };
const _cobDias = (desde, hasta) => Math.round((_cobUTC(hasta) - _cobUTC(desde)) / 86400000);
const _cobSumarDias = (iso, n) => new Date(_cobUTC(iso) + n*86400000).toISOString().slice(0,10);
const _cobF = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4) : '—';
const _cobFc = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4) : '—';
const _cobUSD = n => '$' + Math.round(n||0).toLocaleString('en-US');
const _cobUSD2 = n => '$' + (Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
const _cobMesNom = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const _cobCorteNom = id => { if (!id) return '—'; const [y,m] = id.split('-'); return _cobMesNom[Number(m)-1] + ' ' + y; };
const _cobKey = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'sin-nombre';
const _cobTerrNorm = s => (String(s||'').match(/\d+/g)||[]).map(x => String(Number(x))).join('-');
const _cobUsuario = () => (typeof asesorActual !== 'undefined' && asesorActual?.nombre) ? asesorActual.nombre : ((typeof modoAdmin !== 'undefined' && modoAdmin) ? 'Administrador' : 'Usuario');
const _cobEsGerencia = () => (typeof modoAdmin !== 'undefined' && modoAdmin) || (typeof asesorActual !== 'undefined' && asesorActual?.rol === 'gerencia');
const _cobTramo = d => COB_TRAMOS.find(t => d >= t.min && d <= t.max) || COB_TRAMOS[COB_TRAMOS.length-1];
const _cobLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch(e) { return null; } };

function _cobNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).replace(/[^0-9.,-]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g,'').replace(',', '.') : s.replace(/,/g,'');
  else if (lc > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/,\d{2}$/.test(s) ? s.replace(/,/g,'') : s.replace(',', '.');
  else if (ld > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function _cobFecha(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899,11,30) + Math.round(v)*86400000).toISOString().slice(0,10);
  if (v instanceof Date && !isNaN(v)) return v.getFullYear()+'-'+_cobPad(v.getMonth()+1)+'-'+_cobPad(v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${_cobPad(m[2])}-${_cobPad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}
function _cobConceptoCorto(c) {
  const s = String(c||'').replace(/ /g,' ').trim();
  let m = s.match(/Cuota\s*Nro:?\s*(\d+)/i); if (m) return 'Cuota ' + m[1];
  const primero = s.split(' - ')[0].trim();
  return primero.slice(0, 60) || 'Cuota';
}

/* ═══ ARRANQUE ═══ */
function iniciarCobCRM() {
  if (cobIniciado || !window._fbCob) return;
  cobIniciado = true;
  // ficha y modal se cuelgan del <body> para que el position:fixed no dependa de animaciones del panel
  ['cob-ficha-ov','cob-ficha','cob-modal'].forEach(id => { const el = document.getElementById(id); if (el) document.body.appendChild(el); });
  _cobInitDrop();
  if (_cobLS('uv-cob-open') === '1') document.getElementById('cob-acc')?.classList.add('open');
  window._fbCob.listen('cobcrm_cortes', m => {
    cobCortes = m || {};
    const ids = _cobIdsCortes();
    if (!cobCorteSel || !cobCortes[cobCorteSel]) cobCorteSel = ids[0] || null;
    _cobPoblarCortes();
    cobCambiarCorte(cobCorteSel, true);
    if (cobVista === 'carga') cobRenderCortes();
  });
  window._fbCob.listen('cobcrm_clientes', m => { cobClientesCRM = m || {}; _cobRefrescar(); });
  window._fbCob.listen('cobcrm_compromisos', m => {
    cobCompromisos = m || {};
    _cobBadge();
    _cobRefrescar();
    if (!cobAvisoMostrado) {
      cobAvisoMostrado = true;
      const { venc, hoy } = _cobConteoAlertas();
      if (venc + hoy > 0) setTimeout(() => showToast(`🔔 Cobranza: ${hoy} compromiso(s) para hoy${venc ? ' y ' + venc + ' vencido(s) sin cerrar' : ''}. Revisá Cartera → Seguimiento de Cobranza → Agenda.`, 'info', 8000), 1500);
    }
  });
}

function _cobIdsCortes() { return Object.keys(cobCortes).sort().reverse(); }
function _cobCorteAnteriorDe(id) { const ids = Object.keys(cobCortes).sort(); const i = ids.indexOf(id); return i > 0 ? ids[i-1] : null; }

function _cobPoblarCortes() {
  const sel = document.getElementById('cob-corte-sel'); if (!sel) return;
  const ids = _cobIdsCortes();
  sel.innerHTML = ids.length ? ids.map(id => `<option value="${id}" ${id===cobCorteSel?'selected':''}>${_cobCorteNom(id)} · al ${_cobFc(cobCortes[id].fecha)}</option>`).join('') : '<option value="">Sin cortes cargados</option>';
}

async function cobCambiarCorte(id, silencioso) {
  cobCorteSel = id || null;
  if (!cobCorteSel) { cobCuotas = []; cobAgg = []; _cobRefrescar(); return; }
  if (!cobCacheCuotas[cobCorteSel]) {
    try { const arr = await window._fbCob.get('cobcrm_cuotas/' + cobCorteSel); cobCacheCuotas[cobCorteSel] = Array.isArray(arr) ? arr : Object.values(arr || {}); }
    catch(e) { console.error('[COB] no se pudo leer cuotas', e); if (!silencioso) toastErr('No se pudieron leer las cuotas del corte.'); cobCacheCuotas[cobCorteSel] = []; }
  }
  cobCuotas = cobCacheCuotas[cobCorteSel] || [];
  cobAgg = _cobAgrupar(cobCuotas, cobCortes[cobCorteSel]?.fecha || _cobHoy());
  _cobPoblarFiltros();
  _cobRefrescar();
}

/* Agrupa cuotas por cliente (persona) */
function _cobAgrupar(cuotas, fechaCorte) {
  const map = {};
  (cuotas || []).forEach(q => {
    const k = _cobKey(q.p);
    const a = map[k] || (map[k] = { key:k, persona:q.p, vendedores:new Set(), ventas:new Set(), terrenos:new Set(), terrNorm:new Set(),
      cuotasT:0, montoT:0, cuotasA:0, montoA:0, total:0, fMin:null, fMinT:null, fMinA:null, cuotas:[] });
    if (q.s) a.vendedores.add(q.s);
    a.ventas.add(q.v); if (q.z) { a.terrenos.add(q.z); a.terrNorm.add(_cobTerrNorm(q.z)); }
    if (q.t === 'T') { a.cuotasT++; a.montoT += q.m; if (!a.fMinT || q.f < a.fMinT) a.fMinT = q.f; }
    else { a.cuotasA++; a.montoA += q.m; if (!a.fMinA || q.f < a.fMinA) a.fMinA = q.f; }
    a.total += q.m;
    if (!a.fMin || q.f < a.fMin) a.fMin = q.f;
    a.cuotas.push(q);
  });
  return Object.values(map).map(a => {
    a.dias = a.fMin ? Math.max(_cobDias(a.fMin, fechaCorte), 0) : 0;
    a.diasHoy = a.fMin ? Math.max(_cobDias(a.fMin, _cobHoy()), 0) : 0;
    a.tramo = _cobTramo(a.fMin ? _cobDias(a.fMin, fechaCorte) : 0);
    a.vendedor = [...a.vendedores].join(', ');
    a.cuotas.sort((x,y) => x.f < y.f ? -1 : x.f > y.f ? 1 : 0);
    return a;
  });
}

/* Datos derivados por cliente que dependen del CRM, compromisos, corte anterior y Orange */
function _cobEnriquecer(a) {
  const crm = cobClientesCRM[a.key] || {};
  const prevId = _cobCorteAnteriorDe(cobCorteSel);
  const prev = prevId ? cobCortes[prevId]?.porCliente?.[a.key] : undefined;
  let mov = 'Igual';
  if (!prevId) mov = '—';
  else if (!prev) mov = 'Nuevo';
  else if (a.total > prev[0] + 1) mov = 'Empeoró';
  else if (a.total < prev[0] - 1) mov = 'Mejoró';
  const comps = Object.entries(cobCompromisos).filter(([,c]) => c.clienteKey === a.key).map(([id,c]) => ({ ...c, _id:id }));
  const pend = comps.filter(c => c.estado === 'Pendiente').sort((x,y) => x.fecha < y.fecha ? -1 : 1);
  const hoy = _cobHoy();
  return {
    crm, estado: crm.estado || 'Sin gestionar', resp: crm.responsable || '', mov, prevTotal: prev ? prev[0] : null,
    compPend: pend[0] || null, compVencido: pend.some(c => c.fecha < hoy), nPend: pend.length,
    ultGest: crm.ultimaGestion || null,
    diasSinGestion: crm.ultimaGestion?.ts ? Math.floor((Date.now() - crm.ultimaGestion.ts)/86400000) : null,
    postPago: _cobPagosPostCorte(a),
  };
}

/* Pagos que Orange (GetCartera) registra DESPUÉS de la fecha de corte para los terrenos del cliente.
   Se indexa una sola vez por carga de Orange (por terreno normalizado y por nombre) para no recorrer
   miles de cobros por cada cliente en cada render. */
let _cobIdxOrangeCache = { ref:null, len:-1, porTerr:{}, porNom:{} };
function _cobIdxOrange() {
  const raw = (typeof orangeCarteraDetalleRaw !== 'undefined') ? orangeCarteraDetalleRaw : [];
  if (_cobIdxOrangeCache.ref === raw && _cobIdxOrangeCache.len === raw.length) return _cobIdxOrangeCache;
  const porTerr = {}, porNom = {};
  raw.forEach(r => {
    if (r.tipoPago !== 'Terreno' && r.tipoPago !== 'Acción') return;
    (porTerr[_cobTerrNorm(r.terreno)] ||= []).push(r);
    (porNom[_cobKey(r.cliente)] ||= []).push(r);
  });
  return (_cobIdxOrangeCache = { ref: raw, len: raw.length, porTerr, porNom });
}
function _cobPagosPostCorte(a, desdeISO) {
  const idx = _cobIdxOrange();
  if (!idx.len) return { total:0, filas:[] };
  const iso = desdeISO || _cobSumarDias(cobCortes[cobCorteSel]?.fecha || _cobHoy(), 1);
  const [y,m,d] = iso.split('-').map(Number);
  const dl = new Date(y, m-1, d).getTime();   // fechaOrden de Orange está en hora local
  const vistos = new Set(), filas = [];
  const add = r => { if (r && r.fechaOrden >= dl && !vistos.has(r)) { vistos.add(r); filas.push(r); } };
  a.terrNorm.forEach(t => (idx.porTerr[t] || []).forEach(add));
  (idx.porNom[_cobKey(a.persona)] || []).forEach(add);
  filas.sort((x,y) => x.fechaOrden - y.fechaOrden);
  return { total: filas.reduce((s,r) => s + (r.monto||0), 0), filas };
}

function _cobConteoAlertas() {
  const hoy = _cobHoy(); let venc = 0, h = 0, prox = 0;
  Object.values(cobCompromisos).forEach(c => {
    if (c.estado !== 'Pendiente') return;
    if (c.fecha < hoy) venc++; else if (c.fecha === hoy) h++; else if (c.fecha <= _cobSumarDias(hoy, 7)) prox++;
  });
  return { venc, hoy: h, prox };
}
function _cobBadge() {
  const { venc, hoy } = _cobConteoAlertas();
  const n = venc + hoy;
  const b = document.getElementById('badge-cobcrm');
  if (b) { b.textContent = n; b.style.display = n > 0 ? 'inline-flex' : 'none'; b.title = `${hoy} para hoy · ${venc} vencidos`; }
  const t = document.getElementById('cob-tab-n-agenda');
  if (t) { t.textContent = n || ''; t.style.display = n ? 'inline-block' : 'none'; }
}

function _cobRefrescar() {
  _cobRenderCabecera();
  if (!document.getElementById('cob-acc')?.classList.contains('open')) return;
  if (cobVista === 'lista') cobRenderLista();
  if (cobVista === 'agenda') cobRenderAgenda();
  if (cobVista === 'ind') cobRenderIndicadores();
  if (cobVista === 'carga') cobRenderCortes();
  if (cobFichaKey) cobRenderFicha();
}

function cobToggleAcordeon() {
  const acc = document.getElementById('cob-acc'); if (!acc) return;
  acc.classList.toggle('open');
  _cobLS('uv-cob-open', acc.classList.contains('open') ? '1' : '0');
  if (acc.classList.contains('open')) _cobRefrescar();
}

function cobVer(v) {
  cobVista = v;
  document.querySelectorAll('.cob-tab').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ['lista','agenda','ind','carga'].forEach(x => { const el = document.getElementById('cob-v-' + x); if (el) el.style.display = x === v ? '' : 'none'; });
  if (v === 'ind' && cobGestionesTodas === null) {
    window._fbCob.get('cobcrm_gestiones').then(g => { cobGestionesTodas = g || {}; cobRenderIndicadores(); }).catch(() => { cobGestionesTodas = {}; });
  }
  _cobRefrescar();
}

/* ── Cabecera (pills del acordeón + KPIs) ── */
function _cobRenderCabecera() {
  const c = cobCortes[cobCorteSel];
  const pills = document.getElementById('cob-acc-pills');
  const sub = document.getElementById('cob-acc-sub');
  const { venc, hoy, prox } = _cobConteoAlertas();
  if (sub) sub.textContent = c ? `Corte ${_cobCorteNom(cobCorteSel)} (al ${_cobF(c.fecha)}) · cargado por ${c.cargadoPor||'—'}` : 'Todavía no se cargó ningún corte — abrí y subí el Excel del mes';
  const tot = cobAgg.reduce((s,a) => s + a.total, 0);
  if (pills) pills.innerHTML = c ? `
    <span class="cob-pill"><b>${cobAgg.length}</b> clientes</span>
    <span class="cob-pill"><b>${_cobUSD(tot)}</b> pendiente</span>
    ${venc ? `<span class="cob-pill d"><b>${venc}</b> vencidos</span>` : ''}
    ${hoy ? `<span class="cob-pill w"><b>${hoy}</b> hoy</span>` : ''}
    ${prox ? `<span class="cob-pill i"><b>${prox}</b> próx. 7 días</span>` : ''}` : '';
  const k = document.getElementById('cob-kpis'); if (!k) return;
  if (!c) { k.innerHTML = ''; return; }
  const T = cobAgg.reduce((s,a) => s + a.montoT, 0), A = cobAgg.reduce((s,a) => s + a.montoA, 0);
  const qT = cobAgg.reduce((s,a) => s + a.cuotasT, 0), qA = cobAgg.reduce((s,a) => s + a.cuotasA, 0);
  const cT = cobAgg.filter(a => a.cuotasT).length, cA = cobAgg.filter(a => a.cuotasA).length;
  const m90 = cobAgg.filter(a => a.dias > 90).reduce((s,a) => s + a.total, 0);
  const gest30 = cobAgg.filter(a => { const g = cobClientesCRM[a.key]?.ultimaGestion; return g && Date.now() - g.ts <= 30*86400000; }).length;
  const kpi = (l, v, col) => `<div class="kpi-card cob-kpi" style="border-left:4px solid ${col};"><div class="kpi-label">${l}</div><div class="kpi-num">${v}</div></div>`;
  k.innerHTML =
    kpi('Clientes con deuda', cobAgg.length, 'var(--ink-900)') +
    kpi('Total pendiente', _cobUSD(tot), 'var(--danger)') +
    kpi(`Terreno · ${qT} cuotas · ${cT} clientes`, _cobUSD(T), 'var(--ok)') +
    kpi(`Acción · ${qA} cuotas · ${cA} clientes`, _cobUSD(A), 'var(--info)') +
    kpi('Mora +90 días', _cobUSD(m90), '#912018') +
    kpi('Recuperado vs corte anterior', c.recuperado != null ? _cobUSD(c.recuperado) : '—', 'var(--cartera)') +
    kpi('Gestionados (30 días)', cobAgg.length ? Math.round(gest30*100/cobAgg.length) + '%' : '—', 'var(--accent)') +
    kpi('Compromisos vencidos', venc, venc ? 'var(--danger)' : 'var(--line)');
}

/* ═══ LISTA ═══ */
function _cobPoblarFiltros() {
  const opt = (id, first, vals) => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="">${first}</option>` + vals.map(v => `<option value="${esc(v.v ?? v)}">${esc(v.l ?? v)}</option>`).join('');
    if ([...el.options].some(o => o.value === cur)) el.value = cur;
  };
  opt('cob-f-tramo', 'Todo tramo de mora', COB_TRAMOS.map(t => ({ v:t.id, l:t.lbl })));
  opt('cob-f-estado', 'Todo estado de gestión', COB_ESTADOS);
  const resps = _cobResponsables();
  opt('cob-f-resp', 'Todo responsable', [{ v:'__sin', l:'— Sin asignar —' }, ...resps]);
  opt('cob-ag-resp', 'Todo responsable', [{ v:'__yo', l:'Solo los míos' }, ...resps]);
  const vends = [...new Set(cobAgg.flatMap(a => [...a.vendedores]))].sort();
  opt('cob-f-vend', 'Todo vendedor', vends);
}

function _cobResponsables() {
  const set = new Set(['Administrador']);
  try { (asesores || []).forEach(a => { const mods = a.modulos || ROL_MODULOS[a.rol] || []; if (mods.includes('cobranza') || a.rol === 'gerencia') set.add(a.nombre); }); } catch(e) {}
  Object.values(cobClientesCRM).forEach(c => c.responsable && set.add(c.responsable));
  Object.values(cobCompromisos).forEach(c => c.responsable && set.add(c.responsable));
  return [...set].sort();
}

function cobLimpiarFiltros() {
  ['cob-f-q','cob-f-tipo','cob-f-tramo','cob-f-estado','cob-f-resp','cob-f-vend','cob-f-mov','cob-f-extra','cob-f-min'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  cobRenderLista();
}

function _cobFiltrar() {
  const v = id => document.getElementById(id)?.value || '';
  const q = v('cob-f-q').trim() ? _cobKey(v('cob-f-q')).replace(/-/g,' ') : '';
  const qDig = v('cob-f-q').replace(/\D/g,'');
  const tipo = v('cob-f-tipo'), tramo = v('cob-f-tramo'), est = v('cob-f-estado'), resp = v('cob-f-resp'),
        vend = v('cob-f-vend'), mov = v('cob-f-mov'), extra = v('cob-f-extra'), min = _cobNum(v('cob-f-min'));
  return cobAgg.map(a => ({ a, e: _cobEnriquecer(a) })).filter(({a, e}) => {
    if (q) {
      const hay = [_cobKey(a.persona).replace(/-/g,' '), [...a.terrenos].join(' '), [...a.ventas].join(' '), e.crm.telefono||'', e.crm.telefono2||''].join(' ');
      if (!hay.includes(q) && !(qDig.length >= 3 && hay.replace(/\D/g,' ').includes(qDig))) return false;
    }
    if (tipo === 'T' && !a.cuotasT) return false;
    if (tipo === 'A' && !a.cuotasA) return false;
    if (tipo === 'TA' && !(a.cuotasT && a.cuotasA)) return false;
    if (tramo && a.tramo.id !== tramo) return false;
    if (est && e.estado !== est) return false;
    if (resp === '__sin' && e.resp) return false;
    if (resp && resp !== '__sin' && e.resp !== resp) return false;
    if (vend && !a.vendedores.has(vend)) return false;
    if (mov && e.mov !== mov) return false;
    if (min && a.total < min) return false;
    if (extra === 'singest' && e.ultGest) return false;
    if (extra === 'sin30' && !(e.diasSinGestion === null || e.diasSinGestion >= 30)) return false;
    if (extra === 'compvenc' && !e.compVencido) return false;
    if (extra === 'comppend' && !e.nPend) return false;
    if (extra === 'postpago' && !e.postPago.total) return false;
    return true;
  });
}

const COB_COLS = [
  { k:'persona', l:'Cliente', s: x => _cobKey(x.a.persona) },
  { k:'vend',    l:'Vendedor', s: x => x.a.vendedor },
  { k:'cuotasT', l:'Cuotas T', r:1, s: x => x.a.cuotasT },
  { k:'montoT',  l:'Deuda terreno', r:1, s: x => x.a.montoT },
  { k:'cuotasA', l:'Cuotas A', r:1, s: x => x.a.cuotasA },
  { k:'montoA',  l:'Deuda acción', r:1, s: x => x.a.montoA },
  { k:'total',   l:'Total', r:1, s: x => x.a.total },
  { k:'fMin',    l:'Debe desde', s: x => x.a.fMin },
  { k:'dias',    l:'Días mora', r:1, s: x => x.a.dias },
  { k:'mov',     l:'vs corte ant.', s: x => ({ 'Nuevo':0,'Empeoró':1,'Igual':2,'Mejoró':3,'—':4 })[x.e.mov] },
  { k:'post',    l:'Pagó post-corte', r:1, s: x => x.e.postPago.total },
  { k:'estado',  l:'Estado gestión', s: x => COB_ESTADOS.indexOf(x.e.estado) },
  { k:'ult',     l:'Última gestión', s: x => x.e.ultGest?.ts || 0 },
  { k:'comp',    l:'Próximo compromiso', s: x => x.e.compPend?.fecha || '9999' },
  { k:'resp',    l:'Responsable', s: x => x.e.resp },
];

function cobOrdenar(k) {
  if (cobOrden.campo === k) cobOrden.dir *= -1; else { cobOrden.campo = k; cobOrden.dir = ['persona','vend','fMin','comp','resp','mov','estado'].includes(k) ? 1 : -1; }
  cobRenderLista();
}

function cobRenderLista() {
  const tb = document.getElementById('cob-tbody'), th = document.getElementById('cob-thead');
  if (!tb || !th) return;
  th.innerHTML = '<tr><th>#</th>' + COB_COLS.map(c => `<th class="${c.r?'r':''}" onclick="cobOrdenar('${c.k}')" style="cursor:pointer;">${c.l}${cobOrden.campo===c.k ? (cobOrden.dir>0?' ▲':' ▼') : ''}</th>`).join('') + '</tr>';
  if (!cobCorteSel) { tb.innerHTML = `<tr><td colspan="16"><div class="empty-state">Todavía no hay un corte cargado. Andá a <b>⬆ Cargar corte mensual</b> y subí el Excel.</div></td></tr>`; document.getElementById('cob-total-line').innerHTML = ''; return; }
  const filas = _cobFiltrar();
  const col = COB_COLS.find(c => c.k === cobOrden.campo) || COB_COLS[6];
  filas.sort((x,y) => { const a = col.s(x), b = col.s(y); return (a < b ? -1 : a > b ? 1 : 0) * cobOrden.dir; });
  const sum = (f) => filas.reduce((s,x) => s + f(x.a), 0);
  document.getElementById('cob-total-line').innerHTML =
    `<b>${filas.length}</b> de ${cobAgg.length} clientes · Terreno <b>${_cobUSD(sum(a=>a.montoT))}</b> (${sum(a=>a.cuotasT)} cuotas) · Acción <b>${_cobUSD(sum(a=>a.montoA))}</b> (${sum(a=>a.cuotasA)} cuotas) · Total <b>${_cobUSD(sum(a=>a.total))}</b>`;
  const hoy = _cobHoy();
  const movChip = m => m === 'Nuevo' ? '<span class="cob-chip d">● Nuevo</span>' : m === 'Empeoró' ? '<span class="cob-chip d">▲ Empeoró</span>' : m === 'Mejoró' ? '<span class="cob-chip ok">▼ Mejoró</span>' : m === 'Igual' ? '<span class="cob-chip n">= Igual</span>' : '<span class="cob-chip n">—</span>';
  tb.innerHTML = filas.length ? filas.map(({a, e}, i) => {
    const ug = e.ultGest;
    const cp = e.compPend;
    const cpCls = cp ? (cp.fecha < hoy ? 'd' : cp.fecha === hoy ? 'w' : 'i') : '';
    return `<tr class="cob-row" onclick="cobAbrirFicha('${a.key}')">
      <td class="cob-n">${i+1}</td>
      <td class="wrap-ok cob-cli"><b>${esc(a.persona)}</b><div class="cob-mini">${[...a.terrenos].map(esc).join(' · ')} · Vta ${[...a.ventas].join(', ')}</div></td>
      <td class="wrap-ok cob-mini2">${esc(a.vendedor)}</td>
      <td class="r">${a.cuotasT || ''}</td>
      <td class="r">${a.montoT ? _cobUSD(a.montoT) : ''}</td>
      <td class="r">${a.cuotasA || ''}</td>
      <td class="r">${a.montoA ? _cobUSD(a.montoA) : ''}</td>
      <td class="r"><b>${_cobUSD(a.total)}</b></td>
      <td>${_cobFc(a.fMin)}</td>
      <td class="r"><span class="cob-dias" style="--c:${COB_TRAMO_COLOR[a.tramo.id]}">${a.dias}</span></td>
      <td>${movChip(e.mov)}</td>
      <td class="r">${e.postPago.total ? `<span class="cob-chip ok" title="${e.postPago.filas.length} pago(s) en Orange después del corte">💚 ${_cobUSD(e.postPago.total)}</span>` : ''}</td>
      <td><span class="cob-est" style="--c:${COB_ESTADO_COLOR[e.estado]||'#98A2B3'}">${esc(e.estado)}</span></td>
      <td class="wrap-ok cob-mini2">${ug ? `${new Date(ug.ts).toLocaleDateString('es-BO')} · ${esc(ug.canal||'')} · ${esc(ug.resultado||'')}` : '<span style="color:var(--ink-400);">nunca</span>'}</td>
      <td>${cp ? `<span class="cob-chip ${cpCls}">${_cobFc(cp.fecha)} · ${esc(cp.tipo)}${cp.monto ? ' ' + _cobUSD(cp.monto) : ''}</span>${e.nPend > 1 ? ` <span class="cob-mini">+${e.nPend-1}</span>` : ''}` : ''}</td>
      <td class="cob-mini2">${esc(e.resp || '—')}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="16"><div class="empty-state">Ningún cliente coincide con los filtros.</div></td></tr>`;
}

/* ═══ FICHA DEL CLIENTE ═══ */
function cobAbrirFicha(key) {
  cobFichaKey = key;
  document.getElementById('cob-ficha')?.classList.add('open');
  document.getElementById('cob-ficha-ov')?.classList.add('open');
  cobFichaGestiones = [];
  if (cobFichaUnsub) { try { cobFichaUnsub(); } catch(e) {} }
  cobFichaUnsub = window._fbCob.listen('cobcrm_gestiones/' + key, m => {
    cobFichaGestiones = Object.entries(m || {}).map(([id, g]) => ({ ...g, _id:id })).sort((a,b) => b.ts - a.ts);
    if (cobFichaKey === key) _cobRenderGestionesFicha();
  });
  cobRenderFicha(true);
}
function cobCerrarFicha() {
  cobFichaKey = null;
  if (cobFichaUnsub) { try { cobFichaUnsub(); } catch(e) {} cobFichaUnsub = null; }
  document.getElementById('cob-ficha')?.classList.remove('open');
  document.getElementById('cob-ficha-ov')?.classList.remove('open');
}

function _cobClienteFicha(key) {
  let a = cobAgg.find(x => x.key === key);
  if (a) return a;
  // Cliente que ya no figura en el corte (p.ej. abierto desde la agenda): ficha sin cuotas
  const crm = cobClientesCRM[key] || {};
  const comp = Object.values(cobCompromisos).find(c => c.clienteKey === key);
  return { key, persona: crm.nombre || comp?.cliente || key, vendedores:new Set(), ventas:new Set(), terrenos:new Set(crm.terrenos || []), terrNorm:new Set((crm.terrenos||[]).map(_cobTerrNorm)),
    cuotasT:0, montoT:0, cuotasA:0, montoA:0, total:0, fMin:null, dias:0, diasHoy:0, tramo:COB_TRAMOS[0], vendedor:'', cuotas:[], fueraDeCorte:true };
}

function cobRenderFicha(primeraVez) {
  if (!cobFichaKey) return;
  const body = document.getElementById('cob-fi-body'); if (!body) return;
  // si el usuario está escribiendo en el formulario, no re-renderizamos todo (no perder lo tipeado)
  if (!primeraVez && body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { _cobRenderCompromisosFicha(); return; }
  const a = _cobClienteFicha(cobFichaKey);
  const e = _cobEnriquecer(a);
  const crm = e.crm;
  document.getElementById('cob-fi-nombre').textContent = a.persona;
  document.getElementById('cob-fi-sub').innerHTML = a.fueraDeCorte ? `<span class="cob-chip ok">No figura en el corte ${_cobCorteNom(cobCorteSel)} — sin cuotas pendientes</span>` :
    `Vendedor: ${esc(a.vendedor||'—')} · Ventas ${[...a.ventas].join(', ')} · ${[...a.terrenos].map(esc).join(' · ')}`;
  const tel = (crm.telefono||'').replace(/\D/g,'');
  const telWa = tel.length === 8 ? '591' + tel : tel;
  const detalleWa = [a.cuotasT ? `${a.cuotasT} cuota(s) de terreno por ${_cobUSD2(a.montoT)}` : '', a.cuotasA ? `${a.cuotasA} cuota(s) de acción por ${_cobUSD2(a.montoA)}` : ''].filter(Boolean).join(' y ');
  const msgWa = encodeURIComponent(`Estimado/a ${a.persona.split(' ')[0]}, le saludamos de Urubó Village. Le recordamos que a la fecha tiene pendiente ${detalleWa || 'un saldo'} (total ${_cobUSD2(a.total)}). ¿Podemos coordinar la fecha de su pago? Muchas gracias.`);
  const opts = (arr, cur) => arr.map(x => `<option ${x===cur?'selected':''}>${esc(x)}</option>`).join('');
  const resps = _cobResponsables();

  // historial de deuda por corte
  const hist = Object.keys(cobCortes).sort().map(id => ({ id, v: cobCortes[id].porCliente?.[a.key] })).slice(-12);
  const maxH = Math.max(1, ...hist.map(h => h.v ? h.v[0] : 0));

  // cuotas agrupadas por venta
  const porVenta = {};
  a.cuotas.forEach(q => { (porVenta[q.v + '|' + q.t] ||= []).push(q); });
  const fc = cobCortes[cobCorteSel]?.fecha || _cobHoy();

  body.innerHTML = `
    <div class="cob-fi-kpis">
      <div><span>Total pendiente</span><b>${_cobUSD2(a.total)}</b></div>
      <div><span>Terreno · ${a.cuotasT} cuotas</span><b>${_cobUSD2(a.montoT)}</b></div>
      <div><span>Acción · ${a.cuotasA} cuotas</span><b>${_cobUSD2(a.montoA)}</b></div>
      <div><span>Días mora al corte / hoy</span><b style="color:${COB_TRAMO_COLOR[a.tramo.id]}">${a.dias} / ${a.diasHoy}</b></div>
    </div>
    ${e.postPago.total ? `<div class="cob-aviso ok">💚 Orange registra <b>${_cobUSD2(e.postPago.total)}</b> pagados después del corte: ${e.postPago.filas.slice(0,6).map(r => `${esc(r.fecha)} ${esc(r.tipoPago)} ${_cobUSD2(r.monto)}`).join(' · ')}${e.postPago.filas.length > 6 ? ' …' : ''}</div>` : ''}

    <div class="cob-fi-sec">
      <div class="cob-fi-h">Contacto y asignación</div>
      <div class="cob-fi-grid">
        <label>Teléfono<input id="cob-fi-tel" value="${esc(crm.telefono||'')}" placeholder="7xxxxxxx"/></label>
        <label>Teléfono 2<input id="cob-fi-tel2" value="${esc(crm.telefono2||'')}"/></label>
        <label>Email<input id="cob-fi-mail" value="${esc(crm.email||'')}"/></label>
        <label>Responsable<select id="cob-fi-resp"><option value="">— Sin asignar —</option>${opts(resps, crm.responsable)}</select></label>
        <label>Estado de gestión<select id="cob-fi-est">${opts(COB_ESTADOS, e.estado)}</select></label>
        <label>Prioridad<select id="cob-fi-prio">${opts(['Normal','Alta','Baja'], crm.prioridad || 'Normal')}</select></label>
        <label class="full">Nota fija del cliente (acuerdos, referencias, mejor horario…)<textarea id="cob-fi-nota" rows="2">${esc(crm.nota||'')}</textarea></label>
      </div>
      <div class="cob-fi-acts">
        <button class="btn-primary btn-sm" onclick="cobGuardarFichaCRM()">💾 Guardar ficha</button>
        ${tel ? `<a class="btn-secondary btn-sm" href="tel:${tel}">📞 Llamar</a><a class="btn-secondary btn-sm" target="_blank" rel="noopener" href="https://wa.me/${telWa}?text=${msgWa}">💬 WhatsApp con recordatorio</a>` : '<span class="cob-mini">Cargá un teléfono para habilitar llamar / WhatsApp.</span>'}
        ${crm.email ? `<a class="btn-secondary btn-sm" href="mailto:${esc(crm.email)}?subject=${encodeURIComponent('Urubó Village — recordatorio de pago')}&body=${msgWa}">✉ Email</a>` : ''}
      </div>
      ${crm.actualizadoPor ? `<div class="cob-mini" style="margin-top:6px;">Ficha modificada por ${esc(crm.actualizadoPor)} el ${new Date(crm.actualizadoTs).toLocaleString('es-BO')}</div>` : ''}
    </div>

    <div class="cob-fi-sec cob-fi-reg">
      <div class="cob-fi-h">➕ Registrar gestión de cobranza</div>
      <div class="cob-fi-grid">
        <label>Fecha<input type="date" id="cob-g-fecha" value="${_cobHoy()}" max="${_cobHoy()}"/></label>
        <label>Canal<select id="cob-g-canal">${opts(COB_CANALES, 'Llamada')}</select></label>
        <label>Resultado<select id="cob-g-res" onchange="cobSugerirDesdeResultado()">${opts(COB_RESULTADOS, 'Contactado')}</select></label>
        <label class="full">Detalle de la conversación<textarea id="cob-g-nota" rows="2" placeholder="Qué dijo el cliente, qué se acordó…"></textarea></label>
      </div>
      <label class="cob-chk"><input type="checkbox" id="cob-g-conc" onchange="document.getElementById('cob-g-comp').style.display=this.checked?'grid':'none'"/> Programar compromiso / alerta</label>
      <div class="cob-fi-grid" id="cob-g-comp" style="display:none;">
        <label>Tipo<select id="cob-g-ctipo">${opts(COB_TIPOS_COMP, 'Pago')}</select></label>
        <label>Fecha<input type="date" id="cob-g-cfecha" value="${_cobSumarDias(_cobHoy(), 7)}"/></label>
        <label>Monto US$<input type="number" id="cob-g-cmonto" step="0.01" placeholder="0.00"/></label>
        <label>Aplica a<select id="cob-g-capl"><option>Terreno y acción</option><option>Terreno</option><option>Acción</option></select></label>
      </div>
      <button class="btn-primary btn-sm" style="margin-top:8px;" onclick="cobGuardarGestion()">Guardar gestión</button>
    </div>

    <div class="cob-fi-sec"><div class="cob-fi-h">🔔 Compromisos y alertas</div><div id="cob-fi-comps"></div></div>

    <div class="cob-fi-sec">
      <div class="cob-fi-h">Cuotas pendientes al corte (${a.cuotas.length})</div>
      ${a.cuotas.length ? Object.entries(porVenta).map(([k, qs]) => {
        const [v, t] = k.split('|');
        return `<div class="cob-fi-venta"><b>Venta ${esc(v)} · ${t === 'T' ? 'Terreno' : 'Acción'} · ${esc(qs[0].z||'')}</b><span>${qs.length} cuota(s) · ${_cobUSD2(qs.reduce((s,q)=>s+q.m,0))}</span></div>
          <table class="tabla-compacta cob-t"><thead><tr><th>Concepto</th><th>F. programada</th><th class="r">Días</th><th class="r">Monto</th></tr></thead><tbody>
          ${qs.map(q => { const d = _cobDias(q.f, fc); return `<tr><td>${esc(q.c)}</td><td>${_cobF(q.f)}</td><td class="r"><span class="cob-dias" style="--c:${COB_TRAMO_COLOR[_cobTramo(d).id]}">${Math.max(d,0)}</span></td><td class="r">${_cobUSD2(q.m)}</td></tr>`; }).join('')}
          </tbody></table>`;
      }).join('') : '<div class="empty-state" style="padding:14px;">Sin cuotas pendientes en este corte.</div>'}
    </div>

    <div class="cob-fi-sec">
      <div class="cob-fi-h">Evolución de la deuda por corte</div>
      ${hist.length ? `<div class="cob-hist">${hist.map(h => `<div title="${_cobCorteNom(h.id)}: ${h.v ? _cobUSD(h.v[0]) + ' · ' + h.v[1] + ' cuotas · ' + h.v[2] + ' días' : 'no figuraba'}">
        <i style="height:${h.v ? Math.max(4, h.v[0]/maxH*60) : 2}px;background:${h.v ? 'var(--danger)' : 'var(--ok)'}"></i><span>${h.id.slice(5)}/${h.id.slice(2,4)}</span><em>${h.v ? _cobUSD(h.v[0]) : 'al día'}</em></div>`).join('')}</div>` : '<div class="cob-mini">Sin historial.</div>'}
    </div>

    <div class="cob-fi-sec"><div class="cob-fi-h">Bitácora de gestiones</div><div id="cob-fi-gest"></div></div>`;
  _cobRenderCompromisosFicha();
  _cobRenderGestionesFicha();
}

function cobSugerirDesdeResultado() {
  const r = document.getElementById('cob-g-res')?.value;
  if (r === 'Promesa de pago' || r === 'Promesa de avance' || r === 'Solicita reprogramación' || r === 'No contesta' || r === 'Dejó mensaje') {
    const chk = document.getElementById('cob-g-conc'); if (chk && !chk.checked) { chk.checked = true; document.getElementById('cob-g-comp').style.display = 'grid'; }
    const t = document.getElementById('cob-g-ctipo');
    if (t) t.value = r === 'Promesa de avance' ? 'Avance' : (r === 'No contesta' || r === 'Dejó mensaje') ? 'Volver a llamar' : r === 'Solicita reprogramación' ? 'Reunión' : 'Pago';
    if (r === 'No contesta' || r === 'Dejó mensaje') { const f = document.getElementById('cob-g-cfecha'); if (f) f.value = _cobSumarDias(_cobHoy(), 2); }
  }
}

function _cobRenderCompromisosFicha() {
  const box = document.getElementById('cob-fi-comps'); if (!box || !cobFichaKey) return;
  const comps = Object.entries(cobCompromisos).filter(([,c]) => c.clienteKey === cobFichaKey).map(([id,c]) => ({ ...c, _id:id }))
    .sort((a,b) => (a.estado === 'Pendiente' ? 0 : 1) - (b.estado === 'Pendiente' ? 0 : 1) || (a.fecha < b.fecha ? -1 : 1));
  box.innerHTML = comps.length ? comps.map(c => _cobCompItemHTML(c, false)).join('') : '<div class="cob-mini">Sin compromisos. Registrá una gestión con "Programar compromiso" para crear una alerta.</div>';
}

function _cobRenderGestionesFicha() {
  const box = document.getElementById('cob-fi-gest'); if (!box) return;
  box.innerHTML = cobFichaGestiones.length ? cobFichaGestiones.map(g => `
    <div class="gestion-item">
      <div class="gestion-dot" style="background:${COB_ESTADO_COLOR[COB_RESULTADO_ESTADO[g.resultado]] || '#98A2B3'}"></div>
      <div class="gestion-content">
        <div class="gestion-estado">${esc(g.canal)} · ${esc(g.resultado)}${g.compromiso ? ` <span class="cob-chip i">→ ${esc(g.compromiso.tipo)} ${_cobFc(g.compromiso.fecha)}${g.compromiso.monto ? ' ' + _cobUSD(g.compromiso.monto) : ''}</span>` : ''}</div>
        ${g.nota ? `<div class="gestion-nota">${esc(g.nota)}</div>` : ''}
        <div class="gestion-meta">${_cobF(g.fecha)} · ${esc(g.autor||'—')} · deuda en ese momento ${_cobUSD(g.deuda)}${g.estadoNuevo ? ' · estado → ' + esc(g.estadoNuevo) : ''}</div>
      </div>
    </div>`).join('') : '<div class="cob-mini">Todavía no hay gestiones registradas para este cliente.</div>';
}

async function cobGuardarFichaCRM() {
  if (!cobFichaKey) return;
  const a = _cobClienteFicha(cobFichaKey);
  const val = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    nombre: a.persona, telefono: val('cob-fi-tel'), telefono2: val('cob-fi-tel2'), email: val('cob-fi-mail'),
    responsable: val('cob-fi-resp'), estado: val('cob-fi-est'), prioridad: val('cob-fi-prio'), nota: val('cob-fi-nota'),
    terrenos: [...a.terrenos], actualizadoPor: _cobUsuario(), actualizadoTs: Date.now(),
  };
  const ant = cobClientesCRM[cobFichaKey] || {};
  const cambios = ['responsable','estado','prioridad','telefono'].filter(k => (ant[k]||'') !== (data[k]||'') && (ant[k] || data[k]));
  try {
    await window._fbCob.update('cobcrm_clientes/' + cobFichaKey, data);
    if (cambios.length && ant.nombre) {
      await window._fbCob.push('cobcrm_gestiones/' + cobFichaKey, { ts: Date.now(), fecha: _cobHoy(), canal: 'Sistema', resultado: 'Ficha actualizada',
        nota: cambios.map(k => `${k}: "${ant[k]||'—'}" → "${data[k]||'—'}"`).join(' · '), autor: _cobUsuario(), deuda: a.total, corte: cobCorteSel });
    }
    toastOk('Ficha guardada.');
  } catch(err) { console.error(err); toastErr('No se pudo guardar la ficha.'); }
}

async function cobGuardarGestion() {
  if (!cobFichaKey) return;
  const a = _cobClienteFicha(cobFichaKey);
  const val = id => (document.getElementById(id)?.value || '').trim();
  const fecha = val('cob-g-fecha') || _cobHoy();
  const canal = val('cob-g-canal'), resultado = val('cob-g-res'), nota = val('cob-g-nota');
  if (!nota && !['No contesta','Dejó mensaje'].includes(resultado)) { toastErr('Escribí un detalle de la gestión.'); document.getElementById('cob-g-nota')?.focus(); return; }
  const conComp = document.getElementById('cob-g-conc')?.checked;
  let comp = null;
  if (conComp) {
    comp = { tipo: val('cob-g-ctipo'), fecha: val('cob-g-cfecha'), monto: _cobNum(val('cob-g-cmonto')), aplica: val('cob-g-capl') };
    if (!comp.fecha) { toastErr('Elegí la fecha del compromiso.'); return; }
    if (comp.fecha < _cobHoy()) { toastErr('La fecha del compromiso no puede ser anterior a hoy.'); return; }
    if ((comp.tipo === 'Pago' || comp.tipo === 'Avance') && !comp.monto) { toastErr('Indicá el monto comprometido.'); return; }
    if (comp.monto > a.total * 1.05 && a.total > 0) { const ok = await confirmDialog(`El monto comprometido (${_cobUSD2(comp.monto)}) es mayor a la deuda al corte (${_cobUSD2(a.total)}). ¿Guardar igual?`, { title:'Revisá el monto', okText:'Guardar', positive:true, icon:'!' }); if (!ok) return; }
  }
  const crmAnt = cobClientesCRM[cobFichaKey] || {};
  const estadoSug = COB_RESULTADO_ESTADO[resultado];
  const estadoNuevo = estadoSug && estadoSug !== (crmAnt.estado || 'Sin gestionar') ? estadoSug : null;
  const autor = _cobUsuario(), ts = Date.now();
  try {
    let compId = null;
    if (comp) {
      compId = await window._fbCob.push('cobcrm_compromisos', {
        clienteKey: cobFichaKey, cliente: a.persona, tipo: comp.tipo, fecha: comp.fecha, monto: comp.monto || 0, aplica: comp.aplica,
        nota, estado: 'Pendiente', responsable: crmAnt.responsable || autor, creadoPor: autor, ts, deudaAlCrear: a.total, corte: cobCorteSel,
        terrenos: [...a.terrenos],
      });
    }
    const gest = { ts, fecha, canal, resultado, nota, autor, deuda: a.total, corte: cobCorteSel || '' };
    if (comp) gest.compromiso = { ...comp, id: compId };
    if (estadoNuevo) gest.estadoNuevo = estadoNuevo;
    await window._fbCob.push('cobcrm_gestiones/' + cobFichaKey, gest);
    const upd = { nombre: a.persona, terrenos: [...a.terrenos], ultimaGestion: { ts, fecha, canal, resultado, autor, nota: nota.slice(0,140) }, gestionesN: (crmAnt.gestionesN || 0) + 1 };
    if (estadoNuevo) upd.estado = estadoNuevo;
    if (!crmAnt.responsable) upd.responsable = autor;
    await window._fbCob.update('cobcrm_clientes/' + cobFichaKey, upd);
    if (cobGestionesTodas) (cobGestionesTodas[cobFichaKey] ||= {})['local' + ts] = gest;
    toastOk('Gestión registrada' + (comp ? ' y alerta programada para el ' + _cobF(comp.fecha) : '') + '.');
    cobRenderFicha(true);
  } catch(err) { console.error(err); toastErr('No se pudo guardar la gestión.'); }
}

/* ═══ COMPROMISOS ═══ */
function _cobCompDeteccion(c) {
  // ¿Orange registra un pago de este cliente desde que se creó el compromiso?
  if (c.estado !== 'Pendiente' || !(c.tipo === 'Pago' || c.tipo === 'Avance')) return null;
  const a = cobAgg.find(x => x.key === c.clienteKey) || _cobClienteFicha(c.clienteKey);
  const desde = new Date(c.ts); const iso = desde.getFullYear()+'-'+_cobPad(desde.getMonth()+1)+'-'+_cobPad(desde.getDate());
  const pp = _cobPagosPostCorte(a, iso);
  const fueraLista = cobCorteSel && cobCortes[cobCorteSel]?.fecha >= iso && !cobAgg.some(x => x.key === c.clienteKey);
  return { pago: pp.total, filas: pp.filas, fueraLista };
}

function _cobCompItemHTML(c, conCliente) {
  const hoy = _cobHoy();
  const pend = c.estado === 'Pendiente';
  const cls = !pend ? (c.estado === 'Cumplido' ? 'ok' : c.estado === 'Incumplido' ? 'd' : 'n') : c.fecha < hoy ? 'd' : c.fecha === hoy ? 'w' : 'i';
  const det = _cobCompDeteccion(c);
  const dias = _cobDias(hoy, c.fecha);
  const cuando = !pend ? c.estado : dias < 0 ? `vencido hace ${-dias} d` : dias === 0 ? 'HOY' : `en ${dias} d`;
  const a = conCliente ? cobAgg.find(x => x.key === c.clienteKey) : null;
  return `<div class="cob-comp ${cls}">
    <div class="cob-comp-f"><b>${_cobFc(c.fecha)}</b><span>${cuando}</span></div>
    <div class="cob-comp-b">
      <div>${conCliente ? `<a class="cob-lnk" onclick="cobAbrirFicha('${c.clienteKey}')">${esc(c.cliente)}</a> · ` : ''}<b>${esc(c.tipo)}</b>${c.monto ? ' ' + _cobUSD2(c.monto) : ''}${c.aplica && c.aplica !== 'Terreno y acción' ? ' · ' + esc(c.aplica) : ''}
        ${conCliente ? `<span class="cob-mini"> · deuda actual ${a ? _cobUSD(a.total) : '<b style="color:var(--ok-ink)">ya no figura</b>'}</span>` : ''}</div>
      ${c.nota ? `<div class="cob-mini">${esc(c.nota)}</div>` : ''}
      <div class="cob-mini">Resp.: ${esc(c.responsable||'—')} · creado por ${esc(c.creadoPor||'—')} el ${new Date(c.ts).toLocaleDateString('es-BO')}${(c.reprogramaciones||[]).length ? ` · reprogramado ${c.reprogramaciones.length} vez/veces` : ''}${!pend && c.resueltoPor ? ` · cerrado por ${esc(c.resueltoPor)}${c.resolucionNota ? ': ' + esc(c.resolucionNota) : ''}` : ''}</div>
      ${det && det.pago ? `<div class="cob-det">💚 Orange registra ${_cobUSD2(det.pago)} pagados desde que se creó el compromiso (${det.filas.slice(0,3).map(r => esc(r.fecha) + ' ' + _cobUSD(r.monto)).join(', ')})</div>` : ''}
      ${det && !det.pago && det.fueraLista ? `<div class="cob-det">💚 El cliente ya no figura en el corte ${_cobCorteNom(cobCorteSel)} — probablemente pagó.</div>` : ''}
    </div>
    ${pend ? `<div class="cob-comp-a">
      <button class="cob-ab ok" onclick="cobResolverComp('${c._id}','Cumplido')" title="Cumplido">✔</button>
      <button class="cob-ab d" onclick="cobResolverComp('${c._id}','Incumplido')" title="Incumplido">✖</button>
      <button class="cob-ab" onclick="cobReprogramarComp('${c._id}')" title="Reprogramar">📅</button>
      <button class="cob-ab" onclick="cobResolverComp('${c._id}','Cancelado')" title="Cancelar">⊘</button>
    </div>` : ''}
  </div>`;
}

function cobAbrirModal(html) { document.getElementById('cob-modal-box').innerHTML = html; document.getElementById('cob-modal').classList.add('open'); }
function cobCerrarModal() { document.getElementById('cob-modal')?.classList.remove('open'); }

function cobResolverComp(id, estado) {
  const c = cobCompromisos[id]; if (!c) return;
  const det = _cobCompDeteccion({ ...c, _id:id });
  const sug = estado === 'Cumplido' && det?.pago ? `Pago detectado en Orange: ${_cobUSD2(det.pago)}` : '';
  cobAbrirModal(`
    <h3>${estado === 'Cumplido' ? '✔ Marcar cumplido' : estado === 'Incumplido' ? '✖ Marcar incumplido' : '⊘ Cancelar compromiso'}</h3>
    <p>${esc(c.cliente)} · ${esc(c.tipo)} ${c.monto ? _cobUSD2(c.monto) : ''} · ${_cobF(c.fecha)}</p>
    ${estado === 'Cumplido' ? `<label>Monto efectivamente pagado US$<input type="number" step="0.01" id="cob-m-monto" value="${det?.pago ? det.pago.toFixed(2) : (c.monto || '')}"/></label>` : ''}
    <label>Comentario<textarea id="cob-m-nota" rows="2">${esc(sug)}</textarea></label>
    ${estado === 'Incumplido' ? `<label class="cob-chk"><input type="checkbox" id="cob-m-sig" checked/> Crear una alerta "Volver a llamar" para mañana</label>` : ''}
    <div class="cob-modal-acts"><button class="btn-secondary btn-sm" onclick="cobCerrarModal()">Volver</button><button class="btn-primary btn-sm" onclick="cobConfirmarResolucion('${id}','${estado}')">Confirmar</button></div>`);
}

async function cobConfirmarResolucion(id, estado) {
  const c = cobCompromisos[id]; if (!c) return;
  const nota = (document.getElementById('cob-m-nota')?.value || '').trim();
  const montoPag = _cobNum(document.getElementById('cob-m-monto')?.value);
  const sig = document.getElementById('cob-m-sig')?.checked;
  const autor = _cobUsuario(), ts = Date.now();
  try {
    const upd = { estado, resueltoPor: autor, resueltoTs: ts, resolucionNota: nota };
    if (estado === 'Cumplido') upd.montoPagado = montoPag || 0;
    await window._fbCob.update('cobcrm_compromisos/' + id, upd);
    await window._fbCob.push('cobcrm_gestiones/' + c.clienteKey, { ts, fecha: _cobHoy(), canal: 'Sistema', resultado: `Compromiso ${estado.toLowerCase()}`,
      nota: `${c.tipo} ${c.monto ? _cobUSD2(c.monto) : ''} del ${_cobF(c.fecha)}${estado === 'Cumplido' && montoPag ? ' · pagado ' + _cobUSD2(montoPag) : ''}${nota ? ' · ' + nota : ''}`, autor, deuda: cobAgg.find(x => x.key === c.clienteKey)?.total || 0, corte: cobCorteSel || '' });
    if (estado === 'Incumplido' && sig) {
      await window._fbCob.push('cobcrm_compromisos', { clienteKey: c.clienteKey, cliente: c.cliente, tipo: 'Volver a llamar', fecha: _cobSumarDias(_cobHoy(), 1), monto: 0,
        nota: `Seguimiento por compromiso incumplido del ${_cobF(c.fecha)}`, estado: 'Pendiente', responsable: c.responsable || autor, creadoPor: autor, ts: ts + 1, terrenos: c.terrenos || [] });
    }
    if (estado === 'Incumplido') {
      const crm = cobClientesCRM[c.clienteKey] || {};
      await window._fbCob.update('cobcrm_clientes/' + c.clienteKey, { promesasRotas: (crm.promesasRotas || 0) + 1 });
    }
    cobCerrarModal(); toastOk('Compromiso marcado como ' + estado.toLowerCase() + '.');
  } catch(err) { console.error(err); toastErr('No se pudo actualizar el compromiso.'); }
}

function cobReprogramarComp(id) {
  const c = cobCompromisos[id]; if (!c) return;
  cobAbrirModal(`
    <h3>📅 Reprogramar compromiso</h3>
    <p>${esc(c.cliente)} · ${esc(c.tipo)} · fecha actual ${_cobF(c.fecha)}</p>
    <label>Nueva fecha<input type="date" id="cob-m-fecha" min="${_cobHoy()}" value="${_cobSumarDias(_cobHoy() > c.fecha ? _cobHoy() : c.fecha, 7)}"/></label>
    <label>Monto US$<input type="number" step="0.01" id="cob-m-monto" value="${c.monto || ''}"/></label>
    <label>Motivo<textarea id="cob-m-nota" rows="2" placeholder="Por qué se mueve la fecha"></textarea></label>
    <div class="cob-modal-acts"><button class="btn-secondary btn-sm" onclick="cobCerrarModal()">Volver</button><button class="btn-primary btn-sm" onclick="cobConfirmarReprogramacion('${id}')">Guardar</button></div>`);
}
async function cobConfirmarReprogramacion(id) {
  const c = cobCompromisos[id]; if (!c) return;
  const fecha = document.getElementById('cob-m-fecha')?.value, monto = _cobNum(document.getElementById('cob-m-monto')?.value);
  const nota = (document.getElementById('cob-m-nota')?.value || '').trim();
  if (!fecha || fecha < _cobHoy()) { toastErr('Elegí una fecha desde hoy en adelante.'); return; }
  if (!nota) { toastErr('Indicá el motivo de la reprogramación.'); return; }
  const autor = _cobUsuario(), ts = Date.now();
  const reps = [...(c.reprogramaciones || []), { de: c.fecha, a: fecha, montoAnt: c.monto || 0, motivo: nota, por: autor, ts }];
  try {
    await window._fbCob.update('cobcrm_compromisos/' + id, { fecha, monto, reprogramaciones: reps });
    await window._fbCob.push('cobcrm_gestiones/' + c.clienteKey, { ts, fecha: _cobHoy(), canal: 'Sistema', resultado: 'Compromiso reprogramado',
      nota: `${c.tipo}: ${_cobF(c.fecha)} → ${_cobF(fecha)}${monto !== c.monto ? ` · monto ${_cobUSD2(c.monto)} → ${_cobUSD2(monto)}` : ''} · ${nota}`, autor, deuda: cobAgg.find(x => x.key === c.clienteKey)?.total || 0, corte: cobCorteSel || '' });
    cobCerrarModal(); toastOk('Compromiso reprogramado al ' + _cobF(fecha) + '.');
  } catch(err) { console.error(err); toastErr('No se pudo reprogramar.'); }
}

/* ═══ AGENDA ═══ */
function cobRenderAgenda() {
  const box = document.getElementById('cob-agenda'); if (!box) return;
  const resp = document.getElementById('cob-ag-resp')?.value || '', tipo = document.getElementById('cob-ag-tipo')?.value || '';
  const yo = _cobUsuario();
  const all = Object.entries(cobCompromisos).map(([id,c]) => ({ ...c, _id:id }))
    .filter(c => (!resp || (resp === '__yo' ? c.responsable === yo : c.responsable === resp)) && (!tipo || c.tipo === tipo));
  const hoy = _cobHoy(), en7 = _cobSumarDias(hoy, 7);
  const pend = all.filter(c => c.estado === 'Pendiente').sort((a,b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  const grupos = [
    { t:'🔴 Vencidos sin cerrar', d:'Ya pasó la fecha: confirmá si pagó (✔) o no (✖), o reprogramá.', l: pend.filter(c => c.fecha < hoy) },
    { t:'🟠 Para hoy', d:'', l: pend.filter(c => c.fecha === hoy) },
    { t:'🔵 Próximos 7 días', d:'', l: pend.filter(c => c.fecha > hoy && c.fecha <= en7) },
    { t:'⚪ Más adelante', d:'', l: pend.filter(c => c.fecha > en7) },
  ];
  const hace30 = Date.now() - 30*86400000;
  const resueltos = all.filter(c => c.estado !== 'Pendiente' && (c.resueltoTs||0) >= hace30).sort((a,b) => b.resueltoTs - a.resueltoTs);
  const montoGrupo = l => l.filter(c => c.tipo === 'Pago' || c.tipo === 'Avance').reduce((s,c) => s + (c.monto||0), 0);
  box.innerHTML = grupos.map(g => `
    <div class="cob-ag-g">
      <div class="cob-ag-h">${g.t} <span>${g.l.length}</span>${montoGrupo(g.l) ? `<em>${_cobUSD(montoGrupo(g.l))} comprometidos</em>` : ''}</div>
      ${g.d && g.l.length ? `<div class="cob-mini" style="margin:-2px 0 6px;">${g.d}</div>` : ''}
      ${g.l.length ? g.l.map(c => _cobCompItemHTML(c, true)).join('') : '<div class="cob-mini" style="padding:4px 0 8px;">Nada.</div>'}
    </div>`).join('') + `
    <details class="cob-ag-g"><summary class="cob-ag-h" style="cursor:pointer;">✅ Cerrados en los últimos 30 días <span>${resueltos.length}</span></summary>
      ${resueltos.map(c => _cobCompItemHTML(c, true)).join('') || '<div class="cob-mini">Nada.</div>'}
    </details>`;
}

/* ═══ INDICADORES ═══ */
function cobRenderIndicadores() {
  const box = document.getElementById('cob-ind'); if (!box) return;
  if (!cobCorteSel) { box.innerHTML = '<div class="empty-state">Cargá un corte para ver indicadores.</div>'; return; }
  const tot = cobAgg.reduce((s,a) => s + a.total, 0) || 1;
  const pct = v => (v*100/tot).toFixed(1) + '%';
  // tramos
  const tr = COB_TRAMOS.map(t => { const l = cobAgg.filter(a => a.tramo.id === t.id); return { t, n:l.length, q: l.reduce((s,a)=>s+a.cuotasT+a.cuotasA,0), T: l.reduce((s,a)=>s+a.montoT,0), A: l.reduce((s,a)=>s+a.montoA,0), tot: l.reduce((s,a)=>s+a.total,0) }; });
  // por vendedor
  // por vendedor: se reparte cuota por cuota (un cliente con ventas de 2 vendedores suma a cada uno lo suyo)
  const pv = {}; const diasCli = Object.fromEntries(cobAgg.map(a => [a.key, a.dias]));
  cobCuotas.forEach(q => { const v = q.s || '—'; const o = pv[v] ||= { cl:new Set(), T:0, A:0, tot:0 }; o.cl.add(_cobKey(q.p)); if (q.t === 'T') o.T += q.m; else o.A += q.m; o.tot += q.m; });
  const pvL = Object.entries(pv).map(([v,o]) => [v, { n:o.cl.size, T:o.T, A:o.A, tot:o.tot, dias:[...o.cl].reduce((s,k) => s + (diasCli[k]||0), 0) }]).sort((x,y) => y[1].tot - x[1].tot);
  // por estado de gestión
  const pe = {}; cobAgg.forEach(a => { const e = (cobClientesCRM[a.key]?.estado) || 'Sin gestionar'; const o = pe[e] ||= { n:0, tot:0 }; o.n++; o.tot += a.total; });
  // por responsable
  const hace30 = Date.now() - 30*86400000;
  const pr = {};
  cobAgg.forEach(a => { const r = cobClientesCRM[a.key]?.responsable || '— Sin asignar —'; const o = pr[r] ||= { n:0, tot:0, g30:0, cP:0, cC:0, cI:0, pagado:0 }; o.n++; o.tot += a.total; });
  if (cobGestionesTodas) Object.values(cobGestionesTodas).forEach(gs => Object.values(gs || {}).forEach(g => { if (g.canal === 'Sistema' || g.ts < hace30) return; const o = pr[g.autor] ||= { n:0, tot:0, g30:0, cP:0, cC:0, cI:0, pagado:0 }; o.g30++; }));
  const comps = Object.values(cobCompromisos).filter(c => c.tipo === 'Pago' || c.tipo === 'Avance');
  comps.forEach(c => { const o = pr[c.responsable || '— Sin asignar —'] ||= { n:0, tot:0, g30:0, cP:0, cC:0, cI:0, pagado:0 }; if (c.estado === 'Pendiente') o.cP++; if (c.estado === 'Cumplido') { o.cC++; o.pagado += c.montoPagado || 0; } if (c.estado === 'Incumplido') o.cI++; });
  const cC = comps.filter(c => c.estado === 'Cumplido').length, cI = comps.filter(c => c.estado === 'Incumplido').length;
  // evolución por corte
  const ev = Object.keys(cobCortes).sort();
  const cortesT = ev.map(id => { const c = cobCortes[id]; return `<tr${id === cobCorteSel ? ' class="tot"' : ''}><td>${_cobCorteNom(id)}</td><td>${_cobF(c.fecha)}</td><td class="r">${c.clientes}</td><td class="r">${c.cuotasT}</td><td class="r">${_cobUSD(c.totalT)}</td><td class="r">${c.cuotasA}</td><td class="r">${_cobUSD(c.totalA)}</td><td class="r"><b>${_cobUSD(c.total)}</b></td><td class="r">${c.recuperado != null ? _cobUSD(c.recuperado) : '—'}</td><td class="r">${c.nuevos ?? '—'}</td><td class="r">${c.salieron ?? '—'}</td></tr>`; }).join('');
  const maxEv = Math.max(1, ...ev.map(id => cobCortes[id].total));

  box.innerHTML = `
    <div class="cob-ind-g">
      <div class="cob-card">
        <h4 class="cob-h4">Antigüedad de la mora (al ${_cobF(cobCortes[cobCorteSel].fecha)})</h4>
        <div class="cob-barra">${tr.filter(x => x.tot).map(x => `<i style="flex:${x.tot};background:${COB_TRAMO_COLOR[x.t.id]}" title="${x.t.lbl}: ${_cobUSD(x.tot)}"></i>`).join('')}</div>
        <table class="tabla-compacta cob-t"><thead><tr><th>Tramo</th><th class="r">Clientes</th><th class="r">Cuotas</th><th class="r">Terreno</th><th class="r">Acción</th><th class="r">Total</th><th class="r">%</th></tr></thead><tbody>
        ${tr.map(x => `<tr class="cob-row" onclick="cobIrLista('cob-f-tramo','${x.t.id}')"><td><span class="dir-dot" style="background:${COB_TRAMO_COLOR[x.t.id]}"></span>${x.t.lbl}</td><td class="r">${x.n}</td><td class="r">${x.q}</td><td class="r">${_cobUSD(x.T)}</td><td class="r">${_cobUSD(x.A)}</td><td class="r"><b>${_cobUSD(x.tot)}</b></td><td class="r">${pct(x.tot)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="r">${cobAgg.length}</td><td class="r">${tr.reduce((s,x)=>s+x.q,0)}</td><td class="r">${_cobUSD(tr.reduce((s,x)=>s+x.T,0))}</td><td class="r">${_cobUSD(tr.reduce((s,x)=>s+x.A,0))}</td><td class="r">${_cobUSD(tot)}</td><td class="r">100%</td></tr>
        </tbody></table>
      </div>
      <div class="cob-card">
        <h4 class="cob-h4">Estado de la gestión</h4>
        <table class="tabla-compacta cob-t"><thead><tr><th>Estado</th><th class="r">Clientes</th><th class="r">Deuda</th><th class="r">%</th></tr></thead><tbody>
        ${COB_ESTADOS.filter(e => pe[e]).map(e => `<tr class="cob-row" onclick="cobIrLista('cob-f-estado','${esc(e)}')"><td><span class="cob-est" style="--c:${COB_ESTADO_COLOR[e]}">${esc(e)}</span></td><td class="r">${pe[e].n}</td><td class="r">${_cobUSD(pe[e].tot)}</td><td class="r">${pct(pe[e].tot)}</td></tr>`).join('')}
        </tbody></table>
        <h4 class="cob-h4" style="margin-top:14px;">Promesas de pago / avance</h4>
        <div class="cob-mini-kpis">
          <div><span>Pendientes</span><b>${comps.filter(c => c.estado === 'Pendiente').length}</b></div>
          <div><span>Cumplidas</span><b>${cC}</b></div>
          <div><span>Incumplidas</span><b>${cI}</b></div>
          <div><span>% cumplimiento</span><b>${cC + cI ? Math.round(cC*100/(cC+cI)) + '%' : '—'}</b></div>
          <div><span>Cobrado por promesas</span><b>${_cobUSD(comps.reduce((s,c) => s + (c.montoPagado||0), 0))}</b></div>
        </div>
      </div>
    </div>
    <div class="cob-card">
      <h4 class="cob-h4">Productividad por responsable de cobranza</h4>
      <table class="tabla-compacta cob-t"><thead><tr><th>Responsable</th><th class="r">Clientes asignados</th><th class="r">Deuda asignada</th><th class="r">Gestiones 30 días</th><th class="r">Promesas pend.</th><th class="r">Cumplidas</th><th class="r">Incumplidas</th><th class="r">% cumpl.</th><th class="r">Cobrado por promesas</th></tr></thead><tbody>
      ${Object.entries(pr).sort((x,y) => y[1].tot - x[1].tot).map(([r,o]) => `<tr><td>${esc(r)}</td><td class="r">${o.n}</td><td class="r">${_cobUSD(o.tot)}</td><td class="r">${cobGestionesTodas ? o.g30 : '…'}</td><td class="r">${o.cP}</td><td class="r">${o.cC}</td><td class="r">${o.cI}</td><td class="r">${o.cC+o.cI ? Math.round(o.cC*100/(o.cC+o.cI))+'%' : '—'}</td><td class="r">${_cobUSD(o.pagado)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="cob-card">
      <h4 class="cob-h4">Evolución por corte</h4>
      ${ev.length > 1 ? `<div class="cob-hist" style="margin-bottom:10px;">${ev.slice(-12).map(id => `<div title="${_cobCorteNom(id)}"><i style="height:${Math.max(4, cobCortes[id].total/maxEv*70)}px;background:var(--danger)"></i><span>${id.slice(5)}/${id.slice(2,4)}</span><em>${_cobUSD(cobCortes[id].total)}</em></div>`).join('')}</div>` : ''}
      <table class="tabla-compacta cob-t"><thead><tr><th>Corte</th><th>Fecha</th><th class="r">Clientes</th><th class="r">Cuotas T</th><th class="r">Terreno</th><th class="r">Cuotas A</th><th class="r">Acción</th><th class="r">Total</th><th class="r">Recuperado vs ant.</th><th class="r">Nuevos</th><th class="r">Salieron</th></tr></thead><tbody>${cortesT}</tbody></table>
    </div>
    <div class="cob-card">
      <h4 class="cob-h4">Por vendedor de la venta</h4>
      <table class="tabla-compacta cob-t"><thead><tr><th>Vendedor</th><th class="r">Clientes</th><th class="r">Terreno</th><th class="r">Acción</th><th class="r">Total</th><th class="r">%</th><th class="r">Días mora prom.</th></tr></thead><tbody>
      ${pvL.map(([v,o]) => `<tr class="cob-row" onclick="cobIrLista('cob-f-vend','${esc(v)}')"><td>${esc(v)}</td><td class="r">${o.n}</td><td class="r">${_cobUSD(o.T)}</td><td class="r">${_cobUSD(o.A)}</td><td class="r"><b>${_cobUSD(o.tot)}</b></td><td class="r">${pct(o.tot)}</td><td class="r">${Math.round(o.dias/o.n)}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
}
function cobIrLista(id, val) { cobLimpiarFiltros(); const el = document.getElementById(id); if (el) el.value = val; cobVer('lista'); }

/* ═══ CARGA DEL EXCEL MENSUAL ═══ */
function _cobInitDrop() {
  const dz = document.getElementById('cob-drop'); if (!dz || dz._cobOk) return; dz._cobOk = true;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) cobLeerArchivo(e.dataTransfer.files[0]); });
}

function cobLeerArchivo(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { toastErr('No cargó la librería de Excel. Recargá la página.'); return; }
  const rd = new FileReader();
  rd.onload = ev => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
      cobImportPend = _cobParsear(rows, file.name);
      _cobRenderPreview();
    } catch(err) { console.error(err); toastErr('No se pudo leer el archivo: ' + err.message); }
  };
  rd.readAsArrayBuffer(file);
}

function _cobParsear(rows, archivo) {
  const norm = v => String(v ?? '').replace(/ /g,' ').trim().toLowerCase();
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = (rows[i] || []).map(norm);
    const find = (...ks) => r.findIndex(c => ks.some(k => typeof k === 'string' ? c === k : k.test(c)));
    const m = { venta: find('venta', /^nro\.? ?venta$/), tipo: find(/tipo ?cuota/, 'tipo'), persona: find('persona','cliente',/nombre/), vendedor: find('vendedor','asesor'),
      terreno: find('terreno','lote'), concepto: find('concepto'), fprog: find(/program/, /^f\.? ?venc/, /vencimiento/), monto: find(/pend/, /saldo/, /monto/) };
    if (m.venta > -1 && m.persona > -1 && m.fprog > -1 && m.monto > -1) { hi = i; map = m; break; }
  }
  if (hi < 0) return { error: 'No encontré la fila de encabezados (Venta · Persona · F. Programada · $us Pend). ¿Es el reporte "Cuotas por día" de Orange?', archivo };
  // fecha de corte del encabezado: "Del: 01/05/2015 Al: 30/09/2026"
  let fechaCorte = null, desde = null;
  for (let i = 0; i < hi; i++) {
    const txt = (rows[i] || []).map(c => String(c ?? '')).join(' ').replace(/ /g,' ');
    const m = txt.match(/al:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i); if (m) fechaCorte = _cobFecha(m[1]);
    const d = txt.match(/del:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i); if (d) desde = _cobFecha(d[1]);
  }
  const cuotas = [], descartes = [], vistos = {};
  let dup = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every(c => c == null || String(c).trim() === '')) continue;
    const g = k => map[k] > -1 ? r[map[k]] : null;
    const persona = String(g('persona') ?? '').replace(/ /g,' ').replace(/\s+/g,' ').trim();
    const ventaRaw = String(g('venta') ?? '').replace(/ /g,' ').trim();
    const f = _cobFecha(g('fprog'));
    const m = Math.round(_cobNum(g('monto')) * 100) / 100;
    if (/total/i.test(ventaRaw) || /total/i.test(persona)) { descartes.push({ fila:i+1, motivo:'Fila de total / subtotal' }); continue; }
    if (!ventaRaw || !persona) { descartes.push({ fila:i+1, motivo:'Sin venta o sin persona' }); continue; }
    if (!f) { descartes.push({ fila:i+1, motivo:'Fecha programada inválida: ' + String(g('fprog')) }); continue; }
    if (!(m > 0)) { descartes.push({ fila:i+1, motivo:'Monto pendiente 0 o inválido: ' + String(g('monto')) }); continue; }
    const tipoTxt = norm(g('tipo'));
    const conc = String(g('concepto') ?? '');
    const t = tipoTxt.includes('acc') || /venta de acci/i.test(conc) ? 'A' : 'T';
    const z = String(g('terreno') ?? '').replace(/ /g,' ').trim().replace(/-{2,}/g,'-');
    const q = { v: ventaRaw.replace(/\.0+$/,''), t, p: persona, s: String(g('vendedor') ?? '').replace(/ /g,' ').trim(), z, c: _cobConceptoCorto(conc), f, m };
    const id = [q.v, q.t, q.c, q.f, q.m].join('|');
    if (vistos[id]) dup++;
    vistos[id] = 1;
    cuotas.push(q);
  }
  if (!fechaCorte && cuotas.length) {
    // sin encabezado: proponemos fin del mes de la cuota más reciente
    const max = cuotas.reduce((s,q) => q.f > s ? q.f : s, '');
    const [y,mm] = max.split('-').map(Number); fechaCorte = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0,10);
  }
  return { archivo, fechaCorte, fechaDetectada: !!fechaCorte, desde, cuotas, descartes, dup, encabezadoFila: hi + 1 };
}

function _cobResumenCorte(cuotas, fecha) {
  const agg = _cobAgrupar(cuotas, fecha);
  const porCliente = {};
  agg.forEach(a => { porCliente[a.key] = [Math.round(a.total*100)/100, a.cuotasT + a.cuotasA, a.dias]; });
  const sum = f => Math.round(cuotas.reduce((s,q) => s + f(q), 0) * 100) / 100;
  return { agg, porCliente,
    total: sum(q => q.m), totalT: sum(q => q.t === 'T' ? q.m : 0), totalA: sum(q => q.t === 'A' ? q.m : 0),
    cuotasT: cuotas.filter(q => q.t === 'T').length, cuotasA: cuotas.filter(q => q.t === 'A').length, clientes: agg.length };
}

async function _cobComparar(cuotas, fecha, idNuevo) {
  const res = _cobResumenCorte(cuotas, fecha);
  const prevId = Object.keys(cobCortes).filter(id => id < idNuevo).sort().pop() || null;
  const out = { ...res, prevId, nuevos:[], salieron:[], empeoraron:[], mejoraron:[], recuperado:null };
  if (!prevId) return out;
  if (!cobCacheCuotas[prevId]) { try { const arr = await window._fbCob.get('cobcrm_cuotas/' + prevId); cobCacheCuotas[prevId] = Array.isArray(arr) ? arr : Object.values(arr || {}); } catch(e) { cobCacheCuotas[prevId] = []; } }
  const prevPC = cobCortes[prevId].porCliente || {};
  Object.entries(res.porCliente).forEach(([k, v]) => {
    const p = prevPC[k];
    const nom = res.agg.find(a => a.key === k)?.persona || k;
    if (!p) out.nuevos.push({ k, nom, total: v[0] });
    else if (v[0] > p[0] + 1) out.empeoraron.push({ k, nom, de: p[0], a: v[0] });
    else if (v[0] < p[0] - 1) out.mejoraron.push({ k, nom, de: p[0], a: v[0] });
  });
  const prevAgg = _cobAgrupar(cobCacheCuotas[prevId], cobCortes[prevId].fecha);
  Object.entries(prevPC).forEach(([k, p]) => { if (!res.porCliente[k]) out.salieron.push({ k, nom: prevAgg.find(a => a.key === k)?.persona || cobClientesCRM[k]?.nombre || k, total: p[0] }); });
  // Recuperado: lo que dejó de estar pendiente de las cuotas del corte anterior
  const idQ = q => [q.v, q.t, q.c, q.f].join('|');
  const actual = {}; cuotas.forEach(q => { actual[idQ(q)] = (actual[idQ(q)] || 0) + q.m; });
  const prevMap = {}; cobCacheCuotas[prevId].forEach(q => { prevMap[idQ(q)] = (prevMap[idQ(q)] || 0) + q.m; });
  out.recuperado = Math.round(Object.entries(prevMap).reduce((s, [id, m]) => s + Math.max(0, m - (actual[id] || 0)), 0) * 100) / 100;
  return out;
}

async function _cobRenderPreview() {
  const box = document.getElementById('cob-preview'); if (!box) return;
  const p = cobImportPend;
  if (!p) { box.innerHTML = ''; return; }
  if (p.error) { box.innerHTML = `<div class="cob-aviso d">⚠️ ${esc(p.error)}</div>`; return; }
  if (!p.cuotas.length) { box.innerHTML = `<div class="cob-aviso d">⚠️ El archivo no tiene cuotas válidas. ${p.descartes.length} filas descartadas.</div>`; return; }
  const fecha = p.fechaCorte;
  const id = fecha.slice(0,7);
  box.innerHTML = '<div class="loading-spin"><div class="spinner"></div><br>Comparando con el corte anterior…</div>';
  const cmp = await _cobComparar(p.cuotas, fecha, id);
  p.cmp = cmp;
  const existe = !!cobCortes[id];
  const ultimo = _cobIdsCortes()[0];
  const posteriores = p.cuotas.filter(q => q.f > fecha).length;
  const avisos = [];
  if (!p.fechaDetectada) avisos.push(['w', 'No encontré "Al: dd/mm/aaaa" en el encabezado. Propuse el fin de mes de la cuota más reciente — revisá la fecha de corte.']);
  if (existe) avisos.push(['w', `Ya existe el corte de <b>${_cobCorteNom(id)}</b> (cargado por ${esc(cobCortes[id].cargadoPor||'—')} el ${new Date(cobCortes[id].ts).toLocaleDateString('es-BO')}). Si confirmás, se <b>reemplazan sus cuotas</b>. Gestiones y compromisos no se tocan.`]);
  if (ultimo && id < ultimo) avisos.push(['w', `Este corte (${_cobCorteNom(id)}) es más viejo que el último cargado (${_cobCorteNom(ultimo)}). Se guarda como histórico.`]);
  if (posteriores) avisos.push(['w', `${posteriores} cuota(s) tienen fecha programada posterior al corte — figuran como "por vencer".`]);
  if (p.dup) avisos.push(['w', `${p.dup} fila(s) repetidas exactamente (misma venta, concepto, fecha y monto). Se cargan igual porque Orange puede tener cuotas iguales; revisalas si no corresponde.`]);
  if (p.descartes.length) avisos.push(['n', `${p.descartes.length} fila(s) descartadas: ${p.descartes.slice(0,5).map(d => 'fila ' + d.fila + ' (' + esc(d.motivo) + ')').join('; ')}${p.descartes.length > 5 ? '…' : ''}`]);
  const lista = (arr, f) => arr.slice(0, 8).map(f).join('') + (arr.length > 8 ? `<li class="cob-mini">… y ${arr.length - 8} más</li>` : '');
  box.innerHTML = `
    <div class="cob-prev">
      <div class="cob-prev-h">
        <div><b>${esc(p.archivo)}</b><div class="cob-mini">Encabezado en fila ${p.encabezadoFila}${p.desde ? ' · período del reporte ' + _cobF(p.desde) + ' al ' + _cobF(fecha) : ''}</div></div>
        <label>Fecha de corte<input type="date" id="cob-prev-fecha" value="${fecha}" onchange="cobImportPend.fechaCorte=this.value; cobImportPend.fechaDetectada=true; _cobRenderPreview();"/></label>
      </div>
      <div class="cob-fi-kpis">
        <div><span>Corte</span><b>${_cobCorteNom(id)}</b></div>
        <div><span>Clientes</span><b>${cmp.clientes}</b></div>
        <div><span>Terreno · ${cmp.cuotasT} cuotas</span><b>${_cobUSD(cmp.totalT)}</b></div>
        <div><span>Acción · ${cmp.cuotasA} cuotas</span><b>${_cobUSD(cmp.totalA)}</b></div>
        <div><span>Total pendiente</span><b>${_cobUSD(cmp.total)}</b></div>
      </div>
      ${avisos.map(([c, t]) => `<div class="cob-aviso ${c}">${t}</div>`).join('')}
      ${cmp.prevId ? `
        <div class="cob-mini" style="margin:8px 0 4px;">Comparación contra <b>${_cobCorteNom(cmp.prevId)}</b> (${_cobUSD(cobCortes[cmp.prevId].total)}):</div>
        <div class="cob-fi-kpis">
          <div><span>Recuperado (cuotas que ya no figuran)</span><b style="color:var(--ok-ink)">${_cobUSD(cmp.recuperado)}</b></div>
          <div><span>Salieron de la lista</span><b>${cmp.salieron.length}</b></div>
          <div><span>Nuevos en mora</span><b style="color:var(--danger-ink)">${cmp.nuevos.length}</b></div>
          <div><span>Empeoraron / mejoraron</span><b>${cmp.empeoraron.length} / ${cmp.mejoraron.length}</b></div>
        </div>
        <div class="cob-prev-cols">
          <div><div class="cob-fi-h">Salieron (pagaron todo)</div><ul>${lista(cmp.salieron.sort((a,b)=>b.total-a.total), x => `<li>${esc(x.nom)} <b>${_cobUSD(x.total)}</b></li>`) || '<li class="cob-mini">—</li>'}</ul></div>
          <div><div class="cob-fi-h">Nuevos en mora</div><ul>${lista(cmp.nuevos.sort((a,b)=>b.total-a.total), x => `<li>${esc(x.nom)} <b>${_cobUSD(x.total)}</b></li>`) || '<li class="cob-mini">—</li>'}</ul></div>
          <div><div class="cob-fi-h">Empeoraron</div><ul>${lista(cmp.empeoraron.sort((a,b)=>(b.a-b.de)-(a.a-a.de)), x => `<li>${esc(x.nom)} ${_cobUSD(x.de)} → <b>${_cobUSD(x.a)}</b></li>`) || '<li class="cob-mini">—</li>'}</ul></div>
        </div>` : '<div class="cob-mini" style="margin-top:8px;">Es el primer corte: no hay contra qué comparar todavía.</div>'}
      <div class="cob-modal-acts">
        <button class="btn-secondary btn-sm" onclick="cobImportPend=null; _cobRenderPreview();">Cancelar</button>
        <button class="btn-primary btn-sm" id="cob-btn-confirmar" onclick="cobConfirmarCarga()">${existe ? '♻ Reemplazar corte' : '✔ Confirmar carga'} de ${_cobCorteNom(id)}</button>
      </div>
    </div>`;
}

async function cobConfirmarCarga() {
  const p = cobImportPend; if (!p || !p.cmp) return;
  const fecha = p.fechaCorte, id = fecha.slice(0,7);
  if (cobCortes[id]) {
    const ok = await confirmDialog(`Se reemplazarán las cuotas del corte ${_cobCorteNom(id)}. Las gestiones y compromisos se mantienen.`, { title:'Reemplazar corte', okText:'Reemplazar', positive:true, icon:'♻' });
    if (!ok) return;
  }
  const btn = document.getElementById('cob-btn-confirmar'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const cmp = p.cmp;
  const resumen = {
    id, fecha, archivo: p.archivo, ts: Date.now(), cargadoPor: _cobUsuario(), filas: p.cuotas.length, descartadas: p.descartes.length,
    total: cmp.total, totalT: cmp.totalT, totalA: cmp.totalA, cuotasT: cmp.cuotasT, cuotasA: cmp.cuotasA, clientes: cmp.clientes,
    porCliente: cmp.porCliente, corteAnterior: cmp.prevId || null,
    recuperado: cmp.prevId ? cmp.recuperado : null, nuevos: cmp.prevId ? cmp.nuevos.length : null, salieron: cmp.prevId ? cmp.salieron.length : null,
    empeoraron: cmp.prevId ? cmp.empeoraron.length : null, mejoraron: cmp.prevId ? cmp.mejoraron.length : null,
    historialCargas: [...(cobCortes[id]?.historialCargas || []), ...(cobCortes[id] ? [{ ts: cobCortes[id].ts, por: cobCortes[id].cargadoPor, archivo: cobCortes[id].archivo, total: cobCortes[id].total }] : [])],
  };
  try {
    await window._fbCob.multi({ ['cobcrm_cuotas/' + id]: p.cuotas, ['cobcrm_cortes/' + id]: resumen });
    cobCacheCuotas[id] = p.cuotas;
    // Si es el corte más reciente, los "siguientes" que se habían comparado contra el anterior quedan con datos viejos: recalculamos el siguiente.
    const sig = Object.keys(cobCortes).filter(x => x > id).sort()[0];
    if (sig) _cobRecalcularComparacion(sig, id, p.cuotas, cmp.porCliente);
    const masNuevo = Object.keys(cobCortes).concat(id).sort().reverse()[0];
    _cobPoblarCortes();
    await cobCambiarCorte(masNuevo === id ? id : (cobCorteSel || masNuevo));
    _cobPoblarCortes();
    const conComp = cmp.salieron.filter(s => Object.values(cobCompromisos).some(c => c.clienteKey === s.k && c.estado === 'Pendiente')).length;
    cobImportPend = null;
    document.getElementById('cob-preview').innerHTML = `<div class="cob-aviso ok">✔ Corte de ${_cobCorteNom(id)} cargado: ${resumen.clientes} clientes, ${_cobUSD(resumen.total)}.${conComp ? ` ${conComp} cliente(s) que salieron de la lista tienen compromisos pendientes — confirmalos en la Agenda.` : ''}</div>`;
    toastOk('Corte cargado.');
  } catch(err) { console.error(err); toastErr('No se pudo guardar el corte: ' + (err.message || err)); if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; } }
}

async function _cobRecalcularComparacion(idSig, idPrev, cuotasPrev, pcPrev) {
  try {
    if (!cobCacheCuotas[idSig]) { const arr = await window._fbCob.get('cobcrm_cuotas/' + idSig); cobCacheCuotas[idSig] = Array.isArray(arr) ? arr : Object.values(arr || {}); }
    const cur = cobCacheCuotas[idSig], pcCur = cobCortes[idSig]?.porCliente || {};
    const idQ = q => [q.v, q.t, q.c, q.f].join('|');
    const act = {}; cur.forEach(q => { act[idQ(q)] = (act[idQ(q)] || 0) + q.m; });
    const prv = {}; cuotasPrev.forEach(q => { prv[idQ(q)] = (prv[idQ(q)] || 0) + q.m; });
    const recuperado = Math.round(Object.entries(prv).reduce((s,[k,m]) => s + Math.max(0, m - (act[k]||0)), 0) * 100) / 100;
    let nuevos = 0, salieron = 0, emp = 0, mej = 0;
    Object.entries(pcCur).forEach(([k,v]) => { const p = pcPrev[k]; if (!p) nuevos++; else if (v[0] > p[0] + 1) emp++; else if (v[0] < p[0] - 1) mej++; });
    Object.keys(pcPrev).forEach(k => { if (!pcCur[k]) salieron++; });
    await window._fbCob.update('cobcrm_cortes/' + idSig, { corteAnterior: idPrev, recuperado, nuevos, salieron, empeoraron: emp, mejoraron: mej });
  } catch(e) { console.error('[COB] recalcular siguiente', e); }
}

function cobRenderCortes() {
  const t = document.getElementById('cob-cortes-t'); if (!t) return;
  const ids = _cobIdsCortes();
  t.innerHTML = `<thead><tr><th>Corte</th><th>Fecha</th><th>Archivo</th><th>Cargado por</th><th class="r">Clientes</th><th class="r">Cuotas</th><th class="r">Terreno</th><th class="r">Acción</th><th class="r">Total</th><th class="r">Recuperado</th><th class="r">Nuevos</th><th class="r">Salieron</th><th></th></tr></thead><tbody>` +
    (ids.length ? ids.map(id => { const c = cobCortes[id]; return `<tr><td><b>${_cobCorteNom(id)}</b></td><td>${_cobF(c.fecha)}</td><td class="cob-mini2">${esc(c.archivo||'')}</td><td class="cob-mini2">${esc(c.cargadoPor||'')} · ${new Date(c.ts).toLocaleDateString('es-BO')}${(c.historialCargas||[]).length ? ` · reemplazado ${c.historialCargas.length}×` : ''}</td><td class="r">${c.clientes}</td><td class="r">${c.cuotasT + c.cuotasA}</td><td class="r">${_cobUSD(c.totalT)}</td><td class="r">${_cobUSD(c.totalA)}</td><td class="r"><b>${_cobUSD(c.total)}</b></td><td class="r">${c.recuperado != null ? _cobUSD(c.recuperado) : '—'}</td><td class="r">${c.nuevos ?? '—'}</td><td class="r">${c.salieron ?? '—'}</td><td>${_cobEsGerencia() ? `<button class="btn-del" onclick="cobEliminarCorte('${id}')">Eliminar</button>` : ''}</td></tr>`; }).join('')
      : '<tr><td colspan="13"><div class="empty-state">Sin cortes cargados.</div></td></tr>') + '</tbody>';
}

async function cobEliminarCorte(id) {
  if (!_cobEsGerencia()) return;
  const ok = await confirmDialog(`Se eliminará el corte ${_cobCorteNom(id)} y sus cuotas. Las gestiones y compromisos NO se borran.`, { title:'Eliminar corte' });
  if (!ok) return;
  try {
    await window._fbCob.multi({ ['cobcrm_cuotas/' + id]: null, ['cobcrm_cortes/' + id]: null });
    delete cobCacheCuotas[id];
    if (cobCorteSel === id) cobCorteSel = null;
    toastOk('Corte eliminado.');
  } catch(err) { console.error(err); toastErr('No se pudo eliminar.'); }
}

/* ═══ EXPORTAR ═══ */
function cobExportarExcel() {
  if (typeof XLSX === 'undefined') { toastErr('No cargó la librería de Excel.'); return; }
  const filas = _cobFiltrar().sort((x,y) => y.a.total - x.a.total);
  if (!filas.length) { toastErr('No hay filas para exportar.'); return; }
  const h1 = filas.map(({a, e}) => ({
    'Cliente': a.persona, 'Ventas': [...a.ventas].join(', '), 'Terrenos': [...a.terrenos].join(', '), 'Vendedor': a.vendedor,
    'Cuotas terreno': a.cuotasT, 'Deuda terreno US$': Math.round(a.montoT*100)/100, 'Cuotas acción': a.cuotasA, 'Deuda acción US$': Math.round(a.montoA*100)/100,
    'Total US$': Math.round(a.total*100)/100, 'Debe desde': _cobF(a.fMin), 'Días mora al corte': a.dias, 'Tramo': a.tramo.lbl, 'vs corte anterior': e.mov,
    'Pagó post-corte (Orange) US$': Math.round(e.postPago.total*100)/100, 'Estado gestión': e.estado, 'Responsable': e.resp, 'Teléfono': e.crm.telefono || '',
    'Última gestión': e.ultGest ? `${new Date(e.ultGest.ts).toLocaleDateString('es-BO')} ${e.ultGest.canal} — ${e.ultGest.resultado}` : '',
    'Próximo compromiso': e.compPend ? `${_cobF(e.compPend.fecha)} ${e.compPend.tipo} ${e.compPend.monto || ''}` : '',
  }));
  const h2 = [];
  filas.forEach(({a}) => a.cuotas.forEach(q => h2.push({ 'Cliente': a.persona, 'Venta': q.v, 'Tipo': q.t === 'T' ? 'Terreno' : 'Acción', 'Terreno': q.z, 'Concepto': q.c, 'F. programada': _cobF(q.f), 'Días mora': Math.max(0, _cobDias(q.f, cobCortes[cobCorteSel].fecha)), 'Monto US$': q.m })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h1), 'Clientes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h2), 'Cuotas');
  XLSX.writeFile(wb, `Seguimiento_cobranza_${cobCorteSel}.xlsx`);
}

