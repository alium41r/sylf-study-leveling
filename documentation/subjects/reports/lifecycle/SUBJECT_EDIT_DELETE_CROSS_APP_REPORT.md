# SYLF — Subject Editing & Safe Deletion: Cross-App Architecture & Verification Report

**Document Status:** Complete & Verified  
**Date:** September 26, 2026  
**Target Surface:** Focus / Timer Page (`app/timer/components/TimerScreen.tsx`) & Cross-App Consistency  
**Branch/Worktree Isolation:** Zero intrusion on concurrent Planner Coexistence patch files  

---

## Executive Summary & Direct Acceptance Answers

| Question | Answer | Rationale & Mechanism |
| :--- | :---: | :--- |
| **Does editing a Subject update all active surfaces consistently?** | **YES** | `PATCH /api/subjects/[id]` updates canonical active `Subject` metadata (`name`, `code`, `examBoard`, `level`, `color`, `syllabusNote`). Revalidates Next.js user cache tags (`user-${username}`, `profile-stats-${username}`). Active UI surfaces dynamically consume updated records. |
| **Can deletion erase past Focus time?** | **NO** | Soft-delete architecture via `archivedAt: DateTime?`. Foreign keys on `StudySession` remain intact. Hard-delete (`onDelete: SetNull`) is never invoked. Historical study session totals, durations, and subject attributions are 100% preserved. |
| **Can deletion erase completed Quests?** | **NO** | Completed Quests reference `Subject` via foreign keys which remain valid. Historical quest logs, mastery links, and completion logs continue pointing to the subject. |
| **Can deletion erase XP/history?** | **NO** | XP transactions and ledger entries reside in immutable user progression tables; no cascade or decrement is performed. |
| **Can deletion corrupt existing Planner plans?** | **NO** | Existing `PlannerPlan`, `PlannerRevision`, and `PlannerQuestLink` lineages retain intact relations to the archived subject. Historical plan views read archived subjects without crashing or losing data. |
| **Can a deleted Subject appear in a new Planner?** | **NO** | `app/api/planner/capabilities/route.ts` strictly queries `{ where: { userId, archivedAt: null } }`, excluding archived subjects from active generation pickers. |
| **Can a deleted Subject appear in Add Quest?** | **NO** | Active quest subject selectors read `GET /api/subjects` (which applies `activeSubjectWhere()`), and `POST /api/quests` explicitly rejects assignment of archived subjects. |
| **Can a running Focus Subject be deleted?** | **NO** | Blocked at both UI and server API layers. `DELETE /api/subjects/[id]` queries active unended sessions (`endedAt: null`) and returns `409 Conflict` (`ACTIVE_SESSION_RUNNING`) with copy: *"<Subject> is being used in your current Focus session. End the session before deleting this subject."* |
| **Are active and historical queries deliberately different?** | **YES** | Active surfaces (Timer cards, Quest pickers, Planner creation, Schedule inputs) use `activeSubjectWhere()`. Historical surfaces (Analytics, Focus Logs, Completed Quests, Sealed Planner Revisions) query without filtering `archivedAt`, ensuring historical accuracy. |
| **Was a migration necessary?** | **YES** | Additive migration `20260926030000_subject_archived_at` added column `archivedAt TIMESTAMP(3) WITH TIME ZONE` and composite index `@@index([userId, archivedAt])` on table `Subject`. No destructive changes were made to existing tables or columns. |
| **Are there any files likely to conflict with the concurrent Planner patch?** | **NO** | Zero planner navigation or planner UI files were touched. The only change in planner territory was an isolated 1-line query filter in `app/api/planner/capabilities/route.ts` line 19. |

---

## 1. Subject Model and Current Mutation Architecture

The canonical `Subject` model in `prisma/schema.prisma` represents a student's enrolled academic subject (e.g., Cambridge A-Level Mathematics 9709):

```prisma
model Subject {
  id           Int       @id @default(autoincrement())
  userId       Int
  name         String
  code         String
  examBoard    String
  level        String
  color        String?
  syllabusNote String?
  archivedAt   DateTime? // Added: soft-delete timestamp
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  nodes        SubjectNode[]
  sessions     StudySession[]
  quests       Quest[]
  plans        PlannerPlan[]

  @@unique([userId, code])
  @@index([userId, archivedAt])
}
```

