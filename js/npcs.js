// Outdoor NPCs (walkers on a sidewalk graph), pets on leashes, animals.
import * as THREE from '../vendor/three.module.min.js';
import { makeHuman, makeSpecial, randomOutfit, animateHuman, makeParrot, makePetDog, makeLeash, updateLeash, makeAnimal } from './actors.js';
import { C } from './world.js';
import { PIER_FOLK } from './pier.js';
import { rand, pick, randInt, angDiff, rushLevel } from './util.js';
import { DATA } from './data.js';

// ---- sidewalk graph
const nodes = []; const key = new Map();
const nodeAt = (x, z) => { const k = x.toFixed(1) + ',' + z.toFixed(1); if (!key.has(k)) { key.set(k, nodes.length); nodes.push({ x, z, n: [], block: null }); } return key.get(k); };
const link = (a, b) => { if (a === b) return; if (!nodes[a].n.includes(b)) nodes[a].n.push(b); if (!nodes[b].n.includes(a)) nodes[b].n.push(a); };

function buildGraph() {
  if (nodes.length) return;
  const E = 23.5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const bx = C[i], bz = C[j];
    const ring = [[-E, -E], [0, -E], [E, -E], [E, 0], [E, E], [0, E], [-E, E], [-E, 0]].map(([dx, dz]) => nodeAt(bx + dx, bz + dz));
    ring.forEach((n, k) => { link(n, ring[(k + 1) % 8]); nodes[n].block = [i, j]; });
    link(ring[7], ring[3]);
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    for (const dz of [-E, 0, E]) { if (i < 3) link(nodeAt(C[i] + E, C[j] + dz), nodeAt(C[i + 1] - E, C[j] + dz)); }
    for (const dx of [-E, 0, E]) { if (j < 3) link(nodeAt(C[i] + dx, C[j] + E), nodeAt(C[i] + dx, C[j + 1] - E)); }
  }
}

const GREETS = ['Hi!', 'Morning!', 'Nice day. Sort of.', 'Hey there.', 'Rain again, huh?'];

export function makePersona(i) {
  const name = DATA.npcNames[i % DATA.npcNames.length] + (i >= DATA.npcNames.length ? ' ' + String.fromCharCode(65 + (i % 26)) + '.' : '');
  return { name, occupation: pick(DATA.occupations), quirk: pick(DATA.quirks), mood: pick(['cheerful', 'tired', 'curious', 'grumpy', 'dreamy', 'chatty']), priceSens: rand(0.2, 1.5) };
}

