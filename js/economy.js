// Economy + banking simulation. Pure logic (no rendering) so it can be tested/moded easily.
import { rand, randInt, pick, clamp } from './util.js';
import { DATA } from './data.js';
import { aiJson, server } from './api.js';

export const PRICE_TIERS = [{ id: 0, name: 'Low', mult: 0.8 }, { id: 1, name: 'Medium', mult: 1 }, { id: 2, name: 'High', mult: 1.25 }, { id: 3, name: 'Premium', mult: 1.6 }];
const TICKET = { coffee: 6, restaurant: 15, donut: 5, pub: 14, convenience: 7, drug: 12, electronics: 60, weed: 30, pets: 20, hotel: 140 };
const PROPERTY = { coffee: 380000, restaurant: 520000, donut: 330000, pub: 600000, convenience: 450000, drug: 500000, electronics: 700000, weed: 420000, pets: 380000, hotel: 3200000 };
export const BUSINESS_TYPES = Object.keys(TICKET);
export const OPERABLE = ['coffee', 'restaurant'];
export const DONUT_UNLOCK_POINTS = 1500;

const DEFAULT_HOURS = { coffee: [6, 18], restaurant: [11, 22], donut: [6, 20], pub: [16, 27], convenience: [0, 24], drug: [8, 21], electronics: [10, 19], weed: [10, 22], pets: [10, 18], hotel: [0, 24] };
const CATEGORY_CURVE = { // weights by hour 0..23
  coffee: [.05, .02, .02, .02, .05, .3, 1, 1.2, 1.1, .8, .6, .5, .5, .5, .5, .5, .4, .3, .2, .15, .1, .08, .05, .05],
  restaurant: [.3, .15, .08, .05, .02, .02, .05, .1, .15, .2, .5, 1, 1.2, .8, .4, .4, .7, 1.1, 1.3, 1.1, .8, .6, .5, .4],
  donut: [.2, .1, .05, .05, .1, .3, .6, .7, .5, .4, .3, .3, .3, .3, .3, .3, .3, .3, .3, .3, .3, .35, .4, .3],
  pub: [.5, .3, .1, 0, 0, 0, 0, 0, 0, 0, 0, .1, .2, .2, .2, .3, .5, .8, 1, 1.2, 1.3, 1.2, 1, .8],
  convenience: [.2, .15, .1, .1, .1, .2, .4, .5, .5, .5, .5, .5, .6, .5, .5, .5, .6, .6, .5, .5, .4, .3, .3, .25],
  drug: [0, 0, 0, 0, 0, 0, 0, .1, .3, .4, .4, .4, .4, .4, .4, .4, .4, .3, .2, .1, .1, 0, 0, 0],
  electronics: [0, 0, 0, 0, 0, 0, 0, 0, 0, .1, .2, .2, .3, .3, .3, .3, .3, .2, .1, 0, 0, 0, 0, 0],
  weed: [0, 0, 0, 0, 0, 0, 0, 0, 0, .1, .2, .3, .3, .4, .4, .5, .6, .7, .8, .8, .7, .5, .2, 0],
  pets: [0, 0, 0, 0, 0, 0, 0, 0, 0, .1, .2, .2, .2, .3, .3, .3, .3, .2, .1, 0, 0, 0, 0, 0],
  hotel: [.1, .05, .05, .05, .05, .1, .2, .1, .1, .1, .1, .1, .2, .5, .6, .5, .4, .4, .3, .3, .2, .2, .2, .15],
};
const GENERIC_MENUS = {
  coffee: [['House Drip', 4, 'coffee', 'Honest coffee.'], ['Oat Latte', 6, 'latte', 'Smooth and mild.'], ['Butter Croissant', 4, 'pastry', 'Flaky.']],
  restaurant: [['Noodle Bowl', 13, 'ramen', 'Hearty.'], ['Dumplings', 8, 'dumpling', 'Steamed.'], ['Rice Platter', 14, 'platter', "Chef's choice."]],
  donut: [['Glazed Ring', 3, 'donut', 'Classic.'], ['Twisted Donut', 4, 'donut', 'Sugar-dusted.']],
};
const NEW_NAMES = ['Drizzle & Dough', 'Foggy Bottom Cafe', 'Third Rain Noodles', 'Moth Light Coffee', 'Kettle Street Kitchen', 'Little Heron Bakery', 'Ferry Lane Eats', 'Pine & Plum', 'Tin Roof Coffee', 'The Salty Fig'];

