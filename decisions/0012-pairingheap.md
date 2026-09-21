# 0012 -- PairingHeap: an ADDRESSABLE mergeable priority queue over a shared arena (D-PH1..D-PH3)

- Status: ACCEPTED
- Severity: S1 (picks the mergeable-heap arc's ADDRESSABLE member, its arena-wide-unique
  id contract + per-slot owner guard, the two-pass 0-B/op combine, the SHARED-ARENA O(1)
  meld with a consume-fails-closed contract + union-find alias, and the popMin witness band)
- Date: 2026-09-21
- Session: PairingHeap (v0.10.0)

## Context

PairingHeap is the tenth member -- the mergeable-heap arc's ADDRESSABLE priority queue.
BinomialHeap (0011) is the arc's LEAN, NON-addressable member: opaque, non-unique ids, no
reverse map, an O(log n) meld. PairingHeap (Fredman, Sedgewick, Sleator, Tarjan 1986) is
its addressable counterpart -- a single multi-way heap-ordered tree (left-child /
right-sibling) whose defining ops are a cut-and-link `decreaseKey` and an O(1) `meld`.
push / peekMin / peekMinKey / meld are O(1); popMin / decreaseKey / remove are AMORTIZED
O(log n). Three design calls had to be settled before code: the addressability + id model
(the load-bearing one), the popMin combine (the make-or-break alloc hot path), and the
arena / meld ownership model.

## Decision

