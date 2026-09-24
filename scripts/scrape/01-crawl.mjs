// Paso 01 — Rastreo completo de la web actual.
// Semillas: inventario_paginas.csv + home. Sigue href, src, onclick (xzy/xz/window.open/location.href),
// rutas dentro de <script> y atributos de estilo. Guarda el HTML bruto en migracion/raw/ y
// genera migracion/crawl.json con páginas, recursos y referencias encontradas.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {
  ORIGIN, RECURSOS, MIGRACION, RAW_DIR, CACHE_DIR, readCsv, writeJSON, readJSON, ensureDir, decodeHtml,
  cleanRef, absolutize, esPropio, keyOf, pathOf, clasificar, sanearRuta, fetchRetry, pool, log, extOf,
} from './lib.mjs';

const ESTADO_FILE = path.join(CACHE_DIR, 'estado-urls.json');
const estado = readJSON(ESTADO_FILE, {}); // key -> {status, type, length, finalUrl, error}
const REFRESH = process.argv.includes('--refresh');

const paginas = new Map(); // key -> info de página
const recursos = new Map(); // key -> {url, tipo, apariciones: []}
const cola = [];

function rawFileFor(u) {
  let p = pathOf(u);
  if (p.endsWith('/')) p += 'index';
  let rel = sanearRuta(p.replace(/\?/g, '__').replace(/[=&]/g, '_'));
  return path.join(RAW_DIR, `${rel || 'index'}.html`);
}

function encolarPagina(u, origen) {
  const k = keyOf(u);
  if (!paginas.has(k)) {
    paginas.set(k, { url: u.href, ruta: pathOf(u), origen: [origen], estado: null });
    cola.push(k);
  } else if (!paginas.get(k).origen.includes(origen) && paginas.get(k).origen.length < 40) {
    paginas.get(k).origen.push(origen);
  }
}

function registrarRecurso(u, tipo, aparicion) {
  const k = u.protocol.startsWith('http') ? keyOf(u) : u.href;
  if (!recursos.has(k)) recursos.set(k, { url: u.href, clave: k, tipo, apariciones: [] });
  const r = recursos.get(k);
  if (!r.apariciones.some((a) => a.pagina === aparicion.pagina && a.atributo === aparicion.atributo && a.bruto === aparicion.bruto)) {
    r.apariciones.push(aparicion);
  }
}

async function estadoDe(u, { get = false } = {}) {
  const k = keyOf(u);
  const c = estado[k];
  if (!REFRESH && c && !(get && !c.viaGet) && !(c.status === 300 && !c.sugerencias)) return c;
  let res = await fetchRetry(u.href, { method: get ? 'GET' : 'HEAD', retries: 2, timeout: 45000 });
  if (!get && (res.status === 405 || res.status === 403 || res.status === 0)) {
    res = await fetchRetry(u.href, { method: 'GET', retries: 1, timeout: 90000, headers: { Range: 'bytes=0-0' } });
  }
  const e = {
    status: res.status === 206 ? 200 : res.status,
    type: res.headers['content-type'] ?? null,
    length: res.headers['content-range']?.split('/')[1] ? Number(res.headers['content-range'].split('/')[1]) : (res.headers['content-length'] ? Number(res.headers['content-length']) : null),
    finalUrl: res.finalUrl,
    error: res.error ?? null,
    viaGet: get,
  };
  if (e.status === 300) {
    // Apache mod_speling: el archivo no existe; ofrece nombres parecidos. Se guardan como sugerencia.
    const g = await fetchRetry(u.href, { retries: 1, timeout: 30000 });
    e.sugerencias = [...g.buf.toString('latin1').matchAll(/<li><a href="([^"]+)"/g)].map((m) => ORIGIN + m[1]);
  }
  estado[k] = e;
  return { ...e, _res: res };
}

/** Candidatos de resolución para una referencia relativa. */
function candidatos(ref, pageUrl, ctx) {
  const esRelativa = !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith('/') && !ref.startsWith('//');
  const lista = [];
  const add = (u, como) => { if (u && !lista.some((x) => x.u.href === u.href)) lista.push({ u, como }); };
  if (!esRelativa) {
    add(absolutize(ref, pageUrl), 'absoluta');
  } else {
    const aPagina = absolutize(ref, pageUrl);
    const aRaiz = absolutize(ref, ORIGIN + '/');
    // Las llamadas xzy()/xz() cargan el fragmento dentro de la home: su base real es la raíz.
    if (ctx === 'carga-ajax') { add(aRaiz, 'relativa-raiz'); add(aPagina, 'relativa-pagina'); }
    else { add(aPagina, 'relativa-pagina'); add(aRaiz, 'relativa-raiz'); }
  }
  // Corrección de segmentos duplicados (/cartografia/cartografia/… → /cartografia/…)
  for (const { u } of [...lista]) {
    if (!esPropio(u)) continue;
    const segs = u.pathname.split('/');
    const dedup = segs.filter((s, i) => !(i > 0 && s && s === segs[i - 1]));
    if (dedup.length !== segs.length) {
      const c = new URL(u.href); c.pathname = dedup.join('/'); add(c, 'corregida-segmento-duplicado');
    }
  }
  // Nombres de archivo con tildes guardados en Latin-1 en el servidor.
  for (const { u, como } of [...lista]) {
    if (!esPropio(u) || !/%[89A-F][0-9A-F]/i.test(u.pathname)) continue;
    let dec; try { dec = decodeURIComponent(u.pathname); } catch { continue; }
    const latin = [...dec].map((ch) => {
      const cp = ch.codePointAt(0);
      return cp > 127 && cp < 256 ? '%' + cp.toString(16).toUpperCase().padStart(2, '0') : ch;
    }).join('');
    const c = new URL(u.href); c.pathname = latin; add(c, `${como}+latin1`);
  }
  return lista;
}

