/* ════════════════════════════════════════════════════════════════════════
   EMBUDO DE ASESORES (estilo Pipedrive)
   Cada cliente es una oportunidad que avanza por etapas. La etapa se deduce
   sola de lo que ya se carga (agenda del call center, registro de visita,
   cotización, reserva, descarte) y el asesor la puede mover a mano. Encima
   se suman próximas actividades y notas, guardadas aparte en crm_deals/
   (no se toca ningún registro existente).
   Admin: tablero, resumen por asesor, revisión 1 a 1 para reuniones, lista
   y exportar a Excel. Asesor: pestaña "Mi embudo" con su tablero y su día.
   ════════════════════════════════════════════════════════════════════════ */
const CRM_ETAPAS = [
  { id: 'agendado', n: 'Agendado', p: .10, c: '#8FC7B8' },
  { id: 'visito', n: 'Visitó', p: .20, c: '#C9B98F' },
  { id: 'cotizado', n: 'Cotizado', p: .35, c: '#E0B865' },
  { id: 'negociacion', n: 'Negociación', p: .60, c: '#D88B6E' },
  { id: 'reserva', n: 'Reserva', p: 1, c: '#5E8F5A' },
  { id: 'perdido', n: 'Descartado', p: 0, c: '#8F8676' },
];
const CRM_RANK = Object.fromEntries(CRM_ETAPAS.map((e, i) => [e.id, i]));
const CRM_ACT = ['Llamada', 'WhatsApp', 'Visita al proyecto', 'Reunión', 'Enviar cotización', 'Seguimiento'];
const CRM_DIAS_ESTANCADO = 7;
const crm = { store: {}, deals: [], porId: {}, vista: 'tablero', f: { ases: '', per: 'abiertos', q: '', cal: '' }, modo: 'admin', sort: { k: 'valor', d: -1 }, escuchando: false };
const _crmId = s => _cbN(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sin-nombre';
const _crmHoy = () => new Date().toISOString().slice(0, 10);
const _crmDias = ts => ts ? Math.floor((Date.now() - ts) / 864e5) : null;
const _crmIni = s => String(s || '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

function crmEscuchar() {
  if (crm.escuchando || !window._fbCrm) return; crm.escuchando = true;
  window._fbCrm.listen(v => { crm.store = v || {}; crmRefrescar(); });
}

/* ── Arma las oportunidades a partir de lo que el sistema ya tiene ── */
function crmConstruir() {
  const asesor = crm.modo === 'asesor' && typeof asesorActual !== 'undefined' && asesorActual ? asesorActual.nombre : null;
  const regs = asesor ? _decArr('misRegs') : crm.modo === 'cc' && typeof CC !== 'undefined' && CC.regs ? CC.regs : _decArr('todosRegs');
  // si no cambió ningún dato (ni pasó un minuto), se reutiliza lo ya armado: se llama desde varios lugares a la vez
  const memo = [regs, _decG('cotizacionesData'), _decG('visitasProgramadasData'), crm.store, typeof PADRON !== 'undefined' ? PADRON.data : null, _decG('todosLotes'), crm.modo, asesor, Math.floor(Date.now() / 60000)];
  if (crm.memo && crm.deals.length && memo.every((x, i) => x === crm.memo[i])) return crm.deals;
  crm.memo = memo;
  // cada oportunidad es un cliente único (padrón UV-C-…): une registro, cotizaciones y agendas aunque el nombre esté escrito distinto
  const cots = _decArr('cotizacionesData').filter(c => c.cliente && (!asesor || c.asesorNombre === asesor || c.creadoPorNombre === asesor));
  const vis = _decArr('visitasProgramadasData').filter(v => v.nombre && (!asesor || v.asesorNombre === asesor));
  const A = padronAgrupar(regs.filter(r => r.nombre), cots, vis), G = {}; crm.nodo = {};
  Object.entries(A.N).forEach(([nid, o]) => { const grp = A.G[A.deNodo[nid]], id = grp.cod || _crmId(grp.nom); crm.nodo[nid] = id;
    const d = (G[id] = G[id] || { id, cod: grp.cod, items: [], nombres: {}, nodos: [] }); d.nombres[o.nom] = 1; d.nodos.push(nid); const r = o.r;
    if (o.t === 'reg') { const ts = _cbTs(r.ts, r.fecha); d.items.push({ t: 'reg', nid, ts, te: Math.max(ts, (r.conclusion === 'Descartado' || r.conclusion === 'Reserva') && r.conclusionTs > 1e11 ? r.conclusionTs : 0), r }); }
    else if (o.t === 'cot') d.items.push({ t: 'cot', nid, ts: r.ts || 0, r });
    else d.items.push({ t: 'vis', nid, ts: r.ts > 1e11 ? r.ts : _cbTs(0, r.fecha), r }); });
  const lotes = {}; _decArr('todosLotes').forEach(l => { lotes[_cbN(typeof _terrenoDeLote === 'function' ? _terrenoDeLote(l) : l.terreno)] = l; });
  const out = [];
  Object.values(G).forEach(d => {
    d.items.forEach(x => { if (!x.te) x.te = x.ts; }); d.items.sort((a, b) => a.ts - b.ts);
    const regsD = d.items.filter(x => x.t === 'reg'), cotsD = d.items.filter(x => x.t === 'cot'), visD = d.items.filter(x => x.t === 'vis');
    const ult = d.items[d.items.length - 1], ultReg = regsD[regsD.length - 1]?.r, ultCot = cotsD[cotsD.length - 1]?.r;
    const ultTe = Math.max(0, ...d.items.filter(x => !(x.t === 'vis' && x.r.esDevolucion)).map(x => x.te)), regE = regsD.slice().sort((a, b) => a.te - b.te).pop();
    const SK = [...new Set([d.id, ...Object.keys(d.nombres).map(_crmId)])].filter(k => crm.store[k]), st = crmStoreUnido(SK);
    // visitas presenciales del cliente (de todos sus registros), numeradas
    const visitas = regsD.flatMap(x => (typeof visitasDeRegistro === 'function' ? visitasDeRegistro(x.r) : []).map(e => ({ ...e, as: e.por || x.r.asesorNombre || '' }))).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.ts - b.ts);
    visitas.forEach((e, i) => { e.n = i + 1; });
    // etapa automática
    let auto = 'agendado', autoTs = d.items[0]?.ts || 0, motivo = '';
    const res = regsD.find(x => typeof _esCierreVenta === 'function' ? _esCierreVenta(x.r) : x.r.conclusion === 'Reserva');
    if (res) { auto = 'reserva'; autoTs = res.te; }
    else {
      if (visitas.length) { auto = 'visito'; autoTs = visitas[0].ts; }
      if (cotsD.length) { auto = 'cotizado'; autoTs = cotsD[0].ts; }
      const caliente = cotsD.some(x => (x.r.vistas || 0) >= 2) || (ultReg && (ultReg.calificacion === 'A' || (ultReg.pctCierre || 0) >= 60));
      if (caliente && (visitas.length || cotsD.length)) { auto = 'negociacion'; autoTs = ultTe; }
      // descartado: el último registro dice Descartado y después no hubo otra visita, cotización ni asignación nueva
      if (regE && regE.r.conclusion === 'Descartado' && !d.items.some(x => x !== regE && x.te > regE.te && !(x.t === 'vis' && x.r.esDevolucion))) { auto = 'perdido'; autoTs = regE.te; motivo = regE.r.motivoNoCierre || regE.r.motivoDescarte || ''; }
    }
    let etapa = auto, desde = autoTs;
    if (st.etapa && CRM_RANK[st.etapa] != null && auto !== 'reserva') {
      if (ultTe > (st.etapaTs || 0)) { if (CRM_RANK[auto] > CRM_RANK[st.etapa] || st.etapa === 'perdido') { etapa = auto; } else { etapa = st.etapa; desde = st.etapaTs; } }
      else { etapa = st.etapa; desde = st.etapaTs; }
    }
    if (st.etapa === 'perdido' && etapa === 'perdido') motivo = st.motivo || motivo;
    const acts = Object.entries(st.act || {}).map(([k, a]) => ({ k, ...a })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora || '').localeCompare(b.hora || ''));
    const pend = acts.filter(a => !a.hecho), prox = pend[0] || null;
    const notas = Object.entries(st.notas || {}).map(([k, n]) => ({ k, ...n })).sort((a, b) => b.ts - a.ts);
    const ultAct = Math.max(ultTe, ...acts.map(a => a.hechoTs || a.ts || 0), ...notas.map(n => n.ts || 0));
    const owner = (d.items.slice().reverse().find(x => x.r.asesorNombre)?.r.asesorNombre) || '';
    const ter = ultCot?.terreno || ultReg?.terrenoInteres || '';
    const valor = ultCot?.precioFinal || (res ? (res.r.precioVenta || res.r.precio || 0) : 0) || ultReg?.presupuesto || lotes[_cbN(ter)]?.precio || 0;
    const nombre = Object.keys(d.nombres).sort((a, b) => b.length - a.length)[0];
    const abierto = etapa !== 'reserva' && etapa !== 'perdido';
    const asig = visD.filter(x => !x.r.esDevolucion);
    out.push({ id: d.id, cod: d.cod || '', nodos: d.nodos, st, SK, visitas, cots: cotsD.map(x => x.r), nombre, items: d.items, etapa, auto, desde, motivo, acts, prox, notas, ultAct, owner, ter, valor,
      tel: ultReg?.celular || ultReg?.telefono || ultCot?.celular || visD[visD.length - 1]?.r.telefono || '',
      cal: ultReg?.calificacion || '', pct: ultReg?.pctCierre || 0, origen: d.items.find(x => x.r.origen)?.r.origen || '', creado: d.items[0]?.ts || 0,
      vistas: Math.max(0, ...cotsD.map(x => x.r.vistas || 0)), ultCot, cc: asig.length ? (asig[asig.length - 1].r.cargadoPorNombre || 'Call center') : '', ccTs: asig.length ? asig[asig.length - 1].ts : 0,
      estancado: abierto && _crmDias(ultAct) > CRM_DIAS_ESTANCADO, vencida: prox && prox.fecha && prox.fecha < _crmHoy(), sinProx: abierto && !prox, abierto,
      pond: valor * (CRM_ETAPAS[CRM_RANK[etapa]].p) });
  });
  crm.deals = out; crm.porId = Object.fromEntries(out.map(x => [x.id, x]));
  return out;
}
/* Quiénes son asesores comerciales (el admin los elige; si no eligió, los usuarios con rol Vendedor) */
function crmAsesoresOK() {
  const c = crm.store._config?.asesores; if (c && Object.keys(c).length) return new Set(Object.values(c));
  const v = _decArr('asesores').filter(a => a.rol === 'ventas').map(a => a.nombre); return v.length ? new Set(v) : null;
}
function crmEsAsesor(n) { if (crm.modo === 'asesor' || crm.f.otros) return true; const OK = crmAsesoresOK(); return !OK || OK.has(n); }
function crmConfigAsesores() {
  const c = crm.store._config?.asesores, OK = crmAsesoresOK() || new Set();
  const us = _decArr('asesores').slice().sort((a, b) => String(a.nombre).localeCompare(b.nombre));
  crmModal(`<h3>Asesores del embudo</h3><p class="crm-sub">Marcá solo a quienes atienden clientes. El resto de los usuarios (call center, marketing, gerencia, ex asesores) no aparece en el tablero, en las tablas por asesor ni en el reparto de turnos.${c ? '' : ' Ahora se toman por defecto los usuarios con rol Vendedor.'}</p>
    <div class="crm-ases">${us.map(a => `<label><input type="checkbox" value="${_cbEsc(a._key)}" data-n="${_cbEsc(a.nombre)}" ${OK.has(a.nombre) ? 'checked' : ''}> <b>${_cbEsc(a.nombre)}</b> <span>${_cbEsc((typeof ROL_LABELS !== 'undefined' && ROL_LABELS[a.rol]?.label) || a.rol || '')}</span></label>`).join('')}</div>
    <div class="crm-acc"><button type="button" class="p" onclick="crmGuardarAsesores()">Guardar</button><button type="button" onclick="crmModal(null)">Cancelar</button></div>`);
}
async function crmGuardarAsesores() {
  const m = {}; document.querySelectorAll('.crm-ases input:checked').forEach(i => { m[i.value] = i.dataset.n; });
  if (!Object.keys(m).length) { toastErr?.('Marcá al menos un asesor.'); return; }
  try { await window._fbCrm.update('_config', { asesores: m, asesoresTs: Date.now() }); crmModal(null); toastOk?.('Asesores del embudo guardados.'); } catch (e) { toastErr?.('No se pudo guardar.'); }
}

