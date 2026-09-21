# 0011 -- BinomialHeap: a mergeable priority queue over a shared arena (D-BH1..D-BH2)

- Status: ACCEPTED
- Severity: S1 (picks the family's first MERGEABLE member, its LEAN non-addressable
  surface, the SHARED-ARENA O(log n) meld with a consume-fails-closed contract, and
  the popMin witness band)
- Date: 2026-09-21
- Session: BinomialHeap (v0.9.0)

## Context

BinomialHeap is the ninth member -- the family's first MERGEABLE priority queue. Where
BinaryHeap (0002) and MinMaxHeap (0009) are single array-embedded heaps that cannot fuse
two queues without an O(n) rebuild, a binomial heap (Vuillemin 1978) is a FOREST of heap-
ordered binomial trees whose defining op is `meld` (union two heaps) in O(log n) worst-
case: a BINARY CARRY over the two order-sorted root lists, the exact structural analogue
of adding two binary numbers. push is O(1) amortized (O(log n) worst), popMin is O(log n)
worst (unlink the extreme root, reverse its child list into a new root list, union back,
rescan the O(log n) roots), and peekMin is O(1) via a cached extreme root. Two design
calls had to be settled before code: the surface (addressable or lean?) and the arena /
meld ownership model.

## Decision

**D-BH1 LEAN, NON-ADDRESSABLE (the MinMaxHeap idiom).** The surface is push / popMin /
peekMin / peekMinKey / meld ONLY. The id is an OPAQUE Uint32 payload in [0, 2^32) -- NOT a
unique handle, and there is NO reverse map -- so there is deliberately NO decreaseKey /
remove / changeKey / rank / select. This mirrors MinMaxHeap's opaque-id call (0009) and is
the honest asymmetry vs BinaryHeap's addressable `_pos` map: the textbook decreaseKey
binomial heap needs a per-id handle (a slot the caller holds and hands back), which is a
DIFFERENT data structure with a different zero-GC cost model. Admitting decreaseKey would
force either an object handle per node (GC) or a caller-visible slot column (a second
public contract). The mergeable member exists to teach `meld`, not addressable decrease-
key; the lean surface keeps the hot bodies to three loops (push carry-link, meld root-list
binary-carry, popMin child-reverse + remeld) over the shared columns. REJECTED: an
addressable variant with a handle column (defer to a future member if ever needed).

**D-BH2 SHARED-ARENA meld, CONSUME-FAILS-CLOSED (the Treap.split/merge idiom, hardened).**
A binomial meld REWIRES roots in place (no copy) for O(log n), so two heaps can meld ONLY
if they draw nodes from the SAME backing arena (pool + columns). Two ownership models were
considered:

  - a `meld(a, b)` that COPIES b's nodes into a's arena -- rejected: O(n) and it forces a
    per-node re-key, defeating the whole point of a mergeable heap; and
  - SHARED ARENAS (chosen): a standalone `new BinomialHeap(capacity, kind)` owns its own
    arena; `BinomialHeap.arena(capacity, kind, count)` hands out `count` EMPTY heaps that
    SHARE one pool + column set, so any two of them meld in true O(log n). This is exactly
    the Treap.split/merge precedent (0007): the returned heaps are VIEWS over one backing
    store (`_view`), cross-arena mixing is caught by COLUMN IDENTITY (`a._key !== b._key`,
    the Treap.merge check), and `a.meld(b)` CONSUMES b.

The arena factory is the SETTLED public API for the shared model: it makes the shared-
arena requirement explicit and discoverable, rather than leaving meld to fail obscurely on
two independently-constructed heaps. `capacity` is the arena-WIDE node budget shared across
all `count` heaps; a full arena fails closed on push.

