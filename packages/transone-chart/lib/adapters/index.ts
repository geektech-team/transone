export type {
  ResolveCanvasOptions,
  ResolvedCanvas,
} from './types';
export { detectPixelRatio } from './types';

export { resolveWebCanvas } from './web';

export {
  getMiniProgramCanvasNode,
  getMiniProgramGlobal,
  resolveMiniProgramCanvas,
  detectMiniProgramPixelRatio,
} from './miniprogram';
export type { MiniProgramCanvasNode, MiniProgramGlobal } from './miniprogram';

export { resolveNativeCanvas } from './native';
export type { NativeCanvasHost } from './native';
