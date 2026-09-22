# Native App Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `app-ios`, `app-android`, and `app-harmony` generate native SwiftUI, Jetpack Compose, and ArkUI projects.

**Architecture:** A native compiler analyzes the supported TransOne static Component subset into `NativeScreen`. Three isolated `NativeDialect` implementations generate native projects; `AppTarget` remains an existing `BuildTarget` adapter.

**Tech Stack:** TypeScript compiler API, Bun tests, SwiftUI/iOS 16, Kotlin/Jetpack Compose/minSdk 26, ArkTS/ArkUI/API 12.

**Spec:** `docs/superpowers/specs/2026-09-21-native-app-targets-design.md`

## Global Constraints

- Generated applications contain no WebView, JavaScript engine, bridge, or TransOne runtime.
- First release supports containers, text, buttons, literal/state interpolation, literal state, click actions, and the ten style properties in the spec.
- Unsupported source must fail before output is cleared, with file path and reason.
- Three targets have the same source capability set.
- Use TDD; platform SDKs are not run in CI.

---

## Task 1: App configuration model

**Files:** Modify `packages/transone-cli/src/target/types.ts`, `src/types.ts`, `src/config.ts`; create `packages/transone-cli/tests/app-build.test.ts`.

**Produces:** `AppTargetType`, `AppConfig`, `AppConfigMap`, `ResolvedAppConfig`, `ResolvedConfig.app`.

- [ ] Write a test that resolves `app-ios` to `appName: 'TransOne'`, `bundleId: 'com.transone.app'`, `minPlatformVersion: '16.0'`, and `<root>/dist/build/app-ios`; write a second test selecting only `app['app-android']`.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts`; verify RED because `app` is absent.
- [ ] Add `APP_TARGET_TYPES = ['app-ios', 'app-android', 'app-harmony']`, type guards, flat/map config types, and `pickAppConfig`. Resolve defaults only for app targets. `--out-dir` overrides app outDir. Reject map/flat mixed fields with `/app.*不能混写/`.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts && bunx tsc --project packages/transone-cli/tsconfig.json --noEmit`; verify GREEN.
- [ ] Commit: `feat(cli): add native app target config`.

## Task 2: Native model and diagnostics

**Files:** Create `packages/transone-cli/src/app/types.ts`, `src/app/errors.ts`; create `packages/transone-cli/tests/app-analyze.test.ts`.

**Produces:** `NativeScreen`, `NativeNode`, `NativeTextPart`, `NativeAction`, `NativeStyle`, `NativeDialect`, `nativeError()`.

- [ ] Test that `nativeError('/tmp/main.ts', node, '不支持的原生节点: input')` includes both `main.ts` and the reason.
- [ ] Run `bun test packages/transone-cli/tests/app-analyze.test.ts`; verify RED.
- [ ] Implement closed unions: container/text/button nodes; literal/state text parts; increment or literal-set actions. `NativeDialect` exposes `id`, `label`, `resourceDirectory`, and `generateProject(screen, app): Record<string, string>`.
- [ ] Re-run the test; verify GREEN; commit `feat(cli): define native app compiler model`.

## Task 3: AST analyzer for the static subset

**Files:** Create `packages/transone-cli/src/app/analyze.ts`; modify `packages/transone-cli/tests/app-analyze.test.ts`.

**Consumes:** Existing `loadTypescript()`, `findRootClass()`, `ClassSource` and Task 2 types.

**Produces:** `analyzeNativeScreen(context, entry): NativeScreen`.

- [ ] Test a Component fixture with `{ count: 0 }`, `count: {{count}}`, a button calling `this.increment()`, `this.state.count += 1`, and `{ color: '#f00', padding: 8 }`; assert the exact state and `{ kind: 'increment', key: 'count', by: 1 }` action. Add rejection cases for `input`, `{{count + 1}}`, unknown state, nonliteral state, and unsupported style.
- [ ] Run `bun test packages/transone-cli/tests/app-analyze.test.ts`; verify RED.
- [ ] Extract object-literal `initState`, `render`, and `initStyles`. Map `view|main|div` to container, `text|span|p|h1` to text, and `button` to button. Allow only `{{identifier}}` state bindings and `listeners.click` calling one class method. Parse only `this.state.key += number`, `-= number`, or literal assignment.
- [ ] Enforce exactly `color`, `backgroundColor`, `fontSize`, `fontWeight`, `padding`, `margin`, `width`, `height`, `borderRadius`, `textAlign`; allow number or `'<number>px'` values; send every unmatched AST node to `nativeError()`.
- [ ] Re-run test; verify GREEN; commit `feat(cli): analyze native app component subset`.

