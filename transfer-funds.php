
<?php
require_once __DIR__ . '/wallet-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$userId = wallet_user_id();

if ($userId <= 0) {
    wallet_json(401, false, 'Please log in first.');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    wallet_json(400, false, 'Invalid request.');
}

$amount = round((float) ($input['amount'] ?? 0), 2);

if ($amount < 1 || $amount > 50000) {
    wallet_json(422, false, 'Amount must be between 1 and 50000.');
}

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode(['amount' => $amount]),
        'timeout' => 3,
        'ignore_errors' => true
    ]
]);

$response = @file_get_contents(
'http://127.0.0.1:5002/validate-transfer',
    false,
    $context
);

if ($response === false) {
    wallet_json(502, false, 'Could not connect to Python API.');
}

$result = json_decode($response, true);

if (!is_array($result) || empty($result['success'])) {
    wallet_json(422, false, 'Python rejected the transfer amount.');
}

wallet_json(
    200,
    true,
    'Transfer validated by Python. No money was transferred.',
    ['amount' => $amount]
);
