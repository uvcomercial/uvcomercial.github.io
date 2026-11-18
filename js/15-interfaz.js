/* ═══════════════════════════════════════════════════════════════════════
   INTERFAZ v2 — TEMA TIERRA (comportamiento)
   - Menú lateral: tocar un grupo abierto lo cierra; modo compacto de íconos.
   - Buscador global (Ctrl+K): módulos y secciones de todo el sistema.
   - Íconos de línea en el menú; sin emojis en títulos, etiquetas y botones.
   - Gráficos (Chart.js y ApexCharts) con la paleta del Informe Directorio.
   - Botón ⛶ en TODOS los gráficos y tablas largas, y siempre funciona:
     si no hay datos lo dice; si hay, muestra vista ampliada, estadísticas y DATOS.
   - KPIs: el detalle (letra chica) pasa a un tooltip.
═══════════════════════════════════════════════════════════════════════ */
const UV_PALETA = ['#5F6F7E','#C2A15F','#7C8B6A','#8C6F5A','#8FA3A0','#B0604C','#7D6B85','#B9B2A3'];
const _uvLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

/* ── 1. Menú lateral ─────────────────────────────────────────────────── */
function navAbrirGrupo(grupo, forzar) {
  const head = document.querySelector(`.nav-acc-head[onclick="navAbrirGrupo('${grupo}')"]`);
  const body = document.querySelector(`.nav-acc-body[data-grupo="${grupo}"]`);
  const abierto = body?.classList.contains('active');
  document.querySelectorAll('.nav-acc-head').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-acc-body').forEach(b => b.classList.remove('active'));
  if (abierto && !forzar) return;            // segundo toque: se cierra
  head?.classList.add('active');
  body?.classList.add('active');
}

