<?php
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true);
define('FYND_DESCRIPTION_MAX', 1000);

/* NEW: most photos one item can have (the first one is the cover) */
define('FYND_MAX_PHOTOS', 5);


require_once __DIR__ . '/PHP/Fynd_helpers.php';

/** Find one listing owned by the current user. Returns an array or null. */
function lst_find(mysqli $conn, array $m, $id)
{
    $sql = 'SELECT ' . $m['select'] . ' FROM `products` WHERE '
         . fynd_q($m['pk']) . ' = ? AND ' . $m['ownerSql'] . ' LIMIT 1';

    $stmt = fynd_prepare($conn, $sql);
    $stmt->bind_param('i' . $m['ownerType'], $id, $m['ownerVal']);
    fynd_execute($stmt);

    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ? $row : null;
}

/* ------------------------------------------------------------------
   NEW: photos helpers (table product_images, see add_product_images_table.sql)
------------------------------------------------------------------ */

/** Is the product_images table there? */
function lst_has_images_table(mysqli $conn)
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $res = $conn->query("SHOW TABLES LIKE 'product_images'");

    if ($res === false) {
        $cached = false;
        return $cached;
    }

    $cached = $res->num_rows > 0;
    $res->free();

    return $cached;
}

/** [product_id => [path, path, ...]] in the right order (cover first). */
function lst_images_map(mysqli $conn, array $ids, $hasTable)
{
    $map = [];

    if (!$hasTable || count($ids) === 0) {
        return $map;
    }

    $clean = array_map('intval', $ids);

    $sql = 'SELECT `product_id`, `image_path` FROM `product_images` ' .
           'WHERE `product_id` IN (' . implode(',', $clean) . ') ' .
           'ORDER BY `product_id`, `sort_order`, `image_id`';

    $res = $conn->query($sql);

    if ($res === false) {
        return $map;
    }

    while ($r = $res->fetch_assoc()) {
        $map[(int)$r['product_id']][] = (string)$r['image_path'];
    }

    $res->free();

    return $map;
}

/** All photos of one item. Old items fall back to their single photo. */
function lst_current_images(mysqli $conn, $id, $hasTable, $cover)
{
    $map = lst_images_map($conn, [(int)$id], $hasTable);
    $list = isset($map[(int)$id]) ? $map[(int)$id] : [];
    $cover = (string)$cover;

    if ($cover !== '' && !in_array($cover, $list, true)) {
        $list[] = $cover;
    }

    return $list;
}

/** Replace the photo rows of one item. */
function lst_store_images(mysqli $conn, $productId, array $paths, $hasTable)
{
    if (!$hasTable) {
        if (count($paths) > 1) {
            throw new RuntimeException(
                'The product_images table is missing. Run ' .
                'add_product_images_table.sql in phpMyAdmin to save more than one photo.'
            );
        }

        return;
    }

    $pid = (int)$productId;

    $del = fynd_prepare($conn, 'DELETE FROM `product_images` WHERE `product_id` = ?');
    $del->bind_param('i', $pid);
    fynd_execute($del);
    $del->close();

    if (count($paths) === 0) {
        return;
    }

    $ins = fynd_prepare(
        $conn,
        'INSERT INTO `product_images` (`product_id`, `image_path`, `sort_order`) VALUES (?, ?, ?)'
    );

    foreach (array_values($paths) as $order => $path) {
        $p = (string)$path;
        $o = (int)$order;
        $ins->bind_param('isi', $pid, $p, $o);
        fynd_execute($ins);
    }

    $ins->close();
}

/** Photos sent by Seller Studio (new "images" list, or the old single "image"). */
function lst_collect_images(array $in)
{
    $list = [];

    if (isset($in['images']) && is_array($in['images'])) {
        foreach ($in['images'] as $img) {
            if (!is_string($img)) {
                throw new FyndUserError('A photo could not be read.');
            }

            if ($img !== '') {
                $list[] = $img;
            }
        }
    } elseif (isset($in['image']) && is_string($in['image']) && $in['image'] !== '') {
        $list[] = $in['image'];
    }

    if (count($list) > FYND_MAX_PHOTOS) {
        throw new FyndUserError(
            'You can add up to ' . FYND_MAX_PHOTOS . ' photos per item.'
        );
    }

    return $list;
}

