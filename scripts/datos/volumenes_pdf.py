"""Volúmenes de presas publicados solo en PDF (2023 anual; septiembre y octubre de 2021) → JSON para el panel de embalses.

Método: `pdftotext -table` conserva la posición de cada cifra; cada valor se asigna al mes cuya cabecera está más cerca.
Antes de usarlo se VALIDA con 2024, que existe en PDF y en Excel: si alguna cifra no coincide, el script se detiene.

    python scripts/datos/volumenes_pdf.py
Salida: public/datos/volumenes/2023.json, public/datos/volumenes/2021.json y migracion/cache/validacion-volumenes-pdf.json
"""
import json, re, subprocess, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ruta_medios = RAIZ / '.medios-ruta'
MEDIOS = Path(ruta_medios.read_text(encoding='utf-8').strip()) if ruta_medios.exists() else RAIZ / 'medios'
DIR = MEDIOS / 'documentos' / 'pdfs' / 'presas' / 'volumenes'
SALIDA = RAIZ / 'public' / 'datos' / 'volumenes'
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
incidencias, parciales = [], []
NUM = re.compile(r'(?<!\S)(?:[-–](?!\S)|-?\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|-?\d+(?:,\d+)?%?)(?!\S)')  # solo cifras aisladas (no el «3» de «(m3)»)

def texto(pdf):
    return subprocess.run(['pdftotext', '-table', '-enc', 'UTF-8', str(pdf), '-'], capture_output=True, text=True, encoding='utf-8').stdout

def valor(s):
    if s in ('-', '–'):
        return None  # guion: mes sin dato en el PDF
    pct = s.endswith('%'); s = s.rstrip('%')
    n = float(s.replace('.', '').replace(',', '.'))
    return round(n / 100, 6) if pct else n

def anual(pdf):
    lineas = texto(pdf).splitlines()
    i_cab = next(i for i, l in enumerate(lineas) if 'ENERO' in l and 'DICIEMBRE' in l)
    cab = [(m.start() + m.end()) / 2 for m in re.finditer(r'ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE', lineas[i_cab])]
    assert len(cab) == 12, cab
    # Posición real de cada columna: se aprende de las filas completas (12 cifras de mes, más el «nivel máximo» a la izquierda).
    muestras = [[] for _ in range(12)]
    for l in lineas[i_cab + 1:]:
        c = [(m.start() + m.end()) / 2 for m in NUM.finditer(l)]
        if len(c) == 13 and c[0] < cab[0]:
            c = c[1:]
        if len(c) == 12 and c[0] > cab[0] - (cab[1] - cab[0]):
            for j in range(12): muestras[j].append(c[j])
    centros = [sum(m) / len(m) if m else cab[j] for j, m in enumerate(muestras)]
    limite = centros[0] - (centros[1] - centros[0]) * 0.6  # a la izquierda: «nivel máximo»
    presas, totales, notas = [], [], []
    actual = None; grupo = None; pendiente_nombre = None
    for l in lineas[i_cab + 1:]:
        if not l.strip():
            continue
        if re.search(r'ENERO.*DICIEMBRE', l):
            continue
        etiqueta = NUM.sub(' ', l).strip()
        if len(etiqueta) > 70:  # nota al pie: se conserva el texto literal, con sus cifras
            notas.append(re.sub(r'\s{2,}', ' ', l.strip())); continue
        toks = [(m.group(), (m.start() + m.end()) / 2) for m in NUM.finditer(l)]
        # «Nivel máximo»: primera cifra si la fila trae 13, o si está claramente a la izquierda de ENERO.
        lleva_maximo = bool(re.search(r'(?i)altura|volumen \(m', etiqueta)) and not re.search(r'(?i)total', etiqueta) or (re.search(r'(?i)total', etiqueta) and len(toks) == 13)
        if toks and lleva_maximo:
            izq, der = [toks[0][0]], toks[1:]
        else:
            izq, der = [], toks
        meses = [None] * 12
        if len(der) == 12:
            meses = [valor(t) for t, _ in der]              # fila completa: sin ambigüedad
        elif der:
            # Fila incompleta: en este PDF la posición horizontal no es fiable, así que NO se asigna a meses (no se inventa).
            incidencias.append(f'{pdf.name}: fila incompleta ({len(der)} de 12 valores), se deja sin asignar: «{re.sub(chr(32)+"+", " ", l.strip())}»')
        low = etiqueta.lower()
        if re.search(r'altura', low):
            nombre = re.sub(r'(?i)altura.*', '', etiqueta).strip() or None
            actual = {'presa': nombre, 'grupo': grupo, 'altura_maxima_m': valor(izq[0]) if izq else None, 'volumen_maximo_m3': None,
                      'meses': [{'mes': MESES[j], 'altura_m': meses[j], 'volumen_m3': None, 'variacion_m3': None, 'porcentaje': None} for j in range(12)]}
            presas.append(actual)
        elif re.search(r'volumen \(m', low) and actual and not re.search(r'total', low):
            nombre = re.sub(r'(?i)volumen.*', '', etiqueta).strip()
            if nombre and not actual['presa']:
                actual['presa'] = nombre.upper()
            actual['volumen_maximo_m3'] = valor(izq[0]) if izq else None
            for j in range(12): actual['meses'][j]['volumen_m3'] = meses[j]
        elif 'variaci' in low and 'total' not in low and actual:
            for j in range(12): actual['meses'][j]['variacion_m3'] = meses[j]
        elif 'embalsado' in low and 'total' not in low and actual:
            for j in range(12): actual['meses'][j]['porcentaje'] = meses[j]
        elif 'total' in low:
            totales.append({'concepto': re.sub(r'\s{2,}', ' ', etiqueta), 'referencia': valor(izq[0]) if izq else None, 'valores': meses}); actual = None
        elif not toks and len(etiqueta) > 40:
            notas.append(etiqueta)
        elif not toks and len(etiqueta) < 40:
            if actual and actual['presa'] is None:
                actual['presa'] = etiqueta.upper()   # nombre en línea propia (2024)
            else:
                grupo = etiqueta                      # rótulo de grupo («Cabildo»…)
    # En 2024 el nombre va en la línea del volumen; si no, en la siguiente sin cifras.
    for p in presas:
        p['presa'] = re.sub(r'\s*\*$', '', (p['presa'] or '').upper()).strip() or None
    return {'presas': presas, 'totales': totales, 'notas': notas}

