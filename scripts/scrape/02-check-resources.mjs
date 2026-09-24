// Paso 02 — Comprobación de enlaces externos (y referencias a IPs internas / dominios obsoletos).
// Genera migracion/enlaces-externos.json y migracion/enlaces-externos-rotos.md.
// Los enlaces caídos NO se eliminan: se listan para decidir con el cliente.
import fs from 'node:fs';
import path from 'node:path';
import { MIGRACION, CACHE_DIR, readJSON, writeJSON, fetchRetry, pool, log } from './lib.mjs';

const crawl = readJSON(path.join(MIGRACION, 'crawl.json'));
const CACHE = path.join(CACHE_DIR, 'estado-externos.json');
const cache = readJSON(CACHE, {});
const REFRESH = process.argv.includes('--refresh');

const DOMINIOS_OBSOLETOS = ['europa.eu.int', 'juridicas.com', 'carreteros.org', 'mma.es', 'mma.gob.es', 'marm.es', 'mapya.es', 'mapa.es'];

const externos = crawl.recursos.filter((r) => ['externo', 'iframe-externo', 'ip-interna'].includes(r.tipo));
log(`Enlaces externos a comprobar: ${externos.length}`);

async function comprobar(r) {
  if (r.tipo === 'ip-interna') return { status: null, nota: 'IP de red interna: inaccesible desde Internet' };
  if (!REFRESH && cache[r.url]) return cache[r.url];
  let res = await fetchRetry(r.url, { method: 'HEAD', retries: 1, timeout: 20000 });
  if (res.status === 0 || res.status === 405 || res.status === 403 || res.status === 400 || res.status >= 500 || res.status === 404) {
    res = await fetchRetry(r.url, { method: 'GET', retries: 1, timeout: 30000, headers: { Range: 'bytes=0-2048' } });
  }
  const out = { status: res.status === 206 ? 200 : res.status, finalUrl: res.finalUrl, error: res.error ?? null };
  cache[r.url] = out;
  return out;
}

let n = 0;
const resultados = await pool(externos, 8, async (r) => {
  const st = await comprobar(r);
  if (++n % 25 === 0) { log(`${n}/${externos.length}`); writeJSON(CACHE, cache); }
  const host = (() => { try { return new URL(r.url).hostname; } catch { return ''; } })();
  const obsoleto = DOMINIOS_OBSOLETOS.some((d) => host === d || host.endsWith('.' + d));
  let estado = 'ok';
  const redSocial = /(^|\.)(facebook|instagram|x|twitter|linkedin|youtube|tiktok)\.com$/.test(host);
  if (r.tipo === 'ip-interna') estado = 'ip-interna';
  else if (redSocial && st.status !== 200) estado = 'bloqueado-o-restringido'; // bloquean peticiones automáticas
  else if (st.status === 0) estado = 'sin-respuesta';
  else if (st.status >= 400) estado = st.status === 403 || st.status === 429 ? 'bloqueado-o-restringido' : 'roto';
  else if (st.finalUrl && new URL(st.finalUrl).hostname !== host) estado = 'redirige-a-otro-dominio';
  return {
    url: r.url, host, tipo: r.tipo, estado, status: st.status, destinoFinal: st.finalUrl, error: st.error, nota: st.nota ?? null,
    dominioObsoleto: obsoleto,
    paginas: [...new Set(r.apariciones.map((a) => a.pagina))],
    textos: [...new Set(r.apariciones.map((a) => a.texto).filter(Boolean))].slice(0, 5),
  };
});
writeJSON(CACHE, cache);
writeJSON(path.join(MIGRACION, 'enlaces-externos.json'), resultados);

const problemas = resultados.filter((r) => r.estado !== 'ok' || r.dominioObsoleto);
const grupos = {
  'roto': 'Enlaces rotos (error 4xx/5xx)',
  'sin-respuesta': 'Sin respuesta (dominio caído, DNS o tiempo de espera)',
  'ip-interna': 'Enlaces a IPs de la red interna (no accesibles desde Internet)',
  'bloqueado-o-restringido': 'Responden 403/429 (pueden funcionar en navegador; revisar a mano)',
  'redirige-a-otro-dominio': 'Redirigen a otro dominio (revisar si el destino sigue siendo válido)',
  'ok': 'Responden, pero pertenecen a dominios obsoletos',
};
let md = `# Enlaces externos con incidencias\n\n`;
md += `Generado automáticamente el ${new Date().toLocaleDateString('es-ES')} por \`scripts/scrape/02-check-resources.mjs\`.\n\n`;
md += `Ninguno de estos enlaces se ha eliminado. Se listan para **decidir con el cliente** si se mantienen, se sustituyen por la URL vigente o se retiran.\n\n`;
md += `Total de enlaces externos únicos: **${resultados.length}** · Con incidencias: **${problemas.length}**\n\n`;
for (const [clave, titulo] of Object.entries(grupos)) {
  const lista = problemas.filter((p) => (clave === 'ok' ? p.estado === 'ok' && p.dominioObsoleto : p.estado === clave));
  if (!lista.length) continue;
  md += `## ${titulo} (${lista.length})\n\n`;
  // Dominios con muchos enlaces en el mismo estado se resumen en una línea (el detalle está en enlaces-externos.json).
  const porHost = {};
  for (const p of lista) (porHost[p.host] ??= []).push(p);
  const masivos = Object.entries(porHost).filter(([, v]) => v.length > 10);
  for (const [host, v] of masivos) {
    const pags = [...new Set(v.flatMap((x) => x.paginas))];
    md += `- **${host}**: ${v.length} enlaces (${[...new Set(v.map((x) => x.status ?? x.error))].join(', ')}), p. ej. ${v[0].url}. Aparecen en: ${pags.map((x) => `\`${x}\``).join(', ')}. Detalle completo en \`enlaces-externos.json\`.\n`;
  }
  if (masivos.length) md += '\n';
  md += `| Enlace | Estado | Aparece en | Texto del enlace |\n|---|---|---|---|\n`;
  for (const p of lista.filter((x) => porHost[x.host].length <= 10)) {
    const st = p.status ? String(p.status) : (p.error ?? p.nota ?? '—');
    const fin = p.destinoFinal && p.destinoFinal !== p.url && p.estado === 'redirige-a-otro-dominio' ? ` → ${p.destinoFinal}` : '';
    md += `| ${p.url.replace(/\|/g, '%7C')}${fin.replace(/\|/g, '%7C')} | ${st}${p.dominioObsoleto ? ' · dominio obsoleto' : ''} | ${p.paginas.slice(0, 4).map((x) => `\`${x}\``).join(', ')}${p.paginas.length > 4 ? ` (+${p.paginas.length - 4})` : ''} | ${(p.textos[0] ?? '').replace(/\|/g, '/').slice(0, 80)} |\n`;
  }
  md += '\n';
}
fs.writeFileSync(path.join(MIGRACION, 'enlaces-externos-rotos.md'), md, 'utf8');
const resumen = {};
for (const r of resultados) resumen[r.estado] = (resumen[r.estado] ?? 0) + 1;
log('Resumen externos:', resumen);
