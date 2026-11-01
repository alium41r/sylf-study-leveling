// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  databaseOptions,
  checkMigrationHistory,
  startVerifiedBridge,
} from "../scripts/db/verified-prisma.mjs";
import { focusPartyTestUrl } from "../scripts/db/disposable-database.mjs";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

describe("SQL-authoritative migration safeguards", () => {
  const files = [
    { name: "20260000000000_first", checksum: "a" },
    { name: "20260000000000_second", checksum: "b" },
  ];
  it("keeps unapplied SQL pending and does not equate rolled-back attempts with success", () => {
    expect(
      checkMigrationHistory(files, [
        {
          migration_name: files[0].name,
          checksum: "a",
          finished_at: null,
          rolled_back_at: "date",
        },
      ])
    ).toEqual({ pending: files, failed: [] });
  });
  it("refuses historical source edits, unknown receipts and duplicate success", () => {
    expect(() =>
      checkMigrationHistory(files, [
        {
          migration_name: files[0].name,
          checksum: "changed",
          finished_at: "date",
        },
      ])
    ).toThrow("mismatch");
    expect(() =>
      checkMigrationHistory(files, [{ migration_name: "other", checksum: "a" }])
    ).toThrow("mismatch");
    const row = {
      migration_name: files[0].name,
      checksum: "a",
      finished_at: "date",
    };
    expect(() => checkMigrationHistory(files, [row, row])).toThrow("Duplicate");
  });
  it("reports unresolved attempts rather than repairing them automatically", () => {
    expect(
      checkMigrationHistory(files, [
        {
          migration_name: files[0].name,
          checksum: "a",
          finished_at: null,
          rolled_back_at: null,
        },
      ]).failed
    ).toEqual([files[0].name]);
  });
  it("uses full migration names when timestamp prefixes collide", () => {
    const names = [
      { name: "20260000000000_a", checksum: "a" },
      { name: "20260000000000_b", checksum: "b" },
    ];
    expect(
      checkMigrationHistory(names, [
        { migration_name: names[0].name, checksum: "a", finished_at: "date" },
      ]).pending
    ).toEqual([names[1]]);
  });
  it("always verifies remote TLS even if a URL requests weaker modes", () => {
    const { client, local } = databaseOptions(
      "postgresql://user:synthetic@database.example.test/db?sslmode=disable&sslaccept=accept_invalid_certs"
    );
    expect(local).toBe(false);
    expect(client.ssl.rejectUnauthorized).toBe(true);
    expect(client.connectionString).not.toContain("sslmode");
  });
  it("accepts direct/session connections and rejects transaction pooling or host overrides", () => {
    expect(() =>
      databaseOptions(
        "postgresql://user:synthetic@sample.pooler.supabase.com:6543/db"
      )
    ).toThrow("session pooling");
    expect(() =>
      databaseOptions("postgresql://user:synthetic@localhost/db?host=other")
    ).toThrow("host overrides");
    expect(() => databaseOptions("http://localhost/test")).toThrow(
      "PostgreSQL"
    );
    expect(() =>
      databaseOptions(
        "postgresql://u:p@database.example.test/db?sslcert=client.pem"
      )
    ).toThrow("Client-certificate");
  });
  it("honors an explicitly configured public root certificate", () => {
    const path = "config/database/supabase-root-2021.crt";
    const { client } = databaseOptions(
      "postgresql://u:p@database.example.test/db?sslrootcert=" + path
    );
    expect(client.ssl.ca).toBe(readFileSync(path, "utf8"));
    expect(client.ssl.rejectUnauthorized).toBe(true);
  });
  it("pins the official public CA and never treats a private key as the certificate", () => {
    const cert = new X509Certificate(
      readFileSync("config/database/supabase-root-2021.crt")
    );
    expect(cert.ca).toBe(true);
    expect(cert.verify(cert.publicKey)).toBe(true);
    expect(cert.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"
    );
  });
  it("keeps local-only PostgreSQL tests local and makes closure safe", async () => {
    const url = "postgresql://postgres:synthetic@127.0.0.1:5432/sylf_test";
    const bridge = await startVerifiedBridge(url);
    expect(bridge.url).toBe(url);
    await bridge.close();
    expect(bridge.verifiedConnections()).toBe(0);
  });
  it("refuses both legacy QA scripts before any implicit hosted connection", () => {
    for (const value of [
      undefined,
      "postgresql://u:p@sample.supabase.co/postgres",
      "postgresql://u:p@127.0.0.1/postgres",
      "postgresql://u:p@127.0.0.1/sylf_focus_party_test?host=remote",
    ])
      expect(() => focusPartyTestUrl(value)).toThrow();
    expect(
      focusPartyTestUrl("postgresql://u:p@localhost/sylf_focus_party_test_a1")
    ).toContain("127.0.0.1");
    for (const path of [
      "scripts/db/confirm-invites-and-rejoin.mjs",
      "scripts/verify/verify-focus-party.mjs",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("FOCUS_PARTY_TEST_DATABASE_URL");
      expect(source).not.toContain("session_replication_role");
      expect(source).not.toContain("env.DIRECT_URL");
    }
  });
  it("keeps Notes DDL atomic without drop/recreate or silent IF NOT EXISTS masking", () => {
    const sql = readFileSync(
      "prisma/migrations/20261020000000_notes_connections/migration.sql",
      "utf8"
    );
    expect(sql).toMatch(/\nBEGIN;/);
    expect(sql.trim()).toMatch(/COMMIT;$/);
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|IF NOT EXISTS/);
  });
});
