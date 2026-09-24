// Fase 5 — Verificación de la migración. Genera migracion/informe-cobertura.md.
// Requiere: `npm run build` hecho (dist/) y, para las comprobaciones HTTP, el servidor en marcha
// (`npm run preview` o `npm run dev`) en http://127.0.0.1:4321 (o VERIFICAR_URL).
// Opcional: migracion/qa/navegador.json (axe-core, desbordamiento, Lighthouse) de scripts/verify/navegador.py
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import YAML from 'yaml';
import { ROOT, MIGRACION, readJSON, readCsv, pool, log } from '../scrape/lib.mjs';
import { carpetaMedios } from '../../src/lib/vite-medios.mjs';

const DIST = path.join(ROOT, 'dist');
const BASE = process.env.VERIFICAR_URL ?? 'http://127.0.0.1:4321';
const paginas = readJSON(path.join(MIGRACION, 'paginas.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'));
const mapa = readCsv(path.join(MIGRACION, 'mapa-urls.csv'));
const htaccess = fs.readFileSync(path.join(ROOT, 'public', '.htaccess'), 'utf8');
const navegador = readJSON(path.join(MIGRACION, 'qa', 'navegador.json'), null);
const MEDIOS = carpetaMedios();
const crawlPorRuta = new Map(readJSON(path.join(MIGRACION, 'crawl.json')).paginas.map((p) => [p.ruta, p]));
const nuevaDe = new Map(mapa.filter((f) => f.tipo === 'pagina' && !f.nota).map((f) => [f.ruta_antigua, f.url_nueva]));

const htmlDe = (url) => {
  const f = path.join(DIST, ...decodeURI(url).split('/').filter(Boolean), 'index.html');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};
const norm = (s) => s.normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
function textoVisible(html, selector = 'body') {
  const $ = cheerio.load(html);
  $('script, style, noscript, template, [aria-hidden="true"]').remove();
  const $b = $(selector).first().clone();
  $b.find('br').replaceWith(' ');
  $b.find('p, div, li, td, th, tr, h1, h2, h3, h4, h5, h6, dt, dd, section, article, header, footer, blockquote, pre, table, ul, ol, option, summary').each((_, el) => { $(el).append(' '); });
  return norm($b.text());
}
const tokens = (t) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const bolsa = (arr) => arr.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map());

// ------------------------------------------------------------------ 1. Rutas y redirecciones
const reglas = new Set([...htaccess.matchAll(/RewriteRule \^(.+?)\$ /g)].map((m) => '/' + m[1].replace(/\\(.)/g, '$1')));
const rutas = paginas.map((p) => {
  const nueva = nuevaDe.get(p.ruta);
  return { ruta: p.ruta, nueva, pagina: !!(nueva && htmlDe(nueva)), redireccion: p.ruta === '/' || reglas.has(p.ruta) };
});
log(`Rutas: ${rutas.filter((r) => r.pagina && r.redireccion).length}/${rutas.length}`);

// ------------------------------------------------------------------ 2. Documentos (fichero + HTTP 200)
const docs = medios.filter((m) => ['documento', 'video'].includes(m.tipo) && m.status === 200);
const inexistentesOrigen = medios.filter((m) => ['documento', 'video'].includes(m.tipo) && m.status !== 200 && m.rutaAntigua !== '/public.pdf');
let servidor = true;
try { await fetch(BASE + '/', { method: 'HEAD' }); } catch { servidor = false; }
const resDocs = await pool(docs, 8, async (m) => {
  const f = path.join(MEDIOS, ...m.rutaNueva.split('/').filter(Boolean));
  const existe = fs.existsSync(f);
  const tamOk = existe && fs.statSync(f).size === m.bytes;
  let http = null;
  if (servidor) { try { http = (await fetch(BASE + encodeURI(m.rutaNueva), { method: 'HEAD' })).status; } catch { http = 0; } }
  return { ruta: m.rutaNueva, antigua: m.rutaAntigua, existe, tamOk, http, enInventario: m.enInventario };
});
const imgs = medios.filter((m) => m.tipo === 'imagen' && m.status === 200);
const imgsOk = imgs.filter((m) => fs.existsSync(path.join(DIST, ...m.rutaNueva.split('/').filter(Boolean))));
log(`Documentos: ${resDocs.filter((d) => d.existe && d.tamOk).length}/${docs.length} en disco · HTTP 200: ${resDocs.filter((d) => d.http === 200).length}`);

