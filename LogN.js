/**
 * @zakkster/lite-logn -- a tree-shakeable, zero-GC family of O(log n) data
 * structures that doubles as a teachable textbook: each member solves a real
 * problem AND proves its logarithm is real (the O(log n) Witness -- see
 * test/witness.mjs).
 *
 * v0.1.0 shipped the FIRST member: BinaryHeap, an INDEXED binary heap -- an
 * addressable priority queue (a min|max binary heap over three parallel typed
 * arrays plus a reverse-index map that makes changeKey / remove O(log n) by
 * caller-supplied entity id). v0.2.0 adds the SECOND member: Fenwick (BIT), a
 * flat-array structure whose point-update AND prefix-sum are BOTH O(log n) via
 * the lowest-set-bit walk (`i & -i`). v0.3.0 adds the THIRD member: SegmentTree,
 * a flat `Float64Array(2n)` (leaves at n..2n-1) whose range-query AND point-update
 * are BOTH O(log n) via iterative bottom-up walks, with the associative fold
 * (min / max / sum / gcd) chosen ONCE at construction. v0.4.0 adds the FOURTH
 * member: SkipList, a pointer-free ordered map (get / set / delete / successor /
 * predecessor / rangeIter) whose links are slot INDICES in flat `Uint32Array`
 * columns over a private free-list (NodePool), giving EXPECTED O(log n) with zero
 * per-op allocation and a deterministic instance-local PRNG. Members land
 * append-only, leaving this header and the `VERSION` const the only prior lines
 * that ever change. Roster: BinaryHeap (v0.1.0, array-embedded O(log n) push / pop
 * min|max heap), Fenwick / BIT (v0.2.0, O(log n) point-update AND prefix-sum via
 * the `i & -i` walk), SegmentTree (v0.3.0, O(log n) associative range-query +
 * point-update over a flat 2n array, fold chosen at construction), and SkipList
 * (v0.4.0, pointer-free expected-O(log n) ordered map over a private free-list
 * node pool). Members are independent (no shared mutable module state), so a
 * bundler that imports one drops the others (`sideEffects: false`).
 *
 * The family delta: lite-o1 proves a FLAT ops/ms line on a log-x axis (the
 * constant, slope ~ 0); lite-logn proves a STRAIGHT line on that same axis (one
 * added level per doubling of n, slope > 0 within a per-member band). Every hot
 * op each member ships is O(log n) worst-case (or expected/amortized where
 * stated) and allocates ZERO bytes after construction. The witness harness
 * (never imported here) fits `nsPerOp = intercept + slope * log2(n)` and shows
 * the straight log line while an O(n) foil leaves it -- that line is the theorem
 * made visible.
 *
 * @license MIT
 */

/** Package version. One of the three version sites (package.json / VERSION / llms.txt). */
export const VERSION = '0.8.0';

// --- members land here, append-only, one tree-shakeable class each -----------
// BinaryHeap  (v0.1.0 session) -- indexed O(log n) min|max heap  (BELOW)
// Fenwick     (v0.2.0 session) -- O(log n) point-update + prefix-sum  (BELOW)
// SegmentTree (v0.3.0 session) -- O(log n) associative range-query + point-update  (BELOW)
// SkipList    (v0.4.0 session) -- pointer-free expected-O(log n) ordered map  (BELOW)

/** Max heap capacity: slot indices 0..cap-1 must fit the Int32Array _pos map. */
const BH_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * An INDEXED binary heap: an addressable priority queue over three parallel,
 * pointer-free typed arrays plus a reverse-index map. A plain binary heap gives
 * O(log n) push / pop but cannot find an arbitrary element to reprioritize; the
 * `_pos` map (entity id -> current heap slot, sentinel -1 == absent) buys
 * O(log n) `changeKey` / `remove` by a caller-supplied entity id. Every hot op
 * (push / pop / peek / topKey / keyOf / has / changeKey / remove) allocates ZERO
 * bytes after construction.
 *
 * Storage (allocated once, sized to capacity):
 *   - `_key` Float64Array -- the priority key at each heap SLOT (heap-ordered).
 *   - `_id`  Uint32Array  -- the entity id at each heap SLOT (moves with its key).
 *   - `_pos` Int32Array   -- reverse map id -> slot; -1 means "not in heap".
 * `_pos` is initialised to -1 (fill), NOT 0, because slot 0 is a valid position
 * -- null is not zero. Children of slot i are 2i+1 / 2i+2, parent (i-1)>>1.
 *
 * The sift is HOLE-PUNCHING (not a 3-write swap): the moving element is cached in
 * locals once, the hole walks down / up writing ONE slot per level (updating
 * `_pos` for each shifted id), then the cached element drops into the final hole.
 *
 * ID contract: entity ids are integers in [0, capacity). Any out-of-range id is a
 * hard `[lite-logn]` throw (a programming error). A key must be a finite number
 * where required; NaN / non-finite / non-number fail closed rather than corrupt
 * heap order. Fixed capacity: overflow throws, never silently drops.
 */
export class BinaryHeap {
    /**
     * @param {number} capacity        exact max live entries; integer in [1, 2^31-1].
     * @param {'min'|'max'} [kind]      the frozen extreme this heap reports (default 'min').
     */
    constructor(capacity, kind = 'min') {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > BH_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] BinaryHeap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        if (kind !== 'min' && kind !== 'max') {
            throw new RangeError(
                '[lite-logn] BinaryHeap kind must be "min" or "max", got ' + String(kind));
        }
        this._key = new Float64Array(capacity); // key at each heap slot
        this._id = new Uint32Array(capacity);   // entity id at each heap slot
        this._pos = new Int32Array(capacity);   // id -> slot; -1 == absent
        this._pos.fill(-1);                      // slot 0 is valid: null is not zero
        this._cap = capacity;                    // exact fixed capacity
        this._n = 0;                             // live entries (heap size)
        this._min = kind === 'min';              // ctor-frozen hot compare flag
    }

    /** Live entry count. O(1). */
    get size() { return this._n; }

    /** The fixed capacity this heap was sized for. O(1). */
    get capacity() { return this._cap; }

    /** The frozen extreme this heap reports, 'min' or 'max'. O(1). */
    get kind() { return this._min ? 'min' : 'max'; }

    /**
     * Insert entity `id` with priority `key`. O(log n). Fails closed: an
     * out-of-range id, an already-present id (no silent overwrite), a non-finite /
     * non-number key, or a full heap each throw `[lite-logn]` as a no-op.
     * @param {number} id   integer in [0, capacity), not already present
     * @param {number} key  a finite number
     */
    push(id, key) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._pos[id] !== -1) return this._dup(id);
        const n = this._n;
        if (n === this._cap) return this._full();
        this._n = n + 1;
        this._siftUp(n, key, id);
    }

    /**
     * Remove and return the entity id at the extremum (min or max per kind), or
     * `undefined` if empty (never throws on empty). O(log n).
     * @returns {number|undefined}
     */
    pop() {
        const n = this._n;
        if (n === 0) return undefined;
        const top = this._id[0];
        this._pos[top] = -1;
        const last = n - 1;
        this._n = last;
        if (last > 0) this._siftDown(0, this._key[last], this._id[last]);
        return top;
    }

    /** The entity id at the extremum, or `undefined` if empty. Read-only. O(1). */
    peek() { return this._n === 0 ? undefined : this._id[0]; }

    /** The key at the extremum (root), or `undefined` if empty. O(1). */
    topKey() { return this._n === 0 ? undefined : this._key[0]; }

    /**
     * The key currently associated with `id`, or `undefined` if id is not in the
     * heap. O(1). An out-of-range id still throws.
     * @param {number} id
     * @returns {number|undefined}
     */
    keyOf(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        const slot = this._pos[id];
        return slot === -1 ? undefined : this._key[slot];
    }

    /**
     * True iff `id` is currently in the heap. O(1). An out-of-range id throws.
     * @param {number} id
     * @returns {boolean}
     */
    has(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        return this._pos[id] !== -1;
    }

    /**
     * Reprioritize a present entity to `newKey`, auto-directing the sift. O(log n).
     * Compares the new key against the current parent to pick the single direction
     * that can violate order (up XOR down), then sifts that way with hole-punching.
     * Fails closed: a non-member id throws `[lite-logn]` (never a silent no-op); an
     * out-of-range id or non-finite key throws.
     * @param {number} id      integer in [0, capacity), currently present
     * @param {number} newKey  a finite number
     */
    changeKey(id, newKey) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (typeof newKey !== 'number' || !Number.isFinite(newKey)) return this._badKey(newKey);
        const slot = this._pos[id];
        if (slot === -1) return this._notMember(id);
        if (slot > 0) {
            const pk = this._key[(slot - 1) >> 1];
            if (this._min ? (newKey < pk) : (newKey > pk)) {
                this._siftUp(slot, newKey, id);
                return;
            }
        }
        this._siftDown(slot, newKey, id);
    }

    /**
     * Remove entity `id`. O(log n). Idempotent: returns false if id is absent (no
     * throw), true if it was present and removed. The last entry fills the vacated
     * slot and sifts the single direction that can violate order. An out-of-range
     * id throws.
     * @param {number} id
     * @returns {boolean}
     */
    remove(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        const slot = this._pos[id];
        if (slot === -1) return false;
        this._pos[id] = -1;
        const last = this._n - 1;
        this._n = last;
        if (slot !== last) {
            const mk = this._key[last];
            const mid = this._id[last];
            if (slot > 0) {
                const pk = this._key[(slot - 1) >> 1];
                if (this._min ? (mk < pk) : (mk > pk)) {
                    this._siftUp(slot, mk, mid);
                    return true;
                }
            }
            this._siftDown(slot, mk, mid);
        }
        return true;
    }

    /** Empty the heap. O(capacity) cold path (resets size + the reverse map). */
    clear() {
        this._n = 0;
        this._pos.fill(-1);
    }

    /**
     * Visit every live (id, key) pair in UNSPECIFIED (heap-array) order -- NOT
     * sorted / pop order. O(n) cold scan, allocation-free (pass a hoisted callback).
     * @param {(id:number, key:number, heap:BinaryHeap)=>void} fn
     */
    forEach(fn) {
        const id = this._id, key = this._key, n = this._n;
        for (let i = 0; i < n; i++) fn(id[i], key[i], this);
    }

    /**
     * Iterate live entity ids in UNSPECIFIED (heap-array) order -- NOT sorted. The
     * one documented per-protocol allocator (a {value, done} per step); use forEach
     * for the alloc-free scan.
     */
    *[Symbol.iterator]() {
        const id = this._id, n = this._n;
        for (let i = 0; i < n; i++) yield id[i];
    }

    /**
     * Floyd O(n) bulk build: load every (ids[i], keys[i]) pair then heapify
     * bottom-up in O(n), rather than n individual O(log n) pushes. COLD path;
     * fails closed on any violation (duplicate / out-of-range id, non-finite key,
     * count > capacity) before the heap is usable.
     * @param {'min'|'max'} kind
     * @param {ArrayLike<number>} ids   unique integers in [0, capacity)
     * @param {ArrayLike<number>} keys  finite numbers, keys.length === ids.length
     * @param {number} capacity
     * @returns {BinaryHeap}
     */
    static build(kind, ids, keys, capacity) {
        const heap = new BinaryHeap(capacity, kind);
        if (ids == null || keys == null ||
            typeof ids.length !== 'number' || typeof keys.length !== 'number') {
            throw new TypeError('[lite-logn] BinaryHeap.build needs array-like ids and keys');
        }
        const count = ids.length;
        if (keys.length !== count) {
            throw new RangeError(
                '[lite-logn] BinaryHeap.build ids/keys length mismatch (' +
                count + ' vs ' + keys.length + ')');
        }
        if (count > capacity) {
            throw new RangeError(
                '[lite-logn] BinaryHeap.build count ' + count + ' exceeds capacity ' + capacity);
        }
        const K = heap._key, I = heap._id, P = heap._pos;
        for (let i = 0; i < count; i++) {
            const id = ids[i];
            if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= capacity) {
                throw new RangeError(
                    '[lite-logn] BinaryHeap.build id must be an integer in [0, capacity), got ' +
                    String(id));
            }
            const key = keys[i];
            if (typeof key !== 'number' || !Number.isFinite(key)) {
                throw new TypeError(
                    '[lite-logn] BinaryHeap.build key must be a finite number, got ' + String(key));
            }
            if (P[id] !== -1) {
                throw new RangeError('[lite-logn] BinaryHeap.build duplicate id ' + id);
            }
            K[i] = key;
            I[i] = id;
            P[id] = i;
        }
        heap._n = count;
        // Floyd: sift down every internal node, deepest-first. O(n).
        for (let i = (count >> 1) - 1; i >= 0; i--) {
            heap._siftDown(i, K[i], I[i]);
        }
        return heap;
    }

    // ---- private hole-punching sift (hot bodies) ---------------------------

    /**
     * Walk the hole UP from `hole`, pulling each larger (min) / smaller (max)
     * parent down one level, then drop (key, id) into the settled hole. One write
     * per level; `_pos` updated for every shifted id and for the placed id.
     * @private
     */
    _siftUp(hole, key, id) {
        const K = this._key, I = this._id, P = this._pos, min = this._min;
        while (hole > 0) {
            const parent = (hole - 1) >> 1;
            const pk = K[parent];
            if (min ? (key >= pk) : (key <= pk)) break;
            K[hole] = pk;
            const pid = I[parent];
            I[hole] = pid;
            P[pid] = hole;
            hole = parent;
        }
        K[hole] = key;
        I[hole] = id;
        P[id] = hole;
    }

    /**
     * Walk the hole DOWN from `hole`, pulling the extreme child up one level, then
     * drop (key, id) into the settled hole. One write per level; `_pos` updated for
     * every shifted id and for the placed id. Bound is the current `_n`.
     * @private
     */
    _siftDown(hole, key, id) {
        const K = this._key, I = this._id, P = this._pos, min = this._min;
        const n = this._n;
        const half = n >> 1; // nodes at index >= half are leaves
        while (hole < half) {
            let child = (hole << 1) + 1; // left child
            const right = child + 1;
            if (right < n && (min ? (K[right] < K[child]) : (K[right] > K[child]))) {
                child = right;
            }
            const ck = K[child];
            if (min ? (key <= ck) : (key >= ck)) break;
            K[hole] = ck;
            const cid = I[child];
            I[hole] = cid;
            P[cid] = hole;
            hole = child;
        }
        K[hole] = key;
        I[hole] = id;
        P[id] = hole;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ---

    /** @private */
    _badId(id) {
        throw new RangeError(
            '[lite-logn] BinaryHeap id must be an integer in [0, ' + this._cap + '), got ' +
            String(id));
    }

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] BinaryHeap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _dup(id) {
        throw new RangeError(
            '[lite-logn] BinaryHeap id ' + id + ' already present (no silent overwrite)');
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] BinaryHeap full (capacity ' + this._cap + ')');
    }

    /** @private */
    _notMember(id) {
        throw new RangeError(
            '[lite-logn] BinaryHeap.changeKey: id ' + id + ' is not in the heap');
    }
}

/**
 * Max Fenwick length: internal 1-based indices `k` run in [1, length] and the
 * whole trick is the two's-complement lowest-set-bit `k & -k`. JavaScript
 * bitwise operators coerce to a SIGNED 32-bit integer, so `k & -k` is only the
 * lowest set bit while `k` fits a positive int32 -- i.e. `k <= 2^31 - 1`. Since
 * the largest `k` the walk ever reaches equals `length`, `length` itself must
 * stay in that range. Same bound as BinaryHeap's capacity, for the same reason:
 * the index arithmetic, not the byte count, is the hard ceiling.
 */
const FENWICK_MAX = 0x7FFFFFFF; // 2^31 - 1