const UV_ICONOS = {
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  directorio:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/><path d="M7 12l3-3 3 2 4-4"/>',
  dashboard:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  contratos:'<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>',
  'marketing-admin':'<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>',
  tabla:'<path d="M3 6h18M3 12h18M3 18h18"/><path d="M8 6v12"/>',
  'materia-reserva':'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 12h6M10 16h6"/><path d="M4 7v14h3"/>',
  cotizaciones:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8"/><path d="M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  cartera:'<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4v4"/><path d="M16 13.5h2"/>',
  expensas:'<path d="M4 21V8l6-4 6 4v13"/><path d="M16 11h4v10"/><path d="M8 11h4M8 15h4"/><path d="M2 21h20"/>',
  cobranza:'<path d="M12 3v18"/><path d="M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6"/>',
  inventario:'<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  panelcontrol:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  eliminaciones:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  'cambios-categoria':'<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/>',
  asesores:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6"/><path d="M18 14c2 .7 3 2.8 3 6"/>',
  config:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  buscar:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  seccion:'<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
};
const _uvSvg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${UV_ICONOS[k] || UV_ICONOS.seccion}</svg>`;

function _uvIconosMenu() {
  document.querySelectorAll('.nav-item[id^="nav-"]').forEach(it => {
    const id = it.id.replace(/^nav-/, '');
    const ic = it.querySelector('.nav-icon');
    if (ic && !ic.dataset.uv) { ic.innerHTML = _uvSvg(id); ic.dataset.uv = '1'; }
    if (!it.title) it.title = (it.textContent || '').replace(/[\s\d]+$/, '').replace(/\s+/g,' ').trim();
  });
}

function uvToggleRail() {
  const on = !document.body.classList.contains('uv-rail');
  document.body.classList.add('uv-anim'); setTimeout(() => document.body.classList.remove('uv-anim'), 400);
  document.body.classList.toggle('uv-rail', on);
  _uvLS('uv-rail', on ? '1' : '0');
  const b = document.getElementById('uv-rail-btn'); if (b) b.textContent = on ? '›' : '‹';
  setTimeout(() => window.dispatchEvent(new Event('resize')), 280);   // los gráficos se redimensionan
}

/* ── 2. Sin emojis en títulos, etiquetas y botones ───────────────────── */
const UV_EMOJI_INICIO = /^[\s ]*(?:[0-9#*]\uFE0F?\u20E3[\s\u00a0]*|[\p{Extended_Pictographic}\p{Regional_Indicator}←-⇿☀-➿⬀-⯿️‍⃣]+[\s ]*)+/u;
const UV_EMOJI_FIN = /(?:[\s\u00a0]*[\p{Extended_Pictographic}\uFE0F\u200D]+)+[\s\u00a0]*$/u;
const UV_NO_LIMPIAR = '.bi-expand-btn,.dir-exp,.uv-exp,.cob-ab,.mkp-nav,.num-btn,.slide-close,.bi-modal-close,.toast-close,.su-exit,.btn-del,.btn-remove-vendor,.topbar-hamburger,script,style,textarea,option,select,input,.kpi-icon,.av,.su-av,.tu-av,.sb-logo,.dot,.estado-config-icono,.reg-comentario,.gestion-nota,.seg-texto,.cob-mini,[contenteditable],[data-uv-no-clean]';
function _uvLimpiarTexto(n) {
  const v = n.nodeValue; if (!v || !/[\p{Extended_Pictographic}\u2190-\u21FF\u2600-\u27BF]/u.test(v)) return;
  const p = n.parentElement; if (!p || p.closest(UV_NO_LIMPIAR)) return;
  let nuevo = v.replace(UV_EMOJI_INICIO, m => (/^\s/.test(m) ? ' ' : '')).replace(UV_EMOJI_FIN, m => (/\s$/.test(m) ? ' ' : ''));
  if (nuevo === v) return;
  if (/[\p{L}\p{N}$%]/u.test(nuevo)) { n.nodeValue = nuevo; return; }
  // texto que es SOLO un emoji (ej. <span>💰</span> delante de un título): se quita si al lado hay texto
  const vecino = (p.textContent || '').replace(v, '');
  if (p.childNodes.length === 1 && p.children.length === 0 && /[\p{L}]/u.test(p.parentElement?.textContent || '') && !/[\p{L}]/u.test(vecino) && p.tagName !== 'BUTTON' && !p.matches('td,th,div[class*="icon"]')) { if (p.closest('h1,h2,h3,h4,h5,label,summary,.kpi-label')) n.nodeValue = ''; }
  else if (/[\p{L}]/u.test(vecino)) n.nodeValue = '';
}
function _uvLimpiar(root) {
  if (!root) return;
  if (root.nodeType === 3) { _uvLimpiarTexto(root); return; }
  if (root.nodeType !== 1 || root.closest?.('script,style')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let n; const lista = []; while ((n = w.nextNode())) lista.push(n);
  lista.forEach(_uvLimpiarTexto);
}
let _uvMOpend = new Set(), _uvMOtimer = null, _uvExpTimer = null;
const _uvMO = new MutationObserver(muts => {
  muts.forEach(m => {
    if (m.type === 'characterData') { _uvMOpend.add(m.target); return; }
    m.addedNodes.forEach(nd => _uvMOpend.add(nd));
  });
  if (!_uvMOtimer) _uvMOtimer = requestAnimationFrame(() => {
    _uvMOtimer = null;
    const lote = [..._uvMOpend]; _uvMOpend.clear();
    lote.forEach(el => { if (el.isConnected) _uvLimpiar(el); });
    clearTimeout(_uvExpTimer); _uvExpTimer = setTimeout(() => _uvAgregarExpandir(document.querySelector('.tab-panel.active')), 700);
  });
});

/* ── 3. Gráficos con la paleta tierra ────────────────────────────────── */
const _uvColorCache = {};
function _uvParse(c) {
  let m = c.match(/^#([0-9a-f]{3,8})$/i);
  if (m) { let h = m[1]; if (h.length <= 4) h = h.split('').map(x => x + x).join(''); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), h.length === 8 ? parseInt(h.slice(6,8),16)/255 : 1]; }
  m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4])/100 : +m[4])];
  return null;
}
function uvColorTierra(c) {
  if (typeof c !== 'string') return c;
  if (_uvColorCache[c] !== undefined) return _uvColorCache[c];
  const p = _uvParse(c.trim()); if (!p) return (_uvColorCache[c] = c);
  const [r, g, b, a] = p; const R = r/255, G = g/255, B = b/255;
  const max = Math.max(R,G,B), min = Math.min(R,G,B), l = (max+min)/2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2*l - 1));
  if (s < 0.2 || l > 0.94 || l < 0.08) return (_uvColorCache[c] = c);      // grises, blancos y negros quedan
  let h = d === 0 ? 0 : max === R ? 60*(((G-B)/d)%6) : max === G ? 60*((B-R)/d + 2) : 60*((R-G)/d + 4); if (h < 0) h += 360;
  const base = h < 18 || h >= 340 ? '#B0604C' : h < 40 ? '#B97A45' : h < 68 ? '#C2A15F' : h < 165 ? '#7C8B6A' : h < 200 ? '#8FA3A0' : h < 255 ? '#5F6F7E' : h < 300 ? '#7D6B85' : '#A98B8B';
  const q = _uvParse(base);
  return (_uvColorCache[c] = a >= 1 ? base : `rgba(${q[0]},${q[1]},${q[2]},${a})`);
}
function _uvTemaGraficos() {
  if (window.Chart && !Chart.__uv) {
    Chart.__uv = true;
    const d = Chart.defaults;
    d.font.family = "'Montserrat','Helvetica Neue',Arial,sans-serif"; d.font.size = 11; d.color = '#6B6355';
    d.borderColor = 'rgba(60,48,28,.08)';
    d.plugins.legend.labels.usePointStyle = true; d.plugins.legend.labels.boxWidth = 8; d.plugins.legend.labels.boxHeight = 8; d.plugins.legend.labels.color = '#3F392F';
    Object.assign(d.plugins.tooltip, { backgroundColor:'#1C1A17', titleColor:'#F2EEE1', bodyColor:'#E9DFC6', borderColor:'#3D3932', borderWidth:1, padding:10, cornerRadius:4, displayColors:true, boxPadding:4,
      titleFont:{ family:"'Montserrat',sans-serif", weight:'600', size:12 }, bodyFont:{ family:"'Montserrat',sans-serif", size:11.5 } });
    d.elements.bar.borderRadius = 2; d.elements.line.borderWidth = 2; d.elements.point.radius = 2.5; d.elements.point.hoverRadius = 5; d.elements.arc.borderWidth = 1.5;
    const CLAVES = ['backgroundColor','borderColor','pointBackgroundColor','pointBorderColor','hoverBackgroundColor','hoverBorderColor'];
    Chart.register({ id:'uvTierra', beforeUpdate(chart) {
      if (chart.canvas?.closest?.('.dir-wrap')) return;   // el Informe Directorio ya tiene su paleta
      (chart.data?.datasets || []).forEach(ds => CLAVES.forEach(k => {
        if (Array.isArray(ds[k])) ds[k] = ds[k].map(uvColorTierra); else if (typeof ds[k] === 'string') ds[k] = uvColorTierra(ds[k]);
      }));
      const sc = chart.options?.scales || {};
      Object.values(sc).forEach(s => { if (s?.ticks && /^#0A0A0A$|^#0a0a0a$/.test(s.ticks.color || '')) s.ticks.color = '#6B6355'; if (s?.grid && /10,10,10/.test(String(s.grid.color || ''))) s.grid.color = 'rgba(60,48,28,.08)'; });
      const lg = chart.options?.plugins?.legend?.labels; if (lg && /^#0A0A0A$/i.test(lg.color || '')) lg.color = '#3F392F';
    }});
  }
  if (window.ApexCharts && !window.ApexCharts.__uv) {
    const Orig = window.ApexCharts;
    const mapear = o => {
      if (!o || typeof o !== 'object') return o;
      if (Array.isArray(o.colors)) o.colors = o.colors.map(uvColorTierra);
      if (o.fill && Array.isArray(o.fill.colors)) o.fill.colors = o.fill.colors.map(uvColorTierra);
      if (o.stroke && Array.isArray(o.stroke.colors)) o.stroke.colors = o.stroke.colors.map(uvColorTierra);
      o.chart = Object.assign({ fontFamily:"'Montserrat',sans-serif" }, o.chart || {}, { fontFamily:"'Montserrat',sans-serif" });
      return o;
    };
    const Nuevo = function(el, opts) { return new Orig(el, mapear(opts)); };
    Object.setPrototypeOf(Nuevo, Orig); Nuevo.prototype = Orig.prototype; Nuevo.__uv = true;
    window.ApexCharts = Nuevo;
  }
}

/* ── 4. Ampliar: siempre funciona y muestra los datos ────────────────── */
function _uvVacio(titulo, motivo) {
  uvVisorAbrir(titulo, 'Sin datos', `<div class="uv-vacio"><b>Todavía no hay datos para mostrar</b><span>${motivo || 'Con el período y los filtros elegidos este gráfico está vacío. Cambiá el período o los filtros, o esperá a que termine de sincronizar con Orange.'}</span></div>`, null);
}
function _uvEnvolverAmpliar() {
  if (typeof abrirModalGraficoJS === 'function' && !abrirModalGraficoJS.__uv) {
    const orig = abrirModalGraficoJS;
    abrirModalGraficoJS = function(canvasId, titulo, sub, tipo) {
      const ch = window.Chart ? Chart.getChart(canvasId) : null;
      const vacio = !ch || !(ch.data?.datasets || []).some(ds => (ds.data || []).some(v => (typeof v === 'number' ? v : (v && (v.y ?? v.x ?? v.r)) ) ));
      if (vacio) return _uvVacio(titulo);
      return orig.apply(this, arguments);
    };
    abrirModalGraficoJS.__uv = true;
  }
  if (typeof abrirHudModal === 'function' && !abrirHudModal.__uv) {
    const orig = abrirHudModal;
    abrirHudModal = function(id) { if (!window._hudData) return _uvVacio((typeof HUD_CHART_META !== 'undefined' && HUD_CHART_META[id]?.titulo) || 'Gráfico', 'El tablero de cobranza todavía no tiene datos de Orange. Tocá "Actualizar" en el panel y volvé a intentar.'); return orig.apply(this, arguments); };
    abrirHudModal.__uv = true;
  }
  if (typeof cambiarCjsTab === 'function' && !cambiarCjsTab.__uv) {
    const orig = cambiarCjsTab;
    cambiarCjsTab = function(tab) {
      const dat = document.getElementById('cjs-modal-datos');
      if (tab === 'datos') {
        document.querySelectorAll('#cjs-modal .bi-mtab').forEach(b => b.classList.toggle('active', b.dataset.mtab === 'datos'));
        document.getElementById('cjs-modal-vista').style.display = 'none';
        document.getElementById('cjs-modal-stats').style.display = 'none';
        if (dat) { dat.style.display = ''; dat.innerHTML = _uvTablaDeGrafico(Chart.getChart(_cjsModalOrigenId)); }
        return;
      }
      if (dat) dat.style.display = 'none';
      return orig.apply(this, arguments);
    };
    cambiarCjsTab.__uv = true;
  }
}
function _uvFmtNum(v) { return typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('es-BO') : (Math.round(v*100)/100).toLocaleString('es-BO')) : (v ?? ''); }
function _uvTablaDeGrafico(ch) {
  if (!ch) return '<div class="uv-vacio"><b>Sin datos</b></div>';
  const dss = ch.data.datasets || [];
  const labels = ch.data.labels || [];
  let filas = [];
  if (!labels.length && dss.some(ds => (ds.data||[]).some(p => p && typeof p === 'object'))) {
    dss.forEach(ds => (ds.data||[]).forEach(p => filas.push([ds.label || '', _uvFmtNum(p?.x), _uvFmtNum(p?.y)])));
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="btn-secondary btn-sm" onclick="uvExportarTabla(this.closest('div').nextElementSibling,'datos_grafico')">Exportar a Excel</button></div><table><thead><tr><th>Serie</th><th class="r">X</th><th class="r">Y</th></tr></thead><tbody>${filas.map(f => `<tr><td>${esc(f[0])}</td><td class="r">${f[1]}</td><td class="r">${f[2]}</td></tr>`).join('')}</tbody></table>`;
  }
  const num = v => typeof v === 'number' ? v : (v && typeof v === 'object' ? (v.y ?? 0) : (parseFloat(v) || 0));
  const tot = dss.map(ds => (ds.data||[]).reduce((s,v) => s + num(v), 0));
  const unaSerie = dss.length === 1;
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="btn-secondary btn-sm" onclick="uvExportarTabla(this.closest('div').nextElementSibling,'datos_grafico')">Exportar a Excel</button></div>
    <table><thead><tr><th>Período / categoría</th>${dss.map(ds => `<th class="r">${esc(ds.label || 'Valor')}</th>`).join('')}${unaSerie ? '<th class="r">% del total</th>' : ''}</tr></thead>
    <tbody>${labels.map((l, i) => `<tr><td>${esc(Array.isArray(l) ? l.join(' ') : l)}</td>${dss.map(ds => `<td class="r">${_uvFmtNum(num((ds.data||[])[i]))}</td>`).join('')}${unaSerie ? `<td class="r">${tot[0] ? Math.round(num(dss[0].data[i])*1000/tot[0])/10 + '%' : '—'}</td>` : ''}</tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td>${tot.map(t => `<td class="r"><b>${_uvFmtNum(t)}</b></td>`).join('')}${unaSerie ? '<td class="r"><b>100%</b></td>' : ''}</tr></tfoot></table>`;
}

/* Agrega ⛶ a todo gráfico que no lo tenga y una barra a las tablas largas */
function _uvTituloDe(el) {
  const card = el.closest('.chart-card,.vcd-card,.admin-section,.home-section,.dir-card,.bi-card,.cob-card,.form-section') || el.parentElement;
  const h = card?.querySelector('h3,h4,h5,.kpi-label');
  return (h?.textContent || 'Detalle').trim();
}
function _uvAgregarExpandir(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('canvas').forEach(cv => {
    if (cv.dataset.uvExp || cv.closest('.bi-modal,.uv-viewer,#cjs-modal,.login-card')) return;
    cv.dataset.uvExp = '1';
    const cont = cv.parentElement; if (!cont) return;
    if (cont.querySelector(':scope > .bi-expand-btn, :scope > .dir-exp, :scope > .uv-exp') || cont.querySelector('[onclick*="abrirModalGraficoJS"]')) return;
    if (cv.id && document.querySelector(`[onclick*="'${cv.id}'"]`)) return;
    if (!cv.id) cv.id = 'uvcv-' + Math.random().toString(36).slice(2, 9);
    if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
    const b = document.createElement('button');
    b.className = 'uv-exp'; b.type = 'button'; b.title = 'Ampliar y ver los datos';
    b.addEventListener('click', e => { e.stopPropagation(); abrirModalGraficoJS(cv.id, _uvTituloDe(cv), '', 'tendencia'); });
    cont.appendChild(b);
  });
  root.querySelectorAll('.tabla-wrap, .cob-tabla-wrap, .vcd-table-wrap').forEach(tw => {
    const t = tw.querySelector('table'); if (!t) return;
    const n = t.tBodies[0]?.rows.length || 0;
    const largo = n > 8 || tw.scrollHeight > tw.clientHeight + 10 || tw.scrollWidth > tw.clientWidth + 10;
    let bar = tw.previousElementSibling?.classList?.contains('uv-tbl-bar') ? tw.previousElementSibling : null;
    if (!largo) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'uv-tbl-bar';
      bar.innerHTML = `<span class="uv-tbl-n"></span><button type="button">Ver completo</button><button type="button">Excel</button>`;
      const [b1, b2] = bar.querySelectorAll('button');
      b1.addEventListener('click', () => uvVerTabla(tw));
      b2.addEventListener('click', () => uvExportarTabla(t, _uvTituloDe(tw)));
      tw.parentElement.insertBefore(bar, tw);
    }
    bar.querySelector('.uv-tbl-n').textContent = n + ' filas';
  });
}

