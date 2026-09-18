import { randomUUID } from 'node:crypto';
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { isEntryJavaScriptOutput, isStylesheetOutput } from './build-output';
import { resolveConfig } from './config';
import { createProxyHandler } from './proxy';
import { assertSafeSubdirectory } from './safe-path';
import { createFileWatcher, type FileWatcher } from './watch';
import type { ResolveConfigOptions, ResolvedConfig } from './types';

const DEVELOPMENT_URL_PREFIX = '/dev';
const INVALID_DEVELOPMENT_DIRECTORY_MESSAGE =
  'Development output must be a subdirectory of the project root';
const LIVE_RELOAD_PATH = '/__transone/reload';
const WATCHED_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
]);
const IGNORED_WATCH_SEGMENTS = new Set([
  'dist',
  'node_modules',
  '.git',
  '.worktrees',
]);
const LIVE_RELOAD_CLIENT_SCRIPT = [
  '<script type="module">',
  'const transoneReloadSource=new EventSource(',
  JSON.stringify(LIVE_RELOAD_PATH),
  ');',
  'transoneReloadSource.addEventListener("reload",()=>location.reload());',
  '</script>',
].join('');

type DevServer = ReturnType<typeof Bun.serve>;

export interface StartDevServerOptions extends ResolveConfigOptions {
  watch?: boolean;
}

export async function startDevServer(
  options: StartDevServerOptions = {}
): Promise<DevServer> {
  if (options.watch) {
    return startWatchingDevServer(options);
  }
  const instance = await createServerInstance(options, false);
  return instance.server;
}

async function startWatchingDevServer(
  options: StartDevServerOptions
): Promise<DevServer> {
  let instance = await createServerInstance(options, true);
  let watcher = createProjectWatcher(instance, onChange);

  async function onChange(changedPath: string): Promise<void> {
    const configFile = instance.config.configFile;
    const configRelativePath =
      configFile === undefined
        ? undefined
        : toRelativePath(instance.config.root, configFile);
    if (configRelativePath === changedPath) {
      await restart();
      return;
    }
    await rebuildAndReload();
  }

  async function rebuildAndReload(): Promise<void> {
    const entries = [...new Set(Object.values(instance.config.pages))];
    instance.markDirty(entries);
    for (const entry of entries) {
      const bundle = await instance.getBundle(entry);
      if (bundle instanceof Response) {
        console.error('TransOne rebuild failed; keeping the last working page.');
        return;
      }
    }
    instance.liveReload?.broadcast();
  }

  async function restart(): Promise<void> {
    watcher.dispose();
    instance.server.stop(true);
    instance = await createServerInstance(options, true);
    watcher = createProjectWatcher(instance, onChange);
    console.log(
      `TransOne dev server restarted at http://${instance.server.hostname}:${instance.server.port}`
    );
  }

  return createServerHandle(
    () => instance,
    () => watcher.dispose()
  );
}

function createProjectWatcher(
  instance: DevServerInstance,
  onChange: (changedPath: string) => Promise<void>
): FileWatcher {
  return createFileWatcher({
    root: instance.config.root,
    isRelevant: (relativePath) => isWatchedFile(instance, relativePath),
    onChange: (changedPath) => {
      void onChange(changedPath);
    },
  });
}

interface DevServerInstance {
  server: DevServer;
  config: ResolvedConfig;
  getBundle: (entry: string) => Promise<DevelopmentBundle | Response>;
  markDirty: (entries: string[]) => void;
  liveReload: LiveReloadHub | undefined;
}

async function createServerInstance(
  options: StartDevServerOptions,
  watch: boolean
): Promise<DevServerInstance> {
  const config = await resolveConfig(options);
  // 动态加载：project.ts 依赖 'transone/dom'（框架 dist 的 DOM 渲染
  // 模块），仅在需要预渲染页面 HTML 时加载，避免 dev/build 其他路径被拖累。
  const { renderProjectHtml } = await import('./project');
  for (const [route, entry] of Object.entries(config.pages)) {
    await renderProjectHtml(config, {}, entry, route);
  }
  const developmentOutDir = resolve(config.root, 'dist', 'dev', 'h5');
  await assertSafeSubdirectory(
    config.root,
    developmentOutDir,
    INVALID_DEVELOPMENT_DIRECTORY_MESSAGE
  );
  const proxy = createProxyHandler(config.server.proxy);
  const sessionId = createGenerationId();
  const sessionOutDir = resolve(developmentOutDir, sessionId);
  const artifacts = new Map<string, DevelopmentOutput>();
  const buildProject = createDevelopmentBuilder(sessionId, sessionOutDir);
  const liveReload = watch ? createLiveReloadHub() : undefined;
  const bundles = new Map<string, DevelopmentBundle>();
  const dirtyEntries = new Set<string>();

  const getBundle = async (
    entry: string
  ): Promise<DevelopmentBundle | Response> => {
    const cached = bundles.get(entry);
    if (watch && cached !== undefined && !dirtyEntries.has(entry)) {
      return cached;
    }
    const bundle = await buildProject(entry);
    if (bundle instanceof Response) {
      if (watch) {
        dirtyEntries.add(entry);
      }
      return bundle;
    }
    if (watch) {
      bundles.set(entry, bundle);
      dirtyEntries.delete(entry);
    }
    return bundle;
  };

  const server = Bun.serve({
    hostname: config.server.host,
    port: config.server.port,
    fetch: async (request) => {
      const reloadResponse = liveReload?.handleRequest(request);
      if (reloadResponse) {
        return reloadResponse;
      }
      return (
        (await proxy(request)) ??
        serveProjectRequest(
          request,
          config,
          config.pages,
          getBundle,
          artifacts,
          liveReload
        )
      );
    },
  });

  return {
    server,
    config,
    getBundle,
    markDirty: (entries) => {
      entries.forEach((entry) => dirtyEntries.add(entry));
    },
    liveReload,
  };
}

