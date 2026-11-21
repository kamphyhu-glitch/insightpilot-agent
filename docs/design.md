# InsightPilot — first working slice

Approved direction: a product/operations data-analysis Agent built from E2B Fragments. This checkout is separate from FlowPilot.

## Scope

CSV → inspect data → ask a question → plan → approve → execute → verify → download report.

The first version supports count, sum and mean, optionally grouped by one CSV column, plus data quality inspection. It does not claim general autonomous data science. CSVs are capped at 1 MiB, 10,000 rows and 40 columns. Quoted fields, embedded newlines, BOM and CRLF are supported; malformed data is rejected with an explanation.

## Execution

- Demo: rules choose a validated analysis specification; the Node server computes actual values. This is explicitly labelled local calculation, not sandbox execution.
- Live: DeepSeek returns a schema-validated specification using column profiles and up to five sample rows. A fixed compiler produces inspectable Python; E2B executes it against the approved CSV with internet access disabled. No arbitrary model-generated source is accepted by the execution endpoint.
- Verification independently recomputes expected values in TypeScript and compares row counts, missing cells, duplicates, group labels, counts and metric values with the returned result. A failed comparison blocks the success state.
- The UI explains where data goes. API keys remain in sessionStorage, are forwarded in request headers and never enter model prompts or the sandbox filesystem.

## Approval boundary

Planning never creates a sandbox. The server signs the plan, runtime mode and dataset digest in a short-lived approval token. Execution accepts this token and matching CSV, not edited client code. Each token is consumed once per Node process; retries require a new plan. The process-local signing secret and consumed-token store are a development boundary, not distributed multi-user persistence. Production would require a configured signing secret and shared idempotency store.

A pending aggregation can be edited through `POST /api/analysis/revise`. The request carries the current dataset and approval token alongside the grouping, numeric metric and aggregation fields. The server validates the fields and signs a replacement. Successful replacement closes the previous token in the same process. A rejected field edit leaves the previous token open. The client displays the change and waits for approval of the updated plan. The history retains the updated plan snapshot and a Trace event describing the change.

Execution progress is streamed as typed NDJSON events from actual server phases. Sandbox cleanup happens in finally. Provider failures are explained; a live failure does not silently become a demo success.

## Approved first reliability iteration

Only planning feedback, execution observability, strict result-stream handling, export reliability and small connection/mobile/accessibility fixes are in scope. Do not add history persistence, new analysis operations or replace the upstream framework. No real provider calls are used to validate this iteration.

Workflow: `ready → planning → pending → running → completed`; planning may instead reach `needs_clarification` or `error`, and pending may reach `declined`. A failed execution reaches `error` and clears any report. Changing input/data/mode invalidates the plan and clears feedback. Suggestions only fill the question; the user must generate and approve a new plan.

- Planning: explicit clarification is a non-executable 422 response with `code`, `reason`, `error` and current-column `suggestions`. No approval token is issued. Known unsupported goals are rejected before provider access. Live responses allow either a validated analysis specification or an explicit clarification, never a fabricated quality fallback.
- Progress: `{ type: 'progress', phase, status, message, timestamp }`. Demo phases: validation → analysis → verification → report. Live adds sandbox → upload before analysis, then cleanup before verification. Progress states: running/completed/warning; the client also models pending/failed. No timers fabricate execution work.
- Failures: `{ type: 'error', phase, message }`. An analysis failure is still labelled analysis even if cleanup runs afterward. Trace distinguishes information, starts, successes, warnings and failures.
- Result: `{ type: 'result', result }` must be the last event. The client validates every event and result, retains a tentative result until clean EOF, and rejects malformed, duplicate, missing or post-terminal events. Checks must be nonempty and all pass; runtime/sandbox/cleanup must be consistent. No automatic execution retry is added.
- Delivery: Markdown describes the executed analysis and verification mode; CSV exports aggregates or quality counts with spreadsheet-safe labels; Python remains inspectable/downloadable. Browser download notices describe a request, not confirmed OS delivery. Unsaved credential drafts are cleared on close. Tabs support arrow/Home/End navigation.

## Product surface

A compact analysis workbench with dataset upload and preview, question composer, editable question, approval card, result chart, data-quality details, Python preview, execution trace and Markdown/CSV export. The sample dataset is synthetic marketing-channel data. Uploaded CSV remains in page state. The second iteration saves selected runtime metadata and analysis outputs in browser history. See the [run-history design](superpowers/specs/2026-11-19-run-history-design.md) for persistence and recovery behavior.

## Provenance

Upstream: https://github.com/e2b-dev/fragments

Base commit: 3b11c7fcd4dcc37b2f1effde35960cf6ec4bd3c7.

Retain Apache-2.0 LICENSE and upstream history. Retain the original app at /playground; its sandbox endpoint is disabled by default because it does not use InsightPilot approval. New ownership is under components/analysis, lib/analysis and app/api/analysis.

## Acceptance

1. New checkout starts and builds without credentials.
2. Sample revenue totals 69,900 across 24 rows; changing the CSV changes the output.
3. No approval, mismatched data, edited token and repeated token cannot execute.
4. Generated Python produces equivalent values to the TypeScript reference, including missing values and quoted input.
5. API tests verify the approval boundary; mock E2B adapter tests verify awaited file upload and cleanup on success/failure. One real-provider HTTP run also verified DeepSeek planning, signed approval, E2B CSV analysis, reference results and release; see verification.md. The factory configures disabled internet and a 90-second lifetime, but network enforcement has not been independently probed.
6. Existing upstream tests continue to pass alongside new CSV, approval, analysis, provider and adapter tests.
