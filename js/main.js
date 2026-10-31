// Coffee Craft - main game loop and glue.
import * as THREE from '../vendor/three.module.min.js';
import { DATA, loadData } from './data.js';
import { server, initServer, account, aiText } from './api.js';
import { h, $, rand, pick, clamp, angDiff, money, esc, fmtClock, randInt } from './util.js';
import { LOGO_SVG, foodSVG, svgURI } from './art.js';
import { initAudio, setMuted, isMuted, sfx, setTrance, setChannel } from './audio.js';
import * as eco from './economy.js';
import { buildWorld, groundHeight, INT, BOUNDS } from './world.js';
import { makePlayerModel, animateHuman, makeScooter } from './actors.js';
import { buildTraffic, buildStreetcar, buildEnvironment } from './traffic.js';
import { buildNpcs, nearestOf } from './npcs.js';
import { createPhone } from './phone.js';
import { playPickleball, playRoaster, playEspresso, playFight } from './minigames.js';

const SAVE_KEY = 'coffeecraft.save';
const state = { minutes: 8 * 60, day: 1, weather: 'cloudy', diary: [], contacts: [], chats: {}, news: [], roastsUnlocked: ['light', 'medium', 'dark'], roastTries: 0, owns: {}, buzzed: null };
let world, scene, camera, renderer, env, traffic, tramSys, npcSys, phone, player, playerMesh, clock;
let paused = true, started = false, modalOpen = false, hud;
const input = { x: 0, z: 0, edge: {} };
const keys = new Set();
let scooters = [];
let shake = 0;

$('#intro-logo').innerHTML = LOGO_SVG;

// ----------------------------------------------------------- notifications
function notify(text, opts = {}) {
  const el = h('div', { class: 'notif ' + (opts.kind || '') }, text);
  el.onclick = () => { el.remove(); opts.onclick?.(); };
  $('#notifs').append(el);
  while ($('#notifs').children.length > 4) $('#notifs').firstChild.remove();
  setTimeout(() => el.remove(), opts.ms || 7000);
  if (opts.sound !== false) sfx('chime');
}
const prompt_ = (t) => { const p = $('#prompt'); p.style.display = t ? 'block' : 'none'; if (t) p.textContent = t; };

// ----------------------------------------------------------- game context shared with the phone
const defOf = (id) => DATA.businesses.find((b) => b.id === id);
const tierMult = (b) => eco.PRICE_TIERS[b.tier ?? 1].mult;
const G = {
  state, notify, setPaused: (p) => { paused = p || modalOpen; },
  price: (b, base) => Math.round(base * tierMult(b)),
  menuFor: (b) => (b.generic ? b.newMenu : defOf(b.id)?.menu) || [],
  snapshot: () => ({ state, player: { x: player.x, z: player.z } }),
  aiText,
  restore: (sv) => { Object.assign(state, sv.state); if (sv.player) { player.x = sv.player.x; player.z = sv.player.z; } notify('Game loaded.'); },
  autoPending: () => { for (const d of [...state.bank.decisions]) eco.applyDecision(state, d, eco.heuristic(state, d), 'player', true); },
  npcReply: (name, text) => npcReply({ persona: { name, occupation: 'friend', quirk: '', mood: 'friendly' } }, [{ role: 'user', content: text }], 'chat'),
};

// ----------------------------------------------------------- modal helpers
function openModal(build, onClose) {
  const card = $('#modal-card'); card.replaceChildren();
  build(card);
  $('#modal').classList.remove('hidden'); modalOpen = true; paused = true;
  $('#modal').onclose = onClose;
}
function closeModal() {
  $('#modal').classList.add('hidden'); modalOpen = false; paused = phone.isOpen() || !started;
  const f = $('#modal').onclose; $('#modal').onclose = null; f?.();
}
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

// ----------------------------------------------------------- boot
async function boot() {
  $('#intro-status').textContent = 'Loading…';
  await loadData(); await initServer();
  renderer = new THREE.WebGLRenderer({ canvas: $('#game'), antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.5, 500);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  world = buildWorld(scene, DATA.businesses);
  env = buildEnvironment(scene, renderer);
  traffic = buildTraffic(scene, world);
  tramSys = buildStreetcar(scene, world);
  player = { x: world.spawn.x, z: world.spawn.z, y: 0.2, heading: Math.PI, speed: 0, ride: null, sitting: null, eating: 0, scooter: null };
  playerMesh = makePlayerModel(); scene.add(playerMesh);
  npcSys = buildNpcs(scene, world, 44);
  // scooters
  for (const s of world.scooters) { s.mesh = makeScooter(); s.mesh.position.set(s.x, 0.2, s.z); s.mesh.rotation.y = s.h; scene.add(s.mesh); s.v = 0; }
  scooters = world.scooters;
  eco.createEconomy(state); Object.assign(state, { day: 1 });
  wireEconomy();
  phone = createPhone(G);
  env.onWeather = (w) => { state.weather = w; if (w === 'rain') { setTrance(true, 120); notify('It starts to rain.', { sound: false }); } };
  clock = new THREE.Clock();
  wireInput(); wireCamera(); wireUI();
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) $('#continue').classList.remove('hidden');
  $('#intro-status').textContent = server.available ? `Server: ${server.storage}${server.ai ? ' · AI: ' + server.aiProvider : ' · AI off'}` : 'Static mode (no PHP): saves stay in this browser.';
  renderer.setAnimationLoop(frame);
  window.__cc = { state, get player() { return player; }, world, THREE, scene, camera, eco, G, tram: tramSys.tram, npcSys };
}

