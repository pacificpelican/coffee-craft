// Hoops phone app: a fast simulated "livestream" (about 15 s) with one-tap prediction markets.
// Basketball runs from noon to 10 pm; the rest of the day it is netball. The game is scripted up front and played back
// against the clock, so re-opening the app (or the phone re-rendering) simply rejoins the same game.
import { h, money, pick, rand, clamp } from './util.js';
import { sfx } from './audio.js';

const TEAMS = ['Airplanes', 'Harbor Herons', 'Cedar Kings', 'Rain City Ravens', 'Tide Foxes', 'Granite Owls'];
const TEAM_COLORS = ['#8fd3ff', '#5fae7a', '#d9a441', '#6b5b8a', '#e8892b', '#9aa0a6'];
const STAKE = 50, DURATION = 15000, TICKS = 60;
let session = null;

const isBasketball = (minutes) => { const hr = Math.floor(minutes / 60) % 24; return hr >= 12 && hr < 22; };
const odds = (p) => Math.round(clamp(0.93 / p, 1.2, 4) * 100) / 100;
const profitOf = (m) => Math.round(STAKE * (m.odds - 1));

function makeGame(state) {
  const sport = isBasketball(state.minutes) ? 'basketball' : 'netball';
  const bball = sport === 'basketball';
  const oppIdx = 1 + Math.floor(Math.random() * (TEAMS.length - 1)), opp = TEAMS[oppIdx];
  const base = bball ? 0.5 : 0.78;
  const sa = base + rand(-0.06, 0.06), sb = base + rand(-0.06, 0.06);
  const pWinA = clamp(0.5 + ((sa - sb) / base) * 1.6, 0.25, 0.75);
  let ev = [];
  for (let i = 0; i < TICKS; i++) {
    const t = ((i + rand(0.1, 0.9)) / TICKS) * DURATION;
    if (Math.random() < sa) ev.push({ t, team: 'a', pts: bball ? pick([2, 2, 2, 3]) : 1, seed: Math.random() });
    if (Math.random() < sb) ev.push({ t: t + 90, team: 'b', pts: bball ? pick([2, 2, 2, 3]) : 1, seed: Math.random() });
  }
  const sum = (k) => ev.filter((e) => e.team === k).reduce((n, e) => n + e.pts, 0);
  if (sum('a') === sum('b')) ev.push({ t: DURATION - 250, team: Math.random() < 0.5 ? 'a' : 'b', pts: bball ? 2 : 1, seed: Math.random() });
  ev.sort((x, y) => x.t - y.t);
  const a = sum('a'), b = sum('b'), total = a + b;
  const line = Math.round(TICKS * (sa + sb) * (bball ? 2.25 : 1)) - 0.5, gap = bball ? 10 : 6;
  return {
    sport, opp, oppIdx, ev, a, b,
    markets: [
      { id: 'win', label: 'Airplanes win', odds: odds(pWinA), won: a > b },
      { id: 'opp', label: `${opp} win`, odds: odds(1 - pWinA), won: b > a },
      { id: 'over', label: `Total points over ${line}`, odds: 1.9, won: total > line },
      { id: 'blow', label: `Either team wins by ${gap}+`, odds: 3.2, won: Math.abs(a - b) >= gap },
    ],
  };
}

function startGame(G) {
  if (session?.timer) clearTimeout(session.timer);
  session = { game: makeGame(G.state), t0: Date.now(), bets: {}, settled: false, net: 0 };
  const mine = session;
  session.timer = setTimeout(() => settle(G, mine), DURATION + 300);
}

function settle(G, s) {
  if (s.settled) return;
  s.settled = true;
  const taken = s.game.markets.filter((m) => s.bets[m.id]);
  s.net = taken.reduce((n, m) => n + (m.won ? profitOf(m) : -STAKE), 0);
  G.state.bank.cash += s.net;
  if (taken.length) { G.notify(`🏀 Final: Airplanes ${s.game.a}–${s.game.b} ${s.game.opp}. Your positions: ${s.net >= 0 ? '+' : '−'}${money(Math.abs(s.net))}.`, { sound: false, ms: 6000 }); sfx(s.net >= 0 ? 'coin' : 'click'); }
}

const elapsedOf = (s) => (s.settled ? DURATION : Math.min(DURATION, Date.now() - s.t0));

