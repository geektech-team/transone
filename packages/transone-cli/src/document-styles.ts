import { createHash, randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface DocumentStyle {
  css: string;
  attributes: [string, string][];
  eligible: boolean;
}

export interface DocumentStylesResult {
  html: string;
  assets: string[];
}

/** Externalize the document shell's CSS without changing stylesheet order. */
export async function emitDocumentStyles(
  html: string,
  outDir: string,
  assetUrl: (path: string) => string,
  stylesheets: string[],
  componentStylesheets: string[] = []
): Promise<DocumentStylesResult> {
  const styles: DocumentStyle[] = [];
  const linked = new Set<string>();
  let hasHead = false;
  let hasHtml = false;
  let current: DocumentStyle | undefined;
  new HTMLRewriter()
    .on('html', {
      element() {
        hasHtml = true;
      },
    })
    .on('head', {
      element() {
        hasHead = true;
      },
    })
    .on('head link', {
      element(element) {
        if (
          !element
            .getAttribute('rel')
            ?.toLowerCase()
            .split(/\s+/)
            .includes('stylesheet')
        )
          return;
        const href = element.getAttribute('href');
        if (href !== null) linked.add(href);
      },
    })
    .on('head style', {
      element(element) {
        const attributes = [...element.attributes];
        const type = element.getAttribute('type')?.trim().toLowerCase();
        current = {
          css: '',
          attributes,
          // Identified/annotated style elements may be manipulated by client code.
          eligible:
            (!type || type === 'text/css') &&
            attributes.every(([name]) =>
              ['type', 'media', 'title', 'nonce'].includes(name)
            ),
        };
        styles.push(current);
      },
      text(chunk) {
        if (current) current.css += chunk.text;
      },
    })
    .transform(html);

  const replacements = new Map<number, string>();
  const assets = new Set<string>();
  for (const [index, style] of styles.entries()) {
    if (!style.eligible || !style.css.trim() || hasRelativeResources(style.css))
      continue;
    const hash = createHash('sha256')
      .update(style.css)
      .digest('hex')
      .slice(0, 16);
    const path = resolve(outDir, `document-${hash}.css`);
    await writeStylesheet(path, style.css);
    assets.add(path);
    const attributes = style.attributes
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join('');
    replacements.set(
      index,
      `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}"${attributes}>`
    );
  }

  const missing = [...new Set(stylesheets)].filter((href) => !linked.has(href));
  const componentLinks = renderStylesheetLinks(
    [...new Set(componentStylesheets)].filter((href) => !linked.has(href))
  );
  const importedLinks = renderStylesheetLinks(missing);
  if (!hasHead && (importedLinks || componentLinks)) {
    const head = `<head>${importedLinks}${componentLinks}</head>`;
    const output = hasHtml
      ? new HTMLRewriter()
          .on('html', {
            element(element) {
              element.prepend(head, { html: true });
            },
          })
          .transform(html)
      : html.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + head);
    return { html: output, assets: [...assets] };
  }
  let index = 0;
  const output = new HTMLRewriter()
    .on('head', {
      element(element) {
        element.prepend(importedLinks, { html: true });
        // Components used to append their StyleManager sheets after the shell.
        element.append(componentLinks, { html: true });
      },
    })
    .on('head style', {
      element(element) {
        const replacement = replacements.get(index++);
        if (replacement !== undefined)
          element.replace(replacement, { html: true });
      },
    })
    .transform(html);
  return { html: output, assets: [...assets] };
}

function renderStylesheetLinks(hrefs: string[]): string {
  return hrefs
    .map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`)
    .join('');
}

export async function emitComponentStyles(
  styles: ReadonlyMap<string, string>,
  outDir: string
): Promise<string[]> {
  const css = [...styles.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .join('\n');
  if (!css) return [];
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 16);
  const path = resolve(outDir, `components-${hash}.css`);
  await writeStylesheet(path, css);
  return [path];
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hasRelativeResources(css: string): boolean {
  // Relative URLs in an inline sheet resolve against the document, which is
  // different from the emitted file. Keep those sheets inline to preserve them.
  if (/\\|@import\b|(?:-webkit-)?image(?:-set)?\(/i.test(css)) return true;
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const url = match[2]!.trim();
    if (url && !/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(url)) return true;
  }
  return false;
}

async function writeStylesheet(path: string, css: string): Promise<void> {
  // Published hash URLs must never expose a truncated file during another render.
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, css);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
