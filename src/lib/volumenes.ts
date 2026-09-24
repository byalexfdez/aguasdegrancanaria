// Lee en tiempo de build los Excel de volúmenes embalsados (public/datos/volumenes/*.xlsx).
// El cliente sube el Excel del año desde el CMS y el panel se actualiza en la siguiente publicación.
// Estructura del Excel: bloques de 4 filas por presa (ALTURA, Volumen, Variación, %Embalsado) × 12 meses.
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface MesPresa { mes: string; altura_m: number | null; volumen_m3: number | null; variacion_m3: number | null; porcentaje: number | null }
export interface Presa { presa: string; grupo: string | null; altura_maxima_m: number | null; volumen_maximo_m3: number | null; meses: MesPresa[] }
export interface Total { concepto: string; referencia: number | null; valores: (number | null)[] }
export interface Anio { anio: number; fichero: string; hoja: string; titulo: string | null; presas: Presa[]; totales: Total[]; notas: string[]; mesesConDatos: number; origen?: 'excel' | 'pdf' }

const limpia = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const s = limpia(v);
  if (!s) return null;
  const pct = s.endsWith('%');
  const n = Number(s.replace('%', '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : pct ? n / 100 : n;
};

function leerHoja(filas: unknown[][], fichero: string, hoja: string): Anio | null {
  const cab = filas.findIndex((r) => limpia(r[0]).toUpperCase() === 'PRESAS');
  if (cab < 0) return null;
  const anioTxt = filas.map((r) => r.map(limpia).join(' ')).find((t) => /A[ÑN]O\s+\d{4}/i.test(t));
  const anio = Number(anioTxt?.match(/A[ÑN]O\s+(\d{4})/i)?.[1] ?? hoja);
  const titulo = filas.map((r) => r.map(limpia).find((c) => /VOL[ÚU]MENES ALMACENADOS/i.test(c))).find(Boolean) ?? null;
  const presas: Presa[] = []; const totales: Total[] = []; const notas: string[] = [];
  let actual: Presa | null = null; let grupo: string | null = null;
  for (let i = cab + 2; i < filas.length; i++) {
    const r = filas[i]; const c0 = limpia(r[0]); const c1 = limpia(r[1]); const meses = r.slice(3, 15);
    if (/^ENERO$/i.test(limpia(r[3]))) { grupo = c0 || null; actual = null; continue; }
    if (/^Columna\d+$/.test(c0)) continue;
    if (c0 && /^ALTURA/i.test(c1)) {
      actual = { presa: c0, grupo, altura_maxima_m: num(r[2]), volumen_maximo_m3: null, meses: MESES.map((mes, j) => ({ mes, altura_m: num(meses[j]), volumen_m3: null, variacion_m3: null, porcentaje: null })) };
      presas.push(actual);
    } else if (actual && /^Volumen/i.test(c1)) { actual.volumen_maximo_m3 = num(r[2]); meses.forEach((v, j) => { actual!.meses[j].volumen_m3 = num(v); }); }
    else if (actual && /^Variaci/i.test(c1)) meses.forEach((v, j) => { actual!.meses[j].variacion_m3 = num(v); });
    else if (actual && /Embalsado/i.test(c1)) meses.forEach((v, j) => { actual!.meses[j].porcentaje = num(v); });
    else if (c0 && !c1 && r.slice(3).some((v) => limpia(v))) { totales.push({ concepto: c0, referencia: num(r[2]), valores: meses.map(num) }); actual = null; }
    else if (c0 && c0.length > 40 && r.slice(1).every((v) => !limpia(v))) notas.push(c0);
  }
  // Mes con datos = hay altura registrada (los meses futuros vienen vacíos o a 0 en los totales).
  const mesesConDatos = MESES.filter((_, j) => presas.some((p) => p.meses[j].altura_m != null && p.meses[j].altura_m !== 0 || (p.meses[j].volumen_m3 ?? 0) > 0 && p.meses[j].altura_m != null)).length;
  return { anio, fichero, hoja, titulo, presas, totales, notas, mesesConDatos };
}

let cache: Anio[] | null = null;
export function volumenes(): Anio[] {
  if (cache) return cache;
  const dir = path.resolve('public/datos/volumenes');
  const porAnio = new Map<number, Anio>();
  const ficheros = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f)).sort() : [];
  for (const f of ficheros) {
    const wb = XLSX.read(fs.readFileSync(path.join(dir, f)));
    for (const hoja of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: '' });
      const a = leerHoja(filas, `/datos/volumenes/${f}`, hoja);
      if (!a) continue;
      const prev = porAnio.get(a.anio);
      const datos = (x: Anio) => x.presas.reduce((s, p) => s + p.meses.filter((m) => m.altura_m != null).length, 0);
      if (!prev || datos(a) > datos(prev) || (datos(a) === datos(prev) && f > path.basename(prev.fichero))) porAnio.set(a.anio, a);
    }
  }
  // Años publicados solo en PDF (extraídos y validados con scripts/datos/volumenes_pdf.py). El Excel tiene prioridad.
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^\d{4}\.json$/.test(x)) : []) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (porAnio.has(j.anio)) continue;
    const presas: Presa[] = j.presas.map((p: any) => ({ presa: p.presa, grupo: p.grupo ?? null, altura_maxima_m: p.altura_maxima_m, volumen_maximo_m3: p.volumen_maximo_m3,
      meses: p.meses.map((m: any) => ({ mes: m.mes, altura_m: m.altura_m, volumen_m3: m.volumen_m3, variacion_m3: m.variacion_m3, porcentaje: m.porcentaje })) }));
    const mesesConDatos = MESES.filter((_, k) => presas.some((p) => p.meses[k].volumen_m3 != null)).length;
    porAnio.set(j.anio, { anio: j.anio, fichero: j.fichero, hoja: 'PDF', titulo: j.titulo, presas, totales: (j.totales ?? []).map((t: any) => ({ concepto: t.concepto, referencia: t.referencia, valores: t.valores })), notas: j.notas ?? [], mesesConDatos, origen: 'pdf' });
  }
  cache = [...porAnio.values()].sort((a, b) => b.anio - a.anio);
  return cache;
}

/** Último mes con lecturas del año más reciente. */
export function ultimaLectura() {
  const a = volumenes()[0];
  if (!a) return null;
  let j = -1;
  for (let k = 11; k >= 0; k--) if (a.presas.some((p) => p.meses[k].altura_m != null)) { j = k; break; }
  if (j < 0) return null;
  const total = a.totales.find((t) => /^VOLUMEN TE[ÓO]RICO TOTAL$/i.test(t.concepto));
  const pct = a.totales.find((t) => /%\s*EMBALSADO TOTAL/i.test(t.concepto));
  return { anio: a.anio, mes: MESES[j], indiceMes: j, volumenTotal: total?.valores[j] ?? null, capacidad: total?.referencia ?? null, porcentajeTotal: pct?.valores[j] ?? null, presas: a.presas.map((p) => ({ presa: p.presa, grupo: p.grupo, porcentaje: p.meses[j].porcentaje, volumen: p.meses[j].volumen_m3, maximo: p.volumen_maximo_m3 })) };
}