/**
 * A Fenwick tree (Binary Indexed Tree): BOTH point-update AND prefix-sum in
 * O(log n) over a SINGLE flat `Float64Array`, using nothing but the lowest-set-
 * bit walk (`i & -i`). The member whose Big-O is most delightfully non-obvious
 * -- "how can update AND query both be logarithmic on a plain array?" is exactly
 * the claim the witness answers, with TWO straight log lines (one per op). No
 * nodes, no pointers; nothing is allocated per op after construction.
 *
 * Index base: PUBLIC indices are 0-based in `[0, length)`. Internally the tree is
 * 1-based -- each public `i` maps to `i + 1` in the backing `_t` Float64Array, so
 * `_t[0]` is the unused identity sentinel and is NEVER read as data (null is not
 * zero: slot 0 does not mean "the element at 0" -- it means "no cell"). Element
 * `i` lives, spread across a logarithmic set of cells, in `_t[1 .. length]`.
 *
 * The two walks are the whole structure:
 *   - `update(i, delta)` climbs: from `k = i + 1`, repeatedly `k += k & -k` (add
 *     the lowest set bit) until `k > length`, touching ONE cell per level.
 *   - `prefix(i)` descends: from `k = i + 1`, repeatedly `k -= k & -k` (strip the
 *     lowest set bit) until `k == 0`, summing ONE cell per level.
 * Both take at most `log2(length)` steps -- the logarithm the witness proves.
 *
 * Value type: `Float64Array`; deltas and values may be ANY finite number,
 * including negatives. NaN / +-Infinity / non-number fail closed (typeof-guarded
 * BEFORE coercion) rather than corrupt a running sum. Honesty note on precision:
 * sums are IEEE-754 double addition, so a very large corpus of very different
 * magnitudes accumulates the usual floating-point rounding error -- the bound is
 * exact in step count, not in the last ULP of the sum. For exact integer sums,
 * keep values within the 2^53 safe-integer range.
 *
 * Fixed capacity: `length` is frozen at construction; there is no grow. Every
 * out-of-range index and every non-finite value is a hard `[lite-logn]` throw.
 */
export class Fenwick {
    /**
     * @param {number} length  exact element count; integer in [1, 2^31-1].
     */
    constructor(length) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof length !== 'number' || !Number.isInteger(length) ||
            length < 1 || length > FENWICK_MAX) {
            throw new RangeError(
                '[lite-logn] Fenwick length must be an integer in [1, 2^31-1], got ' +
                String(length));
        }
        this._n = length;                        // element count (fixed)
        this._t = new Float64Array(length + 1);  // 1-based; _t[0] is the unused sentinel
    }

    /** Element count this tree was sized for. O(1). */
    get length() { return this._n; }

    /**
     * Add `delta` to the element at 0-based index `i`. O(log n): climb from
     * `k = i + 1` by the lowest set bit, one `_t` touch per level. Fails closed:
     * a non-number / non-finite delta (typeof-guarded first) or an out-of-range
     * index each throw `[lite-logn]` as a no-op.
     * @param {number} i      integer in [0, length)
     * @param {number} delta  a finite number (may be negative)
     * @returns {this}
     */
    update(i, delta) {
        if (typeof delta !== 'number' || !Number.isFinite(delta)) return this._badDelta(delta);
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        const t = this._t, n = this._n;
        for (let k = i + 1; k <= n; k += k & -k) t[k] += delta; // <= log2(n) steps
        return this;
    }

    /**
     * Sum of elements in `[0, i]` INCLUSIVE. O(log n): descend from `k = i + 1`
     * by the lowest set bit, one `_t` read per level. `prefix(-1) === 0` is the
     * clean base case (the empty prefix). An out-of-range index throws; the valid
     * domain is `[-1, length)`.
     * @param {number} i  integer in [-1, length)
     * @returns {number}
     */
    prefix(i) {
        if (typeof i !== 'number' || !Number.isInteger(i) || i < -1 || i >= this._n) {
            return this._badPrefixIndex(i);
        }
        const t = this._t;
        let s = 0;
        for (let k = i + 1; k > 0; k -= k & -k) s += t[k];      // <= log2(n) steps
        return s;
    }

    /**
     * Sum of elements in `[lo, hi]` INCLUSIVE on both ends = `prefix(hi) -
     * prefix(lo - 1)`, inlined as two lowest-set-bit walks (no intermediate
     * object, no double validation). O(log n). Fails closed: out-of-range `lo` or
     * `hi`, or `lo > hi`, each throw `[lite-logn]`.
     * @param {number} lo  integer in [0, length)
     * @param {number} hi  integer in [lo, length)
     * @returns {number}
     */
    rangeSum(lo, hi) {
        if (typeof lo !== 'number' || !Number.isInteger(lo) || lo < 0 || lo >= this._n) {
            return this._badRange(lo, hi);
        }
        if (typeof hi !== 'number' || !Number.isInteger(hi) || hi < 0 || hi >= this._n) {
            return this._badRange(lo, hi);
        }
        if (lo > hi) return this._badRange(lo, hi);
        const t = this._t;
        let s = 0;
        for (let k = hi + 1; k > 0; k -= k & -k) s += t[k];     // prefix(hi)
        for (let k = lo; k > 0; k -= k & -k) s -= t[k];         // - prefix(lo-1)
        return s;
    }

    /**
     * The single element at 0-based index `i` = `prefix(i) - prefix(i - 1)`,
     * inlined as two lowest-set-bit walks. O(log n), zero allocation. An
     * out-of-range index throws `[lite-logn]`.
     * @param {number} i  integer in [0, length)
     * @returns {number}
     */
    at(i) {
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        const t = this._t;
        let s = 0;
        for (let k = i + 1; k > 0; k -= k & -k) s += t[k];      // prefix(i)
        for (let k = i; k > 0; k -= k & -k) s -= t[k];          // - prefix(i-1)
        return s;
    }

    /**
     * Set the element at 0-based index `i` to `value` (absolute), via
     * `update(i, value - at(i))`, inlined so the read and the climb share one
     * validation and allocate nothing. O(log n). Fails closed: a non-finite
     * value (typeof-guarded first) or out-of-range index throws `[lite-logn]`.
     * @param {number} i      integer in [0, length)
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(i, value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        const t = this._t, n = this._n;
        let cur = 0;                                            // = at(i)
        for (let k = i + 1; k > 0; k -= k & -k) cur += t[k];
        for (let k = i; k > 0; k -= k & -k) cur -= t[k];
        const delta = value - cur;
        for (let k = i + 1; k <= n; k += k & -k) t[k] += delta; // update(i, delta)
        return this;
    }

    /** Zero every element in place, keeping the fixed capacity. O(n) cold path. */
    clear() {
        this._t.fill(0);
        return this;
    }

    /**
     * Visit every element as `(value, index, fenwick)` for index in `[0, length)`,
     * in ascending index order. O(n log n) COLD scan (each element is an `at`
     * walk); allocation-free in the loop body (pass a hoisted callback).
     * @param {(value:number, index:number, fenwick:Fenwick)=>void} fn
     */
    forEach(fn) {
        const t = this._t, n = this._n;
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (let k = i + 1; k > 0; k -= k & -k) s += t[k];
            for (let k = i; k > 0; k -= k & -k) s -= t[k];
            fn(s, i, this);
        }
    }

    /**
     * O(n) LINEAR bulk build from `values` -- the SECOND teachable trick. Load
     * each value into its own cell, then in ONE forward pass let each cell add
     * itself to its parent (`_t[j] += _t[i]` where `j = i + (i & -i)`). This is
     * O(n), NOT n incremental O(log n) updates. COLD path; fails closed on a
     * non-array-like `values` or any non-finite entry before the tree is usable.
     * @param {ArrayLike<number>} values  finite numbers; length in [1, 2^31-1]
     * @returns {Fenwick}
     */
    static build(values) {
        if (values == null || typeof values.length !== 'number') {
            throw new TypeError('[lite-logn] Fenwick.build needs an array-like of finite numbers');
        }
        const length = values.length;
        const f = new Fenwick(length);            // validates length in [1, 2^31-1]
        const t = f._t;
        for (let i = 0; i < length; i++) {
            const v = values[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new TypeError(
                    '[lite-logn] Fenwick.build value must be a finite number, got ' + String(v));
            }
            t[i + 1] = v;                         // seed each cell with its own value
        }
        // Linear propagation: each 1-based cell i pushes its running sum to its
        // parent j = i + (i & -i). One pass, O(n) -- the non-obvious build trick.
        for (let i = 1; i <= length; i++) {
            const j = i + (i & -i);
            if (j <= length) t[j] += t[i];
        }
        return f;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ---

    /** @private */
    _badIndex(i) {
        throw new RangeError(
            '[lite-logn] Fenwick index must be an integer in [0, ' + this._n + '), got ' +
            String(i));
    }

    /** @private */
    _badPrefixIndex(i) {
        throw new RangeError(
            '[lite-logn] Fenwick prefix index must be an integer in [-1, ' + this._n + '), got ' +
            String(i));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] Fenwick rangeSum needs integers 0 <= lo <= hi < ' + this._n +
            ', got lo=' + String(lo) + ' hi=' + String(hi));
    }

    /** @private */
    _badDelta(delta) {
        throw new TypeError(
            '[lite-logn] Fenwick delta must be a finite number, got ' + String(delta));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] Fenwick value must be a finite number, got ' + String(value));
    }
}

/**
 * Max SegmentTree length: the whole structure lives in ONE `Float64Array(2 *
 * length)` with leaves at indices `n .. 2n-1` and internal node `p`'s children
 * at `2p` / `2p+1`. Both the leaf index (`n + i`, up to `2n - 1`) and the child
 * index (`p << 1`, up to `2n - 2`) are computed with the signed-int32 `<<` / `+`
 * operators, so the largest index the walks ever reach -- `2n - 1` -- must stay a
 * POSITIVE int32 (`<= 2^31 - 1`). That caps `length` at `2^30 - 1`: HALF of
 * BinaryHeap's / Fenwick's ceiling, because SegmentTree's backing array is 2n
 * wide (a node per leaf plus a node per internal cell) where theirs are n wide.
 * The index arithmetic, not the byte count, is the hard ceiling.
 */
const SEGTREE_MAX = 0x3FFFFFFF; // 2^30 - 1  (so 2n stays a positive int32)

/**
 * Euclidean GCD over nonnegative integers-in-doubles. Off the value door the
 * inputs are already validated nonnegative finite integers (the `gcd` kind
 * constrains its domain -- see SegmentTree's value door), and the identity 0
 * makes this associative + commutative: `gcd(0, x) === x`, `gcd(x, 0) === x`.
 * A plain module function (monomorphic, allocation-free) -- it is the arithmetic
 * of the fold, NOT the fold dispatch (which is the ctor-cached `_k` inline
 * switch). `%` is exact for integers within the 2^53 safe range.
 * @param {number} a nonnegative finite integer
 * @param {number} b nonnegative finite integer
 * @returns {number} gcd(a, b), with gcd(0, 0) === 0
 */
function segGcd(a, b) {
    while (b !== 0) { const r = a % b; a = b; b = r; }
    return a;
}

/**
 * A SEGMENT TREE: an associative range-query AND a point-update, BOTH O(log n),
 * over a SINGLE flat `Float64Array(2n)` -- no nodes, no pointers, no recursion on
 * the hot path. The complement to Fenwick: Fenwick's `rangeSum` works only
 * because subtraction inverts addition, so it is a SUM machine; SegmentTree folds
 * ANY associative + commutative operation over a range -- min / max / sum / gcd --
 * because it stores a fold of each subtree at its internal node rather than a
 * prefix. The fold is chosen ONCE at construction and cached as a small-int `_k`
 * combined by an INLINE switch in the hot body (no function ref, no closure, no
 * megamorphic call site).
 *
 * Layout (the iterative "2n" trick):
 *   - `_t` is a `Float64Array(2 * length)`; `_t[0]` is UNUSED (null is not zero:
 *     index 0 is never read as data).
 *   - Leaves are `_t[n + i]` for public index `i` in `[0, n)`.
 *   - Internal node `p` (in `[1, n)`) holds the fold of its subtree; its children
 *     are `_t[2p]` and `_t[2p + 1]`, so `_t[1]` is the fold of the whole array.
 *
 * The two hot walks:
 *   - `update(i, value)` sets leaf `_t[n + i] = value`, then climbs to the root
 *     recomputing each ancestor `_t[p] = fold(_t[2p], _t[2p+1])` -- one write per
 *     level, `<= log2(n)` levels.
 *   - `query(lo, hi)` walks the two boundary indices UP the tree
 *     (`l = n + lo`, `r = n + hi + 1`), folding in each node that lies fully
 *     inside `[lo, hi]` as the boundaries ascend -- `<= 2 * log2(n)` folds.
 *
 * RISK (recorded in decisions/0005-segtree.md, D-05): the iterative 2n layout is
 * ORDER-AGNOSTIC -- `query` mixes left- and right-boundary contributions into one
 * accumulator, so it is correct ONLY because min / max / sum / gcd are all
 * COMMUTATIVE as well as associative. A future NON-commutative fold (matrix
 * product, string concat) must NOT reuse this layout; it belongs on a pow2
 * layout with separate left/right accumulators combined in order.
 *
 * Identity (the trap): the fold's identity fills query accumulators and cleared /
 * fresh leaves -- sum -> 0, min -> +Infinity, max -> -Infinity, gcd -> 0. Identity
 * is a legal RESULT (a cleared min tree queries to +Infinity) but NEVER a legal
 * INPUT: the value door still rejects user NaN / +-Infinity (and, for the `gcd`
 * kind, any negative or non-integer value), typeof-guarded BEFORE coercion. Fixed
 * capacity: `length` is frozen at construction; every out-of-range index and
 * every non-finite (or out-of-domain gcd) value is a hard `[lite-logn]` throw.
 */
