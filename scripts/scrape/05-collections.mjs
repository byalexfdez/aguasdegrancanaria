// Paso 05 — Colecciones estructuradas a partir del HTML bruto, las tablas extraídas y los Excel.
// Salida: migracion/colecciones/*.json (+ CSV donde tiene sentido).
// Regla: los textos se copian tal cual. Los campos "derivados" (fechas ISO, números) se calculan a partir
// del texto original, que se conserva siempre al lado.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import XLSX from 'xlsx';
import {
  MIGRACION, MEDIOS_DIR, readJSON, writeJSON, ensureDir, sanearRuta, sanearSegmento, toCsv, log, keyOf, clasificar, extOf,
} from './lib.mjs';

const crawl = readJSON(path.join(MIGRACION, 'crawl.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'), []);
const OUT = path.join(MIGRACION, 'colecciones');
fs.rmSync(OUT, { recursive: true, force: true });
ensureDir(OUT);

const paginaPorRuta = new Map(crawl.paginas.map((p) => [p.ruta, p]));
const medioPorUrl = new Map(medios.map((m) => [m.urlAntigua, m]));
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*' });
td.use(gfm);
td.remove(['script', 'style', 'button']);

const norm = (s) => (s ?? '').normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const slugDeRuta = (ruta) => (ruta === '/' ? 'index' : sanearRuta(ruta.replace(/\.(php|html?)$/i, '')));
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function fechaDesdeTexto(t) {
  if (!t) return null;
  let m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+|del\s+)?(\d{4})\b/i);
  if (m && MESES[m[2].toLowerCase()]) return `${m[3]}-${String(MESES[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Carga una página del rastreo con su mapa de referencias resueltas. */
function cargar(ruta) {
  const pag = paginaPorRuta.get(ruta);
  if (!pag?.raw) throw new Error(`Página no rastreada: ${ruta}`);
  const $ = cheerio.load(fs.readFileSync(path.join(MIGRACION, pag.raw), 'utf8'));
  const refs = new Map();
  for (const r of pag.referencias ?? []) {
    const k = `${r.atributo}|${r.bruto}`;
    if (!refs.has(k) || r.ctx !== 'comentario') refs.set(k, r);
  }
  const resolver = (valor, atributo = 'href') => {
    if (valor == null) return null;
    const r = refs.get(`${atributo}|${String(valor).trim()}`);
    if (!r) return null;
    const m = medioPorUrl.get(r.url);
    return {
      url_antigua: r.url,
      ruta_nueva: m?.status === 200 ? m.rutaNueva : null,
      tipo: r.tipo,
      formato: ['documento', 'video', 'imagen'].includes(r.tipo) ? extOf(new URL(r.url).pathname) : null,
      bytes: m?.bytes ?? null,
      estado_origen: m?.status ?? r.estado ?? null,
      pagina_interna: r.tipo === 'pagina' ? decodeURIComponent(new URL(r.url).pathname) : null,
    };
  };
  const resolverOnclick = (el) => {
    const oc = $(el).attr('onclick');
    if (!oc) return null;
    const r = (pag.referencias ?? []).find((x) => x.atributo === 'onclick' && oc.includes(x.bruto));
    return r ? resolver(r.bruto, 'onclick') : null;
  };
  return { $, pag, resolver, resolverOnclick };
}

const enlaceDe = (ctx, a) => ctx.resolver(ctx.$(a).attr('href')) ?? ctx.resolverOnclick(a);

// ------------------------------------------------------------------ listado documental genérico
const NIVEL_CLASE = [['titulo', 2], ['titulo2', 3], ['card-header', 4], ['accordion-button', 4]];
function nivelEncabezado($, el) {
  const tag = el.tagName?.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return Number(tag[1]);
  const cls = ` ${$(el).attr('class') ?? ''} `;
  for (const [c, n] of NIVEL_CLASE) if (cls.includes(` ${c} `) && !$(el).find('h1,h2,h3,h4,h5,h6').length) return n;
  if (tag === 'button' && $(el).attr('data-bs-toggle')) return 4;
  if (['p', 'td', 'div', 'span', 'strong', 'b', 'center', 'font'].includes(tag)) {
    if ($(el).find('a[href], a[onclick], p, div, table, ul, img').length) return 0;
    const t = norm($(el).text());
    if (t.length >= 4 && t.length <= 90 && /^(A[ÑN]O\s+\d{4}|\d{4}|[A-ZÁÉÍÓÚÑÜ0-9 ,.:;()ºª\-–/]+)$/.test(t) && /[A-ZÁÉÍÓÚÑ]{3}|\d{4}/.test(t)) return 7;
  }
  return 0;
}

function listadoDocumental(ruta) {
  const ctx = cargar(ruta);
  const { $ } = ctx;
  $('script, style, noscript, nav').remove();
  const items = [];
  const pila = [];
  const visitar = (el) => {
    if (el.type !== 'tag') return;
    const nivel = nivelEncabezado($, el);
    if (nivel) {
      const texto = norm($(el).text());
      if (texto) {
        while (pila.length && pila.at(-1).nivel >= nivel) pila.pop();
        pila.push({ nivel, texto });
      }
      if (!$(el).find('a').length) return;
    }
    if (el.tagName === 'a') {
      const destino = enlaceDe(ctx, el);
      if (destino && !(destino.tipo === 'pagina' && destino.pagina_interna === '/')) {
        const $a = $(el);
        let titulo = norm($a.text()) || norm($a.find('img').attr('alt')) || norm($a.attr('title'));
        let etiqueta = null;
        const $tr = $a.closest('tr');
        const $base = $tr.length ? $tr : $a.parent();
        const $c = $base.clone(); $c.find('a').remove();
        const resto = norm($c.text());
        if (resto && resto.length < 200) etiqueta = resto;
        if (!titulo && !etiqueta) {
          const prev = norm($a.prevAll().first().text()) || norm($a.parent().prevAll().first().text());
          if (prev && prev.length < 200) etiqueta = prev;
        }
        const grupo = pila.filter((p) => p.nivel > 1).map((p) => p.texto);
        const anio = [...grupo, etiqueta ?? '', titulo ?? ''].reverse().map((t) => t.match(/\b(19[5-9]\d|20[0-4]\d)\b/)?.[1]).find(Boolean) ?? null;
        items.push({ grupo, titulo: titulo || null, etiqueta, anio_en_texto: anio ? Number(anio) : null, ...destino });
      }
      return;
    }
    for (const c of el.children ?? []) visitar(c);
  };
  visitar($('body')[0]);
  return { ruta, titulo: norm($('h1').first().text()) || norm($('title').text()), total: items.length, items };
}

// ------------------------------------------------------------------ noticias
function noticias() {
  const ctx = cargar('/noticias.php');
  const { $ } = ctx;
  const lista = [];
  // Tarjetas de noticia (id="tarjeta"); se excluyen las del pie de página.
  $('.card').has('.card-title').filter((_, c) => $(c).attr('id') === 'tarjeta' || !/HORARIO DE REGISTRO|JUAN XXIII/i.test($(c).text())).each((i, card) => {
    const $c = $(card);
    const titulo = norm($c.find('.card-title').first().text());
    const $cuerpo = $c.find('.card-text').first().clone();
    const cuerpoMd = td.turndown($cuerpo.html() ?? '').trim();
    const $small = $c.find('small').last();
    const smallTxt = norm($small.text());
    const fuenteA = $small.find('a').first();
    const img = $c.find('img').first();
    const adjuntos = [];
    $c.find('a[href], a[onclick]').each((_, a) => {
      if (fuenteA.length && a === fuenteA[0]) return;
      const d = enlaceDe(ctx, a);
      if (d) adjuntos.push({ texto: norm($(a).text()) || null, ...d });
    });
    const fecha = fechaDesdeTexto(smallTxt);
    lista.push({
      orden: i + 1,
      slug: `${fecha ?? 'sin-fecha'}-${sanearSegmento(titulo).slice(0, 70)}`,
      titulo,
      fecha,
      fecha_texto: smallTxt.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? null,
      cuerpo_md: cuerpoMd,
      imagen: img.length ? { ...ctx.resolver(img.attr('src'), 'src'), alt: img.attr('alt') ?? '' } : null,
      fuente: fuenteA.length ? { texto: norm(fuenteA.text()), url: fuenteA.attr('href') } : null,
      pie_texto: smallTxt,
      adjuntos,
    });
  });
  return lista;
}

// ------------------------------------------------------------------ anuncios
function anuncios() {
  const ctx = cargar('/info_public.php');
  const { $ } = ctx;
  const home = fs.readFileSync(path.join(MIGRACION, paginaPorRuta.get('/').raw), 'utf8');
  const lista = [];
  $('.texto .container').each((i, el) => {
    const $e = $(el);
    const titulo = norm($e.find('h4').first().text());
    const texto = $e.find('p').toArray().map((p) => norm($(p).text())).filter(Boolean).join('\n\n');
    if (!titulo && !texto) return;
    const adjuntos = $e.find('a').toArray().map((a) => ({ texto: norm($(a).text()), bruto: $(a).attr('href'), ...enlaceDe(ctx, a) }));
    const exp = texto.match(/Expediente\s*(?:n[º°o.]*\s*)?([0-9]+\/[0-9]{4}\s*\([^)]*\)|[0-9A-Z]+-[A-Z]+\s*\([^)]*\)|[0-9]+\/[0-9]{4}|[0-9]{3,4}\s*-?\s*[A-Z]{2,4})/i);
    lista.push({
      orden: i + 1,
      titulo,
      texto,
      expediente_texto: exp ? exp[1].trim() : null,
      fecha: null,
      nota_fecha: 'La web actual no muestra fecha de publicación de los anuncios.',
      destacado_en_portada: adjuntos.some((a) => a.bruto && home.includes(a.bruto)),
      adjuntos: adjuntos.map(({ bruto, ...a }) => a),
    });
  });
  return lista;
}

// ------------------------------------------------------------------ juntas
function juntas() {
  const ctx = cargar('/el_consejo/juntas.php');
  const { $ } = ctx;
  const lista = [];
  const vistos = new Set();
  $('a[href]').each((_, a) => {
    const d = enlaceDe(ctx, a);
    if (!d || d.tipo !== 'documento') return;
    const texto = norm($(a).text());
    if (!texto) return; // icono duplicado del mismo PDF
    const cont = $(a).closest('[id]').attr('id') ?? '';
    const organo = /gobierno/i.test(cont) ? 'Junta de Gobierno' : /general/i.test(cont) ? 'Junta General' : (/jgob/i.test(d.url_antigua) ? 'Junta de Gobierno' : /jgen/i.test(d.url_antigua) ? 'Junta General' : null);
    const k = `${organo}|${texto}|${d.url_antigua}`;
    if (vistos.has(k)) return; vistos.add(k);
    lista.push({ organo, fecha_texto: texto, fecha: fechaDesdeTexto(texto), contenedor_origen: cont || null, documento: d });
  });
  return lista;
}

// ------------------------------------------------------------------ órganos de gobierno
function organos() {
  const ctx = cargar('/el_consejo/organos_gobierno.php');
  const { $ } = ctx;
  const botones = Object.fromEntries($('button.organSelector').toArray().map((b) => [($(b).attr('id') ?? ''), norm($(b).text())]));
  const ids = ['presidente', 'vicepresidente', 'junta_general', 'junta_gobierno', 'gerente'];
  const idBoton = { presidente: 'presidentOpen', vicepresidente: 'viceOpen', junta_general: 'junGenOpen', junta_gobierno: 'junGobOpen', gerente: 'gerenteOpen' };
  return ids.map((id) => {
    const $s = $(`#${id}`);
    if (!$s.length) return { id, encontrado: false };
    const anexos = $s.find('a[href]').toArray().map((a) => ({ texto: norm($(a).text()) || null, ...enlaceDe(ctx, a) })).filter((a) => a.url_antigua);
    return {
      id,
      boton: botones[idBoton[id]] ?? null,
      encabezados: $s.find('h1,h2,h3,h4,h5').toArray().map((h) => norm($(h).text())).filter(Boolean),
      contenido_md: td.turndown($s.html() ?? '').replace(/\n{3,}/g, '\n\n').trim(),
      anexos,
    };
  });
}

