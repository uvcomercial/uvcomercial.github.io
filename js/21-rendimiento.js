/* ════════════════════════════════════════════════════════════════════════
   RENDIMIENTO
   El sistema redibujaba TODOS los paneles (Ventas, Registros, Cotizaciones,
   Inventario, Marketing, Ventas concretadas…) cada vez que llegaba un dato,
   aunque estuvieran ocultos, y seguía trabajando con la pestaña del navegador
   en segundo plano. Acá:
   1) cada panel se dibuja solo cuando se ve; si llega un dato mientras está
      oculto, queda pendiente y se dibuja al abrirlo;
   2) con la pestaña en segundo plano no se redibuja ni se sincroniza Orange:
      se pone al día al volver;
   3) los gráficos animan más corto.
   No cambia ningún cálculo: solo cuándo se dibuja.
   ════════════════════════════════════════════════════════════════════════ */
const REND = { pend: {}, orange: {}, vig: null, padFirma: null };
const REND_PANEL = {
  renderDashboard: 'panel-dashboard', renderHistoricoMensualVentas: 'panel-dashboard', renderTendenciaVentasChart: 'panel-dashboard', renderMetaVsEjecucion: 'panel-dashboard',
  renderGestionMensualVentas: 'panel-dashboard', renderAvancePorAsesor: 'panel-dashboard', renderSeguimientoActivo: 'panel-dashboard', renderClientesEnNegociacion: 'panel-dashboard',
  renderTablaAdmin: 'panel-tabla',
  renderCotizacionesGuardadas: 'panel-cotizaciones',
  renderInventario: 'panel-inventario', renderLotesEnNegociacionResumen: 'panel-inventario',
  renderAdminMarketing: 'panel-marketing-admin',
  renderVentasConcretadasAdmin: 'panel-contratos', renderVentasDashboard: 'panel-contratos',
  renderTendenciaMarketing: 'utab-marketing',
  renderHome: 'home-legado',
  homeV2Pintar: 'panel-home',
  // panel del asesor y del usuario
  renderMisRegistros: '@mis-reg-list', renderMisCotizacionesVendedor: '@mis-cotiz-tbody', renderListaLotesPicker: '@modal-selector-lote',
};
/* ¿Se está usando el panel de administración? (admin, Gerencia, Cartera y otros roles que entran ahí) */
function _rendPanelAdmin() { if (typeof modoAdmin !== 'undefined' && modoAdmin) return true; const a = document.getElementById('admin-panel'); return !!a && a.getClientRects().length > 0; }
function _rendVisible(pid) {
  if (document.hidden) return false;
  if (pid === '@modal-selector-lote') return !!document.getElementById('modal-selector-lote')?.classList.contains('open');
  if (pid[0] === '@') { const el = document.getElementById(pid.slice(1)); return !!el && el.getClientRects().length > 0; }
  if (pid === 'home-legado') { const h = document.getElementById('panel-home'); return !!h && h.classList.contains('active') && (!document.getElementById('home-v2') || h.classList.contains('h2-legado')); }
  const el = document.getElementById(pid); return !!el && el.getClientRects().length > 0;
}
/* Lo que tiene que seguir al día aunque el panel no se vea (contadores del menú) */
const REND_SIEMPRE = {
  renderVentasConcretadasAdmin() { const b = document.getElementById('nav-contratos-badge'); if (!b) return; const n = _decArr('ventasConcretadasData').filter(v => v.estadoAutorizacion === 'pendiente').length; b.style.display = n ? 'flex' : 'none'; b.textContent = n; },
  renderHome() { const b = document.getElementById('badge-mora'); if (!b) return; const n = _decArr('cartaAdmin').filter(c => (c.estado || c.sumaMeta || '').toLowerCase().includes('mora')).length; b.textContent = n; b.style.display = n > 0 ? 'inline-flex' : 'none'; },
};
function rendPonerAlDia() {
  Object.entries(REND.pend).forEach(([fn, x]) => {
    if (!_rendVisible(x.pid)) return; delete REND.pend[fn];
    try { (window[fn].__orig || window[fn]).apply(x.self, x.a); } catch (e) { console.error(fn + ':', e); }
  });
}
(function () {
  // 1) dibujar solo lo visible (en administración; el panel de usuario sigue igual)
  Object.entries(REND_PANEL).forEach(([fn, pid]) => {
    const f = window[fn]; if (typeof f !== 'function' || f.__rend) return;
    const w = function (...a) {
      if (pid[0] !== '@' && !_rendPanelAdmin() && pid !== 'panel-home' && pid !== 'home-legado') return f.apply(this, a);
      if (_rendVisible(pid)) { delete REND.pend[fn]; return f.apply(this, a); }
      REND.pend[fn] = { pid, a, self: this }; try { REND_SIEMPRE[fn]?.(); } catch (e) {}
    };
    w.__rend = true; w.__orig = f; window[fn] = w;
  });
  const sw = window.switchAdminTab;
  if (typeof sw === 'function') window.switchAdminTab = function (...a) { const o = sw.apply(this, a); rendPonerAlDia(); return o; };
  const su = window.switchUserTab;
  if (typeof su === 'function') window.switchUserTab = function (...a) { const o = su.apply(this, a); rendPonerAlDia(); return o; };
  ['switchAsesorTab', 'abrirSelectorLote', 'cambiarModoCotizaciones', 'cambiarSubTabCotizVendedor'].forEach(fn => { const f = window[fn]; if (typeof f === 'function') window[fn] = function (...a) { const o = f.apply(this, a); rendPonerAlDia(); return o; }; });
  const hl = window.homeV2Legado;
  if (typeof hl === 'function') window.homeV2Legado = function (...a) { const o = hl.apply(this, a); rendPonerAlDia(); return o; };

  // 2) pestaña en segundo plano: no sincronizar Orange ni recalcular alertas; ponerse al día al volver
  ['sincronizarInventarioOrange', 'cargarDetalleCobrosCartera', 'cargarDetalleExpensas'].forEach(fn => {
    const f = window[fn]; if (typeof f !== 'function') return;
    window[fn] = function (silencioso, ...r) { if (silencioso === true && document.hidden) { REND.orange[fn] = true; return Promise.resolve(); } return f.call(this, silencioso, ...r); };
  });
  const dv = window.decVigilar;
  if (typeof dv === 'function') window.decVigilar = function (...a) { if (document.hidden && REND.vig && !(typeof dec !== 'undefined' && dec.abierto)) return REND.vig; return (REND.vig = dv.apply(this, a)); };
  const ps = window.padronSincronizar;
  if (typeof ps === 'function') window.padronSincronizar = function (...a) {
    if (document.hidden) return Promise.resolve();
    const f = [_decG('todosRegs'), _decG('cotizacionesData'), _decG('visitasProgramadasData'), typeof PADRON !== 'undefined' ? PADRON.data : null];
    if (REND.padFirma && f.every((x, i) => x === REND.padFirma[i])) { if (typeof PADRON !== 'undefined') PADRON.ult = Date.now(); return Promise.resolve(); }
    REND.padFirma = f; return ps.apply(this, a);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    Object.keys(REND.orange).forEach(fn => { delete REND.orange[fn]; try { window[fn](true); } catch (e) {} });
    setTimeout(rendPonerAlDia, 50);
  });

  // 3) animaciones de gráficos más cortas (menos trabajo del procesador)
  try { if (window.Chart?.defaults) { Chart.defaults.animation = Chart.defaults.animation || {}; Chart.defaults.animation.duration = 300; } } catch (e) {}
})();

