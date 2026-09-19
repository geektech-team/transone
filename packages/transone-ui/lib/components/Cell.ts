import { Component, h, type VNode } from 'transone';

export type TuCellArrowDirection = 'right' | 'up' | 'down';

export interface TuCellProps {
  /** 左侧主文案。 */
  title?: string;
  /** 标题下方说明文案。 */
  label?: string;
  /** 右侧值文案。 */
  value?: string;
  /** 是否必填（标题前红点）。 */
  required?: boolean;
  /** 是否显示箭头。 */
  isLink?: boolean;
  /** 箭头方向，默认 right。 */
  arrowDirection?: TuCellArrowDirection;
  /** 禁用（不响应点击）。 */
  disabled?: boolean;
  /** 是否显示底部边框。 */
  border?: boolean;
  /** 是否居中垂直（label 存在时默认顶部对齐）。 */
  center?: boolean;
}

const CELL_BASE = 'tu-cell';

/**
 * TuCell 单元格：标题 / 说明 / 右侧值 / 箭头。
 * 点击触发 `click` 事件（禁用时不触发）。
 * 箭头由 CSS 边框旋转绘制，跨端一致。
 */
export class TuCell extends Component<TuCellProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-cell', {
      selector: `.${CELL_BASE}`,
      properties: {
        alignItems: 'center',
        background: '#ffffff',
        boxSizing: 'border-box',
        display: 'flex',
        fontSize: '14px',
        minHeight: '48px',
        padding: '10px 16px',
        position: 'relative',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-cell-border', {
      selector: `.${CELL_BASE}--border`,
      properties: {
        borderBottom: '1px solid var(--tu-border, #ebedf0)',
      },
    });
    this.styleManager.addStyle('tu-cell-disabled', {
      selector: `.${CELL_BASE}--disabled`,
      properties: {
        opacity: 0.5,
      },
    });
    this.styleManager.addStyle('tu-cell-left', {
      selector: '.tu-cell__left',
      properties: {
        alignItems: 'flex-start',
        display: 'flex',
        flex: '1',
        flexDirection: 'column',
        gap: '2px',
        justifyContent: 'center',
        minWidth: '0',
      },
    });
    this.styleManager.addStyle('tu-cell-title', {
      selector: '.tu-cell__title',
      properties: {
        color: 'var(--tu-text, #323233)',
        display: 'flex',
        fontSize: '14px',
        lineHeight: 1.4,
      },
    });
    this.styleManager.addStyle('tu-cell-required', {
      selector: '.tu-cell__required',
      properties: {
        color: 'var(--tu-danger, #ff3141)',
        display: 'inline-block',
        fontSize: '14px',
        lineHeight: 1,
        marginRight: '4px',
      },
    });
    this.styleManager.addStyle('tu-cell-label', {
      selector: '.tu-cell__label',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '12px',
        lineHeight: 1.4,
      },
    });
    this.styleManager.addStyle('tu-cell-right', {
      selector: '.tu-cell__right',
      properties: {
        alignItems: 'center',
        color: 'var(--tu-text-secondary, #969799)',
        display: 'flex',
        flexShrink: '0',
        fontSize: '14px',
        justifyContent: 'flex-end',
        lineHeight: 1.4,
        marginLeft: '12px',
      },
    });
    this.styleManager.addStyle('tu-cell-arrow', {
      selector: '.tu-cell__arrow',
      properties: {
        border: '1px solid var(--tu-text-secondary, #969799)',
        borderBottom: 'none',
        borderLeft: 'none',
        boxSizing: 'border-box',
        height: '8px',
        marginLeft: '4px',
        transform: 'rotate(45deg)',
        width: '8px',
      },
    });
    this.styleManager.addStyle('tu-cell-arrow-up', {
      selector: `.tu-cell__arrow--up`,
      properties: {
        marginTop: '4px',
        transform: 'rotate(-135deg)',
      },
    });
    this.styleManager.addStyle('tu-cell-arrow-down', {
      selector: `.tu-cell__arrow--down`,
      properties: {
        marginTop: '-4px',
        transform: 'rotate(135deg)',
      },
    });
  }

  protected render(): VNode {
    const arrowDirection = this.props.arrowDirection || 'right';
    const cls = `${CELL_BASE}${this.props.border !== false ? ` ${CELL_BASE}--border` : ''}${this.props.disabled ? ` ${CELL_BASE}--disabled` : ''}`;
    return h(
      'div',
      { className: cls },
      [
        h('div', { className: 'tu-cell__left' }, [
          h('div', { className: 'tu-cell__title' }, [
            h(
              'span',
              { className: 'tu-cell__required' },
              ['*'],
              undefined,
              undefined,
              { show: this.props.required === true }
            ),
            h('span', { className: 'tu-cell__title-text' }, [`${this.props.title || ''}`]),
          ]),
          h(
            'div',
            { className: 'tu-cell__label' },
            [`${this.props.label || ''}`],
            undefined,
            undefined,
            { show: !!this.props.label }
          ),
        ]),
        h('div', { className: 'tu-cell__right' }, [
          h(
            'span',
            { className: 'tu-cell__value' },
            [`${this.props.value || ''}`],
            undefined,
            undefined,
            { show: !!this.props.value }
          ),
          h(
            'span',
            { className: `tu-cell__arrow tu-cell__arrow--${arrowDirection}` },
            [],
            undefined,
            undefined,
            { show: this.props.isLink === true }
          ),
        ]),
      ],
      { click: () => this.onClick() }
    );
  }

  protected onClick(): void {
    if (this.props.disabled) {
      return;
    }
    this.emit('click');
  }
}
