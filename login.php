<?php
session_start();
require 'db.php';

header('Content-Type: application/json');

$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

/* ---- Basic validation ---- */
if (!$email || !$password) {
    echo json_encode(['success' => false, 'message' => 'Please fill in all fields.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Please enter a valid email address.']);
    exit;
}

/* ---- Look up user by email ---- */
$stmt = $conn->prepare("SELECT user_id, username, email, password FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();
$user   = $result->fetch_assoc();
$stmt->close();

/* ---- Verify password ---- */
if (!$user || !password_verify($password, $user['password'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid email or password.']);
    exit;
}

/* ---- Start session ---- */
session_regenerate_id(true);
$_SESSION['user_id']    = $user['user_id'];
$_SESSION['user_name']  = $user['username'];
$_SESSION['user_email'] = $user['email'];

$conn->close();

echo json_encode(['success' => true, 'redirect' => 'Fynd2.html']);
?>