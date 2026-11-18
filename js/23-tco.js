/* ════════════════════════════════════════════════════════════════════════
   TCO · TIPO DE CAMBIO OFICIAL DEL BANCO CENTRAL DE BOLIVIA
   tco.json lo actualiza una tarea automática de GitHub (.github/workflows/tco.yml)
   que lee la página del BCB varias veces al día y agrega cada día al histórico.
   - Referencia arriba a la derecha (con el histórico al tocarla).
   - Materia reservada: el TCO de la fecha de reserva se completa solo.
   ════════════════════════════════════════════════════════════════════════ */
const TCO = { datos: null, fechas: [], cargando: null };

function tcoCargar(forzar) {
  if (TCO.cargando && !forzar) return TCO.cargando;
  const d = new Date(), marca = d.getFullYear() + '' + (d.getMonth() + 1) + d.getDate() + '-' + d.getHours();
  TCO.cargando = fetch('tco.json?h=' + marca, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.dias) { TCO.datos = j; TCO.fechas = Object.keys(j.dias).sort(); tcoPintarInsignias(); _tcoMrRefrescar(); } return TCO.datos; })
    .catch(() => null);
  return TCO.cargando;
}

const _tcoISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _tcoN = v => Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _tcoF = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

/* TCO vigente en una fecha (AAAA-MM-DD). Devuelve { valor, fecha, fijo } o null si todavía no cargó. */
function tcoDe(fechaISO) {
  if (!TCO.datos) return null;
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO || '') ? fechaISO : _tcoISO(new Date());
  const fijo = TCO.datos.fijoAntes;
  if (fijo && f <= fijo.hasta) return { valor: fijo.valor, fecha: f, fijo: true };
  let lo = 0, hi = TCO.fechas.length - 1, mejor = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (TCO.fechas[mid] <= f) { mejor = mid; lo = mid + 1; } else hi = mid - 1; }
  if (mejor < 0) return fijo ? { valor: fijo.valor, fecha: f, fijo: true } : null;
  const k = TCO.fechas[mejor];
  return { valor: TCO.datos.dias[k], fecha: k, fijo: false, exacto: k === f };
}

/* ── Insignia arriba a la derecha (admin, asesor y usuario) ── */
function tcoPintarInsignias() {
  const lugares = [
    [document.querySelector('#admin-panel .topbar'), '.topbar-user'],
    [document.querySelector('#asesor-panel .panel-header-right'), null],
    [document.querySelector('#user-panel .panel-header-right'), null],
  ];
  const hoy = tcoDe(_tcoISO(new Date()));
  lugares.forEach(([cont, antesDe]) => {
    if (!cont) return;
    let b = cont.querySelector('.tco-badge');
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.className = 'tco-badge'; b.onclick = tcoAbrirHistorico;
      const ref = antesDe ? cont.querySelector(antesDe) : cont.firstElementChild;
      cont.insertBefore(b, ref || null);
    }
    if (!hoy) { b.innerHTML = '<span>TCO BCB</span><b>…</b>'; b.title = 'Cargando el tipo de cambio oficial'; return; }
    b.innerHTML = `<span>TCO BCB</span><b>Bs ${_tcoN(hoy.valor)}</b>`;
    b.title = `Tipo de cambio oficial del Banco Central de Bolivia · vigente ${_tcoF(hoy.fecha)}${hoy.exacto === false ? ' (último publicado)' : ''}. Tocá para ver el histórico.`;
  });
}