/* Visor de pantalla completa */
function _uvVisor() {
  let v = document.getElementById('uv-viewer');
  if (v) return v;
  v = document.createElement('div'); v.id = 'uv-viewer'; v.className = 'uv-viewer';
  v.innerHTML = `<div class="uv-viewer-bg" onclick="uvVisorCerrar()"></div><div class="uv-viewer-panel">
    <div class="uv-viewer-h"><div><small id="uv-v-eyebrow">Detalle</small><h2 id="uv-v-tit">—</h2></div>
      <div class="uv-viewer-tools"><input type="search" id="uv-v-q" placeholder="Buscar en la tabla" oninput="uvVisorFiltrar()"/><button id="uv-v-xls">Excel</button><button onclick="window.print()">Imprimir</button><button class="uv-x" onclick="uvVisorCerrar()">✕</button></div></div>
    <div class="uv-viewer-b" id="uv-v-body"></div></div>`;
  document.body.appendChild(v);
  return v;
}
function uvVisorAbrir(titulo, eyebrow, html, tablaParaExcel) {
  const v = _uvVisor();
  document.getElementById('uv-v-tit').textContent = titulo || 'Detalle';
  document.getElementById('uv-v-eyebrow').textContent = eyebrow || 'Detalle';
  document.getElementById('uv-v-body').innerHTML = html;
  const q = document.getElementById('uv-v-q'); q.value = ''; q.style.display = tablaParaExcel ? '' : 'none';
  const x = document.getElementById('uv-v-xls'); x.style.display = tablaParaExcel ? '' : 'none';
  x.onclick = () => uvExportarTabla(document.querySelector('#uv-v-body table'), titulo);
  v.classList.add('open');
  if (tablaParaExcel) setTimeout(() => q.focus(), 50);
}
function uvVisorCerrar() { document.getElementById('uv-viewer')?.classList.remove('open'); }
function uvVerTabla(tw) {
  const t = tw.querySelector('table'); if (!t) return;
  const c = t.cloneNode(true); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  uvVisorAbrir(_uvTituloDe(tw), 'Tabla completa', `<div class="uv-count" id="uv-v-count">${c.tBodies[0]?.rows.length || 0} filas</div>` + c.outerHTML, true);
}
function uvVisorFiltrar() {
  const q = (document.getElementById('uv-v-q').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const t = document.querySelector('#uv-v-body table'); if (!t) return;
  let n = 0;
  [...(t.tBodies[0]?.rows || [])].forEach(r => { const ok = !q || r.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q); r.style.display = ok ? '' : 'none'; if (ok) n++; });
  const c = document.getElementById('uv-v-count'); if (c) c.textContent = n + ' filas' + (q ? ' (filtradas)' : '');
}
function uvExportarTabla(t, nombre) {
  if (!t || typeof XLSX === 'undefined') { toastErr('No se pudo exportar.'); return; }
  const c = t.cloneNode(true);
  c.querySelectorAll('tr').forEach(r => { if (r.style.display === 'none') r.remove(); });
  c.querySelectorAll('select').forEach(s => { s.replaceWith(document.createTextNode(s.value)); });
  c.querySelectorAll('input').forEach(i => { i.replaceWith(document.createTextNode(i.value)); });
  c.querySelectorAll('button').forEach(b => b.remove());
  const wb = XLSX.utils.table_to_book(c, { raw:false });
  XLSX.writeFile(wb, String(nombre || 'tabla').replace(/[^\p{L}\p{N} _-]/gu,'').trim().replace(/\s+/g,'_').slice(0,60) + '.xlsx');
}

