/* ═══════════════════════════════════════════
   PANEL DE CONTROL — política de descuento (condición central) y accesos a metas
═══════════════════════════════════════════ */
const PC_MODALIDADES = ['Contado','Contado Diferido','Crédito Directo','Crédito Bancario'];
const PC_CATEGORIAS  = ['A','B','C'];
const PC_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// La clave ahora incluye el período de vigencia (año-mes) — así "Agosto" puede tener
// una política distinta de "Septiembre", y las ventas viejas usan la que regía en su momento.
function _politicaKey(modalidad, categoria, anio, mes) {
  const periodo = (anio && mes) ? `${anio}-${String(PC_MESES.indexOf(mes)+1).padStart(2,'0')}` : '';
  return String(modalidad||'—').replace(/[^a-zA-Z0-9]+/g,'-') + '_' + String(categoria||'—').replace(/[^a-zA-Z0-9]+/g,'-') + (periodo?'_'+periodo:'');
}
// "Contado" se mide en DÍAS (completar el pago en ese plazo, en los pagos que hagan falta).
// El resto se mide en CUOTAS (mensuales). Si no hay nada cargado, avisamos en vez de inventar un número.
function _unidadPlazoModalidad(modalidad) {
  return modalidad === 'Contado' ? 'días' : 'cuotas';
}
function obtenerPlazoModalidad(modalidad, anio, mes) {
  const key = String(modalidad||'').replace(/[^a-zA-Z0-9]+/g,'-');
  // Si ese mes tiene plazos propios cargados, valen esos; si no, el plazo general (el vigente de siempre).
  // Así, cargar los plazos de un mes pasado (ej. julio) no cambia los plazos de hoy.
  if (!anio || !mes) { const h = new Date(); anio = h.getFullYear(); mes = PC_MESES[h.getMonth()]; }
  const delMes = plazosModalidadData[key + '-' + anio + '-' + String(PC_MESES.indexOf(mes) + 1).padStart(2, '0')];
  const d = delMes || plazosModalidadData[key];
  return d ? { plazoMax: d.plazoMax, unidad: _unidadPlazoModalidad(modalidad), anio: delMes ? anio : null, mes: delMes ? mes : null } : null;
}

function renderPlazosModalidad() {
  const tbody = document.getElementById('pc-plazos-tbody');
  if (!tbody) return;
  const { anio, mes } = pcPeriodoActivo;
  const tit = document.getElementById('pc-plazos-periodo'); if (tit) tit.textContent = mes + ' ' + anio;
  tbody.innerHTML = PC_MODALIDADES.map(modalidad => {
    const d = obtenerPlazoModalidad(modalidad, anio, mes);
    const exacta = d && d.anio === anio && d.mes === mes;
    const nota = d && !exacta ? `<div style="font-size:9px;color:var(--gris);margin-top:2px;">plazo general</div>` : '';
    const unidad = _unidadPlazoModalidad(modalidad);
    return `<tr>
      <td style="font-weight:600;">${esc(modalidad)}</td>
      <td><input type="number" min="1" data-plazo-modalidad="${esc(modalidad)}" value="${d?d.plazoMax:''}" placeholder="—" style="width:100px;text-align:center;"/>${nota}</td>
      <td style="color:var(--gris);">${unidad}</td>
    </tr>`;
  }).join('');
}

async function guardarPlazosModalidad() {
  const inputs = document.querySelectorAll('#pc-plazos-tbody input[data-plazo-modalidad]');
  let n = 0;
  for (const inp of inputs) {
    const val = parseFloat(inp.value);
    if (isNaN(val) || val <= 0) continue;
    const modalidad = inp.dataset.plazoModalidad, { anio, mes } = pcPeriodoActivo;
    const periodo = anio + '-' + String(PC_MESES.indexOf(mes) + 1).padStart(2, '0');
    const datos = { modalidad, plazoMax: val, unidad: _unidadPlazoModalidad(modalidad), anio, mes };
    await window._fbSetPlazoModalidad(modalidad + '-' + periodo, datos);
    // si es el mes actual o uno futuro, también pasa a ser el plazo general (el que usa el cotizador hoy)
    const h = new Date(); if (anio * 100 + PC_MESES.indexOf(mes) >= h.getFullYear() * 100 + h.getMonth()) await window._fbSetPlazoModalidad(modalidad, datos);
    n++;
  }
  toastOk('Plazos de ' + pcPeriodoActivo.mes + ' ' + pcPeriodoActivo.anio + ' guardados (' + n + ' modalidades).');
}

function obtenerPoliticaDescuento(modalidad, categoria, anio, mes) {
  const key = _politicaKey(modalidad, categoria, anio, mes);
  let p = politicaDescuentoData.find(p => p._key === key);
  if (p) return p;
  // Si no hay política exacta para ese mes, usamos la vigente más reciente ANTES de esa fecha
  // (una política "queda puesta" hasta que se cargue una nueva, no hace falta repetirla cada mes).
  if (anio && mes) {
    const objetivoOrden = anio*100 + (PC_MESES.indexOf(mes)+1);
    const candidatas = politicaDescuentoData
      .filter(p => p.modalidad===modalidad && p.categoria===categoria && p.anio && p.mes)
      .map(p => ({ ...p, orden: p.anio*100 + (PC_MESES.indexOf(p.mes)+1) }))
      .filter(p => p.orden <= objetivoOrden)
      .sort((a,b)=>b.orden-a.orden);
    return candidatas[0] || null;
  }
  return null;
}
// Excedente = (% autorizado - % realmente otorgado) convertido a $ sobre el precio de lista.
// Positivo: el asesor dio MENOS descuento del que tenía permitido (bien).
// Negativo: se pasó de la política autorizada.
// mes/anio: el período de la VENTA (no el de hoy) — así cada venta usa la política que regía en su momento.
function calcularExcedentePolitica(modalidad, categoria, descuentoPctOtorgado, precioLista, mes, anio) {
  const politica = obtenerPoliticaDescuento(modalidad, categoria, anio, mes);
  if (!politica || !precioLista) return 0;
  const margenPct = (politica.pctMax || 0) - (descuentoPctOtorgado || 0);
  return Math.round((margenPct/100) * precioLista);
}

let pcPeriodoActivo = { anio: new Date().getFullYear(), mes: PC_MESES[new Date().getMonth()] };

function pcCambiarPeriodo() {
  pcPeriodoActivo.anio = parseInt(document.getElementById('pc-fil-anio').value);
  pcPeriodoActivo.mes  = document.getElementById('pc-fil-mes').value;
  renderPanelControl(); renderPlazosModalidad();
}

