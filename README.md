# Web del Consejo Insular de Aguas de Gran Canaria

Rediseño completo de **www.aguasgrancanaria.com** con migración del 100 % del contenido de la web anterior: 163 páginas, 725 documentos, 269 imágenes, 6 vídeos, 258 tablas convertidas en datos y 2 visores cartográficos.

- **Stack:** Astro 5 + TypeScript + Tailwind CSS 4, salida estática.
- **Contenido:** colecciones de Markdown con esquemas Zod.
- **Gestor de contenidos:** Decap CMS en `/admin`.
- **Buscador:** Pagefind (incluye el texto completo de la normativa).
- **Mapas:** Leaflet + OpenStreetMap.
- **Gráficas:** Apache ECharts.
- **Fuentes:** autoalojadas (Sora y Public Sans).
- **Cookies:** ninguna de terceros. YouTube y Google Maps solo se cargan cuando la persona lo pide, así que la web no necesita banner de cookies.

---

## 1. Puesta en marcha

Requisitos: Node.js 20 o superior (probado con 24) y npm. Para las pruebas en navegador, además, Python 3 con `playwright`.

```bash
npm install
npm run dev          # desarrollo en http://127.0.0.1:4321
npm run build        # compila en dist/ y genera el índice del buscador (Pagefind)
npm run servir       # sirve dist/ + documentos en http://127.0.0.1:4322 (como en producción)
```

> **Trabaje en un disco local.** Instalar dependencias sobre una unidad de red (rutas `\\servidor\…`) es muy lento y `cmd.exe` no admite rutas UNC.

### Documentos y vídeos (`medios/`)

Los documentos (unos 4 GB) y los vídeos **no están en `public/`**: Astro copiaría 4 GB en cada compilación. Están en `medios/documentos` y `medios/videos`, y se publican en `/documentos/…` y `/videos/…`.

- **En local**, `npm run dev` y `npm run servir` los sirven desde `medios/`. Si la carpeta está en otro sitio, indique su ruta en la variable `AGUAS_MEDIOS` o en un fichero `.medios-ruta` con una sola línea, por ejemplo la ruta de red del proyecto.
- **En producción**, se copian una sola vez a la raíz web y después solo se sincronizan los cambios (ver apartado 3).

## 2. Estructura

```
src/
  content/            Contenido editable (Markdown)
    paginas/          177 páginas: las 163 migradas + índices de sección, buscador, centro de documentos…
    noticias/         59 noticias (una por fichero)
    anuncios/         24 anuncios oficiales
    avisos/           avisos y alertas (los «activos» salen bajo la cabecera de toda la web)
  data/               Datos: arquitectura (menú y migas), documentos, presas, juntas, normativa, censo…
  components/         Componentes (cabecera, pie, iconos…) y plantillas/ por tipo de página
  layouts/            Base (SEO, JSON-LD) y Pagina (cabecera de sección, migas, submenú)
  lib/                Navegación, formatos, lectura de los Excel de volúmenes, plugin de contenido
  pages/              Rutas: portada, noticias (listado paginado y fichas), 404 y ruta genérica [...slug]
  styles/global.css   Sistema de diseño (tokens, modo oscuro, prosa, tablas, documentos)
public/
  imagenes/           Imágenes migradas (+ versiones .opt.webp)
  visores/            Visores cartográficos originales (Catálogo de Cauces y Censo de Instalaciones)
  datos/              Excel de volúmenes (los lee el panel de embalses) y censo de instalaciones en JSON
  admin/              Gestor de contenidos (Decap CMS)
  .htaccess · _redirects · robots.txt
medios/               Documentos y vídeos (fuera de Git)
migracion/            Extracción de la web anterior, informes y registros para el cliente
scripts/
  scrape/             Fase 1: rastreo, descarga, extracción y colecciones
  arquitectura/       Fase 2: mapa de URLs y navegación
  contenido/          Construye src/content y src/data a partir de migracion/
  despliegue/         Redirecciones 301 (.htaccess, _redirects, nginx)
  verify/             Fase 5: verificación de cobertura y pruebas en navegador
```

## 3. Despliegue

