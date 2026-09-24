// Plugin rehype para el contenido migrado.
// - Enlaces a documentos: clase .doc-link, formato y peso.
// - Enlaces a documentos que no existen en el servidor de origen: se muestran como «no disponible» (no se borran).
// - Enlaces externos: nueva ventana + aviso para lectores de pantalla.
// - Imágenes: ancho/alto (evita saltos de maquetación), carga diferida y versión WebP.
// - Tablas: contenedor desplazable accesible, cabeceras con scope y celdas numéricas alineadas.
// - iframes de terceros (YouTube, Google Maps): fachada; no se carga nada hasta que la persona lo pide.
import fs from 'node:fs';
import path from 'node:path';

const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')); } catch { return def; } };
const docs = new Map(leer('src/data/documentos.json', []).map((d) => [d.url, d]));
const imgs = leer('src/data/imagenes.json', {});
const noDisponibles = new Set(leer('src/data/enlaces-no-disponibles.json', []));

export const formatoPeso = (b) => {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024).toLocaleString('es-ES')} KB`;
  return `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
};

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const txt = (value) => ({ type: 'text', value });
const textoDe = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(textoDe).join(''));
const clases = (n) => [].concat(n.properties?.className ?? []);

function recorrer(nodo, fn, padre = null) {
  if (!nodo.children) return;
  for (let i = 0; i < nodo.children.length; i++) {
    const hijo = nodo.children[i];
    const r = fn(hijo, i, nodo);
    if (r === 'saltar') continue;
    if (typeof r === 'object' && r) { nodo.children[i] = r; recorrer(r, fn, nodo); continue; }
    recorrer(hijo, fn, nodo);
  }
}

const PROVEEDOR = [
  [/youtube(-nocookie)?\.com|youtu\.be/, 'YouTube', 'Cargar vídeo'],
  [/google\.[a-z.]+\/maps|maps\.google/, 'Google Maps', 'Cargar mapa'],
];

export default function rehypeAguas() {
  return (arbol) => {
    const hechos = new WeakSet();
    recorrer(arbol, (n) => {
      if (n.type !== 'element' || hechos.has(n)) return;
      const p = n.properties ?? (n.properties = {});

      if (n.tagName === 'a' && typeof p.href === 'string') {
        const href = p.href;
        let dec = href; try { dec = decodeURI(href); } catch { /* */ }
        if (/^\/(documentos|videos)\//.test(href)) {
          const d = docs.get(dec) ?? docs.get(href);
          const ext = (dec.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
          p.className = [...clases(n), 'doc-link'];
          p.dataFormato = ext;
          if (d?.bytes) n.children.push(txt(' '), el('span', { className: ['doc-meta'] }, [txt(formatoPeso(d.bytes))]));
          return; // se sigue dentro del enlace (imágenes enlazadas)
        }
        if (noDisponibles.has(href)) {
          return el('span', { className: ['no-disponible'], title: 'El documento no existe en el servidor de la web anterior' }, n.children);
        }
        if (/^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?aguasgrancanaria\.com/i.test(href)) {
          p.target = '_blank';
          p.rel = ['noopener', 'noreferrer'];
          p.className = [...clases(n), 'enlace-externo'];
          n.children.push(el('span', { className: ['sr-only'] }, [txt(' (abre en una ventana nueva)')]));
          return;
        }
        return;
      }

      if (n.tagName === 'img' && typeof p.src === 'string') {
        let src = p.src; try { src = decodeURI(src); } catch { /* */ }
        const i = imgs[src];
        p.loading = 'lazy';
        p.decoding = 'async';
        if (p.alt == null) p.alt = '';
        if (i) { p.width = i.w; p.height = i.h; }
        hechos.add(n);
        if (i?.webp) return el('picture', {}, [el('source', { srcSet: i.webp, type: 'image/webp' }), n]);
        return 'saltar';
      }

      if (n.tagName === 'table') {
        hechos.add(n);
        let filas = 0;
        // Cabeceras vacías (tablas del sitio antiguo sin fila de cabecera): fuera.
        n.children = n.children.filter((c) => !(c.type === 'element' && c.tagName === 'thead' && !textoDe(c).trim()));
        recorrer(n, (c) => {
          if (c.type !== 'element') return;
          if (c.tagName === 'tr') filas++;
          if (c.tagName === 'th') c.properties.scope = 'col';
          if (c.tagName === 'td' && /^[\s\d.,%€+\-–()]+$/.test(textoDe(c)) && /\d/.test(textoDe(c))) c.properties.className = [...clases(c), 'num'];
        });
        const conCabecera = n.children.some((c) => c.type === 'element' && c.tagName === 'thead');
        if (conCabecera && filas > 4) p.dataOrdenable = '';
        return el('div', { className: ['tabla-contenedor'], tabIndex: 0, role: 'region', ariaLabel: 'Tabla de datos (desplazable)', dataTabla: '' }, [n]);
      }

      if (n.tagName === 'iframe' && typeof p.src === 'string') {
        const prov = PROVEEDOR.find(([re]) => re.test(p.src));
        if (!prov) { p.loading = 'lazy'; return 'saltar'; }
        const titulo = p.title && p.title !== 'YouTube video player' ? p.title : (prov[1] === 'YouTube' ? 'Vídeo de YouTube' : 'Mapa de Google Maps');
        return el('div', { className: ['fachada'], dataSrc: p.src, dataTitulo: titulo }, [
          el('div', {}, [
            el('p', {}, [txt(`Este contenido se sirve desde ${prov[1]}, que puede instalar cookies propias.`)]),
            el('button', { type: 'button', className: ['boton', 'boton-claro', 'mt-3'], dataCargar: '' }, [txt(prov[2])]),
            el('p', { className: ['mt-2'] }, [el('a', { href: p.src.replace('/embed/', '/watch?v=').replace('youtube.com/watch?v=', 'youtube.com/watch?v='), target: '_blank', rel: ['noopener', 'noreferrer'], className: ['text-marca-200'] }, [txt(`Abrir en ${prov[1]}`)])]),
          ]),
        ]);
      }

      if (n.tagName === 'video') { p.preload = 'none'; p.controls = true; p.playsInline = true; return 'saltar'; }

      // Galería: párrafo formado solo por 3 o más imágenes (sueltas o enlazadas) → rejilla con visor a pantalla completa.
      if (n.tagName === 'p') {
        const hijos = n.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
        const esImagen = (c) => c.type === 'element' && (c.tagName === 'img' || c.tagName === 'picture'
          || (c.tagName === 'a' && c.children.some((x) => x.type === 'element' && (x.tagName === 'img' || x.tagName === 'picture'))));
        // Párrafo formado solo por 4 o más enlaces (menús de la web antigua) → lista de enlaces.
        const soloEnlaces = hijos.length >= 4 && hijos.every((c) => c.type === 'element' && c.tagName === 'a' && !c.children.some((x) => x.type === 'element' && (x.tagName === 'img' || x.tagName === 'picture')));
        if (soloEnlaces) {
          n.tagName = 'ul';
          p.className = [...clases(n), 'lista-enlaces'];
          n.children = hijos.map((c) => el('li', {}, [c]));
          return;
        }
        if (hijos.length >= 3 && hijos.every(esImagen)) {
          n.tagName = 'div';
          p.className = [...clases(n), 'galeria'];
          p.role = 'list';
          n.children = hijos.map((c) => el('div', { className: ['galeria-item'], role: 'listitem' }, [c]));
        }
        return;
      }
    });
  };
}
