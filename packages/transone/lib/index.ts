import { OneApp, AppOptions } from './core/app';
import type { ComponentProps } from './core/component';

// 导出核心功能
export * from './core';

// 导出路由功能
export * from './router';

// 导出跨端请求模块
export * from './request';

// 创建应用实例的主函数
export function createApp<
  TState extends object = Record<string, unknown>,
  TConfig extends object = Record<string, unknown>,
  TRootProps extends ComponentProps = ComponentProps,
>(
  options: AppOptions<TState, TConfig, TRootProps> = {}
): OneApp<TState, TConfig, TRootProps> {
  return new OneApp(options);
}

// 导出框架名称和版本
export const version = '0.4.0';
export const name = 'transone';
