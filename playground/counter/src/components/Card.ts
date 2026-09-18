import { Component, h, slot, type VNode } from 'transone';

interface CardProps {
  title: string;
}

/** 通用卡片组件：演示 props + 插槽在 Web / 小程序双端的静态编译。 */
export class Card extends Component<CardProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('card-host', {
      selector: '.card-host',
      properties: {
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
        padding: '16px 20px',
      },
    });
    this.styleManager.addStyle('card-title', {
      selector: '.card-title',
      properties: {
        color: '#0f172a',
        fontSize: '18px',
        fontWeight: '600',
        margin: '0 0 8px',
      },
    });
    this.styleManager.addStyle('card-body', {
      selector: '.card-body',
      properties: {
        color: '#475569',
        fontSize: '14px',
        lineHeight: '1.6',
      },
    });
  }

  protected render(): VNode {
    return h('div', { className: 'card-host' }, [
      h('h3', { className: 'card-title' }, [this.props.title]),
      h('div', { className: 'card-body' }, [slot('default')]),
    ]);
  }
}
