<?php
/**
 * cart.php
 * GET  -> the logged-in user's cart
 * POST -> JSON body (Content-Type: application/json):
 *           {"action":"add","product_id":12}
 *           {"action":"set_qty","product_id":12,"quantity":3}
 *           {"action":"remove","product_id":12}
 *           {"action":"merge","items":[{"product_id":1,"quantity":2}]}
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

/** Quantity between 1 and 99 (same limits as the cart page). */
function cart_quantity($value)
{
    if (is_int($value) || (is_string($value) && ctype_digit($value))) {
        $qty = (int)$value;
    } elseif (is_float($value)) {
        $qty = (int)round($value);
    } else {
        $qty = 1;
    }

    return max(1, min(99, $qty));
}

function cart_product_exists(mysqli $conn, $productId)
{
    $stmt = fynd_prepare($conn, 'SELECT 1 FROM products WHERE product_id = ? LIMIT 1');
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
    $sql = 'SELECT c.product_id, c.quantity, p.seller_name, p.title,
                   p.category, p.`size`, p.price, p.image
              FROM cart_items c
        INNER JOIN products p ON p.product_id = c.product_id
             WHERE c.user_id = ?
          ORDER BY c.cart_id ASC';

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
            'qty'   => (int)$row['quantity'],
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

        $stmt = fynd_prepare(
            $conn,
            'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE cart_id = cart_id'
        );
        $stmt->bind_param('ii', $uid, $productId);
        fynd_execute($stmt);
        $stmt->close();

        fynd_json(['ok' => true, 'status' => 'added']);
    }

    if ($action === 'set_qty') {
        $productId = cart_id(isset($data['product_id']) ? $data['product_id'] : null);

        if ($productId === 0) {
            throw new FyndUserError('Invalid item.');
        }

        $qty = cart_quantity(isset($data['quantity']) ? $data['quantity'] : 1);

        $stmt = fynd_prepare(
            $conn,
            'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?'
        );
        $stmt->bind_param('iii', $qty, $uid, $productId);
        fynd_execute($stmt);
        $stmt->close();

        fynd_json(['ok' => true, 'quantity' => $qty]);
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

        $existsStmt = fynd_prepare($conn, 'SELECT 1 FROM products WHERE product_id = ? LIMIT 1');
        $insertStmt = fynd_prepare(
            $conn,
            'INSERT IGNORE INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)'
        );

        $pid = 0;
        $qty = 1;
        $existsStmt->bind_param('i', $pid);
        $insertStmt->bind_param('iii', $uid, $pid, $qty);

        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }

            $pid = cart_id(isset($line['product_id']) ? $line['product_id'] : null);

            if ($pid === 0) {
                continue;
            }

            $qty = cart_quantity(isset($line['quantity']) ? $line['quantity'] : 1);

            fynd_execute($existsStmt);
            $existsStmt->store_result();
            $found = $existsStmt->num_rows > 0;
            $existsStmt->free_result();

            if (!$found) {
                continue;
            }

            fynd_execute($insertStmt);
        }

        $existsStmt->close();
        $insertStmt->close();

        fynd_json(['ok' => true]);
    }

    throw new FyndUserError('Unknown action.');
} catch (Throwable $e) {
    fynd_handle_exception($e);
}