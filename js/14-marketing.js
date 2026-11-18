/* ═══════════════════════════════════════════════════════════════════════
   MARKETING — PLANILLA DE LEADS POR CAMPAÑA (reemplaza "Cargar leads de la semana")
   ─────────────────────────────────────────────────────────────────────
   Problema que resuelve: la carga vieja hacía push() de cada registro, sin
   validar. Si se cargaba dos veces el mismo código + rango (doble clic, o
   volver a cargar para "corregir"), o rangos que se pisaban, los leads se
   SUMABAN dos veces en todos los tableros.
   Ahora: una celda por CÓDIGO × SEMANA del mes, con clave fija en Firebase
   (leads_semanales/p_AAAA-MM_CODIGO_Sn). Guardar REEMPLAZA el valor, nunca suma.
   Las cargas viejas se leen depuradas (un solo valor por código+rango) y al
   guardar la planilla del mes se convierten al formato nuevo, con historial.
═══════════════════════════════════════════════════════════════════════ */
const MKP_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let mkpInversion = {};                // mkt_inversion/{AAAA-MM}/{codeKey} = { codigo, monto, por, ts }
const mkpEstado = {};                 // por contenedor: { anio, m, cambios:{}, inv:{} }

const _mkpPad = n => String(n).padStart(2,'0');
const _mkpIso = d => d.getFullYear()+'-'+_mkpPad(d.getMonth()+1)+'-'+_mkpPad(d.getDate());
const _mkpHoy = () => _mkpIso(new Date());
const _mkpYM = (anio, m) => anio + '-' + _mkpPad(m+1);
const _mkpCodeKey = c => String(c||'').toUpperCase().replace(/[^A-Z0-9_-]/g,'_') || 'SIN_CODIGO';
const _mkpNormCode = c => String(c||'').toUpperCase().replace(/\s+/g,'').trim();
const _mkpFc = s => s ? s.slice(8,10)+'/'+s.slice(5,7) : '';
const _mkpUsuario = () => asesorActual?.nombre || (typeof modoAdmin !== 'undefined' && modoAdmin ? 'Administrador' : 'Marketing');
const _mkpUSD = n => '$' + (Math.round((n||0)*100)/100).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* Semanas del mes, lunes a domingo, recortadas al mes (S1 puede empezar a mitad de semana). */
function _mkpSemanas(anio, m) {
  const out = []; const fin = new Date(anio, m+1, 0);
  let d = new Date(anio, m, 1), n = 1;
  while (d <= fin) {
    const ini = new Date(d);
    const dow = (d.getDay() + 6) % 7;            // 0 = lunes
    let h = new Date(d); h.setDate(d.getDate() + (6 - dow)); if (h > fin) h = new Date(fin);
    out.push({ s:'S'+n, desde:_mkpIso(ini), hasta:_mkpIso(h), label:_mkpPad(ini.getDate())+'–'+_mkpPad(h.getDate()) });
    d = new Date(h); d.setDate(h.getDate() + 1); n++;
  }
  return out;
}

/* Agrupa las cargas viejas (push) por código + rango: los duplicados cuentan UNA vez. */
function _mkpGruposLegacy(lista) {
  const g = {};
  lista.filter(l => l.origen !== 'planilla').forEach(l => {
    const k = _mkpNormCode(l.campaniaCodigo) + '|' + l.desde + '|' + l.hasta;
    (g[k] ||= []).push(l);
  });
  return Object.values(g).map(arr => {
    arr.sort((a,b) => (a.ts||0) - (b.ts||0));
    const ult = arr[arr.length-1];
    const iguales = arr.every(x => (x.cantidad||0) === (ult.cantidad||0));
    return { codigo:_mkpNormCode(ult.campaniaCodigo), nombre:ult.campaniaNombre||'', desde:ult.desde, hasta:ult.hasta, mes:ult.mes, anio:ult.anio,
      cantidad: ult.cantidad||0, registros: arr, keys: arr.map(x => x._key),
      dup: arr.length > 1 ? (iguales ? 'igual' : 'distinto') : null, sumaCruda: arr.reduce((s,x) => s + (x.cantidad||0), 0) };
  });
}