// ------------------------------------------------------------------ presas (inventarios)
function presas() {
  const dir = path.join(MIGRACION, 'tablas', 'presas', 'ubicacion_presas');
  const ids = ['presas-asignadas-consejo', 'grandes-presas', 'presas-menores'];
  const inventarios = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f, i) => {
    const t = readJSON(path.join(dir, f));
    const cab = (t.cabeceras.at(-1) ?? []).map((c) => norm(c));
    const registros = t.filas.map((fila) => {
      const o = {};
      cab.forEach((c, j) => { o[c || `col_${j + 1}`] = fila[j] ?? ''; });
      return o;
    });
    return { id: ids[i] ?? `tabla-${i + 1}`, titulo: t.titulo, columnas: cab, total: registros.length, registros, notas: t.notas ?? [], fuente: `/presas/ubicacion_presas.php (tabla ${i + 1})` };
  });
  return { fuente_pagina: '/presas/ubicacion_presas.php', inventarios, archivo_tecnico: listadoDocumental('/presas/archivo.php').items };
}

// ------------------------------------------------------------------ volúmenes de presas (Excel)
function volumenes() {
  const dir = path.join(MEDIOS_DIR, 'documentos', 'pdfs', 'presas', 'volumenes');
  const ficheros = fs.readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f)).sort();
  const porAnio = new Map();
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const num = (v) => {
    if (typeof v === 'number') return v;
    if (v == null || !String(v).trim()) return null;
    const s = String(v).trim();
    const pct = s.endsWith('%');
    const n = Number(s.replace('%', '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isNaN(n) ? null : (pct ? n / 100 : n);
  };
  for (const f of ficheros) {
    const wb = XLSX.readFile(path.join(dir, f));
    for (const hoja of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: '' });
      const tituloIdx = filas.findIndex((r) => r.some((c) => /VOL[ÚU]MENES ALMACENADOS/i.test(String(c))));
      const anioTxt = filas.map((r) => r.map(String).join(' ')).find((t) => /A[ÑN]O\s+\d{4}/i.test(t));
      const anio = Number(anioTxt?.match(/A[ÑN]O\s+(\d{4})/i)?.[1] ?? hoja);
      const cabIdx = filas.findIndex((r) => norm(String(r[0])).toUpperCase() === 'PRESAS');
      if (cabIdx < 0) continue;
      const presasA = [];
      const totales = [];
      const notas = [];
      let actual = null;
      let grupo = null;
      for (let i = cabIdx + 2; i < filas.length; i++) {
        const r = filas[i];
        const c0 = norm(String(r[0] ?? '')), c1 = norm(String(r[1] ?? ''));
        const meses = r.slice(3, 15);
        if (/^ENERO$/i.test(norm(String(r[3] ?? '')))) { grupo = c0 || null; actual = null; continue; } // subcabecera de grupo
        if (/^Columna\d+$/.test(c0)) continue; // cabecera residual de tabla Excel
        if (c0 && /^ALTURA/i.test(c1)) {
          actual = { presa: c0, grupo, altura_maxima_m: num(r[2]), meses: MES.map((m) => ({ mes: m, altura_m: null, volumen_m3: null, variacion_m3: null, porcentaje_embalsado: null })) };
          presasA.push(actual);
          meses.forEach((v, j) => { actual.meses[j].altura_m = num(v); });
        } else if (actual && /^Volumen/i.test(c1)) {
          actual.volumen_maximo_m3 = num(r[2]);
          meses.forEach((v, j) => { actual.meses[j].volumen_m3 = num(v); });
        } else if (actual && /^Variaci/i.test(c1)) {
          meses.forEach((v, j) => { actual.meses[j].variacion_m3 = num(v); });
        } else if (actual && /Embalsado/i.test(c1)) {
          meses.forEach((v, j) => { actual.meses[j].porcentaje_embalsado = num(v); });
        } else if (c0 && !c1 && r.slice(3).some((v) => v !== '' && v != null && String(v).trim() !== '')) {
          totales.push({ concepto: c0, valor_referencia: r[2] === '' ? null : r[2], meses: MES.map((m, j) => ({ mes: m, valor: r[3 + j] === '' || String(r[3 + j]).trim() === '' ? null : r[3 + j] })) });
          actual = null;
        } else if (c0 && c0.length > 40 && r.slice(1).every((v) => v === '' || v == null)) {
          notas.push(c0);
        }
      }
      const datos = presasA.reduce((a, p) => a + p.meses.filter((m) => m.volumen_m3 != null).length, 0);
      const registro = { anio, hoja, fichero: `/documentos/pdfs/presas/volumenes/${f}`, titulo: tituloIdx >= 0 ? norm(filas[tituloIdx].find((c) => String(c).trim())) : null, datos_mensuales: datos, presas: presasA, totales, notas };
      const previo = porAnio.get(anio);
      // Se queda la hoja con más datos; a igualdad, la del fichero más reciente.
      if (!previo || datos > previo.datos_mensuales || (datos === previo.datos_mensuales && f > path.basename(previo.fichero))) porAnio.set(anio, registro);
    }
  }
  const anios = [...porAnio.values()].sort((a, b) => b.anio - a.anio);
  for (const a of anios) writeJSON(path.join(OUT, 'volumenes', `${a.anio}.json`), a);
  const plano = anios.flatMap((a) => a.presas.flatMap((p) => p.meses.filter((m) => m.volumen_m3 != null || m.altura_m != null).map((m) => ({
    anio: a.anio, mes: m.mes, presa: p.presa, altura_m: m.altura_m, volumen_m3: m.volumen_m3, variacion_m3: m.variacion_m3,
    porcentaje_embalsado: m.porcentaje_embalsado, altura_maxima_m: p.altura_maxima_m, volumen_maximo_m3: p.volumen_maximo_m3,
  }))));
  fs.writeFileSync(path.join(OUT, 'volumenes', 'volumenes-mensuales.csv'), toCsv(plano), 'utf8');
  const soloPdf = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).map((f) => `/documentos/pdfs/presas/volumenes/${f}`);
  return { anios_con_datos: anios.map((a) => ({ anio: a.anio, hoja: a.hoja, fichero: a.fichero, presas: a.presas.length, datos_mensuales: a.datos_mensuales })), solo_en_pdf: soloPdf, registros_csv: plano.length };
}

