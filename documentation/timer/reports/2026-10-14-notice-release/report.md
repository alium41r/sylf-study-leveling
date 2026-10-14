# Timer notice and release follow-up — 2026-10-14

The reported fixed notice revealed both a presentation issue and a missing hosted migration. This follow-up extends the [lifecycle audit](../2026-10-14-lifecycle/report.md); it retains the existing durable journal, server receipts and settlement owners.

## Root causes and repairs

- `TimerSyncWorker` rendered the retry notice for the entire failure duration, with no expiry or dismiss control. It now displays once per failure episode, expires after six seconds, provides a dismiss button and clears immediately when delivery succeeds. Repeated worker notifications cannot extend or reopen it. Dismissal leaves delivery and saved operations intact. Messages say “update your account” and “Try again.”
- The deployed code expected `TimerSessionStart` and the party timeline column, but `20261014000000_timer_durable_completion` was absent. Hosted logs confirmed missing-table errors. The exact migration tested on disposable PostgreSQL was applied transactionally and recorded in Prisma's migration registry. No pending or failed migrations remained. Backend execution privileges and browser restrictions were checked; Prisma was regenerated. The user's existing pending session subsequently reached the account, updated displayed totals and cleared the notice. No artificial study history was added for testing.
- Hosted logs also showed statement timeouts in owner coordination. Session-level locks/settings acquired outside BEGIN are unsafe through a transaction pooler. The existing coordinator now uses only transaction-scoped state, rolls back busy nonblocking attempts before a fresh retry, releases connections before waiting and discards clients after uncertain rollback. SERIALIZABLE isolation and the original advisory lock key remain.
- Full production validation exposed invalid route exports, synchronous-or-promise dynamic parameter annotations and a Goals page accepting non-page props. Internal constants remain internal, the scope helper moved to its existing library owner, routes accept promise params, and the Goals page wraps its shared screen. The isolated build verifier now includes synthetic fixtures referenced by the quality corpus and supports a separate evidence directory. An outdated syllabus test transaction mock now implements the existing coordination boundary.

## Verification

| Check | Result / evidence |
| --- | --- |
| Relevant client, timer, party, subject and API regression suite | 503 passed in 46 files; [log](evidence/unit-tests.log) |
| Database migration, settlement, replay, failure, concurrency and lifecycle suites | 78 passed in six files on generated disposable PostgreSQL; [manifest](evidence/postgres-harness-run.json) |
| Final changed quest/compiler and acoustics API checks | 24 plus two passed; [release checks](evidence/release-tests.log), [acoustics](evidence/acoustics-api-tests.log) |
| Strict TypeScript and Prisma generation | Passed; [generation](evidence/prisma-generate.log) |
| Production web build | Passed with no skipped type checks; [source-pinned record](evidence/web-build.json), [log](evidence/web-build.log) |
| Mobile production build and bundle boundary verification | Passed; [build](evidence/mobile-build.log), [verification](evidence/mobile-verification.log) |
| Timer source, new tests and build verifier lint | Passed; [log](evidence/timer-source-lint.log) |
| All touched-file lint | 38 errors and two warnings, all already present in unchanged fixture/route code; zero introduced findings; [baseline comparison](evidence/lint-baseline.json), [log](evidence/changed-files-lint.log) |
| Browser recovery and notice expiry | Five appearance/viewport scenarios passed; [results](evidence/browser/results.json), screenshots beside them |
| Hosted schema and backend/browser permissions | Verified after applying migration; [sanitized schema checks](evidence/deployed-schema.json) |

Browser scenarios covered 1440px desktop light/dark, 390px mobile light/dark and a custom light background with a dark preference and orange accent. They exercised unavailable APIs, full offline navigation, local storage exhaustion, refresh with a pending END and reconnection. Each notification disappeared while the pending operation remained; each reloaded operation later uploaded. No page errors or horizontal overflow occurred. Focus closed in 2.5–306.5ms, including the existing approximately 300ms navigation animation. Browser API responses were synthetic; hosted recovery was separately observed in the user's original browser origin. Private user screenshots and account/session details are intentionally excluded from repository evidence.

## Remaining limits

Offline-only records still require intact storage on their original device/origin and authentication as the original account. Closing the app postpones delivery until reopening. Historical missing or corrupted production records were not reconstructed. The hosted background cascade suite and external provider suites were not part of this timer run. Existing lint debt listed above remains outside the timer repair. Production failure injection uses disposable data; the live check recovered the user's existing pending work without creating test sessions.
