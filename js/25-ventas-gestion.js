/* ════════════════════════════════════════════════════════════════════════
   VENTAS GESTIÓN — todas las ventas de la gestión (abril a marzo)
   Junta las dos fuentes sin contar dos veces la misma venta:
   · Ventas Concretadas (ventas_concretadas, aprobadas — incluye lo que viene de Orange)
   · Ventas (cierres de la plataforma = conclusión "Reserva", cargados desde julio)
   Una venta es la misma si: el contrato se armó desde ese registro (registroKey),
   o coincide el terreno, o coincide el nombre del cliente.
   Si está en las dos, manda el dato de Ventas Concretadas (es el oficial).
   Las ventas caídas no se cuentan.
   ════════════════════════════════════════════════════════════════════════ */
const VG = { gestion: null, metas: {}, buscar: '', orden: 'fecha', timer: null };
const VG_C = { ink: '#1C1A17', gold: '#8A6E3F', sand: '#CDBE98', green: '#2F4A34', red: '#A33F27', mute: '#5C5547', hair: '#E6DECB', line: '#D5CAB2', cream: '#F2EEE1', card: '#FBF9F3' };
const VG_FUENTE = {
  ambas: { l: 'En las dos', d: 'reserva en Ventas y contrato en Ventas Concretadas', c: VG_C.green },
  vc:    { l: 'Solo Ventas Concretadas', d: 'ventas de antes de la plataforma o cargadas solo en Orange', c: VG_C.gold },
  plat:  { l: 'Solo Ventas', d: 'reservas de la plataforma que todavía no figuran como concretadas', c: VG_C.sand },
};
const VG_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const VG_MC = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const _vgE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _vgSin = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const _vgUsd = v => '$' + Math.round(v || 0).toLocaleString('es-BO');
const _vgK = v => !v ? '—' : v >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-BO', { maximumFractionDigits: 2 }) + ' M' : '$' + Math.round(v / 1000).toLocaleString('es-BO') + ' k';
const _vgAvg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const _vgArr = n => { try { const v = eval(n); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
/* "1-5-325", "UV1 M5 L325", "Mod. 1 - 5 - 325" → "1-5-325" */
function _vgTerreno(t) { const g = String(t || '').match(/\d+/g); return g && g.length >= 2 ? g.map(n => String(+n)).join('-') : ''; }
function _vgCliente(c) { return _vgSin(c).split(' ').filter(w => w.length > 1).sort().join(' '); }
function _vgModalidad(m) {
  const s = _vgSin(m); if (!s) return 'Sin modalidad';
  const l = (typeof PC_MODALIDADES !== 'undefined' ? PC_MODALIDADES : ['Contado', 'Contado Diferido', 'Crédito Directo', 'Crédito Bancario']);
  return l.find(x => _vgSin(x) === s) || l.slice().sort((a, b) => b.length - a.length).find(x => s.includes(_vgSin(x))) || String(m).trim();
}
function _vgISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _vgFechaVC(v) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v.fechaReserva || '')) return v.fechaReserva.slice(0, 10);
  const i = VG_MESES.indexOf(v.mes), a = Number(v.año || v.anio);
  return (a && i >= 0) ? `${a}-${String(i + 1).padStart(2, '0')}-15` : (v.ts ? _vgISO(new Date(v.ts)) : '');
}
function _vgFechaReg(r) {
  if (/^\d{4}-\d{2}-\d{2}/.test(r.fecha || '')) return r.fecha.slice(0, 10);
  return r.ts ? _vgISO(new Date(r.ts)) : (r.conclusionTs ? _vgISO(new Date(r.conclusionTs)) : '');
}
function _vgGestionDe(iso) { if (!iso) return null; const a = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 4 ? a : a - 1; }
const _vgCaida = v => /ca[ií]d/i.test(v.estadoVenta || '') || /anulad/i.test(v.estadoVenta || '');

