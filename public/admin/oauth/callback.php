<?php
// Gestor de contenidos (Decap CMS) · inicio de sesión con GitHub, paso 2 de 2:
// canjea el código de GitHub por un token y se lo pasa al gestor (ventana que abrió esta).
declare(strict_types=1);

$cfg = @include __DIR__ . '/config.php';
$estado = 'error';
$contenido = ['message' => 'No se pudo iniciar sesión.'];

if (!is_array($cfg) || empty($cfg['client_secret'])) {
  $contenido['message'] = 'Falta admin/oauth/config.php con las credenciales de GitHub.';
} elseif (empty($_GET['code']) || empty($_GET['state']) || !hash_equals($_COOKIE['decap_oauth_estado'] ?? '', (string) $_GET['state'])) {
  $contenido['message'] = 'La sesión de inicio ha caducado o no es válida. Vuelva a intentarlo.';
} else {
  $peticion = http_build_query([
    'client_id' => $cfg['client_id'],
    'client_secret' => $cfg['client_secret'],
    'code' => (string) $_GET['code'],
    'redirect_uri' => 'https://' . $_SERVER['HTTP_HOST'] . '/admin/oauth/callback.php',
  ]);
  $respuesta = false;
  if (function_exists('curl_init')) {
    $ch = curl_init('https://github.com/login/oauth/access_token');
    curl_setopt_array($ch, [
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $peticion,
      CURLOPT_HTTPHEADER => ['Accept: application/json'],
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 20,
    ]);
    $respuesta = curl_exec($ch);
    curl_close($ch);
  } else {
    $respuesta = @file_get_contents('https://github.com/login/oauth/access_token', false, stream_context_create(['http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/x-www-form-urlencoded\r\nAccept: application/json\r\n",
      'content' => $peticion,
      'timeout' => 20,
    ]]));
  }
  $datos = $respuesta ? json_decode($respuesta, true) : null;
  if (!empty($datos['access_token'])) {
    $estado = 'success';
    $contenido = ['token' => $datos['access_token'], 'provider' => 'github'];
  } elseif (!empty($datos['error_description'])) {
    $contenido['message'] = $datos['error_description'];
  }
}
setcookie('decap_oauth_estado', '', ['expires' => 1, 'path' => '/admin/oauth/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);

$mensaje = 'authorization:github:' . $estado . ':' . json_encode($contenido, JSON_UNESCAPED_UNICODE);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?>
<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="robots" content="noindex" /><title>Iniciando sesión…</title></head>
<body>
<p><?= $estado === 'success' ? 'Sesión iniciada. Esta ventana se cerrará sola.' : htmlspecialchars($contenido['message']) ?></p>
<script>
(function () {
  var mensaje = <?= json_encode($mensaje, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>;
  if (!window.opener) return;
  function recibir(e) {
    if (e.origin !== window.location.origin) return;
    window.removeEventListener('message', recibir, false);
    window.opener.postMessage(mensaje, e.origin);
  }
  window.addEventListener('message', recibir, false);
  window.opener.postMessage('authorizing:github', window.location.origin);
})();
</script>
</body>
</html>
