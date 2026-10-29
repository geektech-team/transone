import { CompiledUnit, PropertyTypes } from './types';
import type { MpDialect } from './dialect';
import {
  runtimePreamble,
  lifecycleEntries,
  propertyObserverBody,
} from './props-runtime';

const GENERATED_HEADER = (dialectId: string): string =>
  `// 由 transone build --target ${dialectId} 生成，请勿手动编辑`;

/** 生成页面 JS：Page({ data, methods, lifecycle })（CommonJS）。 */
function inlinePreamble(unit: CompiledUnit, unitDialect: MpDialect): string {
  const parts = [...unit.inlineModules];
  parts.push(runtimePreamble(unit, unitDialect!));
  return parts.length ? parts.join('\n\n') + '\n\n' : '';
}

export function generatePageJs(unit: CompiledUnit, dialect: MpDialect): string {
  const parts: string[] = [
    GENERATED_HEADER(dialect.id),
    inlinePreamble(unit, dialect),
    'Page({',
    `  data: ${embedData(unit.data)},`,
  ];
  for (const entry of [...unit.methods, ...lifecycleEntries(unit, dialect)]) {
    parts.push(`  ${JSON.stringify(entry.key)}: ${entry.fn},`);
  }
  parts.push('});');
  return parts.join('\n') + '\n';
}

/** 生成自定义组件 JS：Component({ properties, data, methods, lifetimes })。 */
export function generateComponentJs(
  unit: CompiledUnit,
  dialect: MpDialect
): string {
  const parts: string[] = [
    GENERATED_HEADER(dialect.id),
    inlinePreamble(unit, dialect),
    'Component({',
  ];
  const properties = unit.propsInitialization
    ? { ...unit.properties, __transone_props: 'Object' }
    : unit.properties;
  if (dialect.id === 'mp-alipay')
    parts.push(
      `  props: {${Object.entries(properties)
        .map(
          ([key, type]) =>
            `${JSON.stringify(key)}:${key === '__transone_props' ? 'null' : type === 'Number' ? '0' : type === 'Boolean' ? 'false' : type === 'Array' ? '[]' : type === 'Object' ? 'null' : "''"}`
        )
        .join(',')}},`
    );
  else parts.push(`  properties: ${generatePropertiesSource(properties)},`);
  parts.push(`  data: ${embedData(unit.data)},`);
  parts.push('  methods: {');
  for (const entry of unit.methods) {
    parts.push(`    ${JSON.stringify(entry.key)}: ${entry.fn},`);
  }
  parts.push('  },');
  const lifetimes = lifecycleEntries(unit, dialect);
  if (lifetimes.length > 0) {
    if (dialect.id !== 'mp-alipay') parts.push('  lifetimes: {');
    for (const entry of lifetimes) {
      parts.push(`    ${JSON.stringify(entry.key)}: ${entry.fn},`);
    }
    if (dialect.id !== 'mp-alipay') parts.push('  },');
  }
  const hasPropsHook = unit.methods.some(
    (entry) => entry.key === 'onPropsChange'
  );
  if (hasPropsHook) {
    const watched = Object.keys(unit.properties);
    if (unit.propsInitialization) watched.push('__transone_props');
    if (dialect.id === 'mp-alipay')
      parts.push(
        `  didUpdate: function(previousProps){${propertyObserverBody(unit, dialect)}},`
      );
    else {
      parts.push('  observers: {');
      parts.push(
        `    ${JSON.stringify(watched.join(', '))}: function () { ${propertyObserverBody(unit, dialect)} },`
      );
      parts.push('  },');
    }
  }
  parts.push('});');
  return parts.join('\n') + '\n';
}

/** 把 JSON 对象源码嵌入 Page/Component 的 data 字段（统一缩进）。 */
function embedData(data: string): string {
  const body = data.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  return `{\n  ${body.replace(/\n/g, '\n  ')}\n  }`;
}

/** 生成 properties 对象源码：{ title: { type: String, value: '' } }。 */
export function generatePropertiesSource(properties: PropertyTypes): string {
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return '{}';
  }
  const lines = entries.map(
    ([name, type]) =>
      `    ${JSON.stringify(name)}: { type: ${type === 'null' ? 'null' : type}, value: ${name === '__transone_props' ? 'null' : "''"} },`
  );
  return `{\n${lines.join('\n')}\n  }`;
}
