// Static city construction: roads, blocks, buildings, park, interstate, station, gate.
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex, signTexture, windowsTexture, muralTexture, imageTexture, WINDMILL_SVG, svgURI } from './art.js';
import { mat } from './actors.js';
import { mulberry, rand, pick } from './util.js';

export const C = [-93, -31, 31, 93];          // block centres
export const R = [-124, -62, 0, 62, 124];     // road centre lines
export const BOUNDS = { x0: -132, x1: 132, z0: -150, z1: 132 };
export const INT = { x: 2000, z: 0 };         // interiors live far away from the city
const PARK = { bx: C[1], bz: C[2] };
export const TERRACE_Y = 3.2;

const COL = { slab: '#8d928c', asphalt: '#3a4044', curb: '#a6aaa2', dark: '#2b2f2a', cream: '#e9e0c8' };
const box = (w, h, d, color, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); return m; };
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

const tex = {};
function winTex(base, floors, seed, lit, repX, repY) {
  const k = [base, floors, seed, lit].join('|');
  if (!tex[k]) tex[k] = windowsTexture(THREE, base, seed, floors, lit);
  const t = tex[k].clone(); t.needsUpdate = true; t.repeat.set(repX, repY); return t;
}

const STORE_TYPES = ['coffee', 'restaurant', 'donut', 'pub', 'convenience', 'drug', 'electronics', 'weed', 'pets', 'hotel', 'bank', 'lab', 'library', 'studio'];
export function buildWorld(scene, defList) {
  const world = {
    colliders: [], buildings: {}, doors: [], interactables: [], clickables: [], trashSpots: [], scooters: [], stops: [],
    lamps: [], nightGlow: [], raisedSigns: [], spawn: new THREE.Vector3(-98, 0, -55), parkSign: null, dogs: [], parkBounds: null,
  };
  const rnd = mulberry(7);
  const add = (o) => { scene.add(o); return o; };
  const solid = (x0, x1, z0, z1, top = 99) => world.colliders.push({ x0, x1, z0, z1, top });
  world.solid = solid;

  // ---- ground
  const asphalt = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3d4448'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${rnd() * .07})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }, THREE, true);
  asphalt.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ map: asphalt }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.01, -10); add(ground);

  // lane markings
  const dash = canvasTex(32, 8, (g, w, h) => { g.fillStyle = '#e3b93c'; g.fillRect(2, 2, 16, 4); }, THREE, true);
  const roadLen = 264;
  for (const c of R) {
    for (const horiz of [true, false]) {
      const t = dash.clone(); t.needsUpdate = true; t.repeat.set(roadLen / 4, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 0.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
      if (horiz) { m.position.z = c; } else { m.rotation.z = Math.PI / 2; m.position.x = c; }
      add(m);
    }
  }
  // damp puddles
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(rand(0.8, 2.5), 10), new THREE.MeshBasicMaterial({ color: '#5a7686', transparent: true, opacity: 0.4, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set(rand(-125, 125), 0.04, rand(-125, 125)); p.scale.y = rand(0.5, 1); add(p);
  }

  // ---- blocks
  const defs = new Map();
  defList.forEach((d) => defs.set(d.block.join(',') + ':' + d.slot, d));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const bx = C[i], bz = C[j];
    const slab = box(50, 0.4, 50, COL.slab, bx, 0, bz); add(slab);
    const special = defs.get(`${i},${j}:ALL`);
    if (special) continue;
    for (const [slot, row, col] of [['N0', 'N', 0], ['N1', 'N', 1], ['S0', 'S', 0], ['S1', 'S', 1]]) {
      const def = defs.get(`${i},${j}:${slot}`) || filler(i, j, slot, rnd);
      placeBuilding(def, bx, bz, row, col, rnd);
    }
    // alley dressing
    for (let k = 0; k < 3; k++) {
      const ax0 = bx + rand(-18, 18);
      // keep the dojo's alley door clear of dumpsters
      const ax = (world.dojoDoor && Math.abs(ax0 - world.dojoDoor.x) < 5 && Math.abs(bz - world.dojoDoor.z) < 12) ? ax0 + (ax0 < world.dojoDoor.x ? -6 : 6) : ax0;
      const dm = box(2.6, 1.5, 1.4, '#3f6a4a', ax, 0.95, bz + rand(-2, 2)); add(dm); solid(ax - 1.4, ax + 1.4, dm.position.z - 0.8, dm.position.z + 0.8, 2);
      world.trashSpots.push({ x: ax, z: dm.position.z + (dm.position.z > bz ? -1.4 : 1.4), kind: 'dumpster' });
      const tc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.9, 8), mat('#5d6a70')); tc.position.set(ax + 2.4, 0.65, bz + rand(-2.4, 2.4)); add(tc);
      world.trashSpots.push({ x: tc.position.x, z: tc.position.z, kind: 'can' });
    }
    // block-corner street trees and lamps
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      lamp(bx + sx * 24.4, bz + sz * 24.4);
      tree(bx + sx * 24.4, bz + sz * 12 * (rnd() < 0.5 ? 1 : -1), 0.9 + rnd() * 0.5);
    }
  }

  function filler(i, j, slot, r) {
    const kinds = ['apartments', 'apartments', 'apartments', 'derelict', 'lot'];
    const type = r() < 0.12 ? 'derelict' : 'apartments';
    const names = ['Cedar Court', 'Maple Flats', 'Harbor View Apts', 'Fir Street Lofts', 'Wren Building', 'Foghorn Apartments', 'Tidewater Place', 'Alder House'];
    return { id: `fill_${i}${j}${slot}`, name: type === 'derelict' ? 'Vacant Building' : names[Math.floor(r() * names.length)], type, block: [i, j], slot, color: pick(['#6c7d72', '#8a7a5a', '#7c6f60', '#6a7a86', '#8a8f78']), floors: 3 + Math.floor(r() * 4) };
  }

  function placeBuilding(def, bx, bz, row, col, r) {
    const w = 21, d = 18;
    const cx = bx + (col === 0 ? -11.5 : 11.5);
    const cz = bz + (row === 'N' ? -13 : 13);
    if (def.type === 'lot') return lotSite(def, cx, cz, w, d);
    const floors = def.floors || (STORE_TYPES.includes(def.type) ? 2 + Math.floor(r() * 3) : 3);
    const hgt = 4.4 + floors * 3.2 + (def.type === 'hotel' ? 6 : 0);
    const g = new THREE.Group();
    g.position.set(cx, 0.2, cz);
    g.rotation.y = row === 'N' ? Math.PI : 0;
    const derelict = def.type === 'derelict';
    const base = derelict ? '#6a6458' : (def.color || '#7a7a70');
    const seed = Math.floor(r() * 9999);
    const gh = 4.4;
    const lower = box(w, gh, d, derelict ? '#5d5a50' : shade(base, 0.9), 0, gh / 2, 0); g.add(lower);
    const upH = hgt - gh;
    const mats = [
      new THREE.MeshLambertMaterial({ map: winTex(base, floors, seed, derelict ? 0 : 0.22, d / 5, upH / 3.2 / floors) }),
      new THREE.MeshLambertMaterial({ map: winTex(base, floors, seed, derelict ? 0 : 0.22, d / 5, upH / 3.2 / floors) }),
      new THREE.MeshLambertMaterial({ color: '#3a3f40' }),
      new THREE.MeshLambertMaterial({ color: '#222' }),
      new THREE.MeshLambertMaterial({ map: winTex(base, floors, seed + 1, derelict ? 0 : 0.22, w / 5, upH / 3.2 / floors) }),
      new THREE.MeshLambertMaterial({ map: winTex(base, floors, seed + 2, derelict ? 0 : 0.18, w / 5, upH / 3.2 / floors) }),
    ];
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upH, d), mats); upper.position.y = gh + upH / 2; g.add(upper);
    // cornice + roof clutter
    const cor = box(w + 0.6, 0.5, d + 0.6, shade(base, 0.7), 0, hgt + 0.2, 0); g.add(cor);
    if (r() < 0.6) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 8), mat('#7a5a3c')); tank.position.set(rand(-6, 6), hgt + 1.5, rand(-4, 4)); g.add(tank); }
    if (def.type === 'hotel') { const st = box(w * 0.5, 4, d * 0.5, shade(base, 0.8), 0, hgt + 2, 0); g.add(st); }

    // storefront
    const fz = d / 2;
    if (derelict) {
      for (let k = -2; k <= 2; k++) { const bd = box(3.6, 3.2, 0.12, k % 2 ? '#6a4a30' : '#7a5a3c', k * 4, 2.1, fz + 0.06); bd.rotation.z = rand(-0.05, 0.05); g.add(bd); }
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'KEEP OUT · FOR LEASE', '#5d5a50', '#d9772b'), transparent: true, opacity: 0.8 })); gr.position.set(0, 3.9, fz + 0.1); g.add(gr);
      world.nightGlow.push();
    } else if (def.type === 'apartments' || def.type === 'studio') {
      const door = box(1.8, 3, 0.2, '#4a3020', 0, 1.5, fz + 0.1); g.add(door);
      const lobby = box(8, 2.6, 0.1, '#3b4a52', 5.5, 1.8, fz + 0.05); g.add(lobby);
      const lobby2 = box(4, 2.6, 0.1, '#3b4a52', -7, 1.8, fz + 0.05); g.add(lobby2);
    } else {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w - 6, 2.8), basic('#43606a')); gl.position.set(0, 1.9, fz + 0.03); gl.userData.glass = true; g.add(gl);
      world.nightGlow.push(gl);
      const dr = box(2, 3.1, 0.25, '#5a3a22', 0, 1.55, fz + 0.12); g.add(dr);
      const knob = box(0.15, 0.15, 0.1, '#e3b93c', 0.7, 1.5, fz + 0.28); g.add(knob);
      const aw = box(w - 2, 0.25, 1.8, accent(def.type), 0, 3.55, fz + 0.9); aw.rotation.x = 0.28; g.add(aw);
    }
    const signText = def.name;
    if (def.type !== 'derelict' && def.type !== 'apartments') {
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, signText, signBg(def), '#fff6dc', labelFor(def)) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 1.2), sm); sign.position.set(0, 4.95, fz + 0.4); g.add(sign);
      def._signMat = sm;
    }
    if (def.type === 'apartments') {
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, signText, '#3a4a42', '#e9e0c8', 'apartments') });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), sm); sign.position.set(-5, 3.4, fz + 0.3); g.add(sign);
    }
    // vertical blade sign
    if (def.type === 'hotel' || def.type === 'studio' || def.type === 'pub') {
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, def.type === 'studio' ? 'ALTA REDWOOD' : def.name, def.type === 'studio' ? '#2b2f2a' : '#7a3a1a', '#fff6dc', def.type === 'studio' ? 'PICTURES' : null), side: THREE.DoubleSide });
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), sm); bl.position.set(w / 2 + 0.1, 7.5, fz - 1.6); bl.rotation.y = Math.PI / 2; g.add(bl);
      if (def.type === 'studio') {
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: imageTexture(THREE, svgURI(WINDMILL_SVG)), transparent: true })); wm.position.set(0, 9, fz + 0.15); g.add(wm);
        const bg = box(3, 3, 0.05, '#2b2f2a', 0, 9, fz + 0.1); g.add(bg);
        const sm2 = new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'Alta Redwood Pictures', '#2b2f2a', '#e9e0c8') });
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), sm2); s2.position.set(0, 11.5, fz + 0.1); g.add(s2);
      }
    }
    // murals on alley-facing back walls
    if (def.type !== 'lot' && r() < 0.5) {
      const mu = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.5), new THREE.MeshBasicMaterial({ map: muralTexture(THREE, r() < 0.5 ? 'whale' : 'sasquatch') }));
      mu.position.set(0, 4.3, -d / 2 - 0.05); mu.rotation.y = Math.PI; g.add(mu);
    }
    // alley-side back door (e.g. the martial arts studio behind Eastgate)
    if (def.backDoor) {
      const bd = def.backDoor, bz0 = -d / 2;
      g.add(box(2.2, 3.1, 0.25, '#8a2f1a', bd.x, 1.55, bz0 - 0.12));
      g.add(box(2.7, 0.3, 0.4, '#2b2f2a', bd.x, 3.3, bz0 - 0.2));
      const bs = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: signTexture(THREE, bd.name, '#2b2f2a', '#fff6dc', 'martial arts · dojo') }));
      bs.position.set(bd.x, 4.7, bz0 - 0.1); bs.rotation.y = Math.PI; g.add(bs);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#e8832b' }));
      lan.position.set(bd.x - 2, 2.9, bz0 - 0.6); lan.scale.y = 1.3; g.add(lan);
    }
    add(g);
    g.updateMatrixWorld(true);
    const doorW = g.localToWorld(new THREE.Vector3(0, 0, fz + 2.4));
    if (def.backDoor) {
      const p = g.localToWorld(new THREE.Vector3(def.backDoor.x, 0, -d / 2 - 2.4));
      world.doors.push({ type: 'door', bizId: def.backDoor.id, special: 'dojo', x: p.x, z: p.z, r: 2.4, label: def.backDoor.name });
      world.dojoDoor = { x: p.x, z: p.z };
    }
    const rec = { id: def.id, def, x: cx, z: cz, w, d, h: hgt, group: g, door: { x: doorW.x, z: doorW.z }, derelict };
    world.buildings[def.id] = rec;
    solid(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
    if (!['apartments', 'derelict', 'studio'].includes(def.type)) world.doors.push({ type: 'door', bizId: def.id, x: doorW.x, z: doorW.z, r: 2.6, label: def.name });
  }

  function lotSite(def, cx, cz, w, d) {
    const gl = box(w, 0.1, d, '#7a755a', cx, 0.4, cz); add(gl);
    for (let k = 0; k < 10; k++) { const wd = box(0.3, rand(0.5, 1.3), 0.3, '#6f8f4e', cx + rand(-9, 9), 0.9, cz + rand(-7, 7)); add(wd); }
    const fz = cz + (cz < 0 ? 1 : 1) * 0;
    const fence = box(w, 1.8, 0.1, '#8a8f8c', cx, 1.1, cz + (def.slot.startsWith('N') ? -d / 2 : d / 2)); fence.material = mat('#8a8f8c', { transparent: true, opacity: 0.5 }); add(fence);
    world.buildings[def.id] = { id: def.id, def, x: cx, z: cz, w, d, h: 1, lot: true, door: { x: cx, z: cz } };
    solid(cx - w / 2, cx + w / 2, cz - 0.1 + (def.slot.startsWith('N') ? -d / 2 : d / 2), cz + 0.1 + (def.slot.startsWith('N') ? -d / 2 : d / 2));
  }

  function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
  function accent(type) { return { coffee: '#6f8f4e', restaurant: '#d9772b', donut: '#e3b93c', pub: '#7a3a1a', convenience: '#4f7a96', drug: '#4f6b3a', electronics: '#5d6a70', weed: '#4f6b3a', pets: '#4f7a96', hotel: '#7a5a3c', bank: '#4f7a96', lab: '#8a8f8c', library: '#7a5a3c' }[type] || '#8a8f8c'; }
  function signBg(def) { return { coffee: '#3f5a2e', restaurant: '#7a3a1a', donut: '#a8741a', pub: '#4a2a14', convenience: '#2f5a7a', drug: '#2f5a3a', electronics: '#2f3b4a', weed: '#2f5a2e', pets: '#2f6a7a', hotel: '#4a3020', bank: '#2f4a6a', lab: '#3a4a52', library: '#5a4a30', studio: '#2b2f2a' }[def.type] || '#3a3f40'; }
  function labelFor(def) { return { coffee: 'coffee', restaurant: def.style || 'eats', donut: 'donuts', pub: 'pub & tavern', convenience: 'open late', drug: 'pharmacy', electronics: 'gadgets', weed: 'cannabis', pets: 'exotic fish', hotel: 'hotel', bank: 'bank', lab: 'roasting lab', library: 'public library' }[def.type] || null; }

  // ---- street furniture helpers
  function lamp(x, z) {
    const pole = box(0.2, 5.5, 0.2, '#2b2f2a', x, 2.95, z); add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), basic('#e8d9a0')); bulb.position.set(x, 5.9, z); add(bulb); world.lamps.push(bulb);
  }
  function tree(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), mat('#5a3a22')); trunk.position.y = 1.1; t.add(trunk);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3, 7), mat(rnd() < 0.5 ? '#4f6b3a' : '#5d7f45')); c1.position.y = 3.4; t.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 7), mat('#6f8f4e')); c2.position.y = 5; t.add(c2);
    t.position.set(x, 0.2, z); t.scale.setScalar(s); add(t);
    solid(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
    return t;
  }
  world.tree = tree;
  function bench(x, y, z, rot = 0) {
    const g = new THREE.Group();
    g.add(box(2, 0.12, 0.6, '#7a5a3c', 0, 0.55, 0)); g.add(box(2, 0.6, 0.1, '#7a5a3c', 0, 0.95, -0.28));
    g.add(box(0.1, 0.5, 0.5, '#2b2f2a', -0.85, 0.28, 0)); g.add(box(0.1, 0.5, 0.5, '#2b2f2a', 0.85, 0.28, 0));
    g.position.set(x, y, z); g.rotation.y = rot; add(g);
    world.interactables.push({ type: 'bench', x, z, r: 1.8, label: 'Bench', y, rot });
    return g;
  }
  function picnic(x, y, z) {
    const g = new THREE.Group();
    g.add(box(2.2, 0.12, 1, '#8a6a42', 0, 0.9, 0)); g.add(box(2.2, 0.1, 0.4, '#7a5a3c', 0, 0.5, 0.9)); g.add(box(2.2, 0.1, 0.4, '#7a5a3c', 0, 0.5, -0.9));
    g.position.set(x, y, z); add(g); solid(x - 1.1, x + 1.1, z - 0.5, z + 0.5, y + 1);
  }

  // street benches & bus-stop style seating on sidewalks
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (i === 1 && j === 2) continue;
    bench(C[i] - 6, 0.2, C[j] - 23.6, Math.PI);
    bench(C[i] + 7, 0.2, C[j] + 23.6, 0);
  }

  buildPark();
  buildBridge();
  buildStation();
  buildGate();
  buildBillboards();
  buildSkyline();
  buildCanal();
  buildScooters();

  function buildCanal() {
    const x0 = -134, x1 = -176, zc = -9, len = 330;
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#4d7480'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '210,235,240' : '20,50,60'},${0.12 + rnd() * 0.2})`; g.lineWidth = 1 + rnd() * 1.5; const x = rnd() * w, y = rnd() * h, l = 8 + rnd() * 22; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
    }, THREE, true);
    tex.repeat.set(8, 60);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(x0 - x1, len), new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, 0.04, zc); add(water);
    world.water = { tick: (dt) => { tex.offset.y += dt * 0.012; tex.offset.x += dt * 0.004; } };
    // concrete quay lip, railing and bollards along the playable edge
    add(box(2, 0.5, len, '#8c9290', x0 + 1, 0.25, zc));
    add(box(0.12, 0.12, len, '#2b2f2a', x0 + 1.6, 1.15, zc));
    for (let z = zc - len / 2 + 2; z < zc + len / 2; z += 6) {
      add(box(0.14, 1.1, 0.14, '#2b2f2a', x0 + 1.6, 0.6, z));
      if (Math.round((z - zc) / 6) % 4 === 0) { const l = box(0.2, 3.2, 0.2, '#25292a', x0 + 1.6, 1.8, z); add(l); const bulb = box(0.5, 0.35, 0.5, '#9a9a80', x0 + 1.6, 3.5, z); world.lamps.push(bulb); add(bulb); }
    }
    // far bank wall
    add(box(3, 3, len, '#6b7270', x1 - 1.5, 1.5, zc));
    // moored boats
    for (const [z, c] of [[-70, '#d9772b'], [-8, '#2f5a3a'], [52, '#e3b93c'], [101, '#3b4a52']]) {
      const b = new THREE.Group();
      b.add(box(2.6, 0.7, 7, c, 0, 0.3, 0)); b.add(box(1.8, 0.9, 2.6, '#e9e0c8', 0, 1.1, -0.6));
      b.position.set(x0 - 3.6, 0.04, z); add(b);
    }
    world.solid(x0 - 0.4, x1, zc - len / 2, zc + len / 2, 99);
  }

  function buildPark() {
    const { bx, bz } = PARK;
    world.parkBounds = { x0: bx - 25, x1: bx + 25, z0: bz - 25, z1: bz + 25 };
    // lower level = street-level lawn
    const lawn = box(50, 0.1, 28, '#5d7f45', bx, 0.25, bz + 11); add(lawn);
    // upper level terrace
    add(box(50, TERRACE_Y, 22, '#7a8f5a', bx, TERRACE_Y / 2, bz - 14));
    const wall = box(50, TERRACE_Y, 0.4, '#8a8f8c', bx, TERRACE_Y / 2, bz - 3); add(wall);
    const rail = box(50, 0.12, 0.12, '#2b2f2a', bx, TERRACE_Y + 0.9, bz - 3.1); add(rail);
    solid(bx - 25, bx + 25, bz - 25, bz - 3, TERRACE_Y);
    // ramps
    for (const rx of [bx + 16, bx - 20]) {
      const len = 8.2, ang = Math.atan2(TERRACE_Y - 0.2, 8);
      const rp = box(4, 0.3, len, '#a6aaa2', rx, (TERRACE_Y + 0.2) / 2, bz + 1.1); rp.rotation.x = ang; add(rp);
      solid(rx - 2.3, rx - 2, bz - 3, bz + 5, 99); solid(rx + 2, rx + 2.3, bz - 3, bz + 5, 99);
      world.interactables.push({ type: 'hint', x: rx, z: bz + 6, r: 0 });
    }
    world.ramps = [{ x0: bx + 14, x1: bx + 18, z0: bz - 3, z1: bz + 5 }, { x0: bx - 22, x1: bx - 18, z0: bz - 3, z1: bz + 5 }];
    // upper level furniture
    for (let k = 0; k < 5; k++) tree(bx - 22 + k * 11, bz - 18, 1.1);
    // tree() places at y=0.2; lift terrace trees onto the terrace
    scene.children.slice(-5).forEach((t) => { t.position.y = TERRACE_Y; });
    for (let k = 0; k < 3; k++) bench(bx - 14 + k * 14, TERRACE_Y, bz - 21, 0);
    for (let k = 0; k < 4; k++) picnic(bx - 16 + k * 10, TERRACE_Y, bz - 12);
    world.terraceBench = true;
    // park sign
    const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, "Baloo's Park", '#3f5a2e', '#fff6dc', 'a neighbourhood park') });
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), sm); sgn.position.set(bx, 3.2, bz + 24.2); add(sgn);
    add(box(0.25, 3, 0.25, '#5a3a22', bx - 2.8, 1.7, bz + 24.1)); add(box(0.25, 3, 0.25, '#5a3a22', bx + 2.8, 1.7, bz + 24.1));
    world.parkSign = { x: bx, z: bz + 24 };
    // dog park (lower, west)
    const dx0 = bx - 24, dx1 = bx - 6, dz0 = bz + 2, dz1 = bz + 22;
    const dogGrass = box(dx1 - dx0, 0.05, dz1 - dz0, '#6f8f4e', (dx0 + dx1) / 2, 0.33, (dz0 + dz1) / 2); add(dogGrass);
    const fm = mat('#8a8f8c', { transparent: true, opacity: 0.55 });
    const fence = (x0, z0, x1, z1) => { const w = Math.abs(x1 - x0) || 0.12, d = Math.abs(z1 - z0) || 0.12; const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d), fm); m.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2); add(m); solid(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1, 3); };
    fence(dx0, dz0, dx1, dz0); fence(dx0, dz1, dx1, dz1); fence(dx0, dz0, dx0, dz1); fence(dx1, dz0, dx1, dz0 + 7); fence(dx1, dz0 + 12, dx1, dz1);
    const dsm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'Dog Park', '#4f6b3a', '#fff6dc', 'leash off · scoop up') });
    const ds = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.9), dsm); ds.position.set(dx1 + 0.2, 2.2, dz0 + 9.5); ds.rotation.y = Math.PI / 2; add(ds);
    world.dogPark = { x0: dx0 + 1, x1: dx1 - 1, z0: dz0 + 1, z1: dz1 - 1 };
    bench(dx0 + 2, 0.3, dz1 - 1.5, Math.PI); tree(dx0 + 3, dz0 + 4, 1);
    // pickleball court (lower, east)
    const cx = bx + 12, cz = bz + 12;
    const court = new THREE.Mesh(new THREE.PlaneGeometry(15, 8), new THREE.MeshBasicMaterial({ map: canvasTex(150, 80, (g, w, h) => {
      g.fillStyle = '#3f6a8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4f7a96'; g.fillRect(10, 10, w - 20, h - 20);
      g.strokeStyle = '#fff6dc'; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20); g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.moveTo(40, 10); g.lineTo(40, h - 10); g.moveTo(w - 40, 10); g.lineTo(w - 40, h - 10); g.moveTo(40, h / 2); g.lineTo(w - 40, h / 2); g.stroke();
    }, THREE) }));
    court.rotation.x = -Math.PI / 2; court.position.set(cx, 0.32, cz); add(court);
    add(box(0.12, 1.1, 8.4, '#2b2f2a', cx, 0.9, cz)); const net = box(0.05, 0.7, 8, '#d9d9d0', cx, 0.95, cz); net.material = mat('#d9d9d0', { transparent: true, opacity: 0.7 }); add(net);
    solid(cx - 0.3, cx + 0.3, cz - 4.2, cz + 4.2, 2);
    world.court = { x: cx, z: cz };
    world.interactables.push({ type: 'court', x: cx - 5.5, z: cz, r: 3.2, label: 'Pickleball court' });
    // lower level trees and benches
    for (let k = 0; k < 6; k++) tree(bx - 24 + rnd() * 48, bz + 6 + rnd() * 18, 0.9 + rnd() * 0.4);
    scene.children.slice(-6).forEach((t) => { if (Math.abs(t.position.x - cx) < 10 && Math.abs(t.position.z - cz) < 7) t.position.x += 14; });
    bench(cx + 9, 0.3, cz + 4, -Math.PI / 2); bench(cx - 1, 0.3, cz + 7, Math.PI);
    world.interactables.push({ type: 'tablehint', x: bx, z: bz + 10, r: 0 });
  }

  function buildBridge() {
    const z = -142;
    const deck = box(300, 1.6, 24, '#6a6e6c', 0, 11, z); add(deck);
    const barrier = box(300, 0.9, 0.5, '#8a8f8c', 0, 12.2, z - 11.8); add(barrier); const barrier2 = box(300, 0.9, 0.5, '#8a8f8c', 0, 12.2, z + 11.8); add(barrier2);
    const sty = box(300, 0.5, 23, '#2f3234', 0, 11.9, z); add(sty);
    world.bridgeParts = [deck, barrier, barrier2, sty];
    for (const m of world.bridgeParts) { m.material = m.material.clone(); m.material.transparent = true; }
    for (let x = -140; x <= 140; x += 28) {
      const p = box(2.4, 11, 2.4, '#7a7e7a', x, 5.5, z); add(p); solid(x - 1.3, x + 1.3, z - 1.3, z + 1.3);
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5), new THREE.MeshBasicMaterial({ map: signTexture(THREE, pick(['SASQUATCH WAS HERE', 'FREE KUSAMAKURA', 'RAIN FOREVER', 'TAG 4 LIFE', 'PIGEON POWER']), '#3f4548', pick(['#d9772b', '#e3b93c', '#6f8f4e'])) }));
      gr.position.set(x, 3, z + 1.26); add(gr);
    }
    const under = box(300, 0.1, 22, '#4a4f50', 0, 0.25, z); add(under);
    // camp props
    for (let k = 0; k < 5; k++) {
      const tx = -100 + k * 45 + rand(-8, 8), tz = z + rand(-4, 5);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 4), mat(pick(['#4f6b3a', '#d9772b', '#4f7a96']))); tent.position.set(tx, 1.3, tz); tent.rotation.y = Math.PI / 4; add(tent); solid(tx - 1.5, tx + 1.5, tz - 1.5, tz + 1.5, 3);
    }
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), mat('#3a3f40')); fire.position.set(10, 0.8, z + 2); add(fire);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 5), basic('#d9772b')); flame.position.set(10, 1.7, z + 2); add(flame); world.flame = flame;
    world.underBridge = { x0: -140, x1: 140, z0: -153, z1: -128, cx: 10, cz: z + 2 };
    world.trashSpots.push({ x: 4, z: z + 4, kind: 'can' }, { x: -30, z: z + 3, kind: 'can' }, { x: 60, z: z + 1, kind: 'dumpster' });
    const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'UNDER THE BRIDGE', '#2b2f2a', '#d9772b', 'no loitering. ha.') });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), sm); s.position.set(14, 6, z + 11); s.rotation.y = Math.PI; add(s);
    // Interstate lights
    world.bridgeY = 12.6; world.bridgeZ = z;
  }

  function buildStation() {
    const bx = C[3], bz = C[1];
    const g = new THREE.Group(); g.position.set(bx, 0.2, bz); add(g);
    const hall = box(46, 12, 20, '#8a7a5a', 0, 6, 8); g.add(hall);
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 46, 12), mat('#6a6a5a')); vault.rotation.z = Math.PI / 2; vault.scale.set(0.4, 1, 1); vault.position.set(0, 12, 8); g.add(vault);
    const tower = box(7, 28, 7, '#7a6a52', 0, 14, 12); g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5.4, 7, 4), mat('#4f6b3a')); cap.position.set(0, 31.5, 12); cap.rotation.y = Math.PI / 4; g.add(cap);
    const clockMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#f4efe0'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill(); c.strokeStyle = '#2b2f2a'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 10); c.moveTo(32, 32); c.lineTo(46, 38); c.stroke(); }, THREE) });
    const clock = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), clockMat); clock.position.set(0, 24, 15.55); g.add(clock);
    for (let k = -3; k <= 3; k++) g.add(box(1.4, 8, 1.2, '#9a8a6a', k * 6.4, 4, 18.3));
    const sm = new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'UNION STATION', '#3a2f20', '#f0e0b0', 'trains · streetcar') });
    const sn = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), sm); sn.position.set(0, 10, 18.4); g.add(sn);
    const dr = box(4, 5, 0.3, '#2f3b40', 0, 2.5, 18.2); g.add(dr);
    solid(bx - 23, bx + 23, bz - 2, bz + 18.5);
    solid(bx - 3.6, bx + 3.6, bz + 8.5, bz + 15.5);
    // platform + tracks behind
    const plat = box(60, 0.5, 8, '#6a6e6c', 0, 0.25, -8); g.add(plat);
    for (const tz of [-18, -14]) { g.add(box(56, 0.15, 0.2, '#5a5a56', 0, 0.08, tz - 0.7)); g.add(box(56, 0.15, 0.2, '#5a5a56', 0, 0.08, tz + 0.7)); for (let t = -26; t < 28; t += 2) g.add(box(0.5, 0.1, 2.4, '#5a4a38', t, 0.04, tz)); }
    for (let k = 0; k < 4; k++) { const car = box(9, 3.6, 3, k === 0 ? '#d9772b' : '#6f8f4e', -22 + k * 9.6, 2.4, -14); g.add(car); g.add(box(8, 0.9, 3.04, '#2f3b40', -22 + k * 9.6, 3.1, -14)); }
    solid(bx - 27, bx + 22, bz - 15.5, bz - 12.5, 4);
    world.stationDoor = { type: 'door', bizId: 'station', x: bx, z: bz + 22.2, r: 3, label: 'Union Station' };
    world.doors.push(world.stationDoor);
    world.buildings.station = { id: 'station', def: { id: 'station', name: 'Union Station', type: 'station' }, x: bx, z: bz + 8, w: 46, d: 20, h: 12, door: { x: bx, z: bz + 22.2 } };
  }

  function buildGate() {
    const x = -62, z = -31;
    const g = new THREE.Group(); g.position.set(x, 0, z); add(g);
    for (const s of [-1, 1]) {
      g.add(box(1.6, 8, 1.6, '#b8532a', s * 7.5, 4, 0)); g.add(box(2.2, 0.6, 2.2, '#4f6b3a', s * 7.5, 0.4, 0)); g.add(box(2.2, 0.6, 2.2, '#4f6b3a', s * 7.5, 8.1, 0));
      solid(x + s * 7.5 - 1, x + s * 7.5 + 1, z - 1, z + 1);
      const lion = box(1.4, 1.2, 1.6, '#c9a45a', s * 7.5, 1.2, 2); g.add(lion);
    }
    g.add(box(17.6, 1.2, 1.8, '#b8532a', 0, 8.2, 0));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 56, (c, w, h) => { c.fillStyle = '#2f5a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e3b93c'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6); c.fillStyle = '#e3b93c'; let fs = 30; c.font = `bold ${fs}px serif`; while (c.measureText('唐人街 · CHINATOWN').width > w - 24 && fs > 12) { fs -= 1; c.font = `bold ${fs}px serif`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('唐人街 · CHINATOWN', w / 2, h / 2 + 2); }, THREE), side: THREE.DoubleSide }));
    sign.position.set(0, 9.6, 0); g.add(sign);
    for (let k = 0; k < 3; k++) {
      const tier = box(20 - k * 4, 0.5, 3 - k * 0.4, '#4f6b3a', 0, 10.5 + k * 0.7 + 0.5, 0); g.add(tier);
      const edge = box(21 - k * 4, 0.25, 3.4 - k * 0.4, '#e3b93c', 0, 10.2 + k * 0.7 + 0.5, 0); g.add(edge);
    }
    g.add(box(0.5, 1.2, 0.5, '#e3b93c', 0, 13.3, 0));
    for (const s of [-1, 1]) { const ln = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), basic('#d9772b')); ln.position.set(s * 4, 7.3, 0.9); g.add(ln); world.lamps.push(ln); }
    world.gate = { x, z };
  }

  function buildBillboards() {
    const roofB = world.buildings.apts3;
    if (roofB) {
      const g = new THREE.Group(); g.position.set(roofB.x, roofB.h + 0.2, roofB.z + 3); add(g);
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshBasicMaterial({ map: canvasTex(280, 120, (c, w, h) => {
        c.fillStyle = '#1f2a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3b93c'; c.font = 'bold 54px Georgia'; c.textAlign = 'center'; c.fillText('SF3AM', w / 2, 58); c.fillStyle = '#e9e0c8'; c.font = '18px Georgia'; c.fillText('the game · available winter 2027', w / 2, 84); c.fillStyle = '#d9772b'; c.fillText('sf3am.com', w / 2, 108); c.strokeStyle = '#e3b93c'; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
      }, THREE), side: THREE.DoubleSide }));
      bb.position.y = 5; g.add(bb); g.add(box(0.3, 4, 0.3, '#2b2f2a', -5, 2, 0)); g.add(box(0.3, 4, 0.3, '#2b2f2a', 5, 2, 0));
      world.clickables.push({ mesh: bb, url: 'https://sf3am.com' });
    }
    // street-level poster near the start
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.2), new THREE.MeshBasicMaterial({ map: canvasTex(96, 128, (c, w, h) => { c.fillStyle = '#1f2a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3b93c'; c.font = 'bold 26px Georgia'; c.textAlign = 'center'; c.fillText('SF3AM', w / 2, 40); c.fillStyle = '#e9e0c8'; c.font = '11px Georgia'; c.fillText('the game', w / 2, 58); c.fillText('winter 2027', w / 2, 76); c.fillStyle = '#d9772b'; c.fillText('sf3am.com', w / 2, 108); }, THREE), side: THREE.DoubleSide }));
    p.position.set(C[1] + 1, 3.2, C[2] - 25.4); p.rotation.y = Math.PI; add(p); world.clickables.push({ mesh: p, url: 'https://sf3am.com' });
    add(box(3.5, 4.6, 0.12, '#2b2f2a', C[1] + 1, 3.2, C[2] - 25.3));
    const p2 = p.clone(); p2.position.set(C[1] + 1, 3.2, C[2] - 25.2); p2.rotation.y = 0; p2.scale.x = -1; add(p2); world.clickables.push({ mesh: p2, url: 'https://sf3am.com' });
    for (const s of [-1, 1]) add(box(0.2, 3.4, 0.2, '#5a3a22', C[1] + 1 + s * 1.5, 1.7, C[2] - 25.4));
    world.interactables.push({ type: 'poster', x: C[1] + 1, z: C[2] - 26, r: 2.8, label: 'SF3AM poster', url: 'https://sf3am.com' });
    // Alta Redwood Pictures bridge banner
    const sm = new THREE.MeshBasicMaterial({ map: canvasTex(256, 72, (c, w, h) => { c.fillStyle = '#2b2f2a'; c.fillRect(0, 0, w, h); const im = new Image(); c.fillStyle = '#e9e0c8'; let fs = 26; c.font = `bold ${fs}px Georgia`; while (c.measureText('Alta Redwood Pictures').width > w - 62 && fs > 10) { fs -= 1; c.font = `bold ${fs}px Georgia`; } c.textAlign = 'center'; c.fillText('Alta Redwood Pictures', 50 + (w - 56) / 2, 44); c.strokeStyle = '#e9e0c8'; c.lineWidth = 3; c.beginPath(); c.moveTo(24, 36); c.lineTo(8, 20); c.moveTo(24, 36); c.lineTo(40, 20); c.moveTo(24, 36); c.lineTo(40, 52); c.moveTo(24, 36); c.lineTo(8, 52); c.stroke(); }, THREE) });
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.8), sm); bn.position.set(-30, 8.5, -129.6); add(bn);
  }

  function buildSkyline() {
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, r = 190 + rnd() * 60;
      const h = 30 + rnd() * 70;
      const b = box(rand(10, 22), h, rand(10, 22), pick(['#5d6a70', '#6a6e6c', '#4a5a60']), Math.cos(a) * r, h / 2, Math.sin(a) * r - 10);
      add(b);
    }
    // Smith-tower-like landmark (after the sketch in ./art)
    const t = new THREE.Group(); t.position.set(-170, 0, 20);
    t.add(box(14, 60, 14, '#7a5a52', 0, 30, 0)); t.add(box(15, 1, 15, '#d9c98a', 0, 61, 0));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(10, 14, 4), mat('#6a4a42')); cap.rotation.y = Math.PI / 4; cap.position.y = 68; t.add(cap); add(t);
  }

  function buildScooters() {
    const pts = [[-31, -54.5], [100, 6.5], [31, -54.5], [-87, 6.5], [20, 54.5], [-15, 54.5], [10, 6.5], [45, -7.5], [-87, 54.5]];
    pts.forEach(([x, z], idx) => world.scooters.push({ id: idx, x, z, h: rand(0, 6), mesh: null }));
  }
  return world;
}

// Ground height at x,z (terrace + ramps).
export function groundHeight(world, x, z) {
  if (x > 1500) return 0.2; // interior
  const bx = PARK.bx, bz = PARK.bz;
  if (world.ramps) for (const r of world.ramps) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { const t = (r.z1 - z) / (r.z1 - r.z0); return 0.2 + t * (TERRACE_Y - 0.2); }
  if (x >= bx - 25 && x <= bx + 25 && z >= bz - 25 && z <= bz - 3) return TERRACE_Y;
  if (z < -128) return 0.25;
  return 0.2;
}
