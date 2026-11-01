import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";

describe("Planner checked-out database connections",()=>{
  it.each(["observed","coordinated"] as const)("fails %s on an asynchronous socket error and discards the client without replay",async mode=>{
    const sql=Object.assign(new EventEmitter(),{query:vi.fn(async()=>({rows:[{locked:true}]})),release:vi.fn()}),
      pool={connect:vi.fn(async()=>sql as unknown as PoolClient)},db=new PlannerDatabase(pool as unknown as Pool);
    const failure=Object.assign(new Error("private socket details"),{code:"ETIMEDOUT"}),work=vi.fn(async()=>{sql.emit("error",failure);return "not committed";});
    await expect(db[mode](1,work)).rejects.toBe(failure);
    expect(work).toHaveBeenCalledTimes(1);expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(sql.query.mock.calls.flat()).not.toContain("COMMIT");expect(sql.query).toHaveBeenCalledWith("ROLLBACK");
    expect(sql.release).toHaveBeenCalledWith(true);expect(sql.listenerCount("error")).toBe(0);
  });
});
