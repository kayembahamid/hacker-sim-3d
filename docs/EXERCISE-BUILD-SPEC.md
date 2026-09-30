# Hamcodes Labs — Exercise Build Spec

A build brief for the 62 training drills listed in the Labs catalogue
(labs.hamcodes.com) that are not yet playable. Each one needs building as a
scenario in the 3D sim so its "Play exercise" button opens a real drill.

This file is written to be pasted into a fresh chat as the prompt. Build the
scenarios in batches, keep to the rules below, and when a batch is ready send
back the list of `slug -> scenario id` so the Labs catalogue can deep-link them.

---

## How the deep-link works (do this and linking is automatic)

The Labs catalogue opens a drill at:

    https://hacker.hamcodes.com/sim/?scenario=<id>

The sim reads `?scenario=<id>` at boot (engine/app.js) and plays only that
scenario. **So name each new scenario's `id` field EXACTLY the Labs slug given
below.** Do that and the link works with no further change. (The 9 already-built
drills use the office sim's own ids and are already wired; see the mapping at
the end. New builds should prefer id = slug.)

When a batch is done, reply with lines like:

    gift-card-request  -> built, id: gift-card-request
    reply-chain-phishing -> built, id: reply-chain-phishing

and Labs will flip those tiles from "In build" to "Play now".

---

## The engine and scenario format

Build each scenario as a JSON file in the same shape as the existing ones in
`content/office/scenarios/*.json` (read `01-vendor-bank-change.json` and
`04-invoice-attachment.json` as templates). Top-level keys:

- `id` (= the Labs slug), `order`, `title`, `kind` (short label like
  "Business email compromise"), `maxPoints`, `brief`, `insight`, `teaches` (array)
- `vars` — randomised values (pick / lookalike / byDifficulty / int) so a
  replay is not identical
- `setup` — actions that seed the room (deliver a mail/chat/sms, drop a room
  banner, notify an app)
- `bonuses` — careful habits that score even when they do not change the story
- `guards` / `globalGuards` — risky actions that always have a consequence
- `start` — the first stage id
- `stages` — a map of stages. Each stage: `objective`, `target` (the object to
  glow/fly to), `decision: true` on the choice moment, `insight`, `hint`,
  and `on` (rules: `{ when: {event, match}, outcome: {points, verdict, label,
  what, ideal, card}, effects, go }`). A rule with a `card` shows a card and
  its own Continue; a silent `go` (no card) ends on the Next button.

Difficulty modes already exist (training / assessment / expert): markers and
rewinds on training, none on assessment/expert. Do not rebuild that; the
engine handles it. Aim `maxPoints` so a full careful path is about 3 stars.

## Global rules (non-negotiable)

- **Every company, person, domain, product and bank is fictional.** No real
  brand names. Reuse the existing fictional universe where it fits (Veltrix
  Logistics, Ferrum Steel, Kestrel, CypherPeak, etc.) or invent new ones, and
  run `npm run check:domains` so no address resolves to a real site.
- **No em dashes** in any visible text. Commas, colons, full stops only.
- **Every phishing page, fake login and attachment is inert**: it submits
  nothing, runs nothing, and is not reachable as a standalone URL. It is a
  rehearsal.
- Nothing leaves the browser. Progress is localStorage only.
- Keep the tone and length of the existing office scenarios: short, plain,
  workday-real.

## Environments (which engine each domain needs)

1. **Office room (exists today).** Security Awareness, Privacy & Compliance,
   Real-World Incidents, and most of AI & LLM Security fit the current
   first-person office scene (phone, computer with mail/chat/browser/files,
   desk phone, intercom, door, USB). Build these first: they reuse everything.
2. **AI cases** mostly happen at the computer: an assistant app, a browser
   extension, a chat window. Add those as computer apps rather than new rooms.
3. **Developer Track (AppSec, API, Git, Cloud) needs a new "workstation" mode.**
   These are not social-engineering room drills; they are exploit-then-fix
   exercises like a code review: a browser tab plus a code editor plus a
   terminal, where the player triggers the bug then writes or picks the fix.
   This is a separate interaction model from the room engine. Flag it and
   design a lightweight workstation scene (or a 2D console overlay) before
   building the 33 developer drills. They can come after domains 1 to 4.

