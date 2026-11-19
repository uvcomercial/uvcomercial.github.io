/* ═══════════════════════════════════════════
   DOCUMENTOS DE VENTA — Materia Reservada de Venta (RRHH) + Solicitud de Elaboración de Contrato (Legal)
   Dos flujos independientes. Cada uno trae lo que el asesor ya cargó al marcar Reserva;
   lo que falta se completa a mano en su propia pantalla. tipo: 'mr' (materia reserva) | 'sc' (solicitud contrato)
═══════════════════════════════════════════ */
let docReservaSeleccionada = { mr: null, sc: null };
let docCuotasLineas = { mr: [], sc: [], mrAccion: [] };
let documentosReservaData = [];
let docActualKey = null; // null = estamos armando uno nuevo. Si tiene valor, "Guardar" ACTUALIZA ese documento (no crea otro).

function cambiarModoMateriaReserva(modo) {
  document.getElementById('mr-modo-nuevo').style.display = (modo==='nuevo') ? '' : 'none';
  document.getElementById('mr-modo-guardados').style.display = (modo==='guardados') ? '' : 'none';
  const btnNuevo = document.getElementById('btn-mr-modo-nuevo');
  const btnGuardados = document.getElementById('btn-mr-modo-guardados');
  if (modo === 'guardados') {
    btnNuevo.style.background = 'transparent'; btnNuevo.style.boxShadow = 'none';
    btnGuardados.style.background = '#fff'; btnGuardados.style.boxShadow = '0 1px 3px rgba(0,0,0,.1)';
    renderDocumentosGuardados();
  } else {
    btnGuardados.style.background = 'transparent'; btnGuardados.style.boxShadow = 'none';
    btnNuevo.style.background = '#fff'; btnNuevo.style.boxShadow = '0 1px 3px rgba(0,0,0,.1)';
  }
}

async function guardarDocumentoReserva() {
  const r = docReservaSeleccionada.mr;
  if (!r) { toastErr('Elegí una reserva primero.'); return; }

  // N° de materia: avisar si ya lo usa otro documento (de otra reserva)
  const nroTxt = String(document.getElementById('mr-nro-reserva').value || '').trim();
  const usado = nroTxt && documentosReservaData.find(x => String(x.nroReserva || '').trim() === nroTxt && x._key !== docActualKey && x.registroKey !== r._key);
  if (usado && !confirm('El N° ' + nroTxt + ' ya lo tiene el documento de ' + (usado.cliente || '—') + '.\nEl siguiente libre es el ' + _mrSiguienteNro() + '.\n\n¿Guardar igual con el N° ' + nroTxt + '?')) return;

  const nombreQuienGuarda = asesorActual?.nombre || 'Admin';
  const data = {
    registroKey: r._key, cliente: r.nombre, terreno: r.terrenoInteres||'',
    nroReserva: document.getElementById('mr-nro-reserva').value,
    fecha: document.getElementById('mr-fecha').value,
    celular: document.getElementById('mr-celular').value,
    correo: document.getElementById('mr-correo').value,
    tieneCoprop: document.getElementById('mr-tiene-copropietario').value,
    copropietarioNombre: document.getElementById('mr-copropietario-nombre').value,
    copropietarioCorreo: document.getElementById('mr-copropietario-correo').value,
    copropietarioCelular: document.getElementById('mr-copropietario-celular').value,
    conAccion: document.getElementById('mr-con-accion').value,
    accionPrecio: document.getElementById('mr-accion-precio').value,
    tc: document.getElementById('mr-tc').value,
    politicaPct: document.getElementById('mr-politica-pct').value,
    categoria: document.getElementById('mr-categoria')?.value || '',
    autorizadoPor: document.getElementById('mr-autorizado-por').value,
    comentario: document.getElementById('mr-comentario').value,
    cuotas: docCuotasLineas.mr,
    cuotasAccion: docCuotasLineas.mrAccion,
    precioVenta: r.precioVenta||0,
  };

  // Si ya estamos editando un documento existente, ACTUALIZAMOS ese mismo — nunca se duplica.
  if (docActualKey) {
    await window._fbUpdateDocumentoReserva(docActualKey, {
      ...data,
      modificadoPorNombre: nombreQuienGuarda,
      modificadoTs: Date.now(),
      version: (documentosReservaData.find(x=>x._key===docActualKey)?.version || 1) + 1,
    });
    toastOk('Documento actualizado (versión ' + ((documentosReservaData.find(x=>x._key===docActualKey)?.version || 1) + 1) + ').');
    return;
  }

  // Es nuevo — pero antes chequeamos que no exista YA un documento para esta misma reserva,
  // para no crear un duplicado por accidente (control documental: un solo maestro por reserva).
  const existente = documentosReservaData.find(x => x.registroKey === r._key);
  if (existente) {
    const confirmar = confirm('Ya existe un documento guardado para esta reserva (N° ' + (existente.nroReserva||'—') + ', guardado por ' + (existente.guardadoPorNombre||'—') + ').\n\n¿Querés ACTUALIZAR ese documento con estos datos en vez de crear uno duplicado?\n\n(Aceptar = actualizar el existente / Cancelar = crear uno nuevo de todas formas)');
    if (confirmar) {
      docActualKey = existente._key;
      await window._fbUpdateDocumentoReserva(docActualKey, {
        ...data, modificadoPorNombre: nombreQuienGuarda, modificadoTs: Date.now(),
        version: (existente.version || 1) + 1,
      });
      toastOk('Documento actualizado (versión ' + ((existente.version || 1) + 1) + ').');
      return;
    }
  }

  const nuevaKey = await window._fbPushDocumentoReserva({
    ...data, version: 1, creadoPorNombre: nombreQuienGuarda, creadoTs: Date.now(),
    guardadoPorNombre: nombreQuienGuarda, // compat con la columna vieja de la tabla
  });
  docActualKey = nuevaKey.key;
  toastOk('Documento guardado.');
}

