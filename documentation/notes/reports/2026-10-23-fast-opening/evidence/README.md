# Opening repair evidence

- `release-candidate.json`: 47 reviewed runtime overlays on the prior reviewed base; includes cleanup and seamless repairs, excludes unrelated dirty checkout changes and environment files.
- `preflight.json`: upload manifest exclusion, reviewed-source hashes and configured-private-value scan across source/compiled client.
- `deployment.json`, `deployment-inspection.json`: actual READY production deployment and assigned aliases. The configured canonical Notes URL remains the working Vercel production alias; this work does not certify `sylf.app` TLS.
- `notes-tests.log`, `typecheck.log`, `lint.log`, `web-build.log`, `mobile-build.log`, `mobile-verify.log`: final Node 24 runs. 204 active tests passed; one optional scalability profile skipped. Build tooling's existing informational warnings were not disabled.
- `browser-results.json`: scope and measured browser-control observations. These include tool overhead and do not establish latency percentiles. `fixture-desktop-dark.png` and `fixture-phone-custom-light.png` are synthetic-provider UI checks; `live-synthetic-note.png` is the deployed signed-in synthetic test note after reload.
- `live-drive-current-pdf.png`: actual Google Drive preview of the correctly titled current PDF, visibly including the second synthetic edit.
- Actual Drive before/after inventories and conditional API qualification are in the [cleanup evidence](../../2026-10-23-drive-cleanup/evidence/README.md). The `after-second` poll preceded background completion; `after-second-settled` proves the changed current PDF and obsolete-copy retirement.

Only approved synthetic content was edited. No personal note bodies were altered, browser storage cleared, access revoked, permanent cloud deletion performed or database migration applied. Different physical devices/profiles and physical stylus hardware remain untested.
