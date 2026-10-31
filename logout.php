<?php
/* logout.php
 * Fully ends the session (data + cookie) and sends the user to the sign-in page.
 * NOTE: the redirect is relative to THIS file. It assumes logout.php and
 * signin.html sit in the same folder (as the rest of your pages do).
 */
session_start();

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $p['path'],
        $p['domain'],
        $p['secure'],
        $p['httponly']
    );
}

session_destroy();

header('Location: signin.html');
exit;