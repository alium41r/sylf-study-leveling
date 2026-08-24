-- ============================================================================
-- Supabase Realtime setup for Sylf — run in the Supabase SQL editor.
-- ============================================================================
-- Enables push updates (postgres_changes) for the social/chat tables. The
-- app works fine without this (it falls back to REST polling), but with it:
--   • new chat messages arrive via websocket instead of a 1s poll
--   • friend/conversation lists update instantly instead of every 15s
--
-- Also ensure Realtime is enabled for the project:
--   Supabase Dashboard → Database → Replication → "supabase_realtime"
--   publication must exist and include the tables below.
-- ============================================================================

-- 1. Add tables to the realtime publication
alter publication supabase_realtime add table "Message";
alter publication supabase_realtime add table "Conversation";
alter publication supabase_realtime add table "ConversationParticipant";
alter publication supabase_realtime add table "Friendship";
alter publication supabase_realtime add table "FriendRequest";
alter publication supabase_realtime add table "ChatSession";
alter publication supabase_realtime add table "SystemMessage";

-- ============================================================================
-- 2. Row Level Security for Realtime subscribers
-- ============================================================================
-- The app's server (Prisma) connects as the database owner, which BYPASSES
-- RLS — enabling these policies does not affect existing queries. Realtime
-- delivers events to the browser as `authenticated` using the JWT minted by
-- /api/realtime/token, where the user id lives in the `sub` claim as a
-- string: (auth.jwt() ->> 'sub')::bigint
--
-- NOTE: verify the role in your DATABASE_URL first. Supabase's `postgres`
-- owner always bypasses RLS; if you connect with a custom role instead,
-- grant that role bypassrls or add equivalent policies for it.
-- ============================================================================

-- Messages: visible to conversation participants only
alter table "Message" enable row level security;
drop policy if exists "message_select_participant" on "Message";
create policy "message_select_participant" on "Message"
  for select to authenticated
  using (
    exists (
      select 1 from "ConversationParticipant" cp
      where cp."conversationId" = "Message"."conversationId"
        and cp."userId" = (auth.jwt() ->> 'sub')::bigint
    )
  );

-- Conversations: visible to participants
alter table "Conversation" enable row level security;
drop policy if exists "conversation_select_participant" on "Conversation";
create policy "conversation_select_participant" on "Conversation"
  for select to authenticated
  using (
    exists (
      select 1 from "ConversationParticipant" cp
      where cp."conversationId" = "Conversation".id
        and cp."userId" = (auth.jwt() ->> 'sub')::bigint
    )
  );

-- ConversationParticipant rows: visible to members of the same conversation
alter table "ConversationParticipant" enable row level security;
drop policy if exists "cp_select_member" on "ConversationParticipant";
create policy "cp_select_member" on "ConversationParticipant"
  for select to authenticated
  using (
    exists (
      select 1 from "ConversationParticipant" me
      where me."conversationId" = "ConversationParticipant"."conversationId"
        and me."userId" = (auth.jwt() ->> 'sub')::bigint
    )
  );

-- Friendships: both endpoints see the row
alter table "Friendship" enable row level security;
drop policy if exists "friendship_select_member" on "Friendship";
create policy "friendship_select_member" on "Friendship"
  for select to authenticated
  using (
    "Friendship"."userId" = (auth.jwt() ->> 'sub')::bigint
    or "Friendship"."friendId" = (auth.jwt() ->> 'sub')::bigint
  );

-- Friend requests: sender and receiver see the row
alter table "FriendRequest" enable row level security;
drop policy if exists "friend_request_select_party" on "FriendRequest";
create policy "friend_request_select_party" on "FriendRequest"
  for select to authenticated
  using (
    "FriendRequest"."senderId" = (auth.jwt() ->> 'sub')::bigint
    or "FriendRequest"."receiverId" = (auth.jwt() ->> 'sub')::bigint
  );

-- AI chat sessions: owner only
alter table "ChatSession" enable row level security;
drop policy if exists "chat_session_select_owner" on "ChatSession";
create policy "chat_session_select_owner" on "ChatSession"
  for select to authenticated
  using ("ChatSession"."userId" = (auth.jwt() ->> 'sub')::bigint);

-- System messages: owner only
alter table "SystemMessage" enable row level security;
drop policy if exists "system_message_select_owner" on "SystemMessage";
create policy "system_message_select_owner" on "SystemMessage"
  for select to authenticated
  using ("SystemMessage"."userId" = (auth.jwt() ->> 'sub')::bigint);

-- ============================================================================
-- Presence does NOT need any table or RLS setup — it lives entirely in
-- Realtime's in-memory channel state (no rows written). It works as soon as
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
-- SUPABASE_JWT_SECRET are configured.
-- ============================================================================
