// Low-poly humanoids, animals and vehicles (mid-90s polygon vibe: boxes, flat shading, toy colours).
import * as THREE from '../vendor/three.module.min.js';
import { rand, pick } from './util.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

const SKIN = ['#f1c9a0', '#d9a27a', '#b57a55', '#8a5a3c', '#f4d8b8', '#c68e68'];
const HAIR = ['#2b1e14', '#4a3020', '#1b1b1b', '#8a6a3a', '#c9a45a', '#6a6a6a'];
const SHIRTS = ['#6f8f4e', '#e3b93c', '#4f7a96', '#d9772b', '#8a8f8c', '#7a5a3c', '#c9c0a0', '#4f6b3a', '#5d6a70', '#b08a3c'];
const PANTS = ['#3f4a52', '#5a4a3a', '#2f3b40', '#6a6a5a', '#4a5a6a', '#2b2f2a'];

export function randomOutfit() {
  return { skin: pick(SKIN), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), hairStyle: pick(['short', 'short', 'long', 'bun', 'cap', 'none']), cap: pick(SHIRTS), scale: rand(0.92, 1.06), slim: Math.random() < 0.5 };
}

export function makeHuman(o) {
  const g = new THREE.Group();
  const s = o.scale || 1, w = o.slim ? 0.62 : 0.72;
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.17], [legR, 0.17]]) {
    const m = box(0.3, 0.85, 0.32, o.skinLegs ? o.skin : o.pants); m.position.y = -0.42; leg.add(m);
    const shoe = box(0.32, 0.12, 0.44, o.shoes || '#2b2f2a'); shoe.position.set(0, -0.86, 0.06); leg.add(shoe);
    leg.position.set(x, 0.92, 0); g.add(leg);
  }
  const torso = box(w, 0.85, 0.42, o.shirt); torso.position.y = 1.4; g.add(torso);
  if (o.skirt) { const sk = box(w + 0.06, 0.4, 0.46, o.skirt); sk.position.y = 1.0; g.add(sk); }
  if (o.hoodie) { const hd = box(0.5, 0.18, 0.2, o.shirt); hd.position.set(0, 1.86, -0.2); g.add(hd); }
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -(w / 2 + 0.1)], [armR, w / 2 + 0.1]]) {
    const m = box(0.2, 0.75, 0.22, o.skinArms ? o.skin : o.shirt); m.position.y = -0.34; arm.add(m);
    const hand = box(0.18, 0.16, 0.18, o.skin); hand.position.y = -0.76; arm.add(hand);
    arm.position.set(x, 1.76, 0); g.add(arm);
  }
  const head = box(0.42, 0.44, 0.42, o.skin); head.position.y = 2.0; g.add(head);
  const eyeMat = mat('#2b2f2a');
  for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), eyeMat); e.position.set(x, 2.03, 0.215); g.add(e); }
  const hs = o.hairStyle;
  if (hs !== 'none' && !o.helmet) {
    const top = box(0.46, 0.14, 0.46, o.hair); top.position.y = 2.25; g.add(top);
    const back = box(0.46, hs === 'long' ? 0.7 : 0.4, 0.12, o.hair); back.position.set(0, hs === 'long' ? 1.95 : 2.05, -0.22); g.add(back);
    if (hs === 'long') for (const x of [-0.23, 0.23]) { const sd = box(0.06, 0.55, 0.3, o.hair); sd.position.set(x, 2.0, -0.05); g.add(sd); }
    if (hs === 'bun') { const bun = box(0.2, 0.2, 0.2, o.hair); bun.position.set(0, 2.4, -0.1); g.add(bun); }
  }
  if (o.cap) {
    const c = box(0.48, 0.16, 0.48, o.cap); c.position.y = 2.28; g.add(c);
    const brim = box(0.4, 0.04, 0.26, o.cap); brim.position.set(0, 2.22, 0.34); g.add(brim);
  }
  if (o.helmet) {
    const hm = box(0.5, 0.52, 0.5, '#b08a3c'); hm.position.y = 2.06; g.add(hm);
    const visor = box(0.1, 0.34, 0.04, '#2b2f2a'); visor.position.set(0, 2.0, 0.26); g.add(visor);
    const crest = box(0.1, 0.22, 0.6, '#d9772b'); crest.position.y = 2.42; g.add(crest);
  }
  if (o.cloak) { const c = box(0.7, 1.1, 0.06, o.cloak); c.position.set(0, 1.35, -0.28); g.add(c); }
  if (o.shield) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 12), mat('#b08a3c')); sh.rotation.z = Math.PI / 2; sh.position.set(-0.52, 1.2, 0.1); sh.rotation.y = 0; g.add(sh); }
  if (o.bag) { const b = box(0.34, 0.3, 0.14, o.bag); b.position.set(0.3, 1.0, 0.26); g.add(b); }
  g.scale.setScalar(s);
  g.userData = { legL, legR, armL, armR, phase: Math.random() * 6 };
  return g;
}

