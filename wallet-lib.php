<?php
/* ==========================================================
   wallet-lib.php
   ONE place that reads and changes wallets.balance.
   The Credit tab, the Profile "FYND credit" card and the Seller
   Studio Payouts tab all go through these functions, so the
   balance can never differ between pages.
========================================================== */

const WALLET_DB_HOST = '127.0.0.1';
const WALLET_DB_NAME = 'fynd_marketplace';
const WALLET_DB_USER = 'root';
const WALLET_DB_PASS = '';

/** Money coming IN (everything else is money going OUT). */
const WALLET_CREDIT_TYPES = ['topup', 'sale'];

function wallet_pdo()
{
    static $pdo = null;

    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . WALLET_DB_HOST . ';dbname=' . WALLET_DB_NAME . ';charset=utf8mb4',
            WALLET_DB_USER,
            WALLET_DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
    }

    return $pdo;
}

/** JSON reply. Sends both "ok" (Seller Studio) and "success" (Credit tab). */
function wallet_json($code, $success, $message, array $extra = [])
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $body = ['ok' => $success, 'success' => $success, 'message' => $message];

    if (!$success) {
        $body['error'] = $message;
    }

    echo json_encode(array_merge($body, $extra));
    exit;
}

/** Logged-in user id, or 0. */
function wallet_user_id()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    foreach (['user_id', 'id', 'userId'] as $key) {
        if (!empty($_SESSION[$key])) {
            return (int) $_SESSION[$key];
        }
    }

    return 0;
}

function wallet_balance(PDO $pdo, $uid)
{
    $st = $pdo->prepare('SELECT balance FROM wallets WHERE user_id = ?');
    $st->execute([$uid]);
    $value = $st->fetchColumn();

    return $value === false ? 0.0 : (float) $value;
}

/**
 * Add ($delta > 0) or deduct ($delta < 0) money and log it.
 * Runs in one DB transaction with the row locked, so two requests
 * at the same time can never overspend. Returns the new balance.
 * Throws RuntimeException('INSUFFICIENT') if it would go below 0.
 *
 * FIXED: it can now be called while the caller already has a
 * transaction open (checkout.php does this). In that case it does
 * NOT begin/commit/roll back by itself: the caller's transaction
 * owns the commit or rollback, so the buyer payment, every seller
 * credit and the order all succeed or fail together.
 * When no transaction is open it behaves exactly as before.
 */
function wallet_apply(PDO $pdo, $uid, $delta, $type, $description,
                      $detail = '', $method = '', $status = 'completed')
{
    $cents = (int) round($delta * 100);

    if ($cents === 0) {
        throw new InvalidArgumentException('Amount cannot be zero.');
    }

    // true only when this function started the transaction itself
    $ownsTransaction = !$pdo->inTransaction();

    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $st = $pdo->prepare('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE');
        $st->execute([$uid]);
        $current = $st->fetchColumn();

        if ($current === false) {
            $pdo->prepare('INSERT INTO wallets (user_id, balance) VALUES (?, 0)')->execute([$uid]);
            $current = 0;
        }

        $newCents = (int) round(((float) $current) * 100) + $cents;

        if ($newCents < 0) {
            throw new RuntimeException('INSUFFICIENT');
        }

        $newBalance = $newCents / 100;

        $pdo->prepare('UPDATE wallets SET balance = ? WHERE user_id = ?')
            ->execute([number_format($newBalance, 2, '.', ''), $uid]);

        $pdo->prepare(
            'INSERT INTO wallet_transactions
                (user_id, type, description, detail, method, status, amount, balance_after)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $uid, $type, $description, $detail, $method, $status,
            number_format(abs($cents) / 100, 2, '.', ''),
            number_format($newBalance, 2, '.', ''),
        ]);

        if ($ownsTransaction) {
            $pdo->commit();
        }

        return $newBalance;
    } catch (Throwable $e) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }
}

/** Latest transactions, newest first. */
function wallet_history(PDO $pdo, $uid, $limit = 20)
{
    $limit = max(1, min(100, (int) $limit));

    $st = $pdo->prepare(
        'SELECT txn_id, type, description, detail, method, status, amount, created_at
           FROM wallet_transactions
          WHERE user_id = ?
          ORDER BY txn_id DESC
          LIMIT ' . $limit
    );
    $st->execute([$uid]);

    $rows = [];

    foreach ($st->fetchAll() as $r) {
        $rows[] = [
            'id'          => (int) $r['txn_id'],
            'type'        => $r['type'],
            'direction'   => in_array($r['type'], WALLET_CREDIT_TYPES, true) ? 'in' : 'out',
            'description' => $r['description'],
            'detail'      => $r['detail'],
            'method'      => $r['method'],
            'status'      => $r['status'],
            'amount'      => (float) $r['amount'],
            'created_at'  => $r['created_at'],
        ];
    }

    return $rows;
}