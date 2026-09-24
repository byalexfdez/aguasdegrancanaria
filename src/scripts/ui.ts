// Comportamientos globales ligeros (sin dependencias). Todo respeta prefers-reduced-motion.
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Aparición al hacer scroll
const io = 'IntersectionObserver' in window && !sinMovimiento
  ? new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io?.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' })
  : null;
document.querySelectorAll('.revelar').forEach((el) => (io ? io.observe(el) : el.classList.add('visible')));

// Cifras animadas: <span data-contador="69" data-decimales="1">69</span>
const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const contar = (el: HTMLElement) => {
  const fin = Number(el.dataset.contador); const d = Number(el.dataset.decimales ?? 0);
  if (sinMovimiento || !Number.isFinite(fin)) { el.textContent = fmt(fin, d); return; }
  const t0 = performance.now(); const dur = 1400;
  const paso = (t: number) => {
    const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(fin * e, d);
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
};
const ioc = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { contar(e.target as HTMLElement); ioc?.unobserve(e.target); } }), { threshold: 0.4 }) : null;
document.querySelectorAll<HTMLElement>('[data-contador]').forEach((el) => (ioc ? ioc.observe(el) : contar(el)));

// Fachadas de terceros: el iframe solo se carga al pulsar
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest('[data-cargar]');
  if (!b) return;
  const f = b.closest<HTMLElement>('.fachada');
  if (!f?.dataset.src) return;
  const src = f.dataset.src.includes('youtube') ? f.dataset.src.replace('youtube.com', 'youtube-nocookie.com') + (f.dataset.src.includes('?') ? '&' : '?') + 'autoplay=1' : f.dataset.src;
  const ifr = document.createElement('iframe');
  ifr.src = src; ifr.title = f.dataset.titulo ?? 'Contenido externo'; ifr.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen'; ifr.loading = 'lazy';
  f.replaceChildren(ifr);
  ifr.focus();
});

// Tablas: ordenar por columna y exportar a CSV
const texto = (c: Element) => (c.textContent ?? '').replace(/\s+/g, ' ').trim();
const valor = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')); return /\d/.test(s) && /^[\s\d.,%€+\-–()]+$/.test(s) && !Number.isNaN(n) ? n : s.toLocaleLowerCase('es'); };
document.querySelectorAll<HTMLElement>('[data-tabla]').forEach((cont, idx) => {
  const tabla = cont.querySelector('table'); if (!tabla) return;
  const barra = document.createElement('div'); barra.className = 'tabla-herramientas';
  const exp = document.createElement('button'); exp.type = 'button'; exp.textContent = 'Descargar CSV';
  exp.addEventListener('click', () => {
    const filas = [...tabla.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => `"${texto(c).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tabla-${location.pathname.split('/').filter(Boolean).pop() ?? 'datos'}-${idx + 1}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });
  barra.append(exp); cont.prepend(barra);
  if (!tabla.hasAttribute('data-ordenable') && !cont.hasAttribute('data-ordenable')) return;
  const ths = [...tabla.querySelectorAll('thead th')];
  ths.forEach((th, i) => {
    if (!texto(th)) return;
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = th.innerHTML + '<span aria-hidden="true">↕</span>';
    th.replaceChildren(b); th.setAttribute('aria-sort', 'none');
    b.addEventListener('click', () => {
      const asc = th.getAttribute('aria-sort') !== 'ascending';
      ths.forEach((x) => x.hasAttribute('aria-sort') && x.setAttribute('aria-sort', 'none'));
      th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      const tb = tabla.tBodies[0]; const filas = [...tb.rows];
      filas.sort((a, z) => { const x = valor(texto(a.cells[i] ?? a)); const y = valor(texto(z.cells[i] ?? z)); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
      tb.append(...filas);
    });
  });
});

// Pestañas accesibles (patrón WAI-ARIA): [data-pestanas] > [role=tablist] > [role=tab]
document.querySelectorAll<HTMLElement>('[data-pestanas]').forEach((grupo) => {
  const tabs = [...grupo.querySelectorAll<HTMLElement>('[role="tab"]')];
  const activar = (t: HTMLElement, foco = true) => {
    tabs.forEach((x) => { const sel = x === t; x.setAttribute('aria-selected', String(sel)); x.tabIndex = sel ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')!)?.toggleAttribute('hidden', !sel); });
    if (foco) t.focus();
    if (t.id) history.replaceState(null, '', `#${t.id}`);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activar(t));
    t.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      const j = k === 'ArrowRight' ? (i + 1) % tabs.length : k === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : -1;
      if (j >= 0) { e.preventDefault(); activar(tabs[j]); }
    });
  });
  const inicial = tabs.find((t) => `#${t.id}` === location.hash);
  if (inicial) activar(inicial, false);
});

