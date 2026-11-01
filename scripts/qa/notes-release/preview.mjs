import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/package.json"),
  { preview } = await import(pathToFileURL(require.resolve("vite")).href);
const port = Number(process.env.NOTES_QA_PORT || 4393);
let appearance =
  process.env.NOTES_QA_LIGHT === "true"
    ? { activeTheme: "#0C7967", activeBackground: "#FAF7F0" }
    : { activeTheme: "#8B5CF6", activeBackground: "#101218" };
let libraryId = randomUUID(),
  offline = false,
  uploads = 0;
const files = new Map();
const connection = () => ({
  descriptor: {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId,
    ownerRef: "1",
    bindingGeneration: 1,
    extensions: {},
  },
  binding: {
    provider: "google-drive",
    accountId: "synthetic",
    rootId: "synthetic",
    generation: 1,
    verifiedAt: new Date(0).toISOString(),
    probeHash: "0".repeat(64),
  },
  status: "ACTIVE",
  label: "synthetic",
});
const server = await preview({
  configFile: process.cwd() + "/scripts/qa/notes-release/vite.config.mjs",
  preview: { port, host: "127.0.0.1", strictPort: true },
  plugins: [
    {
      name: "synthetic-provider-only",
      configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || "/", "http://127.0.0.1:4393");
          if (
            !url.pathname.startsWith("/qa/") &&
            !url.pathname.startsWith("/api/")
          )
            return next();
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const bytes = Buffer.concat(chunks);
          const json = (v, status = 200) => {
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(v));
          };
          if (url.pathname === "/qa/drive-pdf/results") {
            writeFileSync(
              "documentation/notes/reports/phase-7/evidence/drive-pdf-results.json",
              bytes
            );
            return json({ ok: true });
          }
          if (url.pathname === "/qa/drive-pdf/file") {
            const kind = url.searchParams.get("kind");
            if (
              ![
                "rich-text",
                "handwriting",
                "annotated-pdf",
                "title-only",
              ].includes(kind)
            )
              return json({ error: "Synthetic selection required" }, 400);
            writeFileSync(
              `/private/tmp/sylf-phase7-readable-${kind}.pdf`,
              bytes
            );
            return json({ ok: true });
          }
          if (url.pathname === "/qa/appearance") {
            appearance = JSON.parse(bytes.toString());
            return json({ ok: true });
          }
          if (url.pathname === "/api/user/stats")
            return json({
              id: 1,
              isAdmin: process.env.NOTES_QA_ADMIN === "true",
              email: "synthetic@example.test",
              username: "notes_qa",
              name: "Notes QA",
              hunterRank: "E",
              level: 1,
              currentXP: 0,
              xpToNextLevel: 100,
              hp: 100,
              maxHp: 100,
              streakDays: 1,
              totalStudyMinutes: 0,
              sylph: 100,
              hasCompletedOnboarding: true,
              createdAt: "2026-10-20T00:00:00Z",
              ...appearance,
            });
          if (url.pathname === "/api/notes/connection")
            return json({ configured: true, connection: connection() });
          if (url.pathname === "/api/notes/unlock")
            return json({
              ...connection(),
              vaultKey: Buffer.alloc(32, 71).toString("base64"),
              headerVerified: true,
            });
          if (
            url.pathname === "/api/subjects" ||
            url.pathname === "/api/invites" ||
            url.pathname === "/api/notifications" ||
            url.pathname === "/api/calendar/reminders"
          )
            return json([]);
          if (url.pathname === "/api/timer/state")
            return json({ session: null });
          if (url.pathname === "/qa/reset") {
            libraryId = randomUUID();
            offline = false;
            uploads = 0;
            files.clear();
            return json(connection());
          }
          if (url.pathname === "/qa/offline") {
            offline = bytes.toString() === "true";
            return json({ offline });
          }
          if (url.pathname === "/qa/metrics")
            return json({ uploads, files: files.size });
          if (url.pathname === "/qa/results") {
            writeFileSync(
              process.cwd() +
                "/documentation/notes/reports/phase-7/evidence/mixed-soak-results.json",
              bytes
            );
            return json({ ok: true });
          }
          if (url.pathname === "/api/notes/drive") {
            if (offline) return json({ code: "NETWORK" }, 503);
            if (url.searchParams.get("action") === "upload") {
              const hash = createHash("sha256").update(bytes).digest("hex");
              if (hash !== url.searchParams.get("hash"))
                return json({ code: "CORRUPT" }, 409);
              const file = { id: randomUUID(), hash, version: "1" };
              files.set(file.id, { file, bytes });
              uploads++;
              return json({ file });
            }
            const body = JSON.parse(bytes.toString());
            if (body.action === "list")
              return json({ files: [...files.values()].map((f) => f.file) });
            if (body.action === "read") {
              const f = files.get(body.fileId);
              if (!f) return json({ code: "AUTH" }, 409);
              res.writeHead(200, {
                "Content-Type": "application/octet-stream",
              });
              return res.end(f.bytes);
            }
          }
          return json({ success: true });
        });
      },
    },
  ],
});
console.log(`Phase 7 synthetic preview ready at http://127.0.0.1:${port}`);
process.once("SIGTERM", async () => {
  server.httpServer.close(() => process.exit(0));
});
