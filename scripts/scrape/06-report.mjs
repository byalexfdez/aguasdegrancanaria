// Paso 06 — Inventario consolidado (migracion/inventario.json) y resumen de cobertura (migracion/cobertura-fase1.md).
import fs from 'node:fs';
import path from 'node:path';
import { RECURSOS, MIGRACION, PUBLIC_DIR, readCsv, readJSON, writeJSON, log, keyOf } from './lib.mjs';

const crawl = readJSON(path.join(MIGRACION, 'crawl.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'));
const paginas = readJSON(path.join(MIGRACION, 'paginas.json'));
const externos = readJSON(path.join(MIGRACION, 'enlaces-externos.json'));
const estado = readJSON(path.join(MIGRACION, 'cache', 'estado-urls.json'));
const colecciones = readJSON(path.join(MIGRACION, 'colecciones', '_resumen.json'));
const colPresas = readJSON(path.join(MIGRACION, 'colecciones', 'presas.json'));
const colPortada = readJSON(path.join(MIGRACION, 'colecciones', 'portada.json'));
const colNoticias = readJSON(path.join(MIGRACION, 'colecciones', 'noticias.json'));
const invPag = readCsv(path.join(RECURSOS, 'inventario_paginas.csv'));
const invDoc = readCsv(path.join(RECURSOS, 'inventario_documentos.csv'));