// ------------------------------------------------------------------ normativa
function normativa() {
  const idx = listadoDocumental('/servicios/legislacion.php');
  const porRuta = new Map();
  for (const it of idx.items) if (it.pagina_interna) porRuta.set(it.pagina_interna, it);
  const fichas = crawl.paginas.filter((p) => /^\/servicios\/legislacion\//.test(p.ruta)).map((p) => {
    const slug = slugDeRuta(p.ruta);
    const t1 = path.join(MIGRACION, 'tablas', ...slug.split('/'), 'tabla-01.json');
    const meta = {};
    if (fs.existsSync(t1)) {
      const t = readJSON(t1);
      const g = [...t.cabeceras, ...t.filas];
      for (let r = 0; r < g.length; r++) {
        const fila = g[r].map(norm);
        const iT = fila.indexOf('Título'); if (iT >= 0) meta.titulo = fila.slice(iT + 1).find(Boolean) ?? null;
        const iD = fila.indexOf('Descripción'); if (iD >= 0) meta.descripcion = fila.slice(iD + 1).find(Boolean) ?? null;
        const creada = fila.join(' ').match(/Creada el (\d{2}\/\d{2}\/\d{4})/); if (creada) meta.creada_texto = creada[1];
        const iC = fila.indexOf('Código');
        if (iC >= 0 && g[r + 1]) {
          const val = g[r + 1].map(norm);
          fila.forEach((h, j) => { if (['Código', 'Aprobado', 'Categoría', 'Ámbito'].includes(h)) meta[{ Código: 'codigo', Aprobado: 'aprobado', Categoría: 'categoria', Ámbito: 'ambito' }[h]] = val[j] || null; });
        }
      }
    }
    const listado = porRuta.get(p.ruta);
    const ambitoRuta = /\/canarias\//.test(p.ruta) ? 'Canarias' : /\/espa(ñ|n)a\//.test(p.ruta) ? 'España' : /\/europa\//.test(p.ruta) ? 'Unión Europea' : null;
    const txtEstado = [meta.titulo, meta.descripcion, listado?.titulo, listado?.etiqueta].filter(Boolean).join(' ');
    const estado = /DEROGADO\s+PARCIAL/i.test(txtEstado) ? 'derogada parcialmente' : /DEROGAD/i.test(txtEstado) ? 'derogada' : null;
    const refs = p.referencias ?? [];
    const oficiales = refs.filter((r) => r.tipo === 'externo' && /boe\.es|boc|gobiernodecanarias|eur-lex|europa\.eu|diariooficial|bop/i.test(r.url)).map((r) => ({ url: r.url, texto: r.texto || null }));
    const docs = refs.filter((r) => r.tipo === 'documento' && r.ctx !== 'comentario').map((r) => ({ texto: r.texto || null, url_antigua: r.url, ruta_nueva: medioPorUrl.get(r.url)?.rutaNueva ?? null }));
    const desc = meta.descripcion ?? '';
    const numero = desc.match(/(?:\b|n[º°o]\s*)(\d{1,4}\/\d{2,4}(?:\/[A-Z]{2,3})?)/)?.[1] ?? null;
    const fecha = fechaDesdeTexto(desc);
    const contenido = path.join(MIGRACION, 'contenido', ...slug.split('/')) + '.md';
    return {
      ruta_antigua: p.ruta,
      ambito: ambitoRuta,
      titulo: meta.titulo ?? null,
      titulo_en_listado: listado?.titulo ?? null,
      grupo_en_listado: listado?.grupo ?? [],
      descripcion: meta.descripcion ?? null,
      codigo: meta.codigo ?? null,
      aprobado: meta.aprobado ?? null,
      categoria: meta.categoria ?? null,
      ambito_ficha: meta.ambito ?? null,
      creada_texto: meta.creada_texto ?? null,
      estado,
      estado_nota: estado ? 'Indicado en el título o descripción original.' : 'La web actual no indica si está vigente o derogada.',
      numero_derivado: numero,
      fecha_derivada: fecha,
      enlaces_oficiales: oficiales,
      documentos: docs,
      texto_completo: path.relative(MIGRACION, contenido).replace(/\\/g, '/'),
      caracteres_texto: fs.existsSync(contenido) ? fs.statSync(contenido).size : null,
    };
  });
  const enlacesIndice = idx.items.filter((i) => !i.pagina_interna || !/^\/servicios\/legislacion\//.test(i.pagina_interna));
  return { total: fichas.length, fichas, otros_enlaces_del_indice: enlacesIndice };
}