export class SegmentTree {
    /**
     * @param {number} length            exact element count; integer in [1, 2^30-1].
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold.
     */
    constructor(length, kind) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof length !== 'number' || !Number.isInteger(length) ||
            length < 1 || length > SEGTREE_MAX) {
            throw new RangeError(
                '[lite-logn] SegmentTree length must be an integer in [1, 2^30-1], got ' +
                String(length));
        }
        const k = kind === 'min' ? 0 : kind === 'max' ? 1 : kind === 'sum' ? 2 :
            kind === 'gcd' ? 3 : -1;
        if (k === -1) {
            throw new RangeError(
                '[lite-logn] SegmentTree kind must be "min", "max", "sum" or "gcd", got ' +
                String(kind));
        }
        this._n = length;                        // element count (fixed)
        this._k = k;                             // ctor-frozen fold: 0 min 1 max 2 sum 3 gcd
        this._idv = k === 0 ? Infinity : k === 1 ? -Infinity : 0; // fold identity
        this._t = new Float64Array(2 * length);  // _t[0] unused; leaves at n..2n-1
        if (this._idv !== 0) this._t.fill(this._idv); // sum/gcd identity is 0 already
    }

    /** Element count this tree was sized for. O(1). */
    get length() { return this._n; }

    /** The frozen associative fold, 'min' | 'max' | 'sum' | 'gcd'. O(1). */
    get kind() {
        const k = this._k;
        return k === 0 ? 'min' : k === 1 ? 'max' : k === 2 ? 'sum' : 'gcd';
    }

    /**
     * The folded value over `[lo, hi]` INCLUSIVE on both ends. O(log n): walk the
     * two boundaries up the tree, folding each node that lies fully inside the
     * range into a single accumulator (started at the fold identity). Fails closed:
     * out-of-range `lo` or `hi`, or `lo > hi`, each throw `[lite-logn]` (matching
     * Fenwick.rangeSum). A one-element range `lo == hi` returns that leaf's value.
     * @param {number} lo  integer in [0, length)
     * @param {number} hi  integer in [lo, length)
     * @returns {number} the fold over `[lo, hi]` (always folds at least one leaf)
     */
    query(lo, hi) {
        const n = this._n;
        if (typeof lo !== 'number' || !Number.isInteger(lo) || lo < 0 || lo >= n) {
            return this._badRange(lo, hi);
        }
        if (typeof hi !== 'number' || !Number.isInteger(hi) || hi < 0 || hi >= n) {
            return this._badRange(lo, hi);
        }
        if (lo > hi) return this._badRange(lo, hi);
        const t = this._t, k = this._k;
        let res = this._idv;
        // Order-agnostic fold (correct because the fold is commutative -- D-05).
        for (let l = n + lo, r = n + hi + 1; l < r; l >>= 1, r >>= 1) {
            if (l & 1) {
                const v = t[l++];
                res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) :
                    k === 2 ? res + v : segGcd(res, v);
            }
            if (r & 1) {
                const v = t[--r];
                res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) :
                    k === 2 ? res + v : segGcd(res, v);
            }
        }
        return res;
    }

    /**
     * Set the element at 0-based leaf `i` to `value` (ABSOLUTE), then fix every
     * ancestor by recomputing its fold. O(log n): one leaf write plus one write
     * per level up to the root. Fails closed: a non-finite value (typeof-guarded
     * first), a gcd-kind value that is negative or non-integer, or an out-of-range
     * index each throw `[lite-logn]` as a no-op.
     * @param {number} i      integer in [0, length)
     * @param {number} value  a finite number (nonnegative integer for the gcd kind)
     * @returns {this}
     */
    update(i, value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (this._k === 3 && (!Number.isInteger(value) || value < 0)) return this._badGcdValue(value);
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        const t = this._t, k = this._k;
        let p = this._n + i;
        t[p] = value;
        for (p >>= 1; p >= 1; p >>= 1) {
            const c = p << 1;                    // left child; right is c + 1
            const a = t[c], b = t[c + 1];
            t[p] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) :
                k === 2 ? a + b : segGcd(a, b);
        }
        return this;
    }

    /**
     * The single element at 0-based leaf `i` (the stored leaf value). O(1). An
     * out-of-range index throws `[lite-logn]`.
     * @param {number} i  integer in [0, length)
     * @returns {number}
     */
    at(i) {
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        return this._t[this._n + i];
    }

    /**
     * Reset every element to the fold identity in place, keeping the fixed
     * capacity. O(n) cold path. Because `fold(identity, identity) === identity`,
     * filling the WHOLE backing array (leaves and internal nodes alike) with the
     * identity leaves a fully-consistent tree -- a query returns the identity.
     * @returns {this}
     */
    clear() {
        this._t.fill(this._idv);
        return this;
    }

    /**
     * Visit every element as `(value, index, tree)` for index in `[0, length)`, in
     * ASCENDING leaf order. O(n) COLD scan, allocation-free in the loop body (pass
     * a hoisted callback).
     * @param {(value:number, index:number, tree:SegmentTree)=>void} fn
     */
    forEach(fn) {
        const t = this._t, n = this._n;
        for (let i = 0; i < n; i++) fn(t[n + i], i, this);
    }

    /**
     * O(n) bottom-up bulk build from `values` -- NOT n individual O(log n) updates.
     * Seed each leaf `_t[n + i] = values[i]`, then fold every internal node once,
     * deepest-first (`p` from `n - 1` down to `1`): `_t[p] = fold(_t[2p],
     * _t[2p+1])`. COLD path; fails closed on a non-array-like `values`, any
     * non-finite entry, or (gcd kind) any negative / non-integer entry before the
     * tree is usable. `length` and `kind` are validated by the delegated ctor.
     * @param {ArrayLike<number>} values      finite numbers; length in [1, 2^30-1]
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold
     * @returns {SegmentTree}
     */
    static build(values, kind) {
        if (values == null || typeof values.length !== 'number') {
            throw new TypeError('[lite-logn] SegmentTree.build needs an array-like of finite numbers');
        }
        const length = values.length;
        const st = new SegmentTree(length, kind);  // validates length in [1, 2^30-1] + kind
        const t = st._t, n = st._n, k = st._k;
        const gcdKind = k === 3;
        for (let i = 0; i < length; i++) {
            const v = values[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new TypeError(
                    '[lite-logn] SegmentTree.build value must be a finite number, got ' + String(v));
            }
            if (gcdKind && (!Number.isInteger(v) || v < 0)) {
                throw new RangeError(
                    '[lite-logn] SegmentTree.build gcd value must be a nonnegative integer, got ' +
                    String(v));
            }
            t[n + i] = v;                          // seed the leaf
        }
        // Fold every internal node once, deepest-first -- O(n), not n * O(log n).
        for (let p = n - 1; p >= 1; p--) {
            const c = p << 1;
            const a = t[c], b = t[c + 1];
            t[p] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) :
                k === 2 ? a + b : segGcd(a, b);
        }
        return st;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ---

    /** @private */
    _badIndex(i) {
        throw new RangeError(
            '[lite-logn] SegmentTree index must be an integer in [0, ' + this._n + '), got ' +
            String(i));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] SegmentTree query needs integers 0 <= lo <= hi < ' + this._n +
            ', got lo=' + String(lo) + ' hi=' + String(hi));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] SegmentTree value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badGcdValue(value) {
        throw new RangeError(
            '[lite-logn] SegmentTree gcd value must be a nonnegative integer, got ' + String(value));
    }
}

/**
 * Advance a 32-bit Numerical-Recipes LCG one step: `s' = (s*1664525 + 1013904223)
 * mod 2^32`, kept as a SIGNED int32. The repo's single PRNG -- deterministic,
 * instance-local, no Math.random, no module state, no new generator. Two integer
 * disciplines keep it zero-alloc:
 *   - `Math.imul` does the multiply as a 32-bit integer op (the low 32 bits of the
 *     product), so no large intermediate double is ever formed (`s * 1664525` would
 *     reach ~7.1e15); and
 *   - the result is folded with `| 0` (a SIGNED int32), NOT `>>> 0`: a `>>> 0`
 *     Uint32 exceeds the Smi range (2^31) about half the time and would box as a
 *     transient HeapNumber every step (the perf-gate scavenge counter catches it),
 *     whereas an `| 0` signed int32 always stays an unboxed Smi.
 * The 32-BIT WORD is identical either way, so the sequence is unchanged: `Math.imul`
 * gives the same low 32 bits as the plain multiply, and mod-2^32 addition is
 * sign-agnostic. SkipList draws a node level from the HIGH bits via `Math.clz32`,
 * which does ToUint32 internally -- so the signed int32 and its Uint32 twin yield
 * the IDENTICAL level. The LOW bits of any power-of-two-modulus LCG are periodic
 * (here the lowest bit strictly alternates, since a is odd and c is odd), so
 * counting halvings from the low end would be non-random -- the high bits are the
 * well-mixed ones.
 * @param {number} s current state, a signed 32-bit integer
 * @returns {number} the next state, a signed 32-bit integer (same 32-bit word)
 */
function _lcgNext(s) {
    return (Math.imul(s, 1664525) + 1013904223) | 0;
}

/** SkipList tower-height ceiling: at most this many parallel `_next` columns. */
const SL_MAXLEVEL = 32;

/**
 * Column count actually allocated for a `capacity`-slot SkipList: `ceil(log2 cap)`
 * plus one column of headroom for the geometric tail, clamped to SL_MAXLEVEL.
 * Fixed at construction so `_next` NEVER reallocates -- the memory risk (a full
 * cap * 32 column set) is avoided by sizing to the capacity's real need, and level
 * generation clamps to it, so there is no lazy grow to threaten the 0-B/op gate
 * (decisions/0006-skiplist.md). The clamp only ever bites the extreme geometric
 * tail (probability ~ 2^-log2(cap)), which cannot change ordering or membership --
 * a node merely stops gaining express lanes above the ceiling.
 * @param {number} capacity data-slot count
 * @returns {number} column count in [1, SL_MAXLEVEL]
 */
function _levelCap(capacity) {
    let l = 1;
    while ((1 << l) < capacity && l < SL_MAXLEVEL) l++;
    l += 1; // one column of headroom above ceil(log2 cap)
    return l > SL_MAXLEVEL ? SL_MAXLEVEL : l;
}

/** SkipList default PRNG seed when the caller does not supply one. */
const SL_DEFAULT_SEED = 0x9E3779B9;

/**
 * A private, pointer-free slot allocator: a free-list (a LIFO free-stack over a
 * `Uint32Array`) that hands out a slot INDEX in [1, capacity] rather than a heap
 * object, so nothing is collected per insert. `NIL = 0`; slot 0 is RESERVED (the
 * SkipList head sentinel) and is never allocatable. `alloc()` returns 0 when the
 * pool is exhausted so the caller can fail closed. The conservation invariant
 * `activeSlots + freeListLength === capacity` holds after every operation.
 *
 * D-01 bind (decisions/0006-skiplist.md): this is DESIGN-PARITY with
 * `@zakkster/lite-o1`'s private pools (FreqO1 / BucketQueue / TimerWheel) and its
 * deferred `SlotPool` -- the identical free-list contract (allocate an index,
 * `NIL = 0`, slot 0 reserved) and the same conservation invariant -- NOT shared
 * code. A runtime dependency on lite-o1 was REJECTED: the suite's zero-runtime-deps
 * law forbids it, and lite-o1's `SlotPool` was never made public. Shaped so a later
 * pointer member (Treap) can reuse it, without over-engineering it now.
 */
class NodePool {
    /** @param {number} capacity allocatable data-slot count (excludes slot 0). */
    constructor(capacity) {
        this._cap = capacity;
        this._free = new Uint32Array(capacity);      // free-stack of slot indices
        this._freeLen = capacity;
        for (let i = 0; i < capacity; i++) this._free[i] = capacity - i; // top = slot 1
        this._active = 0;
    }

    /** Allocatable data-slot count (excludes the reserved slot 0). O(1). */
    get capacity() { return this._cap; }
    /** Slots currently handed out and not yet freed. O(1). */
    get activeSlots() { return this._active; }
    /** Slots currently on the free-stack. O(1). */
    get freeListLength() { return this._freeLen; }

    /**
     * Hand out a free slot INDEX in [1, capacity], or 0 (NIL) if exhausted. O(1),
     * zero allocation.
     * @returns {number}
     */
    alloc() {
        const n = this._freeLen;
        if (n === 0) return 0;                       // NIL: exhausted -> caller fails closed
        const slot = this._free[n - 1];
        this._freeLen = n - 1;
        this._active++;
        return slot;
    }

    /**
     * Return a slot INDEX to the free-stack. O(1), zero allocation. The caller owns
     * correctness: a slot must be live and freed at most once (the SkipList only
     * frees a node it just unlinked).
     * @param {number} slot a slot previously returned by alloc()
     */
    free(slot) {
        const n = this._freeLen;
        this._free[n] = slot;
        this._freeLen = n + 1;
        this._active--;
    }

    /** Reset to all-free (O(capacity) cold path), restoring the conservation invariant. */
    clear() {
        const cap = this._cap, free = this._free;
        for (let i = 0; i < cap; i++) free[i] = cap - i;
        this._freeLen = cap;
        this._active = 0;
    }
}

/**
 * Max SkipList capacity: `0x03FFFFFF` (2^26 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns, so an index must fit an unsigned
 * 32-bit word; `NIL = 0` reserves slot 0 as the head sentinel, so live slots run
 * [1, capacity]. The backing `_next` is a SINGLE flat `Uint32Array` of
 * `columns * (capacity + 1)` cells, stride-indexed `lvl*(capacity + 1) + slot`; the
 * 2^26 ceiling keeps `columns * (capacity + 1)` an addressable typed-array length
 * (at most ~27 columns for the largest capacity) and every stride offset an exact
 * integer. The index arithmetic (Uint32 slot indices + `NIL = 0` + the MAXLEVEL
 * column width), not the byte count, is the hard ceiling -- the same "the
 * arithmetic caps it" reasoning as the array-embedded members, one column-set wider.
 */
const SL_MAX_CAPACITY = 0x03FFFFFF; // 2^26 - 1

/**
 * A SKIP LIST: a pointer-free ordered map (key -> value) whose get / set / delete /
 * successor / predecessor are EXPECTED O(log n) via a probabilistic tower of
 * forward links -- the family's first randomized member and its first pointer-based
 * one. Where BinaryHeap / Fenwick / SegmentTree embed a FIXED-shape tree in index
 * arithmetic, a skip list's shape is random, so it needs real per-node links; the
 * trick that keeps it zero-GC is storing those links as slot INDICES in flat
 * `Uint32Array` columns over a private free-list (NodePool), never as heap objects.
 *
 * Storage (allocated once, sized to capacity):
 *   - `_key` / `_val` `Float64Array(capacity + 1)` -- key and value at each slot.
 *   - `_next` a SINGLE flat `Uint32Array(columns * (capacity + 1))`, stride-indexed
 *     `lvl*(capacity + 1) + slot`: the forward link of `slot` at level `lvl`, or
 *     `NIL = 0` for end-of-list. Slot 0 is the HEAD sentinel (its links are the
 *     first node at each level); no real node's link ever points AT the head, so a
 *     link value of 0 unambiguously means NIL.
 *   - `_pool` NodePool -- the free-list handing out slot indices [1, capacity].
 *   - `_update` `Uint32Array(columns)` -- reused predecessor scratch for the ONE
 *     structural descent (`_find`); preallocated so set / delete allocate nothing.
 *
 * Level generation is one LCG step (the repo's NR generator) whose HIGH bits pick a
 * geometric height: `level = 1 + clz32(word)`, clamped to the allocated column
 * count (the low bits of a power-of-two LCG are periodic -- see `_lcgNext`). The
 * seed is instance-local, so a fixed seed replays an IDENTICAL structure and a
 * different seed diverges -- deterministic, never Math.random.
 *
 * Honesty (randomized member): a hot op is EXPECTED O(log n), not worst-case. An
 * unlucky seed can build a tall thin tower and spike a single op; the witness prints
 * that MAX single-op alongside the fitted line so the expectation never masquerades
 * as a worst-case guarantee (decisions/0006-skiplist.md).
 *
 * Keys are FINITE numbers (typeof-guarded BEFORE coercion -- Symbol / BigInt / NaN /
 * +-Infinity fail closed with a `[lite-logn]` throw); values are Float64 (zero-GC).
 * `set` on an EXISTING key updates its value in place (no new node). An empty or
 * missing query returns `undefined` (never throws). Fixed capacity: a full pool
 * throws, never silently drops. `rangeIter` is a VERSION-STAMPED iterator -- any
 * structural mutation mid-iteration throws `[lite-logn]` rather than yield garbage.
 */
