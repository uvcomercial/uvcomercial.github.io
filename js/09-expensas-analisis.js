/* ═══════════════════════════════════════════════════════════════
   DASHBOARD ANALÍTICO — COBRANZA EN VIVO (Expensas)
   Motor de cálculo + ApexCharts. Todo lo que dice el "Análisis" bajo
   cada gráfico sale de una cuenta real sobre los datos, no es texto
   armado — si el número cambia, el texto cambia con él.
═══════════════════════════════════════════════════════════════ */
let dbeCharts = {};

function _agruparPorSemanaISO_dbe(datos, nSemanas) {
  const hoy = new Date();
  const diaSemanaHoy = (hoy.getDay()+6)%7;
  const inicioSemanaActual = new Date(hoy); inicioSemanaActual.setDate(hoy.getDate()-diaSemanaHoy); inicioSemanaActual.setHours(0,0,0,0);
  const buckets = [];
  for (let i = nSemanas-1; i >= 0; i--) {
    const inicio = new Date(inicioSemanaActual); inicio.setDate(inicioSemanaActual.getDate()-i*7);
    const fin = new Date(inicio); fin.setDate(inicio.getDate()+7);
    buckets.push({ inicio, fin, label: inicio.getDate()+'/'+(inicio.getMonth()+1), total: 0 });
  }
  datos.forEach(r => {
    if (!r.fechaOrden) return;
    const b = buckets.find(x => r.fechaOrden >= x.inicio.getTime() && r.fechaOrden < x.fin.getTime());
    if (b) b.total += r.monto;
  });
  return buckets;
}

function _agruparPorMes_dbe(datos, nMeses) {
  const hoy = new Date();
  const buckets = [];
  for (let i = nMeses-1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
    buckets.push({ anio: d.getFullYear(), mes: d.getMonth(), label: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()]+' '+String(d.getFullYear()).slice(2), total: 0 });
  }
  datos.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const b = buckets.find(x => x.anio===f.getFullYear() && x.mes===f.getMonth());
    if (b) b.total += r.monto;
  });
  return buckets;
}

function _agruparPorDia_dbe(datos, nDias) {
  // O = primer cobro del día según el orden en que Orange los entrega (no tenemos hora exacta),
  // C = último, H = el cobro más grande del día, L = el más chico, V = cantidad de cobros.
  const porDia = {};
  datos.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const key = f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0');
    (porDia[key] ||= { fechaOrden: new Date(f.getFullYear(),f.getMonth(),f.getDate()).getTime(), montos: [] }).montos.push(r.monto);
  });
  const dias = Object.values(porDia).sort((a,b)=>a.fechaOrden-b.fechaOrden).slice(-nDias);
  return dias.map(d => ({
    x: d.fechaOrden,
    o: Math.round(d.montos[0]),
    h: Math.round(Math.max(...d.montos)),
    l: Math.round(Math.min(...d.montos)),
    c: Math.round(d.montos[d.montos.length-1]),
    v: d.montos.length,
  }));
}

function _desviacionEstandar(valores) {
  const n = valores.length;
  if (n < 2) return 0;
  const media = valores.reduce((s,v)=>s+v,0)/n;
  const varianza = valores.reduce((s,v)=>s+(v-media)**2,0)/n;
  return Math.sqrt(varianza);
}

