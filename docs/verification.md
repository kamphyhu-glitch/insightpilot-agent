# Local MVP verification

## Public Demo recording

The production build ran locally in Chrome with Live mode disabled and external browser requests blocked. In one clean browser session, the uploaded 24-row synthetic CSV produced a draft sum, which was changed to an average. The revised plan stayed pending until approval, then reported 2,912.5. The Chrome download contained the same value in Markdown. Reloading restored the read-only report without issuing a new analysis request.

The portfolio recording is 51 seconds at 1440 × 1000 and is delivered separately from the source repository. Chrome was checked for Markdown export in this run. Edge download behavior remains unverified.

## Earlier verification

Updated 2026-11-19. The second iteration used local Demo mode and offline tests. The real-provider acceptance recorded below refers to the earlier 2026-11-17 and 2026-11-18 runs.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 161 passed, 0 failed, 0 skipped (76 upstream tests and 85 analysis-workspace tests) |
| `npm run typecheck` | Passed (`tsc --noEmit`) |
| `npm run lint` | Passed, with 8 retained upstream warnings |
| `npm run build` | Passed; Next.js production routes generated |
| `git diff --check` | Passed; Git reports local LF/CRLF normalization notices |

The retained lint warnings concern hook dependencies and image elements in the upstream playground/chat components, not the new analysis modules. The build also reports an outdated Browserslist dataset. These results are not a dependency-security or public-release audit.

Added tests cover CSV quoting, multiline fields, BOM, malformed input, size/row/column limits, numeric aggregation, missing values, verification failures, schema-constrained planning, provider data minimization, signed approvals, altered data, expiry/replay, route integration, origin validation, sandbox upload order and cleanup.

Three parity tests actually execute generated Python for sum, mean and count, using both the marketing sample and an edge-case CSV with quoted fields, a multiline label, missing cells, negative/decimal/scientific values and duplicate rows. They compare Python output against the TypeScript reference. All three ran in this environment; they skip when Python is unavailable.

Default tests do not call paid providers. E2B adapter lifecycle tests use a fake sandbox. A fake provider is not evidence that cloud execution, billing or network isolation was verified.

## Editing and reapproving an analysis plan

Six endpoint tests cover token replacement, invalid edits, mismatched datasets, quality-plan protection, forbidden code fields, competing replacements, an edit/execute race, and ungrouped row counts. In the browser, canceling edits restored the original approval card. Saving a change from sum to mean returned the card to pending approval. The development server logged one plan request, one revision request and one execution request. After clicking Approve and Execute on the updated plan, the result displayed 2,912.5. The restored history retained the change event, the mean result and the updated Python.

The in-app browser returned completed-download events and filesystem paths for the report, results CSV and Python. The saved Markdown specified `mean(revenue) by channel` and an overall result of 2,912.50. The saved CSV contained four correct channel means with six rows each. The downloaded Python matched the restored preview. Chrome and Edge could not be controlled in this session and were not independently tested. This run used local Demo mode.

- [Revised plan awaiting approval](screenshots/round3-plan-reapproval.jpg)
- [Result restored after approval](screenshots/round3-revised-result.jpg)

## Run history and refresh recovery — 2026-11-19

The 20 added tests cover the history field allowlist, versioned storage, corrupt data, record and byte limits, quota failures, snapshots after reload, subscriptions, and late updates after deletion. Presentation tests cover read-only pending and disconnected states, removal of the old approval action from history, and completeness calculated from the historical dataset summary.

The local Demo browser run saved a completed report and restored the same 69,900 total after refresh. The saved Python and Trace were accessible by keyboard, and the Markdown export requested a download. A separate pending run restored without an approval button or raw data preview. Declined and clarification runs were also visible in history. The test verified canceling deletion, confirming deletion, persistence after refresh, and clearing the remaining synthetic test records. A second tab stayed on the workbench during the clear and read zero records when it opened history. At a 390 px viewport, the restored result was visible and the document had no horizontal overflow.

The development server observed four deliberate planning requests and one approved execution. Refresh and history navigation added no planning or execution requests. The production preview separately reproduced the pending snapshot with no old approval action. Interrupted execution was tested offline using a saved running record. Actual file delivery and real Live disconnection were outside this check.

- [Completed report restored after refresh](screenshots/round2-history-restored.jpg)
- [Pending plan restored without approval](screenshots/round2-history-pending.jpg)

## First reliability iteration — 2026-11-18

Scope: planning feedback, actual execution phases, terminal result handling, export content, and small connection/accessibility improvements. No history persistence, new analysis operation or framework was added. Changes stayed within the approved small-scope iteration; browser work used local preview only, not hosting or deployment.

29 regression tests were added this round. Tests were run red before the corresponding fixes, then the entire suite was rerun successfully. Coverage includes:

