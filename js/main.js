// Coffee Craft - main game loop and glue.
import * as THREE from '../vendor/three.module.min.js';
import { DATA, loadData } from './data.js';
import { server, initServer, account, aiText, aiJson } from './api.js';
import { h, $, rand, pick, clamp, angDiff, money, esc, fmtClock, randInt } from './util.js';
import { stockFor, crystalStock } from './stock.js';
import { LOGO_SVG, foodSVG, svgURI, BAG_MOTIFS, kindFor, sanitizeSVG } from './art.js';
import { initAudio, setMuted, isMuted, sfx, setTrance, setChannel, lockChannel, unlockChannel } from './audio.js';
import * as eco from './economy.js';
import { buildWorld, groundHeight, INT, BOUNDS } from './world.js';
import { makePlayerModel, makeDudeModel, animateHuman, makeScooter } from './actors.js';
import { buildTraffic, buildStreetcar, buildEnvironment } from './traffic.js';
import { buildNpcs, nearestOf } from './npcs.js';
import { buildRideshare } from './rideshare.js';
import { createPhone } from './phone.js';
import { playPickleball, playRoaster, playEspresso, playFight } from './minigames.js';

const SAVE_KEY = 'coffeecraft.save';
const state = { minutes: 8 * 60, day: 1, weather: 'cloudy', diary: [], contacts: [], chats: {}, news: [], roastsUnlocked: ['light', 'medium', 'dark'], roastTries: 0, owns: {}, buzzed: null };
let world, scene, camera, renderer, env, traffic, tramSys, rideshare, npcSys, phone, player, playerMesh, clock;
let paused = true, started = false, modalOpen = false, hud;
const input = { x: 0, z: 0, edge: {} };
const keys = new Set();
let scooters = [];
let cs = null; // Car Stealer: a parallel-universe mode that never touches the real save
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
  mapInfo: () => ({ world, player, tram: tramSys.tram, robo: rideshare.carPos() }),
  rideshare: {
    status: () => rideshare.status(),
    destinations: () => rideshare.destinations(tramSys.tram),
    estimate: (dest) => rideshare.estimate(player, dest),
    order: (dest) => {
      if (player.ride || player.scooter) return 'Finish your current ride first.';
      if (rideshare.phase() !== 'idle') return 'You already have a car on the way.';
      if (state.bank.cash < rideshare.estimate(player, dest).fare) return 'Not enough funds for this ride.';
      rideshare.order(player, dest); sfx('bell'); return null;
    },
    cancel: () => rideshare.cancel(),
  },
  aiText,
  restore: (sv) => { Object.assign(state, sv.state); if (state.musicChannel) setChannel(state.musicChannel); if (sv.player) { player.x = sv.player.x; player.z = sv.player.z; } notify('Game loaded.'); },
  autoPending: () => { for (const d of [...state.bank.decisions]) eco.applyDecision(state, d, eco.heuristic(state, d), 'player', true); },
  npcReply: async (name, text) => { const n = { persona: { name, occupation: 'friend', quirk: '', mood: 'friendly' } }; const text2 = await npcReply(n, [{ role: 'user', content: text }], 'chat'); G.lastAi = !!n.aiReply; return text2; },
  printSheet,
  stealer: { active: () => !!cs, start: () => startStealer() },
};

// ----------------------------------------------------------- modal helpers
function openModal(build, onClose) {
  const card = $('#modal-card'); card.replaceChildren();
  build(card);
  $('#modal').classList.remove('hidden'); modalOpen = true; paused = true;
  $('#modal').onclose = onClose;
}
function closeModal() {
  $('#modal').classList.add('hidden'); modalOpen = false; paused = phone.pausesWorld() || !started;
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
  world.pushVehicles = traffic.push;
  tramSys = buildStreetcar(scene, world);
  rideshare = buildRideshare(scene, world, {
    waiting: (s) => { notify(`🚗 Your Robot Driver (${s.plate}, white ${s.style}) is here. Look for the flashing lights and press ▶️ next to it.`, { sound: false, ms: 6000 }); sfx('bell'); },
    expired: () => notify('Robot Driver: no rider detected. Trip cancelled.', { sound: false }),
    arrived: (s, curb) => {
      const fare = s.fare; state.bank.cash -= Math.min(fare, state.bank.cash); sfx('coin');
      const a = player.ride === 'robo';
      if (a) {
        const [nx, nz] = collide(curb[0], curb[1], 0.2, 0.45);
        player.x = nx; player.z = nz; player.y = groundHeight(world, nx, nz); player.ride = null; playerMesh.visible = true; sfx('door');
      }
      notify(`🤖 Arrived at ${s.dest.label}. Fare ${money(fare)}. “Thank you for riding with Robot Driver. Please rate your human.”`, { sound: false, ms: 6000 });
    },
  });
  player = { x: world.spawn.x, z: world.spawn.z, y: 0.2, heading: Math.PI, speed: 0, ride: null, sitting: null, eating: 0, scooter: null };
  traffic.setExtraSolids(() => rideshare.meshes());
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
  window.__cc = { state, get player() { return player; }, world, THREE, scene, camera, eco, G, tram: tramSys.tram, traffic, npcSys };
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
  if (cs) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, player: { x: player.x, z: player.z } })); } catch { /* quota */ }
  if (server.user) account.saveGame(G.snapshot()).catch(() => { /* offline: local save still exists */ });
}
function loadLocal() { try { const sv = JSON.parse(localStorage.getItem(SAVE_KEY)); if (sv) { Object.assign(state, sv.state); if (state.musicChannel) setChannel(state.musicChannel); player.x = sv.player.x; player.z = sv.player.z; return true; } } catch { /* ignore */ } return false; }

// ----------------------------------------------------------- input
function press(k) { input.edge[k] = true; }
function wireInput() {
  const map = { '/': 'talk', '.': 'yes', ',': 'no', "'": 'friendly' };
  addEventListener('keydown', (e) => {
    if (e.target.matches?.('input,textarea,select')) return;
    const k = e.key;
    if (map[k]) { if (k === '.') input.run = true; if (!e.repeat) press(map[k]); e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { if (modalOpen) closeModal(); else if (phone.isOpen()) phone.close(); else togglePause(); return; }
    if (k === 'Tab') { e.preventDefault(); phone.isOpen() ? phone.close() : phone.open(); return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    keys.add(k.toLowerCase());
  });
  addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (e.key === '.') input.run = false; });
  addEventListener('blur', () => { input.run = false; });
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
  document.querySelectorAll('.ab').forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(b.dataset.k); if (b.dataset.k === 'yes') input.run = true; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120); });
    if (b.dataset.k === 'yes') for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { input.run = false; });
  });
  // clicking billboards
  const ray = new THREE.Raycaster();
  $('#game').addEventListener('pointerup', (e) => {
    if (paused || e.button !== 0 || cam.dragged) return;
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
  let last = null, drag = null, dragMoved = 0;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    cam.dragged = false;
    if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 0)) { drag = e.clientX; dragMoved = 0; cam.dragged = false; el.setPointerCapture(e.pointerId); return; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = pts.size === 2 ? two() : null;
  });
  el.addEventListener('pointermove', (e) => {
    if (drag !== null) {
      dragMoved += Math.abs(e.clientX - drag);
      if (dragMoved > 4) cam.dragged = true;
      if (!paused && cam.dragged) cam.yaw -= (e.clientX - drag) * 0.008; drag = e.clientX; return;
    }
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2 || paused) return;
    const n = two(); if (last) { cam.yaw -= angDiff(0, n.ang - last.ang); if (last.dist > 10) setZoom(cam.zoomT * last.dist / n.dist); } last = n;
  });
  const up = (e) => { pts.delete(e.pointerId); last = null; if (e.button === 2 || e.button === 0) drag = null; };
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
  p.classList.toggle('hidden', !show); paused = show || modalOpen || phone.pausesWorld();
}

