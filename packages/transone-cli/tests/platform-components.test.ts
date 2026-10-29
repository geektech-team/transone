import { afterEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import type { Platform } from 'transone/platform';
import { createComponentIndex } from '../src/components';

const roots: string[] = [];
const framework = resolve(import.meta.dir, '../../transone/lib/index.ts');
function project(
  files: Record<string, string>,
  paths: Record<string, string[]> = {}
): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'transone-components-'))
  );
  roots.push(root);
  const config = {
    compilerOptions: {
      target: 'ES2022',
      moduleResolution: 'Bundler',
      module: 'ESNext',
      baseUrl: root,
      paths: {
        transone: [framework],
        'transone/platform': [resolve(dirname(framework), 'platform/index.ts')],
        '@/*': ['./src/*'],
        ...paths,
      },
    },
  };
  for (const [name, content] of Object.entries({
    'tsconfig.json': JSON.stringify(config),
    ...files,
  })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
function index(root: string, platform = 'web-mobile', extra = {}) {
  return createComponentIndex({
    root,
    entrypoints: [join(root, 'src/main.ts')],
    platform: platform as Platform,
    ...extra,
  });
}
function find(
  value: ReturnType<typeof index>,
  root: string,
  name: string,
  file = 'src/main.ts'
) {
  const ref = value.findClass(join(root, file), name);
  expect(ref).toBeDefined();
  return ref!;
}
const base = `import { BaseComponent, Component, WebMobile, WebPc, Web } from 'transone';
export class Card extends BaseComponent { initState() { return { count: 0 }; } initStyles() {} render() { return {}; } }`;
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('shared platform component index', () => {
  it('selects discovered exact implementations and preserves logical and explicit identities', () => {
    const root = project({
      'src/main.ts': `${base}\nexport class Unmarked extends Card {}\nexport class Ordinary {}`,
      'src/mobile.ts': `import { WebMobile } from 'transone'; import { Card } from './main'; @WebMobile() export class Mobile extends Card {}`,
      'src/web.ts': `import { Web } from 'transone'; import { Card } from './main'; @Web() export class Generic extends Card {}`,
    });
    const value = index(root);
    const card = find(value, root, 'Card');
    const mobile = find(value, root, 'Mobile', 'src/mobile.ts');
    expect(value.select(card).id).toBe(mobile.id);
    expect(value.select(mobile).id).toBe(mobile.id);
    expect(value.select(find(value, root, 'Unmarked')).className).toBe(
      'Unmarked'
    );
    expect(value.isComponent(find(value, root, 'Ordinary'))).toBe(false);
    expect(
      value
        .bindings()
        .map((pair) => [pair.base.className, pair.implementation.className])
    ).toEqual([['Card', 'Mobile']]);
    expect(value.hierarchy(mobile).map((ref) => ref.className)).toEqual([
      'Card',
      'Mobile',
    ]);
  });
  it('falls back to generic Web then the concrete business class', () => {
    const root = project({
      'src/main.ts': `${base}\n@Web() export class Generic extends Card {}`,
    });
    const web = index(root, 'web-pc');
    expect(web.select(find(web, root, 'Card')).className).toBe('Generic');
    const app = index(root, 'app-ios');
    expect(app.select(find(app, root, 'Card')).className).toBe('Card');
  });
  it.each([
    ['Web', 'web'],
    ['Web', 'web-mobile'],
    ['Web', 'web-pc'],
    ['Miniprogram', 'miniprogram-weixin'],
    ['Miniprogram', 'miniprogram-alipay'],
    ['Miniprogram', 'miniprogram-bytedance'],
    ['Miniprogram', 'miniprogram-xiaohongshu'],
    ['App', 'app-ios'],
    ['App', 'app-android'],
    ['App', 'app-harmony'],
  ])(
    'falls back to the %s family on %s for an abstract business base',
    (decorator, platform) => {
      const root = project({
        'src/main.ts': `import {BaseComponent} from 'transone'; export abstract class Card extends BaseComponent { initState(){return {}} initStyles(){} }`,
        'src/generic.ts': `import {Web,Miniprogram,App,h} from 'transone'; import {Card} from './main';
        @Web() export class WebCard extends Card {render(){return h('p')}}
        @Miniprogram() export class MiniCard extends Card {render(){return h('p')}}
        @App() export class AppCard extends Card {render(){return h('p')}}`,
      });
      const value = index(root, platform);
      const expected =
        decorator === 'Web'
          ? 'WebCard'
          : decorator === 'Miniprogram'
            ? 'MiniCard'
            : 'AppCard';
      const selected = value.select(find(value, root, 'Card'));
      expect(selected.className).toBe(expected);
      expect(value.select(selected).id).toBe(selected.id);
    }
  );
  it.each([
    ['Web', 'WebPc', 'web-pc'],
    ['Miniprogram', 'MiniprogramWeixin', 'miniprogram-weixin'],
    ['App', 'AppIos', 'app-ios'],
  ])(
    'prefers a concrete %s implementation inherited through its generic layer',
    (generic, exact, platform) => {
      const root = project({
        'src/main.ts': `${base}
        import {${generic} as Family,${exact} as Exact} from 'transone/platform';
        @Family() export class Generic extends Card {}
        @Exact() export class Specific extends Generic {}`,
      });
      const value = index(root, platform);
      const specific = value.select(find(value, root, 'Card'));
      expect(specific.className).toBe('Specific');
      expect(value.hierarchy(specific).map((ref) => ref.className)).toEqual([
        'Card',
        'Generic',
        'Specific',
      ]);
      expect(value.select(find(value, root, 'Generic')).className).toBe(
        'Generic'
      );
    }
  );
  it.each([
    ['Miniprogram', 'miniprogram-alipay'],
    ['App', 'app-harmony'],
  ])(
    'reports ambiguous %s family implementations on %s',
    (decorator, platform) => {
      const root = project({
        'src/main.ts': `${base}
        import {${decorator}} from 'transone';
        @${decorator}() export class First extends Card {}
        @${decorator}() export class Second extends Card {}`,
      });
      expect(() => {
        index(root, platform);
      }).toThrow(/Conflicting implementations.*Card/);
    }
  );
  it.each([
    ['Miniprogram', 'app-ios'],
    ['App', 'miniprogram-weixin'],
  ])('does not use the %s family on %s', (decorator, platform) => {
    const root = project({
      'src/main.ts': `${base}
        import {${decorator}} from 'transone';
        @${decorator}() export class OtherFamily extends Card {}`,
    });
    const value = index(root, platform);
    expect(value.select(find(value, root, 'Card')).className).toBe('Card');
  });

  const platformCases = [
    ['Web', 'web'],
    ['WebMobile', 'web-mobile'],
    ['WebPc', 'web-pc'],
    ['MiniprogramWeixin', 'miniprogram-weixin'],
    ['MiniprogramAlipay', 'miniprogram-alipay'],
    ['MiniprogramBytedance', 'miniprogram-bytedance'],
    ['MiniprogramXiaohongshu', 'miniprogram-xiaohongshu'],
    ['AppIos', 'app-ios'],
    ['AppAndroid', 'app-android'],
    ['AppHarmony', 'app-harmony'],
  ];
  it.each(platformCases)(
    'selects namespace decorator %s on %s',
    (decorator, platform) => {
      const root = project({
        'src/main.ts': `${base}\nimport * as Platforms from 'transone';\n@Platforms.${decorator}() export class Variant extends Card {}`,
      });
      const value = index(root, platform);
      expect(value.select(find(value, root, 'Card')).className).toBe('Variant');
    }
  );
  it('resolves aliases, default exports, reexports, namespaces and paths by symbol identity', () => {
    const root = project({
      'src/main.ts': `import DefaultCard from '@/barrel'; import * as Other from './other'; export const a = DefaultCard; export const b = Other.Card;`,
      'src/card.ts': `import { Component as Framework } from 'transone'; export default class Card extends Framework { render() { return {}; } }`,
      'src/barrel.ts': `export { default } from './card'; export { WebMobile as Mobile } from 'transone';`,
      'src/other.ts': `import { Component } from 'transone'; export class Card extends Component { render() { return {}; } }`,
      'src/variant.ts': `import Card from '@/barrel'; import { Mobile } from './barrel'; @Mobile() export default class Selected extends Card {}`,
    });
    const value = index(root);
    expect(
      value.sources.some(
        (source) => source.fileName === join(root, 'src/main.ts')
      )
    ).toBe(true);
    const card = find(value, root, 'Card', 'src/card.ts');
    expect(value.select(card).className).toBe('Selected');
    expect(card.exportName).toBe('default');
    const other = find(value, root, 'Card', 'src/other.ts');
    expect(other.id).not.toBe(card.id);
    expect(value.select(other).id).toBe(other.id);
    const source = ts.createSourceFile(
      join(root, 'src/main.ts'),
      `import DefaultCard from '@/barrel'; import * as Other from './other'; export const a = DefaultCard; export const b = Other.Card;`,
      ts.ScriptTarget.Latest,
      true
    );
    const refs: string[] = [];
    for (const statement of source.statements)
      if (ts.isVariableStatement(statement)) {
        refs.push(
          value.resolve(
            statement.declarationList.declarations[0]!.initializer!,
            source
          )!.id
        );
      }
    expect(refs).toEqual([card.id, other.id]);
  });
  it('keeps inherited members attached to their real owner and follows decorated chains', () => {
    const root = project({
      'src/main.ts': `export { Card } from '../shared/base';`,
      'shared/base.ts': `${base}\n`,
      'src/web.ts': `import { Web } from 'transone'; import { Card } from '../shared/base'; @Web() export class Generic extends Card { render() { return 'generic'; } }`,
      'src/mobile.ts': `import { WebMobile } from 'transone'; import { Generic } from './web'; @WebMobile() export class Mobile extends Generic { initStyles() {} }`,
    });
    const value = index(root);
    const card = find(value, root, 'Card', 'shared/base.ts');
    const chosen = value.select(card);
    expect(value.hierarchy(chosen).map((ref) => ref.className)).toEqual([
      'Card',
      'Generic',
      'Mobile',
    ]);
    const members = new Map(
      value
        .members(chosen)
        .map((member) => [member.declaration.name?.getText(), member])
    );
    expect(members.get('initState')!.owner.filePath).toBe(
      join(root, 'shared/base.ts')
    );
    expect(members.get('render')!.owner.className).toBe('Generic');
    expect(members.get('initStyles')!.owner.className).toBe('Mobile');
    expect(members.get('initState')!.declaration.getSourceFile()).toBe(
      card.source
    );
  });
  it('extends discovery with include and excludes unreferenced implementations', () => {
    const root = project({
      'src/main.ts': base,
      'variants/mobile.ts': `import { Card } from '../src/main'; import { WebMobile } from 'transone'; @WebMobile() export class Mobile extends Card {}`,
      'src/excluded.ts': `import { Card } from './main'; import { WebMobile } from 'transone'; @WebMobile() export class Duplicate extends Card {}`,
    });
    const value = index(root, 'web-mobile', {
      include: ['variants/**/*.ts'],
      exclude: ['src/excluded.ts'],
    });
    expect(value.select(find(value, root, 'Card')).className).toBe('Mobile');
    expect(
      value.findClass(join(root, 'src/excluded.ts'), 'Duplicate')
    ).toBeUndefined();
  });
  it('does not mistake local lookalike decorators or component names for framework identities', () => {
    const root = project({
      'src/main.ts': base,
      'src/lookalike.ts': `import { Card } from './main'; function WebMobile() { return (value: any) => value; } @WebMobile() export class Fake extends Card {} class Component {} export class Ordinary extends Component {}`,
    });
    const value = index(root);
    expect(value.select(find(value, root, 'Card')).className).toBe('Card');
    expect(
      value.isComponent(find(value, root, 'Ordinary', 'src/lookalike.ts'))
    ).toBe(false);
  });
  it('deduplicates multiple matching decorators on the same implementation', () => {
    const root = project({
      'src/main.ts': `${base}\n@WebMobile() @WebMobile() @WebPc() export class Multi extends Card {}`,
    });
    const value = index(root);
    expect(value.select(find(value, root, 'Card')).className).toBe('Multi');
  });
  it('rejects equal priority candidates with source locations', () => {
    const root = project({
      'src/main.ts': `${base}\n@WebMobile() export class One extends Card {}\n@WebMobile() export class Two extends Card {}`,
    });
    expect(() => index(root)).toThrow(/Card.*web-mobile[\s\S]*One[\s\S]*Two/);
  });
  it('rejects abstract families with no matching implementation', () => {
    const root = project({
      'src/main.ts': `import { BaseComponent, WebPc } from 'transone'; export abstract class Card extends BaseComponent {} @WebPc() export class Pc extends Card {}`,
    });
    const value = index(root);
    expect(() => value.select(find(value, root, 'Card'))).toThrow(
      /abstract[\s\S]*Card[\s\S]*web-mobile[\s\S]*Pc/i
    );
  });
  it('rejects cyclic source inheritance with a useful location', () => {
    const root = project({
      'src/main.ts': `export class One extends Two {} export class Two extends One {}`,
    });
    expect(() => index(root)).toThrow(/cycl[\s\S]*main\.ts/i);
  });
  it('rejects undecipherable decorated parent references', () => {
    const root = project({
      'src/main.ts': `import { WebMobile } from 'transone'; @WebMobile() export class Broken extends Missing {}`,
    });
    expect(() => index(root)).toThrow(/Broken[\s\S]*main\.ts/);
  });
  it('keeps standalone decorated framework subclasses explicit without claiming other components', () => {
    const root = project({
      'src/main.ts': `${base}\n@WebMobile() export class Standalone extends Component { render() { return {}; } }`,
    });
    const value = index(root);
    const standalone = find(value, root, 'Standalone');
    expect(value.select(standalone).id).toBe(standalone.id);
    expect(value.metadata(standalone).family.id).toBe(standalone.id);
    expect(value.select(find(value, root, 'Card')).className).toBe('Card');
    expect(value.bindings()).toEqual([]);
  });
  it('uses property identity for quoted overrides and keeps getter/setter pairs together', () => {
    const root = project({
      'src/main.ts': `${base}
      export class Derived extends Card {
        'render'() { return 'child'; }
        get count() { return 1; }
        set count(value: number) {}
        static initState() { return {}; }
      }`,
    });
    const value = index(root);
    const derived = find(value, root, 'Derived');
    const members = value.members(derived);
    expect(
      members
        .filter(
          (member) =>
            ts.isMethodDeclaration(member.declaration) &&
            (member.declaration.name as ts.Identifier | ts.StringLiteral)
              .text === 'render'
        )
        .map((member) => member.owner.className)
    ).toEqual(['Derived']);
    expect(
      members.filter(
        (member) =>
          ts.isGetAccessorDeclaration(member.declaration) ||
          ts.isSetAccessorDeclaration(member.declaration)
      )
    ).toHaveLength(2);
    expect(
      members.filter(
        (member) => member.declaration.name?.getText() === 'initState'
      )
    ).toHaveLength(2);
  });
  it('preserves undecorated installed component references and imported outside-src ancestors', () => {
    const root = project({
      'src/main.ts': `import { Legacy } from 'legacy'; export class Page extends Legacy {}`,
      'node_modules/legacy/package.json': JSON.stringify({
        name: 'legacy',
        types: './index.d.ts',
      }),
      'node_modules/legacy/index.d.ts': `import { Component } from 'transone'; export declare class Legacy extends Component { render(): any; }`,
    });
    const value = index(root);
    const page = find(value, root, 'Page');
    expect(value.isComponent(page)).toBe(true);
    expect(value.select(page).id).toBe(page.id);
    expect(value.hierarchy(page).map((ref) => ref.className)).toEqual([
      'Legacy',
      'Page',
    ]);
    expect(value.bindings()).toEqual([]);
  });
  it('rejects nonexported or anonymous decorated implementations', () => {
    const root = project({
      'src/main.ts': `${base}\n@WebMobile() class Hidden extends Card {}`,
    });
    expect(() => index(root)).toThrow(/named and exported[\s\S]*Hidden/);
    writeFileSync(
      join(root, 'src/main.ts'),
      `${base}\n@WebMobile() export default class extends Card {}`
    );
    expect(() => index(root)).toThrow(/named and exported/);
  });
  it('exposes the checker symbol of an inherited owner-module constant without mixing same-name child constants', () => {
    const root = project({
      'src/main.ts': `${base}\nconst label = 'base'; export class Owner extends Card { text() { return label; } }`,
      'src/mobile.ts': `import { Owner } from './main'; import { WebMobile } from 'transone'; const label = 'child'; @WebMobile() export class Mobile extends Owner {}`,
    });
    const value = index(root);
    const owner = find(value, root, 'Owner');
    const method = value
      .members(value.select(owner))
      .find((member) => member.declaration.name?.getText() === 'text')!;
    const statement = (method.declaration as ts.MethodDeclaration).body!
      .statements[0] as ts.ReturnStatement;
    const declaration = value.symbolAt(
      statement.expression!,
      method.owner.source
    )!.valueDeclaration!;
    expect(declaration.getSourceFile().fileName).toBe(
      join(root, 'src/main.ts')
    );
    expect((declaration as ts.VariableDeclaration).initializer!.getText()).toBe(
      "'base'"
    );
  });

  it('does not reject unconsumed abstract helpers inherited by concrete unmarked classes', () => {
    const root = project({
      'src/main.ts': `import { BaseComponent } from 'transone';
      export abstract class DemoHost extends BaseComponent {}
      export class Demo extends DemoHost { render() { return {}; } }`,
    });
    const value = index(root);
    expect(value.select(find(value, root, 'Demo')).className).toBe('Demo');
    expect(value.bindings()).toEqual([]);
    expect(() => value.select(find(value, root, 'DemoHost'))).toThrow(
      /Abstract component.*DemoHost/
    );
  });
  it('deduplicates the same class reached through real and symlink module paths', () => {
    const root = project({
      'src/main.ts': `import { Card } from './card'; import { Card as Alias } from './alias'; export const references = [Card, Alias];`,
      'src/card.ts': `${base}\n@WebMobile() export class Mobile extends Card {}`,
    });
    symlinkSync(join(root, 'src/card.ts'), join(root, 'src/alias.ts'));
    const value = index(root);
    expect(
      value
        .bindings()
        .map((pair) => [pair.base.className, pair.implementation.className])
    ).toEqual([['Card', 'Mobile']]);
    expect(find(value, root, 'Card', 'src/card.ts').id).toBe(
      find(value, root, 'Card', 'src/alias.ts').id
    );
  });
  it.each([
    ["import { Legacy } from 'legacy';", 'Legacy'],
    ["import Legacy from 'legacy';", 'Legacy'],
    ["import * as Installed from 'legacy';", 'Installed.Legacy'],
    ["import * as Installed from 'legacy';", "Installed['Legacy']"],
  ])(
    'hydrates directly imported installed classes for %s',
    (imports, expression) => {
      const root = project({
        'src/main.ts': `${imports} export const ref = ${expression};`,
        'node_modules/legacy/package.json': JSON.stringify({
          name: 'legacy',
          types: './index.d.ts',
        }),
        'node_modules/legacy/index.d.ts': `import { Component } from 'transone'; export declare class Legacy extends Component { render(): any; } export default Legacy;`,
      });
      const value = index(root);
      const source = value.sources.find(
        (item) => item.fileName === join(root, 'src/main.ts')
      )!;
      const statement = source.statements.find(ts.isVariableStatement)!;
      const initializer =
        statement.declarationList.declarations[0]!.initializer!;
      const initialClasses = value.classes.length;
      const reference = value.resolve(initializer, source)!;
      expect(reference.className).toBe('Legacy');
      expect(value.isComponent(reference)).toBe(true);
      expect(value.metadata(reference).parent!.className).toBe('Component');
      expect(value.hierarchy(reference).map((item) => item.className)).toEqual([
        'Legacy',
      ]);
      expect(value.select(reference).id).toBe(reference.id);
      expect(
        value
          .members(reference)
          .find((member) => member.declaration.name?.getText() === 'render')!
          .owner.id
      ).toBe(reference.id);
      expect(value.bindings()).toEqual([]);
      expect(value.classes.length).toBe(initialClasses);
      expect(value.classes.some((item) => item.id === reference.id)).toBe(true);
      expect(value.resolve(initializer, source)).toBe(reference);
      expect(value.bindings()).toEqual([]);
    }
  );
  it('recognizes framework symbols when consumers only use a tsconfig framework alias', () => {
    const root = project(
      {
        'src/main.ts': `import { Component, WebMobile } from '@framework';
        export class Card extends Component { render() { return {}; } }
        @WebMobile() export class Mobile extends Card {}`,
      },
      { '@framework': [framework] }
    );
    const value = index(root);
    const card = find(value, root, 'Card');
    expect(value.isComponent(card)).toBe(true);
    expect(value.select(card).className).toBe('Mobile');
    expect(
      value
        .bindings()
        .map((pair) => [pair.base.className, pair.implementation.className])
    ).toEqual([['Card', 'Mobile']]);
  });
  it('does not treat aliased ordinary modules exposing framework names as the actual framework', () => {
    const root = project(
      {
        'src/main.ts': `import { Component, WebMobile } from '@pretend';
        export class Card extends Component {}
        @WebMobile() export class Mobile extends Card {}`,
        'src/pretend.ts': `export class Component {} export function WebMobile() { return (value: any) => value; }`,
      },
      { '@pretend': ['./src/pretend.ts'] }
    );
    const value = index(root);
    const card = find(value, root, 'Card');
    expect(value.isComponent(card)).toBe(false);
    expect(value.select(card).id).toBe(card.id);
    expect(value.metadata(find(value, root, 'Mobile')).platforms).toEqual([]);
    expect(value.bindings()).toEqual([]);
  });

  it('recognizes actual framework package modules imported by absolute path without a transone paths entry', () => {
    const root = project({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2022',
        },
      }),
      'src/main.ts': `import { Component, WebMobile } from ${JSON.stringify(framework)};
        export class Card extends Component { render() { return {}; } }
        @WebMobile() export class Mobile extends Card {}`,
    });
    const value = index(root);
    const card = find(value, root, 'Card');
    expect(value.isComponent(card)).toBe(true);
    expect(value.select(card).className).toBe('Mobile');
    expect(
      value
        .bindings()
        .map((pair) => [pair.base.className, pair.implementation.className])
    ).toEqual([['Card', 'Mobile']]);
  });
});
