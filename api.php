<?php
// Coffee Craft backend: config info, accounts, save games, AI proxy.
// Usage: api.php?action=<name>  (JSON in, JSON out)

function cc_config(): array {
    $cfg = require __DIR__ . '/config.php';
    $local = __DIR__ . '/config.local.php';
    if (is_file($local)) {
        $cfg = array_replace_recursive($cfg, require $local);
    }
    return $cfg;
}

function out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------------------------------------------------------------- storage
interface KV {
    public function get(string $k): ?string;
    public function set(string $k, string $v): void;
    public function del(string $k): void;
    public function label(): string;
}

class JsonKV implements KV {
    private string $dir;
    public function __construct(string $path) {
        $this->dir = rtrim($path, '/\\') . '/kv';
        if (!is_dir($this->dir)) @mkdir($this->dir, 0775, true);
    }
    private function f(string $k): string { return $this->dir . '/' . hash('sha256', $k) . '.json'; }
    public function get(string $k): ?string {
        $f = $this->f($k);
        if (!is_file($f)) return null;
        $d = json_decode((string)file_get_contents($f), true);
        return is_array($d) ? ($d['v'] ?? null) : null;
    }
    public function set(string $k, string $v): void {
        $ok = file_put_contents($this->f($k), json_encode(['k' => $k, 'v' => $v, 't' => time()]), LOCK_EX);
        if ($ok === false) throw new RuntimeException('storage not writable');
    }
    public function del(string $k): void { @unlink($this->f($k)); }
    public function label(): string { return 'JSON text files (' . $this->dir . ')'; }
}

class MysqlKV implements KV {
    private PDO $pdo;
    private string $where;
    private string $kind = 'MySQL';
    public function __construct(array $c) {
        $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4";
        $this->pdo = new PDO($dsn, $c['user'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        try { if (stripos((string)$this->pdo->query('SELECT VERSION()')->fetchColumn(), 'mariadb') !== false) $this->kind = 'MariaDB'; } catch (Throwable $e) { /* keep default */ }
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS cc_kv (k VARCHAR(190) PRIMARY KEY, v MEDIUMTEXT NOT NULL, t TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) DEFAULT CHARSET=utf8mb4');
    }
    public function get(string $k): ?string {
        $s = $this->pdo->prepare('SELECT v FROM cc_kv WHERE k=?');
        $s->execute([$k]);
        $r = $s->fetchColumn();
        return $r === false ? null : $r;
    }
    public function set(string $k, string $v): void {
        $this->pdo->prepare('REPLACE INTO cc_kv (k, v) VALUES (?, ?)')->execute([$k, $v]);
    }
    public function del(string $k): void { $this->pdo->prepare('DELETE FROM cc_kv WHERE k=?')->execute([$k]); }
    public function label(): string { return $this->kind . ' database'; }
}

function open_store(array $cfg): KV {
    if (($cfg['storage'] ?? 'json') === 'mysql') {
        return new MysqlKV($cfg['mysql']);
    }
    return new JsonKV($cfg['storage_path']);
}

// --------------------------------------------------------------- helpers
function ai_provider(array $cfg): string {
    $p = $cfg['ai']['provider'] ?? 'none';
    if ($p === 'none') return 'none';
    $c = $cfg['ai'][$p] ?? [];
    if ($p !== 'ollama' && empty($c['api_key'])) return 'none';
    return $p;
}

function http_post_json(string $url, array $body, array $headers, int $timeout): array {
    $payload = json_encode($body);
    $headers[] = 'Content-Type: application/json';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5]);
        $res = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $headers),
            'content' => $payload, 'timeout' => $timeout, 'ignore_errors' => true]]);
        $res = @file_get_contents($url, false, $ctx);
        $err = $res === false ? 'request failed' : '';
    }
    if ($res === false || $res === null) throw new RuntimeException($err ?: 'request failed');
    $j = json_decode($res, true);
    if (!is_array($j)) throw new RuntimeException('bad response from AI provider');
    return $j;
}

function ai_complete(array $cfg, string $system, array $messages): string {
    $p = ai_provider($cfg);
    $a = $cfg['ai'];
    $c = $a[$p] ?? [];
    $max = (int)($a['max_tokens'] ?? 300);
    $to = (int)($a['timeout'] ?? 25);
    switch ($p) {
        case 'ollama':
            $j = http_post_json(rtrim($c['base_url'], '/') . '/api/chat', [
                'model' => $c['model'], 'stream' => false,
                'options' => ['num_predict' => $max],
                'messages' => array_merge([['role' => 'system', 'content' => $system]], $messages),
            ], [], $to);
            return trim($j['message']['content'] ?? '');
        case 'openai':
            $j = http_post_json(rtrim($c['base_url'], '/') . '/chat/completions', [
                'model' => $c['model'], 'max_tokens' => $max,
                'messages' => array_merge([['role' => 'system', 'content' => $system]], $messages),
            ], ['Authorization: Bearer ' . $c['api_key']], $to);
            return trim($j['choices'][0]['message']['content'] ?? '');
        case 'anthropic':
            $j = http_post_json('https://api.anthropic.com/v1/messages', [
                'model' => $c['model'], 'max_tokens' => $max, 'system' => $system, 'messages' => $messages,
            ], ['x-api-key: ' . $c['api_key'], 'anthropic-version: 2023-06-01'], $to);
            return trim($j['content'][0]['text'] ?? '');
        case 'gemini':
            $contents = [];
            foreach ($messages as $m) {
                $contents[] = ['role' => $m['role'] === 'assistant' ? 'model' : 'user', 'parts' => [['text' => $m['content']]]];
            }
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($c['model']) . ':generateContent?key=' . rawurlencode($c['api_key']);
            $j = http_post_json($url, [
                'systemInstruction' => ['parts' => [['text' => $system]]],
                'contents' => $contents, 'generationConfig' => ['maxOutputTokens' => $max],
            ], [], $to);
            return trim($j['candidates'][0]['content']['parts'][0]['text'] ?? '');
    }
    throw new RuntimeException('AI disabled');
}

