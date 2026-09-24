// Compilación de demostración (npm run build:demo): la web se publica fuera del dominio oficial,
// así que se bloquea la indexación para no competir con www.aguasgrancanaria.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
const hta = path.join(dist, '.htaccess');
if (fs.existsSync(hta)) {
  const cab = '<IfModule mod_headers.c>\n  Header set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n\n';
  const txt = fs.readFileSync(hta, 'utf8');
  // Sin HSTS: en un dominio de pruebas obligaría durante un año a usar HTTPS en todos sus subdominios.
  const sinHsts = txt.replace(/^.*Strict-Transport-Security.*\r?\n/m, '');
  if (!txt.includes('X-Robots-Tag')) fs.writeFileSync(hta, cab + sinHsts, 'utf8');
}
console.log('Demo: robots.txt y X-Robots-Tag con noindex.');
