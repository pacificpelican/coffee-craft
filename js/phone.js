// Smartphone UI: home screen, Settings (tabs), Menus, IRL Coffee, News, Chat, Music, App Downloader.
import { h, money, esc, fmtClock } from './util.js';
import { DATA } from './data.js';
import { server, account, aiText, aiJson } from './api.js';
import * as eco from './economy.js';
import { LOGO_SVG, foodSVG, svgURI, bagSVG } from './art.js';
import { getChannel, setChannel, sfx } from './audio.js';
import { playPickleball } from './minigames.js';

const APPS = [
  ['settings', '⚙️', 'Settings'], ['menus', '🍜', 'Menus'], ['irl', '☕', 'IRL Coffee'], ['news', '📰', 'News'],
  ['chat', '💬', 'Chat'], ['music', '🎵', 'Music'], ['pickle', '🏓', 'Pickleball'], ['ask', '🤖', 'Ask AI'], ['store', '⬇️', 'App Downloader'],
];
const TABS = ['Account', 'Stats', 'Diary', 'Bank', 'Business', 'Roasts', 'TOWS', 'Controls', 'Debug', 'Credits', 'Terms', 'Privacy'];

export function createPhone(G) {
  const root = document.getElementById('phone');
  let app = null, tab = 'Account', bankTab = 'Overview', chatWith = null, irl = null, tows = null, towsBusy = false;
  const S = () => G.state;

  function open(a, sub) {
    app = a || null; if (sub) { tab = sub.tab || tab; bankTab = sub.bankTab || bankTab; chatWith = sub.chat || chatWith; }
    root.classList.remove('hidden'); G.setPaused(true); render();
  }
  function close() { root.classList.add('hidden'); G.setPaused(false); }
  const isOpen = () => !root.classList.contains('hidden');
  function render() {
    const s = S();
    const screen = h('div', { class: 'screen' });
    if (!app) {
      screen.append(h('h3', { class: 'ph-title' }, h('span', { class: 'ph-logo', html: LOGO_SVG }), 'Phone'), h('div', { class: 'apps' }, ...APPS.map(([id, ic, nm]) => h('div', { class: 'app', onclick: () => { app = id; render(); } }, h('span', {}, ic), nm))));
    } else {
      screen.append(h('button', { class: 'btn alt', onclick: () => { app = null; render(); } }, '← Home'));
      ({ settings, menus, irl: irlApp, news, chat, music, pickle, ask, store })[app](screen);
    }
    root.replaceChildren(
      h('div', { class: 'bar' }, h('span', {}, `Day ${s.day} · ${fmtClock(s.minutes)}`), h('span', {}, s.weather || 'cloudy'), h('button', { class: 'ph-x', title: 'Close phone', 'aria-label': 'Close phone', onclick: close }, '✕ Close')),
      screen,
      h('button', { class: 'home', title: 'Close phone', onclick: close }),
    );
  }

  function pickle(el) {
    const card = h('div', { class: 'pickle-app' });
    el.append(card);
    playPickleball(card, { state: S(), notify: G.notify, sfx, aiText, server }, () => { app = null; render(); });
  }

  // ------------------------------------------------------------ Ask AI
  const askLog = []; let askBusy = false;
  const SPIN_CAPTIONS = ['Warming up the neural espresso machine…', 'Calibrating the grind of the language model…', 'Searching for a signal in the rain…', 'Tamping down some tokens…', 'Waiting for the AI to wake up…', 'Looking for an AI API to chat with…'];
  function spinner(small) {
    const wrap = h('div', { class: 'orb-wrap' + (small ? ' small' : '') },
      h('div', { class: 'orb' },
        h('div', { class: 'ring r1' }), h('div', { class: 'ring r2' }), h('div', { class: 'ring r3' }),
        h('div', { class: 'orbit o1' }, h('i', {})), h('div', { class: 'orbit o2' }, h('i', {})), h('div', { class: 'orbit o3' }, h('i', {})),
        h('div', { class: 'core' }, '☕')));
    if (!small) {
      const cap = h('div', { class: 'orb-cap small' }, SPIN_CAPTIONS[0]); wrap.append(cap);
      let i = 0; const tm = setInterval(() => { if (!cap.isConnected) return clearInterval(tm); cap.textContent = SPIN_CAPTIONS[++i % SPIN_CAPTIONS.length]; }, 2400);
    }
    return wrap;
  }
  function ask(el) {
    el.append(h('h3', {}, '🤖 Ask AI'));
    if (!server.ai) {
      el.append(spinner(false), h('p', { class: 'small', style: 'text-align:center' }, 'No AI API is connected. Enable one in config.php (Ollama or a cloud provider) and this app will answer general questions.'));
      return;
    }
    el.append(h('p', { class: 'small' }, `Ask a general question. Answers come from ${server.aiProvider}${server.aiModel ? ' · ' + server.aiModel : ''} and can be wrong.`));
    const box = h('div');
    for (const m of askLog) box.append(h('div', { class: 'say' + (m.me ? ' me' : '') }, h('b', {}, m.me ? 'You: ' : 'AI: '), m.text, m.me ? '' : h('span', { class: 'small', style: 'margin-left:6px;opacity:.7' }, '✨AI')));
    if (askBusy) box.append(spinner(true));
    const inp = h('input', { placeholder: 'Ask anything…', style: 'width:68%' });
    const send = async () => {
      const q = inp.value.trim(); if (!q || askBusy) return;
      askLog.push({ me: true, text: q }); askBusy = true; render();
      const history = askLog.slice(-8).map((m) => ({ role: m.me ? 'user' : 'assistant', content: m.text }));
      const r = await aiText('You are a helpful general-purpose assistant built into a phone in a cozy coffee game. Answer clearly and concisely (a few sentences). Do not claim to be a person.', history);
      askBusy = false;
      askLog.push({ me: false, text: r ? r.trim().slice(0, 1500) : '⚠ The AI did not answer. Is the AI service running?' });
      if (app === 'ask' && isOpen()) render();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); e.stopPropagation(); });
    el.append(box, inp, h('button', { class: 'btn', onclick: send }, 'Ask'), askLog.length ? h('button', { class: 'btn alt', onclick: () => { askLog.length = 0; render(); } }, 'Clear') : '');
    if (!askBusy) setTimeout(() => inp.focus(), 0);
  }

  // ------------------------------------------------------------ Settings
  function settings(el) {
    el.append(h('div', { class: 'tabs' }, ...TABS.map((t) => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; render(); } }, t + (t === 'Bank' && S().bank.decisions.length ? ` (${S().bank.decisions.length})` : '')))));
    const body = h('div'); el.append(body);
    ({ Account: tAccount, Stats: tStats, Diary: tDiary, Bank: tBank, Business: tBusiness, TOWS: tTows, Debug: tDebug, Controls: tControls, Roasts: tRoasts, Credits: tCredits, Terms: tTerms, Privacy: tPrivacy })[tab](body);
  }
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('b', {}, String(v)));

  function tAccount(el) {
    const u = server.user;
    if (!server.available) el.append(h('p', { class: 'small' }, 'Server (PHP) not detected: accounts need api.php. Your game is saved in this browser instead.'));
    if (u) {
      el.append(h('p', {}, 'Logged in as ', h('b', {}, u)), h('button', { class: 'btn', onclick: async () => { await account.logout(); render(); } }, 'Log out'),
        h('button', { class: 'btn', onclick: async () => { try { await account.saveGame(G.snapshot()); G.notify('Saved to server.'); } catch (e) { G.notify('Save failed: ' + e.message); } } }, 'Save to server'),
        h('button', { class: 'btn', onclick: async () => { try { const sv = await account.loadSave(); if (!sv) return G.notify('No server save found yet.'); if (confirm('Replace your current game with the server save?')) { G.restore(sv); render(); } } catch (e) { G.notify('Load failed: ' + e.message); } } }, 'Load from server'),
        h('p', { class: 'small' }, 'While logged in, your game is also saved to the server automatically every game day and every 45 seconds.'));
      const pw = h('input', { type: 'password', placeholder: 'password to confirm' });
      el.append(h('hr'), h('p', {}, '⚠ Deleting your account permanently erases it and all saved game data.'), pw,
        h('button', { class: 'btn warn', onclick: async () => { if (!confirm('Really delete your account and all data? This cannot be undone.')) return; try { await account.remove(pw.value); localStorage.removeItem('coffeecraft.save'); G.notify('Account deleted.'); render(); } catch (e) { alert(e.message); } } }, 'Delete account & data'));
    } else if (server.available) {
      const n = h('input', { placeholder: 'name', autocomplete: 'username' }), p = h('input', { type: 'password', placeholder: 'password', autocomplete: 'current-password' });
      const go = (fn) => async () => { try { await fn(n.value, p.value); if (fn === account.login) { const sv = await account.loadSave(); if (sv && confirm('Load your saved game from the server?')) G.restore(sv); } G.notify('Welcome, ' + server.user); render(); } catch (e) { alert(e.message); } };
      el.append(h('p', {}, 'Create an account or log in to keep your game on the server.'), n, p, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: go(account.login) }, 'Log in'),
        server.registration ? h('button', { class: 'btn alt', onclick: go(account.register) }, 'Create account') : h('span', { class: 'small' }, 'Registration disabled.')));
    }
  }

  function tStats(el) {
    const s = S(), own = eco.ownedBusinesses(s);
    el.append(kv('Day', s.day), kv('Time', fmtClock(s.minutes)), kv('Weather', s.weather), kv('Bank cash', money(s.bank.cash)), kv('Community reputation', Math.round(s.rep)), kv('Police scrutiny', Math.round(s.scrutiny)), kv('Points', Math.round(s.points)), kv('Donut shops unlocked', eco.donutUnlocked(s) ? 'yes' : `at ${eco.DONUT_UNLOCK_POINTS} pts`), kv('Unique foods tried', s.diary.length), kv('Roasts unlocked', s.roastsUnlocked.length), kv('Martial arts belt', ['White', 'Yellow', 'Green', 'Brown', 'Black'][Math.min(4, Math.floor((s.dojo?.wins || 0) / 2))]), kv('Town mood', s.townMood || '—'));
    el.append(h('h4', {}, 'Your businesses'));
    for (const b of own) el.append(h('details', {}, h('summary', {}, `${b.name} (${b.type})`), kv('Visitors (total/today)', `${b.totalVisitors} / ${b.dayVisitors}`), kv('Revenue (total/today)', `${money(b.totalRevenue)} / ${money(b.dayRevenue)}`), kv('Reputation', Math.round(b.reputation)), kv('Buzz', Math.round(b.buzz)), kv('Property', money(b.propertyValue)), kv('Inventory', money(b.inventoryValue)), kv('Savings', money(b.savings)), kv('Debt', money(b.debt))));
    if (eco.needsBailout(s)) el.append(h('hr'), h('p', {}, 'Funds are low.'), h('button', { class: 'btn warn', onclick: () => bailoutUI() }, '🆘 Bailout'));
  }
  function bailoutUI() {
    const max = eco.bailoutMax(S());
    const v = prompt(`Request a government loan (up to ${money(max)}). You never have to pay it back.`, String(Math.round(max / 4)));
    if (v == null) return; const amt = eco.bailout(S(), Number(v) || 0); G.notify(`Government loan of ${money(amt)} received.`); render();
  }

  function tDiary(el) {
    const d = S().diary;
    if (!d.length) return el.append(h('p', {}, 'Nothing here yet. Order something at a café, restaurant or pub!'));
    const g = h('div', { class: 'diary' });
    for (const f of d) g.append(h('div', { class: 'bizcard' }, h('img', { src: svgURI(foodSVG(f.kind)), alt: f.name }), h('b', {}, f.name), h('div', { class: 'small' }, f.where + ' · day ' + f.day)));
    el.append(g, h('button', { class: 'btn alt', title: 'Print or save your food diary as PDF', onclick: () => G.printSheet('food_diary', `Food diary — ${d.length} item${d.length === 1 ? '' : 's'} tried`, [h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px' }, ...d.map((f) => h('div', { style: 'text-align:center;break-inside:avoid' }, h('img', { src: svgURI(foodSVG(f.kind)), alt: f.name, style: 'width:100%;max-width:150px' }), h('div', {}, h('b', {}, f.name)), h('div', { style: 'font-size:12px' }, `${f.where} · day ${f.day}`))))]) }, '🖨 Print / PDF'));
      }

      // ------------------------------------------------------------ Bank
      function tBank(el) {
    const s = S();
    el.append(h('div', { class: 'tabs' }, ...['Overview', 'Decisions', 'Suppliers'].map((t) => h('button', { class: t === bankTab ? 'on' : '', onclick: () => { bankTab = t; render(); } }, t + (t === 'Decisions' ? ` (${s.bank.decisions.length})` : '')))));
    const auto = h('input', { type: 'checkbox', checked: s.bank.auto, onchange: (e) => { s.bank.auto = e.target.checked; if (s.bank.auto) G.autoPending(); G.notify(s.bank.auto ? 'Bank automation ON' : 'Manual banking'); render(); } });
    if (bankTab === 'Overview') {
      el.append(h('label', {}, auto, ' Automate banking (uses AI when available)'), kv('Cash', money(s.bank.cash)), kv('Loans out', money(s.bank.loans?.reduce?.((a, l) => a + (l.amount || 0), 0) || s.bank.lent || 0)), kv('Interest earned', money(s.bank.interestEarned || 0)));
      el.append(h('h4', {}, 'Real-time business holdings'));
      for (const b of Object.values(s.businesses).filter((x) => x.owner === 'player' || x.lender === 'player')) {
        el.append(h('div', { class: 'bizcard' }, h('h4', {}, b.name, ' ', h('span', { class: 'tag' + (b.state !== 'open' ? ' bad' : '') }, b.owner === 'player' ? 'owned' : 'lent')), kv('Status', b.state), kv('Debt', money(b.debt)), kv('Today', money(b.dayRevenue)), kv('Savings', money(b.savings))));
      }
      el.append(h('h4', {}, 'Recent bank log'), ...(s.bank.log || []).slice(-6).reverse().map((l) => h('div', { class: 'small' }, typeof l === 'string' ? l : JSON.stringify(l))));
      if (eco.needsBailout(s)) el.append(h('button', { class: 'btn warn', onclick: bailoutUI }, '🆘 Bailout'));
    } else if (bankTab === 'Decisions') {
      if (s.bank.auto) el.append(h('p', { class: 'small' }, 'Automation is on; decisions are made for you.'));
      if (!s.bank.decisions.length) el.append(h('p', {}, 'No decisions waiting.'));
      for (const d of s.bank.decisions) {
        const yes = d.type === 'loan' ? ['approve', 'Approve'] : ['buy', 'Buy out'], no = d.type === 'loan' ? ['deny', 'Decline'] : ['liquidate', 'Liquidate'];
        el.append(h('div', { class: 'bizcard' }, h('p', {}, d.text), h('div', { class: 'row' }, ...[yes, no].map(([c, l]) => h('button', { class: 'btn' + (c === 'approve' || c === 'buy' ? ' alt' : ''), onclick: () => { eco.decideManually(s, d.id, c); sfx('coin'); render(); } }, l)))));
      }
    } else {
      suppliers(el);
    }
  }
  function suppliers(el) {
    const s = S(), S_ = DATA.suppliers, own = eco.ownedBusinesses(s);
    const sel = (b, key, list) => h('div', { class: 'kv' }, h('span', {}, key), h('select', { onchange: (e) => { b.supply[key] = e.target.value; if (key === 'payment' && e.target.value !== 'cash') b.gambling = false; render(); } }, ...list.map((o) => h('option', { value: o.id, selected: b.supply[key] === o.id }, o.name))));
    for (const [title, type, keys] of [['☕ Coffee', 'coffee', ['beans', 'cups']], ['🍜 Restaurants & donut shops', 'restaurant', ['ingredients', 'packaging']]]) {
      el.append(h('h4', {}, title));
      for (const b of own.filter((x) => (type === 'coffee' ? x.type === 'coffee' : x.type !== 'coffee'))) {
        el.append(h('div', { class: 'bizcard' }, h('b', {}, b.name), ...keys.map((k) => sel(b, k, S_[type][k])), sel(b, 'payment', S_.payment),
          b.supply.payment === 'cash' ? h('label', {}, h('input', { type: 'checkbox', checked: b.gambling, onchange: (e) => { b.gambling = e.target.checked; if (b.gambling) { s.scrutiny += 5; G.notify('A back-room gambling den: more cash, more cop attention.'); } } }), ' Gambling den (risky!)') : h('div', { class: 'small' }, 'Cash-only unlocks a gambling den option.')));
      }
      if (!own.some((x) => (type === 'coffee' ? x.type === 'coffee' : x.type !== 'coffee'))) el.append(h('p', { class: 'small' }, 'None owned yet.'));
    }
  }

  // ------------------------------------------------------------ Business
  function tBusiness(el) {
    const s = S(), own = eco.ownedBusinesses(s);
    for (const b of own) {
      const pb = eco.propertyBreakdown(b);
      const card = h('div', { class: 'bizcard' }, h('h4', {}, b.name), h('div', { class: 'small' }, `${b.type}${b.style ? ' · ' + b.style : ''}`));
      card.append(h('div', { class: 'kv' }, h('span', {}, 'Pricing'), h('select', { onchange: (e) => { b.tier = Number(e.target.value); } }, ...eco.PRICE_TIERS.map((t) => h('option', { value: t.id, selected: b.tier === t.id }, t.name)))));
      const hr = (i) => h('select', { onchange: (e) => { b.hours[i] = Number(e.target.value); } }, ...Array.from({ length: i ? 25 : 24 }, (_, k) => h('option', { value: k, selected: b.hours[i] === k }, k + ':00')));
      card.append(h('div', { class: 'kv' }, h('span', {}, 'Hours'), h('span', {}, hr(0), ' – ', hr(1))));
      if (b.type === 'coffee') card.append(h('div', { class: 'kv' }, h('span', {}, 'Roast'), h('select', { onchange: (e) => { b.roast = e.target.value; const r = DATA.roastStyles.find((x) => x.id === e.target.value); b.boost = (r?.buzz || 0); } }, ...DATA.roastStyles.filter((r) => S().roastsUnlocked.includes(r.id)).map((r) => h('option', { value: r.id, selected: b.roast === r.id }, r.name)))));
      card.append(h('div', { class: 'small' }, `Property ${money(b.propertyValue)} — location ${money(pb.location)}, condition ${money(pb.condition)}, assets ${money(pb.assets)}`));
      card.append(h('div', { class: 'row' }, ...DATA.enhancements.map((e) => {
        const done = b.enhancements.includes(e.id), cost = Math.round(b.propertyValue * e.cost);
        return h('button', { class: 'btn' + (done ? '' : ' alt'), disabled: done, onclick: () => { if (eco.enhance(s, b, e.id)) { sfx('coin'); render(); } else G.notify('Not enough funds.'); } }, done ? `✓ ${e.name}` : `${e.name} ${money(cost)}`);
      })));
      el.append(card);
    }
    el.append(h('h4', {}, 'Hire a problem customer (under the bridge)'), h('p', { class: 'small' }, 'Pick a rival. $2,500; risks reputation and police attention.'));
    const rivals = Object.values(s.businesses).filter((b) => b.owner !== 'player' && b.state === 'open' && ['coffee', 'restaurant', 'donut'].includes(b.type));
    const sel = h('select', {}, ...rivals.map((b) => h('option', { value: b.id }, b.name)));
    el.append(sel, h('button', { class: 'btn warn', onclick: () => { const caught = eco.hireTroublemaker(s, s.businesses[sel.value]); G.notify(caught ? 'Someone talked. Cops are asking questions.' : 'It got done. Quietly.'); render(); } }, 'Hire'));
    if (G.nearDealer?.()) { /* dealers are handled in-world */ }
  }

  // ------------------------------------------------------------ TOWS
  function localTows() {
    const s = S(), own = eco.ownedBusinesses(s);
    const avgQ = own.reduce((a, b) => a + eco.effectiveQuality(b), 0) / Math.max(1, own.length);
    return {
      threats: [s.scrutiny > 30 ? 'Police scrutiny is elevated.' : 'Rival cafés keep an eye on your price tier.', Object.values(s.businesses).some((b) => b.state === 'bankrupt') ? 'Bankruptcies are souring the neighborhood mood.' : 'Rainy weeks cut foot traffic.'],
      opportunities: [eco.donutUnlocked(s) ? 'Donut shops are available to buy.' : `Earn ${eco.DONUT_UNLOCK_POINTS} points to unlock donut shops.`, 'Distressed NPC businesses can be bought out by your bank.'],
      weaknesses: [avgQ < 65 ? 'Average quality is middling; upgrade suppliers.' : 'Premium suppliers eat into margins.', own.some((b) => b.debt > 0) ? 'Some of your shops carry debt.' : 'No expansion beyond two shops yet.'],
      strengths: [`Bank cash ${money(s.bank.cash)}.`, `Community reputation ${Math.round(s.rep)}.`, s.roastsUnlocked.length > 3 ? 'A growing roast menu from the Lab.' : 'A comfortable base to experiment.'],
    };
  }
  function tTows(el) {
    el.append(h('p', { class: 'small' }, server.ai ? `AI analysis via ${server.aiProvider}.` : 'AI is not configured; showing a simple built-in analysis.'));
    const data = tows || localTows();
    for (const [k, c] of [['Threats', 'threats'], ['Opportunities', 'opportunities'], ['Weaknesses', 'weaknesses'], ['Strengths', 'strengths']]) {
      el.append(h('div', { class: 'bizcard' }, h('h4', {}, k), h('ul', {}, ...(data[c] || []).map((x) => h('li', {}, String(x))))));
    }
    el.append(h('button', { class: 'btn', disabled: towsBusy, onclick: async () => {
      if (!server.ai) { tows = null; return render(); }
      towsBusy = true; render(); const s = S();
      const sum = eco.ownedBusinesses(s).map((b) => `${b.name}: q${Math.round(eco.effectiveQuality(b))}, buzz${Math.round(b.buzz)}, debt ${Math.round(b.debt)}, tier ${b.tier}`).join('; ');
      const j = await aiJson('You are a friendly business coach for a café-owner game. Output {"threats":[..],"opportunities":[..],"weaknesses":[..],"strengths":[..]} with 2-3 short strings each.', `Day ${s.day}. Cash ${Math.round(s.bank.cash)}. Rep ${Math.round(s.rep)}. Scrutiny ${Math.round(s.scrutiny)}. ${sum}`);
      if (j && j.threats) tows = j; towsBusy = false; render();
    } }, towsBusy ? 'Thinking…' : '↻ Refresh analysis'));
  }

  function tDebug(el) {
    el.append(kv('Storage', server.storage), kv('PHP server', server.available ? 'yes' : 'no (static)'), kv('AI chat enabled', server.ai ? 'yes' : 'no'), kv('AI provider', server.aiProvider || 'none'), kv('AI model', server.aiModel || '—'), kv('Logged in', server.user || 'no'), kv('Businesses', Object.keys(S().businesses).length), kv('Mods loaded', (DATA.modsLoaded || []).join(', ') || 'none'), kv('Version', '0.1'));
        if (server.ai) {
          const out = h('p', { class: 'small' });
          el.append(h('button', { class: 'btn', onclick: async () => { out.textContent = 'Asking the AI…'; const t = await G.aiText('Reply in five words or fewer.', [{ role: 'user', content: 'Say hello to a coffee shop customer.' }]); out.textContent = t ? '✨ AI works: “' + t + '”' : '⚠ AI is enabled but did not answer. Is Ollama running and the model pulled? Set debug => true in config.local.php for details in the server log.'; } }, 'Test AI'), out);
        }
      }
  function tRoasts(el) {
    const s = S(), log = s.roastLog || [];
    el.append(h('h3', {}, '🔥 Roasts'), h('p', { class: 'small' }, 'Styles unlocked by experimenting at the Roast Lab, and every batch you have roasted. Bag labels are AI-designed when AI is on.'));
    el.append(h('b', {}, 'Styles'), ...DATA.roastStyles.map((r) => h('div', { class: 'kv' }, h('span', {}, r.name), h('span', { class: 'small' }, s.roastsUnlocked.includes(r.id) ? 'unlocked' : `locked · ${r.need} experiments`))));
    el.append(h('hr'), h('b', {}, `Batches (${log.length})`));
    if (!log.length) return el.append(h('p', { class: 'small' }, 'Nothing roasted yet. Use the roaster at the Roast Lab.'));
    el.append(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:6px' }, ...log.slice().reverse().map((r) => h('div', { class: 'bizcard', style: 'text-align:center' },
      h('img', { src: svgURI(bagSVG(r)), alt: r.name, style: 'width:100%;max-width:120px' }), h('b', {}, r.name), h('div', { class: 'small' }, `${r.beanName} · day ${r.day}`), h('div', { class: 'small' }, `${r.body}${r.blend > 50 ? ' · robusta-heavy' : ''}`)))));
  }

  function tControls(el) {
    const rows = [
      ['Move', 'Arrow keys / WASD / on-screen pad'],
      ['Run', 'Hold 👍 (. key or the on-screen button) while moving'],
  ['Bus', '▶️ next to a bus (it pauses for you) to board; ▶️ again to request a stop'],
      ['💬 Talk', '/ (or the 💬 button) to a nearby neighbor or animal'],
      ['👍 Interact / yes', '. (period)'],
      ['⛔ No / cancel', ', (comma)'],
      ['▶️ Friendly / enter / sit / ride', "' (apostrophe): enter doors, sit on benches, ride scooters, board the streetcar"],
      ['Rotate camera', 'Q / E, hold left or right mouse and drag, or two-finger twist'],
      ['Zoom camera', 'Mouse wheel or two-finger pinch'],
      ['Pause', 'P'],
      ['Phone', 'Tab or the 📱 button'],
      ['Mini-games', 'Pickleball: mouse/touch drag or ←/→. Dojo sparring: tap Block, Hop or Strike.'],
    ];
    el.append(h('h3', {}, '🎮 Controls'), ...rows.map(([k, v]) => h('div', { class: 'kv' }, h('span', {}, k), h('span', { class: 'small' }, v))));
  }

  function tCredits(el) {
    el.append(h('div', { style: 'text-align:center' }, h('div', { html: LOGO_SVG, style: 'width:100px;margin:auto' }), h('h3', {}, 'Coffee Craft'),
      h('p', { html: 'created by <a href="https://altaredwood.work" target="_blank" rel="noopener">Daniel McKeown</a>' }), h('p', { class: 'small' }, 'Alta Redwood Pictures. Library text: Kusamakura by Natsume Sōseki (1906).')));
  }
  function tTerms(el) {
    el.append(h('p', { class: 'small' }, 'Last updated: October 31, 2026'), h('p', {}, 'Coffee Craft is a hobby game provided as is, with no warranty. It can run locally on your own machine or be deployed to a web server by whoever hosts it; the host is responsible for their deployment.'), h('p', {}, 'In-game businesses, people and events are fictional. Do not use AI-generated text as advice. Weed, alcohol and gambling appear only as fictional game content for adults.'), h('p', {}, 'Do not abuse the server or AI endpoints. The host may remove accounts at any time.'));
  }
  function tPrivacy(el) {
    el.append(h('p', { class: 'small' }, 'Last updated: October 31, 2026'), h('p', {}, 'Without an account, your game is saved only in your browser (localStorage). With an account, your name, a salted password hash and your game save are stored by the server host (JSON files or MySQL/MariaDB as configured).'), h('p', {}, 'If AI is enabled, text you type in conversations and a summary of game state are sent to the configured AI provider (a local Ollama instance or a cloud service chosen by the host). Do not type personal information.'), h('p', {}, 'You can delete your account and data from Settings → Account at any time. No analytics or ads are included.'));
  }

  // ------------------------------------------------------------ Other apps
  function menus(el) {
    el.append(h('h3', {}, 'Nearby menus'));
    for (const b of Object.values(S().businesses).filter((x) => ['coffee', 'restaurant', 'donut', 'pub'].includes(x.type) && x.state === 'open')) {
      const items = G.menuFor(b); if (!items.length) continue;
      el.append(h('div', { class: 'bizcard' }, h('h4', {}, b.name), ...items.map((i) => h('div', { class: 'kv' }, h('span', {}, i[0]), h('span', {}, money(G.price(b, i[1])))))));
    }
  }
  async function irlApp(el) {
    el.append(h('h3', {}, '☕ IRL Coffee'), h('p', { class: 'small' }, 'Find a real coffee shop to visit or order from.'));
    const city = h('input', { placeholder: 'your city or neighborhood', value: localStorage.getItem('coffeecraft.city') || '' });
    const out = h('div', {});
    el.append(city, h('button', { class: 'btn', onclick: async () => {
      localStorage.setItem('coffeecraft.city', city.value);
      out.textContent = 'Looking…';
      if (!server.ai) { out.innerHTML = '<p>AI is off, so no live suggestions. Try searching maps for “independent coffee roaster near me” — or your local roastery’s website.</p>'; return; }
      const j = await aiJson('You recommend real, well-regarded, preferably independent coffee shops. Output {"name":"","where":"","why":""}. Only suggest places you are fairly sure exist and say so if unsure.', `Near: ${city.value || 'Seattle, WA'}`);
      out.replaceChildren(j ? h('div', { class: 'bizcard' }, h('h4', {}, j.name), h('div', {}, j.where), h('p', {}, j.why), h('a', { href: 'https://www.google.com/maps/search/' + encodeURIComponent(j.name + ' ' + (j.where || city.value)), target: '_blank', rel: 'noopener' }, 'Open in maps'), h('p', { class: 'small' }, 'AI suggestions may be wrong; check hours first.')) : h('p', {}, 'No suggestion this time.'));
    } }, 'Find one'), out);
  }
  function news(el) {
    el.append(h('h3', {}, '📰 Neighborhood News'));
    const list = S().news.slice(-30).reverse();
    if (!list.length) el.append(h('p', {}, 'Quiet so far.'));
    for (const n of list) el.append(h('div', { class: 'bizcard' }, h('div', { class: 'small' }, 'Day ' + n.day), h('div', {}, n.text)));
  }
  function chat(el) {
    const s = S(), prefs = (s.chatPrefs ||= {});
    const setPref = (c, v) => { if (v) prefs[c] = v; else delete prefs[c]; render(); };
    const muteBtn = (c) => prefs[c] === 'blocked' ? null : h('button', { class: 'btn alt', title: 'Mute: messages still arrive, but no notifications', onclick: (e) => { e.stopPropagation(); setPref(c, prefs[c] === 'muted' ? null : 'muted'); } }, prefs[c] === 'muted' ? '🔔 Unmute' : '🔕 Mute');
    const blockBtn = (c) => h('button', { class: 'btn warn', title: 'Block: no new messages at all', onclick: (e) => { e.stopPropagation(); setPref(c, prefs[c] === 'blocked' ? null : 'blocked'); } }, prefs[c] === 'blocked' ? '✅ Unblock' : '🚫 Block');
    if (chatWith && s.contacts.includes(chatWith)) {
      const msgs = s.chats[chatWith] || [], blocked = prefs[chatWith] === 'blocked';
      el.append(h('h3', {}, chatWith, prefs[chatWith] ? h('span', { class: 'small' }, prefs[chatWith] === 'muted' ? ' · muted' : ' · blocked') : ''), h('div', { class: 'row' }, muteBtn(chatWith), blockBtn(chatWith)), ...msgs.map((m) => h('div', { class: 'say' + (m.me ? ' me' : '') }, m.text, m.ai ? h('span', { class: 'small', title: 'Written by the AI', style: 'margin-left:6px;opacity:.7' }, '✨AI') : '')));
      el.append(h('button', { class: 'btn alt', title: 'Print or save this conversation as PDF', onclick: () => G.printSheet('chat', `Text conversation with ${chatWith}`, msgs.map((m) => h('p', {}, h('b', {}, (m.me ? 'You' : chatWith) + ': '), m.text + (m.ai ? ' [AI]' : '')))) }, '🖨 Print / PDF'));
      if (blocked) return el.append(h('p', { class: 'small' }, 'Blocked: unblock to message again.'), h('button', { class: 'btn alt', onclick: () => { chatWith = null; render(); } }, 'Contacts'));
      const inp = h('input', { placeholder: 'message…', style: 'width:70%' });
      el.append(inp, h('button', { class: 'btn', onclick: async () => {
        if (!inp.value.trim()) return; (s.chats[chatWith] ||= []).push({ me: true, text: inp.value });
        const t = inp.value; inp.value = ''; render();
        const reply = await G.npcReply(chatWith, t); (s.chats[chatWith] ||= []).push(G.lastAi ? { text: reply, ai: true } : { text: reply }); render();
      } }, 'Send'), h('button', { class: 'btn alt', onclick: () => { chatWith = null; render(); } }, 'Contacts'));
      return;
    }
    el.append(h('h3', {}, '💬 Chat'));
    if (!s.contacts.length) el.append(h('p', {}, 'No contacts yet. After a good conversation someone might offer to swap numbers.'));
    for (const c of s.contacts) el.append(h('div', { class: 'bizcard', style: 'margin:6px 0;cursor:pointer', onclick: () => { chatWith = c; render(); } }, h('b', {}, c, prefs[c] === 'muted' ? ' 🔕' : prefs[c] === 'blocked' ? ' 🚫' : ''), ' ', h('span', { class: 'small' }, (s.chats[c] || []).slice(-1)[0]?.text?.slice(0, 40) || ''), h('div', { class: 'row' }, muteBtn(c), blockBtn(c))));
  }
  function music(el) {
    const cur = getChannel();
    el.append(h('h3', {}, '🎵 Radio Fog'), ...[['ambient', 'Ambient / Trance'], ['classical', 'Classical Strings'], ['noise', 'White Noise'], ['off', 'Muted']].map(([id, nm]) => h('div', { class: 'app', style: 'margin:6px 0;' + (cur === id ? 'background:#e3b93c' : ''), onclick: () => { setChannel(id); S().musicChannel = id; render(); } }, nm)));
  }
  function store(el) {
    el.append(h('h3', {}, '⬇ App Downloader'), h('p', { class: 'small' }, 'Installed apps. More arrive in later versions.'), ...APPS.map(([id, ic, nm]) => h('div', { class: 'kv' }, h('span', {}, ic + ' ' + nm), h('span', { class: 'tag' }, 'installed'))));
  }

  return { open, close, isOpen, render };
}
