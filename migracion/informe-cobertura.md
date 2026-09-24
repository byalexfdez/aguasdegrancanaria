# Informe de cobertura de la migración

Generado el 24/9/2026, 8:58:22 por `scripts/verify/verificar.mjs` contra http://127.0.0.1:4322.

## Criterios de aceptación

| | Criterio | Resultado |
|---|---|---|
| ✅ | Las 163 rutas antiguas tienen página nueva y redirección 301 | 163/163 |
| ✅ | Los documentos existentes en origen responden 200 en su nueva ruta (mismo tamaño en bytes) | 891/891 |
| ✅ | Imágenes migradas | 269/269 |
| ✅ | Diferencia de texto ≤ 2 % página a página | 161/163 + 2 justificadas (ver abajo) |
| ✅ | Tablas, imágenes y vídeos migrados (recuento por página) | 163/163 |
| ✅ | Cero enlaces internos rotos | 0 rotos |
| ℹ️ | Enlaces externos con incidencias (listados aparte, no se borran) | 1260 · ver `enlaces-externos-rotos.md` |
| ✅ | axe-core sin errores críticos | 0 críticos · 0 graves en 18 páginas |
| ✅ | Sin desbordamiento horizontal a 360 px | 0 páginas con desbordamiento de 240 |
| ✅ | Lighthouse móvil ≥ 90 (≥ 95 accesibilidad) | `/` R98/A100/BP100/SEO100 · `/agua-en-gran-canaria/presas/` R97/A100/BP100/SEO100 · `/servicios/normativa/canarias/ley-aguas/` R98/A100/BP100/SEO100 · `/actualidad/noticias/` R99/A100/BP100/SEO100 |
| ✅ | Revisión responsive 360 / 768 / 1280 / 1920 px | 20 capturas en `migracion/qa/capturas/` |

## Documentos que no existen en el servidor de origen (33)

No se pueden migrar sin el archivo. En la web nueva se muestran como «no disponible», sin borrar el enlace. Detalle en `cobertura-fase1.md`, apartado 4.

## Páginas con diferencia de texto > 2 % (0)

Ninguna.

## Diferencias de texto revisadas y justificadas (2)

| Ruta antigua | Dif. | Palabras no encontradas | Motivo |
|---|---|---|---|
| `/consejo.php` | 3.5 % | 1º, 30 | Pie antiguo repetido en la página («1º PLANTA», «13:30»). Se sustituye por el pie común con los datos facilitados por el cliente («1ª planta», «13:00»). Discrepancia de horario registrada como duda D en erratas-corregidas.md. |
| `/economico.php` | 2.7 % | 1º, 30 | Igual que /consejo.php: pie antiguo repetido («1º PLANTA», «13:30»). |

Se excluye de la comparación el texto de reserva del reproductor de vídeo antiguo («Para ver este vídeo, debe activar la ejecución de JavaScript…»), que está dentro de `<video>` y ningún navegador actual muestra.

## Recuentos con diferencias (0)

Ninguno.

## Enlaces internos rotos (0)

Ninguno.