def comparar(a, b, tol=0.006):
    if a is None or b is None:
        return a == b or (a in (None, 0) and b in (None, 0))
    return abs(a - b) <= max(tol, abs(b) * 1e-9) if isinstance(b, float) and abs(b) < 1.5 else abs(a - b) < 0.5

# ---------------------------------------------------------------- validación con 2024 (PDF frente a Excel)
excel = json.loads(subprocess.run(['node', '-e', """
import('./src/lib/volumenes.ts').catch(()=>null);
const X=require('xlsx');const fs=require('fs');
"""], capture_output=True, text=True).stdout or 'null') if False else None
ref = json.loads((RAIZ / 'migracion' / 'colecciones' / 'volumenes' / '2024.json').read_text(encoding='utf-8'))
pdf24 = anual(DIR / '2024.pdf')
difs, comprobadas, sin_asignar = [], 0, 0
for pr in ref['presas']:
    pp = next((x for x in pdf24['presas'] if x['presa'] and x['presa'].replace(' ', '') == pr['presa'].replace(' ', '')), None)
    if not pp:
        difs.append(f"Presa no encontrada en PDF: {pr['presa']}"); continue
    for j in range(12):
        me, mp = pr['meses'][j], pp['meses'][j]
        for ce, cp in (('altura_m', 'altura_m'), ('volumen_m3', 'volumen_m3'), ('variacion_m3', 'variacion_m3'), ('porcentaje_embalsado', 'porcentaje')):
            comprobadas += 1
            if mp[cp] is None and me[ce] is not None:
                sin_asignar += 1
            elif not comparar(mp[cp], me[ce]):
                difs.append(f"{pr['presa']} {MESES[j]} {ce}: Excel={me[ce]} PDF={mp[cp]}")
