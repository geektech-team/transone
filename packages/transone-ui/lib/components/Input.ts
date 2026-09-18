import { Component, h, type VNode } from 'transone';

export type TuInputType = 'text' | 'password' | 'number';

export interface TuInputProps {
  /** 输入值（受控：由父级维护，input/change 事件回传新值）。 */
  value?: string;
  /** 占位文案。 */
  placeholder?: string;
  /** 输入类型：text / password / number（小程序端 number 对应数字键盘）。 */
  type?: TuInputType;
  /** 禁用。 */
  disabled?: boolean;
  /** 只读（小程序端映射为 disabled，避免可编辑）。 */
  readonly?: boolean;
  /** 最大长度；不传则不限。 */
  maxlength?: number;
  /** 可一键清空：有值时显示 × 按钮。 */
  clearable?: boolean;
  /** 尺寸：small / medium / large，默认 medium。 */
  size?: TuInputSize;
}

export type TuInputSize = 'small' | 'medium' | 'large';

const INPUT_BASE = 'tu-input';

/**
 * TuInput 输入框：受控 value + placeholder / type / disabled / readonly /
 * maxlength / clearable / size。输入、变更、聚焦、失焦、回车通过同名
 * 自定义事件回传（input 事件携带新值字符串）。
 *
 * 双端差异已封装：Web 从 e.target.value 取值，小程序从 e.detail.value 取值，
 * 方法内统一归一化后 emit。
 */
export class TuInput extends Component<TuInputProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-input', {
      selector: `.${INPUT_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'var(--tu-background, #f7f8fa)',
        border: '1px solid var(--tu-border, #ebedf0)',
        borderRadius: 'var(--tu-radius-md, 8px)',
        boxSizing: 'border-box',
        display: 'flex',
        padding: '0 12px',
        transition: 'border-color 0.2s ease',
      },
    });
    this.styleManager.addStyle('tu-input-small', {
      selector: `.${INPUT_BASE}--small`,
      properties: {
        minHeight: '32px',
      },
    });
    this.styleManager.addStyle('tu-input-medium', {
      selector: `.${INPUT_BASE}--medium`,
      properties: {
        minHeight: '40px',
      },
    });
    this.styleManager.addStyle('tu-input-large', {
      selector: `.${INPUT_BASE}--large`,
      properties: {
        minHeight: '48px',
      },
    });
    this.styleManager.addStyle('tu-input-disabled', {
      selector: `.${INPUT_BASE}--disabled`,
      properties: {
        opacity: 0.6,
      },
    });
    this.styleManager.addStyle('tu-input-control', {
      selector: '.tu-input__control',
      properties: {
        background: 'transparent',
        border: 'none',
        boxSizing: 'border-box',
        color: 'var(--tu-text, #323233)',
        flex: 1,
        fontSize: '16px',
        height: '100%',
        minHeight: 'inherit',
        outline: 'none',
        padding: '10px 0',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-input-clear', {
      selector: '.tu-input__clear',
      properties: {
        alignItems: 'center',
        color: 'var(--tu-text-secondary, #969799)',
        display: 'inline-flex',
        fontSize: '16px',
        fontWeight: '600',
        justifyContent: 'center',
        lineHeight: 1,
        marginLeft: '8px',
        padding: '2px 4px',
      },
    });
  }

  protected render(): VNode {
    const cls = `${INPUT_BASE} ${INPUT_BASE}--${this.props.size || 'medium'}${this.props.disabled ? ` ${INPUT_BASE}--disabled` : ''}`;
    return h(
      'div',
      { className: cls },
      [
        h('input', {
          className: 'tu-input__control',
          type: this.props.type || 'text',
          value: this.props.value || '',
          placeholder: this.props.placeholder || '',
          disabled: this.props.disabled === true || this.props.readonly === true,
          maxlength: this.props.maxlength,
        }, [], {
          input: (e) => this.onInput(e),
          change: (e) => this.onChange(e),
          focus: () => this.onFocus(),
          blur: () => this.onBlur(),
          confirm: () => this.onConfirm(),
        }),
        h(
          'span',
          { className: 'tu-input__clear' },
          ['×'],
          { click: () => this.onClear() },
          undefined,
          { show: this.props.clearable === true && !!this.props.value }
        ),
      ]
    );
  }

  /** 归一化双端输入事件取值：小程序 e.detail.value，Web e.target.value。 */
  protected valueFromEvent(e: unknown): string {
    const detail = (e as { detail?: { value?: unknown } }).detail;
    if (detail && typeof detail === 'object' && 'value' in detail) {
      const value = detail.value;
      return value === undefined || value === null ? '' : String(value);
    }
    const target = (e as { target?: { value?: unknown } }).target;
    if (target && typeof target === 'object' && 'value' in target) {
      const value = target.value;
      return value === undefined || value === null ? '' : String(value);
    }
    return '';
  }

  protected onInput(e: unknown): void {
    this.emit('input', this.valueFromEvent(e));
  }

  protected onChange(e: unknown): void {
    this.emit('change', this.valueFromEvent(e));
  }

  protected onFocus(): void {
    this.emit('focus');
  }

  protected onBlur(): void {
    this.emit('blur');
  }

  protected onConfirm(): void {
    this.emit('confirm');
  }

  protected onClear(): void {
    this.emit('input', '');
  }
}
