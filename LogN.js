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
export const VERSION = '0.15.0';

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

// BinomialHeap (v0.9.0 session) -- a MERGEABLE priority queue: O(log n) meld over a SHARED arena (BELOW).

/**
 * Max BinomialHeap capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX in the shared, pointer-free `Uint32Array` forest columns (`_parent` / `_child` /
 * `_sibling` / `_order`) over a private free-list (NodePool); an index must fit an unsigned
 * 32-bit word, and `NIL = 0` reserves slot 0 so live slots run [1, capacity]. The index
 * arithmetic (Uint32 slot indices + `NIL = 0` + Uint32 orders), not the byte count, is the
 * hard ceiling -- the same "the arithmetic caps it" reasoning as the array-embedded members.
 * (This is the value the plan calls BH_MAX_CAPACITY; it is named distinctly to avoid a
 * module-scope redeclaration of BinaryHeap's identically-valued constant.)
 */
const BINH_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A BINOMIAL HEAP: the family's first MERGEABLE priority queue -- a forest of
 * heap-ordered binomial trees whose defining op is `meld` (union two heaps) in
 * O(log n) WORST-case. Where BinaryHeap / MinMaxHeap are single array-embedded heaps
 * that cannot fuse two queues without an O(n) rebuild, a binomial heap melds by
 * relinking O(log n) tree roots -- a binary carry over the two order-sorted root
 * lists, the exact structural analogue of adding two binary numbers. push is O(1)
 * amortized (O(log n) worst), popMin is O(log n) worst, peekMin is O(1) via a cached
 * `_min` root maintained inline (never rescanned on the hot path).
 *
 * LEAN, NON-ADDRESSABLE (the MinMaxHeap idiom): the surface is push / popMin /
 * peekMin / peekMinKey / meld only. The id is an OPAQUE Uint32 payload in [0, 2^32)
 * -- NOT a unique handle, no reverse map -- so there is deliberately NO decreaseKey /
 * remove / changeKey / rank / select (a decreaseKey binomial heap would need the
 * addressable per-id handle this member declines to carry). See decisions/0011.
 *
 * SHARED-ARENA meld (the load-bearing design call, decisions/0011): a binomial meld
 * REWIRES roots in place (no copy), so two heaps can only meld if they draw nodes
 * from the SAME backing arena. A standalone `new BinomialHeap(capacity, kind)` owns
 * its own arena (columns + pool); `BinomialHeap.arena(capacity, kind, count)` hands
 * out `count` empty heaps that SHARE one pool + column set, so any two of them meld.
 * `a.meld(b)` CONSUMES b -- b's roots move into a, then b is marked dead (size 0) and
 * every later op on b throws `[lite-logn]` rather than silently re-enter the now-
 * shared roots (the Treap.split/merge consume idiom, hardened with a consumed flag).
 * Cross-arena detection is COLUMN IDENTITY (`a._key !== b._key`, the Treap.merge
 * precedent); a kind mismatch (min vs max), a non-BinomialHeap arg, melding a heap
 * with itself, or a consumed operand each throw.
 *
 * Storage (allocated once per arena, sized to capacity + 1; slot 0 reserved NIL):
 *   - `_key` Float64Array  -- the priority key at each node slot.
 *   - `_id`  Uint32Array   -- the opaque payload id at each node slot.
 *   - `_parent` / `_child` / `_sibling` Uint32Array -- the forest links (NIL = 0):
 *     `_child` points at a node's HIGHEST-order child, `_sibling` chains a child list
 *     in DECREASING order (so reversing it on popMin yields an increasing root list)
 *     and chains the root list in INCREASING order.
 *   - `_order` Uint32Array -- the binomial order (degree) of the tree rooted at slot.
 *   - `_pool` NodePool     -- the shared free-list handing out slot indices [1, cap].
 * Per-heap scalars: `_head` (root-list head, NIL = 0), `_min` (cached extreme root,
 * NIL = 0), `_n` (size), `_consumed` (dead-after-meld flag).
 *
 * kind 'min' | 'max' is FROZEN at construction (a ctor-cached `_isMin` boolean drives
 * the hot compare); both operands of a meld must share kind. Keys are FINITE numbers
 * (typeof-guarded BEFORE coercion -- Symbol / BigInt / NaN / +-Infinity fail closed
 * with a `[lite-logn]` throw); the KEY door is checked FIRST, then the id, then the
 * full-arena guard (the MinMaxHeap order). Every peek / popMin on an EMPTY heap
 * returns `undefined` and NEVER throws. forEach / [Symbol.iterator] yield live ids in
 * UNSPECIFIED (forest) order -- NOT sorted, NOT pop order. Fixed capacity: a full
 * arena throws, never silently drops. Every hot op allocates ZERO bytes after
 * construction.
 */
export class BinomialHeap {
    /**
     * @param {number} capacity  exact max live entries across the whole arena; integer in [1, 2^31-1].
     * @param {'min'|'max'} [kind]  frozen heap polarity (default 'min').
     */
    constructor(capacity, kind) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > BINH_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] BinomialHeap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        const k = kind === undefined ? 'min' : kind;
        if (k !== 'min' && k !== 'max') {
            throw new RangeError(
                '[lite-logn] BinomialHeap kind must be "min" or "max", got ' + String(kind));
        }
        this._cap = capacity;                          // shared-arena node budget
        this._key = new Float64Array(capacity + 1);    // key at each node slot
        this._id = new Uint32Array(capacity + 1);      // opaque payload id at each node slot
        this._parent = new Uint32Array(capacity + 1);  // parent slot; NIL = 0
        this._child = new Uint32Array(capacity + 1);   // highest-order child slot; NIL = 0
        this._sibling = new Uint32Array(capacity + 1); // next sibling / next root; NIL = 0
        this._order = new Uint32Array(capacity + 1);   // binomial order (degree) at slot
        this._pool = new NodePool(capacity);           // shared free-list over slots [1, capacity]
        this._isMin = (k === 'min');                   // ctor-cached hot-compare polarity
        this._kind = k;                                // frozen 'min' | 'max'
        this._head = 0;                                // root-list head (increasing order), NIL = 0
        this._min = 0;                                 // cached extreme root, NIL = 0 (empty)
        this._n = 0;                                   // live entry count
        this._consumed = false;                        // dead-after-meld: reuse fails closed
    }

    /**
     * Build `count` EMPTY heaps that SHARE one backing arena (pool + columns), so any
     * two of them can `meld`. A standalone `new BinomialHeap(capacity, kind)` is the
     * count === 1 case (its own arena). The `capacity` is the arena-WIDE node budget
     * shared across all returned heaps. Fails closed on a bad capacity / kind (via the
     * constructor) or a non-integer / < 1 count.
     * @param {number} capacity  arena-wide node budget; integer in [1, 2^31-1].
     * @param {'min'|'max'} kind  frozen polarity shared by every heap in the arena.
     * @param {number} count      how many arena-sharing heaps to return; integer >= 1.
     * @returns {BinomialHeap[]}
     */
    static arena(capacity, kind, count) {
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
            throw new RangeError(
                '[lite-logn] BinomialHeap.arena count must be an integer >= 1, got ' + String(count));
        }
        const first = new BinomialHeap(capacity, kind); // validates capacity + kind, allocates the arena
        const heaps = new Array(count);
        heaps[0] = first;
        for (let i = 1; i < count; i++) heaps[i] = BinomialHeap._view(first);
        return heaps;
    }

    /** @private build an EMPTY heap VIEW sharing `src`'s arena (pool + columns). */
    static _view(src) {
        const h = Object.create(BinomialHeap.prototype);
        h._cap = src._cap;
        h._key = src._key; h._id = src._id;
        h._parent = src._parent; h._child = src._child;
        h._sibling = src._sibling; h._order = src._order;
        h._pool = src._pool;
        h._isMin = src._isMin; h._kind = src._kind;
        h._head = 0; h._min = 0; h._n = 0; h._consumed = false;
        return h;
    }

    /** Live entry count (0 once consumed by a meld). O(1). */
    get size() { return this._n; }

    /** The fixed arena-wide capacity this heap draws from. O(1). */
    get capacity() { return this._cap; }

    /** The frozen heap polarity ('min' | 'max'). O(1). */
    get kind() { return this._kind; }

    /**
     * Insert entity `id` with priority `key`. O(1) amortized (O(log n) worst -- a full
     * binary carry). Fails closed: a non-finite / non-number key (checked FIRST), a
     * non-integer / out-of-range id, a full arena, or a consumed heap each throw
     * `[lite-logn]` as a no-op (size unchanged).
     * @param {number} id   integer in [0, 2^32), an OPAQUE payload (not required unique)
     * @param {number} key  a finite number
     */
    push(id, key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 0xFFFFFFFF) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        this._key[slot] = key; this._id[slot] = id;
        this._parent[slot] = 0; this._child[slot] = 0; this._sibling[slot] = 0; this._order[slot] = 0;
        // Maintain the cached extreme root: an empty heap, or a new strictly-extreme key.
        if (this._min === 0 || (this._isMin ? key < this._key[this._min] : key > this._key[this._min])) {
            this._min = slot;
        }
        this._n++;
        this._unionInto(slot); // single-node union (binary carry); _min preserved inline
    }

    /**
     * Remove and return the id at the extreme key (min for a 'min' heap, max for a
     * 'max' heap), or `undefined` if empty (never throws on empty). O(log n) worst:
     * unlink the extreme root, reverse its child list into a sibling root list, union
     * that back, then rescan the O(log n) roots for the new extreme. Fails closed on a
     * consumed heap.
     * @returns {number|undefined}
     */
    popMin() {
        if (this._consumed) return this._badConsumed();
        const min = this._min;
        if (min === 0) return undefined; // empty
        const S = this._sibling, C = this._child, P = this._parent;
        // 1. unlink the extreme root from the root list.
        let prev = 0, r = this._head;
        while (r !== min) { prev = r; r = S[r]; }
        if (prev === 0) this._head = S[min];
        else S[prev] = S[min];
        // 2. reverse the extreme root's child list into an increasing-order root list.
        let childHead = 0, c = C[min];
        while (c !== 0) {
            const nextC = S[c];
            S[c] = childHead;
            P[c] = 0;
            childHead = c;
            c = nextC;
        }
        // 3. free the extreme slot (its links are dead now), then union the two lists.
        const outId = this._id[min];
        C[min] = 0; S[min] = 0; P[min] = 0; this._order[min] = 0;
        this._pool.free(min);
        this._n--;
        this._unionInto(childHead);
        // 4. rescan the O(log n) roots for the new extreme (popMin is O(log n) anyway).
        this._min = this._scanMin();
        return outId;
    }

    /** The id at the extreme key, or `undefined` if empty. Read-only. O(1). Consumed heap throws. */
    peekMin() {
        if (this._consumed) return this._badConsumed();
        return this._min === 0 ? undefined : this._id[this._min];
    }

    /** The extreme key, or `undefined` if empty. O(1). Consumed heap throws. */
    peekMinKey() {
        if (this._consumed) return this._badConsumed();
        return this._min === 0 ? undefined : this._key[this._min];
    }

    /**
     * MELD `other` INTO this heap in O(log n): relink the two order-sorted root lists
     * with a binary carry, folding every node of `other` into `this`. CONSUMES
     * `other` -- it becomes empty (size 0) and DEAD: any later op on it throws, so a
     * reused operand can never silently re-enter the now-shared roots. Fails closed:
     * a non-BinomialHeap arg, melding a heap with itself, a cross-arena operand
     * (column identity `this._key !== other._key`), a kind mismatch (min vs max), or a
     * consumed operand each throw `[lite-logn]`.
     * @param {BinomialHeap} other  an arena-sibling heap of the same kind (consumed)
     * @returns {this}
     */
    meld(other) {
        if (!(other instanceof BinomialHeap)) {
            throw new TypeError('[lite-logn] BinomialHeap.meld needs a BinomialHeap argument');
        }
        if (other === this) {
            throw new Error('[lite-logn] BinomialHeap.meld cannot meld a heap with itself');
        }
        if (this._consumed || other._consumed) {
            throw new Error('[lite-logn] BinomialHeap.meld operand was consumed by a prior meld');
        }
        if (this._key !== other._key) {
            throw new Error(
                '[lite-logn] BinomialHeap.meld requires two heaps sharing an arena (from BinomialHeap.arena)');
        }
        if (this._isMin !== other._isMin) {
            throw new Error(
                '[lite-logn] BinomialHeap.meld requires both heaps to share kind (min vs max)');
        }
        // Pick the extreme of the two cached roots BEFORE the carry (the carry then
        // preserves it inline through any tie-demotion).
        if (this._min === 0) this._min = other._min;
        else if (other._min !== 0 && !this._extreme(this._min, other._min)) this._min = other._min;
        this._n += other._n;
        // Consume `other` FIRST (dead + empty) so the union can never alias its state.
        const oh = other._head;
        other._head = 0; other._min = 0; other._n = 0; other._consumed = true;
        this._unionInto(oh);
        return this;
    }

    /**
     * Empty THIS heap, returning ONLY its own nodes to the shared pool (an arena
     * sibling's nodes are untouched). O(n) cold forest walk, allocation-free. A
     * consumed heap throws. @returns {this}
     */
    clear() {
        if (this._consumed) return this._badConsumed();
        this._freeForest(this._head);
        this._head = 0; this._min = 0; this._n = 0;
        return this;
    }

    /**
     * Visit every live (id, key) pair in UNSPECIFIED (forest) order -- NOT sorted, NOT
     * pop order. O(n) cold walk, allocation-free (pass a hoisted callback). Consumed
     * heap throws.
     * @param {(id:number, key:number, heap:BinomialHeap)=>void} fn
     */
    forEach(fn) {
        if (this._consumed) return this._badConsumed();
        this._forEach(this._head, fn);
    }

    /**
     * Iterate live entity ids in UNSPECIFIED (forest) order -- NOT sorted. The one
     * documented per-protocol allocator (a {value, done} per step + a sub-iterator per
     * child list); use forEach for the alloc-free scan. Consumed heap throws.
     */
    [Symbol.iterator]() {
        if (this._consumed) return this._badConsumed();
        return this._iterNode(this._head);
    }

    // ---- private hot bodies (link / carry / scan) --------------------------

    /**
     * @private true iff node `a` is the extreme (should be the parent) vs node `b`.
     * Ties resolve to `a` so the carry is deterministic. For a min heap a wins on
     * `key[a] <= key[b]`; for a max heap on `key[a] >= key[b]`.
     */
    _extreme(a, b) {
        const K = this._key;
        return this._isMin ? K[a] <= K[b] : K[a] >= K[b];
    }

    /**
     * @private make node `y` (the loser) a child of node `z` (the winner): both have
     * equal order; `z`'s order grows by one. Four link writes, zero temporaries.
     */
    _link(y, z) {
        this._parent[y] = z;
        this._sibling[y] = this._child[z];
        this._child[z] = y;
        this._order[z]++;
    }

    /**
     * @private merge two order-sorted root lists (`a`, `b`) into one order-sorted list
     * by `_sibling`, returning the head. In-place splice, no allocation.
     */
    _mergeRoots(a, b) {
        if (a === 0) return b;
        if (b === 0) return a;
        const S = this._sibling, O = this._order;
        let head, tail;
        if (O[a] <= O[b]) { head = a; a = S[a]; } else { head = b; b = S[b]; }
        tail = head;
        while (a !== 0 && b !== 0) {
            if (O[a] <= O[b]) { S[tail] = a; a = S[a]; }
            else { S[tail] = b; b = S[b]; }
            tail = S[tail];
        }
        S[tail] = a !== 0 ? a : b;
        return head;
    }

    /**
     * @private union the root list `h2` into `this._head`: merge order-sorted, then
     * walk the merged list doing a BINARY CARRY -- link consecutive equal-order roots
     * (the extreme becomes parent), skipping the classic three-in-a-row case. The
     * cached `_min` is preserved in O(1) whenever a tie demotes it to a child. This is
     * the shared hot body behind both push and meld.
     */
    _unionInto(h2) {
        const S = this._sibling, O = this._order;
        let head = this._mergeRoots(this._head, h2);
        if (head === 0) { this._head = 0; return; }
        let prev = 0, curr = head, next = S[curr];
        while (next !== 0) {
            if (O[curr] !== O[next] || (S[next] !== 0 && O[S[next]] === O[curr])) {
                prev = curr; curr = next;               // orders differ, or three in a row: advance
            } else if (this._extreme(curr, next)) {
                S[curr] = S[next];
                this._link(next, curr);                 // next -> child of curr
                if (this._min === next) this._min = curr;
            } else {
                if (prev === 0) head = next; else S[prev] = next;
                this._link(curr, next);                 // curr -> child of next
                if (this._min === curr) this._min = next;
                curr = next;
            }
            next = S[curr];
        }
        this._head = head;
    }

    /** @private scan the O(log n) root list for the extreme root, or 0 if empty. */
    _scanMin() {
        const head = this._head;
        if (head === 0) return 0;
        const S = this._sibling, K = this._key, isMin = this._isMin;
        let best = head, r = S[head];
        while (r !== 0) {
            if (isMin ? K[r] < K[best] : K[r] > K[best]) best = r;
            r = S[r];
        }
        return best;
    }

    /** @private recursive forest free: siblings iterative, children recursive (depth <= order). */
    _freeForest(node) {
        const S = this._sibling, C = this._child;
        while (node !== 0) {
            const next = S[node];
            this._freeForest(C[node]);
            this._pool.free(node);
            node = next;
        }
    }

    /** @private recursive forest visit (siblings iterative, children recursive). */
    _forEach(node, fn) {
        const S = this._sibling, C = this._child, I = this._id, K = this._key;
        while (node !== 0) {
            fn(I[node], K[node], this);
            this._forEach(C[node], fn);
            node = S[node];
        }
    }

    /** @private recursive forest id generator (the cold [Symbol.iterator] body). */
    *_iterNode(node) {
        const S = this._sibling, C = this._child, I = this._id;
        while (node !== 0) {
            yield I[node];
            yield* this._iterNode(C[node]);
            node = S[node];
        }
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badId(id) {
        throw new RangeError(
            '[lite-logn] BinomialHeap id must be an integer in [0, 2^32), got ' + String(id));
    }

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] BinomialHeap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badConsumed() {
        throw new Error('[lite-logn] BinomialHeap was consumed by a prior meld (reuse fails closed)');
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] BinomialHeap arena full (capacity ' + this._cap + ')');
    }
}