function renderPanelControl() {
  const tbody = document.getElementById('pc-politica-tbody');
  if (!tbody) return;

  const selAnio = document.getElementById('pc-fil-anio');
  const selMes  = document.getElementById('pc-fil-mes');
  if (selAnio && !selAnio.dataset.filled) {
    const anioActualN = new Date().getFullYear();
    selAnio.innerHTML = [anioActualN+1, anioActualN, anioActualN-1].map(a=>`<option value="${a}">${a}</option>`).join('');
    selAnio.value = pcPeriodoActivo.anio;
    selAnio.dataset.filled = '1';
  }
  if (selMes && !selMes.dataset.filled) {
    selMes.innerHTML = PC_MESES.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    selMes.value = pcPeriodoActivo.mes;
    selMes.dataset.filled = '1';
  }

  const { anio, mes } = pcPeriodoActivo;
  tbody.innerHTML = PC_MODALIDADES.map(modalidad => {
    const celdas = PC_CATEGORIAS.map(cat => {
      const key = _politicaKey(modalidad, cat, anio, mes);
      const exacta = politicaDescuentoData.find(p => p._key === key);
      const heredada = !exacta ? obtenerPoliticaDescuento(modalidad, cat, anio, mes) : null;
      const valor = exacta ? exacta.pctMax : (heredada ? heredada.pctMax : '');
      const nota = heredada ? `<div style="font-size:9px;color:var(--gris);margin-top:2px;">heredada de ${esc(heredada.mes)} ${heredada.anio}</div>` : '';
      return `<td><input type="number" min="0" max="100" step="0.5" data-pc-key="${key}" data-modalidad="${esc(modalidad)}" data-categoria="${cat}"
        value="${valor}" placeholder="0" style="width:80px;text-align:center;"/> %${nota}</td>`;
    }).join('');
    return `<tr><td style="font-weight:600;">${esc(modalidad)}</td>${celdas}</tr>`;
  }).join('');
}

async function guardarPoliticaDescuento() {
  const inputs = document.querySelectorAll('#pc-politica-tbody input[data-pc-key]');
  const { anio, mes } = pcPeriodoActivo;
  let n = 0;
  for (const inp of inputs) {
    const val = parseFloat(inp.value);
    if (isNaN(val)) continue;
    await window._fbSetPoliticaDescuento(inp.dataset.pcKey, {
      modalidad: inp.dataset.modalidad, categoria: inp.dataset.categoria, pctMax: val, anio, mes,
    });
    n++;
  }
  toastOk('Política de ' + mes + ' ' + anio + ' guardada (' + n + ' combinaciones).');
}

/* ── Modal de meta de Cartera, prolijo (reemplaza los 2 prompt() duplicados que había) ── */
function abrirModalMetaCartera() {
  const anioSel = document.getElementById('meta-cart-anio');
  const mesSel  = document.getElementById('meta-cart-mes');
  const montoEl = document.getElementById('meta-cart-monto');
  if (!anioSel || !mesSel || !montoEl) return;
  const anioActualN = new Date().getFullYear();
  anioSel.innerHTML = [anioActualN+1, anioActualN, anioActualN-1].map(a=>`<option value="${a}">${a}</option>`).join('');
  anioSel.value = anioActualN;
  mesSel.value = mesActual();
  montoEl.value = '';
  cargarMetaCarteraExistente();
  document.getElementById('modal-meta-cartera').classList.add('open');
}
async function cargarMetaCarteraExistente() {
  const anio = document.getElementById('meta-cart-anio')?.value;
  const mes  = document.getElementById('meta-cart-mes')?.value;
  const montoEl = document.getElementById('meta-cart-monto');
  if (!anio || !mes || !montoEl) return;
  const actual = await window._fbGetMetaOnce(anio, mes, 'cartera');
  montoEl.value = actual || '';
  montoEl.placeholder = actual ? '' : 'Sin meta cargada para este período';
}
function cerrarModalMetaCartera() {
  document.getElementById('modal-meta-cartera')?.classList.remove('open');
}
async function guardarMetaCarteraModal() {
  const anio = document.getElementById('meta-cart-anio')?.value;
  const mes  = document.getElementById('meta-cart-mes')?.value;
  const val  = parseFloat(document.getElementById('meta-cart-monto')?.value);
  if (!anio || !mes || !val) { toastErr('Elegí un período y un monto válido.'); return; }
  const btn = document.querySelector('#modal-meta-cartera .confirm-btn-ok');
  btnLoading(btn, true);
  await window._fbSetMeta(anio, mes, 'cartera', val);
  btnSuccess(btn);
  toastOk('Meta de cartera de ' + mes + ' ' + anio + ' guardada ($' + val.toLocaleString('es-BO') + ').');
  setTimeout(() => { cerrarModalMetaCartera(); renderCartaAdminKPIs?.(); renderCartaKPIs?.(); }, 500);
}

function abrirModalContratoFirmado(registroKey) {
  const r = (typeof misRegs !== 'undefined' && misRegs.find(x => x._key === registroKey))
         || (typeof todosRegs !== 'undefined' && todosRegs.find(x => x._key === registroKey));
  if (!r) return;
  _cfRegistroActual = r;

  setText('cf-cliente-nombre', r.nombre || '—');
  setText('cf-terreno-nombre', r.terrenoInteres || '—');
  setText('cf-precio-venta-display', r.precioVenta ? '$'+Math.round(r.precioVenta).toLocaleString('es-BO') : '—');

  // Intenta prefill el módulo a partir del código de terreno (ej: "5-1-13" → sugiere "Mod. 5")
  const primerNum = (r.terrenoInteres||'').split('-')[0];
  document.getElementById('cf-modulo').value = primerNum ? ('Mod. '+primerNum) : '';
  document.getElementById('cf-estatus').value = 'VENTA UV';
  const buscadoCf = String(r.terrenoInteres||'').trim().toLowerCase();
  const loteCf = _loteDeTerreno(buscadoCf);
  document.getElementById('cf-categoria').value = ['A','B','C'].includes(loteCf?.categoria) ? loteCf.categoria : (['A','B','C'].includes(r.calificacion) ? r.calificacion : 'B');
  document.getElementById('cf-ciudad-origen').value = r.ciudadProcedencia || '';
  document.getElementById('cf-dscto-adicional').value = '';
  document.getElementById('cf-accion').value = '';
  document.getElementById('cf-observaciones').value = '';

  // Si es un cierre de agente externo, no hace falta autorización (el admin ya lo está cargando él mismo)
  const aviso = document.getElementById('cf-aviso-autorizacion');
  const btnGuardar = document.querySelector('#modal-contrato-firmado .confirm-btn-ok');
  if (r.esExterno) {
    if (aviso) aviso.style.display = 'none';
    if (btnGuardar) btnGuardar.textContent = '✓ Concretar venta directamente';
  } else {
    if (aviso) aviso.style.display = 'block';
    if (btnGuardar) btnGuardar.textContent = 'Enviar para autorización';
  }

  document.getElementById('modal-contrato-firmado').classList.add('open');
}
function cerrarModalContratoFirmado() {
  document.getElementById('modal-contrato-firmado').classList.remove('open');
  _cfRegistroActual = null;
}

