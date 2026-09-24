# Sistema de diseño

**Concepto:** «El agua de Gran Canaria, en datos y en paisaje». Institucional y fiable, con la energía de una web actual: fotografía de presas y paisaje, cifras grandes, curvas de nivel como motivo gráfico y datos convertidos en gráficas.

Los tokens están definidos en `src/styles/global.css`, en el bloque `@theme` de Tailwind 4.

## Color

La paleta parte del azul del logotipo, **#2D8FD0**, medido en `logo11.jpg`. Todos los pares texto/fondo que se usan cumplen **WCAG 2.1 AA**.

| Token | Hex | Uso | Contraste sobre blanco |
|---|---|---|---|
| `marca-500` | #2D8FD0 | Logotipo, iconos, decoración y texto grande | 3,5:1 (solo decoración o texto grande) |
| `marca-700` | #16649C | Enlaces y botones primarios | 6,3:1 |
| `atlantico-900` | #0A2440 | Cabeceras de sección, pie y títulos | 15,7:1 |
| `turquesa-500` | #15A8A0 | Datos y gráficas (sobre fondo oscuro, 5,3:1) | decorativo |
| `turquesa-700` | #0B7671 | Antetítulos | 5,5:1 |
| `basalto-900` | #161B21 | Texto principal | 17,3:1 |
| `basalto-600` | #4A5360 | Texto secundario | 7,8:1 |
| `arena-50` | #FAF8F4 | Fondo general (blanco roto) | — |
| `calido-500` | #E8762C | Acento de avisos (sobre fondo oscuro, 5,3:1) | decorativo |
| `alerta-700` | #B42318 | Alertas y documentos PDF | 6,6:1 |

**Modo oscuro:** el botón de la barra superior aplica `data-tema="oscuro"` y la preferencia se guarda en el navegador. Los tokens semánticos (`--fondo`, `--superficie`, `--texto`, `--enlace`…) cambian de valor en ese modo.

## Tipografía

Las dos familias están autoalojadas con `@fontsource`, sin llamadas a Google Fonts.

- **Sora (variable):** titulares y cifras. Geométrica y con carácter.
- **Public Sans (variable):** texto corrido, tablas y normativa. Diseñada para la administración pública y muy legible en textos largos.

## Componentes

| Componente | Archivo |
|---|---|
| Cabecera con barra de utilidades, mega-menú (7 entradas) y menú móvil | `src/components/Cabecera.astro` |
| Pie institucional con curva de ola | `src/components/Pie.astro` |
| Migas de pan con JSON-LD `BreadcrumbList` | `src/components/Migas.astro` + `src/layouts/Pagina.astro` |
| Submenú lateral fijo, plegable en móvil | `src/components/Submenu.astro` |
| Aviso/alerta global gestionable desde el CMS | `src/components/AvisoActivo.astro` |
| Tarjetas de sección, noticia y perfil | `plantillas/Hub.astro`, `TarjetaNoticia.astro` |
| Iconografía lineal propia (≈50 iconos) | `src/components/Icono.astro` |
| Enlaces a documentos con formato y peso | `.doc-link` (automático en el contenido) |
| Tablas responsive con ordenación y descarga CSV | `.tabla-contenedor` + `src/scripts/ui.ts` |
| Pestañas accesibles (patrón WAI-ARIA) | `[data-pestanas]` (Juntas) |
| Acordeones | `<details>` nativo |
| Línea temporal de ciclos | `plantillas/Planificacion.astro` |
| Cifras animadas | `[data-contador]` |
| Fachadas de YouTube y Google Maps (sin cookies previas) | `.fachada` |
| Mapas | Leaflet: `plantillas/Censo.astro`, `Contacto.astro` |
| Gráficas | ECharts: `plantillas/Volumenes.astro` |

## Movimiento

- Aparición suave al hacer scroll (`.revelar`).
- Transiciones nativas entre páginas (View Transitions entre documentos).
- Cifras animadas y *hover* en tarjetas.

Todo el movimiento se desactiva con `prefers-reduced-motion: reduce`.

## Plantillas por tipo de página

`hub` (índice de sección), `pagina` (contenido migrado), `presas`, `volumenes` (panel de embalses), `censo` (mapa), `visor`, `planificacion` (línea temporal), `juntas` (pestañas), `organos`, `contacto`, `normativa-indice` (filtros), `normativa` (ficha e índice lateral), `anuncios`, `avisos`, `buscar`, `centro-documentos` y `mapa-web`.

Las noticias tienen rutas propias: listado paginado en `/actualidad/noticias/` y una ficha por noticia.
