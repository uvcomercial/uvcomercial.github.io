/* ═══════════════════════════════════════════
   TENDENCIA VENTAS — gráfico de línea (Chart.js)
   Registros y cierres agrupados por mes-año real
   (usa el timestamp de carga, no el dropdown "mes"
   que no distingue entre años).
═══════════════════════════════════════════ */
let _chartTendenciaVentas = null;

function _claveMesAnio(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _etiquetaMesAnio(clave) {
  const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [y, m] = clave.split('-');
  return nombres[parseInt(m, 10) - 1] + ' ' + y.slice(2);
}

function renderTendenciaVentasChart() {
  const canvas = document.getElementById('chart-tendencia-ventas');
  const emptyMsg = document.getElementById('chart-tendencia-ventas-empty');
  if (!canvas || typeof Chart === 'undefined') return;

  const buckets = {};
  todosRegs.forEach(r => {
    if (!r.ts) return;
    const clave = _claveMesAnio(r.ts);
    if (!buckets[clave]) buckets[clave] = { total: 0, cierres: 0 };
    buckets[clave].total++;
    if (r.huboCierre === 'SI' || r.conclusion === 'Reserva') buckets[clave].cierres++;
  });
  const claves = Object.keys(buckets).sort(); // "YYYY-MM" ordena cronológicamente como string

  if (claves.length < 2) {
    canvas.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';

  const labels       = claves.map(_etiquetaMesAnio);
  const dataTotal     = claves.map(k => buckets[k].total);
  const dataCierres   = claves.map(k => buckets[k].cierres);

  const ctx = canvas.getContext('2d');
  const alto = canvas.height || 280;

  const gradTotal = ctx.createLinearGradient(0, 0, 0, alto);
  gradTotal.addColorStop(0, 'rgba(127,184,232,.22)');
  gradTotal.addColorStop(1, 'rgba(127,184,232,0)');

  const gradCierres = ctx.createLinearGradient(0, 0, 0, alto);
  gradCierres.addColorStop(0, 'rgba(110,231,183,.25)');
  gradCierres.addColorStop(1, 'rgba(110,231,183,0)');

  if (_chartTendenciaVentas) { _chartTendenciaVentas.destroy(); }

  _chartTendenciaVentas = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Registros totales',
          data: dataTotal,
          borderColor: '#2451FF',
          backgroundColor: gradTotal,
          borderWidth: 2.5,
          tension: .35,
          fill: true,
          pointRadius: 0,
          pointHitRadius: 12,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#2451FF',
          pointHoverBorderColor: '#FFFDF7',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Cierres',
          data: dataCierres,
          borderColor: '#38a169',
          backgroundColor: gradCierres,
          borderWidth: 2.5,
          tension: .35,
          fill: true,
          pointRadius: 0,
          pointHitRadius: 12,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#38a169',
          pointHoverBorderColor: '#FFFDF7',
          pointHoverBorderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: "'DM Sans',sans-serif", size: 12 }, color: '#0A0A0A' }
        },
        tooltip: {
          backgroundColor: '#0A0A0A', titleColor: '#FFFDF7', bodyColor: '#FFFDF7',
          titleFont: { family: "'DM Sans',sans-serif", weight: '600' },
          bodyFont: { family: "'DM Sans',sans-serif" },
          padding: 10, cornerRadius: 8, displayColors: true,
        },
        datalabels: {
          align: 'top', anchor: 'end', offset: 4,
          font: { family: "'DM Sans',sans-serif", weight: '700', size: 11 },
          color: (ctx) => ctx.dataset.borderColor,
          formatter: (v) => v > 0 ? v : '',
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: "'DM Sans',sans-serif", size: 11 }, color: '#0A0A0A' } },
        y: { beginAtZero: true, grid: { color: 'rgba(10,10,10,.10)' }, ticks: { font: { family: "'DM Sans',sans-serif", size: 11 }, color: '#0A0A0A', precision: 0 } }
      }
    }
  });
}

let kpiManualActual = { leads: 0, visitasAgendadas: 0 };