function tcoAbrirHistorico() {
  let m = document.getElementById('tco-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'tco-modal'; m.className = 'tco-modal';
    m.onclick = e => { if (e.target === m) m.classList.remove('open'); };
    document.body.appendChild(m);
  }
  const d = TCO.datos;
  if (!d) { m.innerHTML = '<div class="tco-box"><p>Cargando…</p></div>'; m.classList.add('open'); tcoCargar(true).then(() => tcoAbrirHistorico()); return; }
  const fechas = TCO.fechas.slice().reverse(), vals = fechas.map(f => d.dias[f]);
  const ult30 = TCO.fechas.slice(-60), v30 = ult30.map(f => d.dias[f]);
  const mn = Math.min(...v30), mx = Math.max(...v30), W = 520, H = 120, sp = (mx - mn) || 1;
  const pts = v30.map((v, i) => `${(6 + i * (W - 12) / Math.max(1, v30.length - 1)).toFixed(1)},${(H - 16 - (v - mn) / sp * (H - 34)).toFixed(1)}`).join(' ');
  // promedio por mes (referencia)
  const porMes = {}; TCO.fechas.forEach(f => { const k = f.slice(0, 7); (porMes[k] ||= []).push(d.dias[f]); });
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const meses = Object.entries(porMes).reverse().map(([k, l]) => `<tr><td>${MES[+k.slice(5) - 1]} ${k.slice(0, 4)}</td><td>${_tcoN(l.reduce((s, v) => s + v, 0) / l.length)}</td><td>${_tcoN(Math.min(...l))}</td><td>${_tcoN(Math.max(...l))}</td></tr>`).join('');
  m.innerHTML = `<div class="tco-box" role="dialog" aria-label="Histórico del TCO">
    <div class="tco-h"><div><b>Tipo de cambio oficial · BCB</b><span>Bs por US$ · se actualiza solo todos los días</span></div><button type="button" class="tco-x" aria-label="Cerrar" onclick="document.getElementById('tco-modal').classList.remove('open')">×</button></div>
    <svg viewBox="0 0 ${W} ${H}" class="tco-svg" role="img" aria-label="TCO de los últimos 60 días"><polyline points="${pts}" fill="none" stroke="#2F4A34" stroke-width="2.2"/><text x="6" y="12" font-size="11" fill="#5C5547">máx ${_tcoN(mx)}</text><text x="6" y="${H - 2}" font-size="11" fill="#5C5547">mín ${_tcoN(mn)} · últimos 60 días</text></svg>
    <div class="tco-cols">
      <div><div class="tco-sh">Por día</div><div class="tco-tw"><table><thead><tr><th>Fecha</th><th>TCO</th></tr></thead><tbody>${fechas.map((f, i) => `<tr><td>${_tcoF(f)}</td><td>${_tcoN(vals[i])}</td></tr>`).join('')}${d.fijoAntes ? `<tr><td>hasta ${_tcoF(d.fijoAntes.hasta)}</td><td>${_tcoN(d.fijoAntes.valor)} (fijo)</td></tr>` : ''}</tbody></table></div></div>
      <div><div class="tco-sh">Por mes</div><div class="tco-tw"><table><thead><tr><th>Mes</th><th>Prom.</th><th>Mín.</th><th>Máx.</th></tr></thead><tbody>${meses}</tbody></table></div></div>
    </div>
    <div class="tco-pie">Fuente: <a href="https://www.bcb.gob.bo/bcb_tco_publico_ultima_cotizacion.php" target="_blank" rel="noopener">Banco Central de Bolivia</a> · última actualización ${d.actualizado ? new Date(d.actualizado).toLocaleString('es-BO') : '—'} · <button type="button" onclick="tcoExportar()">Descargar Excel</button></div>
  </div>`;
  m.classList.add('open');
}

function tcoExportar() {
  if (!TCO.datos || typeof XLSX === 'undefined') return toastErr('No se pudo exportar.');
  const filas = TCO.fechas.map(f => ({ Fecha: f, 'TCO (Bs/US$)': TCO.datos.dias[f] }));
  const ws = XLSX.utils.json_to_sheet(filas), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TCO BCB'); XLSX.writeFile(wb, 'TCO-BCB.xlsx');
}

/* ── Materia reservada: TCO de la fecha de reserva ──
   Se completa solo al abrir una reserva nueva y al cambiar la fecha. Si alguien escribió otro valor
   a mano (o el documento ya guardado trae el suyo), no se pisa. */
let _tcoMrAuto = null;
function _tcoMrRefrescar(forzar) {
  const inp = document.getElementById('mr-tc'), fecha = document.getElementById('mr-fecha')?.value;
  if (!inp) return;
  let nota = document.getElementById('mr-tc-nota');
  if (!nota) { nota = document.createElement('div'); nota.id = 'mr-tc-nota'; nota.className = 'tco-mr-nota'; inp.insertAdjacentElement('afterend', nota); }
  const t = tcoDe(fecha);
  if (!t) { nota.textContent = 'Cargando el TCO del BCB…'; return; }
  const actual = String(inp.value || '').trim();
  const esAuto = forzar || !actual || actual === '6.96' || (_tcoMrAuto != null && Number(actual) === _tcoMrAuto);
  if (esAuto) { inp.value = t.valor.toFixed(2); _tcoMrAuto = Number(t.valor.toFixed(2)); }
  const coincide = Number(inp.value) === Number(t.valor.toFixed(2));
  nota.innerHTML = `TCO BCB vigente el ${_tcoF(t.fecha)}${t.fijo ? ' (tipo de cambio fijo)' : ''}: <b>Bs ${_tcoN(t.valor)}</b>${coincide ? '' : ` · <button type="button" onclick="_tcoMrRefrescar(true)">usar este</button>`}`;
}
(function () {
  const pp = window._mrPintarPolitica;
  if (typeof pp === 'function') window._mrPintarPolitica = function (...a) { const out = pp.apply(this, a); try { _tcoMrRefrescar(); } catch (e) {} return out; };
  document.addEventListener('change', e => { if (e.target?.id === 'mr-fecha') setTimeout(() => _tcoMrRefrescar(), 0); });
})();

tcoCargar();
setInterval(() => tcoCargar(true), 60 * 60 * 1000);   // cada hora, por si se publicó el del día
document.addEventListener('DOMContentLoaded', tcoPintarInsignias);
['entrarAdmin', 'entrarAsesor'].forEach(n => { const f = window[n]; if (typeof f === 'function') window[n] = function (...a) { const out = f.apply(this, a); setTimeout(tcoPintarInsignias, 50); return out; }; });