export function animateHuman(g, speed, t, seated = false) {
  const u = g.userData;
  const sw = Math.sin(t * 9 + u.phase) * Math.min(1, speed / 2) * 0.7;
  u.legL.rotation.x = seated ? -1.4 : sw; u.legR.rotation.x = seated ? -1.4 : -sw;
  u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
}

export function makeSpecial(kind) {
  const base = randomOutfit();
  if (kind === 'dan') return makeHuman({ ...base, skin: '#e3b890', shirt: '#6a7260', pants: '#4a6a8a', cap: '#2f3b40', hairStyle: 'short', hoodie: true, slim: false, scale: 1.02 });
  if (kind === 'jes') return makeHuman({ ...base, skin: '#f1c9a0', shirt: '#e58aa6', skirt: '#f0a0b8', pants: '#e58aa6', hair: '#c9a45a', hairStyle: 'long', cap: null, slim: true, bag: '#f4d0dc' });
  if (kind === 'spartan') return makeHuman({ ...base, skin: '#d9a27a', shirt: '#b08a3c', skirt: '#8a4a22', skinLegs: true, skinArms: true, helmet: true, cloak: '#c8501f', shield: true, shoes: '#7a5a3c', cap: null, slim: false, scale: 1.08 });
  return makeHuman(base);
}

export function makePlayerModel() {
  return makeHuman({ skin: '#d9a27a', shirt: '#2f4358', skirt: '#2f3b40', pants: '#2f3b40', hair: '#2b1e14', hairStyle: 'long', cap: null, slim: true, bag: '#d9772b', shoes: '#4a3020', scale: 1.0 });
}

// ------------------------------------------------------------------ parrots
export function makeParrot(color) {
  const g = new THREE.Group();
  const body = box(0.18, 0.26, 0.16, color); body.position.y = 0.22; g.add(body);
  const head = box(0.14, 0.14, 0.14, color); head.position.set(0, 0.42, 0.03); g.add(head);
  const beak = box(0.05, 0.05, 0.07, '#e3b93c'); beak.position.set(0, 0.4, 0.1); g.add(beak);
  const tail = box(0.07, 0.04, 0.3, color === '#6fb04e' ? '#4f6b3a' : '#2f5a9a'); tail.position.set(0, 0.14, -0.2); tail.rotation.x = 0.3; g.add(tail);
  const belly = box(0.16, 0.14, 0.04, '#c9d9a8'); belly.position.set(0, 0.2, 0.09); g.add(belly);
  return g;
}

export function makeLeash(color = '#2b2f2a') {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}
export function updateLeash(line, a, b) { const p = line.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; line.frustumCulled = false; }

