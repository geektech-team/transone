import type {
  NativeExpression,
  NativeInstruction,
  NativeScreen,
} from './types';
import { arkRuntime } from './runtime-ark';
import { kotlinRuntime } from './runtime-kotlin';
import { swiftRuntime } from './runtime-swift';

export type NativeLanguage = 'swift' | 'kotlin' | 'ark';
/** Code fragments are statements inside the runtime template's named methods.
 * All three templates expose the same TnValue and TnRuntime operations. */
export interface NativeRuntimeFragments {
  initialValues?: string;
  renderDependencyCases?: string;
  renderTrackedOwners?: string;
  initialState: string;
  instances: string;
  watchers: string;
  propCases: string;
  propKeysCases: string;
  parentCases: string;
  methodCases: string;
  eventCases: string;
  emitterCases: string;
  hookCases: string;
}

export function nativeString(value: string, language: NativeLanguage): string {
  const json = JSON.stringify(value);
  return language === 'kotlin'
    ? json.replace(/\$/g, '\\$')
    : language === 'swift'
      ? json.replace(/\\(?:["\\/bfnrt]|u[a-fA-F0-9]{4})/g, (token) =>
          token === '\\b'
            ? '\\u{8}'
            : token === '\\f'
              ? '\\u{c}'
              : token.startsWith('\\u')
                ? `\\u{${token.slice(2)}}`
                : token
        )
      : json;
}
function receiver(language: NativeLanguage): string {
  return language === 'swift' ? 'self.' : 'this.';
}
function call(
  name: string,
  args: string[],
  language: NativeLanguage,
  throwing = false
): string {
  return `${throwing && language === 'swift' ? 'try ' : ''}${receiver(language)}${name}(${args.join(', ')})`;
}
function array(values: string[], language: NativeLanguage): string {
  return language === 'kotlin'
    ? `listOf(${values.join(', ')})`
    : `[${values.join(', ')}]`;
}
function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
      else return true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}
export function nativeExpression(
  value: NativeExpression,
  language: NativeLanguage,
  owner = receiver(language)
): string {
  const q = (text: string) => nativeString(text, language);
  const expr = (node: NativeExpression) =>
    nativeExpression(node, language, owner);
  const invoke = (name: string, args: string[], throwing = false) =>
    `${throwing && language === 'swift' ? 'try ' : ''}${owner}${name}(${args.join(', ')})`;
  switch (value.kind) {
    case 'undefined':
      return 'TnValue.undefined';
    case 'literal':
      return value.value === null
        ? 'TnValue.nullValue'
        : typeof value.value === 'number'
          ? `TnValue.num(${Object.is(value.value, -0) ? '-0.0' : /[.eE]/.test(String(value.value)) ? value.value : `${value.value}.0`})`
          : typeof value.value === 'boolean'
            ? `TnValue.bool(${value.value})`
            : language === 'swift' && hasUnpairedSurrogate(value.value)
              ? `TnValue.utf16([${value.value
                  .split('')
                  .map((character) => character.charCodeAt(0))
                  .join(', ')}])`
              : `TnValue.str(${q(value.value)})`;
    case 'state':
      return invoke('getState', [q(value.key)]);
    case 'prop':
      return invoke('prop', [q(value.instance), q(value.key)]);
    case 'local':
      return language === 'swift'
        ? `(locals[${q(value.name)}] ?? TnValue.undefined)`
        : language === 'kotlin'
          ? `(locals[${q(value.name)}] ?: TnValue.undefined)`
          : `(locals.get(${q(value.name)}) ?? TnValue.undefined)`;
    case 'value-ref':
      return invoke('reference', [q(value.id)]);
    case 'revision':
      return invoke('revisionValue', [
        expr(value.value),
        q(value.mode ?? 'auto'),
      ]);
    case 'object': {
      const entry = (key: string, data: string, spread: boolean) =>
        `${language === 'ark' ? 'new ' : ''}TnEntry(${key}, ${data}, ${spread})`;
      const entries = value.entries.map((item) => {
        const data = expr(item.value);
        if (item.spread) {
          const snapshot = invoke(
            'makeObject',
            [array([entry('TnValue.undefined', data, true)], language)],
            true
          );
          return entry('TnValue.undefined', snapshot, true);
        }
        const key = invoke(
          'unary',
          [q('String'), item.key ? expr(item.key) : 'TnValue.undefined'],
          true
        );
        return entry(key, data, false);
      });
      return invoke('makeObject', [array(entries, language)], true);
    }
    case 'array': {
      const item = (data: string, spread: boolean, hole: boolean) =>
        `${language === 'ark' ? 'new ' : ''}TnItem(${data}, ${spread}, ${hole})`;
      return invoke(
        'makeArray',
        [
          array(
            value.items.map((entry) => {
              const data = entry.value
                ? expr(entry.value)
                : 'TnValue.undefined';
              const snapshot = entry.spread
                ? invoke(
                    'makeArray',
                    [array([item(data, true, false)], language)],
                    true
                  )
                : data;
              return item(snapshot, entry.spread === true, entry.hole === true);
            }),
            language
          ),
        ],
        true
      );
    }
    case 'member': {
      if (value.optional) {
        const key =
          language === 'ark'
            ? `() => ${expr(value.key)}`
            : `{ ${expr(value.key)} }`;
        return invoke('optionalMember', [expr(value.target), key], true);
      }
      return invoke(
        'member',
        [expr(value.target), expr(value.key), 'false'],
        true
      );
    }
    case 'memo': {
      const factory =
        language === 'ark'
          ? `() => ${expr(value.value)}`
          : `{ ${expr(value.value)} }`;
      return invoke(
        'memo',
        [
          q(value.owner),
          q(value.key),
          value.initial ? expr(value.initial) : 'TnValue.undefined',
          factory,
        ],
        true
      );
    }
    case 'call':
      return invoke(
        'invoke',
        [
          q(value.instance),
          q(value.method),
          array(value.args.map(expr), language),
        ],
        true
      );
    case 'binary': {
      if (['&&', '||', '??'].includes(value.operator)) {
        const closure = (body: string) =>
          language === 'ark' ? `() => ${body}` : `{ ${body} }`;
        return invoke(
          'logical',
          [
            q(value.operator),
            closure(expr(value.left)),
            closure(expr(value.right)),
          ],
          true
        );
      }
      return invoke(
        'binary',
        [q(value.operator), expr(value.left), expr(value.right)],
        true
      );
    }
    case 'unary':
      return invoke('unary', [q(value.operator), expr(value.value)], true);
    case 'conditional':
      return language === 'kotlin'
        ? `(if (${invoke('truth', [expr(value.condition)])}) ${expr(value.whenTrue)} else ${expr(value.whenFalse)})`
        : `(${invoke('truth', [expr(value.condition)])} ? ${expr(value.whenTrue)} : ${expr(value.whenFalse)})`;
  }
}
function statements(
  body: NativeInstruction[],
  language: NativeLanguage
): string {
  const q = (text: string) => nativeString(text, language);
  const expr = (node: NativeExpression) => nativeExpression(node, language);
  const end = language === 'swift' ? '' : ';';
  return body
    .map((node) => {
      switch (node.kind) {
        case 'assign':
          return (
            call('assign', [q(node.key), expr(node.value)], language) + end
          );
        case 'set-member':
          return (
            call(
              'setMember',
              [
                expr(node.target),
                call('unary', [q('String'), expr(node.key)], language, true),
                expr(node.value),
              ],
              language,
              true
            ) + end
          );
        case 'set-props': {
          const entries = Object.entries(node.values).map(([key, value]) => [
            q(key),
            expr(value),
          ]);
          const values =
            language === 'swift'
              ? entries.length
                ? `[${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}]`
                : '[:]'
              : language === 'kotlin'
                ? `mapOf(${entries.map(([k, v]) => `${k} to ${v}`).join(', ')})`
                : `new Map<string, TnValue>([${entries.map(([k, v]) => `[${k}, ${v}]`).join(', ')}])`;
          return (
            call('setProps', [q(node.instance), values], language, true) + end
          );
        }
        case 'local':
          return language === 'ark'
            ? `locals.set(${q(node.name)}, ${expr(node.value)});`
            : `locals[${q(node.name)}] = ${expr(node.value)}${end}`;
        case 'expression':
          return `${language === 'swift' ? '_ = ' : ''}${expr(node.value)}${end}`;
        case 'return':
          return `return ${node.value ? expr(node.value) : 'TnValue.undefined'}${end}`;
        case 'throw':
          return language === 'swift'
            ? `throw TnFailure(${call('string', [call('unary', [q('String'), expr(node.message)], language, true)], language)})`
            : `throw ${language === 'kotlin' ? 'IllegalStateException' : 'new Error'}(${call('string', [call('unary', [q('String'), expr(node.message)], language, true)], language)})${end}`;
        case 'if':
          return `if ${language === 'swift' ? '' : '('}${call('truth', [expr(node.condition)], language)}${language === 'swift' ? '' : ')'} {\n${statements(node.then, language)}\n} else {\n${statements(node.otherwise, language)}\n}`;
        case 'emit':
          return (
            call(
              'emit',
              [
                q(node.instance),
                q(node.event),
                array(node.args.map(expr), language),
              ],
              language,
              true
            ) + end
          );
      }
    })
    .join('\n');
}
export function nativeRuntimeSource(
  screen: NativeScreen,
  language: NativeLanguage
): string {
  if (!screen.program) return '';
  const q = (text: string) => nativeString(text, language);
  const clause = (key: string, body: string) =>
    language === 'kotlin'
      ? `${q(key)} -> { ${body} }`
      : `case ${q(key)}: ${body}`;
  const all = screen.program.instances;
  const fragments: NativeRuntimeFragments = {
    initialValues: [
      ...(screen.program.values ?? []).map(
        (entry) =>
          call(
            'allocateValue',
            [q(entry.id), String(entry.value.kind === 'array')],
            language
          ) + (language === 'swift' ? '' : ';')
      ),
      ...(screen.program.values ?? []).map(
        (entry) =>
          call(
            'fillValue',
            [q(entry.id), nativeExpression(entry.value, language)],
            language,
            true
          ) + (language === 'swift' ? '' : ';')
      ),
    ].join('\n'),
    renderTrackedOwners: array(
      all
        .filter((instance) => instance.renderDependencies !== undefined)
        .map((instance) => q(instance.id)),
      language
    ),
    renderDependencyCases: all
      .map((instance) =>
        clause(
          instance.id,
          `return ${array(
            (instance.renderDependencies ?? []).map((value) =>
              nativeExpression(value, language)
            ),
            language
          )}${language === 'swift' ? '' : ';'}`
        )
      )
      .join('\n'),
    initialState:
      screen.state
        .map(
          (entry) =>
            call(
              'initial',
              [
                q(entry.key),
                nativeExpression(
                  { kind: 'literal', value: entry.value },
                  language
                ),
              ],
              language
            ) + (language === 'swift' ? '' : ';')
        )
        .join('\n') +
      '\n' +
      Object.entries(screen.program.initialState ?? {})
        .map(
          ([key, value]) =>
            call(
              'initial',
              [q(key), nativeExpression(value, language)],
              language
            ) + (language === 'swift' ? '' : ';')
        )
        .join('\n'),
    instances: array(
      all.map((instance) => q(instance.id)),
      language
    ),
    watchers: array(
      all.flatMap((instance) =>
        instance.watchers.map(
          (watch) =>
            `${language === 'ark' ? 'new ' : ''}TnWatch(${q(instance.id)}, ${q(watch.key)}, ${q(watch.method)}, ${watch.immediate})`
        )
      ),
      language
    ),
    propCases: all
      .flatMap((instance) =>
        Object.entries(instance.props).map(([key, value]) =>
          clause(
            `${instance.id}:${key}`,
            `return ${nativeExpression(value, language)}${language === 'swift' ? '' : ';'}`
          )
        )
      )
      .join('\n'),
    propKeysCases: all
      .map((instance) =>
        clause(
          instance.id,
          `return ${array(Object.keys(instance.props).map(q), language)}${language === 'swift' ? '' : ';'}`
        )
      )
      .join('\n'),
    parentCases: all
      .filter((instance) => instance.parent !== undefined)
      .map((instance) =>
        clause(
          instance.id,
          `return ${q(instance.parent!)}${language === 'swift' ? '' : ';'}`
        )
      )
      .join('\n'),
    methodCases: all
      .flatMap((instance) =>
        Object.entries(instance.methods).map(([name, method]) => {
          const locals =
            language === 'swift'
              ? 'var locals: [String: TnValue] = [:]'
              : language === 'kotlin'
                ? 'val locals = mutableMapOf<String, TnValue>()'
                : 'const locals = new Map<string, TnValue>();';
          const parameters = method.params
            .map((name, index) =>
              language === 'ark'
                ? `locals.set(${q(name)}, args.length > ${index} ? args[${index}] : TnValue.undefined);`
                : `locals[${q(name)}] = ${language === 'swift' ? `args.count > ${index} ? args[${index}] : TnValue.undefined` : `args.getOrElse(${index}) { TnValue.undefined }`}`
            )
            .join('\n');
          return clause(
            `${instance.id}:${name}`,
            `${language === 'ark' ? '{' : language === 'swift' ? 'do {' : ''}${locals}\n${parameters}\n${statements(method.body, language)}\nreturn TnValue.undefined${language === 'swift' ? '' : ';'}${language === 'ark' || language === 'swift' ? '}' : ''}`
          );
        })
      )
      .join('\n'),
    eventCases: all
      .flatMap((instance) =>
        Object.entries(instance.methods).flatMap(([name, method]) =>
          method.emit
            ? [
                clause(
                  `${instance.id}:${name}`,
                  `return ${q(method.emit)}${language === 'swift' ? '' : ';'}`
                ),
              ]
            : []
        )
      )
      .join('\n'),
    emitterCases: all
      .flatMap((instance) =>
        Object.entries(instance.emitters).map(([event, target]) =>
          clause(
            `${instance.id}:${event}`,
            `${language === 'swift' ? '_ = ' : ''}${call('invoke', [q(target.instance), q(target.method), 'args'], language, true)}${language === 'swift' ? '' : ';'}\nreturn${language === 'swift' ? '\n' : ';'}`
          )
        )
      )
      .join('\n'),
    hookCases: all
      .flatMap((instance) =>
        (
          ['beforeMount', 'onMounted', 'beforeUnmount', 'onUnmounted'] as const
        ).flatMap((hook) =>
          instance[hook]
            ? [
                clause(
                  `${instance.id}:${hook}`,
                  `${language === 'swift' ? '_ = ' : ''}${call('invoke', [q(instance.id), q(instance[hook]!), array([], language)], language, true)}${language === 'swift' ? '' : ';'}\nreturn${language === 'swift' ? '\n' : ';'}`
                ),
              ]
            : []
        )
      )
      .join('\n'),
  };
  return language === 'swift'
    ? swiftRuntime(fragments)
    : language === 'kotlin'
      ? kotlinRuntime(fragments)
      : arkRuntime(fragments);
}
