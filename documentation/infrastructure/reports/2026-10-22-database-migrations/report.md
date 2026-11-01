# Supabase migration audit and repair — 22 October 2026

**Hosted migrations are up to date: 70 successful migrations, zero pending,
zero unresolved failures, zero source-checksum mismatches.** Prisma was synchronized
from the SQL database after deployment and regenerated. Existing application data
and security objects were preserved during migration deployment. After explicit user
approval, **exactly 96 archived orphaned test records were removed**. All unselected
rows were preserved, and all **116 current foreign keys** now pass.

## Causes and repairs

| Finding | Verified action |
| --- | --- |
| The failed Calendar scheduling migration raised `42701`: `CalendarEvent.category` already existed. | Compared all three unrecorded Calendar migrations with an isolated execution of their actual SQL. All 15 tables, 130 column definitions, 41 constraints, 38 indexes, two triggers, two function definitions/security settings and browser-access boundaries matched. Search backfill had zero stale rows. Only then reconciled those three receipts with official `prisma migrate resolve --applied`. The old failed attempt remains historical; it was not erased. |
| The old helper executed raw SQL without updating the established ledger. This allowed schema/history divergence. | Replaced it with checksum checks and official `migrate status`/`deploy`. It refuses unresolved failures and arbitrary SQL files. Next.js environment precedence now also applies to Prisma tooling. |
| Native Prisma certificate validation failed on this macOS host. | Added a verified Node TLS transport using Supabase's official public CA. The official engine still owns migrations, advisory locks and receipts. No remote TLS verification is disabled. A wrong-CA test rejected the connection before authentication. See the [transport boundary](../../../../config/database/README.md). |
| Notes broker tables had not been applied. | Rehearsed on an exact SQL backup schema, added an explicit transaction to this previously unapplied migration, and deployed it through the tracked workflow. RLS is enabled and anonymous/authenticated roles have no table access. |
| Prisma differed from existing SQL defaults, generated Calendar projections, FK update actions and index names. | Introspected an exact SQL schema clone, updated the client mapping without issuing Prisma-generated DDL, regenerated the client, and incremented its schema version to 38. Read-only generated-client queries against seven hosted feature models passed. |
| Existing test data references missing users/parties. The user confirmed test data was deleted. | Identified 96 distinct rows across five tables. Two legacy QA cleanup paths disabled FK cascades and inherited hosted credentials; that dangerous pattern is now removed. Both suites require an explicitly named disposable loopback database, use ordinary cascades, and fail on cleanup errors. Their actual-schema local runs passed with zero leftover records. After explicit approval, exactly 96 archived orphans were removed with ordinary triggers and preservation guards. The exact historical deletion mechanism cannot be proved from the available logs. |

## Migration results

| Migration | Result |
| --- | --- |
| `20261018010000_calendar_scheduling` | Already fully present; reconciled after verified schema/data/security postconditions. |
| `20261018020000_external_calendars` | Already fully present; reconciled after verified postconditions. |
| `20261018030000_calendar_completion` | Already fully present; reconciled after verified postconditions. |
| `20261020000000_notes_connections` | Applied successfully in an explicit transaction. |

This Supabase-hosted project already uses `public._prisma_migrations`, **not** a
Supabase CLI migration ledger. No second ledger was introduced. Two older timestamp
prefixes are duplicated, but their full migration names are distinct and remain
unchanged. Every previously successful migration file retains its original checksum.
The final ledger has 70 successful receipts plus the retained resolved failed attempt.

## Preservation and recovery

- Before/after checks found **no changes to the contents of any of the 71 existing
  application tables**. All pre-existing tables, columns/types, constraints, indexes,
  triggers, policies, grants, functions/ACLs, enums, roles, default privileges,
  extensions and publications were preserved. Only the Notes broker objects and
  verified migration receipts were added during deployment. The subsequent approved
  data-only cleanup compared all 74 public tables (including the migration ledger)
  and preserved every unselected row. It issued no schema/security/history changes.
