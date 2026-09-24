// Servidor local del sitio compilado: sirve dist/ y, en /documentos y /videos, la carpeta medios/
// (igual que el servidor de producción). Uso: npm run servir  →  http://127.0.0.1:4322
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { carpetaMedios } from '../src/lib/vite-medios.mjs';

const PUERTO = Number(process.env.PUERTO ?? 4322);
const DIST = path.resolve('dist');
const MEDIOS = carpetaMedios();
const TIPOS = {
  html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', xml: 'application/xml',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain; charset=utf-8', pdf: 'application/pdf', mp4: 'video/mp4', wasm: 'application/wasm',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ods: 'application/vnd.oasis.opendocument.spreadsheet', zip: 'application/zip',
  pf_meta: 'application/octet-stream', pf_fragment: 'application/octet-stream', pf_index: 'application/octet-stream', pagefind: 'application/octet-stream',
};

function servir(res, req, fichero) {
  const { size } = fs.statSync(fichero);
  const ext = path.extname(fichero).slice(1).toLowerCase();
  res.setHeader('Content-Type', TIPOS[ext] ?? 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (r) {
    const ini = r[1] ? Number(r[1]) : 0; const fin = r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${ini}-${fin}/${size}`, 'Content-Length': fin - ini + 1 });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(fichero, { start: ini, end: fin }).pipe(res);
  }
  if (/\/_astro\/|\.(woff2?|webp|avif)$/.test(fichero.replace(/\\/g, '/'))) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // Compresión como en producción (mod_deflate) para medir de forma realista.
  if (/^(html|css|js|mjs|json|svg|xml|txt)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(fichero).pipe(zlib.createGzip()).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size });
  return req.method === 'HEAD' ? res.end() : fs.createReadStream(fichero).pipe(res);
}

http.createServer((req, res) => {
  let ruta; try { ruta = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { ruta = '/'; }
  const partes = ruta.split('/').filter((p) => p && p !== '..');
  const raiz = /^\/(documentos|videos)\//.test(ruta) ? MEDIOS : DIST;
  let f = path.join(raiz, ...partes);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (fs.existsSync(f)) return servir(res, req, f);
  if (!ruta.endsWith('/') && fs.existsSync(path.join(DIST, ...partes, 'index.html'))) { res.writeHead(301, { Location: ruta + '/' }); return res.end(); }
  res.statusCode = 404;
  const f404 = path.join(DIST, '404.html');
  if (fs.existsSync(f404)) { res.setHeader('Content-Type', TIPOS.html); return fs.createReadStream(f404).pipe(res); }
  res.end('404');
}).listen(PUERTO, '127.0.0.1', () => console.log(`Sitio compilado en http://127.0.0.1:${PUERTO}  (documentos desde ${MEDIOS})`));
