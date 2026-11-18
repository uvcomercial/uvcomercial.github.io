/* ════════════════════════════════════════════════════════════════════════
   COTIZADOR v2 · HOJA A4
   Una sola hoja (794×1123 px = A4 a 96 ppp) que es a la vez: la vista previa
   del asesor, la página que abre el cliente por el enlace y el PDF.
   Muestra SOLO el precio final: el precio de lista y el descuento quedan
   guardados para uso interno pero nunca llegan al cliente.
   ════════════════════════════════════════════════════════════════════════ */
const COTZ_ACCION_PRECIO = 10000;          // acción del Country Club: opcional; si el cliente la quiere, se suma al precio del terreno
const COTZ_RESERVA_DEF   = 3000;
const COTZ_VISITA_MIN    = 90;
const COTZ_FOTOS_DIR     = 'fotos/terrenos/';
const COTZ_CDN = {
  qr:    'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  h2c:   'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};

/* ── utilidades ── */
function _czEsc(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function _czUsd(n) { return '$us ' + Math.round(Number(n) || 0).toLocaleString('es-BO'); }
function _czFechaLarga(d) {
  if (!d) return '';
  const f = (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? new Date(d + 'T12:00:00') : new Date(d);
  return isNaN(f) ? '' : f.toLocaleDateString('es-BO', { day:'numeric', month:'long', year:'numeric' });
}
function _czPartes(codigo) {
  const p = String(codigo || '').trim().split('-');
  return { modulo: p[0] || '', manzana: p[1] || '', lote: p[2] || '' };
}
function _czCelularWa(cel) {
  let n = String(cel || '').replace(/[^0-9]/g, '');
  if (n.length === 8 && /^[67]/.test(n)) n = '591' + n;      // celular boliviano sin código de país
  return n;
}
function _czCargarScript(url) {
  window._czScripts = window._czScripts || {};
  if (!window._czScripts[url]) {
    window._czScripts[url] = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = url; s.async = true; s.onload = () => ok(); s.onerror = () => { delete window._czScripts[url]; no(new Error('No se pudo cargar ' + url)); };
      document.head.appendChild(s);
    });
  }
  return window._czScripts[url];
}

/* ── Fotos de terrenos ──
   fotos/terrenos/indice.json = { "1-51": 2, ... }  (módulo-número → cantidad de fotos)
   Archivos: 1-51.jpg, 1-51-2.jpg … Se buscan por módulo y número de terreno, que es como
   vienen nombradas las fotos originales ("terreno 51_M1.jpg"). */
let _czFotoIdx = null, _czFotoIdxProm = null;
function cotzCargarIndiceFotos() {
  if (!_czFotoIdxProm) {
    _czFotoIdxProm = fetch(COTZ_FOTOS_DIR + 'indice.json', { cache:'no-cache' })
      .then(r => r.ok ? r.json() : {}).catch(() => ({}))
      .then(j => { _czFotoIdx = j || {}; return _czFotoIdx; });
  }
  return _czFotoIdxProm;
}
function cotzFotoClave(codigo) {
  const p = _czPartes(codigo);
  const m = parseInt(p.modulo, 10), l = parseInt(p.lote, 10);
  return (isNaN(m) || isNaN(l)) ? null : (m + '-' + l);
}
function cotzFotos(codigo) {
  const k = cotzFotoClave(codigo);
  const n = (k && _czFotoIdx) ? (_czFotoIdx[k] || 0) : 0;
  const out = [];
  for (let i = 1; i <= n; i++) out.push(COTZ_FOTOS_DIR + k + (i === 1 ? '' : '-' + i) + '.jpg');
  return out;
}

/* Esquema del terreno cuando todavía no hay foto: manzana con el terreno marcado. */
function cotzEsquemaSVG(codigo, superficie) {
  const p = _czPartes(codigo);
  const celdas = [];
  for (let i = 0; i < 8; i++) {
    const x = 70 + (i % 4) * 66, y = 62 + Math.floor(i / 4) * 70, on = i === 5;
    celdas.push(`<rect x="${x}" y="${y}" width="62" height="66" rx="2" fill="${on ? '#E9DFC6' : '#F7F5F0'}" stroke="${on ? '#8A6E3F' : '#CFC6B0'}" stroke-width="${on ? 2.4 : 1}"/>`);
  }
  return `<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esquema del terreno ${_czEsc(codigo)}">
    <rect width="400" height="260" fill="#EFE9DD"/>
    <rect x="0" y="34" width="400" height="16" fill="#E3DBCB"/><rect x="0" y="214" width="400" height="16" fill="#E3DBCB"/>
    <rect x="44" y="34" width="16" height="196" fill="#E3DBCB"/><rect x="340" y="34" width="16" height="196" fill="#E3DBCB"/>
    ${celdas.join('')}
    <text x="167" y="169" text-anchor="middle" font-family="Montserrat,Arial" font-size="13" font-weight="700" fill="#1C1A17">${_czEsc(p.lote || '—')}</text>
    <text x="200" y="22" text-anchor="middle" font-family="Montserrat,Arial" font-size="10.5" letter-spacing="2" fill="#6B6355">MÓDULO ${_czEsc(p.modulo || '—')} · MANZANA ${_czEsc(p.manzana || '—')}</text>
    <text x="200" y="250" text-anchor="middle" font-family="Montserrat,Arial" font-size="10" fill="#9A8F76">${superficie ? (Number(superficie).toLocaleString('es-BO') + ' m² · ') : ''}esquema referencial</text>
  </svg>`;
}

/* Logo en blanco para el encabezado negro: se procesa una vez en un canvas.
   Si el PNG es transparente con trazo oscuro, se pasa a blanco; si ya trae fondo, se usa tal cual. */
let _czLogoProm = null;
function cotzLogoBlanco() {
  if (_czLogoProm) return _czLogoProm;
  _czLogoProm = new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height), px = d.data;
        if (px[3] < 20) {                                   // esquina transparente → logo de trazo: lo pintamos de blanco
          for (let i = 0; i < px.length; i += 4) { px[i] = px[i+1] = px[i+2] = 255; }
          cx.putImageData(d, 0, 0);
        }
        ok({ src: cv.toDataURL('image/png'), conFondo: px[3] >= 20 });
      } catch (e) { ok({ src: 'logo-urubo-village.png', conFondo: true }); }
    };
    img.onerror = () => ok(null);
    img.src = 'logo-urubo-village.png';
  });
  return _czLogoProm;
}

/* Código legible de la cotización: UV-M1-20261015-K7QD */
function cotzNuevoCodigo(codigoTerreno) {
  const m = _czPartes(codigoTerreno).modulo || '0';
  const d = new Date(), f = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = ''; const rnd = crypto.getRandomValues(new Uint8Array(4));
  rnd.forEach(b => r += abc[b % abc.length]);
  return `UV-M${m}-${f}-${r}`;
}
function cotzCodigoDe(c) { return c.codigo || ('UV-' + String(c._key || '').slice(-6).toUpperCase()); }

/* ── La hoja ── */
function cotzHojaHTML(c, opt = {}) {
  if (c.tipo === 'perfil') return cotzHojaPerfilHTML(c, opt);
  const E = _czEsc;
  const p = _czPartes(c.terreno);
  const fotos = opt.fotos || cotzFotos(c.terreno);
  const esContado = c.modalidad === 'Contado';
  const nombre = (c.cliente || '').trim();
  const primerNombre = nombre.split(/\s+/)[0] || '';
  const fila = (k, v, fuerte) => v === undefined || v === null || v === '' ? '' :
    `<div class="uvh-f${fuerte ? ' b' : ''}"><span>${E(k)}</span><span>${v}</span></div>`;
  const estado = opt.estado || '';

  const fotoHtml = fotos.length
    ? `<img class="uvh-foto" src="${E(fotos[0])}" alt="Terreno ${E(c.terreno)}" crossorigin="anonymous">${fotos[1] ? `<img class="uvh-foto2" src="${E(fotos[1])}" alt="" crossorigin="anonymous">` : ''}`
    : `<div class="uvh-esq">${cotzEsquemaSVG(c.terreno, c.superficie)}</div>`;

  // Cotizaciones nuevas: precioFinal = terreno y precioTotal = terreno + acción (si la eligió). Las viejas no tienen precioTotal y se muestran como se enviaron.
  const nueva = c.precioTotal != null, total = nueva ? c.precioTotal : c.precioFinal, conAcc = c.conAccion === 'SI';
  let plan;
  if (esContado) {
    const pagos = Array.isArray(c.pagosContado) && c.pagosContado.length ? c.pagosContado : [{ dias:0, monto:total }];
    plan = fila('Modalidad', 'Contado', true) +
      pagos.map((pg, i) => fila(pagos.length === 1 ? 'Pago total' : `Pago ${i+1} · ${pg.dias ? 'día ' + pg.dias : 'a la firma'}`, `<span class="uvh-num">${_czUsd(pg.monto)}</span>`)).join('') +
      (pagos.length > 1 ? fila('Plazo total', `${Math.max(...pagos.map(x => x.dias || 0))} días`) : '');
  } else {
    plan = fila('Modalidad', E(c.modalidad || '—'), true) +
      fila(`Aporte inicial (${Math.round(c.pctAporte || 0)}%)`, `<span class="uvh-num">${_czUsd(c.montoAporte)}</span>`) +
      fila('Saldo financiado', `<span class="uvh-num">${_czUsd(c.montoSaldo)}</span>`) +
      fila('Plazo', `${c.nroCuotas || 0} cuotas`) +
      fila('Cuota mensual estimada', `<span class="uvh-num">${_czUsd(c.montoCuota)}</span>`, true);
  }

  const v = c.visita && c.visita.fecha ? c.visita : null;
  const visita = v
    ? fila('Fecha', E(_czFechaLarga(v.fecha)), true) + fila('Hora', E((v.hora || 'a coordinar') + (v.hora ? ` (${COTZ_VISITA_MIN} min)` : ''))) +
      `<p class="uvh-nota">Oficina de ventas Urubó Village · Módulo ${E(p.modulo || '1')}</p>`
    : `<p class="uvh-nota uvh-nota-g">Coordiná con tu asesor el día y la hora para recorrer tu terreno.</p>`;

  const vence = c.fechaVencimiento ? _czFechaLarga(c.fechaVencimiento) : '';
  const qr = opt.qrSvg ? `<div class="uvh-qr">${opt.qrSvg}<span>Tu cotización<br>en línea</span></div>` : '';
  const logo = opt.logo
    ? `<img class="uvh-logo${opt.logo.conFondo ? ' fondo' : ''}" src="${E(opt.logo.src)}" alt="Urubó Village">`
    : `<div class="uvh-logo-txt">URUBÓ<b>VILLAGE</b></div>`;

  return `<div class="uvh${opt.fijo ? ' uvh-fijo' : ''}${estado === 'vencido' ? ' uvh-vencida' : ''}">
    <div class="uvh-marca" aria-hidden="true">URUBÓ VILLAGE</div>
    <header class="uvh-cab">
      ${logo}
      <div class="uvh-cab-d">
        <div class="uvh-k">Cotización referencial</div>
        <div class="uvh-cod">${E(cotzCodigoDe(c))}</div>
        <div class="uvh-em">Emitida el ${E(_czFechaLarga(c.ts || Date.now()))}</div>
      </div>
    </header>
    <div class="uvh-body">
      <div class="uvh-hola">
        <p>${primerNombre ? E(primerNombre) + ', esta' : 'Esta'} es la cotización de tu terreno en Urubó Village.</p>
        ${estado === 'confirmado' ? '<span class="uvh-pill ok">Confirmada por tu asesor</span>' : ''}
        ${estado === 'vencido' ? '<span class="uvh-pill no">Vencida</span>' : ''}
      </div>

      <div class="uvh-g2">
        <div>
          <h4 class="uvh-h">Datos del cliente</h4>
          ${fila('Nombre', E(nombre || '—'))}
          ${fila('WhatsApp', c.celular ? E(c.celular) : '')}
          ${fila('Correo', c.correo ? E(c.correo) : '')}
          ${fila('Ciudad', c.ciudad ? E(c.ciudad) : '')}
          ${fila('Busca su terreno para', c.proposito ? E(c.proposito) : '')}
          ${fila('Familia', c.familia ? E(c.familia) : '')}
          <h4 class="uvh-h uvh-h2">Terreno elegido</h4>
          ${fila('Terreno', E(c.terreno || '—'), true)}
          ${fila('Ubicación', `Módulo ${E(p.modulo || '—')} · Mz. ${E(p.manzana || '—')}`)}
          ${fila('Categoría', E(c.categoria || '—'))}
          ${fila('Superficie', `<span class="uvh-num">${(Number(c.superficie) || 0).toLocaleString('es-BO')} m²</span>`)}
        </div>
        <div>
          <h4 class="uvh-h">Tu terreno</h4>
          <div class="uvh-fotos${fotos[1] ? ' dos' : ''}">${fotoHtml}</div>
          <p class="uvh-pie">Terreno ${E(c.terreno || '')} · Módulo ${E(p.modulo || '—')} · Mz. ${E(p.manzana || '—')}</p>
        </div>
      </div>

      <div class="uvh-g2">
        <div>
          <h4 class="uvh-h">Desglose de inversión</h4>
          ${nueva ? fila('Precio del terreno', `<span class="uvh-num">${_czUsd(c.precioFinal)}</span>`) + fila('Acción Country Club', conAcc ? `<span class="uvh-num">${_czUsd(c.accionPrecio || COTZ_ACCION_PRECIO)}</span>` : 'No incluida') : ''}
          ${fila('Tu precio final', `<span class="uvh-num">${_czUsd(total)}</span>`, true)}
          ${!esContado ? fila('Reserva para separar', `<span class="uvh-num">${_czUsd(c.reserva)}</span>`) : ''}
          ${nueva ? '' : fila('Acción Country Club', 'Incluida')}
          ${!esContado ? '<p class="uvh-nota">Financiamiento directo, sin intereses.</p>' : ''}
        </div>
        <div>
          <h4 class="uvh-h">Plan de pago</h4>
          ${plan}
        </div>
      </div>

      <div class="uvh-precio">
        <span>Tu precio final${nueva ? (conAcc ? ' · con acción del Country Club' : ' · terreno sin acción') : ''}</span>
        <b class="uvh-num">${_czUsd(total)}</b>
      </div>

      <div class="uvh-g2">
        <div>
          <h4 class="uvh-h">Visita guiada</h4>
          ${visita}
        </div>
        <div>
          <h4 class="uvh-h">Tu asesor</h4>
          ${fila('Nombre', E(c.asesorNombre || 'Equipo Comercial'), true)}
          ${fila('Cargo', 'Asesor de Urubó Village')}
          ${fila('WhatsApp', c.asesorCelular ? E(c.asesorCelular) : '')}
          ${fila('Correo', c.asesorCorreo ? E(c.asesorCorreo) : '')}
        </div>
      </div>

      <div class="uvh-vig">
        <b>${vence ? `Vigencia: esta cotización es válida por ${E(c.vigenciaDias || 5)} días, hasta el ${E(vence)}.` : 'Cotización referencial.'}</b>
        <span>Cotización referencial, sujeta a confirmación de disponibilidad. Precios expresados en dólares estadounidenses. No incluye gastos de escrituración.</span>
      </div>
    </div>
    <footer class="uvh-pie-p">
      <span>Urubó Village · urubovillage.com</span>
      ${qr}
      <span>${E(cotzCodigoDe(c))}</span>
    </footer>
  </div>`;
}


