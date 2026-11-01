# Connection-origin repair evidence

22 October 2026. Fixtures use synthetic identities; no live account emails,
credentials, cookies or OAuth state/code/token URLs are retained.

- `baseline.json`: task-entry source hashes; existing uncommitted work was preserved.
- `tests-final.log`: 63 passing cases across five focused suites.
- `tests.log`, `screen-tests.log`: earlier focused successful runs.
- `typecheck-final.log`, `lint.log`: successful checks (empty logs mean no diagnostics).
- `typecheck.log`: the initial test-query typing error, corrected before final checks.
- `web-build.log`: successful isolated production webpack build.
- `mobile-build.log`, `mobile-verify.log`: successful build and server/secret boundary audit.
- `alias-desktop-dark.png`: verified 1440 × 756 shared-screen render.
- `alias-phone-dark.png`, `alias-phone-custom-light.png`: 390 × 844 shared-screen renders.
- `results.json`, `source-snapshot.json`: sanitized observations, qualification scope
  and final task source hashes.

Screenshots show the local production component with synthetic HTTP responses,
not a deployed UI change or proof of Google consent/provisioning/sync completion.
