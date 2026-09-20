#!/usr/bin/env bun
/**
 * TransOne monorepo 发布脚本：版本更新 → 构建 → 发布，可针对不同包执行。
 *
 * 在仓库根目录使用：
 *   bun run release                                  # 默认：transone + transone-cli 版本同步，patch 升版 + 构建 + 发布
 *   bun run release --bump minor                     # 指定 major | minor | patch
 *   bun run release --pkg transone-ui                # 只针对指定包执行（可重复 --pkg 或用逗号分隔多个包）
 *   bun run release --no-publish                     # 只升版本 + 构建，不发布
 *   bun run release --dry-run                        # 演练：只打印将要执行的步骤，不写入、不发布
 *
 * 版本策略：
 *   - 不指定 --pkg（默认）：transone（框架）与 transone-cli（编译器）版本保持同步，以框架当前
 *     版本为基准升版，两个包写入同一新版本号，并同步源码中的硬编码版本引用：
 *       packages/transone/lib/index.ts        export const version
 *       packages/transone/lib/core/app.ts      version: '...'
 *       packages/transone-cli/src/create.ts    TRANSONE_FRAMEWORK_VERSION / TRANSONE_CLI_VERSION
 *   - 指定 --pkg：被选中的包各自基于自身当前版本独立升版，只同步与该包相关的版本引用：
 *       transone      发布时同步框架版本引用，以及脚手架中的 TRANSONE_FRAMEWORK_VERSION
 *       transone-cli  发布时同步 TRANSONE_CLI_VERSION
 *       transone-ui   仅升版自身 package.json
 *       transone-chart 仅升版自身 package.json
 *   - 发布顺序固定为 transone → transone-cli → transone-ui → transone-chart
 *     （编译器依赖框架，组件库依赖框架，图表库 peer 依赖框架）。
 *   - 发布使用 Bun 原生 `bun publish`，需要已登录 npm（bun pm whoami 校验）。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');

const PACKAGES = [
  { key: 'transone', dir: 'packages/transone', name: 'transone' },
  {
    key: 'transone-cli',
    dir: 'packages/transone-cli',
    name: 'transone-cli',
  },
  { key: 'transone-ui', dir: 'packages/transone-ui', name: 'transone-ui' },
  {
    key: 'transone-chart',
    dir: 'packages/transone-chart',
    name: 'transone-chart',
  },
] as const;

type PackageKey = (typeof PACKAGES)[number]['key'];

const BUMP_TYPES = ['major', 'minor', 'patch'] as const;
type BumpType = (typeof BUMP_TYPES)[number];

/** 默认发布目标：框架 + 编译器（版本同步）。 */
const DEFAULT_TARGETS: PackageKey[] = ['transone', 'transone-cli'];

interface CliArgs {
  bump: BumpType;
  publish: boolean;
  dryRun: boolean;
  /** null 表示使用默认目标（transone + transone-cli 版本同步）。 */
  targets: PackageKey[] | null;
}

