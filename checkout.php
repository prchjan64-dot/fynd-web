<?php
/* ==========================================================
   checkout.php  (FYND wallet checkout, no Cash on Delivery)

   Two ways to call it (JSON POST):
   1) BUY ITEM (storefront dialog):
        {"product_id": 12, "quantity": 1, "payment_method": "wallet"}
      The product is bought directly, it does not have to be in the cart.
   2) CART CHECKOUT (profile cart tab):
        {"items": [1017, 1023, 1022]}
      Only the ticked cart items are bought.

   What it does, all in ONE database transaction:
   - validates the buyer's wallet balance (items + shipping + service fee)
   - deducts the total from the buyer's wallet
   - credits each seller's wallet with the item price
   - records the order and its order items
   - removes the purchased items from the buyer's cart
   If anything fails, nothing is saved.
========================================================== */
require_once __DIR__ . '/wallet-lib.php';

/* Must match SHIPPING_FEE and SERVICE_FEE in JS/profile-cart.js
   and JS/Fynd2.js. Set both to 0 if you do not want fees charged. */
const CHECKOUT_SHIPPING_FEE = 80;
const CHECKOUT_SERVICE_FEE  = 20;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wallet_json(405, false, 'Use POST.');
}

$userId = wallet_user_id();
if ($userId <= 0) {
    wallet_json(401, false, 'Please log in first.');
}

/* ---------- Read the request ---------- */
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) {
    $body = [];
}

/* Wallet is the only payment method. */
$paymentMethod = strtolower(trim((string)($body['payment_method'] ?? 'wallet')));
if ($paymentMethod !== 'wallet') {
    wallet_json(400, false, 'Only FYND Wallet payments are accepted.');
}

/* Buy item: one product id. */
$buyNowId = 0;
if (isset($body['product_id']) && is_numeric($body['product_id'])) {
    $buyNowId = (int)$body['product_id'];
}

/* Cart checkout: a list of product ids. */
$ids = [];

if ($buyNowId <= 0) {
    if (isset($body['items'])) {
        $ids = $body['items'];
    } elseif (isset($_POST['items'])) {
        $ids = $_POST['items'];
    }

    if (is_string($ids)) {
        $ids = explode(',', $ids);
    }
    if (!is_array($ids)) {
        $ids = [];
    }

    $ids = array_map('intval', $ids);
    $ids = array_values(array_unique(array_filter($ids, function ($v) {
        return $v > 0;
    })));

    if (empty($ids)) {
        wallet_json(400, false, 'No items selected for checkout.');
    }
}

$pdo = wallet_pdo();

try {
    $pdo->beginTransaction();

    /* 1. Find the items being bought, with price and seller */
    if ($buyNowId > 0) {
        $stmt = $pdo->prepare('
            SELECT product_id, 1 AS quantity, price, seller_id, title
            FROM products
            WHERE product_id = ?
        ');
        $stmt->execute([$buyNowId]);
        $emptyMessage = 'This item is no longer available.';
        $clearIds     = [$buyNowId];
    } else {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("
            SELECT c.product_id, c.quantity, p.price, p.seller_id, p.title
            FROM cart_items c
            JOIN products p ON c.product_id = p.product_id
            WHERE c.user_id = ? AND c.product_id IN ($in)
        ");
        $stmt->execute(array_merge([$userId], $ids));
        $emptyMessage = 'The selected items are no longer in your cart.';
        $clearIds     = $ids;
    }

    $items = $stmt->fetchAll();

    if (empty($items)) {
        $pdo->rollBack();
        wallet_json(400, false, $emptyMessage);
    }

    $itemsTotal = 0.0;
    foreach ($items as $item) {
        $itemsTotal += (float)$item['price'] * (int)$item['quantity'];
    }

    $totalAmount = round($itemsTotal + CHECKOUT_SHIPPING_FEE + CHECKOUT_SERVICE_FEE, 2);

    /* 2. Check the buyer's wallet balance (row locked) */
    $buyerBalStmt = $pdo->prepare('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE');
    $buyerBalStmt->execute([$userId]);
    $buyerBalance = (float)$buyerBalStmt->fetchColumn();

    if ($buyerBalance < $totalAmount) {
        $pdo->rollBack();
        wallet_json(422, false, 'Insufficient wallet balance for this purchase.', [
            'balance'  => $buyerBalance,
            'required' => $totalAmount
        ]);
    }

    /* 3. Deduct the total from the buyer's wallet */
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

    /* 4. Create the order */
    $orderStmt = $pdo->prepare('INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, "paid")');
    $orderStmt->execute([$userId, $totalAmount]);
    $orderId = $pdo->lastInsertId();

    /* 5. Save each item and credit its seller */
    $oiStmt = $pdo->prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)');

    foreach ($items as $item) {
        $itemTotal = (float)$item['price'] * (int)$item['quantity'];

        $oiStmt->execute([$orderId, $item['product_id'], $item['quantity'], $item['price']]);

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

    /* 6. Remove the purchased items from the buyer's cart */
    $in2 = implode(',', array_fill(0, count($clearIds), '?'));
    $clearCart = $pdo->prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id IN ($in2)");
    $clearCart->execute(array_merge([$userId], $clearIds));

    $pdo->commit();

    wallet_json(200, true, 'Payment successful! Order completed.', [
        'order_id'     => $orderId,
        'new_balance'  => $newBuyerBalance,
        'items_total'  => $itemsTotal,
        'total_amount' => $totalAmount
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[FYND Checkout Error] ' . $e->getMessage());
    wallet_json(500, false, 'Could not complete payment processing.');
}