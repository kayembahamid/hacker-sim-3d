import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { format } from '../../../engine/core/clock.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// The Git client and the API console: a secret committed to a repository, and
// the console where you prove it still works and switch it off.
//
// Events: git:commitViewed { repo, commit, hasSecret }, git:secretReported
// { repo, commit }, api:tokenTested { id, live }, api:tokenRevoked { id }.
export function makeGitApp() {
  const app = {
    id: 'git', title: 'Git', icon: 'git', colour: 'linear-gradient(160deg,#f0883e,#b8561c)', w: 1000, h: 600, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-git' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('git');
      const repos = ctx.world.office.git.repos;
      if (!changed(node, [repos, x])) return;
      if (!repos.length) { node.append(head('Git', 'git.veltrix-logistics.com'), empty('No repositories cloned on this computer.')); return; }
      const repo = repos.find((r) => r.id === x.repo) || repos[0];
      const commit = repo.commits.find((c) => c.id === x.commit);
      node.append(
        head(`${repo.name}`, `git.veltrix-logistics.com/${repo.path} · branch ${repo.branch}`, repo.reported ? [badge('Secret reported', 'good')] : []),
        el('div', { class: 'ox-split gt-split' }, [
          el('ul', { class: 'ox-list' }, repo.commits.map((c) => el('li', {}, [el('button', {
            class: `ox-row ${commit && commit.id === c.id ? 'is-on' : ''}`, type: 'button', dataset: { commit: c.id },
            onclick: () => {
              ctx.setExtra('git', { repo: repo.id, commit: c.id });
              bus.emit('git:commitViewed', { repo: repo.id, commit: c.id, hasSecret: c.files.some((f) => f.diff.some((d) => d.secret)) });
            }
          }, [el('span', { class: 'ox-row-main' }, [el('b', { class: 'mono', text: `${c.id.slice(0, 7)} ${c.msg}` }), el('small', { text: `${c.author} · ${c.when}` })])])]))),
          commit ? el('div', { class: 'ox-detail gt-diff' }, [
            ...commit.files.map((f) => el('div', { class: 'gt-file' }, [
              el('b', { class: 'mono', text: f.path }),
              el('pre', { class: 'mono gt-lines' }, f.diff.map((d) => el('span', { class: `gt-line is-${d.t === '+' ? 'add' : d.t === '-' ? 'del' : 'ctx'} ${d.secret ? 'is-secret' : ''}`, text: `${d.t} ${d.line}\n` })))
            ])),
            commit.files.some((f) => f.diff.some((d) => d.secret)) && !repo.reported ? btn('Report exposed secret to IT', () => {
              office(ctx, (o) => { const r = o.git.repos.find((q) => q.id === repo.id); if (r) r.reported = true; }, 'git-report');
              bus.emit('git:secretReported', { repo: repo.id, commit: commit.id });
              ctx.toast({ app: 'git', title: 'Reported', body: 'The service desk will rotate the key. Revoke it now in the API console if you can.' });
            }, { warn: true, ic: 'flag' }) : null
          ].filter(Boolean)) : el('div', { class: 'ox-detail is-empty' }, [el('p', { text: 'Pick a commit to see what changed.' })])
        ])
      );
    }
  };
  return app;
}

export function makeApiApp() {
  const app = {
    id: 'api', title: 'API console', icon: 'api', colour: 'linear-gradient(160deg,#9aa7b8,#56637a)', w: 960, h: 580, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-api' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const api = ctx.world.office.api;
      if (!changed(node, api)) return;
      node.append(
        head('API console', 'api.veltrix-logistics.com · tokens you manage'),
        api.tokens.length ? el('ul', { class: 'ox-cards' }, api.tokens.map((t) => el('li', { class: `ox-card ${t.live && t.exposed ? 'is-bad' : ''}`, dataset: { token: t.id } }, [
          el('span', { class: 'ox-row-main' }, [el('b', { text: t.name }), el('small', { class: 'mono', text: `${t.prefix}… · owner ${t.owner} · ${t.scopes.join(', ')}` }), el('small', { text: t.live ? 'Active' : 'Revoked' })]),
          el('div', { class: 'ox-actions' }, [
            btn('Test with whoami', () => test(ctx, t), { ic: 'play' }),
            t.live ? btn('Revoke token', () => {
              office(ctx, (o) => { const x = o.api.tokens.find((q) => q.id === t.id); if (x) x.live = false; }, 'api-revoke');
              bus.emit('api:tokenRevoked', { id: t.id, exposed: !!t.exposed });
            }, { warn: true }) : badge('Revoked', 'good')
          ])
        ]))) : el('p', { class: 'app-empty', text: 'No tokens.' }),
        api.log.length ? el('div', { class: 'api-log' }, api.log.map((l) => el('pre', { class: 'mono', text: l }))) : null
      );
    }
  };

  function test(ctx, t) {
    const at = format(ctx.world.clock.minutes);
    const res = t.live
      ? `HTTP/2 200\n{ "token": "${t.prefix}…", "owner": "${t.owner}", "scopes": ${JSON.stringify(t.scopes)} }`
      : 'HTTP/2 401\n{ "error": "token_revoked" }';
    office(ctx, (o) => { o.api.log.unshift(`${at}  GET https://api.veltrix-logistics.com/v1/whoami\nAuthorization: Bearer ${t.prefix}…\n\n${res}`); }, 'api-test');
    bus.emit('api:tokenTested', { id: t.id, live: !!t.live, exposed: !!t.exposed });
  }

  return app;
}
