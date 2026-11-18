/* ═══════════════════════════════════════════════════════════════════
   INFORME PARA DIRECTORIO — tablero visual por gestión (1° abril – 31 marzo)
   Solo lectura: consume los mismos datos que Ventas, Cartera y Expensas.
   ═══════════════════════════════════════════════════════════════════ */
let dirGestion = null;
let dirReservasIncl = {};      // reservas elegidas como venta (Firebase)
let dirEmbudoManual = {};      // embudo cargado a mano (Firebase)
let _dirEmbudoCache = null, _dirEmbudoSel = 'g', _dirResPool = [], _dirSpy = null;
let _dirCharts = {};
let _dirMetasCache = {};   // "g|tipo" -> [12 montos]
let _dirRenderSeq = 0;
const DIR_MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DIR_COL = { azul:'#5F6F7E', violeta:'#8C6F5A', verde:'#7C8B6A', ambar:'#C2A15F', rojo:'#B0604C', cian:'#8FA3A0', rosa:'#A98B8B', gris:'#B9B2A3', tinta:'#333333' };
const DIR_PALETA = ['#5F6F7E','#C2A15F','#7C8B6A','#8C6F5A','#8FA3A0','#B0604C','#A98B8B','#B9B2A3'];

function _dirMesesGestion(g) {
  const hoy = new Date(), hoyIdx = hoy.getFullYear()*12 + hoy.getMonth();
  return [3,4,5,6,7,8,9,10,11,0,1,2].map(m => {
    const anio = m >= 3 ? g : g+1;
    return { anio, mes:m, label: DIR_MES_CORTO[m]+' '+String(anio).slice(2), futuro: (anio*12+m) > hoyIdx };
  });
}
function _dirUsd(v)  { return '$' + Math.round(v||0).toLocaleString('es-BO'); }
function _dirPct(a,b){ return b ? Math.round(a/b*100) : null; }
function _dirDestroy() { Object.values(_dirCharts).forEach(c => { try { c.destroy(); } catch(e){} }); _dirCharts = {}; }
function _dirIdx(r) { const f = new Date(r.fechaOrden); return f.getFullYear()*12 + f.getMonth(); }

const DIR_BUILD = 'v10 · 6-oct-2026';
function iniciarInformeDirectorio() {
  const mdl = document.getElementById('dir-modal');
  if (mdl && mdl.parentElement !== document.body) document.body.appendChild(mdl); // fuera del panel: siempre se ve encima de todo
  const sel = document.getElementById('dir-sel-gestion');
  if (sel && !sel.dataset.filled) {
    const gHoy = _gestionActual();
    if (dirGestion === null) dirGestion = gHoy;
    sel.innerHTML = [gHoy, gHoy-1, gHoy-2, gHoy-3].map(g => `<option value="${g}">Gestión ${g}-${String(g+1).slice(2)} · ${_labelGestion(g)}</option>`).join('');
    sel.value = dirGestion; sel.dataset.filled = '1';
  }
  // Primera vez: si todavía no se cargaron los datos de Orange, se piden en segundo plano
  if (!orangeCarteraDetalleRaw.length && typeof cargarDetalleCobrosCartera === 'function') cargarDetalleCobrosCartera(true).then(()=>renderInformeDirectorio());
  if (!orangeExpensasDetalleRaw.length && typeof cargarDetalleExpensas === 'function')     cargarDetalleExpensas(true).then(()=>renderInformeDirectorio());
  renderInformeDirectorio();
}
function cambiarGestionDirectorio() {
  dirGestion = parseInt(document.getElementById('dir-sel-gestion').value);
  renderInformeDirectorio();
}

async function _dirMetas(g, tipo) {
  const k = g+'|'+tipo;
  if (_dirMetasCache[k]) return _dirMetasCache[k];
  const meses = _dirMesesGestion(g);
  const vals = await Promise.all(meses.map(m => window._fbGetMetaOnce(m.anio, PC_MESES[m.mes], tipo).catch(()=>0)));
  _dirMetasCache[k] = vals.map(v => v||0);
  return _dirMetasCache[k];
}

function _dirGestionVenta(v) {
  let mesN = MESES_NUM[v.mes], anio = parseInt(v.anio || v['año']);
  if ((!mesN || !anio) && v.fechaReserva) { const f = new Date(v.fechaReserva+'T00:00:00'); if (!isNaN(f)) { mesN = f.getMonth()+1; anio = f.getFullYear(); } }
  if (!mesN || !anio) return null;
  return { g: mesN >= 4 ? anio : anio-1, idx: anio*12 + (mesN-1) };
}
// Todas las ventas aprobadas de la gestión (también las que NO cuentan), cada una con su
// bandera _contar y la razón por la que no cuenta. Es la base del informe y del detalle.
function _dirVentasAnalisis(g) {
  const todas = ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado').map(v => ({ v, ref:_dirGestionVenta(v) }))
    .filter(x => x.ref && x.ref.g === g).map(x => ({ ...x.v, _idx:x.ref.idx, _contar:true, _razon:'' }));
  // Reservas que TÚ decidiste contar como venta (se eligen en el botón "Reservas")
  Object.entries(dirReservasIncl||{}).forEach(([k,r]) => {
    const mesN = MESES_NUM[r.mes], anio = parseInt(r.anio); if (!mesN || !anio || (mesN>=4?anio:anio-1) !== g) return;
    todas.push({ _key:'res-'+k, _reserva:true, _resKey:k, cliente:r.cliente||'', terreno:r.terreno||'', mes:r.mes, año:anio, anio, canal:r.canal||'', modalidad:r.modalidad||'Reserva',
      categoria:'', modulo:'', asesorNombre:r.asesor||'', estadoVenta:'Reserva', precioVenta:Number(r.precio)||0, precioLista:0, estadoAutorizacion:'aprobado',
      _idx:anio*12+(mesN-1), _contar:true, _razon:'' });
  });
  todas.forEach(v => { if (!_esVendida(v)) { v._contar = false; v._razon = 'Caída'; } });
  // Duplicadas: el mismo terreno vendido 2+ veces en la misma gestión (típico al mezclar Excel + Orange).
  const porTerreno = {};
  todas.filter(v => v._contar && (v.terreno||'').trim()).forEach(v => { (porTerreno[v.terreno.trim().toLowerCase()] ||= []).push(v); });
  const puntaje = v => (v._reserva?-1:0) + (v.contarInforme==='si'?8:0) + (v.correccionManual?4:0) + (String(v._key).startsWith('orange-')?2:0) + ((v.ts||0)/1e15);
  Object.values(porTerreno).filter(l => l.length > 1).forEach(l => {
    l.sort((a,b)=>puntaje(b)-puntaje(a));
    l.forEach((v,i) => { v._dupGrupo = l.length; if (i>0 && v.contarInforme !== 'si') { v._contar = false; v._razon = 'Duplicada (mismo terreno)'; } });
  });
  todas.forEach(v => { if (v.contarInforme === 'no') { v._contar = false; v._razon = 'Excluida manualmente'; } else if (v.contarInforme === 'si') { v._contar = true; v._razon = ''; } });
  // Tipo de cambio real de cada venta (vacío = 6.96) → monto en US$ reales
  todas.forEach(v => { const tc = v._reserva ? (Number(dirReservasIncl[v._resKey]?.tc) || 0) : (Number(v.tcReal) || 0); const f = _dirFactorTC(tc); v._tc = tc; v._real = (v.precioVenta||0) * f;
    // Lista y descuento: si falta alguno se deriva del otro, para que lista − descuento = vendido siempre cuadre
    const pv = v.precioVenta||0, pl = Number(v.precioLista)||0, dd = Number(v.descuentoUsd)||0;
    const lista0 = pl > 0 ? pl : pv + Math.max(0, dd);
    v._lista = lista0 * f; v._desc = Math.max(0, lista0 - pv) * f; });
  return todas;
}
function _dirVentas(g) { return _dirVentasAnalisis(g).filter(v => v._contar); }
function _dirAgrupar(arr, fnKey, fnVal) {
  const m = {};
  arr.forEach(x => { const k = fnKey(x) || 'Sin dato'; (m[k] ||= {k, n:0, monto:0}); m[k].n++; m[k].monto += fnVal(x)||0; });
  return Object.values(m).sort((a,b)=>b.monto-a.monto || b.n-a.n);
}
function _dirNormCatExp(r) {
  const c = expensasCategoriasData[r.key]?.categoria || r.categoriaAuto || 'Sin categorizar';
  return /^adelant/i.test(c) ? 'Adelanto' : c;
}

