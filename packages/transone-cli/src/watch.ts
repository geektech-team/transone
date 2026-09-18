import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const RECURSIVE_WATCH_UNSUPPORTED_ERROR = 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM';
const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_POLL_INTERVAL_MS = 300;

export interface FileWatcherOptions {
  root: string;
  isRelevant: (relativePath: string) => boolean;
  onChange: (changedPath: string) => void;
  debounceMs?: number;
  pollIntervalMs?: number;
}

export interface FileWatcher {
  dispose: () => void;
}

export function createFileWatcher(options: FileWatcherOptions): FileWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disposers: Array<() => void> = [];

  const scheduleChange = (relativePath: string): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      options.onChange(relativePath);
    }, debounceMs);
  };

  disposers.push(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  const nativeWatcher = tryCreateNativeWatcher(
    options.root,
    options.isRelevant,
    scheduleChange
  );
  if (nativeWatcher) {
    disposers.push(nativeWatcher);
  } else {
    disposers.push(
      createPollingWatcher(
        options.root,
        options.isRelevant,
        options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        scheduleChange
      )
    );
  }

  return {
    dispose: () => {
      disposers.splice(0).reverse().forEach((dispose) => dispose());
    },
  };
}

function tryCreateNativeWatcher(
  root: string,
  isRelevant: (relativePath: string) => boolean,
  onRelevantChange: (relativePath: string) => void
): (() => void) | undefined {
  let watcher: FSWatcher;
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (typeof filename !== 'string') {
        return;
      }
      const relativePath = toRelativePath(root, filename);
      if (relativePath === undefined || !isRelevant(relativePath)) {
        return;
      }
      onRelevantChange(relativePath);
    });
  } catch (error: unknown) {
    if (isRecursiveWatchUnsupported(error)) {
      return undefined;
    }
    throw error;
  }

  return () => watcher.close();
}

function createPollingWatcher(
  root: string,
  isRelevant: (relativePath: string) => boolean,
  intervalMs: number,
  onRelevantChange: (relativePath: string) => void
): () => void {
  let running = true;
  let snapshot = new Map<string, FileSnapshot>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const scan = async (): Promise<void> => {
    if (!running) {
      return;
    }
    const next = new Map<string, FileSnapshot>();
    try {
      await collectRelevantFiles(root, isRelevant, next);
    } catch {
      return;
    }

    let changedPath: string | undefined;
    for (const [relativePath, snapshotEntry] of next) {
      const previous = snapshot.get(relativePath);
      if (
        !previous ||
        previous.mtimeMs !== snapshotEntry.mtimeMs ||
        previous.size !== snapshotEntry.size
      ) {
        changedPath = relativePath;
        break;
      }
    }
    if (changedPath === undefined) {
      for (const relativePath of snapshot.keys()) {
        if (!next.has(relativePath)) {
          changedPath = relativePath;
          break;
        }
      }
    }
    snapshot = next;
    if (changedPath !== undefined) {
      onRelevantChange(changedPath);
    }
  };

  void scan();
  timer = setInterval(() => {
    void scan();
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    running = false;
    if (timer) {
      clearInterval(timer);
    }
  };
}

interface FileSnapshot {
  mtimeMs: number;
  size: number;
}

async function collectRelevantFiles(
  root: string,
  isRelevant: (relativePath: string) => boolean,
  output: Map<string, FileSnapshot>
): Promise<void> {
  const pendingDirectories = [''];
  while (pendingDirectories.length > 0) {
    const relativeDirectory = pendingDirectories.pop();
    if (relativeDirectory === undefined) {
      break;
    }
    const absoluteDirectory = join(root, relativeDirectory);
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relativePath =
        relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        pendingDirectories.push(relativePath);
        continue;
      }
      if (!entry.isFile() || !isRelevant(relativePath)) {
        continue;
      }
      try {
        const info = await stat(join(root, relativePath));
        output.set(relativePath, { mtimeMs: info.mtimeMs, size: info.size });
      } catch {
        // The file vanished while the tree was being scanned.
      }
    }
  }
}

function toRelativePath(root: string, filename: string): string | undefined {
  const relativePath = isAbsolute(filename)
    ? relative(root, filename)
    : filename.split('\\').join('/');
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith('../')) {
    return undefined;
  }
  return relativePath.split('\\').join('/');
}

function isRecursiveWatchUnsupported(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === RECURSIVE_WATCH_UNSUPPORTED_ERROR
  );
}
