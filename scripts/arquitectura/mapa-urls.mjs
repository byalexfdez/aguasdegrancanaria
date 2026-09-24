// Fase 2 — Arquitectura de información.
// Genera:
//   src/data/arquitectura.json   árbol de secciones y páginas (menú, migas, submenús, mapa web)
//   migracion/mapa-urls.csv      ruta antigua → URL nueva (páginas, documentos, imágenes, vídeos, visores)
//   migracion/arquitectura.md    mapa visual de la nueva estructura
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, MIGRACION, readJSON, writeJSON, toCsv, log } from '../scrape/lib.mjs';

const paginas = readJSON(path.join(MIGRACION, 'paginas.json'));
const medios = readJSON(path.join(MIGRACION, 'medios.json'));
const tituloDe = Object.fromEntries(paginas.map((p) => [p.ruta, p.titulo]));

const EXT = (url) => ({ externo: true, url });
const slug = (s) => s.replace(/\.(php|html?)$/, '').replace(/_/g, '-').toLowerCase();

// ------------------------------------------------------------------ árbol
// Cada nodo: { id, titulo, url, antigua?: ruta antigua, entradilla?: texto nuevo, hijos?: [] , externo? }
const normativa = (ambito, carpeta, prefijo) => paginas
  .filter((p) => p.ruta.startsWith(`/servicios/legislacion/${carpeta}/`))
  .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
  .map((p) => ({ id: `norma-${carpeta}-${slug(path.basename(p.ruta))}`, titulo: p.titulo, url: `/servicios/normativa/${prefijo}/${slug(path.basename(p.ruta))}/`, antigua: p.ruta, oculto_en_menu: true }));

const SLUG_DMA = { planifiacion_hidrologica: 'instruccion-planificacion-hidrologica-borrador-v10' };
const dma = paginas.filter((p) => p.ruta.startsWith('/planhidro/directiva/marco_agua/'))
  .map((p) => { const b = path.basename(p.ruta, '.php'); return { id: `dma-${b}`, titulo: p.titulo.split(' - ')[0], url: `/planificacion/directiva-marco-del-agua/documentos/${SLUG_DMA[b] ?? slug(b)}/`, antigua: p.ruta, oculto_en_menu: true }; });

const CARTO = [
  ['medio_fisico', 'medio-fisico', [['barrancos_cuencas', 'barrancos-y-cuencas'], ['cultivos', 'cultivos'], ['permeabilidad', 'permeabilidad'], ['relieve', 'relieve']]],
  ['marco', 'marco-administrativo', [['masas', 'masas-de-agua'], ['zonificacion', 'zonificacion']]],
  ['infraestructura', 'infraestructuras-hidraulicas', [['consejo', 'infraestructuras-del-consejo'], ['depuradoras', 'depuradoras-y-desaladoras'], ['pozos', 'pozos'], ['presas', 'presas']]],
  ['gestion', 'gestion-del-agua', [['pluviometria', 'pluviometria'], ['redes', 'redes-de-control']]],
  ['tematica', 'cartografia-tematica', [['consumos', 'consumos-agrarios'], ['precipitaciones', 'precipitaciones']]],
];
const TITULO_CARTO = { medio_fisico: 'Medio físico', marco: 'Marco administrativo', infraestructura: 'Infraestructuras hidráulicas', gestion: 'Gestión del agua', tematica: 'Cartografía temática' };

