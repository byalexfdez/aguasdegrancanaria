import { getCollection } from 'astro:content';

export const POR_PAGINA = 12;

/** Noticias ordenadas: primero por fecha (más reciente), las que no tienen fecha en origen conservan su orden original. */
export async function noticiasOrdenadas() {
  return (await getCollection('noticias')).sort(
    (a, b) => (b.data.fecha?.getTime() ?? 0) - (a.data.fecha?.getTime() ?? 0) || (a.data.orden_origen ?? 0) - (b.data.orden_origen ?? 0),
  );
}

export const urlPagina = (n: number) => (n <= 1 ? '/actualidad/noticias/' : `/actualidad/noticias/pagina/${n}/`);