function lst_rollback(mysqli $conn)
{
    try {
        $conn->rollback();
    } catch (Throwable $ignore) {
        /* nothing to roll back */
    }
}

/** $images = every photo of the item, cover first. */
function lst_format(array $row, array $images)
{
    $cover = (string)($row['image'] ?? '');

    if (count($images) === 0 && $cover !== '') {
        $images = [$cover];
    }

    return [
        'id'          => (string)$row['id'],
        'title'       => (string)$row['title'],
        'category'    => (string)$row['category'],
        'size'        => (string)($row['size'] ?? ''),
        'description' => (string)($row['description'] ?? ''),
        'price'       => (float)$row['price'],
        'condition'   => (string)$row['cond'],
        'views'       => (int)($row['views'] ?? 0),
        'image'       => count($images) > 0 ? (string)$images[0] : '',
        'images'      => array_values($images),
    ];
}

/** Validate the fields sent by Seller Studio. */
function lst_validate(array $in)
{
    $title       = trim((string)($in['title'] ?? ''));
    $category    = (string)($in['category'] ?? '');
    $size        = trim((string)($in['size'] ?? ''));
    $description = trim((string)($in['description'] ?? ''));
    $condition   = (string)($in['condition'] ?? '');
    $price       = $in['price'] ?? null;

    if (fynd_len($title) < 2) {
        throw new FyndUserError('Please enter an item name.');
    }

    if (fynd_len($title) > 60) {
        $title = fynd_substr($title, 60);
    }

    if (!in_array($category, FYND_CATEGORIES, true)) {
        throw new FyndUserError('Please choose a valid category.');
    }

    if (fynd_len($size) > 12) {
        throw new FyndUserError('Size is too long.');
    }

    if ($description === '') {
        throw new FyndUserError('Please enter a description of the item.');
    }

    if (fynd_len($description) > FYND_DESCRIPTION_MAX) {
        throw new FyndUserError(
            'The description is too long (maximum ' .
            FYND_DESCRIPTION_MAX . ' characters).'
        );
    }

    if (!in_array($condition, FYND_CONDITIONS, true)) {
        throw new FyndUserError('Please choose a valid item condition.');
    }

    if (!is_numeric($price) || (float)$price < 0 || (float)$price > 1000000) {
        throw new FyndUserError('Enter a valid price.');
    }

    return [
        $title,
        $category,
        $size,
        $description,
        round((float)$price, 2),
        $condition
    ];
}

