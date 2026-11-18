/* ═══════════════════════════════════════════
   DASHBOARD DE VENTAS — tema oscuro, todas las capas de análisis
═══════════════════════════════════════════ */
let _chartsVCD = {};
function _destroyVCD(id) { if (_chartsVCD[id]) { _chartsVCD[id].destroy(); delete _chartsVCD[id]; } }
function _esVendida(v) { return !(v.estadoVenta||'').toLowerCase().includes('caíd') && !(v.estadoVenta||'').toLowerCase().includes('caid'); }

const VCD_DARK = { grid:'rgba(10,10,10,.10)', text:'#0A0A0A', textStrong:'#0A0A0A' };
const VCD_PALETTE = ['#FF3D8A','#2451FF','#7C3AED','#1E8E3E','#E8590C','#0A0A0A','#E0951A','#5C5C56'];

/* ── Sidebar acordeón ── */
function vcdAbrirSeccion(nombre) {
  document.querySelectorAll('.vcd-acc-head').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.vcd-acc-sub').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.vcd-section').forEach(s => s.classList.remove('active'));
  document.querySelector(`.vcd-acc-head[onclick="vcdAbrirSeccion('${nombre}')"]`)?.classList.add('active');
  document.querySelector(`.vcd-acc-sub[data-section="${nombre}"]`)?.classList.add('active');
  document.getElementById('vcd-sec-'+nombre)?.classList.add('active');
  // Los gráficos de Chart.js creados dentro de una sección oculta (display:none) quedan con
  // tamaño 0. Los volvemos a dibujar ya con la sección visible, para que midan bien.
  setTimeout(() => {
    const filtradas = (typeof ventasConcretadasData !== 'undefined') ? _ventasFiltradasActuales() : [];
    if (filtradas.length) renderVentasDashboard(filtradas);
  }, 50);
}

/* ── Selector de período (Día/Semana/Mes/Año), estilo Binance ── */
let vcdPeriodoActivo = 'mes';
function _ventasFiltradasActuales() {
  const aprobadas = ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado');
  const term = (document.getElementById('vc-buscar')?.value||'').trim().toLowerCase();
  let filtradas = aprobadas;
  if (vcFiltros.anio.length)       filtradas = filtradas.filter(v => vcFiltros.anio.includes(String(v.año||'')));
  if (vcFiltros.canal.length)      filtradas = filtradas.filter(v => vcFiltros.canal.includes(v.canal||v.gestion));
  if (vcFiltros.modalidad.length)  filtradas = filtradas.filter(v => vcFiltros.modalidad.includes(v.modalidad));
  if (vcFiltros.categoria.length)  filtradas = filtradas.filter(v => vcFiltros.categoria.includes(v.categoria));
  if (vcFiltros.estado.length)     filtradas = filtradas.filter(v => vcFiltros.estado.includes(v.estadoVenta));
  if (term) filtradas = filtradas.filter(v => (v.cliente||'').toLowerCase().includes(term) || (v.terreno||'').toLowerCase().includes(term));
  return filtradas;
}

function vcdCambiarPeriodo(periodo) {
  vcdPeriodoActivo = periodo;
  document.querySelectorAll('.vcd-period-btn').forEach(b => b.classList.toggle('active', b.dataset.periodo===periodo));
  renderVentasDashboard(_ventasFiltradasActuales());
}

