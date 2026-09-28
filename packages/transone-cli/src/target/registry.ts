import type { BuildTarget, TargetType } from './types';
import { WebTarget } from './web-target';
import {
  mpAlipayTarget,
  mpBytedanceTarget,
  mpWeixinTarget,
  mpXiaohongshuTarget,
} from './mp-target';
import { AppTarget } from './app-target';
import { ANDROID_DIALECT, HARMONY_DIALECT, IOS_DIALECT } from '../app/dialects';

/**
 * 目标端注册表：编译器按 Target 分发代码生成（positioning 7.3）。
 *
 * 注册 Web 与各小程序 target；
 * app-* 通过平台方言注册原生源码生成器。
 */
export class TargetRegistry {
  private readonly targets = new Map<TargetType, BuildTarget>();

  public constructor() {
    this.register(new WebTarget());
    this.register(mpWeixinTarget);
    this.register(mpAlipayTarget);
    this.register(mpBytedanceTarget);
    this.register(mpXiaohongshuTarget);
    this.register(new AppTarget(IOS_DIALECT));
    this.register(new AppTarget(ANDROID_DIALECT));
    this.register(new AppTarget(HARMONY_DIALECT));
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
