# Platform Component Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按统一 Platform 枚举和类装饰器选择业务组件的端实现，覆盖 Web、MP、原生 App 和初始化示例。

**Architecture:** 框架提供平台定义、逻辑组件引用和构建独享绑定；CLI 通过共享 TypeScript 类索引解析装饰器、继承和成员来源。Web 浏览器/文档入口使用相同的已选实现绑定，MP 与原生 App 使用相同类选择及带 owner 的继承成员。既有生成器与 CSS/hash 契约保留。

**Tech Stack:** Bun、TypeScript compiler API、现有 TransOne DOM/小程序/NativeScreen 编译链；不添加依赖。

**Spec:** `docs/superpowers/specs/2026-10-28-platform-component-variants-design.md`（用户已确认）。

## Global Constraints

- 平台及装饰器使用设计表中全部十组精确名字/值；保留所有旧 mp-*/app-* 命令和配置键。
- 精确端 > 通用 Web > 可实例化基类；冲突、无实现抽象类、继承循环必须明确报错。
- 不用类名字符串作为身份；继承边不替换；父成员使用 owner 模块解析。
- 未选端和专用依赖不执行、不进产物；显式引用实现类保持显式行为。
- 构建/SSR/开发会话隔离，不使用进程 currentPlatform 或全端运行时注册。
- Web 静态 CSS、内容 hash、失败保留及回收契约继续工作。
- App 包含静态嵌套 Card，但保持现有原生节点/动作边界，不扩为 JS 引擎。
- 当前 checkout 实施，保留无关更改；不提交、推送或发布。
- 待发布版本统一为 framework 0.5.0 / CLI 0.8.0；只本地验证，不执行 npm 发布。

## Review Focus

1. 动态 Web 引用经 options/数组/函数传递后仍按目标解析；未索引类沿用旧行为（Task 3）。
2. 同文件端类、未选类静态字段和端专用 import 不能污染目标产物（Task 2/3）。
3. 父子同名常量、默认/namespace/re-export/paths 引用、super 与同名组件不能串作用域（Task 2/4）。
4. 并行 mobile/pc 文档执行、watch 新增/删除/冲突后不能复用旧端（Task 3）。
5. 原生同一子组件出现两次，props 绑定及按钮状态只能影响相应实例（Task 5）。

## Shared Interfaces

`transone/platform` 导出：

```ts
enum Platform { /* 设计表中的十个成员 */ }
type PlatformName = `${Platform}`;
type BackendTarget = 'web' | 'mp-weixin' | 'mp-alipay' | 'mp-bytedance' |
  'mp-xiaohongshu' | 'app-ios' | 'app-android' | 'app-harmony';
interface PlatformDefinition {
  platform: Platform;
  decorator: string;
  family: 'web' | 'miniprogram' | 'app';
  target: BackendTarget;
}
const PLATFORM_DEFINITIONS: readonly PlatformDefinition[];
function normalizePlatform(value: unknown): Platform | undefined;
function getPlatformDefinition(value: Platform): PlatformDefinition;
function bindComponentImplementations(pairs: readonly (readonly [Function, Function])[]): () => void;
```

框架 core 导出 `ComponentReference<P,S>`（abstract new）与既有具体 `ComponentConstructor<P,S>`；
`createComponentInstance(reference, props)` 是根、子组件统一实例化入口。
绑定只存于生成 bundle 的框架模块实例，SSR 打包不得 externalize 此模块至共享进程。

CLI `ResolvedConfig.target` 保留后端 target，新增 `platform: Platform`；
`ResolveConfigOptions.target` / `UserConfig.target` 接受旧 target 或 PlatformName。
`components?: { include?: string[]; exclude?: string[] }` 为扫描配置。

共享分析模块 `src/components/index.ts` 提供：

```ts
interface ClassReference {
  id: string; filePath: string; source: ts.SourceFile;
  declaration: ts.ClassLikeDeclaration; className: string; exportName?: string;
}
interface OwnedMember { owner: ClassReference; declaration: ts.ClassElement; }
interface ComponentIndex {
  readonly platform: Platform;
  readonly classes: readonly ClassReference[];
  resolve(expression: ts.Expression, source: ts.SourceFile): ClassReference | undefined;
  findClass(filePath: string, className: string): ClassReference | undefined;
  isComponent(reference: ClassReference): boolean;
  select(reference: ClassReference): ClassReference;
  hierarchy(reference: ClassReference): readonly ClassReference[]; // root business -> leaf
  members(reference: ClassReference): readonly OwnedMember[]; // effective overrides
  bindings(): readonly { base: ClassReference; implementation: ClassReference }[];
}
function createComponentIndex(options: {
  root: string; entrypoints: readonly string[]; platform: Platform;
  include?: readonly string[]; exclude?: readonly string[];
}): ComponentIndex;
```