function wireUI() {
  $('#play').onclick = () => start(false);
  $('#intro-terms').onclick = (e) => { e.preventDefault(); phone.open('settings', { tab: 'Terms' }); };
  $('#continue').onclick = () => start(true);
  $('#btn-pause').onclick = togglePause; $('#btn-mute').onclick = toggleMute;
  $('#btn-phone').onclick = () => (phone.isOpen() ? phone.close() : phone.open());
  $('#btn-cs-exit').onclick = exitStealer;
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
  if (cs) {
    if (player.drive) return out;
    for (const m of traffic.parked) { const dd = Math.hypot(m.position.x - player.x, m.position.z - player.z); if (dd < 3.6) out.push({ kind: 'steal', m, dist: dd, label: 'Steal this car' }); }
    return out.sort((a, b) => a.dist - b.dist);
  }
  for (const d of world.doors) { const dd = Math.hypot(d.x - player.x, d.z - player.z); if (dd < (d.r || 2.6) + 0.6) out.push({ kind: 'door', d, dist: dd, label: 'Enter ' + d.label }); }
  for (const s of scooters) { if (s.riding) continue; const dd = Math.hypot(s.x - player.x, s.z - player.z); if (dd < 2.4) out.push({ kind: 'scooter', s, dist: dd, label: 'Ride scooter' }); }
  if (rideshare.phase() === 'waiting') { const c = rideshare.carPos(), dd = Math.hypot(c.x - player.x, c.z - player.z); if (dd < 8) out.push({ kind: 'robo', dist: dd, label: 'Board Robot Driver' }); }
  for (const a of traffic.agents) {
    if (a.type !== 'bus') continue; const dd = Math.hypot(a.mesh.position.x - player.x, a.mesh.position.z - player.z);
    if (dd < 7 && a.v < 1.5) out.push({ kind: 'bus', a, dist: dd, label: 'Board bus' });
  }
  for (const it of world.interactables) {
    if (!it.r) continue; const dd = Math.hypot(it.x - player.x, it.z - player.z);
    if (dd < it.r + 0.6) out.push({ kind: it.type, it, dist: dd, label: it.type === 'bench' ? (player.sitting ? 'Stand up' : 'Sit') : it.type === 'court' ? 'Play pickleball' : it.type === 'poster' ? 'Open sf3am.com' : it.type === 'tramstop' ? (tramSys.tram.atStop && tramSys.tram.dwell > 0 ? 'Board streetcar' : 'Streetcar stop — wait for it') : it.label });
  }
  return out.sort((a, b) => a.dist - b.dist);
}
const npcNear = (r = 3.2) => nearestOf([...npcSys.list.filter((n) => n.state !== 'inside'), ...npcSys.animals.filter((a) => !a.airborne)], player.x, player.z, r);