La web es estática y se puede publicar en el servidor actual (Plesk: nginx + Apache) o en cualquier alojamiento estático.

1. `npm run build`
2. Subir el contenido de `dist/` a la raíz web. Incluye `.htaccess` con las 1.360 redirecciones 301, cabeceras de seguridad, compresión y caché.
3. Subir `medios/documentos` → `/documentos` y `medios/videos` → `/videos`. Solo la primera vez; después, sincronizar los cambios con `rsync` o por FTP.
4. **No borrar** la carpeta `/cartografia/CIfichas/` del servidor actual. Contiene las 4.965 fichas PDF del Censo de Instalaciones, que el mapa nuevo enlaza y que no se han migrado (unos 7 GB). El `.htaccess` la excluye de las redirecciones.

Otros servidores:

- **nginx:** incluir `despliegue/nginx-redirecciones.conf` dentro del bloque `server {}`.
- **Netlify o Cloudflare Pages:** usan `public/_redirects`. Los documentos deben alojarse aparte (almacenamiento de objetos), porque superan los límites de tamaño de esas plataformas.

Si cambia `migracion/mapa-urls.csv`, regenere las redirecciones con `npm run redirecciones`.

## 4. Gestor de contenidos (Decap CMS)

Se entra en **https://www.aguasgrancanaria.com/admin/**. Funciona en cuanto esté conectado el repositorio Git (ver «Configuración» más abajo). Permite editar:

| Colección | Qué se gestiona |
|---|---|
| Noticias | Titular, fecha, imagen (con texto alternativo), fuente, adjuntos y texto. «Destacar en portada». |
| Anuncios oficiales | Tipo, nº de expediente, fecha, PDF y texto. |
| Avisos y alertas | Título, nivel (alerta, aviso o información) y enlace o PDF. Si está **activo**, aparece bajo la cabecera de todas las páginas; al desactivarlo pasa a «Avisos anteriores». |
| Volúmenes de presas | Subir el Excel del año a `public/datos/volumenes/` con el mismo formato. La portada, la página de Presas y el panel de embalses se actualizan al publicar. |
| Páginas | Título, entradilla, descripción para buscadores, fecha de última actualización y contenido de las 177 páginas. |

**Cómo funciona.** Decap CMS guarda cada cambio como un *commit* en **github.com/byalexfdez/aguasdegrancanaria** (rama `main`). La acción `.github/workflows/publicar.yml` compila la web y la sube por FTP al hosting. El inicio de sesión con GitHub lo resuelven `admin/oauth/auth.php` y `callback.php` en el propio hosting (requiere PHP con cURL o `allow_url_fopen`), así que no hace falta ningún servicio externo. El flujo editorial (borrador → en revisión → listo) trabaja con ramas del repositorio; solo al publicar se actualiza la web.

**Puesta en marcha (una sola vez):**

1. **OAuth App de GitHub:** GitHub → Settings → Developer settings → OAuth Apps → *New OAuth App*.
   - *Homepage URL:* `https://SU-DOMINIO/`
   - *Authorization callback URL:* `https://SU-DOMINIO/admin/oauth/callback.php`
   - Guarde el *Client ID* y genere un *Client secret*.
2. **Secretos del repositorio:** Settings → Secrets and variables → Actions → *New repository secret*:

   | Secreto | Valor |
   |---|---|
   | `FTP_SERVER` | servidor FTP del hosting (p. ej. `ftp.su-dominio.com`) |
   | `FTP_USERNAME` · `FTP_PASSWORD` | usuario y contraseña FTP |
   | `FTP_DIR` | carpeta raíz de la web en el FTP, acabada en `/` (p. ej. `/public_html/` o `/httpdocs/`) |
   | `OAUTH_CLIENT_ID` · `OAUTH_CLIENT_SECRET` | los de la OAuth App |

   Variables opcionales (pestaña *Variables*): `FTP_PROTOCOL` = `ftp` si el hosting no admite FTP cifrado (por defecto `ftps`) y `COMPILACION` = `build` para la web definitiva (por defecto `build:demo`, sin indexar en buscadores).
