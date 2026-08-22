-- Migration: Add Economy and Inventory RPCs (purchase_shop_item & toggle_equip_item)

-- 1. Stored Procedure: purchase_shop_item
CREATE OR REPLACE FUNCTION public.purchase_shop_item(
    p_item_id INT
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_currency INT,
    inventory_id INT,
    new_quantity INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_currency INT;
    v_user_rank TEXT;
    v_user_rank_weight INT;
    v_req_rank_weight INT;
    v_item_sku TEXT;
    v_item_name TEXT;
    v_item_category "ItemCategory";
    v_item_slot "ItemSlot";
    v_item_rarity "ItemRarity";
    v_item_req_rank TEXT;
    v_item_cost INT;
    v_item_set_key TEXT;
    v_remaining_currency INT;
    v_inv_id INT := 0;
    v_new_quantity INT := 1;
BEGIN
    -- 1. Extract and validate user ID from JWT claims
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- 2. Resilient UserStats initialization & row-level lock
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints", "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    SELECT currency, rank 
    INTO v_currency, v_user_rank 
    FROM "UserStats" 
    WHERE "userId" = v_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user';
    END IF;

    -- 3. Fetch item metadata
    SELECT sku, name, category, slot, rarity, "rankRequirement", "costSylph", "setKey"
    INTO v_item_sku, v_item_name, v_item_category, v_item_slot, v_item_rarity, v_item_req_rank, v_item_cost, v_item_set_key
    FROM "Item"
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    -- 4. Explicit Rank Weight Evaluation
    v_user_rank_weight := CASE v_user_rank
        WHEN 'MONARCH'  THEN 8
        WHEN 'NATIONAL' THEN 7
        WHEN 'RANK S'   THEN 6
        WHEN 'RANK A'   THEN 5
        WHEN 'RANK B'   THEN 4
        WHEN 'RANK C'   THEN 3
        WHEN 'RANK D'   THEN 2
        ELSE 1 -- 'RANK E'
    END;

    v_req_rank_weight := CASE v_item_req_rank
        WHEN 'MONARCH'  THEN 8
        WHEN 'NATIONAL' THEN 7
        WHEN 'RANK S'   THEN 6
        WHEN 'RANK A'   THEN 5
        WHEN 'RANK B'   THEN 4
        WHEN 'RANK C'   THEN 3
        WHEN 'RANK D'   THEN 2
        ELSE 1 -- 'RANK E'
    END;

    IF v_user_rank_weight < v_req_rank_weight THEN
        RAISE EXCEPTION 'Insufficient rank: Required %, User %', v_item_req_rank, v_user_rank;
    END IF;

    -- 5. Currency Check
    IF v_currency < v_item_cost THEN
        RAISE EXCEPTION 'Insufficient Sylph';
    END IF;

    -- 6. Currency Deduction & Balance Update
    v_remaining_currency := v_currency - v_item_cost;
    UPDATE "UserStats"
    SET currency = v_remaining_currency, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    UPDATE "User"
    SET sylph = v_remaining_currency
    WHERE id = v_user_id;

    -- 7. Audit Logging in SylphLedger
    INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (
        v_user_id,
        -v_item_cost,
        -v_item_cost,
        v_remaining_currency,
        'SHOP_PURCHASE: ' || v_item_sku,
        'SHOP',
        jsonb_build_object('itemId', p_item_id, 'sku', v_item_sku, 'category', v_item_category::text),
        CURRENT_TIMESTAMP
    );

    -- 8. Inventory Mutation based on Category
    IF v_item_category = 'CONSUMABLE' THEN
        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        VALUES (v_user_id, p_item_id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("userId", "itemId") 
        DO UPDATE SET quantity = "UserInventory".quantity + 1, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING id, quantity INTO v_inv_id, v_new_quantity;

    ELSIF v_item_category = 'SET_BUNDLE' THEN
        IF v_item_set_key IS NULL THEN
            RAISE EXCEPTION 'Invalid set bundle: Missing setKey';
        END IF;

        -- Check if user already owns any individual set piece
        IF EXISTS (
            SELECT 1 
            FROM "UserInventory" ui 
            JOIN "Item" i ON ui."itemId" = i.id 
            WHERE ui."userId" = v_user_id 
              AND i."setKey" = v_item_set_key 
              AND i.category = 'EQUIPMENT'
        ) THEN
            RAISE EXCEPTION 'Item already owned: Set component already in inventory';
        END IF;

        -- Atomically insert all 4 set pieces into UserInventory
        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        SELECT v_user_id, id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM "Item"
        WHERE "setKey" = v_item_set_key AND category = 'EQUIPMENT';

        v_inv_id := p_item_id;
        v_new_quantity := 1;

    ELSIF v_item_category IN ('EQUIPMENT', 'WEAPON') THEN
        IF EXISTS (
            SELECT 1 FROM "UserInventory" WHERE "userId" = v_user_id AND "itemId" = p_item_id
        ) THEN
            RAISE EXCEPTION 'Item already owned';
        END IF;

        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        VALUES (v_user_id, p_item_id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, quantity INTO v_inv_id, v_new_quantity;
    ELSE
        RAISE EXCEPTION 'Unsupported item category: %', v_item_category;
    END IF;

    RETURN QUERY SELECT TRUE, v_remaining_currency, v_inv_id, v_new_quantity;
END;
$$;


-- 2. Stored Procedure: toggle_equip_item
CREATE OR REPLACE FUNCTION public.toggle_equip_item(
    p_inventory_id INT
)
RETURNS TABLE (
    inventory_id INT,
    is_equipped BOOLEAN,
    slot TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_inv_id INT;
    v_inv_user_id INT;
    v_item_id INT;
    v_is_equipped BOOLEAN;
    v_item_category "ItemCategory";
    v_item_slot "ItemSlot";
    v_new_is_equipped BOOLEAN;
BEGIN
    -- 1. Extract and validate user ID from JWT claims
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- 2. Lock target inventory record FOR UPDATE
    SELECT ui.id, ui."userId", ui."itemId", ui."isEquipped", i.category, i.slot
    INTO v_inv_id, v_inv_user_id, v_item_id, v_is_equipped, v_item_category, v_item_slot
    FROM "UserInventory" ui
    JOIN "Item" i ON ui."itemId" = i.id
    WHERE ui.id = p_inventory_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found';
    END IF;

    IF v_inv_user_id <> v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Inventory record does not belong to user';
    END IF;

    -- 3. Strict Category & Slot Guard
    IF v_item_category NOT IN ('EQUIPMENT', 'WEAPON') OR v_item_slot = 'NONE' THEN
        RAISE EXCEPTION 'Cannot equip non-equipment item';
    END IF;

    -- 4. State Transition
    IF v_is_equipped = FALSE THEN
        -- Equipping: Unequip any other item currently equipped in the same slot for this user
        UPDATE "UserInventory" ui
        SET "isEquipped" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
        FROM "Item" i
        WHERE ui."itemId" = i.id
          AND ui."userId" = v_user_id
          AND i.slot = v_item_slot
          AND ui.id <> p_inventory_id
          AND ui."isEquipped" = TRUE;

        -- Equip target item
        UPDATE "UserInventory"
        SET "isEquipped" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = p_inventory_id;

        v_new_is_equipped := TRUE;
    ELSE
        -- Unequipping
        UPDATE "UserInventory"
        SET "isEquipped" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = p_inventory_id;

        v_new_is_equipped := FALSE;
    END IF;

    RETURN QUERY SELECT p_inventory_id, v_new_is_equipped, v_item_slot::text;
END;
$$;
