// Genera migracion/textos-nuevos.md: todo el texto que no existe en la web anterior, para validación del cliente.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, MIGRACION, readJSON } from '../scrape/lib.mjs';

const arq = readJSON(path.join(ROOT, 'src', 'data', 'arquitectura.json'));
const filas = [];
const add = (ubic, texto, motivo) => filas.push({ ubic, texto, motivo });
const rec = (lista) => {
  for (const n of lista) {
    if (n.entradilla) add(`Entradilla de «${n.titulo}» (${n.url})`, n.entradilla, 'Introducción de sección');
    if (!n.antigua && !n.externo && !n.alias_de) add(`Título de página nueva ${n.url}`, n.titulo, 'Página índice o herramienta nueva');
    if (n.hijos) rec(n.hijos);
  }
};
rec([...arq.transversales, ...arq.secciones, ...arq.legales]);
for (const m of arq.menu) add('Menú principal', m.titulo, 'Agrupa secciones en el mega-menú');
for (const p of arq.perfiles) {
  add('Portada · accesos por perfil', p.titulo, 'Navegación por tipo de visitante (propuesta)');
  add(`Portada · perfil «${p.titulo}»`, p.entradilla, 'Descripción del perfil');
}

const MANUAL = [
  ['Portada · titular', 'El agua de Gran Canaria, en datos y en paisaje', 'Concepto de diseño'],
  ['Portada · buscador', 'Buscar trámites, documentos, normativa…', 'Texto de ejemplo del buscador'],
  ['Portada · bloque de cifras', 'Gran Canaria en cifras / Una isla que ha aprendido a guardar cada gota', 'Encabezados de sección'],
  ['Portada · cifras', 'grandes presas en la isla · de aguas superficiales que el Cabildo puede almacenar en sus presas · puntos de observación en la red pluviométrica · concesiones de aprovechamientos de agua superficiales · instalaciones hidráulicas subterráneas en el censo insular · Ver fuente', 'Rótulos de las cifras (los números proceden de la web actual)'],
  ['Portada · embalses', 'Estado de los embalses / Presas gestionadas por el Consejo / Lecturas de fin de mes / embalsado respecto al volumen máximo / volumen teórico total / Ver el panel de embalses', 'Rótulos del bloque de datos'],
  ['Portada · perfiles y actualidad', '¿Qué necesitas? / Encuentra lo que buscas según quién eres / Actualidad / Noticias del agua en Gran Canaria / Todas las noticias / Ver todos los anuncios', 'Encabezados y botones'],
  ['Portada · vídeo', 'Ver vídeo: Central Reversible Chira-Soria / Pausar vídeo', 'Control accesible del vídeo'],
  ['Rótulos de menú renombrados', 'Estado de los embalses (antes «Volúmenes de Las Presas») · Registro y descarga de documentos · Tarifas, cánones y precios públicos · Plan de Gestión del Riesgo de Inundación · Enlaces de interés · Actuaciones FEDER: AQUAMAC y POI Canarias · Art. 47 · Volumen I / Volumen II / Normativa · Portal de Transparencia (sede externa)', 'Rótulos de menú más descriptivos (el título original se conserva en la página)'],
  ['Panel de embalses', 'Año / Mes / Descargar el Excel original / Porcentaje embalsado por presa / Evolución del % embalsado total (sin Soria) / Volumen embalsado a fin de mes (m³) / Datos del Excel publicado por el Consejo… / Archivo de lecturas', 'Rótulos de las gráficas y la tabla'],
  ['Presas', 'Estado de los embalses · Lecturas mensuales, gráficas y Excel descargables / Archivo técnico · Documentación técnica de las presas / Mapa de presas (KMZ) · Capa para Google Earth u otros visores / Embalses del Consejo · Ver el panel', 'Accesos rápidos'],
  ['Censo de instalaciones', 'Instalaciones censadas / Buscar por código o nombre / Limpiar / Leyenda / Cada instalación enlaza su ficha en PDF… / Abrir el visor original / Ver los resultados como listado (primeros 200) / Descargar ficha (PDF)', 'Rótulos del mapa (los campos y los valores son los del visor original)'],
  ['Normativa', 'Buscar por título, número o descripción / Categoría / Estado / Derogada (total o parcialmente) / Sin indicación de derogación / Ficha de la norma / Enlaces oficiales / Índice / Volver arriba / Listado original de la página de normativa', 'Filtros y ficha'],
  ['Juntas y sesiones', 'Juntas de Gobierno / Juntas Generales (pestañas) / Texto original de la página', 'Pestañas (rótulos tomados del original)'],
  ['Anuncios', 'Buscar por expediente, lugar o municipio / Tipo de anuncio / Todos', 'Filtros'],
  ['Avisos', 'Avisos en vigor / No hay avisos activos en este momento / Avisos anteriores / Más información', 'Página nueva'],
  ['Noticias', 'Documentos adjuntos / Fuente: / Anterior / Siguiente / Más noticias / Anteriores / Siguientes', 'Navegación'],
  ['Buscador', 'Buscar en la web del Consejo… / Buscando… / N resultados para «…» / El índice de búsqueda se genera al publicar la web… / Accesos directos (lista del antiguo buscador de la portada)', 'Página nueva'],
  ['Centro de documentos', 'Buscar / Sección / Formato / Año / Documento · Página · Formato · Tamaño', 'Página nueva'],
  ['Contenido de terceros (YouTube, Google Maps)', 'Este contenido se sirve desde {YouTube | Google Maps}, que puede instalar cookies propias. / Cargar vídeo / Cargar mapa / Abrir en {…}', 'Fachada de privacidad (nada se carga sin pedirlo)'],
  ['Enlaces a documentos sin texto en origen', 'PDF · Excel · ODS · Word · ZIP · Enlace', 'Rótulo por formato para ≈270 enlaces que en origen eran solo un icono'],
  ['Documentos inexistentes en origen', '(no disponible)', 'Marca junto al enlace, que no se borra'],
  ['Enlaces externos', '(abre en una ventana nueva)', 'Texto solo para lectores de pantalla'],
  ['Cabecera y pie', 'Saltar al contenido / Buscar en la web / Abrir menú / Cerrar menú / Cambiar entre modo claro y oscuro / En esta sección: … / Información del Consejo / Teléfono:', 'Accesibilidad y navegación'],
  ['Tablas', 'Descargar CSV / Tabla de datos (desplazable)', 'Herramientas de tabla'],
  ['Página 404', 'No encontramos esta página / Es posible que la dirección haya cambiado con la nueva web del Consejo… / ¿Qué estabas buscando? / Ir al inicio / Mapa web', 'Página nueva'],
  ['Portada · logotipo Salto de Chira', 'Texto alternativo: «Salto de Chira»', 'Texto alternativo'],
  ['Mapa de presas', 'Mapa de presas / N presas del mapa publicado por el Consejo (KMZ)… / Todas · Grandes · Pequeñas / Buscar presa / Grandes presas · Presas pequeñas / Ficha de la presa (PDF) / Ficha no disponible', 'Rótulos del mapa (los datos son los del KMZ)'],
  ['Pluviómetros', 'Estaciones en la tabla / Media de las medias anuales / Mayor media anual / Estaciones por media anual / Media anual según la cota, por zona / Posición aproximada a partir de las coordenadas UTM de la tabla / Buscar estación / Ficha de la estación (PDF)', 'Mapa, gráfica y tabla nuevos a partir del Excel publicado'],
  ['Panel de embalses (años en PDF)', 'Descargar el PDF original / Datos de este año extraídos del PDF publicado por el Consejo… Ante cualquier discrepancia prevalece el documento original.', 'Aviso de procedencia de los datos 2021 y 2023'],
  ['Visor de imágenes y PDF', 'Vista previa / Abrir en otra pestaña / Descargar / Cerrar visor / Imagen anterior / Imagen siguiente / Imagen N de M / Si la vista previa no se muestra en su dispositivo…', 'Galería y vista previa de documentos'],
  ['Imágenes inexistentes en origen', 'Imagen (no disponible)', 'Marca en lugar de una imagen que no existe en el servidor antiguo'],
  ['Descripciones para buscadores (meta description)', 'Extracto automático del primer párrafo de cada página; en las páginas nuevas, su entradilla', 'Editable por página desde el CMS'],
];
for (const [u, t, m] of MANUAL) add(u, t, m);