function _fechaDeVenta(v) {
  if (v.fechaReserva) { const d = new Date(v.fechaReserva+'T00:00:00'); if (!isNaN(d)) return d; }
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mIdx = meses.indexOf(v.mes);
  if (v.año && mIdx>=0) return new Date(v.año, mIdx, 15);
  return null;
}
function _isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay()||7));
  const anioInicio = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const semana = Math.ceil((((dt-anioInicio)/86400000)+1)/7);
  return dt.getUTCFullYear()+'-W'+String(semana).padStart(2,'0');
}
function _agruparPorPeriodo(vendidas, periodo) {
  const buckets = {};
  vendidas.forEach(v => {
    const f = _fechaDeVenta(v);
    if (!f) return;
    let clave, label, orden;
    if (periodo === 'dia') {
      clave = f.toISOString().split('T')[0];
      label = f.getDate()+'/'+(f.getMonth()+1);
      orden = f.getTime();
    } else if (periodo === 'semana') {
      clave = _isoWeek(f);
      label = clave;
      orden = f.getTime();
    } else if (periodo === 'anio') {
      clave = String(f.getFullYear());
      label = clave;
      orden = f.getFullYear();
    } else { // mes
      clave = f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0');
      label = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][f.getMonth()]+' '+String(f.getFullYear()).slice(2);
      orden = f.getFullYear()*100+f.getMonth();
    }
    (buckets[clave] ||= { label, orden, n:0, ingresos:0 });
    buckets[clave].n++;
    buckets[clave].ingresos += (v.precioVenta||0);
  });
  let arr = Object.values(buckets).sort((a,b)=>a.orden-b.orden);
  const limites = { dia:30, semana:16, mes:24, anio:10 };
  arr = arr.slice(-limites[periodo]);
  return arr;
}

