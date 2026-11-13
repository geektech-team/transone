import {
  apiTable,
  callout,
  codeBlock,
  heading,
  inlineCode,
  link,
  paragraph,
  strong,
  table,
  ul,
  type DocPage,
} from './types';

/**
 * transone 核心框架模块文档（transone 分区子菜单）。
 *
 * 每个模块页介绍一个功能域：公开 API（以源码为准）、行为与最小示例。
 * 模块与 packages/transone/lib 下的源码模块一一对应。
 */

// ---- 应用与组件模型 ----

export const transoneApplicationPage: DocPage = {
  path: '/transone/application',
  title: '应用与组件模型',
  description: 'createApp / OneApp 应用实例、Plugin 插件、组件基类、生命周期与数据模型表单。',
  section: 'transone',
  order: 3,
  body: [
    heading(1, '应用与组件模型'),
    paragraph(
      '应用（',
      inlineCode('OneApp'),
      '）是组件的根容器，负责挂载、状态、上下文与文档渲染；组件（',
      inlineCode('Component'),
      '）是 UI 的最小单元，采用面向对象模型：',
      inlineCode('initState / initStyles / render'),
      ' 三个受保护抽象方法 + 生命周期钩子，OOP + 策略模式 + SOLID 设计。',
    ),
    heading(2, 'createApp 与 OneApp'),
    paragraph(
      '用',
      inlineCode('createApp(options)'),
      '创建应用实例，',
      inlineCode('mount()'),
      ' 挂载到容器（默认',
      inlineCode('#app'),
      '），',
      inlineCode('renderHtmlDocument()'),
      ' 用于 SSR 输出完整 HTML 文档壳。',
    ),
    apiTable('createApp / OneApp 公开 API', [
      { name: 'createApp', type: '(options: AppOptions) => OneApp', description: '创建应用实例。' },
      { name: 'use', type: '(plugin, ...args) => this', description: '安装插件（插件需提供 install 方法），支持链式调用。' },
      { name: 'mount', type: '(): void', description: '挂载到 rootElement（默认 #app）；重复挂载仅告警。' },
      { name: 'unmount', type: '(): void', description: '卸载应用，递归销毁组件树与样式。' },
      { name: 'isRunning', type: '(): boolean', description: '应用是否处于运行状态。' },
      { name: 'updateRootComponent', type: '(component, props?) => void', description: '热替换根组件（开发时组件级热更新）。' },
      { name: 'update / setState / getState', type: '方法', description: '更新/替换/读取应用全局状态。' },
      { name: 'getContext', type: '(): AppContext<TConfig>', description: '应用上下文（app / version / config）。' },
      { name: 'onUnmounted', type: '(callback) => this', description: '注册应用卸载回调。' },
      { name: 'renderHtmlDocument', type: '(options?) => string', description: 'SSR 渲染 HTML 文档壳（供 dev/build 生成入口页）。' },
    ]),
    apiTable('AppOptions 字段', [
      { name: 'root', type: 'ComponentConstructor', description: '根组件构造函数。' },
      { name: 'rootProps', type: 'TRootProps', description: '传给根组件的 props。' },
      { name: 'rootElement', type: 'string | Element', description: '应用挂载点，默认 #app。' },
      { name: 'state', type: 'TState', description: '应用全局状态（响应式）。' },
      { name: 'config', type: 'TConfig', description: '全局配置，经 getContext() 注入组件。' },
      { name: 'document', type: 'AppDocumentOptions', description: 'HTML 文档壳配置（title / styles / scripts 等）。' },
    ]),
    heading(2, '组件基类 Component<TProps, TState>'),
    paragraph(
      '组件父构造器不调用初始化钩子；首次读取 state（或首次挂载）时同步把',
      inlineCode('initState()'),
      ' 的结果包装为响应式 state。私有',
      inlineCode('StyleManager'),
      ' 在构造时创建，initStyles 在每次挂载的 beforeMount 之前执行。构造完成后，初始化钩子可以读取子类字段；直接 new 后读取 state 无需异步等待。首次',
      inlineCode('mount'),
      ' 时建立渲染 effect——依赖在 render 期间按需收集（细粒度），state 中未被访问的属性变化不会触发重渲染。',
    ),
    paragraph(
      '若在字段初始化器或父类自定义构造器中提前读取 state，仍不能依赖尚未初始化的后续字段。卸载未使用的实例不会执行初始化；重新挂载保留状态并重建样式。小程序和原生 App 支持纯表达式实例字段：取得初始 props 后，按父到子、声明顺序初始化字段，再执行 initState；declare/static 不参与实例初始化。字段和初始 state 可以读取 props，后续 props 更新不会重新初始化，直接 props 绑定继续更新。',
    ),
    paragraph(
      'Web 的 initState 失败会缓存原始异常，后续读取不重复执行；显式赋值 state 仍可替换懒初始化入口。initState 中的 setProps 更新在成功或失败后都会保留，并合并到初始化前最新的 props。initStyles、beforeMount 或 render 中重入挂载会报错，已挂载实例仍保持幂等。挂载期间 unmount 会标记取消，在当前同步阶段结束后清理完整子树并经错误边界报告取消；之后重新挂载保留成功初始化的 state。',
    ),
    paragraph(
      '小程序在真实 props 就绪后初始化：微信/抖音/小红书组件使用 attached，支付宝组件使用 onInit；页面使用 onLoad 和 rootProps。App 支持静态可分析的 props 与父 state 初始标量快照，原生 state 落点仍限于字符串、布尔值和有限数字。副作用调用、自定义构造器、早期 state 读取及不能表示的动态对象或可变快照会明确报错。',
    ),
    paragraph(
      '小程序同步初始化失败时恢复声明字段描述符、JavaScript 侧 data 对象图、框架内部状态及原 setData；恢复成功后可使用当前 props 重试，不重复包装 setData。业务控制标记和外部副作用不回滚，也不能撤回已发送的异步原生 UI 更新；props getter 会被拒绝且不会执行。共享纯求值器不会把失败校验缓存为成功，连续可选链和括号断链遵循 JavaScript 规则。',
    ),
    paragraph(
      '多层继承的直接 super.initState() 透传保留对象引用，展开返回值创建新根对象，方法局部常量按每次调用独立求值。卸载会取消上一轮尚未执行的更新任务，重新挂载保留 state 并正常接收新更新。小程序无字段组件同样等到 attached/onInit 执行 beforeMount；同轮重入和重复卸载不会重复调用钩子，支付宝 beforeMount 失败后不进入 onMounted。',
    ),
    paragraph(
      'guardCallback 是可选的 protected 入口，用来在方法或钩子中保护异步续体。卸载或初始化失败使对应作用域失效，旧回调不能进入新挂载；this、参数及有效返回值按原调用保留，普通返回值和 Promise 解析值均可能为 undefined。state、setProps、setState 的既有签名不变。',
    ),
    codeBlock(
      'ts',
      `protected beforeMount() {
  const commit = this.guardCallback((value: number) => {
    this.setState({ count: value });
  });
  return loadCount().then(commit); // loadCount(): Promise<number>
}`,
    ),
    paragraph(
      '使用 await 时也在等待前创建 commit，再用它提交结果。guard 只保护回调入口和返回结果，无法打断已经开始的 async 函数；await 后继续直接使用原 this 写 state 仍可能污染新挂载。任意业务 Promise 的状态提交需显式保护续体，并结合 onDispose、AbortSignal 等现有取消机制。',
    ),
    paragraph(
      '定时器以及 then、catch、finally 中的状态提交都要在开始等待前绑定 guard。请求取消不能撤回已完成的适配器结果或中断任意响应拦截器 Promise；Web 清理函数直接取消请求，避免给清理本身套已失效的 guard。嵌套 Promise/thenable 在最终投递时核对原作用域，then getter 只读取一次；thenable 自身的业务执行仍需显式管理取消。',
    ),
    paragraph(
      'Web 自动守护 DOM props/listeners、emitters 和模型输入入口，并观察生命周期返回的 Promise；挂载仍同步完成。活动错误进入保存的祖先边界链，旧作用域的迟到拒绝被消费，不进入新边界；onErrorCaptured 仍同步判断 false/true/undefined。异步清理不阻塞卸载，拒绝记录日志，不转入新挂载的边界。',
    ),
    paragraph(
      '小程序守护 setData completion、observer 和生命周期返回结果并跳过失效入口，方法/钩子中的 guardCallback 由编译器桥接；静态组件和页面同样适用，活动异常保留宿主语义。guardCallback 不属于小程序纯实例字段初始化子集，原生 App 的异步能力也不因此扩展。',
    ),
    paragraph(
      '方法装饰器从 transone 导入：@Bind() 绑定实例并保留返回值，事件可直接传 this.onInput；@Delay(ms) 按次延迟执行，@Delay(ms, {replace: true}) 与 @Debounce(ms) 只保留尚未执行的最后一次调用。调度方法自动绑定实例，卸载取消定时器，旧回调不能进入新挂载。',
    ),
    codeBlock(
      'ts',
      `@Bind()
protected onInput(value: unknown): void {
  this.setState({ text: String(value) });
}

@Debounce(1600)
protected hideToast(): void {
  this.setState({ visible: false });
}
// render: emitters: { input: this.onInput }
// 显示 Toast 后调用 this.hideToast()，连续显示会重新计时。`,
    ),
    paragraph(
      '装饰器沿用标准 decorators，不需要 experimentalDecorators。Delay/Debounce 只用于同步 void 动作，不直接装饰 async 或有返回值的方法；小程序还不支持调度方法重载。不用于字段、访问器、静态、#private 或框架钩子。Web、四方小程序支持这些调度方法；App 支持 Bind，调度装饰器会明确编译报错。异步请求仍需显式保护续体与取消。',
    ),
    paragraph(
      '@Emit(eventName) 在同步方法成功后发送事件：返回值不是 undefined 时作为一个 payload，否则转发原参数；保留方法返回值，抛错不发送。@WatchProps(key, {immediate?: boolean}) 用 Object.is 监听单个顶层 prop，接收新值与旧值，不响应 state 更新或对象内部原地修改。两者都自动绑定实例，可与 Bind 组合，不与调度装饰器或彼此组合。',
    ),
    codeBlock(
      'ts',
      `@Emit('change')
public commit(value: number): number {
  this.setState({ draft: value });
  return value;
}

@WatchProps('value', { immediate: true })
protected receive(value: number, previous: number | undefined): void {
  if (value === previous) return;
  this.setState({ draft: value });
}`,
    ),
    paragraph(
      'WatchProps 默认不立即调用；immediate 在每次挂载的 beforeMount 之后、onMounted 之前调用，旧值为 undefined。挂载后的 setProps 同步通知，重入更新排队；卸载终止旧批次，重新挂载重建基线。监听方法必须同步返回 void，Emit 不接受异步或 thenable 返回值，小程序不支持这两种方法的重载。覆盖方法需要重新添加装饰器，super.method() 只复用父类业务体。原有 onPropsChange 钩子保持原行为。',
    ),
    paragraph(
      'Web、四方小程序和 iOS / Android / 鸿蒙原生 App 支持 props 监听。小程序 Emit 仅用于自定义组件，页面可用 setProps 更新 rootProps。App 生成 Swift / Kotlin / ArkTS 同步运行时，支持标量、普通对象、数组及其嵌套 payload / props，保留引用身份、undefined、稀疏项与浅展开；顶层 WatchProps 仍按 Object.is 比较，内部修改不变成深度监听。初始数据图保持别名并隔离不同 App，动态 render props 按依赖更新。函数、getter、自定义实例和异步方法会明确报错并保留旧输出。监听顺序按父类到子类、每层声明顺序。',
    ),
    apiTable('组件公开 API', [
      { name: 'initState / initStyles / render', type: 'protected 抽象', description: '初始化 state、注册样式、返回 VNode。' },
      { name: 'beforeMount / onMounted', type: 'protected 钩子', description: '挂载前 / 挂载后。' },
      { name: 'beforeUpdate / onUpdated', type: 'protected 钩子', description: '更新前 / 更新后。' },
      { name: 'beforeUnmount / onUnmounted', type: 'protected 钩子', description: '卸载前 / 卸载后。' },
      { name: 'mount / mountToNode', type: 'public', description: '挂载到容器；mountToNode 返回挂载后的 Node。' },
      { name: 'update / setProps / setState', type: 'public', description: '手动触发更新、更新 props / state。' },
      { name: 'getElement', type: '(): Node | null', description: '当前组件根节点。' },
      { name: 'on / off', type: '(event, listener) => () => void', description: '注册 / 注销自定义事件监听（on 返回注销函数）。' },
      { name: 'emit', type: 'protected (event, ...args)', description: '触发自定义事件（父组件通过 listeners 接收）。' },
      { name: 'guardCallback', type: 'protected (callback) => guardedCallback', description: '将续体绑定当前资源作用域；保留 this/参数，失效入口和结果返回 undefined。Promise 解析值也可能为 undefined。' },
      { name: 'Bind', type: '标准方法装饰器工厂 () => decorator', description: '从 transone 导入，绑定实例、保留参数/返回值，可直接传递 this.method。' },
      { name: 'Delay', type: '(ms, {replace?: boolean}?) => decorator', description: '延迟同步 void 动作；replace 默认 false，卸载取消。Web/小程序支持，App 明确诊断。' },
      { name: 'Debounce', type: '(ms) => decorator', description: '尾部防抖，保留最后一次参数；按组件资源作用域隔离。Web/小程序支持。' },
      { name: 'Emit', type: '(eventName: string) => decorator', description: '同步方法成功后发送返回值或原参数，保留返回值；Web/小程序组件/App 支持。' },
      { name: 'WatchProps', type: '(key, {immediate?: boolean}?) => decorator', description: '监听顶层 prop，Object.is 比较，按挂载隔离通知；Web/小程序/App 支持。' },
      { name: 'provide / inject', type: '(key, value) / (key, fallback?)', description: '跨层级依赖注入（InjectionKey<T>）。' },
      { name: 'getContext', type: 'protected ()', description: '读取应用注入的 AppContext（config 等）。' },
    ]),
    paragraph(
      '插槽（slot）：子节点作为',
      inlineCode('children'),
      ' 传入，按节点的',
      inlineCode('slot'),
      ' 属性分进具名插槽，默认进入',
      inlineCode('default'),
      ' 插槽；组件内通过',
      inlineCode('this.slots'),
      ' 访问。',
    ),
    heading(2, '数据模型与表单'),
    paragraph(
      '模型绑定（',
      inlineCode('core/model'),
      '）与表单控制器（',
      inlineCode('core/form'),
      '）处理受控输入与校验：',
    ),
    apiTable('model / form API', [
      { name: 'modelPath', type: '(binding) => string', description: '解析绑定路径（如 "user.name"）。' },
      { name: 'getModelValue / setModelValue', type: '(state, path, value?) => unknown', description: '按路径读写模型值。' },
      { name: 'ModelBindingController', type: 'class', description: '绑定控制器：监听路径变化、写回模型并触发更新。' },
      { name: 'createForm', type: '(model, rules) => FormController', description: '创建表单控制器：fields / validate / reset 等。' },
      { name: 'required / minLength / validate', type: 'ValidationRule 工厂', description: '内置校验规则与自定义规则包装。' },
    ]),
    heading(2, '最小示例'),
    codeBlock(
      'ts',
      `import { Component, createApp, type VNode } from 'transone';

class Counter extends Component {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles(): void {
    this.styleManager.addStyle('counter', {
      selector: '.counter', properties: { padding: '16px' },
    });
  }
  protected render(): VNode {
    return {
      tag: 'div',
      props: { className: 'counter' },
      children: [
        \`Count: \${this.state.count}\`,
        {
          tag: 'button',
          listeners: { click: () => this.setState({ count: this.state.count + 1 }) },
          children: ['+1'],
        },
      ],
    };
  }
}

const app = createApp({ root: Counter, rootElement: '#app' });
app.mount();`,
    ),
    ul([
      [link('深入响应式：组件 state 的依赖收集', '/transone/reactivity')],
      [link('渲染层：VNode 与策略分发', '/transone/renderer')],
    ]),
  ],
};

