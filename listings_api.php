<?php
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('FYND_DEBUG', true);
define('FYND_DESCRIPTION_MAX', 1000);

require_once __DIR__ . '/fynd_helpers.php';

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

function lst_format(array $row)
{
    return [
        'id'          => (string)$row['id'],
        'title'       => (string)$row['title'],
        'category'    => (string)$row['category'],
        'size'        => (string)($row['size'] ?? ''),
        'description' => (string)($row['description'] ?? ''),
        'price'       => (float)$row['price'],
        'condition'   => (string)$row['cond'],
        'views'       => (int)($row['views'] ?? 0),
        'image'       => (string)($row['image'] ?? ''),
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
        $listings = [];

        while ($row = $result->fetch_assoc()) {
            $listings[] = lst_format($row);
        }

        $stmt->close();

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

        $image = (string)($in['image'] ?? '');
        $newImage = '';

        if ($image !== '') {
            if (strpos($image, 'data:') !== 0) {
                throw new FyndUserError('The photo could not be read.');
            }

            $newImage = fynd_save_image_data_url($image);
        }

        try {
            $fields = [
                ['title', 's', $title],
                ['category', 's', $category],
                ['size', 's', $size],
                ['description', 's', $description],
                ['price', 'd', $price],
                ['item_condition', 's', $condition],
                ['image', 's', $newImage],
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
        } catch (Throwable $e) {
            fynd_delete_image($newImage);
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
            'listing' => lst_format($row)
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

        $oldImage = (string)($existing['image'] ?? '');
        $image = (string)($in['image'] ?? '');
        $saved = '';

        if ($image === '') {
            $finalImage = '';
        } elseif (strpos($image, 'data:') === 0) {
            $saved = fynd_save_image_data_url($image);
            $finalImage = $saved;
        } elseif ($image === $oldImage) {
            $finalImage = $oldImage;
        } else {
            throw new FyndUserError('The photo could not be read.');
        }

        try {
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
                $finalImage,
                $id,
                $ownerVal
            );

            fynd_execute($stmt);
            $stmt->close();
        } catch (Throwable $e) {
            fynd_delete_image($saved);
            throw $e;
        }

        if ($oldImage !== '' && $oldImage !== $finalImage) {
            fynd_delete_image($oldImage);
        }

        $row = lst_find($conn, $m, $id);

        if ($row === null) {
            throw new RuntimeException(
                'The listing was saved but could not be read back.'
            );
        }

        fynd_json([
            'ok' => true,
            'listing' => lst_format($row)
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

        $sql = 'DELETE FROM `products` WHERE ' .
               fynd_q($pk) . ' = ? AND ' . $ownerSql;

        $stmt = fynd_prepare($conn, $sql);
        $stmt->bind_param('i' . $ownerType, $id, $ownerVal);
        fynd_execute($stmt);
        $stmt->close();

        fynd_delete_image((string)($existing['image'] ?? ''));

        fynd_json(['ok' => true]);
    }

    throw new FyndUserError('Unknown action.');
} catch (Throwable $e) {
    fynd_handle_exception($e);
}