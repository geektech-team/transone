# Reliability and Component Diagnostics Implementation Plan

> **For agentic workers:** Use focused independent workers for the three domains, then integrate and request one whole-change review. Track the steps below.

**Goal:** Deliver explainable component selection, exception-safe cleanup, and recoverable build output publication.

**Architecture:** Reuse the shared component matcher; introduce one output transaction boundary for the existing generators; keep runtime resource cleanup within the owning component/app/request.

**Tech Stack:** TypeScript, Bun, native filesystem APIs; no added dependency.

**Spec:** `docs/superpowers/specs/2026-10-29-reliability-diagnostics-design.md`.

## Constraints

- Work in the current checkout, preserve unrelated edits, deliver without committing or publishing.
- Concrete platform and generic family matching contracts remain compatible.
- Each worker writes meaningful failing tests before implementation.
- Package dist builds and full-suite tests run after workers finish, avoiding concurrent rebuilds or watch-test load.

## Tasks

- [x] Report: extend the shared index with structured decisions; add read-only report API, CLI flag, deterministic source metadata, and focused tests.
- [x] Cleanup: add component disposer registration, resilient component/app/renderer cleanup and request settlement, with lifecycle and adapter regression tests.
- [x] Output: introduce a shared staging/backup/publication helper; adapt Web/MP/App/library output and add filesystem fault, path and concurrency tests.
- [x] Integrate: review public contracts, document flags/APIs/failure behavior and validate generated consumers.
- [x] Verify: build framework then CLI, compare root type diagnostics, build docs, run the full suite without parallel build load and review the combined diff.

## Review focus

- Reporting unused abstract components must not turn them into build errors.
- Cleanup must not lose the original error, orphan siblings or remove another app's global instance.
- Synchronous mini-program completion and missing/throwing abort handlers must release resources and settle once.
- Staging must not bypass final-destination protection or leak temporary paths into usable outputs.
- Publication/backup cleanup failures and same-destination concurrency must preserve recoverable output.

## Integration evidence

- Independent review reproduced and verified repairs for imported source/config overwrites and per-entry Web reporting conflicts; no material findings remain.
- Framework/CLI builds and documentation build passed. PC/Weixin Counter builds passed.
- A generated project consumed the built package: TypeScript check, exact PC report and Web build passed, with final asset paths.
- Root TypeScript diagnostics remain byte-for-byte identical to clean HEAD: 41 existing UI/demo errors.
- Complete regression suite ran after all other builds finished, with local loopback allowed: 788 tests passed, 0 failed, 2721 assertions across 53 files.