3. **Primera publicación:** Actions → *Publicar en el hosting* → *Run workflow*. La primera vez sube la web completa, unos 110 MB. Después solo sube lo que cambie. Los documentos (`medios/documentos` → `/documentos`) y los vídeos (`medios/videos` → `/videos`) se suben aparte por FTP, una sola vez; la acción no los toca.
4. **Editores:** cada persona necesita una cuenta de GitHub invitada como colaboradora del repositorio (Settings → Collaborators) con permiso de escritura. Entra en `https://SU-DOMINIO/admin/` → *Iniciar sesión con GitHub*.

Tras guardar o publicar en el panel, la web tarda unos minutos en actualizarse, lo que dura la acción. El progreso se ve en la pestaña *Actions*.

**Edición en local, sin Git remoto:**

```bash
npx decap-server   # en una terminal (proxy que escribe directamente en los archivos del proyecto)
npm run dev        # en otra; abrir http://localhost:4321/admin/
```

En local no hay usuario ni contraseña: el proxy da acceso directo. Los cambios se ven en `npm run dev` al guardar. En este modo no existe el flujo editorial (borrador → revisión → listo), que solo funciona con el backend Git.

## 5. Regenerar el contenido desde la migración

```bash
npm run scrape:all   # Fase 1: rastrea la web antigua, descarga y extrae (usa caché en migracion/cache)
node scripts/arquitectura/mapa-urls.mjs   # Fase 2: arquitectura y mapa de URLs
npm run contenido    # construye src/content y src/data (NO sobrescribe noticias, anuncios ni avisos ya existentes)
```

> Tras modificar `src/lib/rehype-aguas.mjs`, borre `.astro/` y `node_modules/.astro/` antes de compilar: Astro guarda en caché el Markdown ya renderizado.

### Datos adicionales (mapas y series)

```bash
python scripts/datos/presas_mapa.py          # KMZ de presas → public/datos/presas-mapa.json + 166 fichas PDF de presas
python scripts/datos/pluviometros_fichas.py  # ZIP de estaciones → 253 fichas PDF individuales
node scripts/datos/pluviometros.mjs          # pluviometria.xls → public/datos/pluviometros.json (mapa, gráfica y tabla)
python scripts/datos/volumenes_pdf.py        # volúmenes 2023 y 2021 (solo en PDF) → public/datos/volumenes/*.json
```

`volumenes_pdf.py` **se valida antes de escribir nada**: extrae 2024 del PDF y lo compara cifra a cifra con el Excel de 2024. Si alguna cifra no coincide, se detiene. Las filas incompletas del PDF no se asignan a meses y quedan registradas como incidencia. Las notas al pie de los PDF no se publican, porque salen truncadas; el panel enlaza el PDF original.

## 6. Verificación (criterios de aceptación)

```bash
npm run build && npm run servir          # en otra terminal
npm run verificar:navegador              # axe-core, desbordamiento a 360 px, capturas y Lighthouse
VERIFICAR_URL=http://127.0.0.1:4322 npm run verificar
```

Resultado en `migracion/informe-cobertura.md`: rutas y redirecciones, documentos con HTTP 200, comparación de texto página a página (umbral del 2 %), recuentos de tablas, imágenes y vídeos, enlaces internos rotos, axe-core, responsive y Lighthouse.

## 7. Accesibilidad y cumplimiento

- **WCAG 2.1 AA / UNE-EN 301 549:**
  - Paleta con contraste AA, foco visible y enlace «Saltar al contenido».
  - Menús y pestañas accesibles por teclado, tablas con cabeceras y alternativa en listado para los mapas.
  - Respeto de `prefers-reduced-motion`.
- **Declaración de accesibilidad:** se ha migrado el texto actual de `/accesibilidad/` y se ha dejado preparado el apartado para la declaración según el RD 1112/2018. Está pendiente de redactar con el modelo oficial.
- **Vídeos:** los MP4 originales no tienen subtítulos ni transcripción; hay que incorporarlos (pendiente del cliente).
- **Privacidad:** sin cookies de terceros ni analítica. Si se desea medir tráfico, usar Plausible o Matomo en modo sin cookies.
- **Fondos europeos:** los logotipos y leyendas de FEDER y NextGenerationEU se conservan sin alterar en sus páginas.
