# Adversarial security review — Laboratorium

Authorized adversarial security testing of the Laboratorium platform, performed
against a locally-spawned instance of the app on a disposable SQLite database
under `adversarial-review/tmp-db/` (auto-created and auto-deleted by each
test). **No test in this directory ever touches the real `laboratorium.db` at
the repo root, `.env`, or `laboratorium.club`.** No source file outside this
directory was modified.

The findings below were proven against the code as reviewed. **They have since
been fixed in the application.** The `node --test` files in this directory are
now **regression tests**: a green run means the vulnerability is closed.

## How to run

```bash
# one-time setup: install deps, then swap in a better-sqlite3 build
# compatible with the locally installed Node version (this environment has
# Node 26; the version pinned in package.json only ships prebuilds up to
# Node ~22 and fails to compile from source against newer V8 headers).
# This installs into node_modules only (gitignored) — package.json and
# package-lock.json were NOT modified.
npm install --ignore-scripts
npm install better-sqlite3@13.0.3 --no-save

# run one finding at a time
node --test adversarial-review/hardcoded-default-credentials.test.js

# ...or run the whole suite
for f in adversarial-review/*.test.js; do node --test "$f"; done
```

## Findings summary

| # | Severity | Finding | Files | Test |
|---|----------|---------|-------|------|
| 1 | **Critical** | Hardcoded owner/test-account credentials are auto-(re)created on every server start, even in the recommended production config | `server/db/seed.js`, `.env.example` | `hardcoded-default-credentials.test.js` |
| 2 | **Critical** | Default JWT signing secret allows forging tokens for any user/role if `JWT_SECRET` isn't set | `server/config/index.js`, `server/middleware/auth.js` | `weak-jwt-secret-forgery.test.js` |
| 3 | **Critical** | OS command injection (→ RCE) via the `image` field of the Docker deploy API, when `LAB_USE_LOCAL_DOCKER=true` | `server/services/lab-agent.service.js`, `server/services/lab.service.js` | `lab-docker-command-injection.test.js` |
| 4 | **Critical** | Stored XSS via chat file upload (extension/declared-mimetype confusion) → JWT theft from `localStorage` | `server/middleware/upload.js`, `server/app.js` | `chat-upload-stored-xss.test.js` |
| 5 | **High** | CTF flag oracle — hardcoded flags are handed back in plaintext by the "mock demo" pages, letting any student claim full bounty (1130 pts across 8 challenges) with no real exploitation | `server/services/ctf-demo-flags.js`, `server/services/ctf.service.js`, `server/controllers/ctf-demo.controller.js` | `ctf-flag-oracle.test.js` |
| 6 | **High** | Mass assignment in conference creation — `hostId`/`hostRole` are client-overridable, bypassing the "teacher must own the group" check and spoofing the conference host identity | `server/controllers/conference.controller.js` | `conference-mass-assignment.test.js` |
| 7 | **Medium** | Broken access control (IDOR) — any authenticated, paying user can list/stream/annotate **any** recording on the platform | `server/services/recording.service.js`, `server/controllers/recording.controller.js` | `recording-idor.test.js` |
| 8 | **Medium** | Mass assignment in recording notes — a note's author (`userId`) can be spoofed to an arbitrary, uninvolved user | `server/controllers/recording.controller.js` | `recording-notes-mass-assignment.test.js` |
| 9 | **Low/Medium** | CORS wildcard + `credentials: true` in the default config reflects any Origin | `server/app.js`, `server/config/index.js` | `cors-wildcard-credentials.test.js` |
| 10 | **Low** | Login timing side-channel enables email enumeration despite an identical error message | `server/services/user.service.js` | `login-timing-email-enumeration.test.js` |

Reproduce any one finding: `node --test adversarial-review/<file>.test.js`.

---

## 1. Critical — Hardcoded default credentials, always re-seeded

**Files:** `server/db/seed.js` (`ensureOwner`, `ensureTestStudent`, `ensureTestTeacher`, `syncCatalog`), `.env.example`
**Test:** `adversarial-review/hardcoded-default-credentials.test.js` (2 assertions, both pass)