try {
    require_once __DIR__ . '/db.php';

    /** @var mysqli $conn */
    $user = fynd_require_user($conn);

    /* Discover the products table columns */
    $cols = [];
    $res = $conn->query('SHOW COLUMNS FROM `products`');

    if ($res === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    while ($r = $res->fetch_assoc()) {
        $cols[] = $r['Field'];
    }

    $res->free();

    $pk = fynd_pick_column($cols, ['product_id', 'id']);
    $sellerIdCol = fynd_pick_column(
        $cols,
        ['seller_id', 'user_id', 'owner_id', 'userid']
    );
    $nameCol = fynd_pick_column($cols, ['seller_name']);
    $viewsCol = fynd_pick_column($cols, ['views', 'view_count']);

    if ($pk === null) {
        throw new RuntimeException(
            'The products table has no product_id column.'
        );
    }

    if (!in_array('description', $cols, true)) {
        throw new RuntimeException(
            'The products table has no description column. ' .
            'Run add_description_column.sql in phpMyAdmin first.'
        );
    }

    /* NEW: is the multi-photo table installed? */
    $hasImg = lst_has_images_table($conn);

    /* Determine which rows belong to this seller */
    if ($sellerIdCol !== null) {
        $ownerSql = fynd_q($sellerIdCol) . ' = ?';
        $ownerType = 'i';
        $ownerVal = (int)$user['id'];
    } elseif ($nameCol !== null) {
        if ($user['name'] === '') {
            throw new FyndUserError(
                'Your account has no name, so your listings cannot be found.',
                403
            );
        }

        $ownerSql = fynd_q($nameCol) . ' = ?';
        $ownerType = 's';
        $ownerVal = $user['name'];
    } else {
        throw new RuntimeException(
            'The products table needs a seller_id or seller_name column.'
        );
    }

    $m = [
        'pk'        => $pk,
        'ownerSql'  => $ownerSql,
        'ownerType' => $ownerType,
        'ownerVal'  => $ownerVal,
        'select'    => fynd_q($pk) .
                       ' AS id, `title`, `category`, `size`, `description`, `price`, ' .
                       '`item_condition` AS cond, `image`, ' .
                       ($viewsCol !== null ? fynd_q($viewsCol) : '0') .
                       ' AS views',
    ];

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    /* LIST LISTINGS */
    if ($method === 'GET') {
        $sql = 'SELECT ' . $m['select'] .
               ' FROM `products` WHERE ' . $ownerSql .
               ' ORDER BY ' . fynd_q($pk) . ' DESC LIMIT 500';

        $stmt = fynd_prepare($conn, $sql);
        $stmt->bind_param($ownerType, $ownerVal);
        fynd_execute($stmt);

        $result = $stmt->get_result();
        $rows = [];
        $ids = [];

        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
            $ids[] = (int)$row['id'];
        }

        $stmt->close();

        $imgMap = lst_images_map($conn, $ids, $hasImg);
        $listings = [];

        foreach ($rows as $row) {
            $rid = (int)$row['id'];
            $listings[] = lst_format(
                $row,
                isset($imgMap[$rid]) ? $imgMap[$rid] : []
            );
        }

        fynd_json([
            'ok' => true,
            'listings' => $listings
        ]);
    }

    if ($method !== 'POST') {
        throw new FyndUserError('Method not allowed.', 405);
    }

    $in = fynd_read_json();
    $action = (string)($in['action'] ?? '');

    /* CREATE LISTING */
    if ($action === 'create') {
        list(
            $title,
            $category,
            $size,
            $description,
            $price,
            $condition
        ) = lst_validate($in);

        $requested = lst_collect_images($in);

        if (count($requested) > 1 && !$hasImg) {
            throw new RuntimeException(
                'The product_images table is missing. Run ' .
                'add_product_images_table.sql in phpMyAdmin to save more than one photo.'
            );
        }

        $savedNew = [];
        $newId = 0;

        try {
            $paths = [];

            foreach ($requested as $img) {
                if (strpos($img, 'data:') !== 0) {
                    throw new FyndUserError('A photo could not be read.');
                }

                $p = fynd_save_image_data_url($img);
                $savedNew[] = $p;
                $paths[] = $p;
            }

            $cover = count($paths) > 0 ? $paths[0] : '';

            $conn->begin_transaction();

            $fields = [
                ['title', 's', $title],
                ['category', 's', $category],
                ['size', 's', $size],
                ['description', 's', $description],
                ['price', 'd', $price],
                ['item_condition', 's', $condition],
                ['image', 's', $cover],
            ];

            if ($nameCol !== null) {
                $fields[] = [
                    $nameCol,
                    's',
                    $user['name'] !== '' ? $user['name'] : 'FYND seller'
                ];
            }

            if ($sellerIdCol !== null) {
                $fields[] = [$sellerIdCol, 'i', (int)$user['id']];
            }

            $names = [];
            $types = '';
            $vals = [];

            foreach ($fields as $f) {
                $names[] = fynd_q($f[0]);
                $types .= $f[1];
                $vals[] = $f[2];
            }

            $sql = 'INSERT INTO `products` (' .
                   implode(', ', $names) . ') VALUES (' .
                   implode(', ', array_fill(0, count($names), '?')) . ')';

            $stmt = fynd_prepare($conn, $sql);
            $stmt->bind_param($types, ...$vals);
            fynd_execute($stmt);

            $newId = (int)$conn->insert_id;
            $stmt->close();

            lst_store_images($conn, $newId, $paths, $hasImg);

            $conn->commit();
        } catch (Throwable $e) {
            lst_rollback($conn);

            foreach ($savedNew as $p) {
                fynd_delete_image($p);
            }

            throw $e;
        }

        $row = lst_find($conn, $m, $newId);

        if ($row === null) {
            throw new RuntimeException(
                'The listing was saved but could not be read back.'
            );
        }

        fynd_json([
            'ok' => true,
            'listing' => lst_format(
                $row,
                lst_current_images($conn, $newId, $hasImg, $row['image'] ?? '')
            )
        ]);
    }

    /* UPDATE LISTING */
    if ($action === 'update') {
        $id = (int)($in['id'] ?? 0);

        if ($id <= 0) {
            throw new FyndUserError('Missing listing id.');
        }

        $existing = lst_find($conn, $m, $id);

        if ($existing === null) {
            throw new FyndUserError('Listing not found.', 404);
        }

        list(
            $title,
            $category,
            $size,
            $description,
            $price,
            $condition
        ) = lst_validate($in);

        $existingImages = lst_current_images(
            $conn,
            $id,
            $hasImg,
            $existing['image'] ?? ''
        );

        $requested = lst_collect_images($in);

        if (count($requested) > 1 && !$hasImg) {
            throw new RuntimeException(
                'The product_images table is missing. Run ' .
                'add_product_images_table.sql in phpMyAdmin to save more than one photo.'
            );
        }

        $savedNew = [];
        $final = [];

        try {
            foreach ($requested as $img) {
                if (strpos($img, 'data:') === 0) {
                    $p = fynd_save_image_data_url($img);
                    $savedNew[] = $p;
                    $final[] = $p;
                } elseif (in_array($img, $existingImages, true)) {
                    /* a photo this item already has: keep it */
                    $final[] = $img;
                } else {
                    throw new FyndUserError('A photo could not be read.');
                }
            }

            $final = array_values(array_unique($final));
            $cover = count($final) > 0 ? $final[0] : '';

            $conn->begin_transaction();

            $sql = 'UPDATE `products` SET ' .
                   '`title` = ?, `category` = ?, `size` = ?, `description` = ?, ' .
                   '`price` = ?, `item_condition` = ?, `image` = ? WHERE ' .
                   fynd_q($pk) . ' = ? AND ' . $ownerSql;

            $stmt = fynd_prepare($conn, $sql);

            $stmt->bind_param(
                'ssssdssi' . $ownerType,
                $title,
                $category,
                $size,
                $description,
                $price,
                $condition,
                $cover,
                $id,
                $ownerVal
            );

            fynd_execute($stmt);
            $stmt->close();

            lst_store_images($conn, $id, $final, $hasImg);

            $conn->commit();
        } catch (Throwable $e) {
            lst_rollback($conn);

            foreach ($savedNew as $p) {
                fynd_delete_image($p);
            }

            throw $e;
        }

        /* the database is saved: now remove the photos that were taken out */
        foreach ($existingImages as $old) {
            if ($old !== '' && !in_array($old, $final, true)) {
                fynd_delete_image($old);
            }
        }

        $row = lst_find($conn, $m, $id);

        if ($row === null) {
            throw new RuntimeException(
                'The listing was saved but could not be read back.'
            );
        }

        fynd_json([
            'ok' => true,
            'listing' => lst_format(
                $row,
                lst_current_images($conn, $id, $hasImg, $row['image'] ?? '')
            )
        ]);
    }

    /* DELETE LISTING */
    if ($action === 'delete') {
        $id = (int)($in['id'] ?? 0);

        if ($id <= 0) {
            throw new FyndUserError('Missing listing id.');
        }

        $existing = lst_find($conn, $m, $id);

        if ($existing === null) {
            throw new FyndUserError('Listing not found.', 404);
        }

        $oldImages = lst_current_images(
            $conn,
            $id,
            $hasImg,
            $existing['image'] ?? ''
        );

        $sql = 'DELETE FROM `products` WHERE ' .
               fynd_q($pk) . ' = ? AND ' . $ownerSql;

        $stmt = fynd_prepare($conn, $sql);
        $stmt->bind_param('i' . $ownerType, $id, $ownerVal);
        fynd_execute($stmt);
        $stmt->close();

        if ($hasImg) {
            lst_store_images($conn, $id, [], true);
        }

        foreach ($oldImages as $old) {
            fynd_delete_image($old);
        }

        fynd_json(['ok' => true]);
    }

    throw new FyndUserError('Unknown action.');
} catch (Throwable $e) {
    fynd_handle_exception($e);
}