/* ── piezas de UI ── */
function _dirKpi(lbl, val, sub, color, icon) {
  return `<div class="dir-kpi" style="--c:${color}"><div class="dir-kpi-top"><span class="dir-kpi-lbl">${lbl}</span></div><div class="dir-kpi-val">${val}</div></div>`;
}
function _dirCard(id, bloque, titulo, sub, cuerpo, cls) {
  return `<section class="dir-card dir-slide ${cls||''}" id="dir-sec-${id}" data-t="${esc(bloque)} · ${esc(titulo)}"><div class="dir-card-blk">${esc(bloque)}</div><header class="dir-card-h"><span class="dir-num"></span><div><h3>${titulo}</h3>${sub?`<p>${sub}</p>`:''}</div></header>${cuerpo}</section>`;
}
function _dirCanvas(id, titulo, categoria, h) {
  return `<div class="dir-cv" style="height:${h||240}px"><canvas id="${id}"></canvas><div class="bi-expand-btn dir-exp" onclick="abrirModalGraficoJS('${id}','${titulo}','','${categoria}')">⛶</div></div>`;
}
function _dirTabla(cols, filas, opts) {
  opts = opts||{};
  return `<div class="dir-tw"><table class="dir-t"><thead><tr>${cols.map((c,i)=>`<th class="${i?'r':''}">${c}</th>`).join('')}</tr></thead><tbody>${filas.map(f=>`<tr class="${f.tot?'tot':''}${f.oc?' clk':''}"${f.oc?` onclick="${f.oc}" title="Click para ver el detalle"`:''}>${f.c.map((x,i)=>`<td class="${i?'r':''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function _dirBar(pct, color) {
  return `<div class="dir-pb"><i style="width:${Math.max(0,Math.min(100,pct||0))}%;background:${color}"></i></div>`;
}
function _dirPctChip(p) {
  if (p === null) return '<span class="dir-chip n">sin meta</span>';
  const c = p >= 100 ? 'ok' : p >= 80 ? 'w' : 'd';
  return `<span class="dir-chip ${c}">${p}%</span>`;
}
function _dirNuevo(id, cfg) {
  const cv = document.getElementById(id); if (!cv) return;
  cfg.options = cfg.options || {};
  cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
  cfg.options.plugins = cfg.options.plugins || {};
  if (cfg.options.plugins.datalabels === undefined) cfg.options.plugins.datalabels = { display:false };
  const hayDatos = (cfg.data.datasets||[]).some(d => (d.data||[]).some(x => (typeof x === 'number' ? x !== 0 : x && typeof x === 'object' ? (Number(x.y)||0) !== 0 : false)));
  if (!hayDatos) { const w = cv.parentElement; if (w) { cv.style.display = 'none'; const eb = w.querySelector('.dir-exp'); if (eb) eb.style.display = 'none'; if (!w.querySelector('.dir-ch-vacio')) { const d = document.createElement('div'); d.className = 'dir-ch-vacio'; d.textContent = 'Sin datos para mostrar en esta gestión'; w.appendChild(d); } } return; }
  _dirCharts[id] = new Chart(cv, cfg);
}
const _dirAxisBase = { x:{ grid:{display:false}, ticks:{color:'#4F493F', font:{size:11}} }, y:{ beginAtZero:true, grid:{color:'rgba(51,51,51,.10)'}, ticks:{color:'#4F493F', font:{size:11}} } };

/* ── Tipo de cambio ── */
const DIR_TC_BASE = 6.96;   // tipo de cambio oficial con el que Orange convierte Bs → US$
let dirTCMes = {};          // { g: { m0..m11: TC real del mes (solo cartera, NO venta nueva) } }
let dirCanalMap = {};       // { claveCanal: nombre del grupo }
let dirEmbudoIdeal = {};    // { g: { gen:{l,a,c,ci,v}, m0..m11:{...} } }
let _dirGestExp = [];       // cobranza vs. por cobrar por gestión (para el informe y su editor)
let dirCorte = {};          // { cartera:{...}, expensas:{...} } cortes cargados a mano
let dirAlias = { modalidad:{}, asesor:{} };  // agrupación de modalidades y asesores
let _terrenoFirmaIdx = {};  // terreno -> mes (año*12+mes) de la firma según Orange (GetVentas)
function _dirModuloKey(m) { const t = String(m||'').trim().replace(/\s+/g,' '); if (!t) return 'Sin dato'; const n = t.match(/^m[oó]d(?:ulo)?\.?\s*0*(\d+)\s*$/i); return n ? 'Módulo ' + n[1] : t; }
function _dirFactorTC(tc) { tc = Number(tc); return tc > 0 ? DIR_TC_BASE / tc : 1; }
function _dirTCMesVal(g, i, tipo) {
  const o = dirTCMes[g] && dirTCMes[g]['m'+i]; if (o === undefined || o === null) return 0;
  const t = typeof o === 'object' ? Number(tipo === 'a' ? o.a : o.t) : Number(o);
  return t > 0 ? t : 0;
}
function _dirTcTerrenoMap() {
  const m = {};
  ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado' && Number(v.tcReal) > 0 && v.terreno).forEach(v => { m[_dirNormTerr(v.terreno)] = Number(v.tcReal); });
  Object.values(dirReservasIncl || {}).forEach(r => { if (Number(r.tc) > 0 && r.terreno) m[_dirNormTerr(r.terreno)] = Number(r.tc); });
  return m;
}
// Cobros de la gestión ya convertidos a US$ reales:
//  · venta nueva (y seña) → con el TC de la venta de ese terreno, así la cobranza cuadra con lo vendido
//  · cartera              → con el TC del mes de cobro (si lo cargaste)
function _dirCobrosG(g) {
  _dirAplicarCorreccionesGestion();
  const m0 = _dirMesesGestion(g)[0], base = m0.anio*12 + m0.mes, tcV = _dirTcTerrenoMap();
  return orangeCarteraDetalleRaw.filter(r => r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === g).map(r => {
    const i = _dirIdx(r) - base;
    const nueva = r.tipoPago === 'Seña' || _terrenoGestionVentaMap[r.terreno] === g;   // la seña SIEMPRE es venta nueva
    const tc = nueva ? (tcV[_dirNormTerr(r.terreno)] || 0) : _dirTCMesVal(g, i, r.tipoPago === 'Acción' ? 'a' : 't');
    return { ...r, _nueva:nueva, _mi:i, _tc:tc, montoOrig:r.monto, monto:r.monto * _dirFactorTC(tc) };
  });
}

/* ── Canales: agrupación (digital = canal digital, etc.) ── */
const _dirSinAcento = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
function _dirCanalKey(raw) {
  let k = _dirSinAcento(raw); if (!k) return 'sin dato';
  const stop = ['canal','de','del','la','el','los','las','via','por','en','medio'];
  k = k.split(' ').filter(w => !stop.includes(w)).join(' ') || k;
  if (/digital|facebook|instagram|tiktok|redes|\bmeta\b|google|youtube|\bweb\b|pagina/.test(k)) return 'digital';
  return k;
}
const _dirCanalFb = k => k.replace(/\s+/g, '_');
function _dirCanalAuto(k) {
  if (k === 'sin dato') return 'Sin dato';
  if (k === 'digital') return 'Canal digital';
  return k.replace(/\b\w/g, c => c.toUpperCase());
}
function _dirCanalGrupo(raw) { const k = _dirCanalKey(raw); return dirCanalMap[_dirCanalFb(k)] || _dirCanalAuto(k); }
const _dirTitulo = t => String(t||'').trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
function _dirGrupoGen(tipo, raw) {
  if (tipo === 'canal') return _dirCanalGrupo(raw);
  const k = _dirSinAcento(raw) || 'sin dato';
  const m = dirAlias[tipo] && dirAlias[tipo][_dirCanalFb(k)];
  return m || (k === 'sin dato' ? 'Sin dato' : _dirTitulo(raw));
}
function _dirPorCanal(ventas) {
  const m = {};
  ventas.forEach(v => {
    const raw = (v.canal || v.gestion || '').trim(), gr = _dirCanalGrupo(raw);
    const o = (m[gr] ||= { k:gr, n:0, monto:0, raws:{} }); o.n++; o.monto += v._real || 0;
    const r = raw || '(vacío)'; o.raws[r] = (o.raws[r]||0) + 1;
  });
  return Object.values(m).sort((a,b) => b.n - a.n || b.monto - a.monto);
}

/* ── Minutas firmadas: listado propio (ventas de gestiones pasadas cuyo cliente ya es dueño del terreno) ── */
let dirMinutas = {};   // Firebase directorio_minutas/{id}: { terreno, cliente, vendedor, fecha (aaaa-mm-dd), precio (US$) }
function _dirMinutas(g) {
  const m0 = _dirMesesGestion(g)[0], base = m0.anio*12 + m0.mes;
  return Object.entries(dirMinutas || {}).map(([id, r]) => {
    const f = r && r.fecha ? new Date(r.fecha + 'T00:00:00') : null; if (!f || isNaN(f) || _gestionDeFecha(f) !== g) return null;
    const idx = f.getFullYear()*12 + f.getMonth();
    return { ...r, id, precio:Number(r.precio) || 0, superficie:Number(r.superficie) || 0, idx, mi:idx - base, f };
  }).filter(Boolean).sort((a,b) => a.f - b.f || String(a.terreno).localeCompare(String(b.terreno)));
}

/* ── Corte de cartera (cuentas por cobrar) cargado a mano ── */
function _dirCorteCartera() {
  const c = dirCorte.cartera; if (!c) return null;
  const f = o => { o = o || {}; const n = k => (o[k] === undefined || o[k] === null || o[k] === '') ? null : Number(o[k]);
    const ventas = n('ventas'), cobrado = n('cobrado'), mora = n('mora'); let cartera = n('cartera'), calc = false;
    if (cartera === null && ventas !== null && cobrado !== null) { cartera = ventas - cobrado; calc = true; }
    return { ventas, cobrado, cartera, mora, calc, pctMora:(mora !== null && cartera) ? mora/cartera*100 : null }; };
  const t = f(c.t), a = f(c.a), sm = (x,y) => (x === null && y === null) ? null : (x||0) + (y||0);
  const tot = { ventas:sm(t.ventas,a.ventas), cobrado:sm(t.cobrado,a.cobrado), cartera:sm(t.cartera,a.cartera), mora:sm(t.mora,a.mora) };
  tot.pctMora = (tot.mora !== null && tot.cartera) ? tot.mora/tot.cartera*100 : null;
  return { fecha:c.fecha||'', nota:c.nota||'', t, a, tot };
}

/* ── render principal ── */
async function renderInformeDirectorio(forzarMetas) {
  const cont = document.getElementById('dir-contenido');
  if (!cont) return;
  const seq = ++_dirRenderSeq;
  if (forzarMetas) _dirMetasCache = {};
  const g = dirGestion ?? _gestionActual();
  const meses = _dirMesesGestion(g);
  const idx0 = meses[0].anio*12 + meses[0].mes;
  const hoyD = new Date(), hoyIdx = hoyD.getFullYear()*12 + hoyD.getMonth();
  const mesesTranscurridos = meses.filter(m => !m.futuro).length;
  // Promedios: SOLO meses cerrados (el mes en curso no entra)
  const cerrado = meses.map(m => (m.anio*12 + m.mes) < hoyIdx);
  const nCerrados = cerrado.filter(Boolean).length;
  const cerrL = meses.filter((m,i) => cerrado[i]);
  const rangoCerr = cerrL.length ? (cerrL.length === 1 ? cerrL[0].label : cerrL[0].label.split(' ')[0] + '–' + cerrL[cerrL.length-1].label.split(' ')[0]) : '—';

  // ── Cobranza Cartera (USD reales) ──
  const cobros = _dirCobrosG(g);
  const esNueva = r => r._nueva;
  const cat = r => carteraCategoriasData[r.key]?.categoria || 'Sin categorizar';
  const serie = (filtro) => { const a = Array(12).fill(0); cobros.forEach(r => { if (filtro(r)) { const i = r._mi; if (i>=0 && i<12) a[i] += r.monto; } }); return a; };
  const sum = a => a.reduce((s,x)=>s+x,0);
  const sNueva = serie(r => esNueva(r)), sCartera = serie(r => !esNueva(r));
  const sTotal = sNueva.map((x,i)=>x+sCartera[i]);
  const totRec = sum(sTotal), totNueva = sum(sNueva), totCartera = sum(sCartera);
  const sNT = serie(r => esNueva(r) && (r.tipoPago==='Terreno' || r.tipoPago==='Seña')), sNA = serie(r => esNueva(r) && r.tipoPago==='Acción');
  const sCT = serie(r => !esNueva(r) && r.tipoPago==='Terreno'), sCA = serie(r => !esNueva(r) && r.tipoPago==='Acción');
  const totNT = sum(sNT), totNA = sum(sNA), totCT = sum(sCT), totCA = sum(sCA);
  const nCobrosTC = cobros.filter(r => r._tc > 0).length;
  const tcMesesN = [0,1,2,3,4,5,6,7,8,9,10,11].filter(i => _dirTCMesVal(g,i,'t') > 0 || _dirTCMesVal(g,i,'a') > 0).length;

  const [mExpV, mExpM] = await Promise.all([_dirMetas(g,'expensas_vigente'), _dirMetas(g,'expensas_mora')]);
  // Cobranza vs. lo que debió cobrarse, por gestión (2024 en adelante) · editable a mano para cuadrar con Orange
  const _ovG = (dirCorte.expensas && dirCorte.expensas.gest) || {};
  const _hasN = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  _dirGestExp = await Promise.all(Array.from({length:Math.max(0,_gestionActual()-2024+1)}, (_,k)=>2024+k).map(async gg => {
    const ms = _dirMesesGestion(gg), i0 = ms[0].anio*12 + ms[0].mes, last = Math.min(i0+11, hoyIdx-1);
    const [ma, mb] = await Promise.all([_dirMetas(gg,'expensas_vigente'), _dirMetas(gg,'expensas_mora')]);
    let cobOr = 0, debOr = 0;
    orangeExpensasDetalleRaw.forEach(r => { if (r.fechaOrden) { const ix = _dirIdx(r); if (ix >= i0 && ix <= last) cobOr += r.monto||0; } });
    for (let k=0;k<12;k++) if (i0+k <= last) debOr += (ma[k]||0) + (mb[k]||0);
    const o = _ovG[gg] || {}, cobM = _hasN(o.cobrado), debM = _hasN(o.debio);
    return { g:gg, cobOr, debOr, cob:cobM?Number(o.cobrado):cobOr, deb:debM?Number(o.debio):debOr, cobM, debM, meses:Math.max(0,last-i0+1) };
  }));
  if (seq !== _dirRenderSeq) return;

  const sTerreno = serie(r=>r.tipoPago==='Terreno' || r.tipoPago==='Seña'), sAccion = serie(r=>r.tipoPago==='Acción');
  const totTerreno = sum(sTerreno), totAccion = sum(sAccion);
  const sAccNueva = serie(r=>r.tipoPago==='Acción' && esNueva(r));
  const sAccMora  = serie(r=>r.tipoPago==='Acción' && cat(r)==='Mora Acción');
  const sAccVig   = serie(r=>r.tipoPago==='Acción' && !esNueva(r) && cat(r)!=='Mora Acción');
  const totAccNueva = sum(sAccNueva), totAccMora = sum(sAccMora), totAccVig = sum(sAccVig);
  const catAgr = {}; cobros.forEach(r => { const c = cat(r); catAgr[c] = (catAgr[c]||0) + r.monto; });
  const catList = [...CARTERA_CATEGORIAS, 'Sin categorizar'].map(c => ({ c, v: catAgr[c]||0 })).filter(x => x.v>0 || x.c!=='Sin categorizar');
  const cantCobros = cobros.length, sinCat = cobros.filter(r=>cat(r)==='Sin categorizar').length;

  // ── Ventas concretadas (US$ reales) ──
  const ventas = _dirVentas(g);
  const vMesN = Array(12).fill(0), vMesM = Array(12).fill(0);
  ventas.forEach(v => { const i = v._idx - idx0; if (i>=0 && i<12) { vMesN[i]++; vMesM[i] += v._real||0; } });
  const totVendido = ventas.reduce((s,v)=>s+(v._real||0),0);
  const totNominal = ventas.reduce((s,v)=>s+(v.precioVenta||0),0);
  const ajusteTC = totVendido - totNominal;
  const nVentasTC = ventas.filter(v => v._tc > 0).length;
  const totLista = ventas.reduce((s,v)=>s+(v._lista||0),0);
  const totDesc = ventas.reduce((s,v)=>s+(v._desc||0),0);
  const dListaM = Array(12).fill(0), dDescM = Array(12).fill(0), dM2M = Array(12).fill(0);
  ventas.forEach(v => { const i = v._idx - idx0; if (i>=0 && i<12) { dListaM[i] += v._lista||0; dDescM[i] += v._desc||0; dM2M[i] += v.metraje||0; } });
  const totM2 = ventas.reduce((s,v)=>s+(v.metraje||0),0);
  const ticket = ventas.length ? totVendido/ventas.length : 0;
  const descProm = totLista ? totDesc/totLista*100 : 0;
  const porCanal = _dirPorCanal(ventas);
  const porModal = _dirAgrupar(ventas, v=>_dirGrupoGen('modalidad', v.modalidad), v=>v._real);
  const porCat   = _dirAgrupar(ventas, v=>v.categoria, v=>v._real);
  const porModulo= _dirAgrupar(ventas, v=>_dirModuloKey(v.modulo), v=>v._real);
  const porAsesor= _dirAgrupar(ventas, v=>_dirGrupoGen('asesor', v.asesorNombre), v=>v._real);
  const minutas = _dirMinutas(g);
  const minMesN = Array(12).fill(0), minMesM = Array(12).fill(0);
  const minMesS = Array(12).fill(0), minMesP = Array(12).fill(0);   // m² y precio solo de filas con superficie (para US$/m² ponderado)
  minutas.forEach(x => { if (x.mi>=0 && x.mi<12) { minMesN[x.mi]++; minMesM[x.mi] += x.precio; if (x.superficie>0 && x.precio>0) { minMesS[x.mi] += x.superficie; minMesP[x.mi] += x.precio; } } });
  const totMin = minMesM.reduce((s,x)=>s+x,0), totMinM2 = minMesS.reduce((s,x)=>s+x,0), totMinSup = minutas.reduce((s,x)=>s+x.superficie,0);
  const usdM2Min = totMinM2 ? minMesP.reduce((s,x)=>s+x,0)/totMinM2 : 0;
  const fM2 = n => n ? '$' + Math.round(n).toLocaleString('es-BO') : '—';

  // ── Embudo: cifras del sistema por mes + lo que cargaste a mano (Power BI) ──
  const manG = dirEmbudoManual[g] || {};
  const embRows = meses.map((m,i) => {
    const sysArr = m.futuro ? [0,0,0,0] : calcularFunnelDatos(PC_MESES[m.mes], m.anio).slice(0,4).map(x => x.n||0);
    const man = manG['m'+i] || null, keys = ['l','a','c','ci'];
    const val = sysArr.map((v,j) => (man && Number.isFinite(Number(man[keys[j]])) && man[keys[j]] !== null && man[keys[j]] !== '') ? Number(man[keys[j]]) : v);
    return { label:m.label, futuro:m.futuro, sys:sysArr, man, val, ventas:vMesN[i] };
  });
  const fn = [0,1,2,3].map(j => embRows.reduce((s,r)=>s+r.val[j],0));
  _dirEmbudoCache = { g, rows:embRows, ideal:dirEmbudoIdeal[g] || {} };

  // ── Expensas (Bs) ──
  const expG = orangeExpensasDetalleRaw.filter(r => r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === g);
  const sExp = Array(12).fill(0); expG.forEach(r => { const i = _dirIdx(r)-idx0; if (i>=0&&i<12) sExp[i]+=r.monto; });
  const totExp = sum(sExp);
  const totExpCerr = sum(sExp.filter((v,i)=>cerrado[i]));
  const promExp = nCerrados ? totExpCerr/nCerrados : 0;
  const expCat = {}; expG.forEach(r => { const c = _dirNormCatExp(r); expCat[c] = (expCat[c]||0)+r.monto; });
  const expCats = ['Vigente','Mora','Adelanto','Otros Ingresos','Sin categorizar'].map(c=>({c, v:expCat[c]||0})).filter(x=>x.v>0);
  const metaExp = mExpV.map((v,i)=>v+mExpM[i]);
  const metaExpCerr = sum(metaExp.filter((v,i)=>cerrado[i]));
  const cumplExp = metaExpCerr ? _dirPct(totExpCerr, metaExpCerr) : null;
  const cxe = dirCorte.expensas || {};
  const hayPend = cxe.pendiente !== undefined && cxe.pendiente !== null && cxe.pendiente !== '';
  const pendExp = hayPend ? Number(cxe.pendiente) : 0;
  // Acumulado de cobranza: desde el mes configurado (por defecto marzo 2024) hasta el último mes cerrado
  const desdeStr = /^\d{4}-\d{2}$/.test(cxe.desde||'') ? cxe.desde : '2024-03';
  const desdeIdx = Number(desdeStr.slice(0,4))*12 + (Number(desdeStr.slice(5,7))-1);
  const hastaIdx = hoyIdx - 1;
  const acumRows = orangeExpensasDetalleRaw.filter(r => r.fechaOrden && _dirIdx(r) >= desdeIdx && _dirIdx(r) <= hastaIdx);
  const acumExp = acumRows.reduce((s,r)=>s+(r.monto||0),0);
  const acumPorG = {}; acumRows.forEach(r => { const gg = _gestionDeFecha(new Date(r.fechaOrden)); acumPorG[gg] = (acumPorG[gg]||0) + (r.monto||0); });
  const primerIdxOrange = orangeExpensasDetalleRaw.reduce((m,r)=> r.fechaOrden ? Math.min(m,_dirIdx(r)) : m, Infinity);
  const ultMesLbl = (()=>{ const a = Math.floor(hastaIdx/12), m = hastaIdx%12; return PC_MESES[m] + ' ' + a; })();
  const desdeLbl = PC_MESES[desdeIdx%12] + ' ' + Math.floor(desdeIdx/12);
  const faltaHist = isFinite(primerIdxOrange) && primerIdxOrange > desdeIdx;
  const totCartExp = acumExp + pendExp;
  const filasAcumG = Object.keys(acumPorG).map(Number).sort((a,b)=>a-b).map(gg => ({ c:[_labelGestion(gg), _fmtMontoBs(acumPorG[gg])] }));
  filasAcumG.push({ tot:true, c:['Acumulado', _fmtMontoBs(acumExp)] });
  const starE = '<span title="Cifra ajustada a mano" style="color:#B8893A">✎</span> ';
  const filasGE = _dirGestExp.map(x => ({ oc:'abrirCorteExpensasDir()', c:[_labelGestion(x.g) + (x.g===_gestionActual()?' <span class="dir-chip n" title="Solo meses cerrados">'+x.meses+' mes(es)</span>':''), (x.cobM?starE:'')+_fmtMontoBs(x.cob), x.deb>0?(x.debM?starE:'')+_fmtMontoBs(x.deb):'—', x.deb>0?_dirPctChip(_dirPct(x.cob,x.deb)):'—'] }));
  const _tc = _dirGestExp.reduce((a,x)=>a+x.cob,0), _td = _dirGestExp.reduce((a,x)=>a+x.deb,0);
  filasGE.push({ tot:true, c:['Total', _fmtMontoBs(_tc), _td>0?_fmtMontoBs(_td):'—', _td>0?_dirPctChip(_dirPct(_tc,_td)):'—'] });

  // ── Comparativo (anexo, no va en la presentación) ──
  const gestiones = [g-3,g-2,g-1,g].filter(x=>x>=2000);
  const compRec = gestiones.map(x => orangeCarteraDetalleRaw.filter(r=>r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden))===x).reduce((s,r)=>s+r.monto,0));
  const compVen = gestiones.map(x => _dirVentas(x).reduce((s,v)=>s+(v._real||0),0));
  const compN   = gestiones.map(x => _dirVentas(x).length);

  const convL = (a,b) => b ? ((a/b*100) < 10 && a ? (a/b*100).toFixed(1) : Math.round(a/b*100)) + '%' : '—';
  const sinDatosOrange = !orangeCarteraDetalleRaw.length;
  const pctTxt = (a,b) => { const p = _dirPct(a,b); return p === null ? '' : p + '% de la recaudación'; };

  // ═════ HTML ═════
  const kpisV = [
    _dirKpi('Ventas concretadas', ventas.length, (ventas.filter(v=>v._reserva).length ? 'incl. '+ventas.filter(v=>v._reserva).length+' reserva(s) · ' : '') + '<a href="#" class="dir-lnk" onclick="abrirDetalleVentasDir(\'todas\');return false;">revisar ✎</a>', DIR_COL.verde),
    _dirKpi('Total vendido', _fmtMonto(totVendido), '', DIR_COL.verde),
    _dirKpi('Ticket promedio', _fmtMonto(ticket), totM2 ? '$'+Math.round(totVendido/totM2)+' por m²' : '', DIR_COL.verde),
    _dirKpi('Conversión lead → visita', convL(fn[2], fn[0]), '', DIR_COL.rosa),
    _dirKpi('Conversión visita → cierre', convL(fn[3], fn[2]), '', DIR_COL.rosa),
  ].join('');
  const kpisC = [
    _dirKpi('Recaudación total', _fmtMonto(totRec), 'terreno '+_fmtMonto(totNT+totCT)+' · acción '+_fmtMonto(totNA+totCA), DIR_COL.azul),
    _dirKpi('Cobrado de ventas nuevas', _fmtMonto(totNueva), pctTxt(totNueva,totRec), DIR_COL.violeta),
    _dirKpi('Cobrado de cartera', _fmtMonto(totCartera), pctTxt(totCartera,totRec), DIR_COL.cian),
    _dirKpi('Minutas firmadas', minutas.length + ' · ' + _fmtMonto(totMin), '', DIR_COL.violeta),
    _dirKpi('Expensas recaudadas', _fmtMontoBs(totExp), 'prom. mensual '+_fmtMontoBs(promExp)+' ('+rangoCerr+')', DIR_COL.verde),
  ].join('');

  const bloque = (n, id, titulo, sub) => `<div class="dir-block-h" id="dir-blk-${id}"><i>${n}</i><div><h2>${titulo}</h2><p>${sub}</p></div></div>`;
  const cover = `<section class="dir-slide dir-cover" data-t="Portada"><div class="dir-cv-e">URUBÓ VILLAGE</div><h1>Informe para Directorio</h1><div class="dir-cv-g">Gestión ${g}-${String(g+1).slice(2)}</div><div class="dir-cv-d">${_labelGestion(g)} · cifras al ${new Date().toLocaleDateString('es-BO',{day:'numeric',month:'long',year:'numeric'})}</div>
    <div class="dir-cv-i"><span>1 Ventas</span><span>2 Marketing</span><span>3 Cartera</span><span>4 Expensas</span></div></section>`;
  const resumen = `<section class="dir-slide dir-resumen" data-t="Resumen"><div class="dir-card-blk">Resumen ejecutivo</div><div class="dir-kpis dir-kpis-v">${kpisV}</div><div class="dir-kpis dir-kpis-c">${kpisC}</div></section>`;
  const anchors = `<nav class="dir-anchors dir-noprint"><span>Ir a</span><a href="#" onclick="dirIr('dir-blk-ventas');return false;">1 · Ventas</a><a href="#" onclick="dirIr('dir-blk-marketing');return false;">2 · Marketing</a><a href="#" onclick="dirIr('dir-blk-cartera');return false;">3 · Cartera</a><a href="#" onclick="dirIr('dir-blk-expensas');return false;">4 · Expensas</a></nav>`;

  // ── 1 · VENTAS ──
  const verBtn = (i) => `<button class="dir-mini-btn" onclick="event.stopPropagation();abrirDetalleVentasDir('mes',${i})">Ver / corregir ›</button>`;
  const noCuentaMes = Array(12).fill(0); _dirVentasAnalisis(g).filter(v=>!v._contar).forEach(v=>{ const i=v._idx-idx0; if(i>=0&&i<12) noCuentaMes[i]++; });
  const filasVM = meses.map((m,i)=>({ oc:`abrirDetalleVentasDir('mes',${i})`, c:[m.label, m.futuro?'—':vMesN[i] + (noCuentaMes[i]?` <span class="dir-chip n" title="Registradas que no cuentan (caídas, duplicadas, excluidas)">+${noCuentaMes[i]}</span>`:''), m.futuro?'—':_dirUsd(vMesM[i]), m.futuro?'':verBtn(i)] }));
  filasVM.push({ tot:true, oc:`abrirDetalleVentasDir('todas')`, c:['Total', ventas.length, _dirUsd(totVendido), `<button class="dir-mini-btn" onclick="event.stopPropagation();abrirDetalleVentasDir('todas')">Ver todas ›</button>`] });
  const filasAses = porAsesor.slice(0,8).map(x=>({ oc:`abrirDetalleVentasDir('asesor','${escJs(x.k)}')`, c:[esc(x.k), x.n, _fmtMonto(x.monto), Math.round(x.monto/(totVendido||1)*100)+'%'] }));
  const secVentas = _dirCard('ventas','Ventas','Ventas nuevas','Contratos concretados en la gestión, en US$ reales — click en un mes o asesor para revisar y corregir (incluye el tipo de cambio de cada venta) · <a href="#" class="dir-lnk" onclick="abrirDetalleVentasDir(\'todas\');return false;">🔍 Revisar / corregir todas</a>',
    `<div class="dir-g2"><div>${_dirCanvas('dir-ch-ventas','Ventas nuevas por mes','tendencia',260)}<div class="dir-sub-h" style="margin-top:22px">Ranking de asesores</div>${_dirTabla(['Asesor','Ventas','Monto','%'],filasAses.length?filasAses:[{c:['—','','','']}])}</div><div>${_dirTabla(['Mes','Ventas','Monto',''],filasVM)}</div></div>`);

  const filasMod = porModal.map((x,i)=>({ oc:`abrirDetalleVentasDir('modalidad','${escJs(x.k)}')`, c:[`<span class="dir-dot" style="background:${DIR_PALETA[i%8]}"></span>${esc(x.k)}`, x.n, _fmtMonto(x.monto), Math.round(x.monto/(totVendido||1)*100)+'%'] }));
  const filasCatV = porCat.map(x=>({ oc:`abrirDetalleVentasDir('categoria','${escJs(x.k)}')`, c:[esc(x.k), x.n, _fmtMonto(x.monto), Math.round(x.monto/(totVendido||1)*100)+'%'] }));
  const filasMdl = porModulo.slice(0,8).map(x=>({ oc:`abrirDetalleVentasDir('modulo','${escJs(x.k)}')`, c:[esc(x.k), x.n, _fmtMonto(x.monto), Math.round(x.monto/(totVendido||1)*100)+'%'] }));
  const pD = (d,l) => l ? (d/l*100).toFixed(1)+'%' : '—';
  const filasDesc = meses.map((m,i) => ({ oc:`abrirDetalleVentasDir('mes',${i})`, c:[m.label, m.futuro?'—':vMesN[i], m.futuro||!vMesN[i]?'—':_dirUsd(dListaM[i]), m.futuro||!vMesN[i]?'—':_dirUsd(dDescM[i]), m.futuro||!vMesN[i]?'—':pD(dDescM[i],dListaM[i]), m.futuro||!dM2M[i]?'—':'$'+Math.round(vMesM[i]/dM2M[i]).toLocaleString('es-BO')] }));
  filasDesc.push({ tot:true, c:['Total', ventas.length, _dirUsd(totLista), _dirUsd(totDesc), pD(totDesc,totLista), totM2?'$'+Math.round(totVendido/totM2).toLocaleString('es-BO'):'—'] });
  const secTotal = _dirCard('total','Ventas','Total vendido','De precio de lista a monto vendido (todo en US$ reales, con el tipo de cambio de cada venta), descuentos por mes y composición por modalidad, categoría y módulo',
    `<div class="dir-wf"><div><span>Precio de lista</span><b>${_fmtMonto(totLista)}</b></div><div class="neg"><span>Descuentos</span><b>− ${_fmtMonto(totDesc)}</b></div><div class="res"><span>Total vendido</span><b>${_fmtMonto(totVendido)}</b></div><div><span>Descuento promedio</span><b>${descProm.toFixed(1)}%</b></div><div><span>Ticket promedio</span><b>${_fmtMonto(ticket)}</b></div><div><span>m² vendidos</span><b>${Math.round(totM2).toLocaleString('es-BO')}</b></div><div><span>US$ por m²</span><b>${totM2?'$'+Math.round(totVendido/totM2).toLocaleString('es-BO'):'—'}</b></div></div>
     <div class="dir-sub-h" style="margin-top:8px">Descuento y precio por m² mes a mes</div>
     <div class="dir-g2 wide-l"><div>${_dirCanvas('dir-ch-desc','Descuento promedio por mes','tendencia',230)}</div><div>${_dirTabla(['Mes','Ventas','Lista','Descuento','% desc.','US$/m²'], filasDesc)}</div></div>
     <div class="dir-g2"><div>${_dirCanvas('dir-ch-modal','Total vendido por modalidad','composicion',230)}<div class="dir-sub-h" style="margin-top:22px">Por modalidad de pago</div>${_dirTabla(['Modalidad','Ventas','Monto','%'],filasMod.length?filasMod:[{c:['—','','','']}])}</div><div><div class="dir-sub-h">Por categoría</div>${_dirTabla(['Categoría','Ventas','Monto','%'],filasCatV.length?filasCatV:[{c:['—','','','']}])}<div class="dir-sub-h" style="margin-top:12px">Por módulo</div>${_dirTabla(['Módulo','Ventas','Monto','%'],filasMdl.length?filasMdl:[{c:['—','','','']}])}</div></div>`);

  const filasMin = meses.map((m,i)=>({ oc:`abrirDetalleMinutasDir(${i})`, c:[m.label, m.futuro?'—':minMesN[i], m.futuro||!minMesN[i]?'—':Math.round(minutas.filter(x=>x.mi===i).reduce((s,x)=>s+x.superficie,0)).toLocaleString('es-BO'), m.futuro?'—':_dirUsd(minMesM[i]), m.futuro||!minMesS[i]?'—':fM2(minMesP[i]/minMesS[i])] }));
  filasMin.push({ tot:true, oc:`abrirDetalleMinutasDir('todas')`, c:['Total', minutas.length, Math.round(totMinSup).toLocaleString('es-BO'), _dirUsd(totMin), fM2(usdM2Min)] });
  const listaMin = minutas.slice(0,60).map(x => ({ c:[`<b>${esc(x.terreno||'—')}</b>`, esc(x.cliente||'—'), x.superficie ? Math.round(x.superficie).toLocaleString('es-BO') : '—', PC_MESES[x.f.getMonth()] + ' ' + x.f.getFullYear(), _dirUsd(x.precio), x.superficie>0 && x.precio>0 ? fM2(x.precio/x.superficie) : '—'] }));
  const mp = dirCorte.minpend || {}, hayMP = _hasN(mp.cantidad) || _hasN(mp.valor), mpN = Number(mp.cantidad)||0, mpV = Number(mp.valor)||0;
  const htmlMP = hayMP ? `<div class="dir-mini row" style="grid-template-columns:repeat(3,1fr);margin-top:14px"><div class="dir-mini-i clk" style="--c:${DIR_COL.ambar}" onclick="abrirMinutasPendDir()"><span>Minutas pendientes por firmar${mp.fecha?' · al '+esc(mp.fecha):''}</span><b>${mpN.toLocaleString('es-BO')}</b></div><div class="dir-mini-i clk" style="--c:${DIR_COL.rojo}" onclick="abrirMinutasPendDir()"><span>Valor pendiente de minutas</span><b>${_fmtMonto(mpV)}</b></div><div class="dir-mini-i"><span>Valor promedio por minuta</span><b>${mpN?_fmtMonto(mpV/mpN):'—'}</b></div></div>` : '';
  const acMin = `<a href="#" class="dir-lnk" onclick="abrirMinutasPendDir();return false;">✎ ${hayMP?'Actualizar':'Cargar'} minutas pendientes</a> · <a href="#" class="dir-lnk" onclick="abrirDetalleMinutasDir('todas');return false;">✎ Ver / editar listado</a> · <a href="#" class="dir-lnk" onclick="document.getElementById('dir-min-input').click();return false;">📂 Importar Excel</a>`;
  const secMinutas = _dirCard('minutas','Cartera','Minutas · firmadas y pendientes','Traspaso de terrenos: ya es dueño del terreno y se reconoce como ingreso · informativo · ' + acMin,
    `<div class="dir-mini row" style="grid-template-columns:repeat(3,1fr)"><div class="dir-mini-i clk" style="--c:${DIR_COL.ambar}" onclick="abrirMinutasPendDir()"><span>Minutas pendientes por firmar${hayMP&&mp.fecha?' · al '+esc(mp.fecha):''}</span><b>${hayMP?mpN.toLocaleString('es-BO'):'cargar ›'}</b></div><div class="dir-mini-i clk" style="--c:${DIR_COL.rojo}" onclick="abrirMinutasPendDir()"><span>Valor pendiente de minutas</span><b>${hayMP?_fmtMonto(mpV):'—'}</b></div><div class="dir-mini-i"><span>Valor promedio por minuta pendiente</span><b>${hayMP&&mpN?_fmtMonto(mpV/mpN):'—'}</b></div></div>
     <div style="margin-top:16px">${_dirTabla(['Estado','Terrenos','Valor US$'],[
       {oc:'abrirDetalleMinutasDir(\'todas\')', c:['Firmadas en la gestión '+esc(_labelGestion(g)), minutas.length, _dirUsd(totMin)]},
       {oc:'abrirMinutasPendDir()', c:['Pendientes por firmar', hayMP?mpN.toLocaleString('es-BO'):'—', hayMP?_dirUsd(mpV):'—']},
       {tot:true, c:['Total (firmadas + pendientes)', (minutas.length + mpN).toLocaleString('es-BO'), _dirUsd(totMin + mpV)]},
     ])}</div>`);

  // ── 2 · MARKETING ──
  const totCanalN = ventas.length || 1;
  const filasCanal = porCanal.slice(0,10).map((x,i)=>{
    const raws = Object.entries(x.raws), multi = raws.length > 1;
    const inc = multi ? `<div class="dir-inc">incluye: ${raws.sort((a,b)=>b[1]-a[1]).map(([r,n])=>esc(r)+' ('+n+')').join(' · ')}</div>` : '';
    return { oc:`abrirDetalleVentasDir('canal','${escJs(x.k)}')`, c:[`<span class="dir-dot" style="background:${DIR_PALETA[i%8]}"></span>${esc(x.k)}${inc}`, x.n, Math.round(x.n/totCanalN*100)+'%', _fmtMonto(x.monto)] };
  });
  const secCanal = _dirCard('canal','Marketing','Canal de ventas','Ventas concretadas por canal de origen, con los canales equivalentes ya agrupados · <a href="#" class="dir-lnk" onclick="abrirEditorCanalesDir();return false;">✎ Agrupar / renombrar canales</a>',
    `<div class="dir-g2"><div>${_dirCanvas('dir-ch-canal','Ventas por canal','composicion',230)}</div><div>${_dirTabla(['Canal','Ventas','%','Monto'],filasCanal.length?filasCanal:[{c:['Sin ventas en la gestión','','','']}])}</div></div>`);
  const secEmbudo = _dirCard('embudo','Marketing','Embudo de ventas','Todo medido sobre los leads (cada etapa = % de los leads) y comparado contra el embudo ideal que tú defines · <a href="#" class="dir-lnk" onclick="abrirEditorEmbudoDir(\'real\');return false;">✎ Cargar cifras reales (Power BI)</a> · <a href="#" class="dir-lnk" onclick="abrirEditorEmbudoDir(\'ideal\');return false;">✎ Definir embudo ideal</a>', `<div id="dir-embudo-body"></div>`);

  // ── 3 · CARTERA ──
  const cc = _dirCorteCartera();
  const fm = x => x === null ? '—' : _fmtMonto(x), star = o => o.calc ? '*' : '';
  const chipM = p => p === null ? '—' : `<span class="dir-chip ${p<=10?'ok':p<=20?'w':'d'}">${p.toFixed(1)}%</span>`;
  const secActual = _dirCard('actual','Cartera','Cartera actual · cuentas por cobrar','Ventas, cobranzas, saldo por cobrar y mora de terrenos y acciones'+(cc&&cc.fecha?' · corte al '+esc(cc.fecha):'')+' · <a href="#" class="dir-lnk" onclick="abrirCorteCarteraDir();return false;">✎ '+(cc?'Actualizar':'Cargar')+' cifras del corte</a>',
    cc ? `<div class="dir-mini row"><div class="dir-mini-i" style="--c:${DIR_COL.azul}"><span>Cartera actual (por cobrar)</span><b>${fm(cc.tot.cartera)}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.rojo}"><span>Mora actual</span><b>${fm(cc.tot.mora)}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.ambar}"><span>% de mora (mora ÷ cartera)</span><b>${cc.tot.pctMora===null?'—':cc.tot.pctMora.toFixed(1)+'%'}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.verde}"><span>Cobranzas totales</span><b>${fm(cc.tot.cobrado)}</b></div></div>
      ${_dirTabla(['Concepto','Terrenos','Acciones','Total'],[
        {c:['Ventas totales (valor)', fm(cc.t.ventas), fm(cc.a.ventas), '<b>'+fm(cc.tot.ventas)+'</b>']},
        {c:['Cobranzas totales', fm(cc.t.cobrado), fm(cc.a.cobrado), '<b>'+fm(cc.tot.cobrado)+'</b>']},
        {c:['Cartera actual (por cobrar)', fm(cc.t.cartera)+star(cc.t), fm(cc.a.cartera)+star(cc.a), '<b>'+fm(cc.tot.cartera)+'</b>']},
        {c:['Mora actual', fm(cc.t.mora), fm(cc.a.mora), '<b>'+fm(cc.tot.mora)+'</b>']},
        {tot:true, c:['% de mora = mora ÷ cartera por cobrar', chipM(cc.t.pctMora), chipM(cc.a.pctMora), chipM(cc.tot.pctMora)]},
      ])}<p class="dir-hint">${(cc.t.calc||cc.a.calc)?'* Cartera calculada = ventas totales − cobranzas totales (no la cargaste directamente). ':''}Cifras cargadas a mano al corte${cc.fecha?' del '+esc(cc.fecha):''}${cc.nota?' · '+esc(cc.nota):''}.</p>`
    : `<div class="dir-vacio"><b>Falta cargar el corte de cartera.</b><p>Aquí va el estado actual de las cuentas por cobrar (terrenos y acciones): ventas totales, cobranzas totales, cartera por cobrar y mora. Mientras no confirmemos qué campo de Orange trae el saldo pendiente, se carga a mano; el botón de diagnóstico te muestra qué entrega Orange.</p><button class="dir-btn-s pri" onclick="abrirCorteCarteraDir()">✎ Cargar cifras del corte</button> <button class="dir-btn-s" onclick="abrirDiagnosticoOrangeDir()">🔎 Ver qué entrega Orange</button></div>`);

  let acum = 0;
  const dd = (m,v) => m.futuro ? '—' : _dirUsd(v);
  const filasRec = meses.map((m,i) => { acum += sTotal[i];
    const tcT = _dirTCMesVal(g,i,'t'), tcA = _dirTCMesVal(g,i,'a'), tcm = (tcT||tcA) ? (tcT===tcA ? tcT : (tcT||'—')+' / '+(tcA||'—')) : 0;
    return { oc:`abrirDetalleCobrosDir('cartera',${i})`, c:[m.label + (tcm ? ` <span class="dir-chip w" title="TC terreno / acción de cartera">TC ${tcm}</span>` : ''), dd(m,sNT[i]), dd(m,sNA[i]), dd(m,sCT[i]), dd(m,sCA[i]), m.futuro?'—':'<b>'+_dirUsd(sTotal[i])+'</b>', dd(m,acum)] }; });
  filasRec.push({ tot:true, c:['Total gestión', _dirUsd(totNT), _dirUsd(totNA), _dirUsd(totCT), _dirUsd(totCA), _dirUsd(totRec), _dirUsd(totRec)] });
  const secRec = _dirCard('recaudacion','Cartera','Recaudación total · '+_labelGestion(g),'Cobranza mensual en US$ reales, separada en Terreno y Acción, de ventas nuevas y de cartera (la seña se suma a venta nueva · terreno). Solo la cartera (terreno y acción) se dolariza con el tipo de cambio del mes; la venta nueva ya viene en US$ reales',
    `<div><div style="margin:0 0 14px"><button class="dir-btn-s pri" onclick="abrirEditorTCDir()">💱 Dolarizar cartera · tipo de cambio por mes</button></div>${_dirCanvas('dir-ch-rec','Recaudación mensual','tendencia',300)}<div class="dir-mini row" style="margin:16px 0 22px;grid-template-columns:repeat(4,1fr)">
      <div class="dir-mini-i" style="--c:${DIR_COL.violeta}"><span>Venta nueva · Terreno</span><b>${_fmtMonto(totNT)}</b></div>
      <div class="dir-mini-i" style="--c:#BFA98A"><span>Venta nueva · Acción</span><b>${_fmtMonto(totNA)}</b></div>
      <div class="dir-mini-i" style="--c:${DIR_COL.azul}"><span>Cartera · Terreno</span><b>${_fmtMonto(totCT)}</b></div>
      <div class="dir-mini-i" style="--c:${DIR_COL.cian}"><span>Cartera · Acción</span><b>${_fmtMonto(totCA)}</b></div></div>
      ${_dirTabla(['Mes','V.N. Terreno','V.N. Acción','Cart. Terreno','Cart. Acción','Total','Acum.'],filasRec)}</div>`);

  const secTipo = _dirCard('tipo','Cartera','Cobranza por tipo de pago','Terreno y acción en US$ reales',
    `<div class="dir-g2 wide-l"><div>${_dirCanvas('dir-ch-cartera','Cartera por tipo de pago','composicion',260)}</div><div>${_dirTabla(['Concepto','Monto','%'],[
      {c:['Terreno (incluye señas)',_dirUsd(totTerreno),(_dirPct(totTerreno,totRec)??'—')+'%']},
      {c:['Acción',_dirUsd(totAccion),(_dirPct(totAccion,totRec)??'—')+'%']},
      {tot:true,c:['Total',_dirUsd(totRec),'100%']},
    ])}</div></div>`);

  const secAcc = _dirCard('acciones','Cartera','Acciones · nuevas y en mora','Cobranza de acciones: de ventas nuevas, vigentes de cartera y recuperadas de mora',
    `<div class="dir-g2 wide-l"><div>${_dirCanvas('dir-ch-acc','Cobranza de acciones por mes','tendencia',250)}</div><div class="dir-mini">
      <div class="dir-mini-i" style="--c:${DIR_COL.violeta}"><span>Acciones nuevas</span><b>${_dirUsd(totAccNueva)}</b></div>
      <div class="dir-mini-i" style="--c:${DIR_COL.azul}"><span>Acciones vigentes (cartera)</span><b>${_dirUsd(totAccVig)}</b></div>
      <div class="dir-mini-i" style="--c:${DIR_COL.rojo}"><span>Acciones en mora cobradas</span><b>${_dirUsd(totAccMora)}</b></div>
      <div class="dir-mini-i tot"><span>Total acciones</span><b>${_dirUsd(totAccion)}</b></div>
    </div></div>`);

  const totCatCart = catList.reduce((s,x)=>s+x.v,0)||1, totCatExp = expCats.reduce((s,x)=>s+x.v,0)||1;
  const filasCatCart = catList.map(x=>({ oc:`abrirDetalleCobrosDir('carcat','${escJs(x.c)}')`, c:[esc(x.c), _dirUsd(x.v), Math.round(x.v/totCatCart*100)+'%'] }));
  const secCatCart = _dirCard('catcart','Cartera','Estado por categoría · cartera','Cómo se compone la cobranza de cartera según su categoría — click en una categoría para ver los cobros',
    `<div class="dir-g2"><div>${_dirCanvas('dir-ch-catc','Cartera por categoría','ranking',250)}</div><div>${_dirTabla(['Categoría','Monto','%'],filasCatCart.length?filasCatCart:[{c:['Sin cobros','','']}])}</div></div>`);

  // ── 4 · EXPENSAS ──
  const filasExp = meses.map((m,i)=>({ oc:`abrirDetalleCobrosDir('expensas',${i})`, c:[m.label + (cerrado[i]?'':(m.futuro?'':' <span class="dir-chip n" title="Mes en curso: no entra en el promedio">en curso</span>')), m.futuro?'—':_fmtMontoBs(sExp[i]), metaExp[i]?_fmtMontoBs(metaExp[i]):'—', m.futuro||!metaExp[i]?'—':_dirPctChip(_dirPct(sExp[i],metaExp[i]))] }));
  filasExp.push({ tot:true, c:['Total', _fmtMontoBs(totExp), _fmtMontoBs(sum(metaExp)), cumplExp!==null?_dirPctChip(cumplExp):'—'] });
  const secExp = _dirCard('expensas','Expensas','Cartera de expensas','Cobrado acumulado desde '+desdeLbl+' hasta '+ultMesLbl+' (último mes cerrado) + pendiente por cobrar = total de la cartera de expensas · <a href="#" class="dir-lnk" onclick="abrirCorteExpensasDir();return false;">✎ '+(hayPend?'Actualizar':'Cargar')+' pendiente / fecha de inicio</a>',
    `<div class="dir-mini row"><div class="dir-mini-i" style="--c:${DIR_COL.verde}"><span>Cobrado acumulado · ${esc(desdeLbl)} a ${esc(ultMesLbl)}</span><b>${_fmtMontoBs(acumExp)}</b></div><div class="dir-mini-i clk" title="Click para editar el pendiente" style="--c:${DIR_COL.rojo}" onclick="abrirCorteExpensasDir()"><span>Pendiente por cobrar ✎${hayPend&&cxe.fecha?' · al '+esc(cxe.fecha):''}</span><b>${hayPend?_fmtMontoBs(pendExp):'cargar ›'}</b></div><div class="dir-mini-i tot"><span>Total cartera de expensas</span><b>${hayPend?_fmtMontoBs(totCartExp):'—'}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.ambar}"><span>% cobrado de la cartera</span><b>${hayPend&&totCartExp?Math.round(acumExp/totCartExp*100)+'%':'—'}</b></div></div>
     ${faltaHist?`<div class="dir-note" style="margin:10px 0 0"><b>Ojo:</b> el primer cobro que entrega Orange es de ${PC_MESES[primerIdxOrange%12]} ${Math.floor(primerIdxOrange/12)}, posterior a ${esc(desdeLbl)}; el acumulado solo suma lo que Orange trae.</div>`:''}
     <div class="dir-g2" style="margin-top:14px"><div><div class="dir-sub-h">Cobranza vs. cuentas por cobrar · por gestión</div>${_dirTabla(['Gestión','Cobrado','Debió cobrarse','% cumpl.'],filasGE)}<p class="dir-hint" style="margin-top:8px">"Debió cobrarse" = lo programado para esos meses. En la gestión en curso solo cuentan los meses cerrados. Click en una fila para ajustar a mano los montos (✎).</p></div>
     <div class="dir-mini" style="grid-template-columns:1fr"><div class="dir-mini-i" style="--c:${DIR_COL.verde}"><span>Recaudado en la gestión ${esc(_labelGestion(g))}</span><b>${_fmtMontoBs(totExp)}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.azul}"><span>Promedio mensual · ${nCerrados} mes(es) cerrado(s) (${rangoCerr})</span><b>${_fmtMontoBs(promExp)}</b></div><div class="dir-mini-i" style="--c:${DIR_COL.ambar}"><span>Cumplimiento de meta (meses cerrados)</span><b>${cumplExp!==null?cumplExp+'%':'—'}</b></div></div></div>
     <div class="dir-g2 wide-l" style="margin-top:20px"><div>${_dirCanvas('dir-ch-exp','Expensas por mes','tendencia',250)}</div><div>${_dirTabla(['Mes','Recaudado','Meta','Cumpl.'],filasExp)}</div></div>
     <p class="dir-hint">Click en un mes para ver los cobros. El pendiente se carga como corte mientras confirmamos qué campo de Orange trae el saldo por cobrar (el "adeudado" actual del sistema suma cobranzas, no saldos).</p>`);
  const filasCatExp = expCats.map(x=>({ oc:`abrirDetalleCobrosDir('expcat','${escJs(x.c)}')`, c:[esc(x.c), _fmtMontoBs(x.v), Math.round(x.v/totCatExp*100)+'%'] }));
  const secCatExp = _dirCard('catexp','Expensas','Estado por categoría · expensas','Cómo se compone lo pagado según su categoría — click en una categoría para ver los cobros',
    `<div class="dir-g2"><div>${_dirCanvas('dir-ch-cate','Expensas por categoría','composicion',230)}</div><div>${_dirTabla(['Categoría','Monto','%'],filasCatExp.length?filasCatExp:[{c:['Sin cobros','','']}])}</div></div>`);

  // ── Anexo (no va en la presentación) ──
  const filasComp = gestiones.map((x,i)=>({ c:[`${x}-${String(x+1).slice(2)}`+(x===g?' ◀':''), _fmtMonto(compRec[i]), compN[i], _fmtMonto(compVen[i])] }));
  const secComp = `<section class="dir-card dir-annex dir-noprint" id="dir-sec-comp"><header class="dir-card-h"><span class="dir-num">A</span><div><h3>Anexo · Comparativo entre gestiones</h3><p>Solo para consulta interna: las gestiones anteriores no están revisadas, por eso no va en la presentación.</p></div></header>
    <div class="dir-g2"><div>${_dirCanvas('dir-ch-comp','Comparativo de gestiones','ranking',230)}</div><div>${_dirTabla(['Gestión','Recaudación','Ventas','Monto vendido'],filasComp)}</div></div></section>`;

  cont.innerHTML = (sinDatosOrange ? '<div class="dir-alert">⏳ Cargando datos de Orange… el informe se completa solo en unos segundos.</div>' : '') + cover + resumen + anchors +
    bloque(1,'ventas','Ventas','Lo vendido en la gestión, sus descuentos y su composición') + secVentas + secTotal +
    bloque(2,'marketing','Marketing','De dónde vienen las ventas y cómo avanza el embudo') + secCanal + secEmbudo +
    bloque(3,'cartera','Cartera','Cuentas por cobrar, minutas firmadas y cobranza de terrenos y acciones') + secActual + secMinutas + secRec + secTipo + secAcc +
    bloque(4,'expensas','Expensas','Cartera de expensas y su recaudación') + secExp +
    '';

  cont.querySelectorAll('.dir-card:not(.dir-annex) .dir-num').forEach((e,i) => { e.textContent = String(i+1).padStart(2,'0'); });
  setText('dir-titulo', 'Gestión ' + g + '-' + String(g+1).slice(2));
  setText('dir-sub', _labelGestion(g) + ' · ' + mesesTranscurridos + ' de 12 meses transcurridos · Generado ' + new Date().toLocaleString('es-BO') + ' · versión ' + DIR_BUILD);

  // ═════ GRÁFICOS ═════
  _dirDestroy();
  _dirPintarEmbudo();
  const fut = meses.map(m=>m.futuro);
  const ndat = a => a.map((v,i)=> fut[i] ? null : Math.round(v));
  const fmtTip = v => _fmtMonto(v);
  const yUsd = { ...(_dirAxisBase.y), ticks:{ ..._dirAxisBase.y.ticks, callback:v=>_fmtMonto(v) } };
  const legend = { position:'bottom', labels:{ usePointStyle:true, boxWidth:8, font:{size:11}, color:'#2A2A2A' } };
  const lbls = meses.map(m=>m.label);

  _dirNuevo('dir-ch-rec', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'V. nueva · Terreno', data:ndat(sNT), backgroundColor:DIR_COL.violeta, stack:'a' },
    { label:'V. nueva · Acción', data:ndat(sNA), backgroundColor:'#BFA98A', stack:'a' },
    { label:'Cartera · Terreno', data:ndat(sCT), backgroundColor:DIR_COL.azul, stack:'a' },
    { label:'Cartera · Acción', data:ndat(sCA), backgroundColor:DIR_COL.cian, stack:'a', borderRadius:3 },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtTip(c.parsed.y)}} }, scales:{ x:{..._dirAxisBase.x, stacked:true}, y:{...yUsd, stacked:true} } } });

  _dirNuevo('dir-ch-canal', { type:'doughnut', data:{ labels:porCanal.map(x=>x.k), datasets:[{ data:porCanal.map(x=>x.n), backgroundColor:porCanal.map((x,i)=>DIR_PALETA[i%8]), borderWidth:2, borderColor:'#fff' }] },
    options:{ cutout:'62%', plugins:{ legend:{...legend, position:'right'}, datalabels:{ display:c=>c.dataset.data[c.dataIndex]>0, color:'#fff', font:{weight:'700',size:11}, formatter:v=>v } } } });

  _dirNuevo('dir-ch-ventas', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'Monto vendido (US$ reales)', data:ndat(vMesM), backgroundColor:DIR_COL.verde, borderRadius:3, yAxisID:'y' },
    { type:'line', label:'Ventas (n)', data:fut.map((f,i)=>f?null:vMesN[i]), borderColor:DIR_COL.tinta, backgroundColor:DIR_COL.tinta, pointRadius:4, tension:.25, yAxisID:'y1',
      datalabels:{ display:c=>c.dataset.data[c.dataIndex]>0, align:'top', anchor:'end', color:'#1A1A1A', font:{weight:'700',size:10} } },
  ]}, options:{ onClick:(e,els)=>{ if (els.length) abrirDetalleVentasDir('mes', els[0].index); }, plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y1'?c.parsed.y:fmtTip(c.parsed.y))}} }, scales:{ x:_dirAxisBase.x, y:yUsd, y1:{ position:'right', beginAtZero:true, grid:{display:false}, ticks:{precision:0, color:'#4F493F'} } } } });

  _dirNuevo('dir-ch-desc', { type:'bar', data:{ labels:lbls, datasets:[{ label:'% de descuento', data:meses.map((m,i)=> (m.futuro||!dListaM[i]) ? null : Math.round(dDescM[i]/dListaM[i]*1000)/10), backgroundColor:DIR_COL.ambar, borderRadius:3 }] },
    options:{ plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>c.parsed.y+'%'}}, datalabels:{ display:c=>c.dataset.data[c.dataIndex]!==null, anchor:'end', align:'end', color:'#1A1A1A', font:{size:10,weight:'600'}, formatter:v=>v+'%' } }, layout:{padding:{top:16}}, scales:{ x:_dirAxisBase.x, y:{..._dirAxisBase.y, ticks:{..._dirAxisBase.y.ticks, callback:v=>v+'%'}} } } });

  _dirNuevo('dir-ch-min', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'Valor de minutas (US$)', data:ndat(minMesM), backgroundColor:DIR_COL.violeta, borderRadius:3, yAxisID:'y' },
    { type:'line', label:'US$ por m²', data:fut.map((f,i)=>(f||!minMesS[i])?null:Math.round(minMesP[i]/minMesS[i])), borderColor:DIR_COL.tinta, backgroundColor:DIR_COL.tinta, pointRadius:4, tension:.25, yAxisID:'y1', spanGaps:true,
      datalabels:{ display:c=>c.dataset.data[c.dataIndex]>0, align:'top', anchor:'end', color:'#1A1A1A', font:{weight:'700',size:10}, formatter:v=>'$'+v.toLocaleString('es-BO') } },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y1'?'$'+c.parsed.y.toLocaleString('es-BO'):fmtTip(c.parsed.y))}} }, scales:{ x:_dirAxisBase.x, y:yUsd, y1:{ position:'right', beginAtZero:true, grid:{display:false}, ticks:{color:'#4F493F', callback:v=>'$'+v} } } } });

  _dirNuevo('dir-ch-cartera', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'Terreno', data:ndat(sTerreno), backgroundColor:DIR_COL.azul, stack:'a', borderRadius:3 },
    { label:'Acción', data:ndat(sAccion), backgroundColor:DIR_COL.ambar, stack:'a', borderRadius:3 },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtTip(c.parsed.y)}} }, scales:{ x:{..._dirAxisBase.x, stacked:true}, y:{...yUsd, stacked:true} } } });

  _dirNuevo('dir-ch-acc', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'Acciones nuevas', data:ndat(sAccNueva), backgroundColor:DIR_COL.violeta, stack:'a', borderRadius:3 },
    { label:'Vigentes (cartera)', data:ndat(sAccVig), backgroundColor:DIR_COL.azul, stack:'a', borderRadius:3 },
    { label:'Mora cobrada', data:ndat(sAccMora), backgroundColor:DIR_COL.rojo, stack:'a', borderRadius:3 },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtTip(c.parsed.y)}} }, scales:{ x:{..._dirAxisBase.x, stacked:true}, y:{...yUsd, stacked:true} } } });

  _dirNuevo('dir-ch-modal', { type:'doughnut', data:{ labels:porModal.map(x=>x.k), datasets:[{ data:porModal.map(x=>Math.round(x.monto)), backgroundColor:porModal.map((x,i)=>DIR_PALETA[i%8]), borderWidth:2, borderColor:'#fff' }] },
    options:{ cutout:'62%', plugins:{ legend:{...legend, position:'right'}, tooltip:{callbacks:{label:c=>c.label+': '+fmtTip(c.parsed)}}, datalabels:{ display:false } } } });

  const promLinea = fut.map((f,i)=> (f||!cerrado[i]) ? null : Math.round(promExp));
  _dirNuevo('dir-ch-exp', { type:'bar', data:{ labels:lbls, datasets:[
    { label:'Recaudado (Bs)', data:ndat(sExp), backgroundColor:DIR_COL.verde, borderRadius:3 },
    { type:'line', label:'Promedio meses cerrados', data:promLinea, borderColor:DIR_COL.tinta, borderWidth:2, borderDash:[4,4], pointRadius:0, tension:0 },
    { type:'line', label:'Meta', data:metaExp.map(v=>v||null), borderColor:DIR_COL.ambar, backgroundColor:DIR_COL.ambar, borderWidth:2, pointRadius:3, tension:.25, spanGaps:true },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+_fmtMontoBs(c.parsed.y)}} }, scales:{ x:_dirAxisBase.x, y:{..._dirAxisBase.y, ticks:{..._dirAxisBase.y.ticks, callback:v=>_fmtMontoBs(v)}} } } });

  const colCat = { 'Vigente Terreno':DIR_COL.azul,'Vigente Acción':DIR_COL.cian,'Mora Terreno':DIR_COL.rojo,'Mora Acción':'#8A3F31','Adelanto Terreno':DIR_COL.verde,'Adelanto Acción':'#7FA36B','Otros Ingresos':DIR_COL.gris,'Venta Nueva':DIR_COL.violeta,'Desembolso Bancario':DIR_COL.ambar,'Pronto Pago':DIR_COL.rosa,'Sin categorizar':'#D0D5DD' };
  _dirNuevo('dir-ch-catc', { type:'bar', data:{ labels:catList.map(x=>x.c), datasets:[{ data:catList.map(x=>Math.round(x.v)), backgroundColor:catList.map(x=>colCat[x.c]||DIR_COL.gris), borderRadius:3 }] },
    options:{ indexAxis:'y', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>fmtTip(c.parsed.x)}}, datalabels:{ display:true, anchor:'end', align:'end', color:'#2A2A2A', font:{size:10,weight:'600'}, formatter:v=>_fmtMonto(v) } }, layout:{padding:{right:46}}, scales:{ x:{ ...yUsd, grid:{color:'rgba(16,24,40,.06)'} }, y:{ grid:{display:false}, ticks:{color:'#2A2A2A', font:{size:11}} } } } });

  const colExp = { 'Vigente':DIR_COL.verde,'Mora':DIR_COL.rojo,'Adelanto':DIR_COL.azul,'Otros Ingresos':DIR_COL.gris,'Sin categorizar':'#D0D5DD' };
  _dirNuevo('dir-ch-cate', { type:'doughnut', data:{ labels:expCats.map(x=>x.c), datasets:[{ data:expCats.map(x=>Math.round(x.v)), backgroundColor:expCats.map(x=>colExp[x.c]||DIR_COL.gris), borderWidth:2, borderColor:'#fff' }] },
    options:{ cutout:'62%', plugins:{ legend:{...legend, position:'right'}, tooltip:{callbacks:{label:c=>c.label+': '+_fmtMontoBs(c.parsed)}}, datalabels:{ display:false } } } });

  _dirNuevo('dir-ch-comp', { type:'bar', data:{ labels:gestiones.map(x=>x+'-'+String(x+1).slice(2)), datasets:[
    { label:'Recaudación', data:compRec.map(Math.round), backgroundColor:DIR_COL.azul, borderRadius:3 },
    { label:'Monto vendido', data:compVen.map(Math.round), backgroundColor:DIR_COL.verde, borderRadius:3 },
  ]}, options:{ plugins:{ legend, tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtTip(c.parsed.y)}}, datalabels:{ display:true, anchor:'end', align:'end', color:'#2A2A2A', font:{size:10,weight:'600'}, formatter:v=>v>0?_fmtMonto(v):'' } }, layout:{padding:{top:16}}, scales:{ x:_dirAxisBase.x, y:yUsd } } });

  if (_dirPres.on) _dirPresGo(_dirPres.i);
}

/* ═══ DRILL-DOWN del Informe de Directorio: abrir el detalle detrás de cada cifra y corregirlo ═══ */
let _dirDrill = null;      // { tipo:'ventas'|'cobros', modo, arg }
let _dirEditKey = null;    // venta que se está editando en el modal

// Si una venta fue corregida a mano (mes/año), esa gestión también manda sobre la clasificación
// "venta nueva vs cartera" de los cobros — así la corrección se refleja en TODO el informe.
function _dirAplicarCorreccionesGestion() {
  ventasConcretadasData.forEach(v => {
    if (!v.correccionManual || !v.terreno) return;
    const ref = _dirGestionVenta(v);
    if (ref) _terrenoGestionVentaMap[v.terreno] = ref.g;
  });
}
function _dirRefrescarSiAbierto() {
  if (!document.getElementById('panel-directorio')?.classList.contains('active')) return;
  renderInformeDirectorio();
  if (_dirDrill && !['embudo','tc','canales','cortec','cortee','diag','minimport','cortem'].includes(_dirDrill.tipo) && document.getElementById('dir-modal')?.classList.contains('open')) _dirRenderModal();
}
function cerrarModalDirectorio() { document.getElementById('dir-modal')?.classList.remove('open'); _dirDrill = null; _dirEditKey = null; }

function abrirDetalleVentasDir(modo, arg) { _dirDrill = { tipo:'ventas', modo, arg }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function abrirDetalleCobrosDir(modo, arg) { _dirDrill = { tipo:'cobros', modo, arg }; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }

function _dirFiltrarVentas(lista, d) {
  const g = dirGestion ?? _gestionActual(), idx0 = _dirMesesGestion(g)[0];
  const base = idx0.anio*12 + idx0.mes;
  switch (d.modo) {
    case 'mes':       return lista.filter(v => v._idx - base === d.arg);
    case 'canal':     return lista.filter(v => _dirCanalGrupo(v.canal||v.gestion||'') === d.arg);
    case 'asesor':    return lista.filter(v => _dirGrupoGen('asesor', v.asesorNombre) === d.arg);
    case 'modalidad': return lista.filter(v => _dirGrupoGen('modalidad', v.modalidad) === d.arg);
    case 'categoria': return lista.filter(v => (v.categoria||'Sin dato') === d.arg);
    case 'modulo':    return lista.filter(v => _dirModuloKey(v.modulo) === d.arg);
    default:          return lista;
  }
}

function _dirRenderModal() {
  const d = _dirDrill; if (!d) return;
  _dirAplicarCorreccionesGestion();
  const g = dirGestion ?? _gestionActual(), meses = _dirMesesGestion(g);
  const body = document.getElementById('dir-modal-body');
  if (d.tipo === 'mora') return _dirRenderMora();
  if (d.tipo === 'reservas') return _dirRenderReservas();
  if (d.tipo === 'embudo') return _dirRenderEditorEmbudo();
  if (d.tipo === 'excel') return _dirRenderExcel();
  if (d.tipo === 'tc') return _dirRenderEditorTC();
  if (d.tipo === 'canales') return _dirRenderEditorCanales();
  if (d.tipo === 'cortec') return _dirRenderCorteCartera();
  if (d.tipo === 'cortee') return _dirRenderCorteExpensas();
  if (d.tipo === 'cortem') return _dirRenderMinPend();
  if (d.tipo === 'minutas') return _dirRenderMinutas();
  if (d.tipo === 'minimport') return _dirRenderMinImport();
  const nombreFiltro = d.modo==='mes' ? meses[d.arg]?.label : d.modo==='todas' ? 'toda la gestión' : d.arg;

  if (d.tipo === 'ventas') {
    const lista = _dirFiltrarVentas(_dirVentasAnalisis(g), d).sort((a,b)=>a._idx-b._idx);
    const contadas = lista.filter(v=>v._contar), noContadas = lista.length - contadas.length;
    const total = contadas.reduce((s,v)=>s+(v._real||0),0);
    setText('dir-modal-titulo', '🧾 Ventas concretadas · ' + nombreFiltro);
    setText('dir-modal-sub', contadas.length + ' venta(s) que cuentan · ' + _dirUsd(total) + (noContadas ? ' · ' + noContadas + ' registrada(s) que NO cuentan (ver razón)' : '') + ' · Gestión ' + g + '-' + String(g+1).slice(2));
    const opM = m => PC_MESES.map(x=>`<option ${x===m?'selected':''}>${x}</option>`).join('');
    const filas = lista.map(v => {
      const gOr = v._reserva ? undefined : _terrenoGestionVentaMap[v.terreno];
      const chipOr = (gOr !== undefined && gOr !== g) ? `<span class="dir-chip d" title="Orange registra la firma de este terreno en otra gestión, por eso sus cobros se clasifican como Cartera. Si el mes es incorrecto, corrígelo; si no corresponde a esta gestión, márcala 'No contar'.">Orange: gestión ${gOr}-${String(gOr+1).slice(2)}</span> ` : '';
      const origen = v._reserva ? '<span class="dir-chip w">Reserva incluida</span>' : (String(v._key).startsWith('orange-') ? '<span class="dir-chip n">Orange</span>' : '<span class="dir-chip n">Manual</span>');
      const corr = v.correccionManual ? `<span class="dir-chip w" title="${esc((v.correccionManual.motivo||'')+' — '+(v.correccionManual.por||''))}">corregida</span>` : '';
      const razon = v._contar ? '' : `<span class="dir-chip d" title="No suma en el informe">${esc(v._razon)}</span> `;
      const fila = `<tr class="${v._contar?'':'dir-off'}"><td>${esc(v.mes||'—')} ${v.anio||v['año']||''}</td><td><b>${esc(v.cliente||'—')}</b></td><td>${esc(v.terreno||'—')}</td><td>${esc(v.canal||v.gestion||'—')}</td><td>${esc(v.modalidad||'—')}</td><td>${esc(v.asesorNombre||'—')}</td><td>${esc(v.estadoVenta||'—')}</td><td class="r">${_dirUsd(v.precioVenta)}</td><td><input class="dir-tc" type="number" step="0.01" min="0" value="${v._tc||''}" placeholder="${DIR_TC_BASE.toFixed(2)}" onchange="${v._reserva?`_dirTCGuardarReserva('${escJs(v._resKey)}',this.value)`:`_dirTCGuardarVenta('${escJs(v._key)}',this.value)`}" title="Tipo de cambio real de esta venta (vacío = ${DIR_TC_BASE.toFixed(2)})"></td><td class="r"><b>${_dirUsd(v._real)}</b></td><td>${razon}${chipOr}${origen} ${corr}</td><td>${v._reserva ? `<button class="dir-mini-btn" onclick="abrirReservasDir()">✎ Editar</button> <button class="dir-mini-btn" onclick="_dirReservaQuitar('${escJs(v._resKey)}')">Quitar</button>` : `<button class="dir-mini-btn" onclick="_dirEditarVenta('${escJs(v._key)}')">✎ Corregir</button>`}</td></tr>`;
      if (_dirEditKey !== v._key || v._reserva) return fila;
      const anio = v.anio||v['año']||'';
      return fila + `<tr class="dir-edit"><td colspan="12"><div class="dir-ef">
        <label>Mes<select id="dir-e-mes">${opM(v.mes)}</select></label>
        <label>Año<input id="dir-e-anio" type="number" value="${anio}" style="width:90px"></label>
        <label>Estado de la venta<select id="dir-e-estado"><option ${/ca[ií]d/i.test(v.estadoVenta||'')?'':'selected'} value="${esc(/ca[ií]d/i.test(v.estadoVenta||'')?'Contrato Firmado':(v.estadoVenta||'Contrato Firmado'))}">${esc(/ca[ií]d/i.test(v.estadoVenta||'')?'Contrato Firmado':(v.estadoVenta||'Contrato Firmado'))} (vigente)</option><option ${/ca[ií]d/i.test(v.estadoVenta||'')?'selected':''} value="Caída">Caída — no cuenta como venta</option></select></label>
        <label>Canal<input id="dir-e-canal" value="${esc(v.canal||v.gestion||'')}"></label>
        <label>Modalidad<input id="dir-e-modal" value="${esc(v.modalidad||'')}"></label>
        <label>Categoría<input id="dir-e-cat" value="${esc(v.categoria||'')}" style="width:70px"></label>
        <label>Precio de venta (US$)<input id="dir-e-precio" type="number" value="${v.precioVenta||0}" style="width:120px"></label>
        <label>¿Cuenta en el informe?<select id="dir-e-contar"><option value="auto" ${(!v.contarInforme||v.contarInforme==='auto')?'selected':''}>Automático (${v._contar?'cuenta':'no cuenta: '+esc(v._razon)})</option><option value="si" ${v.contarInforme==='si'?'selected':''}>Sí, contar siempre</option><option value="no" ${v.contarInforme==='no'?'selected':''}>No contar</option></select></label>
        <label class="wide">Motivo de la corrección (obligatorio)<input id="dir-e-motivo" placeholder="Ej.: la firma fue en junio, no en mayo"></label>
        <div class="dir-ef-b"><button class="dir-btn-s pri" onclick="_dirGuardarVenta('${escJs(v._key)}')">💾 Guardar corrección</button><button class="dir-btn-s" onclick="_dirEditKey=null;_dirRenderModal()">Cancelar</button></div>
        ${(v.historialCorrecciones||[]).length ? `<div class="dir-hist"><b>Historial:</b> ${(v.historialCorrecciones||[]).map(h=>esc(h.fecha+' · '+h.por+' · '+h.motivo+' → '+h.cambios)).join(' | ')}</div>` : ''}
      </div></td></tr>`;
    }).join('');
    const opMes = (sel) => meses.map((m,i)=>`<option value="${i}" ${i===sel?'selected':''}>${m.label}</option>`).join('');
    const masivo = `<div class="dir-tcbar"><b>💱 Tipo de cambio</b><span>Cada venta tiene su TC real (columna <b>TC real</b>, vacío = ${DIR_TC_BASE.toFixed(2)}); el monto en US$ reales es precio × ${DIR_TC_BASE.toFixed(2)} ÷ TC. Para varias a la vez:</span>
      <label>de<select id="dtcm-desde">${opMes(0)}</select></label><label>a<select id="dtcm-hasta">${opMes(2)}</select></label><label>TC<input id="dtcm-valor" type="number" step="0.01" placeholder="9.50" style="width:80px"></label><label class="dir-chk"><input type="checkbox" id="dtcm-vacias" checked> solo las que no tienen TC</label><button class="dir-mini-btn pri" onclick="_dirTCMasivo()">Aplicar a todas</button></div>`;
    body.innerHTML = masivo + `<div class="dir-note" style="margin:0 0 12px">Las correcciones se guardan en la venta misma: se actualizan <b>todo el Informe de Directorio</b> (ventas, canal, embudo, desagregación, comparativo y la clasificación venta nueva / cartera) y también el módulo Ventas Concretadas. Si la venta viene de Orange, la corrección se mantiene aunque se vuelva a sincronizar.</div>
      <div class="dir-tw"><table class="dir-t"><thead><tr><th>Mes</th><th>Cliente</th><th>Terreno</th><th>Canal</th><th>Modalidad</th><th>Asesor</th><th>Estado</th><th class="r">Precio venta</th><th>TC real</th><th class="r">US$ reales</th><th>Origen</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--ink-500)">Sin ventas en este filtro.</td></tr>'}</tbody></table></div>`;
    return;
  }

  // cobros — solo lectura
  const esExp = d.modo === 'expensas' || d.modo === 'expcat';
  const porMes = d.modo === 'cartera' || d.modo === 'expensas';
  const base = meses[0].anio*12 + meses[0].mes;
  let lista;
  if (esExp) {
    const expG = orangeExpensasDetalleRaw.filter(r => r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === g);
    lista = porMes ? expG.filter(r => _dirIdx(r) - base === d.arg) : expG.filter(r => _dirNormCatExp(r) === d.arg);
  } else {
    const cg = _dirCobrosG(g);
    lista = porMes ? cg.filter(r => r._mi === d.arg) : cg.filter(r => (carteraCategoriasData[r.key]?.categoria || 'Sin categorizar') === d.arg);
  }
  lista = lista.slice().sort((a,b)=>b.monto-a.monto);
  const etq = porMes ? meses[d.arg].label : d.arg;
  const total = lista.reduce((s,r)=>s+r.monto,0), totalOrig = lista.reduce((s,r)=>s+(r.montoOrig ?? r.monto),0);
  setText('dir-modal-titulo', (esExp?'🏘 Cobros de expensas':'💰 Cobros de cartera') + ' · ' + etq);
  setText('dir-modal-sub', lista.length + ' cobro(s) · ' + (esExp?_fmtMontoBs(total):_dirUsd(total) + (Math.abs(total-totalOrig)>1 ? ' reales (Orange: ' + _dirUsd(totalOrig) + ')' : '')) + ' (mayores primero, hasta 300 filas)');
  const filas = lista.slice(0,300).map(r => {
    const cat = esExp ? _dirNormCatExp(r) : (carteraCategoriasData[r.key]?.categoria || 'Sin categorizar');
    const tipo = esExp ? (r.mesCuota ? r.mesCuota+' '+r.anioCuota : '—') : r.tipoPago;
    if (esExp) return `<tr><td>${esc(r.fecha||'')}</td><td><b>${esc(r.cliente||'—')}</b></td><td>${esc(r.terreno||'—')}</td><td>${esc(String(tipo))}</td><td>${esc(cat)}</td><td class="r">${_fmtMontoBs(r.monto)}</td></tr>`;
    const tcTxt = r._tc ? `<span class="dir-chip w" title="${r._nueva?'TC de la venta de este terreno':'TC del mes'}">${r._tc}</span>` : '<span style="color:var(--ink-500)">'+DIR_TC_BASE.toFixed(2)+'</span>';
    return `<tr><td>${esc(r.fecha||'')}</td><td><b>${esc(r.cliente||'—')}</b></td><td>${esc(r.terreno||'—')}</td><td>${esc(String(tipo))}</td><td>${esc(cat)}</td><td>${r._nueva?'Venta nueva':'Cartera'}</td><td class="r">${tcTxt}</td><td class="r">${_dirUsd(r.montoOrig)}</td><td class="r"><b>${_dirUsd(r.monto)}</b></td></tr>`;
  }).join('');
  const colsC = esExp ? '<th>Fecha</th><th>Cliente</th><th>Terreno</th><th>Cuota de</th><th>Categoría</th><th class="r">Monto</th>'
    : '<th>Fecha</th><th>Cliente</th><th>Terreno</th><th>Tipo</th><th>Categoría</th><th>Clasificación</th><th class="r">TC</th><th class="r">Según Orange</th><th class="r">US$ reales</th>';
  body.innerHTML = `<div class="dir-note" style="margin:0 0 12px">Estos cobros vienen de Orange (solo lectura). Lo que sí se corrige es su <b>categoría</b> (desde Cartera → solicitud de cambio, con aprobación) o la <b>fecha de venta</b> del terreno, que cambia si es venta nueva o cartera.${esExp?'':' El monto "US$ reales" aplica el tipo de cambio: el de la venta si es venta nueva, el del mes si es cartera.'}</div>
    <div class="dir-tw"><table class="dir-t"><thead><tr>${colsC}</tr></thead><tbody>${filas || `<tr><td colspan="9" style="text-align:center;padding:24px">Sin cobros en este filtro.</td></tr>`}</tbody></table></div>`;
}

