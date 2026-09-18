import { Component, h, slot, type VNode } from 'transone';

export type TuButtonType = 'default' | 'primary' | 'success' | 'warning' | 'danger';
export type TuButtonSize = 'small' | 'medium' | 'large';

export interface TuButtonProps {
  /** 按钮类型，默认 default（中性底色）。 */
  type?: TuButtonType;
  /** 尺寸，默认 medium。 */
  size?: TuButtonSize;
  /** 禁用：不响应点击，半透明。 */
  disabled?: boolean;
  /** 加载中：不响应点击，内容替换为 loadingText。 */
  loading?: boolean;
  /** 块级：占满父容器宽度。 */
  block?: boolean;
  /** 朴素：透明底 + 描边 + 主题色文字。 */
  plain?: boolean;
  /** 圆角胶囊。 */
  round?: boolean;
  /** loading 时显示的文案，默认“加载中…”。 */
  loadingText?: string;
  /** 按钮内容（插槽）。 */
  children?: Array<VNode | string>;
}

const BUTTON_BASE = 'tu-button';
const HOVER_CLASS = 'tu-button-hover';

/**
 * TuButton 按钮：type / size / disabled / loading / block / plain / round。
 * 完全受控组件，点击通过 `click` 自定义事件通知父级（父级用 emitters 订阅）。
 */
export class TuButton extends Component<TuButtonProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-button', {
      selector: `.${BUTTON_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'var(--tu-primary, #1677ff)',
        border: '1px solid var(--tu-primary, #1677ff)',
        borderRadius: 'var(--tu-radius-md, 8px)',
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'inline-flex',
        fontSize: '16px',
        justifyContent: 'center',
        lineHeight: 1,
        padding: '10px 20px',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease',
        userSelect: 'none',
      },
      hover: {
        opacity: 0.85,
      },
    });

    this.styleManager.addStyle('tu-button-default', {
      selector: `.${BUTTON_BASE}--default`,
      properties: {
        background: 'var(--tu-white, #ffffff)',
        borderColor: 'var(--tu-border, #ebedf0)',
        color: 'var(--tu-text, #323233)',
      },
    });
    this.styleManager.addStyle('tu-button-primary', {
      selector: `.${BUTTON_BASE}--primary`,
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderColor: 'var(--tu-primary, #1677ff)',
        color: '#ffffff',
      },
    });
    this.styleManager.addStyle('tu-button-success', {
      selector: `.${BUTTON_BASE}--success`,
      properties: {
        background: 'var(--tu-success, #00b578)',
        borderColor: 'var(--tu-success, #00b578)',
        color: '#ffffff',
      },
    });
    this.styleManager.addStyle('tu-button-warning', {
      selector: `.${BUTTON_BASE}--warning`,
      properties: {
        background: 'var(--tu-warning, #ff8f1f)',
        borderColor: 'var(--tu-warning, #ff8f1f)',
        color: '#ffffff',
      },
    });
    this.styleManager.addStyle('tu-button-danger', {
      selector: `.${BUTTON_BASE}--danger`,
      properties: {
        background: 'var(--tu-danger, #ff3141)',
        borderColor: 'var(--tu-danger, #ff3141)',
        color: '#ffffff',
      },
    });

    this.styleManager.addStyle('tu-button-plain', {
      selector: `.${BUTTON_BASE}--plain`,
      properties: {
        background: 'transparent',
      },
    });
    this.styleManager.addStyle('tu-button-plain-primary', {
      selector: `.${BUTTON_BASE}--plain.${BUTTON_BASE}--primary`,
      properties: {
        color: 'var(--tu-primary, #1677ff)',
      },
    });
    this.styleManager.addStyle('tu-button-plain-success', {
      selector: `.${BUTTON_BASE}--plain.${BUTTON_BASE}--success`,
      properties: {
        color: 'var(--tu-success, #00b578)',
      },
    });
    this.styleManager.addStyle('tu-button-plain-warning', {
      selector: `.${BUTTON_BASE}--plain.${BUTTON_BASE}--warning`,
      properties: {
        color: 'var(--tu-warning, #ff8f1f)',
      },
    });
    this.styleManager.addStyle('tu-button-plain-danger', {
      selector: `.${BUTTON_BASE}--plain.${BUTTON_BASE}--danger`,
      properties: {
        color: 'var(--tu-danger, #ff3141)',
      },
    });

    this.styleManager.addStyle('tu-button-small', {
      selector: `.${BUTTON_BASE}--small`,
      properties: {
        fontSize: '13px',
        padding: '7px 12px',
      },
    });
    this.styleManager.addStyle('tu-button-large', {
      selector: `.${BUTTON_BASE}--large`,
      properties: {
        fontSize: '18px',
        padding: '13px 28px',
      },
    });

    this.styleManager.addStyle('tu-button-block', {
      selector: `.${BUTTON_BASE}--block`,
      properties: {
        display: 'flex',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-button-round', {
      selector: `.${BUTTON_BASE}--round`,
      properties: {
        borderRadius: '999px',
      },
    });
    this.styleManager.addStyle('tu-button-disabled', {
      selector: `.${BUTTON_BASE}--disabled`,
      properties: {
        opacity: 0.5,
      },
    });
    this.styleManager.addStyle('tu-button-loading', {
      selector: `.${BUTTON_BASE}--loading`,
      properties: {
        opacity: 0.7,
      },
    });
    this.styleManager.addStyle('tu-button-label', {
      selector: '.tu-button__label',
      properties: {
        alignItems: 'center',
        display: 'inline-flex',
        gap: '6px',
      },
    });
  }

  protected render(): VNode {
    const cls = `${BUTTON_BASE} ${BUTTON_BASE}--${this.props.type || 'default'} ${BUTTON_BASE}--${this.props.size || 'medium'}${this.props.block ? ` ${BUTTON_BASE}--block` : ''}${this.props.plain ? ` ${BUTTON_BASE}--plain` : ''}${this.props.round ? ` ${BUTTON_BASE}--round` : ''}${this.props.disabled ? ` ${BUTTON_BASE}--disabled` : ''}${this.props.loading ? ` ${BUTTON_BASE}--loading` : ''}`;
    const content = this.props.loading
      ? h('span', { className: 'tu-button__label' }, [
          `${this.props.loadingText || '加载中…'}`,
        ])
      : slot('default');
    return h(
      'div',
      {
        className: cls,
        hoverClass: HOVER_CLASS,
      },
      [content],
      {
        click: () => this.onClick(),
      }
    );
  }

  protected onClick(): void {
    if (this.props.disabled || this.props.loading) {
      return;
    }
    this.emit('click');
  }
}
