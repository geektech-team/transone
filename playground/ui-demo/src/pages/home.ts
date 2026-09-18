import {
  Component,
  createComponent,
  each,
  h,
  type VNode,
} from 'transone';
import {
  TuButton,
  TuInput,
  TuPopup,
  TuProgress,
  TuSwitch,
  TuTag,
  type TuPopupPosition,
} from 'transone-ui';

interface TagItem {
  id: number;
  label: string;
}

interface UiDemoState {
  count: number;
  checked: boolean;
  loading: boolean;
  progress: number;
  text: string;
  tags: TagItem[];
  popupVisible: boolean;
  popupPosition: TuPopupPosition;
}

/** transone-ui 组件演示页：覆盖全部组件与受控交互（Web / 小程序双端编译）。 */
export class UiDemoPage extends Component<Record<string, never>, UiDemoState> {
  protected initState(): UiDemoState {
    return {
      count: 0,
      checked: true,
      loading: false,
      progress: 40,
      text: '',
      tags: [
        { id: 1, label: '标签一' },
        { id: 2, label: '标签二' },
        { id: 3, label: '标签三' },
      ],
      popupVisible: false,
      popupPosition: 'bottom',
    };
  }

  protected initStyles(): void {
    this.styleManager.addStyle('demo-shell', {
      selector: '.demo-shell',
      properties: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px',
      },
    });
    this.styleManager.addStyle('demo-title', {
      selector: '.demo-title',
      properties: {
        fontSize: '24px',
        fontWeight: '700',
        margin: '8px 0 0',
      },
    });
    this.styleManager.addStyle('demo-subtitle', {
      selector: '.demo-subtitle',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '14px',
        margin: '4px 0 0',
      },
    });
    this.styleManager.addStyle('demo-section', {
      selector: '.demo-section',
      properties: {
        background: 'var(--tu-white, #ffffff)',
        border: '1px solid var(--tu-border, #ebedf0)',
        borderRadius: 'var(--tu-radius-lg, 12px)',
        padding: '16px',
      },
    });
    this.styleManager.addStyle('demo-section-title', {
      selector: '.demo-section-title',
      properties: {
        fontSize: '16px',
        fontWeight: '600',
        margin: '0 0 12px',
      },
    });
    this.styleManager.addStyle('demo-row', {
      selector: '.demo-row',
      properties: {
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
      },
    });
    this.styleManager.addStyle('demo-note', {
      selector: '.demo-note',
      properties: {
        color: 'var(--tu-text-secondary, #969799)',
        fontSize: '13px',
        margin: '8px 0 0',
      },
    });
    this.styleManager.addStyle('demo-popup-body', {
      selector: '.demo-popup-body',
      properties: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '24px 16px',
      },
    });
    this.styleManager.addStyle('demo-popup-title', {
      selector: '.demo-popup-title',
      properties: {
        fontSize: '18px',
        fontWeight: '600',
        margin: '0',
      },
    });
  }

  protected render(): VNode {
    const popupPosition = this.state.popupPosition;
    return h('section', { className: 'demo-shell' }, [
      h('h1', { className: 'demo-title' }, ['transone-ui 组件演示']),
      h('p', { className: 'demo-subtitle' }, [
        '一份 TypeScript 源码，编译为 Web 与多端小程序原生产物',
      ]),

      // —— Button ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Button']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary' },
            children: [`计数：${this.state.count}`],
            emitters: { click: () => this.handleIncrement() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'danger' },
            children: ['重置'],
            emitters: { click: () => this.handleReset() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'success', round: true },
            children: ['圆角成功'],
            emitters: { click: () => this.handleIncrement() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', plain: true },
            children: ['朴素主色'],
            emitters: { click: () => this.handleIncrement() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'warning', size: 'small' },
            children: ['小号警告'],
            emitters: { click: () => this.handleIncrement() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', loading: this.state.loading, loadingText: '提交中…' },
            children: ['加载按钮'],
            emitters: { click: () => this.handleToggleLoading() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'default', disabled: this.state.checked },
            children: ['禁用（开关联动）'],
            emitters: { click: () => this.handleIncrement() },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          '点击 +1 / 重置 / 切换加载态；计数与下方按钮状态由受控事件驱动',
        ]),
      ]),

      // —— Switch ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Switch']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuSwitch,
            props: { checked: this.state.checked },
            emitters: { change: (v) => this.handleSwitch(v) },
          }),
          createComponent({
            component: TuSwitch,
            props: { checked: true, size: 'small' },
            emitters: { change: (v) => this.handleSwitch(v) },
          }),
          createComponent({
            component: TuSwitch,
            props: { checked: false, disabled: true },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          `当前：${this.state.checked ? '开' : '关'}（change 事件回传布尔值）`,
        ]),
      ]),

      // —— Tag ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Tag']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuTag,
            props: { type: 'primary', round: true },
            children: ['主色'],
          }),
          createComponent({
            component: TuTag,
            props: { type: 'success', plain: true },
            children: ['朴素成功'],
          }),
          createComponent({
            component: TuTag,
            props: { type: 'warning' },
            children: ['警告'],
          }),
          createComponent({
            component: TuTag,
            props: { type: 'danger', closable: true },
            children: ['可关闭'],
          }),
        ]),
        h(
          'div',
          { className: 'demo-row' },
          each(
            this.state.tags,
            (tag) =>
              createComponent({
                component: TuTag,
                props: { type: 'info', closable: true, name: tag.id },
                children: [tag.label],
                emitters: { close: (name) => this.handleRemoveTag(name) },
              }),
            (tag) => tag.id
          )
        ),
        h('p', { className: 'demo-note' }, [
          '列表标签可点 × 移除（close 事件回传 name 标识）',
        ]),
      ]),

      // —— Progress ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Progress']),
        createComponent({
          component: TuProgress,
          props: { percent: this.state.progress },
        }),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuProgress,
            props: { percent: this.state.progress, textInside: true, strokeWidth: 16 },
          }),
        ]),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['-10'],
            emitters: { click: () => this.handleDecrease() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['+10'],
            emitters: { click: () => this.handleIncrease() },
          }),
        ]),
        h('p', { className: 'demo-note' }, ['宽度变化带 0.3s 过渡，越界自动收敛']),
      ]),

      // —— Input ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Input']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuInput,
            props: {
              value: this.state.text,
              placeholder: '请输入内容',
              clearable: true,
            },
            emitters: { input: (v) => this.handleInput(v) },
          }),
        ]),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuInput,
            props: {
              value: '',
              placeholder: '密码输入',
              type: 'password',
              size: 'small',
            },
            emitters: { input: (v) => this.handleInput(v) },
          }),
          createComponent({
            component: TuInput,
            props: { value: '', placeholder: '只读', readonly: true },
          }),
        ]),
        h('p', { className: 'demo-note' }, [`已输入：${this.state.text || '(空)'}`]),
      ]),

      // —— Popup ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Popup']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['底部弹出'],
            emitters: { click: () => this.handleOpenBottom() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['顶部弹出'],
            emitters: { click: () => this.handleOpenTop() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['左侧弹出'],
            emitters: { click: () => this.handleOpenLeft() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['右侧弹出'],
            emitters: { click: () => this.handleOpenRight() },
          }),
        ]),
      ]),

      // —— Popup 实例（受控：visible 由页面状态驱动）——
      createComponent({
        component: TuPopup,
        props: { visible: this.state.popupVisible, position: popupPosition },
        children: [
          h('div', { className: 'demo-popup-body' }, [
            h('h3', { className: 'demo-popup-title' }, ['弹出层']),
            h('p', { className: 'demo-note' }, [
              `当前方向：${this.state.popupPosition}`,
            ]),
            createComponent({
              component: TuButton,
              props: { type: 'primary', block: true },
              children: ['关闭'],
              emitters: { click: () => this.handleClosePopup() },
            }),
          ]),
        ],
        emitters: { close: () => this.handleClosePopup() },
      }),
    ]);
  }

  protected handleIncrement(): void {
    this.state.count += 1;
  }

  protected handleReset(): void {
    this.state.count = 0;
  }

  protected handleToggleLoading(): void {
    this.state.loading = !this.state.loading;
  }

  protected handleSwitch(value: unknown): void {
    this.state.checked = Boolean(value);
  }

  protected handleRemoveTag(name: unknown): void {
    this.state.tags = this.state.tags.filter((tag) => tag.id !== name);
  }

  protected handleIncrease(): void {
    this.state.progress += 10;
  }

  protected handleDecrease(): void {
    this.state.progress -= 10;
  }

  protected handleInput(value: unknown): void {
    this.state.text = String(value);
  }

  protected handleOpenBottom(): void {
    this.state.popupPosition = 'bottom';
    this.state.popupVisible = true;
  }

  protected handleOpenTop(): void {
    this.state.popupPosition = 'top';
    this.state.popupVisible = true;
  }

  protected handleOpenLeft(): void {
    this.state.popupPosition = 'left';
    this.state.popupVisible = true;
  }

  protected handleOpenRight(): void {
    this.state.popupPosition = 'right';
    this.state.popupVisible = true;
  }

  protected handleClosePopup(): void {
    this.state.popupVisible = false;
  }
}
