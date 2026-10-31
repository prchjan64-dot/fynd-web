<?php
/* ==========================================================
   wallet-transfer.php  (NEW)
   "Transfer funds" on the Seller Studio Payouts tab.
   Receives JSON: { bank, accountName, accountNumber, amount }
   Deducts ONLY that amount from wallets.balance and logs a
   pending payout. Returns { ok, success, balance }.
========================================================== */

require_once __DIR__ . '/wallet-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$uid = wallet_user_id();

if ($uid <= 0) {
    wallet_json(401, false, 'Not logged in.');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    wallet_json(400, false, 'Invalid request.');
}

$banks = [
    'BPI' => 'bank', 'BDO' => 'bank', 'UnionBank' => 'bank',
    'Metrobank' => 'bank', 'GCash' => 'wallet', 'Maya' => 'wallet',
];

$bank = (string) ($input['bank'] ?? '');

if (!isset($banks[$bank])) {
    wallet_json(422, false, 'Please choose a bank or e-wallet.');
}

$name = trim((string) ($input['accountName'] ?? ''));

if (!preg_match('/^.{2,60}$/us', $name)) {
    wallet_json(422, false, 'Please enter the account name.');
}

$account = preg_replace('/\D/', '', (string) ($input['accountNumber'] ?? ''));

if ($banks[$bank] === 'wallet' && !preg_match('/^09\d{9}$/', $account)) {
    wallet_json(422, false, 'Enter an 11-digit mobile number starting with 09.');
}

if ($banks[$bank] === 'bank' && !preg_match('/^\d{10,16}$/', $account)) {
    wallet_json(422, false, 'Enter a valid account number (10 to 16 digits).');
}

$amount = round((float) ($input['amount'] ?? 0), 2);

if ($amount <= 0) {
    wallet_json(422, false, 'Enter an amount greater than 0.');
}

try {
    $pdo = wallet_pdo();

    $balance = wallet_apply(
        $pdo,
        $uid,
        -$amount,
        'payout',
        'Transfer to ' . $bank,
        'Account ••••' . substr($account, -4),
        $bank,
        'pending'
    );

    wallet_json(200, true, 'Transfer requested.', [
        'balance' => $balance,
        'amount'  => $amount,
    ]);
} catch (Throwable $e) {
    if ($e->getMessage() === 'INSUFFICIENT') {
        wallet_json(
            422,
            false,
            'The amount cannot be more than your available balance.',
            ['balance' => wallet_balance(wallet_pdo(), $uid)]
        );
    }

    error_log('[FYND transfer] ' . $e->getMessage());
    wallet_json(500, false, 'Could not complete the transfer.');
}