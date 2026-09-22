import type { ResolvedConfig } from '../types';
import type { BuildOptions, BuildResult } from '../types';

/**
 * 目标端类型。
 *
 * 编译器按 Target 分发代码生成（见 positioning 7.3）：
 * - web            直接渲染（HTML + 浏览器运行时，与 TSone 一致）
 * - mp-weixin      WXML / WXSS / JS 静态转换（路线图 M2）
 * - mp-alipay      AXML / ACSS 静态转换（路线图 M3）
 * - mp-bytedance   ttml / ttss 静态转换（路线图 M3）
 * - app-*          远期占位（app-ios / app-android / app-harmony）
 */
export const TARGET_TYPES = [
  'web',
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'app-ios',
  'app-android',
  'app-harmony',
] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

export function isTargetType(value: unknown): value is TargetType {
  return (
    typeof value === 'string' &&
    (TARGET_TYPES as readonly string[]).includes(value)
  );
}

/** 小程序目标端类型（mp-*），config.mp 按平台分组时使用。 */
export const MP_TARGET_TYPES = [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
] as const satisfies readonly TargetType[];

export type MpTargetType = (typeof MP_TARGET_TYPES)[number];

/** 原生 App 目标端类型（app-*）。 */
export const APP_TARGET_TYPES = [
  'app-ios',
  'app-android',
  'app-harmony',
] as const satisfies readonly TargetType[];

export type AppTargetType = (typeof APP_TARGET_TYPES)[number];

export function isAppTargetType(value: unknown): value is AppTargetType {
  return (
    typeof value === 'string' &&
    (APP_TARGET_TYPES as readonly string[]).includes(value)
  );
}

export function isMpTargetType(value: unknown): value is MpTargetType {
  return (
    typeof value === 'string' &&
    (MP_TARGET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * 编译目标抽象：每个端一个实现，编译器按 Target 分发构建。
 *
 * 新增目标端时实现本接口并注册到 TargetRegistry，无需改动构建入口。
 */
export interface BuildTarget {
  readonly type: TargetType;
  /** 目标端产物形态描述（用于 CLI 输出与文档）。 */
  readonly label: string;
  build(config: ResolvedConfig, options: BuildOptions): Promise<BuildResult>;
}
