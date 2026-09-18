import { mpError } from './errors';
import {
  ClassSource,
  CompiledUnit,
  CompileContext,
  FunctionEntry,
  UnitKind,
} from './types';
import { compileTemplate, kebabCase } from './wxml';
import { compileStyles } from './styles';
import { compileState } from './state';
import { compileMethods } from './methods';

export interface UnitOptions {
  kind: UnitKind;
  name: string;
}

/**
 * 编译一个页面或自定义组件单元。组件会被缓存（按 kebab 标签名），
 * 并通过 usedComponents 递归编译依赖的组件。
 */
export function compileUnit(
  context: CompileContext,
  classSource: ClassSource,
  options: UnitOptions
): CompiledUnit {
  const { kind, name } = options;

  if (kind === 'component') {
    const cached = context.components.get(name);
    if (cached) {
      return cached;
    }
    if (context.compiling.has(name)) {
      throw mpError(classSource.filePath, `组件循环引用: ${name}`);
    }
    context.compiling.add(name);
  }

  try {
    // 先编译样式，拿到 hover 选择器集合供模板生成 hover-class
    const styles = compileStyles(context, classSource);
    const { template, builder } = compileTemplate(
      context,
      classSource,
      kind,
      styles.hoverSelectors
    );
    const data = compileState(context, classSource);

    const usedNames = new Set(builder.handlers);
    for (const emitter of builder.emitters) {
      usedNames.add(emitter.method);
    }
    const customEvents = new Set<string>();
    const compiledMethods = compileMethods(
      context,
      classSource,
      usedNames,
      kind,
      customEvents
    );

    // emitters 包装方法：还原 triggerEvent 的 e.detail.args
    const methods: FunctionEntry[] = [...compiledMethods.methods];
    for (const emitter of builder.emitters) {
      const key = `__transone_emitter_${emitter.event}`;
      const fn = emitter.passArgs
        ? `function(e) { this.${emitter.method}(...e.detail.args); }`
        : `function() { this.${emitter.method}(); }`;
      methods.push({ key, fn });
    }

    const usingComponents: Record<string, string> = {};
    for (const [tag, source] of builder.usedComponents) {
      compileUnit(context, source, { kind: 'component', name: tag });
      usingComponents[tag] = `/components/${tag}/${tag}`;
    }

    const unit: CompiledUnit = {
      kind,
      name,
      template,
      style: styles.style,
      globalStyle: styles.global,
      data,
      properties: {},
      propsReferenced: builder.propsReferenced,
      methods,
      lifecycle: compiledMethods.lifecycle,
      customEvents: [...customEvents],
      usingComponents,
    };

    if (kind === 'component') {
      context.components.set(name, unit);
    }
    return unit;
  } finally {
    if (kind === 'component') {
      context.compiling.delete(name);
    }
  }
}

/** 编译全部页面后，聚合调用点属性与模板 props 引用，生成组件 properties。 */
export function finalizeComponentProperties(context: CompileContext): void {
  for (const [tag, unit] of context.components) {
    const properties = new Map<string, string>();
    for (const callSite of context.callSites.get(tag) ?? []) {
      for (const [name, type] of Object.entries(callSite)) {
        if (!properties.has(name) || properties.get(name) === 'null') {
          properties.set(name, type);
        }
      }
    }
    for (const name of unit.propsReferenced) {
      if (!properties.has(name)) {
        properties.set(name, 'null');
      }
    }
    unit.properties = Object.fromEntries(properties);
  }
}

export function componentTag(className: string): string {
  return kebabCase(className);
}