export class SkipList {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^26-1].
     * @param {number} [seed]    PRNG seed; unsigned 32-bit integer (default fixed).
     */
    constructor(capacity, seed) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > SL_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] SkipList capacity must be an integer in [1, 2^26-1], got ' +
                String(capacity));
        }
        let s;
        if (seed === undefined) {
            s = SL_DEFAULT_SEED;
        } else if (typeof seed !== 'number' || !Number.isInteger(seed) ||
            seed < 0 || seed > 0xFFFFFFFF) {
            throw new RangeError(
                '[lite-logn] SkipList seed must be an unsigned 32-bit integer, got ' +
                String(seed));
        } else {
            s = seed >>> 0;
        }
        s = s | 0; // store the LCG state as a SIGNED int32 (an unboxed Smi) -- see _lcgNext
        const cols = _levelCap(capacity);
        this._cap = capacity;                        // max live entries
        this._stride = capacity + 1;                 // slots 0..capacity (0 = head)
        this._maxLevel = cols;                       // allocated column count
        this._key = new Float64Array(capacity + 1);  // key at each slot
        this._val = new Float64Array(capacity + 1);  // value at each slot
        this._next = new Uint32Array(cols * (capacity + 1)); // links; all NIL (0)
        this._update = new Uint32Array(cols);        // reused predecessor scratch
        this._pool = new NodePool(capacity);         // free-list over slots [1, capacity]
        this._level = 1;                             // current live tower height
        this._size = 0;                              // live entries
        this._version = 0;                           // iterator invalidation stamp
        this._seed0 = s;                             // initial seed (clear resets to it)
        this._seed = s;                              // live LCG state
    }

    /** Live entry count. O(1). */
    get size() { return this._size; }

    /** The fixed capacity this list was sized for. O(1). */
    get capacity() { return this._cap; }

    /**
     * The value stored under `key`, or `undefined` if absent (never throws on a
     * missing / empty query). EXPECTED O(log n): a top-down descent that at each
     * level advances while the next key is strictly less than `key`. Fails closed:
     * a non-number / non-finite key (typeof-guarded first) throws `[lite-logn]`.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    get(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const next = this._next, K = this._key, stride = this._stride;
        let slot = 0; // head
        for (let lvl = this._level - 1; lvl >= 0; lvl--) {
            const base = lvl * stride;
            let nx = next[base + slot];
            while (nx !== 0 && K[nx] < key) { slot = nx; nx = next[base + slot]; }
        }
        const cand = next[slot]; // level-0 next (base 0)
        return (cand !== 0 && K[cand] === key) ? this._val[cand] : undefined;
    }

    /**
     * Insert `key -> value`, or UPDATE the value in place if `key` already exists
     * (no new node). EXPECTED O(log n). Fails closed: a non-finite key or value
     * (typeof-guarded first), or a full pool, each throw `[lite-logn]` as a no-op.
     * @param {number} key    a finite number
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(key, value) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        const cand = this._find(key); // fills _update with per-level predecessors
        const K = this._key;
        if (cand !== 0 && K[cand] === key) { // existing key: update value in place
            this._val[cand] = value;
            this._version = (this._version + 1) | 0;
            return this;
        }
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        // One LCG step; HIGH bits pick a geometric height, clamped to the columns.
        const word = this._seed = _lcgNext(this._seed);
        let nl = 1 + Math.clz32(word);
        if (nl > this._maxLevel) nl = this._maxLevel;
        const upd = this._update, next = this._next, stride = this._stride;
        if (nl > this._level) {
            for (let lvl = this._level; lvl < nl; lvl++) upd[lvl] = 0; // head is predecessor
            this._level = nl;
        }
        K[slot] = key;
        this._val[slot] = value;
        for (let lvl = 0; lvl < nl; lvl++) {
            const base = lvl * stride;
            const p = upd[lvl];
            next[base + slot] = next[base + p]; // splice slot after predecessor p
            next[base + p] = slot;
        }
        this._size++;
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * Remove `key`. EXPECTED O(log n). Idempotent: returns `false` if `key` is
     * absent (no throw), `true` if it was present and removed. Fails closed on a
     * non-finite key (typeof-guarded first) with a `[lite-logn]` throw.
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    delete(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const cand = this._find(key); // fills _update
        const K = this._key;
        if (cand === 0 || K[cand] !== key) return false; // absent (no throw)
        const next = this._next, stride = this._stride, upd = this._update;
        for (let lvl = 0; lvl < this._level; lvl++) {
            const base = lvl * stride;
            const p = upd[lvl];
            if (next[base + p] === cand) next[base + p] = next[base + cand];
        }
        // Shrink the live height while the top levels are empty (head link == NIL).
        let lv = this._level;
        while (lv > 1 && next[(lv - 1) * stride] === 0) lv--;
        this._level = lv;
        this._pool.free(cand);
        this._size--;
        this._version = (this._version + 1) | 0;
        return true;
    }

    /**
     * The smallest key STRICTLY greater than `key`, or `undefined` if none. EXPECTED
     * O(log n). `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    successor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const next = this._next, K = this._key, stride = this._stride;
        let slot = 0;
        for (let lvl = this._level - 1; lvl >= 0; lvl--) {
            const base = lvl * stride;
            let nx = next[base + slot];
            while (nx !== 0 && K[nx] <= key) { slot = nx; nx = next[base + slot]; }
        }
        const cand = next[slot];
        return cand !== 0 ? K[cand] : undefined;
    }

    /**
     * The largest key STRICTLY less than `key`, or `undefined` if none. EXPECTED
     * O(log n). `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    predecessor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const next = this._next, K = this._key, stride = this._stride;
        let slot = 0;
        for (let lvl = this._level - 1; lvl >= 0; lvl--) {
            const base = lvl * stride;
            let nx = next[base + slot];
            while (nx !== 0 && K[nx] < key) { slot = nx; nx = next[base + slot]; }
        }
        return slot !== 0 ? K[slot] : undefined; // slot = largest key < key, or head
    }

    /**
     * A VERSION-STAMPED iterator over the keys in `[lo, hi]` INCLUSIVE, in ascending
     * order. Bounds may be any number INCLUDING +-Infinity (an unbounded end);
     * `NaN` (unordered) fails closed, as does `lo > hi`. The generator captures the
     * list's version and throws `[lite-logn]` if any STRUCTURAL mutation (set of a
     * new key, delete, clear -- or any value update) happens mid-iteration, rather
     * than yield stale / recycled data. The one documented per-protocol allocator
     * (a {value, done} per step); the loop body itself allocates nothing.
     * @param {number} lo  lower bound (inclusive); may be -Infinity
     * @param {number} hi  upper bound (inclusive); may be +Infinity
     * @returns {IterableIterator<number>} the keys in [lo, hi], ascending
     */
    rangeIter(lo, hi) {
        if (typeof lo !== 'number' || Number.isNaN(lo)) return this._badBound(lo);
        if (typeof hi !== 'number' || Number.isNaN(hi)) return this._badBound(hi);
        if (lo > hi) return this._badRange(lo, hi);
        return this._rangeGen(lo, hi);
    }

    /** @private version-stamped range generator (see rangeIter). */
    *_rangeGen(lo, hi) {
        const ver = this._version;
        const next = this._next, K = this._key, stride = this._stride;
        let slot = 0;
        for (let lvl = this._level - 1; lvl >= 0; lvl--) {
            const base = lvl * stride;
            let nx = next[base + slot];
            while (nx !== 0 && K[nx] < lo) { slot = nx; nx = next[base + slot]; }
        }
        slot = next[slot]; // first slot with key >= lo
        while (slot !== 0 && K[slot] <= hi) {
            if (this._version !== ver) {
                throw new Error('[lite-logn] SkipList mutated during iteration');
            }
            yield K[slot];
            slot = next[slot]; // level-0 next (base 0)
        }
    }

    /**
     * Visit every live `(key, value)` pair in ASCENDING key order. O(n) cold scan,
     * allocation-free in the loop body (pass a hoisted callback). Unlike rangeIter
     * this is NOT version-stamped -- mutating from within the callback is the
     * caller's responsibility (matching the other members' forEach).
     * @param {(key:number, value:number, list:SkipList)=>void} fn
     */
    forEach(fn) {
        const next = this._next, K = this._key, V = this._val;
        let slot = next[0]; // level-0 first (base 0, head)
        while (slot !== 0) {
            fn(K[slot], V[slot], this);
            slot = next[slot];
        }
    }

    /**
     * Empty the list, keeping the fixed capacity. O(capacity) cold path: returns
     * every node to the pool, points the head's links at NIL, resets the live
     * height, and restores the PRNG to its initial seed (a cleared list replays a
     * fresh one). @returns {this}
     */
    clear() {
        this._pool.clear();
        const next = this._next, stride = this._stride, cols = this._maxLevel;
        for (let lvl = 0; lvl < cols; lvl++) next[lvl * stride] = 0; // head links -> NIL
        this._level = 1;
        this._size = 0;
        this._seed = this._seed0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    // ---- private structural descent (hot body) -----------------------------

    /**
     * The ONE structural descent (set / delete): walk top-down, at each level
     * advancing while the next key is strictly less than `key`, recording the
     * predecessor per level in the reused `_update` scratch. Returns the level-0
     * candidate (first slot with key >= `key`, or NIL). Zero allocation.
     * @private
     */
    _find(key) {
        const next = this._next, K = this._key, stride = this._stride, upd = this._update;
        let slot = 0; // head
        for (let lvl = this._level - 1; lvl >= 0; lvl--) {
            const base = lvl * stride;
            let nx = next[base + slot];
            while (nx !== 0 && K[nx] < key) { slot = nx; nx = next[base + slot]; }
            upd[lvl] = slot;
        }
        return next[slot]; // level-0 next (base 0)
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] SkipList key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] SkipList value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badBound(b) {
        throw new TypeError(
            '[lite-logn] SkipList rangeIter bound must be a number (not NaN), got ' + String(b));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] SkipList rangeIter needs lo <= hi, got lo=' + String(lo) +
            ' hi=' + String(hi));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] SkipList full (capacity ' + this._cap + ')');
    }
}

// Treap (v0.5.0 session) -- an AUGMENTED randomized-balanced ordered map (BELOW).

/** Treap default PRNG seed when the caller does not supply one. */
const TR_DEFAULT_SEED = 0x9E3779B9;

/**
 * Max Treap capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns (`_left` / `_right`), and each subtree
 * count lives in a `Uint32Array` (`_size`); an index and a count must both fit an
 * unsigned 32-bit word. `NIL = 0` reserves slot 0 as the empty-subtree sentinel, so
 * live slots run [1, capacity]. The index / count arithmetic (Uint32 slot indices +
 * `NIL = 0` + Uint32 subtree sizes), not the byte count, is the hard ceiling -- the
 * same "the arithmetic caps it" reasoning as the array-embedded members.
 */
const TR_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A TREAP: a randomized, self-balancing BINARY SEARCH TREE that is ALSO an order-
 * statistic tree (an AUGMENTED ordered map key -> value). It is the family's second
 * randomized member and its second pointer-based one; where SkipList threads a
 * probabilistic tower of forward links, a treap keeps a single BST whose SHAPE is
 * randomized by a per-node priority, giving EXPECTED O(log n) height. The trick that
 * keeps it zero-GC is the SkipList one: nodes are slot INDICES in flat typed-array
 * columns over the same private free-list (NodePool), never heap objects.
 *
 * Two orders held at once (the treap invariant):
 *   - BST order on `_key` (an in-order walk is ascending by key); and
 *   - MAX-HEAP order on `_prio` (every parent's priority >= its children's), where
 *     `_prio` is one instance-local NR-LCG draw per inserted node. A random priority
 *     heap over a BST is provably balanced IN EXPECTATION.
 * The augmentation is a third invariant: `_size[x]` is the number of nodes in x's
 * subtree, maintained in the SAME pass as every link rewrite, so `rank` (how many
 * keys are < x) and `select` (the k-th smallest key) are O(log n) via subtree counts.
 *
 * Storage (allocated once, sized to capacity + 1; slot 0 is the NIL sentinel whose
 * `_size` is a permanent 0 -- null is not zero: slot 0 is "no subtree", never data):
 *   - `_key` / `_value` `Float64Array` -- key and value at each slot.
 *   - `_left` / `_right` `Uint32Array` -- child slot indices, `NIL = 0`.
 *   - `_prio` `Uint32Array` -- the random heap priority at each slot.
 *   - `_size` `Uint32Array` -- the subtree node count at each slot.
 *   - `_pool` NodePool -- the free-list handing out slot indices [1, capacity].
 *
 * Honesty (randomized member): a hot op is EXPECTED O(log n), not worst-case -- the
 * same contract as SkipList. An unlucky priority draw can build a tall thin tree and
 * spike a single op; the MAX single insert (the rotation chain) is DISCLOSED, never
 * gated (decisions/0007-treap.md, D-06). RECURSION DEPTH: `set` / `delete` / `split`
 * / `merge` recurse over slot indices; the recursion depth equals the tree height,
 * which is O(log n) EXPECTED and O(n) worst-case on a pathological priority draw.
 * Because priorities come from the instance-local LCG (NOT caller-controlled), an
 * adversary cannot force the worst case with chosen keys, so the expected bound holds
 * for the fixed public surface -- this matches the EXPECTED contract and is DISCLOSED
 * here + in the ADR, not silently shipped. The recursion uses the native call stack,
 * not the GC heap, so every hot op is still 0 B/op.
 *
 * Keys and values are FINITE numbers (typeof-guarded BEFORE coercion -- Symbol /
 * BigInt / NaN / +-Infinity fail closed with a `[lite-logn]` throw). `set` on an
 * EXISTING key updates its value in place (no new node). A missing / empty query
 * returns `undefined` (never throws). Fixed capacity: a full pool throws, never
 * silently drops. `rangeIter` is a VERSION-STAMPED iterator -- any structural OR
 * value mutation mid-iteration throws `[lite-logn]` rather than yield stale data.
 *
 * `split` / `merge` are O(log n) EXPECTED because they REWIRE nodes in place rather
 * than copy: the two treaps a `split` returns (and the two a `merge` consumes) SHARE
 * the source's backing arena (columns + free-list). `split` and `merge` therefore
 * CONSUME their inputs (leaving them empty) and hand back views over the same store
 * -- the only way to keep the structural ops sub-linear under a pooled allocator.
 */
