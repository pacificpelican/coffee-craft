// The Alta Redwood Pier (a big boardwalk pier out over the canal) and the construction site with a climbable tower crane.
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex, signTexture } from './art.js';
import { mat } from './actors.js';

// The pier runs west from the quay, across from the old laundromat; x1 is the far end.
export const PIER = { x0: -132.8, x1: -173.2, z0: 42, z1: 62, deck: 0.56 };
// People who hang around on the pier: x, z, facing heading, occupation, quirk.
export const PIER_FOLK = [
  [-155, 43.4, Math.PI, 'pier fisherman', 'has fished here since 1987 and caught exactly one boot'],
  [-171.4, 59.5, 0, 'pier fisherman', 'swears the big one is down there somewhere; talks about it constantly'],
  [-136.5, 52, -Math.PI / 2, 'tourist', 'here from out of town, photographing everything including pigeons'],
  [-158.5, 54.6, Math.PI / 2, 'busker', 'plays one sea shanty on a ukulele, very earnestly'],
  [-170.4, 54.2, -Math.PI / 2, 'tourist', 'keeps feeding quarters into the coin binoculars'],
  [-148, 54.7, 0, 'kid with taffy', 'is sticky and unbothered'],
];

const bx = (parent, w, h, d, color, x, y, z, opts) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts)); m.position.set(x, y, z); parent.add(m); return m; };
// A box beam from (x1,y1) to (x2,y2) lying in the XY plane at depth z.
const beam = (parent, x1, y1, x2, y2, z, th, color) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), th, th), mat(color));
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, z); m.rotation.z = Math.atan2(y2 - y1, x2 - x1); parent.add(m); return m;
};
const glowBulb = (parent, x, y, z, r = 0.16) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), new THREE.MeshBasicMaterial({ color: '#9a9a80' })); m.position.set(x, y, z); parent.add(m); return m; };
const signMesh = (parent, text, sub, bg, fg, w, h, x, y, z, ry = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(THREE, text, bg, fg, sub) }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
};
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function buildPier(scene, world) {
  const g = new THREE.Group(); scene.add(g);
  const { x0, x1, z0, z1, deck } = PIER;
  const len = x0 - x1, w = z1 - z0, cxp = (x0 + x1) / 2, czp = (z0 + z1) / 2;
  const solid = world.solid;

  // deck and boards
  bx(g, len, 0.36, w, '#4a3a28', cxp, deck - 0.2, czp);
  const boards = canvasTex(128, 128, (c, tw, th) => {
    c.fillStyle = '#8f6f4c'; c.fillRect(0, 0, tw, th);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = `rgba(${i % 2 ? '255,230,190' : '0,0,0'},${0.05 + (i * 37 % 10) / 100})`; c.fillRect(0, i * 16, tw, 16);
      c.fillStyle = 'rgba(20,10,0,.45)'; c.fillRect(0, i * 16, tw, 1.5);
      c.fillRect((i * 53) % tw, i * 16, 1.5, 16);
    }
  }, THREE, true);
  boards.repeat.set(len / 6, w / 6);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshLambertMaterial({ map: boards }));
  top.rotation.x = -Math.PI / 2; top.position.set(cxp, deck - 0.015, czp); g.add(top);
  // pilings and cross beams under the deck
  const pileG = new THREE.CylinderGeometry(0.32, 0.4, 3.6, 6);
  for (let x = x0 - 2; x > x1; x -= 5) {
    for (const z of [z0 + 0.8, 47, 52, 57, z1 - 0.8]) { const p = new THREE.Mesh(pileG, mat('#3a2e22')); p.position.set(x, -1.2, z); g.add(p); }
    bx(g, 0.3, 0.3, w, '#3a2e22', x, deck - 0.5, czp);
  }
  // railings and lamp posts along both edges and around the end
  for (const z of [z0 + 0.15, z1 - 0.15]) bx(g, len, 0.1, 0.1, '#e9e0c8', cxp, deck + 1.05, z);
  bx(g, 0.1, 0.1, w, '#e9e0c8', x1 + 0.15, deck + 1.05, czp);
  for (let x = x0 - 2; x > x1 + 0.5; x -= 4) for (const z of [z0 + 0.15, z1 - 0.15]) bx(g, 0.14, 1.1, 0.14, '#e9e0c8', x, deck + 0.55, z);
  for (let z = z0 + 2; z < z1 - 1; z += 4) bx(g, 0.14, 1.1, 0.14, '#e9e0c8', x1 + 0.15, deck + 0.55, z);
  for (let x = -137; x > x1 + 1; x -= 7) for (const z of [z0 + 0.6, z1 - 0.6]) {
    bx(g, 0.18, 4.6, 0.18, '#25292a', x, deck + 2.3, z);
    world.lamps.push(glowBulb(g, x, deck + 4.8, z, 0.34));
  }

  // entrance arch with the big sign
  for (const z of [z0 + 1.6, z1 - 1.6]) { bx(g, 0.7, 8.2, 0.7, '#b8432f', -134.2, deck + 4.1, z); bx(g, 1.1, 0.3, 1.1, '#e9e0c8', -134.2, deck + 0.15, z); }
  bx(g, 0.5, 3.2, w - 1.8, '#2f4a6a', -134.2, deck + 9.2, czp);
  signMesh(g, 'ALTA REDWOOD PIER', 'rides · games · fish & chips · est. 1923', '#2f4a6a', '#fff6dc', w - 2.6, 2.9, -133.9, deck + 9.2, czp, Math.PI / 2);
  signMesh(g, 'ALTA REDWOOD PIER', 'rides · games · fish & chips · est. 1923', '#2f4a6a', '#fff6dc', w - 2.6, 2.9, -134.5, deck + 9.2, czp, -Math.PI / 2);
  for (let i = 0; i <= 12; i++) { const z = z0 + 1.6 + (w - 3.2) * i / 12; world.lamps.push(glowBulb(g, -134.2, deck + 11, z, 0.2)); }

  // ---- Sky Wheel (Ferris wheel)
  const FW = { x: -163.5, z: 47.5, hy: deck + 10.4, R: 8.2, n: 12, omega: 0.22 };
  const wheel = new THREE.Group(); wheel.position.set(FW.x, FW.hy, FW.z); g.add(wheel);
  for (const zz of [-0.75, 0.75]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(FW.R, 0.14, 5, 36), mat('#e9e0c8')); rim.position.z = zz; wheel.add(rim);
    for (let k = 0; k < FW.n; k++) { const a = k * 2 * Math.PI / FW.n; beam(wheel, 0, 0, FW.R * Math.cos(a), FW.R * Math.sin(a), zz, 0.1, '#c9c2ae'); }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 10), mat('#b8432f')); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  const gondolas = [];
  const GCOL = ['#d9772b', '#4f7a96', '#e3b93c', '#6f8f4e', '#b8432f', '#8a6ab0'];
  for (let i = 0; i < FW.n; i++) {
    const a = i * 2 * Math.PI / FW.n;
    const pivot = new THREE.Group(); pivot.position.set(FW.R * Math.cos(a), FW.R * Math.sin(a), 0); wheel.add(pivot);
    bx(pivot, 1.6, 1.1, 1.4, GCOL[i % GCOL.length], 0, -1.1, 0); bx(pivot, 1.9, 0.14, 1.7, '#e9e0c8', 0, -0.5, 0);
    bx(pivot, 0.08, 0.6, 0.08, '#2b2f2a', 0, -0.25, 0);
    gondolas.push({ pivot, a });
  }
  for (let k = 0; k < 24; k++) { const a = k * 2 * Math.PI / 24; world.lamps.push(glowBulb(wheel, (FW.R + 0.3) * Math.cos(a), (FW.R + 0.3) * Math.sin(a), 0, 0.18)); }
  for (const zz of [-0.9, 0.9]) for (const sx of [-1, 1]) beam(g, FW.x, FW.hy, FW.x + sx * 5.6, deck, FW.z + zz, 0.36, '#d9d0b8');
  solid(FW.x - 6.2, FW.x - 5, FW.z - 1.4, FW.z + 1.4, 99); solid(FW.x + 5, FW.x + 6.2, FW.z - 1.4, FW.z + 1.4, 99);
  bx(g, 2.4, 2.6, 2, '#b8432f', FW.x, deck + 1.3, 50.6); bx(g, 2.8, 0.2, 2.4, '#e9e0c8', FW.x, deck + 2.7, 50.6);
  signMesh(g, 'SKY WHEEL', 'one turn · $4', '#2f4a6a', '#fff6dc', 2.3, 0.8, FW.x, deck + 1.6, 51.62, 0);
  solid(FW.x - 1.3, FW.x + 1.3, 49.5, 51.7, 99);
  world.interactables.push({ type: 'ferris', x: FW.x, z: 53.2, r: 2.2, label: 'Ride the Sky Wheel — $4' });

  // ---- carousel
  const CAR = { x: -146.8, z: 48.5, r: 4.1 };
  const car = new THREE.Group(); car.position.set(CAR.x, deck, CAR.z); g.add(car);
  const spin = new THREE.Group(); car.add(spin);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(CAR.r, CAR.r, 0.3, 16), mat('#a8741a')); platform.position.y = 0.15; car.add(platform);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.6, 8), mat('#e3b93c')); pole.position.y = 2.4; spin.add(pole);
  const horses = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, hg = new THREE.Group(); hg.position.set(Math.cos(a) * 2.7, 1.4, Math.sin(a) * 2.7); hg.rotation.y = -a;
    const col = ['#e9e0c8', '#7a5a3c', '#2b2f2a', '#d9a050'][i % 4];
    bx(hg, 1.1, 0.5, 0.5, col, 0, 0.2, 0); bx(hg, 0.3, 0.7, 0.3, col, 0.5, 0.65, 0); bx(hg, 0.5, 0.3, 0.3, col, 0.75, 0.95, 0); bx(hg, 0.1, 0.3, 0.1, '#2b2f2a', -0.65, 0.35, 0);
    bx(hg, 0.07, 2.6, 0.07, '#e3b93c', 0, 1.3, 0); spin.add(hg); horses.push({ hg, i, y: 1.4 });
  }
  for (let i = 0; i < 12; i++) {
    const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0, CAR.r + 0.6, 1.8, 3, 1, false, i * Math.PI / 6, Math.PI / 6), mat(i % 2 ? '#e9e0c8' : '#b8432f', { side: THREE.DoubleSide }));
    wedge.position.y = 5.5; spin.add(wedge);
  }
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; world.lamps.push(glowBulb(car, Math.cos(a) * (CAR.r + 0.5), 4.7, Math.sin(a) * (CAR.r + 0.5), 0.17)); }
  solid(CAR.x - CAR.r, CAR.x + CAR.r, CAR.z - CAR.r, CAR.z + CAR.r, 99);
  world.interactables.push({ type: 'flavor', x: CAR.x, z: CAR.z + CAR.r + 1, r: 1.6, label: 'Carousel', text: ['The carousel plays one song. It has played it since 1923. It is a banger.', 'A painted horse stares at you with ancient, joyful eyes. The ride is closed for “maintenance” (vibes).'] });

  // ---- arcade hall
  const AR = { x0: -153.5, x1: -142.5, z0: 56.5, z1: 61.9 };
  bx(g, AR.x1 - AR.x0, 5.4, AR.z1 - AR.z0, '#3b2f5a', (AR.x0 + AR.x1) / 2, deck + 2.7, (AR.z0 + AR.z1) / 2);
  bx(g, AR.x1 - AR.x0 + 0.6, 0.3, AR.z1 - AR.z0 + 0.6, '#b8432f', (AR.x0 + AR.x1) / 2, deck + 5.55, (AR.z0 + AR.z1) / 2);
  signMesh(g, 'ALTA ARCADE', 'tokens · tickets · skee-ball', '#25183f', '#7ee8ff', 9, 1.6, (AR.x0 + AR.x1) / 2, deck + 4.4, AR.z0 - 0.02, Math.PI);
  const glow = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: ['#ff5fb8', '#5ee6ff', '#e3b93c', '#8aff7a'][i] }));
    m.position.set(AR.x0 + 1.8 + i * 2.6, deck + 1.7, AR.z0 - 0.03); m.rotation.y = Math.PI; g.add(m); glow.push(m);
  }
  solid(AR.x0, AR.x1, AR.z0, AR.z1, 99);
  world.interactables.push({ type: 'arcade', x: (AR.x0 + AR.x1) / 2, z: AR.z0 - 1.2, r: 2.8, label: 'Play at Alta Arcade' });

  // ---- bait & tackle shack
  const BT = { x0: -170, x1: -163, z0: 56.5, z1: 61.9 };
  bx(g, BT.x1 - BT.x0, 3.6, BT.z1 - BT.z0, '#5d7f8a', (BT.x0 + BT.x1) / 2, deck + 1.8, (BT.z0 + BT.z1) / 2);
  const roof = bx(g, BT.x1 - BT.x0 + 0.8, 0.2, BT.z1 - BT.z0 + 0.8, '#6a6458', (BT.x0 + BT.x1) / 2, deck + 3.9, (BT.z0 + BT.z1) / 2); roof.rotation.x = -0.08;
  signMesh(g, 'Redwood Bait & Tackle', 'live worms · cold drinks', '#2f5a7a', '#fff6dc', 5.6, 1.1, (BT.x0 + BT.x1) / 2, deck + 2.7, BT.z0 - 0.02, Math.PI);
  solid(BT.x0, BT.x1, BT.z0, BT.z1, 99);
  world.interactables.push({ type: 'flavor', x: (BT.x0 + BT.x1) / 2, z: BT.z0 - 1.2, r: 2.2, label: 'Bait & Tackle', text: ['“Live worms. Dead worms. Philosophical worms.” — the chalkboard.', 'A tank of minnows regards you. You are not a minnow person. They know.', 'The shopkeeper: “Fish are biting. People are not. Hence, bait.”'] });

  // ---- two food stalls near the entrance
  const stall = (z, dz, name, sub, bg, key, label) => {
    const sx = -139.5;
    bx(g, 3.6, 2.6, 3.4, bg, sx, deck + 1.3, z); bx(g, 3.9, 0.15, 3.7, '#e9e0c8', sx, deck + 3.1, z);
    for (let i = 0; i < 6; i++) bx(g, 0.65, 0.12, 1.1, i % 2 ? '#fff6dc' : '#b8432f', sx - 1.6 + i * 0.64, deck + 2.7, z + dz * 2.1).rotation.x = dz * 0.35;
    signMesh(g, name, sub, '#25292a', '#fff6dc', 3.4, 0.9, sx, deck + 3.8, z + dz * 1.74, dz > 0 ? 0 : Math.PI);
    solid(sx - 1.8, sx + 1.8, z - 1.7, z + 1.7, 99);
    world.interactables.push({ type: 'stall', x: sx, z: z + dz * 3.2, r: 2, label, stall: key });
  };
  stall(44.6, 1, 'Pier Dogs', 'dogs · fries · chowder', '#7a3a1a', 'dogs', 'Pier Dogs — order');
  stall(59.4, -1, 'Taffy & Tea', 'taffy · boba · cold brew', '#2f5a7a', 'taffy', 'Taffy & Tea — order');

  // ---- benches, binoculars, the very end of the pier
  for (const [bxp, bz, rot] of [[-169, 44, 0], [-160, 59.6, Math.PI], [-156, 43.2, 0]]) {
    const b = new THREE.Group();
    bx(b, 2, 0.12, 0.6, '#7a5a3c', 0, 0.55, 0); bx(b, 2, 0.6, 0.1, '#7a5a3c', 0, 0.95, -0.28);
    bx(b, 0.1, 0.5, 0.5, '#2b2f2a', -0.85, 0.28, 0); bx(b, 0.1, 0.5, 0.5, '#2b2f2a', 0.85, 0.28, 0);
    b.position.set(bxp, deck, bz); b.rotation.y = rot; g.add(b);
    world.interactables.push({ type: 'bench', x: bxp, z: bz, r: 1.8, label: 'Bench', y: deck, rot });
  }
  bx(g, 0.3, 1.5, 0.3, '#2b2f2a', -172.2, deck + 0.75, 52); bx(g, 0.9, 0.5, 0.5, '#d9772b', -172.2, deck + 1.6, 52);
  solid(-172.6, -171.8, 51.6, 52.4, 99);
  world.interactables.push({ type: 'flavor', x: -171.2, z: 52, r: 1.9, label: 'Coin binoculars', text: ['Through the binoculars: the skyline, a gull, and — very far away — a man waving at his own binoculars.', 'You peer across the canal. The far wall is gray. Gray has never been so well observed.', 'Binoculars: you can see the crane on the construction site, and a tiny tourist doing a heart pose.'] });

  const clock = { t: 0 };
  const GY = (gd) => FW.hy + FW.R * Math.sin(gd.a + wheel.rotation.z) - 1.6;
  world.pier = {
    ...PIER, glow,
    ferris: {
      period: 2 * Math.PI / FW.omega,
      exit: { x: FW.x, z: 54.2 },
      nearestBottom: () => { let best = 0, bd = 9; gondolas.forEach((gd, i) => { const d = Math.abs(wrapPi(gd.a + wheel.rotation.z + Math.PI / 2)); if (d < bd) { bd = d; best = i; } }); return best; },
      pos: (i) => { const gd = gondolas[i], a = gd.a + wheel.rotation.z; return { x: FW.x + FW.R * Math.cos(a), y: GY(gd), z: FW.z }; },
    },
    tick(dt) {
      clock.t += dt;
      wheel.rotation.z += FW.omega * dt;
      for (const gd of gondolas) gd.pivot.rotation.z = -wheel.rotation.z;
      spin.rotation.y += 0.55 * dt;
      for (const h of horses) h.hg.position.y = 1.4 + Math.sin(clock.t * 2.4 + h.i * 1.3) * 0.28;
      glow.forEach((m, i) => { m.material.color.setHSL(((clock.t * 0.15) + i * 0.25) % 1, 0.9, 0.62); });
    },
  };
}

