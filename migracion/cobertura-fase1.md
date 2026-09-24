# Cobertura de la Fase 1 — Extracción del contenido

Web de origen: https://www.aguasgrancanaria.com · Extracción: 23 de septiembre de 2026
Scripts: `scripts/scrape/01-crawl.mjs` … `06-report.mjs` (se pueden relanzar; usan caché en `migracion/cache/`).

## Resumen

| Elemento | Resultado |
|---|---|
| Páginas del inventario (163) | **163 / 163** extraídas (HTTP 200) |
| Páginas nuevas encontradas en el rastreo | 0 (el inventario estaba completo) |
| Documentos del inventario (720, incluye 6 MP4) | **689** descargados · 29 no existen en el servidor · 2 falsos positivos (enlaces externos) |
| Documentos adicionales no inventariados | 36 (36 descargados) |
| Total documentos descargados | **719** (550 pdf, 51 ods, 51 xlsx, 16 txt, 14 xml, 14 zip, 11 doc, 2 docx, 2 odt, 2 rtf, 2 rar, 2 xls, 1 ppt, 1 kmz) |
| Imágenes | 269 descargadas de 271 referenciadas |
| Vídeos | 6 MP4 + 2 vídeo(s) de YouTube |
| Iframes / embebidos | 2 (www.google.com, www.youtube.com) |
| Tablas convertidas a datos (JSON + CSV) | **258** en `migracion/tablas/` |
| Páginas con "Última actualización" | 29 (conservada en el frontmatter) |
| Palabras de contenido | 640.553 |
| Enlaces externos únicos | 1362 (ver apartado 5) |
| Visores cartográficos | 2 copiados completos en `public/visores/` (38 archivos) |
| Volumen descargado | **4094,6 MB** en `public/` |

## 1. Páginas por sección

| Sección | Páginas | Palabras | Documentos | Tablas | Imágenes | Con fecha |
| --- | --- | --- | --- | --- | --- | --- |
| Servicios › Normativa | 44 | 584.098 | 12 | 124 | 81 | 1 |
| Divulgación | 25 | 22.646 | 12 | 20 | 76 | 0 |
| Mapas y Cartografía | 22 | 851 | 40 | 0 | 76 | 0 |
| Planificación › Directiva Marco del Agua (subpáginas) | 21 | 1136 | 78 | 21 | 42 | 0 |
| Transparencia | 14 | 1857 | 284 | 45 | 5 | 12 |
| El Consejo | 8 | 3456 | 87 | 4 | 7 | 8 |
| Planificación › Plan Hidrológico | 7 | 2597 | 12 | 3 | 11 | 0 |
| Servicios | 4 | 2491 | 26 | 31 | 0 | 3 |
| Legales | 3 | 1644 | 5 | 0 | 0 | 2 |
| Fondos europeos y subvenciones | 3 | 2159 | 25 | 0 | 13 | 1 |
| Planificación | 3 | 1690 | 50 | 6 | 4 | 2 |
| Infraestructuras › Presas | 3 | 3951 | 20 | 3 | 22 | 0 |
| Infraestructuras | 2 | 2846 | 2 | 1 | 34 | 0 |
| Actualidad | 2 | 8282 | 36 | 0 | 57 | 0 |
| Inicio | 1 | 713 | 5 | 0 | 7 | 0 |
| Infraestructuras › Salto de Chira | 1 | 136 | 10 | 0 | 0 | 0 |

Cada página tiene:
- HTML bruto en `migracion/raw/`.
- Contenido limpio en `migracion/contenido/<ruta>.md` con frontmatter (`titulo`, `ruta_antigua`, `seccion`, `ultima_actualizacion`, `encabezados`, `documentos`, `imagenes`, `videos`, `iframes`, `enlaces_externos`, `enlaces_internos`, `tablas`, `referencias_rotas`, `contenido_oculto_en_origen`).
- Texto plano normalizado en `migracion/texto-plano/`, para la comparación de la Fase 5.