---

## ALREADY BUILT (9) — do not rebuild

These 9 Labs slugs already deep-link to existing office scenarios:

| Labs slug | plays office scenario id |
|---|---|
| (flagship) night-shift-at-veltrix | full game (no scenario param) |
| read-the-sender | shared-document |
| bank-detail-switch | vendor-bank-change |
| vishing-support-desk | ceo-calls |
| usb-in-the-car-park | after-hours |
| mfa-fatigue | push-storm |
| helpdesk-reset | already-happened |
| invoice-attachment-incident | invoice-attachment |
| agent-permissions | helpful-assistant |

Optional later: rename these scenarios' ids to the Labs slug so the mapping is
1:1, but not required.

---

# TO BUILD (62)

Format per drill: **`slug`** — Title (Level, minutes) [framework tags]
Premise, then the safe move the drill should reward.

## 1. Security Awareness  (office room)  — 18 drills

### Phishing & impersonation
- **`gift-card-request`** — Gift cards for the boss (Foundational, 6m) [ATT&CK T1566, NIST PR.AT]
  A short, urgent message from a manager asks you to buy gift cards quietly.
  Reward: spotting the BEC pattern (urgency, secrecy, off-channel, gift cards) and verifying with the real manager before buying anything.
- **`reply-chain-phishing`** — Double barrel: the call before the click (Core, 7m) [ATT&CK T1566, NIST PR.AT]
  A friendly phone call warns you an email is coming, so you trust it when it lands.
  Reward: treating the pre-call as a red flag, checking the email on its own merits, not acting because a voice primed you.
- **`spear-phishing`** — Spear phishing from your own profile (Core, 7m) [ATT&CK T1566.001, T1598]
  A message built from details only a colleague should know, scraped from public posts.
  Reward: noticing that "knows things about me" is not proof of identity; verifying through a known channel.
- **`callback-phishing`** — Callback phishing (Core, 7m) [ATT&CK T1598, NIST PR.AT]
  A receipt for something you never bought, with a number to call to cancel. The link is the phone number.
  Reward: not dialling the number in the message; going to the real vendor's site/number instead.
- **`qr-phishing`** — QR code phishing / quishing (Foundational, 5m) [ATT&CK T1566.002, CIS 14]
  A poster or email asks you to scan a code that skips every email filter.
  Reward: treating a QR code like any other link, previewing the URL, not scanning unknown codes.

### Voice, text & chat
- **`smishing-package`** — Smishing: the package that never came (Foundational, 5m) [ATT&CK T1660, NIST PR.AT]
  A text says a delivery is stuck and a small fee will release it.
  Reward: reading the link not the panic, going to the courier's real site, never paying a "release fee" by text.
- **`chat-impersonation`** — Your boss on the chat app (Core, 6m) [ATT&CK T1585, NIST PR.AT]
  A new number messages you as the CEO, urgent and off the usual channel.
  Reward: moving it back to a trusted channel and confirming before acting.
- **`whaling-deepfake`** — Whaling with a deepfake (Advanced, 8m) [ATT&CK T1656, NIST PR.AT]
  A finance approval comes from a face and voice you know, live on a call.
  Reward: the call-back rule (hang up, call the known number), spotting deepfake tells, not approving on the call.

### Ransomware & malware
- **`ransomware-first-ten-minutes`** — Ransomware in the first ten minutes (Core, 9m) [ATT&CK T1486, NIST RS.MI, ISO A.5.24]
  A shared drive is encrypting file by file.
  Reward: recognising the early signs, disconnecting the right way (network, not power), raising it fast.
- **`malicious-attachment`** — The attachment that runs (Core, 7m) [ATT&CK T1204, T1566.001]
  A routine invoice with a document that wants you to enable content/macros.
  Reward: not enabling content, checking the sender and file properties, reporting.
- **`tech-support-scam`** — The tech support scam (Foundational, 6m) [ATT&CK T1656, CIS 14]
  A full-screen warning says your machine is infected and to call now.
  Reward: recognising the warning IS the attack, closing it, not calling, reporting.