/* Versión depurada de leads_semanales para TODOS los tableros (embudo, tendencia, por campaña). */
function leadsSemanalesDepurados() {
  const base = (typeof leadsSemanalesData !== 'undefined') ? leadsSemanalesData : [];
  const plan = base.filter(l => l.origen === 'planilla');
  const leg = _mkpGruposLegacy(base).map(g => ({ campaniaCodigo:g.codigo, campaniaNombre:g.nombre, desde:g.desde, hasta:g.hasta, mes:g.mes, anio:g.anio, cantidad:g.cantidad, origen:'legacy' }));
  return plan.concat(leg);
}

/* Lo que hay cargado para un mes: celdas código × semana. */
function _mkpAnalizarMes(anio, m) {
  const mesNom = MKP_MESES[m], ym = _mkpYM(anio, m), sem = _mkpSemanas(anio, m);
  const base = (typeof leadsSemanalesData !== 'undefined') ? leadsSemanalesData : [];
  const delMes = base.filter(l => l.mes === mesNom && Number(l.anio) === anio);
  const celdas = {};   // code -> S -> { valor, plan, grupos:[], flags:[] }
  const cel = (c, s) => ((celdas[c] ||= {})[s] ||= { valor:0, plan:null, grupos:[], flags:[] });
  delMes.filter(l => l.origen === 'planilla').forEach(l => { const c = cel(_mkpNormCode(l.campaniaCodigo), l.semana); c.plan = l; c.valor += l.cantidad||0; });
  const grupos = _mkpGruposLegacy(delMes);
  grupos.forEach(g => {
    let w = sem.find(x => g.desde >= x.desde && g.desde <= x.hasta) || (g.desde < sem[0].desde ? sem[0] : sem[sem.length-1]);
    const c = cel(g.codigo, w.s);
    c.valor += g.cantidad; c.grupos.push(g);
    if (g.dup === 'igual') c.flags.push(`Cargado ${g.registros.length} veces igual (${g.cantidad}) para ${_mkpFc(g.desde)}–${_mkpFc(g.hasta)}: se cuenta una sola vez`);
    if (g.dup === 'distinto') c.flags.push(`${g.registros.length} cargas distintas para ${_mkpFc(g.desde)}–${_mkpFc(g.hasta)} (${g.registros.map(r => r.cantidad).join(' + ')}): se toma la última (${g.cantidad})`);
    if (g.hasta > w.hasta) c.flags.push(`Rango ${_mkpFc(g.desde)}–${_mkpFc(g.hasta)} abarca más de una semana: quedó en ${w.s}`);
  });
  // rangos que se pisan dentro de la misma celda
  Object.values(celdas).forEach(row => Object.values(row).forEach(c => {
    for (let i = 0; i < c.grupos.length; i++) for (let j = i+1; j < c.grupos.length; j++) {
      const a = c.grupos[i], b = c.grupos[j];
      if (a.desde <= b.hasta && b.desde <= a.hasta) c.flags.push(`Rangos que se pisan: ${_mkpFc(a.desde)}–${_mkpFc(a.hasta)} y ${_mkpFc(b.desde)}–${_mkpFc(b.hasta)} (se suman ambos — revisá)`);
    }
    if (c.plan && c.grupos.length) c.flags.push('Hay una carga vieja y una de planilla en la misma semana: se suman');
  }));
  const crudo = delMes.reduce((s,l) => s + (l.cantidad||0), 0);
  const depurado = Object.values(celdas).reduce((s,row) => s + Object.values(row).reduce((t,c) => t + c.valor, 0), 0);
  const nLegacy = grupos.reduce((s,g) => s + g.registros.length, 0);
  const nDup = grupos.filter(g => g.dup).reduce((s,g) => s + g.registros.length - 1, 0);
  return { ym, mesNom, sem, celdas, crudo, depurado, nLegacy, nDup };
}

/* Campañas a mostrar: activas + cualquiera con datos en el mes. Códigos repetidos se unifican. */
function _mkpCampaniasMes(an) {
  const map = {};
  (campaniasData || []).forEach(c => {
    const k = _mkpNormCode(c.codigo); if (!k) return;
    if (map[k]) { map[k].repetido = true; return; }
    map[k] = { codigo:k, nombre:c.nombre, activa: c.activa !== false, repetido:false };
  });
  Object.keys(an.celdas).forEach(k => { if (!map[k]) map[k] = { codigo:k, nombre:'(código sin campaña creada)', activa:true, huerfano:true }; });
  return Object.values(map).filter(c => c.activa || an.celdas[c.codigo] || mkpInversion[an.ym]?.[_mkpCodeKey(c.codigo)])
    .sort((a,b) => a.codigo.localeCompare(b.codigo));
}