function handleActions() {
  const e = input.edge; input.edge = {};
  if (phone.isOpen()) return; // a live phone lets the world run, but the player is busy staring at it
  if (player.ride === 'tram') { if (e.friendly || e.yes) alightTram(); return; }
  if (player.ride === 'bus') { if (e.friendly || e.yes) { player.bus.stopReq = true; notify('Stop requested — the bus will pull up.', { sound: false, ms: 2000 }); sfx('bell'); } return; }
  if (player.ride === 'robo') { if (e.friendly || e.yes) notify(pick(['Robot Driver: “I will stop at your destination. I have never missed one.”', 'Robot Driver: “Please remain seated. I am vibing.”', 'Robot Driver: “Did you know? I do not know either.”']), { sound: false, ms: 3500 }); return; }
  if (player.drive) { if (e.friendly || e.yes) leaveCar(); else if (e.talk || e.no) sfx('horn'); return; }
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
  if (e.no) { const n = npcNear(10); if (n && !n.isAnimal) { notify(`You: "Watch it!" ${n.persona.name} looks mildly offended.`, { sound: false }); if (!cs) state.rep = clamp(state.rep - 0.4, 0, 100); n.rel = (n.rel || 0) - 1; } else { notify('You mutter at the weather.', { sound: false, ms: 2000 }); } sfx('squawk'); }
}
function greet(n) {
  const lines = ['"Hi there!"', '"Beautiful day. Well — dry-ish."', '"Love this neighborhood."'];
  notify(`You: ${pick(lines)} — ${n.persona.name} waves back.`, { sound: false }); n.rel = (n.rel || 0) + 1;
}
function activate(t) {
  if (t.kind === 'steal') return stealCar(t.m);
  if (t.kind === 'door') return enterVenue(t.d);
  if (t.kind === 'scooter') { player.scooter = t.s; t.s.riding = true; player.heading = t.s.h; sfx('scooterOn'); notify('Scooter: 👍 go · ⛔ brake · 💬 boost · ▶️ slide / get off', { sound: false, ms: 5000 }); return; }
  if (t.kind === 'bench') { if (player.sitting) standUp(); else { player.sitting = t.it; player.x = t.it.x; player.z = t.it.z; player.y = t.it.y || groundHeight(world, t.it.x, t.it.z); player.heading = t.it.rot ?? 0; } return; }
  if (t.kind === 'poster') return window.open(t.it.url, '_blank', 'noopener');
  if (t.kind === 'court') return openModal((c) => playPickleball(c, G_mini(), closeModal));
  if (t.kind === 'tramstop') return boardTram();
  if (t.kind === 'robo') { if (rideshare.board()) { player.ride = 'robo'; playerMesh.visible = false; sfx('door'); notify(`Buckled in. Heading to ${rideshare.status().dest.label}. Fare ${money(rideshare.status().fare)}.`, { sound: false, ms: 5000 }); } return; }
  if (t.kind === 'bus') { player.ride = 'bus'; player.bus = t.a; t.a.rider = true; t.a.stopReq = false; playerMesh.visible = false; sfx('door'); notify('On the bus! ▶️ to request a stop and get off.', { sound: false, ms: 5000 }); }
}
// ----------------------------------------------------------- Car Stealer (phone mini-game, parallel universe)
function startStealer() {
  if (cs || !started) return;
  if (player.ride || player.scooter || player.inside || player.sitting) return notify('Finish what you are doing first.', { sound: false });
  const mesh = makeDudeModel();
  cs = { saved: { x: player.x, y: player.y, z: player.z, heading: player.heading }, lady: playerMesh, mesh, stolen: 0 };
  scene.remove(playerMesh); playerMesh = mesh; scene.add(mesh);
  player.x = world.spawn.x; player.z = world.spawn.z; player.y = groundHeight(world, player.x, player.z); player.heading = Math.PI; player.speed = 0;
  camera.position.set(player.x, player.y + 17, player.z + 17);
  document.body.classList.add('cs-mode');
  lockChannel('jazz');
  notify('🚘 Car Stealer — a parallel universe. Nothing here counts. Walk up to a parked car and press ▶️.', { sound: false, ms: 9000 });
}
function exitStealer() {
  if (!cs) return;
  if (player.drive) { traffic.repark(player.drive.mesh); player.drive = null; }
  scene.remove(playerMesh); playerMesh = cs.lady; scene.add(playerMesh); playerMesh.visible = true;
  Object.assign(player, cs.saved, { speed: 0, drive: null });
  const n = cs.stolen; cs = null;
  document.body.classList.remove('cs-mode');
  unlockChannel();
  camera.position.set(player.x, player.y + 17, player.z + 17);
  notify(`Back to your own universe. (${n} car${n === 1 ? '' : 's'} borrowed next door.)`, { sound: false, ms: 5000 });
}
function stealCar(m) {
  traffic.unpark(m);
  player.drive = { mesh: m, v: 0 }; player.heading = m.rotation.y; playerMesh.visible = false;
  cs.stolen++; sfx('door');
  notify(pick(['Click. Click. The door gives way. ▶️ to get out · arrows to drive · 💬 horn', 'Slim-jim, one hot-wire, zero regrets. ▶️ to get out · 💬 horn', 'Nobody saw that. Probably. ▶️ to get out · 💬 horn']), { sound: false, ms: 5000 });
}
function leaveCar() {
  const d = player.drive;
  if (Math.abs(d.v) > 2.5) return notify('Slow down before you bail out!', { sound: false, ms: 2000 });
  const h = d.mesh.rotation.y, [nx, nz] = collide(d.mesh.position.x + Math.cos(h) * 2.1, d.mesh.position.z - Math.sin(h) * 2.1, player.y, 0.45);
  traffic.repark(d.mesh); player.drive = null; player.x = nx; player.z = nz; player.y = groundHeight(world, nx, nz); playerMesh.visible = true; sfx('door');
}
function driveCar(dt, mv) {
  const d = player.drive, thr = -mv.z;
  d.v += (thr > 0 ? 15 : 20) * thr * dt;
  d.v -= d.v * 0.45 * dt + Math.sign(d.v) * Math.min(Math.abs(d.v), 2.2 * dt);
  d.v = clamp(d.v, -6, 19);
  player.heading -= clamp(mv.x, -1, 1) * dt * 1.7 * clamp(d.v / 5, -1, 1);
  const dx = Math.sin(player.heading) * d.v * dt, dz = Math.cos(player.heading) * d.v * dt;
  let [nx, nz] = collide(player.x + dx, player.z + dz, 0.2, 1.3);
  if (Math.hypot(nx - player.x - dx, nz - player.z - dz) > 0.05) d.v *= 0.4;
  player.x = clamp(nx, BOUNDS.x0, BOUNDS.x1); player.z = clamp(nz, BOUNDS.z0, BOUNDS.z1); player.y = groundHeight(world, player.x, player.z); player.speed = 0;
  d.mesh.position.set(player.x, player.y, player.z); d.mesh.rotation.y = player.heading;
}
function alightBus() {
  const a = player.bus, c = a.axis === 'z' ? [a.c, a.mesh.position.z] : [a.mesh.position.x, a.c];
  let dx = a.mesh.position.x - c[0], dz = a.mesh.position.z - c[1]; const l = Math.hypot(dx, dz) || 1;
  const [nx, nz] = collide(c[0] + dx / l * 7.5, c[1] + dz / l * 7.5, 0.2, 0.45);
  player.x = nx; player.z = nz; player.y = groundHeight(world, nx, nz);
  a.rider = false; a.stopReq = false; player.bus = null; player.ride = null; playerMesh.visible = true; sfx('door');
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
const G_mini = () => ({ state, notify, sfx, aiText, aiJson, BAG_MOTIFS, server, npcReply, money, eco, DATA, closeModal, price: G.price, unlockRoast, h, foodSVG, svgURI, pickRoast: pickRoastStyles });

// ----------------------------------------------------------- dialogue
const OFFLINE = {
  cheerful: ['Oh, lovely to see someone friendly out here!', 'You know, this coffee weather is the best weather.'],
  tired: ['Long shift. I need caffeine and a bench.', 'Mm. Sorry, I’m a little fried today.'],
  curious: ['Have you tried the new place around the corner? Everyone is talking about it.', 'Do you run one of those shops? I always wonder how they do it.'],
  grumpy: ['Prices keep going up. Everything does.', 'Hmph. Rain again.'],
  dreamy: ['I was just watching the clouds drift over the old tower.', 'Do you ever read by the window with the rain on it? That is the life.'],
  chatty: ['Oh, did you hear about the whale mural? Somebody touched up the tail!', 'My cousin says the streetcar is the best way to see the whole neighborhood.'],
};
const OFFLINE_SUS = [
  'Why are you looking at me like that?', 'I did not see anything. Did YOU see anything?', 'You have a very car-shaped look about you.', 'Stay away from my car. Any car. Everyone\u2019s car.',
  'I am watching you. I am literally watching you right now.', 'Nobody asked you. Nobody asks you anything. Keep walking.', 'Have we met? We haven\u2019t. Why do you know my name?', 'Those are some… shifty keys you are not holding.',
  'Hmm. Hands where I can see them. Also, hi.', 'I know what a person who steals cars looks like. You look exactly like that.',
];
const ANIMAL_TALK = {
  pigeon: ['Do you have bread? Even a thought of bread? I will take a thought of bread.', 'I have been standing here for six hours and I regret none of it.', 'You can understand me?! Finally. Okay. Listen. Crumbs. Please.'],
  gull: ['MINE. Whatever you are holding. Mine. I am joking. Mostly.', 'I am a seagull. I have seen things you would not believe, mostly fries.', 'The tide is in, the fries are out, and I am furious about both.'],
  raccoon: ['This crust? Found it. Fair and square. Mostly square.', 'I am not stealing, I am reallocating. Do you want half?', 'Nobody ever talks to me. They just yell and clap. This is nice.'],
  pelican: ['I have been judging the harbor for forty years. You seem fine.', 'Observe my pouch. It is a lot of pouch. I am proud of it.', 'Fish come and go. Dignity, however, is forever.'],
  deer: ['Oh! Sorry. I was just standing very politely.', 'The grass here is a seven out of ten. The rain is a ten out of ten.', 'Please do not make any sudden movements. I love you, but please.'],
  dog: ['YOU CAN TALK TO ME?! I LOVE YOU. WHO IS A GOOD PERSON? YOU ARE.', 'Squirrel. Sorry. Squirrel. I am listening. Squirrel.', 'Hello! Do you have snacks? Are you a snack? You are not a snack. I love you anyway.'],
};
async function npcReply(n, msgs, ctx = 'street') {
  const p = n.persona;
  if (n.isAnimal && trippingNow()) {
    const ai = await aiText(`You are ${p.name}, in a cozy rainy city game. The player ate a magic mushroom and can suddenly understand you in plain English. Speak as this animal would: its real preoccupations (food, territory, weather), funny and warm, never rude or dark. Reply in 1-2 short sentences, no stage directions.`, msgs.slice(-8));
    n.aiReply = !!ai;
    return ai ? ai.replace(/\s+/g, ' ').slice(0, 300) : pick(ANIMAL_TALK[n.kind] || ANIMAL_TALK.dog);
  }
  if (n.isAnimal) return n.kind === 'raccoon' ? '*chitters, clutching a pizza crust*' : n.kind === 'deer' ? '*flicks an ear, watching you with huge dark eyes*' : n.kind === 'dog' ? '*wags enthusiastically*' : n.kind === 'pelican' ? '*regards you with ancient pelican dignity, bill pouch sagging*' : '*coos and eyes your pockets*';
  if (cs) {
    const ai = await aiText(`You are ${p.name}, ${p.occupation}, in a darkly comic parallel-universe version of a rainy city neighborhood where the player is a shifty guy who steals parked cars (no real consequences). You are VERY suspicious of him: wary, paranoid, accusatory but funny, never violent or threatening. Reply in 1-2 short sentences, in character, no stage directions.`, msgs.slice(-8));
    n.aiReply = !!ai;
    return ai ? ai.replace(/\s+/g, ' ').slice(0, 300) : pick(OFFLINE_SUS);
  }
  const sys = `You are ${p.name}, ${p.occupation}, in a game set in a rainy, gritty Pacific Northwest international district. Personality: ${p.quirk || p.bio || 'friendly'}. Mood: ${p.mood}. ${n.persona.bio ? 'Bio: ' + n.persona.bio : ''} Weather: ${state.weather}. Reply in 1-2 short sentences, in character, no stage directions. The player runs coffee shops.`;
  const ai = await aiText(sys, msgs.slice(-8));
  n.aiReply = !!ai;
  if (ai) return ai.replace(/\s+/g, ' ').slice(0, 300);
  if (p.name === 'Dan') return pick(['Pickle says hi. Well, he screams hi.', 'Green parrot, big opinions. You get used to it.']);
  if (p.name === 'Jes') return pick(['Bluebell loves pink. So do I, obviously.', 'Isn’t the light nice through all this cloud?']);
  if (p.name === 'Tex') return pick(['Howdy, partner. Duke caught a scent, so we\u2019re on a schedule he decides.', 'Mighty fine coffee weather. Damp, but fine.', 'Don\u2019t mind Duke\u2019s nose. He\u2019s just reading the news.']);
  if (p.name === 'Jill') return pick(['Biscuit, heel. Sorry\u2014I have a call in four minutes. Yes, he\u2019s very good.', 'Do you do a morning rush discount? Asking for my calendar.', 'He\u2019s a golden retriever. He\u2019s legally required to love everyone.']);
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
    const add = (who, text, ai) => { log.push({ who, text, ai: !!ai }); box.append(h('div', { class: 'say' + (who === 'You' ? ' me' : '') }, h('b', {}, who + ': '), text, ai ? h('span', { class: 'small', title: 'Written by the AI', style: 'margin-left:6px;opacity:.7' }, '✨AI') : '')); box.scrollTop = box.scrollHeight; };
    const send = async (text) => {
      if (!text) return; inp.value = ''; add('You', text); n.rel = (n.rel || 0) + 1;
      const r = await npcReply(n, log.map((l) => ({ role: l.who === 'You' ? 'user' : 'assistant', content: l.text })), 'street'); add(p.name, r, n.aiReply);
      if (!cs && !n.isAnimal && n.kind !== 'dealer' && n.rel >= 3 && !n.offered && !state.contacts.includes(p.name) && Math.random() < 0.6) { n.offered = true; offerNumbers(card, n, add); }
    };
    card.append(h('h3', {}, `${n.isAnimal ? '' : '💬 '}${p.name}`), h('div', { class: 'small' }, `${p.occupation}${p.mood ? ' · ' + p.mood : ''}`), box, inp,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => send(inp.value) }, 'Say'), h('button', { class: 'btn alt', onclick: () => send('Hi! How is your day?') }, 'Chat'), h('button', { class: 'btn alt', onclick: () => send('Know any good places to eat?') }, 'Ask for tips'),
        h('button', { class: 'btn', title: 'Export PDF', onclick: () => exportPdf(n, log) }, '🖨'), h('button', { class: 'btn warn', onclick: closeModal }, 'Walk away')));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(inp.value); e.stopPropagation(); });
    if (n.kind === 'dealer' && !cs) card.append(dealerMenu());
    npcReply(n, [{ role: 'user', content: 'Hello!' }]).then((r) => add(p.name, r, n.aiReply));
  }, () => { n.state = 'walk'; });
  if (!n.isAnimal) { n.state = 'chat'; n.chatT = 999; }
}
function offerNumbers(card, n, add) {
  const row = h('div', { class: 'say' }, `${n.persona.name} asks: “Want to exchange numbers?” `, h('button', { class: 'btn alt', onclick: () => { state.contacts.push(n.persona.name); (state.chats[n.persona.name] ||= []).push({ text: 'Good talking to you! ☕' }); row.textContent = 'Numbers exchanged! Check Chat on your phone.'; sfx('chime'); } }, '👍 Sure'), h('button', { class: 'btn', onclick: () => row.remove() }, '⛔ No thanks'));
  card.insertBefore(row, card.querySelector('input'));
}
function printSheet(kind, intro, nodes) {
  const sheet = $('#print-sheet'); const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renderer.render(scene, camera);
  sheet.replaceChildren(h('div', { style: 'text-align:center' }, h('div', { html: LOGO_SVG, style: 'width:90px;margin:auto' }), h('h1', {}, 'Coffee Craft')),
    h('p', {}, `${intro} — ${new Date().toLocaleString()} — Day ${state.day}, ${fmtClock(state.minutes)}, ${state.weather}.`),
    h('img', { src: renderer.domElement.toDataURL('image/jpeg', 0.7), style: 'width:100%;max-height:260px;object-fit:cover' }),
    ...nodes, h('p', { style: 'margin-top:30px;font-size:12px' }, 'Coffee Craft by Daniel McKeown — https://altaredwood.work'));
  const t = document.title; document.title = `Coffee_Craft__${kind}_${stamp}`;
  setTimeout(() => { window.print(); document.title = t; }, 100);
}
const aiMark = (ai) => (ai ? ' [AI]' : '');
function exportPdf(n, log) {
  printSheet('conversation', `Conversation with ${n.persona.name} (${n.persona.occupation})`, log.map((l) => h('p', {}, h('b', {}, l.who + ': '), l.text + aiMark(l.ai))));
}

