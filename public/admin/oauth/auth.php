<?php
// Gestor de contenidos (Decap CMS) · inicio de sesión con GitHub, paso 1 de 2:
// envía a GitHub para que la persona autorice el acceso al repositorio.
declare(strict_types=1);

$cfg = @include __DIR__ . '/config.php';
if (!is_array($cfg) || empty($cfg['client_id'])) {
  http_response_code(500);
  exit('Falta admin/oauth/config.php con las credenciales de la OAuth App de GitHub (ver README, apartado 4).');
}

$estado = bin2hex(random_bytes(16));
setcookie('decap_oauth_estado', $estado, [
  'expires' => time() + 600,
  'path' => '/admin/oauth/',
  'secure' => true,
  'httponly' => true,
  'samesite' => 'Lax',
]);

header('Location: https://github.com/login/oauth/authorize?' . http_build_query([
  'client_id' => $cfg['client_id'],
  'redirect_uri' => 'https://' . $_SERVER['HTTP_HOST'] . '/admin/oauth/callback.php',
  'scope' => 'repo,user',
  'state' => $estado,
]));
