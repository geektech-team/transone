export { defineConfig, resolveConfig } from './config';
export { build } from './build';
export { createProject } from './create';
export type { CreateProjectOptions, CreateProjectResult } from './create';
export { startDevServer } from './server';
export type { StartDevServerOptions } from './server';
export type {
  BuildOptions,
  BuildResult,
  BuildConfig,
  LibraryConfig,
  MiniProgramConfig,
  MiniProgramConfigMap,
  ResolvedLibraryConfig,
  ProxyOptions,
  ResolveConfigOptions,
  ResolvedConfig,
  ServerConfig,
  UserConfig,
  UserMiniProgramConfig,
  MpTargetType,
  TargetType,
} from './types';
export { TARGET_TYPES, MP_TARGET_TYPES, isTargetType, isMpTargetType } from './target/types';
export type { BuildTarget } from './target/types';
export { targetRegistry, TargetRegistry } from './target/registry';
export { WebTarget } from './target/web-target';
export { MpTarget, mpWeixinTarget, mpAlipayTarget, mpBytedanceTarget } from './target/mp-target';
export { PlaceholderTarget } from './target/placeholder-target';
