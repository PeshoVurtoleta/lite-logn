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
