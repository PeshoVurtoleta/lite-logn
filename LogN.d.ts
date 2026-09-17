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
