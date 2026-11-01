# Database certificate and migration transport

`supabase-root-2021.crt` is a **public CA certificate**, not a credential or private
key. Its source is Supabase Studio's official
[certificate configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json),
which points to the [public download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).

- Subject: Supabase Root 2021 CA; expires 26 April 2031.
- SHA-256 fingerprint:
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- Reverify the official source and fingerprint when Supabase rotates its CA.
  No system trust store is modified. `PGSSLROOTCERT` can select an explicit CA file.

The migration helper uses Node's certificate and hostname verification for remote
connections. A short-lived loopback PostgreSQL bridge lets the installed native
Prisma engine retain its normal migration ledger and advisory locks when its
macOS trust resolution fails. Authentication bytes are held until verified TLS
completes. The bridge binds only `127.0.0.1`, closes with the command, rejects
transaction-pooler endpoints, and never falls back to unverified remote TLS.

The unencrypted loopback hop is a local-process trust boundary: run migrations
only on a trusted development/operations host. Client-to-pooler TLS verification
does not establish encryption on Supabase's internal pooler-to-database hop. This
helper does not change application pool options or hosted SSL enforcement.

See [migration operations](../../scripts/README.md#database-migrations) and the
[22 October audit](../../documentation/infrastructure/reports/2026-10-22-database-migrations/report.md).
