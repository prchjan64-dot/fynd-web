<?php
/**
 * orders.php
 * GET -> the logged-in user's orders (newest first), each with its items.
 *
 * Put this file in the FYND folder, next to cart.php.
 * It is used by JS/profile-orders.js to fill the Orders tab.
 *
 * Column names are discovered (the same way cart.php does it), so a
 * missing optional column such as orders.created_at will not break it.
 */
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true); // set to false once everything works on the live site

require_once __DIR__ . '/PHP/Fynd_helpers.php';

/** Column names of a table. */
function orders_columns(mysqli $conn, $table)
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

function orders_list(mysqli $conn, $uid)
{
    /* ----- find the real column names ----- */
    $oNames = orders_columns($conn, 'orders');
    $oPk    = fynd_pick_column($oNames, ['order_id', 'id']);
    $oDate  = fynd_pick_column($oNames, ['created_at', 'order_date', 'placed_at', 'date_created', 'created']);

    if ($oPk === null) {
        throw new RuntimeException('The orders table has no order_id column.');
    }

    $pNames   = orders_columns($conn, 'products');
    $pPk      = fynd_pick_column($pNames, ['product_id', 'id']);
    $pSeller  = fynd_pick_column($pNames, ['seller_name']);
    $pImage   = fynd_pick_column($pNames, ['image']);

    if ($pPk === null) {
        throw new RuntimeException('The products table has no product_id column.');
    }

    /* ----- the orders ----- */
    $dateSql = $oDate !== null ? 'o.' . fynd_q($oDate) : 'NULL';

    $sql = 'SELECT o.' . fynd_q($oPk) . ' AS order_id, o.total_amount, o.status, '
         . $dateSql . ' AS created_at '
         . 'FROM `orders` o '
         . 'WHERE o.user_id = ? '
         . 'ORDER BY o.' . fynd_q($oPk) . ' DESC '
         . 'LIMIT 50';

    $stmt = fynd_prepare($conn, $sql);
    $stmt->bind_param('i', $uid);
    fynd_execute($stmt);

    $res    = $stmt->get_result();
    $orders = [];
    $ids    = [];

    while ($res && ($row = $res->fetch_assoc())) {
        $id = (int)$row['order_id'];
        $ids[] = $id;

        $orders[$id] = [
            'id'         => $id,
            'total'      => (float)$row['total_amount'],
            'status'     => (string)$row['status'],
            'created_at' => $row['created_at'] !== null ? (string)$row['created_at'] : '',
            'items'      => [],
        ];
    }

    $stmt->close();

    if (empty($ids)) {
        return [];
    }

    /* ----- the items of those orders (ids come from the database, so they are safe ints) ----- */
    $idList      = implode(',', array_map('intval', $ids));
    $sellerSql   = $pSeller !== null ? 'p.' . fynd_q($pSeller) : "''";
    $imageSql    = $pImage !== null ? 'p.' . fynd_q($pImage) : "''";

    $sql = 'SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, '
         . 'p.title, ' . $imageSql . ' AS image, ' . $sellerSql . ' AS seller_name '
         . 'FROM `order_items` oi '
         . 'LEFT JOIN `products` p ON p.' . fynd_q($pPk) . ' = oi.product_id '
         . 'WHERE oi.order_id IN (' . $idList . ') '
         . 'ORDER BY oi.order_id DESC';

    $res = $conn->query($sql);

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    while ($row = $res->fetch_assoc()) {
        $orderId = (int)$row['order_id'];

        if (!isset($orders[$orderId])) {
            continue;
        }

        $orders[$orderId]['items'][] = [
            'id'    => (string)$row['product_id'],
            'name'  => $row['title'] !== null ? (string)$row['title'] : 'Item no longer available',
            'shop'  => $row['seller_name'] !== null ? (string)$row['seller_name'] : '',
            'image' => $row['image'] !== null ? (string)$row['image'] : '',
            'qty'   => (int)$row['quantity'],
            'price' => (float)$row['unit_price'],
        ];
    }

    $res->free();

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

    $orders = orders_list($conn, $uid);

    fynd_json([
        'ok'     => true,
        'orders' => $orders,
        'count'  => count($orders),
    ]);
} catch (Throwable $e) {
    fynd_handle_exception($e);
}