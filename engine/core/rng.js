// Seeded randomness so a seed always replays the same run.
// Seeds are short word codes that a kid can type back in.
const WORDS = [
  'amber', 'basil', 'cobalt', 'dune', 'ember', 'fable', 'ginger', 'harbour',
  'indigo', 'jetty', 'kelp', 'lantern', 'moss', 'nimbus', 'onyx', 'pebble',
  'quartz', 'rowan', 'sable', 'thistle', 'umber', 'violet', 'willow', 'yarrow'
];

export function makeSeedWords(rand = Math.random) {
  const pick = () => WORDS[Math.floor(rand() * WORDS.length)];
  const num = String(Math.floor(rand() * 90) + 10);
  return `${pick()}-${pick()}-${num}`;
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = String(seed || makeSeedWords());
    this.next = mulberry32(hashString(this.seed));
  }
  float(min = 0, max = 1) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  bool(chance = 0.5) { return this.next() < chance; }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  sample(list, n) { return this.shuffle(list).slice(0, n); }
}
