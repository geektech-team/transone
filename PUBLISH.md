bun run release                  # 默认 patch 升版 + 构建 + 发布两个包
bun run release --bump minor     # 指定 major | minor | patch
bun run release --no-publish     # 只升版 + 构建
bun run release --dry-run        # 演练，不落盘