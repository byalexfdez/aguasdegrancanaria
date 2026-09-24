// Paso 03 — Descarga de documentos, imágenes, vídeos y visores cartográficos.
// Destinos (estructura de carpetas original, nombres saneados):
//   documentos → medios/documentos/…   imágenes → public/imagenes/…   vídeos/audio → medios/videos/…
//   visores (Catalogo_Cauces, CensoInstalaciones) → public/visores/…
// Registra tipo, peso, checksum y estado HTTP en migracion/medios.json y el mapa antiguo→nuevo en
// migracion/mapa-documentos.csv.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  MIGRACION, PUBLIC_DIR, MEDIOS_DIR, CACHE_DIR, UA, readJSON, writeJSON, ensureDir, sanearRuta, pool, log, toCsv, extOf, sleep,
} from './lib.mjs';

const crawl = readJSON(path.join(MIGRACION, 'crawl.json'));
const estado = readJSON(path.join(CACHE_DIR, 'estado-urls.json'), {});
const MEDIOS_FILE = path.join(MIGRACION, 'medios.json');
const previos = Object.fromEntries(readJSON(MEDIOS_FILE, []).map((m) => [m.urlAntigua, m]));

const CARPETA = { documento: 'documentos', imagen: 'imagenes', video: 'videos', audio: 'videos', asset: 'visores' };
const esVisor = (p) => /^\/cartografia\/(Catalogo_Cauces|CensoInstalaciones)\//i.test(p);

const objetivos = crawl.recursos.filter((r) => {
  if (['documento', 'imagen', 'video', 'audio'].includes(r.tipo)) return true;
  if (r.tipo === 'asset') { try { return esVisor(decodeURIComponent(new URL(r.url).pathname)); } catch { return false; } }
  return false;
});

// Asignación de rutas nuevas sin colisiones.
const usados = new Map();
function rutaNueva(r) {
  const u = new URL(r.url);
  let p; try { p = decodeURIComponent(u.pathname); } catch { p = u.pathname; }
  if (r.tipo === 'asset' || (esVisor(p) && r.tipo !== 'documento')) {
    // Los visores son aplicaciones: se conservan los nombres originales para no romper sus rutas relativas.
    return 'visores' + p.replace(/^\/cartografia\//i, '/');
  }
  let rel = `${CARPETA[r.tipo]}/${sanearRuta(p)}`;
  if (u.search) rel = rel.replace(/(\.[a-z0-9]+)?$/i, (m) => `-${sanearRuta(u.search.slice(1))}${m}`);
  let final = rel, i = 2;
  while (usados.has(final.toLowerCase()) && usados.get(final.toLowerCase()) !== r.url) {
    final = rel.replace(/(\.[a-z0-9]+)?$/i, (m) => `-${i}${m}`); i++;
  }
  usados.set(final.toLowerCase(), r.url);
  return final;
}

async function descargar(r) {
  const rel = rutaNueva(r);
  const base = ['documentos', 'videos'].includes(rel.split('/')[0]) ? MEDIOS_DIR : PUBLIC_DIR;
  const destino = path.join(base, ...rel.split('/'));
  const prev = previos[r.url];
  const base = {
    urlAntigua: r.url, rutaAntigua: (() => { try { return decodeURIComponent(new URL(r.url).pathname); } catch { return new URL(r.url).pathname; } })(),
    rutaNueva: '/' + rel, tipo: r.tipo, extension: extOf(new URL(r.url).pathname),
    enInventario: !!r.enInventario, soloInventario: !!r.soloInventario,
    paginas: [...new Set(r.apariciones.map((a) => a.pagina))],
    textos: [...new Set(r.apariciones.map((a) => a.texto).filter(Boolean))].slice(0, 6),
  };
  if (prev && prev.status === 200 && fs.existsSync(destino) && fs.statSync(destino).size === prev.bytes) {
    return { ...base, ...pick(prev, ['status', 'contentType', 'bytes', 'sha256', 'descargado']) };
  }
  const st = estado[r.clave] ?? estado[r.url];
  if (st && st.status && st.status !== 200 && st.status !== 206) {
    return { ...base, status: st.status, contentType: st.type, bytes: null, sha256: null, descargado: false, error: st.error };
  }
  for (let intento = 0; intento < 3; intento++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
      const res = await fetch(r.url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      if (res.status !== 200) {
        clearTimeout(t);
        if (res.status >= 500 && intento < 2) { await sleep(2000 * (intento + 1)); continue; }
        return { ...base, status: res.status, contentType: res.headers.get('content-type'), bytes: null, sha256: null, descargado: false };
      }
      ensureDir(path.dirname(destino));
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      const tmp = destino + '.part';
      const body = Readable.fromWeb(res.body);
      body.on('data', (c) => { hash.update(c); bytes += c.length; });
      await pipeline(body, fs.createWriteStream(tmp));
      clearTimeout(t);
      fs.renameSync(tmp, destino);
      return { ...base, status: 200, contentType: res.headers.get('content-type'), bytes, sha256: hash.digest('hex'), descargado: true };
    } catch (e) {
      if (intento === 2) return { ...base, status: 0, bytes: null, sha256: null, descargado: false, error: String(e.cause?.code ?? e.message) };
      await sleep(3000 * (intento + 1));
    }
  }
}
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));