async function guardarContratoFirmado() {
  const r = _cfRegistroActual;
  if (!r) return;

  const modulo = document.getElementById('cf-modulo').value.trim();
  const estatus = document.getElementById('cf-estatus').value;
  const categoria = document.getElementById('cf-categoria').value;
  const ciudadOrigen = document.getElementById('cf-ciudad-origen').value.trim();
  const dsctoAdicional = parseFloat(document.getElementById('cf-dscto-adicional').value) || 0;
  const accion = parseFloat(document.getElementById('cf-accion').value) || 0;
  const observaciones = document.getElementById('cf-observaciones').value.trim();

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const fechaRef = r.fecha ? new Date(r.fecha+'T00:00:00') : new Date();
  const trimestre = ['1er','1er','1er','2do','2do','2do','3er','3er','3er','4to','4to','4to'][fechaRef.getMonth()] + ' Trimestre';

  // Los cierres de agentes externos los carga directamente el administrador — no necesitan pasar
  // por la cola de autorización, porque ya los está revisando él mismo al cargarlos.
  const autoAprobado = !!r.esExterno;

  const btn = document.querySelector('#modal-contrato-firmado .confirm-btn-ok');
  btnLoading(btn, true);
  try {
    await window._fbPushVentaConcretada({
      registroKey: r._key,
      año: fechaRef.getFullYear(), anio: fechaRef.getFullYear(),
      mes: meses[fechaRef.getMonth()], trimestre,
      cliente: r.nombre, terreno: r.terrenoInteres, modulo,
      gestion: r.origen || '', asesorNombre: r.asesorNombre,
      estadoVenta: 'Contrato Firmado', estatus, contrato: 'Contrato Firmado',
      modalidad: r.formaPago || '',
      precioLista: r.precioLista||0, descuentoUsd: r.descuentoUsd||0, descuentoPct: r.descuentoPct||0,
      dsctoAdicional, excedente: calcularExcedentePolitica(r.formaPago, categoria, r.descuentoPct||0, r.precioLista||0, meses[fechaRef.getMonth()], fechaRef.getFullYear()) - dsctoAdicional,
      precioVenta: r.precioVenta||0,
      metraje: r.metraje||0, m2Usd: r.precioM2Final||0,
      fechaReserva: r.fecha||'', accion, categoria, ciudadOrigen,
      canal: r.origen||'', observaciones, esExterno: !!r.esExterno,
      esHistorico: false,
      estadoAutorizacion: autoAprobado ? 'aprobado' : 'pendiente',
      solicitadoPorKey: asesorActual?._key || 'admin', solicitadoPorNombre: asesorActual?.nombre || 'Administrador',
    });
    btnSuccess(btn);
    toastOk(autoAprobado
      ? 'Venta de ' + r.nombre + ' concretada directamente.'
      : 'Contrato de ' + r.nombre + ' enviado — queda pendiente de autorización de Administración.');
    setTimeout(cerrarModalContratoFirmado, 500);
  } catch(e) {
    btnLoading(btn, false);
    toastErr('Error al guardar: ' + e.message);
  }
}

async function devolverACallCenter(registroKey, nombreCliente) {
  const motivo = prompt('¿Por qué se devuelve a ' + nombreCliente + '? (motivo breve, opcional)') || '';
  const ok = await confirmDialog(
    nombreCliente + ' va a volver a aparecer en la cola de Call Center para que retomen el contacto.',
    { title:'↩️ Devolver a Call Center', okText:'Sí, devolver' }
  );
  if (!ok) return;

  const reg = misRegs.find(r => r._key === registroKey);
  await window._fbPushVisitaProgramada({
    nombre: nombreCliente,
    telefono: '',
    asesorKey: asesorActual._key,
    asesorNombre: asesorActual.nombre,
    fecha: new Date().toISOString().split('T')[0],
    hora: '',
    mes: mesActual(), anio: anioActual(),
    origen: reg?.origen || '',
    campaniaCodigo: '',
    interes: motivo ? ('Devuelto por el asesor. Motivo: ' + motivo) : 'Devuelto por el asesor para retomar contacto.',
    cargadoPorKey: asesorActual._key,
    cargadoPorNombre: asesorActual.nombre,
    estado: 'pendiente',
    esDevolucion: true,
    registroOrigenKey: registroKey,
  });
  toastOk(nombreCliente + ' fue devuelto a Call Center.');
}

