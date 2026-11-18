/* ═══════════════════════════════════════════
   META VS EJECUCIÓN — histórico mes a mes (solo equipo interno / UV)
═══════════════════════════════════════════ */
let _chartMetaVsEjecucion = null;
/* ── Gestión mes a mes: NO un total tapado, el detalle real de cada uno de los 12 meses ── */
function renderGestionMensualVentas() {
  const tbody = document.getElementById('ventas-gestion-mensual-tbody');
  if (!tbody) return;
  setText('ventas-gestion-mensual-label', _labelGestion(ventasFilGestion));

  const nombresMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesesGestion = [];
  for (let i = 3; i < 15; i++) mesesGestion.push({ mes: nombresMes[i%12], anio: i<12 ? ventasFilGestion : ventasFilGestion+1 });

  const internos = soloInternos(todosRegs);
  const filas = mesesGestion.map(({mes, anio}) => {
    const delMes = internos.filter(r => r.mes===mes && (!r.ts || new Date(r.ts).getFullYear()===anio));
    const cierres = delMes.filter(_esCierreVenta);
    const vendido = cierres.reduce((s,r)=>s+(r.precioVenta||r.precio||0),0);
    const visitas = visitasComoRegs(internos).filter(r => r.mes===mes && (!r.ts || new Date(r.ts).getFullYear()===anio)).length;   // presenciales, con las que el cliente volvió
    return { mes, anio, registros: delMes.length, visitas, cierres: cierres.length, vendido };
  });

  const hoy = new Date();
  tbody.innerHTML = filas.map(f => {
    const esFuturo = (f.anio > hoy.getFullYear()) || (f.anio === hoy.getFullYear() && nombresMes.indexOf(f.mes) > hoy.getMonth());
    return `<tr style="${esFuturo?'color:var(--gris);':''}">
      <td style="font-weight:600;">${f.mes} ${f.anio}</td>
      <td>${f.registros}</td>
      <td>${f.visitas}</td>
      <td style="font-weight:600;color:var(--cartera);">${f.cierres}</td>
      <td>${f.vendido ? '$'+Math.round(f.vendido).toLocaleString('es-BO') : (esFuturo?'—':'$0')}</td>
    </tr>`;
  }).join('') + `<tr style="font-weight:700;background:var(--bg-soft);">
    <td>Total gestión</td>
    <td>${filas.reduce((s,f)=>s+f.registros,0)}</td>
    <td>${filas.reduce((s,f)=>s+f.visitas,0)}</td>
    <td>${filas.reduce((s,f)=>s+f.cierres,0)}</td>
    <td>$${Math.round(filas.reduce((s,f)=>s+f.vendido,0)).toLocaleString('es-BO')}</td>
  </tr>`;
}

async function renderMetaVsEjecucion() {
  const canvas = document.getElementById('v-chart-meta-ejecucion');
  if (!canvas) return;

  const nombresMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let buckets;
  if (ventasModoVista === 'mes') {
    const iSel = nombresMes.indexOf(ventasFilMes);
    buckets = []; for (let i = 5; i >= 0; i--) { const d = new Date(ventasFilAnio, iSel - i, 1); buckets.push({ mes: nombresMes[d.getMonth()], anio: d.getFullYear() }); }
  } else buckets = _mesesPeriodoVentas();
  buckets = buckets.map(b => ({ ...b, label: b.mes.slice(0,3) + ' ' + String(b.anio).slice(2) }));
  const internosMve = soloInternos(todosRegs);
  const metasMve = await Promise.all(buckets.map(b => window._fbGetMetaOnce(b.anio, b.mes, 'mkt_cierres')));
  const datos = buckets.map((b, i) => ({ label: b.label, meta: metasMve[i] || 0, real: internosMve.filter(r => _regEnMesAnio(r, b.mes, b.anio) && _esCierreVenta(r)).length }));
  const enPeriodo = ventasModoVista === 'mes' ? datos.slice(-1) : datos;
  const sumMeta = enPeriodo.reduce((s,d) => s + d.meta, 0), sumReal = enPeriodo.reduce((s,d) => s + d.real, 0);
  setText('v-mve-cumpl-mes', sumMeta ? Math.round(sumReal/sumMeta*100) + '%' : 'sin meta');
  setText('v-mve-meses-sub', 'de ' + datos.length + ' meses mostrados');

  // KPIs

  const conMeta = datos.filter(d => d.meta > 0);
  const promCumpl = conMeta.length ? Math.round(conMeta.reduce((s,d)=>s+(d.real/d.meta*100),0)/conMeta.length) : null;
  setText('v-mve-cumpl-prom', promCumpl!==null ? promCumpl+'%' : '—');

  const mesesOk = conMeta.filter(d => d.real >= d.meta).length;
  setText('v-mve-meses-ok', conMeta.length ? mesesOk+'/'+conMeta.length : '—');

  // Gráfico de barras: Meta vs Real, mes a mes
  if (_chartMetaVsEjecucion) _chartMetaVsEjecucion.destroy();
  _chartMetaVsEjecucion = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: datos.map(d=>d.label),
      datasets: [
        { label:'Meta', data:datos.map(d=>d.meta||null), backgroundColor:'rgba(10,10,10,.12)', borderColor:'#0A0A0A', borderWidth:2, borderRadius:5, maxBarThickness:28 },
        { label:'Cierres reales', data:datos.map(d=>d.real), backgroundColor:datos.map(d => d.meta && d.real>=d.meta ? '#1E8E3E' : (d.meta ? '#E63946' : '#2451FF')), borderRadius:5, maxBarThickness:28 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:'top', labels:{usePointStyle:true} },
        datalabels:{ anchor:'end', align:'top', font:{weight:'700',size:10.5}, color:'#0A0A0A', formatter:v=>v>0?v:'' }
      },
      scales:{
        x:{ grid:{display:false} },
        y:{ beginAtZero:true, ticks:{precision:0} }
      }
    }
  });
}

function renderResumenCierres(regsPeriodo, metaC, labelPeriodo) {
  try {
    const cierres = (regsPeriodo||[]).filter(_esCierreVenta);
    const uv  = cierres.filter(r => !r.esExterno);
    const ext = cierres.filter(r => r.esExterno);

    setText('v-resumen-meta', metaC || '—');
    const notaMeta = document.getElementById('v-resumen-meta-sub');
    if (notaMeta) {
      notaMeta.innerHTML = metaC
        ? ''
        : `<a href="#" onclick="switchAdminTab('panelcontrol');return false;" style="color:var(--info);font-weight:600;">Sin cargar — cargarla acá →</a>`;
    }
    setText('v-resumen-globales', cierres.length);
    setText('v-resumen-uv', uv.length);
    setText('v-resumen-externo', ext.length);

    const avgPct = (arr) => {
      const vals = arr.filter(r=>r.descuentoPct).map(r=>r.descuentoPct);
      return vals.length ? (vals.reduce((s,v)=>s+v,0)/vals.length) : null;
    };
    const pctUv = avgPct(uv), pctExt = avgPct(ext);
    setText('v-resumen-desc-uv', pctUv!==null ? pctUv.toFixed(1)+'%' : '—');
    setText('v-resumen-desc-ext', pctExt!==null ? pctExt.toFixed(1)+'%' : '—');
  } catch(e) {
    console.error('renderResumenCierres error:', e);
  }
}

function _fmtK(v) {
  if (!v) return '—';
  const n = Math.round(v);
  return n >= 1000 ? '$'+(n/1000).toLocaleString('es-BO',{maximumFractionDigits:1})+'K' : '$'+n;
}
const _MODALIDAD_CORTA = { 'Contado':'Contado', 'Contado Diferido':'Cont.Dif.', 'Crédito Directo':'Créd.Dir.', 'Crédito Bancario':'Créd.Banc.' };

