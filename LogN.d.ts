/**
 * @zakkster/lite-logn -- ambient type surface.
 *
 * Hand-written to mirror EXACTLY the runtime exports of LogN.js. The three-place
 * version sync (package.json / LogN.js VERSION / llms.txt) is enforced in review;
 * at v0.1.0 (the scaffold release) the only export is `VERSION`. One ambient
 * declaration block per member is appended here as each member ships. ASCII-only.
 *
 * @license MIT
 */

/** Package version string. */
export const VERSION: string;

// --- member type blocks land here, append-only, one per shipped member -------

/**
 * An indexed binary heap (addressable priority queue): a min|max binary heap over
 * three parallel typed arrays plus a reverse-index map, giving O(log n)
 * changeKey / remove by caller-supplied entity id. Entity ids are integers in
 * [0, capacity); keys are finite numbers. Every hot op allocates zero bytes.
 */
export class BinaryHeap {
    /** @param capacity exact max live entries; integer in [1, 2^31-1].
     *  @param kind the frozen extreme this heap reports (default 'min'). */
    constructor(capacity: number, kind?: 'min' | 'max');

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this heap was sized for. */
    readonly capacity: number;
    /** The frozen extreme this heap reports. */
    readonly kind: 'min' | 'max';

    /** Insert entity id with priority key. Throws on out-of-range/duplicate id,
     *  non-finite key, or a full heap. */
    push(id: number, key: number): void;
    /** Remove and return the extremum's entity id, or undefined if empty. */
    pop(): number | undefined;
    /** The extremum's entity id, or undefined if empty. */
    peek(): number | undefined;
    /** The extremum's key, or undefined if empty. */
    topKey(): number | undefined;
    /** The key associated with id, or undefined if absent. Out-of-range id throws. */
    keyOf(id: number): number | undefined;
    /** True iff id is currently in the heap. Out-of-range id throws. */
    has(id: number): boolean;
    /** Reprioritize a present entity, auto-directing the sift. Non-member throws. */
    changeKey(id: number, newKey: number): void;
    /** Remove entity id; true if it was present, false if absent (idempotent). */
    remove(id: number): boolean;
    /** Empty the heap. */
    clear(): void;
    /** Visit every live (id, key) pair in unspecified (heap-array) order. */
    forEach(fn: (id: number, key: number, heap: BinaryHeap) => void): void;
    /** Iterate live entity ids in unspecified (heap-array) order (NOT sorted). */
    [Symbol.iterator](): IterableIterator<number>;

    /** Floyd O(n) bulk build from parallel ids/keys arrays. */
    static build(
        kind: 'min' | 'max',
        ids: ArrayLike<number>,
        keys: ArrayLike<number>,
        capacity: number,
    ): BinaryHeap;
}

/**
 * A Fenwick tree (Binary Indexed Tree): BOTH point-update AND prefix-sum in
 * O(log n) over a single flat Float64Array via the lowest-set-bit walk (i & -i).
 * Public indices are 0-based in [0, length); internally 1-based (_t[0] the unused
 * identity sentinel). Values are finite numbers (negatives allowed); NaN /
 * Infinity / non-number fail closed. Every hot op allocates zero bytes.
 */
export class Fenwick {
    /** @param length exact element count; integer in [1, 2^31-1]. */
    constructor(length: number);

    /** Element count this tree was sized for. */
    readonly length: number;

    /** Add delta at 0-based index i. O(log n). Non-finite delta / out-of-range i throws. */
    update(i: number, delta: number): this;
    /** Sum of [0, i] inclusive (prefix(-1) === 0). O(log n). Out-of-range i throws. */
    prefix(i: number): number;
    /** Sum of [lo, hi] inclusive = prefix(hi) - prefix(lo-1). O(log n). lo > hi throws. */
    rangeSum(lo: number, hi: number): number;
    /** The single element at i = prefix(i) - prefix(i-1). O(log n). Out-of-range i throws. */
    at(i: number): number;
    /** Set the element at i to value (absolute). O(log n). Non-finite value throws. */
    set(i: number, value: number): this;
    /** Zero every element in place, keeping capacity. */
    clear(): this;
    /** Visit every element as (value, index, fenwick) in ascending index order. */
    forEach(fn: (value: number, index: number, fenwick: Fenwick) => void): void;

    /** O(n) linear bulk build from a finite-number array-like. */
    static build(values: ArrayLike<number>): Fenwick;
}

/**
 * A segment tree: an associative range-query AND a point-update, BOTH O(log n),
 * over a single flat Float64Array(2n) (leaves at n..2n-1, _t[0] unused). The fold
 * (min / max / sum / gcd) is chosen once at construction and cached. query(lo, hi)
 * is INCLUSIVE both ends; update(i, value) sets an ABSOLUTE leaf value. Values are
 * finite numbers (nonnegative integers for the gcd kind); NaN / +-Infinity / out-
 * of-domain values fail closed. Every hot op allocates zero bytes.
 */
export class SegmentTree {
    /** @param length exact element count; integer in [1, 2^30-1].
     *  @param kind the frozen associative fold. */
    constructor(length: number, kind: 'min' | 'max' | 'sum' | 'gcd');

    /** Element count this tree was sized for. */
    readonly length: number;
    /** The frozen associative fold. */
    readonly kind: 'min' | 'max' | 'sum' | 'gcd';

    /** Folded value over [lo, hi] inclusive both ends. O(log n). Throws on OOB or lo > hi. */
    query(lo: number, hi: number): number;
    /** Set leaf i to value (absolute), fixing ancestors. O(log n). Non-finite / OOB throws. */
    update(i: number, value: number): this;
    /** The single element at leaf i. O(1). Out-of-range i throws. */
    at(i: number): number;
    /** Reset every element to the fold identity, keeping capacity. */
    clear(): this;
    /** Visit every element as (value, index, tree) in ascending leaf order. */
    forEach(fn: (value: number, index: number, tree: SegmentTree) => void): void;

    /** O(n) bottom-up bulk build from a finite-number array-like and a fold kind. */
    static build(values: ArrayLike<number>, kind: 'min' | 'max' | 'sum' | 'gcd'): SegmentTree;
}