function abrirModalKpiManual() {
  const mesSel = document.getElementById('kpi-manual-mes');
  mesSel.value = mesActual();
  cargarKpiManualExistente();
  document.getElementById('modal-kpi-manual').classList.add('open');
}
function cerrarModalKpiManual() {
  document.getElementById('modal-kpi-manual').classList.remove('open');
}
function cargarKpiManualExistente() {
  const anio = anioActual();
  const mes = document.getElementById('kpi-manual-mes').value;
  window._fbListenKpiManualVentas(anio, mes, data => {
    document.getElementById('kpi-manual-leads').value = data.leads || '';
    document.getElementById('kpi-manual-agendadas').value = data.visitasAgendadas || '';
  });
}
async function guardarKpiManual() {
  const anio = anioActual();
  const mes = document.getElementById('kpi-manual-mes').value;
  const leads = parseInt(document.getElementById('kpi-manual-leads').value) || 0;
  const visitasAgendadas = parseInt(document.getElementById('kpi-manual-agendadas').value) || 0;
  const btn = document.querySelector('#modal-kpi-manual .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbSetKpiManualVentas(anio, mes, { leads, visitasAgendadas });
  btnSuccess(btn);
  toastOk('KPIs de ' + mes + ' actualizados.');
  setTimeout(() => { cerrarModalKpiManual(); renderDashboard(); }, 500);
}

let _chartsTendenciaMarketing = {};

function renderTendenciaMarketing(canvasId) {
  canvasId = canvasId || 'mkt-chart-tendencia';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hoy = new Date();
  // Últimos 6 meses calendario (incluye el actual)
  const buckets = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
    buckets.push({ mes: meses[d.getMonth()], anio: d.getFullYear(), label: meses[d.getMonth()].slice(0,3)+' '+String(d.getFullYear()).slice(2) });
  }
  const datosPorBucket = buckets.map(b => {
    const f = calcularFunnelDatos(b.mes, b.anio);
    return { label:b.label, leads:f[0].n, agendadas:f[1].n, concretadas:f[2].n, cierres:f[3].n };
  });

  if (_chartsTendenciaMarketing[canvasId]) _chartsTendenciaMarketing[canvasId].destroy();
  _chartsTendenciaMarketing[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: datosPorBucket.map(b=>b.label),
      datasets: [
        { label:'Leads', data:datosPorBucket.map(b=>b.leads), borderColor:'#7C3AED', backgroundColor:'transparent', tension:.35, pointRadius:3 },
        { label:'Visitas agendadas', data:datosPorBucket.map(b=>b.agendadas), borderColor:'#2451FF', backgroundColor:'transparent', tension:.35, pointRadius:3 },
        { label:'Visitas concretadas', data:datosPorBucket.map(b=>b.concretadas), borderColor:'#E0951A', backgroundColor:'transparent', tension:.35, pointRadius:3 },
        { label:'Cierres', data:datosPorBucket.map(b=>b.cierres), borderColor:'#1E8E3E', backgroundColor:'rgba(30,142,62,.14)', fill:true, tension:.35, pointRadius:3 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:'index' },
      plugins:{
        legend:{ display:true, position:'bottom', labels:{usePointStyle:true, color:'#0A0A0A'} },
        datalabels: {
          align: 'top', anchor: 'end', offset: 3,
          font: { family: "'DM Sans',sans-serif", weight: '700', size: 10 },
          color: (ctx) => ctx.dataset.borderColor,
          formatter: (v) => v > 0 ? v : '',
        }
      },
      scales:{
        x:{ ticks:{color:'#0A0A0A'}, grid:{color:'rgba(10,10,10,.10)'} },
        y:{ beginAtZero:true, ticks:{ precision:0, color:'#0A0A0A' }, grid:{color:'rgba(10,10,10,.10)'} }
      }
    }
  });
}

// Registros del EQUIPO INTERNO — excluye ventas cerradas por agentes externos
// (se cargan para reportarlas, pero no deben contar en metas ni en el rendimiento del equipo).
function soloInternos(regs) { return regs.filter(r => !r.esExterno); }

