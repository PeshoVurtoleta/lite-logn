# 0013 -- FibonacciHeap: the textbook-optimal ADDRESSABLE mergeable priority queue (D-FH1..D-FH5)

- Status: ACCEPTED
- Severity: S1 (closes the mergeable-heap arc; picks the mark-bit representation, the
  degree-bucket scratch home + its GOLDEN-RATIO sizing, the cascading-cut mechanism, the
  SHARED-ARENA O(1) meld reusing PairingHeap's alias, and the popMin witness band + the
  HONEST median-of-fits R^2 spread)
- Date: 2026-09-21
- Session: FibonacciHeap (v0.11.0)

## Context

FibonacciHeap is the eleventh member and the mergeable-heap arc's FINALE. The arc ran
BinomialHeap (0011, LEAN + non-addressable) -> PairingHeap (0012, ADDRESSABLE, lean two-pass
combine) -> FibonacciHeap (the textbook-optimal one). A Fibonacci heap (Fredman & Tarjan
1984) reaches the same ADDRESSABLE + MERGEABLE amortized bounds as PairingHeap by a more
elaborate machine: push / meld / decreaseKey O(1) AMORTIZED, popMin / remove O(log n)
AMORTIZED. It is the member the textbooks name for the tightest asymptotic Dijkstra / Prim
bound. It is ALSO, honestly, the member that is OFTEN SLOWER wall-clock than Pairing / Binary
on real hardware (large constant factors, long spikes) -- shipped for completeness and
teaching, not because it wins the benchmark. The arena / addressability / owner-guard model
is REUSED wholesale from PairingHeap (0012); the three Fibonacci-specific calls to settle
before code were the mark-bit representation, the degree-bucket scratch, and the cascading cut.

## Decision

**D-FH1 addressable + mergeable = REUSE the PairingHeap contract.** Arena-wide-unique caller
ids in [0, capacity); a SHARED `_pos` Int32 reverse map (id -> slot, sentinel -1 = absent);
a per-slot `_owner` tag; a path-halved union-find `_alias` over heap ids for O(1)-meld
ownership. `decreaseKey(id)` / `remove(id)` are addressable; a sibling-owned id is an O(1)
fail-closed `[lite-logn]` throw; pushing an id live anywhere in the arena throws. kind
'min' | 'max' frozen at ctor. `FH_MAX_CAPACITY = 0x7FFFFFFF` (named distinctly from the
identically-valued `BH_MAX_CAPACITY` / `PH_MAX_CAPACITY` to avoid a module-scope
redeclaration). `FibonacciHeap.arena(capacity, kind, count)` copies the PairingHeap arena /
`_view` shape and shares `_alias` / `_pos` / `_bucket` / the pool + columns.

**D-FH2 cascading cut + a MARK BIT as a Uint8 column.** `decreaseKey` lowers the key toward
the extreme; if the heap order with the parent breaks it `_cut`s the node's subtree to the
root list (clearing its mark), then `_cascade`s UP its former parent chain -- a MARKED parent
is cut too and the walk continues; the first UNMARKED non-root parent is marked and the walk
stops. The mark is a dedicated `_mark` Uint8 COLUMN, NOT a packed bitset: packing buys no GC
(the column is preallocated once either way) and costs hot-body bytes to mask/shift on every
read -- against the hot-path law (bytes in a hot body, not instructions). The cascade is
ITERATIVE (a native `while` loop, NO recursion) so decreaseKey stays 0 B/op and cannot blow
the stack on a long chain. A move AWAY from the extreme is unsupported by a cut-and-link and
fails closed (`_badDir`).

**D-FH3 circular lists + degree consolidation; the degree bucket is PER-ARENA and sized to
the GOLDEN-RATIO bound.** The root list AND every child list are CIRCULAR doubly-linked
(`_left` / `_right`); every node carries a `_degree`. popMin splices the min root's children
into the root list (clearing their `_parent` + mark), releases the old slot, then
CONSOLIDATES via a preallocated degree bucket (`_bucket` Uint32, degree -> root) -- repeatedly
linking two roots of equal degree until every degree is unique -- then rescans the survivors
for the new cached extreme. Two sub-calls:
  - **Scratch home = per-ARENA `_bucket`.** popMin is one-at-a-time (never re-entrant across
    arena siblings), so ONE shared scratch suffices; a per-heap bucket would waste memory and
    a per-call allocation would break 0 B/op. Cleared PER CALL in O(maxDegree) -- only the
    touched slots are reset, NEVER reallocated and NEVER left stale. **This is the flagged
    RISK: a stale bucket entry silently corrupts the forest** (a phantom equal-degree root
    would be linked into a live tree). The rescan loop that finds the new extreme doubles as
    the clear (it zeroes every slot it reads), so staleness is structurally impossible; the
    boundary suite asserts the bucket is all-zero after EVERY popMin.
  - **Bucket SIZING = the golden-ratio degree bound, NOT ceil(log2 cap).** A Fibonacci heap's
    max degree is D(n) <= floor(log_phi n) ~ 1.4404 * log2 n -- LARGER than log2 n by ~44%
    (the mark / cascading-cut invariant: a node of degree k roots a subtree of at least
    F(k+2) >= phi^k nodes). A bucket sized `ceil(log2 cap)` (the naive "one entry per level")
    would be ~44% short, and a consolidation would write past its end -- a SILENT no-op on a
    typed array, whose subsequent read returns `undefined` (`undefined !== 0` is true) and
    corrupts the link loop. So `_bucket` is sized
    `ceil(log2(cap+1) / log2(phi)) + 2` (`FH_LOG2_PHI = 0.6942419...`, +2 slack for the ceil
    + the one-past terminal slot the link loop writes). The boundary suite proves both that
    the shipped length covers the theorem's bound for every plausible capacity AND that a
    degree-maximizing churn never drives the observed max degree to the bucket length.

  Iterating the root list `cnt` times (count first, then save `next` before each node can be
  re-linked as a child) is the standard alloc-free traversal of a list that mutates as it
  links -- no temporary array, 0 B/op. The cached extreme is maintained INLINE on push / meld
  / decreaseKey (via `_addRoot`), so peekMin stays O(1).

