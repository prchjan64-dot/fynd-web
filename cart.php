<?php
/**
 * cart.php
 * GET  -> the logged-in user's cart
 * POST -> JSON body (Content-Type: application/json):
 *           {"action":"add","product_id":12}
 *           {"action":"remove","product_id":12}
 *           {"action":"merge","items":[{"product_id":1},{"product_id":2}]}
 *
 * There is no quantity: every product is in a user's cart at most once.
 */
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true); // set to false once everything works on the live site

require_once __DIR__ . '/PHP/Fynd_helpers.php';

/** Returns a positive int, or 0 when the value is not a valid id. */
function cart_id($value)
{
    if (is_int($value)) {
        $id = $value;
    } elseif (is_string($value) && ctype_digit($value)) {
        $id = (int)$value;
    } else {
        $id = 0;
    }

    return $id > 0 ? $id : 0;
}

/**
 * FIXED: the products column names are discovered (like listings_api.php does)
 * instead of being assumed. A missing `seller_name` column used to make the
 * whole cart query fail.
 *
 * @return array ['pk' => string, 'seller' => string|null]
 */
function cart_product_cols(mysqli $conn)
{
    static $info = null;

    if ($info !== null) {
        return $info;
    }

    $names = [];
    $res = $conn->query('SHOW COLUMNS FROM `products`');

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    while ($r = $res->fetch_assoc()) {
        $names[] = $r['Field'];
    }

    $res->free();

    $pk = fynd_pick_column($names, ['product_id', 'id']);

    if ($pk === null) {
        throw new RuntimeException('The products table has no product_id column.');
    }

    $info = [
        'pk'     => $pk,
        'seller' => fynd_pick_column($names, ['seller_name']),
    ];

    return $info;
}

/**
 * cart_items.cart_id MUST be AUTO_INCREMENT.
 *
 * When it is not, every insert (which does not send a cart_id) is stored with
 * cart_id = 0, so from the second insert on the PRIMARY KEY collides. The old
 * "ON DUPLICATE KEY UPDATE cart_id = cart_id" swallowed that collision, which
 * is why the page said "Added" while nothing was saved. Now it is reported.
 */
function cart_require_auto_increment(mysqli $conn)
{
    static $checked = false;

    if ($checked) {
        return;
    }

    $res = $conn->query("SHOW COLUMNS FROM `cart_items` LIKE 'cart_id'");

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    $row = $res->fetch_assoc();
    $res->free();

    if (!$row) {
        throw new RuntimeException('The cart_items table has no cart_id column.');
    }

    if (stripos((string)$row['Extra'], 'auto_increment') === false) {
        throw new RuntimeException(
            'cart_items.cart_id is not AUTO_INCREMENT. Run this in phpMyAdmin (SQL tab): ' .
            'ALTER TABLE cart_items MODIFY cart_id INT(11) NOT NULL AUTO_INCREMENT;'
        );
    }

    $checked = true;
}

function cart_product_exists(mysqli $conn, $productId)
{
    $pk = cart_product_cols($conn)['pk'];

    $stmt = fynd_prepare(
        $conn,
        'SELECT 1 FROM `products` WHERE ' . fynd_q($pk) . ' = ? LIMIT 1'
    );
    $stmt->bind_param('i', $productId);
    fynd_execute($stmt);
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();

    return $found;
}

function cart_line_exists(mysqli $conn, $uid, $productId)
{
    $stmt = fynd_prepare($conn, 'SELECT 1 FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1');
    $stmt->bind_param('ii', $uid, $productId);
    fynd_execute($stmt);
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();

    return $found;
}

function cart_list(mysqli $conn, $uid)
{
    $cols = cart_product_cols($conn);

    $sellerSql = $cols['seller'] !== null
        ? 'p.' . fynd_q($cols['seller'])
        : "''";

    $sql = 'SELECT c.product_id, ' . $sellerSql . ' AS seller_name, p.title, '
         . 'p.category, p.`size`, p.price, p.image '
         . 'FROM cart_items c '
         . 'INNER JOIN products p ON p.' . fynd_q($cols['pk']) . ' = c.product_id '
         . 'WHERE c.user_id = ? '
         . 'ORDER BY c.cart_id ASC';

    $stmt = fynd_prepare($conn, $sql);
    $stmt->bind_param('i', $uid);
    fynd_execute($stmt);

    $res = $stmt->get_result();
    $items = [];

    while ($res && ($row = $res->fetch_assoc())) {
        $size = isset($row['size']) ? trim((string)$row['size']) : '';

        $items[] = [
            'id'    => (string)$row['product_id'],
            'name'  => (string)$row['title'],
            'shop'  => isset($row['seller_name']) ? (string)$row['seller_name'] : '',
            'size'  => $size !== '' ? $size : (string)$row['category'],
            'price' => (float)$row['price'],
            'image' => isset($row['image']) ? (string)$row['image'] : '',
        ];
    }

    $stmt->close();

    return $items;
}