// ------------------------------------------------------------------ portada (home)
function portada() {
  const ctx = cargar('/');
  const { $ } = ctx;
  const html = fs.readFileSync(path.join(MIGRACION, ctx.pag.raw), 'utf8');
  const video = $('video source').first();
  const menu = $('nav .nav-item').toArray().map((li) => {
    const $li = $(li);
    const $t = $li.children('a').first();
    return {
      etiqueta: norm($t.text()) || null,
      destino: enlaceDe(ctx, $t[0]),
      subitems: $li.find('.dropdown-item').toArray().map((a) => ({ texto: norm($(a).text()), destino: enlaceDe(ctx, a) })),
    };
  }).filter((m) => m.etiqueta || m.subitems.length);
  const buscador = $('#buscar a').toArray().map((a) => ({ texto: norm($(a).text()), destino: enlaceDe(ctx, a) })).filter((x) => x.texto);
  const slider = $('.carousel-item').toArray().map((c) => {
    const img = $(c).find('img').first(); const a = $(c).find('a').first();
    return { imagen: ctx.resolver(img.attr('src'), 'src'), alt: img.attr('alt') ?? '', destino: a.length ? enlaceDe(ctx, a[0]) : null, texto: norm($(c).text()) || null };
  });
  const accesos = $('a#enlace').toArray().map((a) => ({ texto: norm($(a).text()) || null, icono: $(a).find('img').attr('src') ? ctx.resolver($(a).find('img').attr('src'), 'src') : null, destino: enlaceDe(ctx, a) })).filter((x) => x.texto);
  const rrss = $('a[href*="instagram"], a[href*="facebook"], a[href*="x.com"], a[href*="twitter"]').toArray().map((a) => ({ red: /instagram/.test($(a).attr('href')) ? 'Instagram' : /facebook/.test($(a).attr('href')) ? 'Facebook' : 'X', url: $(a).attr('href') }));
  const tarjeta = (t) => {
    const $c = $('.card').filter((_, c) => norm($(c).find('.card-title').first().text()) === t).first();
    return $c.find('a').toArray().map((a) => ({ grupo: norm($(a).closest('.card-text').prevAll('.card-text').first().text()) || norm($(a).parent().prev().text()) || null, texto: norm($(a).text()), destino: enlaceDe(ctx, a) }));
  };
  const modalJornada = $('.modal').filter((_, m) => /Participaci/i.test($(m).text())).first();
  const pie = $('footer, .footer').first().length ? $('footer, .footer').first() : $('body');
  const piePs = pie.find('p').toArray().map((p) => norm($(p).text())).filter((t) => /JUAN XXIII|HORARIO/i.test(t));

  // Bloques comentados en la home (alertas y banners inactivos)
  const comentarios = [...html.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
  const avisos = [];
  const banners = [];
  for (const c of comentarios) {
    const $c = cheerio.load(`<div>${c}</div>`);
    $c('.alert-danger').each((_, el) => {
      const a = $c(el).find('a').first();
      avisos.push({
        titulo: norm($c(el).find('h3').first().text()) || norm($c(el).text()),
        subtitulo: norm($c(el).find('h5').first().text()) || null,
        enlace_bruto: a.attr('href') ?? a.attr('onclick') ?? null,
        documento: a.attr('href') ? (ctx.resolver(a.attr('href')) ?? { url_antigua: a.attr('href') }) : null,
        fecha: fechaDesdeTexto(norm($c(el).text())) ?? fechaDesdeTexto((a.attr('href') ?? '').replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')),
        activo: false,
        nota: 'Aviso comentado en la home actual (no visible). Se migra desactivado para poder reactivarlo desde el CMS.',
      });
    });
    $c('.modal').each((_, m) => {
      const id = $c(m).attr('id');
      if (!['canagua', 'ecoislas'].includes(id)) return;
      banners.push({
        id,
        titulo: norm($c(m).find('.modal-title').text()) || null,
        contenido_md: td.turndown($c(m).find('.modal-body').html() ?? '').trim(),
        enlaces: $c(m).find('a[href]').toArray().map((a) => ({ texto: norm($c(a).text()) || null, href: $c(a).attr('href') })),
        imagenes: $c(m).find('img').toArray().map((i) => $c(i).attr('src')),
        activo: false,
        nota: 'Banner/modal comentado en la home actual (no visible).',
      });
    });
  }
  return {
    video_principal: video.length ? { titulo: norm($('.modal').has('video').find('.modal-title').first().text()) || null, ...ctx.resolver(video.attr('src'), 'src'), poster: $('video').attr('poster') ?? null } : null,
    noticia_destacada: modalJornada.length ? {
      titulo: norm(modalJornada.find('.modal-title').text()),
      contenido_md: td.turndown(modalJornada.find('.modal-body').html() ?? '').trim(),
      adjuntos: modalJornada.find('a[href]').toArray().map((a) => ({ texto: norm($(a).text()) || null, ...enlaceDe(ctx, a) })),
    } : null,
    menu_principal: menu,
    lista_buscador: buscador,
    slider,
    accesos_rapidos: accesos,
    tarjeta_volumenes: tarjeta('Volúmenes de presas'),
    tarjeta_anuncios: tarjeta('Anuncios'),
    youtube: $('iframe[src*="youtube"]').toArray().map((f) => ({ src: $(f).attr('src'), titulo: norm($(f).closest('.card').find('h5').first().text()) || $(f).attr('title') || null })),
    redes_sociales: rrss.filter((r, i) => rrss.findIndex((x) => x.url === r.url) === i),
    pie: { textos: piePs, enlaces: $('a#link').toArray().map((a) => ({ texto: norm($(a).text()).replace(/^\|\s*|\s*\|$/g, ''), destino: enlaceDe(ctx, a) })) },
    avisos_inactivos: avisos,
    banners_inactivos: banners,
  };
}

// ------------------------------------------------------------------ ejecución
const guardar = (nombre, datos) => { writeJSON(path.join(OUT, `${nombre}.json`), datos); return datos; };
const resumen = {};
const paso = (nombre, fn) => {
  try {
    const d = fn();
    guardar(nombre, d);
    resumen[nombre] = Array.isArray(d) ? d.length : (d.total ?? d.items?.length ?? Object.keys(d).length);
    log('✓', nombre, resumen[nombre]);
  } catch (e) { resumen[nombre] = `ERROR: ${e.message}`; log('✗', nombre, e.stack); }
};

paso('noticias', noticias);
paso('anuncios', anuncios);
paso('juntas', juntas);
paso('organos-gobierno', organos);
paso('presas', presas);
paso('volumenes', volumenes);
paso('normativa', normativa);
paso('portada', portada);
paso('elecciones', () => listadoDocumental('/elecciones.php'));
paso('planificacion', () => ['/plan_hidro.php', '/inundaciones.php', '/red_control.php', '/planhidro/art47/volumen1.php', '/planhidro/art47/volumen2.php', '/planhidro/art47/normativa.php',
  ...crawl.paginas.filter((p) => p.ruta.startsWith('/planhidro/directiva/')).map((p) => p.ruta)]
  .map((r) => {
    const l = listadoDocumental(r);
    for (const it of l.items) it.ciclo = it.grupo.find((g) => /CICLO|PGRI|PRIMER|SEGUNDO|TERCER|CUARTO/i.test(g)) ?? null;
    return l;
  }));
paso('transparencia', () => ['/transparencia.php', '/consejo.php', '/economico.php', '/presupuesto.php', '/info.php', '/perfil_con.php', '/perfil_con_2.php', '/convenio.php',
  '/empleados.php', '/ayudas.php', '/obras.php', '/patrimonio.php', '/estadistica.php', '/fomento.php'].map(listadoDocumental));
paso('fondos-europeos', () => ['/fondos_feder.php', '/divulgacion/fondos_feder.php', '/nextgeneration.php', '/subvenciones.php'].map(listadoDocumental));
paso('servicios-documentos', () => ['/servicios/documento.php', '/servicios/tarifa.php', '/servicios/tarifas.php', '/concurso_hidro.php', '/pluviometros.php', '/divulgacion.php', '/divulgacion/jornadas.php', '/accesibilidad.php', '/privacidad.php'].map(listadoDocumental));

writeJSON(path.join(OUT, '_resumen.json'), resumen);
log('Colecciones:', resumen);
