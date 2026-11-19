/* ═══════════════════════════════════════════
   RESUMEN EJECUTIVO — storytelling: Qué pasó → Por qué → Qué hacemos → Impacto
   Compara este mes vs el anterior y busca automáticamente la causa principal.
═══════════════════════════════════════════ */
async function renderResumenEjecutivo(mesC, anioC) {
  const nombresMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hoy = new Date();
  const dAnt = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1);
  const mesAnt = nombresMes[dAnt.getMonth()];
  const anioAnt = dAnt.getFullYear();

  setText('re-mes-label', mesC + ' ' + anioC);

  const internos = soloInternos(todosRegs);
  const cierresEste = internos.filter(r => r.mes===mesC && (r.conclusion==='Reserva' || r.huboCierre==='SI'));
  const cierresAnt  = internos.filter(r => r.mes===mesAnt && (r.conclusion==='Reserva' || r.huboCierre==='SI'));
  const val = r => r.precioVenta || r.precio || 0;

  const totalEste = cierresEste.reduce((s,r)=>s+val(r),0);
  const totalAnt  = cierresAnt.reduce((s,r)=>s+val(r),0);
  const deltaPct = totalAnt ? Math.round((totalEste-totalAnt)/totalAnt*100) : null;
  const subio = deltaPct!==null && deltaPct >= 0;

  // ── PASO 1: ¿Qué pasó? ──
  const el1 = document.getElementById('re-que-paso');
  if (el1) {
    el1.innerHTML = `<div class="re-big">$${Math.round(totalEste).toLocaleString('es-BO')}
      <small>${cierresEste.length} cierre${cierresEste.length!==1?'s':''} este mes ·
        ${deltaPct===null ? 'sin datos del mes anterior' : `<span class="${subio?'re-delta-up':'re-delta-down'}">${subio?'↑':'↓'} ${Math.abs(deltaPct)}%</span> vs ${mesAnt}`}
      </small></div>`;
  }

  // ── PASO 2: ¿Por qué pasó? — buscamos quién explica más el cambio (asesor con mayor variación) ──
  function agruparVentas(regs) {
    const g = {};
    regs.forEach(r => { const k = r.asesorNombre||'—'; g[k] = (g[k]||0) + val(r); });
    return g;
  }
  const porAsesorEste = agruparVentas(cierresEste);
  const porAsesorAnt  = agruparVentas(cierresAnt);
  const asesoresSet = new Set([...Object.keys(porAsesorEste), ...Object.keys(porAsesorAnt)]);
  let causaAsesor = null, causaDelta = 0;
  asesoresSet.forEach(a => {
    const d = (porAsesorEste[a]||0) - (porAsesorAnt[a]||0);
    if (Math.abs(d) > Math.abs(causaDelta)) { causaDelta = d; causaAsesor = a; }
  });

  const el2 = document.getElementById('re-por-que');
  if (el2) {
    if (causaAsesor && Math.abs(causaDelta) > 0) {
      const pctExplicado = (deltaPct!==null && (totalEste-totalAnt)) ? Math.round(Math.abs(causaDelta)/Math.abs(totalEste-totalAnt)*100) : null;
      el2.innerHTML = `<div class="re-big" style="font-size:18px;">${esc(causaAsesor)}
        <small><span class="${causaDelta>=0?'re-delta-up':'re-delta-down'}">${causaDelta>=0?'+':'-'}$${Math.abs(Math.round(causaDelta)).toLocaleString('es-BO')}</span>
        ${pctExplicado!==null ? ' · explica ~'+pctExplicado+'% del cambio' : ''}</small></div>`;
    } else {
      el2.innerHTML = `<div class="re-empty">Sin variación relevante para atribuir a un asesor puntual.</div>`;
    }
  }

  // ── PASO 3: ¿Qué hacemos ahora? — reglas simples sobre datos reales ──
  const sugerencias = [];
  if (deltaPct !== null && deltaPct <= -15) {
    sugerencias.push(`Ventas cayeron ${Math.abs(deltaPct)}% — revisar seguimiento de ${esc(causaAsesor||'el equipo')} esta semana.`);
  }
  const descPcts = cierresEste.filter(r=>r.descuentoPct).map(r=>r.descuentoPct);
  const descProm = descPcts.length ? descPcts.reduce((s,v)=>s+v,0)/descPcts.length : 0;
  if (descProm >= 10) {
    sugerencias.push(`Descuento promedio del mes en ${descProm.toFixed(1)}% — revisar la política en Panel de Control.`);
  }
  const porAsesorConv = {};
  internos.filter(r=>r.mes===mesC).forEach(r => {
    const k = r.asesorNombre||'—'; (porAsesorConv[k] ||= {tot:0,cierres:0});
    porAsesorConv[k].tot++;
    if (r.conclusion==='Reserva'||r.huboCierre==='SI') porAsesorConv[k].cierres++;
  });
  Object.entries(porAsesorConv).forEach(([a,d]) => {
    if (d.tot >= 4 && d.cierres===0) sugerencias.push(`${esc(a)} lleva ${d.tot} visitas este mes sin ningún cierre — vale la pena una revisión 1 a 1.`);
  });
  const diaDelMes = hoy.getDate();
  const diasDelMesTotal = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
  let metaCPasoTres = null;
  if (diaDelMes/diasDelMesTotal > 0.6) {
    metaCPasoTres = await window._fbGetMetaOnce(anioC, mesC, 'mkt_cierres');
    if (metaCPasoTres && cierresEste.length < metaCPasoTres * (diaDelMes/diasDelMesTotal) * 0.7) {
      sugerencias.push(`Vamos avanzado ${Math.round(diaDelMes/diasDelMesTotal*100)}% del mes y solo ${Math.round(cierresEste.length/metaCPasoTres*100)}% de la meta — riesgo de no llegar.`);
    }
  }

  const el3 = document.getElementById('re-que-hacemos');
  if (el3) {
    el3.innerHTML = sugerencias.length
      ? sugerencias.slice(0,3).map(s => `<div class="re-suggestion">${s}</div>`).join('')
      : `<div class="re-empty">Sin alertas por ahora — todo dentro de lo esperado.</div>`;
  }

  // ── PASO 4: Impacto — meta vs ejecución ──
  const el4 = document.getElementById('re-impacto');
  if (el4) {
    const metaC = metaCPasoTres!==null ? metaCPasoTres : await window._fbGetMetaOnce(anioC, mesC, 'mkt_cierres');
    if (metaC) {
      const pct = Math.round(cierresEste.length/metaC*100);
      el4.innerHTML = `<div class="re-big" style="color:${pct>=100?'var(--ok)':pct>=70?'var(--warn)':'var(--danger)'};">${pct}%
        <small>${cierresEste.length} de ${metaC} reservas · faltan ${Math.max(metaC-cierresEste.length,0)}</small></div>`;
    } else {
      el4.innerHTML = `<div class="re-empty">Sin meta cargada este mes — <a href="#" onclick="switchAdminTab('panelcontrol');return false;" style="color:var(--info);font-weight:600;">cargarla acá →</a></div>`;
    }
  }
}

