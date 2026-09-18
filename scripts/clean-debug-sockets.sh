#!/usr/bin/env bash
#
# clean-debug-sockets.sh — 清理 Bun / 调试器残留的 Unix socket 文件
#
# 背景：Bun 的 inspector（调试器）与 VSCode 系 IDE 的调试器会在
#   $TMPDIR（macOS 上为 /var/folders/.../T/）创建 *.sock 文件。
#   调试进程正常退出时应自行清理；异常退出（kill -9、IDE 崩溃）会留下残留。
#   下次以调试模式启动时，bind() 撞上已存在的文件即报
#   EADDRINUSE: address already in use, listen '.../*.sock'。
#
# 安全规则：只删除【没有任何进程占用】的 .sock 文件（lsof 判定）。
#   正在被 VSCode、Bun 或其他程序使用的 socket 一律保留。
#
# 用法：
#   bash scripts/clean-debug-sockets.sh          # 预览（dry-run）
#   bash scripts/clean-debug-sockets.sh --apply   # 实际删除
#
set -uo pipefail

DRY_RUN=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=0
fi

shopt -s nullglob
SOCK_DIRS=(/var/folders/*/*/T)
removed=0
kept=0

for dir in "${SOCK_DIRS[@]}"; do
  for sock in "$dir"/*.sock; do
    # lsof 有输出 => 有进程占用，保留
    if lsof "$sock" >/dev/null 2>&1; then
      kept=$((kept + 1))
      continue
    fi
    if ((DRY_RUN)); then
      echo "[dry-run] 将删除: $sock"
    else
      rm -f "$sock"
      echo "[已删除] $sock"
    fi
    removed=$((removed + 1))
  done
done

echo "----------------------------------------"
echo "无占用残留: $removed 个（$([[ $DRY_RUN -eq 1 ]] && echo '预览模式，加 --apply 执行' || echo '已清理')）"
echo "保留在用:  $kept 个"
