# Nested Emit and WatchProps recovery

**Goal:** Prevent repeated, missing or stale notifications in nested components, inherited methods, reentrant events and recovery, retaining the existing decorators and supported platform contracts.

**Contract:** Emit dispatch starts with a stable listener list, skips listeners removed before their turn, and stops when its mount scope expires. WatchProps snapshots stay shallow and preserve references. Reentry on the same component queues behind its current batch; explicit props updates on another component notify that component synchronously. Pending parent render bindings still publish only at their action boundary. A failed or old batch cannot operate on a replacement scope.

**Changes and tests:**

- [x] Core `base.ts`: pin three-level handler replacement and error-boundary recovery with red tests; snapshot listeners and check membership/scope before invocation. Preserve inherited Emit/WatchProps override and explicit-super behavior.
- [x] Native TS/Ark/Swift/Kotlin: pin cross-component reentry ordering and missing-notification failure. Keep global render collection, add owner-specific notification draining, and isolate busy-owner bookkeeping by generation. Test same-owner queues, different-owner explicit commits, later throws and remount.
- [x] Mini-program props observer: capture the original scope before notification and keep publication/legacy-hook tails inside that scope. Preserve same-scope failure publication and error aggregation; test all dialects with nested inherited components.
- [x] Verify the reported Alipay event-ABI difference against official documentation and actual generated code; fix routing/template/adapter together only if confirmed, retaining existing event API.
- [x] Independently rerun the original reproductions and affected regressions; document final behavior and platform limits.
- [x] Run full repository types, root/library/docs/example builds, then full regression with stable outputs. Record exact results.

**Constraints:** Preserve current checkout and unrelated dirty work; no commits, dependency or version changes. Do not interrupt synchronous business code already entered. Do not claim SDK/IDE/device acceptance from generated code or Foundation Swift execution.

**Initial evidence:** `/tmp/transone-web-audit.test.ts` (live listener Set replacement duplicates an event); `/tmp/transone-nested-native-throw.ts` and `.swift` (global native busy queue drops another owner's committed notifications); `/tmp/transone-three-mp-audit.ts` (old observer tail enters a replacement mount, plus Alipay props-only host failure).

**Confirmed Alipay contract:** Official [component methods and props documentation](https://miniprogram.alipay.com/docs/miniprogram/mpdev/framework_custom-component_create-custom-component_method-and-attribute) specifies callback props whose names begin with `on`. The original generated component and AXML used `triggerEvent` / `bind:`, which failed in a props-only Alipay host. Both decorated and explicit emissions now use one dialect-aware helper, with matching parent argument adapters and encoded internal callback names that preserve logical event names and payload references.

**Focused results:** Core red tests reproduced replacement-listener replay; 65 related tests passed after the snapshot fix. Native TS/Ark plus codegen/complex fixtures passed 31 tests; real-source Core/TS/Ark inheritance and exception comparisons passed all four cases. Four actual Swift fixture files passed 20 tests including three new nested-owner cases. MP related 19 suites passed 608 tests; after the final observer error-tail guard, nine affected suites passed 330 tests. Independent reviewers reran the original Native and four-dialect MP reproductions, verified fresh-scope recovery and Alipay props-only routing, and found no remaining confirmed issue in the bounded scope.

**Final verification:** Repository `tsc --noEmit --pretty false` passed. `bun run build` produced 22 core and 16 CLI artifacts; UI and Chart builds produced 2 each. Docs Web (56 assets), UI demo Web (3), Weixin (86), Alipay (85), and ByteDance (85) builds passed. With outputs stable, `bun test --timeout 30000` passed all 1686 tests across 105 files, with 6520 assertions, 0 failures (392.81 seconds). Prettier and `git diff --check` passed. Foundation Swift fixtures and local native/mini-program generated-host contracts were executed; Kotlin compilation, complete native SDK builds, mini-program IDE and device acceptance were not run. Changes remain uncommitted, with no dependency or version changes in this task.