function _dirEditarVenta(key) { _dirEditKey = (_dirEditKey === key) ? null : key; _dirRenderModal(); }

async function _dirGuardarVenta(key) {
  const v = ventasConcretadasData.find(x => x._key === key); if (!v) return;
  const motivo = (document.getElementById('dir-e-motivo').value||'').trim();
  if (!motivo) { toastErr('Escribí el motivo de la corrección.'); return; }
  const anio = parseInt(document.getElementById('dir-e-anio').value);
  const mes = document.getElementById('dir-e-mes').value;
  const mesIdx = PC_MESES.indexOf(mes);
  if (!anio || mesIdx < 0) { toastErr('Mes o año inválido.'); return; }
  const nuevo = {
    mes, año:anio, anio, trimestre:['1er','1er','1er','2do','2do','2do','3er','3er','3er','4to','4to','4to'][mesIdx]+' Trimestre',
    estadoVenta: document.getElementById('dir-e-estado').value,
    canal: document.getElementById('dir-e-canal').value.trim(), gestion: document.getElementById('dir-e-canal').value.trim(),
    modalidad: document.getElementById('dir-e-modal').value.trim(),
    categoria: document.getElementById('dir-e-cat').value.trim(),
    precioVenta: parseFloat(document.getElementById('dir-e-precio').value)||0,
    contarInforme: document.getElementById('dir-e-contar').value,
  };
  const etiqueta = { mes:'Mes', año:'Año', estadoVenta:'Estado', canal:'Canal', modalidad:'Modalidad', categoria:'Categoría', precioVenta:'Precio', contarInforme:'Cuenta en informe' };
  const cambios = Object.keys(etiqueta).filter(k => String(v[k]??(k==='contarInforme'?'auto':'')) !== String(nuevo[k]??'')).map(k => etiqueta[k]+': '+(v[k]??'—')+' → '+nuevo[k]);
  if (!cambios.length) { toastErr('No cambiaste ningún dato.'); return; }
  const por = asesorActual?.nombre || 'Gerencia';
  const campos = { mes:nuevo.mes, año:nuevo.año, anio:nuevo.anio, trimestre:nuevo.trimestre, estadoVenta:nuevo.estadoVenta, canal:nuevo.canal, gestion:nuevo.gestion, modalidad:nuevo.modalidad, categoria:nuevo.categoria, precioVenta:nuevo.precioVenta, contarInforme:nuevo.contarInforme };
  const hist = (v.historialCorrecciones||[]).concat([{ fecha:new Date().toLocaleString('es-BO'), por, motivo, cambios:cambios.join('; ') }]);
  try {
    await window._fbUpdateVentaConcretada(key, { ...campos, correccionManual:{ campos, motivo, por, ts:Date.now() }, historialCorrecciones:hist });
    _dirEditKey = null;
    toastOk('Corrección guardada. El informe se está actualizando.');
  } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}