export class Treap {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^31-1].
     * @param {number} [seed]    PRNG seed; unsigned 32-bit integer (default fixed).
     */
    constructor(capacity, seed) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > TR_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] Treap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        let s;
        if (seed === undefined) {
            s = TR_DEFAULT_SEED;
        } else if (typeof seed !== 'number' || !Number.isInteger(seed) ||
            seed < 0 || seed > 0xFFFFFFFF) {
            throw new RangeError(
                '[lite-logn] Treap seed must be an unsigned 32-bit integer, got ' +
                String(seed));
        } else {
            s = seed >>> 0;
        }
        s = s | 0; // store the LCG state as a SIGNED int32 (an unboxed Smi) -- see _lcgNext
        this._cap = capacity;                         // max live entries
        this._key = new Float64Array(capacity + 1);   // key at each slot
        this._value = new Float64Array(capacity + 1); // value at each slot
        this._left = new Uint32Array(capacity + 1);   // left child slot; NIL = 0
        this._right = new Uint32Array(capacity + 1);  // right child slot; NIL = 0
        this._prio = new Uint32Array(capacity + 1);   // random heap priority
        this._size = new Uint32Array(capacity + 1);   // subtree node count; _size[0] = 0
        this._pool = new NodePool(capacity);          // free-list over slots [1, capacity]
        this._root = 0;                               // NIL == empty tree
        this._seed0 = s;                              // initial seed (clear resets to it)
        this._seed = s;                               // live LCG state
        this._version = 0;                            // iterator invalidation stamp
        this._sr = 0;                                 // split scratch (the "right" root)
    }

    /** Live entry count. O(1) (the root subtree count). */
    get size() { return this._root === 0 ? 0 : this._size[this._root]; }

    /** The fixed capacity this treap was sized for. O(1). */
    get capacity() { return this._cap; }

    /**
     * The value stored under `key`, or `undefined` if absent (never throws on a
     * missing / empty query). EXPECTED O(log n): a plain BST descent. Fails closed on
     * a non-number / non-finite key (typeof-guarded first) with a `[lite-logn]` throw.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    get(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else return this._value[t];
        }
        return undefined;
    }

    /**
     * True iff `key` is currently in the treap. EXPECTED O(log n). Fails closed on a
     * non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    has(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else return true;
        }
        return false;
    }

    /**
     * Insert `key -> value`, or UPDATE the value in place if `key` already exists (no
     * new node). EXPECTED O(log n): a descent to check membership, then (on insert) a
     * recursive splice that rotates the new node up until heap order is restored,
     * fixing `_size` on the unwind. Fails closed: a non-finite key or value
     * (typeof-guarded first), or a full pool, each throw `[lite-logn]` as a no-op.
     * @param {number} key    a finite number
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(key, value) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root;
        while (t !== 0) { // update in place if present -- no new node, no rebalance
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else { this._value[t] = value; this._version = (this._version + 1) | 0; return this; }
        }
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        K[slot] = key;
        this._value[slot] = value;
        L[slot] = 0; R[slot] = 0;
        this._size[slot] = 1;
        this._seed = _lcgNext(this._seed);
        this._prio[slot] = this._seed; // stored unsigned in the Uint32 column
        this._root = this._insert(this._root, slot);
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * Remove `key`. EXPECTED O(log n). Idempotent: returns `false` if `key` is absent
     * (no throw), `true` if it was present and removed. Deletion MERGES the removed
     * node's two subtrees (priority-ordered) then frees its slot, fixing `_size` on
     * the unwind. Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    delete(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, found = false;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else { found = true; break; }
        }
        if (!found) return false; // absent (no throw)
        this._root = this._delete(this._root, key);
        this._version = (this._version + 1) | 0;
        return true;
    }

    /**
     * The number of stored keys STRICTLY LESS than `x` (its rank / position). EXPECTED
     * O(log n) via subtree counts: at each node, when the node's key is < `x`, its
     * whole left subtree plus itself precede `x`. `x` need not be present; `rank` of
     * the smallest key is 0, of a key past the max is `size`. Fails closed on a
     * non-finite `x`.
     * @param {number} x  a finite number
     * @returns {number} count of keys < x, in [0, size]
     */
    rank(x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return this._badKey(x);
        const L = this._left, R = this._right, K = this._key, S = this._size;
        let t = this._root, r = 0;
        while (t !== 0) {
            if (x <= K[t]) t = L[t];              // t (and its right) are >= x
            else { r += S[L[t]] + 1; t = R[t]; }  // t's left subtree + t precede x
        }
        return r;
    }

    /**
     * The k-th smallest KEY (0-based order statistic), or `undefined` if `k` is out of
     * range [0, size). EXPECTED O(log n) via subtree counts. Fails closed on a
     * non-integer `k` (typeof-guarded first); an in-type out-of-range `k` returns
     * `undefined` (matching the soft-miss of `get`).
     * @param {number} k  integer in [0, size)
     * @returns {number|undefined} the k-th smallest key
     */
    select(k) {
        if (typeof k !== 'number' || !Number.isInteger(k)) return this._badRank(k);
        if (k < 0 || k >= this.size) return undefined;
        const L = this._left, R = this._right, K = this._key, S = this._size;
        let t = this._root;
        for (;;) {
            const ls = S[L[t]];
            if (k < ls) t = L[t];
            else if (k > ls) { k -= ls + 1; t = R[t]; }
            else return K[t];
        }
    }

    /**
     * The smallest key STRICTLY greater than `key`, or `undefined` if none. EXPECTED
     * O(log n). `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    successor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] > key) { best = K[t]; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    /**
     * The largest key STRICTLY less than `key`, or `undefined` if none. EXPECTED
     * O(log n). `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    predecessor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] < key) { best = K[t]; t = R[t]; }
            else t = L[t];
        }
        return best;
    }

    /**
     * A VERSION-STAMPED iterator over the keys in `[lo, hi]` INCLUSIVE, ascending.
     * Bounds may be any number INCLUDING +-Infinity (an unbounded end); `NaN` fails
     * closed, as does `lo > hi`. The generator captures the treap's version and throws
     * `[lite-logn]` if any STRUCTURAL or VALUE mutation happens mid-iteration, rather
     * than yield stale data. It walks by repeated `successor` (each step a fresh
     * O(log n) descent, so NO scratch stack is allocated); the one documented per-
     * protocol allocator is the {value, done} per step.
     * @param {number} lo  lower bound (inclusive); may be -Infinity
     * @param {number} hi  upper bound (inclusive); may be +Infinity
     * @returns {IterableIterator<number>} the keys in [lo, hi], ascending
     */
    rangeIter(lo, hi) {
        if (typeof lo !== 'number' || Number.isNaN(lo)) return this._badBound(lo);
        if (typeof hi !== 'number' || Number.isNaN(hi)) return this._badBound(hi);
        if (lo > hi) return this._badRange(lo, hi);
        return this._rangeGen(lo, hi);
    }

    /** @private version-stamped range generator (see rangeIter). */
    *_rangeGen(lo, hi) {
        const ver = this._version;
        let cur = this._ceil(lo); // smallest key >= lo, or undefined
        while (cur !== undefined && cur <= hi) {
            if (this._version !== ver) {
                throw new Error('[lite-logn] Treap mutated during iteration');
            }
            yield cur;
            cur = this.successor(cur);
        }
    }

    /**
     * Visit every live `(key, value)` pair in ASCENDING key order. O(n) cold in-order
     * walk (recursion depth = tree height), allocation-free in the loop body (pass a
     * hoisted callback). Unlike rangeIter this is NOT version-stamped -- mutating from
     * within the callback is the caller's responsibility (matching the other members).
     * @param {(key:number, value:number, treap:Treap)=>void} fn
     */
    forEach(fn) {
        this._forEach(this._root, fn);
    }

    /** @private recursive in-order walk. */
    _forEach(t, fn) {
        if (t === 0) return;
        this._forEach(this._left[t], fn);
        fn(this._key[t], this._value[t], this);
        this._forEach(this._right[t], fn);
    }

    /**
     * Empty the treap, keeping the fixed capacity. O(capacity) cold path: returns
     * every node to the pool, points the root at NIL, and restores the PRNG to its
     * initial seed (a cleared treap replays a fresh one). @returns {this}
     */
    clear() {
        this._pool.clear();
        this._root = 0;
        this._seed = this._seed0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * SPLIT `this` at `key` into two treaps: `[left, right]` where `left` holds every
     * key STRICTLY LESS than `key` and `right` holds every key >= `key`. EXPECTED
     * O(log n) -- it REWIRES nodes in place (no copy), so the returned treaps SHARE
     * this treap's backing arena, and `this` is CONSUMED (left empty). Fails closed on
     * a non-finite key.
     * @param {number} key  a finite number
     * @returns {[Treap, Treap]}  [keys < key, keys >= key]
     */
    split(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const l = this._split(this._root, key);
        const r = this._sr;
        const left = Treap._view(this, l);
        const right = Treap._view(this, r);
        this._root = 0; // consumed: its nodes now belong to left / right
        this._version = (this._version + 1) | 0;
        return [left, right];
    }

    /**
     * MERGE two treaps `a` and `b` -- where EVERY key of `a` is STRICTLY LESS than
     * every key of `b` -- into one, returning it. EXPECTED O(log n): it rewires nodes
     * in place, so `a` and `b` MUST share a backing arena (i.e. both came from a prior
     * `split`), and BOTH are CONSUMED. Fails closed: non-Treap inputs, treaps from
     * different arenas, or an overlapping key range each throw `[lite-logn]`.
     * @param {Treap} a  all keys strictly less than every key of b
     * @param {Treap} b  all keys strictly greater than every key of a
     * @returns {Treap}
     */
    static merge(a, b) {
        if (!(a instanceof Treap) || !(b instanceof Treap)) {
            throw new TypeError('[lite-logn] Treap.merge needs two Treap instances');
        }
        if (a._key !== b._key) {
            throw new Error(
                '[lite-logn] Treap.merge requires two treaps sharing an arena (from the same split)');
        }
        if (a._root !== 0 && b._root !== 0) {
            let m = a._root; while (a._right[m] !== 0) m = a._right[m]; // max key of a
            let n = b._root; while (b._left[n] !== 0) n = b._left[n];   // min key of b
            if (a._key[m] >= b._key[n]) {
                throw new Error(
                    '[lite-logn] Treap.merge requires all keys of a < all keys of b');
            }
        }
        const root = a._merge(a._root, b._root);
        const out = Treap._view(a, root);
        a._root = 0; b._root = 0; // both consumed
        a._version = (a._version + 1) | 0;
        b._version = (b._version + 1) | 0;
        return out;
    }

    // ---- private rotations + recursive structure (hot bodies) ---------------

    /**
     * @private true iff node `a` outranks node `b` in the priority MAX-heap. Priority
     * ties (astronomically rare across 32-bit LCG draws) break by key, so the tree
     * shape is a deterministic function of the (key, priority) set -- never ambiguous.
     */
    _higher(a, b) {
        const pa = this._prio[a], pb = this._prio[b];
        return pa > pb || (pa === pb && this._key[a] < this._key[b]);
    }

    /**
     * @private right rotation: `y`'s left child `x` becomes the subtree root. Rewrites
     * two child links and recomputes the two affected `_size` cells. Returns `x`.
     */
    _rotR(y) {
        const L = this._left, R = this._right, S = this._size;
        const x = L[y];
        L[y] = R[x];
        R[x] = y;
        S[y] = S[L[y]] + S[R[y]] + 1;
        S[x] = S[L[x]] + S[R[x]] + 1;
        return x;
    }

    /**
     * @private left rotation: `y`'s right child `x` becomes the subtree root. Rewrites
     * two child links and recomputes the two affected `_size` cells. Returns `x`.
     */
    _rotL(y) {
        const L = this._left, R = this._right, S = this._size;
        const x = R[y];
        R[y] = L[x];
        L[x] = y;
        S[y] = S[L[y]] + S[R[y]] + 1;
        S[x] = S[L[x]] + S[R[x]] + 1;
        return x;
    }

    /** @private recursive BST insert of leaf slot `s`, rotating up to fix heap order. */
    _insert(t, s) {
        if (t === 0) return s; // s already has size 1, NIL children, its priority set
        const L = this._left, R = this._right, S = this._size, K = this._key;
        if (K[s] < K[t]) {
            L[t] = this._insert(L[t], s);
            S[t] = S[L[t]] + S[R[t]] + 1;
            if (this._higher(L[t], t)) return this._rotR(t);
        } else {
            R[t] = this._insert(R[t], s);
            S[t] = S[L[t]] + S[R[t]] + 1;
            if (this._higher(R[t], t)) return this._rotL(t);
        }
        return t;
    }

    /** @private recursive delete of `key` from subtree `t`; frees the removed slot. */
    _delete(t, key) {
        const L = this._left, R = this._right, S = this._size, K = this._key;
        if (key < K[t]) {
            L[t] = this._delete(L[t], key);
            S[t] = S[L[t]] + S[R[t]] + 1;
            return t;
        }
        if (key > K[t]) {
            R[t] = this._delete(R[t], key);
            S[t] = S[L[t]] + S[R[t]] + 1;
            return t;
        }
        const merged = this._merge(L[t], R[t]); // t removed: fuse its two subtrees
        this._pool.free(t);
        return merged;
    }

    /** @private recursive priority merge of two subtrees (all keys in a < all in b). */
    _merge(a, b) {
        if (a === 0) return b;
        if (b === 0) return a;
        const L = this._left, R = this._right, S = this._size;
        if (this._higher(a, b)) {
            R[a] = this._merge(R[a], b);
            S[a] = S[L[a]] + S[R[a]] + 1;
            return a;
        }
        L[b] = this._merge(a, L[b]);
        S[b] = S[L[b]] + S[R[b]] + 1;
        return b;
    }

    /**
     * @private recursive split of subtree `t` by `key`. Returns the LEFT root (keys <
     * key); the RIGHT root (keys >= key) is left in `this._sr` (read by the caller
     * immediately, before any sibling recursion, so a single scratch field suffices).
     */
    _split(t, key) {
        if (t === 0) { this._sr = 0; return 0; }
        const L = this._left, R = this._right, K = this._key, S = this._size;
        if (K[t] < key) {
            const l1 = this._split(R[t], key); // this._sr := the right part
            R[t] = l1;
            S[t] = S[L[t]] + S[R[t]] + 1;
            return t;                          // pair (t, this._sr)
        }
        const l1 = this._split(L[t], key);     // this._sr := R1 ; l1 := L1
        L[t] = this._sr;
        S[t] = S[L[t]] + S[R[t]] + 1;
        this._sr = t;
        return l1;                             // pair (l1, t)
    }

    /** @private smallest key >= `lo`, or undefined (the range-iter start). */
    _ceil(lo) {
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] >= lo) { best = K[t]; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    /** @private build a Treap VIEW sharing `src`'s arena with a given root (split/merge). */
    static _view(src, root) {
        const t = Object.create(Treap.prototype);
        t._cap = src._cap;
        t._key = src._key; t._value = src._value;
        t._left = src._left; t._right = src._right;
        t._prio = src._prio; t._size = src._size;
        t._pool = src._pool;
        t._root = root;
        t._seed0 = src._seed0; t._seed = src._seed;
        t._version = 0; t._sr = 0;
        return t;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] Treap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] Treap value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badRank(k) {
        throw new TypeError(
            '[lite-logn] Treap select index must be an integer, got ' + String(k));
    }

    /** @private */
    _badBound(b) {
        throw new TypeError(
            '[lite-logn] Treap rangeIter bound must be a number (not NaN), got ' + String(b));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] Treap rangeIter needs lo <= hi, got lo=' + String(lo) +
            ' hi=' + String(hi));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] Treap full (capacity ' + this._cap + ')');
    }
}

// Scapegoat (v0.6.0 session) -- a DETERMINISTIC weight-balanced augmented ordered map (BELOW).

/**
 * Max Scapegoat capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns (`_left` / `_right`), each subtree count
 * lives in a `Uint32Array` (`_size`), and the rebuild scratch (`_flat`) plus the
 * flatten index-stack (`_stack`) are `Uint32Array` slot buffers; an index and a count
 * must both fit an unsigned 32-bit word. `NIL = 0` reserves slot 0 as the empty-subtree
 * sentinel, so live slots run [1, capacity]. The index / count arithmetic (Uint32 slot
 * indices + `NIL = 0` + Uint32 subtree sizes), not the byte count, is the hard ceiling
 * -- the same "the arithmetic caps it" reasoning as the array-embedded members.
 */
const SG_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A SCAPEGOAT TREE: a DETERMINISTIC, weight-balanced BINARY SEARCH TREE that is ALSO an
 * order-statistic tree (an AUGMENTED ordered map key -> value). It is the honest PAIR to
 * Treap: where a treap randomizes its shape to be balanced IN EXPECTATION, a scapegoat
 * keeps a hard WORST-CASE height bound (`get` is O(log n) worst-case, never merely
 * expected) by paying for it with AMORTIZED O(log n) `set` / `delete` -- an occasional
 * subtree rebuild absorbs the imbalance. No priorities, no RNG anywhere: the tree shape
 * is a deterministic function of the insert / delete order. The trick that keeps it
 * zero-GC is the SkipList / Treap one: nodes are slot INDICES in flat typed-array columns
 * over the same private free-list (NodePool), never heap objects; AND the rebuild reuses
 * ONE preallocated scratch buffer (`_flat`) + ONE preallocated index-stack (`_stack`),
 * so even a rebuild-heavy trace allocates ZERO bytes after construction.
 *
 * Two invariants held at once:
 *   - BST order on `_key` (an in-order walk is ascending by key); and
 *   - alpha-WEIGHT-BALANCE: after every mutation the height stays <= log_{1/alpha}(n) + 1
 *     (h_alpha), enforced by the dual trigger below. The augmentation is a third
 *     invariant: `_size[x]` is the number of nodes in x's subtree, maintained in the SAME
 *     pass as every link rewrite, so `rank` (keys < x) and `select` (k-th smallest key)
 *     are O(log n) via subtree counts.
 *
 * The DUAL trigger (alpha frozen at construction, `alpha` in the OPEN interval
 * (0.55, 0.75); default 2/3):
 *   - `set`: descend recording the path, link the new leaf at depth d, then if the node
 *     is "too deep" (d > h_alpha(size)) walk the recorded path back up to the SCAPEGOAT
 *     -- the lowest ancestor whose child subtree exceeds `alpha` of its own size -- and
 *     rebuild THAT subtree perfectly balanced. `_maxCount` tracks the high-water size.
 *   - `delete`: remove the node (standard BST delete, `_size` fixed on the unwind), then
 *     when `size < alpha * _maxCount` rebuild the WHOLE tree and reset `_maxCount = size`.
 * The depth test uses NO per-op `Math.log`: since `_invAlpha = 1/alpha` is ctor-cached,
 * `d > h_alpha(n)` (= `d > floor(_invLog * log2(n))`, `_invLog = 1/log2(1/alpha)`) is
 * tested EXACTLY as `_invAlpha^d > n` (for integer d the strict `>` matches the floor),
 * accumulated with one float multiply per path level -- only on the `set` path.
 *
 * ZERO-GC rebuild (the load-bearing design call, decisions/0008-scapegoat.md): NO fresh
 * array per rebuild. `_flatten` walks the target subtree in-order ITERATIVELY (Morris-
 * free) using the preallocated `_stack` index-column, writing sorted slot indices into
 * the preallocated `_flat` buffer; `_buildBalanced` reads that sorted range and re-links
 * `_left` / `_right` / `_size` via bounded native recursion whose depth is O(log
 * subtree) <= ~31 (it produces a perfectly balanced subtree), so it runs on the native
 * call stack, never the GC heap. Both are 0 B/op -- proven by the torture gate's rebuild-
 * heavy ascending-insert lane. RECURSION: `delete` and `forEach` also recurse to a depth
 * equal to the tree height, which is O(log n) worst-case here (the weight balance bounds
 * it) -- strictly safer than Treap's expected bound, disclosed here + in the ADR, on the
 * native stack, so still 0 B/op.
 *
 * Keys and values are FINITE numbers (typeof-guarded BEFORE coercion -- Symbol / BigInt /
 * NaN / +-Infinity fail closed with a `[lite-logn]` throw). `set` on an EXISTING key
 * updates its value in place (no new node, no rebuild). A missing / empty query returns
 * `undefined` (never throws). Fixed capacity: a full pool throws, never silently drops.
 * `rangeIter` is a VERSION-STAMPED iterator -- any structural OR value mutation mid-
 * iteration throws `[lite-logn]` rather than yield stale data.
 *
 * Unlike Treap there is NO `split` / `merge`: those are the treap's arena-sharing set
 * surgery (they rewire a randomized heap in place); a scapegoat has no priority heap to
 * merge by, and an honest deterministic split/merge would be O(n) rebuilds, forfeiting
 * the sub-linear headline -- so the surface is deliberately the ordered-map + order-
 * statistic core (get / has / set / delete / rank / select / successor / predecessor /
 * rangeIter / forEach / clear), documented in the ADR as the asymmetry vs Treap.
 */