function renderHome() {
  // Saludo dinámico
  const hora = new Date().getHours();
  const sal = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  const hoy = new Date().toLocaleDateString('es-BO', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const elSal = document.getElementById('home-saludo');
  const elFec = document.getElementById('home-fecha');
  if (elSal) elSal.textContent = sal + ', Jonathan';
  if (elFec) elFec.textContent = hoy.charAt(0).toUpperCase() + hoy.slice(1);

  const mesC  = mesActual();
  const anioC = anioActual();

  renderResumenEjecutivo(mesC, anioC);

  // ══ VENTAS ══
  const vMes       = soloInternos(todosRegs.filter(r => _regEnMesAnio(r, mesC, anioC)));   // antes no miraba el año: sumaba octubre de otros años
  const vVisitas   = soloInternos(visitasComoRegs(todosRegs)).filter(r => _regEnMesAnio(r, mesC, anioC));   // visitas presenciales: 1ª y las que el cliente volvió
  const vCierres   = todosRegs.filter(r => _regEnMesAnio(r, mesC, anioC) && _esCierreVenta(r));   // igual que "Reservas" en Ventas (equipo + externos)
  countUp(document.getElementById('kpi-total'), soloInternos(todosRegs).length);
  const vendedoresCountHome = asesores.filter(a => (a.modulos || ROL_MODULOS[a.rol] || []).includes('ventas')).length;
  setText('kpi-total-sub', vendedoresCountHome + ' vendedor' + (vendedoresCountHome!==1?'es':''));
  countUp(document.getElementById('kpi-mes'), vMes.length);
  setText('kpi-mes-sub', 'registros en ' + mesC);
  countUp(document.getElementById('h-visitas-mes'), vVisitas.length);
  countUp(document.getElementById('h-cierres-mes'), vCierres.length);

  // Gráfico de torta — pipeline de ventas por conclusión
  renderHomeChartVentasPie(vMes);
  renderHomeChartVentasTendencia();

  // ══ MARKETING ══
  const leadsM   = leadsData.filter(l => l.mes===mesC && l.anio===anioC);
  const fuentesL = ['Facebook Ads','Instagram','CRM','WhatsApp','Web','Facebook'];
  const visitasL = visitasComoRegs(todosRegs).filter(r => _regEnMesAnio(r, mesC, anioC) && fuentesL.some(f=>((r.origen||r.procedencia)||'').toLowerCase().includes(f.toLowerCase())));
  const funnelHome = calcularFunnelDatos(mesC, anioC);
  const leadsMesN  = funnelHome[0].n;   // mismo número que el embudo y que Marketing (planilla por campaña)
  const conv     = leadsMesN ? Math.round(funnelHome[3].n/leadsMesN*100) : 0;
  const leadNuevo= leadsM.filter(l=>l.estado==='Nuevo').length;
  countUp(document.getElementById('h-leads-mes'), leadsMesN);
  countUp(document.getElementById('h-visitas-leads'), visitasL.length);
  setText('h-conv-leads', conv+'%');
  countUp(document.getElementById('h-leads-nuevos'), leadNuevo);
  pintarFunnelEnDiv('h-chart-mkt-embudo', funnelHome);

  // ══ CARTERA ══
  const carteraMes  = (cartaCobroData||[]).filter(c => c.mes===mesC && c.anio===anioC);
  const cartaMeta   = (cartaMetaData||[]).filter(c => c.mes===mesC && c.anio===anioC);
  const cartaSi     = carteraMes.filter(c => c.sumaMeta==='SI');
  const totalCobSi  = cartaSi.reduce((s,c)=>s+(c.monto||0),0);
  const totalMeta   = cartaMeta.reduce((s,c)=>s+(c.monto||0),0);
  const pctCarta    = totalMeta ? Math.round(totalCobSi/totalMeta*100) : 0;
  // For mora display use cartera_admin data (Excel-uploaded) as legacy
  const cartaAdmin  = (cartaAdminData||carteraMes).filter(c=>c.mes===mesC&&c.anio===anioC);
  const mora        = cartaAdmin.filter(c=>(c.estado||c.sumaMeta||'').toLowerCase().includes('mora'));
  const vigente     = cartaAdmin.filter(c=>!(c.estado||'').toLowerCase().includes('mora'));
  const totalMora   = mora.reduce((s,c)=>s+(c.monto||0),0);
  countUpMoney(document.getElementById('h-carta-cobrado'), totalCobSi);
  setText('h-carta-pct', pctCarta+'% de la meta');
  countUp(document.getElementById('h-mora'), mora.length);
  setText('h-mora-monto', '$'+totalMora.toLocaleString('es-BO',{maximumFractionDigits:0})+' pendiente');
  countUp(document.getElementById('h-vigente'), vigente.length);
  const hMetaPct = document.getElementById('h-meta-pct');
  const hMetaSub = document.getElementById('h-meta-sub');
  if (hMetaPct) { hMetaPct.textContent = pctCarta+'%'; hMetaPct.style.color = pctCarta>=100?'var(--ok)':pctCarta>=75?'var(--warn)':'var(--danger)'; }
  if (hMetaSub) hMetaSub.textContent = pctCarta+'% alcanzado este mes';
  renderHomeChartCarteraMora(cartaAdmin);

  // ══ EXPENSAS ══
  const expMes     = (expAdminData||[]).filter(e=>e.mes===mesC&&e.anio===anioC);
  const totalExp   = expMes.reduce((s,e)=>s+(e.monto||0),0);
  const histExp    = (expAdminData||[]).reduce((s,e)=>s+(e.monto||0),0);
  countUpMoney(document.getElementById('h-exp-total'), totalExp);
  setText('h-exp-n', expMes.length+' cobros');
  countUpMoney(document.getElementById('h-exp-historico'), histExp);
  setText('h-exp-props', expMes.length);
  renderHomeChartExpensasEstado(expMes);

  // ══ INVENTARIO ══
  const disp  = todosLotes.filter(l=>l.estado==='Disponible').length;
  const vend  = todosLotes.filter(l=>l.estado==='Vendido').length;
  const resv  = todosLotes.filter(l=>l.estado==='Reservado').length;
  const ocup  = todosLotes.length ? Math.round((vend+resv)/todosLotes.length*100) : 0;
  countUp(document.getElementById('h-disponibles'), disp);
  countUp(document.getElementById('h-inv-vendidos'), vend);
  countUp(document.getElementById('h-inv-reservados'), resv);
  setText('h-inv-ocupacion', ocup+'%');
  renderHomeChartInventarioPie(disp, vend, resv, todosLotes.length);

  // Badge mora en sidebar
  const badgeM = document.getElementById('badge-mora');
  if (badgeM) { badgeM.textContent = mora.length; badgeM.style.display = mora.length>0?'inline-flex':'none'; }

  // Acciones rápidas subtextos (legacy IDs kept)
  setText('ac-mora-n',  mora.length+' en mora');
  setText('ac-inv-n',   disp+' disponibles');
  setText('ac-reg-n',   vMes.length+' este mes');
  setText('ac-ventas-n',vMes.length+' registros');

  // Badge mora en tab (legacy - now handled above)

  // Acciones rápidas subtextos
  const acMora = document.getElementById('ac-mora-n');
  const acInv  = document.getElementById('ac-inv-n');
  const acReg  = document.getElementById('ac-reg-n');
  const acVen  = document.getElementById('ac-ventas-n');
  const mes    = mesActual();
  if (acMora) acMora.textContent = mora.length + ' en mora';
  if (acInv)  acInv.textContent  = todosLotes.filter(l=>l.estado==='Disponible').length + ' disponibles';
  if (acReg)  acReg.textContent  = todosRegs.filter(r=>r.mes===mes).length + ' este mes';
  if (acVen)  acVen.textContent  = todosRegs.filter(r=>r.mes===mes).length + ' registros';

  // Semáforo mora — por tramo de estado (Mora +60 / Mora 31-60 / Mora 1-30 / Mora genérico)
  const m60 = mora.filter(c=>(c.estado||'').includes('+60')).length;
  const m30 = mora.filter(c=>(c.estado||'').includes('31-60')).length;
  const m1  = mora.filter(c=>(c.estado||'').includes('1-30') || ((c.estado||'').toLowerCase()==='mora')).length;
  const sm60 = document.getElementById('h-mora-alta');
  const sm30 = document.getElementById('h-mora-media');
  const sm1  = document.getElementById('h-mora-baja');
  if (sm60) sm60.textContent = m60;
  if (sm30) sm30.textContent = m30;
  if (sm1)  sm1.textContent  = m1;

  // Top mora del mes (mayor monto primero)
  const sinGest = [...mora].sort((a,b)=>(b.monto||0)-(a.monto||0)).slice(0,8);

  const topMoraEl = document.getElementById('home-top-mora');
  if (topMoraEl) {
    topMoraEl.innerHTML = sinGest.length ? sinGest.map(c => `
      <div class="alerta-item alerta-mora" onclick="switchAdminTab_btn('cartera')">
        <div class="alerta-dot" style="background:var(--danger);"></div>
        <div>
          <div class="alerta-texto">${esc(c.cliente)}</div>
          <div class="alerta-meta">${c.concepto||''} · ${c.estado||'Mora'} · $${(c.monto||0).toLocaleString('es-BO',{maximumFractionDigits:0})}</div>
        </div>
      </div>`).join('')
    : '<div style="font-size:var(--fs-base);color:var(--ok);padding:8px;">✅ Sin clientes en mora este mes</div>';
  }

  // Alertas urgentes
  const alertasEl = document.getElementById('home-alertas');
  if (alertasEl) {
    const alertas = [];
    // Clientes en mora del mes
    if (mora.length > 0) {
      alertas.push({ tipo:'mora', texto:`${mora.length} clientes en mora este mes`, sub:`Mayor deuda: ${sinGest[0]?.cliente||'—'} — $${(sinGest[0]?.monto||0).toLocaleString('es-BO',{maximumFractionDigits:0})}`, tab:'cartera' });
    }
    // Lotes sin precio
    const sinPrecio = todosLotes.filter(l=>!l.precio && l.estado==='Disponible').length;
    if (sinPrecio > 0) {
      alertas.push({ tipo:'sin', texto:`${sinPrecio} lotes disponibles sin precio cargado`, sub:'Actualizar en el módulo Inventario', tab:'inventario' });
    }
    // Meta no cargada
    const metaEl = document.getElementById('h-cob-meta');
    if (metaEl && metaEl.textContent.includes('—')) {
      alertas.push({ tipo:'gestion', texto:'Meta de cartera del mes no configurada', sub:'Ir a Cartera → Editar meta', tab:'cartera' });
    }
    // Vendidos vs disponibles
    const vendidosPct = todosLotes.length ? Math.round(todosLotes.filter(l=>l.estado==='Vendido').length/todosLotes.length*100) : 0;
    if (vendidosPct >= 70) {
      alertas.push({ tipo:'meta-pct', texto:`${vendidosPct}% del inventario ya vendido`, sub:'Excelente ritmo de ventas 🎉', tab:'inventario' });
    }

    if (!alertas.length) {
      alertasEl.innerHTML = '<div style="font-size:var(--fs-base);color:var(--ok);padding:8px 0;">✅ Sin alertas pendientes. Todo en orden.</div>';
    } else {
      const iconos = { mora:'🔴', gestion:'🟡', 'meta-pct':'🟢', sin:'⚪' };
      alertasEl.innerHTML = alertas.map(a => `
        <div class="alerta-item alerta-${a.tipo}" onclick="switchAdminTab_btn('${a.tab}')" style="cursor:pointer;">
          <div class="alerta-dot" style="background:${a.tipo==='mora'?'var(--danger)':a.tipo==='gestion'?'var(--warn)':a.tipo==='meta-pct'?'var(--ok)':'#9ca3af'};"></div>
          <div>
            <div class="alerta-texto">${iconos[a.tipo]||''} ${a.texto}</div>
            <div class="alerta-meta">${a.sub}</div>
          </div>
        </div>`).join('');
    }
  }

  // Clientes en mora — tabla completa
  const sgEl = document.getElementById('home-sin-gestion');
  if (sgEl) {
    const sinG = [...mora].sort((a,b)=>(b.monto||0)-(a.monto||0));
    if (!sinG.length) {
      sgEl.innerHTML = '<div style="font-size:var(--fs-base);color:var(--ok);padding:8px 0;">✅ Sin clientes en mora este mes</div>';
    } else {
      sgEl.innerHTML = `<table class="mora-table-mini">
        <thead><tr><th>Cliente</th><th>Concepto</th><th>Estado</th><th>Monto ($)</th><th>Semana</th><th>Acción</th></tr></thead>
        <tbody>${sinG.slice(0,15).map(c=>`<tr onclick="switchAdminTab_btn('cartera')">
          <td><strong>${esc(c.cliente)}</strong></td>
          <td>${c.concepto||'—'}</td>
          <td style="color:var(--danger);font-weight:600;">${c.estado||'Mora'}</td>
          <td style="font-weight:600;">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td>${c.semana||'—'}</td>
          <td><span style="font-size:var(--fs-xs);color:var(--info);cursor:pointer;">Ver →</span></td>
        </tr>`).join('')}</tbody>
      </table>` + (sinG.length>15 ? `<div style="font-size:var(--fs-sm);color:var(--gris);padding:8px;">... y ${sinG.length-15} más</div>` : '');
    }
  }

  // Resumen ventas home
  const vRes = document.getElementById('h-ventas-resumen');
  if (vRes) {
    const vMes = todosRegs.filter(r=>r.mes===mesActual());
    const contratos = vMes.filter(r=>['Contrato','Reserva'].includes(r.estado)).length;
    vRes.innerHTML = `
      <div class="home-stat-row"><span class="home-stat-label">Registros este mes</span><span class="home-stat-val">${vMes.length}</span></div>
      <div class="home-stat-row"><span class="home-stat-label">Contratos / Reservas</span><span class="home-stat-val" style="color:var(--ok);">${contratos}</span></div>
      <div class="home-stat-row"><span class="home-stat-label">Interesados</span><span class="home-stat-val">${vMes.filter(r=>r.interes==='SI').length}</span></div>
      <div class="home-stat-row"><span class="home-stat-label">Con cierre (Reserva)</span><span class="home-stat-val" style="color:var(--cartera);">${vMes.filter(r=>r.conclusion==='Reserva'||r.huboCierre==='SI').length}</span></div>
    `;
  }

  // Metas en home — updated inline above
}

function updateHomeMetas(tipo, cobrado, meta, pct) {
  if (tipo === 'cartera') {
    const el  = document.getElementById('h-meta-pct');
    const sub = document.getElementById('h-meta-sub');
    const cob = document.getElementById('h-carta-cobrado');
    const pctSub = document.getElementById('h-carta-pct');
    if (el)  { el.textContent = pct+'%'; el.style.color = pct>=100?'var(--ok)':pct>=75?'var(--warn)':'var(--danger)'; }
    if (sub) sub.textContent = pct+'% alcanzado este mes';
    if (cob) countUpMoney(cob, cobrado);
    if (pctSub) pctSub.textContent = pct+'% de la meta';
  } else {
    const cobEl  = document.getElementById('h-exp-total');
    const pctEl  = document.getElementById('h-exp-meta-pct');
    const metaEl = document.getElementById('h-exp-meta-val');
    if (cobEl) countUpMoney(cobEl, cobrado);
    if (pctEl) pctEl.textContent = pct+'%';
    if (metaEl) metaEl.textContent = meta ? '$'+Number(meta).toLocaleString('es-BO') : 'sin meta';
  }
}



/* ═══════════════════════════════════════════
   INIT MÓDULOS — ya integrado en entrarAdmin()
═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   SISTEMA DE ROLES Y PERMISOS
═══════════════════════════════════════════ */

// Definición de módulos por rol
const ROL_MODULOS = {
  ventas:     ['ventas'],
  marketing:  ['marketing'],
  callcenter: ['callcenter'],
  cobranza:   ['cobranza'],
  expensas:   ['expensas'],
  gerencia:   ['ventas','marketing','callcenter','cobranza','expensas','inventario','dashboard'],
  mixto:      []
};

const ROL_LABELS = {
  ventas:     { label:'Vendedor',    color:'#065f46', bg:'#d1fae5', icon:'🟢' },
  marketing:  { label:'Marketing',   color:'#1e40af', bg:'#dbeafe', icon:'🔵' },
  callcenter: { label:'Call Center', color:'#0e7490', bg:'#cffafe', icon:'📞' },
  cobranza:   { label:'Cartera',     color:'#5b21b6', bg:'#ede9fe', icon:'🟣' },
  expensas:   { label:'Expensas',    color:'#991b1b', bg:'#fee2e2', icon:'🔴' },
  gerencia:   { label:'Gerencia',    color:'#92400e', bg:'#fef3c7', icon:'🟡' },
  mixto:      { label:'Personalizado', color:'#374151', bg:'#f3f4f6', icon:'⚙️' }
};

// Módulos seleccionados en el form
let modulosSeleccionados = ['ventas'];

function actualizarModulosSegunRol() {
  const rol = document.getElementById('new-asesor-rol').value;
  if (rol === 'mixto') return; // no tocar la selección manual del usuario
  const preset = ROL_MODULOS[rol] || ['ventas'];
  document.querySelectorAll('#modulos-checkboxes .modulo-check').forEach(label => {
    const inp = label.querySelector('input');
    const on  = preset.includes(inp.value);
    inp.checked = on;
    label.classList.toggle('sel', on);
  });
  modulosSeleccionados = [...preset];
}

function toggleModulo(el, mod) {
  el.classList.toggle('sel');
  const inp = el.querySelector('input');
  if (inp) inp.checked = el.classList.contains('sel');
  modulosSeleccionados = Array.from(document.querySelectorAll('#modulos-checkboxes .modulo-check.sel'))
    .map(e => e.querySelector('input')?.value).filter(Boolean);
}

/* ══ ENTRAR COMO USUARIO LIMITADO ══ */
/* Cambia entre las pestañas del panel de usuario (Mi Fichero / Cargar / Marketing / Expensas) */
function switchUserTab(id, scroll = true) {
  ['ventas','callcenter','expensas','marketing','fichero','cotizaciones'].forEach(t => {
    const el = document.getElementById('utab-' + t);
    if (el) el.style.display = (t === id) ? 'block' : 'none';
  });
  const wrap = document.getElementById('user-tabs-wrap');
  if (wrap) {
    wrap.querySelectorAll('.user-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick') === `switchUserTab('${id}')`);
    });
  }
  if (scroll) {
    const panel = document.getElementById('utab-' + id);
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (id === 'cotizaciones') { cambiarSubTabCotizVendedor('simulador'); cotzMontar(); }
}