/* ═══ Mora de expensas: detalle de lotes (mismo criterio que el panel Expensas) ═══ */
function abrirDetalleMoraDir(tier) { _dirDrill = { tipo:'mora', arg:tier }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderMora() {
  const tier = _dirDrill.arg;
  const lista = orangeMoraData.filter(r => tier==='todas' ? String(r.estado||'').startsWith('Mora') : r.estado===tier).sort((a,b)=>(b.montoAdeudadoBS||0)-(a.montoAdeudadoBS||0));
  const total = lista.reduce((s,r)=>s+(r.montoAdeudadoBS||0),0);
  setText('dir-modal-titulo', '⚠️ Mora de expensas · ' + (tier==='todas' ? 'todos los tramos' : tier));
  setText('dir-modal-sub', lista.length + ' lote(s) · ' + _fmtMontoBs(total) + ' · cada lote se cuenta una sola vez (clave = terreno)');
  const hoy = Date.now(), recientes = new Set();
  orangeExpensasDetalleRaw.forEach(r => { if (_dirNormCatExp(r)==='Vigente' && r.fechaOrden && (hoy-r.fechaOrden) < 60*864e5) recientes.add(r.terreno); });
  const filas = lista.map(r => `<tr><td><b>${esc(r.terreno)}</b></td><td>${esc(r.cliente||'—')}</td><td>${esc(r.asesor||'—')}</td><td class="r">${r.diasMora||0}</td><td>${esc(r.estado)}</td><td class="r">${r.cuotasPendientes||1}</td><td class="r">${_fmtMontoBs(r.montoAdeudadoBS)}</td><td>${recientes.has(r.terreno)?'<span class="dir-chip w" title="Tiene un cobro Vigente en los últimos 60 días: puede estar al día">¿ya pagó?</span>':''}</td></tr>`).join('');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Se suman <b>solo los lotes en mora</b> (los lotes "Vigente" no entran). El monto es la suma de las cuotas pendientes del lote según Orange. Si un lote figura aquí pero ya pagó, aparece marcado "¿ya pagó?".</div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Terreno</th><th>Cliente</th><th>Asesor</th><th class="r">Días mora</th><th>Tramo</th><th class="r">Cuotas pend.</th><th class="r">Adeudado</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="8" style="text-align:center;padding:24px">Sin lotes.</td></tr>'}</tbody></table></div>`;
}

/* ═══ Control de calidad de datos ═══ */
function _dirControlCalidad(g) {
  const out = [], now = Date.now();
  const cobros = orangeCarteraDetalleRaw.filter(r => r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === g);
  const add = (nivel, titulo, detalle, ver) => out.push({ nivel, titulo, detalle, ver });
  const dolar = v => _dirUsd(v);

  // — Cartera —
  const pagados = new Set(cobros.filter(r=>r.tipoPago!=='Seña').map(r => r.terreno+'|'+r.fecha+'|'+Math.round(r.monto)));
  const senasDup = cobros.filter(r => r.tipoPago==='Seña' && pagados.has(r.terreno+'|'+r.fecha+'|'+Math.round(r.monto)));
  senasDup.length ? add('warn', 'Posible doble conteo de señas', `${senasDup.length} seña(s) por ${dolar(senasDup.reduce((s,r)=>s+r.monto,0))} coinciden en terreno, fecha y monto con un cobro de terreno/acción. Si Orange ya incluye la seña en el plan de cuotas, se está sumando dos veces. Terrenos: ${[...new Set(senasDup.map(r=>r.terreno))].slice(0,8).join(', ')}.`)
                  : add('ok', 'Señas', 'Ninguna seña coincide con un cobro de terreno/acción: sin doble conteo.');
  const rep = {}; cobros.forEach(r => (rep[r.key] ||= []).push(r));
  const repetidos = Object.values(rep).filter(l => l.length > 1);
  repetidos.length ? add('warn', 'Cobros con la misma clave repetida', `${repetidos.length} clave(s) aparecen más de una vez (mismo terreno, tipo, fecha y monto): ${dolar(repetidos.reduce((s,l)=>s+l.slice(1).reduce((x,r)=>x+r.monto,0),0))} podrían estar duplicados. Pueden ser dos pagos reales iguales el mismo día o una fila repetida de Orange. Además se categorizan juntos, porque comparten clave.`)
                   : add('ok', 'Cobros repetidos', 'No hay cobros con clave repetida.');
  const desconocidos = cobros.filter(r => r.tipoPago!=='Seña' && _terrenoGestionVentaMap[r.terreno] === undefined);
  desconocidos.length ? add('warn', 'Cobros de terrenos sin fecha de venta', `${desconocidos.length} cobro(s) por ${dolar(desconocidos.reduce((s,r)=>s+r.monto,0))} son de terrenos que no aparecen en las ventas de Orange: se clasifican como "Cartera" por defecto, aunque podrían ser venta nueva.`)
                      : add('ok', 'Clasificación venta nueva / cartera', 'Todos los terrenos cobrados tienen fecha de venta conocida.');
  const sinCat = cobros.filter(r => !carteraCategoriasData[r.key]);
  sinCat.length ? add('info', 'Cartera sin categorizar', `${sinCat.length} cobro(s) por ${dolar(sinCat.reduce((s,r)=>s+r.monto,0))} sin categoría (cartera se categoriza a mano). No afecta el total, sí la sección “Estado por categoría”.`)
                : add('ok', 'Categorización de cartera', 'Todos los cobros están categorizados.');
  const futuros = cobros.filter(r => r.fechaOrden > now + 864e5);
  futuros.length ? add('warn', 'Cobros con fecha futura', `${futuros.length} cobro(s) con fecha posterior a hoy (${dolar(futuros.reduce((s,r)=>s+r.monto,0))}).`) : add('ok', 'Fechas de cobro', 'Ningún cobro tiene fecha futura.');

  // — Ventas —
  const an = _dirVentasAnalisis(g), cuentan = an.filter(v=>v._contar);
  const dups = an.filter(v=>v._razon.startsWith('Duplicada')), caidas = an.filter(v=>v._razon==='Caída'), excl = an.filter(v=>v._razon==='Excluida manualmente');
  dups.length ? add('warn', 'Ventas duplicadas detectadas', `${dups.length} registro(s) repiten un terreno ya vendido en la gestión (típico al mezclar Excel + Orange). No se cuentan; revisa y fuerza “Sí, contar” si alguno es válido.`, "abrirDetalleVentasDir('todas')") : add('ok', 'Ventas duplicadas', 'No hay terrenos repetidos entre las ventas de la gestión.');
  add(caidas.length?'info':'ok', 'Ventas caídas', caidas.length ? `${caidas.length} registro(s) en estado Caída: no cuentan como venta.` : 'Sin ventas caídas en la gestión.', caidas.length ? "abrirDetalleVentasDir('todas')" : '');
  if (excl.length) add('info', 'Ventas excluidas manualmente', `${excl.length} venta(s) marcadas “No contar”.`, "abrirDetalleVentasDir('todas')");
  const reservasInc = cuentan.filter(v=>v._reserva);
  if (reservasInc.length) add('info', 'Reservas contadas como venta', `${reservasInc.length} reserva(s) por ${dolar(reservasInc.reduce((s,v)=>s+(v.precioVenta||0),0))} incluidas por decisión tuya (aún sin contrato firmado).`, 'abrirReservasDir()');
  const gOrDif = cuentan.filter(v => !v._reserva && _terrenoGestionVentaMap[v.terreno] !== undefined && _terrenoGestionVentaMap[v.terreno] !== g);
  gOrDif.length ? add('warn', 'Ventas cuya firma en Orange es de otra gestión', `${gOrDif.length} venta(s) cuentan en esta gestión pero Orange registra su firma en otra (${gOrDif.slice(0,4).map(v=>v.terreno).join(', ')}): sus cobros salen como Cartera. Revisa el mes de la venta o márcalas “No contar”.`, "abrirDetalleVentasDir('todas')") : add('ok', 'Ventas vs gestión de Orange', 'Todas las ventas contadas coinciden con la gestión de firma de Orange.');
  const noFirm = cuentan.filter(v => !v._reserva && !/firmad|vendid/i.test((v.estadoVenta||'')+' '+(v.contrato||'')));
  noFirm.length ? add('warn', 'Ventas que cuentan sin estado “Contrato Firmado”', `${noFirm.length} venta(s) tienen otro estado (${[...new Set(noFirm.map(v=>v.estadoVenta||'vacío'))].slice(0,4).join(', ')}) y hoy se cuentan como vendidas. Verifica si corresponden.`, "abrirDetalleVentasDir('todas')") : add('ok', 'Estado de las ventas', 'Todas las ventas contadas figuran como contrato firmado / vendido.');
  const mesDif = cuentan.filter(v => { if (v._reserva || !v.fechaReserva) return false; const f = new Date(v.fechaReserva+'T00:00:00'); return !isNaN(f) && f.getFullYear()*12+f.getMonth() !== v._idx; });
  mesDif.length ? add('info', 'Mes de venta distinto a la fecha de reserva', `${mesDif.length} venta(s) están en un mes distinto al de su fecha de reserva. Puede ser correcto (firma posterior a la reserva); verifica a qué mes corresponden.`, "abrirDetalleVentasDir('todas')") : add('ok', 'Mes vs fecha de reserva', 'El mes de cada venta coincide con su fecha de reserva.');
  const sinPrecio = cuentan.filter(v => !(v.precioVenta > 0)), sinCanal = cuentan.filter(v => !(v.canal||v.gestion||'').trim());
  if (sinPrecio.length) add('warn', 'Ventas sin precio', `${sinPrecio.length} venta(s) con precio de venta en 0.`, "abrirDetalleVentasDir('todas')");
  if (sinCanal.length) add('info', 'Ventas sin canal', `${sinCanal.length} venta(s) sin canal de origen: aparecen como “Sin dato” en el canal de ventas.`, "abrirDetalleVentasDir('todas')");
  const enOrange = Object.values(_terrenoGestionVentaMap).filter(x => x === g).length;
  if (orangeCarteraDetalleRaw.length) add(Math.abs(enOrange - cuentan.length) > 0 ? 'info' : 'ok', 'Ventas: informe vs Orange', `El informe cuenta ${cuentan.length} venta(s); Orange (GetVentas) registra ${enOrange} terreno(s) con fecha de firma en la gestión. ${enOrange===cuentan.length?'Coinciden.':'La diferencia puede ser por caídas, fechas de firma vs reserva o ventas cargadas a mano. Usa “Conciliar con Excel” para revisarlas una a una.'}`);

  // — Expensas —
  const expG = orangeExpensasDetalleRaw.filter(r => r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === g);
  const sinCuota = expG.filter(r => !r.categoriaAuto && !expensasCategoriasData[r.key]);
  sinCuota.length ? add('warn', 'Expensas sin categoría', `${sinCuota.length} cobro(s) por ${_fmtMontoBs(sinCuota.reduce((s,r)=>s+r.monto,0))} sin mes de cuota: no se pueden clasificar automáticamente.`) : add('ok', 'Categorización de expensas', 'Todas las expensas tienen categoría.');
  const kExp = {}; expG.forEach(r => (kExp[r.key] ||= []).push(r));
  const repExp = Object.values(kExp).filter(l=>l.length>1);
  repExp.length ? add('warn', 'Expensas con clave repetida', `${repExp.length} clave(s) repetidas (${_fmtMontoBs(repExp.reduce((s,l)=>s+l.slice(1).reduce((x,r)=>x+r.monto,0),0))} posibles duplicados).`) : add('ok', 'Expensas repetidas', 'Sin cobros de expensas con clave repetida.');
  const vigMora = orangeMoraData.filter(r=>r.estado==='Vigente').length;
  const moraSum = orangeMoraData.filter(r=>String(r.estado||'').startsWith('Mora')).reduce((s,r)=>s+(r.montoAdeudadoBS||0),0), recExp = expG.reduce((s,r)=>s+r.monto,0);
  add(moraSum > recExp ? 'warn' : 'info', 'Mora de expensas de Orange: no se usa en el informe', `La sincronización de mora suma ${_fmtMontoBs(moraSum)} “adeudado” en ${orangeMoraData.length - vigMora} lotes, frente a ${_fmtMontoBs(recExp)} recaudados en la gestión. Ese monto se arma sumando la columna de cobranza de Orange (lo ya pagado), por eso puede estar inflado. El informe usa Pagado (automático) + Pendiente (corte cargado a mano).`);
  if (!(dirCorte.expensas && dirCorte.expensas.pendiente !== undefined)) add('warn', 'Falta el pendiente de expensas', 'La cartera de expensas muestra solo lo pagado hasta que cargues el pendiente por cobrar.', 'abrirCorteExpensasDir()');
  if (!dirCorte.cartera) add('warn', 'Falta el corte de cartera actual', 'La sección Cartera actual (cuentas por cobrar y mora) está vacía hasta que cargues el corte.', 'abrirCorteCarteraDir()');
  const recientes = new Set(); orangeExpensasDetalleRaw.forEach(r => { if (_dirNormCatExp(r)==='Vigente' && r.fechaOrden && (now-r.fechaOrden) < 60*864e5) recientes.add(r.terreno); });
  const posiblesPagados = orangeMoraData.filter(r => String(r.estado||'').startsWith('Mora') && recientes.has(r.terreno));
  posiblesPagados.length ? add('warn', 'Mora posiblemente desactualizada', `${posiblesPagados.length} lote(s) en mora (${_fmtMontoBs(posiblesPagados.reduce((s,r)=>s+(r.montoAdeudadoBS||0),0))}) tienen un pago Vigente en los últimos 60 días: la deuda podría estar sobrestimada.`, "abrirDetalleMoraDir('todas')") : add('ok', 'Mora vs pagos recientes', 'Ningún lote en mora tiene pagos Vigentes recientes.');
  return out;
}
function _dirSeccionCalidad(g) {
  const items = _dirControlCalidad(g);
  const warn = items.filter(i=>i.nivel==='warn').length, info = items.filter(i=>i.nivel==='info').length;
  const ico = { ok:'✅', warn:'⚠️', info:'ℹ️' };
  const html = items.sort((a,b)=>({warn:0,info:1,ok:2}[a.nivel]-{warn:0,info:1,ok:2}[b.nivel])).map(i => `<div class="dir-qa ${i.nivel}"><span class="dir-qa-i">${ico[i.nivel]}</span><div><b>${i.titulo}</b><p>${i.detalle}</p></div>${i.ver?`<button class="dir-mini-btn" onclick="${i.ver}">Revisar ›</button>`:''}</div>`).join('');
  return `<section class="dir-card dir-annex dir-noprint" id="dir-qa"><header class="dir-card-h"><span class="dir-num">QA</span><div><h3>Control de calidad de los datos</h3><p>${warn} alerta(s) · ${info} aviso(s) · revisa esto antes de presentar el informe</p></div></header><div class="dir-qa-l">${html}</div>
    <div style="margin-top:12px"><button class="dir-btn-s pri" onclick="document.getElementById('dir-excel-input').click()">📂 Conciliar ventas con mi Excel (Base de Ventas)</button></div></section>`;
}

/* ═══ Conciliación de ventas contra el Excel "Base de Ventas" ═══ */
let _dirExcel = null; // { nombre, filas:[...] }
const _dirNormTerr = t => String(t||'').trim().toLowerCase().replace(/\s+/g,'');
function _dirMesNombre(m) { m = String(m||'').trim(); return m ? m.charAt(0).toUpperCase()+m.slice(1).toLowerCase() : ''; }
async function dirCargarExcel(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates:true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:'' });
    const filas = rows.slice(1).filter(r => r && r[4] && r[5]).map(r => {
      const mes = _dirMesNombre(r[2]), anio = Number(r[0])||0, mesN = MESES_NUM[mes];
      const estado = String(r[11]||'') + ' ' + String(r[25]||'');
      return { cliente:String(r[4]), terreno:String(r[5]).trim(), mes, anio, ref: (mesN&&anio) ? { g: mesN>=4?anio:anio-1, idx: anio*12+(mesN-1) } : null,
        vendida: !/ca[ií]d/i.test(estado), estado:String(r[11]||'').trim(), precio:Number(r[20])||0, r };
    });
    _dirExcel = { nombre:file.name, filas };
    input.value = '';
    _dirDrill = { tipo:'excel' }; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open');
  } catch(e) { toastErr('No se pudo leer el Excel: ' + e.message); }
}
function _dirConciliar(g) {
  const ex = _dirExcel.filas, an = _dirVentasAnalisis(g);
  const exVend = ex.filter(e => e.ref && e.ref.g===g && e.vendida);
  const todas = ventasConcretadasData.filter(v => v.estadoAutorizacion==='aprobado');
  const porKey = {}; an.forEach(v => porKey[v._key] = v);
  const res = { soloExcel:[], mesDistinto:[], noCuenta:[], soloSistema:[], ok:0, exVend };
  exVend.forEach(e => {
    const cands = todas.filter(v => _dirNormTerr(v.terreno) === _dirNormTerr(e.terreno));
    if (!cands.length) { res.soloExcel.push(e); return; }
    const c = cands.find(v => porKey[v._key]?._contar) || cands[0];
    const ref = _dirGestionVenta(c);
    if (!ref || ref.idx !== e.ref.idx) { res.mesDistinto.push({ e, c, ref }); return; }
    if (porKey[c._key] && !porKey[c._key]._contar) { res.noCuenta.push({ e, c: porKey[c._key] }); return; }
    res.ok++;
  });
  const terrEx = new Set(exVend.map(e => _dirNormTerr(e.terreno)));
  an.filter(v => v._contar).forEach(v => { if (!terrEx.has(_dirNormTerr(v.terreno))) res.soloSistema.push({ v, caidaEnExcel: ex.some(e => !e.vendida && _dirNormTerr(e.terreno)===_dirNormTerr(v.terreno)) }); });
  return res;
}
function _dirRenderExcel() {
  const g = dirGestion ?? _gestionActual(), meses = _dirMesesGestion(g), idx0 = meses[0].anio*12 + meses[0].mes;
  const r = _dirConciliar(g);
  const cuenta = _dirVentas(g);
  setText('dir-modal-titulo', '📂 Conciliación con Excel · Gestión ' + g + '-' + String(g+1).slice(2));
  setText('dir-modal-sub', _dirExcel.nombre + ' · Excel: ' + r.exVend.length + ' vendidas en la gestión · Sistema: ' + cuenta.length + ' que cuentan');
  const porMesE = Array(12).fill(0), porMesS = Array(12).fill(0);
  r.exVend.forEach(e => { const i = e.ref.idx-idx0; if (i>=0&&i<12) porMesE[i]++; });
  cuenta.forEach(v => { const i = v._idx-idx0; if (i>=0&&i<12) porMesS[i]++; });
  const filasMes = meses.map((m,i) => ({ c:[m.label, porMesE[i], porMesS[i], porMesE[i]===porMesS[i] ? '<span class="dir-chip ok">=</span>' : `<span class="dir-chip d">${porMesS[i]-porMesE[i]>0?'+':''}${porMesS[i]-porMesE[i]}</span>`] }));
  filasMes.push({ tot:true, c:['Total', r.exVend.length, cuenta.length, r.exVend.length===cuenta.length?'<span class="dir-chip ok">=</span>':`<span class="dir-chip d">${cuenta.length-r.exVend.length}</span>`] });
  const btn = (txt, js, pri) => `<button class="dir-mini-btn ${pri?'pri':''}" onclick="${js}">${txt}</button>`;
  const T = (cols, filas, vacio) => filas.length ? `<div class="dir-tw"><table class="dir-t"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>` : `<div class="dir-note" style="margin:0">${vacio}</div>`;
  const mesTxt = (m,a) => esc((m||'—')+' '+(a||''));
  const bloque = (titulo, ayuda, cuerpo) => `<div class="dir-sub-h" style="margin:18px 0 4px">${titulo}</div><p style="font-size:12.5px;color:var(--ink-500);margin:0 0 8px">${ayuda}</p>${cuerpo}`;
  const body = `<div class="dir-g2" style="grid-template-columns:260px 1fr;gap:22px"><div>${_dirTabla(['Mes','Excel','Sistema','Dif.'],filasMes)}<div class="dir-note">✅ Coinciden exactamente: <b>${r.ok}</b> venta(s)</div></div><div>
    ${bloque('📅 Mes distinto ('+r.mesDistinto.length+')','Está en el sistema pero en otro mes que en el Excel.',T(['Cliente','Terreno','Excel','Sistema',''], r.mesDistinto.map((x,i)=>`<tr><td><b>${esc(x.e.cliente)}</b></td><td>${esc(x.e.terreno)}</td><td>${mesTxt(x.e.mes,x.e.anio)}</td><td>${mesTxt(x.c.mes,x.c.año||x.c.anio)}</td><td>${btn('Usar mes del Excel',`_dirExcelAplicarMes(${i})`,true)}</td></tr>`),'Ninguna.'))}
    ${bloque('🚫 Está en el sistema pero no cuenta ('+r.noCuenta.length+')','El Excel la marca vendida; en el sistema figura caída, duplicada o excluida.',T(['Cliente','Terreno','Razón',''], r.noCuenta.map((x,i)=>`<tr><td><b>${esc(x.e.cliente)}</b></td><td>${esc(x.e.terreno)}</td><td>${esc(x.c._razon)}</td><td>${btn('Contar',`_dirExcelContar(${i})`,true)}</td></tr>`),'Ninguna.'))}
    ${bloque('➕ Solo en el Excel ('+r.soloExcel.length+')','Vendidas en el Excel que no existen en el sistema.',T(['Cliente','Terreno','Mes','Precio',''], r.soloExcel.map((e,i)=>`<tr><td><b>${esc(e.cliente)}</b></td><td>${esc(e.terreno)}</td><td>${mesTxt(e.mes,e.anio)}</td><td>${_dirUsd(e.precio)}</td><td>${btn('Cargar al sistema',`_dirExcelCargar(${i})`,true)}</td></tr>`),'Ninguna.'))}
    ${bloque('➖ Solo en el sistema ('+r.soloSistema.length+')','Cuentan en el informe pero el Excel no las tiene como vendidas en esta gestión.',T(['Cliente','Terreno','Mes','Nota',''], r.soloSistema.map((x,i)=>`<tr><td><b>${esc(x.v.cliente||'—')}</b></td><td>${esc(x.v.terreno||'—')}</td><td>${mesTxt(x.v.mes,x.v.año||x.v.anio)}</td><td>${x.caidaEnExcel?'<span class="dir-chip d">En Excel figura caída</span>':'No figura en el Excel'}</td><td>${btn('No contar',`_dirExcelNoContar(${i})`)}</td></tr>`),'Ninguna.'))}
  </div></div>`;
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 6px">Compara por terreno las ventas del Excel (hoja “Base”) contra el sistema. Cada acción queda registrada como corrección con su motivo y actualiza todo el informe.</div>` + body;
}
async function _dirEscribirCorreccion(v, campos, motivo) {
  const etiqueta = { mes:'Mes', año:'Año', estadoVenta:'Estado', contarInforme:'Cuenta en informe', tcReal:'TC real', minuta:'Minuta' };
  const cambios = Object.keys(campos).filter(k => etiqueta[k] && String(v[k]??(k==='contarInforme'?'auto':'')) !== String(campos[k])).map(k => etiqueta[k]+': '+(v[k]??'—')+' → '+campos[k]);
  const por = asesorActual?.nombre || 'Gerencia';
  const hist = (v.historialCorrecciones||[]).concat([{ fecha:new Date().toLocaleString('es-BO'), por, motivo, cambios:cambios.join('; ')||'sin cambios visibles' }]);
  const previos = (v.correccionManual?.campos)||{};
  await window._fbUpdateVentaConcretada(v._key, { ...campos, correccionManual:{ campos:{ ...previos, ...campos }, motivo, por, ts:Date.now() }, historialCorrecciones:hist });
}
async function _dirExcelAplicarMes(i) {
  const g = dirGestion ?? _gestionActual(); const x = _dirConciliar(g).mesDistinto[i]; if (!x) return;
  const mesIdx = PC_MESES.indexOf(x.e.mes); if (mesIdx<0) { toastErr('Mes inválido en el Excel.'); return; }
  const trim = ['1er','1er','1er','2do','2do','2do','3er','3er','3er','4to','4to','4to'][mesIdx]+' Trimestre';
  await _dirEscribirCorreccion(x.c, { mes:x.e.mes, año:x.e.anio, anio:x.e.anio, trimestre:trim, estadoVenta: x.e.estado || x.c.estadoVenta }, 'Según Excel Base de Ventas ('+_dirExcel.nombre+')');
  toastOk('Mes corregido según el Excel.');
}
async function _dirExcelContar(i) {
  const g = dirGestion ?? _gestionActual(); const x = _dirConciliar(g).noCuenta[i]; if (!x) return;
  await _dirEscribirCorreccion(x.c, { contarInforme:'si', estadoVenta: x.e.estado || x.c.estadoVenta }, 'El Excel la marca vendida ('+_dirExcel.nombre+')');
  toastOk('Venta incluida en el informe.');
}
async function _dirExcelNoContar(i) {
  const g = dirGestion ?? _gestionActual(); const x = _dirConciliar(g).soloSistema[i]; if (!x) return;
  await _dirEscribirCorreccion(x.v, { contarInforme:'no' }, x.caidaEnExcel ? 'En el Excel figura caída ('+_dirExcel.nombre+')' : 'No figura como vendida en el Excel ('+_dirExcel.nombre+')');
  toastOk('Venta excluida del informe.');
}
async function _dirExcelCargar(i) {
  const g = dirGestion ?? _gestionActual(); const e = _dirConciliar(g).soloExcel[i]; if (!e) return;
  const r = e.r, fecha = (r[23] instanceof Date) ? r[23].toISOString().split('T')[0] : '';
  const mesIdx = PC_MESES.indexOf(e.mes);
  try {
    await window._fbPushVentaConcretada({
      registroKey:'', año:e.anio, anio:e.anio, mes:e.mes, trimestre:String(r[28]||['1er','1er','1er','2do','2do','2do','3er','3er','3er','4to','4to','4to'][mesIdx]+' Trimestre'),
      cliente:e.cliente, terreno:e.terreno, modulo:String(r[6]||''), gestion:String(r[7]||''), asesorNombre:String(r[10]||''),
      estadoVenta:String(r[11]||'Contrato Firmado'), estatus:String(r[12]||''), contrato:String(r[27]||''), modalidad:String(r[9]||''),
      precioLista:Number(r[13])||0, pctDsctoPolitica:Number(r[14])||0, dsctoPolitica:Number(r[15])||0, dsctoAdicional:Number(r[16])||0,
      descuentoUsd:Number(r[17])||0, descuentoPct:Math.round((Number(r[18])||0)*1000)/10, excedente:Number(r[19])||0,
      precioVenta:e.precio, metraje:Number(r[21])||0, m2Usd:Number(r[22])||0, fechaReserva:fecha, accion:Number(r[24])||0,
      categoria:String(r[29]||''), ciudadOrigen:String(r[30]||''), canal:String(r[26]||r[7]||''),
      esHistorico:true, estadoAutorizacion:'aprobado', solicitadoPorKey:'conciliacion-excel', solicitadoPorNombre:'Cargada desde conciliación con Excel',
    });
    toastOk('Venta cargada al sistema.');
  } catch(err) { toastErr('No se pudo cargar: ' + err.message); }
}

