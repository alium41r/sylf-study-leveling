// ============================================================================
// Focus Backgrounds — Phase 5B: Live Database Cascade & Deletion Trigger Tests
// ============================================================================
// Verifies (User Corrections #9 & #10):
// 1. Direct delete of selected UserFocusBackground:
//    - User preference resets to: source = 'classic', official = null, custom = null
//    - focusBackgroundPreferenceVersion is incremented
// 2. Direct delete of selected FocusBackground:
//    - User preference resets to: source = 'classic', official = null, custom = null
//    - focusBackgroundPreferenceVersion is incremented
// 3. Category cascade delete:
//    - Deleting FocusBackgroundCategory cascades deletion to selected FocusBackground
//    - Trigger fires on child FocusBackground and resets User preference to Classic
// 4. User account deletion cascade:
//    - Deleting User cascades to UserFocusBackground without trigger conflict
//    - Entire user account and its custom backgrounds are deleted cleanly
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env");
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
}

const connectionString = env.DIRECT_URL || process.env.DIRECT_URL;

describe("Focus Backgrounds — Phase 5B: Live Database Cascade & Deletion Triggers", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("resets user preference to classic when selected UserFocusBackground is deleted directly", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create temporary test user
      const userRes = await client.query(`
        INSERT INTO public."User" (email, username, "focusBackgroundSource", "focusBackgroundPreferenceVersion")
        VALUES ('test_trg_custom_' || gen_random_uuid() || '@sylf.app', 'trg_user_' || substr(gen_random_uuid()::text, 1, 8), 'classic', 1)
        RETURNING id, "focusBackgroundPreferenceVersion";
      `);
      const userId = userRes.rows[0].id;
      const initialVersion = userRes.rows[0].focusBackgroundPreferenceVersion;

      // 2. Create custom background for user
      const bgRes = await client.query(`
        INSERT INTO public."UserFocusBackground" ("userId", name, "storagePath", width, height, "aspectRatio", "updatedAt")
        VALUES ($1, 'Trigger Custom BG', $2, 1920, 1080, 1.777, NOW())
        RETURNING id;
      `, [userId, `${userId}/test.webp`]);
      const customBgId = bgRes.rows[0].id;

      // 3. User selects the custom background
      await client.query(`
        UPDATE public."User"
        SET "focusBackgroundSource" = 'custom',
            "selectedCustomBackgroundId" = $1,
            "selectedFocusBackgroundId" = NULL
        WHERE id = $2;
      `, [customBgId, userId]);

      // Verify selected state
      const beforeDelete = await client.query(`
        SELECT "focusBackgroundSource", "selectedFocusBackgroundId", "selectedCustomBackgroundId", "focusBackgroundPreferenceVersion"
        FROM public."User" WHERE id = $1;
      `, [userId]);
      expect(beforeDelete.rows[0].focusBackgroundSource).toBe("custom");
      expect(beforeDelete.rows[0].selectedCustomBackgroundId).toBe(customBgId);

      // 4. Delete the custom background directly
      await client.query(`DELETE FROM public."UserFocusBackground" WHERE id = $1;`, [customBgId]);

      // 5. Verify trigger atomically reset user preference
      const afterDelete = await client.query(`
        SELECT "focusBackgroundSource", "selectedFocusBackgroundId", "selectedCustomBackgroundId", "focusBackgroundPreferenceVersion"
        FROM public."User" WHERE id = $1;
      `, [userId]);

      expect(afterDelete.rows[0].focusBackgroundSource).toBe("classic");
      expect(afterDelete.rows[0].selectedFocusBackgroundId).toBeNull();
      expect(afterDelete.rows[0].selectedCustomBackgroundId).toBeNull();
      expect(afterDelete.rows[0].focusBackgroundPreferenceVersion).toBe(initialVersion + 1);

      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  });

  it("resets user preference to classic when selected FocusBackground is deleted directly", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create temporary category and official background
      const catRes = await client.query(`
        INSERT INTO public."FocusBackgroundCategory" (slug, name, "layoutKey", "updatedAt")
        VALUES ('test-trg-cat-' || substr(gen_random_uuid()::text, 1, 8), 'Test Trigger Cat', 'anime', NOW())
        RETURNING id;
      `);
      const catId = catRes.rows[0].id;

      const bgRes = await client.query(`
        INSERT INTO public."FocusBackground" ("categoryId", name, "storagePath", width, height, "aspectRatio", "updatedAt")
        VALUES ($1, 'Official Trigger BG', 'anime/test.webp', 3840, 2160, 1.777, NOW())
        RETURNING id;
      `, [catId]);
      const officialBgId = bgRes.rows[0].id;

      // 2. Create test user and select official background
      const userRes = await client.query(`
        INSERT INTO public."User" (email, username, "focusBackgroundSource", "selectedFocusBackgroundId", "focusBackgroundPreferenceVersion")
        VALUES ('test_trg_off_' || gen_random_uuid() || '@sylf.app', 'trg_off_' || substr(gen_random_uuid()::text, 1, 8), 'official', $1, 2)
        RETURNING id, "focusBackgroundPreferenceVersion";
      `, [officialBgId]);
      const userId = userRes.rows[0].id;
      const initialVersion = userRes.rows[0].focusBackgroundPreferenceVersion;

      // 3. Delete the official background directly
      await client.query(`DELETE FROM public."FocusBackground" WHERE id = $1;`, [officialBgId]);

      // 4. Verify trigger atomically reset user preference
      const afterDelete = await client.query(`
        SELECT "focusBackgroundSource", "selectedFocusBackgroundId", "selectedCustomBackgroundId", "focusBackgroundPreferenceVersion"
        FROM public."User" WHERE id = $1;
      `, [userId]);

      expect(afterDelete.rows[0].focusBackgroundSource).toBe("classic");
      expect(afterDelete.rows[0].selectedFocusBackgroundId).toBeNull();
      expect(afterDelete.rows[0].selectedCustomBackgroundId).toBeNull();
      expect(afterDelete.rows[0].focusBackgroundPreferenceVersion).toBe(initialVersion + 1);

      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  });

  it("resets user preference when category cascade deletes a selected official background", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create temporary category and official background
      const catRes = await client.query(`
        INSERT INTO public."FocusBackgroundCategory" (slug, name, "layoutKey", "updatedAt")
        VALUES ('test-cascade-cat-' || substr(gen_random_uuid()::text, 1, 8), 'Cascade Cat', 'landscape', NOW())
        RETURNING id;
      `);
      const catId = catRes.rows[0].id;

      const bgRes = await client.query(`
        INSERT INTO public."FocusBackground" ("categoryId", name, "storagePath", width, height, "aspectRatio", "updatedAt")
        VALUES ($1, 'Cascade Official BG', 'landscape/cascade.webp', 1920, 1080, 1.777, NOW())
        RETURNING id;
      `, [catId]);
      const officialBgId = bgRes.rows[0].id;

      // 2. Create user with this background selected
      const userRes = await client.query(`
        INSERT INTO public."User" (email, username, "focusBackgroundSource", "selectedFocusBackgroundId", "focusBackgroundPreferenceVersion")
        VALUES ('test_cascade_' || gen_random_uuid() || '@sylf.app', 'cascade_user_' || substr(gen_random_uuid()::text, 1, 8), 'official', $1, 5)
        RETURNING id, "focusBackgroundPreferenceVersion";
      `, [officialBgId]);
      const userId = userRes.rows[0].id;
      const initialVersion = userRes.rows[0].focusBackgroundPreferenceVersion;

      // 3. Delete the parent category (which CASCADE deletes the child FocusBackground)
      await client.query(`DELETE FROM public."FocusBackgroundCategory" WHERE id = $1;`, [catId]);

      // 4. Verify trigger fired during cascade and reset user preference to Classic
      const afterCascade = await client.query(`
        SELECT "focusBackgroundSource", "selectedFocusBackgroundId", "selectedCustomBackgroundId", "focusBackgroundPreferenceVersion"
        FROM public."User" WHERE id = $1;
      `, [userId]);

      expect(afterCascade.rows[0].focusBackgroundSource).toBe("classic");
      expect(afterCascade.rows[0].selectedFocusBackgroundId).toBeNull();
      expect(afterCascade.rows[0].selectedCustomBackgroundId).toBeNull();
      expect(afterCascade.rows[0].focusBackgroundPreferenceVersion).toBe(initialVersion + 1);

      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  });

  it("deletes user account cleanly when custom backgrounds are cascade deleted without trigger interference", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create user
      const userRes = await client.query(`
        INSERT INTO public."User" (email, username, "focusBackgroundSource", "focusBackgroundPreferenceVersion")
        VALUES ('test_del_acct_' || gen_random_uuid() || '@sylf.app', 'del_acct_' || substr(gen_random_uuid()::text, 1, 8), 'classic', 1)
        RETURNING id;
      `);
      const userId = userRes.rows[0].id;

      // 2. Add custom background and select it
      const bgRes = await client.query(`
        INSERT INTO public."UserFocusBackground" ("userId", name, "storagePath", width, height, "aspectRatio", "updatedAt")
        VALUES ($1, 'Account Cascade BG', $2, 1920, 1080, 1.777, NOW())
        RETURNING id;
      `, [userId, `${userId}/bg.webp`]);
      const bgId = bgRes.rows[0].id;

      await client.query(`
        UPDATE public."User"
        SET "focusBackgroundSource" = 'custom',
            "selectedCustomBackgroundId" = $1
        WHERE id = $2;
      `, [bgId, userId]);

      // 3. Delete the user account directly (CASCADE to UserFocusBackground)
      const deleteRes = await client.query(`DELETE FROM public."User" WHERE id = $1;`, [userId]);
      expect(deleteRes.rowCount).toBe(1);

      // 4. Verify both user and custom background are completely removed
      const userCheck = await client.query(`SELECT id FROM public."User" WHERE id = $1;`, [userId]);
      expect(userCheck.rows.length).toBe(0);

      const bgCheck = await client.query(`SELECT id FROM public."UserFocusBackground" WHERE id = $1;`, [bgId]);
      expect(bgCheck.rows.length).toBe(0);

      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  });
});
