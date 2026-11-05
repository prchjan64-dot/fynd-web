
<?php
require_once __DIR__ . '/wallet-lib.php';

header('Content-Type: application/json');

function webhook_reply($code, $message)
{
    http_response_code($code);
    echo json_encode([
        'success' => $code >= 200 && $code < 300,
        'message' => $message
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    webhook_reply(405, 'POST only.');
}

$secretFile = __DIR__ . '/private/fynd-xendit-secrets.php';

error_log('[FYND webhook] Secret path: ' . $secretFile);
error_log('[FYND webhook] File exists: ' .
    (is_file($secretFile) ? 'YES' : 'NO'));

if (!is_file($secretFile)) {
    error_log('[FYND webhook] Secret config is missing.');
    webhook_reply(500, 'Webhook configuration error.');
}

$secrets = require $secretFile;
$expectedToken = $secrets['callback_token'] ?? '';

$headers = function_exists('getallheaders')
    ? getallheaders()
    : [];

$receivedToken = '';

foreach ($headers as $name => $value) {
    if (strtolower($name) === 'x-callback-token') {
        $receivedToken = $value;
        break;
    }
}

error_log('[FYND webhook] Expected token configured: ' .
    (!empty($expectedToken) ? 'YES' : 'NO'));

error_log('[FYND webhook] Callback header received: ' .
    ($receivedToken !== '' ? 'YES' : 'NO'));

$expectedToken = trim($expectedToken);
$receivedToken = trim($receivedToken);

error_log('[FYND webhook] Expected token length: ' . strlen($expectedToken));
error_log('[FYND webhook] Received token length: ' . strlen($receivedToken));
error_log('[FYND webhook] Token match: ' .
    (hash_equals($expectedToken, $receivedToken) ? 'YES' : 'NO'));

if (
    $expectedToken === '' ||
    $receivedToken === '' ||
    !hash_equals($expectedToken, $receivedToken)
) {
    webhook_reply(401, 'Invalid callback token.');
}


$body = json_decode(file_get_contents('php://input'), true);

if (!is_array($body)) {
    webhook_reply(400, 'Invalid JSON.');
}

$externalId = $body['external_id'] ?? '';
$status = strtoupper((string) ($body['status'] ?? ''));

if (!is_string($externalId) || $externalId === '') {
    webhook_reply(400, 'Missing external_id.');
}

// Only credit confirmed paid invoices.
if ($status !== 'PAID') {
    webhook_reply(200, 'No wallet credit required.');
}

try {
    $pdo = wallet_pdo();
    $pdo->beginTransaction();

    // Lock this invoice record so concurrent/repeated callbacks
    // cannot credit the same top-up twice.
    $stmt = $pdo->prepare(
        'SELECT id, user_id, amount, status
         FROM xendit_topups
         WHERE external_id = ?
         FOR UPDATE'
    );
    $stmt->execute([$externalId]);
    $topup = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$topup) {
        $pdo->rollBack();
        webhook_reply(404, 'Top-up reference not found.');
    }

    // An already credited invoice is safe to acknowledge.
    if ($topup['status'] === 'completed') {
        $pdo->commit();
        webhook_reply(200, 'Top-up already credited.');
    }

    $expectedCents = (int) round((float) $topup['amount'] * 100);

    // Invoice callback payloads may contain paid_amount.
    // Fall back to amount only if paid_amount is absent.
    $paidAmount = $body['paid_amount'] ?? $body['amount'] ?? null;

    if (
        !is_numeric($paidAmount) ||
        (int) round((float) $paidAmount * 100) !== $expectedCents
    ) {
        $pdo->rollBack();
        error_log('[FYND webhook] Amount mismatch for ' . $externalId);
        webhook_reply(400, 'Payment amount mismatch.');
    }

    $uid = (int) $topup['user_id'];
    $amount = $expectedCents / 100;

    // Lock the user's wallet balance.
    $stmt = $pdo->prepare(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE'
    );
    $stmt->execute([$uid]);
    $balance = $stmt->fetchColumn();

    if ($balance === false) {
        $pdo->prepare(
            'INSERT INTO wallets (user_id, balance) VALUES (?, 0)'
        )->execute([$uid]);

        $balance = 0;
    }

    $newBalanceCents =
        (int) round((float) $balance * 100) + $expectedCents;

    $newBalance = $newBalanceCents / 100;

    $pdo->prepare(
        'UPDATE wallets SET balance = ? WHERE user_id = ?'
    )->execute([
        number_format($newBalance, 2, '.', ''),
        $uid
    ]);

    $pdo->prepare(
        "INSERT INTO wallet_transactions
            (user_id, type, description, detail, method,
             status, amount, balance_after)
         VALUES (?, 'topup', ?, ?, 'Xendit', 'completed', ?, ?)"
    )->execute([
        $uid,
        'Wallet top-up via Xendit',
        $externalId,
        number_format($amount, 2, '.', ''),
        number_format($newBalance, 2, '.', '')
    ]);

    // Mark the invoice completed in the SAME transaction
    // as the wallet credit and transaction record.
    $pdo->prepare(
        "UPDATE xendit_topups
         SET status = 'completed', credited_at = CURRENT_TIMESTAMP
         WHERE id = ?"
    )->execute([(int) $topup['id']]);

    $pdo->commit();

    webhook_reply(200, 'Wallet top-up credited.');

} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('[FYND Xendit webhook] ' . $e->getMessage());
    webhook_reply(500, 'Webhook processing failed.');
}
