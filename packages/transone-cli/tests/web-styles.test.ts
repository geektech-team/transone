import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { createWebStylesPlugin } from '../src/web-styles';

const roots: string[] = [];
const framework = resolve(import.meta.dir, '../../transone/lib/index.ts');

function project(files: Record<string, string>): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'transone-web-styles-'))
  );
  roots.push(root);
  files['tsconfig.json'] = JSON.stringify({
    compilerOptions: {
      baseUrl: root,
      paths: { transone: [framework] },
    },
  });
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

async function bundle(
  root: string,
  splitting = false,
  runtimeFiles: ReadonlySet<string> = new Set()
) {
  const plugin = createWebStylesPlugin(runtimeFiles);
  const result = await Bun.build({
    entrypoints: [join(root, 'main.ts')],
    outdir: join(root, 'dist'),
    target: 'browser',
    format: splitting ? 'esm' : 'cjs',
    splitting,
    minify: false,
    plugins: [plugin],
  });
  expect(result.success).toBe(true);
  const css = [...plugin.styles.values()].join('\n');
  const javascript = await result.outputs
    .find(
      (output) =>
        output.kind === 'entry-point' && /\.[cm]?js$/.test(output.path)
    )!
    .text();
  return { result, css, javascript, runtimeFiles: plugin.runtimeFiles };
}

function run(javascript: string): { value: unknown; styles: string[] } {
  const elements: { textContent: string }[] = [];
  const document = {
    createElement: () => ({ textContent: '' }),
    head: {
      appendChild: (element: { textContent: string }) => elements.push(element),
    },
  };
  const module = { exports: {} as { exercise: () => unknown } };
  new Function('module', 'exports', 'document', javascript)(
    module,
    module.exports,
    document
  );
  return {
    value: module.exports.exercise(),
    styles: elements.map((element) => element.textContent),
  };
}