const PLAN88 = [
  ['punto_partida', 'el-medio-como-punto-de-partida'], ['ciclo_hidrologico', 'el-ciclo-hidrologico'], ['recursos_superficiales', 'recursos-superficiales'],
  ['recursos_subterraneos', 'recursos-subterraneos'], ['recursos_no_naturales', 'recursos-no-naturales'], ['uso_agua', 'el-uso-del-agua'],
  ['escenario', 'escenarios-futuros'], ['opciones', 'eleccion-de-opciones'], ['principios_directrices', 'principios-directrices-y-previsiones'],
  ['programa_acutacion', 'programa-de-actuacion'], ['ordenanzas', 'las-ordenanzas'],
];
const P88 = '/divulgacion/plan-hidrologico-1988';
const tablas88 = [
  ['/divulgacion/recu_super/tabla1.php', `${P88}/recursos-superficiales/tabla-1-grandes-presas/`, 'recursos_superficiales'],
  ['/divulgacion/recu_super/tabla2.php', `${P88}/recursos-superficiales/tabla-2-obras-de-almacenamiento/`, 'recursos_superficiales'],
  ['/divulgacion/recu_no/tabla1.html', `${P88}/recursos-no-naturales/tabla-1-estaciones-depuradoras/`, 'recursos_no_naturales'],
  ['/divulgacion/recu_no/tabla2.html', `${P88}/recursos-no-naturales/tabla-2-desaladoras-de-agua-de-mar/`, 'recursos_no_naturales'],
  ['/divulgacion/recu_no/tabla3.html', `${P88}/recursos-no-naturales/tabla-3-desaladoras-de-agua-salobre/`, 'recursos_no_naturales'],
];

const n = (id, titulo, url, antigua, extra = {}) => ({ id, titulo, url, ...(antigua ? { antigua } : {}), ...extra });

