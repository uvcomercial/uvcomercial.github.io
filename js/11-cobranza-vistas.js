/* ═══════════════════════════════════════════
   VISTA — Detalle por cliente/lote (histórico semanal)
═══════════════════════════════════════════ */
function cambiarVistaExpensas(vista) {
  const btnC = document.getElementById('exp-vista-cobros-btn');
  const btnD = document.getElementById('exp-vista-detalle-btn');
  const listaC = document.getElementById('exp-cobros-lista');
  const listaD = document.getElementById('exp-detalle-lista');
  const on  = {background:'#fff', color:'var(--ink-900)', boxShadow:'var(--shadow-xs)'};
  const off = {background:'transparent', color:'var(--gris)', boxShadow:'none'};
  if (vista === 'detalle') {
    Object.assign(btnD.style, on); Object.assign(btnC.style, off);
    listaC.style.display = 'none'; listaD.style.display = 'block';
    renderDetalleExpensasPorCliente();
  } else {
    Object.assign(btnC.style, on); Object.assign(btnD.style, off);
    listaD.style.display = 'none'; listaC.style.display = 'block';
  }
}

function buscarClienteExpensas() {
  const term = document.getElementById('exp-buscar-cliente')?.value || '';
  renderDetalleExpensasPorCliente(term);
}

