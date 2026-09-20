import { createComponent, type VNode } from 'transone';
import { TuTag } from 'transone-ui';
import { DemoHost } from './DemoHost';

const TAGS = [
  { type: 'primary' as const, text: '主要' },
  { type: 'success' as const, text: '成功' },
  { type: 'warning' as const, text: '警告' },
  { type: 'danger' as const, text: '危险' },
];

interface DemoTagsState {
  visible: boolean[];
}

/** TuTag 可交互实例：多类型标签展示，closable 标签点击 × 触发 close 并移除。 */
export class DemoTags extends DemoHost<DemoTagsState> {
  protected initState(): DemoTagsState {
    return { visible: [true, true, true, true] };
  }

  protected renderDemo(): VNode {
    const nodes: VNode[] = [];
    TAGS.forEach((tag, index) => {
      if (this.state.visible[index]) {
        nodes.push(
          createComponent({
            component: TuTag,
            key: index,
            props: { type: tag.type, closable: true, name: index },
            children: [tag.text],
            emitters: {
              close: (...args: unknown[]) => {
                const name = args[0] as number; const visible = [...this.state.visible];
                visible[name] = false;
                this.setState({ visible });
              },
            },
          }) as unknown as VNode
        );
      }
    });
    return { tag: 'div', children: nodes };
  }

  protected renderNote(): VNode[] {
    const s = this.state;
    const closed = TAGS.length - s.visible.filter(Boolean).length;
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `已关闭 ${closed} / ${TAGS.length} 个标签 —— 点标签右侧 × 触发 close 事件（name 标识是哪个标签）。`,
        ],
      },
    ];
  }
}
