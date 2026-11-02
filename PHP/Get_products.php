<?php
/**
 * get_products.php
 * Public list of products for Fynd2.html.
 *
 * NEW: every product now also has "images" (all of its photos, cover first).
 * If the product_images table does not exist yet, or an item has no rows
 * there, the item simply gets its one photo from products.image.
 */
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true);

require_once __DIR__ . '/Fynd_helpers.php';

try {
    require_once __DIR__ . '/../db.php';

    $sql = 'SELECT product_id, seller_name, title, category, `size`,
                   description, price, item_condition, image
              FROM products
             ORDER BY product_id DESC
             LIMIT 500';

    $res = $conn->query($sql);

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    $rows = [];
    $ids = [];

    while ($row = $res->fetch_assoc()) {
        $rows[] = $row;
        $ids[] = (int)$row['product_id'];
    }

    $res->free();

    /* NEW: load all photos in ONE query (ignored if the table is missing) */
    $imgMap = [];

    if (count($ids) > 0) {
        try {
            $imgSql = 'SELECT product_id, image_path FROM product_images ' .
                      'WHERE product_id IN (' . implode(',', $ids) . ') ' .
                      'ORDER BY product_id, sort_order, image_id';

            $imgRes = $conn->query($imgSql);

            if ($imgRes !== false) {
                while ($r = $imgRes->fetch_assoc()) {
                    $imgMap[(int)$r['product_id']][] = (string)$r['image_path'];
                }

                $imgRes->free();
            }
        } catch (Throwable $ignore) {
            $imgMap = [];
        }
    }

    $products = [];

    foreach ($rows as $row) {
        $pid = (int)$row['product_id'];
        $cover = isset($row['image']) ? (string)$row['image'] : '';

        if (isset($imgMap[$pid]) && count($imgMap[$pid]) > 0) {
            $images = $imgMap[$pid];
        } else {
            $images = $cover !== '' ? [$cover] : [];
        }

        $products[] = [
            'id'          => (string)$row['product_id'],
            'title'       => (string)$row['title'],
            'category'    => (string)$row['category'],
            'size'        => isset($row['size']) ? (string)$row['size'] : '',
            'description' => isset($row['description']) ? (string)$row['description'] : '',
            'price'       => (float)$row['price'],
            'condition'   => (string)$row['item_condition'],
            'image'       => count($images) > 0 ? (string)$images[0] : '',
            'images'      => array_values($images),
            'seller'      => isset($row['seller_name']) ? (string)$row['seller_name'] : '',
        ];
    }

    fynd_json([
        'ok' => true,
        'products' => $products
    ]);
} catch (Throwable $e) {
    fynd_handle_exception($e);
}