/**
 * Max PairingHeap capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns, so an index must fit an unsigned 32-bit
 * word; `NIL = 0` reserves slot 0, so live slots run [1, capacity]. The arena-wide
 * reverse map `_pos` is an `Int32Array(capacity)` (id -> slot, sentinel -1 = absent), so
 * a caller id must fit [0, capacity). The index arithmetic (Uint32 slot indices +
 * `NIL = 0` + the Int32 reverse map), not the byte count, is the hard ceiling -- the same
 * "the arithmetic caps it" reasoning as the other pointer-free members. Named distinctly
 * to avoid a module-scope redeclaration of BinaryHeap's identically-valued constant.
 */
const PH_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A PAIRING HEAP: the mergeable-heap arc's ADDRESSABLE member -- a single multi-way
 * heap-ordered tree (left-child / right-sibling) whose defining ops are a cut-and-link
 * `decreaseKey` and an O(1) `meld`, both in AMORTIZED O(log n) (popMin / decreaseKey) or
 * strict O(1) (push / peekMin / meld). Where BinomialHeap is a LEAN, NON-addressable
 * forest with opaque ids, a pairing heap carries an ARENA-WIDE reverse map so an
 * arbitrary entity can be reprioritized (decreaseKey) or evicted (remove) by its id --
 * the addressable mergeable PQ a Dijkstra / Prim relaxation loop reaches for.
 *
 * ADDRESSABLE, ARENA-WIDE-UNIQUE IDS (the LOUD contract difference vs BinomialHeap):
 * caller ids are UNIQUE integers in [0, capacity), and the reverse map `_pos` (id ->
 * slot, sentinel -1 = absent) is shared across EVERY heap drawing the arena. An id live
 * anywhere in the arena cannot be pushed again (a full-arena dup throws) -- unlike
 * BinomialHeap's opaque, non-unique payload ids. Each slot also carries an `_owner` tag
 * (the owning heap's small integer id) so `decreaseKey(id)` / `remove(id)` on an id owned
 * by a DIFFERENT live sibling heap in the same arena is O(1)-detected and throws
 * `[lite-logn]` (fail closed), never a silent cross-heap cut. See decisions/0012.
 *
 * TWO-PASS combine (the make-or-break hot path, decisions/0012 D-PH2): popMin unlinks the
 * root, then combines the root's child list left-to-right into pairs, then folds the
 * paired list right-to-left into one new root. It is ITERATIVE and POINTER-FREE -- the
 * sibling links themselves are the work list, so NO temporary array is allocated and the
 * whole drain is 0 B/op.
 *
 * SHARED-ARENA meld in O(1) (decisions/0012 D-PH3): `a.meld(b)` is a SINGLE root-link
 * (<= ~6 column writes, INDEPENDENT of |b|) plus a union alias redirecting b's heap id to
 * a's -- BETTER than BinomialHeap's O(log n) meld. It CONSUMES b (b.size -> 0, DEAD via a
 * consumed flag; every later op on b throws). The alias is a tiny union-find over heap
 * ids, so a node melded in from b still resolves its owner to a in ~O(1) (path-halved) --
 * this is why meld need NOT re-tag b's nodes (a per-heap map would make meld O(|b|), the
 * rejected alternative in D-PH1). Cross-arena is detected by COLUMN IDENTITY
 * (`this._key !== other._key`); a kind mismatch, a non-PairingHeap arg, a self-meld, or a
 * consumed operand each throw.
 *
 * Storage (allocated once per arena, sized to capacity + 1; slot 0 reserved NIL):
 *   - `_key` Float64Array   -- the priority key at each node slot.
 *   - `_id`  Uint32Array    -- the caller entity id at each node slot.
 *   - `_child` Uint32Array  -- leftmost child (NIL = 0).
 *   - `_sibling` Uint32Array -- next (right) sibling (NIL = 0).
 *   - `_parent` Uint32Array -- the PREV pointer: a leftmost child's `_parent` is its true
 *     parent; a non-leftmost node's `_parent` is its LEFT sibling; a root's is NIL. This
 *     dual role is what makes `_cut` O(1) (no sibling scan).
 *   - `_pos` Int32Array(capacity) -- ARENA-WIDE reverse map id -> slot; -1 == absent.
 *   - `_owner` Uint32Array  -- per-slot owning-heap id (0 = free slot).
 *   - `_alias` Int32Array   -- union-find over heap ids (meld redirects b's id to a's).
 *   - `_pool` NodePool      -- the shared free-list handing out slots [1, capacity].
 * Per-heap scalars: `_hid` (this heap's arena id), `_root` (NIL = 0), `_n` (size),
 * `_consumed` (dead-after-meld flag). Conservation: activeSlots + freeList === capacity.
 *
 * kind 'min' | 'max' is FROZEN at construction (a ctor-cached `_isMin` boolean drives the
 * hot compare); both operands of a meld must share kind. `decreaseKey` is named for the
 * classic min-heap op but operates TOWARD the heap's extreme (decrease for 'min',
 * increase for 'max') -- a move AWAY from the extreme is NOT supported by a cut-and-link
 * and fails closed with a `[lite-logn]` throw. Keys are FINITE numbers (typeof-guarded
 * BEFORE coercion -- the KEY door FIRST, then the id, then full / consumed). Every peek /
 * popMin on an EMPTY heap returns `undefined` and never throws. forEach / [Symbol.iterator]
 * yield live ids in UNSPECIFIED (forest) order -- NOT sorted, NOT pop order, NO version
 * stamp. Fixed capacity: a full arena throws, never silently drops. Every hot op allocates
 * ZERO bytes after construction.
 */
export class PairingHeap {
    /**
     * @param {number} capacity  exact max live entries across the whole arena; integer in [1, 2^31-1].
     * @param {'min'|'max'} [kind]  frozen heap polarity (default 'min').
     */
    constructor(capacity, kind) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > PH_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] PairingHeap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        const k = kind === undefined ? 'min' : kind;
        if (k !== 'min' && k !== 'max') {
            throw new RangeError(
                '[lite-logn] PairingHeap kind must be "min" or "max", got ' + String(kind));
        }
        const slots = capacity + 1;
        this._cap = capacity;                          // shared-arena node budget
        this._key = new Float64Array(slots);           // key at each node slot
        this._id = new Uint32Array(slots);             // caller entity id at each node slot
        this._child = new Uint32Array(slots);          // leftmost child; NIL = 0
        this._sibling = new Uint32Array(slots);        // next sibling; NIL = 0
        this._parent = new Uint32Array(slots);         // PREV pointer (parent-or-left-sibling); NIL = 0
        this._pos = new Int32Array(capacity);          // ARENA-WIDE id -> slot; -1 == absent
        this._pos.fill(-1);                            // slot 0 is a valid slot: null is not zero
        this._owner = new Uint32Array(slots);          // per-slot owning-heap id (0 = free)
        this._pool = new NodePool(capacity);           // shared free-list over slots [1, capacity]
        this._alias = new Int32Array(2);               // union-find over heap ids (hid 1 only, standalone)
        this._alias[1] = 1;
        this._isMin = (k === 'min');                   // ctor-cached hot-compare polarity
        this._kind = k;                                // frozen 'min' | 'max'
        this._hid = 1;                                 // this heap's arena id (standalone = 1)
        this._root = 0;                                // tree root slot, NIL = 0 (empty)
        this._n = 0;                                   // live entry count
        this._consumed = false;                        // dead-after-meld: reuse fails closed
    }

    /**
     * Build `count` EMPTY heaps that SHARE one backing arena (pool + columns + arena-wide
     * `_pos` reverse map + `_owner` tags), so any two of them can `meld` in O(1). A
     * standalone `new PairingHeap(capacity, kind)` is the count === 1 case (its own arena).
     * The `capacity` is the arena-WIDE node budget (and the arena-wide id domain [0,
     * capacity)) shared across all returned heaps. Fails closed on a bad capacity / kind
     * (via the constructor) or a non-integer / < 1 count.
     * @param {number} capacity  arena-wide node budget; integer in [1, 2^31-1].
     * @param {'min'|'max'} kind  frozen polarity shared by every heap in the arena.
     * @param {number} count      how many arena-sharing heaps to return; integer >= 1.
     * @returns {PairingHeap[]}
     */
    static arena(capacity, kind, count) {
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
            throw new RangeError(
                '[lite-logn] PairingHeap.arena count must be an integer >= 1, got ' + String(count));
        }
        const first = new PairingHeap(capacity, kind); // validates capacity + kind, allocates the arena
        const alias = new Int32Array(count + 1);       // union-find over heap ids 1..count
        for (let h = 1; h <= count; h++) alias[h] = h; // each heap starts as its own root
        first._alias = alias;
        const heaps = new Array(count);
        heaps[0] = first;
        for (let i = 1; i < count; i++) heaps[i] = PairingHeap._view(first, i + 1);
        return heaps;
    }

    /** @private build an EMPTY heap VIEW sharing `src`'s arena (pool + columns + maps), with heap id `hid`. */
    static _view(src, hid) {
        const h = Object.create(PairingHeap.prototype);
        h._cap = src._cap;
        h._key = src._key; h._id = src._id;
        h._child = src._child; h._sibling = src._sibling; h._parent = src._parent;
        h._pos = src._pos; h._owner = src._owner;
        h._pool = src._pool; h._alias = src._alias;
        h._isMin = src._isMin; h._kind = src._kind;
        h._hid = hid;
        h._root = 0; h._n = 0; h._consumed = false;
        return h;
    }

    /** Live entry count (0 once consumed by a meld). O(1). */
    get size() { return this._n; }

    /** The fixed arena-wide capacity this heap draws from. O(1). */
    get capacity() { return this._cap; }

    /** The frozen heap polarity ('min' | 'max'). O(1). */
    get kind() { return this._kind; }

    /**
     * Insert entity `id` with priority `key`. O(1) (a single root-link). Fails closed: a
     * non-finite / non-number key (checked FIRST), a non-integer / out-of-range id, an id
     * already live ANYWHERE in the arena (arena-wide uniqueness -- no silent overwrite), a
     * full arena, or a consumed heap each throw `[lite-logn]` as a no-op (size unchanged).
     * @param {number} id   integer in [0, capacity), UNIQUE arena-wide
     * @param {number} key  a finite number
     */
    push(id, key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        if (this._pos[id] !== -1) return this._dup(id);   // arena-wide: id live anywhere
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        this._key[slot] = key; this._id[slot] = id;
        this._child[slot] = 0; this._sibling[slot] = 0; this._parent[slot] = 0;
        this._pos[id] = slot; this._owner[slot] = this._hid;
        this._n++;
        this._root = this._root === 0 ? slot : this._linkPair(this._root, slot);
    }

    /**
     * Remove and return the id at the extreme key (min for a 'min' heap, max for a 'max'
     * heap), or `undefined` if empty (never throws on empty). AMORTIZED O(log n): unlink
     * the root, two-pass-combine its child list into a new root, release the old slot.
     * Consumed heap throws.
     * @returns {number|undefined}
     */
    popMin() {
        if (this._consumed) return this._badConsumed();
        const r = this._root;
        if (r === 0) return undefined; // empty
        const outId = this._id[r];
        const first = this._child[r];
        this._pos[outId] = -1; this._owner[r] = 0;
        this._child[r] = 0; this._sibling[r] = 0; this._parent[r] = 0;
        this._pool.free(r);
        this._n--;
        this._root = this._twoPass(first);
        return outId;
    }

    /** The id at the extreme key, or `undefined` if empty. Read-only. O(1). Consumed heap throws. */
    peekMin() {
        if (this._consumed) return this._badConsumed();
        return this._root === 0 ? undefined : this._id[this._root];
    }

    /** The extreme key, or `undefined` if empty. O(1). Consumed heap throws. */
    peekMinKey() {
        if (this._consumed) return this._badConsumed();
        return this._root === 0 ? undefined : this._key[this._root];
    }

    /**
     * Reprioritize a present entity TOWARD the heap's extreme (decrease for a 'min' heap,
     * increase for a 'max' heap). AMORTIZED O(log n): cut the node's subtree from its
     * parent's child list, then link it at the root. Fails closed: a non-finite key
     * (checked FIRST), an out-of-range id, a non-member id, an id owned by a DIFFERENT live
     * sibling heap (arena cross-heap guard), a move AWAY from the extreme (unsupported by a
     * cut-and-link), or a consumed heap each throw `[lite-logn]`.
     * @param {number} id      integer in [0, capacity), currently present in THIS heap
     * @param {number} newKey  a finite number, toward the heap's extreme
     */
    decreaseKey(id, newKey) {
        if (typeof newKey !== 'number' || !Number.isFinite(newKey)) return this._badKey(newKey);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return this._notMember(id);
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return this._badOwner(id);
        const cur = this._key[slot];
        // Toward-extreme only: a move away cannot be served by a cut-and-link -- fail closed.
        if (this._isMin ? newKey > cur : newKey < cur) return this._badDir(id);
        this._key[slot] = newKey;
        if (slot === this._root) return;             // already the extreme: nothing to cut
        this._cut(slot);                             // detach the subtree (O(1) prev-pointer)
        this._root = this._linkPair(this._root, slot);
    }

    /**
     * Remove entity `id` from THIS heap, returning true if it was present, false if it was
     * absent from the arena. AMORTIZED O(log n): cut its subtree, two-pass-combine that
     * subtree's children, link the result at the root, release the slot. Fails closed: an
     * out-of-range id, an id owned by a DIFFERENT live sibling heap, or a consumed heap
     * each throw `[lite-logn]`. Removing the root delegates to popMin.
     * @param {number} id  integer in [0, capacity)
     * @returns {boolean}
     */
    remove(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return false;               // absent from the arena
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return this._badOwner(id);
        if (slot === this._root) { this.popMin(); return true; }
        this._cut(slot);
        const first = this._child[slot];
        this._pos[id] = -1; this._owner[slot] = 0;
        this._child[slot] = 0; this._sibling[slot] = 0; this._parent[slot] = 0;
        this._pool.free(slot);
        this._n--;
        const sub = this._twoPass(first);
        if (sub !== 0) this._root = this._root === 0 ? sub : this._linkPair(this._root, sub);
        return true;
    }

    /** True iff `id` is currently in THIS heap. O(1). Out-of-range id throws; consumed heap throws. */
    has(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return false;
        return this._resolve(this._owner[slot]) === this._resolve(this._hid);
    }

    /**
     * The key currently associated with `id` in THIS heap, or `undefined` if id is absent
     * or owned by a sibling heap. O(1). Out-of-range id throws; consumed heap throws.
     * @param {number} id
     * @returns {number|undefined}
     */
    keyOf(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return undefined;
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return undefined;
        return this._key[slot];
    }

    /**
     * MELD `other` INTO this heap in O(1): a single root-link plus a union alias redirecting
     * `other`'s heap id to this -- <= ~6 column writes, INDEPENDENT of |other| (BETTER than
     * BinomialHeap's O(log n) meld). CONSUMES `other`: it becomes empty (size 0) and DEAD --
     * any later op on it throws, so a reused operand can never re-enter the shared nodes.
     * Fails closed: a non-PairingHeap arg, a self-meld, a cross-arena operand (column
     * identity `this._key !== other._key`), a kind mismatch, or a consumed operand each
     * throw `[lite-logn]`.
     * @param {PairingHeap} other  an arena-sibling heap of the same kind (consumed)
     * @returns {this}
     */
    meld(other) {
        if (!(other instanceof PairingHeap)) {
            throw new TypeError('[lite-logn] PairingHeap.meld needs a PairingHeap argument');
        }
        if (other === this) {
            throw new Error('[lite-logn] PairingHeap.meld cannot meld a heap with itself');
        }
        if (this._consumed || other._consumed) {
            throw new Error('[lite-logn] PairingHeap.meld operand was consumed by a prior meld');
        }
        if (this._key !== other._key) {
            throw new Error(
                '[lite-logn] PairingHeap.meld requires two heaps sharing an arena (from PairingHeap.arena)');
        }
        if (this._isMin !== other._isMin) {
            throw new Error(
                '[lite-logn] PairingHeap.meld requires both heaps to share kind (min vs max)');
        }
        const or = other._root;
        this._n += other._n;
        // Union alias: redirect other's heap id to THIS heap's root id, so other's nodes
        // (owner = other._hid) resolve to this in O(1) -- NO per-node re-tag (that would be O(|b|)).
        this._alias[other._hid] = this._resolve(this._hid);
        other._root = 0; other._n = 0; other._consumed = true;
        if (or !== 0) this._root = this._root === 0 ? or : this._linkPair(this._root, or);
        return this;
    }

    /**
     * Empty THIS heap, returning ONLY its own nodes to the shared pool (an arena sibling's
     * nodes are untouched). O(n) cold forest walk, allocation-free. A consumed heap throws.
     * @returns {this}
     */
    clear() {
        if (this._consumed) return this._badConsumed();
        this._freeForest(this._root);
        this._root = 0; this._n = 0;
        return this;
    }

    /**
     * Visit every live (id, key) pair in UNSPECIFIED (forest) order -- NOT sorted, NOT pop
     * order. O(n) cold walk, allocation-free (pass a hoisted callback). Consumed heap throws.
     * @param {(id:number, key:number, heap:PairingHeap)=>void} fn
     */
    forEach(fn) {
        if (this._consumed) return this._badConsumed();
        this._forEach(this._root, fn);
    }

    /**
     * Iterate live entity ids in UNSPECIFIED (forest) order -- NOT sorted. The one
     * documented per-protocol allocator (a {value, done} per step + a sub-iterator per
     * child list); use forEach for the alloc-free scan. Consumed heap throws.
     */
    [Symbol.iterator]() {
        if (this._consumed) return this._badConsumed();
        return this._iterNode(this._root);
    }

    // ---- private hot bodies (link / cut / two-pass / resolve) --------------

    /**
     * @private link two roots `a`, `b` and return the winner (the extreme). The loser
     * becomes the winner's leftmost child (prepend), maintaining the prev-pointer
     * invariant. For a min heap `a` wins on `key[a] <= key[b]`; for a max heap on `>=`.
     */
    _linkPair(a, b) {
        const K = this._key;
        let w, l;
        if (this._isMin ? K[a] <= K[b] : K[a] >= K[b]) { w = a; l = b; } else { w = b; l = a; }
        const oldChild = this._child[w];
        this._sibling[l] = oldChild;
        if (oldChild !== 0) this._parent[oldChild] = l; // old first child's PREV is now l
        this._child[w] = l;
        this._parent[l] = w;                            // l is leftmost: PREV = parent w
        this._sibling[w] = 0; this._parent[w] = 0;      // w is a root
        return w;
    }

    /**
     * @private cut node `s` (not the root) from its parent's child list in O(1) using the
     * dual-role PREV pointer: `_parent[s]` is s's true parent iff `_child[parent] === s`
     * (s is leftmost), else it is s's left sibling. Fix the right sibling's PREV, then
     * detach s (its subtree travels with it).
     */
    _cut(s) {
        const pv = this._parent[s];
        const rs = this._sibling[s];
        if (this._child[pv] === s) this._child[pv] = rs; // s was leftmost: pv is true parent
        else this._sibling[pv] = rs;                     // pv is s's left sibling
        if (rs !== 0) this._parent[rs] = pv;             // right sibling's PREV skips s
        this._parent[s] = 0; this._sibling[s] = 0;
    }

    /**
     * @private the TWO-PASS combine (D-PH2): pair the sibling list `first` left-to-right,
     * then fold the paired list right-to-left into one root. Iterative and POINTER-FREE --
     * the `_sibling` links are the work list, so NO temporary array is allocated (0 B/op).
     * PASS 1 PREPENDS each merged pair onto `list` (so `list` is in reverse pair order);
     * PASS 2 then folds `list` front-to-back, which IS right-to-left over the pairs.
     */
    _twoPass(first) {
        if (first === 0) return 0;
        const S = this._sibling;
        let list = 0, a = first;
        // PASS 1: meld adjacent pairs, prepend each result onto `list`.
        while (a !== 0) {
            const b = S[a];
            if (b === 0) { this._parent[a] = 0; S[a] = list; list = a; break; } // odd tail
            const next = S[b];
            this._parent[a] = 0; this._parent[b] = 0; S[a] = 0; S[b] = 0;
            const m = this._linkPair(a, b);
            S[m] = list; list = m;
            a = next;
        }
        // PASS 2: fold the reversed paired list into one root.
        let root = list;
        let nxt = S[root];
        S[root] = 0; this._parent[root] = 0;
        while (nxt !== 0) {
            const after = S[nxt];
            S[nxt] = 0; this._parent[nxt] = 0;
            root = this._linkPair(root, nxt);
            nxt = after;
        }
        this._sibling[root] = 0; this._parent[root] = 0;
        return root;
    }

    /**
     * @private resolve a heap id to its union-find root (the canonical live owner), with
     * path halving so a long meld chain stays ~O(1). Meld redirects a consumed operand's id
     * to its melder, so a node owned by a melded-in heap resolves to the surviving heap.
     * NOTE: the path halving WRITES the shared `_alias` array, so the read-only-looking
     * `has()` / `keyOf()` (and decreaseKey / remove) can mutate `_alias` -- a benign,
     * 0-alloc, idempotent compaction that never touches node columns, conservation, or forEach.
     */
    _resolve(h) {
        const A = this._alias;
        while (A[h] !== h) { A[h] = A[A[h]]; h = A[h]; }
        return h;
    }

    /** @private recursive forest free (siblings iterative, children recursive). */
    _freeForest(node) {
        const S = this._sibling, C = this._child, I = this._id;
        while (node !== 0) {
            const next = S[node];
            this._freeForest(C[node]);
            this._pos[I[node]] = -1; this._owner[node] = 0;
            C[node] = 0; S[node] = 0; this._parent[node] = 0;
            this._pool.free(node);
            node = next;
        }
    }

    /** @private recursive forest visit (siblings iterative, children recursive). */
    _forEach(node, fn) {
        const S = this._sibling, C = this._child, I = this._id, K = this._key;
        while (node !== 0) {
            fn(I[node], K[node], this);
            this._forEach(C[node], fn);
            node = S[node];
        }
    }

    /** @private recursive forest id generator (the cold [Symbol.iterator] body). */
    *_iterNode(node) {
        const S = this._sibling, C = this._child, I = this._id;
        while (node !== 0) {
            yield I[node];
            yield* this._iterNode(C[node]);
            node = S[node];
        }
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badId(id) {
        throw new RangeError(
            '[lite-logn] PairingHeap id must be an integer in [0, capacity), got ' + String(id));
    }

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] PairingHeap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _dup(id) {
        throw new Error('[lite-logn] PairingHeap id ' + id + ' is already live in the arena (ids are unique arena-wide)');
    }

    /** @private */
    _notMember(id) {
        throw new Error('[lite-logn] PairingHeap decreaseKey on a non-member id ' + id);
    }

    /** @private */
    _badOwner(id) {
        throw new Error('[lite-logn] PairingHeap id ' + id + ' is owned by a different live heap in the arena (fail closed)');
    }

    /** @private */
    _badDir(id) {
        throw new RangeError(
            '[lite-logn] PairingHeap.decreaseKey on id ' + id + ' must move the key TOWARD the ' +
            this._kind + ' extreme (a move away is unsupported)');
    }

    /** @private */
    _badConsumed() {
        throw new Error('[lite-logn] PairingHeap was consumed by a prior meld (reuse fails closed)');
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] PairingHeap arena full (capacity ' + this._cap + ')');
    }
}