- Forecast-plus-quality requests, vague goals, multiple metrics and mixed quality/aggregation requests do not silently become another executable plan in the rule planner. A 422 clarification response includes supported suggestions and no approval token. Known unsupported Live goals are rejected before the fake model is called.
- The fake DeepSeek adapter can return an explicit clarification, and cannot substitute a quality plan for a non-quality request. This tests the adapter contract, not real model compliance.
- NDJSON decoding handles split UTF-8 and a final line without newline. The result remains tentative until clean EOF. Unknown/malformed events, truncated JSON, absent/duplicate results, post-result errors, failed/empty checks and inconsistent runtime/cleanup values cannot publish success. Failed streams cancel and release their reader.
- Demo phases exclude sandbox/upload/cleanup. Live cleanup precedes verification. Analysis failure retains its original phase even after cleanup; release warnings remain warnings.
- CSV exports include BOM/CRLF, preserve numeric negatives and escape formula-like labels. Quality CSV contains row count, missing cells and duplicate rows. A mocked browser verifies anchor attachment, cleanup on rejected clicks and delayed blob revocation; it does not prove OS file delivery.
- Server-rendered UI checks ensure a failed run cannot display an old verified result/export action, and error/warning Trace entries do not use success text. Quality Markdown contains quality counts rather than a fictitious count aggregation and distinguishes local consistency from independent verification.

Development-preview browser checks confirmed: unsupported-request explanation; suggestions only populate the input; pending approval has no report; approved sample revenue is 69,900; real typed phase records; refusal leaves all steps unexecuted; uploading the four-row fixture resets the prior plan/result; a separately approved quality run reports four rows and zero missing/duplicate counts. Keyboard Home selects the report tab. At 390 × 844, the result and connection dialog were inspected with no document-level horizontal overflow; the viewport override was reset.

No real credentials were entered or saved. An unsaved dummy input and a validation error were cleared when the connection dialog closed. Markdown/CSV/Python export buttons produced the expected request notices. The in-app browser again timed out waiting for a download event, so downloaded-file delivery remains **not verified**, despite passing content and handoff unit tests. The preview server was stopped after testing. Console inspection showed a development Fast Refresh warning, not an application exception.

After the final build passed, a separate production-preview run was checked in the browser: fresh page → generate → pending approval → approve → verified sample report, with total 69,900 and 4/4 real phases complete. The approved-result screenshot was refreshed from this production run. No real provider was used; the local production server was then stopped.

New screenshots:

- [Approved result and phase completion](screenshots/round1-analysis-result.jpg)
- [Clarification and supported suggestions](screenshots/round1-clarification.jpg)
- [Typed execution trace](screenshots/round1-execution-trace.jpg)
- [Uploaded-data quality result](screenshots/round1-quality-result.jpg)
- [Mobile result](screenshots/round1-mobile-result.jpg)
- [Mobile connection dialog](screenshots/round1-mobile-connection.jpg)

## Original MVP browser checks — 2026-11-17

The production build was tested through the local app UI.

- Generate a plan: inspectable steps and Python are available before execution.
- Decline: no analysis result is produced; the trace records refusal.
- Approve: the 24-row marketing sample returns 69,900, with Search 29,400, Social 16,100, Email 14,200 and Referral 10,200.
- Upload [upload-check.csv](fixtures/upload-check.csv): the UI switches to a 4-row / 2-column preview and invalidates the old analysis. A new approved run returns 200, with Search 125, Social 50 and Email 25.
- Execution trace distinguishes local TypeScript computation from E2B execution.
- The connection dialog identifies both required visitor keys, separate service usage and the data destinations. No real credentials were entered or copied from FlowPilot.
- Desktop (1440 px) and mobile (390 px) layouts were inspected. Temporary viewport overrides were reset after testing.
- Clicking report export produced no console error, but the in-app browser did not return a download-completion event. File delivery still needs confirmation in a normal browser; it is not marked as an end-to-end pass.

Browser testing exposed a same-origin false rejection caused by Next.js normalizing the internal request hostname. The fix uses the browser Host authority, including port, and has regression coverage for valid, mismatched and malformed origins.

## Screenshots

- [Approved analysis result](screenshots/analysis-result.jpg)
- [Pending approval](screenshots/pending-approval.jpg)
- [Execution trace](screenshots/execution-trace.jpg)
- [Visitor connection dialog](screenshots/connection.jpg)
- [Mobile result](screenshots/mobile-result.jpg)

## Live E2B connectivity smoke test

With explicit user approval, a real E2B sandbox was created using the supplied private key. The retry returned the expected `INSIGHTPILOT_E2B_OK` marker and `5` from `2 + 3`. Sandbox release returned `true`. The successful attempt took 2,661 ms, with a 60-second sandbox lifetime limit, no automatic creation retries and internet access configured off. No CSV or personal data was uploaded, and no DeepSeek request was made.

The first attempt failed in the temporary test harness's optional SDK logger middleware (`onResponse` Response-class mismatch), before a usable sandbox handle was returned. A subsequent read-only request confirmed authentication and found no active sandbox matching that attempt's metadata. Removing the optional logger allowed the explicitly approved retry to complete. The first request may still have produced short-lived usage; no zero-cost claim is made. No dependency or application change was needed for this test.

