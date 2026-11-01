# Migration audit evidence

Captured 22 October 2026. These artifacts describe this run, not an ongoing monitor.
No credentials, raw application rows or recovery exports are included here.
Private backups and row fingerprints remain outside version control.

| Evidence | Meaning |
| --- | --- |
| `baseline.json`, `sql-inventory.json`, `before.json` | Initial dirty-tree/hash snapshot, all 70 SQL migrations, sanitized original ledger status. |
| `calendar-postconditions.json` | Full postcondition proof used before the three explicit official reconciliations. |
| `schema-clone-rehearsal.json`, `prisma-source-parity.json` | Exact hosted SQL schema restore, Notes rehearsal and semantic source-clone parity. These do not assert the original orphaned data restored cleanly. |
| `applied.json`, `resolve-*.log`, `notes-deploy.log`, `migration-status-after.log`, `after-summary.json` | Actual official hosted reconciliation/deployment and final status. |
| `preservation.json` | Pre-existing schema/security equality and 71 application-table aggregate fingerprints before/after migrations. |
| `database-introspection.log`, `prisma-sql-only-relations.json`, `prisma-semantic-diff.sql` | Introspection warnings and SQL-owned objects; diagnostic diff only, never executable deployment SQL. |
| `prisma-supported-diff.sql`, `prisma-generate.log`, `generated-client-readonly.json` | Empty diff for the supported client mapping, generation and read-only hosted client checks. |
| `notes-postgres.log`, `calendar-postgres.log`, `regression-tests.log`, `migration-safeguards.log` | Actual database and unit test results. |
| `focus-qa-cleanup.json`, `confirm-invites-and-rejoin.mjs.log`, `verify-focus-party.mjs.log` | Both repaired QA suites against an empty actual-schema disposable database, zero remaining fixture rows. |
| `orphan-repair-rehearsal.json`, `orphan-final-proposal-rehearsal.json`, `archive-fidelity.json` | Local-only repair, exact rollback/commit rehearsal and 96-row typed recovery fidelity. These describe the original local rehearsals; the subsequent approved hosted execution is recorded separately. |
| `tls-rejection.json`, `status-verified-transport.log` | Strict TLS failure and successful official command transport evidence. |
| `fresh-chain-rehearsal.json` | Historical empty-bootstrap failure at missing `ItemCategory`; retained explicitly. |
| `production-build.log`, `production-webpack-build.log`, `production-build-verified.log` | Stalled default build, first alternate build's 2 GB memory failure, then successful webpack build with temporary 6 GB heap. |
| `typecheck*.log`, `lint.log`, `mobile-build.log`, `mobile-verify.log` | Application verification; an empty successful typecheck/lint log means no diagnostics. |
| `approved-orphan-cleanup-failure.json`, `approved-orphan-cleanup.json`, `approved-cleanup-independent-verification.json` | Initial count-guard rollback, explicitly approved 96-row commit, independent 116-FK and unchanged schema/security verification. |
| `post-cleanup-backup-restore.json`, `helper-status-after-cleanup.log` | Full clean public schema/data restore, all 73 application-table fingerprints match, 116 validated FKs and clean official migration status. |
| `notes-origin-*.json`, `deployed-notes-public-check.json` | Public domain TLS/HTTP results, zero bindings, one-variable local correction, actual production config qualification and unauthenticated deployment responses. No Google or Vercel console change or consent test. |
| `final-checks.json`, `source-snapshot.json` | Final verification status, approval boundary and task-owned source hashes. |

Earlier failed native TLS diagnostics are retained as `status-*.log` and
`migration-status-before.log`. Local ports, synthetic fixture IDs and database
object names are not credentials. Full database dumps and the recovery export
remain private under the ignored `backups/` directory.