/**
 * Max FibonacciHeap capacity: `0x7FFFFFFF` (2^31 - 1). Every node is addressed by a slot
 * INDEX stored in `Uint32Array` link columns, so an index must fit an unsigned 32-bit word;
 * `NIL = 0` reserves slot 0, so live slots run [1, capacity]. The arena-wide reverse map
 * `_pos` is an `Int32Array(capacity)` (id -> slot, sentinel -1 = absent), so a caller id must
 * fit [0, capacity). The index arithmetic (Uint32 slot indices + `NIL = 0` + the Int32 reverse
 * map), not the byte count, is the hard ceiling -- the same "the arithmetic caps it" reasoning
 * as the other pointer-free members. Named distinctly to avoid a module-scope redeclaration of
 * the identically-valued BinaryHeap / PairingHeap constant.
 */
const FH_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * log2 of the golden ratio phi = (1 + sqrt 5) / 2 -- the base of the Fibonacci-heap degree
 * bound. A node of degree k roots a subtree of at least F(k + 2) >= phi^k nodes (the mark /
 * cascading-cut invariant), so the MAX degree with n nodes is D(n) <= floor(log_phi n) ~
 * 1.4404 * log2 n -- LARGER than log2 n by ~44%. The consolidation degree-bucket must be sized
 * to this golden-ratio bound, NOT the naive ceil(log2 cap): a bucket one entry short would let a
 * consolidation write past its end (a silent no-op on a typed array -> a read of `undefined`,
 * `undefined !== 0`, an infinite/ corrupt link loop). See decisions/0013-fibonacciheap.md.
 */
const FH_LOG2_PHI = 0.6942419136306173; // Math.log2((1 + Math.sqrt(5)) / 2)

/**
 * A FIBONACCI HEAP: the mergeable-heap arc's FINALE -- the textbook-optimal addressable +
 * mergeable priority queue whose push / meld / decreaseKey are O(1) AMORTIZED and popMin /
 * remove O(log n) AMORTIZED. Where a PairingHeap reaches those SAME amortized bounds with a
 * lean two-pass combine (and usually WINS wall-clock), a Fibonacci heap reaches them by a
 * more elaborate machine -- a lazy forest of heap-ordered trees, a `decreaseKey` that CUTS a
 * subtree to the root with a CASCADING cut governed by a per-node MARK bit, and a `popMin` that
 * CONSOLIDATES the root list by degree. It is the member the textbooks name for the tightest
 * asymptotic Dijkstra / Prim bound; it is ALSO, honestly, the member the benchmark shows OFTEN
 * SLOWER wall-clock than Pairing / Binary (its constant factors are large and its spikes long).
 * Shipped for completeness and teaching, not because it is the fastest on this hardware.
 *
 * ADDRESSABLE + MERGEABLE, arena-wide-unique ids (REUSES the PairingHeap contract, D-FH1):
 * caller ids are UNIQUE integers in [0, capacity); the reverse map `_pos` (id -> slot, sentinel
 * -1 = absent) is shared across EVERY heap drawing the arena; each slot carries an `_owner` tag
 * (the owning heap's small integer id). An id live anywhere in the arena cannot be pushed again
 * (a full-arena dup throws). `decreaseKey(id)` / `remove(id)` on an id owned by a DIFFERENT live
 * sibling heap is O(1)-detected (via the union-find `_alias`, path-halved) and throws
 * `[lite-logn]` (fail closed), never a silent cross-heap cut.
 *
 * CASCADING CUT + MARK BIT (D-FH2): `decreaseKey` lowers the key toward the extreme, then if the
 * heap order with the parent breaks it `_cut`s the node's subtree to the root list (clearing its
 * mark) and `_cascade`s UP its former parent chain -- a MARKED parent is cut too and the walk
 * continues; the first UNMARKED non-root parent is marked and the walk stops. The mark is a
 * dedicated `_mark` Uint8 COLUMN (a packed bitset would buy no GC and cost hot bytes to
 * unpack). The cascade is ITERATIVE (a native while loop, NO recursion) so decreaseKey stays
 * 0 B/op. A move AWAY from the extreme is unsupported by a cut-and-link and fails closed.
 *
 * CIRCULAR LISTS + DEGREE CONSOLIDATION (D-FH3): the root list AND every child list are CIRCULAR
 * doubly-linked (`_left` / `_right`), and every node carries a `_degree`. `popMin` splices the
 * min root's children into the root list (clearing their `_parent` + mark), then CONSOLIDATES
 * via the preallocated per-arena `_bucket` (Uint32, degree -> root) -- repeatedly linking two
 * roots of equal degree until every degree is unique -- then rescans the survivors for the new
 * cached extreme. The bucket is cleared PER CALL in O(maxDegree) (only the touched slots are
 * reset, never reallocated and never left stale -- a stale entry would silently corrupt the
 * forest) and is sized to the GOLDEN-RATIO degree bound (see FH_LOG2_PHI), not the naive
 * ceil(log2 cap). The cached extreme is maintained inline on push / meld / decreaseKey.
 *
 * SHARED-ARENA meld in O(1) (D-FH4): `a.meld(b)` CONCATENATES the two circular root lists (a
 * handful of link writes, INDEPENDENT of |b|) + a union `_alias` redirect of b's heap id to a's
 * + a cached-extreme update. It CONSUMES b (b.size -> 0, DEAD via a consumed flag; every later
 * op on b throws). The alias is exactly how the PairingHeap avoids re-tagging b's nodes -- a
 * per-heap map would make meld O(|b|), the rejected alternative. Cross-arena is detected by
 * COLUMN IDENTITY (`this._key !== other._key`); a kind mismatch, a non-FibonacciHeap arg, a
 * self-meld, or a consumed operand each throw.
 *
 * Storage (allocated once per arena, sized to capacity + 1; slot 0 reserved NIL):
 *   - `_key` Float64Array   -- the priority key at each node slot.
 *   - `_id`  Uint32Array    -- the caller entity id at each node slot.
 *   - `_left` / `_right` Uint32Array -- the CIRCULAR doubly-linked list at this node's level.
 *   - `_child` Uint32Array  -- an arbitrary child (NIL = 0); its siblings ring it circularly.
 *   - `_parent` Uint32Array -- the parent (NIL = 0 for a root).
 *   - `_degree` Uint32Array -- the child count of this node.
 *   - `_mark` Uint8Array    -- 1 iff this node has lost a child since it last became a child.
 *   - `_pos` Int32Array(capacity) -- ARENA-WIDE reverse map id -> slot; -1 == absent.
 *   - `_owner` Uint32Array  -- per-slot owning-heap id (0 = free slot).
 *   - `_alias` Int32Array   -- union-find over heap ids (meld redirects b's id to a's).
 *   - `_bucket` Uint32Array -- per-ARENA degree-bucket consolidation scratch (popMin is one at a
 *     time, so one shared scratch suffices), sized to the golden-ratio degree bound.
 *   - `_pool` NodePool      -- the shared free-list handing out slots [1, capacity].
 * Per-heap scalars: `_hid` (this heap's arena id), `_min` (cached extreme root, NIL = 0), `_n`
 * (size), `_consumed` (dead-after-meld flag). Conservation: activeSlots + freeList === capacity.
 *
 * kind 'min' | 'max' is FROZEN at construction (a ctor-cached `_isMin` boolean drives the hot
 * compare); both operands of a meld must share kind. Keys are FINITE numbers (typeof-guarded
 * BEFORE coercion -- the KEY door FIRST, then the id, then consumed / dup / full). Every peek /
 * popMin on an EMPTY heap returns `undefined` and never throws. forEach / [Symbol.iterator]
 * yield live ids in UNSPECIFIED (forest) order -- NOT sorted, NOT pop order. Fixed capacity: a
 * full arena throws, never silently drops. Every hot op allocates ZERO bytes after construction.
 * AMORTIZED honesty: the MAX single popMin (a long consolidation) AND the MAX single decreaseKey
 * (a long cascading cut) are DISCLOSED by the witness, never gated. See decisions/0013.
 */
