export const arkCollectionTypes = `
class TnCollection {
  array: boolean; values: Map<string,TnValue> = new Map<string,TnValue>();
  keys: string[] = []; length: number = 0; revision: number = 0;
  versions: Map<string,number> = new Map<string,number>();
  constructor(array: boolean) {this.array=array;}
}
class TnRead {
  versions:Map<string,number>;key:string;version:number;
  constructor(versions:Map<string,number>,key:string){this.versions=versions;this.key=key;this.version=versions.get(key)??0;}
}
class TnRenderSample {
  reads:TnRead[];propsVersion:number;
  constructor(reads:TnRead[],propsVersion:number){this.reads=reads;this.propsVersion=propsVersion;}
}
class TnEntry {
  key: TnValue; value: TnValue; spread: boolean;
  constructor(key:TnValue,value:TnValue,spread:boolean=false){this.key=key;this.value=value;this.spread=spread;}
}
class TnItem {
  value:TnValue;spread:boolean;hole:boolean;
  constructor(value:TnValue,spread:boolean=false,hole:boolean=false){this.value=value;this.spread=spread;this.hole=hole;}
}
class TnMemo {
  value:TnValue;reads:TnRead[];propsVersion:number;
  constructor(value:TnValue,reads:TnRead[],propsVersion:number){this.value=value;this.reads=reads;this.propsVersion=propsVersion;}
}
`;

