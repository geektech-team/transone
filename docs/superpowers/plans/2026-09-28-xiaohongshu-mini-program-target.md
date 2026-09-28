# Xiaohongshu Mini Program Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add framework-level Xiaohongshu Mini Program generation and generate Counter projects for all four supported mini-program platforms.

**Architecture:** Register `mp-xiaohongshu` through the existing target registry and shared `MpTarget` pipeline. Encode Xiaohongshu file suffixes, XHSML directive prefix, event syntax, and project metadata in its `MpDialect`; keep AST analysis and emitters shared. Add the target to Counter's per-platform configuration and build scripts.

**Tech Stack:** TypeScript, Bun, TransOne CLI, shared mini-program AST compiler and dialect generators.

**Spec:** `docs/superpowers/specs/2026-09-28-xiaohongshu-mini-program-target-design.md`

## Global Constraints

- Keep the target ID `mp-xiaohongshu` distinct from the Xiaohongshu Mini Widget product.
- Preserve existing WeChat, Alipay, and ByteDance target output and config behavior.
- Generate regular multi-page Mini Program output; Counter's `/` and `/about` routes must both remain present.
- Use `.xhsml`, `.css`, `app.css`, and the `xhs:` directive prefix for Xiaohongshu output.
- Do not add Xiaohongshu runtime API, auth, payment, upload, or publishing integrations.
- Keep the previously dirty `packages/transone-ui` Carousel changes out of this task's edits and generated commits.
- Do not claim IDE or device validation unless it is actually performed.

## Review Focus

- Target IDs or `MP_TARGET_TYPES` omission causes CLI parsing, help, and config-map selection to disagree.
- Config-map discrimination fails to recognize a map containing only `mp-xiaohongshu`, causing shared settings to be read as platform options.
- A Xiaohongshu build accidentally emits Mini Widget metadata or one-page output instead of Mini Program metadata and both Counter routes.
- Dialect mistakes leave WeChat/Alipay/ByteDance directive prefixes or extensions in XHS output.
- The Counter command executes stale CLI output or overwrites an unexpected output directory.

---

### Task 1: Register Xiaohongshu as a framework mini-program target

**Files:**
- Modify: `packages/transone-cli/src/target/types.ts`
- Modify: `packages/transone-cli/src/mp/dialect.ts`
- Modify: `packages/transone-cli/src/target/registry.ts`
- Modify: `packages/transone-cli/src/types.ts`
- Modify: `packages/transone-cli/src/config.ts`
- Modify: `packages/transone-cli/src/cli.ts` only if the CLI's supported-target help text is maintained there

**Interfaces:**
- Consumes: `MpDialect`, `MpTarget`, `MpTargetType`, `MP_TARGET_TYPES`, `MP_DIALECTS`, and existing `MiniProgramConfig`.
- Produces: target literal `mp-xiaohongshu`; exported membership in `MP_TARGET_TYPES`; `MP_XIAOHONGSHU_DIALECT`; registry registration; default output `dist/build/mp-xiaohongshu`.

- [ ] Add `mp-xiaohongshu` to `TARGET_TYPES` and `MP_TARGET_TYPES`, and update target comments/help/error text and `MP_DEFAULT_OUT_DIRS`.
- [ ] Add `MP_XIAOHONGSHU_DIALECT` with `.xhsml` templates, `.css` styles, `app.css`, `xhs:` directives, `bind`/`catch` event binding, `project.config.json`, multi-page Mini Program project metadata, XHS-compatible app defaults, and component metadata that supports the existing component/slot pipeline.
- [ ] Export the dialect in `MP_DIALECTS` and register `mpXiaohongshuTarget` with `TargetRegistry` using the existing shared `MpTarget` implementation.
- [ ] Extend config-map recognition/documentation to accept `mp-xiaohongshu`, retaining flat-config backward compatibility and existing per-target selection semantics.
- [ ] Run `bunx tsc --project packages/transone-cli/tsconfig.json --noEmit` and `git diff --check`.

### Task 2: Add Counter configuration and a Xiaohongshu build command

