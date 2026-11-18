/* ════════════════════════════════════════════════════════════════════════
   RECORDATORIOS DE COBRANZA (CRM de Cartera)
   - Bandeja "Recordatorios de hoy" arriba del CRM: compromisos de hoy y vencidos sin cerrar.
     Cada uno ve los suyos (responsable); administrador y gerencia ven todos.
   - Mensaje de WhatsApp armado con la deuda real del cliente (Orange / corte del CRM),
     firmado por el Departamento de Cobranzas, con tono según la situación.
   - Copiar mensaje, abrir WhatsApp con el mensaje cargado, copiar o descargar el QR de pago.
   - Aviso 15 minutos antes de la hora del compromiso (si la plataforma está abierta).
   No envía nada solo: quien gestiona revisa y manda el mensaje.
   ════════════════════════════════════════════════════════════════════════ */
const RC_QR = 'img/qr-cobranza.jpg';
const RC_PAGO = 'BNB · Cta. 2000155570 · en Bs';
const RC_AVISO_MIN = 15;

const _rcTitulo = s => String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()).replace(/\s+/g, ' ').trim();
const _rcUsd = v => 'US$ ' + Number(v || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _rcEsAdmin = () => (typeof modoAdmin !== 'undefined' && modoAdmin) || (typeof asesorActual !== 'undefined' && /gerencia/i.test(asesorActual?.rol || ''));
const _rcCompsDe = key => Object.entries(cobCompromisos || {}).filter(([, c]) => c.clienteKey === key).map(([id, c]) => ({ ...c, _id: id }));

function _rcCuando(c) {
  const hoy = _cobHoy(), man = _cobSumarDias(hoy, 1);
  const dia = c.fecha === hoy ? 'hoy' : c.fecha === man ? 'mañana' : c.fecha < hoy ? 'el ' + _cobF(c.fecha) : 'el ' + _cobF(c.fecha);
  return dia + (c.hora ? ' a las ' + c.hora : '');
}
function _rcLotes(c, a) {
  const t = [...new Set([...(a ? [...a.terrenos] : []), ...(c.terrenos || [])])].filter(Boolean);
  const conc = c.aplica === 'Acción' ? 'acción' : c.aplica === 'Terreno' ? 'terreno' : (a && a.cuotasA && !a.cuotasT ? 'acción' : 'terreno');
  if (!t.length) return 'su ' + conc;
  return t.length === 1 ? `su ${conc} ${t[0]}` : `sus ${conc === 'acción' ? 'acciones' : 'terrenos'} ${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`;
}

/* Arma el mensaje según el tipo de compromiso y la situación del cliente */
function rcMensaje(c) {
  const a = (cobAgg || []).find(x => x.key === c.clienteKey) || null;
  const h = new Date().getHours(), saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = _rcTitulo(c.cliente);
  const lotes = _rcLotes(c, a);
  const previos = _rcCompsDe(c.clienteKey).filter(x => x._id !== c._id && x.estado === 'Incumplido').sort((x, y) => (y.resueltoTs || 0) - (x.resueltoTs || 0));
  const dias = a ? (a.diasHoy ?? a.dias ?? 0) : 0;
  const cuotas = a ? (a.cuotasT || 0) + (a.cuotasA || 0) : 0;
  const firme = dias > 60 || previos.length > 0;
  const enc = `${saludo}, ${nombre}. Le saluda el Departamento de Cobranzas de Urubó Village.`;
  const pago = `Puede pagar por transferencia o escaneando el QR que le enviamos a continuación (${RC_PAGO}). Por favor, envíenos una copia legible del comprobante para que podamos registrar su pago.`;
  if (c.tipo === 'Pago' || c.tipo === 'Avance') {
    const que = c.tipo === 'Avance' ? 'abono' : 'pago', vencido = c.fecha < _cobHoy();
    if (!firme) return vencido
      ? `${enc}\n\nLe escribimos por su compromiso de ${que} de ${_rcUsd(c.monto)} del ${_cobF(c.fecha)}, correspondiente a ${lotes}, que aún no tenemos registrado.\n\nSi ya realizó el pago, por favor envíenos el comprobante. Si no, puede pagar por transferencia o escaneando el QR que le enviamos a continuación (${RC_PAGO}).\n\nQuedamos atentos. ¡Muchas gracias!`
      : `${enc}\n\nLe recordamos su compromiso de ${que} de ${_rcUsd(c.monto)} para ${_rcCuando(c)}, correspondiente a ${lotes}.\n\n${pago}\n\nQuedamos atentos. ¡Muchas gracias!`;
    const deuda = a && a.total ? `, que registra ${cuotas} cuota${cuotas === 1 ? '' : 's'} vencida${cuotas === 1 ? '' : 's'} por ${_rcUsd(a.total)}${dias ? ` (${dias} días de atraso)` : ''}` : '';
    const incum = previos.length ? `\n\nNotamos que el compromiso anterior del ${_cobF(previos[0].fecha)} no se concretó.` : '';
    return `${enc}\n\nLe escribimos respecto a ${lotes}${deuda}. ${vencido ? `Su compromiso de ${que} de ${_rcUsd(c.monto)} del ${_cobF(c.fecha)} aún no figura registrado.` : `Según lo acordado, su compromiso de ${que} es de ${_rcUsd(c.monto)} para ${_rcCuando(c)}.`}${incum}\n\nLe pedimos realizar el pago y enviarnos el comprobante, o comunicarse con nosotros para regularizar su situación.\n\n${pago}\n\nQuedamos atentos.`;
  }
  if (c.tipo === 'Reunión') return `${enc}\n\nLe recordamos la reunión coordinada para ${_rcCuando(c)} respecto a ${lotes}. Nuestras oficinas están en Av. Marcelo Terceros #20, Equipetrol (3er anillo externo).\n\nQuedamos atentos.`;
  const deuda = a && a.total ? ` Su cuenta registra ${cuotas} cuota${cuotas === 1 ? '' : 's'} pendiente${cuotas === 1 ? '' : 's'} por ${_rcUsd(a.total)}.` : '';
  return `${enc}\n\nLe escribimos para coordinar el estado de cuenta de ${lotes}.${deuda} ¿Podemos comunicarnos con usted ${_rcCuando(c)}?\n\nQuedamos atentos.`;
}

function _rcTelWa(key) {
  const crm = (cobClientesCRM || {})[key] || {};
  let t = String(crm.telefono || crm.telefono2 || '').replace(/\D/g, '');
  if (!t) return '';
  if (t.length === 8) t = '591' + t;
  return t;
}

/* ── Ventana del mensaje ── */
function rcAbrirMensaje(id) {
  const c0 = cobCompromisos[id]; if (!c0) return;
  const c = { ...c0, _id: id }, tel = _rcTelWa(c.clienteKey);
  cobAbrirModal(`
    <h3>💬 Mensaje para ${esc(_rcTitulo(c.cliente))}</h3>
    <p class="cob-mini">${esc(c.tipo)}${c.monto ? ' · ' + _rcUsd(c.monto) : ''} · ${esc(_rcCuando(c))}${tel ? ' · WhatsApp +' + tel : ' · <b>sin teléfono en la ficha</b>'}</p>
    <label>Mensaje (podés editarlo antes de enviarlo)<textarea id="rc-msg" rows="12" style="width:100%;font-family:inherit;font-size:13px;line-height:1.45">${esc(rcMensaje(c))}</textarea></label>
    <div class="rc-qr"><img src="${RC_QR}" alt="QR de pago BNB en bolivianos"><div><b>QR de pago</b><span>Envialo después del mensaje.</span>
      <button type="button" class="btn-secondary btn-sm" onclick="rcCopiarQR()">Copiar QR</button>
      <a class="btn-secondary btn-sm" href="${RC_QR}" download="QR-pago-Urubo-Village.jpg">Descargar QR</a></div></div>
    <div class="cob-modal-acts">
      <button class="btn-secondary btn-sm" onclick="cobCerrarModal()">Cerrar</button>
      <button class="btn-secondary btn-sm" onclick="rcCopiarMensaje('${id}')">Copiar mensaje</button>
      ${tel ? `<button class="btn-primary btn-sm" onclick="rcAbrirWhatsApp('${id}')">Abrir WhatsApp</button>` : `<button class="btn-primary btn-sm" onclick="cobCerrarModal();cobAbrirFicha('${c.clienteKey}')">Cargar teléfono</button>`}
    </div>`);
}
async function _rcRegistrarEnvio(id, canal) {
  const c = cobCompromisos[id]; if (!c) return;
  try {
    await window._fbCob.update('cobcrm_compromisos/' + id, { recordatorio: { ts: Date.now(), por: _cobUsuario(), canal } });
  } catch (e) {}
}
async function rcCopiarMensaje(id) {
  const t = document.getElementById('rc-msg')?.value || '';
  try { await navigator.clipboard.writeText(t); toastOk('Mensaje copiado. Pegalo en WhatsApp.'); _rcRegistrarEnvio(id, 'copiado'); }
  catch (e) { document.getElementById('rc-msg')?.select(); toastErr('No se pudo copiar automáticamente: seleccioná el texto y copialo.'); }
}
function rcAbrirWhatsApp(id) {
  const c = cobCompromisos[id]; if (!c) return;
  const t = document.getElementById('rc-msg')?.value || rcMensaje({ ...c, _id: id });
  window.open('https://wa.me/' + _rcTelWa(c.clienteKey) + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
  _rcRegistrarEnvio(id, 'whatsapp');
}
async function rcCopiarQR() {
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = RC_QR; });
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toastOk('QR copiado. Pegalo en el chat de WhatsApp (Ctrl+V).');
  } catch (e) { toastErr('Este navegador no deja copiar imágenes: usá "Descargar QR" y adjuntalo.'); }
}

