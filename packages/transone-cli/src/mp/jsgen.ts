import { CompiledUnit, PropertyTypes } from './types';
import type { MpDialect } from './dialect';

const GENERATED_HEADER = (dialectId: string): string =>
  `// 由 transone build --target ${dialectId} 生成，请勿手动编辑`;

/** 生成页面 JS：Page({ data, methods, lifecycle })（CommonJS）。 */
function inlinePreamble(unit: CompiledUnit): string {
  if (unit.inlineModules.length === 0) {
    return '';
  }
  return unit.inlineModules.join('\n\n') + '\n\n';
}

export function generatePageJs(unit: CompiledUnit, dialect: MpDialect): string {
  const parts: string[] = [
    GENERATED_HEADER(dialect.id),
    inlinePreamble(unit),
    'Page({',
    `  data: ${embedData(unit.data)},`,
  ];
  for (const entry of [...unit.methods, ...unit.lifecycle]) {
    parts.push(`  ${JSON.stringify(entry.key)}: ${entry.fn},`);
  }
  parts.push('});');
  return parts.join('\n') + '\n';
}

/** 生成自定义组件 JS：Component({ properties, data, methods, lifetimes })。 */
export function generateComponentJs(unit: CompiledUnit, dialect: MpDialect): string {
  const parts: string[] = [
    GENERATED_HEADER(dialect.id),
    inlinePreamble(unit),
    'Component({',
  ];
  parts.push(`  properties: ${generatePropertiesSource(unit.properties)},`);
  parts.push(`  data: ${embedData(unit.data)},`);
  parts.push('  methods: {');
  for (const entry of unit.methods) {
    parts.push(`    ${JSON.stringify(entry.key)}: ${entry.fn},`);
  }
  parts.push('  },');
  if (unit.lifecycle.length > 0) {
    parts.push('  lifetimes: {');
    for (const entry of unit.lifecycle) {
      parts.push(`    ${JSON.stringify(entry.key)}: ${entry.fn},`);
    }
    parts.push('  },');
  }
  parts.push('});');
  return parts.join('\n') + '\n';
}

/** 把 JSON 对象源码嵌入 Page/Component 的 data 字段（统一缩进）。 */
function embedData(data: string): string {
  const body = data
    .trim()
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .trim();
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
      `    ${JSON.stringify(name)}: { type: ${type === 'null' ? 'null' : type}, value: '' },`
  );
  return `{\n${lines.join('\n')}\n  }`;
}
