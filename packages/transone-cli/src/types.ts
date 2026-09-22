import type { AppTargetType, MpTargetType, TargetType } from './target/types';

export type { MpTargetType, TargetType } from './target/types';
export {
  MP_TARGET_TYPES,
  APP_TARGET_TYPES,
  isAppTargetType,
  isMpTargetType,
  isTargetType,
  TARGET_TYPES,
} from './target/types';

/** 原生 App 目标通用配置。 */
export interface AppConfig {
  appName?: string;
  bundleId?: string;
  outDir?: string;
  minPlatformVersion?: string;
  publicDir?: string;
  /** App 专用页面；默认复用顶层 pages。首期仅支持一个页面。 */
  pages?: Record<string, string>;
}

/** 按原生 App 平台分组的配置。 */
export type AppConfigMap = Partial<Record<AppTargetType, AppConfig>>;

export type UserAppConfig = AppConfig | AppConfigMap;

export interface ResolvedAppConfig {
  appName: string;
  bundleId: string;
  outDir: string;
  minPlatformVersion: string;
  publicDir: string;
  pages: Record<string, string>;
}

export interface ProxyOptions {
  target: string;
  changeOrigin?: boolean;
  rewrite?: (path: string) => string;
}

/** 微信小程序目标端配置（--target mp-weixin）。 */
export interface MiniProgramConfig {
  /** 小程序 appid；默认 "touristappid"（微信开发者工具测试号）。 */
  appId?: string;
  /** 小程序产物目录；默认 dist/build/mp-weixin。 */
  outDir?: string;
  /** 全局导航栏标题；默认 "TransOne"。 */
  navigationBarTitleText?: string;
  /** 小程序专用页面路由（route → 入口文件）；默认复用 config.pages。 */
  pages?: Record<string, string>;
  /** 合并进 app.json.window 的字段（如 backgroundTextStyle、navigationBarBackgroundColor）。 */
  window?: Record<string, unknown>;
  /** app.json.tabBar（底部导航，含 list 等完整配置）。 */
  tabBar?: Record<string, unknown>;
  /** 合并进 app.json 的其他顶层字段（subPackages、lazyCodeLoading、permission、usingComponents 等）。 */
  appExtra?: Record<string, unknown>;
  /** 页面级 json 合并：route -> 字段（enablePullDownRefresh、navigationBarTitleText 等）。 */
  pageExtra?: Record<string, Record<string, unknown>>;
  /** 样式数字长度单位：'px'（默认）或 'rpx'（数值按 1px=2rpx 换算输出）。 */
  lengthUnit?: 'px' | 'rpx';
  /** 需要整体复制进产物包的静态资源目录；默认 'public'（不存在则跳过）。 */
  publicDir?: string;
  /** App 全局数据，写入 app.js 的 App({ globalData })。 */
  globalData?: Record<string, unknown>;
}

export interface ResolvedMiniProgramConfig {
  appId: string;
  outDir: string;
  navigationBarTitleText: string;
  pages: Record<string, string>;
  window?: Record<string, unknown>;
  tabBar?: Record<string, unknown>;
  appExtra?: Record<string, unknown>;
  pageExtra?: Record<string, Record<string, unknown>>;
  lengthUnit: 'px' | 'rpx';
  publicDir: string;
  globalData?: Record<string, unknown>;
}

/** 按小程序平台分组的目标端配置：{ 'mp-weixin': {...}, 'mp-alipay': {...} }。 */
export type MiniProgramConfigMap = Partial<Record<MpTargetType, MiniProgramConfig>>;

/**
 * mp 字段的两种写法：
 * - 单一 `MiniProgramConfig`：作用于任意小程序目标（向后兼容，微信单端推荐）；
 * - `MiniProgramConfigMap`：按平台分组，构建时只取当前 target 对应的那份。
 */
export type UserMiniProgramConfig = MiniProgramConfig | MiniProgramConfigMap;

export interface ServerConfig {
  host?: string;
  port?: number;
  proxy?: Record<string, string | ProxyOptions>;
}

export interface BuildConfig {
  outDir?: string;
  /** 部署基础路径（如 GitHub Pages 子路径），默认空字符串表示站点根路径。 */
  basePath?: string;
  /** 为每个页面输出为目录 + index.html（/{route}/index.html），默认输出扁平 {route}.html。 */
  directoryPages?: boolean;
}

/** 库打包配置：`transone build --library` 时使用，产出可发布的 ESM bundle + .d.ts。 */
export interface LibraryConfig {
  /** 库入口（如 lib/index.ts），默认 src/index.ts。 */
  entry?: string;
  /** 库产物目录，默认 dist。 */
  outDir?: string;
  /** 作为外部依赖、不打进 bundle 的包名。 */
  external?: string[];
  /** 依次运行 `tsc --project <path>` 生成 .d.ts 的 tsconfig 列表，默认 ['tsconfig.build.json']。 */
  tsconfigs?: string[];
  /** 是否生成 .d.ts，默认 true。 */
  dts?: boolean;
  /** 是否开启代码分割，默认 true。 */
  splitting?: boolean;
  /** 是否生成 linked sourcemap，默认 true。 */
  sourcemap?: boolean;
  /** 是否压缩；默认由 TRANSONE_MINIFY 环境变量控制（未设置为 0 时压缩）。 */
  minify?: boolean;
}

export interface ResolvedLibraryConfig {
  entry: string;
  outDir: string;
  external: string[];
  tsconfigs: string[];
  dts: boolean;
  splitting: boolean;
  sourcemap: boolean;
  minify?: boolean;
}

export interface UserConfig {
  entry?: string;
  pages?: Record<string, string>;
  server?: ServerConfig;
  build?: BuildConfig;
  library?: LibraryConfig;
  /** 小程序目标端配置：单一配置（作用于所有 mp 目标）或按平台分组（'mp-weixin' / 'mp-alipay' / 'mp-bytedance'）。 */
  mp?: UserMiniProgramConfig;
  /** 原生 App 目标配置：扁平配置或按 app-* 平台分组。 */
  app?: UserAppConfig;
}

export interface ResolveConfigOptions {
  root?: string;
  config?: UserConfig;
  host?: string;
  port?: number;
  outDir?: string;
  /** 部署基础路径前缀（如 /transone/one），覆盖 config.build.basePath。 */
  base?: string;
  /** 编译目标端，默认 web。 */
  target?: TargetType;
  /** 小程序产物目录，覆盖 config.mp.outDir。 */
  mpOutDir?: string;
}

export interface BuildOptions extends ResolveConfigOptions {
  /** 构建 npm 库（读取 config.library）而不是站点。 */
  library?: boolean;
}

export interface BuildResult {
  root: string;
  outDir: string;
  assetsBuilt: string[];
}

export interface ResolvedConfig {
  root: string;
  configFile?: string;
  entry: string;
  pages: Record<string, string>;
  target: TargetType;
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
  library?: ResolvedLibraryConfig;
  /** 微信小程序目标端配置（--target mp-weixin）。 */
  mp?: ResolvedMiniProgramConfig;
  /** 原生 App 目标配置（仅 --target app-* 时存在）。 */
  app?: ResolvedAppConfig;
}
