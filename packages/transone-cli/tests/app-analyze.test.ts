import { describe, expect, it } from 'bun:test';
import { nativeError } from '../src/app/errors';

describe('native app diagnostics', () => {
  it('includes source filename and unsupported-node reason', () => {
    const error = nativeError('/tmp/main.ts', '不支持的原生节点: input');
    expect(error.message).toContain('main.ts');
    expect(error.message).toContain('不支持的原生节点: input');
  });
});
