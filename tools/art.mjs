// The printed and written things in the office, drawn as SVG and rendered to
// PNG: the whiteboard, the sticky note under the keyboard, Sam's badge, the
// bank change form in the printer tray, the USB stick's label, the Veltrix
// sign, the security poster, the exit sign and the mouse mat (all baked into
// the office by Blender), plus the pictures the story shows on screen (the
// intercom camera, the notebook page, the whiteboard, the form, the badge and
// the sticky note), which are also copied into public/assets/art.
//
//   node tools/art.mjs
//
// All of it is original artwork for this project. Veltrix Logistics, Ferrum
// Steel and everyone named here are made up.
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '.cache', 'art');
const PUBLIC = join(HERE, '..', 'public', 'assets', 'art');
const RUNTIME = new Set(['courier_cam.png', 'notebook_page.png', 'whiteboard.png', 'form_bank.png', 'badge.png', 'sticky_marta.png']);

const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'Menlo, Courier New, monospace';
const HAND = 'Marker Felt, Chalkboard SE, Comic Sans MS, cursive';
const PEN = 'Bradley Hand, Noteworthy, Chalkboard SE, cursive';

// The Veltrix mark: a stylised V made of two freight arrows.
const mark = (x, y, s, colour = '#24c28a') => `
  <g transform="translate(${x},${y}) scale(${s})">
    <path d="M0 0 L22 0 L40 44 L58 0 L80 0 L50 72 L30 72 Z" fill="${colour}"/>
    <path d="M58 0 L80 0 L70 24 L48 24 Z" fill="#ffffff" opacity="0.35"/>
  </g>`;

const whiteboard = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="#f7f8f6"/>
  <rect width="1600" height="1000" fill="url(#g)" opacity="0.5"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e7ea"/></linearGradient></defs>
  <!-- old writing, badly wiped -->
  <text x="1130" y="640" font-family="${HAND}" font-size="46" fill="#9aa3ad" opacity="0.2" transform="rotate(-3 1130 640)">Q2 accruals done?</text>
  <ellipse cx="1180" cy="905" rx="230" ry="40" fill="#aab4be" opacity="0.08"/>

  <text x="70" y="120" font-family="${HAND}" font-size="64" fill="#1d4fb8">GUEST WI-FI</text>
  <text x="70" y="200" font-family="${HAND}" font-size="58" fill="#1d4fb8">VLX-Guest</text>
  <text x="70" y="280" font-family="${HAND}" font-size="58" fill="#1d4fb8">pw: Freight2026!</text>
  <path d="M60 300 q220 18 440 0" stroke="#1d4fb8" stroke-width="5" fill="none"/>

  <text x="760" y="120" font-family="${HAND}" font-size="66" fill="#d12e2e">PAYMENT RUN</text>
  <text x="760" y="205" font-family="${HAND}" font-size="66" fill="#d12e2e">THURS 19:00 CUT OFF!!</text>
  <path d="M750 225 q330 22 700 -4" stroke="#d12e2e" stroke-width="6" fill="none"/>
  <path d="M750 243 q330 22 700 -4" stroke="#d12e2e" stroke-width="4" fill="none"/>

  <text x="70" y="430" font-family="${HAND}" font-size="56" fill="#178a4c">Project KESTREL</text>
  <text x="70" y="505" font-family="${HAND}" font-size="52" fill="#178a4c">go live Fri 25th</text>
  <text x="70" y="580" font-family="${HAND}" font-size="44" fill="#178a4c">(new carrier portal)</text>

  <text x="760" y="400" font-family="${HAND}" font-size="54" fill="#1d4fb8">IT desk x4040 (Priya)</text>
  <text x="760" y="480" font-family="${HAND}" font-size="54" fill="#202428">Marta back Mon</text>
  <text x="760" y="555" font-family="${HAND}" font-size="48" fill="#202428">Dan approves over 10k</text>

  <!-- the approval flow someone drew in a meeting -->
  ${['Invoice', 'Check', 'Approve', 'Pay'].map((t, i) => `
    <rect x="${80 + i * 360}" y="700" width="250" height="110" rx="18" fill="none" stroke="#202428" stroke-width="5"/>
    <text x="${205 + i * 360}" y="772" text-anchor="middle" font-family="${HAND}" font-size="48" fill="#202428">${t}</text>
    ${i < 3 ? `<path d="M${335 + i * 360} 755 l90 0 m-24 -18 l24 18 l-24 18" stroke="#202428" stroke-width="5" fill="none"/>` : ''}`).join('')}
  <text x="440" y="890" font-family="${HAND}" font-size="40" fill="#d12e2e">two people, always!</text>
  <!-- marker tray -->
  <rect x="0" y="968" width="1600" height="32" fill="#c9ced3"/>