`syncCatalog(db)` runs on **every single server start**, in both configurations:
- `SEED_DATABASE=true` → `seedDatabase()` calls `syncCatalog()` at the end.
- `SEED_DATABASE=false` → the setting **`.env.example` itself recommends for
  production** ("`SEED_DATABASE=false на проді — ок`") → `db/index.js` calls
  `syncCatalog()` directly.

`syncCatalog()` unconditionally upserts three accounts using `OWNER_EMAIL` /
`OWNER_PASSWORD` / `TEST_STUDENT_PASSWORD` / `TEST_TEACHER_PASSWORD`
environment variables, **falling back to hardcoded constants if those env
vars are unset**:

```
OWNER_EMAIL    = maks.47.turbo@gmail.com     (the project owner's own email)
OWNER_PASSWORD = LaboratoriumOwner2026
TEST_STUDENT_EMAIL/PASSWORD = test.student@lab.dev / TestLab2026!
TEST_TEACHER_EMAIL/PASSWORD = test.teacher@lab.dev / TestTeacher2026!
```

These same fallback values are also written out explicitly in `.env.example`
as the literal example values to copy into `.env`. Whoever has read this
source tree (which now includes this security review) knows working
credentials for a top-privilege **owner** account unless every one of the
four env vars above has been overridden in the real deployment.

Worse: because this runs on *every* boot, it isn't just an initial-deploy
risk — if an admin notices the test accounts and deletes them, or changes
their password by hand, **the next restart silently recreates them** with
the hardcoded password and the correct role.

**Proof:** the test boots a fresh instance with none of the four env vars
set (simulating a first deploy, or one where they were simply forgotten),
then logs in with the hardcoded owner email/password and hits
`GET /api/admin/users` (the full user roster) successfully, plus confirms the
hardcoded student/teacher accounts also work.

**Recommendation:** never fall back to a hardcoded password for a real
account. Fail fast (refuse to start) if `OWNER_PASSWORD` is unset in
production, generate a random one-time password and print it once, or drop
the test-account auto-provisioning outside of an explicit
`NODE_ENV=development`/`SEED_DATABASE=true` path. **Given the email matches
the project owner's real address, verify immediately whether the real
production `.env` actually sets `OWNER_PASSWORD` — if not, this exact
password is live right now.**

## 2. Critical — Default JWT secret enables full auth forgery

**Files:** `server/config/index.js`, `server/middleware/auth.js`
**Test:** `adversarial-review/weak-jwt-secret-forgery.test.js` (2 assertions, both pass)

```js
jwt: { secret: env('JWT_SECRET', 'lab-dev-secret-change-in-production'), ... }
```

If `JWT_SECRET` is unset, this well-known string is used to sign and verify
**every** auth token. The only safeguard is a `console.warn()` that fires
solely when `NODE_ENV=production` — it does not stop the server, disable the
fallback, or warn in any other mode. `authRequired()` (`server/middleware/auth.js`)
trusts the decoded JWT payload (`{id, email, role}`) with no re-check against
the database.

**Proof:** the test boots the app with `JWT_SECRET` unset, then — entirely
offline, using only the public default string — signs a JWT for a
non-existent user id with `role: 'developer'` and uses it to read the full
user list from `/api/admin/users`, and a second forged `role: 'owner'` token
to reach Proxmox settings.

