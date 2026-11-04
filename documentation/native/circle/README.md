# Circle on Sylf Native

Home's fourth destination, for people. Three views chosen with `SubNav`: **People**, **Messages**, **Parties**. Built in [Part 3](../expansion/part-3-social-sylvie-planner.md) slices C and D. Source wins over this page.

| View | Does | Reads and writes |
| --- | --- | --- |
| People | The ring and list of friends, requests, **Find people** (search, send a request), and a sheet per friend: Message, Remove, Block. Hidden details stay hidden because the server never sends them | `friends`, `friends/requests`, `users/search`, `friends/remove`, `friends/block`, `friends/unblock` |
| Messages | Conversations with unread, one conversation at a time, send, edit and delete your own messages, earlier messages, **New group**, rename (creator) and leave. Text only | `conversations`, `conversations/[id]` (`before`, `PATCH`), `conversations/[id]/messages` (`after`), `.../[messageId]` |
| Parties | Invitations (join or decline), start a party, invite a friend, leave. One active party of four | `focus-party`, `focus-party/[id]`, `invite`, `invites/[id]`, `members/[memberId]` |

Files: `spaces/home/destinations/CircleDestination.tsx` and `spaces/home/circle/` (`MessagesView`, `FindPeopleSheet`, `PersonSheet`, `NewGroupSheet`, `PartiesView`, `useSeen`). Reads are in `packages/backend/src/{social,party}.ts`, reached as `reads.social` and `reads.parties`.

## Rules that hold

- **Server rules stay on the server.** Who may message whom, blocks, group management and the four-member limit are the server's, and their words are shown when it refuses.
- **No Realtime yet.** The bounded fallback is the path: a conversation or list that is on screen, in the foreground, asks every 30 seconds, and stops when it is not seen (`useDestinationSeen`). Web's 15 and 30 second background polling is not copied.
- **A message appears once the server has it.** Nothing is sent optimistically that cannot be undone.
- HP never appears for a friend or a party member (ADR 0017).

## Not built

- The Realtime client and live presence (needs the spike in ADR 0016 on a real device and server).
- A blocked-people list and unblocking from a list. `unblock` exists in `social.ts` with no screen.
- Notifications list.
- A party session (start, pause, resume, leave with replay) through the one session owner, party room in the Focus environment, and invitations in Today. Waiting on E-13.
- Backend repairs A-28 (group manager when the creator leaves) and S-15 (`areUsersBlocked` fails closed), and the `Message` Realtime publication migration. Each needs a reproduction on disposable PostgreSQL first.
