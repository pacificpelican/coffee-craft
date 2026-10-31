// Loads core content plus optional mods (data/mods/index.json -> { files: ["my-mod.json"] }).
export const DATA = {};

export async function loadData() {
  const core = await (await fetch('data/world.json')).json();
  Object.assign(DATA, core);
  try {
    const idx = await (await fetch('data/mods/index.json')).json();
    for (const f of idx.files || []) {
      try {
        const mod = await (await fetch('data/mods/' + encodeURIComponent(f))).json();
        for (const [k, v] of Object.entries(mod)) {
          if (k === 'businesses') {
            for (const b of v) {
              const i = DATA.businesses.findIndex((x) => x.id === b.id);
              if (i >= 0) DATA.businesses[i] = b; else DATA.businesses.push(b);
            }
          } else if (Array.isArray(v) && Array.isArray(DATA[k])) DATA[k] = DATA[k].concat(v);
          else if (v && typeof v === 'object' && DATA[k] && typeof DATA[k] === 'object') Object.assign(DATA[k], v);
          else DATA[k] = v;
        }
      } catch (e) { console.warn('mod failed', f, e); }
    }
  } catch { /* no mods */ }
  return DATA;
}