// ----------------------------------------------------------- street dealers
function dealerMenu() {
  const buy = (what, cost) => () => {
    if (state.bank.cash < cost) return notify('Not enough funds.');
    state.bank.cash -= cost; state.scrutiny += 3; sfx('rustle');
    state.buzzed = { type: what, until: state.minutes + 90 }; notify(what === 'booze' ? 'You feel wobbly…' : 'Meh. It hits sideways. You wobble.', { sound: false });
  };
  const fragment = () => {
    const price = 12;
    if (state.bank.cash < price) return notify('Not enough funds.');
    state.bank.cash -= price; state.scrutiny += 2; sfx('rustle');
    const name = 'Crystal Fragment';
    const log = (state.purchases ||= []), rec = log.find((p) => p.name === name);
    if (rec) rec.count++; else { log.push({ name, kind: 'xtal:shard:#7fd6c8', where: 'Under the highway', day: state.day, count: 1 }); notify(`🛍 New for your Purchases: ${name}`, { sound: false }); }
    notify(pick(['“Genuine. Probably.” It might be glass.', '“Fell off a… geode.” It glows a little. Maybe.', '“Don’t ask where it’s from.” It is warm to the touch.', 'A shard of something. It hums faintly, or that is the highway.']), { sound: false });
  };
  const ask = (title, desc, price, go) => () => openModal((c) => c.append(h('h3', {}, title), h('p', {}, desc), h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: () => { if (state.bank.cash < price) return notify('Not enough funds.'); go(); closeModal(); notify(`✅ Purchased: ${title} (${money(price)}).`, { sound: false }); } }, `👍 Buy ${money(price)}`), h('button', { class: 'btn', onclick: closeModal }, '⛔ Back'))));
  return h('div', { class: 'bizcard' }, h('b', {}, 'Street deal (▶️)'), h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: ask('Sketchy booze', 'A bottle with no label. Probably fine.', 20, buy('booze', 20)) }, 'Sketchy booze $20'), h('button', { class: 'btn warn', onclick: ask('Street weed', 'Mystery greenery in a sandwich bag.', 15, buy('street', 15)) }, 'Street weed $15'), h('button', { class: 'btn warn', onclick: ask('Crystal Fragment', 'A shard of something that may be glass.', 12, fragment) }, '💎 “Crystal fragment” $12')));
}

// ----------------------------------------------------------- venues
function unlockRoast() { const nxt = DATA.roastStyles.find((r) => !state.roastsUnlocked.includes(r.id) && state.roastTries >= r.need); if (nxt) { state.roastsUnlocked.push(nxt.id); notify(`New roast style unlocked: ${nxt.name}!`); return nxt; } return null; }
function pickRoastStyles() { return DATA.roastStyles.filter((r) => state.roastsUnlocked.includes(r.id)); }

