/* ═══════════════════════════════════════════
   UNIVERSO GENERAL — lotes vendidos por Modalidad y por Módulo
   (cada Terreno en GetCartera = un lote con plan de pago = vendido)
═══════════════════════════════════════════ */
function renderOrangeCarteraAgregados() {
  const cont = document.getElementById('orange-cart-universo');
  if (!cont) return;
  if (!orangeCarteraAgregados) {
    cont.innerHTML = '<div class="empty-state">Sincronizá con Orange arriba para ver el universo completo.</div>';
    return;
  }
  const { totalLotesVendidos, porModalidad, porModulo } = orangeCarteraAgregados;

  const bloque = (titulo, obj) => {
    const entries = Object.entries(obj||{}).sort((a,b)=>b[1].lotes-a[1].lotes);
    const max = Math.max(...entries.map(([,v])=>v.lotes), 1);
    return `<div>
      <h4 style="margin:0 0 10px;font-size:var(--fs-base);">${titulo}</h4>
      ${entries.map(([k,v]) => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:3px;">
            <span style="font-weight:600;">${esc(k)}</span>
            <span style="color:var(--gris);">${v.lotes} lote${v.lotes!==1?'s':''} · $${Math.round(v.montoAdeudado).toLocaleString('es-BO')} adeudado</span>
          </div>
          <div style="height:8px;background:var(--fill);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${(v.lotes/max*100).toFixed(1)}%;background:var(--cartera);"></div>
          </div>
        </div>`).join('')}
    </div>`;
  };

  cont.innerHTML = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:36px;color:var(--cartera);">${totalLotesVendidos||0}</div>
      <div style="font-size:var(--fs-sm);color:var(--gris);">lotes vendidos con plan de pago activo (Orange)</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      ${bloque('Por Modalidad', porModalidad)}
      ${bloque('Por Módulo', porModulo)}
    </div>`;
}

/* ═══════════════════════════════════════════
   DETALLE CRUDO DE COBROS — Fecha + Tipo de pago (Terreno/Acción) + Monto
   A propósito NO se usa EstadoCuota ni EstadoPago acá — solo el hecho de
   cobranza en sí: quién pagó, qué pagó, y cuándo.
═══════════════════════════════════════════ */
let orangeCarteraDetalleRaw = [];
let orangeReservasRaw = [];     // todas las reservas de Orange (GetReservas), para el Informe de Directorio

// Gestión fiscal: 1° de abril al 31 de marzo del año siguiente.

let _terrenoGestionVentaMap = {}; // terreno -> año de inicio de gestión en que se vendió

async function cargarDetalleCobrosCartera(silencioso) {
  const btn1 = document.getElementById('btn-cargar-detalle-cartera');
  const btn2 = document.getElementById('btn-refrescar-cobranza-cartera');
  const setBtns = (txt, disabled) => {
    if (!silencioso) {
      if (btn1) { btn1.textContent = txt; btn1.disabled = disabled; }
      if (btn2) { btn2.textContent = txt; btn2.disabled = disabled; }
    }
  };
  setBtns('🔄 Cargando...', true);
  try {
    const [respCart, respVentas, respReservas] = await Promise.all([
      fetch(ORANGE_API_URL + '?op=GetCartera'),
      fetch(ORANGE_API_URL + '?op=GetVentas'),
      fetch(ORANGE_API_URL + '?op=GetReservas'),
    ]);
    if (!respCart.ok) throw new Error('HTTP '+respCart.status);
    const textoCrudoCart = await respCart.text();
    let json;
    try {
      json = JSON.parse(textoCrudoCart);
    } catch (eParse) {
      console.error('[ORANGE-CARTERA] Respuesta no es JSON. Primeros 300 caracteres:', textoCrudoCart.slice(0,300));
      throw new Error('Orange no devolvió datos válidos — empieza con: "' + textoCrudoCart.slice(0,80) + '..." (mirá la consola para verlo completo, esto parece un error del lado de Orange, no nuestro)');
    }
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    // Mapa Terreno → gestión en que se concretó la venta (para clasificar cada cobro después).
    // Si GetVentas falla, seguimos igual — todo quedará como "Cartera" por defecto (no rompe nada).
    _terrenoGestionVentaMap = {}; _terrenoFirmaIdx = {};
    try {
      const jsonVentas = await respVentas.json();
      if (jsonVentas.success && Array.isArray(jsonVentas.data)) {
        jsonVentas.data.forEach(r => {
          if (!r.Terreno) return;
          const f = _parseFechaOrange(r.FechaFirma) || _parseFechaOrange(r.Fechacreacion);
          if (f) _terrenoGestionVentaMap[r.Terreno] = _gestionDeFecha(f);
          const ff = _parseFechaOrange(r.FechaFirma); if (ff) _terrenoFirmaIdx[r.Terreno] = ff.getFullYear()*12 + ff.getMonth();
        });
      }
    } catch(e) { console.error('No se pudo cruzar con GetVentas:', e); }

    const gestionActualN = _gestionActual();
    orangeCarteraDetalleRaw = json.data.map(r => {
      const esTerreno = r.TipoPago === 'TERRENOS';
      const monto = esTerreno ? (r.CobranzaTerreno||0) : (r.CobranzaAccion||0);
      const gestionVenta = _terrenoGestionVentaMap[r.Terreno];
      // Ingreso por Venta Nueva: el terreno se vendió DENTRO de la gestión fiscal en curso
      // (1° abril - 31 marzo). Todo lo demás (ventas de gestiones anteriores) es Cartera.
      const tipoIngreso = (gestionVenta !== undefined && gestionVenta === gestionActualN) ? 'Venta Nueva' : 'Cartera';
      const tipoPagoTxt = esTerreno ? 'Terreno' : 'Acción';
      // Clave estable para poder guardar la categoría de este cobro puntual (no hay ID único de Orange).
      const key = `${r.Terreno}_${tipoPagoTxt}_${r.FechaDePago}_${monto}`.replace(/[.#$\[\]\/\s]/g,'-');
      return {
        key, fecha: r.FechaDePago || '', fechaOrden: _parseFechaOrange(r.FechaDePago)?.getTime() || 0,
        cliente: r.NombreCliente||'', terreno: r.Terreno||'', asesor: r.Asesor||'',
        modalidad: r.Modalidad||'Sin modalidad', modulo: r.Modulo||'Sin módulo',
        tipoPago: tipoPagoTxt, monto, tipoIngreso,
      };
    }).filter(r => r.monto > 0); // solo filas con un cobro real asociado

    // Señas de Reservas CONCRETADAS (GetReservas) — la plata del primer pago de una venta
    // nueva, antes de que exista un plan de cuotas en GetCartera. Se suma al mismo total.
    try {
      const jsonReservas = await respReservas.json();
      if (jsonReservas.success && Array.isArray(jsonReservas.data)) {
        orangeReservasRaw = jsonReservas.data;
        const senas = jsonReservas.data.filter(r => r.Estado === 'Concretado' && (r.MontoReserva||0) > 0).map(r => {
          const gestionVenta = _terrenoGestionVentaMap[r.Terreno];
          const tipoIngreso = (gestionVenta !== undefined && gestionVenta === gestionActualN) ? 'Venta Nueva' : 'Cartera';
          const key = `${r.Terreno}_Sena_${r.FechaPago}_${r.MontoReserva}`.replace(/[.#$\[\]\/\s]/g,'-');
          return {
            key, fecha: r.FechaPago||'', fechaOrden: _parseFechaOrange(r.FechaPago)?.getTime() || 0,
            cliente: r.Cliente||'', terreno: r.Terreno||'', asesor: r.AsesorComercial||'',
            modalidad: 'Seña / Reserva', modulo: 'Sin módulo',
            tipoPago: 'Seña', monto: r.MontoReserva||0, tipoIngreso,
          };
        }).filter(r => r.fechaOrden > 0);
        orangeCarteraDetalleRaw = orangeCarteraDetalleRaw.concat(senas);
      }
    } catch(e) { console.error('No se pudo cruzar con GetReservas:', e); }

    poblarFiltrosDetalleCartera();
    renderDetalleCobrosCartera();
    await renderCobranzaCarteraKPIs();
    renderCobranzaCarteraTendencia();
    renderCobranzaCarteraSemanal();
    renderCobranzaPorTerrenoAccion();
    renderCobranzaPorModalidad();
    renderIngresosVentaNuevaVsCartera();
    renderTendenciaVentaNuevaVsCartera();
    renderTendenciaTerrenoAccion();
    renderCategorizacionCobros();
    renderResumenMensualCartera();
    renderSemanalCartera();
    renderDetalleSemanaCartera();
    if (typeof _cobRefrescar === 'function') _cobRefrescar(); // CRM: pagos post-corte detectados en Orange
    const lbl = new Date().toLocaleString('es-BO') + (silencioso ? ' (automática)' : ' (manual)');
    setText('orange-cart-cobranza-sync-label', lbl);
    if (!silencioso) toastOk('Cobranza actualizada: ' + orangeCarteraDetalleRaw.length + ' cobros cargados.');
  } catch(e) {
    if (!silencioso) toastErr('No se pudo cargar el detalle: ' + e.message);
  } finally {
    setBtns('🔄 Actualizar ahora', false);
  }
}

/* ── KPIs de Cobranza: semana actual, mes actual (vs. meta), gestión (año) actual ── */
// ── Filtro global del panel de Cartera ──
let carteraFilAnio = new Date().getFullYear();
let carteraFilMes  = PC_MESES[new Date().getMonth()]; // lista fija, mismo motivo que en Expensas
let carteraFilGestion = _gestionActual();

function cambiarFiltroCartera() {
  carteraFilAnio = parseInt(document.getElementById('fil-cart-anio').value);
  carteraFilMes  = document.getElementById('fil-cart-mes-global').value;
  carteraFilGestion = parseInt(document.getElementById('fil-cart-gestion').value);
  renderCobranzaCarteraKPIs();
  renderCobranzaPorTerrenoAccion();
  renderCobranzaPorModalidad();
  renderIngresosVentaNuevaVsCartera();
  renderTendenciaVentaNuevaVsCartera();
  renderTendenciaTerrenoAccion();
  renderResumenMensualCartera();
  renderSemanalCartera();
}

async function renderCobranzaCarteraKPIs() {
  const hoy = new Date();

  // Poblar selectores la primera vez
  const selAnio = document.getElementById('fil-cart-anio');
  if (selAnio && !selAnio.dataset.filled) {
    const anioHoy = hoy.getFullYear();
    const anios = [...new Set(orangeCarteraDetalleRaw.map(r => r.fechaOrden ? new Date(r.fechaOrden).getFullYear() : null).filter(Boolean))];
    if (!anios.includes(anioHoy)) anios.push(anioHoy);
    anios.sort((a,b)=>b-a);
    selAnio.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.value = carteraFilAnio;
    selAnio.dataset.filled = '1';
  }
  const selMes = document.getElementById('fil-cart-mes-global');
  if (selMes) selMes.value = carteraFilMes;
  const selGestion = document.getElementById('fil-cart-gestion');
  if (selGestion && !selGestion.dataset.filled) {
    const gestionHoy = _gestionActual();
    if (carteraFilGestion === null) carteraFilGestion = gestionHoy;
    const gestiones = [gestionHoy, gestionHoy-1, gestionHoy-2, gestionHoy-3];
    selGestion.innerHTML = gestiones.map(g=>`<option value="${g}">Gestión ${_labelGestion(g)}</option>`).join('');
    selGestion.value = carteraFilGestion;
    selGestion.dataset.filled = '1';
  }

  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(carteraFilMes);

  // Semana actual: siempre la de HOY (no tiene sentido "filtrar" una semana de un mes pasado)
  const diaSemana = (hoy.getDay()+6)%7; // 0=lunes
  const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate()-diaSemana); inicioSemana.setHours(0,0,0,0);
  const finSemana = new Date(inicioSemana); finSemana.setDate(inicioSemana.getDate()+7);

  let cobradoSemana = 0, cobradoMes = 0, cobradoGestion = 0;
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (f.getFullYear() === carteraFilAnio && f.getMonth() === mesFilNum) cobradoMes += r.monto;
    if (_gestionDeFecha(f) === carteraFilGestion) cobradoGestion += r.monto;
    if (r.fechaOrden >= inicioSemana.getTime() && r.fechaOrden < finSemana.getTime()) cobradoSemana += r.monto;
  });

  setText('orange-cart-anio-actual', _labelGestion(carteraFilGestion));
  setText('orange-cart-kpi-semana', '$'+Math.round(cobradoSemana).toLocaleString('es-BO'));
  setText('orange-cart-kpi-mes', '$'+Math.round(cobradoMes).toLocaleString('es-BO'));
  setText('orange-cart-kpi-gestion', '$'+Math.round(cobradoGestion).toLocaleString('es-BO'));

  const [_mcV, _mcM, _mcG] = await Promise.all(['cartera_vigente','cartera_mora','cartera'].map(t => window._fbGetMetaOnce(carteraFilAnio, carteraFilMes, t)));
  const _mcVM = (_mcV||0) + (_mcM||0), metaC = _mcVM || _mcG || 0;
  // con meta vigente + mora se compara la cobranza de cartera (sin venta nueva), igual que el Resumen mensual
  const _cobMeta = _mcVM ? orangeCarteraDetalleRaw.filter(r => { if (!r.fechaOrden || r.tipoIngreso === 'Venta Nueva') return false; const f = new Date(r.fechaOrden); return f.getFullYear() === carteraFilAnio && f.getMonth() === mesFilNum; }).reduce((s, r) => s + r.monto, 0) : cobradoMes;
  const elMeta = document.getElementById('orange-cart-kpi-mes-meta');
  if (elMeta) {
    elMeta.innerHTML = metaC
      ? Math.round(_cobMeta/metaC*100) + '% de la meta' + (_mcVM ? ' vigente + mora' : '') + ' ($'+metaC.toLocaleString('es-BO')+')'
      : '<a href="#" onclick="abrirModalMetaCartera();return false;" style="color:var(--info);font-weight:600;">Sin meta — cargarla acá →</a>';
  }
}

/* ── Tendencia mensual: últimos 12 meses de cobranza real (Orange) ── */
let _chartCobranzaCarteraTendencia = null;
function renderCobranzaCarteraTendencia() {
  const canvas = document.getElementById('orange-cart-chart-tendencia');
  if (!canvas) return;
  const nombresMes = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const hoy = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
    buckets.push({ anio: d.getFullYear(), mes: d.getMonth(), label: nombresMes[d.getMonth()]+' '+String(d.getFullYear()).slice(2), total: 0 });
  }
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const b = buckets.find(x => x.anio===f.getFullYear() && x.mes===f.getMonth());
    if (b) b.total += r.monto;
  });

  if (_chartCobranzaCarteraTendencia) _chartCobranzaCarteraTendencia.destroy();
  _chartCobranzaCarteraTendencia = new Chart(canvas, {
    type: 'line',
    data: {
      labels: buckets.map(b=>b.label),
      datasets: [{ label:'Cobrado', data: buckets.map(b=>Math.round(b.total)), borderColor:'#2451FF', backgroundColor:'#2451FF', tension:.3, pointRadius:4, pointHoverRadius:6 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:22 } },
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>_fmtMonto(ctx.parsed.y)}},
        datalabels:{ display:true, align:'top', anchor:'end', offset:6, color:'#0A0A0A', font:{weight:'700',size:10.5}, formatter:v=>_fmtMonto(v) } },
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback:v=>'$'+(v/1000)+'K'}} }
    }
  });
}

