import { expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build';

type NativeOptions = {
  success(response: Record<string, unknown>): void;
  fail(error: Record<string, unknown>): void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

for (const [target, apiName] of [
  ['mp-weixin', 'wx'],
  ['mp-alipay', 'my'],
  ['mp-bytedance', 'tt'],
] as const) {
  it(`${target} generated request cancellation and guarded catch/finally survive repeated failed page loads`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'transone-request-scope-'));
    const globals = globalThis as Record<string, unknown>;
    const previous = new Map(
      ['wx', 'my', 'tt', 'getApp'].map((key) => [key, globals[key]])
    );
    try {
      mkdirSync(join(root, 'src'));
      const framework = join(import.meta.dir, '../../transone/lib/index.ts');
      writeFileSync(
        join(root, 'src/main.ts'),
        `import {Component,h,createApp} from ${JSON.stringify(framework)};
         import {createRequest} from 'transone/request';
         const http=createRequest();
         class App extends Component {
           initState(){return {count:7,fail:false,error:'none',completed:0};}
           initStyles(){}
           beforeMount(){if(this.state.fail)throw new Error('page load failed');}
           render(){return h('button',{onClick:()=>this.load()},this.state.count);}
           load(signal,timeout=0,trace=()=>{}){
             const commit=this.guardCallback(response=>this.setState({count:response.data}));
             const fail=this.guardCallback(error=>this.setState({error:error.code}));
             const finish=this.guardCallback(()=>this.setState({completed:this.state.completed+1}));
             return http.get('/count',{signal,timeout})
               .catch(error=>{trace(error.code);throw error;})
               .then(commit,fail).finally(finish);
           }
         }
         export const app=createApp({root:App});`
      );
      writeFileSync(
        join(root, 'transone.config.ts'),
        `export default {entry:'src/main.ts',mp:{pages:{'/':'src/main.ts'}}};`
      );
      const result = await build({ root, target });
      const runtime = await import(join(result.outDir, 'transone-request.js'));
      let application: unknown;
      new Function(
        'App',
        'require',
        readFileSync(join(result.outDir, 'app.js'), 'utf8')
      )(
        (value: unknown) => (application = value),
        () => runtime
      );
      for (const key of ['wx', 'my', 'tt']) delete globals[key];
      globals.getApp = () => application;
      let entered = deferred<NativeOptions>();
      let aborts = 0;
      globals[apiName] = {
        request(options: NativeOptions) {
          entered.resolve(options);
          // Some hosts abort without invoking fail. The adapter must still settle.
          return { abort: () => aborts++ };
        },
      };
      let definition: Record<string, any> = {};
      new Function(
        'getApp',
        'Page',
        readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
      )(
        () => application,
        (value: typeof definition) => (definition = value)
      );
      const page: Record<string, any> = {
        ...definition,
        data: structuredClone(definition.data),
        setData(patch: object, callback?: () => void) {
          Object.assign(this.data, structuredClone(patch));
          callback?.();
        },
      };
      const mount = () => {
        page.onLoad();
        page.onReady?.();
      };
      const codes: string[] = [];
      const trace = (code: string) => codes.push(code);
      mount();

      for (let cycle = 0; cycle < 3; cycle++) {
        entered = deferred<NativeOptions>();
        const controller = new AbortController();
        const old = page.load(controller.signal, 0, trace);
        const native = await entered.promise;
        page.onUnload();
        page.setData({ fail: true });
        expect(() => mount()).toThrow('page load failed');
        page.setData({ fail: false });
        mount();
        page.setData({ count: 20 + cycle });
        // Unloading only invalidates the callbacks; cancellation is explicit.
        expect(controller.signal.aborted).toBe(false);
        expect(aborts).toBe(cycle);
        controller.abort();
        native.success({ data: 99, statusCode: 200, status: 200 });
        native.fail({ errMsg: 'request:fail timeout' });
        await old;
        expect(page.data.count).toBe(20 + cycle);
        expect(page.data.error).toBe('none');
        expect(page.data.completed).toBe(0);
      }
      expect(codes).toEqual(['ABORTED', 'ABORTED', 'ABORTED']);

      entered = deferred<NativeOptions>();
      const controller = new AbortController();
      const activeAbort = page.load(controller.signal, 0, trace);
      await entered.promise;
      controller.abort();
      await activeAbort;
      expect(page.data.error).toBe('ABORTED');
      expect(page.data.completed).toBe(1);

      entered = deferred<NativeOptions>();
      const activeTimeout = page.load(undefined, 1, trace);
      const timedOut = await entered.promise;
      await activeTimeout;
      timedOut.success({ data: 99, statusCode: 200, status: 200 });
      timedOut.fail({ errMsg: 'request:fail abort' });
      expect(page.data.count).toBe(22);
      expect(page.data.error).toBe('TIMEOUT');
      expect(page.data.completed).toBe(2);
      expect(aborts).toBe(5);
      expect(codes).toEqual([
        'ABORTED',
        'ABORTED',
        'ABORTED',
        'ABORTED',
        'TIMEOUT',
      ]);

      entered = deferred<NativeOptions>();
      const fresh = page.load(undefined, 0, trace);
      (await entered.promise).success({
        data: 12,
        statusCode: 200,
        status: 200,
      });
      await fresh;
      expect(page.data.count).toBe(12);
      expect(page.data.completed).toBe(3);
      expect(aborts).toBe(5);
      page.onUnload();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete globals[key];
        else globals[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}