### Passwords & accounts
- **`account-recovery`** — Account recovery, the back door (Core, 7m) [ATT&CK T1098, NIST PR.AA]
  An attacker resets rather than guesses.
  Reward: locking down recovery email/phone/questions, turning on 2-step, reviewing recovery options.
- **`password-reuse`** — One password, everywhere (Foundational, 5m) [ATT&CK T1110.004, CIS 5]
  A breach at one site becomes a break-in at yours.
  Reward: seeing credential stuffing work, then setting up a manager and passkeys.

### Device & physical security
- **`tailgating-side-door`** — Tailgating through the side door (Foundational, 6m) [ATT&CK T1200, ISO A.7]
  A courier with full hands asks you to hold the door.
  Reward: the polite, firm habit of not letting an unbadged stranger in.
- **`unlocked-workstation`** — The unlocked workstation (Foundational, 4m) [ATT&CK T1078, CIS 4]
  You step away and leave the screen open.
  Reward: seeing what a visitor/insider can do in that window, building the lock habit (Win+L).

### Web, Wi-Fi & reporting
- **`public-wifi-hygiene`** — Working from the coffee shop (Foundational, 6m) [ATT&CK T1557, CIS 12]
  Open wifi, a shoulder near your screen, a login page that looks off.
  Reward: using a VPN, a privacy screen, checking the address bar before typing a password.
- **`https-safety`** — The lock icon is not enough (Foundational, 5m) [ATT&CK T1566.002, NIST PR.AT]
  The padlock means private, not honest.
  Reward: reading the real domain in the address bar, not trusting the lock alone.
- **`report-fast`** — Report it in the first minute (Foundational, 4m) [NIST RS.CO, ISO A.6.8]
  The fastest control is a report.
  Reward: the one action that turns a near miss into an early warning; where and how to report.

## 2. Privacy & Compliance  (office room / computer)  — 9 drills

- **`subject-access-request`** — The subject access request (Core, 8m) [GDPR Art.15, ISO 27701]
  A customer asks for everything you hold. Reward: knowing what counts, the clock, and not leaking a third party's data in the response.
- **`right-to-erasure`** — Right to be forgotten (Core, 7m) [GDPR Art.17, ISO 27701]
  An erasure request lands. Reward: what can be deleted vs kept, and why backups are not a free pass.
- **`over-shared-spreadsheet`** — The over-shared spreadsheet (Foundational, 6m) [GDPR Art.5, NIST Privacy]
  A full customer export is about to go to a colleague. Reward: data minimisation, masking fields, sharing the least that does the job.
- **`breach-72-hours`** — A breach, and the 72 hours (Core, 9m) [GDPR Art.33, NIST RS.CO]
  A laptop with personal data is gone. Reward: what makes it notifiable, who to tell, how hour one shapes the next 72.
- **`lawful-basis`** — Lawful basis in one screen (Foundational, 6m) [GDPR Art.6, Art.7]
  Marketing wants to email a list. Reward: consent vs legitimate interest, deciding if you can send at all.
- **`processor-due-diligence`** — The vendor with your data (Core, 8m) [GDPR Art.28, ISO 27701, SOC 2 CC9]
  A new SaaS tool will hold customer records. Reward: checking the processor, the DPA, and where data lives before sign-up.
- **`cross-border-transfer`** — Cross-border transfer (Advanced, 8m) [GDPR Ch.V, ISO 27701]
  Data is about to leave the region. Reward: when it is fine, when it needs safeguards, spotting a transfer hidden in a support ticket.
- **`ai-notetaker-consent`** — The AI note-taker in the meeting (Core, 7m) [EU AI Act, GDPR Art.5]
  A bot joins to transcribe. Reward: who consents, what is recorded, where the transcript goes.
- **`data-retention`** — Retention that runs itself (Foundational, 6m) [GDPR Art.5, ISO 27701]
  Old records pile up. Reward: seeing that keeping everything is the risk, and how a retention schedule protects people.

## 3. AI & LLM Security  (computer: assistant app, browser)  — 7 drills

- **`prompt-injection-email`** — The email that talks to your assistant (Advanced, 9m) [OWASP LLM01, MITRE ATLAS]
  An AI assistant summarising your inbox meets a message with instructions aimed at it. Reward: seeing indirect prompt injection, not letting the assistant act on untrusted content.
