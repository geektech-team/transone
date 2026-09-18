import { Router } from './index';

// 创建一个全局路由实例
let router: Router | null = null;

/**
 * 设置全局路由实例
 * @param r 路由实例
 */
export function setRouter(r: Router): void {
  if (!r || !(r instanceof Router)) {
    throw new Error('Invalid router instance');
  }
  router = r;
}

/**
 * 获取路由实例
 * @returns 路由实例
 * @throws 当路由未初始化时抛出错误
 */
export function useRouter(): Router {
  if (!router) {
    throw new Error(
      'Router is not initialized. Please make sure you have installed the router plugin.'
    );
  }
  return router;
}

/**
 * 安全地获取路由实例，如果未初始化则返回null
 * @returns 路由实例或null
 */
export function getRouter(): Router | null {
  return router;
}

/**
 * 检查路由是否已初始化
 * @returns 是否已初始化
 */
export function hasRouter(): boolean {
  return router !== null;
}

/**
 * 重置路由实例（主要用于测试）
 */
export function resetRouter(): void {
  router = null;
}