export const hoursOpen = (b, hour) => { const [o, c] = b.hours; if (c >= 24 && o === 0) return true; if (c <= 24) return hour >= o && hour < c; return hour >= o || hour < c - 24; };
export const isOpenNow = (b, minutes) => b.state === 'open' && hoursOpen(b, Math.floor(minutes / 60) % 24);

let emit = () => {};
export const onEvent = (fn) => { emit = fn; };

export function newBusiness(def) {
  const t = def.type;
  const prop = (PROPERTY[t] || 400000) * rand(0.8, 1.3);
  const quality = def.quality ?? randInt(50, 80);
  return {
    id: def.id, name: def.name, type: t, style: def.style || null, def: def.id,
    owner: def.owner === 'player' ? 'player' : 'npc', state: 'open',
    tier: def.tier ?? 1, hours: [...(def.hours || DEFAULT_HOURS[t] || [9, 18])],
    baseQuality: quality, quality, buzz: randInt(35, 65), reputation: randInt(45, 75),
    totalVisitors: 0, dayVisitors: 0, lastDayVisitors: 0, curVisitors: 0,
    totalRevenue: 0, dayRevenue: 0, lastDayRevenue: 0,
    propertyValue: Math.round(prop), inventoryValue: Math.round(prop * rand(0.02, 0.05)), savings: Math.round(prop * rand(0.05, 0.15)), debt: 0,
    lender: 'none', enhancements: [], supply: { beans: 'rainier', cups: 'paper', ingredients: 'pike', packaging: 'paperbox', payment: 'stripey' },
    roast: 'medium', gambling: false, vacantDays: 0, base: def.base || 30, boost: 0, notes: [],
  };
}

export function createEconomy(state) {
  state.businesses = {};
  for (const def of DATA.businesses) {
    if (!BUSINESS_TYPES.includes(def.type)) continue;
    state.businesses[def.id] = newBusiness(def);
  }
  const owned = Object.values(state.businesses).filter((b) => b.owner === 'player');
  const assets = owned.reduce((s, b) => s + b.propertyValue + b.inventoryValue, 0);
  state.bank = { cash: Math.round(assets * rand(10, 100)), auto: false, loans: [], decisions: [], log: [], gov: [], lent: 0, interestEarned: 0 };
  state.indie = { cash: Math.round(assets * rand(8, 30)), loans: [], log: [] };
  // A few NPC businesses start financially shaky so the banking game has something to chew on.
  const npc = Object.values(state.businesses).filter((b) => b.owner === 'npc' && b.type !== 'hotel');
  for (let i = 0; i < 3; i++) { const b = pick(npc); b.debt = Math.round((b.propertyValue + b.inventoryValue + b.savings) * rand(0.97, 1.15)); b.notes.push('Carrying heavy debt'); }
  for (const b of owned) { b.supply.beans = 'rainier'; }
  state.rep = 60; state.scrutiny = 0; state.points = 0; state.demand = {};
  return state;
}

export const ownedBusinesses = (state) => Object.values(state.businesses).filter((b) => b.owner === 'player');

// Advance the game clock; runs hourly sales and the daily rollover as boundaries are crossed.
export function advance(state, dMin) {
  const before = Math.floor(state.minutes / 60);
  state.minutes += dMin;
  const after = Math.floor(state.minutes / 60);
  for (let h = before + 1; h <= after; h++) {
    simHour(state, h % 24);
    if (h % 24 === 0) daily(state);
  }
}
export const totalAssets = (b) => b.propertyValue + b.inventoryValue + b.savings;
export const isBankrupt = (b) => b.state === 'open' && b.debt > b.savings + b.inventoryValue + b.propertyValue + b.lastDayRevenue && b.debt > 1000;
export const canOperate = (state, b) => OPERABLE.includes(b.type) || (b.type === 'donut' && state.points >= DONUT_UNLOCK_POINTS);
export const donutUnlocked = (state) => state.points >= DONUT_UNLOCK_POINTS;
export const avgShopValue = (state) => { const o = ownedBusinesses(state); return o.length ? o.reduce((s, b) => s + b.propertyValue, 0) / o.length : 400000; };