- **`chatbot-data-leak`** — What you paste into the chatbot (Core, 7m) [OWASP LLM06, GDPR Art.5]
  Source code and a customer list go into a public assistant. Reward: understanding where that data goes, using approved tools only.
- **`shadow-ai`** — Shadow AI in the browser (Core, 7m) [OWASP LLM, CIS 2]
  A free extension reads every page you open. Reward: weighing the offer against what it takes, not installing unvetted tools.
- **`hallucination-trust`** — The confident wrong answer (Foundational, 6m) [OWASP LLM09, NIST AI RMF]
  An assistant cites a policy that does not exist. Reward: checking before acting on generated text.
- **`data-poisoning`** — Poisoned training data (Advanced, 8m) [OWASP LLM03, MITRE ATLAS]
  A model learns from user uploads and someone feeds it what they want it to repeat. Reward: recognising a poisoning attempt, guarding training inputs.
- **`deepfake-call`** — The deepfake on the video call (Core, 8m) [ATT&CK T1656, NIST PR.AT]
  A finance approval from a known face and voice on a call. Reward: the tells and the call-back rule. (Note: close cousin of `whaling-deepfake`; keep one AI-framed, one awareness-framed, or merge.)
- **`secrets-in-prompt`** — Secrets in the prompt (Core, 6m) [OWASP LLM06, CWE-522]
  An API key goes into a prompt "to help". Reward: understanding the prompt is not a safe place for a secret.

## 4. Real-World Incidents  (office room, incident framing)  — 3 drills

- **`open-bucket-incident`** — The open storage bucket (Advanced, 8m) [ATT&CK T1530, CIS 3]
  Modelled on repeated cloud exposures: a public bucket spills customer records. Reward: tracing how it happened and how it is found. Fictional company.
- **`payroll-diversion-incident`** — The payroll diversion (Core, 8m) [ATT&CK T1566.002, NIST PR.AT]
  A composite BEC: an employee's salary is redirected by one email to HR. Reward: catching it in time, verifying bank-detail changes.
- **`supply-chain-incident`** — The third party that let them in (Advanced, 9m) [ATT&CK T1195, ISO A.5.19]
  Access came through a trusted supplier. Reward: seeing that vendor access is your attack surface.

## 5. Application Security  (NEW workstation mode)  — 8 drills

Each is an exploit-then-fix: trigger the bug in a browser/console, then choose
or write the correct fix. Show "the exploit" and "the fix" the way the Labs dev
track promises.

- **`sql-injection`** — SQL injection in the login (Core, 8m) [OWASP A03, CWE-89]
  A login builds its query from strings. Exploit: `' OR '1'='1`. Fix: parameterised query.
- **`stored-xss`** — Stored cross-site scripting (Core, 8m) [OWASP A03, CWE-79]
  A comment field renders raw HTML. Exploit: a script that runs in another session. Fix: output encoding + CSP.
- **`ssrf`** — Server-side request forgery (Advanced, 9m) [OWASP A10, CWE-918]
  A URL-preview feature fetches anything, including cloud metadata. Fix: allowlist, block internal ranges.
- **`broken-access-control`** — Broken access control (Core, 8m) [OWASP A01, CWE-284]
  Change the id in the URL, see another customer's order. Fix: server-side authorization on every request.
- **`hardcoded-secrets`** — Secrets in the source (Foundational, 6m) [OWASP A05, CWE-798]
  A DB password in code, in a repo. Fix: secrets manager / env, rotate the leaked one.
- **`insecure-deserialization`** — Insecure deserialization (Advanced, 9m) [OWASP A08, CWE-502]
  A cookie carries a serialized object the server trusts. Fix: never deserialize untrusted data, use safe formats.
- **`vulnerable-dependency`** — The dependency you did not read (Core, 7m) [OWASP A06, CWE-1104]
  A small package pulls in a known-vulnerable one. Fix: SCA in CI, pin and update.
- **`password-storage`** — Weak password storage (Core, 7m) [OWASP A02, CWE-916]
  Fast hash, no salt. Fix: a modern password hash (argon2/bcrypt) with per-user salt.