The CONSUME contract is HARDENED past Treap's (the reviewer-flagged top risk). Treap.merge
leaves its consumed source with `_root = 0` (empty, silently reusable); BinomialHeap goes
further: `a.meld(b)` zeroes b's head/min/size AND sets a `_consumed` flag, so EVERY later
op on b (push / popMin / peekMin / peekMinKey / meld / clear / forEach / iterate) throws
`[lite-logn]`. Rationale: b's nodes have MOVED into a's root list; a silently-reused b
that still referenced them could re-enter the shared roots and corrupt a (a node in two
root lists -> a double-free or an infinite carry). Failing closed makes that class of bug
impossible regardless of any latent aliasing. meld ALSO throws on a non-BinomialHeap arg,
a self-meld (`other === this`), a kind mismatch (min vs max -- both operands must share the
ctor-frozen `_isMin` polarity), and a consumed operand. Conservation across meld is a hard
invariant, torture-tested every soak cycle: nodes MOVE between root lists but NEVER between
pools, so `activeSlots` is unchanged by the meld, `size` is the exact sum, and a full drain
returns every slot (`activeSlots + freeListLength === capacity` throughout).

The cached `_min` (extreme root) is maintained INLINE, never rescanned on push/peek: push
compares the new key against `_key[_min]`, meld picks the extreme of the two cached roots,
and the binary carry updates `_min` in O(1) whenever a key TIE demotes it to a child (the
carry's tie-break makes `a` win, so the tracked root could otherwise become a child and
break the "the extreme is always a root" invariant popMin relies on). popMin is the only op
that rescans the O(log n) roots -- it is O(log n) anyway.

## Witness (D-BH2)

Gated op = **popMin** (the mergeable heap's tallest honest walk -- unlink extreme root,
reverse children, union, rescan). Shared family R^2 floor REUSED: BINARYHEAP_R2_FLOOR =
0.958 (0004 / D-08). push / popMin / meld are all WORST-case O(log n) (push O(1)
amortized), so there is deliberately NO expected-op MAX-single-op disclosure line (unlike
SkipList / Treap).

Gated over EXACT powers 2^11..2^17 (the same pointer-chasing window Treap / Scapegoat /
SkipList.get use). A binomial popMin chases SCATTERED forest slots + reverses a child list
+ rescans the root list, so its cost is DRAM-latency-sensitive; the fully-cache-resident
exact-power window keeps the fit on the structural level count, while the [1e4..1e6] band
the array-embedded heaps (BinaryHeap / MinMaxHeap) use CURVES at 1e6 (the memory wall) and
drops many runs below the 0.958 floor (measured: R^2 as low as 0.881 on that band vs
0.979+ on the exact-power window). Foil = an O(n) linear min-scan-and-splice extract-min
over an unordered array (the MinMaxHeap foil): exponential on the log2(n) axis, so a
straight-line fit MISSES the floor (OFF-LINE -- good).

Band = median-of-15 fit-runs * [0.6, 1.4] on this machine (the D-08 / 0004 procedure). The
15 popMin slope samples (ns/level) over 2^11..2^17:

    44.41 44.32 44.88 44.38 44.33 44.25 44.99 45.13 44.51 44.72 44.99 44.82 44.99 45.35 45.09

with R^2 in [0.9786, 0.9840] (every run >= the 0.958 floor). MEDIAN slope = 44.821
ns/level. Band, centered on the MEDIAN (never a high sample, so a legitimately faster
future run is not false-failed; the R^2 floor independently rejects any non-log shape):

    BINOMIALHEAP_POPMIN_SLOPE_LO = 26.89   (44.821 * 0.6)
    BINOMIALHEAP_POPMIN_SLOPE_HI = 62.75   (44.821 * 1.4)

A binomial popMin does far more pointer-chasing per level than a plain array-embedded sift,
so its per-level slope (~44.8) sits WELL ABOVE BinaryHeap.pop's (~9.6) yet on the same
family shape -- expected, which is exactly why only the R^2 floor is shared family-wide and
each op declares its OWN band.

## Consequences

- The ninth member ships push / popMin / peekMin / peekMinKey / meld (+ arena factory +
  clear / forEach / iterator) with zero allocation on every hot op.
- LogN.js grows by a VERSION bump + the BinomialHeap append only; the prior eight classes
  stay byte-identical (append-only discipline, D-03).
- meld's consume-fails-closed contract is proven by the QaAudit coercion block (a reused
  donor throws on every op) and by the torture conservation-across-meld soak.
- BINH_MAX_CAPACITY = 2^31 - 1 (named distinctly from BinaryHeap's identically-valued
  BH_MAX_CAPACITY to avoid a module-scope redeclaration; "the arithmetic caps it" -- Uint32
  slot indices + NIL = 0 + Uint32 orders).