function calcularFunnelDatos(mes, anioC) {
  const vMes = soloInternos(todosRegs.filter(r => r.mes === mes && (!anioC || !r.ts || new Date(r.ts).getFullYear() === Number(anioC))));
  // visitas presenciales del mes: la 1ª de cada cliente y también las que volvió (historial del registro)
  const totalVisitas  = soloInternos(visitasComoRegs(todosRegs)).filter(r => r.mes === mes && (!anioC || !r.ts || new Date(r.ts).getFullYear() === Number(anioC))).length;
  const conCierre     = vMes.filter(_esCierreVenta).length;
  // Leads depurados: las cargas repetidas (mismo código + mismo rango) cuentan UNA sola vez
  const leadsReal      = (typeof leadsSemanalesDepurados === 'function' ? leadsSemanalesDepurados() : []).filter(l => l.mes===mes && Number(l.anio)===Number(anioC)).reduce((s,l)=>s+(l.cantidad||0),0)
                        || (typeof leadsData !== 'undefined' ? leadsData : []).filter(l => l.mes===mes && l.anio===anioC).length;
  const agendadasReal  = (typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : []).filter(v => v.mes===mes && v.anio===anioC).length;
  const convAgVsConc = agendadasReal ? Math.round(totalVisitas/agendadasReal*100) : undefined;
  const convConcVsCierre = totalVisitas ? Math.round(conCierre/totalVisitas*100) : undefined;
  return [
    { label:'Leads', n:leadsReal, color:'var(--accent)' },
    { label:'Visitas agendadas', n:agendadasReal, color:'var(--info)' },
    { label:'Visitas concretadas', n:totalVisitas, color:'var(--warn)', pct:convAgVsConc },
    { label:'Reservas del equipo', n:conCierre, color:'var(--cartera)', pct:convConcVsCierre },
  ];
}