/* Hoja del PERFIL DE BÚSQUEDA: lo que pidió el cliente + hasta 3 terrenos sugeridos */
function cotzHojaPerfilHTML(c, opt = {}) {
  const E = _czEsc, p = c.perfil || {}, sug = c.sugeridos || [];
  const primerNombre = (c.cliente || '').trim().split(/\s+/)[0] || '';
  const fila = (k, v, fuerte) => v === undefined || v === null || v === '' ? '' : `<div class="uvh-f${fuerte ? ' b' : ''}"><span>${E(k)}</span><span>${v}</span></div>`;
  const estado = opt.estado || '';
  const sup = (p.supMin || p.supMax) ? (p.supMin && p.supMax ? `${p.supMin} a ${p.supMax} m²` : (p.supMin ? `desde ${p.supMin} m²` : `hasta ${p.supMax} m²`)) : '';
  const v = c.visita && c.visita.fecha ? c.visita : null;
  const logo = opt.logo ? `<img class="uvh-logo${opt.logo.conFondo ? ' fondo' : ''}" src="${E(opt.logo.src)}" alt="Urubó Village">` : `<div class="uvh-logo-txt">URUBÓ<b>VILLAGE</b></div>`;
  const tarjetas = sug.length ? `<div class="uvh-sug uvh-sug-${sug.length}">${sug.map(s => {
      const f = cotzFotos(s.terreno)[0];
      return `<div class="uvh-sc">
        <div class="uvh-sc-img">${f ? `<img src="${E(f)}" alt="" crossorigin="anonymous">` : cotzEsquemaSVG(s.terreno, s.superficie)}</div>
        <div class="uvh-sc-cod">Terreno ${E(s.terreno)}</div>
        <div class="uvh-sc-d">Módulo ${E(s.modulo || '—')} · Mz. ${E(s.manzana || '—')} · Cat. ${E(s.categoria || '—')}</div>
        <div class="uvh-sc-f"><span>${(Number(s.superficie) || 0).toLocaleString('es-BO')} m²</span><b class="uvh-num">${_czUsd(s.precio)}</b></div>
      </div>`; }).join('')}</div>`
    : `<p class="uvh-nota-g">Tu asesor te va a presentar los terrenos disponibles que cumplen con lo que buscás, con fotos y recorrido en el lugar.</p>`;
  return `<div class="uvh${opt.fijo ? ' uvh-fijo' : ''}${estado === 'vencido' ? ' uvh-vencida' : ''}">
    <div class="uvh-marca" aria-hidden="true">URUBÓ VILLAGE</div>
    <header class="uvh-cab">${logo}
      <div class="uvh-cab-d"><div class="uvh-k">Propuesta de terrenos</div><div class="uvh-cod">${E(cotzCodigoDe(c))}</div><div class="uvh-em">Emitida el ${E(_czFechaLarga(c.ts || Date.now()))}</div></div>
    </header>
    <div class="uvh-body">
      <div class="uvh-hola"><p>${primerNombre ? E(primerNombre) + ', preparamos' : 'Preparamos'} esta propuesta según lo que buscás en Urubó Village.</p>
        ${estado === 'confirmado' ? '<span class="uvh-pill ok">Confirmada por tu asesor</span>' : ''}${estado === 'vencido' ? '<span class="uvh-pill no">Vencida</span>' : ''}</div>
      <div class="uvh-g2">
        <div>
          <h4 class="uvh-h">Datos del cliente</h4>
          ${fila('Nombre', E(c.cliente || '—'))}${fila('WhatsApp', c.celular ? E(c.celular) : '')}${fila('Correo', c.correo ? E(c.correo) : '')}
          ${fila('Ciudad', c.ciudad ? E(c.ciudad) : '')}${fila('Busca su terreno para', c.proposito ? E(c.proposito) : '')}${fila('Familia', c.familia ? E(c.familia) : '')}
        </div>
        <div>
          <h4 class="uvh-h">Lo que buscás</h4>
          ${fila('Presupuesto', p.presupuesto ? `hasta <span class="uvh-num">${_czUsd(p.presupuesto)}</span>` : '', true)}
          ${fila('Superficie', sup)}${fila('Ubicación', p.modulo ? 'Módulo ' + E(p.modulo) : '')}
          ${fila('Categoría', p.categorias?.length ? E(p.categorias.join(', ')) : '')}${fila('Forma de pago', p.modalidad ? E(p.modalidad) : '')}
          ${p.caracteristicas?.length ? `<div class="uvh-chips">${p.caracteristicas.map(x => `<span>${E(x)}</span>`).join('')}</div>` : ''}
          ${p.notas ? `<p class="uvh-cita">“${E(p.notas)}”</p>` : ''}
        </div>
      </div>
      <div>
        <h4 class="uvh-h">${sug.length ? (sug.length === 1 ? 'Terreno sugerido' : 'Terrenos sugeridos') : 'Próximo paso'}</h4>
        ${tarjetas}
        ${sug.length ? '<p class="uvh-nota">Precios de lista referenciales del terreno. La acción del Country Club es opcional y se suma aparte ($us 10.000). Tu asesor te presenta el plan de pago y las condiciones de cada terreno.</p>' : ''}
      </div>
      <div class="uvh-g2">
        <div><h4 class="uvh-h">Visita guiada</h4>
          ${v ? fila('Fecha', E(_czFechaLarga(v.fecha)), true) + fila('Hora', E((v.hora || 'a coordinar') + (v.hora ? ` (${COTZ_VISITA_MIN} min)` : ''))) + '<p class="uvh-nota">Oficina de ventas Urubó Village</p>'
              : '<p class="uvh-nota uvh-nota-g">Coordiná con tu asesor el día y la hora para recorrer los terrenos.</p>'}
        </div>
        <div><h4 class="uvh-h">Tu asesor</h4>
          ${fila('Nombre', E(c.asesorNombre || 'Equipo Comercial'), true)}${fila('Cargo', 'Asesor de Urubó Village')}
          ${fila('WhatsApp', c.asesorCelular ? E(c.asesorCelular) : '')}${fila('Correo', c.asesorCorreo ? E(c.asesorCorreo) : '')}
        </div>
      </div>
      <div class="uvh-vig"><b>${c.fechaVencimiento ? `Propuesta válida por ${E(c.vigenciaDias || 7)} días, hasta el ${E(_czFechaLarga(c.fechaVencimiento))}.` : 'Propuesta referencial.'}</b>
        <span>Disponibilidad y precios sujetos a confirmación al momento de la reserva. Precios expresados en dólares estadounidenses.</span></div>
    </div>
    <footer class="uvh-pie-p"><span>Urubó Village · urubovillage.com</span>${opt.qrSvg ? `<div class="uvh-qr">${opt.qrSvg}<span>Tu propuesta<br>en línea</span></div>` : ''}<span>${E(cotzCodigoDe(c))}</span></footer>
  </div>`;
}

const COTZ_HOJA_CSS = `
.uvh{ --k:#141311; --g:#8A6E3F; --l:#E3DBCB; --m:#6B6355; --p:#F4F1EA;
  position:relative; width:794px; min-height:1123px; margin:0 auto; background:#fff; color:#1C1A17; overflow:hidden;
  font-family:'Montserrat','Helvetica Neue',Arial,sans-serif; font-size:12px; line-height:1.45; box-sizing:border-box;
  display:flex; flex-direction:column; -webkit-print-color-adjust:exact; print-color-adjust:exact; text-align:left; }
.uvh *{ box-sizing:border-box; }
.uvh p,.uvh h4{ margin:0; }
.uvh-num{ font-variant-numeric:tabular-nums; }
.uvh-marca{ position:absolute; left:-40px; top:520px; transform:rotate(-32deg); font-size:92px; font-weight:800; letter-spacing:.06em; color:rgba(28,26,23,.035); white-space:nowrap; pointer-events:none; z-index:0; }
.uvh-cab{ position:relative; z-index:1; background:var(--k); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:24px 48px; min-height:100px; }
.uvh-logo{ height:50px; width:auto; display:block; }
.uvh-logo.fondo{ height:56px; border-radius:3px; }
.uvh-logo-txt{ font-size:22px; letter-spacing:.08em; font-weight:500; line-height:1; }
.uvh-logo-txt b{ display:block; font-weight:800; letter-spacing:.06em; }
.uvh-cab-d{ text-align:right; }
.uvh-k{ font-size:9.5px; letter-spacing:.18em; text-transform:uppercase; color:#C9BFAA; }
.uvh-cod{ font-size:15px; font-weight:700; letter-spacing:.03em; margin:4px 0 3px; }
.uvh-em{ font-size:10px; color:#B5AC98; }
.uvh-body{ position:relative; z-index:1; flex:1; padding:26px 48px 8px; display:flex; flex-direction:column; gap:20px; }
.uvh-hola{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
.uvh-hola p{ font-size:14.5px; }
.uvh-pill{ font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:99px; white-space:nowrap; }
.uvh-pill.ok{ background:#E8ECDD; color:#46592F; } .uvh-pill.no{ background:#F4E2DB; color:#8A3F31; }
.uvh-g2{ display:grid; grid-template-columns:1fr 1fr; gap:34px; }
.uvh-h{ font-size:9.5px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:#1C1A17; padding-bottom:7px; margin-bottom:6px !important; border-bottom:1px solid var(--l); position:relative; }
.uvh-h:after{ content:''; position:absolute; left:0; bottom:-1px; width:34px; height:2px; background:var(--g); }
.uvh-h2{ margin-top:16px !important; }
.uvh-f{ display:flex; justify-content:space-between; gap:12px; padding:3.5px 0; color:var(--m); }
.uvh-f span:last-child{ color:#1C1A17; text-align:right; }
.uvh-f.b span{ color:#1C1A17; font-weight:700; }
.uvh-fotos{ display:grid; gap:6px; }
.uvh-fotos.dos{ grid-template-columns:2fr 1fr; }
.uvh-foto{ width:100%; height:232px; object-fit:cover; display:block; border-radius:2px; background:var(--p); }
.uvh-foto2{ width:100%; height:232px; object-fit:cover; display:block; border-radius:2px; background:var(--p); }
.uvh-esq svg{ width:100%; height:232px; display:block; }
.uvh-pie{ font-size:10px; color:var(--m); margin-top:6px !important; }
.uvh-nota{ font-size:10.5px; color:var(--m); margin-top:6px !important; }
.uvh-nota-g{ font-size:11.5px; color:#3F392F; }
.uvh-precio{ display:flex; justify-content:space-between; align-items:center; background:var(--p); border-left:4px solid var(--g); padding:18px 24px; }
.uvh-precio span{ font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:var(--m); }
.uvh-precio b{ font-size:28px; font-weight:800; color:var(--g); }
.uvh-vig{ border:1px solid var(--g); padding:12px 16px; display:flex; flex-direction:column; gap:4px; }
.uvh-vig b{ font-size:11.5px; } .uvh-vig span{ font-size:10px; color:var(--m); }
.uvh-pie-p{ position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 48px; padding:12px 0 18px; border-top:1px solid var(--l); font-size:9.5px; color:var(--m); }
.uvh-qr{ display:flex; align-items:center; gap:8px; font-size:8.5px; line-height:1.25; color:var(--m); }
.uvh-qr svg{ width:52px; height:52px; display:block; }
.uvh-chips{ display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
.uvh-chips span{ font-size:10px; padding:3px 9px; border:1px solid var(--l); border-radius:99px; color:#3F392F; background:var(--p); }
.uvh-cita{ margin-top:8px !important; font-size:11.5px; color:#3F392F; font-style:italic; border-left:2px solid var(--g); padding-left:10px; }
.uvh-sug{ display:grid; gap:14px; }
.uvh-sug-1{ grid-template-columns:1fr 1fr; } .uvh-sug-2{ grid-template-columns:1fr 1fr; } .uvh-sug-3{ grid-template-columns:1fr 1fr 1fr; }
.uvh-sc{ border:1px solid var(--l); }
.uvh-sc-img img,.uvh-sc-img svg{ width:100%; height:150px; object-fit:cover; display:block; }
.uvh-sug-1 .uvh-sc-img img,.uvh-sug-1 .uvh-sc-img svg,.uvh-sug-2 .uvh-sc-img img,.uvh-sug-2 .uvh-sc-img svg{ height:190px; }
.uvh-sc-cod{ font-weight:700; font-size:12.5px; padding:8px 10px 0; }
.uvh-sc-d{ font-size:10px; color:var(--m); padding:1px 10px 0; }
.uvh-sc-f{ display:flex; justify-content:space-between; align-items:baseline; padding:6px 10px 9px; font-size:11px; color:var(--m); }
.uvh-sc-f b{ color:var(--g); font-size:14px; }
.uvh-vencida .uvh-body > *:not(.uvh-hola){ opacity:.45; }
@media screen and (max-width:820px){
  .uvh:not(.uvh-fijo){ width:100%; min-height:0; font-size:13px; }
  .uvh:not(.uvh-fijo) .uvh-cab{ padding:18px 20px; min-height:0; }
  .uvh:not(.uvh-fijo) .uvh-logo{ height:38px; }
  .uvh:not(.uvh-fijo) .uvh-cod{ font-size:12.5px; }
  .uvh:not(.uvh-fijo) .uvh-body{ padding:20px 20px 8px; }
  .uvh:not(.uvh-fijo) .uvh-g2{ grid-template-columns:1fr; gap:20px; }
  .uvh:not(.uvh-fijo) .uvh-sug{ grid-template-columns:1fr; }
  .uvh:not(.uvh-fijo) .uvh-hola{ flex-direction:column; align-items:flex-start; }
  .uvh:not(.uvh-fijo) .uvh-precio b{ font-size:24px; }
  .uvh:not(.uvh-fijo) .uvh-pie-p{ margin:0 20px; flex-wrap:wrap; }
  .uvh:not(.uvh-fijo) .uvh-marca{ display:none; }
}
@media print{ .uvh{ width:794px; min-height:1123px; } }
`;