/* ── Une las dos fuentes ── */
function vgDatos(g) {
  const vcTodas = _vgArr('ventasConcretadasData').filter(v => v.estadoAutorizacion === 'aprobado');
  const regs = _vgArr('todosRegs').filter(r => typeof _esCierreVenta === 'function' ? _esCierreVenta(r) : r.conclusion === 'Reserva');
  // nombres de la plataforma, para unificar "DAYANA DAVALOS ..." (Orange) con "Dayana" (plataforma)
  const nombresPlat = [...new Set(regs.filter(r => !r.esExterno).map(r => (r.asesorNombre || '').trim()).filter(Boolean))];
  const asesor = n => {
    const s = _vgSin(n); if (!s) return 'Sin asesor';
    const p = nombresPlat.find(x => _vgSin(x) === s) || nombresPlat.find(x => { const f = _vgSin(x).split(' ')[0]; return f.length > 2 && s.split(' ').includes(f); });
    return p || String(n).trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  };
  // las concretadas de la gestión (y las caídas aparte, para que una reserva caída no vuelva a contar)
  const vc = vcTodas.map(v => ({ v, f: _vgFechaVC(v), t: _vgTerreno(v.terreno), c: _vgCliente(v.cliente) })).filter(x => _vgGestionDe(x.f) === g);
  const usadas = new Set(), out = [], caidas = [];
  const pr = regs.map(r => ({ r, f: _vgFechaReg(r), t: _vgTerreno(r.terrenoInteres || r.terreno || ''), c: _vgCliente(r.nombre || r.cliente) }));
  // índice para buscar la concretada de cada reserva (en cualquier gestión, por si el contrato salió con otra fecha)
  const vcAll = vcTodas.map(v => ({ v, f: _vgFechaVC(v), t: _vgTerreno(v.terreno), c: _vgCliente(v.cliente) }));
  const buscarVC = p => vcAll.find(x => x.v.registroKey && x.v.registroKey === p.r._key)
    || (p.t && vcAll.find(x => x.t === p.t && (!p.c || !x.c || x.c === p.c || Math.abs(new Date(x.f) - new Date(p.f)) < 200 * 864e5)))
    || (p.c && p.c.split(' ').length >= 2 && vcAll.find(x => x.c === p.c));
  const fila = (fuente, v, r) => {
    const f = v ? _vgFechaVC(v) : _vgFechaReg(r);
    const venta = (v ? v.precioVenta : 0) || (r ? (r.precioVenta || r.precio) : 0) || 0;
    const lista = (v ? v.precioLista : 0) || (r ? r.precioLista : 0) || 0;
    const met = (v ? v.metraje : 0) || (r ? r.metraje : 0) || 0;
    const m2 = (v ? v.m2Usd : 0) || (r ? r.precioM2Final : 0) || (met && venta ? venta / met : 0);
    let desc = (v ? v.descuentoPct : 0) || (r ? r.descuentoPct : 0) || 0;
    if (!desc && lista && venta && lista > venta) desc = Math.round((lista - venta) / lista * 1000) / 10;
    const ext = r && r.esExterno;
    const nomA = ext ? 'Agente externo' : asesor((r && r.asesorNombre) || (v && v.asesorNombre));
    return {
      fuente, fecha: f, mesIdx: f ? +f.slice(5, 7) - 1 : -1,
      cliente: (v && v.cliente) || (r && (r.nombre || r.cliente)) || '—',
      terreno: (v && v.terreno) || (r && (r.terrenoInteres || r.terreno)) || '—',
      asesor: nomA, canal: (v && (v.canal || v.gestion)) || (r && r.origen) || 'Sin canal',
      modalidad: _vgModalidad((v && v.modalidad) || (r && (r.modalidad || r.formaPago))),
      categoria: (v && v.categoria) || (r && r.categoria) || 'Sin categoría',
      venta, lista, met, m2, desc, ext: !!ext,
      cerradoPor: r && r.cerradoPor ? r.cerradoPor : '',
    };
  };
  pr.forEach(p => {
    const x = buscarVC(p);
    if (x) {
      if (_vgCaida(x.v)) { if (_vgGestionDe(p.f) === g || _vgGestionDe(x.f) === g) caidas.push(fila('caida', x.v, p.r)); usadas.add(x.v); return; }
      if (_vgGestionDe(x.f) !== g) { usadas.add(x.v); return; }   // su contrato es de otra gestión
      if (usadas.has(x.v)) return;                                // dos reservas del mismo contrato
      usadas.add(x.v); out.push(fila('ambas', x.v, p.r)); return;
    }
    if (_vgGestionDe(p.f) === g) out.push(fila('plat', null, p.r));
  });
  vc.forEach(x => {
    if (usadas.has(x.v)) return;
    if (_vgCaida(x.v)) { caidas.push(fila('caida', x.v, null)); return; }
    out.push(fila('vc', x.v, null));
  });
  out.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return { ventas: out, caidas };
}