## Task 4: SwiftUI code generator

**Files:** Create `packages/transone-cli/src/app/dialects/shared.ts`, `src/app/dialects/ios.ts`; modify `packages/transone-cli/tests/app-build.test.ts`.

**Produces:** `IOS_DIALECT` and an Xcode project file map.

- [ ] Test that `IOS_DIALECT.generateProject(counterScreen, app)` contains `@State private var count: Int = 0` and `count += 1` in `TransOneApp/ContentView.swift`.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts -t "SwiftUI"`; verify RED.
- [ ] Implement shared string escaping, identifiers, text parts and per-style formatters. Implement `IOS_DIALECT` to emit the exact spec files: `TransOneApp.xcodeproj/project.pbxproj`, `TransOneApp/TransOneApp.swift`, `TransOneApp/ContentView.swift`, and `TransOneApp/Assets.xcassets/Contents.json`, using SwiftUI `VStack`, `Text`, `Button`, state and modifiers.
- [ ] Re-run test; verify GREEN; commit `feat(cli): generate SwiftUI projects`.

## Task 5: Compose and ArkUI code generators

**Files:** Create `packages/transone-cli/src/app/dialects/android.ts`, `src/app/dialects/harmony.ts`; modify `packages/transone-cli/tests/app-build.test.ts`.

**Produces:** `ANDROID_DIALECT` and `HARMONY_DIALECT`.

- [ ] Test Compose output has `setContent {` and `count`, and ArkUI output at `entry/src/main/ets/pages/Index.ets` has `@Entry` and `count`.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts -t "native source"`; verify RED.
- [ ] Generate Android `settings.gradle.kts`, root/app Gradle files, manifest, and `MainActivity.kt` with `ComponentActivity`, `remember { mutableStateOf() }`, `Column`, `Text`, `Button`, and style-to-Modifier mapping.
- [ ] Generate Harmony `AppScope/app.json5`, resource string JSON, `module.json5`, `EntryAbility.ets`, and `Index.ets` with `@Entry`, `@Component`, `@State`, `Column`, `Text`, `Button().onClick`, and ArkUI style chains.
- [ ] Re-run test; verify GREEN; commit `feat(cli): generate Compose and ArkUI projects`.

## Task 6: Target integration and safe output

**Files:** Create `packages/transone-cli/src/app/build-app.ts`, `src/target/app-target.ts`; modify `src/target/registry.ts`, `tests/target.test.ts`, `tests/app-build.test.ts`.

**Produces:** Real `AppTarget` registrations and `buildNativeApp()`.

- [ ] Test each app target resolves to `AppTarget`, not `PlaceholderTarget`; test `public/logo.txt` reaches Android `app/src/main/assets/logo.txt` after a successful build.
- [ ] Run `bun test packages/transone-cli/tests/target.test.ts packages/transone-cli/tests/app-build.test.ts`; verify RED.
- [ ] Analyze every page before calling `rm(outDir)`; first release rejects a page count other than one. Write dialect files in sorted path order, copy public files into `dialect.resourceDirectory`, and return all absolute generated/copied paths. Replace only the three app placeholder registrations.
- [ ] Re-run tests; verify GREEN; commit `feat(cli): enable native app build targets`.

## Task 7: Counter fixture, docs, and regression

**Files:** Modify `playground/counter/transone.config.ts`, both root READMEs, both CLI READMEs, `docs/positioning.md`, and `tests/app-build.test.ts`.

- [ ] Test `build({ root: counterRoot, target })` returns more than four assets for each App target.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts -t "builds counter"`; verify RED.
- [ ] Configure the Counter app, change App status from future to native-project generation, document the three `transone build --target app-*` commands, the supported subset, and that generated-project tests differ from Xcode/Android Studio/DevEco validation.
- [ ] Run `bun test packages/transone-cli/tests/app-build.test.ts -t "builds counter" && bun test && bunx tsc --noEmit && bun run build && git diff --check`; verify GREEN or report any baseline failure separately.
- [ ] Commit: `docs: document native app build targets`.
