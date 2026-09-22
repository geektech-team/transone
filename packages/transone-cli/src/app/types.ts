import type { ResolvedAppConfig } from '../types';

export type NativeStateValue = string | number | boolean;

export interface NativeStateEntry {
  key: string;
  value: NativeStateValue;
}

export interface NativeStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: string | number;
  padding?: number;
  margin?: number;
  width?: number;
  height?: number;
  borderRadius?: number;
  textAlign?: string;
}

export type NativeTextPart =
  | { kind: 'literal'; value: string }
  | { kind: 'state'; key: string };

export type NativeAction =
  | { kind: 'increment'; key: string; by: number }
  | { kind: 'set-literal'; key: string; value: NativeStateValue };

export type NativeNode =
  | { kind: 'container'; children: NativeNode[]; style?: NativeStyle }
  | { kind: 'text'; parts: NativeTextPart[]; style?: NativeStyle }
  | { kind: 'button'; parts: NativeTextPart[]; action: NativeAction; style?: NativeStyle };

export interface NativeScreen {
  name: string;
  state: NativeStateEntry[];
  root: Extract<NativeNode, { kind: 'container' }>;
}

export interface NativeDialect {
  readonly id: 'app-ios' | 'app-android' | 'app-harmony';
  readonly label: string;
  readonly resourceDirectory: string;
  generateProject(
    screen: NativeScreen,
    config: ResolvedAppConfig
  ): Record<string, string>;
}