</svg>`;

const stickyMarta = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#fbe36e"/>
  <rect width="256" height="30" fill="#f2d65a"/>
  <text x="20" y="92" font-family="${PEN}" font-size="34" fill="#1f3c88" transform="rotate(-3 20 92)">Marta O.</text>
  <text x="18" y="160" font-family="${PEN}" font-size="44" fill="#1f3c88" transform="rotate(-4 18 160)">Summer2026!</text>
  <text x="22" y="220" font-family="${PEN}" font-size="24" fill="#1f3c88" opacity="0.8" transform="rotate(-2 22 220)">(for the ERP)</text>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="800" viewBox="0 0 512 800">
  <rect width="512" height="800" rx="36" fill="#ffffff"/>
  <rect width="512" height="210" rx="36" fill="#0f2a33"/>
  <rect y="170" width="512" height="40" fill="#0f2a33"/>
  ${mark(40, 60, 1.1)}
  <text x="150" y="115" font-family="${FONT}" font-weight="800" font-size="46" fill="#ffffff" letter-spacing="3">VELTRIX</text>
  <text x="152" y="158" font-family="${FONT}" font-weight="500" font-size="24" fill="#8fd9bd" letter-spacing="6">LOGISTICS</text>
  <rect x="136" y="250" width="240" height="280" rx="16" fill="#d9e1e4"/>
  <circle cx="256" cy="355" r="62" fill="#7a8a90"/>
  <path d="M156 530 q100 -150 200 0 z" fill="#7a8a90"/>
  <text x="256" y="600" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="46" fill="#0f2a33">S. RIVERA</text>
  <text x="256" y="645" text-anchor="middle" font-family="${FONT}" font-size="28" fill="#47606a">Accounts Payable</text>
  <text x="256" y="700" text-anchor="middle" font-family="${MONO}" font-size="26" fill="#47606a">VL-4471-AP</text>
  <rect x="206" y="24" width="100" height="18" rx="9" fill="#e7ecee"/>
</svg>`;

const form = `
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1086" viewBox="0 0 768 1086">
  <rect width="768" height="1086" fill="#fbfbf8"/>
  ${mark(52, 48, 0.55, '#0f2a33')}
  <text x="112" y="80" font-family="${FONT}" font-weight="800" font-size="26" fill="#0f2a33">VELTRIX LOGISTICS</text>
  <text x="52" y="160" font-family="${FONT}" font-weight="800" font-size="34" fill="#111">VENDOR BANK DETAIL CHANGE</text>
  <text x="52" y="196" font-family="${FONT}" font-size="20" fill="#555">Form AP-17. Changes take effect only after independent verification.</text>
  ${[['Vendor', 'Ferrum Steel Supply Ltd'], ['Vendor ID', 'V-20418'], ['Requested by', 'accounts@ferrum-steel.co'], ['New account name', 'Ferrum Steel Supply'], ['New sort code', '04-00-72'], ['New account no.', '6120 4418'], ['Reason given', 'Change of banking provider'], ['Date received', 'Today, 16:41']].map(([k, v], i) => `
    <text x="52" y="${280 + i * 70}" font-family="${FONT}" font-size="20" fill="#666">${k}</text>
    <text x="300" y="${280 + i * 70}" font-family="${MONO}" font-size="22" fill="#111">${v}</text>
    <line x1="52" y1="${296 + i * 70}" x2="716" y2="${296 + i * 70}" stroke="#dddddd" stroke-width="2"/>`).join('')}
  <rect x="52" y="860" width="664" height="150" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="8 6"/>
  <text x="70" y="900" font-family="${FONT}" font-weight="700" font-size="20" fill="#111">VERIFIED BY CALL BACK TO THE NUMBER ON FILE</text>
  <text x="70" y="945" font-family="${FONT}" font-size="20" fill="#666">Called by: ______________  Number used: ______________</text>
  <text x="70" y="985" font-family="${FONT}" font-size="20" fill="#666">Second approver: ______________</text>
  <text x="52" y="1060" font-family="${FONT}" font-size="16" fill="#999">CONFIDENTIAL. Do not leave in the printer tray.</text>
</svg>`;

