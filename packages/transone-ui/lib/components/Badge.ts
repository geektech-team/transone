import { Component, h, type VNode } from 'transone';

export interface TuBadgeProps {
  /** 徽标内容：数字或文本。 */
  content?: number | string;
  /** 数字上限：content 为数字且超过 max 时显示 max+。 */
  max?: number;
  /** 纯圆点模式（忽略 content 文本）。 */
  dot?: boolean;
  /** 颜色，默认主题色。 */
  color?: string;
  /** 文本颜色，默认白色。 */
  textColor?: string;
}

const BADGE_BASE = 'tu-badge';

/**
 * TuBadge 徽标：数字 / 文本胶囊或红点。
 * 数字超过 max 自动显示为 max+（双端由同一表达式求值）。
 */
export class TuBadge extends Component<TuBadgeProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-badge', {
      selector: `.${BADGE_BASE}`,
      properties: {
        alignItems: 'center',
        background: 'var(--tu-danger, #ff3141)',
        borderRadius: '999px',
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'inline-flex',
        fontSize: '12px',
        height: '18px',
        justifyContent: 'center',
        lineHeight: 1,
        minWidth: '18px',
        padding: '0 6px',
        position: 'relative',
      },
    });
    this.styleManager.addStyle('tu-badge-dot', {
      selector: `.${BADGE_BASE}--dot`,
      properties: {
        borderRadius: '50%',
        height: '8px',
        minWidth: '8px',
        padding: '0',
        width: '8px',
      },
    });
  }

  protected render(): VNode {
    const cls = `${BADGE_BASE}${this.props.dot ? ` ${BADGE_BASE}--dot` : ''}`;
    return h(
      'span',
      {
        className: cls,
        style: {
          backgroundColor: this.props.color || 'var(--tu-danger, #ff3141)',
          color: this.props.textColor || '#ffffff',
        },
      },
      [
        `${
          !!this.props.max &&
          +(this.props.content || 0) > (this.props.max || 0) &&
          (this.props.max || 0) >= 1
            ? `${this.props.max}+`
            : `${this.props.content || ''}`
        }`,
      ],
      undefined,
      undefined,
      { show: !this.props.dot }
    );
  }
}
