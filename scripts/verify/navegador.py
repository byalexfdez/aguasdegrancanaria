"""Fase 5 — Pruebas en navegador (Playwright + axe-core + Lighthouse).

Requiere el sitio compilado servido en http://127.0.0.1:4322 (`npm run build && npm run servir`).
Genera migracion/qa/navegador.json (lo lee scripts/verify/verificar.mjs) y capturas en migracion/qa/capturas/.

    python scripts/verify/navegador.py            # todo
    python scripts/verify/navegador.py --rapido   # sin Lighthouse
"""
import json, os, re, subprocess, sys, glob
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parents[2]
BASE = os.environ.get('VERIFICAR_URL', 'http://127.0.0.1:4322')
QA = RAIZ / 'migracion' / 'qa'
CAPTURAS = QA / 'capturas'
CAPTURAS.mkdir(parents=True, exist_ok=True)
AXE = (RAIZ / 'node_modules' / 'axe-core' / 'axe.min.js').read_text(encoding='utf-8')

# Una página de cada plantilla + las más visitadas previsibles
PLANTILLAS = [
    '/', '/el-consejo/', '/el-consejo/organos-de-gobierno/', '/el-consejo/juntas-y-sesiones/', '/el-consejo/ubicacion-y-contacto/',
    '/agua-en-gran-canaria/presas/', '/agua-en-gran-canaria/presas/volumenes/', '/agua-en-gran-canaria/instalaciones-hidraulicas-subterraneas/',
    '/planificacion/plan-hidrologico/', '/servicios/normativa/', '/servicios/normativa/canarias/ley-aguas/', '/transparencia/presupuestos/',
    '/actualidad/noticias/', '/actualidad/anuncios/', '/buscar/', '/centro-de-documentos/', '/mapa-web/', '/divulgacion/consejos-de-ahorro/',
]
ANCHOS = [360, 768, 1280, 1920]

def todas_las_paginas():
    dist = RAIZ / 'dist'
    urls = []
    for f in glob.glob(str(dist / '**' / 'index.html'), recursive=True):
        rel = Path(f).relative_to(dist).parent.as_posix()
        if rel.startswith(('pagefind', 'visores', 'admin')):
            continue
        urls.append('/' if rel == '.' else f'/{rel}/')
    return sorted(urls)

res = {'axe': {}, 'desbordamiento': {}, 'capturas': [], 'lighthouse': []}
with sync_playwright() as p:
    nav = p.chromium.launch()

    # 1) axe-core (WCAG 2.1 A/AA) en las plantillas
    ctx = nav.new_context(viewport={'width': 1280, 'height': 900})
    pg = ctx.new_page()
    reglas = {}
    criticos = graves = 0
    for url in PLANTILLAS:
        pg.goto(BASE + url, wait_until='networkidle', timeout=120000)
        pg.add_script_tag(content=AXE)
        r = pg.evaluate("""async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })).violations
                          .map(v => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target?.join(' ') }))""")
        for v in r:
            d = reglas.setdefault(v['id'], {'id': v['id'], 'impacto': v['impacto'], 'paginas': [], 'ejemplos': []})
            d['paginas'].append(url); d['ejemplos'].append(v['ejemplo'])
            criticos += v['impacto'] == 'critical'; graves += v['impacto'] == 'serious'
    res['axe'] = {'paginas': len(PLANTILLAS), 'criticos': criticos, 'graves': graves, 'detalle': sorted(reglas.values(), key=lambda d: d['impacto'] != 'critical')}
    ctx.close()
    print(f"axe: {criticos} críticos, {graves} graves", {k: v['paginas'][:3] for k, v in reglas.items()})

    # 2) Desbordamiento horizontal a 360 px en todas las páginas
    ctx = nav.new_context(viewport={'width': 360, 'height': 780}, device_scale_factor=1)
    pg = ctx.new_page()
    fallos = []
    paginas = todas_las_paginas()
    for url in paginas:
        pg.goto(BASE + url, wait_until='domcontentloaded', timeout=120000)
        # Desplazamiento horizontal real (lo que la persona puede llegar a ver), no solo scrollWidth.
        pg.evaluate('window.scrollTo(4000, 0)')
        ancho = pg.evaluate('innerWidth + window.scrollX')
        if pg.evaluate('window.scrollX') > 1:
            culpable = pg.evaluate("""() => { const w = innerWidth; const r = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > w + 2 && !e.closest('.tabla-contenedor, .leaflet-container, pre'));
                                      return r.slice(0, 3).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : '')); }""")
            fallos.append({'url': url, 'ancho': ancho, 'elementos': culpable})
    res['desbordamiento'] = {'revisadas': len(paginas), 'fallos': fallos}
    ctx.close()
    print(f"desbordamiento 360px: {len(fallos)} de {len(paginas)}", fallos[:5])

    # 3) Capturas responsive
    for ancho in ANCHOS:
        ctx = nav.new_context(viewport={'width': ancho, 'height': 900})
        pg = ctx.new_page()
        for url in ['/', '/agua-en-gran-canaria/presas/volumenes/', '/servicios/normativa/canarias/ley-aguas/', '/actualidad/noticias/', '/transparencia/presupuestos/']:
            pg.goto(BASE + url, wait_until='networkidle', timeout=120000)
            pg.evaluate("document.querySelectorAll('.revelar').forEach(e=>e.classList.add('visible'))")
            nombre = f"{ancho}-{re.sub(r'[^a-z0-9]+', '-', url.strip('/')) or 'inicio'}.png"
            pg.screenshot(path=str(CAPTURAS / nombre))
            res['capturas'].append(nombre)
        ctx.close()
    nav.close()

# 4) Lighthouse (móvil) con el Chromium de Playwright
if '--rapido' not in sys.argv:
    chrome = None
    with sync_playwright() as p:
        chrome = p.chromium.executable_path
    lh = RAIZ / 'node_modules' / 'lighthouse' / 'cli' / 'index.js'
    for url in ['/', '/agua-en-gran-canaria/presas/', '/servicios/normativa/canarias/ley-aguas/', '/actualidad/noticias/']:
        salida = QA / f"lighthouse-{re.sub(r'[^a-z0-9]+', '-', url.strip('/')) or 'inicio'}.json"
        cmd = ['node', str(lh), BASE + url, '--quiet', '--output=json', f'--output-path={salida}', '--form-factor=mobile',
               '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new --no-sandbox']
        env = dict(os.environ, CHROME_PATH=chrome)
        try:
            if salida.exists(): salida.unlink()
            subprocess.run(cmd, env=env, check=False, timeout=240, capture_output=True)  # en Windows falla al borrar su carpeta temporal tras terminar
            d = json.loads(salida.read_text(encoding='utf-8'))
            c = d['categories']
            res['lighthouse'].append({'url': url, 'rendimiento': round(c['performance']['score'] * 100), 'accesibilidad': round(c['accessibility']['score'] * 100),
                                      'buenas': round(c['best-practices']['score'] * 100), 'seo': round(c['seo']['score'] * 100),
                                      'lcp': d['audits']['largest-contentful-paint']['displayValue'], 'cls': d['audits']['cumulative-layout-shift']['displayValue']})
            print('lighthouse', res['lighthouse'][-1])
        except Exception as e:
            print('lighthouse error', url, str(e)[:300])

(QA / 'navegador.json').write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
print('OK ->', QA / 'navegador.json')