const component = (name: string, body: string, extra = '') => `
  export class ${name} extends Component {
    initState() { return {}; }
    initStyles() { ${body} }
    render() { return { tag: 'div' }; }
    ${extra}
  }
`;

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Web component static styles', () => {
  // Removing extraction must restore a runtime <style> and lose the CSS artifact.
  it('collects stylesheet CSS and leaves static components with no runtime style registration', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      ${component(
        'Fixed',
        `this.styleManager.addStyle('fixed', {
        selector: '.fixed', properties: { color: 'red' }
      });`
      )}
      export function exercise() { return new Fixed().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toMatch(/\.fixed\s*\{\s*color:\s*red;/);
    expect(run(built.javascript)).toEqual({ value: 0, styles: [] });
  });

  // Partial extraction would discard the fixed rule or register it in a different manager.
  it('retains the complete method when a style depends on props', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      ${component(
        'Dynamic',
        `
        this.styleManager.addStyle('fixed', { selector: '.fixed', properties: { color: 'red' } });
        this.styleManager.addStyle('dynamic', { selector: '.dynamic', properties: { color: this.props.color } });
      `
      )}
      export function exercise() { return new Dynamic({ color: 'purple' }).styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toBe('');
    const executed = run(built.javascript);
    expect(executed.value).toBe(2);
    expect(executed.styles[0]).toContain('.fixed');
    expect(executed.styles[0]).toContain('color: purple;');
  });

  // Stringifying numeric +, adding px, or serializing all duplicate calls breaks these rules.
  it('preserves constants, Map overwrites, hover, media, rpx and raw numeric values', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      const CLASS = 'constant'; const WIDTH = 2 + 3; const COLOR = 'red';
      ${component(
        'Fixed',
        `
        this.styleManager.addStyle('same', { selector: '.discarded', properties: { color: 'blue' } });
        this.styleManager.addStyle('second', { selector: '.second', properties: { opacity: 0.5 } });
        this.styleManager.addStyle('same', {
          selector: \`.$\{CLASS\}\`,
          properties: { width: WIDTH, lineHeight: 1.5, padding: '10rpx -1.5rpx', color: COLOR },
          hover: { color: 'green' },
          media: { '(max-width: 600px)': { marginTop: '20rpx' } }
        });
      `
      )}
      export function exercise() { return new Fixed().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).not.toContain('.discarded');
    expect(built.css).toMatch(/width:\s*5;/);
    expect(built.css).toMatch(/line-height:\s*1\.5;/);
    expect(built.css).toContain('var(--tu-rpx)');
    expect(built.css).toMatch(
      /--tu-rpx:\s*calc\(min\(100vw,\s*750px\)\s*\/\s*750\)/
    );
    expect(built.css).toMatch(
      /padding:\s*calc\(10\s*\*\s*var\(--tu-rpx\)\)\s*calc\(-1\.5\s*\*\s*var\(--tu-rpx\)\)/
    );
    expect(built.css).toMatch(/\.constant:hover\s*\{\s*color:\s*green;/);
    expect(built.css).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(built.css.indexOf('.constant {')).toBeLessThan(
      built.css.indexOf('.second {')
    );
    expect(run(built.javascript)).toEqual({ value: 0, styles: [] });
  });

  for (const operation of [
    `this.styleManager.removeStyle('fixed');`,
    'this.styleManager.clearStyles();',
    `this.styleManager.addStyle('later', { selector: '.later', properties: { color: 'blue' } });`,
    'return this.styleManager.styles.size;',
  ]) {
    // Extraction would make subsequent manager mutation or inspection observe an empty Map.
    it(`keeps runtime styles when another method uses the manager: ${operation}`, async () => {
      const root = project({
        'main.ts': `import { Component } from 'transone';
        ${component(
          'Fixed',
          `this.styleManager.addStyle('fixed', {
          selector: '.fixed', properties: { color: 'red' }
        });`,
          `later() { ${operation} }`
        )}
        export function exercise() { return new Fixed().styleManager.styles.size; }
      `,
      });
      const built = await bundle(root);
      expect(built.css).toBe('');
      expect(run(built.javascript).value).toBe(1);
    });
  }

  // Resolving COLOR from the module instead of the method scope changes purple to red.
  it('does not resolve a shadowed module constant or execute a default initializer during build', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      const COLOR = 'red';
      export class Shadowed extends Component {
        initState() { return {}; }
        initStyles(COLOR = (globalThis.__styleBuildExecuted = 'purple')) {
          this.styleManager.addStyle('shadow', { selector: '.shadow', properties: { color: COLOR } });
        }
        render() { return { tag: 'div' }; }
      }
      export function exercise() { return new Shadowed().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(
      (globalThis as Record<string, unknown>).__styleBuildExecuted
    ).toBeUndefined();
    expect(built.css).toBe('');
    const executed = run(built.javascript);
    expect(executed.value).toBe(1);
    expect(executed.styles[0]).toContain('color: purple;');
    delete (globalThis as Record<string, unknown>).__styleBuildExecuted;
  });

  // Assuming all compiled var bindings are constant would emit the initial, stale selector.
  it('rejects mutable compiled bindings and mutated object constants', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      var CLASS = 'before'; CLASS = 'after';
      const PROPERTIES = { color: 'red' }; PROPERTIES.color = 'purple';
      ${component(
        'Mutable',
        `this.styleManager.addStyle('mutable', {
        selector: '.' + CLASS, properties: PROPERTIES
      });`
      )}
      export function exercise() { return new Mutable().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toBe('');
    const executed = run(built.javascript);
    expect(executed.styles[0]).toContain('.after');
    expect(executed.styles[0]).toContain('color: purple;');
  });

  // A virtual CSS directory must not make a document-relative image become source-relative.
  it('retains document-relative CSS resources while extracting absolute resources', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      ${component(
        'Relative',
        `this.styleManager.addStyle('relative', {
        selector: '.relative', properties: { backgroundImage: 'url(./image.png)' }
      });`
      )}
      ${component(
        'Absolute',
        `this.styleManager.addStyle('absolute', {
        selector: '.absolute', properties: { backgroundImage: 'url(https://example.com/image.png)' }
      });`
      )}
      export function exercise() { return new Relative().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toContain('.absolute');
    expect(built.css).not.toContain('.relative');
    expect(run(built.javascript).styles[0]).toContain('url(./image.png)');
  });

  for (const resource of [
    'image("./image.png")',
    'image-set("./small.png" 1x, "./large.png" 2x)',
    '-webkit-image-set("./small.png" 1x)',
    'u\\72l("./image.png")',
  ]) {
    // CSS image functions can resolve string resources without an ordinary url() token.
    it(`retains the document resource context for ${resource}`, async () => {
      const root = project({
        'main.ts': `import { Component } from 'transone';
          ${component('A', `this.styleManager.addStyle('a', { selector: '.resource', properties: { backgroundImage: ${JSON.stringify(resource)} } });`)}
          export function exercise() { return new A().styleManager.styles.size; }
        `,
      });
      const built = await bundle(root);
      expect(built.css).toBe('');
      const executed = run(built.javascript);
      expect(executed.value).toBe(1);
      expect(executed.styles[0]).toContain(resource);
    });
  }

  // Scanning rendered instances would miss styles needed by a conditional or lazy component.
  it('emits conditional and dynamically imported component CSS without instantiation', async () => {
    const root = project({
      'main.ts': `import { Conditional } from './conditional';
        export const conditional = false ? new Conditional() : null;
        export const lazy = () => import('./lazy');`,
      'conditional.tsx': `import { Component } from 'transone';
        ${component(
          'Conditional',
          `this.styleManager.addStyle('conditional', {
          selector: '.conditional', properties: { color: 'red' }
        });`
        )}`,
      'lazy.jsx': `import { Component } from 'transone';
        ${component(
          'Lazy',
          `this.styleManager.addStyle('lazy', {
          selector: '.lazy', properties: { color: 'blue' }
        });`
        )}`,
    });
    const built = await bundle(root, true);
    expect(built.css).toContain('.conditional');
    expect(built.css).toContain('.lazy');
  });

  // Ignoring node_modules or minified comma calls leaves installed UI styles in JavaScript.
  it('extracts installed, bundled UI JavaScript including immutable var selectors', async () => {
    const root = project({
      'main.ts': `import { TuButton } from 'installed-ui'; export const button = TuButton;
        export function exercise() { return new TuButton().styleManager.styles.size; }`,
      'node_modules/installed-ui/package.json': JSON.stringify({
        name: 'installed-ui',
        type: 'module',
        main: 'index.js',
      }),
      'ui-source.ts': `export * from ${JSON.stringify(resolve(import.meta.dir, '../../transone-ui/lib/index.ts'))};`,
    });
    const compiled = await Bun.build({
      entrypoints: [join(root, 'ui-source.ts')],
      target: 'browser',
      minify: true,
    });
    expect(compiled.success).toBe(true);
    writeFileSync(
      join(root, 'node_modules/installed-ui/index.js'),
      await compiled.outputs[0]!.text()
    );
    const built = await bundle(root);
    expect(built.css).toContain('.tu-button');
    expect(built.css).toContain('.tu-navbar');
    expect(run(built.javascript)).toEqual({ value: 0, styles: [] });
  });

  for (const color of ["'blue'", 'this.props.color']) {
    // Hoisting either owner of a shared selector changes instance construction precedence.
    it(`marks overlapping selectors for runtime fallback with ${color} values`, async () => {
      const root = project({
        'main.ts': `import { A } from './a'; import { B } from './b';
          export function exercise() { new B({ color: 'blue' }); new A(); return true; }`,
        'a.ts': `import { Component } from 'transone'; ${component(
          'A',
          `
          this.styleManager.addStyle('a', { selector: '.shared', properties: { color: 'red' } });
        `
        )}`,
        'b.ts': `import { Component } from 'transone'; ${component(
          'B',
          `
          this.styleManager.addStyle('b', { selector: '.shared', properties: { color: ${color} } });
        `
        )}`,
      });
      const first = await bundle(root);
      expect([...first.runtimeFiles].sort()).toEqual([
        join(root, 'a.ts'),
        join(root, 'b.ts'),
      ]);
      const second = await bundle(root, false, first.runtimeFiles);
      expect(second.css).toBe('');
      const executed = run(second.javascript);
      expect(executed.styles).toHaveLength(2);
      expect(executed.styles[0]).toContain('color: blue;');
      expect(executed.styles[1]).toContain('color: red;');
    });
  }

  // Runtime emits a generated hover selector even when base properties stay dynamic.
  it('marks collisions with generated hover selectors for runtime fallback', async () => {
    const root = project({
      'main.ts': `import { A } from './a'; import { B } from './b';
        export function exercise() { new B({ color: 'black' }); new A(); return true; }`,
      'a.ts': `import { Component } from 'transone'; ${component(
        'A',
        `
        this.styleManager.addStyle('a', { selector: '.shared:hover', properties: { color: 'red' } });
      `
      )}`,
      'b.ts': `import { Component } from 'transone'; ${component(
        'B',
        `
        this.styleManager.addStyle('b', { selector: '.shared', properties: { color: this.props.color }, hover: { color: 'blue' } });
      `
      )}`,
    });
    const first = await bundle(root);
    expect([...first.runtimeFiles].sort()).toEqual([
      join(root, 'a.ts'),
      join(root, 'b.ts'),
    ]);
    const second = await bundle(root, false, first.runtimeFiles);
    expect(second.css).toBe('');
    const executed = run(second.javascript);
    expect(executed.styles).toHaveLength(2);
    expect(executed.styles[0]).toContain('.shared:hover');
    expect(executed.styles[0]).toContain('color: blue;');
    expect(executed.styles[1]).toContain('color: red;');
  });

  // StyleManager appends :hover to the raw selector before CSS splits the list.
  it('tracks generated hover ownership using the runtime raw selector serialization', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
        ${component('A', `this.styleManager.addStyle('a', { selector: '.first:hover', properties: { color: 'red' } });`)}
        ${component('B', `this.styleManager.addStyle('b', { selector: '.first, .second', properties: { color: this.props.color }, hover: { color: 'blue' } });`)}
        export function exercise() { return [new A(), new B({ color: 'black' })].map(c => c.styleManager.styles.size); }
      `,
    });
    const built = await bundle(root);
    expect(built.runtimeFiles.size).toBe(0);
    expect(run(built.javascript).value).toEqual([0, 1]);
  });

  // One item in a selector list has the same cascade ownership as that selector alone.
  it('marks intersecting selector lists for runtime fallback', async () => {
    const root = project({
      'main.ts': `import { A } from './a'; import { B } from './b';
        export function exercise() { new B({ color: 'blue' }); new A(); return true; }`,
      'a.ts': `import { Component } from 'transone'; ${component(
        'A',
        `
        this.styleManager.addStyle('a', { selector: '.first, .shared', properties: { color: 'red' } });
      `
      )}`,
      'b.ts': `import { Component } from 'transone'; ${component(
        'B',
        `
        this.styleManager.addStyle('b', { selector: '.shared', properties: { color: this.props.color } });
      `
      )}`,
    });
    const first = await bundle(root);
    expect([...first.runtimeFiles].sort()).toEqual([
      join(root, 'a.ts'),
      join(root, 'b.ts'),
    ]);
    const second = await bundle(root, false, first.runtimeFiles);
    expect(second.css).toBe('');
    const executed = run(second.javascript);
    expect(executed.styles).toHaveLength(2);
    expect(executed.styles[0]).toContain('color: blue;');
    expect(executed.styles[1]).toContain('.first, .shared');
    expect(executed.styles[1]).toContain('color: red;');
  });

  for (const [firstSelector, secondSelector, counts] of [
    ['.scope-a:is(.x, .first)', '.scope-b:is(.y, .first)', [0, 0]],
    ['[data-a="x, .shared"]', '[data-b="y, .shared"]', [0, 0]],
    ['.scope-a\\,.shared', '.scope-b\\,.shared', [1, 1]],
  ] as const) {
    // A comma inside a selector cannot create an independent shared ownership fragment.
    it(`does not split protected commas in ${firstSelector}`, async () => {
      const root = project({
        'main.ts': `import { Component } from 'transone';
          ${component('A', `this.styleManager.addStyle('a', { selector: ${JSON.stringify(firstSelector)}, properties: { color: 'red' } });`)}
          ${component('B', `this.styleManager.addStyle('b', { selector: ${JSON.stringify(secondSelector)}, properties: { color: 'blue' } });`)}
          export function exercise() { return [new A(), new B()].map(c => c.styleManager.styles.size); }
        `,
      });
      const built = await bundle(root);
      expect(built.runtimeFiles.size).toBe(0);
      expect(run(built.javascript).value).toEqual([...counts]);
      if (counts[0] === 0) {
        expect(built.css).toContain(firstSelector);
        expect(built.css).toContain(secondSelector);
      }
    });
  }

  // Unbalanced syntax must not make an apparent selector list conceal a collision.
  it('treats selector lists with unbalanced delimiters as unknown', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
        ${component('A', `this.styleManager.addStyle('a', { selector: ':is(.first, .shared', properties: { color: 'red' } });`)}
        ${component('B', `this.styleManager.addStyle('b', { selector: '.shared', properties: { color: 'blue' } });`)}
        export function exercise() { return [new A(), new B()].map(c => c.styleManager.styles.size); }
      `,
    });
    const first = await bundle(root);
    expect(first.runtimeFiles.has(join(root, 'main.ts'))).toBe(true);
    const second = await bundle(root, false, first.runtimeFiles);
    expect(second.css).toBe('');
    expect(run(second.javascript).value).toEqual([1, 1]);
  });

  // An unknown selector could match any extracted selector, so it must disable static owners.
  it('marks all extraction candidates when a dynamic selector is unknown', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      ${component('A', `this.styleManager.addStyle('a', { selector: '.fixed', properties: { color: 'red' } });`)}
      ${component('B', `this.styleManager.addStyle('b', { selector: this.props.selector, properties: { color: 'blue' } });`)}
      export function exercise() { new B({ selector: '.fixed' }); new A(); return true; }
    `,
    });
    const first = await bundle(root);
    expect(first.runtimeFiles.has(join(root, 'main.ts'))).toBe(true);
    const second = await bundle(root, false, first.runtimeFiles);
    expect(second.css).toBe('');
    expect(run(second.javascript).styles).toHaveLength(2);
  });

  // Hoisting a superclass method would hide styles from inherited manager operations.
  it('retains styles for custom ancestors, computed manager access and escaping this', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      class Base extends Component { later() { this.styleManager.clearStyles(); } }
      class Inherited extends Base {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('inherited', { selector: '.inherited', properties: { color: 'red' } }); }
        render() { return { tag: 'div' }; }
      }
      ${component(
        'Computed',
        `this.styleManager.addStyle('computed', { selector: '.computed', properties: { color: 'red' } });`,
        `later(key) { this[key].clearStyles(); }`
      )}
      ${component(
        'Escaping',
        `this.styleManager.addStyle('escaping', { selector: '.escaping', properties: { color: 'red' } });`,
        `later() { const self = this; self.styleManager.clearStyles(); }`
      )}
      export function exercise() { return [new Inherited(), new Computed(), new Escaping()].map(c => c.styleManager.styles.size); }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toBe('');
    expect(run(built.javascript).value).toEqual([1, 1, 1]);
  });

  for (const [imports, ancestor] of [
    ["import { Base } from './base';", 'Base'],
    [
      "import { Base as Parent } from './barrel'; const LocalAlias = Parent;",
      'LocalAlias',
    ],
    ["import * as Bases from './base';", 'Bases.Base'],
    [
      "import { Base } from './base'; const mixin = (Parent) => class extends Parent {};",
      'mixin(Base)',
    ],
  ] as const) {
    // A descendant can inspect or clear inherited styles without declaring initStyles.
    it(`keeps cross-module inherited manager behavior through ${ancestor}`, async () => {
      const root = project({
        'main.ts': `import { Child } from './child'; export function exercise() {
          const child = new Child(); const before = child.inspect(); child.clear();
          return { before, after: child.inspect() };
        }`,
        'base.ts': `import { Component } from 'transone'; ${component(
          'Base',
          `
          this.styleManager.addStyle('base', { selector: '.base', properties: { color: 'red' } });
        `
        )}`,
        'barrel.ts': `export { Base } from './base';`,
        'child.ts': `${imports} export class Child extends ${ancestor} {
          inspect() { return this.styleManager.styles.size; }
          clear() { this.styleManager.clearStyles(); }
        }`,
      });
      const first = await bundle(root);
      expect(first.runtimeFiles.has(join(root, 'base.ts'))).toBe(true);
      const second = await bundle(root, false, first.runtimeFiles);
      expect(second.css).toBe('');
      expect(run(second.javascript)).toEqual({
        value: { before: 1, after: 0 },
        styles: [''],
      });
    });
  }

  for (const childDeclaration of [
    `return class Child extends Base {
      inspect() { return this.styleManager.styles.size; }
      clear() { this.styleManager.clearStyles(); }
    };`,
    `class Child extends Base {
      inspect() { return this.styleManager.styles.size; }
      clear() { this.styleManager.clearStyles(); }
    } return Child;`,
  ]) {
    // Factories can return unsafe descendants without top-level class declarations.
    it(`keeps inherited manager behavior for a nested ${childDeclaration.startsWith('return') ? 'class expression' : 'class declaration'}`, async () => {
      const root = project({
        'main.ts': `import { makeChild } from './child'; export function exercise() {
          const Child = makeChild(); const child = new Child();
          const before = child.inspect(); child.clear();
          return { before, after: child.inspect() };
        }`,
        'base.ts': `import { Component } from 'transone'; ${component(
          'Base',
          `this.styleManager.addStyle('base', { selector: '.base', properties: { color: 'red' } });`
        )}`,
        'child.ts': `import { Base } from './base'; export function makeChild() { ${childDeclaration} }`,
      });
      const first = await bundle(root);
      expect(first.runtimeFiles.has(join(root, 'base.ts'))).toBe(true);
      const second = await bundle(root, false, first.runtimeFiles);
      expect(second.css).toBe('');
      expect(run(second.javascript)).toEqual({
        value: { before: 1, after: 0 },
        styles: [''],
      });
    });
  }

  it('keeps inherited manager behavior for a same-module nested descendant', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone'; ${component(
        'Base',
        `this.styleManager.addStyle('base', { selector: '.base', properties: { color: 'red' } });`
      )}
      function makeChild() { return class extends Base {
        inspect() { return this.styleManager.styles.size; }
        clear() { this.styleManager.clearStyles(); }
      }; }
      export function exercise() {
        const Child = makeChild(); const child = new Child();
        const before = child.inspect(); child.clear(); return { before, after: child.inspect() };
      }`,
    });
    const built = await bundle(root);
    expect(built.css).toBe('');
    expect(run(built.javascript)).toEqual({
      value: { before: 1, after: 0 },
      styles: [''],
    });
  });

  // Exporting a fixed base or inheriting it safely alone must not disable extraction.
  it('continues extracting exported styles for a safe imported descendant', async () => {
    const root = project({
      'main.ts': `import { Child } from './child'; export function exercise() { return new Child().styleManager.styles.size; }`,
      'base.ts': `import { Component } from 'transone'; ${component(
        'Base',
        `
        this.styleManager.addStyle('base', { selector: '.base', properties: { color: 'red' } });
      `
      )}`,
      'child.ts': `import { Base as Parent } from './base'; export class Child extends Parent { label() { return 'safe'; } }`,
    });
    const built = await bundle(root);
    expect(built.runtimeFiles.size).toBe(0);
    expect(built.css).toContain('.base');
    expect(run(built.javascript)).toEqual({ value: 0, styles: [] });
  });

  // An alias of the actual Component root is known, even when its styles stay dynamic.
  it('does not disable other fixed components for a runtime class using a Component alias', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone'; const Parent = Component;
        ${component('Fixed', `this.styleManager.addStyle('fixed', { selector: '.fixed', properties: { color: 'red' } });`)}
        ${component('Dynamic', `this.styleManager.addStyle('dynamic', { selector: '.dynamic', properties: { color: this.props.color } });`, `inspect() { return this.styleManager.styles.size; }`).replace('extends Component', 'extends Parent')}
        export function exercise() { new Fixed(); return new Dynamic({ color: 'blue' }).inspect(); }
      `,
    });
    const built = await bundle(root);
    expect(built.runtimeFiles.size).toBe(0);
    expect(built.css).toContain('.fixed');
    expect(run(built.javascript).value).toBe(1);
  });

  // A local declaration hides the module selector even when the style values are dynamic.
  it('treats locally shadowed selectors as unknown for collision fallback', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      const SELECTOR = '.unrelated';
      ${component('A', `this.styleManager.addStyle('a', { selector: '.fixed', properties: { color: 'red' } });`)}
      ${component(
        'B',
        `const SELECTOR = this.props.selector;
        this.styleManager.addStyle('b', { selector: SELECTOR, properties: { color: 'blue' } });`
      )}
      export function exercise() { new B({ selector: '.fixed' }); new A(); return true; }
    `,
    });
    const first = await bundle(root);
    expect(first.runtimeFiles.has(join(root, 'main.ts'))).toBe(true);
    const second = await bundle(root, false, first.runtimeFiles);
    expect(run(second.javascript).styles).toHaveLength(2);
  });

  // Rejecting all object constants unnecessarily leaves fixed styles in the runtime bundle.
  it('extracts safe module StyleOptions constants without evaluating code', async () => {
    const root = project({
      'main.ts': `import { Component } from 'transone';
      const COLOR = 'red'; const PROPERTIES = { color: COLOR, padding: '12rpx' };
      const OPTIONS = { selector: '.options', properties: PROPERTIES } as const;
      ${component('A', `this.styleManager.addStyle('a', OPTIONS);`)}
      export function exercise() { return new A().styleManager.styles.size; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toContain('.options');
    expect(built.css).toContain('color: red;');
    expect(run(built.javascript)).toEqual({ value: 0, styles: [] });
  });

  // CommonJS and namespace imports still identify the actual TransOne Component base.
  it('handles mjs namespace imports and cjs Component require aliases', async () => {
    const root = project({
      'main.ts': `import { Mjs } from './component.mjs'; import { Cjs } from './component.cjs';
        export function exercise() { return [new Mjs(), new Cjs()].map(c => c.styleManager.styles.size); }`,
      'component.mjs': `import * as TransOne from 'transone';
        ${component('Mjs', `this.styleManager.addStyle('mjs', { selector: '.mjs', properties: { color: 'red' } });`).replace('extends Component', 'extends TransOne.Component')}`,
      'component.cjs': `const { Component: Base } = require('transone');
        ${component('Cjs', `this.styleManager.addStyle('cjs', { selector: '.cjs', properties: { color: 'blue' } });`).replace('export class', 'class').replace('extends Component', 'extends Base')}
        module.exports = { Cjs };`,
    });
    const built = await bundle(root);
    expect(built.css).toContain('.mjs');
    expect(built.css).toContain('.cjs');
    expect(run(built.javascript)).toEqual({ value: [0, 0], styles: [] });
  });

  // Merely naming a method initStyles does not establish TransOne StyleManager semantics.
  it('does not rewrite unrelated component-like classes', async () => {
    const root = project({
      'main.ts': `
      class Recorder { count = 0; styles = new Map(); addStyle(name, options) { this.count++; this.styles.set(name, options); } }
      class ForeignBase {
        constructor() { this.styleManager = new Recorder(); this.initState(); this.initStyles(); }
        mount() {} mountToNode() {} update() {} unmount() {}
      }
      ${component('Foreign', `this.styleManager.addStyle('foreign', { selector: '.foreign', properties: { color: 'red' } });`).replace('extends Component', 'extends ForeignBase')}
      export function exercise() { return new Foreign().styleManager.count; }
    `,
    });
    const built = await bundle(root);
    expect(built.css).toBe('');
    expect(run(built.javascript).value).toBe(1);
  });

  // A real bundled manager does not make constructor-side clearing safe to hoist.
  it('does not hoist styles past a bundled base constructor manager operation', async () => {
    const root = project({
      'main.ts': `import { Foreign } from './foreign.js';
        export function exercise() { return new Foreign().styleManager.styles.size; }`,
      'foreign-source.ts': `import { StyleManager } from ${JSON.stringify(resolve(import.meta.dir, '../../transone/lib/style/StyleManager.ts'))};
        class ForeignBase {
          constructor() {
            this.styleManager = new StyleManager(); this.initState(); this.initStyles();
            this.styleManager.clearStyles();
          }
          mount() {} mountToNode() {} update() {} unmount() {}
        }
        ${component('Foreign', `this.styleManager.addStyle('foreign', { selector: '.foreign', properties: { color: 'red' } });`).replace('extends Component', 'extends ForeignBase')}`,
    });
    const compiled = await Bun.build({
      entrypoints: [join(root, 'foreign-source.ts')],
      target: 'browser',
      minify: true,
    });
    expect(compiled.success).toBe(true);
    writeFileSync(join(root, 'foreign.js'), await compiled.outputs[0]!.text());
    const built = await bundle(root);
    expect(built.css).toBe('');
    expect(run(built.javascript)).toEqual({ value: 0, styles: [''] });
  });

  // Destructuring and loop assignments also invalidate a compiled var initializer.
  for (const assignment of [
    `({ CLASS } = { CLASS: 'after' });`,
    `[CLASS] = ['after'];`,
    `for (CLASS of ['after']) {}`,
  ]) {
    it(`keeps mutable bindings assigned through ${assignment}`, async () => {
      const root = project({
        'main.ts': `import { Component } from 'transone'; var CLASS = 'before'; ${assignment}
          ${component('A', `this.styleManager.addStyle('a', { selector: '.' + CLASS, properties: { color: 'red' } });`)}
          export function exercise() { return new A().styleManager.styles.size; }
        `,
      });
      const built = await bundle(root);
      expect(built.css).toBe('');
      expect(run(built.javascript).styles[0]).toContain('.after');
    });
  }
});