export function buildNpcs(scene, world, count = 44) {
  buildGraph();
  const list = []; const animals = [];
  const doorsByBlock = {};
  for (const d of world.doors) {
    const b = world.buildings[d.bizId]; if (!b || b.id === 'station') continue;
    const bi = C.findIndex((c) => Math.abs(b.x - c) < 25), bj = C.findIndex((c) => Math.abs(b.z - c) < 25);
    const side = b.z < C[bj] ? 'N' : 'S';
    (doorsByBlock[`${bi},${bj},${side}`] ||= []).push(d);
  }

  function spawn(persona, mesh, kind) {
    const nid = Math.floor(Math.random() * nodes.length);
    const n = nodes[nid];
    const e = { persona, mesh, kind, x: n.x + rand(-1, 1), z: n.z + rand(-1, 1), y: 0.2, node: nid, target: null, speed: rand(1.4, 2.2), state: 'walk', timer: 0, heading: rand(0, 6), inside: null, talked: 0, rel: 0, isNpc: true, bubble: null };
    scene.add(mesh); list.push(e); pickTarget(e); return e;
  }
  const specials = DATA.specialNpcs.map((sp) => {
    const mesh = makeSpecial(sp.kind);
    const e = spawn({ name: sp.name, occupation: sp.kind === 'spartan' ? 'professional Spartan' : 'local', quirk: sp.bio, bio: sp.bio, mood: 'friendly', priceSens: 0.5 }, mesh, sp.kind);
    if (sp.pet) {
      const dogPet = sp.pet === 'bloodhound' || sp.pet === 'golden';
      const parrot = dogPet ? makePetDog(sp.pet) : makeParrot(sp.pet === 'green' ? '#6fb04e' : '#4f8ad0'); scene.add(parrot);
      const leash = makeLeash(); scene.add(leash);
      e.pet = { mesh: parrot, leash, x: e.x, z: e.z, color: sp.pet };
    }
    return e;
  });
  for (let i = 0; i < count; i++) spawn(makePersona(i), makeHuman(randomOutfit()), 'walker');
  // park-goers
  for (let i = 0; i < 6; i++) {
    const e = spawn(makePersona(60 + i), makeHuman(randomOutfit()), 'park');
    e.persona.occupation = 'park regular';
    e.x = world.parkBounds.x0 + rand(2, 48); e.z = world.parkBounds.z0 + rand(28, 48); e.target = null; e.parkGoal = null;
  }
  // commuter pool: sits hidden until the morning/evening rush
  const extras = [];
  for (let i = 0; i < Math.round(count * 0.55); i++) {
    const e = spawn(makePersona(100 + i), makeHuman(randomOutfit()), 'walker');
    e.extra = i; e.off = true; e.state = 'inside'; e.timer = 1e9; e.mesh.visible = false; extras.push(e);
  }
  // pier regulars: they hang around the Alta Redwood Pier and chat
  PIER_FOLK.forEach(([x, z, heading, occupation, quirk], i) => {
    const e = spawn(makePersona(300 + i), makeHuman(randomOutfit()), 'pier');
    e.persona.occupation = occupation; e.persona.quirk = quirk;
    e.x = x; e.z = z; e.heading = heading; e.state = 'stand'; e.pierY = 0.56; e.mesh.position.set(x, 0.56, z); e.mesh.rotation.y = heading; e.target = null;
  });
  // under-the-bridge folk
  const dealers = ['Slim', 'Raven', 'Mouse'].map((nm, i) => {
    const o = randomOutfit(); o.shirt = '#3a3f40'; o.pants = '#2b2f2a'; o.cap = '#2b2f2a'; o.hairStyle = 'none';
    const e = spawn({ name: nm, occupation: 'knows a guy', quirk: 'talks in low murmurs, never makes eye contact', mood: 'wary', priceSens: 0 }, makeHuman(o), 'dealer');
    e.x = -50 + i * 45 + rand(-6, 6); e.z = world.bridgeZ + rand(-3, 6); e.state = 'stand'; e.mesh.position.set(e.x, 0.25, e.z); e.target = null;
    return e;
  });

  // ---- animals
  const spawnAnimal = (kind, x, z) => { const m = makeAnimal(kind); scene.add(m); const a = { kind, mesh: m, x, z, y: 0.2, heading: rand(0, 6), state: 'idle', timer: rand(0, 3), tx: x, tz: z, isAnimal: true, persona: { name: kind === 'pigeon' ? 'a pigeon' : kind === 'gull' ? 'a seagull' : kind === 'raccoon' ? 'a raccoon' : kind === 'pelican' ? 'a brown pelican' : kind === 'deer' ? 'a black-tailed deer' : 'a dog', occupation: kind, quirk: '', mood: 'feral' }, fly: 0, seed: rand(0, 20) }; animals.push(a); return a; };
  for (let i = 0; i < 2; i++) { const a = spawnAnimal('pelican', rand(-100, 100), rand(-100, 100)); a.state = 'soar'; a.airborne = true; a.y = 14; }
  for (let i = 0; i < 14; i++) { const n = nodes[Math.floor(Math.random() * nodes.length)]; spawnAnimal('pigeon', n.x + rand(-3, 3), n.z + rand(-3, 3)); }
  for (let i = 0; i < 6; i++) { const n = nodes[Math.floor(Math.random() * nodes.length)]; spawnAnimal('gull', n.x + rand(-3, 3), n.z + rand(-3, 3)); }
  for (let i = 0; i < 5; i++) { const s = pick(world.trashSpots); const a = spawnAnimal('raccoon', s.x, s.z + 1); a.home = s; }
  { const d = spawnAnimal('deer', 0, 0); d.state = 'away'; d.airborne = true; d.timer = rand(4, 12); d.mesh.visible = false; }
  for (let i = 0; i < 4; i++) { const dp = world.dogPark; spawnAnimal('dog', rand(dp.x0, dp.x1), rand(dp.z0, dp.z1)).dog = true; }

  function pickTarget(e) {
    const cur = nodes[e.node];
    if (e.kind === 'park') { e.parkGoal = { x: world.parkBounds.x0 + rand(2, 48), z: world.parkBounds.z0 + rand(4, 48) }; return; }
    if (e.kind === 'walker' && !e.scooter && !e.goScooter && world.scooters.length && Math.random() < 0.05) {
      const free = world.scooters.filter((s) => !s.riding && !s.claimed && s.mesh && Math.hypot(s.x - e.x, s.z - e.z) < 45);
      if (free.length) { const s = pick(free); s.claimed = true; e.goScooter = s; e.goDoor = false; e.target = null; return; }
    }
    if (e.kind === 'walker' && !e.scooter && Math.random() < 0.28) {
      const blk = cur.block; if (blk) {
        const side = nodes[e.node].z < C[blk[1]] ? 'N' : nodes[e.node].z > C[blk[1]] ? 'S' : null;
        const ds = side && doorsByBlock[`${blk[0]},${blk[1]},${side}`];
        if (ds && ds.length && Math.abs(cur.x - C[blk[0]]) > 20 && (cur.z === C[blk[1]] - 23.5 || cur.z === C[blk[1]] + 23.5)) { e.door = pick(ds); e.target = null; e.goDoor = true; return; }
      }
    }
    const opts = cur.n.filter((n) => n !== e.prev);
    e.next = (opts.length ? pick(opts) : pick(cur.n));
    e.target = e.next;
  }

  function update(dt, t, player, env, minutes) {
    const hour = (minutes / 60) % 24;
    const nightQuiet = hour >= 1 && hour < 5;
    const rush = rushLevel(minutes);
    for (const e of list) {
      const dx = e.x - player.x, dz = e.z - player.z;
      const far = dx * dx + dz * dz > 120 * 120;
      if (e.extra !== undefined) {
        const wanted = rush > (e.extra + 0.5) / extras.length;
        const unseen = dx * dx + dz * dz > 45 * 45;
        if (e.off) {
          if (!wanted) continue;
          let nid = -1;
          for (let k = 0; k < 12; k++) { const c = Math.floor(Math.random() * nodes.length); const n = nodes[c]; if ((n.x - player.x) ** 2 + (n.z - player.z) ** 2 > 45 * 45) { nid = c; break; } }
          if (nid < 0) continue;
          e.off = false; e.state = 'walk'; e.node = nid; e.prev = null; e.x = nodes[nid].x + rand(-1, 1); e.z = nodes[nid].z + rand(-1, 1);
          e.goDoor = false; e.mesh.visible = true; pickTarget(e);
        } else if (!wanted && (e.state === 'inside' || (e.state === 'walk' && unseen && !e.scooter && !e.goScooter))) {
          e.off = true; e.state = 'inside'; e.timer = 1e9; e.mesh.visible = false; e.goDoor = false; continue;
        }
      }
      if (e.state === 'inside') {
        e.timer -= dt; if (e.timer <= 0) { e.state = 'walk'; e.mesh.visible = true; e.inside = null; pickTarget(e); }
        continue;
      }
      if (e.state === 'chat') { e.chatT -= dt; if (e.chatT <= 0) e.state = 'walk'; animateHuman(e.mesh, 0, t); face(e, player.x, player.z, dt); continue; }
      if (e.state === 'stand') { animateHuman(e.mesh, 0, t); e.mesh.position.set(e.x, e.pierY ?? 0.25, e.z); if (dx * dx + dz * dz < 36) face(e, player.x, player.z, dt); continue; }
      if (e.state === 'pause') { e.timer -= dt; animateHuman(e.mesh, 0, t); if (e.timer <= 0) e.state = 'walk'; e.mesh.position.set(e.x, e.y, e.z); continue; }
      let tx, tz;
      if (e.kind === 'park') {
        if (!e.parkGoal) pickTarget(e);
        tx = e.parkGoal.x; tz = e.parkGoal.z;
      } else if (e.goDoor && e.door) { tx = e.door.x; tz = e.door.z; }
      else if (e.goScooter) { tx = e.goScooter.x; tz = e.goScooter.z; }
      else { if (e.target == null) pickTarget(e); tx = nodes[e.target].x; tz = nodes[e.target].z; }
      const vx = tx - e.x, vz = tz - e.z; const dist = Math.hypot(vx, vz);
      const spd = e.speed * (nightQuiet ? 0.8 : 1) * (env.rainOn ? 1.25 : 1) * (e.scooter ? 3 : 1);
      if (dist < 0.8) {
        if (e.goScooter) {
          const s = e.goScooter; e.goScooter = null; s.claimed = false;
          if (!s.riding) { s.riding = true; e.scooter = s; e.rideT = rand(25, 50); relocate(e, e.x, e.z); } else pickTarget(e);
          continue;
        }
        if (e.goDoor) { e.goDoor = false; e.state = 'inside'; e.timer = rand(10, 30); e.inside = e.door.bizId; e.mesh.visible = false; if (e.pet) e.pet.mesh.visible = e.pet.leash.visible = false; continue; }
        if (e.kind === 'park') { e.state = 'pause'; e.timer = rand(2, 8); e.parkGoal = null; pickTarget(e); continue; }
        e.prev = e.node; e.node = e.target; e.target = null;
        if (Math.random() < 0.12) { e.state = 'pause'; e.timer = rand(1, 4); }
        pickTarget(e);
      } else {
        e.x += (vx / dist) * spd * dt; e.z += (vz / dist) * spd * dt;
        if (world.pushVehicles) {
          const [px, pz] = world.pushVehicles(e.x, e.z, 0.4);
          const ox = px - e.x, oz = pz - e.z, om = Math.hypot(ox, oz);
          if (om > 1e-4) {
            // slide along the vehicle's surface toward the goal instead of grinding into it
            let tx2 = -oz / om, tz2 = ox / om; if (tx2 * vx + tz2 * vz < 0) { tx2 = -tx2; tz2 = -tz2; }
            [e.x, e.z] = world.pushVehicles(px + tx2 * spd * dt * 1.2, pz + tz2 * spd * dt * 1.2, 0.4);
            e.blockedT = (e.blockedT || 0) + dt;
            if (e.blockedT > 2) { e.blockedT = 0; e.target = null; e.goDoor = false; e.parkGoal = null; if (e.goScooter) { e.goScooter.claimed = false; e.goScooter = null; } pickTarget(e); }
          } else e.blockedT = Math.max(0, (e.blockedT || 0) - dt);
        }
        const th = Math.atan2(vx, vz); e.heading += angDiff(e.heading, th) * Math.min(1, dt * 8);
      }
      if (!e.mesh.visible && e.state !== 'inside') { e.mesh.visible = true; if (e.pet) e.pet.mesh.visible = e.pet.leash.visible = true; }
      e.y = e.kind === 'park' ? groundY(world, e.x, e.z) : 0.2;
      e.mesh.position.set(e.x, e.y, e.z); e.mesh.rotation.y = e.heading;
      if (e.scooter) {
        const s = e.scooter; s.x = e.x; s.z = e.z; s.h = e.heading; s.mesh.position.set(e.x, e.y, e.z); s.mesh.rotation.y = e.heading; e.mesh.position.y = e.y + 0.35;
        e.rideT -= dt; if (e.rideT <= 0) { s.riding = false; s.v = 0; e.scooter = null; }
      }
      if (!far) animateHuman(e.mesh, e.scooter ? 0 : spd, t, !!e.scooter);
      if (e.bubble) { e.bubble.t -= dt; if (e.bubble.t <= 0) e.bubble = null; }
    }
    for (const e of list) if (e.pet) {
      const p = e.pet; if (e.state === 'inside') continue;
      const bx = e.x - Math.sin(e.heading) * 1.4 + Math.cos(e.heading) * 0.5, bz = e.z - Math.cos(e.heading) * 1.4 - Math.sin(e.heading) * 0.5;
      p.x += (bx - p.x) * Math.min(1, dt * 3); p.z += (bz - p.z) * Math.min(1, dt * 3);
      p.mesh.position.set(p.x, 0.2 + Math.abs(Math.sin(t * 6 + p.x)) * 0.05, p.z); p.mesh.rotation.y = e.heading;
      updateLeash(p.leash, new THREE.Vector3(e.x + Math.cos(e.heading) * 0.45, 1.1, e.z - Math.sin(e.heading) * 0.45), new THREE.Vector3(p.x, 0.5, p.z));
    }
    for (const a of animals) animateAnimal(a, dt, t, player);
  }

  function face(e, x, z, dt) { const th = Math.atan2(x - e.x, z - e.z); e.heading += angDiff(e.heading, th) * Math.min(1, dt * 6); e.mesh.rotation.y = e.heading; }

  function animateAnimal(a, dt, t, player) {
    const dx = a.x - player.x, dz = a.z - player.z, d2 = dx * dx + dz * dz;
    if (a.kind === 'pigeon' || a.kind === 'gull') {
      if (d2 < 9 && a.fly <= 0 && !player.inBuilding) { a.fly = 1.4; a.tx = a.x + dx * 3 + rand(-6, 6); a.tz = a.z + dz * 3 + rand(-6, 6); }
      if (a.fly > 0) {
        a.fly -= dt; a.x += (a.tx - a.x) * dt * 2; a.z += (a.tz - a.z) * dt * 2;
        a.y = 0.4 + Math.sin((1.4 - a.fly) / 1.4 * Math.PI) * 3; a.heading = Math.atan2(a.tx - a.x, a.tz - a.z);
      } else {
        a.y = 0.2; a.timer -= dt;
        if (a.timer <= 0) { a.timer = rand(1, 4); a.tx = a.x + rand(-3, 3); a.tz = a.z + rand(-3, 3); a.peck = Math.random() < 0.5; }
        const vx = a.tx - a.x, vz = a.tz - a.z, dd = Math.hypot(vx, vz);
        if (dd > 0.2) { a.x += vx / dd * 0.9 * dt; a.z += vz / dd * 0.9 * dt; a.heading = Math.atan2(vx, vz); }
        a.mesh.rotation.x = a.peck ? Math.sin(t * 10 + a.x) * 0.4 : 0;
      }
      a.mesh.position.set(a.x, a.y, a.z); a.mesh.rotation.y = a.heading;
    } else if (a.kind === 'deer') {
      const f = world.forest; if (!f) return;
      if (a.state === 'away') {
        a.timer -= dt;
        if (a.timer <= 0) { const s = pick(f.spots); a.x = s[0]; a.z = s[1]; a.tx = a.x; a.tz = a.z; a.state = 'graze'; a.timer = rand(40, 90); a.airborne = false; a.mesh.visible = true; }
        return;
      }
      if (d2 < 49 && a.state !== 'flee') { a.state = 'flee'; a.timer = 4; a.tx = Math.max(f.x0 + 2, Math.min(f.x1 - 2, a.x + dx * 4 + rand(-6, 6))); a.tz = Math.max(f.z0 + 2, Math.min(f.z1 - 2, a.z + dz * 4 + rand(-6, 6))); }
      a.timer -= dt;
      if (a.state === 'flee') { if (a.timer <= 0) { a.state = 'away'; a.timer = rand(30, 90); a.airborne = true; a.mesh.visible = false; return; } }
      else if (a.timer <= 0) { a.state = 'graze'; a.timer = rand(40, 90); }
      else if (Math.random() < dt * 0.15) { const s = pick(f.spots); a.tx = s[0]; a.tz = s[1]; a.state = 'walk'; }
      const vx = a.tx - a.x, vz = a.tz - a.z, dd = Math.hypot(vx, vz), sp = a.state === 'flee' ? 7 : a.state === 'walk' ? 1.2 : 0;
      if (dd > 0.4 && sp) { a.x += vx / dd * sp * dt; a.z += vz / dd * sp * dt; a.heading = Math.atan2(vx, vz); } else if (a.state === 'walk') a.state = 'graze';
      a.mesh.position.set(a.x, 0.02, a.z); a.mesh.rotation.y = a.heading;
      a.mesh.rotation.x = a.state === 'graze' ? Math.sin(t * 0.8 + a.seed) * 0.08 : 0;
    } else if (a.kind === 'pelican') {
      const [wl, wr] = a.mesh.userData.wings;
      const setWings = (ang) => { wl.rotation.z = -ang; wr.rotation.z = ang; };
      if (a.state === 'perch') {
        a.airborne = false; a.timer -= dt; setWings(-1.35); a.y = 0.2;
        if (d2 < 25 && !player.inBuilding) a.timer = Math.min(a.timer, 0);
        if (a.timer <= 0) { a.state = 'soar'; a.airborne = true; a.lift = 0; a.goal = null; }
      } else {
        a.airborne = true; a.lift = Math.min(1, (a.lift || 0) + dt * 0.4);
        if (!a.goal || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 4) {
          if (a.landing) { a.state = 'perch'; a.landing = false; a.timer = rand(25, 70); a.airborne = false; return; }
          if (Math.random() < 0.22) { const n = pick(nodes); a.goal = { x: n.x, z: n.z }; a.landing = true; }
          else a.goal = { x: rand(-130, 130), z: rand(-130, 120) };
        }
        const vx = a.goal.x - a.x, vz = a.goal.z - a.z, dd = Math.hypot(vx, vz) || 1;
        const sp = a.landing && dd < 25 ? 3 : 7;
        a.x += vx / dd * sp * dt; a.z += vz / dd * sp * dt;
        const th = Math.atan2(vx, vz); a.heading += angDiff(a.heading, th) * Math.min(1, dt * 1.5);
        const cruise = 14 + Math.sin(t * 0.3 + a.seed) * 3;
        const target = a.landing ? Math.min(cruise, 0.2 + dd * 0.45) : cruise;
        a.y += (Math.max(0.2, target) - a.y) * Math.min(1, dt * 1.2);
        const glide = Math.sin(t * 0.7 + a.seed) > 0.4;
        setWings(glide ? 0.12 : Math.sin(t * 5 + a.seed) * 0.6);
      }
      a.mesh.position.set(a.x, a.y, a.z); a.mesh.rotation.y = a.heading;
    } else if (a.kind === 'raccoon') {
      a.timer -= dt;
      if (a.state === 'rummage') { a.mesh.position.x = a.x + Math.sin(t * 25) * 0.04; if (a.timer <= 0) { a.state = 'idle'; a.timer = rand(2, 6); const s = pick(world.trashSpots); a.home = s; a.tx = s.x; a.tz = s.z; } }
      else {
        if (!a.tx) { a.tx = a.x; a.tz = a.z; }
        const vx = a.tx - a.x, vz = a.tz - a.z, dd = Math.hypot(vx, vz);
        if (dd > 0.4) { a.x += vx / dd * 1.6 * dt; a.z += vz / dd * 1.6 * dt; a.heading = Math.atan2(vx, vz); a.mesh.position.y = 0.2 + Math.abs(Math.sin(t * 12)) * 0.05; }
        else if (a.timer <= 0) { a.state = 'rummage'; a.timer = rand(4, 10); a.sfx = true; }
      }
      if (d2 < 16) { const s = pick(world.trashSpots); a.tx = s.x; a.tz = s.z; }
      a.mesh.position.set(a.x, a.y, a.z); a.mesh.rotation.y = a.heading;
    } else if (a.kind === 'dog') {
      a.timer -= dt; const dp = world.dogPark;
      if (a.timer <= 0) { a.timer = rand(1, 3); a.tx = rand(dp.x0, dp.x1); a.tz = rand(dp.z0, dp.z1); }
      const vx = a.tx - a.x, vz = a.tz - a.z, dd = Math.hypot(vx, vz);
      if (dd > 0.4) { a.x += vx / dd * 3 * dt; a.z += vz / dd * 3 * dt; a.heading = Math.atan2(vx, vz); }
      a.mesh.position.set(a.x, 0.3 + Math.abs(Math.sin(t * 14 + a.x)) * (dd > 0.4 ? 0.12 : 0), a.z); a.mesh.rotation.y = a.heading;
    }
  }

  const groundY = (w, x, z) => (x >= w.parkBounds.x0 && x <= w.parkBounds.x1 && z >= w.parkBounds.z0 && z <= w.parkBounds.z0 + 22 ? 3.2 : 0.2);

  // Re-seat an NPC on the sidewalk graph at (x, z) after it was carried somewhere (robot taxi, scooter pickup).
  function relocate(e, x, z) {
    let best = 0, bd = Infinity;
    nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
    e.x = x; e.z = z; e.node = best; e.prev = null; e.target = null; e.goDoor = false; e.parkGoal = null;
    pickTarget(e);
  }

  return { list, animals, specials, dealers, update, nodes, relocate };
}

export function nearestOf(entities, x, z, r) {
  let best = null, bd = r * r;
  for (const e of entities) {
    if (e.state === 'inside' || (e.mesh && !e.mesh.visible)) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
export { GREETS };
