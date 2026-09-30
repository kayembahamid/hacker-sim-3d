import { F, A, O } from './helpers.mjs';

// Application Security: eight exploit then fix drills. Every system, host and
// person is made up; nothing here runs or sends anything.
const T = 'application-security';

export const appsec = [
  {
    slug: 'sql-injection', n: 1, track: T, title: 'SQL injection in the login', kind: 'SQL injection', level: 'Core', minutes: 8,
    brief: '16:40. A pull request changes the customer portal login. QA says it works. You are the reviewer, and staging is open for you to try it.',
    insight: 'The query is built by gluing strings together, so the input can rewrite the query itself.',
    teaches: ['Untrusted input glued into a query becomes part of the query', 'Parameterised queries keep data and code apart, for good', 'Escaping by hand and client checks are not fixes; least privilege limits the damage'],
    app: 'Customer portal: login change', sub: 'portal-api · staging', banner: 'Review the login change on staging',
    files: [
      F('portal/routes/login.js', 'JavaScript', [
        "app.post('/login', async (req, res) => {",
        '  const { email, password } = req.body;',
        '  const sql = "SELECT id, role FROM users WHERE email = \'" + email +',
        '              "\' AND pw_hash = \'" + hash(password) + "\'";',
        '  const rows = await db.query(sql);',
        '  if (rows.length > 0) return res.json({ token: sign(rows[0]) });',
        "  res.status(401).json({ error: 'bad login' });",
        '});'
      ], [3, 4]),
      F('portal/db/schema.sql', 'SQL', ['CREATE TABLE users (', '  id       INTEGER PRIMARY KEY,', '  email    TEXT UNIQUE,', '  pw_hash  TEXT,', "  role     TEXT DEFAULT 'customer'", ');'])
    ],
    intro: 'Staging runs the branch. Send it a normal sign in first, then try to break it. The email field goes straight into the query.',
    attempts: [
      A('normal', 'Sign in as a normal customer', 'POST /login\n{ "email": "megan@customer.test", "password": "correct horse" }', 'HTTP 200\n{ "token": "eyJhbGciOi...customer" }', 'HTTP 200\n{ "token": "eyJhbGciOi...customer" }'),
      A('wrong', 'Sign in with a wrong password', 'POST /login\n{ "email": "megan@customer.test", "password": "nope" }', 'HTTP 401\n{ "error": "bad login" }', 'HTTP 401\n{ "error": "bad login" }'),
      A('inject', "Email: admin@veltrix-logistics.com' --  (any password)", 'POST /login\n{ "email": "admin@veltrix-logistics.com\' --", "password": "x" }\n\nQuery run:\nSELECT id, role FROM users WHERE email = \'admin@veltrix-logistics.com\' --\' AND pw_hash = \'...\'', 'HTTP 200\n{ "token": "eyJhbGciOi...admin" }\n\nThe password check was commented out.', 'HTTP 401\n{ "error": "bad login" }\n\nThe whole string was treated as an email address, and no such user exists.', true),
      A('or', "Email: ' OR '1'='1' --", 'POST /login\n{ "email": "\' OR \'1\'=\'1\' --", "password": "x" }', 'HTTP 200\n{ "token": "eyJhbGciOi...first-user" }\n\nEvery row matched. You are signed in as the first user.', 'HTTP 401\n{ "error": "bad login" }', true)
    ],
    fixPrompt: 'The cause is that data can change the query. Pick every change that removes that, and any that limits the damage if something else goes wrong.',
    options: [
      O('param', 'Use a parameterised query, with the values passed separately', true, ['- const sql = "SELECT ... WHERE email = \'" + email + "\' AND ..."', '+ const rows = await db.query(', "+   'SELECT id, role FROM users WHERE email = $1 AND pw_hash = $2',", '+   [email, hash(password)]', '+ );'], 'The database receives the query and the values separately, so a value can never become part of the query. This is the fix.'),
      O('lp', 'Run the portal with a database account that can only read and write what it needs', true, ['+ -- portal_app: SELECT, INSERT, UPDATE on customer tables only', '+ -- no DROP, no access to the admin schema'], 'Defence in depth: if another injection slips in, it cannot drop tables or read the admin schema.'),
      O('esc', "Escape single quotes in the email with a replace", 'weak', ["+ const safe = email.replace(/'/g, \"''\");"], 'Hand written escaping misses other characters, encodings and other parts of the query. Attackers have been getting round these for twenty years.'),
      O('client', 'Validate the email format in the browser form', 'weak', ['+ <input type="email" required pattern="[^\'\\s]+@[^\'\\s]+">'], 'The attacker does not use your form. They send the request directly, so nothing in the browser stops them.'),
      O('rate', 'Rate limit the login endpoint', false, [], 'Worth doing, but it slows the attack down. It does not stop it.')
    ],
    cards: {
      x: { t: 'The password check disappeared', b: ['Everything after the two dashes was treated as a comment, so the query never checked the password. You are signed in as an admin with no password at all.', 'Look at lines 3 and 4: the email is glued straight into the query. Whatever the user types becomes part of the code.'] },
      f: { t: 'Data can no longer become code', b: ['With a parameterised query the database gets the query and the values separately. The email can contain quotes, dashes and SQL, and it is only ever a value to compare.', 'A restricted database account means that even a future injection somewhere cannot drop tables or read the admin schema.'] },
      w: { t: 'You blocked one payload, not the bug', b: ['Escaping quotes or checking the form in the browser stops the attack you just tried. It does not stop the next one: other characters, other encodings, other fields.', 'Injection is fixed at the cause. Keep data and code apart with parameters.'] }
    }
  },
  {
    slug: 'stored-xss', n: 2, track: T, title: 'Stored cross-site scripting', kind: 'Cross-site scripting', level: 'Core', minutes: 8,
    brief: '16:45. Customers can now comment on their orders, and support agents read the comments in the back office. The change is on staging for review.',
    insight: 'What one user types is shown to another user as page code. It runs in the other person\'s session.',
    teaches: ['Stored input rendered as raw HTML runs as script in the next visitor\'s browser', 'Encode output for where it lands; a Content Security Policy and HttpOnly cookies limit the damage', 'Stripping script tags is a blocklist, and blocklists lose'],
    app: 'Order comments: back office', sub: 'portal-web · staging', banner: 'Review the order comments change',
    files: [
      F('portal/routes/comments.js', 'JavaScript', ["app.post('/orders/:id/comments', requireLogin, async (req, res) => {", '  await db.insert(\'comments\', { order: req.params.id, body: req.body.body, by: req.user.id });', '  res.redirect(`/orders/${req.params.id}`);', '});']),
      F('portal/views/order.html', 'Template', ['<h2>Order {{order.ref}}</h2>', '<ul class="comments">', '  {{#each comments}}', '    <li class="comment">{{{body}}}</li>', '  {{/each}}', '</ul>'], [4])
    ],
    intro: 'A customer posts a comment on their order. A support agent opens the order in the back office and reads it. Post a normal comment, then post one that is not just text.',
    attempts: [
      A('normal', 'Post a normal comment', 'POST /orders/1002/comments\nbody = "Please deliver before 5pm"', 'Comment saved.\nAgent view shows:  Please deliver before 5pm', 'Comment saved.\nAgent view shows:  Please deliver before 5pm'),
      A('script', 'Post a comment containing a script tag', 'POST /orders/1002/comments\nbody = "<script>send(document.cookie)</script>"', 'Comment saved.\n\nA support agent opens the order. Their browser runs the script:\n  sent session cookie to attacker.test\n\nThe attacker now holds the agent\'s session.', 'Comment saved.\nAgent view shows the text:  <script>send(document.cookie)</script>\n\nIt is displayed, not run.', true),
      A('bold', 'Post a comment with bold text', 'POST /orders/1002/comments\nbody = "<b>URGENT</b>"', 'Comment saved.\nAgent view shows:  URGENT  (in bold: the HTML was interpreted)', 'Comment saved.\nAgent view shows the text:  <b>URGENT</b>')
    ],
    fixPrompt: 'Pick every change that stops user text running as page code, and any that limits what a script could do if one slips through.',
    options: [
      O('enc', 'Encode the comment when it is written into the page', true, ['- <li class="comment">{{{body}}}</li>', '+ <li class="comment">{{body}}</li>   <!-- escaped by default -->'], 'The double braces escape angle brackets, so the comment is text, not markup. This is the fix.'),
      O('csp', 'Send a Content Security Policy that only allows scripts from our own site', true, ["+ Content-Security-Policy: default-src 'self'; script-src 'self'"], 'If an injection ever gets through, the browser refuses to run inline scripts.'),
      O('http', 'Mark the session cookie HttpOnly and SameSite', true, ['+ Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax'], 'Scripts cannot read an HttpOnly cookie, so even a running script cannot steal the session.'),
      O('strip', 'Remove <script> tags from comments with a regular expression', 'weak', ["+ body = body.replace(/<script.*?>.*?<\\/script>/gi, '');"], 'Attackers use <img onerror=...>, event handlers and odd spellings. A blocklist of tags never ends.'),
      O('client', 'Sanitise the comment in the browser before it is sent', 'weak', ['+ form.onsubmit = () => (box.value = clean(box.value));'], 'The attacker posts directly to the endpoint and never runs your browser code.')
    ],
    cards: {
      x: { t: 'A comment ran as code in the agent\'s browser', b: ['The comment was stored, then written into the page as raw HTML. When the agent opened the order, the browser treated it as part of the page and ran it, in the agent\'s session.', 'Line 4 of the template: the triple braces mean “do not escape”.'] },
      f: { t: 'Text stays text', b: ['Output encoding turns angle brackets into harmless text, so a comment can never become markup. The policy and the HttpOnly cookie are the second and third lines: if one gets through, it still cannot run, and it cannot read the session.', 'Encode on output, for the place it lands.'] },
      w: { t: 'A blocklist, and an attacker with time', b: ['Removing script tags stops the tag you tried. It does not stop an image with an error handler, or a slightly different spelling. Client side cleaning does not run for an attacker at all.', 'Encode on output. Everything else is an extra layer.'] }
    }
  },
  {
    slug: 'ssrf', n: 3, track: T, title: 'Server-side request forgery', kind: 'Server-side request forgery', level: 'Advanced', minutes: 9,
    brief: '16:50. A new feature shows a preview card for any link a customer pastes. The server fetches the page to build it. It runs inside Veltrix\'s cloud.',
    insight: 'The server will fetch whatever it is told to, from inside the network, with the network\'s trust.',
    teaches: ['A server that fetches user supplied URLs can be pointed at things only it can reach', 'Allowlist what may be fetched, and block internal and link-local addresses after resolving the name', 'A string blocklist for “localhost” loses to decimal, hex and DNS tricks'],
    app: 'Link preview service', sub: 'portal-api · staging', banner: 'Review the link preview feature',
    files: [
      F('portal/routes/preview.js', 'JavaScript', ["app.get('/preview', requireLogin, async (req, res) => {", '  const target = req.query.url;', '  const page = await fetch(target);              // follows redirects', '  const html = await page.text();', '  res.json({ title: titleOf(html), text: html.slice(0, 400) });', '});'], [2, 3]),
      F('infra/notes.md', 'Notes', ['The portal runs on a cloud VM with an instance role.', 'The metadata service at 169.254.169.254 hands out the role credentials.', 'The admin console listens on localhost:9000 on the same machine.'])
    ],
    intro: 'The preview endpoint fetches a URL for you. Try a real page, then try addresses only the server can reach.',
    attempts: [
      A('normal', 'Preview a normal news link', 'GET /preview?url=https://freightledger.news/rates', 'HTTP 200\n{ "title": "Freight rates this week", "text": "Container dwell times..." }', 'HTTP 200\n{ "title": "Freight rates this week", "text": "Container dwell times..." }'),
      A('meta', 'Preview the cloud metadata address', 'GET /preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/portal-role', 'HTTP 200\n{ "text": "{ \\"AccessKeyId\\": \\"VLXKEY-EXAMPLE\\", \\"SecretAccessKey\\": \\"...\\", \\"Token\\": \\"...\\" }" }\n\nThe server handed over its own cloud credentials.', 'HTTP 400\n{ "error": "that address is not allowed" }', true),
      A('local', 'Preview the admin console on localhost', 'GET /preview?url=http://localhost:9000/admin', 'HTTP 200\n{ "title": "Veltrix admin console", "text": "Users, keys, exports..." }\n\nThe admin console was reachable only from the server itself.', 'HTTP 400\n{ "error": "that address is not allowed" }', true)
    ],
    fixPrompt: 'Pick every change that limits what the server can be made to fetch, and any that limits what a stolen credential could do.',
    options: [
      O('allow', 'Only fetch http and https URLs to an allowlist of hosts we choose', true, ["+ const ALLOWED = new Set(['freightledger.news', 'kestrelfreight.co.uk']);", "+ if (!['http:', 'https:'].includes(u.protocol) || !ALLOWED.has(u.hostname)) return res.status(400).end();"], 'Deciding what may be fetched, rather than what may not, is what works.'),
      O('range', 'Resolve the host first and refuse private, loopback and link-local addresses', true, ['+ const ip = await resolve(u.hostname);', '+ if (isPrivate(ip) || isLoopback(ip) || isLinkLocal(ip)) return res.status(400).end();', '+ // then connect to that same ip: no second lookup'], 'This catches the internal targets however they are spelled, including names that resolve inside.'),
      O('meta', 'Require a session token for the metadata service and cut the role down to what the portal needs', true, ['+ metadata_service: require_token = true', '+ role portal-role: allow only storage:read on veltrix-portal-assets'], 'If a request still reaches the metadata service, a plain fetch gets nothing, and what it could reach is small.'),
      O('black', 'Reject URLs containing "localhost" or "169.254"', 'weak', ["+ if (/localhost|169\\.254/.test(target)) return res.status(400).end();"], 'Attackers write the address as 2852039166, 0xA9FEA9FE, or point a DNS name at it. String blocklists lose.'),
      O('time', 'Add a two second timeout to the fetch', false, ['+ fetch(target, { signal: AbortSignal.timeout(2000) })'], 'Good hygiene, but it does not change where the request can go.')
    ],
    cards: {
      x: { t: 'The server gave away its own keys', b: ['The preview feature fetched the metadata address from inside the cloud and returned the response: the server\'s temporary credentials. With those, an attacker acts as the portal against the cloud account.', 'The request came from a customer. The server made it, from a place customers cannot reach.'] },
      f: { t: 'The server fetches only what we chose', b: ['An allowlist means the server cannot be steered to an internal address at all. Resolving the name and refusing private and link-local ranges catches the tricks, and the metadata service now needs a token and a much smaller role.', 'Three layers, each one enough to stop the demo.'] },
      w: { t: 'The blocklist is a puzzle, not a wall', b: ['Blocking the words localhost and 169.254 stops the obvious spelling. The same address can be written as a single decimal number, in hex, or as a name that resolves there, and a redirect can bounce through.', 'Decide what is allowed, rather than what is not.'] }
    }
  },
  {
    slug: 'broken-access-control', n: 4, track: T, title: 'Broken access control', kind: 'Broken access control', level: 'Core', minutes: 8,
    brief: '16:55. A customer reports seeing another company\'s order in the portal. The order page takes the number straight from the address.',
    insight: 'The page only checked that you were signed in, not whose order it is.',
    teaches: ['Authentication is not authorisation: check the owner on every request, on the server', 'Deny by default, in one place every route goes through', 'Unguessable ids and hidden links are obscurity, not access control'],
    app: 'Customer portal: orders', sub: 'portal-web · staging', banner: 'Review the order page access bug',
    files: [
      F('portal/routes/orders.js', 'JavaScript', ["app.get('/orders/:id', requireLogin, async (req, res) => {", '  const order = await db.one(\'SELECT * FROM orders WHERE id = $1\', [req.params.id]);', '  if (!order) return res.status(404).end();', '  res.render(\'order\', { order });', '});'], [2, 3]),
      F('portal/views/order.html', 'Template', ['<h2>Order {{order.id}}</h2>', '<p>Deliver to: {{order.address}}</p>', '<p>Contact: {{order.contact}} {{order.phone}}</p>'])
    ],
    intro: 'You are signed in as Megan, who owns order 1002. Open your own order, then change the number in the address.',
    attempts: [
      A('own', 'Open your own order, 1002', 'GET /orders/1002   (signed in as Megan)', 'HTTP 200\nOrder 1002\nDeliver to: 12 Kirk Lane, Leeds', 'HTTP 200\nOrder 1002\nDeliver to: 12 Kirk Lane, Leeds'),
      A('other', 'Change the number to 1003', 'GET /orders/1003   (signed in as Megan)', 'HTTP 200\nOrder 1003\nDeliver to: Unit 4, Hartley Industrial Estate\nContact: Daniel Okoro 07700 900524\n\nAnother customer\'s order, address and phone number.', 'HTTP 404\nNot found', true),
      A('walk', 'Try 1004, 1005, 1006...', 'GET /orders/1004  ...  /orders/1099   (signed in as Megan)', 'HTTP 200 for all 96 requests.\nEvery customer\'s order is readable, one number at a time.', 'HTTP 404 for all 96 requests.', true)
    ],
    fixPrompt: 'Pick every change that makes the server check ownership, and any that makes sure it is checked every time.',
    options: [
      O('owner', 'Scope the query to the signed in customer', true, ["- const order = await db.one('SELECT * FROM orders WHERE id = $1', [req.params.id]);", "+ const order = await db.oneOrNone('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [req.params.id, req.user.id]);"], 'The server only ever returns an order that belongs to the person asking. Return not found for everyone else.'),
      O('deny', 'Deny by default: one shared authorise() that every route must pass', true, ["+ app.use(authorise({ default: 'deny' }));", "+ app.get('/orders/:id', allow('order:read', ownerOf), handler);"], 'Access control that depends on each developer remembering will be forgotten somewhere. A shared default fails closed.'),
      O('uuid', 'Use random UUIDs instead of counting order numbers', 'weak', ['- order id: 1003', '+ order id: 7f3a9c2e-51d4-4b0e-9a11-c2d05e8b4f62'], 'Harder to guess, but anyone who ever sees one (a shared link, an email, a log) can still read that order. That is obscurity, not access control.'),
      O('hide', 'Only show links to your own orders in the interface', 'weak', ['+ orders.filter((o) => o.customerId === me.id).map(showLink)'], 'The attacker types the address. The interface does not enforce anything.'),
      O('log', 'Log every order page view', false, ['+ audit.log("order.view", { order: order.id, by: req.user.id });'], 'Useful for spotting abuse afterwards, but it does not stop it.')
    ],
    cards: {
      x: { t: 'One number, someone else\'s data', b: ['The page checked that you were signed in, and never asked whose order it was. Changing 1002 to 1003 showed another customer\'s address and phone number, and counting upwards showed all of them.', 'This is the number one web risk for a reason: it is easy to write and hard to see in a demo.'] },
      f: { t: 'The server decides, every time', b: ['The query itself now includes the owner, so another customer\'s order simply is not found. And a shared default deny means a new route that forgets access control fails closed instead of open.', 'Check on the server, on every request, in one place.'] },
      w: { t: 'Hard to guess is not the same as forbidden', b: ['Random ids and hidden links make the attack harder to stumble on. They do not make it forbidden: the moment one id leaks, anyone holding it can read that order, because the server still never checks.', 'The check belongs on the server, against the signed in user.'] }
    }
  },
  {
    slug: 'hardcoded-secrets', n: 5, track: T, title: 'Secrets in the source', kind: 'Hardcoded secret', level: 'Foundational', minutes: 6,
    brief: '17:00. A contractor asks for read access to the portal repository. Before you grant it, you check what is in the code.',
    insight: 'Anyone who can read the repository can read the production database password.',
    teaches: ['A secret in code is a secret shared with everyone who ever sees the repository', 'Read secrets from the environment or a secrets manager, and rotate any that leaked', 'Deleting the line does not remove it from history; scanning stops it happening again'],
    app: 'Portal repository: config review', sub: 'portal-api · main', banner: 'Check the repo before granting access',
    files: [
      F('portal/config/db.js', 'JavaScript', ['module.exports = {', "  host: 'db.veltrix-logistics.com',", "  user: 'portal_app',", "  password: 'Tr0ub4dor&Prod!',      // TODO move this", "  database: 'portal_prod'", '};'], [4]),
      F('portal/.env.example', 'Config', ['DB_HOST=', 'DB_USER=', 'DB_PASSWORD='])
    ],
    intro: 'Search the repository the way a new contractor could, then see if what you find works.',
    attempts: [
      A('tests', 'Run the test suite', 'npm test', 'PASS  18 tests', 'PASS  18 tests'),
      A('grep', 'Search the repository for "password"', 'git grep -n "password"', 'portal/config/db.js:4:  password: \'Tr0ub4dor&Prod!\',\n\nA production password, in plain text, readable by every collaborator.', 'portal/config/db.js:4:  password: process.env.DB_PASSWORD,', true),
      A('use', 'Try that password on the production database', 'connect db.veltrix-logistics.com  user=portal_app  password=Tr0ub4dor&Prod!', 'CONNECTED to portal_prod\n\nThe password from the repository still works.', 'FATAL: password authentication failed for user "portal_app"\n\nThe old password has been rotated.', true)
    ],
    fixPrompt: 'Pick every step needed, including the one that deals with the password that is already exposed.',
    options: [
      O('env', 'Read the password from the environment or a secrets manager', true, ["- password: 'Tr0ub4dor&Prod!',", '+ password: process.env.DB_PASSWORD,   // injected at deploy time'], 'The code no longer contains the secret, so reading the code does not give it away.'),
      O('rotate', 'Rotate the production password now, because it has already been exposed', true, ['+ ALTER ROLE portal_app WITH PASSWORD \'<new, generated, stored in the secrets manager>\';'], 'A secret that has been in a repository has to be treated as leaked. Only rotation makes the old one useless.'),
      O('scan', 'Add secret scanning to commits and CI so it cannot happen again', true, ['+ pre-commit: scan-secrets --staged', '+ ci: scan-secrets --history --fail-on-find'], 'Catches the next one before it is pushed, and finds the ones already in history.'),
      O('del', 'Delete the line in a new commit', 'weak', ['- password: \'Tr0ub4dor&Prod!\','], 'The password is still in every earlier commit, and in every clone. Deleting a line does not delete history.'),
      O('b64', 'Store the password base64 encoded', 'weak', ["+ password: atob('VHIwdWI0ZG9yJlByb2Qh'),"], 'Encoding is not encryption. Anyone can decode it in one command.')
    ],
    cards: {
      x: { t: 'One search, one working password', b: ['A search for the word password found the production database password, and it connected. Anyone with read access, including contractors, past staff and any tool that ever cloned the repository, could do the same.', 'The TODO comment says it all: “move this”.'] },
      f: { t: 'Out of the code, out of use, out of future commits', b: ['The secret now lives outside the repository. The old one is rotated so it is worthless, and scanning means the next one is caught before it is pushed.', 'Rotation is the step people skip. The password was exposed, so it is over.'] },
      w: { t: 'Deleted from the file, not from the world', b: ['Removing the line or encoding the value leaves the password in history and in every clone, and encoding is not protection. The exposed password still opens the database.', 'Move it out, rotate it, and scan.'] }
    }
  },
  {
    slug: 'insecure-deserialization', n: 6, track: T, title: 'Insecure deserialization', kind: 'Insecure deserialization', level: 'Advanced', minutes: 9,
    brief: '17:05. The portal stores each customer\'s preferences in a cookie, so the server does not need a database lookup. The server reads that cookie back into an object.',
    insight: 'The cookie is chosen by the customer, and the server rebuilds whatever it says.',
    teaches: ['Never rebuild objects from data the user controls: the data decides what code runs', 'Parse plain data (JSON) and validate every field, or keep the state on the server', 'Blocking one class name is a blocklist; signing the cookie means the client cannot change it'],
    app: 'Customer preferences cookie', sub: 'portal-web · staging', banner: 'Review the preferences cookie change',
    files: [
      F('portal/middleware/prefs.js', 'JavaScript', ['app.use((req, res, next) => {', "  const raw = Buffer.from(req.cookies.prefs || '', 'base64').toString();", '  req.prefs = objpack.load(raw);     // rebuilds whatever objects the data names', '  next();', '});'], [3]),
      F('portal/lib/tasks.js', 'JavaScript', ['class ShellTask {', '  constructor({ cmd }) { this.cmd = cmd; }', '  run() { return execSync(this.cmd); }   // used by the admin tools', '}'])
    ],
    intro: 'The cookie is a base64 blob. Decode it, change it, and send it back. Nothing here is a real exploit: it is a made up serialisation format on a made up server.',
    attempts: [
      A('normal', 'Send the normal cookie', 'Cookie: prefs=eyIkY2xhc3MiOiJQcmVmcyIsInRoZW1lIjoiZGFyayJ9\n(decodes to { "$class": "Prefs", "theme": "dark" })', 'HTTP 200\nPage rendered with the dark theme.', 'HTTP 200\nPage rendered with the dark theme.'),
      A('swap', 'Change the class named in the cookie to ShellTask', 'Cookie: prefs=<base64 of { "$class": "ShellTask", "cmd": "id" }>', 'HTTP 200\nServer log: ShellTask.run() executed "id"\nuid=1001(portal) gid=1001(portal)\n\nThe cookie chose which code ran on the server.', 'HTTP 400\nInvalid preferences.', true),
      A('extra', 'Add an extra field, isAdmin: true', 'Cookie: prefs=<base64 of { "$class": "Prefs", "theme": "dark", "isAdmin": true }>', 'HTTP 200\nAdmin menu shown. The server trusted a field it should never accept from the client.', 'HTTP 400\nInvalid preferences.', true)
    ],
    fixPrompt: 'Pick every change that stops the cookie choosing what the server builds, and that stops it being changed at all.',
    options: [
      O('json', 'Parse the cookie as plain JSON and validate every field against a schema', true, ['- req.prefs = objpack.load(raw);', '+ req.prefs = validate(PREFS_SCHEMA, JSON.parse(raw));   // only theme, language; nothing else'], 'Plain data cannot name a class. Anything not in the schema is rejected, including isAdmin.'),
      O('sign', 'Sign the cookie and reject it if the signature does not verify', true, ['+ const { value, ok } = verifySignature(req.cookies.prefs, SECRET);', "+ if (!ok) return res.status(400).end('Invalid preferences.');"], 'The customer can still read it, but cannot change a byte without the server noticing.'),
      O('server', 'Keep anything that matters on the server, keyed by the session id', true, ['+ req.prefs = await sessionStore.get(req.session.id);'], 'A cookie should hold an id, not the state. Roles and permissions never belong in it.'),
      O('block', 'Refuse cookies that mention ShellTask', 'weak', ["+ if (raw.includes('ShellTask')) return res.status(400).end();"], 'There are other classes to abuse, and other ways to write the name. A blocklist of class names is never finished.'),
      O('b2', 'Encode the cookie twice so it is harder to read', 'weak', ['+ const raw = atob(atob(req.cookies.prefs));'], 'Encoding is not integrity. Anyone can decode it, change it and encode it back.')
    ],
    cards: {
      x: { t: 'The cookie picked the code', b: ['The server rebuilt whatever object the cookie named, so a customer changed “Prefs” to “ShellTask” and the server ran a command for them. Another edit added a field the server never should have believed.', 'Deserialising data the user controls hands them a way to choose your code.'] },
      f: { t: 'Data is data, and it cannot be tampered with', b: ['Parsing plain JSON against a schema means the cookie can only ever say a theme and a language. Signing means the customer cannot change it, and holding the important state on the server means there is nothing valuable in the cookie at all.', 'Never deserialise untrusted data into objects.'] },
      w: { t: 'One name blocked, the rest open', b: ['Refusing ShellTask stops that class. The format still lets a cookie choose what to build, so the next dangerous class, or the next spelling, works. Encoding twice protects nothing.', 'Use a format that cannot name code, and make it tamper proof.'] }
    }
  },
  {
    slug: 'vulnerable-dependency', n: 7, track: T, title: 'The dependency you did not read', kind: 'Vulnerable dependency', level: 'Core', minutes: 7,
    brief: '17:10. A pull request adds a small date formatting package. The build passes. You are asked whether it is safe to ship tonight.',
    insight: 'You added one package. It brought a second one with it, and the second one has a known hole.',
    teaches: ['Every dependency is code you run, including the ones you never chose', 'Software composition analysis in CI fails the build on known vulnerable versions', 'Update and pin, rather than ignore, and do not switch the check off'],
    app: 'Dependency review: pull request 412', sub: 'portal-api · pull request', banner: 'Review the new dependency',
    files: [
      F('portal/package.json', 'JSON', ['{', '  "dependencies": {', '    "tiny-date-format": "^1.2.0",', '    "router-kit": "^4.1.0"', '  }', '}'], [3]),
      F('portal/package-lock.json', 'JSON', ['tiny-date-format 1.2.0', '  requires yaml-lite ~0.4.1', 'yaml-lite 0.4.1          <-- pulled in, never chosen', 'router-kit 4.1.3']),
      F('.ci/pipeline.yml', 'CI', ['steps:', '  - install', '  - lint', '  - test', '  - deploy      # no dependency audit step'], [5])
    ],
    intro: 'The pipeline never checks the packages themselves. Run the audit, then see whether the hole in the package you did not choose can be reached.',
    attempts: [
      A('tests', 'Run the build and the tests', 'npm ci && npm test', 'PASS  41 tests\nBuild succeeded.', 'PASS  41 tests\nBuild succeeded.'),
      A('audit', 'Run a dependency audit', 'npm audit', 'CRITICAL  yaml-lite < 0.4.3  prototype pollution\n  path: tiny-date-format > yaml-lite\n  advisory: attacker controlled input can set properties on every object\n\n1 critical vulnerability.', 'found 0 vulnerabilities', true),
      A('reach', 'Send a crafted document to the import page', 'POST /import   (a document with a "__proto__" key)', 'HTTP 200\nServer state: every object now has isAdmin = true\n\nThe hole in the package you did not choose is reachable from the internet.', 'HTTP 200\nDocument imported. Nothing else changed.', true)
    ],
    fixPrompt: 'Pick every change that closes this hole and makes sure the next one is caught before it ships.',
    options: [
      O('upd', 'Update to a patched version and commit the lock file', true, ['- yaml-lite 0.4.1', '+ yaml-lite 0.4.5   # patched'], 'The vulnerable code is gone from what ships.'),
      O('sca', 'Add a dependency audit step that fails the build on high severity findings', true, ['+ steps:', '+   - audit --fail-on high      # before deploy'], 'Catches the next known bad version automatically, instead of relying on someone remembering to look.'),
      O('pin', 'Pin exact versions, and take updates through reviewed automated pull requests', true, ['- "tiny-date-format": "^1.2.0"', '+ "tiny-date-format": "1.2.4"'], 'You control when new code arrives, and every change is a diff a person can read.'),
      O('ign', 'Add the advisory to an ignore list, it is only a transitive dependency', 'weak', ['+ audit-ignore: yaml-lite'], 'The hole is just as reachable. Transitive means you did not choose it, not that it is safe.'),
      O('drop', 'Delete the package-lock file so the build always takes the latest', false, ['- package-lock.json'], 'Unpinned installs make builds unrepeatable, and let a bad new version in without review.')
    ],
    cards: {
      x: { t: 'A hole in a package nobody chose', b: ['The date package pulled in a YAML library with a known critical flaw, and the import page fed it attacker controlled input. Every test passed, because nothing tests for this.', 'The pipeline had no audit step, so nothing was ever going to notice.'] },
      f: { t: 'Patched, pinned, and watched', b: ['The patched version removes the flaw. The audit step means the next vulnerable version fails the build instead of shipping, and pinning with reviewed updates means new code does not arrive unseen.', 'Trust in a package is a decision, not a default.'] },
      w: { t: 'Ignoring it does not make it safe', b: ['Adding the advisory to an ignore list, or deleting the lock file, hides the warning and leaves the hole open, and the second option makes it worse. “It is only a transitive dependency” is exactly how these get exploited.', 'Fix or replace, and let the pipeline check.'] }
    }
  },
  {
    slug: 'password-storage', n: 8, track: T, title: 'Weak password storage', kind: 'Weak password hashing', level: 'Core', minutes: 7,
    brief: '17:15. A copy of the customer table has appeared on a forum. Security asks how the passwords in it were stored, and how bad that is.',
    insight: 'A fast hash with no salt can be reversed in minutes, and identical passwords show up as identical hashes.',
    teaches: ['Passwords need a slow, salted hash built for the job: argon2id or bcrypt', 'A fast general purpose hash, even a newer one, is the wrong tool', 'A single shared salt in the code does not stop a dictionary attack; migrate existing users on their next sign in'],
    app: 'Password storage review', sub: 'portal-api · main', banner: 'Review how passwords are stored',
    files: [
      F('portal/auth/passwords.js', 'JavaScript', ['const crypto = require(\'crypto\');', '', 'function storePassword(plain) {', "  return crypto.createHash('md5').update(plain).digest('hex');", '}', '', 'function check(plain, stored) {', '  return storePassword(plain) === stored;', '}'], [4]),
      F('portal/db/users_dump.txt', 'Data (leaked)', ['megan@customer.test     5f4dcc3b5aa765d61d8327deb882cf99', 'daniel@customer.test    5f4dcc3b5aa765d61d8327deb882cf99', 'aisha@customer.test     e10adc3949ba59abbe56e057f20f883e', 'carla@customer.test     5f4dcc3b5aa765d61d8327deb882cf99', '...  41,000 rows'])
    ],
    intro: 'You have the leaked table. Look at the hashes, then try to turn them back into passwords, offline, the way an attacker would.',
    attempts: [
      A('login', 'Check a normal sign in', 'POST /login  { "email": "megan@customer.test", "password": "password" }', 'HTTP 200  signed in', 'HTTP 200  signed in'),
      A('dupe', 'Group the hashes in the dump', 'sort users_dump.txt | uniq -c -f1 | sort -rn | head', '  9,812   5f4dcc3b5aa765d61d8327deb882cf99\n  4,107   e10adc3949ba59abbe56e057f20f883e\n  2,890   25d55ad283aa400af464c76d713c07ad\n\nOne hash appears 9,812 times. There is no salt, so the same password gives the same hash for everyone.', 'Every stored value is different, even for the same password.', true),
      A('crack', 'Run a common password list against the dump, offline', 'crack --wordlist top-10-million.txt users_dump.txt', 'Cracked 32,014 of 41,000 (78%) in 4 minutes on one graphics card.\n\nMD5 is built to be fast. That is the problem.', 'Estimated time to crack 1% of the dump: years. Each guess costs real time and memory.', true)
    ],
    fixPrompt: 'Pick every change that makes stolen hashes expensive to crack, and moves the users you already have.',
    options: [
      O('argon', 'Hash with argon2id (or bcrypt), with a random salt per user', true, ["- return crypto.createHash('md5').update(plain).digest('hex');", '+ return argon2id.hash(plain, { memory: 64 * 1024, iterations: 3 });   // salt included and unique'], 'Slow on purpose, memory hungry, and every user gets a different salt, so nothing can be cracked in bulk.'),
      O('mig', 'Upgrade existing users: verify with the old hash, then re-hash on their next sign in', true, ['+ if (looksLikeMd5(stored) && md5(plain) === stored) { save(user, storePassword(plain)); return true; }'], 'Nobody is locked out, and old hashes disappear as people sign in. You can also wrap the old hashes in the new one straight away.'),
      O('sha', 'Switch from MD5 to SHA-256', 'weak', ["- createHash('md5')", "+ createHash('sha256')"], 'Still a fast hash. A graphics card tries billions of SHA-256 guesses a second. Only the slow, salted functions work.'),
      O('salt', 'Add one secret string to every password before hashing', 'weak', ["+ createHash('md5').update(plain + 'vlx-2019-secret')"], 'One shared salt still gives identical hashes for identical passwords, and once it leaks (it is in the code) the whole table is open again.'),
      O('len', 'Require 12 character passwords from now on', false, ['+ if (plain.length < 12) throw new Error("too short");'], 'A good policy, but it does not change how the ones already stolen are stored.')
    ],
    cards: {
      x: { t: '78% of the table, in four minutes', b: ['MD5 with no salt means one guess tests every user at once, and it runs at billions per second. The most common password appears 9,812 times, all with the same hash.', 'The leak itself was bad. The storage made it far worse.'] },
      f: { t: 'Slow, salted, and moving everyone across', b: ['Argon2id is deliberately slow and memory hungry, and each user gets their own random salt, so an attacker must attack one account at a time at real cost. Re-hashing at sign in moves your existing users without locking anyone out.', 'Store passwords so that a stolen table is a problem for the attacker.'] },
      w: { t: 'Still fast, still crackable', b: ['SHA-256 is another fast hash, and one global salt in the code is a secret an attacker gets with the code. Both still fall to a wordlist in minutes.', 'The property that matters is slowness, per user, on purpose.'] }
    }
  }
];
