// Construye src/content/* y src/data/* a partir de la migración (Fase 1) y la arquitectura (Fase 2).
// Se puede relanzar: sobrescribe las páginas migradas, pero NO toca noticias/anuncios/avisos
// ya existentes salvo con --forzar (para no pisar lo que el cliente edite en el CMS).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, MIGRACION, PUBLIC_DIR, readJSON, writeJSON, ensureDir, extOf, sanearSegmento, log } from '../scrape/lib.mjs';

const FORZAR = process.argv.includes('--forzar');
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(SRC, 'content');
const DATA = path.join(SRC, 'data');
const arq = readJSON(path.join(DATA, 'arquitectura.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'));
const imagenes = readJSON(path.join(DATA, 'imagenes.json'));
const paginasMig = readJSON(path.join(MIGRACION, 'paginas.json'));
const COL = (f) => readJSON(path.join(MIGRACION, 'colecciones', f));

// ------------------------------------------------------------------ índices
const nodos = [];
const recorrer = (lista, padres = []) => { for (const x of lista) { nodos.push({ ...x, padres }); if (x.hijos) recorrer(x.hijos, [...padres, x.id]); } };
recorrer([...arq.transversales, ...arq.secciones, ...arq.legales]);
const nodoPorAntigua = new Map(nodos.filter((n) => n.antigua).map((n) => [n.antigua, n]));
const medioPorRuta = new Map(medios.filter((m) => m.status === 200).map((m) => [m.rutaAntigua, m]));
const medioPorNueva = new Map(medios.filter((m) => m.status === 200).map((m) => [m.rutaNueva, m]));
const avisosEnlaces = [];

const ORIGEN_RE = /^https?:\/\/(?:www\.)?aguasgrancanaria\.com/i;
/** Traduce una URL antigua (absoluta o ruta) a la nueva. Devuelve null si no es del sitio. */
function traducir(url) {
  if (!url) return null;
  let u = url.trim();
  if (u.startsWith('/documentos/') || u.startsWith('/imagenes/') || u.startsWith('/videos/') || u.startsWith('/visores/')) return u;
  if (!ORIGEN_RE.test(u) && !u.startsWith('/')) return null;
  let p = u.replace(ORIGEN_RE, '') || '/';
  let hash = '';
  const h = p.indexOf('#'); if (h >= 0) { hash = p.slice(h); p = p.slice(0, h); }
  let dec = p; try { dec = decodeURIComponent(p); } catch { /* ruta mal codificada */ }
  const sinQuery = dec.split('?')[0];
  const nodo = nodoPorAntigua.get(dec) ?? nodoPorAntigua.get(sinQuery) ?? (sinQuery === '/index.php' ? nodoPorAntigua.get('/') : null);
  if (nodo) return nodo.url + hash;
  const m = medioPorRuta.get(sinQuery);
  if (m) return m.rutaNueva;
  avisosEnlaces.push(u);
  return null;
}

// ------------------------------------------------------------------ limpieza de Markdown
const TIPOS = { pdf: 'PDF', xlsx: 'Excel', xls: 'Excel', ods: 'ODS', odt: 'ODT', doc: 'Word', docx: 'Word', zip: 'ZIP', rar: 'RAR', kmz: 'KMZ', ppt: 'PowerPoint', txt: 'TXT', xml: 'XML', rtf: 'RTF', mp4: 'Vídeo' };
const esIcono = (src) => { const i = imagenes[src]; return i && i.w <= 48 && i.h <= 48; };
const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