/* ── Eliminar un lead (pruebas, duplicados): el asesor o el call center lo piden, el administrador aprueba ── */
function crmPartesDe(d) {
  const f = s => s ? String(s).split('-').reverse().join('/') : '';
  const out = d.items.map(x => { const r = x.r;
    const de = [r.asesorNombre, r.cargadoPorNombre, r.creadoPorNombre].filter(Boolean);
    if (x.t === 'reg') return r._asesorId && r._key ? { de, path: `planilla/${r._asesorId}/${r._key}`, t: `Visita registrada ${f(r.fecha)} · ${r.conclusion || 'sin conclusión'} · ${r.asesorNombre || ''}`, res: r.conclusion === 'Reserva' ? (r.terrenoInteres || r.terreno || 'sí') : '' } : null;
    if (x.t === 'cot') return r._key ? { de, path: `cotizaciones/${r._key}`, t: `Cotización ${r.codigo || ''} · ${r.asesorNombre || ''}` } : null;
    return r._key ? { de, path: `visitas_programadas/${r._key}`, t: `${r.esDevolucion ? 'Devolución al call center' : 'Agenda del call center'} ${f(r.fecha)} → ${r.asesorNombre || ''}` } : null; }).filter(Boolean);
  (d.SK || []).forEach(k => out.push({ path: `crm_deals/${k}`, t: 'Etapa, actividades y notas del embudo' }));
  return out;
}
function crmPedirEliminar(id) {
  const d = crm.porId[id]; if (!d) return;
  if (crm.modo === 'admin') { crmEliminarAbrir(id); return; }
  if (d.st?.elimPedida) { toastOk?.('Ya hay una solicitud pendiente para este cliente.'); return; }
  crmModal(`<h3>Solicitar eliminar a ${_cbEsc(d.nombre)}</h3><p class="crm-sub">No se borra al toque: le llega al administrador y recién cuando aprueba se elimina el cliente con sus registros.</p>
    <div class="crm-chips">${['Era de prueba', 'Cliente duplicado', 'Datos equivocados'].map(m => `<button type="button" onclick="document.getElementById('crm-elm').value='${m}'">${m}</button>`).join('')}</div>
    <input id="crm-elm" class="crm-in" placeholder="Motivo" style="width:100% !important">
    <div class="crm-acc" style="margin-top:10px"><button type="button" class="p" onclick="crmEnviarSolicitud('${id}')">Enviar solicitud</button><button type="button" onclick="crmDetalle('${id}')">Volver</button></div>`);
}
async function crmEnviarSolicitud(id) {
  const d = crm.porId[id], mot = document.getElementById('crm-elm')?.value.trim(); if (!d) return;
  if (!mot) { toastErr?.('Escribí el motivo.'); return; }
  const yo = typeof asesorActual !== 'undefined' && asesorActual ? asesorActual : null, n = crmPartesDe(d).length;
  try {
    await window._fbPushSolicitudEliminacion({ coleccionPath: 'crmlead:' + id, descripcion: `Lead del embudo: ${d.nombre} (${n} registro${n !== 1 ? 's' : ''}) — ${mot}`, solicitadoPorKey: yo?._key || '', solicitadoPorNombre: yo?.nombre || '', leadNombre: d.nombre, motivo: mot });
    await window._fbCrm.update(id, { nombre: d.nombre, elimPedida: { ts: Date.now(), por: yo?.nombre || '', motivo: mot } });
    crmModal(null); toastOk?.('Solicitud enviada: queda pendiente de tu administrador.');
  } catch (e) { toastErr?.('No se pudo enviar la solicitud.'); }
}
function crmSolicitudes() { return _decArr('solicitudesEliminacionData').filter(s => s.estado === 'pendiente' && String(s.coleccionPath || '').startsWith('crmlead:')); }
function crmVerSolicitudes() {
  const S = crmSolicitudes();
  crmModal(`<h3>Solicitudes para eliminar leads</h3>${S.length ? S.map(s => `<div class="crm-sol"><div><b>${_cbEsc(s.leadNombre || s.descripcion)}</b><span>${_cbEsc(s.motivo || s.descripcion)} · pedido por ${_cbEsc(s.solicitadoPorNombre || '—')} · ${new Date(s.ts).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><div class="crm-acc"><button type="button" class="p" onclick="crmEliminarAbrir('${_cbEsc(s.coleccionPath.slice(8))}','${s._key}')">Revisar</button><button type="button" onclick="crmRechazar('${s._key}','${_cbEsc(s.coleccionPath.slice(8))}')">Rechazar</button></div></div>`).join('') : '<p class="crm-vacio">No hay solicitudes pendientes.</p>'}`);
}
function crmEliminarAbrir(id, solKey) {
  crmConstruir(); const d = crm.porId[id];
  if (!d) { crmModal(`<h3>Ese cliente ya no está en el embudo</h3><p class="crm-sub">Puede que ya se haya borrado o le cambiaron el nombre.</p><div class="crm-acc">${solKey ? `<button type="button" class="p" onclick="window._fbResolverSolicitudEliminacion('${solKey}',true).then(()=>crmModal(null))">Cerrar la solicitud</button>` : ''}<button type="button" onclick="crmModal(null)">Cancelar</button></div>`); return; }
  const P = crmPartesDe(d), sol = solKey ? crmSolicitudes().find(s => s._key === solKey) : null, quien = sol?.solicitadoPorNombre || '';
  // si lo pidió un asesor o el call center, vienen marcados solo sus propios registros (con el mismo nombre puede haber otro cliente real)
  P.forEach(p => { p.on = !quien || !p.de || p.de.includes(quien) || p.path.startsWith('crm_deals/'); });
  const res = P.filter(p => p.res && p.on), ajenos = P.filter(p => !p.on).length;
  crmModal(`<h3>Eliminar a ${_cbEsc(d.nombre)}</h3><p class="crm-sub">${sol ? `Pedido por <b>${_cbEsc(sol.solicitadoPorNombre || '—')}</b>: ${_cbEsc(sol.motivo || sol.descripcion)}. ` : ''}Se borran definitivamente los registros marcados. Si alguno es de otro cliente con el mismo nombre, desmarcalo.${ajenos ? ` <b>${ajenos} registro${ajenos !== 1 ? 's' : ''} de otros usuarios ${ajenos !== 1 ? 'quedaron' : 'quedó'} sin marcar.</b>` : ''}</p>
    <div class="crm-ases crm-elim">${P.map((p, i) => `<label><input type="checkbox" value="${_cbEsc(p.path)}" ${p.on ? 'checked' : ''}> ${_cbEsc(p.t)}${p.res ? ' <b class="low">· reserva</b>' : ''}</label>`).join('')}</div>
    ${res.length ? `<p class="crm-warn">⚠ Tiene una reserva: el lote ${_cbEsc(res.map(p => p.res).join(', '))} sigue apartado en Inventario; liberalo desde ahí si era de prueba.</p>` : ''}
    <div class="crm-acc"><button type="button" class="p crm-del" onclick="crmEliminarEjecutar('${id}','${solKey || ''}')">Eliminar marcados</button>${solKey ? `<button type="button" onclick="crmRechazar('${solKey}','${id}')">Rechazar solicitud</button>` : ''}<button type="button" onclick="crmModal(null)">Cancelar</button></div>`);
}
async function crmEliminarEjecutar(id, solKey) {
  const paths = [...document.querySelectorAll('.crm-elim input:checked')].map(i => i.value); if (!paths.length) { toastErr?.('No marcaste nada.'); return; }
  try { for (const p of paths) await window._fbRemoveGenerico(p); if (!paths.includes('crm_deals/' + id) && crm.porId[id]?.st?.elimPedida) await window._fbCrm.update(id, { elimPedida: null });
    if (solKey) await window._fbResolverSolicitudEliminacion(solKey, true); crmModal(null); toastOk?.(`Eliminado${paths.length > 1 ? 's ' + paths.length + ' registros' : ''}.`); }
  catch (e) { toastErr?.('No se pudo eliminar: ' + (e.message || 'revisá la conexión.')); }
}
async function crmRechazar(solKey, id) {
  try { await window._fbResolverSolicitudEliminacion(solKey, false); if (id && crm.porId[id]?.st?.elimPedida) await window._fbCrm.update(id, { elimPedida: null }); crmModal(null); toastOk?.('Solicitud rechazada: el cliente sigue igual.'); } catch (e) {}
}

/* Lo guardado en el embudo para un cliente (por código y por los nombres viejos), unido */
function crmStoreUnido(SK) {
  if (SK.length <= 1) { const s = crm.store[SK[0]] || {}; return { ...s, act: Object.fromEntries(Object.entries(s.act || {}).map(([k, a]) => [k, { ...a, _src: SK[0] }])) }; }
  const m = { act: {}, notas: {} };
  SK.forEach(k => { const s = crm.store[k] || {}; Object.entries(s.act || {}).forEach(([ak, a]) => { m.act[ak] = { ...a, _src: k }; }); Object.assign(m.notas, s.notas || {});
    if ((s.etapaTs || 0) > (m.etapaTs || 0)) Object.assign(m, { etapa: s.etapa, etapaTs: s.etapaTs, motivo: s.motivo, movidoPor: s.movidoPor }); if (s.elimPedida) m.elimPedida = s.elimPedida; });
  return m;
}
function crmFiltrados() {
  const F = crm.f, q = _cbN(F.q), now = Date.now(), g0 = _decGestion0(), m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  return crm.deals.filter(d => {
    if (F.ases && crm.modo === 'admin' && d.owner !== F.ases) return false;
    if (crm.modo === 'admin' && !crmEsAsesor(d.owner)) return false;
    if (F.cal && d.cal !== F.cal) return false;
    if (F.src === 'cc' && !d.cc) return false; if (F.src === 'propio' && d.cc) return false;
    if (q && ![d.nombre, d.ter, d.owner, d.tel, d.origen].some(v => _cbN(v).includes(q))) return false;
    if (F.per === 'abiertos') return d.abierto || now - d.desde < 30 * 864e5;
    if (F.per === 'mes') return d.ultAct >= m0;
    if (F.per === 'gestion') return d.ultAct >= g0;
    return true;
  });
}

/* ── Guardar cambios del asesor (etapa, actividad, nota) ── */
function _crmPor() { return crm.modo === 'asesor' && typeof asesorActual !== 'undefined' && asesorActual ? asesorActual.nombre : 'Administrador'; }
async function crmMover(id, etapa, motivo) {
  const d = crm.porId[id]; if (!d || d.etapa === etapa) return;
  if (etapa === 'perdido' && motivo == null) { crmPerdido(id); return; }
  if (etapa === 'reserva' && d.auto !== 'reserva') { if (!confirm('La reserva se registra en "Cargar" con la conclusión Reserva (así entra en ventas y metas). ¿Marcarla igual en el embudo?')) return; }
  try { await window._fbCrm.update(d.id, { etapa, etapaTs: Date.now(), motivo: motivo || '', movidoPor: _crmPor(), nombre: d.nombre }); toastOk?.(`${d.nombre} → ${CRM_ETAPAS[CRM_RANK[etapa]].n}`); } catch (e) { toastErr?.('No se pudo guardar.'); }
}
function crmPerdido(id) {
  const d = crm.porId[id]; if (!d) return;
  crmModal(`<h3>¿Por qué se descartó ${_cbEsc(d.nombre)}?</h3><div class="crm-chips">${['Precio', 'Ubicación', 'Financiamiento', 'Compró en otro lado', 'No contesta', 'Solo curioseaba', 'Tiempo para decidir'].map(m => `<button type="button" onclick="document.getElementById('crm-mot').value='${m}'">${m}</button>`).join('')}</div>
    <input id="crm-mot" class="crm-in" placeholder="Motivo"><div class="crm-acc"><button type="button" class="p" onclick="crmMover('${id}','perdido',document.getElementById('crm-mot').value||'Sin motivo');crmModal(null)">Marcar como descartado</button><button type="button" onclick="crmModal(null)">Cancelar</button></div>`);
}
async function crmGuardarAct(id, k) {
  const v = n => document.getElementById(n)?.value || '';
  const data = { tipo: v('crm-a-tipo'), fecha: v('crm-a-fecha'), hora: v('crm-a-hora'), nota: v('crm-a-nota').trim(), hecho: false, ts: Date.now(), por: _crmPor() };
  if (!data.fecha) { toastErr?.('Elegí la fecha.'); return; }
  const d = crm.porId[id];
  try { if (k) await window._fbCrm.update(d.id + '/act/' + k, data); else await window._fbCrm.push(d.id, 'act', data); await window._fbCrm.update(d.id, { nombre: d.nombre }); crmDetalle(id); } catch (e) { toastErr?.('No se pudo guardar.'); }
}
async function crmHecho(id, k, hecho) { const d = crm.porId[id], src = d.acts.find(a => a.k === k)?._src || d.id; try { await window._fbCrm.update(src + '/act/' + k, { hecho, hechoTs: hecho ? Date.now() : null }); setTimeout(() => crmDetalle(id), 150); } catch (e) {} }
async function crmNota(id) {
  const t = document.getElementById('crm-nota')?.value.trim(); if (!t) return; const d = crm.porId[id];
  try { await window._fbCrm.push(d.id, 'notas', { txt: t, ts: Date.now(), por: _crmPor() }); await window._fbCrm.update(d.id, { nombre: d.nombre }); setTimeout(() => crmDetalle(id), 150); } catch (e) { toastErr?.('No se pudo guardar.'); }
}

/* ── Pintado ── */
function crmModal(html) {
  let m = document.getElementById('crm-modal');
  if (!m) { m = document.createElement('div'); m.id = 'crm-modal'; m.className = 'crm-modal'; m.onclick = e => { if (e.target === m) crmModal(null); }; document.body.appendChild(m); }
  if (html == null) { m.classList.remove('on'); return; }
  m.innerHTML = `<div class="crm-modal-c"><button type="button" class="crm-x" onclick="crmModal(null)">×</button>${html}</div>`; m.classList.add('on');
}
function _crmCard(d) {
  const e = CRM_ETAPAS[CRM_RANK[d.etapa]], dias = _crmDias(d.desde);
  const px = d.prox ? `<span class="crm-px ${d.vencida ? 'venc' : d.prox.fecha === _crmHoy() ? 'hoy' : ''}" title="${_cbEsc(d.prox.tipo + ' · ' + d.prox.fecha + (d.prox.nota ? ' · ' + d.prox.nota : ''))}">${d.vencida ? '⚠ ' : ''}${_cbEsc(d.prox.tipo)} ${d.prox.fecha.slice(8, 10)}/${d.prox.fecha.slice(5, 7)}</span>` : d.abierto ? '<span class="crm-px sin">sin próxima actividad</span>' : '';
  return `<div class="crm-card${d.estancado ? ' rot' : ''}" draggable="true" data-id="${d.id}" ondragstart="event.dataTransfer.setData('text',this.dataset.id);this.classList.add('drag')" ondragend="this.classList.remove('drag')" onclick="crmDetalle('${d.id}')">
    <div class="t"><b>${_cbEsc(d.nombre)}</b>${d.cal ? `<i class="cal c${d.cal}">${d.cal}</i>` : ''}</div>
    <div class="m"><span>${d.valor ? _decUsdK(d.valor) : 'sin valor'}</span>${d.ter ? `<span>${_cbEsc(d.ter)}</span>` : ''}${d.visitas.length ? `<span class="nv" title="Visitas presenciales">${d.visitas.length} vis.</span>` : ''}${d.cots.length ? `<span class="nv" title="Cotizaciones">${d.cots.length} cot.</span>` : ''}${d.cc ? `<span class="cc-ic" title="Asignado por ${_cbEsc(d.cc)}">📞</span>` : ''}${d.vistas >= 2 ? `<span class="hot" title="Abrió la cotización ${d.vistas} veces">🔥 ${d.vistas}</span>` : ''}</div>
    <div class="f">${crm.modo === 'admin' ? `<em title="${_cbEsc(d.owner)}">${_crmIni(d.owner) || '—'}</em>` : ''}${px}<small title="Días en esta etapa${d.estancado ? ' · sin movimiento hace ' + _crmDias(d.ultAct) + ' días' : ''}">${dias != null ? dias + ' d' : ''}</small></div>
    ${d.etapa === 'perdido' && d.motivo ? `<div class="mot">${_cbEsc(d.motivo)}</div>` : ''}</div>`;
}
function crmTableroHTML(L) {
  return `<div class="crm-board">${CRM_ETAPAS.map(e => { const l = L.filter(d => d.etapa === e.id).sort((a, b) => (b.estancado - a.estancado) || (b.vencida - a.vencida) || b.valor - a.valor);
    return `<div class="crm-col" style="--c:${e.c}" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="event.preventDefault();this.classList.remove('over');crmMover(event.dataTransfer.getData('text'),'${e.id}')">
      <header><b>${e.n}</b><span>${l.length}</span><em>${_decUsdK(l.reduce((s, d) => s + d.valor, 0))}</em></header><div class="crm-cards">${l.slice(0, 120).map(_crmCard).join('') || '<p class="crm-vacio">—</p>'}${l.length > 120 ? `<p class="crm-vacio">y ${l.length - 120} más (usá el buscador)</p>` : ''}</div></div>`; }).join('')}</div>`;
}
/* Actividad de un mes (visitas, cotizaciones, reservas), contada por el asesor que la hizo — no depende de la etapa en que esté hoy el cliente */
const _crmYM = ts => { if (!ts) return ''; const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
function crmMes() { return crm.f.mes || _crmYM(Date.now()); }
function crmActividad(mes) {
  const A = {}, F = crm.f, ok = n => crm.modo !== 'admin' || ((!F.ases || n === F.ases) && crmEsAsesor(n));
  const o = n => (A[n] = A[n] || { vis: 0, vis2: 0, cli: new Set(), cots: 0, cotAb: 0, cotCli: new Set(), res: 0 });
  crm.deals.forEach(d => {
    d.visitas.forEach(e => { if ((e.fecha || '').slice(0, 7) === mes && ok(e.as)) { const x = o(e.as); x.vis++; if (e.n >= 2) x.vis2++; x.cli.add(d.id); } });
    d.cots.forEach(c => { const n = c.asesorNombre || ''; if (_crmYM(c.ts) === mes && ok(n)) { const x = o(n); x.cots++; if ((c.vistas || 0) > 0) x.cotAb++; x.cotCli.add(d.id); } });
    d.items.forEach(x => { if (x.t === 'reg' && (typeof _esCierreVenta === 'function' ? _esCierreVenta(x.r) : x.r.conclusion === 'Reserva') && _crmYM(x.te) === mes && ok(x.r.asesorNombre)) o(x.r.asesorNombre).res++; });
  });
  delete A['']; return A;
}
function _crmSum(A) { const t = { vis: 0, vis2: 0, cli: new Set(), cots: 0, cotAb: 0, cotCli: new Set(), res: 0 }; Object.values(A).forEach(x => { t.vis += x.vis; t.vis2 += x.vis2; t.cots += x.cots; t.cotAb += x.cotAb; t.res += x.res; x.cli.forEach(c => t.cli.add(c)); x.cotCli.forEach(c => t.cotCli.add(c)); }); return t; }
function _crmMesNombre(m) { const [y, mm] = m.split('-'); return (typeof VIS_MESES !== 'undefined' ? VIS_MESES[+mm - 1] : mm) + ' ' + y; }
function crmResumenHTML(L) {
  const T = _crmSum(crmActividad(crmMes())), k0 = (l, v, t) => `<div class="kpi-card crm-k"${t ? ` title="${_cbEsc(t)}"` : ''}><div class="kpi-label">${l}</div><div class="kpi-num">${v}</div></div>`;
  const act = `<div class="crm-sec">Actividad de ${_crmMesNombre(crmMes())}</div><div class="crm-kg">${[k0('Visitas presenciales', T.vis, 'Cada vez que un cliente fue al proyecto, también la 2ª, 3ª…'), k0('Clientes que visitaron', T.cli.size), k0('Volvieron (2ª visita o más)', T.vis2),
    k0('Cotizaciones enviadas', T.cots), k0('Clientes cotizados', T.cotCli.size), k0('Cotizaciones abiertas por el cliente', T.cotAb), k0('Reservas', T.res), k0('Visita → reserva', _decFmtPct(_decPct(T.res, T.cli.size)), 'Reservas del mes sobre clientes que visitaron en el mes')].join('')}</div><div class="crm-sec">Embudo ahora</div>`;
  const ab = L.filter(d => d.abierto), g = L.filter(d => d.etapa === 'reserva'), p = L.filter(d => d.etapa === 'perdido');
  const k = (l, v, t, cls = '') => `<div class="kpi-card crm-k ${cls}"${t ? ` title="${_cbEsc(t)}"` : ''}><div class="kpi-label">${l}</div><div class="kpi-num">${v}</div></div>`;
  return act + `<div class="crm-kg">${[k('Oportunidades abiertas', ab.length), k('Valor en juego', _decUsdK(ab.reduce((s, d) => s + d.valor, 0))), k('Valor ponderado', _decUsdK(ab.reduce((s, d) => s + d.pond, 0)), 'Valor × probabilidad de cada etapa'),
    k('Reservas', g.length), k('Tasa de cierre', _decFmtPct(_decPct(g.length, g.length + p.length)), 'Reservas sobre oportunidades cerradas (reservas + descartadas)'),
    k('Estancadas', ab.filter(d => d.estancado).length, 'Abiertas sin ningún movimiento en ' + CRM_DIAS_ESTANCADO + ' días', ab.some(d => d.estancado) ? 'mal' : ''),
    k('Sin próxima actividad', ab.filter(d => d.sinProx).length, 'Nadie sabe qué sigue con estos clientes', ab.some(d => d.sinProx) ? 'mal' : ''), k('Actividades vencidas', ab.filter(d => d.vencida).length, '', ab.some(d => d.vencida) ? 'mal' : '')].join('')}</div>`;
}
function crmAsesoresHTML(L) {
  const A = {}; L.forEach(d => { const k = d.owner || 'Sin asesor'; (A[k] = A[k] || []).push(d); });
  const filas = Object.entries(A).map(([n, l]) => { const ab = l.filter(d => d.abierto), g = l.filter(d => d.etapa === 'reserva'), p = l.filter(d => d.etapa === 'perdido');
    const t = g.filter(d => d.creado && d.desde).map(d => (d.desde - d.creado) / 864e5); return { n, l, ab, g, p, pond: ab.reduce((s, d) => s + d.pond, 0), tasa: _decPct(g.length, g.length + p.length), est: ab.filter(d => d.estancado).length, sin: ab.filter(d => d.sinProx).length, ven: ab.filter(d => d.vencida).length, ciclo: t.length ? Math.round(t.reduce((s, v) => s + v, 0) / t.length) : null }; })
    .sort((a, b) => b.pond - a.pond);
  const mx = Math.max(1, ...filas.map(f => f.l.length)), AC = crmActividad(crmMes()), ac = n => AC[n] || { vis: 0, vis2: 0, cli: new Set(), cots: 0, res: 0 };
  return `<div class="crm-scroll"><table class="dec-t crm-ta"><thead><tr><th>Asesor</th><th>Embudo</th><th title="Visitas presenciales en ${_crmMesNombre(crmMes())}">Visitas mes</th><th title="Visitas de clientes que volvieron">2ª o más</th><th title="Cotizaciones enviadas en el mes">Cotiz. mes</th><th>Abiertas</th><th>Ponderado</th><th>Reservas</th><th>Descartadas</th><th>Tasa cierre</th><th>Días a reserva</th><th>Estancadas</th><th>Sin próx. act.</th><th>Vencidas</th><th></th></tr></thead><tbody>${filas.map(f => `<tr>
    <td><b>${_cbEsc(f.n)}</b></td><td><div class="crm-mini" style="width:${Math.max(18, f.l.length * 100 / mx)}%">${CRM_ETAPAS.map(e => { const n = f.l.filter(d => d.etapa === e.id).length; return n ? `<i style="flex:${n};background:${e.c}" title="${e.n}: ${n}"></i>` : ''; }).join('')}</div></td>
    <td><b>${ac(f.n).vis || '—'}</b></td><td>${ac(f.n).vis2 || '—'}</td><td>${ac(f.n).cots || '—'}</td><td>${f.ab.length}</td><td>${_decUsdK(f.pond)}</td><td><b>${f.g.length || '—'}</b></td><td>${f.p.length || '—'}</td><td>${_decFmtPct(f.tasa)}</td><td>${f.ciclo != null ? f.ciclo : '—'}</td>
    <td class="${f.est ? 'low' : ''}">${f.est || '—'}</td><td class="${f.sin ? 'low' : ''}">${f.sin || '—'}</td><td class="${f.ven ? 'low' : ''}">${f.ven || '—'}</td>
    <td><button type="button" class="crm-btn" onclick="crmFiltro('ases',${JSON.stringify(f.n).replace(/"/g, '&quot;')});crmVista('revision')">Revisión 1 a 1</button></td></tr>`).join('')}</tbody></table></div>`;
}
/* Revisión 1 a 1: los temas de la reunión, armados solos */
function crmRevisionHTML(L) {
  if (!crm.f.ases) return '<p class="crm-vacio">Elegí un asesor arriba (o tocá "Revisión 1 a 1" en la vista Por asesor).</p>';
  const ab = L.filter(d => d.abierto), m0 = Date.now() - 30 * 864e5;
  const bloque = (t, sub, l, extra) => l.length ? `<div class="crm-rv"><h4>${t} <span>${l.length}</span></h4><p>${sub}</p>${l.slice(0, 12).map(d => `<button type="button" onclick="crmDetalle('${d.id}')"><b>${_cbEsc(d.nombre)}</b><span>${CRM_ETAPAS[CRM_RANK[d.etapa]].n} · ${d.valor ? _decUsdK(d.valor) : 'sin valor'}${extra ? ' · ' + extra(d) : ''}</span></button>`).join('')}</div>` : '';
  const perd = L.filter(d => d.etapa === 'perdido' && d.desde >= m0), mot = {}; perd.forEach(d => { const k = d.motivo || 'Sin motivo'; mot[k] = (mot[k] || 0) + 1; });
  const g = L.filter(d => d.etapa === 'reserva' && d.desde >= m0);
  return `<div class="crm-rv-g">
    ${bloque('Calientes: cerrar esta semana', 'Abrieron la cotización varias veces, calificación A o % de cierre alto.', ab.filter(d => d.etapa === 'negociacion' || d.vistas >= 2).sort((a, b) => b.valor - a.valor), d => d.vistas ? '🔥 ' + d.vistas + ' vistas' : 'cal. ' + (d.cal || '—'))}
    ${bloque('Estancadas', `Sin ningún movimiento hace más de ${CRM_DIAS_ESTANCADO} días: ¿qué pasó y cuál es el próximo paso?`, ab.filter(d => d.estancado).sort((a, b) => b.valor - a.valor), d => _crmDias(d.ultAct) + ' días quieta')}
    ${bloque('Sin próxima actividad', 'Definir en la reunión qué se hace con cada uno y cuándo.', ab.filter(d => d.sinProx && !d.estancado).sort((a, b) => b.valor - a.valor))}
    ${bloque('Actividades vencidas', 'Quedaron prometidas y no se hicieron.', ab.filter(d => d.vencida), d => d.prox.tipo + ' del ' + d.prox.fecha.split('-').reverse().slice(0, 2).join('/'))}
    <div class="crm-rv"><h4>Últimos 30 días</h4><p>${g.length} reserva${g.length !== 1 ? 's' : ''} · ${perd.length} descartada${perd.length !== 1 ? 's' : ''}</p>${Object.entries(mot).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<div class="crm-mot"><span>${_cbEsc(m)}</span>${_decBarra(n, perd.length)}<b>${n}</b></div>`).join('') || '<p class="crm-vacio">Sin descartadas en el período.</p>'}</div>
  </div>`;
}
function crmListaHTML(L) {
  const S = crm.sort, cols = [['cod', 'Código'], ['nombre', 'Cliente'], ['owner', 'Asesor'], ['nvis', 'Visitas'], ['ncot', 'Cotiz.'], ['etapa', 'Etapa'], ['valor', 'Valor'], ['cal', 'Cal.'], ['ter', 'Terreno'], ['dias', 'Días en etapa'], ['ult', 'Último movimiento'], ['prox', 'Próxima actividad'], ['origen', 'Origen']];
  const val = (d, k) => k === 'etapa' ? CRM_RANK[d.etapa] : k === 'dias' ? -d.desde : k === 'ult' ? d.ultAct : k === 'prox' ? (d.prox?.fecha || '9') : k === 'nvis' ? d.visitas.length : k === 'ncot' ? d.cots.length : d[k];
  const l = L.slice().sort((a, b) => { const x = val(a, S.k), y = val(b, S.k); return (x > y ? 1 : x < y ? -1 : 0) * S.d; });
  return `<div class="crm-scroll"><table class="dec-t crm-tl"><thead><tr>${cols.map(([k, t]) => `<th onclick="crm.sort={k:'${k}',d:crm.sort.k==='${k}'?-crm.sort.d:-1};crmRefrescar()">${t}${S.k === k ? (S.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${l.slice(0, 500).map(d => `<tr onclick="crmDetalle('${d.id}')" class="${d.estancado ? 'rot' : ''}">
    <td class="crm-cod">${d.cod || '—'}</td><td>${_cbEsc(d.nombre)}</td><td>${_cbEsc(d.owner)}</td><td>${d.visitas.length || '—'}</td><td>${d.cots.length || '—'}</td><td><i class="crm-dot" style="background:${CRM_ETAPAS[CRM_RANK[d.etapa]].c}"></i>${CRM_ETAPAS[CRM_RANK[d.etapa]].n}</td><td>${d.valor ? _decUsdK(d.valor) : '—'}</td><td>${d.cal || '—'}</td><td>${_cbEsc(d.ter) || '—'}</td>
    <td>${_crmDias(d.desde) ?? '—'}</td><td class="${d.estancado ? 'low' : ''}">${d.ultAct ? 'hace ' + _cbHace(d.ultAct) : '—'}</td><td class="${d.vencida ? 'low' : ''}">${d.prox ? _cbEsc(d.prox.tipo) + ' ' + d.prox.fecha.split('-').reverse().join('/') : d.abierto ? '<span class="low">—</span>' : ''}</td><td>${_cbEsc(d.origen) || '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function crmExportar() {
  if (typeof XLSX === 'undefined') { toastErr?.('No está cargada la librería de Excel.'); return; }
  const rows = crmFiltrados().map(d => ({ Código: d.cod || '', Cliente: d.nombre, Asesor: d.owner, 'Visitas presenciales': d.visitas.length, 'Fechas de visita': d.visitas.map(e => e.fecha.split('-').reverse().join('/')).join(', '), Cotizaciones: d.cots.length, Etapa: CRM_ETAPAS[CRM_RANK[d.etapa]].n, 'Valor US$': Math.round(d.valor), 'Ponderado US$': Math.round(d.pond), Calificación: d.cal, '% cierre': d.pct || '', Terreno: d.ter, Origen: d.origen, Teléfono: d.tel,
    'Días en etapa': _crmDias(d.desde), 'Último movimiento': d.ultAct ? new Date(d.ultAct).toLocaleDateString('es-BO') : '', Estancada: d.estancado ? 'Sí' : '', 'Próxima actividad': d.prox ? d.prox.tipo + ' ' + d.prox.fecha : '', 'Motivo de descarte': d.motivo, 'Última nota': d.notas[0]?.txt || '' }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Embudo');
  // actividad del mes por asesor (para la reunión)
  const AC = crmActividad(crmMes()); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(AC).map(([n, x]) => ({ Asesor: n, Mes: _crmMesNombre(crmMes()), 'Visitas presenciales': x.vis, 'Clientes que visitaron': x.cli.size, 'Volvieron (2ª o más)': x.vis2, 'Cotizaciones enviadas': x.cots, 'Clientes cotizados': x.cotCli.size, 'Cotizaciones abiertas': x.cotAb, Reservas: x.res }))), 'Actividad del mes');
  XLSX.writeFile(wb, 'Embudo-' + (crm.f.ases || 'todos').replace(/\s+/g, '-') + '-' + _crmHoy() + '.xlsx');
}

/* ── Padrón: todos los clientes con su código y posibles duplicados para revisar ── */
function crmDuplicados() {
  const no = crm.store._config?.noDup || {}, D = crm.deals.filter(d => d.cod), B = {}, out = [], visto = new Set();
  const T = new Map(D.map(d => [d, new Set(_padTok(d.nombre))]));
  D.forEach(d => T.get(d).forEach(t => { if (t.length >= 4) (B[t] = B[t] || []).push(d); }));
  Object.values(B).forEach(l => { if (l.length > 60) return; for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const a = l[i], b = l[j]; if (a.cod === b.cod) continue; const k = [a.cod, b.cod].sort().join('_'); if (visto.has(k) || no[k]) continue; visto.add(k);
    const A = T.get(a), Bb = T.get(b); if (A.size < 2 || Bb.size < 2) continue; const inter = [...A].filter(t => Bb.has(t)).length, jac = inter / (A.size + Bb.size - inter);
    if (jac >= .6 || inter === Math.min(A.size, Bb.size)) out.push({ a, b, k, jac }); } });
  return out.sort((x, y) => y.jac - x.jac).slice(0, 40);
}
async function crmNoDup(k) { try { await window._fbCrm.update('_config/noDup', { [k]: true }); } catch (e) {} }
function crmClientesHTML() {
  const q = _cbN(crm.f.q || ''), L = crm.deals.filter(d => !q || [d.cod, d.nombre, d.owner, d.tel].some(v => _cbN(v).includes(q))).sort((a, b) => (b.cod || '').localeCompare(a.cod || ''));
  const sinCod = crm.deals.filter(d => !d.cod).length, dup = crmDuplicados();
  const dupH = dup.length ? `<div class="crm-rv cc-b"><h4>¿Son la misma persona? <span>${dup.length}</span></h4><p>Nombres muy parecidos con códigos distintos. Uní los que sean el mismo cliente; así sus visitas y cotizaciones quedan juntas.</p>${dup.slice(0, 8).map(x => `<div class="crm-dup"><div><b>${x.a.cod}</b> ${_cbEsc(x.a.nombre)} <span>${_cbEsc(x.a.owner)} · ${x.a.visitas.length} vis. · ${x.a.cots.length} cot.</span></div><div><b>${x.b.cod}</b> ${_cbEsc(x.b.nombre)} <span>${_cbEsc(x.b.owner)} · ${x.b.visitas.length} vis. · ${x.b.cots.length} cot.</span></div><div class="crm-acc"><button type="button" class="p" onclick="padronUnir('${x.a.cod}','${x.b.cod}')">Unir</button><button type="button" onclick="crmNoDup('${x.k}')">Son distintas</button></div></div>`).join('')}${dup.length > 8 ? `<p class="crm-vacio">y ${dup.length - 8} más: aparecen a medida que revisás estos.</p>` : ''}</div>` : '';
  return `<div class="crm-sec">Padrón de clientes · ${crm.deals.length - sinCod} con código${sinCod ? ` · ${sinCod} esperando código (se asignan solos en unos segundos)` : ''}</div>${dupH}
    <div class="crm-scroll"><table class="dec-t crm-tl"><thead><tr><th>Código</th><th>Cliente</th><th>Asesor</th><th>Visitas</th><th>Cotiz.</th><th>Agendas</th><th>Etapa</th><th>Primer contacto</th><th>Último movimiento</th></tr></thead><tbody>
    ${L.slice(0, 600).map(d => `<tr onclick="crmDetalle('${d.id}')"><td class="crm-cod">${d.cod || '—'}</td><td>${_cbEsc(d.nombre)}</td><td>${_cbEsc(d.owner)}</td><td>${d.visitas.length || '—'}</td><td>${d.cots.length || '—'}</td><td>${d.items.filter(x => x.t === 'vis').length || '—'}</td><td><i class="crm-dot" style="background:${CRM_ETAPAS[CRM_RANK[d.etapa]].c}"></i>${CRM_ETAPAS[CRM_RANK[d.etapa]].n}</td><td>${d.creado ? new Date(d.creado).toLocaleDateString('es-BO') : '—'}</td><td>${d.ultAct ? 'hace ' + _cbHace(d.ultAct) : '—'}</td></tr>`).join('')}</tbody></table></div>${L.length > 600 ? '<p class="crm-vacio">Se muestran 600; usá el buscador.</p>' : ''}`;
}

/* ── Detalle de una oportunidad: historia, actividades y notas ── */
function crmDetalle(id) {
  const d = crm.porId[id]; if (!d) return;
  const e = CRM_ETAPAS[CRM_RANK[d.etapa]], wa = typeof _czCelularWa === 'function' ? _czCelularWa(d.tel) : '';
  // historia: también las visitas en que el cliente volvió (quedan dentro del registro)
  const H = d.items.slice(); d.items.forEach(x => { if (x.t === 'reg') Object.entries(x.r.visitas || {}).forEach(([k, v]) => { if (v && v.ts) H.push({ t: 'vv', ts: v.ts, r: { ...v, k, asesorNombre: v.por || x.r.asesorNombre } }); }); });
  const nVis = x => (x.t === 'vv' ? d.visitas.find(e => e.k === x.r.k) : d.visitas.find(e => e.primera && e.fecha === x.r.fecha && e.ts === (x.r.ts || e.ts) && e.por === (x.r.asesorNombre || '')))?.n;
  H.sort((a, b) => a.ts - b.ts);
  const hist = H.reverse().map(x => { const r = x.r, f = x.ts ? new Date(x.ts).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
    if (x.t === 'vv') return `<div class="crm-h reg"><span>${f}</span><div>${r.tipo === 'Virtual' ? 'Reunión virtual' : 'Volvió al proyecto · ' + (nVis(x) || r.n || '') + 'ª visita'} · ${(r.fecha || '').split('-').reverse().join('/')}<small>${_cbEsc(r.asesorNombre || '')}</small></div></div>`;
    const t = x.t === 'reg' ? `${(r.detalleVisita || 'Presencial') === 'Virtual' ? 'Registro (reunión virtual)' : (nVis(x) || 1) + 'ª visita'} · ${r.conclusion || 'sin conclusión'}${r.calificacion ? ' · cal. ' + r.calificacion : ''}${r.terrenoInteres ? ' · ' + r.terrenoInteres : ''}${r.comentarios ? `<em>${_cbEsc(r.comentarios)}</em>` : ''}${r.motivoNoCierre ? `<em>Motivo: ${_cbEsc(r.motivoNoCierre)}</em>` : ''}`
      : x.t === 'cot' ? `Cotización ${_cbEsc(r.codigo || '')} · ${r.precioFinal ? _cbUsd(r.precioFinal) : 'perfil'}${r.vistas ? ' · la abrió ' + r.vistas + ' veces' : ' · sin abrir'}`
      : `Agenda del call center · visita ${r.fecha ? r.fecha.split('-').reverse().join('/') : ''} · ${r.estado || ''}`;
    return `<div class="crm-h ${x.t}"><span>${f}</span><div>${t}<small>${_cbEsc(r.asesorNombre || '')}</small></div></div>`; }).join('');
  const acts = d.acts.map(a => `<div class="crm-ac ${a.hecho ? 'ok' : a.fecha < _crmHoy() ? 'venc' : ''}"><label><input type="checkbox" ${a.hecho ? 'checked' : ''} onchange="crmHecho('${id}','${a.k}',this.checked)"> <b>${_cbEsc(a.tipo)}</b> · ${a.fecha.split('-').reverse().join('/')}${a.hora ? ' ' + a.hora : ''}</label>${a.nota ? `<em>${_cbEsc(a.nota)}</em>` : ''}<small>${_cbEsc(a.por || '')}</small></div>`).join('') || '<p class="crm-vacio">Sin actividades.</p>';
  const notas = d.notas.map(n => `<div class="crm-nt"><p>${_cbEsc(n.txt)}</p><small>${_cbEsc(n.por || '')} · ${new Date(n.ts).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('');
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10), ro = crm.modo === 'cc';
  const asg = typeof ccAsignaciones === 'function' && d.cc ? ccAsignaciones().filter(a => a.id === id).sort((a, b) => b.ts - a.ts)[0] : null;
  const ccInfo = asg ? `<div class="crm-ccinfo">📞 Asignado por <b>${_cbEsc(asg.por)}</b> a ${_cbEsc(asg.as)} el ${_ccF(asg.ts)}${asg.fuente !== 'Sin código' ? ' · ' + _cbEsc(asg.fuente) : ''} · ${asg.resp != null ? 'primera respuesta en <b>' + _ccH(asg.resp) + '</b>' : '<b class="low">sin respuesta del asesor hace ' + _ccH(asg.espera) + '</b>'}${asg.v.interes ? `<em>${_cbEsc(String(asg.v.interes).replace(/ · https?:\/\/\S+/, ''))}</em>` : ''}</div>` : '';
  const fdm = f => f ? f.split('-').reverse().slice(0, 2).join('/') + '/' + f.slice(2, 4) : '';
  const vyc = `<h4>Visitas presenciales <span class="crm-n">${d.visitas.length}</span></h4>${d.visitas.length ? `<div class="crm-vis">${d.visitas.map(v => `<span title="${_cbEsc(v.as)}"><b>${v.n}ª</b> ${fdm(v.fecha)}</span>`).join('')}</div>` : '<p class="crm-vacio">Todavía no visitó el proyecto.</p>'}
      <h4>Cotizaciones <span class="crm-n">${d.cots.length}</span></h4>${d.cots.length ? d.cots.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(c => `<div class="crm-cot"><div><b>${_cbEsc(c.codigo || 'Cotización')}</b> · ${c.precioFinal ? _cbUsd(c.precioFinal) : 'perfil'}${c.terreno ? ' · ' + _cbEsc(c.terreno) : ''}<small>${c.ts ? new Date(c.ts).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }) : ''} · ${_cbEsc(c.asesorNombre || '')} · ${c.vistas ? 'la abrió ' + c.vistas + ' ' + (c.vistas === 1 ? 'vez' : 'veces') : 'sin abrir'}${c.fechaVencimiento && c.fechaVencimiento < Date.now() ? ' · vencida' : ''}</small></div>${typeof cotzAbrirHoja === 'function' && c._key ? `<button type="button" class="crm-btn" onclick="cotzAbrirHoja('${c._key}')">Ver</button>` : ''}</div>`).join('') : '<p class="crm-vacio">Sin cotizaciones.</p>'}`;
  const nodos = crm.modo === 'admin' && d.cod && d.nodos.length > 1 ? `<details class="crm-nodos"><summary>Registros unidos en ${d.cod} (${d.nodos.length})</summary><p class="crm-sub">Si alguno es de otra persona con nombre parecido, separalo y queda como cliente aparte.</p>${d.items.map(x => `<div><span>${x.t === 'reg' ? 'Registro' : x.t === 'cot' ? 'Cotización' : 'Agenda'} · ${_cbEsc(x.r.nombre || x.r.cliente || '')} · ${_cbEsc(x.r.asesorNombre || '')}${x.r.celular || x.r.telefono ? ' · ' + _cbEsc(x.r.celular || x.r.telefono) : ''}</span><button type="button" class="crm-btn" onclick="padronSeparar('${x.nid}').then(()=>setTimeout(()=>crmModal(null),300))">Separar</button></div>`).join('')}</details>` : '';
  crmModal(`<div class="crm-d-h" style="--c:${e.c}"><span class="et">${d.cod ? d.cod + ' · ' : ''}${e.n}${d.etapa !== d.auto ? ' · movida a mano' : ''}</span><h3>${_cbEsc(d.nombre)}</h3>
      <div class="crm-d-m"><span>${d.valor ? _cbUsd(d.valor) : 'sin valor'}</span>${d.owner ? `<span>${_cbEsc(d.owner)}</span>` : ''}${d.ter ? `<span>${_cbEsc(d.ter)}</span>` : ''}${d.cal ? `<span>Calificación ${d.cal}</span>` : ''}${d.pct ? `<span>${d.pct}% de cierre</span>` : ''}${d.origen ? `<span>${_cbEsc(d.origen)}</span>` : ''}${d.tel ? `<span>${_cbEsc(d.tel)}</span>` : ''}</div>
      ${ccInfo}${ro ? '' : `<div class="crm-et">${CRM_ETAPAS.map(x => `<button type="button" class="${x.id === d.etapa ? 'on' : ''}" style="--c:${x.c}" onclick="crmMover('${id}','${x.id}');setTimeout(()=>crmDetalle('${id}'),300)">${x.n}</button>`).join('')}</div>`}
      <div class="crm-acc">${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ultCot && typeof cotzAbrirHoja === 'function' ? `<button type="button" onclick="cotzAbrirHoja('${d.ultCot._key}')">Ver cotización</button>` : ''}${d.st?.elimPedida ? `<span class="crm-pend">🗑 Eliminación pedida por ${_cbEsc(d.st.elimPedida.por || '—')}${crm.modo === 'admin' ? ` · <a onclick="crmEliminarAbrir('${id}','${(crmSolicitudes().find(s => s.coleccionPath === 'crmlead:' + id) || {})._key || ''}')">revisar</a>` : ' · pendiente de aprobación'}</span>` : `<button type="button" class="crm-del-l" onclick="crmPedirEliminar('${id}')">🗑 ${crm.modo === 'admin' ? 'Eliminar lead' : 'Solicitar eliminar'}</button>`}</div></div>
    <div class="crm-d-g"><div><h4>Próxima actividad</h4>${ro ? '' : `<div class="crm-nueva"><select id="crm-a-tipo" class="crm-in">${CRM_ACT.map(t => `<option>${t}</option>`).join('')}</select><input id="crm-a-fecha" type="date" class="crm-in" value="${manana}"><input id="crm-a-hora" type="time" class="crm-in"><input id="crm-a-nota" class="crm-in" placeholder="Qué hay que hacer"><button type="button" class="p" onclick="crmGuardarAct('${id}')">Agendar</button></div>`}${acts}
      <h4>Notas</h4>${ro ? '' : `<div class="crm-nueva"><textarea id="crm-nota" class="crm-in" rows="2" placeholder="Qué dijo el cliente, objeciones, acuerdos…"></textarea><button type="button" class="p" onclick="crmNota('${id}')">Guardar nota</button></div>`}${notas || (ro ? '<p class="crm-vacio">Sin notas.</p>' : '')}</div>
      <div>${vyc}<h4>Historia</h4><div class="crm-hist">${hist}</div>${nodos}</div></div>`);
}

/* ── Vista admin ── */
function crmFiltro(k, v) { crm.f[k] = v; crmRefrescar(true); }
function crmVista(v) { crm.vista = v; crmRefrescar(true); }
function crmPanelHTML() {
  const F = crm.f, ases = [...new Set(crm.deals.map(d => d.owner).filter(Boolean))].filter(n => crm.modo !== 'admin' || crmEsAsesor(n) || n === F.ases).sort();
  const OK = crm.modo === 'admin' ? crmAsesoresOK() : null, otros = OK ? crm.deals.filter(d => !OK.has(d.owner)).length : 0, sol = crm.modo === 'admin' ? crmSolicitudes().length : 0;
  const vistas = crm.modo === 'admin' ? [['tablero', 'Tablero'], ['asesores', 'Por asesor'], ['revision', 'Revisión 1 a 1'], ['lista', 'Lista'], ['callcenter', 'Call center'], ['clientes', 'Clientes']] : [['tablero', 'Tablero'], ['lista', 'Lista']];
  return `<div class="crm-top"><div class="dec-seg">${vistas.map(([v, t]) => `<button type="button" class="${crm.vista === v ? 'on' : ''}" onclick="crmVista('${v}')">${t}</button>`).join('')}</div>
    ${crm.modo === 'admin' ? `<select onchange="crmFiltro('ases',this.value)"><option value="">Todos los asesores</option>${ases.map(a => `<option ${a === F.ases ? 'selected' : ''}>${_cbEsc(a)}</option>`).join('')}</select>` : ''}
    ${crm.vista === 'callcenter' || crm.vista === 'clientes' ? '' : `<label class="crm-mes" title="Mes de la actividad (visitas, cotizaciones y reservas)">Mes <input type="month" value="${crmMes()}" onchange="crmFiltro('mes',this.value)"></label>`}
    ${crm.vista === 'callcenter' || crm.vista === 'clientes' ? '' : `<select onchange="crmFiltro('src',this.value)">${[['', 'Todo origen'], ['cc', 'Asignados por call center'], ['propio', 'Propios del asesor']].map(([v, t]) => `<option value="${v}" ${(F.src || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select onchange="crmFiltro('per',this.value)">${[['abiertos', 'Abiertas + cerradas 30 días'], ['mes', 'Con movimiento este mes'], ['gestion', 'Con movimiento en la gestión'], ['todo', 'Todo el historial']].map(([v, t]) => `<option value="${v}" ${F.per === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select onchange="crmFiltro('cal',this.value)"><option value="">Toda calificación</option>${['A', 'B', 'C', 'D'].map(c => `<option ${F.cal === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`}
    <input class="crm-q" placeholder="Buscar cliente, terreno, teléfono…" value="${_cbEsc(F.q)}" oninput="crm.f.q=this.value;clearTimeout(crm.qT);crm.qT=setTimeout(()=>crmRefrescar(),250)">
    ${crm.vista === 'callcenter' ? '' : '<button type="button" class="crm-btn" onclick="crmExportar()">Exportar a Excel</button>'}
    ${crm.modo === 'admin' ? `<button type="button" class="crm-btn" onclick="crmConfigAsesores()">Asesores del embudo${OK ? ' (' + OK.size + ')' : ''}</button>${otros ? `<label class="crm-otros" title="Clientes cargados por usuarios que no están marcados como asesores"><input type="checkbox" ${F.otros ? 'checked' : ''} onchange="crmFiltro('otros',this.checked)"> Ver también otros usuarios (${otros})</label>` : ''}${sol ? `<button type="button" class="crm-btn crm-solb" onclick="crmVerSolicitudes()">🗑 ${sol} solicitud${sol !== 1 ? 'es' : ''} de eliminación</button>` : ''}` : ''}</div><div id="crm-cuerpo"></div>`;
}
function crmRefrescar(todo) {
  const host = document.getElementById(crm.modo === 'admin' ? 'panel-embudo' : crm.modo === 'cc' ? 'utab-ccseg' : 'utab-embudo');
  if (!host || (crm.modo === 'admin' && !host.classList.contains('active')) || (crm.modo !== 'admin' && host.style.display === 'none')) return;
  if (crm.modo === 'cc') { if (todo || !document.getElementById('crm-cuerpo')) host.innerHTML = `<div class="crm-asesor-h"><h3>Seguimiento de mis asignaciones</h3><p>Qué hizo cada asesor con los clientes que le pasaste: cuánto tardó en tomarlos, si visitaron, cotizaron o reservaron. Tocá un cliente para ver su historia.</p></div><input class="crm-q cc-q" placeholder="Buscar cliente, asesor, teléfono…" value="${_cbEsc(crm.f.q || '')}" oninput="crm.f.q=this.value;clearTimeout(crm.qT);crm.qT=setTimeout(()=>crmRefrescar(),250)"><div id="crm-cuerpo"></div>`; document.getElementById('crm-cuerpo').innerHTML = ccHTML(); return; }
  crmConstruir();
  if (todo || !document.getElementById('crm-cuerpo')) host.innerHTML = (crm.modo === 'asesor' ? '<div class="crm-asesor-h"><h3>Mi embudo</h3><p>Arrastrá cada cliente a su etapa, agendá la próxima actividad y dejá notas. Lo que cargues en "Cargar" y en Cotizaciones aparece acá solo.</p></div><div id="crm-dia"></div>' : '') + crmPanelHTML();
  const L = crmFiltrados(), b = document.getElementById('crm-cuerpo'); if (!b) return;
  if (crm.modo === 'asesor') crmMiDia(L);
  if (crm.vista === 'callcenter') { b.innerHTML = ccHTML(); return; }
  if (crm.vista === 'clientes') { b.innerHTML = crmClientesHTML(); return; }
  b.innerHTML = crmResumenHTML(L) + (crm.vista === 'asesores' ? crmAsesoresHTML(L) : crm.vista === 'revision' ? crmRevisionHTML(L) : crm.vista === 'lista' ? crmListaHTML(L) : crmTableroHTML(L));
}
/* El día del asesor: lo que tiene que hacer hoy */
function crmMiDia(L) {
  const el = document.getElementById('crm-dia'); if (!el) return; const hoy = _crmHoy();
  const t = L.filter(d => d.prox && d.prox.fecha <= hoy), est = L.filter(d => d.estancado), sin = L.filter(d => d.sinProx && !d.estancado);
  el.innerHTML = `<div class="crm-dia">${[['Para hoy y vencidas', t, d => d.prox.tipo + ' · ' + (d.prox.fecha < hoy ? 'vencida' : 'hoy')], ['Estancadas', est, d => _crmDias(d.ultAct) + ' días sin movimiento'], ['Sin próxima actividad', sin, d => CRM_ETAPAS[CRM_RANK[d.etapa]].n]].map(([tt, l, f]) => `<div><h4>${tt} <span>${l.length}</span></h4>${l.slice(0, 6).map(d => `<button type="button" onclick="crmDetalle('${d.id}')"><b>${_cbEsc(d.nombre)}</b><span>${_cbEsc(f(d))}</span></button>`).join('') || '<p class="crm-vacio">Nada pendiente.</p>'}</div>`).join('')}</div>`;
}

/* ── Integración: acordeón propio (admin) y pestaña "Mi embudo" (asesor) ── */
(function () {
  const sw = window.switchAdminTab;
  if (typeof sw === 'function') window.switchAdminTab = function (id, ...r) { const out = sw.call(this, id, ...r); if (id === 'embudo') { crm.modo = 'admin'; crmEscuchar(); crmRefrescar(true); } return out; };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) { const out = ea.apply(this, a); crm.modo = 'admin'; crmEscuchar(); const nav = document.getElementById('nav-grupo-embudo'); if (nav) nav.style.display = ''; return out; };
  const su = window.switchUserTab;
  if (typeof su === 'function') window.switchUserTab = function (id, ...r) {
    const el = document.getElementById('utab-embudo');
    if (id === 'embudo') { if (crm.modo !== 'asesor') crm.vista = 'tablero'; su.call(this, '__ninguna__', false); if (el) el.style.display = 'block'; document.querySelectorAll('#user-tabs-wrap .user-tab').forEach(b => b.classList.toggle('active', b.dataset.t === 'embudo')); crm.modo = 'asesor'; crmEscuchar(); crmRefrescar(true); return; }
    if (el) el.style.display = 'none'; return su.call(this, id, ...r);
  };
  const eu = window.entrarUsuario;
  if (typeof eu === 'function') window.entrarUsuario = function (...a) {
    const out = eu.apply(this, a);
    try { const ase = asesorActual, mods = ase?.modulos || (typeof ROL_MODULOS !== 'undefined' ? ROL_MODULOS[ase?.rol] : null) || ['ventas'];
      if (mods.includes('ventas')) {
        const wrap = document.getElementById('user-tabs-wrap'); if (wrap && !wrap.querySelector('[data-t="embudo"]')) { const b = document.createElement('button'); b.className = 'user-tab'; b.dataset.t = 'embudo'; b.textContent = '🧭 Mi embudo'; b.onclick = () => switchUserTab('embudo'); const ref = wrap.children[1]; ref ? wrap.insertBefore(b, ref.nextSibling) : wrap.appendChild(b); }
        if (!document.getElementById('utab-embudo')) { const d = document.createElement('div'); d.id = 'utab-embudo'; d.style.display = 'none'; document.getElementById('utab-ventas')?.before(d); }
        crm.modo = 'asesor'; crm.vista = 'tablero'; crm.f.ases = ''; crmEscuchar();
      } } catch (e) {}
    return out;
  };
  const ap = window.aprobarSolicitudEliminacion;
  if (typeof ap === 'function') window.aprobarSolicitudEliminacion = function (key, path, ...r) { if (String(path).startsWith('crmlead:')) { crmEscuchar(); crmEliminarAbrir(String(path).slice(8), key); return; } return ap.call(this, key, path, ...r); };
  const rz = window.rechazarSolicitudEliminacion;
  if (typeof rz === 'function') window.rechazarSolicitudEliminacion = function (key, ...r) { const s = _decArr('solicitudesEliminacionData').find(x => x._key === key); if (s && String(s.coleccionPath).startsWith('crmlead:')) { crmRechazar(key, s.coleccionPath.slice(8)); return; } return rz.call(this, key, ...r); };
  // se repinta solo cuando llega un registro, una cotización o una agenda nueva
  setInterval(() => { const f = [_decG('todosRegs'), _decG('misRegs'), _decG('cotizacionesData'), _decG('visitasProgramadasData'), _decG('solicitudesEliminacionData')]; if (!crm.firma || f.some((x, i) => x !== crm.firma[i])) { crm.firma = f; crmRefrescar(); } }, 2500);
})();


/* ════════════════════════════════════════════════════════════════════════
   CALL CENTER → ASESORES (análisis de asignaciones)
   Cada agenda que carga el call center es una asignación. Se cruza con lo
   que el asesor hizo después (abrir la agenda, registrar la visita, cotizar,
   agendar actividades o notas en el embudo) para medir el tiempo de primera
   respuesta y cómo terminó cada cliente. Sin tocar registros existentes:
   solo se suma "tomadaTs" cuando el asesor abre la agenda.
   Admin: vista "Call center" dentro del Embudo. Call center: pestaña
   "Seguimiento" con sus propias asignaciones (solo lectura).
   ════════════════════════════════════════════════════════════════════════ */
const CC = { per: 'mes', por: '', ases: '', camp: '', sla: 24, regs: null, escuchando: false };
try { CC.sla = +localStorage.getItem('uv-cc-sla') || 24; } catch (e) {}
const CC_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CC_FRANJAS = [['Antes 8', 0, 8], ['8–10', 8, 10], ['10–12', 10, 12], ['12–14', 12, 14], ['14–16', 14, 16], ['16–18', 16, 18], ['18–20', 18, 20], ['20 o más', 20, 24]];
const _ccH = h => h == null ? '—' : h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? (Math.round(h * 10) / 10).toLocaleString('es-BO') + ' h' : Math.round(h / 24) + ' días';
const _ccMed = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _ccTel = s => String(s || '').replace(/\D/g, '').slice(-8);
const _ccF = ts => ts ? new Date(ts).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const _ccJ = s => JSON.stringify(String(s)).replace(/"/g, '&quot;');

/* ── Una fila por asignación, con lo que pasó después ── */
function ccAsignaciones() {
  crmConstruir();
  const now = Date.now(), slaMs = CC.sla * 36e5;
  const lt = {}, ln = {};
  _decArr('leadsData').forEach(l => { const ts = l.ts || 0, t = _ccTel(l.telefono), n = _crmId(l.nombre || ''); if (t.length >= 7 && (!lt[t] || ts < lt[t])) lt[t] = ts; if (n !== 'sin-nombre' && (!ln[n] || ts < ln[n])) ln[n] = ts; });
  return _decArr('visitasProgramadasData').filter(v => v.nombre && !v.esDevolucion).map(v => {
    const id = crm.nodo?.['v_' + v._key] || _crmId(v.nombre), d = crm.porId[id], ts = v.ts > 1e11 ? v.ts : _cbTs(0, v.fecha), as = v.asesorNombre || '', st = d?.st || {}, desde = ts - 36e5, it = d?.items || [];
    // primer movimiento del asesor después de la asignación
    const c = [v.tomadaTs, v.completadaTs];
    it.forEach(x => { if (x.ts >= desde && ((x.t === 'reg' && x.r.asesorNombre === as) || (x.t === 'cot' && x.r.creadoPorNombre === as))) c.push(x.ts); });
    Object.values(st.act || {}).forEach(a => { if (a.por === as) c.push(a.ts, a.hechoTs); });
    Object.values(st.notas || {}).forEach(n => { if (n.por === as) c.push(n.ts); });
    if (st.movidoPor === as) c.push(st.etapaTs);
    (d?.visitas || []).forEach(e => { if (e.as === as) c.push(e.ts); });
    const pc = c.filter(t => t && t >= desde), primer = pc.length ? Math.min(...pc) : null, resp = primer ? Math.max(0, (primer - ts) / 36e5) : null;
    // solo cuenta lo que pasó DESPUÉS de esta asignación (si el cliente ya había reservado antes, no se le acredita)
    const cierre = x => typeof _esCierreVenta === 'function' ? _esCierreVenta(x.r) : x.r.conclusion === 'Reserva';
    const despues = (d?.desde || 0) >= desde, etapa0 = d?.etapa || 'agendado';
    const etapa = (etapa0 === 'reserva' && !it.some(x => x.t === 'reg' && x.ts >= desde && cierre(x)) && !(despues && d?.etapa !== d?.auto)) || (etapa0 === 'perdido' && !despues) ? 'agendado' : etapa0, rk = CRM_RANK[etapa];
    const visito = v.estado === 'completada' || (d?.visitas || []).some(e => e.ts >= desde);
    const cotizo = it.some(x => x.t === 'cot' && x.ts >= desde && x.r.creadoPorNombre === as) || (rk >= 2 && rk <= 4 && despues);
    const previo = it.find(x => x.t !== 'vis' && x.ts < ts - 864e5 && x.r.asesorNombre && x.r.asesorNombre !== as);
    const tl = _ccTel(v.telefono), lead = (tl.length >= 7 && lt[tl]) || ln[id] || null;
    return { v, id, d, ts, as, nombre: v.nombre, por: v.cargadoPorNombre || 'Sin dato', porKey: v.cargadoPorKey || '', origen: v.origen || '', camp: v.campaniaCodigo || '', fuente: v.campaniaCodigo || v.origen || 'Sin código',
      primer, resp, sinAtender: !primer, vencida: !primer && now - ts > slaMs, enTiempo: resp != null && resp <= CC.sla, espera: primer ? null : (now - ts) / 36e5,
      visito, cotizo, negocio: rk >= 3 && rk <= 4, reserva: etapa === 'reserva', perdido: etapa === 'perdido', etapa, motivo: d?.motivo || '',
      agendaPasada: !!v.fecha && v.fecha < _crmHoy() && !visito, previo: previo ? previo.r.asesorNombre : '', leadTs: lead && lead <= ts ? lead : null, ultAct: d?.ultAct || ts };
  });
}
function _ccP0() { const now = Date.now(), m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(); return ({ semana: now - 7 * 864e5, mes: m0, d30: now - 30 * 864e5, d90: now - 90 * 864e5, gestion: _decGestion0(), todo: 0 })[CC.per] ?? m0; }
function _ccSoyYo(a) { return typeof asesorActual !== 'undefined' && asesorActual && (a.porKey === asesorActual._key || (!a.porKey && a.por === asesorActual.nombre)); }
function ccFiltradas(all) {
  const p0 = _ccP0(), ases = CC.ases || (crm.modo === 'admin' ? crm.f.ases : ''), q = _cbN(crm.f.q || '');
  return all.filter(a => a.ts >= p0 && crmEsAsesor(a.as) && (!CC.por || a.por === CC.por) && (!ases || a.as === ases) && (!CC.camp || a.fuente === CC.camp) && (crm.modo !== 'cc' || _ccSoyYo(a)) && (!q || [a.nombre, a.as, a.fuente, a.v.telefono].some(x => _cbN(x).includes(q))));
}
function _ccStats(l) {
  const at = l.filter(a => !a.sinAtender), venc = l.filter(a => a.vencida).length, res = l.filter(a => a.reserva).length, perd = l.filter(a => a.perdido), mot = {};
  perd.forEach(a => { const k = a.motivo || 'Sin motivo'; mot[k] = (mot[k] || 0) + 1; });
  return { n: l.length, at: at.length, sin: l.length - at.length, venc, med: _ccMed(at.map(a => a.resp)), enT: _decPct(at.filter(a => a.enTiempo).length, at.length + venc),
    vis: l.filter(a => a.visito || a.cotizo || a.negocio || a.reserva).length, cot: l.filter(a => a.cotizo || a.negocio || a.reserva).length, neg: l.filter(a => a.negocio || a.reserva).length, res, perd: perd.length, conv: _decPct(res, l.length),
    mot: Object.entries(mot).sort((a, b) => b[1] - a[1])[0]?.[0] || '', lead: _ccMed(l.filter(a => a.leadTs).map(a => (a.ts - a.leadTs) / 36e5)), nLead: l.filter(a => a.leadTs).length };
}
function _ccDevs(p0) { const D = {}; _decArr('visitasProgramadasData').filter(v => v.esDevolucion && (v.ts || 0) >= p0).forEach(v => { const k = v.asesorNombre || v.cargadoPorNombre || '—'; D[k] = (D[k] || 0) + 1; }); return D; }

/* ── Pintado ── */
function ccHTML() {
  const all = ccAsignaciones(), L = ccFiltradas(all), S = _ccStats(L), p0 = _ccP0(), cc = crm.modo === 'cc';
  const base = cc ? all.filter(_ccSoyYo) : all;
  const opt = (arr, sel, t) => `<option value="">${t}</option>` + [...new Set(arr)].filter(Boolean).sort().map(x => `<option ${x === sel ? 'selected' : ''}>${_cbEsc(x)}</option>`).join('');
  const k = (l, v, t, cls = '') => `<div class="kpi-card crm-k ${cls}"${t ? ` title="${_cbEsc(t)}"` : ''}><div class="kpi-label">${l}</div><div class="kpi-num">${v}</div></div>`;
  const fil = `<div class="crm-top cc-f">
    <select onchange="CC.per=this.value;crmRefrescar()">${[['semana', 'Últimos 7 días'], ['mes', 'Este mes'], ['d30', 'Últimos 30 días'], ['d90', 'Últimos 90 días'], ['gestion', 'Esta gestión'], ['todo', 'Todo']].map(([v, t]) => `<option value="${v}" ${CC.per === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${cc ? '' : `<select onchange="CC.por=this.value;crmRefrescar()">${opt(base.map(a => a.por), CC.por, 'Asignado por: todos')}</select>`}
    <select onchange="CC.ases=this.value;crmRefrescar()">${opt(base.map(a => a.as), CC.ases, 'Todos los asesores')}</select>
    <select onchange="CC.camp=this.value;crmRefrescar()">${opt(base.map(a => a.fuente), CC.camp, 'Toda campaña / origen')}</select>
    <label class="cc-sla" title="Tiempo máximo esperado para que el asesor tome contacto con el cliente asignado">Respuesta esperada <select onchange="CC.sla=+this.value;try{localStorage.setItem('uv-cc-sla',this.value)}catch(e){};crmRefrescar()">${[2, 4, 8, 24, 48].map(h => `<option value="${h}" ${CC.sla === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></label>
    <button type="button" class="crm-btn" onclick="ccExportar()">Exportar a Excel</button></div>`;
  if (!L.length) return fil + '<p class="crm-vacio">No hay asignaciones del call center en este período.</p>';
  const kpis = `<div class="crm-kg">${[k('Clientes asignados', S.n), k('Atendidos por el asesor', S.at + ' · ' + _decFmtPct(_decPct(S.at, S.n))),
    k('Sin atender', S.sin, 'Asignados en los que el asesor todavía no hizo ningún movimiento', S.venc ? 'mal' : ''), k(`Fuera de las ${CC.sla} h`, S.venc, `Sin atender hace más de ${CC.sla} h`, S.venc ? 'mal' : ''),
    k('Respuesta mediana', _ccH(S.med), 'Tiempo entre la asignación y el primer movimiento del asesor (abrir la agenda, registrar visita, cotizar, actividad o nota)'),
    k('Atendidos a tiempo', _decFmtPct(S.enT), `Dentro de ${CC.sla} h, sobre atendidos + vencidos`), k('Visitaron', S.vis + ' · ' + _decFmtPct(_decPct(S.vis, S.n))), k('Reservas', S.res),
    k('Asignado → reserva', _decFmtPct(S.conv)), k('Descartados', S.perd, S.mot ? 'Motivo principal: ' + S.mot : ''),
    ...(S.nLead >= 3 ? [k('Lead → asignación', _ccH(S.lead), `Mediana entre la carga del lead en Marketing y la asignación del call center (${S.nLead} clientes cruzados por teléfono o nombre)`)] : [])].join('')}</div>`;
  return fil + kpis + `<div class="cc-g2">${ccAtenderHTML(L)}${ccTurnoHTML(base)}</div>${cc ? '' : ccLecturaHTML(L, S)}
    <div class="cc-g2">${ccEmbudoHTML(L, S)}${ccVelocidadHTML(L)}</div>
    ${ccPorHTML(L, 'as', cc ? 'Cómo trabajaron tus clientes cada asesor' : 'Por asesor que recibió', true, p0)}
    <div class="cc-g2">${ccPorHTML(L, 'fuente', 'Por campaña u origen', false)}${!cc && new Set(L.map(a => a.por)).size > 1 ? ccPorHTML(L, 'por', 'Por quién asignó', false) : ccHorarioHTML(L)}</div>
    ${!cc && new Set(L.map(a => a.por)).size > 1 ? ccHorarioHTML(L) : ''}
    ${ccListaHTML(L)}`;
}
function ccAtenderHTML(L) {
  const v = L.filter(a => a.vencida).sort((a, b) => a.ts - b.ts), ag = L.filter(a => a.agendaPasada && !a.vencida && !a.perdido && !a.reserva).sort((a, b) => a.ts - b.ts), dup = L.filter(a => a.previo);
  const fila = (a, t) => `<button type="button" onclick="crmDetalle('${a.id}')"><b>${_cbEsc(a.nombre)}</b><span>${_cbEsc(a.as)} · ${t}</span></button>`;
  return `<div class="crm-rv cc-b"><h4>Para atender ya <span>${v.length + ag.length}</span></h4><p>Asignados sin ningún movimiento del asesor pasadas las ${CC.sla} h, y visitas agendadas cuya fecha ya pasó sin registro.</p>
    ${v.slice(0, 8).map(a => fila(a, 'sin atender hace ' + _ccH(a.espera))).join('')}${ag.slice(0, Math.max(0, 8 - v.length)).map(a => fila(a, 'visita del ' + a.v.fecha.split('-').reverse().slice(0, 2).join('/') + ' sin registro')).join('')}
    ${!v.length && !ag.length ? '<p class="crm-vacio">Todo atendido.</p>' : ''}${v.length + ag.length > 8 ? `<p class="crm-vacio">y ${v.length + ag.length - 8} más en la lista de abajo</p>` : ''}
    ${dup.length ? `<p class="cc-dup">⚠ ${dup.length} cliente${dup.length !== 1 ? 's' : ''} asignado${dup.length !== 1 ? 's' : ''} que ya ${dup.length !== 1 ? 'tenían' : 'tenía'} historia con otro asesor: ${dup.slice(0, 4).map(a => `<a onclick="crmDetalle('${a.id}')">${_cbEsc(a.nombre)} (antes ${_cbEsc(a.previo)})</a>`).join(', ')}${dup.length > 4 ? '…' : ''}</p>` : ''}</div>`;
}
/* Carga del equipo ahora y a quién conviene pasarle el próximo cliente */
function ccTurnoHTML(base) {
  const now = Date.now(), OK = crmAsesoresOK();
  const nombres = OK ? [...OK] : [...new Set(base.filter(a => now - a.ts < 60 * 864e5).map(a => a.as))].filter(Boolean);
  if (!nombres.length) return '';
  const R = nombres.map(n => { const l = base.filter(a => a.as === n); return { n, sin: l.filter(a => a.sinAtender && now - a.ts < 30 * 864e5).length, sem: l.filter(a => now - a.ts < 7 * 864e5).length, ab: crm.deals.filter(d => d.owner === n && d.abierto).length, med: _ccMed(l.filter(a => now - a.ts < 30 * 864e5 && a.resp != null).map(a => a.resp)), conv: _decPct(l.filter(a => a.reserva).length, l.filter(a => now - a.ts < 90 * 864e5).length) }; })
    .sort((a, b) => a.sin - b.sin || a.sem - b.sem || (a.med ?? 99) - (b.med ?? 99));
  return `<div class="crm-rv cc-b"><h4>Carga del equipo ahora</h4><p>Ordenado para el próximo turno: primero quien no tiene clientes sin atender y recibió menos esta semana.</p>
    <table class="dec-t cc-t"><thead><tr><th>Asesor</th><th>Sin atender</th><th>Recibió 7 días</th><th>Abiertos</th><th>Respuesta 30 días</th></tr></thead><tbody>${R.map((r, i) => `<tr><td>${i === 0 ? '<i class="cc-sug">sugerido</i> ' : ''}${_cbEsc(r.n)}</td><td class="${r.sin ? 'low' : ''}">${r.sin || '—'}</td><td>${r.sem || '—'}</td><td>${r.ab || '—'}</td><td>${_ccH(r.med)}</td></tr>`).join('')}</tbody></table></div>`;
}
function ccEmbudoHTML(L, S) {
  const pasos = [['Asignados', S.n], ['Atendidos', S.at], ['Visitaron', S.vis], ['Cotizados', S.cot], ['Negociación o más', S.neg], ['Reserva', S.res]];
  return `<div class="crm-rv cc-b"><h4>Qué pasó con los asignados</h4><p>Cada barra sobre el total asignado; a la derecha, cuántos pasaron desde el paso anterior.</p>
    ${pasos.map(([t, n], i) => `<div class="cc-fun"><span>${t}</span><div class="cc-fb"><b style="width:${S.n ? n * 100 / S.n : 0}%"></b></div><strong>${n}</strong><em>${i && pasos[i - 1][1] >= n ? _decFmtPct(_decPct(n, pasos[i - 1][1])) : ''}</em></div>`).join('')}
    <p class="cc-nota">${S.perd} descartado${S.perd !== 1 ? 's' : ''}${S.mot ? ' · motivo más común: ' + _cbEsc(S.mot) : ''}. Las asignaciones recientes todavía están en curso.</p></div>`;
}
/* ¿Responder rápido cierra más? */
function ccVelocidadHTML(L) {
  const B = [['Menos de 1 h', 0, 1], ['1 a 4 h', 1, 4], ['4 a 24 h', 4, 24], ['1 a 3 días', 24, 72], ['Más de 3 días', 72, 1e9]].map(([t, a, b]) => [t, L.filter(x => x.resp != null && x.resp >= a && x.resp < b)]);
  B.push(['Sin atender', L.filter(x => x.sinAtender)]);
  const mx = Math.max(1, ...B.map(([, l]) => _decPct(l.filter(a => a.reserva).length, l.length) || 0));
  return `<div class="crm-rv cc-b"><h4>Velocidad de respuesta y resultado</h4><p>Según cuánto tardó el asesor en tomar al cliente: cuántos visitaron y cuántos reservaron.</p>
    <table class="dec-t cc-t"><thead><tr><th>Primera respuesta</th><th>Clientes</th><th>Visitaron</th><th>Reservaron</th><th></th></tr></thead><tbody>${B.map(([t, l]) => { const r = _decPct(l.filter(a => a.reserva).length, l.length); return `<tr><td>${t}</td><td>${l.length || '—'}</td><td>${l.length ? _decFmtPct(_decPct(l.filter(a => a.visito).length, l.length)) : '—'}</td><td>${l.length ? _decFmtPct(r) : '—'}</td><td class="cc-bc"><span class="dec-bar"><b style="width:${(r || 0) * 100 / mx}%"></b></span></td></tr>`; }).join('')}</tbody></table></div>`;
}
function ccPorHTML(L, campo, titulo, ancho, p0) {
  const G = {}; L.forEach(a => { const k = a[campo] || '—'; (G[k] = G[k] || []).push(a); });
  const dev = campo === 'as' ? _ccDevs(p0) : null, eq = _ccStats(L), now = Date.now();
  const F = Object.entries(G).map(([n, l]) => ({ n, l, S: _ccStats(l) })).sort((a, b) => b.S.n - a.S.n);
  const best = Math.max(...F.filter(f => f.S.n >= 5).map(f => f.S.conv || 0), 0);
  const camp = campo === 'fuente' ? (() => { const C = {}; _decArr('leadsSemanalesData').forEach(s => { const t = _cbTs(0, s.desde || s.hasta); if (t >= _ccP0()) C[s.campaniaCodigo] = (C[s.campaniaCodigo] || 0) + (+s.cantidad || 0); }); return C; })() : null;
  const hayLeads = camp && Object.keys(camp).length;
  return `<div class="crm-rv cc-b${ancho ? ' cc-ancho' : ''}"><h4>${titulo}</h4><div class="crm-scroll"><table class="dec-t cc-t"><thead><tr><th>${campo === 'as' ? 'Asesor' : campo === 'por' ? 'Asignó' : 'Campaña / origen'}</th>${hayLeads ? '<th title="Leads cargados por Marketing en el período (planilla semanal)">Leads</th>' : ''}<th>Asignados</th>${campo === 'as' ? '<th>% del reparto</th>' : ''}<th>Sin atender</th><th>Respuesta mediana</th><th>A tiempo</th><th>Visitaron</th><th>Reservas</th><th>Asignado → reserva</th><th>Descartados</th>${ancho ? '<th>Motivo principal</th>' : ''}${dev ? '<th title="Clientes que el asesor devolvió al call center en el período">Devolvió</th><th>Abiertos ahora</th>' : ''}</tr></thead><tbody>
    ${F.map(f => { const S = f.S, lento = eq.med && S.med && S.at >= 3 && S.med > eq.med * 2;
      return `<tr${campo === 'as' && crm.modo === 'admin' ? ` class="cc-click" onclick="CC.ases=${_ccJ(f.n)};crmRefrescar()" title="Ver solo a ${_cbEsc(f.n)}"` : ''}><td><b>${_cbEsc(f.n)}</b></td>${hayLeads ? `<td>${camp[f.n] || '—'}</td>` : ''}<td>${S.n}</td>${campo === 'as' ? `<td>${_decFmtPct(_decPct(S.n, eq.n))}</td>` : ''}<td class="${S.venc ? 'low' : ''}">${S.sin || '—'}</td><td class="${lento ? 'low' : ''}">${_ccH(S.med)}</td><td>${_decFmtPct(S.enT)}</td><td>${_decFmtPct(_decPct(S.vis, S.n))}</td><td><b>${S.res || '—'}</b></td><td class="${S.n >= 5 && S.conv === best && best > 0 ? 'top' : ''}">${_decFmtPct(S.conv)}</td><td>${S.perd || '—'}</td>${ancho ? `<td>${_cbEsc(S.mot) || '—'}</td>` : ''}${dev ? `<td>${dev[f.n] || '—'}</td><td>${crm.deals.filter(d => d.owner === f.n && d.abierto).length || '—'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div></div>`;
}
/* Cuándo llegan las asignaciones y qué tan rápido se atienden según el horario */
function ccHorarioHTML(L) {
  const M = CC_DIAS.map(() => CC_FRANJAS.map(() => []));
  L.forEach(a => { const d = new Date(a.ts), w = (d.getDay() + 6) % 7, h = d.getHours(), f = CC_FRANJAS.findIndex(([, x, y]) => h >= x && h < y); if (f >= 0) M[w][f].push(a); });
  const col = h => h == null ? 'transparent' : `color-mix(in srgb, ${h <= CC.sla / 4 ? '#5E8F5A' : h <= CC.sla ? '#C08A2E' : '#B4543F'} ${h <= CC.sla / 4 ? 30 : 34}%, transparent)`;
  return `<div class="crm-rv cc-b"><h4>Horario de asignación</h4><p>Respuesta mediana del asesor según el día y la hora en que se asignó (pasá el mouse para ver cuántos).</p>
    <div class="crm-scroll"><table class="cc-heat"><thead><tr><th></th>${CC_FRANJAS.map(f => `<th>${f[0]}</th>`).join('')}</tr></thead><tbody>${M.map((r, w) => `<tr><th>${CC_DIAS[w]}</th>${r.map(l => { const m = _ccMed(l.filter(a => a.resp != null).map(a => a.resp)), s = l.filter(a => a.sinAtender).length; return `<td style="background:${l.length ? col(m) : 'transparent'}" title="${l.length} asignado${l.length !== 1 ? 's' : ''}${s ? ' · ' + s + ' sin atender' : ''}">${l.length ? (m != null ? _ccH(m) : '·') : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
/* Lectura automática: lo que no salta a la vista en las tablas */
function ccLecturaHTML(L, S) {
  const out = [], G = {}; L.forEach(a => (G[a.as] = G[a.as] || []).push(a));
  const A = Object.entries(G).map(([n, l]) => ({ n, S: _ccStats(l) }));
  A.filter(x => x.S.at >= 4 && S.med && x.S.med > S.med * 2).forEach(x => out.push(`<b>${_cbEsc(x.n)}</b> tarda ${_ccH(x.S.med)} en responder, más del doble que el equipo (${_ccH(S.med)}).`));
  const rap = L.filter(a => a.enTiempo), len = L.filter(a => a.resp != null && !a.enTiempo);
  if (rap.length >= 5 && len.length >= 5) { const r1 = _decPct(rap.filter(a => a.reserva).length, rap.length), r2 = _decPct(len.filter(a => a.reserva).length, len.length); if (Math.abs((r1 || 0) - (r2 || 0)) >= 3) out.push(`Los atendidos dentro de las ${CC.sla} h reservan ${_decFmtPct(r1)}; los atendidos más tarde, ${_decFmtPct(r2)}.`); }
  if (S.res >= 3) A.filter(x => x.S.n >= 6).forEach(x => { const sh = x.S.n / S.n, sr = x.S.res / S.res; if (sh >= .15 && sr < sh * .6) out.push(`<b>${_cbEsc(x.n)}</b> recibe el ${Math.round(sh * 100)}% de los clientes del call center pero aporta el ${Math.round(sr * 100)}% de las reservas.`); else if (sr >= .2 && sr > sh * 1.5) out.push(`<b>${_cbEsc(x.n)}</b> convierte por encima del resto: ${Math.round(sh * 100)}% de los clientes y ${Math.round(sr * 100)}% de las reservas. Conviene darle más turnos.`); });
  const F = {}; L.forEach(a => (F[a.fuente] = F[a.fuente] || []).push(a));
  const Fs = Object.entries(F).map(([n, l]) => ({ n, S: _ccStats(l) })).filter(x => x.S.n >= 5).sort((a, b) => (b.S.conv || 0) - (a.S.conv || 0));
  if (Fs.length >= 2 && (Fs[0].S.conv || 0) > (Fs[Fs.length - 1].S.conv || 0)) out.push(`Mejor fuente: <b>${_cbEsc(Fs[0].n)}</b> (${_decFmtPct(Fs[0].S.conv)} llega a reserva). La más floja: <b>${_cbEsc(Fs[Fs.length - 1].n)}</b> (${_decFmtPct(Fs[Fs.length - 1].S.conv)}).`);
  const sinCod = L.filter(a => a.fuente === 'Sin código').length; if (sinCod >= 3 && sinCod / S.n > .15) out.push(`${sinCod} asignaciones (${Math.round(sinCod * 100 / S.n)}%) no tienen campaña ni origen: así no se puede medir qué anuncio trae clientes.`);
  const nv = L.filter(a => a.visito && !a.d?.acts?.length && !a.reserva && !a.perdido).length; if (nv >= 3) out.push(`${nv} clientes que ya visitaron no tienen ninguna actividad agendada en el embudo: nadie sabe cuál es el próximo paso.`);
  const dup = L.filter(a => a.previo).length; if (dup) out.push(`${dup} cliente${dup !== 1 ? 's' : ''} ${dup !== 1 ? 'llegaron' : 'llegó'} por el call center cuando ya ${dup !== 1 ? 'tenían' : 'tenía'} historia con otro asesor: revisar a quién le corresponde antes de asignar.`);
  if (S.nLead >= 3 && S.lead > 24) out.push(`Entre que entra el lead y el call center lo asigna pasan ${_ccH(S.lead)} (mediana). Cuanto antes se asigna, más probable el contacto.`);
  return out.length ? `<div class="crm-rv cc-b cc-lec"><h4>Lo que muestran los números</h4>${out.slice(0, 7).map(t => `<div>• ${t}</div>`).join('')}</div>` : '';
}
function ccListaHTML(L) {
  const l = L.slice().sort((a, b) => (b.vencida - a.vencida) || b.ts - a.ts);
  return `<div class="crm-rv cc-b cc-ancho"><h4>Detalle de asignaciones <span>${L.length}</span></h4><div class="crm-scroll"><table class="dec-t crm-tl cc-tl"><thead><tr><th>Asignado</th><th>Cliente</th><th>Campaña / origen</th>${crm.modo === 'cc' ? '' : '<th>Asignó</th>'}<th>Asesor</th><th>Visita agendada</th><th>Primera respuesta</th><th>Etapa ahora</th><th>Último movimiento</th></tr></thead><tbody>
    ${l.slice(0, 400).map(a => { const e = CRM_ETAPAS[CRM_RANK[a.etapa]]; return `<tr onclick="crmDetalle('${a.id}')" class="${a.vencida ? 'rot' : ''}"><td>${_ccF(a.ts)}</td><td>${_cbEsc(a.nombre)}${a.v.cotizacionKey ? ' <i class="cc-tag">cotización</i>' : ''}${a.previo ? ' <i class="cc-tag warn" title="Ya tenía historia con ' + _cbEsc(a.previo) + '">ya era de ' + _cbEsc(a.previo.split(' ')[0]) + '</i>' : ''}</td><td>${_cbEsc(a.fuente)}</td>${crm.modo === 'cc' ? '' : `<td>${_cbEsc(a.por)}</td>`}<td>${_cbEsc(a.as)}</td>
      <td class="${a.agendaPasada && !a.perdido ? 'low' : ''}">${a.v.fecha ? a.v.fecha.split('-').reverse().slice(0, 2).join('/') + (a.v.hora ? ' ' + _cbEsc(a.v.hora) : '') : '—'}</td>
      <td class="${a.vencida ? 'low' : a.resp != null && !a.enTiempo ? 'cc-tarde' : ''}">${a.resp != null ? _ccH(a.resp) : 'sin atender · ' + _ccH(a.espera)}</td><td><i class="crm-dot" style="background:${e.c}"></i>${e.n}${a.perdido && a.motivo ? ' · ' + _cbEsc(a.motivo) : ''}</td><td>${a.ultAct ? 'hace ' + _cbHace(a.ultAct) : '—'}</td></tr>`; }).join('')}</tbody></table></div>${L.length > 400 ? '<p class="crm-vacio">Se muestran 400; el Excel trae todas.</p>' : ''}</div>`;
}
function ccExportar() {
  if (typeof XLSX === 'undefined') { toastErr?.('No está cargada la librería de Excel.'); return; }
  const L = ccFiltradas(ccAsignaciones()), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(L.map(a => ({ Asignado: new Date(a.ts).toLocaleString('es-BO'), Cliente: a.nombre, Teléfono: a.v.telefono || '', 'Campaña / origen': a.fuente, Asignó: a.por, Asesor: a.as, 'Visita agendada': a.v.fecha || '', 'Primera respuesta': a.primer ? new Date(a.primer).toLocaleString('es-BO') : '', 'Horas a la respuesta': a.resp != null ? Math.round(a.resp * 10) / 10 : '', 'A tiempo': a.resp == null ? (a.vencida ? 'No (sin atender)' : 'Pendiente') : a.enTiempo ? 'Sí' : 'No', Visitó: a.visito ? 'Sí' : '', Cotizado: a.cotizo ? 'Sí' : '', 'Etapa ahora': CRM_ETAPAS[CRM_RANK[a.etapa]].n, 'Motivo de descarte': a.motivo, 'Ya era de otro asesor': a.previo, Interés: a.v.interes || '' }))), 'Asignaciones');
  const G = {}; L.forEach(a => (G[a.as] = G[a.as] || []).push(a));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(G).map(([n, l]) => { const S = _ccStats(l); return { Asesor: n, Asignados: S.n, 'Sin atender': S.sin, 'Respuesta mediana (h)': S.med != null ? Math.round(S.med * 10) / 10 : '', 'A tiempo %': S.enT != null ? Math.round(S.enT) : '', Visitaron: S.vis, Cotizados: S.cot, Reservas: S.res, 'Asignado → reserva %': S.conv != null ? Math.round(S.conv * 10) / 10 : '', Descartados: S.perd, 'Motivo principal': S.mot }; })), 'Por asesor');
  XLSX.writeFile(wb, 'CallCenter-asignaciones-' + _crmHoy() + '.xlsx');
}

/* ── Integración ── */
(function () {
  // El momento en que el asesor abre la agenda que le asignaron ("Confirmar visita") queda registrado: es su primera respuesta.
  function envolverAgenda() {
    const up = window._fbUpdateVisitaProgramada; if (typeof up !== 'function' || up.__cc) return;
    const w = function (key, data) { try { if (data && data.estado === 'en_proceso') { const v = _decArr('visitasProgramadasData').find(x => x._key === key); if (v && !v.tomadaTs) data = { ...data, tomadaTs: Date.now() }; } } catch (e) {} return up.call(this, key, data); };
    w.__cc = true; window._fbUpdateVisitaProgramada = w;
  }
  const eu = window.entrarUsuario;
  if (typeof eu === 'function') window.entrarUsuario = function (...a) {
    const out = eu.apply(this, a);
    try { envolverAgenda(); const ase = asesorActual, mods = ase?.modulos || (typeof ROL_MODULOS !== 'undefined' ? ROL_MODULOS[ase?.rol] : null) || [];
      if (mods.includes('callcenter')) {
        const wrap = document.getElementById('user-tabs-wrap');
        if (wrap && !wrap.querySelector('[data-t="ccseg"]')) { const b = document.createElement('button'); b.className = 'user-tab'; b.dataset.t = 'ccseg'; b.textContent = '📈 Seguimiento'; b.onclick = () => switchUserTab('ccseg'); const ref = [...wrap.children].find(x => /Agendar visita/.test(x.textContent)); ref ? ref.after(b) : wrap.appendChild(b); }
        if (!document.getElementById('utab-ccseg')) { const d = document.createElement('div'); d.id = 'utab-ccseg'; d.style.display = 'none'; (document.getElementById('utab-callcenter') || document.getElementById('utab-ventas'))?.after(d); }
      } } catch (e) {}
    return out;
  };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) { const out = ea.apply(this, a); envolverAgenda(); return out; };
  const su = window.switchUserTab;
  if (typeof su === 'function') window.switchUserTab = function (id, ...r) {
    const el = document.getElementById('utab-ccseg');
    if (id === 'ccseg') {
      su.call(this, '__ninguna__', false); const emb = document.getElementById('utab-embudo'); if (emb) emb.style.display = 'none'; if (el) el.style.display = 'block';
      document.querySelectorAll('#user-tabs-wrap .user-tab').forEach(b => b.classList.toggle('active', b.dataset.t === 'ccseg'));
      crm.modo = 'cc'; crm.f.ases = ''; crmEscuchar();
      if (!CC.escuchando && window._fbListenTodos) { CC.escuchando = true; window._fbListenTodos(arr => { CC.regs = arr; crmRefrescar(); }); }
      crmRefrescar(true); return;
    }
    if (el) el.style.display = 'none'; return su.call(this, id, ...r);
  };
  // Vigilancia del Tablero de decisiones: clientes asignados que nadie tomó
  const dv = window.decVigilar;
  if (typeof dv === 'function') window.decVigilar = function (...a) {
    const S = dv.apply(this, a);
    try { if (crm.modo === 'admin' && Array.isArray(S)) { const now = Date.now(), l = ccAsignaciones().filter(x => x.vencida && now - x.ts < 30 * 864e5).sort((x, y) => x.ts - y.ts);
      if (l.length) S.push({ sev: l.length >= 5 ? 'alta' : 'media', area: 'Call center', t: `${l.length} cliente${l.length !== 1 ? 's' : ''} del call center sin respuesta del asesor hace más de ${CC.sla} h`, det: 'Asignados en los últimos 30 días sin ningún movimiento del asesor (no abrió la agenda, no registró visita, no cotizó, no agendó nada).', items: l.map(x => [x.nombre, x.as, 'asignado hace ' + _ccH((now - x.ts) / 36e5)]), ir: "embudo');crmVista('callcenter" }); } } catch (e) {}
    return S;
  };
  setInterval(() => { if (crm.modo === 'cc' && CC.regs && crm.firmaCC !== CC.regs) { crm.firmaCC = CC.regs; crmRefrescar(); } }, 2500);
})();
/* ════════════════════════════════════════════════════════════════════════
   CLIENTES Y VISITAS
   1) Visitas: un registro por cliente con su historial de visitas. Cuando el
      cliente vuelve, la nueva visita se agrega al mismo registro (registro.visitas)
      sin mover la fecha de la primera. Solo las presenciales cuentan como visita.
   2) Padrón de clientes: código único UV-C-0001 por persona, guardado aparte en
      clientes_padron/ (no se toca ningún registro). Une visitas, cotizaciones y
      agendas por el vínculo que ya tienen, el teléfono y el nombre.
   3) "No vino": la agenda asignada vuelve sola a la cola del call center.
   ════════════════════════════════════════════════════════════════════════ */
const VIS_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const _visHoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const _visF = f => f ? String(f).split('-').reverse().join('/') : '';

/* ── Visitas presenciales de un registro, numeradas (1ª, 2ª…) ── */
function visitasDeRegistro(r) {
  if (!r) return [];
  const ev = [], f0 = r.fecha || (r.ts ? new Date(r.ts).toISOString().slice(0, 10) : '');
  if ((r.detalleVisita || 'Presencial') !== 'Virtual' && f0) ev.push({ fecha: f0, ts: r.ts || Date.parse(f0 + 'T12:00:00'), tipo: r.detalleVisita || 'Presencial', primera: true, mes: r.mes || VIS_MESES[+f0.slice(5, 7) - 1], anio: r.ts ? new Date(r.ts).getFullYear() : +f0.slice(0, 4), por: r.asesorNombre || '' });
  Object.entries(r.visitas || {}).forEach(([k, v]) => { if (v && v.fecha && v.tipo !== 'Virtual') ev.push({ ...v, k, ts: v.ts || Date.parse(v.fecha + 'T12:00:00'), mes: VIS_MESES[+v.fecha.slice(5, 7) - 1], anio: +v.fecha.slice(0, 4) }); });
  ev.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.ts - b.ts); ev.forEach((e, i) => { e.n = i + 1; });
  return ev;
}
/* Una fila por visita presencial, con los datos del registro: así cada tablero cuenta visitas con sus mismos filtros de siempre */
function visitasComoRegs(regs) {
  const out = []; (regs || []).forEach(r => visitasDeRegistro(r).forEach(e => out.push({ ...r, mes: e.mes, fecha: e.fecha, ts: e.primera ? r.ts : e.ts, _visitaN: e.n, _reg: r })));
  return out;
}
function _visTodas(r) { return 1 + Object.keys(r?.visitas || {}).length; }

/* ── Modal propio (promesa) ── */
function _visModal(html) {
  return new Promise(res => {
    let m = document.getElementById('vis-modal'); if (!m) { m = document.createElement('div'); m.id = 'vis-modal'; m.className = 'crm-modal'; document.body.appendChild(m); }
    m.innerHTML = `<div class="crm-modal-c vis-c">${html}</div>`; m.classList.add('on');
    m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { m.classList.remove('on'); res(b.dataset.r); });
    m.onclick = e => { if (e.target === m) { m.classList.remove('on'); res(null); } };
  });
}

/* ── Actualizar seguimiento: primero preguntar si el cliente volvió ── */
(function () {
  const ed = window.editarRegistroExistente;
  if (typeof ed === 'function') window.editarRegistroExistente = async function (key, ...r) {
    const reg = (typeof misRegs !== 'undefined' ? misRegs : []).find(x => x._key === key);
    if (!reg) return ed.call(this, key, ...r);
    const n = visitasDeRegistro(reg).length;
    const op = await _visModal(`<h3>${esc(reg.nombre || 'Cliente')}</h3><p class="crm-sub">Lleva ${n} visita${n !== 1 ? 's' : ''} presencial${n !== 1 ? 'es' : ''}${n ? ' (última: ' + _visF(visitasDeRegistro(reg).pop().fecha) + ')' : ''}. ¿Qué pasó ahora?</p>
      <div class="vis-op"><button type="button" data-r="Presencial"><b>Volvió al proyecto</b><span>Se registra como su ${n + 1}ª visita</span></button>
      <button type="button" data-r="Virtual"><b>Reunión virtual</b><span>Queda en su historia, no cuenta como visita</span></button>
      <button type="button" data-r="no"><b>No hubo visita</b><span>Solo actualizo el seguimiento (estado, calificación, notas)</span></button></div>`);
    if (!op) return;
    ed.call(this, key, ...r);
    const fn = document.getElementById('f-nombre');
    if (op === 'no') { delete fn.dataset.nuevaVisita; const sp = document.querySelector('#f-editando-aviso span'); if (sp) sp.textContent = '✏️ Estás editando un registro que ya guardaste antes.'; return; }
    fn.dataset.nuevaVisita = op; fn.dataset.visitaRegKey = key;
    const ff = document.getElementById('f-fecha'); if (ff) ff.value = _visHoy();
    const av = document.getElementById('f-editando-aviso');
    if (av) { av.style.display = 'flex'; const t = av.querySelector('span') || av; t.textContent = op === 'Presencial' ? `Registrando la ${n + 1}ª visita de ${reg.nombre}. La fecha de arriba es la de esta visita; la de la primera no se toca.` : `Registrando una reunión virtual con ${reg.nombre}.`; }
  };

  const gv = window.guardarVisita;
  if (typeof gv === 'function') window.guardarVisita = async function (...a) {
    const fn = document.getElementById('f-nombre'), ek = document.getElementById('f-editing-key'), yo = typeof asesorActual !== 'undefined' ? asesorActual : null;
    if (!fn || !ek || !yo) return gv.apply(this, a);
    // Registro nuevo de un cliente que ya está en el fichero del asesor: ¿es la misma persona que volvió?
    if (!ek.value && fn.value.trim()) {
      const id = _crmId(fn.value.trim()), prev = (typeof misRegs !== 'undefined' ? misRegs : []).filter(r => _crmId(r.nombre || '') === id).sort((x, y) => (y.ts || 0) - (x.ts || 0))[0];
      if (prev) {
        const n = visitasDeRegistro(prev).length;
        const op = await _visModal(`<h3>${esc(prev.nombre)} ya está en tu fichero</h3><p class="crm-sub">Primera visita el ${_visF(prev.fecha)} · estado ${esc(prev.conclusion || 'sin conclusión')}. ¿Es la misma persona que volvió?</p>
          <div class="vis-op"><button type="button" data-r="si"><b>Sí, es el mismo cliente</b><span>Se suma como su ${n + 1}ª visita y se actualiza su seguimiento</span></button>
          <button type="button" data-r="otro"><b>No, es otra persona</b><span>Se crea un registro nuevo</span></button></div>`);
        if (!op) return;
        if (op === 'si') {
          const tipo = (document.querySelector('input[name=detalleVisita]:checked') || {}).value || 'Presencial';
          // completa lo que quedó vacío con lo que ya sabíamos del cliente
          [['f-ciudad', 'ciudadProcedencia'], ['f-origen', 'origen'], ['f-aspecto', 'aspectoPreferente'], ['f-presupuesto', 'presupuesto'], ['f-pct-cierre', 'pctCierre'], ['f-motivo-no-cierre', 'motivoNoCierre'], ['f-pago', 'formaPago']].forEach(([el, k]) => { const e = document.getElementById(el); if (e && !e.value && prev[k]) e.value = prev[k]; });
          ['genero', 'interes', 'calificacion', 'usoPropiedad'].forEach(k => { if (!document.querySelector(`input[name=${k}]:checked`) && prev[k]) { const e = document.querySelector(`input[name=${k}][value="${prev[k]}"]`); if (e) e.checked = true; } });
          const fc = document.getElementById('f-comentarios'); if (fc && prev.comentarios && !fc.value.includes(prev.comentarios)) fc.value = (fc.value ? fc.value + '\n— ' : '') + prev.comentarios;
          ek.value = prev._key; fn.dataset.nuevaVisita = tipo; fn.dataset.visitaRegKey = prev._key;
        }
      }
    }
    const nueva = fn.dataset.nuevaVisita, rk = fn.dataset.visitaRegKey, prog = fn.dataset.visitaProgramadaKey;
    if (!nueva || !ek.value || ek.value !== rk) return gv.apply(this, a);
    // Nueva visita sobre un registro existente: el registro conserva la fecha y el tipo de su primera visita
    const reg = misRegs.find(x => x._key === rk); if (!reg) return gv.apply(this, a);
    const ff = document.getElementById('f-fecha'), fecha = ff?.value || _visHoy();
    if (ff) ff.value = reg.fecha || fecha;
    const rad = document.querySelector(`input[name=detalleVisita][value="${reg.detalleVisita || 'Presencial'}"]`); if (rad) rad.checked = true;
    await gv.apply(this, a);
    if (document.getElementById('f-editing-key')?.value) { if (ff) ff.value = fecha; return; }   // no se guardó (faltaba algo)
    const n = nueva === 'Virtual' ? null : visitasDeRegistro(reg).length + 1;
    try {
      const k = 'v' + Date.now().toString(36);
      await window._fbUpdateRegistro(yo._key, rk, { ['visitas/' + k]: { fecha, tipo: nueva, ts: Date.now(), n, por: yo.nombre, ...(prog ? { programadaKey: prog } : {}) } });
      if (prog) await window._fbUpdateVisitaProgramada(prog, { estado: 'completada', registroKey: rk, completadaTs: Date.now() });
      toastOk(nueva === 'Virtual' ? 'Reunión virtual registrada.' : `${n}ª visita de ${reg.nombre} registrada.`);
    } catch (e) { toastErr('Se guardó el seguimiento, pero no la visita: ' + (e.message || 'revisá la conexión.')); }
    delete fn.dataset.nuevaVisita; delete fn.dataset.visitaRegKey; delete fn.dataset.visitaProgramadaKey;
  };
  // si cancela la edición, se olvida la visita en curso
  const lf = window.limpiarFormVisita;
  if (typeof lf === 'function') window.limpiarFormVisita = function (...a) { const fn = document.getElementById('f-nombre'); if (fn) { delete fn.dataset.nuevaVisita; delete fn.dataset.visitaRegKey; } const sp = document.querySelector('#f-editando-aviso span'); if (sp) sp.textContent = '✏️ Estás editando un registro que ya guardaste antes.'; return lf.apply(this, a); };
})();

/* ════════════ "No vino" y cola de devueltos del call center ════════════ */
async function noVinoVisitaProgramada(key) {
  const v = (typeof misVisitasProgramadas !== 'undefined' ? misVisitasProgramadas : []).find(x => x._key === key); if (!v) return;
  const op = await _visModal(`<h3>${esc(v.nombre)} no vino</h3><p class="crm-sub">La agenda del ${_visF(v.fecha)} vuelve al call center para que lo contacten y lo reagenden.</p>
    <input id="vis-nv-mot" class="crm-in" style="width:100% !important" placeholder="Qué pasó (opcional): no contestó, se le complicó, pidió otra fecha…">
    <div class="crm-acc" style="margin-top:10px"><button type="button" class="p" data-r="ok">Devolver al call center</button><button type="button" data-r="">Cancelar</button></div>`);
  if (op !== 'ok') return;
  const mot = (document.getElementById('vis-nv-mot')?.value || '').trim(), yo = asesorActual;
  try {
    await window._fbUpdateVisitaProgramada(key, { estado: 'no_asistio', noAsistioTs: Date.now(), noAsistioMotivo: mot });
    await window._fbPushVisitaProgramada({ nombre: v.nombre, telefono: v.telefono || '', asesorKey: yo._key, asesorNombre: yo.nombre, fecha: _visHoy(), hora: '', mes: VIS_MESES[new Date().getMonth()], anio: new Date().getFullYear(),
      origen: v.origen || '', campaniaCodigo: v.campaniaCodigo || '', interes: `No vino a la visita del ${_visF(v.fecha)}.` + (mot ? ' ' + mot : '') + (v.interes ? ' · Antes: ' + v.interes : ''),
      cargadoPorKey: yo._key, cargadoPorNombre: yo.nombre, estado: 'pendiente', esDevolucion: true, noVino: true, programadaOrigenKey: key, cotizacionKey: v.cotizacionKey || '', cotizacionCodigo: v.cotizacionCodigo || '' });
    toastOk(v.nombre + ' volvió al call center.');
  } catch (e) { toastErr('No se pudo devolver: ' + (e.message || 'revisá la conexión.')); }
}
function ccDevueltosPend() { return _decArr('visitasProgramadasData').filter(v => v.esDevolucion && v.estado === 'pendiente').sort((a, b) => (b.ts || 0) - (a.ts || 0)); }
function renderColaDevueltos() {
  const host = document.getElementById('utab-callcenter'); if (!host) return;
  let el = document.getElementById('cc-devueltos');
  if (!el) { el = document.createElement('div'); el.id = 'cc-devueltos'; host.prepend(el); }
  const L = ccDevueltosPend();
  el.innerHTML = L.length ? `<div class="cc-dev"><h4>Devueltos para retomar <span>${L.length}</span></h4><p>Clientes que el asesor devolvió o que no vinieron a la visita. Reasignalos con una nueva agenda o cerralos.</p>
    ${L.map(v => `<div class="cc-dev-i"><div><b>${esc(v.nombre)}</b>${v.noVino ? ' <i class="cc-tag warn">no vino</i>' : ' <i class="cc-tag">devuelto</i>'}<span>${esc(v.asesorNombre || '')} · ${new Date(v.ts || Date.now()).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}${v.telefono ? ' · ' + esc(v.telefono) : ''}</span>${v.interes ? `<em>${esc(String(v.interes).replace(/ · https?:\/\/\S+/, ''))}</em>` : ''}</div>
      <div class="crm-acc"><button type="button" class="p" onclick="ccReasignarDevuelto('${v._key}')">Reasignar</button><button type="button" onclick="ccCerrarDevuelto('${v._key}')">Cerrar</button></div></div>`).join('')}</div>` : '';
}
function ccReasignarDevuelto(key) {
  const v = _decArr('visitasProgramadasData').find(x => x._key === key); if (!v) return;
  const set = (id, val) => { const e = document.getElementById(id); if (e && val != null) e.value = val; };
  set('cc-nombre', v.nombre); set('cc-telefono', v.telefono || ''); set('cc-origen', v.origen || ''); set('cc-campania', v.campaniaCodigo || ''); set('cc-interes', 'Retomar: ' + String(v.interes || '').replace(/ · https?:\/\/\S+/, ''));
  window._ccDevKey = key; document.getElementById('cc-nombre')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toastOk('Elegí asesor, fecha y hora, y guardá la agenda.');
}
async function ccCerrarDevuelto(key) {
  const op = await _visModal(`<h3>Cerrar sin reasignar</h3><div class="crm-chips">${['No contesta', 'Ya no le interesa', 'Compró en otro lado', 'Datos equivocados'].map(m => `<button type="button" onclick="document.getElementById('vis-cd-mot').value='${m}'">${m}</button>`).join('')}</div><input id="vis-cd-mot" class="crm-in" style="width:100% !important" placeholder="Motivo"><div class="crm-acc" style="margin-top:10px"><button type="button" class="p" data-r="ok">Cerrar</button><button type="button" data-r="">Cancelar</button></div>`);
  if (op !== 'ok') return;
  try { await window._fbUpdateVisitaProgramada(key, { estado: 'cerrada', cerradaTs: Date.now(), cerradaMotivo: document.getElementById('vis-cd-mot')?.value || '', cerradaPor: asesorActual?.nombre || '' }); toastOk('Cerrado.'); } catch (e) { toastErr('No se pudo cerrar.'); }
}
(function () {
  const g = window.guardarVisitaProgramada;
  if (typeof g === 'function') window.guardarVisitaProgramada = async function (...a) {
    const dk = window._ccDevKey, ok = document.getElementById('cc-nombre')?.value.trim() && document.getElementById('cc-asesor')?.value, as = document.getElementById('cc-asesor')?.selectedOptions?.[0]?.textContent || '';
    await g.apply(this, a);
    if (dk && ok) { window._ccDevKey = null; try { await window._fbUpdateVisitaProgramada(dk, { estado: 'reasignada', reasignadaTs: Date.now(), reasignadaA: as }); } catch (e) {} }
  };
  const r = window.renderVisitasProgramadasCallCenter;
  if (typeof r === 'function') window.renderVisitasProgramadasCallCenter = function (...a) { const o = r.apply(this, a); try { renderColaDevueltos(); } catch (e) {} return o; };
})();

/* ════════════ PADRÓN DE CLIENTES: código único ════════════ */
const PADRON = { data: { idx: {}, fichas: {}, fus: {}, sep: {}, seq: 0 }, escuchando: false, sincronizando: false, ult: 0, cl: null };
const _padTel = s => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-8) : ''; };
const _padTok = s => _cbN(s).split(/[^a-z0-9]+/).filter(t => t.length > 1 && !/^\d+$/.test(t));
function padronEscuchar() {
  if (PADRON.escuchando || !window._fbPadron) return; PADRON.escuchando = true;
  window._fbPadron.listen(v => { PADRON.data = { idx: {}, fichas: {}, fus: {}, sep: {}, seq: 0, ...v }; PADRON.cl = null; try { if (typeof crmRefrescar === 'function') crmRefrescar(); } catch (e) {} });
}
function padronCodigo(c) { let k = c, i = 0; while (k && PADRON.data.fus?.[k] && i++ < 20) k = PADRON.data.fus[k]; return k; }
/* Arma los grupos (cada grupo = una persona). regs/cots/vis: lo que la sesión tiene a mano */
function padronAgrupar(regs, cots, vis) {
  const P = {}, F = x => { while (P[x] !== x) { P[x] = P[P[x]]; x = P[x]; } return x; }, U = (a, b) => { if (!a || !b || P[a] == null || P[b] == null) return; a = F(a); b = F(b); if (a !== b) P[a > b ? a : b] = a > b ? b : a; };
  const N = {}, add = (id, o) => { P[id] = id; N[id] = o; };
  const D = PADRON.data, sep = D.sep || {};
  (regs || []).forEach(r => { if (r._key) add('r_' + (r._asesorId || '') + '_' + r._key, { t: 'reg', r, nom: r.nombre || '', tel: _padTel(r.celular || r.telefono), as: r.asesorNombre || '', ts: r.ts || 0 }); });
  (cots || []).forEach(c => { if (c._key) add('c_' + c._key, { t: 'cot', r: c, nom: c.cliente || '', tel: _padTel(c.celular), as: c.asesorNombre || '', ts: c.ts || 0 }); });
  (vis || []).forEach(v => { if (v._key) add('v_' + v._key, { t: 'vis', r: v, nom: v.nombre || '', tel: _padTel(v.telefono), as: v.asesorNombre || '', ts: v.ts || 0 }); });
  const regPorKey = {}; Object.entries(N).forEach(([id, o]) => { if (o.t === 'reg') regPorKey[o.r._key] = id; });
  // 1) códigos ya guardados (incluye uniones y separaciones hechas a mano)
  const porCod = {}; Object.keys(N).forEach(id => { const c = padronCodigo(sep[id] || D.idx?.[id]); if (c) (porCod[c] = porCod[c] || []).push(id); });
  Object.values(porCod).forEach(l => l.forEach(id => U(l[0], id)));
  // 2) vínculos explícitos: cotización hecha desde el registro, agenda completada, agenda con cotización
  Object.entries(N).forEach(([id, o]) => { const r = o.r;
    if (o.t === 'cot' && r.registroKey && regPorKey[r.registroKey]) U(id, regPorKey[r.registroKey]);
    if (o.t === 'vis' && r.registroKey && regPorKey[r.registroKey]) U(id, regPorKey[r.registroKey]);
    if (o.t === 'vis' && r.cotizacionKey && N['c_' + r.cotizacionKey]) U(id, 'c_' + r.cotizacionKey); });
  // 3) mismo teléfono, mismo nombre completo, o nombre corto contenido en el largo con el mismo asesor (los separados a mano no entran)
  const libre = id => !sep[id], byTel = {}, byNom = {}, porAs = {};
  Object.entries(N).forEach(([id, o]) => { if (!libre(id)) return; if (o.tel) (byTel[o.tel] = byTel[o.tel] || []).push(id); const n = _crmId(o.nom); if (n && n !== 'sin-nombre') (byNom[n] = byNom[n] || []).push(id); (porAs[o.as] = porAs[o.as] || []).push(id); });
  [byTel, byNom].forEach(M => Object.values(M).forEach(l => l.forEach(id => U(l[0], id))));
  // nombre corto ("Laura Méndez") dentro de uno largo ("Laura Méndez Rojas") del mismo asesor: se unen solo si hay UNA persona posible
  // (con índice por palabra: solo se comparan nombres que comparten la palabra menos común)
  Object.values(porAs).forEach(l => { const T = l.map(id => [id, new Set(_padTok(N[id].nom)), _crmId(N[id].nom)]).filter(([, s]) => s.size >= 2);
    const idx = {}, porNom = {}, hecho = {}; T.forEach((x, i) => { x[1].forEach(t => (idx[t] = idx[t] || []).push(i)); (porNom[x[2]] = porNom[x[2]] || []).push(x[0]); });
    T.forEach(([a, A, na]) => {
      if (!(na in hecho)) { const toks = [...A].sort((x, y) => idx[x].length - idx[y].length), cand = new Set();
        idx[toks[0]].forEach(i => { const [, B, nb] = T[i]; if (nb !== na && A.size < B.size && toks.every(t => B.has(t))) cand.add(nb); });
        hecho[na] = cand.size === 1 ? [...cand][0] : null; }
      if (hecho[na]) porNom[hecho[na]].forEach(b => U(a, b)); }); });
  // grupos
  const G = {}; Object.keys(N).forEach(id => { const k = F(id); (G[k] = G[k] || { nodos: [], cods: new Set() }).nodos.push(id); const c = padronCodigo(sep[id] || D.idx?.[id]); if (c) G[k].cods.add(c); });
  Object.values(G).forEach(g => { const cs = [...g.cods].sort(); g.cod = cs[0] || null; g.otros = cs.slice(1); g.nom = g.nodos.map(id => N[id].nom).filter(Boolean).sort((a, b) => b.length - a.length)[0] || ''; });
  const deNodo = {}; Object.entries(G).forEach(([k, g]) => g.nodos.forEach(id => { deNodo[id] = k; }));
  return { N, G, deNodo };
}
/* Guarda los códigos nuevos (solo desde una sesión que ve todos los datos: administración) */
async function padronSincronizar() {
  if (PADRON.sincronizando || !window._fbPadron || typeof modoAdmin === 'undefined' || !modoAdmin || !PADRON.escuchando) return;
  const regs = _decArr('todosRegs'); if (!regs.length) return;
  PADRON.sincronizando = true;
  try {
    const { N, G } = padronAgrupar(regs, _decArr('cotizacionesData'), _decArr('visitasProgramadasData')), D = PADRON.data, up = {};
    const nuevos = Object.values(G).filter(g => !g.cod).sort((a, b) => Math.min(...a.nodos.map(id => N[id].ts || 9e15)) - Math.min(...b.nodos.map(id => N[id].ts || 9e15)));
    if (nuevos.length) { const fin = await window._fbPadron.reservar(nuevos.length); let n = fin - nuevos.length; nuevos.forEach(g => { g.cod = 'UV-C-' + String(++n).padStart(4, '0'); up['fichas/' + g.cod] = { nombre: g.nom, alta: Date.now() }; }); }
    Object.values(G).forEach(g => { g.otros.forEach(c => { if (D.fus?.[c] !== g.cod) up['fus/' + c] = g.cod; }); g.nodos.forEach(id => { if (!(D.sep || {})[id] && padronCodigo(D.idx?.[id]) !== g.cod && D.idx?.[id] !== g.cod) up['idx/' + id] = g.cod; }); });
    if (Object.keys(up).length) await window._fbPadron.update(up);
  } catch (e) { console.warn('padrón:', e); }
  PADRON.sincronizando = false; PADRON.ult = Date.now();
}
/* Unir dos clientes (mismo cliente cargado dos veces) y separar un registro que no es de esa persona */
async function padronUnir(a, b) { if (!a || !b || a === b) return; const [m, x] = [a, b].sort(); await window._fbPadron.update({ ['fus/' + x]: m }); toastOk?.(`${x} quedó unido a ${m}.`); }
async function padronSeparar(nodo) {
  const fin = await window._fbPadron.reservar(1), cod = 'UV-C-' + String(fin).padStart(4, '0');
  await window._fbPadron.update({ ['sep/' + nodo]: cod, ['idx/' + nodo]: cod, ['fichas/' + cod]: { nombre: '', alta: Date.now(), separado: true } }); toastOk?.('Separado como ' + cod + '.');
}
(function () {
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) { const o = ea.apply(this, a); padronEscuchar(); return o; };
  const eu = window.entrarUsuario;
  if (typeof eu === 'function') window.entrarUsuario = function (...a) { const o = eu.apply(this, a); padronEscuchar(); return o; };
  // en administración: guarda los códigos de clientes nuevos cada vez que cambian los datos (como mucho cada 20 s)
  setInterval(() => { if (typeof modoAdmin !== 'undefined' && modoAdmin && Date.now() - PADRON.ult > 20000) padronSincronizar(); }, 5000);
})();