function printHelp(): void {
  console.log(
    [
      '用法：bun run release [--pkg <包名>…] [--bump <major|minor|patch>] [--no-publish] [--dry-run]',
      '',
      '  --pkg <包名>…              只针对指定包升版 + 构建 + 发布',
      '                             可重复传参或用逗号分隔多个包',
      '                             可选：transone | transone-cli | transone-ui | transone-chart',
      '                             默认（不传）：transone + transone-cli 版本同步',
      '  --bump <major|minor|patch>  升级版本号（默认 patch）',
      '  --no-publish                升版本 + 构建，但不发布',
      '  --dry-run                   演练模式：不写入任何文件、不构建、不发布',
      '',
      '示例：',
      '  bun run release                          # transone + transone-cli 版本同步，patch 升版 + 发布',
      '  bun run release --bump minor             # minor 升版 + 发布',
      '  bun run release --pkg transone           # 只发布框架 transone',
      '  bun run release --pkg transone-ui        # 只发布组件库 transone-ui',
      '  bun run release --pkg transone-chart     # 只发布图表库 transone-chart',
      '  bun run release --pkg transone,transone-cli --bump minor',
      '  bun run release --pkg transone --dry-run # 演练',
    ].join('\n')
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    bump: 'patch',
    publish: true,
    dryRun: false,
    targets: null,
  };
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
      case '--pkg':
      case '--package': {
        const value = argv[++i];
        if (!value) {
          fail(
            `--pkg 需要包名（${PACKAGES.map((p) => p.key).join(' | ')}）`
          );
        }
        for (const key of value.split(',')) {
          if (!PACKAGES.some((p) => p.key === key)) {
            fail(
              `未知包：${key}（可选：${PACKAGES.map((p) => p.key).join(' | ')}）`
            );
          }
          (args.targets ??= []).push(key);
        }
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

/** 文件内的一个版本引用：用 pattern 定位当前值，替换为 replacement(newVersion)。 */
interface VersionRef {
  file: string;
  pattern: RegExp;
  replacement: (newVersion: string) => string;
  label: string;
}

function manifestRef(dir: string): VersionRef {
  return {
    file: `${dir}/package.json`,
    pattern: /"version": "([^"]+)"/g,
    replacement: (v) => `"version": "${v}"`,
    label: 'package.json 版本号',
  };
}

/** 每个包发布时要同步的版本引用（以正则定位当前值，避免与源码中已漂移的版本冲突）。 */
function refsFor(key: PackageKey): VersionRef[] {
  switch (key) {
    case 'transone':
      return [
        manifestRef('packages/transone'),
        {
          file: 'packages/transone/lib/index.ts',
          pattern: /export const version = '([^']+)'/g,
          replacement: (v) => `export const version = '${v}'`,
          label: 'lib/index.ts 的 version 常量',
        },
        {
          file: 'packages/transone/lib/core/app.ts',
          pattern: /version: '([^']+)',/g,
          replacement: (v) => `version: '${v}',`,
          label: 'lib/core/app.ts 的默认版本',
        },
        {
          file: 'packages/transone-cli/src/create.ts',
          pattern: /export const TRANSONE_FRAMEWORK_VERSION = '([^']+)'/g,
          replacement: (v) =>
            `export const TRANSONE_FRAMEWORK_VERSION = '${v}'`,
          label: 'create.ts 的 TRANSONE_FRAMEWORK_VERSION',
        },
      ];
    case 'transone-cli':
      return [
        manifestRef('packages/transone-cli'),
        {
          file: 'packages/transone-cli/src/create.ts',
          pattern: /export const TRANSONE_CLI_VERSION = '([^']+)'/g,
          replacement: (v) => `export const TRANSONE_CLI_VERSION = '${v}'`,
          label: 'create.ts 的 TRANSONE_CLI_VERSION',
        },
      ];
    case 'transone-ui':
      return [manifestRef('packages/transone-ui')];
    case 'transone-chart':
      return [manifestRef('packages/transone-chart')];
  }
}

function syncRef(ref: VersionRef, newVersion: string, dryRun: boolean): void {
  const abs = join(REPO_ROOT, ref.file);
  const content = readFileSync(abs, 'utf8');
  const match = ref.pattern.exec(content);
  if (!match) {
    fail(`同步失败：${ref.file} 中未找到「${ref.label}」`);
  }
  const oldVersion = match[1];
  if (oldVersion === newVersion) {
    console.log(`  ${ref.file}（${ref.label}）已是 ${newVersion}，跳过。`);
    return;
  }
  if (dryRun) {
    console.log(`  [dry-run] ${ref.file}`);
    console.log(`      ${oldVersion} -> ${newVersion}`);
    return;
  }
  writeFileSync(abs, content.replace(ref.pattern, () => ref.replacement(newVersion)));
  console.log(`  已更新 ${ref.file}`);
  console.log(`      ${oldVersion} -> ${newVersion}`);
}

