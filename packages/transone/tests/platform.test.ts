import { describe, expect, it } from 'bun:test';
import * as framework from '../lib';

const definitions = [
  ['Web', 'web', 'web', 'web'],
  ['WebMobile', 'web-mobile', 'web', 'web'],
  ['WebPc', 'web-pc', 'web', 'web'],
  ['MiniprogramWeixin', 'miniprogram-weixin', 'miniprogram', 'mp-weixin'],
  ['MiniprogramAlipay', 'miniprogram-alipay', 'miniprogram', 'mp-alipay'],
  [
    'MiniprogramBytedance',
    'miniprogram-bytedance',
    'miniprogram',
    'mp-bytedance',
  ],
  [
    'MiniprogramXiaohongshu',
    'miniprogram-xiaohongshu',
    'miniprogram',
    'mp-xiaohongshu',
  ],
  ['AppIos', 'app-ios', 'app', 'app-ios'],
  ['AppAndroid', 'app-android', 'app', 'app-android'],
  ['AppHarmony', 'app-harmony', 'app', 'app-harmony'],
] as const;

describe('platform definitions', () => {
  it('provides one platform definition per concrete build target', () => {
    expect(framework.PLATFORM_DEFINITIONS).toEqual(
      definitions.map(([decorator, platform, family, target]) => ({
        platform: platform as framework.Platform,
        decorator,
        family,
        target,
      }))
    );
  });
});

describe('platform normalization and decorators', () => {
  it.each(definitions)(
    'normalizes %s and its legacy backend alias',
    (decorator, platform, _family, target) => {
      expect(framework.normalizePlatform(platform)).toBe(
        platform as framework.Platform
      );
      expect(
        framework.getPlatformDefinition(framework.normalizePlatform(platform)!)
      ).toEqual({
        platform: platform as framework.Platform,
        decorator,
        family: _family,
        target,
      });
      if (platform !== 'web-mobile' && platform !== 'web-pc') {
        expect(framework.normalizePlatform(target)).toBe(
          platform as framework.Platform
        );
      }
      expect(framework.Platform[decorator]).toBe(
        platform as framework.Platform
      );
    }
  );

  it.each([
    undefined,
    null,
    1,
    {},
    '',
    'mobile',
    'WEB',
    ' web',
    'miniprogram',
    'app',
  ])('rejects unknown platform %p', (value) => {
    expect(framework.normalizePlatform(value)).toBeUndefined();
  });

  it.each([
    ...definitions.map(([name]) => [name] as const),
    ['Miniprogram'],
    ['App'],
  ] as const)(
    '%s keeps the original class identity and constructor behavior',
    (name) => {
      class Example {
        constructor(public value: string) {}
      }
      const result = framework[name]()(Example, {
        kind: 'class',
        name: 'Example',
      } as ClassDecoratorContext<typeof Example>);
      expect(result ?? Example).toBe(Example);
      expect(new (result ?? Example)('retained').value).toBe('retained');
    }
  );

  it('accepts multiple standard decorators without replacing the class', () => {
    @framework.WebMobile()
    @framework.WebPc()
    class Both {
      value = 'both';
    }
    expect(new Both().value).toBe('both');
    expect(Both.name).toBe('Both');
  });
});

class LogicalCard extends framework.BaseComponent<
  { title: string },
  { count: number }
> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
  protected render() {
    return framework.h('button', {}, [
      `base:${this.props.title}:${this.state.count}`,
    ]);
  }
}
class MobileCard extends LogicalCard {
  protected override render() {
    return framework.h(
      'button',
      { 'data-card': 'mobile' },
      [`mobile:${this.props.title}:${this.state.count}`],
      {
        click: () => {
          this.state.count += 1;
          this.emit('change', this.state.count);
        },
      }
    );
  }
}
class PcCard extends LogicalCard {
  protected override render() {
    return framework.h('button', {}, [
      `pc:${this.props.title}:${this.state.count}`,
    ]);
  }
}

function textOf(component: framework.Component) {
  const container = document.createElement('div');
  component.mount(container);
  const text = container.textContent;
  component.unmount();
  return text;
}

