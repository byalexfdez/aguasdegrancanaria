// Paso 04 — Extracción del contenido principal de cada página.
// Por cada página: migracion/contenido/<ruta>.md (frontmatter + Markdown),
// tablas como datos en migracion/tablas/<ruta>/tabla-NN.{json,csv} y
// texto plano normalizado en migracion/texto-plano/<ruta>.txt (para la verificación de la Fase 5).
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import {
  ORIGIN, ROOT, RECURSOS, MIGRACION, readCsv, readJSON, writeJSON, ensureDir, sanearRuta, toCsv, log, absolutize, keyOf, clasificar,
} from './lib.mjs';

const crawl = readJSON(path.join(MIGRACION, 'crawl.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'), []);
const inventario = Object.fromEntries(readCsv(path.join(RECURSOS, 'inventario_paginas.csv')).map((p) => [p.ruta, p]));
const medioPorUrl = new Map(medios.map((m) => [m.urlAntigua, m]));
const medioPorClave = new Map(medios.map((m) => { try { return [keyOf(new URL(m.urlAntigua)), m]; } catch { return [m.urlAntigua, m]; } }));

const CONTENIDO = path.join(MIGRACION, 'contenido');
const TABLAS = path.join(MIGRACION, 'tablas');
const TEXTO = path.join(MIGRACION, 'texto-plano');
const OCULTO = path.join(MIGRACION, 'contenido-oculto');
const incidencias = [];
const dimensionesSvg = {};

export function slugDeRuta(ruta) {
  if (ruta === '/' || ruta === '') return 'index';
  return sanearRuta(ruta.replace(/\.(php|html?|aspx?)$/i, '').replace(/\?/g, '__').replace(/[=&]/g, '_')) || 'index';
}

function seccionDe(ruta) {
  if (inventario[ruta]) return inventario[ruta].seccion_propuesta;
  const p = ruta.split('/')[1] ?? '';
  const mapa = { cartografia: 'Mapas y Cartografía', divulgacion: 'Divulgación', planhidro: 'Planificación', servicios: 'Servicios', presas: 'Infraestructuras › Presas', el_consejo: 'El Consejo', agua: 'Infraestructuras' };
  return mapa[p.replace(/\.php$/, '')] ?? 'Sin clasificar (nueva en rastreo)';
}

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', hr: '---' });
td.use(gfm);
td.keep(['iframe', 'video', 'audio', 'source', 'sup', 'sub']);
td.remove(['script', 'style', 'noscript', 'input', 'button', 'select', 'form > input']);
// Enlaces que envuelven bloques (tarjetas, botones): el texto se compacta en una línea para que el Markdown sea válido.
td.addRule('enlace', {
  filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href'),
  replacement: (content, node) => {
    const texto = content.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const href = node.getAttribute('href').replace(/ /g, '%20').replace(/\)/g, '%29').replace(/\(/g, '%28');
    const title = node.getAttribute('title');
    if (!texto) return `[](${href})`;
    return `[${texto}](${href}${title ? ` "${title.replace(/"/g, "'")}"` : ''})`;
  },
});
td.addRule('imagen', {
  filter: 'img',
  replacement: (_, node) => {
    const src = node.getAttribute('src') || '';
    if (!src) return '';
    const alt = (node.getAttribute('alt') || '').replace(/[[\]]/g, '');
    const title = node.getAttribute('title');
    return `![${alt}](${src.replace(/ /g, '%20')}${title ? ` "${title.replace(/"/g, "'")}"` : ''})`;
  },
});

