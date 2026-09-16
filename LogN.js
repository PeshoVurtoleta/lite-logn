/**
 * @zakkster/lite-logn -- a tree-shakeable, zero-GC family of O(log n) data
 * structures that doubles as a teachable textbook: each member solves a real
 * problem AND proves its logarithm is real (the O(log n) Witness -- see
 * test/witness.mjs).
 *
 * v0.1.0 is the SCAFFOLD release: it ships only the `VERSION` const. No member
 * exists yet -- BinaryHeap is the first member (a later session) and lands
 * append-only, leaving this header and the `VERSION` const the only prior lines
 * that ever change. Planned roster: BinaryHeap (array-embedded O(log n) push /
 * pop min-heap), Fenwick / BIT (O(log n) point-update AND prefix-sum via the
 * `i & -i` walk), SegmentTree (O(log n) associative range-query + point-update),
 * and SkipList (pointer-free expected-O(log n) ordered map). Members are
 * independent (no shared mutable module state), so a bundler that imports one
 * drops the others (`sideEffects: false`).
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
export const VERSION = '0.1.0';

// --- members land here, append-only, one tree-shakeable class each -----------
// BinaryHeap  (v0.1.0 session) -- array-embedded O(log n) min-heap
// Fenwick     (v0.2.0)         -- O(log n) point-update + prefix-sum
// SegmentTree (v0.3.0)         -- O(log n) associative range-query + point-update
// SkipList    (v0.4.0)         -- pointer-free expected-O(log n) ordered map
