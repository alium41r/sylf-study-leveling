# Recovery baseline, 1 November 2026

**Made before Part 1 began. Nothing in the repository was committed, stashed, changed or deleted to make it.** It is outside the repository, at `~/Desktop/sylf-recovery/2026-11-01-expansion-part-1/`, and its own `RESTORE.md` has the steps.

| Fact | Value |
| --- | --- |
| Base commit | `f5a900b2f6e6d92dce4e81abac1010e089169cf9`, on `main` |
| Tracked files modified | 217 |
| Untracked files | 4,721, in 194 status entries |
| Size | 1.5 GB |

| Holds | Why |
| --- | --- |
| A git bundle of every ref | History, with no remote needed |
| A binary patch of the tracked changes | A second, independent route to them |
| A tar of all 4,938 uncommitted files | The work itself |
| A sha256 for each file, and `SHA256SUMS` for the archives | Proof |
| A tar of ignored work that cannot be regenerated | `backups/`, `public/uploads/`, `.dsh-presets/`, ignored evidence, `scratch/` without `native-phase-2` |

**How it was proved.** In a scratch folder: the bundle verified, it cloned to `f5a900b`, the patch applied, and the tar extracted over it. **All 4,938 files matched their sha256, and `git status` on the restored copy was identical to the live one.** The live repository's status was unchanged afterwards, with no stash.

**Not included.** `.env`, `.env.local` and `tools/ai-agent/.env` hold credentials, so they are listed by name, size and date only. Regenerable output, and `scratch/native-phase-2` (3.8 GB of Phase 2 experiments), are also left out.

**Limits.**

- It is on the same disk as the repository, so it does not survive a failed disk. Copy it to an external drive.
- It captures the tree before Part 1. This part's documents came afterwards, and exist only in the working tree.
- The ignored archive may hold private data, so treat copies as sensitive.
- It does not replace the commit on the [entry gate](../../expansion/README.md#3-entry-gate). A commit is still needed before Part 2 changes application code.