// ---------------------------------------------------------------- tablas
function textoCelda($, el) {
  const $c = $(el).clone();
  $c.find('br').replaceWith('\n');
  return $c.text().replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function parsearTabla($, table) {
  const filas = $(table).find('> tr, > thead > tr, > tbody > tr, > tfoot > tr').toArray();
  const grid = [];
  const meta = [];
  const enlaces = [];
  filas.forEach((tr, r) => {
    grid[r] ??= []; meta[r] ??= [];
    let c = 0;
    $(tr).children('td, th').each((_, cell) => {
      while (grid[r][c] !== undefined) c++;
      const cs = Math.max(1, parseInt($(cell).attr('colspan') ?? '1', 10) || 1);
      const rs = Math.max(1, parseInt($(cell).attr('rowspan') ?? '1', 10) || 1);
      const txt = textoCelda($, cell);
      const $cell = $(cell);
      const negrita = txt && ($cell.find('b, strong').text().replace(/\s+/g, '') === txt.replace(/\s+/g, ''));
      const cabecera = cell.tagName === 'th' || !!$cell.attr('bgcolor') || !!$(tr).attr('bgcolor') || /background/i.test($cell.attr('style') ?? '');
      $cell.find('a[href]').each((_, a) => enlaces.push({ fila: r, columna: c, texto: $(a).text().replace(/\s+/g, ' ').trim(), url: $(a).attr('href') }));
      $cell.find('img[src]').each((_, im) => enlaces.push({ fila: r, columna: c, texto: $(im).attr('alt') ?? '', url: $(im).attr('src'), imagen: true }));
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        grid[r + i] ??= []; meta[r + i] ??= [];
        grid[r + i][c + j] = i === 0 && j === 0 ? txt : '';
        meta[r + i][c + j] = { origen: i === 0 && j === 0, cs, rs, negrita, cabecera, html: i === 0 && j === 0 ? $cell.html() : null };
      }
      c += cs;
    });
  });
  const ncols = Math.max(0, ...grid.map((f) => f.length));
  for (const f of grid) while (f.length < ncols) f.push('');
  for (const m of meta) while (m.length < ncols) m.push({ origen: true, cs: 1, rs: 1 });
  // Filas-título: una sola celda que abarca todas las columnas.
  const titulos = [];
  let inicio = 0;
  const titulosHtml = [];
  while (inicio < grid.length && ncols > 1 && meta[inicio][0]?.cs === ncols) { titulos.push(grid[inicio][0]); titulosHtml.push(meta[inicio][0].html); inicio++; }
  // Filas de cabecera: th / fondo de color / todo en negrita, al principio.
  let finCab = inicio;
  while (finCab < grid.length - 1) {
    const m = meta[finCab].filter((x) => x.origen);
    const esCab = m.length && m.every((x) => x.cabecera) || (m.length && m.every((x) => x.negrita) && !meta[finCab + 1].filter((x) => x.origen).every((x) => x.negrita));
    if (!esCab) break;
    finCab++;
    if (finCab - inicio >= 3) break;
  }
  // Segunda heurística: primera fila de texto sobre columnas mayoritariamente numéricas.
  const esNum = (s) => /^[\s\d.,%€+\-–()]+$/.test(s) && /\d/.test(s);
  if (finCab === inicio && grid.length - inicio >= 3) {
    const primera = grid[inicio];
    const cuerpo = grid.slice(inicio + 1).filter((f) => f.some(Boolean));
    const textoOk = primera.some(Boolean) && primera.every((c) => !c || !esNum(c));
    const colNum = primera.some((c, j) => c && cuerpo.filter((f) => esNum(f[j] ?? '')).length >= cuerpo.length * 0.6);
    if (textoOk && colNum) finCab = inicio + 1;
  }
  // Notas al pie: filas finales de una sola celda que abarca toda la tabla.
  let finCuerpo = grid.length;
  const notas = [];
  const notasHtml = [];
  while (finCuerpo > finCab + 1 && ncols > 1 && meta[finCuerpo - 1][0]?.cs === ncols) { notas.unshift(grid[finCuerpo - 1][0]); notasHtml.unshift(meta[finCuerpo - 1][0].html); finCuerpo--; }
  return {
    titulo: titulos.join(' · ') || null,
    cabeceras: grid.slice(inicio, finCab),
    filas: grid.slice(finCab, finCuerpo).filter((f) => f.some((x) => x !== '')),
    notas: notas.filter(Boolean),
    titulosHtml, notasHtml,
    enlaces, ncols, meta, inicio, finCab, finCuerpo,
  };
}

function esTablaMaquetacion($, table) {
  const $t = $(table);
  if ($t.find('table').length) return true;
  const filas = $t.find('tr').length;
  const celdas = $t.find('td, th').length;
  if (celdas <= 1) return true;
  if (filas === 1 && $t.find('p, h1, h2, h3, h4, div.texto, ul').length > 1) return true;
  return false;
}

function desenvolverTabla($, table) {
  const html = $(table).find('> tr, > tbody > tr, > thead > tr').toArray()
    .map((tr) => `<div>${$(tr).children('td, th').toArray().map((c) => `<div>${$(c).html() ?? ''}</div>`).join('')}</div>`).join('');
  $(table).replaceWith(`<div>${html}</div>`);
}

