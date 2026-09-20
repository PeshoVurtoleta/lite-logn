# 0007 -- Treap: randomized-expected balanced BST, augmentation, split/merge arena, recursion depth (D-06/D-07)

- Status: ACCEPTED
- Severity: S1 (picks the family's balanced-BST member + its augmentation contract;
  binds the shared NodePool a second time; sets how split/merge live under a pool)
- Date: 2026-09-20
- Session: Treap (v0.5.0)

## Context

Treap is the fifth member -- the family's balanced BST. Five calls had to be settled
before code:

1. **Which balanced BST?** A treap (randomized), a scapegoat (amortized-rebuild), a
   red-black / AVL (deterministic, pointer-heavy), or a splay (amortized)?
2. **Augmentation.** The roadmap wants order statistics (rank / select) and set
   surgery (split / merge). Ship them, or a plain ordered map?
3. **The allocator.** SkipList (D-06 / decisions/0006) shipped a private `NodePool`
   "shaped so a later pointer member (Treap) can reuse it." Reuse it, or fork?
4. **split / merge under a fixed-capacity pool.** These are O(log n) ONLY if they
   rewire nodes in place; but a pooled, fixed-capacity structure cannot hand a
   caller nodes in a *different* arena without copying (O(n)). How do they return
   "two treaps" honestly?
5. **Recursion depth (the planner risk).** set / delete / split / merge recurse to a
   depth = tree height, which is O(n) worst-case on a pathological priority draw.
   Resolve it -- iterative/capped, or a documented disclosure.

## Decision

**1. Treap = the randomized-EXPECTED balanced BST; Scapegoat DEFERRED.** A treap
holds a BST order on `_key` and a MAX-HEAP order on a per-node random priority
`_prio`; a random-priority heap over a BST is provably balanced IN EXPECTATION
(Aragon & Seidel 1989). This makes Treap the family's second EXPECTED-O(log n) member
(SkipList is the first), so it inherits SkipList's randomized-honesty contract
verbatim (D-06 point 3): a hot op is EXPECTED, never worst-case, and the witness
DISCLOSES the MAX single insert. Scapegoat (amortized rebuild, a different honesty
story -- amortized, not expected) is deferred; a treap is the smaller, zero-GC-cleaner
member and it composes (split / merge) in a way scapegoat does not.

**2. Ship the AUGMENTATION.** A third invariant, `_size[x]` = the node count of x's
subtree, is maintained in the SAME pass as every link rewrite (rotation, insert,
delete, split, merge). It buys `rank(x)` (count of keys < x) and `select(k)` (the
k-th smallest key) in O(log n) via subtree counts -- the order-statistic tree the
plain-map members (SkipList) cannot offer -- plus `split(key)` and `merge(a, b)`.
This is the headline that distinguishes Treap from SkipList inside the family.

**3. REUSE the private NodePool (design-parity, second bind of D-01).** Treap ships
NO new allocator: it constructs the same in-file `NodePool` SkipList uses (a LIFO
free-stack over a `Uint32Array`, `NIL = 0`, slot 0 reserved, the conservation
invariant `activeSlots + freeListLength === capacity`). Nodes are slot INDICES in six
flat columns (`_key` / `_value` Float64; `_left` / `_right` / `_prio` / `_size`
Uint32). This is the reuse D-06 anticipated -- one correctness story for the pooled
free-list, no fork.

**4. split / merge SHARE the arena and CONSUME their inputs.** Under a fixed-capacity
pool, the only way to keep split / merge O(log n) is to rewire nodes in place, never
copy. So `split(key)` returns `[left, right]` -- two `Treap` VIEWS (via a private
`Treap._view`) that share the source's columns + free-list -- and leaves the source
EMPTY (root = NIL); `Treap.merge(a, b)` requires `a` and `b` to share an arena (it
throws otherwise), fuses their roots, and consumes both. This is documented on the
public surface (JSDoc + llms.txt + README) as the explicit price of sub-linear set
surgery under a pooled allocator. `merge` fails closed: non-Treap inputs, treaps from
different arenas (`a._key !== b._key`), or an overlapping key range (max(a) >= min(b))
each throw `[lite-logn]`.