const usbLabel = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="96" viewBox="0 0 256 96">
  <rect width="256" height="96" fill="#f2f2ee"/>
  <text x="128" y="62" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="40" fill="#b3261e" letter-spacing="2">PAYROLL Q3</text>
</svg>`;

const sign = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256" viewBox="0 0 1024 256">
  <rect width="1024" height="256" fill="#0f2a33"/>
  ${mark(60, 72, 1.5)}
  <text x="220" y="150" font-family="${FONT}" font-weight="800" font-size="96" fill="#ffffff" letter-spacing="8">VELTRIX</text>
  <text x="224" y="210" font-family="${FONT}" font-weight="500" font-size="40" fill="#8fd9bd" letter-spacing="18">LOGISTICS</text>
</svg>`;

const poster = `
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1086" viewBox="0 0 768 1086">
  <rect width="768" height="1086" fill="#0f2a33"/>
  <circle cx="384" cy="380" r="230" fill="#24c28a" opacity="0.14"/>
  <rect x="274" y="230" width="220" height="300" rx="34" fill="none" stroke="#24c28a" stroke-width="16"/>
  <path d="M318 470 q66 -60 132 0" stroke="#24c28a" stroke-width="14" fill="none"/>
  <circle cx="384" cy="300" r="16" fill="#24c28a"/>
  <text x="384" y="660" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="70" fill="#ffffff">MONEY MOVING?</text>
  <text x="384" y="750" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="70" fill="#24c28a">CALL BACK.</text>
  <text x="384" y="840" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#b9d6cc">Use the number you already had,</text>
  <text x="384" y="882" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#b9d6cc">never the one in the email.</text>
  <text x="384" y="1010" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="24" fill="#6f9489" letter-spacing="4">VELTRIX SECURITY TEAM</text>
</svg>`;

const exitSign = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="200" viewBox="0 0 512 200">
  <rect width="512" height="200" fill="#12a150"/>
  <rect x="10" y="10" width="492" height="180" fill="none" stroke="#ffffff" stroke-width="6"/>
  <rect x="40" y="36" width="96" height="128" fill="#ffffff"/>
  <rect x="58" y="54" width="60" height="110" fill="#12a150"/>
  <g fill="#ffffff" transform="translate(200,40)">
    <circle cx="40" cy="14" r="14"/>
    <path d="M28 34 l30 6 l18 26 l22 4 l-4 12 l-28 -6 l-10 -12 l-8 28 l20 18 l-8 30 l-12 -4 l6 -22 l-22 -18 l-14 40 l-30 -2 l2 -12 l20 0 l20 -58 l-14 4 l-8 18 l-12 -4 l12 -28 z"/>
  </g>
  <path d="M360 100 l90 0 m-34 -34 l34 34 l-34 34" stroke="#ffffff" stroke-width="16" fill="none"/>
</svg>`;

const mousepad = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">
  <rect width="512" height="384" fill="#14191c"/>
  ${mark(380, 280, 0.8, '#1f5c49')}
</svg>`;