创建索引时解析并校验候选；`select` 对显式端类返回自身。
框架根 Component/BaseComponent 不作为业务家族被匹配。
内部辅助接口可扩展，但变更上述供后续任务消费的接口须同步通知协调者。

---

### Task 1: Framework platform API and instance binding

**Files:** Create `packages/transone/lib/platform/{definitions,decorators,bindings,index}.ts`、
`packages/transone/lib/core/component/base-component.ts`、`packages/transone/tests/platform.test.ts`；
modify component exports/types、VNode、app、renderer、router、framework build/package、root tsconfig paths。

**Interfaces:** Produces all `transone/platform` interfaces above and generic logical component references.

- [x] Write failing tests for ten enum/decorator pairs, aliases, decorator identity/multiple metadata, binding isolation/restore, root+nested instantiation and abstract reference props typing.
- [x] Run `bun test packages/transone/tests/platform.test.ts` and observe missing behavior.
- [x] Implement pure platform definitions/decorators, module-local binding map, BaseComponent and shared creation helper; preserve explicit implementation references and ordinary components.
- [x] Replace the two real framework `new` entrypoints with helper, preserve renderer identity/props/event behavior; build `platform` subpath and declarations.
- [x] Run focused core/platform tests, package type/build checks; report exact results and no commits.

### Task 2: Shared class identity, discovery and selection

**Files:** Create `packages/transone-cli/src/components/{types,index,resolution,discovery}.ts` as needed,
and `packages/transone-cli/tests/platform-components.test.ts`.

**Interfaces:** Consumes platform definitions; produces `ComponentIndex` above and source ownership metadata.

- [x] Write failing actual-source fixtures for direct/indirect Component/BaseComponent inheritance, ten decorators, exact/generic/fallback, abstract missing implementation, duplicate candidates and cycle.
- [x] Add default/namespace/alias/re-export/paths, same-name classes, excluded file, decorated intermediate parent and safe explicit implementation tests.
- [x] Run focused tests red, implement a per-build TS Program/checker index using existing TypeScript; scan project src plus entry dependencies with include/exclude.
- [x] Preserve actual source AST ownership; derive export identities (including stable private-base aliases for Web binding if necessary), effective override members and hierarchy.
- [x] Add Web source filtering utility only if needed by Task 3; keep selected ancestors and explicit consumer references while removing unused nonselected decorated declarations/dependencies.
- [x] Run focused tests and CLI typecheck; report interfaces/results and no commits.

### Task 3: CLI/config and Web target integration

**Files:** Modify `types.ts`, `config.ts`, `cli.ts`, `target/types.ts`, `index.ts`,
`web-bundle.ts`, `web-styles.ts`, `project.ts`, `target/web-target.ts`, `server.ts`;
create `src/components/web.ts` and `tests/platform-{config,web}.test.ts`.

**Interfaces:** Consumes Tasks 1/2. ResolvedConfig carries backend target + canonical platform + scan config.

- [x] Write/run red config/CLI tests for all canonical and legacy targets, target defaults/CLI priority, Web directories and dev non-Web rejection.
- [x] Normalize using framework definitions; retain backend registry/dialects and old mp/app config keys.
- [x] Write/run red Web fixtures with unimported variant discovery, same-file variants, options/function/route/body/root consumers, explicit override, unknown ordinary class, forbidden nonselected dependency and static field.
- [x] Build one target-specific virtual bootstrap that imports only selected implementations and installs binding before importing the app; use the same source transform for browser and isolated temporary Bun SSR bundles. Keep SSR DOM queue and cleanup.
- [x] Compose platform stripping/filtering with CSS plugin rather than independent competing onLoad returns. Preserve existing two-pass CSS fallback and file writes.
- [x] Add actual concurrent mobile/pc render and dev add/delete/duplicate-recovery tests. Execute focused Web, server, CSS/hash tests and typechecks.

### Task 4: Mini Program inheritance-aware component compilation

**Files:** Modify `src/mp/{types,analyze,compile,build-mp,wxml,state,styles,methods,inline}.ts`;
create `src/mp/inheritance.ts` if useful and `tests/platform-mp.test.ts`.

**Interfaces:** Consumes ComponentIndex via CompileContext; uses logical component identities for cache/tag stability and OwnedMember for scope.

- [x] Write/run red real MP builds for base+selected child across files, parent constants/helper import, inherited counter event/state/style, root+nested selection, generic fallback and explicit implementation.
- [x] Select after resolving every component reference; recurse through indirect framework inheritance; retain no-index legacy compile fixtures.
- [x] Adapt hook/member analysis with owner-aware state/style/render/method resolution. Support static super initState object spread, super initStyles append and parent business calls without losing parent module names.
- [x] Preserve labels for existing unambiguous classes and disambiguate equal names by logical identity; include parent helper modules and exclude other platform classes from inline JS.
- [x] Test all four dialects, same-name families and unsupported super diagnostics before output replacement; run existing MP suites and CLI typecheck.

### Task 5: Native root and nested component composition