const fmtMB = (b) => `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
const n = (x) => x.toLocaleString('es-ES');
const cuenta = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

// ---------------------------------------------------------------- cifras
const pagOk = crawl.paginas.filter((p) => p.estado === 200);
const nuevasPag = crawl.paginas.filter((p) => !p.origen.includes('inventario') && p.ruta !== '/');
const invRutas = new Set(invPag.map((p) => p.ruta));
const faltanInv = invPag.filter((p) => !crawl.paginas.some((c) => c.ruta === p.ruta && c.estado === 200));

// Artefactos del rastreo: rutas montadas por JavaScript que no son documentos reales.
const ARTEFACTOS = new Set(['/public.pdf']);
const docs = medios.filter((m) => m.tipo === 'documento' && !ARTEFACTOS.has(m.rutaAntigua));
const docsOk = docs.filter((m) => m.status === 200);
const invUrls = new Set(invDoc.map((d) => { try { return keyOf(new URL(d.url_documento)); } catch { return d.url_documento; } }));
// El inventario incluye los MP4 como documentos.
const docsInv = medios.filter((m) => m.enInventario && ['documento', 'video'].includes(m.tipo));
const docsInvOk = docsInv.filter((m) => m.status === 200);
const docsExtra = docs.filter((m) => !m.enInventario);
const falsosPositivos = docsInv.filter((m) => m.soloInventario && m.status !== 200);
const docsNoExisten = docs.filter((m) => m.status !== 200 && !falsosPositivos.includes(m));
const ocultos = new Set();
for (const p of crawl.paginas) for (const r of p.referencias ?? []) if (r.ctx === 'comentario') ocultos.add(r.url);
const visiblesEn = new Set();
for (const p of crawl.paginas) for (const r of p.referencias ?? []) if (r.ctx !== 'comentario') visiblesEn.add(r.url);
const docsSoloOcultos = docs.filter((m) => ocultos.has(m.urlAntigua) && !visiblesEn.has(m.urlAntigua));

const imgs = medios.filter((m) => m.tipo === 'imagen');
const vids = medios.filter((m) => m.tipo === 'video');
const visores = medios.filter((m) => m.tipo === 'asset');
const bytesTot = medios.reduce((a, m) => a + (m.bytes ?? 0), 0);
const porExt = cuenta(docsOk, (m) => m.extension);

const tablasTot = paginas.reduce((a, p) => a + p.n_tablas, 0);
const iframesTot = paginas.reduce((a, p) => a + p.n_iframes, 0);
const iframeHosts = [...new Set(crawl.recursos.filter((r) => r.tipo === 'iframe-externo').map((r) => new URL(r.url).hostname))];
const palabrasTot = paginas.reduce((a, p) => a + p.n_palabras, 0);
const conFecha = paginas.filter((p) => p.ultima_actualizacion);

const resol = cuenta(crawl.paginas.flatMap((p) => p.referencias ?? []).filter((r) => r.resolucion), (r) => r.resolucion);
const extEstado = cuenta(externos, (e) => e.estado);
const ipsInternas = externos.filter((e) => e.estado === 'ip-interna');
const obsoletos = externos.filter((e) => e.dominioObsoleto);
const ocultoFiles = fs.existsSync(path.join(MIGRACION, 'contenido-oculto'))
  ? fs.readdirSync(path.join(MIGRACION, 'contenido-oculto'), { recursive: true }).filter((f) => String(f).endsWith('.md')).length : 0;

const censo = fs.readFileSync(path.join(PUBLIC_DIR, 'visores', 'CensoInstalaciones', 'map-censo.html'), 'utf8');
const registrosCenso = (censo.match(/"id":\d+,"code"/g) ?? []).length;

// ---------------------------------------------------------------- inventario.json
const inventario = {
  generado: new Date().toISOString(),
  origen: 'https://www.aguasgrancanaria.com',
  totales: {
    paginas: crawl.paginas.length, paginas_ok: pagOk.length, paginas_nuevas_en_rastreo: nuevasPag.length,
    documentos: docs.length, documentos_descargados: docsOk.length, documentos_inexistentes_en_servidor: docsNoExisten.length,
    documentos_inventario: invDoc.length, documentos_inventario_descargados: docsInvOk.length, falsos_positivos_inventario: falsosPositivos.length,
    documentos_extra_no_inventariados: docsExtra.length, documentos_solo_en_html_comentado: docsSoloOcultos.length,
    imagenes: imgs.length, imagenes_descargadas: imgs.filter((m) => m.status === 200).length,
    videos: vids.length, iframes: iframesTot, tablas: tablasTot, enlaces_externos: externos.length,
    bytes_descargados: bytesTot, palabras: palabrasTot, registros_censo_instalaciones: registrosCenso,
  },
  paginas: paginas.map((p) => ({ ...p, en_inventario: invRutas.has(p.ruta) })),
  documentos: docs.map((m) => ({ url_antigua: m.urlAntigua, ruta_antigua: m.rutaAntigua, ruta_nueva: m.status === 200 ? m.rutaNueva : null, extension: m.extension, bytes: m.bytes, sha256: m.sha256, estado_http: m.status, en_inventario: m.enInventario, solo_en_html_comentado: docsSoloOcultos.includes(m), paginas: m.paginas, textos: m.textos })),
  imagenes: imgs.map((m) => ({ url_antigua: m.urlAntigua, ruta_nueva: m.status === 200 ? m.rutaNueva : null, bytes: m.bytes, estado_http: m.status, paginas: m.paginas })),
  videos: vids.map((m) => ({ url_antigua: m.urlAntigua, ruta_nueva: m.rutaNueva, bytes: m.bytes, paginas: m.paginas })),
  visores: visores.map((m) => ({ url_antigua: m.urlAntigua, ruta_nueva: m.rutaNueva, estado_http: m.status })),
  enlaces_externos: cuenta(externos, (e) => e.estado),
  colecciones,
};
writeJSON(path.join(MIGRACION, 'inventario.json'), inventario);

// ---------------------------------------------------------------- cobertura-fase1.md
const porSeccion = {};
for (const p of paginas) {
  const s = (porSeccion[p.seccion] ??= { paginas: 0, palabras: 0, documentos: 0, tablas: 0, imagenes: 0, fechas: 0 });
  s.paginas++; s.palabras += p.n_palabras; s.documentos += p.n_documentos; s.tablas += p.n_tablas; s.imagenes += p.n_imagenes; if (p.ultima_actualizacion) s.fechas++;
}
const fila = (cols) => `| ${cols.join(' | ')} |`;
let md = `# Cobertura de la Fase 1 — Extracción del contenido

