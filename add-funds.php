<?php
/* ==========================================================
   add-funds.php
   Adds money to the wallet (and logs it).
   Receives JSON: { method, account, amount }
   Returns JSON:  { success, balance, message }
========================================================== */

require_once __DIR__ . '/wallet-lib.php';

const ADD_FUNDS_MAX = 50000;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$userId = wallet_user_id();

if ($userId <= 0) {
    wallet_json(401, false, 'Not logged in.');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    wallet_json(400, false, 'Invalid request.');
}

$method  = strtolower(trim((string) ($input['method'] ?? '')));
$account = preg_replace('/\D/', '', (string) ($input['account'] ?? ''));
$amount  = round((float) ($input['amount'] ?? 0), 2);

$labels = [
    'gcash' => 'GCash', 'maya' => 'Maya', 'bdo' => 'BDO',
    'bpi' => 'BPI', 'metrobank' => 'Metrobank', 'unionbank' => 'UnionBank',
];

if (!isset($labels[$method])) {
    wallet_json(422, false, 'Unknown payment method.');
}

$isMobile = in_array($method, ['gcash', 'maya'], true);

if ($isMobile && !preg_match('/^09\d{9}$/', $account)) {
    wallet_json(422, false, 'Invalid mobile number.');
}

if (!$isMobile && !preg_match('/^\d{10,16}$/', $account)) {
    wallet_json(422, false, 'Invalid account number.');
}

if ($amount < 1 || $amount > ADD_FUNDS_MAX) {
    wallet_json(422, false, 'Amount must be between 1 and ' . ADD_FUNDS_MAX . '.');
}

try {
    $balance = wallet_apply(
        wallet_pdo(),
        $userId,
        $amount,
        'topup',
        'Added funds via ' . $labels[$method],
        'Account ••••' . substr($account, -4),
        $labels[$method],
        'completed'
    );

    wallet_json(200, true, 'Funds added.', ['balance' => $balance]);
} catch (Throwable $e) {
    error_log('[FYND add-funds] ' . $e->getMessage());
    wallet_json(500, false, 'Database error.');
}