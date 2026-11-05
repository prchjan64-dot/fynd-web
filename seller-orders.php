<?php
/**
 * seller-orders.php
 * GET -> the orders that contain items sold by the logged-in seller
 *        (newest first). Each order only lists THIS seller's items,
 *        and "total" is the sum of those items only.
 *
 * Put this file in the FYND folder, next to orders.php.
 * It is used by the Orders tab of Seller Studio (seller-studio.js).
 *
 * How the seller is matched to a product (discovered automatically):
 *   1. products.seller_id / user_id / owner_id / seller_user_id = your user id
 *   2. otherwise products.seller_name = your name in the users table
 */
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true); // set to false once everything works on the live site

require_once __DIR__ . '/PHP/Fynd_helpers.php';

/** Column names of a table. */
function seller_orders_columns(mysqli $conn, $table)
{
    $names = [];
    $res = $conn->query('SHOW COLUMNS FROM `' . $table . '`');

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    while ($r = $res->fetch_assoc()) {
        $names[] = $r['Field'];
    }

    $res->free();

    return $names;
}

/** "Dana Reyes" -> "Dana R." */
function seller_orders_short_name($name)
{
    $name = trim((string)$name);

    if ($name === '') {
        return 'Buyer';
    }

    $parts = preg_split('/\s+/', $name);

    if (count($parts) < 2) {
        return $parts[0];
    }

    $last = end($parts);

    return $parts[0] . ' ' . strtoupper(substr($last, 0, 1)) . '.';
}

