
<?php
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Please log in first.'
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$pythonUrl = 'http://127.0.0.1:5001/';

$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 3
    ]
]);

$response = @file_get_contents($pythonUrl, false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Could not connect to the Python API.'
    ]);
    exit;
}

$pythonData = json_decode($response, true);

if (
    !is_array($pythonData) ||
    empty($pythonData['success'])
) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Python API returned an invalid response.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'loggedIn' => true,
    'pythonConnected' => true,
    'message' => 'PHP session verified and Python API connected.'
]);
?>
