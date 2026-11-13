import { expect, it } from 'bun:test';
import { resolve } from 'node:path';

it('observes asynchronous teardown failures without delivering them to a new mount', () => {
  const source = `
    import {Component} from ${JSON.stringify(resolve(import.meta.dir, '../../index.ts'))};
    import {createDomWindow, installDomGlobals} from ${JSON.stringify(resolve(import.meta.dir, '../../dom/index.ts'))};
    installDomGlobals(createDomWindow());
    const pending = [], reported = [], unhandled = [];
    console.error = (_message, error) => reported.push(error.message);
    process.on('unhandledRejection', error => unhandled.push(error.message));
    function task(label) {
      let reject;
      const promise = new Promise((_resolve, no) => {reject=no;});
      pending.push({label, reject});
      return promise;
    }
    class Example extends Component {
      initState(){return {count:7};}
      initStyles(){const cleanup=task('dispose');this.onDispose(()=>cleanup);}
      render(){return {tag:'span',children:[String(this.state.count)]};}
      beforeUnmount(){return task('beforeUnmount');}
      onUnmounted(){return task('onUnmounted');}
    }
    const container=document.createElement('div');document.body.appendChild(container);
    const component=new Example();component.mount(container);component.unmount();component.mount(container);
    for(const item of pending.slice(0,3))item.reject(new Error(item.label));
    await new Promise(resolve=>setImmediate(resolve));
    await new Promise(resolve=>setImmediate(resolve));
    console.log(JSON.stringify({reported:reported.sort(),unhandled,state:component.state.count,text:container.textContent}));
  `;
  const result = Bun.spawnSync([process.execPath, '-e', source], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(new TextDecoder().decode(result.stderr)).toBe('');
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(new TextDecoder().decode(result.stdout).trim())).toEqual({
    reported: ['beforeUnmount', 'dispose', 'onUnmounted'],
    unhandled: [],
    state: 7,
    text: '7',
  });
});
