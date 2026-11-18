/* ════════════════════════════════════════════════════════════════════════
   TABLERO DE DECISIONES — acordeón propio, solo admin. No modifica nada de lo
   existente: solo LEE los datos que el sistema ya carga y calcula indicadores
   para decidir (embudo, cobranza y mora, marketing, inventario y precios),
   el resumen de hoy y una vigilancia continua que avisa lo que no se ve.
   Los filtros (período, asesor, campaña) se aplican a todo el tablero.
   ════════════════════════════════════════════════════════════════════════ */
const DEC_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const dec = { f: { per: 'mes', mes: null, gest: null, ases: '', camp: '' }, metas: {}, gest: null, cargado: false, sec: {} };
const _decG = n => { try { return eval(n); } catch (e) { return undefined; } };   // lee un global si existe (let de otro bloque)
const _decArr = n => { const v = _decG(n); return Array.isArray(v) ? v : []; };
const _decObj = n => { const v = _decG(n); return v && typeof v === 'object' ? v : {}; };
const _decPct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : null;
const _decFmtPct = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('es-BO') + '%';
const _decNum = v => (v || 0).toLocaleString('es-BO');
const _decGestion0 = (t = Date.now()) => { const d = new Date(t); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return new Date(y, 3, 1).getTime(); };

/* ── Período elegido y su comparación justa (mismo tramo transcurrido) ── */
function decRango() {
  const F = dec.f, now = Date.now(); let d, h, pd, ph, lbl, plbl;
  if (F.per === 'mes') {
    const [y, m] = (F.mes || (() => { const t = new Date(); return t.getFullYear() + '-' + t.getMonth(); })()).split('-').map(Number);
    d = new Date(y, m, 1).getTime(); const fin = new Date(y, m + 1, 1).getTime(); h = Math.min(fin, now);
    pd = new Date(y, m - 1, 1).getTime(); ph = Math.min(d, pd + (h - d));
    lbl = DEC_MESES[m] + ' ' + y + (h < fin ? ' (a la fecha)' : ''); plbl = DEC_MESES[(m + 11) % 12] + (h < fin ? ' a la misma fecha' : '');
  } else if (F.per === 'gestion') {
    const g = F.gest || new Date(_decGestion0()).getFullYear();
    d = new Date(g, 3, 1).getTime(); const fin = new Date(g + 1, 3, 1).getTime(); h = Math.min(fin, now);
    pd = new Date(g - 1, 3, 1).getTime(); ph = pd + (h - d);
    lbl = 'Gestión ' + g + '-' + String(g + 1).slice(2) + (h < fin ? ' (a la fecha)' : ''); plbl = 'gestión anterior' + (h < fin ? ' al mismo punto' : '');
  } else { const n = F.per === 'd30' ? 30 : 90; h = now; d = now - n * 864e5; pd = d - n * 864e5; ph = d; lbl = 'Últimos ' + n + ' días'; plbl = 'los ' + n + ' días previos'; }
  const meses = []; { const a = new Date(d); a.setDate(1); while (a.getTime() < h) { meses.push({ anio: a.getFullYear(), mes: DEC_MESES[a.getMonth()], dias: new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate(), ini: a.getTime() }); a.setMonth(a.getMonth() + 1); } }
  return { d, h, pd, ph, lbl, plbl, meses };
}

/* ── Datos normalizados (con los filtros de asesor y campaña) ── */
function decDatos(F = dec.f) {
  const A = _cbN(F.ases), C = F.camp, okA = n => !A || _cbN(n) === A;
  const vis = _decArr('visitasProgramadasData'), cots = _decArr('cotizacionesData'), leads = _decArr('leadsSemanalesData');
  // clientes que vinieron por la campaña elegida (para filtrar lo que no guarda campaña)
  const campCli = new Set(); if (C) { vis.filter(v => v.campaniaCodigo === C).forEach(v => campCli.add(_cbN(v.nombre))); cots.filter(c => c.campaniaCodigo === C).forEach(c => campCli.add(_cbN(c.cliente))); }
  const okC = (camp, cli) => !C || camp === C || (!camp && campCli.has(_cbN(cli)));
  const D = {};
  // una entrada por visita presencial (1ª y las que el cliente volvió), para contar visitas de verdad
  D.vev = (typeof visitasComoRegs === 'function' ? visitasComoRegs(_decArr('todosRegs')) : _decArr('todosRegs')).map(r => ({ ts: r._reg ? _cbTs(r.ts, r.fecha) : _cbTs(r.ts, r.fecha), ases: r.asesorNombre || '', cli: r.nombre || '', origen: r.origen || 'Sin origen' }));
  D.regs = _decArr('todosRegs').map(r => ({ ts: _cbTs(r.ts, r.fecha), ases: r.asesorNombre || '', cli: r.nombre || '', cierre: typeof _esCierreVenta === 'function' ? _esCierreVenta(r) : r.conclusion === 'Reserva', monto: r.precioVenta || r.precio || 0, origen: r.origen || 'Sin origen', terreno: r.terrenoInteres || '', camp: r.campaniaCodigo || '' }))
    .filter(x => x.ts && okA(x.ases) && okC(x.camp, x.cli));
  D.vis = vis.map(v => ({ ts: v.ts > 1e11 ? v.ts : _cbTs(0, v.fecha), fecha: v.fecha || '', ases: v.asesorNombre || '', cli: v.nombre || '', estado: v.estado || '', camp: v.campaniaCodigo || '', cotKey: v.cotizacionKey || '', key: v._key }))
    .filter(x => okA(x.ases) && okC(x.camp, x.cli));
  D.cots = cots.map(c => ({ ts: c.ts || 0, ases: c.asesorNombre || '', cli: c.cliente || '', terreno: c.terreno || (c.sugeridos || [])[0]?.terreno || '', camp: c.campaniaCodigo || '', vistas: c.vistas || 0, ult: c.ultimaVista || 0, estado: typeof _estadoRealCotizacion === 'function' ? _estadoRealCotizacion(c) : c.estado, visitaKey: c.visitaKey || '', precio: c.precioFinal || 0, desc: c.descuentoPct || 0, key: c._key, codigo: c.codigo || '' }))
    .filter(x => x.ts && okA(x.ases) && okC(x.camp, x.cli));
  D.leads = leads.map(l => ({ ts: _cbTs(0, l.desde) || l.ts, n: Number(l.cantidad) || 0, camp: l.campaniaCodigo || 'Sin campaña' })).filter(x => !C || x.camp === C);
  const vcFecha = v => { const t = _cbTs(0, v.fechaReserva); if (t) return t; const m = DEC_MESES.indexOf(v.mes); return m >= 0 && (v.anio || v['año']) ? new Date(v.anio || v['año'], m, 15).getTime() : 0; };
  D.ventas = _decArr('ventasConcretadasData').map(v => ({ ts: vcFecha(v), ases: v.asesorNombre || '', cli: v.cliente || '', terreno: v.terreno || '', mod: String(v.terreno || '').split('-')[0] || '?', canal: v.canal || v.gestion || 'Sin canal', modalidad: v.modalidad || 'Sin modalidad', cat: v.categoria || '—', lista: v.precioLista || 0, venta: v.precioVenta || 0, desc: v.descuentoPct || 0, exced: v.excedente || 0, m2: v.m2Usd || 0 }))
    .filter(x => x.ts && okA(x.ases) && (!C || campCli.has(_cbN(x.cli))));
  D.pagos = _decArr('orangeCarteraDetalleRaw').map(p => ({ ts: p.fechaOrden || 0, monto: p.monto || 0, tipo: p.tipoIngreso || 'Cartera', cli: p.cliente || '', ases: p.asesor || '', terreno: p.terreno || '' })).filter(x => okA(x.ases) && (!C || campCli.has(_cbN(x.cli))));
  D.exp = _decArr('orangeExpensasDetalleRaw').map(p => ({ ts: p.fechaOrden || 0, monto: p.monto || 0, cli: p.cliente || '' })).filter(x => !C || campCli.has(_cbN(x.cli)));
  D.mora = _decArr('orangeMoraData').map(m => ({ estado: m.estado || '', bs: m.montoAdeudadoBS || 0, dias: m.diasMora || 0, cli: m.cliente || '', terreno: m.terreno || '', ases: m.asesor || '' })).filter(x => okA(x.ases));
  const comps = _decObj('cobCompromisos'), crm = _decObj('cobClientesCRM');
  D.comps = Object.entries(comps).map(([k, c]) => ({ ts: c.ts || _cbTs(0, c.fecha), fecha: c.fecha || '', estado: c.estado || '', monto: c.monto || 0, cli: c.cliente || '', cliKey: c.clienteKey || '' }));
  D.gest = []; Object.entries(dec.gest || {}).forEach(([ck, gs]) => Object.values(gs || {}).forEach(g => D.gest.push({ ts: g.ts || _cbTs(0, g.fecha), res: g.resultado || '', cli: crm[ck]?.nombre || '', cliKey: ck })));
  D.lotes = _decArr('todosLotes').map(l => ({ terreno: typeof _terrenoDeLote === 'function' ? _terrenoDeLote(l) : l.terreno, mod: String(l.modulo || (l.terreno || '').split('-')[0] || '?'), estado: l.estado || 'Disponible', precio: l.precio || 0, cat: l.categoria || '' }));
  return D;
}
const _decEn = (arr, d, h) => arr.filter(x => x.ts >= d && x.ts < h);
/* Qué cobrado se compara con la meta: si la meta es vigente + mora, la cobranza de cartera; si es la meta general, el total */
const _decCobMeta = (R, M) => M.carteraVM ? R.cobCartera : R.cobTotal;

