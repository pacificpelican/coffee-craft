// Server API + AI helper. The game works fully without the server (static hosting):
// every call here fails soft and the game falls back to local behaviour.
import { esc } from './util.js';

export const server = { available: false, ai: false, aiProvider: 'none', aiModel: null, storage: 'browser localStorage only', user: null, registration: true };

async function call(action, body) {
  const r = await fetch('api.php?action=' + action, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('Server unavailable'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

export async function initServer() {
  try {
    const j = await call('info');
    Object.assign(server, { available: true, ai: j.ai, aiProvider: j.aiProvider, aiModel: j.aiModel, storage: j.storage, user: j.user, registration: j.registration });
  } catch { server.available = false; }
  return server;
}

export const account = {
  async register(name, password) { const j = await call('register', { name, password }); server.user = j.user; return j; },
  async login(name, password) { const j = await call('login', { name, password }); server.user = j.user; return j; },
  async logout() { await call('logout', {}); server.user = null; },
  async remove(password) { await call('delete_account', { password }); server.user = null; },
  async loadSave() { return (await call('load')).save; },
  async saveGame(save) { return call('save', { save }); },
};

// Plain-text AI call. Returns null when AI is unavailable or fails.
export async function aiText(system, messages) {
  if (!server.ai) return null;
  try {
    const j = await call('ai', { system, messages });
    return j.text || null;
  } catch { return null; }
}

// Ask for JSON; tolerant of code fences / chatter around the JSON.
export async function aiJson(system, prompt) {
  const t = await aiText(system + '\nReply with ONLY valid minified JSON.', [{ role: 'user', content: prompt }]);
  if (!t) return null;
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export { esc };