// What the intercom camera sees: a grainy night still of a courier in a hi vis
// vest holding a parcel, face half turned away from the lens.
const courier = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.7  0 0 0 0 0.6  0 0 0 0.35 0"/></filter>
    <radialGradient id="v" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient>
  </defs>
  <rect width="640" height="480" fill="#39463f"/>
  <rect x="0" y="360" width="640" height="120" fill="#2b332f"/>
  <rect x="40" y="40" width="160" height="330" fill="#4a5a52"/>
  <rect x="470" y="60" width="140" height="300" fill="#44524b"/>
  <ellipse cx="330" cy="150" rx="52" ry="60" fill="#8c9a90"/>
  <path d="M290 110 q40 -40 84 -4 l6 30 q-50 -20 -94 4 z" fill="#1d2420"/>
  <path d="M230 420 l20 -170 q80 -40 160 0 l20 170 z" fill="#c9d65a"/>
  <rect x="245" y="300" width="170" height="18" fill="#e7eee9" opacity="0.9"/>
  <rect x="245" y="345" width="170" height="18" fill="#e7eee9" opacity="0.9"/>
  <rect x="260" y="250" width="150" height="110" fill="#9a7b52"/>
  <rect x="260" y="250" width="150" height="18" fill="#7f6442"/>
  <rect x="300" y="290" width="70" height="36" fill="#e9e3d6"/>
  <rect width="640" height="480" filter="url(#grain)"/>
  <rect width="640" height="480" fill="url(#v)"/>
  <text x="20" y="34" font-family="${MONO}" font-size="20" fill="#d8f0e0">LOBBY DOOR  CAM 02</text>
  <text x="620" y="34" text-anchor="end" font-family="${MONO}" font-size="20" fill="#d8f0e0">18:52:07</text>
  <circle cx="600" cy="460" r="7" fill="#ff4d4d"/>
</svg>`;

const notebook = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100">
  <rect width="900" height="1100" fill="#fbfaf3"/>
  ${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="${150 + i * 40}" x2="900" y2="${150 + i * 40}" stroke="#c6d6e8" stroke-width="2"/>`).join('')}
  <line x1="110" y1="0" x2="110" y2="1100" stroke="#e6a8a8" stroke-width="3"/>
  <text x="140" y="120" font-family="${PEN}" font-size="46" fill="#1f3c88">Useful numbers (checked!)</text>
  <text x="150" y="228" font-family="${PEN}" font-size="40" fill="#1f3c88">IT service desk: x4040 (Priya)</text>
  <text x="150" y="308" font-family="${PEN}" font-size="40" fill="#1f3c88">Security out of hours: x4999</text>
  <text x="150" y="388" font-family="${PEN}" font-size="40" fill="#1f3c88">Reception: x4000</text>
  <text x="140" y="508" font-family="${PEN}" font-size="44" fill="#b3261e">Vendor bank change = CALL BACK</text>
  <text x="150" y="588" font-family="${PEN}" font-size="36" fill="#1f3c88">1. never the number in the email</text>
  <text x="150" y="668" font-family="${PEN}" font-size="36" fill="#1f3c88">2. number from the vendor file (drawer)</text>
  <text x="150" y="748" font-family="${PEN}" font-size="36" fill="#1f3c88">3. ask for the person we know</text>
  <text x="150" y="828" font-family="${PEN}" font-size="36" fill="#1f3c88">4. second approver signs the form</text>
  <text x="150" y="948" font-family="${PEN}" font-size="34" fill="#1f3c88" opacity="0.85">Nobody from IT will ever ask for a code.</text>
</svg>`;

const jobs = [
  ['whiteboard.png', whiteboard],
  ['sticky_marta.png', stickyMarta],
  ['badge.png', badge],
  ['form_bank.png', form],
  ['usb_label.png', usbLabel],
  ['veltrix_sign.png', sign],
  ['poster_callback.png', poster],
  ['exit_sign.png', exitSign],
  ['mousepad_office.png', mousepad],
  ['courier_cam.png', courier],
  ['notebook_page.png', notebook]
];

await mkdir(OUT, { recursive: true });
await mkdir(PUBLIC, { recursive: true });
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
  if (RUNTIME.has(file)) await copyFile(join(OUT, file), join(PUBLIC, file));
  console.log('[art]', file, RUNTIME.has(file) ? '(and public/assets/art)' : '');
}