function _vgMeses(g) { const o = []; for (let i = 3; i < 15; i++) o.push({ mes: VG_MESES[i % 12], idx: i % 12, anio: i < 12 ? g : g + 1, c: VG_MC[i % 12] }); return o; }

function _vgCargarMetas(g) {
  if (VG.metas[g] && Date.now() - VG.metas[g].ts < 5 * 60e3) return Promise.resolve(VG.metas[g].l);
  if (typeof window._fbGetMetaOnce !== 'function') return Promise.resolve(null);
  return Promise.all(_vgMeses(g).map(m => window._fbGetMetaOnce(m.anio, m.mes, 'mkt_cierres').catch(() => 0)))
    .then(l => { VG.metas[g] = { ts: Date.now(), l: l.map(v => Number(v) || 0) }; return VG.metas[g].l; });
}

/* ── Agrupar ── */
function _vgGrupo(ventas, key) {
  const m = {};
  ventas.forEach(v => { const k = v[key] || '—'; (m[k] ||= []).push(v); });
  return Object.entries(m).map(([k, l]) => ({
    k, n: l.length, monto: l.reduce((s, v) => s + v.venta, 0),
    ticket: _vgAvg(l.map(v => v.venta).filter(Boolean)), desc: _vgAvg(l.map(v => v.desc).filter(Boolean)), m2: _vgAvg(l.map(v => v.m2).filter(Boolean)),
  })).sort((a, b) => b.n - a.n || b.monto - a.monto);
}