function wireEconomy() {
  eco.onEvent((type, e) => {
    if (type === 'news') { state.news.push({ day: state.day, text: e.text }); if (state.news.length > 80) state.news.shift(); if (Math.random() < 0.5) notify('📰 ' + e.text, { kind: 'news', onclick: () => phone.open('news') }); }
    else if (type === 'notify') notify(e.text, { kind: e.kind });
    else if (type === 'decision') notify('🏦 A bank decision awaits: ' + e.text.slice(0, 70) + '…', { kind: 'decision', ms: 12000, onclick: () => phone.open('settings', { tab: 'Bank', bankTab: 'Decisions' }) });
    else if (type === 'day') { saveLocal(); aiNews(); }
  });
}

async function aiNews() {
  if (!server.ai) return;
  const recent = state.news.slice(-4).map((n) => n.text).join(' ');
  const t = await aiText('You write one-sentence, playful, local-news items for a rainy Pacific Northwest international district. No real people.', [{ role: 'user', content: `Day ${state.day}, ${state.weather}. Recent: ${recent}. Write one new short story.` }]);
  if (t) { state.news.push({ day: state.day, text: t.slice(0, 240) }); notify('📰 ' + t.slice(0, 90), { kind: 'news', onclick: () => phone.open('news') }); }
}

// ----------------------------------------------------------- save / load
function saveLocal() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, player: { x: player.x, z: player.z } })); } catch { /* quota */ }
  if (server.user) account.saveGame(G.snapshot()).catch(() => { /* offline: local save still exists */ });
}
function loadLocal() { try { const sv = JSON.parse(localStorage.getItem(SAVE_KEY)); if (sv) { Object.assign(state, sv.state); player.x = sv.player.x; player.z = sv.player.z; return true; } } catch { /* ignore */ } return false; }

// ----------------------------------------------------------- input
function press(k) { input.edge[k] = true; }
function wireInput() {
  const map = { '/': 'talk', '.': 'yes', ',': 'no', "'": 'friendly' };
  addEventListener('keydown', (e) => {
    if (e.target.matches?.('input,textarea,select')) return;
    const k = e.key;
    if (map[k]) { press(map[k]); e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { if (modalOpen) closeModal(); else if (phone.isOpen()) phone.close(); else togglePause(); return; }
    if (k === 'Tab') { e.preventDefault(); phone.isOpen() ? phone.close() : phone.open(); return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    keys.add(k.toLowerCase());
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  // pad
  const pad = $('#pad'); const held = new Set();
  const upd = () => {
    let x = 0, z = 0; for (const d of held) { const [a, b] = d.split(',').map(Number); x += a; z += b; }
    input.padX = clamp(x, -1, 1); input.padZ = clamp(z, -1, 1);
    pad.querySelectorAll('.d[data-d]').forEach((b) => b.classList.toggle('on', held.has(b.dataset.d)));
  };
  // The pad is one touch surface: pointer position selects the direction, diagonals included.
  const fromPoint = (e) => {
    const r = pad.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dz = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    held.clear(); if (Math.hypot(dx, dz) < 0.22) return upd();
    const a = Math.atan2(dz, dx), sx = Math.cos(a), sz = Math.sin(a);
    held.add(`${Math.abs(sx) > 0.38 ? Math.sign(sx) : 0},${Math.abs(sz) > 0.38 ? Math.sign(sz) : 0}`); upd();
  };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); fromPoint(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') fromPoint(e); });
  const end = () => { held.clear(); upd(); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  document.querySelectorAll('.ab').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(b.dataset.k); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120); }));
  // clicking billboards
  const ray = new THREE.Raycaster();
  $('#game').addEventListener('pointerdown', (e) => {
    if (paused || e.button !== 0) return;
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const hit = ray.intersectObjects(world.clickables.map((c) => c.mesh), false)[0];
    if (hit) { const c = world.clickables.find((c) => c.mesh === hit.object); if (c) window.open(c.url, '_blank', 'noopener'); }
  });
}
// Orbit camera: yaw (radians) and zoom multiplier; walking input is rotated to be camera-relative.
const cam = { yaw: 0, zoom: 1, zoomT: 1 };
const setZoom = (z) => { cam.zoomT = clamp(z, 0.55, 1.8); };
function wireCamera() {
  const el = $('#game'); const pts = new Map();
  el.addEventListener('wheel', (e) => { if (paused) return; e.preventDefault(); setZoom(cam.zoomT * (e.deltaY > 0 ? 1.1 : 0.9)); }, { passive: false });
  const two = () => { const [a, b] = [...pts.values()]; return { ang: Math.atan2(b.y - a.y, b.x - a.x), dist: Math.hypot(b.x - a.x, b.y - a.y) }; };
  let last = null, drag = null;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 2) { drag = e.clientX; el.setPointerCapture(e.pointerId); return; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = pts.size === 2 ? two() : null;
  });
  el.addEventListener('pointermove', (e) => {
    if (drag !== null) { if (!paused) cam.yaw -= (e.clientX - drag) * 0.008; drag = e.clientX; return; }
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2 || paused) return;
    const n = two(); if (last) { cam.yaw -= angDiff(0, n.ang - last.ang); if (last.dist > 10) setZoom(cam.zoomT * last.dist / n.dist); } last = n;
  });
  const up = (e) => { pts.delete(e.pointerId); last = null; if (e.button === 2) drag = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function readMove() {
  let x = 0, z = 0;
  if (keys.has('arrowleft') || keys.has('a')) x -= 1; if (keys.has('arrowright') || keys.has('d')) x += 1;
  if (keys.has('arrowup') || keys.has('w')) z -= 1; if (keys.has('arrowdown') || keys.has('s')) z += 1;
  x += input.padX || 0; z += input.padZ || 0;
  const m = Math.hypot(x, z); return m > 1 ? { x: x / m, z: z / m } : { x, z };
}

function toggleMute() { setMuted(!isMuted()); $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊'; }
function togglePause() {
  if (!started) return;
  const p = $('#pause'); const show = p.classList.contains('hidden');
  p.classList.toggle('hidden', !show); paused = show || modalOpen || phone.isOpen();
}

function wireUI() {
  $('#play').onclick = () => start(false);
  $('#continue').onclick = () => start(true);
  $('#btn-pause').onclick = togglePause; $('#btn-mute').onclick = toggleMute;
  $('#btn-phone').onclick = () => (phone.isOpen() ? phone.close() : phone.open());
  $('#p-resume').onclick = togglePause;
  $('#p-settings').onclick = () => { togglePause(); phone.open('settings'); };
  $('#p-shot').onclick = takeShot;
}
function start(cont) {
  initAudio(); $('#intro').classList.add('hidden'); $('#hud').classList.remove('hidden');
  if (cont) loadLocal();
  started = true; paused = false; hud = true;
  notify('Good morning. Your two shops — Moss & Mug and Cyclo Pho & Coffee — are open.', { sound: false, ms: 9000 });
  if (world.scooters.length) notify('Tip: ▶️ near a scooter to ride, near the streetcar stop to board.', { sound: false, ms: 9000 });
}

// ----------------------------------------------------------- screenshots
function takeShot() {
  const box = $('#shot-box'); box.classList.remove('hidden'); box.replaceChildren();
  const shot = (mode) => {
    const r = renderer.domElement;
    let src = r;
    if (mode === 'drone') {
      const save = { p: camera.position.clone(), q: camera.quaternion.clone(), f: camera.fov, fog: scene.fog.far };
      camera.fov = 55; camera.updateProjectionMatrix(); scene.fog.far = 900;
      camera.position.set(player.x, 150, player.z + 40); camera.lookAt(player.x, 0, player.z);
      renderer.render(scene, camera);
      src = document.createElement('canvas'); src.width = r.width; src.height = r.height; src.getContext('2d').drawImage(r, 0, 0);
      camera.position.copy(save.p); camera.quaternion.copy(save.q); camera.fov = save.f; camera.updateProjectionMatrix(); scene.fog.far = save.fog;
    } else renderer.render(scene, camera);
    const c = document.createElement('canvas'); const bar = 34; c.width = r.width; c.height = r.height + bar;
    const g = c.getContext('2d');
    if (mode === 'bw') g.filter = 'grayscale(1) contrast(1.15)';
    g.drawImage(src, 0, 0); g.filter = 'none';
    g.fillStyle = '#23291f'; g.fillRect(0, r.height, c.width, bar);
    g.fillStyle = '#efe6cc'; g.font = `${Math.max(12, Math.round(c.width / 62))}px Georgia, serif`; g.textBaseline = 'middle';
    g.fillText(`Coffee Craft by Daniel McKeown https://altaredwood.work — ${new Date().toLocaleString()}`, 10, r.height + bar / 2);
    box.replaceChildren(c, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { const a = document.createElement('a'); a.download = `Coffee_Craft_${new Date().toISOString().replace(/[:.]/g, '-')}.png`; a.href = c.toDataURL('image/png'); a.click(); } }, '💾 Save'), ...shotButtons()));
  };
  const shotButtons = () => [state.owns.drone && h('button', { class: 'btn alt', onclick: () => shot('drone') }, '🚁 Drone view'), state.owns.camera && h('button', { class: 'btn alt', onclick: () => shot('bw') }, '📷 Vintage B&W')];
  shot('normal');
}

