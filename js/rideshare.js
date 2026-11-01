// "Robot Driver" ride-share: a driverless white car you order from the phone. It drives the street grid to you,
// flashes its lights, then takes you to a chosen place. It lives outside the ambient traffic system.
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
  const flash = new THREE.MeshBasicMaterial({ color: '#7fe9ff' });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#5ee6ff', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 8; beam.visible = false;
  let car = null, phase = 'idle', t = 0;
  const S = { phase: 'idle', plate: '', dest: null, fare: 0, len: 0 };
  let pos = [0, 0], h = 0, v = 0, wp = [], idx = 1, dir = [0, 1], lidar = null, leave = 0, waited = 0;

  const setPhase = (p) => { phase = p; S.phase = p; };
  const place = () => { car.g.position.set(pos[0] - Math.cos(h) * LANE, 0.2, pos[1] + Math.sin(h) * LANE); car.g.rotation.y = h; };

  function destinations(tram) {
    const out = [], seen = new Set();
    for (const d of world.doors) { if (!d.label || seen.has(d.label)) continue; seen.add(d.label); out.push({ label: d.label, x: d.x, z: d.z }); }
    for (const s of tram?.stops || []) out.push({ label: `Streetcar stop: ${s.name}`, x: s.sx, z: s.sz });
    out.push({ label: 'Fernwood woods entrance', x: 129, z: 104 });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  const estimate = (from, dest) => { const len = length(route(snap(from.x, from.z), snap(dest.x, dest.z))); return { len, fare: fareFor(len) }; };

  function order(player, dest) {
    if (phase !== 'idle') return false;
    const here = snap(player.x, player.z);
    // start from a street intersection a fair way off
    const starts = [];
    for (const a of R) for (const b of R) { const d = Math.hypot(a - player.x, b - player.z); if (d > 50 && d < 130) starts.push([a, b]); }
    const st = starts.length ? pick(starts) : [R[0], R[0]];
    wp = route(snap(st[0], st[1]), here);
    if (wp.length < 2 || length(wp) < 1) wp = [pt(here), pt(here)];
    const style = Math.floor(Math.random() * 3);
    car = makeRoboCar(style, flash); lidar = car.lidar; scene.add(car.g); car.g.add(beam);
    S.plate = `RD-${String(Math.floor(rand(100, 999)))}`; S.dest = dest; S.style = ['pod', 'wagon', 'bubble'][style];
    const e = estimate(player, dest); S.len = e.len; S.fare = e.fare; S.eta = Math.round(length(wp) / 9);
    pos = [...wp[0]]; idx = 1; v = 0; waited = 0;
    h = Math.atan2(wp[1][0] - wp[0][0], wp[1][1] - wp[0][1]); place();
    setPhase('coming');
    return true;
  }

  function cancel() {
    if (!car) return;
    scene.remove(car.g); car = null; beam.visible = false; setPhase('idle'); S.dest = null;
  }

  function board() {
    if (phase !== 'waiting') return false;
    const A = snap(pos[0], pos[1]), B = snap(S.dest.x, S.dest.z);
    wp = route(A, B); wp[0] = [...pos]; idx = 1; v = 0; beam.visible = false; setPhase('riding');
    return true;
  }

  // yield to ambient traffic directly ahead of us
  function blocked(traffic) {
    const sx = Math.sin(h), cz = Math.cos(h), px = pos[0] - Math.cos(h) * LANE, pz = pos[1] + Math.sin(h) * LANE;
    let gap = 99;
    for (const a of traffic) {
      const dx = a.mesh.position.x - px, dz = a.mesh.position.z - pz, fwd = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx);
      if (fwd > 0 && fwd < 10 && lat < 2.4) gap = Math.min(gap, fwd);
    }
    return gap;
  }

  function update(dt, traffic) {
    if (!car) return;
    t += dt; lidar.rotation.y += dt * 7;
    if (phase === 'waiting') {
      flash.color.set(Math.floor(t * 4) % 2 ? '#7fe9ff' : '#ffd24a'); beam.visible = true; beam.material.opacity = 0.2 + 0.1 * Math.sin(t * 6);
      waited += dt; if (waited > 150) { cancel(); cb.expired?.(); }
      return;
    }
    if (phase === 'leaving') {
      leave -= dt; v = Math.min(CRUISE, v + 5 * dt); pos[0] += dir[0] * v * dt; pos[1] += dir[1] * v * dt; place();
      if (leave <= 0) { scene.remove(car.g); car = null; setPhase('idle'); }
      return;
    }
    flash.color.set('#9ff2ff');
    const tg = wp[idx]; let dx = tg[0] - pos[0], dz = tg[1] - pos[1]; const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      if (idx < wp.length - 1) { idx++; return; }
      if (phase === 'coming') { setPhase('waiting'); waited = 0; cb.waiting?.(S); return; }
      const A = snap(pos[0], pos[1]), B = snap(S.dest.x, S.dest.z);
      const side = (B.axis === 'x' ? S.dest.z - B.c : S.dest.x - B.c) >= 0 ? 1 : -1;
      const curb = B.axis === 'x' ? [pos[0], B.c + side * 7.5] : [B.c + side * 7.5, pos[1]];
      setPhase('leaving'); leave = 5; flash.color.set('#7fe9ff');
      cb.arrived?.(S, curb); return;
    }
    dir = [dx / d, dz / d];
    const th = Math.atan2(dx, dz), turn = Math.abs(angDiff(h, th));
    let target = CRUISE;
    if (idx < wp.length - 1) target = Math.min(target, 3 + d * 0.9); else target = Math.min(target, 1 + d * 1.1);
    if (turn > 0.6) target = Math.min(target, 2);
    const gap = traffic ? blocked(traffic) : 99; if (gap < 10) target = Math.min(target, Math.max(0, (gap - 4) * 1.2));
    v += clamp(target - v, -14 * dt, 5 * dt);
    h += angDiff(h, th) * Math.min(1, dt * 4);
    pos[0] += dir[0] * v * dt; pos[1] += dir[1] * v * dt; place();
  }

  return {
    update, order, cancel, board, destinations, estimate, status: () => S,
    phase: () => phase,
    carPos: () => (car ? { x: car.g.position.x, z: car.g.position.z, h } : null),
    center: () => ({ x: pos[0], z: pos[1], h, v }),
  };
}