function consume(b, item, price) {
  if (state.bank.cash < price) { notify('Your bank balance is too low.'); return false; }
  state.bank.cash -= price; sfx(item[2] === 'beer' || item[2] === 'cider' ? 'sip' : 'eat');
  if (!state.diary.some((d) => d.name === item[0])) state.diary.push({ name: item[0], kind: kindFor(item[0], item[2]) || item[2], where: b.name, day: state.day });
  state.points += 2;
  player.eating = 2.2; notify(`😋 You enjoy the ${item[0]}.`, { sound: false });
  if (item[2] === 'beer' || item[2] === 'cider') state.buzzed = { type: 'booze', until: state.minutes + 60 };
  return true;
}
// Item picture: tagged/keyword icon first; otherwise a plain platter that an AI-drawn SVG replaces (cached per item name).
const itemSrc = (name, kind) => { const k = kindFor(name, kind); return svgURI(foodSVG(k || 'platter')); };
const aiArtPending = new Set();
function itemImg(name, kind, attrs = {}) {
  const img = h('img', { ...attrs, src: itemSrc(name, kind) });
  if (kindFor(name, kind) || !server.ai) return img;
  state.itemArt ||= {};
  if (state.itemArt[name]) { img.onerror = () => { delete state.itemArt[name]; img.onerror = null; img.src = itemSrc(name, kind); }; img.src = svgURI(state.itemArt[name]); return img; }
  if (aiArtPending.has(name)) return img;
  aiArtPending.add(name);
  aiText('You draw tiny flat icons as SVG for a cozy low-poly game. Reply with ONLY one <svg> element: viewBox="0 0 200 200", 4 to 10 simple shapes (rect, circle, ellipse, path, polygon), thick dark outline #2b2f2a, warm muted colors, no text, no scripts, no images.',
    [{ role: 'user', content: `Draw a simple icon of: ${name}` }]).then((r) => {
    let clean = sanitizeSVG(r);
    if (clean && !/xmlns=/.test(clean)) clean = clean.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const bad = !clean || !/viewBox/i.test(clean) || new DOMParser().parseFromString(clean, 'image/svg+xml').querySelector('parsererror');
    if (!bad) { state.itemArt[name] = clean; if (img.isConnected) img.src = svgURI(clean); }
  }).catch(() => {}).finally(() => aiArtPending.delete(name));
  return img;
}
function foodModal(b, item) {
  const price = G.price(b, item[1]);
  openModal((c) => c.append(h('h3', {}, item[0]), itemImg(item[0], item[2], { style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, item[3] || ''),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (consume(b, item, price)) closeModal(); } }, `👍 Buy ${money(price)}`), h('button', { class: 'btn warn', onclick: () => enterVenueById(b.id) }, '⛔ Back'))));
}
function vacantModal(b) {
  const price = eco.vacantPrice(b), types = eco.reopenTypes(state), icons = { coffee: '☕ Café', restaurant: '🍜 Restaurant', donut: '🍩 Donut shop' };
  let type = types[0];
  openModal((c) => {
    const sel = h('select', { onchange: (e) => { type = e.target.value; } }, ...types.map((t) => h('option', { value: t }, icons[t])));
    c.append(h('h3', {}, `${b.name} — shuttered`), h('p', {}, 'The windows are papered over and the door is chained. A “For Sale” sign hangs crooked.'),
      h('p', { class: 'small' }, `Asking price ${money(price)}. Opening needs at least ${eco.RENOVATION_PROJECTS} major renovation projects, which cost ${eco.RENOVATION_MARKUP}× the usual price.`),
      h('div', { class: 'kv' }, h('span', {}, 'Reopen as'), sel),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (!eco.buyVacant(state, b, type)) return notify('Not enough funds.'); sfx('coin'); closeModal(); notify(`🏚 You bought the property. Renovate it from Settings → Business.`); } }, `👍 Buy property ${money(price)}`), h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
  });
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

const CRYSTAL_SHOP = { id: 'crystals', name: 'Moonlit Quartz' };
function enterCrystalShop() {
  sfx('door');
  const stock = () => crystalStock(state.day, (state.extraItems ||= {}).crystals);
  openModal((c) => {
    const list = h('div', { class: 'menu-items' });
    const showItem = (it) => openModal((m) => m.append(h('h3', {}, it[0]), itemImg(it[0], it[2], { style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, it[3] || ''),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => buyItem(CRYSTAL_SHOP, it) }, `👍 Buy ${money(it[1])}`), h('button', { class: 'btn warn', onclick: enterCrystalShop }, '⛔ Back'))));
    const draw = () => list.replaceChildren(...stock().map((it) => h('div', { class: 'menu-item', onclick: () => showItem(it) }, itemImg(it[0], it[2], { alt: '' }), h('b', {}, it[0]), h('div', {}, money(it[1])))));
    draw();
    c.append(h('h3', {}, '💎 Moonlit Quartz'), h('p', { class: 'small' }, 'Beaded curtains, incense, and a cat asleep on the geodes. “Touch anything you like. Pick up whatever hums.”'), list,
      h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
    aiNewCrystal(() => { if (list.isConnected) draw(); });
  });
}
// Small local models often emit slightly broken JSON; fall back to pulling fields out with regexes.
function looseFields(t, keys) {
  if (!t) return null;
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  const o = {};
  for (const k of keys) { const r = t.match(new RegExp(`"?${k}"?\\s*:\\s*(?:"([^"]*)"|([#\\w.]+))`, 'i')); if (r) o[k] = r[1] ?? r[2]; }
  return Object.keys(o).length ? o : null;
}
// With AI on, the shop's shelf can gain a one-of-a-kind stone per day (up to 8), kept in the save.
let aiCrystalPending = false;
function aiNewCrystal(done) {
  if (!server.ai || aiCrystalPending) return;
  const extras = (state.extraItems ||= {}).crystals ||= [];
  const seen = (state.aiStockDay ||= {});
  if (seen.crystals === state.day || extras.length >= 8) return;
  aiCrystalPending = true;
  const have = crystalStock(state.day, extras).map((i) => i[0]).join(', ');
  aiText('You name and describe imaginary, whimsical, family-friendly crystals and stones for a cozy rock shop. Reply with ONLY minified JSON.',
    [{ role: 'user', content: `Already on the shelf: ${have}. Invent ONE new stone that is not on that list. Reply as {"name":"2-4 words","price":number 10-60,"desc":"one short evocative sentence","color":"#rrggbb","shape":"cluster|point|tumble|geode"}.` }]).then((txt) => {
    const j = looseFields(txt, ['name', 'price', 'desc', 'color', 'shape']);
    const name = String(j?.name || '').replace(/[<>"]/g, '').trim().slice(0, 32);
    const price = Math.max(8, Math.min(80, Math.round(Number(j?.price) || 0)));
    const color = /^#[0-9a-f]{6}$/i.test(j?.color || '') ? j.color : null;
    const shape = ['cluster', 'point', 'tumble', 'geode'].includes(j?.shape) ? j.shape : 'cluster';
    if (!name || !price || !color || have.toLowerCase().includes(name.toLowerCase())) return;
    extras.push([name, price, `xtal:${shape}:${color}`, String(j.desc || '').replace(/[<>]/g, '').slice(0, 140)]);
    seen.crystals = state.day; notify(`💎 A new stone arrived at Moonlit Quartz: ${name}`, { sound: false }); done();
  }).catch(() => {}).finally(() => { aiCrystalPending = false; });
}

// Your apartment at the Wren Building: a free hotel-style room with a pink-glow window.
function enterHome() {
  sfx('door');
  const hr = Math.floor(state.minutes / 60) % 24, night = hr >= 19 || hr < 6;
  const lines = night
    ? ['Across the street a pink neon sign hums; the whole room swims in rose light.', 'Rain ticks on the glass. The pink glow turns every puddle into a little sunset.', 'The pink light slides over the ceiling every time a streetcar passes.']
    : ['Grey daylight, but the window still has a faint pink tint from last night\u2019s sign.', 'The pink-tinted glass makes the drizzle look like falling petals.', 'A pigeon sits on the sill, lit pink by the sign it has outlived.'];
  const sky = night ? 'linear-gradient(#2a1740,#c2428f 70%,#ff8ccf)' : 'linear-gradient(#9aa6ad,#c9a3b8 80%,#f2b6d6)';
  const win = h('div', { style: `height:170px;border-radius:10px;border:8px solid #4a3020;background:${sky};position:relative;overflow:hidden;box-shadow:0 0 40px #ff6fc0 inset, 0 0 24px #ff6fc088` },
    h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:46px;background:repeating-linear-gradient(90deg,#2b2536 0 22px,#3a3046 22px 40px);opacity:.9' }),
    h('div', { style: 'position:absolute;left:50%;top:0;bottom:0;width:6px;background:#4a3020' }),
    h('div', { style: 'position:absolute;left:0;right:0;top:50%;height:6px;background:#4a3020' }));
  openModal((c) => {
    c.append(h('h3', {}, 'Wren Building \u00b7 your apartment'), win, h('p', {}, lines[Math.floor(Math.random() * lines.length)]),
      h('p', { class: 'small' }, `Cash on hand: ${money(state.bank.cash)}. No charge to rest here.`),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => sleep({ name: 'home' }, 0) }, '\ud83d\udecf Sleep until morning (free)'), h('button', { class: 'btn alt', onclick: () => { closeModal(); phone.open(); } }, '\ud83d\udcf1 Phone'), h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
  });
}
// Basement pub behind the Wren Building: stairs down to a dim bar with beer, cider and mild "brick" weed.
const CELLAR = { id: 'basement', name: "The Wren's Cellar", type: 'pub', owner: 'public' };
const CELLAR_MENU = [
  ['Draft Pale Ale', 7, 'beer', 'Cold, hoppy, poured slow from a wooden tap.'],
  ['Dry Hard Cider', 7, 'cider', 'Crisp apples from east of the mountains.'],
  ['Brick Weed', 9, 'weed_brick', 'Compressed, mellow and a bit scratchy. A gentler, shorter lift than dispensary stuff, with no neon lights.'],
];
function enterCellar() {
  sfx('door');
  const hour = Math.floor(state.minutes / 60) % 24;
  if (hour >= 2 && hour < 16) { closeModal(); return notify('The cellar door is bolted. Open 16:00\u201302:00.', { sound: false }); }
  const show = (it) => openModal((m) => m.append(h('h3', {}, it[0]), itemImg(it[0], it[2], { style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, it[3]),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (it[2] === 'weed_brick') { buyItem(CELLAR, it); } else if (!consume(CELLAR, it, it[1])) return; enterCellar(); } }, `\ud83d\udc4d Buy ${money(it[1])}`), h('button', { class: 'btn warn', onclick: enterCellar }, '\u26d4 Back'))));
  openModal((c) => c.append(h('h3', {}, "\ud83c\udf7a The Wren's Cellar"), h('p', { class: 'small' }, 'Down a steep stairwell: brick walls, string lights, a jukebox with one good song. The bartender nods without looking up.'),
    h('div', { class: 'menu-items' }, ...CELLAR_MENU.map((it) => h('div', { class: 'menu-item', onclick: () => show(it) }, itemImg(it[0], it[2], { alt: '' }), h('b', {}, it[0]), h('div', {}, money(it[1]))))),
    h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: closeModal }, 'Leave'))));
}