/* ── Tendencia semanal: últimas 10 semanas de cobranza real (Orange) ── */
let _chartCobranzaCarteraSemanal = null;
function renderCobranzaCarteraSemanal() {
  const canvas = document.getElementById('orange-cart-chart-semanal');
  if (!canvas) return;
  const hoy = new Date();
  const diaSemanaHoy = (hoy.getDay()+6)%7;
  const inicioSemanaActual = new Date(hoy); inicioSemanaActual.setDate(hoy.getDate()-diaSemanaHoy); inicioSemanaActual.setHours(0,0,0,0);

  const buckets = [];
  for (let i = 9; i >= 0; i--) {
    const inicio = new Date(inicioSemanaActual); inicio.setDate(inicioSemanaActual.getDate()-i*7);
    const fin = new Date(inicio); fin.setDate(inicio.getDate()+7);
    buckets.push({ inicio, fin, label: inicio.getDate()+'/'+(inicio.getMonth()+1), total: 0 });
  }
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const b = buckets.find(x => r.fechaOrden >= x.inicio.getTime() && r.fechaOrden < x.fin.getTime());
    if (b) b.total += r.monto;
  });

  if (_chartCobranzaCarteraSemanal) _chartCobranzaCarteraSemanal.destroy();
  _chartCobranzaCarteraSemanal = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map(b=>b.label),
      datasets: [{ label:'Cobrado', data: buckets.map(b=>Math.round(b.total)), backgroundColor:'#7C3AED', borderRadius:5, maxBarThickness:28 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>_fmtMonto(ctx.parsed.y)}} },
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback:v=>'$'+(v/1000)+'K'}} }
    }
  });
}

/* ── Cobrado en Terreno vs Cobrado en Acción — según el período elegido arriba ── */
/* ── Tendencia mensual de Venta Nueva vs Cartera, los 12 meses de la gestión elegida ── */
let _chartTendenciaVentaNueva = null;
function renderTendenciaVentaNuevaVsCartera() {
  const canvas = document.getElementById('orange-cart-chart-venta-nueva-tendencia');
  if (!canvas) return;
  const nombresMesCorto = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const gestion = carteraFilGestion;
  const buckets = [];
  for (let i = 3; i < 15; i++) {
    const mesIdx = i % 12, anio = i < 12 ? gestion : gestion + 1;
    buckets.push({ mesIdx, anio, label: nombresMesCorto[mesIdx]+' '+String(anio).slice(2), ventaNueva:0, cartera:0 });
  }
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const b = buckets.find(x => x.mesIdx===f.getMonth() && x.anio===f.getFullYear());
    if (!b) return;
    const gestionVenta = _terrenoGestionVentaMap[r.terreno];
    if (gestionVenta !== undefined && gestionVenta === gestion) b.ventaNueva += r.monto; else b.cartera += r.monto;
  });

  if (_chartTendenciaVentaNueva) _chartTendenciaVentaNueva.destroy();
  _chartTendenciaVentaNueva = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map(b=>b.label),
      datasets: [
        { label:'Venta Nueva', data: buckets.map(b=>Math.round(b.ventaNueva)), backgroundColor:'#1E8E3E', borderRadius:4, maxBarThickness:26, stack:'s' },
        { label:'Cartera', data: buckets.map(b=>Math.round(b.cartera)), backgroundColor:'#2451FF', borderRadius:4, maxBarThickness:26, stack:'s' },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{boxWidth:10,font:{size:10.5}}}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+_fmtMonto(ctx.parsed.y)}} },
      scales:{ x:{stacked:true, grid:{display:false}, ticks:{font:{size:9.5}}}, y:{stacked:true, beginAtZero:true, ticks:{callback:v=>_fmtMonto(v)}} }
    }
  });
}

/* ── Tendencia mensual de Terreno vs Acción, los 12 meses de la gestión elegida ── */
let _chartTendenciaTerrenoAccion = null;
function renderTendenciaTerrenoAccion() {
  const canvas = document.getElementById('orange-cart-chart-terreno-accion-tendencia');
  if (!canvas) return;
  const nombresMesCorto = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const gestion = carteraFilGestion;
  const buckets = [];
  for (let i = 3; i < 15; i++) {
    const mesIdx = i % 12, anio = i < 12 ? gestion : gestion + 1;
    buckets.push({ mesIdx, anio, label: nombresMesCorto[mesIdx]+' '+String(anio).slice(2), terreno:0, accion:0 });
  }
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const b = buckets.find(x => x.mesIdx===f.getMonth() && x.anio===f.getFullYear());
    if (!b) return;
    if (r.tipoPago==='Terreno') b.terreno += r.monto; else b.accion += r.monto;
  });

  if (_chartTendenciaTerrenoAccion) _chartTendenciaTerrenoAccion.destroy();
  _chartTendenciaTerrenoAccion = new Chart(canvas, {
    type: 'line',
    data: {
      labels: buckets.map(b=>b.label),
      datasets: [
        { label:'Terreno', data: buckets.map(b=>Math.round(b.terreno)), borderColor:'#1E8E3E', backgroundColor:'#1E8E3E', tension:.3, pointRadius:3 },
        { label:'Acción', data: buckets.map(b=>Math.round(b.accion)), borderColor:'#2451FF', backgroundColor:'#2451FF', tension:.3, pointRadius:3 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{boxWidth:10,font:{size:10.5}}}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+_fmtMonto(ctx.parsed.y)}} },
      scales:{ x:{grid:{display:false}, ticks:{font:{size:9.5}}}, y:{beginAtZero:true, ticks:{callback:v=>_fmtMonto(v)}} }
    }
  });
}

let _chartCarteraTerrenoAccion = null;
function renderCobranzaPorTerrenoAccion() {
  const cont = document.getElementById('orange-cart-terreno-accion');
  if (!cont) return;
  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(carteraFilMes);
  let terreno = 0, accion = 0, terrenoGestion = 0, accionGestion = 0, nCuotasTerreno = 0, nCuotasAccion = 0;
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    if (r.tipoPago !== 'Terreno' && r.tipoPago !== 'Acción') return; // las Señas no entran acá, tienen su propio origen
    const f = new Date(r.fechaOrden);
    if (f.getFullYear()===carteraFilAnio && f.getMonth()===mesFilNum) {
      if (r.tipoPago==='Terreno') { terreno += r.monto; nCuotasTerreno++; } else { accion += r.monto; nCuotasAccion++; }
    }
    if (_gestionDeFecha(f) === carteraFilGestion) {
      if (r.tipoPago==='Terreno') terrenoGestion += r.monto; else accionGestion += r.monto;
    }
  });
  setText('orange-cart-kpi-terreno-mes', _fmtMonto(terreno));
  setText('orange-cart-kpi-accion-mes', _fmtMonto(accion));
  setText('orange-cart-kpi-terreno-gestion', _fmtMonto(terrenoGestion) + ' en la gestión');
  setText('orange-cart-kpi-accion-gestion', _fmtMonto(accionGestion) + ' en la gestión');
  setText('orange-cart-kpi-terreno-cuotas', nCuotasTerreno + ' cuota' + (nCuotasTerreno!==1?'s':'') + ' cobradas');
  setText('orange-cart-kpi-accion-cuotas', nCuotasAccion + ' cuota' + (nCuotasAccion!==1?'s':'') + ' cobradas');

  const canvas = document.getElementById('orange-cart-chart-terreno-accion');
  if (canvas) {
    if (_chartCarteraTerrenoAccion) _chartCarteraTerrenoAccion.destroy();
    _chartCarteraTerrenoAccion = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Terreno','Acción'], datasets: [{ data: [terreno||0, accion||0], backgroundColor: ['#1E8E3E','#2451FF'], borderColor:'#FFFDF7', borderWidth:2 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.label+': '+_fmtMonto(ctx.parsed)}} } }
    });
  }
}

