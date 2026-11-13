import type { NativeScreen } from '../../../src/app/types';

const watchFailure = 'watch failed';

const trace = {
  mounted: 'leaf:1/undefined;branch:1/undefined;a:1/undefined;b:1/undefined;',
  batched:
    'branch:2/1;leaf:2/1;branch:3/2;leaf2:2/1;leaf:3/2;leaf2:3/2;a:2/1;b:2/1;a:3/2;b:3/2;',
  failed: 'branch:5/3;leaf:5/3;leaf2:5/3;',
  recovered: 'branch:6/5;leaf:6/5;leaf2:6/5;a:6/5;b:6/5;',
  remounted: 'leaf:6/undefined;branch:6/undefined;a:6/undefined;b:6/undefined;',
  replaced: 'leaf:5/undefined;branch:5/undefined;a:5/undefined;b:5/undefined;',
};

const assertTrace = (stage: string, value: string) =>
  `expectTrace(${JSON.stringify(stage)}, ${JSON.stringify(value)})`;

export function notificationSmoke(
  screen: NativeScreen,
  language: 'ark' | 'kotlin'
): string {
  const root = screen.program?.instances.find((instance) => !instance.parent);
  const traceKey = screen.state.find(
    (state) =>
      state.key.startsWith(root?.id ?? '') && state.key.endsWith('_trace')
  )?.key;
  if (!root || !traceKey)
    throw new Error(
      'Notification smoke fixture is missing its root or trace state'
    );
  const instance = JSON.stringify(root.id);
  const stateKey = JSON.stringify(traceKey);

  if (language === 'ark')
    return `
function runNotificationSmoke(): string {
  let runtime = new TnRuntime();
  let seen = 0;
  const expectTrace = (stage: string, expected: string): void => {
    const trace = runtime.string(runtime.getState(${stateKey}));
    const actual = trace.substring(seen);
    if (actual !== expected) throw new Error(stage + ': ' + actual);
    seen = trace.length;
  };
  const invoke = (method: string): void => { runtime.invoke(${instance}, method, []); };
  runtime.mount();
  ${assertTrace('mount', trace.mounted)};
  invoke('batch');
  ${assertTrace('batch and nested reentry', trace.batched)};
  let failure = '';
  try { invoke('fail'); } catch (error) { failure = (error as Error).message; }
  if (failure !== '${watchFailure}') throw new Error('watch failure: ' + failure);
  ${assertTrace('failed batch', trace.failed)};
  invoke('recover');
  ${assertTrace('recovery', trace.recovered)};
  const stale = runtime.action((): void => { invoke('stale'); });
  runtime.unmount();
  runtime.mount();
  ${assertTrace('remount', trace.remounted)};
  stale();
  ${assertTrace('old action', '')};
  runtime.action((): void => { invoke('stale'); })();
  ${assertTrace('current action', 'stale;')};
  runtime.unmount();

  runtime = new TnRuntime();
  seen = 0;
  runtime.mount();
  invoke('batch');
  ${assertTrace('before reentrant remount', trace.mounted + trace.batched)};
  let replaceMount = true;
  runtime.changed = (): void => {
    const trace = runtime.string(runtime.getState(${stateKey}));
    if (replaceMount && trace.endsWith('leaf2:5/3;')) {
      replaceMount = false;
      runtime.unmount();
      runtime.mount();
    }
  };
  invoke('fail');
  ${assertTrace('remount during failure', trace.failed + trace.replaced)};
  invoke('recover');
  ${assertTrace('recovery after reentrant remount', trace.recovered)};
  runtime.unmount();
  return 'TransOne notification smoke passed';
}
`;

  return `
fun runNotificationSmoke(): String {
  var runtime = TnRuntime()
  var seen = 0
  fun expectTrace(stage: String, expected: String) {
    val trace = runtime.string(runtime.getState(${stateKey}))
    val actual = trace.substring(seen)
    check(actual == expected) { stage + ": " + actual }
    seen = trace.length
  }
  fun invoke(method: String) { runtime.invoke(${instance}, method, emptyList()) }
  runtime.mount()
  ${assertTrace('mount', trace.mounted)}
  invoke("batch")
  ${assertTrace('batch and nested reentry', trace.batched)}
  val failure = runCatching { invoke("fail") }.exceptionOrNull()
  check(failure?.message == "${watchFailure}") { "watch failure: " + failure }
  ${assertTrace('failed batch', trace.failed)}
  invoke("recover")
  ${assertTrace('recovery', trace.recovered)}
  val stale = runtime.action { invoke("stale") }
  runtime.unmount()
  runtime.mount()
  ${assertTrace('remount', trace.remounted)}
  stale()
  ${assertTrace('old action', '')}
  runtime.action { invoke("stale") }()
  ${assertTrace('current action', 'stale;')}
  runtime.unmount()

  runtime = TnRuntime()
  seen = 0
  runtime.mount()
  invoke("batch")
  ${assertTrace('before reentrant remount', trace.mounted + trace.batched)}
  var replaceMount = true
  runtime.changed = {
    val trace = runtime.string(runtime.getState(${stateKey}))
    if (replaceMount && trace.endsWith("leaf2:5/3;")) {
      replaceMount = false
      runtime.unmount()
      runtime.mount()
    }
  }
  invoke("fail")
  ${assertTrace('remount during failure', trace.failed + trace.replaced)}
  invoke("recover")
  ${assertTrace('recovery after reentrant remount', trace.recovered)}
  runtime.unmount()
  return "TransOne notification smoke passed"
}
`;
}