Los enlaces a documentos e imágenes del Markdown ya apuntan a su ruta nueva (`/documentos/…`, `/imagenes/…`). Los enlaces entre páginas siguen apuntando a la URL antigua completa y se reescribirán con `mapa-urls.csv` en la Fase 2.

## 2. Colecciones estructuradas (`migracion/colecciones/`)

| Colección | Registros | Notas |
|---|---|---|
| Noticias | 59 | Titular, fecha, cuerpo, imagen, fuente externa y adjuntos. 2 sin fecha en origen. |
| Anuncios | 24 | Título, texto, nº de expediente (tal cual) y PDF/mapa. La web actual no muestra la fecha de publicación. |
| Juntas (sesiones) | 49 | Junta de Gobierno / Junta General, fecha y acta PDF. |
| Órganos de gobierno | 5 bloques | Presidente, Vicepresidente, Junta General, Junta de Gobierno y Gerente, con cargos y nombres tal cual. |
| Presas | 3 inventarios | PRESAS ASIGNADAS AL Consejo (9) · RELACIÓN DE GRANDES PRESAS (69) · RELACÓN DE PRESAS CON MENOS DE 15 m DE ALTURA Y MENOS DE 100.000 m³ DE CAPACIDAD (96) + archivo técnico (8 documentos). |
| Volúmenes de presas | 3 años (Excel) | 2024-2026 extraídos del Excel: 8 embalses × 12 meses (altura, volumen, variación, % embalsado), totales y notas. 2021 y 2023 solo existen en PDF. CSV plano en `volumenes/volumenes-mensuales.csv`. |
| Normativa | 43 normas | Ámbito, título, descripción, código, categoría, fecha de alta, estado (solo cuando el origen lo indica), enlaces oficiales y texto completo. |
| Planificación | 31 páginas | Documentos agrupados por ciclo y bloque (PH, PGRI, art. 47, DMA, Red de Control). |
| Transparencia | 14 páginas | Documentos por apartado y año. |
| Fondos europeos | 4 páginas | FEDER (2 páginas), NextGenerationEU y subvenciones al sobrecoste. |
| Elecciones de consejeros | 22 documentos | Agrupados por convocatoria. |
| Portada | 1 | Vídeo, noticia destacada, menú (4 desplegables), slider (3), 21 accesos rápidos, tarjetas, RRSS, pie, **5 avisos y 2 banners inactivos**. |
| Otros listados | 9 páginas | Descarga de documentos, tasas, tarifas, Salto de Chira, pluviómetros, divulgación, jornadas y legales. |

## 3. Hallazgos técnicos de la web actual

1. **Carga por AJAX desde la home.** `xzy('pagina.php')` inyecta cada sección dentro de la home. Sus rutas relativas se resuelven contra `/` y no contra la carpeta del fragmento, y de ahí vienen los enlaces rotos de Cartografía y Divulgación. El rastreo prueba ambas bases y se queda con la que responde: relativa-pagina: 1435 · absoluta: 4537 · relativa-raiz: 132 · rota: 94.
2. **HTTP 300 "Multiple Choices".** Cuando un archivo no existe, el servidor (Apache `mod_speling`) propone nombres parecidos en lugar de devolver un 404. Esas respuestas se tratan como archivo inexistente y **no se sustituyen** por la sugerencia.
3. **Contenido comentado en el HTML.** Hay avisos, banners y enlaces que siguen en el código pero no se ven. Se han guardado aparte (`migracion/contenido-oculto/`, 11 páginas) y se marcan como `contenido_oculto_en_origen`, para decidir con el cliente si se publican. 60 documentos solo aparecen en esos comentarios.
4. **Avisos y banners de portada inactivos.** Las alertas (lluvias 12/12/2025, borrasca Therese, corte eléctrico 2021…) y los banners de Canagua y Foro Ecoislas están comentados. Se migran con `activo: false` para poder reactivarlos desde el CMS.
5. **Visor del Censo de Instalaciones.** Lleva incrustados **4965 registros con coordenadas** (código, nombre, tipo, municipio, estado), útiles para el mapa nuevo. Cada registro enlaza una ficha PDF (`/cartografia/CIfichas/<id>/public.pdf`, unos 1,5 MB), en total **unos 7 GB**, que **no se han descargado** a la espera de decisión.
6. **Dependencias externas de los visores.** Usan unpkg/cdnjs, las teselas de `tile.openstreetmap.se/hydda` (servicio retirado) y los WMS de GRAFCAN. En la web nueva se sustituirán por recursos propios y proveedores vigentes.
7. **Página de normativa `canarias/instalaciones_suministros.php`.** En el índice aparece como «Instalaciones interiores de suministro de agua. Orden de 12 de abril de 1996…», pero su ficha repite el título y la descripción de la Ley 12/1990 de Aguas de Canarias. Hay que revisarlo con el cliente; no se ha modificado.
8. **Presas asignadas al Consejo.** La tabla recoge 9 presas y una nota al pie («* Supuesto que Soria no excede…»).