function supplyMods(b) {
  let cost = 1, q = 0, rep = 0;
  const S = DATA.suppliers;
  const lists = b.type === 'coffee' ? [[S.coffee.beans, b.supply.beans], [S.coffee.cups, b.supply.cups]] : [[S.restaurant.ingredients, b.supply.ingredients], [S.restaurant.packaging, b.supply.packaging]];
  for (const [list, id] of lists) { const s = list.find((x) => x.id === id); if (s) { cost *= s.cost; q += s.quality; rep += s.rep; } }
  const pay = S.payment.find((p) => p.id === b.supply.payment) || S.payment[0];
  return { cost, q, rep, fee: pay.fee, cashOnly: pay.id === 'cash' };
}

export function effectiveQuality(b) {
  const m = supplyMods(b);
  let q = b.baseQuality + m.q + (b.enhancements.includes('kitchen') ? 4 : 0) + (b.enhancements.includes('lighting') ? 2 : 0);
  if (b.type === 'coffee') { const st = DATA.roastStyles.find((r) => r.id === b.roast); if (st) q += st.buzz * 0.4; }
  return clamp(q, 0, 100);
}

function attractiveness(b, sens) {
  const q = effectiveQuality(b);
  const price = PRICE_TIERS[b.tier].mult;
  const score = q * 0.35 + b.buzz * 0.25 + b.reputation * 0.25 + b.boost - (price - 1) * 60 * sens + b.base * 0.1;
  return Math.exp(score / 14);
}

function simHour(state, hour) {
  const total = 40 * 24 * 0.5; // outings scale
  const bizs = Object.values(state.businesses).filter((b) => b.state === 'open');
  const dem = state.demand || {};
  for (const b of bizs) b.curVisitors = 0;
  for (const cat of Object.keys(CATEGORY_CURVE)) {
    const open = bizs.filter((b) => b.type === cat && hoursOpen(b, hour));
    if (!open.length) continue;
    const share = CATEGORY_CURVE[cat][hour] * (dem[cat] ?? 1);
    const outings = Math.round(share * (cat === 'hotel' ? 6 : 45) * rand(0.8, 1.2) * (state.weather === 'rain' ? 0.85 : 1));
    for (let n = 0; n < outings; n++) {
      const sens = rand(0.3, 1.4); // some townsfolk are very price sensitive
      const ws = open.map((b) => attractiveness(b, sens));
      let r = Math.random() * ws.reduce((a, c) => a + c, 0), chosen = open[0];
      for (let i = 0; i < open.length; i++) { r -= ws[i]; if (r <= 0) { chosen = open[i]; break; } }
      sale(state, chosen);
    }
  }
}

function sale(state, b) {
  const m = supplyMods(b);
  const ticket = (TICKET[b.type] || 8) * PRICE_TIERS[b.tier].mult * rand(0.8, 1.25);
  let rev = ticket;
  if (b.gambling && m.cashOnly) rev += ticket * rand(0.1, 0.5);
  b.totalVisitors++; b.dayVisitors++; b.curVisitors++;
  b.totalRevenue += rev; b.dayRevenue += rev;
  const cost = ticket * 0.35 * m.cost + rev * m.fee;
  b.savings += rev - cost;
  b.inventoryValue = Math.max(0, b.inventoryValue - ticket * 0.2);
  if (b.owner === 'player') state.points += 0.25;
}

function restock(b) {
  const target = b.propertyValue * 0.035;
  if (b.inventoryValue < target * 0.4) { const need = target - b.inventoryValue; b.inventoryValue += need; b.savings -= need; }
}

