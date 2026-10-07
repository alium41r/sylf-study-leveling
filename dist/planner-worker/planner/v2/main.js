"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const pg_1 = require("pg");
const database_1 = require("./server/database");
const attempts_1 = require("./server/attempts");
const worker_1 = require("./server/worker");
const compiler_1 = require("./server/compiler");
async function main() {
    if (Number(process.versions.node.split(".")[0]) !== 26)
        throw new Error("WORKER_TOOLCHAIN_MISMATCH");
    if (!process.env.DATABASE_WORKER_URL)
        throw new Error("WORKER_DATABASE_CONFIGURATION_REQUIRED");
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_WORKER_URL, max: 4, idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5000, options: "-c statement_timeout=10000 -c timezone=UTC" });
    pool.on("error", () => process.stderr.write('{"event":"database_pool_error"}\n'));
    const attempts = new attempts_1.AttemptService(new database_1.PlannerDatabase(pool));
    // Reuse the existing deployment admission flag. Step 5 supplies supervised
    // handlers; the generation endpoint and deployment cutover remain Step 6.
    const handlers = process.env.PLANNER_V2_DURABLE_CORE_ENABLED === "true" ? (0, compiler_1.createCompilerHandlers)(attempts) : {};
    const worker = new worker_1.PlannerWorker(attempts, handlers);
    const health = await worker.readiness();
    if (!health.compatible)
        throw new Error("WORKER_SCHEMA_MISMATCH");
    await worker.tick();
    let ticking = false;
    const timer = setInterval(() => {
        if (ticking)
            return;
        ticking = true;
        void worker.tick().catch(() => process.stderr.write('{"event":"worker_tick_failed"}\n')).finally(() => { ticking = false; });
    }, 1000);
    const port = Number(process.env.PLANNER_WORKER_HEALTH_PORT ?? 8081);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("WORKER_HEALTH_CONFIGURATION_INVALID");
    const server = (0, node_http_1.createServer)((request, response) => {
        if (request.url === "/live") {
            response.writeHead(200);
            response.end("alive");
            return;
        }
        if (request.url !== "/ready") {
            response.writeHead(404);
            response.end();
            return;
        }
        void worker.readiness().then(health => {
            response.writeHead(health.ready ? 200 : 503, { "Content-Type": "application/json" });
            response.end(JSON.stringify(health));
        }).catch(() => { response.writeHead(503); response.end('{"ready":false}'); });
    });
    server.listen(port, "127.0.0.1");
    let stopping = false;
    const stop = async () => {
        if (stopping)
            return;
        stopping = true;
        clearInterval(timer);
        server.close();
        await worker.shutdown();
        await Promise.race([pool.end(), new Promise(resolve => setTimeout(resolve, 1000))]);
        process.exit(0);
    };
    process.once("SIGINT", () => { void stop(); });
    process.once("SIGTERM", () => { void stop(); });
}
void main().catch(() => { process.stderr.write('{"event":"worker_start_failed"}\n'); process.exit(1); });
