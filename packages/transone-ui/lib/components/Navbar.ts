import { Component, h, type VNode } from 'transone';

export interface TuNavbarProps {
  /** 标题（居中）。 */
  title?: string;
  /** 左侧文案（配合返回箭头使用）。 */
  leftText?: string;
  /** 是否显示返回箭头。 */
  showArrow?: boolean;
  /** 右侧文案。 */
  rightText?: string;
  /** 是否固定顶部（吸顶，需父级留出占位高度）。 */
  fixed?: boolean;
  /** 背景色，默认白色。 */
  background?: string;
  /** 是否显示底部分隔线。 */
  border?: boolean;
}

const NAVBAR_BASE = 'tu-navbar';
const NAVBAR_HEIGHT = 44;

/**
 * TuNavbar 顶部导航栏：左侧箭头 / 文案、居中标题、右侧文案。
 * 点击左侧（箭头 / 文案区域）触发 `clickLeft`，右侧触发 `clickRight`。
 * 标题通过左右等宽占位实现严格居中。
 */
export class TuNavbar extends Component<TuNavbarProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-navbar', {
      selector: `.${NAVBAR_BASE}`,
      properties: {
        alignItems: 'center',
        background: '#ffffff',
        boxSizing: 'border-box',
        display: 'flex',
        height: `${NAVBAR_HEIGHT}px`,
        justifyContent: 'space-between',
        position: 'relative',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-navbar-fixed', {
      selector: `.${NAVBAR_BASE}--fixed`,
      properties: {
        left: '0',
        position: 'fixed',
        right: '0',
        top: '0',
      },
    });
    this.styleManager.addStyle('tu-navbar-border', {
      selector: `.${NAVBAR_BASE}--border`,
      properties: {
        borderBottom: '1px solid var(--tu-border, #ebedf0)',
      },
    });
    this.styleManager.addStyle('tu-navbar-side', {
      selector: '.tu-navbar__side',
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        display: 'flex',
        flex: '0 1 auto',
        minWidth: '68px',
        minHeight: `${NAVBAR_HEIGHT}px`,
      },
    });
    this.styleManager.addStyle('tu-navbar-left', {
      selector: '.tu-navbar__left',
      properties: {
        justifyContent: 'flex-start',
        paddingLeft: '12px',
      },
    });
    this.styleManager.addStyle('tu-navbar-right', {
      selector: '.tu-navbar__right',
      properties: {
        justifyContent: 'flex-end',
        paddingRight: '12px',
      },
    });
    this.styleManager.addStyle('tu-navbar-arrow-gap', {
      selector: '.tu-navbar__arrow',
      properties: {
        marginRight: '4px',
      },
    });
    this.styleManager.addStyle('tu-navbar-arrow', {
      selector: '.tu-navbar__arrow',
      properties: {
        border: '1px solid var(--tu-text, #323233)',
        borderBottom: 'none',
        borderLeft: 'none',
        boxSizing: 'border-box',
        height: '10px',
        transform: 'rotate(45deg)',
        width: '10px',
      },
    });
    this.styleManager.addStyle('tu-navbar-text', {
      selector: '.tu-navbar__text',
      properties: {
        color: 'var(--tu-text, #323233)',
        fontSize: '14px',
        lineHeight: 1,
      },
    });
    this.styleManager.addStyle('tu-navbar-title', {
      selector: '.tu-navbar__title',
      properties: {
        alignItems: 'center',
        bottom: '0',
        boxSizing: 'border-box',
        color: 'var(--tu-text, #323233)',
        display: 'flex',
        fontSize: '17px',
        fontWeight: '500',
        justifyContent: 'center',
        left: '68px',
        lineHeight: 1,
        position: 'absolute',
        right: '68px',
        textAlign: 'center',
        top: '0',
      },
    });
  }

  protected render(): VNode {
    const cls = `${NAVBAR_BASE}${this.props.fixed ? ` ${NAVBAR_BASE}--fixed` : ''}${this.props.border !== false ? ` ${NAVBAR_BASE}--border` : ''}`;
    return h('div', { className: cls, style: { backgroundColor: this.props.background || '#ffffff' } }, [
      h(
        'div',
        { className: 'tu-navbar__side tu-navbar__left' },
        [
          h(
            'span',
            { className: 'tu-navbar__arrow' },
            [],
            undefined,
            undefined,
            { show: this.props.showArrow === true }
          ),
          h(
            'span',
            { className: 'tu-navbar__text' },
            [`${this.props.leftText || ''}`],
            undefined,
            undefined,
            { show: !!this.props.leftText }
          ),
        ],
        { click: () => this.onClickLeft() }
      ),
      h('div', { className: 'tu-navbar__title' }, [`${this.props.title || ''}`]),
      h(
        'div',
        { className: 'tu-navbar__side tu-navbar__right' },
        [
          h(
            'span',
            { className: 'tu-navbar__text' },
            [`${this.props.rightText || ''}`],
            undefined,
            undefined,
            { show: !!this.props.rightText }
          ),
        ],
        { click: () => this.onClickRight() }
      ),
    ]);
  }

  protected onClickLeft(): void {
    this.emit('clickLeft');
  }

  protected onClickRight(): void {
    this.emit('clickRight');
  }
}