/**
 * A skip list: a pointer-free ordered map (key -> value) whose get / set / delete /
 * successor / predecessor are EXPECTED O(log n) via a probabilistic tower of forward
 * links stored as slot INDICES in flat Uint32Array columns over a private free-list
 * (no heap objects per op). Keys are finite numbers (typeof-guarded before coercion;
 * Symbol / BigInt / NaN / +-Infinity fail closed); values are finite numbers. set on
 * an existing key updates the value in place. An unsupplied seed defaults to a fixed
 * constant; a fixed seed replays an identical structure. Fixed capacity: a full pool
 * throws. Every hot op allocates zero bytes.
 */
export class SkipList {
    /** @param capacity exact max live entries; integer in [1, 2^26-1].
     *  @param seed PRNG seed; unsigned 32-bit integer (default fixed). */
    constructor(capacity: number, seed?: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this list was sized for. */
    readonly capacity: number;

    /** The value under key, or undefined if absent (no throw). Non-finite key throws. */
    get(key: number): number | undefined;
    /** Insert key -> value, or update the value in place if key exists. Non-finite
     *  key/value throws; a full pool throws. */
    set(key: number, value: number): this;
    /** Remove key; true if it was present, false if absent (idempotent). Non-finite key throws. */
    delete(key: number): boolean;
    /** The smallest key strictly greater than key, or undefined. Non-finite key throws. */
    successor(key: number): number | undefined;
    /** The largest key strictly less than key, or undefined. Non-finite key throws. */
    predecessor(key: number): number | undefined;
    /** A version-stamped iterator over keys in [lo, hi] inclusive, ascending. Bounds
     *  may be +-Infinity (unbounded ends); NaN or lo > hi throws; mutation during
     *  iteration throws. */
    rangeIter(lo: number, hi: number): IterableIterator<number>;
    /** Visit every (key, value) pair in ascending key order. */
    forEach(fn: (key: number, value: number, list: SkipList) => void): void;
    /** Empty the list, keeping capacity (resets the PRNG to its initial seed). */
    clear(): this;
}

/**
 * A treap: a randomized, self-balancing BST that is also an order-statistic tree (an
 * AUGMENTED ordered map key -> value). BST order on keys x max-heap order on a per-node
 * random priority gives EXPECTED O(log n) height; a subtree-size column adds O(log n)
 * rank / select / split / merge. Nodes are slot INDICES in flat typed-array columns
 * over a private free-list (no heap object per op). Keys and values are finite numbers
 * (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed). set
 * on an existing key updates the value in place. EXPECTED, not worst-case (an unlucky
 * priority draw can spike one op; the MAX single insert is disclosed, not gated). Fixed
 * capacity: a full pool throws. Every hot op allocates zero bytes.
 */
export class Treap {
    /** @param capacity exact max live entries; integer in [1, 2^31-1].
     *  @param seed PRNG seed; unsigned 32-bit integer (default fixed). */
    constructor(capacity: number, seed?: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this treap was sized for. */
    readonly capacity: number;

    /** The value under key, or undefined if absent (no throw). Non-finite key throws. */
    get(key: number): number | undefined;
    /** True iff key is currently stored. Non-finite key throws. */
    has(key: number): boolean;
    /** Insert key -> value, or update the value in place if key exists. Non-finite
     *  key/value throws; a full pool throws. */
    set(key: number, value: number): this;
    /** Remove key; true if it was present, false if absent (idempotent). Non-finite key throws. */
    delete(key: number): boolean;
    /** Count of stored keys strictly less than x (its rank), in [0, size]. Non-finite x throws. */
    rank(x: number): number;
    /** The k-th smallest key (0-based), or undefined if k is out of [0, size). Non-integer k throws. */
    select(k: number): number | undefined;
    /** The smallest key strictly greater than key, or undefined. Non-finite key throws. */
    successor(key: number): number | undefined;
    /** The largest key strictly less than key, or undefined. Non-finite key throws. */
    predecessor(key: number): number | undefined;
    /** A version-stamped iterator over keys in [lo, hi] inclusive, ascending. Bounds
     *  may be +-Infinity (unbounded ends); NaN or lo > hi throws; mutation during
     *  iteration throws. */
    rangeIter(lo: number, hi: number): IterableIterator<number>;
    /** Visit every (key, value) pair in ascending key order. */
    forEach(fn: (key: number, value: number, treap: Treap) => void): void;
    /** Empty the treap, keeping capacity (resets the PRNG to its initial seed). */
    clear(): this;

    /** Split at key into [left (keys < key), right (keys >= key)]; CONSUMES this and
     *  returns two treaps SHARING this treap's backing arena. Non-finite key throws. */
    split(key: number): [Treap, Treap];
    /** Merge two arena-sharing treaps where every key of a < every key of b, CONSUMING
     *  both. Non-Treap inputs, different arenas, or an overlapping range throw. */
    static merge(a: Treap, b: Treap): Treap;
}

/**
 * A scapegoat tree: a DETERMINISTIC, weight-balanced BST that is also an order-statistic
 * tree (an AUGMENTED ordered map key -> value) -- the honest pair to Treap. `get` is
 * WORST-case O(log n) (a hard height bound, never merely expected); `set` / `delete` are
 * AMORTIZED O(log n) (an occasional subtree rebuild absorbs the imbalance). A subtree-size
 * column adds O(log n) rank / select. No priorities, no RNG: the shape is a deterministic
 * function of the insert / delete order. Nodes are slot INDICES in flat typed-array columns
 * over a private free-list, and every rebuild reuses ONE preallocated scratch buffer + index
 * stack (no heap object, no fresh array per op). Keys and values are finite numbers (typeof-
 * guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed). set on an existing
 * key updates the value in place. Fixed capacity: a full pool throws. Every hot op allocates
 * zero bytes. There is deliberately NO split / merge (the treap's arena-sharing surgery has no
 * honest deterministic O(log n) analogue here) -- the documented asymmetry vs Treap.
 */
export class Scapegoat {
    /** @param capacity exact max live entries; integer in [1, 2^31-1].
     *  @param alpha weight-balance factor in the OPEN interval (0.55, 0.75); default 2/3.
     *         Both ends throw. Frozen after construction. */
    constructor(capacity: number, alpha?: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this tree was sized for. */
    readonly capacity: number;
    /** The frozen weight-balance factor. */
    readonly alpha: number;

    /** The value under key, or undefined if absent (no throw). Non-finite key throws. */
    get(key: number): number | undefined;
    /** True iff key is currently stored. Non-finite key throws. */
    has(key: number): boolean;
    /** Insert key -> value, or update the value in place if key exists. Non-finite
     *  key/value throws; a full pool throws. */
    set(key: number, value: number): this;
    /** Remove key; true if it was present, false if absent (idempotent). Non-finite key throws. */
    delete(key: number): boolean;
    /** Count of stored keys strictly less than x (its rank), in [0, size]. Non-finite x throws. */
    rank(x: number): number;
    /** The k-th smallest key (0-based), or undefined if k is out of [0, size). Non-integer k throws. */
    select(k: number): number | undefined;
    /** The smallest key strictly greater than key, or undefined. Non-finite key throws. */
    successor(key: number): number | undefined;
    /** The largest key strictly less than key, or undefined. Non-finite key throws. */
    predecessor(key: number): number | undefined;
    /** A version-stamped iterator over keys in [lo, hi] inclusive, ascending. Bounds
     *  may be +-Infinity (unbounded ends); NaN or lo > hi throws; mutation during
     *  iteration throws. */
    rangeIter(lo: number, hi: number): IterableIterator<number>;
    /** Visit every (key, value) pair in ascending key order. */
    forEach(fn: (key: number, value: number, tree: Scapegoat) => void): void;
    /** Empty the tree, keeping capacity. */
    clear(): this;
}

/**
 * A min-max heap: a DOUBLE-ENDED priority queue (DEPQ) in ONE array-embedded binary heap
 * whose levels ALTERNATE min / max (Atkinson et al. 1986). The minimum is the root; the
 * maximum is the larger of the root's up-to-two children. peekMin / peekMax are O(1);
 * push / popMin / popMax are O(log n) WORST-case. Two parallel typed-array columns (_key
 * Float64, _id Uint32); the id is an OPAQUE Uint32 payload in [0, 2^32) (not unique, no
 * reverse map), so there is deliberately NO changeKey / remove (the asymmetry vs
 * BinaryHeap). Keys are finite numbers (typeof-guarded before coercion; Symbol / BigInt /
 * NaN / +-Infinity fail closed). Fixed capacity: a full heap throws. Every hot op
 * allocates zero bytes.
 */
export class MinMaxHeap {
    /** @param capacity exact max live entries; integer in [1, 2^31-1]. */
    constructor(capacity: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this heap was sized for. */
    readonly capacity: number;

    /** Insert id with priority key. Throws on non-finite key, out-of-range id, or a full heap. */
    push(id: number, key: number): void;
    /** Remove and return the id at the minimum key, or undefined if empty. */
    popMin(): number | undefined;
    /** Remove and return the id at the maximum key, or undefined if empty. */
    popMax(): number | undefined;
    /** The id at the minimum key, or undefined if empty. */
    peekMin(): number | undefined;
    /** The id at the maximum key, or undefined if empty. */
    peekMax(): number | undefined;
    /** The minimum key, or undefined if empty. */
    peekMinKey(): number | undefined;
    /** The maximum key, or undefined if empty. */
    peekMaxKey(): number | undefined;
    /** Empty the heap, keeping capacity. */
    clear(): void;
    /** Visit every live (id, key) pair in unspecified (heap-array) order. */
    forEach(fn: (id: number, key: number, heap: MinMaxHeap) => void): void;
    /** Iterate live entity ids in unspecified (heap-array) order (NOT sorted). */
    [Symbol.iterator](): IterableIterator<number>;

    /** Floyd O(n) bulk build from parallel ids/keys arrays (level-aware sift-down). */
    static build(
        ids: ArrayLike<number>,
        keys: ArrayLike<number>,
        capacity: number,
    ): MinMaxHeap;
}

/**
 * A splay tree: a SELF-ADJUSTING BST ordered map (key -> value) whose every access moves
 * the touched key (or, for an absent key, the last node on the search path) to the root via
 * an iterative TOP-DOWN splay, so hot / recently-used keys ride near the top. get / has /
 * set / delete / successor / predecessor are AMORTIZED O(log n) and DETERMINISTIC (no RNG);
 * a single cold deep access can splay an O(n) chain (disclosed by the witness, not gated).
 * A READ MUTATES: get / has / successor / predecessor SPLAY and bump the iteration version,
 * so an in-flight rangeIter fails closed even on a read. Nodes are slot INDICES in flat
 * typed-array columns over a private free-list (no heap object per op). This is the LEAN
 * member: NO rank / select / split / merge (the documented asymmetry vs Treap / Scapegoat).
 * Keys and values are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN
 * / +-Infinity fail closed). set on an existing key updates the value in place. Fixed
 * capacity: a full pool throws. Every hot op allocates zero bytes.
 */
export class SplayTree {
    /** @param capacity exact max live entries; integer in [1, 2^31-1]. */
    constructor(capacity: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this tree was sized for. */
    readonly capacity: number;

    /** The value under key, or undefined if absent (no throw). SPLAYS + bumps version.
     *  Non-finite key throws. */
    get(key: number): number | undefined;
    /** True iff key is currently stored. SPLAYS + bumps version. Non-finite key throws. */
    has(key: number): boolean;
    /** Insert key -> value, or update the value in place if key exists. Non-finite
     *  key/value throws; a full pool throws. */
    set(key: number, value: number): this;
    /** Remove key; true if it was present, false if absent (idempotent). Non-finite key throws. */
    delete(key: number): boolean;
    /** The smallest key strictly greater than key, or undefined. SPLAYS the closest node.
     *  Non-finite key throws. */
    successor(key: number): number | undefined;
    /** The largest key strictly less than key, or undefined. SPLAYS the closest node.
     *  Non-finite key throws. */
    predecessor(key: number): number | undefined;
    /** A version-stamped, NON-splaying iterator over keys in [lo, hi] inclusive, ascending.
     *  Bounds may be +-Infinity (unbounded ends); NaN or lo > hi throws; any mutation
     *  (INCLUDING a get / has) during iteration throws. */
    rangeIter(lo: number, hi: number): IterableIterator<number>;
    /** Visit every (key, value) pair in ascending key order (NON-splaying). */
    forEach(fn: (key: number, value: number, tree: SplayTree) => void): void;
    /** Iterate the keys in ascending order (NON-splaying). */
    [Symbol.iterator](): IterableIterator<number>;
    /** Empty the tree, keeping capacity. */
    clear(): this;
}

/**
 * A binomial heap: the family's first MERGEABLE priority queue -- a forest of heap-ordered
 * binomial trees whose defining op is `meld` (union two heaps) in O(log n) WORST-case via a
 * binary carry over the two order-sorted root lists. push is O(1) amortized (O(log n) worst),
 * popMin is O(log n) worst, peekMin is O(1) via a cached extreme root. LEAN + NON-ADDRESSABLE
 * (the MinMaxHeap idiom): push / popMin / peekMin / peekMinKey / meld only -- the id is an
 * OPAQUE Uint32 payload in [0, 2^32) (not unique, no reverse map), so there is deliberately NO
 * decreaseKey / remove / changeKey / rank / select. SHARED-ARENA meld: a standalone
 * `new BinomialHeap(capacity, kind)` owns its own arena; `BinomialHeap.arena(capacity, kind,
 * count)` hands out `count` arena-sharing heaps that can meld with one another. `a.meld(b)`
 * CONSUMES b (empty, size 0, and DEAD -- any later op throws). kind 'min' | 'max' is frozen at
 * construction. Keys are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN
 * / +-Infinity fail closed). forEach / iterator yield ids in UNSPECIFIED (forest) order. Fixed
 * capacity: a full arena throws. Every hot op allocates zero bytes.
 */
export class BinomialHeap {
    /** @param capacity arena-wide node budget; integer in [1, 2^31-1]. @param kind frozen polarity (default 'min'). */
    constructor(capacity: number, kind?: 'min' | 'max');

