# 0009 -- MinMaxHeap: a double-ended priority queue in one array-embedded min-max heap (D-M1..D-M5)

- Status: ACCEPTED
- Severity: S1 (picks the family's DEPQ member + its id/key payload contract, the
  non-addressable asymmetry vs BinaryHeap, the level-parity mechanism, and the
  interval-heap deferral)
- Date: 2026-09-20
- Session: MinMaxHeap (v0.7.0)

## Context

MinMaxHeap is the seventh member -- the family's DOUBLE-ENDED priority queue (DEPQ).
A plain binary heap (BinaryHeap, 0001) serves ONE frozen extreme; a min-max heap
serves BOTH ends from a SINGLE array-embedded heap whose levels ALTERNATE min / max
(Atkinson, Sack, Santoro & Strothotte, "Min-max heaps and generalized priority
queues", CACM 1986). Even depth (root = depth 0) is a MIN level, odd depth a MAX
level, so the global minimum is the root and the global maximum is the LARGER of the
root's up-to-two children. `peekMin` / `peekMax` are O(1); `push` / `popMin` /
`popMax` are O(log n) WORST-case. Two design calls had to be settled before code.

## Decision

**D-M1 PAYLOAD (id + key, NON-addressable).** Two parallel, pointer-free typed-array
columns in the BinaryHeap id+key idiom: `_id` Uint32Array + `_key` Float64Array. There
is NO `_pos` reverse map, and therefore NO `changeKey` / `remove`. The id is an OPAQUE
Uint32 payload, NOT a unique handle: duplicate ids are legal, and the id domain is the
FULL Uint32 range [0, 2^32) (a wider domain than BinaryHeap's [0, capacity), which only
that member's `_pos` map constrains). This is the documented asymmetry vs BinaryHeap: a
DEPQ's job is the two extremes, and an addressable reverse map is the separable concern
BinaryHeap already carries. Rejecting `_pos` keeps the member two columns, not three,
and keeps every hot op a pure heap walk. Keys are FINITE numbers only (Symbol / BigInt /
NaN / +-Infinity fail closed, typeof-guarded FIRST -- the key guard fires BEFORE the id
guard, then the full-heap guard; any throw leaves `size` unchanged). Empty peek / pop
returns `undefined` (never throws). Fixed capacity: overflow throws, never drops.

**D-M2 CLASSIC one-element-per-node ONLY.** This ships the classic min-max heap (one
element per node, alternating levels). The INTERVAL HEAP (a DEPQ that stores two
elements -- a low and a high -- per node, giving both extremes at the root pair) is a
deliberately DEFERRED alternative: it is a different structure with a different node
layout and a different sift, and one honest DEPQ is enough for the family. The
deferral is named here + in the NOT FOR section, never a silent omission.

## Level parity (the mechanism)

Slot i (0-based) is a MIN level iff `((31 - Math.clz32(i + 1)) & 1) === 0` -- the depth
`31 - Math.clz32(i + 1)` is even. Computed zero-alloc (one `Math.clz32`, one shift, one
mask). Children of i are `2i+1` / `2i+2`; grandchildren `4i+3 .. 4i+6`; the grandparent
of a node at index `hole >= 3` is `(hole - 3) >> 2`.

- push: append at the tail, compare the new element to its PARENT to decide the own-level
  vs other-level chain, then bubble by GRANDPARENT comparisons up the min-or-max chain.
- popMin / popMax: open a hole at the root (min) or at the max-of-{slot1, slot2} (max),
  move the last element into it, and trickle DOWN over CHILDREN + GRANDCHILDREN (min sinks
  toward the smallest of the up-to-six descendants, max toward the largest); a GRANDCHILD
  move does the extra parent re-check that keeps the alternating order. Every one of the
  FOUR grandchild indices is bound-checked against the live size -- the classic min-max
  off-by-one, verified explicitly at n = 1, 2, 3, 4 (popMax at n = 2 reads ONLY slot 1).
All sifts are HOLE-PUNCHING (one write per level, only local scalar temporaries), so every
hot op is 0 B/op after construction.

**D-M5 WITNESS.** `popMin` is the gated O(log n) witness op (the full-height level-aware
trickle-down -- the min-max heap's tallest honest walk, the exact analogue of
BinaryHeap's gated POP). MinMaxHeap is a DEPQ whose push / popMin / popMax are ALL
WORST-case O(log n), so -- unlike SkipList / Treap -- there is NO expected-op
MAX-single-op disclosure line. The band was calibrated by the shared ADR-0004 method
(median-of-15 fit-runs * [0.6, 1.4], MEDIAN-centered), inheriting the FROZEN family R^2
floor 0.958 (D-08, never widened). A min-max trickle-down compares against up to SIX
descendants per level (more work than a plain heap's two-child sift), so its per-level
slope (~10.30) sits a touch ABOVE BinaryHeap.pop's (~9.60), within the same family shape;
that is why only the R^2 floor is shared and each op declares its own band. The O(n) foil
is a linear MIN-SCAN-AND-SPLICE extract-min over an unordered array (the naive DEPQ before
the heap trick): O(n) per extraction, exponential on the log2(n) axis, so it MISSES the
floor (measured foil R^2 ~ 0.77).

The 15-run popMin calibration on this machine (gated sweep [1e4, 3e4, 1e5, 3e5, 1e6]):

    slopes (ns/level): 9.38 10.49 10.49 9.96 10.44 10.09 9.93 10.30 10.35 10.16
                       9.94 9.97 10.59 10.43 10.40
    R^2:               0.9978 0.9935 0.9897 0.9991 0.9983 0.9979 0.9989 0.9942
                       0.9958 0.9972 0.9986 0.9988 0.9948 0.9962 0.9953
    MEDIAN slope = 10.30 ns/level ; R^2 range 0.9897 .. 0.9991 (all >= 0.958 floor)
    band = median * [0.6, 1.4] = [6.18, 14.42]
    -> MINMAXHEAP_POPMIN_SLOPE_LO = 6.18, MINMAXHEAP_POPMIN_SLOPE_HI = 14.42

Centered on the MEDIAN (never a high sample) so a legitimately faster future run is not
false-failed; the R^2 floor independently rejects any non-log shape.

## Consequences

- `LogN.js` gains `MMH_MAX_CAPACITY` (`0x7FFFFFFF`) + the `MinMaxHeap` class, appended
  after Scapegoat; BinaryHeap / Fenwick / SegmentTree / SkipList / Treap / Scapegoat stay
  BYTE-IDENTICAL (only the `VERSION` const changes above the append point -- a two-hunk diff).
- The witness gains ONE gated op-row, `MinMaxHeap.popMin` (a full-height trickle-down),
  against the linear min-scan-and-splice O(n) foil. It inherits the FROZEN shared R^2 floor
  0.958 (D-08); the six prior members' bands are UNTOUCHED. No max-single-op line
  (worst-case member).
- The benchmark (repo-only) admits MinMaxHeap as the 7th SUBJECT: SUBJECTS 6 -> 7, OP_ROWS
  9 -> 10 (+ `MinMaxHeap.popMin`), the matrix 6x8=48 -> 7x8=56 cells, OP_CLASS gains
  `MinMaxHeap.push` / `.popMin` / `.popMax` (all WORST-case), and CLEAR_WITNESS 6 -> 7. The
  ordered D8 workload does NOT admit MinMaxHeap (a DEPQ is not an ordered map).

## Alternatives rejected

- **An addressable reverse map (`_pos`) + changeKey / remove.** Rejected for the DEPQ:
  BinaryHeap already carries addressability; a min-max heap's contract is the two extremes,
  and a third column + a uniqueness constraint on ids would forfeit the opaque-payload
  freedom (duplicate ids, full Uint32 domain) and add hot-path writes for a concern the
  family already serves. Named as the asymmetry, not hidden.
- **Two paired heaps (a min-heap + a max-heap with a correspondence map).** Rejected: a DEPQ
  from two heaps needs a cross-heap index to keep them consistent on every op -- more state,
  more writes, and a correspondence invariant to prove; the single alternating min-max heap
  is the zero-GC-cleanest DEPQ (one array, one walk per op).
- **The interval heap (two elements per node).** Deferred, not rejected (D-M2): a different
  layout + sift; one honest classic DEPQ is enough for the family, and the interval heap can
  land later as its own member if a use case demands the two-per-node packing.
- **A `kind` argument / getter (like BinaryHeap).** Rejected: a DEPQ has BOTH ends, so a
  `kind` getter would be a lie. The surface reports peekMin AND peekMax unconditionally.
