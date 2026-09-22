# 0016 -- SortedArray: the read-optimized ordered map over parallel sorted arrays (D-SA1..D-SA6)

- Status: ACCEPTED
- Severity: S1 (the family's FIFTH ordered map and its FIRST contiguous-storage member; picks the
  parallel sorted Float64Array layout, the plain O(n) in-place `copyWithin` shift, the unique-key
  map contract, the O(1) order-statistic differentiator, the get witness lane on the DEFAULT
  log2(n) axis with the O(n) insert disclosed, and ships keyAt / valueAt alongside select)
- Date: 2026-09-22
- Session: SortedArray (v0.14.0)

## Context

SortedArray is the fourteenth member. It is the READ-OPTIMIZED ordered map: where SkipList / Treap /
Scapegoat / SplayTree buy O(log n) writes with pointer-chasing, SortedArray buys the fastest reads +
ordered iteration + O(1) order statistics with O(n) writes. It is literally the sorted-array FOIL the
earlier ordered members were measured against (the O(n)-insert baseline the witness foils use), now a
first-class member under the family's honesty contract. Its gated hot op `get` is a deterministic
worst-case O(log n) binary search -- the exact analogue of Scapegoat.get -- so it fits the DEFAULT
log2(n) witness axis (a single log, not the squared-log Fenwick2D / SegmentTree2D introduced).

## Decision

**D-SA1 layout = TWO parallel SORTED `Float64Array` columns (`_key` ascending + `_value`), a shared
lower-bound search, `SA_MAX_CAPACITY = 0x7FFFFFFF`.** Keys live packed ascending in `_key[0, size)`;
`_value[i]` is the value parallel to `_key[i]`. Fields: `_cap` (fixed capacity), `_key`, `_value`,
`_size` (live count), `_version` (iterator stamp). Slots `[size, capacity)` are stale scratch, never
read. The whole read surface reuses ONE private branch-free lower-bound (`_lb(x)` = count of keys
`< x`, in `[0, size]`): it NEVER early-exits on equality (the loop always narrows to the lower bound;
callers do one equality check on the result), so get / has / rank / successor / predecessor / the
set-probe are the same hot search. `SA_MAX_CAPACITY = 2^31-1` is the ceiling so `size` / `capacity`,
the `copyWithin` offsets, and the overflow-safe midpoint (`lo + ((hi - lo) >>> 1)`) all stay valid
array indices -- the index arithmetic (not the byte count) is the hard cap. `SortedArray.build(keys,
values)` is O(n log n) (sort once by key, load into a fresh map sized to the count), a COLD path whose
throwaway `pairs` scratch is never a hot allocation; it fails closed BEFORE the map is usable on a
non-array-like, length mismatch, count outside [1, 2^31-1], any non-finite key / value, or a DUPLICATE
key.

**D-SA2 writes = a PLAIN O(n) in-place `copyWithin` shift, NOT static / deferred / batched.**
SortedArray is a DYNAMIC member (accepts interleaved set / delete), not a build-once immutable. A
genuine `set` insert shifts the tail `[i, n)` up one slot (`K.copyWithin(i+1, i, n)` +
`V.copyWithin(i+1, i, n)`), `delete` shifts `[i+1, n)` down one -- in the preallocated backing store,
no temp, no spread, so the O(n) write is still 0 B/op. No gap-buffer, no deferred-compaction, no
tombstones: those trade write speed for read speed or space, and the whole point of this member is the
FASTEST reads. Fixed capacity: `set` overflow throws `[lite-logn]` as a no-op, never a silent grow +
amortized resize (a resize would break the worst-case bound the witness proves). `set` on a PRESENT
key UPDATES the value in place (O(log n), no shift).

