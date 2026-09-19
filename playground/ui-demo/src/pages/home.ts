import {
  Component,
  createComponent,
  each,
  h,
  type VNode,
} from 'transone';
import {
  TuActionSheet,
  TuBadge,
  TuButton,
  TuCell,
  TuCheckbox,
  TuEmpty,
  TuInput,
  TuModal,
  TuNavbar,
  TuPopup,
  TuProgress,
  TuRadio,
  TuSearchBar,
  TuSwitch,
  TuTabs,
  TuTag,
  TuToast,
  type TuPopupPosition,
  type TuToastPosition,
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
  toastVisible: boolean;
  toastPosition: TuToastPosition;
  modalVisible: boolean;
  modalConfirmLoading: boolean;
  sheetVisible: boolean;
  sheetSelected: string;
  sheetActions: Array<{ name: string; color?: string; disabled?: boolean }>;
  checkboxGroup: boolean[];
  radioValue: string;
  searchValue: string;
  searchNote: string;
  tabsActive: number;
  tabsItems: Array<{ title: string; disabled?: boolean }>;
  navbarNote: string;
  cellNote: string;
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
      toastVisible: false,
      toastPosition: 'center',
      modalVisible: false,
      modalConfirmLoading: false,
      sheetVisible: false,
      sheetSelected: '',
      sheetActions: [
        { name: '拍照' },
        { name: '从相册选择' },
        { name: '删除', color: 'var(--tu-danger, #ff3141)', disabled: true },
      ],
      checkboxGroup: [true, false],
      radioValue: 'a',
      searchValue: '',
      searchNote: '',
      tabsActive: 0,
      tabsItems: [
        { title: '标签一' },
        { title: '标签二' },
        { title: '禁用项', disabled: true },
      ],
      navbarNote: '',
      cellNote: '点击单元格计数',
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
    this.styleManager.addStyle('demo-badge-host', {
      selector: '.demo-badge-host',
      properties: {
        alignItems: 'flex-start',
        display: 'inline-flex',
        position: 'relative',
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

      // —— Toast ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Toast']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['顶部提示'],
            emitters: { click: () => this.handleToastTop() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['居中提示'],
            emitters: { click: () => this.handleToastCenter() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['底部提示'],
            emitters: { click: () => this.handleToastBottom() },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          `位置：${this.state.toastPosition}；2 秒后由父级定时自动关闭（可点按手动关闭）`,
        ]),
      ]),
      createComponent({
        component: TuToast,
        props: {
          visible: this.state.toastVisible,
          content: '操作成功',
          position: this.state.toastPosition,
          closable: true,
        },
        emitters: { close: () => this.handleToastClose() },
      }),

      // —— Modal ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Modal']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['基础确认框'],
            emitters: { click: () => this.handleOpenModal() },
          }),
          createComponent({
            component: TuButton,
            props: { type: 'danger', size: 'small' },
            children: ['异步确认（loading）'],
            emitters: { click: () => this.handleOpenModal() },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          '确认 / 取消 / 遮罩关闭分别触发 confirm / cancel / close',
        ]),
      ]),
      createComponent({
        component: TuModal,
        props: {
          visible: this.state.modalVisible,
          title: '确认删除',
          content: '删除后不可恢复，确定继续吗？',
          confirmLoading: this.state.modalConfirmLoading,
        },
        emitters: {
          confirm: () => this.handleModalConfirm(),
          cancel: () => this.handleModalClose(),
          close: () => this.handleModalClose(),
        },
      }),

      // —— ActionSheet ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['ActionSheet']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuButton,
            props: { type: 'primary', size: 'small' },
            children: ['打开动作面板'],
            emitters: { click: () => this.handleOpenSheet() },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          `选择结果：${this.state.sheetSelected || '(未选择)'}；删除项为禁用态`,
        ]),
      ]),
      createComponent({
        component: TuActionSheet,
        props: {
          visible: this.state.sheetVisible,
          actions: this.state.sheetActions,
          description: '选择图片来源',
        },
        emitters: {
          select: (index) => this.handleSheetSelect(index),
          cancel: () => this.handleSheetClose(),
        },
      }),

      // —— Checkbox / Radio ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Checkbox / Radio']),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuCheckbox,
            props: { checked: this.state.checkboxGroup[0], label: '选项 A' },
            emitters: { change: (v) => this.handleCheckboxA(v) },
          }),
          createComponent({
            component: TuCheckbox,
            props: { checked: this.state.checkboxGroup[1], label: '选项 B（禁用）', disabled: true },
            emitters: { change: (v) => this.handleCheckboxB(v) },
          }),
        ]),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuRadio,
            props: { checked: this.state.radioValue === 'a', label: '单选 A' },
            emitters: { change: () => this.handleRadioA() },
          }),
          createComponent({
            component: TuRadio,
            props: { checked: this.state.radioValue === 'b', label: '单选 B' },
            emitters: { change: () => this.handleRadioB() },
          }),
        ]),
        h('p', { className: 'demo-note' }, [
          `勾选：${this.state.checkboxGroup[0] ? 'A' : '-'}；单选：${this.state.radioValue}`,
        ]),
      ]),

      // —— SearchBar ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['SearchBar']),
        createComponent({
          component: TuSearchBar,
          props: {
            value: this.state.searchValue,
            placeholder: '搜索城市指数',
            clearable: true,
            showCancel: true,
            confirmType: 'search',
          },
          emitters: {
            input: (v) => this.handleSearchInput(v),
            search: () => this.handleSearch(),
            cancel: () => this.handleSearchCancel(),
          },
        }),
        h('p', { className: 'demo-note' }, [
          `${this.state.searchNote || '输入后回车触发搜索（小程序 bindconfirm / Web Enter）'}`,
        ]),
      ]),

      // —— Badge / Cell ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Badge / Cell']),
        h('div', { className: 'demo-row' }, [
          h(
            'span',
            { className: 'demo-badge-host' },
            [
              createComponent({
                component: TuButton,
                props: { type: 'default', size: 'small' },
                children: ['消息'],
                emitters: { click: () => this.handleIncrement() },
              }),
              createComponent({
                component: TuBadge,
                props: { content: this.state.count, max: 99 },
              }),
            ]
          ),
          createComponent({
            component: TuBadge,
            props: { content: 'NEW', color: 'var(--tu-primary, #1677ff)' },
          }),
          createComponent({
            component: TuBadge,
            props: { content: this.state.count, dot: true },
          }),
        ]),
        h('div', { className: 'demo-row' }, [
          createComponent({
            component: TuCell,
            props: { title: '单元格', value: this.state.count, isLink: true },
            emitters: { click: () => this.handleCellClick() },
          }),
          createComponent({
            component: TuCell,
            props: { title: '必填项', label: '带说明文字', required: true, isLink: true, arrowDirection: 'down' },
          }),
          createComponent({
            component: TuCell,
            props: { title: '禁用项', value: '不可点', disabled: true },
          }),
        ]),
        h('p', { className: 'demo-note' }, [this.state.cellNote]),
      ]),

      // —— Tabs / Navbar ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Tabs']),
        createComponent({
          component: TuTabs,
          props: { items: this.state.tabsItems, active: this.state.tabsActive },
          emitters: { change: (index) => this.handleTabsChange(index) },
        }),
        h('p', { className: 'demo-note' }, [`当前激活：${this.state.tabsActive}（禁用项不可点）`]),
      ]),
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Navbar']),
        createComponent({
          component: TuNavbar,
          props: {
            title: '页面标题',
            leftText: '返回',
            rightText: '更多',
            showArrow: true,
          },
          emitters: {
            clickLeft: () => this.handleNavbarLeft(),
            clickRight: () => this.handleNavbarRight(),
          },
        }),
        h('p', { className: 'demo-note' }, [this.state.navbarNote]),
      ]),

      // —— Empty ——
      h('div', { className: 'demo-section' }, [
        h('h2', { className: 'demo-section-title' }, ['Empty']),
        createComponent({
          component: TuEmpty,
          props: { text: '暂无数据', description: '去看看其他页面吧' },
          children: [
            createComponent({
              component: TuButton,
              props: { type: 'primary', size: 'small' },
              children: ['去逛逛'],
              emitters: { click: () => this.handleIncrement() },
            }),
          ],
        }),
        h('p', { className: 'demo-note' }, [
          '自定义图片可用 image 属性；children 插槽承载操作按钮',
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

  protected handleToastTop(): void {
    this.state.toastPosition = 'top';
    this.state.toastVisible = true;
    setTimeout(() => {
      this.state.toastVisible = false;
    }, 2000);
  }

  protected handleToastCenter(): void {
    this.state.toastPosition = 'center';
    this.state.toastVisible = true;
    setTimeout(() => {
      this.state.toastVisible = false;
    }, 2000);
  }

  protected handleToastBottom(): void {
    this.state.toastPosition = 'bottom';
    this.state.toastVisible = true;
    setTimeout(() => {
      this.state.toastVisible = false;
    }, 2000);
  }

  protected handleToastClose(): void {
    this.state.toastVisible = false;
  }

  protected handleOpenModal(): void {
    this.state.modalVisible = true;
  }

  protected handleModalConfirm(): void {
    this.state.modalConfirmLoading = true;
    setTimeout(() => {
      this.state.modalConfirmLoading = false;
      this.state.modalVisible = false;
    }, 1200);
  }

  protected handleModalClose(): void {
    this.state.modalVisible = false;
  }

  protected handleOpenSheet(): void {
    this.state.sheetVisible = true;
  }

  protected handleSheetSelect(index: unknown): void {
    const i = Number(index);
    const actions = this.state.sheetActions;
    if (i >= 0 && i < actions.length && !actions[i].disabled) {
      this.state.sheetSelected = actions[i].name;
    }
    this.state.sheetVisible = false;
  }

  protected handleSheetClose(): void {
    this.state.sheetVisible = false;
  }

  protected handleCheckboxA(value: unknown): void {
    const group = this.state.checkboxGroup.slice();
    group[0] = Boolean(value);
    this.state.checkboxGroup = group;
  }

  protected handleCheckboxB(value: unknown): void {
    const group = this.state.checkboxGroup.slice();
    group[1] = Boolean(value);
    this.state.checkboxGroup = group;
  }

  protected handleRadioA(): void {
    this.state.radioValue = 'a';
  }

  protected handleRadioB(): void {
    this.state.radioValue = 'b';
  }

  protected handleSearchInput(value: unknown): void {
    this.state.searchValue = String(value);
    this.state.searchNote = '';
  }

  protected handleSearch(): void {
    this.state.searchNote = `搜索：${this.state.searchValue || '(空)'}`;
  }

  protected handleSearchCancel(): void {
    this.state.searchValue = '';
    this.state.searchNote = '已取消搜索';
  }

  protected handleCellClick(): void {
    this.state.count += 1;
    this.state.cellNote = `单元格被点击 ${this.state.count} 次`;
  }

  protected handleTabsChange(index: unknown): void {
    this.state.tabsActive = Number(index);
  }

  protected handleNavbarLeft(): void {
    this.state.navbarNote = '点击了返回（clickLeft）';
  }

  protected handleNavbarRight(): void {
    this.state.navbarNote = '点击了更多（clickRight）';
  }
}