// ------------------------------------------------------------------ 3. Texto página a página
const htmlNoticias = fs.readdirSync(path.join(DIST, 'actualidad', 'noticias'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'pagina').map((d) => htmlDe(`/actualidad/noticias/${d.name}/`)).filter(Boolean);
const COMPUESTAS = {
  '/noticias.php': () => htmlNoticias.map((h) => textoVisible(h, '#contenido')).join(' '),
  '/': () => [htmlDe('/'), htmlDe('/planificacion/participacion-publica/'), htmlDe('/buscar/')].filter(Boolean).map((h) => textoVisible(h)).join(' '),
};
// Texto de reserva dentro de <video> del reproductor antiguo: ningún navegador actual lo muestra.
const INVISIBLE = [/Para ver este vídeo, debe activar la ejecución de JavaScript en su navegador web preferido\.?/g];
const ERRATAS_APLICADAS = readJSON(path.join(MIGRACION, 'cache', 'erratas-aplicadas.json'), []);
// Diferencias revisadas a mano y justificadas (se listan en el informe con su motivo).
const JUSTIFICADAS = {
  '/consejo.php': 'Pie antiguo repetido en la página («1º PLANTA», «13:30»). Se sustituye por el pie común con los datos facilitados por el cliente («1ª planta», «13:00»). Discrepancia de horario registrada como duda D en erratas-corregidas.md.',
  '/economico.php': 'Igual que /consejo.php: pie antiguo repetido («1º PLANTA», «13:30»).',
};
const textos = paginas.map((p) => {
  let orig = fs.readFileSync(path.join(MIGRACION, 'texto-plano', `${p.slug}.txt`), 'utf8');
  for (const re of INVISIBLE) orig = orig.replace(re, ' ');
  // Las erratas corregidas (registradas en erratas-corregidas.md) se aplican también al original antes de comparar.
  for (const [url, original, corregido] of ERRATAS_APLICADAS) if (url === nuevaDe.get(p.ruta)) orig = orig.split(original).join(corregido);
  const nueva = nuevaDe.get(p.ruta);
  const html = nueva ? htmlDe(nueva) : null;
  const txtNuevo = COMPUESTAS[p.ruta]?.() ?? (html ? textoVisible(html) : '');
  const to = tokens(orig); const bn = bolsa(tokens(txtNuevo)); const bo = bolsa(to);
  let faltan = 0; const ejemplos = [];
  for (const [w, c] of bo) { const d = c - (bn.get(w) ?? 0); if (d > 0) { faltan += d; if (ejemplos.length < 8) ejemplos.push(w); } }
  return { ruta: p.ruta, nueva, palabras: to.length, faltan, dif: to.length ? faltan / to.length : 0, ejemplos, justificacion: JUSTIFICADAS[p.ruta] ?? null };
});
const conDif = textos.filter((t) => t.dif > 0.02 && !t.justificacion);
const justificadas = textos.filter((t) => t.dif > 0.02 && t.justificacion);
log(`Texto: ${textos.length - conDif.length}/${textos.length} páginas con diferencia ≤ 2 %`);

// ------------------------------------------------------------------ 4. Recuentos de tablas, imágenes y vídeos
const iconos = new Set(Object.entries(readJSON(path.join(ROOT, 'src', 'data', 'imagenes.json'))).filter(([, v]) => v.w <= 48 && v.h <= 48).map(([k]) => k));
const recuentos = paginas.map((p) => {
  const nueva = nuevaDe.get(p.ruta);
  const html = nueva ? htmlDe(nueva) : null;
  if (!html) return { ruta: p.ruta, ok: false };
  const $ = cheerio.load(html);
  const $m = $('#contenido');
  const fm = YAML.parse(fs.readFileSync(path.join(MIGRACION, p.archivo), 'utf8').split(/^---$/m)[1]);
  // Imágenes de contenido (no iconos, no fondos CSS ni rutas dentro de scripts).
  const soloDecorativas = new Set((crawlPorRuta.get(p.ruta)?.referencias ?? []).filter((r) => r.tipo === 'imagen').reduce((m, r) => {
    const deco = r.atributo === 'style' || r.ctx === 'script' || r.ctx === 'asset';
    m.set(r.url, (m.get(r.url) ?? true) && deco); return m;
  }, new Map()).entries().filter(([, d]) => d).map(([u]) => u));
  const imgsOrig = (fm.imagenes ?? []).filter((i) => i.ruta_nueva && !iconos.has(i.ruta_nueva) && !soloDecorativas.has(i.url_antigua)).map((i) => i.ruta_nueva);
  const htmlComparado = p.ruta === '/noticias.php' ? htmlNoticias.join('') : p.ruta === '/' ? html + (htmlDe('/planificacion/participacion-publica/') ?? '') : html;
  const imgsFaltan = [...new Set(imgsOrig)].filter((s) => !htmlComparado.includes(s) && !htmlComparado.includes(encodeURI(s)));
  const tablasNuevas = $m.find('table').length;
  const videosNuevos = $m.find('video').length + $m.find('a[href$=".mp4"]').length + $m.find('.fachada').length;
  return { ruta: p.ruta, nueva, tablas: [p.n_tablas, tablasNuevas], videos: [p.n_videos + p.n_iframes, videosNuevos], imagenesFaltan: imgsFaltan };
});
const recFallos = recuentos.filter((r) => r.imagenesFaltan?.length || (r.tablas && r.tablas[1] < r.tablas[0] && !['/noticias.php', '/info_public.php', '/el_consejo/juntas.php'].includes(r.ruta)));

// ------------------------------------------------------------------ 5. Enlaces internos rotos
const htmls = [];
const recorrer = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['pagefind', 'visores', '_astro'].includes(e.name)) recorrer(p); } else if (e.name.endsWith('.html')) htmls.push(p); } };
recorrer(DIST);
const rotos = new Map();
const existeDestino = (u) => {
  let p = u.split('#')[0].split('?')[0];
  try { p = decodeURI(p); } catch { /* */ }
  if (!p || p === '/') return true;
  const partes = p.split('/').filter(Boolean);
  if (/^\/(documentos|videos)\//.test(p)) return fs.existsSync(path.join(MEDIOS, ...partes));
  if (fs.existsSync(path.join(DIST, ...partes)) && fs.statSync(path.join(DIST, ...partes)).isFile()) return true;
  return fs.existsSync(path.join(DIST, ...partes, 'index.html'));
};
for (const f of htmls) {
  const $ = cheerio.load(fs.readFileSync(f, 'utf8'));
  $('a[href], img[src], source[src], video[src], link[href]').each((_, el) => {
    const u = $(el).attr('href') ?? $(el).attr('src');
    if (!u || !u.startsWith('/') || u.startsWith('//') || u.startsWith('/pagefind/') || u.startsWith('/_astro/')) return;
    if (!existeDestino(u)) { const k = u.split('#')[0]; if (!rotos.has(k)) rotos.set(k, new Set()); rotos.get(k).add('/' + path.relative(DIST, f).replace(/\\/g, '/').replace(/index\.html$/, '')); }
  });
}
log(`Enlaces internos rotos: ${rotos.size}`);

// ------------------------------------------------------------------ informe
const externosMd = fs.existsSync(path.join(MIGRACION, 'enlaces-externos-rotos.md')) ? fs.readFileSync(path.join(MIGRACION, 'enlaces-externos-rotos.md'), 'utf8') : '';
const nExt = externosMd.match(/Con incidencias: \*\*(\d+)\*\*/)?.[1] ?? '?';
const ok = (c) => (c ? '✅' : '❌');
const pct = (a, b) => `${a}/${b}`;
const rutasOk = rutas.filter((r) => r.pagina && r.redireccion).length;
const docsOk = resDocs.filter((d) => d.existe && d.tamOk && (!servidor || d.http === 200)).length;
let md = `# Informe de cobertura de la migración

Generado el ${new Date().toLocaleString('es-ES')} por \`scripts/verify/verificar.mjs\`${servidor ? ` contra ${BASE}` : ' (sin servidor: comprobación HTTP omitida)'}.

## Criterios de aceptación

| | Criterio | Resultado |
|---|---|---|
| ${ok(rutasOk === rutas.length)} | Las ${rutas.length} rutas antiguas tienen página nueva y redirección 301 | ${pct(rutasOk, rutas.length)} |
| ${ok(docsOk === docs.length)} | Los documentos existentes en origen responden 200 en su nueva ruta (mismo tamaño en bytes) | ${pct(docsOk, docs.length)} |
| ${ok(imgsOk.length === imgs.length)} | Imágenes migradas | ${pct(imgsOk.length, imgs.length)} |
| ${ok(conDif.length === 0)} | Diferencia de texto ≤ 2 % página a página | ${pct(textos.length - conDif.length - justificadas.length, textos.length)}${justificadas.length ? ` + ${justificadas.length} justificadas (ver abajo)` : ''} |
| ${ok(recFallos.length === 0)} | Tablas, imágenes y vídeos migrados (recuento por página) | ${pct(recuentos.length - recFallos.length, recuentos.length)} |
| ${ok(rotos.size === 0)} | Cero enlaces internos rotos | ${rotos.size} rotos |
| ℹ️ | Enlaces externos con incidencias (listados aparte, no se borran) | ${nExt} · ver \`enlaces-externos-rotos.md\` |
${navegador ? `| ${ok((navegador.axe?.criticos ?? 1) === 0)} | axe-core sin errores críticos | ${navegador.axe?.criticos ?? '—'} críticos · ${navegador.axe?.graves ?? '—'} graves en ${navegador.axe?.paginas ?? 0} páginas |
| ${ok((navegador.desbordamiento?.fallos ?? []).length === 0)} | Sin desbordamiento horizontal a 360 px | ${(navegador.desbordamiento?.fallos ?? []).length} páginas con desbordamiento de ${navegador.desbordamiento?.revisadas ?? 0} |
| ${navegador.lighthouse?.length ? ok(navegador.lighthouse.every((l) => l.rendimiento >= 90 && l.accesibilidad >= 95 && l.buenas >= 90 && l.seo >= 90)) : '⚪'} | Lighthouse móvil ≥ 90 (≥ 95 accesibilidad) | ${navegador.lighthouse?.length ? navegador.lighthouse.map((l) => `\`${l.url}\` R${l.rendimiento}/A${l.accesibilidad}/BP${l.buenas}/SEO${l.seo}`).join(' · ') : 'no ejecutado'} |
| ${navegador.capturas?.length ? '✅' : '⚪'} | Revisión responsive 360 / 768 / 1280 / 1920 px | ${navegador.capturas?.length ?? 0} capturas en \`migracion/qa/capturas/\` |` : '| ⚪ | Pruebas en navegador (axe-core, responsive, Lighthouse) | ejecutar `python scripts/verify/navegador.py` |'}

