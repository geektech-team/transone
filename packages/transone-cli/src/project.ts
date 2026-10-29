import {
  createDomWindow,
  installDomGlobals,
  DOM_GLOBAL_KEYS,
} from 'transone/dom';
import type { AppDocumentRenderOptions, OneApp } from 'transone';
import type { ResolvedConfig } from './types';
import {
  createWebComponentContext,
  type WebComponentContext,
} from './components/web';
import { createWebStylesPlugin } from './web-styles';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_GLOBAL_KEYS = [...DOM_GLOBAL_KEYS, '__APP__'];

type ProjectGlobalKey = (typeof PROJECT_GLOBAL_KEYS)[number];
type GlobalDescriptorMap = Map<
  ProjectGlobalKey,
  PropertyDescriptor | undefined
>;

interface ProjectEntryModule {
  app?: unknown;
}

let projectDomQueue: Promise<void> = Promise.resolve();

export async function renderProjectHtml(
  config: ResolvedConfig,
  options: AppDocumentRenderOptions,
  entry: string = config.entry,
  route = '/',
  components?: WebComponentContext
): Promise<string> {
  return withProjectDom(
    async () => {
      const module = await importProjectEntry(entry, config, components);
      const app = module.app as Partial<OneApp> | undefined;
      if (!app || typeof app.renderHtmlDocument !== 'function') {
        throw new Error(
          `TransOne entry ${entry} must export an app with renderHtmlDocument()`
        );
      }

      return app.renderHtmlDocument(options);
    },
    route,
    config.build.basePath
  );
}

async function withProjectDom<T>(
  callback: () => Promise<T>,
  route: string,
  basePath: string
): Promise<T> {
  const task = projectDomQueue.then(() =>
    runWithProjectDom(callback, route, basePath)
  );
  projectDomQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

async function runWithProjectDom<T>(
  callback: () => Promise<T>,
  route: string,
  basePath: string
): Promise<T> {
  const url = `http://127.0.0.1${basePath}${route === '/' ? '/' : route}`;
  const windowRef = createDomWindow({ url });
  Object.assign(windowRef, {
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
  });
  const descriptors = captureGlobalDescriptors();

  try {
    installDomGlobals(windowRef);
    return await callback();
  } finally {
    restoreGlobalDescriptors(descriptors);
  }
}

let projectEntrySequence = 0;

async function importProjectEntry(
  entry: string,
  config: ResolvedConfig,
  context?: WebComponentContext
): Promise<ProjectEntryModule> {
  const components = context ?? createWebComponentContext(config, entry);
  if (components.active) {
    const directory = await mkdtemp(join(tmpdir(), 'transone-ssr-'));
    try {
      const result = await Bun.build({
        entrypoints: [components.entrypoint],
        target: 'bun',
        format: 'esm',
        outdir: directory,
        naming: 'entry.js',
        packages: 'bundle',
        plugins: [
          components.plugin,
          createWebStylesPlugin(new Set(), components.transform, false),
        ],
        throw: false,
      });
      if (!result.success)
        throw new Error(
          `Failed to build platform document: ${result.logs.map((log) => log.message).join('\n')}`
        );
      return (await import(join(directory, 'entry.js'))) as ProjectEntryModule;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  projectEntrySequence += 1;
  return (await import(
    `${entry}?transone_entry=${projectEntrySequence}`
  )) as ProjectEntryModule;
}

function captureGlobalDescriptors(): GlobalDescriptorMap {
  return new Map(
    PROJECT_GLOBAL_KEYS.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
}

function restoreGlobalDescriptors(descriptors: GlobalDescriptorMap): void {
  PROJECT_GLOBAL_KEYS.forEach((key) => {
    const descriptor = descriptors.get(key);
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
      return;
    }

    delete (globalThis as Record<string, unknown>)[key];
  });
}