describe('component implementation bindings', () => {
  it('resolves exact reference identity and leaves explicit implementations and ordinary subclasses alone', () => {
    const restore = framework.bindComponentImplementations([
      [LogicalCard, MobileCard],
    ]);
    try {
      expect(
        textOf(
          framework.createComponentInstance(LogicalCard, { title: 'selected' })
        )
      ).toBe('mobile:selected:0');
      expect(
        textOf(framework.createComponentInstance(PcCard, { title: 'explicit' }))
      ).toBe('pc:explicit:0');
      class Unrelated extends LogicalCard {}
      expect(
        textOf(
          framework.createComponentInstance(Unrelated, { title: 'ordinary' })
        )
      ).toBe('base:ordinary:0');
    } finally {
      restore();
    }
    expect(
      textOf(
        framework.createComponentInstance(LogicalCard, { title: 'restored' })
      )
    ).toBe('base:restored:0');
  });

  it('restores nested bindings and makes restore idempotent', () => {
    const restoreMobile = framework.bindComponentImplementations([
      [LogicalCard, MobileCard],
    ]);
    const restorePc = framework.bindComponentImplementations([
      [LogicalCard, PcCard],
    ]);
    try {
      expect(
        textOf(
          framework.createComponentInstance(LogicalCard, { title: 'nested' })
        )
      ).toBe('pc:nested:0');
      restorePc();
      expect(
        textOf(
          framework.createComponentInstance(LogicalCard, { title: 'outer' })
        )
      ).toBe('mobile:outer:0');
      restorePc();
      expect(
        textOf(
          framework.createComponentInstance(LogicalCard, { title: 'outer' })
        )
      ).toBe('mobile:outer:0');
    } finally {
      restorePc();
      restoreMobile();
    }
  });

  it('isolates independent framework modules rather than storing process-wide bindings', async () => {
    const firstPath = '../lib/platform/bindings.ts?binding-isolation-one';
    const first: typeof import('../lib/platform/bindings') = await import(
      firstPath
    );
    const secondPath = '../lib/platform/bindings.ts?binding-isolation-two';
    const second: typeof import('../lib/platform/bindings') = await import(
      secondPath
    );
    const restore = first.bindComponentImplementations([
      [LogicalCard, MobileCard],
    ]);
    try {
      expect(
        textOf(first.createComponentInstance(LogicalCard, { title: 'first' }))
      ).toBe('mobile:first:0');
      expect(
        textOf(second.createComponentInstance(LogicalCard, { title: 'second' }))
      ).toBe('base:second:0');
    } finally {
      restore();
    }
  });

  it('binds application roots and nested dynamic references while preserving instance state, props and emitters', () => {
    let changes = 0;
    class Page extends framework.Component<object, { title: string }> {
      protected initState() {
        return { title: 'nested' };
      }
      protected initStyles() {}
      protected render(): framework.VNode {
        const options = {
          component: [() => LogicalCard][0]!(),
          props: { title: this.state.title },
          emitters: {
            change: () => {
              changes += 1;
            },
          },
        };
        return framework.createComponent(options);
      }
    }
    class MobilePage extends Page {
      protected override render() {
        return framework.h('main', {}, [
          super.render(),
          framework.createComponent(LogicalCard, { title: 'sibling' }),
        ]);
      }
    }
    const restore = framework.bindComponentImplementations([
      [Page, MobilePage],
      [LogicalCard, MobileCard],
    ]);
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = framework.createApp({
      root: Page,
      rootElement: root,
      state: { title: 'nested' },
    });
    try {
      app.mount();
      expect(root.textContent).toBe('mobile:nested:0mobile:sibling:0');
      const first = root.querySelectorAll('button')[0]!;
      first.click();
      framework.flushSync();
      expect(root.textContent).toBe('mobile:nested:1mobile:sibling:0');
      expect(changes).toBe(1);
      app.update({ title: 'updated' });
      framework.flushSync();
      expect(root.textContent).toBe('mobile:updated:1mobile:sibling:0');
      expect(root.querySelector('button')).toBe(first);
    } finally {
      app.unmount();
      root.remove();
      restore();
    }
  });
});