    /** Build `count` empty heaps sharing ONE backing arena, so any two can meld. */
    static arena(capacity: number, kind: 'min' | 'max', count: number): BinomialHeap[];

    /** Live entry count (0 once consumed by a meld). */
    readonly size: number;
    /** The fixed arena-wide capacity this heap draws from. */
    readonly capacity: number;
    /** The frozen heap polarity. */
    readonly kind: 'min' | 'max';

    /** Insert id with priority key. Throws on non-finite key, out-of-range id, a full arena, or a consumed heap. */
    push(id: number, key: number): void;
    /** Remove and return the id at the extreme key, or undefined if empty. Consumed heap throws. */
    popMin(): number | undefined;
    /** The id at the extreme key, or undefined if empty. Consumed heap throws. */
    peekMin(): number | undefined;
    /** The extreme key, or undefined if empty. Consumed heap throws. */
    peekMinKey(): number | undefined;
    /** Meld `other` into this heap in O(log n); CONSUMES other. Non-BinomialHeap arg, self,
     *  cross-arena, kind mismatch, or a consumed operand throw. */
    meld(other: BinomialHeap): this;
    /** Empty this heap, returning only its own nodes to the shared pool. Consumed heap throws. */
    clear(): this;
    /** Visit every live (id, key) pair in unspecified (forest) order (NOT sorted). */
    forEach(fn: (id: number, key: number, heap: BinomialHeap) => void): void;
    /** Iterate live entity ids in unspecified (forest) order (NOT sorted). */
    [Symbol.iterator](): IterableIterator<number>;
}

/**
 * A pairing heap: the mergeable-heap arc's ADDRESSABLE member -- a single multi-way heap-ordered
 * tree whose defining ops are a cut-and-link `decreaseKey` (AMORTIZED O(log n)) and an O(1) `meld`.
 * push / peekMin / peekMinKey / meld are O(1); popMin / decreaseKey / remove are AMORTIZED O(log n).
 * ADDRESSABLE with ARENA-WIDE-UNIQUE ids: caller ids are unique integers in [0, capacity), and the
 * reverse map is shared across EVERY heap drawing the arena (a LOUD contract difference vs
 * BinomialHeap's opaque, non-unique ids). Each slot carries an owner tag so decreaseKey(id) /
 * remove(id) on an id owned by a DIFFERENT live sibling heap throws `[lite-logn]` (fail closed).
 * SHARED-ARENA meld is O(1) (a single root-link + a union alias, INDEPENDENT of |other|) and
 * CONSUMES `other` (empty, size 0, DEAD -- any later op throws). `decreaseKey` operates TOWARD the
 * heap's extreme (decrease for 'min', increase for 'max'); a move away fails closed. kind
 * 'min' | 'max' is frozen at construction. Keys are finite numbers (typeof-guarded before coercion).
 * forEach / iterator yield ids in UNSPECIFIED (forest) order. Fixed capacity: a full arena throws.
 * Every hot op allocates zero bytes.
 */
export class PairingHeap {
    /** @param capacity arena-wide node budget (and the id domain [0, capacity)); integer in [1, 2^31-1]. @param kind frozen polarity (default 'min'). */
    constructor(capacity: number, kind?: 'min' | 'max');