**Files:** Modify `src/app/{analyze,types,build-app}.ts`, add `src/app/components.ts` or focused helpers,
modify dialects only for necessary IR additions; create `tests/platform-app.test.ts`.

**Interfaces:** Consumes ComponentIndex/OwnedMember; lowers composition to existing NativeScreen/NativeNode with scoped state/action names.

- [x] Write/run red builds for root and nested Card references selected by iOS/Android/Harmony, inherited state/method/owner constant and literal/state-bound props.
- [x] Use shared root discovery/selection; preserve existing legacy plain static App fixtures where no framework root call exists.
- [x] Expand static h/createComponent/object nodes with per-instance stable scope; lower state/props references and actions without sharing sibling state.
- [x] Add two-instance same counter test checking generated state/actions affect only their scope, parent prop binding and unsupported dynamic/slot/cycle diagnostics.
- [x] Run native tests for all three dialects, preserve validation-before-cleanup and explicitly report SDK builds not executed.

### Task 6: Runnable scaffolding, Counter and docs

**Files:** Modify `src/create.ts`, create `src/scaffold/*` if useful, `tests/platform-create.test.ts`,
playground/counter Card family and scripts/config, framework/CLI READMEs and docs content/version constants/manifests/lock metadata.

**Interfaces:** Consumes working Tasks 1-5; template uses framework 0.5.0 / CLI 0.8.0 and design's file/API names.

- [x] Write/run red create test for all nested files, scripts/decorators/base-only consumer, safe refusal before any overwrite.
- [x] Generate shared Card state/increment and generic Web/mobile/pc/Weixin/Alipay/iOS/Android views using native-supported subset; create each parent directory.
- [x] Convert Counter Card to shared family while preserving existing props/slot demo on supported Web/MP paths; keep separate legacy native demo as compatibility coverage, not as generated-template workaround.
- [x] Update docs for platform enums/commands, fallback, scans, app subset, explicit references and known boundaries. Synchronize public package and template versions; no release.
- [x] Link local packages into temp generated app, typecheck, build all ten platforms, verify selected markers and no nonselected marker/dependency.

### Task 7: Whole integration verification and review

- [x] Run `bun test`, both package declaration checks and `bun run build`; fix introduced failures with reproducing tests.
- [x] Rebuild framework/CLI before Counter/UI/docs and generated app checks; verify hashes/CSS paths, all MP targets and three native output contracts.
- [x] Fresh independent whole-change spec/quality review; address material findings with scoped regressions/re-review.
- [x] Run final affected checks, `git diff --check`, report results, current limitations, uncommitted files and no device/SDK acceptance claim.

## Execution rulings

- 2026-10-28 用户最新命名修订：平台枚举值统一使用中划线连接，命令、模板、默认 Web 输出目录及文档同步；枚举成员和装饰器名不变。

- 用户已确认设计和实施；计划是执行分解，不再发起重复实施审批。
- 使用当前 checkout，因用户既有工作方式与本次环境 `.git` 只读；不建新 worktree、不写提交。
- 相互独立且文件所有权明确的任务可并行实施；共享接口依赖按顺序落地，集成后统一复核。


## Final verification — 2026-10-28

- Full suite: 659 passed, 0 failed, 48 files (186.73 s). Local-server tests ran with loopback permission; log: /tmp/transone-platform-full-final-green.log.
- Framework and CLI scoped TypeScript checks passed; package build produced 22 framework and 16 CLI artifacts.
- Fresh scaffold consumer typecheck and actual CLI builds passed for all 10 canonical platforms. Existing Counter all 10 legacy/canonical targets, UI Web and docs builds passed.
- Read-only artifact audit verified 122 local JS/CSS references across 61 HTML files, hashed Web JS/CSS filenames, selected mobile/pc markers, four MP outputs and three native compatibility outputs.
- Independent specification and quality reviews approved; original findings and final boundary regressions were rechecked.
- Whole-workspace TypeScript retains the same 41 pre-existing diagnostics as HEAD; no added diagnostics. Native SDK, Mini Program tools and device acceptance were not run. Native static/style limitations are documented in docs/platform-components.md.
- Two multi-build MP tests received explicit 30-second timeouts after observed scheduling timeouts; no assertion mismatch was suppressed.
- Changes remain uncommitted and unpublished in the current checkout.


## Hyphenated naming revision verification — 2026-10-28

- All nine compound Platform values use hyphens; enum members and decorators retain their names. CLI arguments, default Web directories, scaffold commands, Counter scripts and documentation are synchronized.
- Framework/config red-green verification: old implementation failed the revised consumer tests; final focused run passed 52 tests.
- Final full suite passed: 659 tests, 0 failures, 48 files (327.96 s).
- Both package TypeScript checks and package builds passed (22 framework / 16 CLI artifacts).
- A fresh generated consumer passed typecheck and all 10 actual CLI target builds with the revised names; independent mapping/documentation check passed.
- Changes remain uncommitted and unpublished.
