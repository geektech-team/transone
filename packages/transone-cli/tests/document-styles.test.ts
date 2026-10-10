import { afterEach, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { emitDocumentStyles } from '../src/document-styles';

const roots: string[] = [];
function outputDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-document-css-'));
  roots.push(root);
  return root;
}
const assetUrl = (path: string) => '/' + basename(path);

afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

it('links emitted CSS when a custom document omits explicit head tags', async () => {
  const result = await emitDocumentStyles(
    '<html><body>page</body></html>',
    outputDir(),
    assetUrl,
    ['/imported.css'],
    ['/components.css']
  );
  expect(result.html).toContain('<head>');
  expect(result.html).toContain('href="/imported.css"');
  expect(result.html).toContain('href="/components.css"');
  expect(result.html.indexOf('/components.css')).toBeLessThan(
    result.html.indexOf('<body>')
  );
  const fragment = await emitDocumentStyles(
    '<main>fragment</main>',
    outputDir(),
    assetUrl,
    [],
    ['/components.css']
  );
  expect(fragment.html).toContain('href="/components.css"');
});

it('respects stylesheet rel tokens and existing media instead of adding an unconditional duplicate', async () => {
  const result = await emitDocumentStyles(
    '<html><head><link rel="stylesheet prefetch" href="/bundle.css" media="print"></head></html>',
    outputDir(),
    assetUrl,
    ['/bundle.css']
  );
  expect([...result.html.matchAll(/href="\/bundle.css"/g)]).toHaveLength(1);
  expect(result.html).toContain('media="print"');
});

it('preserves relative image-set resources and CSS escapes in their original document context', async () => {
  const styles =
    '<style>.a { background: image-set("small.png" 1x, "large.png" 2x); }</style>' +
    '<style>.b { background: -webkit-image-set("small.png" 1x); }</style>' +
    '<style>.c { background: u\\72l("./image.png"); }</style>';
  const result = await emitDocumentStyles(
    '<html><head>' +
      styles +
      '<style>body { color: red; }</style></head></html>',
    outputDir(),
    assetUrl,
    []
  );
  expect(result.html).toContain(styles);
  expect(result.assets).toHaveLength(1);
  expect(readFileSync(result.assets[0]!, 'utf8')).toBe('body { color: red; }');
});

it('keeps published content-addressed CSS complete during concurrent page renders', async () => {
  const root = outputDir();
  const css = '/*' + 'x'.repeat(2_000_000) + '*/body { color: red; }';
  const html = '<html><head><style>' + css + '</style></head></html>';
  const initial = await emitDocumentStyles(html, root, assetUrl, []);
  let finished = false;
  const renders = Promise.all(
    Array.from({ length: 12 }, () =>
      emitDocumentStyles(html, root, assetUrl, [])
    )
  ).finally(() => {
    finished = true;
  });
  try {
    while (!finished) {
      await Bun.sleep(0);
      expect(readFileSync(initial.assets[0]!, 'utf8')).toBe(css);
    }
  } finally {
    await renders;
  }
});