function renderDetalleExpensasPorCliente(searchTerm) {
  const cont = document.getElementById('exp-detalle-lista-body');
  if (!cont) return;
  if (!expAdminData.length) { cont.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

  // Agrupar por lote (terreno)
  const porLote = {};
  expAdminData.forEach(e => {
    const key = e.terreno || e.cliente;
    (porLote[key] ||= { cliente:e.cliente, terreno:e.terreno, registros:[] }).registros.push(e);
  });

  let grupos = Object.values(porLote).sort((a,b)=> (a.cliente||'').localeCompare(b.cliente||''));

  const term = (searchTerm||'').trim().toLowerCase();
  if (term) {
    grupos = grupos.filter(g =>
      (g.cliente||'').toLowerCase().includes(term) || (g.terreno||'').toLowerCase().includes(term));
    if (!grupos.length) {
      cont.innerHTML = `<div class="empty-state" style="padding:24px;">
        🆕 <b>Cliente 1er pago</b> — no se encontró "${esc(searchTerm)}" en ningún registro cargado hasta ahora.
        <br><span style="font-size:var(--fs-sm);">Si acaba de pagar por primera vez, cuando lo cargues quedará marcado así automáticamente.</span>
      </div>`;
      return;
    }
  }

  cont.innerHTML = grupos.map((g, idx) => {
    const periodos = g.registros.filter(r=>r.mesPeriodoNum && r.anioPeriodo).map(r=>({mesNum:r.mesPeriodoNum, anio:r.anioPeriodo}));
    const estado = periodos.length ? calcularEstadoExpensa(periodos) : 'Sin gestión';
    const totalPagado = g.registros.reduce((s,r)=>s+(r.monto||0),0);
    const esPrimerPago = periodos.length === 1;
    const filas = [...g.registros].sort((a,b)=>{
      const pa = (a.anioPeriodo||a.anio||0)*12+(a.mesPeriodoNum||0);
      const pb = (b.anioPeriodo||b.anio||0)*12+(b.mesPeriodoNum||0);
      return pb - pa;
    });
    return `
      <div class="admin-section" style="margin-bottom:10px;padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="const el=document.getElementById('exp-det-${idx}'); el.style.display = el.style.display==='none'?'block':'none';">
          <div>
            <div style="font-weight:600;">${esc(g.cliente)} ${_pintarEstadoExp(estado)} ${esPrimerPago?'<span style="padding:2px 8px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;background:var(--info)22;color:var(--info);">🆕 Cliente 1er pago</span>':''}</div>
            <div style="font-size:var(--fs-sm);color:var(--gris);">Lote ${esc(g.terreno||'—')} · ${g.registros.length} período(s) registrado(s)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:600;color:var(--cartera);">Bs ${totalPagado.toLocaleString('es-BO',{minimumFractionDigits:2})}</div>
            <div style="font-size:var(--fs-xs);color:var(--gris);">total histórico ▾</div>
          </div>
        </div>
        <div id="exp-det-${idx}" style="display:none;margin-top:12px;">
          <div class="tabla-wrap">
            <table><thead><tr><th>Cuota pagada</th><th>Fecha de pago</th><th>Monto</th><th>Tipo</th><th>Categoría</th></tr></thead>
            <tbody>
              ${filas.map(r=>`<tr>
                <td>${esc(r.cuotaLabel || ((r.mes||'')+' '+(r.anio||'')))}</td>
                <td>${esc(r.mes||'')} ${esc(String(r.anio||''))} <span style="color:var(--gris);font-size:var(--fs-xs);">(${esc(r.semana||'—')})</span></td>
                <td style="font-weight:600;">Bs ${(r.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</td>
                <td>${esc(r.tipoPago||'—')}</td>
                <td style="font-size:var(--fs-xs);">${esc(r.categoriaNombre||'—')}</td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        </div>
      </div>`;
  }).join('');
}

function exportarExpensasAdmin() {
  if (!expAdminData.length) { toastErr('Sin datos para exportar.'); return; }
  const rows = expAdminData.map(e=>({
    'Cliente':e.cliente,'Terreno':e.terreno,'Monto (Bs)':e.monto,
    'Semana':e.semana,'Mes':e.mes,'Año':e.anio,'Estado':e.estado||'','Categoría':e.categoriaNombre||'','Observaciones':e.obs
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Expensas');
  XLSX.writeFile(wb,`expensas_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   MARKETING — PANEL ADMIN
═══════════════════════════════════════════ */
function renderAdminMarketing() {
  const mes  = mesActual();
  const anio = anioActual();
  const filS  = document.getElementById('adm-fil-semana')?.value || '';
  const filM  = document.getElementById('adm-fil-mes-mkt')?.value || '';
  const filE  = document.getElementById('adm-fil-estado-mkt')?.value || '';

  renderCallCenterKPIs();

  // Label mes
  const lbl = document.getElementById('adm-mkt-mes-label');
  if (lbl) lbl.textContent = mes + ' ' + anio;

  const anioC = new Date().getFullYear();
  const delMes = leadsData.filter(l => l.mes===mes && l.anio===anio);
  const funnelData = calcularFunnelDatos(mes, anioC);
  const [etapaLeads, etapaAgendadas, etapaConcretadas, etapaCierres] = funnelData;

  // KPIs — mismos números que ve Marketing y el dashboard de Gerencia (calcularFunnelDatos)
  countUp(document.getElementById('adm-leads-total'), etapaLeads.n);
  setText('adm-leads-mes', 'este mes (' + mes + ')');
  countUp(document.getElementById('adm-visitas-total'), etapaConcretadas.n);
  countUp(document.getElementById('adm-cierres-total'), etapaCierres.n);
  const conv = etapaLeads.n ? Math.round(etapaCierres.n/etapaLeads.n*100) : 0;
  setText('adm-conv-pct', conv + '% conversion');

  // Metas
  window._fbListenMetas(anio, mes, metas => {
    const metaL = metas?.mkt_leads?.monto   || 0;
    const metaV = metas?.mkt_visitas?.monto || 0;
    const metaC = metas?.mkt_cierres?.monto || 0;
    const pctL = metaL ? Math.round(etapaLeads.n/metaL*100) : 0;
    const pctV = metaV ? Math.round(etapaConcretadas.n/metaV*100) : 0;
    const pctC = metaC ? Math.round(etapaCierres.n/metaC*100) : 0;

    setText('adm-leads-actual',    etapaLeads.n);
    setText('adm-leads-meta-txt',  metaL ? 'meta: '+metaL : 'meta: —');
    setText('adm-leads-pct',       pctL+'%');
    const bL = document.getElementById('adm-leads-bar');
    if (bL) bL.style.width = Math.min(pctL,100)+'%';

    setText('adm-visitas-actual',   etapaConcretadas.n);
    setText('adm-visitas-meta-txt', metaV ? 'meta: '+metaV : 'meta: —');
    setText('adm-visitas-pct',      pctV+'%');
    const bV = document.getElementById('adm-visitas-bar');
    if (bV) bV.style.width = Math.min(pctV,100)+'%';

    setText('adm-cierres-actual',   etapaCierres.n);
    setText('adm-cierres-meta-txt', metaC ? 'meta: '+metaC : 'meta: —');
    setText('adm-cierres-pct',      pctC+'%');
    const bC = document.getElementById('adm-cierres-bar');
    if (bC) bC.style.width = Math.min(pctC,100)+'%';
  });

  // Embudo — el mismo de 4 etapas que ve Marketing (Leads → Agendadas → Concretadas → Cierres)
  pintarFunnelEnDiv('adm-mkt-embudo', funnelData);
  renderTendenciaMarketing('adm-mkt-chart-tendencia');

  // Leads por campaña (fuente real: los códigos que carga Marketing)
  const fuentesEl = document.getElementById('adm-mkt-fuentes');
  if (fuentesEl) {
    const porCampania = {};
    leadsSemanalesDepurados().filter(l=>l.mes===mes && Number(l.anio)===anioC).forEach(l => {
      const k = _mkpNormCode(l.campaniaCodigo) || 'Sin campaña';
      porCampania[k] = (porCampania[k]||0) + (l.cantidad||0);
    });
    if (!Object.keys(porCampania).length) {
      delMes.forEach(l => { porCampania[l.fuente||'Otro'] = (porCampania[l.fuente||'Otro']||0)+1; });
    }
    const maxF = Math.max(...Object.values(porCampania), 1);
    const colFuente = ['var(--info)','var(--warn)','var(--ok)','var(--accent)','var(--danger)','var(--warn-strong)'];
    fuentesEl.innerHTML = Object.entries(porCampania).sort((a,b)=>b[1]-a[1]).map(([f,n],i)=>`
      <div class="bar-item">
        <div class="bar-label"><span>${f}</span><span><strong>${n}</strong></span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${n/maxF*100}%;background:${colFuente[i%colFuente.length]};"></div></div>
      </div>`).join('') || '<div class="empty-state">Sin datos.</div>';
  }

  // Por semana
  const semanasEl = document.getElementById('adm-mkt-semanas');
  if (semanasEl) {
    const porSem = { S1:0, S2:0, S3:0, S4:0 };
    delMes.forEach(l => { if (l.semana && porSem[l.semana]!==undefined) porSem[l.semana]++; });
    const maxS = Math.max(...Object.values(porSem), 1);
    semanasEl.innerHTML = Object.entries(porSem).map(([s,n])=>`
      <div class="bar-item">
        <div class="bar-label"><span>${s}</span><span><strong>${n}</strong></span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${n/maxS*100}%;background:var(--info);"></div></div>
      </div>`).join('');
  }

  // Por estado
  const estadosEl = document.getElementById('adm-mkt-estados');
  if (estadosEl) {
    const porEst = {};
    delMes.forEach(l => { porEst[l.estado||'Nuevo'] = (porEst[l.estado||'Nuevo']||0)+1; });
    const colEst = { Nuevo:'var(--info)', Contactado:'var(--warn)', Agendado:'var(--ok)', Descartado:'var(--danger)' };
    const maxE = Math.max(...Object.values(porEst), 1);
    estadosEl.innerHTML = Object.entries(porEst).sort((a,b)=>b[1]-a[1]).map(([e,n])=>`
      <div class="bar-item">
        <div class="bar-label"><span>${e}</span><span><strong>${n}</strong></span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${n/maxE*100}%;background:${colEst[e]||'#6b7280'};"></div></div>
      </div>`).join('') || '<div class="empty-state">Sin datos.</div>';
  }

  // Tabla leads filtrada
  let datos = leadsData;
  if (filS) datos = datos.filter(l=>l.semana===filS);
  if (filM) datos = datos.filter(l=>l.mes===filM);
  if (filE) datos = datos.filter(l=>l.estado===filE);
  const tb = document.getElementById('adm-leads-tabla-body');
  if (tb) {
    tb.innerHTML = datos.length ? datos.map(l=>`<tr>
      <td><strong>${esc(l.nombre)}</strong></td>
      <td style="font-size:var(--fs-sm);">${l.telefono||'—'}</td>
      <td style="font-size:var(--fs-sm);">${l.fuente||'—'}</td>
      <td style="font-size:var(--fs-sm);text-align:center;">${l.semana||'—'}</td>
      <td style="font-size:var(--fs-sm);">${l.mes||'—'}</td>
      <td><select onchange="actualizarEstadoLead('${l._key}',this.value)" style="padding:3px 8px;border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-family:'DM Sans',sans-serif;">
        <option ${l.estado==='Nuevo'?'selected':''}>Nuevo</option>
        <option ${l.estado==='Contactado'?'selected':''}>Contactado</option>
        <option ${l.estado==='Agendado'?'selected':''}>Agendado</option>
        <option ${l.estado==='Descartado'?'selected':''}>Descartado</option>
      </select></td>
      <td style="font-size:var(--fs-sm);">${l.cargadoPor||'—'}</td>
      <td style="font-size:var(--fs-xs);color:var(--gris);">${l.fechaCarga||''}</td>
    </tr>`).join('')
    : '<tr><td colspan="8" class="empty-state">Sin leads con los filtros aplicados.</td></tr>';
  }
}

function abrirModalMetaMarketing() {
  const anioSel = document.getElementById('meta-mkt-anio');
  const anioActualN = new Date().getFullYear();
  const anios = [...new Set([anioActualN, anioActualN-1, anioActualN+1])].sort((a,b)=>b-a);
  anioSel.innerHTML = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
  anioSel.value = anioActualN;
  document.getElementById('meta-mkt-mes').value = mesActual();
  cargarMetaMarketingExistente();
  document.getElementById('modal-meta-marketing').classList.add('open');
}
function cerrarModalMetaMarketing() {
  document.getElementById('modal-meta-marketing').classList.remove('open');
}
function cargarMetaMarketingExistente() {
  const anio = document.getElementById('meta-mkt-anio').value;
  const mes  = document.getElementById('meta-mkt-mes').value;
  window._fbListenMetas(anio, mes, metas => {
    document.getElementById('meta-mkt-leads').value   = metas?.mkt_leads?.monto   || '';
    document.getElementById('meta-mkt-visitas').value = metas?.mkt_visitas?.monto || '';
    document.getElementById('meta-mkt-cierres').value = metas?.mkt_cierres?.monto || '';
  });
}
async function guardarMetaMarketing() {
  const anio = document.getElementById('meta-mkt-anio').value;
  const mes  = document.getElementById('meta-mkt-mes').value;
  const metaL = Number(document.getElementById('meta-mkt-leads').value) || 0;
  const metaV = Number(document.getElementById('meta-mkt-visitas').value) || 0;
  const metaC = Number(document.getElementById('meta-mkt-cierres').value) || 0;

  const btn = document.querySelector('#modal-meta-marketing .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbSetMeta(anio, mes, { mkt_leads:{monto:metaL}, mkt_visitas:{monto:metaV}, mkt_cierres:{monto:metaC} });
  btnSuccess(btn);
  toastOk('Metas de ' + mes + ' ' + anio + ' guardadas.');
  setTimeout(() => { cerrarModalMetaMarketing(); renderAdminMarketing(); renderDashboard(); }, 500);
}

function exportarLeads() {
  if (!leadsData.length) { toastErr('Sin leads para exportar.'); return; }
  const rows = leadsData.map(l=>({ Nombre:l.nombre, Teléfono:l.telefono, Fuente:l.fuente, Semana:l.semana, Mes:l.mes, Estado:l.estado, Observaciones:l.obs, 'Fecha carga':l.fechaCarga }));
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Leads'); XLSX.writeFile(wb,`leads_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   VENTAS — FICHERO INDIVIDUAL
═══════════════════════════════════════════ */
function renderFicheroVendedor() {
  if (!asesorActual) return;
  const mes  = mesActual();
  const anio = anioActual();
  setText('fichero-nombre', asesorActual.nombre);
  setText('fichero-mes-label', mes + ' ' + anio);
  const rolInfo = ROL_LABELS[asesorActual.rol||'ventas'] || ROL_LABELS.ventas;
  const badgeEl = document.getElementById('fichero-rol-badge');
  if (badgeEl) badgeEl.innerHTML = `<span class="rol-badge" style="background:${rolInfo.bg};color:${rolInfo.color};">${rolInfo.icon} ${rolInfo.label}</span>`;

  const misReg = misRegs.filter(r => r.mes===mes);
  const visitas   = visitasComoRegs(misRegs).filter(r => r.mes===mes).length; // visitas presenciales del mes (1ª y las que el cliente volvió)
  const cierres   = misReg.filter(r => r.conclusion==='Reserva' || r.huboCierre==='SI').length;

  setText('fich-total-reg', misReg.length);
  setText('fich-visitas-conc', visitas);
  setText('fich-con-cierre', cierres);
  // Hero stats
  countUp(document.getElementById('fich-total-reg-hero'), misReg.length);
  countUp(document.getElementById('fich-visitas-hero'),   visitas);
  countUp(document.getElementById('fich-cierres-hero'),   cierres);

  window._fbListenMetaUsuario(asesorActual._key, anio, mes, metas => {
    const metaVisitas = metas?.visitas?.monto || 0;
    const metaCierres = metas?.cierres?.monto || 0;
    const pctV = metaVisitas ? Math.round(visitas/metaVisitas*100) : 0;
    const pctC = metaCierres ? Math.round(cierres/metaCierres*100) : 0;

    setText('fichero-visitas-real', visitas);
    setText('fichero-visitas-meta', metaVisitas || '—');
    setText('fichero-visitas-pct', pctV+'%');
    const bV = document.getElementById('fichero-visitas-bar');
    if (bV) { bV.style.width=Math.min(pctV,100)+'%'; bV.style.background=pctV>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pctV>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--info),var(--info-light))'; }

    setText('fichero-cierres-real', cierres);
    setText('fichero-cierres-meta', metaCierres || '—');
    setText('fichero-cierres-pct', pctC+'%');
    const bC = document.getElementById('fichero-cierres-bar');
    if (bC) { bC.style.width=Math.min(pctC,100)+'%'; bC.style.background=pctC>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pctC>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--ok),var(--ok-light))'; }
  });

  // Lista registros del mes
  const lista = document.getElementById('fichero-registros-lista');
  if (lista) {
    lista.innerHTML = misReg.length ? misReg.map(r=>`
      <div class="cobro-card">
        <div class="cobro-card-left">
          <div class="cobro-nombre">${r.nombre||'—'}</div>
          <div class="cobro-meta">${r.origen||'—'} · ${r.fecha||r.fechaCarga||''}</div>
          <div class="cobro-pills">
            ${r.terrenoInteres?`<span class="badge badge-contrato" style="font-size:var(--fs-xs);">🗺 ${r.terrenoInteres}</span>`:''}
            ${r.conclusion==='Reserva'?'<span class="badge badge-contrato" style="font-size:var(--fs-xs);">🏆 Reserva</span>':''}
            ${r.estado?`<span class="badge badge-def" style="font-size:var(--fs-xs);">${r.estado}</span>`:''}
          </div>
        </div>
      </div>`).join('')
    : '<div class="empty-state">Sin registros este mes.</div>';
  }
}

/* ═══════════════════════════════════════════
   CARTERA — EXCEL + AGRUPACIÓN
═══════════════════════════════════════════ */
function descargarPlantillaCobranza() {
  const rows = [{ 'Cliente':'Ejemplo','Terreno':'UV1-4-31','Monto ($)':'500','Estado':'Al día','Fecha':'2026-05-15','Mes':'Mayo','Año':'2026','Observaciones':'' }];
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Cobranza'); XLSX.writeFile(wb,'plantilla_cobranza.xlsx');
}

function procesarExcelCobranza(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    cobranzaExcelPend = rows.map(r=>({
      cliente:  String(r['Cliente']||'').trim(),
      terreno:  String(r['Terreno']||'').trim(),
      monto:    parseFloat(r['Monto ($)']||r['Monto']||0),
      estado:   String(r['Estado']||'Sin gestión').trim(),
      fecha:    String(r['Fecha']||'').trim(),
      mes:      String(r['Mes']||'').trim(),
      anio:     parseInt(r['Año']||r['Anio']||new Date().getFullYear()),
      obs:      String(r['Observaciones']||'').trim(),
      cargadoPor: asesorActual?.nombre||'Admin',
      fechaCarga: new Date().toLocaleString('es-BO'),
    })).filter(r=>r.cliente);
    setText('cart-preview-count', cobranzaExcelPend.length);
    const tbody = document.getElementById('cart-preview-body');
    if (tbody) tbody.innerHTML = cobranzaExcelPend.map(r=>`<tr><td>${r.cliente}</td><td>${r.terreno}</td><td style="font-weight:600;color:var(--cartera);">$${r.monto.toFixed(2)}</td><td>${r.estado}</td><td>${r.fecha}</td><td>${r.mes}</td></tr>`).join('');
    const prev = document.getElementById('cart-excel-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarImportCobranza() {
  let ok=0;
  for (const r of cobranzaExcelPend) { try { await window._fbPushCobranzaExcel(r); ok++; } catch(e){} }
  toastOk(ok + ' registros importados.');
  cancelarImportCobranza();
}

function cancelarImportCobranza() {
  cobranzaExcelPend=[];
  const prev = document.getElementById('cart-excel-preview');
  if (prev) prev.style.display='none';
  const inp = document.getElementById('cart-excel-file');
  if (inp) inp.value='';
}

const ESTADOS_CARTERA_COLOR = {
  'Al día':       'var(--ok)', 'Pagado':     'var(--ok)',
  'Mora 1-30':    'var(--warn)', 'Mora 31-60': 'var(--warn-strong)',
  'Mora +60':     'var(--danger)', 'Parcial':    'var(--warn)',
  'Sin gestión':  '#9ca3af'
};

function renderCobranzaKPIs() {
  const mes  = mesActual();
  const anio = anioActual();
  const delMes = cobranzaExcelData.filter(c=>c.mes===mes&&c.anio===anio);
  const total  = delMes.reduce((s,c)=>s+(c.monto||0),0);
  const clientes = [...new Set(delMes.map(c=>c.cliente))].length;

  setText('cart-total',     '$'+total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}));
  setText('cart-total-sub', 'este mes');
  setText('cart-clientes',  clientes);
  setText('cart-registros', cobranzaExcelData.length);

  // Meta cartera
  window._fbListenMetaUsuario(asesorActual?._key||'cart', anio, mes, metas => {
    const meta = metas?.cartera?.monto || 0;
    const pct  = meta ? Math.round(total/meta*100) : 0;
    setText('cart-meta',     meta ? '$'+Number(meta).toLocaleString('es-BO') : '—');
    setText('cart-meta-pct', meta ? pct+'% alcanzado' : 'sin meta asignada');
    setText('cart-barra-pct', pct+'%');
    const bar = document.getElementById('cart-barra');
    if (bar) { bar.style.width=Math.min(pct,100)+'%'; bar.style.background=pct>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pct>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--cartera),var(--cartera-light))'; }
  });
}

function renderCobranzaAgrupada() {
  const filMes  = document.getElementById('cart-fil-mes')?.value || '';
  const filEst  = document.getElementById('cart-fil-estado')?.value || '';
  let datos = cobranzaExcelData;
  if (filMes) datos = datos.filter(c=>c.mes===filMes);
  if (filEst) datos = datos.filter(c=>c.estado===filEst);

  // Agrupar por estado
  const grupos = {};
  datos.forEach(c => {
    const est = c.estado || 'Sin gestión';
    if (!grupos[est]) grupos[est] = { registros:[], total:0 };
    grupos[est].registros.push(c);
    grupos[est].total += (c.monto||0);
  });

  const cont = document.getElementById('cart-agrupada-lista');
  if (!cont) return;
  if (!Object.keys(grupos).length) { cont.innerHTML='<div class="empty-state">Sin datos.</div>'; return; }

  const totalGlobal = datos.reduce((s,c)=>s+(c.monto||0),0);
  cont.innerHTML = Object.entries(grupos)
    .sort((a,b)=>b[1].total-a[1].total)
    .map(([est, g]) => {
      const color = ESTADOS_CARTERA_COLOR[est] || '#6b7280';
      const pct   = totalGlobal ? Math.round(g.total/totalGlobal*100) : 0;
      return `<div style="border:1.5px solid #f3f4f6;border-radius:var(--r-lg);margin-bottom:10px;overflow:hidden;">
        <div style="background:var(--bg-soft);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <div style="display:flex;align-items:center;gap:var(--sp-2);">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></div>
            <strong style="font-size:var(--fs-md);">${est}</strong>
            <span style="font-size:var(--fs-sm);color:var(--gris);">${g.registros.length} registros</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--fs-base);font-weight:700;color:${color};">$${g.total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            <div style="font-size:var(--fs-xs);color:var(--gris);">${pct}% del total</div>
          </div>
        </div>
        <div style="display:none;">
          <div class="tabla-wrap">
            <table>
              <thead><tr><th>Cliente</th><th>Terreno</th><th>Monto</th><th>Fecha</th><th>Obs.</th></tr></thead>
              <tbody>${g.registros.map(r=>`<tr>
                <td>${r.cliente}</td><td>${r.terreno||'—'}</td>
                <td style="font-weight:600;color:${color};">$${(r.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td style="font-size:var(--fs-sm);">${r.fecha||''}</td>
                <td style="font-size:var(--fs-sm);color:var(--gris);">${r.obs||''}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');
}

function exportarCobranzaExcel() {
  if (!cobranzaExcelData.length) { toastErr('Sin datos para exportar.'); return; }
  const rows = cobranzaExcelData.map(r=>({ Cliente:r.cliente, Terreno:r.terreno, 'Monto ($)':r.monto, Estado:r.estado, Fecha:r.fecha, Mes:r.mes, Año:r.anio, Observaciones:r.obs, 'Fecha carga':r.fechaCarga }));
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Cobranza'); XLSX.writeFile(wb,`cobranza_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function updateMetaBarra(prefix, actual, meta, color) {
  const pct = meta ? Math.round(actual/meta*100) : 0;
  setText(prefix+'-cobrado', actual);
  setText(prefix+'-meta-txt', meta ? 'meta: '+meta : 'meta: —');
  setText(prefix+'-pct-txt', pct+'%');
  const bar = document.getElementById(prefix+'-bar');
  if (bar) bar.style.width = Math.min(pct,100)+'%';
}

/* ═══════════════════════════════════════════
   SUB-TABS COBRANZA
═══════════════════════════════════════════ */
function switchCobTab(id) {
  document.querySelectorAll('.cob-m-tab').forEach((b,i) => {
    const ids = ['resumen','cargar','registros','excel','api'];
    b.classList.toggle('active', ids[i] === id);
  });
  ['resumen','cargar','registros','excel','api'].forEach(t => {
    const el = document.getElementById('cobt-' + t);
    if (el) el.style.display = t === id ? 'block' : 'none';
  });
  if (id === 'registros') renderCobros();
}

/* ═══════════════════════════════════════════
   CATEGORÍAS
═══════════════════════════════════════════ */
function renderCategoriasConfig() {
  const cont = document.getElementById('categorias-list');
  if (!cont) return;
  const tipoLabel = { cartera:'💰 Cartera', expensas:'🏘 Expensas', ambos:'📊 Ambos' };
  cont.innerHTML = categoriasData.length ? categoriasData.map(c => `
    <div class="vendor-item">
      <div style="display:flex;align-items:center;gap:var(--sp-2);">
        <div style="width:12px;height:12px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>
        <span class="v-name">${esc(c.nombre)}</span>
        <span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:999px;background:${c.color}22;color:${c.color};font-weight:600;">${tipoLabel[c.tipo]||c.tipo}</span>
      </div>
      <button class="btn-remove-vendor" onclick="eliminarCategoria('${c._key}','${escJs(c.nombre)}')">×</button>
    </div>`).join('')
  : '<div class="empty-state">Sin categorías.</div>';

  // Poblar selects de categoría en formularios
  const opts = categoriasData.map(c =>
    `<option value="${c._key}" data-tipo="${c.tipo}" data-color="${c.color}">${c.nombre}</option>`).join('');
  ['nc-categoria','fil-cob-cat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const first = el.options[0]?.value === '' ? `<option value="">${el.id==='fil-cob-cat'?'Todas':'Seleccionar...'}</option>` : '';
      el.innerHTML = first + opts;
    }
  });
}

async function agregarCategoria() {
  const nombre = document.getElementById('new-cat-nombre').value.trim();
  const tipo   = document.getElementById('new-cat-tipo').value;
  const color  = document.getElementById('new-cat-color').value;
  if (!nombre) { toastErr('El nombre de la categoria es obligatorio.'); return; }
  await window._fbAddCategoria(nombre, tipo, color);
  document.getElementById('new-cat-nombre').value = '';
}

async function eliminarCategoria(key, nombre) {
  const _ok4 = await confirmDialog('Se eliminara la categoria ' + nombre + '.', { title:'Eliminar categoria', okText:'Eliminar' }); if (!_ok4) return;
  await window._fbRemoveCategoria(key);
}

/* ═══════════════════════════════════════════
   GUARDAR COBRO MANUAL
═══════════════════════════════════════════ */
async function guardarCobro(dataBulk) {
  const data = dataBulk || {
    cliente:    document.getElementById('nc-cliente').value.trim(),
    terreno:    document.getElementById('nc-terreno').value.trim(),
    categoriaKey: document.getElementById('nc-categoria').value,
    categoriaNombre: document.getElementById('nc-categoria').options[document.getElementById('nc-categoria').selectedIndex]?.text || '',
    monto:      parseFloat(document.getElementById('nc-monto').value) || 0,
    mes:        document.getElementById('nc-mes').value,
    anio:       parseInt(document.getElementById('nc-anio').value),
    fecha:      document.getElementById('nc-fecha').value,
    asesor:     document.getElementById('nc-asesor').value.trim(),
    obs:        document.getElementById('nc-obs').value.trim(),
    sumaMeta:   document.querySelector('input[name=nc-suma-meta]:checked')?.value || 'SI',
    tipoMeta:   document.querySelector('input[name=nc-tipo-meta]:checked')?.value || 'cartera',
    cargadoPor: 'Admin',
    fechaCarga: new Date().toLocaleString('es-BO'),
  };

  if (!data.cliente) { if (!dataBulk) toastErr('El nombre del cliente es obligatorio.'); return false; }
  if (!data.monto || data.monto <= 0) { if (!dataBulk) toastErr('El monto debe ser mayor a 0.'); return false; }

  try {
    await window._fbPushCobro(data);
    if (!dataBulk) {
      // Limpiar formulario
      ['nc-cliente','nc-terreno','nc-monto','nc-fecha','nc-asesor','nc-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const sb = document.getElementById('cobro-success');
      if (sb) { sb.style.display='block'; setTimeout(()=>sb.style.display='none',3000); }
    }
    return true;
  } catch(e) {
    if (!dataBulk) toastErr('Error: ' + e.message);
    return false;
  }
}

/* ═══════════════════════════════════════════
   RENDER REGISTROS
═══════════════════════════════════════════ */
function renderCobros() {
  const filMes  = document.getElementById('fil-cob-mes')?.value || '';
  const filCat  = document.getElementById('fil-cob-cat')?.value || '';
  const filMeta = document.getElementById('fil-cob-meta')?.value || '';
  const filSuma = document.getElementById('fil-cob-suma')?.value || '';

  let datos = cobrosData.filter(c => {
    if (filMes  && c.mes  !== filMes)  return false;
    if (filCat  && c.categoriaKey !== filCat) return false;
    if (filMeta && c.tipoMeta !== filMeta) return false;
    if (filSuma && c.sumaMeta !== filSuma) return false;
    return true;
  });

  // Resumen filtrado
  const totalFil = datos.reduce((s,c)=>s+(c.monto||0),0);
  const sumafil  = datos.filter(c=>c.sumaMeta==='SI').reduce((s,c)=>s+(c.monto||0),0);
  const resEl = document.getElementById('cob-resumen-filtrado');
  if (resEl) {
    resEl.innerHTML = `<div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:8px;">
      <div style="background:var(--verde-bg);padding:10px 16px;border-radius:var(--r-md);font-size:var(--fs-base);">
        <span style="color:var(--gris);">Total filtrado:</span>
        <strong style="color:var(--cartera);margin-left:6px;">$${totalFil.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
        <span style="color:var(--gris);margin-left:6px;">(${datos.length} registros)</span>
      </div>
      <div style="background:var(--info-bg);padding:10px 16px;border-radius:var(--r-md);font-size:var(--fs-base);">
        <span style="color:var(--info-ink);">Suma a meta:</span>
        <strong style="color:var(--info-ink);margin-left:6px;">$${sumafil.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
      </div>
    </div>`;
  }

  const cont = document.getElementById('cob-registros-lista');
  if (!cont) return;
  if (!datos.length) {
    cont.innerHTML = '<div class="empty-state">Sin cobros con los filtros aplicados.</div>';
    return;
  }

  cont.innerHTML = datos.map(c => {
    const cat = categoriasData.find(x=>x._key===c.categoriaKey);
    const catColor = cat?.color || '#6b7280';
    const sumaOn = c.sumaMeta === 'SI';
    const tipoIcon = { cartera:'💰', expensas:'🏘', ninguna:'➖' };
    return `<div class="cobro-card">
      <div class="cobro-card-left">
        <div class="cobro-nombre">${c.cliente || '—'}</div>
        <div class="cobro-meta">${c.terreno||''} · ${c.mes||''} ${c.anio||''} · ${c.asesor||''}</div>
        <div class="cobro-pills">
          ${cat ? `<span class="cat-badge" style="background:${catColor}22;color:${catColor};border:1px solid ${catColor}44;">${cat.nombre}</span>` : ''}
          <span class="suma-toggle ${sumaOn?'on':'off'}" onclick="toggleSumaMeta('${c._key}','${sumaOn?'NO':'SI'}')">
            ${sumaOn ? '✓ Suma a meta' : '✗ No suma'}
          </span>
          <span style="font-size:var(--fs-xs);color:var(--gris);">${tipoIcon[c.tipoMeta]||''} ${c.tipoMeta||''}</span>
        </div>
        ${c.obs ? `<div style="font-size:var(--fs-sm);color:var(--gris);margin-top:4px;font-style:italic;">${esc(c.obs)}</div>` : ''}
      </div>
      <div class="cobro-monto">
        <div class="cobro-monto-val">${c.tipoMeta==='expensas'?'Bs ':'$'}${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <div class="cobro-monto-label">${c.fechaCarga||''}</div>
        <button class="btn-del" style="margin-top:8px;" onclick="eliminarCobro('${c._key}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function toggleSumaMeta(key, nuevoVal) {
  await window._fbUpdateCobro(key, { sumaMeta: nuevoVal });
}

async function eliminarCobro(key) {
  const _ok5 = await confirmDialog('Esta accion no se puede deshacer.', { title:'Eliminar cobro', okText:'Eliminar' }); if (!_ok5) return;
  await window._fbRemoveCobro(key);
}

function limpiarFiltrosCobros() {
  ['fil-cob-mes','fil-cob-cat','fil-cob-meta','fil-cob-suma'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderCobros();
}

/* ═══════════════════════════════════════════
   EXCEL — IMPORTAR COBROS
═══════════════════════════════════════════ */
function descargarPlantillaExcel(tipo) {
  const rows = [
    { 'Cliente':'Ejemplo Cliente', 'Terreno':'UV1-4-31', 'Categoria':'Cuota terreno',
      'Monto ($)':'1500.00', 'Mes':'Mayo', 'Año':'2026', 'Fecha':'2026-05-15',
      'Asesor':'Luis Carlos', 'Suma a meta (SI/NO)':'SI',
      'Tipo meta (cartera/expensas/ninguna)': tipo, 'Observaciones':'Pago cuota 5' }
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cobros');
  XLSX.writeFile(wb, `plantilla_cobros_${tipo}.xlsx`);
}

function handleExcelDrop(event, tipo) {
  event.preventDefault();
  document.getElementById('upload-zone-cob').classList.remove('drag');
  const file = event.dataTransfer.files[0];
  if (file) procesarArchivoExcel(file);
}

function procesarExcelCobros(input) {
  const file = input.files[0];
  if (file) procesarArchivoExcel(file);
}

function procesarArchivoExcel(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type:'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      excelPendiente = rows.map(r => ({
        cliente:         String(r['Cliente']||'').trim(),
        terreno:         String(r['Terreno']||'').trim(),
        categoriaNombre: String(r['Categoria']||r['Categoría']||'').trim(),
        monto:           parseFloat(r['Monto ($)']||r['Monto']||0),
        mes:             String(r['Mes']||'').trim(),
        anio:            parseInt(r['Año']||r['Anio']||2026),
        fecha:           String(r['Fecha']||'').trim(),
        asesor:          String(r['Asesor']||'').trim(),
        sumaMeta:        String(r['Suma a meta (SI/NO)']||'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI',
        tipoMeta:        String(r['Tipo meta (cartera/expensas/ninguna)']||'cartera').trim().toLowerCase(),
        obs:             String(r['Observaciones']||'').trim(),
        cargadoPor:      'Excel',
        fechaCarga:      new Date().toLocaleString('es-BO'),
      })).filter(r => r.cliente && r.monto > 0);

      // Preview
      document.getElementById('excel-count').textContent = excelPendiente.length;
      const tbody = document.getElementById('excel-preview-body');
      tbody.innerHTML = excelPendiente.map((r,i) => `<tr>
        <td>${i+1}</td>
        <td>${r.cliente}</td>
        <td>${r.terreno}</td>
        <td>${r.categoriaNombre}</td>
        <td style="font-weight:600;color:var(--cartera);">$${r.monto.toFixed(2)}</td>
        <td>${r.mes}</td>
        <td>${r.anio}</td>
        <td><span class="suma-toggle ${r.sumaMeta==='SI'?'on':'off'}" style="cursor:default;">${r.sumaMeta==='SI'?'✓ Sí':'✗ No'}</span></td>
        <td>${r.tipoMeta}</td>
      </tr>`).join('');
      document.getElementById('excel-preview').style.display = 'block';
    } catch(err) {
      toastErr('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsBinaryString(file);
}

async function confirmarImport() {
  if (!excelPendiente.length) return;
  const btn = document.querySelector('[onclick="confirmarImport()"]');
  if (btn) { btn.textContent = 'Importando...'; btn.disabled = true; }
  let ok = 0;
  for (const row of excelPendiente) {
    // Buscar categoría por nombre
    const cat = categoriasData.find(c => c.nombre.toLowerCase() === row.categoriaNombre.toLowerCase());
    if (cat) { row.categoriaKey = cat._key; }
    try { await window._fbPushCobro(row); ok++; } catch(e) { console.error(e); }
  }
  toastOk(ok + ' cobros importados.');
  cancelarImport();
  switchCobTab('registros');
}

function cancelarImport() {
  excelPendiente = [];
  document.getElementById('excel-preview').style.display = 'none';
  const inp = document.getElementById('excel-file-cob');
  if (inp) inp.value = '';
}

/* ═══════════════════════════════════════════
   RESUMEN COBRANZA (tab Resumen)
═══════════════════════════════════════════ */
function renderResumenCobranza() {
  const mes  = mesActual();
  const anio = anioActual();
  const delMes   = cobrosData.filter(c => c.mes === mes && c.anio === anio);
  const sumaMeta = delMes.filter(c => c.sumaMeta === 'SI' && c.tipoMeta === 'cartera')
                         .reduce((s,c) => s + (c.monto||0), 0);
  const total    = delMes.reduce((s,c) => s + (c.monto||0), 0);
  const clientes = [...new Set(delMes.map(c => c.cliente))].length;

  // KPIs del resumen (si existen en HTML original)
  const kpiTotal   = document.getElementById('ck-total');
  const kpiCob     = document.getElementById('ck-vigente');
  if (kpiTotal) { kpiTotal.textContent = '$' + total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  if (kpiCob)   { kpiCob.textContent = clientes; document.getElementById('ck-vigente-sub').textContent = 'clientes cobrados'; }

  // Label mes
  const mesLbl = document.getElementById('cob-mes-label');
  if (mesLbl) mesLbl.textContent = mes + ' ' + anio;

  // Últimos 5 cobros
  const ultEl = document.getElementById('cob-ultimos');
  if (ultEl) {
    const ult = cobrosData.slice(0,5);
    ultEl.innerHTML = ult.length ? ult.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;">
        <div>
          <div style="font-size:var(--fs-base);font-weight:500;">${esc(c.cliente)}</div>
          <div style="font-size:var(--fs-xs);color:var(--gris);">${c.categoriaNombre||'—'} · ${c.mes} ${c.anio}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:var(--fs-md);font-weight:700;color:var(--cartera);">$${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div style="font-size:var(--fs-2xs);color:${c.sumaMeta==='SI'?'var(--ok)':'#9ca3af'};">${c.sumaMeta==='SI'?'✓ Suma meta':'✗ No suma'}</div>
        </div>
      </div>`).join('')
    : '<div style="font-size:var(--fs-base);color:var(--gris);">Sin cobros recientes.</div>';
  }

  // Resumen por categoría en el tab resumen
  const resEl = document.getElementById('cob-resumen-mes');
  if (!resEl) return;
  const porCat = {};
  delMes.forEach(c => {
    const cat = c.categoriaNombre || 'Sin categoría';
    if (!porCat[cat]) porCat[cat] = { total:0, n:0 };
    porCat[cat].total += (c.monto||0);
    porCat[cat].n++;
  });
  const max = Math.max(...Object.values(porCat).map(x=>x.total), 1);
  resEl.innerHTML = Object.entries(porCat).sort((a,b)=>b[1].total-a[1].total).map(([cat,v]) => `
    <div class="bar-item">
      <div class="bar-label">
        <span>${cat}</span>
        <span><strong>$${v.total.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
        <span style="color:var(--gris);font-size:var(--fs-xs);"> (${v.n})</span></span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${v.total/max*100}%;background:var(--verde);"></div></div>
    </div>`).join('') || '<div class="empty-state">Sin cobros este mes.</div>';

  // Progreso resumen
  const prog = document.getElementById('cob-prog-resumen');
  if (prog) {
    prog.innerHTML = `
      <div class="prog-item"><div class="pv">${delMes.length}</div><div class="pl">Cobros mes</div></div>
      <div class="prog-item"><div class="pv" style="color:var(--cartera);">$${total.toLocaleString('es-BO',{maximumFractionDigits:0})}</div><div class="pl">Total cobrado</div></div>
      <div class="prog-item"><div class="pv" style="color:var(--info);">${clientes}</div><div class="pl">Clientes</div></div>
    `;
  }
}

function renderResumenExpensas() {
  // Placeholder para cuando se expanda expensas manual
}

/* ═══════════════════════════════════════════
   EXPORTAR COBROS
═══════════════════════════════════════════ */
function exportarCobros() {
  const datos = cobrosData;
  if (!datos.length) { toastErr('Sin cobros para exportar.'); return; }
  const rows = datos.map(c => ({
    'Cliente':      c.cliente||'',
    'Terreno':      c.terreno||'',
    'Categoría':    c.categoriaNombre||'',
    'Monto ($)':    c.monto||0,
    'Mes':          c.mes||'',
    'Año':          c.anio||'',
    'Fecha cobro':  c.fecha||'',
    'Asesor':       c.asesor||'',
    'Suma a meta':  c.sumaMeta||'',
    'Tipo meta':    c.tipoMeta||'',
    'Observaciones':c.obs||'',
    'Fecha carga':  c.fechaCarga||'',
    'Cargado por':  c.cargadoPor||'',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cobros');
  XLSX.writeFile(wb, `cobros_urubo_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   METAS — USAR COBROS MANUALES
═══════════════════════════════════════════ */
function calcularMetaManual(tipo) {
  const mes  = mesActual();
  const anio = anioActual();
  const cobrado = cobrosData
    .filter(c => c.mes === mes && c.anio === anio && c.sumaMeta === 'SI' && c.tipoMeta === tipo)
    .reduce((s,c) => s + (c.monto||0), 0);

  window._fbListenMetas(anio, mes, metas => {
    const meta = metas?.[tipo]?.monto || 0;
    const pct  = meta ? Math.round(cobrado / meta * 100) : 0;

    if (tipo === 'cartera') {
      const cobEl  = document.getElementById('meta-cob-cobrado');
      const metaEl = document.getElementById('meta-cob-val');
      const pctEl  = document.getElementById('meta-cob-pct');
      const barEl  = document.getElementById('meta-cob-bar');
      if (cobEl)  cobEl.textContent  = '$' + cobrado.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2});
      if (metaEl) metaEl.textContent = meta ? '$' + Number(meta).toLocaleString('es-BO') : '— (sin meta)';
      if (pctEl)  { pctEl.textContent = pct+'%'; pctEl.style.color = pct>=100?'var(--ok)':pct>=75?'var(--warn)':'var(--danger)'; }
      if (barEl)  { barEl.style.width = Math.min(pct,100)+'%'; barEl.style.background = pct>=100?'linear-gradient(90deg,var(--ok),var(--ok-light))':pct>=75?'linear-gradient(90deg,var(--warn),var(--warn-light))':'linear-gradient(90deg,var(--danger),var(--danger-light))'; }
      updateHomeMetas('cartera', cobrado, meta, pct);
    } else {
      const cobEl  = document.getElementById('meta-exp-cobrado');
      const metaEl = document.getElementById('meta-exp-val');
      const pctEl  = document.getElementById('meta-exp-pct');
      const barEl  = document.getElementById('meta-exp-bar');
      if (cobEl)  cobEl.textContent  = '$' + cobrado.toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2});
      if (metaEl) metaEl.textContent = meta ? '$' + Number(meta).toLocaleString('es-BO') : '— (sin meta)';
      if (pctEl)  { pctEl.textContent = pct+'%'; pctEl.style.color = pct>=100?'var(--ok)':pct>=75?'var(--warn)':'var(--danger)'; }
      if (barEl)  barEl.style.width = Math.min(pct,100)+'%';
      updateHomeMetas('expensas', cobrado, meta, pct);
    }
  });
}

/* ═══════════════════════════════════════════
   VALIDACIÓN DE CAMPOS — borde verde al llenar
═══════════════════════════════════════════ */
// Field validation — green border when filled
document.addEventListener('blur', function(e) {
  const el = e.target;
  if (!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) return;
  if (el.type==='radio'||el.type==='checkbox'||el.type==='file'||el.type==='color') return;
  if (el.value && el.value.trim()) {
    el.classList.add('field-valid');
  } else {
    el.classList.remove('field-valid');
  }
}, true);
// Remove valid on focus
document.addEventListener('focus', function(e) {
  const el = e.target;
  if (!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) return;
  el.classList.remove('field-valid');
}, true);
