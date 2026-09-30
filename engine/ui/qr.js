// A QR code as a picture. It is drawn, not encoded: the three corner squares
// and a pattern seeded from the text, so each code looks different and the
// same text always looks the same. A real camera cannot read it, which is the
// point: nothing in the sim can send a player anywhere outside it. Scanning
// happens in the phone's Camera app, from scenario data.
const N = 25;

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inFinder = (x, y) => {
  const corner = (cx, cy) => x >= cx && x < cx + 8 && y >= cy && y < cy + 8;
  return corner(0, 0) || corner(N - 8, 0) || corner(0, N - 8);
};

function finder(cx, cy) {
  return `<rect x="${cx}" y="${cy}" width="7" height="7"/><rect x="${cx + 1}" y="${cy + 1}" width="5" height="5" fill="#fff"/><rect x="${cx + 2}" y="${cy + 2}" width="3" height="3"/>`;
}

export function qrSvg(text, { size = 132 } = {}) {
  const rnd = seeded(String(text || 'qr'));
  let cells = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y)) continue;
      if ((y === 6 || x === 6) && !inFinder(x, y)) { if ((x + y) % 2 === 0) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; continue; }
      if (rnd() < 0.47) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${N + 4} ${N + 4}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="A QR code"><rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/><g fill="#111">${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}${cells}</g></svg>`;
  const span = document.createElement('span');
  span.className = 'qr-img';
  span.innerHTML = svg;
  return span;
}
