// Revisión automática de maquetación del contenido migrado (dist/): detecta restos de Markdown, tablas pobres,
// encabezados vacíos, bloques en mayúsculas, imágenes sin dimensiones, etc. Salida: migracion/qa/revision-contenido.json
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { ROOT, writeJSON, log } from '../scrape/lib.mjs';

const DIST = path.join(ROOT, 'dist');
const htmls = [];
const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['pagefind', 'visores', '_astro', 'admin', 'imagenes', 'datos', 'marca'].includes(e.name)) rec(p); } else if (e.name === 'index.html') htmls.push(p); } };
rec(DIST);
const res = [];
for (const f of htmls) {
  const url = '/' + path.relative(DIST, path.dirname(f)).replace(/\\/g, '/') + '/';
  const $ = cheerio.load(fs.readFileSync(f, 'utf8'));
  const $p = $('.prosa');
  if (!$p.length) continue;
  const txt = $p.text();
  const hall = [];
  const m1 = txt.match(/\*\*[^*\n]{1,80}\*\*|\]\(\/|\|\s*---|#{2,6}\s\S|\\\[|\\\||&[a-z]+;/g);
  if (m1) hall.push({ tipo: 'markdown-sin-convertir', ej: [...new Set(m1)].slice(0, 4) });
  $p.find('h2,h3,h4,h5,h6').each((_, h) => { if (!$(h).text().trim()) hall.push({ tipo: 'encabezado-vacio' }); });
  const mayus = $p.find('p').toArray().map((x) => $(x).text().trim()).filter((t) => t.length > 120 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚ]{5}/.test(t));
  if (mayus.length) hall.push({ tipo: 'parrafo-en-mayusculas', n: mayus.length, ej: mayus[0].slice(0, 80) });
  $p.find('table').each((_, t) => {
    const cols = Math.max(0, ...$(t).find('tr').toArray().map((tr) => $(tr).children().length));
    const filas = $(t).find('tr').length;
    if (cols === 1) hall.push({ tipo: 'tabla-una-columna', filas });
    if (filas === 1) hall.push({ tipo: 'tabla-una-fila', cols });
  });
  const sinDim = $p.find('img').toArray().filter((i) => !$(i).attr('width')).length;
  if (sinDim) hall.push({ tipo: 'imagen-sin-dimensiones', n: sinDim });
  const vacios = $p.find('p').toArray().filter((x) => !$(x).text().trim() && !$(x).find('img,picture,video,iframe').length).length;
  if (vacios > 2) hall.push({ tipo: 'parrafos-vacios', n: vacios });
  const largos = txt.match(/\S{70,}/g);
  if (largos) hall.push({ tipo: 'palabra-muy-larga', ej: largos.slice(0, 2).map((x) => x.slice(0, 60)) });
  const listaLinks = $p.find('p').toArray().filter((x) => $(x).find('a').length >= 6 && $(x).text().replace(/\s+/g, ' ').length / $(x).find('a').length < 45).length;
  if (listaLinks) hall.push({ tipo: 'enlaces-amontonados-en-parrafo', n: listaLinks });
  if (hall.length) res.push({ url, hallazgos: hall });
}
writeJSON(path.join(ROOT, 'migracion', 'qa', 'revision-contenido.json'), res);
const cuenta = {};
for (const r of res) for (const h of r.hallazgos) cuenta[h.tipo] = (cuenta[h.tipo] ?? 0) + 1;
log(`Páginas con .prosa revisadas: ${htmls.length} · con hallazgos: ${res.length}`, cuenta);
