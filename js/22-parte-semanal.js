/* ════════════════════════════════════════════════════════════════════════
   INICIO · PARTE SEMANAL DE GERENCIA COMERCIAL
   Reemplaza el resumen de tarjetas. Tres capítulos: Ventas, Cartera y
   expensas, Call center. Cada bloque usa LA MISMA regla que el reporte de
   su módulo (cierre = _esCierreVenta, mes = _regEnMesAnio, visitas solo
   presenciales, cobranza por categoría, semanas ISO, metas de Panel de
   Control), así el número coincide con el reporte. No guarda nada salvo
   una foto semanal de la mora (cobcrm_parte) para poder mostrar su cambio.
   ════════════════════════════════════════════════════════════════════════ */
const parte = { sem: 'pasada', metas: {}, metasTs: 0, metaT: null, snap: null, snapPed: false, fotos: false, css: false };
try { parte.sem = localStorage.getItem('uv-parte-sem') || 'pasada'; } catch (e) {}
const P_DIA = 864e5;
const P_C = { ink: '#1C1A17', gold: '#8A6E3F', sand: '#CDBE98', green: '#2F4A34', greenL: '#6F8F6A', red: '#A33F27', mute: '#5C5547', hair: '#E6DECB', line: '#D5CAB2', cream: '#F2EEE1', card: '#FBF9F3' };
const _pE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _pAvg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const _pSum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
const _pN = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-BO', { minimumFractionDigits: d, maximumFractionDigits: d });
const _pMon = (v, pre) => v == null ? '—' : Math.abs(v) >= 1e6 ? pre + ' ' + _pN(v / 1e6, 2) + ' M' : Math.abs(v) >= 1e4 ? pre + ' ' + _pN(v / 1e3, Math.abs(v) < 1e5 ? 1 : 0) + ' mil' : pre + ' ' + _pN(v);
const _pUsd = v => _pMon(v, '$us'), _pBs = v => _pMon(v, 'Bs');
const _pMil = v => _pN((v || 0) / 1e3, Math.abs(v || 0) < 1e5 ? 1 : 0);
const _pLunes = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
const _pMasDias = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const _pSemN = t => _semanaISO(new Date(t)).semana;
const _pFechaC = t => { const d = new Date(t); return d.getDate() + ' ' + DEC_MESES[d.getMonth()].slice(0, 3).toLowerCase(); };
const _pTsReg = r => _cbTs(r.ts, r.fecha);
const _pPct = (a, b) => b ? Math.round(a * 100 / b) : null;

/* Meta de Panel de Control (misma lectura que usan los reportes). Devuelve null mientras carga. */
function _pMeta(anio, mes, tipo) {
  if (Date.now() - parte.metasTs > 6e5) { parte.metas = {}; parte.metasTs = Date.now(); }
  const k = anio + '|' + mes + '|' + tipo;
  if (k in parte.metas) return parte.metas[k];
  parte.metas[k] = null;
  try {
    Promise.resolve(window._fbGetMetaOnce(anio, mes, tipo)).then(v => { parte.metas[k] = Number(v) || 0; clearTimeout(parte.metaT); parte.metaT = setTimeout(partePintar, 250); }).catch(() => { parte.metas[k] = 0; });
  } catch (e) { parte.metas[k] = 0; }
  return null;
}
/* Meta de una semana: la meta mensual repartida por día (igual que el semanal de Expensas) */
function _pMetaSemana(lun, tipos) {
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(_pMasDias(lun, i)), dias = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    let m = 0; for (const t of tipos) { const v = _pMeta(d.getFullYear(), DEC_MESES[d.getMonth()], t); if (v == null) return null; m += v; }
    s += m / dias;
  }
  return s;
}
const _pM2 = r => { const met = r.metraje || (typeof _loteDeTerreno === 'function' ? _loteDeTerreno(r.terrenoInteres)?.metraje : 0) || 0; return met && r.precioVenta ? r.precioVenta / met : (r.precioM2Final || null); };
const _pMetraje = r => r.metraje || (typeof _loteDeTerreno === 'function' ? _loteDeTerreno(r.terrenoInteres)?.metraje : 0) || 0;
const _pDiasCierre = r => r.conclusionTs > 1e11 && _pTsReg(r) && r.conclusionTs >= _pTsReg(r) ? Math.round((r.conclusionTs - _pTsReg(r)) / P_DIA) : null;

/* ── Semana de referencia ── */
function _pSemanaRef(now) {
  const lunHoy = _pLunes(now.getTime());
  const lun = parte.sem === 'curso' ? lunHoy : _pMasDias(lunHoy, -7);
  return { lun, fin: _pMasDias(lun, 7), n: _pSemN(lun), lbl: 'Semana ' + _pSemN(lun) + ' · del ' + _pFechaC(lun) + ' al ' + _pFechaC(_pMasDias(lun, 6)) + ' de ' + new Date(_pMasDias(lun, 6)).getFullYear() };
}

/* ═════════════ Cálculo ═════════════ */
function _pVentas(now) {
  const regs = _decArr('todosRegs'), y = now.getFullYear(), m = now.getMonth(), dia = now.getDate();
  const enMes = (r, mm, yy) => _regEnMesAnio(r, DEC_MESES[mm], yy);
  const visInt = soloInternos(visitasComoRegs(regs)), internos = soloInternos(regs);
  const cierres = regs.filter(_esCierreVenta);
  const mesDe = (mm, yy) => {
    const c = cierres.filter(r => enMes(r, mm, yy)), ci = c.filter(r => !r.esExterno), monto = _pSum(c, _montoCierre);
    return { mm, yy, l: DEC_MESES[mm].slice(0, 3).toLowerCase(), c, n: c.length, ni: ci.length, ne: c.length - ci.length, monto, ticket: c.length ? monto / c.length : null,
      m2: _pAvg(c.map(_pM2).filter(Boolean)), desc: _pAvg(c.filter(r => r.descuentoPct).map(r => r.descuentoPct)), vis: visInt.filter(r => enMes(r, mm, yy)).length };
  };
  const meses = [];
  for (let k = 11; k >= 0; k--) { const d = new Date(y, m - k, 1), M = mesDe(d.getMonth(), d.getFullYear()); M.meta = _pMeta(M.yy, DEC_MESES[M.mm], 'mkt_cierres'); M.ant = cierres.filter(r => !r.esExterno && enMes(r, M.mm, M.yy - 1)).length; meses.push(M); }
  const cur = meses[11], prev = meses[10], diasMes = new Date(y, m + 1, 0).getDate();
  const diaDe = r => { const t = _pTsReg(r); return t ? new Date(t).getDate() : 1; };
  const prevAFecha = prev.c.filter(r => diaDe(r) <= dia);
  const proy = dia >= 3 && dia < diasMes ? Math.round(cur.ni / dia * diasMes) : null;
  // gestión abril–marzo
  const g0 = m >= 3 ? y : y - 1, gest = [];
  for (let i = 3; i < 15; i++) { const mm = i % 12, yy = i < 12 ? g0 : g0 + 1, fut = yy > y || (yy === y && mm > m); gest.push({ mm, yy, l: DEC_MESES[mm].slice(0, 3), fut, act: yy === y && mm === m, real: fut ? null : cierres.filter(r => !r.esExterno && enMes(r, mm, yy)).length, meta: _pMeta(yy, DEC_MESES[mm], 'mkt_cierres') }); }
  const cerr = gest.filter(g => !g.fut && !g.act), conMeta = cerr.filter(g => g.meta);
  // por asesor (mes)
  const OK = typeof crmAsesoresOK === 'function' ? crmAsesoresOK() : null, porA = {};
  const A = n => (porA[n] ||= { n, vis: 0, cot: 0, c: [], seg: 0 });
  internos.filter(r => enMes(r, m, y) && _esCierreVenta(r)).forEach(r => A(r.asesorNombre || 'Sin asignar').c.push(r));
  visInt.filter(r => enMes(r, m, y)).forEach(r => A(r.asesorNombre || 'Sin asignar').vis++);
  const m0 = new Date(y, m, 1).getTime(), m1 = new Date(y, m + 1, 1).getTime();
  const cots = _decArr('cotizacionesData').filter(c => c.ts >= m0 && c.ts < m1 && c.estado !== 'anulada');
  cots.forEach(c => { if (c.asesorNombre) A(c.asesorNombre).cot++; });
  const segAct = internos.filter(r => r.conclusion === 'Seguimiento' || r.conclusion === 'Re-agendado');
  segAct.forEach(r => A(r.asesorNombre || 'Sin asignar').seg++);
  const asesores = Object.values(porA).filter(a => ((!OK || OK.has(a.n)) && (a.vis || a.c.length || a.cot || a.seg)) || a.c.length).sort((a, b) => b.c.length - a.c.length || b.vis - a.vis);
  asesores.forEach(a => { const cp = a.c.find(r => r.cerradoPor)?.cerradoPor; if (cp && (!OK || !OK.has(a.n))) a.etiqueta = cp; });
  // cotizaciones del mes (mismos estados que el panel Cotizaciones)
  const est = c => typeof _czEstado === 'function' ? _czEstado(c) : _estadoRealCotizacion(c), conv = c => { try { return cotzConvertida(c); } catch (e) { return false; } };
  const cz = { n: cots.length, vistas: cots.filter(c => c.vistas > 0).length, conv: 0, conf: 0, pend: 0, venc: 0 };
  cots.forEach(c => { if (conv(c)) cz.conv++; else { const e = est(c); if (e === 'confirmado') cz.conf++; else if (e === 'vencido') cz.venc++; else cz.pend++; } });
  // seguimiento activo por antigüedad y descartados del mes
  const edad = r => (now - _pTsReg(r)) / P_DIA, seg = [0, 0, 0, 0];
  segAct.forEach(r => { const e = edad(r); seg[e < 15 ? 0 : e <= 30 ? 1 : e <= 60 ? 2 : 3]++; });
  const desc = internos.filter(r => enMes(r, m, y) && r.conclusion === 'Descartado'), mot = {};
  desc.forEach(r => { const k = (r.motivoNoCierre || 'Sin motivo').trim().slice(0, 40) || 'Sin motivo'; mot[k] = (mot[k] || 0) + 1; });
  const dDesc = desc.filter(r => r.conclusionTs && r.ts).map(r => (r.conclusionTs - r.ts) / P_DIA);
  // embudo (el mismo del panel Ventas) + ventas concretadas del mes
  let emb = []; try { emb = calcularFunnelDatos(DEC_MESES[m], y).map(e => ({ l: e.label, n: e.n })); } catch (e) {}
  const vc = _decArr('ventasConcretadasData').filter(v => { const t = _cbTs(0, v.fechaReserva); return t ? t >= m0 && t < m1 : (v.mes === DEC_MESES[m] && Number(v.anio || v['año']) === y); });
  emb.push({ l: 'Ventas concretadas', n: vc.length });
  // dispersión: días al cierre vs descuento, cierres de la gestión
  const gIni = new Date(g0, 3, 1).getTime(), pts = cierres.filter(r => _pTsReg(r) >= gIni && r.descuentoPct > 0 && _pDiasCierre(r) != null).map(r => ({ d: _pDiasCierre(r), p: r.descuentoPct, act: enMes(r, m, y), t: r.terrenoInteres || '' }));
  return { meses, cur, prev, prevAFecha, proy, dia, diasMes, gest, cerr, conMeta, asesores, cz, seg, segN: segAct.length, segMonto: _pSum(segAct, r => r.precioVenta || r.precioLista || 0), desc: desc.length, mot: Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 4), dDesc: _pAvg(dDesc), emb, pts,
    pendAut: _decArr('ventasConcretadasData').filter(v => v.estadoAutorizacion === 'pendiente').length, tasa: _pPct(cur.ni, cur.vis), tasaPrev: _pPct(prev.ni, prev.vis) };
}

