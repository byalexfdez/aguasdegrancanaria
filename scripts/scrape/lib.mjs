// Utilidades comunes del proceso de extracción (Fase 1).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RECURSOS = path.join(ROOT, 'recursos');
export const MIGRACION = path.join(ROOT, 'migracion');
export const RAW_DIR = path.join(MIGRACION, 'raw');
export const CACHE_DIR = path.join(MIGRACION, 'cache');
export const PUBLIC_DIR = path.join(ROOT, 'public');
// Documentos y vídeos (4 GB) fuera de public/ para que Astro no los copie en cada build; se sirven en /documentos y /videos.
export const MEDIOS_DIR = path.join(ROOT, 'medios');

export const ORIGIN = 'https://www.aguasgrancanaria.com';
export const HOSTS_PROPIOS = new Set(['www.aguasgrancanaria.com', 'aguasgrancanaria.com']);
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AguasGC-Migracion/1.0 (+rediseño web)';

export const EXT_PAGINA = new Set(['php', 'html', 'htm', 'asp', 'aspx', '']);
export const EXT_DOCUMENTO = new Set([
  'pdf', 'doc', 'docx', 'odt', 'ods', 'odp', 'odg', 'xls', 'xlsx', 'xlsm', 'csv', 'ppt', 'pptx', 'pps', 'ppsx',
  'zip', 'rar', '7z', 'gz', 'tar', 'kmz', 'kml', 'shp', 'dbf', 'dwg', 'dxf', 'txt', 'rtf', 'xml', 'gpx', 'ecw', 'tif', 'tiff',
]);
export const EXT_VIDEO = new Set(['mp4', 'webm', 'ogv', 'avi', 'mov', 'wmv', 'flv', 'mpg', 'mpeg', 'm4v']);
export const EXT_AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a']);
export const EXT_IMAGEN = new Set(['gif', 'jpg', 'jpeg', 'png', 'svg', 'webp', 'bmp', 'ico', 'avif']);
export const EXT_ASSET = new Set(['css', 'js', 'json', 'geojson', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'map', 'swf']);

export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
export function writeJSON(f, data) { ensureDir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8'); }
export function readJSON(f, def = undefined) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { if (def !== undefined) return def; throw new Error(`No se pudo leer ${f}`); }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** CSV separado por ';' con BOM. */
export function readCsv(file, sep = ';') {
  const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function toCsv(rows, headers, sep = ';') {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const h = headers ?? Object.keys(rows[0] ?? {});
  return '﻿' + [h.join(sep), ...rows.map((r) => h.map((k) => esc(r[k])).join(sep))].join('\r\n') + '\r\n';
}

/** Decodifica entidades HTML simples que aparecen dentro de atributos/onclick. */
export function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ntilde: 'ñ', Ntilde: 'Ñ',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    uuml: 'ü', Uuml: 'Ü', ordf: 'ª', ordm: 'º', iexcl: '¡', iquest: '¿', ccedil: 'ç', Ccedil: 'Ç' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n] ?? m);
}

/** Decodifica bytes de HTML: UTF-8 si es válido, si no Windows-1252. */
export function decodeHtml(buf) {
  const s = buf.toString('utf8');
  if (!s.includes('�')) return { text: s, encoding: 'utf-8' };
  return { text: iconv.decode(buf, 'win1252'), encoding: 'windows-1252' };
}

export function extOf(pathname) {
  const last = pathname.split('/').pop() ?? '';
  const m = last.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Normaliza una referencia cruda (href/src/onclick) a URL absoluta.
 * - "\" → "/", entidades HTML, espacios, http→https, sin www → www, barras dobles.
 */
export function cleanRef(ref) {
  if (ref == null) return null;
  let r = decodeEntities(String(ref)).trim().replace(/\\/g, '/');
  r = r.replace(/^['"]|['"]$/g, '').trim();
  if (!r || r.startsWith('#') || /^(javascript|data|about|blob):/i.test(r)) return null;
  return r;
}

export function absolutize(ref, base) {
  try {
    const u = new URL(ref, base);
    if (!/^https?:$/.test(u.protocol)) return u;
    if (HOSTS_PROPIOS.has(u.hostname.toLowerCase())) {
      u.protocol = 'https:';
      u.hostname = 'www.aguasgrancanaria.com';
      u.port = '';
    }
    u.pathname = u.pathname.replace(/\/{2,}/g, '/');
    u.hash = '';
    return u;
  } catch { return null; }
}

export const esPropio = (u) => u && /^https?:$/.test(u.protocol) && u.hostname === 'www.aguasgrancanaria.com';

/** Clave canónica legible (ruta decodificada) para deduplicar. */
export function keyOf(u) {
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { /* ruta mal codificada: se deja tal cual */ }
  return `${u.origin}${p}${u.search}`;
}
export function pathOf(u) {
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { /* idem */ }
  return p + u.search;
}

export function clasificar(u) {
  if (!u) return 'invalida';
  if (u.protocol === 'mailto:') return 'email';
  if (u.protocol === 'tel:') return 'telefono';
  if (!/^https?:$/.test(u.protocol)) return 'otro';
  if (!esPropio(u)) {
    if (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(u.hostname)) return 'ip-interna';
    return 'externo';
  }
  const ext = extOf(u.pathname);
  if (EXT_DOCUMENTO.has(ext)) return 'documento';
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_AUDIO.has(ext)) return 'audio';
  if (EXT_IMAGEN.has(ext)) return 'imagen';
  if (EXT_ASSET.has(ext)) return 'asset';
  if (EXT_PAGINA.has(ext) || u.pathname.endsWith('/')) return 'pagina';
  return 'desconocido';
}

/** Nombre de archivo/segmento saneado: sin tildes, sin espacios, sin paréntesis, minúsculas. */
export function sanearSegmento(seg) {
  const dot = seg.lastIndexOf('.');
  const hasExt = dot > 0 && /^[a-z0-9]{1,5}$/i.test(seg.slice(dot + 1));
  let base = hasExt ? seg.slice(0, dot) : seg;
  const ext = hasExt ? seg.slice(dot + 1).toLowerCase() : '';
  base = base
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n').replace(/ç/gi, 'c')
    .replace(/[º°ª]/g, '')
    .replace(/&/g, '-y-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
  if (!base) base = 'archivo';
  return ext ? `${base}.${ext}` : base;
}
export function sanearRuta(p) {
  return p.split('/').filter(Boolean).map(sanearSegmento).join('/');
}

/** Descarga con reintentos. Devuelve {status, headers, buf, finalUrl}. */
export async function fetchRetry(url, { method = 'GET', retries = 3, timeout = 60000, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9', ...headers } });
      const buf = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
      clearTimeout(t);
      if (res.status >= 500 && i < retries) { await sleep(1000 * (i + 1)); continue; }
      return { status: res.status, headers: Object.fromEntries(res.headers), buf, finalUrl: res.url };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < retries) await sleep(1500 * (i + 1));
    }
  }
  return { status: 0, headers: {}, buf: Buffer.alloc(0), finalUrl: url, error: String(lastErr?.cause?.code ?? lastErr?.message ?? lastErr) };
}

/** Pool de concurrencia simple. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
