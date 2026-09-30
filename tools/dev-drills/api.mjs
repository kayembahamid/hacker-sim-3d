import { F, A, O } from './helpers.mjs';

// API Security: six exploit then fix drills, one per common OWASP API risk.
const T = 'api-security';

export const api = [
  {
    slug: 'bola', n: 1, track: T, title: 'The id you can change', kind: 'Broken object level authorization', level: 'Core', minutes: 8,
    brief: '17:20. The mobile app calls the orders API. A partner reports that changing one number in a request returned somebody else\'s order.',
    insight: 'The API checks that the caller has a valid token, and never that the order is theirs.',
    teaches: ['Every endpoint that takes an object id must check the caller may access that object', 'Scope the data access itself, and test other people\'s ids in CI', 'Random ids and hidden fields are not authorization'],
    app: 'Orders API', sub: 'api.veltrix-logistics.com · staging', banner: 'Review the orders endpoint',
    files: [
      F('api/orders.js', 'JavaScript', ["router.get('/v1/orders/:id', requireToken, async (req, res) => {", '  const order = await Orders.find(req.params.id);', '  if (!order) return res.status(404).json({ error: \'not_found\' });', '  res.json(order);', '});'], [2, 4]),
      F('api/README.md', 'Notes', ['Auth: bearer token, one per customer account.', 'Orders belong to a customer: order.customerId.'])
    ],
    intro: 'You hold a valid token for customer 88, who owns order 1002. Ask for your order, then for the next number along.',
    attempts: [
      A('mine', 'GET your own order, 1002', 'GET /v1/orders/1002\nAuthorization: Bearer <token for customer 88>', 'HTTP 200\n{ "id": 1002, "customerId": 88, "total": 214.50, "address": "12 Kirk Lane, Leeds" }', 'HTTP 200\n{ "id": 1002, "customerId": 88, "total": 214.50, "address": "12 Kirk Lane, Leeds" }'),
      A('next', 'GET order 1003', 'GET /v1/orders/1003\nAuthorization: Bearer <token for customer 88>', 'HTTP 200\n{ "id": 1003, "customerId": 91, "total": 1890.00, "address": "Unit 4, Hartley Industrial Estate", "contact": "Daniel Okoro" }\n\nA valid token, someone else\'s order.', 'HTTP 404\n{ "error": "not_found" }', true),
      A('loop', 'Loop over 1000 to 1500', 'for id in 1000..1500: GET /v1/orders/{id}', '501 requests, 501 x HTTP 200.\nEvery order in the range was returned: 47 customers\' details.', '501 requests: 1 x HTTP 200 (yours), 500 x HTTP 404.', true)
    ],
    fixPrompt: 'Pick every change that makes the API check ownership of the object, and keeps it checked as the API grows.',
    options: [
      O('scope', 'Scope the data access to the caller: look up by id and customer', true, ["- const order = await Orders.find(req.params.id);", '+ const order = await Orders.findOne({ id: req.params.id, customerId: req.auth.customerId });'], 'The API only returns an object that belongs to the caller. Return not found for everything else so ids cannot be probed.'),
      O('test', 'Add a test that requests another customer\'s object and expects not found', true, ["+ test('customer 88 cannot read order 1003', async () => expect(await get('/v1/orders/1003', as(88))).toBe(404));"], 'The check becomes part of the build, so the next endpoint cannot quietly skip it.'),
      O('uuid', 'Switch to random UUIDs for order ids', 'weak', ['- /v1/orders/1003', '+ /v1/orders/7f3a9c2e-51d4-4b0e-9a11-c2d05e8b4f62'], 'Harder to guess, but ids leak in emails, logs and shared links, and whoever holds one can read the order.'),
      O('role', 'Only check that the token is valid, and that the caller has the customer role', 'weak', ["+ if (!req.auth.roles.includes('customer')) return res.status(403).end();"], 'Every customer has that role, so it lets everyone in. The question is not what the caller is, but whose object this is.'),
      O('rate', 'Rate limit the orders endpoint', false, ['+ limit: 60 requests / minute / token'], 'Slows scraping, but one request is enough to read someone\'s order.')
    ],
    cards: {
      x: { t: 'A valid token, someone else\'s order', b: ['The API authenticated the caller and then returned whatever object the id named. Order 1003 belongs to another customer and came back complete, and a loop returned 47 customers\' details in seconds.', 'This is number one on the API list because it is the easiest thing to forget.'] },
      f: { t: 'The object belongs to the caller, or it does not exist', b: ['Scoping the lookup by customer means the data layer only ever returns the caller\'s own objects. The test turns “someone else\'s id” into a build failure, so the next endpoint cannot skip the check.', 'Check the object, not just the caller.'] },
      w: { t: 'Guessing was never the problem', b: ['UUIDs make ids hard to guess, but any id that ever leaks is still readable by anyone, because the server still does not check ownership. A role check lets every customer in, since they all have the role.', 'Ownership of the object is the check.'] }
    }
  },
  {
    slug: 'mass-assignment', n: 2, track: T, title: 'Mass assignment', kind: 'Mass assignment', level: 'Core', minutes: 7,
    brief: '17:25. The profile update endpoint was written to be flexible: it saves whatever fields it is sent. A tester says it saved something it should not.',
    insight: 'The endpoint copies every field the client sends onto the user record, including ones the client should never touch.',
    teaches: ['Bind only an allowlist of fields the caller is allowed to change', 'Validate the shape of the request, and reject unknown fields', 'Sensitive fields change through their own, separately authorised route'],
    app: 'Profile API', sub: 'api.veltrix-logistics.com · staging', banner: 'Review the profile update endpoint',
    files: [
      F('api/profile.js', 'JavaScript', ["router.patch('/v1/me', requireToken, async (req, res) => {", '  const user = await Users.find(req.auth.userId);', '  Object.assign(user, req.body);       // save whatever was sent', '  await user.save();', '  res.json(user);', '});'], [3]),
      F('api/models/user.js', 'JavaScript', ['// fields: id, displayName, email, phone,', '//         role, creditLimit, isVerified'])
    ],
    intro: 'The app sends { "displayName": ... }. See what else the endpoint is willing to save.',
    attempts: [
      A('name', 'Change your display name', 'PATCH /v1/me\n{ "displayName": "Sam R" }', 'HTTP 200\n{ "id": 88, "displayName": "Sam R", "role": "customer", "creditLimit": 500 }', 'HTTP 200\n{ "id": 88, "displayName": "Sam R" }'),
      A('role', 'Add "role": "admin" to the request', 'PATCH /v1/me\n{ "displayName": "Sam R", "role": "admin" }', 'HTTP 200\n{ "id": 88, "displayName": "Sam R", "role": "admin", "creditLimit": 500 }\n\nA customer just made themselves an administrator.', 'HTTP 400\n{ "error": "unknown_field", "field": "role" }', true),
      A('credit', 'Add "creditLimit": 99999', 'PATCH /v1/me\n{ "creditLimit": 99999 }', 'HTTP 200\n{ "id": 88, "creditLimit": 99999 }\n\nThe customer raised their own credit limit.', 'HTTP 400\n{ "error": "unknown_field", "field": "creditLimit" }', true)
    ],
    fixPrompt: 'Pick every change that decides which fields the caller may set, and keeps sensitive fields on a route of their own.',
    options: [
      O('allow', 'Copy only an allowlist of writable fields', true, ['- Object.assign(user, req.body);', "+ const { displayName, phone } = req.body;", '+ Object.assign(user, { displayName, phone });'], 'The endpoint can only change what you named. New fields on the model are safe by default.'),
      O('schema', 'Validate the request against a schema and reject unknown fields', true, ["+ const body = validate({ displayName: 'string?', phone: 'string?' }, req.body, { additional: false });"], 'A clear, failing response for extra fields catches mistakes and probing early.'),
      O('admin', 'Change role and credit only through separate admin routes with their own authorization', true, ["+ router.patch('/v1/admin/users/:id/role', requireRole('admin'), setRole);"], 'Sensitive fields have their own, stricter route, so they can never ride along on an ordinary update.'),
      O('docs', 'Leave the field out of the public API documentation', 'weak', ['- role (string) The user\'s role'], 'Attackers do not read your documentation. They read your responses, and the field is right there.'),
      O('ui', 'Only send role and credit from the admin screen of the app', 'weak', ['+ if (!isAdminScreen) delete payload.role;'], 'The attacker sends the request themselves. What the app happens to send is not a control.')
    ],
    cards: {
      x: { t: 'An ordinary customer, now an administrator', b: ['The endpoint copied every field in the request onto the user record. One extra line in the request set the role to admin, and another raised the credit limit.', 'The model has fields the API never meant a customer to touch.'] },
      f: { t: 'The caller can only change what you named', b: ['An allowlist decides which fields are writable, a schema rejects everything else with a clear error, and the sensitive fields live on separate, separately authorised routes.', 'Never bind a request straight to a model.'] },
      w: { t: 'Hiding it did not stop it', b: ['Removing the field from the documentation or the app screen only changes what honest users see. The request still works, because the server still saves whatever it is sent.', 'The server has to decide which fields are allowed.'] }
    }
  },
  {
    slug: 'no-rate-limit', n: 3, track: T, title: 'No rate limit, no mercy', kind: 'Unrestricted resource consumption', level: 'Foundational', minutes: 6,
    brief: '17:30. Monitoring shows the sign in endpoint doing forty thousand requests in ten minutes, from a handful of addresses. Nothing is slowing them down.',
    insight: 'The endpoint answers as fast as it is asked, forever, so guessing is free.',
    teaches: ['Limit attempts per account and per source, and back off or lock after failures', 'Alert on spikes of failed sign ins so a person notices', 'A vaguer error message helps, but it is not a limit; a CAPTCHA on one client is not a limit either'],
    app: 'Sign in endpoint', sub: 'api.veltrix-logistics.com · production logs', banner: 'Investigate the sign in traffic',
    files: [
      F('api/auth.js', 'JavaScript', ["router.post('/v1/login', async (req, res) => {", '  const user = await Users.byEmail(req.body.email);', '  if (!user || !verify(req.body.password, user.hash)) return res.status(401).json({ error: \'bad_credentials\' });', '  res.json({ token: sign(user) });', '});'], [1]),
      F('api/gateway.yml', 'Config', ['routes:', '  /v1/login:', '    rate_limit: none', '    lockout: none', '    alerts: none'], [3, 4, 5])
    ],
    intro: 'Replay what the attacker did, against staging. Start with one careful guess, then a burst.',
    attempts: [
      A('one', 'Sign in once, with a wrong password', 'POST /v1/login\n{ "email": "megan@customer.test", "password": "hunter2" }', 'HTTP 401\n{ "error": "bad_credentials" }', 'HTTP 401\n{ "error": "bad_credentials" }'),
      A('burst', 'Try 5,000 passwords on one account in a minute', 'for pw in wordlist[0..5000]: POST /v1/login  email=megan@customer.test', '4,999 x HTTP 401\n1 x HTTP 200  (password: "Summer2026!")\n\nSigned in as Megan after 96 seconds. Nothing slowed down, locked, or alerted.', '3 x HTTP 401\n47 x HTTP 429  Too many attempts. Try again in 15 minutes.\nAccount locked for 15 minutes. Alert raised: "1,200 failed sign ins for one account".', true),
      A('stuff', 'Try one leaked password across 2,000 accounts', 'for email in leaked_list[0..2000]: POST /v1/login  password="Summer2026!"', '2,000 requests, 31 x HTTP 200\n\n31 accounts opened with one password. Nothing counted them.', '60 x HTTP 401, then HTTP 429 for that source address.\nAlert raised: "1 address, 60 different accounts".', true)
    ],
    fixPrompt: 'Pick every change that limits the guessing, and makes sure a person is told when it happens.',
    options: [
      O('limit', 'Rate limit per account and per source address', true, ['+ /v1/login:', '+   rate_limit: 5 per minute per account, 30 per minute per address'], 'Guessing at speed stops working, both against one account and across many.'),
      O('lock', 'Back off and temporarily lock after repeated failures, and add a second factor for risky sign ins', true, ['+   lockout: 5 failures -> 15 minutes, doubling', '+   step_up: mfa when new device or country'], 'A guessed password alone is no longer enough to get in.'),
      O('alert', 'Alert on spikes of failed sign ins, per account and per address', true, ['+   alerts: failed_login_rate > 100 / 5 min -> page security'], 'A person finds out in minutes, not after the customers complain.'),
      O('vague', 'Make the error message vaguer', 'weak', ["+ res.status(401).json({ error: 'try again' });"], 'Helps a little against knowing which emails exist. It does nothing to the speed of guessing.'),
      O('captcha', 'Add a CAPTCHA to the website login form', 'weak', ['+ <div class="captcha"></div>'], 'The attacker uses the API directly and never sees the form.')
    ],
    cards: {
      x: { t: 'Guessing was free', b: ['With no limit, no lockout and no alert, one account fell to a wordlist in 96 seconds, and a single leaked password opened 31 accounts. Nothing noticed either.', 'This is credential stuffing: not clever, just unmetered.'] },
      f: { t: 'Slow, locked, and noticed', b: ['Rate limits per account and per address stop both the burst and the spray. Backoff and a second factor mean a guessed password is not enough, and an alert means a person knows within minutes.', 'Every layer is cheap. Together they turn free guessing into a losing bet.'] },
      w: { t: 'The wrong layer', b: ['A vaguer message and a CAPTCHA on the website change how the front door looks. The API is still open, and attackers use the API. Neither slows a script, and neither tells anyone it is happening.', 'Limit the attempts, and alert on them.'] }
    }
  },
  {
    slug: 'over-privileged-key', n: 4, track: T, title: 'The over-privileged key', kind: 'Over privileged API key', level: 'Core', minutes: 7,
    brief: '17:35. A researcher extracted a key from the mobile app package and used it against production. The key can do everything, for every customer.',
    insight: 'One key, shipped to every phone, that is allowed to do anything to any tenant.',
    teaches: ['A secret shipped in a client is public: assume everyone has it', 'Users get short lived, scoped tokens; the app gets no standing power', 'Rotate the leaked key, and grant only the scopes each caller needs'],
    app: 'Mobile app API access', sub: 'api.veltrix-logistics.com · mobile', banner: 'Investigate the leaked mobile key',
    files: [
      F('mobile/src/config.js', 'JavaScript', ["export const API_BASE = 'https://api.veltrix-logistics.com';", "export const API_KEY  = 'vlx_live_admin_9f2c81ab77d0';   // scopes: *  tenants: *"], [2]),
      F('api/keys.yml', 'Config', ['vlx_live_admin_9f2c81ab77d0:', '  scopes: ["*"]', '  tenants: ["*"]', '  expires: never'], [2, 3, 4])
    ],
    intro: 'The key is readable in the app package. See what it can do, then see what a properly scoped one would allow.',
    attempts: [
      A('extract', 'Extract the key from the app package', 'strings VeltrixMobile.apk | grep vlx_live', 'vlx_live_admin_9f2c81ab77d0\n\nEvery installed copy of the app contains it.', 'No long lived key in the package. The app signs users in and receives a short lived token.', true),
      A('cross', 'Use the key to list another tenant\'s shipments', 'GET /v1/tenants/kestrel-freight/shipments\nX-Api-Key: vlx_live_admin_9f2c81ab77d0', 'HTTP 200\n[ ...4,812 shipments for another company... ]\n\nOne key, every tenant.', 'HTTP 403\n{ "error": "token_not_valid_for_tenant" }', true),
      A('delete', 'Use the key to delete a shipment record', 'DELETE /v1/tenants/veltrix/shipments/88213\nX-Api-Key: vlx_live_admin_9f2c81ab77d0', 'HTTP 204\nDeleted. The key has write and delete on everything.', 'HTTP 403\n{ "error": "scope_missing", "needed": "shipments:delete" }', true),
      A('normal', 'Track your own parcel in the app', 'GET /v1/me/shipments/88213\nAuthorization: Bearer <your short lived token>', 'HTTP 200\n{ "status": "out for delivery" }', 'HTTP 200\n{ "status": "out for delivery" }')
    ],
    fixPrompt: 'Pick every change that removes the standing power from the app, and deals with the key that already leaked.',
    options: [
      O('token', 'Have the app sign the user in and use a short lived, per user token', true, ['- X-Api-Key: vlx_live_admin_9f2c81ab77d0', '+ Authorization: Bearer <token issued at sign in, 15 minutes>'], 'There is no secret in the package to steal, and a stolen token expires quickly and only reaches that user.'),
      O('scope', 'Issue keys and tokens with least privilege scopes, tied to one tenant', true, ['+ scopes: ["shipments:read"]', '+ tenant: "veltrix"', '+ expires: 15m'], 'Even a token that leaks can only read one tenant\'s own shipments.'),
      O('rotate', 'Revoke and rotate the leaked key now', true, ['+ revoke vlx_live_admin_9f2c81ab77d0'], 'The key is public, so only revoking it stops it working. Nothing else does.'),
      O('obf', 'Obfuscate the key inside the app', 'weak', ["- API_KEY = 'vlx_live_admin_9f2c81ab77d0'", "+ API_KEY = decode('dmx4X2xpdmVf...')"], 'The app has to decode it to use it, so anyone can too. Obfuscation slows a researcher by minutes.'),
      O('ua', 'Only accept the key from our app\'s User-Agent', 'weak', ['+ if (req.headers[\'user-agent\'] !== \'VeltrixMobile/3\') deny();'], 'The User-Agent is a header the caller writes. Anyone can send it.')
    ],
    cards: {
      x: { t: 'One key, every customer', b: ['The key sat in every copy of the app. With it, a researcher read another company\'s shipments and deleted records, because the key had every scope on every tenant and never expired.', 'Anything shipped inside an app is public.'] },
      f: { t: 'No standing secret, and nothing broad to steal', b: ['Users sign in and receive short lived tokens tied to them and one tenant, so there is nothing in the package to extract. Scopes are the minimum each caller needs, and the leaked key is revoked so it opens nothing.', 'Least privilege is what limits the damage when something leaks.'] },
      w: { t: 'Hidden in plain sight', b: ['Obfuscating the key or checking a header slows nobody down: the app must be able to use the key, so anyone can, and headers are written by the caller. The leaked key is still live.', 'Take the secret out of the app, and revoke the one that is out.'] }
    }
  },
  {
    slug: 'excessive-data-exposure', n: 5, track: T, title: 'Data the endpoint should not return', kind: 'Excessive data exposure', level: 'Core', minutes: 7,
    brief: '17:40. The profile screen shows a name and a photo. A researcher opened the network tab and found a lot more in the response.',
    insight: 'The app only displays the name. The server sends the whole row.',
    teaches: ['The server decides what a response contains, not the client', 'Return an explicit list of fields for each audience', 'Password hashes and internal flags never belong in an API response'],
    app: 'User API', sub: 'api.veltrix-logistics.com · staging', banner: 'Review the user endpoint response',
    files: [
      F('api/users.js', 'JavaScript', ["router.get('/v1/users/:id', requireToken, async (req, res) => {", '  const user = await Users.find(req.params.id);', '  res.json(user);                 // the whole row, the app picks what to show', '});'], [3]),
      F('api/models/user.js', 'JavaScript', ['// columns: id, displayName, photoUrl, email, phone, pwHash,', '//          internalNotes, fraudScore, isStaff, lastLoginIp'])
    ],
    intro: 'Open the profile screen, then look at what actually arrives over the wire.',
    attempts: [
      A('screen', 'View the profile screen', 'GET /v1/users/88  (what the app shows)', 'The screen shows:\n  Megan Holt\n  [photo]', 'The screen shows:\n  Megan Holt\n  [photo]'),
      A('raw', 'Read the raw JSON response', 'GET /v1/users/88\nAuthorization: Bearer <token>', 'HTTP 200\n{ "id": 88, "displayName": "Megan Holt", "photoUrl": "...",\n  "email": "megan@customer.test", "phone": "07700 900311",\n  "pwHash": "5f4dcc3b5aa765d61d8327deb882cf99",\n  "internalNotes": "chargeback dispute Oct, watch",\n  "fraudScore": 0.72, "isStaff": false, "lastLoginIp": "203.0.113.19" }\n\nThe password hash, the fraud score and a staff note, for anyone who can call the API.', 'HTTP 200\n{ "id": 88, "displayName": "Megan Holt", "photoUrl": "..." }', true),
      A('other', 'Read another user\'s profile the same way', 'GET /v1/users/91\nAuthorization: Bearer <token for user 88>', 'HTTP 200\n{ ...another customer\'s email, phone, hash and notes... }', 'HTTP 200\n{ "id": 91, "displayName": "Daniel Okoro", "photoUrl": "..." }', true)
    ],
    fixPrompt: 'Pick every change that makes the server decide exactly what leaves, and takes things that should never leave out of reach.',
    options: [
      O('dto', 'Return an explicit response shape with only the fields each audience needs', true, ['- res.json(user);', '+ res.json({ id: user.id, displayName: user.displayName, photoUrl: user.photoUrl });'], 'A new column added tomorrow does not leak by default. The response lists what is allowed.'),
      O('role', 'Give staff and internal fields their own role gated endpoint', true, ["+ router.get('/v1/internal/users/:id', requireRole('support'), internalView);"], 'Support can still see what they need, and nobody else can.'),
      O('hash', 'Never load the password hash and fraud score into API code at all', true, ["+ Users.find(id, { exclude: ['pwHash', 'fraudScore'] })"], 'Data that never reaches the handler cannot be returned by a mistake.'),
      O('ui', 'Hide the extra fields in the app\'s code', 'weak', ['+ const { displayName, photoUrl } = response;   // ignore the rest'], 'The data still travels over the network. Anyone with a proxy or the network tab reads all of it.'),
      O('gzip', 'Compress the response', false, ['+ res.setHeader(\'Content-Encoding\', \'gzip\');'], 'Compression hides nothing from the person receiving the response.')
    ],
    cards: {
      x: { t: 'The app showed a name. The wire carried the rest', b: ['The screen only displayed a name and a photo, but the API returned the whole database row: a password hash, a fraud score, a staff note. Anyone who can call the endpoint, or open the network tab, reads them all.', 'And with no ownership check, they can read other people\'s too.'] },
      f: { t: 'The server lists what leaves', b: ['An explicit response shape means only named fields are returned, and a new sensitive column cannot leak by accident. Internal fields live behind a staff only route, and the hash never even reaches the handler.', 'Filter on the server, always.'] },
      w: { t: 'Hidden on screen, wide open on the wire', b: ['Ignoring fields in the app changes what the screen draws. The response still contains everything, and it takes one proxy or the browser\'s network tab to read it.', 'The server decides what is returned.'] }
    }
  },
  {
    slug: 'improper-inventory', n: 6, track: T, title: 'The forgotten v1 endpoint', kind: 'Improper inventory management', level: 'Advanced', minutes: 8,
    brief: '17:45. Version 2 of the orders API was fixed last month, after the id bug. A scan shows someone still pulling orders through a URL that starts /v1.',
    insight: 'The fix went into v2. Nobody remembered v1 was still running.',
    teaches: ['Every endpoint and version that is live is part of your attack surface', 'Keep an owned inventory with sunset dates, and scan the gateway against it', 'Retire old versions properly: a clear error, not a quiet hiding place'],
    app: 'API gateway review', sub: 'api.veltrix-logistics.com · gateway', banner: 'Find the endpoint nobody owns',
    files: [
      F('gateway/routes.yml', 'Config', ['routes:', '  /v2/orders:   { upstream: orders-service:v2,  auth: object_level, rate_limit: 60/m }', '  /v1/orders:   { upstream: orders-service:v1,  auth: token_only,   rate_limit: none }', '  /v1/export:   { upstream: legacy-export,     auth: token_only,   rate_limit: none }'], [3, 4]),
      F('docs/api-inventory.md', 'Notes', ['# API inventory', '| path       | owner          | status |', '| /v2/orders | orders team    | live   |', '', '(v1 is not listed anywhere)'], [5])
    ],
    intro: 'The current version refuses another customer\'s order. Try the same request against the older one.',
    attempts: [
      A('v2', 'Ask v2 for another customer\'s order', 'GET /v2/orders/1003   (signed in as customer 88)', 'HTTP 404\n{ "error": "not_found" }\n\nv2 checks ownership. This is the fixed version.', 'HTTP 404\n{ "error": "not_found" }'),
      A('v1', 'Ask v1 for the same order', 'GET /v1/orders/1003   (signed in as customer 88)', 'HTTP 200\n{ "id": 1003, "customerId": 91, "address": "Unit 4, Hartley Industrial Estate" }\n\nThe old version is live, unpatched, and has no rate limit.', 'HTTP 410 Gone\n{ "error": "v1 was retired on 30 June. Use /v2." }', true),
      A('export', 'Try the forgotten export route', 'GET /v1/export?since=2020-01-01', 'HTTP 200\n38,412 customer rows (CSV)\n\nA legacy export nobody remembered, open to any valid token.', 'HTTP 410 Gone', true)
    ],
    fixPrompt: 'Pick every change that closes the old version for good, and makes sure the next forgotten endpoint is found.',
    options: [
      O('retire', 'Retire v1: return 410 Gone, then remove the route and the old service', true, ['- /v1/orders:  { upstream: orders-service:v1 ... }', '- /v1/export:  { upstream: legacy-export ... }', '+ /v1/*:       { respond: 410 }'], 'A clear, final answer. The unpatched code stops receiving traffic and then stops existing.'),
      O('inv', 'Keep an owned inventory of every route, with a status and a sunset date, and check the gateway against it', true, ['+ docs/api-inventory.md: every route, owner, status, sunset', '+ ci: fail if gateway has a route not in the inventory'], 'The next forgotten endpoint fails the build instead of waiting to be found by someone else.'),
      O('scan', 'Scan the gateway for undocumented routes on a schedule', true, ['+ weekly: discover-routes api.veltrix-logistics.com --compare inventory'], 'Finds what has been added outside the process, including by other teams.'),
      O('hide', 'Move v1 to an unlisted path', 'weak', ['- /v1/orders', '+ /internal-old-8f3k/orders'], 'Security through a secret address. It shows up in traffic logs and scans, and it is still unpatched.'),
      O('hdr', 'Add a deprecation warning header to v1 responses', 'weak', ['+ Deprecation: true'], 'A header is a note, not a control. The data is still returned to anyone who asks.')
    ],
    cards: {
      x: { t: 'The bug was fixed, in the version nobody used', b: ['v2 checks ownership. v1, still running with no rate limit, does not, and a legacy export route returns the entire customer table. Both were absent from every list the team kept.', 'You cannot patch what you do not know you run.'] },
      f: { t: 'Nothing is live that nobody owns', b: ['Retiring v1 with a clear error removes the vulnerable code from the road. The inventory, with owners and sunset dates, and the scan that compares it to the gateway, make the next forgotten route show up as a failed build.', 'An inventory of your endpoints is a security control.'] },
      w: { t: 'Hidden is not gone', b: ['Moving v1 to an odd path or adding a header leaves the same unpatched code answering requests. Odd paths turn up in logs and scans, and a header stops nobody.', 'Retire it, and keep the inventory honest.'] }
    }
  }
];