export class FibonacciHeap {
    /**
     * @param {number} capacity  exact max live entries across the whole arena; integer in [1, 2^31-1].
     * @param {'min'|'max'} [kind]  frozen heap polarity (default 'min').
     */
    constructor(capacity, kind) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > FH_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] FibonacciHeap capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        const k = kind === undefined ? 'min' : kind;
        if (k !== 'min' && k !== 'max') {
            throw new RangeError(
                '[lite-logn] FibonacciHeap kind must be "min" or "max", got ' + String(kind));
        }
        const slots = capacity + 1;
        this._cap = capacity;                          // shared-arena node budget
        this._key = new Float64Array(slots);           // key at each node slot
        this._id = new Uint32Array(slots);             // caller entity id at each node slot
        this._left = new Uint32Array(slots);           // circular prev; self = singleton
        this._right = new Uint32Array(slots);          // circular next; self = singleton
        this._child = new Uint32Array(slots);          // an arbitrary child; NIL = 0
        this._parent = new Uint32Array(slots);         // parent; NIL = 0 (root)
        this._degree = new Uint32Array(slots);         // child count
        this._mark = new Uint8Array(slots);            // lost-a-child bit (1 = marked)
        this._pos = new Int32Array(capacity);          // ARENA-WIDE id -> slot; -1 == absent
        this._pos.fill(-1);                            // slot 0 is a valid slot: null is not zero
        this._owner = new Uint32Array(slots);          // per-slot owning-heap id (0 = free)
        this._pool = new NodePool(capacity);           // shared free-list over slots [1, capacity]
        this._alias = new Int32Array(2);               // union-find over heap ids (hid 1 only)
        this._alias[1] = 1;
        // Degree-bucket scratch sized to the GOLDEN-RATIO bound (D-FH3): D(n) <= floor(log_phi n),
        // ~1.44 * log2 n, so ceil(log2 cap) would undersize it. +2 slack covers the ceil + the
        // one-past terminal slot the link loop writes.
        this._bucket = new Uint32Array(Math.ceil(Math.log2(capacity + 1) / FH_LOG2_PHI) + 2);
        this._isMin = (k === 'min');                   // ctor-cached hot-compare polarity
        this._kind = k;                                // frozen 'min' | 'max'
        this._hid = 1;                                 // this heap's arena id (standalone = 1)
        this._min = 0;                                 // cached extreme root, NIL = 0 (empty)
        this._n = 0;                                   // live entry count
        this._consumed = false;                        // dead-after-meld: reuse fails closed
    }

    /**
     * Build `count` EMPTY heaps that SHARE one backing arena (pool + columns + arena-wide `_pos`
     * reverse map + `_owner` tags + the `_alias` union-find + the `_bucket` consolidation scratch),
     * so any two of them can `meld` in O(1). A standalone `new FibonacciHeap(capacity, kind)` is the
     * count === 1 case (its own arena). The `capacity` is the arena-WIDE node budget (and the
     * arena-wide id domain [0, capacity)) shared across all returned heaps. Fails closed on a bad
     * capacity / kind (via the constructor) or a non-integer / < 1 count.
     * @param {number} capacity  arena-wide node budget; integer in [1, 2^31-1].
     * @param {'min'|'max'} kind  frozen polarity shared by every heap in the arena.
     * @param {number} count      how many arena-sharing heaps to return; integer >= 1.
     * @returns {FibonacciHeap[]}
     */
    static arena(capacity, kind, count) {
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
            throw new RangeError(
                '[lite-logn] FibonacciHeap.arena count must be an integer >= 1, got ' + String(count));
        }
        const first = new FibonacciHeap(capacity, kind); // validates capacity + kind, allocates arena
        const alias = new Int32Array(count + 1);         // union-find over heap ids 1..count
        for (let h = 1; h <= count; h++) alias[h] = h;   // each heap starts as its own root
        first._alias = alias;
        const heaps = new Array(count);
        heaps[0] = first;
        for (let i = 1; i < count; i++) heaps[i] = FibonacciHeap._view(first, i + 1);
        return heaps;
    }

    /** @private build an EMPTY heap VIEW sharing `src`'s arena (pool + columns + maps + scratch), hid `hid`. */
    static _view(src, hid) {
        const h = Object.create(FibonacciHeap.prototype);
        h._cap = src._cap;
        h._key = src._key; h._id = src._id;
        h._left = src._left; h._right = src._right;
        h._child = src._child; h._parent = src._parent; h._degree = src._degree; h._mark = src._mark;
        h._pos = src._pos; h._owner = src._owner;
        h._pool = src._pool; h._alias = src._alias; h._bucket = src._bucket;
        h._isMin = src._isMin; h._kind = src._kind;
        h._hid = hid;
        h._min = 0; h._n = 0; h._consumed = false;
        return h;
    }

    /** Live entry count (0 once consumed by a meld). O(1). */
    get size() { return this._n; }

    /** The fixed arena-wide capacity this heap draws from. O(1). */
    get capacity() { return this._cap; }

    /** The frozen heap polarity ('min' | 'max'). O(1). */
    get kind() { return this._kind; }

    /**
     * Insert entity `id` with priority `key`. O(1) (a singleton splice into the root list). Fails
     * closed: a non-finite / non-number key (checked FIRST), a non-integer / out-of-range id, an id
     * already live ANYWHERE in the arena (arena-wide uniqueness -- no silent overwrite), a full
     * arena, or a consumed heap each throw `[lite-logn]` as a no-op (size unchanged).
     * @param {number} id   integer in [0, capacity), UNIQUE arena-wide
     * @param {number} key  a finite number
     */
    push(id, key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        if (this._pos[id] !== -1) return this._dup(id);   // arena-wide: id live anywhere
        const slot = this._pool.alloc();
        if (slot === 0) return this._full();
        this._key[slot] = key; this._id[slot] = id;
        this._child[slot] = 0; this._parent[slot] = 0; this._degree[slot] = 0; this._mark[slot] = 0;
        this._left[slot] = slot; this._right[slot] = slot; // singleton circular list
        this._pos[id] = slot; this._owner[slot] = this._hid;
        this._n++;
        this._addRoot(slot);
    }

    /**
     * Remove and return the id at the extreme key (min for a 'min' heap, max for a 'max' heap), or
     * `undefined` if empty (never throws on empty). AMORTIZED O(log n): splice the min root's
     * children into the root list, release the old slot, CONSOLIDATE the root list by degree, and
     * rescan for the new cached extreme. Consumed heap throws.
     * @returns {number|undefined}
     */
    popMin() {
        if (this._consumed) return this._badConsumed();
        const z = this._min;
        if (z === 0) return undefined; // empty
        const outId = this._id[z];
        const c = this._child[z];
        if (c !== 0) {
            // clear each child's parent + mark, then splice the whole child ring into the root list
            let x = c;
            do { this._parent[x] = 0; this._mark[x] = 0; x = this._right[x]; } while (x !== c);
            const zr = this._right[z], cl = this._left[c];
            this._right[z] = c; this._left[c] = z;
            this._right[cl] = zr; this._left[zr] = cl;
            this._child[z] = 0;
        }
        // unlink z from the root list
        const zl = this._left[z], zr = this._right[z];
        this._pos[outId] = -1; this._owner[z] = 0;
        this._degree[z] = 0; this._mark[z] = 0; this._parent[z] = 0; this._child[z] = 0;
        this._pool.free(z);
        this._n--;
        if (zr === z) {
            // z was the only root -> heap now empty
            this._left[z] = z; this._right[z] = z;
            this._min = 0;
        } else {
            this._right[zl] = zr; this._left[zr] = zl;
            this._left[z] = z; this._right[z] = z;
            this._min = zr;      // provisional; consolidate finds the true extreme
            this._consolidate();
        }
        return outId;
    }

    /** The id at the extreme key, or `undefined` if empty. Read-only. O(1). Consumed heap throws. */
    peekMin() {
        if (this._consumed) return this._badConsumed();
        return this._min === 0 ? undefined : this._id[this._min];
    }

    /** The extreme key, or `undefined` if empty. O(1). Consumed heap throws. */
    peekMinKey() {
        if (this._consumed) return this._badConsumed();
        return this._min === 0 ? undefined : this._key[this._min];
    }

    /**
     * Reprioritize a present entity TOWARD the heap's extreme (decrease for a 'min' heap, increase
     * for a 'max' heap). AMORTIZED O(1): lower the key; if the heap order with the parent breaks,
     * cut the node's subtree to the root and CASCADE up its former parent chain (marked parents cut
     * too, the first unmarked non-root marked). Fails closed: a non-finite key (checked FIRST), an
     * out-of-range id, a non-member id, an id owned by a DIFFERENT live sibling heap (arena cross-
     * heap guard), a move AWAY from the extreme, or a consumed heap each throw `[lite-logn]`.
     * @param {number} id      integer in [0, capacity), currently present in THIS heap
     * @param {number} newKey  a finite number, toward the heap's extreme
     */
    decreaseKey(id, newKey) {
        if (typeof newKey !== 'number' || !Number.isFinite(newKey)) return this._badKey(newKey);
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return this._notMember(id);
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return this._badOwner(id);
        const cur = this._key[slot];
        // Toward-extreme only: a move away cannot be served by a cut-and-link -- fail closed.
        if (this._isMin ? newKey > cur : newKey < cur) return this._badDir(id);
        this._key[slot] = newKey;
        const p = this._parent[slot];
        if (p !== 0 && (this._isMin ? newKey < this._key[p] : newKey > this._key[p])) {
            this._cut(slot);       // detach the subtree, splice at root, clear mark
            this._cascade(p);      // walk up: cut marked ancestors iteratively
        }
        // s is now a root iff it was cut (or already a root); catch a new cached extreme.
        if (this._parent[slot] === 0 &&
            (this._isMin ? newKey < this._key[this._min] : newKey > this._key[this._min])) {
            this._min = slot;
        }
    }

    /**
     * Remove entity `id` from THIS heap, returning true if it was present, false if it was absent
     * from the arena. AMORTIZED O(log n): cut its subtree to the root, cascade, then make it the
     * cached extreme and popMin it (splices its children, consolidates). Fails closed: an out-of-
     * range id, an id owned by a DIFFERENT live sibling heap, or a consumed heap each throw
     * `[lite-logn]`.
     * @param {number} id  integer in [0, capacity)
     * @returns {boolean}
     */
    remove(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return false;               // absent from the arena
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return this._badOwner(id);
        const p = this._parent[slot];
        if (p !== 0) { this._cut(slot); this._cascade(p); }
        this._min = slot;                            // force this node to be the extreme removed
        this.popMin();
        return true;
    }

    /** True iff `id` is currently in THIS heap. O(1). Out-of-range id throws; consumed heap throws. */
    has(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return false;
        return this._resolve(this._owner[slot]) === this._resolve(this._hid);
    }

    /**
     * The key currently associated with `id` in THIS heap, or `undefined` if id is absent or owned
     * by a sibling heap. O(1). Out-of-range id throws; consumed heap throws.
     * @param {number} id
     * @returns {number|undefined}
     */
    keyOf(id) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= this._cap) {
            return this._badId(id);
        }
        if (this._consumed) return this._badConsumed();
        const slot = this._pos[id];
        if (slot === -1) return undefined;
        if (this._resolve(this._owner[slot]) !== this._resolve(this._hid)) return undefined;
        return this._key[slot];
    }

    /**
     * MELD `other` INTO this heap in O(1): CONCATENATE the two circular root lists (a handful of
     * link writes, INDEPENDENT of |other|) plus a union alias redirecting `other`'s heap id to this
     * and a cached-extreme update. CONSUMES `other`: it becomes empty (size 0) and DEAD -- any later
     * op on it throws, so a reused operand can never re-enter the shared nodes. Fails closed: a
     * non-FibonacciHeap arg, a self-meld, a cross-arena operand (column identity `this._key !==
     * other._key`), a kind mismatch, or a consumed operand each throw `[lite-logn]`.
     * @param {FibonacciHeap} other  an arena-sibling heap of the same kind (consumed)
     * @returns {this}
     */
    meld(other) {
        if (!(other instanceof FibonacciHeap)) {
            throw new TypeError('[lite-logn] FibonacciHeap.meld needs a FibonacciHeap argument');
        }
        if (other === this) {
            throw new Error('[lite-logn] FibonacciHeap.meld cannot meld a heap with itself');
        }
        if (this._consumed || other._consumed) {
            throw new Error('[lite-logn] FibonacciHeap.meld operand was consumed by a prior meld');
        }
        if (this._key !== other._key) {
            throw new Error(
                '[lite-logn] FibonacciHeap.meld requires two heaps sharing an arena (from FibonacciHeap.arena)');
        }
        if (this._isMin !== other._isMin) {
            throw new Error(
                '[lite-logn] FibonacciHeap.meld requires both heaps to share kind (min vs max)');
        }
        const om = other._min;
        this._n += other._n;
        // Union alias: redirect other's heap id to THIS heap's root id, so other's nodes
        // (owner = other._hid) resolve to this in O(1) -- NO per-node re-tag (that would be O(|b|)).
        this._alias[other._hid] = this._resolve(this._hid);
        other._min = 0; other._n = 0; other._consumed = true;
        if (om !== 0) {
            if (this._min === 0) {
                this._min = om;
            } else {
                // concatenate the two circular root lists (a's entry = _min, b's entry = om)
                const a = this._min, aR = this._right[a], bL = this._left[om];
                this._right[a] = om; this._left[om] = a;
                this._right[bL] = aR; this._left[aR] = bL;
                if (this._isMin ? this._key[om] < this._key[a] : this._key[om] > this._key[a]) {
                    this._min = om;
                }
            }
        }
        return this;
    }

    /**
     * Empty THIS heap, returning ONLY its own nodes to the shared pool (an arena sibling's nodes are
     * untouched). O(n) cold forest walk, allocation-free. A consumed heap throws.
     * @returns {this}
     */
    clear() {
        if (this._consumed) return this._badConsumed();
        this._freeForest(this._min);
        this._min = 0; this._n = 0;
        return this;
    }

    /**
     * Visit every live (id, key) pair in UNSPECIFIED (forest) order -- NOT sorted, NOT pop order.
     * O(n) cold walk, allocation-free (pass a hoisted callback). Consumed heap throws.
     * @param {(id:number, key:number, heap:FibonacciHeap)=>void} fn
     */
    forEach(fn) {
        if (this._consumed) return this._badConsumed();
        this._forEach(this._min, fn);
    }

    /**
     * Iterate live entity ids in UNSPECIFIED (forest) order -- NOT sorted. The one documented
     * per-protocol allocator (a {value, done} per step + a sub-iterator per child ring); use forEach
     * for the alloc-free scan. Consumed heap throws.
     */
    [Symbol.iterator]() {
        if (this._consumed) return this._badConsumed();
        return this._iterNode(this._min);
    }

    // ---- private hot bodies (add-root / cut / cascade / consolidate / link) ----

    /**
     * @private splice a self-circular node `s` into the root list (adjacent to the cached extreme)
     * and update the cached extreme if `s` beats it. O(1).
     */
    _addRoot(s) {
        const m = this._min;
        if (m === 0) { this._min = s; return; } // s is already self-circular
        const r = this._right[m];
        this._right[m] = s; this._left[s] = m; this._right[s] = r; this._left[r] = s;
        if (this._isMin ? this._key[s] < this._key[m] : this._key[s] > this._key[m]) this._min = s;
    }

    /**
     * @private cut node `s` from its parent's child ring in O(1): unlink it from the ring, fix the
     * parent's `_child` handle + degree, clear its parent + mark, then splice it into the root list.
     */
    _cut(s) {
        const p = this._parent[s];
        if (this._right[s] === s) {
            this._child[p] = 0;                          // s was the only child
        } else {
            const l = this._left[s], r = this._right[s];
            this._right[l] = r; this._left[r] = l;
            if (this._child[p] === s) this._child[p] = r; // move the parent's handle off s
        }
        this._degree[p]--;
        this._parent[s] = 0; this._mark[s] = 0;
        this._left[s] = s; this._right[s] = s;
        this._addRoot(s);
    }

    /**
     * @private the CASCADING cut (D-FH2): walk UP from `y`. Stop at a root. A MARKED non-root parent
     * is cut too and the walk continues to ITS parent; the first UNMARKED non-root parent is marked
     * and the walk stops. ITERATIVE (a native loop, no recursion) so decreaseKey stays 0 B/op.
     */
    _cascade(y) {
        while (y !== 0) {
            const z = this._parent[y];
            if (z === 0) break;                 // y is a root: done
            if (this._mark[y] === 0) { this._mark[y] = 1; break; } // first unmarked: mark + stop
            this._cut(y);                       // marked: cut y to the root list
            y = z;                              // continue up to y's former parent
        }
    }

    /**
     * @private CONSOLIDATE the root list by degree (D-FH3): repeatedly link two roots of equal
     * degree via the degree-bucket `_bucket` until every surviving root has a unique degree, then
     * rescan for the new cached extreme. The bucket is cleared PER CALL in O(maxDegree) (only the
     * touched slots are reset -- NEVER reallocated, NEVER left stale). Iterating the ORIGINAL root
     * list `cnt` times (saving `next` before each node can be re-linked) is the standard alloc-free
     * traversal of a list that mutates as it links.
     */
    _consolidate() {
        const A = this._bucket, K = this._key, R = this._right;
        const start = this._min;
        let cnt = 1;
        { let x = R[start]; while (x !== start) { cnt++; x = R[x]; } } // count roots (O(#roots))
        let cur = start, maxd = 0;
        for (let i = 0; i < cnt; i++) {
            const next = R[cur];                 // save BEFORE cur can be re-linked as a child
            let x = cur, d = this._degree[x];
            while (A[d] !== 0) {                  // NIL = 0 is the empty-bucket sentinel
                let y = A[d];
                if (this._isMin ? K[x] > K[y] : K[x] < K[y]) { const t = x; x = y; y = t; }
                this._link(y, x);                // y (the loser) becomes a child of x (the winner)
                A[d] = 0;
                d++;
            }
            A[d] = x;
            if (d > maxd) maxd = d;
            cur = next;
        }
        // rescan the buckets for the new cached extreme, clearing every touched slot.
        this._min = 0;
        for (let d = 0; d <= maxd; d++) {
            const r = A[d];
            if (r !== 0) {
                if (this._min === 0 ||
                    (this._isMin ? K[r] < K[this._min] : K[r] > K[this._min])) this._min = r;
                A[d] = 0;                        // clear the touched slot: never leave it stale
            }
        }
    }

    /**
     * @private link two roots: `y` (removed from the root list) becomes a child of `x`. Increments
     * x's degree, clears y's mark. O(1).
     */
    _link(y, x) {
        const yl = this._left[y], yr = this._right[y];
        this._right[yl] = yr; this._left[yr] = yl;   // unlink y from the root list
        this._parent[y] = x;
        const c = this._child[x];
        if (c === 0) {
            this._child[x] = y; this._left[y] = y; this._right[y] = y;
        } else {
            const cr = this._right[c];
            this._right[c] = y; this._left[y] = c; this._right[y] = cr; this._left[cr] = y;
        }
        this._degree[x]++;
        this._mark[y] = 0;
    }

    /**
     * @private resolve a heap id to its union-find root (the canonical live owner), with path
     * halving so a long meld chain stays ~O(1). Meld redirects a consumed operand's id to its
     * melder, so a node owned by a melded-in heap resolves to the surviving heap. NOTE: the path
     * halving WRITES the shared `_alias`, so the read-only-looking has() / keyOf() (and decreaseKey /
     * remove) can mutate `_alias` -- a benign, 0-alloc, idempotent compaction that never touches
     * node columns, conservation, or forEach.
     */
    _resolve(h) {
        const A = this._alias;
        while (A[h] !== h) { A[h] = A[A[h]]; h = A[h]; }
        return h;
    }

    /** @private recursive forest free (a circular ring at each level; children recursed). */
    _freeForest(entry) {
        if (entry === 0) return;
        const R = this._right, C = this._child, I = this._id;
        let x = entry;
        do {
            const nxt = R[x];
            const c = C[x];
            this._pos[I[x]] = -1; this._owner[x] = 0;
            this._child[x] = 0; this._parent[x] = 0; this._degree[x] = 0; this._mark[x] = 0;
            this._left[x] = x; this._right[x] = x;
            this._pool.free(x);
            if (c !== 0) this._freeForest(c);
            x = nxt;
        } while (x !== entry);
    }

    /** @private recursive forest visit (a circular ring at each level; children recursed). */
    _forEach(entry, fn) {
        if (entry === 0) return;
        const R = this._right, C = this._child, I = this._id, K = this._key;
        let x = entry;
        do {
            fn(I[x], K[x], this);
            if (C[x] !== 0) this._forEach(C[x], fn);
            x = R[x];
        } while (x !== entry);
    }

    /** @private recursive forest id generator (the cold [Symbol.iterator] body). */
    *_iterNode(entry) {
        if (entry === 0) return;
        const R = this._right, C = this._child, I = this._id;
        let x = entry;
        do {
            yield I[x];
            yield* this._iterNode(C[x]);
            x = R[x];
        } while (x !== entry);
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badId(id) {
        throw new RangeError(
            '[lite-logn] FibonacciHeap id must be an integer in [0, capacity), got ' + String(id));
    }

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] FibonacciHeap key must be a finite number, got ' + String(key));
    }

    /** @private */
    _dup(id) {
        throw new Error('[lite-logn] FibonacciHeap id ' + id + ' is already live in the arena (ids are unique arena-wide)');
    }

    /** @private */
    _notMember(id) {
        throw new Error('[lite-logn] FibonacciHeap decreaseKey on a non-member id ' + id);
    }

    /** @private */
    _badOwner(id) {
        throw new Error('[lite-logn] FibonacciHeap id ' + id + ' is owned by a different live heap in the arena (fail closed)');
    }

    /** @private */
    _badDir(id) {
        throw new RangeError(
            '[lite-logn] FibonacciHeap.decreaseKey on id ' + id + ' must move the key TOWARD the ' +
            this._kind + ' extreme (a move away is unsupported)');
    }

    /** @private */
    _badConsumed() {
        throw new Error('[lite-logn] FibonacciHeap was consumed by a prior meld (reuse fails closed)');
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] FibonacciHeap arena full (capacity ' + this._cap + ')');
    }
}