// ------------------------------------------------------------------ animals
export function makeAnimal(kind) {
  const g = new THREE.Group();
  if (kind === 'pigeon') {
    const b = box(0.28, 0.2, 0.44, '#7a8088'); b.position.y = 0.24; g.add(b);
    const hd = box(0.14, 0.14, 0.14, '#5d6a70'); hd.position.set(0, 0.4, 0.22); g.add(hd);
    const bk = box(0.04, 0.04, 0.08, '#e3b93c'); bk.position.set(0, 0.38, 0.32); g.add(bk);
    const nk = box(0.12, 0.05, 0.1, '#6fa08a'); nk.position.set(0, 0.34, 0.16); g.add(nk);
    for (const x of [-0.06, 0.06]) { const l = box(0.03, 0.14, 0.03, '#d9772b'); l.position.set(x, 0.07, 0); g.add(l); }
  } else if (kind === 'gull') {
    const b = box(0.4, 0.3, 0.7, '#f2f0e6'); b.position.y = 0.4; g.add(b);
    const w = box(0.46, 0.06, 0.5, '#8a8f8c'); w.position.set(0, 0.56, -0.05); g.add(w);
    const hd = box(0.2, 0.2, 0.22, '#f2f0e6'); hd.position.set(0, 0.7, 0.4); g.add(hd);
    const bk = box(0.06, 0.06, 0.2, '#e3b93c'); bk.position.set(0, 0.68, 0.58); g.add(bk);
    for (const x of [-0.08, 0.08]) { const l = box(0.04, 0.26, 0.04, '#d9772b'); l.position.set(x, 0.13, 0); g.add(l); }
  } else if (kind === 'raccoon') {
    const b = box(0.5, 0.4, 0.9, '#7a7a76'); b.position.y = 0.4; g.add(b);
    const hd = box(0.36, 0.3, 0.32, '#8a8a84'); hd.position.set(0, 0.52, 0.55); g.add(hd);
    const mk = box(0.38, 0.1, 0.05, '#2b2f2a'); mk.position.set(0, 0.54, 0.72); g.add(mk);
    const ns = box(0.1, 0.08, 0.1, '#2b2f2a'); ns.position.set(0, 0.46, 0.74); g.add(ns);
    for (const x of [-0.12, 0.12]) { const e = box(0.1, 0.1, 0.06, '#5a5a56'); e.position.set(x, 0.72, 0.5); g.add(e); }
    for (let i = 0; i < 4; i++) { const r = box(0.2, 0.2, 0.18, i % 2 ? '#2b2f2a' : '#a8a8a0'); r.position.set(0, 0.5, -0.55 - i * 0.18); g.add(r); }
    for (const x of [-0.18, 0.18]) for (const z of [-0.3, 0.3]) { const l = box(0.1, 0.2, 0.1, '#3f3f3c'); l.position.set(x, 0.1, z); g.add(l); }
  } else if (kind === 'dog') {
    const c = pick(['#b08a5a', '#3f3f3c', '#d9c9a0', '#8a5a3c']);
    const b = box(0.35, 0.35, 0.7, c); b.position.y = 0.5; g.add(b);
    const hd = box(0.3, 0.3, 0.3, c); hd.position.set(0, 0.8, 0.4); g.add(hd);
    const tl = box(0.08, 0.08, 0.3, c); tl.position.set(0, 0.7, -0.45); tl.rotation.x = -0.6; g.add(tl);
    for (const x of [-0.12, 0.12]) for (const z of [-0.25, 0.25]) { const l = box(0.1, 0.35, 0.1, c); l.position.set(x, 0.18, z); g.add(l); }
  } else if (kind === 'pelican') {
    const c = '#6b5a48';
    const b = box(0.5, 0.4, 0.9, '#f2f0e6'); b.position.y = 0.55; g.add(b);
    const nk = box(0.14, 0.4, 0.14, '#f2f0e6'); nk.position.set(0, 0.85, 0.4); nk.rotation.x = -0.35; g.add(nk);
    const hd = box(0.22, 0.2, 0.24, '#e8d9a0'); hd.position.set(0, 1.05, 0.5); g.add(hd);
    const bk = box(0.12, 0.1, 0.7, '#d9a05a'); bk.position.set(0, 1.0, 0.95); g.add(bk);
    const pouch = box(0.1, 0.12, 0.5, '#b8744a'); pouch.position.set(0, 0.9, 0.9); g.add(pouch);
    const tail = box(0.2, 0.06, 0.4, c); tail.position.set(0, 0.5, -0.6); g.add(tail);
    for (const x of [-0.12, 0.12]) { const l = box(0.05, 0.3, 0.05, '#4a4a46'); l.position.set(x, 0.15, 0); g.add(l); }
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.26, 0.68, 0);
      const wing = box(1.5, 0.05, 0.55, c); wing.position.x = s * 0.75; pivot.add(wing);
      const tip = box(0.5, 0.05, 0.4, '#3a3028'); tip.position.x = s * 1.7; pivot.add(tip);
      g.add(pivot); wings.push(pivot);
    }
    g.userData.wings = wings;
  }
  return g;
}

