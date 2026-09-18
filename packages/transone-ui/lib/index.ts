/**
 * transone-ui：基于 TransOne 的跨端 UI 组件库。
 *
 * 一份 TypeScript 源码，Web（DOM 运行时）与小程序（编译期静态转换）通用。
 * 所有组件为完全受控组件：状态由父级维护，交互通过自定义事件（emitters）回传。
 */

export * from './theme';

export { TuButton } from './components/Button';
export type {
  TuButtonProps,
  TuButtonSize,
  TuButtonType,
} from './components/Button';

export { TuSwitch } from './components/Switch';
export type { TuSwitchProps, TuSwitchSize } from './components/Switch';

export { TuTag } from './components/Tag';
export type { TuTagProps, TuTagType } from './components/Tag';

export { TuProgress } from './components/Progress';
export type { TuProgressProps } from './components/Progress';

export { TuInput } from './components/Input';
export type { TuInputProps, TuInputSize, TuInputType } from './components/Input';

export { TuPopup } from './components/Popup';
export type { TuPopupPosition, TuPopupProps } from './components/Popup';