/**
 * Max Fenwick2D backing cell count: `(rows + 1) * (cols + 1)` must fit a single
 * `Float64Array` AND stay a positive safe int32 index for the flat `r' * w + c'`
 * address arithmetic, so the PRODUCT is capped at `0x7FFFFFFF` (2^31 - 1). The
 * ceiling is checked with a FLOAT multiply -- NEVER `| 0` -- because `| 0` would
 * wrap a large product to a small or negative int that sails through the door
 * (fail OPEN); the float product is exact up to 2^53, well past the ceiling, so a
 * genuine overflow fails CLOSED. Named distinctly to avoid a module-scope
 * redeclaration of the identically-valued 1D Fenwick / BinaryHeap constant.
 */
const F2D_MAX_CELLS = 0x7FFFFFFF; // 2^31 - 1

/**
 * A 2D Fenwick tree (2D Binary Indexed Tree): a point-update AND a rectangle-sum,
 * BOTH O(log^2 n), over a SINGLE flat `Float64Array` -- the lowest-set-bit walk
 * (`i & -i`) NESTED over two dimensions. The second dimension is not free: the
 * price is a SQUARED log (one i&-i climb per dimension), and the witness proves
 * the square is straight (a line on a `(log2 n)^2` axis, not `log2 n`).
 *
 * Layout: one flat `Float64Array((rows + 1) * (cols + 1))`, 1-based in BOTH dims.
 * Public coordinates are 0-based `(r, c)` in `[0, rows) x [0, cols)`; each maps to
 * `(r + 1, c + 1)` at flat index `(r + 1) * (cols + 1) + (c + 1)`. Row 0 and col 0
 * are the unused identity sentinels -- never a legal cell (null is not zero: a 0
 * slot means "no cell", not "the element at 0"). Every cell holds, spread across a
 * logarithmic set of positions, a piece of the 2D prefix sum.
 *
 * The two nested walks are the whole structure:
 *   - `update(r, c, delta)` CLIMBS both dims: from `i = r + 1` step `i += i & -i`
 *     (until `i > rows`), and inside from `j = c + 1` step `j += j & -j` (until
 *     `j > cols`), one `_t` touch per (i, j) level pair.
 *   - `_pfx(r, c)` DESCENDS both dims: from `i = r + 1` step `i -= i & -i` (until
 *     `i == 0`), and inside from `j = c + 1` step `j -= j & -j`, summing one cell
 *     per level pair. `_pfx(-1, .)` and `_pfx(., -1)` are 0 by a `k = 0` loop-skip
 *     -- never an index `-1` read (the clean empty-prefix base case).
 * Both take at most `log2(rows) * log2(cols)` steps -- the squared logarithm.
 *
 * Rectangle sum uses 2D inclusion-exclusion:
 *   `rectSum(r1,c1,r2,c2) = P(r2,c2) - P(r1-1,c2) - P(r2,c1-1) + P(r1-1,c1-1)`,
 * inlined as four nested descents; when `r1 == 0` or `c1 == 0` the corresponding
 * term collapses to 0 via the `k = 0` loop-skip (never a `prefix(-1)` call).
 *
 * SUM-ONLY: the value is an invertible group (addition), exactly the 1D Fenwick
 * limitation lifted to 2D. Rectangle MIN / MAX / GCD are NOT supported -- they need
 * a future 2D SegmentTree and are the DOCUMENTED not-for. Values are `Float64`;
 * deltas and values may be ANY finite number (negatives included). NaN / +-Infinity
 * / non-number fail closed (typeof-guarded BEFORE coercion). WORST-CASE member (a
 * BIT has no randomization or amortization); every hot op allocates zero bytes.
 *
 * Fixed dimensions: `rows` and `cols` are frozen at construction; there is no grow.
 * Every out-of-range coordinate and every non-finite value is a hard `[lite-logn]`
 * throw. See decisions/0014-fenwick2d.md.
 */
export class Fenwick2D {
    /**
     * @param {number} rows  row count; integer >= 1.
     * @param {number} cols  column count; integer >= 1.
     */
    constructor(rows, cols) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1) {
            throw new RangeError(
                '[lite-logn] Fenwick2D rows must be an integer >= 1, got ' + String(rows));
        }
        if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1) {
            throw new RangeError(
                '[lite-logn] Fenwick2D cols must be an integer >= 1, got ' + String(cols));
        }
        // FLOAT product (never `| 0`): `| 0` would wrap a large product to a small /
        // negative int and pass the door (fail OPEN). The float product is exact to
        // 2^53, so a genuine overflow of the 2^31-1 cell ceiling fails CLOSED.
        const cells = (rows + 1) * (cols + 1);
        if (cells > F2D_MAX_CELLS) {
            throw new RangeError(
                '[lite-logn] Fenwick2D grid too large: (rows+1)*(cols+1) = ' + cells +
                ' exceeds ' + F2D_MAX_CELLS);
        }
        this._r = rows;                       // row count (fixed)
        this._c = cols;                       // column count (fixed)
        this._w = cols + 1;                   // row stride (1-based cols + sentinel col 0)
        this._t = new Float64Array(cells);    // flat (rows+1) x (cols+1); row 0 / col 0 sentinels
    }

    /** Row count this tree was sized for. O(1). */
    get rows() { return this._r; }

    /** Column count this tree was sized for. O(1). */
    get cols() { return this._c; }

    /**
     * Unvalidated 2D prefix sum over `[0..r] x [0..c]` (public 0-based coords). The
     * nested `i & -i` descent -- the whole structure, reused (inlined) by prefix /
     * rectSum / at / set. `r === -1` or `c === -1` yields 0 by a `k = 0` loop-skip
     * (never a `_t[-1]` read). PRIVATE + hot: no validation, no allocation.
     * @private
     * @param {number} r  integer in [-1, rows)
     * @param {number} c  integer in [-1, cols)
     * @returns {number}
     */
    _pfx(r, c) {
        const t = this._t, w = this._w;
        let s = 0;
        for (let i = r + 1; i > 0; i -= i & -i) {
            const b = i * w;
            for (let j = c + 1; j > 0; j -= j & -j) s += t[b + j];
        }
        return s;
    }

    /**
     * Add `delta` to the cell at 0-based `(r, c)`. O(log^2 n): climb both dims by
     * the lowest set bit, one `_t` touch per (i, j) level pair. Fails closed: a
     * non-finite delta (typeof-guarded first) or an out-of-range coordinate throws.
     * @param {number} r      integer in [0, rows)
     * @param {number} c      integer in [0, cols)
     * @param {number} delta  a finite number (may be negative)
     * @returns {this}
     */
    update(r, c, delta) {
        if (typeof delta !== 'number' || !Number.isFinite(delta)) return this._badDelta(delta);
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= this._r) return this._badRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= this._c) return this._badCol(c);
        const t = this._t, w = this._w, rows = this._r, cols = this._c;
        for (let i = r + 1; i <= rows; i += i & -i) {
            const b = i * w;
            for (let j = c + 1; j <= cols; j += j & -j) t[b + j] += delta;
        }
        return this;
    }

    /**
     * Sum of the rectangle `[0..r] x [0..c]` INCLUSIVE (the 2D prefix). O(log^2 n).
     * `prefix(-1, .)` and `prefix(., -1)` are 0 (the empty-prefix base case); the
     * valid domain is `[-1, rows) x [-1, cols)`. Out-of-range throws `[lite-logn]`.
     * @param {number} r  integer in [-1, rows)
     * @param {number} c  integer in [-1, cols)
     * @returns {number}
     */
    prefix(r, c) {
        if (typeof r !== 'number' || !Number.isInteger(r) || r < -1 || r >= this._r) return this._badPrefixRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < -1 || c >= this._c) return this._badPrefixCol(c);
        return this._pfx(r, c);
    }

    /**
     * Sum of the rectangle `[r1..r2] x [c1..c2]` INCLUSIVE on all four edges, via 2D
     * inclusion-exclusion `P(r2,c2) - P(r1-1,c2) - P(r2,c1-1) + P(r1-1,c1-1)`, with
     * the four nested descents inlined (no `_pfx` call, no intermediate object).
     * O(log^2 n). When `r1 == 0` the `P(r1-1,.)` terms are 0 by a `k = 0` loop-skip
     * (the loop starts at `i = r1 = 0`), and likewise `c1 == 0` -- never a
     * `prefix(-1)` / index `-1`. Fails closed: out-of-range or `r1 > r2` / `c1 > c2`.
     * @param {number} r1  integer in [0, rows)
     * @param {number} c1  integer in [0, cols)
     * @param {number} r2  integer in [r1, rows)
     * @param {number} c2  integer in [c1, cols)
     * @returns {number}
     */
    rectSum(r1, c1, r2, c2) {
        if (typeof r1 !== 'number' || !Number.isInteger(r1) || r1 < 0 || r1 >= this._r) return this._badRect(r1, c1, r2, c2);
        if (typeof c1 !== 'number' || !Number.isInteger(c1) || c1 < 0 || c1 >= this._c) return this._badRect(r1, c1, r2, c2);
        if (typeof r2 !== 'number' || !Number.isInteger(r2) || r2 < 0 || r2 >= this._r) return this._badRect(r1, c1, r2, c2);
        if (typeof c2 !== 'number' || !Number.isInteger(c2) || c2 < 0 || c2 >= this._c) return this._badRect(r1, c1, r2, c2);
        if (r1 > r2 || c1 > c2) return this._badRect(r1, c1, r2, c2);
        const t = this._t, w = this._w;
        let s = 0;
        for (let i = r2 + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c2 + 1; j > 0; j -= j & -j) s += t[b + j]; } // + P(r2, c2)
        for (let i = r1;     i > 0; i -= i & -i) { const b = i * w; for (let j = c2 + 1; j > 0; j -= j & -j) s -= t[b + j]; } // - P(r1-1, c2)
        for (let i = r2 + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c1;     j > 0; j -= j & -j) s -= t[b + j]; } // - P(r2, c1-1)
        for (let i = r1;     i > 0; i -= i & -i) { const b = i * w; for (let j = c1;     j > 0; j -= j & -j) s += t[b + j]; } // + P(r1-1, c1-1)
        return s;
    }

    /**
     * The single cell at 0-based `(r, c)` = the 1x1 rectangle sum, inlined as the
     * four inclusion-exclusion descents. O(log^2 n), zero allocation. Out-of-range
     * throws `[lite-logn]`.
     * @param {number} r  integer in [0, rows)
     * @param {number} c  integer in [0, cols)
     * @returns {number}
     */
    at(r, c) {
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= this._r) return this._badRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= this._c) return this._badCol(c);
        const t = this._t, w = this._w;
        let s = 0;
        for (let i = r + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c + 1; j > 0; j -= j & -j) s += t[b + j]; }
        for (let i = r;     i > 0; i -= i & -i) { const b = i * w; for (let j = c + 1; j > 0; j -= j & -j) s -= t[b + j]; }
        for (let i = r + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c;     j > 0; j -= j & -j) s -= t[b + j]; }
        for (let i = r;     i > 0; i -= i & -i) { const b = i * w; for (let j = c;     j > 0; j -= j & -j) s += t[b + j]; }
        return s;
    }

    /**
     * Set the cell at 0-based `(r, c)` to `value` (absolute), via `update(r, c,
     * value - at(r, c))`, inlined so the read and the climb share one validation and
     * allocate nothing. O(log^2 n). Fails closed: a non-finite value (typeof-guarded
     * first) or an out-of-range coordinate throws `[lite-logn]`.
     * @param {number} r      integer in [0, rows)
     * @param {number} c      integer in [0, cols)
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(r, c, value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= this._r) return this._badRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= this._c) return this._badCol(c);
        const t = this._t, w = this._w, rows = this._r, cols = this._c;
        let cur = 0;                                            // = at(r, c)
        for (let i = r + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c + 1; j > 0; j -= j & -j) cur += t[b + j]; }
        for (let i = r;     i > 0; i -= i & -i) { const b = i * w; for (let j = c + 1; j > 0; j -= j & -j) cur -= t[b + j]; }
        for (let i = r + 1; i > 0; i -= i & -i) { const b = i * w; for (let j = c;     j > 0; j -= j & -j) cur -= t[b + j]; }
        for (let i = r;     i > 0; i -= i & -i) { const b = i * w; for (let j = c;     j > 0; j -= j & -j) cur += t[b + j]; }
        const delta = value - cur;
        for (let i = r + 1; i <= rows; i += i & -i) { const b = i * w; for (let j = c + 1; j <= cols; j += j & -j) t[b + j] += delta; }
        return this;
    }

    /** Zero every cell in place, keeping the fixed dimensions. O(rows*cols) cold. */
    clear() {
        this._t.fill(0);
        return this;
    }

    /**
     * Visit every cell as `(value, r, c, fenwick2d)` in row-major ascending order
     * (`r` outer, `c` inner). O(rows*cols*log^2 n) COLD scan (each cell re-derives
     * its value via the `at` inclusion-exclusion); allocation-free in the loop body
     * (pass a hoisted callback).
     * @param {(value:number, r:number, c:number, fenwick2d:Fenwick2D)=>void} fn
     */
    forEach(fn) {
        const rows = this._r, cols = this._c;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) fn(this.at(r, c), r, c, this);
        }
    }

    /**
     * O(rows*cols) LINEAR bulk build from a 2D `matrix` (rows of equal-length finite-
     * number array-likes). Load each value into its own cell, then propagate in TWO
     * SEPARATE passes -- FIRST along the columns within each row, THEN along the rows
     * -- each a 1D linear Fenwick build lifted to its dimension. The two passes must
     * stay SEPARATE: fusing them into one nested loop DOUBLE-COUNTS. COLD path; fails
     * closed on a non-2D-array-like or any non-finite entry before the tree is usable.
     * @param {ArrayLike<ArrayLike<number>>} matrix  rows of finite numbers
     * @returns {Fenwick2D}
     */
    static build(matrix) {
        if (matrix == null || typeof matrix.length !== 'number') {
            throw new TypeError('[lite-logn] Fenwick2D.build needs a 2D array-like (rows of finite numbers)');
        }
        const rows = matrix.length;
        const row0 = matrix[0];
        if (row0 == null || typeof row0.length !== 'number') {
            throw new TypeError('[lite-logn] Fenwick2D.build needs a 2D array-like (rows of finite numbers)');
        }
        const cols = row0.length;
        const f = new Fenwick2D(rows, cols);      // validates dims + the cell-product ceiling
        const t = f._t, w = f._w;
        for (let r = 0; r < rows; r++) {
            const row = matrix[r];
            if (row == null || typeof row.length !== 'number' || row.length !== cols) {
                throw new TypeError('[lite-logn] Fenwick2D.build rows must be equal-length array-likes');
            }
            const base = (r + 1) * w;
            for (let c = 0; c < cols; c++) {
                const v = row[c];
                if (typeof v !== 'number' || !Number.isFinite(v)) {
                    throw new TypeError(
                        '[lite-logn] Fenwick2D.build value must be a finite number, got ' + String(v));
                }
                t[base + c + 1] = v;              // seed each cell with its own value
            }
        }
        // Pass 1: propagate along COLS within each row (each row is a 1D linear build).
        for (let i = 1; i <= rows; i++) {
            const base = i * w;
            for (let j = 1; j <= cols; j++) {
                const j2 = j + (j & -j);
                if (j2 <= cols) t[base + j2] += t[base + j];
            }
        }
        // Pass 2 (SEPARATE): propagate along ROWS. Fusing this into Pass 1 double-counts.
        for (let j = 1; j <= cols; j++) {
            for (let i = 1; i <= rows; i++) {
                const i2 = i + (i & -i);
                if (i2 <= rows) t[i2 * w + j] += t[i * w + j];
            }
        }
        return f;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badRow(r) {
        throw new RangeError(
            '[lite-logn] Fenwick2D row must be an integer in [0, ' + this._r + '), got ' + String(r));
    }

    /** @private */
    _badCol(c) {
        throw new RangeError(
            '[lite-logn] Fenwick2D col must be an integer in [0, ' + this._c + '), got ' + String(c));
    }

    /** @private */
    _badPrefixRow(r) {
        throw new RangeError(
            '[lite-logn] Fenwick2D prefix row must be an integer in [-1, ' + this._r + '), got ' + String(r));
    }

    /** @private */
    _badPrefixCol(c) {
        throw new RangeError(
            '[lite-logn] Fenwick2D prefix col must be an integer in [-1, ' + this._c + '), got ' + String(c));
    }

    /** @private */
    _badRect(r1, c1, r2, c2) {
        throw new RangeError(
            '[lite-logn] Fenwick2D rectSum needs integers 0 <= r1 <= r2 < ' + this._r +
            ' and 0 <= c1 <= c2 < ' + this._c + ', got r1=' + String(r1) + ' c1=' + String(c1) +
            ' r2=' + String(r2) + ' c2=' + String(c2));
    }

    /** @private */
    _badDelta(delta) {
        throw new TypeError(
            '[lite-logn] Fenwick2D delta must be a finite number, got ' + String(delta));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] Fenwick2D value must be a finite number, got ' + String(value));
    }
}

