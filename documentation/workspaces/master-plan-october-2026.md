# Sylf Study Workspaces — Updated Master Plan
**October 2026 | Architecture and Product Direction**

## GOAL

Build **Sylf Study Workspaces**, a unified, intelligent study environment that brings Sylf's existing features together into one seamless experience.

A student should be able to open a workspace, access their notes and resources, work on tasks, start a study session, use contextual AI, and resume their progress later.

The central interaction is:

**Start Workspace → Study → Finish Session → Continue Later**

Workspaces must be exceptionally intuitive, minimalistic, visually polished, and deeply integrated into Sylf.

This is not a replacement for the existing Notes, Planner, Calendar, or Timer systems. It is an orchestration layer connecting them.

---

## CONTEXT

### 1. Why the architecture changed

The original September 2026 roadmap envisioned Sylf primarily as a study operating layer coordinating specialist applications such as Samsung Notes, PDF readers, and other learning tools.

Since then, we have decided to develop **Sylf Notes**, a sophisticated internal note-taking application with handwriting, rich text, PDF annotation, and cloud-backed documents.

This allows substantial architectural simplification.

Rather than implementing separate scratchpads, whiteboards, PDF editors, and document libraries, these capabilities should reuse Sylf Notes' document foundation.

External applications remain supported as optional tools rather than primary dependencies.

### 2. Core architectural ownership

Keep three independent but interconnected systems.

**A. Sylf Notes — Document system**

Owns:
- Rich-text documents and handwritten notebooks.
- PDF documents and annotations.
- Scratchpads and future whiteboards.
- Document organization, editing, and version history.
- Local document persistence and recovery.
- Google Drive/OneDrive synchronization.
- Document-level bookmarks and resume positions.

Notes content belongs in the user's local storage and connected cloud account.

**B. Sylf Workspaces — Study environment**

Owns:
- Reusable study configurations.
- Subject/topic associations.
- Current learning goals and relevant tasks.
- Unified Resource Shelf.
- Preferred study tools and focus settings.
- Links to documents, resources, and sessions.
- Workspace layout/preferences and resumption context.

Workspace configuration and relationships are stored through Sylf's existing authenticated backend.

**C. Sylf Sessions — Study activity**

Owns:
- Study session lifecycle.
- Existing Timer integration.
- Focus state and elapsed/focused time.
- Session history, activity, and progression.
- Start, pause, resume, and finish commands.
- Session-specific resource and task associations.
- Durable session checkpoints.

Do not build another timer or progression engine. Reuse existing Sylf authorities.

**Fundamental rule:** Workspaces reference Notes and sessions. They never duplicate ownership of documents, timer state, or learning records.

### 3. Proposed workspace experience

A student opens a workspace, for example:

**Further Mathematics — Complex Numbers**

The workspace presents a clean, intelligently organized environment containing:

- **Current goal:** What the student is working toward.
- **Tasks:** Relevant Planner activities and upcoming work.
- **Notes:** Linked documents and handwritten notebooks.
- **Resources:** Past papers, mark schemes, PDFs, videos, useful links, and external files.
- **Study session:** Existing Timer controls and session state.
- **Sylvie:** Context-aware study assistance.
- **Focus:** Selected study environment settings.

A prominent **Start Workspace** action begins the configured study session.

While studying, students can open notes, switch resources, work on tasks, and interact with Sylvie without losing context.

When finished, Sylf preserves relevant progress and creates a useful session record.

**Continue Workspace** restores Sylf-controlled resource positions, task context, and previous working state.

The workspace is persistent; individual study sessions begin and end within it.

### 4. Workspace interface and navigation

Prioritize an exceptionally clean, premium interface.

Design principles:
- Minimal information visible by default.
- Strong visual hierarchy and extremely easy navigation.
- A small number of obvious primary actions.
- Progressive disclosure for advanced settings.
- Responsive layouts across desktop, tablet, and mobile.
- Consistency with Sylf's existing themes, custom backgrounds, and appearance system.
- No cluttered dashboards, unnecessary cards, or duplicated navigation.
- Intelligent use of available space, particularly for tablet study sessions.

Provide a dedicated Workspaces destination while keeping Notes independently accessible.

A workspace should feel like a focused working environment, not another settings dashboard.

### 5. Unified Resource Shelf

Establish one shared resource-reference system supporting:

- Sylf Notes documents and specific pages.
- Imported PDFs and other supported assets.
- External device files.
- Web links and educational videos.
- Past papers and mark schemes.
- Relevant Sylf learning resources.

Each resource should have a stable identity, type, appropriate capabilities, and optional resume state.

A resource may be referenced by multiple workspaces or sessions without duplicating its content.

The Resource Shelf is a unified catalogue and navigation interface, **not another document database**.

Provider-specific or device-specific capabilities belong behind adapters.

### 6. Consolidating note-taking functionality

The following previously planned features should reuse Sylf Notes:

**Scratchpad**

A lightweight quick-create handwritten note associated with the active study session. It uses the normal Notes repository, autosave, and recovery. Ending a session never deletes scratch work.

**Whiteboard**

A larger drawing document using the Notes handwriting engine, stroke format, rendering, and synchronization. Infinite-canvas functionality can be considered separately.

**PDF Workspace**

A PDF opened from a workspace uses the same underlying Notes PDF document, immutable source file, and editable annotations. Bookmarks and resume positions are shared.

**Samsung Notes and other external apps**

Remain available through supported native launch, share, file, and deep-link capabilities. Never depend on undocumented access to proprietary app data.

