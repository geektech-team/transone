import { afterEach, describe, expect, it } from 'bun:test';
import { flushSync } from 'transone';
import { UiDemoPage } from '../../../playground/ui-demo/src/pages/home';

/**
 * ui-demo 整页集成测试：直接实例化演示页，模拟真实用户交互，
 * 验证组件间的受控数据流（事件回传 → 页面状态 → 重新渲染）。
 */

let page: UiDemoPage | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
  if (container && container.parentNode) {
    document.body.removeChild(container);
  }
  container = null;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

function mountPage(): HTMLElement {
  page = new UiDemoPage();
  container = document.createElement('div');
  document.body.appendChild(container);
  page.mount(container);
  return container;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('UiDemoPage 集成', () => {
  it('Button 计数联动', () => {
    const container = mountPage();
    // 找到带“计数：”文案的按钮并点击
    const buttons = Array.from(container.querySelectorAll('.tu-button'));
    const counterButton = buttons.find((b) => (b.textContent ?? '').includes('计数'))!;
    expect(counterButton).toBeTruthy();
    expect(textOf(counterButton)).toContain('计数：0');

    click(counterButton);
    expect(textOf(counterButton)).toContain('计数：1');

    click(counterButton);
    expect(textOf(counterButton)).toContain('计数：2');
  });

  it('Switch 受控切换并联动禁用按钮', () => {
    const container = mountPage();
    const switches = Array.from(container.querySelectorAll('.tu-switch'));
    const firstSwitch = switches[0] as HTMLElement;

    // 初始开：禁用按钮应处于 disabled 态
    const disabledButton = Array.from(
      container.querySelectorAll('.tu-button')
    ).find((b) => (b.textContent ?? '').includes('禁用（开关联动）')) as HTMLElement;
    expect(disabledButton.className).toContain('tu-button--disabled');

    click(firstSwitch);
    expect(firstSwitch.className).not.toContain('tu-switch--checked');
    expect(disabledButton.className).not.toContain('tu-button--disabled');
  });

  it('Tag 列表可移除', () => {
    const container = mountPage();
    const closeIcons = Array.from(container.querySelectorAll('.tu-tag__close'));
    // 三个列表标签（含 3 个可关闭标签 + 1 个静态可关闭标签 = 4 个 close 图标）
    const countBefore = container.querySelectorAll('.tu-tag').length;

    click(closeIcons[closeIcons.length - 1]);
    expect(container.querySelectorAll('.tu-tag').length).toBe(countBefore - 1);
  });

  it('Progress 随按钮增减', () => {
    const container = mountPage();
    const bars = container.querySelectorAll('.tu-progress__bar');
    const bar = bars[0] as HTMLElement;
    expect(bar.style.width).toBe('40%');

    const buttons = Array.from(container.querySelectorAll('.tu-button'));
    const plus = buttons.find((b) => textOf(b) === '+10')!;
    click(plus);
    expect(bar.style.width).toBe('50%');

    const minus = buttons.find((b) => textOf(b) === '-10')!;
    click(minus);
    click(minus);
    expect(bar.style.width).toBe('30%');
  });

  it('Input 输入回传并驱动文案', () => {
    const container = mountPage();
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '跨端组件';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const note = Array.from(container.querySelectorAll('.demo-note')).find(
      (n) => (n.textContent ?? '').includes('已输入')
    );
    expect(textOf(note as Element)).toContain('已输入：跨端组件');
  });

  it('Popup 四方向打开与关闭', () => {
    const container = mountPage();
    const openers = Array.from(container.querySelectorAll('.tu-button')).filter(
      (b) => /(底部|顶部|左侧|右侧)弹出/.test(textOf(b))
    );
    expect(openers).toHaveLength(4);

    const popupRoot = container.querySelector('.tu-popup') as HTMLElement;
    expect(popupRoot.className).not.toContain('tu-popup--visible');

    // 底部弹出
    click(openers[0]);
    expect(popupRoot.className).toContain('tu-popup--visible');
    expect(popupRoot.className).toContain('tu-popup--bottom');

    // 遮罩关闭
    const mask = container.querySelector('.tu-popup__mask') as HTMLElement;
    click(mask);
    expect(popupRoot.className).not.toContain('tu-popup--visible');

    // 右侧弹出
    click(openers[3]);
    expect(popupRoot.className).toContain('tu-popup--right');

    // 面板内“关闭”按钮
    const closeButton = Array.from(
      container.querySelectorAll('.tu-popup .tu-button')
    ).find((b) => textOf(b) === '关闭') as HTMLElement;
    click(closeButton);
    expect(popupRoot.className).not.toContain('tu-popup--visible');
  });
});
