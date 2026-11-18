# Plataforma Comercial · Urubó Village

Dirección: https://uvcomercial.github.io/

## Cómo está organizado el código

- `index.html` — pantallas de la plataforma y conexión con Firebase (ingreso con Microsoft).
- `styles.css`, `tema.css` — estilos generales y tema tierra.
- `css/` — estilos de cada módulo (cobranza CRM, marketing, ingreso, seguridad, cotizador, cerebro, decisiones).
- `js/` — el código, un archivo por módulo. **Se cargan en orden** (el número del nombre); no cambiar el orden.

| Archivo | Qué tiene |
|---|---|
| 01-base | avisos, utilidades, datos compartidos |
| 02-panel-control | política de descuentos, metas, guardar visita |
| 03-ventas-tendencia / 04-ventas-dashboard / 06-ventas-reportes | panel Ventas y sus reportes |
| 05-documentos | materia reservada y solicitud de contrato |
| 07-inventario | lotes |
| 08-resumen-y-usuarios | resumen ejecutivo, vista de cada usuario |
| 09-expensas-analisis / 11-cobranza-vistas | expensas |
| 10-cartera | cartera y cobranza |
| 12-directorio | informe para Directorio |
| 13-cobranza-crm | seguimiento de cobranza |
| 14-marketing | planilla de leads |
| 15-interfaz | menú y comportamiento general |
| 16-seguridad | sesiones, bloqueo, accesos con Microsoft |
| 17-cotizador | cotizador y vista pública de la cotización |
| 18-cerebro | Andrómeda |
| 19-decisiones-inicio | tablero de decisiones |
| 20-embudo-crm | embudo, call center, padrón de clientes |
| 21-rendimiento | dibuja solo el panel que se está viendo |
| 22-parte-semanal | Inicio: parte semanal de Gerencia |
| 23-tco | TCO del BCB: referencia arriba, histórico y materia reservada |
| 24-recordatorios | recordatorios de cobranza con mensaje para WhatsApp y QR |

Al modificar un archivo, cambiar su `?v=` en `index.html` para que los navegadores bajen la versión nueva.

## TCO del BCB

`tco.json` guarda el tipo de cambio oficial de cada día. Lo completa sola la tarea `.github/workflows/tco.yml`
(lee https://www.bcb.gob.bo/bcb_tco_publico_ultima_cotizacion.php a las 08:20, 12:20 y 17:20 de Bolivia).
Nunca borra ni cambia un día ya guardado. Antes del 27/06/2026 rige el TC fijo de 6,96.