// ---- 响应式系统 ----

export const transoneReactivityPage: DocPage = {
  path: '/transone/reactivity',
  title: '响应式系统',
  description: 'reactive / ref / computed / effect / watch，细粒度依赖收集与微任务批处理调度。',
  section: 'transone',
  order: 4,
  body: [
    heading(1, '响应式系统'),
    paragraph(
      '核心模块',
      inlineCode('core/reactive'),
      '：',
      inlineCode('reactive'),
      ' 把对象包装为响应式代理，effect 在访问属性时按 key 收集依赖（细粒度），依赖变化时由',
      inlineCode('reactiveScheduler'),
      ' 合并到微任务批处理，同一批同步变更只触发一次更新。',
    ),
    apiTable('响应式公开 API', [
      { name: 'reactive', type: '<T extends object>(target) => T', description: '包装对象为响应式代理（深层）。' },
      { name: 'readonly', type: '<T extends object>(target) => Readonly<T>', description: '只读代理，写入告警。' },
      { name: 'effect', type: '(fn, options?) => ReactiveEffect', description: '注册副作用，访问的响应式属性变化时重新执行。' },
      { name: 'computed', type: '<T>(getter) => ComputedRef<T>', description: '惰性计算派生值，缓存 + 依赖追踪。' },
      { name: 'ref', type: '<T>(value) => Ref<T>', description: '基础值包装（.value）。' },
      { name: 'isRef / unref', type: '(value) => boolean / T', description: '判断 / 解包 ref。' },
      { name: 'watch', type: '(source, callback, options?) => () => void', description: '侦听 getter 或 ref，返回停止函数。' },
      { name: 'stop', type: '(effect) => void', description: '停止 effect（含组件渲染 effect 的内部调度）。' },
      { name: 'nextTick', type: '(): Promise<void>', description: '等待当前批次调度 flush 完成。' },
      { name: 'flushSync', type: '(): void', description: '同步立即执行队列中的更新。' },
      { name: 'isReactive / isReadonly', type: '(value) => boolean', description: '类型判断。' },
      { name: 'reactiveScheduler', type: 'ReactiveScheduler', description: '全局调度器单例（enqueue 批处理）。' },
    ]),
    apiTable('WatchOptions 字段', [
      { name: 'immediate', type: 'boolean', description: '建立后立即执行一次回调（oldValue 为 undefined）。' },
      { name: 'deep', type: 'boolean', description: '深度追踪 getter 返回值的嵌套属性变化。' },
      { name: 'sync', type: 'boolean', description: '变化时同步回调（默认随调度器批处理）。' },
    ]),
    heading(2, '依赖收集与批处理'),
    ul([
      [strong('按需收集：'), '依赖在 effect / render 执行期间访问属性时记录，未被访问的属性变化不触发更新。'],
      [strong('调度合并：'), '同一同步批次内的多次变更进入 scheduler 队列，统一在微任务中 flush，避免逐次重渲染。'],
      [strong('渲染隔离：'), '组件渲染在自身 effect 上下文（ReactiveSystem.runWithEffect）中执行，避免子组件把依赖收集到父组件 effect 上。'],
      [strong('内部结构：'), 'ReactiveSystem 单例持有 WeakMap 依赖表（targetMap）、代理缓存与只读缓存；stop 从依赖表移除 effect 并清空其依赖集合。'],
    ]),
    heading(2, '示例'),
    codeBlock(
      'ts',
      `import { reactive, effect, computed, ref, watch } from 'transone';

const state = reactive({ count: 0, name: 'TransOne' });

const doubled = computed(() => state.count * 2);

effect(() => {
  console.log(\`count=\${state.count}, doubled=\${doubled.value}\`);
});

watch(
  () => state.count,
  (value, oldValue) => console.log(\`count \${oldValue} -> \${value}\`),
  { immediate: true }
);

state.count += 1;   // effect 与 watch 各触发一次（同一批次合并）
const n = ref(0);
n.value = 42;        // ref 直接驱动独立 effect`,
    ),
    ul([
      [link('组件中的应用：state 即响应式对象', '/transone/application')],
      [link('调度器在渲染流程中的位置', '/transone/renderer')],
    ]),
  ],
};