function syncLockfile(dryRun: boolean): void {
  if (dryRun) {
    console.log('  [dry-run] 运行 bun install 同步 lockfile');
    return;
  }
  console.log('  运行 bun install 同步 lockfile…');
  runBun(['install'], REPO_ROOT);
  console.log('  版本升级完成。');
}

/** 默认模式：transone + transone-cli 版本同步，构建并发布两个包。 */
function releaseDefaultPair(args: CliArgs): void {
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
  for (const key of DEFAULT_TARGETS) {
    for (const ref of refsFor(key)) {
      syncRef(ref, newVersion, args.dryRun);
    }
  }
  syncLockfile(args.dryRun);

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
      for (const key of DEFAULT_TARGETS) {
        const pkg = PACKAGES.find((p) => p.key === key)!;
        console.log(`  [dry-run] bun publish（cwd: ${pkg.dir}）`);
      }
      console.log('\n全部完成。');
      return;
    }
    publishAll(DEFAULT_TARGETS);
    console.log('\n全部完成。');
  } else {
    console.log('\n已跳过发布（--no-publish）。全部完成。');
  }
}

/** 定向模式：被选中的包各自独立升版、构建并发布。 */
function releaseTargeted(args: CliArgs, targets: PackageKey[]): void {
  const selected = PACKAGES.filter((pkg) => targets.includes(pkg.key));
  console.log(`目标：${selected.map((p) => p.name).join(' + ')}（独立升版）`);
  if (args.dryRun) {
    console.log('[演练模式 --dry-run，不会写入、构建或发布]');
  }

  console.log('\n== 1/3 升级版本号 ==');
  for (const pkg of selected) {
    const oldVersion = readManifest(pkg.dir).version;
    const newVersion = bumpVersion(oldVersion, args.bump);
    console.log(`  ${pkg.name}：${oldVersion} -> ${newVersion}（${args.bump}）`);
    for (const ref of refsFor(pkg.key)) {
      syncRef(ref, newVersion, args.dryRun);
    }
  }
  syncLockfile(args.dryRun);

  console.log('\n== 2/3 构建 ==');
  for (const pkg of selected) {
    if (args.dryRun) {
      console.log(`  [dry-run] bun run --cwd ${pkg.dir} build`);
    } else {
      console.log(`  构建 ${pkg.name}…`);
      runBun(['run', '--cwd', pkg.dir, 'build'], REPO_ROOT);
    }
  }
  if (!args.dryRun) {
    console.log('  构建完成。');
  }

  if (!args.publish) {
    console.log('\n已跳过发布（--no-publish）。全部完成。');
    return;
  }
  console.log('\n== 3/3 发布 ==');
  if (args.dryRun) {
    for (const pkg of selected) {
      console.log(`  [dry-run] bun publish（cwd: ${pkg.dir}）`);
    }
    console.log('\n全部完成。');
    return;
  }
  publishAll(targets);
  console.log('\n全部完成。');
}

/** 按 PACKAGES 固定顺序发布目标包（编译器依赖框架，组件库/图表库依赖框架）。 */
function publishAll(targets: PackageKey[]): void {
  console.log('  校验 npm 登录状态…');
  const whoami = spawnSync('bun', ['pm', 'whoami'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (whoami.status !== 0 || !whoami.stdout.trim()) {
    fail('未登录 npm，无法发布。请先执行 bun login 后重试。');
  }
  console.log(`  已登录：${whoami.stdout.trim()}`);
  for (const key of targets) {
    const pkg = PACKAGES.find((p) => p.key === key)!;
    console.log(`  发布 ${pkg.name}…`);
    runBun(['publish'], join(REPO_ROOT, pkg.dir));
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.targets === null) {
    releaseDefaultPair(args);
  } else {
    releaseTargeted(args, args.targets);
  }
}

main();
