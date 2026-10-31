<?php
/* ==========================================================
   get-wallet.php
   GET get-wallet.php            -> { balance }
   GET get-wallet.php?history=1  -> { balance, transactions[] }
========================================================== */

require_once __DIR__ . '/wallet-lib.php';

const WALLET_DEBUG = true;   // set to false once everything works

$uid = wallet_user_id();

if ($uid <= 0) {
    wallet_json(401, false, 'Not logged in.');
}

try {
    $pdo   = wallet_pdo();
    $extra = ['balance' => wallet_balance($pdo, $uid)];

    if (!empty($_GET['history'])) {
        try {
            $extra['transactions'] = wallet_history($pdo, $uid, 20);
        } catch (Throwable $e) {
            error_log('[FYND wallet history] ' . $e->getMessage());
            $extra['transactions'] = [];

            if (WALLET_DEBUG) {
                $extra['history_error'] = $e->getMessage();
            }
        }
    }

    wallet_json(200, true, 'OK', $extra);
} catch (Throwable $e) {
    error_log('[FYND wallet] ' . $e->getMessage());

    wallet_json(
        500,
        false,
        'Could not load wallet.',
        WALLET_DEBUG ? ['detail' => $e->getMessage()] : []
    );
}