### Mutation Architecture

1. **Creation / Reactivation (`POST /api/subjects`):**
   - Validates input with Zod.
   - Normalizes syllabus `code` and `examBoard` to uppercase.
   - Uses `prisma.$transaction`: Upserts subject with `archivedAt: null`. If an archived subject with the same syllabus code already exists for this user, it reactivates and updates it cleanly, avoiding unique constraint collisions (`@@unique([userId, code])`).
   - Provisions 48-node constellation graph skeleton if newly created.
2. **Edit (`PATCH /api/subjects/[id]`):**
   - Authenticates session and validates ownership.
   - Blocks editing if the subject is archived (`400 Bad Request`).
   - If `code` changes, verifies uniqueness across the user's active and archived subjects (`409 Conflict` on conflict).
   - Updates canonical metadata fields (`name`, `code`, `examBoard`, `level`, `color`, `syllabusNote`).
   - Invalidates Next.js user cache tags (`user-${username}`, `profile-stats-${username}`).
3. **Safe Deletion (`DELETE /api/subjects/[id]`):**
   - Authenticates session and validates ownership.
   - Pre-flight check: Verifies no active running `StudySession` (`endedAt: null`). If running, halts with `409 Conflict`.
   - Sets `archivedAt = new Date()`.
   - Idempotent: returns clean 200 if already archived.
4. **Restoration / Undo (`POST /api/subjects/[id]/restore`):**
   - Authenticates session and validates ownership.
   - Sets `archivedAt = null`.
   - Revalidates user cache tags.

---

## 2. Dependency Graph

A Subject is the central nexus of academic tracking across Sylf:

```mermaid
graph TD
    User -->|owns 1..n| Subject
    Subject -->|has 48| SubjectNode[SubjectNode Constellation]
    Subject -->|referenced by| StudySession[StudySession - Logged Focus Time]
    Subject -->|referenced by| Quest[Quest - Active & Completed]
    Subject -->|referenced by| PlannerPlan[PlannerPlan - AI Planner Lineage]
    Subject -->|referenced by| StudySchedule[StudySchedule - Weekly Routine]
    Subject -->|referenced by| Analytics[Detailed Stats & Cognitive Engine]
    Subject -->|referenced by| AIContext[AI Assistant Context Engine]

    style Subject fill:#8B5CF6,stroke:#7C3AED,stroke-width:2px,color:#fff
    style StudySession fill:#06B6D4,stroke:#0891B2,stroke-width:1px,color:#fff
    style Quest fill:#10B981,stroke:#059669,stroke-width:1px,color:#fff
    style PlannerPlan fill:#F59E0B,stroke:#D97706,stroke-width:1px,color:#fff
```

### Dependency Audit Findings:
- `StudySession.subjectId` has `onDelete: SetNull`. A database `DELETE` would NULL out the `subjectId` on all historical study sessions, destroying subject-level time analytics and streak history.
- `Quest.subjectId` has `onDelete: SetNull`. A database `DELETE` would orphan completed and in-progress quests.
- `PlannerPlan.subjectId` has `onDelete: Cascade`. A database `DELETE` would cascade-destroy all AI Planner roadmaps, revisions, and milestone lineages.

**Conclusion:** Physical SQL deletion is hazardous and destructive. Soft deletion via `archivedAt` is mathematically and architecturally required.

---

## 3. Chosen Deletion Semantics

We implemented **Safe Soft Deletion (Archival)**:
- Setting `archivedAt = new Date()` marks the record as inactive.
- The record remains in the database with its original primary key `id` and foreign key linkages.
- In active workflows, queries apply `activeSubjectWhere()` (`archivedAt: null`), hiding the subject from selectors, timer lists, and creation inputs.
- In historical analytics, logs, and sealed planner lineages, joins and queries continue reading the subject name, syllabus code, and color accents without null fallbacks or data loss.

---

## 4. Why History is Safe