function daily(state) {
  state.day = (state.day || 1) + 1;
  for (const b of Object.values(state.businesses)) {
    if (b.state === 'vacant') { b.vacantDays++; if (b.vacantDays > 2 && Math.random() < 0.25) reopen(state, b); continue; }
    if (b.state !== 'open') continue;
    restock(b);
    const upkeep = b.propertyValue * 0.0004;
    b.savings -= upkeep;
    if (b.debt > 0) { const interest = b.debt * 0.004; if (b.savings > interest) b.savings -= interest; else b.debt += interest; if (b.lender === 'player') state.bank.cash += interest, state.bank.interestEarned += interest; }
    if (b.savings < 0) { b.debt += -b.savings; b.savings = 0; }
    b.lastDayRevenue = b.dayRevenue; b.lastDayVisitors = b.dayVisitors;
    b.dayRevenue = 0; b.dayVisitors = 0;
    b.buzz = clamp(b.buzz * 0.97 + (effectiveQuality(b) - 50) * 0.03 + rand(-2, 2) + (b.enhancements.includes('mural') ? 0.4 : 0), 5, 100);
    b.boost *= 0.6;
    const m = supplyMods(b);
    b.reputation = clamp(b.reputation + (effectiveQuality(b) - 60) * 0.01 + m.rep * 0.05 + (b.gambling ? -0.8 : 0) + rand(-0.4, 0.4), 0, 100);
    if (Math.random() < 0.04) shock(state, b);
    if (b.owner === 'player') playerDaily(state, b, m);
    else if (b.owner === 'npc' && b.savings < b.propertyValue * 0.01 && !b.pendingLoan && b.debt < b.propertyValue) requestLoan(state, b);
    if (b.owner === 'npc' && isBankrupt(b)) bankrupt(state, b);
  }
  state.bank.loans = state.bank.loans.filter((l) => l.open);
  state.scrutiny = Math.max(0, state.scrutiny - 1.5);
  state.rep = clamp(state.rep + (state.scrutiny > 25 ? -0.6 : 0.15), 0, 100);
  inspections(state);
  govLoans(state);
  refreshDemand(state);
  emit('day', { day: state.day });
}

function playerDaily(state, b, m) {
  const profit = b.savings - 10000; // sweep anything above a 10k float to the player's bank
  if (profit > 0) { state.bank.cash += profit; b.savings = 10000; b.swept = (b.swept || 0) + profit; }
  else if (b.savings < 5000) { const top = 5000 - b.savings; state.bank.cash -= top; b.savings += top; }
  if (b.debt > 0) { const pay = Math.min(b.debt, state.bank.cash); state.bank.cash -= pay; b.debt -= pay; }
  if (m.cashOnly && b.gambling) { state.scrutiny += 3; state.rep = clamp(state.rep - 0.4, 0, 100); }
  else if (m.cashOnly) state.scrutiny += 0.6;
}

function inspections(state) {
  const owned = ownedBusinesses(state);
  if (!owned.length) return;
  const chance = 0.03 + (100 - state.rep) * 0.004 + state.scrutiny * 0.004;
  if (Math.random() < chance) {
    const b = pick(owned.filter((x) => x.state === 'open')); if (!b) return;
    const kind = pick(['health board inspection', 'fire marshal visit']);
    const fine = randInt(300, 2500) * (state.rep < 35 ? 2 : 1);
    state.bank.cash -= fine; b.buzz = clamp(b.buzz - 3, 0, 100);
    emit('notify', { text: `${b.name}: ${kind}. Fine ${fine ? '$' + fine.toLocaleString() : ''}.`, kind: 'warn' });
  }
}

function govLoans(state) {
  for (const l of state.bank.gov) {
    if (!l.paid && state.day >= l.due) {
      l.paid = true;
      emit('notify', { text: 'Your government loan has been paid off by the government. No repayment needed.', kind: 'good' });
    }
  }
}

function shock(state, b) {
  const cost = Math.round(b.propertyValue * rand(0.03, 0.12));
  if (b.owner === 'player') { state.bank.cash -= cost; emit('notify', { text: `${b.name}: unexpected repair bill of $${cost.toLocaleString()}.`, kind: 'warn' }); }
  else { b.debt += cost; emit('news', { text: `${b.name} hit by a surprise $${cost.toLocaleString()} bill.`, bizId: b.id }); }
}

