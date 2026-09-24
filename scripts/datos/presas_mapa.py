"""Mapa de presas: extrae las 168 presas del KMZ publicado (/documentos/presas/presas.kmz) a public/datos/presas-mapa.json
y descarga las fichas PDF que enlaza cada presa (/pdfs/Presas/Fichas/IdP_XXX.pdf) a medios/documentos/pdfs/presas/fichas/.
Las fichas se añaden a migracion/medios.json para que entren en el centro de documentos, las redirecciones y la verificación.

    python scripts/datos/presas_mapa.py
"""
import hashlib, json, re, urllib.request, zipfile, html
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ruta_medios = RAIZ / '.medios-ruta'
MEDIOS = Path(ruta_medios.read_text(encoding='utf-8').strip()) if ruta_medios.exists() else RAIZ / 'medios'
KMZ = MEDIOS / 'documentos' / 'presas' / 'presas.kmz'
DESTINO = MEDIOS / 'documentos' / 'pdfs' / 'presas' / 'fichas'
MEDIOS_JSON = RAIZ / 'migracion' / 'medios.json'

kml = zipfile.ZipFile(KMZ).read('Presas.kml').decode('utf-8', 'replace')
dato = lambda pm, n: (re.search(rf'<SimpleData name="{re.escape(n)}">(.*?)</SimpleData>', pm, re.S) or [None, ''])[1].strip()
presas = []
for pm in re.findall(r'<Placemark\b.*?</Placemark>', kml, re.S):
    coords = re.search(r'<coordinates>\s*([-\d.]+),([-\d.]+)', pm)
    ficha = re.search(r"href='(https?://www\.aguasgrancanaria\.com(/pdfs/Presas/Fichas/[^']+))'", pm)
    estilo = re.search(r'<styleUrl>#kml_style_ft_(\w+)</styleUrl>', pm)
    presas.append({
        'id': re.search(r'id="(kml_\d+)"', pm).group(1),
        'nombre': html.unescape(dato(pm, 'Nombre') or re.search(r'<name>(.*?)</name>', pm, re.S).group(1)).strip(),
        'tipo': 'grande' if estilo and estilo.group(1).lower().startswith('g') else 'pequena',
        'cuenca': dato(pm, 'Cuenca') or None,
        'altura': dato(pm, 'Altura') or None,
        'capacidad': dato(pm, 'Capacidad') or None,
        'latitud': dato(pm, 'Latitud') or None,
        'longitud': dato(pm, 'Longitud') or None,
        'lon': float(coords.group(1)) if coords else None,
        'lat': float(coords.group(2)) if coords else None,
        'ficha_antigua': ficha.group(2) if ficha else None,
    })

def descargar(p):
    if not p['ficha_antigua']:
        return None
    nombre = Path(p['ficha_antigua']).name.lower()
    f = DESTINO / nombre
    url = 'https://www.aguasgrancanaria.com' + p['ficha_antigua']
    if not f.exists():
        try:
            datos = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 AguasGC-Migracion'}), timeout=120).read()
        except Exception as e:
            return {'url': url, 'status': getattr(e, 'code', 0)}
        f.write_bytes(datos)
    b = f.read_bytes()
    return {'url': url, 'status': 200, 'ruta': f'/documentos/pdfs/presas/fichas/{nombre}', 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

DESTINO.mkdir(parents=True, exist_ok=True)
with ThreadPoolExecutor(6) as ex:
    res = list(ex.map(descargar, presas))
for p, r in zip(presas, res):
    p['ficha'] = r['ruta'] if r and r['status'] == 200 else None
    p['ficha_no_disponible'] = bool(r and r['status'] != 200)

(RAIZ / 'public' / 'datos').mkdir(parents=True, exist_ok=True)
(RAIZ / 'public' / 'datos' / 'presas-mapa.json').write_text(json.dumps(presas, ensure_ascii=False), encoding='utf-8')

# Registro en el índice de medios (sin duplicar)
medios = json.loads(MEDIOS_JSON.read_text(encoding='utf-8'))
existentes = {m['urlAntigua'] for m in medios}
nuevos = 0
for p, r in zip(presas, res):
    if not r or r['url'] in existentes:
        continue
    existentes.add(r['url'])
    medios.append({
        'urlAntigua': r['url'], 'rutaAntigua': p['ficha_antigua'], 'rutaNueva': r.get('ruta', ''), 'tipo': 'documento', 'extension': 'pdf',
        'enInventario': False, 'soloInventario': False, 'paginas': ['/presas/ubicacion_presas.php'],
        'textos': [f"Ficha de la presa {p['nombre']}"], 'status': r['status'], 'contentType': 'application/pdf',
        'bytes': r.get('bytes'), 'sha256': r.get('sha256'), 'descargado': r['status'] == 200, 'origen': 'KMZ de presas',
    })
    nuevos += 1
MEDIOS_JSON.write_text(json.dumps(medios, ensure_ascii=False, indent=2), encoding='utf-8')
ok = sum(1 for r in res if r and r['status'] == 200)
print(f'Presas: {len(presas)} ({sum(p["tipo"] == "grande" for p in presas)} grandes) · fichas descargadas: {ok} · no disponibles: {sum(p["ficha_no_disponible"] for p in presas)} · añadidas a medios.json: {nuevos}')
