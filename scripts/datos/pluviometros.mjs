// Estaciones pluviométricas: lee la «Tabla 1.- Características principales de las estaciones pluviométricas»
// (/documentos/pdfs/pluviometro/pluviometria.xls) y genera public/datos/pluviometros.json para el mapa, la gráfica y la tabla.
// Las coordenadas X/Y UTM (huso 28) se convierten a latitud/longitud para el mapa (posición aproximada: el Excel no indica el datum).
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { ROOT, MIGRACION, readJSON, writeJSON, log } from '../scrape/lib.mjs';
import { carpetaMedios } from '../../src/lib/vite-medios.mjs';

const XLS = path.join(carpetaMedios(), 'documentos', 'pdfs', 'pluviometro', 'pluviometria.xls');
const fichas = readJSON(path.join(MIGRACION, 'cache', 'fichas-pluviometros.json'), {});

/** UTM (WGS84/GRS80, hemisferio norte) → [lat, lon]. */
function utmALatLon(x, y, huso = 28) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const X = x - 500000, M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = X / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1);
  return [lat * 180 / Math.PI, (huso * 6 - 183) + lon * 180 / Math.PI];
}

const filas = XLSX.utils.sheet_to_json(XLSX.readFile(XLS).Sheets['Pluviómetros'], { header: 1, raw: true, defval: '' });
const cab = filas[0].map((c) => String(c).trim());
const notas = filas.slice(1).map((r) => String(r.find((c) => c !== '') ?? '').trim()).filter((t) => t.startsWith('('));
const num = (v) => (v === '' || v == null ? null : Number(v));
const estaciones = filas.slice(1).filter((r) => typeof r[0] === 'number').map((r) => {
  const [lat, lon] = r[3] && r[4] ? utmALatLon(Number(r[3]), Number(r[4])) : [null, null];
  return {
    n: r[0], red: String(r[1]).trim() || null, nombre: String(r[2]).trim(), x: num(r[3]), y: num(r[4]), cota: num(r[5]),
    zona: String(r[6]).trim() || null, cuenca: num(r[7]), inicio: num(r[8]), fin: num(r[9]),
    media: num(r[10]), maxMensual: num(r[11]), maxDiaria: num(r[12]),
    lat: lat && +lat.toFixed(6), lon: lon && +lon.toFixed(6),
    ficha: fichas[r[0]]?.ruta ?? null, fichaBytes: fichas[r[0]]?.bytes ?? null,
  };
});
writeJSON(path.join(ROOT, 'public', 'datos', 'pluviometros.json'), { fuente: '/documentos/pdfs/pluviometro/pluviometria.xls', columnas: cab, notas, estaciones });
log(`Estaciones: ${estaciones.length} · con ficha: ${estaciones.filter((e) => e.ficha).length} · ejemplo:`, estaciones[3]);
