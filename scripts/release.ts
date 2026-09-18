#!/usr/bin/env bun
/**
 * TransOne monorepo 一键发布脚本：版本更新 → 构建 → 发布。
 *
 * 在仓库根目录使用：
 *   bun run release                     # 默认 patch 升版 + 构建 + 发布两个包
 *   bun run release --bump minor        # 指定 major | minor | patch
 *   bun run release --no-publish        # 只升版本 + 构建，不发布
 *   bun run release --dry-run           # 演练：只打印将要执行的步骤，不写入、不发布
 *
 * 说明：
 *   - transone（框架）与 transone-cli（编译器）版本保持同步：以框架当前版本为基准
 *     升版，两个包写入同一新版本号，同时同步源码中的硬编码版本引用：
 *       packages/transone/lib/index.ts        export const version
 *       packages/transone/lib/core/app.ts      version: '...'
 *       packages/transone-cli/src/create.ts    TRANSONE_FRAMEWORK_VERSION / TRANSONE_CLI_VERSION
 *   - 发布顺序固定为 transone → transone-cli（编译器依赖框架）。
 *   - 发布使用 Bun 原生 `bun publish`，需要已登录 npm（bun pm whoami 校验）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');

const PACKAGES = [
  { key: 'transone', dir: 'packages/transone', name: 'transone' },
  {
    key: 'transone-cli',
    dir: 'packages/transone-cli',
    name: 'transone-cli',
  },
] as const;

const BUMP_TYPES = ['major', 'minor', 'patch'] as const;
type BumpType = (typeof BUMP_TYPES)[number];

interface CliArgs {
  bump: BumpType;
  publish: boolean;
  dryRun: boolean;
}

function printHelp(): void {
  console.log(
    [
      '用法：bun run release [--bump <major|minor|patch>] [--no-publish] [--dry-run]',
      '',
      '  --bump <major|minor|patch>  升级版本号（默认 patch）',
      '  --no-publish                升版本 + 构建，但不发布',
      '  --dry-run                   演练模式：不写入任何文件、不构建、不发布',
      '',
      '示例：',
      '  bun run release                  # patch 升版 + 构建 + 发布',
      '  bun run release --bump minor     # minor 升版 + 构建 + 发布',
      '  bun run release --dry-run        # 演练',
    ].join('\n')
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { bump: 'patch', publish: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--bump': {
        const value = argv[++i];
        if (!value || !(BUMP_TYPES as readonly string[]).includes(value)) {
          fail(`--bump 需要 major | minor | patch，收到：${value}`);
        }
        args.bump = value as BumpType;
        break;
      }
      case '--no-publish':
        args.publish = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        fail(`未知参数：${arg}`);
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(`错误：${message}`);
  console.error('');
  printHelp();
  process.exit(1);
}

function readManifest(dir: string): { name: string; version: string } {
  const path = join(REPO_ROOT, dir, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as {
    name: string;
    version: string;
  };
}

function bumpVersion(version: string, type: BumpType): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`无法解析语义化版本号：${version}`);
  }
  const [major, minor, patch] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function runBun(args: string[], cwd: string): void {
  const result = spawnSync('bun', args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

interface SyncTarget {
  file: string;
  from: string;
  to: string;
}

function syncFile(target: SyncTarget, dryRun: boolean): void {
  const abs = join(REPO_ROOT, target.file);
  if (!existsSync(abs)) {
    fail(`同步失败：文件不存在 ${target.file}`);
  }
  const content = readFileSync(abs, 'utf8');
  if (!content.includes(target.from)) {
    fail(`同步失败：${target.file} 中未找到「${target.from}」`);
  }
  if (dryRun) {
    console.log(`  [dry-run] ${target.file}`);
    console.log(`      ${target.from} -> ${target.to}`);
    return;
  }
  writeFileSync(abs, content.split(target.from).join(target.to));
  console.log(`  已更新 ${target.file}`);
  console.log(`      ${target.from} -> ${target.to}`);
}

/** 两个包同步写入同一新版本，并同步源码中的硬编码版本引用。 */
function syncForBump(
  oldVersion: string,
  newVersion: string,
  dryRun: boolean
): void {
  const targets: SyncTarget[] = [
    {
      file: 'packages/transone/package.json',
      from: `"version": "${oldVersion}"`,
      to: `"version": "${newVersion}"`,
    },
    {
      file: 'packages/transone/lib/index.ts',
      from: `export const version = '${oldVersion}'`,
      to: `export const version = '${newVersion}'`,
    },
    {
      file: 'packages/transone/lib/core/app.ts',
      from: `version: '${oldVersion}',`,
      to: `version: '${newVersion}',`,
    },
    {
      file: 'packages/transone-cli/package.json',
      from: `"version": "${oldVersion}"`,
      to: `"version": "${newVersion}"`,
    },
    {
      file: 'packages/transone-cli/src/create.ts',
      from: `export const TRANSONE_FRAMEWORK_VERSION = '${oldVersion}'`,
      to: `export const TRANSONE_FRAMEWORK_VERSION = '${newVersion}'`,
    },
    {
      file: 'packages/transone-cli/src/create.ts',
      from: `export const TRANSONE_CLI_VERSION = '${oldVersion}'`,
      to: `export const TRANSONE_CLI_VERSION = '${newVersion}'`,
    },
  ];

  for (const target of targets) {
    syncFile(target, dryRun);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const framework = PACKAGES[0];
  const cli = PACKAGES[1];
  const frameworkManifest = readManifest(framework.dir);
  const cliManifest = readManifest(cli.dir);
  const oldVersion = frameworkManifest.version;

  if (cliManifest.version !== oldVersion) {
    console.log(
      `提示：${cli.name} 当前版本 ${cliManifest.version} 与 ${framework.name} 的 ${oldVersion} 不一致，将一并同步为 ${oldVersion} 的下一版本。`
    );
  }

  const newVersion = bumpVersion(oldVersion, args.bump);
  console.log(
    `目标：${framework.name} + ${cli.name}（版本同步）  当前：${oldVersion} -> 新版本：${newVersion}（${args.bump}）`
  );
  if (args.dryRun) {
    console.log('[演练模式 --dry-run，不会写入、构建或发布]');
  }

  console.log('\n== 1/3 升级版本号 ==');
  syncForBump(oldVersion, newVersion, args.dryRun);
  if (args.dryRun) {
    console.log('  [dry-run] 运行 bun install 同步 lockfile');
  } else {
    console.log('  运行 bun install 同步 lockfile…');
    runBun(['install'], REPO_ROOT);
    console.log('  版本升级完成。');
  }

  console.log('\n== 2/3 构建（transone → transone-cli）==');
  if (args.dryRun) {
    console.log('  [dry-run] bun run build');
  } else {
    runBun(['run', 'build'], REPO_ROOT);
    console.log('  构建完成。');
  }

  if (args.publish) {
    console.log('\n== 3/3 发布 ==');
    if (args.dryRun) {
      for (const pkg of PACKAGES) {
        console.log(`  [dry-run] bun publish（cwd: ${pkg.dir}）`);
      }
      console.log('\n全部完成。');
      return;
    }
    console.log('  校验 npm 登录状态…');
    const whoami = spawnSync('bun', ['pm', 'whoami'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    if (whoami.status !== 0 || !whoami.stdout.trim()) {
      fail('未登录 npm，无法发布。请先执行 bun login 后重试。');
    }
    console.log(`  已登录：${whoami.stdout.trim()}`);
    for (const pkg of PACKAGES) {
      console.log(`  发布 ${pkg.name}…`);
      runBun(['publish'], join(REPO_ROOT, pkg.dir));
    }
    console.log('\n全部完成。');
  } else {
    console.log('\n已跳过发布（--no-publish）。全部完成。');
  }
}

main();
