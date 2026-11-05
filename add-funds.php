
<?php
/* ==========================================================
   add-funds.php
   Creates a Xendit checkout invoice through the Python bridge.
   Does NOT credit the wallet balance.
========================================================== */

require_once __DIR__ . '/wallet-lib.php';

const ADD_FUNDS_MAX = 50000;
const XENDIT_BRIDGE_URL = 'http://127.0.0.1:5003/create-xendit-invoice';

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

$method = strtolower(trim((string) ($input['method'] ?? '')));
$amount = filter_var($input['amount'] ?? null, FILTER_VALIDATE_FLOAT);

if ($amount === false || $amount === null || !is_finite((float) $amount)) {
    wallet_json(422, false, 'Invalid amount.');
}

$amount = round((float) $amount, 2);

if ($amount < 1 || $amount > ADD_FUNDS_MAX) {
    wallet_json(
        422,
        false,
        'Amount must be between 1 and ' . ADD_FUNDS_MAX . '.'
    );
}

// Only accept the payment methods supported by the frontend.
// Xendit checkout availability still depends on your Xendit account.
$allowedMethods = ['gcash'];

if (!in_array($method, $allowedMethods, true)) {
    wallet_json(422, false, 'Unsupported payment method.');
}

$payload = json_encode([
    'amount' => $amount,
    'description' => 'Top-up wallet via FYND Marketplace'
]);

if ($payload === false) {
    wallet_json(500, false, 'Could not prepare checkout request.');
}

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => $payload,
        'timeout' => 25,
        'ignore_errors' => true
    ]
]);

$response = @file_get_contents(
    XENDIT_BRIDGE_URL,
    false,
    $context
);

if ($response === false) {
    wallet_json(
        502,
        false,
        'Could not connect to the Xendit Python bridge. Check that it is running on port 5003.'
    );
}

$result = json_decode($response, true);

if (!is_array($result)) {
    wallet_json(502, false, 'Invalid response from the Xendit bridge.');
}

if (empty($result['success'])) {
    $message = $result['message'] ?? 'Unknown error';

    wallet_json(
        502,
        false,
        'Xendit invoice creation failed: ' . $message
    );
}

$checkoutUrl = $result['checkout_url'] ?? '';
$referenceNumber = $result['reference_number'] ?? '';

if (
    !is_string($checkoutUrl) ||
    !filter_var($checkoutUrl, FILTER_VALIDATE_URL) ||
    strtolower((string) parse_url($checkoutUrl, PHP_URL_SCHEME)) !== 'https' ||
    empty(parse_url($checkoutUrl, PHP_URL_HOST))
) {
    wallet_json(502, false, 'Xendit returned an invalid checkout URL.');
}
if (!is_string($referenceNumber) || $referenceNumber === '') {
    wallet_json(502, false, 'Missing checkout reference number.');
}

$invoiceId = $result['invoice_id'] ?? '';

if (!is_string($invoiceId) || trim($invoiceId) === '') {
    wallet_json(502, false, 'Missing Xendit invoice ID.');
}

try {
    $pdo = wallet_pdo();

    $stmt = $pdo->prepare(
        "INSERT INTO xendit_topups
            (user_id, external_id, invoice_id, amount, status)
         VALUES (?, ?, ?, ?, 'pending')"
    );

    $stmt->execute([
        $userId,
        $referenceNumber,
        $invoiceId,
        number_format($amount, 2, '.', '')
    ]);

    $check = $pdo->prepare(
        "SELECT id FROM xendit_topups WHERE external_id = ?"
    );
    $check->execute([$referenceNumber]);

    error_log(
        '[FYND DEBUG] file=' . __FILE__ .
        ' | database=' . $pdo->query('SELECT DATABASE()')->fetchColumn() .
        ' | host=' . $pdo->query('SELECT @@hostname')->fetchColumn() .
        ' | port=' . $pdo->query('SELECT @@port')->fetchColumn() .
        ' | inserted_id=' . $pdo->lastInsertId() .
        ' | row_found=' . ($check->fetch() ? 'YES' : 'NO')
    );

} catch (Throwable $e) {
    error_log('[FYND Xendit top-up] ' . $e->getMessage());

    wallet_json(
        500,
        false,
        'Could not save the pending payment. Please contact the administrator before retrying.'
    );
}

wallet_json(
    200,
    true,
    'Xendit checkout link generated.',
    [
        'checkout_url' => $checkoutUrl,
        'reference_number' => $referenceNumber
    ]
);