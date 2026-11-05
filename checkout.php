<?php
/* ==========================================================
   checkout.php
   Processes cart checkout:
   - Validates buyer wallet balance
   - Deducts total from buyer's wallet
   - Credits respective sellers' wallets
   - Records order and order items
========================================================== */
require_once __DIR__ . '/wallet-lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$userId = wallet_user_id();
if ($userId <= 0) {
    wallet_json(401, false, 'Please log in first.');
}

$pdo = wallet_pdo();

try {
    $pdo->beginTransaction();

    // 1. Fetch user's cart items with product details and seller IDs
    $stmt = $pdo->prepare('
        SELECT c.product_id, c.quantity, p.price, p.seller_id, p.title
        FROM cart_items c
        JOIN products p ON c.product_id = p.product_id
        WHERE c.user_id = ?
    ');
    $stmt->execute([$userId]);
    $items = $stmt->fetchAll();

    if (empty($items)) {
        $pdo->rollBack();
        wallet_json(400, false, 'Your cart is empty.');
    }

    $totalAmount = 0.0;
    foreach ($items as $item) {
        $totalAmount += (float)$item['price'] * (int)$item['quantity'];
    }

    // 2. Check Buyer Wallet Balance with row lock
    $buyerBalStmt = $pdo->prepare('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE');
    $buyerBalStmt->execute([$userId]);
    $buyerBalance = (float)$buyerBalStmt->fetchColumn();

    if ($buyerBalance < $totalAmount) {
        $pdo->rollBack();
        wallet_json(422, false, 'Insufficient wallet balance for this purchase.', [
            'balance' => $buyerBalance,
            'required' => $totalAmount
        ]);
    }

    // 3. Deduct total amount from Buyer Wallet
    $newBuyerBalance = wallet_apply(
        $pdo,
        $userId,
        -$totalAmount,
        'purchase',
        'Checkout payment for products',
        'Cart total deduction',
        'Wallet',
        'completed'
    );

    // 4. Create Order Record
    $orderStmt = $pdo->prepare('INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, "paid")');
    $orderStmt->execute([$userId, $totalAmount]);
    $orderId = $pdo->lastInsertId();

    // 5. Process Each Item & Credit Sellers
    foreach ($items as $item) {
        $itemTotal = (float)$item['price'] * (int)$item['quantity'];

        // Insert into order_items
        $oiStmt = $pdo->prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)');
        $oiStmt->execute([$orderId, $item['product_id'], $item['quantity'], $item['price']]);

        // Credit Seller Wallet if seller_id exists and is not the buyer themselves
        $sellerId = (int)$item['seller_id'];
        if ($sellerId > 0 && $sellerId !== $userId) {
            wallet_apply(
                $pdo,
                $sellerId,
                $itemTotal,
                'sale',
                'Sale of product: ' . $item['title'],
                'Order ID #' . $orderId,
                'Wallet',
                'completed'
            );
        }
    }

    // 6. Clear User Cart
    $clearCart = $pdo->prepare('DELETE FROM cart_items WHERE user_id = ?');
    $clearCart->execute([$userId]);

    $pdo->commit();

    wallet_json(200, true, 'Payment successful! Order completed.', [
        'order_id'    => $orderId,
        'new_balance' => $newBuyerBalance,
        'total_amount' => $totalAmount
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[FYND Checkout Error] ' . $e->getMessage());
    wallet_json(500, false, 'Could not complete payment processing.');
}