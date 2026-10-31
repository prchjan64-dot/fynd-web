
<?php
session_start();
require 'db.php';

header('Content-Type: application/json');

error_reporting(E_ALL);
ini_set('display_errors', 1);

$fullname = trim($_POST['fullname'] ?? '');
$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';
$confirm  = $_POST['confirm-password'] ?? '';
$phone    = trim($_POST['phone'] ?? '');

/* ---- Debug: show exactly what was received ---- */
if (!$fullname || !$email || !$password || !$confirm || !$phone) {
    echo json_encode([
        'success' => false,
        'message' => 'Please fill in all fields.',
        'debug'   => [
            'fullname' => $fullname       ? 'received' : 'MISSING',
            'email'    => $email          ? 'received' : 'MISSING',
            'password' => !empty($password) ? 'received' : 'MISSING',
            'confirm'  => !empty($confirm)  ? 'received' : 'MISSING',
            'phone'    => $phone          ? 'received' : 'MISSING'
        ]
    ]);
    exit;
}

if (strlen($fullname) < 2) {
    echo json_encode(['success' => false, 'message' => 'Full name is too short.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Please enter a valid email address.']);
    exit;
}

if (strlen($password) < 8) {
    echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters.']);
    exit;
}

if ($password !== $confirm) {
    echo json_encode(['success' => false, 'message' => 'Passwords do not match.']);
    exit;
}

$cleanPhone = preg_replace('/[\s\-]/', '', $phone);
if (!preg_match('/^(09\d{9}|\+639\d{9})$/', $cleanPhone)) {
    echo json_encode(['success' => false, 'message' => 'Enter a valid phone number, e.g. 09XXX XXX XXXX.']);
    exit;
}

/* ---- Check if email already exists ---- */
$stmt = $conn->prepare("SELECT user_id FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    echo json_encode(['success' => false, 'message' => 'This email is already registered.']);
    $stmt->close();
    exit;
}
$stmt->close();

/* ---- Insert new user ---- */
$hashed = password_hash($password, PASSWORD_DEFAULT);
$stmt = $conn->prepare("INSERT INTO users (username, email, phone_number, password) VALUES (?, ?, ?, ?)");
$stmt->bind_param("ssss", $fullname, $email, $cleanPhone, $hashed);

if ($stmt->execute()) {
    echo json_encode(['success' => true, 'message' => 'Account created successfully!']);
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Registration failed. Please try again.',
        'db_error' => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>