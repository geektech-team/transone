import { Component, type VNode } from 'transone';

/**
 * Native App 演练入口。
 *
 * 只使用 App Target 首期支持的静态 VNode 子集，供 iOS / Android / HarmonyOS
 * 生成同一份原生界面源码；Web 与小程序仍使用 main.ts。
 */
export class CounterApp extends Component<Record<string, never>, { count: number }> {
  protected initState(): { count: number } {
    return { count: 0 };
  }

  protected increment(): void {
    this.state.count += 1;
  }

  protected render(): VNode {
    return {
      tag: 'main',
      props: {
        style: {
          padding: 24,
          backgroundColor: '#f8fafc',
        },
      },
      children: [
        {
          tag: 'h1',
          props: { style: { fontSize: 28, fontWeight: 700, color: '#0f172a' } },
          children: ['TransOne Native Counter'],
        },
        {
          tag: 'text',
          props: { style: { fontSize: 18, margin: 16, color: '#334155' } },
          children: ['当前计数：{{count}}'],
        },
        {
          tag: 'button',
          props: { style: { padding: 12, borderRadius: 8, backgroundColor: '#2563eb', color: '#ffffff' } },
          listeners: { click: () => this.increment() },
          children: ['+1'],
        },
      ],
    };
  }
}