// Mushroom Therapy Center behind Night Owl Market: functional mushrooms, and magic ones that let you understand animals for a while.
const MUSH = { id: 'mushrooms', name: 'Mushroom Therapy Center', type: 'wellness', owner: 'public' };
const MUSH_MENU = [
  ['Lion\u2019s Mane Focus Tincture', 18, 'mush_fn', 'Functional. Sharpens the mind: a clear-headed hour that earns a few extra points.', 'focus'],
  ['Reishi Calm Tea', 14, 'mush_fn', 'Functional. Earthy, soothing, faintly like a forest floor. Eases police scrutiny a touch.', 'calm'],
  ['Cordyceps Morning Capsules', 16, 'mush_fn', 'Functional. A steady lift, no jitters, no regrets.', 'energy'],
  ['Magic Mushroom Cap', 45, 'mush_magic', 'The real thing. For about 90 minutes the pigeons, gulls, raccoons and dogs will speak plain English to you. Colors get a little wiggly.', 'magic'],
  ['Magic Mushroom Chocolate', 30, 'mush_magic', 'A gentler square of the same magic: about 45 minutes of understanding animals.', 'magic_lite'],
];
const trippingNow = () => state.buzzed?.type === 'shroom' && state.minutes < state.buzzed.until;
function enterMushroom() {
  sfx('door');
  const hour = Math.floor(state.minutes / 60) % 24;
  if (hour >= 3 && hour < 11) { closeModal(); return notify('The Mushroom Therapy Center is shuttered. Open 11:00\u201303:00.', { sound: false }); }
  const take = (it) => {
    if (state.bank.cash < it[1]) return notify('Not enough funds.');
    buyItem(MUSH, it);
    const fx = it[4];
    if (fx === 'focus') { state.points += 3; notify('\ud83e\udde0 Your thoughts feel tidy and bright. +3 points.', { sound: false }); }
    else if (fx === 'calm') { state.scrutiny = Math.max(0, state.scrutiny - 3); notify('\ud83c\udf75 Calm settles over you. Police scrutiny eases.', { sound: false }); }
    else if (fx === 'energy') { notify('\u26a1 A clean, steady energy hums through you.', { sound: false }); }
    else { state.buzzed = { type: 'shroom', until: state.minutes + (fx === 'magic' ? 90 : 45) }; notify('\ud83c\udf44 The edges of everything go soft and shimmery\u2026 try talking to an animal.', { sound: false, ms: 5000 }); }
    purchased(it[0], it[1], enterMushroom);
  };
  const show = (it) => openModal((m) => m.append(h('h3', {}, it[0]), itemImg(it[0], it[2], { style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, it[3]),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => take(it) }, `\ud83d\udc4d Buy ${money(it[1])}`), h('button', { class: 'btn warn', onclick: enterMushroom }, '\u26d4 Back'))));
  openModal((c) => c.append(h('h3', {}, '\ud83c\udf44 Mushroom Therapy Center'),
    h('p', { class: 'small' }, 'A back-alley door, a bead of green lantern light, and inside: terrariums, soft lamps and a practitioner in a cardigan who whispers. \u201cFunctional on the left shelf. Magic on the right. Please don\u2019t operate a robot taxi.\u201d'),
    trippingNow() ? h('p', { class: 'small' }, '\ud83c\udf44 You are currently tuned in to animal speech.') : '',
    h('div', { class: 'menu-items' }, ...MUSH_MENU.map((it) => h('div', { class: 'menu-item', onclick: () => show(it) }, itemImg(it[0], it[2], { alt: '' }), h('b', {}, it[0]), h('div', {}, money(it[1]))))),
    h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: closeModal }, 'Leave'))));
}