function entrarUsuario() {
  const a = asesorActual;
  if (!a) return;
  cerrarTodosLosModales();

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('user-panel').style.display   = 'block';
  // Also update asesor-panel info in case it's used
  const apAv  = document.getElementById('ap-av');
  const apNom = document.getElementById('ap-nombre');
  const apBdg = document.getElementById('ap-rol-badge');
  const rolI  = ROL_LABELS[a.rol||'ventas'] || ROL_LABELS.ventas;
  if (apAv)  apAv.textContent  = iniciales(a.nombre);
  if (apNom) apNom.textContent = a.nombre;
  if (apBdg) { apBdg.textContent = rolI.icon + ' ' + rolI.label; apBdg.style.color = rolI.color; apBdg.style.background = rolI.bg; }

  const rolInfo = ROL_LABELS[a.rol] || ROL_LABELS.ventas;
  document.getElementById('up-av').textContent     = iniciales(a.nombre);
  document.getElementById('up-nombre').textContent  = a.nombre;
  document.getElementById('up-rol').textContent    = 'Bienvenido/a';
  const upBadge = document.getElementById('up-rol-badge');
  if (upBadge) { upBadge.textContent = rolInfo.icon + ' ' + rolInfo.label; upBadge.style.color = rolInfo.color; upBadge.style.background = rolInfo.bg; }

  const modulos = a.modulos || ROL_MODULOS[a.rol] || ['ventas'];

  // Construir tabs dinámicos
  const tabsWrap = document.getElementById('user-tabs-wrap');
  const tabConfig = [
    { id:'fichero',    label:'🎯 Mi Fichero',   check:'ventas' },
    { id:'ventas',     label:'📋 Cargar',        check:'ventas' },
    { id:'cotizaciones', label:'💰 Cotizaciones', check:'ventas' },
    { id:'callcenter', label:'📞 Agendar visita', check:'callcenter' },
    { id:'marketing',  label:'📊 Marketing',     check:'marketing' },
    { id:'expensas',   label:'🏘 Expensas',      check:'expensas' },
  ];
  // Cobranza → va al panel admin directamente (mismo panel-cartera)
  const tabConfigFinal = tabConfig.filter(t => {
    if (t.id==='fichero'    && !modulos.includes('ventas'))     return false;
    if (t.id==='ventas'     && !modulos.includes('ventas'))     return false;
    if (t.id==='cotizaciones' && !modulos.includes('ventas') && !modulos.includes('callcenter')) return false;
    if (t.id==='callcenter' && !modulos.includes('callcenter')) return false;
    if (t.id==='marketing'  && !modulos.includes('marketing'))  return false;
    if (t.id==='expensas'   && !modulos.includes('expensas'))   return false;
    return true;
  });
  tabsWrap.innerHTML = tabConfigFinal.map((t,i) =>
    `<button class="user-tab ${i===0?'active':''}" onclick="switchUserTab('${t.id}')">${t.label}</button>`
  ).join('');

  // Mostrar primer tab disponible
  if (tabConfigFinal.length) switchUserTab(tabConfigFinal[0].id, false);

  // Notificaciones, campañas y visitas programadas: para CUALQUIER rol (ventas, marketing, callcenter, mixto)
  window._fbListenNotificaciones(a._key, arr => { misNotificaciones = arr; renderNotificaciones(); });
  window._fbListenCampanias(arr => { campaniasData = arr; renderCampanias(); });
  iniciarMarketingPlanilla();
  window._fbListenLeadsSemanales(arr => { leadsSemanalesData = arr; renderLeadsSemanales(); renderDashboard(); });
  window._fbListenOrigenes(arr => { origenesData = arr; renderOrigenes(); });
  window._fbListenVentasConcretadas(arr => { ventasConcretadasData = arr; renderMisRegistros(); });
  if (modulos.includes('ventas') || modulos.includes('callcenter')) window._fbListenCotizaciones(arr => { cotizacionesData = arr; renderMisCotizacionesVendedor(); });
  if (!modulos.includes('ventas') && modulos.includes('callcenter')) window._fbListenLotes(arr => { todosLotes = arr; });
  window._fbListenPoliticaDescuento(arr => { politicaDescuentoData = arr; });
  window._fbListenPlazosModalidad(data => { plazosModalidadData = data; });
  window._fbListenVisitasProgramadasTodas(arr => {
    visitasProgramadasData = arr;
    try { if (modoAdmin) renderCotizacionesGuardadas(); else renderMisCotizacionesVendedor(); } catch(e) {}
    if (typeof mkpRefrescar === 'function') mkpRefrescar();
    misVisitasProgramadas = arr.filter(v => v.asesorKey === a._key && !v.esDevolucion && (v.estado === 'pendiente' || v.estado === 'en_proceso'));   // las devoluciones van a la cola del call center, no al asesor
    try { renderVisitasProgramadasAsesor(); } catch(e) { console.error('renderVisitasProgramadasAsesor:', e); }
    try { renderVisitasProgramadasCallCenter(); } catch(e) { console.error('renderVisitasProgramadasCallCenter:', e); }
    try { poblarSelectAsesorCallCenter(); } catch(e) { console.error('poblarSelectAsesorCallCenter:', e); }
  });

  // Escuchar registros de ventas propios
  if (modulos.includes('ventas')) {
    window._fbListenRegistros(a._key, arr => {
      misRegs = arr;
      try { renderMisRegistros(); } catch(e) { console.error('renderMisRegistros:', e); }
      try { renderFicheroVendedor(); } catch(e) { console.error('renderFicheroVendedor:', e); }
      try { poblarSugerenciasClientes(); } catch(e) { console.error('poblarSugerenciasClientes:', e); }
    });
    window._fbListenLotes(arr => { todosLotes = arr; renderListaLotesPicker(); renderLotesEnNegociacionResumen(); });
    const fFechaEl = document.getElementById('f-fecha');
    if (fFechaEl) fFechaEl.value = new Date().toISOString().split('T')[0];

    // Mover (no clonar) las pestañas + formulario del asesor-panel hacia el panel de usuario.
    // Antes esto se clonaba (cloneNode) y quedaban IDs duplicados en el documento
    // (dos #f-nombre, dos #f-terreno-key, etc.) — el navegador mostraba una copia
    // pero el JS siempre leía/escribía la otra, por eso "ya puse el nombre pero
    // dice que falta" y "no deja buscar en el inventario". Moviendo el nodo real
    // en vez de clonarlo, queda un único formulario con IDs únicos.
    const ventasInner = document.getElementById('utab-ventas-inner');
    if (ventasInner && !ventasInner.dataset.moved) {
      const asesorPanel = document.getElementById('asesor-panel');
      const tabs   = asesorPanel?.querySelector('.asesor-tabs');
      const cargar = asesorPanel?.querySelector('#atab-cargar');
      const misReg = asesorPanel?.querySelector('#atab-mis-registros');
      if (tabs && cargar && misReg) {
        ventasInner.appendChild(tabs);
        ventasInner.appendChild(cargar);
        ventasInner.appendChild(misReg);
        ventasInner.dataset.moved = '1';
      }
    }
  }

  // Escuchar leads propios de Marketing (la lista y KPIs necesitan estos datos)
  if (modulos.includes('marketing')) {
    window._fbListenLeads(arr => {
      leadsData = arr;
      renderMarketing();
      renderLeads();
    });
    // Necesario para calcular "visitas desde leads" y "cierres" (conversión)
    window._fbListenTodos(arr => {
      todosRegs = arr;
      renderMarketing();
    });
    const mesEl = document.getElementById('mkt-lead-mes');
    if (mesEl) {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      mesEl.value = meses[new Date().getMonth()];
    }
  }

  /* Categorías de Expensas — disponibles para el asesor en su formulario rápido */
  window._fbListenCatExpensas(arr => {
    catExpensasData = arr;
    renderCatExpensasConfig();
  });
}