function seller_orders_list(mysqli $conn, $uid)
{
    /* ----- real column names ----- */
    $oNames = seller_orders_columns($conn, 'orders');
    $oPk    = fynd_pick_column($oNames, ['order_id', 'id']);
    $oDate  = fynd_pick_column($oNames, ['created_at', 'order_date', 'placed_at', 'date_created', 'created']);

    if ($oPk === null) {
        throw new RuntimeException('The orders table has no order_id column.');
    }

    $pNames  = seller_orders_columns($conn, 'products');
    $pPk     = fynd_pick_column($pNames, ['product_id', 'id']);
    $pOwner  = fynd_pick_column($pNames, ['seller_id', 'user_id', 'owner_id', 'seller_user_id']);
    $pSeller = fynd_pick_column($pNames, ['seller_name']);
    $pImage  = fynd_pick_column($pNames, ['image']);

    if ($pPk === null) {
        throw new RuntimeException('The products table has no product_id column.');
    }

    $uNames = seller_orders_columns($conn, 'users');
    $uPk    = fynd_pick_column($uNames, ['user_id', 'id']);
    $uName  = fynd_pick_column($uNames, ['full_name', 'name', 'username', 'first_name']);

    /* ----- which products belong to this seller ----- */
    $params = [];
    $types  = '';

    if ($pOwner !== null) {
        $where   = 'p.' . fynd_q($pOwner) . ' = ?';
        $types   = 'i';
        $params[] = (int)$uid;
    } elseif ($pSeller !== null && $uPk !== null) {
        $nameCols = [];

        foreach (['seller_name', 'full_name', 'name', 'username', 'first_name', 'last_name'] as $c) {
            if (in_array($c, $uNames, true)) {
                $nameCols[] = $c;
            }
        }

        if (empty($nameCols)) {
            throw new RuntimeException('Cannot tell which products belong to the seller.');
        }

        $sel  = [];
        foreach ($nameCols as $c) {
            $sel[] = fynd_q($c);
        }

        $stmt = fynd_prepare(
            $conn,
            'SELECT ' . implode(', ', $sel) . ' FROM `users` WHERE ' . fynd_q($uPk) . ' = ? LIMIT 1'
        );
        $stmt->bind_param('i', $uid);
        fynd_execute($stmt);
        $res = $stmt->get_result();
        $u   = $res ? $res->fetch_assoc() : null;
        $stmt->close();

        $names = [];

        if ($u) {
            foreach ($nameCols as $c) {
                $v = trim((string)$u[$c]);
                if ($v !== '' && !in_array($v, $names, true)) {
                    $names[] = $v;
                }
            }

            if (isset($u['first_name'], $u['last_name'])) {
                $full = trim($u['first_name'] . ' ' . $u['last_name']);
                if ($full !== '' && !in_array($full, $names, true)) {
                    $names[] = $full;
                }
            }
        }

        if (empty($names)) {
            return [];
        }

        $marks = implode(',', array_fill(0, count($names), '?'));
        $where = 'p.' . fynd_q($pSeller) . ' IN (' . $marks . ')';
        $types = str_repeat('s', count($names));
        $params = $names;
    } else {
        throw new RuntimeException(
            'The products table needs a seller_id (or seller_name) column to match sellers.'
        );
    }

    /* ----- the sold items with their order ----- */
    $dateSql  = $oDate !== null ? 'o.' . fynd_q($oDate) : 'NULL';
    $imageSql = $pImage !== null ? 'p.' . fynd_q($pImage) : "''";
    $buyerSql = ($uPk !== null && $uName !== null) ? 'bu.' . fynd_q($uName) : "''";
    $joinSql  = ($uPk !== null && $uName !== null)
        ? 'LEFT JOIN `users` bu ON bu.' . fynd_q($uPk) . ' = o.user_id '
        : '';

    $sql = 'SELECT o.' . fynd_q($oPk) . ' AS order_id, o.status, '
         . $dateSql . ' AS created_at, '
         . $buyerSql . ' AS buyer_name, '
         . 'oi.product_id, oi.quantity, oi.unit_price, '
         . 'p.title, ' . $imageSql . ' AS image '
         . 'FROM `order_items` oi '
         . 'INNER JOIN `orders` o ON o.' . fynd_q($oPk) . ' = oi.order_id '
         . 'INNER JOIN `products` p ON p.' . fynd_q($pPk) . ' = oi.product_id '
         . $joinSql
         . 'WHERE ' . $where . ' '
         . 'ORDER BY o.' . fynd_q($oPk) . ' DESC, oi.product_id ASC '
         . 'LIMIT 200';

    $stmt = fynd_prepare($conn, $sql);

    $refs = [$types];
    foreach ($params as $i => $unused) {
        $refs[] = &$params[$i];
    }
    call_user_func_array([$stmt, 'bind_param'], $refs);

    fynd_execute($stmt);

    $res    = $stmt->get_result();
    $orders = [];

    while ($res && ($row = $res->fetch_assoc())) {
        $id = (int)$row['order_id'];

        if (!isset($orders[$id])) {
            $orders[$id] = [
                'id'         => $id,
                'status'     => (string)$row['status'],
                'created_at' => $row['created_at'] !== null ? (string)$row['created_at'] : '',
                'buyer'      => seller_orders_short_name($row['buyer_name']),
                'total'      => 0.0,
                'items'      => [],
            ];
        }

        $qty   = (int)$row['quantity'];
        $price = (float)$row['unit_price'];

        $orders[$id]['total'] += $qty * $price;
        $orders[$id]['items'][] = [
            'id'    => (string)$row['product_id'],
            'name'  => $row['title'] !== null ? (string)$row['title'] : 'Item',
            'image' => $row['image'] !== null ? (string)$row['image'] : '',
            'qty'   => $qty,
            'price' => $price,
        ];
    }

    $stmt->close();

    foreach ($orders as $k => $o) {
        $orders[$k]['total'] = round($o['total'], 2);
    }

    return array_values($orders);
}

try {
    require_once __DIR__ . '/db.php';

    $user = fynd_require_user($conn);
    $uid  = (int)$user['id'];

    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

    if ($method !== 'GET') {
        throw new FyndUserError('Method not allowed.', 405);
    }

    $orders = seller_orders_list($conn, $uid);

    fynd_json([
        'ok'     => true,
        'orders' => $orders,
        'count'  => count($orders),
    ]);
} catch (Throwable $e) {
    fynd_handle_exception($e);
}