/* ═══ RENDER ═══ */
function mkpRender(cid) {
  const box = document.getElementById(cid); if (!box) return;
  const hoy = new Date();
  const st = mkpEstado[cid] ||= { anio: hoy.getFullYear(), m: hoy.getMonth(), cambios:{}, inv:{} };
  // si el usuario está tipeando en la planilla, no la redibujamos (no perder foco ni lo tipeado)
  if (box.contains(document.activeElement) && document.activeElement.classList?.contains('mkp-in')) { _mkpRenderRend(cid); return; }
  const an = _mkpAnalizarMes(st.anio, st.m);
  const camps = _mkpCampaniasMes(an);
  const hoyIso = _mkpHoy();
  const invMes = mkpInversion[an.ym] || {};
  const anios = []; for (let y = hoy.getFullYear() - 2; y <= hoy.getFullYear() + 1; y++) anios.push(y);
  const avisoDup = an.nDup || an.crudo !== an.depurado;
  const nCambios = Object.keys(st.cambios).length + Object.keys(st.inv).length;

  box.innerHTML = `
    <div class="mkp-bar">
      <div class="mkp-per">
        <button class="mkp-nav" onclick="mkpMover('${cid}',-1)" title="Mes anterior">◀</button>
        <select onchange="mkpIrMes('${cid}', ${st.anio}, Number(this.value))">${MKP_MESES.map((x,i) => `<option value="${i}" ${i===st.m?'selected':''}>${x}</option>`).join('')}</select>
        <select onchange="mkpIrMes('${cid}', Number(this.value), ${st.m})">${anios.map(y => `<option ${y===st.anio?'selected':''}>${y}</option>`).join('')}</select>
        <button class="mkp-nav" onclick="mkpMover('${cid}',1)" title="Mes siguiente">▶</button>
      </div>
      <div class="mkp-acts">
        <span class="mkp-status" id="${cid}-status">${nCambios ? `<b>${nCambios}</b> cambio(s) sin guardar` : 'Todo guardado'}</span>
        <button class="btn-secondary btn-sm" onclick="mkpDescartar('${cid}')">Descartar</button>
        <button class="btn-primary btn-sm" id="${cid}-save" onclick="mkpGuardar('${cid}')">💾 Guardar ${MKP_MESES[st.m]}</button>
      </div>
    </div>
    ${avisoDup ? `<div class="mkp-aviso">⚠️ En ${an.mesNom} ${st.anio} había cargas repetidas o superpuestas: sumaban <b>${an.crudo}</b> leads, el valor correcto depurado es <b>${an.depurado}</b>${an.nDup ? ` (${an.nDup} carga(s) duplicadas)` : ''}. Los tableros ya muestran el valor depurado. Revisá las celdas marcadas ⚠ y tocá <b>Guardar</b> para dejarlo corregido en la base.</div>`
      : an.nLegacy ? `<div class="mkp-aviso info">ℹ️ Este mes tiene ${an.nLegacy} carga(s) del formato anterior; al guardar se pasan a la planilla (queda el historial).</div>` : ''}
    ${(() => { const fl = []; Object.entries(an.celdas).forEach(([c,row]) => Object.entries(row).forEach(([s,cel]) => cel.flags.forEach(f => fl.push(`<li><b>${esc(c)} · ${s}</b> — ${esc(f)}</li>`)))); return fl.length ? `<details class="mkp-det" open><summary>Qué se detectó en las cargas anteriores (${fl.length})</summary><ul>${fl.join('')}</ul></details>` : ''; })()}
    <div class="tabla-wrap"><table class="mkp-t" id="${cid}-t">
      <thead><tr><th>Código</th><th>Campaña</th>${an.sem.map(w => `<th class="c ${w.desde > hoyIso ? 'fut' : ''}">${w.s}<small>${w.label}</small></th>`).join('')}<th class="c">Total mes</th><th class="c">Inversión US$</th><th class="c">Costo x lead</th></tr></thead>
      <tbody>${camps.length ? camps.map(c => {
        const row = an.celdas[c.codigo] || {};
        const ck = _mkpCodeKey(c.codigo);
        const invGuardada = invMes[ck]?.monto;
        const invVal = st.inv[ck] !== undefined ? st.inv[ck] : (invGuardada ?? '');
        return `<tr data-c="${esc(c.codigo)}">
          <td class="mkp-code">${esc(c.codigo)}${c.repetido ? ' <span class="mkp-flag" title="Este código está creado más de una vez en Campañas — se muestra una sola fila">⚠</span>' : ''}</td>
          <td class="mkp-nom">${esc(c.nombre||'')}${!c.activa ? ' <span class="mkp-arch">archivada</span>' : ''}</td>
          ${an.sem.map(w => {
            const cel = row[w.s] || { valor:0, flags:[] };
            const kk = c.codigo + '|' + w.s;
            const v = st.cambios[kk] !== undefined ? st.cambios[kk] : (cel.valor || '');
            const fut = w.desde > hoyIso;
            const tip = cel.flags.join('\n');
            return `<td class="c ${cel.flags.length ? 'mkp-warn' : ''} ${st.cambios[kk] !== undefined ? 'mkp-mod' : ''}" ${tip ? `title="${esc(tip)}"` : ''}>
              <input class="mkp-in" inputmode="numeric" data-k="${esc(kk)}" data-orig="${cel.valor||0}" value="${v}" ${fut ? 'disabled placeholder="—"' : 'placeholder="0"'}
                oninput="mkpCambio('${cid}', this)" onkeydown="mkpTecla(event, this)" onpaste="mkpPegar(event, '${cid}', this)" onfocus="this.select()"/>
              ${cel.flags.length ? '<i class="mkp-dot">⚠</i>' : (cel.grupos?.length ? '<i class="mkp-dot old" title="Carga del formato anterior">↺</i>' : '')}
            </td>`;
          }).join('')}
          <td class="c mkp-tot"></td>
          <td class="c ${st.inv[ck] !== undefined ? 'mkp-mod' : ''}"><input class="mkp-in mkp-inv" inputmode="decimal" data-inv="${ck}" data-orig="${invGuardada ?? ''}" value="${invVal}" placeholder="0" oninput="mkpCambioInv('${cid}', this)" onkeydown="mkpTecla(event, this)" onfocus="this.select()"/></td>
          <td class="c mkp-cpl"></td>
        </tr>`;
      }).join('') : `<tr><td colspan="${an.sem.length + 5}"><div class="empty-state">No hay campañas activas. Creá un código en "📣 Códigos de campaña".</div></td></tr>`}</tbody>
      <tfoot><tr><td colspan="2">Total</td>${an.sem.map(w => `<td class="c" data-tw="${w.s}"></td>`).join('')}<td class="c" data-tw="tot"></td><td class="c" data-tw="inv"></td><td class="c" data-tw="cpl"></td></tr></tfoot>
    </table></div>
    <div class="mkp-tip">Escribí los leads de cada código por semana y tocá <b>Guardar</b>: el número <b>reemplaza</b> lo anterior, nunca se suma dos veces. <b>Enter</b> baja, <b>Tab</b> avanza, y podés <b>pegar un bloque copiado de Excel</b> (Ctrl+V) desde la celda donde empieza. Semanas futuras bloqueadas.</div>
    <h4 class="mkp-h4">Rendimiento por campaña — ${MKP_MESES[st.m]} ${st.anio}</h4>
    <div id="${cid}-rend"></div>`;
  _mkpRecalc(cid);
  _mkpRenderRend(cid);
}

