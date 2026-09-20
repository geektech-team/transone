import type { AnyComponentConstructor } from 'transone';
import { DemoButton } from './button';
import { DemoSwitch } from './switch';
import { DemoTags } from './tag';
import { DemoProgress } from './progress';
import { DemoInput } from './input';
import { DemoPopup } from './popup';
import { DemoToast } from './toast';
import { DemoModal } from './modal';
import { DemoActionSheet } from './action-sheet';
import { DemoCheckbox } from './checkbox';
import { DemoRadio } from './radio';
import { DemoSearchBar } from './search-bar';
import { DemoBadge } from './badge';
import { DemoCell } from './cell';
import { DemoEmpty } from './empty';
import { DemoTabs } from './tabs';
import { DemoNavbar } from './navbar';
import { DemoChartLine } from './chart-line';
import { DemoChartBar } from './chart-bar';
import { DemoChartPie } from './chart-pie';
import { DemoChartRadar } from './chart-radar';

/**
 * Live demo 注册表：docs 组件页的 demo(id) 块据此解析出宿主组件。
 * key 与组件页 path 的末段一致（button、switch、tag、progress、input、
 * popup、toast、modal、action-sheet、checkbox、radio、search-bar、
 * badge、cell、empty、tabs、navbar），以及 transone-chart 图表
 * demo（chart-line、chart-bar、chart-pie、chart-radar）。
 */
export const demoRegistry: Record<string, AnyComponentConstructor> = {
  button: DemoButton,
  switch: DemoSwitch,
  tag: DemoTags,
  progress: DemoProgress,
  input: DemoInput,
  popup: DemoPopup,
  toast: DemoToast,
  modal: DemoModal,
  'action-sheet': DemoActionSheet,
  checkbox: DemoCheckbox,
  radio: DemoRadio,
  'search-bar': DemoSearchBar,
  badge: DemoBadge,
  cell: DemoCell,
  empty: DemoEmpty,
  tabs: DemoTabs,
  navbar: DemoNavbar,
  'chart-line': DemoChartLine,
  'chart-bar': DemoChartBar,
  'chart-pie': DemoChartPie,
  'chart-radar': DemoChartRadar,
};
