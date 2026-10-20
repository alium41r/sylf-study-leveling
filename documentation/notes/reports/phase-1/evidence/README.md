# Phase 1 evidence

All final results are dated 19 October 2026 and concern synthetic, isolated experiments.

- [browser-results.json](browser-results.json): final 18 checks, exact observations, timings and limitations.
- [browser-tests.log](browser-tests.log): final runner output.
- [archive-portability.json](archive-portability.json) and [log](archive-portability.log): additional real-editor archive, fresh-profile restore and subsequent same-lineage branch merge.
- [browser-initial-results.json](browser-initial-results.json): initial 11/15 passing run, retained to disclose failures corrected in the prototype.
- [contract-tests.log](contract-tests.log): final Node 24 run, 19/19 passing contract experiments.
- [next-build.log](next-build.log), [vite-build.log](vite-build.log): isolated production builds. Vite reports the expected eager-bundle size warning.
- [client-graph.json](client-graph.json): emitted Vite graph checked for the mobile guard's forbidden server families; not a full mobile build.
- [root-typecheck.log](root-typecheck.log): intentionally empty successful root TypeScript output; exit status recorded in the qualification report.
- [fixture-lint.log](fixture-lint.log): intentionally empty successful fixture ESLint output; zero warnings/errors.
- [dependency-inventory.json](dependency-inventory.json): inspected installed package metadata subset; full resolution/integrities in the prototype lockfile.
- [baseline.json](baseline.json): original tracked working-copy hashes and pre-existing dirty status, excluding Notes research paths.
- [scope-verification.json](scope-verification.json): final comparison against that baseline; captures changes observed during this run separately from pre-existing status.
- [prototype-snapshot.json](prototype-snapshot.json): reproducible source hashes and copied Sylf color utility hash.
- [desktop-light.png](desktop-light.png), [desktop-dark.png](desktop-dark.png), [tablet-custom-light.png](tablet-custom-light.png), [phone-custom-dark.png](phone-custom-dark.png): experiment appearance, not a proposed production Notes design.

Read [qualification.md](../qualification.md) for what each check does and does not establish. Provider, hardware, production offline and full native app checks were not run. No private note content or credential values are in this evidence.
