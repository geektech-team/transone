import { Component, h, type VNode } from 'transone';

export type TuCheckboxShape = 'round' | 'square';

export interface TuCheckboxProps {
  /** 是否选中（受控：change 事件回传新值）。 */
  checked?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 文案。 */
  label?: string;
  /** 选中态颜色，默认主题色。 */
  activeColor?: string;
  /** 形状：圆角方框 / 直角方框，默认 round。 */
  shape?: TuCheckboxShape;
}

const CHECKBOX_BASE = 'tu-checkbox';

/**
 * TuCheckbox 复选框：自绘方框 + CSS 对勾，不依赖端上原生 checkbox。
 * 完全受控：点击后通过 `change` 事件回传目标布尔值。
 */
export class TuCheckbox extends Component<TuCheckboxProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-checkbox', {
      selector: `.${CHECKBOX_BASE}`,
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'inline-flex',
        fontSize: '15px',
        lineHeight: 1,
        padding: '6px 0',
        userSelect: 'none',
      },
    });
    this.styleManager.addStyle('tu-checkbox-disabled', {
      selector: `.${CHECKBOX_BASE}--disabled`,
      properties: {
        cursor: 'not-allowed',
        opacity: 0.5,
      },
    });
    this.styleManager.addStyle('tu-checkbox-box', {
      selector: '.tu-checkbox__box',
      properties: {
        alignItems: 'center',
        border: '1px solid var(--tu-border, #ebedf0)',
        boxSizing: 'border-box',
        display: 'flex',
        height: '20px',
        justifyContent: 'center',
        position: 'relative',
        width: '20px',
      },
    });
    this.styleManager.addStyle('tu-checkbox-box-round', {
      selector: `.${CHECKBOX_BASE}--round .tu-checkbox__box`,
      properties: {
        borderRadius: 'var(--tu-radius-sm, 4px)',
      },
    });
    this.styleManager.addStyle('tu-checkbox-box-checked', {
      selector: `.${CHECKBOX_BASE}--checked .tu-checkbox__box`,
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderColor: 'var(--tu-primary, #1677ff)',
      },
    });
    this.styleManager.addStyle('tu-checkbox-checkmark', {
      selector: '.tu-checkbox__checkmark',
      properties: {
        border: '2px solid #ffffff',
        borderTop: 'none',
        borderRight: 'none',
        boxSizing: 'border-box',
        height: '10px',
        left: '50%',
        marginLeft: '-2px',
        marginTop: '-3px',
        position: 'absolute',
        top: '50%',
        transform: 'rotate(-45deg)',
        width: '14px',
      },
    });
    this.styleManager.addStyle('tu-checkbox-label-gap', {
      selector: '.tu-checkbox__label',
      properties: {
        marginLeft: '8px',
      },
    });
    this.styleManager.addStyle('tu-checkbox-label', {
      selector: '.tu-checkbox__label',
      properties: {
        color: 'var(--tu-text, #323233)',
      },
    });
  }

  protected render(): VNode {
    const checked = this.props.checked === true;
    const cls = `${CHECKBOX_BASE}${checked ? ` ${CHECKBOX_BASE}--checked` : ''}${this.props.disabled ? ` ${CHECKBOX_BASE}--disabled` : ''}${this.props.shape === 'square' ? ' tu-checkbox--square' : ` ${CHECKBOX_BASE}--round`}`;
    return h(
      'div',
      {
        className: cls,
        style: {
          color: checked
            ? this.props.activeColor || 'var(--tu-primary, #1677ff)'
            : '',
        },
      },
      [
        h('span', { className: 'tu-checkbox__box' }, [
          h(
            'span',
            { className: 'tu-checkbox__checkmark' },
            [],
            undefined,
            undefined,
            { show: checked }
          ),
        ]),
        h('span', { className: 'tu-checkbox__label' }, [`${this.props.label || ''}`]),
      ],
      { click: () => this.onClick() }
    );
  }

  protected onClick(): void {
    if (this.props.disabled) {
      return;
    }
    this.emit('change', !this.props.checked);
  }
}