function createServerHandle(
  getInstance: () => DevServerInstance,
  disposeWatcher: () => void
): DevServer {
  return new Proxy({} as DevServer, {
    get(_target, property) {
      if (property === 'stop') {
        return (closeActiveConnections?: boolean) => {
          disposeWatcher();
          getInstance().server.stop(closeActiveConnections);
        };
      }
      const server = getInstance().server as unknown as Record<
        PropertyKey,
        unknown
      >;
      const value = server[property];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(server)
        : value;
    },
  });
}

async function serveProjectRequest(
  request: Request,
  config: ResolvedConfig,
  pages: Record<string, string>,
  getBundle: (entry: string) => Promise<DevelopmentBundle | Response>,
  artifacts: Map<string, DevelopmentOutput>,
  liveReload: LiveReloadHub | undefined
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const route = pageRouteForPathname(pages, pathname);

  if (route !== undefined) {
    const entry = pages[route];
    const bundle = await getBundle(entry);
    if (bundle instanceof Response) {
      return bundle;
    }

    try {
      const { renderProjectHtml } = await import('./project');
      const html = await renderProjectHtml(
        config,
        {
          head: bundle.stylesheets.map(({ pathname: href }) => ({
            tag: 'link',
            attributes: { rel: 'stylesheet', href },
          })),
          scripts: [{ type: 'module', src: bundle.entry.pathname }],
        },
        entry,
        route
      );
      publishDevelopmentBundle(bundle, artifacts);
      return new Response(liveReload ? injectLiveReloadScript(html) : html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch (error: unknown) {
      console.error(error);
      return buildFailureResponse();
    }
  }

  if (pathname === '/bundle.js') {
    const bundle = await getBundle(config.entry);
    if (bundle instanceof Response) {
      return bundle;
    }

    try {
      publishDevelopmentBundle(bundle, artifacts);
      return new Response(null, {
        status: 307,
        headers: {
          location: bundle.entry.pathname,
          'cache-control': 'no-store',
        },
      });
    } catch (error: unknown) {
      console.error(error);
      return buildFailureResponse();
    }
  }

  const artifact = artifacts.get(pathname);
  if (artifact) {
    return new Response(Bun.file(artifact.filePath), {
      headers: {
        'content-type': artifact.type,
        'cache-control': 'no-store',
      },
    });
  }

  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}

function pageRouteForPathname(
  pages: Record<string, string>,
  pathname: string
): string | undefined {
  if (pages[pathname] !== undefined) {
    return pathname;
  }
  if (pathname === '/index.html') {
    return '/';
  }
  const candidate =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.replace(/\/+$/, '')
      : pathname;
  if (pages[candidate] !== undefined) {
    return candidate;
  }
  if (candidate.endsWith('/index.html')) {
    const base = candidate.slice(0, candidate.length - '/index.html'.length);
    if (base === '') {
      return '/';
    }
    if (pages[base] !== undefined) {
      return base;
    }
  }
  return undefined;
}

function injectLiveReloadScript(html: string): string {
  if (html.includes(LIVE_RELOAD_PATH)) {
    return html;
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${LIVE_RELOAD_CLIENT_SCRIPT}</body>`);
  }
  return html + LIVE_RELOAD_CLIENT_SCRIPT;
}

interface LiveReloadHub {
  handleRequest(request: Request): Response | undefined;
  broadcast(): void;
}

const reloadEncoder = new TextEncoder();

function createLiveReloadHub(): LiveReloadHub {
  const controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

  function handleRequest(request: Request): Response | undefined {
    if (new URL(request.url).pathname !== LIVE_RELOAD_PATH) {
      return undefined;
    }

    let streamController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        streamController = controller;
        controllers.add(controller);
        try {
          controller.enqueue(reloadEncoder.encode(': connected\n\n'));
        } catch {
          controllers.delete(controller);
        }
      },
      cancel: () => {
        if (streamController) {
          controllers.delete(streamController);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
      },
    });
  }

  function broadcast(): void {
    const message = reloadEncoder.encode('event: reload\ndata: {}\n\n');
    for (const controller of [...controllers]) {
      try {
        controller.enqueue(message);
      } catch {
        controllers.delete(controller);
      }
    }
  }

  return { handleRequest, broadcast };
}

function isWatchedFile(
  instance: DevServerInstance,
  relativePath: string
): boolean {
  if (relativePath === '' || relativePath.startsWith('..')) {
    return false;
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => IGNORED_WATCH_SEGMENTS.has(segment))) {
    return false;
  }
  const absolutePath = resolve(instance.config.root, relativePath);
  if (isWithinOrEqual(instance.config.build.outDir, absolutePath)) {
    return false;
  }
  const base = basename(absolutePath);
  if (base.startsWith('.') && absolutePath !== instance.config.configFile) {
    return false;
  }
  return WATCHED_EXTENSIONS.has(extname(base).toLowerCase());
}

function toRelativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join('/');
}

function isWithinOrEqual(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (pathFromParent !== '..' &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent))
  );
}

interface DevelopmentOutput {
  filePath: string;
  pathname: string;
  type: string;
}

interface DevelopmentBundle {
  entry: DevelopmentOutput;
  stylesheets: DevelopmentOutput[];
  artifacts: ReadonlyMap<string, DevelopmentOutput>;
}

function createDevelopmentBuilder(
  sessionId: string,
  sessionOutDir: string
): (entry: string) => Promise<DevelopmentBundle | Response> {
  let queue = Promise.resolve();

  return (entry) => {
    const result = queue.then(() =>
      buildProjectBundle(entry, sessionId, sessionOutDir)
    );
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

async function buildProjectBundle(
  entry: string,
  sessionId: string,
  sessionOutDir: string
): Promise<DevelopmentBundle | Response> {
  const generationId = createGenerationId();
  const generationOutDir = resolve(sessionOutDir, generationId);
  const generationUrl = `${DEVELOPMENT_URL_PREFIX}/${sessionId}/${generationId}`;
  const buildOptions = {
    entrypoints: [entry],
    outdir: generationOutDir,
    target: 'browser' as const,
    format: 'esm' as const,
    sourcemap: 'inline' as const,
    write: true,
    throw: false,
    publicPath: `${generationUrl}/`,
    naming: {
      entry: '[name]-[hash].[ext]',
      chunk: '[name]-[hash].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
    },
  };

  try {
    const result = await Bun.build(buildOptions);
    const entryArtifact = result.outputs.find(isEntryJavaScriptOutput);
    if (!result.success || !entryArtifact) {
      result.logs.forEach((log) => console.error(log));
      if (!entryArtifact) {
        console.error('Failed to build project bundle: no JavaScript output');
      }
      return buildFailureResponse();
    }

    const pendingArtifacts = new Map<string, DevelopmentOutput>();
    const outputs = new Map<
      Awaited<ReturnType<typeof Bun.build>>['outputs'][number],
      DevelopmentOutput
    >();

    for (const output of result.outputs) {
      const developmentOutput = createDevelopmentOutput(
        generationOutDir,
        generationUrl,
        output
      );
      if (pendingArtifacts.has(developmentOutput.pathname)) {
        throw new Error(
          `Development output URL collision: ${developmentOutput.pathname}`
        );
      }
      pendingArtifacts.set(developmentOutput.pathname, developmentOutput);
      outputs.set(output, developmentOutput);
    }

    const entry = outputs.get(entryArtifact);
    if (!entry) {
      throw new Error('Development entry output was not indexed');
    }

    return {
      entry,
      stylesheets: result.outputs
        .filter(isStylesheetOutput)
        .map((output) => outputs.get(output))
        .filter((output): output is DevelopmentOutput => output !== undefined),
      artifacts: pendingArtifacts,
    };
  } catch (error: unknown) {
    console.error(error);
    return buildFailureResponse();
  }
}

function publishDevelopmentBundle(
  bundle: DevelopmentBundle,
  artifacts: Map<string, DevelopmentOutput>
): void {
  for (const [pathname, output] of bundle.artifacts) {
    const existing = artifacts.get(pathname);
    if (existing) {
      if (existing.filePath === output.filePath) {
        continue;
      }
      throw new Error(`Development output URL collision: ${pathname}`);
    }
    artifacts.set(pathname, output);
  }
}

function createDevelopmentOutput(
  generationOutDir: string,
  generationUrl: string,
  output: Awaited<ReturnType<typeof Bun.build>>['outputs'][number]
): DevelopmentOutput {
  const filePath = resolve(output.path);
  const pathFromGeneration = relative(generationOutDir, filePath);
  if (
    pathFromGeneration === '' ||
    pathFromGeneration === '..' ||
    pathFromGeneration.startsWith(`..${sep}`) ||
    isAbsolute(pathFromGeneration)
  ) {
    throw new Error(
      `Development output must not escape outside its generation directory: ${output.path}`
    );
  }

  const urlPath = pathFromGeneration
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return {
    filePath,
    pathname: `${generationUrl}/${urlPath}`,
    type: output.type,
  };
}

function createGenerationId(): string {
  return randomUUID().replace(/-/g, '');
}

function buildFailureResponse(): Response {
  return new Response('Failed to build project bundle', {
    status: 500,
    headers: { 'cache-control': 'no-store' },
  });
}