function rate_limited(array $cfg): bool {
    $limit = (int)($cfg['ai']['rate_limit_per_minute'] ?? 0);
    if ($limit <= 0) return false;
    $dir = rtrim($cfg['storage_path'], '/\\');
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $f = $dir . '/rate_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'x') . '.json';
    $now = time();
    $hits = [];
    if (is_file($f)) $hits = json_decode((string)file_get_contents($f), true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - 60));
    if (count($hits) >= $limit) return true;
    $hits[] = $now;
    @file_put_contents($f, json_encode($hits), LOCK_EX);
    return false;
}

function body(): array {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 2_000_000) out(['error' => 'too large'], 413);
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function clean_name(string $n): string {
    return preg_replace('/[^a-z0-9_\-]/', '', strtolower(trim($n)));
}

// ------------------------------------------------------------------ main
$cfg = cc_config();
$action = $_GET['action'] ?? '';

@mkdir($cfg['storage_path'] . '/sessions', 0775, true);
if (is_dir($cfg['storage_path'] . '/sessions')) session_save_path($cfg['storage_path'] . '/sessions');
session_name('ccsid');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();

try {
    $store = open_store($cfg);
} catch (Throwable $e) {
    if ($action === 'info') {
        // PDO errors can contain host/user details, so only JSON-storage errors are shown, and only in debug mode.
        $detail = ($cfg['debug'] && ($cfg['storage'] ?? 'json') !== 'mysql') ? $e->getMessage() : 'storage unavailable';
        out(['ok' => true, 'storage' => 'ERROR: ' . $detail,
            'ai' => ai_provider($cfg) !== 'none', 'aiProvider' => ai_provider($cfg), 'user' => null,
            'registration' => false, 'php' => PHP_VERSION]);
    }
    out(['error' => 'storage unavailable'], 500);
}

$user = $_SESSION['user'] ?? null;

switch ($action) {
    case 'info':
        $p = ai_provider($cfg);
        out(['ok' => true, 'storage' => $store->label(), 'ai' => $p !== 'none', 'aiProvider' => $p,
            'aiModel' => $p === 'none' ? null : ($cfg['ai'][$p]['model'] ?? null),
            'user' => $user, 'registration' => (bool)$cfg['allow_registration'], 'php' => PHP_VERSION]);

    case 'register':
    case 'login':
        $b = body();
        $name = clean_name($b['name'] ?? '');
        $pw = (string)($b['password'] ?? '');
        if (strlen($name) < 3 || strlen($name) > 32) out(['error' => 'Name must be 3-32 letters/numbers.'], 400);
        if (strlen($pw) < 6) out(['error' => 'Password must be at least 6 characters.'], 400);
        $rec = $store->get('user:' . $name);
        if ($action === 'register') {
            if (!$cfg['allow_registration']) out(['error' => 'Registration is disabled.'], 403);
            if ($rec !== null) out(['error' => 'That name is taken.'], 409);
            $store->set('user:' . $name, json_encode(['hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => time()]));
        } else {
            $u = $rec ? json_decode($rec, true) : null;
            if (!$u || !password_verify($pw, $u['hash'])) out(['error' => 'Wrong name or password.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = $name;
        out(['ok' => true, 'user' => $name]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    case 'load':
        if (!$user) out(['error' => 'not logged in'], 401);
        $s = $store->get('save:' . $user);
        out(['ok' => true, 'save' => $s ? json_decode($s, true) : null]);

    case 'save':
        if (!$user) out(['error' => 'not logged in'], 401);
        $b = body();
        $store->set('save:' . $user, json_encode($b['save'] ?? new stdClass()));
        out(['ok' => true]);

    case 'delete_account':
        if (!$user) out(['error' => 'not logged in'], 401);
        $b = body();
        $u = json_decode((string)$store->get('user:' . $user), true);
        if (!$u || !password_verify((string)($b['password'] ?? ''), $u['hash'])) out(['error' => 'Wrong password.'], 401);
        $store->del('user:' . $user);
        $store->del('save:' . $user);
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    case 'ai':
        if (ai_provider($cfg) === 'none') out(['error' => 'AI not configured'], 503);
        if (rate_limited($cfg)) out(['error' => 'Slow down a little.'], 429);
        $b = body();
        $system = mb_substr((string)($b['system'] ?? ''), 0, 4000);
        $msgs = [];
        foreach (array_slice((array)($b['messages'] ?? []), -12) as $m) {
            $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $msgs[] = ['role' => $role, 'content' => mb_substr((string)($m['content'] ?? ''), 0, 4000)];
        }
        if (!$msgs) out(['error' => 'no messages'], 400);
        try {
            $text = ai_complete($cfg, $system, $msgs);
            out(['ok' => true, 'text' => $text]);
        } catch (Throwable $e) {
            out(['error' => $cfg['debug'] ? $e->getMessage() : 'AI request failed'], 502);
        }

    default:
        out(['error' => 'unknown action'], 404);
}
