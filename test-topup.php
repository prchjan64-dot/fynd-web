
<?php
require_once __DIR__ . '/wallet-lib.php';

// Local development only.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if (!in_array($host, ['localhost', 'localhost:80', 'localhost:8080', '127.0.0.1'], true)) {
    wallet_json(403, false, 'Test top-up is only available on localhost.');
}

$uid = wallet_user_id();
if ($uid <= 0) {
    wallet_json(401, false, 'Please log in first.');
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    wallet_json(400, false, 'Invalid request.');
}

$amount = round((float)($input['amount'] ?? 0), 2);
if ($amount < 1 || $amount > 5000) {
    wallet_json(422, false, 'Test amount must be between ₱1 and ₱5,000.');
}

try {
    $pdo = wallet_pdo();

    $balance = wallet_apply(
        $pdo,
        $uid,
        $amount,
        'topup',
        'Test funds added',
        'Local development test credit',
        'TEST',
        'completed'
    );

    wallet_json(200, true, 'Test balance added successfully.', [
        'balance' => $balance,
        'amount' => $amount
    ]);
} catch (Throwable $e) {
    error_log('[FYND test top-up] ' . $e->getMessage());
    wallet_json(500, false, 'Could not add test balance.');
}
