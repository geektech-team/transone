import { Component, h, slot, type VNode } from 'transone';

export interface TuEmptyProps {
  /** 自定义图片 URL（缺省用内置 CSS 图形占位）。 */
  image?: string;
  /** 图片尺寸，默认 120px。 */
  imageSize?: number;
  /** 主文案。 */
  text?: string;
  /** 副文案。 */
  description?: string;
  /** 底部操作区插槽。 */
  children?: Array<VNode | string>;
}

const EMPTY_BASE = 'tu-empty';

/**
 * TuEmpty 空状态：图形占位 + 主副文案 + 操作插槽。
 * 无交互事件；图形区支持自定义图片，缺省渲染内置 CSS 插画。
 */
export class TuEmpty extends Component<TuEmptyProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-empty', {
      selector: `.${EMPTY_BASE}`,
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 24px',
        width: '100%',
      },
    });
    this.styleManager.addStyle('tu-empty-image', {
      selector: '.tu-empty__image',
      properties: {
        borderRadius: '50%',
        boxSizing: 'border-box',
      },
    });
    this.styleManager.addStyle('tu-empty-placeholder', {
      selector: '.tu-empty__placeholder',
      properties: {
        alignItems: 'center',
        background:
          'radial-gradient(circle at 50% 35%, #ffffff 0%, #eef1f6 70%)',
        borderRadius: '50%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      },
    });
    this.styleManager.addStyle('tu-empty-cloud', {
      selector: '.tu-empty__cloud',
      properties: {
        border: '2px solid #c8cdd6',
        borderRadius: '50%',
        boxSizing: 'border-box',
        height: '34px',
        position: 'relative',
        width: '46px',
      },
    });
    this.styleManager.addStyle('tu-empty-cloud-tail', {
      selector: '.tu-empty__cloud-tail',
      properties: {
        border: '2px solid #c8cdd6',
        borderRadius: '50%',
        boxSizing: 'border-box',
        height: '24px',
        position: 'absolute',
        right: '-12px',
        top: '12px',
        width: '24px',
      },
    });
    this.styleManager.addStyle('tu-empty-text-gap', {
      selector: '.tu-empty__text',
      properties: {
        marginTop: '12px',
      },
    });
    this.styleManager.addStyle('tu-empty-desc-gap', {
      selector: '.tu-empty__desc',
      properties: {
        marginTop: '12px',
      },
    });
    this.styleManager.addStyle('tu-empty-footer-gap', {
      selector: '.tu-empty__footer',
      properties: {
        marginTop: '12px',
      },
    });
    this.styleManager.addStyle('tu-empty-text', {
      selector: '.tu-empty__text',
      properties: {
        color: 'var(--tu-text, #323233)',
        fontSize: '15px',
        fontWeight: '500',
        lineHeight: 1.4,
      },
    });
    this.styleManager.addStyle('tu-empty-desc', {
      selector: '.tu-empty__desc',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '13px',
        lineHeight: 1.5,
      },
    });
  }

  protected render(): VNode {
    const size = this.props.imageSize || 120;
    const hasChildren = this.props.children && this.props.children.length > 0;
    return h('div', { className: EMPTY_BASE }, [
      this.props.image
        ? h('img', {
            className: 'tu-empty__image',
            src: this.props.image,
            style: { height: `${size}px`, width: `${size}px` },
          })
        : h('div', { className: 'tu-empty__placeholder', style: { height: `${size}px`, width: `${size}px` } }, [
            h('div', { className: 'tu-empty__cloud' }, [
              h('div', { className: 'tu-empty__cloud-tail' }),
            ]),
          ]),
      h(
        'div',
        { className: 'tu-empty__text' },
        [`${this.props.text || ''}`],
        undefined,
        undefined,
        { show: !!this.props.text }
      ),
      h(
        'div',
        { className: 'tu-empty__desc' },
        [`${this.props.description || ''}`],
        undefined,
        undefined,
        { show: !!this.props.description }
      ),
      h('div', { className: 'tu-empty__footer' }, [slot('default')], undefined, undefined, { show: hasChildren }),
    ]);
  }
}
