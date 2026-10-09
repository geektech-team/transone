import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { startDevServer } from '../src/server';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof startDevServer>>[] = [];

function pageSource(marker: string, slow = false): string {
  return `
    import './style.css';
    export const app = {
      renderHtmlDocument({ scripts = [], head = [] } = {}) {
        const html = '<html><head>' + head.map(({ attributes }) =>
          '<link rel="stylesheet" href="' + attributes.href + '">'
        ).join('') + '</head><body>${marker}' + scripts.map(({ src }) =>
          '<script type="module" src="' + src + '"></script>'
        ).join('') + '</body></html>';
        ${
          slow
            ? `
          if (scripts.length === 0) return html;
          return new Promise((resolve) => {
            globalThis.__transoneCleanupRelease = () => resolve(html);
            globalThis.__transoneCleanupStarted();
          });
        `
            : 'return html;'
        }
      },
    };
  `;
}

function prepareSlowPage(root: string) {
  const globals = globalThis as Record<string, unknown>;
  const started = new Promise<void>((resolve) => {
    globals.__transoneCleanupStarted = resolve;
  });
  writeFileSync(join(root, 'src', 'main.ts'), pageSource('slow', true));
  return {
    started,
    release: () =>
      (globals.__transoneCleanupRelease as (() => void) | undefined)?.(),
    cleanup: () => {
      delete globals.__transoneCleanupStarted;
      delete globals.__transoneCleanupRelease;
    },
  };
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-cli-dev-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'main.ts'), pageSource('first'));
  writeFileSync(join(root, 'src', 'style.css'), 'body { color: red; }');
  return root;
}

async function start(
  root: string,
  watch = false,
  pages?: Record<string, string>
) {
  const server = await startDevServer({
    root,
    host: '127.0.0.1',
    port: 0,
    watch,
    config: { ...(pages ? { pages } : {}) },
  });
  servers.push(server);
  return server;
}

async function getPage(base: string, path = '/') {
  const response = await fetch(base + path);
  expect(response.status).toBe(200);
  const html = await response.text();
  const script = html.match(/<script type="module" src="([^"]+)"/);
  const stylesheet = html.match(/<link rel="stylesheet" href="([^"]+)"/);
  expect(script).not.toBeNull();
  expect(stylesheet).not.toBeNull();
  return { script: script![1]!, stylesheet: stylesheet![1]! };
}