**Files:**
- Modify: `playground/counter/transone.config.ts`
- Modify: `playground/counter/package.json`

**Interfaces:**
- Consumes: the registered CLI target and existing Counter `mp` map / `build:*` scripts.
- Produces: `mp['mp-xiaohongshu']` platform configuration and `build:xiaohongshu` script invoking `transone build --target mp-xiaohongshu`.

- [ ] Add a Xiaohongshu-specific Counter `mp` entry with the shared demo title and a placeholder/default app ID only; do not invent a real Xiaohongshu App ID.
- [ ] Add the `build:xiaohongshu` script following the existing environment sanitization used by the other mini-program scripts.
- [ ] Confirm script and target names match exactly and `playground/counter/transone.config.ts` still has the same `/` and `/about` route definitions.

### Task 3: Update CLI platform documentation

**Files:**
- Modify: `packages/transone-cli/README.md`
- Modify: `packages/transone-cli/README.zh-CN.md`

**Interfaces:**
- Consumes: final target IDs, output extensions, build command, and config-map key from Tasks 1–2.
- Produces: synchronized English and Chinese target lists, status table, configuration example, and Counter build command.

- [ ] Add `mp-xiaohongshu` to the supported target list and describe its XHSML/CSS project output as implemented.
- [ ] Update the Chinese roadmap text that still describes existing implemented mini-program targets as unimplemented.
- [ ] Document the Counter command `bun run --cwd playground/counter build:xiaohongshu` and generated directory.
- [ ] Run `git diff --check` and inspect that English/Chinese target lists agree.

### Task 4: Build and inspect all Counter mini-program outputs

**Files:**
- Generated: `playground/counter/dist/build/mp-weixin/`
- Generated: `playground/counter/dist/build/mp-alipay/`
- Generated: `playground/counter/dist/build/mp-bytedance/`
- Generated: `playground/counter/dist/build/mp-xiaohongshu/`

**Interfaces:**
- Consumes: completed target/dialect and Counter script/configuration from Tasks 1–2.
- Produces: four independently generated Counter project directories, including `/` and `/about` for each.

- [ ] Inspect the four exact output directories before building; verify each is a generated target directory and identify any user-created contents before allowing the build pipeline to replace it.
- [ ] Run `bun run --cwd packages/transone-cli build` to prevent stale workspace CLI artifacts from being used by Counter scripts.
- [ ] Run `bun run --cwd playground/counter build:weixin`, `bun run --cwd playground/counter build:alipay`, `bun run --cwd playground/counter build:bytedance`, and `bun run --cwd playground/counter build:xiaohongshu`.
- [ ] Verify every output has `app.json`, `app.js`, the correct global stylesheet, and `pages/index` plus `pages/about` JS/JSON/template/style files.
- [ ] Verify the respective template/style endings are `.wxml`/`.wxss`, `.axml`/`.acss`, `.ttml`/`.ttss`, and `.xhsml`/`.css`; verify Xiaohongshu uses `xhs:` directives, Xiaohongshu event bindings, and Mini Program—not Mini Widget—metadata.
- [ ] Run `bunx tsc --project packages/transone-cli/tsconfig.json --noEmit` and `git diff --check`; report source generation separately from developer-tool/device runtime validation.

## Self-Review

- **Spec coverage:** framework target/dialect/registry/config is Task 1; Counter config/command is Task 2; CLI docs are Task 3; four-target generation and acceptance inspection are Task 4.
- **Completeness scan:** every step names files, symbols or command lines, and concrete expected output; no unresolved design decisions remain in the implementation steps.
- **Type consistency:** the target ID is consistently `mp-xiaohongshu`; the dialect export and target constructor names are consistently `MP_XIAOHONGSHU_DIALECT` and `mpXiaohongshuTarget`.
- **Review focus coverage:** target membership and config-map recognition are covered in Task 1; widget-vs-program mode and route preservation are covered in Tasks 1 and 4; dialect output separation is checked in Task 4; stale CLI and overwrite scope are addressed in Task 4.
