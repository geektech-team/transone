import { Component, each, h, type VNode } from 'transone';

export interface TuActionSheetItem {
  /** 选项文案。 */
  name: string;
  /** 文字颜色（如危险操作红色）。 */
  color?: string;
  /** 禁用（不响应点击）。 */
  disabled?: boolean;
}

export interface TuActionSheetProps {
  /** 是否显示（受控）。 */
  visible?: boolean;
  /** 动作项列表。 */
  actions?: TuActionSheetItem[];
  /** 取消按钮文案，默认「取消」。 */
  cancelText?: string;
  /** 面板顶部提示文案。 */
  description?: string;
}

const SHEET_BASE = 'tu-actionsheet';

/**
 * TuActionSheet 底部动作面板：遮罩 + 底部选项列表 + 取消按钮。
 * 完全受控：visible 由父级维护；选中某项触发 `select`（回传索引），
 * 点击取消 / 遮罩触发 `cancel`。滑入滑出动画由 visibility + transform 过渡驱动。
 */
export class TuActionSheet extends Component<TuActionSheetProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-actionsheet', {
      selector: `.${SHEET_BASE}`,
      properties: {
        bottom: '0',
        left: '0',
        pointerEvents: 'none',
        position: 'fixed',
        right: '0',
        top: '0',
        transition: 'visibility 0s var(--tu-duration, 300ms)',
        visibility: 'hidden',
        zIndex: 'var(--tu-popup-z-index, 1000)',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-visible', {
      selector: `.${SHEET_BASE}--visible`,
      properties: {
        pointerEvents: 'auto',
        transition: 'visibility 0s',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-mask', {
      selector: '.tu-actionsheet__mask',
      properties: {
        background: 'rgba(0, 0, 0, 0.55)',
        bottom: '0',
        left: '0',
        opacity: '0',
        position: 'absolute',
        right: '0',
        top: '0',
        transition: 'opacity var(--tu-duration, 300ms) ease',
        visibility: 'hidden',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-mask-visible', {
      selector: `.${SHEET_BASE}--visible .tu-actionsheet__mask`,
      properties: {
        opacity: '1',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-panel', {
      selector: '.tu-actionsheet__panel',
      properties: {
        background: '#ffffff',
        bottom: '0',
        boxSizing: 'border-box',
        left: '0',
        paddingBottom: '8px',
        position: 'absolute',
        right: '0',
        transform: 'translateY(100%)',
        transition: 'transform var(--tu-duration, 300ms) ease, visibility 0s var(--tu-duration, 300ms)',
        visibility: 'hidden',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-panel-visible', {
      selector: `.${SHEET_BASE}--visible .tu-actionsheet__panel`,
      properties: {
        transform: 'translateY(0)',
        transition: 'transform var(--tu-duration, 300ms) ease, visibility 0s',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-panel-safe', {
      selector: '.tu-actionsheet__panel',
      properties: {
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-desc', {
      selector: '.tu-actionsheet__desc',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '13px',
        lineHeight: 1.5,
        padding: '14px 16px 6px',
        textAlign: 'center',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-item', {
      selector: '.tu-actionsheet__item',
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        color: 'var(--tu-text, #323233)',
        display: 'flex',
        fontSize: '16px',
        height: '52px',
        justifyContent: 'center',
        lineHeight: '52px',
        padding: '0 16px',
        textAlign: 'center',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-item-border', {
      selector: '.tu-actionsheet__item + .tu-actionsheet__item',
      properties: {
        borderTop: '1px solid var(--tu-border, #ebedf0)',
      },
    });
    this.styleManager.addStyle('tu-actionsheet-item-disabled', {
      selector: '.tu-actionsheet__item--disabled',
      properties: {
        opacity: 0.4,
      },
    });
    this.styleManager.addStyle('tu-actionsheet-cancel', {
      selector: '.tu-actionsheet__cancel',
      properties: {
        alignItems: 'center',
        background: '#ffffff',
        boxSizing: 'border-box',
        color: 'var(--tu-text-secondary, #969799)',
        display: 'flex',
        fontSize: '16px',
        height: '52px',
        justifyContent: 'center',
        lineHeight: '52px',
        marginTop: '8px',
        textAlign: 'center',
      },
    });
  }

  protected render(): VNode {
    const visible = this.props.visible === true;
    const rootCls = `${SHEET_BASE}${visible ? ` ${SHEET_BASE}--visible` : ''}`;
    const actions = this.props.actions || [];
    return h('div', { className: rootCls }, [
      h(
        'div',
        { className: 'tu-actionsheet__mask' },
        [],
        { click: () => this.onMaskClick() }
      ),
      h('div', { className: 'tu-actionsheet__panel' }, [
        h(
          'div',
          { className: 'tu-actionsheet__desc' },
          [`${this.props.description || ''}`],
          undefined,
          undefined,
          { show: !!this.props.description }
        ),
        h(
          'div',
          { className: 'tu-actionsheet__list' },
          each(
            actions,
            (item, index) =>
              h(
                'div',
                {
                  className: `tu-actionsheet__item${item.disabled ? ' tu-actionsheet__item--disabled' : ''}`,
                  style: { color: item.color || '' },
                  dataIndex: index,
                },
                [`${item.name}`],
                { click: (e) => this.onItemTap(e) }
              ),
            (_item, index) => index
          )
        ),
        h(
          'div',
          { className: 'tu-actionsheet__cancel' },
          [`${this.props.cancelText || '取消'}`],
          { click: () => this.onCancel() }
        ),
      ]),
    ]);
  }

  protected onMaskClick(): void {
    this.emit('cancel');
  }

  protected onCancel(): void {
    this.emit('cancel');
  }

  protected onItemTap(e: unknown): void {
    const dataset = (e as { currentTarget?: { dataset?: Record<string, string> } })
      .currentTarget?.dataset;
    const index = dataset && dataset.index !== undefined ? Number(dataset.index) : -1;
    if (index < 0 || index >= (this.props.actions || []).length) {
      return;
    }
    const item = (this.props.actions || [])[index];
    if (item.disabled) {
      return;
    }
    this.emit('select', index);
  }
}
