import type * as tsTypes from 'typescript';

let tsModule: typeof tsTypes | null = null;

/**
 * 惰性加载 TypeScript 编译器 API：只有 `transone build --target mp-weixin` 路径
 * 才加载，常规 build/dev 不受影响。模块级缓存避免重复加载。
 */
export async function loadTypescript(): Promise<typeof tsTypes> {
  if (tsModule) {
    return tsModule;
  }
  tsModule = await import('typescript');
  return tsModule;
}
