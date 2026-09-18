import { Component, h, type VNode } from 'transone';

export type TuSwitchSize = 'small' | 'medium';

export interface TuSwitchProps {
  /** 是否选中（受控：由父级维护，change 事件回传新值）。 */
  checked?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 选中态轨道颜色，默认主题色。 */
  activeColor?: string;
  /** 尺寸，默认 medium。 */
  size?: TuSwitchSize;
}

const SWITCH_BASE = 'tu-switch';
const SWITCH_THUMB = 'tu-switch__thumb';

/**
 * TuSwitch 开关：自绘轨道 + 滑块，不依赖端上原生 switch 组件，
 * 同一份源码在 Web（div）与小程序（view）渲染一致。
 * 完全受控：点击后通过 `change` 事件回传目标布尔值。
 */
export class TuSwitch extends Component<TuSwitchProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-switch', {
      selector: `.${SWITCH_BASE}`,
      properties: {
        background: 'var(--tu-border, #ebedf0)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        borderRadius: '999px',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'inline-block',
        height: '30px',
        position: 'relative',
        transition: 'background-color 0.25s ease, border-color 0.25s ease, opacity 0.25s ease',
        width: '52px',
      },
    });
    this.styleManager.addStyle('tu-switch-checked', {
      selector: `.${SWITCH_BASE}--checked`,
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderColor: 'var(--tu-primary, #1677ff)',
      },
    });
    this.styleManager.addStyle('tu-switch-disabled', {
      selector: `.${SWITCH_BASE}--disabled`,
      properties: {
        cursor: 'not-allowed',
        opacity: 0.5,
      },
    });
    this.styleManager.addStyle('tu-switch-small', {
      selector: `.${SWITCH_BASE}--small`,
      properties: {
        height: '22px',
        width: '38px',
      },
    });
    this.styleManager.addStyle('tu-switch-thumb', {
      selector: `.${SWITCH_THUMB}`,
      properties: {
        background: '#ffffff',
        borderRadius: '50%',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        height: '26px',
        left: '2px',
        position: 'absolute',
        top: '2px',
        transition: 'transform 0.25s ease',
        width: '26px',
      },
    });
    this.styleManager.addStyle('tu-switch-thumb-small', {
      selector: `.${SWITCH_BASE}--small .${SWITCH_THUMB}`,
      properties: {
        height: '18px',
        width: '18px',
      },
    });
    this.styleManager.addStyle('tu-switch-thumb-checked', {
      selector: `.${SWITCH_BASE}--checked .${SWITCH_THUMB}`,
      properties: {
        transform: 'translateX(22px)',
      },
    });
    this.styleManager.addStyle('tu-switch-thumb-small-checked', {
      selector: `.${SWITCH_BASE}--small.${SWITCH_BASE}--checked .${SWITCH_THUMB}`,
      properties: {
        transform: 'translateX(16px)',
      },
    });
  }

  protected render(): VNode {
    const cls = `${SWITCH_BASE}${this.props.checked ? ` ${SWITCH_BASE}--checked` : ''}${this.props.disabled ? ` ${SWITCH_BASE}--disabled` : ''}${this.props.size === 'small' ? ` ${SWITCH_BASE}--small` : ''}`;
    return h(
      'div',
      {
        className: cls,
        style: {
          backgroundColor: this.props.checked
            ? this.props.activeColor || 'var(--tu-primary, #1677ff)'
            : '',
        },
      },
      [h('span', { className: SWITCH_THUMB }, [])],
      {
        click: () => this.onClick(),
      }
    );
  }

  protected onClick(): void {
    if (this.props.disabled) {
      return;
    }
    this.emit('change', !this.props.checked);
  }
}
