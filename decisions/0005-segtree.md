# 0005 -- SegmentTree scope, fold injection, and the commutativity risk (D-05)

- Status: ACCEPTED
- Severity: S2 (governs the SegmentTree member surface + a family-wide layout rule)
- Date: 2026-09-17
- Session: SegmentTree (v0.3.0)

## Context

The third member, SegmentTree, is the complement to Fenwick: Fenwick's `rangeSum`
works only because subtraction inverts addition, so it is a SUM machine;
SegmentTree stores a fold of each subtree at its internal node and so can answer a
range query for any associative operation -- including the NON-invertible folds
(min / max / gcd) Fenwick cannot. Three calls had to be settled before code:

1. **Scope.** A full segment tree can also do LAZY PROPAGATION (range updates in
   O(log n)) and can take a caller-supplied fold. How much ships in v0.3.0?
2. **Fold injection.** The fold must be selectable (min / max / sum / gcd) yet the
   hot body must stay zero-alloc and monomorphic. A function ref per instance is
   the obvious design -- but is it the right one under the hot-path law?
3. **Layout correctness.** The zero-alloc, no-recursion hot path uses the iterative
   `2n` array layout (leaves at `n .. 2n-1`). What exactly makes it correct, and
   what must a future member NOT do with it?

## Decision

**1. Scope: point-update + range-query ONLY for v0.3.0.** No lazy propagation, no
range updates, no caller-supplied fold. The member ships `query(lo, hi)` (inclusive
both ends, matching `Fenwick.rangeSum`), `update(i, value)` (absolute leaf set +
ancestor fix), `at`, `clear`, `forEach`, and a static O(n) `build`. Lazy
propagation is a genuinely different structure (a second parallel `lazy` array, a
push-down on every descent) and is DEFERRED -- it can land as a later member or a
v-minor without disturbing this one. Ship the smallest honest thing.

**2. Fold injection: a ctor-cached small-int `_k` combined by an INLINE switch --
NOT a function ref.** The four folds are frozen: `_k` in `{0: min, 1: max, 2: sum,
3: gcd}`, chosen once in the constructor. The hot body (`query`, `update`, `build`)
combines two cells with an inline `k === 0 ? ... : k === 1 ? ... : k === 2 ? a + b :
segGcd(a, b)` chain. Rationale (hot-path law): a per-instance fold FUNCTION would
be a call site that goes megamorphic across a program that mixes fold kinds, and it
foils inlining; the ctor-cached int keeps ONE monomorphic hot body with a branch
the predictor pins per call (k is constant for the life of the instance).
`segGcd` is a plain module function (the arithmetic of the gcd fold, not the fold
DISPATCH) -- monomorphic, allocation-free.

The gcd fold constrains its DOMAIN: values must be nonnegative integers-in-doubles
(the value door rejects negatives + non-integers for the `gcd` kind, in addition to
the universal NaN / +-Infinity rejection). The identity is 0 (`gcd(0, x) === x`).

**Identity trap (recorded so it is not re-broken):** the fold identity fills query
accumulators and cleared / fresh leaves -- `sum -> 0`, `min -> +Infinity`,
`max -> -Infinity`, `gcd -> 0`. Identity is a legal RESULT (a cleared min tree
queries to +Infinity) but NEVER a legal INPUT. The value door still rejects user
`NaN` / `+-Infinity`, typeof-guarded BEFORE coercion, so a min tree can hold
+Infinity as its identity while refusing +Infinity from the caller.

**3. Layout: the iterative `2n` layout is ORDER-AGNOSTIC, and that is a RISK to
honor.** `query` walks the two boundaries up the tree and folds each in-range node
into a SINGLE accumulator, mixing left-boundary and right-boundary contributions in
whatever order the ascent produces. This is correct ONLY because min / max / sum /
gcd are all COMMUTATIVE as well as associative. A future NON-commutative fold
(matrix product, string concatenation, any non-abelian monoid) must NOT reuse this
layout: it belongs on a pow2 layout with SEPARATE left / right accumulators combined
in index order at the end. This member's admission of the `2n` layout does not admit
non-commutative folds -- those are routed to a different layout or a different
member.

`SEGTREE_MAX = 2^30 - 1` -- HALF of BinaryHeap's / Fenwick's `2^31 - 1` ceiling --
because the backing array is `2n` wide and the largest index the walks compute
(`2n - 1`, and the child index `p << 1`) must stay a POSITIVE int32. The index
arithmetic, not the byte count, is the hard ceiling.

## Consequences

- `LogN.js` gains `SEGTREE_MAX`, the module-level `segGcd`, and the `SegmentTree`
  class, appended after Fenwick; BinaryHeap and Fenwick stay byte-identical.
- The witness inherits the D-08 rule (decisions/0004): shared R^2 floor 0.958, OWN
  per-op slope bands (`update` median 3.83 -> `[2.29, 5.35]`, `query` median 7.17
  -> `[4.30, 10.04]`, N=15 fit runs). The gated sweep is EXACT powers of two in
  `[2^10, 2^16]` -- a segment-tree op's cells span the `2n` array, so above ~2^16
  the tree leaves the steady cache band, and exact powers keep the range
  decomposition a regular node count. The STRUCTURE still accepts any length; only
  the witness sweep is pow2.
- Lazy propagation / range updates and a caller-supplied fold remain OPEN for a
  later session; neither can be retrofitted into the frozen v0.3.0 surface silently
  (a range update is a new method; a custom fold is a new constructor path).

## Alternatives rejected

- **Ship lazy propagation now.** Rejected: it doubles the state (a `lazy` array +
  push-down) and the hot path (every descent pays a push-down even for point ops),
  for a feature the point-update member does not need. Smallest honest thing first.
- **A per-instance fold function.** Rejected under the hot-path law: a stored
  function is a call site that goes megamorphic across mixed-kind programs and
  foils inlining. The ctor-cached int keeps one monomorphic hot body.
- **A caller-supplied arbitrary fold.** Rejected for v0.3.0: an arbitrary fold
  cannot be proven commutative, and the `2n` layout is only correct for commutative
  folds. Admitting one would silently break the layout's correctness contract.
- **Reuse the `2n` layout for a future non-commutative fold.** Explicitly rejected
  as a standing rule: non-commutative folds are routed to a pow2 layout with
  ordered accumulators, never this one.
