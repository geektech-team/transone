import { expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { swiftRuntime } from '../src/app/runtime-swift';

function executeSwift(runtime: string, script: string): string[] {
  const root = mkdtempSync(join(tmpdir(), 'transone-native-swift-'));
  try {
    const file = join(root, 'runtime.swift');
    writeFileSync(file, runtime + script);
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
  'executes native Swift events, props binding recovery and mount-scoped actions without UI frameworks',
  () => {
    const runtime = swiftRuntime({
      initialState:
        'self.initial("value", TnValue.num(1)); self.initial("watched", TnValue.num(0)); self.initial("event", TnValue.num(0))',
      instances: '["parent", "child"]',
      parentCases: 'case "child": return "parent"',
      watchers: '[TnWatch("child", "value", "watch", true)]',
      propCases: 'case "child:value": return self.getState("value")',
      propKeysCases: 'case "child": return ["value"]',
      methodCases: `
          case "parent:update": self.assign("value", args.first ?? TnValue.undefined); return TnValue.undefined
          case "parent:receive": self.assign("event", args.first ?? TnValue.undefined); return TnValue.undefined
          case "parent:recycle": try self.unmount(); try self.mount(); return TnValue.undefined
          case "child:commit": return args.first ?? TnValue.undefined
          case "child:recycle": return TnValue.num(42)
          case "child:watch":
            let value = args.first ?? TnValue.undefined
            self.assign("watched", value)
            if case .num(let number) = value, number == 9 { throw TnFailure("watch failed") }
            return TnValue.undefined`,
      eventCases:
        'case "child:commit": return "change"\ncase "child:recycle": return "recycle"',
      emitterCases:
        'case "child:change": _ = try self.invoke("parent", "receive", args); return\ncase "child:recycle": _ = try self.invoke("parent", "recycle", args); return',
      hookCases: '',
    });
    const lines = executeSwift(
      runtime,
      `
let runtime = TnRuntime()
try runtime.mount()
print(runtime.string(runtime.getState("watched")))
_ = try runtime.invoke("parent", "update", [TnValue.num(2)])
print(runtime.string(runtime.getState("watched")))
try runtime.setProps("child", ["value": TnValue.num(3)])
print(runtime.string(runtime.getState("watched")))
_ = try runtime.invoke("parent", "update", [TnValue.num(4)])
print(runtime.string(runtime.getState("watched")))
print(runtime.string(try runtime.invoke("child", "commit", [TnValue.num(5)])))
print(runtime.string(runtime.getState("event")))
let oldAction = runtime.action { _ = try runtime.invoke("child", "commit", [TnValue.num(6)]) }
try runtime.unmount()
_ = try runtime.invoke("parent", "update", [TnValue.num(99)])
print(runtime.string(runtime.getState("value")))
try runtime.mount(); oldAction()
print(runtime.string(runtime.getState("event")))
runtime.action { _ = try runtime.invoke("child", "commit", [TnValue.num(7)]) }()
print(runtime.string(runtime.getState("event")))
do { try runtime.setProps("child", ["value": TnValue.num(9)]) } catch { print("watch failed") }
try runtime.setProps("child", ["value": TnValue.num(10)])
print(runtime.string(runtime.getState("watched")))
print(runtime.string(try runtime.invoke("child", "recycle", [])))
try runtime.unmount()
`
    );
    expect(lines).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '5',
      '4',
      '5',
      '7',
      'watch failed',
      '10',
      'undefined',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'executes Swift cleanup permissions, queued error recovery and JavaScript scalar operators',
  () => {
    const runtime = swiftRuntime({
      initialState:
        'self.initial("value", .num(1)); self.initial("emitted", .num(0)); self.initial("watched", .num(0)); self.initial("cleaned", .num(0))',
      instances: '["root"]',
      parentCases: '',
      watchers: '[TnWatch("root", "value", "watch", true)]',
      propCases: 'case "root:value": return self.getState("value")',
      propKeysCases: 'case "root": return ["value"]',
      methodCases: `
        case "root:emit": self.assign("emitted", try self.binary("+", self.getState("emitted"), .num(1))); return .undefined
        case "root:watch":
          self.assign("watched", try self.binary("+", self.getState("watched"), .num(1)))
          if args.first == .num(9) { throw TnFailure("watch failed") }
          return .undefined
        case "root:update": self.assign("value", args.first ?? .undefined); return .undefined
        case "root:fail": self.assign("value", .num(9)); throw TnFailure("body failed")
        case "root:late": self.assign("value", .num(2)); throw TnFailure("stale failure")
        case "root:ordinary": self.assign("cleaned", try self.binary("+", self.getState("cleaned"), .num(1))); return .undefined
        case "root:cleanup":
          _ = try self.invoke("root", "ordinary", [])
          _ = try self.invoke("root", "emit", [])
          _ = try self.invoke("root", "watch", [])
          return .undefined`,
      eventCases: 'case "root:emit": return "change"',
      emitterCases: '',
      hookCases:
        'case "root:beforeUnmount": _ = try self.invoke("root", "cleanup", []); return\ncase "root:onUnmounted": _ = try self.invoke("root", "ordinary", []); return',
    });
    const lines = executeSwift(
      runtime,
      `
let runtime = TnRuntime()
let firstAction = runtime.action { _ = try runtime.invoke("root", "emit", []) }
firstAction()
print(runtime.string(runtime.getState("emitted")))
try runtime.mount(); firstAction()
print(runtime.string(runtime.getState("emitted")))
try runtime.unmount()
print(runtime.string(runtime.getState("cleaned")))
print(runtime.string(runtime.getState("emitted")))
print(runtime.string(runtime.getState("watched")))
firstAction(); print(runtime.string(runtime.getState("emitted")))
try runtime.mount()
do { _ = try runtime.invoke("root", "fail", []) }
catch let failure as TnFailure {
  print(failure.errors.count)
  print(failure.errors.map { String(describing: $0) }.joined(separator: ","))
}
_ = try runtime.invoke("root", "update", [.num(10)])
print(runtime.string(runtime.getState("watched")))
try runtime.setProps("root", ["value": .num(.nan)])
try runtime.setProps("root", ["value": .num(.nan)])
try runtime.setProps("root", ["value": .num(0)])
try runtime.setProps("root", ["value": .num(-0.0)])
print(runtime.string(runtime.getState("watched")))
var reads = 0
_ = runtime.logical("??", { .num(0) }, { reads += 1; return .num(1) })
_ = runtime.logical("&&", { .num(0) }, { reads += 1; return .num(1) })
print(reads)
print(runtime.string(runtime.logical("||", { .num(0) }, { reads += 1; return .num(3) })))
print(reads)
print(runtime.string(try runtime.binary("+", .str("a"), .num(1))))
print(runtime.string(try runtime.unary("Number", .str("0x10"))))
print(runtime.same(.num(.nan), .num(.nan)))
print(runtime.same(.num(0), .num(-0.0)))
print(runtime.string(try runtime.binary("===", .num(.nan), .num(.nan))))
print(runtime.string(try runtime.binary("===", .str("é"), .str("é"))))
print(runtime.text([.num(1e20), .str(" "), .num(1e-7), .str(" "), .num(-0.0)]))
var restart = true
runtime.changed = {
  if restart {
    restart = false
    do { try runtime.unmount(); try runtime.mount() } catch { print("unexpected restart error") }
  }
}
print(runtime.string(try runtime.invoke("root", "late", [])))
try runtime.unmount()
`
    );
    expect(lines).toEqual([
      '1',
      '2',
      '2',
      '2',
      '1',
      '2',
      '2',
      'body failed,watch failed',
      '4',
      '7',
      '0',
      '3',
      '1',
      'a1',
      '16',
      'true',
      'false',
      'false',
      'false',
      '100000000000000000000 1e-7 0',
      'undefined',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'mounts and cleans Swift component trees in source order while preserving all cleanup errors',
  () => {
    const nodes = [
      ['root', 'r'],
      ['left', 'l'],
      ['grandchild', 'g'],
      ['right', 's'],
    ] as const;
    const hookCases = nodes
      .flatMap(([instance, tag]) =>
        [
          ['beforeMount', 'B'],
          ['onMounted', 'M'],
          ['beforeUnmount', 'U'],
          ['onUnmounted', 'D'],
        ].map(([phase, suffix]) => {
          const body = `self.assign("trace", try self.binary("+", self.getState("trace"), .str("${tag}${suffix},")))`;
          const end =
            phase === 'beforeUnmount' &&
            (instance === 'grandchild' || instance === 'right')
              ? `throw TnFailure("${instance} cleanup")`
              : 'return';
          return `case "${instance}:${phase}": ${body}; ${end}`;
        })
      )
      .join('\n');
    const runtime = swiftRuntime({
      initialState: 'self.initial("trace", .str(""))',
      instances: '["root", "left", "grandchild", "right"]',
      parentCases:
        'case "left": return "root"\ncase "grandchild": return "left"\ncase "right": return "root"',
      watchers:
        '[TnWatch("root", "value", "watch", true), TnWatch("left", "value", "watch", true), TnWatch("grandchild", "value", "watch", true), TnWatch("right", "value", "watch", true)]',
      propKeysCases: nodes
        .map(([instance]) => `case "${instance}": return ["value"]`)
        .join('\n'),
      propCases: nodes
        .map(([instance]) => `case "${instance}:value": return .num(1)`)
        .join('\n'),
      methodCases: nodes
        .map(
          ([instance, tag]) =>
            `case "${instance}:watch": self.assign("trace", try self.binary("+", self.getState("trace"), .str("${tag}W,"))); return .undefined`
        )
        .join('\n'),
      eventCases: '',
      emitterCases: '',
      hookCases,
    });
    const lines = executeSwift(
      runtime,
      `
let runtime = TnRuntime()
try runtime.mount()
print(runtime.string(runtime.getState("trace")))
runtime.assign("trace", .str(""))
do { try runtime.unmount() } catch let failure as TnFailure {
  print(failure.errors.count)
  print(failure.errors.map { String(describing: $0) }.joined(separator: ","))
}
print(runtime.string(runtime.getState("trace")))
runtime.assign("trace", .str(""))
try runtime.mount()
print(runtime.string(runtime.getState("trace")))
`
    );
    expect(lines).toEqual([
      'rB,lB,gB,gW,gM,lW,lM,sB,sW,sM,rW,rM,',
      '2',
      'grandchild cleanup,right cleanup',
      'rU,lU,gU,gD,lD,sU,sD,rD,',
      'rB,lB,gB,gW,gM,lW,lM,sB,sW,sM,rW,rM,',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'uses ECMAScript whitespace and number grammar instead of Swift numeric extensions',
  () => {
    const runtime = swiftRuntime({
      initialState: '',
      instances: '[]',
      parentCases: '',
      watchers: '[]',
      propCases: '',
      propKeysCases: '',
      methodCases: '',
      eventCases: '',
      emitterCases: '',
      hookCases: '',
    });
    const lines = executeSwift(
      runtime,
      String.raw`
let runtime = TnRuntime()
for input in ["-0x10", "+0x10", "\u{FEFF}1", "\u{0085}1", "1\u{0085}", "\u{200B}1", "0x\u{FF26}", "0xF", "0b10", "0o10", "1.5e+2", ".5", "1.", "1f", "0x1p2", "\u{180E}1", " \t\r\n1\u{00A0}", "Infinity", "+Infinity", "-Infinity", "0x10\n", ""] {
  print(runtime.string(try runtime.unary("Number", .str(input))))
}
`
    );
    expect(lines).toEqual([
      'NaN',
      'NaN',
      '1',
      'NaN',
      'NaN',
      'NaN',
      'NaN',
      '15',
      '2',
      '8',
      '150',
      '0.5',
      '1',
      'NaN',
      'NaN',
      'NaN',
      '1',
      'Infinity',
      'Infinity',
      '-Infinity',
      '16',
      '0',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'publishes manual Swift props synchronously before committing the enclosing parent state update',
  () => {
    const runtime = swiftRuntime({
      initialState:
        'self.initial("value", .num(1)); self.initial("trace", .str(""))',
      instances: '["parent", "child"]',
      parentCases: 'case "child": return "parent"',
      watchers: '[TnWatch("child", "value", "watch", false)]',
      propKeysCases: 'case "child": return ["value"]',
      propCases: 'case "child:value": return self.getState("value")',
      methodCases: `
        case "parent:staged":
          self.assign("value", .num(2))
          _ = try self.invoke("child", "update", [.num(9)])
          if self.getState("trace") != .str("9:1;") { throw TnFailure("manual props were not synchronous") }
          if self.prop("child", "value") != .num(9) { throw TnFailure("parent binding committed before the outer action ended") }
          return .undefined
        case "child:update": try self.setProps("child", ["value": args.first ?? .undefined]); return .undefined
        case "child:watch":
          self.assign("trace", .str(self.string(self.getState("trace")) + self.string(args.first ?? .undefined) + ":" + self.string(args.count > 1 ? args[1] : .undefined) + ";"))
          return .undefined`,
      eventCases: '',
      emitterCases: '',
      hookCases: '',
    });
    const lines = executeSwift(
      runtime,
      `
let runtime = TnRuntime()
try runtime.mount()
_ = try runtime.invoke("parent", "staged", [])
print(runtime.string(runtime.getState("trace")))
print(runtime.string(runtime.prop("child", "value")))
try runtime.unmount()
`
    );
    expect(lines).toEqual(['9:1;2:9;', '2']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'keeps unrelated parent bindings committed until the enclosing action ends while manual target props notify synchronously',
  () => {
    const runtime = swiftRuntime({
      initialState:
        'self.initial("value", .num(1)); self.initial("trace", .str(""))',
      instances: '["root", "child", "grandchild"]',
      parentCases:
        'case "child": return "root"\ncase "grandchild": return "child"',
      watchers:
        '[TnWatch("child", "value", "first", false), TnWatch("child", "value", "second", false)]',
      propKeysCases:
        'case "child": return ["value"]\ncase "grandchild": return ["value"]',
      propCases:
        'case "child:value": return self.getState("value")\ncase "grandchild:value": return self.prop("child", "value")',
      methodCases: `
        case "root:update":
          self.assign("value", .num(2))
          try self.setProps("root", ["unrelated": .num(1)])
          if self.prop("child", "value") != .num(1) { throw TnFailure("child binding committed early") }
          if self.prop("grandchild", "value") != .num(1) { throw TnFailure("forwarded binding committed early") }
          self.assign("trace", try self.binary("+", self.getState("trace"), .str("after;")))
          return .undefined
        case "root:receive": self.assign("value", args.first ?? .undefined); return .undefined
        case "child:first":
          self.assign("trace", .str(self.string(self.getState("trace")) + "a" + self.string(args.first ?? .undefined) + ";"))
          if args.first == .num(3) { try self.emit("child", "change", [.num(4)]) }
          return .undefined
        case "child:second":
          self.assign("trace", .str(self.string(self.getState("trace")) + "b" + self.string(args.first ?? .undefined) + ":" + self.string(self.prop("child", "value")) + ";"))
          return .undefined`,
      eventCases: '',
      emitterCases:
        'case "child:change": _ = try self.invoke("root", "receive", args); return',
      hookCases: '',
    });
    const lines = executeSwift(
      runtime,
      `
let runtime = TnRuntime()
print(runtime.string(runtime.prop("grandchild", "value")))
try runtime.mount()
do { _ = try runtime.invoke("root", "update", []) } catch { print("unexpected update failure: " + String(describing: error)) }
print(runtime.string(runtime.getState("trace")))
print(runtime.string(runtime.prop("child", "value")))
print(runtime.string(runtime.prop("grandchild", "value")))
runtime.assign("trace", .str(""))
try runtime.setProps("child", ["value": .num(3)])
print(runtime.string(runtime.getState("trace")))
print(runtime.string(runtime.prop("child", "value")))
print(runtime.string(runtime.prop("grandchild", "value")))
try runtime.unmount()
`
    );
    expect(lines).toEqual([
      '1',
      'after;a2;b2:2;',
      '2',
      '2',
      'a3;b3:3;a4;b4:4;',
      '4',
      '4',
    ]);
  },
  60_000
);