function renderDocumentosGuardados() {
  const tbody = document.getElementById('mr-guardados-tbody');
  if (!tbody) return;
  const term = (document.getElementById('mr-buscar-guardados')?.value||'').trim().toLowerCase();
  let datos = documentosReservaData;
  if (term) datos = datos.filter(d => (d.cliente||'').toLowerCase().includes(term) || (d.terreno||'').toLowerCase().includes(term));

  if (!datos.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Sin documentos guardados todavía.</div></td></tr>'; return; }

  tbody.innerHTML = datos.map(d => {
    const ultimoToque = d.modificadoTs ? ('Modificado ' + new Date(d.modificadoTs).toLocaleDateString('es-BO') + ' por ' + esc(d.modificadoPorNombre||'—'))
      : ('Creado por ' + esc(d.creadoPorNombre||d.guardadoPorNombre||'—'));
    return `<tr>
    <td>${esc(d.nroReserva||'—')}</td>
    <td>${esc(d.fecha||'—')}</td>
    <td>${esc(d.cliente)}</td>
    <td style="font-family:monospace;">${esc(d.terreno)}</td>
    <td style="font-weight:600;color:var(--cartera);">$${(d.precioVenta||0).toLocaleString('es-BO')}</td>
    <td style="font-size:var(--fs-xs);color:var(--gris);">v${d.version||1} · ${ultimoToque}</td>
    <td>
      <button class="btn-clear" style="padding:5px 8px;font-size:var(--fs-sm);" title="Ver Materia Reservada" onclick="verDocumentoGuardado('${d._key}','materia')">👁 Materia</button>
      <button class="btn-clear" style="padding:5px 8px;font-size:var(--fs-sm);" title="Ver Solicitud de Contrato" onclick="verDocumentoGuardado('${d._key}','contrato')">👁 Contrato</button>
      <button class="btn-clear" style="padding:5px 8px;font-size:var(--fs-sm);" onclick="abrirDocumentoGuardado('${d._key}')">✏️ Editar</button>
      <button class="btn-clear" style="padding:5px 8px;font-size:var(--fs-sm);color:var(--danger);" onclick="eliminarDocumentoGuardado('${d._key}')">🗑</button>
    </td>
  </tr>`;
  }).join('');
}

async function eliminarDocumentoGuardado(key) {
  const d = documentosReservaData.find(x => x._key === key);
  if (!d) return;
  if (!confirm('¿Eliminar el documento de "' + d.cliente + '" (terreno ' + d.terreno + ')? Esto no se puede deshacer.')) return;
  await window._fbRemoveDocumentoReserva(key);
  if (docActualKey === key) docActualKey = null;
  toastOk('Documento eliminado.');
}

// Restaura en memoria y en los campos del formulario (aunque esté oculto) todo lo de un
// documento guardado — lo usan tanto "Editar" como "Ver" (la diferencia es qué hacen después).
function _restaurarDatosDocGuardado(d) {
  const r = todosRegs.find(x => x._key === d.registroKey);
  if (!r) { toastErr('El registro original ya no existe.'); return null; }

  docReservaSeleccionada.mr = r;
  docCuotasLineas.mr = d.cuotas || [];
  docCuotasLineas.mrAccion = d.cuotasAccion || [];

  const lote = _loteDeTerreno(r.terrenoInteres);
  document.getElementById('mr-datos-auto').style.display = '';
  document.getElementById('mr-form').style.display = '';
  document.getElementById('mr-buscar').value = r.nombre;
  document.getElementById('mr-datos-auto-content').innerHTML = `
    <div><strong>Cliente</strong><br>${esc(r.nombre)}</div>
    <div><strong>Terreno</strong><br>${esc(r.terrenoInteres||'—')}</div>
    <div><strong>Módulo</strong><br>${esc(lote?.modulo||'—')}</div>
    <div><strong>Categoría</strong><br>${esc(lote?.categoria||'—')}</div>
    <div><strong>Modalidad</strong><br>${esc(r.formaPago||'—')}</div>
    <div><strong>Canal</strong><br>${esc(r.origen||'—')}</div>
    <div><strong>Precio lista</strong><br>$${(r.precioLista||0).toLocaleString('es-BO')}</div>
    <div><strong>Precio venta</strong><br>$${(r.precioVenta||0).toLocaleString('es-BO')}</div>
    <div><strong>Descuento</strong><br>$${(r.descuentoUsd||0).toLocaleString('es-BO')} (${r.descuentoPct||0}%)</div>
    <div><strong>Metraje</strong><br>${(r.metraje||0).toLocaleString('es-BO')} m²</div>
    <div><strong>$/m²</strong><br>$${r.precioM2Final||0}</div>
    <div><strong>Asesor</strong><br>${esc(r.asesorNombre||'—')}</div>`;

  document.getElementById('mr-nro-reserva').value = d.nroReserva||'';
  document.getElementById('mr-fecha').value = d.fecha||'';
  document.getElementById('mr-celular').value = d.celular||'';
  document.getElementById('mr-correo').value = d.correo||'';
  document.getElementById('mr-tiene-copropietario').value = d.tieneCoprop||'NO';
  document.getElementById('mr-copropietario-nombre').value = d.copropietarioNombre||'';
  document.getElementById('mr-copropietario-correo').value = d.copropietarioCorreo||'';
  document.getElementById('mr-copropietario-celular').value = d.copropietarioCelular||'';
  document.getElementById('mr-con-accion').value = d.conAccion||'NO';
  document.getElementById('mr-accion-precio').value = d.accionPrecio||'';
  document.getElementById('mr-tc').value = d.tc||'6.96';
  document.getElementById('mr-politica-pct').value = d.politicaPct||'';
  if (document.getElementById('mr-categoria')) document.getElementById('mr-categoria').value = d.categoria || _categoriaDeVenta(r, _loteDeTerreno(r.terrenoInteres));
  document.getElementById('mr-autorizado-por').value = d.autorizadoPor||'';
  document.getElementById('mr-comentario').value = d.comentario||'';

  toggleCopropietarioDoc('mr');
  toggleAccionDoc('mr');
  renderCuotasLineasDoc('mr');
  renderCuotasLineasDoc('mrAccion');
  return r;
}

// 👁 VER — solo abre el documento para reimprimir/consultar. No toca el modo de edición
// ni pide confirmación: mirar un documento oficial no es una acción riesgosa.
function verDocumentoGuardado(key, cual) {
  const d = documentosReservaData.find(x => x._key === key);
  if (!d) return;
  if (!_restaurarDatosDocGuardado(d)) return;
  if (cual === 'materia') generarMateriaReservada(); else generarSolicitudContrato();
}

// ✏️ EDITAR — modifica un documento oficial ya guardado, así que pide confirmación antes.
function abrirDocumentoGuardado(key) {
  const d = documentosReservaData.find(x => x._key === key);
  if (!d) return;
  const confirmar = confirm('Vas a EDITAR el documento de "' + d.cliente + '" (terreno ' + d.terreno + ', N° ' + (d.nroReserva||'—') + ').\n\nLos cambios que guardes van a reemplazar la versión actual de este documento.\n\n¿Confirmás que querés editarlo?');
  if (!confirmar) return;

  docActualKey = key; // de acá en más, "Guardar" ACTUALIZA este documento, no crea uno nuevo.
  const r = _restaurarDatosDocGuardado(d);
  if (!r) return;

  cambiarModoMateriaReserva('nuevo');
  toastOk('Cargado en el formulario — editá lo que necesites y tocá "Ver Materia" o "Ver Contrato" cuando quieras.');
}

function buscarReservasDoc(tipo) {
  const term = document.getElementById(tipo+'-buscar').value.trim().toLowerCase();
  const cont = document.getElementById(tipo+'-resultados');
  if (!term) { cont.innerHTML = ''; return; }
  const reservas = todosRegs.filter(r => r.conclusion === 'Reserva' &&
    ((r.nombre||'').toLowerCase().includes(term) || (r.terrenoInteres||'').toLowerCase().includes(term)))
    .sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,15);

  if (!reservas.length) { cont.innerHTML = '<div class="empty-state">Sin resultados.</div>'; return; }
  cont.innerHTML = reservas.map(r => `
    <div onclick="seleccionarReservaDoc('${tipo}','${r._key}')" style="padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r-sm);margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;" onmouseover="this.style.background='var(--fill)'" onmouseout="this.style.background=''">
      <span><strong>${esc(r.nombre)}</strong> — ${esc(r.terrenoInteres||'sin terreno')}</span>
      <span style="color:var(--gris);font-size:var(--fs-sm);">${esc(r.asesorNombre||'')} · ${esc(r.mes||'')}</span>
    </div>`).join('');

  window['_docReservasVisibles_'+tipo] = reservas;
}