// ---- 渲染层与模板 ----

export const transoneRendererPage: DocPage = {
  path: '/transone/renderer',
  title: '渲染层与模板',
  description: 'VNode 模型、元素工厂、策略化渲染分发与文本模板引擎。',
  section: 'transone',
  order: 5,
  body: [
    heading(1, '渲染层与模板'),
    paragraph(
      '渲染层（',
      inlineCode('core/renderer'),
      '）按 VNode 类型把渲染行为分发给对应策略（策略模式）：文本、元素、组件、插槽各有独立策略，渲染行为可扩展、可替换。',
    ),
    heading(2, 'VNode 模型'),
    paragraph(
      'VNode 是渲染的统一描述：',
      inlineCode('HTMLNode'),
      '（tag / props / children / listeners）、',
      inlineCode('ComponentNode'),
      '（component / props / children）、',
      inlineCode('SlotProvider'),
      ' 与',
      inlineCode('SlotInjector'),
      '（插槽提供与注入）。',
    ),
    apiTable('VNode 相关 API', [
      { name: 'h', type: '(tag, props?, children?) => HTMLNode', description: '通用元素工厂。' },
      { name: 'Tag', type: '(tag, options?) => HTMLNode', description: '同 h，面向标签变量场景。' },
      { name: 'Div / Span / P / Section / Main / H1–H6 / Ul / Table …', type: '元素快捷工厂', description: '常见元素即拿即用（Button / Input / Code / Pre 等）。' },
      { name: 'toChildren', type: '(children?) => Array<VNode | string>', description: '归一化子节点为数组。' },
      { name: 'isHTMLNode / isComponentNode / isSlotProvider', type: '类型守卫', description: 'VNode 类型判断。' },
    ]),
    heading(2, '策略化渲染'),
    apiTable('渲染策略', [
      { name: 'RendererContext', type: 'class', description: '渲染入口：解析 props、按 VNode 类型分发到策略。' },
      { name: 'ElementRenderStrategy', type: 'class', description: '元素渲染：创建/更新节点、样式、事件与属性。' },
      { name: 'TextRenderStrategy', type: 'class', description: '文本节点渲染（含插值计算）。' },
      { name: 'ComponentRenderStrategy', type: 'class', description: '组件挂载/更新/卸载，管理子组件生命周期。' },
      { name: 'SlotRenderStrategy', type: 'class', description: '插槽注入与内容分发。' },
    ]),
    paragraph('元素渲染细节（', inlineCode('core/renderer/props.ts'),
      '）：以 ',
      inlineCode('on'),
      ' 前缀的属性解析为事件监听（',
      inlineCode('onClick'),
      '、',
      inlineCode('onInput'),
      ' 等），事件名大小写归一化；',
      inlineCode('SVG_TAGS'),
      ' 与',
      inlineCode('SVG_NAMESPACE'),
      ' 让 SVG 元素走命名空间创建。',
    ),
    heading(2, '文本模板引擎'),
    paragraph(
      inlineCode('core/template'),
      ' 提供声明式文本插值：',
      inlineCode('{{key}}'),
      ' 语法，解析后建立绑定并随响应式 state 更新，无需手动 DOM 操作。',
    ),
    apiTable('TemplateEngine API', [
      { name: 'parseTemplate', type: '(text) => Text', description: '解析含 {{key}} 的文本，建立绑定并返回文本节点。' },
      { name: 'hasExpressions', type: '(text) => boolean', description: '文本是否含插值表达式。' },
      { name: 'extractKeys', type: '(text) => string[]', description: '提取插值引用的 key 列表。' },
      { name: 'evaluateTemplateValue', type: '(text) => string', description: '基于当前 state 计算插值结果。' },
      { name: 'getBindingCount / clearBindings', type: '方法', description: '绑定数量统计 / 清理全部绑定。' },
    ]),
    heading(2, '示例'),
    codeBlock(
      'ts',
      `import { Div, H1, h } from 'transone';

// 元素快捷工厂
Div({ props: { className: 'row' }, children: [H1({ children: ['标题'] })] });

// 通用工厂 + 事件监听
h('button', { props: { className: 'btn' } }, [
  { tag: 'span', children: ['点击'] },
]).listeners = { click: () => console.log('clicked') };

// 模板引擎：声明式插值
const engine = new TemplateEngine(reactive({ name: 'TransOne' }));
const text = engine.parseTemplate('Hello {{name}}');`,
    ),
    ul([
      [link('VNode 在组件 render 中的用法', '/transone/application')],
      [link('SSR：同一渲染层输出 HTML 字符串', '/transone/ssr')],
    ]),
  ],
};

