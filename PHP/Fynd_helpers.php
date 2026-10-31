<?php

const FYND_CATEGORIES = ['Shoes', 'T-shirts', 'Pants', 'Jackets', 'Accessories', 'Other'];
const FYND_CONDITIONS = ['Like new', 'Good', 'Fair'];
const FYND_UPLOAD_DIR = __DIR__ . '/uploads';
const FYND_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** An error whose message is safe to show to the user. */
class FyndUserError extends Exception
{
    private $httpStatus;

    public function __construct($message, $httpStatus = 400)
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
    }

    public function getHttpStatus()
    {
        return $this->httpStatus;
    }
}

/* ---------------------------------------------------------
   JSON output
   --------------------------------------------------------- */
function fynd_json(array $data, $status = 200)
{
    // Throw away any stray output (for example a blank line before <?php in db.php)
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fynd_handle_exception($e)
{
    if ($e instanceof FyndUserError) {
        fynd_json(['ok' => false, 'error' => $e->getMessage()], $e->getHttpStatus());
    }

    error_log('[FYND] ' . get_class($e) . ': ' . $e->getMessage());

    $payload = ['ok' => false, 'error' => 'Something went wrong on the server.'];

    if (defined('FYND_DEBUG') && FYND_DEBUG) {
        $payload['detail'] = $e->getMessage();
    }

    fynd_json($payload, 500);
}

function fynd_read_json()
{
    $raw = file_get_contents('php://input');

    if ($raw === false || $raw === '') {
        throw new FyndUserError('The request was empty or too large.');
    }

    $data = json_decode($raw, true);

    if (!is_array($data)) {
        throw new FyndUserError('Invalid request.');
    }

    return $data;
}

/* ---------------------------------------------------------
   Small utilities
   --------------------------------------------------------- */
function fynd_len($text)
{
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function fynd_substr($text, $max)
{
    return function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max);
}

/** Quote an identifier that came from SHOW COLUMNS / SHOW KEYS. */
function fynd_q($identifier)
{
    return '`' . str_replace('`', '``', $identifier) . '`';
}

function fynd_prepare(mysqli $conn, $sql)
{
    $stmt = $conn->prepare($sql);

    if ($stmt === false) {
        throw new RuntimeException('Database error: ' . $conn->error);
    }

    return $stmt;
}

function fynd_execute(mysqli_stmt $stmt)
{
    if (!$stmt->execute()) {
        throw new RuntimeException('Database error: ' . $stmt->error);
    }
}

/* ---------------------------------------------------------
   Who is logged in?
   Works with the PHP session your login.php / session.php already use.
   It looks for the user id (or email) in the session, then confirms the
   user in the users table. Column names are discovered, not assumed.
   --------------------------------------------------------- */
function fynd_start_session()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function fynd_session_lookup(array $names)
{
    $sources = [$_SESSION];

    foreach (['user', 'users', 'account'] as $key) {
        if (isset($_SESSION[$key]) && is_array($_SESSION[$key])) {
            $sources[] = $_SESSION[$key];
        }
    }

    foreach ($sources as $source) {
        foreach ($names as $name) {
            if (isset($source[$name]) && is_scalar($source[$name]) && $source[$name] !== '') {
                return $source[$name];
            }
        }
    }

    return null;
}

function fynd_users_columns(mysqli $conn)
{
    $cols = [];

    try {
        $res = $conn->query('SHOW COLUMNS FROM `users`');

        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $cols[] = $row['Field'];
            }
            $res->free();
        }
    } catch (Throwable $e) {
        error_log('[FYND] Could not read users columns: ' . $e->getMessage());
    }

    return $cols;
}

function fynd_pick_column(array $cols, array $candidates)
{
    $lower = array_map('strtolower', $cols);

    foreach ($candidates as $candidate) {
        $index = array_search($candidate, $lower, true);

        if ($index !== false) {
            return $cols[$index];
        }
    }

    return null;
}

function fynd_users_pk(mysqli $conn, array $cols)
{
    try {
        $res = $conn->query("SHOW KEYS FROM `users` WHERE Key_name = 'PRIMARY'");

        if ($res) {
            $row = $res->fetch_assoc();
            $res->free();

            if ($row && !empty($row['Column_name'])) {
                return $row['Column_name'];
            }
        }
    } catch (Throwable $e) {
        error_log('[FYND] Could not read users primary key: ' . $e->getMessage());
    }

    return fynd_pick_column($cols, ['id', 'user_id', 'userid']);
}

function fynd_find_user(mysqli $conn, $whereCol, $type, $value, $pk, $nameCol)
{
    $sql = 'SELECT ' . fynd_q($pk) . ' AS uid, '
         . ($nameCol !== null ? fynd_q($nameCol) : "''") . ' AS uname'
         . ' FROM `users` WHERE ' . fynd_q($whereCol) . ' = ? LIMIT 1';

    $stmt = fynd_prepare($conn, $sql);
    $stmt->bind_param($type, $value);
    fynd_execute($stmt);

    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ? $row : null;
}

/**
 * @return array|null ['id' => int, 'name' => string, 'email' => string]
 */