function courtSVG(g) {
  const bb = g.sport === 'basketball', line = '#f2e7c8';
  const floor = bb ? '#c98a4b' : '#4f86a8';
  const marks = bb
    ? `<line x1="100" y1="6" x2="100" y2="104" stroke="${line}" stroke-width="1"/><circle cx="100" cy="55" r="12" fill="none" stroke="${line}" stroke-width="1"/>
       <rect x="6" y="38" width="30" height="34" fill="none" stroke="${line}" stroke-width="1"/><rect x="164" y="38" width="30" height="34" fill="none" stroke="${line}" stroke-width="1"/>
       <path d="M6 16 H22 A44 44 0 0 1 22 94 H6" fill="none" stroke="${line}" stroke-width="1"/><path d="M194 16 H178 A44 44 0 0 0 178 94 H194" fill="none" stroke="${line}" stroke-width="1"/>`
    : `<line x1="67" y1="6" x2="67" y2="104" stroke="${line}" stroke-width="1"/><line x1="133" y1="6" x2="133" y2="104" stroke="${line}" stroke-width="1"/><circle cx="100" cy="55" r="4" fill="none" stroke="${line}" stroke-width="1"/>
       <path d="M6 25 A30 30 0 0 1 6 85" fill="none" stroke="${line}" stroke-width="1"/><path d="M194 25 A30 30 0 0 0 194 85" fill="none" stroke="${line}" stroke-width="1"/>`;
  const board = (x) => (bb ? `<rect x="${x}" y="46" width="2" height="18" fill="#f4efe0"/>` : `<rect x="${x}" y="40" width="1.5" height="30" fill="#f4efe0"/>`);
  const ring = (x, id) => `<circle id="${id}" cx="${x}" cy="55" r="3.4" fill="none" stroke="#e8602b" stroke-width="1.6"/>`;
  const dots = (team, color) => [0, 1, 2, 3, 4].map((i) => `<circle data-p="${team}${i}" r="4.2" fill="${color}" stroke="#1d2a33" stroke-width="1"/>`).join('');
  return `<svg viewBox="0 0 200 110" style="width:100%;display:block;border-radius:10px;background:#15181a">
    <rect x="2" y="2" width="196" height="106" rx="6" fill="${floor}"/>
    <rect x="6" y="6" width="188" height="98" fill="none" stroke="${line}" stroke-width="1.2"/>
    ${marks}${board(2)}${board(196)}${ring(8, 'hoopL')}${ring(192, 'hoopR')}
    ${dots('b', TEAM_COLORS[g.oppIdx])}${dots('a', TEAM_COLORS[0])}
    <circle id="ball" r="2.8" fill="${bb ? '#e8892b' : '#f4efe0'}" stroke="#1d2a33" stroke-width=".8"/>
    <text id="pop" x="100" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff" stroke="#1d2a33" stroke-width=".6" opacity="0"></text>
    <circle cx="12" cy="12" r="3" fill="#e0443a"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle>
    <text x="19" y="15.5" font-size="8" font-weight="bold" fill="#fff">LIVE</text>
  </svg>`;
}