**Recommendation:** refuse to start (throw, don't warn) if `JWT_SECRET` is
unset or equals the placeholder, in every environment, not just production.

## 3. Critical — OS command injection via Docker `image` field

**Files:** `server/services/lab-agent.service.js` (`localDockerDeploy`, `dockerEnvFlags`), `server/services/lab.service.js` (`deployDocker`), `server/controllers/lab.controller.js`
**Test:** `adversarial-review/lab-docker-command-injection.test.js` (2 assertions, both pass)

```js
execSync(
  `docker run -d --name ${safeName} -p ${port}:${containerPort} ${envFlags} --restart unless-stopped ${image}`,
  { stdio: 'pipe' },
);
```

`safeName` is sanitized to `[a-zA-Z0-9-_]`; `image` — taken directly from the
authenticated request body of `POST /api/lab/docker/deploy`, reachable by any
`student`-role user with default tab access — is **not sanitized at all**,
only checked for non-emptiness. It is interpolated straight into a shell
string run via `execSync` (`/bin/sh -c` on POSIX), so `;`, `` ` ``, `$()`,
`#` etc. are all live shell metacharacters.

This is reachable whenever `LAB_USE_LOCAL_DOCKER=true` — a documented,
explicit opt-in for running CTF containers on the app host without a
separate lab-agent VM (see `.env.example`).

**Proof:** test 1 shows the naive end-to-end HTTP call currently 400s — but
for an *unrelated* reason (`deployContainer`'s `env: envVars = null` default
explicitly overrides `localDockerDeploy`'s own `env: envVars = {}` default,
since JS defaults only fire on `undefined`, not `null` — a separate,
incidental correctness bug, not a security control). Test 2 calls the exact
same `deployContainer()` service function the HTTP endpoint delegates to,
supplying a valid empty `env: {}` to work around only that unrelated bug (the
same workaround `ctf.service.js`'s own `startChallenge()` already applies for
its own, non-attacker-controlled image field), with a malicious `image`
value: `alpine; touch '<marker>' #`. The marker file is created — proof of
arbitrary OS command execution.

**Recommendation:** never interpolate user input into a shell string.
Validate `image` against a strict Docker-reference regex and pass arguments
to `execFileSync('docker', ['run', '-d', '--name', safeName, ...])` (argv
array, no shell) instead of a template-literal shell command.

## 4. Critical — Stored XSS via chat upload extension/MIME-type confusion

**Files:** `server/middleware/upload.js` (`uploadChatMedia`), `server/app.js` (`/uploads` static serving)
**Test:** `adversarial-review/chat-upload-stored-xss.test.js` (1 assertion, passes)

`uploadChatMedia`'s `fileFilter` only checks the client-declared
`file.mimetype` (the multipart part's own `Content-Type` header — fully
attacker-controlled) against an image/video allow-list. The **stored
filename's extension**, however, comes from the equally attacker-controlled
`file.originalname`:

```js
filename: (_req, file, cb) => {
  const ext = extname(file.originalname || '') || '.bin';
  cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
}
```

Nothing ties the extension to the declared (or real) content. An attacker
uploads a part with `Content-Type: image/png` (passes the filter) and
`filename="x.html"`, with an arbitrary HTML/JS body. `express.static` (used
to serve `/uploads`) derives the response `Content-Type` from the extension
on disk, so the file comes back as `text/html` and executes as a full page
on the app's own origin.

Per `public/auth.js`, the session JWT is kept in `localStorage`
(`lab_token`), not an httpOnly cookie — script running on the app origin can
read it directly. Any teacher/student who opens the resulting
`/uploads/chat/....html` link (posted as a normal chat attachment) has their
session token exfiltrated.

**Proof:** the test uploads a part named `profile-pic.html` with declared
`Content-Type: image/png` containing a `<script>` that reads
`localStorage.getItem('lab_token')`, fetches the returned URL back
unauthenticated (as a victim's browser would), and confirms it's served as
`text/html` with the raw, unsanitized script tag intact.

**Recommendation:** derive the stored extension from a server-side mapping
of the *verified* mimetype (not client input), and/or force
`Content-Disposition: attachment` + a fixed safe extension for all
user-uploaded files served from `/uploads`.

## 5. High — CTF flag oracle: hardcoded flags leak via mock demo pages

**Files:** `server/services/ctf-demo-flags.js`, `server/services/ctf.service.js`, `server/controllers/ctf-demo.controller.js`
**Test:** `adversarial-review/ctf-flag-oracle.test.js` (1 assertion, passes)

`ctf-demo-flags.js` hardcodes plaintext flags (`'sql-injection': 'lab{sqli_master}'`,
etc.). `server/db/seed.js` seeds real, bounty-earning challenges with these
exact slugs, and `ctf.service.js`'s `ensureCtfMetadata()` bcrypt-hashes these
same constants into the challenges' real `flag_hash` used by the scoring
endpoint (`POST /api/lab/ctf/:id/flag`).

Whenever lab-agent/Proxmox infra isn't configured (the default —
`labAgent.isAgentEnabled()` is false unless `LAB_AGENT_URL` or
`LAB_USE_LOCAL_DOCKER` is set), starting a challenge hands the student a
"mock demo" page under `/lab/demo/<slug>`. Several of these reveal the
**same plaintext flag** after a trivial, non-representative trigger:
`sql-injection` accepts plain `admin`/`admin`; `buffer-overflow` triggers on
any input over 32 characters; `priv-esc-linux` triggers on any command
containing `"root"`; `ghidra-crackme`'s password is printed in the page's
own hint text.

**Impact:** any student can claim full bounty for all 8 seeded challenges
(1130 points total) with zero real exploitation.

**Proof:** the test starts the real `sql-injection` challenge via the
intended API, submits `admin`/`admin` to the mock demo's login form, scrapes
the flag out of the returned HTML, submits it to the real
`/api/lab/ctf/:id/flag` endpoint, and confirms the full 100-point bounty was
awarded and the user's balance actually increased.

**Recommendation:** the mock/demo fallback should never reveal the exact
string needed for real scoring — use a distinct demo-only flag (or none at
all), and gate/rate-limit flag submission independent of the demo path.

## 6. High — Mass assignment in conference creation

**Files:** `server/controllers/conference.controller.js`
**Test:** `adversarial-review/conference-mass-assignment.test.js` (2 assertions, both pass)

```js
const conf = conferenceService.create({
  hostId: req.user.id,
  hostRole: req.user.role,
  ...req.body,          // spread AFTER the trusted fields — client keys win
});
```

`conference.service.js` only enforces "teachers may only create conferences
for groups they own" when `hostRole === 'teacher'`. A teacher can bypass this
outright by sending any other value in the body (`hostRole: "owner"`, or
anything not literally `"teacher"`), and can separately spoof `hostId` to
attribute the conference to a different, uninvolved user entirely.

**Proof:** test 1 shows the honest client path (no tampering) is correctly
rejected with 403 for a non-owned group, then the exact same request with
`hostRole: "owner"` added succeeds with 201, creating a conference inside a
group the caller doesn't own. Test 2 spoofs `hostId` to a third user and
confirms the resulting conference's `host_user_id` is the spoofed victim,
not the real caller.

**Recommendation:** never spread untrusted `req.body` over/after
server-derived trust fields; destructure only the client-editable fields
explicitly (`title`, `description`, `groupId`, `scheduledAt`, ...).

## 7. Medium — IDOR: any user can read/stream/annotate any recording

**Files:** `server/services/recording.service.js`, `server/controllers/recording.controller.js`
**Test:** `adversarial-review/recording-idor.test.js` (1 assertion, passes)

`recording.service.js`'s `list()` accepts `userId` but never uses it to
filter the SQL query — every recording on the platform is returned to every
caller. `getById()`, the `/stream` download, and `getNotes()`/`addNote()`
perform **no** ownership or group-membership check at all (only `remove()`
checks `uploaded_by`). The route is gated only by `authRequired` +
`requirePlatformAccess` (paid access) + `requireTab('page.recordings')`
(allowed for every role by default) — nothing scopes access to a specific
conference or group.

**Proof:** `userA` uploads a recording titled "Private 1:1 mentoring
session"; `userB`, an unrelated student sharing no group or conference with
`userA`, lists all recordings (finds it), fetches its metadata by id,
downloads the raw file bytes via `/stream`, and successfully posts a note on
it — none of which should be possible for an unrelated user.

**Recommendation:** scope `list()`/`getById()`/`stream`/notes to recordings
the caller either uploaded, or whose associated conference/group they were a
participant/member of (mirroring the pattern already used correctly for
group chat access in `chat.service.js`'s `assertChannelAccess`).

## 8. Medium — Mass assignment: recording note authorship spoofing

**Files:** `server/controllers/recording.controller.js` (`addNote`)
**Test:** `adversarial-review/recording-notes-mass-assignment.test.js` (1 assertion, passes)

Same pattern as finding 6:

```js
const note = recordingService.addNote({
  recordingId: parseInt(req.params.id, 10),
  userId: req.user.id,
  ...req.body,          // client-supplied userId overrides the real one
});
```

**Proof:** the attacker posts a note but includes `userId: <victim's id>` in
the body; the persisted note is attributed to the victim (a teacher who
never touched the endpoint), not the real requester.

**Recommendation:** same as finding 6 — destructure only `content`,
`timestampSeconds`, `isPinned` from the body; never spread raw `req.body`
after a trust-boundary field.

## 9. Low/Medium — CORS wildcard + credentials in default config

**Files:** `server/app.js`, `server/config/index.js`
**Test:** `adversarial-review/cors-wildcard-credentials.test.js` (2 assertions, both pass)

`config.cors.origin` defaults to `'*'` when `CORS_ORIGIN` is unset, which the
app translates to `origin: true` for the `cors` package — this **reflects**
whatever `Origin` header the client sent, combined with `credentials: true`.
This is the classic "reflected origin + credentials" misconfiguration:
literally any website is told it may make credentialed cross-site requests.

Impact is reduced (not eliminated) because the app authenticates with a
Bearer JWT in `localStorage`, not cookies, so a third-party site can't
automatically attach a victim's token — but it remains a real
defense-in-depth gap, and composes with finding 4 (stored XSS): script
already running on the app's own origin is unaffected by CORS anyway, but
any future cookie-based flow, or any embedded/extension context where the
token is reachable cross-origin, would be immediately exploitable from
anywhere.

**Proof:** the test sends both a normal `GET` and an `OPTIONS` preflight
with an arbitrary, unrelated `Origin` header and confirms the server
reflects it back in `Access-Control-Allow-Origin` with
`Access-Control-Allow-Credentials: true`.

**Recommendation:** `.env.example` already sets a real origin for
production — make that mandatory (fail to start without an explicit,
non-wildcard `CORS_ORIGIN` when `credentials: true`).

## 10. Low — Login timing side-channel (email enumeration)

**Files:** `server/services/user.service.js` (`login`)
**Test:** `adversarial-review/login-timing-email-enumeration.test.js` (1 assertion, passes)

```js
const user = findByEmail(email);
if (!user || !bcrypt.compareSync(password, user.password_hash)) { ... }
```

Short-circuit evaluation skips the (slow, ~tens of ms) `bcrypt.compareSync`
entirely when the email doesn't exist. Both cases return an identical
generic error message/status (enumeration via the response *body* is
correctly avoided), but the response *time* differs by roughly two orders of
magnitude and is trivially measurable.

**Proof:** the test measures the median latency of 12 login attempts against
a known, registered email (wrong password) vs. 12 attempts against
never-registered emails, confirms the response bodies are byte-identical,
and asserts the registered-email path is at least 3x slower (actual gap
observed is far larger).

**Recommendation:** always run a dummy `bcrypt.compareSync` against a fixed
hash when the user isn't found, so both branches take comparable time.

---

## Attack surfaces checked and found NOT exploitable (negative coverage)

- **SQL injection** — every query in `server/services/*.js` uses
  `better-sqlite3` `?` placeholders; no string-concatenated SQL was found
  anywhere in the codebase (checked via grep across all services/controllers).
- **Prototype pollution** — the only `...req.body` / `Object.assign` spread
  patterns found (`conference.controller.js`, `recording.controller.js`,
  `api.controller.js`) are plain single-level object-literal spreads, which
  use `[[DefineOwnProperty]]` semantics and cannot pollute
  `Object.prototype` even with a `__proto__` key present in the JSON body;
  no deep-merge utility (e.g. lodash `merge`) is used anywhere that would be
  vulnerable. (They ARE exploitable as *mass assignment*, covered in
  findings 6 and 8.)
- **Password reset token security** — tokens are `crypto.randomBytes(32)`
  (256 bits), stored only as a SHA-256 hash, explicitly invalidated
  (`used_at`) on use, all previously-issued unused tokens for a user are
  invalidated when a new one is requested, and expiry is checked against
  `RESET_TOKEN_HOURS`. No timing or predictability issue found.
  `requestPasswordReset` returns the same generic
  `{ok:true, message:'Якщо email зареєстровано...'}` regardless of whether
  the email exists, avoiding enumeration via that endpoint (unlike login,
  see finding 10 — this endpoint's timing was not separately profiled but
  its response shape doesn't leak either way since it always returns 200).
- **Auth rate limiting** — `server/routes/auth.routes.js` wires up a
  dedicated, stricter `authLimiter` (`AUTH_RATE_LIMIT_MAX`, default 20/15min)
  on `/register`, `/login`, `/forgot-password`, `/reset-password`,
  independent of the general `/api` limiter in `app.js` — contrary to what
  the task brief flagged as a suspected gap, this is correctly implemented.
- **Role assignment / privilege escalation via admin endpoints** —
  `server/routes/admin.routes.js` correctly gates every sensitive route with
  `requireRole('owner','developer')`; `updateUserRole` uses
  `canAssignRole()` (owner cannot touch/create `developer` accounts, cannot
  self-promote) and is not reachable by `teacher`. `user.service.js`'s
  `register()`/`updateProfile()` never accept or trust a client-supplied
  `role` field.
- **Group chat access control** — `chat.service.js`'s
  `assertChannelAccess()`/`userHasGroupAccess()` correctly re-derive
  membership from the DB (group membership or teacher ownership) on every
  request; channel/group ids cannot be walked to read another group's
  messages. Socket.io usage was not separately load-tested but the HTTP
  message-read/write path (which the socket layer defers to for
  persistence) is properly scoped.
- **CTF flag comparison timing** — `challenge-stage.service.js`'s
  `submitStageFlag` uses `bcrypt.compareSync`, which is constant-time with
  respect to the *stored hash* comparison (bcrypt's design), so no
  meaningful timing oracle for brute-forcing the flag itself; the practical
  flag-disclosure path is finding 5, not a timing attack.
- **Billing/payment bypass via client-supplied fields** —
  `platform-access.js`/`payment.service.js`'s `getAccessStatus()` is
  computed entirely server-side from DB state (`payment_records`,
  `billing_exempt`, `billing_day`); no request body or JWT claim influences
  it, and `requirePlatformAccess` correctly bypasses only for
  `owner`/`developer`/`teacher` roles (all trusted staff roles), not on any
  client input.
- **Path traversal in upload/download filenames** — recording and chat
  upload filenames are always server-generated
  (`${Date.now()}-${randomBytes(...)}${ext}`), never derived from
  user-supplied paths; `storage.service.js`'s `getChatFilePath` strips a
  fixed prefix and uses `.split('/').pop()` before joining, which discards
  any `../` traversal components. CTF attachment downloads look up files by
  DB-stored id, not by client-supplied path.
- **Lab-agent secret enforcement** — `lab-agent.service.js`'s `agentRequest`
  and `tunnel.service.js`'s `agentRelayRequest` both always attach
  `X-Lab-Agent-Key: config.labAgent.secret` server-side to outbound calls to
  the lab-agent; the client never controls this header. (Whether the
  separate `lab-agent/server.js` process actually *validates* that header
  was not verified here, since it's a distinct service outside this app's
  process and out of scope for a same-process test harness — worth a
  follow-up review of `lab-agent/server.js` directly.)
- **Tunnel token / SSRF via `/lab/t/:token`** — `tunnel.service.js`'s
  `handleTunnelProxy` only proxies to `target_host`/`target_port` values
  that were persisted server-side when a token was minted
  (`ensureAccessToken`), not to attacker-supplied host/port at request time;
  the token itself is a 24-byte random value looked up by exact match. The
  callers that mint tokens (`buildVmAccess`, `enrichDeploymentUrl`) only
  ever pass server-computed lab/docker host values, never raw request body
  fields — no user-controlled host/port was found reaching
  `ensureAccessToken`. Not exploitable as SSRF in the current code.