const secciones = [
  n('el-consejo', 'El Consejo', '/el-consejo/', '/el_consejo.php', {
    entradilla: 'Qué es el Consejo Insular de Aguas, cómo se organiza y quién lo gobierna.',
    hijos: [
      n('introduccion', 'Introducción', '/el-consejo/introduccion/', '/el_consejo/introduccion.php'),
      n('funciones', 'Funciones', '/el-consejo/funciones/', '/el_consejo/funciones.php'),
      n('organizacion', 'Organización', '/el-consejo/organizacion/', '/el_consejo/organizacion.php'),
      n('organos-de-gobierno', 'Órganos de Gobierno', '/el-consejo/organos-de-gobierno/', '/el_consejo/organos_gobierno.php'),
      n('juntas-y-sesiones', 'Juntas y sesiones', '/el-consejo/juntas-y-sesiones/', '/el_consejo/juntas.php'),
      n('elecciones', 'Elecciones de Consejeros', '/el-consejo/elecciones-de-consejeros/', '/elecciones.php'),
      n('ubicacion', 'Ubicación y contacto', '/el-consejo/ubicacion-y-contacto/', '/el_consejo/ubicacion.php'),
    ],
  }),
  n('agua', 'Agua en Gran Canaria', '/agua-en-gran-canaria/', null, {
    entradilla: 'Presas, desaladoras, pluviómetros y el resto de infraestructuras que gestionan el agua de la isla.',
    hijos: [
      n('presas', 'Presas', '/agua-en-gran-canaria/presas/', '/presas/ubicacion_presas.php', { hijos: [
        n('volumenes', 'Estado de los embalses', '/agua-en-gran-canaria/presas/volumenes/', '/presas/volumenes.php'),
        n('archivo-tecnico', 'Archivo técnico', '/agua-en-gran-canaria/presas/archivo-tecnico/', '/presas/archivo.php'),
      ] }),
      n('salto-de-chira', 'Salto de Chira', '/agua-en-gran-canaria/salto-de-chira/', '/concurso_hidro.php'),
      n('desaladoras', 'Desaladoras', '/agua-en-gran-canaria/desaladoras/', '/agua/desaladoras.php'),
      n('pluviometros', 'Pluviómetros', '/agua-en-gran-canaria/pluviometros/', '/pluviometros.php'),
      n('censo', 'Instalaciones hidráulicas subterráneas', '/agua-en-gran-canaria/instalaciones-hidraulicas-subterraneas/', '/cartografia/CensoInstalaciones/map-censo.html'),
      n('cauces', 'Inventario insular de cauces', '/agua-en-gran-canaria/inventario-insular-de-cauces/', '/cartografia/Catalogo_Cauces/index.html'),
    ],
  }),
  n('planificacion', 'Planificación', '/planificacion/', null, {
    entradilla: 'Plan Hidrológico, gestión del riesgo de inundación y Directiva Marco del Agua, ciclo a ciclo.',
    hijos: [
      n('plan-hidrologico', 'Plan Hidrológico', '/planificacion/plan-hidrologico/', '/plan_hidro.php', { hijos: [
        n('art47-v1', 'Art. 47 · Volumen I: Documento de información', '/planificacion/plan-hidrologico/art-47/volumen-1/', '/planhidro/art47/volumen1.php'),
        n('art47-v2', 'Art. 47 · Volumen II: Documento de ordenación', '/planificacion/plan-hidrologico/art-47/volumen-2/', '/planhidro/art47/volumen2.php'),
        n('art47-normativa', 'Art. 47 · Normativa', '/planificacion/plan-hidrologico/art-47/normativa/', '/planhidro/art47/normativa.php'),
      ] }),
      n('inundaciones', 'Plan de Gestión del Riesgo de Inundación', '/planificacion/riesgo-de-inundacion/', '/inundaciones.php'),
      n('dma', 'Directiva Marco del Agua', '/planificacion/directiva-marco-del-agua/', '/planhidro/directiva/marco_agua.php', { hijos: [
        n('dma-conceptos', 'Conceptos básicos', '/planificacion/directiva-marco-del-agua/conceptos-basicos/', '/planhidro/directiva/conceptos_basicos.php'),
        n('dma-antecedentes', 'Antecedentes de planificación', '/planificacion/directiva-marco-del-agua/antecedentes/', '/planhidro/directiva/antecedentes_planificacion.php'),
        n('dma-enlaces', 'Enlaces externos', '/planificacion/directiva-marco-del-agua/enlaces/', '/planhidro/directiva/enlaces_externos.php'),
        ...dma,
      ] }),
      n('red-control', 'Red de Control 2009', '/planificacion/red-de-control-2009/', '/red_control.php'),
      n('participacion', 'Participación pública', '/planificacion/participacion-publica/', null, { origen_contenido: 'Noticia destacada de la home actual (modal «Sesiones de Participación activa…»)' }),
    ],
  }),
  n('mapas', 'Mapas y cartografía', '/mapas-y-cartografia/', '/cartografia.php', {
    entradilla: 'Capas cartográficas del Consejo para consultar y descargar en varios formatos.',
    hijos: CARTO.map(([c, cs, capas]) => n(`carto-${cs}`, TITULO_CARTO[c], `/mapas-y-cartografia/${cs}/`, `/cartografia/${c}.php`, {
      hijos: capas.map(([k, ks]) => n(`capa-${ks}`, tituloDe[`/cartografia/${c}/${k}.php`] ?? ks, `/mapas-y-cartografia/${cs}/${ks}/`, `/cartografia/${c}/${k}.php`)),
    })),
  }),
  n('servicios', 'Servicios y trámites', '/servicios/', null, {
    entradilla: 'Sede electrónica, impresos, tasas, tarifas, normativa y contratación.',
    hijos: [
      n('sede', 'Sede electrónica', 'https://consejoinsularaguasgrancanaria.sedelectronica.es', null, { externo: true }),
      n('documentos-registro', 'Registro y descarga de documentos', '/servicios/descarga-de-documentos/', '/servicios/documento.php'),
      n('tasas', 'Tasas', '/servicios/tasas/', '/servicios/tarifa.php'),
      n('tarifas', 'Tarifas, cánones y precios públicos', '/servicios/tarifas-canones-y-precios-publicos/', '/servicios/tarifas.php'),
      n('normativa', 'Normativa', '/servicios/normativa/', '/servicios/legislacion.php', { hijos: [
        n('normativa-canarias', 'Canarias', '/servicios/normativa/canarias/', null, { hijos: normativa('Canarias', 'canarias', 'canarias') }),
        n('normativa-espana', 'España', '/servicios/normativa/espana/', null, { hijos: normativa('España', 'españa', 'espana') }),
        n('normativa-ue', 'Unión Europea', '/servicios/normativa/union-europea/', null, { hijos: normativa('Unión Europea', 'europa', 'union-europea') }),
      ] }),
      n('contratacion', 'Contratación', '/servicios/contratacion/', '/perfil_con.php', { hijos: [
        n('perfil-contratante', 'Perfil del contratante', '/servicios/contratacion/perfil-del-contratante/', '/perfil_con_2.php'),
      ] }),
      n('facturacion', 'Facturación electrónica', 'https://consejoinsularaguasgrancanaria.sedelectronica.es/e-invoice', null, { externo: true }),
      n('empleo', 'Empleo', 'https://consejoinsularaguasgrancanaria.sedelectronica.es/board/9753e838-f59b-11de-b600-00237da12c6a/', null, { externo: true }),
      n('enlaces', 'Enlaces de interés', '/servicios/enlaces/', '/servicios/enlaces.php'),
    ],
  }),
  n('transparencia', 'Transparencia', '/transparencia/', '/transparencia.php', {
    entradilla: 'Información pública del Consejo conforme a la Ley 19/2013 y la Ley 12/2014 de Canarias.',
    hijos: [
      n('t-institucion', 'Institucional', '/transparencia/institucional/', '/consejo.php'),
      n('t-economico', 'Económico-financiera', '/transparencia/economico-financiera/', '/economico.php'),
      n('t-presupuestos', 'Presupuestos', '/transparencia/presupuestos/', '/presupuesto.php'),
      n('t-pmp', 'Periodo medio de pago a proveedores', '/transparencia/periodo-medio-de-pago/', '/info.php'),
      n('t-contratos', 'Contratos', '/servicios/contratacion/', null, { alias_de: 'contratacion' }),
      n('t-convenios', 'Convenios y encomiendas', '/transparencia/convenios-y-encomiendas/', '/convenio.php'),
      n('t-empleados', 'Empleados públicos', '/transparencia/empleados-publicos/', '/empleados.php'),
      n('t-ayudas', 'Ayudas y subvenciones', '/transparencia/ayudas-y-subvenciones/', '/ayudas.php'),
      n('t-obras', 'Obras públicas', '/transparencia/obras-publicas/', '/obras.php'),
      n('t-patrimonio', 'Patrimonio', '/transparencia/patrimonio/', '/patrimonio.php'),
      n('t-estadistica', 'Estadística', '/transparencia/estadistica/', '/estadistica.php'),
      n('t-fomento', 'Fomento de la transparencia', '/transparencia/fomento-de-la-transparencia/', '/fomento.php'),
      n('t-portal', 'Portal de Transparencia (sede externa)', 'https://transparencia.aguasgrancanaria.com/index', null, { externo: true }),
    ],
  }),
  n('fondos', 'Fondos europeos y subvenciones', '/fondos-europeos/', null, {
    entradilla: 'Actuaciones cofinanciadas por la Unión Europea y subvenciones gestionadas por el Consejo.',
    hijos: [
      n('feder', 'Fondos FEDER', '/fondos-europeos/feder/', '/fondos_feder.php'),
      n('feder-aquamac', 'Actuaciones FEDER: AQUAMAC y POI Canarias', '/fondos-europeos/feder/actuaciones-aquamac/', '/divulgacion/fondos_feder.php'),
      n('ngeu', 'NextGenerationEU', '/fondos-europeos/nextgenerationeu/', '/nextgeneration.php'),
      n('sobrecoste', 'Subvenciones al sobrecoste', '/fondos-europeos/subvenciones-al-sobrecoste/', '/subvenciones.php'),
    ],
  }),
  n('divulgacion', 'Divulgación', '/divulgacion/', '/divulgacion.php', {
    entradilla: 'Vídeos, consejos de ahorro, publicaciones y la historia del agua en Gran Canaria.',
    hijos: [
      n('consejos-ahorro', 'Consejos de ahorro', '/divulgacion/consejos-de-ahorro/', '/consejos_ahorro.php'),
      n('riada-tasarte', 'Riada en Tasarte', '/divulgacion/riada-en-tasarte/', '/divulgacion/riada_tasarte.php'),
      n('jovenes', 'Jóvenes por el Agua', '/divulgacion/jovenes-por-el-agua/', '/divulgacion/jovenes_agua.php'),
      n('jornadas', 'Jornadas', '/divulgacion/jornadas/', '/divulgacion/jornadas.php'),
      n('articulos', 'Artículos y publicaciones', '/divulgacion/articulos-y-publicaciones/', '/divulgacion/articulos_publicaciones.php', { hijos: [
        n('art-hidrogeologico', 'Estudio hidrogeológico del este de Gran Canaria', '/divulgacion/articulos-y-publicaciones/estudio-hidrogeologico-del-este-de-gran-canaria/', '/divulgacion/articulos/estudio_hidrogeologico.php'),
        n('art-cientifico', 'Estudio científico de los recursos de agua en las Islas Canarias SPA/69/515', '/divulgacion/articulos-y-publicaciones/estudio-cientifico-recursos-de-agua-islas-canarias/', '/divulgacion/articulos/estudio_cientifico.php'),
      ] }),
      n('plan88', 'Plan Hidrológico de 1988', `${P88}/`, null, {
        hijos: PLAN88.map(([k, s]) => n(`p88-${s}`, tituloDe[`/divulgacion/${k}.php`] ?? s, `${P88}/${s}/`, `/divulgacion/${k}.php`, {
          hijos: tablas88.filter((t) => t[2] === k).map(([a, u]) => n(`p88t-${path.basename(u.replace(/\/$/, ''))}`, tituloDe[a] ?? path.basename(u), u, a)),
        })),
      }),
    ],
  }),
  n('actualidad', 'Actualidad', '/actualidad/', null, {
    entradilla: 'Noticias, anuncios oficiales y avisos del Consejo.',
    hijos: [
      n('noticias', 'Noticias', '/actualidad/noticias/', '/noticias.php'),
      n('anuncios', 'Anuncios', '/actualidad/anuncios/', '/info_public.php'),
      n('avisos', 'Avisos y alertas', '/actualidad/avisos/', null),
    ],
  }),
];