function refreshDemand(state) {
  state.demand = { coffee: rand(0.85, 1.2), restaurant: rand(0.85, 1.2), donut: rand(0.8, 1.25), pub: rand(0.8, 1.2), convenience: 1, drug: 1, electronics: 1, weed: rand(0.9, 1.2), pets: 1, hotel: 1 };
  state.townMood = null;
  if (server.ai) {
    const sum = Object.values(state.businesses).filter((b) => b.state === 'open').slice(0, 14).map((b) => `${b.name}(${b.type},q${Math.round(effectiveQuality(b))},buzz${Math.round(b.buzz)},tier${b.tier})`).join('; ');
    aiJson('You model the cravings of townsfolk in a rainy Pacific Northwest international district. Output {"coffee":n,"restaurant":n,"donut":n,"pub":n,"mood":"short phrase"} where n is a demand multiplier 0.7-1.4.',
      `Day ${state.day}, weather ${state.weather || 'cloudy'}. Businesses: ${sum}`).then((j) => {
      if (!j) return;
      for (const k of ['coffee', 'restaurant', 'donut', 'pub']) if (typeof j[k] === 'number') state.demand[k] = clamp(j[k], 0.7, 1.4);
      if (j.mood) state.townMood = String(j.mood).slice(0, 80);
    });
  }
}

// ------------------------------------------------------------------ banking
let decId = 1;
function requestLoan(state, b) {
  b.pendingLoan = true;
  const amount = Math.round(Math.min(b.propertyValue * 0.15, 80000));
  const lender = Math.random() < 0.5 ? 'player' : 'indie';
  const dec = { id: decId++ + '_' + state.day, type: 'loan', bizId: b.id, amount, lender, day: state.day };
  if (lender === 'player') queueDecision(state, dec); else decideIndie(state, dec);
}

function bankrupt(state, b) {
  b.state = 'bankrupt';
  emit('news', { text: `${b.name} files for bankruptcy.`, bizId: b.id, kind: 'bad' });
  // Whoever holds the loan decides; if nobody does, the player's bank gets first refusal most of the time.
  const lender = b.lender === 'player' ? 'player' : b.lender === 'indie' ? 'indie' : (Math.random() < 0.65 ? 'player' : 'indie');
  const dec = { id: decId++ + '_' + state.day, type: 'bankrupt', bizId: b.id, amount: b.debt, lender, day: state.day };
  if (dec.lender === 'player') queueDecision(state, dec); else decideIndie(state, dec);
}

function queueDecision(state, dec) {
  const b = state.businesses[dec.bizId];
  dec.text = dec.type === 'loan'
    ? `${b.name} requests a loan of $${dec.amount.toLocaleString()}. Quality ${Math.round(effectiveQuality(b))}, buzz ${Math.round(b.buzz)}, daily revenue $${Math.round(b.lastDayRevenue).toLocaleString()}.`
    : `${b.name} is bankrupt (debt $${Math.round(b.debt).toLocaleString()}). Buy it out and keep it running, or liquidate and leave a vacant lot?`;
  if (state.bank.auto) { autoDecide(state, dec); return; }
  state.bank.decisions.push(dec);
  emit('decision', dec);
}

export function heuristic(state, dec) {
  const b = state.businesses[dec.bizId];
  const q = effectiveQuality(b);
  if (dec.type === 'loan') return (q > 55 && b.buzz > 35 && b.debt < b.propertyValue * 0.5) ? 'approve' : 'deny';
  return (q > 62 && b.buzz > 40 && b.propertyValue > b.debt * 0.8) ? 'buy' : 'liquidate';
}

async function autoDecide(state, dec) {
  let choice = heuristic(state, dec);
  const b = state.businesses[dec.bizId];
  if (server.ai) {
    const j = await aiJson('You are the chief lending officer of a small bank. Decide based on the facts. Output {"decision":"' + (dec.type === 'loan' ? 'approve|deny' : 'buy|liquidate') + '","why":"one short sentence"}',
      `${dec.text} Type ${b.type}. Reputation ${Math.round(b.reputation)}. Debt ${Math.round(b.debt)}. Property ${b.propertyValue}. Bank cash ${Math.round(state.bank.cash)}.`);
    if (j && (j.decision === 'approve' || j.decision === 'deny' || j.decision === 'buy' || j.decision === 'liquidate')) {
      if ((dec.type === 'loan') === (j.decision === 'approve' || j.decision === 'deny')) choice = j.decision;
      dec.why = j.why;
    }
  }
  applyDecision(state, dec, choice, 'player', true);
}

