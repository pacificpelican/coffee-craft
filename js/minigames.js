// Mini-games rendered into the modal card: pickleball, coffee roaster, espresso machine, fight.
import { h, rand, pick, clamp } from './util.js';

export function playPickleball(card, g, done) {
  const W = 360, H = 480;
  const cv = h('canvas', { width: W, height: H, style: 'width:100%;max-width:360px;background:#4f7a96;border:3px solid #23291f;border-radius:8px;touch-action:none' });
  const chat = h('div', { class: 'small', style: 'min-height:2.6em' }, 'Rae (opponent): “Ready when you are. Kitchen rules!”');
  const score = h('b', {}, '0 – 0');
  card.append(h('h3', {}, '🏓 Pickleball vs Rae'), score, cv, chat, h('p', { class: 'small' }, 'Drag / arrow keys to move your paddle. First to 5.'),
    h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: end }, 'Leave court')));
  const ctx = cv.getContext('2d');
  let me = W / 2, ai = W / 2, ball = { x: W / 2, y: H / 2, vx: 2, vy: -3 }, s = [0, 0], run = true, last = performance.now(), keys = {};
  const kd = (e) => { keys[e.key] = true; }, ku = (e) => { keys[e.key] = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); me = ((e.clientX - r.left) / r.width) * W; });
  const lines = { win: ['Nice shot!', 'Ooh, that one got me.'], lose: ['Dink! Too soft?', 'Gotcha. Rain makes the ball heavy.'] };
  async function say(kind) {
    let t = pick(lines[kind]);
    if (g.server.ai) { const r = await g.aiText('You are Rae, a friendly, slightly smug pickleball player in a rainy city park. One short trash-talk or praise sentence.', [{ role: 'user', content: kind === 'win' ? 'The player just scored on you.' : 'You just scored on the player.' }]); if (r) t = r.slice(0, 160); }
    chat.textContent = 'Rae: “' + t + '”';
  }
  function serve(dir) { ball = { x: W / 2, y: H / 2, vx: rand(-2, 2), vy: 3.2 * dir }; }
  function loop(now) {
    if (!run) return;
    if (!cv.isConnected || cv.offsetParent === null) { run = false; removeEventListener('keydown', kd); removeEventListener('keyup', ku); return; }
    const dt = Math.min(2, (now - last) / 16.7); last = now;
    if (keys.ArrowLeft || keys.a) me -= 5 * dt; if (keys.ArrowRight || keys.d) me += 5 * dt; me = clamp(me, 30, W - 30);
    ai += clamp(ball.x - ai, -2.6 * dt, 2.6 * dt);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < 6 || ball.x > W - 6) ball.vx *= -1;
    if (ball.vy > 0 && ball.y > H - 40 && ball.y < H - 24 && Math.abs(ball.x - me) < 34) { ball.vy = -Math.abs(ball.vy) * 1.06; ball.vx += (ball.x - me) * 0.08; g.sfx('click'); }
    if (ball.vy < 0 && ball.y < 40 && ball.y > 24 && Math.abs(ball.x - ai) < 34) { ball.vy = Math.abs(ball.vy) * 1.03; ball.vx += (ball.x - ai) * 0.08; g.sfx('click'); }
    if (ball.y > H) { s[1]++; say('lose'); serve(-1); } else if (ball.y < 0) { s[0]++; say('win'); serve(1); }
    score.textContent = `${s[0]} – ${s[1]}`;
    if (s[0] >= 5 || s[1] >= 5) { g.notify(s[0] >= 5 ? '🏆 You beat Rae at pickleball!' : 'Rae wins this time.'); if (s[0] >= 5) g.state.points += 10; return end(); }
    ctx.fillStyle = '#4f7a96'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#efe6cc'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.beginPath(); ctx.moveTo(10, H / 2); ctx.lineTo(W - 10, H / 2); ctx.moveTo(10, H / 2 - 70); ctx.lineTo(W - 10, H / 2 - 70); ctx.moveTo(10, H / 2 + 70); ctx.lineTo(W - 10, H / 2 + 70); ctx.stroke();
    ctx.fillStyle = '#e3b93c'; ctx.fillRect(me - 30, H - 36, 60, 10); ctx.fillStyle = '#d9772b'; ctx.fillRect(ai - 30, 26, 60, 10);
    ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, 7); ctx.fillStyle = '#e8f26a'; ctx.fill();
    requestAnimationFrame(loop);
  }
  function end() { run = false; removeEventListener('keydown', kd); removeEventListener('keyup', ku); done(); }
  requestAnimationFrame(loop);
}

