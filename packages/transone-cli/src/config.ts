import type { TargetType } from './target/types';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMpTargetType, isTargetType, MP_TARGET_TYPES } from './target/types';
import type {
  BuildConfig,
  LibraryConfig,
  MiniProgramConfig,
  MiniProgramConfigMap,
  ProxyOptions,
  ResolveConfigOptions,
  ResolvedConfig,
  ResolvedLibraryConfig,
  ResolvedMiniProgramConfig,
  ServerConfig,
  UserConfig,
  UserMiniProgramConfig,
} from './types';

interface MergedConfig {
  entry: string;
  pages?: Record<string, string>;
  server: {
    host: string;
    port: number;
    proxy: Record<string, string | ProxyOptions>;
  };
  build: {
    outDir: string;
    basePath: string;
    directoryPages: boolean;
  };
  library?: LibraryConfig;
  mp?: UserMiniProgramConfig;
}

type ConfigFileLoadResult =
  { exists: false } | { exists: true; config: unknown };

const DEFAULT_CONFIG: MergedConfig = {
  entry: 'src/main.ts',
  server: {
    host: '127.0.0.1',
    port: 52211,
    proxy: {},
  },
  build: {
    outDir: 'dist/build/h5',
    basePath: '',
    directoryPages: false,
  },
};

export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

export async function resolveConfig(
  options: ResolveConfigOptions = {}
): Promise<ResolvedConfig> {
  const root = resolve(options.root ?? process.cwd());
  const configFile = resolve(root, 'transone.config.ts');
  const hasInlineConfig = options.config !== undefined;
  const loadedConfig: ConfigFileLoadResult = hasInlineConfig
    ? { exists: false }
    : await loadConfigFile(configFile);
  let fileConfig: UserConfig = {};
  if (loadedConfig.exists) {
    const config = loadedConfig.config;
    validateUserConfig(config);
    fileConfig = config;
  }
  if (hasInlineConfig) {
    validateUserConfig(options.config);
  }
  const inlineOverrides = toInlineOverrides(options);
  validateUserConfig(inlineOverrides);
  const config = mergeConfig(fileConfig, options.config ?? {}, inlineOverrides);

  const entry = resolve(root, config.entry);
  if (!existsSync(entry) && !config.library) {
    throw new Error(`Entry file does not exist: ${entry}`);
  }
  const pages = await resolvePages(root, entry, config.pages);
  const target = resolveTarget(options.target);
  // 按当前 target 挑选小程序配置：扁平配置对所有 mp 目标生效，
  // 按平台分组（mp['mp-weixin'] 等）时只取对应平台。
  const mpConfig = pickMpConfig(config.mp, target);
  const mpPages = mpConfig?.pages
    ? await resolvePages(root, entry, mpConfig.pages, {
        includeEntry: false,
        allowRoot: true,
      })
    : pages;
  // --target mp-weixin 时启用小程序构建；config.mp 缺失则走默认值
  // （touristappid / dist/build/mp-weixin / pages 复用 config.pages）。
  const mpEnabled = config.mp !== undefined || target === 'mp-weixin';

  return {
    root,
    ...(loadedConfig.exists ? { configFile } : {}),
    entry,
    pages,
    target,
    server: {
      host: config.server.host,
      port: config.server.port,
      proxy: config.server.proxy,
    },
    build: {
      outDir: resolve(root, config.build.outDir),
      basePath: normalizeBasePath(config.build.basePath),
      directoryPages: config.build.directoryPages,
    },
    ...(config.library
      ? { library: resolveLibrary(root, config.library) }
      : {}),
    ...(mpEnabled
      ? {
          mp: resolveMiniProgram(
            root,
            options.mpOutDir,
            mpConfig ?? {},
            mpPages,
            target
          ),
        }
      : {}),
  };
}

const MP_DEFAULT_OUT_DIRS: Record<string, string> = {
  'mp-weixin': 'dist/build/mp-weixin',
  'mp-alipay': 'dist/build/mp-alipay',
  'mp-bytedance': 'dist/build/mp-bytedance',
};

