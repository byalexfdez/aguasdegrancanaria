// Genera las redirecciones 301 (URL antigua → nueva) a partir de migracion/mapa-urls.csv:
//   public/.htaccess              Apache (Plesk, servidor actual) + cabeceras de seguridad
//   public/_redirects             Netlify / Cloudflare Pages
//   despliegue/nginx-redirecciones.conf
// y public/robots.txt.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, MIGRACION, PUBLIC_DIR, readCsv, ensureDir, log } from '../scrape/lib.mjs';

const filas = readCsv(path.join(MIGRACION, 'mapa-urls.csv'));
const vistos = new Set();
const reglas = [];
for (const f of filas) {
  if (!f.url_nueva || f.nota) continue; // sin destino o variante codificada (Apache/nginx ya decodifican)
  const antigua = f.ruta_antigua;
  if (antigua === '/' || antigua === f.url_nueva || vistos.has(antigua)) continue;
  vistos.add(antigua);
  reglas.push({ antigua, nueva: f.url_nueva, tipo: f.tipo });
}
reglas.push({ antigua: '/index.php', nueva: '/', tipo: 'pagina' });

// ---- Apache
const escRe = (s) => s.replace(/^\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\ ');
const htaccess = `# ---------------------------------------------------------------------------
# Consejo Insular de Aguas de Gran Canaria · generado por scripts/despliegue/redirecciones.mjs
# No editar a mano: regenerar con «npm run redirecciones».
# ---------------------------------------------------------------------------
AddDefaultCharset UTF-8
Options -Indexes
ErrorDocument 404 /404.html

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json image/svg+xml application/xml text/plain
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=()"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  <FilesMatch "\\.(css|js|woff2?|webp|avif|jpe?g|png|gif|svg)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Forzar HTTPS y www
  RewriteCond %{HTTPS} off [OR]
  RewriteCond %{HTTP_HOST} !^www\\. [NC]
  RewriteRule ^ https://www.aguasgrancanaria.com%{REQUEST_URI} [R=301,L,NE]

  # Las fichas del Censo de Instalaciones siguen sirviéndose desde su carpeta original (no se migran).
  RewriteRule ^cartografia/CIfichas/ - [L]

  # ${reglas.length} redirecciones de la web anterior (páginas, documentos, imágenes, vídeos y visores)
${reglas.map((r) => `  RewriteRule ^${escRe(r.antigua)}$ ${encodeURI(r.nueva)} [R=301,L,NE]`).join('\n')}
</IfModule>
`;
fs.writeFileSync(path.join(PUBLIC_DIR, '.htaccess'), htaccess, 'utf8');

// ---- Netlify / Cloudflare
fs.writeFileSync(path.join(PUBLIC_DIR, '_redirects'), reglas.map((r) => `${encodeURI(r.antigua)} ${encodeURI(r.nueva)} 301`).join('\n') + '\n', 'utf8');

// ---- nginx
ensureDir(path.join(ROOT, 'despliegue'));
fs.writeFileSync(path.join(ROOT, 'despliegue', 'nginx-redirecciones.conf'),
  `# Incluir dentro del bloque server { } · generado por scripts/despliegue/redirecciones.mjs\n` +
  reglas.map((r) => `location = "${r.antigua.replace(/"/g, '\\"')}" { return 301 ${encodeURI(r.nueva)}; }`).join('\n') + '\n', 'utf8');

// ---- robots.txt
fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: https://www.aguasgrancanaria.com/sitemap-index.xml\n`, 'utf8');

const porTipo = reglas.reduce((m, r) => ((m[r.tipo] = (m[r.tipo] ?? 0) + 1), m), {});
log(`Redirecciones: ${reglas.length}`, porTipo);
