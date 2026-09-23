# 0019 -- WaveletTree: a static, immutable wavelet matrix for range order statistics (D-WT1..D-WT6)

- Status: ACCEPTED
- Severity: S1 (the family's FIRST post-1.0 exotic and its FIRST range ORDER-STATISTIC structure -- the
  query MergeSortTree deferred; picks a wavelet MATRIX over a per-node wavelet tree, coordinate
  compression of arbitrary finite numbers, a succinct O(1)-rank bitvector as the load-bearing idiom, the
  full access/rank/select/quantile/rangeCount surface, an O(n log sigma) BUILD + `n * levels` bits + a
  ~1.25x rank index disclosed co-headline, and the quantile witness lane on the DEFAULT single-log
  log2(n) axis)
- Date: 2026-09-23
- Session: WaveletTree (v1.1.0)

## Context

WaveletTree is the seventeenth member and the FIRST post-1.0 exotic. It is a STATIC, IMMUTABLE wavelet
matrix: over a fixed, coordinate-compressed sequence it answers `access(i)` (the value at an index),
`rank(value, i)` (occurrences of a value in a prefix), `select(value, k)` (the index of the k-th
occurrence), `quantile(lo, hi, k)` (the k-th smallest VALUE in an INDEX range -- the range ORDER
STATISTIC) and `rangeCount(lo, hi, vlo, vhi)` (count of values in a value-window within an index range),
all worst-case O(log sigma) (sigma = distinct value count) and zero-allocation -- except `select`, whose
upward inverse navigation is O(log sigma . log n). It is the family's THIRD static member (after
SortedArray and MergeSortTree) and, like MergeSortTree, truly immutable: the source is compressed and
COPIED in at construction and there are NO mutators. This is the SparseTable / MergeSortTree / lite-o1
static-member honesty contract (see the lite-o1 static-members-admitted call): the query is worst-case
O(1)-per-level zero-alloc, but the O(n log sigma) BUILD and `n * levels`-bit SPACE (plus the rank index
and the distinct remap table) are a DISCLOSED co-headline, never hidden. There is no max-single-op line
(a build-once immutable matrix has no randomization and no amortization).

The MergeSortTree ADR (decisions/0018, D-MST3) explicitly DEFERRED the kth-smallest-in-range order
statistic to "a future WaveletTree" because a plain merge-sort-tree layout cannot answer it in one pass.
This member is that WaveletTree, and it delivers the order statistic as its headline query.

## Decision

**D-WT1 static build-once + IMMUTABLE, NOT a mutable timeline.** `new WaveletTree(values)` (or the
`WaveletTree.build(values)` factory) coordinate-compresses a snapshot of `values` and COPIES it into
internal typed arrays; mutating the caller's array afterward never changes a result. There are NO mutators
(no set / update / insert / delete / clear) -- the matrix is frozen at construction, so every query is a
read-only bitvector descent. This mirrors MergeSortTree (D-MST1): the offline power depends on knowing all
values up front; the mutable ordered-map role is already covered by SortedArray / the balanced BSTs.

**D-WT2 (THE MATRIX, NOT A TREE) layout = level-wise FLAT bitvectors, NOT a per-node wavelet tree.** The
structure is a WAVELET MATRIX (Claude / Navarro): ONE concatenated n-bit bitvector per level
(`ceil(log2 sigma)` levels, MSB first), each stored in a flat `Uint32Array` word region addressed
`level * wordsPerLevel + w`, plus a per-level zero count `Z[l]`. This is chosen over the classic per-node
wavelet TREE (a binary tree of sub-bitvectors) because the matrix keeps the whole structure in a handful
of flat typed arrays -- no per-node objects, no child pointers, contiguous and cache-friendly -- which is
what makes every query 0 B/op and the space a clean `n * levels` bits. Construction is bottom-of-the-loop
simple: for each level set the tested bit into the bitvector, count zeros, then STABLE-partition the codes
(bit-0 elements first, bit-1 after, order-preserving) into the next level's working array -- O(n) per
level, O(n log sigma) total, one scratch `Int32Array` reused by pointer swap (no per-level allocation).