function _pCobranza(now, S, o) {
  // o: { pagos, cats, vm:[categorías que cuentan para la meta], metas:[tipos], orden:[categorías] }
  const y = now.getFullYear(), m = now.getMonth(), m0 = new Date(y, m, 1).getTime(), g0 = _decGestion0(now.getTime());
  const pg = o.pagos.filter(p => p.fechaOrden), cat = p => o.cats[p.key]?.categoria || '', enMeta = p => o.vm.includes(cat(p));
  const en = (a, b) => pg.filter(p => p.fechaOrden >= a && p.fechaOrden < b);
  const sem = en(S.lun, S.fin), semAnt = en(_pMasDias(S.lun, -7), S.lun), mes = en(m0, now.getTime() + 1), gest = en(g0, now.getTime() + 1);
  const gAnt = en(new Date(new Date(g0).getFullYear() - 1, 3, 1).getTime(), now.getTime() - 365 * P_DIA);
  const semanas = [];
  for (let k = 11; k >= 0; k--) { const lun = _pMasDias(S.lun, -7 * k), l = en(lun, _pMasDias(lun, 7)); semanas.push({ lun, n: _pSemN(lun), total: _pSum(l, p => p.monto), vm: _pSum(l.filter(enMeta), p => p.monto), meta: _pMetaSemana(lun, o.metas) }); }
  let metaMes = 0; for (const t of o.metas) { const v = _pMeta(y, DEC_MESES[m], t); if (v == null) { metaMes = null; break; } metaMes += v; }
  const cols = [3, 2, 1, 0].map(k => { const lun = _pMasDias(S.lun, -7 * k); return { n: _pSemN(lun), l: en(lun, _pMasDias(lun, 7)) }; });
  const filas = o.orden.map(c => ({ c, sem: cols.map(k => _pSum(k.l.filter(p => cat(p) === c), p => p.monto)), mes: _pSum(mes.filter(p => cat(p) === c), p => p.monto) })).filter(f => f.mes || f.sem.some(Boolean));
  const sinCat = mes.filter(p => !cat(p));
  const m12 = []; for (let k = 11; k >= 0; k--) { const a = new Date(y, m - k, 1).getTime(), b = new Date(y, m - k + 1, 1).getTime(); m12.push(_pSum(en(a, Math.min(b, now.getTime() + 1)), p => p.monto)); }
  return { sem: _pSum(sem, p => p.monto), semAnt: _pSum(semAnt, p => p.monto), mes: _pSum(mes, p => p.monto), mesVM: _pSum(mes.filter(enMeta), p => p.monto), metaMes, gest: _pSum(gest, p => p.monto), gAnt: _pSum(gAnt, p => p.monto),
    semanas, cols, filas, sinCat: { n: sinCat.length, m: _pSum(sinCat, p => p.monto), sem: cols.map(k => _pSum(k.l.filter(p => !cat(p)), p => p.monto)) }, totSem: cols.map(k => _pSum(k.l, p => p.monto)), m12, hay: pg.length > 0 };
}
const P_TIERS = ['Mora 1-30', 'Mora 31-60', 'Mora 61-90', 'Mora 91-180', 'Mora +180'], P_TIER_L = ['1 a 30 días', '31 a 60', '61 a 90', '91 a 180', 'Más de 180'];
function _pMora() {
  const car = _decArr('orangeCarteraData'), exp = _decArr('orangeMoraData');
  const mc = P_TIERS.map(t => { const l = car.filter(r => r.estado === t); return { m: _pSum(l, r => (r.adeudadoTerreno || 0) + (r.adeudadoAccion || 0)), n: l.length }; });
  const me = P_TIERS.map(t => { const l = exp.filter(r => r.estado === t); return { m: _pSum(l, r => r.montoAdeudadoBS || 0), n: l.length }; });
  const top = car.filter(r => /^Mora/.test(r.estado || '')).map(r => ({ cli: r.cliente || '—', terreno: r.terreno || '', dias: r.diasMora || 0, m: (r.adeudadoTerreno || 0) + (r.adeudadoAccion || 0), estado: r.estado })).sort((a, b) => b.m - a.m).slice(0, 5);
  return { mc, me, top, hayC: car.length > 0, hayE: exp.length > 0 };
}
/* Foto semanal de la mora: se guarda una vez por semana ISO para poder mostrar cuánto cambió */
function _pSnap(now, M) {
  if (!window._fbCob) return {};
  if (!parte.snapPed) { parte.snapPed = true; window._fbCob.get('cobcrm_parte/snap').then(s => { parte.snap = s || {}; partePintar(); }).catch(() => { parte.snap = {}; }); }
  if (!parte.snap) return {};
  const k = ts => { const i = _semanaISO(new Date(ts)); return i.anio + '-S' + String(i.semana).padStart(2, '0'); }, hoyK = k(now.getTime());
  if (!parte.snap[hoyK] && (M.hayC || M.hayE)) {
    const d = { ts: Date.now(), mc: M.mc.map(x => Math.round(x.m)), me: M.me.map(x => Math.round(x.m)), hc: M.hayC ? 1 : 0, he: M.hayE ? 1 : 0 };
    parte.snap[hoyK] = d; try { window._fbCob.set('cobcrm_parte/snap/' + hoyK, d).catch(() => {}); } catch (e) {}
  }
  const S = _pSemanaRef(now); return { ref: parte.snap[k(S.lun)] || null, serie: Object.keys(parte.snap).sort().slice(-12).map(x => ({ k: x, d: parte.snap[x] })) };
}
function _pSeguimientoCob(S) {
  const hoy = new Date().toISOString().slice(0, 10), comps = Object.values(_decObj('cobCompromisos'));
  const iso = t => new Date(t).toISOString().slice(0, 10), a = iso(S.lun + 432e5), b = iso(S.fin - 432e5);
  const deSem = comps.filter(c => c.fecha && c.fecha >= a && c.fecha <= b);
  const g = []; Object.values((typeof dec !== 'undefined' && dec.gest) || {}).forEach(gs => Object.values(gs || {}).forEach(x => { const t = x.ts || _cbTs(0, x.fecha); if (t >= S.lun && t < S.fin && x.canal !== 'Sistema') g.push(x); }));
  const can = {}; g.forEach(x => { const k = x.canal || 'Otro'; can[k] = (can[k] || 0) + 1; });
  return { n: deSem.length, ok: deSem.filter(c => c.estado === 'Cumplido').length, mal: deSem.filter(c => c.estado !== 'Cumplido' && c.fecha < hoy).length, venc: comps.filter(c => c.estado === 'Pendiente' && c.fecha && c.fecha < hoy).length, gest: g.length, can: Object.entries(can).sort((x, z) => z[1] - x[1]).slice(0, 3) };
}

function _pCall(now, S) {
  const y = now.getFullYear(), m = now.getMonth(), m0 = new Date(y, m, 1).getTime(), hoy = now.toISOString().slice(0, 10);
  let all = []; try { all = ccAsignaciones(); } catch (e) {}
  const OK = typeof crmAsesoresOK === 'function' ? crmAsesoresOK() : null; if (OK) all = all.filter(a => !a.as || OK.has(a.as));
  const mes = all.filter(a => a.ts >= m0), sem = all.filter(a => a.ts >= S.lun && a.ts < S.fin);
  const vino = mes.filter(a => a.visito).length, noVino = mes.filter(a => a.agendaPasada).length, porVenir = mes.filter(a => !a.visito && !a.agendaPasada).length;
  const devs = _decArr('visitasProgramadasData').filter(v => v.esDevolucion && (v.ts || 0) >= m0).length;
  const leadsDep = typeof leadsSemanalesDepurados === 'function' ? leadsSemanalesDepurados() : [], lMes = leadsDep.filter(l => l.mes === DEC_MESES[m] && Number(l.anio) === y);
  const leads = _pSum(lMes, l => Number(l.cantidad) || 0);
  const ym = y + '-' + String(m + 1).padStart(2, '0'), invM = Object.values((_decObj('mkpInversion') || {})[ym] || {}), inv = _pSum(invM, x => Number(x?.monto) || 0) || (_pMeta(y, DEC_MESES[m], 'mkt_inversion') || 0);
  const reservas = mes.filter(a => a.reserva).length;
  // semanas (8)
  const visInt = soloInternos(visitasComoRegs(_decArr('todosRegs'))), sems = [];
  for (let k = 7; k >= 0; k--) { const a = _pMasDias(S.lun, -7 * k), b = _pMasDias(a, 7); sems.push({ n: _pSemN(a), leads: _pSum(leadsDep.filter(l => { const t = _cbTs(0, l.desde); return t >= a && t < b; }), l => Number(l.cantidad) || 0), citas: all.filter(x => x.ts >= a && x.ts < b).length, vis: visInt.filter(r => { const t = _pTsReg(r); return t >= a && t < b; }).length }); }
  // cuándo son las citas (últimos 28 días, por fecha y hora de la cita)
  const FR = [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 21]], heat = [0, 1, 2, 3, 4, 5, 6].map(() => FR.map(() => 0)); let conHora = 0, tot28 = 0;
  const d28 = new Date(now.getTime() - 28 * P_DIA).toISOString().slice(0, 10);
  all.forEach(a => { const v = a.v; if (!v.fecha || v.fecha < d28 || v.fecha > hoy) return; tot28++; const h = parseInt(String(v.hora || '').slice(0, 2), 10); if (isNaN(h)) return; const f = FR.findIndex(x => h >= x[0] && h < x[1]); if (f < 0) return; conHora++; heat[(new Date(v.fecha + 'T12:00:00').getDay() + 6) % 7][f]++; });
  const porDia = [0, 1, 2, 3, 4, 5, 6].map(i => all.filter(a => a.v.fecha && a.v.fecha >= d28 && a.v.fecha <= hoy && (new Date(a.v.fecha + 'T12:00:00').getDay() + 6) % 7 === i).length);
  // agenda de los próximos 7 días
  const ag = []; for (let i = 0; i < 7; i++) { const t = _pMasDias(new Date(hoy + 'T12:00:00').getTime(), i), f = new Date(t).toISOString().slice(0, 10), l = all.filter(a => a.v.fecha === f && a.v.estado !== 'cancelada'), por = {}; l.forEach(a => { const k = a.as || 'Sin asignar'; por[k] = (por[k] || 0) + 1; }); ag.push({ l: CC_DIAS[(new Date(t).getDay() + 6) % 7] + ' ' + new Date(t).getDate(), n: l.length, por }); }
  const agAs = [...new Set(ag.flatMap(d => Object.keys(d.por)))].sort((a, b) => _pSum(ag, d => d.por[b] || 0) - _pSum(ag, d => d.por[a] || 0));
  // de la campaña a la reserva
  const fu = {}; const F = k => (fu[k] ||= { k, leads: 0, inv: 0, citas: 0, vis: 0, res: 0 });
  lMes.forEach(l => F(l.campaniaCodigo || 'Sin código').leads += Number(l.cantidad) || 0);
  invM.forEach(x => { if (x?.codigo) F(x.codigo).inv += Number(x.monto) || 0; });
  mes.forEach(a => { const f = F(a.fuente); f.citas++; if (a.visito) f.vis++; if (a.reserva) f.res++; });
  const camp = Object.values(fu).sort((a, b) => b.leads - a.leads || b.citas - a.citas);
  // respuesta por asesor
  const porA = {}; mes.forEach(a => { if (a.as) (porA[a.as] ||= []).push(a); });
  const resp = Object.entries(porA).map(([n, l]) => ({ n, med: _ccMed(l.filter(a => !a.sinAtender).map(a => a.resp)), venc: l.filter(a => a.vencida).length, tot: l.length })).sort((a, b) => b.tot - a.tot).slice(0, 6);
  const esp = _ccMed(mes.filter(a => a.leadTs).map(a => (a.ts - a.leadTs) / 36e5));
  return { mes: mes.length, sem: sem.length, vino, noVino, porVenir, devs, leads, inv, reservas, asist: _pPct(vino, vino + noVino), sems, heat, conHora, tot28, porDia, FR, ag, agAs, camp, resp, esp, venc: mes.filter(a => a.vencida).length, sla: CC.sla, visMes: vino };
}