**D-FH4 shared-arena O(1) meld, WITHOUT an O(|b|) per-node retag.** `a.meld(b)` concatenates
the two circular root lists (a handful of link writes, INDEPENDENT of |b|) + a union `_alias`
redirect of b's heap id to a's + a cached-extreme update, and CONSUMES b (empty, size 0,
DEAD; every later op throws). The `_alias` is EXACTLY how PairingHeap (D-PH3) avoids re-tagging
b's nodes: a node owned by a melded-in heap resolves its owner to the survivor in ~O(1)
(path-halved) via `_resolve`, so meld need NOT touch `_owner` on any of b's nodes. The rejected
alternative -- a per-node `_owner` retag on meld -- would make meld O(|b|), defeating the whole
point of a Fibonacci heap's O(1) meld. Cross-arena is detected by COLUMN IDENTITY
(`this._key !== other._key`); a kind mismatch, a non-FibonacciHeap arg, a self-meld, or a
consumed operand each throw. Conservation across meld is a hard invariant: nodes MOVE root
lists but NEVER pools (torture-tested every soak cycle, incl. the addressable paths and a
melded-in id reprioritized via the survivor).

**D-FH5 witness = popMin (AMORTIZED), median-of-fits, spikes DISCLOSED not gated.** The gated
O(log n) witness op is `popMin` (the Fibonacci heap's tallest honest walk -- splice children,
consolidate the root list). It inherits the FROZEN family R^2 floor 0.958 (`BINARYHEAP_R2_FLOOR`,
UNCHANGED) and calibrates its OWN slope band by the shared ADR-0004 method (median x [0.6, 1.4]),
gated over EXACT powers 2^11..2^17 (the cache-resident pointer-chasing window). The foil is a
linear min-scan-and-splice extract-min (O(n^2) drain, OFF the line). As an AMORTIZED member it
DISCLOSES -- never gates -- the MAX single popMin (a long consolidation) AND the MAX single
decreaseKey (a long cascading cut).

## Calibration + the HONEST R^2 spread

- Slope: median-of-15 popMin fit-runs = **45.296 ns/level** (samples 43.24 44.40 44.46 44.32
  44.93 45.30 45.27 45.59 45.28 45.56 45.71 45.62 46.08 46.14 45.84). Band = median x [0.6, 1.4]
  = **[27.18, 63.41]** ns/level. This is the FAMILY's STEEPEST per-level slope (a lazy forest
  consolidated on demand -- the largest constant factors of any heap here); expected, which is
  why only the R^2 floor is shared and this op declares its own band.
- R^2 HONESTY (median-of-fits, `fitRuns = 7`): a Fibonacci-heap full-drain average has even MORE
  run-to-run SHAPE variance than the pairing two-pass (the lazy forest is only consolidated on
  demand, so the per-drain work distribution swings hard). A SINGLE sweep-fit's R^2 is therefore
  FLAKY: on this machine a batch of 15 single fits ranged ~0.981..0.988, and across meta-runs a
  single fit CAN dip below the 0.958 floor even while the slope stays in-band. The lane therefore
  gates on the MEDIAN of 7 independent sweep-fits (the `fitRuns` hook -- same robust-estimator
  discipline as PairingHeap's median-of-5), rejecting the occasional tilted sweep on both ends.
  Measurement-quality ONLY: the frozen 0.958 floor + the slope band are UNTOUCHED, and a genuine
  O(n) shape fails EVERY fit (no teeth lost). We DO NOT claim an unreproducible "every run >=
  floor"; the claim is the WEAKER, TRUE one -- the median-of-7 clears the floor reliably (the
  gated median R^2 observed across `node test/witness.mjs` re-runs is recorded in the CHANGELOG
  [0.11.0] entry, all ON-LINE).

## Alternatives rejected

- **Packed mark bitset** -- buys no GC (column preallocated either way), costs hot-body
  mask/shift bytes on every cascade read; rejected for the plain Uint8 column (D-FH2).
- **`ceil(log2 cap)` degree bucket** -- undersizes the golden-ratio bound by ~44%, a silent
  out-of-bounds write that corrupts the forest; rejected for the log_phi sizing (D-FH3).
- **Per-node `_owner` retag on meld** -- correct but O(|b|), defeating the O(1) meld; rejected
  for the union-find `_alias` reused from PairingHeap (D-FH4).
- **Recursive cascade** -- a long mark chain would blow the stack and (via the frame) allocate;
  rejected for the iterative `while` loop (D-FH2).

## Consequences

- LogN.js gains `FH_MAX_CAPACITY`, `FH_LOG2_PHI`, and the `FibonacciHeap` class, appended
  after PairingHeap; the prior TEN classes stay BYTE-IDENTICAL (only the `VERSION` const
  changes above the append point -- a two-hunk diff). The mergeable-heap arc is now complete:
  BinomialHeap (lean) / PairingHeap (addressable, fast) / FibonacciHeap (addressable, textbook-
  optimal-but-slower). Zero-GC proven by `node --expose-gc test/torture.mjs` (0 B/op on every
  lane incl. meld + cascade, gc major = 0, conservation across meld); `npm run test:perf` clean;
  `npm run witness` re-run 3-4x all ON-LINE via median-of-fits.