function renderVentasDashboard(aprobadas) {
  const vendidas = aprobadas.filter(_esVendida);
  const caidas = aprobadas.filter(v => !_esVendida(v));

  // ── KPIs ──
  setText('vcd-k-total', aprobadas.length);
  setText('vcd-k-total-sub', vendidas.length+' vendidas · '+caidas.length+' caídas');
  const ingresos = vendidas.reduce((s,v)=>s+(v.precioVenta||0),0);
  setText('vcd-k-ingresos', ingresos ? '$'+Math.round(ingresos).toLocaleString('es-BO') : '—');
  setText('vcd-k-ingresos-sub', vendidas.length+' ventas concretadas');
  const descPcts = vendidas.filter(v=>v.descuentoPct).map(v=>v.descuentoPct);
  setText('vcd-k-desc', descPcts.length ? (descPcts.reduce((s,v)=>s+v,0)/descPcts.length).toFixed(1)+'%' : '—');
  const excedTotal = vendidas.reduce((s,v)=>s+(v.excedente||0),0);
  setText('vcd-k-exced', (excedTotal? (excedTotal>=0?'$':'-$')+Math.abs(Math.round(excedTotal)).toLocaleString('es-BO') : '—'));
  setText('vcd-k-exced-sub', excedTotal>=0 ? 'por encima de política' : 'por debajo de política');
  const totalIntentos = vendidas.length + caidas.length;
  setText('vcd-k-conv', totalIntentos ? Math.round(vendidas.length/totalIntentos*100)+'%' : '—');
  const m2Vals = vendidas.filter(v=>v.m2Usd).map(v=>v.m2Usd);
  setText('vcd-k-m2', m2Vals.length ? '$'+Math.round(m2Vals.reduce((s,v)=>s+v,0)/m2Vals.length) : '—');
  const catA = vendidas.filter(v=>v.categoria==='A').length;
  setText('vcd-k-catA', catA);
  setText('vcd-k-catA-sub', vendidas.length ? Math.round(catA/vendidas.length*100)+'% del total' : '—');
  setText('vcd-k-caidas', caidas.length);
  setText('vcd-k-caidas-sub', totalIntentos ? Math.round(caidas.length/totalIntentos*100)+'% de los intentos' : '—');

  if (!aprobadas.length) return; // sin datos, no dibujamos gráficos vacíos

  const darkOpts = (extra) => Object.assign({
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:VCD_DARK.text, font:{size:10.5}, usePointStyle:true } } },
    scales:{
      x:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text, font:{size:10}} },
      y:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text, font:{size:10}} },
    }
  }, extra||{});

  // ── Tendencias mensuales ──
  const buckets = {};
  vendidas.forEach(v => {
    const k = (v.año||0)+'-'+(v.mes||'');
    (buckets[k] ||= { label:(v.mes||'').slice(0,3)+' '+String(v.año||'').slice(2), orden:(v.año||0)*100+(['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].indexOf(v.mes)+1), n:0, ingresos:0, exced:0, descs:[] });
    const b = buckets[k];
    b.n++; b.ingresos += (v.precioVenta||0); b.exced += (v.excedente||0);
    if (v.descuentoPct) b.descs.push(v.descuentoPct);
  });
  const bOrd = Object.values(buckets).sort((a,b)=>a.orden-b.orden);
  _destroyVCD('vcd-chart-tendencia');
  const c1 = document.getElementById('vcd-chart-tendencia');
  if (c1 && bOrd.length) {
    _chartsVCD['vcd-chart-tendencia'] = new Chart(c1, {
      type:'line',
      data:{ labels:bOrd.map(b=>b.label), datasets:[
        { label:'Ventas', data:bOrd.map(b=>b.n), borderColor:VCD_PALETTE[0], backgroundColor:'transparent', yAxisID:'y', tension:.3 },
        { label:'Ingresos ($)', data:bOrd.map(b=>Math.round(b.ingresos)), borderColor:VCD_PALETTE[1], backgroundColor:'transparent', yAxisID:'y1', tension:.3 },
        { label:'Excedente ($)', data:bOrd.map(b=>Math.round(b.exced)), borderColor:VCD_PALETTE[2], backgroundColor:'transparent', yAxisID:'y1', tension:.3 },
        { label:'% Descuento', data:bOrd.map(b=>b.descs.length?Math.round(b.descs.reduce((s,v)=>s+v,0)/b.descs.length*10)/10:null), borderColor:VCD_PALETTE[3], backgroundColor:'transparent', yAxisID:'y2', tension:.3, hidden:true },
      ]},
      options: darkOpts({
        interaction:{intersect:false,mode:'index'},
        scales:{
          x:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text, font:{size:10}} },
          y:{ position:'left', grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text, font:{size:10}}, title:{display:true,text:'Ventas',color:VCD_DARK.text} },
          y1:{ position:'right', grid:{display:false}, ticks:{color:VCD_DARK.text, font:{size:10}, callback:v=>'$'+(v/1000)+'k'} },
          y2:{ display:false },
        }
      })
    });
  }

  // ── Análisis por período (Día/Semana/Mes/Año, seleccionable) ──
  const datosPeriodo = _agruparPorPeriodo(vendidas, vcdPeriodoActivo);
  _destroyVCD('vcd-chart-periodo');
  const cP = document.getElementById('vcd-chart-periodo');
  if (cP && datosPeriodo.length) {
    _chartsVCD['vcd-chart-periodo'] = new Chart(cP, { type:'bar',
      data:{ labels:datosPeriodo.map(b=>b.label), datasets:[
        { label:'Ventas', data:datosPeriodo.map(b=>b.n), backgroundColor:VCD_PALETTE[0], borderRadius:5, yAxisID:'y', maxBarThickness:34 },
        { label:'Ingresos ($)', data:datosPeriodo.map(b=>Math.round(b.ingresos)), type:'line', borderColor:VCD_PALETTE[1], backgroundColor:'transparent', yAxisID:'y1', tension:.3 },
      ]},
      options: darkOpts({ interaction:{intersect:false,mode:'index'}, scales:{
        x:{ grid:{display:false}, ticks:{color:VCD_DARK.text,font:{size:9.5}, maxRotation:0} },
        y:{ position:'left', grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text,font:{size:10}} },
        y1:{ position:'right', grid:{display:false}, ticks:{color:VCD_DARK.text,font:{size:10},callback:v=>'$'+(v/1000)+'k'} },
      }})
    });
  } else if (cP) {
    const ctx = cP.getContext('2d'); ctx.clearRect(0,0,cP.width,cP.height);
  }

  // ── Trimestre ──
  const porTrim = {};
  vendidas.forEach(v => { const k=v.trimestre||'—'; (porTrim[k]||={n:0,ingresos:0}); porTrim[k].n++; porTrim[k].ingresos+=(v.precioVenta||0); });
  const trimOrd = Object.entries(porTrim).sort((a,b)=>a[0].localeCompare(b[0]));
  _destroyVCD('vcd-chart-trimestre');
  const c2 = document.getElementById('vcd-chart-trimestre');
  if (c2 && trimOrd.length) {
    _chartsVCD['vcd-chart-trimestre'] = new Chart(c2, {
      type:'bar',
      data:{ labels:trimOrd.map(([k])=>k), datasets:[
        { label:'Ventas', data:trimOrd.map(([,d])=>d.n), backgroundColor:VCD_PALETTE[0], borderRadius:5, yAxisID:'y' },
        { label:'Ingresos ($)', data:trimOrd.map(([,d])=>Math.round(d.ingresos)), backgroundColor:VCD_PALETTE[1], borderRadius:5, yAxisID:'y1' },
      ]},
      options: darkOpts({ scales:{
        x:{ grid:{display:false}, ticks:{color:VCD_DARK.text,font:{size:10}} },
        y:{ position:'left', grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text,font:{size:10}} },
        y1:{ position:'right', grid:{display:false}, ticks:{color:VCD_DARK.text,font:{size:10},callback:v=>'$'+(v/1000)+'k'} },
      }})
    });
  }

  // ── Ranking asesores: ventas y excedente ──
  const porAsesor = {};
  vendidas.forEach(v => { const k=v.asesorNombre||'—'; (porAsesor[k]||={n:0,exced:0,caidas:0}); porAsesor[k].n++; porAsesor[k].exced+=(v.excedente||0); });
  caidas.forEach(v => { const k=v.asesorNombre||'—'; (porAsesor[k]||={n:0,exced:0,caidas:0}); porAsesor[k].caidas++; });
  const asesorPorVentas = Object.entries(porAsesor).sort((a,b)=>b[1].n-a[1].n).slice(0,10);
  const asesorPorExced  = Object.entries(porAsesor).sort((a,b)=>b[1].exced-a[1].exced).slice(0,10);

  _destroyVCD('vcd-chart-asesor-ventas');
  const c3 = document.getElementById('vcd-chart-asesor-ventas');
  if (c3 && asesorPorVentas.length) {
    _chartsVCD['vcd-chart-asesor-ventas'] = new Chart(c3, {
      type:'bar',
      data:{ labels:asesorPorVentas.map(([k])=>k), datasets:[{ data:asesorPorVentas.map(([,d])=>d.n), backgroundColor:VCD_PALETTE[0], borderRadius:5, maxBarThickness:22 }] },
      options: darkOpts({ indexAxis:'y', plugins:{ legend:{display:false}, datalabels:{anchor:'center',align:'center',color:'#fff',font:{weight:'700',size:11}} } })
    });
  }
  _destroyVCD('vcd-chart-asesor-exced');
  const c4 = document.getElementById('vcd-chart-asesor-exced');
  if (c4 && asesorPorExced.length) {
    _chartsVCD['vcd-chart-asesor-exced'] = new Chart(c4, {
      type:'bar',
      data:{ labels:asesorPorExced.map(([k])=>k), datasets:[{ data:asesorPorExced.map(([,d])=>Math.round(d.exced)), backgroundColor:asesorPorExced.map(([,d])=>d.exced>=0?'#1E8E3E':'#E63946'), borderRadius:5, maxBarThickness:22 }] },
      options: darkOpts({ indexAxis:'y', plugins:{ legend:{display:false}, datalabels:{anchor:'end',align:'end',color:VCD_DARK.textStrong,font:{weight:'700',size:10},formatter:v=>'$'+v.toLocaleString('es-BO')} } })
    });
  }

  const top10El = document.getElementById('vcd-top10-exced');
  if (top10El) {
    top10El.innerHTML = asesorPorExced.length ? asesorPorExced.map(([k,d]) => `
      <div class="vcd-row">
        <div><div class="vcd-row-name">${esc(k)}</div><div class="vcd-row-sub">${d.n} ventas</div></div>
        <div class="vcd-row-val">${d.exced>=0?'+':''}$${Math.round(d.exced).toLocaleString('es-BO')}</div>
      </div>`).join('') : '<div style="color:#697a65;font-size:12px;padding:8px;">Sin datos.</div>';
  }

  // ── Donuts: Estado, Canal, Categoría, Modalidad ──
  const donutOpts = { cutout:'62%', responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{position:'bottom', labels:{color:VCD_DARK.text, font:{size:9.5}, boxWidth:8, padding:8}},
      datalabels:{color:'#fff', font:{weight:'700',size:10}, formatter:v=>v>0?v:''} } };
  function pintarDonut(id, counts) {
    _destroyVCD(id);
    const el = document.getElementById(id); if (!el) return;
    const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if (!entries.length) return;
    _chartsVCD[id] = new Chart(el, { type:'doughnut',
      data:{ labels:entries.map(([k])=>k), datasets:[{ data:entries.map(([,n])=>n), backgroundColor:VCD_PALETTE, borderWidth:2, borderColor:'#FFFDF7' }] },
      options: donutOpts });
  }
  const cEstado = {}; aprobadas.forEach(v => { const k=_esVendida(v)?'Vendido':'Caída'; cEstado[k]=(cEstado[k]||0)+1; });
  pintarDonut('vcd-donut-estado', cEstado);
  const cCanal = {}; vendidas.forEach(v => { const k=v.canal||v.gestion||'—'; cCanal[k]=(cCanal[k]||0)+1; });
  pintarDonut('vcd-donut-canal', cCanal);
  const cCateg = {}; vendidas.forEach(v => { const k=v.categoria||'—'; cCateg[k]=(cCateg[k]||0)+1; });
  pintarDonut('vcd-donut-categoria', cCateg);
  const cModal = {}; vendidas.forEach(v => { const k=v.modalidad||'—'; cModal[k]=(cModal[k]||0)+1; });
  pintarDonut('vcd-donut-modalidad', cModal);

  // ── Módulo y $m² por categoría ──
  const porModulo = {}; vendidas.forEach(v => { const k=v.modulo||'—'; porModulo[k]=(porModulo[k]||0)+1; });
  _destroyVCD('vcd-chart-modulo');
  const c5 = document.getElementById('vcd-chart-modulo');
  const moduloEntries = Object.entries(porModulo).sort((a,b)=>b[1]-a[1]);
  if (c5 && moduloEntries.length) {
    _chartsVCD['vcd-chart-modulo'] = new Chart(c5, { type:'bar',
      data:{ labels:moduloEntries.map(([k])=>k), datasets:[{ data:moduloEntries.map(([,n])=>n), backgroundColor:VCD_PALETTE[1], borderRadius:5, maxBarThickness:26 }] },
      options: darkOpts({ plugins:{legend:{display:false}, datalabels:{anchor:'end',align:'top',color:VCD_DARK.textStrong,font:{weight:'700',size:10}}} }) });
  }

  const m2PorCateg = {}; vendidas.filter(v=>v.m2Usd).forEach(v => { const k=v.categoria||'—'; (m2PorCateg[k]||=[]).push(v.m2Usd); });
  _destroyVCD('vcd-chart-m2-categoria');
  const c6 = document.getElementById('vcd-chart-m2-categoria');
  const m2Entries = Object.entries(m2PorCateg).sort((a,b)=>a[0].localeCompare(b[0]));
  if (c6 && m2Entries.length) {
    _chartsVCD['vcd-chart-m2-categoria'] = new Chart(c6, { type:'bar',
      data:{ labels:m2Entries.map(([k])=>'Categoría '+k), datasets:[{ data:m2Entries.map(([,arr])=>Math.round(arr.reduce((s,v)=>s+v,0)/arr.length)), backgroundColor:VCD_PALETTE[2], borderRadius:5, maxBarThickness:36 }] },
      options: darkOpts({ plugins:{legend:{display:false}, datalabels:{anchor:'end',align:'top',color:VCD_DARK.textStrong,font:{weight:'700',size:10},formatter:v=>'$'+v}} }) });
  }

  // ── Tasa de conversión por asesor ──
  const convAsesor = Object.entries(porAsesor).map(([k,d]) => [k, d.n+d.caidas ? Math.round(d.n/(d.n+d.caidas)*100) : 0, d.n+d.caidas]).filter(([,,t])=>t>=1).sort((a,b)=>b[1]-a[1]).slice(0,10);
  _destroyVCD('vcd-chart-conversion-asesor');
  const c7 = document.getElementById('vcd-chart-conversion-asesor');
  if (c7 && convAsesor.length) {
    _chartsVCD['vcd-chart-conversion-asesor'] = new Chart(c7, { type:'bar',
      data:{ labels:convAsesor.map(([k])=>k), datasets:[{ data:convAsesor.map(([,p])=>p), backgroundColor:convAsesor.map(([,p])=>p>=70?'#1E8E3E':p>=40?'#E0951A':'#E63946'), borderRadius:5, maxBarThickness:22 }] },
      options: darkOpts({ indexAxis:'y', plugins:{legend:{display:false}, datalabels:{anchor:'end',align:'end',color:VCD_DARK.textStrong,font:{weight:'700',size:10},formatter:v=>v+'%'}}, scales:{ x:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text,font:{size:10},callback:v=>v+'%'}, max:100 }, y:{ grid:{display:false}, ticks:{color:VCD_DARK.text,font:{size:10}} } } })
    });
  }

  // ── Scatter: precio de venta vs $/m² ──
  _destroyVCD('vcd-chart-scatter');
  const c8 = document.getElementById('vcd-chart-scatter');
  const puntos = vendidas.filter(v=>v.precioVenta && v.m2Usd).map(v=>({x:v.precioVenta, y:v.m2Usd}));
  if (c8 && puntos.length) {
    _chartsVCD['vcd-chart-scatter'] = new Chart(c8, { type:'scatter',
      data:{ datasets:[{ label:'Ventas', data:puntos, backgroundColor:'rgba(255,61,138,.7)', pointRadius:4, pointHoverRadius:6 }] },
      options: darkOpts({ plugins:{legend:{display:false}}, scales:{
        x:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text,font:{size:10},callback:v=>'$'+(v/1000)+'k'}, title:{display:true,text:'Precio de venta',color:VCD_DARK.text} },
        y:{ grid:{color:VCD_DARK.grid}, ticks:{color:VCD_DARK.text,font:{size:10},callback:v=>'$'+v}, title:{display:true,text:'$/m²',color:VCD_DARK.text} },
      }})
    });
  }
}