/* ════════════════════════════════════════════════════════════════════════
   VISTA PÚBLICA — lo que abre el cliente con ?cotizacion=KEY
   &interno=1 → la abrió alguien del equipo (no cuenta como vista)
   &pdf=1     → descarga el PDF apenas termina de cargar
   ════════════════════════════════════════════════════════════════════════ */
async function mostrarCotizacionPublica(key) {
  const qs = new URLSearchParams(location.search);
  const interno = qs.get('interno') === '1' || !!(_czLeer(localStorage, 'uv-ses') || _czLeer(sessionStorage, 'uv-ses'));
  const autoPdf = qs.get('pdf') === '1', autoImg = qs.get('img') === '1';

  document.querySelectorAll('head link[rel="stylesheet"], head style').forEach(el => el.remove());
  document.title = 'Tu cotización · Urubó Village';
  const fl = document.createElement('link'); fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(fl);
  const st = document.createElement('style'); st.id = 'cotz-pub-css';
  st.textContent = COTZ_HOJA_CSS + `
    html,body{ margin:0; background:#E9E4DA; }
    body{ font-family:'Montserrat',Arial,sans-serif; color:#1C1A17; -webkit-font-smoothing:antialiased; }
    .czp{ min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:24px 16px 96px; gap:16px; }
    .czp-hoja{ box-shadow:0 30px 60px -20px rgba(28,24,18,.35), 0 0 0 1px rgba(28,24,18,.06); }
    .czp-bar{ position:fixed; left:0; right:0; bottom:0; display:flex; justify-content:center; gap:10px; padding:12px 16px; background:rgba(247,245,240,.94); backdrop-filter:blur(8px); border-top:1px solid #E3DBCB; z-index:5; }
    .czp-bar a,.czp-bar button{ display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; padding:0 20px; border-radius:6px; font:600 14px 'Montserrat',Arial,sans-serif; cursor:pointer; text-decoration:none; border:1.5px solid #1C1A17; background:#fff; color:#1C1A17; }
    .czp-bar .wa{ background:#1E8E4F; border-color:#1E8E4F; color:#fff; }
    .czp-bar .off{ opacity:.4; pointer-events:none; }
    .czp-msg{ max-width:520px; background:#fff; padding:28px; text-align:center; border:1px solid #E3DBCB; font-size:14px; line-height:1.6; }
    .czp-cargando{ padding:120px 0; color:#6B6355; font-size:14px; }
    @media (max-width:820px){ .czp{ padding:0 0 88px; } .czp-hoja{ box-shadow:none; } .czp-bar{ gap:6px; padding:10px; } .czp-bar a,.czp-bar button{ flex:1; padding:0 6px; font-size:12px; white-space:nowrap; } }
    @media print{ @page{ size:A4; margin:0; } html,body{ background:#fff; } .czp{ padding:0; } .czp-bar{ display:none; } .czp-hoja{ box-shadow:none; } }
  `;
  document.head.appendChild(st);
  document.body.className = '';
  document.body.innerHTML = '<div class="czp" id="czp"><div class="czp-cargando">Cargando tu cotización…</div></div>';
  const root = document.getElementById('czp');

  const c = await window._fbGetCotizacionOnce(key).catch(() => null);
  if (!c || c.estado === 'anulada') {
    root.innerHTML = `<div class="czp-msg">Esta cotización no existe o fue retirada.<br>Escribinos y te preparamos una nueva.</div>`;
    return;
  }
  const estado = _estadoRealCotizacion(c);
  const [logo] = await Promise.all([cotzLogoBlanco(), cotzCargarIndiceFotos()]);
  let qrSvg = '';
  try {
    await _czCargarScript(COTZ_CDN.qr);
    const q = window.qrcode(0, 'M'); q.addData(location.origin + location.pathname + '?cotizacion=' + key); q.make();
    qrSvg = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  } catch (e) { /* sin QR si el CDN no responde */ }

  const wa = _czCelularWa(c.asesorCelular);
  const que = c.tipo === 'perfil' ? `propuesta de terrenos ${cotzCodigoDe(c)}` : `cotización ${cotzCodigoDe(c)} del terreno ${c.terreno}`;
  const txt = estado === 'vencido'
    ? `Hola ${c.asesorNombre || ''}, mi ${que} venció. ¿Me la podés actualizar?`
    : `Hola ${c.asesorNombre || ''}, te escribo por mi ${que} en Urubó Village.`;
  if (c.tipo === 'perfil') document.title = 'Tu propuesta de terrenos · Urubó Village';
  root.innerHTML = `
    <div class="czp-hoja" id="czp-hoja">${cotzHojaHTML(c, { logo, qrSvg, estado })}</div>
    <div class="czp-bar">
      <button type="button" id="czp-pdf" onclick="cotzPublicaPDF()">Descargar PDF</button>
      <button type="button" id="czp-img" onclick="cotzPublicaImagen()">Guardar imagen</button>
      <a class="wa${wa ? '' : ' off'}" target="_blank" rel="noopener" href="${wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(txt) : '#'}">${estado === 'vencido' ? 'Pedir una actualización' : 'Hablar con tu asesor'}</a>
    </div>`;
  window._czPubCot = c;

  if (!interno && estado !== 'vencido') _czRegistrarVista(key, c);
  if (autoPdf) setTimeout(cotzPublicaPDF, 300);
  else if (autoImg) setTimeout(cotzPublicaImagen, 300);
}
function _czLeer(st, k) { try { return st.getItem(k); } catch (e) { return null; } }

async function _czRegistrarVista(key, c) {
  try {
    const ahora = Date.now();
    const yaVista = !!c.primeraVista;
    const volvio = yaVista && c.ultimaVista && (ahora - c.ultimaVista) > 12 * 3600 * 1000;
    await window._fbUpdateCotizacion(key, { vistas: (c.vistas || 0) + 1, ultimaVista: ahora, primeraVista: c.primeraVista || ahora });
    if (c.asesorKey && (!yaVista || volvio) && window._fbPushNotificacion) {
      await window._fbPushNotificacion(c.asesorKey, {
        tipo: 'cotizacion_vista',
        mensaje: `${c.cliente || 'Tu cliente'} ${yaVista ? 'volvió a abrir' : 'abrió'} su ${c.tipo === 'perfil' ? 'propuesta de terrenos' : 'cotización del terreno ' + c.terreno}. Buen momento para escribirle.`,
        cotizacionKey: key, ts: ahora, leida: false,
      });
    }
  } catch (e) { /* si la base rechaza la escritura, la hoja igual se muestra */ }
}

