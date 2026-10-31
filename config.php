<?php
/**
 * Coffee Craft default configuration (safe to commit - contains no secrets).
 *
 * To customise, copy config.local.php.example to config.local.php (which is
 * git-ignored) and override only the keys you need. Values in config.local.php
 * are merged over these defaults.
 */
return [
    // ---- Storage -------------------------------------------------------
    // 'json'  : plain JSON text files in ./storage (default, zero setup)
    // 'mysql' : MySQL / MariaDB (requires the pdo_mysql PHP extension)
    'storage' => 'json',
    'storage_path' => __DIR__ . '/storage',
    'mysql' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'coffee_craft',
        'user' => 'coffee',
        'password' => '',
    ],

    // ---- AI (optional) ---------------------------------------------------
    // provider: 'none' | 'ollama' | 'openai' | 'anthropic' | 'gemini'
    // 'openai' also works with any OpenAI-compatible API (Groq, OpenRouter,
    // Together, LM Studio, ...) by changing base_url.
    'ai' => [
        'provider' => 'none',
        'ollama' => [
            'base_url' => 'http://127.0.0.1:11434',
            'model' => 'llama3.2',
        ],
        'openai' => [
            'base_url' => 'https://api.openai.com/v1',
            'api_key' => '',
            'model' => 'gpt-4o-mini',
        ],
        'anthropic' => [
            'api_key' => '',
            'model' => 'claude-3-5-haiku-latest',
        ],
        'gemini' => [
            'api_key' => '',
            'model' => 'gemini-1.5-flash',
        ],
        'max_tokens' => 300,
        'timeout' => 25,
        // Simple abuse guard for public deployments: requests per IP per minute.
        'rate_limit_per_minute' => 30,
    ],

    // ---- Misc -------------------------------------------------------------
    // Set false on a public deployment to disable account registration.
    'allow_registration' => true,
    'debug' => false,
];
