import type { BuildOptions, BuildResult, ResolvedConfig } from '../types';
import type { BuildTarget, TargetType } from './types';

/**
 * 尚未实现的编译目标占位。
 *
 * 在编译期快速报错并给出原因（延续 TransOne 的报错策略）：
 * 让"请求了未支持的目标端"在构建开始时即失败，而不是产出残缺工程。
 */
export class PlaceholderTarget implements BuildTarget {
  public constructor(
    public readonly type: TargetType,
    public readonly label: string,
    private readonly plannedMilestone: string
  ) {}

  public async build(
    _config: ResolvedConfig,
    _options: BuildOptions
  ): Promise<BuildResult> {
    const available = ['web']
      .map((target) => `'${target}'`)
      .join(', ');
    throw new Error(
      `Target "${this.type}" (${this.label}) 尚未实现，预计在 ${this.plannedMilestone} 落地。` +
        `当前可用目标端：${available}。`
    );
  }
}