/* ── Acceso por rol: un usuario restringido (ej. Cartera) solo puede abrir sus paneles, venga de donde venga la orden
   (menú, buscador Ctrl+K, tarjetas de Inicio, alertas). Tampoco calcula en segundo plano lo que no ve. ── */
(function () {
  const sw = window.switchAdminTab;
  if (typeof sw === 'function') window.switchAdminTab = function (id, ...r) {
    const P = window._tabsPermitidos;
    if (P && !P.has(id)) id = P.has('cartera') ? 'cartera' : ([...P][0] || 'home');
    return sw.call(this, id, ...r);
  };
  const ea = window.entrarAdmin;
  if (typeof ea === 'function') window.entrarAdmin = function (...a) { if (typeof modoAdmin !== 'undefined' && modoAdmin) window._tabsPermitidos = null; return ea.apply(this, a); };
  const ez = window.entrarAsesor;
  if (typeof ez === 'function') window.entrarAsesor = function (...a) { window._tabsPermitidos = null; return ez.apply(this, a); };   // se vuelve a calcular según el rol
  const dv = window.decVigilar;
  if (typeof dv === 'function') window.decVigilar = function (...a) { const P = window._tabsPermitidos; if (P && !P.has('decisiones')) return []; return dv.apply(this, a); };
})();