function pintarFunnelEnDiv(elId, funnelData) {
  const el = document.getElementById(elId);
  if (!el) return;
  const maxF = Math.max(...funnelData.map(f=>f.n), 1);
  el.innerHTML = `<div class="funnel-viz">` + funnelData.map(f => {
    const pctWidth = Math.max((f.n/maxF*100), 10);
    return `
    <div class="funnel-stage">
      <div class="funnel-bar-wrap">
        <div class="funnel-bar" style="width:${pctWidth}%;background:${f.color};">
          <span class="funnel-value">${f.n}</span>
        </div>
      </div>
      <div class="funnel-meta">
        <span class="funnel-label">${f.label}</span>
        ${f.pct!==undefined ? `<span class="funnel-pct" style="color:${f.color};">${f.pct}% conversión</span>` : ''}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

/* ═══════════════════════════════════════════
   AVANCE POR ASESOR + BÚSQUEDA DE CLIENTE — Panel Ventas
═══════════════════════════════════════════ */
function abrirDetalleAsesor(nombre) {
  const regs = todosRegs.filter(r => r.asesorNombre === nombre);
  if (!regs.length) return;

  const interesados = regs.filter(r => r.interes === 'SI').length;
  const cierres = regs.filter(r => r.conclusion === 'Reserva' || r.huboCierre === 'SI');
  const vendido = cierres.reduce((s,r)=>s+(r.precio||0),0);
  const nVis = visitasComoRegs(regs).length;   // visitas presenciales, incluidas las que el cliente volvió
  const pct = nVis ? Math.round(cierres.length/nVis*100) : 0;

  setText('da-titulo', '🧑‍💼 ' + nombre + ' — historial completo');
  setText('da-visitas', nVis);
  setText('da-interesados', interesados);
  setText('da-cierres', cierres.length);
  setText('da-pct', pct+'%');
  setText('da-vendido', vendido ? '$'+Math.round(vendido).toLocaleString('es-BO',{maximumFractionDigits:0}) : '—');

  const cont = document.getElementById('da-clientes-lista');
  if (cont) {
    cont.innerHTML = [...regs].sort((a,b)=>(b.ts||0)-(a.ts||0)).map(r => `
      <div style="border:1.5px solid var(--line);border-radius:var(--r-md);padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div style="font-weight:600;">${esc(r.nombre||'—')}</div>
          <span class="${estadoBadgeClass(r.conclusion||r.estado)}" style="font-size:var(--fs-xs);">${esc(r.conclusion||r.estado||'Sin estado')}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          ${r.calificacion   ? `<span class="badge badge-def" style="font-size:var(--fs-xs);">Calif. ${esc(r.calificacion)}</span>` : ''}
          ${r.origen         ? `<span class="badge badge-def" style="font-size:var(--fs-xs);">📍 ${esc(r.origen)}</span>` : ''}
          ${r.terrenoInteres ? `<span class="badge badge-bbdd" style="font-size:var(--fs-xs);">🗺 ${esc(r.terrenoInteres)}</span>` : ''}
        </div>
        ${r.comentarios ? `<div style="margin-top:8px;font-size:var(--fs-sm);color:var(--ink-700);font-style:italic;">"${esc(r.comentarios)}"</div>` : ''}
        <div style="margin-top:8px;text-align:right;">
          <button onclick="abrirSeguimientoCliente('${escJs(r.nombre)}')" style="padding:5px 12px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-xs);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">💬 Seguimiento</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('modal-detalle-asesor').classList.add('open');
}
function cerrarDetalleAsesor() {
  document.getElementById('modal-detalle-asesor').classList.remove('open');
}

function renderAnalisisOrigenModalidad() {
  const cierres = todosRegs.filter(r => _esCierreVenta(r) && _regEnPeriodoVentas(r));

  function metrajeDe(r) {
    if (r.metraje) return r.metraje;
    if (!r.terrenoInteres) return null;
    const buscado = String(r.terrenoInteres).trim().toLowerCase();
    const lote = _loteDeTerreno(buscado);
    return lote?.metraje || null;
  }

  function agrupar(campo) {
    const g = {};
    cierres.forEach(r => {
      const k = r[campo] || 'Sin dato';
      (g[k] ||= { n:0, vendido:0, descPcts:[], m2Vals:[] });
      g[k].n++;
      g[k].vendido += (r.precioVenta||0);
      if (r.descuentoPct) g[k].descPcts.push(r.descuentoPct);
      const metraje = metrajeDe(r);
      if (metraje && r.precioVenta) g[k].m2Vals.push(r.precioVenta/metraje);
    });
    return Object.entries(g).sort((a,b)=>b[1].vendido-a[1].vendido);
  }

  function pintarTabla(id, filas) {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    if (!filas.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Sin datos.</div></td></tr>'; return; }
    const maxVendido = Math.max(...filas.map(([,d])=>d.vendido), 1);
    // el de menor descuento promedio (con al menos 1 dato) = mejor precio negociado
    const conDesc = filas.filter(([,d])=>d.descPcts.length);
    const minDescKey = conDesc.length ? conDesc.reduce((min,cur)=>{
      const pm = cur[1].descPcts.reduce((s,v)=>s+v,0)/cur[1].descPcts.length;
      const pmin = min[1].descPcts.reduce((s,v)=>s+v,0)/min[1].descPcts.length;
      return pm < pmin ? cur : min;
    })[0] : null;

    tbody.innerHTML = filas.map(([k,d], i) => {
      const promPct = d.descPcts.length ? (d.descPcts.reduce((s,v)=>s+v,0)/d.descPcts.length) : 0;
      const promM2  = d.m2Vals.length ? (d.m2Vals.reduce((s,v)=>s+v,0)/d.m2Vals.length) : null;
      const esTop = d.vendido === maxVendido && i === 0;
      const esMejorPrecio = k === minDescKey;
      return `<tr>
        <td style="font-weight:600;">${esc(k)}
          ${esTop?'<span style="color:var(--ok);font-size:var(--fs-xs);display:block;">🏆 top ingresos</span>':''}
          ${esMejorPrecio?'<span style="color:var(--info);font-size:var(--fs-xs);display:block;">🏅 mejor precio (menos desc.)</span>':''}
        </td>
        <td>${d.n}</td>
        <td style="font-weight:700;color:var(--cartera);">$${Math.round(d.vendido).toLocaleString('es-BO')}</td>
        <td style="color:${promPct>=10?'var(--danger)':'var(--ok)'};font-weight:600;">${d.descPcts.length ? promPct.toFixed(1)+'%' : '—'}</td>
        <td>${promM2 ? '$'+promM2.toLocaleString('es-BO',{maximumFractionDigits:2}) : '—'}</td>
      </tr>`;
    }).join('');
  }

  pintarTabla('v-origen-tbody', agrupar('origen'));
  pintarTabla('v-modalidad-tbody', agrupar('formaPago'));
  pintarTabla('v-asesor-cierres-tbody', agrupar('asesorNombre'));
}

/* ═══════════════════════════════════════════
   CIERRE DE AGENTE EXTERNO (sin usuario en el sistema)
   Se reporta para tener el dato completo, pero NO cuenta para la meta del equipo interno.
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   SEGUIMIENTO — hilo de comentarios por cliente
═══════════════════════════════════════════ */
function _clienteKey(nombre) {
  return String(nombre||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'sin-nombre';
}
let _segClienteActual = '';
let _segClienteNombreActual = '';

function abrirSeguimientoCliente(nombre) {
  _segClienteActual = _clienteKey(nombre);
  _segClienteNombreActual = nombre;
  setText('seg-cliente-nombre', nombre);
  document.getElementById('seg-nuevo-comentario').value = '';
  document.getElementById('modal-seguimiento-cliente').classList.add('open');
  window._fbListenComentariosSeguimiento(_segClienteActual, arr => renderComentariosSeguimiento(arr));
}
function cerrarSeguimientoCliente() {
  document.getElementById('modal-seguimiento-cliente').classList.remove('open');
}
function renderComentariosSeguimiento(arr) {
  const cont = document.getElementById('seg-comentarios-lista');
  if (!cont) return;
  if (!arr.length) { cont.innerHTML = '<div class="empty-state">Sin comentarios todavía — sé el primero en dejar uno.</div>'; return; }
  cont.innerHTML = [...arr].reverse().map(c => `
    <div class="seg-item">
      <div style="display:flex;justify-content:space-between;">
        <span class="seg-autor">${esc(c.autorNombre||'—')}</span>
        <span class="seg-fecha">${new Date(c.ts).toLocaleString('es-BO')}</span>
      </div>
      <div class="seg-texto">${esc(c.texto)}</div>
    </div>`).join('');
}
async function guardarComentarioSeguimiento() {
  const texto = document.getElementById('seg-nuevo-comentario').value.trim();
  if (!texto) { toastErr('Escribí el comentario antes de guardar.'); return; }
  const btn = document.querySelector('#modal-seguimiento-cliente .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbPushComentarioSeguimiento(_segClienteActual, {
    texto,
    autorNombre: asesorActual?.nombre || 'Admin',
    autorKey: asesorActual?._key || 'admin',
  });
  btnSuccess(btn);
  document.getElementById('seg-nuevo-comentario').value = '';
}

/* ═══════════════════════════════════════════
   VENTAS CONCRETADAS (admin) — autorización, tabla, import/export Excel
═══════════════════════════════════════════ */
let vcFiltros = { anio:[], canal:[], modalidad:[], categoria:[], estado:[] };

function toggleMsFiltro(campo) {
  document.querySelectorAll('.ms-filter').forEach(el => { if (el.id !== 'ms-'+campo) el.classList.remove('open'); });
  document.getElementById('ms-'+campo)?.classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ms-filter')) document.querySelectorAll('.ms-filter.open').forEach(el=>el.classList.remove('open'));
});

function poblarMsFiltro(campo, valores) {
  const panel = document.getElementById('ms-'+campo+'-panel');
  if (!panel) return;
  const unicos = [...new Set(valores.filter(Boolean))].sort();
  panel.innerHTML = unicos.length ? unicos.map(v => `
    <label class="ms-filter-opt">
      <input type="checkbox" value="${esc(v)}" ${vcFiltros[campo].includes(v)?'checked':''} onchange="toggleValorFiltroVC('${campo}','${escJs(v)}',this.checked)"/>
      ${esc(v)}
    </label>`).join('') : '<div style="padding:8px;color:var(--gris);font-size:var(--fs-sm);">Sin opciones.</div>';
  setText('ms-'+campo+'-count', vcFiltros[campo].length ? '('+vcFiltros[campo].length+')' : '');
}
function toggleValorFiltroVC(campo, valor, checked) {
  if (checked) { if (!vcFiltros[campo].includes(valor)) vcFiltros[campo].push(valor); }
  else { vcFiltros[campo] = vcFiltros[campo].filter(v=>v!==valor); }
  renderVentasConcretadasAdmin();
}
function limpiarFiltrosVC() {
  vcFiltros = { anio:[], canal:[], modalidad:[], categoria:[], estado:[] };
  document.getElementById('vc-buscar').value = '';
  renderVentasConcretadasAdmin();
}

function renderVentasConcretadasAdmin() {
  const pendientes = ventasConcretadasData.filter(v => v.estadoAutorizacion === 'pendiente');
  const aprobadas  = ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado');

  const badge = document.getElementById('nav-contratos-badge');
  if (badge) { badge.style.display = pendientes.length ? 'flex' : 'none'; badge.textContent = pendientes.length; }

  // Pendientes
  const contP = document.getElementById('vc-pendientes-lista');
  if (contP) {
    contP.innerHTML = pendientes.length ? pendientes.map(v => `
      <div style="border:1.5px solid var(--line);border-radius:var(--r-md);padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="font-weight:600;font-size:var(--fs-lg);font-family:'Cormorant Garamond',serif;">${esc(v.cliente)} — ${esc(v.terreno)}</div>
          <span style="font-weight:700;color:var(--cartera);">$${Math.round(v.precioVenta||0).toLocaleString('es-BO')}</span>
        </div>
        <div style="font-size:var(--fs-sm);color:var(--gris);margin-top:2px;">Asesor: ${esc(v.asesorNombre)} · Módulo ${esc(v.modulo||'—')} · ${esc(v.estatus)} · Categoría ${esc(v.categoria)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <span class="badge badge-def">Lista: $${Math.round(v.precioLista||0).toLocaleString('es-BO')}</span>
          <span class="badge badge-def">Desc: $${Math.round(v.descuentoUsd||0).toLocaleString('es-BO')} (${v.descuentoPct||0}%)</span>
          ${v.dsctoAdicional ? `<span class="badge" style="background:#fef3c7;color:#92400e;">+ Adicional: $${Math.round(v.dsctoAdicional).toLocaleString('es-BO')}</span>` : ''}
          ${v.accion ? `<span class="badge badge-def">Acción: $${Math.round(v.accion).toLocaleString('es-BO')}</span>` : ''}
        </div>
        ${v.observaciones ? `<div style="margin-top:8px;font-size:var(--fs-sm);font-style:italic;color:var(--ink-700);background:var(--bg-soft);border-radius:var(--r-sm);padding:8px 12px;">"${esc(v.observaciones)}"</div>` : ''}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button onclick="rechazarVentaConcretada('${v._key}')" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);cursor:pointer;">✗ Rechazar</button>
          <button onclick="aprobarVentaConcretada('${v._key}')" style="padding:6px 14px;background:var(--cartera);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;">✓ Aprobar y concretar venta</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Sin contratos pendientes.</div>';
  }

  // Poblar filtros multi-selección (opciones siempre desde el universo completo de aprobadas)
  poblarMsFiltro('anio', aprobadas.map(v=>String(v.año||'')));
  poblarMsFiltro('canal', aprobadas.map(v=>v.canal||v.gestion));
  poblarMsFiltro('modalidad', aprobadas.map(v=>v.modalidad));
  poblarMsFiltro('categoria', aprobadas.map(v=>v.categoria));
  poblarMsFiltro('estado', aprobadas.map(v=>v.estadoVenta));

  // Filtro aplicado — de acá en adelante, KPIs, dashboard y tabla usan SIEMPRE "filtradas"
  const term = (document.getElementById('vc-buscar')?.value||'').trim().toLowerCase();
  let filtradas = aprobadas;
  if (vcFiltros.anio.length)       filtradas = filtradas.filter(v => vcFiltros.anio.includes(String(v.año||'')));
  if (vcFiltros.canal.length)      filtradas = filtradas.filter(v => vcFiltros.canal.includes(v.canal||v.gestion));
  if (vcFiltros.modalidad.length)  filtradas = filtradas.filter(v => vcFiltros.modalidad.includes(v.modalidad));
  if (vcFiltros.categoria.length)  filtradas = filtradas.filter(v => vcFiltros.categoria.includes(v.categoria));
  if (vcFiltros.estado.length)     filtradas = filtradas.filter(v => vcFiltros.estado.includes(v.estadoVenta));
  if (term) filtradas = filtradas.filter(v => (v.cliente||'').toLowerCase().includes(term) || (v.terreno||'').toLowerCase().includes(term));

  const hayFiltro = vcFiltros.anio.length || vcFiltros.canal.length || vcFiltros.modalidad.length || vcFiltros.categoria.length || vcFiltros.estado.length || term;
  const nota = document.getElementById('vc-kpi-filtro-nota');
  if (nota) nota.style.display = hayFiltro ? 'inline' : 'none';

  // KPIs compactos (arriba, junto a pendientes) — respetan el filtro activo
  setText('vc-kpi-total', filtradas.length);
  const totalVendido = filtradas.reduce((s,v)=>s+(v.precioVenta||0),0);
  setText('vc-kpi-vendido', totalVendido ? '$'+Math.round(totalVendido).toLocaleString('es-BO') : '—');
  const descPcts = filtradas.filter(v=>v.descuentoPct).map(v=>v.descuentoPct);
  setText('vc-kpi-desc', descPcts.length ? Math.round(descPcts.reduce((s,v)=>s+v,0)/descPcts.length)+'%' : '—');
  const m2Vals = filtradas.filter(v=>v.m2Usd).map(v=>v.m2Usd);
  setText('vc-kpi-m2', m2Vals.length ? '$'+Math.round(m2Vals.reduce((s,v)=>s+v,0)/m2Vals.length) : '—');

  const tbody = document.getElementById('vc-tabla-tbody');
  if (tbody) {
    const estadoColor = (ev) => (ev||'').toLowerCase().includes('caída') || (ev||'').toLowerCase().includes('caida') ? 'var(--danger)' : 'var(--ok)';
    tbody.innerHTML = filtradas.length ? filtradas.map(v => `<tr>
      <td>${v.año||'—'}</td><td>${esc(v.mes||'—')}</td>
      <td style="font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(v.cliente)}">${esc(v.cliente)}</td>
      <td style="font-family:monospace;">${esc(v.terreno)}</td>
      <td>${esc(v.modulo||'—')}</td>
      <td>${esc(v.canal||v.gestion||'—')}</td>
      <td>${esc(v.modalidad||'—')}</td>
      <td>${esc(v.asesorNombre||'—')}</td>
      <td>${esc(v.estatus||'—')}</td>
      <td style="font-weight:600;color:${estadoColor(v.estadoVenta)};">${esc(v.estadoVenta||'—')}</td>
      <td>${v.precioLista ? '$'+Math.round(v.precioLista).toLocaleString('es-BO') : '—'}</td>
      <td>${v.descuentoUsd ? '$'+Math.round(v.descuentoUsd).toLocaleString('es-BO')+' ('+v.descuentoPct+'%)' : '—'}</td>
      <td style="color:${(v.excedente||0)>=0?'var(--ok)':'var(--danger)'};font-weight:600;">${v.excedente ? '$'+Math.round(v.excedente).toLocaleString('es-BO') : '—'}</td>
      <td style="font-weight:700;color:var(--cartera);">$${Math.round(v.precioVenta||0).toLocaleString('es-BO')}</td>
      <td>${v.metraje||'—'}</td>
      <td>${v.m2Usd ? '$'+Math.round(v.m2Usd) : '—'}</td>
      <td>${esc(v.categoria||'—')}</td>
    </tr>`).join('') : '<tr><td colspan="17"><div class="empty-state">Sin resultados.</div></td></tr>';
  }

  renderVentasDashboard(filtradas);
}