// ----------------------------------------------------------- interactions
function nearbyTargets() {
  const out = [];
  if (player.inside) return out;
  for (const d of world.doors) { const dd = Math.hypot(d.x - player.x, d.z - player.z); if (dd < (d.r || 2.6) + 0.6) out.push({ kind: 'door', d, dist: dd, label: 'Enter ' + d.label }); }
  for (const s of scooters) { if (s.riding) continue; const dd = Math.hypot(s.x - player.x, s.z - player.z); if (dd < 2.4) out.push({ kind: 'scooter', s, dist: dd, label: 'Ride scooter' }); }
  for (const it of world.interactables) {
    if (!it.r) continue; const dd = Math.hypot(it.x - player.x, it.z - player.z);
    if (dd < it.r + 0.6) out.push({ kind: it.type, it, dist: dd, label: it.type === 'bench' ? (player.sitting ? 'Stand up' : 'Sit') : it.type === 'court' ? 'Play pickleball' : it.type === 'poster' ? 'Open sf3am.com' : it.type === 'tramstop' ? (tramSys.tram.atStop && tramSys.tram.dwell > 0 ? 'Board streetcar' : 'Streetcar stop — wait for it') : it.label });
  }
  return out.sort((a, b) => a.dist - b.dist);
}
const npcNear = (r = 3.2) => nearestOf([...npcSys.list.filter((n) => n.state !== 'inside'), ...npcSys.animals], player.x, player.z, r);

