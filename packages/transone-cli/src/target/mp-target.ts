import type { BuildOptions, BuildResult, ResolvedConfig } from '../types';
import type { BuildTarget, TargetType } from './types';
import {
  MP_ALIPAY_DIALECT,
  MP_BYTEDANCE_DIALECT,
  MP_WEIXIN_DIALECT,
  type MpDialect,
} from '../mp/dialect';

/**
 * 小程序目标端通用实现：同一套 mp 编译器 + MpDialect 差异层。
 *
 * 流水线（src/mp/）：
 * 入口 → 静态分析（定位 createApp root / Component 子类）
 * → 逐页面编译（模板 / 样式 / data / methods / 生命周期）
 * → 组件调用点属性聚合（properties）
 * → 按 dialect 生成平台原生工程（app.json / app.js / 样式 / pages / components）。
 *
 * 依赖 TypeScript 编译器 API，仅在小程序构建路径惰性加载。
 */
export class MpTarget implements BuildTarget {
  public constructor(private readonly dialect: MpDialect) {}

  public get type(): TargetType {
    return this.dialect.id as TargetType;
  }

  public get label(): string {
    return this.dialect.label;
  }

  public async build(
    config: ResolvedConfig,
    _options: BuildOptions
  ): Promise<BuildResult> {
    if (!config.mp) {
      throw new Error(
        'Mini program build requires config.mp（请在 transone.config.ts 配置 mp 字段，' +
          '如 appId / pages / outDir）'
      );
    }
    // 动态加载：mp 编译器依赖 typescript API，仅在小程序构建路径加载
    const { buildMiniProgram } = await import('../mp/build-mp');
    return buildMiniProgram(config, this.dialect);
  }
}

export const mpWeixinTarget = new MpTarget(MP_WEIXIN_DIALECT);
export const mpAlipayTarget = new MpTarget(MP_ALIPAY_DIALECT);
export const mpBytedanceTarget = new MpTarget(MP_BYTEDANCE_DIALECT);