## 4. Documentos enlazados que no existen en el servidor (29)

La web actual los enlaza, pero el servidor responde 404 o 300. **No se pueden migrar** si el cliente no aporta el archivo.

| Documento | Estado | Página | Sugerencia del servidor |
|---|---|---|---|
| `/pdfs/Cartografia/RedControl.zip` | 300 | `/cartografia/gestion/redes.php` | `/pdfs/Cartografia/RedControl.pdf`, `/pdfs/Cartografia/RedControl.jpg` |
| `/pdfs/InfPu/PMP-2023-06.pdf` | 404 (solo en HTML comentado) | `/info.php` | — |
| `/pdfs/InfPu/PMP-2024-07.pdf` | 404 (solo en HTML comentado) | `/info.php` | — |
| `/pdfs/InfPu/PMP-2024-10.pdf` | 404 (solo en HTML comentado) | `/info.php` | — |
| `/pdfs/InfPu/PMP-2024-12.pdf` | 404 (solo en HTML comentado) | `/info.php` | — |
| `/pdfs/Transparencia/20241018 RPT CIAGC 2024.ods` | 300 | `/empleados.php` | `/pdfs/Transparencia/20241018%20RPT%20CIAGC%202024.pdf`, `/pdfs/Transparencia/20241018%20RPT%20CIAGC%202024.txt` |
| `/pdfs/Transparencia/20241018 RPT CIAGC 2024.xlsx` | 300 | `/empleados.php` | `/pdfs/Transparencia/20241018%20RPT%20CIAGC%202024.pdf`, `/pdfs/Transparencia/20241018%20RPT%20CIAGC%202024.txt` |
| `/pdfs/Transparencia/actividades_economicas_2023.ods` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/actividades_economicas_2023.pdf` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/actividades_economicas_2023.xlsx` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/actividades_economicas_2024.ods` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/actividades_economicas_2024.xlsx` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/arrendamiento_inmuebles_2023.ods` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/arrendamiento_inmuebles_2023.xlsx` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Auditoria_cuentas_2023.ods` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Auditoria_cuentas_2023.xlsx` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Balance-2023.pdf` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Balance-2023.xlsx`, `/pdfs/Transparencia/Balance-2023.ods` |
| `/pdfs/Transparencia/Cuentas_Anuales_2023.pdf` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Cuentas_Anuales_2023.xlsx`, `/pdfs/Transparencia/Cuentas_Anuales_2023.ods` |
| `/pdfs/Transparencia/Liquidacion-ppto-2023.ods` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Liquidacion-ppto-2023.pdf` |
| `/pdfs/Transparencia/Liquidacion-ppto-2023.xlsx` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Liquidacion-ppto-2023.pdf` |
| `/pdfs/Transparencia/Mesa-20240131.docx` | 300 | `/perfil_con.php` | `/pdfs/Transparencia/Mesa-20240131.pdf`, `/pdfs/Transparencia/Mesa-20240131.txt` |
| `/pdfs/Transparencia/Mesa-20240131.odt` | 300 | `/perfil_con.php` | `/pdfs/Transparencia/Mesa-20240131.pdf`, `/pdfs/Transparencia/Mesa-20240131.txt` |
| `/pdfs/Transparencia/Modificaciones_presupuestarias_2023.ods` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Modificaciones_presupuestarias_2023.pdf` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Modificaciones_presupuestarias_2023.xlsx` | 404 | `/presupuesto.php` | — |
| `/pdfs/Transparencia/Movimiento-Tesoreria-2023.pdf` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Movimiento-Tesoreria-2023.xlsx`, `/pdfs/Transparencia/Movimiento-Tesoreria-2023.ods` |
| `/pdfs/Transparencia/Presupuesto_2019.pdf` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Presupuesto_2019.ods`, `/pdfs/Transparencia/Presupuesto_2019.xlsx` |
| `/pdfs/Transparencia/Presupuesto_Detallado_2024.ods` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Presupuesto_Detallado_2024.pdf` |
| `/pdfs/Transparencia/Presupuesto_Detallado_2024.xlsx` | 300 | `/presupuesto.php` | `/pdfs/Transparencia/Presupuesto_Detallado_2024.pdf` |

