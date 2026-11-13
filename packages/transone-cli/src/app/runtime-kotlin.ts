import type { NativeRuntimeFragments } from './runtime-codegen';

/** Kotlin/JVM reference-value runtime; Android UI code only owns its revision callback. */
export function kotlinRuntime(f: NativeRuntimeFragments): string {
  return `sealed class TnValue {
  data class Num(val value: Double) : TnValue()
  data class Str(val value: String) : TnValue()
  data class Bool(val value: Boolean) : TnValue()
  class Collection(val value: TnCollection) : TnValue()
  object Undefined : TnValue()
  object NullValue : TnValue()
  companion object {
    val undefined: TnValue = Undefined
    val nullValue: TnValue = NullValue
    fun num(value: Double): TnValue = Num(value)
    fun str(value: String): TnValue = Str(value)
    fun bool(value: Boolean): TnValue = Bool(value)
  }
}
class TnVersions {
  val values = mutableMapOf<String, Int>()
  fun bump(key: String) { values[key] = (values[key] ?: 0) + 1 }
}
private data class TnRead(val versions: TnVersions, val key: String, val version: Int) {
  fun current(): Boolean = (versions.values[key] ?: 0) == version
}
class TnCollection(val isArray: Boolean) {
  val values = linkedMapOf<String, TnValue>()
  var length = 0L
  var revision = 0
  val versions = TnVersions()
}
data class TnEntry(val key: TnValue, val value: TnValue, val spread: Boolean = false)
data class TnItem(val value: TnValue, val spread: Boolean = false, val hole: Boolean = false)
private data class TnMemo(val value: TnValue, val reads: List<TnRead>, val propsVersion: Int)
private data class TnRenderSample(val reads: List<TnRead>, val propsVersion: Int)
data class TnWatch(val instance: String, val key: String, val method: String, val immediate: Boolean)
private data class TnNotification(val instance: String, val method: String, val next: TnValue, val previous: TnValue, val generation: Int)
class TnRuntime {
  private val pool = mutableMapOf<String, TnValue>()
  private val memos = mutableMapOf<String, MutableMap<String, TnMemo>>()
  private val renderSamples = mutableMapOf<String, TnRenderSample>()
  private val propsVersions = mutableMapOf<String, Int>()
  private val state = mutableMapOf<String, TnValue>()
  private val stateVersions = TnVersions()
  private var capturing: MutableList<TnRead>? = null
  private val overrides = mutableMapOf<String, MutableMap<String, TnValue>>()
  private val nativeProps = mutableMapOf<String, Map<String, TnValue>>()
  private val baseline = mutableMapOf<String, TnValue>()
  private val mounted = mutableSetOf<String>()
  private val started = mutableSetOf<String>()
  private val queue = linkedMapOf<String, MutableList<TnNotification>>()
  private var busy = false
  private val busyOwners = mutableSetOf<String>()
  private var syncing = false
  private var active = true
  private var mounting = false
  private var hasMounted = false
  private var unmounting = false
  private var cleanupDepth = 0
  private var depth = 0
  private var generation = 0
  private val instances: List<String> = ${f.instances}
  private val watchers: List<TnWatch> = ${f.watchers}
  private val renderTrackedOwners: List<String>? = ${f.renderTrackedOwners ?? 'null'}
  private val decimalNumber = Regex("^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$")
  var changed: () -> Unit = {}
  init {
    ${f.initialValues ?? ''}
    ${f.initialState}
    syncBindings()
  }
  fun allocateValue(id: String, isArray: Boolean) { pool[id] = TnValue.Collection(TnCollection(isArray)) }
  fun reference(id: String): TnValue = pool[id] ?: TnValue.undefined
  fun fillValue(id: String, value: TnValue) {
    val target = (reference(id) as? TnValue.Collection)?.value ?: throw IllegalStateException("TypeError: invalid initial value")
    val source = (value as? TnValue.Collection)?.value ?: throw IllegalStateException("TypeError: invalid initial value")
    if (target.isArray != source.isArray) throw IllegalStateException("TypeError: invalid initial value")
    target.values.clear(); target.values.putAll(source.values); target.length = source.length
  }
  private fun index(key: String): Long? {
    val value = key.toLongOrNull() ?: return null
    return if (value >= 0 && value < 4294967295L && value.toString() == key) value else null
  }
  private fun keys(box: TnCollection): List<String> = box.values.keys.mapNotNull { index(it) }.sorted().map { it.toString() } + box.values.keys.filter { index(it) == null }
  private fun put(box: TnCollection, key: String, value: TnValue): Boolean {
    if (box.isArray && key == "length") {
      val size = number(value)
      if (!size.isFinite() || size < 0 || size > 4294967295.0 || size != kotlin.math.floor(size)) throw IllegalStateException("RangeError: invalid array length")
      val length = size.toLong()
      val different = !strictEqual(TnValue.num(box.length.toDouble()), value)
      box.values.keys.filter { (index(it) ?: -1) >= length }.forEach { box.values.remove(it) }
      box.length = length
      if (different) box.versions.bump(key)
      return different
    }
    val previous = box.values[key]
    val different = !strictEqual(previous ?: TnValue.undefined, value)
    box.values[key] = value
    val position = index(key)
    if (box.isArray && position != null && position >= box.length) box.length = position + 1
    if (different) {
      box.versions.bump(key)
      if (box.isArray && !number(TnValue.str(key)).isNaN()) box.versions.bump("length")
    }
    return different
  }
  private fun track(versions: TnVersions, key: String) {
    capturing?.add(TnRead(versions, key, versions.values[key] ?: 0))
  }
  fun member(target: TnValue, key: TnValue, optional: Boolean = false): TnValue {
    if (target === TnValue.nullValue || target === TnValue.undefined) {
      if (optional) return TnValue.undefined
      throw IllegalStateException("TypeError: cannot read null or undefined")
    }
    val name = coerceString(key)
    if (target is TnValue.Collection) {
      val box = target.value
      track(box.versions, name)
      if (box.isArray && name == "length") return TnValue.num(box.length.toDouble())
      return box.values[name] ?: TnValue.undefined
    }
    if (target is TnValue.Str) {
      if (name == "length") return TnValue.num(target.value.length.toDouble())
      val position = index(name)
      if (position != null && position < target.value.length) return TnValue.str(target.value[position.toInt()].toString())
    }
    return TnValue.undefined
  }
  fun optionalMember(target: TnValue, key: () -> TnValue): TnValue =
    if (target === TnValue.nullValue || target === TnValue.undefined) TnValue.undefined else member(target, key())
  fun setMember(target: TnValue, key: TnValue, value: TnValue) {
    val box = (target as? TnValue.Collection)?.value ?: throw IllegalStateException("TypeError: cannot assign member of primitive")
    if (put(box, coerceString(key), value)) { box.revision++; changed() }
  }
  fun makeObject(entries: List<TnEntry>): TnValue {
    val box = TnCollection(false)
    for (entry in entries) {
      if (entry.spread) {
        val source = entry.value
        if (source is TnValue.Collection) for (key in keys(source.value)) put(box, key, source.value.values[key] ?: TnValue.undefined)
        else if (source is TnValue.Str) for ((position, character) in source.value.withIndex()) put(box, position.toString(), TnValue.str(character.toString()))
      } else put(box, coerceString(entry.key), entry.value)
    }
    return TnValue.Collection(box)
  }
  fun makeArray(items: List<TnItem>): TnValue {
    val box = TnCollection(true)
    for (item in items) {
      if (item.hole) { box.length++; continue }
      if (item.spread) {
        val source = item.value
        if (source is TnValue.Collection && source.value.isArray) {
          for (position in 0L until source.value.length) put(box, box.length.toString(), source.value.values[position.toString()] ?: TnValue.undefined)
        } else if (source is TnValue.Str) {
          var position = 0
          while (position < source.value.length) {
            val end = if (Character.isHighSurrogate(source.value[position]) && position + 1 < source.value.length && Character.isLowSurrogate(source.value[position + 1])) position + 2 else position + 1
            put(box, box.length.toString(), TnValue.str(source.value.substring(position, end)))
            position = end
          }
        } else throw IllegalStateException("TypeError: value is not iterable")
      } else put(box, box.length.toString(), item.value)
    }
    return TnValue.Collection(box)
  }
  private fun renderDependencies(owner: String): List<TnValue> {
    when (owner) { ${f.renderDependencyCases ?? ''} else -> return emptyList() }
  }
  private fun renderTracked(owner: String): Boolean = renderTrackedOwners?.contains(owner) ?: ${f.renderDependencyCases !== undefined}
  private fun sampleRenderReads(owner: String): List<TnRead> {
    val previous = capturing
    val reads = mutableListOf<TnRead>()
    capturing = reads
    try { renderDependencies(owner) } finally { capturing = previous }
    return reads.toList()
  }
  fun revisionValue(value: TnValue, mode: String = "auto"): TnValue {
    if (value !is TnValue.Collection) return TnValue.num(0.0)
    val box = value.value
    if (capturing != null) {
      if (mode == "array" || (mode == "auto" && box.isArray)) {
        track(box.versions, "length")
        for (position in 0L until box.length) track(box.versions, position.toString())
      } else for (key in keys(box)) track(box.versions, key)
    }
    return TnValue.num(box.revision.toDouble())
  }
  fun memo(owner: String, key: String, initial: TnValue, factory: () -> TnValue): TnValue {
    val version = propsVersions[owner] ?: 0
    val old = memos[owner]?.get(key)
    if (old != null && old.propsVersion == version && old.reads.all { it.current() }) return old.value
    val reads = sampleRenderReads(owner)
    val value = if (old == null && initial !== TnValue.undefined) initial else factory()
    memos.getOrPut(owner) { mutableMapOf() }[key] = TnMemo(value, reads, version)
    return value
  }
  fun initial(key: String, value: TnValue) { state[key] = value }
  fun getState(key: String): TnValue { track(stateVersions, key); return state[key] ?: TnValue.undefined }
  fun assign(key: String, value: TnValue) {
    val previous = state[key] ?: TnValue.undefined
    state[key] = value
    if (!strictEqual(previous, value)) { stateVersions.bump(key); changed() }
  }
  private fun propKeys(instance: String): List<String> {
    when (instance) { ${f.propKeysCases} else -> return emptyList() }
  }
  private fun parent(instance: String): String? {
    when (instance) { ${f.parentCases} else -> return null }
  }
  private fun boundProp(instance: String, key: String): TnValue {
    when (instance + ":" + key) { ${f.propCases} else -> return TnValue.undefined }
  }
  private fun syncBindings() {
    if (syncing) return
    syncing = true
    try {
      val decisions = mutableMapOf<String, Boolean>()
      val samples = mutableMapOf<String, TnRenderSample>()
      for (instance in instances) {
        val owner = parent(instance) ?: instance
        if (!decisions.containsKey(owner)) {
          val version = propsVersions[owner] ?: 0
          val old = renderSamples[owner]
          if (!renderTracked(owner)) decisions[owner] = true
          else if (old != null && old.propsVersion == version && old.reads.all { it.current() }) decisions[owner] = false
          else {
            samples[owner] = TnRenderSample(sampleRenderReads(owner), version)
            decisions[owner] = true
          }
        }
        if (nativeProps.containsKey(instance) && decisions[owner] == false) continue
        val values = mutableMapOf<String, TnValue>()
        var different = false
        val previous = nativeProps[instance]
        for (key in propKeys(instance)) {
          val value = boundProp(instance, key)
          values[key] = value
          if (previous != null && !same(value, previous[key] ?: TnValue.undefined)) different = true
        }
        nativeProps[instance] = values
        val restoresOverride = previous != null && parent(instance) != null && renderTracked(owner) && decisions[owner] == true && overrides.containsKey(instance)
        if (restoresOverride) {
          val extra = overrides.getValue(instance).filterKeys { !values.containsKey(it) }.toMutableMap()
          if (extra.isEmpty()) overrides.remove(instance) else overrides[instance] = extra
        } else if (different) overrides.remove(instance)
        if (different || restoresOverride) { propsVersions[instance] = (propsVersions[instance] ?: 0) + 1 }
      }
      renderSamples.putAll(samples)
    } finally { syncing = false }
  }
  fun prop(instance: String, key: String): TnValue {
    return overrides[instance]?.get(key) ?: nativeProps[instance]?.get(key) ?: TnValue.undefined
  }
  fun setProps(instance: String, values: Map<String, TnValue>) {
    val override = overrides.getOrPut(instance) { mutableMapOf() }
    override.putAll(values)
    propsVersions[instance] = (propsVersions[instance] ?: 0) + 1
    changed()
    refresh(instance)
  }
  private fun execute(instance: String, method: String, args: List<TnValue>): TnValue {
    when (instance + ":" + method) { ${f.methodCases} else -> return TnValue.undefined }
  }
  private fun eventName(instance: String, method: String): String? {
    when (instance + ":" + method) { ${f.eventCases} else -> return null }
  }
  fun emit(instance: String, event: String, args: List<TnValue>) {
    if (!active) return
    when (instance + ":" + event) { ${f.emitterCases} else -> return }
  }
  private fun hook(instance: String, phase: String) {
    val cleanup = phase == "beforeUnmount" || phase == "onUnmounted"
    if (cleanup) cleanupDepth++
    try { when (instance + ":" + phase) { ${f.hookCases} else -> return } }
    finally { if (cleanup) cleanupDepth-- }
  }
  private fun throwFailures(failures: List<Throwable>) {
    if (failures.size == 1) throw failures[0]
    if (failures.size > 1) {
      val combined = IllegalStateException(failures.joinToString("; ") { it.toString() })
      failures.forEach { combined.addSuppressed(it) }
      throw combined
    }
  }
  fun invoke(instance: String, method: String, args: List<TnValue>): TnValue {
    if (!active && (cleanupDepth == 0 || eventName(instance, method) != null || watchers.any { it.instance == instance && it.method == method })) return TnValue.undefined
    val epoch = generation
    depth++
    var result: TnValue = TnValue.undefined
    val failures = mutableListOf<Throwable>()
    try {
      result = execute(instance, method, args)
      val event = eventName(instance, method)
      if (event != null && active && epoch == generation) emit(instance, event, if (result === TnValue.undefined) args else listOf(result))
    } catch (error: Throwable) { failures.add(error) }
    if (epoch == generation) depth--
    if (depth == 0 && epoch == generation && active) {
      try { refresh() } catch (error: Throwable) { failures.add(error) }
    }
    if (epoch != generation) return TnValue.undefined
    throwFailures(failures)
    return result
  }
  private fun collect(target: String? = null) {
    if (target == null) syncBindings()
    for (watch in watchers) {
      if (!mounted.contains(watch.instance) || (target != null && target != watch.instance)) continue
      val key = watch.instance + ":" + watch.method
      val next = prop(watch.instance, watch.key)
      val previous = baseline[key] ?: TnValue.undefined
      baseline[key] = next
      if (!same(next, previous)) enqueue(TnNotification(watch.instance, watch.method, next, previous, generation))
    }
  }
  private fun enqueue(notification: TnNotification) {
    queue.getOrPut(notification.instance) { mutableListOf() }.add(notification)
  }
  private fun drainOwner(instance: String) {
    val epoch = generation
    if (busyOwners.contains(instance) || !active) return
    busyOwners.add(instance)
    try {
      while (epoch == generation && active) {
        val batch = queue.remove(instance) ?: break
        for (notification in batch) {
          if (epoch != generation || !active) return
          if (notification.generation != generation || !mounted.contains(instance)) continue
          invoke(instance, notification.method, listOf(notification.next, notification.previous))
        }
      }
    } catch (error: Throwable) {
      if (epoch == generation) { queue.remove(instance); throw error }
    } finally { if (epoch == generation) busyOwners.remove(instance) }
  }
  private fun refresh(target: String? = null) {
    val epoch = generation
    if (busy) {
      if (target != null) { collect(target); drainOwner(target) }
      return
    }
    collect(target)
    busy = true
    try {
      while (epoch == generation && active) {
        while (queue.isNotEmpty() && epoch == generation) {
          drainOwner(queue.keys.first())
        }
        if (epoch != generation || !active) return
        if (depth > 0) break
        collect()
        if (queue.isEmpty()) break
      }
    } catch (error: Throwable) { if (epoch == generation) { queue.clear(); throw error } }
    finally { if (epoch == generation) busy = false }
  }
  private fun mountInstance(instance: String, epoch: Int) {
    if (!active || epoch != generation) return
    started.add(instance)
    hook(instance, "beforeMount")
    if (epoch != generation) return
    for (child in instances) if (parent(child) == instance) {
      mountInstance(child, epoch)
      if (epoch != generation) return
    }
    mounted.add(instance)
    for (watch in watchers) {
      if (watch.instance != instance) continue
      val value = prop(instance, watch.key)
      baseline[instance + ":" + watch.method] = value
      if (watch.immediate) enqueue(TnNotification(instance, watch.method, value, TnValue.undefined, epoch))
    }
    refresh()
    if (epoch != generation) return
    hook(instance, "onMounted")
  }
  fun mount() {
    if (mounting || unmounting || started.isNotEmpty()) return
    mounting = true
    active = true
    depth = 0
    busyOwners.clear()
    if (hasMounted) for (instance in instances) propsVersions[instance] = (propsVersions[instance] ?: 0) + 1
    hasMounted = true
    val epoch = generation
    try {
      syncBindings()
      for (instance in instances) if (parent(instance) == null) {
        mountInstance(instance, epoch)
        if (epoch != generation) return
      }
      changed()
    } catch (error: Throwable) {
      val failures = mutableListOf(error)
      try { unmount() } catch (cleanup: Throwable) { failures.add(cleanup) }
      throwFailures(failures)
    } finally { mounting = false }
  }
  private fun unmountInstance(instance: String, failures: MutableList<Throwable>) {
    if (!started.remove(instance)) return
    try { hook(instance, "beforeUnmount") } catch (error: Throwable) { failures.add(error) }
    for (child in instances) if (parent(child) == instance) unmountInstance(child, failures)
    try { hook(instance, "onUnmounted") } catch (error: Throwable) { failures.add(error) }
  }
  fun unmount() {
    if (unmounting || !active) return
    unmounting = true
    active = false
    generation++
    queue.clear()
    busy = false
    busyOwners.clear()
    mounted.clear()
    val failures = mutableListOf<Throwable>()
    try {
      for (instance in instances) if (parent(instance) == null) unmountInstance(instance, failures)
      for (instance in instances) if (started.contains(instance)) unmountInstance(instance, failures)
      try { changed() } catch (error: Throwable) { failures.add(error) }
    } finally { unmounting = false }
    throwFailures(failures)
  }
  fun action(operation: () -> Unit): () -> Unit {
    val epoch = generation
    return action@{
      if (!active || epoch != generation) return@action
      try { operation(); if (active && epoch == generation) refresh() }
      catch (error: Throwable) { System.err.println("TransOne native callback error: " + error) }
    }
  }
  fun same(left: TnValue, right: TnValue): Boolean {
    if (left is TnValue.Num && right is TnValue.Num) {
      val a = left.value; val b = right.value
      return (a.isNaN() && b.isNaN()) || (a == b && (a != 0.0 || 1.0 / a == 1.0 / b))
    }
    return strictEqual(left, right)
  }
  private fun strictEqual(left: TnValue, right: TnValue): Boolean =
    if (left is TnValue.Collection && right is TnValue.Collection) left.value === right.value
    else if (left is TnValue.Num && right is TnValue.Num) left.value == right.value else left == right
  fun truth(value: TnValue): Boolean = when (value) {
    is TnValue.Num -> value.value != 0.0 && !value.value.isNaN()
    is TnValue.Str -> value.value.isNotEmpty()
    is TnValue.Bool -> value.value
    is TnValue.Collection -> true
    else -> false
  }
  private fun numberString(value: Double): String {
    if (value.isNaN()) return "NaN"
    if (value == Double.POSITIVE_INFINITY) return "Infinity"
    if (value == Double.NEGATIVE_INFINITY) return "-Infinity"
    if (value == 0.0) return "0"
    val text = java.lang.Double.toString(value).lowercase()
    val components = text.split('e')
    if (components.size == 1) return text.removeSuffix(".0")
    val exponent = components[1].toInt()
    val pieces = components[0].removePrefix("-").split('.')
    val digits = pieces.joinToString("").trimEnd('0')
    val point = pieces[0].length + exponent
    if (kotlin.math.abs(value) >= 0.000001 && kotlin.math.abs(value) < 1e21) {
      val sign = if (value < 0.0) "-" else ""
      if (point <= 0) return sign + "0." + "0".repeat(-point) + digits
      if (point >= digits.length) return sign + digits + "0".repeat(point - digits.length)
      return sign + digits.substring(0, point) + "." + digits.substring(point)
    }
    return components[0].removeSuffix(".0") + "e" + (if (exponent >= 0) "+" else "") + exponent
  }
  fun string(value: TnValue): String = try { coerceString(value) }
    catch (error: Throwable) { System.err.println("TransOne native text error: " + error); "" }
  private fun primitive(value: TnValue, seen: Set<TnCollection> = emptySet(), stringHint: Boolean = false): TnValue {
    if (value !is TnValue.Collection) return value
    val box = value.value
    if (!stringHint) track(box.versions, "valueOf")
    track(box.versions, "toString")
    if (box.values.containsKey("toString")) {
      if (stringHint) track(box.versions, "valueOf")
      throw IllegalStateException("TypeError: cannot convert object to primitive")
    }
    if (!box.isArray) return TnValue.str("[object Object]")
    track(box.versions, "join")
    if (box.values.containsKey("join")) return TnValue.str("[object Array]")
    if (seen.contains(box)) return TnValue.str("")
    val visited = seen + box
    track(box.versions, "length")
    return TnValue.str((0L until box.length).joinToString(",") { position ->
      track(box.versions, position.toString())
      val item = box.values[position.toString()] ?: TnValue.undefined
      if (item === TnValue.nullValue || item === TnValue.undefined) "" else coerceString(item, visited)
    })
  }
  private fun coerceString(value: TnValue, seen: Set<TnCollection> = emptySet()): String = when (value) {
    is TnValue.Num -> numberString(value.value)
    is TnValue.Str -> value.value
    is TnValue.Bool -> if (value.value) "true" else "false"
    TnValue.NullValue -> "null"
    TnValue.Undefined -> "undefined"
    is TnValue.Collection -> coerceString(primitive(value, seen, true), seen)
  }
  private fun jsWhitespace(code: Int): Boolean = when (code) {
    in 0x0009..0x000D, 0x0020, 0x00A0, 0x1680, in 0x2000..0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF -> true
    else -> false
  }
  private fun number(value: TnValue): Double = when (value) {
    is TnValue.Num -> value.value
    is TnValue.Bool -> if (value.value) 1.0 else 0.0
    TnValue.NullValue -> 0.0
    TnValue.Undefined -> Double.NaN
    is TnValue.Collection -> number(primitive(value))
    is TnValue.Str -> {
      val source = value.value.trim { character -> jsWhitespace(character.code) }
      when {
        source.isEmpty() -> 0.0
        source == "Infinity" || source == "+Infinity" -> Double.POSITIVE_INFINITY
        source == "-Infinity" -> Double.NEGATIVE_INFINITY
        source.startsWith("0x", true) || source.startsWith("0b", true) || source.startsWith("0o", true) -> {
          val radix = when (source[1].lowercaseChar()) { 'x' -> 16; 'b' -> 2; else -> 8 }
          val digits = source.substring(2).lowercase()
          var result = if (digits.isEmpty()) Double.NaN else 0.0
          for (character in digits) {
            val digit = "0123456789abcdef".indexOf(character)
            if (digit < 0 || digit >= radix) { result = Double.NaN; break }
            result = result * radix + digit
          }
          result
        }
        else -> if (decimalNumber.matches(source)) source.toDoubleOrNull() ?: Double.NaN else Double.NaN
      }
    }
  }
  fun logical(operation: String, left: () -> TnValue, right: () -> TnValue): TnValue {
    val value = left()
    if (operation == "??") return if (value === TnValue.nullValue || value === TnValue.undefined) right() else value
    if (operation == "&&") return if (truth(value)) right() else value
    return if (truth(value)) value else right()
  }
  fun unary(operation: String, value: TnValue): TnValue = when (operation) {
    "!" -> TnValue.bool(!truth(value))
    "String" -> TnValue.str(coerceString(value))
    "Boolean" -> TnValue.bool(truth(value))
    "-" -> TnValue.num(-number(value))
    else -> TnValue.num(number(value))
  }
  private fun equal(left: TnValue, right: TnValue): Boolean {
    if (left is TnValue.Collection && right is TnValue.Collection) return strictEqual(left, right)
    if (left::class == right::class) return strictEqual(left, right)
    if ((left === TnValue.nullValue || left === TnValue.undefined) && (right === TnValue.nullValue || right === TnValue.undefined)) return true
    if (left === TnValue.nullValue || left === TnValue.undefined || right === TnValue.nullValue || right === TnValue.undefined) return false
    if (left is TnValue.Collection) return equal(primitive(left), right)
    if (right is TnValue.Collection) return equal(left, primitive(right))
    return number(left) == number(right)
  }
  fun binary(operation: String, left: TnValue, right: TnValue): TnValue {
    when (operation) {
      "===" -> return TnValue.bool(strictEqual(left, right))
      "!==" -> return TnValue.bool(!strictEqual(left, right))
      "==" -> return TnValue.bool(equal(left, right))
      "!=" -> return TnValue.bool(!equal(left, right))
    }
    val lhs = primitive(left); val rhs = primitive(right)
    if (operation == "+" && (lhs is TnValue.Str || rhs is TnValue.Str)) return TnValue.str(coerceString(lhs) + coerceString(rhs))
    if (operation in listOf("<", "<=", ">", ">=") && lhs is TnValue.Str && rhs is TnValue.Str) {
      val comparison = lhs.value.compareTo(rhs.value)
      return TnValue.bool(when (operation) { "<" -> comparison < 0; "<=" -> comparison <= 0; ">" -> comparison > 0; else -> comparison >= 0 })
    }
    val a = number(lhs); val b = number(rhs)
    return when (operation) {
      "+" -> TnValue.num(a + b)
      "-" -> TnValue.num(a - b)
      "*" -> TnValue.num(a * b)
      "/" -> TnValue.num(a / b)
      "%" -> TnValue.num(a % b)
      "<" -> TnValue.bool(a < b)
      "<=" -> TnValue.bool(a <= b)
      ">" -> TnValue.bool(a > b)
      ">=" -> TnValue.bool(a >= b)
      else -> TnValue.undefined
    }
  }
  fun present(factory: () -> List<TnValue>, revision: Int = 0): String = try { factory().joinToString("") { coerceString(it) } }
    catch (error: Throwable) { System.err.println("TransOne native text error: " + error); "" }
  fun text(values: List<TnValue>, revision: Int = 0): String = values.joinToString("") { string(it) }
}
`;
}
