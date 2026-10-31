
<?php
session_start();

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mail_config.php';

function respond(bool $success, string $message): void
{
    echo json_encode([
        'success' => $success,
        'message' => $message
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    respond(false, 'Invalid request method.');
}

$action = $_POST['action'] ?? '';

/*
 * STEP A: Send a 6-digit verification code.
 */
if ($action === 'send_code') {
    $email = strtolower(trim($_POST['email'] ?? ''));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(false, 'Please enter a valid email address.');
    }

    // Prevent repeated sending within 60 seconds.
    if (
        isset($_SESSION['fp_send_time']) &&
        time() - $_SESSION['fp_send_time'] < 60
    ) {
        respond(false, 'Please wait 60 seconds before requesting another code.');
    }

    $stmt = $conn->prepare(
        'SELECT user_id FROM users WHERE email = ? LIMIT 1'
    );

    if (!$stmt) {
        error_log('Forgot password prepare failed: ' . $conn->error);
        respond(false, 'A server error occurred. Please try again.');
    }

    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();

    // Use a generic response to avoid revealing registered emails.
    if (!$user) {
        respond(
            true,
            'If this email is registered, a verification code will be sent.'
        );
    }

    // Invalidate any previous code before issuing another one.
    unset(
        $_SESSION['fp_code_hash'],
        $_SESSION['fp_expires'],
        $_SESSION['fp_verified'],
        $_SESSION['fp_reset_email']
    );

    $code = (string) random_int(100000, 999999);

    try {
        $mail = createMailer();
        $mail->addAddress($email);
        $mail->Subject = 'FYND Marketplace Password Reset';
        $mail->isHTML(true);

        $mail->Body = '
            <div style="font-family:Arial,sans-serif;line-height:1.6">
                <h2>FYND Marketplace</h2>
                <p>You requested to reset your password.</p>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing:6px">' .
                    htmlspecialchars($code, ENT_QUOTES, 'UTF-8') .
                '</h1>
                <p>This code expires in <strong>60 seconds</strong>.</p>
                <p>If you did not request this, you can ignore this email.</p>
            </div>
        ';

        $mail->AltBody =
            "Your FYND Marketplace password reset code is: $code. " .
            'It expires in 60 seconds.';

        $mail->send();
    } catch (\Throwable $e) {
        error_log('Password reset email failed: ' . $e->getMessage());
        respond(
            false,
            'Unable to send the email. Check the mail configuration and try again.'
        );
    }

    // Store only a hash of the code in the session.
    $_SESSION['fp_reset_email'] = $email;
    $_SESSION['fp_code_hash'] = password_hash($code, PASSWORD_DEFAULT);
    $_SESSION['fp_expires'] = time() + 60;
    $_SESSION['fp_send_time'] = time();
    $_SESSION['fp_verified'] = false;

    respond(true, 'If this email is registered, a verification code will be sent.');
}

/*
 * STEP B: Verify the code.
 */
if ($action === 'verify_code') {
    $code = trim($_POST['code'] ?? '');

    if (!preg_match('/^\d{6}$/', $code)) {
        respond(false, 'Enter the 6-digit verification code.');
    }

    if (
        empty($_SESSION['fp_code_hash']) ||
        empty($_SESSION['fp_expires']) ||
        time() > $_SESSION['fp_expires']
    ) {
        unset(
            $_SESSION['fp_code_hash'],
            $_SESSION['fp_expires'],
            $_SESSION['fp_verified']
        );

        respond(false, 'The code has expired. Please request a new code.');
    }

    if (!password_verify($code, $_SESSION['fp_code_hash'])) {
        respond(false, 'Incorrect verification code.');
    }

    $_SESSION['fp_verified'] = true;
    $_SESSION['fp_verified_until'] = time() + 600;

    // The code cannot be reused.
    unset($_SESSION['fp_code_hash'], $_SESSION['fp_expires']);

    respond(true, 'Code verified. You can now set a new password.');
}

/*
 * STEP C: Save the new password.
 */
if ($action === 'reset_password') {
    if (
        empty($_SESSION['fp_verified']) ||
        empty($_SESSION['fp_reset_email']) ||
        empty($_SESSION['fp_verified_until']) ||
        time() > $_SESSION['fp_verified_until']
    ) {
        unset(
            $_SESSION['fp_verified'],
            $_SESSION['fp_reset_email'],
            $_SESSION['fp_verified_until']
        );

        respond(false, 'Please verify a new code before resetting your password.');
    }

    $password = $_POST['password'] ?? '';
    $confirmPassword = $_POST['confirm_password'] ?? '';

    if (strlen($password) < 8) {
        respond(false, 'Your password must be at least 8 characters long.');
    }

    if ($password !== $confirmPassword) {
        respond(false, 'The passwords do not match.');
    }

    $email = $_SESSION['fp_reset_email'];
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $conn->prepare(
        'UPDATE users SET password = ? WHERE email = ?'
    );

    if (!$stmt) {
        error_log('Password update prepare failed: ' . $conn->error);
        respond(false, 'A server error occurred. Please try again.');
    }

    $stmt->bind_param('ss', $passwordHash, $email);
    $ok = $stmt->execute();
    $changed = $stmt->affected_rows;
    $stmt->close();

    if (!$ok || $changed !== 1) {
        respond(false, 'Unable to update the password. Please try again.');
    }

    // Clear reset-related session data after a successful reset.
    unset(
        $_SESSION['fp_reset_email'],
        $_SESSION['fp_code_hash'],
        $_SESSION['fp_expires'],
        $_SESSION['fp_send_time'],
        $_SESSION['fp_verified'],
        $_SESSION['fp_verified_until']
    );

    respond(true, 'Your password has been reset successfully. You can now log in.');
}

http_response_code(400);
respond(false, 'Unknown action.');
