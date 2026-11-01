// Rotating "new arrivals" so shops don't sell the same three things forever.
// Names are chosen to match an existing icon where possible; items without a match get AI-drawn art (or the platter).
const POOL = {
  convenience: [['Matcha Onigiri', 3], ['Spicy Tuna Onigiri', 3], ['Iced Canned Coffee', 3], ['Hot Milk Tea Can', 3], ['Cup Noodles: Miso', 3], ['Mint Gum', 2], ['Compact Umbrella', 10], ['Cup Noodles: Kimchi', 3], ['Plum Onigiri', 3], ['Yuzu Soda Can', 3]],
  drug: [['Honey Cough Drops', 4], ['Vitamin D Gummies', 9], ['Cherry Lip Balm', 4], ['Night Cream', 14], ['Hand Lotion', 7], ['Rain Poncho (Kids)', 7], ['Sinus Tabs', 9], ['Zinc Lozenges', 6], ['Fisherman Poncho', 11]],
  pets: [['Ruby Betta Fish', 22], ['Blue Betta Fish', 20], ['Cardinal Tetras (6)', 14], ['Fancy Goldfish Bowl', 24], ['Ember Tetras (8)', 13], ['Snail Duo', 8], ['Glass Aquarium Mini', 34], ['Fan-Tail Goldfish', 12]],
  electronics: [['Studio Headphones', 160], ['Wireless Earbuds', 90], ['Pocket Headphones', 60], ['Retro Earbuds', 25]],
  weed: [['Berry Gummies', 18, 'weed_good'], ['Lemon Gummies', 18, 'weed_good'], ['Sleepy Pre-roll', 22, 'weed_good']],
};

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
