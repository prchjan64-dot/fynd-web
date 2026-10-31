
<?php

use PHPMailer\PHPMailer\PHPMailer;

// Load PHPMailer installed through Composer
require_once __DIR__ . '/vendor/autoload.php';

function createMailer(): PHPMailer
{
    $mail = new PHPMailer(true);

    // Gmail SMTP configuration
    $mail->isSMTP();
    $mail->Host       = 'smtp.gmail.com';
    $mail->SMTPAuth   = true;

    // Replace with your actual Gmail address
    $mail->Username   = 'fyndmarketplace@gmail.com';

    // Replace with your NEW Google App Password
    // Keep this credential private
    
    $mail->Password   = 'yaiz trjk lxzu mbka';

    // Secure SMTP connection
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = 587;

    // Email encoding
    $mail->CharSet = 'UTF-8';

    // Sender must match the authenticated Gmail account
    $mail->setFrom(
        $mail->Username,
        'FYND Marketplace'
    );

    return $mail;
}