function limpiarCuerpo(md, { titulo }) {
  let s = md;
  // Logo de cabecera repetido en las páginas independientes.
  s = s.replace(/^\[!\[\]\(\/imagenes\/img\/logo11\.jpg\)\]\([^)]*\)\s*$/gm, '');
  // Pie repetido (dirección, horario, enlaces legales) al final de las páginas independientes.
  s = s.replace(/^AVDA\. JUAN XXIII.*$/gm, '').replace(/^HORARIO DE REGISTRO DE ENTRADA:.*$/gm, '')
    .replace(/^.*\[AVISO LEGAL \|?\]\(.*PRIVACIDAD.*$/gm, '');
  // "Última actualización" se muestra en la cabecera de la página.
  s = s.replace(/^\s*[ÚU]ltima actualizaci[oó]n:?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/gim, '');
  // Enlaces cuyo texto ocupa varias líneas («[⏎⏎Texto⏎⏎](url)»): se compacta.
  s = s.replace(/\[\s*\n+([^\]]*?)\n+\s*\]\(/g, (m, t) => `[${t.replace(/\s*\n+\s*/g, ' ').trim()}](`);
  // Negritas pegadas a letras o cifras («**Artículo 128.-**1.-»): Markdown no las reconoce; se pasan a <strong>.
  s = s.replace(/(?<!\\)\*\*(?=\S)([^*\n]+?)(?<=\S)(?<!\\)\*\*/g, '<strong>$1</strong>');
  // Encabezados dentro del texto de un enlace (bloques enlazados en origen): se quita la marca «#».
  s = s.replace(/\[#{1,6}\s+/g, '[');
  // Enlaces javascript: → texto.
  s = s.replace(/\[([^\]]*)\]\(javascript:[^)]*\)/gi, '$1');
  // Reescritura de URLs (Markdown y HTML en línea).
  s = s.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (m, img, txt, url, tit) => {
    const t = traducir(url);
    return `${img}[${txt}](${t ?? url}${tit})`;
  });
  // Segunda pasada: destinos de enlaces que envuelven una imagen ([![…](…)](destino)) con forma de URL antigua.
  s = s.replace(/\]\(((?:https?:\/\/(?:www\.)?aguasgrancanaria\.com)?\/(?!documentos\/|imagenes\/|videos\/|visores\/)[^)\s]*?(?:\.(?:php|html?|jpe?g|png|gif|webp|pdf|xlsx?|ods|odt|docx?|zip|rar|kmz|mp4)|\/))\)/gi,
    (m, url) => (/^https?:|\.[a-z0-9]+$/i.test(url) ? `](${traducir(url) ?? url})` : m));
  s = s.replace(/\b(src|href|poster)="([^"]+)"/g, (m, a, url) => `${a}="${traducir(url) ?? url}"`);
  // Imágenes que no existen en el servidor de origen: el espaciador de Lotus (ecblank.gif) se retira;
  // las demás se sustituyen por una marca visible «Imagen (no disponible)».
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/(?:www\.)?aguasgrancanaria\.com\/[^)\s]+)\)/g, (m, alt, url) =>
    (/ecblank\.gif$/i.test(url) ? '' : `<span class="no-disponible">${alt || 'Imagen'}</span>`));
  // Iconos decorativos (≤48 px): fuera. Los enlaces a documentos ya muestran su icono.
  s = s.replace(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, src) => (esIcono(src) ? '' : m));
  // Enlaces vacíos: se quitan si el mismo destino está enlazado con texto en la misma línea; si no, se rotulan con el formato.
  s = s.split('\n').map((linea) => linea.replace(/(?<!!)\[\s*\]\(([^)\s]+)\)/g, (m, url) => {
    const conTexto = new RegExp(`\\[[^\\]]+\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`).test(linea.replace(m, ''));
    if (conTexto) return '';
    const ext = extOf(url.split('?')[0]);
    return `[${TIPOS[ext] ?? 'Enlace'}](${url})`;
  })).join('\n');
  // Enlaces contiguos sin separación («[A](…)[B](…)»): se separan con un espacio (lectores de pantalla y buscador).
  s = s.replace(/(\]\([^)\s]+(?:\s+"[^"]*")?\))(?=!?\[)/g, '$1 ');
  // iframes de terceros (HTML en línea): fachada que no carga nada hasta que la persona lo pide (sin cookies previas).
  s = s.replace(/<iframe\b[^>]*\bsrc="([^"]+)"[^>]*>(?:<\/iframe>)?/g, (m, src) => {
    const yt = /youtube/.test(src);
    const prov = yt ? 'YouTube' : /google\.[a-z.]+\/maps/.test(src) ? 'Google Maps' : null;
    if (!prov) return m.replace('<iframe', '<iframe title="Contenido incrustado" loading="lazy"');
    return `\n\n<div class="fachada" data-src="${src}" data-titulo="${yt ? 'Vídeo de YouTube' : 'Mapa de Google Maps'}"><div><p>Este contenido se sirve desde ${prov}, que puede instalar cookies propias.</p><button type="button" class="boton boton-claro mt-3" data-cargar>${yt ? 'Cargar vídeo' : 'Cargar mapa'}</button></div></div>\n\n`;
  });
  // Vídeos: sin precarga, con controles y sin atributos del reproductor antiguo.
  s = s.replace(/<video\b[^>]*>/g, '<video controls preload="none" playsinline>').replace(/<p class="vjs-no-js">[\s\S]*?<\/p>/g, '');
  // H1: el primero pasa a antetítulo; el resto se degrada.
  let antetitulo = null;
  const lineas = s.split('\n');
  const iH1 = lineas.findIndex((l) => /^# /.test(l));
  if (iH1 >= 0) {
    const t = lineas[iH1].replace(/^#\s+/, '').trim();
    if (norm(t) !== norm(titulo)) antetitulo = t;
    lineas.splice(iH1, 1);
  }
  s = lineas.join('\n');
  // Nivel mínimo de encabezado = 2 (el H1 es el título de la página).
  const niveles = [...s.matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length);
  if (niveles.length) {
    const min = Math.min(...niveles);
    const delta = 2 - min;
    if (delta !== 0) s = s.replace(/^(#{1,6}) /gm, (m, h) => `${'#'.repeat(Math.min(6, Math.max(2, h.length + delta)))} `);
  }
  s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { cuerpo: s, antetitulo };
}

function descripcionDe(md, fallback) {
  const parrafo = md.split(/\n{2,}/).map((b) => b.trim())
    .find((b) => b && !/^(#|\||!|<|-|\*|\[|`|>)/.test(b) && !/^[A-Za-z0-9]{1,3}\s?[.)-]/.test(b) && b.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').length > 80);
  if (!parrafo) return fallback;
  const t = parrafo.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= 158) return t;
  return t.slice(0, 155).replace(/\s+\S*$/, '') + '…';
}

// [nodo, texto original, corrección]. Solo erratas evidentes; las dudas no se tocan.
const ERRATAS = [
  ['presas', 'a efectos ácticos', 'a efectos prácticos'],
  ['presas', 'RELACÓN DE PRESAS', 'RELACIÓN DE PRESAS'],
  ['plan-hidrologico', 'Demarcación hidrogáfica ES120', 'Demarcación hidrográfica ES120'],
  ['dma', 'Documento-Guí de la estrategia', 'Documento-Guía de la estrategia'],
  ['dma', 'Planificación Hidrolólogica', 'Planificación Hidrológica'],
];
// Entidades HTML mal escritas en origen, que la web antigua mostraba literalmente.
const ERRATAS_GLOBALES = [['&ocute;', 'ó'], ['&aaciute;', 'á']];
const erratasAplicadas = [];

const PLANTILLA = {
  inicio: 'inicio', presas: 'presas', volumenes: 'volumenes', censo: 'censo', cauces: 'visor', 'plan-hidrologico': 'planificacion',
  inundaciones: 'planificacion', 'juntas-y-sesiones': 'juntas', 'organos-de-gobierno': 'organos', ubicacion: 'contacto',
  normativa: 'normativa-indice', 'normativa-canarias': 'normativa-indice', 'normativa-espana': 'normativa-indice', 'normativa-ue': 'normativa-indice',
  noticias: 'noticias', anuncios: 'anuncios', avisos: 'avisos', buscar: 'buscar', 'centro-documentos': 'centro-documentos', 'mapa-web': 'mapa-web',
  pluviometros: 'pluviometros',
};

// ------------------------------------------------------------------ páginas
const DIR_PAG = path.join(CONTENT, 'paginas');
fs.rmSync(DIR_PAG, { recursive: true, force: true });
const fmPaginas = [];
const leerMig = (ruta) => {
  const p = paginasMig.find((x) => x.ruta === ruta);
  const txt = fs.readFileSync(path.join(MIGRACION, p.archivo), 'utf8');
  const m = txt.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return { meta: YAML.parse(m[1]), cuerpo: m[2], resumen: p };
};
const archivoDe = (url) => path.join(DIR_PAG, ...(url === '/' ? ['inicio'] : url.replace(/^\/|\/$/g, '').split('/')).map(sanearSegmento)) + '.md';

const normativa = COL('normativa.json');
const normaPorRuta = new Map(normativa.fichas.map((f) => [f.ruta_antigua, f]));
const portada = COL('portada.json');

for (const n of nodos) {
  if (n.externo || n.alias_de) continue;
  const seccion = n.padres[0] ?? n.id;
  let fm = { titulo: n.titulo, url: n.url, nodo: n.id, seccion, plantilla: PLANTILLA[n.id] ?? ((n.hijos ?? []).some((h) => !h.oculto_en_menu) ? 'hub' : 'pagina') };
  let cuerpo = '';
  if (n.entradilla) fm.entradilla = n.entradilla;
  if (n.antigua) {
    const { meta, cuerpo: bruto } = leerMig(n.antigua);
    const r = limpiarCuerpo(bruto, { titulo: n.titulo });
    cuerpo = r.cuerpo;
    Object.assign(fm, {
      antetitulo: r.antetitulo,
      ruta_antigua: n.antigua,
      ultima_actualizacion: meta.ultima_actualizacion ?? null,
      titulo_original: meta.titulo_html && meta.titulo_html !== n.titulo ? meta.titulo_html : null,
      contenido_oculto_en_origen: (meta.contenido_oculto_en_origen ?? []).length,
    });
    if (normaPorRuta.has(n.antigua)) {
      const f = normaPorRuta.get(n.antigua);
      fm.plantilla = 'normativa';
      fm.norma = { ambito: f.ambito, titulo: f.titulo, titulo_en_listado: f.titulo_en_listado, descripcion: f.descripcion, codigo: f.codigo, categoria: f.categoria, ambito_ficha: f.ambito_ficha, creada: f.creada_texto, estado: f.estado, numero: f.numero_derivado, fecha: f.fecha_derivada, enlaces_oficiales: f.enlaces_oficiales };
    }
  } else if (n.id === 'participacion') {
    const d = portada.noticia_destacada;
    fm.antetitulo = 'Planificación hidrológica';
    fm.origen_contenido = 'Noticia destacada de la portada actual';
    // Las rutas relativas del modal se resolvían contra la home.
    const md = d.contenido_md.replace(/\]\((?!https?:|\/)([^)\s]+)\)/g, '](https://www.aguasgrancanaria.com/$1)');
    cuerpo = limpiarCuerpo(`## ${d.titulo}\n\n${md}\n`, { titulo: n.titulo }).cuerpo;
  }
  // Erratas evidentes (registradas en migracion/erratas-corregidas.md).
  for (const [original, corregido] of ERRATAS_GLOBALES) {
    if (cuerpo.includes(original)) { cuerpo = cuerpo.split(original).join(corregido); erratasAplicadas.push([n.url, original, corregido]); }
  }
  for (const [id, original, corregido] of ERRATAS) {
    if (id === n.id && cuerpo.includes(original)) { cuerpo = cuerpo.replace(original, corregido); erratasAplicadas.push([n.url, original, corregido]); }
  }
  if (n.id === 'accesibilidad') {
    // Hueco preparado para la declaración de accesibilidad (RD 1112/2018). No se publica texto nuevo sin validar.
    cuerpo += `\n<!-- DECLARACIÓN DE ACCESIBILIDAD (RD 1112/2018 · UNE-EN 301 549): pendiente de redactar con el modelo oficial
     (situación de cumplimiento, contenido no accesible, fecha de elaboración, observaciones y datos de contacto,
     procedimiento de aplicación). Editar desde el gestor de contenidos: Páginas › /accesibilidad/. -->\n`;
  }
  if (n.id.startsWith('normativa-')) fm.ambito = { 'normativa-canarias': 'Canarias', 'normativa-espana': 'España', 'normativa-ue': 'Unión Europea' }[n.id];
  fm.descripcion = descripcionDe(cuerpo, n.entradilla ?? `${n.titulo} · Consejo Insular de Aguas de Gran Canaria`);
  for (const k of Object.keys(fm)) if (fm[k] === null || fm[k] === undefined) delete fm[k];
  const f = archivoDe(n.url);
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n\n${cuerpo}`, 'utf8');
  fmPaginas.push(fm);
}

// ------------------------------------------------------------------ noticias, anuncios, avisos (colecciones editables en el CMS)
function escribirColeccion(dir, entradas) {
  const d = path.join(CONTENT, dir);
  ensureDir(d);
  let nuevas = 0;
  for (const e of entradas) {
    const f = path.join(d, `${e.slug}.md`);
    if (fs.existsSync(f) && !FORZAR) continue;
    const { slug, cuerpo, ...fm } = e;
    for (const k of Object.keys(fm)) if (fm[k] === null || fm[k] === undefined) delete fm[k];
    fs.writeFileSync(f, `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n\n${(cuerpo ?? '').trim()}\n`, 'utf8');
    nuevas++;
  }
  return nuevas;
}
const doc = (a) => (a?.ruta_nueva ? { texto: a.texto ?? null, url: a.ruta_nueva, formato: a.formato ?? extOf(a.ruta_nueva) } : (a?.url_antigua ? { texto: a.texto ?? null, url: traducir(a.url_antigua) ?? a.url_antigua, formato: a.formato ?? null } : null));

const noticias = COL('noticias.json');
const nNot = escribirColeccion('noticias', noticias.map((x) => ({
  slug: x.slug.replace(/-+$/, ''),
  titulo: x.titulo,
  fecha: x.fecha ?? null,
  sin_fecha_en_origen: x.fecha ? undefined : true,
  orden_origen: x.orden,
  imagen: x.imagen?.ruta_nueva ?? null,
  imagen_alt: x.imagen?.alt || '',
  fuente: x.fuente ? { texto: x.fuente.texto, url: x.fuente.url } : null,
  adjuntos: x.adjuntos.map(doc).filter(Boolean),
  cuerpo: limpiarCuerpo(x.cuerpo_md, { titulo: x.titulo }).cuerpo,
})));

const anuncios = COL('anuncios.json');
const nAnu = escribirColeccion('anuncios', anuncios.map((x) => ({
  slug: `${String(x.orden).padStart(3, '0')}-${sanearSegmento(x.titulo).slice(0, 40)}-${sanearSegmento(x.expediente_texto ?? 'sin-expediente').slice(0, 30)}`,
  titulo: x.titulo,
  expediente: x.expediente_texto,
  fecha: null,
  orden_origen: x.orden,
  destacado: x.destacado_en_portada,
  adjuntos: x.adjuntos.map(doc).filter(Boolean),
  cuerpo: x.texto,
})));

const nAvi = escribirColeccion('avisos', portada.avisos_inactivos.map((x, i) => ({
  slug: `${x.fecha ?? 'sin-fecha'}-${sanearSegmento(x.titulo).slice(0, 50)}`,
  titulo: x.titulo,
  subtitulo: x.subtitulo,
  fecha: x.fecha,
  nivel: 'alerta',
  activo: false,
  enlace: x.documento?.url_antigua ? (traducir(x.documento.url_antigua) ?? x.documento.url_antigua) : null,
  nota_migracion: x.nota,
  cuerpo: '',
})));

// ------------------------------------------------------------------ datos
// Índice de documentos (centro de documentos y etiquetas de tipo/peso en los enlaces).
const urlDeRuta = (r) => nodoPorAntigua.get(r)?.url ?? null;
const documentos = medios.filter((m) => ['documento', 'video'].includes(m.tipo) && m.status === 200).map((m) => {
  const pags = m.paginas.map(urlDeRuta).filter(Boolean);
  const sec = pags[0] ? nodos.find((n) => n.url === pags[0])?.padres[0] ?? null : null;
  const anio = (m.textos.join(' ') + ' ' + m.rutaAntigua).match(/(?:^|[^\d])(19[5-9]\d|20[0-3]\d)(?:[^\d]|$)/)?.[1] ?? null;
  return {
    url: m.rutaNueva, antigua: m.rutaAntigua, titulo: m.textos.find((t) => t && t.length > 3) ?? path.basename(m.rutaAntigua),
    formato: m.extension, bytes: m.bytes, paginas: pags, seccion: sec, anio: anio ? Number(anio) : null,
  };
});
writeJSON(path.join(DATA, 'documentos.json'), documentos);

// Datos estructurados para las plantillas.
writeJSON(path.join(DATA, 'presas.json'), JSON.parse(JSON.stringify(COL('presas.json')).replace('RELACÓN DE PRESAS', 'RELACIÓN DE PRESAS')));
writeJSON(path.join(DATA, 'juntas.json'), COL('juntas.json').map((j) => ({ ...j, documento: { url: j.documento.ruta_nueva, bytes: j.documento.bytes, formato: j.documento.formato } })));
writeJSON(path.join(DATA, 'organos.json'), COL('organos-gobierno.json').map((o) => ({ ...o, contenido_md: limpiarCuerpo(o.contenido_md, { titulo: '' }).cuerpo, anexos: o.anexos.map(doc) })));
writeJSON(path.join(DATA, 'normativa.json'), normativa.fichas.map((f) => ({ ...f, url: nodoPorAntigua.get(f.ruta_antigua)?.url })));
writeJSON(path.join(DATA, 'portada.json'), {
  video: portada.video_principal ? { titulo: portada.video_principal.titulo, url: portada.video_principal.ruta_nueva, bytes: portada.video_principal.bytes } : null,
  slider: portada.slider.map((s) => ({ imagen: s.imagen?.ruta_nueva, alt: s.alt, url: s.destino?.pagina_interna ? traducir(s.destino.pagina_interna) : null })),
  // Lista de accesos del antiguo «buscador» de la home (mismos textos), con destinos nuevos.
  accesos_directos: portada.lista_buscador.map((a) => ({ texto: a.texto, url: a.destino ? (traducir(a.destino.url_antigua) ?? a.destino.url_antigua) : null })).filter((a) => a.url),
  youtube: portada.youtube,
  redes: portada.redes_sociales,
  banners_inactivos: portada.banners_inactivos,
});

// Volúmenes: los Excel se copian a public/datos/volumenes (el CMS sube ahí los nuevos) y se procesan en el build.
const dirVol = path.join(PUBLIC_DIR, 'datos', 'volumenes');
ensureDir(dirVol);
for (const f of ['2025.xlsx', '2026.xlsx']) {
  const o = path.join(ROOT, 'medios', 'documentos', 'pdfs', 'presas', 'volumenes', f);
  if (fs.existsSync(o) && !fs.existsSync(path.join(dirVol, f))) fs.copyFileSync(o, path.join(dirVol, f));
}

// Censo de instalaciones: registros incrustados en el visor original → JSON para el mapa nuevo.
const censoHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'visores', 'CensoInstalaciones', 'map-censo.html'), 'utf8');
const mRec = censoHtml.match(/var records = (\[[\s\S]*?\]);\s*\n/);
if (mRec) {
  const recs = JSON.parse(mRec[1]).map((r) => ({ id: r.id, c: r.code, n: r.name, t: r.record_type, m: r.town, s: r.status, x: r.record_x, y: r.record_y, p: r.main, lat: r.latlon?.lat, lon: r.latlon?.lon }));
  writeJSON(path.join(PUBLIC_DIR, 'datos', 'censo-instalaciones.json'), recs);
  const tipos = {}; const estados = {};
  for (const r of recs) { tipos[r.t] = (tipos[r.t] ?? 0) + 1; estados[r.s] = (estados[r.s] ?? 0) + 1; }
  // Etiquetas tal como las muestra el visor original (opciones de sus filtros).
  const opciones = [...censoHtml.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/g)].map((m) => [m[1], m[2].trim()]).filter(([v]) => v !== 'all');
  const etiquetas = { municipio: {}, tipo: {}, estado: {} };
  for (const [v, t] of opciones) {
    if (v in tipos) etiquetas.tipo[v] = t; else if (v in estados) etiquetas.estado[v] = t; else etiquetas.municipio[v] = t;
  }
  writeJSON(path.join(DATA, 'censo-resumen.json'), { total: recs.length, tipos, estados, etiquetas });
}

// Resumen
const sinDestino = [...new Set(avisosEnlaces)];
writeJSON(path.join(MIGRACION, 'cache', 'enlaces-sin-destino.json'), sinDestino);
writeJSON(path.join(DATA, 'enlaces-no-disponibles.json'), sinDestino);
writeJSON(path.join(MIGRACION, 'cache', 'erratas-aplicadas.json'), erratasAplicadas);
if (erratasAplicadas.length < ERRATAS.length) log(`Aviso: solo se aplicaron ${erratasAplicadas.length} de ${ERRATAS.length} erratas`, erratasAplicadas);
log(`Páginas: ${fmPaginas.length} · noticias nuevas: ${nNot} · anuncios nuevos: ${nAnu} · avisos nuevos: ${nAvi} · documentos indexados: ${documentos.length} · enlaces internos sin destino: ${sinDestino.length}`);
