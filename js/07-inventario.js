/* ═══════════════════════════════════════════
   INVENTARIO DE LOTES
═══════════════════════════════════════════ */
let todosLotes = [];
let loteEditKey = null;

/* Escuchar lotes cuando entra admin */
function iniciarInventario() {
  window._fbListenLotes(arr => {
    todosLotes = arr;
    renderInventario();
    renderInvStats();
    renderLotesEnNegociacionResumen();
    renderDetalleCierres();
    renderAnalisisOrigenModalidad();
  });
  iniciarAutoSyncOrange();
}

// ── Auto-sincronización con Orange cada 10 minutos, mientras el sistema esté abierto ──
// No hace falta darle permiso de escritura a nada externo: simplemente apretamos el mismo
// botón de "Sincronizar" solos, cada 10 minutos, mientras esta pestaña siga abierta.
const ORANGE_AUTOSYNC_MIN = 10;
let _autoSyncOrangeInterval = null;
function iniciarAutoSyncOrange() {
  if (_autoSyncOrangeInterval) return; // ya está corriendo, no duplicar
  _autoSyncOrangeInterval = setInterval(() => {
    sincronizarInventarioOrange(true); // true = silencioso, sin popups molestos
  }, ORANGE_AUTOSYNC_MIN * 60 * 1000);
}

let _autoSyncCarteraOrangeInterval = null;
function iniciarAutoSyncCarteraOrange() {
  if (_autoSyncCarteraOrangeInterval) return; // ya está corriendo, no duplicar
  _autoSyncCarteraOrangeInterval = setInterval(() => {
    cargarDetalleCobrosCartera(true); // silencioso
  }, ORANGE_AUTOSYNC_MIN * 60 * 1000);
}