// Vídeo del hero: reproducir / pausar
document.querySelectorAll<HTMLButtonElement>('[data-video-control]').forEach((b) => {
  const v = document.getElementById(b.getAttribute('aria-controls')!) as HTMLVideoElement | null;
  if (!v) return;
  const pintar = () => {
    const rep = !v.paused;
    b.setAttribute('aria-pressed', String(rep));
    b.querySelector('[data-etq]')!.textContent = rep ? 'Pausar vídeo' : b.dataset.etqPlay ?? 'Reproducir vídeo';
    b.querySelector('.i-play')?.classList.toggle('hidden', rep);
    b.querySelector('.i-pausa')?.classList.toggle('hidden', !rep);
  };
  b.addEventListener('click', () => { if (v.paused) { v.hidden = false; v.play(); } else v.pause(); });
  v.addEventListener('play', pintar); v.addEventListener('pause', pintar);
});

// Visor a pantalla completa: imágenes (galerías y enlaces a imágenes del contenido) y vista previa de PDF.
{
  const dlg = document.getElementById('visor') as HTMLDialogElement | null;
  if (dlg) {
    const cuerpo = dlg.querySelector<HTMLElement>('[data-visor-cuerpo]')!;
    const titulo = dlg.querySelector<HTMLElement>('#visor-titulo')!;
    const pie = dlg.querySelector<HTMLElement>('[data-visor-pie]')!;
    const abrir = dlg.querySelector<HTMLAnchorElement>('[data-visor-abrir]')!;
    const descargar = dlg.querySelector<HTMLAnchorElement>('[data-visor-descargar]')!;
    let lista: { src: string; texto: string }[] = [];
    let pos = 0;
    let origen: HTMLElement | null = null;
    const esImagen = (u: string) => /\/imagenes\/.+\.(jpe?g|png|gif|webp|avif)$/i.test(u.split('?')[0]);
    const mostrarImagen = () => {
      const it = lista[pos];
      cuerpo.replaceChildren();
      const img = document.createElement('img'); img.src = it.src; img.alt = it.texto; cuerpo.append(img);
      if (lista.length > 1) {
        for (const dir of [-1, 1]) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'visor-nav'; b.dataset.dir = String(dir);
          b.setAttribute('aria-label', dir < 0 ? 'Imagen anterior' : 'Imagen siguiente');
          b.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="${dir < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;
          b.addEventListener('click', () => mover(dir)); cuerpo.append(b);
        }
      }
      titulo.textContent = it.texto || 'Imagen';
      pie.textContent = lista.length > 1 ? `Imagen ${pos + 1} de ${lista.length}${it.texto ? ' · ' + it.texto : ''}` : it.texto;
      abrir.href = it.src; descargar.href = it.src; descargar.hidden = false;
    };
    const mover = (d: number) => { pos = (pos + d + lista.length) % lista.length; mostrarImagen(); };
    const abrirDialogo = () => { if (!dlg.open) dlg.showModal(); document.documentElement.style.overflow = 'hidden'; };
    dlg.addEventListener('close', () => { cuerpo.replaceChildren(); document.documentElement.style.overflow = ''; origen?.focus(); });
    dlg.querySelector('[data-visor-cerrar]')!.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', (e) => { if (lista.length > 1 && cuerpo.querySelector('img')) { if (e.key === 'ArrowRight') mover(1); if (e.key === 'ArrowLeft') mover(-1); } });

    // Imágenes del contenido: enlaces a una imagen y miniaturas de galería
    document.querySelectorAll<HTMLElement>('.prosa').forEach((art) => {
      const items: HTMLElement[] = [];
      art.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => { if (esImagen(a.getAttribute('href')!)) { a.dataset.lightbox = ''; items.push(a); } });
      art.querySelectorAll<HTMLImageElement>('.galeria img').forEach((img) => { if (!img.closest('a')) { img.dataset.lightbox = ''; img.tabIndex = 0; img.setAttribute('role', 'button'); items.push(img); } });
      const datos = items.map((el) => ({ src: el instanceof HTMLAnchorElement ? el.href : (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src, texto: (el.textContent || el.getAttribute('alt') || el.querySelector('img')?.alt || '').replace(/\s+/g, ' ').trim() }));
      items.forEach((el, i) => {
        const activar = (e: Event) => { e.preventDefault(); origen = el; lista = datos; pos = i; mostrarImagen(); abrirDialogo(); };
        el.addEventListener('click', activar);
        if (!(el instanceof HTMLAnchorElement)) el.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') activar(e); });
      });
    });

    // Vista previa de PDF: <button data-visor-pdf="/documentos/…pdf" data-titulo="…">
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-visor-pdf]');
      if (!b) return;
      e.preventDefault();
      origen = b; lista = [];
      const src = b.dataset.visorPdf!;
      const ifr = document.createElement('iframe'); ifr.src = `${src}#view=FitH`; ifr.title = `Vista previa: ${b.dataset.titulo ?? 'documento PDF'}`;
      cuerpo.replaceChildren(ifr);
      titulo.textContent = b.dataset.titulo ?? 'Documento PDF';
      pie.textContent = 'Si la vista previa no se muestra en su dispositivo, use «Abrir en otra pestaña» o «Descargar».';
      abrir.href = src; descargar.href = src; descargar.hidden = false;
      abrirDialogo();
    });
  }
}