const utilidades = [
  n('u-sede', 'Sede electrónica', 'https://consejoinsularaguasgrancanaria.sedelectronica.es', null, { externo: true }),
  n('u-perfil', 'Perfil del contratante', 'https://community.vortal.biz/sts/Login?SkinName=aguasgrancanaria', null, { externo: true }),
  n('u-transparencia', 'Transparencia', '/transparencia/', null, { alias_de: 'transparencia' }),
  n('u-empleo', 'Empleo', 'https://consejoinsularaguasgrancanaria.sedelectronica.es/board/9753e838-f59b-11de-b600-00237da12c6a/', null, { externo: true }),
];
const legales = [
  n('aviso-legal', 'Aviso legal', '/aviso-legal/', '/el_consejo/avisos.php'),
  n('privacidad', 'Privacidad', '/privacidad/', '/privacidad.php'),
  n('accesibilidad', 'Accesibilidad', '/accesibilidad/', '/accesibilidad.php'),
  n('mapa-web', 'Mapa web', '/mapa-web/', null),
];
const transversales = [
  n('inicio', 'Inicio', '/', '/'),
  n('buscar', 'Buscar', '/buscar/', null),
  n('centro-documentos', 'Centro de documentos', '/centro-de-documentos/', null),
];

// Menú principal (7 entradas): Mapas se agrupa con el agua y Fondos con Transparencia.
const menu = [
  { titulo: 'El Consejo', secciones: ['el-consejo'] },
  { titulo: 'El agua', secciones: ['agua', 'mapas'] },
  { titulo: 'Planificación', secciones: ['planificacion'] },
  { titulo: 'Servicios y trámites', secciones: ['servicios'] },
  { titulo: 'Transparencia', secciones: ['transparencia', 'fondos'] },
  { titulo: 'Divulgación', secciones: ['divulgacion'] },
  { titulo: 'Actualidad', secciones: ['actualidad'] },
];

