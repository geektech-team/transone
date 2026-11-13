import { expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { swiftRuntime } from '../src/app/runtime-swift';
import type { NativeRuntimeFragments } from '../src/app/runtime-codegen';

function execute(
  script: string,
  fragments: Partial<NativeRuntimeFragments> = {}
): string[] {
  const root = mkdtempSync(join(tmpdir(), 'transone-complex-swift-'));
  try {
    const file = join(root, 'runtime.swift');
    writeFileSync(
      file,
      swiftRuntime({
        initialState: '',
        instances: '[]',
        watchers: '[]',
        propCases: '',
        propKeysCases: '',
        parentCases: '',
        methodCases: '',
        eventCases: '',
        emitterCases: '',
        hookCases: '',
        ...fragments,
      }) + script
    );
    const result = Bun.spawnSync({
      cmd: ['/usr/bin/swift', '-module-cache-path', join(root, 'cache'), file],
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(root, 'cache') },
      timeout: 50_000,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().trim().split('\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it.skipIf(!existsSync('/usr/bin/swift'))(
  'executes Swift reference identity, sparse members, shallow spread and JavaScript complex coercion',
  () => {
    expect(
      execute(`
let r = TnRuntime()
let child = try r.makeObject([TnEntry(.str("n"), .num(1))])
let object = try r.makeObject([TnEntry(.str("child"), child), TnEntry(.str("__proto__"), .num(7)), TnEntry(.str("2"), .num(2)), TnEntry(.str("1"), .num(1))])
let copy = try r.makeObject([TnEntry(.undefined, object, true)])
print(r.same(object, object)); print(r.same(object, copy)); print(r.same(try r.member(copy, .str("child")), child))
print(r.string(try r.member(copy, .str("__proto__"))))
print(r.string(try r.binary("===", object, copy))); print(r.truth(object))
var changes = 0; r.changed = { changes += 1 }
try r.setMember(child, .str("n"), .num(1)); try r.setMember(child, .str("n"), .num(2))
print(changes); print(r.string(try r.member(try r.member(copy, .str("child")), .str("n"))))
let sparse = try r.makeArray([TnItem(.num(1)), TnItem(.undefined, false, true), TnItem(.nullValue), TnItem(.undefined)])
print(r.string(try r.member(sparse, .str("length")))); print(r.string(sparse)); print(r.string(try r.member(sparse, .num(1))))
let spread = try r.makeArray([TnItem(sparse, true), TnItem(.str("ab"), true)])
print(r.string(spread)); print(r.string(try r.member(spread, .num(4))))
try r.setMember(sparse, .num(1000000000), .num(9)); print(r.string(try r.member(sparse, .str("length"))))
try r.setMember(sparse, .str("length"), .num(2)); print(r.string(sparse)); print(r.string(try r.member(sparse, .num(1000000000))))
print(r.string(try r.unary("String", object))); print(r.string(try r.binary("+", object, .num(1))))
let single = try r.makeArray([TnItem(.num(5))]); print(r.string(try r.unary("Number", single))); print(r.string(try r.binary("==", single, .num(5))))
let cycle = try r.makeArray([]); try r.setMember(cycle, .num(0), cycle); print(r.string(cycle))
print(r.string(try r.member(.nullValue, .str("x"), true)))
do { _ = try r.member(.nullValue, .str("x")); print("missed") } catch { print("TypeError") }
do { _ = try r.makeArray([TnItem(object, true)]); print("missed") } catch { print("TypeError") }
let bad = try r.makeObject([TnEntry(.str("toString"), .num(1))])
do { _ = try r.unary("String", bad); print("missed") } catch { print("TypeError") }
do { _ = try r.binary("+", bad, .str("x")); print("missed") } catch { print("TypeError") }
`)
    ).toEqual([
      'true',
      'false',
      'true',
      '7',
      'false',
      'true',
      '1',
      '2',
      '4',
      '1,,,',
      'undefined',
      '1,,,,a,b',
      'a',
      '1000000001',
      '1,',
      'undefined',
      '[object Object]',
      '[object Object]1',
      '5',
      'true',
      '',
      'undefined',
      'TypeError',
      'TypeError',
      'TypeError',
      'TypeError',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'keeps pooled aliases per runtime, emits originals, and observes only top level reference changes',
  () => {
    expect(
      execute(
        `
let r = TnRuntime(); let other = TnRuntime(); try r.mount()
print(r.same(r.getState("a"), r.getState("b"))); print(r.same(r.getState("a"), other.getState("a")))
_ = try r.invoke("root", "mutate", []); print(r.string(r.getState("count")))
let emitted = try r.invoke("root", "send", [r.getState("a")]); print(r.same(emitted, r.getState("a"))); print(r.same(r.getState("received"), r.getState("a")))
let first = try r.invoke("root", "literal", []); let second = try r.invoke("root", "literal", []); print(r.same(first, second))
_ = try r.invoke("root", "replace", []); print(r.string(r.getState("count")))
`,
        {
          initialValues:
            'self.allocateValue("a", false); self.allocateValue("child", false); try self.fillValue("a", self.makeObject([TnEntry(.str("child"), self.reference("child"))])); try self.fillValue("child", self.makeObject([TnEntry(.str("n"), .num(1))]))',
          initialState:
            'self.initial("a", self.reference("a")); self.initial("b", self.reference("a")); self.initial("count", .num(0))',
          instances: '["root"]',
          watchers: '[TnWatch("root", "value", "watch", false)]',
          propKeysCases: 'case "root": return ["value"]',
          propCases: 'case "root:value": return self.getState("a")',
          methodCases: `case "root:mutate": try self.setMember(self.member(self.getState("a"), .str("child")), .str("n"), .num(2)); return .undefined
case "root:send": return args[0]
case "root:receive": self.assign("received", args[0]); return .undefined
case "root:literal": return try self.makeObject([TnEntry(.str("x"), .num(1))])
case "root:replace": self.assign("a", try self.makeObject([])); return .undefined
case "root:watch": self.assign("count", try self.binary("+", self.getState("count"), .num(1))); return .undefined`,
          eventCases: 'case "root:send": return "change"',
          emitterCases:
            'case "root:change": _ = try self.invoke("root", "receive", args); return',
        }
      )
    ).toEqual(['true', 'false', '0', 'true', 'true', 'false', '1']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'memoizes render literals by dependency identity, explicit enumeration revisions and manual props versions',
  () => {
    for (const enumerate of [false, true]) {
      expect(
        execute(
          `
let r = TnRuntime(); try r.mount()
let initial = r.prop("child", "value"); print(r.same(initial, r.reference("seed")))
_ = try r.invoke("root", "noop", []); print(r.same(initial, r.prop("child", "value")))
_ = try r.invoke("root", "mutate", []); let next = r.prop("child", "value"); print(r.same(initial, next))
try r.setProps("root", ["unused": .num(1)]); _ = try r.invoke("root", "noop", []); print(r.same(next, r.prop("child", "value")))
`,
          {
            initialValues:
              'self.allocateValue("seed", false); self.allocateValue("dep", false); try self.fillValue("seed", self.makeObject([])); try self.fillValue("dep", self.makeObject([TnEntry(.str("n"), .num(1))]))',
            initialState: 'self.initial("dep", self.reference("dep"))',
            instances: '["root", "child"]',
            parentCases: 'case "child": return "root"',
            propKeysCases: 'case "child": return ["value"]',
            propCases:
              'case "child:value": return try self.memo("root", "literal", self.reference("seed"), { try self.makeObject([TnEntry(.str("dep"), self.getState("dep"))]) })',
            renderDependencyCases: enumerate
              ? 'case "root": return [self.revisionValue(self.getState("dep"))]'
              : 'case "root": return [self.getState("dep")]',
            methodCases:
              'case "root:noop": return .undefined\ncase "root:mutate": try self.setMember(self.getState("dep"), .str("n"), .num(2)); return .undefined',
          }
        )
      ).toEqual(['true', 'true', enumerate ? 'false' : 'true', 'false']);
    }
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'short circuits optional keys and reports initialization errors without crashing the native constructor',
  () => {
    expect(
      execute(
        `
let r = TnRuntime()
var reads = 0
print(r.string(try r.optionalMember(.undefined, { reads += 1; return .str("x") })))
let value = try r.makeObject([TnEntry(.str("x"), .num(3))])
print(r.string(try r.optionalMember(value, { reads += 1; return .str("x") }))); print(reads)
let output = r.present({ [try r.member(.nullValue, .str("x"))] }); print("empty:" + output)
let malformed = try r.makeObject([TnEntry(.str("toString"), .num(1))])
print("converted:" + r.present({ [.str("prefix"), malformed] }))
do { try r.mount(); print("missed") } catch { print("mount failed") }
do { _ = try r.invoke("root", "noop", []); print("missed") } catch { print("invoke failed") }
`,
        {
          initialState:
            'self.initial("bad", try self.member(.nullValue, .str("x")))',
        }
      )
    ).toEqual([
      'undefined',
      '3',
      '1',
      'TransOne native text error: TypeError: cannot read null or undefined',
      'empty:',
      'TransOne native text error: TypeError: cannot convert object to primitive',
      'converted:',
      'mount failed',
      'invoke failed',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'keeps UTF16 object keys distinct and spreads integer keys before insertion ordered string keys',
  () => {
    expect(
      execute(String.raw`
let r = TnRuntime()
let object = try r.makeObject([TnEntry(.str("\u{e9}"), .num(1)), TnEntry(.str("e\u{301}"), .num(2))])
print(r.string(try r.member(object, .str("\u{e9}")))); print(r.string(try r.member(object, .str("e\u{301}"))))
let source = try r.makeObject([TnEntry(.str("b"), .num(0)), TnEntry(.str("2"), .num(2)), TnEntry(.str("a"), .num(0)), TnEntry(.str("1"), .num(1))])
let copy = try r.makeObject([TnEntry(.undefined, source, true)])
if case .collection(let box) = copy { print(box.keyOrder.map { $0.text }.joined(separator: ",")) }
`)
    ).toEqual(['1', '2', '1,2,b,a']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'preserves isolated UTF16 units across string members, concatenation, spread and computed keys',
  () => {
    expect(
      execute(String.raw`
let r = TnRuntime()
let emoji = TnValue.str("\u{1F600}")
let spread = try r.makeObject([TnEntry(.undefined, emoji, true)])
let high = try r.member(spread, .num(0)), low = try r.member(spread, .num(1))
print(r.same(high, low)); print(r.string(try r.binary("===", high, low)))
print(r.same(high, .utf16([0xD83D]))); print(r.same(low, .utf16([0xDE00])))
print(r.same(try r.binary("+", high, low), emoji))
print(r.string(try r.member(high, .str("length")))); print(r.string(try r.member(try r.binary("+", high, low), .str("length"))))
print(r.same(try r.unary("String", high), high)); print(r.string(try r.unary("Number", high)))
let object = try r.makeObject([TnEntry(high, .num(1)), TnEntry(low, .num(2))])
let copy = try r.makeObject([TnEntry(.undefined, object, true)])
print(r.string(try r.member(copy, high))); print(r.string(try r.member(copy, low)))
let array = try r.makeArray([TnItem(emoji, true), TnItem(high, true)])
print(r.string(try r.member(array, .str("length")))); print(r.same(try r.member(array, .num(0)), emoji)); print(r.same(try r.member(array, .num(1)), high))
print(r.same(try r.unary("String", try r.makeArray([TnItem(high)])), high))
print(r.string(try r.binary("==", .utf16([0x0061]), .str("a"))))
print(r.truth(.utf16([]))); print(r.truth(.utf16([0xD83D])))
print(r.present({ [high, low] })); print(r.text([high, low]))
`)
    ).toEqual([
      'false',
      'false',
      'true',
      'true',
      'true',
      '1',
      '2',
      'true',
      'NaN',
      '1',
      '2',
      '2',
      'true',
      'true',
      'true',
      'true',
      'false',
      'true',
      '😀',
      '😀',
    ]);
  },
  60_000
);
