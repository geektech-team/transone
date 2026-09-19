import { afterEach, describe, expect, it } from 'bun:test';
import { flushSync, type Component } from 'transone';
import { TuToast } from '../lib/components/Toast';
import { TuModal } from '../lib/components/Modal';
import { TuActionSheet } from '../lib/components/ActionSheet';
import { TuCheckbox } from '../lib/components/Checkbox';
import { TuRadio } from '../lib/components/Radio';
import { TuSearchBar } from '../lib/components/SearchBar';
import { TuBadge } from '../lib/components/Badge';
import { TuCell } from '../lib/components/Cell';
import { TuEmpty } from '../lib/components/Empty';
import { TuTabs } from '../lib/components/Tabs';
import { TuNavbar } from '../lib/components/Navbar';
import { TuPopup } from '../lib/components/Popup';

/** 扩展组件（反馈 / 表单 / 展示 / 导航四类）在 Web 运行时的行为测试。 */

type AnyComponent = Component<Record<string, unknown>, Record<string, unknown>>;

function mount(component: AnyComponent): {
  container: HTMLElement;
  dispose: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  component.mount(container);
  return {
    container,
    dispose: () => {
      component.unmount();
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    },
  };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function keydownEnter(el: Element): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()!();
  }
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('TuToast', () => {
  it('visible 切换显示/隐藏；默认 center 位置', () => {
    const toast = new TuToast({ content: '保存成功' });
    const { container, dispose } = mount(toast);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-toast--center');
    expect(root.hidden || root.style.display === 'none').toBe(true);

    toast.setProps({ visible: true });
    flushSync();
    expect(root.hidden || root.style.display === 'none').toBe(false);
    expect(root.textContent).toBe('保存成功');
  });

  it('position 渲染对应方位类', () => {
    const toast = new TuToast({ visible: true, content: 'x', position: 'top' });
    const { container, dispose } = mount(toast);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-toast--top');
  });

  it('closable 时点击触发 close；非 closable 不触发', () => {
    const toast = new TuToast({ visible: true, content: 'x', closable: true });
    const { container, dispose } = mount(toast);
    disposers.push(dispose);
    let closes = 0;
    toast.on('close', () => {
      closes += 1;
    });
    click(container.firstElementChild as HTMLElement);
    expect(closes).toBe(1);

    toast.setProps({ closable: false });
    flushSync();
    click(container.firstElementChild as HTMLElement);
    expect(closes).toBe(1);
  });
});

describe('TuModal', () => {
  it('visible 切换 visible 类；渲染标题与内容', () => {
    const modal = new TuModal({ visible: true, title: '提示', content: '确定删除吗？' });
    const { container, dispose } = mount(modal);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-modal--visible');
    expect((container.querySelector('.tu-modal__title') as HTMLElement).textContent).toBe('提示');
    const contents = Array.from(container.querySelectorAll('.tu-modal__content'));
    expect(contents.some((el) => el.textContent === '确定删除吗？')).toBe(true);
  });

  it('确认/取消按钮分别触发 confirm/cancel；confirmLoading 时确认不触发', () => {
    const modal = new TuModal({ visible: true });
    const { container, dispose } = mount(modal);
    disposers.push(dispose);
    let confirms = 0;
    let cancels = 0;
    modal.on('confirm', () => {
      confirms += 1;
    });
    modal.on('cancel', () => {
      cancels += 1;
    });

    const confirmBtn = container.querySelector('.tu-modal__btn--confirm') as HTMLElement;
    const cancelBtn = container.querySelector('.tu-modal__btn--cancel') as HTMLElement;
    click(confirmBtn);
    click(cancelBtn);
    expect(confirms).toBe(1);
    expect(cancels).toBe(1);

    modal.setProps({ confirmLoading: true });
    flushSync();
    click(confirmBtn);
    expect(confirms).toBe(1);
  });

  it('遮罩点击：maskClosable=true 触发 close；false 不触发', () => {
    const modal = new TuModal({ visible: true, maskClosable: true });
    const { container, dispose } = mount(modal);
    disposers.push(dispose);
    let closes = 0;
    modal.on('close', () => {
      closes += 1;
    });
    click(container.querySelector('.tu-modal__mask') as HTMLElement);
    expect(closes).toBe(1);

    modal.setProps({ maskClosable: false });
    flushSync();
    click(container.querySelector('.tu-modal__mask') as HTMLElement);
    expect(closes).toBe(1);
  });

  it('showCancel=false 时取消按钮隐藏', () => {
    const modal = new TuModal({ visible: true, showCancel: false });
    const { container, dispose } = mount(modal);
    disposers.push(dispose);
    const cancelBtn = container.querySelector('.tu-modal__btn--cancel') as HTMLElement;
    expect(cancelBtn.hidden || cancelBtn.style.display === 'none').toBe(true);
  });
});

