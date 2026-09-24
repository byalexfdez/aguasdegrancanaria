export const fechaLarga = (d?: Date | null) =>
  d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
export const fechaCorta = (d?: Date | null) =>
  d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '';
export const fechaISO = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);

export const numero = (n: number, dec = 0) => n.toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: dec });
export const porcentaje = (n: number | null | undefined, dec = 1) => (n == null ? '—' : `${(n * 100).toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: dec })} %`);

export const peso = (b?: number | null) => {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024).toLocaleString('es-ES')} KB`;
  return `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
};

export const formato = (url: string) => (url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

export const NOMBRE_FORMATO: Record<string, string> = {
  pdf: 'PDF', xlsx: 'Excel', xls: 'Excel', ods: 'Hoja de cálculo ODS', odt: 'Texto ODT', doc: 'Word', docx: 'Word',
  zip: 'ZIP', rar: 'RAR', kmz: 'KMZ (Google Earth)', ppt: 'PowerPoint', txt: 'Texto', xml: 'XML', rtf: 'RTF', mp4: 'Vídeo MP4',
};

export const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
