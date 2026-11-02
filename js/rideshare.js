// "Robot Driver" ride-share: a driverless white car you order from the phone. It drives the street grid to you,
// flashes its lights, then takes you to a chosen place. Neighbors also hail ambient robot cars now and then.
// The cars are solid for traffic and pedestrians (see traffic.setExtraSolids) and yield to both.
import * as THREE from '../vendor/three.module.min.js';
import { mat } from './actors.js';
import { signTexture } from './art.js';
import { R } from './world.js';
import { rand, pick, angDiff, clamp } from './util.js';

const LANE = 2.5, CRUISE = 11;
const WHITE = '#f4f6f4';

// Nearest road (road centre-lines run along x at z=c, or along z at x=c) and the position along it.
function snap(x, z) {
  let best = null;
  for (const c of R) for (const s of [{ axis: 'x', c, p: x, d: Math.abs(z - c) }, { axis: 'z', c, p: z, d: Math.abs(x - c) }]) if (!best || s.d < best.d) best = s;
  best.p = clamp(best.p, -124, 124);
  return best;
}
const pt = (s, p = s.p) => (s.axis === 'x' ? [p, s.c] : [s.c, p]);

// Waypoints along road centre-lines from road-position A to B (at most two turns).
function route(A, B) {
  const a = pt(A), b = pt(B);
  if (A.axis === B.axis) {
    if (A.c === B.c) return [a, b];
    const mid = (A.p + B.p) / 2, c2 = R.reduce((m, r) => (Math.abs(r - mid) < Math.abs(m - mid) ? r : m), R[0]);
    return [a, pt(A, c2), pt(B, c2), b];
  }
  return [a, A.axis === 'x' ? [B.c, A.c] : [A.c, B.c], b];
}
const length = (w) => w.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - w[i - 1][0], p[1] - w[i - 1][1]) : 0), 0);
export const fareFor = (len) => Math.max(3, Math.round(3 + len * 0.05));

let decal = null;
function wheel(r, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.28, 10), mat('#1f2320')); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m;
}
const bx = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); return m; };

// Three slightly different white robot cars: pod, wagon and bubble.
function makeRoboCar(style, flash) {
  const g = new THREE.Group();
  const glass = mat('#1d3a46', { transparent: true, opacity: 0.9 });
  if (style === 0) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat(WHITE)); b.scale.set(1.05, 0.55, 2.2); b.position.y = 0.85; g.add(b);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glass); cab.scale.set(0.9, 0.62, 1.35); cab.position.set(0, 1.35, 0); g.add(cab);
    for (const x of [-0.95, 0.95]) for (const z of [-1.3, 1.3]) g.add(wheel(0.4, x, 0.4, z));
  } else if (style === 1) {
    g.add(bx(1.95, 0.8, 4.4, WHITE, 0, 0.85, 0));
    g.add(bx(1.8, 0.85, 3.2, WHITE, 0, 1.65, -0.2));
    g.add(bx(1.84, 0.5, 3.0, glass, 0, 1.7, -0.2));
    g.add(bx(1.9, 0.08, 3.3, '#cfd6d6', 0, 2.1, -0.2));
    for (const x of [-1, 1]) for (const z of [-1.45, 1.45]) g.add(wheel(0.42, x, 0.42, z));
  } else {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat(WHITE)); b.scale.set(1.1, 0.95, 1.7); b.position.y = 1.15; g.add(b);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); w.scale.set(1.12, 0.7, 1.2); w.position.set(0, 1.25, 0); g.add(w);
    for (const x of [-0.95, 0.95]) for (const z of [-1.0, 1.0]) g.add(wheel(0.45, x, 0.45, z));
  }
  const top = style === 1 ? 2.2 : style === 2 ? 2.15 : 2.0;
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.26, 10), mat('#2b3436')); lidar.position.set(0, top + 0.1, 0.1); g.add(lidar);
  const bar = style === 2 ? 1.0 : 1.2, fz = style === 1 ? 2.22 : style === 2 ? 1.62 : 2.15, y = style === 1 ? 1.0 : 0.9;
  g.add(bx(bar, 0.12, 0.08, flash, 0, y, fz)); g.add(bx(bar, 0.12, 0.08, flash, 0, y, -fz));
  g.add(bx(1.5, 0.05, 3.0, '#5ee6ff', 0, 0.12, 0));
  if (!decal) decal = new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'ROBOT DRIVER', '#0f2a33', '#9ff2ff', 'driverless') });
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), decal); d.position.set(s * (style === 1 ? 0.99 : 1.07), style === 1 ? 1.1 : 0.95, 0); d.rotation.y = s * Math.PI / 2; g.add(d); }
  return { g, lidar };
}