function handleActions() {
  const e = input.edge; input.edge = {};
  if (player.ride === 'tram') { if (e.friendly || e.yes) alightTram(); return; }
  if (player.scooter) return scooterActions(e);
  const t = nearbyTargets()[0];
  if (e.friendly) {
    if (player.sitting) { standUp(); return; }
    if (t) return activate(t);
    const n = npcNear(8); if (n && !n.isAnimal) { greet(n); return; }
    notify('You nod at the street. The street nods back.', { sound: false, ms: 2500 });
  }
  if (e.yes) { if (t && ['court', 'poster', 'bench'].includes(t.kind)) return activate(t); const n = npcNear(); if (n) return startDialogue(n); if (t) return activate(t); }
  if (e.talk) { const n = npcNear(4); if (n) startDialogue(n); else notify('No one close enough to talk to.', { sound: false, ms: 2000 }); }
  if (e.no) { const n = npcNear(10); if (n && !n.isAnimal) { notify(`You: "Watch it!" ${n.persona.name} looks mildly offended.`, { sound: false }); state.rep = clamp(state.rep - 0.4, 0, 100); n.rel = (n.rel || 0) - 1; } else { notify('You mutter at the weather.', { sound: false, ms: 2000 }); } sfx('squawk'); }
}
function greet(n) {
  const lines = ['"Hi there!"', '"Beautiful day. Well — dry-ish."', '"Love this neighborhood."'];
  notify(`You: ${pick(lines)} — ${n.persona.name} waves back.`, { sound: false }); n.rel = (n.rel || 0) + 1;
}
function activate(t) {
  if (t.kind === 'door') return enterVenue(t.d);
  if (t.kind === 'scooter') { player.scooter = t.s; t.s.riding = true; player.heading = t.s.h; sfx('scooterOn'); notify('Scooter: 👍 go · ⛔ brake · 💬 boost · ▶️ slide / get off', { sound: false, ms: 5000 }); return; }
  if (t.kind === 'bench') { if (player.sitting) standUp(); else { player.sitting = t.it; player.x = t.it.x; player.z = t.it.z; player.y = t.it.y || groundHeight(world, t.it.x, t.it.z); player.heading = t.it.rot ?? 0; } return; }
  if (t.kind === 'poster') return window.open(t.it.url, '_blank', 'noopener');
  if (t.kind === 'court') return openModal((c) => playPickleball(c, G_mini(), closeModal));
  if (t.kind === 'tramstop') return boardTram();
}
const standUp = () => { player.sitting = null; };
function boardTram() {
  const tr = tramSys.tram;
  if (!(tr.atStop && tr.dwell > 0)) return notify('The streetcar is not here yet.', { sound: false, ms: 2500 });
  if (Math.hypot(tr.atStop.sx - player.x, tr.atStop.sz - player.z) > 8) return notify('Get closer to the stop.', { sound: false });
  player.ride = 'tram'; sfx('bell'); notify(`All aboard! ▶️ to get off at any stop. Next: ${tr.stops[tr.nextIdx].name}`, { sound: false });
}
function alightTram() {
  const tr = tramSys.tram; if (!(tr.atStop && tr.dwell > 0)) return notify('Wait for the next stop.', { sound: false, ms: 2000 });
  player.ride = null; player.x = tr.atStop.sx; player.z = tr.atStop.sz; sfx('door');
}
function scooterActions(e) {
  const s = player.scooter;
  if (e.yes) s.thr = 1.2; if (e.no) s.v *= 0.3; if (e.talk) { s.v = Math.max(s.v, 12); sfx('scooterOn'); }
  if (e.friendly) { if (Math.abs(s.v) < 1.5) { player.scooter = null; s.riding = false; player.x = s.x + 1.4; player.z = s.z; sfx('scooterOff'); } else { s.slide = 0.5; } }
}
const G_mini = () => ({ state, notify, sfx, aiText, server, npcReply, money, eco, DATA, closeModal, price: G.price, unlockRoast, h, foodSVG, svgURI, pickRoast: pickRoastStyles });