/* ── 5. KPIs: la letra chica pasa a tooltip ──────────────────────────── */
document.addEventListener('mouseover', e => {
  const c = e.target.closest?.('.kpi-card,.vcd-kpi,.cob-kpi,.gerencia-kpi'); if (!c) return;
  const s = c.querySelector('.kpi-sub,.vcd-kpi-sub,.cob-kpi-sub,.gs');
  const t = s ? s.textContent.trim() : '';
  if (t && c.title !== t) c.title = t;
});
function _uvMarcarKpis(root) {
  (root || document).querySelectorAll('.kpi-card').forEach(c => { const s = c.querySelector('.kpi-sub'); const t = s?.textContent.trim(); if (t && t !== '—' && !c.title) c.title = t; });
}

/* ── 6. Buscador global (Ctrl+K) ─────────────────────────────────────── */
let _uvCmdItems = [], _uvCmdSel = 0;
function _uvCmdDatos() {
  const items = [];
  const visible = el => el && getComputedStyle(el).display !== 'none';
  document.querySelectorAll('.nav-item[id^="nav-"]').forEach(it => {
    if (!visible(it)) return;
    const id = it.id.replace('nav-', '');
    const grupo = it.closest('.nav-acc-body')?.previousElementSibling?.textContent.replace(/[▾▸]/g,'').trim() || '';
    items.push({ t: it.title || it.textContent.replace(/[\s\d]+$/,'').trim(), g: grupo || 'Módulo', ic: id, go: () => switchAdminTab(id) });
  });
  document.querySelectorAll('.tab-panel[id^="panel-"]').forEach(p => {
    const id = p.id.replace('panel-', '');
    const nav = document.getElementById('nav-' + id); if (!nav || !visible(nav)) return;
    const mod = nav.title || nav.textContent.replace(/[\s\d]+$/,'').trim();
    p.querySelectorAll('h3, .vcd-card h4, .dir-card-h h3, .cob-acc-tit h3').forEach(h => {
      const t = h.textContent.replace(/\s+/g,' ').trim(); if (!t || t.length > 80) return;
      items.push({ t, g: mod, ic: 'seccion', go: () => { switchAdminTab(id); setTimeout(() => { const card = h.closest('.admin-section,.chart-card,.vcd-card,.dir-card,.cob-acc') || h; card.scrollIntoView({ behavior:'smooth', block:'start' }); card.classList.add('uv-flash'); setTimeout(() => card.classList.remove('uv-flash'), 1700); }, 120); } });
    });
  });
  items.push({ t: 'Cambiar tema claro / oscuro', g: 'Acción', ic: 'config', go: () => (typeof toggleTema === 'function' ? toggleTema() : document.querySelector('.theme-toggle')?.click()) });
  items.push({ t: 'Menú compacto (solo íconos)', g: 'Acción', ic: 'tabla', go: uvToggleRail });
  items.push({ t: 'Bloquear pantalla', g: 'Acción', ic: 'config', go: () => segBloquear() });
  items.push({ t: 'Cerrar sesión', g: 'Acción', ic: 'config', go: () => confirmarSalir() });
  return items;
}
function uvCmdAbrir() {
  let c = document.getElementById('uv-cmd');
  if (!c) {
    c = document.createElement('div'); c.id = 'uv-cmd'; c.className = 'uv-cmd';
    c.innerHTML = `<div class="uv-cmd-bg" onclick="uvCmdCerrar()"></div><div class="uv-cmd-box"><input type="text" id="uv-cmd-q" placeholder="Buscar módulo o sección… (ej. detalle de cobros, embudo, metas)" autocomplete="off"/><div class="uv-cmd-list" id="uv-cmd-list"></div><div class="uv-cmd-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span></div></div>`;
    document.body.appendChild(c);
    const q = c.querySelector('#uv-cmd-q');
    q.addEventListener('input', _uvCmdRender);
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); _uvCmdSel = Math.min(_uvCmdSel + 1, _uvCmdItems.length - 1); _uvCmdPintarSel(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); _uvCmdSel = Math.max(_uvCmdSel - 1, 0); _uvCmdPintarSel(); }
      if (e.key === 'Enter') { e.preventDefault(); _uvCmdIr(_uvCmdSel); }
      if (e.key === 'Escape') uvCmdCerrar();
    });
  }
  c.classList.add('open');
  c._todos = _uvCmdDatos();
  const q = document.getElementById('uv-cmd-q'); q.value = ''; _uvCmdRender(); setTimeout(() => q.focus(), 20);
}
function uvCmdCerrar() { document.getElementById('uv-cmd')?.classList.remove('open'); }
const _uvNorm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function _uvCmdRender() {
  const c = document.getElementById('uv-cmd'); const q = _uvNorm(document.getElementById('uv-cmd-q').value).trim();
  const palabras = q.split(/\s+/).filter(Boolean);
  _uvCmdItems = (c._todos || []).filter(it => { const h = _uvNorm(it.t + ' ' + it.g); return palabras.every(p => h.includes(p)); }).slice(0, 40);
  _uvCmdSel = 0;
  document.getElementById('uv-cmd-list').innerHTML = _uvCmdItems.length ? _uvCmdItems.map((it, i) => `<div class="uv-cmd-it" data-i="${i}" onmousemove="_uvCmdSel=${i};_uvCmdPintarSel()" onclick="_uvCmdIr(${i})"><span class="uv-cmd-ic">${_uvSvg(it.ic)}</span>${esc(it.t)}<small>${esc(it.g)}</small></div>`).join('') : '<div class="uv-cmd-it" style="color:var(--t-faint)">Sin resultados</div>';
  _uvCmdPintarSel();
}
function _uvCmdPintarSel() { document.querySelectorAll('#uv-cmd-list .uv-cmd-it').forEach((el, i) => el.classList.toggle('on', i === _uvCmdSel)); document.querySelector('#uv-cmd-list .uv-cmd-it.on')?.scrollIntoView({ block:'nearest' }); }
function _uvCmdIr(i) { const it = _uvCmdItems[i]; if (!it) return; uvCmdCerrar(); try { it.go(); } catch (e) { console.error(e); } }
document.addEventListener('keydown', e => {
  const enApp = document.getElementById('admin-panel')?.classList.contains('visible');
  if (!enApp) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); uvCmdAbrir(); }
  else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); uvCmdAbrir(); }
  else if (e.key === 'Escape') { uvVisorCerrar(); }
});

