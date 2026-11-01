# Step 2 evidence

- `final/`: authoritative final genuine PostgreSQL gate and source pins; all required V2/legacy suites execute with no required skips.
- `final-postgres/`: earlier full green 468-check run before the explicit v2 legacy-research-tool rejection assertions. Retained as its own source-pinned run.
- `full/`: earlier full green 467-check run, with source edits during execution recorded separately from test outcomes. It is not the final source gate.
- `role-check/`, `role-check-2/`, `role-check-3/`: focused PostgreSQL development runs. They preserve the financial-state and stopped-history integration failures and the subsequent green run; they do not supersede final evidence.
- `initial/`: initial worker typecheck failure after the migration applied successfully in the disposable cluster.
- `verification.json`: final command/outcome manifest. `preservation.json`: task-start comparison and protected authority hashes. Unit/typecheck/lint/build/import/schema evidence is alongside it.
- `lint-baseline.json`: exact reconstructed task-start provider/type sources match their original hashes; baseline and current diagnostic sets match. Existing lint errors are not hidden.

The runner copies source and existing historical evidence writers into temporary storage, strips hosted/provider credentials and applies actual SQL to disposable native PostgreSQL 18.4. Existing optional paid qualification remains excluded. No hosted migration or paid provider call is part of these results.