async function guardarExpensaUsuario() {
  const a = asesorActual;
  const cliente = document.getElementById('uexp-cliente')?.value.trim();
  const monto   = parseFloat(document.getElementById('uexp-monto')?.value) || 0;
  if (!cliente || !monto) { toastErr('Cliente y monto son obligatorios.'); return; }

  const mesCap = PC_MESES[new Date().getMonth()];

  const catEl = document.getElementById('uexp-categoria');
  const catNombre = catEl?.options[catEl.selectedIndex]?.text && catEl.value ? catEl.options[catEl.selectedIndex].text : 'Expensa común';
  const catKey    = catEl?.value || '';

  const btnUe = document.querySelector('[onclick="guardarExpensaUsuario()"]');
  btnLoading(btnUe, true);
  try {
    await window._fbPushCobro({
      cliente, monto,
      terreno:         document.getElementById('uexp-terreno')?.value.trim() || '',
      categoriaNombre: catNombre,
      categoriaKey:    catKey,
      mes:             mesCap,
      anio:            new Date().getFullYear(),
      fecha:           document.getElementById('uexp-fecha')?.value || '',
      obs:             document.getElementById('uexp-obs')?.value.trim() || '',
      asesor:          a.nombre,
      asesorKey:       a._key,
      sumaMeta:        'SI',
      tipoMeta:        'expensas',
      cargadoPor:      a.nombre,
      fechaCarga:      new Date().toLocaleString('es-BO'),
    });
    btnSuccess(btnUe);
    toastOk('Cobro de expensa registrado.');
    ['uexp-cliente','uexp-terreno','uexp-monto','uexp-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    if (catEl) catEl.selectedIndex = 0;
    document.getElementById('uexp-nuevo-form').style.display = 'none';
  } catch(e) {
    btnLoading(btnUe, false);
    toastErr('No se pudo guardar: ' + (e.message||'revisa tu conexion.'));
  }
}

/* ══ RENDER COBROS USUARIO ══ */
function renderCobranzaUsuario() {
  if (!asesorActual) return;
  const mes  = mesActual();
  const anio = anioActual();
  const misCobros = cobrosData.filter(c => c.asesorKey === asesorActual._key || c.asesor === asesorActual.nombre);
  const delMes    = misCobros.filter(c => c.mes === mes && c.anio === anio && c.tipoMeta !== 'expensas');
  const total     = delMes.reduce((s,c)=>s+(c.monto||0),0);
  const historico = misCobros.filter(c=>c.tipoMeta!=='expensas').reduce((s,c)=>s+(c.monto||0),0);

  setText('ucob-mes-total', '$' + total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  setText('ucob-mes-n', delMes.length + ' cobros este mes');
  setText('ucob-historico', '$' + historico.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  setText('ucob-historico-n', misCobros.filter(c=>c.tipoMeta!=='expensas').length + ' cobros totales');

  // Meta del usuario
  window._fbListenMetas(anio, mes, metas => {
    const metaUser = metas?.['u_' + asesorActual._key + '_cartera']?.monto ||
                     metas?.cartera?.monto || 0;
    const pct = metaUser ? Math.round(total/metaUser*100) : 0;
    setText('ucob-meta-val', metaUser ? '$'+Number(metaUser).toLocaleString('es-BO') : '—');
    setText('ucob-meta-pct', metaUser ? pct+'% alcanzado' : 'sin meta asignada');
    setText('ucob-meta-pct-txt', pct+'%');
    const bar = document.getElementById('ucob-meta-bar');
    if (bar) { bar.style.width=Math.min(pct,100)+'%'; bar.style.background=pct>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pct>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--cartera),var(--cartera-light))'; }
  });

  // Lista cobros
  const lista = document.getElementById('ucob-lista');
  if (lista) {
    lista.innerHTML = delMes.length ? delMes.map(c=>`
      <div class="cobro-card">
        <div class="cobro-card-left">
          <div class="cobro-nombre">${esc(c.cliente)}</div>
          <div class="cobro-meta">${c.terreno||'—'} · ${c.categoriaNombre||'—'}</div>
          ${c.obs?`<div style="font-size:var(--fs-sm);color:var(--gris);font-style:italic;">${esc(c.obs)}</div>`:''}
        </div>
        <div class="cobro-monto">
          <div class="cobro-monto-val">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div class="cobro-monto-label">${c.fecha||c.fechaCarga||''}</div>
        </div>
      </div>`).join('')
    : '<div class="empty-state">Sin cobros registrados este mes.</div>';
  }
}

function renderExpensasUsuario() {
  if (!asesorActual) return;
  const mes  = mesActual();
  const anio = anioActual();
  const misExp = cobrosData.filter(c => (c.asesorKey===asesorActual._key||c.asesor===asesorActual.nombre) && c.tipoMeta==='expensas');
  const delMes = misExp.filter(c=>c.mes===mes&&c.anio===anio);
  const total  = delMes.reduce((s,c)=>s+(c.monto||0),0);
  const hist   = misExp.reduce((s,c)=>s+(c.monto||0),0);

  setText('uexp-mes-total', 'Bs '+total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  setText('uexp-mes-n', delMes.length+' cobros');
  setText('uexp-historico', 'Bs '+hist.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));

  window._fbListenMetas(anio, mes, metas => {
    const metaUser = metas?.['u_'+asesorActual._key+'_expensas']?.monto || metas?.expensas?.monto || 0;
    const pct = metaUser ? Math.round(total/metaUser*100) : 0;
    setText('uexp-meta-val', metaUser ? 'Bs '+Number(metaUser).toLocaleString('es-BO') : '—');
    setText('uexp-meta-pct', metaUser ? pct+'% alcanzado' : 'sin meta');
    setText('uexp-meta-pct-txt', pct+'%');
    const bar = document.getElementById('uexp-meta-bar');
    if (bar) bar.style.width = Math.min(pct,100)+'%';
  });

  const lista = document.getElementById('uexp-lista');
  if (lista) {
    lista.innerHTML = delMes.length ? delMes.map(c=>`
      <div class="cobro-card">
        <div class="cobro-card-left">
          <div class="cobro-nombre">${esc(c.cliente)}</div>
          <div class="cobro-meta">${c.terreno||'—'} · ${c.fecha||''}</div>
        </div>
        <div class="cobro-monto">
          <div class="cobro-monto-val">Bs ${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
      </div>`).join('')
    : '<div class="empty-state">Sin expensas este mes.</div>';
  }
}

function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

/* ══ METAS POR USUARIO (vista admin) ══ */
function renderMetasPorUsuario() {
  const mes  = mesActual();
  const anio = anioActual();
  const cont = document.getElementById('metas-por-usuario');
  if (!cont) return;

  const lbl2 = document.getElementById('meta-mes-label-2');
  if (lbl2) lbl2.textContent = mes + ' ' + anio;

  const cobUsers = {};
  cobrosData.filter(c=>c.mes===mes&&c.anio===anio&&c.sumaMeta==='SI').forEach(c=>{
    const k = c.asesorKey || c.asesor || 'Sin asignar';
    if (!cobUsers[k]) cobUsers[k] = { nombre: c.asesor||k, cartera:0, expensas:0 };
    if (c.tipoMeta==='cartera')  cobUsers[k].cartera  += (c.monto||0);
    if (c.tipoMeta==='expensas') cobUsers[k].expensas += (c.monto||0);
  });

  const totalCob = Object.values(cobUsers).reduce((s,u)=>s+u.cartera+u.expensas,0);
  const usuariosConCobros = Object.keys(cobUsers).length;

  window._fbListenMetas(anio, mes, metas => {
    const metaGlobal = (metas?.cartera?.monto||0) + (metas?.expensas?.monto||0);
    const pctGlobal  = metaGlobal ? Math.round(totalCob/metaGlobal*100) : 0;

    setText('ger-total-cobrado', '$'+totalCob.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
    setText('ger-meta-global', metaGlobal ? '$'+metaGlobal.toLocaleString('es-BO') : '—');
    setText('ger-meta-pct-txt', pctGlobal+'% alcanzado');
    setText('ger-usuarios-activos', usuariosConCobros + '/' + asesores.length);
    setText('ger-barra-pct', pctGlobal+'%');
    const bar = document.getElementById('ger-barra');
    if (bar) { bar.style.width=Math.min(pctGlobal,100)+'%'; bar.style.background=pctGlobal>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pctGlobal>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--cartera),var(--cartera-light))'; }

    // Cards por asesor
    if (!asesores.length) { cont.innerHTML='<div class="empty-state">Sin usuarios registrados.</div>'; return; }
    cont.innerHTML = asesores.map(a => {
      const key = a._key;
      const u = cobUsers[key] || cobUsers[a.nombre] || { cartera:0, expensas:0 };
      const metaCob = metas?.['u_'+key+'_cartera']?.monto || metas?.cartera?.monto || 0;
      const metaExp = metas?.['u_'+key+'_expensas']?.monto || metas?.expensas?.monto || 0;
      const pctC = metaCob ? Math.round(u.cartera/metaCob*100) : 0;
      const pctE = metaExp ? Math.round(u.expensas/metaExp*100) : 0;
      const rolInfo = ROL_LABELS[a.rol] || ROL_LABELS.ventas;
      const hasActivity = u.cartera > 0 || u.expensas > 0;

      return `<div class="meta-asesor-card ${hasActivity?'meta-activa':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--sp-2);">
          <div>
            <div class="meta-asesor-nombre">${esc(a.nombre)}</div>
            <div class="meta-asesor-rol">
              <span class="rol-badge" style="background:${rolInfo.bg};color:${rolInfo.color};">${rolInfo.icon} ${rolInfo.label}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--fs-xl);font-weight:700;color:var(--cartera);font-family:'Cormorant Garamond',serif;">
              $${(u.cartera+u.expensas).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
            <div style="font-size:var(--fs-xs);color:var(--gris);">total cobrado ${mes}</div>
          </div>
        </div>
        ${metaCob>0 ? `<div class="meta-barra-wrap">
          <div class="meta-barra-row">
            <span>💰 Cartera: $${u.cartera.toLocaleString('es-BO',{maximumFractionDigits:0})}</span>
            <span style="color:${pctC>=100?'var(--ok)':pctC>=75?'var(--warn)':'var(--danger)'};font-weight:600;">${pctC}% de $${Number(metaCob).toLocaleString('es-BO',{maximumFractionDigits:0})}</span>
          </div>
          <div class="meta-barra-track">
            <div class="meta-barra-fill" style="width:${Math.min(pctC,100)}%;background:${pctC>=100?'var(--ok)':pctC>=75?'var(--warn)':'var(--danger)'};"></div>
          </div>
        </div>` : ''}
        ${metaExp>0 ? `<div class="meta-barra-wrap">
          <div class="meta-barra-row">
            <span>🏘 Expensas: $${u.expensas.toLocaleString('es-BO',{maximumFractionDigits:0})}</span>
            <span style="color:${pctE>=100?'var(--ok)':pctE>=75?'var(--warn)':'var(--danger)'};font-weight:600;">${pctE}% de $${Number(metaExp).toLocaleString('es-BO',{maximumFractionDigits:0})}</span>
          </div>
          <div class="meta-barra-track">
            <div class="meta-barra-fill" style="width:${Math.min(pctE,100)}%;background:${pctE>=100?'var(--ok)':pctE>=75?'var(--warn)':'var(--accent)'};"></div>
          </div>
        </div>` : ''}
        ${!metaCob&&!metaExp ? '<div style="font-size:var(--fs-sm);color:var(--gris);margin-top:4px;">Sin meta asignada este mes</div>' : ''}
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6;display:flex;gap:var(--sp-2);flex-wrap:wrap;">
          <button onclick="asignarMetaUsuario('${key}','${escJs(a.nombre)}')" style="font-size:var(--fs-sm);padding:5px 12px;background:var(--verde-bg);color:var(--verde);border:1px solid #6ee7b7;border-radius:var(--r-sm);cursor:pointer;">🎯 Asignar meta</button>
        </div>
      </div>`;
    }).join('');
  });
}

function asignarMetaUsuario(key, nombre) {
  const a   = asesores.find(x=>x._key===key);
  const rol = a?.rol || 'ventas';
  const mes  = mesActual();
  const anio = anioActual();

  if (rol === 'ventas') {
    const metaV = prompt('Meta de VISITAS para ' + nombre + ' (numero de visitas):');
    const metaC = prompt('Meta de CIERRES para ' + nombre + ' (numero de cierres):');
    if (metaV !== null && metaV.trim()) window._fbSetMetaUsuario(key, anio, mes, 'visitas', parseFloat(metaV));
    if (metaC !== null && metaC.trim()) window._fbSetMetaUsuario(key, anio, mes, 'cierres', parseFloat(metaC));
  } else if (rol === 'marketing') {
    const metaL = prompt('Meta de LEADS para ' + nombre + ':');
    const metaV = prompt('Meta de VISITAS para ' + nombre + ':');
    const metaC = prompt('Meta de CIERRES para ' + nombre + ':');
    if (metaL !== null && metaL.trim()) window._fbSetMetaUsuario(key, anio, mes, 'leads',   parseFloat(metaL));
    if (metaV !== null && metaV.trim()) window._fbSetMetaUsuario(key, anio, mes, 'visitas', parseFloat(metaV));
    if (metaC !== null && metaC.trim()) window._fbSetMetaUsuario(key, anio, mes, 'cierres', parseFloat(metaC));
  } else if (rol === 'cobranza') {
    const metaM = prompt('Meta de CARTERA para ' + nombre + ' (en $):');
    if (metaM !== null && metaM.trim()) window._fbSetMetaUsuario(key, anio, mes, 'cartera', parseFloat(metaM));
  } else if (rol === 'expensas') {
    const metaE = prompt('Meta de EXPENSAS para ' + nombre + ' (en $):');
    if (metaE !== null && metaE.trim()) window._fbSetMetaUsuario(key, anio, mes, 'expensas', parseFloat(metaE));
  } else {
    const metaCob = prompt('Meta de CARTERA para ' + nombre + ' (en $):');
    const montoExp = prompt('Meta de EXPENSAS para ' + nombre + ' (en $):');
    if (metaCob !== null && metaCob.trim()) window._fbSetMetaUsuario(key, anio, mes, 'cartera', parseFloat(metaCob));
    if (montoExp !== null && montoExp.trim()) window._fbSetMetaUsuario(key, anio, mes, 'expensas', parseFloat(montoExp));
  }
  setTimeout(renderMetasPorUsuario, 500);
}

/* ═══════════════════════════════════════════
   COBRANZA MANUAL — VARIABLES
═══════════════════════════════════════════ */
let cobrosData        = [];
let expensasManualData= [];
let categoriasData    = [];
let excelPendiente    = [];
let leadsData         = [];   // leads marketing
let campaniasData          = [];   // códigos de campaña (marketing)
let visitasProgramadasData = [];   // visitas agendadas por call center (todas, vista admin/callcenter)
let misVisitasProgramadas  = [];   // las que le tocan al asesor logueado (pendientes de confirmar)
let asesoresVentaData      = [];   // asesores con módulo 'ventas', para el select del call center

/* ═══════════════════════════════════════════
   CÓDIGOS DE CAMPAÑA (Marketing)
═══════════════════════════════════════════ */
function renderCampanias() {
  const cont = document.getElementById('mkt-campanias-lista');
  if (cont) {
    const cuenta = {}; campaniasData.forEach(c => { const k = _mkpNormCode(c.codigo); cuenta[k] = (cuenta[k]||0) + 1; });
    cont.innerHTML = campaniasData.length ? [...campaniasData].sort((a,b) => (a.activa===false) - (b.activa===false)).map(c => `
      <div class="vendor-item" style="${c.activa === false ? 'opacity:.55;' : ''}">
        <span class="v-name">📣 ${esc(c.nombre)} <span style="color:var(--gris);font-weight:400;font-family:monospace;">[${esc(c.codigo)}]</span>
          ${cuenta[_mkpNormCode(c.codigo)] > 1 ? '<span style="color:var(--danger);font-size:var(--fs-xs);font-weight:700;" title="Este código está creado más de una vez: pedí eliminar el sobrante">⚠ código repetido</span>' : ''}
          ${c.activa === false ? '<span style="font-size:var(--fs-xs);color:var(--gris);">· archivada</span>' : ''}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn-secondary btn-sm" style="padding:4px 10px;" onclick="mkpArchivarCampania('${c._key}', ${c.activa === false})">${c.activa === false ? 'Reactivar' : 'Archivar'}</button>
          <button class="btn-remove-vendor" onclick="solicitarEliminacion('campanias/${c._key}','Campaña ${escJs(c.nombre)} [${escJs(c.codigo)}]')">×</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Sin campañas creadas.</div>';
    if (typeof mkpRefrescar === 'function') mkpRefrescar();
  }
  // Poblar selects que dependen de las campañas
  ['mkt-lead-campania','cc-campania','mkt-sem-campania'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = '<option value="">'+(id==='mkt-sem-campania'?'Elegir...':'Sin campaña')+'</option>' +
      campaniasData.filter(c => c.activa !== false || c.codigo === actual).map(c => `<option value="${esc(c.codigo)}">${esc(c.nombre)} [${esc(c.codigo)}]</option>`).join('');
    sel.value = actual;
  });
}

async function agregarCampania() {
  const nombre = document.getElementById('mkt-campania-nombre').value.trim();
  const codigo = _mkpNormCode(document.getElementById('mkt-campania-codigo').value);
  if (!nombre || !codigo) { toastErr('Completá nombre y código de la campaña.'); return; }
  if (!/^[A-Z0-9_-]+$/.test(codigo)) { toastErr('El código solo puede tener letras, números, guion o guion bajo (sin espacios ni acentos).'); return; }
  const yaCod = campaniasData.find(c => _mkpNormCode(c.codigo) === codigo);
  if (yaCod) { toastErr('Ya existe el código ' + codigo + ' (' + yaCod.nombre + ')' + (yaCod.activa === false ? ' — está archivado, reactivalo en vez de crearlo de nuevo.' : '.')); return; }
  // Una misma campaña puede tener varios códigos (uno por conjunto de anuncios o semana): el nombre se puede repetir, el código no.
  if (/^\d{4}-[A-Za-z0-9_-]+$/.test(nombre) && !/\d/.test(codigo)) {
    toastErr('Parece que el nombre y el código están invertidos: el código va en la casilla corta de la derecha.'); return;
  }
  const mismos = campaniasData.filter(c => (c.nombre||'').trim().toLowerCase() === nombre.toLowerCase()).length;
  await window._fbPushCampania({ nombre, codigo });
  document.getElementById('mkt-campania-nombre').value = '';
  document.getElementById('mkt-campania-codigo').value = '';
  toastOk('Código ' + codigo + ' creado' + (mismos ? ' (la campaña "' + nombre + '" ya tiene ' + (mismos + 1) + ' códigos)' : ' para la campaña "' + nombre + '"') + '.');
}

/* ═══════════════════════════════════════════
   LEADS SEMANALES POR CAMPAÑA (carga agregada)
═══════════════════════════════════════════ */
let leadsSemanalesData = [];

async function guardarLeadsSemanales() {
  const codigo = document.getElementById('mkt-sem-campania').value;
  const desde  = document.getElementById('mkt-sem-desde').value;
  const hasta  = document.getElementById('mkt-sem-hasta').value;
  const cantidad = parseInt(document.getElementById('mkt-sem-cantidad').value) || 0;
  if (!codigo)  { toastErr('Elegí el código de campaña.'); return; }
  if (!desde || !hasta) { toastErr('Completá el rango de fechas.'); return; }
  if (!cantidad) { toastErr('Poné cuántos leads llegaron.'); return; }

  const camp = campaniasData.find(c => c.codigo === codigo);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const fDesde = new Date(desde+'T00:00:00');
  const mes = meses[fDesde.getMonth()];
  const anio = fDesde.getFullYear();

  const btn = document.querySelector('[onclick="guardarLeadsSemanales()"]');
  btnLoading(btn, true);
  await window._fbPushLeadsSemanal({
    campaniaCodigo: codigo, campaniaNombre: camp?.nombre||'',
    desde, hasta, cantidad, mes, anio,
    cargadoPor: asesorActual?.nombre || 'Marketing',
  });
  btnSuccess(btn);
  toastOk(cantidad + ' leads cargados para ' + codigo + '.');
  document.getElementById('mkt-sem-cantidad').value = '';
}

function renderLeadsSemanales() {
  if (typeof mkpRefrescar === 'function') mkpRefrescar();
  if (document.getElementById('mkt-leads-n') && document.getElementById('utab-marketing')) { try { renderMarketing(); } catch (e) {} }
  const tbody = document.getElementById('mkt-sem-tbody');
  if (!tbody) return;
  if (!leadsSemanalesData.length) { tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Sin cargas semanales.</div></td></tr>'; return; }
  tbody.innerHTML = leadsSemanalesData.map(l => `<tr>
    <td style="font-weight:600;font-family:monospace;">${esc(l.campaniaCodigo)}</td>
    <td style="font-size:var(--fs-sm);">${esc(l.desde)} → ${esc(l.hasta)}</td>
    <td style="font-weight:600;color:var(--info);">${l.cantidad}</td>
    <td><button class="btn-del" onclick="solicitarEliminacion('leads_semanales/${l._key}','${l.cantidad} leads de ${escJs(l.campaniaCodigo)} (${escJs(l.desde)} a ${escJs(l.hasta)})')">🗑</button></td>
  </tr>`).join('');
}
let leadsExcelPend    = [];   // leads pendientes import
let cobranzaExcelData = [];   // cobranza subida por excel
let cobranzaExcelPend = [];   // cobranza pendiente import

/* ═══════════════════════════════════════════
   MARKETING — LEADS
═══════════════════════════════════════════ */
function switchMktTab(id) {
  document.getElementById('mkt-form-cargar').style.display = id==='cargar' ? 'block' : 'none';
  document.getElementById('mkt-form-excel').style.display  = id==='excel'  ? 'block' : 'none';
}

async function guardarLead() {
  const nombre = document.getElementById('mkt-lead-nombre')?.value.trim();
  if (!nombre) { toastErr('El nombre del lead es obligatorio.'); return; }
  const mes = document.getElementById('mkt-lead-mes')?.value || PC_MESES[new Date().getMonth()];
  const btnLd = document.querySelector('[onclick="guardarLead()"]');
  btnLoading(btnLd, true);
  try {
    await window._fbPushLead({
      nombre,
      telefono:  document.getElementById('mkt-lead-tel')?.value.trim() || '',
      fuente:    document.getElementById('mkt-lead-fuente')?.value || '',
      campaniaCodigo: document.getElementById('mkt-lead-campania')?.value || '',
      semana:    document.getElementById('mkt-lead-semana')?.value || 'S1',
      mes,
      anio:      new Date().getFullYear(),
      estado:    document.getElementById('mkt-lead-estado')?.value || 'Nuevo',
      obs:       document.getElementById('mkt-lead-obs')?.value.trim() || '',
      cargadoPor: asesorActual?.nombre || 'Admin',
      fechaCarga: new Date().toLocaleString('es-BO'),
    });
    btnSuccess(btnLd);
    ['mkt-lead-nombre','mkt-lead-tel','mkt-lead-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const sb = document.getElementById('mkt-lead-success');
    if (sb) { sb.style.display='block'; setTimeout(()=>sb.style.display='none',2500); }
  } catch(e) {
    btnLoading(btnLd, false);
    toastErr('No se pudo guardar el lead: ' + (e.message||'revisa tu conexion.'));
  }
}

function renderMarketing() {
  const mes  = mesActual();
  const anio = anioActual();
  const filS  = document.getElementById('mkt-fil-semana')?.value || '';
  const filM  = document.getElementById('mkt-fil-mes')?.value || '';
  const filE  = document.getElementById('mkt-fil-estado')?.value || '';

  const delMes = leadsData.filter(l => l.mes===mes && l.anio===anio);
  // Visitas: registros de ventas del mes que vienen de leads (origen Facebook/CRM/Instagram)
  const fuentesLeads = ['Facebook Ads','Instagram','CRM','WhatsApp','Web','Facebook'];
  const visitasDeLeads = visitasComoRegs(todosRegs).filter(r =>
    r.mes===mes && fuentesLeads.some(f => ((r.origen||r.procedencia)||'').toLowerCase().includes(f.toLowerCase()))
  );
  const cierres = todosRegs.filter(r => r.mes===mes && (r.conclusion==='Reserva' || r.huboCierre==='SI'));

  // Mismo número de leads que ve Gerencia (planilla por campaña, depurada); si no hay planilla, los leads uno-a-uno
  const leadsMes = calcularFunnelDatos(mes, anio)[0].n;
  setText('mkt-leads-n',    leadsMes);
  setText('mkt-visitas-n',  visitasDeLeads.length);
  setText('mkt-cierres-n',  cierres.length);
  const convPct = leadsMes ? Math.round(cierres.length/leadsMes*100) : 0;
  setText('mkt-conv-pct', convPct+'%');

  // Metas marketing
  window._fbListenMetaUsuario(asesorActual?._key||'mkt', anio, mes, metas => {
    const metaLeads   = metas?.leads?.monto || 0;
    const metaVisitas = metas?.visitas?.monto || 0;
    const metaCierres = metas?.cierres?.monto || 0;
    updateMetaBarra('mkt-leads',   leadsMes,              metaLeads,   'var(--info)');
    updateMetaBarra('mkt-visitas', visitasDeLeads.length, metaVisitas, 'var(--warn)');
    updateMetaBarra('mkt-cierres', cierres.length,        metaCierres, 'var(--ok)');
  });

  // Embudo
  const emEl = document.getElementById('mkt-embudo');
  if (emEl) {
    const etapas = [
      { label:'Leads captados', n: leadsMes, color:'var(--info)' },
      { label:'Visitas realizadas', n: visitasDeLeads.length, color:'var(--warn)' },
      { label:'Cierres / Reservas', n: cierres.length, color:'var(--ok)' },
    ];
    const max = Math.max(...etapas.map(e=>e.n), 1);
    emEl.innerHTML = etapas.map((e,i) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-base);margin-bottom:4px;">
          <span style="font-weight:500;">${e.label}</span>
          <span style="font-weight:700;color:${e.color};">${e.n}${i>0&&etapas[i-1].n>0?' ('+Math.round(e.n/etapas[i-1].n*100)+'%)':''}</span>
        </div>
        <div style="height:28px;background:var(--fill);border-radius:var(--r-sm);overflow:hidden;">
          <div style="height:100%;width:${e.n/max*100}%;background:${e.color};border-radius:var(--r-sm);display:flex;align-items:center;padding-left:8px;transition:width .5s;">
            ${e.n>0?`<span style="color:#fff;font-size:var(--fs-xs);font-weight:600;">${e.n}</span>`:''}
          </div>
        </div>
      </div>`).join('');
  }

  // Filtros lista leads
  let datos = leadsData;
  if (filS) datos = datos.filter(l=>l.semana===filS);
  if (filM) datos = datos.filter(l=>l.mes===filM);
  if (filE) datos = datos.filter(l=>l.estado===filE);
  renderLeads(datos);
}

function renderLeads(datos) {
  if (!datos) {
    const filS = document.getElementById('mkt-fil-semana')?.value||'';
    const filM = document.getElementById('mkt-fil-mes')?.value||'';
    const filE = document.getElementById('mkt-fil-estado')?.value||'';
    datos = leadsData.filter(l=>{
      if(filS&&l.semana!==filS)return false;
      if(filM&&l.mes!==filM)return false;
      if(filE&&l.estado!==filE)return false;
      return true;
    });
  }
  const cont = document.getElementById('mkt-leads-lista');
  if (!cont) return;
  const estColor = { Nuevo:'var(--info)', Contactado:'var(--warn)', Agendado:'var(--ok)', Descartado:'var(--danger)' };
  cont.innerHTML = datos.length ? datos.map(l => `
    <div class="cobro-card">
      <div class="cobro-card-left">
        <div class="cobro-nombre">${esc(l.nombre)}</div>
        <div class="cobro-meta">${l.telefono||'—'} · ${l.fuente||'—'} · ${l.semana||''} ${l.mes||''}</div>
        ${l.obs?`<div style="font-size:var(--fs-sm);color:var(--gris);font-style:italic;">${esc(l.obs)}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <select onchange="actualizarEstadoLead('${l._key}',this.value)" style="padding:4px 8px;border:1.5px solid ${estColor[l.estado]||'#e5e7eb'};border-radius:var(--r-sm);font-size:var(--fs-sm);color:${estColor[l.estado]||'#374151'};font-family:'DM Sans',sans-serif;background:#fff;">
          <option value="Nuevo"      ${l.estado==='Nuevo'?'selected':''}>Nuevo</option>
          <option value="Contactado" ${l.estado==='Contactado'?'selected':''}>Contactado</option>
          <option value="Agendado"   ${l.estado==='Agendado'?'selected':''}>Agendado</option>
          <option value="Descartado" ${l.estado==='Descartado'?'selected':''}>Descartado</option>
        </select>
        <button onclick="window._fbRemoveLead('${l._key}')" class="btn-del" style="font-size:var(--fs-xs);">🗑</button>
      </div>
    </div>`).join('')
  : '<div class="empty-state">Sin leads con los filtros aplicados.</div>';
}

async function actualizarEstadoLead(key, estado) {
  await window._fbUpdateLead(key, { estado });
}

function descargarPlantillaLeads() {
  const rows = [{ 'Nombre':'Ejemplo Cliente','Teléfono':'+591 70000000','Fuente':'Facebook Ads','Semana':'S1','Mes':'Mayo','Estado':'Nuevo','Observaciones':'Lead de campaña mayo' }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'plantilla_leads.xlsx');
}

function procesarExcelLeads(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    leadsExcelPend = rows.map(r=>({
      nombre:    String(r['Nombre']||'').trim(),
      telefono:  String(r['Teléfono']||r['Telefono']||'').trim(),
      fuente:    String(r['Fuente']||'').trim() || 'Facebook Ads',
      semana:    String(r['Semana']||'S1').trim(),
      mes:       String(r['Mes']||'').trim(),
      anio:      new Date().getFullYear(),
      estado:    String(r['Estado']||'Nuevo').trim(),
      obs:       String(r['Observaciones']||'').trim(),
      cargadoPor: asesorActual?.nombre || 'Admin',
      fechaCarga: new Date().toLocaleString('es-BO'),
    })).filter(r=>r.nombre);
    setText('mkt-preview-count', leadsExcelPend.length);
    const tbody = document.getElementById('mkt-preview-body');
    if (tbody) tbody.innerHTML = leadsExcelPend.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.nombre)}</td><td>${r.telefono}</td><td>${r.fuente}</td><td>${r.semana}</td><td>${r.mes}</td><td>${r.estado}</td></tr>`).join('');
    const prev = document.getElementById('mkt-excel-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarImportLeads() {
  let ok=0;
  for (const r of leadsExcelPend) { try { await window._fbPushLead(r); ok++; } catch(e){} }
  toastOk(ok + ' leads importados.');
  cancelarImportLeads();
}

function cancelarImportLeads() {
  leadsExcelPend = [];
  const prev = document.getElementById('mkt-excel-preview');
  if (prev) prev.style.display = 'none';
  const inp = document.getElementById('mkt-excel-file');
  if (inp) inp.value = '';
}
/* ═══════════════════════════════════════════
   CARTERA — VARIABLES
═══════════════════════════════════════════ */
let cartaMetaData  = [];   // clientes en meta mensual
let cartaCobroData = [];   // cobros registrados
let catCarteraData = [];   // categorías libres — Cartera
let catExpensasData = [];  // categorías libres — Expensas (independientes de Cartera)
let cartaAdminData = [];   // legacy compat
let cartaAdminPend = [];   // pendientes importación Excel
let metaExcelPend  = [];   // pendientes Excel meta
let expAdminData   = [];   // cobros expensas admin

/* ═══════════════════════════════════════════
   HELPERS — Importador Excel "Arqueo de Caja" (Orange)
═══════════════════════════════════════════ */
const MESES_ES_NUM = {
  ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6,
  JULIO:7, AGOSTO:8, SEPTIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12
};
const MESES_ES_NOMBRE = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// "637,50" o "1.234,56" (formato boliviano: punto=miles, coma=decimal) → 637.5
function parseMontoBO(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).trim().replace(/[^\d,.\-]/g,'');
  if (!s) return 0;
  return parseFloat(s.replace(/\./g,'').replace(',', '.')) || 0;
}

// Extrae mes/año/tipo de pago del texto "Concepto" del Arqueo de Caja
// Ej: "Expensas (JULIO 2026)" | "Pago parcial de la Expensas (AGOSTO 2026)" | "Pago Final de la Expensas (JUNIO 2026)"
function parseConceptoExpensa(texto) {
  if (!texto) return null;
  const m = String(texto).match(/Expensas\s*\(\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})\s*\)/i);
  if (!m) return null;
  const mesNombre = m[1].toUpperCase().replace('Á','A').replace('É','E').replace('Í','I').replace('Ó','O').replace('Ú','U').replace('Ñ','N');
  const mesNum = MESES_ES_NUM[mesNombre];
  if (!mesNum) return null;
  const tipoPago = /pago\s*parcial/i.test(texto) ? 'parcial' : /pago\s*final/i.test(texto) ? 'final' : 'completo';
  return { mesNum, anio: parseInt(m[2],10), tipoPago };
}

