# Circle on Sylf Native

Home's fourth destination, for people. Three views chosen with `SubNav`: **People**, **Messages**, **Parties**, plus two sheets on the page header: **Notifications** and **Blocked**. Built in [Part 3](../expansion/part-3-social-sylvie-planner.md) slices C and D, verified on a real server in [Part 4](../reports/expansion-part-4/report.md). Source wins over this page.

| View | Does | Reads and writes |
| --- | --- | --- |
| People | The ring and list of friends, requests, **Find people** (search, send a request), and a sheet per friend: Message, Remove, Block. Hidden details stay hidden because the server never sends them | `friends`, `friends/requests`, `users/search`, `friends/remove`, `friends/block`, `friends/unblock` |
| Messages | Conversations with unread, one conversation at a time, send, edit and delete your own messages, earlier messages, **New group**, rename (manager) and leave. Text only | `conversations`, `conversations/[id]` (`before`, `PATCH`), `conversations/[id]/messages` (`after`), `.../[messageId]` |
| Parties | Invitations, start a party, invite a friend, leave, a **room panel** (who is focusing), and **Study together** | `focus-party`, `focus-party/[id]` (`GET` state, `DELETE` leave), `invite`, `invites/[id]`, `session`, `session/timer` |
| Blocked (sheet) | The people you blocked, newest first, with **Unblock**. Refreshes each time it opens. Unblocking does not restore the friendship | `friends/blocked` (new, own blocks only), `friends/unblock` |
| Notifications (sheet) | What the server noted, newest first. Opening does not mark anything read | `notifications` |

Files: `spaces/home/destinations/CircleDestination.tsx`, `spaces/home/circle/`, `shell/party/`. Reads live in `packages/backend/src/{social,party,party-presence,realtime}.ts`, reached as `reads.social`, `reads.parties`, and the shell's presence and Realtime objects.

## Studying together (owner decision E-13)

A party session is the **one** study session with a room attached ([ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md) decisions 11 and 12). It begins on Focus like any session: the **With** chooser picks "On my own" or the party (never sticky), or **Study together** on the Parties page sets it and goes to Focus. The session's time and credit are the study session's alone, so there is no second session and no second reward.

- The record carries `party {partyId, name, roomSessionId, joinedAt}`. `createPartyPresence` mirrors focusing and paused to the room and never blocks the session. If the room is out of reach, the Focus page and the environment say so, and the time still counts.
- The exit is journaled through TimerSync's party branch at the original instants, so a crash, a lost answer or days offline replay exactly. A session that ended before its seat was learned recovers the seat first.
- One session at a time: starting a party session while one runs (solo or in another room) asks first.
- The room shows states only ("Focusing", "Paused", "In the party"), never a second clock, and never HP (ADR 0017).
- Party invitations also show on Today when no session is running, and only point to Circle.

## Realtime

An optional nudge, off unless `EXPO_PUBLIC_SYLF_REALTIME_URL` and `EXPO_PUBLIC_SYLF_REALTIME_KEY` are set. A change event only invalidates a resource tag and the screen re-reads through REST, which applies the server's block and membership checks. It runs only signed in and in front. While "live", the 30 s polls slow to 180 s (rooms 15 s to 120 s). **Row-level security was probed:** with the grants Realtime needs, an outsider sees no message of a conversation and a participant sees it ([RLS audit](../reports/expansion-part-4/evidence/rls-audit.json)). **The grants are not in the migration history**: on a database built from it, `authenticated` holds no `SELECT` on `Message` or `ConversationParticipant`, so Realtime delivers nothing and the fallback carries on. Granting them is an owner decision (see the deployment checklist).

## Rules that hold

- **Server rules stay on the server.** Who may message whom, blocks, group management and the four-member limit are the server's, and their words are shown when it refuses.
- **Bounded fallback.** A screen that is on, in the foreground, asks at a fixed pace, and stops when it is not seen (`useDestinationSeen`). Web's background polling is not copied.
- **A message appears once the server has it.** Nothing is sent optimistically that cannot be undone.
- HP never appears for a friend or a party member (ADR 0017).

## Not built

- Companion drawing (Part 1 chose prerendered sprites; no sprite pipeline exists).
- A presence channel (presence comes from `/api/friends` and the heartbeat).
- Message attachments (the schema has none).
