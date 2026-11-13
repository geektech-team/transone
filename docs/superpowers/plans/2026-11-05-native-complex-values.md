# Native complex event and prop values

**Goal:** Extend App Emit/WatchProps from scalars to plain objects and arrays while retaining the existing public decorators and shallow reference semantics.

**Contract:** Emit forwards the returned value or original arguments without cloning. WatchProps compares top-level references with Object.is, retains old/new references in queued notifications, and does not become a deep watcher. Initial graph values preserve aliases within an App and are isolated between App runtime instances. Method literals allocate on each execution. Static props keep stable references; dynamic render expressions allocate at actual render-dependency commits, not on every internal watcher scan. Scalar behavior, publication timing, hierarchy order, mount scopes and rollback remain unchanged.

**Implementation:** Keep legacy scalar NativeStateValue/output intact. Add a graph pool and initial-state overrides to NativeProgram, plus object/array allocation, pool reference, property read/write and render memo expressions. Use reference containers in generated Swift/Kotlin/ArkTS and real reference values in the TypeScript semantics machine. No JSON roundtrip, arbitrary JS execution, dependency or version changes.

- [x] Define shared IR and graph initialization interfaces; compiler tests first.
- [x] Compile initial complex values, aliases, payloads/props, shallow spread and member operations with source diagnostics for unsupported values.
- [x] Implement TypeScript and generated ArkTS semantics, including identity, coercion and render memoization.
- [x] Extend Swift/Kotlin reference containers and helpers; execute real generated Swift fixtures.
- [x] Review complex identity, initialization isolation, reentrant props, errors and repeated mount behavior; update docs.
- [x] Run repository typecheck, root/library/document/example builds, then full regression with stable dist.

**Verification gates:** TypeScript/Bun checks and generated source builds do not imply Kotlin compilation, full SDK acceptance or device validation. Preserve existing dirty work, current checkout, versions and peer ranges. Do not commit.

**Review fixes:** Preserve conditional dependency guards, initial strict equality, own computed `__proto__` keys, Swift UTF-16 code units and allocating literals with no reactive dependencies. Ordinary object dependencies compare by identity; explicit spread enumeration dependencies read a revision token. This prevents nested writes from spuriously reallocating unrelated props while allowing spread results to update.

**Regression fix:** The first full run found one legacy diagnostic-order regression (1596 pass, 1 fail). Defer any dependency-analysis error until static-tree validation succeeds, preserving the original unsupported dynamic-component diagnostic and old-output rollback. The original test and all 75 focused compiler/native-platform cases pass without changing their expectations.

**Final verification:** Repository `tsc --noEmit --pretty false` passed. Root builds produced 22 core and 16 CLI artifacts; UI and Chart builds produced 2 artifacts each. Docs Web (56 assets), UI demo Web (3), Weixin (86), Alipay (85) and ByteDance (85) builds passed. All three native complex-data project/rollback fixtures passed. Real Swift runtime fixtures passed (12 tests). After rebuilding the CLI and consumers, `bun test --timeout 30000` passed all 1597 tests across 98 files, with 5975 assertions and 0 failures (404.73 seconds). Formatting and diff checks passed. Kotlin compilation, full native SDK builds and device validation were not run; changes remain uncommitted.