## Documentos que no existen en el servidor de origen (${inexistentesOrigen.length})

No se pueden migrar sin el archivo. En la web nueva se muestran como «no disponible», sin borrar el enlace. Detalle en \`cobertura-fase1.md\`, apartado 4.

## Páginas con diferencia de texto > 2 % (${conDif.length})

${conDif.length ? `| Ruta antigua | Nueva | Palabras | Faltan | Dif. | Ejemplos de palabras no encontradas |\n|---|---|---|---|---|---|\n` + conDif.sort((a, b) => b.dif - a.dif).map((t) => `| \`${t.ruta}\` | \`${t.nueva}\` | ${t.palabras} | ${t.faltan} | ${(t.dif * 100).toFixed(1)} % | ${t.ejemplos.join(', ')} |`).join('\n') : 'Ninguna.'}

${justificadas.length ? `## Diferencias de texto revisadas y justificadas (${justificadas.length})\n\n| Ruta antigua | Dif. | Palabras no encontradas | Motivo |\n|---|---|---|---|\n${justificadas.map((t) => `| \`${t.ruta}\` | ${(t.dif * 100).toFixed(1)} % | ${t.ejemplos.join(', ')} | ${t.justificacion} |`).join('\n')}\n\n` : ''}Se excluye de la comparación el texto de reserva del reproductor de vídeo antiguo («Para ver este vídeo, debe activar la ejecución de JavaScript…»), que está dentro de \`<video>\` y ningún navegador actual muestra.

## Recuentos con diferencias (${recFallos.length})

${recFallos.length ? `| Ruta | Tablas (orig./nueva) | Imágenes no encontradas |\n|---|---|---|\n` + recFallos.map((r) => `| \`${r.ruta}\` | ${r.tablas?.join(' / ')} | ${(r.imagenesFaltan ?? []).slice(0, 4).map((s) => `\`${s}\``).join(', ')} |`).join('\n') : 'Ninguno.'}

## Enlaces internos rotos (${rotos.size})

${rotos.size ? [...rotos.entries()].slice(0, 80).map(([u, ps]) => `- \`${u}\` en ${[...ps].slice(0, 3).map((p) => `\`${p}\``).join(', ')}`).join('\n') : 'Ninguno.'}

${navegador?.desbordamiento?.fallos?.length ? `## Desbordamiento horizontal a 360 px\n\n${navegador.desbordamiento.fallos.map((f) => `- \`${f.url}\` (${f.ancho} px)`).join('\n')}\n` : ''}
${navegador?.axe?.detalle?.length ? `## axe-core: incidencias por regla\n\n| Regla | Impacto | Páginas |\n|---|---|---|\n${navegador.axe.detalle.map((d) => `| ${d.id} | ${d.impacto} | ${d.paginas.slice(0, 4).map((p) => `\`${p}\``).join(', ')} |`).join('\n')}\n` : ''}
`;
fs.writeFileSync(path.join(MIGRACION, 'informe-cobertura.md'), md, 'utf8');
fs.writeFileSync(path.join(MIGRACION, 'qa-verificacion.json'), JSON.stringify({ rutas, textos, recuentos, rotos: [...rotos.keys()], docs: resDocs.filter((d) => !(d.existe && d.tamOk && (!servidor || d.http === 200))) }, null, 2));
log('Informe: migracion/informe-cobertura.md');
