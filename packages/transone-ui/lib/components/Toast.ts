import { Component, h, type VNode } from 'transone';

export type TuToastPosition = 'top' | 'center' | 'bottom';

export interface TuToastProps {
  /** 是否显示（受控：父级切换；时长由父级控制，见 duration）。 */
  visible?: boolean;
  /** 提示文案。 */
  content?: string;
  /** 出现位置，默认 center。 */
  position?: TuToastPosition;
  /**
   * 显示时长（毫秒，默认 2000），供父级参考：
   * 组件不做自动关闭，父级在打开后自行 setTimeout 关闭，
   * 该方法在小程序页面方法中同样可用。
   */
  duration?: number;
  /** 点击 toast 是否触发 close（用于可手动关闭的场景）。 */
  closable?: boolean;
}

const TOAST_BASE = 'tu-toast';

/**
 * TuToast 轻提示：深色半透明胶囊、白字，top / center / bottom 三位置。
 * 完全受控：visible 由父级维护；点击触发 `close` 事件。
 * 自动关闭由父级定时（Web 与小程序均支持 setTimeout）。
 */
export class TuToast extends Component<TuToastProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-toast', {
      selector: `.${TOAST_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        borderRadius: '999px',
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'flex',
        fontSize: '14px',
        justifyContent: 'center',
        left: '50%',
        lineHeight: 1.5,
        maxWidth: '80%',
        padding: '10px 18px',
        position: 'fixed',
        transform: 'translateX(-50%)',
        zIndex: 'var(--tu-popup-z-index, 1000)',
      },
    });
    this.styleManager.addStyle('tu-toast-top', {
      selector: `.${TOAST_BASE}--top`,
      properties: {
        top: '15%',
      },
    });
    this.styleManager.addStyle('tu-toast-center', {
      selector: `.${TOAST_BASE}--center`,
      properties: {
        top: '50%',
        transform: 'translate(-50%, -50%)',
      },
    });
    this.styleManager.addStyle('tu-toast-bottom', {
      selector: `.${TOAST_BASE}--bottom`,
      properties: {
        bottom: '20%',
        top: 'auto',
        transform: 'translateX(-50%)',
      },
    });
  }

  protected render(): VNode {
    const position = this.props.position || 'center';
    const cls = `${TOAST_BASE} ${TOAST_BASE}--${position}`;
    return h(
      'div',
      { className: cls },
      [`${this.props.content || ''}`],
      { click: () => this.onClick() },
      undefined,
      { show: this.props.visible === true }
    );
  }

  protected onClick(): void {
    if (this.props.closable === true) {
      this.emit('close');
    }
  }
}