function renderDetalleCierres() {
  const tbody = document.getElementById('v-cierres-tbody');
  const tfoot = document.getElementById('v-cierres-tfoot');
  if (!tbody) return;
  // Usa el mismo filtro global de arriba del panel (mes o gestión completa) — no uno propio separado.
  let cierres = todosRegs.filter(r => _esCierreVenta(r) && _regEnPeriodoVentas(r));

  cierres = cierres.sort((a,b)=>(b.ts||0)-(a.ts||0));

  if (!cierres.length) {
    tbody.innerHTML = '<tr><td colspan="13"><div class="empty-state">Sin cierres para ' + _labelPeriodoVentas() + '.</div></td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  const filasCalc = cierres.map(r => {
    // Si el registro viejo no tiene metraje guardado, lo buscamos en el Inventario actual
    // por el código de terreno — así con solo completar el metraje del lote en Inventario,
    // esta tabla ya muestra el cálculo, sin tocar el registro histórico.
    let metraje = r.metraje;
    let loteActual = null;
    if (r.terrenoInteres) {
      const buscado = String(r.terrenoInteres).trim().toLowerCase();
      loteActual = _loteDeTerreno(buscado);
    }
    if (!metraje && loteActual?.metraje) metraje = loteActual.metraje;
    const categoriaTerreno = loteActual?.categoria || '';
    const m2Lista = (metraje && r.precioLista) ? Math.round((r.precioLista/metraje)*100)/100 : null;
    const m2Cierre = (metraje && r.precioVenta) ? Math.round((r.precioVenta/metraje)*100)/100 : (r.precioM2Final || null);
    return { r, metraje, m2Lista, m2Cierre, categoriaTerreno };
  });

  tbody.innerHTML = filasCalc.map(({r, metraje, m2Lista, m2Cierre, categoriaTerreno}) => {
    const vc = ventasConcretadasData.find(v => v.registroKey === r._key);
    let colContrato = '<span style="color:var(--gris);font-size:var(--fs-xs);">—</span>';
    if (vc) {
      colContrato = vc.estadoAutorizacion === 'aprobado'
        ? '<span class="badge" style="background:var(--ok-bg);color:var(--ok-ink);">✓ Concretada</span>'
        : vc.estadoAutorizacion === 'pendiente'
          ? '<span class="badge" style="background:#fef3c7;color:#92400e;">⏳ Pendiente</span>'
          : '<span class="badge" style="background:var(--danger-bg);color:var(--danger-ink);">✗ Rechazada</span>';
    } else if (r.esExterno) {
      colContrato = `<button onclick="abrirModalContratoFirmado('${r._key}')" style="padding:4px 10px;background:var(--cartera);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-xs);font-weight:700;cursor:pointer;">📝 Marcar contrato</button>`;
    }
    return `<tr${r.esExterno?' style="background:#fdf6e8;"':''}>
      <td class="wrap-ok" style="font-weight:600;max-width:110px;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.nombre||'')}">${esc(r.nombre||'—')}${r.esExterno?' <span class="badge" style="color:#92400e;">🤝</span>':''}</td>
      <td style="font-family:monospace;font-weight:600;">${esc(r.terrenoInteres||'—')}</td>
      <td>${_fmtK(r.precioLista)}</td>
      <td>${metraje ? Math.round(metraje)+'m²' : '<span style="color:var(--gris);">falta</span>'}</td>
      <td>${m2Lista ? '$'+Math.round(m2Lista) : '—'}</td>
      <td style="color:${r.descuentoUsd>0?'var(--danger)':'var(--ok)'};font-weight:600;">
        ${r.descuentoUsd ? _fmtK(r.descuentoUsd)+' ('+r.descuentoPct+'%)' : '—'}
      </td>
      <td style="font-weight:700;color:var(--cartera);">${_fmtK(r.precioVenta)}</td>
      <td>${m2Cierre ? '$'+Math.round(m2Cierre) : '—'}</td>
      <td><span class="badge">${esc(_MODALIDAD_CORTA[r.formaPago]||r.formaPago||'—')}</span></td>
      <td><span class="badge">${esc(r.origen||'—')}</span></td>
      <td style="text-align:center;font-weight:700;">${esc(categoriaTerreno||'—')}</td>
      <td style="font-size:var(--fs-sm);">${esc(r.asesorNombre||'—')}</td>
      <td>${colContrato}</td>
    </tr>`;
  }).join('');

  // Fila de Total y Promedio
  if (tfoot) {
    const n = cierres.length;
    const sumLista    = cierres.reduce((s,r)=>s+(r.precioLista||0),0);
    const sumDesc     = cierres.reduce((s,r)=>s+(r.descuentoUsd||0),0);
    const sumVenta    = cierres.reduce((s,r)=>s+(r.precioVenta||0),0);
    const descPcts    = cierres.filter(r=>r.descuentoPct).map(r=>r.descuentoPct);
    const promPct     = descPcts.length ? (descPcts.reduce((s,v)=>s+v,0)/descPcts.length) : 0;

    const metrajes    = filasCalc.filter(f=>f.metraje).map(f=>f.metraje);
    const sumMetraje  = metrajes.reduce((s,v)=>s+v,0);
    const promMetraje = metrajes.length ? sumMetraje/metrajes.length : 0;

    const m2ListaVals  = filasCalc.filter(f=>f.m2Lista).map(f=>f.m2Lista);
    const promM2Lista  = m2ListaVals.length ? m2ListaVals.reduce((s,v)=>s+v,0)/m2ListaVals.length : 0;

    const m2CierreVals = filasCalc.filter(f=>f.m2Cierre).map(f=>f.m2Cierre);
    const promM2Cierre = m2CierreVals.length ? m2CierreVals.reduce((s,v)=>s+v,0)/m2CierreVals.length : 0;

    tfoot.innerHTML = `
      <tr style="background:var(--bg-soft);font-weight:700;">
        <td colspan="2">TOTAL (${n})</td>
        <td>${_fmtK(sumLista)}</td>
        <td>${metrajes.length ? Math.round(sumMetraje)+'m²' : '—'}</td>
        <td>—</td>
        <td style="color:var(--danger);">${_fmtK(sumDesc)} (${promPct.toFixed(1)}%)</td>
        <td style="color:var(--cartera);">${_fmtK(sumVenta)}</td>
        <td colspan="5"></td>
      </tr>
      <tr style="background:var(--bg-soft);font-weight:600;color:var(--ink-700);">
        <td colspan="2">PROMEDIO</td>
        <td>${_fmtK(sumLista/n)}</td>
        <td>${metrajes.length ? Math.round(promMetraje)+'m²' : '—'}</td>
        <td>${m2ListaVals.length ? '$'+Math.round(promM2Lista) : '—'}</td>
        <td style="color:var(--danger);">${_fmtK(sumDesc/n)}</td>
        <td style="color:var(--cartera);">${_fmtK(sumVenta/n)}</td>
        <td>${m2CierreVals.length ? '$'+Math.round(promM2Cierre) : '—'}</td>
        <td colspan="4"></td>
      </tr>`;
  }
}

