// Warden Grid — avatars.
// 1) The Warden: an original pixel-art sentinel (hood, visor, shield sigil). Drawn from a 16x16 map, no image files.
// 2) Unit sigils: every address gets its own mirrored 9x9 pixel sigil, derived from the address itself (same address,
//    same sigil, everywhere). Nothing random, nothing stored.

const WARDEN = [
  '.......HH.......',
  '......hHHh......',
  '.....hHhhHh.....',
  '....hHhhhhHh....',
  '...hHhddddhHh...',
  '...hHddddddHh...',
  '...hhvvvvvvhh...',
  '...hhdVvvVdhh...',
  '...hhhddddhhh...',
  '..Hhhhhhhhhhhh..',
  '.HbbbbbeebbbbbH.',
  'HbbbbbeEEebbbbbH',
  'HbbbbbbeebbbbbbH',
  'hbbbbbbbbbbbbbbh',
  '.hbbbbbbbbbbbbh.',
  '..hhh.hhhh.hhh..',
];
const PAL = { h: '#17803f', H: '#3dff8f', d: '#010703', v: '#3dff8f', V: '#e6fff0', b: '#0e4a28', e: '#21b864', E: '#b4ffcb' };
const PAL_RED = { ...PAL, v: '#ff4f5e', V: '#ffd0d4', e: '#a8323c', E: '#ff4f5e' };

export function wardenSVG(size = 64, { alarm = false, cls = '' } = {}) {
  const pal = alarm ? PAL_RED : PAL; let r = '';
  WARDEN.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[c]}"${c === 'v' || c === 'V' || c === 'E' ? ' class="lit"' : ''}/>`; }));
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// FNV-1a over the lowercase address → a small deterministic stream
function stream(str) {
  let h = 0x811c9dc5; for (const ch of String(str).toLowerCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}
const GREENS = ['#3dff8f', '#b4ffcb', '#21b864', '#9ff5bd', '#21e070'];
export function sigilSVG(addr, size = 40) {
  const r = stream(addr); const fg = GREENS[Math.floor(r() * GREENS.length)], fg2 = GREENS[Math.floor(r() * GREENS.length)];
  let rects = '';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
    const v = r(); if (v < 0.52) continue;
    const c = v > 0.88 ? fg2 : fg;
    for (const xx of x === 4 ? [4] : [x, 8 - x]) rects += `<rect x="${xx + 1}" y="${y + 1}" width="1.02" height="1.02" fill="${c}"/>`;
  }
  return `<svg class="sigil" width="${size}" height="${size}" viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><rect width="11" height="11" fill="#020a05"/><rect x=".5" y=".5" width="10" height="10" fill="none" stroke="#21b864" stroke-width=".12"/>${rects}</svg>`;
}