export class Scapegoat {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^31-1].
     * @param {number} [alpha]    weight-balance factor in the OPEN interval (0.55, 0.75)
     *                            (both ends throw); default 2/3. Frozen after construction.
     */
    constructor(capacity, alpha = 2 / 3) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > SG_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] Scapegoat capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        // typeof guard BEFORE the range check; the interval is OPEN (both 0.55 and 0.75 throw).
        if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha <= 0.55 || alpha >= 0.75) {
            throw new RangeError(
                '[lite-logn] Scapegoat alpha must be a number in the open interval (0.55, 0.75), got ' +
                String(alpha));
        }
        this._cap = capacity;                          // max live entries
        this._key = new Float64Array(capacity + 1);    // key at each slot
        this._value = new Float64Array(capacity + 1);  // value at each slot
        this._left = new Uint32Array(capacity + 1);    // left child slot; NIL = 0
        this._right = new Uint32Array(capacity + 1);   // right child slot; NIL = 0
        this._size = new Uint32Array(capacity + 1);    // subtree node count; _size[0] = 0
        this._pool = new NodePool(capacity);           // free-list over slots [1, capacity]
        this._flat = new Uint32Array(capacity);        // rebuild scratch: sorted slot indices
        this._stack = new Uint32Array(capacity + 1);   // flatten / descent index-stack (reused)
        this._root = 0;                                // NIL == empty tree
        this._maxCount = 0;                            // high-water size since the last full rebuild
        this._version = 0;                             // iterator invalidation stamp
        this._alpha = alpha;                           // ctor-frozen weight-balance factor
        this._invAlpha = 1 / alpha;                    // ctor-cached: no per-op Math.log
    }

    /** Live entry count. O(1) (the root subtree count). */
    get size() { return this._root === 0 ? 0 : this._size[this._root]; }

    /** The fixed capacity this tree was sized for. O(1). */
    get capacity() { return this._cap; }

    /** The frozen weight-balance factor. O(1). */
    get alpha() { return this._alpha; }

    /**
     * The value stored under `key`, or `undefined` if absent (never throws on a missing /
     * empty query). O(log n) WORST-case: a plain BST descent over a weight-balanced tree.
     * Fails closed on a non-number / non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    get(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else return this._value[t];
        }
        return undefined;
    }

    /**
     * True iff `key` is currently in the tree. O(log n) worst-case. Fails closed on a
     * non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    has(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else return true;
        }
        return false;
    }

    /**
     * Insert `key -> value`, or UPDATE the value in place if `key` already exists (no new
     * node, no rebuild). AMORTIZED O(log n): a descent recording the path, then (on
     * insert) an amortized-cheap weight-balance check that occasionally rebuilds the
     * scapegoat subtree. Fails closed: a non-finite key or value (typeof-guarded first),
     * or a full pool, each throw `[lite-logn]` as a no-op.
     * @param {number} key    a finite number
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(key, value) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        const K = this._key, L = this._left, R = this._right, S = this._size, stk = this._stack;
        let t = this._root, sp = 0;
        while (t !== 0) { // descend, recording the path; update in place if present
            stk[sp++] = t;
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else { this._value[t] = value; this._version = (this._version + 1) | 0; return this; }
        }
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        K[slot] = key; this._value[slot] = value; L[slot] = 0; R[slot] = 0; S[slot] = 1;
        if (sp === 0) this._root = slot;             // first node
        else { const p = stk[sp - 1]; if (key < K[p]) L[p] = slot; else R[p] = slot; }
        for (let i = 0; i < sp; i++) S[stk[i]]++;     // every ancestor gained one node
        const newSize = S[this._root];                // == old size + 1
        if (newSize > this._maxCount) this._maxCount = newSize;
        this._version = (this._version + 1) | 0;
        // Depth test with NO Math.log: the new node sits at depth d == sp; it is too deep
        // iff d > h_alpha(newSize) == floor(_invLog * log2(newSize)), tested EXACTLY as
        // _invAlpha^d > newSize (integer d, so strict > matches the floor). One float
        // multiply per level -- only on this insert path, never on get.
        let bound = 1;
        for (let i = 0; i < sp; i++) bound *= this._invAlpha;
        if (bound > newSize) {
            // Walk the recorded path up to the SCAPEGOAT: the lowest ancestor whose
            // path-child subtree exceeds alpha of its own (post-insert) size.
            let g = -1;
            for (let i = sp - 1; i >= 0; i--) {
                const node = stk[i];
                const child = i === sp - 1 ? slot : stk[i + 1];
                if (S[child] > this._alpha * S[node]) { g = i; break; }
            }
            if (g === -1) {
                this._rebuildSubtree(this._root, 0, false); // defensive: rebuild whole tree
            } else {
                const node = stk[g];
                const parent = g > 0 ? stk[g - 1] : 0;
                const wasLeft = parent !== 0 && L[parent] === node;
                this._rebuildSubtree(node, parent, wasLeft);
            }
        }
        return this;
    }

    /**
     * Remove `key`. AMORTIZED O(log n). Idempotent: returns `false` if `key` is absent (no
     * throw), `true` if it was present and removed. A standard BST delete fixes `_size` on
     * the unwind; when the tree has shrunk below `alpha * _maxCount` the WHOLE tree is
     * rebuilt perfectly balanced and `_maxCount` reset. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    delete(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, found = false;
        while (t !== 0) {
            if (key < K[t]) t = L[t];
            else if (key > K[t]) t = R[t];
            else { found = true; break; }
        }
        if (!found) return false; // absent (no throw)
        this._root = this._delete(this._root, key);
        this._version = (this._version + 1) | 0;
        const newSize = this._root === 0 ? 0 : this._size[this._root];
        if (newSize < this._alpha * this._maxCount) {
            this._rebuildSubtree(this._root, 0, false); // global rebuild
            this._maxCount = newSize;
        }
        return true;
    }

    /**
     * The number of stored keys STRICTLY LESS than `x` (its rank / position). O(log n) via
     * subtree counts. `x` need not be present; `rank` of the smallest key is 0, of a key
     * past the max is `size`. Fails closed on a non-finite `x`.
     * @param {number} x  a finite number
     * @returns {number} count of keys < x, in [0, size]
     */
    rank(x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return this._badKey(x);
        const L = this._left, R = this._right, K = this._key, S = this._size;
        let t = this._root, r = 0;
        while (t !== 0) {
            if (x <= K[t]) t = L[t];              // t (and its right) are >= x
            else { r += S[L[t]] + 1; t = R[t]; }  // t's left subtree + t precede x
        }
        return r;
    }

    /**
     * The k-th smallest KEY (0-based order statistic), or `undefined` if `k` is out of
     * range [0, size). O(log n) via subtree counts. Fails closed on a non-integer `k`
     * (typeof-guarded first); an in-type out-of-range `k` returns `undefined`.
     * @param {number} k  integer in [0, size)
     * @returns {number|undefined} the k-th smallest key
     */
    select(k) {
        if (typeof k !== 'number' || !Number.isInteger(k)) return this._badRank(k);
        const sz = this._root === 0 ? 0 : this._size[this._root];
        if (k < 0 || k >= sz) return undefined;
        const L = this._left, R = this._right, K = this._key, S = this._size;
        let t = this._root;
        for (;;) {
            const ls = S[L[t]];
            if (k < ls) t = L[t];
            else if (k > ls) { k -= ls + 1; t = R[t]; }
            else return K[t];
        }
    }

    /**
     * The smallest key STRICTLY greater than `key`, or `undefined` if none. O(log n).
     * `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    successor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] > key) { best = K[t]; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    /**
     * The largest key STRICTLY less than `key`, or `undefined` if none. O(log n). `key`
     * itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    predecessor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] < key) { best = K[t]; t = R[t]; }
            else t = L[t];
        }
        return best;
    }

    /**
     * A VERSION-STAMPED iterator over the keys in `[lo, hi]` INCLUSIVE, ascending. Bounds
     * may be any number INCLUDING +-Infinity (an unbounded end); `NaN` fails closed, as
     * does `lo > hi`. The generator captures the tree's version and throws `[lite-logn]`
     * if any STRUCTURAL or VALUE mutation happens mid-iteration, rather than yield stale
     * data. It walks by repeated `successor` (each step a fresh O(log n) descent, so NO
     * scratch stack is allocated); the one documented per-protocol allocator is the
     * {value, done} per step.
     * @param {number} lo  lower bound (inclusive); may be -Infinity
     * @param {number} hi  upper bound (inclusive); may be +Infinity
     * @returns {IterableIterator<number>} the keys in [lo, hi], ascending
     */
    rangeIter(lo, hi) {
        if (typeof lo !== 'number' || Number.isNaN(lo)) return this._badBound(lo);
        if (typeof hi !== 'number' || Number.isNaN(hi)) return this._badBound(hi);
        if (lo > hi) return this._badRange(lo, hi);
        return this._rangeGen(lo, hi);
    }

    /** @private version-stamped range generator (see rangeIter). */
    *_rangeGen(lo, hi) {
        const ver = this._version;
        let cur = this._ceil(lo); // smallest key >= lo, or undefined
        while (cur !== undefined && cur <= hi) {
            if (this._version !== ver) {
                throw new Error('[lite-logn] Scapegoat mutated during iteration');
            }
            yield cur;
            cur = this.successor(cur);
        }
    }

    /**
     * Visit every live `(key, value)` pair in ASCENDING key order. O(n) cold in-order walk
     * (recursion depth = tree height, O(log n)), allocation-free in the loop body (pass a
     * hoisted callback). Unlike rangeIter this is NOT version-stamped -- mutating from
     * within the callback is the caller's responsibility (matching the other members).
     * @param {(key:number, value:number, tree:Scapegoat)=>void} fn
     */
    forEach(fn) {
        this._forEach(this._root, fn);
    }

    /** @private recursive in-order walk. */
    _forEach(t, fn) {
        if (t === 0) return;
        this._forEach(this._left[t], fn);
        fn(this._key[t], this._value[t], this);
        this._forEach(this._right[t], fn);
    }

    /**
     * Empty the tree, keeping the fixed capacity. O(capacity) cold path: returns every
     * node to the pool and points the root at NIL. @returns {this}
     */
    clear() {
        this._pool.clear();
        this._root = 0;
        this._maxCount = 0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    // ---- private structure (rebuild + recursive delete; hot bodies elsewhere) ----

    /**
     * @private In-order flatten of subtree `root` into `_flat` using the preallocated
     * `_stack` index-column (Morris-free, ITERATIVE -- so a degenerate pre-rebuild chain
     * cannot overflow the native stack). Returns the node count written. 0 B/op.
     */
    _flatten(root) {
        const L = this._left, R = this._right, stk = this._stack, flat = this._flat;
        let node = root, sp = 0, c = 0;
        while (node !== 0 || sp > 0) {
            while (node !== 0) { stk[sp++] = node; node = L[node]; }
            node = stk[--sp];
            flat[c++] = node;
            node = R[node];
        }
        return c;
    }

    /**
     * @private Build a perfectly balanced BST from the sorted slot range `_flat[lo..hi]`,
     * re-linking `_left` / `_right` / `_size`. Returns the subtree root (NIL if empty).
     * Bounded native recursion: depth is O(log(hi-lo+1)) <= ~31 (it produces a balanced
     * subtree), so it runs on the native call stack, never the GC heap. 0 B/op.
     */
    _buildBalanced(lo, hi) {
        if (lo > hi) return 0;
        const mid = (lo + hi) >> 1;
        const s = this._flat[mid];
        const l = this._buildBalanced(lo, mid - 1);
        const r = this._buildBalanced(mid + 1, hi);
        this._left[s] = l;
        this._right[s] = r;
        this._size[s] = this._size[l] + this._size[r] + 1; // _size[0] is a permanent 0
        return s;
    }

    /**
     * @private Rebuild subtree `root` perfectly balanced and re-link it under `parent`
     * (or the tree root when `parent === 0`). `wasLeft` records which child link to
     * rewrite. Reuses the preallocated `_flat` + `_stack` scratch: 0 B/op.
     */
    _rebuildSubtree(root, parent, wasLeft) {
        const count = this._flatten(root);
        const nr = this._buildBalanced(0, count - 1);
        if (parent === 0) this._root = nr;
        else if (wasLeft) this._left[parent] = nr;
        else this._right[parent] = nr;
    }

    /** @private recursive BST delete of `key` from subtree `t`; frees the removed slot,
     *  fixing `_size` on the unwind. Depth = tree height = O(log n). */
    _delete(t, key) {
        const L = this._left, R = this._right, S = this._size, K = this._key;
        if (key < K[t]) {
            L[t] = this._delete(L[t], key);
            S[t] = S[L[t]] + S[R[t]] + 1;
            return t;
        }
        if (key > K[t]) {
            R[t] = this._delete(R[t], key);
            S[t] = S[L[t]] + S[R[t]] + 1;
            return t;
        }
        // found t
        const l = L[t], r = R[t];
        if (l === 0) { this._pool.free(t); return r; }
        if (r === 0) { this._pool.free(t); return l; }
        // two children: copy the in-order successor (min of the right subtree) into t,
        // then delete that successor from the right subtree (frees ITS slot).
        let m = r; while (L[m] !== 0) m = L[m];
        K[t] = K[m]; this._value[t] = this._value[m];
        R[t] = this._deleteMin(R[t]);
        S[t] = S[L[t]] + S[R[t]] + 1;
        return t;
    }

    /** @private remove the minimum of subtree `t`, freeing its slot; return the new root. */
    _deleteMin(t) {
        const L = this._left, R = this._right, S = this._size;
        if (L[t] === 0) { const r = R[t]; this._pool.free(t); return r; }
        L[t] = this._deleteMin(L[t]);
        S[t] = S[L[t]] + S[R[t]] + 1;
        return t;
    }

    /** @private smallest key >= `lo`, or undefined (the range-iter start). */
    _ceil(lo) {
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best;
        while (t !== 0) {
            if (K[t] >= lo) { best = K[t]; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] Scapegoat key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] Scapegoat value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badRank(k) {
        throw new TypeError(
            '[lite-logn] Scapegoat select index must be an integer, got ' + String(k));
    }

    /** @private */
    _badBound(b) {
        throw new TypeError(
            '[lite-logn] Scapegoat rangeIter bound must be a number (not NaN), got ' + String(b));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] Scapegoat rangeIter needs lo <= hi, got lo=' + String(lo) +
            ' hi=' + String(hi));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] Scapegoat full (capacity ' + this._cap + ')');
    }
}

// MinMaxHeap (v0.7.0 session) -- a DEPQ (double-ended priority queue), array-embedded min-max heap (BELOW).

/**
 * Max MinMaxHeap capacity: slot indices 0..cap-1 index the two parallel, pointer-free
 * typed-array columns (`_key` Float64Array, `_id` Uint32Array). Children of slot i are
 * `2i+1` / `2i+2` and grandchildren `4i+3 .. 4i+6`, so the deepest index arithmetic a
 * hot op performs is `4*i + 6`; capping capacity at 2^31-1 keeps every derived index a
 * positive int32. The index arithmetic, not the byte count, is the hard ceiling -- the
 * same "the arithmetic caps it" reasoning as BinaryHeap's BH_MAX_CAPACITY.
 */