describe('TuActionSheet', () => {
  const actions = [
    { name: '拍照' },
    { name: '从相册选择' },
    { name: '删除', color: '#ff3141', disabled: true },
  ];

  it('visible 切换；渲染选项与取消按钮', () => {
    const sheet = new TuActionSheet({ visible: true, actions, description: '选择图片来源' });
    const { container, dispose } = mount(sheet);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-actionsheet--visible');
    const items = container.querySelectorAll('.tu-actionsheet__item');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('拍照');
    expect((container.querySelector('.tu-actionsheet__cancel') as HTMLElement).textContent).toBe('取消');
  });

  it('点击选项回传索引；disabled 项不触发', () => {
    const sheet = new TuActionSheet({ visible: true, actions });
    const { container, dispose } = mount(sheet);
    disposers.push(dispose);
    const selected: number[] = [];
    sheet.on('select', (index: number) => {
      selected.push(index);
    });

    const items = container.querySelectorAll('.tu-actionsheet__item');
    click(items[0] as HTMLElement);
    click(items[2] as HTMLElement);
    click(items[1] as HTMLElement);
    expect(selected).toEqual([0, 1]);
  });

  it('取消按钮与遮罩均触发 cancel', () => {
    const sheet = new TuActionSheet({ visible: true, actions });
    const { container, dispose } = mount(sheet);
    disposers.push(dispose);
    let cancels = 0;
    sheet.on('cancel', () => {
      cancels += 1;
    });
    click(container.querySelector('.tu-actionsheet__cancel') as HTMLElement);
    click(container.querySelector('.tu-actionsheet__mask') as HTMLElement);
    expect(cancels).toBe(2);
  });
});

describe('TuCheckbox', () => {
  it('点击回传取反值；disabled 不触发', () => {
    const checkbox = new TuCheckbox({ checked: false, label: '同意协议' });
    const { container, dispose } = mount(checkbox);
    disposers.push(dispose);
    const values: boolean[] = [];
    checkbox.on('change', (v: boolean) => {
      values.push(v);
    });

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-checkbox--round');
    click(root);
    expect(values).toEqual([true]);

    checkbox.setProps({ disabled: true });
    flushSync();
    click(root);
    expect(values).toEqual([true]);
  });

  it('checked 时显示对勾并应用选中类', () => {
    const checkbox = new TuCheckbox({ checked: true });
    const { container, dispose } = mount(checkbox);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-checkbox--checked');
    const mark = container.querySelector('.tu-checkbox__checkmark') as HTMLElement;
    expect(mark.hidden || mark.style.display === 'none').toBe(false);
  });
});

describe('TuRadio', () => {
  it('点击回传取反值；选中时显示圆心点', () => {
    const radio = new TuRadio({ checked: false, label: '男' });
    const { container, dispose } = mount(radio);
    disposers.push(dispose);
    const values: boolean[] = [];
    radio.on('change', (v: boolean) => {
      values.push(v);
    });
    const root = container.firstElementChild as HTMLElement;
    click(root);
    expect(values).toEqual([true]);
    expect(root.className).not.toContain('tu-radio--checked');

    radio.setProps({ checked: true });
    flushSync();
    expect(root.className).toContain('tu-radio--checked');
  });
});

