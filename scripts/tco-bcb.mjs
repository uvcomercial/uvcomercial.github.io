// Lee la página del BCB (guardada por el workflow en bcb.html) y agrega al histórico tco.json
// los días que todavía no estén. Nunca borra ni cambia un día ya guardado.
import fs from 'node:fs';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const buf = fs.readFileSync(process.argv[2] || 'bcb.html');
let html = buf.toString('utf8');
if (html.includes('\uFFFD')) html = buf.toString('latin1');   // la página puede venir en ISO-8859-1
const texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').toLowerCase();

const nuevos = {};
const re = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\s+(\d{1,2},\d{2})/g;
let m;
while ((m = re.exec(texto))) {
  const mes = MESES[m[3]]; if (!mes) continue;
  const fecha = `${m[4]}-${String(mes).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const valor = parseFloat(m[5].replace(',', '.'));
  if (valor > 3 && valor < 50) nuevos[fecha] = valor;
}
// cotización principal ("Bs 11,75/$us" + "vigencia: miércoles 18 de noviembre de 2026")
const vig = texto.match(/bs\s*(\d{1,2},\d{2})\s*\/\s*\$us.*?vigencia:\s*\S+\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
if (vig && MESES[vig[3]]) nuevos[`${vig[4]}-${String(MESES[vig[3]]).padStart(2, '0')}-${vig[2].padStart(2, '0')}`] = parseFloat(vig[1].replace(',', '.'));

const n = Object.keys(nuevos).length;
if (!n) { console.error('No se encontró ningún TCO en la página del BCB (¿cambió el formato?).'); process.exit(1); }

const hist = JSON.parse(fs.readFileSync('tco.json', 'utf8'));
let agregados = 0;
for (const [f, v] of Object.entries(nuevos)) if (!(f in hist.dias)) { hist.dias[f] = v; agregados++; }
hist.dias = Object.fromEntries(Object.entries(hist.dias).sort(([a], [b]) => a.localeCompare(b)));
if (agregados) hist.actualizado = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
fs.writeFileSync('tco.json', JSON.stringify(hist, null, 1) + '\n');
console.log(`Leídos ${n} días del BCB · agregados ${agregados} · último ${Object.keys(hist.dias).pop()} = ${Object.values(hist.dias).pop()}`);
