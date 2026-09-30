// Builds the Developer Track scenarios (Application Security, API Security,
// Git, Cloud) from compact specs, so all 25 share one shape:
//
//   1. Exploit: read the code, then reproduce the bug on the Workbench
//   2. Fix:     pick the right changes (some bypassable, some beside the point)
//   3. Verify:  re-run the exploit, and check normal use still works
//
//   node tools/dev-drills/gen.mjs
//
// Writes content/office/scenarios/5xx..8xx-<slug>.json. Edit the specs in this
// folder and run it again; do not edit the JSON by hand.
import { writeFile } from 'node:fs/promises';
import { appsec } from './appsec.mjs';
import { api } from './api.mjs';
import { git } from './git.mjs';
// The Cloud specs are optional, so the rest can be built without them.
const cloud = await import('./cloud.mjs').then((m) => m.cloud).catch(() => []);

const POINTS = { find: 15, fix: 35, verify: 15, read: 6, normal: 4, regress: 4 };
const MAX = Object.values(POINTS).reduce((a, b) => a + b, 0);
const ORDER = { 'application-security': 500, 'api-security': 600, 'git-security': 700, 'cloud-security': 800 };

function build(s, i) {
  const order = ORDER[s.track] + s.n;
  const bench = {
    id: s.slug, title: s.app, sub: s.sub, files: s.files, intro: s.intro, attempts: s.attempts,
    fix: { prompt: s.fixPrompt, options: s.options }, found: false, decided: false, fixed: false, picks: [], last: null
  };
  const c = s.cards;
  // Where the walkthrough's pointer sends the player on the Workbench.
  const hit = (s.attempts.find((a) => a.exploits) || s.attempts[0]).id;
  const tab = (n) => `.app-bench .ox-tab:nth-child(${n})`;
  const point = (sel, label) => [{ device: 'desktop', app: 'bench', sel, label }];
  return {
    id: s.slug, order, title: s.title, kind: s.kind, track: s.track, pool: false, level: s.level, minutes: s.minutes,
    maxPoints: MAX, startsAt: 990 + i * 3,
    brief: s.brief, role: s.role || 'Platform engineer, reviewing a change on the Veltrix engineering team',
    insight: s.insight, teaches: s.teaches,
    setup: [
      { do: 'world.set', path: 'office.bench', value: bench },
      { do: 'desktop.open', app: 'bench' },
      { do: 'room.banner', title: 'Workbench', body: s.banner || s.title, icon: 'code', object: 'computer', action: 'Open' }
    ],
    bonuses: [
      { id: 'b-read', when: { event: 'bench:fileViewed', match: { vulnerable: true } }, outcome: { points: POINTS.read, verdict: 'careful', label: 'Read the vulnerable code first', what: 'Reading the code before attacking it tells you where to look, and why it fails.', ideal: 'reads the code under review before trying to break it.' } },
      { id: 'b-normal', when: { event: 'bench:attempt', match: { exploited: false } }, outcome: { points: POINTS.normal, verdict: 'careful', label: 'Tried normal use first', what: 'Knowing what a good request looks like is how you spot a bad one.', ideal: 'establishes normal behaviour before testing the abnormal.' } },
      { id: 'b-regress', when: { event: 'bench:retest', match: { exploit: false, fixed: true } }, outcome: { points: POINTS.regress, verdict: 'careful', label: 'Checked normal use still works', what: 'A fix that breaks real users gets reverted, and the bug comes back.', ideal: 'tests that the fix did not break normal use.' } }
    ],
    guards: [],
    start: 'exploit',
    stages: {
      exploit: {
        objective: 'Reproduce the bug: read the Code tab, then use the Exploit tab on staging.',
        target: 'computer', decision: true, insight: s.insight,
        points: point([`.bn-attempt[data-attempt="${hit}"]`, tab(2)], ['Send this request: it breaks it', 'Open the Exploit tab']),
        hint: { text: 'Open the Workbench. Read the code, try normal use on the Exploit tab, then send the request that breaks it.' },
        on: [{
          when: { event: 'bench:attempt', match: { exploited: true } },
          outcome: {
            points: POINTS.find, verdict: 'careful', label: 'Reproduced the bug', what: c.x.b[0], ideal: 'proves a bug is real before fixing it.',
            card: { title: c.x.t, kicker: s.kind, body: c.x.b, ideal: 'reproduces a bug first, so the fix can be proved to work.' }
          },
          go: 'fix'
        }]
      },
      fix: {
        objective: 'Fix it: pick the changes on the Fix tab that close the hole for good, then apply the patch.',
        target: 'computer', decision: true,
        points: point(['.bn-apply:not([disabled])', '.bn-fix .cs-options', tab(3)], ['Picked everything that fixes it? Apply the patch', 'Pick every change that fixes the cause', 'Open the Fix tab']),
        hint: { text: 'Pick every change that removes the cause. Avoid changes an attacker can walk around, and ones that do not touch the problem. Then Apply the patch.' },
        on: [
          {
            when: { event: 'bench:fixApplied', match: { ok: true } },
            outcome: {
              points: POINTS.fix, verdict: 'safe', label: 'Applied a real fix', what: c.f.b[0], ideal: 'fixes the cause, not the symptom.',
              card: { title: c.f.t, kicker: s.kind, body: c.f.b, ideal: 'fixes the cause with the standard control, and adds defence in depth.' }
            },
            go: 'verify'
          },
          {
            when: { event: 'bench:fixApplied', match: { bad: { includes: 'weak' } } },
            outcome: {
              points: -25, verdict: 'unsafe', label: 'Applied a fix that can be bypassed', what: c.w.b[0], ideal: 'fixes the cause instead of blocking one payload or hiding the symptom.',
              card: { title: c.w.t, kicker: s.kind, body: c.w.b, ideal: 'fixes the cause, and knows why a blocklist or a hidden field is not a fix.', rewindLabel: 'Rewind to the Fix tab' }
            },
            go: 'verify'
          },
          {
            when: { event: 'bench:fixApplied' },
            outcome: {
              points: -5, verdict: 'risky', label: 'Applied a patch that was not enough', what: 'The patch missed part of the fix, or added a change that does not address the problem.', ideal: 'closes the hole completely.',
              card: { title: 'Not enough', kicker: s.kind, body: ['The patch missed something that has to change, or included a change that does nothing for this bug. Open the Fix tab to see which options were right, missed, or wrong, and why.', 'A partial fix is the most dangerous kind: everyone assumes it is closed.'], ideal: 'closes the hole completely.', rewindLabel: 'Rewind to the Fix tab' }
            },
            go: 'verify'
          }
        ]
      },
      verify: {
        objective: 'Prove it: re-run the exploit on the Exploit tab, then check normal use still works.',
        target: 'computer', decision: true,
        points: point([`.bn-attempt[data-attempt="${hit}"]`, tab(2)], ['Send the exploit again: it should be blocked', 'Open the Exploit tab']),
        hint: { text: 'On the Exploit tab, send the exploit again. It should be blocked. Then send the normal request to check nothing broke.' },
        on: [
          {
            when: { event: 'bench:retest', match: { blocked: true } },
            outcome: {
              points: POINTS.verify, verdict: 'safe', label: 'Proved the exploit is blocked', what: 'The same request that worked before now fails, and normal use still works.', ideal: 'verifies a fix by re-running the exploit.',
              card: { title: 'Fixed, and proved', kicker: s.kind, body: c.v ? c.v.b : ['You re-ran the exact request that broke it, and it is blocked. A fix you have not tested against the exploit is a hope, not a fix.', 'Add the exploit as an automated test so nobody can quietly bring the bug back.'], ideal: 'turns the exploit into a regression test.' }
            },
            go: 'done'
          },
          {
            when: { event: 'bench:retest', match: { exploit: true, blocked: false } },
            outcome: {
              points: 0, verdict: 'risky', label: 'The exploit still works', what: 'The patch did not close the hole. The same kind of request still gets through.', ideal: 'never ships a fix without re-running the exploit.', rewind: false,
              card: { title: 'Still open', kicker: s.kind, body: ['The exploit still works after your patch. This is what happens when a fix blocks one payload, or hides a symptom, instead of removing the cause.', 'Go back over the Fix tab: it shows which options were right, and why the others fail.'], ideal: 'verifies with the exploit before calling it fixed.', rewind: false }
            },
            go: 'done'
          }
        ]
      },
      done: { end: true }
    }
  };
}

const all = [...appsec, ...api, ...git, ...cloud];
let i = 0;
for (const s of all) {
  const scen = build(s, i++);
  const file = `content/office/scenarios/${scen.order}-${s.slug}.json`;
  await writeFile(file, JSON.stringify(scen, null, 2) + '\n');
}
console.log(`wrote ${all.length} developer drills, ${MAX} points each`);