This was a credentialed SDK smoke test, separate from the 106 automated tests. It did not validate the application's approval endpoints, CSV upload, generated analysis code, independent result verification or browser workflow against real providers. Network isolation was configured but not actively probed.

## Real-provider HTTP integration acceptance

One explicitly approved run used the production build's actual local HTTP endpoints, not imported route-handler functions. Private credentials were read only from the user-supplied, Git-ignored folder and sent in the application's visitor-key request headers. No credentials from FlowPilot were reused or stored as server-owned environment keys.

Input: `campaign_performance.csv`, 24 synthetic marketing records. Question: `按 channel 分组，对 revenue 求和，比较每个渠道的收入总额。` Runtime: `e2b`.

1. An unsigned execution request was rejected before provider access.
2. One real DeepSeek planning request returned `planner: deepseek`, `groupBy: channel`, `metric: revenue` and `aggregation: sum`, with compiled Python and a signed approval token. The token was not printed.
3. Altering the CSV invalidated approval and was rejected without consuming the valid original plan.
4. The test submitted the original signed plan for execution under the user's explicit authorization for this one synthetic-data run. This was an automated API submission, not a browser approval-button click.
5. E2B received the approved CSV, executed the compiled Python and confirmed sandbox release. All four TypeScript reference checks passed.
6. Reusing the token was rejected with the already-executed error before a provider key was required; no second cloud execution was requested.

| Channel | Actual revenue | Expected revenue |
| --- | ---: | ---: |
| Search | 29,400 | 29,400 |
| Social | 16,100 | 16,100 |
| Email | 14,200 | 14,200 |
| Referral | 10,200 | 10,200 |
| Total | 69,900 | 69,900 |

The entire HTTP check took 4,234 ms; the execution endpoint reported 2,502 ms. The returned Markdown report identified E2B Python execution and contained the verified total. These are observations from one run, not a latency benchmark or reliability claim. The local server was stopped after acceptance. No product-code changes were required.

## Real-provider browser acceptance — 2026-11-18

The user explicitly authorized one real synthetic-data analysis. The existing production build was started locally; no product code was changed, and no deployment, commit or push was performed. The workflow used the actual page controls, not direct calls from an HTTP acceptance script.

Input: the same 24-row / 7-column synthetic `campaign_performance.csv`. Question: `按 channel 分组，对 revenue 求和，比较每个渠道的收入总额。` Expected operation: sum `revenue` by `channel`.

1. The user-provided DeepSeek and E2B credentials were read from their Git-ignored files without printing their contents. The local connection dialog saved them for this test's tab session. A page refresh restored the configured connection; Live mode was then selected explicitly.
2. One Generate Plan click returned a real DeepSeek plan labelled `DEEPSEEK`, with `channel`, `revenue` and `sum`. The page stopped at Pending Approval with seven pending execution steps and no result.
3. One Approve and Execute click created the E2B sandbox, uploaded the synthetic CSV and ran the compiled Python. No analysis retry or second planning request was triggered by the test.
4. The report displayed `E2B · PYTHON`, 24 rows, total 69,900, and Search 29,400 / Social 16,100 / Email 14,200 / Referral 10,200. All four independent TypeScript checks passed.
5. The trace contained 19 events, including approval, seven real phase start/completion pairs, confirmed sandbox release before verification, and clean final-result reception. The page showed 7/7 completed phases. Execution duration displayed as 3.9 seconds; this is one observation, not a performance benchmark.
6. The Python tab's embedded specification matched `aggregate / channel / revenue / sum`. A check for the supplied providers' credential prefixes found no matching key pattern in the displayed code. Console inspection returned no warning or error entries for this test tab.
7. Markdown, CSV and Python export buttons each produced the expected download-request notice. Waiting eight seconds for the Markdown download event returned no completed-download path. Only the in-app browser was connected; no ordinary Chrome/Edge automation surface was available. File delivery and downloaded-file contents are therefore **not verified** by this browser run. Clicking an export is not treated as successful file delivery.
8. The connection was cleared through the page's Clear Connection control. After refresh, the page returned to unconfigured local demo mode with no old approval action. In-memory credential candidates were cleared; the original private key files were not modified. The local test server was stopped after acceptance.

Evidence screenshots (no API key contents):

- [Real DeepSeek plan awaiting approval](screenshots/live-pending-approval.jpg)
- [Full real-provider execution trace](screenshots/live-execution-trace.jpg)

The original report capture includes a sandbox run identifier and is kept with the local acceptance evidence.

## Remaining acceptance and deployment limits

The Live browser planning/approval/execution/verification/cleanup workflow and session-key recovery passed for the single synthetic-data run above. The later Demo run verified actual downloads in the in-app browser. The remaining `live-*` screenshots document the credentialed browser run. Internet access was configured off, but network enforcement was not independently probed. Default automated tests use mock providers and do not incur API charges.

Approval replay protection is process-local, not a distributed production guarantee. Public deployment needs shared idempotency storage, consistent signing configuration, abuse controls and a separate security review.
