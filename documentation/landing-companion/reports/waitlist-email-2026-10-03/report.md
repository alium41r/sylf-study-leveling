# Waitlist email update — 3 October 2026

The waitlist confirmation now uses a calm blue/paper design with a serif Sylf
wordmark, a readable stacked early-access pass, concise next steps, and a
reply-based removal-request note. Inline table-based styling provides the
baseline; media queries enhance narrow screens and clients supporting dark mode.
It loads no remote images, fonts or tracking pixels. User-supplied name, goal and
pass values are escaped in HTML. Both sending providers receive plain text.

The user confirmed production uses personal Gmail and chose to keep it.
The existing SMTP-first selection remains active. Waitlist-specific sender and
provider overrides support a later verified-domain migration without changing
authentication emails. Invalid sender configurations, missing production
credentials, SMTP recipient rejection and provider errors return explicit
failures. The signup route logs returned failures and preserves committed entries.
SMTP requires TLS and logs its acceptance ID; acceptance is not inbox delivery.

## Validation

- Waitlist email, API and form suites: **30 tests passed** across three files.
  Coverage includes HTML escaping, plain-text parity, provider selection,
  sender guards, TLS, missing credentials, provider failures, signup preservation
  and existing duplicate suppression.
- Browser renders: 900, 390 and 320 pixels, each in light and dark mode; no
  horizontal overflow. Reviewed desktop light, phone dark and narrow phone light
  screenshots. At 390 pixels the inline-only fallback also had no overflow.
- Maximum-length unbroken name/goal fields (100 characters) and pass code
  (64 characters) wrapped at 320 pixels without overflow.
- The new template and email test file pass ESLint. Legacy email code, API route
  and API tests retain existing `no-explicit-any` violations; no new such
  violations were added. The prior email source was separately linted to verify
  the baseline; its six violations are reduced to four by replacing the waitlist
  dispatch implementation.
- Project typecheck fails on existing generated route checks for
  `CURATED_SOUNDSCAPES` in the acoustics route and `calculateScopeWeight` in the
  quests route. Neither route was edited.
- Default Turbopack build stalled during compilation and was stopped. A webpack
  build compiled successfully in 18.5 seconds, then failed typechecking the
  existing unsupported `CURATED_SOUNDSCAPES` route export.
- Diff whitespace check passed. Unrelated concurrent Planner changes were
  preserved. No shared app/mobile screens were changed, so mobile bundle checks
  and app custom-color preference tests do not apply to this standalone email.

## Evidence and limits

[HTML preview](evidence/preview.html), [desktop light](evidence/900-light.png),
[desktop dark](evidence/900-dark.png), [phone light](evidence/390-light.png),
[phone dark](evidence/390-dark.png), [narrow phone light](evidence/320-light.png),
[narrow phone dark](evidence/320-dark.png),
[long-field stress case](evidence/long-fields-320.png).

These are browser previews, not Gmail/Outlook delivery renders. No email was
sent, no deployment performed, and Gmail's original message authentication
headers were unavailable. The cause of spam placement and live inbox placement
remain unverified. Design, content and configuration improvements do not
guarantee inbox placement. A public Google DNS check returned NXDOMAIN for
`sylf.study`; no domain or provider settings were changed.

Current configuration and live verification instructions are in the
[waitlist email runbook](../../../runbooks/WAITLIST-EMAIL.md).