async function decideIndie(state, dec) {
  const b = state.businesses[dec.bizId];
  let choice = heuristic(state, dec);
  if (server.ai) {
    const j = await aiJson('You run Cascade Independent Bank, a cautious local bank. Output {"decision":"' + (dec.type === 'loan' ? 'approve|deny' : 'buy|liquidate') + '"}',
      `Business ${b.name} (${b.type}) quality ${Math.round(effectiveQuality(b))}, buzz ${Math.round(b.buzz)}, debt ${Math.round(b.debt)}, property ${b.propertyValue}. Request: ${dec.type} ${dec.amount}.`);
    if (j && ['approve', 'deny', 'buy', 'liquidate'].includes(j.decision) && (dec.type === 'loan') === ['approve', 'deny'].includes(j.decision)) choice = j.decision;
  }
  applyDecision(state, dec, choice, 'indie', true);
}

// Apply a decision. who = 'player' | 'indie'
export function applyDecision(state, dec, choice, who, auto = false) {
  const b = state.businesses[dec.bizId];
  if (!b) return;
  const bank = who === 'player' ? state.bank : state.indie;
  state.bank.decisions = state.bank.decisions.filter((d) => d.id !== dec.id);
  b.pendingLoan = false;
  const tag = who === 'player' ? 'Your bank' : 'Cascade Independent';
  if (dec.type === 'loan') {
    if (choice === 'approve' && bank.cash > dec.amount) {
      bank.cash -= dec.amount; b.savings += dec.amount; b.debt += dec.amount; b.lender = who;
      emit('news', { text: `${tag} approves a $${dec.amount.toLocaleString()} loan to ${b.name}.`, bizId: b.id });
    } else emit('news', { text: `${tag} declines a loan to ${b.name}.`, bizId: b.id });
  } else if (b.state === 'bankrupt') {
    if (choice === 'buy') {
      const cost = Math.round(Math.max(0, b.debt - b.savings) * 0.6);
      bank.cash -= cost; b.debt = 0; b.savings = 12000; b.state = 'open'; b.lender = 'none';
      b.owner = who === 'player' ? 'player' : 'bank:indie';
      b.buzz = clamp(b.buzz - 10, 5, 100);
      emit('news', { text: `${tag} buys out bankrupt ${b.name} and keeps it open.`, bizId: b.id, kind: 'good' });
      if (who === 'player') emit('notify', { text: `You now own ${b.name}.`, kind: 'good' });
    } else {
      const rec = Math.round(Math.min(b.debt, (b.inventoryValue + b.propertyValue) * 0.6));
      bank.cash += rec; b.state = 'vacant'; b.debt = 0; b.savings = 0; b.owner = 'npc'; b.vacantDays = 0;
      emit('news', { text: `${b.name} is liquidated. Another vacant lot in the neighborhood.`, bizId: b.id, kind: 'bad' });
    }
  }
  emit('bizchange', { id: b.id });
  if (auto && who === 'player') emit('notify', { text: `Auto-bank: ${choice} - ${b.name}${dec.why ? ' (' + dec.why + ')' : ''}`, kind: 'info' });
}

export function decideManually(state, decId_, choice) {
  const dec = state.bank.decisions.find((d) => d.id === decId_);
  if (dec) applyDecision(state, dec, choice, 'player');
}