    /** Build `count` empty heaps sharing ONE backing arena (pool + columns + arena-wide reverse map), so any two can meld in O(1). */
    static arena(capacity: number, kind: 'min' | 'max', count: number): PairingHeap[];

    /** Live entry count (0 once consumed by a meld). */
    readonly size: number;
    /** The fixed arena-wide capacity this heap draws from. */
    readonly capacity: number;
    /** The frozen heap polarity. */
    readonly kind: 'min' | 'max';

    /** Insert id (unique arena-wide) with priority key. Throws on non-finite key, out-of-range id, a live-anywhere id, a full arena, or a consumed heap. */
    push(id: number, key: number): void;
    /** Remove and return the id at the extreme key, or undefined if empty. Consumed heap throws. */
    popMin(): number | undefined;
    /** The id at the extreme key, or undefined if empty. Consumed heap throws. */
    peekMin(): number | undefined;
    /** The extreme key, or undefined if empty. Consumed heap throws. */
    peekMinKey(): number | undefined;
    /** Reprioritize `id` TOWARD the heap's extreme. Throws on non-finite key, out-of-range/non-member id, a sibling-owned id, a move away from the extreme, or a consumed heap. */
    decreaseKey(id: number, newKey: number): void;
    /** Remove `id` from this heap; true if present, false if absent. Throws on out-of-range id, a sibling-owned id, or a consumed heap. */
    remove(id: number): boolean;
    /** True iff `id` is currently in THIS heap. Out-of-range id / consumed heap throw. */
    has(id: number): boolean;
    /** The key of `id` in THIS heap, or undefined if absent / sibling-owned. Out-of-range id / consumed heap throw. */
    keyOf(id: number): number | undefined;
    /** Meld `other` into this heap in O(1); CONSUMES other. Non-PairingHeap arg, self, cross-arena, kind mismatch, or a consumed operand throw. */
    meld(other: PairingHeap): this;
    /** Empty this heap, returning only its own nodes to the shared pool. Consumed heap throws. */
    clear(): this;
    /** Visit every live (id, key) pair in unspecified (forest) order (NOT sorted). */
    forEach(fn: (id: number, key: number, heap: PairingHeap) => void): void;
    /** Iterate live entity ids in unspecified (forest) order (NOT sorted). */
    [Symbol.iterator](): IterableIterator<number>;
}

/**
 * A Fibonacci heap: the mergeable-heap arc's FINALE -- the textbook-optimal addressable + mergeable
 * priority queue whose push / meld / decreaseKey are O(1) AMORTIZED and popMin / remove O(log n)
 * AMORTIZED, reached by a lazy forest of heap-ordered trees, a CASCADING-cut decreaseKey governed by
 * a per-node MARK bit, and a degree-CONSOLIDATING popMin. Same ADDRESSABLE, ARENA-WIDE-UNIQUE-id
 * contract as PairingHeap: ids are unique integers in [0, capacity); the reverse map is shared across
 * every heap in the arena; a slot's owner tag makes a sibling-owned decreaseKey(id) / remove(id) fail
 * closed. SHARED-ARENA meld is O(1) (concatenate two circular root lists + a union alias, INDEPENDENT
 * of |other|) and CONSUMES `other` (empty, size 0, DEAD). `decreaseKey` operates TOWARD the extreme;
 * a move away fails closed. kind 'min' | 'max' is frozen at construction. Keys are finite numbers
 * (typeof-guarded before coercion). forEach / iterator yield ids in UNSPECIFIED (forest) order.
 * Honesty: textbook-optimal asymptotics, but OFTEN SLOWER wall-clock than Pairing / Binary; the MAX
 * single popMin / decreaseKey spikes are DISCLOSED, not gated. Every hot op allocates zero bytes.
 */
export class FibonacciHeap {
    /** @param capacity arena-wide node budget (and the id domain [0, capacity)); integer in [1, 2^31-1]. @param kind frozen polarity (default 'min'). */
    constructor(capacity: number, kind?: 'min' | 'max');

