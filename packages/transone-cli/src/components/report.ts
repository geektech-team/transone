import { relative, sep } from 'node:path';
import {
  getPlatformDefinition,
  type ComponentPlatform,
  type Platform,
} from 'transone/platform';
import { resolveConfig } from '../config';
import type { ResolveConfigOptions, ResolvedConfig } from '../types';
import { createComponentIndex } from './index';
import { canonicalPath } from './discovery';
import type { ClassReference, ComponentSelectionReason } from './types';

/** JSON-safe source identity. Paths are relative to the project root. */
export interface ComponentReportLocation {
  source: string;
  className: string;
  /** One-based declaration start, including decorators where present. */
  line: number;
  column: number;
}

export interface ComponentReportCandidate extends ComponentReportLocation {
  platforms: readonly ComponentPlatform[];
}

export interface ComponentSelectionReportRow {
  /**
   * Relative entrypoints sharing this selection index. Web pages have independent
   * indexes, so one logical component can have a separate row for each page.
   */
  entrypoints: readonly string[];
  component: ComponentReportLocation;
  /** Null means an abstract logical component has no matching implementation. */
  implementation: ComponentReportLocation | null;
  reason: Exclude<ComponentSelectionReason, 'explicit'>;
  candidates: readonly ComponentReportCandidate[];
}

/**
 * Static discovered logical-component mappings, including unused components.
 * These rows do not establish runtime constructor usage or application reachability.
 * Explicit implementation references retain their own identities and are not rows.
 * Web mappings are scoped to each page entry; MiniProgram and App mappings retain
 * the configured shared page entrypoints.
 */
export interface ComponentSelectionReport {
  platform: Platform;
  scope: 'discovered-logical-components';
  components: readonly ComponentSelectionReportRow[];
}

/**
 * Resolve normal project configuration and inspect sources with the build matcher.
 * The project config is loaded as usual; component modules are read by TypeScript,
 * never imported or evaluated by this API. No build output is written.
 */
export async function reportComponents(
  options: ResolveConfigOptions = {}
): Promise<ComponentSelectionReport> {
  return reportConfiguredComponents(await resolveConfig(options));
}

/** Inspect an already resolved application config without loading it again. */
export function reportConfiguredComponents(
  config: ResolvedConfig
): ComponentSelectionReport {
  const family = getPlatformDefinition(config.platform).family;
  const pages =
    family === 'miniprogram'
      ? (config.mp?.pages ?? config.pages)
      : family === 'app'
        ? (config.app?.pages ?? config.pages)
        : config.pages;
  const entries = [...new Set(Object.values(pages))];
  // Match the backend's discovery boundary: Web builds one index per page.
  // Combining those roots can introduce candidates (or conflicts) from another page.
  const contexts =
    family === 'web' ? entries.map((entry) => [entry]) : [entries];
  const root = canonicalPath(config.root);
  const sourcePath = (path: string) =>
    relative(root, canonicalPath(path)).split(sep).join('/');
  const location = (reference: ClassReference): ComponentReportLocation => {
    const point = reference.source.getLineAndCharacterOfPosition(
      reference.declaration.getStart(reference.source)
    );
    return {
      source: sourcePath(reference.filePath),
      className: reference.className,
      line: point.line + 1,
      column: point.character + 1,
    };
  };
  const components: ComponentSelectionReportRow[] = [];
  for (const context of contexts) {
    const index = createComponentIndex({
      root: config.root,
      entrypoints: context,
      platform: config.platform,
      include: config.components?.include,
      exclude: config.components?.exclude,
    });
    const entrypoints = context.map(sourcePath).sort();
    for (const reference of index.classes) {
      if (!index.isComponent(reference) || index.metadata(reference).framework)
        continue;
      const decision = index.decision(reference);
      // Implementation classes are explicit-only references, not logical mappings.
      if (decision.reason === 'explicit') continue;
      components.push({
        entrypoints,
        component: location(reference),
        implementation: decision.implementation
          ? location(decision.implementation)
          : null,
        reason: decision.reason,
        candidates: decision.candidates
          .map((candidate) => ({
            ...location(candidate),
            platforms: [...index.metadata(candidate).platforms].sort(),
          }))
          .sort(compareLocations),
      });
    }
  }
  components.sort(
    (left, right) =>
      compareText(left.entrypoints.join('\0'), right.entrypoints.join('\0')) ||
      compareLocations(left.component, right.component)
  );
  return {
    platform: config.platform,
    scope: 'discovered-logical-components',
    components,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareLocations(
  left: ComponentReportLocation,
  right: ComponentReportLocation
): number {
  return (
    compareText(left.source, right.source) ||
    left.line - right.line ||
    left.column - right.column ||
    compareText(left.className, right.className)
  );
}

/** Human-readable rendering of the same structured, static mapping report. */
export function formatComponentSelectionReport(
  report: ComponentSelectionReport
): string {
  const describe = (value: ComponentReportLocation) =>
    `${value.className} (${value.source}:${value.line}:${value.column})`;
  return [
    `TransOne component selection: ${report.platform}`,
    'Scope: discovered logical component mappings; runtime constructor usage is not analyzed.',
    ...(report.components.length
      ? report.components.flatMap((row) => [
          `${describe(row.component)} -> ${row.implementation ? describe(row.implementation) : '(missing)'} [${row.reason}]`,
          `  Entrypoints: ${row.entrypoints.join(', ')}`,
          ...(row.candidates.length
            ? [
                `  Candidates: ${row.candidates.map((candidate) => `${describe(candidate)} [${candidate.platforms.join(', ')}]`).join('; ')}`,
              ]
            : []),
        ])
      : ['(no logical components discovered)']),
  ].join('\n');
}
