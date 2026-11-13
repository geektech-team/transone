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
  const root = mkdtempSync(join(tmpdir(), 'transone-read-tracking-swift-'));
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
  'tracks Swift render reads across consecutive writes, array length and enumeration',
  () => {
    expect(
      execute(
        `
let r = TnRuntime()
r.initial("scalar", .num(0))
let array = try r.makeArray([TnItem(.num(1)), TnItem(.undefined, false, true)])
let object = try r.makeObject([TnEntry(.str("n"), .num(1))])
r.initial("array", array); r.initial("object", object)
func memo(_ owner: String) throws -> TnValue { try r.memo(owner, "value", .undefined, { try r.makeObject([]) }) }
let scalar = try memo("state")
r.assign("scalar", .num(1)); r.assign("scalar", .num(0))
print(r.same(scalar, try memo("state")))
let length = try memo("length")
try r.setMember(array, .num(0), .num(2))
print(r.same(length, try memo("length")))
let index = try memo("index")
try r.setMember(array, .str("length"), .num(0))
print(r.same(index, try memo("index")))
try r.setMember(array, .num(0), .num(1))
let spreadObject = try memo("spreadObject")
try r.setMember(object, .str("unread"), .num(2))
print(r.same(spreadObject, try memo("spreadObject")))
try r.setMember(object, .str("n"), .num(2)); try r.setMember(object, .str("n"), .num(1))
print(r.same(spreadObject, try memo("spreadObject")))
let spreadArray = try memo("spreadArray")
try r.setMember(array, .str("extra"), .num(2))
print(r.same(spreadArray, try memo("spreadArray")))
let hole = try memo("hole")
try r.setMember(array, .num(1), .undefined)
print(r.same(hole, try memo("hole")))
let objectArray = try memo("objectArray")
try r.setMember(array, .num(5), .num(9))
print(r.same(objectArray, try memo("objectArray")))
print(r.same(spreadArray, try memo("spreadArray")))
let numericLength = try memo("length")
try r.setMember(array, .str("01"), .num(5))
print(r.same(numericLength, try memo("length")))
let nan = try memo("nan")
r.assign("nan", .num(.nan)); let nan2 = try memo("nan")
r.assign("nan", .num(.nan)); print(r.same(nan2, try memo("nan")))
r.assign("scalar", .num(0)); let zero = try memo("state")
r.assign("scalar", .num(-0.0)); print(r.same(zero, try memo("state")))
`,
        {
          renderDependencyCases: `
case "state": return [self.getState("scalar")]
case "length": return [try self.member(self.getState("array"), .str("length"))]
case "index": return [try self.member(self.getState("array"), .num(0))]
case "hole": return [try self.member(self.getState("array"), .num(1))]
case "spreadObject": return [self.revisionValue(self.getState("object"))]
case "spreadArray": return [self.revisionValue(self.getState("array"))]
case "objectArray": return [self.revisionValue(self.getState("array"), "object")]
case "nan": return [self.getState("nan")]`,
        }
      )
    ).toEqual([
      'false',
      'false',
      'true',
      'true',
      'false',
      'true',
      'true',
      'true',
      'false',
      'false',
      'false',
      'true',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'samples Swift recursive conversion reads and restores captures after dependency or factory failures',
  () => {
    expect(
      execute(
        `
let r = TnRuntime()
let nested = try r.makeArray([TnItem(.num(1))])
let outer = try r.makeArray([TnItem(nested)])
try r.setMember(outer, .num(1), outer)
r.initial("array", outer); r.initial("nested", nested); r.initial("fail", .bool(false)); r.initial("dependency", .num(0))
func memo(_ owner: String) throws -> TnValue { try r.memo(owner, "value", .undefined, { try r.makeObject([]) }) }
let conversion = try memo("conversion")
try r.setMember(nested, .num(0), .num(2)); try r.setMember(nested, .num(0), .num(1))
print(r.same(conversion, try memo("conversion")))
let joined = try memo("conversion")
try r.setMember(nested, .str("extra"), .num(3))
print(r.same(joined, try memo("conversion")))
let numeric = try memo("numeric")
try r.setMember(nested, .str("valueOf"), .num(1))
print(r.same(joined, try memo("conversion")))
print(r.same(numeric, try memo("numeric")))
try r.setMember(nested, .str("join"), .num(1))
print(r.same(joined, try memo("conversion")))
let stable = try memo("exception")
r.assign("fail", .bool(true))
do { _ = try memo("exception"); print("missed") } catch { print("dependency failed") }
r.assign("fail", .bool(false))
print(r.same(stable, try memo("exception")))
let beforeFactory = try memo("factory")
r.assign("dependency", .num(1))
do { _ = try r.memo("factory", "value", .undefined, { _ = r.getState("unrelated"); throw TnFailure("factory") }); print("missed") } catch { print("factory failed") }
let afterFactory = try memo("factory")
print(r.same(beforeFactory, afterFactory))
r.assign("unrelated", .num(1)); print(r.same(afterFactory, try memo("factory")))
let utf = try r.makeObject([TnEntry(.utf16([0xD800]), .num(1)), TnEntry(.str("é"), .num(2)), TnEntry(.str("e\\u{301}"), .num(3))])
r.initial("utf", utf)
let utfMemo = try memo("utf")
try r.setMember(utf, .str("é"), .num(4)); print(r.same(utfMemo, try memo("utf")))
try r.setMember(utf, .utf16([0xD800]), .num(2)); print(r.same(utfMemo, try memo("utf")))
`,
        {
          renderDependencyCases: `
case "conversion": return [try self.unary("String", self.getState("array"))]
case "numeric": return [try self.unary("Number", self.getState("nested"))]
case "exception":
  if self.truth(self.getState("fail")) { _ = self.getState("unrelated"); throw TnFailure("dependency") }
  return [self.getState("dependency")]
case "factory": return [self.getState("dependency")]
case "utf": return [try self.member(self.getState("utf"), .utf16([0xD800]))]`,
        }
      )
    ).toEqual([
      'false',
      'true',
      'true',
      'false',
      'false',
      'dependency failed',
      'false',
      'factory failed',
      'false',
      'true',
      'true',
      'false',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'commits complex Swift bindings from a replacement mount before the old action returns',
  () => {
    expect(
      execute(
        `
let r = TnRuntime(); try r.mount()
var replace = true
r.changed = { if replace { replace = false; try! r.unmount(); try! r.mount() } }
_ = try r.invoke("root", "update", [])
print(r.string(try r.member(r.getState("model"), .str("n"))))
print(r.string(try r.member(r.prop("child", "value"), .str("n"))))
print(r.same(r.getState("model"), r.prop("child", "value")))
print(r.string(r.getState("trace")))
try r.unmount()
`,
        {
          initialState:
            'self.initial("model", try self.makeObject([TnEntry(.str("n"), .num(1))])); self.initial("trace", .str(""))',
          instances: '["root", "child"]',
          parentCases: 'case "child": return "root"',
          propKeysCases: 'case "child": return ["value"]',
          propCases: 'case "child:value": return self.getState("model")',
          watchers: '[TnWatch("child", "value", "watch", false)]',
          methodCases: `
case "root:mount": self.assign("model", try self.makeObject([TnEntry(.str("n"), try self.binary("+", self.member(self.getState("model"), .str("n")), .num(1)))])); return .undefined
case "root:update": self.assign("model", try self.makeObject([TnEntry(.str("n"), .num(10))])); return .undefined
case "child:watch": self.assign("trace", try self.binary("+", self.getState("trace"), self.binary("+", self.member(args[0], .str("n")), .str(";")))); return .undefined`,
          hookCases:
            'case "root:onMounted": _ = try self.invoke("root", "mount", []); return',
        }
      )
    ).toEqual(['11', '11', 'true', '2;11;']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'keeps direct Swift props committed until a captured parent read triggers a render',
  () => {
    expect(
      execute(
        `
let r = TnRuntime(); try r.mount()
let original = r.prop("child", "value")
_ = try r.invoke("root", "shrink", [])
print(r.same(original, r.prop("child", "value")))
print(r.string(r.getState("watched")))
_ = try r.invoke("root", "noop", [])
print(r.same(original, r.prop("child", "value")))
_ = try r.invoke("root", "force", [])
print(r.prop("child", "value") == .undefined)
print(r.string(r.getState("watched")))
try r.unmount()
`,
        {
          initialState:
            'self.initial("items", try self.makeArray([TnItem(.num(1)), TnItem(try self.makeObject([TnEntry(.str("n"), .num(2))]))])); self.initial("force", .num(0)); self.initial("watched", .num(0))',
          instances: '["root", "child"]',
          parentCases: 'case "child": return "root"',
          propKeysCases: 'case "child": return ["value"]',
          propCases:
            'case "child:value": return try self.member(self.getState("items"), .num(1))',
          renderDependencyCases:
            'case "root": return [try self.member(self.getState("items"), .num(1)), self.getState("force")]',
          watchers: '[TnWatch("child", "value", "watch", false)]',
          methodCases: `
case "root:shrink": try self.setMember(self.getState("items"), .str("length"), .num(0)); return .undefined
case "root:force": self.assign("force", try self.binary("+", self.getState("force"), .num(1))); return .undefined
case "root:noop": return .undefined
case "child:watch": self.assign("watched", try self.binary("+", self.getState("watched"), .num(1))); return .undefined`,
        }
      )
    ).toEqual(['true', '0', 'true', 'true', '1']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'retains the first Swift literal seed and renders fresh literal references on every later mount',
  () => {
    expect(
      execute(
        `
let r = TnRuntime()
let first = r.prop("child", "value")
print(r.same(first, r.reference("seed")))
try r.mount(); print(r.same(first, r.prop("child", "value")))
try r.unmount(); try r.mount()
let second = r.prop("child", "value")
print(r.same(first, second))
try r.unmount(); try r.mount()
print(r.same(second, r.prop("child", "value")))
print(r.string(r.getState("trace")))
try r.unmount()
`,
        {
          initialValues:
            'self.allocateValue("seed", false); try self.fillValue("seed", self.makeObject([]))',
          initialState: 'self.initial("trace", .str(""))',
          instances: '["root", "child"]',
          parentCases: 'case "child": return "root"',
          propKeysCases: 'case "child": return ["value"]',
          propCases:
            'case "child:value": return try self.memo("root", "literal", self.reference("seed"), { try self.makeObject([]) })',
          renderDependencyCases: 'case "root": return []',
          watchers: '[TnWatch("child", "value", "watch", true)]',
          methodCases:
            'case "child:watch": self.assign("trace", try self.binary("+", self.getState("trace"), args[1] == .undefined ? .str("initial;") : .str("changed;"))); return .undefined',
        }
      )
    ).toEqual(['true', 'true', 'false', 'false', 'initial;initial;initial;']);
  },
  60_000
);