export function mountHoops(el, G) {
  if (!session || (session.settled && Date.now() - session.t0 > 60000)) startGame(G);
  const s = session, g = s.game, bb = g.sport === 'basketball';
  const box = h('div', { class: 'hoops' });
  const scoreA = h('div', { style: 'font-size:30px;font-weight:bold;line-height:1' }, '0'), scoreB = h('div', { style: 'font-size:30px;font-weight:bold;line-height:1' }, '0');
  const clock = h('div', { style: 'font-size:12px;opacity:.85' }, '');
  const board = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;background:#15181a;color:#f4efe0;-webkit-text-fill-color:#f4efe0;border-radius:10px;padding:8px 12px;margin-top:6px;text-align:center' },
    h('div', {}, h('div', { style: 'font-size:11px;letter-spacing:.05em;color:#8fd3ff;-webkit-text-fill-color:#8fd3ff' }, 'AIRPLANES'), scoreA), clock,
    h('div', {}, h('div', { style: `font-size:11px;letter-spacing:.05em;color:${TEAM_COLORS[g.oppIdx]};-webkit-text-fill-color:${TEAM_COLORS[g.oppIdx]}` }, g.opp.toUpperCase()), scoreB));
  const court = h('div', { html: courtSVG(g) });
  const markets = h('div', { style: 'margin-top:8px' });
  box.append(h('div', { class: 'small', style: 'margin-bottom:4px' }, bb ? '🏀 Pacific Hoops League · Airplanes home' : '🥅 Late-Night Netball League · Airplanes home (no hoops on at this hour…)'), court, board, markets);
  el.append(box);

  const ev = g.ev, $p = (k) => court.querySelector(`[data-p="${k}"]`), ball = court.querySelector('#ball'), pop = court.querySelector('#pop');
  const hoops = { a: court.querySelector('#hoopR'), b: court.querySelector('#hoopL') };
  const home = [[52, 30], [60, 80], [95, 55], [110, 28], [128, 82]];
  let shift = 0, sig = '';

  function place(m) {
    if (s.settled || s.bets[m.id]) return;
    const pending = Object.keys(s.bets).length * STAKE;
    if (G.state.bank.cash - pending < STAKE) return G.notify('Not enough funds.', { sound: false, ms: 2000 });
    s.bets[m.id] = true; sfx('click'); drawMarkets();
  }
  function drawMarkets() {
    const rows = g.markets.map((m) => {
      const taken = s.bets[m.id];
      const text = s.settled && taken ? (m.won ? `✅ ${m.label} — won +${money(profitOf(m))}` : `❌ ${m.label} — lost −${money(STAKE)}`)
        : taken ? `✓ ${m.label} — taken (pays +${money(profitOf(m))})` : `${m.label} — pays +${money(profitOf(m))}`;
      return h('button', { class: 'btn' + (taken || s.settled ? '' : ' alt'), style: 'display:block;width:100%;margin:4px 0;text-align:left', disabled: !!taken || s.settled, onclick: () => place(m) }, text);
    });
    markets.replaceChildren(
      h('div', { class: 'small' }, s.settled ? 'Final whistle. Positions settled.' : `Prediction markets · one tap = ${money(STAKE)} position, settled at the final whistle`),
      ...rows,
      s.settled ? h('div', {}, Object.keys(s.bets).length ? h('p', {}, `Net result: ${s.net >= 0 ? '+' : '−'}${money(Math.abs(s.net))}. Bank: ${money(G.state.bank.cash)}`) : h('p', { class: 'small' }, 'No positions taken this game.'),
        h('button', { class: 'btn', onclick: () => { startGame(G); el.replaceChildren(); mountHoops(el, G); } }, '▶ Next game')) : '');
  }

  function frame() {
    if (!box.isConnected) return;
    const e = elapsedOf(s);
    let a = 0, b = 0, last = null, next = null;
    for (const x of ev) { if (x.t <= e) { x.team === 'a' ? (a += x.pts) : (b += x.pts); last = x; } else if (!next) next = x; }
    scoreA.textContent = a; scoreB.textContent = b;
    const qLen = DURATION / 4, q = Math.min(4, Math.floor(e / qLen) + 1);
    if (s.settled || e >= DURATION) clock.textContent = 'FINAL';
    else { const left = (1 - (e - (q - 1) * qLen) / qLen) * (bb ? 12 : 15) * 60; clock.textContent = `Q${q} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; }
    const poss = (next || last || { team: 'a' }).team;
    shift += ((poss === 'a' ? 18 : -18) - shift) * 0.06;
    for (let i = 0; i < 5; i++) for (const team of ['a', 'b']) {
      const [hx, hy] = home[i], flip = team === 'a' ? 1 : -1, k = i + (team === 'a' ? 0 : 7);
      const x = clamp((team === 'a' ? hx : 200 - hx) + shift + Math.sin(e / 520 + k) * 9, 12, 188), y = clamp(hy + Math.cos(e / 640 + k * 1.3) * 10 * flip, 12, 98);
      $p(team + i).setAttribute('cx', x.toFixed(1)); $p(team + i).setAttribute('cy', y.toFixed(1));
    }
    const dt = last ? e - last.t : 9999;
    if (last && dt < 450) {
      const p = dt / 450, hx = last.team === 'a' ? 192 : 8, dir = last.team === 'a' ? -1 : 1, sx = hx + dir * (last.pts === 3 ? 62 : 38), sy = 55 + (last.seed - 0.5) * 36;
      ball.setAttribute('cx', (sx + (hx - sx) * p).toFixed(1)); ball.setAttribute('cy', (sy + (55 - sy) * p - Math.sin(Math.PI * p) * 22).toFixed(1));
    } else {
      const t = next ? next.team : poss, i = Math.floor(e / 650) % 5, bp = $p(t + i);
      ball.setAttribute('cx', (Number(bp.getAttribute('cx')) + 3).toFixed(1)); ball.setAttribute('cy', (Number(bp.getAttribute('cy')) + 3 + Math.abs(Math.sin(e / 110)) * 3).toFixed(1));
    }
    for (const k of ['a', 'b']) hoops[k].setAttribute('stroke', last && last.team === k && dt < 700 ? '#fff36a' : '#e8602b');
    if (last && dt < 900) { pop.textContent = `${last.team === 'a' ? 'AIRPLANES' : g.opp.toUpperCase()} +${last.pts}`; pop.setAttribute('opacity', String(1 - dt / 900)); } else pop.setAttribute('opacity', '0');
    const now = `${s.settled}|${Object.keys(s.bets).length}`;
    if (now !== sig) { sig = now; drawMarkets(); }
    requestAnimationFrame(frame);
  }
  drawMarkets(); requestAnimationFrame(frame);
}
