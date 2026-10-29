export { defineConfig, resolveConfig } from './config';
export { build } from './build';
export {
  reportComponents,
  formatComponentSelectionReport,
} from './components/report';
export type {
  ComponentReportLocation,
  ComponentReportCandidate,
  ComponentSelectionReportRow,
  ComponentSelectionReport,
} from './components/report';
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
  TargetInput,
  ComponentScanConfig,
} from './types';
export { Platform } from 'transone/platform';
export {
  TARGET_TYPES,
  MP_TARGET_TYPES,
  isTargetType,
  isMpTargetType,
} from './target/types';
export type { BuildTarget } from './target/types';
export { targetRegistry, TargetRegistry } from './target/registry';
export { WebTarget } from './target/web-target';
export {
  MpTarget,
  mpWeixinTarget,
  mpAlipayTarget,
  mpBytedanceTarget,
  mpXiaohongshuTarget,
} from './target/mp-target';
export { PlaceholderTarget } from './target/placeholder-target';
