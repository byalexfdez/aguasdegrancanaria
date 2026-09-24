# Erratas corregidas y dudas de contenido

Registro de erratas **evidentes** del contenido original y de su corrección (original → corregido). Las correcciones se aplican al generar el contenido (`scripts/contenido/construir.mjs`, lista `ERRATAS`); el texto original sigue intacto en `migracion/contenido/`. Si el cliente rechaza alguna, basta con quitarla de esa lista.

## Erratas evidentes

| # | Página nueva (ruta antigua) | Original | Corregido | Estado |
|---|---|---|---|---|
| 1 | `/agua-en-gran-canaria/presas/` (`/presas/ubicacion_presas.php`) | «a efectos ácticos solamente se le considera a Soria…» | «a efectos prácticos solamente se le considera a Soria…» | ✅ Corregida · pendiente de validar |
| 2 | `/agua-en-gran-canaria/presas/` (título de la tabla 3) | «RELACÓN DE PRESAS CON MENOS DE 15 m DE ALTURA…» | «RELACIÓN DE PRESAS CON MENOS DE 15 m DE ALTURA…» | ✅ Corregida · pendiente de validar |
| 3 | `/planificacion/plan-hidrologico/` (`/plan_hidro.php`) | «Demarcación hidrogáfica ES120 Gran Canaria» | «Demarcación hidrográfica ES120 Gran Canaria» | ✅ Corregida · pendiente de validar |
| 4 | `/planificacion/directiva-marco-del-agua/` (`/planhidro/directiva/marco_agua.php`) | «11° Documento-Guí de la estrategia de Implantación Común…» | «11° Documento-Guía de la estrategia de Implantación Común…» | ✅ Corregida · pendiente de validar |
| 5 | `/planificacion/directiva-marco-del-agua/` | «Reglamento de la Planificación Hidrolólogica» | «Reglamento de la Planificación Hidrológica» | ✅ Corregida · pendiente de validar |
| 5b | `/planificacion/directiva-marco-del-agua/documentos/informe-red-control/` | Entidad HTML mal escrita «&amp;aaciute;» (la web antigua la mostraba literalmente) | «á» | ✅ Corregida |
| 5c | `/fondos-europeos/feder/actuaciones-aquamac/` | Entidad HTML mal escrita «&amp;ocute;» (se mostraba literalmente) | «ó» | ✅ Corregida |
| 6 | Notas del Excel de volúmenes 2024-2026 (panel de embalses) | «…existente por debjao de ese nivel…» | «…por debajo de ese nivel…» | ⏸ No aplicada: el texto sale del Excel que publica el Consejo. Se recomienda corregirlo en el propio Excel. |
| 7 | Aviso inactivo «ALERTA POR LLUVIAS y VIENTO 12 de Diciembre de 2025» | «Haz click aquí para más infomación.» | «Haz clic aquí para más información.» | ⏸ No aplicada: el aviso está desactivado. Corregir si se reactiva desde el CMS. |

## Dudas de contenido (no se corrigen sin confirmación)

| # | Página | Observación |
|---|---|---|
| A | `/el-consejo/organos-de-gobierno/` (Junta General) | «Dos en representación del Ayuntamiento de Gran Canaria.» Probablemente se refiere a Las Palmas de Gran Canaria. |
| B | `/servicios/normativa/canarias/instalaciones-suministros/` | La ficha repite el título y la descripción de la Ley 12/1990 de Aguas de Canarias, pero el índice la presenta como «Instalaciones interiores de suministro de agua. Orden de 12 de abril de 1996…». En la web nueva se usa como título el del índice. |
| C | `/actualidad/anuncios/` (primer anuncio) | El texto indica «Expediente 968/2025 (0179- SI)», pero el PDF enlazado se llama `ANUNCIO_968-2023 (179-SI).pdf`. |
| D | Pie de página | La portada antigua indica «1º PLANTA» y el horario de verano «8:30 - 13:00». Las páginas independientes antiguas (`consejo.php`, `economico.php`, `el_consejo.php`…) dicen «8:30 - 13:30». La web nueva usa los datos facilitados en el encargo: «1ª planta» y «8:30 – 13:00». Hay que confirmar el horario correcto. |
