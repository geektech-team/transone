import { Component, h, type VNode } from 'transone';

export interface TuRadioProps {
  /** 是否选中（受控：change 事件回传新值）。 */
  checked?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 文案。 */
  label?: string;
  /** 选中态颜色，默认主题色。 */
  activeColor?: string;
}

const RADIO_BASE = 'tu-radio';

/**
 * TuRadio 单选框：自绘圆形 + 圆心点，不依赖端上原生 radio。
 * 完全受控：点击后通过 `change` 事件回传目标布尔值。
 */
export class TuRadio extends Component<TuRadioProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-radio', {
      selector: `.${RADIO_BASE}`,
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
    this.styleManager.addStyle('tu-radio-disabled', {
      selector: `.${RADIO_BASE}--disabled`,
      properties: {
        cursor: 'not-allowed',
        opacity: 0.5,
      },
    });
    this.styleManager.addStyle('tu-radio-circle', {
      selector: '.tu-radio__circle',
      properties: {
        alignItems: 'center',
        border: '1px solid var(--tu-border, #ebedf0)',
        borderRadius: '50%',
        boxSizing: 'border-box',
        display: 'flex',
        height: '20px',
        justifyContent: 'center',
        width: '20px',
      },
    });
    this.styleManager.addStyle('tu-radio-circle-checked', {
      selector: `.${RADIO_BASE}--checked .tu-radio__circle`,
      properties: {
        borderColor: 'var(--tu-primary, #1677ff)',
      },
    });
    this.styleManager.addStyle('tu-radio-dot', {
      selector: '.tu-radio__dot',
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderRadius: '50%',
        height: '10px',
        width: '10px',
      },
    });
    this.styleManager.addStyle('tu-radio-label-gap', {
      selector: '.tu-radio__label',
      properties: {
        marginLeft: '8px',
      },
    });
    this.styleManager.addStyle('tu-radio-label', {
      selector: '.tu-radio__label',
      properties: {
        color: 'var(--tu-text, #323233)',
      },
    });
  }

  protected render(): VNode {
    const checked = this.props.checked === true;
    const cls = `${RADIO_BASE}${checked ? ` ${RADIO_BASE}--checked` : ''}${this.props.disabled ? ` ${RADIO_BASE}--disabled` : ''}`;
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
        h('span', { className: 'tu-radio__circle' }, [
          h('span', { className: 'tu-radio__dot' }, [], undefined, undefined, { show: checked }),
        ]),
        h('span', { className: 'tu-radio__label' }, [`${this.props.label || ''}`]),
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