try {
    require_once __DIR__ . '/db.php';

    $user = fynd_require_user($conn);
    $uid  = (int)$user['id'];

    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

    if ($method === 'GET') {
        $items = cart_list($conn, $uid);

        fynd_json([
            'ok'    => true,
            'items' => $items,
            'count' => count($items),
        ]);
    }

    if ($method !== 'POST') {
        throw new FyndUserError('Method not allowed.', 405);
    }

    // Requiring a JSON content type blocks simple cross-site form posts.
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';

    if (stripos($contentType, 'application/json') !== 0) {
        throw new FyndUserError('Invalid request.', 415);
    }

    $data   = fynd_read_json();
    $action = isset($data['action']) ? (string)$data['action'] : '';

    if ($action === 'add') {
        $productId = cart_id(isset($data['product_id']) ? $data['product_id'] : null);

        if ($productId === 0) {
            throw new FyndUserError('Invalid item.');
        }

        if (!cart_product_exists($conn, $productId)) {
            throw new FyndUserError('This item is no longer available.', 404);
        }

        if (cart_line_exists($conn, $uid, $productId)) {
            fynd_json(['ok' => true, 'status' => 'exists']);
        }

        cart_require_auto_increment($conn);

        /* FIXED: a plain INSERT. "ON DUPLICATE KEY UPDATE cart_id = cart_id"
           silently ignored any key collision, so failed saves looked fine. */
        $stmt = fynd_prepare(
            $conn,
            'INSERT INTO cart_items (user_id, product_id) VALUES (?, ?)'
        );
        $stmt->bind_param('ii', $uid, $productId);

        try {
            fynd_execute($stmt);
        } catch (Throwable $e) {
            $stmt->close();

            // Two quick clicks can both pass the check above; the unique key
            // (user_id, product_id) stops the second one.
            if (cart_line_exists($conn, $uid, $productId)) {
                fynd_json(['ok' => true, 'status' => 'exists']);
            }

            throw $e;
        }

        $stmt->close();

        /* FIXED: only answer "added" when the item can really be read back
           from the cart. Otherwise the page would show "Added to your cart"
           for something that was never saved. */
        $items = cart_list($conn, $uid);
        $saved = false;

        foreach ($items as $item) {
            if ((int)$item['id'] === $productId) {
                $saved = true;
                break;
            }
        }

        if (!$saved) {
            throw new RuntimeException(
                'The item was not found in your cart after saving it.'
            );
        }

        fynd_json(['ok' => true, 'status' => 'added', 'count' => count($items)]);
    }

    if ($action === 'remove') {
        $productId = cart_id(isset($data['product_id']) ? $data['product_id'] : null);

        if ($productId === 0) {
            throw new FyndUserError('Invalid item.');
        }

        $stmt = fynd_prepare($conn, 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?');
        $stmt->bind_param('ii', $uid, $productId);
        fynd_execute($stmt);
        $stmt->close();

        fynd_json(['ok' => true]);
    }

    if ($action === 'merge') {
        $lines = isset($data['items']) ? $data['items'] : [];

        if (!is_array($lines)) {
            throw new FyndUserError('Invalid request.');
        }

        $lines = array_slice($lines, 0, 100);

        cart_require_auto_increment($conn);

        $insertStmt = fynd_prepare(
            $conn,
            'INSERT IGNORE INTO cart_items (user_id, product_id) VALUES (?, ?)'
        );

        $pid = 0;
        $insertStmt->bind_param('ii', $uid, $pid);

        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }

            $pid = cart_id(isset($line['product_id']) ? $line['product_id'] : null);

            if ($pid === 0) {
                continue;
            }

            if (!cart_product_exists($conn, $pid)) {
                continue;
            }

            // Already in the account cart: keep that line as it is.
            if (cart_line_exists($conn, $uid, $pid)) {
                continue;
            }

            fynd_execute($insertStmt);
        }

        $insertStmt->close();

        fynd_json(['ok' => true]);
    }

    throw new FyndUserError('Unknown action.');
} catch (Throwable $e) {
    fynd_handle_exception($e);
}