// Comedy club behind Fir Street Apartments: bland built-in bits, or an original AI-written set when AI is on.
const COMICS = ['Marty Pemberton', 'Dolores Quill', 'Big Tran', 'Hazel Okonkwo-Reyes', 'Lenny Fisk', 'Priya Dunmore'];
const BLAND_BITS = [
  'So I went to the grocery store. You ever notice how the cart always has one bad wheel? Always. Just one. Like it\u2019s a team and that wheel is the intern.',
  'I tried to eat healthy this week. I bought a salad. I put it in the fridge. It\u2019s doing great. It\u2019s very healthy. It\u2019s a very healthy salad that I do not eat.',
  'Parking in this city, am I right? I circled for twenty minutes. Found a spot. It was a driveway. Someone\u2019s driveway. We\u2019re friends now.',
  'My phone says I\u2019m using it four hours a day. Four hours! That\u2019s a part-time job with no pay and the boss is a rectangle.',
  'Why do they call it a \u201crush hour\u201d when nobody is moving? That\u2019s not a rush. That\u2019s a very slow hour, with feelings.',
  'I love coffee. People say, \u201cYou drink too much coffee.\u201d That\u2019s not a thing. It\u2019s like saying I\u2019m too awake. Who is that for?',
  'It rains here so much that I don\u2019t check the forecast. I check the mood. \u201cToday it\u2019s drizzly, with a chance of drizzle.\u201d',
];
let comedyBusy = false;
function enterComedy() {
  sfx('door');
  const hour = Math.floor(state.minutes / 60) % 24;
  if (hour >= 3 && hour < 18) { closeModal(); return notify('The Drizzle Room is dark. Shows run 18:00\u201303:00.', { sound: false }); }
  const FEE = 12;
  const tickets = state.comedyTickets || 0;
  const comic = COMICS[(state.day + tickets) % COMICS.length];
  const stage = (text, aiMade) => openModal((m) => {
    m.append(h('h3', {}, '\ud83c\udfa4 The Drizzle Room'),
      h('div', { style: 'background:#2a1020;color:#ffd7e4;padding:12px;border-radius:12px;border:3px solid #ff5c8a' },
        h('div', { class: 'small', style: 'color:#ff9bb8' }, `${comic}${aiMade ? ' \u00b7 \u2728 brand-new material' : ''}`),
        h('p', { style: 'font-size:1.05em;line-height:1.4' }, text)),
      h('p', { class: 'small' }, pick(['\ud83d\udc4f The crowd applauds politely.', '\ud83d\ude10 A single person laughs, a beat late.', '\ud83e\udd57 Someone coughs. The comic powers through.', '\ud83d\ude02 Surprisingly, a real laugh from the back.'])),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => next() }, `\ud83d\udc4d Another bit (${money(FEE)})`), h('button', { class: 'btn warn', onclick: closeModal }, 'Leave')));
  });
  const next = async () => {
    if (comedyBusy) return;
    if (state.bank.cash < FEE) return notify('You can\u2019t cover the cover charge.', { sound: false });
    state.bank.cash -= FEE; state.comedyTickets = (state.comedyTickets || 0) + 1; sfx('coin');
    if (!server.ai) return stage(pick(BLAND_BITS), false);
    comedyBusy = true;
    openModal((m) => m.append(h('h3', {}, '\ud83c\udfa4 The Drizzle Room'), h('p', {}, `${comic} taps the mic and looks thoughtful\u2026`)));
    const t = await aiText('You are a struggling but earnest stand-up comedian at a small comedy club in a rainy Pacific Northwest international district. Write ONE original, family-friendly 3 to 5 sentence bit with a setup and punchline. Observational and a little weird. No real people, no profanity. Reply with only the bit.', [{ role: 'user', content: `Come up with an original comedy bit. Today is day ${state.day}, weather: ${state.weather}. Your name is ${comic}.` }]);
    comedyBusy = false;
    if (!modalOpen) return;
    stage(t ? t.trim().slice(0, 700) : pick(BLAND_BITS), !!t);
  };
  next();
}

