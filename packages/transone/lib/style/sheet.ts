export type StyleValue = string | number;

export type StyleProperties = Record<string, StyleValue>;

export interface StyleRule {
  selector: string;
  properties: StyleProperties;
}

export interface StyleAtRule {
  atRule: string;
  rules: StyleRule[];
}

export type StyleSheetEntry = StyleRule | StyleAtRule;

export type StyleSheet = StyleSheetEntry[];

export function renderStyleSheet(styles: StyleSheet): string {
  return styles.map((entry) => renderStyleEntry(entry)).join('\n\n');
}

function renderStyleEntry(entry: StyleSheetEntry, indent = ''): string {
  if ('atRule' in entry) {
    const rules = entry.rules
      .map((rule) => renderStyleEntry(rule, `${indent}  `))
      .join('\n\n');

    return `${indent}${entry.atRule} {\n${rules}\n${indent}}`;
  }

  const declarations = Object.entries(entry.properties)
    .map(
      ([property, value]) =>
        `${indent}  ${toCssProperty(property)}: ${String(value)};`
    )
    .join('\n');

  return `${indent}${entry.selector} {\n${declarations}\n${indent}}`;
}

function toCssProperty(property: string): string {
  if (property.startsWith('--') || property.includes('-')) {
    return property;
  }

  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