export function playRoaster(card, g, done) {
  const beans = g.DATA.beans; let bean = beans[0].id, temp = 50, time = 50, blend = 30;
  const out = h('div', { class: 'bizcard' }, 'Choose settings, then roast and sample.');
  const slider = (label, get, set) => h('div', { class: 'kv' }, h('span', {}, label), h('input', { type: 'range', min: 0, max: 100, value: get(), oninput: (e) => set(Number(e.target.value)) }));
  const drum = h('div', { style: 'font-size:44px;text-align:center' }, '🔥');
  card.append(h('h3', {}, 'Coffee Roaster'), drum,
    h('div', { class: 'kv' }, h('span', {}, 'Bean'), h('select', { onchange: (e) => { bean = e.target.value; } }, ...beans.map((b) => h('option', { value: b.id }, `${b.name} — ${b.note}`)))),
    slider('Temperature', () => temp, (v) => { temp = v; }), slider('Time', () => time, (v) => { time = v; }), slider('Robusta blend %', () => blend, (v) => { blend = v; }), out,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: roast }, '🔥 Roast & sample'), h('button', { class: 'btn warn', onclick: done }, 'Leave')));
  function roast() {
    g.sfx('roast'); drum.style.animation = 'none'; drum.textContent = '🌀';
    setTimeout(() => {
      drum.textContent = '☕'; const heat = (temp + time) / 2;
      const body = heat < 35 ? 'bright and tea-like' : heat < 65 ? 'balanced and caramel-forward' : 'smoky and bittersweet';
      const b = beans.find((x) => x.id === bean); const name = `${heat < 35 ? 'Foggy' : heat < 65 ? 'Mossy' : 'Midnight'} ${b.name.split(' ')[0]}${blend > 50 ? ' Robusta Rush' : ''}`;
      g.state.roastTries++; const u = g.unlockRoast();
      const rec = { name, bean: b.id, beanName: b.name, note: b.note, body, heat: Math.round(heat), blend, day: g.state.day, tagline: '' };
      (g.state.roastLog ||= []).push(rec); if (g.state.roastLog.length > 60) g.state.roastLog.shift();
      if (g.aiJson) g.aiJson('You design coffee bag labels for a rainy Pacific Northwest roastery. Keep it playful and family friendly.', `Roast "${name}": ${body}, notes of ${b.note}. Return {"bg":"#rrggbb","accent":"#rrggbb","motif":one of ${g.BAG_MOTIFS.join('|')},"tagline":"max 30 chars"}`).then((d) => { if (d && typeof d === 'object') rec.design = { bg: d.bg, accent: d.accent, motif: d.motif, tagline: d.tagline }; });
      out.textContent = `“${name}”: ${body}, notes of ${b.note}. ${u ? 'Unlocked: ' + u.name + '! Choose it in Settings → Business.' : 'Experiments so far: ' + g.state.roastTries + '.'} Saved to Phone → Settings → Roasts.`;
      g.state.points += 3; g.sfx('sip');
    }, 1400);
  }
}

export function playEspresso(card, g, done) {
  const fill = h('div', { style: 'height:0;background:#4a2f1c;width:100%;transition:height 2s linear;position:absolute;bottom:0' });
  const cup = h('div', { style: 'position:relative;width:70px;height:60px;border:3px solid #23291f;border-radius:0 0 30px 30px;margin:10px auto;overflow:hidden;background:#fff' }, fill);
  const msg = h('p', {}, 'Press a button.');
  const pull = (n) => () => { g.sfx('espresso'); fill.style.transition = 'none'; fill.style.height = '0'; requestAnimationFrame(() => { fill.style.transition = `height ${n}s linear`; fill.style.height = n === 1 ? '45%' : '90%'; }); msg.textContent = n === 1 ? 'A tight little ristretto.' : 'A long, fragrant double.'; };
  card.append(h('h3', {}, 'Espresso Machine'), cup, msg, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: pull(1) }, 'Single'), h('button', { class: 'btn', onclick: pull(2) }, 'Double'), h('button', { class: 'btn warn', onclick: done }, 'Leave')));
}