    /** Build `count` empty heaps sharing ONE backing arena (pool + columns + reverse map + degree-bucket scratch), so any two can meld in O(1). */
    static arena(capacity: number, kind: 'min' | 'max', count: number): FibonacciHeap[];

    /** Live entry count (0 once consumed by a meld). */
    readonly size: number;
    /** The fixed arena-wide capacity this heap draws from. */
    readonly capacity: number;
    /** The frozen heap polarity. */
    readonly kind: 'min' | 'max';

    /** Insert id (unique arena-wide) with priority key. Throws on non-finite key, out-of-range id, a live-anywhere id, a full arena, or a consumed heap. */
    push(id: number, key: number): void;
    /** Remove and return the id at the extreme key, or undefined if empty. Consumed heap throws. */
    popMin(): number | undefined;
    /** The id at the extreme key, or undefined if empty. Consumed heap throws. */
    peekMin(): number | undefined;
    /** The extreme key, or undefined if empty. Consumed heap throws. */
    peekMinKey(): number | undefined;
    /** Reprioritize `id` TOWARD the heap's extreme. Throws on non-finite key, out-of-range/non-member id, a sibling-owned id, a move away from the extreme, or a consumed heap. */
    decreaseKey(id: number, newKey: number): void;
    /** Remove `id` from this heap; true if present, false if absent. Throws on out-of-range id, a sibling-owned id, or a consumed heap. */
    remove(id: number): boolean;
    /** True iff `id` is currently in THIS heap. Out-of-range id / consumed heap throw. */
    has(id: number): boolean;
    /** The key of `id` in THIS heap, or undefined if absent / sibling-owned. Out-of-range id / consumed heap throw. */
    keyOf(id: number): number | undefined;
    /** Meld `other` into this heap in O(1); CONSUMES other. Non-FibonacciHeap arg, self, cross-arena, kind mismatch, or a consumed operand throw. */
    meld(other: FibonacciHeap): this;
    /** Empty this heap, returning only its own nodes to the shared pool. Consumed heap throws. */
    clear(): this;
    /** Visit every live (id, key) pair in unspecified (forest) order (NOT sorted). */
    forEach(fn: (id: number, key: number, heap: FibonacciHeap) => void): void;
    /** Iterate live entity ids in unspecified (forest) order (NOT sorted). */
    [Symbol.iterator](): IterableIterator<number>;
}

/**
 * A 2D Fenwick tree (2D Binary Indexed Tree): a point-update AND a rectangle-sum,
 * BOTH O(log^2 n), over a single flat Float64Array((rows+1)*(cols+1)) via the
 * i & -i lowest-set-bit walk NESTED over two dimensions. Public coordinates are
 * 0-based (r, c) in [0, rows) x [0, cols); row 0 / col 0 are internal sentinels.
 * rectSum(r1,c1,r2,c2) is INCLUSIVE on all four edges (2D inclusion-exclusion);
 * prefix(r, c) is the rectangle [0..r] x [0..c] INCLUSIVE (prefix(-1, .) / prefix
 * (., -1) === 0). SUM-ONLY (an invertible group): rectangle min/max/gcd are NOT
 * supported. Values are finite numbers; NaN / +-Infinity / non-number fail closed.
 * Dimensions are fixed at construction. Every hot op allocates zero bytes.
 */
export class Fenwick2D {
    /** @param rows row count; integer >= 1. @param cols column count; integer >= 1.
     *  (rows+1)*(cols+1) must be <= 2^31-1 (checked with a float multiply). */
    constructor(rows: number, cols: number);