**D-WT3 (THE LOAD-BEARING IDIOM) a succinct BITVECTOR with O(1) rank.** `_rank1(level, pos)` -- "ones in
`[0, pos)` of this level" -- is the ONLY hot primitive. It is O(1): a precomputed cumulative BLOCK
popcount index (`_blk`, one running count per WT_BLOCK_WORDS = 4-word / 128-bit block) gives the count up
to the block, then at most three whole-word broadword popcounts (`wtPopcount32`, `>>>`-clean so bit 31
counts) plus one partial-word popcount finish it. access / rank / quantile / rangeCount are branchless
level-descents built purely on `_rank1` and `rank0(l, p) = p - _rank1(l, p)` -- no doors, no throws, no
allocation INSIDE the descent (all validation is at the method entry, on the cold path). The block size 4
words puts the rank-index overhead at ~0.25x the bitvector bytes, so the total bit structure is ~1.25x --
the disclosed rank-index sizing.

**D-WT4 coordinate-compress arbitrary FINITE numbers; quantile returns the ACTUAL value.** The source may
be any finite numbers (floats, negatives, duplicates). At build they are sorted-and-deduped into a
`_remap` Float64Array of the distinct values (ascending); each source value maps to its CODE = its index
in `_remap`, and the matrix is built over the dense code alphabet `[0, sigma)`. `access` / `quantile`
un-map the descended code back through `_remap` so they return the ACTUAL stored value, never an internal
rank. `levels = ceil(log2 sigma)` (an exact float loop, never `1 << k` which wraps at k >= 31, never
`Math.log2` which can mis-round a power of two), forced to >= 1 so the layout is uniform even for a single
distinct value (sigma = 1). rangeCount maps its value window `[vlo, vhi]` to a half-open CODE range via a
lower-bound / upper-bound binary search over `_remap`, so arbitrary real-valued windows are exact.

**D-WT5 the FULL surface, with `select` as the one NON-symmetric descent.** access / rank / quantile /
rangeCount are symmetric top-down descents over `_rank1` (each O(log sigma), 0 B/op). `select(value, k)`
is the exception the plan flagged: it computes the code's block START at the bottom level (a rank descent
from 0), then CLIMBS back UP inverting each level's transform with binary-search select0 / select1
primitives (position of the j-th 0 / 1, found by binary searching `_rank1` -- O(log n) each). So select is
O(log sigma . log n), still zero-allocation (only local scalars; no per-call scratch). Its correctness is
proven by a dedicated oracle: for every distinct value and every occurrence, `select(v, k)` equals the
brute-force occurrence list AND round-trips `rank(v, select(v, k)) === k` and `access(select(v, k)) === v`.
rangeCount = `countLT(vhi_upper) - countLT(vlo)` over the code range, each an O(log sigma) branch walk that
adds the whole 0-branch whenever the threshold's bit is 1.

