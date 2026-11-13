import type { NativeRuntimeFragments } from './runtime-codegen';
import {
  arkCollectionMethods,
  arkCollectionTypes,
} from './runtime-collections-ark';

/** This runtime is emitted as ordinary, typed ArkTS; it never evaluates JS source. */
export function arkRuntime(f: NativeRuntimeFragments): string {
  return `class TnValue {
  kind: string;
  number: number = 0;
  text: string = '';
  boolean: boolean = false;
  collection: TnCollection | undefined = undefined;
  constructor(kind: string) { this.kind = kind; }
  static undefined: TnValue = new TnValue('undefined');
  static nullValue: TnValue = new TnValue('null');
  static num(value: number): TnValue { const result = new TnValue('number'); result.number = value; return result; }
  static str(value: string): TnValue { const result = new TnValue('string'); result.text = value; return result; }
  static bool(value: boolean): TnValue { const result = new TnValue('boolean'); result.boolean = value; return result; }
  static fromCollection(value:TnCollection):TnValue {const result=new TnValue(value.array?'array':'object');result.collection=value;return result;}
}
${arkCollectionTypes}
class TnWatch {
  instance: string; key: string; method: string; immediate: boolean;
  constructor(instance: string, key: string, method: string, immediate: boolean) {
    this.instance = instance; this.key = key; this.method = method; this.immediate = immediate;
  }
}
class TnNotification {
  instance: string; method: string; next: TnValue; previous: TnValue; generation: number;
  constructor(instance: string, method: string, next: TnValue, previous: TnValue, generation: number) {
    this.instance=instance; this.method=method; this.next=next; this.previous=previous; this.generation=generation;
  }
}
class TnFailure extends Error {
  errors: Error[];
  constructor(errors: Error[]) {super('Native component operation and recovery failed'); this.name='AggregateError';this.errors=errors;}
}
class TnRuntime {
  private state: Map<string, TnValue> = new Map<string, TnValue>();
  private stateVersions:Map<string,number> = new Map<string,number>();
  private readCapture:TnRead[] | undefined=undefined;
  private renderSamples:Map<string,TnRenderSample> = new Map<string,TnRenderSample>();
  private overrides: Map<string, Map<string, TnValue>> = new Map<string, Map<string, TnValue>>();
  private nativeProps: Map<string, Map<string, TnValue>> = new Map<string, Map<string, TnValue>>();
  private baseline: Map<string, TnValue> = new Map<string, TnValue>();
  private mounted: Set<string> = new Set<string>();
  private started: Set<string> = new Set<string>();
  private queue: Map<string,TnNotification[]> = new Map<string,TnNotification[]>();
  private busy: boolean = false;
  private busyOwners:Set<string> = new Set<string>();
  private syncing: boolean = false;
  private active: boolean = true;
  private mounting: boolean = false;
  private hasMounted: boolean = false;
  private unmounting: boolean = false;
  private depth: number = 0;
  private cleanupDepth: number = 0;
  private generation: number = 0;
  private valuePool: Map<string,TnValue> = new Map<string,TnValue>();
  private memos: Map<string,TnMemo> = new Map<string,TnMemo>();
  private propsVersions: Map<string,number> = new Map<string,number>();
  private trackedOwners:string[] = ${f.renderTrackedOwners ?? '[]'};
  private instances: string[] = ${f.instances};
  private watchers: TnWatch[] = ${f.watchers};
  changed: () => void = () => {};
  constructor() { ${f.initialValues ?? ''} ${f.initialState} this.syncBindings(); }
  initial(key: string, value: TnValue): void { this.state.set(key, value); }
  getState(key: string): TnValue { this.record(this.stateVersions,key);return this.state.get(key) ?? TnValue.undefined; }
  assign(key: string, value: TnValue): void {
    const old=this.state.get(key)??TnValue.undefined;
    this.state.set(key,value);
    if(!this.strictEqual(old,value)){this.bump(this.stateVersions,key);this.changed();}
  }
  private propKeys(instance: string): string[] { switch(instance) { ${f.propKeysCases} default: return []; } }
  private parent(instance: string): string | undefined { switch(instance) { ${f.parentCases} default: return undefined; } }
  private boundProp(instance: string, key: string): TnValue { switch(instance + ':' + key) { ${f.propCases} default: return TnValue.undefined; } }
  private renderDependencies(instance:string):TnValue[] {switch(instance){${f.renderDependencyCases ?? ''} default:return [];}}
  private renderTracked(instance:string):boolean {return ${f.renderTrackedOwners !== undefined ? 'this.trackedOwners.includes(instance)' : f.renderDependencyCases ? 'true' : 'false'};}
${arkCollectionMethods}
  private syncBindings(): void {
    if(this.syncing) return;
    this.syncing = true;
    try {
      const renders=new Map<string,boolean>();
      const samples=new Map<string,TnRenderSample>();
      for(const instance of this.instances) {
        const values = new Map<string, TnValue>();
        let different = false;
        const previous = this.nativeProps.get(instance);
        const owner=this.parent(instance);
        if(owner!==undefined&&previous){
          let render=renders.get(owner);
          if(render===undefined){render=this.shouldRender(owner,samples);renders.set(owner,render);}
          if(!render)continue;
        }
        for(const key of this.propKeys(instance)) {
          const value = this.boundProp(instance,key); values.set(key,value);
          if(previous && !this.same(value,previous.get(key) ?? TnValue.undefined)) different=true;
        }
        this.nativeProps.set(instance,values);
        const restoresOverride=previous!==undefined&&owner!==undefined&&this.renderTracked(owner)&&renders.get(owner)===true&&this.overrides.has(instance);
        if(different||restoresOverride) {
          const overlay=this.overrides.get(instance);
          let hasLocal=false;
          if(restoresOverride&&overlay)overlay.forEach((_value:TnValue,key:string)=>{if(!values.has(key))hasLocal=true;});
          if(hasLocal&&overlay){const merged=new Map<string,TnValue>(overlay);values.forEach((value:TnValue,key:string)=>{merged.set(key,value);});this.overrides.set(instance,merged);}
          else this.overrides.delete(instance);
          this.bumpProps(instance);
        }
      }
      samples.forEach((sample:TnRenderSample,owner:string)=>{this.renderSamples.set(owner,sample);});
    } finally { this.syncing = false; }
  }
  prop(instance: string, key: string): TnValue {
    const values = this.overrides.get(instance);
    return values && values.has(key) ? values.get(key)! : this.nativeProps.get(instance)?.get(key) ?? TnValue.undefined;
  }
  setProps(instance: string, values: Map<string, TnValue>): void {
    this.bumpProps(instance);
    let override = this.overrides.get(instance);
    if(!override) { override=new Map<string, TnValue>(); this.overrides.set(instance,override); }
    values.forEach((value: TnValue, key: string) => { override!.set(key,value); });
    this.changed();
    this.refresh(instance);
  }
  private execute(instance: string, method: string, args: TnValue[]): TnValue {
    switch(instance + ':' + method) { ${f.methodCases} default: return TnValue.undefined; }
  }
  private eventName(instance: string, method: string): string | undefined {
    switch(instance + ':' + method) { ${f.eventCases} default: return undefined; }
  }
  emit(instance: string, event: string, args: TnValue[]): void {
    if(!this.active) return;
    switch(instance + ':' + event) { ${f.emitterCases} default: return; }
  }
  private hook(instance: string, phase: string): void {
    const cleanup=phase==='beforeUnmount' || phase==='onUnmounted';
    if(cleanup)this.cleanupDepth++;
    try { switch(instance + ':' + phase) { ${f.hookCases} default: return; } }
    finally { if(cleanup)this.cleanupDepth--; }
  }
  invoke(instance: string, method: string, args: TnValue[]): TnValue {
    if(!this.active && (this.cleanupDepth===0 || this.eventName(instance,method)!==undefined || this.watchers.some((watch: TnWatch)=>watch.instance===instance && watch.method===method))) return TnValue.undefined;
    const generation=this.generation;
    this.depth++;
    let result=TnValue.undefined;
    let failure: Error | undefined=undefined;
    try {
      result=this.execute(instance,method,args);
      const event=this.eventName(instance,method);
      if(event!==undefined && this.active && generation===this.generation) this.emit(instance,event,result.kind==='undefined'?args:[result]);
    } catch(error) { failure=error as Error; }
    if(generation===this.generation)this.depth--;
    if(this.depth===0 && generation===this.generation && this.active) {
      try { this.refresh(); }
      catch(error) { failure=failure?new TnFailure([failure,error as Error]):error as Error; }
    }
    if(generation!==this.generation) return TnValue.undefined;
    if(failure) throw failure;
    return result;
  }
  private collect(target: string | undefined = undefined): void {
    if(target===undefined) this.syncBindings();
    for(const watch of this.watchers) {
      if(!this.mounted.has(watch.instance) || (target!==undefined && watch.instance!==target)) continue;
      const key=watch.instance+':'+watch.method;
      const next=this.prop(watch.instance,watch.key);
      const previous=this.baseline.get(key) ?? TnValue.undefined;
      this.baseline.set(key,next);
      if(!this.same(next,previous)) this.enqueue(new TnNotification(watch.instance,watch.method,next,previous,this.generation));
    }
  }
  private enqueue(notification:TnNotification):void {
    const batch=this.queue.get(notification.instance);
    if(batch) batch.push(notification);
    else this.queue.set(notification.instance,[notification]);
  }
  private drainOwner(owner:string):void {
    if(this.busyOwners.has(owner))return;
    const generation=this.generation;
    this.busyOwners.add(owner);
    try {
      while(generation===this.generation && this.active){
        const batch=this.queue.get(owner);
        if(batch===undefined)break;
        this.queue.delete(owner);
        for(const notification of batch){
          if(generation!==this.generation || !this.active)return;
          if(notification.generation!==this.generation || !this.mounted.has(owner))continue;
          this.invoke(owner,notification.method,[notification.next,notification.previous]);
        }
      }
    }catch(error){if(generation===this.generation){this.queue.delete(owner);throw error as Error;}}
    finally{if(generation===this.generation)this.busyOwners.delete(owner);}
  }
  private refresh(target: string | undefined = undefined): void {
    const generation=this.generation;
    if(this.busy) {if(target!==undefined) {this.collect(target);this.drainOwner(target);} return;}
    this.collect(target);
    this.busy=true;
    try {
      while(generation===this.generation && this.active) {
        this.queue.forEach((_batch:TnNotification[],owner:string)=>{
          if(generation===this.generation)this.drainOwner(owner);
        });
        if(generation!==this.generation || !this.active) return;
        if(this.depth>0) break;
        this.collect();
        if(this.queue.size===0) break;
      }
    } catch(error) { if(generation===this.generation) {this.queue.clear(); throw error as Error;} }
    finally { if(generation===this.generation) this.busy=false; }
  }
  private mountInstance(instance: string, generation: number): void {
    this.started.add(instance);
    this.hook(instance,'beforeMount');
    if(generation!==this.generation) return;
    for(const child of this.instances) if(this.parent(child)===instance) {
      this.mountInstance(child,generation);
      if(generation!==this.generation) return;
    }
    this.mounted.add(instance);
    for(const watch of this.watchers) if(watch.instance===instance) {
      const value=this.prop(instance,watch.key); this.baseline.set(instance+':'+watch.method,value);
      if(watch.immediate) this.enqueue(new TnNotification(instance,watch.method,value,TnValue.undefined,generation));
    }
    this.refresh();
    if(generation!==this.generation) return;
    this.hook(instance,'onMounted');
  }
  mount(): void {
    if(this.mounting || this.unmounting || this.started.size>0) return;
    this.mounting=true; this.active=true; this.depth=0;
    this.busyOwners=new Set<string>();
    if(this.hasMounted)for(const instance of this.instances)this.bumpProps(instance);
    this.hasMounted=true;
    const generation=this.generation;
    try {
      this.syncBindings();
      for(const instance of this.instances) if(this.parent(instance)===undefined) {
        this.mountInstance(instance,generation);
        if(generation!==this.generation) return;
      }
      this.changed();
    } catch(error) { try {this.unmount();} catch(cleanup) {throw new TnFailure([error as Error,cleanup as Error]);} throw error as Error; }
    finally { this.mounting=false; }
  }
  private cleanupInstance(instance: string, started: Set<string>, failures: Error[]): void {
    if(!started.has(instance)) return;
    try {this.hook(instance,'beforeUnmount');} catch(error) {failures.push(error as Error);}
    for(const child of this.instances) if(this.parent(child)===instance) this.cleanupInstance(child,started,failures);
    try {this.hook(instance,'onUnmounted');} catch(error) {failures.push(error as Error);}
  }
  unmount(): void {
    if(this.unmounting || !this.active) return;
    this.unmounting=true; this.active=false; this.generation++; this.queue.clear(); this.busy=false; this.busyOwners=new Set<string>(); this.mounted.clear();
    const started=this.started;this.started=new Set<string>();
    const failures: Error[]=[];
    try {
      for(const instance of this.instances) if(this.parent(instance)===undefined) this.cleanupInstance(instance,started,failures);
      try {this.changed();} catch(error) {failures.push(error as Error);}
    } finally {this.unmounting=false;}
    if(failures.length===1)throw failures[0];
    if(failures.length>1)throw new TnFailure(failures);
  }
  action(operation: () => void): () => void {
    const generation=this.generation;
    return () => {if(!this.active || generation!==this.generation)return;try{operation();if(this.active && generation===this.generation)this.refresh();}catch(error){console.error(String(error));}};
  }
  same(left: TnValue, right: TnValue): boolean {
    if(left.kind!==right.kind)return false;
    if(left.kind==='number') {
      const a=left.number;
      const b=right.number;
      // ArkTS disallows Object.is; preserve NaN equality and signed zeros.
      return a===b ? a!==0 || 1/a===1/b : Number.isNaN(a) && Number.isNaN(b);
    }
    if(left.kind==='string')return left.text===right.text;
    if(left.kind==='boolean')return left.boolean===right.boolean;
    if(left.collection||right.collection)return left.collection===right.collection;
    return true;
  }
  truth(value: TnValue): boolean {
    if(value.collection)return true;
    if(value.kind==='number')return value.number!==0 && !Number.isNaN(value.number);
    if(value.kind==='string')return value.text.length>0;
    return value.kind==='boolean' && value.boolean;
  }
  string(value: TnValue): string {
    try{return this.coerceString(value);}catch(error){console.error(String(error));return '';}
  }
  private number(value: TnValue): number {
    if(value.kind==='number')return value.number;
    if(value.kind==='null')return 0;
    if(value.kind==='boolean')return value.boolean?1:0;
    if(value.kind==='string')return Number(value.text);
    if(value.collection)return Number(this.coerceString(value,new Set<TnCollection>(),false));
    return NaN;
  }
  logical(operator: string, left: () => TnValue, right: () => TnValue): TnValue {
    const value=left();
    if(operator==='??')return value.kind==='null'||value.kind==='undefined'?right():value;
    return operator==='&&' ? this.truth(value)?right():value : this.truth(value)?value:right();
  }
  unary(operator: string, value: TnValue): TnValue {
    if(operator==='!')return TnValue.bool(!this.truth(value));
    if(operator==='String')return TnValue.str(this.coerceString(value));
    if(operator==='Boolean')return TnValue.bool(this.truth(value));
    return TnValue.num(operator==='-'?-this.number(value):this.number(value));
  }
  private strictEqual(left: TnValue, right: TnValue): boolean {
    if(left.kind!==right.kind)return false;
    return left.kind==='number'?left.number===right.number:this.same(left,right);
  }
  private equal(left: TnValue, right: TnValue): boolean {
    if(left.kind===right.kind)return this.strictEqual(left,right);
    if((left.kind==='null'||left.kind==='undefined')&&(right.kind==='null'||right.kind==='undefined'))return true;
    if(left.kind==='null'||left.kind==='undefined'||right.kind==='null'||right.kind==='undefined')return false;
    if(left.collection&&right.collection)return false;
    if(left.collection||right.collection)return this.equal(this.primitive(left),this.primitive(right));
    return this.number(left)===this.number(right);
  }
  binary(operator: string, left: TnValue, right: TnValue): TnValue {
    if(operator==='==='||operator==='!==')return TnValue.bool(operator==='==='?this.strictEqual(left,right):!this.strictEqual(left,right));
    if(operator==='=='||operator==='!=')return TnValue.bool(operator==='=='?this.equal(left,right):!this.equal(left,right));
    const lhs=this.primitive(left),rhs=this.primitive(right);
    const a=this.number(lhs),b=this.number(rhs);
    switch(operator) {
      case '+':return lhs.kind==='string'||rhs.kind==='string'?TnValue.str(this.coerceString(lhs)+this.coerceString(rhs)):TnValue.num(a+b);
      case '-':return TnValue.num(a-b);case '*':return TnValue.num(a*b);case '/':return TnValue.num(a/b);case '%':return TnValue.num(a%b);
      case '===':return TnValue.bool(this.strictEqual(left,right));case '!==':return TnValue.bool(!this.strictEqual(left,right));
      case '==':return TnValue.bool(this.equal(left,right));case '!=':return TnValue.bool(!this.equal(left,right));
      case '<':return TnValue.bool(lhs.kind==='string'&&rhs.kind==='string'?lhs.text<rhs.text:a<b);
      case '<=':return TnValue.bool(lhs.kind==='string'&&rhs.kind==='string'?lhs.text<=rhs.text:a<=b);
      case '>':return TnValue.bool(lhs.kind==='string'&&rhs.kind==='string'?lhs.text>rhs.text:a>b);
      case '>=':return TnValue.bool(lhs.kind==='string'&&rhs.kind==='string'?lhs.text>=rhs.text:a>=b);
      default:throw new Error('Unsupported native operator: '+operator);
    }
  }
  text(values: TnValue[], _revision: number = 0): string {return values.map((value: TnValue)=>this.string(value)).join('');}
}
`;
}