    /** Row count this tree was sized for. */
    readonly rows: number;
    /** Column count this tree was sized for. */
    readonly cols: number;

    /** Add delta at 0-based (r, c). O(log^2 n). Non-finite delta / out-of-range coord throws. */
    update(r: number, c: number, delta: number): this;
    /** Sum of the rectangle [0..r] x [0..c] inclusive (prefix(-1, .) / prefix(., -1) === 0). O(log^2 n). Out-of-range throws. */
    prefix(r: number, c: number): number;
    /** Sum of [r1..r2] x [c1..c2] inclusive on all four edges (2D inclusion-exclusion). O(log^2 n). r1 > r2 / c1 > c2 throws. */
    rectSum(r1: number, c1: number, r2: number, c2: number): number;
    /** The single cell at (r, c) = its 1x1 rectangle sum. O(log^2 n). Out-of-range throws. */
    at(r: number, c: number): number;
    /** Set the cell at (r, c) to value (absolute). O(log^2 n). Non-finite value throws. */
    set(r: number, c: number, value: number): this;
    /** Zero every cell in place, keeping dimensions. */
    clear(): this;
    /** Visit every cell as (value, r, c, fenwick2d) in row-major ascending order. */
    forEach(fn: (value: number, r: number, c: number, fenwick2d: Fenwick2D) => void): void;

    /** O(rows*cols) linear bulk build from a 2D array-like of finite numbers (equal-length rows). */
    static build(matrix: ArrayLike<ArrayLike<number>>): Fenwick2D;
}

/**
 * A 2D segment tree (a segment tree of segment trees): a point-update AND a
 * rectangle-fold, BOTH O(log^2 n), over one flat Float64Array(4*rows*cols). The
 * general associative + commutative rectangle fold (min / max / sum / gcd) a 2D BIT
 * cannot do -- SegmentTree2D : Fenwick2D :: SegmentTree (1D) : Fenwick (1D). Fold is
 * chosen once at construction. Space is 4*rows*cols cells (~4x a 2D BIT).
 */
export class SegmentTree2D {
    /** @param rows row count; integer >= 1. @param cols column count; integer >= 1.
     *  @param kind the frozen associative fold. 4*rows*cols must be <= 2^31-1 (checked with a float multiply). */
    constructor(rows: number, cols: number, kind: 'min' | 'max' | 'sum' | 'gcd');

    /** Row count this tree was sized for. */
    readonly rows: number;
    /** Column count this tree was sized for. */
    readonly cols: number;
    /** The frozen associative fold. */
    readonly kind: 'min' | 'max' | 'sum' | 'gcd';

    /** The fold over the rectangle [r1..r2] x [c1..c2] inclusive on all four edges. O(log^2 n). Out-of-range / r1 > r2 / c1 > c2 throws. */
    query(r1: number, c1: number, r2: number, c2: number): number;
    /** Set the cell at 0-based (r, c) to value (absolute), fixing every affected fold. O(log^2 n). Non-finite (or out-of-domain gcd) value / out-of-range coord throws. */
    update(r: number, c: number, value: number): this;
    /** The single cell at 0-based (r, c). O(1). Out-of-range throws. */
    at(r: number, c: number): number;
    /** Reset every cell to the fold identity in place, keeping dimensions. */
    clear(): this;
    /** Visit every cell as (value, r, c, tree) in row-major ascending order. */
    forEach(fn: (value: number, r: number, c: number, tree: SegmentTree2D) => void): void;

    /** O(rows*cols) bottom-up bulk build from a 2D array-like of finite numbers (equal-length rows). */
    static build(matrix: ArrayLike<ArrayLike<number>>, kind: 'min' | 'max' | 'sum' | 'gcd'): SegmentTree2D;
}

/**
 * A dynamic, read-optimized, key -> value ordered map over two parallel sorted
 * Float64Arrays. Contiguous storage: the fastest forEach, O(1) select / keyAt /
 * valueAt / min / max (a raw array index), O(log n) get / has / rank / successor /
 * predecessor (one shared lower-bound binary search) -- at the honest cost of O(n)
 * set (insert-with-shift) and delete (shift-down) via copyWithin (no temp, no spread).
 * The gated hot op is get (worst-case O(log n)); the O(n) insert is a disclosed
 * max-single-op cost, never gated. Keys and values are finite numbers (typeof-guarded
 * first). Every read allocates zero bytes; the O(n) write shifts in place (0 B/op).
 */
export class SortedArray {
    /** @param capacity exact max live entries; integer in [1, 2^31-1]. */
    constructor(capacity: number);

    /** Live entry count. */
    readonly size: number;
    /** The fixed capacity this map was sized for. */
    readonly capacity: number;

    /** The value under key, or undefined if absent (no throw). O(log n). Non-finite key throws. */
    get(key: number): number | undefined;
    /** True iff key is currently stored. O(log n). Non-finite key throws. */
    has(key: number): boolean;
    /** Insert key -> value (O(n) shift), or update the value in place if key exists (O(log n)).
     *  Non-finite key/value throws; a full map throws. */
    set(key: number, value: number): this;
    /** Remove key; true if it was present, false if absent (idempotent). O(n) shift. Non-finite key throws. */
    delete(key: number): boolean;
    /** Count of stored keys strictly less than x (its rank), in [0, size]. O(log n). Non-finite x throws. */
    rank(x: number): number;
    /** The k-th smallest key (0-based), or undefined if k is out of [0, size). O(1). Non-integer k throws. */
    select(k: number): number | undefined;
    /** The key at 0-based order-statistic index k (select's twin), or undefined if out of range. O(1). Non-integer k throws. */
    keyAt(k: number): number | undefined;
    /** The value parallel to the key at 0-based index k, or undefined if out of range. O(1). Non-integer k throws. */
    valueAt(k: number): number | undefined;
    /** The smallest key strictly greater than key, or undefined. O(log n). Non-finite key throws. */
    successor(key: number): number | undefined;
    /** The largest key strictly less than key, or undefined. O(log n). Non-finite key throws. */
    predecessor(key: number): number | undefined;
    /** The smallest key, or undefined if empty. O(1). */
    min(): number | undefined;
    /** The largest key, or undefined if empty. O(1). */
    max(): number | undefined;
    /** A version-stamped iterator over keys in [lo, hi] inclusive, ascending. Bounds
     *  may be +-Infinity (unbounded ends); NaN or lo > hi throws; mutation during
     *  iteration throws. O(log n + k). */
    rangeIter(lo: number, hi: number): IterableIterator<number>;
    /** Visit every (key, value) pair in ascending key order (contiguous O(n) scan). */
    forEach(fn: (key: number, value: number, sortedArray: SortedArray) => void): void;
    /** Empty the map, keeping capacity. O(1). */
    clear(): this;