Falsos positivos del inventario (2): `/boe/dias/2007/11/21/pdfs/A47567-47572.pdf`, `/pae_Home/dam/jcr:d09286f0-8771-4922-8241-0925d771b5e7/Norma_UNE_139803_2012.pdf`. Son enlaces a boe.es y administracionelectronica.gob.es que el inventario resolvió como rutas internas. En el rastreo figuran como enlaces externos.

## 5. Enlaces externos

- ok: 102
- sin-respuesta: 58
- redirige-a-otro-dominio: 8
- roto: 1177
- bloqueado-o-restringido: 17
- Dominios obsoletos: 1192 enlaces (europa.eu.int, forum.europa.eu.int, noticias.juridicas.com, www.carreteros.org, www.juridicas.com).
- IPs de red interna: no se han encontrado en el HTML actual (el prompt las anticipaba; es posible que ya se hayan retirado).

El detalle está en `migracion/enlaces-externos-rotos.md`. Ningún enlace se ha eliminado.

## 6. Decisiones pendientes para el cliente

1. **Fichas PDF del Censo de Instalaciones** (4965 PDF, unos 7 GB): ¿descargarlas y servirlas desde la web nueva, o seguir enlazándolas en el servidor actual?
2. **29 documentos inexistentes** (apartado 4): ¿los aporta el cliente o se retiran los enlaces?
3. **Contenido comentado** (avisos, banners, documentos antiguos): ¿se publica, se archiva o se descarta?
4. **Enlaces externos caídos** (sobre todo los 1165 artículos de carreteros.org del Pliego de Cláusulas): ¿sustituir por BOE consolidado, mantener o retirar?
5. **Alojamiento de documentos:** con 4094,6 MB de archivos (el mayor, de 361 MB), conviene servirlos desde el propio servidor o desde almacenamiento de objetos y no desde el repositorio Git ni un CDN estático con límites de tamaño.

## 7. Archivos generados

| Archivo | Contenido |
|---|---|
| `migracion/inventario.json` | Inventario consolidado (páginas, documentos con checksum, imágenes, vídeos, visores, totales) |
| `migracion/crawl.json` | Resultado bruto del rastreo con todas las referencias y cómo se resolvió cada una |
| `migracion/paginas.json` | Métricas por página |
| `migracion/medios.json` · `mapa-documentos.csv` | Cada documento/imagen/vídeo: URL antigua → ruta nueva, estado HTTP, bytes y SHA-256 |
| `migracion/contenido/` | 163 páginas en Markdown con frontmatter |
| `migracion/contenido-oculto/` | Bloques comentados en el HTML actual |
| `migracion/tablas/` | 258 tablas en JSON y CSV |
| `migracion/colecciones/` | Colecciones estructuradas (apartado 2) |
| `migracion/enlaces-externos.json` · `enlaces-externos-rotos.md` | Estado de los enlaces externos |
| `migracion/erratas-corregidas.md` · `textos-nuevos.md` | Registros para validación del cliente |
| `public/documentos/` · `imagenes/` · `videos/` · `visores/` | Archivos descargados |
