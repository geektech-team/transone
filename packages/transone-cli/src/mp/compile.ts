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
import { collectInlineModules } from './inline';
import {
  instanceFields,
  requiresInitialProps,
  type FieldStateAlias,
} from './fields';
import {
  analyzeInstanceFields,
  fieldValueNode,
  DeferredInitialProps,
} from '../components/instance-fields';
import { sourceSymbolAt } from './source';

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
    const fields = instanceFields(context, classSource);
    let rootProps: string | undefined;
    if (kind === 'page' && classSource.rootProps) {
      const evaluator = analyzeInstanceFields([], {
        resolve(node) {
          const declaration = sourceSymbolAt(context, node)?.valueDeclaration;
          return declaration && context.ts.isVariableDeclaration(declaration)
            ? declaration
            : undefined;
        },
        sources: context.index?.sources,
        fail(node, message): never {
          throw mpError(node.getSourceFile().fileName, message);
        },
      });
      const value = evaluator.evaluate(classSource.rootProps);
      if (
        value !== undefined &&
        (!value || typeof value !== 'object' || Array.isArray(value))
      )
        throw mpError(classSource.filePath, 'rootProps 必须为静态对象');
      rootProps =
        value === undefined
          ? '{}'
          : context.ts
              .createPrinter()
              .printNode(
                context.ts.EmitHint.Expression,
                fieldValueNode(value),
                classSource.source
              );
    }
    const aliases: FieldStateAlias[] = [];
    const data = compileState(context, classSource, fields, aliases);
    const styles = compileStyles(context, classSource, fields);
    const { template, builder } = compileTemplate(
      context,
      classSource,
      kind,
      styles.hoverSelectors,
      fields,
      aliases
    );

    const usedNames = new Set(builder.handlers);
    for (const emitter of builder.emitters) {
      usedNames.add(emitter.method);
    }
    const customEvents = new Set<string>();
    const legacyModules = context.index
      ? undefined
      : collectInlineModules(context, classSource);
    const compiledMethods = compileMethods(
      context,
      classSource,
      usedNames,
      kind,
      customEvents,
      fields
    );

    // Alipay callbacks receive arguments directly; other hosts wrap detail.args.
    const methods: FunctionEntry[] = [...compiledMethods.methods];
    const nativeEmitterMethods: string[] = [];
    for (const emitter of builder.emitters) {
      const key = emitter.key ?? `__transone_emitter_${emitter.event}`;
      const fn = emitter.passArgs
        ? context.dialect.id === 'mp-alipay'
          ? `function(...args) { this.${emitter.method}(...args); }`
          : `function(e) { this.${emitter.method}(...e.detail.args); }`
        : `function() { this.${emitter.method}(); }`;
      methods.push({ key, fn });
      nativeEmitterMethods.push(key);
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
      decoratedMethods: compiledMethods.decoratedMethods,
      nativeEmitterMethods,
      lifecycle: compiledMethods.lifecycle,
      customEvents: [...customEvents],
      usingComponents,
      inlineModules: compiledMethods.inlineModules ?? legacyModules ?? [],
      initialization: compiledMethods.initialization,
      initializationKeys: [
        ...new Set(fields.entries.map((entry) => entry.name)),
      ],
      initializationFields: [...builder.initializationFields],
      initializationWritesState: compiledMethods.initializationWritesState,
      guardedCallbacks: compiledMethods.guardedCallbacks,
      propsUpdates: compiledMethods.propsUpdates,
      propsInitialization:
        fields.usesProps || requiresInitialProps(context, classSource),
      rootProps,
    };
    for (const name of fields.propsReferenced) unit.propsReferenced.add(name);
    for (const spec of unit.decoratedMethods ?? []) {
      if (spec.watchProps) unit.propsReferenced.add(spec.watchProps.key);
    }

    if (kind === 'component') {
      context.components.set(name, unit);
    }
    return unit;
  } catch (error) {
    if (error instanceof DeferredInitialProps)
      throw mpError(
        classSource.filePath,
        '依赖 props 的字段不能用于静态样式或静态编译位置，请改用支持的数据绑定'
      );
    throw error;
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