const MMH_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A MIN-MAX HEAP: a DOUBLE-ENDED priority queue (DEPQ) held in ONE array-embedded binary
 * heap whose levels ALTERNATE min / max (Atkinson, Sack, Santoro & Strothotte 1986). Even
 * depth (the root is depth 0) is a MIN level, odd depth is a MAX level, so the global
 * minimum sits at the root and the global maximum is the LARGER of the root's up-to-two
 * children. That single alternating heap answers BOTH ends: `peekMin` / `peekMax` are
 * O(1); `push` / `popMin` / `popMax` are O(log n) WORST-case. It is the family's DEPQ --
 * where BinaryHeap fixes one extreme at construction, a min-max heap serves both from one
 * structure without a second heap or a paired-heap correspondence to maintain.
 *
 * Storage (allocated once, sized to capacity), the BinaryHeap id+key idiom:
 *   - `_key` Float64Array -- the priority key at each heap SLOT (min-max-ordered).
 *   - `_id`  Uint32Array  -- the opaque payload id at each heap SLOT (moves with its key).
 * There is NO reverse-index map (`_pos`) and so NO addressable `changeKey` / `remove`: the
 * id is an OPAQUE Uint32 payload, NOT a unique handle -- duplicate ids are allowed, and the
 * id domain is the full Uint32 range [0, 2^32) (a wider domain than BinaryHeap's [0,
 * capacity), which only that member's `_pos` map constrains). See decisions/0009.
 *
 * Level parity is computed zero-alloc: slot i (0-based) is a MIN level iff
 * `((31 - Math.clz32(i + 1)) & 1) === 0` (the depth `31 - clz32(i+1)` is even). The sift
 * is HOLE-PUNCHING (not a 3-write swap chain): the moving element is cached in locals once
 * and the hole walks writing ONE slot per level.
 *   - push: append at the tail, compare the new element to its PARENT to pick the own-level
 *     vs other-level chain, then bubble by GRANDPARENT comparisons up the min-or-max chain.
 *   - popMin / popMax: open a hole at the root (min) or at the max-of-{slot1,slot2} (max),
 *     move the last element into it, and trickle DOWN over CHILDREN + GRANDCHILDREN (a min
 *     level sinks toward the smallest of the up-to-six descendants, a max level toward the
 *     largest); a GRANDCHILD move does the extra parent re-check that keeps the alternating
 *     order intact. Every one of the four grandchild indices is bound-checked against the
 *     live size (the classic min-max off-by-one). Zero bytes allocated after construction.
 *
 * Keys are FINITE numbers (typeof-guarded BEFORE coercion -- Symbol / BigInt / NaN /
 * +-Infinity fail closed with a `[lite-logn]` throw); ids are integers in [0, 2^32). A key
 * guard fires FIRST, then the id guard, then the full-heap guard -- any throw leaves `size`
 * unchanged. Every peek / pop on an EMPTY heap returns `undefined` and NEVER throws. Fixed
 * capacity: overflow throws, never silently drops.
 *
 * This is the classic ONE-element-per-node min-max heap ONLY; the interval-heap DEPQ (two
 * elements per node) is a deliberately deferred alternative -- see decisions/0009 + NOT FOR.
 */
export class MinMaxHeap {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^31-1].
     */
    constructor(capacity) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > MMH_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] MinMaxHeap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        this._key = new Float64Array(capacity); // key at each heap slot
        this._id = new Uint32Array(capacity);   // opaque payload id at each heap slot
        this._cap = capacity;                    // exact fixed capacity
        this._n = 0;                             // live entries (heap size)
    }

    /** Live entry count. O(1). */
    get size() { return this._n; }

    /** The fixed capacity this heap was sized for. O(1). */
    get capacity() { return this._cap; }

    /**
     * Insert entity `id` with priority `key`. O(log n). Fails closed: a non-finite /
     * non-number key (checked FIRST), a non-integer / out-of-range id, or a full heap each
     * throw `[lite-logn]` as a no-op (size unchanged).
     * @param {number} id   integer in [0, 2^32), an OPAQUE payload (not required unique)
     * @param {number} key  a finite number
     */
    push(id, key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 0xFFFFFFFF) {
            return this._badId(id);
        }
        const n = this._n;
        if (n === this._cap) return this._full();
        this._n = n + 1;
        this._siftUp(n, key, id);
    }

    /**
     * Remove and return the id at the MINIMUM key (the root), or `undefined` if empty
     * (never throws on empty). O(log n).
     * @returns {number|undefined}
     */
    popMin() {
        const n = this._n;
        if (n === 0) return undefined;
        const top = this._id[0];
        const last = n - 1;
        this._n = last;
        if (last > 0) this._siftDownMin(0, this._key[last], this._id[last]);
        return top;
    }

    /**
     * Remove and return the id at the MAXIMUM key (the larger of the root's up-to-two
     * children, or the root itself when the heap holds one element), or `undefined` if
     * empty (never throws on empty). O(log n).
     * @returns {number|undefined}
     */
    popMax() {
        const n = this._n;
        if (n === 0) return undefined;
        if (n === 1) { this._n = 0; return this._id[0]; }
        const K = this._key;
        // Max is at slot 1, unless slot 2 exists (n > 2) and holds a larger key.
        let mi = 1;
        if (n > 2 && K[2] > K[1]) mi = 2;
        const top = this._id[mi];
        const last = n - 1;
        this._n = last;
        // If the max WAS the last element, dropping the tail already removed it.
        if (mi !== last) this._siftDownMax(mi, K[last], this._id[last]);
        return top;
    }

    /** The id at the minimum key (root), or `undefined` if empty. Read-only. O(1). */
    peekMin() { return this._n === 0 ? undefined : this._id[0]; }

    /** The minimum key (root), or `undefined` if empty. O(1). */
    peekMinKey() { return this._n === 0 ? undefined : this._key[0]; }

    /** The id at the maximum key, or `undefined` if empty. Read-only. O(1). */
    peekMax() {
        const n = this._n;
        if (n === 0) return undefined;
        if (n === 1) return this._id[0];
        const K = this._key;
        return (n > 2 && K[2] > K[1]) ? this._id[2] : this._id[1];
    }

    /** The maximum key, or `undefined` if empty. O(1). */
    peekMaxKey() {
        const n = this._n;
        if (n === 0) return undefined;
        if (n === 1) return this._key[0];
        const K = this._key;
        return (n > 2 && K[2] > K[1]) ? K[2] : K[1];
    }

    /** Empty the heap. O(1) (resets size; the columns are kept). */
    clear() { this._n = 0; }

    /**
     * Visit every live (id, key) pair in UNSPECIFIED (heap-array) order -- NOT sorted /
     * not pop order. O(n) cold scan, allocation-free (pass a hoisted callback).
     * @param {(id:number, key:number, heap:MinMaxHeap)=>void} fn
     */
    forEach(fn) {
        const id = this._id, key = this._key, n = this._n;
        for (let i = 0; i < n; i++) fn(id[i], key[i], this);
    }

    /**
     * Iterate live entity ids in UNSPECIFIED (heap-array) order -- NOT sorted. The one
     * documented per-protocol allocator (a {value, done} per step); use forEach for the
     * alloc-free scan.
     */
    *[Symbol.iterator]() {
        const id = this._id, n = this._n;
        for (let i = 0; i < n; i++) yield id[i];
    }

    /**
     * Floyd O(n) bulk build: load every (ids[i], keys[i]) pair then heapify bottom-up in
     * O(n) (deepest-first, level-aware sift-down), rather than n individual O(log n)
     * pushes. COLD path; fails closed on any violation (non-array-like / length mismatch,
     * count > capacity, non-integer / out-of-range id, non-finite key) before use.
     * @param {ArrayLike<number>} ids   integers in [0, 2^32) (not required unique)
     * @param {ArrayLike<number>} keys  finite numbers, keys.length === ids.length
     * @param {number} capacity
     * @returns {MinMaxHeap}
     */
    static build(ids, keys, capacity) {
        const heap = new MinMaxHeap(capacity);
        if (ids == null || keys == null ||
            typeof ids.length !== 'number' || typeof keys.length !== 'number') {
            throw new TypeError('[lite-logn] MinMaxHeap.build needs array-like ids and keys');
        }
        const count = ids.length;
        if (keys.length !== count) {
            throw new RangeError(
                '[lite-logn] MinMaxHeap.build ids/keys length mismatch (' +
                count + ' vs ' + keys.length + ')');
        }
        if (count > capacity) {
            throw new RangeError(
                '[lite-logn] MinMaxHeap.build count ' + count + ' exceeds capacity ' + capacity);
        }
        const K = heap._key, I = heap._id;
        for (let i = 0; i < count; i++) {
            const id = ids[i];
            if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 0xFFFFFFFF) {
                throw new RangeError(
                    '[lite-logn] MinMaxHeap.build id must be an integer in [0, 2^32), got ' +
                    String(id));
            }
            const key = keys[i];
            if (typeof key !== 'number' || !Number.isFinite(key)) {
                throw new TypeError(
                    '[lite-logn] MinMaxHeap.build key must be a finite number, got ' + String(key));
            }
            K[i] = key;
            I[i] = id;
        }
        heap._n = count;
        // Floyd: sift down every internal node, deepest-first, level-aware. O(n).
        for (let i = (count >> 1) - 1; i >= 0; i--) {
            if (((31 - Math.clz32(i + 1)) & 1) === 0) heap._siftDownMin(i, K[i], I[i]);
            else heap._siftDownMax(i, K[i], I[i]);
        }
        return heap;
    }

    // ---- private hole-punching sifts (hot bodies) --------------------------

    /**
     * Sift UP from `hole` after an append: compare to the PARENT to decide whether the new
     * element belongs on its own level's chain or the other level's, then bubble it up by
     * GRANDPARENT comparisons. One write per level; zero temporaries.
     * @private
     */
    _siftUp(hole, key, id) {
        const K = this._key, I = this._id;
        if (hole === 0) { K[0] = key; I[0] = id; return; }
        const parent = (hole - 1) >> 1;
        // Depth parity of `hole`: MIN level iff (31 - clz32(hole+1)) is even.
        if (((31 - Math.clz32(hole + 1)) & 1) === 0) { // hole is on a MIN level
            if (key > K[parent]) {                     // parent is a MAX node: element belongs above it
                K[hole] = K[parent]; I[hole] = I[parent];
                this._bubbleUpMax(parent, key, id);
            } else {
                this._bubbleUpMin(hole, key, id);
            }
        } else {                                       // hole is on a MAX level
            if (key < K[parent]) {                     // parent is a MIN node: element belongs above it
                K[hole] = K[parent]; I[hole] = I[parent];
                this._bubbleUpMin(parent, key, id);
            } else {
                this._bubbleUpMax(hole, key, id);
            }
        }
    }

    /** Bubble a MIN-level hole up by grandparents while the element is smaller. @private */
    _bubbleUpMin(hole, key, id) {
        const K = this._key, I = this._id;
        while (hole > 2) {                    // has a grandparent (hole >= 3)
            const gp = (hole - 3) >> 2;       // (((hole-1)>>1)-1)>>1
            if (key < K[gp]) { K[hole] = K[gp]; I[hole] = I[gp]; hole = gp; }
            else break;
        }
        K[hole] = key; I[hole] = id;
    }

    /** Bubble a MAX-level hole up by grandparents while the element is larger. @private */
    _bubbleUpMax(hole, key, id) {
        const K = this._key, I = this._id;
        while (hole > 2) {                    // has a grandparent (hole >= 3)
            const gp = (hole - 3) >> 2;       // (((hole-1)>>1)-1)>>1
            if (key > K[gp]) { K[hole] = K[gp]; I[hole] = I[gp]; hole = gp; }
            else break;
        }
        K[hole] = key; I[hole] = id;
    }

    /**
     * Trickle a MIN-level hole DOWN toward the SMALLEST of its up-to-six descendants
     * (children `2h+1`/`2h+2`, grandchildren `4h+3..4h+6`). A grandchild move does the
     * extra max-parent re-check that keeps the alternating order. Every grandchild index
     * is bound-checked against the live size. One write per level; zero temporaries.
     * @private
     */
    _siftDownMin(hole, key, id) {
        const K = this._key, I = this._id, n = this._n;
        for (;;) {
            const c1 = (hole << 1) + 1;
            if (c1 >= n) break;                       // leaf: no children -> settle here
            const c2 = c1 + 1;
            let m = c1, mGrand = false;               // smallest descendant so far
            if (c2 < n && K[c2] < K[m]) m = c2;
            const gEnd = (c2 << 1) + 2;               // 4h+6, the last grandchild index
            for (let g = (c1 << 1) + 1; g < n && g <= gEnd; g++) { // grandchildren 4h+3..4h+6
                if (K[g] < K[m]) { m = g; mGrand = true; }
            }
            if (K[m] >= key) break;                   // element is <= every descendant -> settle
            if (!mGrand) {                            // smallest is a direct child (a leaf) -> place, done
                K[hole] = K[m]; I[hole] = I[m];
                hole = m;
                break;
            }
            // smallest is a grandchild: pull it up, then reconcile with its MAX-level parent.
            K[hole] = K[m]; I[hole] = I[m];
            const p = (m - 1) >> 1;
            if (key > K[p]) {                         // element too big under max parent p: settle it at p,
                const pk = K[p], pid = I[p];          // carry p's (smaller) value on down from m.
                K[p] = key; I[p] = id;
                key = pk; id = pid;
            }
            hole = m;
        }
        K[hole] = key; I[hole] = id;
    }

    /**
     * Trickle a MAX-level hole DOWN toward the LARGEST of its up-to-six descendants. Mirror
     * of `_siftDownMin`: a grandchild move re-checks the MIN-level parent. Every grandchild
     * index is bound-checked. One write per level; zero temporaries.
     * @private
     */
    _siftDownMax(hole, key, id) {
        const K = this._key, I = this._id, n = this._n;
        for (;;) {
            const c1 = (hole << 1) + 1;
            if (c1 >= n) break;                       // leaf: no children -> settle here
            const c2 = c1 + 1;
            let m = c1, mGrand = false;               // largest descendant so far
            if (c2 < n && K[c2] > K[m]) m = c2;
            const gEnd = (c2 << 1) + 2;               // 4h+6, the last grandchild index
            for (let g = (c1 << 1) + 1; g < n && g <= gEnd; g++) { // grandchildren 4h+3..4h+6
                if (K[g] > K[m]) { m = g; mGrand = true; }
            }
            if (K[m] <= key) break;                   // element is >= every descendant -> settle
            if (!mGrand) {                            // largest is a direct child (a leaf) -> place, done
                K[hole] = K[m]; I[hole] = I[m];
                hole = m;
                break;
            }
            // largest is a grandchild: pull it up, then reconcile with its MIN-level parent.
            K[hole] = K[m]; I[hole] = I[m];
            const p = (m - 1) >> 1;
            if (key < K[p]) {                         // element too small under min parent p: settle it at p,
                const pk = K[p], pid = I[p];          // carry p's (larger) value on down from m.
                K[p] = key; I[p] = id;
                key = pk; id = pid;
            }
            hole = m;
        }
        K[hole] = key; I[hole] = id;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ---

    /** @private */
    _badId(id) {
        throw new RangeError(
            '[lite-logn] MinMaxHeap id must be an integer in [0, 2^32), got ' + String(id));
    }

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] MinMaxHeap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] MinMaxHeap full (capacity ' + this._cap + ')');
    }
}

// SplayTree (v0.8.0 session) -- a SELF-ADJUSTING BST ordered map: a read moves the
// touched key to the root, so hot keys ride near the top (AMORTIZED O(log n)) (BELOW).