/* ── Cobrado por Modalidad — según el período elegido arriba ── */
function renderCobranzaPorModalidad() {
  const cont = document.getElementById('orange-cart-por-modalidad');
  if (!cont) return;
  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(carteraFilMes);
  const porModalidad = {};
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (f.getFullYear()!==carteraFilAnio || f.getMonth()!==mesFilNum) return;
    porModalidad[r.modalidad] = (porModalidad[r.modalidad]||0) + r.monto;
  });
  const entries = Object.entries(porModalidad).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) { cont.innerHTML = '<div class="empty-state">Sin cobros en ' + carteraFilMes + ' ' + carteraFilAnio + '.</div>'; return; }
  const max = Math.max(...entries.map(([,v])=>v), 1);
  cont.innerHTML = entries.map(([k,v]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:3px;">
        <span style="font-weight:600;">${esc(k)}</span>
        <span style="color:var(--cartera);font-weight:700;">${_fmtMonto(v)}</span>
      </div>
      <div style="height:9px;background:var(--fill);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${(v/max*100).toFixed(1)}%;background:var(--cartera);"></div>
      </div>
    </div>`).join('');
}

/* ── Ingresos por Venta Nueva vs Cartera — gestión fiscal 1° abril a 31 marzo ── */
let _chartCarteraVentaNueva = null;
function renderIngresosVentaNuevaVsCartera() {
  const cont = document.getElementById('orange-cart-venta-nueva-vs-cartera');
  if (!cont) return;
  const gestionFiltrada = carteraFilGestion;
  let ventaNueva = 0, cartera = 0;
  const terrenosVentaNueva = new Set(), terrenosCartera = new Set();
  orangeCarteraDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (_gestionDeFecha(f) !== gestionFiltrada) return; // solo cobros DENTRO de la gestión elegida
    // Recalculado contra la gestión ELEGIDA (no la de hoy) — para poder mirar gestiones pasadas también.
    const gestionVenta = _terrenoGestionVentaMap[r.terreno];
    const esVentaNueva = (gestionVenta !== undefined && gestionVenta === gestionFiltrada);
    if (esVentaNueva) { ventaNueva += r.monto; terrenosVentaNueva.add(r.terreno); }
    else { cartera += r.monto; terrenosCartera.add(r.terreno); }
  });
  const total = ventaNueva + cartera;
  const pctNueva = total ? Math.round(ventaNueva/total*100) : 0;

  setText('orange-cart-gestion-label', _labelGestion(gestionFiltrada));
  setText('orange-cart-kpi-venta-nueva', _fmtMonto(ventaNueva));
  setText('orange-cart-kpi-cartera-vieja', _fmtMonto(cartera));
  setText('orange-cart-kpi-venta-nueva-clientes', terrenosVentaNueva.size + ' lote' + (terrenosVentaNueva.size!==1?'s':''));
  setText('orange-cart-kpi-cartera-clientes', terrenosCartera.size + ' lote' + (terrenosCartera.size!==1?'s':''));

  const canvas = document.getElementById('orange-cart-chart-venta-nueva');
  if (canvas) {
    if (_chartCarteraVentaNueva) _chartCarteraVentaNueva.destroy();
    _chartCarteraVentaNueva = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Venta Nueva','Cartera'], datasets: [{ data: [ventaNueva||0, cartera||0], backgroundColor: ['#1E8E3E','#2451FF'], borderColor:'#FFFDF7', borderWidth:2 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.label+': '+_fmtMonto(ctx.parsed)}} } }
    });
  }
}
/* ═══════════════════════════════════════════
   CATEGORIZACIÓN MANUAL DE COBROS — usuarios del módulo Cartera (rol 'cobranza')
   Cada cobro que trae Orange se etiqueta a mano en una de estas 9 categorías,
   para poder armar el mismo reporte que ya se le manda a gerencia.
═══════════════════════════════════════════ */
const CARTERA_CATEGORIAS = [
  'Vigente Terreno', 'Mora Terreno', 'Adelanto Terreno',
  'Vigente Acción', 'Mora Acción', 'Adelanto Acción',
  'Otros Ingresos', 'Venta Nueva', 'Desembolso Bancario', 'Pronto Pago',
];

// Semana ISO (número de semana del año) — para que coincida con el "Semana 32/33/34/35" del reporte a gerencia.
// Formato simplificado para no saturar la vista: $150K en vez de $150.000, $1.2M en vez de $1.200.000.
function _fmtMonto(v) {
  v = Math.round(v||0);
  if (Math.abs(v) >= 1000000) return '$'+(v/1000000).toLocaleString('es-BO',{maximumFractionDigits:1})+'M';
  if (Math.abs(v) >= 1000) return '$'+(v/1000).toLocaleString('es-BO',{maximumFractionDigits:1})+'K';
  return '$'+v.toLocaleString('es-BO');
}
// Igual que _fmtMonto pero en Bolivianos — Expensas se maneja en Bs, no en dólares.
function _fmtMontoBs(v) {
  v = Math.round(v||0);
  if (Math.abs(v) >= 1000000) return 'Bs'+(v/1000000).toLocaleString('es-BO',{maximumFractionDigits:1})+'M';
  if (Math.abs(v) >= 1000) return 'Bs'+(v/1000).toLocaleString('es-BO',{maximumFractionDigits:1})+'K';
  return 'Bs'+v.toLocaleString('es-BO');
}

function _semanaISO(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay()+6)%7)) / 7);
  return { anio: d.getUTCFullYear(), semana };
}

async function asignarCategoriaCobro(cobroKey, categoria) {
  if (!categoria) return;
  await window._fbSetCategoriaCobro(cobroKey, { categoria, asignadoPorNombre: asesorActual?.nombre || 'Admin' });
  toastOk('Categorizado como "' + categoria + '".');
}

function renderCategorizacionCobros() {
  const tbody = document.getElementById('cartera-categ-tbody');
  const contador = document.getElementById('cartera-categ-pendientes');
  if (!tbody) return;
  let pendientes = orangeCarteraDetalleRaw.filter(r => !carteraCategoriasData[r.key]);
  if (contador) contador.textContent = pendientes.length + ' pendiente' + (pendientes.length!==1?'s':'') + ' por categorizar';

  const filTipo = document.getElementById('cartera-categ-fil-tipo')?.value || '';
  if (filTipo) pendientes = pendientes.filter(r => r.tipoPago === filTipo);
  // Más recientes primero — antes las Señas quedaban siempre al fondo del array (se agregan
  // después de Terreno/Acción) y con 11.000+ pendientes nunca llegaban a mostrarse en las 200 primeras.
  pendientes = [...pendientes].sort((a,b) => (b.fechaOrden||0) - (a.fechaOrden||0));

  if (!pendientes.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">✅ Nada pendiente' + (filTipo ? ' de tipo "'+filTipo+'"' : '') + '.</div></td></tr>';
    return;
  }
  const opciones = '<option value="">Elegir categoría...</option>' + CARTERA_CATEGORIAS.map(c=>`<option value="${c}">${c}</option>`).join('');
  tbody.innerHTML = pendientes.slice(0,200).map(r => `<tr>
    <td style="font-size:var(--fs-sm);">${esc(r.fecha)}</td>
    <td>${esc(r.cliente)}</td>
    <td style="font-family:monospace;font-size:var(--fs-sm);">${esc(r.terreno)}</td>
    <td style="font-size:var(--fs-sm);">${r.tipoPago}</td>
    <td style="font-weight:600;color:var(--cartera);">$${r.monto.toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
    <td>
      <select onchange="asignarCategoriaCobro('${r.key}', this.value)" style="padding:6px 10px;border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-family:'DM Sans',sans-serif;">
        ${opciones}
      </select>
    </td>
  </tr>`).join('') + (pendientes.length>200 ? `<tr><td colspan="6" style="text-align:center;color:var(--gris);padding:10px;">Mostrando 200 de ${pendientes.length} — categorizá estos y se van cargando los siguientes, o filtrá por tipo arriba.</td></tr>` : '');
}

/* ── Resumen mensual (igual estructura que el reporte a gerencia) ── */
function _sumaCategoria(cobros, categorias) {
  return cobros.filter(r => categorias.includes(carteraCategoriasData[r.key]?.categoria)).reduce((s,r)=>s+r.monto,0);
}

async function renderResumenMensualCartera() {
  const cont = document.getElementById('cartera-resumen-mensual');
  if (!cont) return;

  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(carteraFilMes);
  const delMes = orangeCarteraDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const f = new Date(r.fechaOrden);
    return f.getFullYear()===carteraFilAnio && f.getMonth()===mesFilNum;
  });

  const metaVigente = await window._fbGetMetaOnce(carteraFilAnio, carteraFilMes, 'cartera_vigente') || 0;
  const metaMora    = await window._fbGetMetaOnce(carteraFilAnio, carteraFilMes, 'cartera_mora') || 0;
  const metaVM = metaVigente + metaMora;

  const cVigente = _sumaCategoria(delMes, ['Vigente Terreno','Vigente Acción']);
  const cMora    = _sumaCategoria(delMes, ['Mora Terreno','Mora Acción']);
  const cVigenteMora = cVigente + cMora;
  const cAdelanto = _sumaCategoria(delMes, ['Adelanto Terreno', 'Adelanto Acción']);   // adelanto de terreno + adelanto de acción
  const cOtros    = _sumaCategoria(delMes, ['Otros Ingresos']);
  const cVentaNueva = _sumaCategoria(delMes, ['Venta Nueva']);
  const subAdelantoEtc = cAdelanto + cOtros + cVentaNueva;
  const cDesembolso = _sumaCategoria(delMes, ['Desembolso Bancario']);
  const subGrande = cVigenteMora + subAdelantoEtc + cDesembolso;
  const cProntoPago = _sumaCategoria(delMes, ['Pronto Pago']);
  const totalCobranza = subGrande + cProntoPago;
  const pctMeta = metaVM ? Math.round(cVigenteMora/metaVM*100) : null;

  const fila = (label, valor, destacado, esSub) => `
    <tr style="${destacado?'background:var(--ok-bg,#e8f5e9);font-weight:700;':''}">
      <td style="padding:8px 12px;${esSub?'padding-left:24px;':''}">${label}</td>
      <td style="padding:8px 12px;text-align:right;">${valor!==null ? '$'+Math.round(valor).toLocaleString('es-BO') : '—'}</td>
    </tr>`;

  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--ink-900);color:#fff;"><th style="padding:8px 12px;text-align:left;">Meta Cartera ${carteraFilMes} ${carteraFilAnio}</th><th style="padding:8px 12px;text-align:right;">$us</th></tr></thead>
      <tbody>
        ${fila('Meta Cobranza Vigente', metaVigente)}
        ${fila('Meta Cobranza Mora', metaMora)}
        ${fila('Meta Cobranza Vigente y Mora', metaVM, true)}
        ${fila('Cobranza Vigente', cVigente, false, true)}
        ${fila('Cobranza Mora', cMora, false, true)}
        ${fila('Cobranza Vigente y Mora' + (pctMeta!==null ? ' — '+pctMeta+'% de la meta' : ''), cVigenteMora, true)}
        ${fila('Cobranza Adelantado', cAdelanto, false, true)}
        ${fila('Otros Ingresos', cOtros, false, true)}
        ${fila('Venta Nueva', cVentaNueva, false, true)}
        ${fila('Cobranza Adelantado, Ventas Nuevas, Otros Ingresos', subAdelantoEtc, true)}
        ${fila('Desembolso Bancario', cDesembolso)}
        ${fila('Cobranza Vigente + Mora + Adelantado + Venta Nueva + Desembolso', subGrande, true)}
        ${fila('Cobranza Pronto Pago', cProntoPago)}
        ${fila('TOTAL COBRANZA', totalCobranza, true)}
        ${(() => { const sinCat = delMes.filter(r => !carteraCategoriasData[r.key]?.categoria); const m = sinCat.reduce((s, r) => s + r.monto, 0); return sinCat.length ? fila('Cobros todavía sin categorizar (' + sinCat.length + ')', m, false, true) + fila('TOTAL COBRADO EN ORANGE', totalCobranza + m, true) : ''; })()}
      </tbody>
    </table>
    ${(() => { const n = delMes.filter(r => !carteraCategoriasData[r.key]?.categoria).length; return n ? `<div style="margin-top:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--warn,#C08A2E);font-size:var(--fs-sm);">⚠ ${n} cobro${n!==1?'s':''} de ${carteraFilMes} todavía no ${n!==1?'tienen':'tiene'} categoría. Mientras no se categoricen, la "Cobranza Vigente y Mora" y el % de la meta salen más bajos que lo cobrado de verdad.</div>` : ''; })()}
    <div style="margin-top:12px;">
      <button onclick="abrirModalMetaCarteraCategorias()" class="btn-secondary btn-sm">⚙ Cargar meta Vigente/Mora de ${carteraFilMes}</button>
    </div>
    <p style="font-size:10px;color:#999;margin-top:10px;font-family:monospace;">🔍 Diagnóstico — buscando en: metas/${carteraFilAnio}/${carteraFilMes}/cartera_vigente (leyó: ${metaVigente}) y metas/${carteraFilAnio}/${carteraFilMes}/cartera_mora (leyó: ${metaMora})</p>`;
}

/* ── Semanal, con meta (igual al patrón que usamos en Expensas) ── */
let _chartSemanalCartera = null;
function renderSemanalCartera() {
  const tbody = document.getElementById('cartera-semanal-tbody');
  const canvas = document.getElementById('cartera-chart-semanal-meta');
  if (!tbody) return;

  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(carteraFilMes);
  const delMes = orangeCarteraDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const f = new Date(r.fechaOrden);
    return f.getFullYear()===carteraFilAnio && f.getMonth()===mesFilNum;
  });

  // Agrupar por semana ISO
  const porSemana = {};
  delMes.forEach(r => {
    const { anio, semana } = _semanaISO(new Date(r.fechaOrden));
    const key = anio+'-'+semana;
    (porSemana[key] ||= { anio, semana, total:0, meta:0, cats:{} });
    porSemana[key].total += r.monto;
    const cat = carteraCategoriasData[r.key]?.categoria;
    const cuentaParaMeta = cat === 'Vigente Terreno' || cat === 'Mora Terreno' || cat === 'Vigente Acción' || cat === 'Mora Acción';
    if (cuentaParaMeta) porSemana[key].meta += r.monto;
  });

  const semanas = Object.values(porSemana).sort((a,b)=> a.semana-b.semana);
  if (!semanas.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Sin cobros en ' + carteraFilMes + ' ' + carteraFilAnio + '.</div></td></tr>';
    return;
  }

  tbody.innerHTML = semanas.map(s => {
    const noConsiderada = s.total - s.meta;
    return `<tr>
      <td style="font-weight:600;">Semana ${s.semana}</td>
      <td style="font-weight:600;color:var(--cartera);">$${Math.round(s.total).toLocaleString('es-BO')}</td>
      <td>$${Math.round(s.meta).toLocaleString('es-BO')}</td>
      <td style="color:var(--ok);">$${Math.round(s.meta).toLocaleString('es-BO')}</td>
      <td style="color:var(--gris);">$${Math.round(noConsiderada).toLocaleString('es-BO')}</td>
    </tr>`;
  }).join('') + `<tr style="font-weight:700;background:var(--bg-soft);">
    <td>Total</td>
    <td>$${Math.round(semanas.reduce((s,x)=>s+x.total,0)).toLocaleString('es-BO')}</td>
    <td colspan="2"></td>
    <td>$${Math.round(semanas.reduce((s,x)=>s+(x.total-x.meta),0)).toLocaleString('es-BO')}</td>
  </tr>`;

  if (canvas) {
    if (_chartSemanalCartera) _chartSemanalCartera.destroy();
    _chartSemanalCartera = new Chart(canvas, {
      type: 'line',
      data: {
        labels: semanas.map(s=>'Sem. '+s.semana),
        datasets: [
          { label:'Cobranza total', data: semanas.map(s=>Math.round(s.total)), borderColor:'#E8590C', backgroundColor:'#E8590C', tension:.3 },
          { label:'Cobranza para meta', data: semanas.map(s=>Math.round(s.meta)), borderColor:'#2451FF', backgroundColor:'#2451FF', tension:.3 },
        ]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'top'}, datalabels:{display:false} }, scales:{ y:{beginAtZero:true, ticks:{callback:v=>'$'+(v/1000)+'K'}} } }
    });
  }
}

