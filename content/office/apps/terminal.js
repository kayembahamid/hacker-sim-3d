import { el, clear } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';

// A simulated shell. There is no real shell here and nothing is evaluated:
// a line is split into a pipeline of known commands, and each one is answered
// from the scenario's data (world.office.terminal): the files under /var/log,
// DNS records, registration dates, certificates and response headers.
//
// Commands: help whoami hostname pwd ls cd cat head tail grep wc sort uniq cut
// awk echo date history clear ps netstat dig nslookup whois curl openssl.
// Pipes work (grep ... | wc -l). Quotes work.
//
// Events: terminal:command { command, cmd, hits, output }.

const HOME = '/home/s.rivera';
const HOST = 'VLX-PC-4471';

// ------------------------------------------------------------------ parsing
export function words(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let any = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) { out.push(cur); cur = ''; any = false; } continue; }
    cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

function splitPipes(line) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (const ch of line) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
    if (ch === '"' || ch === '\'') { quote = ch; cur += ch; continue; }
    if (ch === '|') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function resolve(cwd, p) {
  if (!p) return cwd;
  if (p === '~') return HOME;
  let path = p.startsWith('/') ? p : p.startsWith('~/') ? `${HOME}/${p.slice(2)}` : `${cwd}/${p}`;
  const parts = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return `/${parts.join('/')}`;
}

function dirOf(files, path) {
  const prefix = path === '/' ? '/' : `${path}/`;
  const names = new Set();
  for (const f of Object.keys(files)) {
    if (!f.startsWith(prefix)) continue;
    names.add(f.slice(prefix.length).split('/')[0] + (f.slice(prefix.length).includes('/') ? '/' : ''));
  }
  return [...names].sort();
}

// ------------------------------------------------------------------ commands
function flags(args) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' && args[i + 1] !== undefined) { opts.n = Number(args[++i]); continue; }
    if (/^-n\d+$/.test(a)) { opts.n = Number(a.slice(2)); continue; }
    if (a === '-d' && args[i + 1] !== undefined) { opts.d = args[++i]; continue; }
    if (a === '-f' && args[i + 1] !== undefined) { opts.f = args[++i]; continue; }
    if (/^-d./.test(a)) { opts.d = a.slice(2); continue; }
    if (/^-f\d/.test(a)) { opts.f = a.slice(2); continue; }
    if (/^-[a-zA-Z]+$/.test(a)) { for (const c of a.slice(1)) opts[c] = true; continue; }
    rest.push(a);
  }
  return { opts, rest };
}