const FOE_MOVES = { high: '🦵 a high kick', low: '🌀 a low sweep', rush: '🤼 a charging grab' };
const COUNTER = { high: 'block', low: 'hop', rush: 'strike' };

// Telegraphed fight: read the opponent's stance and pick the counter. Higher `level` foes feint more often.
// opts: { foe, hp, spar (friendly: no police or reputation fallout), level, skill (player belt 0-4), title, onEnd(won) }
export function playFight(card, g, done, opts = {}) {
  const { foe: foeName = 'Rowdy', spar = false, level = 0, skill = 0 } = opts;
  const maxHp = opts.hp || 8;
  let me = maxHp, foe = maxHp, over = false, intent = 'high', shown = 'high';
  const pips = (n) => '❤'.repeat(Math.max(0, n)) + '♡'.repeat(maxHp - Math.max(0, n));
  const bars = h('div', { style: 'font-size:18px;letter-spacing:2px;text-align:center' });
  const stage = h('div', { style: 'font-size:42px;text-align:center;min-height:54px' }, '🥋 ⚔️ 🥷');
  const msg = h('p', { style: 'min-height:3.2em' });
  const row = h('div', { class: 'row' });
  const draw = () => { bars.replaceChildren(h('div', {}, `You ${pips(me)}`), h('div', {}, `${foeName} ${pips(foe)}`)); };
  const next = () => {
    intent = pick(['high', 'low', 'rush']);
    const feint = Math.random() < 0.06 + level * 0.07;
    shown = feint ? pick(['high', 'low', 'rush'].filter((m) => m !== intent)) : intent;
    msg.textContent = `${foeName} sets up ${FOE_MOVES[shown]}…`;
    draw();
  };
  const finish = (won) => {
    over = true; g.sfx(won ? 'bell' : 'hit');
    if (spar) msg.textContent = won ? `${foeName} bows. “Good. Again sometime.”` : `You tap out. ${foeName} smiles: “Again. Breathe.”`;
    else if (won) { g.state.rep = clamp(g.state.rep + 2, 0, 100); msg.textContent = `${foeName} slinks off. The neighbors noticed.`; }
    else { g.state.rep = clamp(g.state.rep - 2, 0, 100); g.state.scrutiny += 5; msg.textContent = 'You get shoved out. Police arrive.'; g.sfx('siren'); }
    stage.textContent = won ? '🥋 🏆' : '🥋 💫';
    opts.onEnd?.(won);
    row.replaceChildren(h('button', { class: 'btn', onclick: done }, 'Continue'));
  };
  const act = (c) => {
    if (over) return;
    const ok = COUNTER[intent] === c;
    const feinted = shown !== intent;
    if (ok) {
      foe -= 2 + (skill >= 2 ? 1 : 0); g.sfx('punch');
      msg.textContent = feinted ? 'It was a feint, and you read it. Clean counter!' : 'You read it perfectly. Clean counter!';
    } else {
      me -= 1; g.sfx('hit');
      msg.textContent = feinted ? `A feint! It was really ${FOE_MOVES[intent]}. You take a hit.` : `Wrong answer to ${FOE_MOVES[intent]}. You take a hit.`;
    }
    draw();
    if (foe <= 0) return finish(true);
    if (me <= 0) return finish(false);
    setTimeout(() => { if (!over) next(); }, 900);
  };
  row.append(h('button', { class: 'btn', onclick: () => act('block') }, '🛡 Block'), h('button', { class: 'btn alt', onclick: () => act('hop') }, '⤴ Hop'), h('button', { class: 'btn warn', onclick: () => act('strike') }, '👊 Strike'));
  card.append(h('h3', {}, opts.title || 'Scuffle'), stage, bars, msg, row, h('p', { class: 'small' }, 'Block beats a high kick, hop beats a low sweep, strike beats a grab.'));
  next();
}