/* ── Detalle por semana, agrupado por categoría (igual al reporte a gerencia) ── */
function renderDetalleSemanaCartera() {
  const tbody = document.getElementById('cartera-detalle-semana-tbody');
  if (!tbody) return;

  // Poblar selectores la primera vez, con la semana actual por defecto
  const selAnio = document.getElementById('fil-cartera-semana-anio');
  const selSemana = document.getElementById('fil-cartera-semana-num');
  const hoyIso = _semanaISO(new Date());
  if (selAnio && !selAnio.dataset.filled) {
    const anios = [hoyIso.anio, hoyIso.anio-1, hoyIso.anio-2];
    selAnio.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.dataset.filled = '1';
  }
  if (selSemana && !selSemana.dataset.filled) {
    let opts = '';
    for (let i=1;i<=53;i++) opts += `<option value="${i}">Semana ${i}</option>`;
    selSemana.innerHTML = opts;
    selSemana.value = hoyIso.semana;
    selSemana.dataset.filled = '1';
  }

  const anio = parseInt(document.getElementById('fil-cartera-semana-anio')?.value) || new Date().getFullYear();
  const semana = parseInt(document.getElementById('fil-cartera-semana-num')?.value) || 1;

  const cobros = orangeCarteraDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const iso = _semanaISO(new Date(r.fechaOrden));
    return iso.anio === anio && iso.semana === semana;
  });

  if (!cobros.length) {
    tbody.innerHTML = '<tr><td colspan="3"><div class="empty-state">Sin cobros en la Semana ' + semana + '/' + String(anio).slice(2) + '.</div></td></tr>';
    return;
  }

  const porCategoria = {};
  cobros.forEach(r => {
    const cat = carteraCategoriasData[r.key]?.categoria || 'Sin categorizar';
    (porCategoria[cat] ||= []).push(r);
  });
  const ordenCat = [...CARTERA_CATEGORIAS, 'Sin categorizar'];
  const catsOrdenadas = Object.keys(porCategoria).sort((a,b)=>ordenCat.indexOf(a)-ordenCat.indexOf(b));

  let html = '';
  let totalGeneral = 0;
  catsOrdenadas.forEach(cat => {
    const items = porCategoria[cat];
    const subtotal = items.reduce((s,r)=>s+r.monto,0);
    totalGeneral += subtotal;
    html += `<tr style="background:var(--bg-soft);"><td style="font-weight:700;" colspan="2">${esc(cat)}</td><td></td></tr>`;
    items.forEach(r => {
      html += `<tr><td></td><td>${esc(r.cliente)}</td><td style="text-align:right;">$${r.monto.toLocaleString('es-BO')}</td></tr>`;
    });
    html += `<tr style="background:var(--ok-bg,#e8f5e9);font-weight:600;"><td colspan="2">Sub Total</td><td style="text-align:right;">$${Math.round(subtotal).toLocaleString('es-BO')}</td></tr>`;
  });
  html += `<tr style="background:var(--ink-900);color:#fff;font-weight:700;"><td colspan="2">Total general</td><td style="text-align:right;">$${Math.round(totalGeneral).toLocaleString('es-BO')}</td></tr>`;
  tbody.innerHTML = html;
}

function abrirModalMetaCarteraCategorias() {
  const selAnio = document.getElementById('mcc-anio');
  if (!selAnio.options.length) {
    const anioHoy = new Date().getFullYear();
    selAnio.innerHTML = [anioHoy+1, anioHoy, anioHoy-1, anioHoy-2].map(a=>`<option value="${a}">${a}</option>`).join('');
  }
  selAnio.value = carteraFilAnio;
  document.getElementById('mcc-mes').value = carteraFilMes;
  cargarMetaCarteraCategoriasExistente();
  document.getElementById('modal-meta-cartera-categorias').classList.add('open');
}
async function cargarMetaCarteraCategoriasExistente() {
  const anio = document.getElementById('mcc-anio')?.value;
  const mes  = document.getElementById('mcc-mes')?.value;
  if (!anio || !mes) return;
  document.getElementById('mcc-vigente').value = await window._fbGetMetaOnce(anio, mes, 'cartera_vigente') || '';
  document.getElementById('mcc-mora').value = await window._fbGetMetaOnce(anio, mes, 'cartera_mora') || '';
}
function cerrarModalMetaCarteraCategorias() {
  document.getElementById('modal-meta-cartera-categorias')?.classList.remove('open');
}
async function guardarMetaCarteraCategorias() {
  const anio = document.getElementById('mcc-anio')?.value;
  const mes  = document.getElementById('mcc-mes')?.value;
  const vigente = parseFloat(document.getElementById('mcc-vigente')?.value) || 0;
  const mora = parseFloat(document.getElementById('mcc-mora')?.value) || 0;
  if (!anio || !mes) { toastErr('Elegí un período.'); return; }
  await window._fbSetMeta(anio, mes, 'cartera_vigente', vigente);
  await window._fbSetMeta(anio, mes, 'cartera_mora', mora);
  toastOk('Guardado en metas/' + anio + '/' + mes + '/cartera_vigente (' + vigente + ') y .../cartera_mora (' + mora + ')');
  cerrarModalMetaCarteraCategorias();
  carteraFilAnio = parseInt(anio);
  carteraFilMes = mes;
  const selAnioGlobal = document.getElementById('fil-cart-anio');
  const selMesGlobal = document.getElementById('fil-cart-mes-global');
  if (selAnioGlobal) selAnioGlobal.value = anio;
  if (selMesGlobal) selMesGlobal.value = mes;
  renderResumenMensualCartera();
  renderSemanalCartera();
  renderCobranzaCarteraKPIs();
}