async function aprobarVentaConcretada(key) {
  const ok = await confirmDialog('La venta pasa a "Ventas Concretadas" en firme.', { title:'✓ Aprobar venta', okText:'Aprobar' });
  if (!ok) return;
  await window._fbUpdateVentaConcretada(key, { estadoAutorizacion:'aprobado', aprobadoTs: Date.now() });
  toastOk('Venta aprobada y concretada.');
}
async function rechazarVentaConcretada(key) {
  const motivo = prompt('¿Por qué se rechaza? (se le va a avisar al asesor)') || '';
  await window._fbUpdateVentaConcretada(key, { estadoAutorizacion:'rechazado', motivoRechazo: motivo, rechazadoTs: Date.now() });
  toastOk('Contrato rechazado.');
}

// Importar histórico desde el Excel tipo "Base de Ventas" (Power BI)
async function procesarExcelVentasConcretadas(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    if (rows.length < 2) { toastErr('El Excel no tiene filas de datos.'); return; }

    const ok = await confirmDialog(
      `Se van a cargar ${rows.length-1} ventas históricas como ya autorizadas (no pasan por revisión, son datos del pasado).`,
      { title:'📂 Cargar histórico', okText:'Cargar' }
    );
    if (!ok) return;

    let n = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[4]) continue; // sin cliente, salteamos
      const fechaRaw = r[23];
      const fecha = (fechaRaw instanceof Date) ? fechaRaw.toISOString().split('T')[0] : '';
      await window._fbPushVentaConcretada({
        registroKey: '',
        año: Number(r[0])||null, anio: Number(r[0])||null,
        mes: r[2]||'', trimestre: r[28]||'',
        cliente: String(r[4]||''), terreno: String(r[5]||''), modulo: String(r[6]||''),
        gestion: String(r[7]||''), asesorNombre: String(r[10]||''),
        estadoVenta: String(r[11]||''), estatus: String(r[12]||''), contrato: String(r[27]||''),
        modalidad: String(r[9]||''),
        precioLista: Number(r[13])||0,
        pctDsctoPolitica: Number(r[14])||0, dsctoPolitica: Number(r[15])||0,
        dsctoAdicional: Number(r[16])||0,
        descuentoUsd: Number(r[17])||0, descuentoPct: Math.round((Number(r[18])||0)*1000)/10,
        excedente: Number(r[19])||0,
        precioVenta: Number(r[20])||0,
        metraje: Number(r[21])||0, m2Usd: Number(r[22])||0,
        fechaReserva: fecha, accion: Number(r[24])||0,
        categoria: String(r[29]||''), ciudadOrigen: String(r[30]||''),
        canal: String(r[26]||''),
        esHistorico: true,
        estadoAutorizacion: 'aprobado',
        solicitadoPorKey: 'import', solicitadoPorNombre: 'Importado desde Excel',
      });
      n++;
    }
    toastOk(n + ' ventas históricas cargadas.');
    input.value = '';
  } catch(e) {
    toastErr('Error al leer el Excel: ' + e.message);
  }
}

