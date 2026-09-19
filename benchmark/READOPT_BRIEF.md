# Re-adopt the UPGRADED shared benchmark kit from lite-o1 (repo-only, RECONCILE never fork)

> SCOPE (user, 2026-09-19): after lite-o1 shipped Benchmark v3 (Session A adopt +
> Session B Tier-A) and the witness/docs 1.3.1 wording/witness patch, its SHARED
> benchmark kit (Template/Report/METHODOLOGY + the member-agnostic Matrix machinery)
> gained mechanisms lite-logn's older adopted copy lacks. This session RECONCILES
> lite-logn's benchmark kit against that upgraded shared kit. RECONCILE, NEVER FORK:
> copy the member-agnostic machinery verbatim; re-wire only the per-member data.

```yaml
package: "@zakkster/lite-logn"
version_target: repo-only (NO publish; LogN.js BYTE-IDENTICAL; version stays 0.4.0)
scope: benchmark/ only + test/ gate. No shipped file changes. No card sync.
family: O(log n)  # NOT O(1). The witness is the O(log n) straight-line-on-log-x
                  # witness + an O(n) foil that leaves the line -- NOT O(1) flatness.
members: [BinaryHeap, Fenwick, SegmentTree, SkipList]   # 4, verify against Matrix.SUBJECTS
source_of_truth: /Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteO1/benchmark/
                 # NOTE: lite-o1's witness/docs changes are UNCOMMITTED in its working
                 # tree; copy from the working-tree files on disk (they carry both the
                 # Session B Tier-A AND the 1.3.1 witness/wording mechanisms).
pack_discipline: benchmark/ absent from `npm pack`; results.json + report.html gitignored
```

## THE LOAD-BEARING DISTINCTION (this is the design work)

The upgraded lite-o1 kit is member-agnostic in STRUCTURE but its honesty LABELS are
O(1)-family-specific. lite-logn is O(log n). So:
- Copy VERBATIM the member-agnostic machinery: the report-render ordering/structure,
  the claim-class classifier scaffolding, the per-op witness rendering, the D6/D8
  adjacency layout, the space-time Pareto + cache-tier + spike-attribution Tier-A
  mechanisms -- anything that does not name a member or bake in "O(1)"/"flatness".
- RE-LABEL / RE-WIRE the family-specific parts to lite-logn's honesty contract:
  * The witness is nsPerOp = intercept + slope*log2(n) as a STRAIGHT LINE on log-x
    (the O(log n) Witness, D-02 family gate: R^2 floor + slope band already frozen in
    LogN's own test harness). Do NOT import lite-o1's "flatness"/throughput-invariance
    wording -- that is a different family's witness and would be a dishonesty here.
  * Per-op honesty classes (the OP_CLASS mechanism) must state EACH lite-logn op's real
    class: heap push/pop = O(log n); Fenwick update/query = O(log n); SegmentTree
    update/query = O(log n); SkipList insert/delete/search = O(log n) EXPECTED (not
    worst-case -- randomized). Map every (member x op) to its honest class FIRST as a
    table, then render/assert per the table. Do not paint any op O(1) or worst-case
    where it is amortized/expected.
  * clear()/reuse witness (the CLEAR_WITNESS mechanism): include ONLY members with a
    real clear() invariant -- VERIFY each member's actual surface in LogN.js before
    including it; a member without clear() in the set is a BUG, and an EXCLUDED-with-
    reasons table covers the rest (mirror lite-o1's pattern).
  * The "proof -> witness" wording honesty (three claim classes): timing/complexity/
    constant claims read "witness/empirical/observe"; the deterministic 0-B/op
    allocation claim KEEPS "proven" (torture gate is deterministic); any literature
    citation KEEPS "proven". A blanket find-replace is a BUG the gate must catch.

## WHAT ALREADY EXISTS (read first; do not reinvent)

- lite-logn benchmark/: Template.mjs, Matrix.mjs (SUBJECTS + applicability),
  Dimensions.mjs (per-member fail-closed dispatch), Harness.mjs, Report.mjs,
  METHODOLOGY.md, Bench.mjs -- an EARLIER adoption of the shared kit.
- lite-o1 benchmark/ (source of truth, upgraded): same file names, newer machinery.
  Diff each pair to see exactly what machinery is new vs what is per-member wiring.
- lite-logn's frozen O(log n) witness gate lives in test/ (witness R^2 floor + slope
  band, D-02). The re-adopt must NOT loosen or re-center that gate.
- ADRs in decisions/ record lite-logn's settled calls (NodePool shared allocator,
  spine offer-not-force, six-file pack). Honor them.

