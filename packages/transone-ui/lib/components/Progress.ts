import { Component, h, type VNode } from 'transone';

export interface TuProgressProps {
  /** 进度 0-100（越界自动收敛），默认 0。 */
  percent?: number;
  /** 是否显示百分比文字，默认 true。 */
  showText?: boolean;
  /** 文字是否在进度条内部（右侧），默认 false。 */
  textInside?: boolean;
  /** 进度条高度 px，默认 8。 */
  strokeWidth?: number;
  /** 进度条颜色，默认主题色。 */
  color?: string;
  /** 轨道颜色，默认浅灰。 */
  trackColor?: string;
}

const PROGRESS_BASE = 'tu-progress';

/**
 * TuProgress 进度条：percent / showText / textInside / strokeWidth / color。
 * 宽度变化带 0.3s 过渡；纯受控，无自定义事件。
 */
export class TuProgress extends Component<TuProgressProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-progress', {
      selector: `.${PROGRESS_BASE}`,
      properties: {
        alignItems: 'center',
        display: 'flex',
        gap: '8px',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-progress-track', {
      selector: '.tu-progress__track',
      properties: {
        background: 'var(--tu-border, #ebedf0)',
        borderRadius: '999px',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      },
    });
    this.styleManager.addStyle('tu-progress-bar', {
      selector: '.tu-progress__bar',
      properties: {
        background: 'var(--tu-primary, #1677ff)',
        borderRadius: '999px',
        height: '100%',
        transition: 'width 0.3s ease, background-color 0.3s ease',
      },
    });
    this.styleManager.addStyle('tu-progress-text', {
      selector: '.tu-progress__text',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '12px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      },
    });
    this.styleManager.addStyle('tu-progress-text-inside', {
      selector: '.tu-progress__text--inside',
      properties: {
        color: '#ffffff',
        paddingRight: '8px',
        textAlign: 'right',
      },
    });
    this.styleManager.addStyle('tu-progress-text-inside-bar', {
      selector: '.tu-progress__bar',
      properties: {
        alignItems: 'center',
        display: 'flex',
        height: '100%',
        justifyContent: 'flex-end',
      },
    });
  }

  protected render(): VNode {
    const percent = this.props.percent || 0;
    const pct = percent > 100 ? 100 : percent < 0 ? 0 : percent;
    const inside = this.props.textInside === true;
    const showText = this.props.showText !== false;
    const barChildren =
      inside && showText
        ? [
            h(
              'span',
              { className: 'tu-progress__text tu-progress__text--inside' },
              [`${pct}%`]
            ),
          ]
        : [];
    return h(
      'div',
      { className: PROGRESS_BASE },
      [
        h(
          'div',
          {
            className: 'tu-progress__track',
            style: {
              height: (this.props.strokeWidth || 8) + 'px',
              backgroundColor:
                this.props.trackColor || 'var(--tu-border, #ebedf0)',
            },
          },
          [
            h(
              'div',
              {
                className: 'tu-progress__bar',
                style: {
                  width: pct + '%',
                  backgroundColor:
                    this.props.color || 'var(--tu-primary, #1677ff)',
                },
              },
              barChildren
            ),
          ]
        ),
        h(
          'span',
          { className: 'tu-progress__text' },
          [`${pct}%`],
          undefined,
          undefined,
          { show: showText && !inside }
        ),
      ]
    );
  }
}
