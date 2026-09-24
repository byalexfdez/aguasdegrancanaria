"""Extrae las fichas PDF de estaciones pluviométricas del ZIP publicado (/documentos/programas/estaciones_pluviometricas.zip)
a medios/documentos/programas/estaciones-pluviometricas/NNN-nombre.pdf para enlazarlas una a una desde el mapa y la tabla.
El ZIP original se mantiene. Salida: migracion/cache/fichas-pluviometros.json  {numero: {ruta, bytes, nombre}}

    python scripts/datos/pluviometros_fichas.py
"""
import json, re, unicodedata, zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ruta_medios = RAIZ / '.medios-ruta'
MEDIOS = Path(ruta_medios.read_text(encoding='utf-8').strip()) if ruta_medios.exists() else RAIZ / 'medios'
ZIP = MEDIOS / 'documentos' / 'programas' / 'estaciones_pluviometricas.zip'
DESTINO = MEDIOS / 'documentos' / 'programas' / 'estaciones-pluviometricas'
DESTINO.mkdir(parents=True, exist_ok=True)

def nombre_real(info):
    # Los nombres vienen en CP437 (sin la marca UTF-8 del ZIP); se recuperan las tildes con CP850.
    if info.flag_bits & 0x800:
        return info.filename
    try:
        return info.filename.encode('cp437').decode('cp850')
    except Exception:
        return info.filename

def sanear(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'-{2,}', '-', re.sub(r'[^a-z0-9.]+', '-', s.lower())).strip('-')

res = {}
with zipfile.ZipFile(ZIP) as z:
    for info in z.infolist():
        if info.is_dir() or not info.filename.lower().endswith('.pdf'):
            continue
        real = Path(nombre_real(info)).name
        m = re.match(r'(\d{1,3})\s*-\s*(.+)\.pdf$', real, re.I)
        if not m:
            continue
        num = int(m.group(1))
        fichero = f'{num:03d}-{sanear(m.group(2))}.pdf'
        f = DESTINO / fichero
        if not f.exists() or f.stat().st_size != info.file_size:
            f.write_bytes(z.read(info))
        res[num] = {'ruta': f'/documentos/programas/estaciones-pluviometricas/{fichero}', 'bytes': info.file_size, 'nombre': m.group(2).strip()}

(RAIZ / 'migracion' / 'cache').mkdir(parents=True, exist_ok=True)
(RAIZ / 'migracion' / 'cache' / 'fichas-pluviometros.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'Fichas extraídas: {len(res)}', list(res.items())[:2])
