import { Component, h, slot, type VNode } from 'transone';

export type TuPopupPosition = 'top' | 'right' | 'bottom' | 'left';

export interface TuPopupProps {
  /** 是否可见（受控：父级切换该值驱动滑入/滑出动画）。 */
  visible?: boolean;
  /** 弹出方向，默认 bottom。 */
  position?: TuPopupPosition;
  /** 是否显示遮罩，默认 true。 */
  mask?: boolean;
  /** 点击遮罩是否触发 close，默认 true。 */
  maskClosable?: boolean;
  /** 面板圆角，默认 true（bottom 顶部圆角 / 侧边内缘圆角）。 */
  round?: boolean;
  /** 内容（插槽）。 */
  children?: Array<VNode | string>;
}

const POPUP_BASE = 'tu-popup';

/**
 * TuPopup 弹出层：从 top / right / bottom / left 四个方向滑入滑出。
 *
 * 实现要点：
 * - 根容器 `position: fixed` 铺满视口，始终挂载；隐藏态通过 visibility +
 *   transform 离屏 + pointer-events 隔离交互，进入/退出动画全部由 CSS
 *   transition 驱动，无需 JS 计时（可见性延迟一个动画周期）。
 * - 完全受控：visible 由父级维护；点击遮罩触发 `close` 自定义事件。
 * - 小程序端 WXSS 同样支持 transition / transform / visibility，
 *   同一份源码编译出完全一致的结构与动效。
 */
export class TuPopup extends Component<TuPopupProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-popup', {
      selector: `.${POPUP_BASE}`,
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
    this.styleManager.addStyle('tu-popup-visible', {
      selector: `.${POPUP_BASE}--visible`,
      properties: {
        pointerEvents: 'auto',
        transition: 'visibility 0s',
        visibility: 'visible',
      },
    });

    this.styleManager.addStyle('tu-popup-mask', {
      selector: '.tu-popup__mask',
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
    this.styleManager.addStyle('tu-popup-mask-visible', {
      selector: `.${POPUP_BASE}--visible .tu-popup__mask`,
      properties: {
        opacity: '1',
        visibility: 'visible',
      },
    });

    this.styleManager.addStyle('tu-popup-panel', {
      selector: '.tu-popup__panel',
      properties: {
        background: '#ffffff',
        boxSizing: 'border-box',
        overflowY: 'auto',
        position: 'absolute',
        transition: 'transform var(--tu-duration, 300ms) ease, visibility 0s var(--tu-duration, 300ms)',
        visibility: 'hidden',
      },
    });
    this.styleManager.addStyle('tu-popup-panel-visible', {
      selector: `.${POPUP_BASE}--visible .tu-popup__panel`,
      properties: {
        transition: 'transform var(--tu-duration, 300ms) ease, visibility 0s',
        visibility: 'visible',
      },
    });

    // —— 四个方向：初始离屏位 + 可见位（visible 类在根节点，panel 无位移覆盖）——
    this.styleManager.addStyle('tu-popup-bottom', {
      selector: `.${POPUP_BASE}--bottom .tu-popup__panel`,
      properties: {
        bottom: '0',
        left: '0',
        maxHeight: '90%',
        right: '0',
        transform: 'translateY(100%)',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-popup-bottom-visible', {
      selector: `.${POPUP_BASE}--bottom.${POPUP_BASE}--visible .tu-popup__panel`,
      properties: {
        transform: 'translateY(0)',
      },
    });
    this.styleManager.addStyle('tu-popup-top', {
      selector: `.${POPUP_BASE}--top .tu-popup__panel`,
      properties: {
        left: '0',
        maxHeight: '90%',
        right: '0',
        top: '0',
        transform: 'translateY(-100%)',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-popup-top-visible', {
      selector: `.${POPUP_BASE}--top.${POPUP_BASE}--visible .tu-popup__panel`,
      properties: {
        transform: 'translateY(0)',
      },
    });
    this.styleManager.addStyle('tu-popup-left', {
      selector: `.${POPUP_BASE}--left .tu-popup__panel`,
      properties: {
        bottom: '0',
        left: '0',
        maxWidth: '90%',
        top: '0',
        transform: 'translateX(-100%)',
        width: '75%',
      },
    });
    this.styleManager.addStyle('tu-popup-left-visible', {
      selector: `.${POPUP_BASE}--left.${POPUP_BASE}--visible .tu-popup__panel`,
      properties: {
        transform: 'translateX(0)',
      },
    });
    this.styleManager.addStyle('tu-popup-right', {
      selector: `.${POPUP_BASE}--right .tu-popup__panel`,
      properties: {
        bottom: '0',
        maxWidth: '90%',
        right: '0',
        top: '0',
        transform: 'translateX(100%)',
        width: '75%',
      },
    });
    this.styleManager.addStyle('tu-popup-right-visible', {
      selector: `.${POPUP_BASE}--right.${POPUP_BASE}--visible .tu-popup__panel`,
      properties: {
        transform: 'translateX(0)',
      },
    });

    // —— 圆角：bottom 顶部圆角，top 底部圆角，left/right 内缘圆角 ——
    this.styleManager.addStyle('tu-popup-round-bottom', {
      selector: `.${POPUP_BASE}--bottom .tu-popup__panel--round`,
      properties: {
        borderTopLeftRadius: 'var(--tu-radius-lg, 12px)',
        borderTopRightRadius: 'var(--tu-radius-lg, 12px)',
      },
    });
    this.styleManager.addStyle('tu-popup-round-top', {
      selector: `.${POPUP_BASE}--top .tu-popup__panel--round`,
      properties: {
        borderBottomLeftRadius: 'var(--tu-radius-lg, 12px)',
        borderBottomRightRadius: 'var(--tu-radius-lg, 12px)',
      },
    });
    this.styleManager.addStyle('tu-popup-round-left', {
      selector: `.${POPUP_BASE}--left .tu-popup__panel--round`,
      properties: {
        borderTopRightRadius: 'var(--tu-radius-lg, 12px)',
        borderBottomRightRadius: 'var(--tu-radius-lg, 12px)',
      },
    });
    this.styleManager.addStyle('tu-popup-round-right', {
      selector: `.${POPUP_BASE}--right .tu-popup__panel--round`,
      properties: {
        borderTopLeftRadius: 'var(--tu-radius-lg, 12px)',
        borderBottomLeftRadius: 'var(--tu-radius-lg, 12px)',
      },
    });
  }

  protected render(): VNode {
    const visible = this.props.visible === true;
    const position = this.props.position || 'bottom';
    const rootCls = `${POPUP_BASE} ${POPUP_BASE}--${position}${visible ? ` ${POPUP_BASE}--visible` : ''}`;
    const maskCls = 'tu-popup__mask';
    const panelCls = `tu-popup__panel${visible ? ' tu-popup__panel--visible' : ''}${this.props.round !== false ? ' tu-popup__panel--round' : ''}`;
    return h('div', { className: rootCls }, [
      h(
        'div',
        { className: maskCls },
        [],
        { click: () => this.onMaskClick() },
        undefined,
        { show: this.props.mask !== false }
      ),
      h('div', { className: panelCls }, [slot('default')]),
    ]);
  }

  protected onMaskClick(): void {
    if (this.props.maskClosable === false) {
      return;
    }
    this.emit('close');
  }
}
