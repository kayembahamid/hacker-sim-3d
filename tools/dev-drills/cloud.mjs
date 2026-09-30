import { F, A, O } from './helpers.mjs';

// Cloud Security: six configuration drills. The "console" is a set of
// settings files, and the "exploit" is what anyone on the internet could do.
// The cloud provider is unnamed on purpose.
const T = 'cloud-security';

export const cloud = [
  {
    slug: 'public-bucket', n: 1, track: T, title: 'The public bucket', kind: 'Public storage bucket', level: 'Foundational', minutes: 6,
    brief: '18:15. A storage bucket was made public "just to test" a year ago. A researcher says its contents are listed for anyone to read.',
    insight: 'The test finished a year ago. The setting was never changed back.',
    teaches: ['Public access should be off by default and blocked at the account level', 'Share with short lived links or roles, not with the whole internet', 'Turn on access logs so you can tell who read what'],
    app: 'Storage console: veltrix-exports', sub: 'cloud account · eu-west', banner: 'Review the storage bucket settings',
    files: [
      F('storage/veltrix-exports/policy.json', 'Policy', ['{', '  "bucket": "veltrix-exports",', '  "effect": "allow",', '  "principal": "*",', '  "actions": ["list", "read"]', '}'], [4, 5]),
      F('storage/veltrix-exports/settings.json', 'Settings', ['{ "block_public_access": false,', '  "access_logging": false,', '  "created": "2025-09-02", "note": "just to test" }'], [1, 2])
    ],
    intro: 'You are on the internet, not signed in to anything. See what you can do to that bucket.',
    attempts: [
      A('staff', 'List it as a signed in member of staff', 'list veltrix-exports   (as s.rivera, via role)', 'customers-2025.csv  18.4 MB\nremittance-oct.pdf  0.4 MB\nvendor-master.xlsx  0.1 MB', 'customers-2025.csv  18.4 MB\nremittance-oct.pdf  0.4 MB\nvendor-master.xlsx  0.1 MB'),
      A('anon', 'List it with no sign in at all', 'GET https://veltrix-exports.storage.veltrix-logistics.com/', 'HTTP 200\n<ListBucketResult>\n  customers-2025.csv\n  remittance-oct.pdf\n  vendor-master.xlsx\n\nAnyone on the internet can list it.', 'HTTP 403\nAccessDenied', true),
      A('get', 'Download the customer file, with no sign in', 'GET .../customers-2025.csv', 'HTTP 200\n18.4 MB downloaded: 41,000 customers, names and addresses.', 'HTTP 403\nAccessDenied', true)
    ],
    fixPrompt: 'Pick every change that makes public access impossible by default, and gives real users a safe way in.',
    options: [
      O('block', 'Turn on "block public access" for the whole account', true, ['+ account.block_public_access = true    # overrides any bucket policy'], 'One switch that makes public exposure a two step mistake instead of a one line one, across every bucket.'),
      O('policy', 'Remove the public policy and grant access to named roles, with short lived links for sharing', true, ['- "principal": "*"', '+ "principal": "role/finance-exports"', '+ share via presigned link, expires in 1 hour'], 'The right people get in, and nobody else does. A shared link stops working by itself.'),
      O('log', 'Turn on access logging and review who has already read it', true, ['+ access_logging = true', '+ review: requests from outside 10.20.0.0/16 since 2025-09'], 'You will know whether the last year\'s exposure was used, which decides what you have to report.'),
      O('rename', 'Rename the bucket to something hard to guess', 'weak', ['- veltrix-exports', '+ vx-9f3a2c-exports'], 'The name appears in links, logs and search results. Public is public, however obscure the name.'),
      O('nolist', 'Turn off listing but leave the files readable', 'weak', ['- "actions": ["list", "read"]', '+ "actions": ["read"]'], 'Anyone with a file name can still download it, and names are easy to find or guess.')
    ],
    cards: {
      x: { t: 'A year in public', b: ['Anyone could list the bucket and download the customer file with no sign in at all. It had been that way for a year, and nothing was logging who looked.', 'Most cloud incidents are not exploits. They are settings.'] },
      f: { t: 'Closed everywhere, shared safely', b: ['Blocking public access at the account level means the next mistake fails safe. Named roles and short lived links give real users a way in, and logging tells you what happened in the year it was open.', 'Now go and find out whether it was read.'] },
      w: { t: 'Obscure is not private', b: ['A hard to guess name or a bucket with listing off still hands the files to anyone who has, or finds, the address. Names leak in links, logs and search.', 'Block public access, and grant access by identity.'] }
    }
  },
  {
    slug: 'over-permissive-iam', n: 2, track: T, title: 'The role that can do anything', kind: 'Over permissive IAM role', level: 'Core', minutes: 8,
    brief: '18:20. A reporting job needs to read one bucket. It was given a role with a wildcard, because that was quicker. Its credential has just turned up in a log.',
    insight: 'The job needs to read one bucket. If its credential leaks, the attacker gets the whole account.',
    teaches: ['Grant the smallest set of actions on the smallest set of resources', 'Use short lived role credentials, not long lived keys', 'Measure what a role really uses, and trim the rest'],
    app: 'IAM console: role report-service', sub: 'cloud account · access control', banner: 'Review the reporting role\'s permissions',
    files: [
      F('iam/report-service-policy.json', 'Policy', ['{', '  "role": "report-service",', '  "allow": [ { "actions": ["*"], "resources": ["*"] } ],', '  "credential": "long lived access key"', '}'], [3, 4]),
      F('iam/last-90-days.txt', 'Access report', ['report-service used: storage:read on veltrix-reports', '                     nothing else', '', 'Permissions granted: everything'], [4])
    ],
    intro: 'Pretend the leaked credential is yours. See what it can do, beyond running a report.',
    attempts: [
      A('report', 'Run the nightly report', 'run report-job   (as report-service)', 'read veltrix-reports/daily.csv\nReport generated.', 'read veltrix-reports/daily.csv\nReport generated.'),
      A('dbs', 'List every database in the account', 'list databases   (as report-service)', '3 databases: customers-prod, payments-prod, hr-prod\n\nThe report job can see them all.', 'AccessDenied: report-service is not allowed to list databases', true),
      A('delete', 'Delete the backups', 'delete backup-vault/*   (as report-service)', 'Deleted 41 backups.\n\nThe same credential can destroy the recovery copies.', 'AccessDenied: report-service is not allowed to delete backups', true)
    ],
    fixPrompt: 'Pick every change that cuts the role down to what it needs, and limits how long a leaked credential is useful.',
    options: [
      O('scope', 'Allow only reading the reports bucket', true, ['- "actions": ["*"], "resources": ["*"]', '+ "actions": ["storage:read"], "resources": ["veltrix-reports/*"]'], 'The role can do its job and nothing else. A leaked credential can read reports.'),
      O('short', 'Use short lived role credentials instead of a long lived key', true, ['- "credential": "long lived access key"', '+ "credential": "role assumed by the job, 1 hour"'], 'A credential in a log stops working in an hour, instead of working for years.'),
      O('trim', 'Review access reports regularly, and remove permissions that are never used', true, ['+ monthly: access-report --unused report-service -> open a ticket'], 'Permissions drift wide over time. Regular pruning keeps a role near the least it needs.'),
      O('deny', 'Keep the wildcard, and add a deny for deleting backups', 'weak', ['+ "deny": [ { "actions": ["backup:delete"] } ]'], 'It blocks one bad thing and leaves every other one open: reading every database, creating users, changing policies.'),
      O('ip', 'Keep the wildcard, but only from the office network address', 'weak', ['+ "condition": { "source_ip": "198.51.100.0/24" }'], 'The credential leaked from inside your own logs. Network limits do not fix what the role is allowed to do.')
    ],
    cards: {
      x: { t: 'A report job that could burn the account down', b: ['The credential listed every database and deleted the backups, because the role was allowed to do anything to anything. The job only ever read one bucket.', 'The access report even said so: "Permissions granted: everything".'] },
      f: { t: 'The least it needs, for the least time', b: ['The role reads one bucket and nothing else, and its credential comes from a role that expires within the hour. A regular look at what is actually used stops it creeping back to a wildcard.', 'Least privilege is what makes a leak an incident instead of a disaster.'] },
      w: { t: 'One door shut, the rest wide open', b: ['Denying deletion of backups, or limiting the network, leaves a role that can still read every database, create users and change policies. Deny lists are always one action short.', 'Allow only what the job needs.'] }
    }
  },
  {
    slug: 'exposed-dashboard', n: 3, track: T, title: 'The admin console on the internet', kind: 'Exposed management dashboard', level: 'Core', minutes: 7,
    brief: '18:25. A scan finds the container management dashboard answering on the public internet. It was set up in a hurry during a migration.',
    insight: 'A management console reachable from anywhere, with the login it shipped with.',
    teaches: ['Management interfaces belong on a private network, behind single sign on and MFA', 'Remove default credentials and rotate anything already exposed', 'A secret path or a changed password on an open service is not access control'],
    app: 'Container dashboard review', sub: 'ops-01 · public scan', banner: 'Review the exposed dashboard',
    files: [
      F('infra/dashboard.conf', 'Config', ['listen: 0.0.0.0:8443', 'auth: local', 'users:', '  - admin / admin        # default', 'sso: disabled', 'mfa: disabled', 'allowed_networks: any'], [1, 4, 5, 6, 7]),
      F('infra/firewall.rules', 'Firewall', ['allow tcp 8443 from 0.0.0.0/0     # migration, remove later'], [1])
    ],
    intro: 'You are on the internet. See what you can find, and what you can do with it.',
    attempts: [
      A('vpn', 'Reach the dashboard from the office VPN', 'GET https://ops-01.veltrix-logistics.com:8443/   (from the VPN)', 'HTTP 200  Sign in page.', 'HTTP 200  Sign in with your company account (SSO + MFA).'),
      A('find', 'Find it from the internet', 'scan 203.0.113.0/24 port 8443   (from outside)', 'ops-01.veltrix-logistics.com:8443  open\nContainer dashboard, version 2.7 detected.\n\nIt answers to the whole internet.', 'ops-01.veltrix-logistics.com:8443  filtered. Not reachable from outside the company network.', true),
      A('login', 'Sign in with admin / admin', 'POST /login  { "user": "admin", "password": "admin" }', 'HTTP 200\nSigned in. You can start, stop and open a shell in any container, including the payments service.', 'Not reachable from here. Sign in requires the company single sign on and a hardware key.', true)
    ],
    fixPrompt: 'Pick every change that takes it off the internet, puts proper sign in in front of it, and removes the default login.',
    options: [
      O('net', 'Restrict it to the private network, or the VPN, and close the public port', true, ['- allow tcp 8443 from 0.0.0.0/0', '+ allow tcp 8443 from 10.20.0.0/16   # VPN and office'], 'It cannot be found, or attacked, from the internet at all.'),
      O('sso', 'Put it behind single sign on with MFA', true, ['- auth: local', '+ auth: sso   # company account', '+ mfa: required (hardware key)'], 'Access follows the person: their account, their second factor, and it is removed when they leave.'),
      O('cred', 'Delete the default account and rotate any credentials that were exposed', true, ['- users: admin / admin', '+ # no local accounts; rotate keys the dashboard could read'], 'It was open with a default login, so assume it was used, and change what it could reach.'),
      O('path', 'Move it to a secret path so nobody finds it', 'weak', ['- https://ops-01.../', '+ https://ops-01.../ops-a93f2c/'], 'Scanners and certificate logs reveal hosts and paths. A secret address is not a lock.'),
      O('pw', 'Change the admin password but leave it on the public internet', 'weak', ['- admin / admin', '+ admin / Winter2026!'], 'A better password on an open management console will be guessed, stuffed or phished, and every unpatched flaw in it is exposed too.')
    ],
    cards: {
      x: { t: 'One search, one login, every container', b: ['The dashboard was open to the whole internet, and the shipped login still worked. From it you could open a shell in any container, including the payments service.', 'The firewall rule even says "migration, remove later".'] },
      f: { t: 'Not on the internet, not without you', b: ['Restricting it to the private network removes it from the internet entirely. Single sign on with a hardware key ties access to a person, and the default account is gone. Anything it could read gets rotated, because it was open for weeks.', 'Management interfaces are not for the public internet.'] },
      w: { t: 'A better lock on the wrong door', b: ['Hiding it on a secret path or choosing a stronger password still leaves a management console visible to attackers, with every flaw in it exposed. Scans find hosts by certificate and by port.', 'Take it off the internet first.'] }
    }
  },
  {
    slug: 'root-account', n: 4, track: T, title: 'Protect the root account', kind: 'Unprotected root account', level: 'Foundational', minutes: 6,
    brief: '18:30. An audit finds the cloud account\'s root user in daily use, with an access key stored in a CI variable, and no hardware security key.',
    insight: 'The root account can do everything and cannot be restricted. It should barely ever be used.',
    teaches: ['The root account is for a handful of tasks: lock it away, with a hardware key', 'Do daily administration through roles and single sign on', 'Delete root access keys: they cannot be scoped down'],
    app: 'Account security review: root user', sub: 'cloud account · identity', banner: 'Review how root is used',
    files: [
      F('identity/root-user.json', 'Settings', ['{ "mfa": "SMS code",', '  "hardware_key": false,', '  "access_keys": 1,', '  "last_used": "today",', '  "logins_last_30_days": 23,', '  "email": "cloud-admin@veltrix-logistics.com (shared mailbox)" }'], [1, 2, 3, 5, 6]),
      F('.ci/variables', 'CI', ['ROOT_ACCESS_KEY=AKIA-EXAMPLE-ROOT-71Q', 'ROOT_SECRET=***set***'], [1, 2])
    ],
    intro: 'Act as an attacker with a foothold in the shared mailbox, then in the CI. See how far each gets.',
    attempts: [
      A('daily', 'Use root for an everyday task', 'sign in as root -> restart a service', 'HTTP 200\nDone. Root did a job any admin role could have done.', 'AccessDenied: sign in as root is blocked for this action. Use your admin role.'),
      A('phish', 'Reset the root password from the shared mailbox', 'password reset email -> shared cloud-admin@veltrix-logistics.com', 'Reset link opened. New password set.\nNo hardware key was asked for: an SMS code was enough.\n\nWhoever reads that shared mailbox now owns the account that owns everything.', 'Reset link opened. Blocked: root sign in requires the hardware security key, which the attacker does not have.', true),
      A('cikey', 'Use the root access key left in CI', 'deploy job: aws --profile root s3 ls', 'Every bucket in the account listed. The CI variable is a live root key.', "Error: no credential named 'root'. Root has no access keys.", true)
    ],
    fixPrompt: 'Pick every change that gets root out of daily use and locks what is left behind hardware.',
    options: [
      O('key', 'Delete the root access key entirely', true, ['- ROOT_ACCESS_KEY=AKIA-EXAMPLE-ROOT-71Q', '+ # no access keys on the root user, ever'], 'Root cannot be scoped down, so it should never hold a key a script or a pipeline can use.'),
      O('hw', 'Require a hardware security key for root, and stop accepting an SMS code for it', true, ['- "mfa": "SMS code"', '+ "mfa": "hardware key (FIDO2)"', '+ "hardware_key": true'], 'An SMS code can be intercepted or socially engineered. Root, which cannot be restricted, deserves the strongest factor.'),
      O('role', 'Do daily administration through named roles and single sign on, and lock root away for emergencies only', true, ['+ daily admin: role/cloud-admin via SSO', '+ root: used only to recover account access, logged and alerted'], 'Root stops being an everyday account, so a phished password or a leaked key cannot reach it through routine work.'),
      O('mail', 'Move root\'s recovery email off the shared mailbox', true, ['- "email": "cloud-admin@veltrix-logistics.com (shared mailbox)"', '+ "email": "root-recovery@veltrix-logistics.com (restricted, 2 owners)"'], 'A shared mailbox that many people can read is not a safe place to control the account that controls everything.'),
      O('sms2', 'Keep SMS as the second factor, but require it every time', 'weak', ['+ "mfa": "SMS code, every sign in"'], 'Still phishable and interceptable. The factor is the weak point, not how often it is asked for.')
    ],
    cards: {
      x: { t: 'Every door led back to root', b: ['Root was used for ordinary work, its password could be reset from a mailbox several people read, and a live root key sat in a CI variable. Any one of those routes hands over an account that cannot be restricted.', 'Root is the one identity in the account with no ceiling.'] },
      f: { t: 'Locked away, reached only by hardware', b: ['With no access key, a hardware only second factor, and daily work done through roles, root stops being reachable by a phished password or a leaked pipeline variable. Moving its recovery email off a shared mailbox closes the last route.', 'Use root as little as the design of the account lets you.'] },
      w: { t: 'Same weak factor, more often', b: ['Asking for an SMS code every time does not change that SMS can be intercepted or talked out of someone. The account with no ceiling deserves a factor that cannot be phished.', 'Hardware keys, not more prompts.'] }
    }
  },
  {
    slug: 'cloud-logging', n: 5, track: T, title: 'Logging you can actually use', kind: 'Missing cloud audit logging', level: 'Core', minutes: 7,
    brief: '18:35. Finance report a payment that nobody remembers releasing. You go to find out who did it, and the trail is not there.',
    insight: 'Something happened. Nobody can say who, because nothing was watching.',
    teaches: ['Turn on the account activity trail everywhere, not just in the region you use most', 'Alert on the actions that matter (root sign in, policy changes, deleted logs), not just collect them', 'Keep logs long enough, and stop them being switched off quietly'],
    app: 'Logging review: the missing trail', sub: 'cloud account · audit', banner: 'Find out why nobody can see what happened',
    files: [
      F('logging/trail-eu-west.json', 'Settings', ['{ "enabled": true, "regions": ["eu-west"], "retention_days": 14,', '  "alerts": [] }'], [1, 2]),
      F('logging/trail-us-east.json', 'Settings', ['{ "enabled": false, "regions": ["us-east"], "retention_days": 0 }'], [1]),
      F('incident-notes.txt', 'Notes', ['Payment P-9931 released for 42,000 tonight.', 'Nobody in Finance says they released it.', 'The release API is in us-east.'], [3])
    ],
    intro: 'Try to find who released the payment, the way the on call engineer just did.',
    attempts: [
      A('eu', 'Search the eu-west trail for the release', 'search trail: action=payment.release id=P-9931', 'No matching region. The payment release happened in us-east.', 'No matching region. The payment release happened in us-east.'),
      A('us', 'Search the us-east trail for the release', 'search trail: region=us-east action=payment.release id=P-9931', 'No trail configured for this region.\n\nThere is nothing to search. Whoever released it left no record at all.', 'payment.release  P-9931  42,000  by role/batch-ops  17:58:03  source 203.0.113.77', true),
      A('gap', 'Check whether logging was ever switched off on purpose', 'search trail: action=logging.disable region=us-east', 'No trail to search, so no answer either way. A disabled trail hides its own disabling.', 'logging.disable  region=us-east  attempted by role/batch-ops  DENIED (protected)', true)
    ],
    fixPrompt: 'Pick every change that gives you a trail everywhere, tells someone when it matters, and stops it being turned off quietly.',
    options: [
      O('all', 'Turn the trail on for every region, not only the one you use most', true, ['- "regions": ["eu-west"]', '+ "regions": ["all"]', '- "enabled": false   (us-east)', '+ "enabled": true'], 'An account has no borders. A trail that only watches one region misses everything done in the others.'),
      O('alert', 'Alert on the actions that matter: root sign in, policy changes, payment releases, the trail itself being changed', true, ['+ "alerts": ["root.signin", "iam.policy.change", "payment.release", "logging.disable", "logging.delete"]'], 'Nobody reads a log until something goes wrong. An alert means someone finds out the same day, not during an audit.'),
      O('protect', 'Make the logging configuration itself protected, so it cannot be disabled by an ordinary role', true, ['+ logging config: requires break-glass approval to change'], 'If a compromised role can just switch logging off, the log is only as strong as its weakest permission.'),
      O('retain', 'Keep logs for a year, not 14 days', true, ['- "retention_days": 14', '+ "retention_days": 400'], 'Some incidents are not noticed for months. A log that has already expired cannot answer anything.'),
      O('more', 'Log more fields in the application instead of fixing the trail', 'weak', ['+ app.log("payment released", extra_fields)'], 'Application logs can be edited or lost with the application. The cloud trail is the independent record, and it was the one missing.')
    ],
    cards: {
      x: { t: 'A 42,000 payment, no fingerprints', b: ['The region that mattered had no trail at all, so the question "who released this" had no answer. A trail that only covers your main region is a trail with a blind spot exactly where you need it.', 'Logging that exists only where it is convenient is not logging you can rely on.'] },
      f: { t: 'Watched everywhere, protected, and kept', b: ['Every region has a trail, the actions that matter raise an alert the same day, the logging setup itself cannot be quietly switched off, and a year of history means a slow to surface incident still has an answer.', 'Set up logging as something an attacker cannot turn off and you cannot forget to check.'] },
      w: { t: 'More detail, same blind spot', b: ['Logging inside the application does not replace an independent trail at the account level, and it is just as easy to lose if the service is compromised. The missing region is still missing.', 'Fix the trail itself, not what feeds into it.'] }
    }
  },
  {
    slug: 'public-snapshot', n: 6, track: T, title: 'The snapshot shared with the world', kind: 'Public disk snapshot', level: 'Advanced', minutes: 8,
    brief: '18:40. A contractor needed a copy of a database for a one off report. The snapshot made for them is still there, and it is marked public.',
    insight: 'Sharing with one person and sharing with the world used the same button, and nobody came back to undo it.',
    teaches: ['Share a snapshot by naming the account, never by making it public', 'A snapshot holds everything the disk held: audit it like the database itself', 'Time box access to data shared for a one off job, and check for copies'],
    app: 'Snapshot review: customer database backup', sub: 'cloud account · storage', banner: 'Review the shared database snapshot',
    files: [
      F('storage/snapshots/snap-0x8f21.json', 'Settings', ['{ "source": "customers-prod-db", "size_gb": 220,', '  "visibility": "public",', '  "created": "2025-11-02", "reason": "contractor report, one off",', '  "shared_with": "everyone" }'], [3, 6]),
      F('incident-notes.txt', 'Notes', ['Contractor finished the report on 2025-11-09.', 'Nobody set an end date on the snapshot or the sharing.'], [2])
    ],
    intro: 'You have no account and no credentials. See what a public snapshot lets you do with just its id.',
    attempts: [
      A('contractor', 'Copy it the way the contractor did, with their own account named on it', 'copy snap-0x8f21 to account:contractor-104   (named access)', 'Copy started. Only the named account could do this.', 'Copy started. Only the named account could do this.'),
      A('find', 'Find the snapshot id from a public list of recent snapshots', 'list public snapshots in eu-west', 'snap-0x8f21  220 GB  customers-prod-db  visibility: public\n\nA public snapshot shows up in a public list, to anyone browsing.', 'No public snapshots listed. Sharing is by named account only.', true),
      A('restore', 'Restore the public snapshot into your own account and read it', 'restore snap-0x8f21 -> new-database   (no account named)', 'HTTP 200\nRestored. 41,000 customers, full records, including the ones added after the contractor\'s report.\n\nA public snapshot is a public copy of the database.', 'AccessDenied: snapshot is not shared with your account.', true)
    ],
    fixPrompt: 'Pick every change that shares the snapshot with a person, not the world, and cleans up after the job is done.',
    options: [
      O('named', 'Share the snapshot with the contractor\'s account by id, not by making it public', true, ['- "visibility": "public"', '+ "visibility": "private", "shared_with": ["account:contractor-104"]'], 'Restoring or copying it then needs to be that one account, not anyone with the id.'),
      O('expire', 'Set an end date on the sharing, tied to when the job finishes', true, ['+ "shared_until": "2025-11-09"'], 'Access for a one off job should end when the job does, without anyone needing to remember.'),
      O('audit', 'Audit the snapshot like the database it came from: check what it holds and whether it has been copied', true, ['+ review: does the snapshot need masking before any sharing? has it been copied elsewhere?'], 'A snapshot is a full copy of the disk. It deserves the same care as the live database, including checking whether it was copied while it was open.'),
      O('policy', 'Block public sharing for snapshots at the account level, the same as storage buckets', true, ['+ account.block_public_snapshots = true'], 'The same one switch idea as the public bucket: remove the option to make the mistake at all.'),
      O('name2', 'Rename the snapshot so it is harder to find', 'weak', ['- snap-0x8f21', '+ snap-report-temp'], 'A public snapshot is still public and still appears in listings and searches, whatever it is called.')
    ],
    cards: {
      x: { t: 'A database, copied by anyone who looked', b: ['The snapshot was made public to share it with one contractor, and stayed that way after the job finished. Anyone who found its id, or simply browsed public snapshots, could restore the whole customer database, including records added after the report was done.', 'Public and shared with one person are not the same setting.'] },
      f: { t: 'Named, time boxed, and blocked by default', b: ['Sharing by account id means only the contractor could reach it, an end date means access stopped when the job did, and blocking public snapshots at the account level removes the shortcut for next time. Auditing it like the database it is means someone checks whether the exposure was used.', 'Share a copy of the data as carefully as the data itself.'] },
      w: { t: 'Still public, just harder to spell', b: ['Renaming the snapshot does nothing to its visibility. It is still listed publicly and still restorable by anyone who finds it, under its new name.', 'Fix who can reach it, not what it is called.'] }
    }
  }
];
