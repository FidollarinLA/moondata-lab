# Changelog

## 0.6.8

- UI fingerprint row shows truncated `planCanonical` (full string in `title`) for synthetic datasets; imports state they have none.
- Browser acceptance asserts the evidence line; download hint mentions planCanonical.

## 0.6.7

- Independent expected-value tests for boolean (Park–Miller `u < p`) and date day arithmetic (incl. negative step).
- METHODS.md cross-links the closed-form references to MoonBit + Node tests.

## 0.6.6

- Compress README / RESUBMIT / submission template into a shared 3-step jury path (demo-jury → fingerprint-check → DIFF).
- Docs-only; numerical and contract behavior unchanged from v0.6.5.

## 0.6.5

- `plan_chart` / `plot_dataset` / `explore_dataset` require non-empty `datasetId` in MoonBit allowlist.
- Local planner validates `plan_chart` + `plot_dataset` before `explore` (no allowlist bypass).
- Expanded reject eval set (shell variants, empty datasetId, plan_chart without id).

## 0.6.4

- JSON data reports expose top-level `evidence.planCanonical` / `sourceSha256` beside existing analysis fields (markdown still cites the fingerprint).
- Add `scripts/fingerprint-check.mjs` (+ `npm run fingerprint`); smoke runs it after demo-jury.

## 0.6.3

- date / boolean / missing fingerprint surface covered with independent expected wire forms.
- Markdown reports cite `planCanonical` for synthetic datasets; `demo-jury` asserts the evidence line.

## 0.6.2

- Property tests: multi-kind `planCanonical` is key-order stable with an independent expected wire form.
- Same plan → same CSV SHA-256 and fingerprint; seed change diverges both (MoonBit + Node).
- Fingerprint rejects reserved characters in column names.

## 0.6.1

- Generated datasets embed MoonBit `planCanonical` in provenance (export JSON / evidence chain).
- Reject-tool evaluation set (`test/agent-reject.test.mjs`); `demo-jury.mjs` asserts allowlist denial of `run_shell`.
- Iteration cadence docs: P2 model-refusal eval marked done for the allowlist surface.

## 0.6.0

- Resubmission pivot: stop positioning as a general DataFrame/plot library vs MoonFrame.
- Add MoonBit `contract` package: canonical generation-plan fingerprint and tool allowlist.
- Workbench tool execution validated by MoonBit before Node runs; `scripts/demo-jury.mjs` for reviewers.
- Docs: DIFF_VS_MOONFRAME, RESUBMIT, rewritten README / submission template / acceptance map.

## 0.5.3

- MoonBit `@csv.quality_notes` flags mixed numeric/non-numeric columns and ≥30% missing fields.
- Profile/overview show mixed type, invalid-cell counts, and dirty-data warnings in the Chinese UI.

## 0.5.2

- Official six-criteria acceptance map, AI usage note, iteration cadence, and `scripts/smoke.mjs`.
- MoonBit summaries now expose sample standard deviation (N−1) alongside population stddev (N).
- Fixed duplicate Summary `ToJson` extend that broke `--deny-warn` CI.

## 0.5.1

- Public GitHub default branch `main`, hackathon review checklist, and README first-screen clone path for resubmission.

## 0.5.0

- Locked product positioning as a local table-exploration preview edition.
- Added XLSX import (first worksheet only), UTF-8 validation for text uploads, and workspace export/import packs.
- Converged charting onto free-plot; advanced analysis keeps overview/group/distribution only.
- Fixed multi-series skip for empty Y columns, Y-axis scaling for non-bar charts, generic demo fixtures, and clearer truncation warnings.
- Removed motor field heuristics from dataset descriptions; historical motor APIs remain for regression.

## 0.4.0

- Product review pass: public table regression, cars journey, showcase guide, source snapshots, core-only usage example.
- Readable mobile charts, clearer upload/generate entry points, high-cardinality plot recommendation fix.

## 0.3.0

- Added explicit other/custom template and free X/multiple-Y chart builder.
- Added actual numeric/date axis spacing, per-series missing-pair handling and grouped bars.
- Integrated checksum-verified local Qwen 0.6B CPU chart planning, owned process lifecycle and structured output validation.
- Added real local inference/browser acceptance alongside existing provider protocol stubs.
- Preserved axes and aggregation for style-only edits; rejected missing explicitly requested X fields.

## 0.2.0

- General-purpose synthetic data generation and uploaded-data analysis, confirmed as two product flows.
- MoonBit deterministic generator, aggregation, histogram, quantile and Pearson packages.
- CSV/JSON/JSONL, four domain templates, field editor, provenance and synthetic markers.
- Generic Chinese workbench, charts and recomputed reports; bounded model schema proposal and analysis tools.
- Independent numerical checks, cross-format round trips and 18 browser acceptance scenes.
- External model validation and GitHub push remain pending external conditions.

## 0.1.0 — 2026-10-18

- Added independent MoonBit CSV and step-response libraries with JS JSON exports.
- Added local Chinese experiment workbench, comparison curves and evidence table.
- Added built-in analysis and a bounded model tool-call loop with cancellation.
- Added Markdown, JSON, SVG and selected raw CSV exports.
- Added deterministic synthetic examples, numerical tests, HTTP and model protocol tests, browser acceptance and CI configuration.
- External provider validation, GitHub publication, persistent storage, training and live CAN are separate milestones; see acceptance status.