async function renderDashboardExpensas() {
  const root = document.getElementById('dbe-resumen-ejecutivo');
  if (!root) return;
  if (!orangeExpensasDetalleRaw.length) return;

  const fmtBsK = n => {
    const v = Math.round(n||0);
    if (Math.abs(v) >= 1000000) return 'Bs'+Math.round(v/1000000)+'M';
    if (Math.abs(v) >= 1000) return 'Bs'+Math.round(v/1000)+'K';
    return 'Bs'+v;
  };

  // (el label de sincronización ya lo actualiza cargarDetalleExpensas al terminar de cargar)

  /* ── KPI 1 y 2: semana y mes, con % vs período anterior ── */
  const semanas10 = _agruparPorSemanaISO_dbe(orangeExpensasDetalleRaw, 10);
  const semanaActual = semanas10[semanas10.length-1].total;
  const semanaAnterior = semanas10[semanas10.length-2]?.total || 0;
  const deltaSemana = semanaAnterior ? ((semanaActual-semanaAnterior)/semanaAnterior*100) : null;

  const meses12 = _agruparPorMes_dbe(orangeExpensasDetalleRaw, 12);
  const mesActual = meses12[meses12.length-1].total;
  const mesAnterior = meses12[meses12.length-2]?.total || 0;
  const deltaMes = mesAnterior ? ((mesActual-mesAnterior)/mesAnterior*100) : null;

  setText('dbe-kpi-semana', fmtBsK(semanaActual));
  const elDeltaSem = document.getElementById('dbe-kpi-semana-delta');
  if (deltaSemana !== null) {
    elDeltaSem.textContent = (deltaSemana>=0?'▲ ':'▼ ')+Math.abs(deltaSemana).toFixed(1)+'% vs semana anterior';
    elDeltaSem.className = 'bi-kpi-delta ' + (deltaSemana>=0?'pos':'neg');
  } else { elDeltaSem.textContent = 'sin semana anterior'; elDeltaSem.className='bi-kpi-delta muted'; }

  setText('dbe-kpi-mes', fmtBsK(mesActual));
  const elDeltaMes = document.getElementById('dbe-kpi-mes-delta');
  if (deltaMes !== null) {
    elDeltaMes.textContent = (deltaMes>=0?'▲ ':'▼ ')+Math.abs(deltaMes).toFixed(1)+'% vs mes anterior';
    elDeltaMes.className = 'bi-kpi-delta ' + (deltaMes>=0?'pos':'neg');
  } else { elDeltaMes.textContent = 'sin mes anterior'; elDeltaMes.className='bi-kpi-delta muted'; }

  const nombresMesLargoKpi = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [metaVigenteKpi, metaMoraKpi] = await Promise.all([
    window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_vigente'),
    window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_mora'),
  ]);
  const metaMesKpi = (metaVigenteKpi||0) + (metaMoraKpi||0);
  const elMetaMes = document.getElementById('dbe-kpi-mes-meta');
  if (metaMesKpi) {
    const pctVsMeta = Math.round(mesActual/metaMesKpi*100);
    elMetaMes.textContent = `🎯 ${pctVsMeta}% de la meta (${fmtBsK(metaMesKpi)})`;
    elMetaMes.className = 'bi-kpi-delta ' + (pctVsMeta>=100?'pos':pctVsMeta>=70?'warn':'neg');
  } else {
    elMetaMes.textContent = 'sin meta cargada';
    elMetaMes.className = 'bi-kpi-delta muted';
  }

  /* ── KPI 3: gestión + proyección de cierre (regla de tres simple sobre lo transcurrido) ── */
  const gestionActualN = _gestionActual();
  let cobradoGestion = 0;
  orangeExpensasDetalleRaw.forEach(r => { if (r.fechaOrden && _gestionDeFecha(new Date(r.fechaOrden)) === gestionActualN) cobradoGestion += r.monto; });
  const inicioGestion = new Date(gestionActualN, 3, 1); // 1° de abril
  const finGestion = new Date(gestionActualN+1, 2, 31); // 31 de marzo
  const hoy = new Date();
  const diasTranscurridos = Math.max(1, Math.round((hoy-inicioGestion)/86400000));
  const diasTotalesGestion = Math.round((finGestion-inicioGestion)/86400000);
  const proyeccionCierre = (cobradoGestion / diasTranscurridos) * diasTotalesGestion;

  setText('dbe-kpi-gestion', fmtBsK(cobradoGestion));
  setText('dbe-kpi-gestion-proy', 'proyección de cierre: ' + fmtBsK(proyeccionCierre));

  /* ── KPI 4: Índice de Volatilidad = Coeficiente de Variación de las últimas 10 semanas ── */
  const valoresSemanales = semanas10.map(s=>s.total);
  const mediaSemanal = valoresSemanales.reduce((s,v)=>s+v,0)/valoresSemanales.length;
  const desvio = _desviacionEstandar(valoresSemanales);
  const cv = mediaSemanal ? (desvio/mediaSemanal*100) : 0;

  setText('dbe-kpi-volatilidad', cv.toFixed(1)+'%');
  const elVol = document.getElementById('dbe-kpi-volatilidad-tag');
  if (cv > 30) { elVol.textContent = '🔴 Riesgo Alto — muy irregular'; elVol.className = 'bi-kpi-delta neg'; }
  else if (cv > 15) { elVol.textContent = '🟡 Riesgo Moderado'; elVol.className = 'bi-kpi-delta warn'; }
  else { elVol.textContent = '🟢 Cobranza estable'; elVol.className = 'bi-kpi-delta pos'; }

  /* ── Resumen Ejecutivo — combinando liquidez, tendencia, volatilidad y riesgo ── */
  const tendenciaTxt = deltaMes===null ? 'sin datos suficientes del mes anterior para medir tendencia'
    : deltaMes >= 5 ? `una tendencia positiva (+${deltaMes.toFixed(1)}% vs el mes anterior)`
    : deltaMes <= -5 ? `una caída de ${Math.abs(deltaMes).toFixed(1)}% respecto al mes anterior, que conviene revisar`
    : `un comportamiento estable respecto al mes anterior (${deltaMes>=0?'+':''}${deltaMes.toFixed(1)}%)`;
  const volatilidadTxt = cv > 30 ? `una volatilidad alta (CV ${cv.toFixed(1)}%) — la cobranza semanal varía mucho, lo que dificulta proyectar con precisión`
    : cv > 15 ? `una volatilidad moderada (CV ${cv.toFixed(1)}%)`
    : `una cobranza semanal consistente (CV ${cv.toFixed(1)}%)`;
  const proyeccionTxt = `Al ritmo actual, la proyección de cierre de gestión es de ${fmtBsK(proyeccionCierre)}.`;
  setText('dbe-resumen-ejecutivo',
    `La cartera de Expensas muestra ${tendenciaTxt} y ${volatilidadTxt}. Esta semana se cobraron ${fmtBsK(semanaActual)}` +
    (deltaSemana!==null ? ` (${deltaSemana>=0?'+':''}${deltaSemana.toFixed(1)}% vs la semana pasada)` : '') +
    `. ${proyeccionTxt}`
  );

  /* ── Gráfico 1: Tendencia Semanal (barras + media móvil 4 semanas) ── */
  const mediaMovil4 = semanas10.map((_,i,arr) => {
    const desde = Math.max(0, i-3);
    const ventana = arr.slice(desde, i+1).map(s=>s.total);
    return Math.round(ventana.reduce((s,v)=>s+v,0)/ventana.length);
  });
  if (dbeCharts.semanal) dbeCharts.semanal.destroy();
  dbeCharts.semanal = new ApexCharts(document.querySelector('#dbe-chart-semanal'), {
    chart: { type:'line', height:260, toolbar:{show:false}, background:'transparent', foreColor:'#667085' },
    series: [
      { name:'Cobro semanal', type:'column', data: semanas10.map(s=>Math.round(s.total)) },
      { name:'Media móvil (4 sem.)', type:'line', data: mediaMovil4 },
    ],
    xaxis: { categories: semanas10.map(s=>s.label), labels:{style:{fontSize:'10px'}} },
    yaxis: { labels: { formatter: v => fmtBsK(v) }, max: Math.max(...semanas10.map(s=>s.total), ...mediaMovil4) * 1.25 },
    colors: ['#2451FF', '#F79009'],
    stroke: { width:[0,3], curve:'smooth' },
    grid: { borderColor:'#EAECF0', strokeDashArray:3 },
    legend: { fontSize:'11px' },
    dataLabels: {
      enabled: true, enabledOnSeries: [0],
      formatter: v => fmtBsK(v),
      style: { fontSize:'10px', colors:['#344054'] },
      background: { enabled:true, foreColor:'#fff', borderRadius:3, opacity:.85, borderWidth:0 },
      offsetY: -4,
    },
    tooltip: { theme:'light', y:{formatter: v=>'Bs '+Math.round(v).toLocaleString('es-BO')} },
  });
  dbeCharts.semanal.render();

  const semanaMax = semanas10.reduce((m,s)=>s.total>m.total?s:m, semanas10[0]);
  setText('dbe-insight-semanal',
    `Diagnóstico: la semana de mayor cobranza en este período fue ${semanaMax.label} con ${fmtBsK(semanaMax.total)}. ` +
    `Causa probable: ${deltaSemana!==null && deltaSemana<-15 ? 'la caída reciente puede deberse a menos categorización/seguimiento esta semana, no necesariamente a menos pagos reales.' : 'el patrón sigue el ritmo habitual de cobro semanal.'} ` +
    `Prescripción: ${cv>30 ? 'con esta volatilidad, conviene enviar recordatorios de pago distribuidos en la semana, no concentrados en un solo día.' : 'mantener el ritmo actual de seguimiento.'}`
  );

  /* ── Gráfico 2: Tendencia Mensual (área + meta punteada) ── */
  const nombresMesLargo = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const metasPorMes = await Promise.all(meses12.map(m =>
    Promise.all([
      window._fbGetMetaOnce(m.anio, nombresMesLargo[m.mes], 'expensas_vigente'),
      window._fbGetMetaOnce(m.anio, nombresMesLargo[m.mes], 'expensas_mora'),
    ]).then(([v,mo])=>(v||0)+(mo||0))
  ));
  if (dbeCharts.mensual) dbeCharts.mensual.destroy();
  const mesConMeta = metasPorMes[metasPorMes.length-1];
  const pctMetaMes = mesConMeta ? (mesActual/mesConMeta*100) : null;
  const techoMensual = Math.max(...meses12.map(m=>m.total), ...metasPorMes) * 1.3;

  dbeCharts.mensual = new ApexCharts(document.querySelector('#dbe-chart-mensual'), {
    chart: { type:'area', height:260, toolbar:{show:false}, background:'transparent', foreColor:'#667085' },
    series: [
      { name:'Cobrado', type:'area', data: meses12.map(m=>Math.round(m.total)) },
      { name:'Meta', type:'line', data: metasPorMes.map(v=>Math.round(v)) },
    ],
    title: {
      text: pctMetaMes!==null ? `${pctMetaMes.toFixed(0)}% de la meta de este mes` : 'Sin meta cargada este mes',
      style: { fontSize:'13px', fontWeight:700, color: pctMetaMes===null?'#64748b':pctMetaMes>=100?'#10b981':pctMetaMes>=70?'#f59e0b':'#ef4444' },
    },
    xaxis: { categories: meses12.map(m=>m.label), labels:{style:{fontSize:'10px'}} },
    yaxis: { labels: { formatter: v => fmtBsK(v) }, max: techoMensual },
    colors: ['#2451FF', '#F04438'],
    stroke: { width:[2,2], curve:'smooth', dashArray:[0,6] },
    fill: { type:['gradient','solid'], gradient:{opacityFrom:.4, opacityTo:.05} },
    grid: { borderColor:'#EAECF0', strokeDashArray:3 },
    legend: { fontSize:'11px' },
    dataLabels: {
      enabled: true, enabledOnSeries: [0],
      formatter: v => fmtBsK(v),
      style: { fontSize:'10px', colors:['#1D3ECC'] },
      background: { enabled:true, foreColor:'#fff', borderRadius:3, opacity:.85, borderWidth:0 },
      offsetY: -6,
    },
    tooltip: { theme:'light', y:{formatter: v=>'Bs '+Math.round(v).toLocaleString('es-BO')} },
  });
  dbeCharts.mensual.render();

  setText('dbe-insight-mensual',
    pctMetaMes !== null
      ? `Diagnóstico: este mes se lleva cobrado el ${pctMetaMes.toFixed(0)}% de la meta (${fmtBsK(mesActual)} de ${fmtBsK(mesConMeta)}). ` +
        `Causa probable: ${pctMetaMes<70 ? 'todavía queda categorizar cobros pendientes, o la cobranza real está por debajo de lo esperado.' : 'el ritmo de cobro viene alineado con lo proyectado.'} ` +
        `Prescripción: ${pctMetaMes<70 ? 'revisar la cola de "Categorizar cobros" — puede haber plata ya cobrada que todavía no está contando para la meta.' : 'mantener el seguimiento actual.'}`
      : 'Diagnóstico: no hay meta cargada para este mes — no se puede medir el avance contra un objetivo. Prescripción: cargar la meta desde el Resumen Mensual para poder comparar.'
  );

  /* ── Gráfico 3: Distribución por Modalidad (donut, este mes) ── */
  const mesesNombre = nombresMesLargo;
  const mesFilNum = mesesNombre.indexOf(expFilMes);
  const porModalidad = {};
  orangeExpensasDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (f.getFullYear()!==expFilAnio || f.getMonth()!==mesFilNum) return;
    porModalidad[r.modalidad] = (porModalidad[r.modalidad]||0) + r.monto;
  });
  const modalidadesOrdenadas = Object.entries(porModalidad).sort((a,b)=>b[1]-a[1]);
  if (dbeCharts.modalidad) dbeCharts.modalidad.destroy();
  dbeCharts.modalidad = new ApexCharts(document.querySelector('#dbe-chart-modalidad'), {
    chart: { type:'donut', height:260, background:'transparent', foreColor:'#667085' },
    series: modalidadesOrdenadas.map(([,v])=>Math.round(v)),
    labels: modalidadesOrdenadas.map(([k])=>k),
    colors: ['#2451FF','#F79009','#12B76A','#7C3AED'],
    legend: {
      fontSize:'11px', position:'bottom',
      formatter: (nombre, opts) => nombre + ' — ' + fmtBsK(opts.w.globals.series[opts.seriesIndex]),
    },
    dataLabels: {
      enabled:true,
      formatter: (val, opts) => fmtBsK(opts.w.globals.series[opts.seriesIndex]) + ' (' + val.toFixed(0) + '%)',
      style: { fontSize:'11px', fontWeight:700 },
    },
    tooltip: { theme:'light', y:{formatter: v=>'Bs '+Math.round(v).toLocaleString('es-BO')} },
  });
  dbeCharts.modalidad.render();

  if (modalidadesOrdenadas.length) {
    const totalModalidad = modalidadesOrdenadas.reduce((s,[,v])=>s+v,0);
    const [nombreTop, montoTop] = modalidadesOrdenadas[0];
    const pctTop = (montoTop/totalModalidad*100);
    setText('dbe-insight-modalidad',
      `Diagnóstico: "${nombreTop}" concentra el ${pctTop.toFixed(0)}% de la cobranza de este mes (${fmtBsK(montoTop)}). ` +
      `Causa probable: ${pctTop>70 ? 'es la modalidad predominante entre los clientes de expensas — la cartera está concentrada en una sola forma de pago.' : 'la cobranza está repartida entre varias modalidades, sin una que domine claramente.'} ` +
      `Prescripción: ${pctTop>70 ? 'si esa modalidad depende de un proceso manual (ej: transferencia), vale la pena automatizar recordatorios específicos para ella.' : 'mantener el seguimiento diferenciado por modalidad.'}`
    );
  } else {
    setText('dbe-insight-modalidad', 'Sin cobros categorizados por modalidad este mes todavía.');
  }

  /* ── Gráfico 4: Candlestick + Volumen UNIFICADOS en un solo panel (doble eje) —
     las velas (Cobro Diario) y el volumen (N° de cobros) comparten el mismo gráfico,
     estilo bolsa de valores real, no dos paneles apilados. ── */
  const velas20 = _agruparPorDia_dbe(orangeExpensasDetalleRaw, 20);
  const techoVelas = Math.max(...velas20.map(d=>d.h)) * 1.15;
  const techoVolumen = Math.max(...velas20.map(d=>d.v)) * 3.2; // el volumen queda "bajo" (chico), como en el ejemplo

  if (dbeCharts.velas) dbeCharts.velas.destroy();
  dbeCharts.velas = new ApexCharts(document.querySelector('#dbe-chart-velas'), {
    chart: { height:340, toolbar:{show:false}, background:'transparent', foreColor:'#667085', parentHeightOffset:0 },
    series: [
      { name:'Cobro Diario', type:'candlestick', data: velas20.map(d=>({ x:d.x, y:[d.o,d.h,d.l,d.c] })) },
      { name:'Volumen (Transacciones)', type:'column', data: velas20.map(d=>({x:d.x, y:d.v})) },
    ],
    xaxis: { type:'datetime', labels:{style:{fontSize:'10px'}} },
    yaxis: [
      { seriesName:'Cobro Diario', min:0, max:techoVelas, labels:{ formatter: v => fmtBsK(Math.round(v)) }, title:{text:'Monto (Bs)', style:{fontSize:'10px'}} },
      { seriesName:'Volumen (Transacciones)', opposite:true, min:0, max:techoVolumen, labels:{ formatter: v => Math.round(v) }, title:{text:'N° cobros', style:{fontSize:'10px'}} },
    ],
    plotOptions: {
      candlestick: { colors: { upward:'#12B76A', downward:'#F04438' }, wick:{useFillColor:true} },
      bar: { columnWidth:'55%' },
    },
    fill: { opacity:[1,.35] },
    colors: ['#12B76A', '#7C3AED'],
    grid: { borderColor:'#EAECF0', strokeDashArray:3 },
    legend: { fontSize:'11px', labels:{colors:'#475467'} },
    tooltip: { theme:'light', shared:true, x:{format:'dd MMM'} },
  });
  dbeCharts.velas.render();

  if (velas20.length) {
    const diaMayorVolumen = velas20.reduce((m,d)=>d.v>m.v?d:m, velas20[0]);
    const fechaMayorVol = new Date(diaMayorVolumen.x);
    // Chequeo real de concentración en los primeros días del mes (típico de expensas)
    const enPrimeraQuincena = velas20.filter(d => new Date(d.x).getDate() <= 15);
    const pctPrimeraQuincena = velas20.length ? (enPrimeraQuincena.reduce((s,d)=>s+d.v,0) / velas20.reduce((s,d)=>s+d.v,0) * 100) : 0;
    setText('dbe-insight-velas',
      `Diagnóstico: el día con más transacciones fue el ${fechaMayorVol.getDate()}/${fechaMayorVol.getMonth()+1}, con ${diaMayorVolumen.v} cobros. ` +
      `Causa probable: ${pctPrimeraQuincena>65 ? `el ${pctPrimeraQuincena.toFixed(0)}% de las transacciones de este período cayeron en la primera quincena — patrón típico de pago de expensas a principio de mes.` : 'las transacciones están repartidas a lo largo del mes, sin concentrarse en la primera quincena.'} ` +
      `Prescripción: ${pctPrimeraQuincena>65 ? 'reforzar los recordatorios automáticos entre el día 1 y el 5, que es cuando más responden los clientes.' : 'mantener recordatorios distribuidos durante todo el mes.'}`
    );
  }

  // Guardamos lo ya calculado para que el Modal 3D (Vista ampliada + Estadísticas)
  // lo reuse tal cual, sin tener que recalcular nada de nuevo.
  window._hudData = { semanas10, meses12, modalidadesOrdenadas, velas20, fmtBsK };
}

/* ═══════════════════════════════════════════
   PARTÍCULAS FLOTANTES (fondo del dashboard)
═══════════════════════════════════════════ */
function _generarParticulasHud() {
  const cont = document.getElementById('dbe-particles');
  if (!cont || cont.dataset.armado) return;
  cont.dataset.armado = '1';
  const colores = ['#4A8EFF', '#22D3EE', '#A855F7', '#EC4899'];
  let html = '';
  for (let i = 0; i < 30; i++) {
    const left = Math.random()*100;
    const dur = 15 + Math.random()*20;
    const delay = Math.random()*20;
    const color = colores[Math.floor(Math.random()*colores.length)];
    html += `<div class="hud-particle" style="left:${left}%;color:${color};animation-duration:${dur}s;animation-delay:${delay}s;"></div>`;
  }
  cont.innerHTML = html;
}

/* ═══════════════════════════════════════════
   MOTOR ESTADÍSTICO — real, sobre los datos que ya tenemos.
═══════════════════════════════════════════ */
const HudStats = {
  mean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; },
  median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a,b)=>a-b);
    const mid = Math.floor(s.length/2);
    return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
  },
  stddev(arr) {
    const n = arr.length; if (n < 2) return 0;
    const m = this.mean(arr);
    return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/n);
  },
  min(arr) { return arr.length ? Math.min(...arr) : 0; },
  max(arr) { return arr.length ? Math.max(...arr) : 0; },
  cv(arr) { const m = this.mean(arr); return m ? (this.stddev(arr)/m*100) : 0; },
  quantile(arr, q) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a,b)=>a-b);
    const pos = (s.length-1)*q;
    const base = Math.floor(pos), rest = pos-base;
    return s[base+1]!==undefined ? s[base] + rest*(s[base+1]-s[base]) : s[base];
  },
  q1(arr) { return this.quantile(arr, .25); },
  q3(arr) { return this.quantile(arr, .75); },
  iqr(arr) { return this.q3(arr) - this.q1(arr); },
};

/* ═══════════════════════════════════════════
   MODAL 3D — Vista ampliada + Estadísticas, para cada uno de los 4 gráficos.
═══════════════════════════════════════════ */
let hudModalChartActual = null;
let hudChartVistaAmpliada = null;