Web de origen: https://www.aguasgrancanaria.com · Extracción: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
Scripts: \`scripts/scrape/01-crawl.mjs\` … \`06-report.mjs\` (se pueden relanzar; usan caché en \`migracion/cache/\`).

## Resumen

| Elemento | Resultado |
|---|---|
| Páginas del inventario (163) | **${pagOk.filter((p) => invRutas.has(p.ruta)).length} / ${invPag.length}** extraídas (HTTP 200) |
| Páginas nuevas encontradas en el rastreo | ${nuevasPag.length} (el inventario estaba completo) |
| Documentos del inventario (720, incluye 6 MP4) | **${docsInvOk.length}** descargados · ${docsInv.filter((m) => m.status !== 200 && !falsosPositivos.includes(m)).length} no existen en el servidor · ${falsosPositivos.length} falsos positivos (enlaces externos) |
| Documentos adicionales no inventariados | ${docsExtra.length} (${docsExtra.filter((m) => m.status === 200).length} descargados) |
| Total documentos descargados | **${n(docsOk.length)}** (${Object.entries(porExt).sort((a, b) => b[1] - a[1]).map(([e, c]) => `${c} ${e}`).join(', ')}) |
| Imágenes | ${imgs.filter((m) => m.status === 200).length} descargadas de ${imgs.length} referenciadas |
| Vídeos | ${vids.filter((m) => m.status === 200).length} MP4 + ${externos.filter((e) => /youtube/.test(e.host)).length} vídeo(s) de YouTube |
| Iframes / embebidos | ${iframesTot} (${iframeHosts.join(', ')}) |
| Tablas convertidas a datos (JSON + CSV) | **${tablasTot}** en \`migracion/tablas/\` |
| Páginas con "Última actualización" | ${conFecha.length} (conservada en el frontmatter) |
| Palabras de contenido | ${n(palabrasTot)} |
| Enlaces externos únicos | ${n(externos.length)} (ver apartado 5) |
| Visores cartográficos | 2 copiados completos en \`public/visores/\` (${visores.length} archivos) |
| Volumen descargado | **${fmtMB(bytesTot)}** en \`public/\` |

## 1. Páginas por sección

${fila(['Sección', 'Páginas', 'Palabras', 'Documentos', 'Tablas', 'Imágenes', 'Con fecha'])}
${fila(Array(7).fill('---'))}
${Object.entries(porSeccion).sort((a, b) => b[1].paginas - a[1].paginas).map(([s, v]) => fila([s, v.paginas, n(v.palabras), v.documentos, v.tablas, v.imagenes, v.fechas])).join('\n')}

Cada página tiene:
- HTML bruto en \`migracion/raw/\`.
- Contenido limpio en \`migracion/contenido/<ruta>.md\` con frontmatter (\`titulo\`, \`ruta_antigua\`, \`seccion\`, \`ultima_actualizacion\`, \`encabezados\`, \`documentos\`, \`imagenes\`, \`videos\`, \`iframes\`, \`enlaces_externos\`, \`enlaces_internos\`, \`tablas\`, \`referencias_rotas\`, \`contenido_oculto_en_origen\`).
- Texto plano normalizado en \`migracion/texto-plano/\`, para la comparación de la Fase 5.

Los enlaces a documentos e imágenes del Markdown ya apuntan a su ruta nueva (\`/documentos/…\`, \`/imagenes/…\`). Los enlaces entre páginas siguen apuntando a la URL antigua completa y se reescribirán con \`mapa-urls.csv\` en la Fase 2.

## 2. Colecciones estructuradas (\`migracion/colecciones/\`)

| Colección | Registros | Notas |
|---|---|---|
| Noticias | ${colecciones.noticias} | Titular, fecha, cuerpo, imagen, fuente externa y adjuntos. ${colNoticias.filter((x) => !x.fecha).length} sin fecha en origen. |
| Anuncios | ${colecciones.anuncios} | Título, texto, nº de expediente (tal cual) y PDF/mapa. La web actual no muestra la fecha de publicación. |
| Juntas (sesiones) | ${colecciones.juntas} | Junta de Gobierno / Junta General, fecha y acta PDF. |
| Órganos de gobierno | ${colecciones['organos-gobierno']} bloques | Presidente, Vicepresidente, Junta General, Junta de Gobierno y Gerente, con cargos y nombres tal cual. |
| Presas | ${colPresas.inventarios.length} inventarios | ${colPresas.inventarios.map((i) => `${i.titulo.replace(/\s+/g, ' ')} (${i.total})`).join(' · ')} + archivo técnico (${colPresas.archivo_tecnico.length} documentos). |
| Volúmenes de presas | ${colecciones.volumenes} años (Excel) | 2024-2026 extraídos del Excel: 8 embalses × 12 meses (altura, volumen, variación, % embalsado), totales y notas. 2021 y 2023 solo existen en PDF. CSV plano en \`volumenes/volumenes-mensuales.csv\`. |
| Normativa | ${colecciones.normativa} normas | Ámbito, título, descripción, código, categoría, fecha de alta, estado (solo cuando el origen lo indica), enlaces oficiales y texto completo. |
| Planificación | ${colecciones.planificacion} páginas | Documentos agrupados por ciclo y bloque (PH, PGRI, art. 47, DMA, Red de Control). |
| Transparencia | ${colecciones.transparencia} páginas | Documentos por apartado y año. |
| Fondos europeos | ${colecciones['fondos-europeos']} páginas | FEDER (2 páginas), NextGenerationEU y subvenciones al sobrecoste. |
| Elecciones de consejeros | ${colecciones.elecciones} documentos | Agrupados por convocatoria. |
| Portada | 1 | Vídeo, noticia destacada, menú (${colPortada.menu_principal.length} desplegables), slider (${colPortada.slider.length}), ${colPortada.accesos_rapidos.length} accesos rápidos, tarjetas, RRSS, pie, **${colPortada.avisos_inactivos.length} avisos y ${colPortada.banners_inactivos.length} banners inactivos**. |
| Otros listados | ${colecciones['servicios-documentos']} páginas | Descarga de documentos, tasas, tarifas, Salto de Chira, pluviómetros, divulgación, jornadas y legales. |

## 3. Hallazgos técnicos de la web actual

1. **Carga por AJAX desde la home.** \`xzy('pagina.php')\` inyecta cada sección dentro de la home. Sus rutas relativas se resuelven contra \`/\` y no contra la carpeta del fragmento, y de ahí vienen los enlaces rotos de Cartografía y Divulgación. El rastreo prueba ambas bases y se queda con la que responde: ${Object.entries(resol).map(([k, v]) => `${k}: ${n(v)}`).join(' · ')}.
2. **HTTP 300 "Multiple Choices".** Cuando un archivo no existe, el servidor (Apache \`mod_speling\`) propone nombres parecidos en lugar de devolver un 404. Esas respuestas se tratan como archivo inexistente y **no se sustituyen** por la sugerencia.
3. **Contenido comentado en el HTML.** Hay avisos, banners y enlaces que siguen en el código pero no se ven. Se han guardado aparte (\`migracion/contenido-oculto/\`, ${ocultoFiles} páginas) y se marcan como \`contenido_oculto_en_origen\`, para decidir con el cliente si se publican. ${docsSoloOcultos.length} documentos solo aparecen en esos comentarios.
4. **Avisos y banners de portada inactivos.** Las alertas (lluvias 12/12/2025, borrasca Therese, corte eléctrico 2021…) y los banners de Canagua y Foro Ecoislas están comentados. Se migran con \`activo: false\` para poder reactivarlos desde el CMS.
5. **Visor del Censo de Instalaciones.** Lleva incrustados **${n(registrosCenso)} registros con coordenadas** (código, nombre, tipo, municipio, estado), útiles para el mapa nuevo. Cada registro enlaza una ficha PDF (\`/cartografia/CIfichas/<id>/public.pdf\`, unos 1,5 MB), en total **unos 7 GB**, que **no se han descargado** a la espera de decisión.
6. **Dependencias externas de los visores.** Usan unpkg/cdnjs, las teselas de \`tile.openstreetmap.se/hydda\` (servicio retirado) y los WMS de GRAFCAN. En la web nueva se sustituirán por recursos propios y proveedores vigentes.
7. **Página de normativa \`canarias/instalaciones_suministros.php\`.** En el índice aparece como «Instalaciones interiores de suministro de agua. Orden de 12 de abril de 1996…», pero su ficha repite el título y la descripción de la Ley 12/1990 de Aguas de Canarias. Hay que revisarlo con el cliente; no se ha modificado.
8. **Presas asignadas al Consejo.** La tabla recoge 9 presas y una nota al pie («* Supuesto que Soria no excede…»).

## 4. Documentos enlazados que no existen en el servidor (${docsNoExisten.length})

La web actual los enlaza, pero el servidor responde 404 o 300. **No se pueden migrar** si el cliente no aporta el archivo.

| Documento | Estado | Página | Sugerencia del servidor |
|---|---|---|---|
${docsNoExisten.map((m) => {
  const e = estado[keyOf(new URL(m.urlAntigua))] ?? {};
  const oculto = docsSoloOcultos.includes(m) ? ' (solo en HTML comentado)' : '';
  return fila([`\`${m.rutaAntigua}\``, `${m.status}${oculto}`, m.paginas.map((p) => `\`${p}\``).join(', '), (e.sugerencias ?? []).map((s) => `\`${s.replace('https://www.aguasgrancanaria.com', '')}\``).join(', ') || '—']);
}).join('\n')}