/**
 * The largest allowed backing-cell count for a SegmentTree2D: `4 * rows * cols`
 * (= `(2*rows) * (2*cols)`) must fit a positive int32 so every flat index stays a
 * valid `Float64Array` offset. See the ctor's FLOAT-product overflow door.
 */
const S2D_MAX_CELLS = 0x7FFFFFFF; // 2^31 - 1

/**
 * A 2D SEGMENT TREE (a segment tree OF segment trees): a point-update AND a
 * rectangle-fold, BOTH O(log^2 n), over a SINGLE flat `Float64Array(4 * rows *
 * cols)` -- the iterative "2n" segment-tree idiom NESTED over two dimensions. It
 * completes the 2D range story Fenwick2D opened: Fenwick2D is a SUM machine (a BIT
 * folds only an invertible group), while SegmentTree2D folds ANY associative +
 * commutative operation over a rectangle -- min / max / sum / gcd -- exactly the
 * rectangle MIN / MAX / GCD a 2D BIT CANNOT do (Fenwick2D's documented not-for).
 * SegmentTree2D : Fenwick2D :: SegmentTree (1D) : Fenwick (1D). The fold is chosen
 * ONCE at construction and cached as a small-int `_k` combined by an INLINE switch
 * in the hot body (no function ref, no closure, no megamorphic call site).
 *
 * Layout (the iterative "2n" trick in BOTH dims):
 *   - `_t` is a `Float64Array(2*rows * 2*cols)`; row stride `_w = 2*cols`. The cell
 *     of ROW-node `i` (in `[1, 2*rows)`) at COL-node `j` (in `[1, 2*cols)`) is
 *     `_t[i * _w + j]`; index 0 in each dim is UNUSED (null is not zero).
 *   - LEAF rows are `i` in `[rows, 2*rows)` (public row `r` -> `rows + r`); LEAF
 *     cols are `j` in `[cols, 2*cols)` (public col `c` -> `cols + c`).
 *   - ROW-node `i` holds, at each col-node `j`, the fold over its row subtree x that
 *     col subtree; `_t[1*_w + 1]` is the fold of the whole grid.
 *
 * The two hot walks (both O(log rows * log cols) = O(log^2 n)):
 *   - `update(r, c, value)` sets the leaf cell, climbs the leaf ROW's col-tree at
 *     column `c`, THEN climbs the ROW-tree -- for each row-ancestor `i` it first
 *     recomputes the changed leaf column `_t[i*_w + (cols+c)] = fold(_t[2i*_w +
 *     (cols+c)], _t[(2i+1)*_w + (cols+c)])` from its two row-children, THEN fixes
 *     that row-node's col-tree up the column path of `c`. (The order matters: the
 *     inner col-tree must be fixed from the row-children BEFORE the next row level.)
 *   - `query(r1, c1, r2, c2)` descends the OUTER row dim half-open (`l = rows+r1`,
 *     `r = rows+r2+1`, `l < r`, `l&1` / `r&1` boundary picks) collecting O(log rows)
 *     row-nodes, and for EACH row-node does an INNER col-range fold over `[c1, c2]`
 *     (the same `l&1` / `r&1` descent) into one accumulator seeded with the fold
 *     identity. Both boundaries in both dims are handled -- the double `&1` picks.
 *
 * RISK (recorded in decisions/0015-segmenttree2d.md): the iterative 2n layout is
 * ORDER-AGNOSTIC in BOTH dims -- `query` mixes left/right row and col contributions
 * into ONE accumulator, so it is correct ONLY because min / max / sum / gcd are all
 * COMMUTATIVE as well as associative. A future NON-commutative fold must NOT reuse
 * this layout; it needs a pow2 fixed-order layout with ordered accumulators.
 *
 * Identity (the trap): the fold's identity fills query accumulators and cleared /
 * fresh cells -- sum -> 0, min -> +Infinity, max -> -Infinity, gcd -> 0. Identity
 * is a legal RESULT (a cleared min grid queries to +Infinity) but NEVER a legal
 * INPUT: the value door rejects user NaN / +-Infinity (and, for the `gcd` kind, any
 * negative or non-integer value), typeof-guarded BEFORE coercion.
 *
 * SPACE (the honest co-headline vs Fenwick2D): `4 * rows * cols` cells -- roughly
 * 4x a 2D BIT's `(rows+1)*(cols+1)` -- the price paid to fold the general (non-
 * invertible) operations a BIT cannot. WORST-CASE member (no randomization /
 * amortization); every hot op allocates zero bytes. Fixed dimensions: `rows` and
 * `cols` are frozen at construction; there is no grow. Every out-of-range
 * coordinate and every non-finite (or out-of-domain gcd) value is a hard
 * `[lite-logn]` throw.
 */
export class SegmentTree2D {
    /**
     * @param {number} rows  row count; integer >= 1.
     * @param {number} cols  column count; integer >= 1.
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold.
     */
    constructor(rows, cols, kind) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1) {
            throw new RangeError(
                '[lite-logn] SegmentTree2D rows must be an integer >= 1, got ' + String(rows));
        }
        if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1) {
            throw new RangeError(
                '[lite-logn] SegmentTree2D cols must be an integer >= 1, got ' + String(cols));
        }
        const k = kind === 'min' ? 0 : kind === 'max' ? 1 : kind === 'sum' ? 2 :
            kind === 'gcd' ? 3 : -1;
        if (k === -1) {
            throw new RangeError(
                '[lite-logn] SegmentTree2D kind must be "min", "max", "sum" or "gcd", got ' +
                String(kind));
        }
        // FLOAT product (never `| 0`): `| 0` would wrap a large product to a small /
        // negative int and pass the door (fail OPEN -> under-allocation -> OOB). The
        // float product is exact to 2^53, so a genuine overflow of the 2^31-1 cell
        // ceiling fails CLOSED (the Fenwick2D lesson).
        const cells = 4 * rows * cols;            // = (2*rows) * (2*cols)
        if (cells > S2D_MAX_CELLS) {
            throw new RangeError(
                '[lite-logn] SegmentTree2D grid too large: 4*rows*cols = ' + cells +
                ' exceeds ' + S2D_MAX_CELLS);
        }
        this._r = rows;                           // row count (fixed)
        this._c = cols;                           // column count (fixed)
        this._w = 2 * cols;                       // row stride (2*cols; col 0 unused)
        this._k = k;                              // ctor-frozen fold: 0 min 1 max 2 sum 3 gcd
        this._idv = k === 0 ? Infinity : k === 1 ? -Infinity : 0; // fold identity
        this._t = new Float64Array(cells);        // flat 2R x 2C; row 0 / col 0 unused
        if (this._idv !== 0) this._t.fill(this._idv); // sum/gcd identity is 0 already
    }

    /** Row count this tree was sized for. O(1). */
    get rows() { return this._r; }

    /** Column count this tree was sized for. O(1). */
    get cols() { return this._c; }

    /** The frozen associative fold, 'min' | 'max' | 'sum' | 'gcd'. O(1). */
    get kind() {
        const k = this._k;
        return k === 0 ? 'min' : k === 1 ? 'max' : k === 2 ? 'sum' : 'gcd';
    }

    /**
     * The folded value over the rectangle `[r1..r2] x [c1..c2]` INCLUSIVE on all
     * four edges. O(log^2 n): descend the OUTER row dim collecting the boundary
     * row-nodes, and for each do an INNER col-range fold, all into one accumulator
     * (started at the fold identity). Order-agnostic (correct because the fold is
     * commutative -- see the class RISK note). Fails closed: any out-of-range
     * coordinate, or `r1 > r2` / `c1 > c2`, throws `[lite-logn]`.
     * @param {number} r1  integer in [0, rows)
     * @param {number} c1  integer in [0, cols)
     * @param {number} r2  integer in [r1, rows)
     * @param {number} c2  integer in [c1, cols)
     * @returns {number} the fold over the rectangle (always folds at least one cell)
     */
    query(r1, c1, r2, c2) {
        const R = this._r, C = this._c;
        if (typeof r1 !== 'number' || !Number.isInteger(r1) || r1 < 0 || r1 >= R) return this._badRect(r1, c1, r2, c2);
        if (typeof c1 !== 'number' || !Number.isInteger(c1) || c1 < 0 || c1 >= C) return this._badRect(r1, c1, r2, c2);
        if (typeof r2 !== 'number' || !Number.isInteger(r2) || r2 < 0 || r2 >= R) return this._badRect(r1, c1, r2, c2);
        if (typeof c2 !== 'number' || !Number.isInteger(c2) || c2 < 0 || c2 >= C) return this._badRect(r1, c1, r2, c2);
        if (r1 > r2 || c1 > c2) return this._badRect(r1, c1, r2, c2);
        const t = this._t, k = this._k, w = this._w;
        const cl0 = C + c1, cr0 = C + c2 + 1;
        let res = this._idv;
        // Outer row descent (half-open). For each collected row-node, an inner col
        // descent folds [c1, c2] into `res`. Both boundaries picked in both dims.
        for (let l = R + r1, r = R + r2 + 1; l < r; l >>= 1, r >>= 1) {
            if (l & 1) {
                const b = l * w;
                for (let cl = cl0, cr = cr0; cl < cr; cl >>= 1, cr >>= 1) {
                    if (cl & 1) { const v = t[b + cl++]; res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) : k === 2 ? res + v : segGcd(res, v); }
                    if (cr & 1) { const v = t[b + --cr]; res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) : k === 2 ? res + v : segGcd(res, v); }
                }
                l++;
            }
            if (r & 1) {
                const b = (--r) * w;
                for (let cl = cl0, cr = cr0; cl < cr; cl >>= 1, cr >>= 1) {
                    if (cl & 1) { const v = t[b + cl++]; res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) : k === 2 ? res + v : segGcd(res, v); }
                    if (cr & 1) { const v = t[b + --cr]; res = k === 0 ? (v < res ? v : res) : k === 1 ? (v > res ? v : res) : k === 2 ? res + v : segGcd(res, v); }
                }
            }
        }
        return res;
    }

    /**
     * Set the cell at 0-based `(r, c)` to `value` (ABSOLUTE), then fix every affected
     * fold. O(log^2 n): write the leaf, climb the leaf ROW's col-tree at column `c`,
     * then climb the ROW-tree -- at each row-ancestor recompute the changed leaf
     * column from its two row-children FIRST, then fix that row-node's col-tree up
     * the column path of `c`. Fails closed: a non-finite value (typeof-guarded
     * first), a gcd-kind value that is negative or non-integer, or an out-of-range
     * coordinate each throw `[lite-logn]` as a no-op.
     * @param {number} r      integer in [0, rows)
     * @param {number} c      integer in [0, cols)
     * @param {number} value  a finite number (nonnegative integer for the gcd kind)
     * @returns {this}
     */
    update(r, c, value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (this._k === 3 && (!Number.isInteger(value) || value < 0)) return this._badGcdValue(value);
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= this._r) return this._badRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= this._c) return this._badCol(c);
        const t = this._t, k = this._k, w = this._w, R = this._r, C = this._c;
        const cLeaf = C + c;
        // Leaf row: write the leaf cell, then climb THIS row's col-tree on c's path.
        const lb = (R + r) * w;
        t[lb + cLeaf] = value;
        for (let jj = cLeaf >> 1; jj >= 1; jj >>= 1) {
            const j2 = jj << 1;
            const a = t[lb + j2], b = t[lb + j2 + 1];
            t[lb + jj] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) : k === 2 ? a + b : segGcd(a, b);
        }
        // Climb the ROW-tree. At each ancestor: recompute the changed leaf column
        // from the two row-children FIRST, THEN climb that row-node's col-tree.
        for (let i = (R + r) >> 1; i >= 1; i >>= 1) {
            const bi = i * w, c0 = (i << 1) * w, c1 = c0 + w;
            const a = t[c0 + cLeaf], b = t[c1 + cLeaf];
            t[bi + cLeaf] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) : k === 2 ? a + b : segGcd(a, b);
            for (let jj = cLeaf >> 1; jj >= 1; jj >>= 1) {
                const j2 = jj << 1;
                const x = t[bi + j2], y = t[bi + j2 + 1];
                t[bi + jj] = k === 0 ? (x < y ? x : y) : k === 1 ? (x > y ? x : y) : k === 2 ? x + y : segGcd(x, y);
            }
        }
        return this;
    }

    /**
     * The single cell at 0-based `(r, c)` (the stored leaf value). O(1). An
     * out-of-range coordinate throws `[lite-logn]`.
     * @param {number} r  integer in [0, rows)
     * @param {number} c  integer in [0, cols)
     * @returns {number}
     */
    at(r, c) {
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= this._r) return this._badRow(r);
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= this._c) return this._badCol(c);
        return this._t[(this._r + r) * this._w + (this._c + c)];
    }

    /**
     * Reset every cell to the fold identity in place, keeping the fixed dimensions.
     * O(rows*cols) cold path. Because `fold(identity, identity) === identity`,
     * filling the WHOLE backing array leaves a fully-consistent tree.
     * @returns {this}
     */
    clear() {
        this._t.fill(this._idv);
        return this;
    }

    /**
     * Visit every cell as `(value, r, c, tree)` in ROW-MAJOR ascending order (`r`
     * outer, `c` inner) for `r` in `[0, rows)`, `c` in `[0, cols)`. O(rows*cols)
     * COLD scan reading each leaf directly, allocation-free in the loop body (pass a
     * hoisted callback).
     * @param {(value:number, r:number, c:number, tree:SegmentTree2D)=>void} fn
     */
    forEach(fn) {
        const t = this._t, w = this._w, R = this._r, C = this._c;
        for (let r = 0; r < R; r++) {
            const b = (R + r) * w + C;
            for (let c = 0; c < C; c++) fn(t[b + c], r, c, this);
        }
    }

    /**
     * O(rows*cols) bottom-up bulk build from a 2D `matrix` (rows of equal-length
     * finite-number array-likes) -- NOT rows*cols individual O(log^2 n) updates.
     * TWO-PHASE fold: (1) seed every leaf cell, then fold each LEAF ROW's col-tree
     * deepest-first; (2) fold the ROW-tree -- for each internal row-node, combine its
     * two row-children POSITION-WISE across all column nodes (the 2D fold is
     * separable). COLD path; fails closed on a non-2D-array-like, any non-finite
     * entry, or (gcd kind) any negative / non-integer entry before the tree is usable.
     * @param {ArrayLike<ArrayLike<number>>} matrix  rows of finite numbers
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold
     * @returns {SegmentTree2D}
     */
    static build(matrix, kind) {
        if (matrix == null || typeof matrix.length !== 'number') {
            throw new TypeError('[lite-logn] SegmentTree2D.build needs a 2D array-like (rows of finite numbers)');
        }
        const rows = matrix.length;
        const row0 = matrix[0];
        if (row0 == null || typeof row0.length !== 'number') {
            throw new TypeError('[lite-logn] SegmentTree2D.build needs a 2D array-like (rows of finite numbers)');
        }
        const cols = row0.length;
        const st = new SegmentTree2D(rows, cols, kind); // validates dims + kind + ceiling
        const t = st._t, w = st._w, k = st._k, R = st._r, C = st._c;
        const gcdKind = k === 3;
        // Seed every leaf cell with its own value.
        for (let r = 0; r < rows; r++) {
            const row = matrix[r];
            if (row == null || typeof row.length !== 'number' || row.length !== cols) {
                throw new TypeError('[lite-logn] SegmentTree2D.build rows must be equal-length array-likes');
            }
            const b = (R + r) * w + C;
            for (let c = 0; c < cols; c++) {
                const v = row[c];
                if (typeof v !== 'number' || !Number.isFinite(v)) {
                    throw new TypeError(
                        '[lite-logn] SegmentTree2D.build value must be a finite number, got ' + String(v));
                }
                if (gcdKind && (!Number.isInteger(v) || v < 0)) {
                    throw new RangeError(
                        '[lite-logn] SegmentTree2D.build gcd value must be a nonnegative integer, got ' +
                        String(v));
                }
                t[b + c] = v;
            }
        }
        // Phase 1: fold each LEAF ROW's col-tree, deepest-first (col nodes [1, C)).
        for (let lr = R; lr < 2 * R; lr++) {
            const b = lr * w;
            for (let jj = C - 1; jj >= 1; jj--) {
                const j2 = jj << 1;
                const a = t[b + j2], bb = t[b + j2 + 1];
                t[b + jj] = k === 0 ? (a < bb ? a : bb) : k === 1 ? (a > bb ? a : bb) : k === 2 ? a + bb : segGcd(a, bb);
            }
        }
        // Phase 2: fold the ROW-tree position-wise (row nodes [1, R)), each row-node's
        // whole col-tree = combine of its two row-children across all column nodes.
        for (let i = R - 1; i >= 1; i--) {
            const bi = i * w, c0 = (i << 1) * w, c1 = c0 + w;
            for (let j = 1; j < w; j++) {
                const a = t[c0 + j], b = t[c1 + j];
                t[bi + j] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) : k === 2 ? a + b : segGcd(a, b);
            }
        }
        return st;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badRow(r) {
        throw new RangeError(
            '[lite-logn] SegmentTree2D row must be an integer in [0, ' + this._r + '), got ' + String(r));
    }

    /** @private */
    _badCol(c) {
        throw new RangeError(
            '[lite-logn] SegmentTree2D col must be an integer in [0, ' + this._c + '), got ' + String(c));
    }

    /** @private */
    _badRect(r1, c1, r2, c2) {
        throw new RangeError(
            '[lite-logn] SegmentTree2D query needs integers 0 <= r1 <= r2 < ' + this._r +
            ' and 0 <= c1 <= c2 < ' + this._c + ', got r1=' + String(r1) + ' c1=' + String(c1) +
            ' r2=' + String(r2) + ' c2=' + String(c2));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] SegmentTree2D value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badGcdValue(value) {
        throw new RangeError(
            '[lite-logn] SegmentTree2D gcd value must be a nonnegative integer, got ' + String(value));
    }
}