/* Captura de la hoja a tamaño A4 fijo (sirve para el PDF y para la imagen), sin importar la pantalla. */
async function _czCapturarHoja() {
  await _czCargarScript(COTZ_CDN.h2c);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const hoja = document.querySelector('#czp-hoja .uvh');
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;';
  const clon = hoja.cloneNode(true); clon.classList.add('uvh-fijo');
  tmp.appendChild(clon); document.body.appendChild(tmp);
  try {
    await Promise.all([...clon.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    return await window.html2canvas(clon, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794 });
  } finally { tmp.remove(); }
}
function _czNombreArchivo(c) { return (c.tipo === 'perfil' ? 'Propuesta-' : 'Cotizacion-') + cotzCodigoDe(c); }
async function _czConBoton(id, txt, fn) {
  const btn = document.getElementById(id), orig = btn ? btn.textContent : '';
  if (btn) { btn.textContent = txt; btn.disabled = true; }
  try { await fn(); } finally { if (btn) { btn.textContent = orig; btn.disabled = false; } }
}
async function cotzPublicaPDF() {
  const c = window._czPubCot; if (!c) return;
  await _czConBoton('czp-pdf', 'Preparando PDF…', async () => {
    try {
      const [cv] = await Promise.all([_czCapturarHoja(), _czCargarScript(COTZ_CDN.jspdf)]);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const W = 595.28, H = 841.89, h = cv.height * W / cv.width, k = h > H ? H / h : 1;
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', (W - W * k) / 2, 0, W * k, h * k);
      pdf.save(_czNombreArchivo(c) + '.pdf');
    } catch (e) { window.print(); }     // sin las librerías: el navegador ofrece "Guardar como PDF"
  });
}
/* Imagen JPG de la hoja: para mandarla como foto por WhatsApp */
async function cotzPublicaImagen() {
  const c = window._czPubCot; if (!c) return;
  await _czConBoton('czp-img', 'Preparando imagen…', async () => {
    try {
      const cv = await _czCapturarHoja();
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/jpeg', 0.9); a.download = _czNombreArchivo(c) + '.jpg';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { alert('No se pudo armar la imagen. Probá con "Descargar PDF".'); }
  });
}


/* ════════════════════════════════════════════════════════════════════════
   COTIZADOR v3 · admin, asesores y call center
   Dos tipos:  · Cotización de un terreno (precio, plan de pago)
               · Perfil de búsqueda (lo que pide el cliente + hasta 3 terrenos sugeridos)
   Call center y admin pueden ASIGNAR: el cliente entra a la cola de visitas del asesor
   (igual que "Agendar visita") pero con la cotización adjunta.
   ════════════════════════════════════════════════════════════════════════ */
const CZ_PROPOSITOS = ['Vivir', 'Invertir', 'Fin de semana', 'Construir para alquilar'];
const CZ_FAMILIAS   = ['1 a 2 personas', '3 a 4 personas', '5 o más personas'];
const CZ_CARACT     = ['Esquina', 'Frente a área verde', 'Con árboles', 'Cerca del Country Club', 'Calle tranquila', 'Vista abierta', 'Listo para construir', 'Cerca del ingreso'];
const CZ_HORAS = (() => { const a = []; for (let h = 8; h <= 17; h++) { a.push(String(h).padStart(2,'0') + ':00'); a.push(String(h).padStart(2,'0') + ':30'); } return a; })();
let cz = { host: null, tipo: 'terreno', lote: null, pagos: [], sugeridos: [], registroKey: null, renovadaDe: null, guardada: null };

function _czEl(id) { return document.getElementById(id); }
function _czVal(id) { const e = _czEl(id); return e ? String(e.value || '').trim() : ''; }
function _czNum(id) { return parseFloat(_czVal(id)) || 0; }
function _czNorm(s) { return String(s || '').trim().toLowerCase(); }
function _czR2(n) { return Math.round(n * 100) / 100; }
function _czModoAdmin() { return !!(typeof modoAdmin !== 'undefined' && modoAdmin); }
function _czYo() { return (!_czModoAdmin() && typeof asesorActual !== 'undefined') ? asesorActual : null; }
function _czMods() { const a = _czYo(); return a ? (a.modulos || (typeof ROL_MODULOS !== 'undefined' ? ROL_MODULOS[a.rol] : null) || ['ventas']) : []; }
function _czPuedeAsignar() { return _czModoAdmin() || _czMods().includes('callcenter'); }
function _czVendo() { return !_czModoAdmin() && _czMods().includes('ventas'); }
function _czRolCreador() { return _czModoAdmin() ? 'admin' : (_czMods().includes('callcenter') && !_czMods().includes('ventas') ? 'callcenter' : (_czMods().includes('callcenter') ? 'mixto' : 'ventas')); }
function _czAsesoresVentas() {
  return (typeof asesores !== 'undefined' ? asesores : []).filter(a => {
    const m = a.modulos || (typeof ROL_MODULOS !== 'undefined' ? ROL_MODULOS[a.rol || 'ventas'] : ['ventas']) || [];
    return m.includes('ventas');
  }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}
function _czLotes() { return typeof todosLotes !== 'undefined' ? todosLotes : []; }

/* ── Montaje: un solo host activo según quién entró ── */
function cotzMontar() {
  const hostId = _czModoAdmin() ? 'cotz-host-admin' : 'cotz-host-asesor';
  const otro = _czModoAdmin() ? 'cotz-host-asesor' : 'cotz-host-admin';
  const h = _czEl(hostId); if (!h) return;
  if (!_czEl('cotz-hoja-css')) { const st = document.createElement('style'); st.id = 'cotz-hoja-css'; st.textContent = COTZ_HOJA_CSS; document.head.appendChild(st); }
  const o = _czEl(otro); if (o) o.innerHTML = '';
  if (cz.host === hostId && h.querySelector('.cz')) { _czPoblarSelects(); _czEscalarPreview(); return; }
  cz.host = hostId;
  _czPintarForm(h);
  cotzCargarIndiceFotos().then(() => { if (cz.lote) _czPintarLote(); if (cz.tipo === 'perfil') _czSugerir(); _czPreview(); });
  cotzLogoBlanco().then(() => _czPreview());
}
function _czPintarForm(h) {
  h.innerHTML = _czFormHTML();
  _czPoblarSelects();
  const raiz = h.querySelector('.cz');
  raiz.addEventListener('input', _czOnInput);
  raiz.addEventListener('change', _czOnInput);
  _czAplicarTipo();
  _czPreview();
}

function _czFormHTML() {
  const asig = _czPuedeAsignar(), hoy = new Date().toISOString().split('T')[0];
  const soloCC = _czRolCreador() === 'callcenter';
  return `<div class="cz">
  <div class="cz-form">
    <div class="cz-tipo" role="tablist">
      <button type="button" id="cz-tipo-terreno" onclick="cotzTipo('terreno')">Cotización de un terreno</button>
      <button type="button" id="cz-tipo-perfil" onclick="cotzTipo('perfil')">Perfil de búsqueda <em>sin terreno definido</em></button>
    </div>

    <!-- ══ TIPO: TERRENO ══ -->
    <section class="cz-sec cz-solo-terreno">
      <div class="cz-h"><span>1</span>Terreno</div>
      <div class="cz-buscar">
        <input type="text" id="cz-buscar" placeholder="Código del terreno, ej. 1-4-51" autocomplete="off" oninput="cotzBuscar()" onfocus="cotzBuscar()"/>
        <label class="cz-chk"><input type="checkbox" id="cz-solo-disp" checked onchange="cotzBuscar()"/> Solo disponibles</label>
      </div>
      <div id="cz-res" class="cz-res"></div>
      <div id="cz-lote"></div>
    </section>

    <section class="cz-sec cz-solo-terreno">
      <div class="cz-h"><span>2</span>Inversión</div>
      <div class="cz-g3">
        <div><label>Modalidad</label>
          <select id="cz-modalidad"><option>Contado</option><option>Contado Diferido</option><option selected>Crédito Directo</option><option>Crédito Bancario</option></select></div>
        <div><label>Precio de lista</label><input type="text" id="cz-lista" readonly class="cz-ro"/></div>
        <div><label>Reserva para separar</label><input type="text" inputmode="numeric" id="cz-reserva" value="${COTZ_RESERVA_DEF}"/></div>
      </div>
      <div class="cz-g3">
        <div><label>Descuento (%)</label><input type="text" inputmode="decimal" id="cz-desc" value="0"/></div>
        <div><label>Precio final</label><input type="text" inputmode="numeric" id="cz-final"/></div>
        <div><label>Vigencia (días)</label><input type="text" inputmode="numeric" id="cz-vig" value="5"/></div>
      </div>
      <p id="cz-pol" class="cz-nota"></p>
      <div id="cz-cuotas">
        <div class="cz-g3">
          <div><label>Aporte inicial (%)</label><input type="text" inputmode="decimal" id="cz-aporte" value="40"/></div>
          <div><label>N.º de cuotas</label><input type="text" inputmode="numeric" id="cz-ncuotas" value="12"/></div>
          <div><label>Cuota mensual</label><input type="text" id="cz-cuota" readonly class="cz-ro cz-ro-b"/></div>
        </div>
        <p id="cz-plazo" class="cz-nota"></p>
      </div>
      <div id="cz-contado" style="display:none;">
        <p id="cz-contado-nota" class="cz-nota"></p>
        <div id="cz-pagos"></div>
        <button type="button" class="cz-btn-l" onclick="cotzAgregarPago()">+ Agregar pago</button>
        <p id="cz-contado-ok" class="cz-nota"></p>
      </div>
      <div class="cz-g3">
        <div><label>Acción del Country Club</label><select id="cz-accion"><option value="NO">Sin acción</option><option value="SI">Con acción (+$${COTZ_ACCION_PRECIO.toLocaleString('es-BO')})</option></select></div>
        <div><label>Total a pagar</label><input type="text" id="cz-total" readonly class="cz-ro cz-ro-b"/></div>
      </div>
    </section>

    <!-- ══ TIPO: PERFIL DE BÚSQUEDA ══ -->
    <section class="cz-sec cz-solo-perfil">
      <div class="cz-h"><span>1</span>Qué busca el cliente</div>
      <div class="cz-g3">
        <div><label>Presupuesto hasta ($us)</label><input type="text" inputmode="numeric" id="cz-p-presu" placeholder="ej. 180000"/></div>
        <div><label>Superficie desde (m²)</label><input type="text" inputmode="numeric" id="cz-p-supmin"/></div>
        <div><label>Superficie hasta (m²)</label><input type="text" inputmode="numeric" id="cz-p-supmax"/></div>
        <div><label>Módulo</label><select id="cz-p-modulo"><option value="">Cualquiera</option></select></div>
        <div><label>Forma de pago</label><select id="cz-p-modal"><option value="">A definir</option><option>Contado</option><option>Contado Diferido</option><option>Crédito Directo</option><option>Crédito Bancario</option></select></div>
        <div><label>Categoría</label><div class="cz-chips">${['A','B','C'].map(c => `<label><input type="checkbox" class="cz-p-cat" value="${c}"/><span>${c}</span></label>`).join('')}</div></div>
      </div>
      <label>Características que pidió</label>
      <div class="cz-chips cz-chips-w">${CZ_CARACT.map(c => `<label><input type="checkbox" class="cz-p-car" value="${c}"/><span>${c}</span></label>`).join('')}</div>
      <div style="margin-top:8px;"><label>Lo que contó el cliente <em class="cz-em">(sale en la hoja y le llega al asesor)</em></label>
        <textarea id="cz-p-notas" rows="3" placeholder="Ej.: quiere construir en 2027, tiene dos perros, prefiere cerca de la laguna…"></textarea></div>
    </section>

    <section class="cz-sec cz-solo-perfil">
      <div class="cz-h"><span>2</span>Terrenos sugeridos <em>opcional · hasta 3</em></div>
      <div class="cz-buscar"><input type="text" id="cz-p-buscar" placeholder="Filtrar por código, o dejá vacío para ver los que cumplen" autocomplete="off"/></div>
      <p id="cz-p-nota" class="cz-nota"></p>
      <div id="cz-p-sug" class="cz-res"></div>
    </section>

    <!-- ══ COMÚN ══ -->
    <section class="cz-sec">
      <div class="cz-h"><span>3</span>Cliente</div>
      <div class="cz-g2">
        <div><label>Nombre y apellido *</label><input type="text" id="cz-cliente" autocomplete="off"/></div>
        <div><label>WhatsApp</label><input type="text" inputmode="tel" id="cz-cel" placeholder="+591 7…" autocomplete="off"/></div>
        <div><label>Correo</label><input type="text" inputmode="email" id="cz-correo" autocomplete="off"/></div>
        <div><label>Ciudad</label><input type="text" id="cz-ciudad" value="Santa Cruz de la Sierra"/></div>
        <div><label>Busca su terreno para</label><select id="cz-prop"><option value="">—</option>${CZ_PROPOSITOS.map(x => `<option>${x}</option>`).join('')}</select></div>
        <div><label>Familia</label><select id="cz-fam"><option value="">—</option>${CZ_FAMILIAS.map(x => `<option>${x}</option>`).join('')}</select></div>
        <div><label>Cómo llegó</label><select id="cz-origen"><option value="">—</option></select></div>
        <div><label>Campaña</label><select id="cz-campania"><option value="">Sin campaña</option></select></div>
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-h"><span>4</span>${asig ? 'Asesor, asignación y visita' : 'Visita guiada y tus datos'}</div>
      ${asig ? `<div class="cz-g2">
        <div style="grid-column:1/-1;"><label>Asesor a cargo${soloCC ? ' *' : ''}</label><select id="cz-asesor" onchange="cotzAsesorCambio()"><option value="">${soloCC ? 'Elegir asesor…' : 'Equipo Comercial'}</option></select></div>
      </div>
      <label class="cz-chk"><input type="checkbox" id="cz-asig" checked ${soloCC ? 'disabled' : ''}/> Pasarle el cliente al asesor: entra a su cola de visitas y le llega un aviso</label>` : ''}
      <label class="cz-chk" style="margin-top:6px;"><input type="checkbox" id="cz-vis-on" onchange="cotzToggleVisita()"/> Agendar la visita guiada y mandarla en la hoja</label>
      <div id="cz-vis" class="cz-g2" style="display:none;margin-top:8px;">
        <div><label>Fecha</label><input type="date" id="cz-vis-fecha" min="${hoy}"/></div>
        <div><label>Hora</label><select id="cz-vis-hora"><option value="">—</option>${CZ_HORAS.map(x => `<option>${x}</option>`).join('')}</select></div>
        <p id="cz-vis-agenda" class="cz-nota" style="grid-column:1/-1;"></p>
      </div>
      <div class="cz-g2" style="margin-top:8px;">
        <div><label>WhatsApp del asesor</label><input type="text" inputmode="tel" id="cz-as-cel" placeholder="+591 7…"/></div>
        <div><label>Correo del asesor</label><input type="text" inputmode="email" id="cz-as-correo" placeholder="ventas@urubovillage.com"/></div>
      </div>
      <p class="cz-nota">Se guardan en la ficha del asesor: la próxima vez salen solos.</p>
    </section>

    <div class="cz-acciones">
      <button type="button" class="btn-primary" id="cz-generar" onclick="cotzGenerar()">${asig ? 'Generar y asignar' : 'Generar cotización'}</button>
      <button type="button" class="cz-btn-l" onclick="cotzNueva()">Limpiar</button>
    </div>
    <div id="cz-ok"></div>
  </div>

  <aside class="cz-prev">
    <div class="cz-prev-h"><span>Vista previa · así la recibe el cliente</span><em id="cz-prev-sub">Sin precio de lista ni descuento</em></div>
    <div class="cz-prev-box" id="cz-prev-box"><div class="cz-prev-esc" id="cz-prev-esc"></div></div>
  </aside>
</div>`;
}

function _czPoblarSelects() {
  const so = _czEl('cz-origen');
  if (so && typeof origenesData !== 'undefined') {
    const v = so.value;
    const lista = (origenesData || []).map(o => o.nombre).filter(x => typeof x === 'string');
    so.innerHTML = '<option value="">—</option>' + [...new Set(lista)].map(x => `<option>${esc(x)}</option>`).join('');
    so.value = v;
  }
  const sc = _czEl('cz-campania');
  if (sc && typeof campaniasData !== 'undefined') {
    const v = sc.value;
    sc.innerHTML = '<option value="">Sin campaña</option>' + (campaniasData || []).filter(c => c.activa !== false || c.codigo === v)
      .map(c => `<option value="${esc(c.codigo)}">${esc(c.nombre)} [${esc(c.codigo)}]</option>`).join('');
    sc.value = v;
  }
  const sm = _czEl('cz-p-modulo');
  if (sm) {
    const v = sm.value;
    const mods = [...new Set(_czLotes().map(l => _czPartes(_terrenoDeLote(l)).modulo).filter(Boolean))].sort((a, b) => a - b);
    sm.innerHTML = '<option value="">Cualquiera</option>' + mods.map(m => `<option value="${esc(m)}">Módulo ${esc(m)}</option>`).join('');
    sm.value = v;
  }
  const sa = _czEl('cz-asesor');
  if (sa) {
    const v = sa.value;
    const yo = _czYo();
    sa.innerHTML = sa.options[0].outerHTML + _czAsesoresVentas().map(a => `<option value="${a._key}">${esc(a.nombre)}${yo && a._key === yo._key ? ' (yo)' : ''}</option>`).join('');
    sa.value = v || (yo && _czMods().includes('ventas') ? yo._key : '');
    if (!v && sa.value) cotzAsesorCambio(true);
  }
  if (!sa && _czYo()) {
    if (!_czVal('cz-as-cel')) _czEl('cz-as-cel').value = _czYo().celular || '';
    if (!_czVal('cz-as-correo')) _czEl('cz-as-correo').value = _czYo().correo || '';
  }
}

function cotzAsesorCambio(silencioso) {
  const a = _czAsesoresVentas().find(x => x._key === _czVal('cz-asesor'));
  _czEl('cz-as-cel').value = a?.celular || '';
  _czEl('cz-as-correo').value = a?.correo || '';
  const asig = _czEl('cz-asig'), yo = _czYo();
  if (asig && !asig.disabled) asig.checked = !!a && !(yo && a._key === yo._key);
  if (!silencioso) { _czAgendaHint(); if (cz.lote) _czPintarLote(); _czPreview(); }
}
function _czAsesorElegido() {
  if (_czEl('cz-asesor')) { const k = _czVal('cz-asesor'); return k ? _czAsesoresVentas().find(x => x._key === k) || null : null; }
  const yo = _czYo();
  return yo ? { _key: yo._key, nombre: yo.nombre, celular: yo.celular, correo: yo.correo } : null;
}

/* ── Tipo ── */
function cotzTipo(t) { cz.tipo = t; _czAplicarTipo(); if (t === 'perfil') _czSugerir(); _czPreview(); }
function _czAplicarTipo() {
  const h = _czEl(cz.host); if (!h) return;
  h.querySelectorAll('.cz-solo-terreno').forEach(e => e.style.display = cz.tipo === 'terreno' ? '' : 'none');
  h.querySelectorAll('.cz-solo-perfil').forEach(e => e.style.display = cz.tipo === 'perfil' ? '' : 'none');
  _czEl('cz-tipo-terreno')?.classList.toggle('on', cz.tipo === 'terreno');
  _czEl('cz-tipo-perfil')?.classList.toggle('on', cz.tipo === 'perfil');
  const sub = _czEl('cz-prev-sub'); if (sub) sub.textContent = cz.tipo === 'perfil' ? 'Propuesta de terrenos' : 'Sin precio de lista ni descuento';
}

/* ── 1 · Terreno ── */
function cotzBuscar() {
  const term = _czNorm(_czVal('cz-buscar'));
  const cont = _czEl('cz-res'); if (!cont) return;
  if (!term) { cont.innerHTML = ''; return; }
  const solo = _czEl('cz-solo-disp')?.checked;
  let r = _czLotes().filter(l => _czNorm(_terrenoDeLote(l)).includes(term));
  if (solo) r = r.filter(l => (l.estado || 'Disponible') === 'Disponible');
  r.sort((a, b) => ((a.estado === 'Disponible') ? 0 : 1) - ((b.estado === 'Disponible') ? 0 : 1) || String(_terrenoDeLote(a)).localeCompare(String(_terrenoDeLote(b)), 'es', { numeric: true }));
  r = r.slice(0, 12);
  window._czLotesVisibles = r;
  if (!r.length) { cont.innerHTML = `<div class="cz-vacio">Sin terrenos${solo ? ' disponibles' : ''} con ese código.</div>`; return; }
  cont.innerHTML = r.map(l => _czFilaLote(l, `cotzElegirLote('${escJs(l._key)}')`)).join('');
}
function _czFilaLote(l, onclick, check) {
  const cod = _terrenoDeLote(l), f = cotzFotos(cod)[0];
  const cot = _czCotizacionesVigentes(cod).length;
  return `<${check ? 'label' : 'button type="button"'} class="cz-r${check ? ' cz-r-chk' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
    ${check ? `<input type="checkbox" class="cz-p-sel" value="${esc(l._key)}" ${cz.sugeridos.includes(l._key) ? 'checked' : ''}/>` : ''}
    <span class="cz-r-img">${f ? `<img src="${esc(f)}" alt="" loading="lazy">` : ''}</span>
    <span class="cz-r-c"><b>${esc(cod)}</b> · Cat. ${esc(l.categoria || '—')}${cot ? ' <i class="cz-tag">cotizado</i>' : ''}</span>
    <span class="cz-r-m">${(Number(l.metraje) || 0).toLocaleString('es-BO')} m²</span>
    <span class="cz-r-p">$${Math.round(l.precio || 0).toLocaleString('es-BO')}</span>
    <span class="cz-est cz-est-${_czNorm(l.estado || 'Disponible').replace(/\s+/g, '-')}">${esc(l.estado || 'Disponible')}</span>
  </${check ? 'label' : 'button'}>`;
}

function cotzElegirLote(key) {
  const l = (window._czLotesVisibles || []).find(x => x._key === key) || _czLotes().find(x => x._key === key);
  if (!l) return;
  cz.lote = l;
  _czEl('cz-res').innerHTML = '';
  _czEl('cz-buscar').value = _terrenoDeLote(l);
  _czEl('cz-lista').value = '$' + Math.round(l.precio || 0).toLocaleString('es-BO');
  _czEl('cz-desc').dataset.tope = '';
  cz.pagos = [];
  _czPintarLote();
  _czRecalcular('lote');
}

function _czCotizacionesVigentes(cod) {
  return (typeof cotizacionesData !== 'undefined' ? cotizacionesData : [])
    .filter(c => c.estado !== 'anulada' && _estadoRealCotizacion(c) !== 'vencido' && (!cz.renovadaDe || c._key !== cz.renovadaDe) &&
      (_czNorm(c.terreno) === _czNorm(cod) || (c.sugeridos || []).some(s => _czNorm(s.terreno) === _czNorm(cod))));
}
function _czAvisosLote(l) {
  const cod = _terrenoDeLote(l), yo = _czAsesorElegido(), avisos = [];
  const est = l.estado || 'Disponible';
  if (est === 'Vendido') avisos.push({ t: 'no', m: 'Figura Vendido en Orange: no se puede cotizar.' });
  else if (est !== 'Disponible') avisos.push({ t: 'warn', m: `Figura "${est}" en Orange.` + (_czModoAdmin() ? ' Como admin podés cotizarlo igual, con confirmación.' : ' Solo el admin puede cotizarlo.') });
  if (l.estadoNegociacion === 'negociacion' && l.negociadoPorKey && (!yo || l.negociadoPorKey !== yo._key))
    avisos.push({ t: 'warn', m: `En negociación por ${l.negociadoPorNombre || 'otro asesor'}.` });
  _czCotizacionesVigentes(cod).forEach(c => {
    const quien = c.asesorNombre || 'Equipo Comercial';
    const cli = (_czModoAdmin() || _czPuedeAsignar()) ? ` a ${c.cliente || '—'}` : '';
    avisos.push({ t: 'info', m: `${c.tipo === 'perfil' ? 'Sugerido' : 'Ya cotizado'}${cli} por ${quien} el ${new Date(c.ts).toLocaleDateString('es-BO')} · vence ${new Date(c.fechaVencimiento).toLocaleDateString('es-BO')}${c.estado === 'confirmado' ? ' · confirmada' : ''}.` });
  });
  return avisos;
}
function _czPintarLote() {
  const l = cz.lote, box = _czEl('cz-lote'); if (!box) return;
  if (!l) { box.innerHTML = ''; return; }
  const cod = _terrenoDeLote(l), p = _czPartes(cod), fotos = cotzFotos(cod);
  box.innerHTML = `<div class="cz-lote">
    <div class="cz-lote-img">${fotos[0] ? `<img src="${esc(fotos[0])}" alt="Terreno ${esc(cod)}">` : cotzEsquemaSVG(cod, l.metraje)}${fotos.length > 1 ? `<span class="cz-lote-n">${fotos.length} fotos</span>` : ''}</div>
    <div class="cz-lote-d">
      <div class="cz-lote-cod">${esc(cod)}</div>
      <div class="cz-lote-g">
        <span>Módulo</span><b>${esc(p.modulo || '—')}</b><span>Manzana</span><b>${esc(p.manzana || '—')}</b>
        <span>Categoría</span><b>${esc(l.categoria || '—')}</b><span>Superficie</span><b>${(Number(l.metraje) || 0).toLocaleString('es-BO')} m²</b>
        <span>Precio de lista</span><b>$${Math.round(l.precio || 0).toLocaleString('es-BO')}</b><span>Estado</span><b>${esc(l.estado || 'Disponible')}</b>
      </div>
      ${fotos.length ? '' : '<div class="cz-nota">Sin foto cargada: la hoja muestra el esquema de la manzana.</div>'}
    </div>
  </div>
  ${_czAvisosLote(l).map(a => `<div class="cz-aviso cz-aviso-${a.t}">${esc(a.m)}</div>`).join('')}`;
}

/* ── Eventos ──
   Mientras se escribe (input) NUNCA se reescribe el campo que se está tecleando:
   el ajuste al tope o al plazo máximo se hace al salir del campo (change). */
function _czOnInput(e) {
  const t = e.target, id = t.id || '', escribiendo = e.type === 'input';
  if (id === 'cz-buscar' || id === 'cz-solo-disp' || id === 'cz-asesor' || id === 'cz-tipo') return;
  if (t.classList.contains('cz-p-sel')) { if (e.type === 'change') _czToggleSugerido(t); return; }
  if (id.startsWith('cz-p-') || t.classList.contains('cz-p-cat') || t.classList.contains('cz-p-car')) {
    if (id === 'cz-p-notas') { _czPreviewDebounced(); return; }
    clearTimeout(_czSugT); _czSugT = setTimeout(() => { _czSugerir(); _czPreview(); }, escribiendo ? 250 : 0); return;
  }
  if (id.startsWith('cz-pago-')) {
    const [, , campo, i] = id.split('-');
    const v = parseFloat(t.value) || 0;
    if (cz.pagos[i]) { if (campo === 'd') cz.pagos[i].dias = Math.max(0, Math.round(v)); else cz.pagos[i].monto = v; }
    _czContadoEstado(_czTotal(), _czPlazoMax()); _czPreviewDebounced(); return;
  }
  if (id === 'cz-modalidad') { if (e.type === 'change') _czRecalcular('modalidad'); return; }
  if (id === 'cz-accion') { if (e.type === 'change') { cz.pagos = []; _czRecalcular('pagos'); } return; }
  if (id === 'cz-final') return _czRecalcular('precio', escribiendo);
  if (id === 'cz-desc') return _czRecalcular('pct', escribiendo);
  if (id === 'cz-aporte' || id === 'cz-ncuotas') return _czRecalcular('plan', escribiendo);
  if (id === 'cz-vis-fecha' || id === 'cz-vis-hora') { _czAgendaHint(); _czPreview(); return; }
  _czPreviewDebounced();
}
let _czSugT = null;

/* ── 2 · Inversión ── */
function _czTope() {
  const l = cz.lote, modalidad = _czVal('cz-modalidad');
  if (!l || !modalidad) return { pct: 0, hay: false };
  const hoy = new Date();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const pol = (typeof obtenerPoliticaDescuento === 'function') ? obtenerPoliticaDescuento(modalidad, l.categoria || '', hoy.getFullYear(), meses[hoy.getMonth()]) : null;
  return pol ? { pct: Number(pol.pctMax) || 0, hay: true } : { pct: 0, hay: false };
}
function _czPlazoMax() { const p = (typeof obtenerPlazoModalidad === 'function') ? obtenerPlazoModalidad(_czVal('cz-modalidad')) : null; return p ? p.plazoMax : null; }
function _czLista() { return cz.lote ? Number(cz.lote.precio) || 0 : 0; }
/* Precio final que vale: lo tecleado, nunca por debajo de lista − tope (sí puede quedar por encima del precio de lista) */
function _czFinalValido() {
  const lista = _czLista(); if (!lista) return 0;
  const min = Math.round(lista * (1 - _czTope().pct / 100));
  let f = parseFloat(String(_czVal('cz-final')).replace(/[^\d.]/g, '')) || 0;
  if (!f || f < min) f = min;
  return f;
}
/* Acción del Country Club (si el cliente la quiere) y total a pagar: terreno + acción */
function _czAccion() { return _czVal('cz-accion') === 'SI' ? COTZ_ACCION_PRECIO : 0; }
function _czTotal() { const f = _czFinalValido(); return f ? f + _czAccion() : 0; }
function _czSet(id, v) { const e = _czEl(id); if (e && document.activeElement !== e) e.value = v; }

function _czRecalcular(origen, escribiendo) {
  const lista = _czLista(), modalidad = _czVal('cz-modalidad'), tope = _czTope();
  const inDesc = _czEl('cz-desc'), inFinal = _czEl('cz-final'); if (!inDesc) return;

  if (origen === 'modalidad' || origen === 'lote' || inDesc.dataset.tope !== String(tope.pct)) {
    inDesc.value = tope.pct; inDesc.dataset.tope = String(tope.pct);
    inFinal.value = lista ? Math.round(lista * (1 - tope.pct / 100)) : '';
    cz.pagos = [];
  }
  let excede = false;
  if (origen === 'precio') {
    const tecleado = parseFloat(String(inFinal.value).replace(/[^\d.]/g, '')) || 0;
    const pct = lista && tecleado ? _czR2((1 - tecleado / lista) * 100) : 0;
    excede = !!tecleado && pct > tope.pct + 1e-9;
    _czSet('cz-desc', Math.max(0, Math.min(pct, tope.pct)));
    if (!escribiendo && lista) { inFinal.value = Math.round(_czFinalValido()); inDesc.value = _czR2(Math.max(0, (1 - _czFinalValido() / lista) * 100)); }
  } else if (origen === 'pct') {
    const pct = parseFloat(String(inDesc.value).replace(',', '.')) || 0;
    excede = pct > tope.pct + 1e-9;
    const p = Math.max(0, Math.min(pct, tope.pct));
    if (lista) inFinal.value = Math.round(lista * (1 - p / 100));
    if (!escribiendo && excede) inDesc.value = p;
  }
  const final = _czTotal();   // el plan de pago se arma sobre el total (terreno + acción si la eligió)
  const inTot = _czEl('cz-total'); if (inTot) { inTot.value = _czFinalValido() ? '$' + Math.round(final).toLocaleString('es-BO') : ''; inTot.title = _czAccion() ? 'Terreno $' + Math.round(_czFinalValido()).toLocaleString('es-BO') + ' + acción $' + COTZ_ACCION_PRECIO.toLocaleString('es-BO') : 'Solo el terreno, sin acción'; }

  _czEl('cz-pol').innerHTML = !cz.lote ? 'Elegí un terreno para ver el precio y el descuento autorizado.'
    : tope.hay ? `Política vigente para <b>${esc(modalidad)} · Categoría ${esc(cz.lote.categoria || '—')}</b>: hasta <b>${tope.pct}%</b> (precio mínimo $${Math.round(lista * (1 - tope.pct / 100)).toLocaleString('es-BO')}).${excede ? ` <span class="cz-rojo">${escribiendo ? 'Pasa el tope: al salir del campo se ajusta.' : 'Se ajustó al tope autorizado.'}</span>` : ''}${_czFinalValido() > lista ? ` <b>Precio $${Math.round(_czFinalValido() - lista).toLocaleString('es-BO')} por encima del de lista (+${_czR2((_czFinalValido() / lista - 1) * 100)}%).</b>` : ''}`
    : `<span class="cz-rojo">No hay política cargada para ${esc(modalidad)} · Categoría ${esc(cz.lote.categoria || '—')}: se cotiza sin descuento.</span>`;

  const esContado = modalidad === 'Contado', max = _czPlazoMax();
  _czEl('cz-cuotas').style.display = esContado ? 'none' : '';
  _czEl('cz-contado').style.display = esContado ? '' : 'none';
  if (esContado) {
    if (!cz.pagos.length) cz.pagos = [{ dias: 0, monto: Math.round(final) }];
    else if (cz.pagos.length === 1) { cz.pagos[0].monto = Math.round(final); _czSet('cz-pago-m-0', cz.pagos[0].monto); }
    if (!_czEl('cz-pago-m-0') || origen === 'modalidad' || origen === 'lote' || origen === 'pagos') _czPintarPagos(final, max);
    else _czContadoEstado(final, max);
  } else {
    const inN = _czEl('cz-ncuotas');
    if (max && (origen === 'modalidad' || origen === 'lote')) inN.value = max;
    let n = Math.max(1, parseInt(inN.value) || 1);
    if (max && n > max) { n = max; if (!escribiendo) inN.value = max; }
    let pctA = parseFloat(String(_czVal('cz-aporte')).replace(',', '.')) || 0;
    pctA = Math.max(0, Math.min(100, pctA)); if (!escribiendo && origen === 'plan') _czEl('cz-aporte').value = pctA;
    const aporte = final * pctA / 100, saldo = final - aporte;
    _czEl('cz-cuota').value = '$' + Math.round(saldo / n).toLocaleString('es-BO');
    _czEl('cz-plazo').innerHTML = max ? `Plazo máximo autorizado para ${esc(modalidad)}: <b>${max} cuotas</b>. Aporte $${Math.round(aporte).toLocaleString('es-BO')} · saldo $${Math.round(saldo).toLocaleString('es-BO')}.`
      : `<span class="cz-rojo">No hay plazo máximo cargado para ${esc(modalidad)} en Panel de Control.</span>`;
  }
  if (origen === 'lote' || origen === 'modalidad') _czPintarLote();
  escribiendo ? _czPreviewDebounced() : _czPreview();
}

function _czPintarPagos(final, max) {
  _czEl('cz-contado-nota').innerHTML = max ? `El cliente completa el pago en <b>máximo ${max} días</b>, en uno o varios pagos.` : '<span class="cz-rojo">No hay plazo máximo cargado para Contado en Panel de Control.</span>';
  _czEl('cz-pagos').innerHTML = cz.pagos.map((p, i) => `<div class="cz-pago">
    <div><label>Día (desde hoy)</label><input type="text" inputmode="numeric" id="cz-pago-d-${i}" value="${p.dias}"/></div>
    <div><label>Monto ($)</label><input type="text" inputmode="numeric" id="cz-pago-m-${i}" value="${p.monto || ''}"/></div>
    ${cz.pagos.length > 1 ? `<button type="button" class="cz-x" onclick="cotzQuitarPago(${i})" title="Quitar">×</button>` : '<span></span>'}
  </div>`).join('');
  _czContadoEstado(final, max);
}
function _czContadoEstado(final, max) {
  const total = cz.pagos.reduce((s, p) => s + (p.monto || 0), 0), dif = Math.round(final - total);
  const diaMax = Math.max(0, ...cz.pagos.map(p => p.dias || 0));
  const msgs = [];
  if (Math.abs(dif) >= 1) msgs.push(dif > 0 ? `Faltan $${dif.toLocaleString('es-BO')} para completar el total a pagar.` : `Los pagos superan el total a pagar por $${(-dif).toLocaleString('es-BO')}.`);
  if (max && diaMax > max) msgs.push(`Hay un pago en el día ${diaMax}; el máximo es ${max} días.`);
  const el = _czEl('cz-contado-ok');
  if (el) el.innerHTML = msgs.length ? `<span class="cz-rojo">${msgs.join(' ')}</span>` : 'Los pagos suman el total a pagar.';
  return !msgs.length;
}
function cotzAgregarPago() {
  const final = _czTotal();
  const resto = Math.max(0, Math.round(final - cz.pagos.reduce((s, p) => s + (p.monto || 0), 0)));
  cz.pagos.push({ dias: 15 * cz.pagos.length, monto: resto });
  _czRecalcular('pagos');
}
function cotzQuitarPago(i) { cz.pagos.splice(i, 1); _czRecalcular('pagos'); }

/* ── Perfil de búsqueda ── */
function _czPerfil() {
  const chk = cls => [..._czEl(cz.host).querySelectorAll('.' + cls + ':checked')].map(x => x.value);
  return {
    presupuesto: parseFloat(_czVal('cz-p-presu').replace(/[^\d.]/g, '')) || 0,
    supMin: parseFloat(_czVal('cz-p-supmin')) || 0, supMax: parseFloat(_czVal('cz-p-supmax')) || 0,
    modulo: _czVal('cz-p-modulo'), modalidad: _czVal('cz-p-modal'),
    categorias: chk('cz-p-cat'), caracteristicas: chk('cz-p-car'), notas: _czVal('cz-p-notas'),
  };
}
function _czSugerir() {
  const cont = _czEl('cz-p-sug'); if (!cont || !cz.host) return;
  const p = _czPerfil(), term = _czNorm(_czVal('cz-p-buscar'));
  let r = _czLotes().filter(l => (l.estado || 'Disponible') === 'Disponible');
  if (term) r = r.filter(l => _czNorm(_terrenoDeLote(l)).includes(term));
  else {
    if (p.presupuesto) r = r.filter(l => (Number(l.precio) || 0) <= p.presupuesto);
    if (p.supMin) r = r.filter(l => (Number(l.metraje) || 0) >= p.supMin);
    if (p.supMax) r = r.filter(l => (Number(l.metraje) || 0) <= p.supMax);
    if (p.modulo) r = r.filter(l => _czPartes(_terrenoDeLote(l)).modulo === p.modulo);
    if (p.categorias.length) r = r.filter(l => p.categorias.includes(l.categoria));
  }
  const total = r.length;
  r.sort((a, b) => (cotzFotos(_terrenoDeLote(b)).length ? 1 : 0) - (cotzFotos(_terrenoDeLote(a)).length ? 1 : 0)
    || (p.presupuesto ? (p.presupuesto - (b.precio || 0)) - (p.presupuesto - (a.precio || 0)) : (a.precio || 0) - (b.precio || 0)));
  const elegidos = cz.sugeridos.map(k => _czLotes().find(l => l._key === k)).filter(Boolean);
  const lista = elegidos.concat(r.filter(l => !cz.sugeridos.includes(l._key)).slice(0, 12));
  _czEl('cz-p-nota').innerHTML = `${total} terreno${total === 1 ? '' : 's'} disponible${total === 1 ? '' : 's'} ${term ? 'con ese código' : 'cumplen lo que pidió'}. Marcá hasta 3 para mandarle como opciones${cz.sugeridos.length ? ` · <b>${cz.sugeridos.length} elegido${cz.sugeridos.length > 1 ? 's' : ''}</b>` : ''}.`;
  cont.innerHTML = lista.length ? lista.map(l => _czFilaLote(l, '', true)).join('') : '<div class="cz-vacio">Ningún terreno disponible cumple todo. Igual podés mandar el perfil: el asesor le presenta opciones.</div>';
}
function _czToggleSugerido(inp) {
  const k = inp.value;
  if (inp.checked) {
    if (cz.sugeridos.length >= 3) { inp.checked = false; toastErr('Hasta 3 terrenos sugeridos.'); return; }
    if (!cz.sugeridos.includes(k)) cz.sugeridos.push(k);
  } else cz.sugeridos = cz.sugeridos.filter(x => x !== k);
  _czSugerir(); _czPreview();
}

/* ── 4 · Visita ── */
function cotzToggleVisita() {
  const on = _czEl('cz-vis-on').checked;
  _czEl('cz-vis').style.display = on ? '' : 'none';
  if (on && !_czVal('cz-vis-fecha')) { const d = new Date(); d.setDate(d.getDate() + 1); _czEl('cz-vis-fecha').value = d.toISOString().split('T')[0]; }
  _czAgendaHint(); _czPreview();
}
function _czAgendaHint() {
  const el = _czEl('cz-vis-agenda'); if (!el) return;
  const f = _czVal('cz-vis-fecha'), a = _czAsesorElegido();
  if (!f || !a) { el.textContent = a ? '' : 'Elegí un asesor para ver su agenda de ese día.'; return; }
  const lista = (typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : [])
    .filter(v => v.asesorKey === a._key && v.fecha === f && v.estado !== 'cancelada').sort((x, y) => String(x.hora).localeCompare(String(y.hora)));
  const choca = lista.some(v => v.hora && v.hora === _czVal('cz-vis-hora'));
  el.innerHTML = lista.length
    ? `Agenda de ${esc(a.nombre)} ese día: ${lista.map(v => `<b>${esc(v.hora || 's/h')}</b> ${esc(v.nombre || '')}`).join(' · ')}${choca ? ' <span class="cz-rojo">· ya hay una visita a esa hora.</span>' : ''}`
    : `${esc(a.nombre)} no tiene visitas agendadas ese día.`;
}

/* ── Datos armados (los mismos para la vista previa y para guardar) ── */
function _czDatos() {
  const vig = Math.max(1, parseInt(_czVal('cz-vig')) || (cz.tipo === 'perfil' ? 7 : 5));
  const a = _czAsesorElegido();
  const visOn = _czEl('cz-vis-on')?.checked && _czVal('cz-vis-fecha');
  const base = {
    cliente: _czVal('cz-cliente'), celular: _czVal('cz-cel'), correo: _czVal('cz-correo'),
    ciudad: _czVal('cz-ciudad'), proposito: _czVal('cz-prop'), familia: _czVal('cz-fam'), origen: _czVal('cz-origen'), campaniaCodigo: _czVal('cz-campania'),
    vigenciaDias: vig, fechaVencimiento: Date.now() + vig * 86400000,
    asesorKey: a?._key || '', asesorNombre: a?.nombre || 'Equipo Comercial',
    asesorCelular: _czVal('cz-as-cel'), asesorCorreo: _czVal('cz-as-correo'),
    visita: visOn ? { fecha: _czVal('cz-vis-fecha'), hora: _czVal('cz-vis-hora') } : null,
  };
  if (cz.tipo === 'perfil') {
    const perfil = _czPerfil();
    const sugeridos = cz.sugeridos.map(k => _czLotes().find(l => l._key === k)).filter(Boolean).map(l => {
      const cod = _terrenoDeLote(l), p = _czPartes(cod);
      return { terreno: cod, modulo: p.modulo, manzana: p.manzana, categoria: l.categoria || '', superficie: Number(l.metraje) || 0, precio: Math.round(Number(l.precio) || 0) };
    });
    return { ...base, tipo: 'perfil', perfil, sugeridos, terreno: '', modalidad: perfil.modalidad, precioFinal: 0, precioLista: 0, descuentoPct: 0 };
  }
  const l = cz.lote;
  const cod = l ? _terrenoDeLote(l) : '';
  const p = _czPartes(cod);
  const modalidad = _czVal('cz-modalidad');
  const lista = _czLista(), final = _czFinalValido(), acc = _czAccion(), total = final ? final + acc : 0;
  const pct = lista ? _czR2((1 - final / lista) * 100) : 0;
  const esContado = modalidad === 'Contado';
  const max = _czPlazoMax();
  const n = esContado ? cz.pagos.length : Math.min(max || 999, Math.max(1, parseInt(_czVal('cz-ncuotas')) || 1));
  const pctA = esContado ? 0 : Math.max(0, Math.min(100, parseFloat(String(_czVal('cz-aporte')).replace(',', '.')) || 0));
  const aporte = _czR2(total * pctA / 100), saldo = _czR2(total - aporte);
  return {
    ...base, tipo: 'terreno',
    terreno: cod, modulo: l?.modulo || p.modulo, manzana: p.manzana, lote: p.lote, categoria: l?.categoria || '', superficie: Number(l?.metraje) || 0,
    precioLista: lista, descuentoPct: Math.max(0, pct), descuentoMaxPct: _czTope().pct, precioFinal: final,
    conAccion: acc ? 'SI' : 'NO', accionPrecio: acc, precioTotal: total,
    modalidad, reserva: esContado ? 0 : (parseFloat(String(_czVal('cz-reserva')).replace(/[^\d.]/g, '')) || 0),
    pctAporte: pctA, montoAporte: esContado ? 0 : aporte, montoSaldo: esContado ? 0 : saldo,
    nroCuotas: n, montoCuota: esContado ? 0 : _czR2(saldo / n),
    pagosContado: esContado ? cz.pagos.map(x => ({ dias: x.dias || 0, monto: _czR2(x.monto || 0) })) : null,
  };
}

let _czPrevT = null;
function _czPreviewDebounced() { clearTimeout(_czPrevT); _czPrevT = setTimeout(_czPreview, 220); }
function _czPreview() {
  const box = _czEl('cz-prev-esc'); if (!box) return;
  const d = _czDatos();
  if (d.tipo === 'terreno' && !d.terreno) d.terreno = '1-0-0';
  if (!d.cliente) d.cliente = 'Nombre del cliente';
  d.ts = Date.now(); d.codigo = 'UV-' + (d.tipo === 'perfil' ? 'P' : 'M' + (_czPartes(d.terreno).modulo || '1')) + '-AAAAMMDD-XXXX';
  cotzLogoBlanco().then(logo => {
    box.innerHTML = cotzHojaHTML(d, { logo, fijo: true, qrSvg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#EFE9DD"/><text x="5" y="6.2" text-anchor="middle" font-size="2.4" fill="#9A8F76" font-family="Arial">QR</text></svg>' });
    _czEscalarPreview();
  });
}
function _czEscalarPreview() {
  const box = _czEl('cz-prev-box'), esc_ = _czEl('cz-prev-esc'); if (!box || !esc_) return;
  const w = box.clientWidth || 400, s = Math.min(1, w / 794);
  esc_.style.transform = `scale(${s})`;
  box.style.height = ((esc_.firstElementChild?.offsetHeight || 1123) * s) + 'px';
}
window.addEventListener('resize', () => { if (_czEl('cz-prev-box')) _czEscalarPreview(); });

/* ── Generar (y asignar) ── */
async function cotzGenerar() {
  const d = _czDatos();
  if (!d.cliente) { toastErr('Falta el nombre del cliente.'); _czEl('cz-cliente').focus(); return; }
  if (!d.celular && !d.correo) { toastErr('Cargá el WhatsApp o el correo del cliente.'); _czEl('cz-cel').focus(); return; }

  if (d.tipo === 'terreno') {
    const l = cz.lote;
    if (!l) { toastErr('Elegí un terreno.'); _czEl('cz-buscar')?.focus(); return; }
    if (!d.precioFinal) { toastErr('El terreno no tiene precio de lista cargado.'); return; }
    const est = l.estado || 'Disponible';
    if (est === 'Vendido') { toastErr('Ese terreno figura Vendido.'); return; }
    if (est !== 'Disponible') {
      if (!_czModoAdmin()) { toastErr(`Ese terreno figura "${est}". Pedile al admin que lo revise.`); return; }
      if (!await confirmDialog(`El terreno ${d.terreno} figura "${est}" en Orange. ¿Cotizarlo igual?`, { title: 'Terreno no disponible', okText: 'Cotizar igual' })) return;
    }
    const max = _czPlazoMax();
    if (d.modalidad === 'Contado') { if (!_czContadoEstado(d.precioTotal, max)) { toastErr('Revisá los pagos del contado.'); return; } }
    _czRecalcular('plan');
  } else {
    const p = d.perfil;
    if (!p.presupuesto && !p.supMin && !p.categorias.length && !p.caracteristicas.length && !p.notas && !d.sugeridos.length) {
      toastErr('Contá qué busca el cliente (presupuesto, superficie, características o notas).'); return;
    }
  }
  const asesor = _czAsesorElegido(), yo = _czYo();
  if (_czRolCreador() === 'callcenter' && !asesor) { toastErr('Elegí el asesor a quien le pasás el cliente.'); _czEl('cz-asesor')?.focus(); return; }
  const asignar = !!(_czEl('cz-asig')?.checked && asesor && !(yo && asesor._key === yo._key));
  if (d.visita && !d.visita.hora) { toastErr('Elegí la hora de la visita.'); _czEl('cz-vis-hora').focus(); return; }
  if (d.visita && !d.asesorKey) { toastErr('Para agendar la visita elegí el asesor a cargo.'); return; }

  const btn = _czEl('cz-generar'); btnLoading(btn, true);
  try {
    const codigo = d.tipo === 'perfil' ? cotzNuevoCodigo('P-0-0').replace('UV-MP', 'UV-P') : cotzNuevoCodigo(d.terreno);
    const data = { ...d, codigo, estado: 'pendiente', origenCotizacion: 'Plataforma', vistas: 0,
      creadoPorKey: _czModoAdmin() ? 'admin' : (yo?._key || ''), creadoPorNombre: _czModoAdmin() ? 'Admin' : (yo?.nombre || ''), creadoPorRol: _czRolCreador(), asignada: asignar };
    if (cz.registroKey) data.registroKey = cz.registroKey;
    if (cz.renovadaDe) data.renovadaDe = cz.renovadaDe;
    Object.keys(data).forEach(k => { if (data[k] === null || data[k] === undefined) delete data[k]; });
    const res = await window._fbPushCotizacion(data);
    const key = res.key;
    const link = location.origin + location.pathname + '?cotizacion=' + key;

    // Visita programada: si se asigna (siempre) o si se eligió fecha de visita
    if (asignar || d.visita) {
      const fecha = d.visita?.fecha || new Date().toISOString().split('T')[0];
      const fv = new Date(fecha + 'T12:00:00');
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const vref = await window._fbPushVisitaProgramada({
        nombre: d.cliente, telefono: d.celular, asesorKey: d.asesorKey, asesorNombre: d.asesorNombre,
        fecha, hora: d.visita?.hora || '', mes: meses[fv.getMonth()], anio: fv.getFullYear(),
        origen: d.origen || '', campaniaCodigo: d.campaniaCodigo || '',
        interes: _czResumenInteres(data, link),
        cargadoPorKey: data.creadoPorKey, cargadoPorNombre: data.creadoPorNombre,
        estado: 'pendiente', cotizacionKey: key, cotizacionCodigo: codigo, ...(d.visita ? {} : { sinHorario: true }),
      });
      if (vref?.key) await window._fbUpdateCotizacion(key, { visitaKey: vref.key, ...(d.visita ? { visita: { ...d.visita, key: vref.key } } : {}) });
      if (asignar && window._fbPushNotificacion) {
        await window._fbPushNotificacion(d.asesorKey, {
          tipo: 'cotizacion_asignada', cotizacionKey: key, ts: Date.now(), leida: false,
          mensaje: `${data.creadoPorNombre} te asignó a ${d.cliente} con ${d.tipo === 'perfil' ? 'un perfil de búsqueda' : 'la cotización del terreno ' + d.terreno}${d.visita ? ` · visita ${d.visita.fecha} ${d.visita.hora}` : ''}.`,
        });
      }
    }
    // WhatsApp/correo del asesor: quedan en su ficha para la próxima
    if (d.asesorKey) {
      const a = (typeof asesores !== 'undefined' ? asesores : []).find(x => x._key === d.asesorKey);
      const upd = {};
      if (d.asesorCelular && a?.celular !== d.asesorCelular) upd.celular = d.asesorCelular;
      if (d.asesorCorreo && a?.correo !== d.asesorCorreo) upd.correo = d.asesorCorreo;
      if (Object.keys(upd).length) { await window._fbUpdateAsesor(d.asesorKey, upd); if (a) Object.assign(a, upd); if (yo && yo._key === d.asesorKey) Object.assign(yo, upd); }
    }
    cz.guardada = { ...data, _key: key, ts: Date.now() };
    btnSuccess(btn);
    toastOk(codigo + (asignar ? ' generada y asignada a ' + d.asesorNombre + '.' : ' generada.'));
    _czMostrarOk(cz.guardada, link, asignar);
  } catch (e) {
    btnLoading(btn, false);
    toastErr('No se pudo guardar: ' + (e.message || e));
  }
}

function _czResumenInteres(c, link) {
  const P = [];
  if (c.tipo === 'perfil') {
    const p = c.perfil || {};
    P.push('Perfil de búsqueda ' + c.codigo);
    if (p.presupuesto) P.push('Presupuesto hasta $' + Math.round(p.presupuesto).toLocaleString('es-BO'));
    if (p.supMin || p.supMax) P.push(p.supMin && p.supMax ? `${p.supMin} a ${p.supMax} m²` : (p.supMin ? `desde ${p.supMin} m²` : `hasta ${p.supMax} m²`));
    if (p.modulo) P.push('Módulo ' + p.modulo);
    if (p.categorias?.length) P.push('Cat. ' + p.categorias.join('/'));
    if (p.modalidad) P.push(p.modalidad);
    if (p.caracteristicas?.length) P.push(p.caracteristicas.join(', '));
    if (c.sugeridos?.length) P.push('Sugeridos: ' + c.sugeridos.map(s => s.terreno).join(', '));
    if (p.notas) P.push('"' + p.notas + '"');
  } else P.push(`Cotización ${c.codigo} · Terreno ${c.terreno} · ${c.modalidad} · $${Math.round(c.precioTotal || c.precioFinal).toLocaleString('es-BO')}${c.precioTotal != null ? (c.conAccion === 'SI' ? ' con acción' : ' sin acción') : ''}`);
  if (c.proposito) P.push('Busca para: ' + c.proposito);
  if (c.familia) P.push('Familia: ' + c.familia);
  P.push(link);
  return P.join(' · ');
}

function _czMostrarOk(c, link, asignada) {
  const wa = _czCelularWa(c.celular);
  const txt = c.tipo === 'perfil'
    ? `Hola ${String(c.cliente).split(/\s+/)[0]}, te comparto la propuesta de terrenos que preparamos según lo que buscás en Urubó Village: ${link}`
    : `Hola ${String(c.cliente).split(/\s+/)[0]}, te comparto la cotización de tu terreno ${c.terreno} en Urubó Village: ${link}`;
  _czEl('cz-ok').innerHTML = `<div class="cz-okbox">
    <div class="cz-ok-h"><b>${esc(c.codigo)}</b> guardada${asignada ? ` · asignada a <b>${esc(c.asesorNombre)}</b>` : ''}${c.visita ? ' · visita agendada' : ''}</div>
    <div class="cz-ok-link"><input type="text" readonly value="${esc(link)}" id="cz-ok-link" onclick="this.select()"/></div>
    <div class="cz-ok-b">
      <button type="button" class="btn-primary" onclick="navigator.clipboard?.writeText(_czEl('cz-ok-link').value);toastOk('Enlace copiado.')">Copiar enlace</button>
      ${wa ? `<a class="cz-btn-wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(txt)}">Enviar por WhatsApp</a>` : ''}
      <button type="button" class="cz-btn-l" onclick="cotzAbrirHoja('${escJs(c._key)}')">Ver hoja</button>
      <button type="button" class="cz-btn-l" onclick="cotzAbrirHoja('${escJs(c._key)}','pdf')">PDF</button>
      <button type="button" class="cz-btn-l" onclick="cotzAbrirHoja('${escJs(c._key)}','img')">Imagen</button>
      <button type="button" class="cz-btn-l" onclick="cotzNueva()">Nueva</button>
    </div>
  </div>`;
  _czEl('cz-ok').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cotzAbrirHoja(key, como) {
  const extra = como === 'pdf' || como === true ? '&pdf=1' : (como === 'img' ? '&img=1' : '');
  window.open(location.origin + location.pathname + '?cotizacion=' + encodeURIComponent(key) + '&interno=1' + extra, '_blank', 'noopener');
}

function cotzNueva() {
  const tipo = cz.tipo;
  cz = { ...cz, tipo, lote: null, pagos: [], sugeridos: [], registroKey: null, renovadaDe: null, guardada: null };
  const h = _czEl(cz.host); if (!h) return;
  const asCel = _czVal('cz-as-cel'), asCorreo = _czVal('cz-as-correo'), asSel = _czVal('cz-asesor');
  _czPintarForm(h);
  if (asSel && _czEl('cz-asesor')) { _czEl('cz-asesor').value = asSel; cotzAsesorCambio(true); }
  if (asCel) _czEl('cz-as-cel').value = asCel;
  if (asCorreo) _czEl('cz-as-correo').value = asCorreo;
  if (tipo === 'perfil') _czSugerir();
  _czPreview();
}

/* Precargar (desde Mis registros o al renovar una vencida) */
function cotzPrecargar(o) {
  _czIrAlCotizador();
  setTimeout(() => {
    cz.tipo = o.tipo === 'perfil' ? 'perfil' : 'terreno';
    cotzNueva();
    cz.registroKey = o.registroKey || null;
    cz.renovadaDe = o.renovadaDe || null;
    const set = (id, v) => { const e = _czEl(id); if (e && v !== undefined && v !== null && v !== '') e.value = v; };
    set('cz-cliente', o.cliente); set('cz-cel', o.celular); set('cz-correo', o.correo); set('cz-ciudad', o.ciudad);
    set('cz-prop', o.proposito); set('cz-fam', o.familia); set('cz-origen', o.origen); set('cz-campania', o.campaniaCodigo);
    if (o.asesorKey && _czEl('cz-asesor')) { _czEl('cz-asesor').value = o.asesorKey; cotzAsesorCambio(true); }
    if (cz.tipo === 'perfil') {
      const p = o.perfil || {};
      set('cz-p-presu', p.presupuesto); set('cz-p-supmin', p.supMin); set('cz-p-supmax', p.supMax);
      set('cz-p-modulo', p.modulo); set('cz-p-modal', p.modalidad); set('cz-p-notas', p.notas);
      _czEl(cz.host).querySelectorAll('.cz-p-cat,.cz-p-car').forEach(x => { x.checked = (p.categorias || []).concat(p.caracteristicas || []).includes(x.value); });
      cz.sugeridos = (o.sugeridos || []).map(s => _czLotes().find(l => _czNorm(_terrenoDeLote(l)) === _czNorm(s.terreno) && (l.estado || 'Disponible') === 'Disponible')).filter(Boolean).map(l => l._key);
      _czSugerir();
    } else if (o.terreno) {
      const l = _czLotes().find(x => _czNorm(_terrenoDeLote(x)) === _czNorm(o.terreno));
      if (l) {
        cotzElegirLote(l._key);
        if (o.modalidad) { _czEl('cz-modalidad').value = o.modalidad; _czRecalcular('modalidad'); }
        if (o.precioTotal != null && _czEl('cz-accion')) _czEl('cz-accion').value = o.conAccion === 'SI' ? 'SI' : 'NO';
        if (o.pctAporte) set('cz-aporte', o.pctAporte);
        if (o.nroCuotas && o.modalidad !== 'Contado') set('cz-ncuotas', o.nroCuotas);
        _czRecalcular('plan');
      } else { set('cz-buscar', o.terreno); cotzBuscar(); }
    }
    _czPreview();
    _czEl('cz-cliente')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
}
function _czIrAlCotizador() {
  if (_czModoAdmin()) {
    if (typeof switchAdminTab === 'function') { try { switchAdminTab('cotizaciones'); } catch (e) {} }
    cambiarModoCotizaciones('nueva');
  } else {
    if (typeof switchUserTab === 'function') switchUserTab('cotizaciones');
    cambiarSubTabCotizVendedor('simulador');
  }
  cotzMontar();
}
function cotzRenovar(key) {
  const c = (cotizacionesData || []).find(x => x._key === key); if (!c) return;
  cotzPrecargar({ ...c, renovadaDe: key });
}

/* Reemplazos de funciones anteriores que se llamaban desde otros lugares */
function abrirCotizacionDesdeRegistro(registroKey) {
  const r = (typeof misRegs !== 'undefined' ? misRegs : []).find(x => x._key === registroKey);
  if (!r) return;
  cotzPrecargar({ cliente: r.nombre, celular: r.telefono || r.celular || '', correo: r.correo || '', ciudad: r.ciudadProcedencia || '', origen: r.origen || '', terreno: r.terrenoInteres || '', registroKey });
}
function generarCotizacionDesdeSimulador() { cambiarSubTabCotizVendedor('simulador'); }


/* ════════════════════════════════════════════════════════════════════════
   COTIZADOR v2 · Seguimiento: vistas del cliente, conversión, por asesor
   ════════════════════════════════════════════════════════════════════════ */
const CZ_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _czHace(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`;
}
function _czEstado(c) { return c.estado === 'anulada' ? 'anulada' : _estadoRealCotizacion(c); }

/* Una cotización se considera convertida si el registro de venta que la originó, o un registro
   de ese mismo terreno cargado desde 30 días antes de cotizar, terminó en Reserva. */
function cotzConvertida(c) {
  const regs = _czModoAdmin() ? (typeof todosRegs !== 'undefined' ? todosRegs : []) : (typeof misRegs !== 'undefined' ? misRegs : []);
  if (c.registroKey) { const r = regs.find(x => x._key === c.registroKey); if (r && _esCierreVenta(r)) return true; }
  const ts = (c.tipo === 'perfil' ? (c.sugeridos || []).map(x => x.terreno) : [c.terreno]).map(_czNorm).filter(Boolean);
  if (!ts.length) return false;
  const desde = (c.ts || 0) - 30 * 86400000;
  return regs.some(r => _esCierreVenta(r) && ts.includes(_czNorm(r.terrenoInteres)) &&
    (r.fecha ? new Date(r.fecha + 'T12:00:00').getTime() >= desde : (r.ts || 0) >= desde));
}

/* Período: "todo", "m:AAAA-MM" o "g:AAAA" (gestión abril AAAA → marzo AAAA+1) */
function _czEnPeriodo(c, per) {
  if (!per || per === 'todo') return true;
  const d = new Date(c.ts || 0);
  if (per.startsWith('m:')) return per.slice(2) === d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (per.startsWith('g:')) { const g = parseInt(per.slice(2)); const gi = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return gi === g; }
  return true;
}
function _czOpcionesPeriodo(datos, actual) {
  const meses = [...new Set(datos.map(c => { const d = new Date(c.ts || 0); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }))].sort().reverse();
  const hoy = new Date(), gAct = hoy.getMonth() >= 3 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  const gest = [...new Set(datos.map(c => { const d = new Date(c.ts || 0); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }).concat([gAct]))].sort().reverse();
  const op = [['todo', 'Todo el historial']]
    .concat(gest.map(g => ['g:' + g, `Gestión ${g}-${String(g + 1).slice(2)}`]))
    .concat(meses.map(m => ['m:' + m, CZ_MESES[parseInt(m.slice(5)) - 1] + ' ' + m.slice(0, 4)]));
  return op.map(([v, t]) => `<option value="${v}"${v === actual ? ' selected' : ''}>${t}</option>`).join('');
}

function _czTerrenoCelda(c) {
  if (c.tipo !== 'perfil') return esc(c.terreno || '—');
  const n = (c.sugeridos || []).length;
  return `<span class="czl-perfil">Perfil</span>${n ? ' ' + c.sugeridos.map(s => esc(s.terreno)).join(', ') : ''}`;
}
function _czPrecioCelda(c, conDto) {
  if (c.tipo === 'perfil') return c.perfil?.presupuesto ? `<span class="czl-dto" style="margin:0">hasta</span> $${Math.round(c.perfil.presupuesto).toLocaleString('es-BO')}` : '—';
  return `$${Math.round(c.precioTotal || c.precioFinal || 0).toLocaleString('es-BO')}` + (c.precioTotal != null && c.conAccion === 'SI' ? '<span class="czl-dto" style="color:inherit" title="Incluye la acción del Country Club">+acción</span>' : '') + (conDto && c.descuentoPct ? `<span class="czl-dto" title="Precio de lista $${Math.round(c.precioLista || 0).toLocaleString('es-BO')}">−${c.descuentoPct}%</span>` : '');
}
function _czPor(c) { return c.creadoPorNombre && c.creadoPorNombre !== c.asesorNombre && c.creadoPorRol && c.creadoPorRol !== 'ventas' ? `<span class="czl-por">por ${esc(c.creadoPorNombre)}</span>` : ''; }
function _czVisitaDe(c) {
  const k = c.visitaKey || c.visita?.key; if (!k) return null;
  return (typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : []).find(v => v._key === k) || null;
}
function _czAtencionBadge(c) {
  const v = _czVisitaDe(c); if (!v) return '';
  const t = { pendiente: ['Asesor: por atender', 'pendiente'], en_proceso: ['Asesor: atendiendo', 'confirmado'], completada: ['Asesor: atendido', 'conv'] }[v.estado];
  return t ? ` <span class="czl-b czl-b-${t[1]}">${t[0]}</span>` : '';
}
function _czVistaCelda(c) {
  const n = c.vistas || 0;
  return n ? `<span class="czl-vista on" title="Primera vez: ${new Date(c.primeraVista).toLocaleString('es-BO')}">${n} ${n === 1 ? 'vez' : 'veces'} · ${_czHace(c.ultimaVista)}</span>`
           : '<span class="czl-vista">No la abrió</span>';
}
function _czBadge(est) {
  const t = { pendiente: 'Pendiente', confirmado: 'Confirmada', vencido: 'Vencida', anulada: 'Anulada' }[est] || est;
  return `<span class="czl-b czl-b-${est}">${t}</span>`;
}
function _czAccionesFila(c, est, admin) {
  const link = location.origin + location.pathname + '?cotizacion=' + c._key;
  const wa = _czCelularWa(c.celular);
  const txt = c.tipo === 'perfil' ? `Hola ${String(c.cliente || '').split(/\s+/)[0]}, te comparto la propuesta de terrenos que preparamos para vos en Urubó Village: ${link}`
    : `Hola ${String(c.cliente || '').split(/\s+/)[0]}, te comparto la cotización de tu terreno ${c.terreno} en Urubó Village: ${link}`;
  return `<div class="czl-acc">
    ${est === 'vencido' || est === 'anulada' ? `<button type="button" onclick="cotzRenovar('${escJs(c._key)}')">Renovar</button>` : ''}
    ${wa ? `<a class="wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(txt)}">WhatsApp</a>` : ''}
    <details class="czl-menu"><summary>Más</summary><div onclick="this.parentElement.open=false">
      <button type="button" onclick="navigator.clipboard?.writeText('${escJs(link)}');toastOk('Enlace copiado.')">Copiar enlace</button>
      <button type="button" onclick="cotzAbrirHoja('${escJs(c._key)}')">Ver hoja</button>
      <button type="button" onclick="cotzAbrirHoja('${escJs(c._key)}','pdf')">Descargar PDF</button>
      <button type="button" onclick="cotzAbrirHoja('${escJs(c._key)}','img')">Guardar imagen</button>
      ${admin && est === 'pendiente' ? `<button type="button" class="ok" onclick="confirmarCotizacionDesdeAdmin('${escJs(c._key)}')">Confirmar</button>` : ''}
      ${admin ? `<button type="button" class="no" onclick="eliminarCotizacion('${escJs(c._key)}')">Eliminar</button>` : ''}
    </div></details>
  </div>`;
}

/* ── Admin · Guardadas ── */
function renderCotizacionesGuardadas() {
  const tbody = document.getElementById('cotiz-guardadas-tbody'); if (!tbody) return;
  const todos = typeof cotizacionesData !== 'undefined' ? cotizacionesData : [];
  const selP = document.getElementById('cotiz-fil-periodo'), selA = document.getElementById('cotiz-fil-asesor'), selE = document.getElementById('cotiz-fil-estado');
  const hoy = new Date();
  const per = selP?.value || ('g:' + (hoy.getMonth() >= 3 ? hoy.getFullYear() : hoy.getFullYear() - 1));
  if (selP) selP.innerHTML = _czOpcionesPeriodo(todos, per);
  const asesoresC = [...new Set(todos.map(c => c.asesorNombre || 'Equipo Comercial'))].sort();
  const aSel = selA?.value || '';
  if (selA) selA.innerHTML = '<option value="">Todos los asesores</option>' + asesoresC.map(a => `<option${a === aSel ? ' selected' : ''}>${esc(a)}</option>`).join('');
  const eSel = selE?.value || '';
  const term = _czNorm(document.getElementById('cotiz-buscar-guardadas')?.value);

  // Período y asesor filtran TODO el panel (KPIs, tabla y resumen por asesor)
  const base = todos.filter(c => _czEnPeriodo(c, per) && (!aSel || (c.asesorNombre || 'Equipo Comercial') === aSel));
  const enr = base.map(c => ({ c, est: _czEstado(c), conv: cotzConvertida(c) }));
  const k = { n: enr.length, vistas: enr.filter(x => x.c.vistas > 0).length,
    pend: enr.filter(x => x.est === 'pendiente').length, conf: enr.filter(x => x.est === 'confirmado').length,
    venc: enr.filter(x => x.est === 'vencido').length, conv: enr.filter(x => x.conv).length };
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
  setText('cotiz-kpi-total', k.n);
  setText('cotiz-kpi-vistas', k.vistas + ' · ' + pct(k.vistas, k.n));
  setText('cotiz-kpi-pendientes', k.pend);
  setText('cotiz-kpi-confirmadas', k.conf);
  setText('cotiz-kpi-vencidas', k.venc);
  setText('cotiz-kpi-convertidas', k.conv + ' · ' + pct(k.conv, k.n));

  let filas = enr;
  if (eSel === 'convertida') filas = filas.filter(x => x.conv);
  else if (eSel === 'sin-abrir') filas = filas.filter(x => !(x.c.vistas > 0) && x.est === 'pendiente');
  else if (eSel) filas = filas.filter(x => x.est === eSel);
  if (term) filas = filas.filter(x => [x.c.cliente, x.c.terreno, x.c.codigo, x.c.asesorNombre, x.c.creadoPorNombre, ...(x.c.sugeridos || []).map(s => s.terreno)].some(v => _czNorm(v).includes(term)));

  tbody.innerHTML = filas.length ? filas.map(({ c, est, conv }) => `<tr>
    <td class="czl-cod">${new Date(c.ts).toLocaleDateString('es-BO')}<span class="czl-por">${esc(cotzCodigoDe(c))}</span></td>
    <td>${esc(c.cliente || '—')}</td>
    <td class="czl-cod">${_czTerrenoCelda(c)}</td>
    <td>${esc(c.asesorNombre || 'Equipo Comercial')}${_czPor(c)}</td>
    <td class="czl-num">${_czPrecioCelda(c, true)}</td>
    <td>${_czVistaCelda(c)}</td>
    <td>${_czBadge(est)}${conv ? ' <span class="czl-b czl-b-conv">Reserva</span>' : ''}${_czAtencionBadge(c)}</td>
    <td>${_czAccionesFila(c, est, true)}</td>
  </tr>`).join('') : '<tr><td colspan="8"><div class="empty-state">Sin cotizaciones para este filtro.</div></td></tr>';

  // Resumen por asesor
  const tb2 = document.getElementById('cotiz-por-asesor-tbody');
  if (tb2) {
    const g = {};
    enr.forEach(x => { const a = x.c.asesorNombre || 'Equipo Comercial'; (g[a] = g[a] || { n: 0, v: 0, c: 0, conf: 0, monto: 0 }); g[a].n++; if (x.c.vistas > 0) g[a].v++; if (x.conv) g[a].c++; if (x.est === 'confirmado') g[a].conf++; g[a].monto += x.c.precioFinal || 0; });
    const rows = Object.entries(g).sort((a, b) => b[1].n - a[1].n);
    tb2.innerHTML = rows.length ? rows.map(([a, s]) => `<tr><td>${esc(a)}</td><td class="czl-num">${s.n}</td><td class="czl-num">${s.v} · ${pct(s.v, s.n)}</td><td class="czl-num">${s.conf}</td><td class="czl-num">${s.c} · ${pct(s.c, s.n)}</td><td class="czl-num">$${Math.round(s.monto).toLocaleString('es-BO')}</td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty-state">Sin datos.</div></td></tr>';
  }
}

/* ── Asesor / Call center · Mis cotizaciones ── */
function renderMisCotizacionesVendedor() {
  const tbody = document.getElementById('mis-cotiz-tbody'); if (!tbody) return;
  const yo = typeof asesorActual !== 'undefined' ? asesorActual : null; if (!yo) return;
  const soloCC = _czRolCreador() === 'callcenter';
  const propias = (typeof cotizacionesData !== 'undefined' ? cotizacionesData : []).filter(c =>
    (c.asesorKey ? c.asesorKey === yo._key : c.asesorNombre === yo.nombre) || c.creadoPorKey === yo._key);
  const enr = propias.map(c => ({ c, est: _czEstado(c), conv: cotzConvertida(c), mia: c.creadoPorKey === yo._key && c.asesorKey !== yo._key }));
  setText('mis-cotiz-kpi-total', enr.length);
  setText('mis-cotiz-kpi-vistas', enr.filter(x => x.c.vistas > 0).length);
  setText('mis-cotiz-kpi-vigentes', enr.filter(x => x.est === 'pendiente' || x.est === 'confirmado').length);
  const kConv = document.getElementById('mis-cotiz-kpi-convertidas');
  if (kConv && kConv.previousElementSibling) kConv.previousElementSibling.textContent = soloCC ? 'Atendidas por el asesor' : 'Convertidas en reserva';
  setText('mis-cotiz-kpi-convertidas', soloCC ? enr.filter(x => _czVisitaDe(x.c)?.estado === 'completada').length : enr.filter(x => x.conv).length);
  tbody.innerHTML = enr.length ? enr.map(({ c, est, conv, mia }) => `<tr>
    <td class="czl-cod">${new Date(c.ts).toLocaleDateString('es-BO')}<span class="czl-por">${esc(cotzCodigoDe(c))}</span></td>
    <td>${esc(c.cliente || '—')}${mia ? `<span class="czl-por">para ${esc(c.asesorNombre || '')}</span>` : (c.asignada && c.creadoPorNombre ? `<span class="czl-por">de ${esc(c.creadoPorNombre)}</span>` : '')}</td>
    <td class="czl-cod">${_czTerrenoCelda(c)}</td>
    <td class="czl-num">${_czPrecioCelda(c, false)}</td>
    <td>${_czVistaCelda(c)}</td>
    <td>${_czBadge(est)}${conv ? ' <span class="czl-b czl-b-conv">Reserva</span>' : ''}${mia ? _czAtencionBadge(c) : ''}</td>
    <td>${_czAccionesFila(c, est, false)}</td>
  </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Todavía no hay cotizaciones.</div></td></tr>';
}

/* Al entrar a Cotizaciones se monta el cotizador; los selects se refrescan cada vez. */
(function () {
  ['switchAdminTab', 'switchUserTab'].forEach(n => {
    const f = window[n]; if (typeof f !== 'function') return;
    window[n] = function (id, ...r) { const out = f.call(this, id, ...r); if (id === 'cotizaciones') setTimeout(cotzMontar, 0); return out; };
  });
})();

document.addEventListener('click', e => document.querySelectorAll('.czl-menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
