import { Component, h, slot, type VNode } from 'transone';

export interface TuModalProps {
  /** 是否显示（受控）。 */
  visible?: boolean;
  /** 标题。 */
  title?: string;
  /** 内容文本。 */
  content?: string;
  /** 确认按钮文案，默认「确认」。 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」。 */
  cancelText?: string;
  /** 是否显示取消按钮，默认 true。 */
  showCancel?: boolean;
  /** 确认按钮加载态（不响应点击）。 */
  confirmLoading?: boolean;
  /** 点击遮罩是否触发 close，默认 false。 */
  maskClosable?: boolean;
  /** 内容插槽（覆盖 content 文本）。 */
  children?: Array<VNode | string>;
}

const MODAL_BASE = 'tu-modal';

/**
 * TuModal 确认弹窗：居中面板 + 遮罩。
 * 完全受控：visible 由父级维护；确认 / 取消 / 遮罩关闭分别触发
 * `confirm` / `cancel` / `close` 事件。动画由 visibility + opacity
 * 过渡驱动，隐藏态 pointer-events 隔离交互。
 */
export class TuModal extends Component<TuModalProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-modal', {
      selector: `.${MODAL_BASE}`,
      properties: {
        alignItems: 'center',
        bottom: '0',
        display: 'flex',
        justifyContent: 'center',
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
    this.styleManager.addStyle('tu-modal-visible', {
      selector: `.${MODAL_BASE}--visible`,
      properties: {
        pointerEvents: 'auto',
        transition: 'visibility 0s',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-modal-mask', {
      selector: '.tu-modal__mask',
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
    this.styleManager.addStyle('tu-modal-mask-visible', {
      selector: `.${MODAL_BASE}--visible .tu-modal__mask`,
      properties: {
        opacity: '1',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-modal-panel', {
      selector: '.tu-modal__panel',
      properties: {
        background: '#ffffff',
        borderRadius: 'var(--tu-radius-lg, 12px)',
        boxSizing: 'border-box',
        opacity: '0',
        overflow: 'hidden',
        padding: '24px 20px 16px',
        position: 'relative',
        transform: 'scale(0.9)',
        transition: 'opacity var(--tu-duration, 300ms) ease, transform var(--tu-duration, 300ms) ease',
        visibility: 'hidden',
        width: '85%',
        maxWidth: '320px',
      },
    });
    this.styleManager.addStyle('tu-modal-panel-visible', {
      selector: `.${MODAL_BASE}--visible .tu-modal__panel`,
      properties: {
        opacity: '1',
        transform: 'scale(1)',
        visibility: 'visible',
      },
    });
    this.styleManager.addStyle('tu-modal-title', {
      selector: '.tu-modal__title',
      properties: {
        color: 'var(--tu-text, #323233)',
        fontSize: '18px',
        fontWeight: '600',
        lineHeight: 1.4,
        textAlign: 'center',
      },
    });
    this.styleManager.addStyle('tu-modal-content', {
      selector: '.tu-modal__content',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '14px',
        lineHeight: 1.6,
        marginTop: '12px',
        minHeight: '20px',
        textAlign: 'center',
      },
    });
    this.styleManager.addStyle('tu-modal-actions', {
      selector: '.tu-modal__actions',
      properties: {
        borderTop: '1px solid var(--tu-border, #ebedf0)',
        display: 'flex',
        marginTop: '20px',
        marginLeft: '-20px',
        marginRight: '-20px',
      },
    });
    this.styleManager.addStyle('tu-modal-btn', {
      selector: '.tu-modal__btn',
      properties: {
        alignItems: 'center',
        background: 'transparent',
        boxSizing: 'border-box',
        color: 'var(--tu-text, #323233)',
        display: 'flex',
        flex: '1',
        fontSize: '16px',
        height: '50px',
        justifyContent: 'center',
        lineHeight: '50px',
      },
    });
    this.styleManager.addStyle('tu-modal-btn-border', {
      selector: '.tu-modal__btn + .tu-modal__btn',
      properties: {
        borderLeft: '1px solid var(--tu-border, #ebedf0)',
      },
    });
    this.styleManager.addStyle('tu-modal-confirm', {
      selector: '.tu-modal__btn--confirm',
      properties: {
        color: 'var(--tu-primary, #1677ff)',
        fontWeight: '500',
      },
    });
    this.styleManager.addStyle('tu-modal-danger', {
      selector: '.tu-modal__btn--danger',
      properties: {
        color: 'var(--tu-danger, #ff3141)',
      },
    });
    this.styleManager.addStyle('tu-modal-disabled', {
      selector: '.tu-modal__btn--disabled',
      properties: {
        opacity: 0.5,
      },
    });
  }

  protected render(): VNode {
    const visible = this.props.visible === true;
    const showCancel = this.props.showCancel !== false;
    const hasChildren = this.props.children && this.props.children.length > 0;
    const hasContent = !!this.props.content;
    const rootCls = `${MODAL_BASE}${visible ? ` ${MODAL_BASE}--visible` : ''}`;
    return h('div', { className: rootCls }, [
      h(
        'div',
        { className: 'tu-modal__mask' },
        [],
        { click: () => this.onMaskClick() }
      ),
      h('div', { className: 'tu-modal__panel' }, [
        h('div', { className: 'tu-modal__title' }, [`${this.props.title || ''}`], undefined, undefined, { show: !!this.props.title }),
        h('div', { className: 'tu-modal__content' }, [slot('default')], undefined, undefined, { show: hasChildren }),
        h('div', { className: 'tu-modal__content' }, [`${this.props.content || ''}`], undefined, undefined, { show: !hasChildren && hasContent }),
        h('div', { className: 'tu-modal__actions' }, [
          h(
            'div',
            { className: 'tu-modal__btn tu-modal__btn--cancel' },
            [`${this.props.cancelText || '取消'}`],
            { click: () => this.onCancel() },
            undefined,
            { show: showCancel }
          ),
          h(
            'div',
            {
              className: `tu-modal__btn tu-modal__btn--confirm${this.props.confirmLoading ? ' tu-modal__btn--disabled' : ''}`,
            },
            [`${this.props.confirmText || '确认'}`],
            { click: () => this.onConfirm() }
          ),
        ]),
      ]),
    ]);
  }

  protected onMaskClick(): void {
    if (this.props.maskClosable === true) {
      this.emit('close');
    }
  }

  protected onCancel(): void {
    this.emit('cancel');
  }

  protected onConfirm(): void {
    if (this.props.confirmLoading === true) {
      return;
    }
    this.emit('confirm');
  }
}