**5. Recursion depth: a DOCUMENTED DISCLOSURE matching the EXPECTED contract (the
planner risk, RESOLVED).** `set` / `delete` / `split` / `merge` recurse to a depth
equal to the tree height: O(log n) EXPECTED, O(n) worst-case on a pathological
priority draw. We chose the honest disclosure (planner option b) over an iterative
rewrite or a hard depth cap, for three reasons: (a) priorities come from the
INSTANCE-LOCAL LCG, NOT from caller-chosen keys, so an adversary cannot force the
worst case through the public surface -- the expected bound genuinely holds, exactly
the SkipList EXPECTED contract; (b) the recursion runs on the native CALL STACK, not
the GC heap, so it is still 0 B/op (proven by the torture gate) -- a depth cap would
add a hot-body branch that never fires in expectation, against the "bytes in a hot
body, not instructions" law; (c) a cap that "fails closed" on deep recursion would
convert an astronomically-rare balance event into a spurious throw on a structurally
valid tree -- worse than the disclosure. The disclosure lives in the class JSDoc
("RECURSION DEPTH: ... O(log n) EXPECTED and O(n) worst-case ... DISCLOSED here + in
the ADR, not silently shipped"), in llms.txt, and in the witness MAX-single-insert
print. A future member that needs a hard worst-case bound is Scapegoat (deferred) or
an iterative-with-parent-stack rewrite, not this one.

## Consequences

- `LogN.js` gains `TR_DEFAULT_SEED`, `TR_MAX_CAPACITY` (`0x7FFFFFFF` -- slot indices +
  subtree counts fit an unsigned 32-bit word), and the `Treap` class, appended after
  SkipList; BinaryHeap / Fenwick / SegmentTree / SkipList stay BYTE-IDENTICAL (only
  the `VERSION` const changes above the append point).
- Public surface: get / has / set / delete / rank / select / successor / predecessor /
  rangeIter / forEach / clear / split + static merge. `set` on an existing key updates
  the value in place; `rangeIter` is version-stamped (structural OR value mutation
  mid-iteration throws). Priorities break ties by key, so the tree shape is a
  deterministic function of the (key, priority) set (seed-reproducible).
- The witness gains ONE gated op-row, `Treap.get` (a BST descent), against a linear-
  scan O(n) foil. It inherits the FROZEN shared R^2 floor 0.958 (D-08); the four
  prior members' bands are UNTOUCHED. Its OWN band is calibrated below.
- The benchmark (repo-only) admits Treap as the 5th SUBJECT: SUBJECTS 4 -> 5, OP_ROWS
  7 -> 8 (+ `Treap.get`), the matrix 4x8=32 -> 5x8=40 cells, OP_CLASS gains
  `Treap.get/set/delete` (all EXPECTED), CLEAR_WITNESS 4 -> 5.

## Witness band calibration (D-07, ADR-0004 method)

`Treap.get` is gated over the EXACT-power sweep `2^11..2^17` (the same window
SkipList.get uses -- a pointer-chasing search needs that dynamic range above the
timing floor). The band is `median-of-15 fit-runs * [0.6, 1.4]`, centered on the
MEDIAN (never a high sample -- ADR-0004 discipline), so a legitimately faster future
run is not false-failed:

- 15 fit runs on this machine spanned slope 4.10..4.36 ns/level, R^2 0.965..0.981.
- MEDIAN slope = 4.25 ns/level.
- `TREAP_GET_SLOPE_LO = 2.55` (4.25 * 0.6), `TREAP_GET_SLOPE_HI = 5.95` (4.25 * 1.4).

A treap descent touches ONE node per level (vs a skip list's tower of forward links),
so its per-level slope (~4.25) is LOWER than SkipList.get's (~8.78) -- expected, which
is exactly why only the R^2 floor is shared family-wide and each op declares its own
band. The R^2 floor 0.958 is FROZEN (D-02); it is inherited, never widened.

## Alternatives rejected

- **A deterministic red-black / AVL tree.** Rejected: parent pointers or a colour
  byte, worst-case-O(log n) but pointer-heavier and a different (non-expected)
  honesty story; the family already frames randomized members as EXPECTED, and a
  treap is the zero-GC-cleanest balanced BST.
- **split / merge that return INDEPENDENT treaps by copying.** Rejected: copying is
  O(n), which forfeits the O(log n) headline. Arena-sharing views keep it sub-linear;
  the consume-the-input semantics are documented, not hidden.
- **An iterative set/delete with a preallocated parent stack, or a hard depth cap.**
  Rejected: adds a hot-body branch/scratch that never fires in expectation, and a cap
  would spuriously throw on a structurally valid (merely tall) tree. The instance-
  local LCG makes the worst case unreachable via the public surface; the disclosure
  matches the EXPECTED contract.
- **A separate allocator for Treap.** Rejected: that is the substrate drift D-01
  refuses; the SkipList NodePool contract + invariant fit exactly.