// ---- 路由 ----

export const transoneRouterPage: DocPage = {
  path: '/transone/router',
  title: '路由',
  description: 'createRouter、路由记录、导航守卫、RouterLink / RouterView 与 history / hash 双模式。',
  section: 'transone',
  order: 6,
  body: [
    heading(1, '路由'),
    paragraph(
      '内置路由（',
      inlineCode('router'),
      '）：',
      inlineCode('createRouter'),
      ' 创建路由器，注册到应用后通过',
      inlineCode('RouterView'),
      ' 渲染当前路由组件，',
      inlineCode('RouterLink'),
      ' 声明式导航；支持导航守卫、history / hash 双模式与 base 子路径。',
    ),
    apiTable('路由公开 API', [
      { name: 'createRouter', type: '(options | RouteRecord[]) => Router', description: '创建路由器；传路由数组时自动应用默认配置。' },
      { name: 'push / replace / forward / back / go', type: 'Router 方法', description: '编程式导航。' },
      { name: 'getCurrentRoute / getCurrentRouteRecord', type: '() => RouteLocation | null', description: '当前路由位置 / 记录。' },
      { name: 'beforeEach / afterEach', type: '(guard) => () => void', description: '注册导航前置守卫 / 后置钩子，返回注销函数。' },
      { name: 'onRouteChange', type: '(listener) => () => void', description: '监听路由变化。' },
      { name: 'getRoutes / addRoute', type: '方法', description: '读取路由表 / 动态添加路由。' },
      { name: 'createHref', type: '(path) => string', description: '生成带 base 的跳转地址。' },
      { name: 'install', type: '(app) => void', description: '路由器安装到 OneApp（自动建立导航上下文）。' },
      { name: 'useRouter / getRouter / resetRouter', type: '实例访问', description: '组件/模块内获取当前路由器。' },
    ]),
    apiTable('RouteRecord 与 RouterOptions', [
      { name: 'path', type: 'string', description: '路由路径（如 /guide/:id）。' },
      { name: 'component', type: 'ComponentConstructor', description: '路由组件。' },
      { name: 'redirect', type: 'string', description: '重定向目标。' },
      { name: 'name / meta', type: 'string / RouteMeta', description: '命名路由与元信息。' },
      { name: 'mode', type: "'history' | 'hash'", description: '路由模式，默认 history。' },
      { name: 'base', type: 'string', description: '基础路径（如 /transone），与部署子路径对齐。' },
    ]),
    paragraph(
      '路由位置（RouteLocation）包含',
      inlineCode('path / query / params / fullPath / name / meta'),
      '；导航守卫可拦截跳转，返回',
      inlineCode('false'),
      ' 取消导航。',
    ),
    heading(2, '示例'),
    codeBlock(
      'ts',
      `import { createRouter, RouterView, RouterLink } from 'transone';
import { HomePage, DocsPage } from './pages';

const router = createRouter({
  mode: 'history',
  base: '/transone',
  routes: [
    { path: '/', component: HomePage, name: 'home' },
    { path: '/docs/:slug', component: DocsPage, name: 'docs' },
    { path: '/old', redirect: '/docs' },
  ],
});

router.beforeEach((to, from) => {
  if (!to.meta.public && !isLoggedIn()) return false;
});

// 组件内：
RouterLink({ props: { to: '/docs/getting-started' }, children: ['快速开始'] });
RouterView(); // 渲染当前路由组件`,
    ),
    ul([
      [link('文档站自身的 base 推导', '/transone/ssr')],
      [link('部署子路径：GitHub Pages', '/cli/build')],
    ]),
  ],
};

