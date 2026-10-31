<?php
/**
 * check_setup.php - one-click health check. Open it in your browser while you
 * are logged in:  http://localhost/Fynd_Marketplace/FYND/check_setup.php
 * DELETE this file when everything shows green (it reveals setup details).
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/fynd_helpers.php';

function row($ok, $label, $detail = '')
{
    $mark = $ok === true ? '&#10004;' : ($ok === false ? '&#10008;' : '&#9888;');
    $cls  = $ok === true ? 'ok' : ($ok === false ? 'bad' : 'warn');
    echo '<li class="' . $cls . '"><b>' . $mark . '</b> ' . htmlspecialchars($label);
    if ($detail !== '') {
        echo '<br><small>' . htmlspecialchars($detail) . '</small>';
    }
    echo '</li>';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FYND setup check</title>
<style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1b1b1b}
    h1{font-size:22px} h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
    ul{list-style:none;padding:0} li{padding:6px 10px;margin:4px 0;border-radius:8px;background:#f5f5f5}
    li.ok{background:#e8f6ec} li.bad{background:#fdeaea} li.warn{background:#fff6dd} small{color:#555}
</style>
</head>
<body>
<h1>FYND setup check</h1>
<?php
$conn = null;

echo '<h2>1. Database</h2><ul>';
try {
    require_once __DIR__ . '/db.php';
    row(true, 'Connected to the database', 'PHP ' . PHP_VERSION);
} catch (Throwable $e) {
    row(false, 'Database connection failed', $e->getMessage());
}
echo '</ul>';

if ($conn instanceof mysqli) {
    echo '<h2>2. products table</h2><ul>';
    $expected = ['product_id', 'seller_id', 'seller_name', 'title', 'category', 'size', 'price', 'item_condition', 'image', 'views', 'created_at'];
    $have = [];
    $condType = '';
    try {
        $res = $conn->query('SHOW COLUMNS FROM `products`');
        while ($r = $res->fetch_assoc()) {
            $have[] = strtolower($r['Field']);
            if (strtolower($r['Field']) === 'item_condition') {
                $condType = $r['Type'];
            }
        }
        foreach ($expected as $col) {
            $found = in_array($col, $have, true);
            row($found, 'Column ' . $col . ($found ? '' : ' is MISSING'), $found ? '' : 'Run migration_products.sql (or the earlier ALTER TABLE).');
        }
        $condOk = strpos($condType, "'Like new'") !== false;
        row($condOk, 'item_condition values', $condType . ($condOk ? '' : "  (needs 'Like new','Good','Fair')"));
    } catch (Throwable $e) {
        row(false, 'Could not read the products table', $e->getMessage());
    }
    echo '</ul>';

    echo '<h2>3. users table</h2><ul>';
    $cols = fynd_users_columns($conn);
    if (!$cols) {
        row(false, 'Could not read the users table');
    } else {
        $pk = fynd_users_pk($conn, $cols);
        row($pk !== null, 'Primary key column: ' . ($pk !== null ? $pk : 'not found'));
        $nc = fynd_pick_column($cols, ['fullname', 'full_name', 'name', 'username', 'user_name']);
        row($nc !== null ? true : null, 'Name column: ' . ($nc !== null ? $nc : 'not found (the session name will be used instead)'));
        $ec = fynd_pick_column($cols, ['email', 'email_address', 'user_email']);
        row($ec !== null ? true : null, 'Email column: ' . ($ec !== null ? $ec : 'not found'));
        row(true, 'All columns: ' . implode(', ', $cols));
    }
    echo '</ul>';

    echo '<h2>4. Login session</h2><ul>';
    fynd_start_session();
    $keys = array_keys($_SESSION);
    row(!empty($keys) ? true : null, 'Session keys: ' . (empty($keys) ? '(none - log in first, then reload this page)' : implode(', ', $keys)));
    $u = null;
    try {
        $u = fynd_current_user($conn);
    } catch (Throwable $e) {
        row(false, 'User lookup failed', $e->getMessage());
    }
    if ($u) {
        row(true, 'Detected seller: id ' . $u['id'] . ', name "' . $u['name'] . '"');
    } else {
        row(false, 'Could not identify the logged-in user', 'Log in at signin.html first. If you are logged in and still see this, send me session.php and login.php.');
    }
    echo '</ul>';
}

echo '<h2>5. Photo uploads</h2><ul>';
try {
    fynd_ensure_upload_dir();
    row(true, 'uploads/ folder exists and is writable', FYND_UPLOAD_DIR);
} catch (Throwable $e) {
    row(false, $e->getMessage(), FYND_UPLOAD_DIR);
}
row(function_exists('getimagesizefromstring'), 'Image checking available');
row(true, 'post_max_size = ' . ini_get('post_max_size') . ', upload_max_filesize = ' . ini_get('upload_max_filesize'));
echo '</ul>';
?>
</body>
</html>