function _mkpRecalc(cid) {
  const t = document.getElementById(cid + '-t'); if (!t) return;
  const st = mkpEstado[cid];
  const sumW = {}; let tot = 0, inv = 0;
  t.querySelectorAll('tbody tr[data-c]').forEach(tr => {
    let rt = 0;
    tr.querySelectorAll('input.mkp-in:not(.mkp-inv)').forEach(i => { const v = Math.max(0, Math.round(Number(i.value) || 0)); rt += v; const s = i.dataset.k.split('|')[1]; sumW[s] = (sumW[s]||0) + v; });
    const iv = Number(tr.querySelector('input.mkp-inv')?.value) || 0;
    tr.querySelector('.mkp-tot').textContent = rt || '';
    tr.querySelector('.mkp-cpl').textContent = iv && rt ? _mkpUSD(iv/rt) : '';
    tot += rt; inv += iv;
  });
  t.querySelectorAll('tfoot [data-tw]').forEach(td => {
    const k = td.dataset.tw;
    td.textContent = k === 'tot' ? tot : k === 'inv' ? (inv ? _mkpUSD(inv) : '') : k === 'cpl' ? (inv && tot ? _mkpUSD(inv/tot) : '') : (sumW[k] || '');
  });
  const n = Object.keys(st.cambios).length + Object.keys(st.inv).length;
  const s = document.getElementById(cid + '-status'); if (s) s.innerHTML = n ? `<b>${n}</b> cambio(s) sin guardar` : 'Todo guardado';
}