// SortedArray (v0.14.0 session) -- a DYNAMIC read-optimized ordered map over parallel sorted arrays (BELOW).

/**
 * Max SortedArray capacity: `0x7FFFFFFF` (2^31 - 1). Entries live at indices [0, size)
 * of two parallel `Float64Array` columns, and `size` / `capacity` must fit a positive
 * int32 so `copyWithin` offsets and the binary-search midpoint stay valid array indices.
 * The index arithmetic (not the byte count) is the hard ceiling -- the same "the
 * arithmetic caps it" reasoning as the array-embedded members.
 */
const SA_MAX_CAPACITY = 0x7FFFFFFF; // 2^31 - 1

/**
 * A DYNAMIC, read-optimized, key -> value ORDERED MAP over two parallel SORTED typed
 * arrays. The family's FIFTH ordered structure (after SkipList / Treap / Scapegoat /
 * SplayTree); its differentiator is CONTIGUOUS storage. Keys live ascending in a flat
 * `Float64Array`, values in a parallel one at the same index -- so it is the fastest
 * `forEach` (a straight cache-friendly scan), has O(1) `select` / `keyAt` / `valueAt`
 * (a raw array index), O(1) `min` / `max` (index 0 / size-1), and O(log n) `get` / `has`
 * / `rank` / `successor` / `predecessor` via ONE shared branch-free lower-bound binary
 * search (`_lb`). The honest cost is O(n) `set` (insert-with-shift) and `delete`
 * (shift-down): a `copyWithin` in the preallocated column, no temp, no spread. It is
 * literally the sorted-array FOIL the earlier ordered members were measured against,
 * now a first-class member: the "reads dominate, writes rare" ordered map.
 *
 * Storage (allocated once, sized to capacity):
 *   - `_key`   Float64Array -- the keys, kept ASCENDING in [0, size).
 *   - `_value` Float64Array -- the value parallel to each key (same index).
 * `_size` is the live entry count; slots [size, capacity) are stale scratch (never read).
 *
 * Honesty contract (documented in decisions/0016 + README + llms): the gated hot op is
 * `get`, a WORST-CASE O(log n) binary search (like Scapegoat.get -- deterministic, no
 * RNG). The O(n) `set` insert is a DISCLOSED max-single-op bar, NEVER gated (the "worst-
 * case O(log n) reads, O(n) writes disclosed" pattern). This is the read-optimized dual
 * of the pointer-based ordered maps: they buy O(log n) writes with pointer-chasing;
 * SortedArray buys the fastest reads + iteration with O(n) writes.
 *
 * Keys AND values are finite numbers; the typeof-guard fires FIRST (before any coercion)
 * at the door of every mutating op, so Symbol / BigInt / NaN / +-Infinity fail closed --
 * null is not zero. Fixed capacity: `set` overflow throws, never silently drops.
 * `rangeIter` is a VERSION-STAMPED iterator -- any structural change mid-iteration throws
 * `[lite-logn]` rather than yield stale data. Every read op allocates ZERO bytes after
 * construction; `set` / `delete` shift in place (the `copyWithin` reuses the backing
 * store), so the O(n) write is still 0 B/op.
 */