function tablaAMarkdown(t, celdaMd) {
  const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>').trim();
  const n = t.ncols;
  let cab;
  if (t.cabeceras.length) {
    cab = Array.from({ length: n }, (_, j) => [...new Set(t.cabeceras.map((f) => f[j]).filter(Boolean))].join(' · '));
  } else cab = Array.from({ length: n }, () => ' ');
  const cuerpoIdx = [];
  for (let r = t.finCab; r < t.finCuerpo; r++) cuerpoIdx.push(r);
  const filasMd = cuerpoIdx
    .map((r) => t.meta[r].map((m, j) => (m.origen && m.html != null ? esc(celdaMd(m.html)) : '')))
    .filter((f) => f.some((x) => x));
  let md = '';
  // Filas-título y notas: se convierten desde su HTML para conservar imágenes y enlaces.
  const bloque = (h) => celdaMd(h ?? '').replace(/\n+/g, ' ').trim();
  const conMedios = (b) => /!\[|\]\(/.test(b);
  for (const h of t.titulosHtml) { const b = bloque(h); if (b) md += (conMedios(b) ? b : `**${b}**`) + '\n\n'; }
  md += `| ${cab.map(esc).join(' | ')} |\n| ${cab.map(() => '---').join(' | ')} |\n`;
  md += filasMd.map((f) => `| ${f.join(' | ')} |`).join('\n');
  const notasMd = t.notasHtml.map((h) => { const b = bloque(h); return !b ? '' : conMedios(b) ? b : `*${b}*`; }).filter(Boolean);
  if (notasMd.length) md += '\n\n' + notasMd.join('\n\n');
  return md + '\n';
}

// ---------------------------------------------------------------- páginas
function normalizarTexto(s) {
  return s.normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Texto visible del body con separación entre bloques (como lo leería una persona). */
export function textoVisible($) {
  const $b = $('body').clone();
  $b.find('br').replaceWith(' ');
  $b.find('p, div, li, td, th, tr, h1, h2, h3, h4, h5, h6, dt, dd, section, article, header, footer, blockquote, pre, table, ul, ol, option').each((_, el) => { $(el).append(' '); });
  return normalizarTexto($b.text());
}

function yamlValor(v, ind = 0) {
  const pad = ' '.repeat(ind);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '\n' + v.map((x) => {
      if (x && typeof x === 'object') {
        const ents = Object.entries(x);
        return `${pad}  - ` + ents.map(([k, val], i) => `${i ? pad + '    ' : ''}${k}: ${yamlValor(val, ind + 4)}`).join('\n');
      }
      return `${pad}  - ${yamlValor(x, ind + 2)}`;
    }).join('\n');
  }
  return '\n' + Object.entries(v).map(([k, val]) => `${pad}  ${k}: ${yamlValor(val, ind + 2)}`).join('\n');
}
const frontmatter = (o) => '---\n' + Object.entries(o).map(([k, v]) => `${k}: ${yamlValor(v)}`).join('\n') + '\n---\n';

function extraerPagina(pag) {
  const html = fs.readFileSync(path.join(MIGRACION, pag.raw), 'utf8');
  const $ = cheerio.load(html);
  const esHome = pag.ruta === '/';
  const slug = slugDeRuta(pag.ruta);

  // 1) Limpieza. Los bloques comentados con contenido real se guardan aparte (contenido-oculto/).
  const bloquesOcultos = [];
  $.root().find('*').addBack().contents().each((_, n) => {
    if (n.type !== 'comment') return;
    const $c = cheerio.load(`<div>${n.data}</div>`);
    $c('script, style').remove();
    const txt = normalizarTexto($c('div').first().text());
    if (/<[a-z]/i.test(n.data) && txt.length > 20 && !/^[-=*\s]+$/.test(txt)) bloquesOcultos.push(n.data);
  });
  $('script, style, noscript, link, meta, input[type=hidden]').remove();
  if (esHome) $('nav, .navbar, #arriba, #boton').remove();
  $('*').contents().filter((_, n) => n.type === 'comment').remove();
  if (bloquesOcultos.length) {
    const f = path.join(OCULTO, `${slug}.md`);
    ensureDir(path.dirname(f));
    const cuerpoOculto = bloquesOcultos.map((h, i) => `## Bloque comentado ${i + 1}\n\n${td.turndown(`<div>${h}</div>`).trim()}\n`).join('\n');
    fs.writeFileSync(f, frontmatter({ ruta_antigua: pag.ruta, nota: 'Contenido presente en el HTML actual pero comentado (no visible en la web). Decidir con el cliente si se publica.', bloques: bloquesOcultos.length }) + '\n' + cuerpoOculto, 'utf8');
  }
  // Código PHP filtrado como texto visible (fallo del sitio actual): se retira y se registra.
  $('body *').contents().filter((_, n) => n.type === 'text' && /\$(hostname|dbhost|dbuser|dbpass)\b|gethostname\(\)/.test(n.data)).each((_, n) => {
    incidencias.push({ pagina: pag.ruta, tipo: 'codigo-php-visible', detalle: n.data.replace(/\s+/g, ' ').trim().slice(0, 200) });
    $(n).remove();
  });

  // 1b) Ilustraciones SVG incrustadas en el contenido (no iconos de enlaces): se guardan como archivos de imagen.
  $('body svg').each((i, svg) => {
    if ($(svg).closest('a, button, nav').length) return;
    const nombre = `${slug.replace(/\//g, '-')}-${String(i + 1).padStart(2, '0')}.svg`;
    const destino = path.join(ROOT, 'public', 'imagenes', 'svg', nombre);
    ensureDir(path.dirname(destino));
    let xml = $.html(svg);
    if (!/xmlns=/.test(xml)) xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    fs.writeFileSync(destino, xml, 'utf8');
    const w = Number($(svg).attr('width')) || 100, h = Number($(svg).attr('height')) || 100;
    dimensionesSvg[`/imagenes/svg/${nombre}`] = { w, h, bytes: Buffer.byteLength(xml) };
    $(svg).replaceWith(`<img src="/imagenes/svg/${nombre}" alt="">`);
  });

  // 2) Reescritura de URLs a partir de la resolución del rastreo
  const refs = pag.referencias ?? [];
  const porBruto = new Map();
  for (const r of refs) if (!porBruto.has(`${r.atributo}|${r.bruto}`)) porBruto.set(`${r.atributo}|${r.bruto}`, r);
  const nuevaUrl = (r) => {
    const m = medioPorUrl.get(r.url) ?? medioPorClave.get((() => { try { return keyOf(new URL(r.url)); } catch { return r.url; } })());
    return m && m.status === 200 ? m.rutaNueva : r.url;
  };
  const documentos = [], imagenes = [], externos = [], internos = [], iframes = [], videos = [], emails = [], telefonos = [], rotos = [];
  const vistos = new Set();
  const anotar = (r, lista, extra = {}) => {
    const k = `${lista.length}|${r.url}`;
    if (vistos.has(`${r.tipo}|${r.url}|${r.texto}`)) return;
    vistos.add(`${r.tipo}|${r.url}|${r.texto}`);
    lista.push({ ...extra });
    return k;
  };
  $('body *').each((_, el) => {
    const $el = $(el);
    for (const attr of ['href', 'src', 'data-src', 'poster', 'data', 'background']) {
      const v = $el.attr(attr);
      if (v == null) continue;
      const r = porBruto.get(`${attr}|${v.trim()}`);
      if (r) $el.attr(attr, nuevaUrl(r));
    }
    // Enlaces que solo funcionan por onclick (xzy/window.open…): se convierten en href reales.
    const oc = $el.attr('onclick');
    if (oc) {
      const r = refs.find((x) => x.atributo === 'onclick' && oc.includes(x.bruto));
      if (r && (!$el.attr('href') || $el.attr('href') === '#')) {
        if (el.tagName === 'a') $el.attr('href', nuevaUrl(r));
        else $el.wrapInner(`<a href="${nuevaUrl(r)}"></a>`);
      }
      $el.removeAttr('onclick');
    }
  });
  const ocultos = [];
  for (const r of refs) {
    const m = medioPorUrl.get(r.url);
    if (r.ctx === 'comentario') {
      if (!ocultos.some((o) => o.url_antigua === r.url)) {
        ocultos.push({ tipo: r.tipo, titulo: r.texto || null, url_antigua: r.url, ruta_nueva: m?.status === 200 ? m.rutaNueva : null, estado_origen: r.estado ?? m?.status ?? null });
      }
      continue;
    }
    if (r.resolucion === 'rota' && r.tipo !== 'externo') rotos.push({ url: r.url, bruto: r.bruto, texto: r.texto, estado: r.estado });
    switch (r.tipo) {
      case 'documento': anotar(r, documentos, { titulo: r.texto || null, url_antigua: r.url, ruta_nueva: m?.status === 200 ? m.rutaNueva : null, tipo: m?.extension ?? null, bytes: m?.bytes ?? null }); break;
      case 'imagen': if (r.ctx !== 'asset') anotar(r, imagenes, { url_antigua: r.url, ruta_nueva: m?.status === 200 ? m.rutaNueva : null, alt: r.elemento === 'img' ? (r.texto || '') : null, enlazada: r.elemento === 'a' }); break;
      case 'video': case 'audio': anotar(r, videos, { url_antigua: r.url, ruta_nueva: m?.status === 200 ? m.rutaNueva : null, titulo: r.texto || null }); break;
      case 'externo': case 'ip-interna': anotar(r, r.ctx === 'iframe' ? iframes : externos, { url: r.url, texto: r.texto || null }); break;
      case 'iframe-externo': anotar(r, iframes, { url: r.url, texto: r.texto || null }); break;
      case 'pagina': if (r.ctx === 'iframe') anotar(r, iframes, { url: r.url, texto: r.texto || null }); else anotar(r, internos, { ruta: new URL(r.url).pathname, texto: r.texto || null }); break;
      case 'email': anotar(r, emails, { email: r.url.replace(/^mailto:/i, '').split('?')[0], texto: r.texto || null }); break;
      case 'telefono': anotar(r, telefonos, { telefono: r.url.replace(/^tel:/i, ''), texto: r.texto || null }); break;
      default: break;
    }
  }
  $('a[href^="mailto:"]').each((_, a) => { /* se conservan tal cual */ });

  // 3) Tablas: se desenvuelven las de maquetación y se extraen las de datos.
  for (let pasada = 0; pasada < 6; pasada++) {
    const lay = $('table').toArray().filter((t) => esTablaMaquetacion($, t));
    if (!lay.length) break;
    // Primero las más externas
    lay.filter((t) => !$(t).parents('table').length || pasada > 3).forEach((t) => desenvolverTabla($, t));
  }
  // 4) Metadatos y texto plano (antes de sustituir las tablas, para que incluya su texto)
  const textoPlano = textoVisible($);
  const mAct = textoPlano.match(/[ÚU]ltima actualizaci[oó]n\s*:?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
  const ultima = mAct ? { original: mAct[0].replace(/^.*?:\s*/, ''), iso: `${mAct[3].length === 2 ? '20' + mAct[3] : mAct[3]}-${mAct[2].padStart(2, '0')}-${mAct[1].padStart(2, '0')}` } : null;
  const encabezados = $('h1, h2, h3, h4, h5, h6').toArray()
    .map((h) => ({ nivel: Number(h.tagName[1]), texto: normalizarTexto($(h).text()) })).filter((h) => h.texto);
  const tituloHtml = normalizarTexto($('title').first().text());
  const h1 = encabezados.find((h) => h.nivel === 1)?.texto;
  const inv = inventario[pag.ruta];
  const titulo = (inv?.titulo && !/^Documento sin t/i.test(inv.titulo) ? inv.titulo.replace(/\s*\(.*?\)\s*$/, '') : null)
    || (tituloHtml && !/^Documento sin t/i.test(tituloHtml) ? tituloHtml : null) || h1 || pag.ruta;

  const tablas = [];
  const celdaMd = (h) => td.turndown(`<div>${h ?? ''}</div>`).replace(/\n{2,}/g, '\n');
  $('table').each((i, t) => {
    const datos = parsearTabla($, t);
    const n = String(i + 1).padStart(2, '0');
    const base = path.join(TABLAS, slug, `tabla-${n}`);
    ensureDir(path.dirname(base));
    const json = {
      fuente: pag.ruta, indice: i + 1, titulo: datos.titulo, columnas: datos.ncols,
      cabeceras: datos.cabeceras, filas: datos.filas, notas: datos.notas, enlaces: datos.enlaces,
    };
    writeJSON(base + '.json', json);
    const cabPlana = datos.cabeceras.length
      ? Array.from({ length: datos.ncols }, (_, j) => [...new Set(datos.cabeceras.map((f) => f[j]).filter(Boolean))].join(' · ').replace(/\n/g, ' ') || `columna_${j + 1}`)
      : Array.from({ length: datos.ncols }, (_, j) => `columna_${j + 1}`);
    const unicas = cabPlana.map((c, j) => (cabPlana.indexOf(c) !== j ? `${c} (${j + 1})` : c));
    fs.writeFileSync(base + '.csv', toCsv(datos.filas.map((f) => Object.fromEntries(unicas.map((c, j) => [c, f[j]]))), unicas), 'utf8');
    tablas.push({ archivo: path.relative(MIGRACION, base + '.json').replace(/\\/g, '/'), titulo: datos.titulo, filas: datos.filas.length, columnas: datos.ncols });
    const md = tablaAMarkdown(datos, celdaMd);
    $(t).replaceWith(`<pre data-tabla="${i}">§§TABLA${i}§§</pre>`);
    tablas[i]._md = `<!-- tabla ${n}: ${tablas[i].archivo} -->\n\n${md}`;
  });

  // 5) Markdown
  const cuerpo = esHome ? $('body').html() : ($('body').html() ?? $.root().html());
  let md = td.turndown(cuerpo ?? '');
  md = md.replace(/```\n?§§TABLA(\d+)§§\n?```/g, (_, i) => tablas[Number(i)]._md).replace(/§§TABLA(\d+)§§/g, (_, i) => tablas[Number(i)]._md);
  md = md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  for (const t of tablas) delete t._md;

  const fm = {
    titulo,
    titulo_html: tituloHtml || null,
    ruta_antigua: pag.ruta,
    url_antigua: pag.url,
    seccion: seccionDe(pag.ruta),
    origen: pag.origen.includes('inventario') ? 'inventario' : 'rastreo',
    ultima_actualizacion: ultima?.iso ?? null,
    ultima_actualizacion_texto: ultima?.original ?? null,
    encabezados,
    documentos,
    imagenes,
    videos,
    iframes,
    enlaces_externos: externos,
    enlaces_internos: internos,
    emails,
    telefonos,
    tablas,
    referencias_rotas: rotos,
    contenido_oculto_en_origen: ocultos,
  };
  const destino = path.join(CONTENIDO, `${slug}.md`);
  ensureDir(path.dirname(destino));
  fs.writeFileSync(destino, frontmatter(fm) + '\n' + md, 'utf8');
  const txtFile = path.join(TEXTO, `${slug}.txt`);
  ensureDir(path.dirname(txtFile));
  fs.writeFileSync(txtFile, textoPlano, 'utf8');

  return {
    ruta: pag.ruta, slug, titulo, seccion: fm.seccion, origen: fm.origen, ultima_actualizacion: fm.ultima_actualizacion,
    archivo: path.relative(MIGRACION, destino).replace(/\\/g, '/'),
    n_palabras: textoPlano.split(' ').length, n_caracteres: textoPlano.length,
    n_documentos: documentos.length, n_imagenes: imagenes.length, n_videos: videos.length, n_iframes: iframes.length,
    n_tablas: tablas.length, n_enlaces_externos: externos.length, n_enlaces_internos: internos.length, n_referencias_rotas: rotos.length,
    n_ocultos_en_origen: ocultos.length,
  };
}

// ----------------------------------------------------------------
fs.rmSync(CONTENIDO, { recursive: true, force: true });
fs.rmSync(TABLAS, { recursive: true, force: true });
fs.rmSync(TEXTO, { recursive: true, force: true });
fs.rmSync(OCULTO, { recursive: true, force: true });
const resumen = [];
for (const pag of crawl.paginas) {
  if (pag.estado !== 200 || !pag.raw) continue;
  try { resumen.push(extraerPagina(pag)); }
  catch (e) { incidencias.push({ pagina: pag.ruta, tipo: 'error-extraccion', detalle: String(e.stack ?? e).slice(0, 400) }); log('✗', pag.ruta, e.message); }
}
writeJSON(path.join(MIGRACION, 'paginas.json'), resumen);
// Dimensiones de las ilustraciones SVG guardadas (para reservar su espacio al cargar).
const fImg = path.join(ROOT, 'src', 'data', 'imagenes.json');
if (fs.existsSync(fImg) && Object.keys(dimensionesSvg).length) writeJSON(fImg, { ...readJSON(fImg), ...dimensionesSvg });
writeJSON(path.join(MIGRACION, 'cache', 'incidencias-extraccion.json'), incidencias);
log(`Páginas extraídas: ${resumen.length} · tablas: ${resumen.reduce((a, p) => a + p.n_tablas, 0)} · incidencias: ${incidencias.length}`);