// Accesos por perfil (propuesta de Victoria Crea: navegación por tipo de visitante).
const perfiles = [
  { id: 'ciudadania', titulo: 'Ciudadanía', entradilla: 'Divulgación, datos del agua y consejos prácticos.', enlaces: ['volumenes', 'consejos-ahorro', 'noticias', 'avisos', 'divulgacion', 'pluviometros'] },
  { id: 'regantes', titulo: 'Regantes y agricultura', entradilla: 'Normativa, concesiones, impresos y trámites.', enlaces: ['documentos-registro', 'tarifas', 'tasas', 'normativa', 'anuncios', 'elecciones'] },
  { id: 'empresas', titulo: 'Empresas', entradilla: 'Contratación pública, facturación y licitaciones.', enlaces: ['contratacion', 'u-perfil', 'facturacion', 'normativa', 'sede'] },
  { id: 'administracion', titulo: 'Administración y prensa', entradilla: 'Transparencia, planificación, informes y cartografía.', enlaces: ['transparencia', 'plan-hidrologico', 'inundaciones', 'mapas', 'juntas-y-sesiones', 'noticias'] },
];

// ------------------------------------------------------------------ índices
const todos = [];
const recorrer = (nodos, padres = []) => {
  for (const x of nodos) {
    todos.push({ ...x, hijos: undefined, padres: padres.map((p) => p.id) });
    if (x.hijos) recorrer(x.hijos, [...padres, x]);
  }
};
recorrer([...transversales, ...secciones, ...utilidades, ...legales]);