// ----------------------------------------------------------- dialogue
const OFFLINE = {
  cheerful: ['Oh, lovely to see someone friendly out here!', 'You know, this coffee weather is the best weather.'],
  tired: ['Long shift. I need caffeine and a bench.', 'Mm. Sorry, I’m a little fried today.'],
  curious: ['Have you tried the new place around the corner? Everyone is talking about it.', 'Do you run one of those shops? I always wonder how they do it.'],
  grumpy: ['Prices keep going up. Everything does.', 'Hmph. Rain again.'],
  dreamy: ['I was just watching the clouds drift over the old tower.', 'Do you ever read by the window with the rain on it? That is the life.'],
  chatty: ['Oh, did you hear about the whale mural? Somebody touched up the tail!', 'My cousin says the streetcar is the best way to see the whole neighborhood.'],
};
async function npcReply(n, msgs, ctx = 'street') {
  const p = n.persona;
  if (n.isAnimal) return n.kind === 'raccoon' ? '*chitters, clutching a pizza crust*' : n.kind === 'dog' ? '*wags enthusiastically*' : '*coos and eyes your pockets*';
  const sys = `You are ${p.name}, ${p.occupation}, in a game set in a rainy, gritty Pacific Northwest international district. Personality: ${p.quirk || p.bio || 'friendly'}. Mood: ${p.mood}. ${n.persona.bio ? 'Bio: ' + n.persona.bio : ''} Weather: ${state.weather}. Reply in 1-2 short sentences, in character, no stage directions. The player runs coffee shops.`;
  const ai = await aiText(sys, msgs.slice(-8));
  n.aiReply = !!ai;
  if (ai) return ai.replace(/\s+/g, ' ').slice(0, 300);
  if (p.name === 'Dan') return pick(['Pickle says hi. Well, he screams hi.', 'Green parrot, big opinions. You get used to it.']);
  if (p.name === 'Jes') return pick(['Bluebell loves pink. So do I, obviously.', 'Isn’t the light nice through all this cloud?']);
  if (p.name === 'Sifu Wen') return pick(['The rain does not hurry, yet the gutters fill.', 'Drink your tea. The mat will wait.', 'A calm mind reads the kick before it leaves the hip.']);
  if (n.kind === 'spartan') return pick(['THIS. IS. A REALLY GOOD SCONE.', 'I fight only in the rain. Tonight, I eat noodles.']);
  if (n.kind === 'dealer') return pick(['…keep your voice down.', 'Quiet night. Interested, or just looking?']);
  return pick(OFFLINE[p.mood] || OFFLINE.cheerful);
}
function startDialogue(n) {
  const log = []; const p = n.persona;
  sfx('click');
  openModal((card) => {
    const box = h('div'); const inp = h('input', { placeholder: 'Say something…', style: 'width:65%' });
    const add = (who, text, ai) => { log.push({ who, text }); box.append(h('div', { class: 'say' + (who === 'You' ? ' me' : '') }, h('b', {}, who + ': '), text, ai ? h('span', { class: 'small', title: 'Written by the AI', style: 'margin-left:6px;opacity:.7' }, '✨AI') : '')); box.scrollTop = box.scrollHeight; };
    const send = async (text) => {
      if (!text) return; inp.value = ''; add('You', text); n.rel = (n.rel || 0) + 1;
      const r = await npcReply(n, log.map((l) => ({ role: l.who === 'You' ? 'user' : 'assistant', content: l.text })), 'street'); add(p.name, r, n.aiReply);
      if (!n.isAnimal && n.kind !== 'dealer' && n.rel >= 3 && !n.offered && !state.contacts.includes(p.name) && Math.random() < 0.6) { n.offered = true; offerNumbers(card, n, add); }
    };
    card.append(h('h3', {}, `${n.isAnimal ? '' : '💬 '}${p.name}`), h('div', { class: 'small' }, `${p.occupation}${p.mood ? ' · ' + p.mood : ''}`), box, inp,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => send(inp.value) }, 'Say'), h('button', { class: 'btn alt', onclick: () => send('Hi! How is your day?') }, 'Chat'), h('button', { class: 'btn alt', onclick: () => send('Know any good places to eat?') }, 'Ask for tips'),
        h('button', { class: 'btn', title: 'Export PDF', onclick: () => exportPdf(n, log) }, '🖨'), h('button', { class: 'btn warn', onclick: closeModal }, 'Walk away')));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(inp.value); e.stopPropagation(); });
    if (n.kind === 'dealer') card.append(dealerMenu());
    npcReply(n, [{ role: 'user', content: 'Hello!' }]).then((r) => add(p.name, r, n.aiReply));
  }, () => { n.state = 'walk'; });
  if (!n.isAnimal) { n.state = 'chat'; n.chatT = 999; }
}
function offerNumbers(card, n, add) {
  const row = h('div', { class: 'say' }, `${n.persona.name} asks: “Want to exchange numbers?” `, h('button', { class: 'btn alt', onclick: () => { state.contacts.push(n.persona.name); (state.chats[n.persona.name] ||= []).push({ text: 'Good talking to you! ☕' }); row.textContent = 'Numbers exchanged! Check Chat on your phone.'; sfx('chime'); } }, '👍 Sure'), h('button', { class: 'btn', onclick: () => row.remove() }, '⛔ No thanks'));
  card.insertBefore(row, card.querySelector('input'));
}
function exportPdf(n, log) {
  const sheet = $('#print-sheet'); const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renderer.render(scene, camera);
  sheet.replaceChildren(h('div', { style: 'text-align:center' }, h('div', { html: LOGO_SVG, style: 'width:90px;margin:auto' }), h('h1', {}, 'Coffee Craft')),
    h('p', {}, `Conversation with ${n.persona.name} (${n.persona.occupation}) — ${new Date().toLocaleString()} — Day ${state.day}, ${fmtClock(state.minutes)}, ${state.weather}.`),
    h('img', { src: renderer.domElement.toDataURL('image/jpeg', 0.7), style: 'width:100%;max-height:260px;object-fit:cover' }),
    ...log.map((l) => h('p', {}, h('b', {}, l.who + ': '), l.text)), h('p', { style: 'margin-top:30px;font-size:12px' }, 'Coffee Craft by Daniel McKeown — https://altaredwood.work'));
  const t = document.title; document.title = `Coffee_Craft__conversation_${stamp}`;
  setTimeout(() => { window.print(); document.title = t; }, 100);
}

// ----------------------------------------------------------- street dealers
function dealerMenu() {
  const buy = (what, cost) => () => {
    if (state.bank.cash < cost) return notify('Not enough funds.');
    state.bank.cash -= cost; state.scrutiny += 3; sfx('rustle');
    state.buzzed = { type: what, until: state.minutes + 90 }; notify(what === 'booze' ? 'You feel wobbly…' : 'Meh. It hits sideways. You wobble.', { sound: false });
  };
  return h('div', { class: 'bizcard' }, h('b', {}, 'Street deal (▶️)'), h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: buy('booze', 20) }, 'Sketchy booze $20'), h('button', { class: 'btn warn', onclick: buy('street', 15) }, 'Street weed $15')));
}

// ----------------------------------------------------------- venues
function unlockRoast() { const nxt = DATA.roastStyles.find((r) => !state.roastsUnlocked.includes(r.id) && state.roastTries >= r.need); if (nxt) { state.roastsUnlocked.push(nxt.id); notify(`New roast style unlocked: ${nxt.name}!`); return nxt; } return null; }
function pickRoastStyles() { return DATA.roastStyles.filter((r) => state.roastsUnlocked.includes(r.id)); }

function consume(b, item, price) {
  if (state.bank.cash < price) { notify('Your bank balance is too low.'); return false; }
  state.bank.cash -= price; sfx(item[2] === 'beer' ? 'sip' : 'eat');
  if (!state.diary.some((d) => d.name === item[0])) state.diary.push({ name: item[0], kind: item[2], where: b.name, day: state.day });
  state.points += 2;
  player.eating = 2.2; notify(`😋 You enjoy the ${item[0]}.`, { sound: false });
  if (item[2] === 'beer') state.buzzed = { type: 'booze', until: state.minutes + 60 };
  return true;
}
function foodModal(b, item) {
  const price = G.price(b, item[1]);
  openModal((c) => c.append(h('h3', {}, item[0]), h('img', { src: svgURI(foodSVG(item[2] || 'platter')), style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, item[3] || ''),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (consume(b, item, price)) closeModal(); } }, `👍 Buy ${money(price)}`), h('button', { class: 'btn warn', onclick: () => enterVenueById(b.id) }, '⛔ Back'))));
}
function enterVenueById(id) { const d = world.doors.find((x) => x.bizId === id); if (d) enterVenue(d); }

