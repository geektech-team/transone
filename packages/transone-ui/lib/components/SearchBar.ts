import { Component, h, type VNode } from 'transone';

export type TuSearchBarShape = 'round' | 'square';

export interface TuSearchBarProps {
  /** 输入值（受控）。 */
  value?: string;
  /** 占位文案。 */
  placeholder?: string;
  /** 禁用。 */
  disabled?: boolean;
  /** 最大长度。 */
  maxlength?: number;
  /** 形状：圆角 / 直角，默认 round。 */
  shape?: TuSearchBarShape;
  /** 是否显示取消按钮，默认 false。 */
  showCancel?: boolean;
  /** 取消按钮文案，默认「取消」。 */
  cancelText?: string;
  /** 非空时显示清空按钮，默认 true。 */
  clearable?: boolean;
  /** 背景色，默认浅灰。 */
  background?: string;
  /** 小程序键盘确认键文案（search / done 等），Web 端无效果。 */
  confirmType?: string;
}

const SEARCH_BASE = 'tu-searchbar';

/**
 * TuSearchBar 搜索栏：输入框 + 清空按钮 + 可选取消按钮。
 * 完全受控：value 由父级维护；事件：
 * `input` / `change`（回传字符串）、`search`（键盘确认键）、
 * `clear`（清空）、`cancel`（取消）、`focus` / `blur`。
 */
export class TuSearchBar extends Component<TuSearchBarProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-searchbar', {
      selector: `.${SEARCH_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'var(--tu-background, #f7f8fa)',
        boxSizing: 'border-box',
        display: 'flex',
        padding: '10px 12px',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-searchbar-control', {
      selector: '.tu-searchbar__control',
      properties: {
        background: '#ffffff',
        border: '1px solid var(--tu-border, #ebedf0)',
        boxSizing: 'border-box',
        color: 'var(--tu-text, #323233)',
        flex: '1',
        fontSize: '14px',
        height: '34px',
        lineHeight: '34px',
        minWidth: '0',
        outline: 'none',
        padding: '0 12px',
      },
    });
    this.styleManager.addStyle('tu-searchbar-control-round', {
      selector: `.${SEARCH_BASE}--round .tu-searchbar__control`,
      properties: {
        borderRadius: '999px',
      },
    });
    this.styleManager.addStyle('tu-searchbar-clear', {
      selector: '.tu-searchbar__clear',
      properties: {
        alignItems: 'center',
        background: 'var(--tu-border, #ebedf0)',
        borderRadius: '50%',
        boxSizing: 'border-box',
        color: 'var(--tu-text-secondary, #969799)',
        display: 'flex',
        fontSize: '14px',
        height: '16px',
        justifyContent: 'center',
        lineHeight: '16px',
        position: 'absolute',
        right: '26px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '16px',
      },
    });
    this.styleManager.addStyle('tu-searchbar-field', {
      selector: '.tu-searchbar__field',
      properties: {
        display: 'inline-block',
        flex: '1',
        position: 'relative',
      },
    });
    this.styleManager.addStyle('tu-searchbar-cancel-gap', {
      selector: '.tu-searchbar__cancel',
      properties: {
        marginLeft: '10px',
      },
    });
    this.styleManager.addStyle('tu-searchbar-cancel', {
      selector: '.tu-searchbar__cancel',
      properties: {
        color: 'var(--tu-primary, #1677ff)',
        flexShrink: '0',
        fontSize: '14px',
        lineHeight: 1,
        padding: '0 4px',
      },
    });
  }

  protected render(): VNode {
    const shapeCls =
      this.props.shape === 'square'
        ? `${SEARCH_BASE}--square`
        : `${SEARCH_BASE}--round`;
    const cls = `${SEARCH_BASE} ${shapeCls}`;
    return h('div', { className: cls }, [
      h('div', { className: 'tu-searchbar__field' }, [
        h('input', {
          className: 'tu-searchbar__control',
          type: 'text',
          value: this.props.value || '',
          placeholder: this.props.placeholder || '',
          disabled: this.props.disabled === true,
          maxlength: this.props.maxlength,
          confirmType: this.props.confirmType,
        }, [], {
          input: (e) => this.onInput(e),
          change: (e) => this.onChange(e),
          focus: () => this.onFocus(),
          blur: () => this.onBlur(),
          confirm: () => this.onSearch(),
        }),
        h(
          'span',
          { className: 'tu-searchbar__clear' },
          ['×'],
          { click: () => this.onClear() },
          undefined,
          { show: this.props.clearable !== false && !!this.props.value }
        ),
      ]),
      h(
        'div',
        { className: 'tu-searchbar__cancel' },
        [`${this.props.cancelText || '取消'}`],
        { click: () => this.onCancel() },
        undefined,
        { show: this.props.showCancel === true }
      ),
    ]);
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

  protected onSearch(): void {
    this.emit('search');
  }

  protected onClear(): void {
    this.emit('input', '');
    this.emit('clear');
  }

  protected onCancel(): void {
    this.emit('cancel');
  }
}
