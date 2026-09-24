// Sirve /documentos/* y /videos/* desde la carpeta medios/ (fuera de public/ para no copiar 4 GB en cada build).
// En producción esas carpetas se despliegan aparte en la raíz web (ver README).
import fs from 'node:fs';
import path from 'node:path';

const TIPOS = {
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', odt: 'application/vnd.oasis.opendocument.text',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', zip: 'application/zip', rar: 'application/vnd.rar', kmz: 'application/vnd.google-earth.kmz',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', rtf: 'application/rtf', mp4: 'video/mp4', csv: 'text/csv; charset=utf-8',
};

function manejador(raiz) {
  return (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    if (url === '/admin' || url === '/admin/') { req.url = '/admin/index.html'; return next(); } // como en producción
    if (!/^\/(documentos|videos)\//.test(url)) return next();
    let rel;
    try { rel = decodeURIComponent(url); } catch { return next(); }
    const fichero = path.join(raiz, ...rel.split('/').filter(Boolean));
    if (!fichero.startsWith(raiz) || !fs.existsSync(fichero) || !fs.statSync(fichero).isFile()) return next();
    const { size } = fs.statSync(fichero);
    const ext = path.extname(fichero).slice(1).toLowerCase();
    res.setHeader('Content-Type', TIPOS[ext] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (rango) {
      const ini = rango[1] ? Number(rango[1]) : 0;
      const fin = rango[2] ? Math.min(Number(rango[2]), size - 1) : size - 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${ini}-${fin}/${size}`);
      res.setHeader('Content-Length', fin - ini + 1);
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(fichero, { start: ini, end: fin }).pipe(res);
    }
    res.setHeader('Content-Length', size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(fichero).pipe(res);
  };
}

/** Carpeta de medios: variable AGUAS_MEDIOS, fichero .medios-ruta (una línea con la ruta) o ./medios. */
export function carpetaMedios() {
  if (process.env.AGUAS_MEDIOS) return path.resolve(process.env.AGUAS_MEDIOS);
  try { const r = fs.readFileSync('.medios-ruta', 'utf8').trim(); if (r) return r; } catch { /* sin fichero */ }
  return path.resolve('medios');
}

export default function servirMedios() {
  const raiz = carpetaMedios();
  return {
    name: 'aguas-medios',
    enforce: 'pre', // antes que el enrutador de Astro (si no, /admin/ acaba en la 404 tras un reinicio)
    configureServer(server) { server.middlewares.use(manejador(raiz)); },
    configurePreviewServer(server) { server.middlewares.use(manejador(raiz)); },
  };
}