- A private custom-format backup is retained at
  `backups/database-migrations-20261022-379bc6f8/before.dump`
  (directory `0700`, file `0600`, gitignored). It covers public schema/data and
  Storage metadata; it is **not** a backup of Storage object bytes, all managed
  platform schemas, or provider documents.
- The backup archive is readable and its public schema restores successfully.
  **The initial full public-data restore failed at the pre-existing orphaned FK.**
  Do not interpret the successful schema rehearsal as a successful unmodified
  data restore. Two subsequent local repair rehearsals passed against the original
  114 foreign keys and application triggers. Notes added two more foreign keys.
  Following approved cleanup, a **new public schema/data backup restored completely**,
  with all 116 foreign keys validated and every one of the 73 application-table
  fingerprints matching the hosted post-cleanup snapshot. The original dump is
  retained unchanged. The clean dump is `after-orphan-cleanup-a5dfb70c.dump` beside it.
- The private `orphaned-test-records.json` beside the dump preserves all 96 rows.
  Its SHA-256 is recorded privately, and every row reconstructed through the actual
  PostgreSQL types without losing fields. Reinstating those records into active
  tables would require resolving the authentic missing parents first.

### Approved orphaned-test-data cleanup — completed

The user explicitly approved removal of the 96 archived records. The
[review SQL](orphan-repair-proposal.sql) selected only these records, and the
hosted transaction removed exactly these counts:

| Table | Distinct records |
| --- | ---: |
| FocusPartyMember | 16 |
| FocusSession | 15 |
| FocusSessionMember | 29 |
| Friendship | 16 |
| SessionInvite | 20 |
| **Total** | **96** |

None of the selected session-member rows refers to a currently existing user.
The executed operation briefly locked the relevant tables, checked the original
counts/content fingerprints and exact archive contents, used normal triggers, and
verified every current FK. It also compared every unselected row across all 74
public tables before committing. No parent identity was fabricated and no
constraint was weakened. The review SQL remains a safe standalone **rollback**;
the approved executor committed only after all preservation checks passed.

The first execution fully rolled back when an executor check incorrectly expected
the pre-Notes count of 114 FKs. The check was corrected to derive the count from
the verified post-migration schema, including both Notes relationships (116).
The retry committed successfully; independent checks found **zero FK violations**,
zero disabled internal triggers and zero stale Calendar search rows. The failed
attempt and successful execution are both retained as evidence.

## Prisma and SQL ownership

The introspection clone matches hosted column definitions, all public constraints
and indexes. Restoring a dump compacts physical gaps left by dropped columns;
column ordinal numbers are therefore excluded from semantic parity.

Installed Prisma introspection generated invalid one-to-one mappings for additional
composite Planner ownership FKs, and treated partial uniqueness as global relation
cardinality. Those generated mappings were not copied into the production client.
SQL continues owning those nine additional composite FKs, five partial indexes,
expression indexes, checks, triggers, policies and generated-column semantics.
The supported Prisma mapping has an **empty semantic diff** after excluding those
explicit SQL-owned objects. The diagnostic full diff is evidence only; **never
execute it**. No uniqueness constraint was added to satisfy an introspection bug.

## Verification

| Check | Result |
| --- | --- |
| Hosted official migration status and all recorded checksums | Pass: 70 successful, none pending/failed/mismatched. |
| Pre-existing schema/security and data preservation | Migration deployment preserved all 71 original application tables. Approved cleanup preserved every unselected row across all 74 current public tables. |
| Notes PostgreSQL integration | Pass: actual SQL, FK/uniqueness, RLS, browser denial, refresh lease and owner cascade. |
| Calendar PostgreSQL integration | 33 tests passed. |
| Notes/Calendar/migration regression suites | 266 passed, one existing opt-in scalability profile skipped. A final safeguard run passed 11 tests after one additional case was added. |
| Legacy Focus Party suites on the actual schema | Both passed; full suite 67 assertions; cleanup left zero application rows. |
| Prisma generation, generated-client hosted reads, standalone TypeScript, changed-file ESLint | Passed. The final standalone typecheck also used a temporary 6 GB heap; its default 2 GB retry after build exhausted memory. |
| Production web build | Passed using webpack and a temporary 6 GB Node heap allowance. The sandboxed default Turbopack attempt stalled; the first webpack TypeScript worker hit its default 2 GB heap. No compiler/configuration bypass or deployed setting change was made. |
| Mobile production build and bundle boundary audit | Passed; no server symbols or secrets in the mobile bundle. |
| Wrong-CA transport test | Passed: zero verified connections, fake payload only, no real credentials sent. |
| Review SQL / archival fidelity / approved hosted cleanup | Local rollback/commit rehearsals passed. Exactly 96 archived records removed after approval; all 116 current FKs pass. Fresh public schema/data backup restored with all 73 application-table fingerprints matching. |