const HUD_CHART_META = {
  semanal:   { titulo: 'Tendencia Semanal', sub: 'Cobro semanal + media móvil de 4 semanas', serieLabel: 'Cobro semanal' },
  mensual:   { titulo: 'Tendencia Mensual', sub: 'Cobrado vs. Meta, últimos 12 meses', serieLabel: 'Cobrado' },
  modalidad: { titulo: 'Distribución por Modalidad', sub: 'Cobranza de este mes, por modalidad', serieLabel: 'Modalidad' },
  velas:     { titulo: 'Análisis Micro-Estructural', sub: 'Velas diarias + volumen, estilo bolsa de valores', serieLabel: 'Cobro Diario' },
};

function abrirHudModal(chartId) {
  if (!window._hudData) return;
  hudModalChartActual = chartId;
  const meta = HUD_CHART_META[chartId];
  document.getElementById('hud-modal-title').textContent = meta.titulo;
  document.getElementById('hud-modal-sub').textContent = meta.sub;
  document.getElementById('hud-modal').classList.add('open');
  cambiarHudTab('vista');
}

function cerrarHudModal() {
  document.getElementById('hud-modal').classList.remove('open');
  if (hudChartVistaAmpliada) { hudChartVistaAmpliada.destroy(); hudChartVistaAmpliada = null; }
}

function cambiarHudTab(tab) {
  document.querySelectorAll('.hud-mtab').forEach(b => b.classList.toggle('active', b.dataset.mtab === tab));
  document.getElementById('hud-modal-vista').style.display = tab === 'vista' ? '' : 'none';
  document.getElementById('hud-modal-stats').style.display = tab === 'stats' ? '' : 'none';
  if (tab === 'vista') renderHudVistaAmpliada();
  else renderHudEstadisticas();
}

function renderHudVistaAmpliada() {
  const cont = document.getElementById('hud-modal-vista');
  const d = window._hudData;
  const id = hudModalChartActual;
  if (hudChartVistaAmpliada) { hudChartVistaAmpliada.destroy(); hudChartVistaAmpliada = null; }
  cont.innerHTML = '';

  const baseOpts = {
    chart: { fontFamily:'Inter, sans-serif', toolbar:{show:true}, zoom:{enabled:false}, background:'transparent', foreColor:'#667085', height:420 },
    grid: { borderColor:'#EAECF0', strokeDashArray:3 },
    tooltip: { theme:'light' },
  };

  if (id === 'semanal') {
    const mediaMovil4 = d.semanas10.map((_,i,arr) => { const desde=Math.max(0,i-3); const v=arr.slice(desde,i+1).map(s=>s.total); return Math.round(v.reduce((s,x)=>s+x,0)/v.length); });
    hudChartVistaAmpliada = new ApexCharts(cont, { ...baseOpts,
      series: [{ name:'Cobro semanal', type:'column', data:d.semanas10.map(s=>Math.round(s.total)) }, { name:'Media móvil (4 sem.)', type:'line', data:mediaMovil4 }],
      xaxis: { categories: d.semanas10.map(s=>s.label) }, yaxis: { labels:{formatter:v=>d.fmtBsK(v)} },
      colors: ['#2451FF','#F79009'], stroke:{width:[0,3], curve:'smooth'},
    });
  } else if (id === 'mensual') {
    hudChartVistaAmpliada = new ApexCharts(cont, { ...baseOpts,
      series: [{ name:'Cobrado', type:'area', data:d.meses12.map(m=>Math.round(m.total)) }],
      xaxis: { categories: d.meses12.map(m=>m.label) }, yaxis: { labels:{formatter:v=>d.fmtBsK(v)} },
      colors: ['#2451FF'], stroke:{width:2, curve:'smooth'}, fill:{type:'gradient', gradient:{opacityFrom:.45,opacityTo:0}},
    });
  } else if (id === 'modalidad') {
    hudChartVistaAmpliada = new ApexCharts(cont, { ...baseOpts, chart:{...baseOpts.chart, type:'donut'},
      series: d.modalidadesOrdenadas.map(([,v])=>Math.round(v)), labels: d.modalidadesOrdenadas.map(([k])=>k),
      colors: ['#2451FF','#F79009','#12B76A','#7C3AED'],
      plotOptions:{ pie:{ donut:{ size:'65%' } } },
      dataLabels:{ formatter:v=>v.toFixed(0)+'%' }, legend:{ position:'bottom', labels:{colors:'#475467'} },
    });
  } else if (id === 'velas') {
    hudChartVistaAmpliada = new ApexCharts(cont, { ...baseOpts, chart:{...baseOpts.chart, height:460},
      series: [
        { name:'Cobro Diario', type:'candlestick', data: d.velas20.map(x=>({x:x.x, y:[x.o,x.h,x.l,x.c]})) },
        { name:'Volumen', type:'column', data: d.velas20.map(x=>({x:x.x, y:x.v})) },
      ],
      xaxis: { type:'datetime' },
      yaxis: [
        { seriesName:'Cobro Diario', labels:{formatter:v=>d.fmtBsK(Math.round(v))} },
        { seriesName:'Volumen', opposite:true, labels:{formatter:v=>Math.round(v)} },
      ],
      plotOptions:{ candlestick:{ colors:{ upward:'#12B76A', downward:'#F04438' } } },
      fill:{ opacity:[1,.35] }, colors:['#12B76A','#7C3AED'],
    });
  }
  hudChartVistaAmpliada.render();
}

function renderHudEstadisticas() {
  const grid = document.getElementById('hud-modal-stats-grid');
  const diagEl = document.getElementById('hud-modal-diagnostico');
  const d = window._hudData;
  const id = hudModalChartActual;
  let valores = [], labels = [];
  if (id === 'semanal') { valores = d.semanas10.map(s=>s.total); labels = d.semanas10.map(s=>s.label); }
  else if (id === 'mensual') { valores = d.meses12.map(m=>m.total); labels = d.meses12.map(m=>m.label); }
  else if (id === 'modalidad') { valores = d.modalidadesOrdenadas.map(([,v])=>v); labels = d.modalidadesOrdenadas.map(([k])=>k); }
  else if (id === 'velas') { valores = d.velas20.map(x=>x.c); labels = d.velas20.map(x=>new Date(x.x).toLocaleDateString('es-BO')); }

  if (!valores.length) { grid.innerHTML = '<div class="bi-stat-box">Sin datos suficientes.</div>'; diagEl.innerHTML=''; return; }
  const box = (label, value, destacado, tono) => `<div class="bi-stat-box${destacado?' hl':''}${tono==='warn'?' warn':''}"><div class="bi-stat-label">${label}</div><div class="bi-stat-value">${value}</div></div>`;
  const diag = (html, tono) => { diagEl.className = 'bi-insight' + (tono?' '+tono:''); diagEl.innerHTML = html; };

  if (id === 'modalidad') {
    const total = valores.reduce((s,v)=>s+v,0);
    const pares = labels.map((l,i)=>({l,v:valores[i]})).sort((a,b)=>b.v-a.v);
    const pctTop = total ? (pares[0].v/total*100) : 0;
    diag(`<strong>Diagnóstico:</strong> "${pares[0].l}" concentra el ${pctTop.toFixed(0)}% de la cobranza de expensas de este mes. ` +
      `<strong>Causa probable:</strong> ${pctTop>70?'es la forma de pago que eligió la mayoría de los propietarios — si depende de un trámite manual (ej: transferencia con comprobante), conviene reforzar el seguimiento específico de esa vía.':'la cobranza está repartida entre varias modalidades, sin una que domine.'} ` +
      `<strong>Prescripción:</strong> ${pctTop>70?'automatizar recordatorios específicos para esa modalidad, ya que es donde está la mayor parte del dinero por cobrar.':'mantener el seguimiento parejo entre modalidades.'}`, pctTop>70?'warn':'pos');
    grid.innerHTML = [box('Total', d.fmtBsK(valores.reduce((s,v)=>s+v,0)), true), box('Líder', `${pares[0].l} (${pctTop.toFixed(0)}%)`), box('N° modalidades', pares.length)].join('');
    return;
  }

  const primero = valores[0], ultimo = valores[valores.length-1];
  const crecimiento = primero ? ((ultimo-primero)/Math.abs(primero)*100) : 0;
  const idxMax = valores.indexOf(Math.max(...valores));
  const cv = HudStats.cv(valores);
  const esVolatil = cv > 30;
  const esVelas = id === 'velas';

  diag(`<strong>Diagnóstico:</strong> ${esVelas?'la cobranza diaria':'el valor'} actual es ${d.fmtBsK(ultimo)}, con una variación del ${cv.toFixed(0)}% entre ${esVelas?'días':'períodos'} (${esVolatil?'alta':'baja'} volatilidad). El mejor momento fue ${labels[idxMax]}. ` +
    `<strong>Causa probable:</strong> ${esVolatil ? 'la cobranza de expensas suele concentrarse en ciertos días del mes (típicamente principio de mes) — esa concentración natural explica buena parte de la variación.' : 'el ritmo de cobro es consistente, sin picos ni caídas marcadas.'} ` +
    `<strong>Prescripción:</strong> ${esVolatil ? 'reforzar los recordatorios automáticos en los días de mayor respuesta histórica, en vez de distribuir el esfuerzo parejo en todo el mes.' : 'mantener el seguimiento actual, viene funcionando de forma predecible.'}`,
    esVolatil ? 'warn' : 'pos');

  grid.innerHTML = [
    box('Valor actual', d.fmtBsK(ultimo), true),
    box('Coef. Variación', cv.toFixed(1)+'%', false, esVolatil?'warn':null),
    box('Mejor momento', labels[idxMax]||'—'),
    box('N° de datos', valores.length),
  ].join('');
}

/* ═══════════════════════════════════════════════════════════════
   MODAL GENÉRICO — para CUALQUIER gráfico Chart.js que ya exista en
   el sistema. No cambia el gráfico ni su lógica de datos: toma la
   instancia real (Chart.getChart lo busca por el id del canvas),
   la agranda, y calcula estadísticas REALES Y RELEVANTES según qué
   tipo de pregunta de negocio responde ese gráfico puntual — no la
   misma lista de media/mediana para todos.

   tipoAnalisis:
     'tendencia'   — algo que evoluciona en el tiempo (mes a mes, semana a semana)
     'composicion' — partes de un todo (donut: qué % es cada categoría)
     'ranking'     — comparación entre personas/categorías (quién es 1°, quién último)
     'dispersion'  — relación entre 2 variables (scatter)
═══════════════════════════════════════════════════════════════ */
let cjsModalChart = null;
let _cjsModalOrigenId = null;
let _cjsModalTipoAnalisis = 'tendencia';
let _cjsModalTipoVistaActual = null; // tipo de gráfico elegido en el selector (o null = el original)

function abrirModalGraficoJS(canvasId, titulo, sub, tipoAnalisis) {
  try {
    console.log('[GRAFICO] abrir ->', canvasId, tipoAnalisis);
    const original = (typeof Chart !== 'undefined') ? Chart.getChart(canvasId) : null;
    if (!original) { console.warn('[GRAFICO] Chart.getChart no encontró nada para', canvasId); toastErr('Ese gráfico todavía no cargó — esperá un segundo y probá de nuevo.'); return; }
    _cjsModalOrigenId = canvasId;
    _cjsModalTipoAnalisis = tipoAnalisis || 'tendencia';
    _cjsModalTipoVistaActual = null;
    const modal = document.getElementById('cjs-modal');
    if (!modal) { console.error('[GRAFICO] no existe #cjs-modal en el HTML'); return; }
    document.getElementById('cjs-modal-title').textContent = titulo;
    document.getElementById('cjs-modal-sub').textContent = sub || '';
    modal.classList.add('open');
    cambiarCjsTab('vista');
    console.log('[GRAFICO] modal abierto OK, display calculado:', getComputedStyle(modal).display);
  } catch (e) {
    console.error('[GRAFICO] Error real:', e);
    alert('Error al abrir el gráfico: ' + e.message);
  }
}

function cerrarModalGraficoJS() {
  document.getElementById('cjs-modal').classList.remove('open');
  if (cjsModalChart) { cjsModalChart.destroy(); cjsModalChart = null; }
}

function cambiarCjsTab(tab) {
  try {
    document.querySelectorAll('#cjs-modal .bi-mtab').forEach(b => b.classList.toggle('active', b.dataset.mtab === tab));
    document.getElementById('cjs-modal-vista').style.display = tab === 'vista' ? '' : 'none';
    document.getElementById('cjs-modal-stats').style.display = tab === 'stats' ? '' : 'none';
    if (tab === 'vista') renderCjsVistaAmpliada();
    else renderCjsEstadisticas();
  } catch (e) {
    console.error('[GRAFICO] Error en cambiarCjsTab:', e);
  }
}