// Comprobaciones: todas las rutas del inventario tienen sitio, sin URLs duplicadas.
const porAntigua = new Map();
for (const x of todos) if (x.antigua) {
  if (porAntigua.has(x.antigua)) throw new Error(`Ruta antigua asignada dos veces: ${x.antigua}`);
  porAntigua.set(x.antigua, x);
}
const sinSitio = paginas.filter((p) => !porAntigua.has(p.ruta));
if (sinSitio.length) throw new Error(`Páginas sin sitio en la arquitectura: ${sinSitio.map((p) => p.ruta).join(', ')}`);
const urls = todos.filter((x) => !x.externo && !x.alias_de).map((x) => x.url);
const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
if (dup.length) throw new Error(`URLs nuevas duplicadas: ${dup.join(', ')}`);
const ids = todos.map((x) => x.id);
for (const p of perfiles) for (const e of p.enlaces) if (!ids.includes(e)) throw new Error(`Perfil ${p.id}: enlace desconocido ${e}`);

writeJSON(path.join(ROOT, 'src', 'data', 'arquitectura.json'), { generado: new Date().toISOString(), menu, secciones, utilidades, legales, transversales, perfiles });

// ------------------------------------------------------------------ mapa-urls.csv
const filas = [];
const seccionRaiz = (x) => (x.padres[0] ? todos.find((t) => t.id === x.padres[0])?.titulo : x.titulo);
for (const p of paginas) {
  const x = porAntigua.get(p.ruta);
  const variantes = [p.ruta];
  if (/[^\x00-\x7f]/.test(p.ruta)) variantes.push(encodeURI(p.ruta)); // /españa/ y /espa%C3%B1a/
  for (const v of variantes) filas.push({ tipo: 'pagina', ruta_antigua: v, url_nueva: x.url, seccion: seccionRaiz(x), titulo: x.titulo, estado: 'ok', nota: v !== p.ruta ? 'Variante codificada de la misma URL' : '' });
}
for (const m of medios) {
  const tipo = m.tipo === 'asset' ? 'visor' : m.tipo;
  const ok = m.status === 200;
  const antigua = m.rutaAntigua;
  const vars = [antigua];
  if (/[^\x00-\x7f ]|\s/.test(antigua)) vars.push(encodeURI(antigua));
  for (const v of vars) filas.push({
    tipo, ruta_antigua: v, url_nueva: ok ? m.rutaNueva : '', seccion: '', titulo: (m.textos ?? [])[0] ?? '',
    estado: ok ? 'ok' : `no existe en origen (${m.status})`, nota: v !== antigua ? 'Variante codificada de la misma URL' : '',
  });
}
// Visores: el HTML del visor redirige a la página que lo integra.
fs.writeFileSync(path.join(MIGRACION, 'mapa-urls.csv'), toCsv(filas, ['tipo', 'ruta_antigua', 'url_nueva', 'seccion', 'titulo', 'estado', 'nota']), 'utf8');

