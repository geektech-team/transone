import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? typescriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

function runtimeDeclarations(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const names: string[] = [];

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    }
  }

  return names;
}

describe('小程序模块内联安全性', () => {
  test('源码模块没有重复顶层运行时标识符', () => {
    const root = join(import.meta.dir, '../lib');
    const owners = new Map<string, string[]>();

    for (const file of typescriptFiles(root)) {
      for (const name of runtimeDeclarations(file)) {
        const files = owners.get(name) ?? [];
        files.push(file.slice(root.length + 1));
        owners.set(name, files);
      }
    }

    const duplicates = [...owners]
      .filter(([, files]) => new Set(files).size > 1)
      .map(([name, files]) => `${name}: ${[...new Set(files)].join(', ')}`);

    expect(duplicates).toEqual([]);
  });
});
