# Notes connection address repair — 22 October 2026

The reported storage-service error was a rejected origin, not a database or Drive
outage. The authenticated page was open on a per-deployment Vercel hostname.
Production request logs showed `POST /api/notes/connection` returning **403** there,
while authenticated `GET` requests succeeded. `requireOrigin` intentionally accepts
only the fixed `NOTES_PUBLIC_URL`. The client converted that rejection into its
generic `NETWORK` message, obscuring the remedy.

## Live recovery

Opened the existing production Notes page at the permanent address:

`https://sylf-alium41rs-projects.vercel.app/notes`

The authenticated screen loaded normally, and its Connect action reached Google's
account chooser with the matching `/api/notes/callback`, PKCE and `drive.file`
scope. The browser is waiting for the user to choose their account and approve
Google access. **Consent completion, token exchange, library provisioning and file
synchronization have not been verified in this run.** No OAuth state/code/token,
account email or provider credential is included in this report/evidence.

Vercel showed `NOTES_PUBLIC_URL` present for Production/Preview and the three
Notes credential/key variables present for Production. Revealing the public URL
required a Vercel step-up challenge, which was dismissed; no value, credential or
Vercel setting was changed. The successful canonical-origin request establishes
which entry point works without weakening the origin guard.

## Code repair

- Authenticated `GET /api/notes/connection` now advertises the fixed `notesUrl`
  when configured. It does not start OAuth or return credentials/key material.
- The shared screen validates that destination before enabling connection or
  unlocking. An alternate host shows **Open Notes** rather than offering a
  connection that must fail. The explicit link opens a new tab and keeps the
  original tab and its encrypted local data intact. There is no automatic redirect
  and no cross-origin movement/deletion of local content.
- `alternateNotesURL` accepts a credential-free HTTPS `/notes` destination, or
  HTTP loopback only from another HTTP loopback page. It preserves UUID resource
  references (`library`, `document`, `page`) and discards unrelated/OAuth query
  parameters. Malformed destinations fail closed. Older brokers/fixtures without
  the new field remain compatible.
- A rejected mutation now has the distinct `ORIGIN` code. The client explains
  that Notes needs its permanent Sylf address. It does not mislabel this condition
  as storage unavailability, and a 403 does not revoke local keys. A broker 401
  still immediately invalidates local access.
- Normal connection remains enabled on the canonical origin. No wildcard origin,
  preview-host allowlist, native bypass, extra Google scope, schema migration,
  dependency change or authentication authority was introduced.

These source changes are **local and not deployed**. The live recovery above uses
existing deployed behavior at the correct permanent address. Publishing the local
prevention/guidance change remains separate from that recovery and must preserve
the unrelated pending work already in this checkout.

## Verification

- **63 tests passed** across the connection location/screen, credential broker,
  production foundation/transport and authentication-boundary suites. Coverage
  includes malformed/unsafe URLs, reference preservation, rejection before OAuth
  state creation, no unlock on alternate origins, retaining the original tab,
  normal canonical connection, and 401/409 isolation.
- Standalone TypeScript and changed-file ESLint passed. The initial TypeScript
  run caught unsupported test-query options; those were corrected and the final
  typecheck passed.
- Production web build passed with webpack and a temporary 6 GB Node heap, using
  isolated generated output. Mobile production build and server/secret boundary
  audit passed. Framework-added temporary TypeScript include entries were removed.
- The actual shared screen was rendered using the existing isolated QA entry and
  synthetic HTTP fixtures. Inspected desktop **1440 × 756** in dark appearance and
  phone **390 × 844** in dark and custom light appearance. The phone had no
  horizontal overflow; copy/action remained readable and fit the viewport. Also
  exercised enabled canonical connection and disabled malformed-destination states.
  Browser viewport overrides were reset afterward.

[Evidence](evidence/README.md) contains the focused logs, sanitized results and
synthetic screenshots. The initial full-page screenshot capture returned blank;
the retained screenshots were replaced with verified normal viewport captures.
User Drive permission and authenticated post-consent acceptance remain pending.

## Follow-up: connected library and opening notes

The user subsequently reported completing Google consent and reaching the library.
The original final browser verification was blocked by automatic approval review
because its usage limit had been reached. The original run's unperformed provider
checks above remain unperformed checks for that run.

Following a new report that created notes would not open, the user explicitly
approved inspection of the signed-in Notes tab. Both existing notes were opened
without editing their titles or bodies. The deployed screen displayed the rich-text
editor and editable body. A separate fresh library tab also opened an existing
note, showing **Loading editor…** followed by the editor. No console warning/error
was captured in that fresh-tab check. The original tab was left in the working
editor. Leaving a document can persist its normal reading/resume position; no note
content was changed or deleted.

The reported opening failure did **not** reproduce during these observations. No
opening-path code repair, deployment, browser-storage clearing, forced reconnection
or data repair was performed. The reason for the earlier unresponsive clicks is
unresolved; these observations do not prove it cannot recur. They also do not
constitute a write/readback or independent-device cloud recovery test. The UI's
**Saved to Drive** status is an observed status, not a replacement for those tests.
