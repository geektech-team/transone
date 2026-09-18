import { afterEach, describe, expect, it } from 'bun:test';
import { flushSync } from 'transone';
import { TuButton } from '../lib/components/Button';
import { TuInput } from '../lib/components/Input';
import { TuPopup } from '../lib/components/Popup';
import { TuProgress } from '../lib/components/Progress';
import { TuSwitch } from '../lib/components/Switch';
import { TuTag } from '../lib/components/Tag';

/** 组件在 Web 运行时的行为测试（DOM 环境由根 bunfig 的 preload 提供）。 */

function mount(
  component: TuButton | TuSwitch | TuTag | TuProgress | TuInput | TuPopup
): { container: HTMLElement; dispose: () => void } {
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

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()!();
  }
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('TuButton', () => {
  it('点击触发 click 事件；disabled/loading 时不触发', () => {
    const button = new TuButton({ children: ['确定'] });
    const { container, dispose } = mount(button);
    disposers.push(dispose);
    let clicked = 0;
    button.on('click', () => {
      clicked += 1;
    });

    const root = container.firstElementChild as HTMLElement;
    click(root);
    expect(clicked).toBe(1);

    button.setProps({ disabled: true });
    flushSync();
    click(root);
    expect(clicked).toBe(1);

    button.setProps({ disabled: false, loading: true });
    flushSync();
    click(root);
    expect(clicked).toBe(1);
  });

  it('加载态替换内容为 loadingText', () => {
    const button = new TuButton({ children: ['提交'], loading: true, loadingText: '处理中' });
    const { container, dispose } = mount(button);
    disposers.push(dispose);
    expect(container.textContent).toContain('处理中');
    expect(container.textContent).not.toContain('提交');
  });

  it('受控：type/size/plain 等 props 映射为类名', () => {
    const button = new TuButton({ type: 'danger', size: 'small', plain: true, round: true });
    const { container, dispose } = mount(button);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-button--danger');
    expect(root.className).toContain('tu-button--small');
    expect(root.className).toContain('tu-button--plain');
    expect(root.className).toContain('tu-button--round');
  });
});

describe('TuSwitch', () => {
  it('点击回传取反后的布尔值；disabled 不响应', () => {
    const switchComp = new TuSwitch({ checked: false });
    const { container, dispose } = mount(switchComp);
    disposers.push(dispose);
    const values: boolean[] = [];
    switchComp.on('change', (v: boolean) => {
      values.push(v);
    });

    const root = container.firstElementChild as HTMLElement;
    click(root);
    expect(values).toEqual([true]);

    switchComp.setProps({ checked: true });
    flushSync();
    click(root);
    expect(values).toEqual([true, false]);

    switchComp.setProps({ disabled: true });
    flushSync();
    click(root);
    expect(values).toEqual([true, false]);
  });

  it('受控：checked 变化反映到选中态类名', () => {
    const switchComp = new TuSwitch({ checked: false });
    const { container, dispose } = mount(switchComp);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('tu-switch--checked');

    switchComp.setProps({ checked: true });
    flushSync();
    expect(root.className).toContain('tu-switch--checked');
  });
});

describe('TuTag', () => {
  it('closable 时点击 × 触发 close 并回传 name', () => {
    const tag = new TuTag({ closable: true, name: 'tag-1', children: ['标签'] });
    const { container, dispose } = mount(tag);
    disposers.push(dispose);
    const names: Array<string | number | undefined> = [];
    tag.on('close', (name: string | number | undefined) => {
      names.push(name);
    });

    const closeIcon = container.querySelector('.tu-tag__close');
    expect(closeIcon).toBeTruthy();
    click(closeIcon as Element);
    expect(names).toEqual(['tag-1']);
  });

  it('非 closable 时关闭按钮隐藏', () => {
    const tag = new TuTag({ children: ['标签'] });
    const { container, dispose } = mount(tag);
    disposers.push(dispose);
    const closeIcon = container.querySelector('.tu-tag__close') as HTMLElement;
    expect(closeIcon.style.display).toBe('none');
  });
});

describe('TuProgress', () => {
  it('宽度按 percent 渲染并收敛越界值', () => {
    const progress = new TuProgress({ percent: 40 });
    const { container, dispose } = mount(progress);
    disposers.push(dispose);
    const bar = container.querySelector('.tu-progress__bar') as HTMLElement;
    expect(bar.style.width).toBe('40%');

    progress.setProps({ percent: 150 });
    flushSync();
    expect(bar.style.width).toBe('100%');

    progress.setProps({ percent: -20 });
    flushSync();
    expect(bar.style.width).toBe('0%');
  });

  it('showText=false 时隐藏外部文字', () => {
    const progress = new TuProgress({ percent: 50, showText: false });
    const { container, dispose } = mount(progress);
    disposers.push(dispose);
    const text = container.querySelector('.tu-progress__text') as HTMLElement;
    expect(text.style.display).toBe('none');
  });

  it('textInside 时百分比文字在条内', () => {
    const progress = new TuProgress({ percent: 60, textInside: true });
    const { container, dispose } = mount(progress);
    disposers.push(dispose);
    const insideText = container.querySelector(
      '.tu-progress__text--inside'
    ) as HTMLElement;
    expect(insideText).toBeTruthy();
    expect(insideText.textContent).toBe('60%');
  });
});

describe('TuInput', () => {
  it('input 事件回传 Web 端 e.target.value', () => {
    const inputComp = new TuInput({ value: '初始' });
    const { container, dispose } = mount(inputComp);
    disposers.push(dispose);
    const values: string[] = [];
    inputComp.on('input', (v: string) => {
      values.push(v);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '新的值';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(values).toEqual(['新的值']);
  });

  it('clearable 且非空时显示清空按钮，点击回传空串', () => {
    const inputComp = new TuInput({ value: 'hello', clearable: true });
    const { container, dispose } = mount(inputComp);
    disposers.push(dispose);
    const values: string[] = [];
    inputComp.on('input', (v: string) => {
      values.push(v);
    });

    const clear = container.querySelector('.tu-input__clear') as HTMLElement;
    expect(clear).toBeTruthy();
    click(clear);
    expect(values).toEqual(['']);
  });
});

describe('TuPopup', () => {
  it('visible 切换 visible 类；默认 bottom 方向', () => {
    const popup = new TuPopup({ visible: false });
    const { container, dispose } = mount(popup);
    disposers.push(dispose);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('tu-popup--bottom');
    expect(root.className).not.toContain('tu-popup--visible');

    popup.setProps({ visible: true });
    flushSync();
    expect(root.className).toContain('tu-popup--visible');
  });

  it('点击遮罩触发 close；maskClosable=false 时不触发', () => {
    const popup = new TuPopup({ visible: true, mask: true, maskClosable: true });
    const { container, dispose } = mount(popup);
    disposers.push(dispose);
    let closes = 0;
    popup.on('close', () => {
      closes += 1;
    });

    const mask = container.querySelector('.tu-popup__mask') as HTMLElement;
    click(mask);
    expect(closes).toBe(1);

    popup.setProps({ maskClosable: false });
    flushSync();
    click(mask);
    expect(closes).toBe(1);
  });

  it('mask=false 时遮罩隐藏', () => {
    const popup = new TuPopup({ visible: true, mask: false });
    const { container, dispose } = mount(popup);
    disposers.push(dispose);
    const mask = container.querySelector('.tu-popup__mask') as HTMLElement;
    expect(mask.style.display).toBe('none');
  });
});
