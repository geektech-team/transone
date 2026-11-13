import type { NativeRuntimeFragments } from './runtime-codegen';

/** Foundation-only reference-value runtime shared by generated SwiftUI event handlers. */
export function swiftRuntime(f: NativeRuntimeFragments): string {
  return `import Foundation

enum TnValue: Equatable {
  case num(Double), str(String), utf16([UInt16]), bool(Bool), undefined, nullValue, collection(TnCollection)
  static func == (_ left: TnValue, _ right: TnValue) -> Bool {
    switch (left, right) {
    case (.num(let a), .num(let b)): return a == b
    case (.str(let a), .str(let b)): return a.utf16.elementsEqual(b.utf16)
    case (.utf16(let a), .utf16(let b)): return a == b
    case (.str(let a), .utf16(let b)): return Array(a.utf16) == b
    case (.utf16(let a), .str(let b)): return a == Array(b.utf16)
    case (.bool(let a), .bool(let b)): return a == b
    case (.collection(let a), .collection(let b)): return a === b
    case (.undefined, .undefined), (.nullValue, .nullValue): return true
    default: return false
    }
  }
}
// Swift String equality normalizes Unicode; JavaScript property keys compare
// literal UTF-16 code units, just like TnValue.str strict equality above.
struct TnPropertyKey: Hashable {
  let units: [UInt16]
  var text: String { String(decoding: units, as: UTF16.self) }
  init(_ text: String) { self.units = Array(text.utf16) }
  init(_ units: [UInt16]) { self.units = units }
  static func == (_ left: TnPropertyKey, _ right: TnPropertyKey) -> Bool { left.units == right.units }
  func hash(into hasher: inout Hasher) { hasher.combine(units) }
}
struct TnOwnProperties {
  private var storage: [TnPropertyKey: TnValue] = [:]
  subscript(_ key: TnPropertyKey) -> TnValue? {
    get { storage[key] }
    set { storage[key] = newValue }
  }
  subscript(_ key: String) -> TnValue? {
    get { self[TnPropertyKey(key)] }
    set { self[TnPropertyKey(key)] = newValue }
  }
  var keys: [TnPropertyKey] { Array(storage.keys) }
  mutating func removeValue(forKey key: TnPropertyKey) { storage.removeValue(forKey: key) }
}
final class TnVersions {
  var values: [TnPropertyKey: Int] = [:]
  func bump(_ key: TnPropertyKey) { values[key, default: 0] += 1 }
}
private struct TnRead {
  let versions: TnVersions; let key: TnPropertyKey; let version: Int
  var current: Bool { (versions.values[key] ?? 0) == version }
}
final class TnCollection {
  let isArray: Bool
  var values = TnOwnProperties()
  var keyOrder: [TnPropertyKey] = []
  var length = 0
  var revision = 0
  let versions = TnVersions()
  init(_ isArray: Bool) { self.isArray = isArray }
}
struct TnEntry {
  let key: TnValue; let value: TnValue; let spread: Bool
  init(_ key: TnValue, _ value: TnValue, _ spread: Bool = false) { self.key = key; self.value = value; self.spread = spread }
}
struct TnItem {
  let value: TnValue; let spread: Bool; let hole: Bool
  init(_ value: TnValue, _ spread: Bool = false, _ hole: Bool = false) { self.value = value; self.spread = spread; self.hole = hole }
}
private struct TnMemo {
  let value: TnValue; let reads: [TnRead]; let propsVersion: Int
}
private struct TnRenderSample {
  let reads: [TnRead]; let propsVersion: Int
}
struct TnFailure: Error, CustomStringConvertible {
  let description: String
  let errors: [Error]
  init(_ message: String) { description = message; errors = [] }
  init(_ failures: [Error]) { errors = failures; description = failures.map { String(describing: $0) }.joined(separator: "; ") }
}
struct TnWatch {
  let instance: String; let key: String; let method: String; let immediate: Bool
  init(_ instance: String, _ key: String, _ method: String, _ immediate: Bool) {
    self.instance = instance; self.key = key; self.method = method; self.immediate = immediate
  }
}
private struct TnNotification {
  let instance: String; let method: String; let next: TnValue; let previous: TnValue; let generation: Int
}
private final class TnNotificationBatch {
  let sequence: Int
  var notifications: [TnNotification]
  init(_ sequence: Int, _ notification: TnNotification) {
    self.sequence = sequence
    notifications = [notification]
  }
}
final class TnRuntime {
  private var pool: [String: TnValue] = [:]
  private var memos: [String: [String: TnMemo]] = [:]
  private var renderSamples: [String: TnRenderSample] = [:]
  private var propsVersions: [String: Int] = [:]
  private var initializationFailure: Error?
  private var state: [String: TnValue] = [:]
  private let stateVersions = TnVersions()
  private var capturing: [TnRead]?
  private var overrides: [String: [String: TnValue]] = [:]
  private var nativeProps: [String: [String: TnValue]] = [:]
  private var baseline: [String: TnValue] = [:]
  private var mounted = Set<String>()
  private var started = Set<String>()
  private var queue: [String: TnNotificationBatch] = [:]
  private var pendingOwners: [(instance: String, sequence: Int)] = []
  private var nextBatch = 0
  private var busy = false
  private var busyOwners = Set<String>()
  private var syncing = false
  private var active = true
  private var mounting = false
  private var hasMounted = false
  private var unmounting = false
  private var cleanupDepth = 0
  private var depth = 0
  private var generation = 0
  private let instances: [String] = ${f.instances}
  private let watchers: [TnWatch] = ${f.watchers}
  private let renderTrackedOwners: [String]? = ${f.renderTrackedOwners ?? 'nil'}
  var changed: () -> Void = {}
  init() {
    do {
      ${f.initialValues ?? ''}
      ${f.initialState}
      try syncBindings()
    } catch { initializationFailure = error }
  }
  func allocateValue(_ id: String, _ isArray: Bool) { pool[id] = .collection(TnCollection(isArray)) }
  func reference(_ id: String) -> TnValue { pool[id] ?? .undefined }
  func fillValue(_ id: String, _ value: TnValue) throws {
    guard case .collection(let target) = reference(id), case .collection(let source) = value, target.isArray == source.isArray else { throw TnFailure("TypeError: invalid initial value") }
    target.values = source.values; target.keyOrder = source.keyOrder; target.length = source.length
  }
  private func index(_ key: TnPropertyKey) -> Int? {
    guard let value = Int(key.text), value >= 0 && value < 4294967295 && Array(String(value).utf16) == key.units else { return nil }
    return value
  }
  private func keys(_ box: TnCollection) -> [TnPropertyKey] {
    let numbers = box.values.keys.compactMap { index($0) }.sorted().map { TnPropertyKey(String($0)) }
    return numbers + box.keyOrder.filter { index($0) == nil && box.values[$0] != nil }
  }
  private func put(_ box: TnCollection, _ key: String, _ value: TnValue) throws -> Bool { try put(box, TnPropertyKey(key), value) }
  private func put(_ box: TnCollection, _ key: TnPropertyKey, _ value: TnValue) throws -> Bool {
    if box.isArray && key == TnPropertyKey("length") {
      let number = try self.number(value)
      guard number.isFinite && number >= 0 && number <= 4294967295 && number.rounded(.towardZero) == number else { throw TnFailure("RangeError: invalid array length") }
      let length = Int(number)
      let different = TnValue.num(Double(box.length)) != value
      for key in Array(box.values.keys) { if let position = index(key), position >= length { box.values.removeValue(forKey: key) } }
      box.keyOrder.removeAll { box.values[$0] == nil }
      box.length = length
      if different { box.versions.bump(key) }
      return different
    }
    let previous = box.values[key]
    let different = (previous ?? .undefined) != value
    if previous == nil { box.keyOrder.append(key) }
    box.values[key] = value
    if box.isArray, let position = index(key), position >= box.length { box.length = position + 1 }
    if different {
      box.versions.bump(key)
      if box.isArray {
        if !(try number(.utf16(key.units))).isNaN { box.versions.bump(TnPropertyKey("length")) }
      }
    }
    return different
  }
  private func track(_ versions: TnVersions, _ key: TnPropertyKey) {
    capturing?.append(TnRead(versions: versions, key: key, version: versions.values[key] ?? 0))
  }
  func member(_ target: TnValue, _ key: TnValue, _ optional: Bool = false) throws -> TnValue {
    if target == .nullValue || target == .undefined {
      if optional { return .undefined }
      throw TnFailure("TypeError: cannot read null or undefined")
    }
    let name = TnPropertyKey(try stringUnits(key))
    if case .collection(let box) = target {
      track(box.versions, name)
      if box.isArray && name == TnPropertyKey("length") { return .num(Double(box.length)) }
      return box.values[name] ?? .undefined
    }
    if let units = textUnits(target) {
      if name == TnPropertyKey("length") { return .num(Double(units.count)) }
      if let position = index(name), position < units.count { return .utf16([units[position]]) }
    }
    return .undefined
  }
  func optionalMember(_ target: TnValue, _ key: () throws -> TnValue) throws -> TnValue {
    if target == .nullValue || target == .undefined { return .undefined }
    return try member(target, key())
  }
  func setMember(_ target: TnValue, _ key: TnValue, _ value: TnValue) throws {
    guard case .collection(let box) = target else { throw TnFailure("TypeError: cannot assign member of primitive") }
    if try put(box, TnPropertyKey(stringUnits(key)), value) { box.revision += 1; changed() }
  }
  func makeObject(_ entries: [TnEntry]) throws -> TnValue {
    let box = TnCollection(false)
    for entry in entries {
      if entry.spread {
        if case .collection(let source) = entry.value {
          for key in keys(source) { _ = try put(box, key, source.values[key] ?? .undefined) }
        } else if let units = textUnits(entry.value) {
          for (position, unit) in units.enumerated() { _ = try put(box, String(position), .utf16([unit])) }
        }
      } else { _ = try put(box, TnPropertyKey(stringUnits(entry.key)), entry.value) }
    }
    return .collection(box)
  }
  func makeArray(_ items: [TnItem]) throws -> TnValue {
    let box = TnCollection(true)
    for item in items {
      if item.hole { box.length += 1; continue }
      if item.spread {
        if case .collection(let source) = item.value, source.isArray {
          for position in 0..<source.length { _ = try put(box, String(box.length), source.values[String(position)] ?? .undefined) }
        } else if let units = textUnits(item.value) {
          var position = 0
          while position < units.count {
            let paired = (0xD800...0xDBFF).contains(units[position]) && position + 1 < units.count && (0xDC00...0xDFFF).contains(units[position + 1])
            let end = position + (paired ? 2 : 1)
            _ = try put(box, String(box.length), .utf16(Array(units[position..<end])))
            position = end
          }
        } else { throw TnFailure("TypeError: value is not iterable") }
      } else { _ = try put(box, String(box.length), item.value) }
    }
    return .collection(box)
  }
  private func renderDependencies(_ owner: String) throws -> [TnValue] {
    switch owner { ${f.renderDependencyCases ?? ''} default: return [] }
  }
  private func renderTracked(_ owner: String) -> Bool {
    if let owners = renderTrackedOwners { return owners.contains(owner) }
    return ${f.renderDependencyCases !== undefined}
  }
  private func sampleRenderReads(_ owner: String) throws -> [TnRead] {
    let previous = capturing
    capturing = []
    defer { capturing = previous }
    _ = try renderDependencies(owner)
    return capturing ?? []
  }
  func revisionValue(_ value: TnValue, _ mode: String = "auto") -> TnValue {
    if case .collection(let box) = value {
      if capturing != nil {
        if mode == "array" || (mode == "auto" && box.isArray) {
          track(box.versions, TnPropertyKey("length"))
          for position in 0..<box.length { track(box.versions, TnPropertyKey(String(position))) }
        } else {
          for key in keys(box) { track(box.versions, key) }
        }
      }
      return .num(Double(box.revision))
    }
    return .num(0)
  }
  func memo(_ owner: String, _ key: String, _ initial: TnValue, _ factory: () throws -> TnValue) throws -> TnValue {
    let version = propsVersions[owner] ?? 0
    let old = memos[owner]?[key]
    if let old = old, old.propsVersion == version && old.reads.allSatisfy({ $0.current }) { return old.value }
    let reads = try sampleRenderReads(owner)
    let value = old == nil && initial != .undefined ? initial : try factory()
    memos[owner, default: [:]][key] = TnMemo(value: value, reads: reads, propsVersion: version)
    return value
  }
  func initial(_ key: String, _ value: TnValue) { state[key] = value }
  func getState(_ key: String) -> TnValue { track(stateVersions, TnPropertyKey(key)); return state[key] ?? .undefined }
  func assign(_ key: String, _ value: TnValue) {
    let previous = state[key] ?? .undefined
    state[key] = value
    if previous != value { stateVersions.bump(TnPropertyKey(key)); changed() }
  }
  private func propKeys(_ instance: String) -> [String] {
    switch instance { ${f.propKeysCases} default: return [] }
  }
  private func parent(_ instance: String) -> String? {
    switch instance { ${f.parentCases} default: return nil }
  }
  private func boundProp(_ instance: String, _ key: String) throws -> TnValue {
    switch instance + ":" + key { ${f.propCases} default: return .undefined }
  }
  private func syncBindings() throws {
    if syncing { return }
    syncing = true
    defer { syncing = false }
    var decisions: [String: Bool] = [:]
    var samples: [String: TnRenderSample] = [:]
    for instance in instances {
      let owner = parent(instance) ?? instance
      if decisions[owner] == nil {
        let version = propsVersions[owner] ?? 0
        if !renderTracked(owner) { decisions[owner] = true }
        else if let old = renderSamples[owner], old.propsVersion == version && old.reads.allSatisfy({ $0.current }) { decisions[owner] = false }
        else {
          samples[owner] = TnRenderSample(reads: try sampleRenderReads(owner), propsVersion: version)
          decisions[owner] = true
        }
      }
      if nativeProps[instance] != nil && decisions[owner] == false { continue }
      var values: [String: TnValue] = [:]
      var different = false
      let previous = nativeProps[instance]
      for key in propKeys(instance) {
        let value = try boundProp(instance, key)
        values[key] = value
        if let previous = previous, !same(value, previous[key] ?? .undefined) { different = true }
      }
      nativeProps[instance] = values
      let restoresOverride = previous != nil && parent(instance) != nil && renderTracked(owner) && decisions[owner] == true && overrides[instance] != nil
      if restoresOverride {
        var extra = overrides[instance] ?? [:]
        for key in values.keys { extra.removeValue(forKey: key) }
        if extra.isEmpty { overrides.removeValue(forKey: instance) }
        else { overrides[instance] = extra }
      } else if different { overrides.removeValue(forKey: instance) }
      if different || restoresOverride { propsVersions[instance, default: 0] += 1 }
    }
    for (owner, sample) in samples { renderSamples[owner] = sample }
  }
  func prop(_ instance: String, _ key: String) -> TnValue {
    if let value = overrides[instance]?[key] { return value }
    return nativeProps[instance]?[key] ?? .undefined
  }
  func setProps(_ instance: String, _ values: [String: TnValue]) throws {
    var override = overrides[instance] ?? [:]
    for (key, value) in values { override[key] = value }
    overrides[instance] = override
    propsVersions[instance, default: 0] += 1
    changed()
    try refresh(instance)
  }
  private func execute(_ instance: String, _ method: String, _ args: [TnValue]) throws -> TnValue {
    switch instance + ":" + method { ${f.methodCases} default: return .undefined }
  }
  private func eventName(_ instance: String, _ method: String) -> String? {
    switch instance + ":" + method { ${f.eventCases} default: return nil }
  }
  func emit(_ instance: String, _ event: String, _ args: [TnValue]) throws {
    if !active { return }
    switch instance + ":" + event { ${f.emitterCases} default: return }
  }
  private func hook(_ instance: String, _ phase: String) throws {
    let cleanup = phase == "beforeUnmount" || phase == "onUnmounted"
    if cleanup { cleanupDepth += 1 }
    defer { if cleanup { cleanupDepth -= 1 } }
    switch instance + ":" + phase { ${f.hookCases} default: return }
  }
  private func throwFailures(_ failures: [Error]) throws {
    if failures.count == 1 { throw failures[0] }
    if failures.count > 1 { throw TnFailure(failures) }
  }
  @discardableResult func invoke(_ instance: String, _ method: String, _ args: [TnValue]) throws -> TnValue {
    if let failure = initializationFailure { throw failure }
    if !active && (cleanupDepth == 0 || eventName(instance, method) != nil || watchers.contains(where: { $0.instance == instance && $0.method == method })) { return .undefined }
    let epoch = generation
    depth += 1
    var result = TnValue.undefined
    var failures: [Error] = []
    do {
      result = try execute(instance, method, args)
      if let event = eventName(instance, method), active && epoch == generation {
        try emit(instance, event, result == .undefined ? args : [result])
      }
    } catch { failures.append(error) }
    if epoch == generation { depth -= 1 }
    if depth == 0 && epoch == generation && active {
      do { try refresh() } catch { failures.append(error) }
    }
    if epoch != generation { return .undefined }
    try throwFailures(failures)
    return result
  }
  private func collect(_ target: String? = nil) throws {
    if target == nil { try syncBindings() }
    for watch in watchers where mounted.contains(watch.instance) && (target == nil || target == watch.instance) {
      let key = watch.instance + ":" + watch.method
      let next = prop(watch.instance, watch.key)
      let previous = baseline[key] ?? .undefined
      baseline[key] = next
      if !same(next, previous) {
        enqueue(TnNotification(instance: watch.instance, method: watch.method, next: next, previous: previous, generation: generation), schedule: target == nil || !busy)
      }
    }
  }
  private func enqueue(_ notification: TnNotification, schedule: Bool = true) {
    if let batch = queue[notification.instance] {
      batch.notifications.append(notification)
    } else {
      queue[notification.instance] = TnNotificationBatch(nextBatch, notification)
      if schedule { pendingOwners.append((notification.instance, nextBatch)) }
      nextBatch &+= 1
    }
  }
  private func drainOwner(_ instance: String) throws {
    let epoch = generation
    if busyOwners.contains(instance) || !active { return }
    busyOwners.insert(instance)
    defer { if epoch == generation { busyOwners.remove(instance) } }
    do {
      while epoch == generation && active {
        guard let batch = queue.removeValue(forKey: instance) else { break }
        for notification in batch.notifications {
          if epoch != generation || !active { return }
          if notification.generation != generation || !mounted.contains(instance) { continue }
          try invoke(instance, notification.method, [notification.next, notification.previous])
        }
      }
    } catch {
      if epoch == generation { queue.removeValue(forKey: instance); throw error }
    }
  }
  private func refresh(_ target: String? = nil) throws {
    let epoch = generation
    if busy {
      if let instance = target { try collect(instance); try drainOwner(instance) }
      return
    }
    try collect(target)
    busy = true
    defer { if epoch == generation { busy = false } }
    do {
      while epoch == generation && active {
        while !pendingOwners.isEmpty && epoch == generation {
          let owners = pendingOwners
          pendingOwners.removeAll()
          for (instance, sequence) in owners {
            if epoch != generation { return }
            // A nested drain can consume the original batch before its turn.
            if queue[instance]?.sequence == sequence { try drainOwner(instance) }
          }
        }
        if epoch != generation || !active { return }
        if depth > 0 { break }
        try collect()
        if queue.isEmpty { break }
      }
    } catch {
      if epoch == generation { queue.removeAll(); pendingOwners.removeAll(); throw error }
    }
  }
  private func mountInstance(_ instance: String, _ epoch: Int) throws {
    if !active || epoch != generation { return }
    started.insert(instance)
    try hook(instance, "beforeMount")
    if epoch != generation { return }
    for child in instances where parent(child) == instance {
      try mountInstance(child, epoch)
      if epoch != generation { return }
    }
    mounted.insert(instance)
    for watch in watchers where watch.instance == instance {
      let value = prop(instance, watch.key)
      baseline[instance + ":" + watch.method] = value
      if watch.immediate {
        enqueue(TnNotification(instance: instance, method: watch.method, next: value, previous: .undefined, generation: epoch))
      }
    }
    try refresh()
    if epoch != generation { return }
    try hook(instance, "onMounted")
  }
  func mount() throws {
    if let failure = initializationFailure { throw failure }
    if mounting || unmounting || !started.isEmpty { return }
    mounting = true
    active = true
    depth = 0
    busyOwners.removeAll()
    if hasMounted {
      for instance in instances { propsVersions[instance, default: 0] += 1 }
    }
    hasMounted = true
    let epoch = generation
    defer { mounting = false }
    do {
      try syncBindings()
      for instance in instances where parent(instance) == nil {
        try mountInstance(instance, epoch)
        if epoch != generation { return }
      }
      changed()
    } catch {
      var failures = [error]
      do { try unmount() } catch { failures.append(error) }
      try throwFailures(failures)
    }
  }
  private func unmountInstance(_ instance: String, _ failures: inout [Error]) {
    if started.remove(instance) == nil { return }
    do { try hook(instance, "beforeUnmount") } catch { failures.append(error) }
    for child in instances where parent(child) == instance {
      unmountInstance(child, &failures)
    }
    do { try hook(instance, "onUnmounted") } catch { failures.append(error) }
  }
  func unmount() throws {
    if unmounting || !active { return }
    unmounting = true
    active = false
    generation += 1
    queue.removeAll()
    pendingOwners.removeAll()
    busy = false
    busyOwners.removeAll()
    mounted.removeAll()
    defer { unmounting = false }
    var failures: [Error] = []
    for instance in instances where parent(instance) == nil {
      unmountInstance(instance, &failures)
    }
    for instance in instances where started.contains(instance) {
      unmountInstance(instance, &failures)
    }
    changed()
    try throwFailures(failures)
  }
  func action(_ operation: @escaping () throws -> Void) -> () -> Void {
    let epoch = generation
    return { [weak self] in
      guard let self = self, self.active && epoch == self.generation else { return }
      do { try operation(); if self.active && epoch == self.generation { try self.refresh() } }
      catch { print("TransOne native callback error: " + String(describing: error)) }
    }
  }
  func same(_ left: TnValue, _ right: TnValue) -> Bool {
    if case .num(let a) = left, case .num(let b) = right {
      if a.isNaN && b.isNaN { return true }
      return a == b && (a != 0 || a.sign == b.sign)
    }
    return left == right
  }
  func truth(_ value: TnValue) -> Bool {
    switch value {
    case .num(let number): return number != 0 && !number.isNaN
    case .str(let text): return !text.isEmpty
    case .utf16(let units): return !units.isEmpty
    case .bool(let boolean): return boolean
    case .collection: return true
    default: return false
    }
  }
  private func numberString(_ value: Double) -> String {
    if value.isNaN { return "NaN" }
    if value == .infinity { return "Infinity" }
    if value == -.infinity { return "-Infinity" }
    if value == 0 { return "0" }
    let text = String(value).lowercased()
    let components = text.split(separator: "e", omittingEmptySubsequences: false)
    if components.count == 1 { return text.hasSuffix(".0") ? String(text.dropLast(2)) : text }
    let exponent = Int(components[1]) ?? 0
    let negative = value < 0
    let mantissa = String(components[0]).replacingOccurrences(of: "-", with: "")
    let pieces = mantissa.split(separator: ".", omittingEmptySubsequences: false)
    var digits = pieces.joined()
    while digits.count > 1 && digits.hasSuffix("0") { digits.removeLast() }
    let point = pieces[0].count + exponent
    if abs(value) >= 0.000001 && abs(value) < 1e21 {
      let sign = negative ? "-" : ""
      if point <= 0 { return sign + "0." + String(repeating: "0", count: -point) + digits }
      if point >= digits.count { return sign + digits + String(repeating: "0", count: point - digits.count) }
      let split = digits.index(digits.startIndex, offsetBy: point)
      return sign + String(digits[..<split]) + "." + String(digits[split...])
    }
    var coefficient = String(components[0])
    if coefficient.hasSuffix(".0") { coefficient = String(coefficient.dropLast(2)) }
    return coefficient + "e" + (exponent >= 0 ? "+" : "") + String(exponent)
  }
  func string(_ value: TnValue) -> String {
    do { return try coerceString(value) }
    catch { print("TransOne native text error: " + String(describing: error)); return "" }
  }
  private func textUnits(_ value: TnValue) -> [UInt16]? {
    switch value {
    case .str(let text): return Array(text.utf16)
    case .utf16(let units): return units
    default: return nil
    }
  }
  private func primitive(_ value: TnValue, _ seen: Set<ObjectIdentifier> = [], _ stringHint: Bool = false) throws -> TnValue {
    guard case .collection(let box) = value else { return value }
    // Plain data has no callable own methods: inherited valueOf returns the
    // receiver; inherited toString is available only when it is not shadowed.
    if !stringHint { track(box.versions, TnPropertyKey("valueOf")) }
    track(box.versions, TnPropertyKey("toString"))
    if box.values["toString"] != nil {
      if stringHint { track(box.versions, TnPropertyKey("valueOf")) }
      throw TnFailure("TypeError: cannot convert object to primitive")
    }
    if !box.isArray { return .str("[object Object]") }
    track(box.versions, TnPropertyKey("join"))
    if box.values["join"] != nil { return .str("[object Array]") }
    let identity = ObjectIdentifier(box)
    if seen.contains(identity) { return .str("") }
    var visited = seen; visited.insert(identity)
    var units: [UInt16] = []
    track(box.versions, TnPropertyKey("length"))
    for position in 0..<box.length {
      if position > 0 { units.append(0x002C) }
      track(box.versions, TnPropertyKey(String(position)))
      let item = box.values[String(position)] ?? .undefined
      if item != .nullValue && item != .undefined { units.append(contentsOf: try stringUnits(item, visited)) }
    }
    return .utf16(units)
  }
  private func stringUnits(_ value: TnValue, _ seen: Set<ObjectIdentifier> = []) throws -> [UInt16] {
    switch value {
    case .num(let number): return Array(numberString(number).utf16)
    case .str(let text): return Array(text.utf16)
    case .utf16(let units): return units
    case .bool(let boolean): return Array((boolean ? "true" : "false").utf16)
    case .nullValue: return Array("null".utf16)
    case .undefined: return Array("undefined".utf16)
    case .collection: return try stringUnits(primitive(value, seen, true), seen)
    }
  }
  private func coerceString(_ value: TnValue) throws -> String {
    String(decoding: try stringUnits(value), as: UTF16.self)
  }
  private func jsWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x0009...0x000D, 0x0020, 0x00A0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
    default: return false
    }
  }
  private func trimNumber(_ text: String) -> String {
    let scalars = Array(text.unicodeScalars)
    var first = 0
    var last = scalars.count
    while first < last && jsWhitespace(scalars[first]) { first += 1 }
    while last > first && jsWhitespace(scalars[last - 1]) { last -= 1 }
    return String(String.UnicodeScalarView(scalars[first..<last]))
  }
  private func number(_ value: TnValue) throws -> Double {
    switch value {
    case .num(let number): return number
    case .nullValue: return 0
    case .bool(let boolean): return boolean ? 1 : 0
    case .undefined: return .nan
    case .collection: return try number(primitive(value))
    case .utf16(let units): return try number(.str(String(decoding: units, as: UTF16.self)))
    case .str(let text):
      let source = trimNumber(text)
      if source.isEmpty { return 0 }
      if source == "Infinity" || source == "+Infinity" { return .infinity }
      if source == "-Infinity" { return -.infinity }
      let lower = source.lowercased()
      let radix = lower.hasPrefix("0x") ? 16 : lower.hasPrefix("0b") ? 2 : lower.hasPrefix("0o") ? 8 : 0
      if radix != 0 {
        let digits = lower.dropFirst(2)
        if digits.isEmpty { return .nan }
        var result = 0.0
        for character in digits {
          guard let ascii = character.asciiValue else { return .nan }
          let digit = ascii >= 48 && ascii <= 57 ? Int(ascii - 48) : ascii >= 97 && ascii <= 102 ? Int(ascii - 97) + 10 : -1
          guard digit >= 0 && digit < radix else { return .nan }
          result = result * Double(radix) + Double(digit)
        }
        return result
      }
      let grammar = "^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$"
      guard let match = source.range(of: grammar, options: .regularExpression), match == (source.startIndex..<source.endIndex) else { return .nan }
      return Double(source) ?? .nan
    }
  }
  func logical(_ operation: String, _ left: () throws -> TnValue, _ right: () throws -> TnValue) rethrows -> TnValue {
    let value = try left()
    if operation == "??" { return value == .nullValue || value == .undefined ? try right() : value }
    if operation == "&&" { return truth(value) ? try right() : value }
    return truth(value) ? value : try right()
  }
  func unary(_ operation: String, _ value: TnValue) throws -> TnValue {
    switch operation {
    case "!": return .bool(!truth(value))
    case "String": return .utf16(try stringUnits(value))
    case "Boolean": return .bool(truth(value))
    case "-": return .num(try -number(value))
    default: return .num(try number(value))
    }
  }
  private func equal(_ left: TnValue, _ right: TnValue) throws -> Bool {
    switch (left, right) {
    case (.collection, .collection): return left == right
    case (.collection, .num), (.collection, .str), (.collection, .utf16), (.collection, .bool): return try equal(primitive(left), right)
    case (.num, .collection), (.str, .collection), (.utf16, .collection), (.bool, .collection): return try equal(left, primitive(right))
    case (.num, .num), (.str, .str), (.utf16, .utf16), (.str, .utf16), (.utf16, .str), (.bool, .bool), (.nullValue, .nullValue), (.undefined, .undefined): return left == right
    case (.nullValue, .undefined), (.undefined, .nullValue): return true
    case (.nullValue, _), (.undefined, _), (_, .nullValue), (_, .undefined): return false
    default: return try number(left) == number(right)
    }
  }
  func binary(_ operation: String, _ left: TnValue, _ right: TnValue) throws -> TnValue {
    switch operation {
    case "===": return .bool(left == right)
    case "!==": return .bool(left != right)
    case "==": return .bool(try equal(left, right))
    case "!=": return .bool(try !equal(left, right))
    default: break
    }
    let lhs = try primitive(left), rhs = try primitive(right)
    if operation == "+" && (textUnits(lhs) != nil || textUnits(rhs) != nil) {
      return .utf16(try stringUnits(lhs) + stringUnits(rhs))
    }
    if ["<", "<=", ">", ">="].contains(operation), let a = textUnits(lhs), let b = textUnits(rhs) {
      let less = a.lexicographicallyPrecedes(b), equal = a == b
      return .bool(operation == "<" ? less : operation == "<=" ? less || equal : operation == ">" ? !less && !equal : !less)
    }
    let a = try number(lhs), b = try number(rhs)
    switch operation {
    case "+": return .num(a + b)
    case "-": return .num(a - b)
    case "*": return .num(a * b)
    case "/": return .num(a / b)
    case "%": return .num(a.truncatingRemainder(dividingBy: b))
    case "<": return .bool(a < b)
    case "<=": return .bool(a <= b)
    case ">": return .bool(a > b)
    case ">=": return .bool(a >= b)
    default: return .undefined
    }
  }
  func present(_ factory: () throws -> [TnValue], _ revision: Int = 0) -> String {
    _ = revision
    do { return String(decoding: try factory().flatMap { try stringUnits($0) }, as: UTF16.self) }
    catch { print("TransOne native text error: " + String(describing: error)); return "" }
  }
  func text(_ values: [TnValue], _ revision: Int = 0) -> String {
    _ = revision
    var units: [UInt16] = []
    for value in values {
      do { units.append(contentsOf: try stringUnits(value)) }
      catch { print("TransOne native text error: " + String(describing: error)) }
    }
    return String(decoding: units, as: UTF16.self)
  }
}
`;
}
