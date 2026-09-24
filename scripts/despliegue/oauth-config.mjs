// Escribe dist/admin/oauth/config.php con las credenciales de la OAuth App de GitHub
// (variables de entorno OAUTH_CLIENT_ID y OAUTH_CLIENT_SECRET; en GitHub Actions, secretos del repositorio).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { OAUTH_CLIENT_ID: id = '', OAUTH_CLIENT_SECRET: secreto = '' } = process.env;
if (!id || !secreto) {
  console.error('Faltan OAUTH_CLIENT_ID u OAUTH_CLIENT_SECRET: el gestor de contenidos no podrá iniciar sesión.');
  process.exit(1);
}
const php = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'admin', 'oauth', 'config.php');
fs.writeFileSync(destino, `<?php\nreturn [\n  'client_id' => ${php(id)},\n  'client_secret' => ${php(secreto)},\n];\n`, 'utf8');
console.log('Credenciales del gestor escritas en dist/admin/oauth/config.php');