/* N° de materia reservada: el siguiente al número más alto ya guardado (se puede cambiar a mano) */
function _mrSiguienteNro() {
  const nums = (documentosReservaData || []).map(d => parseInt(String(d.nroReserva || '').replace(/\D/g, ''), 10)).filter(n => n > 0 && n < 1e6);
  return nums.length ? Math.max(...nums) + 1 : todosRegs.filter(x => x.conclusion === 'Reserva').length;
}
function seleccionarReservaDoc(tipo, key) {
  const r = (window['_docReservasVisibles_'+tipo]||[]).find(x => x._key === key);
  if (!r) return;
  docReservaSeleccionada[tipo] = r;
  if (tipo === 'mr') docActualKey = null; // arrancamos un documento nuevo, no seguimos editando otro

  const lote = _loteDeTerreno(r.terrenoInteres);
  const modulo = lote?.modulo || '';
  const categoria = _categoriaDeVenta(r, lote);

  document.getElementById(tipo+'-datos-auto').style.display = '';
  document.getElementById(tipo+'-form').style.display = '';
  document.getElementById(tipo+'-resultados').innerHTML = '';
  document.getElementById(tipo+'-buscar').value = r.nombre;

  document.getElementById(tipo+'-datos-auto-content').innerHTML = `
    <div><strong>Cliente</strong><br>${esc(r.nombre)}</div>
    <div><strong>Terreno</strong><br>${esc(r.terrenoInteres||'—')}</div>
    <div><strong>Módulo</strong><br>${esc(modulo||'—')}</div>
    <div><strong>Categoría</strong><br>${esc(categoria||'—')}</div>
    <div><strong>Modalidad</strong><br>${esc(r.formaPago||'—')}</div>
    <div><strong>Canal</strong><br>${esc(r.origen||'—')}</div>
    <div><strong>Precio lista</strong><br>$${(r.precioLista||0).toLocaleString('es-BO')}</div>
    <div><strong>Precio venta</strong><br>$${(r.precioVenta||0).toLocaleString('es-BO')}</div>
    <div><strong>Descuento</strong><br>$${(r.descuentoUsd||0).toLocaleString('es-BO')} (${r.descuentoPct||0}%)</div>
    <div><strong>Metraje</strong><br>${(r.metraje||0).toLocaleString('es-BO')} m²</div>
    <div><strong>$/m²</strong><br>$${r.precioM2Final||0}</div>
    <div><strong>Asesor</strong><br>${esc(r.asesorNombre||'—')}</div>`;

  const hoyIso = new Date().toISOString().split('T')[0];
  if (tipo === 'mr') {
    document.getElementById('mr-nro-reserva').value = _mrSiguienteNro();
    // La fecha del documento arranca en la fecha de la venta (registro), y la política es la de ese mes.
    document.getElementById('mr-fecha').value = /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') ? r.fecha : hoyIso;
    document.getElementById('mr-celular').value = '';
    document.getElementById('mr-correo').value = '';
    const fMr = document.getElementById('mr-fecha'); fMr.onchange = () => _mrPintarPolitica(r);
    const sCat = document.getElementById('mr-categoria'); if (sCat) { sCat.value = categoria; sCat.onchange = () => _mrPintarPolitica(r); }
    _mrPintarPolitica(r);
  } else {
    document.getElementById('sc-fecha').value = hoyIso;
    document.getElementById('sc-celular').value = '';
    document.getElementById('sc-correo').value = '';
    document.getElementById('sc-autorizado-por').value = '';
  }

  docCuotasLineas[tipo] = [
    { concepto: 'Reserva', fecha: hoyIso, monto: 1000 },
    { concepto: 'Pago Final', fecha: '', monto: Math.max((r.precioVenta||0)-1000, 0) },
  ];
  renderCuotasLineasDoc(tipo);

  if (tipo === 'mr') {
    docCuotasLineas.mrAccion = [];
    document.getElementById('mr-con-accion').value = 'NO';
    document.getElementById('mr-accion-precio-cont').style.display = 'none';
    document.getElementById('mr-cuotas-accion-cont').style.display = 'none';
    renderCuotasLineasDoc('mrAccion');
  }
}

