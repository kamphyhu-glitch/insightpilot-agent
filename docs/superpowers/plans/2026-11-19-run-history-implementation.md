# Run history implementation sequence

Approved design: ../specs/2026-11-19-run-history-design.md. Local-only; no commit, push, deployment, real provider calls or private-key reads.

The writing-plans skill is not available in this session. This checklist follows the approved design directly.

1. Add failing tests for DTO projection, schema consistency, repository CRUD, recovery, quotas, corrupt/unknown data, subscriptions and late updates after deletion.
2. Implement versioned history types, one localStorage repository and a small per-run recorder; keep failures separate from analysis success.
3. Connect the existing workspace lifecycle without changing plan/execute protocols or approval handling.
4. Extract pure report rendering for current/history reuse; add read-only history, selection recovery, deletion confirmation and privacy/storage notices.
5. Add UI regression tests for read-only pending/running/completed records and historical data summaries. Run the entire suite, typecheck, lint and production build.
6. Verify Demo history/refresh/deletion/keyboard/mobile flows in the browser, save screenshots and update factual verification docs. Stop the owned preview server.

Do not count ordinary-browser download delivery, real Live interruption, distributed replay protection or cross-tab transactions as verified by this work.