(RAIZ / 'migracion' / 'cache').mkdir(parents=True, exist_ok=True)
(RAIZ / 'migracion' / 'cache' / 'validacion-volumenes-pdf.json').write_text(json.dumps({'comprobadas': comprobadas, 'sin_asignar': sin_asignar, 'diferencias': difs, 'incidencias': incidencias, 'parciales': parciales}, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'Validación 2024 PDF↔Excel: {comprobadas} cifras comprobadas · {len(difs)} ERRÓNEAS · {sin_asignar} sin asignar (filas incompletas: {len(incidencias)})')
for d in difs[:25]: print('  ', d)
if '--forzar' not in sys.argv and len(difs) > 0:
    print('Se detiene: el método no reproduce exactamente el Excel. Revise las diferencias.'); sys.exit(1)

# ---------------------------------------------------------------- 2023
a23 = anual(DIR / '2023.pdf')
SALIDA.mkdir(parents=True, exist_ok=True)
a23['notas'] = []  # las notas al pie salen truncadas del PDF: no se publican (se enlaza el PDF original)
(SALIDA / '2023.json').write_text(json.dumps({'anio': 2023, 'fichero': '/documentos/pdfs/presas/volumenes/2023.pdf', 'hoja': 'PDF', 'origen': 'pdf',
    'titulo': 'VOLÚMENES ALMACENADOS EN LOS EMBALSES DE GRAN CANARIA GESTIONADOS POR EL CONSEJO INSULAR DE AGUAS', **a23}, ensure_ascii=False, indent=1), encoding='utf-8')
print('2023:', [(p['presa'], sum(m['volumen_m3'] is not None for m in p['meses'])) for p in a23['presas']], 'totales:', [t['concepto'] for t in a23['totales']])

# ---------------------------------------------------------------- 2021 (lecturas puntuales de septiembre y octubre)
def mensual(pdf, mes):
    presas, grupo = [], None
    for l in texto(pdf).splitlines():
        toks = NUM.findall(l); etq = NUM.sub(' ', l).strip()
        if len(toks) >= 6 and etq and not etq.upper().startswith('TOTAL'):
            alt_max, cap, alt, vol, _ant, var, pct = (toks + [None] * 7)[:7] if len(toks) >= 7 else (toks[0], toks[1], toks[2], toks[3], toks[4], None, toks[5])
            presas.append({'presa': re.sub(r'\s*\(I\)\s*', '', etq).strip().upper(), 'grupo': grupo, 'altura_maxima_m': valor(alt_max), 'volumen_maximo_m3': valor(cap),
                           'mes': mes, 'altura_m': valor(alt), 'volumen_m3': valor(vol), 'variacion_m3': valor(var) if var else None, 'porcentaje': valor(pct) if pct else None})
        elif not toks and etq and len(etq) < 30 and etq not in ('(m)', '(m³)'):
            grupo = etq
    return presas
lect = mensual(DIR / '20210930.pdf', 'septiembre') + mensual(DIR / '20211031.pdf', 'octubre')
nombres = list(dict.fromkeys(p['presa'] for p in lect))
presas21 = []
for n in nombres:
    fs = [p for p in lect if p['presa'] == n]
    presas21.append({'presa': n, 'grupo': fs[0]['grupo'], 'altura_maxima_m': fs[0]['altura_maxima_m'], 'volumen_maximo_m3': fs[0]['volumen_maximo_m3'],
                     'meses': [{'mes': m, **next(({'altura_m': f['altura_m'], 'volumen_m3': f['volumen_m3'], 'variacion_m3': f['variacion_m3'], 'porcentaje': f['porcentaje']} for f in fs if f['mes'] == m),
                                                 {'altura_m': None, 'volumen_m3': None, 'variacion_m3': None, 'porcentaje': None})} for m in MESES]})
(SALIDA / '2021.json').write_text(json.dumps({'anio': 2021, 'fichero': '/documentos/pdfs/presas/volumenes/20211031.pdf', 'hoja': 'PDF', 'origen': 'pdf',
    'titulo': 'VOLÚMENES DE PRESAS DE GRAN CANARIA (lecturas de septiembre y octubre de 2021)', 'presas': presas21, 'totales': [], 'notas': []}, ensure_ascii=False, indent=1), encoding='utf-8')
print('2021:', [(p['presa'], p['grupo']) for p in presas21])
