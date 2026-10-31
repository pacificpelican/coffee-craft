// Procedural art: logo, food illustrations (SVG), canvas textures for the 3D world.
import { mulberry } from './util.js';

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect width="200" height="200" rx="28" fill="#e3b93c"/>
<path d="M0 150 Q100 120 200 150 V200 H0Z" fill="#6f8f4e" opacity=".55"/>
<path d="M40 62h100v62a40 40 0 0 1-40 40h-20a40 40 0 0 1-40-40z" fill="#2b2f2a"/>
<path d="M140 78h14a22 22 0 0 1 0 44h-14v-10h14a12 12 0 0 0 0-24h-14z" fill="#2b2f2a"/>
<g fill="#e3b93c">
<rect x="52" y="112" width="10" height="44"/><rect x="64" y="96" width="14" height="60"/>
<polygon points="80,156 80,82 90,70 100,82 100,156"/><rect x="102" y="104" width="10" height="52"/>
<rect x="114" y="90" width="12" height="66"/><rect x="128" y="118" width="8" height="38"/>
</g>
<rect x="88" y="52" width="3" height="18" fill="#2b2f2a"/>
<path d="M62 46q-6-10 0-18M100 44q-6-12 0-22M138 46q-6-10 0-18" stroke="#fffbea" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>
<rect x="58" y="136" width="44" height="14" rx="3" fill="#d9772b"/><circle cx="68" cy="152" r="4" fill="#2b2f2a"/><circle cx="92" cy="152" r="4" fill="#2b2f2a"/>
</svg>`;

export const WINDMILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="#e9e0c8" stroke-width="5" stroke-linecap="round"><path d="M50 50 L20 24 M50 50 L76 20 M50 50 L80 76 M50 50 L24 80"/></g><path d="M44 50h12l5 44H39z" fill="#e9e0c8"/><circle cx="50" cy="50" r="6" fill="#d9772b"/></svg>`;

const BG = { coffee: '#d8c8a0', latte: '#cdd6b0', vncoffee: '#e9d9a8', pho: '#cfd9c0', ramen: '#e8d2a0', donut: '#bfd0d6', boba: '#e5d6c2', dumpling: '#d3dccb', pastry: '#e5d4b4', beer: '#d6c08a', fries: '#d9d09a', pancakes: '#e3d0a8', burger: '#d8cfa0', platter: '#d9c9a0', weed_good: '#bcd0a0' };

