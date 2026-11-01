# Combined release evidence

- `release-candidate.json`: full combined working-tree snapshot and source hashes, including concurrent agents' runtime changes.
- `upload-preflight.json`: exact official Vercel dry-run file list statistics and source/security checks.
- `compiled-client-check.json`: configured-private-value scan of 315 compiled client files and shared-root drift check.
- `notes-tests.log`, `web-build.log`, `lint.log`, `mobile-build.log`, `mobile-verify.log`: successful checks against the combined candidate.
- `production-before.json`: previous production identity for release and rollback reference.

No secrets or personal note contents belong in this evidence directory. Vercel readiness, alias and HTTP evidence will be added after the build and promotion finish.