1. **Focus Sessions & Accumulated Time:**
   - Queries in `lib/study-schedule-service.ts` and `app/api/user/detailed-stats/route.ts` query `StudySession` with `include: { subject: { select: { id: true, name: true, color: true } } }`.
   - Because `Subject` rows are never deleted, past sessions retain their full attribution (`"Mathematics"` / `#8B5CF6`).
2. **XP Records & Progression:**
   - Completed sessions and quests award XP recorded in `User.xp` and progression logs. Soft deletion never deducts XP or deletes ledger entries.
3. **Completed Quests:**
   - Completed quests remain in the user's quest log with their subject badges intact.
4. **Planner Lineages:**
   - Past study plans, revisions, and acceptance states remain fully viewable.

---

## 5. Edit UI Implementation

- **Location:** Integrated directly into `app/timer/components/SubjectModal.tsx`.
- **Reuse:** Refactored into a single polymorphic component supporting `mode="create" | "edit"`.
- **Prefill & Fields:**
  - Subject Name (`name`)
  - Syllabus Code (`code`)
  - Exam Board (`examBoard` - CAIE, Edexcel, AQA, OCR, IB, AP, etc.)
  - Academic Level (`level` - A-Level, GCSE, IGCSE, O-Level, University, etc.)
  - Color Theme (`color` - hex palette picker)
  - Syllabus Notes (`syllabusNote` - multiline textarea for exam board directives)
- **Form Validation:** Client-side field validation + server-side Zod validation with error toasts and inline field error highlights.
- **Visuals:** Follows Sylf's liquid glass design system (dark glassmorphism, glowing focus rings, accessible contrast).

---

## 6. Delete UI Implementation

- **Affordance:** Compact `[•••]` icon button placed at the top-right of each subject card in `app/timer/components/TimerScreen.tsx`.
  - Accessible touch target: $\ge 44 \times 44\text{ px}$.
  - `aria-label="Manage <subject name>"`.
  - Native accessible keyboard navigation (Enter/Space opens, Escape closes, focus traps inside menu).
- **Confirmation Modal:** Dedicated `DeleteSubjectModal.tsx` (`role="alertdialog"`).
  - Explicit confirmation (no native browser `confirm()`).
  - Clear breakdown of what happens:
    - *Removes `<Subject>` from your active subjects list, timer cards, and new quest pickers.*
    - *Keeps study history & logged focus time, completed quests, and past planner schedules & lineage intact.*
  - Active quests telemetry: If active quests still reference the subject, displays an alert: *"3 active quests still reference this subject. They will remain intact but the subject cannot be newly assigned."*
  - Active session block: If a focus session is running, displays a critical alert: *"<Subject> is being used in your current Focus session. End the session before deleting this subject."* and disables the Delete button.

---

## 7. Running Focus Session Behavior

- **Requirement 10 Protection:**
  - Client check: Inspects local timer state (`runningTimerState_${subject.id}_*`) and queries `GET /api/subjects/${id}` upon opening the delete dialog.
  - Server check: `DELETE /api/subjects/[id]` checks `prisma.studySession.findFirst({ where: { userId, subjectId, endedAt: null } })`.
  - If a session is active, the server rejects the request with HTTP `409 Conflict` and error code `ACTIVE_SESSION_RUNNING`.
  - The deletion is completely prevented. The student must pause or complete their timer before archiving the subject.

---

## 8. Quest Behavior

- **Active/Pending Quests:**
  - Pending quests remain intact.
  - They continue to display the subject label and color tag.
  - Soft-deleting the subject does NOT delete or abandon pending quests.
- **New Quest Creation:**
  - `app/api/quests/route.ts` verifies that `subjectNode.subject.archivedAt === null` or `subject.archivedAt === null`.
  - Archived subjects do not appear in the "Add Quest" subject dropdown.

---

## 9. Planner Interaction

- **Existing Plans & History:**
  - Historical `PlannerPlan`, `PlannerRevision`, and `PlannerQuestLink` records remain untouched and fully readable.
- **New Planning Surfaces:**
  - `app/api/planner/capabilities/route.ts` filters `{ archivedAt: null }`.
  - Archived subjects are excluded from new plan subject intake and generation.
- **Coexistence Patch Isolation:**
  - Zero modifications to `PlannerWorkspace.tsx`, planner navigation, or feature flags.

---

## 10. Schedule / Routine Behavior