### 7. Future Android and iOS integration

Preserve the original roadmap's ambition to make Sylf function as a study operating layer.

Future native capabilities include:

- Persistent study sessions and notification controls.
- External application launching.
- Android sharing and file integration.
- Tablet multi-window workflows where supported.
- Session activity and usage tracking with permission.
- Configurable focus profiles.
- Quick Settings controls and launcher shortcuts.
- Optional floating Companion.
- Native stylus optimization and Quick Notes.
- Reliable native offline session persistence.

Reuse the current mobile client architecture and introduce native capabilities through typed, capability-aware adapters.

Do not make Workspace functionality depend on Android-only features. Web and iOS should receive appropriate supported experiences.

### 8. Contextual Sylvie integration

Sylvie should eventually understand a student's active study context, including their subject, topic, task, selected resources, and session goal.

Potential actions include explanations, hints, revision questions, resource navigation, and planning assistance.

Reuse Sylf's existing AI infrastructure, authorization, quotas, and command validation.

Never silently upload entire note libraries to AI providers. Document content access must respect explicit user selection and authorization.

---

## IMPLEMENTATION ROADMAP

### Stage 1 — Notes foundation (Phase 2, completed)

Establish stable document, page, and asset identifiers alongside platform-independent document access and recovery.

Prepare cross-feature referencing without introducing Workspace ownership into Notes documents.

### Stage 2 — Notes first usable release (Phase 3, currently underway)

Implement the standalone Notes library, rich-text editing, Google Drive integration, and reliable document synchronization.

During this phase, establish only the lightweight connections needed for future Workspaces:

- Stable document and page references.
- Optional existing-subject associations.
- A reusable document-opening interface.
- Resource capability and resume-position contracts.
- Separation between Notes content and Workspace/Session metadata.

**Do not expand Phase 3 into building the complete Workspace interface.**

Cloud provisioning gates Notes creation, not general Workspace use.

### Stage 3 — Study Workspace Foundation (separate initial implementation)

Once the first Notes experience is sufficiently reliable, implement a small but functional Workspace system.

Initial scope:

- Create, edit, and organize study workspaces.
- Associate subjects, topics, goals, and existing tasks.
- Unified Resource Shelf with linked notes and basic external resources.
- Open related notes from within a workspace.
- Start, pause, resume, and finish using existing Timer functionality.
- Preserve useful session and resource resume checkpoints.
- Build the premium, responsive Workspace interface.

This should deliver the complete basic **Start → Study → Finish → Continue** experience before pursuing advanced system integrations.

### Stage 4 — Handwriting and PDF integration

As later Notes phases introduce handwriting and PDF capabilities, expose them naturally within Study Workspaces.

- Quick handwritten scratchpads.
- Paper notebooks.
- Reusable whiteboard functionality.
- Annotated PDFs.
- Page-level resource links and position restoration.

Reuse existing Notes implementations. Do not create parallel editing engines or storage systems.

### Stage 5 — Advanced session orchestration

Extend the basic workspace into a richer study operating environment:

- Reusable study presets.
- Improved session restoration.
- Resource-specific resume state.
- Focus profile integration.
- Session activity summaries.
- Tool adapters and convenient commands.
- Deeper Planner/Calendar associations.

Existing systems should remain authoritative for their respective data.

### Stage 6 — Native system capabilities

Add native functionality progressively:

- Persistent native session services.
- Notification and quick-access controls.
- Share-to-Sylf and system file integration.
- External application interoperability.
- Usage-based study activity where permitted.
- Optional overlays and advanced focus controls.
- Improved native stylus and document handling.

Native storage or pen-input capabilities may move earlier if device qualification demonstrates that browser-based solutions cannot meet the approved reliability or handwriting requirements.

### Stage 7 — Contextual AI and refinement

Deepen Sylvie's contextual awareness and permitted actions.

Refine the complete system through usability evaluation, performance work, accessibility, device testing, and reliability verification.

The objective is a seamless study environment, not merely a larger collection of features.

---

## CONSTRAINTS

1. Maintain **one Notes document foundation**, **one unified resource-reference system**, and existing canonical Sylf session/timer authorities.
2. Workspaces must not store duplicate note bodies, PDFs, handwriting data, or attachments in Supabase.
3. Workspace deletion must never implicitly delete referenced Notes documents.
4. Session completion must preserve scratchpads, documents, and resources.
5. Subject archival or deletion must not destroy associated Notes content.
6. Preserve independent local-first document synchronization and normal Sylf backend synchronization; do not conflate their consistency or recovery rules.
7. Follow established authentication, appearance, data ownership, and mobile architectural contracts.
8. Avoid duplicate interfaces and unnecessary abstractions.
9. Preserve compatibility with future native applications.
10. Maintain strong data integrity, privacy, performance, and recovery guarantees.

## DONE

The completed product should allow students to create reusable, personalized study environments and conduct entire study sessions with minimal friction.

Sylf should reliably connect:

**Subjects + Planner + Notes + Resources + Timer + Focus + Sylvie + Study History**

Each subsystem remains independently maintainable while contributing to one coherent experience.

### Instruction for the current Phase 3 agent

Use this document as the agreed architectural direction for future Study Workspace integration.

**For Phase 3, implement only the relevant Notes-side foundations and references. Do not begin the separate Workspace implementation or expand the current phase beyond its approved scope.**

Preserve the original Notes Phase 3 acceptance and reliability requirements.

Document any architectural decisions that would materially affect the future Workspace system.

The full Workspace roadmap will be executed separately, with individual phases approved before implementation.
