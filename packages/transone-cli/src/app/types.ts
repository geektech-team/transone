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
  | { kind: 'state'; key: string }
  | { kind: 'expression'; value: NativeExpression };

/** A closed data expression language: generated native projects never evaluate JavaScript. */
export type NativeExpression =
  | { kind: 'literal'; value: NativeStateValue | null }
  | { kind: 'undefined' }
  | { kind: 'state'; key: string }
  | { kind: 'prop'; instance: string; key: string }
  | { kind: 'local'; name: string }
  | { kind: 'value-ref'; id: string }
  | { kind: 'revision'; value: NativeExpression; mode?: 'object' | 'array' }
  | {
      kind: 'object';
      entries: Array<{
        key?: NativeExpression;
        value: NativeExpression;
        spread?: boolean;
      }>;
    }
  | {
      kind: 'array';
      items: Array<{
        value?: NativeExpression;
        spread?: boolean;
        hole?: boolean;
      }>;
    }
  | {
      kind: 'member';
      target: NativeExpression;
      key: NativeExpression;
      optional?: boolean;
    }
  | {
      kind: 'memo';
      owner: string;
      key: string;
      value: NativeExpression;
      initial?: NativeExpression;
    }
  | {
      kind: 'binary';
      operator: string;
      left: NativeExpression;
      right: NativeExpression;
    }
  | { kind: 'unary'; operator: string; value: NativeExpression }
  | {
      kind: 'conditional';
      condition: NativeExpression;
      whenTrue: NativeExpression;
      whenFalse: NativeExpression;
    }
  | {
      kind: 'call';
      instance: string;
      method: string;
      args: NativeExpression[];
    };

export type NativeInstruction =
  | { kind: 'assign'; key: string; value: NativeExpression }
  | {
      kind: 'set-member';
      target: NativeExpression;
      key: NativeExpression;
      value: NativeExpression;
    }
  | {
      kind: 'set-props';
      instance: string;
      values: Record<string, NativeExpression>;
    }
  | { kind: 'expression'; value: NativeExpression }
  | { kind: 'local'; name: string; value: NativeExpression }
  | { kind: 'return'; value?: NativeExpression }
  | {
      kind: 'if';
      condition: NativeExpression;
      then: NativeInstruction[];
      otherwise: NativeInstruction[];
    }
  | { kind: 'throw'; message: NativeExpression }
  | { kind: 'emit'; instance: string; event: string; args: NativeExpression[] };

export interface NativeMethod {
  params: string[];
  body: NativeInstruction[];
  emit?: string;
}
export interface NativeRuntimeInstance {
  id: string;
  parent?: string;
  props: Record<string, NativeExpression>;
  methods: Record<string, NativeMethod>;
  emitters: Record<string, { instance: string; method: string }>;
  watchers: Array<{ key: string; method: string; immediate: boolean }>;
  renderDependencies?: NativeExpression[];
  beforeMount?: string;
  onMounted?: string;
  beforeUnmount?: string;
  onUnmounted?: string;
}
export interface NativeProgram {
  instances: NativeRuntimeInstance[];
  values?: Array<{
    id: string;
    value: Extract<NativeExpression, { kind: 'object' | 'array' }>;
  }>;
  initialState?: Record<string, NativeExpression>;
}

export type NativeAction =
  | { kind: 'sequence'; actions: NativeAction[] }
  | { kind: 'increment'; key: string; by: number }
  | { kind: 'set-literal'; key: string; value: NativeStateValue }
  | {
      kind: 'invoke';
      instance: string;
      method: string;
      args: NativeExpression[];
    };

export type NativeNode =
  | { kind: 'container'; children: NativeNode[]; style?: NativeStyle }
  | { kind: 'text'; parts: NativeTextPart[]; style?: NativeStyle }
  | {
      kind: 'button';
      parts: NativeTextPart[];
      action: NativeAction;
      style?: NativeStyle;
    };

export interface NativeScreen {
  name: string;
  state: NativeStateEntry[];
  root: Extract<NativeNode, { kind: 'container' }>;
  program?: NativeProgram;
}

export interface NativeDialect {
  readonly id: 'app-ios' | 'app-android' | 'app-harmony';
  readonly label: string;
  readonly resourceDirectory: string;
  generateProject(
    screen: NativeScreen,
    config: ResolvedAppConfig
  ): Record<string, string | Uint8Array>;
}
