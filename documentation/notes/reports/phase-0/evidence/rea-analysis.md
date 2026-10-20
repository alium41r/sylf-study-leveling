# REA static analysis evidence

Date: 19 October 2026 (Asia/Karachi).

The user explicitly approved temporary download and static analysis of the official REA CLI, the public MIT-licensed Excalidraw package, and a copy of Sylf's existing browser bundle. This authorization did not include agent registration/configuration changes, commercial decompiler installation, proprietary application inspection, or application implementation.

## Tool and target provenance

- Tool: official npm rea-agents **6.7.0**, repository https://github.com/morluto/rea.
- Tool install: /private/tmp/sylf-notes-rea-phase0/tool, using a task-local npm cache and disabled lifecycle scripts; no package files in Sylf were changed.
- Runtime: existing Node **26.7.0**.
- Public target: official npm @excalidraw/excalidraw **0.18.1**, downloaded as an inert archive and extracted under the task temporary directory.
- Sylf target: a copied snapshot of .next/static/chunks, 76 JavaScript files. Existing build output can predate current working-copy edits. It is not evidence of deployed behavior or a newly verified build.
- Registry-reported package integrity values, archive/input hashes, exact selected files, REA parameters, evidence identifiers, result hashes and retained boundary observations are in [rea-summary.json](rea-summary.json).
- The public workspace screenshot is separate interface evidence: [Excalidraw at 1280 × 720](excalidraw-public-workspace.png).

Only REA and its process helper executed. The target JavaScript was parsed as inert text, not launched or imported as an application. No cloud accounts or private documents were accessed.

## Reproducible invocation

The installed REA command's own help was inspected first. The common invocation was:

~~~sh
REA_DARWIN_MODULE_CACHE_PATH=/private/tmp/sylf-notes-rea-phase0/swift-module-cache \
node /private/tmp/sylf-notes-rea-phase0/tool/node_modules/rea-agents/scripts/rea.mjs \
analyze-javascript-application TARGET \
--source-path SELECTED_FILE \
--max-heap-mb 1024 --analysis-timeout-ms 60000 \
--max-semantic-nodes 30000 --max-semantic-unknowns 3000 \
--max-semantic-unknowns-per-file 1000 --format json
~~~

Excalidraw selected files:

- dist/prod/index.js
- dist/prod/chunk-EIO257PC.js
- dist/prod/data/image-GAAHSSAO.js

Its per-file semantic-node limit was 15,000. Sylf selected four chunks containing relevant storage/recognition/pointer markers; its per-file semantic-node limit was 10,000:

- 09sncknzf8c9w.js
- 1bmk_dxwdw0d9.js
- 1wpi-_59dw0su.js
- 26p7d39aas105.js

The complete exact parameters are recorded in the JSON evidence, rather than implied by this abbreviated example.

## Completed results

| Measure | Excalidraw package | Copied Sylf browser chunks |
| --- | --- | --- |
| Process result | Exit 0; evidence envelope produced | Exit 0; evidence envelope produced with one skipped source |
| REA authority/confidence | shipped-artifact / derived | shipped-artifact / derived |
| Relevant files inventoried | 558 | 76 |
| Selected source files | 3 | 4 |
| JavaScript files parsed | 3 | 3 |
| JavaScript files skipped | 0 | 1 |
| Text bytes read | 2,327,232 | 578,342 |
| Visited AST nodes | 145,373 | 99,611 |
| Parse failures | 0 | 0 |
| Application graph nodes/edges | 1,227 / 2,843 | 167 / 182 |
| Retained semantic nodes/relations | 25,789 / 24,719 | 24,981 / 21,124 |
| Semantic unknown records | 3,000, at configured retention limit | 3,000, at configured retention limit |

These counts describe analysis output, not benchmark speed, application complexity, code quality, or feature correctness.

### Excalidraw findings

REA recovered static localStorage read/write/removal observations, a Cache Storage handoff named web-share-target, import relationships including external React, and partially resolved network-call candidates. Named semantic function candidates included pointer move/up/key handlers, gesture setup and image-shape-cache clearing.

This makes REA useful for mapping interaction and storage boundaries in a shipped bundle. It does **not** establish that these localStorage accesses store complete drawings, that a network call is reachable, or that the npm editor includes all hosted application services. One endpoint candidate came from a generic delete call: it is a heuristic candidate, not proof of network I/O.

A location example from REA: localStorage.setItem in dist/prod/index.js, line 4, columns 51,586–51,634 (REA's source-coordinate convention). Use the file hashes in the JSON to identify the exact artifact before interpreting those positions.

### Sylf findings

REA recorded static candidates/references for:

- localStorage key enumeration, reads, writes and cleanup;
- the /api/calendar/personal endpoint;
- the logout fetch resolved through the existing API transport;
- a module Worker referencing /calendar-recognition/worker.js;
- registration of /sw.js with root scope.

Current source inspection independently confirms the calendar recovery, recognition and shared-session cleanup owners discussed in the report. Since the analyzed chunks are existing build artifacts, source inspection remains authoritative for the working-copy integration plan.

### Coverage and failed attempts

Both final graphs explicitly report **partial coverage**. Unselected files remain unknown. Dynamic/obfuscated values and external imports are not resolved into complete runtime behavior. Both semantic graphs reached unknown-retention limits, and omission accounting is retained in compact form.

Sylf's 1wpi-_59dw0su.js exceeded REA's approximately 1 GiB worker heap limit and was skipped. Exit 0 does not mean all selected sources were analyzed. No claim in the report depends on complete reconstruction of this source.

Initial sandboxed attempts failed when Swift's process-ownership helper tried to write a compiler module cache outside permitted temporary paths. The compiler cache was redirected using REA's own supported temporary-path option. A subsequent sandbox attempt could not confirm process cleanup because OS process inspection was restricted. An authorized process check found the specific worker had exited and its scratch directory was empty; the final runs completed with the required OS process-inspection access. These were tooling/environment failures, not target-app findings.

## Retained artifacts

- [rea-summary.json](rea-summary.json): compact derived evidence with provenance, selected-file hashes, run statistics, limitations and source-located boundary observations.
- Full raw REA envelopes remain in the temporary research directory, with paths/hashes recorded in the summary. They total about 87 MB and were not copied into the repository to avoid unnecessary artifact bloat. Temporary files are not a durable archive.
- Initial failure envelopes are also retained only in that temporary directory.
- No agent configuration or Sylf application dependencies were changed.

## Architectural implication

Use REA as an evidence-producing investigation tool alongside source inspection and authorized runtime testing. It is especially helpful when the available artifact is bundled JavaScript or an Electron application. It does not replace real pen latency tests, cloud synchronization failure tests, license review, or verification of a proprietary application's internal format.
