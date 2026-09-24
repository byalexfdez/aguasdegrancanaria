import arq from '../data/arquitectura.json';

export interface Nodo {
  id: string;
  titulo: string;
  url: string;
  antigua?: string;
  entradilla?: string;
  externo?: boolean;
  alias_de?: string;
  oculto_en_menu?: boolean;
  hijos?: Nodo[];
}
export interface NodoPlano extends Nodo { padres: string[] }

export const secciones = arq.secciones as Nodo[];
export const utilidades = arq.utilidades as Nodo[];
export const legales = arq.legales as Nodo[];
export const transversales = arq.transversales as Nodo[];
export const perfiles = arq.perfiles as { id: string; titulo: string; entradilla: string; enlaces: string[] }[];

const planos: NodoPlano[] = [];
const aplanar = (lista: Nodo[], padres: string[] = []) => {
  for (const n of lista) { planos.push({ ...n, padres }); if (n.hijos) aplanar(n.hijos, [...padres, n.id]); }
};
aplanar([...transversales, ...secciones, ...utilidades, ...legales]);

export const porId = new Map(planos.map((n) => [n.id, n]));
export const porUrl = new Map(planos.filter((n) => !n.externo && !n.alias_de).map((n) => [n.url, n]));
export const nodo = (id: string) => porId.get(id);

export const menuPrincipal = (arq.menu as { titulo: string; secciones: string[] }[]).map((m) => ({
  titulo: m.titulo,
  secciones: m.secciones.map((id) => secciones.find((s) => s.id === id)!),
}));

export function migas(url: string) {
  const n = porUrl.get(url);
  if (!n) return [{ titulo: 'Inicio', url: '/' }];
  return [{ titulo: 'Inicio', url: '/' }, ...n.padres.map((id) => porId.get(id)!).filter(Boolean).map((p) => ({ titulo: p.titulo, url: p.url })), { titulo: n.titulo, url: n.url }];
}

/** Sección raíz de una URL (para el submenú lateral). */
export function seccionDe(url: string): Nodo | undefined {
  const n = porUrl.get(url);
  if (!n) return undefined;
  const raiz = n.padres[0] ?? n.id;
  return secciones.find((s) => s.id === raiz);
}

export const visibles = (n?: Nodo) => (n?.hijos ?? []).filter((h) => !h.oculto_en_menu);

/** ¿La URL actual está dentro de este nodo? */
export function contiene(n: Nodo, url: string): boolean {
  if (n.url === url) return true;
  return (n.hijos ?? []).some((h) => contiene(h, url));
}

export const esExterno = (url: string) => /^https?:\/\//.test(url);