// ----------------------------------------------------------------------------- construction site + tower crane
export function buildConstructionSite(scene, world, def, cx, cz, w, d) {
  const g = new THREE.Group(); scene.add(g);
  const solid = world.solid;
  const X0 = cx - w / 2, X1 = cx + w / 2, Z0 = cz - d / 2, Z1 = cz + d / 2;   // front (street side) is Z0
  const base = 0.32;
  bx(g, w, 0.12, d, '#8a7a5a', cx, 0.26, cz);

  // perimeter fence with an open gate facing the road
  const fenceMat = new THREE.MeshLambertMaterial({ color: '#d9772b', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const fence = (xa, za, xb, zb) => {
    const lx = Math.abs(xb - xa) || 0.12, lz = Math.abs(zb - za) || 0.12;
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, 2.1, lz), fenceMat); m.position.set((xa + xb) / 2, 1.3, (za + zb) / 2); g.add(m);
    const n = Math.floor(Math.max(lx, lz) / 3); for (let i = 0; i <= n; i++) bx(g, 0.14, 2.3, 0.14, '#5d6a70', xa + (xb - xa) * i / Math.max(1, n), 1.4, za + (zb - za) * i / Math.max(1, n));
    solid(Math.min(xa, xb) - 0.1, Math.max(xa, xb) + 0.1, Math.min(za, zb) - 0.1, Math.max(za, zb) + 0.1, 99);
  };
  const gx0 = cx - 1.7, gx1 = cx + 1.7;
  fence(X0 + 0.2, Z0 + 0.3, gx0, Z0 + 0.3); fence(gx1, Z0 + 0.3, X1 - 0.2, Z0 + 0.3);
  fence(X0 + 0.2, Z0 + 0.3, X0 + 0.2, Z1 - 0.2); fence(X1 - 0.2, Z0 + 0.3, X1 - 0.2, Z1 - 0.2); fence(X0 + 0.2, Z1 - 0.2, X1 - 0.2, Z1 - 0.2);
  signMesh(g, 'HARD HATS REQUIRED', 'authorized personnel only', '#d9a21a', '#25292a', 6.4, 1.6, X0 + 4.9, 1.9, Z0 + 0.2, Math.PI);
  signMesh(g, 'ALTA REDWOOD LOFTS', 'coming soon · 14 units', '#2f4a6a', '#fff6dc', 6.4, 1.6, X1 - 4.9, 1.9, Z0 + 0.2, Math.PI);
  for (const sx of [gx0, gx1]) bx(g, 0.3, 3, 0.3, '#d9772b', sx, 1.7, Z0 + 0.3);

  // concrete frame, three storeys high
  const FX0 = cx - 8.9, FX1 = cx + 5.3, FZ0 = Z0 + 6.8, FZ1 = Z1 - 0.8, lvl = 3.4, topY = base + lvl * 3;
  bx(g, FX1 - FX0, 0.3, FZ1 - FZ0, '#a9a89f', (FX0 + FX1) / 2, base + 0.15, (FZ0 + FZ1) / 2);
  for (let k = 1; k <= 2; k++) bx(g, FX1 - FX0, 0.38, FZ1 - FZ0, '#b3b2a8', (FX0 + FX1) / 2, base + lvl * k, (FZ0 + FZ1) / 2);
  bx(g, (FX1 - FX0) * 0.5, 0.38, FZ1 - FZ0, '#b3b2a8', FX0 + (FX1 - FX0) * 0.25, topY, (FZ0 + FZ1) / 2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const x = FX0 + 0.45 + i * (FX1 - FX0 - 0.9) / 3, z = FZ0 + 0.45 + j * (FZ1 - FZ0 - 0.9) / 2;
    bx(g, 0.8, lvl * 3, 0.8, '#9c9b92', x, base + lvl * 1.5, z);
    bx(g, 0.07, 1.8, 0.07, '#6b4a3a', x, topY + 0.9, z);
  }
  bx(g, 3.2, lvl * 3 + 1, 3.2, '#8f8e86', FX0 + 2, base + (lvl * 3 + 1) / 2, FZ1 - 2);
  const scaf = canvasTex(64, 64, (c, tw, th) => {
    c.strokeStyle = '#7a8288'; c.lineWidth = 5; c.strokeRect(0, 0, tw, th);
    c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(tw, th); c.stroke();
  }, THREE, true);
  scaf.repeat.set((FX1 - FX0) / 2.4, lvl * 3 / 2.2);
  const scafM = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, lvl * 3), new THREE.MeshLambertMaterial({ map: scaf, alphaTest: 0.4, side: THREE.DoubleSide }));
  scafM.position.set((FX0 + FX1) / 2, base + lvl * 1.5, FZ0 - 0.8); g.add(scafM);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(FZ1 - FZ0, lvl * 2), new THREE.MeshLambertMaterial({ color: '#4f8f5a', transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  net.rotation.y = Math.PI / 2; net.position.set(FX0 - 0.7, base + lvl, (FZ0 + FZ1) / 2); g.add(net);
  solid(FX0 - 0.9, FX1 + 0.2, FZ0 - 1, FZ1 + 0.2, 99);

  // yard props
  bx(g, 5.2, 2.6, 2.4, '#e9e0c8', cx - 5.5, 1.6, Z0 + 3.3); bx(g, 5.4, 0.2, 2.6, '#8a8f8c', cx - 5.5, 3, Z0 + 3.3);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ color: '#43606a' })); win.position.set(cx - 5.5, 1.9, Z0 + 2.08); win.rotation.y = Math.PI; g.add(win);
  solid(cx - 8.2, cx - 2.8, Z0 + 2, Z0 + 4.6, 99);
  bx(g, 1.2, 2.4, 1.2, '#3f7a9a', X0 + 1.2, 1.5, Z0 + 2); solid(X0 + 0.5, X0 + 1.9, Z0 + 1.4, Z0 + 2.6, 99);
  const mound = new THREE.Mesh(new THREE.ConeGeometry(3, 2, 7), mat('#7a6a4a')); mound.position.set(X1 - 2.4, 1.3, Z1 - 2.5); g.add(mound);
  for (let i = 0; i < 3; i++) bx(g, 1.8, 0.3, 1.2, '#b88a52', cx + 3 + i * 0.1, 0.5 + i * 0.3, Z0 + 3.5);
  const mixer = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.1, 8), mat('#d9772b')); mixer.position.set(cx + 5.2, 1.2, Z0 + 3.4); mixer.rotation.z = 0.4; g.add(mixer);
  bx(g, 1.2, 0.5, 0.9, '#2b2f2a', cx + 5.2, 0.55, Z0 + 3.4);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 6), mat('#e8641a')); c.position.set(gx0 - 0.8 - (i % 3) * 0.7, 0.6, Z0 + 1.4 + Math.floor(i / 3) * 0.9); g.add(c); }
  bx(g, 0.15, 5, 0.15, '#25292a', X0 + 1.5, 2.9, Z0 + 5.5); world.lamps.push(glowBulb(g, X0 + 1.5, 5.6, Z0 + 5.5, 0.5));

  // tower crane: lattice mast, slewing deck, cab, a long jib you can walk out on, and a swaying hook
  const MX = X1 - 2.1, MZ = cz + 0.5, TOPY = 35.6;
  const lat = (rx, ry) => {
    const t = canvasTex(64, 64, (c, tw, th) => {
      c.clearRect(0, 0, tw, th); c.strokeStyle = '#e3b93c'; c.lineWidth = 7;
      c.strokeRect(2, 2, tw - 4, th - 4); c.beginPath(); c.moveTo(2, 2); c.lineTo(tw - 2, th - 2); c.moveTo(tw - 2, 2); c.lineTo(2, th - 2); c.stroke();
    }, THREE, true);
    t.repeat.set(rx, ry); return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide });
  };
  const mast = new THREE.Mesh(new THREE.BoxGeometry(2.2, 34.4, 2.2), lat(1, 14)); mast.position.set(MX, 17.5, MZ); g.add(mast);
  bx(g, 3.6, 0.9, 3.6, '#9a9a92', MX, 0.75, MZ);
  bx(g, 3, 0.9, 3, '#5d6a70', MX, 34.9, MZ);
  const J0 = MX - 34, J1 = MX + 10;
  bx(g, J1 - J0, 0.2, 1.8, '#6a7078', (J0 + J1) / 2, 35.5, MZ);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(34, 1.3, 1.6), lat(34 / 1.3, 1)); jib.position.set(MX - 17, 34.85, MZ); g.add(jib);
  const cjib = new THREE.Mesh(new THREE.BoxGeometry(10, 1.3, 1.6), lat(10 / 1.3, 1)); cjib.position.set(MX + 5, 34.85, MZ); g.add(cjib);
  for (const zz of [-0.88, 0.88]) {
    bx(g, J1 - J0, 0.08, 0.08, '#e9e0c8', (J0 + J1) / 2, 36.55, MZ + zz);
    for (let x = J0 + 0.5; x <= J1; x += 3) bx(g, 0.08, 1, 0.08, '#e9e0c8', x, 36.05, MZ + zz);
  }
  beam(g, MX - 1.2, 35.6, MX, 43, MZ, 0.3, '#e3b93c'); beam(g, MX + 1.2, 35.6, MX, 43, MZ, 0.3, '#e3b93c');
  beam(g, MX, 43, J0, 35.7, MZ, 0.1, '#25292a'); beam(g, MX, 43, MX - 17, 35.7, MZ, 0.1, '#25292a'); beam(g, MX, 43, J1, 35.7, MZ, 0.1, '#25292a');
  bx(g, 2.6, 0.2, 2.6, '#6a7078', MX - 2.6, 35.5, MZ + 2.1);
  bx(g, 2.2, 2.1, 2.4, '#e3b93c', MX - 2.6, 36.7, MZ + 2.1);
  const cabGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ color: '#43606a' })); cabGlass.position.set(MX - 3.72, 36.9, MZ + 2.1); cabGlass.rotation.y = -Math.PI / 2; g.add(cabGlass);
  for (let i = 0; i < 3; i++) bx(g, 1.4, 1.4, 1.5, '#8a8f8c', MX + 7 + i * 1.1, 34.7, MZ);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff3b2f' })); beacon.position.set(MX, 43.4, MZ); g.add(beacon);
  // ladder on the north face of the mast
  const ladTex = canvasTex(32, 64, (c, tw, th) => {
    c.clearRect(0, 0, tw, th); c.fillStyle = '#c9c2ae'; c.fillRect(4, 0, 3, th); c.fillRect(tw - 7, 0, 3, th);
    for (let y = 4; y < th; y += 12) c.fillRect(4, y, tw - 8, 3);
  }, THREE, true); ladTex.repeat.set(1, 34);
  const lad = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 34.2), new THREE.MeshBasicMaterial({ map: ladTex, alphaTest: 0.4, side: THREE.DoubleSide }));
  lad.position.set(MX, 17.4, MZ - 1.15); g.add(lad);
  // trolley, hook and a swaying load of rebar over the frame
  const hookPivot = new THREE.Group(); hookPivot.position.set(MX - 14, 34.1, MZ); g.add(hookPivot);
  bx(g, 1.2, 0.5, 1.4, '#25292a', MX - 14, 34.35, MZ);
  bx(hookPivot, 0.06, 21, 0.06, '#25292a', 0, -10.5, 0); bx(hookPivot, 0.6, 0.8, 0.6, '#e3b93c', 0, -21.2, 0);
  for (let i = 0; i < 3; i++) bx(hookPivot, 3.4, 0.14, 0.14, '#6b4a3a', 0, -22.4 - i * 0.18, (i - 1) * 0.3);
  beam(hookPivot, -1.6, -22.2, 0, -21.5, 0, 0.04, '#25292a'); beam(hookPivot, 1.6, -22.2, 0, -21.5, 0, 0.04, '#25292a');
  solid(MX - 1.3, MX + 1.3, MZ - 1.3, MZ + 1.3, 99);
  world.interactables.push({ type: 'climb', x: MX, z: MZ - 2.7, r: 1.8, label: 'Climb the crane (view from the top)' });

  world.crane = {
    x: MX, z: MZ, topY: TOPY, active: false,
    ok: (x, z) => x >= J0 + 0.5 && x <= J1 - 0.5 && Math.abs(z - MZ) <= 0.8,
    tick(dt, t) { hookPivot.rotation.z = Math.sin(t * 0.7) * 0.035; hookPivot.rotation.x = Math.cos(t * 0.55) * 0.03; beacon.visible = Math.sin(t * 3) > -0.2; },
  };
  const rec = { id: def.id, def, x: cx, z: cz, w, d, h: 12, lot: true, door: { x: cx, z: Z0 } };
  world.buildings[def.id] = rec;
  return rec;
}