## TASKS (planner to atomize)

1. Diff lite-logn kit vs lite-o1 kit file-by-file; classify every delta as (a)
   member-agnostic machinery to copy verbatim, or (b) family/member-specific wiring to
   re-label. Produce the (member x op) honesty table and the clear()-witness membership
   table (with EXCLUDED reasons) as the first artifacts.
2. Adopt the member-agnostic machinery into Template/Report/METHODOLOGY + the
   member-agnostic parts of Matrix, keeping lite-logn's SUBJECTS + applicability.
3. Re-wire Dimensions dispatch for the 4 members for any new dispatch sites the upgraded
   kit introduces; every site fail-closed (throw with a tool-scoped prefix
   [bench]/[template]/[report], NOT [lite-o1]/[lite-logn] mismatch -- match the kit's
   convention), never silent no-op / 0.
4. Apply the proof->witness wording honesty across lite-logn's benchmark/report/
   METHODOLOGY surfaces per the three claim classes.
5. Extend test/ gate: the new mechanisms each assert and BITE for lite-logn's members
   (doc/wording gate, per-op OP_CLASS honesty, clear()-witness membership, D6/D8
   adjacency, Tier-A mechanisms), and every inapplicable cell stays the STRING 'n/a',
   never 0. Do NOT weaken the frozen O(log n) witness gate.

## ASSERTIONS (test/, each must BITE; mutation-verified by qa)

1. The O(log n) witness gate is UNCHANGED (R^2 floor + slope band identical); a mutation
   that imports "flatness"/O(1) witness wording into lite-logn FAILS.
2. Each (member x op) witness carries its honest O(log n)/expected class per the table;
   flattening any op to O(1) or mislabelling SkipList's expected bound as worst-case FAILS.
3. clear()-witness present + asserted for EXACTLY the members with a real clear();
   including a member without clear() FAILS; the witness proves post-clear invariant
   (size 0, zero-alloc, reusable) non-vacuously.
4. proof->witness: timing/complexity/constant claims read witness/empirical; the 0-B/op
   alloc claim still reads "proven"; softening the alloc claim (or hardening a timing
   claim to "proven") FAILS. Doc gate scans ALL benchmark/report/METHODOLOGY surfaces.
5. D6/D8 render adjacent to the witness plot with their real labels; removing either FAILS.
6. Pack: `git diff --quiet LogN.js` (byte-identical); package.json.version === '0.4.0';
   `npm pack --dry-run` lists 0 benchmark/ entries; results.json + report.html gitignored.
7. Any code touched stays zero-alloc on the timed path (torture 0 B/op unchanged).

## NON-GOALS

- NO new members; NO new dimensions; NO Tier-B cross-runtime lanes.
- NO change to LogN.js or any shipped file; NO version bump; NO publish; NO card sync.
- Do NOT fork the shared kit -- reconcile so a future re-adopt stays a diff, not a merge.
- Do NOT touch lite-loglogn (it has no package yet -- separate greenlit effort).

## DONE WHEN

lite-logn's benchmark kit carries the upgraded shared machinery re-labelled to the
O(log n) honesty contract; the 7 assertions pass qa mutation-proof; LogN.js
byte-identical; version 0.4.0; benchmark/ absent from pack; the witness gate unweakened.
