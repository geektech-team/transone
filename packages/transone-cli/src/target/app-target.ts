import type { BuildOptions, BuildResult, ResolvedConfig } from '../types';
import { buildNativeApp } from '../app/build-app';
import type { NativeDialect } from '../app/types';
import type { BuildTarget, TargetType } from './types';

export class AppTarget implements BuildTarget {
  public constructor(private readonly dialect: NativeDialect) {}
  public get type(): TargetType { return this.dialect.id; }
  public get label(): string { return this.dialect.label; }
  public build(config: ResolvedConfig, _options: BuildOptions): Promise<BuildResult> { return buildNativeApp(config, this.dialect); }
}