// ---- 样式系统 ----

export const transoneStylePage: DocPage = {
  path: '/transone/style',
  title: '样式系统',
  description: 'StyleManager 组件样式、StyleSheet 数据化样式表与 rpx 多端单位换算。',
  section: 'transone',
  order: 7,
  body: [
    heading(1, '样式系统'),
    paragraph(
      '样式以数据（StyleSheet / StyleOptions）描述而非字符串拼接：组件在',
      inlineCode('initStyles'),
      ' 里向私有',
      inlineCode('StyleManager'),
      ' 注册样式，卸载时自动清理；SSR 时样式表整体渲染进文档壳内联',
      inlineCode('<style>'),
      '。',
    ),
    apiTable('StyleManager API', [
      { name: 'addStyle', type: '(name, options: StyleOptions) => void', description: '注册命名样式（重名覆盖）。' },
      { name: 'removeStyle', type: '(name) => void', description: '移除命名样式。' },
      { name: 'clearStyles', type: '() => void', description: '清空组件全部样式。' },
      { name: 'destroy', type: '() => void', description: '销毁 style 元素与样式表（组件卸载时调用）。' },
    ]),
    apiTable('StyleOptions 字段', [
      { name: 'selector', type: 'string', description: 'CSS 选择器（如 .btn-primary）。' },
      { name: 'properties', type: 'Record<string, string | number>', description: '样式属性（驼峰 key）。' },
      { name: 'hover', type: 'Record<string, string | number>', description: ':hover 伪类样式。' },
      { name: 'media', type: 'Record<条件, Record<属性, 值>>', description: '媒体查询分组样式。' },
    ]),
    heading(2, 'StyleSheet 与 SSR 内联'),
    paragraph(
      '全局样式用 StyleSheet 描述（文档站自身即如此）：',
      inlineCode('StyleRule'),
      '（selector + properties）或',
      inlineCode('StyleAtRule'),
      '（@media / @supports 分组），经',
      inlineCode('renderStyleSheet(styles)'),
      ' 输出 CSS 文本，交给',
      inlineCode('renderHtmlDocument'),
      ' 内联进产物 HTML——客户端无需重新注入样式。',
    ),
    heading(2, '多端单位换算'),
    paragraph(
      inlineCode('style/units'),
      ' 提供小程序单位换算：',
      inlineCode('convertRpx(value)'),
      ' 把数值按',
      inlineCode('1px = 2rpx'),
      ' 换算，',
      inlineCode('ROOT_RPX_RULE'),
      ' 为根字号基准规则，Web 与小程序产物样式口径一致。',
    ),
    heading(2, '示例'),
    codeBlock(
      'ts',
      `import { Component, renderStyleSheet, type StyleSheet } from 'transone';

class Card extends Component {
  protected initState() { return {}; }
  protected initStyles(): void {
    this.styleManager.addStyle('card', {
      selector: '.card',
      properties: { borderRadius: '12px', padding: '16px' },
      hover: { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
      media: { '(max-width: 600px)': { padding: '8px' } },
    });
  }
  protected render() {
    return { tag: 'div', props: { className: 'card' }, children: ['卡片'] };
  }
}

// 全局样式表（SSR 内联）：
export const styles: StyleSheet = [
  { selector: 'body', properties: { margin: 0 } },
  { atRule: '@media (max-width: 900px)', rules: [{ selector: '.card', properties: { padding: '8px' } }] },
];
const css = renderStyleSheet(styles); // -> 内联进 <style>`,
    ),
  ],
};