/* ═════════════ Gráficos (SVG) ═════════════ */
const _pT = (x, y, s, o = {}) => `<text x="${Math.round(x * 10) / 10}" y="${Math.round(y * 10) / 10}" font-size="${o.fs || 11}" font-weight="${o.fw || 500}" fill="${o.c || P_C.mute}" text-anchor="${o.a || 'middle'}">${s}</text>`;
const _pL = (x1, y1, x2, y2, c, w = 1, dash) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const _pR = (x, y, w, h, c, ex = '') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${c}" ${ex}/>`;
const _pSvg = (w, h, b, lbl) => `<svg class="pt-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${_pE(lbl)}">${b}</svg>`;
const _pEje = max => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1)))), paso = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => max / s <= 5) || p * 10; const out = []; for (let v = 0; v <= max + paso * .999; v += paso) out.push(v); return out; };

function _pgCierres(V) {
  const W = 880, H = 330, x0 = 34, x1 = W - 10, y0 = 36, yb = H - 34, ms = V.meses;
  const eje = _pEje(Math.max(4, ...ms.map(q => Math.max(q.n, q.meta || 0, q.ant)), V.proy || 0)), max = eje[eje.length - 1], Y = n => yb - n / max * (yb - y0), bw = (x1 - x0) / 12;
  let s = eje.map(g => _pL(x0, Y(g), x1, Y(g), P_C.hair) + _pT(x0 - 8, Y(g) + 4, _pN(g), { a: 'end', fs: 10.5 })).join('');
  const iG = ms.findIndex(q => q.mm === 3); if (iG > 0) s += _pR(x0 + bw * iG - 1, y0 - 16, 1, yb - y0 + 16, P_C.line) + _pT(x0 + bw * iG + 6, y0 - 8, 'Gestión ' + ms[iG].yy + '–' + String(ms[iG].yy + 1).slice(2), { a: 'start', fs: 10.5, fw: 700, c: '#6A5229' });
  ms.forEach((q, i) => {
    const cx = x0 + bw * i + bw / 2, w = bw * .56, last = i === 11, ok = q.meta ? q.ni >= q.meta : null, col = last ? P_C.ink : ok ? P_C.green : P_C.sand;
    if (last && V.proy != null && V.proy > q.ni) s += _pR(cx - w / 2, Y(V.proy), w, Y(0) - Y(V.proy), 'none', `stroke="${P_C.ink}" stroke-width="1.2" stroke-dasharray="4 3"`) + _pT(cx + w / 2, Y(V.proy) - 7, 'cierre proyectado: ' + V.proy, { a: 'end', fs: 10.5, fw: 700, c: P_C.ink });
    if (q.ne) s += _pR(cx - w / 2, Y(q.n), w, Y(q.ni) - Y(q.n), 'none', `stroke="${P_C.gold}" stroke-width="1.4"`);
    s += _pR(cx - w / 2, Y(q.ni), w, Y(0) - Y(q.ni), col);
    s += q.ni ? _pT(cx, Y(0) - 9, q.ni + (q.ne ? '+' + q.ne : ''), { fs: 13.5, fw: 700, c: last || ok ? P_C.cream : P_C.ink }) : _pT(cx, Y(0) - 6, q.ne ? '0+' + q.ne : '0', { fs: 12, fw: 700, c: P_C.ink });
    if (q.meta) s += _pL(cx - w / 2 - 6, Y(q.meta), cx + w / 2 + 6, Y(q.meta), P_C.ink, 2.4);
    if (q.ant) s += `<circle cx="${(cx + w / 2 + 12).toFixed(1)}" cy="${Y(q.ant).toFixed(1)}" r="3.6" fill="${P_C.card}" stroke="${P_C.gold}" stroke-width="1.8"/>`;
    s += _pT(cx, yb + 17, q.l, { fs: 11.5, fw: last ? 700 : 500, c: last ? P_C.ink : P_C.mute });
  });
  return _pSvg(W, H, s + _pL(x0, yb, x1, yb, P_C.ink, 1.2), 'Cierres por mes de los últimos doce meses, con meta y año anterior');
}
function _pgSpark(vals, fmt, o = {}) {
  const W = 400, H = o.h || 86, x0 = 6, x1 = W - 74, y0 = 16, yb = H - 20, ix = vals.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
  if (ix.length < 2) return `<p class="pt-vacio">Todavía no hay historia suficiente.</p>`;
  const vs = ix.map(i => vals[i]), mn = Math.min(...vs), mx = Math.max(...vs), sp = mx - mn || 1, c = o.c || P_C.ink;
  const P = ix.map(i => [x0 + (x1 - x0) * i / (vals.length - 1), yb - (vals[i] - mn) / sp * (yb - y0)]), pts = P.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  let s = _pL(x0, yb + 6, x1, yb + 6, P_C.line) + `<polygon points="${pts} ${P[P.length - 1][0].toFixed(1)},${yb + 6} ${P[0][0].toFixed(1)},${yb + 6}" fill="${o.fill || '#EAE2CE'}" opacity=".55"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const iMx = vs.indexOf(mx), iMn = vs.indexOf(mn), dot = (p, t, dy) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${P_C.card}" stroke="${c}" stroke-width="1.6"/>` + _pT(p[0], p[1] + dy, t, { fs: 10 });
  if (iMx !== vs.length - 1 && iMx !== 0) s += dot(P[iMx], fmt(mx), -7);
  if (iMn !== vs.length - 1 && iMn !== 0 && iMn !== iMx) s += dot(P[iMn], fmt(mn), 15);
  const lp = P[P.length - 1];
  s += `<circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="4.5" fill="${c}"/>` + _pT(lp[0] + 10, lp[1] + 4, fmt(vs[vs.length - 1]), { a: 'start', fs: 12.5, fw: 700, c: P_C.ink });
  return _pSvg(W, H, s + _pT(x0, H - 2, o.l0 || '', { a: 'start', fs: 10 }) + _pT(x1, H - 2, o.l1 || '', { a: 'end', fs: 10 }), o.lbl || 'Tendencia');
}
function _pgScatter(pts) {
  if (pts.length < 4) return `<p class="pt-vacio">Se dibuja cuando haya al menos 4 cierres de la gestión con fecha de reserva y descuento cargados (hay ${pts.length}).</p>`;
  const W = 420, H = 280, x0 = 38, x1 = W - 14, y0 = 14, yb = H - 36;
  const ex = _pEje(Math.max(20, ...pts.map(p => p.d))), ey = _pEje(Math.max(5, ...pts.map(p => p.p))), mx = ex[ex.length - 1], my = ey[ey.length - 1], X = d => x0 + Math.min(d, mx) / mx * (x1 - x0), Y = p => yb - p / my * (yb - y0);
  let s = ey.map(g => _pL(x0, Y(g), x1, Y(g), P_C.hair) + _pT(x0 - 7, Y(g) + 4, _pN(g) + '%', { a: 'end', fs: 10.5 })).join('') + ex.map(g => _pT(X(g), yb + 16, _pN(g), { fs: 10.5 })).join('') + _pT((x0 + x1) / 2, H - 4, 'días entre la primera visita y la reserva', { fs: 10.5, fw: 600 });
  pts.filter(p => !p.act).forEach(p => { s += `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.p).toFixed(1)}" r="4" fill="${P_C.sand}" stroke="${P_C.gold}"/>`; });
  if (pts.length >= 8) { const n = pts.length, sx = _pSum(pts, p => p.d), sy = _pSum(pts, p => p.p), sxx = _pSum(pts, p => p.d * p.d), sxy = _pSum(pts, p => p.d * p.p), den = n * sxx - sx * sx; if (den) { const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n, yy = d => Math.max(0, Math.min(my, a + b * d)); s += _pL(X(0), Y(yy(0)), X(mx), Y(yy(mx)), P_C.ink, 1.4, '5 4'); } }
  pts.filter(p => p.act).forEach(p => { s += `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.p).toFixed(1)}" r="6" fill="${P_C.ink}" stroke="${P_C.card}" stroke-width="1.6"/>` + _pT(X(p.d) + 9, Y(p.p) - 7, _pE(String(p.t).split('-').pop()), { a: 'start', fs: 10.5, fw: 700, c: P_C.ink }); });
  return _pSvg(W, H, s + _pL(x0, yb, x1, yb, P_C.ink, 1.2), 'Descuento otorgado según los días que tardó el cierre');
}
function _pgSemanal(sems, lbl, unidad, refN) {
  const W = 760, H = 250, x0 = 40, x1 = W - 8, y0 = 28, yb = H - 30, K = 1e3;
  const eje = _pEje(Math.max(1, ...sems.map(q => Math.max(q.total, q.meta || 0))) / K), max = eje[eje.length - 1] * K, Y = n => yb - n / max * (yb - y0), bw = (x1 - x0) / sems.length;
  let s = eje.map(g => _pL(x0, Y(g * K), x1, Y(g * K), P_C.hair) + _pT(x0 - 7, Y(g * K) + 4, _pN(g), { a: 'end', fs: 10.5 })).join(''), hayMeta = false;
  sems.forEach((q, i) => {
    const cx = x0 + bw * i + bw / 2, w = bw * .6, ref = q.n === refN && i === sems.length - 1, ok = q.meta ? q.vm >= q.meta : null, col = ref ? P_C.ink : ok ? P_C.green : P_C.sand;
    if (q.total > q.vm) s += _pR(cx - w / 2, Y(q.total), w, Y(q.vm) - Y(q.total), '#EFE8D6', `stroke="${P_C.line}"`);
    s += _pR(cx - w / 2, Y(q.vm), w, Y(0) - Y(q.vm), col);
    if (q.total) s += _pT(cx, Y(q.total) - 5, _pMil(q.total), { fs: 11.5, fw: 700, c: P_C.ink });
    if (q.meta) { hayMeta = true; s += _pL(cx - w / 2 - 5, Y(q.meta), cx + w / 2 + 5, Y(q.meta), P_C.ink, 2.4); }
    s += _pT(cx, yb + 17, 'S' + q.n, { fs: 11, fw: ref ? 700 : 500, c: ref ? P_C.ink : P_C.mute });
  });
  return _pSvg(W, H, s + _pT(x1, 12, 'miles de ' + unidad + (hayMeta ? ' · marca negra: meta de la semana' : ' · sin meta cargada'), { a: 'end', fs: 10.5, fw: 600 }) + _pL(x0, yb, x1, yb, P_C.ink, 1.2), lbl);
}
function _pgCC(sems) {
  const W = 440, H = 250, x0 = 30, x1 = W - 96, y0 = 16, yb = H - 28, S = [['leads', 'leads', P_C.gold], ['citas', 'citas', P_C.green], ['vis', 'visitas', P_C.ink]];
  const eje = _pEje(Math.max(4, ...sems.map(q => Math.max(q.leads, q.citas, q.vis)))), max = eje[eje.length - 1], X = i => x0 + (x1 - x0) * i / (sems.length - 1), Y = n => yb - n / max * (yb - y0);
  let s = eje.map(g => _pL(x0, Y(g), x1, Y(g), P_C.hair) + _pT(x0 - 6, Y(g) + 4, _pN(g), { a: 'end', fs: 10.5 })).join('') + sems.map((q, i) => _pT(X(i), yb + 16, 'S' + q.n, { fs: 10.5, fw: i === sems.length - 1 ? 700 : 500, c: i === sems.length - 1 ? P_C.ink : P_C.mute })).join('');
  const ys = []; S.forEach(([k, n, c]) => { const v = sems.map(q => q[k]), u = v[v.length - 1]; let ly = Y(u) + 4; ys.forEach(o => { if (Math.abs(o - ly) < 13) ly = o + (ly >= o ? 13 : -13); }); ys.push(ly);
    s += `<polyline points="${v.map((q, i) => X(i).toFixed(1) + ',' + Y(q).toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${X(v.length - 1).toFixed(1)}" cy="${Y(u).toFixed(1)}" r="4.5" fill="${c}"/>` + _pT(X(v.length - 1) + 10, ly, _pN(u) + ' ' + n, { a: 'start', fs: 12.5, fw: 700, c: P_C.ink }); });
  return _pSvg(W, H, s + _pL(x0, yb, x1, yb, P_C.ink, 1.2), 'Leads, citas agendadas y visitas de las últimas ocho semanas');
}

