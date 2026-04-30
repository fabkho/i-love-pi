<?php

use Illuminate\Support\Facades\DB;

// ============================================
// STEP 1: Load credentials from ~/.pi/anny-prod.json
// ============================================
$credsPath = getenv('HOME') . '/.pi/anny-prod.json';
if (!file_exists($credsPath)) {
    echo "❌ Missing credentials file: ~/.pi/anny-prod.json\n";
    echo "   Ask Adrian for values and create the file.\n";
    exit(1);
}
$creds = json_decode(file_get_contents($credsPath), true);

// ============================================
// STEP 2: Configure Production Database
// ============================================
echo "📡 Connecting to production database...\n";

config(['database.default' => 'production']);
config(['database.connections.production' => [
    'driver'    => 'mysql',
    'host'      => $creds['host'],
    'database'  => $creds['database'],
    'username'  => $creds['username'],
    'password'  => $creds['password'],
    'charset'   => 'utf8mb4',
    'collation' => 'utf8mb4_unicode_ci',
]]);
config(['app.key' => $creds['app_key']]);

try {
    DB::connection('production')->getPdo();
    echo "✅ Database connected successfully\n\n";
} catch (\Exception $e) {
    echo '❌ Database connection failed: ' . $e->getMessage() . "\n";
    exit(1);
}

$db = DB::connection('production');

// ============================================
// STEP 3: Your queries below
// ============================================

// Example: find a resource by ID
// $row = $db->table('resources')->where('id', 12345)->first();
// echo json_encode($row, JSON_PRETTY_PRINT) . "\n";