/**
 * Max SplayTree capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns (`_left` / `_right`); an index must fit an
 * unsigned 32-bit word. `NIL = 0` reserves slot 0 as the empty-subtree sentinel, so live
 * slots run [1, capacity]. Slot 0 doubles as the top-down splay's DUMMY HEADER: its
 * `_left` / `_right` cells are the two assembly roots during a splay and are restored to 0
 * before the splay returns, so the NIL invariant holds between operations. The index
 * arithmetic (Uint32 slot indices + `NIL = 0`), not the byte count, is the hard ceiling --
 * the same "the arithmetic caps it" reasoning as the other pointer-based members.
 */
const SP_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A SPLAY TREE: a SELF-ADJUSTING binary search tree (an ordered map key -> value) whose
 * every access RESTRUCTURES the tree so the touched key becomes the root. Where Treap
 * randomizes the shape and Scapegoat weight-balances it, a splay tree keeps NO balance
 * metadata at all: it simply SPLAYS -- a chain of rotations that walks the accessed node
 * (or, for an absent key, the last node on the search path) to the root. Recently and
 * frequently used keys therefore ride near the top, giving AMORTIZED O(log n) per op and
 * genuinely FASTER-than-log behaviour on skewed / working-set access patterns (the reason
 * a splay tree is the classic self-optimizing map). The trick that keeps it zero-GC is the
 * family one: nodes are slot INDICES in flat typed-array columns over the same private
 * free-list (NodePool), never heap objects.
 *
 * The splay is ITERATIVE and TOP-DOWN (Sleator & Tarjan 1985): a single downward pass
 * assembles a left tree and a right tree using two fixed scratch HANDS (`_hl` / `_hr`) and
 * the dummy header at slot 0, handling zig / zig-zig / zig-zag in place. There is NO parent
 * column, NO path stack, and NO recursion -- so every hot op allocates ZERO bytes after
 * construction and no degenerate chain can overflow the native stack.
 *
 * Storage (allocated once, sized to capacity + 1; slot 0 is the NIL sentinel / splay header):
 *   - `_key` / `_value` `Float64Array` -- key and value at each slot.
 *   - `_left` / `_right` `Uint32Array` -- child slot indices, `NIL = 0`.
 *   - `_pool` NodePool -- the free-list handing out slot indices [1, capacity].
 *   - `_n` -- the live-entry counter (there is deliberately NO per-node _size column: this
 *     is the LEAN member, so it ships NO rank / select / split / merge -- the documented
 *     asymmetry vs Treap / Scapegoat).
 *
 * Honesty (amortized member): `get` / `has` / `set` / `delete` are AMORTIZED O(log n) --
 * DETERMINISTIC (no RNG), but NOT per-op worst-case. A single cold, deep access can splay a
 * long chain in O(n); that MAX single op is DISCLOSED by the witness harness, never gated
 * (decisions/0010-splaytree.md). The amortized bound holds for any access sequence.
 *
 * A READ MUTATES: `get` and `has` SPLAY the touched key to the root and BUMP `_version`, so
 * an in-flight `rangeIter` fails closed even on a read. `set` inserts (or updates the value
 * in place if the key exists, after splaying it up); `delete` splays the target to the root
 * then JOINS its two subtrees (splay the MAX of the left subtree up, hang the right subtree
 * off it). `successor` / `predecessor` splay the closest node to `key` to the root (the
 * amortization applies to ordered probes too) and are STRICT. `rangeIter` / `forEach` /
 * `[Symbol.iterator]` are NON-splaying in-order walks (they re-descend by key each step, so
 * NO scratch stack is allocated) that leave `_root` and `_version` byte-identical -- and
 * `rangeIter` is VERSION-STAMPED, so any structural OR read (get / has) mutation mid-
 * iteration throws `[lite-logn]` rather than yield stale data.
 *
 * Keys and values are FINITE numbers (typeof-guarded BEFORE coercion -- Symbol / BigInt /
 * NaN / +-Infinity fail closed with a `[lite-logn]` throw). A missing / empty query returns
 * `undefined` (never throws). Fixed capacity: a full pool throws, never silently drops.
 */
export class SplayTree {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^31-1].
     */
    constructor(capacity) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > SP_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] SplayTree capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        this._cap = capacity;                         // max live entries
        this._key = new Float64Array(capacity + 1);   // key at each slot
        this._value = new Float64Array(capacity + 1); // value at each slot
        this._left = new Uint32Array(capacity + 1);   // left child slot; NIL = 0
        this._right = new Uint32Array(capacity + 1);  // right child slot; NIL = 0
        this._pool = new NodePool(capacity);          // free-list over slots [1, capacity]
        this._root = 0;                               // NIL == empty tree
        this._n = 0;                                  // live-entry counter (size)
        this._version = 0;                            // iterator invalidation stamp
        this._hl = 0;                                 // splay scratch hand: left tree max
        this._hr = 0;                                 // splay scratch hand: right tree min
    }

    /** Live entry count. O(1). */
    get size() { return this._n; }

    /** The fixed capacity this tree was sized for. O(1). */
    get capacity() { return this._cap; }

    /**
     * The value stored under `key`, or `undefined` if absent (never throws on a missing /
     * empty query). AMORTIZED O(log n): a read SPLAYS the touched key (or the last node on
     * the search path) to the root and BUMPS `_version` (an in-flight iterator fails closed).
     * Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    get(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._root === 0) return undefined;
        this._splay(key);
        this._version = (this._version + 1) | 0;
        return this._key[this._root] === key ? this._value[this._root] : undefined;
    }

    /**
     * True iff `key` is currently in the tree. AMORTIZED O(log n): SPLAYS like `get` and
     * BUMPS `_version`. Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    has(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._root === 0) return false;
        this._splay(key);
        this._version = (this._version + 1) | 0;
        return this._key[this._root] === key;
    }

    /**
     * Insert `key -> value`, or UPDATE the value in place if `key` already exists (no new
     * node). AMORTIZED O(log n): splay `key` to the root, then either overwrite it or hang
     * the old root off a fresh node that becomes the new root. Fails closed: a non-finite
     * key or value (typeof-guarded first), or a full pool, each throw `[lite-logn]` as a
     * no-op insert.
     * @param {number} key    a finite number
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(key, value) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (this._root === 0) {
            const slot = this._pool.alloc();
            if (slot === 0) return this._full();
            this._key[slot] = key; this._value[slot] = value;
            this._left[slot] = 0; this._right[slot] = 0;
            this._root = slot;
            this._n = (this._n + 1) | 0;
            this._version = (this._version + 1) | 0;
            return this;
        }
        this._splay(key);
        const r = this._root, K = this._key;
        if (K[r] === key) {                       // update in place -- no new node
            this._value[r] = value;
            this._version = (this._version + 1) | 0;
            return this;
        }
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();      // splayed but no insert (fail closed)
        K[slot] = key; this._value[slot] = value;
        const L = this._left, R = this._right;
        if (key < K[r]) {                         // new node is the smaller root
            L[slot] = L[r];
            R[slot] = r;
            L[r] = 0;
        } else {                                  // new node is the larger root
            R[slot] = R[r];
            L[slot] = r;
            R[r] = 0;
        }
        this._root = slot;
        this._n = (this._n + 1) | 0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * Remove `key`. AMORTIZED O(log n). Idempotent: returns `false` if `key` is absent (no
     * throw), `true` if it was present and removed. Deletion splays `key` to the root, then
     * JOINS its two subtrees -- splay the MAX of the left subtree to that subtree's root
     * (leaving it with no right child) and hang the right subtree there -- and frees the
     * removed slot. Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    delete(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._root === 0) return false;
        this._splay(key);
        this._version = (this._version + 1) | 0;
        if (this._key[this._root] !== key) return false; // absent (closest was splayed up)
        this._joinDelete();
        this._n = (this._n - 1) | 0;
        return true;
    }

    /**
     * The smallest key STRICTLY greater than `key`, or `undefined` if none. AMORTIZED
     * O(log n): it SPLAYS the closest node to `key` to the root (the amortization applies to
     * ordered probes too) and BUMPS `_version`. `key` itself need not be present. Fails
     * closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    successor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._root === 0) return undefined;
        this._splay(key);
        this._version = (this._version + 1) | 0;
        const r = this._root, K = this._key, L = this._left, R = this._right;
        if (K[r] > key) return K[r];              // root is already the smallest key > key
        let t = R[r];                             // else: min of the right subtree
        if (t === 0) return undefined;
        while (L[t] !== 0) t = L[t];
        return K[t];
    }

    /**
     * The largest key STRICTLY less than `key`, or `undefined` if none. AMORTIZED O(log n):
     * SPLAYS the closest node to the root and BUMPS `_version`. `key` itself need not be
     * present. Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    predecessor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (this._root === 0) return undefined;
        this._splay(key);
        this._version = (this._version + 1) | 0;
        const r = this._root, K = this._key, L = this._left, R = this._right;
        if (K[r] < key) return K[r];              // root is already the largest key < key
        let t = L[r];                             // else: max of the left subtree
        if (t === 0) return undefined;
        while (R[t] !== 0) t = R[t];
        return K[t];
    }

    /**
     * A VERSION-STAMPED iterator over the keys in `[lo, hi]` INCLUSIVE, ascending. Bounds
     * may be any number INCLUDING +-Infinity (an unbounded end); `NaN` fails closed, as does
     * `lo > hi`. This is a NON-SPLAYING in-order walk: it re-descends by key each step (so NO
     * scratch stack is allocated) and leaves `_root` / `_version` byte-identical. The
     * generator captures the version and throws `[lite-logn]` if any STRUCTURAL OR READ
     * (get / has / set / delete) mutation happens mid-iteration, rather than yield stale
     * data; the one documented per-protocol allocator is the {value, done} per step.
     * @param {number} lo  lower bound (inclusive); may be -Infinity
     * @param {number} hi  upper bound (inclusive); may be +Infinity
     * @returns {IterableIterator<number>} the keys in [lo, hi], ascending
     */
    rangeIter(lo, hi) {
        if (typeof lo !== 'number' || Number.isNaN(lo)) return this._badBound(lo);
        if (typeof hi !== 'number' || Number.isNaN(hi)) return this._badBound(hi);
        if (lo > hi) return this._badRange(lo, hi);
        return this._rangeGen(lo, hi);
    }

    /** @private version-stamped, NON-splaying range generator (see rangeIter). */
    *_rangeGen(lo, hi) {
        const ver = this._version, K = this._key;
        let x = this._ceilNode(lo);
        for (;;) {
            // Check the version stamp UNCONDITIONALLY, BEFORE the exhaustion test: a mid-
            // iteration mutation that empties the remaining window (clear() -> root 0, or the
            // in-range remainder deleted) would otherwise make the loop condition false FIRST
            // and return `done` silently -- a fail-OPEN (silent truncation). Fail closed instead.
            if (this._version !== ver) {
                throw new Error('[lite-logn] SplayTree mutated during iteration');
            }
            if (x === 0 || K[x] > hi) break;
            yield K[x];
            x = this._succNode(K[x]);
        }
    }

    /**
     * Visit every live `(key, value)` pair in ASCENDING key order. NON-splaying: an in-order
     * walk by repeated key re-descent (no recursion, so a degenerate chain cannot overflow
     * the native stack; no scratch stack allocated). Leaves `_root` / `_version` byte-
     * identical. Unlike rangeIter this is NOT version-stamped -- mutating from within the
     * callback is the caller's responsibility (matching the other members' forEach).
     * @param {(key:number, value:number, tree:SplayTree)=>void} fn
     */
    forEach(fn) {
        const K = this._key;
        let x = this._minNode();
        while (x !== 0) {
            fn(K[x], this._value[x], this);
            x = this._succNode(K[x]);
        }
    }

    /**
     * Iterate the keys in ASCENDING order. NON-splaying (a key re-descent walk). The one
     * documented per-protocol allocator (a {value, done} per step); use forEach for the
     * alloc-free scan.
     */
    *[Symbol.iterator]() {
        const K = this._key;
        let x = this._minNode();
        while (x !== 0) {
            yield K[x];
            x = this._succNode(K[x]);
        }
    }

    /**
     * Empty the tree, keeping the fixed capacity. O(capacity) cold path: returns every node
     * to the pool and points the root at NIL. @returns {this}
     */
    clear() {
        this._pool.clear();
        this._root = 0;
        this._n = 0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    // ---- private splay + join (hot bodies) ----------------------------------

    /**
     * @private The iterative TOP-DOWN splay (Sleator & Tarjan). One downward pass moves the
     * node with `key` -- or, if absent, the last node on the search path -- to the root,
     * handling zig / zig-zig / zig-zag in place. Slot 0 is the dummy HEADER: `_right[0]`
     * accumulates the left tree, `_left[0]` the right tree; `_hl` / `_hr` are the two growing
     * hands (left-tree max / right-tree min). Restores `_left[0]` / `_right[0]` to 0 before
     * returning, so the NIL sentinel stays clean. NO recursion, NO stack, 0 B/op.
     */
    _splay(key) {
        const L = this._left, R = this._right, K = this._key;
        L[0] = 0; R[0] = 0;                       // header.left = header.right = NIL
        let lm = 0, rm = 0;                       // left-tree max / right-tree min hands (= header)
        let t = this._root;
        for (;;) {
            const kt = K[t];
            if (key < kt) {
                let tl = L[t];
                if (tl === 0) break;
                if (key < K[tl]) {                // zig-zig: rotate right
                    L[t] = R[tl];
                    R[tl] = t;
                    t = tl;
                    if (L[t] === 0) break;
                }
                L[rm] = t;                        // link right: t is the new right-tree min
                rm = t;
                t = L[t];
            } else if (key > kt) {
                let tr = R[t];
                if (tr === 0) break;
                if (key > K[tr]) {                // zig-zig: rotate left
                    R[t] = L[tr];
                    L[tr] = t;
                    t = tr;
                    if (R[t] === 0) break;
                }
                R[lm] = t;                        // link left: t is the new left-tree max
                lm = t;
                t = R[t];
            } else {
                break;
            }
        }
        // reassemble around t (the new root)
        R[lm] = L[t];                             // left-tree max . right = t.left
        L[rm] = R[t];                             // right-tree min . left  = t.right
        L[t] = R[0];                              // t.left  = header.right (left tree)
        R[t] = L[0];                              // t.right = header.left  (right tree)
        this._root = t;
        this._hl = lm; this._hr = rm;             // publish the hands (scratch, testable)
        L[0] = 0; R[0] = 0;                       // restore the NIL sentinel's columns
    }

    /**
     * @private Join after the target has been splayed to the root: free the root, then fuse
     * its two subtrees. If the left subtree is empty the right subtree becomes the tree; else
     * splay the MAX of the left subtree to its root (leaving it with no right child) and hang
     * the right subtree there. Every key of the left subtree is < every key of the right, so
     * the join preserves BST order. 0 B/op.
     */
    _joinDelete() {
        const t = this._root;
        const l = this._left[t], r = this._right[t];
        this._pool.free(t);
        if (l === 0) { this._root = r; return; }
        this._root = l;
        this._splay(Infinity);                    // drive the rightmost (max) of l to its root
        this._right[this._root] = r;              // its right child is NIL -> hang r there
    }

    // ---- private NON-splaying read descents (iteration only) ----------------

    /** @private slot of the smallest key (leftmost node), or 0 (NIL) if empty. */
    _minNode() {
        const L = this._left;
        let t = this._root;
        if (t === 0) return 0;
        while (L[t] !== 0) t = L[t];
        return t;
    }

    /** @private slot of the smallest key >= `lo`, or 0 (NIL). Non-splaying descent. */
    _ceilNode(lo) {
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best = 0;
        while (t !== 0) {
            if (K[t] >= lo) { best = t; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    /** @private slot of the smallest key STRICTLY > `key`, or 0 (NIL). Non-splaying descent. */
    _succNode(key) {
        const L = this._left, R = this._right, K = this._key;
        let t = this._root, best = 0;
        while (t !== 0) {
            if (K[t] > key) { best = t; t = L[t]; }
            else t = R[t];
        }
        return best;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] SplayTree key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] SplayTree value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badBound(b) {
        throw new TypeError(
            '[lite-logn] SplayTree rangeIter bound must be a number (not NaN), got ' + String(b));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] SplayTree rangeIter needs lo <= hi, got lo=' + String(lo) +
            ' hi=' + String(hi));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] SplayTree full (capacity ' + this._cap + ')');
    }
}