/* ── Dibujo ── */
function vgRender() {
  const root = document.getElementById('vg-root'); if (!root) return;
  const gHoy = typeof _gestionActual === 'function' ? _gestionActual() : _vgGestionDe(_vgISO(new Date()));
  if (VG.gestion == null) VG.gestion = gHoy;
  const g = VG.gestion, meses = _vgMeses(g);
  const { ventas, caidas } = vgDatos(g);
  const metas = VG.metas[g]?.l || null;
  if (!metas) _vgCargarMetas(g).then(l => { if (l) vgRender(); });

  const hoy = new Date(), hoyIdx = (hoy.getFullYear() - g) * 12 + hoy.getMonth() - 3;   // posición del mes en curso dentro de la gestión
  const mesesHasta = Math.max(0, Math.min(11, hoyIdx));
  const total = ventas.reduce((s, v) => s + v.venta, 0);
  const ticket = _vgAvg(ventas.map(v => v.venta).filter(Boolean));
  const m2 = _vgAvg(ventas.map(v => v.m2).filter(Boolean));
  const desc = _vgAvg(ventas.map(v => v.desc).filter(Boolean));
  const metaGest = metas ? metas.reduce((s, v) => s + v, 0) : 0;
  const metaAFecha = metas ? metas.slice(0, mesesHasta + 1).reduce((s, v) => s + v, 0) : 0;
  const nF = { ambas: 0, vc: 0, plat: 0 }; ventas.forEach(v => nF[v.fuente]++);

  // por mes
  const pm = meses.map((m, i) => {
    const l = ventas.filter(v => v.mesIdx === m.idx && _vgGestionDe(v.fecha) === g);
    return { ...m, i, l, n: l.length, monto: l.reduce((s, v) => s + v.venta, 0), meta: metas ? metas[i] : 0, f: { ambas: l.filter(v => v.fuente === 'ambas').length, vc: l.filter(v => v.fuente === 'vc').length, plat: l.filter(v => v.fuente === 'plat').length },
      ticket: _vgAvg(l.map(v => v.venta).filter(Boolean)), m2: _vgAvg(l.map(v => v.m2).filter(Boolean)), desc: _vgAvg(l.map(v => v.desc).filter(Boolean)), fut: i > hoyIdx, act: i === hoyIdx };
  });
  const conVentas = pm.filter(m => m.n);
  const mejor = conVentas.slice().sort((a, b) => b.n - a.n || b.monto - a.monto)[0];
  const promMes = mesesHasta >= 0 ? ventas.length / (mesesHasta + 1) : 0;

  const opts = [gHoy, gHoy - 1, gHoy - 2].map(x => `<option value="${x}" ${x === g ? 'selected' : ''}>Gestión ${typeof _labelGestion === 'function' ? _labelGestion(x) : x}</option>`).join('');
  const pctMeta = metaAFecha ? Math.round(ventas.length / metaAFecha * 100) : null;

  const h = [];
  h.push(`<div class="vg-top">
    <div><h2>Ventas de la gestión</h2><p>${_vgE(typeof _labelGestion === 'function' ? _labelGestion(g) : g)} · Ventas Concretadas + reservas de la plataforma, cada venta una sola vez</p></div>
    <div class="vg-top-a"><select onchange="VG.gestion=+this.value;vgRender()" aria-label="Gestión">${opts}</select><button type="button" class="vg-btn" onclick="vgExportar()">Descargar Excel</button></div>
  </div>`);

  // KPIs
  const kpi = (l, v, cls = '') => `<div class="vg-k ${cls}"><span>${l}</span><b>${v}</b></div>`;
  h.push(`<div class="vg-kpis">
    ${kpi('Ventas', ventas.length, 'vg-k-main')}
    ${kpi('Total vendido', _vgK(total))}
    ${kpi('Ticket promedio', ticket ? _vgUsd(ticket) : '—')}
    ${kpi('Precio por m²', m2 ? '$' + m2.toLocaleString('es-BO', { maximumFractionDigits: 1 }) : '—')}
    ${kpi('Descuento prom.', desc ? desc.toLocaleString('es-BO', { maximumFractionDigits: 1 }) + '%' : '—')}
    ${kpi('Meta a la fecha', metaAFecha ? `${ventas.length} / ${metaAFecha}` : 'sin meta', pctMeta == null ? '' : pctMeta >= 100 ? 'vg-ok' : 'vg-no')}
  </div>`);

  // De dónde sale cada venta
  const tot = ventas.length || 1;
  h.push(`<section class="vg-card"><div class="vg-h"><b>De dónde sale cada venta</b><span>la misma venta en las dos fuentes cuenta una sola vez</span></div>
    <div class="vg-fuente-bar">${['ambas', 'vc', 'plat'].map(k => nF[k] ? `<i style="flex:${nF[k]};background:${VG_FUENTE[k].c}" title="${VG_FUENTE[k].l}: ${nF[k]}">${nF[k]}</i>` : '').join('') || '<i style="flex:1;background:#EEE8DA;color:#5C5547">sin ventas</i>'}</div>
    <div class="vg-fuentes">${['ambas', 'vc', 'plat'].map(k => `<div><u style="background:${VG_FUENTE[k].c}"></u><b>${nF[k]}</b> ${VG_FUENTE[k].l} <span>· ${VG_FUENTE[k].d} · ${Math.round(nF[k] / tot * 100)}%</span></div>`).join('')}
    ${caidas.length ? `<div><u style="background:none;border:1.5px solid ${VG_C.red}"></u><b>${caidas.length}</b> caída${caidas.length > 1 ? 's' : ''} <span>· no se cuenta${caidas.length > 1 ? 'n' : ''} en ningún número</span></div>` : ''}</div>
  </section>`);

  // Por mes contra meta
  const maxN = Math.max(1, ...pm.map(m => Math.max(m.n, m.meta || 0)));
  const W = 760, H = 210, top = 22, base = H - 34, cw = W / 12, bw = Math.min(38, cw * .56);
  const y = n => base - n / maxN * (base - top);
  let svg = '';
  for (let t = 0; t <= maxN; t += Math.max(1, Math.ceil(maxN / 4))) svg += `<line x1="0" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="${VG_C.hair}"/>`;
  pm.forEach(m => {
    const x = m.i * cw + (cw - bw) / 2; let yy = base;
    if (m.act) svg += `<rect x="${m.i * cw + 2}" y="${top - 14}" width="${cw - 4}" height="${base - top + 14}" fill="${VG_C.cream}" rx="4"/>`;
    ['ambas', 'vc', 'plat'].forEach(k => { const n = m.f[k]; if (!n) return; const hh = n / maxN * (base - top); yy -= hh; svg += `<rect x="${x}" y="${yy}" width="${bw}" height="${hh}" fill="${VG_FUENTE[k].c}"><title>${m.c} ${m.anio} · ${VG_FUENTE[k].l}: ${n}</title></rect>`; });
    if (m.meta) svg += `<line x1="${x - 5}" x2="${x + bw + 5}" y1="${y(m.meta)}" y2="${y(m.meta)}" stroke="${VG_C.ink}" stroke-width="2.4"><title>Meta ${m.c}: ${m.meta}</title></line>`;
    const ok = m.meta && m.n >= m.meta;
    if (m.n || !m.fut) svg += `<text x="${x + bw / 2}" y="${Math.min(yy, m.meta ? y(m.meta) : yy) - 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${m.fut ? VG_C.mute : ok ? VG_C.green : VG_C.ink}">${m.fut && !m.n ? '' : m.n}</text>`;
    svg += `<text x="${x + bw / 2}" y="${base + 15}" text-anchor="middle" font-size="11" font-weight="${m.act ? 700 : 500}" fill="${m.fut ? '#A79E8C' : VG_C.ink}">${m.c}</text>`;
    if (m.meta && !m.fut) svg += `<text x="${x + bw / 2}" y="${base + 28}" text-anchor="middle" font-size="10" fill="${ok ? VG_C.green : VG_C.red}">${ok ? '✓' : (m.n - m.meta)} </text>`;
  });
  const filaMes = (l, f) => `<tr><th>${l}</th>${pm.map(m => `<td class="${m.act ? 'act' : ''}${m.fut ? ' fut' : ''}">${f(m)}</td>`).join('')}</tr>`;
  h.push(`<section class="vg-card"><div class="vg-h"><b>Ventas por mes contra la meta</b><span>barra = ventas del mes por fuente · raya negra = meta de cierres · debajo, cuánto faltó o ✓ si se cumplió</span></div>
    <div class="vg-scroll"><svg viewBox="0 0 ${W} ${H}" class="vg-svg" role="img" aria-label="Ventas por mes de la gestión">${svg}</svg>
    <table class="vg-tm"><tbody>
      ${filaMes('Vendido', m => m.monto ? _vgK(m.monto) : '–')}
      ${filaMes('Ticket', m => m.ticket ? _vgK(m.ticket) : '–')}
      ${filaMes('$/m²', m => m.m2 ? Math.round(m.m2) : '–')}
      ${filaMes('Desc.', m => m.desc ? m.desc.toFixed(1) + '%' : '–')}
      ${filaMes('Meta', m => m.meta || '–')}
    </tbody></table></div>
    <p class="vg-lee">${ventas.length ? `Van <b>${ventas.length}</b> ventas en ${mesesHasta + 1} mes${mesesHasta ? 'es' : ''}: <b>${promMes.toLocaleString('es-BO', { maximumFractionDigits: 1 })}</b> por mes en promedio.${mejor ? ` El mejor mes fue <b>${VG_MESES[mejor.idx].toLowerCase()}</b> con ${mejor.n} venta${mejor.n > 1 ? 's' : ''} (${_vgK(mejor.monto)}).` : ''}${metaGest ? ` La meta de toda la gestión es <b>${metaGest}</b>: faltan <b>${Math.max(0, metaGest - ventas.length)}</b>.` : ''}` : 'Todavía no hay ventas en esta gestión.'}</p>
  </section>`);

  // Por asesor / por modalidad
  const gA = _vgGrupo(ventas, 'asesor'), gM = _vgGrupo(ventas, 'modalidad');
  const tablaG = (titulo, sub, lista, col) => {
    const mx = Math.max(1, ...lista.map(x => x.n));
    return `<section class="vg-card"><div class="vg-h"><b>${titulo}</b><span>${sub}</span></div>${lista.length ? `<div class="vg-scroll"><table class="vg-t"><thead><tr><th class="iz">${col}</th><th class="iz">Ventas</th><th>Vendido</th><th>Ticket</th><th>$/m²</th><th>Desc.</th></tr></thead><tbody>${lista.map(x => `<tr><td class="iz"><b>${_vgE(x.k)}</b></td><td class="iz"><div class="vg-bw"><div class="vg-bar"><i style="width:${x.n / mx * 100}%"></i></div><span><b>${x.n}</b> · ${Math.round(x.n / tot * 100)}%</span></div></td><td>${_vgK(x.monto)}</td><td>${x.ticket ? _vgUsd(x.ticket) : '—'}</td><td>${x.m2 ? Math.round(x.m2) : '—'}</td><td>${x.desc ? x.desc.toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vg-vacio">Sin ventas.</p>'}</section>`;
  };
  h.push(`<div class="vg-row">${tablaG('Por asesor', 'quién vendió y a qué precio', gA, 'Asesor')}${tablaG('Por modalidad', 'cómo pagan', gM, 'Modalidad')}</div>`);

  // Canal y categoría (compacto)
  const chips = (titulo, lista) => `<section class="vg-card"><div class="vg-h"><b>${titulo}</b></div><div class="vg-chips">${lista.map(x => `<div><b>${x.n}</b><span>${_vgE(x.k)}</span><em>${_vgK(x.monto)}</em></div>`).join('') || '<p class="vg-vacio">Sin ventas.</p>'}</div></section>`;
  h.push(`<div class="vg-row">${chips('Por canal de llegada', _vgGrupo(ventas, 'canal'))}${chips('Por categoría de lote', _vgGrupo(ventas, 'categoria'))}</div>`);

  // Detalle
  const q = _vgSin(VG.buscar);
  let det = q ? ventas.filter(v => _vgSin(v.cliente + ' ' + v.terreno + ' ' + v.asesor).includes(q)) : ventas.slice();
  if (VG.orden === 'monto') det.sort((a, b) => b.venta - a.venta);
  h.push(`<section class="vg-card"><div class="vg-h"><b>Detalle de las ${ventas.length} ventas</b><span>
      <input type="search" placeholder="Buscar cliente, terreno o asesor" value="${_vgE(VG.buscar)}" oninput="VG.buscar=this.value;clearTimeout(VG.timer);VG.timer=setTimeout(()=>{vgRender();const i=document.querySelector('#vg-root input[type=search]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},250)">
      <select onchange="VG.orden=this.value;vgRender()"><option value="fecha" ${VG.orden === 'fecha' ? 'selected' : ''}>Más recientes</option><option value="monto" ${VG.orden === 'monto' ? 'selected' : ''}>Mayor monto</option></select></span></div>
    <div class="vg-scroll vg-det"><table class="vg-t"><thead><tr><th class="iz">Fecha</th><th class="iz">Cliente</th><th class="iz">Terreno</th><th class="iz">Asesor</th><th class="iz">Modalidad</th><th>Lista</th><th>Venta</th><th>Desc.</th><th>$/m²</th><th class="iz">Fuente</th></tr></thead><tbody>
    ${det.map(v => `<tr><td class="iz">${v.fecha ? v.fecha.slice(8, 10) + '/' + v.fecha.slice(5, 7) + '/' + v.fecha.slice(2, 4) : '—'}</td><td class="iz">${_vgE(v.cliente)}</td><td class="iz mono">${_vgE(v.terreno)}</td><td class="iz">${_vgE(v.asesor)}${v.cerradoPor ? ` <small>${_vgE(v.cerradoPor)}</small>` : ''}</td><td class="iz">${_vgE(v.modalidad)}</td><td>${v.lista ? _vgUsd(v.lista) : '—'}</td><td><b>${_vgUsd(v.venta)}</b></td><td>${v.desc ? v.desc.toFixed(1) + '%' : '—'}</td><td>${v.m2 ? Math.round(v.m2) : '—'}</td><td class="iz"><span class="vg-f" style="--c:${VG_FUENTE[v.fuente].c}">${VG_FUENTE[v.fuente].l}</span></td></tr>`).join('') || '<tr><td colspan="10" class="iz">Sin resultados.</td></tr>'}
    </tbody></table></div></section>`);

  root.innerHTML = h.join('');
}

function vgExportar() {
  if (typeof XLSX === 'undefined') return typeof toastErr === 'function' ? toastErr('No se pudo exportar.') : null;
  const { ventas, caidas } = vgDatos(VG.gestion);
  const f = v => ({ Fecha: v.fecha, Cliente: v.cliente, Terreno: v.terreno, Asesor: v.asesor, Canal: v.canal, Modalidad: v.modalidad, Categoría: v.categoria, 'Precio lista': v.lista, 'Precio venta': v.venta, 'Desc. %': v.desc, Metraje: v.met, '$/m²': Math.round(v.m2 * 100) / 100, Fuente: v.fuente === 'caida' ? 'Caída' : VG_FUENTE[v.fuente].l });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas.map(f)), 'Ventas gestión');
  if (caidas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(caidas.map(f)), 'Caídas');
  XLSX.writeFile(wb, `Ventas-gestion-${VG.gestion}-${VG.gestion + 1}.xlsx`);
}

