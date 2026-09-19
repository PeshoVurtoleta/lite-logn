# How to honestly benchmark an O(log n) data structure

Repo-only dev doc (NOT in package.json `files[]`). This is the methodology the
`@zakkster/lite-logn` benchmark suite follows, ADOPTED from `@zakkster/lite-o1`
via `benchmark/Template.mjs`. It is the prose companion to the witness gate
(`test/witness.mjs`) and `decisions/0004-witness-band.md` (read that ADR first for
the "why the gate is shaped this way" record).

ASCII-only (`->`, `<=`, `x`, "degrees"). Zero runtime deps, `node:test` only.

## The one rule

A benchmark that flatters the library is worthless. Every number here is built to
be FALSIFIABLE and FAIR: measured against the thing a competent engineer would
actually reach for, reported with its uncertainty, and never rounded up into a
marketing claim. Where a measurement does not apply, the cell is the STRING `n/a`,
NEVER `0` -- a reader can never confuse "not applicable" with "measured zero".

## The eight dimensions

D1 is the ANCHOR -- the O(log n) Witness. The other seven axes surround it with the
things a real consumer feels:

- D1 O(log n) Witness -- fit `nsPerOp = intercept + slope*log2(n)` per hot op-row and
  WITNESS the STRAIGHT log line (r2 >= 0.958, slope in the frozen per-op band) while
  the O(n) foil LEAVES it (foil r2 < 0.958). This is an EMPIRICAL witness (observed on
  a host, never deduced -- see "Three claim classes"). DELEGATED to `test/witness.mjs`
  -- the benchmark re-uses the shipped kernels, sweeps and bands and never re-fits.
- D2 Amortized cost over a long mixed trace -- cumulative ns/op stays flat.
- D3 Memory footprint + stability -- bytes/live vs a theoretical floor, AND a
  load-factor CURVE (0.25/0.5/0.75/1.0). BinaryHeap + SkipList shrink their live set
  (curve ~1/loadFactor); the index-addressed Fenwick + SegmentTree are flat.
- D4 Cache behaviour -- a PORTABLE PROXY (dense forEach vs random single-element
  lookup + stride sweep), labelled PROXY (no native perf counters).
- D5 Bundle size + tree-shaking -- esbuild min + gzip, single import << all import.
- D6 GC pressure -- the 0 B/op gate as a measured curve over n = 1e3..1e6, PER
  op-row (7 kernels across the four members).
- D7 Scalability across key types + load factors + insertion order (incl. an
  ADVERSARIAL reverse order for the comparison-ordered BinaryHeap + SkipList).
- D8 Workload micro-benchmarks (churn / ordered scan).

## Witness-as-dimension-1

Every package in this family has an analytical ANCHOR: a single measurement whose
SHAPE is the empirical WITNESS of the complexity class (observed on a host, not
deduced -- see "Three claim classes" below).

- lite-o1: the O(1) Witness -- ops/ms that stays FLAT as n grows.
- lite-logn (this package): the O(log n) Witness -- a STRAIGHT line on a log-x axis,
  one added level per doubling of n. The fit is `nsPerOp = intercept + slope*log2(n)`;
  a member is ON-LINE when r2 >= 0.958 (the frozen family floor) AND its slope sits
  in its own per-op band (`decisions/0004`). The O(n) foil (the honest default a dev
  reaches for before the log trick) MISSES the floor -- its curve is exponential on a
  log-x axis.
- lite-loglogn (sibling): the O(log log U) Witness -- fit vs log2(bit-width).

The witness is measured over a STEADY window: the smallest sizes (an L1 micro-case)
and the largest (the memory wall / DRAM latency) are DISPLAYED but excluded from the
gate -- they measure hardware, not the algorithm. Pinning the domain is NOT widening
the gate; the r2 floor and slope bands are frozen and never retuned to rescue a run.
`benchmark/Template.mjs` `runWitness` is the portable version of this discipline.

