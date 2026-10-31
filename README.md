# Coffee Craft — *a game of bags and strategy*

A casual, third-person, low-poly open-world web game about running fine coffee shops and restaurants in a damp,
gritty Pacific Northwest international district. Desktop and mobile web. Created by
[Daniel McKeown](https://altaredwood.work).

Everything works with **no AI and no database**: AI is an optional enhancement, and persistence defaults to JSON files.

## Run locally

Requirements: PHP 8+ (only for accounts, saves and the AI proxy). The game itself is static ES modules.

```
php -S localhost:8000
```

Open <http://localhost:8000>. Without PHP (any static server) the game still plays; saves fall back to the browser's localStorage.

## Controls

| Pad / button | Keyboard | Action |
|---|---|---|
| Left pad (8 directions) | WASD / arrows | Move |
| 💬 | `/` | Talk (NPCs, pigeons, raccoons); scooter speed boost |
| 👍 | `.` | Interact / yes / accelerate scooter |
| ⛔ | `,` | No / avoid / brake scooter |
| ▶️ | `'` | Friendly greeting, sit/stand, enter doors, board vehicles, street deals, power-slide |

The ⏸ button opens the pause menu (Settings, screenshot, mute); 📱 opens the phone.

Camera: `Q`/`E` or right-mouse-button drag rotate, mouse wheel zooms; on touch, twist with two fingers to rotate and pinch to zoom. Movement is camera-relative.

## Saving

The game autosaves to the browser (localStorage) every 45 seconds and each game day; **Continue** on the intro screen loads it.
When logged in to an account, the same autosave is also sent to the server, and Settings → Account has **Save to server** / **Load from server** buttons (logging in also offers to load your server save).

## Configuration

Edit `config.php` for defaults, or copy `config.local.php.example` to `config.local.php` (git-ignored) for
machine-specific settings and secrets. `config.local.php` overrides `config.php`.

- **Storage**: `storage` => `json` (default, files in `storage/`) or `mysql` (MySQL/MariaDB; fill in host, name, user, password).
- **AI**: `ai.provider` => `none`, `ollama`, `openai`, `anthropic`, or `gemini`. API keys stay server-side; the browser only calls `api.php?action=ai`.
- The Settings → Debug tab shows the active storage type and whether AI is enabled.

### Ollama (local AI)

1. Install from <https://ollama.com/download>.
2. Pull a small model: `ollama pull llama3.2`
3. Make sure it is running (`ollama serve`, default `http://localhost:11434`).
4. In `config.local.php` set the provider to `ollama` and the model name.

### Cloud providers

Set the provider and its API key in `config.local.php` on the server. Never commit keys.

## Deploying

Upload the project to any PHP host (Apache/nginx + PHP-FPM). Make `storage/` writable by the web user
(it ships with an `.htaccess` denying web access; on nginx deny it in the server config). Add `config.local.php`
on the server. Serve over HTTPS.

## Project layout

- `index.html`, `css/style.css` — UI shell, intro modal, HUD, controller.
- `js/main.js` — boot, game loop, input, interactions, dialogue, camera.
- `js/world.js`, `traffic.js`, `npcs.js`, `actors.js`, `art.js` — city, vehicles/streetcar/weather, people/animals, procedural art.
- `js/economy.js` — businesses, NPC demand, banks, bankruptcy, loans.
- `js/phone.js` — smartphone apps and Settings tabs.
- `js/minigames.js` — pickleball, roaster, espresso, fight.
- `js/audio.js` — generated sound and music.
- `api.php`, `config.php` — backend.
- `data/world.json` — content (businesses, menus, NPCs). `data/mods/index.json` lists optional mod files merged over it.

## Modding

Content is data-driven: add a JSON file to `data/mods/` and list it in `data/mods/index.json`.

## Known simplifications

Venue interiors are modal screens, not walkable 3D rooms.
The hand-to-hand fight mini-game exists but nothing triggers it.
Police response and troublemaker NPCs are minimal.