const esc = (s) => String(s).replace(/\|/g, '/');
const md = `# Textos nuevos (pendientes de validación por el cliente)

Todo texto que **no existe en la web anterior** y se ha creado para la nueva: títulos de sección, entradillas, rótulos de botones y filtros, textos alternativos y microcopy de navegación. El contenido migrado (textos, cifras, nombres, fechas y expedientes) **no** figura aquí porque se ha copiado tal cual.

- En la Fase 1 (extracción) no se creó ningún texto de cara al público.
- Generado por \`scripts/contenido/textos-nuevos.mjs\` (${filas.length} entradas).

| # | Ubicación | Texto nuevo | Motivo | Estado |
|---|---|---|---|---|
${filas.map((f, i) => `| ${i + 1} | ${esc(f.ubic)} | ${esc(f.texto)} | ${esc(f.motivo)} | Pendiente |`).join('\n')}

## Pendiente de redactar por el cliente (no se ha inventado)

- **Textos alternativos** de las imágenes de contenido que no los tenían en origen. Se publican como decorativas (\`alt=""\`) hasta que el cliente los redacte; la lista está en \`migracion/contenido/*.md\`, campo \`imagenes\`, con \`alt: ""\`.
- **Subtítulos o transcripción** de los vídeos Chira-Soria, Campaña de Ahorro y Evolución del Acuífero.
- **Declaración de accesibilidad** según el modelo del RD 1112/2018 (hueco preparado en \`/accesibilidad/\`).
`;
fs.writeFileSync(path.join(MIGRACION, 'textos-nuevos.md'), md, 'utf8');
console.log('textos-nuevos.md:', filas.length, 'entradas');
