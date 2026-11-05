
<?php
echo "PHP: " . PHP_VERSION . "<br>";
echo "Loaded php.ini: " . php_ini_loaded_file() . "<br>";
echo "Extension directory: " . ini_get('extension_dir') . "<br>";
echo "cURL loaded: " . (extension_loaded('curl') ? 'YES' : 'NO') . "<br>";
?>