## The fairness discipline: the honest O(n) foil + the counter-foil

Every member is measured against a PRIMARY foil -- the O(n) default a working
programmer reaches for BEFORE knowing the O(log n) trick, and the exact foil
`test/witness.mjs` fits and shows LEAVING the log line:

- BinaryHeap  vs a sorted-array insert (O(n) shift per insert).
- Fenwick     vs a prefix-array rebuild / naive re-sum (O(n) per op).
- SegmentTree vs a whole-tree rebuild / linear scan-fold (O(n) per op).
- SkipList    vs a sorted-array insert / linear scan (O(n) per op).

Every lite-logn primary foil is FAIR-ALREADY -- the honest rival that motivates the
logarithm, not a strawman -- so no "strong baseline" is needed the way lite-o1 adds
one for its three strawman members.

SkipList additionally carries a COUNTER-FOIL: a native `Map`. Map is O(1) at get/set
-- FLATTER and faster than any log line -- but it is ORDER-BLIND: it cannot answer
`successor` / `predecessor` / `rangeIter`. The counter-foil makes the ORDER TAX
visible: the log factor SkipList pays buys exactly the ordered queries Map cannot
answer. It is a counterpoint carried inside the D1 cell, never a gated rival, never 0.

## Three claim classes (honesty of language)

A timing result is never asserted as if it were deduced: a timing / complexity /
constant-factor claim is EMPIRICALLY WITNESSED on a host, so it reads "witness" /
"empirical validation" / "we observe". `benchmark/Matrix.mjs` `classifyClaim` sorts
every reserved-word hit into three classes, and `test/Bench.test.mjs` gates them
across all benchmark / report / METHODOLOGY surfaces:

- alloc -- the deterministic 0-B/op allocation guarantee: the torture gate proves every timed op-row at 0 B/op and the perf gate the same (a DETERMINISTIC assertion, not a noisy sample), so this class alone keeps the reserved word.
- timing -- the O(log n) straight-line fit, the slope bands, and every constant-factor / throughput number are OBSERVED, so they read witness / empirical / we observe, and a timing claim hardened back to the reserved word is a BUG the doc gate catches.
- cited -- a complexity fact attributed to the LITERATURE (Pugh 1990 for the skip list's EXPECTED O(log n) bound) is a CITATION, not a host measurement, so it too keeps the reserved word.

## The statistics

The shared `Harness.mjs` (bootstrap CI, Mann-Whitney U, uniform overhead-subtraction)
is the SAME rigorous core lite-o1 uses; the template's `runLatency` exercises it. D1
in lite-logn is the WITNESS fit (a least-squares r2 + slope), so the inferential
lanes ride along in the Template smoke path rather than the headline. FAIL CLOSED
everywhere: fewer than 8 samples -> `n/a` (the string), never NaN / Infinity / 0.

## The fail-closed dispatch rule

Every per-member dispatch site (op kernel, byte-footprint, theoretical-min,
trace-hash, insertion-order builder, ...) is an EXPLICIT branch per member ending in
a loud `throw` for an unknown member. A new (5th) member can never silently inherit
another's construction.

## How a sibling package adopts the template

1. Write a MANIFEST: `{ name, members, subject(member,n,rng), primaryFoil(member,n),
   strongFoil(member,n)|null, witness: { flavor, build, foil, sizes, batch, reps,
   gateMin, gateMax }, dimensions, rationale }`.
2. `const kit = createBenchKit(manifest)` -- the manifest is validated FAIL CLOSED.
3. `kit.runLatency(member, opts)` gives the generic D1 distribution + CI + Mann-Whitney;
   `kit.runWitness(opts)` gives the flavor-appropriate witness flatness/ratio.
4. Grow D2..D8 at the marked fill-in points, copying the shape of
   `benchmark/Dimensions.mjs` -- keeping n/a-never-0, the fail-closed dispatch, and
   the anti-vacuity `_check` list.

Repo-only, no version bump, no new npm package.