// Qué tipos de gráfico tiene sentido ofrecer como alternativa, según el tipo original —
// no ofrecemos "torta" para una tendencia en el tiempo (no tendría sentido de negocio),
// ni "línea" para una composición donde lo que importa es la proporción.
function _cjsTiposAlternativosValidos(tipoOriginal, tipoAnalisis) {
  if (tipoAnalisis === 'dispersion') return ['scatter']; // el scatter no tiene alternativa razonable
  if (tipoAnalisis === 'composicion') return ['doughnut', 'pie', 'bar'];
  if (tipoAnalisis === 'ranking') return ['bar', 'line'];
  return ['line', 'bar', 'area']; // tendencia
}

function cambiarCjsTipoVista(tipo) {
  _cjsModalTipoVistaActual = tipo;
  renderCjsVistaAmpliada();
}

function renderCjsVistaAmpliada() {
  const original = Chart.getChart(_cjsModalOrigenId);
  if (!original) return;
  if (cjsModalChart) { cjsModalChart.destroy(); cjsModalChart = null; }
  const cont = document.getElementById('cjs-modal-vista');

  const tipoOriginal = original.config.type;
  const alternativas = _cjsTiposAlternativosValidos(tipoOriginal, _cjsModalTipoAnalisis);
  const nombresTipo = { line:'Líneas', bar:'Barras', area:'Área', doughnut:'Anillo', pie:'Torta', scatter:'Dispersión' };

  // Selector de "ver como" — solo si hay más de 1 alternativa razonable.
  let selectorHtml = '';
  if (alternativas.length > 1) {
    selectorHtml = `<div style="display:flex;gap:6px;margin-bottom:14px;">` +
      alternativas.map(t => {
        const activo = (_cjsModalTipoVistaActual || tipoOriginal) === t;
        return `<button onclick="cambiarCjsTipoVista('${t}')" style="padding:6px 13px;border-radius:8px;border:1px solid ${activo?'var(--brand)':'var(--line)'};background:${activo?'var(--brand)':'var(--surface)'};color:${activo?'#fff':'var(--ink-700)'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">${nombresTipo[t]||t}</button>`;
      }).join('') + `</div>`;
  }

  cont.innerHTML = selectorHtml + '<canvas id="cjs-modal-canvas"></canvas>';
  cont.style.height = alternativas.length > 1 ? '500px' : '460px';

  // Clonamos los datos tal cual (mismo dato real, misma fuente) — las funciones de formato
  // (tooltips/ejes con $/Bs) del original no siempre se pueden clonar, así que en la vista
  // ampliada puede verse el número sin el formato especial, pero el dato es exactamente el mismo.
  const tipoAMostrar = _cjsModalTipoVistaActual || (tipoOriginal === 'area' ? 'line' : tipoOriginal);
  const esArea = (_cjsModalTipoVistaActual === 'area');
  const datosClon = JSON.parse(JSON.stringify(original.config.data));
  if (esArea) datosClon.datasets.forEach(ds => { ds.fill = true; });

  cjsModalChart = new Chart(document.getElementById('cjs-modal-canvas'), {
    type: tipoAMostrar, data: datosClon,
    options: {
      responsive:true, maintainAspectRatio:false,
      indexAxis: (tipoAMostrar==='bar' && original.options?.indexAxis==='y') ? 'y' : undefined,
      plugins:{ legend:{ display:true, position:'top' }, datalabels:{ display:false } },
      scales: (tipoAMostrar==='pie'||tipoAMostrar==='doughnut') ? undefined :
              (tipoAMostrar==='scatter') ? { x:{title:{display:true,text:original.options?.scales?.x?.title?.text||''}}, y:{title:{display:true,text:original.options?.scales?.y?.title?.text||''}} } :
              { y:{ beginAtZero:true } },
    },
  });
}

// Detecta de qué habla el gráfico (por su título) para que el diagnóstico use el vocabulario
// correcto del rubro — no es lo mismo un ranking de "asesores" que uno de "módulos" o "canales".
function _cjsContextoNegocio(tituloLower) {
  if (/asesor|vendedor/.test(tituloLower)) return { sujeto:'asesor', sujetoPl:'asesores', accion:'vender/cobrar' };
  if (/modalidad|forma de pago|pago/.test(tituloLower)) return { sujeto:'modalidad de pago', sujetoPl:'modalidades de pago', accion:'elegir' };
  if (/categor/.test(tituloLower)) return { sujeto:'categoría de terreno', sujetoPl:'categorías', accion:'vender' };
  if (/m[oó]dulo/.test(tituloLower)) return { sujeto:'módulo', sujetoPl:'módulos', accion:'vender' };
  if (/canal|origen/.test(tituloLower)) return { sujeto:'canal de captación', sujetoPl:'canales', accion:'traer clientes' };
  if (/mora/.test(tituloLower)) return { sujeto:'nivel de mora', sujetoPl:'niveles de mora', accion:'atrasarse' };
  if (/estado/.test(tituloLower)) return { sujeto:'estado', sujetoPl:'estados', accion:'avanzar' };
  if (/m2|m²|precio/.test(tituloLower)) return { sujeto:'precio', sujetoPl:'precios', accion:'variar' };
  return { sujeto:'categoría', sujetoPl:'categorías', accion:'variar' };
}

function renderCjsEstadisticas() {
  const grid = document.getElementById('cjs-modal-stats-grid');
  const diagEl = document.getElementById('cjs-modal-diagnostico');
  const original = Chart.getChart(_cjsModalOrigenId);
  if (!original) { grid.innerHTML = '<div class="bi-stat-box">Sin datos.</div>'; diagEl.innerHTML=''; return; }

  const labels = original.data.labels || [];
  const ds = original.data.datasets.find(d => Array.isArray(d.data));
  if (!ds || !ds.data.length) { grid.innerHTML = '<div class="bi-stat-box">Sin datos para analizar.</div>'; diagEl.innerHTML=''; return; }

  const f = n => Math.round(n).toLocaleString('es-BO');
  const box = (label, value, destacado, tono) => `<div class="bi-stat-box${destacado?' hl':''}${tono==='warn'?' warn':''}"><div class="bi-stat-label">${label}</div><div class="bi-stat-value">${value}</div></div>`;
  const diag = (html, tono) => { diagEl.className = 'bi-insight' + (tono?' '+tono:''); diagEl.innerHTML = html; };

  const tipo = _cjsModalTipoAnalisis;
  const tituloActual = (document.getElementById('cjs-modal-title')?.textContent || '').toLowerCase();
  const ctx = _cjsContextoNegocio(tituloActual);

  /* ── DISPERSIÓN: relación entre 2 variables (ej: precio de venta vs. $/m²) ── */
  if (tipo === 'dispersion') {
    const puntos = ds.data.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
    if (!puntos.length) { grid.innerHTML = '<div class="bi-stat-box">Sin puntos numéricos.</div>'; diagEl.innerHTML=''; return; }
    const xs = puntos.map(p=>p.x), ys = puntos.map(p=>p.y);
    const mx = HudStats.mean(xs), my = HudStats.mean(ys);
    const covar = puntos.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/puntos.length;
    const sx = HudStats.stddev(xs), sy = HudStats.stddev(ys);
    const correlacion = (sx && sy) ? covar/(sx*sy) : 0;
    const fuerza = Math.abs(correlacion) > .7 ? 'fuerte' : Math.abs(correlacion) > .4 ? 'moderada' : 'débil';
    const direccion = correlacion > .05 ? 'positiva' : correlacion < -.05 ? 'negativa' : 'prácticamente nula';

    diag(`<strong>Diagnóstico:</strong> la relación entre ambas variables es <strong>${fuerza}</strong> y ${direccion} (r=${correlacion.toFixed(2)}). ` +
      `<strong>Causa probable:</strong> ${Math.abs(correlacion)>.6 ? 'el precio de venta sigue de cerca al valor por m² — la política de precios se está aplicando de forma consistente en las ventas.' : 'hay ventas con precios que no siguen el patrón esperado por m² — puede haber descuentos discrecionales fuera de la política, o terrenos con condiciones especiales (esquina, cercanía a amenities) que justifican el desvío.'} ` +
      `<strong>Prescripción:</strong> ${Math.abs(correlacion)<.4 ? 'revisar caso por caso los puntos que más se alejan de la tendencia — puede haber descuentos que excedieron lo autorizado en Panel de Control.' : 'la política de precios está funcionando bien, mantener el criterio actual.'}`,
      Math.abs(correlacion)<.4 ? 'warn' : 'pos');

    grid.innerHTML = [
      box('Correlación', correlacion.toFixed(2), true, Math.abs(correlacion)<.3?'warn':null),
      box('Promedio eje X', f(mx)),
      box('Promedio eje Y', f(my)),
      box('N° de puntos', puntos.length),
    ].join('');
    return;
  }

  /* ── COMPOSICIÓN: partes de un todo — qué modalidad/categoría/canal domina ── */
  if (tipo === 'composicion') {
    const valores = ds.data.map(v=>Number(v)||0);
    const total = valores.reduce((s,v)=>s+v,0);
    const pares = labels.map((l,i)=>({l, v:valores[i]})).sort((a,b)=>b.v-a.v);
    const top = pares[0], top2 = pares[1];
    const pctTop = total ? (top.v/total*100) : 0;
    const pctTop2Juntas = total ? ((top.v+(top2?top2.v:0))/total*100) : 0;
    const concentrado = pctTop2Juntas > 80;

    diag(`<strong>Diagnóstico:</strong> "<strong>${top?.l||'—'}</strong>" concentra el ${pctTop.toFixed(0)}% del total (${f(top?.v||0)} de ${f(total)}) entre las ${ctx.sujetoPl}. ` +
      `<strong>Causa probable:</strong> ${concentrado ? `casi todo el volumen está en 1 o 2 ${ctx.sujetoPl} — puede ser una preferencia genuina del mercado, o que las demás opciones no se están ofreciendo/promocionando con la misma fuerza.` : `el volumen está bien repartido entre varias ${ctx.sujetoPl}, sin una que domine claramente.`} ` +
      `<strong>Prescripción:</strong> ${concentrado ? `si depende de un proceso manual, vale la pena reforzar seguimiento ahí específicamente — es donde está concentrado el riesgo y la oportunidad.` : `mantener el seguimiento parejo entre todas las ${ctx.sujetoPl}.`}`,
      concentrado ? 'warn' : 'pos');

    grid.innerHTML = [
      box('Total', f(total), true),
      box('Líder', `${top?.l||'—'} (${pctTop.toFixed(0)}%)`),
      box('N° de categorías', pares.length),
    ].join('');
    return;
  }

  /* ── RANKING: comparación entre personas/categorías — quién lidera, cuál es la brecha ── */
  if (tipo === 'ranking') {
    const valores = ds.data.map(v=>Number(v)||0);
    const pares = labels.map((l,i)=>({l, v:valores[i]})).sort((a,b)=>b.v-a.v);
    const lider = pares[0], ultimo = pares[pares.length-1];
    const media = HudStats.mean(valores);
    const sobreLaMedia = valores.filter(v=>v>media).length;
    const brechaRelativa = media ? ((lider?.v||0)-(ultimo?.v||0))/media : 0;
    const brechaGrande = brechaRelativa > 1.5;

    diag(`<strong>Diagnóstico:</strong> <strong>${lider?.l||'—'}</strong> lidera con ${f(lider?.v||0)}, muy por encima del promedio del grupo (${f(media)}). El último de la lista, ${ultimo?.l||'—'}, tiene ${f(ultimo?.v||0)}. ` +
      `<strong>Causa probable:</strong> ${brechaGrande ? `la diferencia entre el primero y el último es muy grande — puede deberse a antigüedad/experiencia distinta, calidad de los leads asignados, o zona/cartera de cada ${ctx.sujeto}.` : `el grupo está relativamente parejo, sin una brecha que llame la atención.`} ` +
      `<strong>Prescripción:</strong> ${brechaGrande ? `vale la pena que ${lider?.l||'el líder'} comparta su método con el resto del equipo, y revisar si a los de abajo les está faltando algo (leads, capacitación, seguimiento).` : `el desempeño del grupo es consistente, mantener el acompañamiento actual.`}`,
      brechaGrande ? 'warn' : 'pos');

    grid.innerHTML = [
      box('Líder', `${lider?.l||'—'}`, true),
      box('Último lugar', `${ultimo?.l||'—'}`),
      box('Promedio del grupo', f(media)),
      box('Por encima del promedio', `${sobreLaMedia} de ${pares.length}`),
    ].join('');
    return;
  }

  /* ── TENDENCIA (por defecto): cómo evoluciona en el tiempo — cobranza, ventas, registros ── */
  const valores = ds.data.map(v => (v && typeof v==='object') ? Number(v.y) : Number(v)).filter(v=>!isNaN(v));
  if (!valores.length) { grid.innerHTML = '<div class="bi-stat-box">Sin datos numéricos.</div>'; diagEl.innerHTML=''; return; }
  const primero = valores[0], ultimo = valores[valores.length-1];
  const crecimientoTotal = primero ? ((ultimo-primero)/Math.abs(primero)*100) : 0;
  const idxMax = valores.indexOf(Math.max(...valores));
  const idxMin = valores.indexOf(Math.min(...valores));
  const xs = valores.map((_,i)=>i);
  const mx = HudStats.mean(xs), my = HudStats.mean(valores);
  const num = xs.reduce((s,x,i)=>s+(x-mx)*(valores[i]-my),0);
  const den = xs.reduce((s,x)=>s+(x-mx)**2,0);
  const pendiente = den ? num/den : 0;
  const subiendo = pendiente > my*0.02, bajando = pendiente < -my*0.02;
  const direccionTendencia = subiendo ? 'creciendo' : bajando ? 'bajando' : 'estable';
  const proyeccionSiguiente = Math.max(0, ultimo + pendiente);

  diag(`<strong>Diagnóstico:</strong> el valor actual es ${f(ultimo)}, con una tendencia <strong>${direccionTendencia}</strong> (${crecimientoTotal>=0?'+':''}${crecimientoTotal.toFixed(1)}% en todo el período mostrado). El mejor momento fue ${labels[idxMax]||'—'} (${f(valores[idxMax])}); el más flojo, ${labels[idxMin]||'—'} (${f(valores[idxMin])}). ` +
    `<strong>Causa probable:</strong> ${bajando ? 'una caída sostenida suele venir de menos seguimiento/categorización pendiente, estacionalidad del rubro, o menos entradas nuevas en ese período.' : subiendo ? 'el crecimiento sostenido normalmente refleja más captación, mejor seguimiento, o una campaña/promoción que está funcionando.' : 'el comportamiento estable indica un ritmo consolidado, sin sobresaltos.'} ` +
    `<strong>Prescripción:</strong> ${bajando ? 'revisar qué cambió justo antes de la caída — a partir de ' + (labels[idxMax]||'ese punto') + ' — y reforzar ahí el seguimiento.' : 'mantener lo que se está haciendo — la proyección para el próximo período, siguiendo este ritmo, es de ' + f(proyeccionSiguiente) + '.'}`,
    bajando ? 'warn' : subiendo ? 'pos' : null);

  grid.innerHTML = [
    box('Valor actual', f(ultimo), true),
    box('Crecimiento del período', (crecimientoTotal>=0?'+':'')+crecimientoTotal.toFixed(1)+'%', false, Math.abs(crecimientoTotal)>25?'warn':null),
    box('Mejor momento', `${labels[idxMax]||'—'}`),
    box('Proyección próximo período', f(proyeccionSiguiente)),
  ].join('');
}
// Compara el PERÍODO que la cuota corresponde pagar (Mes/Anio que da Orange) contra el mes
// en que efectivamente se pagó (FechaDePago) — esto es un dato directo y confiable, distinto
// del EstadoCuota/EstadoPago de Orange (que ya sabemos que no es confiable).
//   Paga el mismo mes que le toca         -> Vigente
//   Paga un mes ANTERIOR al que le toca   -> Mora (se atrasó)
//   Paga un mes POSTERIOR al que le toca  -> Adelantado (pagó por delante)
function _calcularCategoriaAutoExpensa(mesCuota, anioCuota, fechaPagoMs) {
  if (!mesCuota || !anioCuota || !fechaPagoMs) return null;
  const nombresMes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const mesCuotaNum = nombresMes.indexOf(String(mesCuota).toLowerCase().trim());
  if (mesCuotaNum === -1) return null;
  const anioCuotaNum = parseInt(anioCuota);
  if (isNaN(anioCuotaNum)) return null;

  const fPago = new Date(fechaPagoMs);
  const cuotaComoIndice = anioCuotaNum*12 + mesCuotaNum;
  const pagoComoIndice = fPago.getFullYear()*12 + fPago.getMonth();

  if (cuotaComoIndice === pagoComoIndice) return 'Vigente';
  if (cuotaComoIndice < pagoComoIndice) return 'Mora';
  return 'Adelantado';
}