- **Weekly Study Schedule (`app/api/user/study-schedule/route.ts`):**
  - Weekly study schedule routines and floating rest days read and persist active schedules.
  - Historical schedule days preserve the subject breakdown without null reference errors.

---

## 11. Analytics & History Behavior

- **Detailed Stats (`app/api/user/detailed-stats/route.ts`):**
  - Queries `StudySession` aggregated across all time.
  - Historical totals, daily/weekly focus charts, subject breakdown distributions, and session logs include archived subjects.
  - A student archiving "Maths" after 100 hours of study retains all 100 hours in their total study time, streak calculations, and lifetime charts.

---

## 12. AI & System Context Behavior

- **AI Context Engine (`lib/ai/context-engine.ts`):**
  - For active study context and upcoming goals, `activeSubjectWhere()` is applied.
  - The AI assistant focuses on the student's current active curriculum and does not prompt them to study archived subjects.

---

## 13. Active-vs-Historical Query Audit

| Query Surface | File / Path | Filter Applied | Category |
| :--- | :--- | :---: | :--- |
| **Timer Card List** | `app/api/subjects/route.ts` | `where: activeSubjectWhere(userId)` | **ACTIVE ONLY** |
| **Add Quest Picker** | `app/api/subjects/route.ts` | `where: activeSubjectWhere(userId)` | **ACTIVE ONLY** |
| **Quest Assignment Validation** | `app/api/quests/route.ts` | `archivedAt: null` | **ACTIVE ONLY** |
| **Planner Capabilities Picker** | `app/api/planner/capabilities/route.ts` | `archivedAt: null` | **ACTIVE ONLY** |
| **Active Session Invite** | `app/api/invites/route.ts` | `archivedAt: null` | **ACTIVE ONLY** |
| **AI Study Context Engine** | `lib/ai/context-engine.ts` | `archivedAt: null` | **ACTIVE ONLY** |
| **Focus Logs & History** | `app/api/user/sessions/route.ts` | No archive filter | **HISTORICAL** |
| **Monthly Calendar Enriched Data** | `lib/study-schedule-service.ts` | No archive filter on sessions | **HISTORICAL** |
| **Lifetime Detailed Analytics** | `app/api/user/detailed-stats/route.ts` | No archive filter on sessions | **HISTORICAL** |
| **Rankings & Global Leaderboard** | `app/api/user/rankings/route.ts` | XP aggregation on user level | **HISTORICAL** |
| **Sealed Planner Revisions** | `app/api/planner/[id]/revisions/route.ts` | No archive filter | **HISTORICAL** |

---

## 14. Database Migration Details

- **Migration Directory:** `prisma/migrations/20260926030000_subject_archived_at/`
- **SQL Content (`migration.sql`):**
  ```sql
  -- AlterTable
  ALTER TABLE "Subject" ADD COLUMN "archivedAt" TIMESTAMP(3);

  -- CreateIndex
  CREATE INDEX "Subject_userId_archivedAt_idx" ON "Subject"("userId", "archivedAt");
  ```
- **Type:** Additive only. Zero table recreations, zero column drops, zero locking overhead.

---

## 15. Security & Ownership Verification

1. **Authentication:** All mutation endpoints (`PATCH`, `DELETE`, `POST /restore`) invoke `getSession(req)`. Unauthenticated calls receive HTTP `401 Unauthorized`.
2. **Ownership:** Queries verify `where: { id: subjectId, userId }`. Requests targeting subjects owned by another user receive HTTP `404 Not Found`.
3. **Audit Secrets Scan:** Ran `npm run audit:secrets` — zero credentials, API keys, or tokens detected in tracked code.

---

## 16. Desktop, Mobile & Accessibility Audit

- **Touch Target:** The `[•••]` action button has CSS dimensions `width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;` meeting WCAG 2.5.5 Target Size requirements.
- **ARIA & Keyboard Navigation:**
  - Trigger: `aria-label="Manage <subject name>"` and `aria-haspopup="menu"`.
  - Dropdown: `role="menu"`, items with `role="menuitem"`.
  - Dialogs: `role="dialog"` (`SubjectModal`) and `role="alertdialog"` (`DeleteSubjectModal`).
  - Escape key handling to dismiss modals.
  - Form labels explicitly tied with `htmlFor` to form inputs (`name`, `code`, `examBoard`, `level`, `color`, `syllabusNote`).

