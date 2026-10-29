import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBundleInputTracker } from '../src/bundle-inputs';
import { withBuildOutput } from '../src/output-transaction';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'transone-publish-'));
  roots.push(root);
  const outDir = join(root, 'output');
  mkdirSync(outDir);
  writeFileSync(join(outDir, 'keep'), 'old');
  return { root, outDir };
}
function generated(root: string, outDir: string) {
  writeFileSync(join(outDir, 'new'), 'new');
  return { root, outDir, assetsBuilt: [join(outDir, 'new')] };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('build publication recovery', () => {
  it('restores previous output when publishing the staged directory fails', async () => {
    const options = fixture();
    await expect(
      withBuildOutput(
        options,
        async (stage) => generated(options.root, stage),
        {
          rename: async (from, to) => {
            if (to === options.outDir && !String(from).endsWith('.previous'))
              throw new Error('publish refused');
            await rename(from, to);
          },
          rm,
        }
      )
    ).rejects.toThrow('publish refused');
    expect(readFileSync(join(options.outDir, 'keep'), 'utf8')).toBe('old');
    expect(readdirSync(options.root)).toEqual(['output']);
  });
  it('preserves and identifies the recovery backup when rollback also fails', async () => {
    const options = fixture();
    await expect(
      withBuildOutput(
        options,
        async (stage) => generated(options.root, stage),
        {
          rename: async (from, to) => {
            if (to === options.outDir)
              throw new Error(
                String(from).endsWith('.previous')
                  ? 'rollback refused'
                  : 'publish refused'
              );
            await rename(from, to);
          },
          rm,
        }
      )
    ).rejects.toThrow(/previous output.*\.previous/);
    const backup = readdirSync(options.root).find((name) =>
      name.endsWith('.previous')
    )!;
    expect(readFileSync(join(options.root, backup, 'keep'), 'utf8')).toBe(
      'old'
    );
    expect(readdirSync(options.root)).toEqual([backup]);
  });
  it('returns published output successfully when old-backup cleanup fails', async () => {
    const options = fixture();
    const result = await withBuildOutput(
      options,
      async (stage) => generated(options.root, stage),
      {
        rename,
        rm: async (path, flags) => {
          if (String(path).endsWith('.previous'))
            throw new Error('backup cleanup refused');
          await rm(path, flags);
        },
      }
    );
    expect(result.assetsBuilt).toEqual([join(options.outDir, 'new')]);
    expect(readFileSync(join(options.outDir, 'new'), 'utf8')).toBe('new');
    const backup = readdirSync(options.root).find((name) =>
      name.endsWith('.previous')
    )!;
    expect(readFileSync(join(options.root, backup, 'keep'), 'utf8')).toBe(
      'old'
    );
  });
  it('serializes the same canonical destination but lets another destination proceed', async () => {
    const options = fixture();
    symlinkSync(options.root, join(options.root, 'alias'));
    let unlock!: () => void;
    const hold = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = withBuildOutput(options, async (stage) => {
      started();
      await hold;
      return generated(options.root, stage);
    });
    await firstStarted;
    let secondEntered = false;
    const second = withBuildOutput(
      { ...options, outDir: join(options.root, 'alias/output') },
      async (stage) => {
        secondEntered = true;
        return generated(options.root, stage);
      }
    );
    const independent = await withBuildOutput(
      { ...options, outDir: join(options.root, 'independent') },
      async (stage) => generated(options.root, stage)
    );
    expect(existsSync(join(independent.outDir, 'new'))).toBe(true);
    expect(secondEntered).toBe(false);
    unlock();
    await Promise.all([first, second]);
    expect(secondEntered).toBe(true);
    expect(readFileSync(join(options.outDir, 'new'), 'utf8')).toBe('new');
    expect(readdirSync(options.root).sort()).toEqual([
      'alias',
      'independent',
      'output',
    ]);
  });
  it('releases the destination queue even if temporary cleanup diagnostics throw', async () => {
    const options = fixture();
    const warning = spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('diagnostic failed');
    });
    try {
      await expect(
        withBuildOutput(
          options,
          async () => {
            throw new Error('generation failed');
          },
          {
            rename,
            rm: async () => {
              throw new Error('cleanup failed');
            },
          }
        )
      ).rejects.toThrow('generation failed');
    } finally {
      warning.mockRestore();
    }
    const next = withBuildOutput(options, async (stage) =>
      generated(options.root, stage)
    );
    const result = await Promise.race([
      next,
      Bun.sleep(200).then(() => 'queue stuck'),
    ]);
    expect(result).not.toBe('queue stuck');
  });
  it('protects unused local imports even when Bun input metadata is unavailable', async () => {
    const options = fixture();
    writeFileSync(join(options.root, 'helper.js'), 'export const value = 7;');
    writeFileSync(
      join(options.root, 'main.ts'),
      `import {value} from './helper.js'; export const other = 1;`
    );
    const inputs = createBundleInputTracker();
    const result = await Bun.build({
      entrypoints: [join(options.root, 'main.ts')],
      plugins: [inputs.plugin],
      target: 'browser',
    });
    expect(result.success).toBe(true);
    expect(inputs.paths(result)).toContain(
      realpathSync(join(options.root, 'helper.js'))
    );
  });
  it('still reports successful publication if cleanup and its warning logger both fail', async () => {
    const options = fixture();
    const warning = spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('logger failed');
    });
    try {
      const result = await withBuildOutput(
        options,
        async (stage) => generated(options.root, stage),
        {
          rename,
          rm: async (path, flags) => {
            if (String(path).endsWith('.previous'))
              throw new Error('cleanup failed');
            await rm(path, flags);
          },
        }
      );
      expect(result.assetsBuilt).toEqual([join(options.outDir, 'new')]);
      expect(readFileSync(join(options.outDir, 'new'), 'utf8')).toBe('new');
    } finally {
      warning.mockRestore();
    }
  });
});