    /** O(n log n) build from two parallel array-likes of finite numbers: sort once by key.
     *  Length mismatch, count outside [1, 2^31-1], non-finite entry, or a duplicate key throws. */
    static build(keys: ArrayLike<number>, values: ArrayLike<number>): SortedArray;
}

/**
 * A FULLY PERSISTENT (BRANCHING) segment tree via path-copying: an associative range-fold
 * (min | max | sum | gcd, frozen at construction) over a fixed-length array where every version is
 * preserved and queryable forever and any version can be branched off. `update(fromVersion, i, value)`
 * does NOT mutate fromVersion; it returns a new dense version sharing every off-path subtree with the
 * parent (O(log n) time and O(log n) new nodes) over a monotonic bump/append node arena.
 */
export class PersistentSegTree {
    /** @param length exact element count; integer in [1, 2^30-1].
     *  @param versionCapacity max updates (extra versions beyond v0); integer >= 1.
     *  @param kind the frozen associative fold. */
    constructor(length: number, versionCapacity: number, kind: 'min' | 'max' | 'sum' | 'gcd');

    /** Element count this tree was sized for. */
    readonly length: number;
    /** The number of versions that currently exist (dense handles 0 .. versions-1). */
    readonly versions: number;
    /** The max number of updates (extra versions beyond v0) this tree was sized for. */
    readonly versionCapacity: number;
    /** The frozen associative fold. */
    readonly kind: 'min' | 'max' | 'sum' | 'gcd';

    /** The fold over [lo, hi] INCLUSIVE in the given version, worst-case O(log n). Unknown version,
     *  out-of-range lo/hi, or lo > hi throws. */
    query(version: number, lo: number, hi: number): number;
    /** The single element at 0-based leaf i in the given version. O(log n). Unknown version or
     *  out-of-range index throws. */
    at(version: number, i: number): number;
    /** Set element i to value (ABSOLUTE) in a NEW version branched off fromVersion, WITHOUT touching
     *  it; returns the new dense version handle. O(log n), 0 B/op. Unknown fromVersion, non-finite
     *  value, a gcd-kind negative/non-integer, out-of-range index, or a full version arena throws. */
    update(fromVersion: number, i: number, value: number): number;
    /** Discard every version, rewind the arena, and re-seed a fresh identity version 0 (keeps
     *  capacity; any prior handle >= 1 is invalid). O(n). */
    clear(): this;

    /** O(n) seed of version 0 from an array-like (a snapshot, NOT n updates). Non-array-like, any
     *  non-finite entry, or (gcd) a negative/non-integer entry throws before the tree is usable. */
    static build(values: ArrayLike<number>, versionCapacity: number, kind: 'min' | 'max' | 'sum' | 'gcd'): PersistentSegTree;
}

/**
 * A STATIC, IMMUTABLE merge sort tree for offline range-rank: `countLE(lo, hi, x)` counts stored
 * values <= x in the INDEX range [lo, hi], and `rangeCount(lo, hi, vlo, vhi)` counts a VALUE-window,
 * both worst-case O(log^2 n) and zero-allocation. Build-once (source COPIED in, NO mutators); build
 * and space are O(n log n), a disclosed co-headline. PLAIN O(log^2 n) (no fractional cascading).
 */
export class MergeSortTree {
    /** Build the immutable tree from a COPY of `values` (finite numbers, any order). O(n log n).
     *  Non-array-like, a length outside [1, 2^31-1], a cell product over 2^31-1, or any non-finite
     *  entry throws before the tree is usable. */
    constructor(values: ArrayLike<number>);

    /** Element count (the source length). */
    readonly length: number;
    /** Element count -- the family-spine alias of `length`. */
    readonly size: number;
    /** The flat run-table cell count ((ceil(log2 n) + 1) * n) -- the disclosed O(n log n) space. */
    readonly cells: number;

    /** Count of stored values <= x within the INDEX range [lo, hi] INCLUSIVE. Worst-case O(log^2 n),
     *  0 B/op. Non-integer / out-of-range lo or hi, lo > hi, or a NaN x throws (+-Infinity is legal). */
    countLE(lo: number, hi: number, x: number): number;
    /** Count of stored values in the VALUE-window [vlo, vhi] INCLUSIVE within the INDEX range
     *  [lo, hi] INCLUSIVE. Worst-case O(log^2 n), 0 B/op. Bad indices, NaN bounds, or vlo > vhi throws. */
    rangeCount(lo: number, hi: number, vlo: number, vhi: number): number;

    /** Build the immutable tree from a COPY of `values` (the idiomatic factory; = new MergeSortTree).
     *  O(n log n). Same fail-closed doors as the constructor. */
    static build(values: ArrayLike<number>): MergeSortTree;
}

/**
 * A STATIC, IMMUTABLE WAVELET MATRIX for offline access / rank / select / quantile / rangeCount over a
 * fixed sequence of finite numbers. Coordinate-compresses arbitrary finite numbers to distinct ranks at
 * build (the MergeSortTree input contract) and stores level-wise flat bitvectors plus a per-level
 * zero-count and a succinct O(1)-rank block index. `quantile(lo, hi, k)` is the k-th-smallest-in-range
 * order statistic MergeSortTree deferred, and `rangeCount` runs in O(log n) (improving MergeSortTree's
 * O(log^2 n)). Build-once (source COPIED in, NO mutators); build is O(n log sigma), space
 * (n*ceil(log2 distinct) bits + rank index + remap table) a disclosed co-headline.
 */
export class WaveletTree {
    /** Build the immutable wavelet matrix from a COPY of `values` (finite numbers, any order).
     *  O(n log sigma). Non-array-like, a length outside [1, 2^31-1], a word product over 2^31-1, or any
     *  non-finite entry (Symbol / BigInt / NaN / +-Infinity) throws before the structure is usable. */
    constructor(values: ArrayLike<number>);