function reopen(state, b) {
  const type = pick(['coffee', 'restaurant', 'restaurant', 'donut']);
  b.name = pick(NEW_NAMES) + (Math.random() < 0.3 ? ' II' : '');
  b.type = type; b.style = null; b.state = 'open'; b.owner = 'npc'; b.vacantDays = 0;
  b.baseQuality = randInt(45, 75); b.buzz = 30; b.reputation = 50; b.savings = 40000; b.inventoryValue = 8000; b.debt = 0;
  b.hours = [...DEFAULT_HOURS[type]]; b.newMenu = GENERIC_MENUS[type] || GENERIC_MENUS.restaurant; b.generic = true; b.lender = 'none';
  emit('news', { text: `${b.name} opens in the old ${b.id.startsWith('vacant') ? 'lot' : 'storefront'}. New business in the neighborhood!`, bizId: b.id, kind: 'good' });
  emit('bizchange', { id: b.id });
}

// Player actions ------------------------------------------------------------
// A liquidated property can be bought cheaply, but its doors stay shut until the player finishes enough major projects.
export const RENOVATION_PROJECTS = 2;
export const RENOVATION_MARKUP = 2.5;
export const vacantPrice = (b) => Math.round(b.propertyValue * 0.12);
export const reopenTypes = (state) => (donutUnlocked(state) ? ['coffee', 'restaurant', 'donut'] : ['coffee', 'restaurant']);
export function buyVacant(state, b, type) {
  if (b.state !== 'vacant' || !reopenTypes(state).includes(type)) return false;
  const price = vacantPrice(b);
  if (state.bank.cash < price) return false;
  state.bank.cash -= price;
  Object.assign(b, {
    owner: 'player', state: 'renovating', type, style: null, name: pick(NEW_NAMES) + ' (yours)', tier: 1, hours: [...DEFAULT_HOURS[type]], vacantDays: 0,
    baseQuality: randInt(50, 70), buzz: 20, reputation: 45, savings: 5000, inventoryValue: 8000, debt: 0, lender: 'none', enhancements: [], boost: 0, gambling: false,
    roast: 'medium', newMenu: GENERIC_MENUS[type], generic: true,
    supply: { beans: 'rainier', cups: 'paper', ingredients: 'pike', packaging: 'paperbox', payment: 'stripey' },
  });
  emit('news', { text: `A new owner buys a shuttered building and starts renovations.`, bizId: b.id, kind: 'good' });
  emit('bizchange', { id: b.id });
  return true;
}

export const enhanceCost = (b, e) => Math.round(b.propertyValue * e.cost * (b.state === 'renovating' ? RENOVATION_MARKUP : 1));
export function enhance(state, b, id) {
  const e = DATA.enhancements.find((x) => x.id === id);
  if (!e || b.enhancements.includes(id)) return false;
  const cost = enhanceCost(b, e);
  if (state.bank.cash < cost) return false;
  state.bank.cash -= cost; b.propertyValue += Math.round(b.propertyValue * e.value); b.enhancements.push(id); b.buzz = clamp(b.buzz + 4, 0, 100);
  if (b.state === 'renovating' && b.enhancements.length >= RENOVATION_PROJECTS) {
    b.state = 'open';
    emit('news', { text: `${b.name} reopens its doors after a full renovation.`, bizId: b.id, kind: 'good' });
    emit('notify', { text: `${b.name} is open for business!`, kind: 'good' });
    emit('bizchange', { id: b.id });
  }
  return true;
}

export function bailout(state, amount) {
  const max = avgShopValue(state) * 100;
  amount = clamp(Math.round(amount), 1, max);
  state.bank.cash += amount;
  state.bank.gov.push({ amount, day: state.day, due: state.day + 2, paid: false });
  return amount;
}
export const bailoutMax = (state) => Math.round(avgShopValue(state) * 100);
export const needsBailout = (state) => state.bank.cash < avgShopValue(state) * 0.5;

export function hireTroublemaker(state, target) {
  state.bank.cash -= 2500; target.buzz = clamp(target.buzz - 15, 0, 100); target.reputation = clamp(target.reputation - 6, 0, 100);
  target.boost -= 8;
  const caught = Math.random() < 0.35;
  if (caught) { state.scrutiny += 12; state.rep = clamp(state.rep - 8, 0, 100); }
  return caught;
}

export function propertyBreakdown(b) {
  return { location: Math.round(b.propertyValue * 0.4), condition: Math.round(b.propertyValue * (0.15 + b.reputation / 1000)), assets: Math.round(b.propertyValue * 0.2), enhancements: b.enhancements.length };
}

