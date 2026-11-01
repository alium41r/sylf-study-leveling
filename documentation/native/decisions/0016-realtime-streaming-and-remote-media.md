# ADR 0016 — Realtime, streaming and remote media

**Status: Proposed, 1 November 2026, by Expansion Part 1, for the owner to review.** It extends [ADR 0009](0009-native-authentication.md), [ADR 0011](0011-shared-backend-foundation.md) and [ADR 0013](0013-expansion-stage.md) decision 7. **Nothing here ran on a device,** so each decision has a fallback, and [Part 2 step 0](../expansion/part-2-study-progression-personalization.md#step-0--preconditions-and-repairs) proves them.

## The problem

Three things Native needs next meet rules it already has.

- **Realtime.** Web uses a 30-minute JWT from `/api/realtime/token`. Electron's renderer holds no token, and its policy says `connect-src 'self'`.
- **Streaming.** React Native's `fetch` has no incremental body, so Sylvie's reply arrives whole (T-6).
- **Remote images.** Addresses stored by users are not validated (U-6), and some images need a bearer header.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| 1 | **Use `@supabase/realtime-js` alone,** not the whole `supabase-js` client. | Native needs channels and nothing else. Storage and auth stay on the server. Web's version is 2.112.4, so both ends match |
| 2 | **There is one Realtime interface, in `@sylf/backend` behind `import()`, with two hosts.** A device runs the client in JavaScript. **Electron runs it in the main process,** and sends events to the renderer. | The rule "no token reaches the renderer" has proved its worth, and `backend-check.mjs` enforces it. Keeping it costs one small bridge. Widening `connect-src` to a Supabase host and handing a token to the page would give both away |
| 3 | **Events carry what the page needs and nothing more.** Each is a hint that invalidates a resource, or a small payload. The resource store stays the owner of data. | One path for truth. A lost event costs a refresh, not a wrong screen |
| 4 | **`{ enabled: false }` is a normal answer.** Everything works without Realtime, through the bounded fallback. | `AGENTS.md`. Also, `Message` reaches the publication only through a manual script, so chat may have no live events on a given deployment |
| 5 | **Streaming uses `expo/fetch` on a device, for the routes that stream.** Everything else keeps the platform `fetch`. | SDK 58 ships it, with a streaming body and multipart, so it needs no new dependency. `client.stream` already reads `response.body` and falls back if it is missing |
| 6 | **A stream is an improvement, never a dependency.** Sylvie shows honest status until text arrives. Planner works from `?activity=true`. | The fallback already works |
| 7 | **`RemoteImage` is the only way to load a remote image,** with an allow-list of hosts from configuration. It can add a bearer header on a device, and goes through the proxy on Electron. Anything else draws the fallback. | One place to enforce U-6 on every client, whatever the server stores |
| 8 | **No push notifications.** Local notifications only, for phase ends and reminders. | Push needs a server service and device tokens, which is significant new backend work (master plan §7.3). A future possibility |

## Rejected

| Option | Why not |
| --- | --- |
| Realtime in Electron's renderer | Puts a token in the page and widens the policy, against ADR 0009 |
| Polling everything instead | Finding P-8, and battery |
| A server-side event stream of our own | A new system for what Realtime already does |
| A streaming polyfill | `expo/fetch` makes it unnecessary |
| Trusting stored image addresses until the server is fixed | The server fix doesn't reach old rows, or a modified client |

## Consequences

- `main.mjs` and `preload.cjs` gain one narrow event channel, and `backend-check.mjs` gains a test that no Realtime token reaches the page.
- The allow-list needs the storage hosts, which come from configuration on each build.
- Hermes behavior of `@supabase/realtime-js` is unproven, including backgrounding and reconnection (R18).
- Rule 2 of the Stage 3 handoff changes only as ADR 0013 decision 7 says.
