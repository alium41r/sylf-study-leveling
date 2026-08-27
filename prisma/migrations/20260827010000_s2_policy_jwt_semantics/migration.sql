-- ============================================================================
-- S2b (20260827010000) — policy semantics for the custom-JWT architecture
-- ----------------------------------------------------------------------------
-- SYLF mints its own HS256 JWTs whose "sub" claim is the INTEGER user id
-- (Supabase Realtime tokens minted by /api/realtime/token use the same form).
-- Supabase's auth.uid() casts sub to UUID and therefore ERRORS for these
-- tokens, so every identity policy in public is rewritten to compare against
-- COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)
-- — the same pattern scripts/supabase-realtime-setup.sql already uses for
-- study_session_select_owner_or_friend. Catalogs (AcousticTrack, Item) keep
-- their intentional USING (true) SELECT policies. All statements are
-- DROP IF EXISTS + CREATE, so the migration is idempotent.
-- ============================================================================



DROP POLICY IF EXISTS "aiinsight_user_policy" ON "AiInsight";
CREATE POLICY "aiinsight_user_policy" ON "AiInsight" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "aimemory_user_policy" ON "AiMemory";
CREATE POLICY "aimemory_user_policy" ON "AiMemory" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "aiusagelog_user_policy" ON "AiUsageLog";
CREATE POLICY "aiusagelog_user_policy" ON "AiUsageLog" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "authsession_user_policy" ON "AuthSession";
CREATE POLICY "authsession_user_policy" ON "AuthSession" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "blockeduser_user_policy" ON "BlockedUser";
CREATE POLICY "blockeduser_user_policy" ON "BlockedUser" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "chatsession_user_policy" ON "ChatSession";
CREATE POLICY "chatsession_user_policy" ON "ChatSession" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "connectedaccount_user_policy" ON "ConnectedAccount";
CREATE POLICY "connectedaccount_user_policy" ON "ConnectedAccount" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "dailybriefinglog_user_policy" ON "DailyBriefingLog";
CREATE POLICY "dailybriefinglog_user_policy" ON "DailyBriefingLog" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "floatingrestday_user_policy" ON "FloatingRestDay";
CREATE POLICY "floatingrestday_user_policy" ON "FloatingRestDay" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "goal_user_policy" ON "Goal";
CREATE POLICY "goal_user_policy" ON "Goal" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "hpledger_user_policy" ON "HpLedger";
CREATE POLICY "hpledger_user_policy" ON "HpLedger" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "inventoryitem_user_policy" ON "InventoryItem";
CREATE POLICY "inventoryitem_user_policy" ON "InventoryItem" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "quest_user_policy" ON "Quest";
CREATE POLICY "quest_user_policy" ON "Quest" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "studysession_user_policy" ON "StudySession";
CREATE POLICY "studysession_user_policy" ON "StudySession" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "subject_user_policy" ON "Subject";
CREATE POLICY "subject_user_policy" ON "Subject" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "sylphledger_user_policy" ON "SylphLedger";
CREATE POLICY "sylphledger_user_policy" ON "SylphLedger" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "systemmessage_user_policy" ON "SystemMessage";
CREATE POLICY "systemmessage_user_policy" ON "SystemMessage" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userachievement_user_policy" ON "UserAchievement";
CREATE POLICY "userachievement_user_policy" ON "UserAchievement" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "usercosmetic_user_policy" ON "UserCosmetic";
CREATE POLICY "usercosmetic_user_policy" ON "UserCosmetic" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userinventory_user_policy" ON "UserInventory";
CREATE POLICY "userinventory_user_policy" ON "UserInventory" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userprivacy_user_policy" ON "UserPrivacy";
CREATE POLICY "userprivacy_user_policy" ON "UserPrivacy" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userquota_user_policy" ON "UserQuota";
CREATE POLICY "userquota_user_policy" ON "UserQuota" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userskillnode_user_policy" ON "UserSkillNode";
CREATE POLICY "userskillnode_user_policy" ON "UserSkillNode" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "userstats_user_policy" ON "UserStats";
CREATE POLICY "userstats_user_policy" ON "UserStats" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "verificationtoken_user_policy" ON "VerificationToken";
CREATE POLICY "verificationtoken_user_policy" ON "VerificationToken" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "xpledger_user_policy" ON "XpLedger";
CREATE POLICY "xpledger_user_policy" ON "XpLedger" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "users_select_own_policy" ON "User";
CREATE POLICY "users_select_own_policy" ON "User" FOR SELECT TO public
  USING ("id" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "users_update_own_policy" ON "User";
CREATE POLICY "users_update_own_policy" ON "User" FOR UPDATE TO public
  USING ("id" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("id" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "users_delete_policy" ON "User";
CREATE POLICY "users_delete_policy" ON "User" FOR DELETE TO public
  USING ("id" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "convo_participant_select_policy" ON "ConversationParticipant";
CREATE POLICY "convo_participant_select_policy" ON "ConversationParticipant" FOR SELECT TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR ("conversationId" IN (SELECT cp."conversationId" FROM "ConversationParticipant" cp WHERE cp."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))));


DROP POLICY IF EXISTS "convo_participant_write_policy" ON "ConversationParticipant";
CREATE POLICY "convo_participant_write_policy" ON "ConversationParticipant" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "convo_select_policy" ON "Conversation";
CREATE POLICY "convo_select_policy" ON "Conversation" FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = "Conversation".id AND cp."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "conversation_insert_creator" ON "Conversation";
CREATE POLICY "conversation_insert_creator" ON "Conversation" FOR INSERT TO public
  WITH CHECK ("createdBy" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "conversation_update_creator" ON "Conversation";
CREATE POLICY "conversation_update_creator" ON "Conversation" FOR UPDATE TO public
  USING ("createdBy" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = "Conversation".id AND cp."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)))
  WITH CHECK ("createdBy" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "conversation_delete_participant" ON "Conversation";
CREATE POLICY "conversation_delete_participant" ON "Conversation" FOR DELETE TO public
  USING ("createdBy" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = "Conversation".id AND cp."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "message_insert_policy" ON "Message";
CREATE POLICY "message_insert_policy" ON "Message" FOR INSERT TO public
  WITH CHECK ("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "message_select_policy" ON "Message";
CREATE POLICY "message_select_policy" ON "Message" FOR SELECT TO public
  USING ("conversationId" IN (SELECT cp."conversationId" FROM "ConversationParticipant" cp WHERE cp."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "friendship_write_policy" ON "Friendship";
CREATE POLICY "friendship_write_policy" ON "Friendship" FOR ALL TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "friendship_select_policy" ON "Friendship";
CREATE POLICY "friendship_select_policy" ON "Friendship" FOR SELECT TO public
  USING (("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "friendId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "friend_request_insert_policy" ON "FriendRequest";
CREATE POLICY "friend_request_insert_policy" ON "FriendRequest" FOR INSERT TO public
  WITH CHECK ("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));


DROP POLICY IF EXISTS "friend_request_select_policy" ON "FriendRequest";
CREATE POLICY "friend_request_select_policy" ON "FriendRequest" FOR SELECT TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "friend_request_update_policy" ON "FriendRequest";
CREATE POLICY "friend_request_update_policy" ON "FriendRequest" FOR UPDATE TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)))
  WITH CHECK (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "friend_request_delete_policy" ON "FriendRequest";
CREATE POLICY "friend_request_delete_policy" ON "FriendRequest" FOR DELETE TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "session_invite_select_policy" ON "SessionInvite";
CREATE POLICY "session_invite_select_policy" ON "SessionInvite" FOR SELECT TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "session_invite_update_policy" ON "SessionInvite";
CREATE POLICY "session_invite_update_policy" ON "SessionInvite" FOR UPDATE TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)))
  WITH CHECK (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "session_invite_delete_policy" ON "SessionInvite";
CREATE POLICY "session_invite_delete_policy" ON "SessionInvite" FOR DELETE TO public
  USING (("senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0) OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));


DROP POLICY IF EXISTS "subject_node_user_policy" ON "SubjectNode";
CREATE POLICY "subject_node_user_policy" ON "SubjectNode" FOR ALL TO public
  USING ("subjectId" IN (SELECT s.id FROM "Subject" s WHERE s."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)))
  WITH CHECK ("subjectId" IN (SELECT s.id FROM "Subject" s WHERE s."userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)));