function renderAvancePorAsesor() {
  const tbody = document.getElementById('v-avance-asesor-tbody');
  if (!tbody) return;
  const porAsesor = {};
  soloInternos(todosRegs).filter(_regEnPeriodoVentas).forEach(r => {
    const k = r.asesorNombre || 'Sin asignar';
    (porAsesor[k] ||= { visitas:0, interesados:0, cierres:0, vendido:0 });
    if (r.interes === 'SI') porAsesor[k].interesados++;
    if (_esCierreVenta(r)) { porAsesor[k].cierres++; porAsesor[k].vendido += _montoCierre(r); }
  });
  visitasComoRegs(soloInternos(todosRegs)).filter(_regEnPeriodoVentas).forEach(r => { const k = r.asesorNombre || 'Sin asignar'; (porAsesor[k] ||= { visitas:0, interesados:0, cierres:0, vendido:0 }).visitas++; });
  const filas = Object.entries(porAsesor).sort((a,b)=>b[1].visitas-a[1].visitas);
  tbody.innerHTML = filas.length ? filas.map(([nombre,d]) => {
    const pct = d.visitas ? Math.round(d.cierres/d.visitas*100) : 0;
    return `<tr style="cursor:pointer;" onclick="abrirDetalleAsesor('${escJs(nombre)}')" title="Ver detalle">
      <td style="font-weight:600;color:var(--info);text-decoration:underline;">${esc(nombre)} 🔍</td>
      <td>${d.visitas}</td>
      <td>${d.interesados}</td>
      <td style="font-weight:600;color:var(--cartera);">${d.cierres}</td>
      <td><span style="font-weight:700;color:${pct>=20?'var(--ok)':pct>=8?'var(--warn)':'var(--danger)'};">${pct}%</span></td>
      <td>${d.vendido ? '$'+Math.round(d.vendido).toLocaleString('es-BO',{maximumFractionDigits:0}) : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty-state">Sin datos.</div></td></tr>';
}

let _chartHistPrecioDesc = null;
let _chartHistM2Cant = null;

function renderHistoricoMensualVentas() {
  const c1 = document.getElementById('v-chart-hist-precio-desc');
  const c2 = document.getElementById('v-chart-hist-m2-cant');
  if (!c1 || !c2) return;

  const cierres = soloInternos(todosRegs).filter(r => r.conclusion === 'Reserva' && r.precioVenta > 0 && r.ts);
  if (!cierres.length) {
    if (_chartHistPrecioDesc) { _chartHistPrecioDesc.destroy(); _chartHistPrecioDesc = null; }
    if (_chartHistM2Cant)     { _chartHistM2Cant.destroy();     _chartHistM2Cant = null; }
    return;
  }

  const nombresMes = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const buckets = {};
  cierres.forEach(r => {
    const d = new Date(r.ts);
    const clave = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    (buckets[clave] ||= { label: nombresMes[d.getMonth()]+' '+d.getFullYear(), orden: d.getFullYear()*12+d.getMonth(), descPcts:[], precios:[], m2s:[], n:0 });
    const b = buckets[clave];
    b.n++;
    if (r.descuentoPct !== undefined && r.descuentoPct !== null) b.descPcts.push(r.descuentoPct);
    b.precios.push(r.precioVenta);
    let metraje = r.metraje;
    if (!metraje && r.terrenoInteres) {
      const buscado = String(r.terrenoInteres).trim().toLowerCase();
      const lote = _loteDeTerreno(buscado);
      if (lote?.metraje) metraje = lote.metraje;
    }
    if (metraje) b.m2s.push(r.precioVenta/metraje);
  });

  const ordenados = Object.values(buckets).sort((a,b)=>a.orden-b.orden);
  const avg = (arr) => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;

  const labels       = ordenados.map(b=>b.label);
  const descPromedios = ordenados.map(b=> avg(b.descPcts));
  const precioPromedios = ordenados.map(b=> avg(b.precios));
  const m2Promedios   = ordenados.map(b=> avg(b.m2s));
  const cantidades    = ordenados.map(b=> b.n);

  if (_chartHistPrecioDesc) _chartHistPrecioDesc.destroy();
  _chartHistPrecioDesc = new Chart(c1, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'% Descuento', data:descPromedios, borderColor:'#2451FF', backgroundColor:'transparent', yAxisID:'y', tension:.3, pointRadius:3 },
        { label:'Precio de Venta', data:precioPromedios, borderColor:'#1E8E3E', backgroundColor:'transparent', yAxisID:'y1', tension:.3, pointRadius:3 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:'index' },
      plugins:{
        legend:{ position:'top', labels:{usePointStyle:true, color:'#0A0A0A'} },
        datalabels: {
          align:'top', anchor:'end', offset:4, font:{ size:9, weight:'700' },
          color:(ctx)=>ctx.dataset.borderColor,
          formatter:(v,ctx)=> v==null?'':(ctx.dataset.yAxisID==='y' ? v.toFixed(1)+'%' : '$'+Math.round(v).toLocaleString('es-BO'))
        }
      },
      scales:{
        y:  { position:'left', beginAtZero:true, grid:{color:'rgba(10,10,10,.10)'}, ticks:{ maxTicksLimit:6, color:'#0A0A0A', callback:v=>Math.round(v*10)/10+'%' }, title:{display:true,text:'% Descuento',color:'#0A0A0A'} },
        y1: { position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, ticks:{ maxTicksLimit:6, color:'#0A0A0A', callback:v=>'$'+Math.round(v).toLocaleString('es-BO') }, title:{display:true,text:'Precio de Venta',color:'#0A0A0A'} },
        x:  { ticks:{color:'#0A0A0A'}, grid:{color:'rgba(10,10,10,.10)'} },
      }
    }
  });

  if (_chartHistM2Cant) _chartHistM2Cant.destroy();
  _chartHistM2Cant = new Chart(c2, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'$/m²', data:m2Promedios, borderColor:'#2451FF', backgroundColor:'transparent', yAxisID:'y', tension:.3, pointRadius:3 },
        { label:'Cantidad de ventas', data:cantidades, borderColor:'#1E8E3E', backgroundColor:'transparent', yAxisID:'y1', tension:.3, pointRadius:3 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:'index' },
      plugins:{
        legend:{ position:'top', labels:{usePointStyle:true, color:'#0A0A0A'} },
        datalabels: {
          align:'top', anchor:'end', offset:4, font:{ size:9, weight:'700' },
          color:(ctx)=>ctx.dataset.borderColor,
          formatter:(v,ctx)=> v==null?'':(ctx.dataset.yAxisID==='y' ? '$'+Math.round(v) : v)
        }
      },
      scales:{
        y:  { position:'left', beginAtZero:true, grid:{color:'rgba(10,10,10,.10)'}, ticks:{ maxTicksLimit:6, color:'#0A0A0A', callback:v=>'$'+Math.round(v) }, title:{display:true,text:'$/m²',color:'#0A0A0A'} },
        y1: { position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, ticks:{ maxTicksLimit:6, color:'#0A0A0A', precision:0, stepSize:1 }, title:{display:true,text:'Cantidad',color:'#0A0A0A'} },
        x:  { ticks:{color:'#0A0A0A'}, grid:{color:'rgba(10,10,10,.10)'} },
      }
    }
  });
}

function renderClientesEnNegociacion() {
  const tbody = document.getElementById('v-negociacion-tbody');
  if (!tbody) return;
  const pendientes = visitasProgramadasData.filter(v => v.estado === 'pendiente' || v.estado === 'en_proceso')
    .sort((a,b)=>(a.ts||0)-(b.ts||0)); // más viejos primero, son los más urgentes
  if (!pendientes.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Sin clientes pendientes.</div></td></tr>'; return; }
  const hoy = Date.now();
  tbody.innerHTML = pendientes.map(v => {
    const dias = v.ts ? Math.floor((hoy - v.ts)/86400000) : null;
    return `<tr>
      <td style="font-weight:600;">${esc(v.nombre)} ${v.estado==='en_proceso'?'<span class="badge" style="font-size:var(--fs-xs);background:#fde68a;color:#92400e;">⚠️ A medias</span>':''} ${v.esDevolucion?'<span class="badge" style="font-size:var(--fs-xs);background:#fef3c7;color:#92400e;">↩️ Devuelta</span>':''}</td>
      <td>${esc(v.asesorNombre||'—')}</td>
      <td><span class="badge badge-def" style="font-size:var(--fs-xs);">${esc(v.origen||'—')}</span></td>
      <td style="font-weight:700;color:${dias>=7?'var(--danger)':dias>=3?'var(--warn)':'var(--ok)'};">${dias!==null?dias+' día'+(dias!==1?'s':''):'—'}</td>
      <td><button onclick="abrirSeguimientoCliente('${escJs(v.nombre)}')" style="padding:4px 10px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-xs);cursor:pointer;">💬</button></td>
    </tr>`;
  }).join('');
}

function renderSeguimientoActivo() {
  const tbody = document.getElementById('v-seguimiento-activo-tbody');
  if (!tbody) return;
  const activos = soloInternos(todosRegs).filter(r => r.conclusion==='Seguimiento' || r.conclusion==='Re-agendado')
    .sort((a,b)=>(a.ts||0)-(b.ts||0)); // los que más tiempo llevan primero
  if (!activos.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Sin datos.</div></td></tr>'; return; }
  const hoy = Date.now();
  tbody.innerHTML = activos.map(r => {
    const dias = r.ts ? Math.floor((hoy - r.ts)/86400000) : null;
    return `<tr>
      <td style="font-weight:600;">${esc(r.nombre||'—')}</td>
      <td>${esc(r.asesorNombre||'—')}</td>
      <td><span class="${estadoBadgeClass(r.conclusion)}" style="font-size:var(--fs-xs);">${esc(r.conclusion)}</span></td>
      <td style="font-weight:700;color:${dias>=21?'var(--danger)':dias>=7?'var(--warn)':'var(--ok)'};">${dias!==null?dias+' día'+(dias!==1?'s':''):'—'}</td>
      <td><button onclick="abrirSeguimientoCliente('${escJs(r.nombre)}')" style="padding:4px 10px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-xs);cursor:pointer;">💬</button></td>
    </tr>`;
  }).join('');
}

function renderDescartados() {
  const tbody = document.getElementById('v-descartados-tbody');
  if (!tbody) return;
  const todos = soloInternos(todosRegs).filter(_regEnPeriodoVentas);
  const descartados = todos.filter(r => r.conclusion === 'Descartado');

  setText('v-desc-total', descartados.length);
  setText('v-desc-pct', todos.length ? Math.round(descartados.length/todos.length*100)+'%' : '—');

  const conDias = descartados.filter(r => r.conclusionTs && r.ts).map(r => (r.conclusionTs - r.ts)/86400000);
  const diasProm = conDias.length ? (conDias.reduce((s,v)=>s+v,0)/conDias.length) : null;
  setText('v-desc-dias-prom', diasProm!==null ? Math.round(diasProm)+' días' : '—');

  if (!descartados.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Sin descartados todavía.</div></td></tr>'; return; }

  tbody.innerHTML = [...descartados].sort((a,b)=>(b.ts||0)-(a.ts||0)).map(r => {
    const dias = (r.conclusionTs && r.ts) ? Math.round((r.conclusionTs - r.ts)/86400000) : null;
    return `<tr>
      <td style="font-weight:600;">${esc(r.nombre||'—')}</td>
      <td>${esc(r.asesorNombre||'—')}</td>
      <td><span class="badge badge-def" style="font-size:var(--fs-xs);">${esc(r.origen||'—')}</span></td>
      <td style="font-size:var(--fs-sm);color:var(--gris);">${esc(r.motivoNoCierre||'—')}</td>
      <td style="font-weight:600;">${dias!==null ? dias+' día'+(dias!==1?'s':'') : '<span style="color:var(--gris);">sin dato (registro anterior)</span>'}</td>
    </tr>`;
  }).join('');
}

function renderBusquedaClienteVentas() {
  const cont = document.getElementById('v-cliente-resultado');
  if (!cont) return;
  const term = (document.getElementById('v-buscar-cliente')?.value || '').trim().toLowerCase();

  if (!term) {
    cont.innerHTML = `<p style="font-size:var(--fs-sm);color:var(--gris);">Escribí un nombre arriba para ver el avance de un cliente puntual.</p>`;
    return;
  }
  const matches = todosRegs.filter(r => (r.nombre||'').toLowerCase().includes(term));
  if (!matches.length) {
    cont.innerHTML = `<div class="empty-state">No se encontró ningún cliente con "${esc(term)}".</div>`;
    return;
  }
  cont.innerHTML = matches.map(r => `
    <div class="admin-section" style="margin-bottom:10px;padding:16px 18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-weight:600;font-size:var(--fs-lg);font-family:'Cormorant Garamond',serif;">${esc(r.nombre)}</div>
          <div style="font-size:var(--fs-sm);color:var(--gris);">Asesor: ${esc(r.asesorNombre||'—')} · ${esc(r.fechaCarga||'')}</div>
        </div>
        <span class="${estadoBadgeClass(r.conclusion||r.estado)}">${esc(r.conclusion||r.estado||'Sin estado')}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${r.origen         ? `<span class="badge badge-def">📍 ${esc(r.origen)}</span>` : ''}
        ${r.calificacion   ? `<span class="badge badge-def">Calif. ${esc(r.calificacion)}</span>` : ''}
        ${r.terrenoInteres ? `<span class="badge badge-bbdd">🗺 ${esc(r.terrenoInteres)}</span>` : ''}
        ${r.formaPago      ? `<span class="badge badge-def">${esc(r.formaPago)}</span>` : ''}
        ${r.pctCierre      ? `<span class="badge badge-def">${r.pctCierre}% cierre est.</span>` : ''}
      </div>
      ${r.comentarios    ? `<div style="margin-top:10px;font-size:var(--fs-sm);color:var(--ink-700);font-style:italic;background:var(--bg-soft);border-radius:var(--r-sm);padding:8px 12px;">"${esc(r.comentarios)}"</div>` : ''}
      ${r.motivoNoCierre ? `<div style="margin-top:6px;font-size:var(--fs-sm);color:var(--gris);">Motivo de no cierre: ${esc(r.motivoNoCierre)}</div>` : ''}
      ${r.precioVenta    ? `<div style="margin-top:6px;font-size:var(--fs-sm);font-weight:600;color:var(--cartera);">Precio de venta: $${Number(r.precioVenta).toLocaleString('es-BO')}</div>` : ''}
      <div style="margin-top:10px;text-align:right;">
        <button onclick="abrirSeguimientoCliente('${escJs(r.nombre)}')" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">💬 Ver seguimiento</button>
      </div>
    </div>`).join('');
}

let _chartsAuxiliares = {};
function _destroyAux(id) { if (_chartsAuxiliares[id]) { _chartsAuxiliares[id].destroy(); delete _chartsAuxiliares[id]; } }

// Barra horizontal moderna — reemplaza las listas de "bar-item" hechas con divs
function _barraHorizontal(canvasId, counts, colorMap, colorFallback, onClickLabel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  _destroyAux(canvasId);
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) return;
  const labels = entries.map(([k])=>k);
  const data   = entries.map(([,n])=>n);
  const colores = labels.map((k,i) => (colorMap && colorMap[k]) || (colorFallback ? colorFallback[i%colorFallback.length] : '#6b7280'));

  _chartsAuxiliares[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets:[{ data, backgroundColor:colores, borderRadius:6, maxBarThickness:26 }] },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ right:12 } },
      plugins:{
        legend:{ display:false },
        datalabels:{ anchor:'center', align:'center', font:{weight:'700', size:11.5}, color:'#fff' }
      },
      scales:{
        x:{ display:false, beginAtZero:true, suggestedMax: Math.max(...data)*1.15 },
        y:{ grid:{display:false}, ticks:{ font:{ family:"'DM Sans',sans-serif", size:11.5, weight:'700' }, color:'#0A0A0A' } }
      },
      onClick: onClickLabel ? (evt, els) => { if (els.length) onClickLabel(labels[els[0].index]); } : undefined,
      onHover: onClickLabel ? (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } : undefined,
    }
  });
}

// Torta — para datos de composición (partes de un todo), como estados
function _tortaEstados(canvasId, counts, colorMap) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  _destroyAux(canvasId);
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) return;
  const labels = entries.map(([k])=>k);
  const data   = entries.map(([,n])=>n);
  const colores = labels.map(k => (colorMap && colorMap[k]) || '#6b7280');

  _chartsAuxiliares[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets:[{ data, backgroundColor:colores, borderWidth:2, borderColor:'#FFFDF7' }] },
    options: {
      cutout:'60%', responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:'right', labels:{ usePointStyle:true, boxWidth:8, font:{size:11}, color:'#0A0A0A' } },
        datalabels:{ color:'#fff', font:{weight:'700', size:11}, formatter:(v)=> v>0?v:'' }
      }
    }
  });
}

// ── Filtro global del panel de Ventas — Por mes, Varios meses, o Gestión (mes a mes) ──
let ventasFilAnio = new Date().getFullYear();
let ventasFilMes  = PC_MESES[new Date().getMonth()]; // lista fija — antes usaba el idioma del navegador, que podía no coincidir letra por letra con el texto de los <option> y rompía en silencio la búsqueda de la meta
let ventasModoVista = 'mes'; // 'mes' | 'multimes' | 'gestion'
let ventasFilGestion = _gestionActual();
let ventasFilMesesSeleccionados = [ventasFilMes]; // para el modo 'multimes'

function cambiarModoVentas(modo) {
  ventasModoVista = modo;
  const btns = { mes: document.getElementById('btn-vmodo-mes'), multimes: document.getElementById('btn-vmodo-multimes'), gestion: document.getElementById('btn-vmodo-gestion') };
  const selMes = document.getElementById('fil-ventas-mes');
  const selGestion = document.getElementById('fil-ventas-gestion');
  const contMultimes = document.getElementById('fil-ventas-multimes-cont');

  Object.entries(btns).forEach(([k,btn]) => {
    if (!btn) return;
    if (k === modo) { btn.style.background = '#fff'; btn.style.boxShadow = '0 1px 3px rgba(0,0,0,.1)'; }
    else { btn.style.background = 'transparent'; btn.style.boxShadow = 'none'; }
  });

  if (selMes) selMes.style.display = (modo === 'mes') ? '' : 'none';
  if (selGestion) selGestion.style.display = (modo === 'gestion') ? '' : 'none';
  if (contMultimes) contMultimes.style.display = (modo === 'multimes') ? '' : 'none';
  if (modo === 'multimes') poblarChecksMultimes();

  renderDashboard();
}

function poblarChecksMultimes() {
  const cont = document.getElementById('fil-ventas-multimes-checks');
  if (!cont) return;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  cont.innerHTML = meses.map(m => `
    <label style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--fill);border-radius:var(--r-sm);cursor:pointer;font-size:var(--fs-sm);">
      <input type="checkbox" value="${m}" ${ventasFilMesesSeleccionados.includes(m)?'checked':''} style="width:auto;"/> ${m}
    </label>`).join('');
}

function cambiarFiltroVentas() {
  ventasFilAnio = parseInt(document.getElementById('fil-ventas-anio').value);
  ventasFilMes  = document.getElementById('fil-ventas-mes').value;
  const selGestion = document.getElementById('fil-ventas-gestion');
  if (selGestion) ventasFilGestion = parseInt(selGestion.value);
  if (ventasModoVista === 'multimes') {
    ventasFilMesesSeleccionados = Array.from(document.querySelectorAll('#fil-ventas-multimes-checks input:checked')).map(c=>c.value);
    if (!ventasFilMesesSeleccionados.length) { toastErr('Elegí al menos un mes.'); return; }
  }
  renderDashboard();
}

// ¿Este registro cae dentro del período elegido? Sirve para los 3 modos.
function _regEnPeriodoVentas(r) {
  if (ventasModoVista === 'gestion') {
    if (!r.ts) return false;
    return _gestionDeFecha(new Date(r.ts)) === ventasFilGestion;
  }
  if (ventasModoVista === 'multimes') {
    return ventasFilMesesSeleccionados.includes(r.mes) && (!r.ts || new Date(r.ts).getFullYear() === ventasFilAnio);
  }
  return r.mes === ventasFilMes && (!r.ts || new Date(r.ts).getFullYear() === ventasFilAnio);
}

function _labelPeriodoVentas() {
  if (ventasModoVista === 'gestion') return 'Gestión ' + _labelGestion(ventasFilGestion);
  if (ventasModoVista === 'multimes') return ventasFilMesesSeleccionados.join(', ') + ' ' + ventasFilAnio;
  return ventasFilMes + ' ' + ventasFilAnio;
}

/* ── Fuente única de verdad del panel Ventas ──
   Cierre = conclusión "Reserva" (registros viejos sin conclusión: huboCierre = SI).
   Lo usan KPIs, meta, detalle de cierres, resumen, análisis, avance por asesor, embudo y gráficos,
   para que ningún cuadro cuente distinto que otro. */
function _esCierreVenta(r) { return r.conclusion ? r.conclusion === 'Reserva' : r.huboCierre === 'SI'; }
function _montoCierre(r) { return r.precioVenta || r.precio || 0; }
function _regEnMesAnio(r, mes, anio) { return r.mes === mes && (!r.ts || new Date(r.ts).getFullYear() === Number(anio)); }
function _mesesPeriodoVentas() {
  const nm = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (ventasModoVista === 'gestion') { const out = []; for (let i = 3; i < 15; i++) out.push({ mes: nm[i%12], anio: i < 12 ? ventasFilGestion : ventasFilGestion + 1 }); return out; }
  if (ventasModoVista === 'multimes') return [...ventasFilMesesSeleccionados].sort((a,b) => nm.indexOf(a) - nm.indexOf(b)).map(m => ({ mes: m, anio: ventasFilAnio }));
  return [{ mes: ventasFilMes, anio: ventasFilAnio }];
}
/* Embudo del período: suma mes a mes (Leads → Agendadas → Concretadas → Cierres) */
function calcularFunnelPeriodo(meses) {
  const tot = [0,0,0,0];
  let base = null;
  (meses || _mesesPeriodoVentas()).forEach(({mes, anio}) => { const f = calcularFunnelDatos(mes, anio); base = base || f; f.forEach((e,i) => tot[i] += e.n); });
  base = base || calcularFunnelDatos(ventasFilMes, ventasFilAnio);
  return base.map((e,i) => ({ ...e, n: tot[i], pct: i === 2 ? (tot[1] ? Math.round(tot[2]/tot[1]*100) : undefined) : i === 3 ? (tot[2] ? Math.round(tot[3]/tot[2]*100) : undefined) : undefined }));
}

function renderDashboard() {
  const mes = ventasFilMes;
  const anioMeta = ventasFilAnio;

  // Poblar el selector de año la primera vez, con los años que realmente existan en los datos
  const selAnio = document.getElementById('fil-ventas-anio');
  if (selAnio && !selAnio.dataset.filled) {
    const anioHoy = new Date().getFullYear();
    const anios = [...new Set(todosRegs.map(r => r.ts ? new Date(r.ts).getFullYear() : null).filter(Boolean))];
    if (!anios.includes(anioHoy)) anios.push(anioHoy);
    anios.sort((a,b)=>b-a);
    selAnio.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.value = ventasFilAnio;
    selAnio.dataset.filled = '1';
  }
  const selMes = document.getElementById('fil-ventas-mes');
  if (selMes) selMes.value = ventasFilMes;
  const selGestion = document.getElementById('fil-ventas-gestion');
  if (selGestion && !selGestion.dataset.filled) {
    const gestionHoy = _gestionActual();
    const gestiones = [gestionHoy, gestionHoy-1, gestionHoy-2, gestionHoy-3];
    selGestion.innerHTML = gestiones.map(g=>`<option value="${g}">Gestión ${_labelGestion(g)}</option>`).join('');
    selGestion.value = ventasFilGestion;
    selGestion.dataset.filled = '1';
  }

  const regsPeriodoTodos = todosRegs.filter(_regEnPeriodoVentas);
  const vMes = soloInternos(regsPeriodoTodos);
  const todosRegsInternos = soloInternos(todosRegs);
  const labelPeriodo = _labelPeriodoVentas();

  renderTendenciaVentasChart();

  // KPIs — TODOS siguen el período elegido arriba (mes, varios meses o gestión)
  const cierresPer  = regsPeriodoTodos.filter(_esCierreVenta);            // equipo + agentes externos (= Detalle de cierres)
  const cierresInt  = cierresPer.filter(r => !r.esExterno);
  const nExt        = cierresPer.length - cierresInt.length;
  const interesados = vMes.filter(r => r.interes === 'SI').length;
  const totalVend   = cierresPer.reduce((s,r) => s + _montoCierre(r), 0);
  const nVisPer = soloInternos(visitasComoRegs(todosRegs)).filter(_regEnPeriodoVentas).length;   // visitas presenciales del período (1ª y las que volvieron)
  countUp(document.getElementById('v-kpi-total'), nVisPer);
  setText('v-kpi-total-sub', 'Visitas del equipo interno · ' + labelPeriodo);
  countUp(document.getElementById('v-kpi-mes'), interesados);
  setText('v-kpi-mes-sub', vMes.length ? Math.round(interesados/vMes.length*100) + '% de las visitas · ' + labelPeriodo : labelPeriodo);
  setText('v-kpi-visitas', nVisPer ? Math.round(cierresInt.length/nVisPer*100) + '%' : '—');
  setText('v-kpi-visitas-sub', cierresInt.length + ' reservas del equipo sobre ' + nVisPer + ' visitas · ' + labelPeriodo);
  document.getElementById('kpi-contratos').textContent = cierresPer.length;
  document.getElementById('kpi-contratos-sub').textContent = cierresInt.length + ' del equipo' + (nExt ? ' + ' + nExt + ' de agentes externos' : '') + ' · ' + labelPeriodo;
  document.getElementById('kpi-precio').textContent = totalVend ? '$' + Math.round(totalVend).toLocaleString('es-BO',{maximumFractionDigits:0}) : '—';
  document.getElementById('kpi-precio-sub').textContent = cierresPer.length + ' reserva' + (cierresPer.length!==1?'s':'') + ' · ' + labelPeriodo;
  document.querySelectorAll('.v-per-lbl').forEach(el => el.textContent = labelPeriodo);

  setText('v-analisis-periodo-label', labelPeriodo);

  // Meta — MISMA fuente que Marketing (metas/{anio}/{mes}/mkt_visitas y mkt_cierres).
  // "Por mes": una sola meta. "Gestión completa": se suman las metas de los 12 meses de la gestión.
  setText('v-meta-mes-label', labelPeriodo);
  const cierresReales = cierresInt.length;   // la meta es del equipo: no cuenta agentes externos

  const pintarMeta = (metaV, metaC) => {
    const pctV = metaV ? Math.round(nVisPer/metaV*100) : 0;
    const pctC = metaC ? Math.round(cierresReales/metaC*100) : 0;
    setText('v-meta-visitas-actual', nVisPer);
    setText('v-meta-visitas-txt', metaV ? 'meta: '+metaV : 'meta: sin definir');
    setText('v-meta-visitas-pct', pctV+'%');
    const bV = document.getElementById('v-meta-visitas-bar');
    if (bV) bV.style.width = Math.min(pctV,100)+'%';
    setText('v-meta-cierres-actual', cierresReales);
    setText('v-meta-cierres-txt', metaC ? 'meta: '+metaC : 'meta: sin definir');
    setText('v-meta-cierres-pct', pctC+'%');
    const bC = document.getElementById('v-meta-cierres-bar');
    if (bC) bC.style.width = Math.min(pctC,100)+'%';
  };

  if (ventasModoVista === 'gestion') {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mesesGestion = []; // [{mes, anio}] de abril del año elegido a marzo del siguiente
    for (let i = 3; i < 15; i++) mesesGestion.push({ mes: meses[i%12], anio: i<12 ? ventasFilGestion : ventasFilGestion+1 });
    Promise.all(mesesGestion.map(({mes:m,anio:a}) => window._fbGetMetaOnce(a, m, 'mkt_visitas'))).then(vs => {
      Promise.all(mesesGestion.map(({mes:m,anio:a}) => window._fbGetMetaOnce(a, m, 'mkt_cierres'))).then(cs => {
        const metaV = vs.reduce((s,v)=>s+(v||0),0);
        const metaC = cs.reduce((s,v)=>s+(v||0),0);
        pintarMeta(metaV, metaC);
        renderResumenCierres(regsPeriodoTodos, metaC, labelPeriodo);
      });
    });
  } else {
    window._fbListenMetas(anioMeta, mes, metas => {
      const metaV = metas?.mkt_visitas?.monto || 0;
      const metaC = metas?.mkt_cierres?.monto || 0;
      pintarMeta(metaV, metaC);
      renderResumenCierres(regsPeriodoTodos, metaC, labelPeriodo);
    });
  }

  renderAvancePorAsesor(mes, anioMeta);
  renderDetalleCierres();
  renderAnalisisOrigenModalidad();
  renderBusquedaClienteVentas();
  renderClientesEnNegociacion();
  renderSeguimientoActivo();
  renderDescartados();
  renderHistoricoMensualVentas();
  renderResumenCierres(regsPeriodoTodos, 0, labelPeriodo); // pinta los conteos ya mismo; la meta se actualiza arriba cuando llegue de Firebase
  renderMetaVsEjecucion();
  const contGestionMensual = document.getElementById('ventas-gestion-mensual-cont');
  if (contGestionMensual) contGestionMensual.style.display = (ventasModoVista === 'gestion') ? '' : 'none';
  if (ventasModoVista === 'gestion') renderGestionMensualVentas();

  // Funnel de conversión (mes filtrado) — 100% conectado en tiempo real:
  // Leads = lo que carga Marketing · Visitas agendadas = lo que agenda Call Center ·
  // Visitas concretadas y Cierres = lo que confirman/cierran los asesores.
  const funnelData = calcularFunnelPeriodo();
  pintarFunnelEnDiv('chart-funnel', funnelData);
  pintarFunnelEnDiv('mkt-kpi-embudo', calcularFunnelDatos(mesActual(), anioActual()));   // Marketing: siempre el mes en curso
  renderTendenciaMarketing();

  // Visitas por ORIGEN (canal) — para saber por dónde llegan los clientes
  const origenCounts = {};
  vMes.filter(r=>r.origen).forEach(r => origenCounts[r.origen]=(origenCounts[r.origen]||0)+1);
  const colV = {'Pauta Virtual':'#3b82c4','Referido Cliente':'#38a169','Referido Empresa':'#2d5a27','Redes Sociales':'#7b5ea7','Feria':'#c07a2a','Puerta Fría':'#c0392b','Agente Externo':'#c4622a'};
  _barraHorizontal('chart-visitas', origenCounts, colV);

  /* Chart asesores */
  const asesorCounts = {};
  vMes.forEach(r => asesorCounts[r.asesorNombre]=(asesorCounts[r.asesorNombre]||0)+1);
  const coloresBar = ['#2d5a27','#4a8c3f','#3b82c4','#c07a2a','#7b5ea7','#c0392b'];
  _barraHorizontal('chart-asesores', asesorCounts, null, coloresBar, (label)=>abrirDetalleAsesor(label));

  /* Chart estados — torta, es composición de un todo */
  const estadoCounts = {};
  vMes.forEach(r => estadoCounts[r.estado||'Sin estado']=(estadoCounts[r.estado||'Sin estado']||0)+1);
  const colEstado = {'Seguimiento':'#3b82c4','Reserva':'#2d5a27','Descartado':'#c0392b','Re-agendado':'#c07a2a','Sin estado':'#9ca3af'};
  _tortaEstados('chart-estados', estadoCounts, colEstado);

  /* Calificación de leads (A/B/C/D) */
  const perfilEl = document.getElementById('chart-perfil');
  if (perfilEl) {
    const calCounts = {A:0,B:0,C:0,D:0};
    vMes.filter(r=>r.calificacion).forEach(r => { if (calCounts[r.calificacion]!==undefined) calCounts[r.calificacion]++; });
    const totalCal = vMes.filter(r=>r.calificacion).length || 1;
    const colCal = {A:'var(--ok)',B:'var(--info)',C:'var(--warn)',D:'var(--danger)'};
    perfilEl.innerHTML = Object.entries(calCounts).map(([k,n]) => {
      const pct = Math.round(n/totalCal*100);
      return `<div style="text-align:center;">
        <div style="font-size:var(--fs-3xl);font-weight:700;color:${colCal[k]};font-family:'Cormorant Garamond',serif;">${pct}%</div>
        <div style="font-size:var(--fs-xs);color:var(--gris);margin-top:2px;">Calificación ${k}</div>
        <div style="font-size:var(--fs-sm);color:var(--ink-700);margin-top:2px;">${n}/${vMes.filter(r=>r.calificacion).length}</div>
      </div>`;
    }).join('');
  }

  /* Chart forma pago */
  const pagoCounts = {};
  vMes.filter(r=>r.formaPago).forEach(r => pagoCounts[r.formaPago]=(pagoCounts[r.formaPago]||0)+1);
  _barraHorizontal('chart-pago', pagoCounts, null, coloresBar);
}

/* ═══════════════════════════════════════════
   TABLA ADMIN
═══════════════════════════════════════════ */
function poblarFiltroAsesor() {
  const sel = document.getElementById('fil-asesor');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  const nombres = [...new Set(todosRegs.map(r=>r.asesorNombre))].sort();
  nombres.forEach(n => {
    const o = document.createElement('option');
    o.value = o.textContent = n;
    if (n===cur) o.selected=true;
    sel.appendChild(o);
  });
}

function filtradosAdmin() {
  const fa = document.getElementById('fil-asesor').value;
  const fe = document.getElementById('fil-estado').value;
  const fm = document.getElementById('fil-mes').value;
  const fc = document.getElementById('fil-conclusion').value;
  return todosRegs.filter(r => {
    if (fa && r.asesorNombre !== fa) return false;
    if (fe && r.estado !== fe) return false;
    if (fm && r.mes !== fm) return false;
    if (fc && r.conclusion !== fc) return false;
    return true;
  });
}

function puedeVerPrecios() {
  // Solo Gerencia (rol gerencia) y el Administrador/Controller (sesión admin) ven precios de venta.
  if (typeof modoAdmin !== 'undefined' && modoAdmin) return true;
  if (typeof asesorActual !== 'undefined' && asesorActual && asesorActual.rol === 'gerencia') return true;
  return false;
}

function renderTablaAdmin() {
  const datos = filtradosAdmin();
  const tb = document.getElementById('tabla-admin-body');
  if (!datos.length) {
    tb.innerHTML = '<tr><td colspan="21" class="empty-state">Sin registros con los filtros aplicados.</td></tr>';
    return;
  }
  const verPrecios = puedeVerPrecios();
  // Se dibujan las primeras filas (con miles de registros la página se ponía pesada); el resto con "Mostrar más". El Excel exporta todo.
  const total = datos.length, lim = window._tablaAdminLim || 300;
  tb.innerHTML = datos.slice(0, lim).map(r => `
    <tr>
      <td style="font-size:var(--fs-sm);color:var(--ink-400);white-space:nowrap;">${r.fechaCarga||''}</td>
      <td><strong>${r.asesorNombre||'—'}</strong></td>
      <td>${r.nombre||'—'}</td>
      <td style="font-size:var(--fs-sm);">${r.genero||''}</td>
      <td style="font-size:var(--fs-sm);">${r.detalleVisita||''}</td>
      <td style="font-size:var(--fs-sm);">${r.fecha||''}</td>
      <td style="font-size:var(--fs-sm);">${r.horario||''}</td>
      <td style="font-size:var(--fs-sm);">${r.ciudadProcedencia||''}</td>
      <td style="font-size:var(--fs-sm);">${r.origen||''}</td>
      <td style="text-align:center;">${r.interes ? yesNo(r.interes) : ''}</td>
      <td style="font-size:var(--fs-sm);">${r.aspectoPreferente||''}</td>
      <td style="font-size:var(--fs-sm);">${r.presupuesto?'$'+Number(r.presupuesto).toLocaleString('es-BO'):''}</td>
      <td style="text-align:center;font-weight:600;">${r.calificacion||''}</td>
      <td style="font-size:var(--fs-sm);font-weight:600;font-family:monospace;">${r.terrenoInteres||''}</td>
      <td style="font-size:var(--fs-sm);">${r.pctCierre?r.pctCierre+'%':''}</td>
      <td style="font-size:var(--fs-sm);color:var(--ink-500);">${r.motivoNoCierre||''}</td>
      <td style="font-size:var(--fs-sm);">${r.formaPago||''}</td>
      <td style="font-size:var(--fs-sm);">${r.usoPropiedad||''}</td>
      <td><span class="${estadoBadgeClass(r.conclusion)}" style="font-size:var(--fs-xs);">${r.conclusion||'—'}</span></td>
      <td style="font-size:var(--fs-sm);font-weight:600;color:var(--cartera);">${
        !r.precioVenta ? '' : verPrecios ? '$'+Number(r.precioVenta).toLocaleString('es-BO') : '🔒 Oculto'
      }</td>
      <td style="font-size:var(--fs-sm);max-width:200px;color:var(--ink-500);">${r.comentarios||''}</td>
      <td><button class="btn-del" onclick="eliminarRegistro('${r._asesorId}','${r._key}')">🗑</button></td>
    </tr>`).join('') + (total > lim ? `<tr><td colspan="22" style="text-align:center;padding:12px;"><span style="color:var(--gris);font-size:var(--fs-sm);">Mostrando ${lim} de ${total} registros · </span><button type="button" class="btn-secondary" style="padding:5px 12px;cursor:pointer;" onclick="window._tablaAdminLim=(window._tablaAdminLim||300)+500;renderTablaAdmin()">Mostrar 500 más</button> <button type="button" class="btn-secondary" style="padding:5px 12px;cursor:pointer;" onclick="window._tablaAdminLim=1e9;renderTablaAdmin()">Mostrar todos</button></td></tr>` : '');
}

function yesNo(v) {
  return v==='SI'
    ? '<span style="color:#16a34a;font-weight:600;">✓</span>'
    : '<span style="color:var(--danger);font-weight:600;">✗</span>';
}

function concretadaBadge(v) {
  if (v==='SI')       return '<span style="color:#16a34a;font-weight:600;font-size:var(--fs-sm);">✓ Sí</span>';
  if (v==='NO')       return '<span style="color:var(--danger);font-weight:600;font-size:var(--fs-sm);">✗ No</span>';
  if (v==='Pendiente')return '<span style="color:var(--warn);font-weight:600;font-size:var(--fs-sm);">⏳ Pend.</span>';
  return '';
}

function limpiarFiltros() {
  ['fil-asesor','fil-estado','fil-mes','fil-conclusion'].forEach(id => {
    document.getElementById(id).value = '';
  });
  renderTablaAdmin();
}

async function eliminarRegistro(asesorId, key) {
  const _ok1 = await confirmDialog('Esta accion no se puede deshacer.', { title:'Eliminar registro', okText:'Eliminar' });
  if (!_ok1) return;
  try { await window._fbRemoveRegistro(asesorId, key); toastOk('Registro eliminado.'); }
  catch(e) { toastErr('Error al eliminar: ' + e.message); }
}

async function vaciarTodosLosRegistrosVentas() {
  if (!todosRegs.length) { toastErr('No hay registros de ventas para borrar.'); return; }
  const ok1 = await confirmDialog(
    `Se eliminarán los ${todosRegs.length} registros de Ventas (visitas) de TODOS los asesores. El Inventario de lotes y Expensas NO se tocan. Esta acción no se puede deshacer.`,
    { title:'⚠️ Vaciar todos los registros de Ventas', okText:'Sí, vaciar' }
  );
  if (!ok1) return;
  const ok2 = await confirmDialog('Confirmá una vez más: se borrará TODO el historial de visitas/ventas cargado hasta ahora.', { title:'Última confirmación', okText:'Borrar definitivamente' });
  if (!ok2) return;

  let borrados = 0;
  for (const r of todosRegs) {
    try { await window._fbRemoveRegistro(r._asesorId, r._key); borrados++; } catch(e) {}
  }
  toastOk(borrados + ' registros de ventas eliminados.');
}

/* ═══════════════════════════════════════════
   EXPORTAR EXCEL
═══════════════════════════════════════════ */
function exportarExcel() {
  const datos = filtradosAdmin();
  if (!datos.length) { toastErr('Sin datos para exportar.'); return; }
  const rows = datos.map(r => ({
    'Fecha carga':          r.fechaCarga||'',
    'Asesor':               r.asesorNombre||'',
    'Prospecto':            r.nombre||'',
    'Género':               r.genero||'',
    'Detalle visita':       r.detalleVisita||'',
    'Fecha':                r.fecha||'',
    'Horario':              r.horario||'',
    'Ciudad procedencia':   r.ciudadProcedencia||'',
    'Origen':               r.origen||'',
    '¿Interesado?':         r.interes||'',
    'Aspecto preferente':   r.aspectoPreferente||'',
    'Presupuesto (US$)':    r.presupuesto||'',
    'Calificación':         r.calificacion||'',
    'Lote de interés':      r.terrenoInteres||'',
    '% de cierre':          r.pctCierre||'',
    'Motivo no cierre':     r.motivoNoCierre||'',
    'Forma de pago':        r.formaPago||'',
    'Uso propiedad':        r.usoPropiedad||'',
    'Conclusión':           r.conclusion||'',
    'Precio de venta (US$)': puedeVerPrecios() ? (r.precioVenta||'') : (r.precioVenta ? 'Oculto' : ''),
    'Comentarios':          r.comentarios||''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilla UV');
  XLSX.writeFile(wb, `urubo_planilla_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   GESTIÓN ASESORES (ADMIN)
═══════════════════════════════════════════ */
function renderAsesoresAdmin() {
  const cont = document.getElementById('asesores-list');
  document.getElementById('asesores-count').textContent =
    `${asesores.length} asesor${asesores.length!==1?'es':''}`;
  if (!asesores.length) {
    cont.innerHTML = '<div class="empty-state">No hay asesores.</div>';
    return;
  }
  const mes = PC_MESES[new Date().getMonth()];
  const cuentas = {};
  todosRegs.filter(r=>r.mes===mes).forEach(r =>
    cuentas[r.asesorNombre]=(cuentas[r.asesorNombre]||0)+1);

  cont.innerHTML = asesores.map(a => {
    const rolInfo = ROL_LABELS[a.rol||'ventas'] || ROL_LABELS.ventas;
    const mods = a.modulos || ROL_MODULOS[a.rol||'ventas'] || ['ventas'];
    return `<div class="vendor-item" style="flex-wrap:wrap;gap:var(--sp-2);">
      <div style="flex:1;min-width:200px;">
        <span class="v-name">${esc(a.nombre)}</span>
        <span class="rol-badge" style="margin-left:8px;background:${rolInfo.bg};color:${rolInfo.color};">${rolInfo.icon} ${rolInfo.label}</span>
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
          ${mods.map(m=>`<span style="font-size:var(--fs-2xs);padding:2px 7px;background:var(--fill);border-radius:999px;color:var(--ink-700);">${m}</span>`).join('')}
        </div>
      </div>
      <div class="vendor-actions">
        <span class="v-count">${cuentas[a.nombre]||0} reg. mes</span>
        <button class="btn-remove-vendor" style="background:none;color:var(--ink-700);font-size:var(--fs-base);" onclick="abrirEditarAsesor('${a._key}')" title="Editar">✏️</button>
        <button class="btn-remove-vendor" onclick="eliminarAsesor('${a._key}','${escJs(a.nombre)}')" title="Eliminar">×</button>
      </div>
    </div>`;
  }).join('');
}

async function agregarAsesor() {
  const nombre = document.getElementById('new-asesor-name').value.trim();
  const pin    = document.getElementById('new-asesor-pin').value.trim();
  if (!nombre) { toastErr('El nombre es obligatorio.'); return; }
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { toastErr('El PIN debe ser de 4 digitos numericos.'); return; }
  if (!modulosSeleccionados.length) { toastErr('Elegí al menos un módulo.'); return; }
  if (asesores.some(a=>a.nombre.toLowerCase()===nombre.toLowerCase())) {
    toastErr('Ya existe un usuario con ese nombre.'); return;
  }
  const mods = [...modulosSeleccionados];
  const rol  = inferRolFromModulos(mods);
  const btnA = document.querySelector('[onclick="agregarAsesor()"]');
  btnLoading(btnA, true);
  await window._fbSeg.push('asesores_planilla', { nombre, rol, modulos: mods, celular: (document.getElementById('new-asesor-cel')?.value||'').trim(), correo: (document.getElementById('new-asesor-correo')?.value||'').trim(), ...(await segNuevoPinSeguro(pin)) });   // PIN cifrado, nunca en texto
  btnSuccess(btnA);
  toastOk('Usuario ' + nombre + ' agregado.');
  document.getElementById('new-asesor-name').value = '';
  document.getElementById('new-asesor-pin').value  = '';
  ['new-asesor-cel','new-asesor-correo'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
}

async function eliminarAsesor(key, nombre) {
    const _ok2 = await confirmDialog('Sus registros se conservaran en Firebase.', { title:'Eliminar usuario ' + nombre, okText:'Eliminar' }); if (!_ok2) return;
  await window._fbRemoveAsesor(key);
}

/* ═══════════════════════════════════════════
   EDITAR USUARIO (nombre / PIN / módulos)
═══════════════════════════════════════════ */
let modulosSeleccionadosEdit = [];

function inferRolFromModulos(mods) {
  const sorted = [...mods].sort().join(',');
  for (const r of Object.keys(ROL_MODULOS)) {
    if (r === 'mixto') continue;
    if ([...ROL_MODULOS[r]].sort().join(',') === sorted) return r;
  }
  return 'mixto';
}

function abrirEditarAsesor(key) {
  const a = asesores.find(x => x._key === key);
  if (!a) return;
  const mods = a.modulos || ROL_MODULOS[a.rol || 'ventas'] || ['ventas'];
  modulosSeleccionadosEdit = [...mods];

  document.getElementById('edit-asesor-key').value = key;
  document.getElementById('edit-asesor-name').value = a.nombre;
  document.getElementById('edit-asesor-pin').value  = '';
  document.getElementById('edit-asesor-cel').value = a.celular || '';
  document.getElementById('edit-asesor-correo').value = a.correo || '';

  document.querySelectorAll('#edit-modulos-checkboxes .modulo-check').forEach(label => {
    const inp = label.querySelector('input');
    const on  = mods.includes(inp.value);
    inp.checked = on;
    label.classList.toggle('sel', on);
  });

  document.getElementById('edit-user-overlay').classList.add('open');
}

function cerrarEditarAsesor() {
  document.getElementById('edit-user-overlay').classList.remove('open');
}

function toggleModuloEdit(el, mod) {
  el.classList.toggle('sel');
  const inp = el.querySelector('input');
  if (inp) inp.checked = el.classList.contains('sel');
  modulosSeleccionadosEdit = Array.from(document.querySelectorAll('#edit-modulos-checkboxes .modulo-check.sel'))
    .map(e => e.querySelector('input')?.value).filter(Boolean);
}

async function guardarEdicionAsesor() {
  const key    = document.getElementById('edit-asesor-key').value;
  const nombre = document.getElementById('edit-asesor-name').value.trim();
  const pin    = document.getElementById('edit-asesor-pin').value.trim();

  if (!nombre) { toastErr('El nombre es obligatorio.'); return; }
  if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
    toastErr('El PIN debe ser de 4 dígitos numéricos (o dejalo vacío para no cambiarlo).');
    return;
  }
  if (!modulosSeleccionadosEdit.length) { toastErr('Elegí al menos un módulo.'); return; }
  if (asesores.some(a => a._key !== key && a.nombre.toLowerCase() === nombre.toLowerCase())) {
    toastErr('Ya existe otro usuario con ese nombre.'); return;
  }

  const data = {
    nombre,
    modulos: modulosSeleccionadosEdit,
    rol: inferRolFromModulos(modulosSeleccionadosEdit),
    celular: document.getElementById('edit-asesor-cel').value.trim(),
    correo: document.getElementById('edit-asesor-correo').value.trim(),
  };
  if (pin) Object.assign(data, await segNuevoPinSeguro(pin), { pin: null });   // cifrado; cambiarlo cierra sus sesiones abiertas

  const btn = document.querySelector('#edit-user-overlay .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbUpdateAsesor(key, data);
  btnSuccess(btn);
  toastOk('Usuario ' + nombre + ' actualizado.');
  setTimeout(cerrarEditarAsesor, 500);
}

/* ═══════════════════════════════════════════
   PIN ADMIN
═══════════════════════════════════════════ */
async function cambiarPinAdmin() {
  const np = document.getElementById('new-admin-pin').value.trim();
  const msg = document.getElementById('pin-change-msg');
  if (np.length !== 4 || !/^\d{4}$/.test(np)) {
    msg.style.display='block'; msg.style.color='var(--rojo)';
    msg.textContent='El PIN debe ser exactamente 4 dígitos.'; return;
  }
  const s = await segNuevoPinSeguro(np);
  segAdminSeguro = { hash: s.pinHash, salt: s.pinSalt, ts: Date.now() };
  pinAdminLocal = null;
  await window._fbSeg.multi({ 'config/adminPinSeguro': segAdminSeguro, 'config/adminPin': null });   // cifrado, sin texto
  if (segSesionId) await window._fbSeg.update('sesiones/' + segSesionId, { creado: Date.now() });   // esta sesión sigue; las demás de admin se cierran
  localStorage.removeItem('uv_planilla_pin'); // ya no hace falta guardarlo localmente
  document.getElementById('new-admin-pin').value='';
  toastOk('PIN de administrador actualizado correctamente.');
  if (msg) { msg.style.display='none'; }
}