// ----------------------------------------------------------- martial arts studio (behind Eastgate Apartments)
const BELTS = ['White', 'Yellow', 'Green', 'Brown', 'Black'], DOJO_FEE = 40;
const dojoState = () => (state.dojo ||= { wins: 0, sessions: 0 });
const beltOf = () => Math.min(4, Math.floor(dojoState().wins / 2));
const sifu = { persona: { name: 'Sifu Wen', occupation: 'martial arts guru', quirk: 'serene, speaks in short calm proverbs, loves tea and rain, dry humor', mood: 'serene' }, kind: 'guru' };
function enterDojo() {
  sfx('door');
  const hour = Math.floor(state.minutes / 60) % 24;
  if (hour >= 23 || hour < 6) { closeModal(); return notify('The dojo lantern is dark. Sifu Wen teaches 6:00–23:00.', { sound: false }); }
  const dj = dojoState(), belt = beltOf();
  openModal((c) => {
    c.append(h('h3', {}, 'Cedar Crane Dojo'), h('div', { class: 'small' }, `Your belt: ${BELTS[belt]} · sparring wins ${dj.wins}`),
      h('p', {}, 'Tatami mats, a rack of bamboo swords, rain ticking on the skylight. Sifu Wen, small and serene in a faded black gi, looks up from her tea.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => {
          if (state.bank.cash < DOJO_FEE) return notify('Not enough funds for a lesson.');
          state.bank.cash -= DOJO_FEE; dj.sessions++; sfx('coin');
          openModal((cc) => playFight(cc, G_mini(), enterDojo, {
            foe: 'Sifu Wen', spar: true, level: belt, skill: belt, title: '🥋 Sparring with Sifu Wen',
            onEnd: (won) => { if (!won) return; dj.wins++; state.points += 3; const nb = beltOf(); if (nb > belt) notify(`🥋 Sifu Wen ties a ${BELTS[nb]} belt around your waist.`); },
          }));
        } }, `🥋 Spar with Sifu Wen ($${DOJO_FEE})`),
        h('button', { class: 'btn alt', onclick: () => startDialogue(sifu) }, '💬 Talk to Sifu Wen'),
        h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
  });
}

function enterVenue(d) {
  if (d.special === 'dojo') return enterDojo();
  const b = state.businesses[d.bizId]; const def = defOf(d.bizId) || {};
  if (!b) return;
  const hour = Math.floor(state.minutes / 60) % 24;
  const open = d.bizId === 'station' || def.public ? true : eco.hoursOpen(b, hour);
  sfx('door');
  if (b.state !== 'open' && d.bizId !== 'station') return notify(`${b.name} is ${b.state}.`, { sound: false });
  if (!open && b.type !== 'hotel') return notify(`${b.name} is closed. Hours ${b.hours[0]}:00–${b.hours[1]}:00.`, { sound: false });
  if (b.owner === 'player' && b.type === 'coffee' || b.owner === 'player' && b.type === 'restaurant') { b.totalVisitors++; }
  const t = b.type;
  openModal((c) => {
    c.append(h('h3', {}, b.name), h('div', { class: 'small' }, `${b.style ? b.style + ' · ' : ''}${b.owner === 'player' ? 'Yours' : ''} · rep ${Math.round(b.reputation)} · buzz ${Math.round(b.buzz)}`));
    const menu = G.menuFor(b);
    if (['coffee', 'restaurant', 'donut', 'pub'].includes(t) && menu.length) {
      c.append(h('p', { class: 'small' }, 'You take a seat. Tap an item to look at it.'), h('div', { class: 'menu-items' }, ...menu.map((it) => h('div', { class: 'menu-item', onclick: () => foodModal(b, it) }, h('img', { src: svgURI(foodSVG(it[2] || 'platter')), alt: '' }), h('b', {}, it[0]), h('div', {}, money(G.price(b, it[1])))))));
    }
    if (def.items) {
      c.append(h('div', { class: 'menu-items' }, ...def.items.map((it) => h('div', { class: 'menu-item', onclick: () => buyItem(b, it) }, h('img', { src: svgURI(foodSVG(it[2] || 'platter')) }), h('b', {}, it[0]), h('div', {}, money(it[1]))))));
    }
    if (t === 'lab') c.append(h('p', {}, 'Roasters, espresso machines, a smell of burnt sugar.'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => openModal((cc) => playRoaster(cc, G_mini(), closeModal)) }, '🔥 Use roaster'), h('button', { class: 'btn alt', onclick: () => openModal((cc) => playEspresso(cc, G_mini(), closeModal)) }, '☕ Espresso machine')));
    if (t === 'hotel') c.append(h('p', {}, '“Welcome to Hotel Bogey. Need a room?” the front desk person asks. On the wall: an ink-and-watercolor bird.'), h('img', { src: 'assets/art/art1.jpg', style: 'width:100%;max-height:160px;object-fit:cover;border-radius:10px' }), h('button', { class: 'btn', onclick: () => sleep(b) }, `🛏 Check in & sleep ($${Math.round(120 * 1)})`));
    if (t === 'library') c.append(h('p', {}, 'The shelf is nearly bare. One book: ', h('b', {}, 'Kusamakura (草枕)'), ' by Natsume Sōseki.'), h('blockquote', {}, '山路を登りながら、こう考えた。智に働けば角が立つ。情に棹させば流される。意地を通せば窮屈だ。とかくに人の世は住みにくい。'), h('p', { class: 'small' }, '“Climbing a mountain path, I thought: approach everything with your head and you grow rigid; pole along on your feelings and you’ll be swept away; insist on your own will and the world grows cramped. It is hard to live in this world.” (paraphrase)'), h('img', { src: 'assets/art/art9.jpg', style: 'width:100%;max-height:160px;object-fit:cover' }));
    if (t === 'bank') c.append(h('p', {}, b.bank === 'player' ? 'Your bank. Open Settings → Bank for details.' : 'An independent bank. Its loan officers decide who stays open.'), b.bank === 'player' ? h('button', { class: 'btn', onclick: () => { closeModal(); phone.open('settings', { tab: 'Bank' }); } }, 'Open Bank tab') : '');
    if (t === 'station') c.append(h('p', {}, 'A vaulted hall, pigeons, and the sound of rain on the roof. The streetcar stops just outside.'), h('p', { class: 'small' }, 'Stops: ' + tramSys.tram.stops.map((s) => s.name).join(' → ')));
    if (b.owner === 'player') c.append(h('p', {}, 'Today ', h('b', {}, money(b.dayRevenue)), ` · visitors ${b.dayVisitors}`), h('button', { class: 'btn alt', onclick: () => { closeModal(); phone.open('settings', { tab: 'Business' }); } }, 'Manage business'));
    c.append(h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
  });
}
function buyItem(b, it) {
  if (state.bank.cash < it[1]) return notify('Not enough funds.');
  if (it[2] === 'drone' || it[2] === 'camera') { if (state.owns[it[2]]) return notify('You already own that.'); state.owns[it[2]] = true; notify(it[2] === 'drone' ? '🚁 Drone owned: new screenshot option!' : '📷 Vintage camera: B&W screenshots!'); }
  state.bank.cash -= it[1]; sfx('coin');
  if (it[2] === 'weed_good') { state.buzzed = { type: 'good', until: state.minutes + 120 }; notify('Colors look… a little weird.', { sound: false }); }
  else if (!state.owns[it[2]]) notify(`Bought ${it[0]}.`, { sound: false });
}
function sleep(b) {
  if (state.bank.cash < 120) return notify('Not enough funds.');
  state.bank.cash -= 120; closeModal();
  const f = h('div', { style: 'position:fixed;inset:0;background:#000;z-index:50;transition:opacity 1s;opacity:0' }); document.body.append(f);
  requestAnimationFrame(() => { f.style.opacity = 1; });
  setTimeout(() => {
    const target = Math.ceil((state.minutes + 1) / 1440) * 1440 + 7 * 60; const d = target - state.minutes;
    for (let i = 0; i < d; i += 30) { eco.advance(state, 30); state.day = Math.floor(state.minutes / 1440) + 1; }
    state.buzzed = null; f.style.opacity = 0; setTimeout(() => f.remove(), 1000); notify('You slept it off. Morning light, grey as ever.');
  }, 1100);
}