/**
 * mp 字段是否为按平台分组写法（含 'mp-weixin' / 'mp-alipay' / 'mp-bytedance' 任一键）。
 * 扁平配置的字段均为驼峰命名，与平台键不冲突，可安全区分。
 */
function isMpConfigMap(value: unknown): value is MiniProgramConfigMap {
  return (
    isRecord(value) &&
    MP_TARGET_TYPES.some((platform) => platform in value)
  );
}

/** 取当前 target 对应的小程序配置：扁平配置对所有 mp 目标生效；分组配置只取对应平台。 */
function pickMpConfig(
  mp: UserMiniProgramConfig | undefined,
  target: TargetType
): MiniProgramConfig | undefined {
  if (mp === undefined) {
    return undefined;
  }
  if (isMpConfigMap(mp)) {
    return isMpTargetType(target) ? mp[target] : undefined;
  }
  return mp;
}

function resolveMiniProgram(
  root: string,
  outDirOverride: string | undefined,
  mp: MiniProgramConfig,
  pages: Record<string, string>,
  target: TargetType
): ResolvedMiniProgramConfig {
  return {
    appId: mp.appId ?? 'touristappid',
    outDir: resolve(
      root,
      outDirOverride ?? mp.outDir ?? (MP_DEFAULT_OUT_DIRS[target] ?? 'dist/build/mp-weixin')
    ),
    navigationBarTitleText: mp.navigationBarTitleText ?? 'TransOne',
    pages,
    ...(mp.window !== undefined ? { window: mp.window } : {}),
    ...(mp.tabBar !== undefined ? { tabBar: mp.tabBar } : {}),
    ...(mp.appExtra !== undefined ? { appExtra: mp.appExtra } : {}),
    ...(mp.pageExtra !== undefined ? { pageExtra: mp.pageExtra } : {}),
    lengthUnit: mp.lengthUnit ?? 'px',
    publicDir: resolve(root, mp.publicDir ?? 'public'),
    ...(mp.globalData !== undefined ? { globalData: mp.globalData } : {}),
  };
}

function resolveLibrary(
  root: string,
  library: LibraryConfig
): ResolvedLibraryConfig {
  return {
    entry: resolve(root, library.entry ?? 'src/index.ts'),
    outDir: resolve(root, library.outDir ?? 'dist'),
    external: library.external ?? [],
    tsconfigs: (library.tsconfigs ?? ['tsconfig.build.json']).map((path) =>
      resolve(root, path)
    ),
    dts: library.dts ?? true,
    splitting: library.splitting ?? true,
    sourcemap: library.sourcemap ?? true,
    minify: library.minify,
  };
}