function toggleCopropietarioDoc(tipo) {
  const si = document.getElementById(tipo+'-tiene-copropietario').value === 'SI';
  document.getElementById(tipo+'-copropietario-nombre-cont').style.display = si ? '' : 'none';
  document.getElementById(tipo+'-copropietario-correo-cont').style.display = si ? '' : 'none';
  const contCel = document.getElementById(tipo+'-copropietario-celular-cont');
  if (contCel) contCel.style.display = si ? '' : 'none';
}
/* Acción del Country Club: precio fijo y plan de pagos estándar (el asesor solo ajusta las fechas) */
const ACCION_PRECIO_DOC = 10000;
const ACCION_PLAN_DOC = [['Reserva', 1000], ['Cuota 1', 2000], ['Cuota 2', 2000], ['Cuota 3', 2000], ['Cuota 4', 2000], ['Cuota final', 1000]];
function _sumarMesesIso(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _planAccionDoc() {
  const f0 = document.getElementById('mr-fecha')?.value || new Date().toISOString().split('T')[0];
  return ACCION_PLAN_DOC.map(([concepto, monto], i) => ({ concepto, fecha: _sumarMesesIso(f0, i), monto, fijo: true }));
}
function toggleAccionDoc(tipo) {
  const si = document.getElementById(tipo+'-con-accion').value === 'SI';
  const cont = document.getElementById(tipo+'-accion-precio-cont');
  if (cont) cont.style.display = si ? '' : 'none';
  if (tipo === 'mr') {
    const contCuotas = document.getElementById('mr-cuotas-accion-cont');
    if (contCuotas) contCuotas.style.display = si ? '' : 'none';
    if (si) {
      const p = document.getElementById('mr-accion-precio'); if (p && !parseFloat(p.value)) p.value = ACCION_PRECIO_DOC;
      // plan estándar: se arma solo si todavía no hay uno cargado
      if (!docCuotasLineas.mrAccion.some(c => c.monto > 0)) docCuotasLineas.mrAccion = _planAccionDoc();
      renderCuotasLineasDoc('mrAccion');
    }
  }
}
function restablecerPlanAccionDoc() { docCuotasLineas.mrAccion = _planAccionDoc(); document.getElementById('mr-accion-precio').value = ACCION_PRECIO_DOC; renderCuotasLineasDoc('mrAccion'); }

function renderCuotasLineasDoc(tipo) {
  const cont = document.getElementById(tipo+'-cuotas-lista');
  const lineas = docCuotasLineas[tipo];
  // plan estándar de la acción: concepto y monto fijos, solo se cambian las fechas
  const fijo = tipo === 'mrAccion' && lineas.length && lineas.every(c => c.fijo);
  const btnAdd = document.querySelector(`button[onclick="agregarLineaPagoDoc('${tipo}')"]`); if (btnAdd && tipo === 'mrAccion') btnAdd.style.display = fijo ? 'none' : '';
  cont.innerHTML = lineas.map((c,i) => `
    <div style="display:grid;grid-template-columns:1fr 140px 140px 34px;gap:8px;margin-bottom:6px;align-items:center;">
      <input type="text" value="${esc(c.concepto)}" placeholder="Concepto (ej: Cuota 1)" ${c.fijo ? 'readonly style="background:var(--fill);"' : ''} onchange="docCuotasLineas['${tipo}'][${i}].concepto=this.value" />
      <input type="date" value="${c.fecha||''}" onchange="docCuotasLineas['${tipo}'][${i}].fecha=this.value" />
      <input type="number" value="${c.monto||''}" step="0.01" ${c.fijo ? 'readonly style="background:var(--fill);"' : ''} onchange="docCuotasLineas['${tipo}'][${i}].monto=parseFloat(this.value)||0;recalcularTotalCuotasDoc('${tipo}');" />
      ${c.fijo ? '<span></span>' : `<button type="button" onclick="quitarLineaPagoDoc('${tipo}',${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;">×</button>`}
    </div>`).join('') + (fijo ? `<p style="font-size:var(--fs-xs);color:var(--gris);margin:4px 0 0;">Plan estándar de la acción ($${ACCION_PRECIO_DOC.toLocaleString('es-BO')}): solo se cambian las fechas.</p>` : (tipo === 'mrAccion' && lineas.length ? `<button type="button" onclick="restablecerPlanAccionDoc()" style="margin-top:4px;padding:5px 10px;background:none;border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;font-size:var(--fs-xs);">Usar el plan estándar de la acción</button>` : ''));
  recalcularTotalCuotasDoc(tipo);
}
function agregarLineaPagoDoc(tipo) {
  docCuotasLineas[tipo].push({ concepto: 'Cuota ' + docCuotasLineas[tipo].length, fecha:'', monto:0 });
  renderCuotasLineasDoc(tipo);
}
function quitarLineaPagoDoc(tipo, i) {
  docCuotasLineas[tipo].splice(i,1);
  renderCuotasLineasDoc(tipo);
}
function recalcularTotalCuotasDoc(tipo) {
  const total = docCuotasLineas[tipo].reduce((s,c)=>s+(c.monto||0),0);
  setText(tipo+'-cuotas-total', '$'+total.toLocaleString('es-BO'));
}

// Fecha larga en español: "jueves, 3 de septiembre de 2026"
function _fmtFechaLargaDoc(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  const fecha = new Date(y, m-1, d);
  const txt = fecha.toLocaleDateString('es-BO', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  return txt;
}

// "1-12-166" (Módulo-Manzana-Lote, formato interno) → "terreno 166 - manzano 12 - modulo 01"
function _fmtTerrenoDescriptivo(terrenoCodigo) {
  if (!terrenoCodigo) return '—';
  const partes = String(terrenoCodigo).split('-');
  if (partes.length < 3) return terrenoCodigo;
  const [modulo, manzana, lote] = partes;
  return `terreno ${lote} - manzano ${manzana} - modulo ${String(modulo).padStart(2,'0')}`;
}

function _fmtFechaDoc(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return d+'/'+m+'/'+y;
}

// Emblema de Urubó Village (el árbol circular) en base64 — extraído de la cotización oficial en PPT,
// recortado y optimizado a 220px de ancho para que el documento imprima liviano y nítido.
let VILLAGE_LOGO_B64 = 'data:image/png;base64,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';

// Membrete: emblema + wordmark, para el encabezado de cada documento impreso.
function _logoHtmlDoc() {
  return `<div style="display:flex;align-items:center;gap:10px;">
    <img src="${VILLAGE_LOGO_B64}" style="width:40px;height:auto;object-fit:contain;flex-shrink:0;"/>
    <div style="line-height:1;">
      <div style="font-family:'Georgia','Times New Roman',serif;font-size:14px;font-weight:700;letter-spacing:.03em;color:#1F3A2E;">URUBÓ<span style="font-weight:400;"> VILLAGE</span></div>
      <div style="font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:#9a9484;margin-top:2px;">Gestión Comercial</div>
    </div>
  </div>`;
}

// Franja de membrete superior reutilizable: logo a la izquierda, referencia y fecha a la derecha.
// El título del documento (h1) va DEBAJO, a todo el ancho — así la jerarquía queda clara:
// primero quién lo emite, después qué documento es.
function _membreteHtmlDoc(refNumero, fechaTxt) {
  return `<div class="membrete">
    ${_logoHtmlDoc()}
    <div class="membrete-meta">
      ${refNumero ? `<div class="membrete-ref">N° ${esc(refNumero)}</div>` : ''}
      <div class="membrete-fecha">${esc(fechaTxt||'')}</div>
    </div>
  </div>`;
}

function _abrirVentanaDocumento(titulo, htmlBody) {
  const w = window.open('', '_blank');
  const generadoTs = new Date().toLocaleString('es-BO');
  w.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title><meta charset="utf-8">
    <style>
      @page{ size:letter; margin:16mm 15mm 18mm; }
      *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
      html{ background:#8c8c8c; }
      body{ font-family:'Helvetica Neue',Arial,Helvetica,sans-serif; font-size:13px; line-height:1.45; color:#2a2a24;
        padding:26px 30px; max-width:760px; margin:18px auto; background:#fff;
        box-shadow:0 4px 28px rgba(0,0,0,.28); }
      h1{ text-align:left; font-size:19px; margin:0; font-weight:700; color:#1F3A2E; letter-spacing:.01em;
        font-family:Georgia,'Times New Roman',serif; }

      /* ── Membrete: logo + wordmark a la izquierda del título, datos del documento a la derecha ── */
      .membrete{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
      .membrete-meta{ text-align:right; }
      .membrete-doc{ font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#9a9484; }
      .membrete-ref{ font-size:15px; font-weight:700; color:#B3463C; margin-top:1px; }
      .membrete-fecha{ font-size:10.5px; color:#6b6558; margin-top:1px; }

      /* Doble filete: línea gruesa verde + hilo bronce debajo — remate de membrete elegante, poca tinta */
      .regla-doble{ margin:0 0 16px; }
      .regla-doble .l1{ height:2px; background:#1F3A2E; }
      .regla-doble .l2{ height:1px; background:#C9A86A; margin-top:2px; width:46%; }
      .regla-marca{ height:2px; background:#1F3A2E; width:72px; margin:0 auto 3px; }
      .regla-marca.izq{ margin:0 0 3px; }

      /* Filas compactas etiqueta+valor — SIN tabla, SIN cuadrícula. La etiqueta ocupa
         solo lo que necesita, el valor va pegado al lado (así se ve tu Excel, no estirado). */
      .fila{ display:flex; gap:8px; margin:2px 0; align-items:baseline; }
      .fila .etq{ font-weight:700; flex-shrink:0; color:#1F3A2E; }
      .fila.dos{ display:grid; grid-template-columns:1fr 1fr; gap:4px 20px; }
      .bloque-sombreado{ background:#F7F5EE; padding:7px 10px; border-radius:2px; border-left:3px solid #1F3A2E; }

      /* Tablas REALES (con cuadrícula) — solo para lo que en el Excel es tabla de verdad:
         Política/Propuesta, Detalle de pagos, y el bloque de firmas. Grilla fina color hueso,
         no negra — se ve impreso, no fotocopiado. */
      table{ width:100%; border-collapse:collapse; margin:5px 0; table-layout:fixed; break-inside:avoid; page-break-inside:avoid; }
      tr{ break-inside:avoid; page-break-inside:avoid; }
      td,th{ border:1px solid #d9d4c4; padding:5.5px 8px; font-size:12.5px; word-wrap:break-word; }
      th{ background:#FAF8F1; color:#1F3A2E; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }

      /* Encabezado de sección numerado — remplaza la franja sólida pesada por una etiqueta fina
         tipo "tab" editorial: fondo crema, texto verde en mayúsculas, acento a la izquierda. */
      .header-band td{ background:#F4F1E6; color:#1F3A2E; font-weight:700; padding:6px 10px;
        font-size:10.5px; text-transform:uppercase; letter-spacing:.1em;
        border:1px solid #d9d4c4; border-left:3px solid #1F3A2E; }

      .right{ text-align:right; } .center{ text-align:center; }
      .sign-box{ height:60px; border:1px solid #d9d4c4; width:50%; background:#FDFCF9; }
      .dashed td{ border:1px dashed #c9c4b0; }
      .fila-total{ background:#EDF1E6; font-weight:700; }
      .fila-total td{ border-color:#1F3A2E; }
      .cifra-verde{ color:#1F3A2E; font-weight:700; }

      /* Casillero para forma de pago — bien ancho y alto, para que entre un sello de goma */
      .check-sello{ border:1.5px solid #4a443a; display:inline-block; width:70px; height:34px; text-align:center;
        line-height:32px; font-size:15px; font-weight:700; vertical-align:middle; color:#1F3A2E; }

      /* Pie de página: confidencialidad + sello de generación — igual en ambos documentos */
      .doc-footer{ margin-top:22px; padding-top:8px; border-top:1px solid #e3dfd2;
        display:flex; justify-content:space-between; font-size:9px; color:#9a9484; letter-spacing:.02em; }

      @media print {
        html{ background:#fff; }
        body{ padding:0; margin:0; max-width:none; box-shadow:none; }
        .print-btn{ display:none !important; }
      }
      button.print-btn{ display:block; margin:0 auto 16px; padding:9px 18px; background:#1F3A2E; color:#fff;
        border:none; border-radius:6px; font-weight:700; cursor:pointer; letter-spacing:.02em; }
    </style></head><body>
    <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
    ${htmlBody}
    <div class="doc-footer">
      <span>Urubó Village · Documento de uso interno — no válido sin firmas autorizadas</span>
      <span>Generado ${esc(generadoTs)}</span>
    </div>
    </body></html>`);
  w.document.close();
}

/* Período de la política para la materia reservada: la fecha del documento (que arranca en la fecha de la venta) */
function _mrFechaPolitica(r) {
  const v = document.getElementById('mr-fecha')?.value || r?.fecha || '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : (r?.ts ? new Date(r.ts) : new Date());
  return { anio: d.getFullYear(), mes: PC_MESES[d.getMonth()] };
}
/* Categoría del terreno (A/B/C) para buscar la política: la del lote en Inventario; si el lote no la tiene, la de la venta concretada */
function _categoriaDeVenta(r, lote) {
  const c = String(lote?.categoria || '').trim().toUpperCase(); if (c) return c;
  const vc = (typeof ventasConcretadasData !== 'undefined' ? ventasConcretadasData : []).find(v => v.registroKey === r?._key && v.categoria);
  return vc ? String(vc.categoria).trim().toUpperCase() : '';
}
function _mrCategoria(r) { const s = document.getElementById('mr-categoria'); return (s && s.value) || _categoriaDeVenta(r, _loteDeTerreno(r?.terrenoInteres)); }
function _mrPintarPolitica(r) {
  const categoria = _mrCategoria(r);
  const { anio, mes } = _mrFechaPolitica(r);
  if (!categoria) { document.getElementById('mr-politica-pct').value = ''; document.getElementById('mr-politica-nota').textContent = '(el lote no tiene categoría en Inventario: elegila arriba para traer la política)'; return; }
  const politica = categoria ? obtenerPoliticaDescuento(r.formaPago, categoria, anio, mes) : null;
  document.getElementById('mr-politica-pct').value = politica ? politica.pctMax + '%' : '';
  document.getElementById('mr-politica-nota').textContent = politica ? `(política de ${politica.mes} ${politica.anio}${politica.mes !== mes || politica.anio !== anio ? ', vigente en ' + mes + ' ' + anio : ''})` : `(sin política cargada para ${mes} ${anio} — completá a mano)`;
}
function generarMateriaReservada() {
  const r = docReservaSeleccionada.mr;
  if (!r) { toastErr('Elegí una reserva primero.'); return; }
  const lote = _loteDeTerreno(r.terrenoInteres);
  const modulo = lote?.modulo || '';
  const categoria = _mrCategoria(r);
  const conAccion = document.getElementById('mr-con-accion').value === 'SI';
  const precioAccion = parseFloat(document.getElementById('mr-accion-precio').value)||0;
  const cuotas = docCuotasLineas.mr;
  const totalCuotas = cuotas.reduce((s,c)=>s+(c.monto||0),0);

  // Las 4 modalidades se muestran siempre, igual que en Solicitud de Contrato —
  // se completan solas desde Panel de Control cuando hay política cargada para esa categoría.
  const MODALIDADES_4 = ['Contado', 'Contado Diferido', 'Crédito Directo', 'Crédito Bancario'];
  // Política y plazos del mes de la venta (fecha del documento), no del día en que se imprime
  const { anio: anioPol, mes: mesPol } = _mrFechaPolitica(r);
  const politicas4 = MODALIDADES_4.map(m => categoria ? obtenerPoliticaDescuento(m, categoria, anioPol, mesPol) : null);
  const _normalizarTexto = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esModalidadActual = m => _normalizarTexto(r.formaPago) === _normalizarTexto(m);
  const checklistModalidad = MODALIDADES_4.map(m => esModalidadActual(m) ? 'X' : '');

  const filaPropuesta = MODALIDADES_4.map((m,i) => {
    if (esModalidadActual(m)) return { desc:'$'+(r.descuentoUsd||0).toLocaleString('es-BO'), pct:(r.descuentoPct||0)+'%', pv:'$'+(r.precioVenta||0).toLocaleString('es-BO'), m2:'$'+(r.precioM2Final||0) };
    return { desc:'$0', pct:'0%', pv:'$0', m2:'$0' };
  });

  // % de cada pago sobre el total del plan, y % acumulado corrido — así se ve de un vistazo
  // qué porción del precio representa cada cuota y cuánto se lleva cobrado hasta esa fila.
  // Base = suma real de las cuotas cargadas (no el precio de venta) para que el acumulado
  // cierre siempre en 100% aunque el plan todavía no sume exacto al precio pactado.
  let _acumMr = 0;
  const filasCuotas = cuotas.map(c => {
    const monto = c.monto || 0;
    const pct = totalCuotas > 0 ? (monto / totalCuotas * 100) : 0;
    _acumMr += pct;
    return `<tr><td>${_fmtFechaDoc(c.fecha)}</td><td>${esc(c.concepto)}</td>
      <td class="right">$${monto.toLocaleString('es-BO')}</td>
      <td class="center">${pct.toFixed(1)}%</td>
      <td class="center" style="font-weight:700;color:#1F3A2E;">${_acumMr.toFixed(1)}%</td></tr>`;
  }).join('');

  const cuotasAccion = docCuotasLineas.mrAccion || [];
  const totalAccion = cuotasAccion.reduce((s,c)=>s+(c.monto||0),0);
  let _acumAccion = 0;
  const filasAccion = cuotasAccion.map(c => {
    const monto = c.monto || 0;
    const pct = totalAccion > 0 ? (monto / totalAccion * 100) : 0;
    _acumAccion += pct;
    return `<tr><td>${esc(c.concepto)}</td><td>${_fmtFechaDoc(c.fecha)}</td>
      <td class="right">$${monto.toLocaleString('es-BO')}</td>
      <td class="center">${pct.toFixed(1)}%</td>
      <td class="center" style="font-weight:700;color:#1F3A2E;">${_acumAccion.toFixed(1)}%</td></tr>`;
  }).join('');
  const bloqueAccion = conAccion ? `
    <table><tr class="header-band"><td colspan="5">Venta Acción</td></tr></table>
    <table style="margin-top:0;">
      <colgroup><col style="width:30%;"><col style="width:22%;"><col style="width:20%;"><col style="width:14%;"><col style="width:14%;"></colgroup>
      <tr><th>Detalle</th><th>Fecha</th><th class="right">Monto</th><th class="center">%</th><th class="center">Acum.</th></tr>
      ${filasAccion}
      <tr class="fila-total"><td colspan="2"><strong>Total Acción</strong></td><td class="right"><strong>$${totalAccion.toLocaleString('es-BO')}</strong></td><td class="center"><strong>100%</strong></td><td class="center"><strong>100%</strong></td></tr>
    </table>` : '';

  const html = `
    ${_membreteHtmlDoc(document.getElementById('mr-nro-reserva').value, _fmtFechaDoc(document.getElementById('mr-fecha').value))}
    <h1>Materia Reservada de Venta</h1>
    <div class="regla-doble"><div class="l1"></div><div class="l2"></div></div>

    <div class="fila"><span class="etq" style="width:60px;">Cliente:</span><span>${esc(r.nombre)}</span></div>
    <div class="fila dos" style="grid-template-columns:1.4fr 1fr;">
      <span><span class="etq">Terreno:</span> ${esc(_fmtTerrenoDescriptivo(r.terrenoInteres))}</span>
      <span><span class="etq">Acción:</span> ${conAccion?'Sí':'No'}</span>
    </div>
    <div class="fila dos" style="grid-template-columns:1.4fr 1fr;">
      <span><span class="etq">Precio Lista:</span> ${(r.precioLista||0).toLocaleString('es-BO')}</span>
      <span><span class="etq">$/M2:</span> ${r.precioM2Final||0}</span>
    </div>
    <div class="fila dos" style="grid-template-columns:1.4fr 1fr;">
      <span><span class="etq">M2:</span> ${(r.metraje||0).toLocaleString('es-BO')}</span>
      <span><span class="etq">Canal:</span> ${esc(r.origen||'—')}</span>
    </div>
    <div class="fila dos" style="grid-template-columns:1.4fr 1fr;">
      <span><span class="etq">TCO:</span> ${esc(document.getElementById('mr-tc').value)}</span>
      <span><span class="etq">Categoría:</span> ${esc(categoria||'—')}</span>
    </div>

    <table style="margin-top:10px;"><tr class="header-band"><td colspan="5">1 &nbsp; Política de ${mesPol} ${anioPol}</td></tr></table>
    <table style="margin-top:0;">
      <tr><td></td>${MODALIDADES_4.map(m=>`<td class="center"><strong>${m}</strong></td>`).join('')}</tr>
      <tr><td><strong>Modalidad elegida</strong></td>${checklistModalidad.map(c=>`<td class="center" style="${c?'color:#1F3A2E;font-weight:700;font-size:15px;':''}">${c?'☑':'☐'}</td>`).join('')}</tr>
      <tr><td><strong>Descuento</strong></td>${politicas4.map(p=>`<td class="center">${p?p.pctMax+'%':'—'}</td>`).join('')}</tr>
      <tr><td><strong>Plazo</strong></td>${MODALIDADES_4.map(m => { const p = obtenerPlazoModalidad(m, anioPol, mesPol); return `<td class="center">${p?p.plazoMax+' '+p.unidad:'—'}</td>`; }).join('')}</tr>
      <tr><td><strong>Precio Mínimo</strong></td>${politicas4.map(p => { if (!p) return '<td class="center">—</td>'; const min = (r.precioLista||0) * (1 - p.pctMax/100); return `<td class="center">$${Math.round(min).toLocaleString('es-BO')}</td>`; }).join('')}</tr>
      <tr><td><strong>M2$ Mínimo</strong></td>${politicas4.map(p => { if (!p || !r.metraje) return '<td class="center">—</td>'; const min = (r.precioLista||0) * (1 - p.pctMax/100) / r.metraje; return `<td class="center">$${min.toFixed(1)}</td>`; }).join('')}</tr>
    </table>

    <table><tr class="header-band"><td colspan="5">2 &nbsp; Propuesta</td></tr></table>
    <table style="margin-top:0;">
      <tr><td></td>${MODALIDADES_4.map(m=>`<td class="center"><strong>${m}</strong></td>`).join('')}</tr>
      <tr><td><strong>Descuento</strong></td>${filaPropuesta.map(f=>`<td class="center">${f.desc}</td>`).join('')}</tr>
      <tr><td><strong>% Dcto</strong></td>${filaPropuesta.map(f=>`<td class="center">${f.pct}</td>`).join('')}</tr>
      <tr><td><strong>Precio de Venta</strong></td>${filaPropuesta.map(f=>`<td class="center">${f.pv}</td>`).join('')}</tr>
      <tr><td><strong>M2$ Venta</strong></td>${filaPropuesta.map(f=>`<td class="center">${f.m2}</td>`).join('')}</tr>
    </table>

    <table class="dashed">
      <colgroup><col style="width:16%;"><col style="width:36%;"><col style="width:20%;"><col style="width:14%;"><col style="width:14%;"></colgroup>
      <tr><th>Fecha</th><th>Detalle</th><th class="right">Monto</th><th class="center">%</th><th class="center">Acum.</th></tr>
      ${filasCuotas}
      <tr class="fila-total"><td colspan="2"><strong>Total</strong></td><td class="right"><strong>$${totalCuotas.toLocaleString('es-BO')}</strong></td><td class="center"><strong>100%</strong></td><td class="center"><strong>100%</strong></td></tr>
    </table>

    ${bloqueAccion}

    <p style="margin:12px 0 3px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1F3A2E;">Comentario sobre la venta</p>
    <div style="border:1px solid #d9d4c4;background:#FAF8F1;padding:8px 10px;min-height:30px;border-radius:2px;">${esc(document.getElementById('mr-comentario').value)}</div>

    <table style="margin-top:18px;">
      <colgroup><col style="width:50%;"><col style="width:50%;"></colgroup>
      <tr><th class="center">Asesor Comercial</th><th class="center">Controller</th></tr>
      <tr><td class="sign-box"></td><td class="sign-box"></td></tr>
      <tr><th class="center">Gerencia Comercial</th><th class="center">Gerencia Administrativa<br>y Financiera</th></tr>
      <tr><td class="sign-box"></td><td class="sign-box"></td></tr>
    </table>

    <p style="margin-top:10px;font-size:11px;"><strong>Correo:</strong> ${esc(document.getElementById('mr-correo').value)} &nbsp;&nbsp; <strong>Celular:</strong> ${esc(document.getElementById('mr-celular').value)}
      ${document.getElementById('mr-tiene-copropietario').value==='SI' ? `<br><strong>Correo copropietario:</strong> ${esc(document.getElementById('mr-copropietario-correo').value)} &nbsp;&nbsp; <strong>Celular copropietario:</strong> ${esc(document.getElementById('mr-copropietario-celular').value)}`:''}</p>`;

  _abrirVentanaDocumento('Materia Reservada de Venta - ' + r.nombre, html);
}

function generarSolicitudContrato() {
  const r = docReservaSeleccionada.mr;
  if (!r) { toastErr('Elegí una reserva primero.'); return; }
  const tieneCoprop = document.getElementById('mr-tiene-copropietario').value === 'SI';
  const conAccion = document.getElementById('mr-con-accion').value === 'SI';

  // Grilla 2x2 tal cual la planilla: Contado | Crédito Directo // Contado Diferido | Crédito Bancario
  const modalidadesCheck = { 'Contado':'', 'Contado Diferido':'', 'Crédito Directo':'', 'Crédito Bancario':'' };
  const _normalizarTexto2 = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const modKey = Object.keys(modalidadesCheck).find(k => _normalizarTexto2(r.formaPago) === _normalizarTexto2(k));
  if (modKey) modalidadesCheck[modKey] = 'X';

  const cuotas = docCuotasLineas.mr;
  const filasCuotas = cuotas.map(c => `<tr><td>${esc(c.concepto)}</td><td class="right">${(c.monto||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</td><td class="center">${_fmtFechaDoc(c.fecha)}</td></tr>`).join('');

  const filasContacto = [];
  if (document.getElementById('mr-correo').value) filasContacto.push(`Correo: ${esc(document.getElementById('mr-correo').value)}`);
  if (tieneCoprop && document.getElementById('mr-copropietario-correo').value) filasContacto.push(`Correo: ${esc(document.getElementById('mr-copropietario-correo').value)}`);
  const filasCelular = [];
  if (document.getElementById('mr-celular').value) filasCelular.push(`Celular: ${esc(document.getElementById('mr-celular').value)}`);
  if (tieneCoprop && document.getElementById('mr-copropietario-celular').value) filasCelular.push(`Celular: ${esc(document.getElementById('mr-copropietario-celular').value)}`);
  const pieContacto = filasContacto.map((c,i) => `<div class="fila dos"><span>${c}</span><span>${filasCelular[i]||''}</span></div>`).join('');

  const html = `
    ${_membreteHtmlDoc('', _fmtFechaLargaDoc(document.getElementById('mr-fecha').value))}
    <h1>Solicitud de Elaboración de Contrato</h1>
    <div class="regla-doble"><div class="l1"></div><div class="l2"></div></div>

    <div class="bloque-sombreado" style="margin-bottom:10px;">
      <div class="fila"><span class="etq">Nombre del Cliente:</span><span>${esc(r.nombre)}</span></div>
      ${tieneCoprop ? `<div class="fila"><span class="etq">Nombre Copropietario:</span><span>${esc(document.getElementById('mr-copropietario-nombre').value)}</span></div>` : ''}
      <div class="fila"><span class="etq">Fecha de la solicitud:</span><span>${_fmtFechaLargaDoc(document.getElementById('mr-fecha').value)}</span></div>
    </div>

    <div class="fila"><span class="etq">Terreno:</span><span>${esc(_fmtTerrenoDescriptivo(r.terrenoInteres))}</span></div>

    <div class="fila" style="margin-top:6px;">
      <span class="etq" style="width:112px;">Forma de pago:</span>
      <span style="margin-right:40px;">Contado <span class="check-sello">${modalidadesCheck['Contado']}</span></span>
      <span>Crédito Directo <span class="check-sello">${modalidadesCheck['Crédito Directo']}</span></span>
    </div>
    <div class="fila" style="margin-top:6px;">
      <span class="etq" style="width:112px;"></span>
      <span style="margin-right:14px;">Contado Diferido <span class="check-sello">${modalidadesCheck['Contado Diferido']}</span></span>
      <span>Crédito Bancario <span class="check-sello">${modalidadesCheck['Crédito Bancario']}</span></span>
    </div>

    <p style="margin:14px 0 3px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1F3A2E;">Observaciones</p>
    <div style="border:1px solid #d9d4c4;background:#FAF8F1;padding:8px 10px;min-height:50px;border-radius:2px;">
      Venta de terreno a ${esc(r.formaPago||'')}${conAccion?' con acción del country club':' sin acción del country club'}.<br>
      ${esc(document.getElementById('mr-comentario').value)}
    </div>

    <div style="margin-top:14px;">
      <div class="fila"><span class="etq" style="width:220px;">Precio de lista del terreno:</span><span>${(r.precioLista||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</span></div>
      <div class="fila"><span class="etq" style="width:220px;">Descuento:</span><span>${(r.descuentoUsd||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</span></div>
      <div class="fila"><span class="etq" style="width:220px;">Precio de venta:</span><span class="cifra-verde">${(r.precioVenta||0).toLocaleString('es-BO',{minimumFractionDigits:2})}</span></div>
    </div>

    <table style="margin-top:10px;">
      <tr><th>Detalle</th><th>Monto</th><th>Fecha de pago</th></tr>
      ${filasCuotas}
    </table>

    <p style="margin:12px 0 3px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1F3A2E;">Solicitado por</p>
    <div style="border:1px solid #d9d4c4;background:#FDFCF9;min-height:44px;border-radius:2px;"></div>

    <p style="margin:12px 0 3px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1F3A2E;">Autorizado por</p>
    <div style="border:1px solid #d9d4c4;background:#FAF8F1;min-height:44px;padding:6px;border-radius:2px;">${esc(document.getElementById('mr-autorizado-por').value)}</div>

    <div style="margin-top:14px;">
      ${pieContacto}
    </div>`;

  _abrirVentanaDocumento('Solicitud de Elaboracion de Contrato - ' + r.nombre, html);
}

/* ═══════════════════════════════════════════
   COTIZACIONES — el cliente la ve por link público, sin login, y puede confirmarla.
═══════════════════════════════════════════ */
let cotizacionesData = [];


function cambiarModoCotizaciones(modo) {
  if (modo === 'nueva') setTimeout(cotzMontar, 0);
  document.getElementById('cotiz-modo-nueva').style.display = (modo==='nueva') ? '' : 'none';
  document.getElementById('cotiz-modo-guardadas').style.display = (modo==='guardadas') ? '' : 'none';
  const btnN = document.getElementById('btn-cotiz-modo-nueva');
  const btnG = document.getElementById('btn-cotiz-modo-guardadas');
  if (modo === 'guardadas') {
    btnN.style.background='transparent'; btnN.style.boxShadow='none';
    btnG.style.background='#fff'; btnG.style.boxShadow='0 1px 3px rgba(0,0,0,.1)';
    renderCotizacionesGuardadas();
  } else {
    btnG.style.background='transparent'; btnG.style.boxShadow='none';
    btnN.style.background='#fff'; btnN.style.boxShadow='0 1px 3px rgba(0,0,0,.1)';
  }
}













function _estadoRealCotizacion(c) {
  if (c.estado === 'confirmado') return 'confirmado';
  if (c.fechaVencimiento && Date.now() > c.fechaVencimiento) return 'vencido';
  return 'pendiente';
}



/* ═══════════════════════════════════════════
   VISTA PÚBLICA DE COTIZACIÓN — sin login, la ve el cliente por el link.
   Estilo: negro/crema/verde bosque, serif editorial — igual al tríptico de la marca.
═══════════════════════════════════════════ */




/* ═══════════════════════════════════════════
   SIMULADOR DE CUOTAS — herramienta libre para vendedores, no guarda nada.
   El descuento sale de la política real (Modalidad × Categoría), no se tipea a mano.
═══════════════════════════════════════════ */






 // líneas de pago dentro del plazo de días, cuando la modalidad es Contado

/* ── Sub-navegación dentro de Cotizaciones (vendedor): Simulador / Nueva / Mis cotizaciones ── */
function cambiarSubTabCotizVendedor(id) {
  if (id === 'simulador') setTimeout(cotzMontar, 0);
  const modos = { simulador:'cotiz-sub-simulador', mias:'cotiz-sub-mias' };
  Object.entries(modos).forEach(([k, panelId]) => {
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = (k === id) ? '' : 'none';
    const btn = document.getElementById('btn-cotizsub-' + k);
    if (btn) {
      btn.style.background = (k === id) ? '#fff' : 'transparent';
      btn.style.boxShadow = (k === id) ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
    }
  });
  if (id === 'mias') renderMisCotizacionesVendedor();
}









// Toma exactamente lo que se armó en el simulador (terreno, modalidad, descuento REAL
// aplicado, plan de pago) y lo pasa al formulario de "Generar cotización" — así el
// descuento con el que el asesor cierra queda detallado en la cotización, sin re-tipear nada.


/* ═══════════════════════════════════════════
   COTIZACIONES — versión para vendedores (panel usuario), mismo motor que el admin
   pero con sus propios IDs (uc-) para no chocar con el panel admin.
═══════════════════════════════════════════ */














// Se llama desde "Mis Registros" — precarga el nombre del cliente y, si ya tenía un
// terreno de interés cargado, lo busca solo, para no escribir todo de nuevo.




async function confirmarCotizacionDesdeAdmin(key) {
  const c = cotizacionesData.find(x=>x._key===key);
  if (!c) return;
  if (!await confirmDialog('El cliente va a ver "Confirmada por tu asesor" al abrir su cotización.', { title:'Confirmar cotización de '+c.cliente, okText:'Confirmar' })) return;
  await window._fbUpdateCotizacion(key, { estado: 'confirmado', fechaConfirmacion: Date.now(), confirmadoPorNombre: asesorActual?.nombre || 'Admin' });
  toastOk('Cotización confirmada.');
}

async function eliminarCotizacion(key) {
  const c = cotizacionesData.find(x=>x._key===key);
  if (!c) return;
  if (!await confirmDialog('Se borra el registro y el enlace deja de funcionar. No se puede deshacer.', { title:'Eliminar cotización de '+c.cliente, okText:'Eliminar' })) return;
  await window._fbRemoveCotizacion(key);
  toastOk('Cotización eliminada.');
}

function abrirModalCierreExterno() {
  const selTerreno = document.getElementById('ce-terreno');
  selTerreno.innerHTML = '<option value="">Seleccionar del inventario...</option>' +
    todosLotes.filter(l => l.estado !== 'Vendido').map(l =>
      `<option value="${l._key}">${esc(_terrenoDeLote(l))}${l.estado==='Reservado'?' (ya reservado)':''}</option>`).join('');

  const selOrigen = document.getElementById('ce-origen');
  selOrigen.innerHTML = '<option value="">Seleccionar...</option>' +
    origenesData.map(o => `<option value="${esc(o.nombre)}" ${o.nombre==='Agente Externo'?'selected':''}>${esc(o.nombre)}</option>`).join('');

  ['ce-nombre','ce-agente','ce-precio-venta'].forEach(id => document.getElementById(id).value = '');
  // ¿Quién cerró? Agente externo, o alguien del equipo que no es asesor (call center, gerencia): ese cierre es interno.
  const selQ = document.getElementById('ce-quien');
  if (selQ) {
    const internos = asesores.filter(a => a.activo !== false && /callcenter|gerencia/.test(a.rol || '')).sort((x, y) => (y.rol === 'callcenter') - (x.rol === 'callcenter'));
    selQ.innerHTML = '<option value="externo">Agente inmobiliario externo</option>' +
      internos.map(a => `<option value="${a._key}">${esc(a.nombre)} · ${a.rol === 'callcenter' ? 'Call Center' : 'Gerencia'} (venta interna)</option>`).join('');
    selQ.value = 'externo'; ceCambioQuien();
  }
  document.getElementById('ce-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('ce-precio-lista-display').value = '';
  document.getElementById('ce-modalidad').value = '';
  document.querySelectorAll('input[name=ceCalificacion]').forEach(r => r.checked = false);
  document.getElementById('ce-descuento-info').style.display = 'none';

  document.getElementById('modal-cierre-externo').classList.add('open');
}
const _cerradoPorDe = a => a?.rol === 'callcenter' ? 'Call Center' : a?.rol === 'gerencia' ? 'Gerencia' : 'Equipo UV';

/* Pasar un cierre cargado como "agente externo" a alguien del equipo (call center, gerencia).
   Mueve el registro a la planilla de esa persona, conserva todos los datos y deja constancia del cambio. */
async function reasignarCierreExterno(key) {
  const r = todosRegs.find(x => x._key === key && x.esExterno);
  if (!r) return toastErr('No encontré ese cierre externo.');
  const internos = asesores.filter(a => a.activo !== false && /callcenter|gerencia/.test(a.rol || '')).sort((x, y) => (y.rol === 'callcenter') - (x.rol === 'callcenter'));
  if (!internos.length) return toastErr('No hay usuarios de Call Center o Gerencia activos.');
  const opts = internos.map(a => `<option value="${a._key}">${esc(a.nombre)} · ${_cerradoPorDe(a)}</option>`).join('');
  const ok = await confirmDialog(`<div style="text-align:left">La venta de <b>${esc(r.nombre || '')}</b> (${esc(r.terrenoInteres || '')}) figura como de agente externo${r.agenteExterno ? ' (' + esc(r.agenteExterno) + ')' : ''}. Pasarla a:<br><select id="reasig-quien" style="margin-top:8px;width:100%">${opts}</select><div style="margin-top:8px;font-size:12px;color:var(--gris)">Va a sumar a las ventas del equipo y a la meta.</div></div>`, { title: 'Cambiar quién cerró la venta', okText: 'Cambiar', html: true });
  if (!ok) return;
  const dest = asesores.find(a => a._key === (document.getElementById('reasig-quien')?.value || internos[0]._key)) || internos[0];
  const { _key, _asesorId, ...datos } = r;
  const nuevo = { ...datos, esExterno: false, asesorNombre: dest.nombre, asesorKey: dest._key, cerradoPor: _cerradoPorDe(dest),
    reasignado: { de: _asesorId, agenteExterno: r.agenteExterno || '', por: (typeof _cobUsuario === 'function' ? _cobUsuario() : 'Administrador'), ts: Date.now() } };
  delete nuevo.agenteExterno;
  try {
    await window._fbSetRegistro(dest._key, _key, nuevo);
    await window._fbRemoveRegistro(_asesorId, _key);
    if (r.terrenoKey) await window._fbUpdateLote(r.terrenoKey, { reservadoPorKey: dest._key, reservadoPorNombre: dest.nombre + ' (' + _cerradoPorDe(dest) + ')' });
    toastOk('Listo: la venta de ' + (r.nombre || '') + ' quedó a nombre de ' + dest.nombre + ' (' + _cerradoPorDe(dest) + ').');
  } catch (e) { toastErr('No se pudo cambiar: ' + e.message); }
}

function ceCambioQuien() {
  const ext = (document.getElementById('ce-quien')?.value || 'externo') === 'externo';
  const box = document.getElementById('ce-agente-box'); if (box) box.style.display = ext ? '' : 'none';
}
function cerrarModalCierreExterno() {
  document.getElementById('modal-cierre-externo').classList.remove('open');
}

function calcularDescuentoCierreExterno() {
  const loteKey = document.getElementById('ce-terreno').value;
  const lote = todosLotes.find(l => l._key === loteKey);
  const precioLista = lote?.precio || 0;
  const metraje = lote?.metraje || 0;
  const precioVenta = parseFloat(document.getElementById('ce-precio-venta').value) || 0;

  document.getElementById('ce-precio-lista-display').value = precioLista ? '$'+precioLista.toLocaleString('es-BO') : (loteKey ? 'Este lote no tiene precio cargado' : '');

  const box = document.getElementById('ce-descuento-info');
  if (!precioLista || !precioVenta) { box.style.display = 'none'; return; }

  const descUsd = precioLista - precioVenta;
  const descPct = precioLista ? (descUsd/precioLista*100) : 0;
  const precioM2 = metraje ? (precioVenta/metraje) : 0;

  setText('ce-descuento-usd', (descUsd>=0?'$':'-$')+Math.abs(descUsd).toLocaleString('es-BO',{maximumFractionDigits:0}));
  setText('ce-descuento-pct', descPct.toFixed(1)+'%');
  setText('ce-precio-m2', metraje ? '$'+precioM2.toLocaleString('es-BO',{maximumFractionDigits:2}) : '—');
  box.style.display = 'block';
}

async function guardarCierreExterno() {
  const nombre  = document.getElementById('ce-nombre').value.trim();
  const agente  = document.getElementById('ce-agente').value.trim();
  const loteKey = document.getElementById('ce-terreno').value;
  const fecha   = document.getElementById('ce-fecha').value || new Date().toISOString().split('T')[0];
  const precioVenta = parseFloat(document.getElementById('ce-precio-venta').value) || 0;
  const modalidad = document.getElementById('ce-modalidad').value;
  const origen  = document.getElementById('ce-origen').value;
  const calificacion = (document.querySelector('input[name=ceCalificacion]:checked')||{}).value || '';
  const quien = document.getElementById('ce-quien')?.value || 'externo';
  const interno = quien !== 'externo' ? asesores.find(a => a._key === quien) : null;

  if (!nombre)  { toastErr('Falta el nombre del cliente.'); return; }
  if (!interno && !agente)  { toastErr('Falta el nombre del agente externo.'); return; }
  if (!loteKey) { toastErr('Elegí el terreno del inventario.'); return; }
  if (!precioVenta) { toastErr('Falta el precio de venta.'); return; }

  const lote = todosLotes.find(l => l._key === loteKey);
  const precioLista = lote?.precio || 0;
  const metraje = lote?.metraje || 0;
  const descuentoUsd = precioLista ? (precioLista - precioVenta) : 0;
  const descuentoPct = precioLista ? Math.round((descuentoUsd/precioLista)*1000)/10 : 0;
  const precioM2Final = metraje ? Math.round((precioVenta/metraje)*100)/100 : 0;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mes = meses[new Date(fecha+'T00:00:00').getMonth()];
  const anio = new Date(fecha+'T00:00:00').getFullYear();

  const btn = document.querySelector('#modal-cierre-externo .confirm-btn-ok');
  btnLoading(btn, true);
  try {
    await window._fbPushRegistro(interno ? interno._key : 'agente_externo', {
      ts: Date.now(),
      fechaCarga: new Date().toLocaleString('es-BO'),
      esExterno: !interno,
      ...(interno ? { cerradoPor: _cerradoPorDe(interno), asesorKey: interno._key } : { agenteExterno: agente }),
      asesorNombre: interno ? interno.nombre : '🤝 ' + agente + ' (externo)',
      nombre, fecha, mes, anio,
      terrenoKey: loteKey,
      terrenoInteres: lote ? _terrenoDeLote(lote) : '',
      precioLista, metraje, precioVenta, precio: precioVenta,
      descuentoUsd, descuentoPct, precioM2Final,
      formaPago: modalidad, origen, calificacion,
      conclusion: 'Reserva', estado: 'Reserva',
      comentarios: interno ? 'Cierre registrado manualmente — venta cerrada por ' + interno.nombre + ' (' + _cerradoPorDe(interno) + ').' : 'Cierre registrado manualmente — venta directa de agente externo.',
    });

    if (loteKey) {
      await window._fbUpdateLote(loteKey, {
        estado: 'Reservado',
        reservadoPorKey: interno ? interno._key : 'agente_externo',
        reservadoPorNombre: interno ? interno.nombre + ' (' + _cerradoPorDe(interno) + ')' : agente + ' (agente externo)',
        precioVenta, precioLista, descuentoUsd, descuentoPct, precioM2Final,
        estadoNegociacion: '', negociadoPorKey: null, negociadoPorNombre: null,
      });
    }

    btnSuccess(btn);
    toastOk(interno ? 'Cierre de ' + nombre + ' registrado a nombre de ' + interno.nombre + ' — suma a las ventas del equipo.' : 'Cierre externo de ' + nombre + ' registrado — no suma a la meta del equipo.');
    setTimeout(cerrarModalCierreExterno, 500);
  } catch(e) {
    btnLoading(btn, false);
    toastErr('Error al guardar: ' + e.message);
  }
}
