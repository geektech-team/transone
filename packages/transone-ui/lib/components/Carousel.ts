import { Component, each, h, slot, type VNode } from 'transone';

export interface TuCarouselProps {
  /** 当前页索引（受控：切换时通过 change 回传新索引）。 */
  active?: number;
  /** 插槽中的页数。每个直接子节点对应一页。 */
  count?: number;
  /** 指示点索引数组。小程序模板需显式提供可循环的数组，例如 [0, 1, 2]。 */
  indicatorIndexes?: number[];
  /** 是否显示页码指示点。 */
  indicators?: boolean;
  /** 是否允许首尾循环切换。 */
  loop?: boolean;
  /** 单次滑动判定阈值（px）。 */
  swipeThreshold?: number;
}

interface TouchPoint {
  clientX: number;
}

interface TouchEventLike {
  touches?: TouchPoint[];
  changedTouches?: TouchPoint[];
}

const CAROUSEL_BASE = 'tu-carousel';

/**
 * TuCarousel 走马灯：每个直接子节点是一页任意内容。
 * active 由父级控制；滑动或点击指示点时通过 change 回传目标索引。
 */
export class TuCarousel extends Component<TuCarouselProps, object> {
  private touchStartX: number | null = null;

  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-carousel', {
      selector: `.${CAROUSEL_BASE}`,
      properties: {
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-carousel-track', {
      selector: '.tu-carousel__track',
      properties: {
        display: 'flex',
        transition: 'transform 300ms ease',
      },
    });
    this.styleManager.addStyle('tu-carousel-slide', {
      selector: '.tu-carousel__slide',
      properties: {
        boxSizing: 'border-box',
        flex: '1 0 0',
        minWidth: '0',
      },
    });
    this.styleManager.addStyle('tu-carousel-indicators', {
      selector: '.tu-carousel__indicators',
      properties: {
        alignItems: 'center',
        bottom: '10px',
        display: 'flex',
        justifyContent: 'center',
        left: '0',
        position: 'absolute',
        right: '0',
      },
    });
    this.styleManager.addStyle('tu-carousel-indicator', {
      selector: '.tu-carousel__indicator',
      properties: {
        background: 'rgba(255, 255, 255, 0.55)',
        borderRadius: '4px',
        height: '8px',
        margin: '0 3px',
        width: '8px',
      },
    });
    this.styleManager.addStyle('tu-carousel-indicator-active', {
      selector: '.tu-carousel__indicator--active',
      properties: {
        background: '#ffffff',
      },
    });
  }

  protected render(): VNode {
    const count = this.props.count || 0;
    const rawActive = this.props.active || 0;
    const active =
      rawActive < 0
        ? 0
        : rawActive >= count
          ? count > 0
            ? count - 1
            : 0
          : rawActive;
    const indicatorIndexes = this.props.indicatorIndexes || [];

    return h(
      'div',
      { className: CAROUSEL_BASE },
      [
        h(
          'div',
          {
            className: 'tu-carousel__track',
            style: {
              transform: `translateX(-${count > 0 ? (active / count) * 100 : 0}%)`,
              width: `${count * 100}%`,
            },
          },
          [slot('default')],
          {
            touchstart: (e) => this.onTouchStart(e),
            touchend: (e) => this.onTouchEnd(e),
            touchcancel: () => this.onTouchCancel(),
          }
        ),
        h(
          'div',
          { className: 'tu-carousel__indicators' },
          each(
            indicatorIndexes,
            (_page, index) =>
              h(
                'div',
                {
                  className: `tu-carousel__indicator${index === active ? ' tu-carousel__indicator--active' : ''}`,
                  dataIndex: index,
                },
                [],
                { click: (e) => this.onIndicatorTap(e) }
              ),
            (index) => index
          ),
          undefined,
          undefined,
          { show:
              this.props.indicators !== false &&
              count > 1 }
        ),
      ]
    );
  }

  private onTouchStart(event: unknown): void {
    const touchEvent = event as TouchEventLike;
    const touch = touchEvent.touches?.[0] || touchEvent.changedTouches?.[0];
    this.touchStartX = touch ? touch.clientX : null;
  }

  private onTouchEnd(event: unknown): void {
    const startX = this.touchStartX;
    this.touchStartX = null;
    if (startX === null) return;

    const touchEvent = event as TouchEventLike;
    const touch = touchEvent.changedTouches?.[0] || touchEvent.touches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const threshold = Math.max(1, this.props.swipeThreshold ?? 40);
    if (Math.abs(deltaX) < threshold) return;
    this.navigate(deltaX < 0 ? 1 : -1);
  }

  private onTouchCancel(): void {
    this.touchStartX = null;
  }

  private onIndicatorTap(event: unknown): void {
    const dataset = (event as { currentTarget?: { dataset?: Record<string, string> } })
      .currentTarget?.dataset;
    const index = dataset?.index === undefined ? -1 : Number(dataset.index);
    const count = this.props.count || 0;
    const active = this.props.active || 0;
    if (index < 0 || index >= count || index === active) {
      return;
    }
    this.emit('change', index);
  }

  private navigate(direction: -1 | 1): void {
    const count = this.props.count || 0;
    if (count < 2) return;
    const rawActive = this.props.active || 0;
    const active = rawActive < 0 ? 0 : rawActive >= count ? count - 1 : rawActive;
    const next = active + direction;
    if (this.props.loop) {
      this.emit('change', (next + count) % count);
    } else if (next >= 0 && next < count) {
      this.emit('change', next);
    }
  }
}