/* ── Registro en el menú y refresco ── */
(function () {
  try { TAB_TITLES['ventas-gestion'] = 'Ventas gestión'; } catch (e) {}
  try { NAV_GRUPOS['ventas-gestion'] = 'comercial'; } catch (e) {}
  try { if (MAPA_MODULO_NAV.dashboard && !MAPA_MODULO_NAV.dashboard.includes('nav-ventas-gestion')) MAPA_MODULO_NAV.dashboard.push('nav-ventas-gestion'); } catch (e) {}
  const visible = () => { const p = document.getElementById('panel-ventas-gestion'); return !!p && p.classList.contains('active') && !document.hidden; };
  const prog = () => { clearTimeout(VG._t); VG._t = setTimeout(() => { if (visible()) vgRender(); }, 300); };
  const sw = window.switchAdminTab;
  if (typeof sw === 'function') window.switchAdminTab = function (id, ...a) { const out = sw.call(this, id, ...a); if (id === 'ventas-gestion') vgRender(); return out; };
  ['renderDashboard', 'renderVentasConcretadasAdmin'].forEach(n => { const f = window[n]; if (typeof f === 'function') { const w = function (...a) { const out = f.apply(this, a); prog(); return out; }; Object.assign(w, f); w.__orig = f.__orig || f; window[n] = w; } });
  document.addEventListener('visibilitychange', prog);
})();