## 6. API Security  (NEW workstation mode)  — 6 drills

- **`bola`** — The id you can change (Core, 8m) [OWASP API1, CWE-639]
  GET /orders/1002 and 1003 both return. Fix: object-level authorization.
- **`mass-assignment`** — Mass assignment (Core, 7m) [OWASP API3, CWE-915]
  Profile update accepts `role: admin`. Fix: allowlist writable fields.
- **`no-rate-limit`** — No rate limit, no mercy (Foundational, 6m) [OWASP API4, CWE-770]
  Login answers as fast as you ask. Fix: rate limits + lockout + monitoring.
- **`over-privileged-key`** — The over-privileged key (Core, 7m) [OWASP API5, CWE-522]
  One key does everything for every tenant, shipped in a mobile app. Fix: scope, rotate, least privilege.
- **`excessive-data-exposure`** — Data the endpoint should not return (Core, 7m) [OWASP API3, CWE-213]
  The user endpoint returns hashes and internal flags. Fix: trim the response server-side.
- **`improper-inventory`** — The forgotten v1 endpoint (Advanced, 8m) [OWASP API9, ISO A.8.9]
  An old, unpatched API version is still live. Fix: inventory and retire endpoints.

## 7. Git & Repository Security  (NEW workstation mode)  — 5 drills

- **`secret-in-history`** — The key in the commit history (Core, 7m) [CWE-540, CIS SSC]
  Deleted in the next commit, still in history. Fix: rotate the secret, purge history, add scanning.
- **`malicious-pr`** — The friendly pull request (Advanced, 9m) [OWASP CICD-SEC-4, SLSA]
  A tidy first PR also edits the CI workflow. Fix: read workflow diffs, require review, gate secrets.
- **`branch-protection`** — Branch protection that means it (Foundational, 6m) [CIS SSC, NIST SSDF]
  Anyone can push to main. Fix: require review + status checks, block force-push.
- **`dependency-confusion`** — Dependency confusion (Advanced, 8m) [CWE-427, SLSA]
  An internal package name published publicly gets grabbed. Fix: scope the registry, reserve names.
- **`ci-log-leak`** — The leaked token in CI logs (Core, 7m) [CWE-532, OWASP CICD-SEC-6]
  A build prints an env var, log is public. Fix: mask secrets, restrict log access.

## 8. Cloud Security  (NEW workstation / console mode)  — 6 drills

- **`public-bucket`** — The public bucket (Foundational, 6m) [CIS 3, ATT&CK T1530]
  Public "just to test", still public a year on. Fix: block public access, review.
- **`over-permissive-iam`** — The role that can do anything (Core, 8m) [CIS 5, CWE-269]
  A wildcard permission. Fix: least privilege, scoped policy.
- **`exposed-dashboard`** — The admin console on the internet (Core, 7m) [CIS 4, ATT&CK T1133]
  A management dashboard open with a default login. Fix: restrict network, SSO, MFA.
- **`root-account`** — Protect the root account (Foundational, 6m) [CIS 1, NIST PR.AA]
  Root runs daily tasks, no hardware key. Fix: lock it away, hardware MFA, use roles.
- **`cloud-logging`** — Logging you can actually use (Core, 7m) [CIS 8, NIST DE.CM]
  Logs off or unwatched. Fix: enable the trail, alert, retain.
- **`public-snapshot`** — The snapshot shared with the world (Advanced, 8m) [CIS 3, ATT&CK T1530]
  A disk snapshot marked public holds a database. Fix: private snapshots, share by grant.

---

## Suggested build order

1. Security Awareness (18) and Real-World Incidents (3): pure office-room, reuse everything. Fastest wins, and they fill the flagship domain.
2. Privacy & Compliance (9) and AI (7): office room + a few new computer apps.
3. Then design the workstation mode and build the Developer Track: AppSec (8), API (6), Git (5), Cloud (6).

## What to send back per batch

For each built drill: `slug -> id` (use id = slug), the file path, and one line
confirming it plays start to finish on training difficulty. Labs will then wire
each into the catalogue (flip "In build" to "Play now") and, per category, keep
the "Play the full track" button running the domain's drills back to back.