describe('TuSearchBar', () => {
  it('input 事件回传新值', () => {
    const search = new TuSearchBar({ value: '' });
    const { container, dispose } = mount(search);
    disposers.push(dispose);
    const values: string[] = [];
    search.on('input', (v: string) => {
      values.push(v);
    });
    const input = container.querySelector('input') as HTMLInputElement;
    setInputValue(input, '跨端');
    expect(values).toEqual(['跨端']);
  });

  it('回车触发 search（web 端 confirm 映射为 keydown Enter）', () => {
    const search = new TuSearchBar({ value: 'bun' });
    const { container, dispose } = mount(search);
    disposers.push(dispose);
    let searches = 0;
    search.on('search', () => {
      searches += 1;
    });
    const input = container.querySelector('input') as HTMLInputElement;
    keydownEnter(input);
    expect(searches).toBe(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(searches).toBe(1);
  });

  it('非空时显示清空按钮并回传空串；取消按钮触发 cancel', () => {
    const search = new TuSearchBar({ value: 'hello', clearable: true, showCancel: true });
    const { container, dispose } = mount(search);
    disposers.push(dispose);
    const values: string[] = [];
    let cancels = 0;
    search.on('input', (v: string) => {
      values.push(v);
    });
    search.on('cancel', () => {
      cancels += 1;
    });

    click(container.querySelector('.tu-searchbar__clear') as HTMLElement);
    expect(values).toEqual(['']);

    click(container.querySelector('.tu-searchbar__cancel') as HTMLElement);
    expect(cancels).toBe(1);
  });
});

describe('TuBadge', () => {
  it('渲染数字/文本内容；数字超过 max 显示 max+', () => {
    const badge = new TuBadge({ content: 5 });
    const { container, dispose } = mount(badge);
    disposers.push(dispose);
    let root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe('5');

    badge.setProps({ content: 100, max: 99 });
    flushSync();
    expect(root.textContent).toBe('99+');

    badge.setProps({ content: 'NEW', max: 99 });
    flushSync();
    expect(root.textContent).toBe('NEW');
  });

  it('dot 模式显示红点并隐藏文本', () => {
    const badge = new TuBadge({ content: 3, dot: true });
    const { container, dispose } = mount(badge);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-badge--dot');
    expect(root.hidden || root.style.display === 'none').toBe(true);
  });
});

describe('TuCell', () => {
  it('渲染标题/说明/右侧值；required 与 isLink 按需显示', () => {
    const cell = new TuCell({ title: '单元格', label: '说明文字', value: '内容', required: true, isLink: true });
    const { container, dispose } = mount(cell);
    disposers.push(dispose);
    expect((container.querySelector('.tu-cell__title-text') as HTMLElement).textContent).toBe('单元格');
    expect((container.querySelector('.tu-cell__label') as HTMLElement).textContent).toBe('说明文字');
    expect((container.querySelector('.tu-cell__value') as HTMLElement).textContent).toBe('内容');
    expect(container.querySelector('.tu-cell__required')).toBeTruthy();
    expect(container.querySelector('.tu-cell__arrow')).toBeTruthy();
  });

  it('点击触发 click；disabled 不触发', () => {
    const cell = new TuCell({ title: '可点' });
    const { container, dispose } = mount(cell);
    disposers.push(dispose);
    let clicks = 0;
    cell.on('click', () => {
      clicks += 1;
    });
    const root = container.firstElementChild as HTMLElement;
    click(root);
    expect(clicks).toBe(1);

    cell.setProps({ disabled: true });
    flushSync();
    click(root);
    expect(clicks).toBe(1);
  });
});

describe('TuEmpty', () => {
  it('渲染主副文案；默认显示内置占位图', () => {
    const empty = new TuEmpty({ text: '暂无数据', description: '稍后再来看看吧' });
    const { container, dispose } = mount(empty);
    disposers.push(dispose);
    expect((container.querySelector('.tu-empty__text') as HTMLElement).textContent).toBe('暂无数据');
    expect((container.querySelector('.tu-empty__desc') as HTMLElement).textContent).toBe('稍后再来看看吧');
    expect(container.querySelector('.tu-empty__placeholder')).toBeTruthy();
  });

  it('提供 image 时渲染图片', () => {
    const empty = new TuEmpty({ image: 'https://example.com/empty.png', text: '空' });
    const { container, dispose } = mount(empty);
    disposers.push(dispose);
    const img = container.querySelector('.tu-empty__image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://example.com/empty.png');
  });
});

describe('TuTabs', () => {
  const items = [
    { title: '标签一' },
    { title: '标签二' },
    { title: '禁用', disabled: true },
  ];

  it('渲染全部标签；点击回传索引，disabled 不触发', () => {
    const tabs = new TuTabs({ items, active: 0 });
    const { container, dispose } = mount(tabs);
    disposers.push(dispose);
    const changed: number[] = [];
    tabs.on('change', (index: number) => {
      changed.push(index);
    });

    const tabItems = container.querySelectorAll('.tu-tabs__item');
    expect(tabItems.length).toBe(3);
    expect(tabItems[0].className).toContain('tu-tabs__item--active');

    click(tabItems[1] as HTMLElement);
    click(tabItems[2] as HTMLElement);
    click(tabItems[0] as HTMLElement);
    expect(changed).toEqual([1, 0]);
  });

  it('active 变化驱动指示线与激活样式', () => {
    const tabs = new TuTabs({ items, active: 0 });
    const { container, dispose } = mount(tabs);
    disposers.push(dispose);
    tabs.setProps({ active: 1 });
    flushSync();
    const tabItems = container.querySelectorAll('.tu-tabs__item');
    expect(tabItems[1].className).toContain('tu-tabs__item--active');
    expect(tabItems[0].className).not.toContain('tu-tabs__item--active');
  });
});

describe('TuNavbar', () => {
  it('渲染标题/左右文案/返回箭头', () => {
    const navbar = new TuNavbar({ title: '首页', leftText: '返回', rightText: '更多', showArrow: true });
    const { container, dispose } = mount(navbar);
    disposers.push(dispose);
    expect((container.querySelector('.tu-navbar__title') as HTMLElement).textContent).toBe('首页');
    expect((container.querySelector('.tu-navbar__text') as HTMLElement).textContent).toBe('返回');
    expect(container.querySelector('.tu-navbar__arrow')).toBeTruthy();
  });

  it('左右区域分别触发 clickLeft / clickRight', () => {
    const navbar = new TuNavbar({ title: '首页', rightText: '设置' });
    const { container, dispose } = mount(navbar);
    disposers.push(dispose);
    let lefts = 0;
    let rights = 0;
    navbar.on('clickLeft', () => {
      lefts += 1;
    });
    navbar.on('clickRight', () => {
      rights += 1;
    });

    click(container.querySelector('.tu-navbar__left') as HTMLElement);
    click(container.querySelector('.tu-navbar__right') as HTMLElement);
    expect(lefts).toBe(1);
    expect(rights).toBe(1);
  });
});

describe('TuPopup 方向切换去污染', () => {
  it('切换弹出方向不受上次方向干扰（先瞬移再滑入）', async () => {
    const popup = new TuPopup({ visible: false, position: 'bottom' });
    const { container, dispose } = mount(popup);
    disposers.push(dispose);

    const root = () => container.querySelector('.tu-popup') as HTMLElement;
    expect(root().classList.contains('tu-popup--bottom')).toBe(true);

    // 1) 从底部弹出并关闭
    popup.setProps({ visible: true, position: 'bottom' });
    flushSync();
    expect(root().classList.contains('tu-popup--bottom')).toBe(true);
    expect(root().classList.contains('tu-popup--visible')).toBe(true);

    popup.setProps({ visible: false });
    flushSync();
    expect(root().classList.contains('tu-popup--visible')).toBe(false);

    // 2) 这次从右侧弹出：方向切换帧先瞬移（可见类不应立即出现）
    popup.setProps({ visible: true, position: 'right' });
    flushSync();
    expect(root().classList.contains('tu-popup--right')).toBe(true);
    expect(root().classList.contains('tu-popup--bottom')).toBe(false);
    expect(root().classList.contains('tu-popup--visible')).toBe(false);

    // 3) 下一帧恢复可见，从右侧滑入
    await new Promise((resolve) => setTimeout(resolve, 40));
    flushSync();
    expect(root().classList.contains('tu-popup--right')).toBe(true);
    expect(root().classList.contains('tu-popup--visible')).toBe(true);
  });

  it('关闭后再次以同方向弹出不产生瞬移帧', async () => {
    const popup = new TuPopup({ visible: true, position: 'bottom' });
    const { container, dispose } = mount(popup);
    disposers.push(dispose);

    const root = () => container.querySelector('.tu-popup') as HTMLElement;
    popup.setProps({ visible: false });
    flushSync();
    expect(root().classList.contains('tu-popup--visible')).toBe(false);

    popup.setProps({ visible: true, position: 'bottom' });
    flushSync();
    // 同方向复用：可见类应直接恢复（无方向切换的中间帧）
    expect(root().classList.contains('tu-popup--visible')).toBe(true);
  });
});
