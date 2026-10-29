/** Application platform, independent of the generator backend. */
export enum Platform {
  Web = 'web',
  WebMobile = 'web-mobile',
  WebPc = 'web-pc',
  MiniprogramWeixin = 'miniprogram-weixin',
  MiniprogramAlipay = 'miniprogram-alipay',
  MiniprogramBytedance = 'miniprogram-bytedance',
  MiniprogramXiaohongshu = 'miniprogram-xiaohongshu',
  AppIos = 'app-ios',
  AppAndroid = 'app-android',
  AppHarmony = 'app-harmony',
}

export type PlatformName = `${Platform}`;
export type PlatformFamily = 'web' | 'miniprogram' | 'app';
/** Component markers may identify a concrete platform or its shared family. */
export type ComponentPlatform = Platform | PlatformFamily;
export type BackendTarget =
  | 'web'
  | 'mp-weixin'
  | 'mp-alipay'
  | 'mp-bytedance'
  | 'mp-xiaohongshu'
  | 'app-ios'
  | 'app-android'
  | 'app-harmony';

export interface PlatformDefinition {
  platform: Platform;
  decorator: string;
  family: PlatformFamily;
  target: BackendTarget;
}

export const PLATFORM_DEFINITIONS: readonly PlatformDefinition[] = [
  { platform: Platform.Web, decorator: 'Web', family: 'web', target: 'web' },
  {
    platform: Platform.WebMobile,
    decorator: 'WebMobile',
    family: 'web',
    target: 'web',
  },
  {
    platform: Platform.WebPc,
    decorator: 'WebPc',
    family: 'web',
    target: 'web',
  },
  {
    platform: Platform.MiniprogramWeixin,
    decorator: 'MiniprogramWeixin',
    family: 'miniprogram',
    target: 'mp-weixin',
  },
  {
    platform: Platform.MiniprogramAlipay,
    decorator: 'MiniprogramAlipay',
    family: 'miniprogram',
    target: 'mp-alipay',
  },
  {
    platform: Platform.MiniprogramBytedance,
    decorator: 'MiniprogramBytedance',
    family: 'miniprogram',
    target: 'mp-bytedance',
  },
  {
    platform: Platform.MiniprogramXiaohongshu,
    decorator: 'MiniprogramXiaohongshu',
    family: 'miniprogram',
    target: 'mp-xiaohongshu',
  },
  {
    platform: Platform.AppIos,
    decorator: 'AppIos',
    family: 'app',
    target: 'app-ios',
  },
  {
    platform: Platform.AppAndroid,
    decorator: 'AppAndroid',
    family: 'app',
    target: 'app-android',
  },
  {
    platform: Platform.AppHarmony,
    decorator: 'AppHarmony',
    family: 'app',
    target: 'app-harmony',
  },
];

/** Family markers do not select a concrete generator and are not build targets. */
export const COMPONENT_PLATFORM_DEFINITIONS: readonly {
  platform: ComponentPlatform;
  decorator: string;
}[] = [
  ...PLATFORM_DEFINITIONS.map(({ platform, decorator }) => ({
    platform,
    decorator,
  })),
  { platform: 'miniprogram', decorator: 'Miniprogram' },
  { platform: 'app', decorator: 'App' },
];

export function normalizePlatform(value: unknown): Platform | undefined {
  if (typeof value !== 'string') return undefined;
  return (
    PLATFORM_DEFINITIONS.find((definition) => definition.platform === value)
      ?.platform ??
    PLATFORM_DEFINITIONS.find((definition) => definition.target === value)
      ?.platform
  );
}

export function getPlatformDefinition(value: Platform): PlatformDefinition {
  const definition = PLATFORM_DEFINITIONS.find(
    (definition) => definition.platform === value
  );
  if (!definition) throw new Error(`Unknown platform: ${String(value)}`);
  return definition;
}