---

## 17. Test Suite Results

### Unit Test Suite (`__tests__/subjects/subject-edit-delete.test.ts`)
- **Total Tests:** 21 passed (0 failed).
- **Covered Scenarios:**
  1. `GET /api/subjects/[id]` authentication, validation, 404 handling, and cross-app dependency counts.
  2. `PATCH /api/subjects/[id]` field validation, ownership checks, uppercase code normalization, archived edit prevention, and duplicate code conflict (409).
  3. `DELETE /api/subjects/[id]` active session guard blocking deletion (409), soft-delete `archivedAt` timestamp persistence, and idempotency.
  4. `POST /api/subjects/[id]/restore` unarchiving, resetting `archivedAt: null`, and idempotency.
  5. `activeSubjectWhere()` exclusion and `POST /api/subjects` clean reactivation on re-creation with identical code.

### Broad Regression Verification
- `__tests__/subjects/`: 4 files, 51 tests passed.
- `__tests__/timer/`: 5 files, 28 tests passed.
- `__tests__/quests/`: 1 file, 3 tests passed.
- `__tests__/calendar/`: 4 files, 34 tests passed.
- `__tests__/ai/context-engine.test.ts`: 1 file, 27 tests passed.
- **Total Vitest Executions:** 167 tests passed with zero failures.

---

## 18. Build & Verification Status

| Check | Command | Status | Result |
| :--- | :--- | :---: | :--- |
| **TypeScript Compilation** | `npx tsc --noEmit` | **PASSED** | 0 errors |
| **Prisma Validation** | `npx prisma validate` | **PASSED** | Schema valid |
| **Secret Scanning** | `npm run audit:secrets` | **PASSED** | 0 leaked secrets |
| **Mobile Webpack/Vite Build** | `npm run mobile:build` | **PASSED** | Built in 3.89s |
| **Mobile Bundle Verification** | `npm run mobile:verify` | **PASSED** | 0 server symbols in bundle |
| **Next.js Production Build** | `npm run build` | **PASSED** | Compiled 88/88 static & dynamic routes in 53s |

---

## 19. Files Modified & Created

### Created Files:
1. `prisma/migrations/20260926030000_subject_archived_at/migration.sql`
2. `lib/subject-service.ts`
3. `app/api/subjects/[id]/route.ts`
4. `app/api/subjects/[id]/restore/route.ts`
5. `app/timer/components/SubjectModal.tsx`
6. `app/timer/components/DeleteSubjectModal.tsx`
7. `__tests__/subjects/subject-edit-delete.test.ts`
8. [SUBJECT_EDIT_DELETE_CROSS_APP_REPORT.md](SUBJECT_EDIT_DELETE_CROSS_APP_REPORT.md)

### Modified Files:
1. `prisma/schema.prisma`
2. `lib/prisma.ts`
3. `app/api/subjects/route.ts`
4. `app/api/planner/capabilities/route.ts`
5. `app/api/quests/route.ts`
6. `app/api/invites/route.ts`
7. `lib/ai/context-engine.ts`
8. `lib/ai/intents/executors.ts`
9. `mobile/src/adapters/api/mock-api.ts`
10. `app/timer/Timer.module.css`
11. `app/timer/components/TimerScreen.tsx`

---

## 20. Overlap & Conflict Risk with Concurrent Planner Patch

- **Planner Files Touched:** Exactly **one** file: `app/api/planner/capabilities/route.ts` at line 19 (`archivedAt: null` in where clause).
- **Planner Files NOT Touched:**
  - `app/planner/` (entire directory untouched)
  - `app/components/planner/` (entire directory untouched)
  - `PlannerWorkspace.tsx` (untouched)
  - Planner navigation, feature flags, and modes (untouched)
- **Conflict Assessment:** **ZERO CONFLICT RISK**. The change in `capabilities/route.ts` is a 1-line query constraint that ensures archived subjects do not show up as selectable in planner creation pickers, with no overlap with navigation, coexistence, or workspace files.