function exportarVentasConcretadas() {
  const aprobadas = ventasConcretadasData.filter(v => v.estadoAutorizacion === 'aprobado');
  if (!aprobadas.length) { toastErr('No hay ventas concretadas para exportar.'); return; }
  const filas = aprobadas.map(v => ({
    'Año': v.año, 'Mes': v.mes, 'Trimestre': v.trimestre, 'Cliente': v.cliente, 'Terreno': v.terreno,
    'Módulo': v.modulo, 'Gestión/Canal': v.canal||v.gestion, 'Modalidad': v.modalidad, 'Asesor': v.asesorNombre,
    'Estado de Venta': v.estadoVenta, 'Estatus': v.estatus, 'Contrato': v.contrato,
    'Precio de Lista': v.precioLista, '% Descuento': v.descuentoPct, '$ Descuento': v.descuentoUsd,
    'Dscto Adicional': v.dsctoAdicional, 'Precio de Venta': v.precioVenta,
    'Metraje': v.metraje, 'm2$us': v.m2Usd, 'Acción': v.accion,
    'Categoría': v.categoria, 'Ciudad de Origen': v.ciudadOrigen, 'Fecha de Reserva': v.fechaReserva,
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas Concretadas');
  XLSX.writeFile(wb, 'ventas_concretadas_urubo_village.xlsx');
}

/* ═══════════════════════════════════════════
   SINCRONIZACIÓN DE VENTAS CON ORANGE (GetVentas)
   Cada fila es una venta real (no un cronograma) — se cargan directo como
   Ventas Concretadas ya aprobadas, sin pasar por la cola de autorización
   (esa cola es para lo que cargan los asesores a mano).
═══════════════════════════════════════════ */
function _parseFechaOrange(str) {
  if (!str) return null;
  const [d,m,y] = str.split('/');
  if (!d || !m || !y) return null;
  return new Date(parseInt(y), parseInt(m)-1, parseInt(d));
}

async function sincronizarVentasOrange(soloEsteAnio) {
  const btnAnio = document.getElementById('btn-sync-ventas-anio');
  const btnTodo = document.getElementById('btn-sync-ventas-todo');
  const status = document.getElementById('vc-sync-status');
  const setEstado = (txt, disabled) => {
    if (status) status.textContent = txt;
    if (btnAnio) btnAnio.disabled = disabled;
    if (btnTodo) btnTodo.disabled = disabled;
  };
  setEstado('🔄 Conectando con Orange...', true);

  try {
    const resp = await fetch(ORANGE_API_URL + '?op=GetVentas');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anioActualN = new Date().getFullYear();
    let ventas = json.data.filter(r => r.NroVenta && r.Cliente);
    if (soloEsteAnio) {
      ventas = ventas.filter(r => {
        const f = _parseFechaOrange(r.FechaFirma) || _parseFechaOrange(r.Fechacreacion);
        return f && f.getFullYear() === anioActualN;
      });
    }

    let n = 0;
    for (let i = 0; i < ventas.length; i++) {
      const r = ventas[i];
      setEstado(`🔄 Sincronizando ${i+1}/${ventas.length}...`, true);

      const fecha = _parseFechaOrange(r.FechaFirma) || _parseFechaOrange(r.Fechacreacion) || new Date();
      const mesNombre = meses[fecha.getMonth()];
      const anio = fecha.getFullYear();
      const trimestre = ['1er','1er','1er','2do','2do','2do','3er','3er','3er','4to','4to','4to'][fecha.getMonth()] + ' Trimestre';
      const categoria = ['A','B','C'].includes(r.CategoriaLote) ? r.CategoriaLote : '';
      const descuentoPct = Math.round((r.PorcDescuento||0)*10)/10;

      await window._fbSetVentaConcretadaOrange(r.NroVenta, {
        registroKey: '',
        año: anio, anio,
        mes: mesNombre, trimestre,
        cliente: r.Cliente, terreno: r.Terreno, modulo: r.Modulo || '',
        gestion: r.MedioDifusion || '', canal: r.MedioDifusion || '',
        asesorNombre: r.AsesorComercial || '',
        estadoVenta: r.EstadoContrato || '', estatus: r.Pertenece || '', contrato: r.EstadoContrato || '',
        modalidad: r.Modalidad || '',
        precioLista: r.PrecioLista||0, descuentoUsd: r.Descuento||0, descuentoPct,
        dsctoAdicional: 0,
        excedente: categoria ? calcularExcedentePolitica(r.Modalidad, categoria, descuentoPct, r.PrecioLista||0, mesNombre, anio) : 0,
        precioVenta: r.PrecioVenta||0,
        metraje: r.Metraje||0, m2Usd: r.M2||0,
        fechaReserva: fecha.toISOString().split('T')[0],
        accion: r.PrecioAccion||0, categoria, ciudadOrigen: '',
        esHistorico: true,
        estadoAutorizacion: 'aprobado', // vienen del sistema real de Orange, no de un asesor cargando a mano
        solicitadoPorKey: 'orange-sync', solicitadoPorNombre: 'Sincronizado desde Orange',
      });
      n++;
    }

    setEstado('', false);
    toastOk(`Ventas sincronizadas: ${n} registros desde Orange.`);
  } catch (e) {
    setEstado('', false);
    toastErr('No se pudo sincronizar: ' + e.message);
  }
}