// ------------------------------------------------------------------ arquitectura.md
const arbol = (nodos, nivel = 0) => nodos.map((x) => {
  const pad = '  '.repeat(nivel);
  const ant = x.antigua ? ` ← \`${x.antigua}\`` : (x.externo ? ' ↗ externo' : (x.alias_de ? ' (acceso directo)' : ' · *nueva*'));
  const hijosVisibles = (x.hijos ?? []).filter((h) => !h.oculto_en_menu);
  const ocultos = (x.hijos ?? []).length - hijosVisibles.length;
  let s = `${pad}- **${x.titulo}** \`${x.url}\`${ant}`;
  if (hijosVisibles.length) s += '\n' + arbol(hijosVisibles, nivel + 1);
  if (ocultos) s += `\n${pad}  - *(${ocultos} fichas: ${x.hijos.filter((h) => h.oculto_en_menu).slice(0, 2).map((h) => `\`${h.url}\``).join(', ')}…)*`;
  return s;
}).join('\n');

const mermaid = ['flowchart LR', '  H["Inicio"]', ...secciones.map((s, i) => `  H --> S${i}["${s.titulo}"]`),
  ...secciones.flatMap((s, i) => (s.hijos ?? []).filter((h) => !h.oculto_en_menu && !h.externo).slice(0, 8).map((h, j) => `  S${i} --> S${i}_${j}["${h.titulo.replace(/"/g, "'")}"]`))].join('\n');

const nPag = filas.filter((f) => f.tipo === 'pagina' && !f.nota).length;
const nuevas = todos.filter((x) => !x.antigua && !x.externo && !x.alias_de);
const md = `# Fase 2 — Arquitectura de información

Generado por \`scripts/arquitectura/mapa-urls.mjs\`. Fuente de verdad del menú, las migas de pan y el mapa web: \`src/data/arquitectura.json\`.

## Principios

1. **Todo tiene sitio.** Las ${paginas.length} páginas actuales tienen una URL nueva; el script falla si alguna queda fuera.
2. **URLs limpias en español**, sin \`.php\` y sin tildes: \`/agua-en-gran-canaria/presas/volumenes/\`.
3. **Nueve secciones** con URL propia (las del prompt). En la cabecera se agrupan en **7 entradas de mega-menú** para que quepan en 1280 px: *Mapas y cartografía* va dentro de «El agua» y *Fondos europeos* dentro de «Transparencia».
4. **Rutas por tipo de visitante** (propuesta de Victoria Crea): la portada ofrece accesos para Ciudadanía, Regantes y agricultura, Empresas, y Administración y prensa.
5. **Barra de utilidades** en todas las páginas: Sede electrónica · Perfil del contratante · Transparencia · Empleo · Buscador · Redes sociales.
6. **Pie:** dirección, teléfono, horario de registro, enlaces legales (Aviso legal, Privacidad, Accesibilidad, Enlaces, Ubicación, Mapa web), logotipos institucionales y redes sociales.

## Menú principal

${menu.map((m) => `- **${m.titulo}** → ${m.secciones.map((s) => secciones.find((x) => x.id === s).titulo).join(' + ')}`).join('\n')}

## Accesos por perfil (portada)

${perfiles.map((p) => `- **${p.titulo}** — ${p.entradilla} ${p.enlaces.map((e) => todos.find((t) => t.id === e).titulo).join(' · ')}`).join('\n')}

## Mapa del sitio

${arbol([transversales[0]])}
${arbol(secciones)}
- Utilidades: ${utilidades.map((u) => u.titulo).join(' · ')}
${arbol(legales)}
${arbol(transversales.slice(1))}

### Vista general

\`\`\`mermaid
${mermaid}
\`\`\`

## Páginas nuevas (sin equivalente directo en la web actual)

${nuevas.map((x) => `- \`${x.url}\` **${x.titulo}**${x.origen_contenido ? ` — contenido: ${x.origen_contenido}` : ' — página índice de sección o herramienta (buscador, centro de documentos, mapa web).'}`).join('\n')}

Sus textos de introducción son microcopy nuevo y se registran en \`textos-nuevos.md\`.

## Mapa de URLs

\`migracion/mapa-urls.csv\`: **${nPag} páginas** + ${filas.filter((f) => f.tipo !== 'pagina' && !f.nota).length} documentos, imágenes, vídeos y archivos de visores (con variantes codificadas: ${filas.filter((f) => f.nota).length} filas más). Cada ruta antigua se redirigirá con **301** a la nueva. Los documentos conservan su estructura de carpetas bajo \`/documentos/\`, con nombres saneados.
`;
fs.writeFileSync(path.join(MIGRACION, 'arquitectura.md'), md, 'utf8');
log(`Arquitectura OK · ${todos.length} nodos · ${nPag} páginas mapeadas · ${filas.length} filas en mapa-urls.csv · nuevas: ${nuevas.length}`);