**D-PH1 ADDRESSABLE, ARENA-WIDE-UNIQUE ids + a per-slot owner guard.** Caller ids are
UNIQUE integers in [0, capacity), and the reverse map `_pos` (id -> slot, sentinel -1 =
absent) is ARENA-WIDE -- shared across every heap drawing the arena. This is a user-visible
contract difference vs BinomialHeap's opaque, non-unique ids, and it is stated LOUDLY in
llms.txt / README / the JSDoc. `decreaseKey` cuts the node's subtree from its parent's
child list, then links the subtree at this heap's root; `remove` cuts, two-pass-combines
the node's children, and links the result at the root (removing the root delegates to
popMin). Each slot carries an `_owner` tag (the owning heap's small integer id) so
`decreaseKey(id)` / `remove(id)` on an id owned by a DIFFERENT live sibling heap in the
same arena is O(1)-detected and throws `[lite-logn]` (fail closed -- never a silent
cross-heap cut). push updates `_pos` + `_owner`; popMin / remove release `_pos[id] = -1`
and `_owner[slot] = 0`; clear() releases all of this heap's ids. Non-member / out-of-range
/ arena-wide-duplicate id throws. `decreaseKey` operates TOWARD the heap's extreme
(decrease for 'min', increase for 'max' -- the direction a cut-and-link supports); a move
AWAY from the extreme cannot be served by a cut-and-link and fails closed with a throw.

Storage: five pointer-free columns (`_key` Float64, `_id` / `_child` / `_sibling` /
`_parent` Uint32) over a NodePool, plus the arena-wide `_pos` Int32 reverse map, a per-slot
`_owner` Uint32, and a `_alias` Int32 union-find over heap ids. `_parent` is a DUAL-ROLE
PREV pointer: a leftmost child's `_parent` is its true parent; a non-leftmost node's is its
LEFT sibling; a root's is NIL. This is what makes `_cut` O(1) (no sibling scan): to cut s,
`_child[parent] === s` distinguishes "s is leftmost" (fix parent's child) from "prev is a
left sibling" (fix prev's sibling), then the right sibling's PREV is repointed.

**Why arena-wide `_pos`, and why a per-heap map was REJECTED.** decreaseKey/remove need a
reverse map (id -> slot). With arena-sharing heaps, the map must be arena-wide so a melded-
in id remains addressable via the surviving heap. The rejected alternative -- a PER-HEAP
reverse map -- would force `meld` to MIGRATE every one of b's entries into a's map, making
meld O(|b|) and destroying the pairing heap's headline O(1) meld. The arena-wide `_pos` +
per-slot `_owner` + a union-find `_alias` keep meld O(1): the alias redirects b's heap id
to a's, so a node whose `_owner` still reads b's id resolves (via path-halved `_resolve`)
to a in ~O(1), with NO per-node re-tag. Ownership of an id is therefore
`_resolve(_owner[slot]) === _resolve(this._hid)`.

**D-PH2 TWO-PASS combine, 0 B/op (the make-or-break hot path).** popMin unlinks the root
then combines the root's child list: PASS 1 pairs adjacent siblings left-to-right; PASS 2
folds the paired list right-to-left into one new root. The implementation is ITERATIVE and
POINTER-FREE -- there is NO temporary array; PASS 1 PREPENDS each merged pair onto a list
threaded through the `_sibling` links (so the list is in reverse pair order), and PASS 2
then folds that list front-to-back (which IS right-to-left over the pairs). The sibling
links ARE the work list. This is the load-bearing alloc gate: a temp array in the combine
would fail `node --expose-gc test/torture.mjs` (0 B/op).

**D-PH3 SHARED-ARENA, O(1) meld with a union-find alias + consume-fails-closed.** A
standalone `new PairingHeap(capacity, kind)` owns its own arena; `PairingHeap.arena(
capacity, kind, count)` hands out `count` arena-sharing heaps (the BinomialHeap `_view`
precedent) with an `_alias` sized count+1. `a.meld(b)` is a SINGLE root-link plus one alias
write (`_alias[b._hid] = _resolve(a._hid)`) -- <= ~6 column writes, INDEPENDENT of |b|,
strictly BETTER than BinomialHeap's O(log n) meld. It CONSUMES b: b becomes empty (size 0)
AND DEAD (a `_consumed` flag; every later op on b throws). Cross-arena detection is COLUMN
IDENTITY (`a._key !== b._key`); a kind mismatch (min vs max), a non-PairingHeap arg, a
self-meld, or a consumed operand each throw. Conservation across meld is a hard invariant:
nodes MOVE between root lists but NEVER between pools (`activeSlots` unchanged by meld),
torture-tested every soak cycle, incl. a decreaseKey on a melded-in id (the addressable
contract) before the drain.

**HONESTY: pairing meld is O(1), BETTER than BinomialHeap's O(log n).** This is stated as a
concrete comparison, not a vague "fast": the two mergeable members sit at different points
-- BinomialHeap trades an O(log n) meld for a LEAN non-addressable surface; PairingHeap
trades a heavier per-node footprint (the arena-wide reverse map + owner + alias) for an
O(1) meld AND addressable decreaseKey/remove. Neither dominates; the GUIDE picker states
the trade.

## Witness band (D-PH2, ADR-0004 method)

`PairingHeap.popMin` is the gated O(log n) witness op (the two-pass combine -- the pairing
heap's tallest honest walk). It inherits the FROZEN family R^2 floor 0.958 and calibrates
its OWN slope band by the shared ADR-0004 method (median-of-15 fit-runs x [0.6, 1.4]),
gated over EXACT powers 2^11..2^17 (the cache-resident pointer-chasing window the other
forest members use; the [1e4..1e6] band curves at the memory wall). The 15 popMin slope
samples measured on this machine (ns/level):

    20.96 21.70 21.82 21.74 21.80 21.18 21.54 21.81 21.79 21.97 21.49 21.88 22.19 22.08 22.24

- MEDIAN slope = 21.799 ns/level (centered on the MEDIAN, never a high sample, so a
  legitimately faster future run is not false-failed; the R^2 floor independently rejects
  any non-log shape).
- Band = median x [0.6, 1.4] = **[13.08, 30.52]** ns/level
  (`PAIRINGHEAP_POPMIN_SLOPE_LO = 13.08`, `PAIRINGHEAP_POPMIN_SLOPE_HI = 30.52`).

**RELIABILITY (median-of-fits, corrected after review).** A pairing-heap full-drain average
has genuine run-to-run SHAPE variance (the two-pass amortization tilts the whole 7-point set
occasionally), so a SINGLE sweep-fit's R^2 is FLAKY: measured on this machine, individual
single-fit R^2 ranges **~0.945..0.985**, dipping below the 0.958 floor in a minority of runs
(the reviewer observed fails at 0.9459 / 0.9495 / 0.9502 / 0.9553 / 0.9574) even while the
slope stays solidly in-band -- a flaky gate is a failed gate under suite law. The initial
"every run >= 0.958" claim was NOT reproducible and has been corrected. The lane therefore
gates on the **MEDIAN of PH_FIT_RUNS (= 5) independent sweep-fits** (the registry `fitRuns`
hook + a median-of-fits branch in the witness main loop): fit the sweep 5 times, sort by R^2,
gate on the middle fit -- rejecting the occasional tilted sweep on BOTH ends. This is
measurement-QUALITY only (the same robust-estimator discipline the fast members use with
min-over-batches); the frozen 0.958 floor and the slope band are UNTOUCHED, and a genuine
O(n) shape fails ALL fits, so no teeth are lost. Measured: the **median-of-5 fit R^2 ranges
0.9907..0.9974 over 15 back-to-back meta-runs, 0/15 below the floor** (reliably clear), with
the median-of-5 slope in ~20.7..23.0 ns/level (well inside the band). Re-run of the REAL
`node test/witness.mjs` 12x back-to-back: every run ON-LINE, R^2 spread recorded in CHANGELOG.

The per-level slope (~21.8) sits BETWEEN BinaryHeap.pop's (~9.6, array-embedded) and
BinomialHeap.popMin's (~44.8, a forest of trees) -- a pairing popMin chases scattered
forest slots but re-links a single multi-way child list, not a whole forest. AMORTIZED
member: the MAX single popMin (a long two-pass fold) is DISCLOSED, not gated (the SplayTree
precedent). The O(n) foil is a linear min-scan-and-splice extract-min (OFF the line).

## Consequences

- `LogN.js` gains `PH_MAX_CAPACITY` (`0x7FFFFFFF`, named distinctly from BinaryHeap's
  identically-valued `BH_MAX_CAPACITY`) + the `PairingHeap` class, appended after
  BinomialHeap; the prior nine classes stay BYTE-IDENTICAL (the diff is a 1-line VERSION
  bump + a pure append).
- decreaseKey/remove are AMORTIZED O(log n) -- OP_CLASS labels them (and popMin) AMORTIZED,
  NOT worst-case. push and meld are strict O(1), so they are deliberately NOT in the
  O(log n) OP_CLASS honesty table (an O(1) op cannot carry an O(log n) label; their O(1)
  nature is stated in llms/README/this ADR).
- Version bumped to 0.10.0 across `package.json`, `LogN.js`, and `llms.txt`.