function poblarFiltrosDetalleCartera() {
  const selMod = document.getElementById('fil-cart-modalidad');
  const selModu = document.getElementById('fil-cart-modulo');
  if (selMod) {
    const vals = [...new Set(orangeCarteraDetalleRaw.map(r=>r.modalidad))].sort();
    selMod.innerHTML = '<option value="">Todas las modalidades</option>' + vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
  if (selModu) {
    const vals = [...new Set(orangeCarteraDetalleRaw.map(r=>r.modulo))].sort();
    selModu.innerHTML = '<option value="">Todos los módulos</option>' + vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
}

function renderDetalleCobrosCartera() {
  const tbody = document.getElementById('orange-cart-detalle-tbody');
  if (!tbody) return;
  const term = (document.getElementById('orange-cart-detalle-buscar')?.value||'').trim().toLowerCase();
  const filTipo = document.getElementById('fil-cart-tipo')?.value || '';
  const filMod  = document.getElementById('fil-cart-modalidad')?.value || '';
  const filModu = document.getElementById('fil-cart-modulo')?.value || '';

  let datos = orangeCarteraDetalleRaw;
  if (term) datos = datos.filter(r => (r.cliente||'').toLowerCase().includes(term) || (r.terreno||'').toLowerCase().includes(term));
  if (filTipo) datos = datos.filter(r => r.tipoPago === filTipo);
  if (filMod)  datos = datos.filter(r => r.modalidad === filMod);
  if (filModu) datos = datos.filter(r => r.modulo === filModu);
  datos = [...datos].sort((a,b) => b.fechaOrden - a.fechaOrden);

  const total = datos.reduce((s,r)=>s+r.monto,0);
  setText('orange-cart-detalle-total', '$'+Math.round(total).toLocaleString('es-BO') + ' (' + datos.length + ' cobros)');

  if (!datos.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Sin datos — tocá "Cargar detalle de cobros" arriba.</div></td></tr>';
    return;
  }
  tbody.innerHTML = datos.slice(0,500).map(r => `<tr>
    <td style="font-size:var(--fs-sm);">${esc(r.fecha)}</td>
    <td>${esc(r.cliente)}</td>
    <td style="font-family:monospace;font-size:var(--fs-sm);">${esc(r.terreno)}</td>
    <td><span style="padding:2px 9px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;${r.tipoPago==='Terreno'?'background:var(--ok-bg);color:var(--ok-ink);':r.tipoPago==='Acción'?'background:var(--info-bg,#eef4fb);color:var(--info);':'background:var(--warn-bg);color:var(--warn-ink);'}">${r.tipoPago}</span></td>
    <td style="font-size:var(--fs-sm);">${esc(r.modalidad)}</td>
    <td style="font-weight:600;color:var(--cartera);">$${r.monto.toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
  </tr>`).join('') + (datos.length>500 ? `<tr><td colspan="6" style="text-align:center;color:var(--gris);font-size:var(--fs-sm);padding:10px;">Mostrando los primeros 500 de ${datos.length} — usá los filtros para acotar.</td></tr>` : '');
}



function renderOrangeMoraPanel() {
  renderOrangeMoraKPIs();
  renderOrangeMoraTabla();
}

function calcularEstadoPago(anioCobro, mesCobroNum, anioPeriodo, mesPeriodoNum) {
  const diff = (anioCobro*12+mesCobroNum) - (anioPeriodo*12+mesPeriodoNum);
  if (diff < 0)  return 'Adelantado';
  if (diff === 0) return 'Vigente';
  if (diff === 1) return 'Mora 1-30';
  if (diff === 2) return 'Mora 31-60';
  if (diff === 3) return 'Mora 61-90';
  if (diff <= 6)  return 'Mora 91-180';
  return 'Mora +180';
}

function calcularEstadoExpensa(periodos) {
  if (!periodos || !periodos.length) return 'Sin gestión';
  const maxPeriodo = Math.max(...periodos.map(p => p.anio*12 + p.mesNum));
  const hoy = new Date();
  const actual = hoy.getFullYear()*12 + (hoy.getMonth()+1);
  const diff = actual - maxPeriodo;
  if (diff < 0)  return 'Adelantado';
  if (diff === 0) return 'Vigente';
  if (diff === 1) return 'Mora 1-30';
  if (diff === 2) return 'Mora 31-60';
  if (diff === 3) return 'Mora 61-90';
  if (diff <= 6)  return 'Mora 91-180';
  return 'Mora +180';
}

// Busca, entre las categorías de Expensas ya creadas por el usuario, la que corresponde
// a un estado (ej. "Mora Expensas" para Mora, "Vigente Expensas" para Vigente, "Pagos Adelantados").
function matchCategoriaPorEstado(estado) {
  const cats = (typeof categoriasData !== 'undefined' ? categoriasData : []).filter(c => c.tipo === 'expensas');
  const term = estado === 'Vigente' ? 'vigente'
             : estado === 'Adelantado' ? 'adelant'
             : estado.startsWith('Mora') ? 'mora'
             : null;
  if (!term) return null;
  return cats.find(c => (c.nombre||'').toLowerCase().includes(term)) || null;
}

/* ═══════════════════════════════════════════
   CATEGORÍAS CARTERA (Config)
═══════════════════════════════════════════ */
function renderCatCarteraConfig() {
  const cont = document.getElementById('cat-cartera-lista');
  if (!cont) return;
  if (!catCarteraData.length) {
    cont.innerHTML = '<div class="empty-state">Sin categorías. Agregá una.</div>';
  } else {
    cont.innerHTML = catCarteraData.map(c => `
      <div class="vendor-item">
        <span class="v-name">${esc(c.nombre)}</span>
        <button class="btn-remove-vendor" onclick="window._fbRemoveCatCartera('${c._key}')">×</button>
      </div>`).join('');
  }
  // Populate selects
  const opts = '<option value="">Seleccionar...</option>' +
    catCarteraData.map(c=>`<option value="${c._key}" data-nombre="${c.nombre}">${c.nombre}</option>`).join('');
  ['mc-categoria','cob-categoria','ucob-categoria'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  populateCobFiltCat();
}

async function agregarCatCartera() {
  const nombre = document.getElementById('new-cat-cartera')?.value.trim();
  if (!nombre) { toastErr('Ingresa un nombre para la categoria.'); return; }
  const btnCat = document.querySelector('[onclick="agregarCatCartera()"]');
  btnLoading(btnCat, true);
  await window._fbPushCatCartera(nombre);
  btnSuccess(btnCat);
  toastOk('Categoria agregada.');
  const el = document.getElementById('new-cat-cartera');
  if (el) el.value = '';
}

/* ═══════════════════════════════════════════
   CATEGORÍAS EXPENSAS (Config) — independientes de Cartera
═══════════════════════════════════════════ */
function renderCatExpensasConfig() {
  const cont = document.getElementById('cat-expensas-lista');
  if (cont) {
    if (!catExpensasData.length) {
      cont.innerHTML = '<div class="empty-state">Sin categorías. Agregá una.</div>';
    } else {
      cont.innerHTML = catExpensasData.map(c => `
        <div class="vendor-item">
          <span class="v-name">${esc(c.nombre)}</span>
          <button class="btn-remove-vendor" onclick="window._fbRemoveCatExpensas('${c._key}')">×</button>
        </div>`).join('');
    }
  }
  // Populate el select del formulario rápido de expensas del asesor
  const opts = '<option value="">Seleccionar...</option>' +
    catExpensasData.map(c=>`<option value="${c._key}" data-nombre="${c.nombre}">${c.nombre}</option>`).join('');
  const el = document.getElementById('uexp-categoria');
  if (el) el.innerHTML = opts;
}

async function agregarCatExpensas() {
  const nombre = document.getElementById('new-cat-expensas')?.value.trim();
  if (!nombre) { toastErr('Ingresa un nombre para la categoria.'); return; }
  const btnCat = document.querySelector('[onclick="agregarCatExpensas()"]');
  btnLoading(btnCat, true);
  await window._fbPushCatExpensas(nombre);
  btnSuccess(btnCat);
  toastOk('Categoria agregada.');
  const el = document.getElementById('new-cat-expensas');
  if (el) el.value = '';
}

/* ═══════════════════════════════════════════
   META DE CLIENTES (clientes vigentes del mes)
═══════════════════════════════════════════ */
function toggleFormMetaCliente() {
  const f = document.getElementById('form-meta-cliente');
  const e = document.getElementById('form-excel-meta');
  if (f) f.style.display = f.style.display==='none' ? 'block' : 'none';
  if (e) e.style.display = 'none';
  // Set mes actual
  const mc_mes = document.getElementById('mc-mes');
  if (mc_mes) {
    const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    mc_mes.value = meses[new Date().getMonth()];
  }
}

function abrirExcelMeta() {
  const f = document.getElementById('form-excel-meta');
  const g = document.getElementById('form-meta-cliente');
  if (f) f.style.display = f.style.display==='none' ? 'block' : 'none';
  if (g) g.style.display = 'none';
}

async function guardarClienteMeta() {
  const nombre = document.getElementById('mc-nombre')?.value.trim();
  const monto  = parseFloat(document.getElementById('mc-monto')?.value) || 0;
  const catKey = document.getElementById('mc-categoria')?.value || '';
  const catEl  = document.getElementById('mc-categoria');
  const catNom = catEl?.options[catEl.selectedIndex]?.text || '';
  const mes    = document.getElementById('mc-mes')?.value || mesActual();
  if (!nombre) { toastErr('El nombre del cliente es obligatorio.'); return; }
  const btn = document.querySelector('[onclick="guardarClienteMeta()"]');
  btnLoading(btn, true);
  try {
    await window._fbPushCartaMeta({ nombre, monto, catKey, catNombre:catNom, mes, anio:new Date().getFullYear(), ts:Date.now() });
    btnSuccess(btn);
    document.getElementById('mc-nombre').value = '';
    document.getElementById('mc-monto').value  = '';
    toggleFormMetaCliente();
    toastOk('Cliente agregado a la meta.');
  } catch(e) {
    btnLoading(btn, false);
    toastErr('No se pudo guardar: ' + (e.message||'revisa tu conexion.'));
  }
}

function renderCartaMeta() {
  const filMes = document.getElementById('meta-fil-mes')?.value || '';
  const mes    = filMes || mesActual();
  const anio   = anioActual();
  const datos  = cartaMetaData.filter(c => (!filMes || c.mes===filMes) && c.anio===anio);
  const totalMeta = datos.reduce((s,c)=>s+(c.monto||0),0);
  const countEl = document.getElementById('cart-meta-count');
  if (countEl) countEl.textContent = `(${datos.length} clientes · $${totalMeta.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})})`;
  countUpMoney(document.getElementById('cart-kpi-meta'), totalMeta);
  setText('cart-kpi-meta-n', datos.length + ' clientes en meta');

  const cont = document.getElementById('cart-meta-lista');
  if (!cont) return;
  cont.innerHTML = datos.length ? datos.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1.5px solid #f0f1f3;border-radius:var(--r-md);margin-bottom:6px;background:#fff;">
      <div>
        <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink-900);">${esc(c.nombre)}</div>
        <div style="font-size:var(--fs-xs);color:var(--gris);">${c.catNombre||'Sin categoría'} · ${c.mes||''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--sp-2);">
        <span style="font-size:var(--fs-md);font-weight:700;color:var(--cartera);">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
        <button onclick="window._fbRemoveCartaMeta('${c._key}')" class="btn-del" style="font-size:var(--fs-xs);padding:3px 6px;">🗑</button>
      </div>
    </div>`).join('')
  : '<div class="empty-state">Sin clientes en la meta este mes.</div>';
}

/* Plantilla Excel meta */
function descargarPlantillaMeta() {
  const rows = [
    { 'Cliente':'Juan Perez', 'Monto ($)':1500, 'Categoria':'Terreno' },
    { 'Cliente':'Maria Gomez', 'Monto ($)':800, 'Categoria':'Accion' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:30},{wch:14},{wch:16}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Meta');
  XLSX.writeFile(wb, 'plantilla_meta_cartera.xlsx');
}

function procesarExcelMeta(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    const mes  = document.getElementById('meta-fil-mes')?.value || mesActual();
    const anio = anioActual();
    metaExcelPend = rows.map(r => ({
      nombre:    String(r['Cliente']||'').trim(),
      monto:     parseFloat(r['Monto ($)']||r['Monto']||0),
      catNombre: String(r['Categoria']||r['Categoría']||'').trim(),
      catKey:    '',
      mes, anio, ts: Date.now(),
    })).filter(r => r.nombre);
    // Match categorías
    metaExcelPend.forEach(r => {
      const cat = catCarteraData.find(c=>c.nombre.toLowerCase()===r.catNombre.toLowerCase());
      if (cat) r.catKey = cat._key;
    });
    setText('meta-prev-count', metaExcelPend.length);
    const tbody = document.getElementById('meta-prev-body');
    if (tbody) tbody.innerHTML = metaExcelPend.map(r=>`<tr>
      <td>${esc(r.nombre)}</td>
      <td style="font-weight:600;color:var(--cartera);">$${r.monto.toFixed(2)}</td>
      <td>${r.catNombre ? esc(r.catNombre) : '—'}${(!r.catKey && r.catNombre) ? ' <span style="font-size:var(--fs-xs);padding:1px 7px;border-radius:999px;background:var(--verde-bg);color:var(--verde);font-weight:600;">nueva</span>' : ''}</td>
    </tr>`).join('');
    const prev = document.getElementById('meta-excel-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarExcelMeta() {
  let ok = 0;
  const nuevasCats = {}; // nombre en minúscula -> key, evita crear duplicados dentro del mismo import
  for (const r of metaExcelPend) {
    if (!r.catKey && r.catNombre) {
      const clave = r.catNombre.toLowerCase();
      if (nuevasCats[clave]) {
        r.catKey = nuevasCats[clave];
      } else {
        try {
          const nuevaRef = window._fbPushCatCartera(r.catNombre); // el key ya está disponible sin esperar
          r.catKey = nuevaRef.key;
          nuevasCats[clave] = nuevaRef.key;
          await nuevaRef; // esperar a que la escritura se confirme en el servidor
        } catch (e) { console.error(e); }
      }
    }
    try { await window._fbPushCartaMeta(r); ok++; } catch(e){}
  }
  const nNuevas = Object.keys(nuevasCats).length;
  toastOk(ok + ' clientes importados a la meta.' + (nNuevas ? ' Se crearon ' + nNuevas + ' categoría(s) nueva(s) automáticamente.' : ''));
  cancelarExcelMeta();
}

function cancelarExcelMeta() {
  metaExcelPend=[];
  const prev=document.getElementById('meta-excel-preview');
  if(prev) prev.style.display='none';
  const inp=document.getElementById('meta-excel-file');
  if(inp) inp.value='';
}

/* ═══════════════════════════════════════════
   COBROS CARTERA (pagos del mes)
═══════════════════════════════════════════ */
function toggleFormCobro() {
  const f = document.getElementById('form-cobro-nuevo');
  if (!f) return;
  const open = f.style.display==='none';
  f.style.display = open ? 'block' : 'none';
  if (open) {
    const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const selMes = document.getElementById('cob-mes');
    if (selMes) selMes.value = meses[new Date().getMonth()];
  }
}

async function guardarCobro_cartera() {
  const nombre = document.getElementById('cob-nombre')?.value.trim();
  const monto  = parseFloat(document.getElementById('cob-monto')?.value) || 0;
  if (!nombre) { toastErr('El nombre del cliente es obligatorio.'); return; }
  if (!monto)  { toastErr('Ingresa un monto valido.'); return; }
  const catEl  = document.getElementById('cob-categoria');
  const catKey = catEl?.value || '';
  const catNom = catEl?.options[catEl?.selectedIndex]?.text || '';
  const suma   = document.querySelector('input[name=cob-suma]:checked')?.value || 'SI';
  const semana = document.getElementById('cob-semana')?.value || 'S1';
  const mes    = document.getElementById('cob-mes')?.value || mesActual();
  const obs    = document.getElementById('cob-obs')?.value.trim() || '';
  const btn    = document.querySelector('[onclick="guardarCobro_cartera()"]');
  btnLoading(btn, true);
  try {
    await window._fbPushCartaCobro({
      nombre, monto, catKey, catNombre:catNom, sumaMeta:suma,
      semana, mes, anio:anioActual(), obs,
      cargadoPor:'Admin', fechaCarga:new Date().toLocaleString('es-BO')
    });
    btnSuccess(btn);
    ['cob-nombre','cob-monto','cob-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    toggleFormCobro();
    toastOk('Cobro registrado correctamente.');
  } catch(e) {
    btnLoading(btn, false);
    toastErr('No se pudo guardar el cobro: ' + (e.message||'revisa tu conexion.'));
  }
}

function renderCartaCobros() {
  const filMes  = document.getElementById('cob-fil-mes')?.value || '';
  const filSuma = document.getElementById('cob-fil-suma')?.value || '';
  const filCat  = document.getElementById('cob-fil-cat')?.value || '';
  const mes     = mesActual();
  const anio    = anioActual();
  let datos = cartaCobroData.filter(c => c.anio===anio);
  if (filMes)  datos = datos.filter(c=>c.mes===filMes);
  if (filSuma) datos = datos.filter(c=>c.sumaMeta===filSuma);
  if (filCat)  datos = datos.filter(c=>c.catKey===filCat);
  const countEl = document.getElementById('cart-cobros-count');
  if (countEl) countEl.textContent = `(${datos.length})`;
  const cont = document.getElementById('cart-cobros-lista');
  if (!cont) return;
  cont.innerHTML = datos.length ? datos.map(c => {
    const sumaOn = c.sumaMeta==='SI';
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;border:1.5px solid ${sumaOn?'#d1fae5':'#fef3c7'};border-radius:var(--r-md);margin-bottom:6px;background:#fff;">
      <div>
        <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink-900);">${esc(c.nombre)}</div>
        <div style="font-size:var(--fs-xs);color:var(--gris);">${c.catNombre||'—'} · ${c.semana||''} · ${c.mes||''}</div>
        <span style="font-size:var(--fs-2xs);font-weight:600;padding:2px 8px;border-radius:999px;margin-top:4px;display:inline-block;${sumaOn?'background:var(--ok-bg);color:var(--ok-ink);':'background:var(--warn-bg);color:var(--warn-ink);'}">${sumaOn?'✓ Suma meta':'✗ No suma'}</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <span style="font-size:var(--fs-base);font-weight:700;color:${sumaOn?'var(--cartera)':'var(--warn)'};">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
        <div style="display:flex;gap:4px;">
          <button onclick="toggleSumaMeta_carta('${c._key}','${sumaOn?'NO':'SI'}')" style="font-size:var(--fs-2xs);padding:3px 7px;border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;background:#f9fafb;">${sumaOn?'→ No suma':'→ Suma'}</button>
          <button onclick="eliminarCobro_carta('${c._key}')" class="btn-del" style="font-size:var(--fs-xs);padding:3px 6px;">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('')
  : '<div class="empty-state">Sin cobros este mes.</div>';
}

async function toggleSumaMeta_carta(key, nuevoVal) {
  await window._fbUpdateCartaCobro(key, { sumaMeta: nuevoVal });
  toastInfo('Actualizado.');
}

async function eliminarCobro_carta(key) {
  const ok = await confirmDialog('Eliminar este cobro?', { title:'Eliminar cobro', okText:'Eliminar' });
  if (ok) {
    await window._fbRemoveCartaCobro(key);
    toastOk('Cobro eliminado.');
  }
}

/* ═══════════════════════════════════════════
   KPIs RESUMEN CARTERA
═══════════════════════════════════════════ */
function renderCartaKPIs() {
  const mes  = mesActual();
  const anio = anioActual();
  setText('cart-mes-label2', mes + ' ' + anio);
  setText('cart-resumen-mes', mes + ' ' + anio);

  const delMes   = cartaCobroData.filter(c=>c.mes===mes&&c.anio===anio);
  const siMeta   = delMes.filter(c=>c.sumaMeta==='SI');
  const noMeta   = delMes.filter(c=>c.sumaMeta==='NO');
  const totalSi  = siMeta.reduce((s,c)=>s+(c.monto||0),0);
  const totalNo  = noMeta.reduce((s,c)=>s+(c.monto||0),0);
  const totalAll = totalSi + totalNo;
  const metaDatos= cartaMetaData.filter(c=>c.mes===mes&&c.anio===anio);
  const totalMeta= metaDatos.reduce((s,c)=>s+(c.monto||0),0);

  // KPIs
  countUpMoney(document.getElementById('cart-kpi-cobrado'), totalSi);
  const pct = totalMeta ? Math.round(totalSi/totalMeta*100) : 0;
  setText('cart-kpi-cobrado-pct', pct+'% de la meta');
  countUpMoney(document.getElementById('cart-kpi-nometa'), totalNo);
  setText('cart-kpi-nometa-n', noMeta.length+' cobros adicionales');
  countUpMoney(document.getElementById('cart-kpi-total'), totalAll);
  setText('cart-kpi-total-n', delMes.length+' cobros en total');

  // Barra progreso
  setText('cart-cobrado-display', '$'+totalSi.toLocaleString('es-BO',{maximumFractionDigits:0}));
  setText('cart-pct-display', pct+'%');
  const bar = document.getElementById('cart-barra-main');
  if (bar) {
    bar.style.width=Math.min(pct,100)+'%';
    bar.style.background=pct>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pct>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--cartera),var(--cartera-light))';
  }

  // Meta global del mes (de Firebase metas/)
  window._fbListenMetas(anio, mes, metas => {
    const metaGlobal = metas?.cartera?.monto || 0;
    setText('cart-meta-global-display', metaGlobal ? '$'+Number(metaGlobal).toLocaleString('es-BO') : 'No configurada');
    if (typeof updateHomeMetas==='function') updateHomeMetas('cartera', totalSi, metaGlobal, metaGlobal?Math.round(totalSi/metaGlobal*100):0);
  });

  // Resumen por categoría — SÍ suman
  _renderResumenCat('cart-resumen-si', siMeta, 'var(--verde)');
  setText('cart-subtotal-si', '$'+totalSi.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  // Resumen por categoría — NO suman
  _renderResumenCat('cart-resumen-no', noMeta, 'var(--warn)');
  setText('cart-subtotal-no', '$'+totalNo.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  // Total general
  setText('cart-total-general', '$'+totalAll.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));

  // Tabla detalle
  renderCartaTabla();
}

function _renderResumenCat(elId, datos, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!datos.length) {
    el.innerHTML = `<div style="font-size:var(--fs-base);color:var(--gris);padding:8px;">Sin cobros.</div>`;
    return;
  }
  const porCat = {};
  datos.forEach(c => {
    const cat = c.catNombre || 'Sin categoría';
    if (!porCat[cat]) porCat[cat] = { total:0, n:0 };
    porCat[cat].total += (c.monto||0);
    porCat[cat].n++;
  });
  el.innerHTML = Object.entries(porCat).sort((a,b)=>b[1].total-a[1].total).map(([cat,d])=>`
    <div style="background:#fff;border:1.5px solid #f0f1f3;border-radius:var(--r-md);padding:14px;">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--gris);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">${cat}</div>
      <div style="font-size:var(--fs-2xl);font-weight:700;color:${color};font-family:'Cormorant Garamond',serif;">$${d.total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      <div style="font-size:var(--fs-xs);color:var(--gris);margin-top:2px;">${d.n} cobro${d.n!==1?'s':''}</div>
    </div>`).join('');
}

function renderCartaTabla() {
  const mes  = mesActual();
  const anio = anioActual();
  const datos = cartaCobroData.filter(c=>c.anio===anio);
  const tb = document.getElementById('cart-tabla-body');
  if (!tb) return;
  tb.innerHTML = datos.length ? datos.map(c=>{
    const sumaOn=c.sumaMeta==='SI';
    return `<tr>
      <td><strong>${esc(c.nombre)}</strong></td>
      <td style="font-size:var(--fs-sm);">${c.catNombre||'—'}</td>
      <td style="font-weight:600;color:${sumaOn?'var(--cartera)':'var(--warn)'};">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="font-size:var(--fs-sm);text-align:center;">${c.semana||'—'}</td>
      <td style="font-size:var(--fs-sm);">${c.mes||'—'}</td>
      <td style="text-align:center;"><span style="font-size:var(--fs-xs);font-weight:600;padding:2px 8px;border-radius:999px;${sumaOn?'background:var(--ok-bg);color:var(--ok-ink);':'background:var(--warn-bg);color:var(--warn-ink);'}">${sumaOn?'✓ Sí':'✗ No'}</span></td>
      <td style="font-size:var(--fs-sm);color:var(--gris);">${c.obs||''}</td>
      <td><button class="btn-del" onclick="eliminarCobro_carta('${c._key}')">🗑</button></td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="8" class="empty-state">Sin datos.</td></tr>';
}

function exportarCartaCompleto() {
  if (!cartaCobroData.length) { toastErr('Sin cobros para exportar.'); return; }
  const rows = cartaCobroData.map(c=>({
    'Cliente':c.nombre, 'Categoria':c.catNombre, 'Monto ($)':c.monto,
    'Suma meta':c.sumaMeta, 'Semana':c.semana, 'Mes':c.mes, 'Observaciones':c.obs
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Cartera');
  XLSX.writeFile(wb,`cartera_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ══ SWITCH TAB INTERNO CARTERA ══
function switchCartaTab(id) {
  ['cobros','meta','resumen','detalle'].forEach(t => {
    const el = document.getElementById('ctab-' + t);
    const btn = document.getElementById('ctab-btn-' + t);
    if (el) el.style.display = t===id ? 'block' : 'none';
    if (btn) {
      btn.style.background    = t===id ? '#fff' : 'transparent';
      btn.style.color         = t===id ? 'var(--verde)' : '#6b7280';
      btn.style.fontWeight    = t===id ? '600' : '500';
      btn.style.boxShadow     = t===id ? '0 1px 4px rgba(0,0,0,.06)' : 'none';
    }
  });
  if (id==='resumen') { _renderResumenCat('cart-resumen-si', cartaCobroData.filter(c=>c.sumaMeta==='SI'&&c.mes===mesActual()&&c.anio===anioActual()), 'var(--verde)'); _renderResumenCat('cart-resumen-no', cartaCobroData.filter(c=>c.sumaMeta==='NO'&&c.mes===mesActual()&&c.anio===anioActual()), 'var(--warn)'); }
  if (id==='detalle') renderCartaTabla();
  if (id==='meta')    renderCartaMeta();
  if (id==='cobros')  { renderCartaCobros(); populateCobFiltCat(); }
}

// Populate category filter in cobros
function populateCobFiltCat() {
  const sel = document.getElementById('cob-fil-cat');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas las categorias</option>' +
    catCarteraData.map(c=>`<option value="${c._key}"${c._key===cur?' selected':''}>${c.nombre}</option>`).join('');
}

// Legacy compat
function renderCartaAdmin() { renderCartaCobros(); renderCartaKPIs(); }
function renderCartaAdminKPIs() { renderCartaKPIs(); }

/* Meta cartera: modal prolijo consolidado más arriba, junto al Panel de Control. */

const ESTADOS_COLOR = {
  'Al día':    'var(--ok)', 'Vigente':    'var(--ok)', 'Pagado':    'var(--ok)', 'Adelantado':'var(--info)',
  'Mora':      'var(--danger)', 'Mora 1-30':  'var(--warn)', 'Mora 31-60':'var(--warn-strong)',
  'Mora 61-90':'var(--danger)', 'Mora 91-180':'#8b1a1a', 'Mora +180': '#5c0f0f',
  'Mora +60':  'var(--danger)', 'Parcial':    'var(--warn)', 'Sin gestión':'#9ca3af'
};

/* ── PLANTILLA EXCEL ── */
function descargarPlantillaCartaAdmin() {
  const rows = [
    { 'Cliente':'Ejemplo Cliente A', 'Cobranza ($)': 1500, 'Estado':'Al día',    'Concepto':'Terreno' },
    { 'Cliente':'Ejemplo Cliente B', 'Cobranza ($)': 800,  'Estado':'Mora',      'Concepto':'Acción' },
    { 'Cliente':'Ejemplo Cliente C', 'Cobranza ($)': 2000, 'Estado':'Mora 1-30', 'Concepto':'Terreno' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  // Bold header
  ws['!cols'] = [{wch:30},{wch:14},{wch:16},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
  XLSX.writeFile(wb, 'plantilla_cartera.xlsx');
}

/* ── PROCESAR EXCEL CARTERA ── */
function procesarExcelCartaAdmin(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    // Pedir semana y mes al usuario
    const semana = prompt('Semana del archivo (S1, S2, S3 o S4):') || 'S1';
    const mesOpt = prompt('Mes del archivo (ej: Junio):') || mesActual();
    const anio   = new Date().getFullYear();

    cartaAdminPend = rows.map(r => ({
      cliente:  String(r['Cliente']||'').trim(),
      monto:    parseFloat(r['Cobranza ($)']||r['Cobranza']||r['Monto']||0),
      estado:   String(r['Estado']||'Sin gestión').trim(),
      concepto: String(r['Concepto']||'Terreno').trim(),
      semana,
      mes:      mesOpt,
      anio,
      cargadoPor: 'Admin',
      fechaCarga: new Date().toLocaleString('es-BO'),
    })).filter(r => r.cliente && r.monto > 0);

    setText('cart-admin-prev-count', cartaAdminPend.length);
    const tbody = document.getElementById('cart-admin-prev-body');
    if (tbody) {
      tbody.innerHTML = cartaAdminPend.map((r,i) => `<tr>
        <td style="color:var(--gris);font-size:var(--fs-sm);">${i+1}</td>
        <td><strong>${r.cliente}</strong></td>
        <td style="font-weight:600;color:var(--cartera);">$${r.monto.toFixed(2)}</td>
        <td><span style="padding:2px 8px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;background:${ESTADOS_COLOR[r.estado]||'#9ca3af'}22;color:${ESTADOS_COLOR[r.estado]||'#6b7280'};">${r.estado}</span></td>
        <td style="font-size:var(--fs-sm);">${r.concepto}</td>
      </tr>`).join('');
    }
    const prev = document.getElementById('cart-admin-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarImportCartaAdmin() {
  if (!cartaAdminPend.length) return;
  const btn = document.querySelector('[onclick="confirmarExcelMeta()"]');
  if (btn) { btn.textContent = 'Importando...'; btn.disabled = true; }
  let ok = 0;
  for (const r of cartaAdminPend) {
    try { await window._fbPushCartaAdmin(r); ok++; } catch(e) { console.error(e); }
  }
  toastOk(ok + ' clientes importados.');
  cancelarImportCartaAdmin();
}

function cancelarImportCartaAdmin() {
  cartaAdminPend = [];
  const prev = document.getElementById('cart-admin-preview');
  if (prev) prev.style.display = 'none';
  const inp = document.getElementById('cart-admin-excel');
  if (inp) inp.value = '';
}

/* ── KPIs CARTERA ── */
// renderCartaAdminKPIs — legacy, see renderCartaKPIs()

/* ── RENDER CARTERA PRINCIPAL ── */
// renderCartaAdmin — legacy, see renderCartaCobros()

function exportarCartaAdmin() {
  if (!cartaAdminData.length) { toastErr('Sin datos para exportar.'); return; }
  const rows = cartaAdminData.map(c => ({
    'Cliente':c.cliente, 'Cobranza ($)':c.monto, 'Estado':c.estado,
    'Concepto':c.concepto, 'Semana':c.semana, 'Mes':c.mes, 'Año':c.anio
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Cartera');
  XLSX.writeFile(wb, `cartera_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   EXPENSAS ADMIN — FUNCIONES
═══════════════════════════════════════════ */
function abrirModalMetaExpensas() {
  const anioSel = document.getElementById('meta-exp-anio');
  const mesSel  = document.getElementById('meta-exp-mes');
  const montoEl = document.getElementById('meta-exp-monto');
  if (!anioSel || !mesSel || !montoEl) return;

  const anioActualN = new Date().getFullYear();
  const anios = [...new Set([...expAdminData.map(e=>e.anio).filter(Boolean), anioActualN, anioActualN-1, anioActualN-2])]
    .sort((a,b)=>b-a);
  anioSel.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
  anioSel.value = anioActualN;
  mesSel.value  = mesActual();
  montoEl.value = '';

  cargarMetaExpensasExistente();
  document.getElementById('modal-meta-expensas').classList.add('open');
}

async function cargarMetaExpensasExistente() {
  const anio = document.getElementById('meta-exp-anio')?.value;
  const mes  = document.getElementById('meta-exp-mes')?.value;
  const montoEl = document.getElementById('meta-exp-monto');
  if (!anio || !mes || !montoEl) return;
  const actual = await window._fbGetMetaOnce(anio, mes, 'expensas');
  montoEl.value = actual || '';
  montoEl.placeholder = actual ? '' : 'Sin meta cargada para este período';
}

function cerrarModalMetaExpensas() {
  document.getElementById('modal-meta-expensas')?.classList.remove('open');
}

async function guardarMetaExpensasModal() {
  const anio = document.getElementById('meta-exp-anio')?.value;
  const mes  = document.getElementById('meta-exp-mes')?.value;
  const val  = parseFloat(document.getElementById('meta-exp-monto')?.value);
  if (!anio || !mes || !val) { toastErr('Elegí un período y un monto válido.'); return; }
  const btn = document.querySelector('#modal-meta-expensas .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbSetMeta(anio, mes, 'expensas', val);
  btnSuccess(btn);
  toastOk('Meta de ' + mes + ' ' + anio + ' guardada (Bs ' + val.toLocaleString('es-BO') + ').');
  setTimeout(() => { cerrarModalMetaExpensas(); renderExpensasAdmin(); }, 500);
}

function toggleFormExpensa() {
  const f = document.getElementById('exp-form-nuevo');
  if (f) f.style.display = f.style.display==='none' ? 'block' : 'none';
}

async function guardarCobradoExpensa() {
  const cliente = document.getElementById('exp-nuevo-cliente')?.value.trim();
  const monto   = parseFloat(document.getElementById('exp-nuevo-monto')?.value) || 0;
  if (!cliente) { toastErr('El nombre del cliente es obligatorio.'); return; }
  if (!monto)   { toastErr('Ingresa un monto valido.'); return; }
  const semana  = document.getElementById('exp-nuevo-semana')?.value || 'S1';
  const mes     = document.getElementById('exp-nuevo-mes')?.value || mesActual();
  const btnExp  = document.querySelector('[onclick="guardarCobradoExpensa()"]');
  btnLoading(btnExp, true);
  try {
    await window._fbPushExpAdmin({
      cliente,
      terreno:    document.getElementById('exp-nuevo-terreno')?.value.trim() || '',
      monto,
      semana,
      mes,
      anio:       new Date().getFullYear(),
      obs:        document.getElementById('exp-nuevo-obs')?.value.trim() || '',
      cargadoPor: 'Admin',
      fechaCarga: new Date().toLocaleString('es-BO'),
    });
    ['exp-nuevo-cliente','exp-nuevo-terreno','exp-nuevo-monto','exp-nuevo-obs'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    btnSuccess(btnExp);
    toastOk('Cobro de expensa guardado.');
    toggleFormExpensa();
  } catch(e) {
    btnLoading(btnExp, false);
    toastErr('No se pudo guardar el cobro: ' + (e.message||'revisa tu conexion.'));
  }
}

/* ═══════════════════════════════════════════
   IMPORTAR EXCEL — COBROS DE EXPENSAS (módulo aparte de Cartera)
═══════════════════════════════════════════ */
let expensasExcelPend = [];
let expensasExcelNombreArchivo = '';

function abrirExcelExpensas() {
  const f = document.getElementById('form-excel-expensas');
  if (!f) return;
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function _pintarEstadoExp(estado) {
  const color = ESTADOS_COLOR[estado] || '#9ca3af';
  return `<span style="padding:2px 8px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;background:${color}22;color:${color};">${esc(estado)}</span>`;
}

function procesarExcelExpensas(input) {
  const file = input.files[0]; if (!file) return;
  expensasExcelNombreArchivo = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});

    // ¿Es el formato "Arqueo de Caja" (Orange)? Buscamos la fila de encabezados reales.
    let headerRow = -1;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      if (String(aoa[i]?.[0]||'').trim() === 'Nro Operación') { headerRow = i; break; }
    }

    let parsed = [];

    if (headerRow >= 0) {
      // ── FORMATO ORANGE: Arqueo de Caja ──
      for (let i = headerRow+1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row) continue;
        const col0 = String(row[0]||'').trim();
        if (!col0 || col0 === 'Subtotal :' || col0 === 'Total :' || col0.toUpperCase().includes('EGRESO')) continue;
        if (!col0.startsWith('Venta Nro')) continue; // salta subtítulos tipo "Cobro de Expensas"

        const fecha    = excelFechaToDate(row[1]);
        const cliente  = String(row[7]||'').trim();
        const terreno  = String(row[11]||'').replace(/\u00a0/g,'').trim();
        const conceptoTxt = String(row[10]||'');
        const montoRaw = row[13];
        const per = parseConceptoExpensa(conceptoTxt);
        if (!cliente || !terreno || !per || !fecha) continue;

        parsed.push({
          cliente, terreno,
          monto: parseMontoBO(montoRaw),
          // "Concepto" → SOLO indica qué cuota se está pagando (para calcular estado / mora):
          mesPeriodoNum: per.mesNum,
          anioPeriodo: per.anio,
          tipoPago: per.tipoPago,
          cuotaLabel: MESES_ES_NOMBRE[per.mesNum] + ' ' + per.anio,
          // "Fecha Comprobante" → cuándo pagó el cliente: esto organiza semana/mes/año de COBRO:
          mes: MESES_ES_NOMBRE[fecha.getMonth()+1],
          anio: fecha.getFullYear(),
          semana: 'S' + Math.ceil(fecha.getDate() / 7), // semana relativa al mes de cobro
          semanaIso: semanaISO(fecha),
          fechaComprobante: fecha.toLocaleDateString('es-BO'),
          obs: conceptoTxt,
          cargadoPor: 'Admin (Excel Orange)',
          fechaCarga: new Date().toLocaleString('es-BO'),
        });
      }

      // Estado de CADA cuota individual: cuándo se pagó vs. a qué mes correspondía.
      // (El estado "actual" del lote basado en hoy sigue existiendo aparte, para el
      // resumen del cliente en "Detalle por cliente" — ver calcularEstadoExpensa.)
      parsed.forEach(r => {
        const mesCobroNum = MESES_ES_NOMBRE.indexOf(r.mes);
        r.estado = calcularEstadoPago(r.anio, mesCobroNum, r.anioPeriodo, r.mesPeriodoNum);
        // Categoría automática según el estado de ESA cuota (vos ya creaste "Mora Expensas" / "Vigente Expensas" / "Pagos Adelantados")
        const cat = matchCategoriaPorEstado(r.estado);
        r.categoriaKey    = cat?._key || '';
        r.categoriaNombre = cat?.nombre || r.estado;
      });

    } else {
      // ── FORMATO SIMPLE (plantilla propia) ──
      const rows = XLSX.utils.sheet_to_json(ws);
      parsed = rows.map(r => ({
        cliente: String(r['Cliente']||r['Cliente / Propietario']||'').trim(),
        terreno: String(r['Terreno']||r['Unidad']||r['Unidad / Terreno']||'').trim(),
        monto:   parseFloat(r['Monto']||r['Monto cobrado']||r['Monto ($)']||0) || 0,
        semana:  String(r['Semana']||'S1').trim(),
        mes:     String(r['Mes']||mesActual()).trim(),
        anio:    new Date().getFullYear(),
        estado:  'Sin gestión',
        obs:     String(r['Observaciones']||r['Obs']||'').trim(),
        cargadoPor: 'Admin',
        fechaCarga: new Date().toLocaleString('es-BO'),
      })).filter(r => r.cliente);
    }

    expensasExcelPend = parsed;

    setText('exp-prev-count', expensasExcelPend.length);
    const tbody = document.getElementById('exp-prev-body');
    if (tbody) tbody.innerHTML = expensasExcelPend.map(r=>`<tr>
      <td>${esc(r.cliente)}</td>
      <td>${esc(r.terreno)}</td>
      <td>${esc(r.mes)} ${esc(String(r.anio))} <span style="color:var(--gris);font-size:var(--fs-xs);">(${esc(r.semana)})</span></td>
      <td>${esc(r.cuotaLabel||'')}${r.tipoPago && r.tipoPago!=='completo' ? ' <span style="color:var(--gris);font-size:var(--fs-xs);">('+esc(r.tipoPago)+')</span>' : ''}</td>
      <td style="font-weight:600;color:var(--cartera);">${r.monto?'Bs '+r.monto.toLocaleString('es-BO',{minimumFractionDigits:2}):'—'}</td>
      <td>${_pintarEstadoExp(r.estado)}</td>
      <td>${r.categoriaNombre ? `<span class="cat-badge" style="font-size:var(--fs-xs);">${esc(r.categoriaNombre)}</span>` : '<span style="color:var(--gris);font-size:var(--fs-xs);">sin categoría creada</span>'}</td>
    </tr>`).join('');

    const prev = document.getElementById('exp-excel-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarExcelExpensas() {
  const cargaId   = 'carga_' + Date.now();
  const cargaNombreArchivo = expensasExcelNombreArchivo || 'archivo.xlsx';

  let ok = 0;
  for (const r of expensasExcelPend) {
    try {
      const data = { ...r, cargaId, cargaArchivo: cargaNombreArchivo };
      if (r.terreno && r.mesPeriodoNum && r.anioPeriodo) {
        // Upsert determinístico: mismo lote + mismo período → actualiza, no duplica.
        const idKey = `orange_${r.terreno.replace(/[^a-zA-Z0-9]/g,'-')}_${r.anioPeriodo}_${String(r.mesPeriodoNum).padStart(2,'0')}`;
        await window._fbSetExpPeriodo(idKey, data);
      } else {
        await window._fbPushExpAdmin(data);
      }
      ok++;
    } catch(e) {}
  }
  toastOk(ok + ' cobros de expensas importados.');
  cancelarExcelExpensas();
}

function cancelarExcelExpensas() {
  expensasExcelPend = [];
  const prev = document.getElementById('exp-excel-preview');
  if (prev) prev.style.display = 'none';
  const inp = document.getElementById('exp-excel-file');
  if (inp) inp.value = '';
}

// Distribuye la meta MENSUAL entre semanas. Los pesos dependen de si el mes tiene 4 o 5 semanas
// (usando la misma definición de "semana" que el resto del sistema: ceil(día/7)).
function diasEnMes(anio, mesNum) { return new Date(anio, mesNum, 0).getDate(); }
function pesosMetaSemanal(anio, mesNum) {
  const nSemanas = Math.ceil(diasEnMes(anio, mesNum) / 7);
  return nSemanas <= 4 ? [0.18, 0.27, 0.30, 0.25] : [0.12, 0.18, 0.30, 0.24, 0.16];
}
function metaSemanaMonto(metaMensual, anio, mesNum, semanaNum) {
  const pesos = pesosMetaSemanal(anio, mesNum);
  return metaMensual * (pesos[semanaNum-1] || 0);
}

/* ═══════════════════════════════════════════
   GRÁFICO — Tendencia de cobranza vs meta (Expensas)
═══════════════════════════════════════════ */
let _chartTendenciaExpensas = null;
let _tendenciaExpGranActual = 'mes';

function cambiarGranularidadTendenciaExp(gran) {
  _tendenciaExpGranActual = gran;
  document.querySelectorAll('#exp-tendencia-gran button').forEach(b => {
    const on = b.dataset.gran === gran;
    b.style.background = on ? '#fff' : 'transparent';
    b.style.color = on ? 'var(--ink-900)' : 'var(--gris)';
    b.style.boxShadow = on ? 'var(--shadow-xs)' : 'none';
  });
  renderTendenciaExpensas();
}

async function renderTendenciaExpensas() {
  const canvas = document.getElementById('exp-chart-tendencia');
  if (!canvas) return;
  const gran = _tendenciaExpGranActual;

  if (!expAdminData.length) {
    if (_chartTendenciaExpensas) { _chartTendenciaExpensas.destroy(); _chartTendenciaExpensas = null; }
    return;
  }

  // 1. Agrupar por FECHA DE COBRO (mes/año/semana ya calculados al importar) según la granularidad elegida
  const buckets = {};
  expAdminData.forEach(e => {
    if (!e.anio || !e.mes) return;
    const mesNum = MESES_ES_NOMBRE.indexOf(e.mes);
    if (mesNum < 1) return;
    let key, label, orden, semNum = null;
    if (gran === 'anio') {
      key = String(e.anio); label = key; orden = e.anio;
    } else if (gran === 'semana') {
      semNum = parseInt((e.semana||'S1').replace('S',''))||1;
      orden = e.anio*48 + mesNum*4 + semNum;
      key = e.anio+'-'+mesNum+'-'+semNum;
      label = 'S'+semNum+' '+MESES_ES_NOMBRE[mesNum].slice(0,3)+' '+String(e.anio).slice(2);
    } else {
      orden = e.anio*12+mesNum;
      key = e.anio+'-'+mesNum;
      label = MESES_ES_NOMBRE[mesNum].slice(0,3)+' '+String(e.anio).slice(2);
    }
    (buckets[key] ||= {label, orden, monto:0, anio:e.anio, mesNum, semNum}).monto += (e.monto||0);
  });

  const ordenados = Object.values(buckets).sort((a,b)=>a.orden-b.orden);
  if (!ordenados.length) return;

  // 2. Meta correspondiente a cada bucket (según granularidad).
  //    Para "semana", la meta mensual se reparte con los pesos de metaSemanaMonto,
  //    no se repite plana — así se puede ver si superás o no la meta DE ESA semana puntual.
  const metaMensualCache = {};
  const metaPorBucket = [];
  for (const b of ordenados) {
    if (gran === 'anio') {
      let sum = 0;
      for (let m=1;m<=12;m++) sum += await window._fbGetMetaOnce(b.anio, MESES_ES_NOMBRE[m], 'expensas');
      metaPorBucket.push(sum);
    } else {
      const ck = b.anio+'_'+b.mesNum;
      if (!(ck in metaMensualCache)) metaMensualCache[ck] = await window._fbGetMetaOnce(b.anio, MESES_ES_NOMBRE[b.mesNum], 'expensas');
      const metaMensual = metaMensualCache[ck];
      metaPorBucket.push(gran === 'semana' ? metaSemanaMonto(metaMensual, b.anio, b.mesNum, b.semNum) : metaMensual);
    }
  }

  // 3. Render Chart.js
  if (_chartTendenciaExpensas) _chartTendenciaExpensas.destroy();
  _chartTendenciaExpensas = new Chart(canvas, {
    type: 'line',
    data: {
      labels: ordenados.map(b=>b.label),
      datasets: [
        { label:'Cobranza', data: ordenados.map(b=>b.monto), borderColor:'#1E8E3E', backgroundColor:'rgba(30,142,62,.14)',
          fill:true, tension:.35, pointRadius:3, pointBackgroundColor:'#1E8E3E' },
        { label:'Meta', data: metaPorBucket, borderColor:'#E0951A', borderDash:[6,4], backgroundColor:'transparent',
          fill:false, tension:.2, pointRadius:2, pointBackgroundColor:'#E0951A' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect:false, mode:'index' },
      plugins: {
        legend: { display:true, position:'bottom', labels:{ usePointStyle:true, color:'#0A0A0A' } },
        datalabels: {
          align: 'top', anchor: 'end', offset: 4,
          font: { family: "'DM Sans',sans-serif", weight: '700', size: 10 },
          color: (ctx) => ctx.dataset.borderColor,
          formatter: (v) => v > 0 ? 'Bs '+Math.round(v).toLocaleString('es-BO') : '',
        }
      },
      scales: {
        y: { ticks: { color:'#0A0A0A', callback: v => 'Bs '+Number(v).toLocaleString('es-BO',{maximumFractionDigits:0}) }, grid:{color:'rgba(10,10,10,.10)'} },
        x: { ticks: { color:'#0A0A0A', autoSkip:true, maxRotation:0 }, grid:{color:'rgba(10,10,10,.10)'} }
      }
    }
  });
}


/* ═══════════════════════════════════════════
   GESTIÓN DE CARGAS (borrar por lote — útil durante pruebas)
═══════════════════════════════════════════ */
function renderCargasExpensas() {
  const cont = document.getElementById('exp-cargas-lista');
  if (!cont) return;
  const porCarga = {};
  expAdminData.forEach(e => {
    if (!e.cargaId) return; // registros manuales (uno por uno) no forman "carga"
    (porCarga[e.cargaId] ||= { archivo:e.cargaArchivo||'—', registros:[], fecha:e.fechaCarga||'' }).registros.push(e);
  });
  const cargas = Object.entries(porCarga).sort((a,b)=> b[0].localeCompare(a[0]));

  if (!cargas.length) { cont.innerHTML = '<div class="empty-state">Sin cargas de Excel registradas (los cobros manuales uno-por-uno no cuentan como carga).</div>'; return; }

  cont.innerHTML = cargas.map(([cargaId, c]) => {
    const total = c.registros.reduce((s,r)=>s+(r.monto||0),0);
    return `
      <div class="vendor-item">
        <span class="v-name">📄 ${esc(c.archivo)} <span style="color:var(--gris);font-weight:400;">— ${c.registros.length} registro(s) · Bs ${total.toLocaleString('es-BO',{maximumFractionDigits:0})} · ${esc(c.fecha)}</span></span>
        <button class="btn-remove-vendor" onclick="eliminarCargaExpensas('${cargaId}', ${c.registros.length})" title="Eliminar esta carga completa">🗑 Eliminar carga</button>
      </div>`;
  }).join('');
}

async function eliminarCargaExpensas(cargaId, n) {
  const ok = await confirmDialog(`Se eliminarán los ${n} registros de esta carga de Excel. Esta acción no se puede deshacer.`, { title:'Eliminar carga completa', okText:'Eliminar carga' });
  if (!ok) return;
  const keys = expAdminData.filter(e => e.cargaId === cargaId).map(e => e._key);
  for (const k of keys) { try { await window._fbRemoveExpAdmin(k); } catch(e) {} }
  toastOk(keys.length + ' registros eliminados.');
  setTimeout(renderCargasExpensas, 400);
}

async function vaciarTodoExpensas() {
  if (!expAdminData.length) { toastErr('No hay nada que borrar.'); return; }
  const ok = await confirmDialog(`Se eliminarán TODOS los ${expAdminData.length} cobros de expensas cargados (manuales y de Excel). Pensado solo para pruebas. Esta acción no se puede deshacer.`, { title:'⚠️ Vaciar todo Expensas', okText:'Sí, vaciar todo' });
  if (!ok) return;
  const keys = expAdminData.map(e => e._key);
  for (const k of keys) { try { await window._fbRemoveExpAdmin(k); } catch(e) {} }
  toastOk('Se vació todo el módulo de Expensas.');
  setTimeout(renderCargasExpensas, 400);
}

function renderExpensasAdmin() {
  const mes  = mesActual();
  const anio = anioActual();
  const lbl  = document.getElementById('exp-periodo-label');
  if (lbl) lbl.textContent = mes + ' ' + anio;

  // Poblar el filtro de Año dinámicamente según los datos que hay cargados
  const anioSel = document.getElementById('exp-fil-anio');
  const mesSel  = document.getElementById('exp-fil-mes');
  if (anioSel && !anioSel.dataset.filled) {
    const anios = [...new Set(expAdminData.map(e=>e.anio).filter(Boolean))].sort((a,b)=>b-a);
    if (!anios.length) anios.push(new Date().getFullYear());
    if (!anios.includes(anio)) anios.unshift(anio);
    anioSel.innerHTML = '<option value="">Todos los años</option>' +
      anios.map(a=>`<option value="${a}">${a}</option>`).join('');
    anioSel.value = anio; // por defecto: año en curso
    if (mesSel) mesSel.value = mes; // por defecto: mes en curso
    anioSel.dataset.filled = '1';
  }

  const filAnio = document.getElementById('exp-fil-anio')?.value || '';
  const filMes  = document.getElementById('exp-fil-mes')?.value || '';
  const filSem  = document.getElementById('exp-fil-semana')?.value || '';
  let datos = expAdminData;
  if (filAnio) datos = datos.filter(e => String(e.anio)===String(filAnio));
  if (filMes)  datos = datos.filter(e => e.mes===filMes);
  if (filSem)  datos = datos.filter(e => e.semana===filSem);

  const delMes  = expAdminData.filter(e => e.mes===mes && e.anio===anio);
  const total   = delMes.reduce((s,e)=>s+(e.monto||0), 0);
  const historico = expAdminData.reduce((s,e)=>s+(e.monto||0), 0);

  countUpMoney(document.getElementById('exp-cobrado-val'), total, 900, 'Bs ');
  setText('exp-cobrado-n', delMes.length+' cobros');
  countUpMoney(document.getElementById('exp-historico-val'), historico, 900, 'Bs ');

  // ── KPIs por estado, según el período filtrado (Año/Mes/Semana de arriba) ──
  const ESTADOS_KPI = ['Adelantado','Vigente','Mora 1-30','Mora 31-60','Mora 61-90','Mora 91-180','Mora +180'];
  const porEstado = {};
  ESTADOS_KPI.concat('Sin gestión').forEach(k => porEstado[k] = {monto:0, n:0});
  datos.forEach(e => {
    const key = porEstado[e.estado] ? e.estado : 'Sin gestión';
    porEstado[key].monto += (e.monto||0);
    porEstado[key].n += 1;
  });
  const idsEstado = { 'Adelantado':'adelantado', 'Vigente':'vigente', 'Mora 1-30':'mora1', 'Mora 31-60':'mora2', 'Mora 61-90':'mora3', 'Mora 91-180':'mora4', 'Mora +180':'mora5' };
  ESTADOS_KPI.forEach(k => {
    const id = idsEstado[k];
    setText('exp-kpi-'+id+'-val', 'Bs '+porEstado[k].monto.toLocaleString('es-BO',{maximumFractionDigits:0}));
    setText('exp-kpi-'+id+'-n', porEstado[k].n+' cobro(s)');
  });
  const totalFiltrado = datos.reduce((s,e)=>s+(e.monto||0),0);
  setText('exp-kpi-periodo-label', (filAnio||filMes||filSem) ? [filMes,filAnio,filSem].filter(Boolean).join(' · ') : 'Todo el histórico');
  setText('exp-kpi-total-filtrado', 'Bs '+totalFiltrado.toLocaleString('es-BO',{maximumFractionDigits:0}));

  // Meta y % de cumplimiento del período filtrado (solo tiene sentido si se eligió un Mes + Año puntual)
  const metaBox = document.getElementById('exp-kpi-meta-box');
  if (metaBox) {
    if (filAnio && filMes) {
      metaBox.style.display = 'block';
      window._fbGetMetaOnce(filAnio, filMes, 'expensas').then(metaF => {
        const pctF = metaF ? Math.round(totalFiltrado/metaF*100) : 0;
        setText('exp-kpi-meta-filtrada', metaF ? 'Bs '+metaF.toLocaleString('es-BO',{maximumFractionDigits:0}) : 'Sin meta cargada');
        setText('exp-kpi-pct-filtrado', metaF ? pctF+'%' : '—');
        const pctEl = document.getElementById('exp-kpi-pct-filtrado');
        if (pctEl) pctEl.style.color = pctF>=100 ? 'var(--ok)' : pctF>=75 ? 'var(--warn)' : 'var(--danger)';
      });
    } else {
      metaBox.style.display = 'none';
    }
  }

  // ── Tabla: cantidad de CLIENTES (lotes distintos) por estado, según el mismo filtro de arriba ──
  const clientesTbody = document.getElementById('exp-clientes-estado-tbody');
  if (clientesTbody) {
    const porEstadoClientes = {};
    ESTADOS_KPI.forEach(k => porEstadoClientes[k] = { lotes:new Set(), monto:0 });
    datos.forEach(e => {
      const key = porEstadoClientes[e.estado] ? e.estado : null;
      if (!key) return;
      porEstadoClientes[key].lotes.add(e.terreno || e.cliente);
      porEstadoClientes[key].monto += (e.monto||0);
    });
    const filasClientes = ESTADOS_KPI.map(k => ({ estado:k, n:porEstadoClientes[k].lotes.size, monto:porEstadoClientes[k].monto }))
      .filter(f => f.n > 0);
    clientesTbody.innerHTML = filasClientes.length ? filasClientes.map(f => `<tr>
      <td>${_pintarEstadoExp(f.estado)}</td>
      <td style="font-weight:600;">${f.n} cliente(s)</td>
      <td style="font-weight:600;color:var(--cartera);">Bs ${f.monto.toLocaleString('es-BO',{maximumFractionDigits:0})}</td>
    </tr>`).join('') : '<tr><td colspan="3"><div class="empty-state">Sin datos para este período.</div></td></tr>';
  }

  window._fbListenMetas(anio, mes, metas => {
    const meta  = metas?.expensas?.monto || 0;
    const pct   = meta ? Math.round(total/meta*100) : 0;
    const falta = meta ? Math.max(0, meta-total) : 0;
    setText('exp-meta-val',   meta ? 'Bs '+Number(meta).toLocaleString('es-BO') : '—');
    setText('exp-pct-val',    pct+'%');
    setText('exp-falta-val',  meta ? 'Falta: Bs '+falta.toLocaleString('es-BO',{maximumFractionDigits:0}) : '—');
    setText('exp-barra-pct',  pct+'%');
    const bar = document.getElementById('exp-barra');
    if (bar) {
      bar.style.width = Math.min(pct,100)+'%';
      bar.style.background = pct>=100 ? 'linear-gradient(90deg,var(--ok),var(--ok-light))'
                           : pct>=75  ? 'linear-gradient(90deg,var(--warn),var(--warn-light))'
                           :            'linear-gradient(90deg,var(--info),var(--accent))';
    }
    if (typeof updateHomeMetas === 'function') updateHomeMetas('expensas', total, meta, pct);
  });

  // Lista cobros
  const lista = document.getElementById('exp-cobros-lista');
  if (lista) {
    lista.innerHTML = datos.length ? datos.map(e => `
      <div class="cobro-card">
        <div class="cobro-card-left">
          <div class="cobro-nombre">${e.cliente} ${e.estado?_pintarEstadoExp(e.estado):''}</div>
          <div class="cobro-meta">${e.terreno||'—'} · ${e.semana||''} ${e.mes||''} ${e.anio||''}</div>
          ${e.obs?`<div style="font-size:var(--fs-sm);color:var(--gris);font-style:italic;">${esc(e.obs)}</div>`:''}
        </div>
        <div class="cobro-monto">
          <div class="cobro-monto-val">Bs ${(e.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div class="cobro-monto-label">${e.fechaCarga||''}</div>
          <button class="btn-del" style="margin-top:6px;" onclick="window._fbRemoveExpAdmin('${e._key}')">🗑</button>
        </div>
      </div>`).join('')
    : '<div class="empty-state">Sin cobros de expensas.</div>';
  }

  renderTendenciaExpensas();
}