// Categoriza automáticamente todo lo que todavía no tenga categoría asignada y sí tenga
// un mes/año de cuota confiable — usa el mismo criterio que definió el cliente:
// paga el mes que le toca = Vigente, paga uno anterior = Mora, uno posterior = Adelantado.
// Queda registrado como "automático" — si algo no cuadra, se puede recategorizar a mano
// desde la cola de "Categorizar cobros" en cualquier momento, no es definitivo ni oculta nada.
// Busca por nombre de cliente o terreno, y muestra CADA cuota que pagó, con su categoría —
// esto es lo que en la versión anterior era "elegís un cliente y se desglosa todo lo que pagó".
function renderBusquedaClienteExpensas() {
  const cont = document.getElementById('exp-busqueda-cliente-resultado');
  if (!cont) return;
  const term = (document.getElementById('exp-buscar-cliente')?.value||'').trim().toLowerCase();
  if (!term || term.length < 3) { cont.innerHTML = term ? '<div class="empty-state">Seguí escribiendo (mínimo 3 letras)...</div>' : ''; return; }

  const coincidencias = orangeExpensasDetalleRaw.filter(r =>
    r.cliente.toLowerCase().includes(term) || r.terreno.toLowerCase().includes(term)
  );
  if (!coincidencias.length) { cont.innerHTML = '<div class="empty-state">Sin coincidencias.</div>'; return; }

  // Agrupamos por cliente+terreno, porque un mismo cliente puede tener más de un lote.
  const grupos = {};
  coincidencias.forEach(r => {
    const clave = r.cliente + '|' + r.terreno;
    (grupos[clave] ||= { cliente:r.cliente, terreno:r.terreno, cuotas:[], total:0 });
    grupos[clave].cuotas.push(r);
    grupos[clave].total += r.monto;
  });

  const badges = { Vigente:'background:var(--ok-bg);color:var(--ok-ink);', Mora:'background:var(--danger-bg);color:var(--danger-ink);',
    Adelantado:'background:var(--info-bg);color:var(--info-ink);', 'Otros Ingresos':'background:var(--fill);color:var(--ink-700);' };

  cont.innerHTML = Object.values(grupos).map((g, i) => {
    const cuotasOrdenadas = [...g.cuotas].sort((a,b)=>(b.fechaOrden||0)-(a.fechaOrden||0));
    return `
    <div style="border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden;">
      <div style="padding:12px 16px;background:var(--fill);cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="document.getElementById('exp-busq-det-${i}').style.display = document.getElementById('exp-busq-det-${i}').style.display==='none'?'':'none';">
        <div><strong>${esc(g.cliente)}</strong> — <span style="font-family:monospace;color:var(--gris);">${esc(g.terreno)}</span></div>
        <div style="font-weight:700;color:var(--cartera);">Bs${g.total.toLocaleString('es-BO',{minimumFractionDigits:2})} <span style="color:var(--gris);font-weight:400;font-size:var(--fs-xs);">(${g.cuotas.length} cuota${g.cuotas.length!==1?'s':''}) ▾</span></div>
      </div>
      <div id="exp-busq-det-${i}" style="display:none;">
        <table style="font-size:var(--fs-sm);"><thead><tr><th>Fecha de pago</th><th>Mes que paga</th><th>Monto</th><th>Categoría</th></tr></thead>
        <tbody>
          ${cuotasOrdenadas.map(c => {
            const cat = expensasCategoriasData[c.key]?.categoria;
            return `<tr>
              <td>${esc(c.fecha)}</td>
              <td>${c.mesCuota ? esc(c.mesCuota)+' '+esc(c.anioCuota) : '—'}</td>
              <td style="font-weight:600;">Bs${c.monto.toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
              <td>${cat ? `<span style="padding:2px 9px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;${badges[cat]||''}">${esc(cat)}</span>` : '<span style="color:var(--warn);font-size:var(--fs-xs);">sin categorizar</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody></table>
      </div>
    </div>`;
  }).join('');
}

async function categorizarAutomaticamenteExpensas() {
  const paraGuardar = {};
  orangeExpensasDetalleRaw.forEach(r => {
    if (expensasCategoriasData[r.key]) return; // ya tiene categoría (manual o automática previa)
    if (!r.categoriaAuto) return; // sin mes/año de cuota confiable — se deja pendiente, para revisar a mano
    paraGuardar[r.key] = r.categoriaAuto;
  });
  const claves = Object.keys(paraGuardar);
  if (!claves.length) return;

  // Guardamos en lotes chicos (no los 14.000 juntos en una sola escritura) — así cada
  // lote es rápido, y si uno falla no se pierde lo que ya se guardó de los anteriores.
  const TAMANO_LOTE = 500;
  let guardados = 0;
  for (let i = 0; i < claves.length; i += TAMANO_LOTE) {
    const loteClaves = claves.slice(i, i + TAMANO_LOTE);
    const lote = {};
    loteClaves.forEach(k => { lote[k] = paraGuardar[k]; });
    try {
      await window._fbSetCategoriasExpensaEnLote(lote);
      guardados += loteClaves.length;
    } catch (e) {
      console.error('[CATEGORIZACION-AUTO] Error en el lote', i, '-', i+TAMANO_LOTE, ':', e);
      break; // paramos ahí — lo ya guardado queda bien, el resto se reintenta en la próxima sincronización
    }
    await new Promise(r => setTimeout(r, 50)); // pausa chica entre lotes, para no saturar
  }
  if (guardados > 0) {
    toastOk(`${guardados} cobro${guardados!==1?'s':''} categorizado${guardados!==1?'s':''} automáticamente (mes de cuota vs. mes de pago).`);
  }
}

async function cargarDetalleExpensas(silencioso) {
  const btn = document.getElementById('btn-refrescar-cobranza-exp');
  const setBtn = (txt, disabled) => { if (!silencioso && btn) { btn.textContent = txt; btn.disabled = disabled; } };
  setBtn('🔄 Cargando...', true);
  try {
    const resp = await fetch(ORANGE_API_URL + '?op=GetExpensas');
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const textoCrudo = await resp.text();
    let json;
    try {
      json = JSON.parse(textoCrudo);
    } catch (eParse) {
      // Orange no devolvió JSON — mostramos el principio de lo que sí mandó, así se ve
      // si es un error de SQL de ellos, un timeout, una página de error, etc.
      console.error('[ORANGE-EXPENSAS] Respuesta no es JSON. Primeros 300 caracteres:', textoCrudo.slice(0,300));
      throw new Error('Orange no devolvió datos válidos — empieza con: "' + textoCrudo.slice(0,80) + '..." (mirá la consola para verlo completo, esto parece un error del lado de Orange, no nuestro)');
    }
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    orangeExpensasDetalleRaw = json.data.map(r => {
      const monto = r.Cobranza_BS || 0;
      const key = `${r.Terreno}_${r.FechaDePago}_${monto}`.replace(/[.#$\[\]\/\s]/g,'-');
      const fechaOrden = _parseFechaOrange(r.FechaDePago)?.getTime() || 0;
      return {
        key, fecha: r.FechaDePago || '', fechaOrden,
        cliente: r.NombreCliente||'', terreno: r.Terreno||'', asesor: r.Asesor||'',
        modalidad: r.Modalidad||'Sin modalidad', modulo: r.Modulo||'Sin módulo', monto,
        mesCuota: r.Mes||'', anioCuota: r.Anio||'', // el período que esta cuota corresponde pagar — no cuándo se pagó
        categoriaAuto: _calcularCategoriaAutoExpensa(r.Mes, r.Anio, fechaOrden),
      };
    }).filter(r => r.monto > 0);

    categorizarAutomaticamenteExpensas(); // sin await — corre en segundo plano, no bloquea el resto
    await renderCobranzaExpensasKPIs(); // mantiene poblados los selectores de Año/Gestión de arriba
    renderDashboardExpensas();
    renderCategorizacionExpensas();
    renderResumenMensualExpensas();
    renderHistoricoMensualExpensas();
    renderSemanalExpensas();
    renderDetalleSemanaExpensas();
    renderBusquedaClienteExpensas();

    const lbl = new Date().toLocaleString('es-BO') + (silencioso ? ' (automática)' : ' (manual)');
    setText('dbe-sync-label', lbl);
    if (!silencioso) toastOk('Cobranza actualizada: ' + orangeExpensasDetalleRaw.length + ' cobros cargados.');
  } catch(e) {
    if (!silencioso) toastErr('No se pudo cargar el detalle: ' + e.message);
  } finally {
    setBtn('🔄 Actualizar ahora', false);
  }
}

async function renderCobranzaExpensasKPIs() {
  const hoy = new Date();
  const selAnio = document.getElementById('fil-exp-anio');
  if (selAnio && !selAnio.dataset.filled) {
    const anioHoy = hoy.getFullYear();
    const anios = [...new Set(orangeExpensasDetalleRaw.map(r => r.fechaOrden ? new Date(r.fechaOrden).getFullYear() : null).filter(Boolean))];
    if (!anios.includes(anioHoy)) anios.push(anioHoy);
    anios.sort((a,b)=>b-a);
    selAnio.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.value = expFilAnio;
    selAnio.dataset.filled = '1';
  }
  const selMes = document.getElementById('fil-exp-mes-global');
  if (selMes) selMes.value = expFilMes;
  const selGestion = document.getElementById('fil-exp-gestion');
  if (selGestion && !selGestion.dataset.filled) {
    const gestionHoy = _gestionActual();
    if (expFilGestion === null) expFilGestion = gestionHoy;
    const gestiones = [gestionHoy, gestionHoy-1, gestionHoy-2, gestionHoy-3];
    selGestion.innerHTML = gestiones.map(g=>`<option value="${g}">Gestión ${_labelGestion(g)}</option>`).join('');
    selGestion.value = expFilGestion;
    selGestion.dataset.filled = '1';
  }

  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(expFilMes);
  const diaSemana = (hoy.getDay()+6)%7;
  const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate()-diaSemana); inicioSemana.setHours(0,0,0,0);
  const finSemana = new Date(inicioSemana); finSemana.setDate(inicioSemana.getDate()+7);

  let cobradoSemana = 0, cobradoMes = 0, cobradoGestion = 0;
  orangeExpensasDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (f.getFullYear() === expFilAnio && f.getMonth() === mesFilNum) cobradoMes += r.monto;
    if (_gestionDeFecha(f) === expFilGestion) cobradoGestion += r.monto;
    if (r.fechaOrden >= inicioSemana.getTime() && r.fechaOrden < finSemana.getTime()) cobradoSemana += r.monto;
  });

  setText('exp-anio-actual', _labelGestion(expFilGestion));
  setText('exp-kpi-semana', _fmtMontoBs(cobradoSemana));
  setText('exp-kpi-mes', _fmtMontoBs(cobradoMes));
  setText('exp-kpi-gestion', _fmtMontoBs(cobradoGestion));

  const metaC = await window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_vigente');
  const metaMora = await window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_mora');
  const metaTotal = (metaC||0) + (metaMora||0);
  const elMeta = document.getElementById('exp-kpi-mes-meta');
  if (elMeta) {
    elMeta.innerHTML = metaTotal
      ? Math.round(cobradoMes/metaTotal*100) + '% de la meta (Bs'+metaTotal.toLocaleString('es-BO')+')'
      : '<a href="#" onclick="abrirModalMetaExpensasCategorias();return false;" style="color:var(--info);font-weight:600;">Sin meta — cargarla acá →</a>';
  }
}

let _chartExpensasSemanal = null;
function renderCobranzaExpensasSemanal() {
  const canvas = document.getElementById('exp-chart-semanal');
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
  orangeExpensasDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const b = buckets.find(x => r.fechaOrden >= x.inicio.getTime() && r.fechaOrden < x.fin.getTime());
    if (b) b.total += r.monto;
  });
  if (_chartExpensasSemanal) _chartExpensasSemanal.destroy();
  _chartExpensasSemanal = new Chart(canvas, {
    type: 'bar',
    data: { labels: buckets.map(b=>b.label), datasets: [{ label:'Cobrado', data: buckets.map(b=>Math.round(b.total)), backgroundColor:'#7C3AED', borderRadius:5, maxBarThickness:28 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{callbacks:{label:ctx=>_fmtMontoBs(ctx.parsed.y)}} }, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback:v=>_fmtMontoBs(v)}} } }
  });
}

let _chartExpensasMensual = null;
function renderCobranzaExpensasTendenciaMensual() {
  const canvas = document.getElementById('exp-chart-mensual');
  if (!canvas) return;
  const nombresMes = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const hoy = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
    buckets.push({ anio: d.getFullYear(), mes: d.getMonth(), label: nombresMes[d.getMonth()]+' '+String(d.getFullYear()).slice(2), total: 0 });
  }
  orangeExpensasDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    const b = buckets.find(x => x.anio===f.getFullYear() && x.mes===f.getMonth());
    if (b) b.total += r.monto;
  });
  if (_chartExpensasMensual) _chartExpensasMensual.destroy();
  _chartExpensasMensual = new Chart(canvas, {
    type: 'line',
    data: { labels: buckets.map(b=>b.label), datasets: [{ label:'Cobrado', data: buckets.map(b=>Math.round(b.total)), borderColor:'#2451FF', backgroundColor:'#2451FF', tension:.3, pointRadius:4 }] },
    options: {
      responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}},
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>_fmtMontoBs(ctx.parsed.y)}},
        datalabels:{ display:true, align:'top', anchor:'end', offset:5, color:'#0A0A0A', font:{weight:'700',size:10}, formatter:v=>_fmtMontoBs(v) } },
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback:v=>_fmtMontoBs(v)}} }
    }
  });
}

function renderCobranzaExpensasPorModalidad() {
  const cont = document.getElementById('exp-por-modalidad');
  if (!cont) return;
  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(expFilMes);
  const porModalidad = {};
  orangeExpensasDetalleRaw.forEach(r => {
    if (!r.fechaOrden) return;
    const f = new Date(r.fechaOrden);
    if (f.getFullYear()!==expFilAnio || f.getMonth()!==mesFilNum) return;
    porModalidad[r.modalidad] = (porModalidad[r.modalidad]||0) + r.monto;
  });
  const entries = Object.entries(porModalidad).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) { cont.innerHTML = '<div class="empty-state">Sin cobros en ' + expFilMes + ' ' + expFilAnio + '.</div>'; return; }
  const max = Math.max(...entries.map(([,v])=>v), 1);
  cont.innerHTML = entries.map(([k,v]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:3px;">
        <span style="font-weight:600;">${esc(k)}</span>
        <span style="color:var(--cartera);font-weight:700;">${_fmtMontoBs(v)}</span>
      </div>
      <div style="height:9px;background:var(--fill);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${(v/max*100).toFixed(1)}%;background:var(--cartera);"></div>
      </div>
    </div>`).join('');
}

/* ── Categorización manual de cobros de Expensas ── */
async function asignarCategoriaExpensa(cobroKey, categoria) {
  if (!categoria) return;
  await window._fbSetCategoriaExpensa(cobroKey, { categoria, asignadoPorNombre: asesorActual?.nombre || 'Admin' });
  toastOk('Categorizado como "' + categoria + '".');
}

function renderCategorizacionExpensas() {
  const tbody = document.getElementById('exp-categ-tbody');
  const contador = document.getElementById('exp-categ-pendientes');
  if (!tbody) return;
  const pendientes = orangeExpensasDetalleRaw.filter(r => !expensasCategoriasData[r.key]);
  if (contador) contador.textContent = pendientes.length + ' pendiente' + (pendientes.length!==1?'s':'') + ' por categorizar';
  if (!pendientes.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">✅ Todos los cobros cargados están categorizados.</div></td></tr>'; return; }
  const opciones = (auto) => '<option value="">Elegir categoría...</option>' + EXPENSAS_CATEGORIAS.map(c=>`<option value="${c}"${c===auto?' selected':''}>${c}${c===auto?' (sugerido)':''}</option>`).join('');
  tbody.innerHTML = pendientes.slice(0,200).map(r => `<tr>
    <td style="font-size:var(--fs-sm);">${esc(r.fecha)}</td>
    <td>${esc(r.cliente)}</td>
    <td style="font-family:monospace;font-size:var(--fs-sm);">${esc(r.terreno)}</td>
    <td style="font-size:var(--fs-sm);">${r.mesCuota ? esc(r.mesCuota)+' '+esc(r.anioCuota) : '<span style="color:var(--gris);">sin dato</span>'}</td>
    <td style="font-weight:600;color:var(--cartera);">Bs${r.monto.toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
    <td><select onchange="asignarCategoriaExpensa('${r.key}', this.value)" style="padding:6px 10px;border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-family:'DM Sans',sans-serif;">${opciones(r.categoriaAuto)}</select></td>
  </tr>`).join('') + (pendientes.length>200 ? `<tr><td colspan="6" style="text-align:center;color:var(--gris);padding:10px;">Mostrando 200 de ${pendientes.length}.</td></tr>` : '');
}

function _sumaCategoriaExp(cobros, categorias) {
  return cobros.filter(r => categorias.includes(expensasCategoriasData[r.key]?.categoria)).reduce((s,r)=>s+r.monto,0);
}

// Histórico mensual: Mes | Cobranza | Meta | % Cumplimiento — varios meses juntos, para
// comparar la evolución mes a mes de un vistazo (no solo el mes que tenés filtrado arriba).
async function renderHistoricoMensualExpensas() {
  const tbody = document.getElementById('exp-historico-mensual-tbody');
  if (!tbody) return;
  if (!orangeExpensasDetalleRaw.length) { tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Sin datos todavía — sincronizá arriba.</div></td></tr>'; return; }

  const meses12 = _agruparPorMes_dbe(orangeExpensasDetalleRaw, 12);
  const nombresMesLargo = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const filas = await Promise.all(meses12.map(async m => {
    const [metaV, metaM] = await Promise.all([
      window._fbGetMetaOnce(m.anio, nombresMesLargo[m.mes], 'expensas_vigente'),
      window._fbGetMetaOnce(m.anio, nombresMesLargo[m.mes], 'expensas_mora'),
    ]);
    const meta = (metaV||0)+(metaM||0);
    const pct = meta ? Math.round(m.total/meta*100) : null;
    return { ...m, meta, pct };
  }));

  tbody.innerHTML = [...filas].reverse().map(f => `<tr>
    <td style="font-weight:600;">${nombresMesLargo[f.mes]} ${f.anio}</td>
    <td style="font-weight:600;color:var(--cartera);">${_fmtMontoBs(f.total)}</td>
    <td>${f.meta ? _fmtMontoBs(f.meta) : '<span style="color:var(--gris);">sin meta</span>'}</td>
    <td>${f.pct!==null ? `<span style="font-weight:700;color:${f.pct>=100?'var(--ok)':f.pct>=75?'var(--warn)':'var(--danger)'}">${f.pct}%</span>` : '—'}</td>
  </tr>`).join('');
}

async function renderResumenMensualExpensas() {
  const cont = document.getElementById('exp-resumen-mensual');
  if (!cont) return;
  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(expFilMes);
  const delMes = orangeExpensasDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const f = new Date(r.fechaOrden);
    return f.getFullYear()===expFilAnio && f.getMonth()===mesFilNum;
  });

  const metaVigente = await window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_vigente') || 0;
  const metaMora    = await window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_mora') || 0;
  const metaVM = metaVigente + metaMora;

  const cVigente = _sumaCategoriaExp(delMes, ['Vigente']);
  const cMora    = _sumaCategoriaExp(delMes, ['Mora']);
  const cVigenteMora = cVigente + cMora;
  const cAdelanto = _sumaCategoriaExp(delMes, ['Adelanto']);
  const cOtros    = _sumaCategoriaExp(delMes, ['Otros Ingresos']);
  const totalCobranza = cVigenteMora + cAdelanto + cOtros;
  const pctMeta = metaVM ? Math.round(cVigenteMora/metaVM*100) : null;

  const fila = (label, valor, destacado) => `
    <tr style="${destacado?'background:var(--ok-bg,#e8f5e9);font-weight:700;':''}">
      <td style="padding:8px 12px;">${label}</td>
      <td style="padding:8px 12px;text-align:right;">${_fmtMontoBs(valor)}</td>
    </tr>`;

  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--ink-900);color:#fff;"><th style="padding:8px 12px;text-align:left;">Meta Expensas ${expFilMes} ${expFilAnio}</th><th style="padding:8px 12px;text-align:right;">Bs</th></tr></thead>
      <tbody>
        ${fila('Meta Cobranza Vigente', metaVigente)}
        ${fila('Meta Cobranza Mora', metaMora)}
        ${fila('Meta Cobranza Vigente y Mora', metaVM, true)}
        ${fila('Cobranza Vigente', cVigente)}
        ${fila('Cobranza Mora', cMora)}
        ${fila('Cobranza Vigente y Mora' + (pctMeta!==null ? ' — '+pctMeta+'% de la meta' : ''), cVigenteMora, true)}
        ${fila('Cobranza Adelantado', cAdelanto)}
        ${fila('Otros Ingresos', cOtros)}
        ${fila('TOTAL COBRANZA', totalCobranza, true)}
        ${(() => { const sinCat = delMes.filter(r => !expensasCategoriasData[r.key]?.categoria); const m = sinCat.reduce((s, r) => s + r.monto, 0); return sinCat.length ? fila('Cobros todavía sin categorizar (' + sinCat.length + ')', m, false, true) + fila('TOTAL COBRADO EN ORANGE', totalCobranza + m, true) : ''; })()}
      </tbody>
    </table>
    ${(() => { const n = delMes.filter(r => !expensasCategoriasData[r.key]?.categoria).length; return n ? `<div style="margin-top:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--warn,#C08A2E);font-size:var(--fs-sm);">⚠ ${n} cobro${n!==1?'s':''} de ${expFilMes} todavía no ${n!==1?'tienen':'tiene'} categoría. Mientras no se categoricen, la "Cobranza Vigente y Mora" y el % de la meta salen más bajos que lo cobrado de verdad.</div>` : ''; })()}
    <div style="margin-top:12px;">
      <button onclick="abrirModalMetaExpensasCategorias()" class="btn-secondary btn-sm">⚙ Cargar meta Vigente/Mora de ${expFilMes}</button>
    </div>
    <p style="font-size:10px;color:#999;margin-top:10px;font-family:monospace;">🔍 Diagnóstico — buscando en: metas/${expFilAnio}/${expFilMes}/expensas_vigente (leyó: ${metaVigente}) y metas/${expFilAnio}/${expFilMes}/expensas_mora (leyó: ${metaMora})</p>`;
}

let _chartSemanalExpensas = null;
async function renderSemanalExpensas() {
  const tbody = document.getElementById('exp-semanal-tbody');
  const canvas = document.getElementById('exp-chart-semanal-meta');
  if (!tbody) return;
  const mesesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesFilNum = mesesNombre.indexOf(expFilMes);
  const delMes = orangeExpensasDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const f = new Date(r.fechaOrden);
    return f.getFullYear()===expFilAnio && f.getMonth()===mesFilNum;
  });
  const porSemana = {};
  delMes.forEach(r => {
    const { anio, semana } = _semanaISO(new Date(r.fechaOrden));
    const key = anio+'-'+semana;
    (porSemana[key] ||= { anio, semana, total:0, cobranzaMeta:0 });
    porSemana[key].total += r.monto;
    const cat = expensasCategoriasData[r.key]?.categoria;
    if (cat === 'Vigente' || cat === 'Mora') porSemana[key].cobranzaMeta += r.monto;
  });
  const semanas = Object.values(porSemana).sort((a,b)=>a.semana-b.semana);
  if (!semanas.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Sin cobros en ' + expFilMes + ' ' + expFilAnio + '.</div></td></tr>'; return; }

  // La meta MENSUAL (Vigente+Mora) se reparte entre las semanas según cuántos días de
  // cada semana caen dentro de ESTE mes — antes esta columna no existía de verdad, mostraba
  // por error el mismo número que "Cobranza meta" (el monto cobrado, no un objetivo).
  const [metaVigenteMes, metaMoraMes] = await Promise.all([
    window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_vigente'),
    window._fbGetMetaOnce(expFilAnio, expFilMes, 'expensas_mora'),
  ]);
  const metaMensualTotal = (metaVigenteMes||0) + (metaMoraMes||0);
  const primerDiaMes = new Date(expFilAnio, mesFilNum, 1);
  const ultimoDiaMes = new Date(expFilAnio, mesFilNum+1, 0);
  const diasTotalesMes = ultimoDiaMes.getDate();

  semanas.forEach(s => {
    // Reconstruimos el rango real (lunes a domingo) de esta semana ISO para saber
    // cuántos de sus días caen dentro del mes que estamos mirando.
    const lunes = new Date(s.anio, 0, 1 + (s.semana-1)*7);
    while ((lunes.getDay()+6)%7 !== 0) lunes.setDate(lunes.getDate()-1); // retrocede al lunes
    let diasEnEsteMes = 0;
    for (let i=0;i<7;i++) {
      const d = new Date(lunes); d.setDate(lunes.getDate()+i);
      if (d.getMonth()===mesFilNum && d.getFullYear()===expFilAnio) diasEnEsteMes++;
    }
    s.metaAsignada = metaMensualTotal * (diasEnEsteMes/diasTotalesMes);
    s.pctMeta = s.metaAsignada ? Math.round(s.cobranzaMeta/s.metaAsignada*100) : null;
  });

  tbody.innerHTML = semanas.map(s => `<tr>
    <td style="font-weight:600;">Semana ${s.semana}</td>
    <td style="font-weight:600;color:var(--cartera);">${_fmtMontoBs(s.total)}</td>
    <td>${_fmtMontoBs(s.metaAsignada)}</td>
    <td style="color:var(--ok);">${_fmtMontoBs(s.cobranzaMeta)}</td>
    <td style="font-weight:600;color:${s.pctMeta===null?'var(--gris)':s.pctMeta>=100?'var(--ok)':s.pctMeta>=70?'var(--warn)':'var(--danger)'};">${s.pctMeta===null?'—':s.pctMeta+'%'}</td>
    <td style="color:var(--gris);">${_fmtMontoBs(s.total-s.cobranzaMeta)}</td>
  </tr>`).join('') + `<tr style="font-weight:700;background:var(--bg-soft);">
    <td>Total</td>
    <td>${_fmtMontoBs(semanas.reduce((s,x)=>s+x.total,0))}</td>
    <td>${_fmtMontoBs(semanas.reduce((s,x)=>s+x.metaAsignada,0))}</td>
    <td>${_fmtMontoBs(semanas.reduce((s,x)=>s+x.cobranzaMeta,0))}</td>
    <td>${metaMensualTotal ? Math.round(semanas.reduce((s,x)=>s+x.cobranzaMeta,0)/metaMensualTotal*100)+'%' : '—'}</td>
    <td>${_fmtMontoBs(semanas.reduce((s,x)=>s+(x.total-x.cobranzaMeta),0))}</td></tr>`;

  if (canvas) {
    if (_chartSemanalExpensas) _chartSemanalExpensas.destroy();
    _chartSemanalExpensas = new Chart(canvas, {
      type: 'line',
      data: { labels: semanas.map(s=>'Sem. '+s.semana), datasets: [
        { label:'Cobranza total', data: semanas.map(s=>Math.round(s.total)), borderColor:'#E8590C', backgroundColor:'#E8590C', tension:.3 },
        { label:'Meta de la semana', data: semanas.map(s=>Math.round(s.metaAsignada)), borderColor:'#666', backgroundColor:'#666', borderDash:[5,4], tension:.3 },
        { label:'Cobranza para meta', data: semanas.map(s=>Math.round(s.cobranzaMeta)), borderColor:'#2451FF', backgroundColor:'#2451FF', tension:.3 },
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'top', labels:{boxWidth:10,font:{size:10}}}, datalabels:{display:false} }, scales:{ y:{beginAtZero:true, ticks:{callback:v=>_fmtMontoBs(v)}} } }
    });
  }
}

function renderDetalleSemanaExpensas() {
  const tbody = document.getElementById('exp-detalle-semana-tbody');
  if (!tbody) return;
  const selAnio = document.getElementById('fil-exp-semana-anio');
  const selSemana = document.getElementById('fil-exp-semana-num');
  const hoyIso = _semanaISO(new Date());
  if (selAnio && !selAnio.dataset.filled) {
    selAnio.innerHTML = [hoyIso.anio, hoyIso.anio-1, hoyIso.anio-2].map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.dataset.filled = '1';
  }
  if (selSemana && !selSemana.dataset.filled) {
    let opts = ''; for (let i=1;i<=53;i++) opts += `<option value="${i}">Semana ${i}</option>`;
    selSemana.innerHTML = opts; selSemana.value = hoyIso.semana; selSemana.dataset.filled = '1';
  }
  const anio = parseInt(document.getElementById('fil-exp-semana-anio')?.value) || new Date().getFullYear();
  const semana = parseInt(document.getElementById('fil-exp-semana-num')?.value) || 1;
  const cobros = orangeExpensasDetalleRaw.filter(r => {
    if (!r.fechaOrden) return false;
    const iso = _semanaISO(new Date(r.fechaOrden));
    return iso.anio === anio && iso.semana === semana;
  });
  if (!cobros.length) { tbody.innerHTML = '<tr><td colspan="3"><div class="empty-state">Sin cobros en la Semana ' + semana + '/' + String(anio).slice(2) + '.</div></td></tr>'; return; }
  const porCategoria = {};
  cobros.forEach(r => { const cat = expensasCategoriasData[r.key]?.categoria || 'Sin categorizar'; (porCategoria[cat] ||= []).push(r); });
  const ordenCat = [...EXPENSAS_CATEGORIAS, 'Sin categorizar'];
  const catsOrdenadas = Object.keys(porCategoria).sort((a,b)=>ordenCat.indexOf(a)-ordenCat.indexOf(b));
  let html = ''; let totalGeneral = 0;
  catsOrdenadas.forEach(cat => {
    const items = porCategoria[cat]; const subtotal = items.reduce((s,r)=>s+r.monto,0); totalGeneral += subtotal;
    html += `<tr style="background:var(--bg-soft);"><td style="font-weight:700;" colspan="2">${esc(cat)}</td><td></td></tr>`;
    items.forEach(r => { html += `<tr><td></td><td>${esc(r.cliente)}</td><td style="text-align:right;">Bs${r.monto.toLocaleString('es-BO')}</td></tr>`; });
    html += `<tr style="background:var(--ok-bg,#e8f5e9);font-weight:600;"><td colspan="2">Sub Total</td><td style="text-align:right;">${_fmtMontoBs(subtotal)}</td></tr>`;
  });
  html += `<tr style="background:var(--ink-900);color:#fff;font-weight:700;"><td colspan="2">Total general</td><td style="text-align:right;">${_fmtMontoBs(totalGeneral)}</td></tr>`;
  tbody.innerHTML = html;
}

/* ── Modal de Meta Vigente/Mora para Expensas ── */
function abrirModalMetaExpensasCategorias() {
  console.log('[DIAG] abrirModalMetaExpensasCategorias — se ejecutó el click');
  try {
    const selAnio = document.getElementById('mec-anio');
    console.log('[DIAG] selAnio encontrado:', !!selAnio);
    if (!selAnio.options.length) {
      const anioHoy = new Date().getFullYear();
      selAnio.innerHTML = [anioHoy+1, anioHoy, anioHoy-1, anioHoy-2].map(a=>`<option value="${a}">${a}</option>`).join('');
    }
    selAnio.value = expFilAnio;
    document.getElementById('mec-mes').value = expFilMes;
    cargarMetaExpensasCategoriasExistente();
    const modal = document.getElementById('modal-meta-expensas-categorias');
    console.log('[DIAG] modal encontrado:', !!modal, '— clases antes:', modal?.className);
    modal.classList.add('open');
    console.log('[DIAG] clases después de abrir:', modal.className, '— display calculado:', getComputedStyle(modal).display);
  } catch (e) {
    console.error('[DIAG] Error real al abrir el modal:', e);
    alert('Error al abrir el modal: ' + e.message);
  }
}
async function cargarMetaExpensasCategoriasExistente() {
  const anio = document.getElementById('mec-anio')?.value;
  const mes  = document.getElementById('mec-mes')?.value;
  if (!anio || !mes) return;
  document.getElementById('mec-vigente').value = await window._fbGetMetaOnce(anio, mes, 'expensas_vigente') || '';
  document.getElementById('mec-mora').value = await window._fbGetMetaOnce(anio, mes, 'expensas_mora') || '';
}
function cerrarModalMetaExpensasCategorias() {
  document.getElementById('modal-meta-expensas-categorias')?.classList.remove('open');
}
async function guardarMetaExpensasCategorias() {
  const anio = document.getElementById('mec-anio')?.value;
  const mes  = document.getElementById('mec-mes')?.value;
  const vigente = parseFloat(document.getElementById('mec-vigente')?.value) || 0;
  const mora = parseFloat(document.getElementById('mec-mora')?.value) || 0;
  if (!anio || !mes) { toastErr('Elegí un período.'); return; }
  await window._fbSetMeta(anio, mes, 'expensas_vigente', vigente);
  await window._fbSetMeta(anio, mes, 'expensas_mora', mora);
  toastOk('Guardado en metas/' + anio + '/' + mes + '/expensas_vigente (' + vigente + ') y .../expensas_mora (' + mora + ')');
  cerrarModalMetaExpensasCategorias();
  // El modal tiene su propio Año/Mes, aparte del filtro de arriba — si guardaste para un
  // período distinto al que estabas mirando, sincronizamos el filtro principal con lo que
  // recién guardaste, así lo ves reflejado ya mismo (antes quedaba "guardado pero invisible").
  expFilAnio = parseInt(anio);
  expFilMes = mes;
  const selAnioGlobal = document.getElementById('fil-exp-anio');
  const selMesGlobal = document.getElementById('fil-exp-mes-global');
  if (selAnioGlobal) selAnioGlobal.value = anio;
  if (selMesGlobal) selMesGlobal.value = mes;
  renderResumenMensualExpensas();
  renderHistoricoMensualExpensas();
  renderSemanalExpensas();
  renderCobranzaExpensasKPIs();
  renderDashboardExpensas();
}

async function sincronizarOrangeExpensas() {
  const btn = document.getElementById('btn-sync-orange');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Sincronizando...'; }
  try {
    const resp = await fetch(ORANGE_API_URL + '?op=GetExpensas');
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const json = await resp.json();
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    // Por cada Terreno: nos quedamos con la cuota de MAYOR días de mora (la más vieja pendiente)
    // para definir el estado del lote, y sumamos TODAS sus cuotas pendientes como el monto adeudado total.
    const peorPorTerreno = {};
    const totalesPorTerreno = {};
    const cuotasPorTerreno = {};
    json.data.forEach(r => {
      const t = r.Terreno; if (!t) return;
      totalesPorTerreno[t] = (totalesPorTerreno[t]||0) + (r.Cobranza_BS||0);
      cuotasPorTerreno[t]  = (cuotasPorTerreno[t]||0) + 1;
      if (!peorPorTerreno[t] || (r.DiasMora||0) > (peorPorTerreno[t].DiasMora||0)) {
        peorPorTerreno[t] = r;
      }
    });

    let n = 0;
    for (const [terreno, r] of Object.entries(peorPorTerreno)) {
      const key = terreno.replace(/[^a-zA-Z0-9]/g,'-');
      await window._fbSetOrangeMora(key, {
        terreno,
        cliente: r.NombreCliente || '',
        asesor: r.Asesor || '',
        modalidad: r.Modalidad || '',
        modulo: r.Modulo || '',
        diasMora: r.DiasMora || 0,
        estado: estadoPorDiasMora(r.DiasMora),
        montoAdeudadoBS: Math.round((totalesPorTerreno[terreno]||0)*100)/100,
        cuotasPendientes: cuotasPorTerreno[terreno]||0,
      });
      n++;
    }
    await window._fbSetOrangeSyncInfo({ ts: Date.now(), cantidad: n });
    toastOk('Sincronizado: ' + n + ' lotes actualizados desde Orange.');
  } catch(e) {
    toastErr('No se pudo conectar con Orange (' + e.message + '). Puede ser un bloqueo de seguridad del navegador (CORS) — avisame para revisarlo.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sincronizar con Orange'; }
  }
}

function renderOrangeSyncInfo(info) {
  const lbl = document.getElementById('orange-sync-label');
  if (!lbl) return;
  lbl.textContent = info?.ts ? new Date(info.ts).toLocaleString('es-BO') + ' (' + info.cantidad + ' lotes)' : 'nunca';
}

function renderOrangeCarteraSyncInfo(info) {
  const lbl = document.getElementById('orange-cart-sync-label');
  if (!lbl) return;
  lbl.textContent = info?.ts ? new Date(info.ts).toLocaleString('es-BO') + ' (' + info.cantidad + ' lotes)' : 'nunca';
}

function renderOrangeMoraKPIs() {
  const tiers = { 'Mora 1-30':'m1', 'Mora 31-60':'m2', 'Mora 61-90':'m3', 'Mora 91-180':'m4', 'Mora +180':'m5' };
  const acc = {}; Object.values(tiers).forEach(id => acc[id] = {n:0, monto:0});
  orangeMoraData.forEach(r => {
    const id = tiers[r.estado];
    if (!id) return;
    acc[id].n++; acc[id].monto += (r.montoAdeudadoBS||0);
  });
  Object.entries(tiers).forEach(([label,id]) => {
    setText('orange-kpi-'+id+'-val', 'Bs '+Math.round(acc[id].monto).toLocaleString('es-BO'));
    setText('orange-kpi-'+id+'-n', acc[id].n+' lote(s)');
  });
}

function renderOrangeMoraTabla() {
  const tbody = document.getElementById('orange-mora-tbody');
  if (!tbody) return;
  const term = (document.getElementById('orange-buscar')?.value||'').trim().toLowerCase();
  let datos = orangeMoraData;
  if (term) datos = datos.filter(r =>
    (r.cliente||'').toLowerCase().includes(term) ||
    (r.terreno||'').toLowerCase().includes(term) ||
    (r.asesor||'').toLowerCase().includes(term)
  );
  datos = [...datos].sort((a,b)=>(b.diasMora||0)-(a.diasMora||0));

  if (!datos.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Sin datos — sincronizá con Orange arriba.</div></td></tr>'; return; }

  // Esta tabla viene del cronograma de Orange (Estado de Cuota/Pago), que ya sabemos que
  // no siempre refleja pagos reales. Cruzamos contra lo que SÍ categorizamos a mano en
  // "Categorizar cobros" — si hay algún cobro de ese terreno marcado "Vigente" en los
  // últimos 60 días, mostramos un aviso: puede que ya esté al día aunque acá diga mora.
  const hoy = Date.now();
  const terrenosConVigenteReciente = new Set();
  orangeExpensasDetalleRaw.forEach(r => {
    const cat = expensasCategoriasData[r.key]?.categoria;
    if (cat === 'Vigente' && r.fechaOrden && (hoy - r.fechaOrden) < 60*24*60*60*1000) {
      terrenosConVigenteReciente.add(r.terreno);
    }
  });

  tbody.innerHTML = datos.map(r => {
    const posibleDesactualizado = terrenosConVigenteReciente.has(r.terreno);
    return `<tr${posibleDesactualizado?' style="background:var(--ok-bg,#e8f5e9);"':''}>
    <td style="font-weight:600;font-family:monospace;">${esc(r.terreno)}</td>
    <td>${esc(r.cliente)} ${posibleDesactualizado?'<span title="Tiene un cobro categorizado como Vigente en los últimos 60 días — este dato de Orange puede estar desactualizado" style="font-size:var(--fs-xs);font-weight:700;color:var(--ok);">✅ ¿Ya pagó? Verificar</span>':''}</td>
    <td style="font-size:var(--fs-sm);">${esc(r.asesor||'—')}</td>
    <td style="font-weight:600;">${r.diasMora}</td>
    <td>${_pintarEstadoExp(r.estado)}</td>
    <td style="font-weight:600;color:var(--cartera);">Bs ${(r.montoAdeudadoBS||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
    <td>${r.cuotasPendientes||1}</td>
  </tr>`;
  }).join('');
}

async function sincronizarOrangeCartera() {
  const btn = document.getElementById('btn-sync-orange-cartera');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Sincronizando...'; }
  try {
    const resp = await fetch(ORANGE_API_URL + '?op=GetCartera');
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const json = await resp.json();
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    // Por cada Terreno: Orange trae Terrenos y Acciones como DOS obligaciones separadas,
    // cada una con su propia mora — un cliente puede estar al día en el terreno
    // pero atrasado en la acción del club (o viceversa), así que las trackeamos aparte.
    const datos = {};
    json.data.forEach(r => {
      const t = r.Terreno; if (!t) return;
      (datos[t] ||= {
        cliente: r.NombreCliente||'', asesor: r.Asesor||'', modalidad: r.Modalidad||'', modulo: r.Modulo||'',
        peorTerreno: null, adeudadoTerreno: 0,
        peorAccion: null, adeudadoAccion: 0,
      });
      const d = datos[t];
      if (r.TipoPago === 'TERRENOS' || (r.CobranzaTerreno||0) > 0) {
        d.adeudadoTerreno += (r.CobranzaTerreno||0);
        if (!d.peorTerreno || (r.DiasMoraTerreno||0) > d.peorTerreno) d.peorTerreno = r.DiasMoraTerreno||0;
      }
      if (r.TipoPago === 'ACCIONES' || (r.CobranzaAccion||0) > 0) {
        d.adeudadoAccion += (r.CobranzaAccion||0);
        if (!d.peorAccion || (r.DiasMoraAccion||0) > d.peorAccion) d.peorAccion = r.DiasMoraAccion||0;
      }
    });

    let n = 0;
    for (const [terreno, d] of Object.entries(datos)) {
      const key = terreno.replace(/[^a-zA-Z0-9]/g,'-');
      // Estado general: el peor de los dos (terreno o acción) — así en el KPI general
      // no se "esconde" un atraso de acción detrás de un terreno al día.
      const peorDias = Math.max(d.peorTerreno||0, d.peorAccion||0);
      await window._fbSetOrangeCartera(key, {
        terreno, cliente: d.cliente, asesor: d.asesor, modalidad: d.modalidad, modulo: d.modulo,
        diasMoraTerreno: d.peorTerreno||0, adeudadoTerreno: Math.round(d.adeudadoTerreno*100)/100,
        diasMoraAccion: d.peorAccion||0, adeudadoAccion: Math.round(d.adeudadoAccion*100)/100,
        diasMora: peorDias, estado: estadoPorDiasMora(peorDias),
      });
      n++;
    }

    // Universo general: cada Terreno en GetCartera es un lote con plan de pago activo —
    // es decir, VENDIDO. Contarlos por Modalidad y por Módulo nos da el panorama completo
    // de los 785 lotes vendidos: qué modalidad predomina, qué módulo tiene más movimiento.
    const porModalidad = {}, porModulo = {};
    Object.values(datos).forEach(d => {
      const modKey = d.modalidad || 'Sin modalidad';
      (porModalidad[modKey] ||= {lotes:0, montoAdeudado:0});
      porModalidad[modKey].lotes++;
      porModalidad[modKey].montoAdeudado += (d.adeudadoTerreno||0)+(d.adeudadoAccion||0);

      const modu = d.modulo || 'Sin módulo';
      (porModulo[modu] ||= {lotes:0, montoAdeudado:0});
      porModulo[modu].lotes++;
      porModulo[modu].montoAdeudado += (d.adeudadoTerreno||0)+(d.adeudadoAccion||0);
    });
    await window._fbSetOrangeCarteraAgregados({
      totalLotesVendidos: Object.keys(datos).length,
      porModalidad, porModulo,
    });
    await window._fbSetOrangeCarteraSyncInfo({ ts: Date.now(), cantidad: n });
    toastOk('Sincronizado: ' + n + ' lotes de cartera actualizados desde Orange.');
  } catch(e) {
    toastErr('No se pudo conectar con Orange (' + e.message + ').');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sincronizar con Orange'; }
  }
}

function renderOrangeCarteraPanel() {
  renderOrangeCarteraKPIs();
  renderOrangeCarteraTabla();
}

function renderOrangeCarteraKPIs() {
  const tiers = { 'Mora 1-30':'c1', 'Mora 31-60':'c2', 'Mora 61-90':'c3', 'Mora 91-180':'c4', 'Mora +180':'c5' };
  const acc = {}; Object.values(tiers).forEach(id => acc[id] = {n:0, monto:0});
  orangeCarteraData.forEach(r => {
    const id = tiers[r.estado];
    if (!id) return;
    acc[id].n++; acc[id].monto += ((r.adeudadoTerreno||0) + (r.adeudadoAccion||0));
  });
  Object.entries(tiers).forEach(([label,id]) => {
    setText('orange-cart-kpi-'+id+'-val', '$'+Math.round(acc[id].monto).toLocaleString('es-BO'));
    setText('orange-cart-kpi-'+id+'-n', acc[id].n+' lote(s)');
  });
}

function renderOrangeCarteraTabla() {
  const tbody = document.getElementById('orange-cartera-tbody');
  if (!tbody) return;
  const term = (document.getElementById('orange-cart-buscar')?.value||'').trim().toLowerCase();
  let datos = orangeCarteraData;
  if (term) datos = datos.filter(r =>
    (r.cliente||'').toLowerCase().includes(term) ||
    (r.terreno||'').toLowerCase().includes(term) ||
    (r.asesor||'').toLowerCase().includes(term)
  );
  datos = [...datos].sort((a,b)=>(b.diasMora||0)-(a.diasMora||0));

  if (!datos.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Sin datos — sincronizá con Orange arriba.</div></td></tr>'; return; }

  tbody.innerHTML = datos.map(r => `<tr>
    <td style="font-weight:600;font-family:monospace;">${esc(r.terreno)}</td>
    <td>${esc(r.cliente)}</td>
    <td style="font-size:var(--fs-sm);">${esc(r.asesor||'—')}</td>
    <td>${_pintarEstadoExp(r.estado)}</td>
    <td style="text-align:center;">${r.diasMoraTerreno||0}</td>
    <td style="font-weight:600;color:var(--cartera);">${r.adeudadoTerreno ? '$'+r.adeudadoTerreno.toLocaleString('es-BO',{minimumFractionDigits:2}) : '—'}</td>
    <td style="text-align:center;">${r.diasMoraAccion||0}</td>
    <td style="font-weight:600;color:var(--info);">${r.adeudadoAccion ? '$'+r.adeudadoAccion.toLocaleString('es-BO',{minimumFractionDigits:2}) : '—'}</td>
  </tr>`).join('');
}