// ----------------------------------------------------------- frame
let t = 0, saveT = 0, msgT = 60;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  if (!started) { camera.position.set(Math.sin(t * 0.1) * 40, 25, 40); camera.lookAt(0, 3, 0); env.update(dt, state.minutes, camera.position, world.lamps, world.nightGlow); renderer.render(scene, camera); return; }
  if (!paused) { tick(dt); } else input.edge = {};
  const mood = state.buzzed && state.minutes < state.buzzed.until ? state.buzzed.type : null;
  if (!mood) state.buzzed = null;
  const cv = $('#game'); cv.style.filter = mood === 'good' ? 'hue-rotate(40deg) saturate(1.6)' : '';
  if (mood && mood !== 'good') { shake = Math.sin(t * 2) * 0.6; }
  renderer.render(scene, camera);
}

function tick(dt) {
  state.day = Math.floor(state.minutes / 1440) + 1;
  eco.advance(state, dt * 2);
  state.weather = env.weather;
  env.update(dt, state.minutes, camera.position, world.lamps, world.nightGlow);
  if (world.flame) world.flame.scale.y = 0.8 + Math.sin(t * 11) * 0.2;
  traffic.update(dt); tramSys.update(dt);
  npcSys.update(dt, t, player, env, state.minutes);
  handleActions();
  movePlayer(dt);
  // prompt
  const tg = nearbyTargets()[0]; const n = npcNear(3.2);
  prompt_(player.ride === 'tram' ? '▶️ get off at a stop' : player.scooter ? '' : tg ? `▶️ ${tg.label}` : n ? `💬 Talk to ${n.persona.name}` : '');
  // rain sfx & night traffic hum skipped; random chats
  msgT -= dt; if (msgT <= 0) { msgT = rand(80, 160); contactMessage(); }
  saveT += dt; if (saveT > 45) { saveT = 0; saveLocal(); }
  if (eco.needsBailout(state) && !state.bailNudged) { state.bailNudged = true; notify('🆘 Funds are low. A bailout is available in Settings → Stats.', { kind: 'decision', onclick: () => phone.open('settings', { tab: 'Stats' }) }); }
}

async function contactMessage() {
  if (!state.contacts.length) return;
  const name = pick(state.contacts);
  const text = server.ai ? (await npcReply({ persona: { name, occupation: 'friend', mood: 'friendly' } }, [{ role: 'user', content: 'Send a short friendly text message to the player about your day.' }], 'chat')) : pick(['Rain again! Coffee later?', 'Saw the streetcar get stuck behind a delivery truck 😂', 'Just heard a rumor about a new ramen place.']);
  (state.chats[name] ||= []).push({ text });
  notify(`💬 ${name}: ${text.slice(0, 60)}`, { kind: 'chat', onclick: () => phone.open('chat', { chat: name }) });
}

