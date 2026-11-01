// Traffic, parked cars, the streetcar, lighting/weather.
import * as THREE from '../vendor/three.module.min.js';
import { makeVehicle, makeStreetcar, mat } from './actors.js';
import { R, C } from './world.js';
import { rand, pick, angDiff, clamp, lerp } from './util.js';

const LANE = { car: 2.5, bus: 2.7, motorcycle: 3.6, bicycle: 4.2, scooter: 4.4 };
const SPEED = { car: [7, 11], bus: [5, 7], motorcycle: [9, 13], bicycle: [3, 4.5], scooter: [4, 6] };

export function buildTraffic(scene, world) {
  const agents = [];
  const spawnList = [['car', 16], ['bus', 3], ['motorcycle', 4], ['bicycle', 4], ['scooter', 3]];
  for (const [type, n] of spawnList) for (let i = 0; i < n; i++) {
    const mesh = makeVehicle(type); scene.add(mesh);
    const horiz = Math.random() < 0.5;
    const a = { type, mesh, axis: horiz ? 'x' : 'z', c: pick(R), p: rand(-124, 124), dir: Math.random() < 0.5 ? 1 : -1, v: 0, vmax: rand(...SPEED[type]), h: 0, lane: LANE[type] };
    a.h = headingOf(a); agents.push(a);
  }
  // parked cars along the curbs
  const parked = [];
  for (const c of R) for (const axis of ['x', 'z']) for (const side of [-1, 1]) {
    for (let p = -118; p <= 118; p += 5.4) {
      if (R.some((n) => Math.abs(p - n) < 9)) continue;
      if (Math.random() > 0.58) continue;
      const m = makeVehicle('car'); m.scale.setScalar(0.92);
      const off = side * 4.9;
      if (axis === 'z') { m.position.set(c + off, 0, p); m.rotation.y = side > 0 ? 0 : Math.PI; }
      else { m.position.set(p, 0, c + off); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
      m.rotation.y += rand(-0.05, 0.05);
      scene.add(m); parked.push(m);
    }
  }
  // interstate traffic
  const hw = [];
  for (let i = 0; i < 8; i++) {
    const type = pick(['car', 'car', 'bus', 'motorcycle']);
    const m = makeVehicle(type); scene.add(m);
    const dir = i % 2 ? 1 : -1;
    hw.push({ mesh: m, dir, x: rand(-150, 150), v: rand(14, 22), z: world.bridgeZ + (dir > 0 ? 4.5 : -4.5) });
  }

  function headingOf(a) { return a.axis === 'z' ? (a.dir > 0 ? 0 : Math.PI) : (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }

  function update(dt, foot) {
    for (const a of agents) {
      // follow gap
      let target = a.vmax;
      if (a.type === 'bus') {
        // buses pause for a pedestrian close by, and stop when a rider asks to get off
        if (a.stopReq) target = 0;
        else if (!a.rider && foot && Math.hypot(a.mesh.position.x - foot.x, a.mesh.position.z - foot.z) < 6) target = 0;
      }
      for (const o of agents) {
        if (o === a || o.axis !== a.axis || o.c !== a.c || o.dir !== a.dir) continue;
        const gap = (o.p - a.p) * a.dir;
        if (gap > 0 && gap < 9) target = Math.min(target, Math.max(0, o.v * (gap / 9) - (gap < 4 ? 2 : 0)));
      }
      a.v += clamp(target - a.v, -12 * dt, 4 * dt);
      const prev = a.p; a.p += a.dir * a.v * dt;
      for (const n of R) {
        if ((prev - n) * (a.p - n) < 0 || a.p === n) { turn(a, n); break; }
      }
      a.p = clamp(a.p, -124, 124);
      const th = headingOf(a); a.h += angDiff(a.h, th) * Math.min(1, dt * 4);
      const cx = a.axis === 'z' ? a.c : a.p, cz = a.axis === 'z' ? a.p : a.c;
      a.mesh.position.set(cx - Math.cos(a.h) * a.lane, 0.2, cz + Math.sin(a.h) * a.lane);
      a.mesh.rotation.y = a.h;
    }
    for (const t of hw) {
      t.x += t.dir * t.v * dt; if (t.x > 160) t.x = -160; if (t.x < -160) t.x = 160;
      t.mesh.position.set(t.x, 12.6, t.z); t.mesh.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  function turn(a, n) {
    const opts = [];
    const nextStraight = n + a.dir * 62;
    if (Math.abs(nextStraight) <= 124) opts.push('s', 's');
    if (R.includes(a.c)) {
      if (a.c > -124 && a.c < 124 || true) { opts.push('a'); opts.push('b'); }
    }
    const choice = pick(opts.length ? opts : ['a']);
    if (choice === 's') return;
    // turn onto the perpendicular road passing through node n
    const newDir = choice === 'a' ? 1 : -1;
    const oldC = a.c;
    if (oldC + newDir * 1 > 124 || oldC + newDir * 1 < -124) return turnAround(a, n, oldC);
    a.axis = a.axis === 'x' ? 'z' : 'x'; a.p = oldC; a.c = n; a.dir = newDir;
  }
  function turnAround(a, n, oldC) { a.axis = a.axis === 'x' ? 'z' : 'x'; a.p = oldC; a.c = n; a.dir = oldC > 0 ? -1 : 1; }

  return { agents, update };
}

// ------------------------------------------------------------------ streetcar
export function buildStreetcar(scene, world) {
  // Zig-zag loop through the district, rounded at the corners.
  const pts = [[-62, -62], [0, -62], [0, 0], [124, 0], [124, 62], [-62, 62]].map(([x, z]) => new THREE.Vector2(x, z));
  const samples = [];
  const rad = 7;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const a = p1.clone().sub(p0).normalize(), b = p2.clone().sub(p1).normalize();
    const s = p1.clone().addScaledVector(a, -rad), e = p1.clone().addScaledVector(b, rad);
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const u = 1 - t;
      samples.push(new THREE.Vector2(u * u * s.x + 2 * u * t * p1.x + t * t * e.x, u * u * s.y + 2 * u * t * p1.y + t * t * e.y));
    }
  }
  // densify
  const path = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    const len = a.distanceTo(b); const steps = Math.max(1, Math.round(len / 1));
    for (let k = 0; k < steps; k++) path.push(a.clone().lerp(b, k / steps));
  }
  const cum = [0];
  for (let i = 1; i <= path.length; i++) cum.push(cum[i - 1] + path[i - 1].distanceTo(path[i % path.length]));
  const total = cum[path.length];
  const at = (s) => {
    s = ((s % total) + total) % total;
    let lo = 0, hi = path.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
    const a = path[lo], b = path[(lo + 1) % path.length];
    const f = (s - cum[lo]) / Math.max(0.0001, cum[lo + 1] - cum[lo]);
    const pos = a.clone().lerp(b, f);
    return { x: pos.x, z: pos.y, h: Math.atan2(b.x - a.x, b.y - a.y) };
  };
  const nearestS = (x, z) => { let best = 0, bd = 1e9; path.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - z) ** 2; if (d < bd) { bd = d; best = cum[i]; } }); return best; };

  // rails
  const railGeo = new THREE.BoxGeometry(0.12, 0.08, 1.2);
  const rails = new THREE.InstancedMesh(railGeo, mat('#7a7e7a'), path.length * 2);
  const d = new THREE.Object3D();
  path.forEach((p, i) => {
    const q = path[(i + 1) % path.length]; const h = Math.atan2(q.x - p.x, q.y - p.y);
    for (const [k, side] of [[0, -0.7], [1, 0.7]]) { d.position.set(p.x + Math.cos(h) * side, 0.05, p.y - Math.sin(h) * side); d.rotation.y = h; d.updateMatrix(); rails.setMatrixAt(i * 2 + k, d.matrix); }
  });
  scene.add(rails);

  const stopsDef = [
    { name: 'Union Station', x: 93, z: 0, ref: 'station' },
    { name: 'Chinatown Gate', x: -62, z: -31 },
    { name: "Baloo's Park", x: -31, z: 62 },
    { name: 'Hotel Square', x: 0, z: -31 },
    { name: 'Market Street', x: 93, z: 62 },
  ];
  const stops = stopsDef.map((s) => {
    const sp = nearestS(s.x, s.z);
    const sh = new THREE.Group();
    const dx = s.x === 0 || s.x === -62 ? 6.9 : 0, dz = dx ? 0 : (s.z === 0 ? -6.9 : 6.9);
    sh.add(boxM(3.4, 0.2, 1.6, '#4f6b3a', 0, 3, 0)); sh.add(boxM(0.15, 3, 0.15, '#2b2f2a', -1.5, 1.5, 0.6)); sh.add(boxM(0.15, 3, 0.15, '#2b2f2a', 1.5, 1.5, 0.6));
    const sm = new THREE.MeshBasicMaterial({ color: '#e3b93c' }); const flag = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.05), sm); flag.position.set(0, 3.5, 0); sh.add(flag);
    sh.position.set(s.x + dx, 0.2, s.z + dz); sh.rotation.y = dx ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : (dz > 0 ? Math.PI : 0); scene.add(sh);
    world.interactables.push({ type: 'tramstop', x: s.x + dx, z: s.z + dz, r: 5, label: s.name + ' stop' });
    return { ...s, s: sp, sx: s.x + dx, sz: s.z + dz };
  });
  stops.sort((a, b) => a.s - b.s);

  const group = makeStreetcar(); scene.add(group);
  const tram = { group, s: stops[0].s, speed: 0, dwell: 6, stopIdx: 0, atStop: stops[0], stops, total, ridersAboard: false, pos: new THREE.Vector3(), nextIdx: 1 };

  function update(dt) {
    if (tram.dwell > 0) { tram.dwell -= dt; tram.speed = lerp(tram.speed, 0, dt * 4); }
    else {
      tram.atStop = null;
      const nxt = stops[tram.nextIdx];
      let dist = ((nxt.s - tram.s) % total + total) % total;
      const vmax = 8;
      tram.speed = Math.min(vmax, tram.speed + 3 * dt, Math.max(1.2, dist * 0.8));
      tram.s += tram.speed * dt;
      dist = ((nxt.s - tram.s) % total + total) % total;
      if (dist < 0.6 || dist > total - 1) { tram.s = nxt.s; tram.dwell = 8; tram.atStop = nxt; tram.stopIdx = tram.nextIdx; tram.nextIdx = (tram.nextIdx + 1) % stops.length; tram.arrived = true; }
    }
    const p = at(tram.s);
    group.position.set(p.x, 0.25, p.z); group.rotation.y = p.h; tram.pos.set(p.x, 0.25, p.z); tram.h = p.h;
  }
  function boxM(w, h, dd, c, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat(c)); m.position.set(x, y, z); return m; }
  return { tram, update };
}