function enterVenue(d) {
  if (d.special === 'dojo') return enterDojo();
  if (d.special === 'crystal') return enterCrystalShop();
  if (d.special === 'home') return enterHome();
  if (d.special === 'cellar') return enterCellar();
  if (d.special === 'comedy') return enterComedy();
  if (d.special === 'mushroom') return enterMushroom();
  const def = defOf(d.bizId) || {};
  // Civic venues (library, bank, station…) aren't economy businesses; show them with a stand-in record.
  const b = state.businesses[d.bizId] || (def.id ? { id: def.id, name: def.name, type: def.type, owner: 'public', state: 'open', reputation: 0, buzz: 0, bank: def.bank } : null);
  if (!b) return;
  const hour = Math.floor(state.minutes / 60) % 24;
  const open = d.bizId === 'station' || def.public ? true : eco.hoursOpen(b, hour);
  sfx('door');
  if (b.state === 'vacant' && d.bizId !== 'station') return vacantModal(b);
  if (b.state === 'renovating' && b.owner === 'player') return openModal((c) => c.append(h('h3', {}, `${b.name} — under renovation`), h('p', {}, `Dust sheets and ladders. Finish ${eco.RENOVATION_PROJECTS} major projects to open the doors (${b.enhancements.length}/${eco.RENOVATION_PROJECTS} done).`), h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => { closeModal(); phone.open('settings', { tab: 'Business' }); } }, 'Renovation projects'), h('button', { class: 'btn warn', onclick: closeModal }, 'Leave'))));
  if (b.state !== 'open' && d.bizId !== 'station') return notify(`${b.name} is ${b.state}.`, { sound: false });
  if (!open && b.type !== 'hotel') return notify(`${b.name} is closed. Hours ${b.hours[0]}:00–${b.hours[1]}:00.`, { sound: false });
  if (b.owner === 'player' && b.type === 'coffee' || b.owner === 'player' && b.type === 'restaurant') { b.totalVisitors++; }
  const t = b.type;
  openModal((c) => {
    c.append(h('h3', {}, b.name), h('div', { class: 'small' }, b.owner === 'public' ? '' : `${b.style ? b.style + ' · ' : ''}${b.owner === 'player' ? 'Yours' : ''} · rep ${Math.round(b.reputation)} · buzz ${Math.round(b.buzz)}`));
    const menu = G.menuFor(b);
    if (['coffee', 'restaurant', 'donut', 'pub'].includes(t) && menu.length) {
      c.append(h('p', { class: 'small' }, 'You take a seat. Tap an item to look at it.'), h('div', { class: 'menu-items' }, ...menu.map((it) => h('div', { class: 'menu-item', onclick: () => foodModal(b, it) }, itemImg(it[0], it[2], { alt: '' }), h('b', {}, it[0]), h('div', {}, money(G.price(b, it[1])))))));
    }
    if (def.items) {
      const list = h('div', { class: 'menu-items' });
      const draw = () => { list.replaceChildren(...stockFor(def, state.day, (state.extraItems ||= {})[b.id]).map((it) => h('div', { class: 'menu-item', onclick: () => storeConfirm(b, it) }, itemImg(it[0], it[2]), h('b', {}, it[0]), h('div', {}, money(it[1]))))); };
      draw(); c.append(list);
      aiNewArrival(b, def, () => { if (list.isConnected) draw(); });
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
// Store items get the same look-then-confirm step as restaurant dishes, with a clear receipt afterwards.
function storeConfirm(b, it) {
  openModal((c) => c.append(h('h3', {}, it[0]), itemImg(it[0], it[2], { style: 'width:100%;max-height:240px;object-fit:contain;background:#fff;border-radius:12px' }), h('p', {}, it[3] || ''),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { if (state.bank.cash < it[1]) return notify('Not enough funds.'); const owned = it[2] === 'drone' || it[2] === 'camera'; if (owned && state.owns[it[2]]) return notify('You already own that.'); buyItem(b, it); purchased(it[0], it[1], () => enterVenueById(b.id)); }, }, `👍 Buy ${money(it[1])}`), h('button', { class: 'btn warn', onclick: () => enterVenueById(b.id) }, '⛔ Back'))));
}
function purchased(name, price, again) {
  openModal((c) => c.append(h('h3', {}, '✅ Purchased!'), h('p', {}, `${name} — ${money(price)} paid. Balance ${money(state.bank.cash)}.`), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: again }, 'Keep shopping'), h('button', { class: 'btn warn', onclick: closeModal }, 'Leave'))));
}
function buyItem(b, it) {
  if (state.bank.cash < it[1]) return notify('Not enough funds.');
  if ((it[2] === 'drone' || it[2] === 'camera') && state.owns[it[2]]) return notify('You already own that.');
  if (it[2] === 'drone' || it[2] === 'camera') { state.owns[it[2]] = true; notify(it[2] === 'drone' ? '🚁 Drone owned: new screenshot option!' : '📷 Vintage camera: B&W screenshots!'); }
  state.bank.cash -= it[1]; sfx('coin');
  const log = (state.purchases ||= []);
  const rec = log.find((p) => p.name === it[0]);
  if (rec) rec.count++; else { log.push({ name: it[0], kind: kindFor(it[0], it[2]) || null, where: b.name, day: state.day, count: 1 }); notify(`🛍 New for your Purchases: ${it[0]}`, { sound: false }); }
  if (it[2] === 'weed_good') { state.buzzed = { type: 'good', until: state.minutes + 120 }; notify('Colors look… a little weird.', { sound: false }); }
  else if (it[2] === 'weed_brick') { state.buzzed = { type: 'mild', until: state.minutes + 40 }; notify('A slow, mellow warmth. Everything is a little softer.', { sound: false }); }
  else if (!state.owns[it[2]]) notify(`Bought ${it[0]}.`, { sound: false });
}
// With AI on, a shop may stock one new invented product per day (up to 6 per shop), kept in the save.
const aiStockPending = new Set();
function aiNewArrival(b, def, done) {
  if (!server.ai || aiStockPending.has(b.id)) return;
  const extras = (state.extraItems ||= {})[b.id] ||= [];
  const seen = (state.aiStockDay ||= {});
  if (seen[b.id] === state.day || extras.length >= 6) return;
  aiStockPending.add(b.id);
  const have = stockFor(def, state.day, extras).map((i) => i[0]).join(', ');
  aiJson('You invent fun, collectible, family-friendly products for small shops in a cozy rainy Seattle-style neighborhood game.',
    `Shop: ${b.name} (${b.type}). Already stocked: ${have}. Invent ONE new product that fits this shop and is not on that list. Reply as {"name":"2-4 words","price":number,"desc":"one short sentence"}. Price between 2 and 40.`).then((r) => {
    const j = Array.isArray(r) ? r[0] : r;
    const name = String(j?.name || '').replace(/[<>"]/g, '').trim().slice(0, 32);
    const price = Math.max(2, Math.min(60, Math.round(Number(j?.price) || 0)));
    if (!name || !price || have.toLowerCase().includes(name.toLowerCase())) return;
    extras.push([name, price, undefined, String(j.desc || '').replace(/[<>]/g, '').slice(0, 120)]);
    seen[b.id] = state.day; notify(`✨ New at ${b.name}: ${name}`, { sound: false }); done();
  }).catch(() => {}).finally(() => aiStockPending.delete(b.id));
}
function sleep(b, cost = 120) {
  if (state.bank.cash < cost) return notify('Not enough funds.');
  state.bank.cash -= cost; closeModal();
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
  const cv = $('#game'); cv.style.filter = mood === 'good' ? 'hue-rotate(40deg) saturate(1.6)' : mood === 'shroom' ? `hue-rotate(${Math.round(Math.sin(t * 0.6) * 50)}deg) saturate(1.8)` : mood === 'mild' ? 'hue-rotate(15deg) saturate(1.2)' : cs ? 'sepia(.45) saturate(1.4) hue-rotate(-20deg) contrast(1.08)' : '';
  if (mood && mood !== 'good' && mood !== 'mild' && mood !== 'shroom') { shake = Math.sin(t * 2) * 0.6; }
  renderer.render(scene, camera);
}

function tick(dt) {
  if (!cs) { state.day = Math.floor(state.minutes / 1440) + 1; eco.advance(state, dt * 2); }
  state.weather = env.weather;
  env.update(dt, state.minutes, camera.position, world.lamps, world.nightGlow); world.water?.tick(dt);
  if (world.homeGlow) { const k = 0.8 + Math.sin(t * 1.7) * 0.2; world.homeGlow.light.intensity = 14 * k; world.homeGlow.halo.material.opacity = 0.18 + 0.12 * k; }  if (world.flame) world.flame.scale.y = 0.8 + Math.sin(t * 11) * 0.2;
  traffic.update(dt, player.ride || player.scooter || player.inside ? null : player, npcSys.list); tramSys.update(dt); rideshare.update(dt, traffic.agents, player.ride || player.inside ? null : player, npcSys.list, npcSys, player);
  npcSys.update(dt, t, player, env, state.minutes);
  handleActions();
  movePlayer(dt);
  // prompt
  const tg = nearbyTargets()[0]; const n = npcNear(3.2);
  prompt_(cs ? (player.drive ? '🚘 arrows drive · 💬 horn · ▶️ get out' : tg ? `▶️ ${tg.label}` : n ? `💬 Talk to ${n.persona.name}` : '') : player.ride === 'bus' ? (player.bus.stopReq ? 'Stopping…' : '▶️ request stop') : player.ride === 'robo' ? '🤖 Robot Driver is taking you there' : player.ride === 'tram' ? '▶️ get off at a stop' : player.scooter ? '' : tg ? `▶️ ${tg.label}` : n ? `💬 Talk to ${n.persona.name}` : '');
  // rain sfx & night traffic hum skipped; random chats
  if (!cs) { msgT -= dt; if (msgT <= 0) { msgT = rand(80, 160); contactMessage(); }
  saveT += dt; if (saveT > 45) { saveT = 0; saveLocal(); }
  if (eco.needsBailout(state) && !state.bailNudged) { state.bailNudged = true; notify('🆘 Funds are low. A bailout is available in Settings → Stats.', { kind: 'decision', onclick: () => phone.open('settings', { tab: 'Stats' }) }); } }
}

async function contactMessage() {
  const prefs = state.chatPrefs || {};
  const pool = state.contacts.filter((c) => prefs[c] !== 'blocked');
  if (!pool.length) return;
  const name = pick(pool);
  const fake = { persona: { name, occupation: 'friend', mood: 'friendly' } };
  const text = server.ai ? (await npcReply(fake, [{ role: 'user', content: 'Send a short friendly text message to the player about your day.' }], 'chat')) : pick(['Rain again! Coffee later?', 'Saw the streetcar get stuck behind a delivery truck 😂', 'Just heard a rumor about a new ramen place.']);
  if ((state.chatPrefs || {})[name] === 'blocked') return;
  (state.chats[name] ||= []).push(fake.aiReply ? { text, ai: true } : { text });
  if ((state.chatPrefs || {})[name] === 'muted') return;
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
  if (y < 2 && traffic) [x, z] = traffic.push(x, z, r);
  return [x, z];
}

function movePlayer(dt) {
  const mv = readMove();
  const wob = state.buzzed && state.minutes < state.buzzed.until && state.buzzed.type !== 'good' && state.buzzed.type !== 'mild' && state.buzzed.type !== 'shroom';
  if (player.eating > 0) player.eating -= dt;
  if (player.ride === 'tram') {
    const p = tramSys.tram.pos; player.x = p.x; player.z = p.z; player.y = 0.9; player.speed = 0;
  } else if (player.ride === 'bus') {
    const a = player.bus, p = a.mesh.position; player.x = p.x; player.z = p.z; player.y = 1.2; player.speed = 0; player.heading = a.h;
    if (a.stopReq && a.v < 0.5) alightBus();
  } else if (player.ride === 'robo') {
    const c = rideshare.center(); player.x = c.x; player.z = c.z; player.y = 1.0; player.speed = 0; player.heading = c.h;
  } else if (player.drive) {
    driveCar(dt, mv);
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
    const spd = (wob ? 2.6 : (input.run ? 7 : 4)) * (player.eating > 0 ? 0.3 : 1);
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
  fadeBridge(dt);
}

// The highway deck turns see-through while the player is underneath it (e.g. dealing under the bridge).
function fadeBridge(dt) {
  const ub = world.underBridge, parts = world.bridgeParts; if (!ub || !parts) return;
  const under = player.y < 8 && player.x > ub.x0 && player.x < ub.x1 && player.z > ub.z0 && player.z < ub.z1;
  const target = under ? 0.12 : 1;
  for (const m of parts) { const mt = m.material; if (Math.abs(mt.opacity - target) > 0.01) { mt.opacity += (target - mt.opacity) * Math.min(1, dt * 6); mt.depthWrite = mt.opacity > 0.9; } else mt.opacity = target; }
}

boot().catch((e) => { console.error(e); $('#intro-status').textContent = 'Failed to start: ' + e.message; });