// ---- 服务端渲染与 DOM ----

export const transoneSsrPage: DocPage = {
  path: '/transone/ssr',
  title: '服务端渲染与 DOM',
  description: 'renderHtmlDocument 文档壳、SSR 同构形态与零依赖 DOM 模拟（createDomWindow）。',
  section: 'transone',
  order: 8,
  body: [
    heading(1, '服务端渲染与 DOM'),
    paragraph(
      'SSR 分两层：',
      inlineCode('renderHtmlDocument'),
      ' 输出完整 HTML 文档壳（SSR 内容渲染），',
      inlineCode('dom'),
      ' 模块提供零依赖 DOM 模拟（createDomWindow / installDomGlobals），让同一套组件代码在 Node/Bun 环境完成首次渲染。',
    ),
    apiTable('renderHtmlDocument 选项（HtmlDocumentOptions）', [
      { name: 'title', type: 'string', description: '文档标题（必填）。' },
      { name: 'body', type: 'Renderable | Renderable[]', description: '文档主体：VNode / 文本 / 数组。' },
      { name: 'lang', type: 'string', description: 'html lang 属性，默认 zh-CN。' },
      { name: 'charset / viewport', type: 'string', description: 'meta 编码与视口。' },
      { name: 'description', type: 'string', description: 'meta description。' },
      { name: 'htmlAttributes / bodyAttributes', type: 'Record<string, string | number | boolean | null | undefined>', description: 'html / body 标签额外属性（如 data-doc-base）。' },
      { name: 'head', type: 'HtmlHeadElement[]', description: 'head 内自定义元素（link / meta 等）。' },
      { name: 'styles', type: 'StyleSheet', description: '样式表，内联为 <style>。' },
      { name: 'scripts', type: 'HtmlScript[]', description: '脚本（type="module" 客户端 bundle）。' },
    ]),
    heading(2, 'SSR 同构形态'),
    paragraph(
      '与编译器约定：构建入口导出带',
      inlineCode('renderHtmlDocument'),
      ' 的',
      inlineCode('app'),
      ' 对象。构建时 CLI 为每个页面注入真实部署 URL（含',
      inlineCode('--base'),
      '），SSR 在模块作用域读取',
      inlineCode('window.location.pathname'),
      ' 推导 base 与当前路由——同一份代码在 SSR 与客户端行为一致（本文档站即此形态）。',
    ),
    apiTable('OneApp 侧', [
      { name: 'app.renderHtmlDocument', type: '(options) => string', description: '以应用根组件渲染完整文档壳。' },
      { name: 'OneApp.renderHtmlDocument', type: '(options?) => string', description: '实例方法，选项与文档壳配置合并。' },
    ]),
    heading(2, 'DOM 模拟（dom）'),
    paragraph(
      inlineCode('dom'),
      ' 模块实现浏览器 DOM 的最小可用子集，零外部依赖：',
    ),
    table(
      ['能力', '内容'],
      [
        ['窗口与全局', 'DomWindow / createDomWindow() / installDomGlobals() / DOM_GLOBAL_KEYS'],
        ['节点树', 'Node / Element / HTMLElement / Text / Comment / DocumentFragment / NodeList'],
        ['表单元素', 'HTMLInputElement / HTMLSelectElement / HTMLOptionElement / HTMLTextAreaElement / HTMLButtonElement'],
        ['事件', 'EventTarget / Event / CustomEvent / MouseEvent / KeyboardEvent / 事件监听'],
        ['样式', 'CSSStyleDeclaration / HTMLStyleElement / createStyleDeclaration()'],
        ['浏览器对象', 'Location / History / Storage / Navigator / ResizeObserver / createMatchMedia()'],
        ['解析', 'parseHtmlFragment()（HTML 片段解析）'],
      ]
    ),
    callout(
      'info',
      [
        '客户端渲染由同一渲染层在真实 DOM 上完成：SSR 产出 HTML 骨架与内联样式，',
        inlineCode('main.js'),
        ' 挂载后接管交互，首屏无需等待脚本。',
      ],
      '同构'
    ),
    heading(2, '示例'),
    codeBlock(
      'ts',
      `import { createApp, renderHtmlDocument } from 'transone';
import { installDomGlobals } from 'transone/dom';

installDomGlobals(); // SSR 环境注入 window / document / navigator …

const app = createApp({ root: DocsPage, document: { title: 'TransOne 文档' } });

const html = app.renderHtmlDocument({
  lang: 'zh-CN',
  htmlAttributes: { 'data-doc-base': '/transone' },
  scripts: [{ src: './main.js' }],
});`,
    ),
    ul([
      [link('构建期如何调用 SSR（--base 注入）', '/cli/build')],
      [link('渲染层：VNode 与策略', '/transone/renderer')],
    ]),
  ],
};