/* ── Indicadores de un tramo ── */
function decCalc(D, d, h) {
  const R = {}, regs = _decEn(D.regs, d, h);
  R.leads = _decEn(D.leads, d, h).reduce((s, l) => s + l.n, 0);
  R.agendas = _decEn(D.vis, d, h).length;
  R.agAtendidas = _decEn(D.vis, d, h).filter(v => v.estado === 'completada').length;
  R.visitas = _decEn(D.vev || [], d, h).length;
  R.reservas = regs.filter(r => r.cierre).length; R.montoRes = regs.filter(r => r.cierre).reduce((s, r) => s + r.monto, 0);
  const cs = _decEn(D.cots, d, h); R.cots = cs.length; R.cotAbiertas = cs.filter(c => c.vistas > 0).length;
  const resCli = new Map(); D.regs.filter(r => r.cierre).forEach(r => { const k = _cbN(r.cli); if (k) resCli.set(k, Math.max(resCli.get(k) || 0, r.ts)); });
  R.cotConv = cs.filter(c => (resCli.get(_cbN(c.cli)) || 0) >= c.ts).length;
  const vs = _decEn(D.ventas, d, h); R.ventas = vs.length; R.montoVentas = vs.reduce((s, v) => s + v.venta, 0); R.ticket = vs.length ? R.montoVentas / vs.length : 0;
  R.descProm = vs.length ? vs.reduce((s, v) => s + v.desc, 0) / vs.length : null; R.exced = vs.filter(v => v.exced > 0); R.m2 = vs.filter(v => v.m2).length ? vs.reduce((s, v) => s + v.m2, 0) / vs.filter(v => v.m2).length : 0;
  const pg = _decEn(D.pagos, d, h); R.cobTotal = pg.reduce((s, p) => s + p.monto, 0); R.cobCartera = pg.filter(p => p.tipo !== 'Venta Nueva').reduce((s, p) => s + p.monto, 0); R.cobNueva = pg.filter(p => p.tipo === 'Venta Nueva').reduce((s, p) => s + p.monto, 0); R.nPagos = pg.length;
  R.cobExp = _decEn(D.exp, d, h).reduce((s, p) => s + p.monto, 0); R.nExp = _decEn(D.exp, d, h).length;
  const cm = _decEn(D.comps, d, h); R.comps = cm.length; R.compsOk = cm.filter(c => c.estado === 'Cumplido').length;
  const gs = _decEn(D.gest, d, h); R.gest = gs.length; R.gestEf = gs.filter(g => /pag|promesa|compromiso/i.test(g.res)).length;
  R.convVisRes = _decPct(R.reservas, R.visitas);
  return R;
}

/* ── Metas del período (se leen una vez por mes y quedan en memoria) ── */
function decMetas(meses) {
  const out = { cartera: 0, expensas: 0, cierres: 0, visitas: 0, leads: 0, inversion: 0, faltan: 0 };
  meses.forEach(m => {
    const k = m.anio + '-' + m.mes, c = dec.metas[k];
    if (!c) { out.faltan++; if (!dec.metas[k + '~'] && typeof window._fbListenMetas === 'function') { dec.metas[k + '~'] = 1; try { window._fbListenMetas(m.anio, m.mes, v => { dec.metas[k] = v || {}; clearTimeout(dec.metaT); dec.metaT = setTimeout(() => { if (dec.abierto) decPintar(); if (typeof homeV2Pintar === 'function') homeV2Pintar(); }, 250); }); } catch (e) {} } return; }
    const v = (a, b) => (c[a]?.monto || 0) || (c[b]?.monto || 0);
    { const vm = (c.cartera_vigente?.monto || 0) + (c.cartera_mora?.monto || 0); if (vm) { out.cartera += vm; out.carteraVM = true; } else out.cartera += v('cartera'); }   // misma meta que el Resumen mensual de Cartera (vigente + mora); si no hay, la meta general
    { const vm = (c.expensas_vigente?.monto || 0) + (c.expensas_mora?.monto || 0); out.expensas += vm || v('expensas'); }   // Expensas usa vigente + mora, igual que su módulo out.cierres += v('cierres', 'mkt_cierres') || (c.ventas?.monto || 0); out.visitas += v('visitas', 'mkt_visitas'); out.leads += v('mkt_leads', 'leads'); out.inversion += v('mkt_inversion');
  });
  return out;
}

/* ── Pintado ── */
function _decDelta(a, b, inv) {
  if (b == null || a == null || (!a && !b)) return '';
  if (!b) return `<span class="dec-d up">nuevo</span>`;
  const p = Math.round((a - b) * 100 / Math.abs(b)); if (!p) return '<span class="dec-d">=</span>';
  const bueno = inv ? p < 0 : p > 0; return `<span class="dec-d ${bueno ? 'up' : 'dn'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`;
}
function _decK(label, val, delta, tip, cls = '') { return `<div class="kpi-card dec-k ${cls}"${tip ? ` title="${_cbEsc(tip)}"` : ''}><div class="kpi-label">${label}</div><div class="kpi-num">${val}${delta || ''}</div></div>`; }
function _decBarra(v, max, col) { return `<i class="dec-bar"><b style="width:${max ? Math.max(1.5, v * 100 / max) : 0}%;${col ? 'background:' + col : ''}"></b></i>`; }
function _decSec(id, titulo, nota, cuerpo) {
  const cerr = dec.sec[id] === 0;
  return `<section class="dec-sec${cerr ? ' cerr' : ''}" id="dec-s-${id}"><header onclick="decSecToggle('${id}')"><h3>${titulo}</h3>${nota ? `<span class="dec-nota">${nota}</span>` : ''}<span class="dec-chev">▾</span></header><div class="dec-body">${cuerpo}</div></section>`;
}
function decSecToggle(id) { dec.sec[id] = dec.sec[id] === 0 ? 1 : 0; try { localStorage.setItem('uv-dec-sec', JSON.stringify(dec.sec)); } catch (e) {} document.getElementById('dec-s-' + id)?.classList.toggle('cerr', dec.sec[id] === 0); }

function decFiltrosHTML() {
  const F = dec.f, g0 = new Date(_decGestion0()).getFullYear(), mesesOpt = [];
  for (let g = g0; g >= g0 - 1; g--) for (let i = 14; i >= 3; i--) { const y = i < 12 ? g : g + 1, m = i % 12, t = new Date(y, m, 1).getTime(); if (t <= Date.now()) mesesOpt.push(`<option value="${y}-${m}">${DEC_MESES[m]} ${y}</option>`); }
  const ases = [...new Set(_decArr('todosRegs').map(r => r.asesorNombre).concat(_decArr('cotizacionesData').map(c => c.asesorNombre)).filter(Boolean))].sort();
  const camps = _decArr('campaniasData').map(c => c.codigo).filter(Boolean);
  const sel = (id, opts, v, on) => `<select id="${id}" onchange="${on}">${opts}</select>`.replace(`value="${v}"`, `value="${v}" selected`);
  return `<div class="dec-fil">
    <div class="dec-seg">${[['mes', 'Mes'], ['gestion', 'Gestión'], ['d30', '30 días'], ['d90', '90 días']].map(([v, t]) => `<button type="button" class="${F.per === v ? 'on' : ''}" onclick="decFiltro('per','${v}')">${t}</button>`).join('')}</div>
    ${F.per === 'mes' ? sel('dec-f-mes', mesesOpt.join(''), F.mes || (new Date().getFullYear() + '-' + new Date().getMonth()), "decFiltro('mes',this.value)") : ''}
    ${F.per === 'gestion' ? sel('dec-f-gest', [g0, g0 - 1, g0 - 2].map(g => `<option value="${g}">Gestión ${g}-${String(g + 1).slice(2)}</option>`).join(''), F.gest || g0, "decFiltro('gest',+this.value)") : ''}
    ${sel('dec-f-ases', '<option value="">Todos los asesores</option>' + ases.map(a => `<option value="${_cbEsc(a)}">${_cbEsc(a)}</option>`).join(''), _cbEsc(F.ases), "decFiltro('ases',this.value)")}
    ${sel('dec-f-camp', '<option value="">Todas las campañas</option>' + camps.map(c => `<option value="${_cbEsc(c)}">${_cbEsc(c)}</option>`).join(''), _cbEsc(F.camp), "decFiltro('camp',this.value)")}
    <span class="dec-per" id="dec-per"></span></div>`;
}
function decFiltro(k, v) { dec.f[k] = v; try { localStorage.setItem('uv-dec-f', JSON.stringify(dec.f)); } catch (e) {} decPintar(true); }

function decPintar(conFiltros) {
  const p = document.getElementById('panel-decisiones'); if (!p) return;
  if (conFiltros || !document.getElementById('dec-root')) p.innerHTML = `<div id="dec-root">${decFiltrosHTML()}<div id="dec-cuerpo"></div></div><div class="dec-modal" id="dec-modal" onclick="if(event.target===this)this.classList.remove('on')"><div class="dec-modal-c" id="dec-modal-c"></div></div>`;
  const Rg = decRango(), D = decDatos(), A = decCalc(D, Rg.d, Rg.h), B = decCalc(D, Rg.pd, Rg.ph), M = decMetas(Rg.meses);
  dec.ult = { Rg, D, A, B, M };
  document.getElementById('dec-per').innerHTML = `<b>${Rg.lbl}</b> · comparado con ${Rg.plbl}${dec.f.ases ? ' · ' + _cbEsc(dec.f.ases) : ''}${dec.f.camp ? ' · campaña ' + _cbEsc(dec.f.camp) : ''}`;
  const sig = decVigilar(D);
  document.getElementById('dec-cuerpo').innerHTML = [decHoyHTML(D), decVigiaHTML(sig), decVentasHTML(D, Rg, A, B, M), decCobranzaHTML(D, Rg, A, B, M), decMarketingHTML(D, Rg, A, B, M), decInventarioHTML(D, Rg, A, B)].join('');
}

