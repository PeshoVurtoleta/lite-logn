# 0010 -- SplayTree: a self-adjusting ordered map via iterative top-down splay (D-SP1..D-SP5)

- Status: ACCEPTED
- Severity: S1 (picks the family's SELF-ADJUSTING member, its top-down splay
  mechanism + slot-0 header, the read-mutates contract, the LEAN surface, and the
  amortized-not-worst-case witness with a disclosed max single op)
- Date: 2026-09-21
- Session: SplayTree (v0.8.0)

## Context

SplayTree is the eighth member -- the family's SELF-ADJUSTING BST ordered map. Where
Treap (0007) randomizes the shape and Scapegoat (0008) weight-balances it, a splay tree
keeps NO balance metadata at all: every access SPLAYS -- a chain of rotations that walks
the touched node (or, for an absent key, the last node on the search path) to the root
(Sleator & Tarjan, "Self-adjusting binary search trees", JACM 1985). Recently and
frequently used keys therefore ride near the top, giving AMORTIZED O(log n) per op and
genuinely FASTER-than-log behaviour on skewed / working-set access. Several design calls
had to be settled before code.

## Decision

**D-SP1 TOP-DOWN, ITERATIVE, ZERO-STACK SPLAY.** The splay is the iterative TOP-DOWN
variant: a single downward pass assembles a left tree and a right tree, handling zig /
zig-zig / zig-zag in place. Slot 0 (the reserved NIL sentinel) DOUBLES as the splay's
dummy header -- `_right[0]` accumulates the left tree, `_left[0]` the right tree -- and
two fixed instance scratch hands (`_hl` / `_hr`, the left-tree max and right-tree min)
grow the two trees. There is NO parent column, NO path stack, and NO recursion, so every
hot op is 0 B/op AND no degenerate chain can overflow the native stack (the bottom-up
recursive splay, and a parent-pointer column, are both rejected below). The header's two
columns are restored to 0 before the splay returns, so the NIL invariant holds between
operations (white-box tested: `_left[0] === _right[0] === 0` after every op).

**D-SP2 A READ MUTATES (splay + version bump).** `get` / `has` / `successor` /
`predecessor` SPLAY the touched (or closest) node to the root and BUMP `_version`. This is
the member's defining property, not an accident: it is why hot keys stay shallow. The
consequence is loudly documented -- an in-flight `rangeIter` fails closed even on a READ
(the version stamp catches a get/has mid-iteration, tested). `rangeIter` / `forEach` /
`[Symbol.iterator]` are the ONLY non-mutating reads: NON-splaying in-order walks that
re-descend by key each step (so NO scratch stack is allocated) and leave `_root` +
`_version` byte-identical (tested).

**D-SP3 LEAN surface (no rank / select / split / merge).** SplayTree ships NO subtree-size
column and therefore NO order statistics (rank / select) and NO split / merge. Treap and
Scapegoat already carry the augmented / order-statistic surface; the splay tree's
contribution is the self-adjusting access pattern, not a fourth augmented map. Four columns
(`_key` / `_value` Float64, `_left` / `_right` Uint32) over the shared NodePool, plus a
scalar `_n` size counter. `delete` splays the target to the root then JOINS its two subtrees
(splay the MAX of the left subtree to that subtree's root -- via `_splay(Infinity)`, driving
the rightmost up -- leaving it with no right child, then hang the right subtree there). The
absent surface is named here + in the NOT FOR section, never a silent omission.

**D-SP4 DETERMINISTIC, no seed.** Unlike SkipList / Treap, the splay tree has NO RNG: the
shape is a deterministic function of the access sequence. The constructor takes only a
capacity (no seed argument). Keys and values are FINITE numbers (Symbol / BigInt / NaN /
+-Infinity fail closed, typeof-guarded FIRST -- the key guard before the value guard; any
throw leaves `size` unchanged). Empty / missing query returns `undefined` (never throws).
Fixed capacity: a full pool throws, never drops (a rejected insert still splayed, which is
valid; the tree is left consistent).

## The splay mechanism

Header = slot 0; hands `lm` (left-tree max, grows via `_right[lm]`) and `rm` (right-tree
min, grows via `_left[rm]`), both starting at the header. Descending by `key`:

- key < node.key: if the left child also compares greater, ROTATE RIGHT (zig-zig), then
  LINK RIGHT (node becomes the new right-tree min).
- key > node.key: mirror -- ROTATE LEFT then LINK LEFT (node becomes the new left-tree max).
- equal, or the next child is NIL: BREAK.

Reassembly hangs the broken node's subtrees off the two hands and hangs the two assembled
trees off the new root. The aliasing when a hand is still the header (no links happened on
that side) is BENIGN -- the reassembly reads/writes the same header column and nets to no
change (verified). All writes are to existing slot columns (rotations rewrite links only),
so a splay-get allocates ZERO bytes even though it restructures.