/* ═════════════ Piezas HTML ═════════════ */
const _phH = (t, sub, ir) => `<div class="pt-h"><h3>${t}</h3>${sub ? `<span>${sub}</span>` : ''}${ir ? `<button type="button" onclick="switchAdminTab('${ir}')">Abrir reporte</button>` : ''}</div>`;
const _phK = (l, v, d, tono) => `<div class="pt-k"><span class="l">${l}</span><div><b>${v}</b>${d ? `<em class="${tono || ''}">${d}</em>` : ''}</div></div>`;
const _phDelta = (a, b, o = {}) => { if (a == null || b == null || !b) return ['', '']; const p = Math.round((a - b) * 100 / Math.abs(b)); if (!p) return ['=', '']; return [(p > 0 ? '+' : '−') + Math.abs(p) + '%' + (o.suf || ''), (o.inv ? p < 0 : p > 0) ? 'up' : 'dn']; };
const _phSeg = parts => { const tot = _pSum(parts, p => p[1]); if (!tot) return `<p class="pt-vacio">Sin datos en el mes.</p>`; return `<div class="pt-seg">${parts.filter(p => p[1]).map(p => `<i style="flex:${p[1]} 1 0;background:${p[2]};color:${p[3] || P_C.cream}">${_pN(p[1])}</i>`).join('')}</div><div class="pt-ley">${parts.map(p => `<span><u style="background:${p[2]}"></u>${p[0]} <b>${_pN(p[1])}</b></span>`).join('')}</div>`; };
const _phBar = (l, v, pct, c) => `<div class="pt-b"><span>${_pE(l)}</span><i><b style="width:${Math.max(1.5, pct)}%;background:${c}"></b></i><em>${v}</em></div>`;
const _phCap = (n, t, img, lead, id, pos) => `<section class="pt-cap" id="pt-${id}"><div><div class="t"><span>${n}</span><h2>${t}</h2></div><p>${lead}</p></div><img src="${img}" alt="" loading="lazy" style="object-position:${pos || 'center'}" onerror="this.style.display='none'"></section>`;
const _phLey = items => `<div class="pt-ley">${items.map(i => `<span>${i[1]}${i[0]}</span>`).join('')}</div>`;
const _phSw = c => `<u style="background:${c}"></u>`;

function _phLote(r) {
  const cod = r.terrenoInteres || '', foto = (parte.fotos && typeof cotzFotos === 'function' ? cotzFotos(cod) : [])[0], met = _pMetraje(r), m2 = _pM2(r), dias = _pDiasCierre(r), p = cod.split('-');
  return `<article class="pt-lote">${foto ? `<img src="${foto}" alt="Vista aérea del terreno ${_pE(cod)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;sinfoto&quot;><b>${_pE(p[p.length - 1] || '—')}</b></div>'">` : `<div class="sinfoto"><b>${_pE(p[p.length - 1] || '—')}</b></div>`}
    <div class="d"><div class="a"><b>Terreno ${_pE(cod || '—')}</b><span>${_pE(r.esExterno ? 'Agente externo' : (r.asesorNombre || '—') + (r.cerradoPor ? ' · ' + r.cerradoPor : ''))}</span></div><strong>${_pUsd(_montoCierre(r))}</strong>
    <div class="m">${met ? `<span>${_pN(met)} m²</span>` : ''}${m2 ? `<span><b>$${_pN(m2)}</b> por m²</span>` : ''}${r.descuentoPct ? `<span>desc. <b>${_pN(r.descuentoPct, 1)}%</b></span>` : ''}${dias != null ? `<span>${dias} día${dias === 1 ? '' : 's'}</span>` : ''}</div></div></article>`;
}

/* ═════════════ Lectura (reglas sobre los mismos datos) ═════════════ */
function _pLectura(now, V, C, E, M, K) {
  const mes = DEC_MESES[now.getMonth()], cur = V.cur, meta = cur.meta;
  let tit;
  if (V.proy == null) tit = `${mes} ${V.dia < 3 ? 'arranca' : 'cierra'} con ${cur.ni} ${cur.ni === 1 ? 'cierre' : 'cierres'}${meta ? `. La meta es ${meta}.` : '.'}`;
  else if (meta) tit = V.proy >= meta ? `${mes} camina a ${V.proy}&nbsp;cierres. La meta es&nbsp;${meta}.` : `${mes} camina a ${V.proy}&nbsp;cierres, ${meta - V.proy} por debajo de la meta.`;
  else tit = `${mes} lleva ${cur.ni} ${cur.ni === 1 ? 'cierre' : 'cierres'} y camina a&nbsp;${V.proy}.`;
  const f = [], tk = V.meses.map(q => q.ticket).filter(v => v != null);
  if (cur.n) f.push(`Van ${cur.n} ${cur.n === 1 ? 'reserva' : 'reservas'}${cur.ne ? ` (${cur.ne} de agentes externos)` : ''}${cur.ticket && tk.length >= 4 && cur.ticket >= Math.max(...tk) ? ' con el ticket promedio más alto de los últimos doce meses' : cur.ticket ? ` con un ticket promedio de ${_pUsd(cur.ticket)}` : ''}.`);
  else f.push(`Todavía no hay reservas registradas en ${mes.toLowerCase()}.`);
  if (C.metaMes) { const p = _pPct(C.mesVM, C.metaMes), av = Math.round(V.dia * 100 / V.diasMes); f.push(p >= av - 5 ? `La cobranza de cartera va en ritmo: ${p}% de la meta al día ${V.dia}.` : `La cobranza de cartera va atrasada: ${p}% de la meta cuando debería ir en ${av}%.`); }
  const mT = _pSum(M.mc, x => x.m), m90 = M.mc[3].m + M.mc[4].m; if (mT && m90 / mT >= .4) f.push(`El ${Math.round(m90 * 100 / mT)}% de la mora de cartera tiene más de 90 días.`);
  if (K.venc) f.push(`${K.venc} ${K.venc === 1 ? 'cliente asignado lleva' : 'clientes asignados llevan'} más de ${K.sla} h sin respuesta del asesor.`);
  return { tit, txt: f.slice(0, 3).join(' ') };
}

