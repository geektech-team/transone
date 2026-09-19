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
interface TuPopupState {
  /** 实际应用可见性：方向切换时先置 false 让面板瞬移到新离屏位，再恢复 true 重放滑入。 */
  appliedVisible: boolean;
  /** 方向切换帧临时关闭面板过渡（transition: none），实现瞬移不播放跨方向动画。 */
  noTransition: boolean;
}

export class TuPopup extends Component<TuPopupProps, TuPopupState> {
  /** 上次渲染方向（用于检测方向切换）。 */
  private lastPosition: TuPopupPosition | null = null;
  /** 方向切换后延迟恢复可见性的计时器。 */
  private visibleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 方向切换中间帧标志：setState 触发的更新不再把 appliedVisible 拉回 props。 */
  private pendingPositionTransition = false;

  protected initState(): TuPopupState {
    return { appliedVisible: false, noTransition: false };
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

    this.styleManager.addStyle('tu-popup-panel-no-transition', {
      selector: '.tu-popup__panel--no-transition',
      properties: {
        transition: 'none',
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
    const visible = this.state.appliedVisible === true;
    const position = this.props.position || 'bottom';
    const rootCls = `${POPUP_BASE} ${POPUP_BASE}--${position}${visible ? ` ${POPUP_BASE}--visible` : ''}`;
    const maskCls = 'tu-popup__mask';
    const panelCls = `tu-popup__panel${visible ? ' tu-popup__panel--visible' : ''}${this.state.noTransition === true ? ' tu-popup__panel--no-transition' : ''}${this.props.round !== false ? ' tu-popup__panel--round' : ''}`;
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

  protected onMounted(): void {
    this.syncVisibleState();
  }

  protected onPropsChange(): void {
    // Web 端在每次更新后触发；小程序端由 observers（properties 变化）触发。
    this.syncVisibleState();
  }

  protected onUnmounted(): void {
    if (this.visibleTimer !== null) {
      clearTimeout(this.visibleTimer);
      this.visibleTimer = null;
    }
  }

  /**
   * 可见性同步（方向切换去污染，双端一致）：
   *
   * panel 的滑入/滑出动画由 CSS transition 驱动（transform 离屏位 → 0）。
   * 若方向变化与可见性变化同帧发生，浏览器会把 transform 从「上次方向的
   * 离屏值」直接过渡到「新方向的可见值」（如 translateY(100%) → translateX(0)），
   * 表现为从上次方向弹出。这里在方向变化帧先把面板置于新方向离屏位并
   * 临时关闭过渡（noTransition 状态化，WXSS 与 CSS 同语义），瞬移不播放
   * 跨方向动画；延迟一帧再恢复可见，从新方向正常滑入。
   */
  private syncVisibleState(): void {
    const position = this.props.position || 'bottom';
    const visible = this.props.visible === true;
    const positionChanged =
      this.lastPosition !== null && this.lastPosition !== position;

    // 中间帧（方向切换后由 setState 触发的更新）不清 timer：等待延迟恢复
    if (!this.pendingPositionTransition && this.visibleTimer !== null) {
      clearTimeout(this.visibleTimer);
      this.visibleTimer = null;
    }

    if (positionChanged && visible) {
      // 方向切换 + 可见：先瞬移到新方向离屏位（关闭过渡，取消跨方向动画），
      // 延迟一帧恢复可见，从新方向正常滑入。
      this.pendingPositionTransition = true;
      this.setState({ appliedVisible: false, noTransition: true });
      this.visibleTimer = setTimeout(() => {
        this.visibleTimer = null;
        this.pendingPositionTransition = false;
        if (this.mounted) {
          this.setState({ appliedVisible: true, noTransition: false });
        }
      }, 24);
    } else if (positionChanged) {
      // 方向切换但不可见：面板在屏幕外，动画无感知，仅同步状态
      this.pendingPositionTransition = false;
      this.setState({ appliedVisible: false, noTransition: false });
    } else if (this.pendingPositionTransition) {
      // 方向切换中间帧（由 setState 触发的更新）：等待 timer 恢复可见
    } else if (this.state.appliedVisible !== visible) {
      this.setState({ appliedVisible: visible, noTransition: false });
    }

    this.lastPosition = position;
  }

  protected onMaskClick(): void {
    if (this.props.maskClosable === false) {
      return;
    }
    this.emit('close');
  }
}