Falsos positivos del inventario (${falsosPositivos.length}): ${falsosPositivos.map((m) => `\`${m.rutaAntigua}\``).join(', ')}. Son enlaces a boe.es y administracionelectronica.gob.es que el inventario resolvió como rutas internas. En el rastreo figuran como enlaces externos.

## 5. Enlaces externos

${Object.entries(extEstado).map(([k, v]) => `- ${k}: ${n(v)}`).join('\n')}
- Dominios obsoletos: ${n(obsoletos.length)} enlaces (${[...new Set(obsoletos.map((o) => o.host))].join(', ') || '—'}).
- IPs de red interna: ${ipsInternas.length ? ipsInternas.map((e) => `\`${e.url}\` en ${e.paginas.map((p) => `\`${p}\``).join(', ')}`).join('; ') : 'no se han encontrado en el HTML actual (el prompt las anticipaba; es posible que ya se hayan retirado)'}.

El detalle está en \`migracion/enlaces-externos-rotos.md\`. Ningún enlace se ha eliminado.

## 6. Decisiones pendientes para el cliente

1. **Fichas PDF del Censo de Instalaciones** (${n(registrosCenso)} PDF, unos 7 GB): ¿descargarlas y servirlas desde la web nueva, o seguir enlazándolas en el servidor actual?
2. **${docsNoExisten.length} documentos inexistentes** (apartado 4): ¿los aporta el cliente o se retiran los enlaces?
3. **Contenido comentado** (avisos, banners, documentos antiguos): ¿se publica, se archiva o se descarta?
4. **Enlaces externos caídos** (sobre todo los ${n(externos.filter((e) => e.host === 'www.carreteros.org').length)} artículos de carreteros.org del Pliego de Cláusulas): ¿sustituir por BOE consolidado, mantener o retirar?
5. **Alojamiento de documentos:** con ${fmtMB(bytesTot)} de archivos (el mayor, de 361 MB), conviene servirlos desde el propio servidor o desde almacenamiento de objetos y no desde el repositorio Git ni un CDN estático con límites de tamaño.

## 7. Archivos generados

| Archivo | Contenido |
|---|---|
| \`migracion/inventario.json\` | Inventario consolidado (páginas, documentos con checksum, imágenes, vídeos, visores, totales) |
| \`migracion/crawl.json\` | Resultado bruto del rastreo con todas las referencias y cómo se resolvió cada una |
| \`migracion/paginas.json\` | Métricas por página |
| \`migracion/medios.json\` · \`mapa-documentos.csv\` | Cada documento/imagen/vídeo: URL antigua → ruta nueva, estado HTTP, bytes y SHA-256 |
| \`migracion/contenido/\` | ${paginas.length} páginas en Markdown con frontmatter |
| \`migracion/contenido-oculto/\` | Bloques comentados en el HTML actual |
| \`migracion/tablas/\` | ${tablasTot} tablas en JSON y CSV |
| \`migracion/colecciones/\` | Colecciones estructuradas (apartado 2) |
| \`migracion/enlaces-externos.json\` · \`enlaces-externos-rotos.md\` | Estado de los enlaces externos |
| \`migracion/erratas-corregidas.md\` · \`textos-nuevos.md\` | Registros para validación del cliente |
| \`public/documentos/\` · \`imagenes/\` · \`videos/\` · \`visores/\` | Archivos descargados |
`;
fs.writeFileSync(path.join(MIGRACION, 'cobertura-fase1.md'), md, 'utf8');
log('inventario.json y cobertura-fase1.md generados.', inventario.totales);