function run(cmdline, input, env) {
  const argv = words(cmdline);
  const cmd = argv[0];
  const args = argv.slice(1);
  const { files, net } = env.data;
  const read = (p) => {
    const path = resolve(env.cwd, p);
    if (files[path] !== undefined) return files[path];
    if (dirOf(files, path).length) throw new Error(`${cmd}: ${p}: Is a directory`);
    throw new Error(`${cmd}: ${p}: No such file or directory`);
  };
  const source = (rest) => (rest.length ? rest.flatMap((p) => read(p)) : input || []);

  switch (cmd) {
    case 'help': return [
      'Commands you can run here:',
      '  ls, cd, pwd, cat, head, tail, grep, wc, sort, uniq, cut, awk, history, clear',
      '  whoami, hostname, date, ps, netstat',
      '  dig, nslookup, whois, curl -I, openssl s_client -connect host:443',
      'Logs are in /var/log. Pipes work: grep something /var/log/proxy.log | wc -l'
    ];
    case 'whoami': return ['s.rivera'];
    case 'hostname': return [HOST];
    case 'pwd': return [env.cwd];
    case 'date': return ['Thu 24 Sep 2026 ' + env.time + ':00 BST'];
    case 'echo': return [args.join(' ')];
    case 'clear': env.clear = true; return [];
    case 'history': return env.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`);
    case 'cd': {
      const path = resolve(env.cwd, args[0] || '~');
      if (!dirOf(files, path).length && path !== HOME) throw new Error(`cd: ${args[0]}: No such file or directory`);
      env.cwd = path;
      return [];
    }
    case 'ls': {
      const { rest, opts } = flags(args);
      const path = resolve(env.cwd, rest[0] || '.');
      if (files[path] !== undefined) return [rest[0]];
      const list = dirOf(files, path);
      if (!list.length) throw new Error(`ls: cannot access '${rest[0] || '.'}': No such file or directory`);
      if (opts.l) return list.map((n) => `${n.endsWith('/') ? 'drwxr-xr-x' : '-rw-r-----'} 1 root adm ${String((files[`${path === '/' ? '' : path}/${n}`] || []).length * 96).padStart(7)} Sep 24 16:30 ${n}`);
      return [list.join('  ')];
    }
    case 'cat': return source(args);
    case 'head': case 'tail': {
      const { opts, rest } = flags(args);
      const lines = source(rest);
      const n = opts.n || 10;
      return cmd === 'head' ? lines.slice(0, n) : lines.slice(-n);
    }
    case 'grep': {
      const { opts, rest } = flags(args);
      const pattern = rest[0];
      if (pattern === undefined) throw new Error('usage: grep [-i] [-v] [-c] pattern [file...]');
      const lines = source(rest.slice(1));
      // Fixed string matching, like grep -F: what people expect when they
      // search logs for a domain or a user name.
      const needle = opts.i ? pattern.toLowerCase() : pattern;
      const test = (l) => (opts.i ? l.toLowerCase() : l).includes(needle);
      const hits = lines.filter((l) => (opts.v ? !test(l) : test(l)));
      return opts.c ? [String(hits.length)] : hits;
    }
    case 'wc': {
      const { opts, rest } = flags(args);
      const lines = source(rest);
      if (opts.l) return [String(lines.length)];
      return [`${lines.length} ${lines.join(' ').split(/\s+/).filter(Boolean).length} ${lines.join('\n').length}`];
    }
    case 'sort': {
      const { opts, rest } = flags(args);
      const lines = [...source(rest)].sort();
      return opts.r ? lines.reverse() : lines;
    }
    case 'uniq': {
      const { opts, rest } = flags(args);
      const lines = source(rest);
      const out = [];
      for (const l of lines) {
        const last = out[out.length - 1];
        if (last && last.line === l) last.n++; else out.push({ line: l, n: 1 });
      }
      return out.map((o) => (opts.c ? `${String(o.n).padStart(7)} ${o.line}` : o.line));
    }
    case 'cut': {
      const { opts, rest } = flags(args);
      const d = opts.d ?? '\t';
      const f = Number(opts.f || 1);
      return source(rest).map((l) => l.split(d)[f - 1] ?? '');
    }
    case 'awk': {
      const prog = args[0] || '';
      const m = prog.match(/\{\s*print\s+\$(\d+)(?:\s*,\s*\$(\d+))?\s*\}/);
      if (!m) throw new Error("awk: only '{print $N}' and '{print $N, $M}' are supported here");
      return source(args.slice(1)).map((l) => {
        const f = l.trim().split(/\s+/);
        return [f[Number(m[1]) - 1], m[2] ? f[Number(m[2]) - 1] : null].filter((v) => v !== null).join(' ');
      });
    }
    case 'ps': return ['  PID TTY          TIME CMD', ' 2210 pts/0    00:00:00 bash', ' 2291 pts/0    00:00:00 ps'];
    case 'netstat': return [
      'Active Internet connections (w/o servers)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State',
      'tcp        0      0 10.20.3.71:52114        198.51.100.10:443       ESTABLISHED',
      'tcp        0      0 10.20.3.71:52180        198.51.100.12:993       ESTABLISHED'
    ];
    case 'dig': case 'nslookup': {
      const host = args.filter((a) => !a.startsWith('+') && !a.startsWith('-'))[0];
      if (!host) throw new Error(`usage: ${cmd} host`);
      const rec = net[host.toLowerCase()] || null;
      if (cmd === 'nslookup') return rec ? ['Server:  10.20.0.2', `Name:    ${host}`, `Address: ${rec.a}`] : ['Server:  10.20.0.2', `** server can't find ${host}: NXDOMAIN`];
      return rec
        ? [`; <<>> DiG <<>> ${host}`, ';; ANSWER SECTION:', `${host}.  300  IN  A  ${rec.a}`, ...(rec.mx ? [`${host}.  300  IN  MX  10 ${rec.mx}.`] : []), `;; Query time: 18 msec`]
        : [`; <<>> DiG <<>> ${host}`, ';; status: NXDOMAIN'];
    }
    case 'whois': {
      const host = (args[0] || '').toLowerCase();
      const rec = net[host] || net[host.split('.').slice(-2).join('.')] || null;
      if (!rec) return [`No match for "${host.toUpperCase()}".`];
      return [
        `Domain Name: ${host.toUpperCase()}`,
        `Registrar: ${rec.registrar || 'Unknown'}`,
        `Creation Date: ${rec.created}`,
        `Registrant Organization: ${rec.org || 'REDACTED FOR PRIVACY'}`,
        `Registrant Country: ${rec.country || 'REDACTED'}`,
        `Name Server: ${(rec.ns || ['ns1.example-dns.net']).join(', ')}`
      ];
    }
    case 'curl': {
      const url = args.find((a) => !a.startsWith('-'));
      if (!url) throw new Error('usage: curl -I https://host/');
      let host;
      try { host = new URL(url.includes('://') ? url : `https://${url}`).hostname; } catch { throw new Error(`curl: (3) URL rejected: ${url}`); }
      const rec = net[host];
      if (!rec) throw new Error(`curl: (6) Could not resolve host: ${host}`);
      const h = rec.http || {};
      return [`HTTP/2 ${h.status || 200}`, `server: ${h.server || 'nginx'}`, `date: Thu, 24 Sep 2026 ${env.time}:00 GMT`, `content-type: text/html`, ...(h.extra || [])];
    }
    case 'openssl': {
      const target = args[args.indexOf('-connect') + 1];
      if (args[0] !== 's_client' || !target) throw new Error('usage: openssl s_client -connect host:443');
      const host = target.split(':')[0];
      const rec = net[host];
      if (!rec) throw new Error(`connect: No such host ${host}`);
      const c = rec.cert || {};
      return ['CONNECTED(00000003)', `depth=0 CN = ${c.cn || host}`, 'Certificate chain', ` 0 s:CN = ${c.cn || host}${c.o ? `, O = ${c.o}` : ''}`, `   i:CN = ${c.issuer || 'Unknown CA'}`, `   v:NotBefore: ${c.from || 'unknown'}; NotAfter: ${c.to || 'unknown'}`, '---', `Verify return code: ${c.ok === false ? '10 (certificate has expired)' : '0 (ok)'}`];
    }
    case undefined: return [];
    default: throw new Error(`${cmd}: command not found. Type help for what works here.`);
  }
}

