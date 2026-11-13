# Emit and WatchProps Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with disjoint runtime, parser and mini-program ownership. Preserve the current checkout and existing changes; do not commit.

**Goal:** Add standard method decorators for custom events and top-level props changes without changing existing component APIs.

**Architecture:** Extend existing method metadata and the private component host bridge. Lower the same metadata into mini-program hosts and a closed scalar native IR interpreted by generated Swift, Kotlin and ArkTS machines. Keep existing APIs, static App output and mini-program event encoding.

**Tech Stack:** TypeScript standard decorators, Bun tests, TypeScript compiler API, Web and four mini-program dialects.

## Contract

- `@Emit(eventName)` requires an explicit nonempty string. Run a synchronous method, emit its non-undefined result as one payload, otherwise forward its arguments; preserve its return. Do not emit on failure or after its resource scope becomes stale.
- `@WatchProps(key, { immediate?: boolean }?)` observes one top-level string key with `Object.is`, calls a synchronous void method with `(newValue, oldValue)`, and never reacts to state-only updates. `immediate` defaults to false and uses undefined as the old value once per successful mount.
- Mounted props updates notify synchronously after committing props. Pre-mount updates establish the latest baseline. Reentrant updates use snapshots and a queue; invalidating a mount cancels its remaining notifications. Consume a failed batch so a later update can recover.
- Both automatically bind, support one `Bind` in either order, and reject combinations with each other or scheduling decorators. Preserve existing target, initialization, inheritance and cleanup rules.
- Native App support is required by the user's explicit choice. Add event payloads, dynamic props, watcher snapshots and mount generations in iOS/Android/Harmony; retain clear source diagnostics for expressions outside the supported synchronous scalar language.

## Tasks

- [x] Core runtime and compile-only API tests: scoped entries, queued watchers, inheritance and numeric method declaration order.
- [x] Shared parser: identity, static arguments, target diagnostics and original API compatibility.
- [x] Mini-program runtime: generated execution for four dialects, manual props bridge, separate native/render packets and stale-scope recovery.
- [x] Native App: scalar IR, source compiler, three generated runtimes, real Swift execution, ArkTS differential execution and output rollback.
- [x] Document APIs, payloads, lifecycle timing, composition and platform limits; include a working example.
- [x] Independently review the integrated runtime/compiler changes and fix actionable findings.
- [x] Run full repository typecheck, build core/CLI and relevant consumers, then full regression suite with stable build outputs. Record exact results and unrun device gates.

## Review Focus

1. Retained callbacks and pending watcher batches cannot enter a later mount.
2. Watcher failures and reentrant updates cannot permanently block future notifications.
3. Observer initialization and packet props do not emit duplicate initial changes.
4. Derived overrides and `super` do not install ancestor decorators over a derived implementation.
5. New constructor plumbing does not break static style extraction or old package consumers.

## Execution notes

- Work is authorized by the user's direct implementation request. No new worktree, dependency, version or peer-range change is planned.
- Runtime, parser and mini-program tasks run in parallel on disjoint files. Build artifacts must remain stable during full-suite execution.

## Final verification (2026-11-05)

- Whole-repository `tsc --noEmit --pretty false`: passed.
- Core/CLI production builds: 22 core artifacts and 16 CLI artifacts.
- UI and Chart library builds: 2 artifacts each.
- Documentation Web build: 56 assets. UI demo Web, Weixin, Alipay and ByteDance builds passed.
- Full regression command: `bun test --timeout 30000`; final result: **1539 passed, 0 failed, 5770 assertions, 93 files**, 334.39 seconds. The command exited with status 0 after the final source and build changes.
- The first full run had 1538 passes and one static-style extraction failure. A direct watcher-initialization call in `mountToNode` appeared as an unsafe `this` escape to the existing bundled-framework detector. Moving the call behind a non-overridable private method preserved the detector's safety rules. Static-style and core decorator regressions then passed: 103 tests, zero failures. Core/CLI and consumers were rebuilt before the final full rerun.
- Native tests compile and execute generated Foundation-only Swift and execute the generated ArkTS runtime after TypeScript lowering. Complete iOS/Android/Harmony source-generation and failed-build output preservation are covered.
- Kotlin compilation, full Xcode/Gradle/DevEco SDK builds, Mini Program IDEs and real devices are not validated by these repository checks.
- Changes remain uncommitted; no versions, dependencies or peer ranges were changed for these decorators.