/* ── 7. Topbar con migas, buscador y modo compacto ───────────────────── */
const UV_GRUPO_NOMBRE = { resumen:'Resumen', directorio:'Directorio', comercial:'Comercial', finanzas:'Finanzas', operaciones:'Operaciones', sistema:'Sistema' };
function _uvTopbar() {
  const tb = document.querySelector('.topbar'); if (!tb || tb.dataset.uv) return;
  tb.dataset.uv = '1';
  const btn = document.createElement('button');
  btn.className = 'uv-cmd-btn'; btn.type = 'button';
  btn.innerHTML = `<span class="uv-cmd-ic" style="width:15px;height:15px;display:inline-flex">${_uvSvg('buscar').replace('<svg','<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8"')}</span><span>Buscar en el sistema</span><kbd>Ctrl K</kbd>`;
  btn.addEventListener('click', uvCmdAbrir);
  tb.insertBefore(btn, tb.querySelector('.topbar-user'));
  const sb = document.getElementById('sidebar') || document.querySelector('.sidebar');
  if (sb && !document.getElementById('uv-rail-btn')) {
    const r = document.createElement('button'); r.id = 'uv-rail-btn'; r.className = 'uv-rail-btn'; r.type = 'button'; r.title = 'Menú compacto'; r.textContent = '‹';
    r.addEventListener('click', uvToggleRail); sb.appendChild(r);
  }
  if (_uvLS('uv-rail') === '1') { document.body.classList.add('uv-rail'); const r = document.getElementById('uv-rail-btn'); if (r) r.textContent = '›'; }
}
function _uvMigas(id) {
  const t = document.getElementById('topbar-title'); if (!t) return;
  const g = UV_GRUPO_NOMBRE[(typeof NAV_GRUPOS !== 'undefined' && NAV_GRUPOS[id]) || ''];
  const titulo = (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[id]) || t.textContent;
  t.innerHTML = (g && g !== titulo ? `<span class="uv-crumb">${esc(g)}</span>` : '') + `<span>${esc(String(titulo).replace(UV_EMOJI_INICIO, ''))}</span>`;
}

