import { Component, type VNode } from 'transone';

/**
 * Live demo 宿主组件（transone 原生版）。
 *
 * docs 已迁移到 transone 运行时，与 transone-ui 同源，因此不再需要
 * 「手动 new + mount」的跨运行时方案：宿主 render 直接用 createComponent
 * 对象形式（component / props / children / emitters）把受控组件嵌进组件树，
 * 事件经 emitters 回传宿主，宿主 setState 后由 transone patch 复用组件
 * 实例并 setProps 更新 —— 与小程序端/任意 transone 应用的受控用法完全一致。
 *
 * 重渲染安全：stage 容器 div 结构稳定，patch 保留该节点；
 * 组件节点同 component 同位置复用实例，受控状态不断线。
 */
export abstract class DemoHost<
  TState extends object = Record<string, never>
> extends Component<Record<string, never>, TState> {
  protected initState(): TState {
    return {} as TState;
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tu-demo', {
      selector: '.tu-demo',
      properties: {
        background: '#ffffff',
        border: '1px solid #ebedf0',
        borderRadius: '12px',
        boxSizing: 'border-box',
        display: 'block',
        margin: '16px 0',
        overflow: 'hidden',
      },
    });
    this.styleManager.addStyle('tu-demo-stage', {
      selector: '.tu-demo__stage',
      properties: {
        alignItems: 'center',
        boxSizing: 'border-box',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '20px',
      },
    });
    this.styleManager.addStyle('tu-demo-note', {
      selector: '.tu-demo__note',
      properties: {
        background: '#f7f8fa',
        borderTop: '1px solid #ebedf0',
        boxSizing: 'border-box',
        color: '#969799',
        fontSize: '13px',
        lineHeight: '1.6',
        margin: '0',
        padding: '12px 20px',
      },
    });
  }

  /** 返回要演示的受控组件节点（createComponent 对象形式，emitters 回传宿主）。 */
  protected abstract renderDemo(): VNode;

  /** 交互说明区（可选，子类覆写；可读 this.state 展示交互结果）。 */
  protected renderNote(): VNode[] {
    return [];
  }

  protected render(): VNode {
    return {
      tag: 'div',
      props: { className: 'tu-demo' },
      children: [
        {
          tag: 'div',
          props: { className: 'tu-demo__stage' },
          children: [this.renderDemo()],
        },
        ...this.renderNote(),
      ],
    };
  }
}