**D-SP5 WITNESS (amortized, with a disclosed max single op).** `get` is the gated O(log n)
witness op, measured over a UNIFORM-RANDOM working set of size n (a shuffled permutation of
the resident keys, cycled by the power-of-two mask). That access pattern keeps NO key hot,
so the self-adjusting splay churns the full height each op and the AMORTIZED O(log n) line
is visible; a SKEWED or SEQUENTIAL pattern would trigger splay's working-set / dynamic-
finger / sequential-access speedups and FLATTEN the line (which is the member's whole point,
but not what a straight-line log WITNESS measures). SplayTree is AMORTIZED + DETERMINISTIC:
a single cold, deep access can splay an O(n) chain, so the harness PRINTS the MAX single get
as a DISCLOSURE, never a gate (the analogue of SkipList / Treap's max-single-insert line,
here on the READ path). The band was calibrated by the shared ADR-0004 method (median-of-15
fit-runs * [0.6, 1.4], MEDIAN-centered), inheriting the FROZEN family R^2 floor 0.958 (D-08,
never widened). A splay get REWRITES links (rotations) on every op -- strictly more work per
level than a read-only BST descent -- so its per-level slope (~27.3) sits WELL ABOVE
Treap.get's (~4.25), yet still on the family shape; that is why only the R^2 floor is shared
and each op declares its own band. The gated sweep is 2^12..2^17 (the 2^11 point is too fast
+ noisy for the mutating splay and drops R^2 near the floor; 2^12 up gives clean dynamic
range -- lite-o1 ADR-0004 domain discipline). The O(n) foil is a linear scan (the naive map
before the balanced/self-adjusting BST): exponential on the log2(n) axis, so it MISSES the
floor.

The 15-run get calibration on this machine (gated sweep [2^12, 2^13, 2^14, 2^15, 2^16, 2^17]):

    slopes (ns/level): 27.07 27.18 27.33 27.25 27.32 26.86 27.71 27.33 27.40 26.75
                       27.35 27.19 27.11 27.46 27.36
    R^2:               0.9872 0.9865 0.9832 0.9841 0.9837 0.9859 0.9750 0.9840 0.9849
                       0.9821 0.9820 0.9809 0.9773 0.9817 0.9763
    MEDIAN slope = 27.316 ns/level ; R^2 range 0.9750 .. 0.9872 (all >= 0.958 floor)
    band = median * [0.6, 1.4] = [16.39, 38.24]
    -> SPLAYTREE_GET_SLOPE_LO = 16.39, SPLAYTREE_GET_SLOPE_HI = 38.24

Centered on the MEDIAN (never a high sample) so a legitimately faster future run is not
false-failed; the R^2 floor independently rejects any non-log shape.

## Consequences

- `LogN.js` gains `SP_MAX_CAPACITY` (`0x7FFFFFFF`) + the `SplayTree` class, appended after
  MinMaxHeap; BinaryHeap / Fenwick / SegmentTree / SkipList / Treap / Scapegoat / MinMaxHeap
  stay BYTE-IDENTICAL (only the `VERSION` const changes above the append point -- a two-hunk
  diff).
- The witness gains ONE gated op-row, `SplayTree.get` (an amortized splay descent), against
  the linear-scan O(n) foil, PLUS a disclosed max-single-get line. It inherits the FROZEN
  shared R^2 floor 0.958 (D-08); the seven prior members' bands are UNTOUCHED.
- The benchmark (repo-only) admits SplayTree as the 8th SUBJECT: SUBJECTS 7 -> 8, OP_ROWS
  10 -> 11 (+ `SplayTree.get`), the matrix 7x8=56 -> 8x8=64 cells, OP_CLASS gains
  `SplayTree.get` / `.set` / `.delete` (all O(log n) AMORTIZED -- the same third honesty
  class as Scapegoat's rebuild-absorbed set/delete, and the first amortized READ), and
  CLEAR_WITNESS 7 -> 8. The ordered D8 workload DOES admit SplayTree (an ordered map with
  successor + rangeIter).

## Alternatives rejected

- **Bottom-up (recursive / parent-pointer) splay.** Rejected: bottom-up needs either a
  parent column (a fifth typed-array column + a maintained back-pointer on every link
  rewrite) or a path stack (an allocation, or a fixed capacity-sized scratch buffer). The
  iterative top-down splay needs NEITHER -- two scalar hands + the slot-0 header -- so it is
  the zero-GC-cleanest AND cannot overflow the native stack on a degenerate chain.
- **A subtree-size column + rank / select / split / merge.** Rejected for this member (D-SP3):
  Treap and Scapegoat already carry the augmented / order-statistic surface. Adding it here
  would be a redundant fourth augmented map and forfeit the LEAN four-column footprint; the
  splay tree's contribution is the self-adjusting access pattern, not order statistics.
- **A non-mutating get (read without splaying).** Rejected: a splay tree that does not splay
  on read is just an unbalanced BST with no balance guarantee at all -- the amortized bound
  DEPENDS on the read restructuring. The cost (a read bumps the version, failing in-flight
  iterators) is documented as the contract, not hidden (D-SP2).
- **A skewed / zipf witness access pattern.** Rejected for the GATED fit (kept as the torture
  working-set lane instead): skew triggers the working-set theorem and flattens the line
  below the slope band, which would measure the member's SPEEDUP rather than its O(log n)
  worst-of-the-amortized shape. The uniform-random working set is the honest straight-log
  witness; the skew win is shown by the torture working-set lane + the docs.