// Recursos que el visor del Censo construye por JavaScript (no aparecen como atributos en el HTML).
for (const t of ['boring', 'exploration', 'gallery', 'mixed_well', 'other', 'well', 'unknown']) {
  const url = `https://www.aguasgrancanaria.com/cartografia/CensoInstalaciones/images/marker-${t}.svg`;
  if (!objetivos.some((o) => o.url === url)) {
    objetivos.push({ url, clave: url, tipo: 'asset', apariciones: [{ pagina: '/cartografia/CensoInstalaciones/map-censo.html', texto: `Marcador ${t}` }] });
  }
}

// Orden estable para que la asignación de nombres no cambie entre ejecuciones.
objetivos.sort((a, b) => a.url.localeCompare(b.url));
log(`Medios a descargar: ${objetivos.length}`);
let n = 0, bytesTot = 0;
const medios = [];
const resultados = await pool(objetivos, 4, async (r) => {
  const m = await descargar(r);
  bytesTot += m.bytes ?? 0;
  if (++n % 25 === 0) {
    log(`${n}/${objetivos.length} · ${(bytesTot / 1048576).toFixed(0)} MB`);
    writeJSON(MEDIOS_FILE, [...medios, m]);
  }
  medios.push(m);
  return m;
});
writeJSON(MEDIOS_FILE, resultados);

const filas = resultados.map((m) => ({
  tipo: m.tipo, url_antigua: m.urlAntigua, ruta_antigua: m.rutaAntigua, ruta_nueva: m.rutaNueva,
  estado_http: m.status, bytes: m.bytes ?? '', sha256: m.sha256 ?? '', en_inventario: m.enInventario ? 'si' : 'no', paginas: m.paginas.join(' | '),
}));
fs.writeFileSync(path.join(MIGRACION, 'mapa-documentos.csv'), toCsv(filas), 'utf8');

// HTML de los visores (se sirven tal cual desde public/visores/).
for (const pag of crawl.paginas) {
  if (!esVisor(pag.ruta) || !pag.raw) continue;
  const destino = path.join(PUBLIC_DIR, 'visores', ...pag.ruta.replace(/^\/cartografia\//i, '').split('/'));
  ensureDir(path.dirname(destino));
  fs.copyFileSync(path.join(MIGRACION, pag.raw), destino);
  log('Visor copiado:', pag.ruta, '→', path.relative(PUBLIC_DIR, destino));
}
const ok = resultados.filter((m) => m.status === 200).length;
log(`Descargados OK: ${ok}/${resultados.length} · ${(bytesTot / 1048576).toFixed(1)} MB`);
