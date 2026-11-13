import { expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { analyzeNativeScreen } from '../src/app/analyze';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import { resolveConfig } from '../src/config';
import { notificationSmoke } from './fixtures/native-notification-smoke/scenario';

it('runs the native notification smoke fixture through the generated Ark runtime', async () => {
  const root = resolve(import.meta.dir, '../../..');
  const entry = resolve(
    import.meta.dir,
    'fixtures/native-notification-smoke/main.ts'
  );
  const config = await resolveConfig({
    root,
    config: { entry },
    target: 'app-harmony',
  });
  const screen = await analyzeNativeScreen(entry, config);
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    nativeRuntimeSource(screen, 'ark') + notificationSmoke(screen, 'ark')
  );
  const result: unknown = new Function(
    code + '\nreturn runNotificationSmoke();'
  )();
  expect(result).toBe('TransOne notification smoke passed');
}, 30_000);