/* ═════════════ Pintado ═════════════ */
function partePintar() {
  const box = document.getElementById('home-v2'), panel = document.getElementById('panel-home');
  if (!box || !panel?.classList.contains('active') || panel.classList.contains('h2-legado')) return;
  if (!parte.css) { parte.css = true; const st = document.createElement('style'); st.id = 'parte-css'; st.textContent = PARTE_CSS; document.head.appendChild(st);
    const lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Montserrat:wght@400;500;600;700;800&display=swap'; document.head.appendChild(lk);
    if (typeof cotzCargarIndiceFotos === 'function') cotzCargarIndiceFotos().then(() => { parte.fotos = true; partePintar(); }).catch(() => {}); }
  panel.classList.add('pt-on');
  const now = new Date(), S = _pSemanaRef(now), sy = box.querySelector('.pt') ? window.scrollY : null;
  let V, C, E, M, K, G, SN;
  try {
    V = _pVentas(now);
    C = _pCobranza(now, S, { pagos: _decArr('orangeCarteraDetalleRaw'), cats: _decObj('carteraCategoriasData'), vm: ['Vigente Terreno', 'Mora Terreno', 'Vigente Acción', 'Mora Acción'], metas: ['cartera_vigente', 'cartera_mora'], orden: typeof CARTERA_CATEGORIAS !== 'undefined' ? CARTERA_CATEGORIAS : [] });
    E = _pCobranza(now, S, { pagos: _decArr('orangeExpensasDetalleRaw'), cats: _decObj('expensasCategoriasData'), vm: ['Vigente', 'Mora'], metas: ['expensas_vigente', 'expensas_mora'], orden: [] });
    M = _pMora(); SN = _pSnap(now, M); G = _pSeguimientoCob(S); K = _pCall(now, S);
  } catch (e) { console.error('parte semanal:', e); box.innerHTML = `<div class="pt"><p class="pt-vacio">No se pudo armar el parte: ${_pE(e.message)}</p></div>`; return; }
  const L = _pLectura(now, V, C, E, M, K), cur = V.cur, prev = V.prev, mesL = DEC_MESES[now.getMonth()], prevL = DEC_MESES[prev.mm].slice(0, 3).toLowerCase();
  const dRes = cur.n - V.prevAFecha.length, dMonto = _phDelta(cur.monto, _pSum(V.prevAFecha, _montoCierre)), dTk = _phDelta(cur.ticket, prev.ticket), dM2 = _phDelta(cur.m2, prev.m2);
  const pts = (a, b, inv) => a == null || b == null ? ['', ''] : [((a - b) >= 0 ? '+' : '−') + _pN(Math.abs(a - b), 1) + ' pts', (inv ? a < b : a > b) ? 'up' : a === b ? '' : 'dn'];
  const dTasa = pts(V.tasa, V.tasaPrev), dDesc = pts(cur.desc, prev.desc, true);
  const sig = (() => { try { return (decVigilar() || []).slice(0, 3); } catch (e) { return []; } })();
  const h = [];
  h.push(`<header class="pt-mast"><div class="m1"><b>URUBÓ VILLAGE</b><i>Parte semanal de Gerencia Comercial</i></div>
    <nav><a href="#pt-ventas" onclick="parteIr('ventas');return false">01 Ventas</a><a href="#pt-cartera" onclick="parteIr('cartera');return false">02 Cartera y expensas</a><a href="#pt-call" onclick="parteIr('call');return false">03 Call center</a></nav>
    <div class="m2"><span>${S.lbl}</span><div class="pt-tog"><button type="button" class="${parte.sem === 'pasada' ? 'on' : ''}" onclick="parteSemana('pasada')">Semana cerrada</button><button type="button" class="${parte.sem === 'curso' ? 'on' : ''}" onclick="parteSemana('curso')">Semana en curso</button></div></div></header>`);
  h.push(`<section class="pt-hero"><img src="entrada.jpg" alt="Ingreso a Urubó Village" onerror="this.style.display='none'"><div class="c"><div><span class="pt-eye">${mesL} · día ${V.dia} de ${V.diasMes}</span><h1>${L.tit}</h1><p>${L.txt}</p></div>
    <div class="ks">${_phK('Reservas del mes', `${cur.n}${cur.meta ? ` <small>de ${cur.meta}</small>` : ''}`, (dRes >= 0 ? '+' : '−') + Math.abs(dRes) + ` vs ${prevL}. al día ${V.dia}`, dRes > 0 ? 'up' : dRes < 0 ? 'dn' : '')}${_phK('Total vendido', cur.monto ? _pUsd(cur.monto) : '—', dMonto[0], dMonto[1])}${_phK('Ticket promedio', cur.ticket ? _pUsd(cur.ticket) : '—', dTk[0], dTk[1])}${_phK('Precio por m²', cur.m2 ? '$' + _pN(cur.m2) : '—', dM2[0], dM2[1])}${_phK('Tasa de cierre', V.tasa != null ? V.tasa + '%' : '—', dTasa[0], dTasa[1])}${_phK('Descuento promedio', cur.desc != null ? _pN(cur.desc, 1) + '%' : '—', dDesc[0], dDesc[1])}</div></div></section>`);

  /* ── 01 Ventas ── */
  const tk = V.meses.map(q => q.ticket), leadV = cur.ticket && prev.ticket ? (cur.ticket >= prev.ticket ? 'Se vende más caro' : 'El ticket bajó') + (cur.desc != null && prev.desc != null ? (cur.desc > prev.desc ? ' y con más descuento que el mes pasado.' : ' y con menos descuento que el mes pasado.') : '.') : 'Cierres, precios y descuentos del mes contra los últimos doce.';
  h.push(_phCap('01', 'Ventas', 'fotos/terrenos/1-2-2.jpg', leadV + ` La tasa de cierre es ${V.tasa != null ? V.tasa + '%' : 'sin dato'}: ${cur.ni} ${cur.ni === 1 ? 'reserva' : 'reservas'} del equipo sobre ${cur.vis} ${cur.vis === 1 ? 'visita presencial' : 'visitas presenciales'}.`, 'ventas', 'center 30%'));
  h.push(`<div class="pt-row"><div class="pt-col" style="flex:7 1 620px">${_phH('Cierres por mes', 'reservas del equipo · mismo criterio que Ventas', 'dashboard')}${_pgCierres(V)}${_phLey([['Cumplió la meta', _phSw(P_C.green)], ['No cumplió o sin meta', _phSw(P_C.sand)], ['Mes en curso', _phSw(P_C.ink)], ['Agentes externos', `<u style="background:none;border:1.5px solid ${P_C.gold}"></u>`], ['Meta del mes', `<u style="width:16px;height:3px;background:${P_C.ink}"></u>`], ['Mismo mes, año anterior', `<u style="background:none;border:2px solid ${P_C.gold};border-radius:50%"></u>`]])}</div>
    <div class="pt-col" style="flex:3 1 300px">${_phH('Ticket promedio', 'miles de $us')}${_pgSpark(tk.map(v => v == null ? null : v / 1e3), v => _pN(v, v < 100 ? 1 : 0), { l0: V.meses[0].l, l1: cur.l, lbl: 'Ticket promedio de los últimos doce meses' })}
      ${_phH('Precio por m²', '$us')}${_pgSpark(V.meses.map(q => q.m2), v => _pN(v), { c: P_C.green, fill: '#DCE5D3', l0: V.meses[0].l, l1: cur.l, lbl: 'Precio por metro cuadrado' })}
      ${_phH('Descuento promedio', '% sobre precio de lista')}${_pgSpark(V.meses.map(q => q.desc), v => _pN(v, 1) + '%', { c: P_C.red, fill: '#EFD9CF', l0: V.meses[0].l, l1: cur.l, lbl: 'Descuento promedio' })}</div></div>`);
  { const cs = [...cur.c].sort((a, b) => _montoCierre(b) - _montoCierre(a)), ver = cs.slice(0, 7), dias = cs.map(_pDiasCierre).filter(v => v != null), lentos = cs.filter(r => _pDiasCierre(r) > 30 && r.descuentoPct), rap = cs.filter(r => _pDiasCierre(r) != null && _pDiasCierre(r) <= 30 && r.descuentoPct);
    const dl = _pAvg(lentos.map(r => r.descuentoPct)), dr = _pAvg(rap.map(r => r.descuentoPct));
    const frase = !cs.length ? '' : lentos.length && rap.length && dl - dr >= 1 ? `Los cierres que tardaron más de 30 días cedieron ${_pN(dl, 1)}% de descuento; los demás, ${_pN(dr, 1)}%.` : cur.desc != null ? `Descuento promedio del mes: ${_pN(cur.desc, 1)}% sobre el precio de lista.` : `${cs.length} ${cs.length === 1 ? 'cierre' : 'cierres'} en lo que va de ${mesL.toLowerCase()}.`;
    h.push(`<section class="pt-col">${_phH(`Los ${cs.length === 1 ? '' : cs.length + ' '}cierre${cs.length === 1 ? '' : 's'} de ${mesL.toLowerCase()}`, 'precio de venta del terreno · Fuente: Ventas, Detalle de cierres', 'dashboard')}${cs.length ? `<div class="pt-lotes">${ver.map(_phLote).join('')}<article class="pt-nota"><p>${frase}</p><div>
      <span>Superficie vendida<b>${_pN(_pSum(cs, _pMetraje))} m²</b></span><span>Días promedio al cierre<b>${dias.length ? Math.round(_pAvg(dias)) : '—'}</b></span><span>UV interno · agentes externos<b>${cur.ni} · ${cur.ne}</b></span><span>Pendientes de autorización<b>${V.pendAut}</b></span>${cs.length > ver.length ? `<span>Otros cierres del mes<b>${cs.length - ver.length}</b></span>` : ''}</div></article></div>` : `<p class="pt-vacio">Todavía no hay cierres en ${mesL.toLowerCase()}.</p>`}</section>`); }
  { const mxE = Math.max(1, ...V.emb.map(e => e.n)), cE = [P_C.sand, P_C.sand, P_C.gold, P_C.green, P_C.ink];
    const emb = V.emb.map((e, i) => { const ant = i ? V.emb[i - 1].n : 0, pc = i && ant && e.n <= ant ? Math.round(e.n * 100 / ant) + '%' : ''; return `<div class="pt-e"><span>${e.l}</span><div><i style="width:${Math.max(12, Math.sqrt(e.n / mxE) * 100)}%;background:${cE[Math.min(i, 4)]};color:${i < 2 ? P_C.ink : P_C.cream}">${_pN(e.n)}</i></div><em>${pc}</em></div>`; }).join('');
    const lds = V.emb[0]?.n || 0, frE = lds && (V.emb[2]?.n || 0) <= lds ? `De cada 100 leads, ${Math.round((V.emb[2]?.n || 0) * 100 / lds)} pisan el condominio y ${Math.round((V.emb[3]?.n || 0) * 100 / lds)} reservan.` : '';
    const mxM = Math.max(1, ...V.mot.map(x => x[1]));
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:4 1 340px">${_phH('Embudo de ' + mesL.toLowerCase(), 'conversión entre etapas', 'dashboard')}<div class="pt-emb">${emb}</div>${frE ? `<p class="pt-serif">${frE}</p>` : ''}</div>
      <div class="pt-col" style="flex:4 1 340px">${_phH('Descuento según demora del cierre', 'cierres de la gestión · en negro, ' + mesL.toLowerCase())}${_pgScatter(V.pts)}</div>
      <div class="pt-col" style="flex:4 1 340px">${_phH('Cotizaciones del mes', `${V.cz.n} enviadas · ${V.cz.vistas} abiertas por el cliente`, 'cotizaciones')}${_phSeg([['Convertidas en reserva', V.cz.conv, P_C.ink], ['Confirmadas', V.cz.conf, P_C.green], ['Pendientes', V.cz.pend, P_C.sand, P_C.ink], ['Vencidas', V.cz.venc, P_C.red]])}
        ${_phH('Seguimiento activo', `${V.segN} clientes${V.segMonto ? ' · ' + _pUsd(V.segMonto) + ' estimados' : ''}`)}${_phSeg([['Menos de 15 días', V.seg[0], P_C.green], ['15 a 30', V.seg[1], P_C.gold], ['31 a 60', V.seg[2], P_C.sand, P_C.ink], ['Más de 60', V.seg[3], P_C.red]])}
        ${_phH('Descartados del mes', `${V.desc}${V.dDesc != null ? ' · ' + Math.round(V.dDesc) + ' días promedio hasta el descarte' : ''}`)}${V.mot.length ? `<div class="pt-bars">${V.mot.map(x => _phBar(x[0], x[1], x[1] * 100 / mxM, P_C.gold)).join('')}</div>` : '<p class="pt-vacio">Sin descartados en el mes.</p>'}</div></div>`); }
  { const mxA = Math.max(1, ...V.asesores.map(a => a.c.length));
    const filas = V.asesores.map(a => { const n = a.c.length, monto = _pSum(a.c, _montoCierre), d = _pAvg(a.c.filter(r => r.descuentoPct).map(r => r.descuentoPct)), t = _pPct(n, a.vis);
      return `<tr><td class="iz"><b>${_pE(a.n)}</b>${a.etiqueta ? ` <span style="font-size:11px;color:var(--mute)">· ${_pE(a.etiqueta)}</span>` : ''}</td><td class="iz"><div class="pt-av"><i><b style="width:${n * 100 / mxA}%"></b></i><b>${n}</b></div></td><td>${a.vis}</td><td>${a.cot}</td><td><b>${t != null ? t + '%' : '—'}</b></td><td>${n ? _pMil(monto / n) : '—'}</td><td>${d != null ? _pN(d, 1) + '%' : '—'}</td><td>${a.seg}</td></tr>`; }).join('') + (cur.ne ? `<tr><td class="iz"><b>Agentes externos</b></td><td class="iz"><div class="pt-av"><i><b style="width:${cur.ne * 100 / mxA}%;background:${P_C.gold}"></b></i><b>${cur.ne}</b></div></td><td>—</td><td>—</td><td>—</td><td>${_pMil(_pSum(cur.c.filter(r => r.esExterno), _montoCierre) / cur.ne)}</td><td>${(d => d != null ? _pN(d, 1) + '%' : '—')(_pAvg(cur.c.filter(r => r.esExterno && r.descuentoPct).map(r => r.descuentoPct)))}</td><td>—</td></tr>` : '');
    const sR = _pSum(V.conMeta, g => g.real), sM = _pSum(V.conMeta, g => g.meta), okN = V.conMeta.filter(g => g.real >= g.meta).length;
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:7 1 620px">${_phH('Avance por asesor', mesL.toLowerCase() + ' · Fuente: Ventas, Avance por asesor', 'dashboard')}${filas ? `<div class="pt-tw"><table class="pt-t" style="min-width:680px"><thead><tr><th class="iz">Asesor</th><th class="iz">Reservas</th><th>Visitas</th><th>Cotiz.</th><th>Tasa de cierre</th><th>Ticket, miles $us</th><th>Desc. prom.</th><th>En seguimiento</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<p class="pt-vacio">Sin actividad de asesores en el mes.</p>'}</div>
      <div class="pt-col" style="flex:4 1 380px">${_phH('Cumplimiento de la gestión', 'reservas del equipo / meta', 'dashboard')}<div class="pt-gest">${V.gest.map(g => { const ok = !g.fut && !g.act && g.meta && g.real >= g.meta; return `<div class="${g.act ? 'act' : ok ? 'ok' : !g.fut ? 'no' : ''}"><span>${g.l}</span><b>${g.fut ? '–' : g.real}<small> / ${g.meta || '—'}</small></b></div>`; }).join('')}</div>
        <div class="pt-ks3">${_phK('Meses cerrados con meta', sM ? Math.round(sR * 100 / sM) + '%' : '—', sM ? `${sR} de ${sM}` : '', sM && sR >= sM ? 'up' : sM ? 'dn' : '')}${_phK('Meses con meta cumplida', V.conMeta.length ? `${okN} de ${V.conMeta.length}` : '—')}${_phK('Promedio por mes', V.cerr.length ? _pN(_pSum(V.cerr, g => g.real) / V.cerr.length, 1) : '—')}</div></div></div>`); }

  /* ── 02 Cartera y expensas ── */
  { const mT = _pSum(M.mc, x => x.m), m90 = M.mc[3].m + M.mc[4].m, pM = C.metaMes ? _pPct(C.mesVM, C.metaMes) : null, av = Math.round(V.dia * 100 / V.diasMes);
    const lead = (C.hay ? (pM != null ? `La cobranza vigente y en mora lleva ${pM}% de la meta al día ${V.dia} (debería ir en ${av}%).` : `En ${mesL.toLowerCase()} se cobraron ${_pUsd(C.mes)} de cartera.`) : 'Cargando los cobros de Orange…') + (mT ? ` La mora de más de 90 días suma ${_pUsd(m90)}, el ${Math.round(m90 * 100 / mT)}% del total.` : '');
    h.push(_phCap('02', 'Cartera y expensas', 'pileta.jpg', lead, 'cartera', 'center 62%'));
    const dS = _phDelta(C.sem, C.semAnt), dG = _phDelta(C.gest, C.gAnt, { suf: ' vs. gestión ant.' }), ref = SN.ref, dMora = ref?.hc ? mT - _pSum(ref.mc) : null, nMora = _pSum(M.mc, x => x.n);
    h.push(`<div class="pt-kr">${_phK('Cartera · cobrado en la semana ' + S.n, C.hay ? _pUsd(C.sem) : '—', dS[0], dS[1])}${_phK('Cartera · cobrado este mes', C.hay ? _pUsd(C.mes) : '—', '')}${_phK('Vigente + mora del mes', C.hay ? _pUsd(C.mesVM) : '—', pM != null ? `${pM}% de ${_pUsd(C.metaMes)}` : C.metaMes === 0 ? 'sin meta cargada' : '', pM != null ? (pM >= av - 5 ? 'up' : 'dn') : '')}${_phK('Cartera · cobrado esta gestión', C.hay ? _pUsd(C.gest) : '—', C.gAnt ? dG[0] : '', dG[1])}${_phK('Mora total de cartera', M.hayC ? _pUsd(mT) : '—', dMora != null && Math.round(dMora) ? (dMora > 0 ? '+' : '−') + _pUsd(Math.abs(dMora)).replace('$us ', '$') : nMora ? nMora + ' lotes' : '', dMora > 0 ? 'dn' : dMora < 0 ? 'up' : '')}</div>`);
    const mxC = Math.max(1, ...M.mc.map(x => x.m)), moraC = M.mc.map((x, i) => { const d = ref?.hc ? x.m - (ref.mc[i] || 0) : null; return `<div class="pt-b mo"><span>${P_TIER_L[i]}</span><i><b style="width:${x.m * 100 / mxC}%;background:${i >= 3 ? P_C.red : i === 2 ? P_C.gold : P_C.sand}"></b></i><em>$${_pMil(x.m)} mil</em><s class="${d > 0 ? 'dn' : d < 0 ? 'up' : ''}">${d == null ? x.n + ' lotes' : Math.round(d / 100) ? (d > 0 ? '+' : '−') + '$' + _pMil(Math.abs(d)) + ' mil' : '='}</s></div>`; }).join('');
    const serieC = (SN.serie || []).filter(x => x.d?.hc).map(x => _pSum(x.d.mc) / 1e3);
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:6 1 560px">${_phH('Cartera · cobranza semanal vs. meta', 'barra llena: vigente + mora · contorno: resto de lo cobrado', 'cartera')}${C.hay ? _pgSemanal(C.semanas, 'Cobranza semanal de cartera contra la meta', '$us', S.n) : '<p class="pt-vacio">Cargando los cobros de Orange…</p>'}</div>
      <div class="pt-col" style="flex:4 1 380px">${_phH('Mora de cartera por antigüedad', ref?.hc ? 'saldo y cambio desde la semana ' + S.n : 'saldo y lotes', 'cartera')}${M.hayC ? `<div class="pt-bars">${moraC}</div>` : '<p class="pt-vacio">Sin estado de mora cargado.</p>'}${_phH('Mora total por semana', 'miles de $us')}${serieC.length >= 2 ? _pgSpark(serieC, v => _pN(v), { c: P_C.red, fill: '#EFD9CF', h: 78, l0: (SN.serie[0].k || '').replace('-', ' '), l1: 'hoy', lbl: 'Mora total de cartera por semana' }) : '<p class="pt-vacio">Desde esta semana el sistema guarda la mora de cada lunes. La tendencia y el cambio semanal aparecen a partir de la segunda semana.</p>'}</div></div>`);
    const mxF = Math.max(1, ...C.filas.map(f => f.mes));
    const filas = C.filas.map(f => `<tr><td class="iz">${_pE(f.c)}</td>${f.sem.map((v, i) => `<td class="${i === 3 ? 'ref' : 'ap'}">${v ? _pMil(v) : '—'}</td>`).join('')}<td>${_pMil(f.mes)}</td><td class="iz" style="width:20%"><div class="pt-av"><i><b style="width:${f.mes * 100 / mxF}%;background:${/Mora/.test(f.c) ? P_C.red : /Venta/.test(f.c) ? P_C.green : P_C.gold}"></b></i></div></td></tr>`).join('')
      + (C.sinCat.n ? `<tr><td class="iz" style="color:${P_C.red}">Sin categorizar (${C.sinCat.n})</td>${C.sinCat.sem.map((v, i) => `<td class="${i === 3 ? 'ref' : 'ap'}">${v ? _pMil(v) : '—'}</td>`).join('')}<td>${_pMil(C.sinCat.m)}</td><td></td></tr>` : '')
      + `<tr class="tot"><td class="iz">Total cobrado en Orange</td>${C.totSem.map(v => `<td>${_pMil(v)}</td>`).join('')}<td>${_pMil(C.mes)}</td><td></td></tr>`;
    const top = M.top.map(d => `<tr><td class="iz"><b>${_pE(d.cli)}</b></td><td class="iz">${_pE(d.terreno)}</td><td>${_pN(d.dias)}</td><td><b>${_pUsd(d.m).replace('$us ', '$')}</b></td></tr>`).join(''), topS = _pSum(M.top, d => d.m);
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:6 1 560px">${_phH('Cobranza por categoría', 'miles de $us · Fuente: Cartera, Detalle por semana', 'cartera')}${C.hay ? `<div class="pt-tw"><table class="pt-t" style="min-width:560px"><thead><tr><th class="iz">Categoría</th>${C.cols.map(k => `<th>S${k.n}</th>`).join('')}<th>${mesL.slice(0, 3)}</th><th class="iz">Peso en el mes</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<p class="pt-vacio">Cargando los cobros de Orange…</p>'}</div>
      <div class="pt-col" style="flex:5 1 440px">${_phH('Compromisos de pago de la semana ' + S.n, `${G.gest} gestiones${G.can.length ? ' · ' + G.can.map(c => c[1] + ' ' + _pE(String(c[0]).toLowerCase())).join(', ') : ''}`, 'cartera')}${G.n ? _phSeg([['Cumplidos', G.ok, P_C.green], ['Incumplidos', G.mal, P_C.red], ['Por vencer', Math.max(0, G.n - G.ok - G.mal), P_C.sand, P_C.ink]]) : '<p class="pt-vacio">Sin compromisos con fecha en esa semana.</p>'}
        ${_phH('Los cinco mayores saldos en mora', topS && mT ? `suman ${_pUsd(topS)}, el ${Math.round(topS * 100 / mT)}% de la mora` : '')}${top ? `<div class="pt-tw"><table class="pt-t" style="min-width:420px"><thead><tr><th class="iz">Cliente</th><th class="iz">Lote</th><th>Días</th><th>Mora</th></tr></thead><tbody>${top}</tbody></table></div>` : '<p class="pt-vacio">Sin lotes en mora.</p>'}${G.venc ? `<span class="pt-pie2">Compromisos vencidos sin cumplir hoy: <b class="dn">${G.venc}</b></span>` : ''}</div></div>`);
    /* Expensas */
    const eT = _pSum(M.me, x => x.m), eN = _pSum(M.me, x => x.n), pE = E.metaMes ? _pPct(E.mesVM, E.metaMes) : null, dES = _phDelta(E.sem, E.semAnt), dEG = _phDelta(E.gest, E.gAnt, { suf: ' vs. gestión ant.' }), dEM = ref?.he ? eT - _pSum(ref.me) : null;
    h.push(`<div class="pt-kr sep">${_phK('Expensas · cobrado en la semana ' + S.n, E.hay ? _pBs(E.sem) : '—', dES[0], dES[1])}${_phK('Expensas · cobrado este mes', E.hay ? _pBs(E.mes) : '—', '')}${_phK('Vigente + mora del mes', E.hay ? _pBs(E.mesVM) : '—', pE != null ? `${pE}% de ${_pBs(E.metaMes)}` : E.metaMes === 0 ? 'sin meta cargada' : '', pE != null ? (pE >= av - 5 ? 'up' : 'dn') : '')}${_phK('Expensas · cobrado esta gestión', E.hay ? _pBs(E.gest) : '—', E.gAnt ? dEG[0] : '', dEG[1])}${_phK('Mora de expensas', M.hayE ? _pBs(eT) : '—', dEM != null && Math.round(dEM) ? (dEM > 0 ? '+' : '−') + _pBs(Math.abs(dEM)) : eN ? eN + ' lotes' : '', dEM > 0 ? 'dn' : dEM < 0 ? 'up' : '')}</div>`);
    const mxX = Math.max(1, ...M.me.map(x => x.m)), moraE = M.me.map((x, i) => `<div class="pt-b mo"><span>${P_TIER_L[i]}</span><i><b style="width:${x.m * 100 / mxX}%;background:${i >= 3 ? P_C.red : i === 2 ? P_C.gold : P_C.sand}"></b></i><em>Bs ${_pMil(x.m)} mil</em><s>${x.n} lotes</s></div>`).join('');
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:6 1 560px">${_phH('Expensas · cobranza semanal vs. meta', 'barra llena: vigente + mora · contorno: resto de lo cobrado', 'expensas')}${E.hay ? _pgSemanal(E.semanas, 'Cobranza semanal de expensas contra la meta', 'Bs', S.n) : '<p class="pt-vacio">Cargando los cobros de Orange…</p>'}</div>
      <div class="pt-col" style="flex:4 1 380px">${_phH('Mora de expensas por antigüedad', 'monto y lotes', 'expensas')}${M.hayE ? `<div class="pt-bars">${moraE}</div>` : '<p class="pt-vacio">Sin estado de mora cargado.</p>'}${_phH('Expensas cobradas por mes', 'miles de Bs · 12 meses')}${E.hay ? _pgSpark(E.m12.map(v => v / 1e3), v => _pN(v), { c: P_C.green, fill: '#DCE5D3', h: 78, l0: V.meses[0].l, l1: cur.l + ' (parcial)', lbl: 'Expensas cobradas por mes' }) : '<p class="pt-vacio">Cargando…</p>'}</div></div>`); }

  /* ── 03 Call center ── */
  { const iMax = K.porDia.indexOf(Math.max(...K.porDia)), tot = _pSum(K.porDia), peor = K.camp.filter(c => c.leads >= 10 && !c.vis).sort((a, b) => b.leads - a.leads)[0];
    const lead = (tot ? `El ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][iMax]} concentra el ${Math.round(K.porDia[iMax] * 100 / tot)}% de las citas de las últimas cuatro semanas.` : `En ${mesL.toLowerCase()} se agendaron ${K.mes} citas.`) + (peor ? ` ${_pE(peor.k)} trajo ${peor.leads} leads y ninguna visita.` : K.asist != null ? ` Asiste el ${K.asist}% de los citados.` : '');
    h.push(_phCap('03', 'Call center y citas', 'jardin.jpg', lead, 'call', 'center 70%'));
    h.push(`<div class="pt-kr k6">${_phK('Leads del mes', _pN(K.leads))}${_phK('Citas agendadas', _pN(K.mes), K.sem + ' en la semana ' + S.n)}${_phK('Asistencia a la cita', K.asist != null ? K.asist + '%' : '—', K.noVino ? K.noVino + ' no vinieron' : '', K.noVino ? 'dn' : '')}${_phK('Del lead a la cita', K.esp != null ? _ccH(K.esp) : '—')}${_phK('Costo por lead', K.inv && K.leads ? '$' + _pN(K.inv / K.leads, 2) : '—')}${_phK('Costo por visita', K.inv && K.visMes ? '$' + _pN(K.inv / K.visMes) : '—')}</div>`);
    const mxH = Math.max(1, ...K.heat.flat()), tono = v => { const r = v / mxH; return !v ? ['#EFE8D6', P_C.mute] : r > .8 ? [P_C.ink, P_C.cream] : r > .55 ? [P_C.green, P_C.cream] : r > .3 ? [P_C.greenL, P_C.cream] : [P_C.sand, P_C.ink]; };
    const heat = K.conHora >= 5 ? `<div class="pt-heat"><span></span>${K.FR.map(f => `<em>${f[0]}–${f[1]}</em>`).join('')}${K.heat.map((r, i) => `<b>${CC_DIAS[i]}</b>` + r.map(v => { const t = tono(v); return `<i style="background:${t[0]};color:${t[1]}">${v || ''}</i>`; }).join('')).join('')}</div><div class="pt-ley"><span>menos</span>${['#EFE8D6', P_C.sand, P_C.greenL, P_C.green, P_C.ink].map(_phSw).join('')}<span>más</span>${K.conHora < K.tot28 ? `<span>· ${K.tot28 - K.conHora} citas sin hora cargada</span>` : ''}</div>`
      : `<div class="pt-bars">${K.porDia.map((v, i) => _phBar(CC_DIAS[i], v, v * 100 / Math.max(1, ...K.porDia), i === iMax ? P_C.ink : P_C.sand)).join('')}</div><span class="pt-pie2">Las citas no tienen la hora cargada: se muestra solo el día.</span>`;
    const cA = [P_C.ink, P_C.gold, P_C.sand, P_C.greenL], mxAg = Math.max(1, ...K.ag.map(d => d.n)), nAg = _pSum(K.ag, d => d.n);
    const ag = K.ag.map(d => `<div class="pt-ag"><span>${d.l}</span><div>${K.agAs.map((a, i) => d.por[a] ? `<i style="width:${d.por[a] * 100 / mxAg}%;background:${cA[i % 4]};color:${i % 4 === 2 ? P_C.ink : P_C.cream}">${d.por[a]}</i>` : '').join('')}</div><b>${d.n || ''}</b></div>`).join('');
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:4 1 340px">${_phH('Leads, citas y visitas', 'por semana ISO', 'embudo')}${_pgCC(K.sems)}</div>
      <div class="pt-col" style="flex:4 1 340px">${_phH('Cuándo son las citas', 'por día y hora de la cita · últimas 4 semanas')}${tot ? heat : '<p class="pt-vacio">Sin citas en las últimas cuatro semanas.</p>'}</div>
      <div class="pt-col" style="flex:4 1 340px">${_phH('Agenda de los próximos 7 días', nAg + (nAg === 1 ? ' cita' : ' citas'), 'cotizaciones')}${nAg ? `<div class="pt-ags">${ag}</div>${_phLey(K.agAs.slice(0, 6).map((a, i) => [_pE(a), _phSw(cA[i % 4])]))}` : '<p class="pt-vacio">No hay citas agendadas para los próximos siete días.</p>'}</div></div>`);
    const cmp = K.camp.slice(0, 7), tC = { leads: _pSum(K.camp, c => c.leads), inv: K.inv, citas: _pSum(K.camp, c => c.citas), vis: _pSum(K.camp, c => c.vis), res: _pSum(K.camp, c => c.res) };
    const fila = (c, tot) => { const cpl = c.inv && c.leads ? c.inv / c.leads : null, lv = c.leads ? Math.round(c.vis * 100 / c.leads) : null, caro = !tot && cpl && tC.inv && tC.leads && cpl > 1.6 * tC.inv / tC.leads; return `<tr class="${tot ? 'tot' : ''}"><td class="iz">${tot ? 'Total ' + mesL.toLowerCase() : `<b>${_pE(c.k)}</b>`}</td><td>${c.inv ? '$' + _pN(c.inv) : '—'}</td><td>${_pN(c.leads)}</td><td class="${caro ? 'dn' : ''}"><b>${cpl ? '$' + _pN(cpl, 2) : '—'}</b></td><td>${_pN(c.citas)}</td><td>${_pN(c.vis)}</td><td><b>${_pN(c.res)}</b></td><td class="${!tot && c.leads >= 10 && !c.vis ? 'dn' : ''}">${lv != null ? lv + '%' : '—'}</td></tr>`; };
    const mxR = Math.max(K.sla * 1.5, ...K.resp.map(r => r.med || 0));
    h.push(`<div class="pt-row"><div class="pt-col" style="flex:7 1 620px">${_phH('De la campaña a la reserva', mesL.toLowerCase() + ' · Fuente: Marketing, planilla de leads, y Embudo', 'marketing-admin')}${cmp.length ? `<div class="pt-tw"><table class="pt-t" style="min-width:640px"><thead><tr><th class="iz">Origen</th><th>Inversión</th><th>Leads</th><th>Costo por lead</th><th>Citas</th><th>Visitas</th><th>Reservas</th><th>Lead → visita</th></tr></thead><tbody>${cmp.map(c => fila(c)).join('')}${K.camp.length > cmp.length ? `<tr><td class="iz ap" colspan="8">y ${K.camp.length - cmp.length} orígenes más</td></tr>` : ''}${fila(tC, true)}</tbody></table></div>` : '<p class="pt-vacio">Sin leads ni citas en el mes.</p>'}</div>
      <div class="pt-col" style="flex:4 1 380px">${_phH(`Qué pasó con las ${K.mes} citas del mes`, '', 'embudo')}${_phSeg([['Vinieron', K.vino, P_C.green], ['Por venir', K.porVenir, P_C.sand, P_C.ink], ['No vinieron', K.noVino, P_C.red]])}
        ${_phH('Respuesta del asesor al cliente asignado', `mediana · la marca es el límite de ${K.sla} h`, 'embudo')}${K.resp.length ? `<div class="pt-bars">${K.resp.map(r => `<div class="pt-b rs"><span>${_pE(r.n)}</span><i><b style="width:${Math.min(100, (r.med || 0) * 100 / mxR)}%;background:${r.med > K.sla ? P_C.red : P_C.green}"></b><u style="left:${K.sla * 100 / mxR}%"></u></i><em class="${r.med > K.sla ? 'dn' : ''}">${r.med != null ? _ccH(r.med) : '—'}</em></div>`).join('')}</div>` : '<p class="pt-vacio">Sin asignaciones en el mes.</p>'}
        <span class="pt-pie2">Sin respuesta pasado el límite: <b class="${K.venc ? 'dn' : ''}">${K.venc}</b> · devueltos por el asesor: <b>${K.devs}</b></span></div></div>`); }

  if (sig.length) h.push(`<section class="pt-dec"><div><span class="pt-eye">Para la reunión</span><b>${sig.length === 1 ? 'Un punto' : sig.length === 2 ? 'Dos puntos' : 'Tres puntos'} para decidir</b><button type="button" onclick="switchAdminTab('decisiones')">Ver todas las alertas</button></div><ol>${sig.map((s, i) => `<li><i>${i + 1}</i><b>${_pE(s.t)}</b><span>${_pE(s.det)}</span></li>`).join('')}</ol></section>`);
  h.push(`<footer class="pt-foot"><span>Cada cifra sale del mismo dato y la misma regla que el reporte de su módulo. Mes en curso a la fecha; la semana es la ${parte.sem === 'curso' ? 'actual' : 'última cerrada'} (lunes a domingo, ISO).</span><span>Actualizado ${now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })} · <button type="button" onclick="homeV2Legado(true)">Ver el inicio anterior</button></span></footer>`);
  const cuerpo = h.slice(0, -1).join('');   // si nada cambió (solo la hora), no se redibuja: no parpadean las fotos
  if (parte.ult === cuerpo && box.querySelector('.pt')) { const u = box.querySelector('.pt-foot'); if (u) u.outerHTML = h[h.length - 1]; return; }
  parte.ult = cuerpo;
  box.innerHTML = `<div class="pt">${h.join('')}</div>`;
  if (sy != null) window.scrollTo(0, sy);
}
function parteSemana(m) { parte.sem = m; try { localStorage.setItem('uv-parte-sem', m); } catch (e) {} partePintar(); }
function parteIr(id) { const el = document.getElementById('pt-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

const PARTE_CSS = `
#panel-home.pt-on:not(.h2-legado) > .section-page-header{display:none !important}
.pt{--ink:#1C1A17;--paper:#F4F0E6;--card:#FBF9F3;--line:#D5CAB2;--hair:#E6DECB;--gold:#8A6E3F;--goldt:#6A5229;--sand:#CDBE98;--green:#2F4A34;--red:#A33F27;--mute:#5C5547;--cream:#F2EEE1;
  font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;color:var(--ink);background:var(--paper);font-size:13px;line-height:1.45;padding:0 22px 34px;display:flex;flex-direction:column;gap:24px;font-variant-numeric:tabular-nums;border:1px solid var(--line)}