export function execute(line, env) {
  const segments = splitPipes(line);
  let out = null;
  for (const seg of segments) out = run(seg, out, env);
  return out || [];
}

// ---------------------------------------------------------------------- app
export function makeTerminalApp() {
  const app = {
    id: 'terminal', title: 'Terminal', icon: 'terminal', colour: 'linear-gradient(160deg,#2b3339,#0f1417)', w: 900, h: 560, pinned: true,
    mount(ctx) {
      const node = el('div', { class: 'app-terminal' });
      const out = el('div', { class: 'tm-out', role: 'log', 'aria-live': 'polite' });
      const input = el('input', { class: 'tm-input mono', type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Command' });
      const prompt = el('span', { class: 'tm-prompt mono' });
      const suggest = el('div', { class: 'tm-suggest' });
      const form = el('form', { class: 'tm-line', onsubmit: (ev) => { ev.preventDefault(); submit(input.value); input.value = ''; } }, [prompt, input]);
      node.append(out, form, suggest);
      node.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('button')) setTimeout(() => input.focus(), 0); });
      let recall = -1;
      input.addEventListener('keydown', (ev) => {
        const hist = ctx.os.world.office.terminal.history;
        if (ev.key === 'ArrowUp') { ev.preventDefault(); recall = Math.min(hist.length - 1, recall + 1); input.value = hist[hist.length - 1 - recall]?.cmd || ''; }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); recall = Math.max(-1, recall - 1); input.value = recall < 0 ? '' : hist[hist.length - 1 - recall]?.cmd || ''; }
        if (ev.key.length === 1) audio.play('type');
      });

      function submit(line) {
        recall = -1;
        const cmdline = line.trim();
        const world = ctx.os.world;
        const t = world.office.terminal;
        const env = { cwd: t.cwd || HOME, data: { files: t.files || {}, net: t.net || {} }, history: t.history.map((h) => h.cmd), time: fmt(world.clock.minutes) };
        let lines;
        let error = false;
        try { lines = cmdline ? execute(cmdline, env) : []; } catch (err) { lines = [err.message]; error = true; }
        ctx.store.update((s) => {
          const tt = s.office.terminal;
          tt.cwd = env.cwd;
          if (env.clear) tt.history = tt.history.map((h) => ({ ...h, cleared: true }));
          if (cmdline) tt.history.push({ cmd: cmdline, out: lines.slice(0, 400), error, cwd: env.cwd });
        }, 'terminal');
        if (cmdline) bus.emit('terminal:command', { command: cmdline, cmd: words(cmdline)[0] || '', hits: error ? 0 : lines.length, output: lines.slice(0, 6).join('\n'), error });
      }
      app.parts = { out, prompt, suggest, submit };
      app.update(ctx, node);
      return node;
    },
    update(ctx, node) {
      const t = ctx.world.office.terminal;
      const key = JSON.stringify([t.history.length, t.cwd, (t.suggest || []).length, t.history.filter((h) => h.cleared).length]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      const { out, prompt, suggest, submit } = app.parts;
      clear(out);
      out.append(el('p', { class: 'tm-dim', text: `Veltrix Linux 6.8 (${HOST}). Logs you can read are in /var/log. Type help.` }));
      for (const h of t.history) {
        if (h.cleared) continue;
        out.append(el('p', { class: 'tm-cmd mono' }, [el('span', { class: 'tm-ps1', text: ps1(h.cwd) }), h.cmd]));
        if (h.out.length) out.append(el('pre', { class: `tm-res mono ${h.error ? 'is-error' : ''}`, text: h.out.join('\n') }));
      }
      prompt.textContent = ps1(t.cwd || HOME);
      clear(suggest);
      const tips = t.suggest || ['help', 'ls /var/log', 'tail -n 5 /var/log/proxy.log'];
      suggest.append(el('small', { text: 'Try:' }), ...tips.map((s) => el('button', { class: 'tm-chip mono', type: 'button', onclick: () => submit(s) }, [s])));
      requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; });
    }
  };
  const ps1 = (cwd) => `s.rivera@${HOST}:${(cwd || HOME).replace(HOME, '~')}$ `;
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return app;
}