/* ═══════════ RESERVAS: tú decides cuáles contar como venta ═══════════ */
const _dirSan = x => String(x).replace(/[.#$\[\]\/\s]/g,'-');
function abrirReservasDir() { _dirDrill = { tipo:'reservas' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirReservasPool(g) {
  const vendidas = ventasConcretadasData.filter(v => v.estadoAutorizacion !== 'rechazado' && _esVendida(v));
  const terrConVenta = new Set(vendidas.map(v => _dirNormTerr(v.terreno)).filter(Boolean));
  const regsConVenta = new Set(vendidas.map(v => v.registroKey).filter(Boolean));
  const pool = [], vistos = new Set(); let yaVenta = 0;
  const regs = (typeof todosRegs !== 'undefined' ? todosRegs : []).filter(r => r.conclusion === 'Reserva' || r.huboCierre === 'SI');
  regs.forEach(r => {
    const f = r.fecha ? new Date(r.fecha+'T00:00:00') : (r.ts ? new Date(r.ts) : null); if (!f || isNaN(f)) return;
    const tn = _dirNormTerr(r.terrenoInteres);
    if (regsConVenta.has(r._key) || (tn && terrConVenta.has(tn))) { if (_dirGestionDeFecha(f) === g) yaVenta++; return; }
    if (tn) vistos.add(tn);
    pool.push({ key:'reg-'+r._key, origen:'Registro', cliente:r.nombre||'', terreno:r.terrenoInteres||'', asesor:r.asesorNombre||'', canal:r.origen||'', modalidad:r.formaPago||'', estado:'Reserva'+(r.esExterno?' (externa)':''), f, precio:r.precioVenta||r.precio||0 });
  });
  (orangeReservasRaw||[]).forEach(r => {
    if (!r.Terreno) return;
    const f = _parseFechaOrange(r.FechaPago) || _parseFechaOrange(r.FechaReserva); if (!f) return;
    const tn = _dirNormTerr(r.Terreno);
    if (terrConVenta.has(tn)) { if (_dirGestionDeFecha(f) === g) yaVenta++; return; }
    if (vistos.has(tn)) return;
    const reg = regs.find(x => _dirNormTerr(x.terrenoInteres) === tn);
    pool.push({ key:'ora-'+_dirSan(r.Terreno+'_'+(r.FechaPago||'')), origen:'Orange', cliente:r.Cliente||'', terreno:r.Terreno, asesor:r.AsesorComercial||'', canal:reg?.origen||'', modalidad:reg?.formaPago||'', estado:r.Estado||'—', f, precio:reg?.precioVenta||0 });
  });
  return { pool: pool.filter(x => _dirGestionDeFecha(x.f) === g || dirReservasIncl[x.key]), yaVenta };
}
function _dirGestionDeFecha(f) { return _gestionDeFecha(f); }
function _dirRenderReservas() {
  const g = dirGestion ?? _gestionActual();
  const { pool, yaVenta } = _dirReservasPool(g);
  // las ya incluidas que ya no están en la lista (por ejemplo, el registro cambió) se muestran igual
  Object.entries(dirReservasIncl).forEach(([k,r]) => { if (!pool.some(x => x.key===k)) { const mesN = MESES_NUM[r.mes]; pool.push({ key:k, origen:r.origen||'—', cliente:r.cliente, terreno:r.terreno, asesor:r.asesor, canal:r.canal, modalidad:r.modalidad, estado:'(guardada)', f:new Date(parseInt(r.anio)||2000,(mesN||1)-1,1), precio:r.precio }); } });
  _dirResPool = pool.sort((a,b)=>b.f-a.f);
  const incl = _dirResPool.filter(x => dirReservasIncl[x.key]);
  setText('dir-modal-titulo', '➕ Reservas · tú decides cuáles contar como venta');
  setText('dir-modal-sub', _dirResPool.length + ' reserva(s) sin venta registrada · ' + incl.length + ' contada(s) como venta · ' + _dirUsd(incl.reduce((s,x)=>s+(Number(dirReservasIncl[x.key].precio)||0),0)));
  const opM = m => PC_MESES.map(x=>`<option ${x===m?'selected':''}>${x}</option>`).join('');
  const filas = _dirResPool.map((x,i) => {
    const r = dirReservasIncl[x.key], on = !!r;
    const mes = r?.mes || PC_MESES[x.f.getMonth()], anio = r?.anio || x.f.getFullYear();
    return `<tr class="${on?'':'dir-off'}"><td><input type="checkbox" id="dres-c-${i}" ${on?'checked':''} onchange="_dirReservaGuardar(${i})" title="Contar como venta"></td>
      <td><span class="dir-chip n">${x.origen}</span></td><td><b>${esc(x.cliente||'—')}</b></td><td>${esc(x.terreno||'—')}</td><td>${esc(x.asesor||'—')}</td><td>${x.f.toLocaleDateString('es-BO')}</td><td>${esc(x.estado)}</td>
      <td><select id="dres-m-${i}" onchange="_dirReservaGuardar(${i},true)">${opM(mes)}</select></td>
      <td><input id="dres-a-${i}" type="number" value="${anio}" style="width:74px" onchange="_dirReservaGuardar(${i},true)"></td>
      <td><input id="dres-p-${i}" type="number" value="${Number(r?.precio ?? x.precio)||0}" style="width:110px" onchange="_dirReservaGuardar(${i},true)"></td>
      <td><input id="dres-k-${i}" value="${esc(r?.canal ?? x.canal)}" style="width:110px" onchange="_dirReservaGuardar(${i},true)"></td></tr>`;
  }).join('');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Aquí aparecen las <b>reservas que todavía no tienen una venta registrada</b> (de tus registros y de Orange). Marca ✔ las que quieres que el informe cuente como venta; elige el mes, el precio y el canal. Se guarda al instante y actualiza todo el informe. Si luego la reserva se convierte en venta firmada, desaparece de esta lista sola y deja de duplicarse. ${yaVenta?`<br><span style="color:var(--ink-500)">${yaVenta} reserva(s) de esta gestión ya son venta y no se muestran.</span>`:''}</div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Contar</th><th>Origen</th><th>Cliente</th><th>Terreno</th><th>Asesor</th><th>Fecha</th><th>Estado</th><th>Mes</th><th>Año</th><th>Precio US$</th><th>Canal</th></tr></thead><tbody>${filas || '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--ink-500)">No hay reservas sin venta en esta gestión.</td></tr>'}</tbody></table></div>`;
}
async function _dirReservaGuardar(i, soloSiIncluida) {
  const x = _dirResPool[i]; if (!x) return;
  const on = document.getElementById('dres-c-'+i).checked;
  if (soloSiIncluida && !on) return;
  try {
    if (!on) { await window._fbRemoveDirReserva(x.key); return; }
    await window._fbSetDirReserva(x.key, { origen:x.origen, cliente:x.cliente, terreno:x.terreno, asesor:x.asesor, modalidad:x.modalidad||'',
      canal:document.getElementById('dres-k-'+i).value.trim(), mes:document.getElementById('dres-m-'+i).value, anio:parseInt(document.getElementById('dres-a-'+i).value)||x.f.getFullYear(),
      precio:parseFloat(document.getElementById('dres-p-'+i).value)||0 });
  } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirReservaQuitar(key) { try { await window._fbRemoveDirReserva(key); toastOk('Reserva quitada de las ventas del informe.'); } catch(e) { toastErr(e.message); } }

/* ═══════════ EMBUDO: real + ideal, todo sobre leads ═══════════ */
const DIR_EMB_ETQ = ['Leads','Visitas agendadas','Visitas concretadas','Cierres (reservas)','Ventas concretadas'];
const DIR_EMB_K = ['l','a','c','ci','v'];
function dirEmbudoSel(x) { _dirEmbudoSel = x; _dirPintarEmbudo(); }
const _dirPL = (n, l) => l ? ((n/l*100) < 10 && n ? (n/l*100).toFixed(1) : Math.round(n/l*100)) + '%' : '—';
function _dirIdealSel(C, sel) {
  const id = C.ideal || {};
  const arr = o => o ? DIR_EMB_K.map(k => (o[k] !== undefined && o[k] !== null && o[k] !== '') ? Number(o[k]) : null) : null;
  if (sel === 'g') {
    if (id.gen) { const a = arr(id.gen); if (a.some(x => x !== null)) return a; }
    const ms = Object.keys(id).filter(k => /^m\d+$/.test(k));
    if (!ms.length) return null;
    const r = DIR_EMB_K.map(k => { let s = 0, any = false; ms.forEach(m => { const v = id[m] && id[m][k]; if (v !== undefined && v !== null && v !== '') { s += Number(v); any = true; } }); return any ? s : null; });
    return r.some(x => x !== null) ? r : null;
  }
  const a = arr(id['m'+sel]); return a && a.some(x => x !== null) ? a : null;
}
function _dirPintarEmbudo() {
  const box = document.getElementById('dir-embudo-body'), C = _dirEmbudoCache; if (!box || !C) return;
  const rows = C.rows;
  const total = [0,1,2,3].map(j => rows.reduce((s,r)=>s+r.val[j],0)).concat([rows.reduce((s,r)=>s+r.ventas,0)]);
  const sel = _dirEmbudoSel === 'g' ? total : (rows[_dirEmbudoSel] ? rows[_dirEmbudoSel].val.concat([rows[_dirEmbudoSel].ventas]) : total);
  const ideal = _dirIdealSel(C, rows[_dirEmbudoSel] || _dirEmbudoSel === 'g' ? _dirEmbudoSel : 'g');
  const maxF = Math.max(...sel, ...((ideal||[]).map(x => x||0)), 1);
  const colores = [DIR_COL.azul, DIR_COL.ambar, DIR_COL.cian, DIR_COL.violeta, DIR_COL.verde];
  const etq = _dirEmbudoSel === 'g' ? 'Toda la gestión' : rows[_dirEmbudoSel]?.label;
  const tabs = `<div class="dir-tabs"><button class="${_dirEmbudoSel==='g'?'on':''}" onclick="dirEmbudoSel('g')">General</button>${rows.map((r,i)=>`<button class="${_dirEmbudoSel===i?'on':''}" onclick="dirEmbudoSel(${i})">${r.label.split(' ')[0]}</button>`).join('')}</div>`;
  const funnel = arr => `<div class="dir-funnel"><div class="dir-fr dir-fh"><div class="dir-fl"></div><div class="dir-fbw" style="background:none"></div><div class="dir-fp">% de leads</div></div>${arr.map((n,i)=>`<div class="dir-fr"><div class="dir-fl">${DIR_EMB_ETQ[i]}</div><div class="dir-fbw"><div class="dir-fb" style="width:${n===null?0:Math.max(n/maxF*100,6)}%;background:${colores[i]}"><b>${n===null?'—':n.toLocaleString('es-BO')}</b></div></div><div class="dir-fp">${i===0 ? (n===null?'—':'100%') : (n===null||arr[0]===null ? '—' : _dirPL(n, arr[0]))}</div></div>`).join('')}</div>`;
  const vacioIdeal = `<div class="dir-vacio" style="padding:18px"><b>Sin embudo ideal para ${etq}.</b><p>Escribe cuántos leads, visitas, cierres y ventas deberías tener para comparar con lo real.</p><button class="dir-btn-s pri" onclick="abrirEditorEmbudoDir('ideal')">✎ Definir embudo ideal</button></div>`;
  const filasCmp = DIR_EMB_ETQ.map((e,i) => {
    const r = sel[i], id = ideal ? ideal[i] : null;
    const vs = (id && id > 0) ? Math.round(r/id*100) : null;
    return { c:[e, r.toLocaleString('es-BO'), i===0 ? '100%' : _dirPL(r, sel[0]), id === null || id === undefined ? '—' : id.toLocaleString('es-BO'), id === null || id === undefined ? '—' : (i===0 ? '100%' : (ideal[0] ? _dirPL(id, ideal[0]) : '—')), vs === null ? '—' : `<span class="dir-chip ${vs>=100?'ok':vs>=80?'w':'d'}">${vs}%</span>`] };
  });
  const cell = (r,j) => { const k = ['l','a','c','ci'][j]; const manual = r.man && r.man[k] !== undefined && r.man[k] !== null && r.man[k] !== ''; return (r.futuro && !manual) ? '—' : r.val[j].toLocaleString('es-BO') + (manual ? ' <span class="dir-mark" title="Cargado a mano">●</span>' : ''); };
  const pc = (r,j) => r.futuro && !(r.man) ? '—' : (j === 4 ? _dirPL(r.ventas, r.val[0]) : _dirPL(r.val[j], r.val[0]));
  const filas = rows.map((r,i) => `<tr class="clk" onclick="dirEmbudoSel(${i})"><td>${r.label}</td><td class="r">${cell(r,0)}</td><td class="r">${cell(r,1)}</td><td class="r dir-pc">${pc(r,1)}</td><td class="r">${cell(r,2)}</td><td class="r dir-pc">${pc(r,2)}</td><td class="r">${cell(r,3)}</td><td class="r dir-pc">${pc(r,3)}</td><td class="r">${r.futuro?'—':r.ventas}</td><td class="r dir-pc">${r.futuro?'—':pc(r,4)}</td></tr>`).join('')
    + `<tr class="tot"><td>Total gestión</td><td class="r">${total[0].toLocaleString('es-BO')}</td><td class="r">${total[1].toLocaleString('es-BO')}</td><td class="r dir-pc">${_dirPL(total[1],total[0])}</td><td class="r">${total[2].toLocaleString('es-BO')}</td><td class="r dir-pc">${_dirPL(total[2],total[0])}</td><td class="r">${total[3].toLocaleString('es-BO')}</td><td class="r dir-pc">${_dirPL(total[3],total[0])}</td><td class="r">${total[4]}</td><td class="r dir-pc">${_dirPL(total[4],total[0])}</td></tr>`;
  box.innerHTML = tabs + `<div class="dir-g2" style="margin:18px 0 18px"><div><div class="dir-sub-h">Real · ${etq}</div>${funnel(sel)}</div><div><div class="dir-sub-h">Ideal · ${etq}</div>${ideal ? funnel(ideal) : vacioIdeal}</div></div>
    ${_dirTabla(['Etapa','Real','% de leads','Ideal','% de leads','Real vs ideal'], filasCmp)}
    <div class="dir-sub-h" style="margin-top:26px">Mes a mes · cada etapa como % de los leads del mes</div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Mes</th><th class="r">Leads</th><th class="r">Agend.</th><th class="r">% leads</th><th class="r">Concr.</th><th class="r">% leads</th><th class="r">Cierres</th><th class="r">% leads</th><th class="r">Ventas</th><th class="r">% leads</th></tr></thead><tbody>${filas}</tbody></table></div>
    <p class="dir-hint">● = cifra cargada a mano (reemplaza a la del sistema). Los cierres se cuentan aunque la venta se haya caído después. Ventas = contratos que cuentan en la sección de ventas.</p>`;
}
function abrirEditorEmbudoDir(kind) { _dirDrill = { tipo:'embudo', kind: kind === 'ideal' ? 'ideal' : 'real' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderEditorEmbudo() {
  const C = _dirEmbudoCache; if (!C) return;
  const ideal = _dirDrill.kind === 'ideal', nc = ideal ? 5 : 4;
  const etq = ideal ? ['Leads','Agendadas','Concretadas','Cierres','Ventas'] : ['Leads','Agendadas','Concretadas','Cierres'];
  setText('dir-modal-titulo', ideal ? '✎ Embudo ideal · cifras objetivo' : '✎ Embudo de ventas · cargar / corregir cifras reales');
  setText('dir-modal-sub', 'Gestión ' + C.g + '-' + String(C.g+1).slice(2) + (ideal ? ' · escribe cómo debería ser el embudo; se compara contra el real' : ' · lo que escribas reemplaza la cifra del sistema; vacío = usa la del sistema'));
  const idv = (k,j) => { const o = C.ideal && C.ideal[k]; const v = o ? o[DIR_EMB_K[j]] : ''; return (v === undefined || v === null) ? '' : v; };
  const inp = (i,j,v,ph) => `<td><input type="number" min="0" id="dem-${i}-${j}" value="${v}" placeholder="${ph}" style="width:96px"></td>`;
  let filas = '';
  if (ideal) {
    filas += `<tr><td><b>General (toda la gestión)</b><div style="font-size:11px;color:var(--ink-500)">vacío = suma de los meses</div></td>${DIR_EMB_K.map((k,j)=>inp('g',j,idv('gen',j),'')).join('')}</tr>`;
    filas += C.rows.map((r,i) => `<tr><td><b>${r.label}</b></td>${DIR_EMB_K.map((k,j)=>inp(i,j,idv('m'+i,j),'')).join('')}</tr>`).join('');
  } else {
    filas = C.rows.map((r,i) => `<tr><td><b>${r.label}</b></td>${[0,1,2,3].map(j => { const k=DIR_EMB_K[j]; const v = r.man && r.man[k] !== undefined && r.man[k] !== null ? r.man[k] : ''; return inp(i,j,v,r.sys[j]); }).join('')}<td style="color:var(--ink-500)">${r.sys.join(' · ')}</td></tr>`).join('');
  }
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">${ideal
    ? 'Define el embudo <b>ideal</b>: Leads, Visitas agendadas, Visitas concretadas, Cierres y Ventas por mes (y opcionalmente el general). Puedes escribir celda por celda o <b>pegar desde Excel</b> (12 filas de abril a marzo, 5 columnas). El informe lo muestra al lado del real y calcula el % de cumplimiento.'
    : 'Carga aquí lo que tienes en tu Power BI: <b>Leads, Visitas agendadas, Visitas concretadas y Cierres</b> de cada mes (los cierres cuentan aunque se hayan caído). Puedes escribir celda por celda o <b>pegar desde Excel</b> (12 filas de abril a marzo, 4 columnas). Los espacios vacíos usan la cifra del sistema.'}</div>
    <div class="dir-g2" style="grid-template-columns:1fr 280px;gap:22px;align-items:start"><div class="dir-tw"><table class="dir-t"><thead><tr><th>Mes</th>${etq.map(e=>`<th>${e}</th>`).join('')}${ideal?'':'<th>Sistema (L·A·C·Ci)</th>'}</tr></thead><tbody>${filas}</tbody></table></div>
    <div><div class="dir-sub-h">Pegar desde Excel / Power BI</div><textarea id="dem-paste" rows="9" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;font-family:inherit;font-size:12.5px" placeholder="Abr&#9;120&#9;80&#9;60&#9;12${ideal?'&#9;8':''}&#10;May&#9;130&#9;90&#9;70&#9;15${ideal?'&#9;10':''}&#10;…"></textarea>
    <button class="dir-btn-s" style="margin-top:8px" onclick="_dirEmbudoAplicarPegado()">Aplicar pegado</button></div></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirEmbudoGuardar()">💾 Guardar cifras</button><button class="dir-btn-s" onclick="_dirEmbudoLimpiar()">${ideal?'Borrar el embudo ideal':'Borrar mis cargas (volver al sistema)'}</button></div>`;
}
function _dirEmbudoAplicarPegado() {
  const nc = _dirDrill.kind === 'ideal' ? 5 : 4;
  const lineas = document.getElementById('dem-paste').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  lineas.slice(0,12).forEach((l,i) => {
    let t = l.split(/\t|;|\s{2,}|,(?=\s*\d)/).map(x=>x.trim()).filter(x=>x!=='');
    if (t.length && isNaN(parseFloat(t[0].replace(/[.\s]/g,'')))) t = t.slice(1);
    if (t.length === 1 && /\s/.test(t[0])) t = t[0].split(/\s+/);
    t.slice(0,nc).forEach((x,j) => { const n = parseFloat(String(x).replace(/\./g,'').replace(',','.')); const el = document.getElementById(`dem-${i}-${j}`); if (el && !isNaN(n)) el.value = n; });
  });
  toastOk('Pegado aplicado: revisa los números y guarda.');
}
async function _dirEmbudoGuardar() {
  const C = _dirEmbudoCache; if (!C) return; const obj = {}; const ideal = _dirDrill.kind === 'ideal', nc = ideal ? 5 : 4;
  const leer = i => { const m = {}; DIR_EMB_K.slice(0,nc).forEach((k,j) => { const el = document.getElementById(`dem-${i}-${j}`); const v = el ? el.value : ''; if (v !== '' && !isNaN(Number(v))) m[k] = Number(v); }); return m; };
  C.rows.forEach((r,i) => { const m = leer(i); if (Object.keys(m).length) obj['m'+i] = m; });
  if (ideal) { const gm = leer('g'); if (Object.keys(gm).length) obj.gen = gm; }
  try {
    const dato = Object.keys(obj).length ? obj : null;
    if (ideal) await window._fbSetDirEmbudoIdeal(C.g, dato); else await window._fbSetDirEmbudo(C.g, dato);
    toastOk(ideal ? 'Embudo ideal guardado.' : 'Embudo guardado: el informe se actualizó.'); cerrarModalDirectorio();
  } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirEmbudoLimpiar() {
  const C = _dirEmbudoCache; if (!C) return; const ideal = _dirDrill.kind === 'ideal';
  if (!await confirmDialog(ideal ? 'Se borra el embudo ideal de esta gestión.' : 'Se borran las cifras que cargaste a mano de esta gestión y el embudo vuelve a usar solo los datos del sistema.', { title:'Borrar cargas', okText:'Borrar' })) return;
  try { if (ideal) await window._fbSetDirEmbudoIdeal(C.g, null); else await window._fbSetDirEmbudo(C.g, null); toastOk('Listo.'); cerrarModalDirectorio(); } catch(e) { toastErr(e.message); }
}

/* ═══════════ TIPO DE CAMBIO ═══════════ */
function abrirEditorTCDir() { _dirDrill = { tipo:'tc' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderEditorTC() {
  const g = dirGestion ?? _gestionActual(), meses = _dirMesesGestion(g), cob = _dirCobrosG(g);
  setText('dir-modal-titulo', '💱 Dolarizar la cartera · tipo de cambio por mes');
  setText('dir-modal-sub', 'Gestión ' + g + '-' + String(g+1).slice(2) + ' · solo cobranza de cartera de terreno y de acción (la venta nueva no se toca)');
  const oT = Array(12).fill(0), oA = Array(12).fill(0);
  cob.filter(r => !r._nueva).forEach(r => { if (r._mi >= 0 && r._mi < 12) { if (r.tipoPago === 'Acción') oA[r._mi] += r.montoOrig; else oT[r._mi] += r.montoOrig; } });
  _dirTCOrig = { t:oT, a:oA };
  const fila = (m,i) => { const t = _dirTCMesVal(g,i,'t'), a = _dirTCMesVal(g,i,'a');
    return `<tr><td><b>${m.label}</b></td>
      <td><input type="number" step="0.01" min="0" id="dtc-t-${i}" value="${t||''}" placeholder="${DIR_TC_BASE.toFixed(2)}" style="width:90px" oninput="_dirTCPreview(${i})"></td><td class="r">${m.futuro?'—':_dirUsd(oT[i])}</td><td class="r" id="dtc-rt-${i}">${m.futuro?'—':_dirUsd(oT[i]*_dirFactorTC(t))}</td>
      <td><input type="number" step="0.01" min="0" id="dtc-a-${i}" value="${a||''}" placeholder="${DIR_TC_BASE.toFixed(2)}" style="width:90px" oninput="_dirTCPreview(${i})"></td><td class="r">${m.futuro?'—':_dirUsd(oA[i])}</td><td class="r" id="dtc-ra-${i}">${m.futuro?'—':_dirUsd(oA[i]*_dirFactorTC(a))}</td></tr>`; };
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Escribe el <b>tipo de cambio</b> de cada mes para la cobranza de <b>terreno</b> y de <b>acción</b> de cartera (pueden ser distintos). Cada monto se dolariza así: <b>US$ = US$ de Orange × ${DIR_TC_BASE.toFixed(2)} ÷ TC</b>. Mes vacío = sin ajuste. Las ventas nuevas no usan esta tabla: sus montos ya están en dólares reales.</div>
    <div class="dir-g2" style="grid-template-columns:1fr 240px;gap:22px;align-items:start"><div class="dir-tw"><table class="dir-t"><thead><tr><th>Mes</th><th>TC terreno</th><th class="r">Según Orange</th><th class="r">Dolarizado</th><th>TC acción</th><th class="r">Según Orange</th><th class="r">Dolarizado</th></tr></thead><tbody>${meses.map(fila).join('')}</tbody></table></div>
    <div><div class="dir-sub-h">Pegar desde Excel</div><textarea id="dtc-paste" rows="9" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;font-family:inherit;font-size:12.5px" placeholder="12 filas (abril a marzo)&#10;una columna = terreno y acción&#10;dos columnas = terreno&#9;acción"></textarea><button class="dir-btn-s" style="margin-top:8px" onclick="_dirTCPegar()">Aplicar pegado</button>
    <button class="dir-btn-s" style="margin-top:8px" onclick="_dirTCCopiarAcc()">Copiar terreno → acción</button></div></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirTCGuardarMes()">💾 Guardar tipos de cambio</button><button class="dir-btn-s" onclick="_dirTCLimpiarMes()">Quitar todos</button></div>`;
}
let _dirTCOrig = { t:[], a:[] };
function _dirTCPreview(i) {
  ['t','a'].forEach(k => { const v = parseFloat(document.getElementById(`dtc-${k}-${i}`).value); const el = document.getElementById(`dtc-r${k}-${i}`); if (el) el.textContent = _dirUsd((_dirTCOrig[k][i]||0) * _dirFactorTC(v)); });
}
function _dirTCCopiarAcc() { for (let i = 0; i < 12; i++) { document.getElementById('dtc-a-'+i).value = document.getElementById('dtc-t-'+i).value; _dirTCPreview(i); } }
function _dirTCPegar() {
  const num = x => parseFloat(String(x).replace(',','.').replace(/[^\d.]/g,''));
  document.getElementById('dtc-paste').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,12).forEach((l,i) => {
    const p = l.split(/\t|;|\s{2,}/).map(x=>x.trim()).filter(Boolean); const t = num(p[0]), a = p.length > 1 ? num(p[1]) : t;
    const et = document.getElementById('dtc-t-'+i), ea = document.getElementById('dtc-a-'+i);
    if (et && !isNaN(t)) et.value = t; if (ea && !isNaN(a)) ea.value = a; _dirTCPreview(i);
  });
  toastOk('Pegado aplicado: revisa y guarda.');
}
async function _dirTCGuardarMes() {
  const g = dirGestion ?? _gestionActual(), obj = {};
  for (let i = 0; i < 12; i++) {
    const o = {};
    for (const k of ['t','a']) { const v = parseFloat(document.getElementById(`dtc-${k}-${i}`).value); if (v > 0) { if (v < 5 || v > 30) { toastErr('TC fuera de rango en ' + _dirMesesGestion(g)[i].label + ' (ej.: 6.96 a 12).'); return; } o[k] = v; } }
    if (Object.keys(o).length) obj['m'+i] = o;
  }
  try { await window._fbSetDirTC(g, Object.keys(obj).length ? obj : null); toastOk('Tipos de cambio guardados: la cartera se dolarizó.'); cerrarModalDirectorio(); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirTCLimpiarMes() {
  const g = dirGestion ?? _gestionActual();
  if (!await confirmDialog('Se quitan los tipos de cambio mensuales de esta gestión y la cartera vuelve a ' + DIR_TC_BASE.toFixed(2) + '.', { title:'Quitar tipos de cambio', okText:'Quitar' })) return;
  try { await window._fbSetDirTC(g, null); toastOk('Listo.'); cerrarModalDirectorio(); } catch(e) { toastErr(e.message); }
}
async function _dirTCGuardarVenta(key, val) {
  const tc = parseFloat(String(val).replace(',','.')) || 0;
  if (tc && (tc < 5 || tc > 30)) { toastErr('TC fuera de rango (ej.: 6.96 a 12).'); _dirRenderModal(); return; }
  const v = ventasConcretadasData.find(x => x._key === key); if (!v) return;
  if ((Number(v.tcReal)||0) === tc) return;
  try { await _dirEscribirCorreccion(v, { tcReal:tc }, tc ? 'Tipo de cambio real de la venta: ' + tc : 'Se quitó el tipo de cambio propio'); toastOk('TC de la venta guardado.'); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirTCGuardarReserva(resKey, val) {
  const tc = parseFloat(String(val).replace(',','.')) || 0;
  if (tc && (tc < 5 || tc > 30)) { toastErr('TC fuera de rango (ej.: 6.96 a 12).'); _dirRenderModal(); return; }
  try { await window._fbSetDirReserva(resKey, { ...(dirReservasIncl[resKey]||{}), tc }); toastOk('TC guardado.'); } catch(e) { toastErr(e.message); }
}
async function _dirTCMasivo() {
  const g = dirGestion ?? _gestionActual(), meses = _dirMesesGestion(g), base = meses[0].anio*12 + meses[0].mes;
  const d = parseInt(document.getElementById('dtcm-desde').value), h = parseInt(document.getElementById('dtcm-hasta').value);
  const tc = parseFloat(String(document.getElementById('dtcm-valor').value).replace(',','.')), soloVacias = document.getElementById('dtcm-vacias').checked;
  if (!(tc >= 5 && tc <= 30)) { toastErr('Escribe un TC válido (ej.: 9.5).'); return; }
  if (h < d) { toastErr('El mes "hasta" es anterior al "desde".'); return; }
  const lista = _dirVentasAnalisis(g).filter(v => { const i = v._idx - base; return i >= d && i <= h && (!soloVacias || !(v._tc > 0)); });
  if (!lista.length) { toastErr('No hay ventas en ese rango' + (soloVacias ? ' sin TC' : '') + '.'); return; }
  if (!await confirmDialog('Se aplica el TC ' + tc + ' a ' + lista.length + ' venta(s) de ' + meses[d].label + ' a ' + meses[h].label + '. Cada una queda registrada como corrección.', { title:'Aplicar tipo de cambio', okText:'Aplicar' })) return;
  try {
    await Promise.all(lista.map(v => v._reserva ? window._fbSetDirReserva(v._resKey, { ...(dirReservasIncl[v._resKey]||{}), tc }) : _dirEscribirCorreccion(v, { tcReal:tc }, 'Tipo de cambio real ' + tc + ' (carga por rango de meses)')));
    toastOk('TC aplicado a ' + lista.length + ' venta(s).');
  } catch(e) { toastErr('No se pudo aplicar: ' + e.message); }
}

/* ═══════════ CANALES: agrupar equivalentes ═══════════ */
let _dirAliasTipo = 'canal', _dirAliasKeys = [];
function abrirEditorCanalesDir() { abrirEditorAgrupacionDir('canal'); }
function abrirEditorAgrupacionDir(tipo) { _dirAliasTipo = tipo || 'canal'; _dirDrill = { tipo:'canales' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirAliasMapa(tipo) { return tipo === 'canal' ? dirCanalMap : (dirAlias[tipo] || {}); }
function _dirAliasKeyDe(tipo, raw) { return tipo === 'canal' ? _dirCanalKey(raw) : (_dirSinAcento(raw) || 'sin dato'); }
function _dirAliasAuto(tipo, k, raw) { return tipo === 'canal' ? _dirCanalAuto(k) : (k === 'sin dato' ? 'Sin dato' : _dirTitulo(raw)); }
function _dirRenderEditorCanales() {
  const tipo = _dirAliasTipo, nom = { canal:'canales de llegada', modalidad:'modalidades de pago', asesor:'asesores' }[tipo];
  setText('dir-modal-titulo', '🏷 Agrupar ' + nom);
  setText('dir-modal-sub', 'Une los nombres que son lo mismo para no tener muchas categorías · se aplica a todo el informe');
  const mapa = _dirAliasMapa(tipo), campo = v => tipo === 'canal' ? (v.canal || v.gestion || '') : tipo === 'modalidad' ? (v.modalidad || '') : (v.asesorNombre || '');
  const acc = {};
  const add = raw => { const k = _dirAliasKeyDe(tipo, raw); const o = (acc[k] ||= { k, n:0, raws:{} }); o.n++; const r = (raw||'').trim() || '(vacío)'; o.raws[r] = (o.raws[r]||0)+1; };
  ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado').forEach(v => add(campo(v)));
  Object.values(dirReservasIncl||{}).forEach(r => add(tipo === 'canal' ? (r.canal||'') : tipo === 'modalidad' ? (r.modalidad||'') : (r.asesor||'')));
  const lista = Object.values(acc).sort((a,b) => a.k.localeCompare(b.k));
  _dirAliasKeys = lista.map(x => x.k);
  const mejor = x => Object.entries(x.raws).sort((a,b)=>b[1]-a[1])[0][0];
  const actual = x => mapa[_dirCanalFb(x.k)] || _dirAliasAuto(tipo, x.k, mejor(x) === '(vacío)' ? '' : mejor(x));
  // sugerencias: nombres que empiezan igual (Andre ~ Andrea Aguilera) o uno contiene al otro
  const sugerencia = x => { if (mapa[_dirCanalFb(x.k)] || x.k === 'sin dato') return null;
    const otros = lista.filter(y => y !== x && y.k !== 'sin dato' && (y.k.startsWith(x.k + ' ') || y.k.startsWith(x.k) || x.k.startsWith(y.k + ' ') || (tipo!=='asesor' && y.k.includes(x.k) && x.k.length>3)));
    if (!otros.length) return null; const ref = [x, ...otros].sort((a,b)=>b.k.length-a.k.length)[0]; return ref === x ? null : actual(ref); };
  const grupos = [...new Set(lista.map(actual))];
  const filas = lista.map((x,i) => { const raws = Object.entries(x.raws).sort((a,b)=>b[1]-a[1]).map(([r,n]) => esc(r)+' ('+n+')').join(' · '); const sug = sugerencia(x);
    return `<tr class="${sug?'dir-sug':''}"><td>${raws}</td><td class="r">${x.n}</td><td><input id="dca-${i}" list="dca-list" value="${esc(sug || actual(x))}" ${sug?`data-sug="1"`:''} style="width:230px"></td><td style="color:var(--ink-500)">${mapa[_dirCanalFb(x.k)] ? 'manual' : (sug ? '<b>sugerido</b> ← revisa y guarda' : 'automático')}</td></tr>`; }).join('');
  const tabs = ['canal','modalidad','asesor'].map(t => `<button class="${t===tipo?'on':''}" onclick="abrirEditorAgrupacionDir('${t}')">${{canal:'Canales',modalidad:'Modalidades',asesor:'Asesores'}[t]}</button>`).join('');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-tabs" style="margin-bottom:14px">${tabs}</div>
    <div class="dir-note" style="margin:0 0 12px">Cada fila es un nombre tal como está escrito en las ventas (con cuántas ventas). En <b>Grupo</b> escribe el nombre con el que debe salir en el informe: <b>filas con el mismo grupo se suman en una sola</b>${tipo==='asesor'?' (por ejemplo, “Andre” y “Andrea Aguilera”)':tipo==='canal'?' (por ejemplo, todo lo de Facebook, Instagram o TikTok como “Canal digital”)':''}. Las filas marcadas como <b>sugerido</b> parecen la misma persona/cosa que otra: revísalas y guarda.</div>
    <datalist id="dca-list">${grupos.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Escrito en las ventas</th><th class="r">Ventas</th><th>Grupo en el informe</th><th>Origen</th></tr></thead><tbody>${filas || '<tr><td colspan="4" style="text-align:center;padding:24px">Sin ventas.</td></tr>'}</tbody></table></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirCanalesGuardar()">💾 Guardar agrupación</button></div>`;
  _dirAliasLista = lista;
}
let _dirAliasLista = [];
async function _dirCanalesGuardar() {
  const tipo = _dirAliasTipo, mapa = _dirAliasMapa(tipo);
  try {
    const tareas = [];
    _dirAliasLista.forEach((x,i) => { const el = document.getElementById('dca-'+i); if (!el) return; const v = el.value.trim(), fb = _dirCanalFb(x.k), actual = mapa[fb];
      const mejor = Object.entries(x.raws).sort((a,b)=>b[1]-a[1])[0][0], auto = _dirAliasAuto(tipo, x.k, mejor === '(vacío)' ? '' : mejor);
      const set = (val) => tipo === 'canal' ? window._fbSetDirCanal(fb, val) : window._fbSetDirAlias(tipo, fb, val);
      if (!v || v === auto) { if (actual) tareas.push(set(null)); } else if (v !== actual) tareas.push(set(v)); });
    await Promise.all(tareas); toastOk(tareas.length ? 'Agrupación guardada.' : 'Sin cambios.'); _dirRenderEditorCanales();
  } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}

/* ═══════════ CORTES MANUALES: cartera actual y expensas pendientes ═══════════ */
function abrirCorteCarteraDir() { _dirDrill = { tipo:'cortec' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function abrirMinutasPendDir() { _dirDrill = { tipo:'cortem' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderMinPend() {
  const c = dirCorte.minpend || {};
  setText('dir-modal-titulo', '✎ Minutas pendientes por firmar');
  setText('dir-modal-sub', 'Cantidad y valor total en US$ de las minutas que aún faltan firmar · informativo');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Carga el <b>total</b> de minutas que faltan (por ejemplo 20 minutas por US$ 3.000.000). No es por gestión: es lo pendiente a la fecha del corte. Se muestra junto a las minutas firmadas.</div>
    <div class="dir-ef"><label>Fecha del corte<input type="date" id="dmp-fecha" value="${esc(c.fecha||new Date().toISOString().slice(0,10))}"></label><label>Cantidad de minutas pendientes<input type="number" min="0" step="1" id="dmp-n" value="${c.cantidad ?? ''}" style="width:150px"></label><label>Valor total pendiente (US$)<input type="number" min="0" step="0.01" id="dmp-v" value="${c.valor ?? ''}" style="width:180px"></label><label class="wide">Nota (opcional)<input id="dmp-nota" value="${esc(c.nota||'')}"></label></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirMinPendGuardar()">💾 Guardar</button><button class="dir-btn-s" onclick="_dirMinPendBorrar()">Borrar</button></div>`;
}
async function _dirMinPendGuardar() {
  const n = document.getElementById('dmp-n').value, v = document.getElementById('dmp-v').value;
  if (n === '' && v === '') { toastErr('Escribe la cantidad y/o el valor.'); return; }
  const d = { fecha:document.getElementById('dmp-fecha').value, nota:document.getElementById('dmp-nota').value.trim(), por:asesorActual?.nombre || 'Gerencia', ts:Date.now() };
  if (n !== '') d.cantidad = Number(n); if (v !== '') d.valor = Number(v);
  try { await window._fbSetDirCorte('minpend', d); toastOk('Minutas pendientes guardadas.'); cerrarModalDirectorio(); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirMinPendBorrar() {
  if (!await confirmDialog('Se borran las minutas pendientes cargadas.', { title:'Borrar', okText:'Borrar' })) return;
  try { await window._fbSetDirCorte('minpend', null); toastOk('Borrado.'); cerrarModalDirectorio(); } catch(e) { toastErr(e.message); }
}
function abrirCorteExpensasDir() { _dirDrill = { tipo:'cortee' }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderCorteCartera() {
  const c = dirCorte.cartera || {}, t = c.t || {}, a = c.a || {};
  setText('dir-modal-titulo', '✎ Cartera actual · cifras del corte');
  setText('dir-modal-sub', 'Cuentas por cobrar de terrenos y acciones, en US$ · se guardan y alimentan la sección Cartera actual');
  const f = (o,k) => (o[k] === undefined || o[k] === null) ? '' : o[k];
  const fila = (lbl, k, ayuda) => `<tr><td><b>${lbl}</b><div style="font-size:11px;color:var(--ink-500)">${ayuda}</div></td><td><input type="number" step="0.01" id="dcc-t-${k}" value="${f(t,k)}" style="width:150px"></td><td><input type="number" step="0.01" id="dcc-a-${k}" value="${f(a,k)}" style="width:150px"></td></tr>`;
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Escribe las cifras al día del corte. Si dejas <b>Cartera actual</b> vacía y cargas ventas y cobranzas, se calcula como <b>ventas − cobranzas</b>. El <b>% de mora</b> se calcula solo: <b>mora ÷ cartera actual (por cobrar)</b>. Mientras Orange no entregue el saldo pendiente de forma verificada, esto se carga a mano (el botón de abajo te muestra qué campos trae Orange).</div>
    <div class="dir-ef" style="margin-bottom:14px"><label>Fecha del corte<input type="date" id="dcc-fecha" value="${esc(c.fecha||new Date().toISOString().slice(0,10))}"></label><label class="wide">Nota (opcional)<input id="dcc-nota" value="${esc(c.nota||'')}" placeholder="Ej.: según reporte de cobranzas de Orange"></label></div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Concepto (US$)</th><th>Terrenos</th><th>Acciones</th></tr></thead><tbody>
      ${fila('Ventas totales','ventas','valor total de los contratos vigentes')}${fila('Cobranzas totales','cobrado','lo cobrado hasta el corte')}${fila('Cartera actual (por cobrar)','cartera','saldo pendiente de cobro')}${fila('Mora actual','mora','parte de la cartera vencida')}
    </tbody></table></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirCorteCarteraGuardar()">💾 Guardar corte</button><button class="dir-btn-s" onclick="abrirDiagnosticoOrangeDir()">🔎 Ver qué entrega Orange</button><button class="dir-btn-s" onclick="_dirCorteCarteraBorrar()">Borrar corte</button></div>`;
}
async function _dirCorteCarteraGuardar() {
  const leer = p => { const o = {}; ['ventas','cobrado','cartera','mora'].forEach(k => { const v = document.getElementById(`dcc-${p}-${k}`).value; if (v !== '' && !isNaN(Number(v))) o[k] = Number(v); }); return o; };
  const data = { fecha:document.getElementById('dcc-fecha').value, nota:document.getElementById('dcc-nota').value.trim(), t:leer('t'), a:leer('a'), por:asesorActual?.nombre || 'Gerencia', ts:Date.now() };
  try { await window._fbSetDirCorte('cartera', data); toastOk('Corte de cartera guardado.'); cerrarModalDirectorio(); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirCorteCarteraBorrar() {
  if (!await confirmDialog('Se borra el corte de cartera cargado.', { title:'Borrar corte', okText:'Borrar' })) return;
  try { await window._fbSetDirCorte('cartera', null); toastOk('Corte borrado.'); cerrarModalDirectorio(); } catch(e) { toastErr(e.message); }
}
function _dirRenderCorteExpensas() {
  const c = dirCorte.expensas || {};
  const sug = Math.max(0, _dirGestExp.reduce((a,x)=>a+x.deb,0) - _dirGestExp.reduce((a,x)=>a+x.cob,0));
  setText('dir-modal-titulo', '✎ Expensas · pendiente y ajustes por gestión');
  setText('dir-modal-sub', 'Saldo de expensas pendiente de pago, en Bs · junto con lo cobrado acumulado forma la cartera de expensas');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">El <b>cobrado acumulado</b> sale solo del módulo de Expensas: todo lo cobrado desde el mes de inicio (por defecto marzo 2024) hasta el último mes cerrado. Aquí cargas lo <b>pendiente</b> al día del corte y el mes de inicio; el informe suma ambos como <b>total de la cartera de expensas</b>. Importante: el "adeudado" que hoy sincroniza el sistema suma cobranzas (lo ya pagado), por eso no se usa como pendiente.</div>
    <div class="dir-ef"><label>Fecha del corte<input type="date" id="dce-fecha" value="${esc(c.fecha||new Date().toISOString().slice(0,10))}"></label><label>Pendiente por cobrar (Bs)<input type="number" step="0.01" id="dce-pend" value="${c.pendiente ?? ''}" style="width:170px"></label>${sug>0?`<label>Sugerido (debió cobrarse − cobrado)<button type="button" class="dir-btn-s" onclick="document.getElementById('dce-pend').value=${sug.toFixed(2)}">Usar ${_fmtMontoBs(sug)}</button></label>`:''}<label>Cobranza acumulada desde (mes)<input type="month" id="dce-desde" value="${esc(c.desde||'2024-03')}"></label><label class="wide">Nota (opcional)<input id="dce-nota" value="${esc(c.nota||'')}" placeholder="Ej.: según estado de cuenta de expensas"></label></div>
    <div class="dir-sub-h" style="margin:18px 0 6px">Cobranza por gestión · ajuste manual (Bs)</div>
    <p class="dir-hint" style="margin:0 0 8px">Lo que entrega Orange aparece como referencia. Escribe un monto solo donde necesites cuadrar un desfase; vacío = se usa lo de Orange.</p>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Gestión</th><th class="r">Cobrado (Orange)</th><th>Cobrado (ajuste)</th><th class="r">Debió cobrarse (meta)</th><th>Debió cobrarse (ajuste)</th></tr></thead><tbody>${_dirGestExp.map(x=>`<tr><td><b>${esc(_labelGestion(x.g))}</b>${x.g===_gestionActual()?' <small>(meses cerrados)</small>':''}</td><td class="r">${_fmtMontoBs(x.cobOr)}</td><td><input type="number" step="0.01" id="dce-gc-${x.g}" value="${x.cobM?x.cob:''}" style="width:130px"></td><td class="r">${x.debOr>0?_fmtMontoBs(x.debOr):'—'}</td><td><input type="number" step="0.01" id="dce-gd-${x.g}" value="${x.debM?x.deb:''}" style="width:130px"></td></tr>`).join('')}</tbody></table></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirCorteExpensasGuardar()">💾 Guardar</button><button class="dir-btn-s" onclick="abrirDiagnosticoOrangeDir()">🔎 Ver qué entrega Orange</button><button class="dir-btn-s" onclick="_dirCorteExpensasBorrar()">Borrar</button></div>`;
}
async function _dirCorteExpensasGuardar() {
  const v = document.getElementById('dce-pend').value;
  if (v !== '' && isNaN(Number(v))) { toastErr('El pendiente debe ser un número.'); return; }
  const gest = {};
  _dirGestExp.forEach(x => { const a = document.getElementById('dce-gc-'+x.g)?.value, b = document.getElementById('dce-gd-'+x.g)?.value, o = {};
    if (a !== '' && a !== undefined && !isNaN(Number(a))) o.cobrado = Number(a); if (b !== '' && b !== undefined && !isNaN(Number(b))) o.debio = Number(b); if (Object.keys(o).length) gest[x.g] = o; });
  const data = { desde:document.getElementById('dce-desde').value || '2024-03', fecha:document.getElementById('dce-fecha').value, nota:document.getElementById('dce-nota').value.trim(), por:asesorActual?.nombre || 'Gerencia', ts:Date.now() };
  if (v !== '') data.pendiente = Number(v); if (Object.keys(gest).length) data.gest = gest;
  try { await window._fbSetDirCorte('expensas', data); toastOk('Datos de expensas guardados.'); cerrarModalDirectorio(); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirCorteExpensasBorrar() {
  if (!await confirmDialog('Se borra el pendiente de expensas cargado.', { title:'Borrar', okText:'Borrar' })) return;
  try { await window._fbSetDirCorte('expensas', null); toastOk('Borrado.'); cerrarModalDirectorio(); } catch(e) { toastErr(e.message); }
}

/* ═══════════ DIAGNÓSTICO: qué campos entrega Orange ═══════════ */
let _dirDiagTxt = '';
async function _dirDiagOp(op) {
  const resp = await fetch(ORANGE_API_URL + '?op=' + op);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const j = JSON.parse(await resp.text());
  const d = Array.isArray(j.data) ? j.data : [];
  const claves = []; d.slice(0, 200).forEach(r => Object.keys(r||{}).forEach(k => { if (!claves.includes(k)) claves.push(k); }));
  const tienePago = claves.includes('FechaDePago');
  const campos = claves.map(k => {
    let llenos = 0, num = 0, sum = 0, sumPago = 0, sumSin = 0, min = Infinity, max = -Infinity, ej = '';
    d.forEach(r => { const v = r[k]; if (v === null || v === undefined || v === '') return; llenos++; if (!ej) ej = String(v).slice(0, 24);
      if (typeof v === 'number') { num++; sum += v; if (v < min) min = v; if (v > max) max = v; if (tienePago) { if (r.FechaDePago) sumPago += v; else sumSin += v; } } });
    return { k, llenos, num, sum, sumPago, sumSin, min, max, ej, esNum: num > 0 && num === llenos };
  });
  const enmascarar = r => { const o = {}; Object.keys(r||{}).forEach(k => { const v = r[k]; o[k] = (typeof v === 'string' && /nombre|cliente|asesor|ci|nit|telef|correo|mail/i.test(k)) ? '…' : v; }); return o; };
  return { op, n:d.length, tienePago, campos, muestra:d.slice(0,2).map(enmascarar) };
}
async function abrirDiagnosticoOrangeDir() {
  _dirDrill = { tipo:'diag' };
  const body = document.getElementById('dir-modal-body');
  setText('dir-modal-titulo', '🔎 Qué entrega Orange');
  setText('dir-modal-sub', 'Consultando GetCartera, GetExpensas, GetVentas y GetLotes…');
  body.innerHTML = '<div class="dir-note">Consultando Orange, un momento…</div>';
  document.getElementById('dir-modal').classList.add('open');
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('es-BO') : '—';
  let html = '', txt = 'DIAGNÓSTICO ORANGE · ' + new Date().toLocaleString('es-BO') + '\n';
  for (const op of ['GetCartera','GetExpensas','GetVentas','GetLotes']) {
    try {
      const r = await _dirDiagOp(op);
      txt += `\n== ${op} · ${r.n} filas ==\n` + r.campos.map(c => `${c.k} | llenos ${c.llenos}/${r.n} | ${c.esNum ? 'numérico · suma ' + fmt(c.sum) + (r.tienePago ? ' (con pago ' + fmt(c.sumPago) + ' / sin pago ' + fmt(c.sumSin) + ')' : '') + ' · rango ' + fmt(c.min) + ' a ' + fmt(c.max) : 'texto · ej: ' + c.ej}`).join('\n') + '\nMuestra: ' + JSON.stringify(r.muestra) + '\n';
      html += `<div class="dir-sub-h" style="margin:18px 0 6px">${op} · ${r.n.toLocaleString('es-BO')} filas</div><div class="dir-tw"><table class="dir-t"><thead><tr><th>Campo</th><th class="r">Llenos</th><th>Tipo</th><th class="r">Suma</th>${r.tienePago?'<th class="r">Con fecha de pago</th><th class="r">Sin fecha de pago</th>':''}<th class="r">Mín</th><th class="r">Máx</th></tr></thead><tbody>${r.campos.map(c => `<tr><td><b>${esc(c.k)}</b></td><td class="r">${c.llenos}</td><td>${c.esNum?'número':'texto · '+esc(c.ej)}</td><td class="r">${c.esNum?fmt(c.sum):''}</td>${r.tienePago?`<td class="r">${c.esNum?fmt(c.sumPago):''}</td><td class="r">${c.esNum?fmt(c.sumSin):''}</td>`:''}<td class="r">${c.esNum?fmt(c.min):''}</td><td class="r">${c.esNum?fmt(c.max):''}</td></tr>`).join('')}</tbody></table></div>`;
    } catch(e) { txt += `\n== ${op} == ERROR: ${e.message}\n`; html += `<div class="dir-sub-h" style="margin:18px 0 6px">${op}</div><div class="dir-note" style="color:#8A3F31">No se pudo consultar: ${esc(e.message)}</div>`; }
  }
  _dirDiagTxt = txt;
  setText('dir-modal-sub', 'Campos que trae cada operación de Orange · busca aquí si existe un campo de saldo / pendiente');
  body.innerHTML = `<div class="dir-note" style="margin:0 0 6px">Sirve para confirmar si Orange entrega el <b>saldo pendiente (cuentas por cobrar)</b> y la <b>mora</b> reales. Fíjate en campos numéricos cuya suma sea razonable (por ejemplo, un saldo). Los nombres de personas se ocultan en la muestra.</div>
    <div class="dir-ef-b" style="margin:10px 0"><button class="dir-btn-s pri" onclick="navigator.clipboard.writeText(_dirDiagTxt).then(()=>toastOk('Resultado copiado.'),()=>toastErr('No se pudo copiar'))">📋 Copiar resultado</button></div>` + html;
}

/* ═══════════ MINUTAS: listado editable + importación de Excel ═══════════ */
function abrirDetalleMinutasDir(arg) { _dirDrill = { tipo:'minutas', arg }; _dirEditKey = null; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open'); }
function _dirRenderMinutas() {
  const g = dirGestion ?? _gestionActual(), meses = _dirMesesGestion(g), d = _dirDrill;
  const lista = _dirMinutas(g).filter(x => d.arg === 'todas' || x.mi === d.arg);
  const total = lista.reduce((s,x)=>s+x.precio,0), conM2 = lista.filter(x=>x.superficie>0 && x.precio>0), m2 = conM2.reduce((s,x)=>s+x.superficie,0), usdM2 = m2 ? conM2.reduce((s,x)=>s+x.precio,0)/m2 : 0;
  setText('dir-modal-titulo', '🖋 Minutas firmadas · ' + (d.arg === 'todas' ? 'toda la gestión' : meses[d.arg].label));
  setText('dir-modal-sub', lista.length + ' terreno(s) · ' + _dirUsd(total) + (usdM2 ? ' · US$/m² ' + Math.round(usdM2).toLocaleString('es-BO') : '') + ' · Gestión ' + g + '-' + String(g+1).slice(2));
  const inp = (x, f, tipo, w) => `<input data-f="${f}" type="${tipo}" ${tipo==='number'?'step="0.01" min="0"':''} value="${esc(f==='mes' ? String(x.fecha||'').slice(0,7) : (x[f] ?? ''))}" style="width:${w}px" onchange="_dirMinutaGuardar('${escJs(x.id)}',this)">`;
  const filas = lista.map(x => `<tr><td>${inp(x,'mes','month',150)}</td><td>${inp(x,'terreno','text',110)}</td><td>${inp(x,'cliente','text',220)}</td><td>${inp(x,'superficie','number',100)}</td><td>${inp(x,'precio','number',120)}</td><td class="r"><b>${x.superficie>0 && x.precio>0 ? '$' + Math.round(x.precio/x.superficie).toLocaleString('es-BO') : '—'}</b></td><td><button class="dir-mini-btn" onclick="_dirMinutaBorrar('${escJs(x.id)}')" title="Quitar esta minuta">🗑</button></td></tr>`).join('');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">Este es <b>tu listado de minutas</b> (no depende de las ventas del sistema): terreno, cliente, superficie, precio de venta en dólares reales y mes de la minuta. El <b>US$/m²</b> se calcula solo. Todo se puede editar directamente; el cambio se guarda al salir de la celda. La gestión de cada minuta sale de su mes.</div>
    <div class="dir-ef-b" style="margin:0 0 12px"><button class="dir-btn-s pri" onclick="document.getElementById('dir-min-input').click()">📂 Importar desde Excel</button><button class="dir-btn-s" onclick="_dirMinutaNueva()">➕ Agregar minuta</button></div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Mes de la minuta</th><th>Terreno</th><th>Cliente</th><th>Superficie m²</th><th>Precio de venta US$</th><th class="r">US$/m²</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="7" style="text-align:center;padding:24px">Sin minutas en este filtro.</td></tr>'}</tbody></table></div>`;
}
const _dirMinId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
async function _dirMinutaGuardar(id, el) {
  const r = dirMinutas[id]; if (!r) return; let v = el.value, f = el.dataset.f;
  if (f === 'precio' || f === 'superficie') v = parseFloat(v) || 0;
  if (f === 'mes') { if (!/^\d{4}-\d{2}$/.test(v)) { toastErr('Elige un mes válido.'); return; } f = 'fecha'; v = v + '-01'; }
  try { await window._fbSetDirMinuta(id, { ...r, [f]: v }); } catch(e) { toastErr('No se pudo guardar: ' + e.message); }
}
async function _dirMinutaNueva() {
  const g = dirGestion ?? _gestionActual(), hoy = new Date(), m0 = _dirMesesGestion(g)[0];
  const f = _gestionDeFecha(hoy) === g ? hoy : new Date(m0.anio, m0.mes, 1), iso = f.getFullYear() + '-' + String(f.getMonth()+1).padStart(2,'0') + '-01';
  try { await window._fbSetDirMinuta(_dirMinId(), { terreno:'', cliente:'', superficie:0, fecha:iso, precio:0, origen:'manual' }); } catch(e) { toastErr(e.message); }
}
async function _dirMinutaBorrar(id) {
  if (!await confirmDialog('Se quita esta minuta del listado.', { title:'Quitar minuta', okText:'Quitar' })) return;
  try { await window._fbSetDirMinuta(id, null); } catch(e) { toastErr(e.message); }
}
// ── Importación ──
let _dirMinImp = null;
function _dirParseFecha(v) {
  const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  if (v instanceof Date && !isNaN(v)) return iso(new Date(v.getTime() + 12*3600e3));
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0'); }
  const t = String(v||'').trim(); if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0'); }
  return '';
}
function _dirParsePrecio(v) {
  if (typeof v === 'number') return v;
  let t = String(v||'').replace(/[^\d,.\-]/g, ''); if (!t) return 0;
  const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
  if (c >= 0 && p >= 0) t = c > p ? t.replace(/\./g,'').replace(',','.') : t.replace(/,/g,'');
  else if (c >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(',','.') : t.replace(/,/g,'');
  else if (p >= 0 && /\.\d{3}$/.test(t) && (t.match(/\./g)||[]).length >= 1 && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g,'');
  return parseFloat(t) || 0;
}
// Mes de la minuta → 'YYYY-MM-01'. Acepta fecha completa, "septiembre 2025", "sep-25", "09/2025", o solo mes (nombre o 1-12) usando la gestión elegida para el año
const _DIR_MES_TXT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function _dirParseMes(v, g) {
  const ym = (a, m) => a + '-' + String(m).padStart(2,'0') + '-01';
  const anioDe = m => (m >= 4 ? g : g + 1);
  if (v instanceof Date || (typeof v === 'number' && v > 20000)) { const f = _dirParseFecha(v); return f ? f.slice(0,7) + '-01' : ''; }
  if (typeof v === 'number' && v >= 1 && v <= 12 && Number.isInteger(v)) return ym(anioDe(v), v);
  const t = String(v||'').trim().toLowerCase(); if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/); if (m && +m[2] >= 1 && +m[2] <= 12) return ym(m[1], +m[2]);
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m && +m[2] >= 1 && +m[2] <= 12) return ym(m[3].length === 2 ? '20' + m[3] : m[3], +m[2]);
  m = t.match(/^(\d{1,2})[\/\-.](\d{2,4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return ym(m[2].length === 2 ? '20' + m[2] : m[2], +m[1]);
  const sin = t.normalize('NFD').replace(/[̀-ͯ]/g,''), k = _DIR_MES_TXT.findIndex(x => sin.startsWith(x) || sin.includes(x));
  if (k >= 0) { const a = sin.match(/(\d{4})/) || sin.match(/[\s\-\/.'](\d{2})\s*$/); const anio = a ? (a[1].length === 2 ? '20' + a[1] : a[1]) : anioDe(k + 1); return ym(anio, k + 1); }
  if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 12) return ym(anioDe(+t), +t);
  return '';
}
const _DIR_MIN_PAT = { terreno:/terreno|lote|ubicaci|manzan/i, cliente:/cliente|comprador|propietari|titular|nombre/i, superficie:/superficie|m2|m²|metraje|metros|[aá]rea/i, mes:/mes|minuta|firma|fecha/i, precio:/precio|venta|tco|monto|valor|usd|\$|d[oó]lar/i };
async function dirMinutasExcel(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates:true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:'' });
    const pat = _DIR_MIN_PAT;
    let best = 0, bestN = -1;
    rows.slice(0, 15).forEach((r,i) => { const n = Object.values(pat).filter(p => r.some(c => typeof c === 'string' && p.test(c))).length; if (n > bestN) { bestN = n; best = i; } });
    _dirMinImp = { nombre:file.name, rows, hdr:best, map:{}, modo:'agregar', fechaDef:'', g:(dirGestion ?? _gestionActual()) };
    _dirMinAutoMap(pat);
    input.value = '';
    _dirDrill = { tipo:'minimport' }; _dirRenderModal(); document.getElementById('dir-modal').classList.add('open');
  } catch(e) { toastErr('No se pudo leer el Excel: ' + e.message); }
}
function _dirMinAutoMap(pat) {
  const I = _dirMinImp, head = I.rows[I.hdr] || [], usados = new Set(); I.map = {};
  pat = pat || _DIR_MIN_PAT;
  ['terreno','cliente','superficie','mes','precio'].forEach(f => { const j = head.findIndex((c,k) => !usados.has(k) && typeof c === 'string' && pat[f].test(c)); I.map[f] = j; if (j >= 0) usados.add(j); });
}
function _dirMinFilas() {
  const I = _dirMinImp, m = I.map, out = []; let sinMes = 0, vacias = 0;
  I.rows.slice(I.hdr + 1).forEach(r => {
    const get = f => m[f] >= 0 ? r[m[f]] : '';
    const terreno = String(get('terreno') || '').trim(), cliente = String(get('cliente') || '').trim(); if (!terreno && !cliente) { vacias++; return; }
    const fecha = m.mes >= 0 ? _dirParseMes(get('mes'), I.g) : (I.fechaDef ? I.fechaDef + '-01' : ''); if (!fecha) { sinMes++; return; }
    out.push({ terreno, cliente, superficie:_dirParsePrecio(get('superficie')), fecha, precio:_dirParsePrecio(get('precio')) });
  });
  return { out, sinMes, vacias };
}
function _dirRenderMinImport() {
  const I = _dirMinImp, head = I.rows[I.hdr] || [], col = j => { let n = '', k = j; do { n = String.fromCharCode(65 + k % 26) + n; k = Math.floor(k/26) - 1; } while (k >= 0); return n; };
  const opts = f => `<option value="-1">— no usar —</option>` + head.map((c,j) => `<option value="${j}" ${I.map[f]===j?'selected':''}>${col(j)} · ${esc(String(c||'(vacío)').slice(0,28))}</option>`).join('');
  const sel = (f, lbl) => `<label>${lbl}<select onchange="_dirMinImp.map.${f}=parseInt(this.value);_dirRenderMinImport()">${opts(f)}</select></label>`;
  const { out, sinMes, vacias } = _dirMinFilas();
  const g = dirGestion ?? _gestionActual(), enG = out.filter(x => _gestionDeFecha(new Date(x.fecha + 'T00:00:00')) === g);
  const gestOpts = [g-3,g-2,g-1,g,g+1].map(x => `<option value="${x}" ${I.g===x?'selected':''}>${x}-${String(x+1).slice(2)}</option>`).join('');
  setText('dir-modal-titulo', '📂 Importar minutas desde Excel');
  setText('dir-modal-sub', I.nombre + ' · revisa que las columnas estén bien asignadas antes de importar');
  const prev = out.slice(0, 8).map(x => `<tr><td>${esc(x.terreno)}</td><td>${esc(x.cliente)}</td><td class="r">${x.superficie ? x.superficie.toLocaleString('es-BO') : '—'}</td><td>${PC_MESES[+x.fecha.slice(5,7)-1]} ${x.fecha.slice(0,4)}</td><td class="r">${_dirUsd(x.precio)}</td><td class="r">${x.superficie>0 && x.precio>0 ? '$' + Math.round(x.precio/x.superficie).toLocaleString('es-BO') : '—'}</td></tr>`).join('');
  document.getElementById('dir-modal-body').innerHTML = `<div class="dir-note" style="margin:0 0 12px">El sistema detectó las columnas por su título. Corrige las que estén mal. El <b>US$/m²</b> se calcula con precio ÷ superficie. <b>Importar no toca las ventas</b>: llena el listado de minutas, que luego puedes editar.</div>
    <div class="dir-ef" style="margin-bottom:14px"><label>Fila de títulos<input type="number" min="1" value="${I.hdr+1}" style="width:80px" onchange="_dirMinImp.hdr=Math.max(0,(parseInt(this.value)||1)-1);_dirMinAutoMap();_dirRenderMinImport()"></label>${sel('terreno','Terreno')}${sel('cliente','Cliente')}${sel('superficie','Superficie (m²)')}${sel('precio','Precio de venta (US$)')}${sel('mes','Mes de minuta')}
    <label>Gestión de las minutas<select onchange="_dirMinImp.g=parseInt(this.value);_dirRenderMinImport()">${gestOpts}</select></label>
    ${I.map.mes < 0 ? `<label>Mes para todas<input type="month" value="${I.fechaDef}" onchange="_dirMinImp.fechaDef=this.value;_dirRenderMinImport()"></label>` : ''}
    <label>Al importar<select onchange="_dirMinImp.modo=this.value"><option value="agregar" ${I.modo==='agregar'?'selected':''}>Agregar (omite terreno + mes repetidos)</option><option value="reemplazar" ${I.modo==='reemplazar'?'selected':''}>Reemplazar todo el listado actual</option></select></label></div>
    <div class="dir-note" style="margin:0 0 10px">Si el mes viene sin año (ej. "septiembre"), se asigna dentro de la gestión elegida (abril a marzo). <b>${out.length}</b> fila(s) válidas · <b>${enG.length}</b> caen en la gestión ${g}-${String(g+1).slice(2)} ${sinMes ? ' · <span style="color:#8A3F31">' + sinMes + ' sin mes reconocible (se omiten)</span>' : ''}${vacias ? ' · ' + vacias + ' vacías' : ''}</div>
    <div class="dir-tw"><table class="dir-t"><thead><tr><th>Terreno</th><th>Cliente</th><th class="r">m²</th><th>Mes</th><th class="r">Precio</th><th class="r">US$/m²</th></tr></thead><tbody>${prev || '<tr><td colspan="6" style="text-align:center;padding:20px">Sin filas válidas: revisa las columnas.</td></tr>'}</tbody></table></div>
    <div class="dir-ef-b" style="margin-top:16px"><button class="dir-btn-s pri" onclick="_dirMinImportar()" ${out.length?'':'disabled'}>⬆ Importar ${out.length} minuta(s)</button></div>`;
}
async function _dirMinImportar() {
  const I = _dirMinImp; if (!I) return; const { out } = _dirMinFilas(); if (!out.length) return;
  const obj = {}; const ya = new Set(Object.values(dirMinutas||{}).map(m => _dirNormTerr(m.terreno) + '|' + m.fecha));
  let n = 0, omit = 0;
  out.forEach((x,i) => { if (I.modo === 'agregar' && ya.has(_dirNormTerr(x.terreno) + '|' + x.fecha)) { omit++; return; } obj[_dirMinId() + i] = { ...x, origen:'excel', archivo:I.nombre }; n++; });
  try {
    if (I.modo === 'reemplazar') { if (!await confirmDialog('Se borra el listado de minutas actual y se reemplaza por las ' + n + ' del Excel.', { title:'Reemplazar minutas', okText:'Reemplazar' })) return; await window._fbReplaceDirMinutas(obj); }
    else await window._fbUpdateDirMinutas(obj);
    toastOk(n + ' minuta(s) importada(s)' + (omit ? ' · ' + omit + ' repetida(s) omitida(s)' : '') + '.'); _dirMinImp = null; abrirDetalleMinutasDir('todas');
  } catch(e) { toastErr('No se pudo importar: ' + e.message); }
}

/* ═══════════ MODO PRESENTACIÓN (tipo PowerPoint) ═══════════ */
let _dirPres = { on:false, i:0 };
function _dirSlides() { return [...document.querySelectorAll('#dir-contenido .dir-slide')]; }
function iniciarPresentacionDir() {
  const p = document.getElementById('panel-directorio'); if (!p) return;
  if (!document.getElementById('dir-contenido').querySelector('.dir-slide')) { toastErr('El informe todavía se está cargando.'); return; }
  _dirPres.on = true; _dirPres.i = 0;
  p.classList.add('dir-pres'); document.body.classList.add('dir-pres-open');
  try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch(e) {}
  _dirPresGo(0);
}
function salirPresentacionDir() {
  if (!_dirPres.on) return;
  _dirPres.on = false;
  document.getElementById('panel-directorio')?.classList.remove('dir-pres'); document.body.classList.remove('dir-pres-open');
  _dirSlides().forEach(s => { s.classList.remove('cur'); s.style.zoom = ''; });
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e) {}
  setTimeout(() => Object.values(_dirCharts).forEach(c => { try { c.resize(); } catch(e) {} }), 60);
}
function _dirPresGo(i) {
  const sl = _dirSlides(); if (!sl.length) return;
  _dirPres.i = Math.max(0, Math.min(sl.length - 1, i));
  sl.forEach((s,k) => s.classList.toggle('cur', k === _dirPres.i));
  const cnt = document.getElementById('dir-pres-cnt'); if (cnt) cnt.textContent = (_dirPres.i + 1) + ' / ' + sl.length;
  const bar = document.getElementById('dir-pres-bar'); if (bar) bar.style.width = ((_dirPres.i + 1) / sl.length * 100) + '%';
  const ttl = document.getElementById('dir-pres-ttl'); if (ttl) ttl.textContent = sl[_dirPres.i].dataset.t || '';
  // Quita de la vista las filas de meses futuros (todo '—') para ganar espacio
  sl[_dirPres.i].querySelectorAll('tbody tr').forEach(tr => { const t = [...tr.children].slice(1).map(c => c.textContent.trim()); if (t.length && t.every(x => x === '—' || x === '')) tr.classList.add('dir-fut'); });
  const fit = () => { const s = sl[_dirPres.i]; if (!s) return; s.style.zoom = ''; const disp = window.innerHeight - 96, h = s.scrollHeight; if (h > disp) s.style.zoom = Math.max(.74, disp / h).toFixed(3); Object.values(_dirCharts).forEach(c => { try { c.resize(); } catch(e) {} }); };
  requestAnimationFrame(() => { fit(); setTimeout(fit, 120); });
  window.scrollTo(0, 0);
}
function dirPresMover(d) { _dirPresGo(_dirPres.i + d); }
document.addEventListener('keydown', e => {
  if (!_dirPres.on) return;
  if (document.getElementById('dir-modal')?.classList.contains('open')) { if (e.key === 'Escape') cerrarModalDirectorio(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (['ArrowRight','PageDown',' ','Enter'].includes(e.key)) { e.preventDefault(); dirPresMover(1); }
  else if (['ArrowLeft','PageUp','Backspace'].includes(e.key)) { e.preventDefault(); dirPresMover(-1); }
  else if (e.key === 'Home') { e.preventDefault(); _dirPresGo(0); }
  else if (e.key === 'End') { e.preventDefault(); _dirPresGo(9999); }
  else if (e.key === 'Escape') { salirPresentacionDir(); }
});
document.addEventListener('fullscreenchange', () => { if (_dirPres.on && !document.fullscreenElement) salirPresentacionDir(); });
window.addEventListener('resize', () => { if (_dirPres.on) _dirPresGo(_dirPres.i); });
function dirIr(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }); }