const RE_RUTA_EN_TEXTO = /['"]([^'"\s<>]{2,300}?\.(?:php|html?|pdf|docx?|odt|ods|xlsx?|csv|pptx?|zip|rar|kmz|kml|mp4|webm|gif|jpe?g|png|svg|webp)(?:\?[^'"\s<>]*)?)['"]/gi;
const RE_LLAMADA = /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\(\s*['"]([^'"]+)['"]/g;
const RE_ASIGNACION = /\b(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/g;

function extraerReferencias($) {
  const refs = [];
  const push = (bruto, atributo, ctx, texto = '', elemento = '') => {
    const c = cleanRef(bruto);
    if (c) refs.push({ bruto: String(bruto).trim(), limpio: c, atributo, ctx, texto: texto.replace(/\s+/g, ' ').trim().slice(0, 300), elemento });
  };
  const ATTRS = ['href', 'src', 'data-src', 'data-href', 'poster', 'data', 'action', 'background', 'data-url', 'data-video'];
  $('*').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if (tag === 'link' || tag === 'meta') {
      // Hojas de estilo/iconos: se registran como assets.
      if (tag === 'link' && $el.attr('href')) push($el.attr('href'), 'href', 'asset', '', tag);
      return;
    }
    const texto = tag === 'a' ? $el.text() || $el.attr('title') || $el.find('img').attr('alt') || '' : ($el.attr('alt') || $el.attr('title') || '');
    for (const a of ATTRS) {
      const v = $el.attr(a);
      if (v) push(v, a, tag === 'iframe' ? 'iframe' : 'atributo', texto, tag);
    }
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach((p) => push(p.trim().split(/\s+/)[0], 'srcset', 'atributo', texto, tag));
    const style = $el.attr('style');
    if (style) for (const m of style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) push(m[1], 'style', 'atributo', texto, tag);
    for (const attr of Object.keys(el.attribs ?? {})) {
      if (!attr.startsWith('on')) continue;
      const code = $el.attr(attr);
      const textoEl = $el.text() || texto;
      for (const m of code.matchAll(RE_LLAMADA)) {
        const fn = m[1];
        const ctx = /^(xzy|xz)$/i.test(fn) ? 'carga-ajax' : /open$/i.test(fn) ? 'window-open' : `onclick-${fn}`;
        if (/[./]/.test(m[2])) push(m[2], attr, ctx, textoEl, tag);
      }
      for (const m of code.matchAll(RE_ASIGNACION)) push(m[1], attr, 'location', textoEl, tag);
    }
  });
  $('script').each((_, el) => {
    const code = $(el).html() ?? '';
    for (const m of code.matchAll(RE_LLAMADA)) if (/^(xzy|xz)$/i.test(m[1])) push(m[2], 'script', 'carga-ajax');
    for (const m of code.matchAll(RE_ASIGNACION)) push(m[1], 'script', 'location');
    for (const m of code.matchAll(RE_RUTA_EN_TEXTO)) push(m[1], 'script', 'script');
  });
  $('style').each((_, el) => {
    for (const m of ($(el).html() ?? '').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) push(m[1], 'style', 'asset');
  });
  // HTML comentado: no se ve en la web actual, pero se registra (ctx 'comentario') para decidir con el cliente.
  const comentarios = [];
  $.root().find('*').addBack().contents().each((_, n) => { if (n.type === 'comment') comentarios.push(n.data); });
  for (const c of comentarios) {
    const $c = cheerio.load(`<div>${c}</div>`);
    $c('a[href], img[src], iframe[src], source[src], video[src]').each((_, el) => {
      const v = $c(el).attr('href') ?? $c(el).attr('src');
      push(v, $c(el).attr('href') ? 'href' : 'src', 'comentario', $c(el).text() || $c(el).attr('alt') || '', el.tagName);
    });
    for (const m of c.matchAll(RE_LLAMADA)) if (/^(xzy|xz)$/i.test(m[1])) push(m[2], 'onclick', 'comentario');
  }
  return refs;
}

async function procesarPagina(k) {
  const pag = paginas.get(k);
  const u = new URL(pag.url);
  const res = await fetchRetry(u.href, { retries: 3, timeout: 90000 });
  pag.estado = res.status;
  pag.finalUrl = res.finalUrl;
  pag.tipoContenido = res.headers['content-type'] ?? null;
  pag.bytes = res.buf.length;
  estado[k] = { status: res.status, type: pag.tipoContenido, length: res.buf.length, finalUrl: res.finalUrl, error: res.error ?? null, viaGet: true };
  if (res.status !== 200 || !/html|text\/plain/i.test(pag.tipoContenido ?? 'text/html')) {
    log('✗', res.status, pag.ruta, res.error ?? '');
    return;
  }
  const { text: html, encoding } = decodeHtml(res.buf);
  pag.codificacion = encoding;
  const rawFile = rawFileFor(u);
  ensureDir(path.dirname(rawFile));
  fs.writeFileSync(rawFile, html, 'utf8');
  pag.raw = path.relative(MIGRACION, rawFile).replace(/\\/g, '/');

  const $ = cheerio.load(html);
  pag.titulo = $('title').first().text().trim();
  const refs = extraerReferencias($);
  pag.referencias = [];

  for (const ref of refs) {
    const cands = candidatos(ref.limpio, u.href, ref.ctx);
    if (!cands.length) continue;
    let elegido = null;
    const tipo0 = clasificar(cands[0].u);
    if (['externo', 'ip-interna', 'email', 'telefono', 'otro'].includes(tipo0)) {
      elegido = { ...cands[0], estado: null };
    } else {
      for (const c of cands) {
        if (!esPropio(c.u)) continue;
        const tipo = clasificar(c.u);
        if (tipo === 'asset' && ref.ctx === 'asset') { elegido = { ...c, estado: null }; break; }
        const st = await estadoDe(c.u);
        if (st.status === 200) { elegido = { ...c, estado: 200 }; break; }
      }
      if (!elegido) elegido = { ...cands[0], estado: estado[keyOf(cands[0].u)]?.status ?? null, como: 'rota' };
    }
    const tipo = clasificar(elegido.u);
    const aparicion = { pagina: pag.ruta, bruto: ref.bruto, atributo: ref.atributo, ctx: ref.ctx, texto: ref.texto, elemento: ref.elemento, resolucion: elegido.como };
    pag.referencias.push({ ...aparicion, url: elegido.u.href, tipo, estado: elegido.estado });
    if (tipo === 'pagina') {
      if (elegido.como !== 'rota') encolarPagina(elegido.u, pag.ruta);
      else registrarRecurso(elegido.u, 'pagina-rota', aparicion);
    }
    if (tipo !== 'pagina') registrarRecurso(elegido.u, ref.ctx === 'iframe' && !esPropio(elegido.u) ? 'iframe-externo' : tipo, aparicion);
  }
  log('✓', pag.ruta, `(${refs.length} refs)`);
}

// ---------------------------------------------------------------------------
const invPaginas = readCsv(path.join(RECURSOS, 'inventario_paginas.csv'));
const invDocs = readCsv(path.join(RECURSOS, 'inventario_documentos.csv'));

encolarPagina(new URL(ORIGIN + '/'), 'semilla-home');
for (const p of invPaginas) {
  const u = absolutize(p.url || p.ruta, ORIGIN + '/');
  if (u) encolarPagina(u, 'inventario');
}
log(`Semillas: ${cola.length} páginas`);

let procesadas = 0;
while (cola.length) {
  const lote = cola.splice(0, cola.length);
  await pool(lote, 4, async (k) => { await procesarPagina(k); procesadas++; });
  writeJSON(ESTADO_FILE, estado);
  log(`— lote terminado: ${procesadas} páginas procesadas, ${cola.length} nuevas en cola`);
}

// Documentos del inventario que no hayan aparecido en el rastreo.
for (const d of invDocs) {
  const u = absolutize(d.url_documento, ORIGIN + '/');
  if (!u) continue;
  const k = keyOf(u);
  if (!recursos.has(k)) {
    registrarRecurso(u, clasificar(u), { pagina: d.paginas_donde_aparece, bruto: d.url_documento, atributo: 'inventario', ctx: 'inventario', texto: '', resolucion: 'inventario' });
    recursos.get(k).soloInventario = true;
  }
  recursos.get(k).enInventario = true;
}

writeJSON(ESTADO_FILE, estado);
const salida = {
  generado: new Date().toISOString(),
  paginas: [...paginas.values()].sort((a, b) => a.ruta.localeCompare(b.ruta, 'es')),
  recursos: [...recursos.values()].sort((a, b) => a.clave.localeCompare(b.clave, 'es')),
};
writeJSON(path.join(MIGRACION, 'crawl.json'), salida);

const porTipo = {};
for (const r of salida.recursos) porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
const ok = salida.paginas.filter((p) => p.estado === 200).length;
log(`Páginas: ${salida.paginas.length} (200: ${ok}) · Recursos por tipo:`, porTipo);