async function guardarVisitaProgramada() {
  const nombre   = document.getElementById('cc-nombre').value.trim();
  const telefono = document.getElementById('cc-telefono').value.trim();
  const asesorKey = document.getElementById('cc-asesor').value;
  const asesorSel = asesores.find(a => a._key === asesorKey);
  const fecha = document.getElementById('cc-fecha').value || new Date().toISOString().split('T')[0];
  const hora  = document.getElementById('cc-hora').value;
  const origen = document.getElementById('cc-origen').value;
  const campaniaCodigo = document.getElementById('cc-campania').value;
  const interes = document.getElementById('cc-interes').value.trim();

  if (!nombre)    { toastErr('Falta el nombre del cliente.'); return; }
  if (!asesorKey) { toastErr('Elegí a qué asesor se le asigna la visita.'); return; }

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mes = meses[new Date(fecha+'T00:00:00').getMonth()];
  const anio = new Date(fecha+'T00:00:00').getFullYear();

  const btn = document.querySelector('[onclick="guardarVisitaProgramada()"]');
  btnLoading(btn, true);
  await window._fbPushVisitaProgramada({
    nombre, telefono, asesorKey, asesorNombre: asesorSel?.nombre || '',
    fecha, hora, mes, anio, origen, campaniaCodigo, interes,
    cargadoPorKey: asesorActual._key, cargadoPorNombre: asesorActual.nombre,
    estado: 'pendiente'
  });
  btnSuccess(btn);
  toastOk('Visita de ' + nombre + ' agendada para ' + (asesorSel?.nombre||'') + '.');
  mostrarFichaVisita({ nombre, telefono, asesorNombre: asesorSel?.nombre||'', fecha, hora, origen, campaniaCodigo, interes });
  ['cc-nombre','cc-telefono','cc-hora','cc-interes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('cc-asesor').value = '';
  document.getElementById('cc-origen').value = '';
  document.getElementById('cc-campania').value = '';
  const sb = document.getElementById('cc-success-banner');
  if (sb) { sb.style.display='block'; setTimeout(()=>sb.style.display='none',3000); }
}

function renderVisitasProgramadasCallCenter() {
  const cont = document.getElementById('cc-lista');
  if (cont) {
    const mias = visitasProgramadasData.filter(v => v.cargadoPorKey === asesorActual?._key);
    if (!mias.length) { cont.innerHTML = '<div class="empty-state">Todavía no agendaste ninguna visita.</div>'; }
    else {
      const badgeEstado = v => {
        if (v.estado === 'completada') return '<span class="badge badge-contrato" style="font-size:var(--fs-xs);">✅ Completada — cargó el registro</span>';
        if (v.estado === 'en_proceso') return '<span class="badge" style="font-size:var(--fs-xs);background:#fde68a;color:#92400e;">⚠️ Abrió el formulario, no guardó todavía</span>';
        return '<span class="badge badge-seguim" style="font-size:var(--fs-xs);">⏳ Pendiente — todavía no la tocó</span>';
      };
      cont.innerHTML = mias.map(v => `
        <div class="cobro-card">
          <div class="cobro-card-left">
            <div class="cobro-nombre">${esc(v.nombre)} ${badgeEstado(v)} ${v.esDevolucion?'<span class="badge" style="font-size:var(--fs-xs);background:#fef3c7;color:#92400e;">↩️ Devuelta</span>':''}</div>
            <div class="cobro-meta">Asesor: ${esc(v.asesorNombre)} · ${esc(v.fecha)} ${esc(v.hora||'')}</div>
          </div>
          <div class="cobro-monto">
            <button class="btn-del" onclick="solicitarEliminacion('visitas_programadas/${v._key}','Visita agendada de ${escJs(v.nombre)} (asesor: ${escJs(v.asesorNombre||'—')})')">🗑</button>
          </div>
        </div>`).join('');
    }
  }
  renderCallCenterKPIs();
}

function renderCallCenterKPIs() {
  const total = visitasProgramadasData.length;
  if (!document.getElementById('cc-kpi-total')) return;

  const hoy = new Date();
  const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - hoy.getDay());
  inicioSemana.setHours(0,0,0,0);
  const estaSemana = visitasProgramadasData.filter(v => v.ts >= inicioSemana.getTime()).length;
  const confirmadas = visitasProgramadasData.filter(v => v.estado === 'completada').length;
  const devueltas = visitasProgramadasData.filter(v => v.esDevolucion);
  const devueltasConfirmadas = devueltas.filter(v => v.estado === 'completada').length;

  setText('cc-kpi-total', total);
  setText('cc-kpi-semana', estaSemana);
  setText('cc-kpi-confirmadas', confirmadas);
  setText('cc-kpi-devueltas', devueltas.length);
  setText('cc-kpi-devueltas-sub', devueltas.length ? devueltasConfirmadas+' ya retomadas' : 'ninguna todavía');

  const chartEl = document.getElementById('cc-chart-origen');
  if (chartEl) {
    const porOrigen = {};
    visitasProgramadasData.filter(v=>v.origen).forEach(v => porOrigen[v.origen] = (porOrigen[v.origen]||0)+1);
    const entries = Object.entries(porOrigen).sort((a,b)=>b[1]-a[1]);
    const max = Math.max(...entries.map(([,n])=>n), 1);
    const colV = {'Pauta Virtual':'var(--info)','Referido Cliente':'var(--ok)','Referido Empresa':'var(--cartera)','Redes Sociales':'var(--accent)','Feria':'var(--warn)','Puerta Fría':'var(--danger)','Agente Externo':'#c07a2a'};
    chartEl.innerHTML = entries.length ? entries.map(([k,n])=>`
      <div class="bar-item">
        <div class="bar-label"><span>${esc(k)}</span><span>${n}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%;background:${colV[k]||'#6b7280'};"></div></div>
      </div>`).join('') : '<div class="empty-state">Sin datos.</div>';
  }
}

