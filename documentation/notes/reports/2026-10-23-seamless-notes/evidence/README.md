# Seamless Notes repair evidence

- `release-candidate.json`: exact isolated runtime source overlays and base. Production upload remains false until authorized CLI access and deployment finish.
- `connection-before-refresh.json`: read-only metadata observation before the real refresh; no credentials or account email.
- `live-refresh.json`: actual Google refresh via production code, with simulated expired input and unchanged account/library/vault. No new consent.
- `regression.log`, `typecheck.log`, `lint.log`, `web-build.log`, `mobile-build.log`, `mobile-verify.log`: final source checks. One optional scalability test is skipped; no physical-device claim follows from mobile compilation.
- `fixture-build.log` and screenshots: real shared React screen, encrypted IndexedDB and synthetic HTTP. Desktop 1440×756, phone 390×844, dark and custom-light. Filename dimensions describe the actual viewport; a first desktop capture was renamed rather than falsely labeled as mobile. Developer diagnostics are intentionally separate from normal screenshots.
- `results.json`: explicit scope, pending deployment and remaining external limits. Final source/bundle hashes and secret/diff checks are recorded during handoff preparation.

Reproduction uses installed Node 24 and the existing `scripts/qa/notes-release` fixture. Build into `NOTES_QA_OUT_DIR=/private/tmp/sylf-notes-seamless-ui`; copy `public/notes-pdf` there, then start loopback previews with `NOTES_QA_PORT=4396` or `4397`, optionally `NOTES_QA_LIGHT=true` and `NOTES_QA_ADMIN=true`. `/workspace.html` mounts the actual shared screen. `#/notes?dev=true` opts the synthetic admin into diagnostics. `/qa/offline` toggles only this in-memory synthetic provider; it never changes real Google access, browser storage or system connectivity. Do not run soak/PDF writer controls against older report evidence unless intentionally generating a new scoped run.

Private account/authorization screenshots and CLI credential files do not belong in this directory. Do not print OAuth credentials, signed upload capabilities or environment values. The real old public site must not be described as repaired until the pending controlled deployment and live acceptance finish.