**D-WT6 fail closed on every unverified state; witness = `quantile` on the SINGLE-log log2(n) axis,
WORST-CASE, NO max-single-op line.** The source must be an array-like of FINITE numbers (typeof-guarded
FIRST -- Symbol / BigInt / NaN / +-Infinity each throw `[lite-logn]`; null is not zero), the length an
integer in `[1, WT_MAX_LENGTH]` (`0x7FFFFFFF`), and the `levels * ceil(n / 32)` word count a PRODUCT
guarded by a FLOAT multiply against `WT_MAX_CELLS` (`0x7FFFFFFF`) -- never `| 0`, which would wrap a large
product and fail OPEN (the MST_MAX_CELLS / PST_MAX_NODES lesson). Query bounds are integers with
`0 <= lo <= hi < n`; a prefix `i` is in `[0, n]`; a select `k` is a non-negative integer; a quantile `k`
is in `[0, hi - lo]`; value / bound args are numbers (NaN throws, +-Infinity legal). A `value` not present
yields rank 0 / select `undefined` (a consistent read, per the MergeSortTree "value not present" clause),
never a throw; bad indices / ranges / types throw via cold-path builders off the hot body. The gated
witness op is `quantile`: unlike MergeSortTree's countLE (O(log n) canonical nodes x O(log n) per-node
binary search = O(log^2 n) on the SQUARED-log axis), a quantile is a SINGLE descent of the levels with an
O(1) `_rank1` per step, so it is O(log sigma) = O(log n) and fits the DEFAULT log2(n) axis (a single log).
Shared R^2 floor 0.958 (D-08 / decisions/0004), FROZEN. WaveletTree's OWN slope band = median-of-fit-runs
* [0.6, 1.4], centered on the MEDIAN (15.248 ns/level on this machine -> band [9.15, 21.35]); the lane
opts into the median-of-fits hook (like MergeSortTree / PST) for post-torture thermal robustness. The
O(n log n) LINEAR-KTH foil (copy the index window, sort it, index the k-th) is EXPONENTIAL on the log2(n)
axis and MUST miss the floor. There is DELIBERATELY NO max-single-op disclosure line: a static immutable
member has no randomized tail and no amortized spike (the MergeSortTree / SortedArray-read precedent).

## Consequences

- The family gains the range ORDER STATISTIC (k-th smallest in an index range) MergeSortTree deferred, and
  its FIRST succinct rank/select structure -- a clean teaching contrast with the sorted-run merge-sort
  tree (rank-only, squared-log) vs the wavelet matrix (order statistic + rank/select, single-log).
- Queries are 0 B/op: access / rank / quantile / rangeCount are read-only descents over the flat
  bitvectors; select's upward climb uses only local scalars (no per-call scratch). Proven by
  `node --expose-gc test/torture.mjs` (a per-cycle build/discard tracker lane + hot query churn lanes on
  an immutable matrix held OUTSIDE the loop + an arrayBuffer soak with a select/rank inverse check).
- The O(n log sigma) BUILD and `n * levels` bits + ~1.25x rank index + `_remap` table SPACE are a
  DISCLOSED co-headline in llms / README / GUIDE, never hidden behind the fast query.
- Space is fixed at construction (fail-closed float-product word guard); there is no grow path, so the
  backing stores are never reallocated.

## Alternatives rejected

- **A per-node wavelet TREE (sub-bitvectors per node).** Rejected (D-WT2): per-node objects / pointers
  defeat the 0-B/op query, inflate space, and are harder to keep cache-friendly. The wavelet MATRIX keeps
  everything in a handful of flat typed arrays.
- **A per-word cumulative rank index (O(1) rank, 2x space).** Rejected (D-WT3): storing a cumulative
  popcount per 32-bit word doubles the bit structure. The 128-bit block index keeps rank O(1) (<=3 extra
  word popcounts) at ~1.25x total -- the disclosed sizing.
- **Skipping coordinate compression (index the raw value bits).** Rejected (D-WT4): raw floats have a
  53-bit-plus alphabet, blowing the level count and space; and the member would not accept arbitrary
  negatives / non-integers cleanly. Compression to `[0, sigma)` bounds levels at `ceil(log2 sigma)` and
  lets quantile return the actual value via `_remap`.
- **A per-call scratch array for select's climb.** Rejected (D-WT5): the upward climb inverts each level
  with binary-search select0 / select1 from the bottom position, needing only local scalars, so select
  stays 0 B/op without a preallocated stack.
- **Gating quantile on the squared-log axis (like MergeSortTree).** Rejected (D-WT6): a quantile is a
  single descent with O(1) `_rank1` per level, so it is a genuine single log -- gating it on `(log2 n)^2`
  would understate its shape. It fits the DEFAULT log2(n) axis.
- **A `| 0` word-budget guard.** Rejected (D-WT6): it fails OPEN on overflow. The FLOAT product fails
  CLOSED.
