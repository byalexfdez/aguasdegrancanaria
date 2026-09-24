// Publicación en una subcarpeta (p. ej. https://licitaciones.victoriacrea.com/aguasdegrancanaria/).
// La web usa rutas absolutas (/imagenes/…, /documentos/…, /el-consejo/…) pensadas para la raíz de un dominio.
// Con AGUAS_BASE=/aguasdegrancanaria, este paso antepone esa carpeta a todas las rutas internas de dist/
// (HTML, CSS, JS, JSON y .htaccess). Sin AGUAS_BASE no hace nada. Se ejecuta antes de Pagefind.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.AGUAS_BASE ?? '').trim().replace(/\/+$/, '');
if (!base) process.exit(0);
if (!/^\/[\w.-]+(\/[\w.-]+)*$/.test(base)) {
  console.error(`AGUAS_BASE no válido: «${base}». Ejemplo: /aguasdegrancanaria`);
  process.exit(1);
}

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
// Solo se reescriben rutas cuyo primer tramo es una carpeta o archivo de la web, más los medios (se suben aparte)
// y el índice del buscador (Pagefind lo genera después de este paso).
const tramos = new Set([...fs.readdirSync(dist), 'documentos', 'videos', 'pagefind']);
tramos.delete(base.split('/')[1]);
const alt = [...tramos].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// «/tramo» precedido de comilla, paréntesis, espacio, coma, = o [ y seguido de fin de ruta.
const reRuta = new RegExp(`(?<=[\\s"'\`(,=\\[])/(?=(?:${alt})(?:[/"'\`?#)\\s,]|$))`, 'g');
// Enlaces a la portada: href="/", href="/#…", action="/"
const reRaiz = /(?<=(?:href|action)=["'])\/(?=["'#?])/g;

const EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest']);
let archivos = 0;
let cambios = 0;
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { recorrer(p); continue; }
    if (!EXT.has(path.extname(e.name).toLowerCase())) continue;
    const txt = fs.readFileSync(p, 'utf8');
    let n = 0;
    const nuevo = txt.replace(reRuta, () => (n++, `${base}/`)).replace(reRaiz, () => (n++, `${base}/`));
    if (n) { fs.writeFileSync(p, nuevo, 'utf8'); archivos++; cambios += n; }
  }
};
recorrer(dist);

// .htaccess: página 404 y destinos de las redirecciones
const hta = path.join(dist, '.htaccess');
if (fs.existsSync(hta)) {
  const txt = fs.readFileSync(hta, 'utf8')
    .replace(/^ErrorDocument 404 \/404\.html$/m, `ErrorDocument 404 ${base}/404.html`)
    .replace(/^(\s*RewriteRule \S+ )\/(?!\/)/gm, `$1${base}/`);
  fs.writeFileSync(hta, txt, 'utf8');
}
console.log(`Subcarpeta ${base}: ${cambios} rutas reescritas en ${archivos} archivos.`);
