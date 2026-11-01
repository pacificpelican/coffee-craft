// Rotating "new arrivals" so shops don't sell the same three things forever.
// Names are chosen to match an existing icon where possible; items without a match get AI-drawn art (or the platter).
const POOL = {
  convenience: [['Matcha Onigiri', 3], ['Spicy Tuna Onigiri', 3], ['Iced Canned Coffee', 3], ['Hot Milk Tea Can', 3], ['Cup Noodles: Miso', 3], ['Mint Gum', 2], ['Compact Umbrella', 10], ['Cup Noodles: Kimchi', 3], ['Plum Onigiri', 3], ['Yuzu Soda Can', 3]],
  drug: [['Honey Cough Drops', 4], ['Vitamin D Gummies', 9], ['Cherry Lip Balm', 4], ['Night Cream', 14], ['Hand Lotion', 7], ['Rain Poncho (Kids)', 7], ['Sinus Tabs', 9], ['Zinc Lozenges', 6], ['Fisherman Poncho', 11]],
  pets: [['Ruby Betta Fish', 22], ['Blue Betta Fish', 20], ['Cardinal Tetras (6)', 14], ['Fancy Goldfish Bowl', 24], ['Ember Tetras (8)', 13], ['Snail Duo', 8], ['Glass Aquarium Mini', 34], ['Fan-Tail Goldfish', 12]],
  electronics: [['Studio Headphones', 160], ['Wireless Earbuds', 90], ['Pocket Headphones', 60], ['Retro Earbuds', 25]],
  weed: [['Berry Gummies', 18, 'weed_good'], ['Lemon Gummies', 18, 'weed_good'], ['Sleepy Pre-roll', 22, 'weed_good']],
};

// ---- Moonlit Quartz (alley crystal shop): kind is "xtal:<shape>:<colour>", drawn by art.js.
export const CRYSTALS = [
  ['Amethyst Cluster', 28, 'xtal:cluster:#9b6fd0', 'Deep violet points that catch the lamplight.'],
  ['Rose Quartz Tumble', 14, 'xtal:tumble:#f0a8b8', 'Soft pink and smooth as a river stone.'],
  ['Citrine Point', 22, 'xtal:point:#e8b830', 'Honey-gold, said to bring sunny days to rainy cities.'],
  ['Clear Quartz Point', 16, 'xtal:point:#cfe9ee', 'Water-clear and cold in the hand.'],
  ['Black Obsidian', 12, 'xtal:tumble:#2c2b33', 'Volcanic glass, glossy as wet asphalt.'],
  ['Green Aventurine', 11, 'xtal:tumble:#5fa36a', 'A little glitter hides inside the green.'],
  ['Fluorite Cluster', 24, 'xtal:cluster:#6fc3b0', 'Teal and mint, stacked like tiny ice castles.'],
  ['Lapis Lazuli', 18, 'xtal:tumble:#2f4fa8', 'Midnight blue flecked with gold.'],
  ['Blue Lace Agate Geode', 40, 'xtal:geode:#7aa8d8', 'Crack it open and the sky is inside.'],
  ["Tiger's Eye", 13, 'xtal:tumble:#b77a2c', 'Banded gold-brown with a watchful shimmer.'],
  ['Pyrite Cluster', 20, 'xtal:cluster:#c9b04a', "Fool's gold, but a very pretty fool."],
  ['Moonstone', 26, 'xtal:tumble:#cfd8e8', 'Milky blue glow, like fog over the water.'],
  ['Amethyst Geode', 46, 'xtal:geode:#8a5fc0', 'A purple cave small enough for a windowsill.'],
  ['Smoky Quartz Point', 19, 'xtal:point:#8a7a6a', 'Tea-brown and calm.'],
];

// Seven day-rotating crystals from the catalog, then any AI-invented ones the player has discovered.
export function crystalStock(day, extras = []) {
  const n = CRYSTALS.length, start = (day * 3) % n;
  const out = Array.from({ length: 7 }, (_, k) => CRYSTALS[(start + k * 2) % n]);
  const uniq = out.filter((c, i) => out.findIndex((o) => o[0] === c[0]) === i);
  for (const e of extras) if (!uniq.some((o) => o[0] === e[0])) uniq.push(e);
  return uniq;
}

// Two day-seeded arrivals per shop, drawn from the pool (skipping names already stocked).
export function stockFor(def, day, extras = []) {
  const base = def.items || [];
  const pool = (POOL[def.type] || []).filter((p) => !base.some((b) => b[0] === p[0]));
  const out = [...base];
  for (let k = 0; k < 2 && pool.length; k++) {
    const i = Math.abs((day * 31 + k * 17 + def.id.length * 7 + def.id.charCodeAt(0)) | 0) % pool.length;
    out.push(pool.splice(i, 1)[0]);
  }
  for (const e of extras) if (!out.some((o) => o[0] === e[0])) out.push(e);
  return out;
}