function collide(x, z, y, r) {
  for (const c of world.colliders) {
    if (y >= c.top - 0.6) continue;
    const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1); let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
    else { const l = x - c.x0, rr = c.x1 - x, tp = z - c.z0, bt = c.z1 - z; const m = Math.min(l, rr, tp, bt); if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === tp) z = c.z0 - r; else z = c.z1 + r; }
  }
  return [x, z];
}

function movePlayer(dt) {
  const mv = readMove();
  const wob = state.buzzed && state.minutes < state.buzzed.until && state.buzzed.type !== 'good';
  if (player.eating > 0) player.eating -= dt;
  if (player.ride === 'tram') {
    const p = tramSys.tram.pos; player.x = p.x; player.z = p.z; player.y = 0.9; player.speed = 0;
  } else if (player.scooter) {
    const s = player.scooter;
    s.thr = (s.thr || 0) - dt * 0.6; const acc = s.thr > 0 ? 9 : 0;
    s.v = clamp(s.v + acc * dt - 2.2 * dt * Math.sign(s.v) * 0.5 - s.v * 0.35 * dt, -2, 14);
    const steer = clamp(mv.x, -1, 1); const slide = s.slide > 0 ? 2.2 : 1; s.slide = Math.max(0, (s.slide || 0) - dt);
    player.heading -= steer * dt * 2.0 * slide * clamp(Math.abs(s.v) / 5, 0.2, 1);
    if (mv.z < -0.5) s.thr = Math.max(s.thr, 0.3); if (mv.z > 0.5) s.v *= 1 - dt * 3;
    let nx = player.x + Math.sin(player.heading) * s.v * dt, nz = player.z + Math.cos(player.heading) * s.v * dt;
    [nx, nz] = collide(nx, nz, player.y, 0.7); if (Math.hypot(nx - player.x - Math.sin(player.heading) * s.v * dt, nz - player.z - Math.cos(player.heading) * s.v * dt) > 0.05) s.v *= 0.5;
    player.x = clamp(nx, BOUNDS.x0, BOUNDS.x1); player.z = clamp(nz, BOUNDS.z0, BOUNDS.z1); player.y = groundHeight(world, player.x, player.z);
    s.x = player.x; s.z = player.z; s.h = player.heading; s.mesh.position.set(s.x, player.y, s.z); s.mesh.rotation.y = s.h; player.speed = Math.abs(s.v) * 0.2;
  } else if (!player.sitting) {
    const spd = (wob ? 2.6 : 4) * (player.eating > 0 ? 0.3 : 1);
    const yc = Math.cos(cam.yaw), ys = Math.sin(cam.yaw);
    let ax = mv.x * yc + mv.z * ys, az = -mv.x * ys + mv.z * yc; if (wob) { ax += Math.sin(t * 2.3) * 0.35; az += Math.cos(t * 1.7) * 0.35; }
    const m = Math.hypot(ax, az); player.speed = m > 0.1 ? spd : 0;
    if (m > 0.1) {
      let nx = player.x + (ax / Math.max(1, m)) * spd * dt, nz = player.z + (az / Math.max(1, m)) * spd * dt;
      [nx, nz] = collide(nx, nz, player.y, 0.45);
      player.x = clamp(nx, BOUNDS.x0, BOUNDS.x1); player.z = clamp(nz, BOUNDS.z0, BOUNDS.z1);
      player.heading += angDiff(player.heading, Math.atan2(ax, az)) * Math.min(1, dt * 12);
    }
    player.y = groundHeight(world, player.x, player.z);
  }
  playerMesh.position.set(player.x, player.y + (player.scooter ? 0.35 : 0), player.z); playerMesh.rotation.y = player.heading;
  playerMesh.rotation.x = player.eating > 0 ? Math.sin(t * 8) * 0.06 : 0;
  animateHuman(playerMesh, player.scooter || player.ride ? 0 : player.speed, t, !!player.sitting || !!player.scooter || player.ride === 'tram');
  const spin = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
  if (spin) cam.yaw += spin * dt * 1.8;
  cam.zoom += (cam.zoomT - cam.zoom) * Math.min(1, dt * 8);
  const sy = Math.sin(cam.yaw), cyw = Math.cos(cam.yaw);
  const cx = player.x + sy * 17 * cam.zoom + (shake ? shake : 0), cy = player.y + 17 * cam.zoom, cz = player.z + cyw * 17 * cam.zoom;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6)); camera.lookAt(player.x - sy, player.y + 1.2, player.z - cyw);
  cutaway(dt);
}

// Buildings between the camera and the player sink to a low cutaway so the player stays visible.
const bList = [];
function cutaway(dt) {
  if (!bList.length) for (const b of Object.values(world.buildings)) if (b.group) bList.push(b);
  const a = camera.position, p = { x: player.x, y: player.y + 1.5, z: player.z };
  for (const b of bList) {
    let t0 = 0, t1 = 1, hit = true;
    for (const [o, d, lo, hi] of [[a.x, p.x - a.x, b.x - b.w / 2 - 0.5, b.x + b.w / 2 + 0.5], [a.y, p.y - a.y, 0, b.h + 1], [a.z, p.z - a.z, b.z - b.d / 2 - 0.5, b.z + b.d / 2 + 0.5]]) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { hit = false; break; } continue; }
      let n = (lo - o) / d, f = (hi - o) / d; if (n > f) [n, f] = [f, n];
      t0 = Math.max(t0, n); t1 = Math.min(t1, f); if (t0 > t1) { hit = false; break; }
    }
    const target = hit ? 0.04 : 1; const g = b.group;
    if (Math.abs(g.scale.y - target) > 0.002) g.scale.y += (target - g.scale.y) * Math.min(1, dt * 8);
  }
}

boot().catch((e) => { console.error(e); $('#intro-status').textContent = 'Failed to start: ' + e.message; });