// Número de semana ISO-8601 de una fecha
function semanaISO(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Convierte serial de Excel o Date a objeto Date de JS
function excelFechaToDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// Estado real de mora: compara el ÚLTIMO período pagado por el lote contra el mes actual.
// Vigente = pagó dentro del mismo mes en que vence (0 meses de atraso).
// Mora 1-30 = se atrasó 1 mes completo. Mora 31-60 = 2 meses. Mora 61-90 = 3 meses. Mora +91 = 4 meses o más.
// periodos: array de {mesNum, anio}
// Estado de UN pago puntual: compara el mes en que se PAGÓ contra el mes de la CUOTA que salda.
// Esto es lo correcto para clasificar cada fila del historial (ej. la cuota de Febrero 2026
// pagada en Agosto 2026 quedó con 6 meses de atraso → Mora +91), a diferencia del estado
// "actual" del cliente (calcularEstadoExpensa), que compara contra HOY y sirve para el
// resumen del lote (¿está al día ahora?), no para clasificar pagos históricos individuales.
/* ═══════════════════════════════════════════
   ESTADO DE MORA EN VIVO — Orange (de acá en adelante, reemplaza el Excel semanal)
═══════════════════════════════════════════ */
// Antes iba directo a Orange (http://) — el navegador lo bloqueaba porque nuestro sistema
// vive en https:// y no deja mezclar contenido inseguro dentro de una página segura
// ("contenido mixto"), aparte del bloqueo de CORS. Por eso pasa por este puente propio
// (Cloudflare Worker) que le habla a Orange por detrás y nos devuelve la respuesta en https.
const ORANGE_API_URL = 'https://proud-tooth-742a.uv-cartera.workers.dev';
let orangeMoraData = [];
let orangeCarteraData = [];
let orangeCarteraAgregados = null;
let carteraCategoriasData = {};

function estadoPorDiasMora(dias) {
  dias = dias || 0;
  if (dias <= 0)  return 'Vigente';
  if (dias <= 30) return 'Mora 1-30';
  if (dias <= 60) return 'Mora 31-60';
  if (dias <= 90) return 'Mora 61-90';
  if (dias <= 180) return 'Mora 91-180';
  return 'Mora +180';
}

/* ═══════════════════════════════════════════
   COBRANZA DE EXPENSAS EN VIVO — mismo criterio que Cartera:
   Fecha de pago + monto, ignorando Estado de Cuota y Estado de Pago.
═══════════════════════════════════════════ */
let orangeExpensasDetalleRaw = [];
let expensasCategoriasData = {};
let expFilAnio = new Date().getFullYear();
let expFilMes  = PC_MESES[new Date().getMonth()]; // lista fija — este era el causante directo de que la meta no apareciera: el mes inicial venía del idioma del navegador y no coincidía carácter por carácter con "Septiembre" del <option>, así que la ruta de Firebase para guardar y para leer la meta terminaban siendo distintas sin que se viera ningún error
let expFilGestion = _gestionActual();

const EXPENSAS_CATEGORIAS = ['Vigente', 'Mora', 'Adelanto', 'Otros Ingresos'];

function cambiarFiltroExpensas() {
  expFilAnio = parseInt(document.getElementById('fil-exp-anio').value);
  expFilMes  = document.getElementById('fil-exp-mes-global').value;
  expFilGestion = parseInt(document.getElementById('fil-exp-gestion').value);
  renderCobranzaExpensasKPIs(); // mantiene poblados los selectores de Año/Gestión
  renderDashboardExpensas();
  renderResumenMensualExpensas();
  renderSemanalExpensas();
}

let _autoSyncExpensasOrangeInterval = null;
function iniciarAutoSyncExpensasOrange() {
  if (_autoSyncExpensasOrangeInterval) return;
  _autoSyncExpensasOrangeInterval = setInterval(() => { cargarDetalleExpensas(true); }, ORANGE_AUTOSYNC_MIN * 60 * 1000);
}


