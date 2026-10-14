# Preregistered assessment — not sent to DeepSeek

These are diagnostic cases, not estimates of general reliability. Assess educational substance independently of formatting. Do not require an assessor's preferred task sequence, terminology, minute estimate, teaching method or solution syntax. All materially correct, proportionate alternatives are acceptable. Supplied solution keys are available resources; repeating their answers alone does not demonstrate student learning.

Two assessors score each output separately: the case author and the existing independent AI reviewer, who did not author these cases. The independent reviewer locks its judgments before seeing the author's judgments or provider performance. Record disagreements and reasoned adjudication; do not average away serious concerns. Signoff and assessment are by AI agents, not a human or a paid DeepSeek reviewer. No new external model/provider calls are part of assessment.

Give the independent assessor neutral output IDs, the identical full student facts and this rubric. Conceal arm names, order, caps, token/cost/latency counters and author scores until semantic judgments are locked. Serialization remains visible, so this is masking of labels and metrics, not complete blinding. Preserve the original complete responses. A lossless deterministic view of valid structured output may display all fields with dates from allocation, but must not add, summarize, correct or hide educational content. Inspect the original as well. Never use a model to translate either arm into the other.

## Common educational scores

Score each dimension 1–5 and cite concrete excerpts plus the relevant student fact. Use 1 = unusable or seriously wrong; 2 = substantial correction needed; 3 = useful parts but material correction needed; 4 = useful as delivered without substantive correction; 5 = particularly strong, clear and well justified. Length and prose polish alone earn no score. Score missing evidence as unknown rather than inventing a favorable interpretation.

| Dimension | A score of at least 4 requires |
| --- | --- |
| Correctness and learning value | Correct content, actions that can address the observed misconceptions, usable practice/checks and evidence of understanding rather than copying. |
| Personalization and evidence | Uses the actual demonstrated strengths and gaps, available resources, accepted goal and preferences; distinguishes supported facts from unknowns. |
| Completeness and usability | Covers the requested goal or honestly explains a necessary limitation, gives sufficient concrete next actions and observable success/stop criteria. Detail is sufficient to follow the plan, not a full textbook. |
| Prioritization | Directs effort to consequential gaps and prerequisites; gives defensible order/integration and trade-offs without inventing assessment weights. |
| Practicality and proportional workload | Work and estimates fit remaining capacity, dates and session limits; no mandatory busywork, invented resources, ritual repetitions or automatic filling of free time. |
| Adaptability and uncertainty | Provides a useful response to an unsuccessful checkpoint and stopping after success, with realistic uncertainty rather than guaranteed attainment. |

An **educationally usable** plan has every dimension >=4 and no serious defect. An **excellent** plan additionally has a mean >=4.5. Report every score and weakness; these thresholds do not excuse omitted requirements. A formatting failure cannot be silently relabelled an educational failure. A complete malformed structured reply may still receive semantic scores where its meaning is unambiguous, while its technical delivery gate fails. Blank or truncated outputs have no complete-plan score; partial content may be described but cannot pass.

## Separate delivery and scheduling assessment

- Natural arm: provider `stop`, nonblank final content, a complete student-facing plan. No JSON/schema or required headings, table, field order, exact number of steps or prose length. An ordered progression with rough timing that can fit the available dates can be complete; dates/tables are useful options, not compulsory formatting. If dates/times are supplied, they must be valid.
- Structured arm: provider `stop`, nonblank final content, first-response parsing, existing compact response validator, canonical validators, declared split expansion and existing allocation without correction or fallback. Report each stage separately. `CAPACITY_SHORTFALL`/`ALLOCATION_UNRESOLVED` stays visible; an honest infeasibility decision can be educationally sound but is not a successfully scheduled end product.
- Judge educational sequence, feasible total work, daily/session limits and any explicit scheduling claims in both arms. A structured generator is **not** required to emit calendar dates: deterministic allocation supplies those. Evaluate any allocation-induced serious mismatch separately from the AI's strategy. A prose plan receives no Apply/canonical-execution qualification.
- Optional/contingent work must be meaningfully optional or failure-triggered. Count committed, contingent and optional effort separately. Do not demand every optional branch fit simultaneously; do demand a feasible, honest response if a failure branch cannot fit before the deadline.

