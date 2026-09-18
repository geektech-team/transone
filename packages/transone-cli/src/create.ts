import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface CreateProjectOptions {
  /** Target directory; defaults to the current working directory. */
  root?: string;
  /** Package name; defaults to the target directory basename. */
  name?: string;
}

export interface CreateProjectResult {
  root: string;
  files: string[];
}

/** Published framework version referenced by generated projects. */
export const TRANSONE_FRAMEWORK_VERSION = '0.2.0';
/** Published CLI version referenced by generated projects. */
export const TRANSONE_CLI_VERSION = '0.2.0';

export const GITHUB_URL = 'https://github.com/geektech-team/transone';

interface ScaffoldFile {
  path: string;
  content: string;
}

export function createProject(
  options: CreateProjectOptions = {}
): CreateProjectResult {
  const root = options.root ?? process.cwd();
  const name = options.name ?? basename(root);
  const files = scaffoldFiles(name);

  const existing = files.filter((file) => existsSync(join(root, file.path)));
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite existing TransOne project files: ${existing
        .map((file) => file.path)
        .join(', ')}`
    );
  }

  mkdirSync(join(root, 'src'), { recursive: true });
  const created: string[] = [];
  for (const file of files) {
    writeFileSync(join(root, file.path), file.content, 'utf8');
    created.push(file.path);
  }

  return { root, files: created };
}

function scaffoldFiles(name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name,
          private: true,
          type: 'module',
          scripts: {
            dev: 'transone dev',
            build: 'transone build',
            typecheck: 'bunx tsc --noEmit',
          },
          dependencies: {
            'transone': `^${TRANSONE_FRAMEWORK_VERSION}`,
          },
          devDependencies: {
            'transone-cli': `^${TRANSONE_CLI_VERSION}`,
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: 'transone.config.ts',
      content: `import { defineConfig } from 'transone-cli';\n\nexport default defineConfig({\n  entry: 'src/main.ts',\n});\n`,
    },
    {
      path: 'tsconfig.json',
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ESNext',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ESNext', 'DOM', 'DOM.Iterable'],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            verbatimModuleSyntax: true,
          },
          include: ['src/**/*', 'transone.config.ts'],
        },
        null,
        2
      )}\n`,
    },
    {
      path: '.gitignore',
      content: 'node_modules/\ndist/\n',
    },
    {
      path: 'src/main.ts',
      content: `import { Component, createApp, h, type VNode } from 'transone';\n\nclass App extends Component<object, object> {\n  protected initState(): object {\n    return {};\n  }\n\n  protected initStyles(): void {\n    this.styleManager.addStyle('app-body', {\n      selector: 'body',\n      properties: {\n        margin: 0,\n        background: '#f7fbf6',\n        color: '#142216',\n        fontFamily:\n          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",\n      },\n    });\n    this.styleManager.addStyle('app-shell', {\n      selector: '.app-shell',\n      properties: {\n        alignItems: 'center',\n        display: 'flex',\n        flexDirection: 'column',\n        gap: '14px',\n        justifyContent: 'center',\n        minHeight: '100vh',\n      },\n    });\n    this.styleManager.addStyle('app-title', {\n      selector: '.app-title',\n      properties: {\n        fontSize: '64px',\n        letterSpacing: 0,\n        lineHeight: 1.05,\n        margin: 0,\n      },\n    });\n    this.styleManager.addStyle('app-link', {\n      selector: '.app-link',\n      properties: {\n        color: '#2f7c39',\n        fontSize: '16px',\n        textDecoration: 'none',\n      },\n      hover: {\n        textDecoration: 'underline',\n      },\n    });\n  }\n\n  protected render(): VNode {\n    return h('main', { className: 'app-shell' }, [\n      h('h1', { className: 'app-title' }, ['TransOne']),\n      h(\n        'a',\n        { className: 'app-link', href: '${GITHUB_URL}' },\n        ['GitHub']\n      ),\n    ]);\n  }\n}\n\nexport const app = createApp({\n  root: App,\n  document: {\n    lang: 'zh-CN',\n    title: 'TransOne',\n    description: '轻量级纯 TypeScript 前端框架',\n  },\n});\n\napp.mount();\n`,
    },
  ];
}