/* ── Bandeja "Recordatorios de hoy" ── */
function rcLista() {
  const hoy = _cobHoy(), yo = _cobUsuario(), todos = _rcEsAdmin();
  return Object.entries(cobCompromisos || {}).map(([id, c]) => ({ ...c, _id: id }))
    .filter(c => c.estado === 'Pendiente' && c.fecha <= hoy && (todos || !c.responsable || c.responsable === yo))
    .sort((a, b) => (a.fecha < hoy) !== (b.fecha < hoy) ? (a.fecha < hoy ? -1 : 1) : (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')));
}
function rcRender() {
  const box = document.getElementById('cob-recordatorios'); if (!box) return;
  const l = rcLista(), hoy = _cobHoy();
  if (!l.length) { box.innerHTML = `<div class="rc-vacio">🔔 Sin recordatorios para hoy${_rcEsAdmin() ? '' : ' a tu nombre'}.</div>`; return; }
  const ahora = new Date(), hm = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
  box.innerHTML = `<div class="rc-h"><b>🔔 Recordatorios de hoy</b><span>${l.filter(c => c.fecha === hoy).length} para hoy · ${l.filter(c => c.fecha < hoy).length} vencidos sin cerrar${_rcEsAdmin() ? ' · todos los responsables' : ''}</span></div>
    <div class="rc-l">${l.map(c => {
      const a = (cobAgg || []).find(x => x.key === c.clienteKey), venc = c.fecha < hoy, pasada = !venc && c.hora && c.hora < hm;
      return `<div class="rc-i ${venc ? 'venc' : pasada ? 'ya' : ''}">
        <div class="rc-t"><b>${venc ? _cobFc(c.fecha) : (c.hora || 'Sin hora')}</b><span>${venc ? 'vencido' : pasada ? 'ya pasó la hora' : c.hora ? 'hoy' : ''}</span></div>
        <div class="rc-c"><a class="cob-lnk" onclick="cobAbrirFicha('${c.clienteKey}')">${esc(_rcTitulo(c.cliente))}</a>
          <span class="cob-mini">${esc(c.tipo)}${c.monto ? ' ' + _rcUsd(c.monto) : ''}${a ? ` · deuda ${_cobUSD(a.total)} · ${a.diasHoy ?? a.dias ?? 0} d` : ''}${_rcEsAdmin() && c.responsable ? ' · ' + esc(c.responsable) : ''}${c.recordatorio ? ' · <span style="color:var(--ok-ink,#2F4A34)">mensaje ' + (c.recordatorio.canal === 'whatsapp' ? 'enviado por WhatsApp' : 'copiado') + ' ' + new Date(c.recordatorio.ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) + '</span>' : ''}</span></div>
        <div class="rc-a"><button class="btn-primary btn-sm" onclick="rcAbrirMensaje('${c._id}')">💬 Mensaje</button>
          <button class="cob-ab ok" onclick="cobResolverComp('${c._id}','Cumplido')" title="Pagó / cumplido">✔</button>
          <button class="cob-ab d" onclick="cobResolverComp('${c._id}','Incumplido')" title="Incumplido">✖</button>
          <button class="cob-ab" onclick="cobReprogramarComp('${c._id}')" title="Reprogramar">📅</button></div>
      </div>`; }).join('')}</div>`;
}

/* ── Aviso antes de la hora ── */
function _rcAvisados() { try { return JSON.parse(localStorage.getItem('uv-rc-avisados') || '{}'); } catch (e) { return {}; } }
function rcRevisarAvisos() {
  if (!document.getElementById('cob-recordatorios')) return;
  const hoy = _cobHoy(), ahora = Date.now(), av = _rcAvisados(); let cambio = false;
  rcLista().filter(c => c.fecha === hoy && c.hora).forEach(c => {
    const [hh, mm] = c.hora.split(':').map(Number), t = new Date(); t.setHours(hh, mm, 0, 0);
    const k = c._id + '@' + c.fecha + ' ' + c.hora;
    if (av[k] || ahora < t.getTime() - RC_AVISO_MIN * 60000 || ahora > t.getTime() + 60 * 60000) return;
    av[k] = ahora; cambio = true;
    const txt = `${c.hora} · ${_rcTitulo(c.cliente)} · ${c.tipo}${c.monto ? ' ' + _rcUsd(c.monto) : ''}`;
    showToast('🔔 Recordatorio de cobranza: ' + txt, 'info');
    try { if ('Notification' in window && Notification.permission === 'granted') { const n = new Notification('Recordatorio de cobranza', { body: txt + '\nTocá para abrir el mensaje.', icon: RC_QR, tag: k }); n.onclick = () => { window.focus(); rcAbrirMensaje(c._id); n.close(); }; } } catch (e) {}
  });
  if (cambio) { Object.keys(av).forEach(k => { if (ahora - av[k] > 3 * 864e5) delete av[k]; }); try { localStorage.setItem('uv-rc-avisados', JSON.stringify(av)); } catch (e) {} }
}
function rcPedirPermisoAvisos() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => rcRender()); } catch (e) {}
}

(function () {
  const ref = window._cobRefrescar;
  if (typeof ref === 'function') window._cobRefrescar = function (...a) { const out = ref.apply(this, a); try { rcRender(); } catch (e) { console.error(e); } return out; };
  setInterval(() => { try { rcRevisarAvisos(); rcRender(); } catch (e) {} }, 60000);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#cob-recordatorios, .cob-tab')) rcPedirPermisoAvisos(); }, true);
})();