export class SortedArray {
    /**
     * @param {number} capacity  exact max live entries; integer in [1, 2^31-1].
     */
    constructor(capacity) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof capacity !== 'number' || !Number.isInteger(capacity) ||
            capacity < 1 || capacity > SA_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] SortedArray capacity must be an integer in [1, 2^31-1], got ' +
                String(capacity));
        }
        this._cap = capacity;                         // max live entries (fixed)
        this._key = new Float64Array(capacity);       // keys, ascending in [0, size)
        this._value = new Float64Array(capacity);     // value parallel to each key
        this._size = 0;                               // live entry count
        this._version = 0;                            // iterator invalidation stamp
    }

    /** Live entry count. O(1). */
    get size() { return this._size; }

    /** The fixed capacity this map was sized for. O(1). */
    get capacity() { return this._cap; }

    /**
     * Unvalidated LOWER BOUND: the count of stored keys STRICTLY LESS than `x` (= the
     * index of the first key >= x, in [0, size]). The single binary search the whole
     * structure reuses -- get / has / rank / successor / predecessor / the set-probe all
     * call it. Branch-free in the sense that it NEVER early-exits on equality: the loop
     * always narrows to the lower bound, and callers do ONE equality check on the result.
     * PRIVATE + hot: no validation, no allocation.
     * @private
     * @param {number} x  a finite number
     * @returns {number} count of keys < x, in [0, size]
     */
    _lb(x) {
        const K = this._key;
        let lo = 0, hi = this._size;
        while (lo < hi) {
            const mid = lo + ((hi - lo) >>> 1);       // overflow-safe midpoint
            if (K[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /**
     * The value stored under `key`, or `undefined` if absent (never throws on a missing /
     * empty query). O(log n): one lower-bound search, then one equality check. Fails
     * closed on a non-number / non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    get(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const i = this._lb(key);
        return (i < this._size && this._key[i] === key) ? this._value[i] : undefined;
    }

    /**
     * True iff `key` is currently stored. O(log n). Fails closed on a non-finite key
     * (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    has(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const i = this._lb(key);
        return i < this._size && this._key[i] === key;
    }

    /**
     * Insert `key -> value`, or UPDATE the value in place if `key` already exists. O(log n)
     * to locate; an in-place value update is O(log n), a genuine insert is O(n) (a
     * `copyWithin` shift of the tail up by one slot -- no temp, no spread). Fails closed: a
     * non-finite key or value (typeof-guarded first), or a full map, each throw
     * `[lite-logn]` as a no-op. The O(n) insert is a DISCLOSED max-single-op cost (see the
     * class honesty contract), never a gated line.
     * @param {number} key    a finite number
     * @param {number} value  a finite number
     * @returns {this}
     */
    set(key, value) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        const K = this._key, V = this._value, n = this._size;
        const i = this._lb(key);
        if (i < n && K[i] === key) {                  // present -> update in place, no shift
            V[i] = value;
            this._version = (this._version + 1) | 0;
            return this;
        }
        if (n >= this._cap) return this._full();
        // Shift the tail [i, n) up by one, in place, reusing the backing store (0 B/op).
        K.copyWithin(i + 1, i, n);
        V.copyWithin(i + 1, i, n);
        K[i] = key;
        V[i] = value;
        this._size = n + 1;
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * Remove `key`. O(log n) to locate, O(n) to shift the tail down by one (a `copyWithin`,
     * no temp). Idempotent: returns `false` if `key` is absent (no throw), `true` if it was
     * present and removed. Fails closed on a non-finite key (typeof-guarded first).
     * @param {number} key  a finite number
     * @returns {boolean}
     */
    delete(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const K = this._key, V = this._value, n = this._size;
        const i = this._lb(key);
        if (i >= n || K[i] !== key) return false;     // absent (no throw)
        // Shift the tail [i+1, n) down by one, in place, reusing the backing store (0 B/op).
        K.copyWithin(i, i + 1, n);
        V.copyWithin(i, i + 1, n);
        this._size = n - 1;
        this._version = (this._version + 1) | 0;
        return true;
    }

    /**
     * The number of stored keys STRICTLY LESS than `x` (its rank / position), in [0, size].
     * O(log n) -- a raw lower-bound search. `x` need not be present; rank of the smallest
     * key is 0, of a key past the max is `size`. Fails closed on a non-finite `x`.
     * @param {number} x  a finite number
     * @returns {number} count of keys < x, in [0, size]
     */
    rank(x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return this._badKey(x);
        return this._lb(x);
    }

    /**
     * The k-th smallest KEY (0-based order statistic), or `undefined` if `k` is out of
     * range [0, size). O(1): a raw array index. Fails closed on a non-integer `k`
     * (typeof-guarded first); an in-type out-of-range `k` returns `undefined` (matching the
     * soft-miss of `get`).
     * @param {number} k  integer in [0, size)
     * @returns {number|undefined} the k-th smallest key
     */
    select(k) {
        if (typeof k !== 'number' || !Number.isInteger(k)) return this._badRank(k);
        if (k < 0 || k >= this._size) return undefined;
        return this._key[k];
    }

    /**
     * The KEY at 0-based order-statistic index `k` (select's twin), or `undefined` if out of
     * range. O(1) array index. Fails closed on a non-integer `k` (typeof-guarded first).
     * @param {number} k  integer in [0, size)
     * @returns {number|undefined}
     */
    keyAt(k) {
        if (typeof k !== 'number' || !Number.isInteger(k)) return this._badRank(k);
        if (k < 0 || k >= this._size) return undefined;
        return this._key[k];
    }

    /**
     * The VALUE parallel to the key at 0-based order-statistic index `k`, or `undefined` if
     * out of range. O(1) array index. Fails closed on a non-integer `k` (typeof-guarded
     * first).
     * @param {number} k  integer in [0, size)
     * @returns {number|undefined}
     */
    valueAt(k) {
        if (typeof k !== 'number' || !Number.isInteger(k)) return this._badRank(k);
        if (k < 0 || k >= this._size) return undefined;
        return this._value[k];
    }

    /**
     * The smallest key STRICTLY greater than `key`, or `undefined` if none. O(log n).
     * `key` itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    successor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const K = this._key, n = this._size;
        let j = this._lb(key);                        // first index with key >= `key`
        if (j < n && K[j] === key) j++;               // strictly greater -> skip an equal
        return j < n ? K[j] : undefined;
    }

    /**
     * The largest key STRICTLY less than `key`, or `undefined` if none. O(log n). `key`
     * itself need not be present. Fails closed on a non-finite key.
     * @param {number} key  a finite number
     * @returns {number|undefined}
     */
    predecessor(key) {
        if (typeof key !== 'number' || !Number.isFinite(key)) return this._badKey(key);
        const i = this._lb(key);                      // first index with key >= `key`
        return i > 0 ? this._key[i - 1] : undefined;  // its predecessor is i-1
    }

    /** The smallest key, or `undefined` if empty. O(1) (index 0). */
    min() { return this._size > 0 ? this._key[0] : undefined; }

    /** The largest key, or `undefined` if empty. O(1) (index size-1). */
    max() { return this._size > 0 ? this._key[this._size - 1] : undefined; }

    /**
     * A VERSION-STAMPED iterator over the keys in `[lo, hi]` INCLUSIVE, ascending. Bounds
     * may be any number INCLUDING +-Infinity (an unbounded end); `NaN` fails closed, as does
     * `lo > hi`. O(log n + k): a lower-bound seek then a contiguous walk. The generator
     * captures the map's version and throws `[lite-logn]` if any mutation (structural OR a
     * set-value update) happens mid-iteration, rather than yield stale data; the one documented per-protocol allocator
     * is the {value, done} object per step.
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
        const K = this._key;
        let i = this._lb(lo);                         // first key >= lo
        for (;;) {
            if (this._version !== ver) {
                throw new Error('[lite-logn] SortedArray mutated during iteration');
            }
            if (i >= this._size || K[i] > hi) return;
            yield K[i];
            i++;
        }
    }

    /**
     * Empty the map, keeping the fixed capacity. O(1): resets the size counter (the stale
     * slots are never read). Bumps the version so any live iterator fails closed.
     * @returns {this}
     */
    clear() {
        this._size = 0;
        this._version = (this._version + 1) | 0;
        return this;
    }

    /**
     * Visit every `(key, value)` pair in ASCENDING key order as `(key, value, sortedArray)`.
     * O(n) CONTIGUOUS scan -- the fastest forEach in the family (no pointer-chasing, cache-
     * friendly), allocation-free in the loop body (pass a hoisted callback). Unlike
     * rangeIter this is NOT version-stamped -- mutating from within the callback is the
     * caller's responsibility (matching the other members).
     * @param {(key:number, value:number, sortedArray:SortedArray)=>void} fn
     */
    forEach(fn) {
        const K = this._key, V = this._value, n = this._size;
        for (let i = 0; i < n; i++) fn(K[i], V[i], this);
    }

    /**
     * O(n log n) build from two parallel array-likes: sort ONCE by key, then load the
     * sorted keys / values into a fresh SortedArray sized to the count. COLD path; fails
     * closed BEFORE the map is usable on: a non-array-like input, a keys / values length
     * mismatch, a count outside [1, 2^31-1], any non-finite key or value (typeof-guarded),
     * OR a DUPLICATE key (a sorted map has no room for two of the same key).
     * @param {ArrayLike<number>} keys    finite numbers (unsorted ok)
     * @param {ArrayLike<number>} values  finite numbers, parallel to keys
     * @returns {SortedArray}
     */
    static build(keys, values) {
        if (keys == null || typeof keys.length !== 'number' ||
            values == null || typeof values.length !== 'number') {
            throw new TypeError(
                '[lite-logn] SortedArray.build needs two parallel array-likes (keys, values)');
        }
        const n = keys.length;
        if (values.length !== n) {
            throw new RangeError(
                '[lite-logn] SortedArray.build keys / values length mismatch: ' + n +
                ' vs ' + values.length);
        }
        if (n < 1 || n > SA_MAX_CAPACITY) {
            throw new RangeError(
                '[lite-logn] SortedArray.build count must be an integer in [1, 2^31-1], got ' + n);
        }
        // Pair + validate finiteness (typeof-first) BEFORE the sort, then sort by key.
        // Cold path: the pairs array is throwaway scratch (never a hot allocation).
        const pairs = new Array(n);
        for (let i = 0; i < n; i++) {
            const k = keys[i];
            if (typeof k !== 'number' || !Number.isFinite(k)) {
                throw new TypeError(
                    '[lite-logn] SortedArray.build key must be a finite number, got ' + String(k));
            }
            const v = values[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new TypeError(
                    '[lite-logn] SortedArray.build value must be a finite number, got ' + String(v));
            }
            pairs[i] = [k, v];
        }
        pairs.sort((a, b) => a[0] - b[0]);
        const sa = new SortedArray(n);
        const K = sa._key, V = sa._value;
        for (let i = 0; i < n; i++) {
            const k = pairs[i][0];
            if (i > 0 && k === K[i - 1]) {
                throw new RangeError(
                    '[lite-logn] SortedArray.build duplicate key not allowed, got ' + String(k));
            }
            K[i] = k;
            V[i] = pairs[i][1];
        }
        sa._size = n;
        return sa;
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badKey(key) {
        throw new TypeError(
            '[lite-logn] SortedArray key must be a finite number, got ' + String(key));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] SortedArray value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badRank(k) {
        throw new TypeError(
            '[lite-logn] SortedArray index must be an integer, got ' + String(k));
    }

    /** @private */
    _badBound(b) {
        throw new TypeError(
            '[lite-logn] SortedArray rangeIter bound must be a number (not NaN), got ' + String(b));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] SortedArray rangeIter needs lo <= hi, got lo=' + String(lo) +
            ' hi=' + String(hi));
    }

    /** @private */
    _full() {
        throw new RangeError('[lite-logn] SortedArray full (capacity ' + this._cap + ')');
    }
}

// PersistentSegTree (v0.15.0 session) -- a FULLY PERSISTENT (branching) segment tree via path-copying (BELOW).

/**
 * Max PersistentSegTree element count: `0x3FFFFFFF` (2^30 - 1), matching SEGTREE_MAX, so
 * `2 * length` stays a positive int32 (the v0 tree holds `2n - 1` nodes). The real ceiling on
 * a large instance is the NODE ARENA, guarded separately by PST_MAX_NODES; this is the clean
 * per-argument door for `length` itself.
 */
const PST_MAX_LENGTH = 0x3FFFFFFF; // 2^30 - 1

/**
 * Max PersistentSegTree node-arena size: `0x7FFFFFFF` (2^31 - 1). Every node slot is a positive
 * int32 index into the parallel `_val` / `_left` / `_right` columns and is stored in the
 * `Uint32Array` child columns, so the arena's total node count must fit a positive int32. The
 * arena size is a PRODUCT (`versionCapacity * (H + 1)` plus the v0 base), so the guard uses a
 * FLOAT multiply (never `| 0`, which would wrap a large product to a small / negative int and
 * pass the door -> under-allocation -> OOB): the float product is exact to 2^53, so a genuine
 * overflow of this ceiling fails CLOSED (the S2D_MAX_CELLS / F2D_MAX_CELLS lesson).
 */
const PST_MAX_NODES = 0x7FFFFFFF; // 2^31 - 1

/**
 * A FULLY PERSISTENT (BRANCHING) SEGMENT TREE via PATH-COPYING: an associative range-fold over a
 * fixed-length array where EVERY version is preserved and queryable forever, and any version can be
 * branched off. `update(fromVersion, i, value)` does NOT mutate `fromVersion`; it returns a NEW
 * version whose root shares every off-path subtree with the parent and owns a freshly-copied
 * O(log n) root-to-leaf path. The complement to the flat SegmentTree (member 3): that one is a
 * single mutable timeline over a `Float64Array(2n)`; this one is a persistent DAG of immutable
 * nodes -- the "time-travel / what-if" segment tree.
 *
 * The load-bearing idiom (decisions/0017): persistent nodes are IMMUTABLE, SHARED across versions,
 * and NEVER individually freed, so the allocator is a monotonic BUMP/APPEND allocator -- NOT the
 * free-list NodePool the pointer members (SkipList / Treap / Scapegoat / SplayTree) use. A single
 * `_next` cursor hands out the next slot in the preallocated columns; `clear()` is the only reset
 * (rewind `_next`, re-seed v0). There is no `free()`: freeing a shared node would corrupt every
 * version that points at it.
 *
 * Layout (allocated once, sized to a worst-case node budget):
 *   - `_val`   Float64Array -- each node's folded value over its range.
 *   - `_left`  Uint32Array  -- left-child slot (NIL = 0 for a leaf).
 *   - `_right` Uint32Array  -- right-child slot (NIL = 0 for a leaf).
 *   - `_roots` Uint32Array(versionCapacity + 1) -- `_roots[v]` is version v's root slot.
 *   - `_next`  the bump cursor; slot 0 is the NIL sentinel (never allocatable; null is not zero).
 * Node budget = 1 (NIL) + (2n - 1) v0 nodes + versionCapacity * (H + 1), H = ceil(log2 n) (an
 * update copies at most H + 1 nodes; for a power-of-two n every leaf sits at depth H so each update
 * copies EXACTLY H + 1). The budget is guarded by a FLOAT product against PST_MAX_NODES.
 *
 * Versions are DENSE integers in creation order: version 0 is the initial tree; each successful
 * `update` returns the next integer (1, 2, ...). Fixed capacity: both the NODE arena AND the
 * VERSION arena fail CLOSED -- the `versionCapacity + 1`-th version throws `[lite-logn]`, never a
 * silent drop. An unknown / out-of-range version throws.
 *
 * The fold menu (min / max / sum / gcd) is chosen ONCE at construction and cached as a small-int
 * `_k` combined by an INLINE switch on every hot body (no function ref, no closure, no megamorphic
 * call site) -- EXACT parity with SegmentTree. Identity: sum -> 0, min -> +Infinity, max ->
 * -Infinity, gcd -> 0; an unwritten cell reads the fold identity (v0 seeds every leaf to it). The
 * value door is typeof-guarded FIRST (Symbol / BigInt / NaN / +-Infinity fail closed), and the gcd
 * kind additionally rejects negative / non-integer values -- byte-for-byte the SegmentTree contract.
 *
 * Hot ops allocate ZERO bytes after the arena is built: `query` / `at` are read-only descents;
 * `update` bump-allocates ONLY preallocated slots (no `new`, no typed-array growth). `query(version,
 * lo, hi)` folds `[lo, hi]` INCLUSIVE in worst-case O(log n) and is the gated O(log n) Witness op.
 */
export class PersistentSegTree {
    /**
     * @param {number} length           exact element count; integer in [1, 2^30-1].
     * @param {number} versionCapacity  max updates (extra versions beyond v0); integer >= 1.
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold.
     * @param {Float64Array} [_seed]    PRIVATE: validated v0 leaf values (from PersistentSegTree.build).
     */
    constructor(length, versionCapacity, kind, _seed) {
        // typeof guard BEFORE coercion (Number.isInteger is Symbol/BigInt-safe).
        if (typeof length !== 'number' || !Number.isInteger(length) ||
            length < 1 || length > PST_MAX_LENGTH) {
            throw new RangeError(
                '[lite-logn] PersistentSegTree length must be an integer in [1, 2^30-1], got ' +
                String(length));
        }
        if (typeof versionCapacity !== 'number' || !Number.isInteger(versionCapacity) ||
            versionCapacity < 1 || versionCapacity > PST_MAX_NODES) {
            throw new RangeError(
                '[lite-logn] PersistentSegTree versionCapacity must be an integer >= 1, got ' +
                String(versionCapacity));
        }
        const k = kind === 'min' ? 0 : kind === 'max' ? 1 : kind === 'sum' ? 2 :
            kind === 'gcd' ? 3 : -1;
        if (k === -1) {
            throw new RangeError(
                '[lite-logn] PersistentSegTree kind must be "min", "max", "sum" or "gcd", got ' +
                String(kind));
        }
        // H = ceil(log2 n) via a float doubling (safe past 2^30 where 1 << h would wrap).
        let h = 0, p = 1;
        while (p < length) { p *= 2; h++; }
        // FLOAT product (never `| 0`): a `| 0` would wrap a large budget to a small / negative int
        // and pass the door (fail OPEN -> under-allocation -> OOB). The float arithmetic is exact to
        // 2^53, so a genuine overflow of the 2^31-1 node ceiling fails CLOSED.
        const budget = 1 + (2 * length - 1) + versionCapacity * (h + 1);
        if (budget > PST_MAX_NODES) {
            throw new RangeError(
                '[lite-logn] PersistentSegTree node arena too large: 1 + (2n-1) + versionCapacity*(H+1) = ' +
                budget + ' exceeds ' + PST_MAX_NODES);
        }
        this._n = length;                          // element count (fixed)
        this._k = k;                               // ctor-frozen fold: 0 min 1 max 2 sum 3 gcd
        this._idv = k === 0 ? Infinity : k === 1 ? -Infinity : 0; // fold identity
        this._vcap = versionCapacity;              // max extra versions beyond v0 (fixed)
        this._budget = budget;                     // node-arena size incl. NIL slot 0 (fixed)
        this._val = new Float64Array(budget);      // node folded value; _val[0] = NIL, unused
        this._left = new Uint32Array(budget);      // left-child slot (NIL = 0 -> leaf)
        this._right = new Uint32Array(budget);     // right-child slot (NIL = 0 -> leaf)
        this._roots = new Uint32Array(versionCapacity + 1); // _roots[v] = version v's root slot
        this._next = 1;                            // bump cursor; slot 0 is the NIL sentinel
        this._vcount = 0;                          // live version count (set by the v0 seed below)
        // Seed version 0: identity leaves (fresh) or the validated _seed values (from build).
        this._roots[0] = this._build0(0, length - 1, _seed);
        this._vcount = 1;
    }

    /** Element count this tree was sized for. O(1). */
    get length() { return this._n; }

    /** The number of versions that currently exist (dense handles 0 .. versions-1). O(1). */
    get versions() { return this._vcount; }

    /** The max number of updates (extra versions beyond v0) this tree was sized for. O(1). */
    get versionCapacity() { return this._vcap; }

    /** The frozen associative fold, 'min' | 'max' | 'sum' | 'gcd'. O(1). */
    get kind() {
        const k = this._k;
        return k === 0 ? 'min' : k === 1 ? 'max' : k === 2 ? 'sum' : 'gcd';
    }

    /**
     * Bump-allocate the next node slot. NO free-list: persistent nodes are immutable + shared, so a
     * monotonic cursor is the whole allocator (decisions/0017). The overflow throw is DEAD-CODE by
     * construction -- the budget is sized to the exact worst case and the version guard fires first --
     * but kept as a loud fail-closed defense (the SparseTable r<l precedent).
     * @private
     * @returns {number} a fresh slot index in [1, budget)
     */
    _alloc() {
        const p = this._next;
        if (p >= this._budget) return this._fullNodes();
        this._next = p + 1;
        return p;
    }

    /**
     * Recursively build a subtree over `[lo, hi]`, returning its fresh slot. Leaves take the identity
     * (`seed === undefined`) or `seed[lo]` (validated by build); internals fold their two children via
     * the inline `_k` switch. O(n) over the whole range -- the v0 seed and `clear` re-seed. COLD.
     * @private
     */
    _build0(lo, hi, seed) {
        const nn = this._alloc();
        if (lo === hi) {
            this._val[nn] = seed === undefined ? this._idv : seed[lo];
            return nn;
        }
        const mid = (lo + hi) >> 1;
        const l = this._build0(lo, mid, seed);
        const r = this._build0(mid + 1, hi, seed);
        this._left[nn] = l;
        this._right[nn] = r;
        const k = this._k, a = this._val[l], b = this._val[r];
        this._val[nn] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) :
            k === 2 ? a + b : segGcd(a, b);
        return nn;
    }

    /**
     * The folded value over `[lo, hi]` INCLUSIVE in version `version`, worst-case O(log n): a
     * read-only descent that stops at any node whose range lies fully inside `[lo, hi]` (returning its
     * cached fold) and folds the two boundary sub-results via the inline `_k` switch. The GATED
     * O(log n) Witness op. Allocates ZERO bytes. Fails closed: an unknown / out-of-range version, an
     * out-of-range `lo` or `hi`, or `lo > hi` each throw `[lite-logn]`. A one-element range `lo == hi`
     * returns that leaf's value; an unwritten cell reads the fold identity.
     * @param {number} version  integer in [0, versions)
     * @param {number} lo       integer in [0, length)
     * @param {number} hi       integer in [lo, length)
     * @returns {number} the fold over `[lo, hi]` in the given version
     */
    query(version, lo, hi) {
        if (typeof version !== 'number' || !Number.isInteger(version) ||
            version < 0 || version >= this._vcount) {
            return this._badVersion(version);
        }
        const n = this._n;
        if (typeof lo !== 'number' || !Number.isInteger(lo) || lo < 0 || lo >= n) {
            return this._badRange(lo, hi);
        }
        if (typeof hi !== 'number' || !Number.isInteger(hi) || hi < 0 || hi >= n) {
            return this._badRange(lo, hi);
        }
        if (lo > hi) return this._badRange(lo, hi);
        return this._query(this._roots[version], 0, n - 1, lo, hi);
    }

    /**
     * Read-only range descent (see query). Fully-covered node -> its cached fold; range entirely in
     * one child -> tail-descend; range split -> fold both children via the inline `_k` switch. The two
     * off-path children are shared with the parent version, so no copy, no allocation. O(log n).
     * @private
     */
    _query(node, nodeLo, nodeHi, lo, hi) {
        if (lo <= nodeLo && nodeHi <= hi) return this._val[node];
        const mid = (nodeLo + nodeHi) >> 1;
        if (hi <= mid) return this._query(this._left[node], nodeLo, mid, lo, hi);
        if (lo > mid) return this._query(this._right[node], mid + 1, nodeHi, lo, hi);
        const a = this._query(this._left[node], nodeLo, mid, lo, hi);
        const b = this._query(this._right[node], mid + 1, nodeHi, lo, hi);
        const k = this._k;
        return k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) :
            k === 2 ? a + b : segGcd(a, b);
    }

    /**
     * The single element at 0-based leaf `i` in version `version`. O(log n) read-only descent (no
     * range fold). Fails closed: an unknown version or an out-of-range index each throw `[lite-logn]`.
     * @param {number} version  integer in [0, versions)
     * @param {number} i        integer in [0, length)
     * @returns {number}
     */
    at(version, i) {
        if (typeof version !== 'number' || !Number.isInteger(version) ||
            version < 0 || version >= this._vcount) {
            return this._badVersion(version);
        }
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        let node = this._roots[version], lo = 0, hi = this._n - 1;
        while (lo !== hi) {
            const mid = (lo + hi) >> 1;
            if (i <= mid) { node = this._left[node]; hi = mid; }
            else { node = this._right[node]; lo = mid + 1; }
        }
        return this._val[node];
    }

    /**
     * Set element `i` to `value` (ABSOLUTE) in a NEW version branched off `fromVersion`, WITHOUT
     * touching `fromVersion` (or any other version). Returns the new dense version handle. O(log n):
     * copies exactly the root-to-leaf path (H + 1 fresh slots via the bump allocator), sharing every
     * off-path subtree with the parent. Allocates ONLY preallocated slots (0 B/op). Fails closed as a
     * NO-OP (nothing allocated, no version created): an unknown `fromVersion`, a non-finite value
     * (typeof-guarded first), a gcd-kind value that is negative / non-integer, an out-of-range index,
     * or a FULL version arena each throw `[lite-logn]`.
     * @param {number} fromVersion  the version to branch off; integer in [0, versions)
     * @param {number} i            integer in [0, length)
     * @param {number} value        a finite number (nonnegative integer for the gcd kind)
     * @returns {number} the new version handle
     */
    update(fromVersion, i, value) {
        if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) ||
            fromVersion < 0 || fromVersion >= this._vcount) {
            return this._badVersion(fromVersion);
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) return this._badValue(value);
        if (this._k === 3 && (!Number.isInteger(value) || value < 0)) return this._badGcdValue(value);
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= this._n) {
            return this._badIndex(i);
        }
        if (this._vcount > this._vcap) return this._fullVersions();
        const newRoot = this._copy(this._roots[fromVersion], 0, this._n - 1, i, value);
        const v = this._vcount;
        this._roots[v] = newRoot;
        this._vcount = v + 1;
        return v;
    }

    /**
     * Copy the root-to-leaf path to leaf `i`, sharing the off-path child. Allocates the new node
     * FIRST, then descends into (and re-links) the single child on the path; the sibling pointer is
     * copied verbatim from the parent version (shared, immutable). Re-folds the new internal node from
     * its (one shared, one new) children via the inline `_k` switch. Returns the new node's slot.
     * O(log n) nodes, one alloc per level. @private
     */
    _copy(node, nodeLo, nodeHi, i, value) {
        const nn = this._alloc();
        if (nodeLo === nodeHi) {
            this._val[nn] = value;                 // leaf: children stay NIL (0)
            return nn;
        }
        const mid = (nodeLo + nodeHi) >> 1;
        let l = this._left[node], r = this._right[node];
        if (i <= mid) l = this._copy(l, nodeLo, mid, i, value);
        else r = this._copy(r, mid + 1, nodeHi, i, value);
        this._left[nn] = l;
        this._right[nn] = r;
        const k = this._k, a = this._val[l], b = this._val[r];
        this._val[nn] = k === 0 ? (a < b ? a : b) : k === 1 ? (a > b ? a : b) :
            k === 2 ? a + b : segGcd(a, b);
        return nn;
    }

    /**
     * Discard every version and value, rewind the arena, and re-seed a fresh identity version 0 --
     * keeping the fixed capacity. O(n) COLD (rebuilds the v0 tree). The bump cursor rewinds to 1 (the
     * NIL sentinel stays reserved), the version count resets to 1, and any handle from before `clear`
     * is invalid (versions >= 1 no longer exist and fail the version door).
     * @returns {this}
     */
    clear() {
        this._next = 1;
        this._vcount = 0;
        this._roots[0] = this._build0(0, this._n - 1, undefined);
        this._vcount = 1;
        return this;
    }

    /**
     * O(n) seed of version 0 from `values` (a snapshot, NOT n individual updates), returning a fresh
     * fully-persistent tree. COLD path; fails closed BEFORE the tree is usable on: a non-array-like
     * `values`, any non-finite entry, or (gcd kind) any negative / non-integer entry. `versionCapacity`
     * and `kind` are validated by the delegated ctor; `length` is `values.length`.
     * @param {ArrayLike<number>} values      finite numbers; length in [1, 2^30-1]
     * @param {number} versionCapacity        max updates (extra versions beyond v0); integer >= 1
     * @param {'min'|'max'|'sum'|'gcd'} kind  the frozen associative fold
     * @returns {PersistentSegTree}
     */
    static build(values, versionCapacity, kind) {
        if (values == null || typeof values.length !== 'number') {
            throw new TypeError('[lite-logn] PersistentSegTree.build needs an array-like of finite numbers');
        }
        const length = values.length;
        if (typeof length !== 'number' || !Number.isInteger(length) ||
            length < 1 || length > PST_MAX_LENGTH) {
            throw new RangeError(
                '[lite-logn] PersistentSegTree.build count must be an integer in [1, 2^30-1], got ' +
                String(length));
        }
        const gcdKind = kind === 'gcd';
        const seed = new Float64Array(length);     // COLD scratch: the validated v0 leaf values
        for (let i = 0; i < length; i++) {
            const v = values[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new TypeError(
                    '[lite-logn] PersistentSegTree.build value must be a finite number, got ' + String(v));
            }
            if (gcdKind && (!Number.isInteger(v) || v < 0)) {
                throw new RangeError(
                    '[lite-logn] PersistentSegTree.build gcd value must be a nonnegative integer, got ' +
                    String(v));
            }
            seed[i] = v;
        }
        // The ctor validates versionCapacity + kind and seeds v0 from the pre-validated column.
        return new PersistentSegTree(length, versionCapacity, kind, seed);
    }

    // ---- cold path only: throw builders (string concat off the hot body) ----

    /** @private */
    _badVersion(version) {
        throw new RangeError(
            '[lite-logn] PersistentSegTree version must be an integer in [0, ' + this._vcount +
            '), got ' + String(version));
    }

    /** @private */
    _badIndex(i) {
        throw new RangeError(
            '[lite-logn] PersistentSegTree index must be an integer in [0, ' + this._n + '), got ' +
            String(i));
    }

    /** @private */
    _badRange(lo, hi) {
        throw new RangeError(
            '[lite-logn] PersistentSegTree query needs integers 0 <= lo <= hi < ' + this._n +
            ', got lo=' + String(lo) + ' hi=' + String(hi));
    }

    /** @private */
    _badValue(value) {
        throw new TypeError(
            '[lite-logn] PersistentSegTree value must be a finite number, got ' + String(value));
    }

    /** @private */
    _badGcdValue(value) {
        throw new RangeError(
            '[lite-logn] PersistentSegTree gcd value must be a nonnegative integer, got ' +
            String(value));
    }

    /** @private */
    _fullVersions() {
        throw new RangeError(
            '[lite-logn] PersistentSegTree version arena full (versionCapacity ' + this._vcap + ')');
    }

    /** @private */
    _fullNodes() {
        throw new RangeError(
            '[lite-logn] PersistentSegTree node arena full (budget ' + this._budget + ')');
    }
}
