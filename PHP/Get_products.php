
<?php
/**
 * get_products.php
 * Public list of products for Fynd2.html.
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

    $products = [];

    while ($row = $res->fetch_assoc()) {
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

    $res->free();

    fynd_json([
        'ok' => true,
        'products' => $products
    ]);
} catch (Throwable $e) {
    fynd_handle_exception($e);
}