/* ── 8. Login: buscador de usuario y saludo ──────────────────────────── */
function uvFiltrarUsuarios(q) {
  const n = _uvNorm(q).trim();
  document.querySelectorAll('#asesor-grid .asesor-btn').forEach(b => { b.style.display = !n || _uvNorm(b.textContent).includes(n) ? '' : 'none'; });
}
function _uvLogin() {
  const h = new Date().getHours();
  const el = document.getElementById('uv-hola'); if (el) el.textContent = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const f = document.getElementById('uv-la-fecha'); if (f) f.textContent = new Date().toLocaleDateString('es-BO', { weekday:'long', day:'numeric', month:'long' });
  const cnt = () => { const n = document.querySelectorAll('#asesor-grid .asesor-btn').length; const s = document.getElementById('uv-login-buscar'); if (s) s.style.display = n > 6 ? '' : 'none'; };
  cnt(); new MutationObserver(cnt).observe(document.getElementById('asesor-grid') || document.body, { childList:true });
}

/* ── Arranque ────────────────────────────────────────────────────────── */
(function uvIniciar() {
  const go = () => {
    // ARREGLO CLAVE del botón ⛶: los modales de "Análisis profundo" vivían DENTRO del panel de
    // Expensas. Abiertos desde Inicio, Ventas, Cartera, Marketing o Directorio quedaban dentro de
    // un panel oculto (display:none) → "no abría nada". Se mueven al <body> para que funcionen en todo el sistema.
    document.querySelectorAll('.tab-panel .bi-modal, .tab-panel #hud-modal, .tab-panel #cjs-modal').forEach(m => document.body.appendChild(m));
    _uvTemaGraficos();
    _uvEnvolverAmpliar();
    _uvIconosMenu();
    _uvTopbar();
    _uvLogin();
    _uvLimpiar(document.body);
    _uvMarcarKpis();
    _uvMO.observe(document.body, { childList:true, subtree:true, characterData:true });
    if (typeof switchAdminTab === 'function' && !switchAdminTab.__uv) {
      const orig = switchAdminTab;
      switchAdminTab = function(id) {
        const r = orig.apply(this, arguments);
        _uvMigas(id);
        setTimeout(() => { const p = document.getElementById('panel-' + id); _uvAgregarExpandir(p); _uvMarcarKpis(p); }, 400);
        setTimeout(() => _uvAgregarExpandir(document.getElementById('panel-' + id)), 1800);
        return r;
      };
      switchAdminTab.__uv = true;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

