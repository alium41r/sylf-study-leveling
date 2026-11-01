/** Preserve Prisma's SQL ledger while Node verifies provider TLS. Only the
 * ephemeral loopback hop is plaintext; remote TLS never falls back. */
import net from "node:net";
import tls from "node:tls";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export function databaseOptions(
  connectionString,
  caFile = process.env.PGSSLROOTCERT
) {
  if (!connectionString) throw Error("DIRECT_URL is required.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("Use a PostgreSQL session/direct connection.");
  if (url.searchParams.has("host"))
    throw Error("URL host overrides are unsupported.");
  caFile ||= url.searchParams.get("sslrootcert");
  if (
    ["sslcert", "sslkey", "sslidentity", "sslpassword"].some((key) =>
      url.searchParams.has(key)
    )
  )
    throw Error(
      "Client-certificate authentication requires a separately qualified transport."
    );
  const local = localHosts.has(url.hostname);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543")
    throw Error(
      "Migrations require session pooling (5432), not transaction pooling."
    );
  for (const key of [
    "ssl",
    "sslmode",
    "sslaccept",
    "sslrootcert",
    "sslcert",
    "sslidentity",
    "sslpassword",
  ])
    url.searchParams.delete(key);
  if (
    !caFile &&
    (url.hostname.endsWith(".pooler.supabase.com") ||
      url.hostname.endsWith(".supabase.co"))
  )
    caFile = fileURLToPath(
      new URL("../../config/database/supabase-root-2021.crt", import.meta.url)
    );
  return {
    url,
    local,
    client: {
      connectionString: url.toString(),
      ssl: local
        ? false
        : {
            rejectUnauthorized: true,
            ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
          },
      connectionTimeoutMillis: 15000,
      application_name: "sylf-sql-migrations",
    },
  };
}
export async function readMigrationHistory(connectionString) {
  const { client: options } = databaseOptions(connectionString),
    client = new pg.Client(options);
  try {
    await client.connect();
    return (
      await client.query(
        "SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY started_at,id"
      )
    ).rows;
  } finally {
    await client.end();
  }
}
export function checkMigrationHistory(files, rows) {
  const byName = new Map(files.map((f) => [f.name, f])),
    applied = new Set(),
    failed = [];
  for (const row of rows) {
    const file = byName.get(row.migration_name);
    if (!file || file.checksum !== row.checksum)
      throw Error(
        `Migration source/history mismatch: ${row.migration_name}. Audit before proceeding.`
      );
    if (row.finished_at && !row.rolled_back_at) {
      if (applied.has(row.migration_name))
        throw Error("Duplicate successful migration receipt.");
      applied.add(row.migration_name);
    } else if (!row.rolled_back_at) failed.push(row.migration_name);
  }
  return { pending: files.filter((f) => !applied.has(f.name)), failed };
}
export async function startVerifiedBridge(connectionString, caFile) {
  const options = databaseOptions(connectionString, caFile);
  if (options.local)
    return {
      url: connectionString,
      verifiedConnections: () => 0,
      failures: [],
      close: async () => {},
    };
  const sockets = new Set(),
    failures = [];
  let verified = 0;
  const server = net.createServer((local) => {
    sockets.add(local);
    local.pause();
    let secure;
    const remote = net.connect({
      host: options.url.hostname,
      port: Number(options.url.port || 5432),
    });
    sockets.add(remote);
    const stop = (error) => {
      if (error) failures.push(error.code || "TLS_CONNECTION_FAILED");
      local.destroy();
      secure?.destroy();
      remote.destroy();
    };
    const timeout = setTimeout(
      () => stop({ code: "TLS_HANDSHAKE_TIMEOUT" }),
      15000
    );
    local.on("error", () => stop());
    remote.on("error", stop);
    local.on("close", () => {
      clearTimeout(timeout);
      sockets.delete(local);
      secure?.destroy();
      remote.destroy();
    });
    remote.on("close", () => sockets.delete(remote));
    remote.once("connect", () => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8);
      request.writeInt32BE(80877103, 4);
      remote.write(request);
    });
    remote.once("data", (bytes) => {
      if (bytes.length !== 1 || bytes[0] !== 83)
        return stop({ code: "TLS_REQUIRED" });
      secure = tls.connect(
        {
          socket: remote,
          servername: options.url.hostname,
          minVersion: "TLSv1.2",
          ...options.client.ssl,
        },
        () => {
          clearTimeout(timeout);
          if (!secure.authorized) return stop({ code: "TLS_UNAUTHORIZED" });
          verified++;
          local.pipe(secure);
          secure.pipe(local);
          local.resume();
        }
      );
      secure.on("error", stop);
      secure.on("end", () => local.end());
    });
  });
  server.maxConnections = 8;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = new URL(options.url);
  url.hostname = "127.0.0.1";
  url.port = String(server.address().port);
  url.searchParams.set("sslmode", "disable");
  return {
    url: url.toString(),
    verifiedConnections: () => verified,
    failures,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
export async function runVerifiedPrisma(
  args,
  connectionString,
  { timeoutMs = 120000, caFile } = {}
) {
  const bridge = await startVerifiedBridge(connectionString, caFile);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [root + "node_modules/prisma/build/index.js", ...args],
        {
          cwd: root,
          env: { ...process.env, DIRECT_URL: bridge.url },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: timeoutMs,
        }
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    const original = new URL(connectionString),
      secrets = [
        connectionString,
        bridge.url,
        decodeURIComponent(original.password),
      ].filter(Boolean);
    for (const key of ["stdout", "stderr"])
      for (const secret of secrets)
        result[key] = result[key].split(secret).join("[redacted]");
    return {
      ...result,
      verifiedConnections: bridge.verifiedConnections(),
      transportFailures: bridge.failures,
    };
  } finally {
    await bridge.close();
  }
}
