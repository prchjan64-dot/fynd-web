
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
    wallet_json(422, false, 'Invalid payment amount.');
}

wallet_json(
    200,
    true,
    'Payment request validated. No payment was processed yet.',
    ['amount' => $amount]
);
