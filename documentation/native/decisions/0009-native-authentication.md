# ADR 0009 — Native authentication (risk R1)

**Status: Proposed. Designed in Phase 11, built in Phase 12 (1 November 2026), for the owner to review.** Nothing is deployed. [What Phase 12 built differently](#as-built-in-phase-12) comes first, because it overrides the record below it. The design's evidence is the [Phase 11 report](../reports/phase-11/report.md).

## As built in Phase 12

Every decision below was built, OAuth included. These five differ from what the record says, and each was forced by something measured or found in the code.

| Decision | Record says | Built | Why |
| --- | --- | --- | --- |
| 10, 6 | The main process calls the backend with `net.fetch`, and this "needs checking" against the `Sec-Fetch-Site` rule | **Node's `fetch`.** The rule was not touched | Checked with a recording server: `net.fetch` adds `sec-fetch-site`, `sec-fetch-mode` and `sec-fetch-dest` to every request, even from the main process, so every bearer call and sign-in was refused. **Cost, Open:** Node's fetch ignores the system proxy and the OS trust store, which matters on a managed network. `session.resolveProxy` plus an undici dispatcher is the likely answer |
| 8 | A refresh token is found by its hash | **`<session id>.<256 random bits>`,** found by id, then compared by hash | Hash lookup cannot find a token two rotations old, so a thief who rotated twice would be safe and the victim only signed out. With the id, every stale token finds its row and ends it. A wrong secret also ends that session, so `sid` must not be treated as public. It already is not: only its owner sees it |
| 8 | The old token rotates within 60 seconds of `rotatedAt` | **Once,** and `rotatedAt` is left alone | Otherwise a stolen old token could keep extending its own window. An honest client that loses two responses in a row is signed out, which is rare and safe |
| 1 | Five columns, `kind` as an enum | **Six: also `tokenVersion`.** `kind` is `TEXT` with a `CHECK` | A refresh token carries no claims, so the row must remember the version it was issued against, or a `tokenVersion` bump with no row change could be refreshed through. `AuthSession` came from `db push`, not from the history, and the harness builds gap tables before it replays migrations, so a new enum would not exist yet |
| 13 | A one-time code "stored in `VerificationToken`", with the state in a cookie as on the web | **No cookie at all.** `state` is a JWT this server signs, with audience `sylf-native-oauth`, naming the provider, challenge and redirect. The code sits at `NATIVE_OAUTH:<sha256>:<challenge>` | `VerificationToken` needs a `userId`, which does not exist before sign-in. PKCE binds the result to the app, so no browser cookie is needed. The challenge is part of the key, so a wrong verifier finds nothing. Deleting the row is what redeems it, so a code cannot be used twice |

**One more route:** `GET /api/auth/native/ping`, public, no database, so a client that thinks it is offline has something small to ask.

**Also found.** The password change is the case decision 14 needed most: `attachReissuedSession` records the new version on the native row, so the changing device can refresh and its next request simply does. `/api/realtime/token` was the only reader of `email` and `username`, and now reads them from the database for a native session.

**Known costs, accepted (Proposed).** A refresh response lost in transit and not retried within 60 seconds ends that session, and the student signs in again. A verifier lives in memory, so if a tablet kills the app while the browser is open, the OAuth sign-in has to be started again. A sign-out with no network forgets the token on the device, and the row lives until it expires or is ended from Settings.

## The problem

Web sessions are cookie-only. S3 removed the bearer path on purpose, because a token script can read is a token an XSS can steal. Native clients have no cookie jar they can rely on, and need to stay signed in across restarts. So native needs a credential that is not the web cookie, without creating a path that weakens the web's decision, and with instant revocation parity: `logout-all` and a password change must end a native session at once.

## What Phase 11 found that decides this

| Fact | Evidence | Consequence |
| --- | --- | --- |
| All 148 routes reach identity through one function, `getSession`, directly or through `plannerRoute`, `notes owner()` or `requireAdmin` | `evidence/route-scan.mjs`, read of the four wrappers | One change reaches every route. No per-route work for reads |
| Routes use only `userId` from the token. `email` and `username` are read by `/api/realtime/token` alone | Grep of `session.*` across `app/api` and `lib` | A native token can carry almost nothing |
| `AuthSession` already exists, and since Phase 11 it is real: tokens carry `sid`, and `getSession` refuses a token whose row has ended | `lib/auth-session-service.ts`, `backend-postgres.json`, `http-smoke.json` | It is the one session record. Native adds to it, and adds no second table |
| Electron's renderer is sandboxed, with `connect-src 'self'` on a privileged `sylf://app` scheme, and already serves everything through `protocol.handle` | `apps/desktop/src/security.mjs`, `main.mjs` | The main process can answer `/api/*` itself. The renderer need never hold a credential |
| React Native has no secure storage module yet. `expo-crypto` is present, and the deep-link scheme `sylf-native` exists | `apps/sylf/package.json`, `app.config` | Phase 12 adds `expo-secure-store`, a first-party Expo SDK module and not a substantial dependency |
| Six routes reissue the cookie after a profile change | `reissueToken` call sites | A native request must never receive `Set-Cookie`, because React Native's HTTP stack keeps cookies on its own and would mix the two identities |

## Decisions

All **Proposed**.

| # | Decision | Why |
| --- | --- | --- |
| 1 | **One session record.** A native sign-in is an `AuthSession` row, listed in Settings beside browsers and ended the same way. Add nullable columns only: `kind` (`BROWSER`, `NATIVE`), `refreshHash` (unique), `previousRefreshHash`, `rotatedAt`, `clientName`. | The task rule is one authority for sessions, and revocation already works through this row. |
| 2 | **Two tokens.** A short access token, a JWT of 15 minutes with `aud: "sylf-native"` and only `userId`, `sid`, `tokenVersion`. A refresh token of 256 random bits, stored only as a SHA-256 hash on the row, and rotated on every use. | A short access token limits what a leaked copy can do. An opaque refresh token cannot be replayed from a database leak. |
| 3 | **The audiences do not cross.** The cookie path keeps verifying `aud: "sylf-app"`, and the bearer path accepts only `aud: "sylf-native"`. The web JWT used as a bearer is refused. A native JWT used as a cookie is refused. | This is what keeps the S3 decision intact: the web token gains no new way in. `http-smoke.json` already proves a web JWT as a bearer gets 401, and that test stays. |
| 4 | **A cookie can never buy a bearer token.** The native endpoints accept a password, a one-time OAuth code with a PKCE verifier, or a refresh token. None reads a cookie, and none sets one. | This is the property that protects browsers. Script in the web app can use the cookie through same-origin fetch, but it cannot turn that into a credential that outlives the tab, because no endpoint exchanges one for the other. |
| 5 | **The bearer branch lives inside `getSession`,** after the cookie branch. Cookie wins when both are present. It runs the same revocation check: `tokenVersion`, then the row, with `sid` required. | Revocation parity is then a property of one function, immediate on the next request, and independent of the access token's expiry. A route cannot forget it. |
| 6 | **A browser cannot present a bearer token.** The bearer branch refuses any request with a `Sec-Fetch-Site` header, which scripts cannot remove and browsers always send. The `/api/auth/native/*` routes refuse it too, apart from `oauth/start`, which is a browser navigation and issues nothing. | Defense in depth for a leaked native token: it cannot be replayed from a web page, and a browser has no business using this path. |
| 7 | **`/api/auth/native/*` is the whole new surface:** `login`, `register`, `oauth/start`, `token` (OAuth code and refresh), `logout`. Each reuses `initializeUserProfile`, `handleOAuthSignInOrRegister`, the login rate limits and prelaunch rules. They share logic with the web routes and copy none. | Reuse before rebuild. |
| 8 | **Refresh rotation with reuse detection.** Presenting the current hash rotates it. Presenting `previousRefreshHash` within 60 seconds of `rotatedAt` also rotates it, because a response can be lost in transit. Anything else ends the session. A refresh also fails if `tokenVersion` moved or the row has ended. | Reuse after the grace window means two holders, and one is a thief. The client refreshes through a single owner, so honest races are rare. |
| 9 | **Lifetime.** A refresh token's row lives 30 days from last use, matching the cookie's 30 days. | Parity. A student who opens the app monthly stays signed in. |
| 10 | **Electron: the main process is the client.** `protocol.handle` answers `sylf://app/api/*` by calling the backend (with Node's `fetch`, see above) and adding the bearer token. The refresh token is encrypted with `safeStorage` in `userData`. If `safeStorage.isEncryptionAvailable()` is false, the session lives in memory only and is never written in plain text. The access token never leaves the main process, and login responses have their tokens removed before the renderer sees them. Only paths under `/api/` go through, to one configured origin, and `Set-Cookie` is dropped. | The sandbox, CSP and same-origin rules stay exactly as they are, CORS is never needed, and a compromised renderer has no token to steal. Streaming works because a `protocol.handle` response can be a stream, and that needs proving for Sylvie. |
| 11 | **React Native: secure store for refresh, memory for access.** `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so the token stays off backups and off other devices. The access token stays in memory. Requests use `credentials: "omit"`. A read failure, which is what a restored backup looks like on Android, reads as signed out and never as a crash. | Keychain and Keystore are the platform's own answer, and the master plan already requires them. |
| 12 | **Tokens live behind `SecureSessionAdapter`** in `@sylf/platform`, beside the existing adapters: `read`, `write`, `clear`. Web and Electron's renderer get an implementation that holds nothing. | Screens and the typed client never see a token, and the boundary audit can enforce it. |
| 13 | **OAuth on native** goes through the system browser with PKCE S256. The provider still redirects to the web callback, which issues a one-time code, hashed, 60 seconds, bound to the challenge, stored in `VerificationToken` under a prefix `confirmEmailVerificationToken` already refuses. It redirects to `sylf-native://auth`, or a loopback port on Electron. | Provider configuration does not change. PKCE makes a stolen deep link useless. Phase 12 can ship password sign-in first, and OAuth in the same phase if time allows. |
| 14 | **Routes that set the cookie stop doing so for a bearer request.** `reissueToken`'s callers go through one helper that attaches a cookie only to a cookie session. | Otherwise a native client would collect a web token in its HTTP cache. See "What Phase 12 must change". |
| 15 | **Realtime tokens stay as they are.** `/api/realtime/token` works through `getSession`. It mints a 30-minute token that cannot be revoked, so a revoked device can keep reading its own Focus Party tables for up to 30 minutes. | Accepted, with the exposure limited to tables RLS already scopes. Noted so nobody assumes otherwise. |

## Revocation parity

| Event | Browser | Native |
| --- | --- | --- |
| Sign out everywhere | `tokenVersion` bumps, every token refused | Same check, and refresh also fails |
| Password change | Same, with a new token for this device | Same. The device making the change keeps its `sid` |
| End one device in Settings | Row reaches `expiresAt`, refused on the next request | Same, and refresh fails |
| Sign out on this device | Row ended, so a copied token is dead | Row ended by `/api/auth/native/logout` |
| A verified provider claims an unverified address | `tokenVersion` bumps | Same |
| Account deleted | Row and user gone | Same |
| Refresh token reused after the grace window | Not applicable | Row ended |

## What Phase 12 must change

| Place | Change |
| --- | --- |
| `prisma/schema.prisma`, new additive migration | The `AuthSession` columns in decision 1. Bump `SCHEMA_BUILD_VERSION` |
| `lib/auth.ts`, `lib/auth-server.ts` | `verifyNativeToken` and the bearer branch of `getSession`, with `getSession` otherwise unchanged |
| `lib/auth-session-service.ts` | Open, rotate and end native sessions |
| `app/api/auth/native/*` | New routes |
| The six `reissueToken` call sites | Cookie only for cookie sessions |
| `app/api/user/sessions` | Show `clientName`. The current-device test must work from a bearer token, and already keys on `sid` |
| `lib/notes/server/security.ts` `requireOrigin` and `sessionHash`, `lib/calendar/external/connections.ts` `sessionHash` | Leave alone for now. Notes' broker is Phase 14, and Calendar's OAuth connect stays a web flow. Both refuse a native client cleanly |
| `@sylf/platform`, `apps/desktop/src/main.mjs`, `apps/desktop/src/security.mjs` | The adapter and the main-process proxy. Keep every self-test, and add one that fails if a token reaches the renderer |

## Tests Phase 12 must pass

On disposable PostgreSQL through `scripts/test/test-backend-postgres.mjs`, in the real `getSession`:

1. A web JWT as a bearer is refused, and a native JWT as a cookie is refused.
2. A cookie alone cannot obtain a native token, from any endpoint.
3. Each row of the parity table, in both columns, with distinct users.
4. Refresh rotates, the old token works once in the grace window, and reuse after it ends the session.
5. A bearer request carrying `Sec-Fetch-Site` is refused.
6. A bearer request gets no `Set-Cookie`, on all six reissue routes.
7. Cross-user reads and writes are refused for a native token on a sample of owned routes.
8. On Electron, the token is absent from the renderer: no window global, no response body, no storage.

## Rejected

| Option | Why not |
| --- | --- |
| Return the web JWT to native and accept it as a bearer | Restores what S3 removed, and a 30-day token would sit in client memory |
| A cookie jar in React Native | The platform stacks differ, it cannot use secure storage, and CSRF rules would apply to an app with no browser |
| Supabase Auth | User ids are integers here and Sylf mints its own tokens. It would be a second identity system, which is ruled out |
| A separate `NativeSession` table | Two records of who is signed in, and Settings would need to merge them |
| An app-wide CORS allow-list for `sylf://app` | Unneeded with the main-process proxy, and it widens the web surface |

## Open

- Whether a native sign-in should notify the person, as a new-device notice. Nothing does this today.
- Whether changing an email should require the password. It does not today, on either client (report finding S-12).
- Password reset does not exist on any client. A student who forgets a password is locked out, and native inherits that (report finding G-4). It needs email delivery, so it needs the owner.
