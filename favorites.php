<?php
/**
 * favorites.php
 * GET  -> the logged-in user's saved products (newest first)
 * POST -> JSON body (Content-Type: application/json):
 *           {"action":"add","product_id":12}
 *           {"action":"remove","product_id":12}
 *           {"action":"merge","product_ids":[1,2,3]}
 */
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true); // set to false once everything works on the live site

require_once __DIR__ . '/PHP/Fynd_helpers.php';

/** Returns a positive int, or 0 when the value is not a valid id. */
function fav_id($value)
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

function fav_product_exists(mysqli $conn, $productId)
{
    $stmt = fynd_prepare($conn, 'SELECT 1 FROM products WHERE product_id = ? LIMIT 1');
    $stmt->bind_param('i', $productId);
    fynd_execute($stmt);
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();

    return $found;
}

function fav_count(mysqli $conn, $uid)
{
    $stmt = fynd_prepare($conn, 'SELECT COUNT(*) AS c FROM saved_products WHERE user_id = ?');
    $stmt->bind_param('i', $uid);
    fynd_execute($stmt);
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ? (int)$row['c'] : 0;
}

function fav_list(mysqli $conn, $uid)
{
    $sql = 'SELECT p.product_id, p.seller_name, p.title, p.category, p.`size`,
                   p.description, p.price, p.item_condition, p.image
              FROM saved_products sp
        INNER JOIN products p ON p.product_id = sp.product_id
             WHERE sp.user_id = ?
          ORDER BY sp.saved_id DESC';

    $stmt = fynd_prepare($conn, $sql);
    $stmt->bind_param('i', $uid);
    fynd_execute($stmt);

    $res = $stmt->get_result();
    $products = [];

    while ($res && ($row = $res->fetch_assoc())) {
        $products[] = [
            'id'          => (string)$row['product_id'],
            'title'       => (string)$row['title'],
            'category'    => (string)$row['category'],
            'size'        => isset($row['size']) ? (string)$row['size'] : '',
            'description' => isset($row['description']) ? (string)$row['description'] : '',
            'price'       => (float)$row['price'],
            'condition'   => (string)$row['item_condition'],
            'image'       => isset($row['image']) ? (string)$row['image'] : '',
            'seller'      => isset($row['seller_name']) ? (string)$row['seller_name'] : '',
        ];
    }

    $stmt->close();

    return $products;
}

try {
    require_once __DIR__ . '/db.php';

    $user = fynd_require_user($conn);
    $uid  = (int)$user['id'];

    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

    if ($method === 'GET') {
        $products = fav_list($conn, $uid);

        fynd_json([
            'ok'       => true,
            'products' => $products,
            'count'    => count($products),
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
        $productId = fav_id(isset($data['product_id']) ? $data['product_id'] : null);

        if ($productId === 0) {
            throw new FyndUserError('Invalid item.');
        }

        if (!fav_product_exists($conn, $productId)) {
            throw new FyndUserError('This item is no longer available.', 404);
        }

        $stmt = fynd_prepare(
            $conn,
            'INSERT INTO saved_products (user_id, product_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE saved_id = saved_id'
        );
        $stmt->bind_param('ii', $uid, $productId);
        fynd_execute($stmt);
        $stmt->close();

        fynd_json([
            'ok'    => true,
            'saved' => true,
            'count' => fav_count($conn, $uid),
        ]);
    }

    if ($action === 'remove') {
        $productId = fav_id(isset($data['product_id']) ? $data['product_id'] : null);

        if ($productId === 0) {
            throw new FyndUserError('Invalid item.');
        }

        $stmt = fynd_prepare($conn, 'DELETE FROM saved_products WHERE user_id = ? AND product_id = ?');
        $stmt->bind_param('ii', $uid, $productId);
        fynd_execute($stmt);
        $stmt->close();

        fynd_json([
            'ok'    => true,
            'saved' => false,
            'count' => fav_count($conn, $uid),
        ]);
    }

    if ($action === 'merge') {
        $ids = isset($data['product_ids']) ? $data['product_ids'] : [];

        if (!is_array($ids)) {
            throw new FyndUserError('Invalid request.');
        }

        $ids = array_slice($ids, 0, 200);

        $existsStmt = fynd_prepare($conn, 'SELECT 1 FROM products WHERE product_id = ? LIMIT 1');
        $insertStmt = fynd_prepare($conn, 'INSERT IGNORE INTO saved_products (user_id, product_id) VALUES (?, ?)');

        $pid = 0;
        $existsStmt->bind_param('i', $pid);
        $insertStmt->bind_param('ii', $uid, $pid);

        foreach ($ids as $raw) {
            $pid = fav_id($raw);

            if ($pid === 0) {
                continue;
            }

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

        fynd_json([
            'ok'    => true,
            'count' => fav_count($conn, $uid),
        ]);
    }

    throw new FyndUserError('Unknown action.');
} catch (Throwable $e) {
    fynd_handle_exception($e);
}