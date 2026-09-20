# 发布

发布命令可针对不同的包执行，默认发布 transone + transone-cli（版本同步）。

```bash
bun run release                        # 默认：transone + transone-cli 版本同步，patch 升版 + 构建 + 发布
bun run release --bump minor           # 指定 major | minor | patch
bun run release --pkg transone         # 只发布框架 transone（同步脚手架中的框架版本引用）
bun run release --pkg transone-cli     # 只发布编译器 transone-cli
bun run release --pkg transone-ui      # 只发布组件库 transone-ui
bun run release --pkg transone-chart   # 只发布图表库 transone-chart
bun run release --pkg transone,transone-ui --bump minor   # 指定多个包，各自独立升版
bun run release --no-publish           # 只升版 + 构建
bun run release --dry-run              # 演练，不落盘
```

- 不指定 `--pkg` 时，transone 与 transone-cli 版本保持同步，以框架当前版本为基准升版。
- 指定 `--pkg` 时，被选中的包基于自身当前版本独立升版，只同步与该包相关的版本引用。
- 发布顺序固定为 transone → transone-cli → transone-ui → transone-chart（编译器依赖框架，组件库/图表库依赖框架）。