function mkpCambio(cid, inp) {
  const st = mkpEstado[cid]; const k = inp.dataset.k;
  const clean = inp.value.replace(/[^\d]/g, ''); if (clean !== inp.value) inp.value = clean;
  if (String(Number(clean)||0) === String(Number(inp.dataset.orig)||0)) delete st.cambios[k]; else st.cambios[k] = clean === '' ? 0 : Number(clean);
  inp.parentElement.classList.toggle('mkp-mod', st.cambios[k] !== undefined);
  _mkpRecalc(cid);
}
function mkpCambioInv(cid, inp) {
  const st = mkpEstado[cid]; const k = inp.dataset.inv;
  const clean = inp.value.replace(/[^\d.,]/g, '').replace(',', '.'); if (clean !== inp.value) inp.value = clean;
  if ((Number(clean)||0) === (Number(inp.dataset.orig)||0)) delete st.inv[k]; else st.inv[k] = Number(clean) || 0;
  inp.parentElement.classList.toggle('mkp-mod', st.inv[k] !== undefined);
  _mkpRecalc(cid);
}

/* Enter = bajar, flechas arriba/abajo = moverse por columna */
function mkpTecla(e, inp) {
  if (!['Enter','ArrowDown','ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const td = inp.closest('td'), tr = td.parentElement, idx = [...tr.children].indexOf(td);
  let dest = e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
  while (dest) { const i = dest.children[idx]?.querySelector('input:not([disabled])'); if (i) { i.focus(); return; } dest = e.key === 'ArrowUp' ? dest.previousElementSibling : dest.nextElementSibling; }
}

/* Pegar un bloque desde Excel: llena hacia la derecha y hacia abajo desde la celda actual */
function mkpPegar(e, cid, inp) {
  const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (!/[\t\n]/.test(txt.trim())) return;   // un solo valor: comportamiento normal
  e.preventDefault();
  const filas = txt.replace(/\r/g,'').split('\n').filter((l,i,a) => l.length || i < a.length-1).map(l => l.split('\t'));
  const td = inp.closest('td'), tr0 = td.parentElement, col0 = [...tr0.children].indexOf(td);
  let tr = tr0, n = 0;
  for (const fila of filas) {
    if (!tr) break;
    fila.forEach((val, j) => {
      const i = tr.children[col0 + j]?.querySelector('input.mkp-in:not(.mkp-inv):not([disabled])');
      if (!i) return;
      i.value = String(val).replace(/[^\d]/g, ''); mkpCambio(cid, i); n++;
    });
    tr = tr.nextElementSibling;
  }
  toastInfo(n + ' celda(s) pegadas — revisá y tocá Guardar.');
}

async function mkpIrMes(cid, anio, m) {
  const st = mkpEstado[cid];
  if (Object.keys(st.cambios).length + Object.keys(st.inv).length) {
    const ok = await confirmDialog('Tenés cambios sin guardar en ' + MKP_MESES[st.m] + '. Si cambiás de mes se pierden.', { title:'Cambios sin guardar', okText:'Descartar y seguir', icon:'!' });
    if (!ok) { mkpRender(cid); return; }
  }
  st.anio = anio; st.m = m; st.cambios = {}; st.inv = {};
  document.activeElement?.blur?.();
  mkpRender(cid);
}
function mkpMover(cid, d) { const st = mkpEstado[cid]; let m = st.m + d, a = st.anio; if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; } mkpIrMes(cid, a, m); }
function mkpDescartar(cid) { const st = mkpEstado[cid]; st.cambios = {}; st.inv = {}; document.activeElement?.blur?.(); mkpRender(cid); }

async function mkpGuardar(cid) {
  const st = mkpEstado[cid];
  const an = _mkpAnalizarMes(st.anio, st.m);
  const nomPorCod = Object.fromEntries((campaniasData||[]).map(c => [_mkpNormCode(c.codigo), c.nombre]));
  const upd = {}; const ts = Date.now(), por = _mkpUsuario();
  let nCel = 0, nLegacyBorra = 0;
  // celdas a escribir: las modificadas + las que tienen cargas viejas (se convierten)
  const claves = new Set(Object.keys(st.cambios));
  Object.entries(an.celdas).forEach(([c,row]) => Object.entries(row).forEach(([s,cel]) => { if (cel.grupos.length) claves.add(c + '|' + s); }));
  for (const kk of claves) {
    const [c, s] = kk.split('|');
    const w = an.sem.find(x => x.s === s); if (!w) continue;
    const cel = an.celdas[c]?.[s] || { valor:0, plan:null, grupos:[] };
    const nuevo = st.cambios[kk] !== undefined ? st.cambios[kk] : cel.valor;
    const prevHist = cel.plan?.historial || [];
    const hist = (nuevo !== cel.valor || cel.grupos.length) ? [...prevHist, { ts, por, de: cel.valor, a: nuevo, ...(cel.grupos.length ? { nota: 'Convertido desde ' + cel.grupos.reduce((t,g) => t + g.registros.length, 0) + ' carga(s) del formato anterior' } : {}) }] : prevHist;
    const rec = { campaniaCodigo: c, campaniaNombre: nomPorCod[c] || cel.plan?.campaniaNombre || cel.grupos[0]?.nombre || '', desde: w.desde, hasta: w.hasta,
      cantidad: nuevo, mes: an.mesNom, anio: st.anio, semana: s, origen: 'planilla', ts, cargadoPor: por, historial: hist.slice(-30) };
    if (cel.grupos.length) rec.migradoDe = [...(cel.plan?.migradoDe || []), ...cel.grupos.flatMap(g => g.registros.map(r => ({ cantidad:r.cantidad||0, desde:r.desde, hasta:r.hasta, ts:r.ts||0, cargadoPor:r.cargadoPor||'' })))];
    else if (cel.plan?.migradoDe) rec.migradoDe = cel.plan.migradoDe;
    if (rec.cantidad === 0 && !cel.plan && !cel.grupos.length) continue;   // celda vacía que nunca existió
    upd[`leads_semanales/p_${an.ym}_${_mkpCodeKey(c)}_${s}`] = rec;
    cel.grupos.forEach(g => g.keys.forEach(k => { upd['leads_semanales/' + k] = null; nLegacyBorra++; }));
    nCel++;
  }
  Object.entries(st.inv).forEach(([ck, monto]) => {
    const cod = Object.keys(nomPorCod).find(x => _mkpCodeKey(x) === ck) || ck;
    upd[`mkt_inversion/${an.ym}/${ck}`] = monto ? { codigo: cod, monto, por, ts } : null;
  });
  if (!Object.keys(upd).length) { toastInfo('No hay cambios para guardar.'); return; }
  if (nLegacyBorra) {
    const totalNuevo = an.depurado + Object.entries(st.cambios).reduce((s,[kk,v]) => { const [c,w] = kk.split('|'); return s + v - (an.celdas[c]?.[w]?.valor || 0); }, 0);
    const ok = await confirmDialog(`Se pasan ${nLegacyBorra} carga(s) del formato anterior a la planilla${an.nDup ? ` (incluye ${an.nDup} duplicada(s), que se cuentan una sola vez)` : ''}. Total de ${an.mesNom}: ${an.crudo} → ${totalNuevo} leads. Queda el detalle en el historial de cada celda.`, { title:'Guardar y depurar', okText:'Guardar', positive:true, icon:'✓' });
    if (!ok) return;
  }
  const btn = document.getElementById(cid + '-save'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await window._fbMkt.multi(upd);
    st.cambios = {}; st.inv = {};
    document.activeElement?.blur?.();
    toastOk(`${an.mesNom} guardado: ${nCel} celda(s)${nLegacyBorra ? `, ${nLegacyBorra} carga(s) viejas depuradas` : ''}.`);
    mkpRender(cid);
  } catch (err) {
    console.error(err); toastErr('No se pudo guardar: ' + (err.message || err));
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar ' + MKP_MESES[st.m]; }
  }
}

/* Rendimiento por campaña: leads (depurados) → inversión → CPL → agendadas por Call Center → completadas */
function _mkpRenderRend(cid) {
  const box = document.getElementById(cid + '-rend'); if (!box) return;
  const st = mkpEstado[cid]; const mesNom = MKP_MESES[st.m], ym = _mkpYM(st.anio, st.m);
  const leads = {}; leadsSemanalesDepurados().filter(l => l.mes === mesNom && Number(l.anio) === st.anio).forEach(l => { const k = _mkpNormCode(l.campaniaCodigo) || 'SIN CÓDIGO'; leads[k] = (leads[k]||0) + (l.cantidad||0); });
  const vis = (typeof visitasProgramadasData !== 'undefined' ? visitasProgramadasData : []).filter(v => v.mes === mesNom && Number(v.anio) === st.anio);
  const ag = {}, comp = {};
  vis.forEach(v => { const k = _mkpNormCode(v.campaniaCodigo) || 'SIN CÓDIGO'; ag[k] = (ag[k]||0) + 1; if (v.estado === 'completada') comp[k] = (comp[k]||0) + 1; });
  const inv = {}; Object.values(mkpInversion[ym] || {}).forEach(x => { inv[_mkpNormCode(x.codigo)] = x.monto || 0; });
  const cods = [...new Set([...Object.keys(leads), ...Object.keys(ag), ...Object.keys(inv)])].sort((a,b) => (leads[b]||0) - (leads[a]||0));
  if (!cods.length) { box.innerHTML = '<div class="empty-state" style="padding:14px;">Sin datos para este mes.</div>'; return; }
  const T = k => Object.values(k).reduce((s,x) => s+x, 0);
  const pct = (a,b) => b ? Math.round(a*100/b) + '%' : '—';
  const fila = (k, L, I, A, C, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td class="mkp-code">${esc(k)}</td><td class="c">${L||0}</td><td class="c">${I ? _mkpUSD(I) : '—'}</td><td class="c">${I && L ? _mkpUSD(I/L) : '—'}</td><td class="c">${A||0}</td><td class="c">${pct(A||0, L)}</td><td class="c">${C||0}</td><td class="c">${pct(C||0, A)}</td><td class="c">${I && C ? _mkpUSD(I/C) : '—'}</td></tr>`;
  box.innerHTML = `<div class="tabla-wrap"><table class="mkp-t mkp-rend"><thead><tr><th>Código</th><th class="c">Leads</th><th class="c">Inversión</th><th class="c">Costo x lead</th><th class="c">Agendadas (Call Center)</th><th class="c">Lead → agenda</th><th class="c">Visitas completadas</th><th class="c">Agenda → visita</th><th class="c">Costo x visita</th></tr></thead>
    <tbody>${cods.map(k => fila(k, leads[k], inv[k], ag[k], comp[k])).join('')}</tbody>
    <tfoot>${fila('Total', T(leads), T(inv), T(ag), T(comp))}</tfoot></table></div>
    <div class="mkp-tip">Agendadas y completadas salen de las visitas que carga Call Center con el código de campaña. "SIN CÓDIGO" = visitas agendadas sin código: pedí a Call Center que siempre lo elija para medir cada campaña.</div>`;
}

function mkpRefrescar() {
  ['mkp-u','mkp-a'].forEach(cid => { if (document.getElementById(cid)) mkpRender(cid); });
  // costo por lead del mes en el KPI de Gerencia
  const el = document.getElementById('adm-cpl');
  if (el) {
    const hoy = new Date(), ym = _mkpYM(hoy.getFullYear(), hoy.getMonth()), mesNom = MKP_MESES[hoy.getMonth()];
    const invT = Object.values(mkpInversion[ym] || {}).reduce((s,x) => s + (x.monto||0), 0);
    const leadsT = leadsSemanalesDepurados().filter(l => l.mes === mesNom && Number(l.anio) === hoy.getFullYear()).reduce((s,l) => s + (l.cantidad||0), 0);
    el.textContent = invT && leadsT ? _mkpUSD(invT / leadsT) : '—';
  }
}

function iniciarMarketingPlanilla() {
  if (window._mkpIniciado || !window._fbMkt) return;
  window._mkpIniciado = true;
  window._fbMkt.listen('mkt_inversion', m => { mkpInversion = m || {}; mkpRefrescar(); });
  window.addEventListener('beforeunload', e => {
    if (Object.values(mkpEstado).some(st => Object.keys(st.cambios).length + Object.keys(st.inv).length)) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function mkpArchivarCampania(key, activa) {
  try { await window._fbMkt.update('campanias/' + key, { activa }); toastOk(activa ? 'Campaña reactivada.' : 'Campaña archivada: ya no aparece en la planilla (sus datos se conservan).'); }
  catch (e) { toastErr('No se pudo actualizar la campaña.'); }
}
