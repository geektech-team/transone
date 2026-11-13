# Component Method Decorators Implementation Plan

> **For agentic workers:** Use test-driven implementation and independent code review for each runtime/compiler boundary. Preserve all existing uncommitted work; do not commit.

**Goal:** Add opt-in `@Bind()`, `@Delay(ms, options?)`, and `@Debounce(ms)` without changing existing component APIs or weakening mounting scopes.

**Architecture:** Standard method decorators register metadata and install lazy instance callbacks. Component resource scopes own scheduled work. Mini-program compilation explicitly lowers the same metadata; native App consumes Bind and diagnoses unsupported scheduling rather than ignoring it.

**Tech Stack:** TypeScript standard decorators, Bun, existing Web component runtime and TypeScript AST compilers.

**Spec:** The approved decorator audit in this chat, with the concrete contracts below.

## Global Constraints

- Export all three APIs from `transone`; retain the standard `(value, context)` decorator model.
- Bind retains arguments, return values and a stable instance receiver. Scheduled methods are instance-bound automatically.
- Delay schedules every call. `Delay(ms, {replace: true})` and Debounce keep only the latest pending call. Durations are finite numbers >= 0; only the replace option is supported.
- Scheduling methods must have a void return contract; async/result-returning methods are rejected by compiler/type checks. Scheduled JavaScript Promise failures are still observed defensively.
- Timer resources belong to a component instance and mounting scope. Clear them on failed mounting or unmount; retained callbacks cannot schedule or commit in a later scope. Recreate bindings after remount. Never read state or execute user work from decorator initializers.
- One Bind plus one scheduling decorator is allowed in either order. Duplicate binding/scheduling decorators, lifecycle/render/init hooks, static/ECMAScript #private methods and accessors are unsupported and diagnosed; TypeScript private/protected methods remain supported.
- Support aliases, namespaces and framework re-exports through symbol identity. Unknown method decorators in selected MP/native code must be diagnosed, not silently discarded.
- Native App keeps its synchronous action subset: Bind is supported; Delay/Debounce are explicit unsupported-capability errors. Preserve previous output on compiler rejection.
- Keep UI/Chart peer ranges compatible; migrate workspace examples rather than introducing a new core dependency into libraries supporting older peers.

## Review Focus

- Inheritance and subclass overrides must not accidentally bind an ancestor method over an override.
- Timers/handler references captured before unmount must remain invalid after three remounts, including failed initialization and cleanup reentry.
- Independent instances/methods must not share debounce state; replacement releases old arguments and cancellation handles.
- Aliased/re-exported framework symbols must work; unrelated same-named local decorators must not be mistaken for framework APIs.
- Decorator combinations must not silently alter returns, lifecycle ordering or supported native capabilities.

### Task 1: Web runtime and public types

Files: new `packages/transone/lib/core/component/method-decorators.ts` and an internal runtime helper if useful; integrate `base.ts` and public exports; new runtime tests and compile-only type checks.

Interfaces: provide Bind(), Delay(milliseconds, {replace?: boolean}?), Debounce(milliseconds). Internal host registration exposes the current resource key, scoped callback factory, disposal registration, and observation/reporting for scheduled work without making protected APIs public.

- [x] Write and run failing tests for binding/receiver/return preservation, overrides, task timing and replacement, scope isolation, errors, invalid targets/options, combination order and remount recovery.
- [x] Implement the minimum metadata/runtime integration; cover pre-mount references without eager state access.
- [x] Run focused runtime and type checks.

### Task 2: Compiler metadata and native diagnostics

Files: new `packages/transone-cli/src/components/method-decorators.ts`; integrate native `app/components.ts`; new compiler tests.

Interface: `readMethodDecorators(index: ComponentIndex | undefined, source: ts.SourceFile, method: ts.MethodDeclaration): MethodDecoratorSpec | undefined`, returning `{bind: boolean, schedule?: {kind: 'delay'|'debounce', milliseconds: number, replace: boolean}}`. Throw a source-located error for unsupported/unknown decorations. Resolve identities from the component index; allow a direct framework-import fallback for standalone source compilation.

- [x] Add red tests for aliased/namespace/re-export identity, duration validation, unsupported targets/combinations, and native previous-output preservation.
- [x] Implement parsing and native handling without expanding asynchronous native IR.
- [x] Run focused compilation/type checks.

### Task 3: Mini-program lowering and runtime

Files: MP `methods.ts`, `types.ts`, `compile.ts`, `props-runtime.ts`; new generated-runtime tests.

Interface: optional `decoratedMethods` metadata on CompiledUnit/CompiledMethods, entries `{key: string, ...MethodDecoratorSpec}`. Lower compiled methods and install per-instance scope-owned callback accessors before mounting hooks, retaining original method bodies and current state/emit rewrites. Release all scheduled resources on failure and detach.

- [x] Add red generated-JavaScript tests for all four MP dialects, page/component mounting, combinations, inheritance, errors, before-mount calls and retained old handlers.
- [x] Implement metadata lowering and scope-owned timer cleanup.
- [x] Verify source diagnostics, scope behavior and existing lifecycle regression suites.

### Task 4: Examples, docs and full validation

Files: workspace Toast/input demos, core API documentation and reliability guide.

- [x] Replace a real repeated timer pattern and demonstrate direct bound method event references without changing library peer ranges.
- [x] Document exact semantics, void scheduling contract, supported platforms, error handling and explicit async commit guards.
- [x] Independently review runtime/compiler changes and address findings.
- [x] Run full repository typecheck, `bun test --timeout 30000`, core/CLI and UI/Chart builds, UI demo MP generation and docs build, plus `git diff --check`.

## Validation and implementation notes

- Full repository typecheck passed. Final regression: 1308 pass, 0 fail, 5113 assertions across 85 files.
- Core/CLI builds produced 22/16 artifacts; UI/Chart each produced 2. UI demo Weixin/Alipay/ByteDance generation and docs Web build passed. Four MP dialects also execute generated-code/full-build fixtures in regression tests.
- Independent review findings were reproduced and fixed: shared debounce pending across initialization, quoted MP method names, partial binding-install recovery, and timer cancellation reentry.
- Component prepares decorator accessors before derived fields, including Bun's native-field execution path. A private initialization method preserves bundled static CSS extraction without weakening the extractor's unknown-this escape checks; all 48 static-style tests and the final suite passed.
- Scheduled methods retain a synchronous void contract; MP diagnoses overloaded scheduling methods. App scheduling capabilities were not expanded. Ordinary-class Bind field capture under Bun remains documented; Component field capture is covered.
- Changes remain uncommitted. Native SDK/IDE and real-device acceptance were not run.