/* ── Hoy ── */
function decHoyHTML(D) {
  const h0 = _cbHoy0(), h1 = h0 + 864e5, A = decCalc(D, h0, h1);
  const it = [['Cobrado cartera', A.nPagos ? _cbUsd(A.cobCartera + A.cobNueva) : '—', A.nPagos], ['Cobrado expensas', A.nExp ? _cbBs(A.cobExp) : '—', A.nExp], ['Reservas', A.reservas || '—'], ['Visitas', A.visitas || '—'], ['Cotizaciones', A.cots || '—'], ['Agendas', A.agendas || '—'], ['Leads', A.leads || '—'], ['Gestiones', A.gest || '—'], ['Compromisos', A.comps || '—']];
  return `<div class="dec-hoy"><span class="dec-hoy-t">Hoy · ${new Date().toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>${it.map(([t, v, n]) => `<span class="${v === '—' ? 'cero' : ''}"><em>${t}</em><b>${v}</b>${n ? `<small>${n}</small>` : ''}</span>`).join('')}</div>`;
}

/* ── Ventas y embudo ── */
function decVentasHTML(D, Rg, A, B, M) {
  const et = [['Leads', A.leads, B.leads], ['Agendas', A.agendas, B.agendas], ['Visitas', A.visitas, B.visitas], ['Cotizaciones', A.cots, B.cots], ['Reservas', A.reservas, B.reservas]];
  const mx = Math.max(1, ...et.map(e => e[1])); let peor = null, f2 = false;
  const filas = et.map(([t, v, pv], i) => { let conv = '', pconv = '';
    if (i) { const c = _decPct(v, et[i - 1][1]), pc = _decPct(pv, et[i - 1][2]); conv = c > 100 ? '—' : _decFmtPct(c); pconv = pc > 100 || pc == null ? '—' : _decFmtPct(pc); if (c > 100) { f2 = true; } if (c != null && c <= 100 && et[i - 1][1] >= 5 && (!peor || c < peor.c)) peor = { c, i, t: et[i - 1][0] + ' → ' + t }; }
    return { t, v, pv, conv, pconv, i }; });
  const fun = filas.map(f => `<div class="dec-fun-r${peor && peor.i === f.i ? ' peor' : ''}"><span>${f.t}</span>${_decBarra(f.v, mx)}<b>${_decNum(f.v)}</b>${_decDelta(f.v, f.pv)}<em>${f.i ? f.conv : ''}</em><small>${f.i ? 'antes ' + f.pconv : ''}</small></div>`).join('');
  const meta = M.cierres, cum = meta ? _decPct(A.reservas, meta) : null;
  const k = [
    _decK('Reservas', _decNum(A.reservas), _decDelta(A.reservas, B.reservas), 'Registros con cierre en el período'),
    _decK('Cumplimiento meta', meta ? _decFmtPct(cum) : '—', '', meta ? `Meta de cierres del período: ${meta}` : 'Sin meta cargada para el período'),
    _decK('Conversión visita → reserva', _decFmtPct(A.convVisRes), _decDelta(A.convVisRes, B.convVisRes)),
    _decK('Cotización → reserva', _decFmtPct(_decPct(A.cotConv, A.cots)), _decDelta(_decPct(A.cotConv, A.cots), _decPct(B.cotConv, B.cots)), 'Cotizaciones del período cuyo cliente reservó después'),
    _decK('Cotizaciones abiertas por el cliente', _decFmtPct(_decPct(A.cotAbiertas, A.cots)), _decDelta(_decPct(A.cotAbiertas, A.cots), _decPct(B.cotAbiertas, B.cots))),
    _decK('Ventas concretadas', _decUsdK(A.montoVentas), _decDelta(A.montoVentas, B.montoVentas), A.ventas + ' ventas'),
    _decK('Ticket promedio', A.ticket ? _decUsdK(A.ticket) : '—', _decDelta(A.ticket, B.ticket)),
    _decK('Agendas atendidas', _decFmtPct(_decPct(A.agAtendidas, A.agendas)), _decDelta(_decPct(A.agAtendidas, A.agendas), _decPct(B.agAtendidas, B.agendas))),
  ].join('');
  // por asesor
  const por = {}; const add = (n, k2, v = 1) => { if (!n) return; (por[n] = por[n] || { ag: 0, at: 0, vis: 0, cot: 0, res: 0, ven: 0, vm: 0 })[k2] += v; };
  _decEn(D.vis, Rg.d, Rg.h).forEach(v => { add(v.ases, 'ag'); if (v.estado === 'completada') add(v.ases, 'at'); });
  _decEn(D.regs, Rg.d, Rg.h).forEach(r => { if (r.cierre) add(r.ases, 'res'); });
  _decEn(D.vev || [], Rg.d, Rg.h).forEach(v => add(v.ases, 'vis'));
  _decEn(D.cots, Rg.d, Rg.h).forEach(c => add(c.ases, 'cot'));
  _decEn(D.ventas, Rg.d, Rg.h).forEach(v => { add(v.ases, 'ven'); add(v.ases, 'vm', v.venta); });
  const filasA = Object.entries(por).map(([n, x]) => ({ n, ...x, conv: _decPct(x.res, x.vis) })).sort((a, b) => b.res - a.res || b.vm - a.vm);
  const convs = filasA.filter(x => x.vis >= 5).map(x => x.conv), cMax = Math.max(...convs), cMin = Math.min(...convs);
  const tabla = filasA.length ? `<table class="dec-t"><thead><tr><th>Asesor</th><th>Agendas</th><th>Atendidas</th><th>Visitas</th><th>Cotiz.</th><th>Reservas</th><th>Conv.</th><th>Ventas</th></tr></thead><tbody>${filasA.map(x => `<tr><td>${_cbEsc(x.n)}</td><td>${x.ag || '—'}</td><td>${x.ag ? _decFmtPct(_decPct(x.at, x.ag)) : '—'}</td><td>${x.vis || '—'}</td><td>${x.cot || '—'}</td><td><b>${x.res || '—'}</b></td><td class="${x.vis >= 5 && convs.length > 1 ? (x.conv === cMax ? 'top' : x.conv === cMin ? 'low' : '') : ''}">${_decFmtPct(x.conv)}</td><td>${x.vm ? _decUsdK(x.vm) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="dec-vacio">Sin movimientos en el período.</p>';
  return _decSec('ventas', 'Ventas y embudo', 'dónde se pierde la gente y quién convierte', `<div class="dec-kg">${k}</div><div class="dec-2"><div><h4>Embudo${peor ? ` <span class="dec-tag">mayor pérdida: ${peor.t}</span>` : ''}</h4>${fun}${f2 ? '<p class="dec-vacio" style="margin-top:6px">Hay más visitas que agendas: muchas llegan sin pasar por el call center (por eso esa conversión no se calcula).</p>' : ''}</div><div><h4>Por asesor</h4>${tabla}</div></div>`);
}
const _decUsdK = v => v >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-BO', { maximumFractionDigits: 2 }) + ' M' : v >= 1e4 ? '$' + Math.round(v / 1e3).toLocaleString('es-BO') + ' mil' : _cbUsd(v);

/* ── Cobranza y mora ── */
function decCobranzaHTML(D, Rg, A, B, M) {
  const meta = M.cartera, cob = _decCobMeta(A, M), ahora = Date.now();
  let proy = null; if (dec.f.per === 'mes' && Rg.h < Rg.d + 32 * 864e5 && Rg.h === Math.min(ahora, Rg.h)) { const dias = Rg.meses[0]?.dias || 30, trans = Math.max(1, (Rg.h - Rg.d) / 864e5); if (trans < dias) proy = cob / trans * dias; }
  const tiers = ['Mora 1-30', 'Mora 31-60', 'Mora 61-90', 'Mora 91-180', 'Mora +180'], mt = tiers.map(t => ({ t, bs: D.mora.filter(m => m.estado === t).reduce((s, m) => s + m.bs, 0), n: D.mora.filter(m => m.estado === t).length }));
  const moraTot = mt.reduce((s, x) => s + x.bs, 0), mora90 = mt.slice(3).reduce((s, x) => s + x.bs, 0), mxT = Math.max(1, ...mt.map(x => x.bs));
  const hoyIso = new Date().toISOString().slice(0, 10), compVenc = D.comps.filter(c => c.estado === 'Pendiente' && c.fecha && c.fecha < hoyIso);
  const k = [
    _decK('Cobrado total (Orange)', _decUsdK(A.cobTotal), _decDelta(A.cobTotal, B.cobTotal), A.nPagos + ' cobros: cuotas de terreno y acción, señas y venta nueva. Es el mismo número que "Mes" en Cartera.'),
    _decK('Cobranza de cartera', _decUsdK(A.cobCartera), _decDelta(A.cobCartera, B.cobCartera), 'Sin venta nueva (terrenos vendidos en gestiones anteriores)'),
    _decK('Cumplimiento meta cartera', meta ? _decFmtPct(_decPct(cob, meta)) : '—', '', meta ? (M.carteraVM ? 'Meta vigente + mora: ' + _cbUsd(meta) + ' · comparada con la cobranza de cartera' : 'Meta: ' + _cbUsd(meta) + ' · comparada con el cobrado total') : 'Sin meta cargada para el mes'),
    _decK('Proyección al cierre del mes', proy != null ? _decUsdK(proy) : '—', proy != null && meta ? `<span class="dec-d ${proy >= meta ? 'up' : 'dn'}">${_decFmtPct(_decPct(proy, meta))}</span>` : '', 'Al ritmo diario actual'),
    _decK('Cobrado venta nueva', _decUsdK(A.cobNueva), _decDelta(A.cobNueva, B.cobNueva)),
    _decK('Cobrado expensas', A.nExp ? _cbBs(A.cobExp) : '—', _decDelta(A.cobExp, B.cobExp)),
    _decK('Mora total (hoy)', moraTot ? 'Bs ' + _decUsdK(moraTot).replace('$', '') : '—', '', D.mora.length + ' lotes en mora · foto actual de Orange'),
    _decK('Mora de más de 90 días', moraTot ? _decFmtPct(_decPct(mora90, moraTot)) : '—', '', 'Parte de la mora con más de 90 días'),
    _decK('Compromisos cumplidos', A.comps ? _decFmtPct(_decPct(A.compsOk, A.comps)) : '—', _decDelta(_decPct(A.compsOk, A.comps), _decPct(B.compsOk, B.comps)), A.comps + ' compromisos del período'),
    _decK('Gestiones efectivas', A.gest ? _decFmtPct(_decPct(A.gestEf, A.gest)) : '—', _decDelta(A.gest, B.gest), A.gest + ' gestiones · efectivas: pago, promesa o compromiso'),
    _decK('Compromisos vencidos', compVenc.length || '—', '', 'Pendientes con fecha pasada', compVenc.length ? 'alerta' : ''),
  ].join('');
  // deudores: mora +60 y última gestión
  const ultG = {}; D.gest.forEach(g => { const c = _cbN(g.cli); if (c) ultG[c] = Math.max(ultG[c] || 0, g.ts); });
  const deud = D.mora.filter(m => /61|91|\+180/.test(m.estado)).sort((a, b) => b.bs - a.bs).slice(0, 10);
  const tdeu = deud.length ? `<table class="dec-t"><thead><tr><th>Cliente</th><th>Terreno</th><th>Tramo</th><th>Bs</th><th>Última gestión</th></tr></thead><tbody>${deud.map(m => { const u = ultG[_cbN(m.cli)]; const dd = u ? Math.round((ahora - u) / 864e5) : null; return `<tr><td>${_cbEsc(m.cli)}</td><td>${_cbEsc(m.terreno)}</td><td>${m.estado.replace('Mora ', '')}</td><td>${_decNum(Math.round(m.bs))}</td><td class="${dd == null || dd > 30 ? 'low' : ''}">${dd == null ? 'nunca' : 'hace ' + dd + ' d'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="dec-vacio">Sin mora de más de 60 días.</p>';
  // cobro por semana del período
  const sem = []; for (let t = Rg.d; t < Rg.h; t += 7 * 864e5) sem.push({ t, v: _decEn(D.pagos, t, Math.min(t + 7 * 864e5, Rg.h)).reduce((s, p) => s + p.monto, 0) });
  const mxS = Math.max(1, ...sem.map(s => s.v));
  const semH = sem.length > 1 ? `<div class="dec-col">${sem.map(s => `<i title="${new Date(s.t).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}: ${_cbUsd(s.v)}"><b style="height:${s.v * 100 / mxS}%"></b></i>`).join('')}</div>` : '';
  return _decSec('cobranza', 'Cobranza y mora', 'mora y gestiones: foto actual · cobros: período', `<div class="dec-kg">${k}</div><div class="dec-2"><div><h4>Mora por antigüedad (Bs)</h4>${mt.map(x => `<div class="dec-fun-r"><span>${x.t.replace('Mora ', '')} días</span>${_decBarra(x.bs, mxT, x.t.match(/91|\+180/) ? '#B4543F' : x.t.match(/61/) ? '#C98A3B' : '')}<b>${_decNum(Math.round(x.bs))}</b><em>${x.n} lotes</em><small></small></div>`).join('')}${semH ? '<h4 style="margin-top:14px">Cobro por semana</h4>' + semH : ''}</div><div><h4>Mayores deudores (más de 60 días)</h4>${tdeu}</div></div>`);
}

/* ── Marketing y campañas ── */
function decMarketingHTML(D, Rg, A, B, M) {
  const camps = {}; const c = k => (camps[k] = camps[k] || { leads: 0, ag: 0, cot: 0, res: 0, cli: new Set() });
  _decEn(D.leads, Rg.d, Rg.h).forEach(l => c(l.camp).leads += l.n);
  _decEn(D.vis, Rg.d, Rg.h).forEach(v => { const x = c(v.camp || 'Sin campaña'); x.ag++; x.cli.add(_cbN(v.cli)); });
  _decEn(D.cots, Rg.d, Rg.h).forEach(q => { const x = c(q.camp || 'Sin campaña'); x.cot++; x.cli.add(_cbN(q.cli)); });
  const res = _decEn(D.regs, Rg.d, Rg.h).filter(r => r.cierre);
  Object.values(camps).forEach(x => x.res = res.filter(r => x.cli.has(_cbN(r.cli))).length);
  const filas = Object.entries(camps).filter(([k]) => k).sort((a, b) => b[1].res - a[1].res || b[1].leads - a[1].leads);
  const inv = M.inversion;
  const tabla = filas.length ? `<table class="dec-t"><thead><tr><th>Campaña</th><th>Leads</th><th>Agendas</th><th>Lead → agenda</th><th>Cotiz.</th><th>Reservas</th><th>Agenda → reserva</th></tr></thead><tbody>${filas.map(([k, x]) => `<tr><td>${_cbEsc(k)}</td><td>${x.leads || '—'}</td><td>${x.ag || '—'}</td><td class="${x.leads >= 20 && _decPct(x.ag, x.leads) < 10 ? 'low' : ''}">${x.leads ? _decFmtPct(_decPct(x.ag, x.leads)) : '—'}</td><td>${x.cot || '—'}</td><td><b>${x.res || '—'}</b></td><td>${x.ag ? _decFmtPct(_decPct(x.res, x.ag)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="dec-vacio">Sin datos de campañas en el período.</p>';
  const org = {}; _decEn(D.regs, Rg.d, Rg.h).forEach(r => { if (r.cierre) (org[r.origen] = org[r.origen] || { v: 0, r: 0 }).r++; }); _decEn(D.vev || [], Rg.d, Rg.h).forEach(e => { (org[e.origen] = org[e.origen] || { v: 0, r: 0 }).v++; });
  const orgF = Object.entries(org).sort((a, b) => b[1].v - a[1].v || b[1].r - a[1].r), mxO = Math.max(1, ...orgF.map(([, o]) => o.v));
  const k = [
    _decK('Leads', _decNum(A.leads), _decDelta(A.leads, B.leads), M.leads ? 'Meta: ' + M.leads : ''),
    _decK('Lead → agenda', _decFmtPct(_decPct(A.agendas, A.leads)), _decDelta(_decPct(A.agendas, A.leads), _decPct(B.agendas, B.leads))),
    _decK('Inversión', inv ? _cbUsd(inv) : '—', '', inv ? 'Cargada en metas de marketing' : 'Sin inversión cargada en metas'),
    _decK('Costo por lead', inv && A.leads ? _cbUsd(inv / A.leads) : '—', ''),
    _decK('Costo por reserva', inv && A.reservas ? _cbUsd(inv / A.reservas) : '—', ''),
  ].join('');
  return _decSec('marketing', 'Marketing y campañas', 'qué campaña trae gente que compra', `<div class="dec-kg">${k}</div><div class="dec-2"><div><h4>Por campaña</h4>${tabla}</div><div><h4>Por origen (visitas y reservas)</h4>${orgF.map(([o, x]) => `<div class="dec-fun-r"><span>${_cbEsc(o)}</span>${_decBarra(x.v, mxO)}<b>${x.v}</b><em>${x.r} res.</em><small>${_decFmtPct(_decPct(x.r, x.v))}</small></div>`).join('') || '<p class="dec-vacio">Sin datos.</p>'}</div></div>`);
}

/* ── Inventario y precios ── */
function decInventarioHTML(D, Rg, A, B) {
  const mods = {}; const m = k => (mods[k] = mods[k] || { tot: 0, disp: 0, res: 0, vend: 0, valor: 0, cot: 0, ven: 0, dorm: 0 });
  const cot60 = new Set(D.cots.filter(c => c.ts > Date.now() - 60 * 864e5).map(c => _cbN(c.terreno)));
  D.lotes.forEach(l => { const x = m(l.mod); x.tot++; if (l.estado === 'Disponible') { x.disp++; x.valor += l.precio; if (!cot60.has(_cbN(l.terreno))) x.dorm++; } else if (/reserv/i.test(l.estado)) x.res++; else x.vend++; });
  _decEn(D.cots, Rg.d, Rg.h).forEach(c => { const k = String(c.terreno).split('-')[0]; if (mods[k]) mods[k].cot++; });
  _decEn(D.ventas, Rg.d, Rg.h).forEach(v => { if (mods[v.mod]) mods[v.mod].ven++; });
  const filas = Object.entries(mods).sort((a, b) => (+a[0] || 0) - (+b[0] || 0));
  const tabla = filas.length ? `<table class="dec-t"><thead><tr><th>Módulo</th><th>Lotes</th><th>Disponibles</th><th>Valor disponible</th><th>Cotizados</th><th>Vendidos</th><th>Demanda</th><th>Dormidos</th></tr></thead><tbody>${filas.map(([k, x]) => { const dem = x.disp ? x.cot / x.disp : null; return `<tr><td>${_cbEsc(k)}</td><td>${x.tot}</td><td>${x.disp}</td><td>${x.valor ? _decUsdK(x.valor) : '—'}</td><td>${x.cot || '—'}</td><td>${x.ven || '—'}</td><td class="${dem != null && dem >= 1 ? 'top' : dem === 0 && x.disp ? 'low' : ''}">${dem == null ? '—' : dem.toLocaleString('es-BO', { maximumFractionDigits: 1 })}</td><td class="${x.disp && x.dorm / x.disp > .7 ? 'low' : ''}">${x.dorm || '—'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="dec-vacio">Sin inventario cargado.</p>';
  const vs = _decEn(D.ventas, Rg.d, Rg.h), grp = (f) => { const o = {}; vs.forEach(v => { const k = f(v); (o[k] = o[k] || []).push(v); }); return Object.entries(o).map(([k, l]) => ({ k, n: l.length, desc: l.reduce((s, v) => s + v.desc, 0) / l.length, exc: l.filter(v => v.exced > 0).length })).sort((a, b) => b.n - a.n); };
  const tDesc = (t, rows) => rows.length ? `<h4>${t}</h4><table class="dec-t"><thead><tr><th></th><th>Ventas</th><th>Desc. prom.</th><th>Fuera de política</th></tr></thead><tbody>${rows.map(r => `<tr><td>${_cbEsc(r.k)}</td><td>${r.n}</td><td>${_decFmtPct(r.desc)}</td><td class="${r.exc ? 'low' : ''}">${r.exc || '—'}</td></tr>`).join('')}</tbody></table>` : '';
  const disp = D.lotes.filter(l => l.estado === 'Disponible');
  const k = [
    _decK('Disponibles', _decNum(disp.length), '', D.lotes.length + ' lotes en total'),
    _decK('Valor disponible', _decUsdK(disp.reduce((s, l) => s + l.precio, 0)), ''),
    _decK('Dormidos (60 días sin cotizar)', _decNum(disp.filter(l => !cot60.has(_cbN(l.terreno))).length), ''),
    _decK('Descuento promedio', _decFmtPct(A.descProm), _decDelta(A.descProm, B.descProm, true), 'Ventas concretadas del período'),
    _decK('Ventas fuera de política', A.exced.length || '—', '', A.exced.length ? 'Excedente total: ' + _cbUsd(A.exced.reduce((s, v) => s + v.exced, 0)) : 'Ninguna', A.exced.length ? 'alerta' : ''),
    _decK('Precio m² promedio', A.m2 ? _cbUsd(A.m2) : '—', _decDelta(A.m2, B.m2)),
  ].join('');
  return _decSec('inventario', 'Inventario y precios', 'stock: foto actual · ventas y descuentos: período', `<div class="dec-kg">${k}</div><div class="dec-2"><div><h4>Por módulo</h4>${tabla}</div><div>${tDesc('Descuento por categoría', grp(v => 'Categoría ' + v.cat))}${tDesc('Descuento por modalidad', grp(v => v.modalidad))}</div></div>`);
}


/* ── Vigilancia continua: reglas sobre datos reales que avisan lo que no se ve ──
   Cada señal dice qué pasa, cuánto, y deja ver la lista exacta. Se recalcula
   cuando cambian los datos y cada 3 minutos; las de prioridad alta se marcan
   en el acordeón aunque el tablero esté cerrado.                           */
function decVigilar(D) {
  D = D || decDatos();
  const S = [], ahora = Date.now(), dia = 864e5, hoyIso = new Date().toISOString().slice(0, 10), h0 = _cbHoy0();
  const add = (sev, area, t, det, items, ir) => S.push({ sev, area, t, det, items: items || [], ir });
  const mes0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), trans = Math.max(1, (ahora - mes0) / dia);
  const mk = new Date().getFullYear() + '-' + DEC_MESES[new Date().getMonth()], metaMes = dec.metas[mk] || {};
  // 1) Ritmo de cobranza y de reservas contra la meta del mes
  const pgM = _decEn(D.pagos, mes0, ahora + 1), vmM = (metaMes.cartera_vigente?.monto || 0) + (metaMes.cartera_mora?.monto || 0), mc = vmM || metaMes.cartera?.monto || 0, cob = pgM.filter(p => !vmM || p.tipo !== 'Venta Nueva').reduce((s, p) => s + p.monto, 0);
  if (mc && trans >= 5 && trans < diasMes) { const pr = cob / trans * diasMes, pc = pr * 100 / mc; if (pc < 92) add(pc < 75 ? 'alta' : 'media', 'Cobranza', `A este ritmo la cartera cierra el mes al ${Math.round(pc)}% de la meta`, `Cobrado ${_cbUsd(cob)} en ${Math.round(trans)} días; proyección ${_cbUsd(pr)} contra meta ${_cbUsd(mc)}. Faltan ${_cbUsd(Math.max(0, mc - cob))}: ${_cbUsd(Math.max(0, mc - cob) / Math.max(1, diasMes - trans))} por día.`, [], 'cartera'); }
  const resMes = _decEn(D.regs, mes0, ahora + 1).filter(r => r.cierre).length, mr = metaMes.cierres?.monto || metaMes.mkt_cierres?.monto || 0;
  if (mr && trans >= 7 && trans < diasMes) { const pr = resMes / trans * diasMes, pc = pr * 100 / mr; if (pc < 90) add(pc < 70 ? 'alta' : 'media', 'Ventas', `A este ritmo se llega al ${Math.round(pc)}% de la meta de reservas del mes`, `${resMes} reservas en ${Math.round(trans)} días (meta ${mr}). Hacen falta ${Math.max(0, mr - resMes)} más.`, [], 'tabla'); }
  // 2) Agendas del call center sin atender
  const pend = D.vis.filter(v => v.estado === 'pendiente' && v.fecha && v.fecha < hoyIso && ahora - v.ts > 2 * dia);
  if (pend.length) { const por = {}; pend.forEach(v => por[v.ases || 'Sin asesor'] = (por[v.ases || 'Sin asesor'] || 0) + 1);
    add(pend.length >= 5 ? 'alta' : 'media', 'Call center', `${pend.length} ${pend.length === 1 ? 'agenda vencida sigue' : 'agendas vencidas siguen'} sin atender`, 'Por asesor: ' + Object.entries(por).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} (${n})`).join(', ') + '.', pend.map(v => [v.cli, v.ases, 'visita del ' + v.fecha.split('-').reverse().join('/')]), 'cotizaciones'); }
  // 3) Clientes calientes sin visita agendada
  const agCli = new Map(); D.vis.forEach(v => { const k = _cbN(v.cli); agCli.set(k, Math.max(agCli.get(k) || 0, v.ts)); });
  const resCli = new Set(D.regs.filter(r => r.cierre).map(r => _cbN(r.cli)));
  const cal = D.cots.filter(c => c.vistas >= 2 && ahora - c.ult < 7 * dia && c.estado !== 'vencido' && !c.visitaKey && (agCli.get(_cbN(c.cli)) || 0) < c.ts && !resCli.has(_cbN(c.cli)));
  if (cal.length) add('media', 'Ventas', `${cal.length} ${cal.length === 1 ? 'cliente abrió' : 'clientes abrieron'} su cotización varias veces y no tienen visita agendada`, 'Son los más cerca de comprar y nadie los citó todavía.', cal.map(c => [c.cli, c.ases, c.vistas + ' vistas · última hace ' + _cbHace(c.ult)]), 'cotizaciones');
  // 4) Cotizaciones vencidas sin renovar
  const cotCli = {}; D.cots.forEach(c => { const k = _cbN(c.cli); cotCli[k] = Math.max(cotCli[k] || 0, c.ts); });
  const venc = D.cots.filter(c => c.estado === 'vencido' && ahora - c.ts < 30 * dia && cotCli[_cbN(c.cli)] === c.ts && !resCli.has(_cbN(c.cli)));
  if (venc.length >= 3) add('media', 'Ventas', `${venc.length} cotizaciones vencieron este mes y nadie las renovó`, 'Cada una es un cliente que se enfría.', venc.map(c => [c.cli, c.ases, c.codigo]), 'cotizaciones');
  // 5) Rachas por asesor (coincidencias seguidas)
  const por30 = {}; _decEn(D.regs, ahora - 30 * dia, ahora + 1).forEach(r => { if (r.cierre) (por30[r.ases] = por30[r.ases] || { v: 0, r: 0 }).r++; }); _decEn(D.vev || [], ahora - 30 * dia, ahora + 1).forEach(e => { (por30[e.ases] = por30[e.ases] || { v: 0, r: 0 }).v++; });
  Object.entries(por30).forEach(([a, x]) => { if (a && x.v >= 8 && !x.r) add('media', 'Equipo', `${a}: ${x.v} visitas en 30 días y ninguna reserva`, 'Racha larga sin cierre: vale revisar seguimiento, precios que ofrece o tipo de cliente que le llega.', [], 'tabla'); });
  const por7 = {}; _decEn(D.regs, ahora - 7 * dia, ahora + 1).filter(r => r.cierre).forEach(r => por7[r.ases] = (por7[r.ases] || 0) + 1);
  Object.entries(por7).forEach(([a, n]) => { if (a && n >= 3) add('info', 'Equipo', `${a} lleva ${n} reservas en 7 días`, 'Racha positiva: ver qué está haciendo distinto y replicarlo.', [], 'tabla'); });
  // 6) Caída de conversión
  const cv = (d, h) => { const r = _decEn(D.regs, d, h); return { n: r.length, c: _decPct(r.filter(x => x.cierre).length, r.length) }; };
  const c30 = cv(ahora - 30 * dia, ahora + 1), c120 = cv(ahora - 120 * dia, ahora - 30 * dia);
  if (c30.n >= 20 && c120.n >= 40 && c120.c - c30.c >= 5) add('alta', 'Ventas', `La conversión visita → reserva cayó de ${_decFmtPct(c120.c)} a ${_decFmtPct(c30.c)}`, `Últimos 30 días contra los 90 anteriores (${c30.n} y ${c120.n} visitas).`, [], 'tabla');
  // 7) Campañas que traen leads pero no agendas
  const camp14 = {}; _decEn(D.leads, ahora - 14 * dia, ahora + 1).forEach(l => camp14[l.camp] = (camp14[l.camp] || 0) + l.n);
  Object.entries(camp14).forEach(([k, n]) => { const ag = _decEn(D.vis, ahora - 14 * dia, ahora + 1).filter(v => v.camp === k).length; if (n >= 20 && ag / n < .05) add('alta', 'Marketing', `Campaña ${k}: ${n} leads en 14 días y ${ag} ${ag === 1 ? 'agenda' : 'agendas'}`, 'Se está pagando por leads que no se contactan o no califican.', [], 'marketing-admin'); });
  // 8) Descuentos fuera de política en la gestión
  const exc = _decEn(D.ventas, _decGestion0(), ahora + 1).filter(v => v.exced > 0);
  if (exc.length) add('media', 'Precios', `${exc.length} ${exc.length === 1 ? 'venta' : 'ventas'} de la gestión con descuento por encima de la política`, 'Excedente total: ' + _cbUsd(exc.reduce((s, v) => s + v.exced, 0)) + '.', exc.map(v => [v.cli, v.ases, v.terreno + ' · ' + _decFmtPct(v.desc)]), 'contratos');
  // 9) Mora: peso de +90 y cambio desde la última vez que se miró
  const mt = D.mora.reduce((s, m) => s + m.bs, 0), m90 = D.mora.filter(m => /91|\+180/.test(m.estado)).reduce((s, m) => s + m.bs, 0);
  if (mt && m90 / mt > .3) add('alta', 'Cobranza', `El ${Math.round(m90 * 100 / mt)}% de la mora tiene más de 90 días`, 'Bs ' + Math.round(m90).toLocaleString('es-BO') + ' difíciles de recuperar si no se gestionan ya.', D.mora.filter(m => /91|\+180/.test(m.estado)).sort((a, b) => b.bs - a.bs).map(m => [m.cli, m.terreno, m.estado + ' · Bs ' + Math.round(m.bs).toLocaleString('es-BO')]), 'cartera');
  try { const prev = JSON.parse(localStorage.getItem('uv-dec-mora') || 'null'); if (mt && prev && prev.dia !== hoyIso && prev.v && (mt - prev.v) / prev.v > .05) add('alta', 'Cobranza', `La mora subió ${Math.round((mt - prev.v) * 100 / prev.v)}% desde el ${prev.dia.split('-').reverse().join('/')}`, `De Bs ${Math.round(prev.v).toLocaleString('es-BO')} a Bs ${Math.round(mt).toLocaleString('es-BO')}.`, [], 'cartera');
    if (mt && (!prev || prev.dia !== hoyIso)) localStorage.setItem('uv-dec-mora', JSON.stringify({ dia: hoyIso, v: mt })); } catch (e) {}
  // 10) Compromisos vencidos y deudores sin gestión
  const cv2 = D.comps.filter(c => c.estado === 'Pendiente' && c.fecha && c.fecha < hoyIso);
  if (cv2.length) add('alta', 'Cobranza', `${cv2.length} ${cv2.length === 1 ? 'compromiso de pago venció' : 'compromisos de pago vencieron'} sin cerrarse`, 'Total comprometido: ' + _cbUsd(cv2.reduce((s, c) => s + c.monto, 0)) + '.', cv2.map(c => [c.cli, c.fecha.split('-').reverse().join('/'), _cbUsd(c.monto)]), 'cartera');
  const ultG = {}; D.gest.forEach(g => { const c = _cbN(g.cli); if (c) ultG[c] = Math.max(ultG[c] || 0, g.ts); });
  const sinG = D.mora.filter(m => /61|91|\+180/.test(m.estado) && (!ultG[_cbN(m.cli)] || ahora - ultG[_cbN(m.cli)] > 30 * dia));
  if (sinG.length && dec.gest) add(sinG.length >= 5 ? 'alta' : 'media', 'Cobranza', `${sinG.length} ${sinG.length === 1 ? 'deudor' : 'deudores'} con más de 60 días de mora sin gestión en el último mes`, 'Bs ' + Math.round(sinG.reduce((s, m) => s + m.bs, 0)).toLocaleString('es-BO') + ' sin que nadie llame.', sinG.sort((a, b) => b.bs - a.bs).map(m => [m.cli, m.terreno, m.estado + ' · Bs ' + Math.round(m.bs).toLocaleString('es-BO')]), 'cartera');
  // 11) Módulos que se cotizan pero no se venden (posible problema de precio)
  const cotMod = {}; D.cots.filter(c => ahora - c.ts < 60 * dia).forEach(c => { const k = String(c.terreno).split('-')[0]; cotMod[k] = (cotMod[k] || 0) + 1; });
  const venMod = {}; D.ventas.filter(v => ahora - v.ts < 90 * dia).forEach(v => venMod[v.mod] = (venMod[v.mod] || 0) + 1);
  Object.entries(cotMod).forEach(([k, n]) => { if (n >= 6 && !venMod[k]) add('media', 'Precios', `El módulo ${k} se cotizó ${n} veces en 60 días y no tuvo ventas en 90`, 'Hay interés pero no cierra: revisar precio, condiciones o el terreno que se ofrece.', [], 'inventario'); });
  // 12) Concentración del riesgo
  const resG = _decEn(D.regs, _decGestion0(), ahora + 1).filter(r => r.cierre), porA = {}; resG.forEach(r => porA[r.ases] = (porA[r.ases] || 0) + 1);
  const top = Object.entries(porA).sort((a, b) => b[1] - a[1])[0];
  if (top && resG.length >= 10 && top[1] / resG.length >= .45 && !dec.f.ases) add('info', 'Equipo', `${top[0]} concentra el ${Math.round(top[1] * 100 / resG.length)}% de las reservas de la gestión`, 'Si esa persona falta, las ventas caen fuerte. Conviene repartir cartera de clientes y capacitar.', [], 'tabla');
  // 13) Coincidencias: mismo cliente cotizado por varios asesores
  const cliA = {}; D.cots.filter(c => ahora - c.ts < 30 * dia).forEach(c => { const k = _cbN(c.cli); if (k) (cliA[k] = cliA[k] || { n: c.cli, a: new Set() }).a.add(c.ases); });
  const dup = Object.values(cliA).filter(x => x.a.size > 1);
  if (dup.length) add('media', 'Ventas', `${dup.length} ${dup.length === 1 ? 'cliente fue cotizado' : 'clientes fueron cotizados'} por más de un asesor este mes`, 'Puede haber choque de comisiones o el cliente recibiendo precios distintos.', dup.map(x => [x.n, [...x.a].join(' y '), '']));
  // 14) Terrenos calientes
  const terr = {}; D.cots.filter(c => ahora - c.ts < 14 * dia && c.terreno).forEach(c => terr[c.terreno] = (terr[c.terreno] || 0) + 1);
  const cal2 = Object.entries(terr).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  if (cal2.length) add('info', 'Inventario', `${cal2.length} ${cal2.length === 1 ? 'terreno se cotizó' : 'terrenos se cotizaron'} 3 veces o más en 2 semanas`, 'Mucha demanda sobre los mismos lotes: margen para sostener el precio.', cal2.map(([t, n]) => [t, n + ' cotizaciones', '']), 'inventario');
  // 15) Posibles clientes duplicados (para el padrón de la etapa 2)
  const porTel = {}; _decArr('todosRegs').forEach(r => { const t = String(r.celular || r.telefono || '').replace(/\D/g, '').slice(-8); if (t.length >= 7) (porTel[t] = porTel[t] || new Set()).add(_cbN(r.nombre)); });
  const dupTel = Object.entries(porTel).filter(([, s]) => s.size > 1);
  if (dupTel.length) add('info', 'Datos', `${dupTel.length} ${dupTel.length === 1 ? 'teléfono aparece' : 'teléfonos aparecen'} con nombres de cliente distintos`, 'Probablemente es la misma persona escrita de otra forma. Se resuelve con el código único de cliente.', dupTel.map(([t, s]) => [[...s].join(' / '), 'tel. …' + t.slice(-4), '']));
  const ord = { alta: 0, media: 1, info: 2 }; S.sort((a, b) => ord[a.sev] - ord[b.sev]);
  dec.sig = S; decBadge();
  return S;
}
function decVigiaHTML(S) {
  const n = { alta: S.filter(s => s.sev === 'alta').length, media: S.filter(s => s.sev === 'media').length };
  const cuerpo = S.length ? `<div class="dec-sig">${S.map((s, i) => `<div class="dec-s ${s.sev}"><div class="h"><span class="sev">${s.sev === 'alta' ? 'Prioridad alta' : s.sev === 'media' ? 'Atención' : 'Para saber'}</span><span class="area">${s.area}</span></div><b>${_cbEsc(s.t)}</b><p>${_cbEsc(s.det)}</p><div class="acc">${s.items.length ? `<button type="button" onclick="decVerSenal(${i})">Ver ${s.items.length}</button>` : ''}${s.ir ? `<button type="button" onclick="switchAdminTab('${s.ir}')">Ir al módulo</button>` : ''}</div></div>`).join('')}</div>` : '<p class="dec-vacio">Nada fuera de lo normal ahora mismo.</p>';
  return _decSec('vigia', 'Vigilancia continua', `${n.alta} de prioridad alta · ${n.media} de atención · se revisa sola cada 3 minutos`, cuerpo);
}
function decVerSenal(i) {
  const s = (dec.sig || [])[i]; if (!s) return;
  document.getElementById('dec-modal-c').innerHTML = `<button type="button" class="dec-x" onclick="document.getElementById('dec-modal').classList.remove('on')">×</button><div class="dec-s ${s.sev}" style="border:none;padding:0;background:none"><div class="h"><span class="sev">${s.area}</span></div><b>${_cbEsc(s.t)}</b><p>${_cbEsc(s.det)}</p></div>
    <table class="dec-t"><tbody>${s.items.slice(0, 300).map(r => `<tr>${r.map(c => `<td>${_cbEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  document.getElementById('dec-modal').classList.add('on');
}
function decBadge() {
  const n = (dec.sig || []).filter(s => s.sev === 'alta').length, b = document.getElementById('dec-badge');
  if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
}

/* ── Abrir, cargar lo que falta y mantener vivo ── */
async function decAbrir() {
  dec.abierto = true;
  try { const f = JSON.parse(localStorage.getItem('uv-dec-f') || 'null'); if (f && !dec.cargado) Object.assign(dec.f, f); const s = JSON.parse(localStorage.getItem('uv-dec-sec') || 'null'); if (s) dec.sec = s; } catch (e) {}
  if (!dec.cargado) {
    dec.cargado = true;
    if (typeof iniciarCobCRM === 'function') try { iniciarCobCRM(); } catch (e) {}
    if (!_decArr('orangeCarteraDetalleRaw').length && typeof cargarDetalleCobrosCartera === 'function') try { cargarDetalleCobrosCartera(true); } catch (e) {}
    if (!_decArr('orangeExpensasDetalleRaw').length && typeof cargarDetalleExpensas === 'function') try { cargarDetalleExpensas(true); } catch (e) {}
    if (window._fbCob) window._fbCob.get('cobcrm_gestiones').then(g => { dec.gest = g || {}; if (typeof cb !== 'undefined' && cb.gestiones == null) cb.gestiones = dec.gest; decPintar(); }).catch(() => { dec.gest = {}; });
  }
  decPintar(true);
  clearInterval(dec.timer); dec.firma = null;
  dec.timer = setInterval(() => { if (!dec.abierto) return; const f = typeof _cbFirma === 'function' ? _cbFirma() : []; if (!dec.firma || f.some((x, i) => x !== dec.firma[i])) { dec.firma = f; decPintar(); } }, 3000);
}
(function () {
  if (typeof UV_ICONOS !== 'undefined') UV_ICONOS.decisiones = '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><circle cx="16" cy="8" r="2"/>';
  const f = window.switchAdminTab;
  if (typeof f === 'function') window.switchAdminTab = function (id, ...r) {
    if (id !== 'decisiones') dec.abierto = false;
    const out = f.call(this, id, ...r);
    if (id === 'decisiones') decAbrir();
    return out;
  };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) {
    const out = ea.apply(this, a);
    const nav = document.getElementById('nav-grupo-decisiones'); if (nav) nav.style.display = '';
    // vigilancia de fondo: el número de avisos de prioridad alta aparece en el acordeón
    clearInterval(dec.fondo); setTimeout(() => { try { decVigilar(); } catch (e) {} }, 8000);
    dec.fondo = setInterval(() => { if (typeof modoAdmin !== 'undefined' && modoAdmin && !dec.abierto) try { decMetas(decRango().meses); decVigilar(); } catch (e) {} }, 180000);
    return out;
  };
})();


/* ════════════════════════════════════════════════════════════════════════
   INICIO · Resumen de todas las áreas (siempre al día)
   Usa el MISMO motor que el Tablero de decisiones, sobre los mismos datos
   que usa cada módulo (Orange, cotizaciones, call center, planilla…), así
   los números coinciden en todos lados. Se actualiza solo cuando cambia un
   dato. Cada tarjeta lleva a su módulo. El inicio anterior queda guardado
   y se puede volver a ver con un clic.
   ════════════════════════════════════════════════════════════════════════ */
const home2 = { firma: null, timer: null, cargado: false };
const _H_SIN = { per: 'mes', mes: null, gest: null, ases: '', camp: '' };

function homeV2Cargar() {
  if (home2.cargado) return; home2.cargado = true;
  // trae en segundo plano lo que el inicio necesita y que antes solo se cargaba al entrar a cada módulo
  try { if (typeof iniciarCobCRM === 'function') iniciarCobCRM(); } catch (e) {}
  try { if (!_decArr('orangeCarteraDetalleRaw').length && typeof cargarDetalleCobrosCartera === 'function') cargarDetalleCobrosCartera(true); } catch (e) {}
  try { if (!_decArr('orangeExpensasDetalleRaw').length && typeof cargarDetalleExpensas === 'function') cargarDetalleExpensas(true); } catch (e) {}
  if (window._fbCob && dec.gest == null) window._fbCob.get('cobcrm_gestiones').then(g => { dec.gest = g || {}; homeV2Pintar(); }).catch(() => { dec.gest = {}; });
}
function _hFila(lbl, val, delta, cls = '') { return `<div class="h2-f ${cls}"><span>${lbl}</span><b>${val}</b>${delta || ''}</div>`; }
function _hSpark(vals, fmt) {
  const mx = Math.max(1, ...vals.map(v => v.v));
  return `<div class="h2-sp">${vals.map((v, i) => `<i title="${v.l}: ${fmt(v.v)}"><b style="height:${Math.max(4, v.v * 100 / mx)}%" class="${i === vals.length - 1 ? 'act' : ''}"></b><em>${v.l}</em></i>`).join('')}</div>`;
}
function _hMeta(real, meta, fmt, lbl = 'Meta') {
  if (!meta) return _hFila('Meta del mes', '<span class="h2-sin">sin cargar</span>', '');
  const p = Math.round(real * 100 / meta);
  return `<div class="h2-meta"><div class="h2-meta-t"><span>${lbl} ${fmt(meta)}</span><b class="${p >= 100 ? 'ok' : p >= 70 ? 'med' : 'mal'}">${p}%</b></div><i><b style="width:${Math.min(100, p)}%" class="${p >= 100 ? 'ok' : p >= 70 ? 'med' : 'mal'}"></b><u style="left:${Math.min(100, home2.avance * 100)}%" title="Lo que debería llevar a la fecha"></u></i></div>`;
}

function homeV2Pintar() {
  if (typeof partePintar === 'function') return partePintar();   // Inicio = parte semanal de Gerencia
  const box = document.getElementById('home-v2'); if (!box || !document.getElementById('panel-home')?.classList.contains('active')) return;
  const D = decDatos(_H_SIN), now = new Date(), h0m = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), fin = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const tr = Date.now() - h0m, pd = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const A = decCalc(D, h0m, Date.now() + 1), B = decCalc(D, pd, Math.min(h0m, pd + tr));
  home2.avance = tr / (fin - h0m);
  const M = decMetas([{ anio: now.getFullYear(), mes: DEC_MESES[now.getMonth()], dias: 30 }]);
  // últimos 6 meses (para la tendencia de cada área)
  const meses = []; for (let k = 5; k >= 0; k--) { const a = new Date(now.getFullYear(), now.getMonth() - k, 1).getTime(), b = new Date(now.getFullYear(), now.getMonth() - k + 1, 1).getTime(); meses.push({ l: DEC_MESES[new Date(a).getMonth()].slice(0, 3), C: decCalc(D, a, Math.min(b, Date.now() + 1)) }); }
  const sp = (f, fmt) => _hSpark(meses.map(m => ({ l: m.l, v: f(m.C) })), fmt || _decNum);
  const sig = (() => { try { return decVigilar(D); } catch (e) { return []; } })();
  const hoyIso = now.toISOString().slice(0, 10), pendAg = D.vis.filter(v => v.estado === 'pendiente' && v.fecha && v.fecha < hoyIso).length;
  const agCli = new Set(D.vis.map(v => _cbN(v.cli))), cal = D.cots.filter(c => c.vistas >= 2 && Date.now() - c.ult < 7 * 864e5 && c.estado !== 'vencido' && !c.visitaKey && !agCli.has(_cbN(c.cli))).length;
  const mora = D.mora.reduce((s, m) => s + m.bs, 0), mora90 = D.mora.filter(m => /91|\+180/.test(m.estado)).reduce((s, m) => s + m.bs, 0), compV = D.comps.filter(c => c.estado === 'Pendiente' && c.fecha && c.fecha < hoyIso).length;
  const disp = D.lotes.filter(l => l.estado === 'Disponible'), ocup = D.lotes.length ? Math.round((D.lotes.length - disp.length) * 100 / D.lotes.length) : 0;
  const cot60 = new Set(D.cots.filter(c => c.ts > Date.now() - 60 * 864e5).map(c => _cbN(c.terreno))), dorm = disp.filter(l => !cot60.has(_cbN(l.terreno))).length;
  let proy = null; { const dias = (fin - h0m) / 864e5, t = Math.max(1, tr / 864e5); if (t >= 3) proy = _decCobMeta(A, M) / t * dias; }
  const area = (id, tit, ir, cuerpo, color) => `<div class="h2-a" style="--c:${color}" onclick="if(!event.target.closest('button'))switchAdminTab('${ir}')" title="Abrir ${tit}"><header><h4>${tit}</h4><span>Ver →</span></header>${cuerpo}</div>`;
  const C = id => CB_REG[CB_RI[id]]?.c || '#8F8676';
  const html = [
    decHoyHTML(D),
    sig.length ? `<div class="h2-al"><div class="h2-al-h"><b>Lo que hay que mirar hoy</b><span>${sig.filter(s => s.sev === 'alta').length} de prioridad alta</span><button type="button" onclick="switchAdminTab('decisiones')">Ver todo en Decisiones →</button></div>${sig.slice(0, 6).map((s, i) => `<button type="button" class="h2-s ${s.sev}" onclick="switchAdminTab('${s.ir || 'decisiones'}')" title="${_cbEsc(s.det)}"><span class="sev"></span><b>${_cbEsc(s.t)}</b><em>${s.area}</em></button>`).join('')}</div>` : '',
    `<div class="h2-grid">`,
    area('v', 'Ventas · reservas', 'dashboard', _hFila('Reservas del mes', _decNum(A.reservas), _decDelta(A.reservas, B.reservas)) + _hFila('Monto reservado', A.montoRes ? _decUsdK(A.montoRes) : '—', _decDelta(A.montoRes, B.montoRes)) + _hFila('Visitas registradas', _decNum(A.visitas), _decDelta(A.visitas, B.visitas)) + _hFila('Conversión visita → reserva', _decFmtPct(A.convVisRes), _decDelta(A.convVisRes, B.convVisRes)) + _hMeta(A.reservas, M.cierres, v => v + ' res.') + sp(c => c.reservas), C('ventas')),
    area('vc', 'Ventas concretadas', 'contratos', _hFila('Ventas del mes', _decNum(A.ventas), _decDelta(A.ventas, B.ventas)) + _hFila('Monto vendido', A.montoVentas ? _decUsdK(A.montoVentas) : '—', _decDelta(A.montoVentas, B.montoVentas)) + _hFila('Ticket promedio', A.ticket ? _decUsdK(A.ticket) : '—', '') + _hFila('Descuento promedio', _decFmtPct(A.descProm), _decDelta(A.descProm, B.descProm, true)) + _hFila('Fuera de política', A.exced.length || '—', '', A.exced.length ? 'mal' : '') + sp(c => c.montoVentas, _decUsdK), C('ventas')),
    area('cc', 'Call center · agendas', 'cotizaciones', _hFila('Agendas del mes', _decNum(A.agendas), _decDelta(A.agendas, B.agendas)) + _hFila('Atendidas', _decFmtPct(_decPct(A.agAtendidas, A.agendas)), _decDelta(_decPct(A.agAtendidas, A.agendas), _decPct(B.agAtendidas, B.agendas))) + _hFila('Vencidas sin atender (hoy)', pendAg || '—', '', pendAg ? 'mal' : '') + sp(c => c.agendas), C('callcenter')),
    area('co', 'Cotizaciones', 'cotizaciones', _hFila('Cotizaciones del mes', _decNum(A.cots), _decDelta(A.cots, B.cots)) + _hFila('Abiertas por el cliente', _decFmtPct(_decPct(A.cotAbiertas, A.cots)), '') + _hFila('Cotización → reserva', _decFmtPct(_decPct(A.cotConv, A.cots)), _decDelta(_decPct(A.cotConv, A.cots), _decPct(B.cotConv, B.cots))) + _hFila('Calientes sin visita (hoy)', cal || '—', '', cal ? 'mal' : '') + sp(c => c.cots), C('cotizaciones')),
    area('mk', 'Marketing', 'marketing-admin', _hFila('Leads del mes', _decNum(A.leads), _decDelta(A.leads, B.leads)) + _hFila('Lead → agenda', _decFmtPct(_decPct(A.agendas, A.leads)), '') + _hFila('Costo por lead', M.inversion && A.leads ? _cbUsd(M.inversion / A.leads) : '—', '') + _hMeta(A.leads, M.leads, v => v + ' leads') + sp(c => c.leads), C('marketing')),
    area('ca', 'Cartera · cobranza', 'cartera', _hFila('Cobrado del mes (Orange)', A.nPagos ? _decUsdK(A.cobTotal) : '—', _decDelta(A.cobTotal, B.cobTotal)) + _hFila('De cartera · de venta nueva', A.nPagos ? _decUsdK(A.cobCartera) + ' · ' + _decUsdK(A.cobNueva) : '—', '') + _hFila('Proyección al cierre', proy ? _decUsdK(proy) : '—', M.cartera && proy ? `<span class="dec-d ${proy >= M.cartera ? 'up' : 'dn'}">${Math.round(proy * 100 / M.cartera)}%</span>` : '') + _hFila('Mora total (hoy)', mora ? 'Bs ' + _decUsdK(mora).replace('$', '') : '—', '', '') + _hFila('Mora de más de 90 días', mora ? _decFmtPct(_decPct(mora90, mora)) : '—', '', mora && mora90 / mora > .3 ? 'mal' : '') + _hFila('Compromisos vencidos', compV || '—', '', compV ? 'mal' : '') + _hMeta(_decCobMeta(A, M), M.cartera, _decUsdK, M.carteraVM ? 'Meta vigente + mora' : 'Meta') + sp(c => c.cobTotal, _decUsdK), C('cartera')),
    area('ex', 'Expensas', 'expensas', _hFila('Cobrado del mes', A.nExp ? _cbBs(A.cobExp) : '—', _decDelta(A.cobExp, B.cobExp)) + _hFila('Cobros del mes', _decNum(A.nExp), _decDelta(A.nExp, B.nExp)) + _hMeta(A.cobExp, M.expensas, _cbBs) + sp(c => c.cobExp, _cbBs), C('expensas')),
    area('in', 'Inventario', 'inventario', _hFila('Disponibles', _decNum(disp.length), '') + _hFila('Ocupación', ocup + '%', '') + _hFila('Valor disponible', _decUsdK(disp.reduce((s, l) => s + l.precio, 0)), '') + _hFila('Dormidos (60 días sin cotizar)', dorm || '—', '', disp.length && dorm / disp.length > .6 ? 'mal' : ''), C('inventario')),
    `</div>`,
    `<div class="h2-pie">Mes en curso comparado con ${DEC_MESES[(now.getMonth() + 11) % 12].toLowerCase()} a la misma fecha · se actualiza solo · ${_decArr('orangeCarteraDetalleRaw').length ? '' : 'cargando cobros de Orange… · '}<button type="button" onclick="homeV2Legado(true)">Ver el inicio anterior</button></div>`,
  ].join('');
  box.innerHTML = html;
}
function homeV2Legado(on) {
  const p = document.getElementById('panel-home'); if (!p) return; p.classList.toggle('h2-legado', on);
  if (on) { try { renderHome(); } catch (e) {} }
}
function homeV2Iniciar() {
  const p = document.getElementById('panel-home'); if (!p || document.getElementById('home-v2')) return;
  const hdr = p.querySelector('.section-page-header'); const d = document.createElement('div'); d.id = 'home-v2';
  const back = document.createElement('div'); back.className = 'h2-volver'; back.innerHTML = '<button type="button" onclick="homeV2Legado(false)">← Volver al resumen nuevo</button>';
  if (hdr) { hdr.after(d); d.after(back); } else { p.prepend(back); p.prepend(d); }
  p.classList.add('h2');
}
(function () {
  const sw = window.switchAdminTab;
  if (typeof sw === 'function') window.switchAdminTab = function (id, ...r) { const out = sw.call(this, id, ...r); if (id === 'home') { homeV2Iniciar(); homeV2Pintar(); } return out; };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) {
    const out = ea.apply(this, a);
    homeV2Iniciar(); homeV2Cargar(); setTimeout(homeV2Pintar, 600);
    clearInterval(home2.timer);
    home2.timer = setInterval(() => {   // se repinta cuando cambia cualquier dato, y una vez por minuto por la hora
      if (!document.getElementById('panel-home')?.classList.contains('active')) return;
      const f = (typeof _cbFirma === 'function' ? _cbFirma() : []).concat([_decG('orangeMoraData'), dec.gest]);
      const min = Math.floor(Date.now() / 60000);
      if (!home2.firma || f.some((x, i) => x !== home2.firma[i]) || home2.min !== min) { home2.firma = f; home2.min = min; homeV2Pintar(); }
    }, 2500);
    return out;
  };
})();