function normalizeBasePath(base: string | undefined): string {
  const trimmed = (base ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

function resolveTarget(target: unknown): ResolvedConfig['target'] {
  if (target === undefined) {
    return 'web';
  }
  if (isTargetType(target)) {
    return target;
  }
  throw new Error(
    `Unknown build target "${String(target)}". ` +
      'Available targets: web, mp-weixin, mp-alipay, mp-bytedance, ' +
      'app-ios, app-android, app-harmony.'
  );
}

async function resolvePages(
  root: string,
  entry: string,
  pages: Record<string, string> | undefined,
  options: { includeEntry?: boolean; allowRoot?: boolean } = {}
): Promise<Record<string, string>> {
  const resolved: Record<string, string> =
    options.includeEntry === false ? {} : { '/': entry };
  for (const [route, pageEntry] of Object.entries(pages ?? {})) {
    const normalized = normalizePageRoute(route, options.allowRoot);
    const absolute = resolve(root, pageEntry);
    if (!existsSync(absolute)) {
      throw new Error(
        `Page entry file does not exist for "${normalized}": ${absolute}`
      );
    }
    resolved[normalized] = absolute;
  }
  return resolved;
}

function normalizePageRoute(
  route: string,
  allowRoot = false
): string {
  if (route === '/') {
    if (allowRoot) {
      return '/';
    }
    throw new Error(
      'Config pages must not redefine the root page "/"; use config.entry instead'
    );
  }
  const normalized = route.replace(/\/+$/, '');
  if (normalized === '') {
    throw new Error(`Page route must not be empty: ${route}`);
  }
  return normalized;
}

let configLoadSequence = 0;

async function loadConfigFile(
  configFile: string
): Promise<ConfigFileLoadResult> {
  if (!existsSync(configFile)) {
    return { exists: false };
  }

  configLoadSequence += 1;
  const module = await import(
    `${configFile}?transone_config=${configLoadSequence}`
  );
  return { exists: true, config: module.default };
}

function toInlineOverrides(options: ResolveConfigOptions): UserConfig {
  const server: ServerConfig = {};
  const build: BuildConfig = {};

  if (options.host !== undefined) {
    server.host = options.host;
  }
  if (options.port !== undefined) {
    server.port = options.port;
  }
  if (options.outDir !== undefined) {
    build.outDir = options.outDir;
  }
  if (options.base !== undefined) {
    build.basePath = options.base;
  }

  return {
    ...(Object.keys(server).length > 0 ? { server } : {}),
    ...(Object.keys(build).length > 0 ? { build } : {}),
  };
}

function mergeConfig(...configs: UserConfig[]): MergedConfig {
  return configs.reduce<MergedConfig>((merged, config) => {
    const server = config.server;
    const build = config.build;

    return {
      entry: config.entry ?? merged.entry,
      pages: config.pages ?? merged.pages,
      server: {
        host: server?.host ?? merged.server.host,
        port: server?.port ?? merged.server.port,
        proxy: {
          ...merged.server.proxy,
          ...server?.proxy,
        },
      },
      build: {
        outDir: build?.outDir ?? merged.build.outDir,
        basePath: build?.basePath ?? merged.build.basePath,
        directoryPages: build?.directoryPages ?? merged.build.directoryPages,
      },
      library: config.library ?? merged.library,
      mp: config.mp ?? merged.mp,
    };
  }, DEFAULT_CONFIG);
}

function validateUserConfig(config: unknown): asserts config is UserConfig {
  assertRecord(config, 'Config');

  if (config.entry !== undefined && typeof config.entry !== 'string') {
    throw new Error('Config entry must be a string');
  }
  if (config.pages !== undefined) {
    validatePagesConfig(config.pages);
  }
  if (config.server !== undefined) {
    validateServerConfig(config.server);
  }
  if (config.build !== undefined) {
    validateBuildConfig(config.build);
  }
  if (config.library !== undefined) {
    validateLibraryConfig(config.library);
  }
  if (config.mp !== undefined) {
    validateMpConfig(config.mp);
  }
}

/**
 * 校验 mp 字段：扁平单一配置，或按平台分组（每项都是一个平台配置）。
 */
function validateMpConfig(
  mp: unknown
): asserts mp is UserMiniProgramConfig {
  assertRecord(mp, 'Config mp');
  if (isMpConfigMap(mp)) {
    for (const platform of MP_TARGET_TYPES) {
      const platformConfig = mp[platform];
      if (platformConfig !== undefined) {
        validateMiniProgramConfig(platformConfig, `Config mp.${platform}`);
      }
    }
    return;
  }
  validateMiniProgramConfig(mp, 'Config mp');
}

function validateMiniProgramConfig(
  mp: unknown,
  label: string
): asserts mp is MiniProgramConfig {
  assertRecord(mp, label);

  for (const key of ['appId', 'outDir', 'navigationBarTitleText', 'publicDir'] as const) {
    if (mp[key] !== undefined && typeof mp[key] !== 'string') {
      throw new Error(`${label}.${key} must be a string`);
    }
  }
  if (mp.pages !== undefined) {
    validatePagesConfig(mp.pages, `${label}.pages`);
  }
  for (const key of ['window', 'tabBar', 'appExtra', 'globalData'] as const) {
    if (mp[key] !== undefined) {
      assertRecord(mp[key], `${label}.${key}`);
    }
  }
  if (mp.pageExtra !== undefined) {
    assertRecord(mp.pageExtra, `${label}.pageExtra`);
    for (const [route, extra] of Object.entries(mp.pageExtra)) {
      assertRecord(extra, `${label}.pageExtra.${route}`);
    }
  }
  if (
    mp.lengthUnit !== undefined &&
    mp.lengthUnit !== 'px' &&
    mp.lengthUnit !== 'rpx'
  ) {
    throw new Error(`${label}.lengthUnit must be 'px' or 'rpx'`);
  }
}

function validateLibraryConfig(
  library: unknown
): asserts library is LibraryConfig {
  assertRecord(library, 'Config library');
  if (library.entry !== undefined && typeof library.entry !== 'string') {
    throw new Error('Config library.entry must be a string');
  }
  if (library.outDir !== undefined && typeof library.outDir !== 'string') {
    throw new Error('Config library.outDir must be a string');
  }
  if (library.external !== undefined) {
    assertStringArray(library.external, 'Config library.external');
  }
  if (library.tsconfigs !== undefined) {
    assertStringArray(library.tsconfigs, 'Config library.tsconfigs');
  }
  for (const key of ['dts', 'splitting', 'sourcemap', 'minify'] as const) {
    if (library[key] !== undefined && typeof library[key] !== 'boolean') {
      throw new Error(`Config library.${key} must be a boolean`);
    }
  }
}

function assertStringArray(value: unknown, name: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings`);
  }
}

function validatePagesConfig(
  pages: unknown,
  label = 'Config pages'
): asserts pages is Record<string, string> {
  assertRecord(pages, label);

  for (const [route, entry] of Object.entries(pages)) {
    if (!route.startsWith('/')) {
      throw new Error(`Page route must start with "/": ${route}`);
    }
    if (typeof entry !== 'string') {
      throw new Error(`Page entry for "${route}" must be a string`);
    }
  }
}

function validateServerConfig(server: unknown): asserts server is ServerConfig {
  assertRecord(server, 'Config server');

  if (server.host !== undefined && typeof server.host !== 'string') {
    throw new Error('Config server.host must be a string');
  }
  const port = server.port;
  if (
    port !== undefined &&
    (typeof port !== 'number' ||
      !Number.isInteger(port) ||
      port < 0 ||
      port > 65535)
  ) {
    throw new Error(
      'Config server.port must be an integer between 0 and 65535'
    );
  }
  if (server.proxy === undefined) {
    return;
  }
  assertRecord(server.proxy, 'Config server.proxy');

  for (const [prefix, value] of Object.entries(server.proxy)) {
    if (!prefix.startsWith('/')) {
      throw new Error(`Proxy prefix must start with "/": ${prefix}`);
    }

    const target = getProxyTarget(value);
    validateProxyTarget(target);
  }
}

function validateBuildConfig(build: unknown): asserts build is BuildConfig {
  assertRecord(build, 'Config build');
  if (build.outDir !== undefined && typeof build.outDir !== 'string') {
    throw new Error('Config build.outDir must be a string');
  }
  if (build.basePath !== undefined && typeof build.basePath !== 'string') {
    throw new Error('Config build.basePath must be a string');
  }
  if (
    build.directoryPages !== undefined &&
    typeof build.directoryPages !== 'boolean'
  ) {
    throw new Error('Config build.directoryPages must be a boolean');
  }
}

function getProxyTarget(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  assertRecord(value, 'Proxy options');
  if (typeof value.target !== 'string') {
    throw new Error('Proxy target must be a string');
  }
  if (
    value.changeOrigin !== undefined &&
    typeof value.changeOrigin !== 'boolean'
  ) {
    throw new Error('Proxy changeOrigin must be a boolean');
  }
  if (value.rewrite !== undefined && typeof value.rewrite !== 'function') {
    throw new Error('Proxy rewrite must be a function');
  }

  return value.target;
}

function validateProxyTarget(target: string): void {
  try {
    const url = new URL(target);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return;
    }
  } catch {
    // Keep the public error stable for malformed URLs and unsupported protocols.
  }

  throw new Error(`Proxy target must use http or https: ${target}`);
}

function assertRecord(
  value: unknown,
  name: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