**D-SA3 a UNIQUE-key key -> value MAP (not a multiset, no changeKey).** Keys are unique; `build`
rejects a duplicate key, and `set` on an existing key updates rather than inserts. Keys AND values are
finite numbers; the typeof-guard fires FIRST (before any coercion) at the door of every mutating op,
so Symbol / BigInt / NaN / +-Infinity fail closed (null is not zero). It is an ordered MAP, not an
addressable heap: deliberately NO `changeKey` (that is BinaryHeap's reverse-map surface), NO `split` /
`merge` (that is Treap's), and NO duplicate / multiset semantics.

**D-SA4 O(1) order statistics -- the differentiator; `keyAt` / `valueAt` SHIP alongside `select`.**
`select(k)` / `keyAt(k)` return the k-th smallest KEY as a raw array index (O(1), no augmentation --
unlike Treap / Scapegoat which carry a subtree-size column to reach O(log n) select); `valueAt(k)`
returns the parallel VALUE at that order-statistic index; `min` / `max` are the two ends (index 0 /
size-1). `keyAt` is `select`'s named twin (a sorted array indexes by position naturally), and
`valueAt` is shipped because the parallel value column makes it O(1) and free -- a genuine capability
the pointer-based maps cannot offer at O(1). An out-of-range in-type `k` returns `undefined` (the soft
miss of `get`); a non-integer `k` throws.

**D-SA5 the gated witness op is `get`, WORST-CASE O(log n) on the DEFAULT log2(n) axis; the O(n)
insert is DISCLOSED, never gated.** `get` is a deterministic binary search (no RNG, no amortization),
so it is a clean worst-case log line on the default axis -- the "worst-case O(log n) reads, O(n)
writes disclosed" pattern. The O(n) `set` insert is printed as a MAX-single-op disclosure bar
(the SkipList.insert / SplayTree.get precedent), NEVER a gated line. The O(n) linear-scan foil (a naive
scan for a key over a plain Float64Array) is exponential on the log2(n) axis and must miss the floor.

**D-SA6 rangeIter is VERSION-STAMPED; forEach is not.** `rangeIter(lo, hi)` is O(log n + k) (a
lower-bound seek then a contiguous walk); it captures `_version` and throws `[lite-logn]` on any
structural mutation mid-iteration rather than yield stale data (bounds may be +-Infinity; NaN or
`lo > hi` fails closed). `forEach` is a plain contiguous scan (the fastest in the family), NOT
version-stamped -- mutating from within the callback is the caller's responsibility, matching the
other members.

## Witness

WORST-CASE member on the read path (a binary search has no randomization / amortization), so the get
lane is a clean deterministic log line; the only disclosure is the O(n) insert MAX-single-op bar (the
SkipList precedent), never gated. One gated lane on the DEFAULT `log2(n)` axis, shared R^2 floor 0.958
(D-02), own band = median-of-15 fit-runs * [0.6, 1.4] on the calibration machine.

**Convergence approach used for the get lane: WIDEN-THE-SPAN + RAISE-ITERATIONS, PLUS a median-of-7
fit scoped to THIS lane.** A contiguous binary search is the family's FASTEST get (~1 ns/level, a ~6 ns
fit span across the sweep), so per-point noise dominates a narrow / low sweep. The fix (chosen over
touching any shared threshold): (1) the WIDEST + HIGHEST n-sweep of any get lane -- EXACT powers of two
`2^12..2^18` (the 2^11 point is too fast + noisy and drops R^2 near the floor, the SplayTree.get
lesson; the top is pinned at 2^18 before the sorted column leaves the steady cache band and DRAM
latency curves the fit); (2) a 1e6-iteration min-over-batches measurement per point; (3) the median of
`SA_FIT_RUNS = 7` independent sweep-fits as measurement-quality INSURANCE (same `fitRuns` mechanism as
SegmentTree.update / PairingHeap / FibonacciHeap / Fenwick2D.update) -- because the witness runs right
after torture (2M+ ops across 14 members) leaves scheduler / thermal residue and this being the
fastest lane it is the most noise-sensitive under that load. Measurement-quality only: the frozen 0.958
R^2 floor and the slope band are UNTOUCHED, and a genuine O(n) shape fails every fit, so no teeth are
lost.

Calibration (this machine, 1e6-iter min-over-15-batches over 2^12..2^18): median-of-15 fit-run slope =
**0.984 ns/level** (15 samples: 0.918 0.921 0.930 0.930 0.953 0.963 0.979 0.984 1.001 1.024 1.030
1.042 1.047 1.085 1.137); single-fit R^2 min 0.9690, median 0.9919, 0/15 below the 0.958 floor.

- Band: **`SA_GET_SLOPE_LO = 0.59`, `SA_GET_SLOPE_HI = 1.38`** (median 0.984 * [0.6, 1.4]), centered
  on the MEDIAN (never a high sample) so a legitimately faster future run is not false-failed; the R^2
  floor independently rejects any non-log shape.
- Final gated run (this machine, in-suite after torture): `SortedArray.get` R^2 = **0.9802**, slope =
  **0.965 ns/level**, band `[0.59, 1.38]` -- **ON-LINE**. Foil (linear scan, O(n) per search) R^2 =
  **0.7789**, slope ~3500 ns/level -- **OFF-LINE** (misses the floor, good). MAX single insert observed
  ~14500 ns (O(n) tail shift -- disclosed, not gated).

## Consequences

- Prior 13 classes stay BYTE-IDENTICAL; LogN.js changes are the VERSION line + one appended class + the
  export.
- The default `log2(n)` witness axis gains a nineteenth gated op; the `xOf` hook default (`Math.log2`)
  is unchanged, so every prior lane's fit is byte-identical.
- The family now has an ordered map at every read/write tradeoff point: SortedArray (fastest reads +
  O(1) order statistics, O(n) writes) at one extreme, the pointer-based BSTs (O(log n) writes) at the
  other; the GUIDE routes reads-dominate -> SortedArray, writes-frequent -> SkipList / Treap /
  Scapegoat.
- The O(n) write is the accepted, disclosed tradeoff for the fastest reads + iteration + O(1) select.
