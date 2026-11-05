<?php
$path = 'C:/xampp2/private/fynd-xendit-secrets.php';

header('Content-Type: text/plain');

if (!file_exists($path)) {
    exit("ERROR: File not found");
}

if (!is_readable($path)) {
    exit("ERROR: File is not readable");
}

$secrets = require $path;

if (!is_array($secrets)) {
    exit("ERROR: Invalid PHP config");
}

if (empty($secrets['callback_token'])) {
    exit("ERROR: Callback token is missing");
}

echo "OK: Secrets file is readable";