// ------------------------------------------------------------------ vehicles (curvy, toy-like)
const TOY = ['#e3b93c', '#6f8f4e', '#4f7a96', '#d9772b', '#8a8f8c', '#c9c0a0', '#7a5a3c', '#4f6b3a', '#5d8aa6'];
function caps(r, len, color, sx = 1, sy = 0.75) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat(color));
  m.rotation.x = Math.PI / 2; m.scale.set(sx, 1, sy); return m;
}
function wheel(r, w, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), mat('#1f2320')); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m;
}

function shadeHex(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }

export function makeVehicle(type) {
  const g = new THREE.Group();
  const color = pick(TOY);
  if (type === 'car') {
    const roll = Math.random();
    if (roll < 0.3) { // classic round car
      const b = caps(1.0, 2.0, color, 1, 0.62); b.position.y = 0.75; g.add(b);
      const cab = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), mat('#cfe0e4')); cab.scale.set(0.95, 0.65, 1.2); cab.position.set(0, 1.3, -0.1); g.add(cab);
      for (const x of [-0.95, 0.95]) for (const z of [-1.3, 1.3]) g.add(wheel(0.38, 0.28, x, 0.38, z));
      const hl = box(1.3, 0.14, 0.05, '#f2e6a8'); hl.position.set(0, 0.8, 2.0); g.add(hl);
    } else if (roll < 0.88) { // boxy crossover SUV
      const b = box(2.0, 0.95, 4.2, color); b.position.y = 0.95; g.add(b);
      const cab = box(1.84, 0.8, 2.9, color); cab.position.set(0, 1.8, -0.35); g.add(cab);
      const gl = box(1.88, 0.55, 2.6, '#2f3b40'); gl.position.set(0, 1.85, -0.35); g.add(gl);
      const roof = box(1.9, 0.1, 2.95, shadeHex(color, 0.82)); roof.position.set(0, 2.25, -0.35); g.add(roof);
      const rack = box(1.5, 0.08, 2.2, '#2b2f2a'); rack.position.set(0, 2.34, -0.35); if (Math.random() < 0.5) g.add(rack);
      for (const x of [-0.98, 0.98]) for (const z of [-1.35, 1.35]) g.add(wheel(0.42, 0.28, x, 0.42, z));
      const hl = box(1.6, 0.16, 0.05, '#f2e6a8'); hl.position.set(0, 1.05, 2.12); g.add(hl);
      const gr = box(1.2, 0.3, 0.05, '#2b2f2a'); gr.position.set(0, 0.7, 2.12); g.add(gr);
      const tl = box(1.6, 0.14, 0.05, '#b33a2a'); tl.position.set(0, 1.1, -2.12); g.add(tl);
    } else { // pickup truck
      const b = box(2.0, 0.85, 4.6, color); b.position.y = 0.9; g.add(b);
      const cab = box(1.9, 0.9, 1.7, color); cab.position.set(0, 1.78, 0.8); g.add(cab);
      const gl = box(1.94, 0.55, 1.45, '#2f3b40'); gl.position.set(0, 1.85, 0.82); g.add(gl);
      const bed = box(1.7, 0.5, 1.9, '#2f3234'); bed.position.set(0, 1.4, -1.4); g.add(bed);
      for (const x of [-0.98, 0.98]) { const w = box(0.06, 0.4, 2.0, color); w.position.set(x * 0.9, 1.5, -1.4); g.add(w); }
      for (const x of [-1, 1]) for (const z of [-1.4, 1.45]) g.add(wheel(0.46, 0.3, x, 0.46, z));
      const hl = box(1.6, 0.16, 0.05, '#f2e6a8'); hl.position.set(0, 1.0, 2.32); g.add(hl);
      const gr = box(1.2, 0.3, 0.05, '#2b2f2a'); gr.position.set(0, 0.7, 2.32); g.add(gr);
    }
  } else if (type === 'bus') {
    const b = caps(1.35, 6.4, '#e3b93c', 1, 0.95); b.position.y = 1.75; g.add(b);
    const band = box(2.72, 0.7, 9.2, '#2f3b40'); band.position.y = 2.15; g.add(band);
    const stripe = box(2.74, 0.25, 9.4, '#6f8f4e'); stripe.position.y = 1.4; g.add(stripe);
    for (const x of [-1.25, 1.25]) for (const z of [-3.2, 3.2]) g.add(wheel(0.55, 0.35, x, 0.55, z));
  } else if (type === 'motorcycle') {
    const b = caps(0.3, 1.0, color, 1, 1); b.position.y = 0.7; g.add(b);
    g.add(wheel(0.4, 0.14, 0, 0.4, 0.9)); g.add(wheel(0.4, 0.14, 0, 0.4, -0.9));
    const r = box(0.4, 0.7, 0.3, '#2f3b40'); r.position.set(0, 1.25, -0.2); g.add(r);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat('#d9772b')); hd.position.set(0, 1.75, -0.15); g.add(hd);
  } else { // bicycle / scooter
    g.add(wheel(0.36, 0.08, 0, 0.36, 0.7)); g.add(wheel(0.36, 0.08, 0, 0.36, -0.7));
    const fr = box(0.08, 0.08, 1.4, color); fr.position.y = 0.6; g.add(fr);
    const r = box(0.35, 0.7, 0.25, '#4f7a96'); r.position.set(0, 1.15, -0.1); g.add(r);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat('#e3b93c')); hd.position.set(0, 1.68, -0.1); g.add(hd);
  }
  return g;
}

