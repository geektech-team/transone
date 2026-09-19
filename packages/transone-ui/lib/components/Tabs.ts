import { Component, each, h, type VNode } from 'transone';

export interface TuTabItem {
  /** 选项卡标题。 */
  title: string;
  /** 禁用（不响应点击）。 */
  disabled?: boolean;
}

export interface TuTabsProps {
  /** 选项卡列表。 */
  items?: TuTabItem[];
  /** 当前激活索引（受控：change 事件回传新索引）。 */
  active?: number;
  /** 激活文字颜色，默认主题色。 */
  activeColor?: string;
  /** 底部指示线颜色，默认主题色。 */
  lineColor?: string;
  /** 是否均分等宽（默认内容宽度自适应）。 */
  equal?: boolean;
}

const TABS_BASE = 'tu-tabs';

/**
 * TuTabs 标签页导航：横向选项条 + 底部指示线。
 * 完全受控：点击选项触发 `change`（回传索引），
 * 指示线与激活样式由 active 驱动，跨端一致。
 */
export class TuTabs extends Component<TuTabsProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-tabs', {
      selector: `.${TABS_BASE}`,
      properties: {
        background: '#ffffff',
        boxSizing: 'border-box',
        position: 'relative',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-tabs-nav', {
      selector: '.tu-tabs__nav',
      properties: {
        alignItems: 'center',
        display: 'flex',
        height: '44px',
        position: 'relative',
      },
    });
    this.styleManager.addStyle('tu-tabs-item', {
      selector: '.tu-tabs__item',
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '14px',
        height: '100%',
        justifyContent: 'center',
        lineHeight: 1,
        padding: '0 16px',
        position: 'relative',
      },
    });
    this.styleManager.addStyle('tu-tabs-item-equal', {
      selector: `.${TABS_BASE}--equal .tu-tabs__item`,
      properties: {
        flex: '1',
      },
    });
    this.styleManager.addStyle('tu-tabs-item-disabled', {
      selector: '.tu-tabs__item--disabled',
      properties: {
        opacity: 0.4,
      },
    });
    this.styleManager.addStyle('tu-tabs-title', {
      selector: '.tu-tabs__title',
      properties: {
        color: 'var(--tu-text, #323233)',
        lineHeight: 1,
      },
    });
    this.styleManager.addStyle('tu-tabs-line', {
      selector: '.tu-tabs__line',
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderRadius: '2px',
        bottom: '6px',
        height: '3px',
        left: '50%',
        position: 'absolute',
        transform: 'translateX(-50%)',
        width: '16px',
      },
    });
  }

  protected render(): VNode {
    const items = this.props.items || [];
    const rootCls = `${TABS_BASE}${this.props.equal ? ` ${TABS_BASE}--equal` : ''}`;
    return h('div', { className: rootCls }, [
      h(
        'div',
        { className: 'tu-tabs__nav' },
        each(
          items,
          (item, index) =>
            h(
              'div',
              {
                className: `tu-tabs__item${this.props.active === index ? ' tu-tabs__item--active' : ''}${item.disabled ? ' tu-tabs__item--disabled' : ''}`,
                style: {
                  color:
                    this.props.active === index
                      ? this.props.activeColor || 'var(--tu-primary, #1677ff)'
                      : '',
                },
                dataIndex: index,
              },
              [
                h('span', { className: 'tu-tabs__title' }, [`${item.title}`]),
                h(
                  'span',
                  {
                    className: 'tu-tabs__line',
                    style: {
                      backgroundColor:
                        this.props.active === index
                          ? this.props.lineColor ||
                            this.props.activeColor ||
                            'var(--tu-primary, #1677ff)'
                          : 'transparent',
                    },
                  },
                  [],
                  undefined,
                  undefined,
                  { show: this.props.active === index }
                ),
              ],
              { click: (e) => this.onTabTap(e) }
            ),
          (_item, index) => index
        )
      ),
    ]);
  }

  protected onTabTap(e: unknown): void {
    const dataset = (e as { currentTarget?: { dataset?: Record<string, string> } })
      .currentTarget?.dataset;
    const index = dataset && dataset.index !== undefined ? Number(dataset.index) : -1;
    const items = this.props.items || [];
    if (index < 0 || index >= items.length) {
      return;
    }
    if (items[index].disabled) {
      return;
    }
    this.emit('change', index);
  }
}