function renderVisitasProgramadasAsesor() {
  const box   = document.getElementById('visitas-programadas-box');
  const cont  = document.getElementById('visitas-programadas-lista');
  const count = document.getElementById('visitas-programadas-count');
  if (!box || !cont) return;
  if (!misVisitasProgramadas.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  if (count) count.textContent = '(' + misVisitasProgramadas.length + ')';
  cont.innerHTML = misVisitasProgramadas.map(v => {
    const enProceso = v.estado === 'en_proceso';
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:var(--r-sm);padding:10px 12px;margin-bottom:6px;${enProceso?'border:1.5px solid var(--warn);':''}">
      <div>
        <div style="font-weight:600;">${esc(v.nombre)} ${enProceso?'<span style="font-size:var(--fs-xs);font-weight:700;color:var(--warn);background:var(--warn-bg);padding:2px 8px;border-radius:999px;margin-left:6px;">⚠️ Te quedó a medias — falta guardar</span>':''}</div>
        <div style="font-size:var(--fs-sm);color:var(--gris);">${esc(v.telefono||'')} · ${esc(v.fecha)} ${esc(v.hora||'')} ${v.origen?'· '+esc(v.origen):''}</div>
        ${v.interes?`<div style="font-size:var(--fs-sm);color:var(--ink-700);font-style:italic;margin-top:2px;">"${esc(String(v.interes).replace(/ · https?:\/\/\S+/,''))}"</div>`:''}
        ${v.cotizacionKey?`<button type="button" class="cz-btn-l" style="margin-top:6px;padding:4px 10px;" onclick="cotzAbrirHoja('${escJs(v.cotizacionKey)}')">Ver ${String(v.cotizacionCodigo||'').startsWith('UV-P')?'propuesta':'cotización'} ${esc(v.cotizacionCodigo||'')}</button>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;"><button onclick="confirmarVisitaProgramada('${v._key}')" style="padding:8px 14px;background:${enProceso?'var(--warn)':'var(--info)'};color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;white-space:nowrap;">${enProceso?'↻ Retomar y guardar':'✓ Vino: registrar visita'}</button>
      <button onclick="noVinoVisitaProgramada('${v._key}')" style="padding:6px 14px;background:none;color:var(--danger);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;white-space:nowrap;">✕ No vino</button></div>
    </div>`;
  }).join('');
}

function confirmarVisitaProgramada(key) {
  const v = misVisitasProgramadas.find(x => x._key === key);
  if (!v) return;
  // Precarga el formulario de Visita con lo que ya cargó el call center
  document.getElementById('f-nombre').value = v.nombre;
  document.getElementById('f-ciudad').value = '';
  document.getElementById('f-origen').value = v.origen || '';
  document.getElementById('f-fecha').value  = new Date().toISOString().split('T')[0];
  const interesInput = document.querySelector('input[name=interes][value=SI]');
  if (v.interes) document.getElementById('f-comentarios').value = 'Interés inicial (Call Center): ' + v.interes;
  document.getElementById('f-nombre').dataset.visitaProgramadaKey = key;
  if (v.cotizacionKey) { try { const c = (cotizacionesData||[]).find(x => x._key === v.cotizacionKey); const cod = c && (c.terreno || (c.sugeridos && c.sugeridos[0] && c.sugeridos[0].terreno)); const l = cod && todosLotes.find(x => _terrenoDeLote(x) === cod); if (l) seleccionarLotePicker(l._key); if (c && c.ciudad) document.getElementById('f-ciudad').value = c.ciudad; } catch(e) {} }
  // OJO: acá NO se marca "completada" — recién se marca así cuando el registro se GUARDA
  // de verdad (ver guardarVisita). Si se marcara acá, y el asesor no llega a guardar,
  // la asignación de Call Center desaparece sin que nadie se entere — era justo el bug.
  window._fbUpdateVisitaProgramada(key, { estado: 'en_proceso' });
  toastOk('Visita cargada en el formulario — completá el detalle y guardá para terminar.');
  document.getElementById('f-nombre').scrollIntoView({behavior:'smooth', block:'center'});
}


function abrirSelectorLote() {
  document.getElementById('lote-picker-buscar').value = '';
  renderListaLotesPicker();
  document.getElementById('modal-selector-lote').classList.add('open');
}
function cerrarSelectorLote() {
  document.getElementById('modal-selector-lote').classList.remove('open');
}

function renderListaLotesPicker() {
  const cont = document.getElementById('lote-picker-lista');
  if (!cont) return;
  const term = (document.getElementById('lote-picker-buscar')?.value || '').trim().toLowerCase();
  let datos = todosLotes;
  if (term) datos = datos.filter(l => _terrenoDeLote(l).toLowerCase().includes(term));
  if (!datos.length) { cont.innerHTML = '<div class="empty-state">Sin lotes que coincidan.</div>'; return; }

  const estColor = { 'Disponible':'var(--ok)', 'Reservado':'var(--warn)', 'Vendido':'var(--danger)', 'Bloqueado':'var(--accent)', 'No disponible':'#9ca3af' };

  cont.innerHTML = datos.map(l => {
    const terreno = _terrenoDeLote(l);
    // Solo "Vendido" bloquea de verdad — es lo único irreversible. Reservado/Bloqueado/No
    // disponible se pueden seleccionar igual (con advertencia): puede ser una reserva que
    // el asesor ya hizo directo en Orange y necesita registrar acá también.
    const bloqueado = l.estado === 'Vendido';
    const enNegociacion = l.estadoNegociacion === 'negociacion';
    const esMiNegociacion = enNegociacion && l.negociadoPorKey === asesorActual?._key;
    let infoExtra = '';
    if (l.estado === 'Vendido') infoExtra = `<span style="color:var(--danger);font-weight:600;">✕ Vendido</span>`;
    else if (l.estado === 'Reservado') infoExtra = `<span style="color:var(--warn);font-weight:600;">⚠️ Figura Reservado — si ya lo reservaste vos en Orange, podés seleccionarlo igual</span>`;
    else if (l.estado === 'No disponible') infoExtra = `<span style="color:#9ca3af;">⚠️ No disponible — verificá antes de ofrecerlo</span>`;
    else if (l.estado === 'Bloqueado') infoExtra = `<span style="color:var(--accent);font-weight:600;">⚠️ Marcado "Bloqueado" en Orange — verificá antes de ofrecerlo</span>`;
    else if (esMiNegociacion) infoExtra = `<span style="color:var(--info);font-weight:600;">📌 En negociación (vos)</span>`;
    else if (enNegociacion) infoExtra = `<span style="color:var(--warn);font-weight:600;">⚠️ En negociación por ${esc(l.negociadoPorNombre||'otro asesor')}</span>`;
    else infoExtra = `<span style="color:var(--ok);">Disponible</span>`;
    // Precio de lista: se oculta solo cuando está Vendido (única situación realmente cerrada)
    const precioTxt = (!bloqueado && l.precio) ? `<span style="color:var(--cartera);font-weight:600;margin-left:8px;">$${Number(l.precio).toLocaleString('es-BO')}</span>` : '';

    return `<div class="lote-picker-row ${bloqueado?'bloqueado':''}" onclick="${bloqueado?'':`seleccionarLotePicker('${l._key}')`}">
      <span style="font-weight:600;font-family:monospace;">${esc(terreno)}</span>
      <span style="font-size:var(--fs-sm);">${infoExtra}${precioTxt}</span>
    </div>`;
  }).join('');
}

function seleccionarLotePicker(key) {
  const l = todosLotes.find(x => x._key === key);
  if (!l) return;
  document.getElementById('f-terreno-key').value = key;
  document.getElementById('f-lote-nombre').textContent = _terrenoDeLote(l);
  document.getElementById('f-lote-nombre').dataset.precio = l.precio || 0;
  document.getElementById('f-lote-nombre').dataset.metraje = l.metraje || 0;
  pintarEstadoLoteSeleccionado(l);
  document.getElementById('f-lote-seleccionado').style.display = 'block';
  cerrarSelectorLote();
  calcularDescuentoReserva();
}

function pintarEstadoLoteSeleccionado(l) {
  const info = document.getElementById('f-lote-estado-info');
  const acciones = document.getElementById('f-lote-acciones');
  const enNegociacion = l.estadoNegociacion === 'negociacion';
  const esMiNegociacion = enNegociacion && l.negociadoPorKey === asesorActual?._key;
  const precioTxt = l.precio ? `<span style="color:var(--cartera);font-weight:600;">Precio de lista: $${Number(l.precio).toLocaleString('es-BO')}</span>` : '';

  if (l.estado === 'Vendido') {
    info.innerHTML = `<span style="color:var(--danger);font-weight:600;">Este lote ya está Vendido — no se puede volver a ofrecer.</span>`;
    acciones.innerHTML = '';
    return;
  }
  if (l.estado === 'Reservado') {
    info.innerHTML = `<span style="color:var(--warn);font-weight:600;">⚠️ Este lote figura "Reservado" en el sistema. Si ya lo reservaste vos directo en Orange, seguí igual para registrar la visita/reserva acá.</span><br>${precioTxt}`;
    acciones.innerHTML = `<button type="button" class="btn-clear" onclick="marcarLoteEnNegociacion()">📌 Marcar en negociación</button>`;
    return;
  }
  if (esMiNegociacion) {
    info.innerHTML = `<span style="color:var(--info);">📌 Ya lo tenés marcado en negociación.</span> ${precioTxt}`;
    acciones.innerHTML = `<button type="button" class="btn-clear" onclick="liberarNegociacionLote()">Liberar negociación</button>`;
  } else if (enNegociacion) {
    info.innerHTML = `<span style="color:var(--warn);font-weight:600;">⚠️ En negociación por ${esc(l.negociadoPorNombre||'otro asesor')} — igual podés cargar tu visita, pero avisale al cliente que puede haber otro interesado.</span><br>${precioTxt}`;
    acciones.innerHTML = `<button type="button" class="btn-clear" onclick="marcarLoteEnNegociacion()">Marcar en negociación también</button>`;
  } else {
    info.innerHTML = `<span style="color:var(--ok);">Disponible.</span> ${precioTxt}`;
    acciones.innerHTML = `<button type="button" class="btn-clear" onclick="marcarLoteEnNegociacion()">📌 Marcar en negociación</button>`;
  }
}

async function marcarLoteEnNegociacion() {
  const key = document.getElementById('f-terreno-key').value;
  if (!key) return;
  await window._fbUpdateLote(key, {
    estadoNegociacion: 'negociacion',
    negociadoPorKey: asesorActual._key,
    negociadoPorNombre: asesorActual.nombre,
    negociadoTs: Date.now()
  });
  toastOk('Lote marcado en negociación.');
}

async function liberarNegociacionLote() {
  const key = document.getElementById('f-terreno-key').value;
  if (!key) return;
  await window._fbUpdateLote(key, { estadoNegociacion: '', negociadoPorKey: null, negociadoPorNombre: null, negociadoTs: null });
  toastOk('Negociación liberada.');
}

function quitarLoteSeleccionado() {
  document.getElementById('f-terreno-key').value = '';
  document.getElementById('f-lote-seleccionado').style.display = 'none';
}

function toggleCampoReserva() {
  const conclusion = document.getElementById('f-conclusion').value;
  document.getElementById('f-reserva-box').style.display = conclusion === 'Reserva' ? 'block' : 'none';
  if (conclusion === 'Reserva') calcularDescuentoReserva();
}

function calcularDescuentoReserva() {
  const nombreEl = document.getElementById('f-lote-nombre');
  const precioLista = parseFloat(nombreEl?.dataset.precio) || 0;
  const metraje     = parseFloat(nombreEl?.dataset.metraje) || 0;
  const precioVenta = parseFloat(document.getElementById('f-precio-venta')?.value) || 0;

  const dispLista = document.getElementById('f-precio-lista-display');
  if (dispLista) dispLista.value = precioLista ? '$'+precioLista.toLocaleString('es-BO') : 'Elegí un lote primero';

  const box = document.getElementById('f-descuento-info');
  if (!precioLista || !precioVenta) { if (box) box.style.display = 'none'; return; }

  const descUsd = precioLista - precioVenta;
  const descPct = precioLista ? (descUsd/precioLista*100) : 0;
  const precioM2Final = metraje ? (precioVenta/metraje) : 0;

  setText('f-descuento-usd', (descUsd>=0?'$':'-$')+Math.abs(descUsd).toLocaleString('es-BO',{maximumFractionDigits:0}));
  setText('f-descuento-pct', descPct.toFixed(1)+'%');
  setText('f-precio-m2-final', metraje ? '$'+precioM2Final.toLocaleString('es-BO',{maximumFractionDigits:2}) : '—');
  const elUsd = document.getElementById('f-descuento-usd');
  const elPct = document.getElementById('f-descuento-pct');
  if (elUsd) elUsd.style.color = descUsd>0 ? 'var(--danger)' : 'var(--ok)';
  if (elPct) elPct.style.color = descUsd>0 ? 'var(--danger)' : 'var(--ok)';
  if (box) box.style.display = 'block';
}

/* ═══════════════════════════════════════════
   GUARDAR VISITA
═══════════════════════════════════════════ */
async function guardarVisita() {
  const fNombreEl = document.getElementById('f-nombre');
  const nombre = fNombreEl.value.trim();
  if (!nombre) {
    fNombreEl.classList.add('input-error');
    fNombreEl.focus();
    fNombreEl.scrollIntoView({behavior:'smooth', block:'center'});
    toastErr('Falta el nombre del prospecto — el campo quedó marcado en rojo arriba.');
    return;
  }
  fNombreEl.classList.remove('input-error');

  const conclusion = document.getElementById('f-conclusion').value;
  const terrenoKey = document.getElementById('f-terreno-key').value;
  const precioVenta = parseFloat(document.getElementById('f-precio-venta').value) || 0;

  if (conclusion === 'Reserva') {
    if (!terrenoKey) { toastErr('Para concluir en Reserva, primero elegí un lote del inventario.'); return; }
    if (!precioVenta) { toastErr('Para concluir en Reserva, ingresá el precio de venta acordado.'); return; }
    if (!document.getElementById('f-pago').value) {
      const elPago = document.getElementById('f-pago');
      elPago.classList.add('input-error');
      elPago.scrollIntoView({behavior:'smooth', block:'center'});
      toastErr('Para concluir en Reserva, elegí la modalidad de compra (forma de pago).');
      return;
    }
  }

  const fecha = document.getElementById('f-fecha').value || new Date().toISOString().split('T')[0];
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mes = meses[new Date(fecha+'T00:00:00').getMonth()];
  const loteSel = terrenoKey ? todosLotes.find(l=>l._key===terrenoKey) : null;

  const precioLista    = loteSel?.precio   || 0;
  const metrajeLote    = loteSel?.metraje  || 0;
  const descuentoUsd   = (conclusion==='Reserva' && precioLista) ? (precioLista - precioVenta) : 0;
  const descuentoPct   = (conclusion==='Reserva' && precioLista) ? Math.round((descuentoUsd/precioLista)*1000)/10 : 0;
  const precioM2Final  = (conclusion==='Reserva' && metrajeLote) ? Math.round((precioVenta/metrajeLote)*100)/100 : 0;

  const editKey = document.getElementById('f-editing-key')?.value || '';
  const original = editKey ? misRegs.find(r => r._key === editKey) : null;

  const data = {
    ts:                original ? original.ts : Date.now(), // preserva la fecha de creación real, no se pisa al editar
    fechaCarga:        original ? original.fechaCarga : new Date().toLocaleString('es-BO'),
    ultimaEdicionTs:   Date.now(),
    asesorNombre:      asesorActual.nombre,
    nombre,
    detalleVisita:     (document.querySelector('input[name=detalleVisita]:checked')||{}).value || '',
    genero:            (document.querySelector('input[name=genero]:checked')||{}).value || '',
    fecha, mes,
    horario:           document.getElementById('f-horario').value,
    ciudadProcedencia: document.getElementById('f-ciudad').value.trim(),
    origen:            document.getElementById('f-origen').value,
    interes:           (document.querySelector('input[name=interes]:checked')||{}).value || '',
    aspectoPreferente: document.getElementById('f-aspecto').value,
    presupuesto:       parseFloat(document.getElementById('f-presupuesto').value) || 0,
    calificacion:      (document.querySelector('input[name=calificacion]:checked')||{}).value || '',
    terrenoKey:        terrenoKey || '',
    terrenoInteres:    loteSel ? _terrenoDeLote(loteSel) : '',
    pctCierre:         parseFloat(document.getElementById('f-pct-cierre').value) || 0,
    motivoNoCierre:    document.getElementById('f-motivo-no-cierre').value.trim(),
    formaPago:         document.getElementById('f-pago').value,
    usoPropiedad:      (document.querySelector('input[name=usoPropiedad]:checked')||{}).value || '',
    conclusion,
    estado:            conclusion, // compat: paneles admin agrupan por "estado"
    // conclusionTs: cuándo se resolvió (Descartado o Reserva) — para medir "cuánto tardó en descartarse".
    // Si ya estaba resuelto con la MISMA conclusión, se conserva la fecha original; si cambió de estado, se actualiza.
    conclusionTs: (conclusion==='Descartado' || conclusion==='Reserva')
      ? ((original && original.conclusion===conclusion && original.conclusionTs) ? original.conclusionTs : Date.now())
      : null,
    precioVenta:       conclusion === 'Reserva' ? precioVenta : 0,
    precio:            conclusion === 'Reserva' ? precioVenta : 0, // compat: KPI de precio admin
    precioLista:       conclusion === 'Reserva' ? precioLista : 0,
    metraje:           conclusion === 'Reserva' ? metrajeLote : 0,
    descuentoUsd, descuentoPct, precioM2Final,
    comentarios:       document.getElementById('f-comentarios').value.trim(),
  };

  const btnR = document.querySelector('[onclick="guardarVisita()"]');
  btnLoading(btnR, true);
  try {
    if (editKey) {
      await window._fbUpdateRegistro(asesorActual._key, editKey, data);
    } else {
      const nuevoRef = await window._fbPushRegistro(asesorActual._key, data);
      // Si esta visita venía de una asignación de Call Center, recién ACÁ se cierra el
      // círculo de verdad — se guardó el registro, así que Call Center ya puede ver que
      // esa asignación se completó (y no se pierde silenciosa si el asesor no llega a guardar).
      const claveVisitaProgramada = fNombreEl.dataset.visitaProgramadaKey;
      if (claveVisitaProgramada) {
        await window._fbUpdateVisitaProgramada(claveVisitaProgramada, {
          estado: 'completada', registroKey: nuevoRef.key, completadaTs: Date.now(),
        });
        delete fNombreEl.dataset.visitaProgramadaKey;
      }
    }

    // Si la visita concluye en Reserva, el lote queda apartado de verdad
    if (conclusion === 'Reserva' && terrenoKey) {
      // Si OTRO asesor lo tenía en negociación, le avisamos que se le adelantaron
      if (loteSel?.estadoNegociacion === 'negociacion' && loteSel.negociadoPorKey && loteSel.negociadoPorKey !== asesorActual._key) {
        await window._fbPushNotificacion(loteSel.negociadoPorKey, {
          tipo: 'lote_reservado',
          mensaje: `El lote ${_terrenoDeLote(loteSel)} que tenías en negociación fue reservado por ${asesorActual.nombre}.`,
          ts: Date.now(),
          leida: false
        });
      }
      await window._fbUpdateLote(terrenoKey, {
        estado: 'Reservado',
        reservadoPorKey: asesorActual._key,
        reservadoPorNombre: asesorActual.nombre,
        precioVenta, precioLista, descuentoUsd, descuentoPct, precioM2Final,
        estadoNegociacion: '', negociadoPorKey: null, negociadoPorNombre: null,
      });
    }

    btnSuccess(btnR);
    toastOk((editKey ? 'Registro de ' : 'Visita de ') + nombre + (editKey ? ' actualizado.' : ' guardada correctamente.'));
    limpiarFormVisita();
    const sb = document.getElementById('success-banner');
    if (sb) {
      sb.querySelector('p').textContent = conclusion === 'Reserva'
        ? '🔒 Visita guardada y lote reservado — el formulario está listo para el próximo cliente'
        : (editKey ? '✅ Registro de "' + nombre + '" actualizado' : '✅ Visita de "' + nombre + '" guardada — el formulario está listo para el próximo cliente');
      sb.style.display='block'; setTimeout(()=>sb.style.display='none',3500);
    }
  } catch(e) {
    btnLoading(btnR, false);
    toastErr('Error al guardar: ' + e.message);
  }
}

function limpiarFormVisita() {
  delete document.getElementById('f-nombre')?.dataset.visitaProgramadaKey;
  ['f-nombre','f-fecha','f-horario','f-ciudad','f-presupuesto',
   'f-pct-cierre','f-motivo-no-cierre','f-precio-venta','f-comentarios'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['f-origen','f-aspecto','f-pago','f-conclusion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#atab-cargar input[type=radio]').forEach(r => {
    r.checked = false;
    r.closest('.radio-pill')?.classList.remove('sel-si','sel-no','sel-gen');
  });
  document.querySelector('input[name=detalleVisita][value=Presencial]').checked = true;
  quitarLoteSeleccionado();
  document.getElementById('f-reserva-box').style.display = 'none';
  salirModoEdicion();
}

function salirModoEdicion() {
  const editKeyEl = document.getElementById('f-editing-key');
  if (editKeyEl) editKeyEl.value = '';
  const aviso = document.getElementById('f-editando-aviso');
  if (aviso) aviso.style.display = 'none';
  const btn = document.getElementById('btn-guardar-visita');
  if (btn && !btn.classList.contains('is-loading')) { btn.textContent = '✓ Guardar visita'; delete btn.dataset.origText; }
}

function cancelarEdicionRegistro() {
  limpiarFormVisita();
  toastOk('Edición cancelada.');
}

function editarRegistroExistente(key) {
  const r = misRegs.find(x => x._key === key);
  if (!r) return;

  switchAsesorTab('cargar');

  document.getElementById('f-editing-key').value = key;
  document.getElementById('f-nombre').value  = r.nombre || '';
  document.getElementById('f-fecha').value   = r.fecha || '';
  document.getElementById('f-horario').value = r.horario || '';
  document.getElementById('f-ciudad').value  = r.ciudadProcedencia || '';
  document.getElementById('f-origen').value  = r.origen || '';
  document.getElementById('f-aspecto').value = r.aspectoPreferente || '';
  document.getElementById('f-presupuesto').value = r.presupuesto || '';
  document.getElementById('f-pct-cierre').value  = r.pctCierre || '';
  document.getElementById('f-motivo-no-cierre').value = r.motivoNoCierre || '';
  document.getElementById('f-pago').value    = r.formaPago || '';
  document.getElementById('f-comentarios').value = r.comentarios || '';
  document.getElementById('f-conclusion').value  = r.conclusion || '';

  document.querySelectorAll('#atab-cargar input[type=radio]').forEach(rad => { rad.checked = false; });
  if (r.detalleVisita) { const el = document.querySelector(`input[name=detalleVisita][value="${r.detalleVisita}"]`); if (el) el.checked = true; }
  if (r.genero)        { const el = document.querySelector(`input[name=genero][value="${r.genero}"]`); if (el) el.checked = true; }
  if (r.interes)       { const el = document.querySelector(`input[name=interes][value="${r.interes}"]`); if (el) el.checked = true; }
  if (r.calificacion)  { const el = document.querySelector(`input[name=calificacion][value="${r.calificacion}"]`); if (el) el.checked = true; }
  if (r.usoPropiedad)  { const el = document.querySelector(`input[name=usoPropiedad][value="${r.usoPropiedad}"]`); if (el) el.checked = true; }

  if (r.terrenoKey) {
    const lote = todosLotes.find(l => l._key === r.terrenoKey);
    if (lote) { seleccionarLotePicker(r.terrenoKey); }
  } else {
    quitarLoteSeleccionado();
  }
  if (r.precioVenta) document.getElementById('f-precio-venta').value = r.precioVenta;

  toggleCampoReserva();
  calcularDescuentoReserva();

  const aviso = document.getElementById('f-editando-aviso');
  if (aviso) aviso.style.display = 'flex';
  const btn = document.getElementById('btn-guardar-visita');
  if (btn) { btn.textContent = '💾 Guardar cambios'; delete btn.dataset.origText; }

  document.getElementById('atab-cargar').scrollIntoView({behavior:'smooth', block:'start'});
}

/* ═══════════════════════════════════════════
   MIS REGISTROS (vista asesor)
═══════════════════════════════════════════ */
function estadoBadgeClass(estado) {
  const m = {
    'Contrato':'badge-contrato','EN TRAMITACIÓN BANCARIA':'badge-tramite',
    'En Tramitación Bancaria':'badge-tramite','Reserva':'badge-reserva',
    'Seguimiento':'badge-seguim','Descartado':'badge-descartado',
    'Agenda':'badge-seguim','Entrega':'badge-entrega',
    'Coordinación Firma':'badge-firma','Desistido':'badge-desistido','Re-agendado':'badge-seguim'
  };
  return 'badge ' + (m[estado]||'badge-def');
}

function renderMisRegistros() {
  const cont = document.getElementById('mis-reg-list');
  if (!misRegs.length) {
    cont.innerHTML = '<div class="empty-state">Todavía no cargaste ningún registro.<br>Usá la pestaña "Cargar registro" para empezar.</div>';
    return;
  }
  const lim = window._misRegLim || 150;
  const lista = misRegs.length > lim ? misRegs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, lim) : misRegs;
  const vcPorReg = {}; (typeof ventasConcretadasData !== 'undefined' ? ventasConcretadasData : []).forEach(v => { if (v.registroKey && !vcPorReg[v.registroKey]) vcPorReg[v.registroKey] = v; });
  cont.innerHTML = lista.map(r => {
    const vc = vcPorReg[r._key] || null;
    let accionContrato = '';
    if (r.conclusion === 'Reserva') {
      if (!vc) {
        accionContrato = `<button onclick="abrirModalContratoFirmado('${r._key}')" style="padding:6px 14px;background:var(--cartera);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">📝 Marcar Contrato Firmado</button>`;
      } else if (vc.estadoAutorizacion === 'pendiente') {
        accionContrato = `<span class="badge" style="background:#fef3c7;color:#92400e;">⏳ Contrato firmado — pendiente de autorización</span>`;
      } else if (vc.estadoAutorizacion === 'aprobado') {
        accionContrato = `<span class="badge" style="background:var(--ok-bg);color:var(--ok-ink);">✅ Venta concretada — autorizada</span>`;
      } else if (vc.estadoAutorizacion === 'rechazado') {
        accionContrato = `<span class="badge" style="background:var(--danger-bg);color:var(--danger-ink);">✗ Rechazada — revisar con administración</span>`;
      }
    }
    return `
    <div class="reg-card">
      <div class="reg-card-top">
        <div>
          <div class="reg-cliente">${r.nombre || '—'}</div>
          <div class="reg-fecha">${r.fechaCarga || ''}</div>
        </div>
        <span class="${estadoBadgeClass(r.estado)}">${r.estado||'Sin estado'}</span>
      </div>
      <div class="reg-pills">
        ${r.origen      ? `<span class="badge badge-def">${r.origen}</span>` : ''}
        ${r.terrenoInteres ? `<span class="badge badge-bbdd">🗺 ${r.terrenoInteres}</span>` : (r.unidad ? `<span class="badge badge-bbdd">${r.unidad}</span>` : '')}
        ${r.calificacion? `<span class="badge badge-def">Calif. ${r.calificacion}</span>` : ''}
        ${r.formaPago   ? `<span class="badge badge-def">${r.formaPago}</span>` : ''}
        ${r.conclusion  ? `<span class="badge badge-def">${r.conclusion}</span>` : ''}
      </div>
      ${r.comentarios ? `<div class="reg-comentario">"${r.comentarios}"</div>` : ''}
      <div style="margin-top:10px;display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;">
        ${accionContrato}
        <button onclick="abrirCotizacionDesdeRegistro('${r._key}')" style="padding:6px 14px;background:var(--ok);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">💰 Generar cotización</button>
        ${(r.conclusion!=='Reserva' && r.conclusion!=='Descartado') ? `<button onclick="devolverACallCenter('${r._key}','${escJs(r.nombre)}')" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">↩️ Devolver a Call Center</button>` : ''}
        <button onclick="abrirSeguimientoCliente('${escJs(r.nombre)}')" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">💬 Seguimiento</button>
        <button onclick="editarRegistroExistente('${r._key}')" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">✏️ Editar / actualizar seguimiento</button>
      </div>
    </div>`;
  }).join('') + (misRegs.length > lim ? `<div style="text-align:center;padding:14px;color:var(--gris);font-size:var(--fs-sm);">Mostrando los ${lim} más recientes de ${misRegs.length} · <button type="button" onclick="window._misRegLim=(window._misRegLim||150)+300;renderMisRegistros()" style="padding:6px 14px;background:var(--fill);border:1.5px solid var(--line);border-radius:var(--r-sm);font-weight:600;cursor:pointer;">Mostrar más</button></div>` : '');
}

/* ═══════════════════════════════════════════
   DASHBOARD ADMIN
═══════════════════════════════════════════ */