// Player's city scooter (free to all).
export function makeScooter() {
  const g = new THREE.Group();
  g.add(wheel(0.28, 0.1, 0, 0.28, 0.6)); g.add(wheel(0.28, 0.1, 0, 0.28, -0.6));
  const deck = box(0.3, 0.08, 1.1, '#6f8f4e'); deck.position.y = 0.34; g.add(deck);
  const stem = box(0.06, 1.1, 0.06, '#8a8f8c'); stem.position.set(0, 0.9, 0.55); g.add(stem);
  const bar = box(0.6, 0.05, 0.05, '#2b2f2a'); bar.position.set(0, 1.45, 0.55); g.add(bar);
  const badge = box(0.2, 0.12, 0.02, '#e3b93c'); badge.position.set(0, 1.1, 0.6); g.add(badge);
  return g;
}

export function makeStreetcar() {
  const g = new THREE.Group();
  const body = caps(1.35, 7.0, '#e3b93c', 1, 1.05); body.position.y = 2.2; g.add(body);
  const roofc = caps(1.2, 7.0, '#4f6b3a', 0.9, 0.35); roofc.position.y = 3.6; g.add(roofc);
  const win = box(2.74, 0.8, 9.6, '#2f3b40'); win.position.y = 2.6; g.add(win);
  const stripe = box(2.76, 0.3, 9.8, '#d9772b'); stripe.position.y = 1.5; g.add(stripe);
  const pole = box(0.06, 1.4, 0.06, '#2b2f2a'); pole.position.set(0, 4.3, -2); pole.rotation.x = 0.4; g.add(pole);
  for (const z of [-3.2, 3.2]) { g.add(wheel(0.5, 0.3, -1.0, 0.5, z)); g.add(wheel(0.5, 0.3, 1.0, 0.5, z)); }
  const nose = box(1.6, 0.4, 0.1, '#fff6cc'); nose.position.set(0, 2.0, 4.9); g.add(nose);
  return g;
}
