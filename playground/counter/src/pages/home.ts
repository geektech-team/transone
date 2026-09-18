import { Component, createComponent, each, h, type VNode } from 'transone';
import { Card } from '../components/Card';

interface HomeState {
  count: number;
  showList: boolean;
  list: Array<{ id: number; name: string; platform: string }>;
}

/** 首页：演示响应式状态、事件、each 列表、条件渲染与组件插槽。 */
export class HomePage extends Component<Record<string, never>, HomeState> {
  protected initState(): HomeState {
    return {
      count: 0,
      showList: true,
      list: [
        { id: 1, name: 'Web', platform: 'H5' },
        { id: 2, name: '微信小程序', platform: 'WXML' },
      ],
    };
  }

  protected initStyles(): void {
    this.styleManager.addStyle('home-shell', {
      selector: '.home-shell',
      properties: {
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '32px 16px',
      },
    });
    this.styleManager.addStyle('home-title', {
      selector: '.home-title',
      properties: {
        fontSize: '28px',
        fontWeight: '700',
        margin: '0',
      },
    });
    this.styleManager.addStyle('home-count', {
      selector: '.home-count',
      properties: {
        fontSize: '16px',
        margin: '0',
      },
    });
    this.styleManager.addStyle('home-button', {
      selector: '.home-button',
      properties: {
        background: '#2563eb',
        border: 'none',
        borderRadius: '8px',
        color: '#ffffff',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '10px 24px',
      },
      hover: {
        background: '#1d4ed8',
      },
    });
    this.styleManager.addStyle('home-list', {
      selector: '.home-list',
      properties: {
        listStyle: 'none',
        margin: '0',
        padding: '0',
      },
    });
    this.styleManager.addStyle('home-item', {
      selector: '.home-item',
      properties: {
        background: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '8px 16px',
        margin: '4px 0',
      },
    });
  }

  protected render(): VNode {
    return h('section', { className: 'home-shell' }, [
      h('h1', { className: 'home-title' }, ['TransOne 跨端演示']),
      h('p', { className: 'home-count' }, [`当前计数：{{count}}`]),
      h('button', { className: 'home-button' }, ['+1'], {
        click: () => this.increment(),
      }),
      createComponent({
        component: Card,
        props: { title: '同一份源码，多端原生产物' },
        children: [
          h('p', {}, [
            '响应式 / 类组件 / 事件 / 插槽 / 样式管理，全部在编译期静态转换为各端原生产物。',
          ]),
        ],
      }),
      this.state.showList
        ? h(
            'ul',
            { className: 'home-list' },
            each(this.state.list, (item) =>
              h('li', { className: 'home-item' }, [item.name])
            )
          )
        : h('p', {}, ['列表已隐藏']),
    ]);
  }

  protected increment(): void {
    this.state.count += 1;
  }
}