const svg = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><ellipse cx="100" cy="178" rx="70" ry="10" fill="#0002"/>${inner}</svg>`;
const steam = '<path d="M80 50q-8-12 0-24M100 46q-8-14 0-28M120 50q-8-12 0-24" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>';

const ART = {
  coffee: (c) => svg(`${steam}<path d="M50 70h90v50a40 40 0 0 1-40 40h-10a40 40 0 0 1-40-40z" fill="#f2ecd8" stroke="#2b2f2a" stroke-width="5"/><path d="M140 82h14a20 20 0 0 1 0 40h-14" fill="none" stroke="#2b2f2a" stroke-width="6"/><ellipse cx="95" cy="72" rx="44" ry="9" fill="${c || '#5a3a22'}" stroke="#2b2f2a" stroke-width="4"/>`, BG.coffee),
  latte: (c) => svg(`<path d="M45 80h100l-8 60a40 20 0 0 1-84 0z" fill="#f4efe0" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="95" cy="80" rx="50" ry="14" fill="#b98b5c" stroke="#2b2f2a" stroke-width="4"/><path d="M95 72q-18 6 0 14q18-8 0-14M95 86v-14" stroke="#fff6e0" stroke-width="4" fill="none"/><path d="M145 90h12a16 16 0 0 1 0 32h-14" fill="none" stroke="#2b2f2a" stroke-width="6"/><ellipse cx="95" cy="150" rx="70" ry="12" fill="#ddd" opacity=".7"/>`, BG.latte),
  vncoffee: () => svg(`<path d="M60 40h80l-10 124H70z" fill="#cbe0e0" opacity=".9" stroke="#2b2f2a" stroke-width="5"/><path d="M66 90h68l-6 74H72z" fill="#4a2c18"/><path d="M64 70h72l-3 20H67z" fill="#f2e6c8"/><rect x="66" y="52" width="14" height="14" fill="#fff" opacity=".7" transform="rotate(12 66 52)"/><rect x="104" y="100" width="14" height="14" fill="#fff" opacity=".5" transform="rotate(-10 104 100)"/><path d="M120 30l26 24" stroke="#d9772b" stroke-width="7"/><rect x="40" y="26" width="64" height="12" rx="4" fill="#8a8f8c" stroke="#2b2f2a" stroke-width="4"/>`, BG.vncoffee),
  pho: () => svg(`<path d="M30 100h140a70 62 0 0 1-140 0z" fill="#f2ecd8" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="100" cy="100" rx="70" ry="16" fill="#c9a064" stroke="#2b2f2a" stroke-width="4"/><path d="M52 98q20 10 40 0t40 0" stroke="#f4e9cc" stroke-width="5" fill="none"/><circle cx="80" cy="96" r="8" fill="#a55b3e"/><circle cx="118" cy="100" r="9" fill="#a55b3e"/><path d="M130 88q16-18 26 0q-14 8-26 0z" fill="#4f6b3a"/><circle cx="58" cy="102" r="10" fill="#c9d96a" stroke="#2b2f2a" stroke-width="3"/><path d="M165 30L120 96" stroke="#7a5a3c" stroke-width="5"/><path d="M175 36L128 98" stroke="#7a5a3c" stroke-width="5"/>${steam}`, BG.pho),
  ramen: () => svg(`<path d="M28 98h144a72 66 0 0 1-144 0z" fill="#d9772b" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="100" cy="98" rx="72" ry="16" fill="#e4c486" stroke="#2b2f2a" stroke-width="4"/><path d="M50 96q14 8 28 0t28 0t28 0" stroke="#f4e3a8" stroke-width="5" fill="none"/><ellipse cx="128" cy="92" rx="16" ry="11" fill="#fff6dc" stroke="#2b2f2a" stroke-width="3"/><circle cx="128" cy="92" r="6" fill="#e3a52c"/><rect x="60" y="86" width="30" height="12" rx="6" fill="#a55b3e" transform="rotate(-14 60 86)"/><path d="M96 84l6-6 6 6-6 6z" fill="#4f6b3a"/>${steam}`, BG.ramen),
  donut: () => svg(`<ellipse cx="100" cy="112" rx="68" ry="46" fill="#c98a45" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="100" cy="100" rx="68" ry="44" fill="#e3a65a" stroke="#2b2f2a" stroke-width="5"/><path d="M36 98q10-34 64-36t64 36q-30-14-64-12t-64 12z" fill="#f2d2a6"/><ellipse cx="100" cy="100" rx="22" ry="12" fill="#bfd0d6" stroke="#2b2f2a" stroke-width="4"/><g fill="#6f8f4e"><rect x="60" y="82" width="10" height="4" transform="rotate(30 60 82)"/><rect x="124" y="78" width="10" height="4" transform="rotate(-20 124 78)"/></g><g fill="#e3b93c"><rect x="86" y="70" width="10" height="4"/><rect x="140" y="96" width="10" height="4" transform="rotate(40 140 96)"/></g><g fill="#d9772b"><rect x="52" y="104" width="10" height="4" transform="rotate(-30 52 104)"/><rect x="110" y="120" width="10" height="4"/></g>`, BG.donut),
  boba: () => svg(`<path d="M56 50h88l-12 116H68z" fill="#f4ead2" stroke="#2b2f2a" stroke-width="5"/><path d="M62 90h76l-4 76H66z" fill="#c59a68"/><g fill="#2b1e14"><circle cx="82" cy="150" r="7"/><circle cx="102" cy="154" r="7"/><circle cx="120" cy="148" r="7"/><circle cx="92" cy="138" r="7"/><circle cx="112" cy="136" r="7"/></g><path d="M110 20l22 140" stroke="#6f8f4e" stroke-width="8"/><rect x="50" y="44" width="100" height="12" rx="5" fill="#6f8f4e" stroke="#2b2f2a" stroke-width="4"/>`, BG.boba),
  dumpling: () => svg(`<ellipse cx="100" cy="120" rx="76" ry="38" fill="#c9a064" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="100" cy="114" rx="66" ry="30" fill="#e3c88a"/><g fill="#fbf3dc" stroke="#2b2f2a" stroke-width="4"><path d="M54 112q0-26 26-26q26 0 26 26z"/><path d="M96 118q0-26 26-26q26 0 26 26z"/><path d="M70 130q0-22 22-22q22 0 22 22z"/></g>${steam}`, BG.dumpling),
  pastry: () => svg(`<path d="M30 130q10-60 70-60t70 60q-70 24-140 0z" fill="#d49a52" stroke="#2b2f2a" stroke-width="5"/><path d="M60 118q20-30 40-30t40 30" stroke="#a8703a" stroke-width="5" fill="none"/><path d="M70 100q30-26 60 0" stroke="#f2d49a" stroke-width="5" fill="none"/><circle cx="100" cy="86" r="6" fill="#d9772b"/>`, BG.pastry),
  beer: () => svg(`<path d="M60 44h72l-8 120H68z" fill="#e3a52c" stroke="#2b2f2a" stroke-width="5"/><path d="M58 44q4-26 34-20q20-10 40 20z" fill="#fff6e0" stroke="#2b2f2a" stroke-width="4"/><path d="M132 66h18a16 16 0 0 1 0 60h-22" fill="none" stroke="#2b2f2a" stroke-width="6"/><g fill="#fff" opacity=".6"><circle cx="86" cy="120" r="3"/><circle cx="104" cy="96" r="3"/><circle cx="96" cy="140" r="3"/></g>`, BG.beer),
  fries: () => svg(`<path d="M60 90h80l-10 76H70z" fill="#d9772b" stroke="#2b2f2a" stroke-width="5"/><g stroke="#2b2f2a" stroke-width="3" fill="#f0cd5a"><rect x="62" y="40" width="12" height="58" transform="rotate(-12 62 40)"/><rect x="78" y="32" width="12" height="62"/><rect x="94" y="36" width="12" height="60"/><rect x="110" y="34" width="12" height="62" transform="rotate(8 110 34)"/><rect x="124" y="44" width="12" height="52" transform="rotate(18 124 44)"/></g><path d="M62 100h76" stroke="#8a5a2a" stroke-width="10" opacity=".5"/>`, BG.fries),
  pancakes: () => svg(`<ellipse cx="100" cy="150" rx="76" ry="14" fill="#f4efe0" stroke="#2b2f2a" stroke-width="4"/><g stroke="#2b2f2a" stroke-width="4"><ellipse cx="100" cy="138" rx="56" ry="14" fill="#d6a050"/><ellipse cx="100" cy="122" rx="56" ry="14" fill="#e2b265"/><ellipse cx="100" cy="106" rx="56" ry="14" fill="#d6a050"/></g><path d="M64 104q36 20 72 0q-6 26-18 30q-6-12-18 0q-14-8-18 4q-10-10-18-34z" fill="#8a4a1a" opacity=".85"/><rect x="88" y="88" width="24" height="14" rx="3" fill="#f2d86a" stroke="#2b2f2a" stroke-width="3"/>`, BG.pancakes),
  burger: () => svg(`<path d="M40 100q0-50 60-50t60 50z" fill="#d9a050" stroke="#2b2f2a" stroke-width="5"/><rect x="36" y="100" width="128" height="14" rx="6" fill="#6f8f4e" stroke="#2b2f2a" stroke-width="4"/><rect x="40" y="112" width="120" height="16" rx="6" fill="#5a3a22" stroke="#2b2f2a" stroke-width="4"/><path d="M40 126h120l-12 14H52z" fill="#e3b93c" stroke="#2b2f2a" stroke-width="4"/><path d="M42 140h116q0 18-58 18t-58-18z" fill="#d9a050" stroke="#2b2f2a" stroke-width="5"/>`, BG.burger),
  platter: () => svg(`<ellipse cx="100" cy="112" rx="84" ry="52" fill="#e9e0c8" stroke="#2b2f2a" stroke-width="5"/><ellipse cx="100" cy="108" rx="64" ry="38" fill="#f1ddb0" stroke="#2b2f2a" stroke-width="3"/><circle cx="82" cy="102" r="22" fill="#c8601f"/><circle cx="76" cy="96" r="6" fill="#e9b25a"/><circle cx="96" cy="108" r="5" fill="#e9b25a"/><path d="M118 94q22-8 30 12q-18 10-30-12z" fill="#6f8f4e"/><ellipse cx="124" cy="120" rx="16" ry="9" fill="#d9772b"/>`, BG.platter),
  weed_good: () => svg(`<g fill="#4f6b3a" stroke="#2b2f2a" stroke-width="3"><path d="M100 120 L100 40 M100 120 L60 60 M100 120 L140 60 M100 120 L40 100 M100 120 L160 100"/></g><g fill="#6f8f4e" stroke="#2b2f2a" stroke-width="3"><ellipse cx="100" cy="50" rx="10" ry="32"/><ellipse cx="64" cy="66" rx="9" ry="28" transform="rotate(-35 64 66)"/><ellipse cx="136" cy="66" rx="9" ry="28" transform="rotate(35 136 66)"/><ellipse cx="50" cy="100" rx="8" ry="24" transform="rotate(-70 50 100)"/><ellipse cx="150" cy="100" rx="8" ry="24" transform="rotate(70 150 100)"/></g>`, BG.weed_good),
};

export function foodSVG(kind, variant) {
  const fn = ART[kind] || ART.pastry;
  return fn(variant);
}
export const svgURI = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

// Reject anything script-like from AI supplied SVG; it is only ever shown via <img> anyway.
export function sanitizeSVG(s) {
  if (!s || !/<svg[\s>]/i.test(s)) return null;
  s = s.slice(s.search(/<svg/i), s.toLowerCase().lastIndexOf('</svg>') + 6);
  if (/<script|on\w+\s*=|<foreignObject|href|<image|<style|@import/i.test(s) || s.length > 6000) return null;
  return s;
}

// ------------------------------------------------------------- canvas textures
export function canvasTex(w, hgt, draw, THREE, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  draw(c.getContext('2d'), w, hgt);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapNearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function signTexture(THREE, text, bg, fg, sub) {
  return canvasTex(256, 64, (g, w, hgt) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, hgt);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, hgt - 8);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 30; g.font = `bold ${size}px Georgia, serif`;
    while (g.measureText(text).width > w - 24 && size > 12) { size -= 2; g.font = `bold ${size}px Georgia, serif`; }
    g.fillText(text, w / 2, sub ? hgt / 2 - 6 : hgt / 2 + 1);
    if (sub) { g.font = '13px Georgia, serif'; g.fillText(sub, w / 2, hgt - 14); }
  }, THREE);
}

export function windowsTexture(THREE, base, seed, floors = 3, lit = 0.25) {
  const rnd = mulberry(seed);
  return canvasTex(128, 32 * floors, (g, w, hgt) => {
    g.fillStyle = base; g.fillRect(0, 0, w, hgt);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * hgt, 6 + rnd() * 20, 2 + rnd() * 6); }
    for (let f = 0; f < floors; f++) for (let i = 0; i < 4; i++) {
      const x = 8 + i * 30, y = f * 32 + 7;
      const on = rnd() < lit;
      g.fillStyle = on ? '#e8c76a' : (rnd() < .5 ? '#2f3b40' : '#3e4f52'); g.fillRect(x, y, 20, 18);
      g.fillStyle = '#0004'; g.fillRect(x + 9, y, 2, 18); g.fillRect(x, y + 8, 20, 2);
    }
    // damp streaks
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(20,40,40,.10)'; g.fillRect(rnd() * w, 0, 1 + rnd() * 2, hgt); }
  }, THREE, true);
}

// Painted mural: sasquatch or whale, drawn in the sketchy palette.
export function muralTexture(THREE, kind, seed = 1) {
  return canvasTex(256, 128, (g, w, hgt) => {
    const sky = g.createLinearGradient(0, 0, 0, hgt); sky.addColorStop(0, '#c8d6c0'); sky.addColorStop(1, '#e3d79a');
    g.fillStyle = sky; g.fillRect(0, 0, w, hgt);
    g.fillStyle = '#4f6b3a'; for (let i = 0; i < 9; i++) { const x = i * 32 + 8; g.beginPath(); g.moveTo(x, hgt); g.lineTo(x + 16, 30 + (i % 3) * 14); g.lineTo(x + 32, hgt); g.fill(); }
    if (kind === 'whale') {
      g.fillStyle = '#4f7a96'; g.beginPath(); g.ellipse(120, 74, 70, 30, -0.1, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(180, 70); g.quadraticCurveTo(225, 30, 236, 56); g.quadraticCurveTo(210, 62, 196, 84); g.fill();
      g.fillStyle = '#e9e0c8'; g.beginPath(); g.ellipse(110, 88, 52, 12, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#2b2f2a'; g.beginPath(); g.arc(70, 66, 3, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(100, 44); g.lineTo(96, 24); g.moveTo(100, 44); g.lineTo(108, 26); g.stroke();
      g.fillStyle = '#4f7a96'; g.fillRect(0, 100, w, 28);
    } else {
      g.fillStyle = '#5a3a22'; g.fillRect(96, 44, 64, 66); g.beginPath(); g.arc(128, 36, 22, 0, 7); g.fill();
      g.fillRect(70, 52, 26, 12); g.fillRect(160, 52, 26, 12); g.fillRect(100, 108, 20, 18); g.fillRect(134, 108, 20, 18);
      g.fillStyle = '#e9e0c8'; g.fillRect(118, 30, 6, 6); g.fillRect(132, 30, 6, 6);
      g.fillStyle = '#d9772b'; g.fillRect(112, 44, 32, 4);
    }
    g.strokeStyle = '#2b2f2a'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, hgt - 4);
  }, THREE);
}

export function imageTexture(THREE, url) {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