function fynd_current_user(mysqli $conn)
{
    fynd_start_session();

    $sid   = fynd_session_lookup(['user_id', 'userId', 'userid', 'uid', 'id']);
    $email = fynd_session_lookup(['email', 'user_email', 'userEmail']);
    $sname = fynd_session_lookup(['fullname', 'full_name', 'name', 'user_name', 'userName', 'username']);

    // $_SESSION['user'] may itself be a plain id or an email string
    if (isset($_SESSION['user']) && is_scalar($_SESSION['user'])) {
        $plain = trim((string)$_SESSION['user']);

        if ($sid === null && ctype_digit($plain)) {
            $sid = $plain;
        } elseif ($email === null && strpos($plain, '@') !== false) {
            $email = $plain;
        }
    }

    $sid   = ($sid !== null && ctype_digit((string)$sid) && (int)$sid > 0) ? (int)$sid : null;
    $email = $email !== null ? trim((string)$email) : '';
    $sname = $sname !== null ? trim((string)$sname) : '';

    $user = null;
    $lookupDone = false;

    try {
        $cols = fynd_users_columns($conn);
        $pk   = $cols ? fynd_users_pk($conn, $cols) : null;

        if ($pk !== null) {
            $lookupDone = true;

            $emailCol = fynd_pick_column($cols, ['email', 'email_address', 'user_email']);
            $nameCol  = fynd_pick_column($cols, ['fullname', 'full_name', 'name', 'username', 'user_name']);

            $row = null;

            if ($sid !== null) {
                $row = fynd_find_user($conn, $pk, 'i', $sid, $pk, $nameCol);
            }

            if ($row === null && $email !== '' && $emailCol !== null) {
                $row = fynd_find_user($conn, $emailCol, 's', $email, $pk, $nameCol);
            }

            if ($row !== null && ctype_digit((string)$row['uid']) && (int)$row['uid'] > 0) {
                $dbName = trim((string)$row['uname']);

                $user = [
                    'id'    => (int)$row['uid'],
                    'name'  => $dbName !== '' ? $dbName : $sname,
                    'email' => $email,
                ];
            }
        }
    } catch (Throwable $e) {
        $lookupDone = false;
        error_log('[FYND] User lookup failed: ' . $e->getMessage());
    }

    // Only trust the session id directly when the users table could not be checked
    if ($user === null && !$lookupDone && $sid !== null) {
        $user = ['id' => $sid, 'name' => $sname, 'email' => $email];
    }

    return $user;
}

function fynd_require_user(mysqli $conn)
{
    $user = fynd_current_user($conn);

    if ($user === null) {
        fynd_json([
            'ok'    => false,
            'error' => 'You are not logged in. Please sign in again.',
        ], 401);
    }

    return $user;
}

/* ---------------------------------------------------------
   Photos
   --------------------------------------------------------- */
function fynd_ensure_upload_dir()
{
    if (!is_dir(FYND_UPLOAD_DIR)) {
        if (!@mkdir(FYND_UPLOAD_DIR, 0755, true) && !is_dir(FYND_UPLOAD_DIR)) {
            throw new RuntimeException('Could not create the uploads folder.');
        }
    }

    if (!is_writable(FYND_UPLOAD_DIR)) {
        throw new RuntimeException('The uploads folder is not writable.');
    }
}

/** Saves a data URL (data:image/jpeg;base64,...) and returns 'uploads/<file>'. */
function fynd_save_image_data_url($dataUrl)
{
    $comma = strpos($dataUrl, ',');

    if ($comma === false) {
        throw new FyndUserError('The photo could not be read.');
    }

    $header = substr($dataUrl, 0, $comma);

    if (!preg_match('#^data:image/(jpeg|png|webp);base64$#', $header)) {
        throw new FyndUserError('Photo must be a JPG, PNG or WebP image.');
    }

    $b64    = str_replace(["\r", "\n", ' '], '', substr($dataUrl, $comma + 1));
    $binary = base64_decode($b64, true);

    if ($binary === false || $binary === '') {
        throw new FyndUserError('The photo data could not be read.');
    }

    if (strlen($binary) > FYND_MAX_IMAGE_BYTES) {
        throw new FyndUserError('Photo must be 5 MB or less.');
    }

    $info = @getimagesizefromstring($binary);
    $mime = is_array($info) && isset($info['mime']) ? $info['mime'] : '';
    $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    if (!isset($exts[$mime])) {
        throw new FyndUserError('Photo must be a valid JPG, PNG or WebP image.');
    }

    fynd_ensure_upload_dir();

    $name = bin2hex(random_bytes(8)) . '.' . $exts[$mime];

    if (file_put_contents(FYND_UPLOAD_DIR . '/' . $name, $binary) === false) {
        throw new RuntimeException('Could not save the photo file.');
    }

    return 'uploads/' . $name;
}

/** Deletes a photo, but only if it is one of the files this app created. */
function fynd_delete_image($path)
{
    if (is_string($path) && preg_match('#^uploads/[a-f0-9]{16}\.(jpg|png|webp)$#', $path)) {
        $full = FYND_UPLOAD_DIR . '/' . basename($path);

        if (is_file($full)) {
            @unlink($full);
        }
    }
}