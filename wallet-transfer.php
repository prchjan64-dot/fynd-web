<?php
/* ==========================================================
   wallet-transfer.php
   Cash out from the FYND wallet to a bank / e-wallet.
   POST { bank, accountName, accountNumber, amount }
   -> { balance }  (new balance after the deduction)

   The amount is first checked by the Python API, then deducted
   from the wallet and logged as a 'payout' in wallet_transactions
   (one locked database transaction, through wallet_apply()).

   CHANGED: when the balance is too low the reply now carries
   code = INSUFFICIENT_FUNDS and the current balance, so the page
   can show an "Insufficient funds" pop-up with the real numbers.
   CHANGED: the reason Python gives for rejecting an amount is
   passed on instead of a generic message.
========================================================== */
require_once __DIR__ . '/wallet-lib.php';

const TRANSFER_BANKS    = ['BPI', 'BDO', 'UnionBank', 'Metrobank', 'GCash', 'Maya'];
const TRANSFER_EWALLETS = ['GCash', 'Maya'];

/* ----------------------------------------------------------
   TRANSFER_MODE
   'simulate' = TEST MODE. The payout is recorded as Completed
                right away, but NO real money is sent to the
                bank / e-wallet (there is no payout provider yet).
   'pending'  = The payout is saved as Pending and stays that way
                until a real payout (for example a Xendit
                disbursement) marks it Completed.
   Switch this to 'pending' before real sellers use the site.
---------------------------------------------------------- */
const TRANSFER_MODE = 'simulate';

/* works even if the mbstring extension is switched off */
function transfer_len($text)
{
    return function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
}

function transfer_cut($text, $length)
{
    return function_exists('mb_substr')
        ? mb_substr($text, 0, $length)
        : substr($text, 0, $length);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$userId = wallet_user_id();

if ($userId <= 0) {
    wallet_json(401, false, 'Please log in first.');
}

$input = json_decode((string) file_get_contents('php://input'), true);

if (!is_array($input)) {
    wallet_json(400, false, 'Invalid request.');
}

$bank          = trim((string) ($input['bank'] ?? ''));
$accountName   = trim((string) ($input['accountName'] ?? ''));
$accountNumber = preg_replace('/\D/', '', (string) ($input['accountNumber'] ?? ''));
$amount        = round((float) ($input['amount'] ?? 0), 2);

if (!in_array($bank, TRANSFER_BANKS, true)) {
    wallet_json(422, false, 'Please choose a valid bank or e-wallet.');
}

$nameLength = transfer_len($accountName);

if ($nameLength < 2 || $nameLength > 60) {
    wallet_json(422, false, 'Please enter a valid account name.');
}

$isEwallet = in_array($bank, TRANSFER_EWALLETS, true);

$numberOk = $isEwallet
    ? preg_match('/^09\d{9}$/', $accountNumber)
    : preg_match('/^\d{10,16}$/', $accountNumber);

if (!$numberOk) {
    wallet_json(422, false, 'Please enter a valid account number.');
}

if ($amount < 1 || $amount > 50000) {
    wallet_json(422, false, 'Amount must be between 1 and 50000.');
}

/* ---------- Balance pre-check ----------
   Checked before Python so "Insufficient funds" is always reported
   first. wallet_apply() below checks it again with the row locked. */
$currentBalance = null;

try {
    $currentBalance = wallet_balance(wallet_pdo(), $userId);
} catch (Throwable $e) {
    error_log('[FYND transfer] ' . $e->getMessage());
}

if ($currentBalance !== null && (int) round($amount * 100) > (int) round($currentBalance * 100)) {
    wallet_json(422, false, 'Insufficient funds for this transfer.', [
        'code'    => 'INSUFFICIENT_FUNDS',
        'balance' => $currentBalance
    ]);
}

/* ---------- Python validation ---------- */
$context = stream_context_create([
    'http' => [
        'method'        => 'POST',
        'header'        => "Content-Type: application/json\r\n",
        'content'       => json_encode(['amount' => $amount]),
        'timeout'       => 3,
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
    $reason = (is_array($result) && !empty($result['message']) && is_string($result['message']))
        ? $result['message']
        : 'Python rejected the transfer amount.';

    wallet_json(422, false, $reason);
}

/* ---------- Deduct the wallet and record the payout ---------- */
$simulated = TRANSFER_MODE === 'simulate';
$status    = $simulated ? 'completed' : 'pending';

try {
    $pdo = wallet_pdo();

    $newBalance = wallet_apply(
        $pdo,
        $userId,
        -$amount,
        'payout',
        'Transfer to ' . $bank,
        transfer_cut('Acct ending ' . substr($accountNumber, -4) . ' - ' . $accountName, 120),
        $bank,
        $status
    );

    wallet_json(200, true, $simulated ? 'Transfer completed.' : 'Transfer requested.', [
        'balance'   => $newBalance,
        'amount'    => $amount,
        'status'    => $status,
        'simulated' => $simulated
    ]);
} catch (RuntimeException $e) {
    if ($e->getMessage() === 'INSUFFICIENT') {
        $extra = ['code' => 'INSUFFICIENT_FUNDS'];

        /* send the real balance back so the pop-up can show it */
        try {
            $extra['balance'] = wallet_balance($pdo, $userId);
        } catch (Throwable $ignored) {
            // The pop-up still works without the balance.
        }

        wallet_json(422, false, 'Insufficient funds for this transfer.', $extra);
    }

    error_log('[FYND transfer] ' . $e->getMessage());
    wallet_json(500, false, 'Could not complete the transfer.');
} catch (Throwable $e) {
    error_log('[FYND transfer] ' . $e->getMessage());
    wallet_json(500, false, 'Could not complete the transfer.');
}