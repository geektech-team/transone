import { Component, h, slot, type VNode } from 'transone';

export type TuTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface TuTagProps {
  /** 标签类型，默认 primary。 */
  type?: TuTagType;
  /** 朴素：透明底 + 主题色文字。 */
  plain?: boolean;
  /** 圆角胶囊。 */
  round?: boolean;
  /** 可关闭：右侧显示 ×，点击触发 `close` 事件。 */
  closable?: boolean;
  /** 标识：close 事件回传该值（便于列表场景区分是哪个标签被关闭）。 */
  name?: string | number;
  /** 标签内容（插槽）。 */
  children?: Array<VNode | string>;
}

const TAG_BASE = 'tu-tag';
const TAG_CLOSE = 'tu-tag__close';

/**
 * TuTag 标签：type / plain / round / closable。
 * 内容走插槽；点关闭按钮触发 `close` 自定义事件（是否移除由父级决定）。
 */
export class TuTag extends Component<TuTagProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-tag', {
      selector: `.${TAG_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'var(--tu-primary, #1677ff)',
        borderRadius: 'var(--tu-radius-sm, 4px)',
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'inline-flex',
        fontSize: '12px',
        gap: '4px',
        lineHeight: 1,
        padding: '4px 8px',
      },
    });
    this.styleManager.addStyle('tu-tag-success', {
      selector: `.${TAG_BASE}--success`,
      properties: {
        background: 'var(--tu-success, #00b578)',
      },
    });
    this.styleManager.addStyle('tu-tag-warning', {
      selector: `.${TAG_BASE}--warning`,
      properties: {
        background: 'var(--tu-warning, #ff8f1f)',
      },
    });
    this.styleManager.addStyle('tu-tag-danger', {
      selector: `.${TAG_BASE}--danger`,
      properties: {
        background: 'var(--tu-danger, #ff3141)',
      },
    });
    this.styleManager.addStyle('tu-tag-info', {
      selector: `.${TAG_BASE}--info`,
      properties: {
        background: 'var(--tu-info, #969799)',
      },
    });

    this.styleManager.addStyle('tu-tag-plain', {
      selector: `.${TAG_BASE}--plain`,
      properties: {
        background: 'transparent',
      },
    });
    this.styleManager.addStyle('tu-tag-plain-primary', {
      selector: `.${TAG_BASE}--plain.${TAG_BASE}--primary`,
      properties: {
        color: 'var(--tu-primary, #1677ff)',
      },
    });
    this.styleManager.addStyle('tu-tag-plain-success', {
      selector: `.${TAG_BASE}--plain.${TAG_BASE}--success`,
      properties: {
        color: 'var(--tu-success, #00b578)',
      },
    });
    this.styleManager.addStyle('tu-tag-plain-warning', {
      selector: `.${TAG_BASE}--plain.${TAG_BASE}--warning`,
      properties: {
        color: 'var(--tu-warning, #ff8f1f)',
      },
    });
    this.styleManager.addStyle('tu-tag-plain-danger', {
      selector: `.${TAG_BASE}--plain.${TAG_BASE}--danger`,
      properties: {
        color: 'var(--tu-danger, #ff3141)',
      },
    });
    this.styleManager.addStyle('tu-tag-plain-info', {
      selector: `.${TAG_BASE}--plain.${TAG_BASE}--info`,
      properties: {
        color: 'var(--tu-info, #969799)',
      },
    });

    this.styleManager.addStyle('tu-tag-round', {
      selector: `.${TAG_BASE}--round`,
      properties: {
        borderRadius: '999px',
      },
    });
    this.styleManager.addStyle('tu-tag-close', {
      selector: `.${TAG_CLOSE}`,
      properties: {
        alignItems: 'center',
        display: 'inline-flex',
        fontSize: '14px',
        fontWeight: '600',
        justifyContent: 'center',
        lineHeight: 1,
        marginLeft: '2px',
        padding: '0 0 0 2px',
      },
    });
  }

  protected render(): VNode {
    const cls = `${TAG_BASE} ${TAG_BASE}--${this.props.type || 'primary'}${this.props.plain ? ` ${TAG_BASE}--plain` : ''}${this.props.round ? ` ${TAG_BASE}--round` : ''}`;
    return h(
      'div',
      { className: cls },
      [
        slot('default'),
        h(
          'span',
          { className: TAG_CLOSE },
          ['×'],
          { click: () => this.onClose() },
          undefined,
          { show: this.props.closable === true }
        ),
      ]
    );
  }

  protected onClose(): void {
    this.emit('close', this.props.name);
  }
}