.pt *{box-sizing:border-box}.pt h1,.pt h2,.pt h3,.pt p{margin:0}.pt button{font-family:inherit;cursor:pointer}
.pt .up{color:var(--green)}.pt .dn{color:var(--red)}
.pt-serif,.pt-hero h1,.pt-cap p,.pt-cap .t span,.pt-nota p,.pt-mast i,.pt-dec>div>b,.pt-dec li i{font-family:'Instrument Serif','Cormorant Garamond','Times New Roman',serif}
.pt-mast{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 22px;padding:12px 0 10px;border-bottom:1px solid var(--ink)}
.pt-mast .m1{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.pt-mast .m1 b{font-size:13px;font-weight:800;letter-spacing:.28em}.pt-mast i{font-size:20px}
.pt-mast nav{display:flex;flex-wrap:wrap;gap:4px 6px}.pt-mast nav a{color:var(--ink);text-decoration:none;font-size:12.5px;font-weight:700;padding:10px 12px;border-bottom:2px solid var(--line)}.pt-mast nav a:hover{border-color:var(--ink)}
.pt-mast .m2{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:12px;color:var(--mute);font-weight:600}
.pt-tog{display:flex;border:1px solid var(--ink)}.pt-tog button{border:0;background:transparent;color:var(--ink);font-size:11.5px;font-weight:700;padding:7px 10px}.pt-tog button.on{background:var(--ink);color:var(--cream)}
.pt-eye{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#D8C9A3}
.pt-hero{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--cream);margin-top:-6px}
.pt-hero>img{flex:5 1 480px;min-width:0;width:100%;height:auto;min-height:320px;max-height:560px;object-fit:cover;display:block}
.pt-hero .c{flex:4 1 420px;min-width:0;padding:28px 32px;display:flex;flex-direction:column;justify-content:space-between;gap:22px}
.pt-hero .c>div:first-child{display:flex;flex-direction:column;gap:12px}
.pt-hero h1{color:var(--cream);font-weight:400;font-size:clamp(34px,3.6vw,52px);line-height:1.03;text-wrap:balance}.pt-hero p{color:var(--cream);font-size:14px;line-height:1.5;text-wrap:pretty}
.pt-hero .ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:16px 24px;border-top:1px solid #4A453B;padding-top:18px}
.pt-k{min-width:0;display:flex;flex-direction:column;gap:3px}.pt-k .l{font-size:11px;font-weight:600;color:var(--mute)}
.pt-k>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}.pt-k b{font-size:28px;font-weight:600;letter-spacing:-.025em;line-height:1.05;white-space:nowrap}.pt-k b small{font-size:.5em;font-weight:500;letter-spacing:0}
.pt-k em{font-style:normal;font-size:12px;font-weight:700;white-space:nowrap;color:var(--mute)}.pt-k em.up{color:var(--green)}.pt-k em.dn{color:var(--red)}
.pt-hero .pt-k .l{color:#D8C9A3}.pt-hero .pt-k b{font-size:31px;color:var(--cream)}.pt-hero .pt-k em{color:#D8C9A3}.pt-hero .pt-k em.up{color:#B9D6B0}.pt-hero .pt-k em.dn{color:#F0A48E}
.pt-cap{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--cream);margin-top:14px;scroll-margin-top:70px}
.pt-cap>div{flex:1 1 360px;min-width:0;padding:24px 30px;display:flex;flex-direction:column;justify-content:space-between;gap:16px}
.pt-cap .t{display:flex;align-items:baseline;gap:14px}.pt-cap .t span{font-style:italic;font-size:62px;line-height:.8;color:#D8C9A3}.pt-cap h2{font-size:29px;font-weight:700;letter-spacing:-.02em;color:var(--cream)}
.pt-cap p{color:var(--cream);font-size:21px;line-height:1.22;text-wrap:pretty}.pt-cap>img{flex:2 1 460px;min-width:0;width:100%;height:210px;object-fit:cover;display:block}
.pt-row{display:flex;flex-wrap:wrap;gap:26px}.pt-col{min-width:0;display:flex;flex-direction:column;gap:10px}
.pt-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;border-top:2px solid var(--ink);padding-top:8px}.pt-h h3{font-size:14px;font-weight:700;margin-right:auto;color:var(--ink)}.pt-h span{font-size:11.5px;color:var(--mute)}
.pt-h button{border:0;background:none;padding:0;font-size:11.5px;font-weight:700;color:var(--goldt);text-decoration:underline;text-underline-offset:3px}
.pt-svg{width:100%;height:auto;display:block;font-family:inherit}.pt-svg text{font-variant-numeric:tabular-nums}
.pt-vacio{font-size:12.5px;color:var(--mute);padding:10px 0}.pt-serif{color:var(--ink);font-style:italic;font-size:19px;line-height:1.25;text-wrap:pretty}
.pt-ley{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:11.5px;align-items:center}.pt-ley span{display:inline-flex;align-items:center;gap:6px}.pt-ley u{width:11px;height:11px;display:inline-block;text-decoration:none;box-sizing:border-box}
.pt-lotes{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:14px}
.pt-lote{min-width:0;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line)}.pt-lote>img,.pt-lote .sinfoto{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.pt-lote .sinfoto{background:var(--green);color:var(--cream);display:flex;align-items:flex-end;padding:12px 14px}.pt-lote .sinfoto b{font-family:'Instrument Serif',serif;font-weight:400;font-size:64px;line-height:.9}
.pt-lote .d{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}.pt-lote .a{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px}.pt-lote .a span{color:var(--mute);font-size:11.5px}
.pt-lote strong{font-size:23px;font-weight:600;letter-spacing:-.02em;line-height:1}.pt-lote .m{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12px}
.pt-nota{min-width:0;background:var(--green);color:var(--cream);padding:18px 18px 16px;display:flex;flex-direction:column;justify-content:space-between;gap:14px}.pt-nota p{color:var(--cream);font-size:24px;line-height:1.15;text-wrap:pretty}
.pt-nota>div{display:flex;flex-direction:column;gap:8px;border-top:1px solid #6F8F6A;padding-top:12px;font-size:12.5px}.pt-nota span{display:flex;justify-content:space-between;gap:8px}
.pt-emb{display:flex;flex-direction:column;gap:5px}.pt-e{display:flex;align-items:center;gap:10px}.pt-e>span{flex:0 0 132px;font-size:12px}.pt-e>div{flex:1 1 auto;min-width:0;display:flex;justify-content:center}
.pt-e i{height:30px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:14px;font-weight:700}.pt-e em{flex:0 0 44px;text-align:right;font-style:normal;font-size:12px;font-weight:700;color:var(--goldt)}
.pt-seg{display:flex;height:34px;gap:2px}.pt-seg i{min-width:22px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:14px;font-weight:700}
.pt-bars{display:flex;flex-direction:column;gap:6px}.pt-b{display:flex;align-items:center;gap:10px}.pt-b>span{flex:0 0 132px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-b>i{position:relative;flex:1 1 auto;min-width:0;height:16px;background:var(--hair)}.pt-b>i>b{display:block;height:100%}.pt-b>i>u{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink)}
.pt-b em{flex:0 0 44px;text-align:right;font-style:normal;font-size:12.5px;font-weight:700}.pt-b.mo>span{flex-basis:84px}.pt-b.mo em{flex-basis:92px}.pt-b.mo s{flex:0 0 78px;text-align:right;text-decoration:none;font-size:12px;font-weight:600}.pt-b.rs>span{flex-basis:110px;font-weight:600}.pt-b.rs em{flex-basis:60px}
.pt-tw{overflow-x:auto}.pt-t{width:100%;border-collapse:collapse;font-size:12.5px;background:transparent}.pt-t th{text-align:right;padding:6px 8px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);border-bottom:1px solid var(--ink);background:transparent}
.pt-t td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--hair);color:var(--ink);background:transparent}.pt-t .iz{text-align:left}.pt-t .ap{color:var(--mute)}.pt-t td.ref{font-weight:700}.pt-t tr.tot td{font-weight:700;border-bottom:0;border-top:1px solid var(--ink)}.pt-t td.dn{color:var(--red)}
.pt-av{display:flex;align-items:center;gap:8px}.pt-av>i{flex:1 1 auto;min-width:60px;height:12px;background:var(--hair)}.pt-av>i>b{display:block;height:100%;background:var(--green)}
.pt-gest{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(64px,100%),1fr));gap:4px}.pt-gest>div{display:flex;flex-direction:column;gap:3px;padding:8px 8px 9px;border:1px solid var(--line)}
.pt-gest span{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.pt-gest b{font-size:20px;font-weight:600;line-height:1}.pt-gest small{font-size:12px;font-weight:500}
.pt-gest .ok{background:var(--green);border-color:var(--green);color:var(--cream)}.pt-gest .no{background:var(--sand);border-color:var(--sand)}.pt-gest .act{background:var(--ink);border-color:var(--ink);color:var(--cream)}
.pt-ks3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr));gap:12px 22px;padding-top:6px}.pt-ks3 .pt-k b{font-size:24px}
.pt-kr{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(172px,100%),1fr));gap:16px 26px;border-bottom:1px solid var(--line);padding-bottom:18px}.pt-kr.sep{border-top:2px solid var(--ink);padding-top:16px}.pt-kr.k6{grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))}.pt-kr .pt-k b{font-size:25px}
.pt-pie2{font-size:12.5px}
.pt-heat{display:grid;grid-template-columns:40px repeat(6,minmax(0,1fr));gap:3px;font-size:12px}.pt-heat em{text-align:center;font-style:normal;font-size:10.5px;font-weight:700;color:var(--mute)}.pt-heat b{align-self:center;font-weight:600}
.pt-heat i{height:30px;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:700}
.pt-ags{display:flex;flex-direction:column;gap:5px}.pt-ag{display:flex;align-items:center;gap:10px}.pt-ag>span{flex:0 0 56px;font-size:12px;font-weight:600}.pt-ag>div{flex:1 1 auto;min-width:0;display:flex;gap:2px;height:22px}
.pt-ag i{min-width:18px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11.5px;font-weight:700}.pt-ag>b{flex:0 0 24px;text-align:right;font-size:13px}
.pt-dec{background:var(--ink);color:var(--cream);padding:24px 28px;display:flex;flex-wrap:wrap;gap:20px 36px}.pt-dec>div{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.pt-dec>div>b{font-weight:400;font-size:32px;line-height:1.05}
.pt-dec>div button{border:1px solid #6B6355;background:none;color:var(--cream);font-size:12px;font-weight:700;padding:9px 12px;margin-top:6px}
.pt-dec ol{flex:3 1 520px;min-width:0;margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:18px 28px}
.pt-dec li{display:flex;flex-direction:column;gap:6px;border-top:1px solid #4A453B;padding-top:10px;font-size:13px;line-height:1.45}.pt-dec li i{font-size:30px;line-height:1;color:#D8C9A3}.pt-dec li b{font-size:14px;font-weight:700}.pt-dec li span{color:#D8D2C2}
.pt-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 24px;font-size:11.5px;color:var(--mute);border-top:1px solid var(--ink);padding-top:10px}.pt-foot button{border:0;background:none;padding:0;font-size:11.5px;color:var(--goldt);text-decoration:underline}
@media (max-width:700px){.pt{padding:0 12px 24px}.pt-hero .c,.pt-cap>div{padding:20px 18px}.pt-cap>img{height:150px}}
`;
