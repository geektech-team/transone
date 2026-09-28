# Xiaohongshu Mini Program Target Design

## Outcome

Add first-class framework generation for Xiaohongshu Mini Programs and make the Counter playground generate a native project for each supported mini-program target: WeChat, Alipay, ByteDance, and Xiaohongshu.

## Scope and terminology

The new target is the Xiaohongshu Mini Program (`mp-xiaohongshu`), not the separate Xiaohongshu Mini Widget product. It uses the shared static mini-program compiler and must retain regular multi-page app behavior; it must not emit Mini Widget-only settings or one-page restrictions.

The existing Web and three mini-program targets remain behaviorally unchanged. This work does not add Xiaohongshu runtime APIs, login/payment integrations, publishing/upload automation, or a Mini Widget target.

## Architecture

Register `mp-xiaohongshu` as a `MpTarget` backed by an independent `MpDialect`. Keep AST analysis, template generation, style generation, JavaScript generation, resource copying, and output lifecycle shared with the existing mini-program pipeline. Put Xiaohongshu-specific file suffixes, directive prefixes, event bindings, project configuration, app configuration, and component metadata in its dialect rather than adding Xiaohongshu branches throughout the compiler.

The dialect will emit `.xhsml` page/component templates, `.css` page/component styles and `app.css`, and use the Xiaohongshu `xhs:` template directive prefix. It will use Xiaohongshu's project configuration filename and mini-program compile mode, preserve the configured app ID/title/pages, and use the platform's event-binding convention. The documented output distinction is sufficient for generation; target-specific runtime APIs remain out of scope.

Expose the target in `TargetType`, `MpTargetType`, target validation, target error/help text, config-map discrimination, default output resolution (`dist/build/mp-xiaohongshu`), and target registration. `MiniProgramConfig` remains shared and backward-compatible. Counter configuration adds a platform-specific entry and `build:xiaohongshu` script; generated output stays under `playground/counter/dist/build/mp-xiaohongshu`.

## Compatibility and behavior

- Preserve existing target IDs, defaults, output layouts, file contents, and app configuration.
- Continue supporting both flat `mp` configuration and per-target maps; selecting one platform's settings must not change another platform's settings.
- Reuse the shared route and AST pipeline so Counter's `/` and `/about` pages are both emitted for Xiaohongshu.
- Keep dialect differences data-driven and local to `MpDialect` wherever the existing interface can represent them.
- Generate a normal Mini Program project, not a Mini Widget project.

## Generation contract

`transone build --target mp-xiaohongshu` must produce a project directory containing app-level config/logic/style files, all configured pages with `.js`, `.json`, `.xhsml`, and `.css` files, and per-page component registrations as appropriate. Platform templates must use `xhs:` directives, Xiaohongshu event bindings, and no WeChat/Alipay/ByteDance-specific template/style suffixes. The project metadata must identify the Mini Program compile mode, not Mini Widget mode.

Counter must expose `build:xiaohongshu`, and all four mini-program scripts must successfully generate their target-specific output directories from the same app source.

## Validation and acceptance

1. Type-check and build `packages/transone-cli` so the playground uses the current compiler.
2. Generate Counter for `mp-weixin`, `mp-alipay`, `mp-bytedance`, and `mp-xiaohongshu`.
3. Inspect each output for its expected page/style/template extensions and target-specific project metadata; verify Counter routes `/` and `/about` exist in each output.
4. Confirm existing mini-program build behavior and documented target lists include Xiaohongshu without changing existing defaults.
5. Report CLI generation separately from IDE import/runtime validation. Do not claim a Xiaohongshu IDE or device run unless it is actually performed.

## Platform references

- Xiaohongshu Mini Program overview and distinction from Mini Widgets: <https://miniapp.xiaohongshu.com/doc/DC137160> and <https://miniapp.xiaohongshu.com/doc/DC026740>.
- Xiaohongshu Mini Program rendering terminology (XHSML / XHSSS): <https://miniapp.xiaohongshu.com/doc/DC052083>.
- Xiaohongshu Mini Program base component attributes and events: <https://miniapp.xiaohongshu.com/doc/DC298187>.
- Xiaohongshu project/app/page structure and XHSML conventions documented by the platform: <https://miniapp.xiaohongshu.com/doc/DC923374> and <https://miniapp.xiaohongshu.com/doc/DC602239>.