function renderLotesEnNegociacionResumen() {
  const tbody = document.getElementById('inv-negociacion-tbody');
  const countEl = document.getElementById('inv-negociacion-count');
  const enNeg = todosLotes.filter(l => l.estadoNegociacion === 'negociacion');
  if (countEl) countEl.textContent = enNeg.length ? `(${enNeg.length})` : '';
  if (!tbody) return;
  if (!enNeg.length) { tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Sin lotes en negociación.</div></td></tr>'; return; }
  tbody.innerHTML = enNeg.sort((a,b)=>(b.negociadoTs||0)-(a.negociadoTs||0)).map(l => `<tr>
    <td style="font-weight:600;font-family:monospace;">${_terrenoDeLote(l)}</td>
    <td>${esc(l.negociadoPorNombre||'—')}</td>
    <td style="font-size:var(--fs-sm);color:var(--gris);">${l.negociadoTs ? new Date(l.negociadoTs).toLocaleString('es-BO') : '—'}</td>
    <td><button class="btn-clear" style="padding:4px 10px;font-size:var(--fs-sm);" onclick="window._fbUpdateLote('${l._key}',{estadoNegociacion:'',negociadoPorKey:null,negociadoPorNombre:null,negociadoTs:null})">Liberar</button></td>
  </tr>`).join('');
}

function renderInvStats() {
  document.getElementById('inv-total').textContent       = todosLotes.length;
  document.getElementById('inv-disponibles').textContent = todosLotes.filter(l=>l.estado==='Disponible').length;
  document.getElementById('inv-reservados').textContent  = todosLotes.filter(l=>l.estado==='Reservado').length;
  document.getElementById('inv-vendidos').textContent    = todosLotes.filter(l=>l.estado==='Vendido').length;
  const elBloq = document.getElementById('inv-bloqueados');
  if (elBloq) elBloq.textContent = todosLotes.filter(l=>l.estado==='Bloqueado').length;

  // Desglose por a quién pertenece el lote (UV directo vs. socios como LCK, GIR, etc.)
  const contPert = document.getElementById('inv-pertenencia');
  if (contPert) {
    const porPertenece = {};
    todosLotes.forEach(l => { const k = l.pertenece || 'UV'; porPertenece[k] = (porPertenece[k]||0)+1; });
    const entries = Object.entries(porPertenece).sort((a,b)=>b[1]-a[1]);
    contPert.innerHTML = entries.length ? entries.map(([k,n]) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-soft);border-radius:999px;">
        <span style="font-weight:700;font-size:var(--fs-base);">${k==='UV'?'🌳':'🤝'} ${esc(k)}</span>
        <span style="font-weight:700;color:var(--cartera);">${n}</span>
      </div>`).join('') : '<span style="color:var(--gris);font-size:var(--fs-sm);">Sin datos — sincronizá con Orange para completarlo.</span>';
  }

  // Desglose por categoría del terreno — Orange no la trae, esto es 100% lo que vos cargues acá.
  // "Sin categoría" destacado en naranja para que se note rápido a cuántos les falta.
  const contCateg = document.getElementById('inv-categorias');
  if (contCateg) {
    const porCateg = {};
    todosLotes.forEach(l => { const k = l.categoria || 'Sin categoría'; porCateg[k] = (porCateg[k]||0)+1; });
    const orden = ['A','B','C','Sin categoría'];
    const entries = Object.entries(porCateg).sort((a,b) => orden.indexOf(a[0]) - orden.indexOf(b[0]));
    contCateg.innerHTML = entries.length ? entries.map(([k,n]) => {
      const sinCateg = k === 'Sin categoría';
      const valorFiltro = sinCateg ? '__sin__' : k;
      return `<div onclick="document.getElementById('fil-inv-categoria').value='${valorFiltro}';renderInventario();document.getElementById('inv-tabla-body').scrollIntoView({behavior:'smooth'});" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 14px;background:${sinCateg?'var(--warn-bg)':'var(--bg-soft)'};border-radius:999px;">
        <span style="font-weight:700;font-size:var(--fs-base);color:${sinCateg?'var(--warn-ink)':'var(--ink-900)'};">${sinCateg?'⚠️':'🏷️'} ${esc(k)}</span>
        <span style="font-weight:700;color:${sinCateg?'var(--warn-ink)':'var(--cartera)'};">${n}</span>
      </div>`;
    }).join('') : '<span style="color:var(--gris);font-size:var(--fs-sm);">Sin datos.</span>';
  }
}

const PATRON_TERRENO = /^\d+-\d{1,2}-\d{1,3}$/;

/* Busca el lote de un terreno aunque el código esté escrito distinto: "01-16-199", "1-16-199", "1 - 16 - 199" */
function _normTerreno(t) { return String(t || '').trim().toLowerCase().split(/\s*-\s*/).map(x => /^\d+$/.test(x) ? String(+x) : x).join('-'); }
let _loteIdx = { ref: null, exacto: null, norm: null };
function _loteDeTerreno(t) {
  const b = String(t || '').trim().toLowerCase(); if (!b) return undefined;
  if (_loteIdx.ref !== todosLotes || _loteIdx.n !== todosLotes.length) {   // se rearma solo cuando cambia el inventario
    const ex = new Map(), no = new Map();
    todosLotes.forEach(l => { const k = String(_terrenoDeLote(l)).trim().toLowerCase(); if (!ex.has(k)) ex.set(k, l); const n = _normTerreno(k); if (!no.has(n)) no.set(n, l); });
    _loteIdx = { ref: todosLotes, n: todosLotes.length, exacto: ex, norm: no };
  }
  return _loteIdx.exacto.get(b) || _loteIdx.norm.get(_normTerreno(b));
}
function _terrenoDeLote(l) {
  return l.terreno || (l.uv && l.manzano && l.lote ? `${l.uv}-${l.manzano}-${l.lote}` : (l.codigo || '—'));
}

function renderInventario() {
  const filtroEst = document.getElementById('fil-inv-estado')?.value || '';
  const filtroPert = document.getElementById('fil-inv-pertenece')?.value || '';
  const filtroCateg = document.getElementById('fil-inv-categoria')?.value || '';
  let datos = todosLotes;
  if (filtroEst)  datos = datos.filter(l=>l.estado===filtroEst);
  if (filtroPert) datos = datos.filter(l=>(l.pertenece||'UV')===filtroPert);
  if (filtroCateg === '__sin__') datos = datos.filter(l=>!l.categoria);
  else if (filtroCateg) datos = datos.filter(l=>l.categoria===filtroCateg);

  // Poblar el filtro de pertenencia dinámicamente según lo que haya en los datos
  const selPert = document.getElementById('fil-inv-pertenece');
  if (selPert && !selPert.dataset.filled) {
    const valores = [...new Set(todosLotes.map(l=>l.pertenece||'UV'))].sort();
    if (valores.length) {
      selPert.innerHTML = '<option value="">Todos los dueños</option>' + valores.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      selPert.dataset.filled = '1';
    }
  }

  const tb = document.getElementById('inv-tabla-body');
  if (!tb) return;
  if (!datos.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty-state">Sin lotes registrados todavía.</td></tr>';
    return;
  }

  const estadoColor = {
    'Disponible':    'background:var(--ok-bg);color:var(--ok-ink);',
    'Reservado':     'background:var(--warn-bg);color:var(--warn-ink);',
    'Vendido':       'background:var(--danger-bg);color:var(--danger-ink);',
    'Bloqueado':     'background:var(--accent-bg);color:var(--accent-ink);',
    'No disponible': 'background:var(--fill);color:var(--ink-500);'
  };

  tb.innerHTML = datos.map(l => {
    const terreno = _terrenoDeLote(l);
    const precioM2 = l.precioM2 || (l.metraje && l.precio ? (l.precio / l.metraje) : 0);
    const estStyle  = estadoColor[l.estado] || 'background:var(--fill);color:var(--ink-500);';
    const pertenece = l.pertenece || 'UV';
    return `<tr>
      <td style="font-weight:600;font-family:monospace;font-size:var(--fs-base);">${terreno}</td>
      <td style="text-align:center;">${l.metraje ? l.metraje.toLocaleString('es-BO') + ' m²' : '—'}</td>
      <td style="text-align:center;color:var(--ink-500);">${precioM2 ? '$'+precioM2.toLocaleString('es-BO',{maximumFractionDigits:2}) : '—'}</td>
      <td style="font-weight:600;color:var(--cartera);">${l.precio ? '$'+Number(l.precio).toLocaleString('es-BO') : '—'}</td>
      <td><span style="padding:3px 10px;border-radius:999px;font-size:var(--fs-xs);font-weight:600;${estStyle}">${l.estado||'—'}</span></td>
      <td style="text-align:center;font-size:var(--fs-sm);">${pertenece==='UV'?'🌳 UV':'🤝 '+esc(pertenece)}</td>
      <td style="font-size:var(--fs-sm);color:var(--ink-500);">${l.obs||''}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-clear" style="padding:4px 10px;font-size:var(--fs-sm);" onclick="editarLote('${l._key}')">✏️</button>
          <button class="btn-del" onclick="eliminarLote('${l._key}','${escJs(terreno)}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function calcularPrecioLista() {
  const metraje  = parseFloat(document.getElementById('l-metraje')?.value) || 0;
  const precioM2 = parseFloat(document.getElementById('l-precio-m2')?.value) || 0;
  const elPrecio = document.getElementById('l-precio');
  if (metraje && precioM2 && elPrecio) {
    elPrecio.value = parseFloat((metraje * precioM2).toFixed(2));
  }
}

function mostrarFormLote() {
  loteEditKey = null;
  document.getElementById('form-lote-title').textContent = 'Agregar lote';
  document.getElementById('btn-guardar-lote').textContent = 'Guardar lote';
  ['l-terreno','l-metraje','l-precio-m2','l-precio','l-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('l-estado').value = '';
  document.getElementById('l-categoria').value = '';
  document.getElementById('l-pertenece').value = '';
  document.getElementById('form-lote').style.display = 'block';
  document.getElementById('form-lote').scrollIntoView({ behavior:'smooth' });
}

function cancelarFormLote() {
  loteEditKey = null;
  document.getElementById('form-lote').style.display = 'none';
}

function editarLote(key) {
  const lote = todosLotes.find(l => l._key === key);
  if (!lote) return;
  loteEditKey = key;
  document.getElementById('form-lote-title').textContent  = 'Editar lote';
  document.getElementById('btn-guardar-lote').textContent = 'Actualizar lote';
  const terrenoActual = _terrenoDeLote(lote);
  document.getElementById('l-terreno').value  = terrenoActual === '—' ? '' : terrenoActual;
  document.getElementById('l-metraje').value  = lote.metraje || '';
  document.getElementById('l-precio-m2').value = lote.precioM2 || (lote.metraje && lote.precio ? parseFloat((lote.precio/lote.metraje).toFixed(2)) : '');
  document.getElementById('l-precio').value   = lote.precio  || '';
  document.getElementById('l-estado').value   = lote.estado  || '';
  document.getElementById('l-categoria').value = lote.categoria || '';
  document.getElementById('l-pertenece').value = lote.pertenece || '';
  document.getElementById('l-obs').value      = lote.obs     || '';
  document.getElementById('form-lote').style.display = 'block';
  document.getElementById('form-lote').scrollIntoView({ behavior:'smooth' });
}

/* ═══════════════════════════════════════════
   SINCRONIZACIÓN DE INVENTARIO CON ORANGE (GetLotes)
   Actualiza precio, metraje y estado real de cada lote — no toca la categoría
   ni las observaciones, esas quedan siempre a criterio de admin.
═══════════════════════════════════════════ */
async function sincronizarInventarioOrange(silencioso) {
  const btn = document.getElementById('btn-sync-inventario');
  const setBtn = (txt, disabled) => { if (btn && !silencioso) { btn.textContent = txt; btn.disabled = disabled; } };
  setBtn('🔄 Conectando con Orange...', true);

  try {
    const resp = await fetch(ORANGE_API_URL + '?op=GetLotes');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (!json.success || !Array.isArray(json.data)) throw new Error('Respuesta inesperada de Orange');

    // Disponibilidad de Orange → nuestro Estado. "Bloqueado" ahora es su propio estado
    // (antes se mezclaba con "No disponible" — separados para poder contarlos distinto).
    const mapEstado = { 'Vendido':'Vendido', 'Disponible':'Disponible', 'Reservado':'Reservado', 'Bloqueado':'Bloqueado' };

    // Traemos TODOS los lotes, sean de Urubó Village o de socios (LCK, GIR, etc.) —
    // siguen siendo parte del inventario físico, solo que con otro dueño.
    const todosLotesOrange = json.data;
    let creados = 0, actualizados = 0;

    for (let i = 0; i < todosLotesOrange.length; i++) {
      const l = todosLotesOrange[i];
      const terreno = String(l.Terreno || '').trim();
      if (!terreno) continue;

      setBtn(`🔄 Sincronizando ${i+1}/${todosLotesOrange.length}...`, true);

      // La categoría y las observaciones NUNCA se tocan acá — quedan siempre a cargo tuyo,
      // se combinan con los datos de Orange en vez de pisarse.
      const data = {
        terreno,
        metraje:   parseFloat(l.Metraje) || 0,
        precio:    parseFloat(l.PrecioLista) || 0,
        precioM2:  parseFloat(l.PrecioM2Lista) || 0,
        estado:    mapEstado[l.Disponibilidad] || 'Disponible',
        modulo:    l.Modulo || '',
        pertenece: l.Pertenece || 'UV',
        syncOrangeTs: Date.now(),
      };

      const existente = todosLotes.find(x => String(_terrenoDeLote(x)).trim().toLowerCase() === terreno.toLowerCase());
      if (existente) {
        await window._fbUpdateLote(existente._key, data);
        actualizados++;
      } else {
        await window._fbAddLote({ ...data, categoria:'', obs:'', updatedAt: new Date().toLocaleString('es-BO') });
        creados++;
      }
    }

    setBtn('🔄 Sincronizar con Orange', false);
    setText('inv-ultima-sync', 'Última sincronización: ' + new Date().toLocaleString('es-BO') + (silencioso ? ' (automática)' : ' (manual)'));
    if (!silencioso) toastOk(`Inventario sincronizado: ${creados} lotes nuevos, ${actualizados} actualizados.`);
  } catch (e) {
    setBtn('🔄 Sincronizar con Orange', false);
    if (!silencioso) toastErr('No se pudo sincronizar: ' + e.message);
  }
}

async function guardarLote() {
  const terreno = document.getElementById('l-terreno').value.trim();
  if (!terreno || !PATRON_TERRENO.test(terreno)) {
    toastErr('El terreno debe tener el formato número-número-número, ej: 1-11-123.'); return;
  }
  const metraje  = parseFloat(document.getElementById('l-metraje').value) || 0;
  const precioM2 = parseFloat(document.getElementById('l-precio-m2').value) || 0;
  const precio   = parseFloat(document.getElementById('l-precio').value) || 0;

  const data = {
    terreno,
    metraje,
    precioM2,
    precio,
    estado:       document.getElementById('l-estado').value || 'Disponible',
    categoria:    document.getElementById('l-categoria').value || '',
    pertenece:    document.getElementById('l-pertenece').value.trim() || 'UV',
    obs:          document.getElementById('l-obs').value.trim(),
    updatedAt:    new Date().toLocaleString('es-BO'),
  };

  const btnL = document.getElementById('btn-guardar-lote');
  btnLoading(btnL, true);
  try {
    if (loteEditKey) {
      await window._fbUpdateLote(loteEditKey, data);
    } else {
      await window._fbAddLote(data);
    }
    btnSuccess(btnL);
    toastOk('Lote guardado correctamente.');
    cancelarFormLote();
  } catch(e) { btnLoading(btnL, false); toastErr('Error al guardar: ' + e.message); }
}

async function eliminarLote(key, terreno) {
  const _ok3 = await confirmDialog('Se eliminara el terreno ' + terreno + '.', { title:'Eliminar lote', okText:'Eliminar' }); if (!_ok3) return;
  try { await window._fbRemoveLote(key); }
  catch(e) { toastErr('Error: ' + e.message); }
}

function exportarInventario() {
  if (!todosLotes.length) { toastErr('Sin lotes en el inventario.'); return; }
  const rows = todosLotes.map(l => ({
    'Terreno':              _terrenoDeLote(l),
    'Metraje (m²)':         l.metraje||'',
    'Precio por m² ($)':    l.precioM2 || (l.metraje && l.precio ? parseFloat((l.precio/l.metraje).toFixed(2)) : ''),
    'Precio de lista ($)':  l.precio||'',
    'Estado':               l.estado||'',
    'Observaciones':        l.obs||'',
    'Última actualización': l.updatedAt||'',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario UV');
  XLSX.writeFile(wb, `inventario_urubo_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/* ═══════════════════════════════════════════
   IMPORTAR EXCEL — INVENTARIO DE TERRENOS
═══════════════════════════════════════════ */
let inventarioExcelPend = [];

function abrirExcelInventario() {
  const f = document.getElementById('form-excel-inventario');
  if (!f) return;
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function procesarExcelInventario(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    inventarioExcelPend = rows.map(r => {
      const terreno  = String(r['Terreno']||r['Código']||r['Codigo']||'').trim();
      const metraje  = parseFloat(r['Metraje']||r['Metraje (m²)']||r['Metraje (m2)']||0) || 0;
      let   precioM2 = parseFloat(r['Precio por m2']||r['Precio por m²']||r['Precio por m² ($)']||0) || 0;
      let   precio   = parseFloat(r['Precio de lista']||r['Precio de lista ($)']||r['Precio']||r['Precio ($)']||0) || 0;
      if (!precio && metraje && precioM2)   precio   = parseFloat((metraje * precioM2).toFixed(2));
      if (!precioM2 && metraje && precio)   precioM2 = parseFloat((precio / metraje).toFixed(2));
      return {
        terreno, metraje, precioM2, precio,
        estado: String(r['Estado']||'').trim() || 'Disponible',
        obs:    String(r['Observaciones']||r['Obs']||'').trim(),
        valido: PATRON_TERRENO.test(terreno),
        updatedAt: new Date().toLocaleString('es-BO'),
      };
    }).filter(r => r.terreno);

    setText('inv-prev-count', inventarioExcelPend.filter(r=>r.valido).length);
    const tbody = document.getElementById('inv-prev-body');
    if (tbody) tbody.innerHTML = inventarioExcelPend.map(r => `<tr${r.valido?'':' style="background:var(--danger-bg);"'}>
      <td>${esc(r.terreno)}${r.valido?'':' <span style="font-size:var(--fs-xs);color:var(--danger);font-weight:600;">formato inválido</span>'}</td>
      <td>${r.metraje ? r.metraje+' m²' : '—'}</td>
      <td>${r.precioM2 ? '$'+r.precioM2.toLocaleString('es-BO',{maximumFractionDigits:2}) : '—'}</td>
      <td style="font-weight:600;color:var(--cartera);">${r.precio ? '$'+r.precio.toLocaleString('es-BO') : '—'}</td>
      <td>${esc(r.estado)}</td>
      <td>${esc(r.obs)}</td>
    </tr>`).join('');

    const nInvalidos = inventarioExcelPend.filter(r=>!r.valido).length;
    const errEl = document.getElementById('inv-prev-errores');
    if (errEl) errEl.textContent = nInvalidos ? `${nInvalidos} fila(s) con formato de terreno inválido no se van a importar (debe ser número-número-número, ej: 1-11-123).` : '';

    const prev = document.getElementById('inv-excel-preview');
    if (prev) prev.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarExcelInventario() {
  let ok = 0, saltados = 0;
  for (const r of inventarioExcelPend) {
    if (!r.valido) { saltados++; continue; }
    try {
      const { valido, ...data } = r;
      await window._fbAddLote(data);
      ok++;
    } catch(e) { saltados++; }
  }
  toastOk(ok + ' terrenos importados al inventario.' + (saltados ? ' ' + saltados + ' fila(s) omitida(s).' : ''));
  cancelarExcelInventario();
}

function cancelarExcelInventario() {
  inventarioExcelPend = [];
  const prev = document.getElementById('inv-excel-preview');
  if (prev) prev.style.display = 'none';
  const inp = document.getElementById('inv-excel-file');
  if (inp) inp.value = '';
}

/* ═══════════════════════════════════════════
   META HELPERS
═══════════════════════════════════════════ */
const MESES_NUM = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,
  'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };

function mesActual() {
  return ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][new Date().getMonth()];
}
function anioActual() { return new Date().getFullYear(); }

/* ═══════════════════════════════════════════
   SWITCH TAB — helper sin evento
═══════════════════════════════════════════ */
function switchAdminTab_btn(id) {
  switchAdminTab(id);
}
/* ═══════════════════════════════════════════
   HOME — CENTRO DE COMANDO
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   GRÁFICOS PROFESIONALES — Panel de Inicio (vista ejecutiva)
═══════════════════════════════════════════ */
let _chartsHome = {};
function _destroyHomeChart(id) { if (_chartsHome[id]) { _chartsHome[id].destroy(); delete _chartsHome[id]; } }

function renderHomeChartVentasPie(vMes) {
  const canvas = document.getElementById('h-chart-ventas-pie');
  if (!canvas) return;
  const conteo = {};
  vMes.forEach(r => { const k = r.conclusion || 'Sin conclusión'; conteo[k] = (conteo[k]||0)+1; });
  const colMap = { 'Seguimiento':'#3b82c4', 'Reserva':'#2d5a27', 'Descartado':'#c0392b', 'Re-agendado':'#c07a2a', 'Sin conclusión':'#9ca3af' };
  const labels = Object.keys(conteo);
  _destroyHomeChart('h-chart-ventas-pie');
  if (!labels.length) return;
  _chartsHome['h-chart-ventas-pie'] = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets:[{ data:labels.map(l=>conteo[l]), backgroundColor:labels.map(l=>colMap[l]||'#6b7280'), borderWidth:0 }] },
    options: {
      cutout:'62%',
      plugins:{
        legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:8, font:{size:11}, color:'#0A0A0A' } },
        datalabels: { font:{ family:"'DM Sans',sans-serif", weight:'700', size:12 }, color:'#fff', formatter:(v)=> v>0?v:'' }
      },
      maintainAspectRatio:false
    }
  });
}

function renderHomeChartVentasTendencia() {
  const canvas = document.getElementById('h-chart-ventas-linea');
  if (!canvas) return;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hoy = new Date();
  const buckets = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
    buckets.push({ mes: meses[d.getMonth()], label: meses[d.getMonth()].slice(0,3) });
  }
  const datos = buckets.map(b => soloInternos(todosRegs).filter(r=>r.mes===b.mes).length);
  _destroyHomeChart('h-chart-ventas-linea');
  _chartsHome['h-chart-ventas-linea'] = new Chart(canvas, {
    type: 'line',
    data: { labels: buckets.map(b=>b.label), datasets:[{ data:datos, borderColor:'#1f6b3a', backgroundColor:'rgba(31,107,58,.1)', fill:true, tension:.35, pointRadius:3 }] },
    options: {
      plugins:{
        legend:{ display:false },
        datalabels: { align:'top', anchor:'end', offset:4, font:{ family:"'DM Sans',sans-serif", weight:'700', size:11 }, color:'#1f6b3a', formatter:(v)=> v>0?v:'' }
      },
      maintainAspectRatio:false, scales:{ x:{ ticks:{color:'#0A0A0A'}, grid:{color:'rgba(10,10,10,.10)'} }, y:{ beginAtZero:true, ticks:{precision:0, color:'#0A0A0A'}, grid:{color:'rgba(10,10,10,.10)'} } }
    }
  });
}

// Chart.js dibuja en <canvas>, no puede resolver var(--x) de CSS — necesita colores reales
const _ESTADOS_COLOR_HEX = {
  'Vigente':'#38a169', 'Al día':'#38a169', 'Pagado':'#38a169', 'Adelantado':'#3b82c4',
  'Mora':'#c0392b', 'Mora 1-30':'#c07a2a', 'Mora 31-60':'#b5651d',
  'Mora 61-90':'#c0392b', 'Mora 91-180':'#8b1a1a', 'Mora +180':'#5c0f0f', 'Mora +91':'#8b1a1a',
  'Parcial':'#c07a2a', 'Sin gestión':'#9ca3af',
};

function renderHomeChartCarteraMora(cartaAdmin) {
  const conteo = {};
  cartaAdmin.forEach(c => { const k = c.estado || 'Sin gestión'; conteo[k] = (conteo[k]||0)+1; });
  _barraHorizontal('h-chart-cartera-mora', conteo, _ESTADOS_COLOR_HEX, null);
}

function renderHomeChartExpensasEstado(expMes) {
  const conteo = {};
  expMes.forEach(e => { const k = e.estado || 'Sin gestión'; conteo[k] = (conteo[k]||0)+1; });
  _barraHorizontal('h-chart-exp-estado', conteo, _ESTADOS_COLOR_HEX, null);
}

function renderHomeChartInventarioPie(disp, vend, resv, total) {
  const canvas = document.getElementById('h-chart-inv-pie');
  if (!canvas) return;
  const noDisp = Math.max(total - disp - vend - resv, 0);
  _destroyHomeChart('h-chart-inv-pie');
  if (!total) return;
  _chartsHome['h-chart-inv-pie'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Disponible','Reservado','Vendido','No disponible'],
      datasets: [{ data:[disp,resv,vend,noDisp], backgroundColor:['#16a34a','#c07a2a','#c0392b','#9ca3af'], borderWidth:0 }]
    },
    options: {
      cutout:'62%',
      plugins:{
        legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:8, font:{size:11}, color:'#0A0A0A' } },
        datalabels: { font:{ family:"'DM Sans',sans-serif", weight:'700', size:12 }, color:'#fff', formatter:(v)=> v>0?v:'' }
      },
      maintainAspectRatio:false
    }
  });
}

