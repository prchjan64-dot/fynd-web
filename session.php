<?php
/* session.php
 * Tells the front-end who is logged in. Static .html pages cannot read PHP
 * sessions directly, so they call this file with fetch() instead.
 */
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (!empty($_SESSION['user_id'])) {
    echo json_encode([
        'loggedIn' => true,
        'user'     => [
            'id'    => (int) $_SESSION['user_id'],
            'name'  => $_SESSION['user_name']  ?? '',
            'email' => $_SESSION['user_email'] ?? ''
        ]
    ]);
} else {
    echo json_encode(['loggedIn' => false]);
}
?>