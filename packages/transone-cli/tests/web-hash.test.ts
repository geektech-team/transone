import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { build } from '../src/build';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-cli-web-hash-'));
  roots.push(root);
  return root;
}

function writeEntry(root: string, path: string, marker: string): void {
  const entry = join(root, path);
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(
    entry,
    `
    export const app = {
      renderHtmlDocument({ scripts = [] } = {}) {
        return '<html><head></head><body>${marker}' + scripts.map(({ src }) =>
          '<script type="module" src="' + src + '"></script>'
        ).join('') + '</body></html>';
      },
    };
  `
  );
}

function scriptSource(htmlPath: string): string {
  const html = readFileSync(htmlPath, 'utf8');
  const script = html.match(/<script type="module" src="([^"]+)"/);
  expect(script).not.toBeNull();
  return script![1]!;
}

afterEach(() => {
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('web build JavaScript content hashes', () => {
  it('references a hashed entry and keeps its name for unchanged content', async () => {
    const root = makeRoot();
    writeEntry(root, 'src/main.ts', 'unchanged');
    const first = await build({ root });
    const firstSource = scriptSource(join(first.outDir, 'index.html'));

    expect(basename(firstSource)).toMatch(/^main-[A-Za-z0-9]+\.js$/);
    expect(firstSource.startsWith('./')).toBe(true);
    const entryPath = resolve(first.outDir, firstSource);
    expect(first.assetsBuilt).toContain(entryPath);
    expect(readFileSync(entryPath, 'utf8')).toContain('unchanged');

    const second = await build({ root });
    expect(scriptSource(join(second.outDir, 'index.html'))).toBe(firstSource);
  });

  it('changes the asset URL when code changes and removes the old artifact', async () => {
    const root = makeRoot();
    writeEntry(root, 'src/main.ts', 'before-edit');
    const first = await build({ root });
    const oldSource = scriptSource(join(first.outDir, 'index.html'));
    const oldEntryPath = resolve(first.outDir, oldSource);

    writeEntry(root, 'src/main.ts', 'after-edit');
    const second = await build({ root });
    const newSource = scriptSource(join(second.outDir, 'index.html'));
    const newEntryPath = resolve(second.outDir, newSource);

    expect(newSource).not.toBe(oldSource);
    expect(basename(newSource)).toMatch(/^main-[A-Za-z0-9]+\.js$/);
    expect(existsSync(oldEntryPath)).toBe(false);
    expect(second.assetsBuilt).toContain(newEntryPath);
    expect(readFileSync(newEntryPath, 'utf8')).toContain('after-edit');
    expect(
      readdirSync(second.outDir).filter((file) => file.endsWith('.js'))
    ).toEqual([basename(newSource)]);
  });

  it('preserves distinct same-basename entries and nested page asset references', async () => {
    const root = makeRoot();
    writeEntry(root, 'src/home/main.ts', 'home-entry');
    writeEntry(root, 'src/about/main.ts', 'about-entry');
    const result = await build({
      root,
      config: {
        entry: 'src/home/main.ts',
        pages: { '/guide/about': 'src/about/main.ts' },
        build: { directoryPages: true },
      },
    });
    const homeHtml = join(result.outDir, 'index.html');
    const aboutHtml = join(result.outDir, 'guide', 'about', 'index.html');
    const homeSource = scriptSource(homeHtml);
    const aboutSource = scriptSource(aboutHtml);

    expect(basename(homeSource)).toMatch(/^main-[A-Za-z0-9]+\.js$/);
    expect(basename(aboutSource)).toMatch(/^main-[A-Za-z0-9]+\.js$/);
    expect(basename(aboutSource)).not.toBe(basename(homeSource));
    expect(aboutSource.startsWith('./../../')).toBe(true);
    const homeEntryPath = resolve(dirname(homeHtml), homeSource);
    const aboutEntryPath = resolve(dirname(aboutHtml), aboutSource);
    expect(result.assetsBuilt).toContain(homeEntryPath);
    expect(result.assetsBuilt).toContain(aboutEntryPath);
    expect(readFileSync(homeEntryPath, 'utf8')).toContain('home-entry');
    expect(readFileSync(aboutEntryPath, 'utf8')).toContain('about-entry');
  });
});