    /** Element count (the source length). */
    readonly length: number;
    /** Element count -- the family-spine alias of `length`. */
    readonly size: number;
    /** Level count `ceil(log2 distinct)` (>= 1) -- the descent depth of every query. */
    readonly levels: number;
    /** Distinct value count (sigma) -- the compressed alphabet size. */
    readonly distinct: number;
    /** Total bitvector bit count (`n * levels`) -- the disclosed O(n log sigma) space co-headline. */
    readonly bits: number;

    /** The value stored at index `i`. Worst-case O(log sigma), 0 B/op. A non-integer / out-of-range i throws. */
    access(i: number): number;
    /** Occurrences of `value` in the prefix `[0, i)`. Worst-case O(log sigma), 0 B/op. A non-numeric
     *  value or a non-integer i outside [0, length] throws. A value not present returns 0. */
    rank(value: number, i: number): number;
    /** Index of the k-th (0-based) occurrence of `value`, or `undefined` if `value` is absent or has
     *  fewer than k+1 occurrences (a consistent read, NOT a throw). Worst-case O(log sigma . log n),
     *  0 B/op. A non-numeric / NaN value or a negative / non-integer k throws. */
    select(value: number, k: number): number | undefined;
    /** The k-th smallest value (0-based) in the INDEX range [lo, hi] INCLUSIVE. Worst-case O(log sigma),
     *  0 B/op. Non-integer / out-of-range lo or hi, lo > hi, or k outside [0, hi - lo] throws. */
    quantile(lo: number, hi: number, k: number): number;
    /** Count of stored values in the VALUE-window [vlo, vhi] INCLUSIVE within the INDEX range [lo, hi]
     *  INCLUSIVE. Worst-case O(log sigma), 0 B/op. Bad indices, NaN bounds, or vlo > vhi throws. */
    rangeCount(lo: number, hi: number, vlo: number, vhi: number): number;

    /** Build the immutable wavelet matrix from a COPY of `values` (the idiomatic factory;
     *  = new WaveletTree). O(n log sigma). Same fail-closed doors as the constructor. */
    static build(values: ArrayLike<number>): WaveletTree;
}

/**
 * A STATIC, IMMUTABLE range-MINIMUM tree: a heap-ordered Cartesian tree over a fixed sequence of finite
 * numbers, built in O(n) by a monotonic-stack pass, whose lowest common ancestor is the range minimum
 * (RMQ = LCA). `rangeMinIndex(lo, hi)` / `rangeMin(lo, hi)` answer the extreme's index / value over an
 * INDEX range in worst-case O(log n) via a binary-lifting LCA climb, and it MATERIALIZES a walkable
 * `parent` / `left` / `right` / `depth` / `root` topology. `kind` (`'min'` | `'max'`) is frozen at
 * build; the Treap is the randomized Cartesian tree, this the deterministic value-keyed one. Build-once
 * (source COPIED in, NO mutators); O(n) tree build + O(n log n) lift table and space a disclosed
 * co-headline. It intentionally overlaps lite-o1's SparseTable in space while paying an O(log n) (not
 * O(1)) query, bought for the walkable tree + the RMQ = LCA bridge.
 */
export class CartesianTree {
    /** Build the immutable Cartesian tree from a COPY of `values` (finite numbers, any order). O(n) tree
     *  + O(n log n) lift. Non-array-like, a length outside [1, 2^31-1], a bad `kind`, an n*L lift-cell
     *  product over 2^31-1, or any non-finite entry (Symbol / BigInt / NaN / +-Infinity) throws before
     *  the structure is usable.
     *  @param values finite numbers (any order), indexed 0..length-1
     *  @param kind which extreme the range queries report (frozen at build); default `'min'` */
    constructor(values: ArrayLike<number>, kind?: 'min' | 'max');

    /** The root node index (the extreme's position over the whole array). */
    readonly root: number;
    /** Element count (the source length). */
    readonly length: number;
    /** Element count -- the family-spine alias of `length`. */
    readonly size: number;
    /** Which extreme the range queries report: `'min'` or `'max'` (frozen at construction). */
    readonly kind: 'min' | 'max';

    /** The INDEX of the extreme value (minimum for a `min` tree, maximum for `max`; the FIRST occurrence
     *  on a tie) in the INDEX range [lo, hi] INCLUSIVE -- a binary-lifting LCA climb. Worst-case O(log n),
     *  0 B/op. `lo` / `hi` non-integer or outside `0 <= lo <= hi < length` throws. */
    rangeMinIndex(lo: number, hi: number): number;
    /** The extreme VALUE in the INDEX range [lo, hi] INCLUSIVE -- equal to at(rangeMinIndex(lo, hi)).
     *  Worst-case O(log n), 0 B/op. Same fail-closed doors as `rangeMinIndex`. */
    rangeMin(lo: number, hi: number): number;
    /** The source value at index `i`. O(1), 0 B/op. A non-integer / out-of-range i throws. */
    at(i: number): number;
    /** The parent node index of `i`, or `-1` if `i` is the root. O(1), 0 B/op. A bad index throws. */
    parent(i: number): number;
    /** The left child index of `i`, or `-1` if none. O(1), 0 B/op. A bad index throws. */
    left(i: number): number;
    /** The right child index of `i`, or `-1` if none. O(1), 0 B/op. A bad index throws. */
    right(i: number): number;
    /** The depth of node `i` (root = 0). O(1), 0 B/op. A bad index throws. */
    depth(i: number): number;

    /** Build the immutable Cartesian tree from a COPY of `values` (the idiomatic factory;
     *  = new CartesianTree). O(n) tree + O(n log n) lift. Same fail-closed doors as the constructor. */
    static build(values: ArrayLike<number>, kind?: 'min' | 'max'): CartesianTree;
}
