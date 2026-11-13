# Emit and WatchProps edge recovery implementation plan

**Goal:** Match existing Core subscription and shallow notification behavior for complex data, consecutive updates and mount replacement, without changing public decorators or supported data types.

**Architecture:** Native render memos retain the versions of property reads sampled during their last render, rather than only the final expression values or a whole-container revision. Native invocation depth belongs to a mount generation. Mini-program projection acknowledgement advances the native baseline without replaying its notification.

**Constraints:** Preserve the current checkout and unrelated dirty work. No dependency/version changes or commits. Keep Object.is watcher comparison, original shared references, source diagnostics and rollback. Native SDK/device validation remains separate from generated project and runtime checks.

## Read tracking contract

- A memo captures state/property read versions while evaluating its existing renderDependencies. A clean capture and unchanged owner propsVersion reuse the existing literal reference. A dirty capture is resampled only when rendering; all values and aliases remain untouched.
- Version maps are per state container and per object/array container, keyed by property. Writes use Core's strict inequality trigger semantics; array numeric-key writes also invalidate length. Filling a hole with undefined does not trigger. Object enumeration samples existing own keys; array iteration samples length and indices. Merely adding an unobserved key does not dirty a render.
- String/Number conversion, arithmetic/comparison and computed-key conversion sample the reads their supported plain-data conversion performs, including recursively joined arrays and cycle guards. Direct object reference reads stay shallow. Capture state is restored on exceptions and nested evaluation.
- Retain revisionValue for existing IR; it samples enumeration reads while capturing. Compiler adds nonallocating conversion expressions to dependency sampling. No user code is executed during compilation.
- Reset action depth at each new mount generation; an old invocation restores/decrements only its own generation. Old queues/callbacks remain stale.

## Tasks

- [x] Add failing real-source regressions for A→B→A, array index/length, String(array), irrelevant object/array keys and holes; implement TS oracle and compiler sampling.
- [x] Implement matching read tracking and generation depth in ArkTS; execute generated runtime tests.
- [x] Implement matching Swift/Kotlin tracking and generation depth; run actual Foundation Swift fixtures.
- [x] Pin native acknowledgement → original-reference return in all four mini-program dialects, then repair projection acknowledgement bookkeeping.
- [x] Independently recheck confirmed repros, exceptional capture restoration, shared aliases, continuous notifications and repeated mounts. Update reliability docs.
- [x] Run full repository types, stable root/library/docs/example builds, then the entire regression suite. Record exact results and unrun native-toolchain gates.

**Evidence before implementation:** /tmp/transone-native-identity-audit.ts (six Core/TS/Ark differences); /tmp/transone-coercion-dependency.ts (String(array)); /tmp/transone-complex-lifetime-audit.ts and /tmp/transone-lifetime-audit.swift (fresh mount commit blocked by old depth); /tmp/transone-mp-projection-audit.ts (four dialects, scalar-property and packet acknowledgement paths).

**Integration details:** Spread IR carries optional object/array enumeration mode. A per-owner read sample gates binding publication and is committed only after the entire binding pass succeeds. Explicit empty render dependencies mean no reactive reads; missing metadata retains legacy refresh behavior. First mount retains graph seeds, later mounts invalidate render allocation caches without replaying old notifications. Native strict writes and watcher Object.is comparisons remain separate contracts.

**Focused verification:** MP implementation: 320 tests in 8 related files passed, including 20 new acknowledgement regressions. Core/TS/Ark identity and compiler integration: 61 tests passed before final recovery assertions; root real-source fixture then passed 20 tests including synchronous object/array remount. Swift and codegen fixtures: 33 tests passed, including 5 new real Swift cases. Ark: 21 new tests passed. Independent review reran all original reproduction scripts; its final Ark factory-failure finding was reproduced red and fixed by staging render samples, then the same real-source and regression fixtures passed.

**Final verification:** Repository `tsc --noEmit --pretty false` passed. `bun run build` produced 22 core and 16 CLI artifacts. UI and Chart builds each produced 2 artifacts. Docs Web (56 assets), UI demo Web (3), Weixin (86), Alipay (85) and ByteDance (85) builds passed. With those outputs stable, `bun test --timeout 30000` passed all 1664 tests across 101 files, 6409 assertions, 0 failures (462.63 seconds). Prettier and `git diff --check` passed. Swift Foundation runtime fixtures executed; Kotlin compilation, full native SDK builds and device acceptance were not run. No commit or dependency/version changes were made in this task.
