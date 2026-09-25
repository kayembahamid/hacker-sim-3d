// Tiny event bus. Everything in the game talks through this.
// Scenario JSON names the same event strings, so content can react without code.
export class Bus {
  constructor() { this.map = new Map(); this.trace = []; }

  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  off(type, fn) {
    const set = this.map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload = {}) {
    this.trace.push({ type, payload, t: Date.now() });
    if (this.trace.length > 4000) this.trace.shift();
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) fn(payload, type);
    const wild = this.map.get('*');
    if (wild) for (const fn of [...wild]) fn(payload, type);
  }

  clear() { this.map.clear(); }
}

export const bus = new Bus();