Detailed, sanitized results are indexed in [evidence](evidence/README.md).
No hosted reset, schema recreation, trigger bypass, production `db push`, generated
migration diff, or arbitrary history update was performed. Hosted deletion was
limited to the explicitly approved 96 archived test records. No web deployment,
live Google consent or Drive file operation was performed.

## Remaining issues and setup

1. **Old empty-database bootstrap is incomplete.** A fresh sequential SQL replay
   stops after six migrations at
   `20260821010000_add_economy_and_inventory_rpcs`: `ItemCategory` is missing
   (`42704`). That type exists in the hosted database but its earlier creation is
   absent from the checked-in historical sequence. A dedicated SQL baseline/bootstrap
   reconciliation is needed before provisioning a new environment. Existing receipts
   were not renamed or rewritten to conceal this gap; the hosted pending list is clean.
2. **Hosted orphan cleanup is complete.** Exactly the approved 96 records were
   removed and all current FKs pass. The original and pre-cleanup dumps plus the
   96-row recovery archive remain private; a new clean dump has passed full public
   schema/data restoration. These are not backups of Storage object bytes or the
   whole managed Supabase platform.
3. **Transport security needs a separate operational follow-up.** Migration and audit
   traffic used verified client-to-pooler TLS. The hosted backend reported
   `pg_stat_ssl.ssl=false` for its pooler-to-database hop. Separately, the existing
   application pool does not explicitly request TLS and its configured URL has no
   TLS options. The migration helper does not fix or qualify the application's
   transport. Hosted SSL-enforcement changes can restart the database and were not
   made. The supplied management token returned `401`, so its SSL configuration
   could not be inspected or changed through that API.
4. **Local Notes configuration now passes; hosted/provider setup is unverified.**
   The user saved `NOTES_PUBLIC_URL="https://sylf.app"`. That origin failed TLS
   validation here (`CERT_HAS_EXPIRED`), while the user-supplied Vercel origin
   returned the Sylf page over verified HTTPS. With zero existing Notes connections
   or OAuth states, only the local `.env` value was corrected to
   `https://sylf-alium41rs-projects.vercel.app`. The actual production security module
   now reports configured, verifies the exact origin/callback, rejects the other
   origin, and completes a purpose-bound encryption round trip. No secret values
   were logged. The public deployed `/notes` redirects to sign-in and the API
   returns unauthenticated `401`; authenticated deployment settings were not read.

   Set the same origin in Vercel and deploy it; register
   `https://sylf-alium41rs-projects.vercel.app/api/notes/callback` as an authorized
   redirect on the selected Google OAuth client. [Vercel variables apply to new
   deployments](https://vercel.com/docs/environment-variables), and [Google requires
   an exact redirect match](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri).
   The Vercel/Google consoles were not changed. Keep the origin stable after
   provisioning; a later custom-domain move needs verified library migration.
   Credential validity, consent, Drive API enablement, sync and recovery remain
   subject to the [live acceptance checklist](../../../notes/reports/phase-3/setup.md).

The hosted migration and approved data-integrity repair are complete. The old
bootstrap gap, transport follow-up and unperformed live-provider/deployment tests
remain explicit limits on broader production or disaster-recovery claims.