export function buildRideshare(scene, world, cb) {
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#5ee6ff', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 8; beam.visible = false;
  const S = { phase: 'idle', plate: '', dest: null, fare: 0, len: 0 };
  let me = null; // the player's car
  let amb = null, ambCool = 25; // one ambient neighbor trip at a time
  let t = 0;

  const allTrips = () => [me, amb].filter(Boolean);
  const setPhase = (T, p) => { T.phase = p; if (T === me) S.phase = p; };
  const place = (T) => { T.car.g.position.set(T.pos[0] - Math.cos(T.h) * LANE, 0.2, T.pos[1] + Math.sin(T.h) * LANE); T.car.g.rotation.y = T.h; };

  function makeTrip(style, startWp) {
    const flash = new THREE.MeshBasicMaterial({ color: '#7fe9ff' });
    const car = makeRoboCar(style, flash); scene.add(car.g);
    const T = { car, flash, phase: 'coming', pos: [...startWp[0]], h: 0, v: 0, wp: startWp, idx: 1, dir: [0, 1], leave: 0, waited: 0, stuck: 0, ignore: 0 };
    T.h = Math.atan2(startWp[1][0] - startWp[0][0], startWp[1][1] - startWp[0][1]); place(T);
    return T;
  }
  const dispose = (T) => { scene.remove(T.car.g); T.flash.dispose(); };

  function destinations(tram) {
    const out = [], seen = new Set();
    for (const d of world.doors) { if (!d.label || seen.has(d.label)) continue; seen.add(d.label); out.push({ label: d.label, x: d.x, z: d.z }); }
    for (const s of tram?.stops || []) out.push({ label: `Streetcar stop: ${s.name}`, x: s.sx, z: s.sz });
    out.push({ label: 'Fernwood woods entrance', x: 129, z: 104 });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  const estimate = (from, dest) => { const len = length(route(snap(from.x, from.z), snap(dest.x, dest.z))); return { len, fare: fareFor(len) }; };

  // A street intersection a fair way from (x, z) for a car to start from.
  function startNear(x, z, lo, hi) {
    const starts = [];
    for (const a of R) for (const b of R) { const d = Math.hypot(a - x, b - z); if (d > lo && d < hi) starts.push([a, b]); }
    return starts.length ? pick(starts) : [R[0], R[0]];
  }

  function order(player, dest) {
    if (me) return false;
    const here = snap(player.x, player.z);
    const st = startNear(player.x, player.z, 50, 130);
    let wp = route(snap(st[0], st[1]), here);
    if (wp.length < 2 || length(wp) < 1) wp = [pt(here), pt(here)];
    const style = Math.floor(Math.random() * 3);
    me = makeTrip(style, wp); me.car.g.add(beam);
    S.plate = `RD-${String(Math.floor(rand(100, 999)))}`; S.dest = dest; S.style = ['pod', 'wagon', 'bubble'][style];
    const e = estimate(player, dest); S.len = e.len; S.fare = e.fare; S.eta = Math.round(length(wp) / 9);
    setPhase(me, 'coming');
    return true;
  }

  function cancel() {
    if (!me) return;
    me.car.g.remove(beam); dispose(me); me = null; beam.visible = false; S.phase = 'idle'; S.dest = null;
  }

  function board() {
    if (!me || me.phase !== 'waiting') return false;
    const A = snap(me.pos[0], me.pos[1]), B = snap(S.dest.x, S.dest.z);
    me.wp = route(A, B); me.wp[0] = [...me.pos]; me.idx = 1; me.v = 0; beam.visible = false; setPhase(me, 'riding');
    return true;
  }

  // Distance to the nearest thing directly ahead: other cars, people on foot, other robot cars.
  function blocked(T, traffic, people) {
    const sx = Math.sin(T.h), cz = Math.cos(T.h), px = T.pos[0] - Math.cos(T.h) * LANE, pz = T.pos[1] + Math.sin(T.h) * LANE;
    let gap = 99;
    const test = (x, z, reach, half) => {
      const dx = x - px, dz = z - pz, fwd = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx);
      if (fwd > 0 && fwd < reach && lat < half) gap = Math.min(gap, fwd);
    };
    for (const a of traffic || []) test(a.mesh.position.x, a.mesh.position.z, 10, 2.4);
    for (const o of allTrips()) if (o !== T) test(o.car.g.position.x, o.car.g.position.z, 11, 2.6);
    if (!T.ignore) for (const p of people) if (p !== T.npc) test(p.x, p.z, 9, 1.8);
    return gap;
  }

  // Shared driving step for the player's car and ambient cars. Returns 'end' when the last waypoint is reached.
  function drive(T, dt, traffic, people) {
    if (T.phase === 'leaving') {
      T.leave -= dt; T.v = Math.min(CRUISE, T.v + 5 * dt); T.pos[0] += T.dir[0] * T.v * dt; T.pos[1] += T.dir[1] * T.v * dt; place(T);
      return T.leave <= 0 ? 'gone' : null;
    }
    const tg = T.wp[T.idx]; const dx = tg[0] - T.pos[0], dz = tg[1] - T.pos[1]; const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      if (T.idx < T.wp.length - 1) { T.idx++; return null; }
      return 'end';
    }
    T.dir = [dx / d, dz / d];
    const th = Math.atan2(dx, dz), turn = Math.abs(angDiff(T.h, th));
    let target = CRUISE;
    if (T.idx < T.wp.length - 1) target = Math.min(target, 3 + d * 0.9); else target = Math.min(target, 1 + d * 1.1);
    if (turn > 0.6) target = Math.min(target, 2);
    const gap = blocked(T, traffic, people); if (gap < 10) target = Math.min(target, Math.max(0, (gap - 4) * 1.2));
    // stuck for a long time behind a pedestrian: creep on, people get nudged aside
    if (T.v < 0.3 && gap < 10) { T.stuck += dt; if (T.stuck > 12) { T.ignore = 3; T.stuck = 0; } } else T.stuck = Math.max(0, T.stuck - dt);
    if (T.ignore > 0) T.ignore -= dt;
    T.v += clamp(target - T.v, -14 * dt, 5 * dt);
    T.h += angDiff(T.h, th) * Math.min(1, dt * 4);
    T.pos[0] += T.dir[0] * T.v * dt; T.pos[1] += T.dir[1] * T.v * dt; place(T);
    return null;
  }

  function curbFor(T, dest) {
    const B = snap(T.pos[0], T.pos[1]);
    const side = (B.axis === 'x' ? dest.z - B.c : dest.x - B.c) >= 0 ? 1 : -1;
    return B.axis === 'x' ? [T.pos[0], B.c + side * 7.5] : [B.c + side * 7.5, T.pos[1]];
  }
  const leave = (T) => { setPhase(T, 'leaving'); T.leave = 5; T.flash.color.set('#7fe9ff'); };

  function updateMe(dt, traffic, people) {
    if (!me) return;
    me.car.lidar.rotation.y += dt * 7;
    if (me.phase === 'waiting') {
      me.flash.color.set(Math.floor(t * 4) % 2 ? '#7fe9ff' : '#ffd24a'); beam.visible = true; beam.material.opacity = 0.2 + 0.1 * Math.sin(t * 6);
      me.waited += dt; if (me.waited > 150) { cancel(); cb.expired?.(); }
      return;
    }
    if (me.phase !== 'leaving') me.flash.color.set('#9ff2ff');
    const r = drive(me, dt, traffic, people);
    if (r === 'gone') { dispose(me); me = null; S.phase = 'idle'; return; }
    if (r !== 'end') return;
    if (me.phase === 'coming') { setPhase(me, 'waiting'); me.waited = 0; cb.waiting?.(S); return; }
    const curb = curbFor(me, S.dest);
    leave(me); cb.arrived?.(S, curb);
  }

  // ---- ambient neighbor trips: a walker hails a car, rides to a random door, and walks on.
  function startAmbient(npcs, player) {
    const cands = npcs.list.filter((e) => e.kind === 'walker' && e.state === 'walk' && !e.scooter && !e.goScooter && e.mesh.visible && !e.pet && Math.hypot(e.x - player.x, e.z - player.z) < 90);
    if (!cands.length) return;
    const npc = pick(cands), here = snap(npc.x, npc.z), st = startNear(npc.x, npc.z, 40, 110);
    let wp = route(snap(st[0], st[1]), here);
    if (wp.length < 2 || length(wp) < 1) wp = [pt(here), pt(here)];
    amb = makeTrip(Math.floor(Math.random() * 3), wp); amb.npc = npc;
    npc.state = 'stand'; npc.hailing = true;
  }
  function releaseNpc(T, x, z) {
    const e = T.npc; if (!e) return;
    e.hailing = false; e.state = 'inside'; e.timer = 0.2; e.inside = null;
    if (x !== undefined) { e.x = x; e.z = z; }
  }
  function updateAmbient(dt, traffic, people, npcs, player) {
    if (!amb) {
      ambCool -= dt;
      if (ambCool <= 0) { ambCool = rand(35, 80); startAmbient(npcs, player); }
      return;
    }
    const T = amb, e = T.npc;
    T.car.lidar.rotation.y += dt * 7;
    if (T.phase === 'coming' && e.state !== 'stand') { // the neighbor got talked to / wandered off: cancel the pickup
      leave(T); T.dir = [Math.sin(T.h), Math.cos(T.h)];
    }
    const r = drive(T, dt, traffic, people);
    if (r === 'gone') { dispose(T); amb = null; return; }
    if (r !== 'end') return;
    if (T.phase === 'coming') {
      e.state = 'inside'; e.timer = 1e9; e.mesh.visible = false; e.hailing = false;
      const dest = pick(world.doors); T.dest = dest;
      const A = snap(T.pos[0], T.pos[1]), B = snap(dest.x, dest.z);
      T.wp = route(A, B); T.wp[0] = [...T.pos]; T.idx = 1; T.v = 0; setPhase(T, 'riding');
      return;
    }
    const curb = curbFor(T, T.dest);
    leave(T);
    npcs.relocate(e, curb[0], curb[1]); e.mesh.position.set(e.x, e.y, e.z); releaseNpc(T);
  }

  function update(dt, traffic, foot, walkers, npcs, player) {
    t += dt;
    const people = [];
    if (foot) people.push(foot);
    if (walkers) for (const w of walkers) if (w.mesh.visible && w.state !== 'inside') people.push(w);
    updateMe(dt, traffic, people);
    if (npcs && player) updateAmbient(dt, traffic, people, npcs, player);
  }

  return {
    update, order, cancel, board, destinations, estimate, status: () => S,
    phase: () => (me ? me.phase : 'idle'),
    carPos: () => (me ? { x: me.car.g.position.x, z: me.car.g.position.z, h: me.h } : null),
    center: () => ({ x: me.pos[0], z: me.pos[1], h: me.h, v: me.v }),
    meshes: () => allTrips().map((T) => T.car.g),
  };
}