function generationPath(root: string, script: string): string {
  return dirname(
    join(root, 'dist', 'dev', 'h5', script.replace(/^\/dev\//, ''))
  );
}

async function waitFor(
  condition: () => boolean,
  description: string
): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await Bun.sleep(25);
  }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('development output cleanup', () => {
  it('reclaims the old generation and resource URLs after a watched rebuild', async () => {
    const root = makeRoot();
    const server = await start(root, true);
    const base = `http://${server.hostname}:${server.port}`;
    const oldPage = await getPage(base);
    const abort = new AbortController();
    const response = await fetch(base + '/__transone/reload', {
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    const timeout = setTimeout(() => abort.abort(), 8_000);
    try {
      writeFileSync(join(root, 'src', 'main.ts'), pageSource('second'));
      let events = '';
      while (!events.includes('event: reload')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Reload stream closed before rebuilding');
        events += new TextDecoder().decode(value);
      }
      clearTimeout(timeout);
      const newPage = await getPage(base);
      expect(newPage.script).not.toBe(oldPage.script);
      // A browser can still finish requesting assets during its reload.
      expect((await fetch(base + oldPage.script)).status).toBe(200);
      await waitFor(
        () => !existsSync(generationPath(root, oldPage.script)),
        'the previous watched generation to be deleted'
      );
      expect((await fetch(base + oldPage.script)).status).toBe(404);
      expect((await fetch(base + oldPage.stylesheet)).status).toBe(404);
      expect((await fetch(base + newPage.script)).status).toBe(200);
      expect((await fetch(base + newPage.stylesheet)).status).toBe(200);
    } finally {
      clearTimeout(timeout);
      await reader.cancel().catch(() => undefined);
      abort.abort();
    }
  }, 12_000);

  it('reclaims generations per entry without removing another page in no-watch mode', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'src', 'about.ts'), pageSource('about'));
    const server = await start(root, false, { '/about': 'src/about.ts' });
    const base = `http://${server.hostname}:${server.port}`;
    const about = await getPage(base, '/about');
    const first = await getPage(base);
    const second = await getPage(base);
    const latest = await getPage(base);
    await waitFor(
      () =>
        !existsSync(generationPath(root, first.script)) &&
        !existsSync(generationPath(root, second.script)),
      'superseded no-watch generations to be deleted'
    );
    expect((await fetch(base + first.script)).status).toBe(404);
    expect((await fetch(base + latest.script)).status).toBe(200);
    expect((await fetch(base + about.script)).status).toBe(200);
    const session = dirname(generationPath(root, latest.script));
    expect(readdirSync(session).length).toBe(2);
  }, 12_000);

  it('discards failed build output and keeps the last successful assets', async () => {
    const root = makeRoot();
    const server = await start(root);
    const base = `http://${server.hostname}:${server.port}`;
    const page = await getPage(base);
    const session = dirname(generationPath(root, page.script));
    const generations = readdirSync(session);
    writeFileSync(join(root, 'src', 'main.ts'), 'export const app = ;');
    expect((await fetch(base)).status).toBe(500);
    expect(readdirSync(session)).toEqual(generations);
    expect((await fetch(base + page.script)).status).toBe(200);
    expect((await fetch(base + page.stylesheet)).status).toBe(200);
  });

  it('keeps a retired generation while a slow page response still uses it', async () => {
    const root = makeRoot();
    const slow = prepareSlowPage(root);
    const server = await start(root);
    const base = `http://${server.hostname}:${server.port}`;
    let firstRequest: Promise<Response> | undefined;
    let secondRequest: Promise<Response> | undefined;
    try {
      firstRequest = fetch(base);
      await slow.started;
      const devDir = join(root, 'dist', 'dev', 'h5');
      const session = join(devDir, readdirSync(devDir)[0]!);
      const firstGeneration = join(session, readdirSync(session)[0]!);
      writeFileSync(join(root, 'src', 'main.ts'), pageSource('fast'));
      secondRequest = fetch(base);
      await waitFor(
        () => readdirSync(session).length === 2,
        'the concurrent build'
      );
      await Bun.sleep(5_500);
      expect(existsSync(firstGeneration)).toBe(true);
      slow.release();
      const firstResponse = await firstRequest;
      const firstHtml = await firstResponse.text();
      const firstScript = firstHtml.match(
        /<script type="module" src="([^"]+)"/
      )![1]!;
      expect((await fetch(base + firstScript)).status).toBe(200);
      expect((await secondRequest).status).toBe(200);
      await waitFor(
        () => !existsSync(firstGeneration),
        'the released generation cleanup'
      );
      expect((await fetch(base + firstScript)).status).toBe(404);
    } finally {
      slow.release();
      await Promise.allSettled([firstRequest, secondRequest]);
      slow.cleanup();
    }
  }, 18_000);

  it('waits for active page responses before cleaning up a gracefully stopped server', async () => {
    const root = makeRoot();
    const slow = prepareSlowPage(root);
    const server = await start(root);
    const request = fetch(`http://${server.hostname}:${server.port}`);
    try {
      await slow.started;
      const devDir = join(root, 'dist', 'dev', 'h5');
      const session = join(devDir, readdirSync(devDir)[0]!);
      let stopped = false;
      const stopping = Promise.resolve(server.stop(false)).then(() => {
        stopped = true;
      });
      await Bun.sleep(100);
      expect(stopped).toBe(false);
      expect(existsSync(session)).toBe(true);
      slow.release();
      expect((await request).status).toBe(200);
      await stopping;
      expect(existsSync(session)).toBe(false);
    } finally {
      slow.release();
      await request;
      slow.cleanup();
    }
  });

  it('removes only its own session when the server stops', async () => {
    const root = makeRoot();
    const firstServer = await start(root, true);
    const secondServer = await start(root);
    const firstBase = `http://${firstServer.hostname}:${firstServer.port}`;
    const secondBase = `http://${secondServer.hostname}:${secondServer.port}`;
    const firstPage = await getPage(firstBase);
    const secondPage = await getPage(secondBase);
    const firstSession = dirname(generationPath(root, firstPage.script));
    const marker = join(root, 'dist', 'dev', 'h5', 'keep.txt');
    writeFileSync(marker, 'unrelated');
    firstServer.stop(true);
    await waitFor(
      () => !existsSync(firstSession),
      'the stopped session to be deleted'
    );
    expect(existsSync(marker)).toBe(true);
    expect((await fetch(secondBase + secondPage.script)).status).toBe(200);
  }, 12_000);

  it('removes the old session when a config change restarts the watching server', async () => {
    const root = makeRoot();
    const configFile = join(root, 'transone.config.ts');
    writeFileSync(configFile, 'export default { server: { port: 0 } };');
    const server = await startDevServer({ root, watch: true });
    servers.push(server);
    const oldPort = server.port;
    const oldPage = await getPage(`http://${server.hostname}:${oldPort}`);
    const oldSession = dirname(generationPath(root, oldPage.script));
    writeFileSync(
      configFile,
      "export default { server: { port: 0 }, build: { basePath: '/new' } };"
    );
    await waitFor(
      () => (server.port ?? 0) > 0 && server.port !== oldPort,
      'the configuration restart'
    );
    expect(existsSync(oldSession)).toBe(false);
    const base = `http://${server.hostname}:${server.port}`;
    const page = await getPage(base);
    expect((await fetch(base + page.script)).status).toBe(200);
    expect(existsSync(generationPath(root, page.script))).toBe(true);
  });
});
