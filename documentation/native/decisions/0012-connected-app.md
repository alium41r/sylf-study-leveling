# ADR 0012 — The connected app

**Status: Proposed with Phase 13 (1 November 2026), for the owner to review.** It builds on [ADR 0008](0008-study-session-and-timer-dock.md), [ADR 0009](0009-native-authentication.md), [ADR 0010](0010-session-ownership-before-sign-in.md) and [ADR 0011](0011-shared-backend-foundation.md). The contract is the [backend guide](../backend/README.md). The evidence is the [Phase 13 report](../reports/phase-13/report.md).

**Planned change, 1 November 2026.** The [Expansion stage](../expansion/README.md) will replace decision 16 (AI Planner V2 moves into Home's Plan), decision 17's surface (the account control opens a page, and stays in Home only) and decision 18 (Sylvie gets rich text and confirmation). Decision 19 changes when backgrounds return. This record still describes what is built.

## The problem

Phase 12 left every piece ready and nothing joined. Phase 13 had to put real people in front of it: an account, one session reaching the server, and screens that stop showing invented data, without a second source of truth and without changing a build that has no backend.

## Decisions

All **Proposed**. Decision 2 settles master plan S2 for now, and it stays the owner's.

| # | Decision | Why |
| --- | --- | --- |
| 1 | **The account decides what shows, in one place.** `AccountGate` loads only when a backend exists. It draws nothing until the device has been read, the sign-in page when nobody is here, and the Spaces otherwise. With no backend, `App.tsx` renders `SpacesShell` as before. | One owner for "who is here". The sign-in page replaces the Spaces rather than covering them, so nothing behind it can be reached or read by a screen reader. |
| 2 | **"Study without an account" exists,** and is remembered on this device. First launch does not require an account. | Local-first was already decided, and a student locked out with no network must still be able to study. It keeps ADR 0010's sheet meaningful. If the owner decides first launch needs an account, this is one button and one preference to remove. |
| 3 | **`SpacesShell` is keyed by account,** so every screen's state goes when the person does. | `resources.clear` empties cached reads, and only unmounting empties what a component holds. A remount at sign-in is cheap, and it rules out a whole class of leak by construction. |
| 4 | **`createSessionBridge` is the only thing between the session and the journal.** It copies, and it computes nothing. | Handoff Phase 12 §2. One owner of time, one owner of delivery. |
| 5 | **A record says how far it has reached the journal, in `journaled`.** Saved with the session, written after the journal. | A crash between the two writes hands one operation over twice, and `SessionProtocolV2` treats a repeated PAUSE, RESUME or END as nothing. The other order could lose one. |
| 6 | **`saved` flips in `settleAccepted`, and nowhere else.** It records `serverId` and `acceptedFocusSeconds`. | The brief. It also gives the screens both numbers, so a session credited less than it tracked can say so. |
| 7 | **When an owner's sign-in ends, their running session pauses at that moment.** It stays theirs. If they return, they can resume. If someone else signs in, it ends at the moment it paused, and waits for its owner in the journal's terms. | Nobody is verifiably studying once the session is gone, so time after that must not be claimable. The next person must not inherit a clock. |
| 8 | **Signing out with a session going asks first,** ends it, gives the journal up to 3 seconds, then signs out. | A session belongs to its owner. Most of the time it arrives before they leave, and when it does not, it waits on the device. |
| 9 | **What the next session is about is one choice,** `plan`, held by the session model beside the length, seen from all three surfaces. A task is used up by starting. The subject carries over. | The same reasoning as the length. It is personal, so it goes when the account changes. |
| 10 | **Accepted state wins only when nothing from this device is on its way, and only when the two really disagree.** A running session is left alone unless the server is more than 5 seconds ahead. | `reconcileSessionSnapshot` restarts the running stretch, so applying it on every answer would churn state for nothing. |
| 11 | **A session of no time still gets its END,** when it has an owner. The model keeps it, and the screens skip it. | The server may already hold it open, and only an END closes that. The client hides the row, and the server keeps it. |
| 12 | **Every read a screen uses has a name in `reads.ts`.** View mappers live beside each Space's contracts, import only types from `@sylf/backend`, and are pure. | ADR 0011 decision 14 survives untouched: screens hold no path and no schema, and the package stays behind `import()`. |
| 13 | **One resource per destination.** A destination composes its reads into one view, with one state and one retry. | A screen wants one answer. Partial pages would need a state per section, for a failure that is rare and recovers. |
| 14 | **Real data binds only for someone signed in. Sample binds only in a development build with no backend at all.** Signed out with a backend is the empty adapter. | So invented content can never sit beside a real account. |
| 15 | **Notes, PDFs, Whiteboard and Resources say what is true,** through `limited` on their result, in place of an empty state that implies something is missing. | Phase 14 owns them, and the server has no list of them by design. |
| 16 | **AI Planner V2 is not imitated.** The Planner tool lists what was applied, as quests, and says where plans are built. The end-to-end flow was not verified, so this is the honest state the brief asks for. | `ApplyService` and the four-stage lifecycle stay on the web, untouched. |
| 17 | **The account control lives in Home,** at the foot of the rail, or the end of the bar in a compact window. Workspace and World have none. | There is no settings surface. Home is where someone goes to leave. A control beside the dock would fight it in a compact window. |
| 18 | **Sylvie's text is drawn plain,** with Markdown marks removed. Her proposals are not confirmed here. | A real renderer is its own piece of work. A change she proposes is confirmed on the web. |
| 19 | **Desks are gone from a signed-in Focus.** | They changed nothing, and a real person would reasonably expect them to. |

## Small server additions

All additive. None touches a ledger, an RPC, RLS or a migration.

| Addition | Why |
| --- | --- |
| `GET /api/user/earned-this-week` | G-5. Sums positive `XpLedger` and `SylphLedger` rows since the student's own Monday. Spending is not subtracted, because it says what was earned |
| `visible` on `/api/friends` | Hidden hours read as 0 and hidden online as false, so a client could not tell hidden from none. The existing fields are unchanged |
| `code: "password_incorrect"` on the 401 from `user/security` | Lets the client refuse to replay a wrong password. The other password routes answer 400, so nothing else needed it |
| `MAX_SESSION_FOCUS_SECONDS` moved to `lib/timer-engine.ts` | One definition for the server's clamp and the client's words. `sessions.ts` imports and re-exports it, and the value is unchanged |

## Narrowing ADR 0010

Decision 5 said a session that ended before `createdAt` is not offered. **As built, a session that started before `createdAt` is not offered either,** even if it ended after. The server clamps the start to the account's creation, so the sheet could not honestly say how much would be credited.

## Rejected

| Option | Why not |
| --- | --- |
| A sign-in overlay above the mounted Spaces | The screens would mount and read with nobody signed in, and a second person would inherit their state |
| A separate cursor store for `journaled` | A second place that describes a session. The model already writes at once |
| Ending a running session automatically at sign-out | It cannot be undone, so the person chooses |
| Polling `user/stats` to notice a session on another device | Finding P-8. It is read when Focus is shown, and on return to the foreground |
| Marking `saved` optimistically on sign-out | A record must never say something the server has not said |

## Consequences

- **A session running on another device** is shown as a note in Focus, and is not adopted into the dock (`SessionProtocolV2.restore` remains deferred). If the subject matches, the server folds this start into that session. If it differs, the server refuses, and the note beside the session says why.
- **Reconciliation happens on wake and on the journal's 30-second gate,** so a pause on another device does not reach a device that is sitting idle in front of someone. That follows from not polling.
- **Offline with no prior reads,** a page has nothing to show, because cached reads stay in memory (ADR 0011 decision 9). It says so and offers to try again.