## Severity and case-specific anchors

A serious defect invalidates a consequential outcome or violates a real constraint: e.g. a central false explanation, an impossible compulsory workload, loss of a required deliverable, fabricated access, or a claim that copied answers establish unaided readiness. Material nonserious weaknesses still require correction and normally score below 4 on the affected dimension. Minor editorial preferences alone do not fail a plan. Every finding needs an excerpt, a supporting fact and its educational consequence. Unsupported objections must be withdrawn explicitly.

**Probability case.** Expect attention to conditioning-group denominators, summing contributing branches, reversal/base rates and the independence/disjointness misconception. Different orders and integrated exercises are acceptable. New valid changed practice can be created and identified; it need not copy the handout or use one prescribed number of problems. Correct use of the supplied key after an attempt is valid. Learner understanding needs appropriate unaided application/explanation; neither reading the key nor endless compulsory re-solves is sufficient. Secure counting/arithmetic does not justify an introductory arithmetic course. Unknown mark weights cannot be used as known percentages. No claim of guaranteed 75%, invented past papers, study on 14/18/20 October, or exceeding net availability/session ceilings. A modest mixed check or timed sample can be justified without requiring a complete 40-minute block incompatible with the 30-minute session limit. It may be split meaningfully or represented as an appropriately bounded alternative.

**SQL case.** The four actual queries and explanations are the deliverable. Eli (no loans) and Dara (returned loans only) must remain in the required all-reader outputs with the correct zero current-open counts. Correct equivalent query forms, including subqueries or conditional aggregates, are acceptable; do not mandate LEFT JOIN syntax merely because it appears in the notes. Avoid counting a NULL placeholder as a loan. Address joins/counts/filter placement/WHERE–HAVING in a way that helps the observed gaps. No full app, publication, paid tooling or extra schema requirements. No altering assignment data to manufacture a passing result. A small separate counterexample or understanding check is permitted if it serves a specific gap; it must not become an unjustified extra deliverable. Stop when the actual checked queries and sound explanations satisfy the rubric; a longer optional roadmap is not required.

## Interpretation locked before execution

| Observation | Supported conclusion and next decision |
| --- | --- |
| Excellent/usable prose, semantically poor structured answer with complete delivery | Evidence of an interface-bundle burden on this case; investigate the prompt/contract burden. This does not isolate a particular field or prove a causal general effect. |
| Good prose, good structured semantics, failed parsing/canonical validation | Expressing good education through the technical interface remains the problem on this case. Do not weaken validators to call it a pass. |
| Both arms good and structured validates/allocates | Generation capability is demonstrated on these cases with the larger diagnostic allowance. Existing production caps, review, repair and qualification remain open. |
| Both complete but educationally weak in the same way | Evidence consistent with underlying educational/configuration limitations, rather than schema alone. One sample per arm cannot prove model incapability. |
| Structured good, prose poor | Free formatting is not a universal improvement on this case; structured guidance may help. |
| Either arm blank/truncated/transport failed | Delivery/capacity is unresolved, not a complete educational quality test. Do not salvage, retry or infer semantic accuracy. |
| Cases disagree | Report heterogeneity. Do not force a single verdict or tune the prompt to whichever result failed. |

The treatment is the **whole model-facing interface** (system guidance, contract/identities and JSON mode), not formatting alone. Both arms have byte-identical full student context, matched model/effort/caps, and equivalent canonical goal/capacity facts. Structured input necessarily carries additional implementation scaffolding. There is one stochastic sample per arm/case, no parallel reference-model benchmark and no automated AI reviewer in the experiment. The independent assessors' limitations remain explicit. No next experiment, model change or production change is automatic.
