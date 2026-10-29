import type ts from 'typescript';
import type { ComponentPlatform, Platform } from 'transone/platform';

export interface ClassReference {
  id: string;
  filePath: string;
  source: ts.SourceFile;
  declaration: ts.ClassLikeDeclaration;
  className: string;
  exportName?: string;
}
export interface OwnedMember {
  owner: ClassReference;
  declaration: ts.ClassElement;
}
export interface ComponentMetadata {
  /** Declared by the framework package rather than a business component module. */
  framework: boolean;
  parent?: ClassReference;
  family: ClassReference;
  platforms: readonly ComponentPlatform[];
  abstract: boolean;
}
export type ComponentSelectionReason =
  'exact' | 'family' | 'base' | 'missing' | 'explicit';
/** The shared matcher's static decision; missing abstract bases are inspectable. */
export interface ComponentSelectionDecision {
  component: ClassReference;
  implementation?: ClassReference;
  reason: ComponentSelectionReason;
  candidates: readonly ClassReference[];
}
export interface ComponentIndex {
  readonly platform: Platform;
  readonly classes: readonly ClassReference[];
  readonly sources: readonly ts.SourceFile[];
  resolve(
    expression: ts.Expression,
    source: ts.SourceFile
  ): ClassReference | undefined;
  findClass(filePath: string, className: string): ClassReference | undefined;
  isComponent(reference: ClassReference): boolean;
  select(reference: ClassReference): ClassReference;
  /** Does not reject a missing abstract implementation; conflicts still throw. */
  decision(reference: ClassReference): ComponentSelectionDecision;
  hierarchy(reference: ClassReference): readonly ClassReference[];
  members(reference: ClassReference): readonly OwnedMember[];
  bindings(): readonly {
    base: ClassReference;
    implementation: ClassReference;
  }[];
  metadata(reference: ClassReference): ComponentMetadata;
  symbolAt(node: ts.Node, source?: ts.SourceFile): ts.Symbol | undefined;
}
export interface ComponentIndexOptions {
  root: string;
  entrypoints: readonly string[];
  platform: Platform;
  include?: readonly string[];
  exclude?: readonly string[];
}