export const arkCollectionMethods = `
  private box(value:TnValue):TnCollection {
    if(value.collection) return value.collection;
    throw new TypeError('Expected a plain object or array');
  }
  private index(key:string):number {
    const index=Number(key);
    return Number.isInteger(index)&&index>=0&&index<4294967295&&String(index)===key?index:-1;
  }
  private ownKeys(value:TnCollection):string[] {
    const numeric=value.keys.filter((key:string)=>this.index(key)>=0).sort((a:string,b:string)=>Number(a)-Number(b));
    return numeric.concat(value.keys.filter((key:string)=>this.index(key)<0));
  }
  private record(versions:Map<string,number>,key:string):void {
    if(this.readCapture)this.readCapture.push(new TnRead(versions,key));
  }
  private bump(versions:Map<string,number>,key:string):void {versions.set(key,(versions.get(key)??0)+1);}
  private bumpProps(instance:string):void {this.bump(this.propsVersions,instance);}
  private readsCurrent(reads:TnRead[]):boolean {return reads.every((read:TnRead)=>(read.versions.get(read.key)??0)===read.version);}
  private sampleReads(owner:string):TnRead[] {
    const reads:TnRead[]=[],capture=this.readCapture;
    this.readCapture=reads;
    try{this.renderDependencies(owner);}finally{this.readCapture=capture;}
    return reads;
  }
  private shouldRender(owner:string,samples:Map<string,TnRenderSample>):boolean {
    if(!this.renderTracked(owner))return true;
    const version=this.propsVersions.get(owner)??0,previous=this.renderSamples.get(owner);
    if(previous&&previous.propsVersion===version&&this.readsCurrent(previous.reads))return false;
    samples.set(owner,new TnRenderSample(this.sampleReads(owner),version));
    return true;
  }
  private write(box:TnCollection,key:string,value:TnValue,reactive:boolean=false):void {
    if(box.array&&key==='length') {
      const old=TnValue.num(box.length);
      const length=this.number(value);
      if(!Number.isInteger(length)||length<0||length>4294967295)throw new RangeError('Invalid array length');
      box.keys=box.keys.filter((key:string)=>{if(this.index(key)>=length){box.values.delete(key);return false;}return true;});
      box.length=length;
      if(reactive&&!this.strictEqual(old,value)){this.bump(box.versions,key);box.revision++;}
      return;
    }
    const existing=box.values.has(key),old=box.values.get(key)??TnValue.undefined;
    if(!existing)box.keys.push(key);
    box.values.set(key,value);
    const index=this.index(key);
    if(box.array&&index>=box.length)box.length=index+1;
    if(reactive&&!this.strictEqual(old,value)){
      this.bump(box.versions,key);
      if(box.array&&!Number.isNaN(Number(key)))this.bump(box.versions,'length');
      box.revision++;
    }
  }
  member(target:TnValue,key:TnValue,optional:boolean=false):TnValue {
    if(target.kind==='null'||target.kind==='undefined') {
      if(optional)return TnValue.undefined;
      throw new TypeError('Cannot read properties of '+target.kind);
    }
    const property=this.coerceString(key);
    if(target.collection){
      this.record(target.collection.versions,property);
      if(target.collection.array&&property==='length')return TnValue.num(target.collection.length);
      return target.collection.values.get(property)??TnValue.undefined;
    }
    if(target.kind==='string') {
      if(property==='length')return TnValue.num(target.text.length);
      const index=this.index(property);
      return index>=0&&index<target.text.length?TnValue.str(target.text.charAt(index)):TnValue.undefined;
    }
    return TnValue.undefined;
  }
  optionalMember(target:TnValue,key:()=>TnValue):TnValue {
    if(target.kind==='null'||target.kind==='undefined')return TnValue.undefined;
    return this.member(target,key());
  }
  setMember(target:TnValue,key:TnValue,value:TnValue):void {
    const collection=this.box(target),revision=collection.revision;
    this.write(collection,this.coerceString(key),value,true);
    if(revision!==collection.revision)this.changed();
  }
  makeObject(entries:TnEntry[]):TnValue {
    const result=new TnCollection(false);
    for(const entry of entries){
      if(entry.spread){
        const source=entry.value;
        if(source.collection)for(const key of this.ownKeys(source.collection))this.write(result,key,source.collection.values.get(key)!);
        else if(source.kind==='string')for(let index=0;index<source.text.length;index++)this.write(result,String(index),TnValue.str(source.text.charAt(index)));
      }else this.write(result,this.coerceString(entry.key),entry.value);
    }
    result.revision=0;
    return TnValue.fromCollection(result);
  }
  makeArray(items:TnItem[]):TnValue {
    const result=new TnCollection(true);
    for(const item of items){
      if(item.hole){if(result.length>=4294967295)throw new RangeError('Invalid array length');result.length++;continue;}
      if(item.spread){
        if(item.value.collection?.array){
          const source=item.value.collection;
          for(let index=0;index<source.length;index++){
            if(result.length>=4294967295)throw new RangeError('Invalid array length');
            this.write(result,String(result.length),source.values.get(String(index))??TnValue.undefined);
          }
        }else if(item.value.kind==='string'){
          for(const character of Array.from(item.value.text))this.write(result,String(result.length),TnValue.str(character));
        }else throw new TypeError('Array spread requires an array or string');
      }else {if(result.length>=4294967295)throw new RangeError('Invalid array length');this.write(result,String(result.length),item.value);}
    }
    result.revision=0;
    return TnValue.fromCollection(result);
  }
  allocateValue(id:string,array:boolean):void {this.valuePool.set(id,TnValue.fromCollection(new TnCollection(array)));}
  reference(id:string):TnValue {
    const value=this.valuePool.get(id);
    if(!value)throw new Error('Unknown native data reference '+id);
    return value;
  }
  fillValue(id:string,value:TnValue):void {
    const target=this.box(this.reference(id)),source=this.box(value);
    if(target.array!==source.array)throw new TypeError('Invalid native data reference kind');
    target.values=new Map<string,TnValue>(source.values);target.keys=source.keys.slice();target.length=source.length;target.revision=0;
  }
  revisionValue(value:TnValue,mode:string='auto'):TnValue {
    const collection=value.collection;
    if(collection&&this.readCapture){
      if(mode==='array'||(mode==='auto'&&collection.array)){
        this.record(collection.versions,'length');
        for(let index=0;index<collection.length;index++)this.record(collection.versions,String(index));
      }else for(const key of this.ownKeys(collection))this.record(collection.versions,key);
    }
    return TnValue.num(collection?.revision??0);
  }
  memo(owner:string,key:string,initial:TnValue,factory:()=>TnValue):TnValue {
    const identity=owner+':'+key,version=this.propsVersions.get(owner)??0;
    const previous=this.memos.get(identity);
    if(previous&&previous.propsVersion===version&&this.readsCurrent(previous.reads))return previous.value;
    const reads=this.sampleReads(owner);
    const value=!previous&&initial.kind!=='undefined'?initial:factory();
    this.memos.set(identity,new TnMemo(value,reads,version));
    return value;
  }
  private coerceString(value:TnValue,seen:Set<TnCollection>=new Set<TnCollection>(),stringHint:boolean=true):string {
    if(value.kind==='number')return String(value.number);
    if(value.kind==='string')return value.text;
    if(value.kind==='boolean')return value.boolean?'true':'false';
    if(value.kind==='null')return 'null';
    if(value.kind==='undefined')return 'undefined';
    const collection=this.box(value);
    if(!stringHint)this.record(collection.versions,'valueOf');
    this.record(collection.versions,'toString');
    if(collection.values.has('toString')){
      if(stringHint)this.record(collection.versions,'valueOf');
      throw new TypeError('Cannot convert object to primitive value');
    }
    if(!collection.array)return '[object Object]';
    this.record(collection.versions,'join');
    if(collection.values.has('join'))return '[object Array]';
    if(seen.has(collection))return '';
    seen.add(collection);
    try {
      const values:string[]=[];
      this.record(collection.versions,'length');
      for(let index=0;index<collection.length;index++){
        this.record(collection.versions,String(index));
        const value=collection.values.get(String(index))??TnValue.undefined;
        values.push(value.kind==='null'||value.kind==='undefined'?'':this.coerceString(value,seen));
      }
      return values.join(',');
    }finally{seen.delete(collection);}
  }
  private primitive(value:TnValue):TnValue {return value.collection?TnValue.str(this.coerceString(value,new Set<TnCollection>(),false)):value;}
  present(factory:()=>TnValue[],_revision:number=0):string {
    try{return factory().map((value:TnValue)=>this.coerceString(value)).join('');}
    catch(error){console.error(String(error));return '';}
  }
`;
