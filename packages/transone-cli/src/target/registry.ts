import type { BuildTarget, TargetType } from './types';
import { WebTarget } from './web-target';
import { mpAlipayTarget, mpBytedanceTarget, mpWeixinTarget } from './mp-target';
import { PlaceholderTarget } from './placeholder-target';

/**
 * 目标端注册表：编译器按 Target 分发代码生成（positioning 7.3）。
 *
 * M1 注册 web；M2 注册 mp-weixin；M3 注册 mp-alipay / mp-bytedance；
 * app-* 以占位 Target 注册，构建时给出明确的未实现原因与路线图阶段。
 */
export class TargetRegistry {
  private readonly targets = new Map<TargetType, BuildTarget>();

  public constructor() {
    this.register(new WebTarget());
    this.register(mpWeixinTarget);
    this.register(mpAlipayTarget);
    this.register(mpBytedanceTarget);
    this.register(
      new PlaceholderTarget('app-ios', 'iOS 原生 App', '远期')
    );
    this.register(
      new PlaceholderTarget('app-android', 'Android 原生 App', '远期')
    );
    this.register(
      new PlaceholderTarget('app-harmony', '鸿蒙原生 App（ArkUI）', '远期')
    );
  }

  public register(target: BuildTarget): void {
    this.targets.set(target.type, target);
  }

  public resolve(type: TargetType): BuildTarget {
    const target = this.targets.get(type);
    if (!target) {
      throw new Error(`Unknown build target: ${type}`);
    }
    return target;
  }

  public getAvailableTargets(): BuildTarget[] {
    return [...this.targets.values()];
  }
}

export const targetRegistry = new TargetRegistry();