// ------------------------------------------------------------------ environment
export function buildEnvironment(scene, renderer) {
  const hemi = new THREE.HemisphereLight('#cfdde0', '#5a5a48', 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3d6', 0.7); sun.position.set(-40, 80, 30); scene.add(sun);
  scene.fog = new THREE.Fog('#a9b8bc', 60, 230);
  scene.background = new THREE.Color('#a9b8bc');

  // rain
  const N = 1400;
  const pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = rand(-40, 40), y = rand(0, 40), z = rand(-40, 40); pos.set([x, y, z, x - 0.1, y - 1.2, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c9dfe6', transparent: true, opacity: 0.55 }));
  rain.visible = false; rain.frustumCulled = false; scene.add(rain);

  const env = { weather: 'cloudy', weatherTimer: 0, light: 1, hemi, sun, rain, rainOn: false, night: 0 };
  const cSky = { cloudy: new THREE.Color('#a9b8bc'), sun: new THREE.Color('#bcd9dc'), rain: new THREE.Color('#8a979a') };
  const night = new THREE.Color('#34424f');
  const tmp = new THREE.Color();

  env.update = (dt, minutes, camTarget, lamps, nightGlow) => {
    const hour = (minutes / 60) % 24;
    // darkness: subtle, ranges 0 (day) .. 1 (night)
    let dark = 0;
    if (hour >= 20 || hour < 5) dark = 1; else if (hour >= 18) dark = (hour - 18) / 2; else if (hour < 7) dark = 1 - (hour - 5) / 2;
    env.night = dark;
    const k = env.weather === 'sun' ? 1 : env.weather === 'rain' ? 0.72 : 0.84;
    tmp.copy(cSky[env.weather]).lerp(night, dark * 0.55);
    scene.background.copy(tmp); scene.fog.color.copy(tmp);
    env.hemi.intensity = (0.95 * k) * (1 - dark * 0.3);
    env.sun.intensity = (env.weather === 'sun' ? 0.95 : 0.45) * (1 - dark * 0.55);
    env.sun.color.set(hour > 16 && hour < 19 ? '#ffd9a0' : '#fff3d6');
    const a = (hour / 24) * Math.PI * 2;
    env.sun.position.set(Math.cos(a) * 80, 60 + Math.sin(a - Math.PI / 2) * 30, 30);
    for (const l of lamps) l.material.color.set(dark > 0.3 ? '#fff0b0' : '#9a9a80');
    for (const g of nightGlow) if (g.material) g.material.color.set(dark > 0.3 ? '#e8c76a' : '#43606a');
    // weather changes every ~2-3 game hours; mostly cloudy
    env.weatherTimer -= dt;
    if (env.weatherTimer <= 0) {
      env.weatherTimer = rand(60, 140);
      const r = Math.random();
      const next = r < 0.6 ? 'cloudy' : r < 0.8 ? 'sun' : 'rain';
      if (next !== env.weather) { env.weather = next; env.onWeather?.(next); }
    }
    env.rainOn = env.weather === 'rain'; rain.visible = env.rainOn;
    if (env.rainOn) {
      const p = rg.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = p.getY(i * 2) - 28 * dt;
        if (y < 0) y += 40;
        p.setY(i * 2, y); p.setY(i * 2 + 1, y - 1.2);
      }
      p.needsUpdate = true;
      rain.position.set(camTarget.x, 0, camTarget.z);
    }
  };
  return env;
}
