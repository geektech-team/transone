import { expect, it } from 'bun:test';
import { resolve } from 'node:path';

const componentEntry = JSON.stringify(
  resolve(import.meta.dir, '../component.ts')
);
const domEntry = JSON.stringify(resolve(import.meta.dir, '../../dom/index.ts'));
const routerEntry = JSON.stringify(
  resolve(import.meta.dir, '../../router/index.ts')
);
const routerInstance = JSON.stringify(
  resolve(import.meta.dir, '../../router/instance.ts')
);

function runFresh(source: string): unknown {
  const result = Bun.spawnSync({
    cmd: [process.execPath, '--eval', source],
    cwd: resolve(import.meta.dir, '../../../../..'),
  });
  expect({
    exitCode: result.exitCode,
    stderr: new TextDecoder().decode(result.stderr),
  }).toEqual({ exitCode: 0, stderr: '' });
  return JSON.parse(new TextDecoder().decode(result.stdout));
}

it('initializes a derived component from its direct entry before loading router classes', () => {
  const actual = runFresh(`
    const {Component}=await import(${componentEntry});
    let calls=0;
    class Parent extends Component {
      seed=2;
      initState(){calls++;return{count:this.seed};}
      initStyles(){} render(){return{tag:'span'};}
    }
    class Child extends Parent {seed=7;}
    const child=new Child();
    const count=child.state.count;
    child.unmount();
    console.log(JSON.stringify({count,calls}));
  `);
  expect(actual).toEqual({ count: 7, calls: 1 });
});

it('shares the validated router instance with navigator rendering after direct component loading', () => {
  const actual = runFresh(`
    const {Component}=await import(${componentEntry});
    const {createDomWindow,installDomGlobals}=await import(${domEntry});
    installDomGlobals(createDomWindow({url:'http://localhost/'}));
    const {Router}=await import(${routerEntry});
    const {setRouter,getRouter,useRouter,hasRouter,resetRouter}=await import(${routerInstance});
    class Page extends Component {initState(){return{};}initStyles(){}render(){return{tag:'main'};}}
    const router=new Router([{path:'/',component:Page},{path:'/target',component:Page}]);
    setRouter(router);
    let rejected=false;
    try{setRouter({push(){}});}catch(error){rejected=error.message==='Invalid router instance';}
    const same=getRouter()===router&&useRouter()===router&&hasRouter();
    class Link extends Component {
      initState(){return{};}initStyles(){}
      render(){return{tag:'navigator',props:{url:'/target'},children:['go']};}
    }
    const link=new Link();
    const node=link.mountToNode();
    const first=new Event('click',{cancelable:true});node.dispatchEvent(first);
    const path=router.getCurrentRoute()?.path;
    resetRouter();
    const second=new Event('click',{cancelable:true});node.dispatchEvent(second);
    let unavailable=false;try{useRouter();}catch(error){unavailable=error.message.startsWith('Router is not initialized');}
    link.unmount();router.destroy();
    console.log(JSON.stringify({rejected,same,path,intercepted:first.defaultPrevented,afterReset:second.defaultPrevented,empty:getRouter()===null&&!hasRouter(),unavailable}));
  `);
  expect(actual).toEqual({
    rejected: true,
    same: true,
    path: '/target',
    intercepted: true,
    afterReset: false,
    empty: true,
    unavailable: true,
  });
});
