# lite-logn -- PRE-BUILD roadmap

> **NEXT (2026-09-25): H1 hardening -- v1.4.0** (section 8; audit record in RESEARCH.md section 12).
> The 1.3.0 final sweep found 5 High findings the shipped gates pass:
> - Treap `clear()` on a split view corrupts its sibling.
> - PairingHeap / FibonacciHeap recursive walkers overflow the stack (`clear()` can then never
>   recover the heap).
> - LinkCutTree `_pull` and the segment-tree family box at every level on fractional values (a
>   tagged phi into `segGcd`).
> - Every perf / torture input is a small integer.
> lite-hud M5 (Fenwick / SegmentTree / WaveletTree) pins the hardened release.
> Reproduced independently the same day (section 8.1). F1-F11 and F13 hold. F12 (the perf-gate
> flake) did not reproduce. Next-session run order: section 8.2. The accepted 1.4.0 brief is section 8.3, RE-PRIORITIZED in 8.4 (consumers first).
> **1.4.0 SHIPPED (c25188b). 1.4.1 SHIPPED (b45ac49) -- H1 closed, DEFERRED empty.**
> **NEXT: EulerTourTree -- v1.5.0** (section 9; the execution plan is 9.0; research in RESEARCH.md section 13).
> THEN: the demo (its own session).

Seven full BRIEF sessions plus a queued Tier 2/3/4 reserve, all for one package:
`@zakkster/lite-logn`, the zero-GC O(log n) data-structure family (folder
`LiteLogN`, main `LogN.js`). It is the O(log n) sibling of lite-o1 and inherits
its process wholesale.

**How this roadmap is shaped.** It follows the form of `BLUEPRINT_ROADMAP.md`:
a shared-law section, a severity-tagged table of calls to settle, a torture/
witness/perf/bench gate spec, an ASCII session-order graph, and then one
self-contained BRIEF per session -- each a fenced `markdown` block with
frontmatter (package / version_target / status / gc + witness budget / peers /
depends_on / blocks) and PURPOSE / TASKS / ASSERTIONS / HOT PATH / NON-GOALS /
DONE WHEN. It differs from the blueprint in one structural way, and the
difference is the whole point: the blueprint audits three SHIPPED packages and
lists thirty-three REPRODUCED findings. lite-logn has no code, so there are no
findings -- there is nothing to reproduce. Its section 4 is therefore not
"verified findings" but **design calls to settle before code**: the decisions
that outlive one member and must be made on the record, in the same
severity-tagged style.

**This is a PLAN, not a go.** No member is built until you greenlight that
member's session. One member per session, discussion-driven, A+ bar. The
load-bearing design calls come back to YOU to settle BEFORE any code (that is
how you learn the structure -- by making its real decisions). The assistant
never commits, publishes, pushes, or tags; `/release <semver>` is a gate skill
only, run AFTER you publish. Grounded in the enriched RESEARCH.md (design
identity, the O(log n) witness anchor, the roster and its explicit boundary, the
BinaryHeap/Fenwick reference impls) and in the lite-o1 / lite-lru process as
actually run.

> Sibling-coordination note: the suite law is "work on ONE package at a time"
> per session. lite-logn and lite-o1 are separate repos and separate sessions,
> so running them as two learning tracks is fine -- just never edit both in one
> session, and keep the shared substrate decision (NodePool, below) reconciled,
> not forked.

---

## 0. Scope + name correction (do this before anything else)

The published scope is **`@zakkster`** (one `s`). Grepped the whole `LiteLogN/`
tree for `@zakksters` on 2026-09-16: **zero hits** -- the current files are
clean. The blueprint caught a `@zakksters/lite-gc-profiler` devDep typo in a
sibling's briefs; keep grepping for it before you trust any devDep line, because
the scope with the trailing `s` does not exist on the registry (404).

The name and layout are **DECIDED** (RESEARCH.md section 11, user 2026-09-15):

| Field | Value |
| --- | --- |
| npm name | `@zakkster/lite-logn` |
| folder | `LiteLogN` |
| main file | `LogN.js` (single PascalCase) |
| error tag | `[lite-logn]` |
| rejected | `lite-log-n` (npm normalization), `lite-log` (reads as logging) |

**The package is UNPUBLISHED.** It is not on the registry, and `LiteLogN/` is
not a git repository -- only `RESEARCH.md` and `ROADMAP.md` exist today. `git
init` is the first act of the S0 session. There is no prior release to sync
against and no live users to protect; every version below is a first-issue, not
a fix.

---

## 1. Shared law (non-negotiable, every session)

Inherited from the suite CLAUDE.md and lite-o1 / lite-lru, unchanged:

1. **Zero runtime deps. `node:test` only.** ASCII-only source, `U+00D7` and
   `U+00B5` the sole permitted exceptions and lite-logn needs NEITHER -- use
   `->`, `<=`, `x`, `log2`. Grep new files for stray tool-call tags before
   trusting them.
2. **Single PascalCase main file `LogN.js`.** `sideEffects: false`.
   Tree-shakeable named exports, no barrel. One tree-shakeable class per member.
   `llms.txt` + `CHANGELOG.md` per package.
3. **MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. NEVER "Karadjov".**
4. **Fixed, preallocated capacity** (node/element count, not bytes). `null` is
   not zero; an unsized structure is never a zero-capacity one. Fail closed on
   every unverified state.
5. **`typeof`-guard FIRST, before any coercion.** The Symbol/BigInt/`{valueOf}`/
   boxed-Number footgun has bitten multiple packages in this suite; a typeof
   gate at the door of every mutating op makes it impossible here. `-0`, `NaN`,
   `null`, `undefined` are rejected, never silently accepted.
6. **Zero allocation on every steady-state hot path (0 B/op),** proven by
   `node --expose-gc test/torture.mjs` (@zakkster/lite-leak +
   @zakkster/lite-gc-profiler). No gate output is a FAIL. This is the family's
   HARD problem: a naive O(log n) structure does `new Node` per insert, and that
   per-op allocation is a GC pause an engine will not honor -- it turns the clean
   logarithm into jitter. Array-embedded members (heap, Fenwick, segment tree)
   are naturally node-free; pointer-based members (skip list, treap, BST) use the
   pointer-free node pool (parallel `Uint32Array` link columns + free-list,
   `NIL = 0` with slot 0 unused).
7. **Bytes in a hot body, not instructions.** Every guard added below must be
   provably absent from the steady-state hot path -- diff the function, or gate
   it with lite-perf-gate. A validation layer that costs the fast path is a
   rejected design, not a tradeoff.

**The family delta.** lite-o1 proves a FLAT ops/ms line on a log-x axis (the
constant -- slope ~ 0). lite-logn proves a STRAIGHT line on that same log-x axis
(one added level per doubling of `n` -- slope > 0, within a per-member band).
The gate SHAPE differs; the discipline is identical. And one extra clause the
witness forces:

8. **Every gate must be provably able to FAIL.** The witness fit, the perf
   gate, and the torture tiers each ship a deliberately-broken control variant
   (an O(n) foil that must miss the R^2 floor; an allocating op loop that must
   trip the alloc gate). A gate that cannot fail is decoration. The reviewer's
   standing question on every test is "would this test fail if the member were
   broken".

---

## 2. Design calls to settle before code

The findings-analog. Nothing here is a bug in existing code -- there is no
existing code. These are the decisions that must be made on the record, each in
a `decisions/NNNN-*.md` ADR, before or during the session that owns them.
Severity: **S1** = blocks everything or outlives many members; **S2** = shapes
one member; **S3** = scaffolding / hygiene.

| ID | Sev | Design call | Recommended resolution | Settled in |
| --- | --- | --- | --- | --- |
| **D-01** | **S1** | **NodePool ownership.** The pointer-free slot allocator (free-list over parallel `Uint32Array` link columns) is the same primitive as lite-o1's `SlotPool` and lite-arena's Arena. Re-export, depend, or ship a separate general primitive? Forking it three ways is the failure mode. | Decide the DIRECTION before member 1 so the substrate story is coherent; it only BLOCKS pointer-based members (SkipList, Treap), which array-embedded BinaryHeap/Fenwick/SegmentTree do not need. Lean: reconcile against lite-o1's `SlotPool` -- re-export or depend, do NOT fork. | S0 (direction); binding by SkipList v0.4.0 |
| **D-02** | **S1** | **Witness fit thresholds -- the family gate.** What `R^2` floor + slope band + steady-window policy makes a fair, non-flaky "genuinely logarithmic" gate across machines and CI noise? Strict enough to catch a hidden O(n) or a degenerate randomized run, loose enough not to flake on a busy runner. | Calibrate empirically during BinaryHeap (the cleanest witness), record in an ADR, and reuse for every later member. Expect lite-o1's steady-window discipline (ADR-0004 amendment): gate over the steady n-window, SHOW but do not gate the tiny pure-L1 sizes, never widen the floor to hide a flake. | BinaryHeap v0.1.0 |
| **D-03** | **S2** | **Ordered-collection spine reach.** How much of `get`/`has`/`delete`/`min`/`successor`/`rank` is a shared interface before it lies about members that do not fit (a heap has no `successor`; a Fenwick has no `get` in the map sense)? | Offer the spine where honest, force it nowhere. Structure-specific ops (`push`/`popMin`, `update`/`prefix`, `rangeQuery`) extend it. Draw the line at S0 so each member knows what it must and must not implement. | S0 |
| **D-04** | **S2** | **BinaryHeap ordering + arity + value contract.** min vs max vs injected comparator; d-ary `arity` now or as a later preset; numeric key column vs comparator over a key column. | min-heap over a numeric `Float64Array` key column first; comparator and d-ary (`DaryHeap`) as later presets, not member-1 surface. Fixed-capacity fail-closed on overflow (per law 4), NOT a silent grow + amortized resize (which would break the worst-case bound). | BinaryHeap v0.1.0 |
| **D-05** | **S2** | **SegmentTree lazy propagation + fold injection.** Ship lazy range-update now or add it later; how is the associative fold (min/max/sum/gcd) injected without boxing or a per-op allocation? | Point-update + range-query first with the fold chosen at construction (a monomorphic function reference, warmed once); lazy propagation as a labeled follow-up so the first member's witness stays clean. Record the fold-injection shape so it does not become a megamorphic call site. | SegmentTree v0.3.0 |
| **D-06** | **S2** | **First balanced BST: Treap vs Scapegoat.** Randomized-expected (simpler, needs a seeded RNG + a distribution story) vs amortized-deterministic (no RNG, but a real O(n) rebuild spike). | Ship ONE first; possibly both later as the honest "randomized vs deterministic" pair. Defer the choice to the Tier 2 planner run; it does not block Tier 1. Both need the D-01 NodePool decision settled. | Tier 2 (Treap/Scapegoat session) |
| **D-07** | S3 | **Day-1 scaffolding + `files[]` pack discipline.** The repo shape, the six-file `files[]`, the repo-only status of `test/`, `benchmark/`, `decisions/`, `demo/`, and the `/release` pack check that proves it. | Mirror `LiteO1/` exactly (section 3 tree + package.json below). Assert the pack is the six shipped files only in every `/release`. | S0 |

Note what is NOT here: there is no "design the benchmark suite" call and no
"reuse-vs-fork" call. That question is RESOLVED (section 5) -- the suite is
complete and adopted, not designed.

---

## 3. The gate + torture / witness / perf / bench spec

A member is DONE only when ALL of these are green and reported with REAL numbers.
The harness (`test/torture.mjs`, `test/witness.mjs`, `test/perf/`) is stood up in
S0/BinaryHeap and extended by each later member; every gate ships a control that
must fail (law 8).

### 3.1 Day-1 scaffolding (mirror `LiteO1/` exactly)

`git init` first (LiteLogN is not yet a repo). Then:

```
LiteLogN/
  LogN.js              # the single main file; one tree-shakeable class per member
  LogN.d.ts            # ambient TS types, one block per member
  llms.txt             # API surface (exports, per-member signatures, design bounds)
  README.md            # modeled on LiteSepforge/README.md (the blueprint spine)
  GUIDE.md             # "which structure to pick" -- same structure as LiteO1/GUIDE.md
  CHANGELOG.md         # Keep-a-Changelog; one version heading per member release
  LICENSE              # MIT (c) Zahary Shinikchiev
  RESEARCH.md          # already drafted
  ROADMAP.md           # this file
  package.json         # see 3.2
  decisions/           # ADRs, 0001.. -- one per load-bearing call (as LiteO1/decisions)
  test/
    <Member>.test.js         # per-member contract + boundary + fuzz-vs-oracle
    QaAudit.test.js          # cross-member adversarial block (coercion, re-entrancy)
    witness.mjs              # the O(log n) witness harness (repo-only, NOT in files[])
    torture.mjs              # lite-leak + lite-gc-profiler 0-B/op gate (repo-only)
    Bench.test.mjs           # anti-vacuity + fixed-seed determinism gate for benchmark/
    perf/PerfGate.test.mjs   # @zakkster/lite-perf-gate zero-alloc scenarios
    types/logn.test-d.ts     # + types/tsconfig.json
  benchmark/           # the 8-dimension suite, ADOPTED from lite-o1 Bench v2 (section 5)
    Harness.mjs Dimensions.mjs Matrix.mjs Bench.mjs Report.mjs Template.mjs METHODOLOGY.md
  .gitignore           # ignore benchmark/results.json + benchmark/report.html
```

`files[]` ships ONLY
`["LogN.js","LogN.d.ts","llms.txt","README.md","CHANGELOG.md","LICENSE"]` --
exactly lite-o1's shape. `test/`, `benchmark/`, `decisions/`, `demo/` never ship;
the `/release` pack check asserts the six-file tarball. The witness harness and
the benchmark suite are REPO-ONLY dev infra: not in `files[]`, no version bump of
their own, `LogN.js` stays byte-identical when they change. Their value is the
published RESULTS (tables + graphs in README/GUIDE) -- the lite-o1 pattern.

### 3.2 package.json (copy lite-o1's, rename)

```jsonc
{
  "name": "@zakkster/lite-logn",
  "version": "0.1.0",          // bumps one minor per shipped member (0.1.0, 0.2.0, ...)
  "type": "module",
  "main": "./LogN.js",
  "sideEffects": false,
  "exports": { ".": { "types": "./LogN.d.ts", "node": "./LogN.js",
                      "import": "./LogN.js", "default": "./LogN.js" } },
  "files": ["LogN.js","LogN.d.ts","llms.txt","README.md","CHANGELOG.md","LICENSE"],
  "scripts": {
    "test":        "node --test test/*.test.js test/Bench.test.mjs",
    "test:types":  "tsc -p test/types/tsconfig.json",
    "torture":     "node --expose-gc test/torture.mjs",
    "witness":     "node test/witness.mjs",
    "test:perf":   "node --expose-gc --max-semi-space-size=4 --test test/perf/PerfGate.test.mjs",
    "bench":       "node benchmark/Bench.mjs",
    "bench:report":"node benchmark/Bench.mjs && node benchmark/Report.mjs",
    "verify":      "npm test && npm run test:types && npm run torture && npm run witness && npm run test:perf"
  },
  "devDependencies": {
    "@zakkster/lite-gc-profiler": "^1.16.0",
    "@zakkster/lite-leak":        "^1.10.0",
    "@zakkster/lite-perf-gate":   "^1.4.2",
    "esbuild":                    "^0.28.2",   // D5 bundle-size dimension only
    "typescript":                 "^7.0.2"
  }
}
```

The three lite-* dev-deps are the standing gate stack: **lite-leak** (retention)
+ **lite-gc-profiler** (alloc/GC) drive `torture.mjs`; **lite-perf-gate** drives
`test:perf`. `esbuild` is the D5 (bundle + tree-shaking) bencher, dev-only --
zero RUNTIME deps preserved. Grep every devDep for the `@zakksters` typo before
trusting the line (section 0).

### 3.3 The torture gate (`npm run torture`)

`0 B/op` on every hot path for the new member AND every prior member still
`0 B/op`; `gc major = 0`; leak tracker `size 0/0`; arrayBuffers no growth. Tiers,
shared shape across members, built once and extended per member:

- **T0 -- laws.** Metamorphic properties over the fuzz corpus: heap `pop`
  returns keys in nondecreasing order; Fenwick `prefix` is monotone under
  nonnegative `update`; `rangeSum(lo,hi) === prefix(hi) - prefix(lo-1)`; ordered
  members' iteration is sorted; `size`/`capacity` invariants hold after every op.
- **T1 -- degenerate values.** Every op crossed with the coercion corpus
  (Symbol, BigInt, `{valueOf}`, boxed Number, `NaN`, `null`, `undefined`, `-0`,
  `+/-Infinity`, subnormals) -- each rejected typeof-first with `[lite-logn]` and
  a byte-identical no-op state. Capacity=1, full, empty, single-element,
  non-power-of-two sizes.
- **T2 -- adversarial sequences.** Sorted / reverse-sorted / duplicate-heavy /
  spiral insertion orders (where an unbalanced structure or an unlucky seed
  degenerates); fill to exactly capacity, then one past (fail closed); re-entrancy
  (mutating from inside `forEach`/iterator must not corrupt the walk).
- **T5 -- differential fuzz vs a brute-force oracle.** `>= 1e5..1e6` mixed ops
  against a plain sorted array / naive reference; compare results every op; on
  divergence print the seed + op index for a one-env-var replay.
- **T6 -- the zero-alloc gate.** lite-gc-profiler `measureOps` with
  `stabilize: 'deep'` and `maxArrayBuffersGrowth: 0` -- the rule that catches a
  typed-array backing-store grow a heap gate cannot see (the profiler documents a
  152x ArrayBuffer blind spot). Plus direct structural equality: the backing
  buffer `byteLength` is identical before and after a hot-op loop.
- **T7 -- soak + conservation.** `leak_cycles: 4096` build-up / tear-down;
  after each cycle `size === 0`, and for pointer members `activeSlots +
  freeListLength === capacity`. Sample the heap ACROSS cycles, not within one.
- **T9 -- controls.** Every gate above, deliberately broken, must exit non-zero
  (an allocating op loop; a corrupted oracle; a member with its sift/balance
  disabled on the adversarial sequence).

lite-gc-profiler constraint: ONE measurement at a time (`measureOps` throws
"already in flight" if nested) -- tiers run sequentially, never nested. Never
resolve an unexpected `inconclusive` with `allowInconclusive`; triage it.

### 3.4 The witness gate (`npm run witness`) -- the family anchor

The O(log n) witness (RESEARCH.md section 2). Time a fixed batch of the hot op at
each `n` in a geometric sweep (`1e3 .. 1e7`), fit `nsPerOp = intercept + slope *
log2(n)` by least squares, and gate:

- `R^2 >= floor` (a straight line fits -- genuinely logarithmic), AND
- `slope` inside the member's band (the per-level cost, ns/level), AND
- the FOIL leaves the line (low `R^2` -- the O(n) default a working programmer
  reaches for, shown losing as `n` grows).

Report `R^2`, `slope`, and the foil's departure. For amortized/randomized members
(SortedArray rebuild, Scapegoat rebuild, SkipList/Treap unlucky seed) print the
**MAX single-op time** -- the honesty hook: a rebuild spike or a degenerate tail
shows as a tall bar even when the mean still fits the line. The floor + band are
D-02, calibrated in BinaryHeap and recorded in an ADR. The witness is an OFFLINE
proof tool, never a hot-path dependency.

### 3.5 The perf gate (`npm run test:perf`)

lite-perf-gate zero-alloc scenarios for each hot op, an isolated
`forEach`/iterate alloc-free scenario, and a must-fail teeth case (an op that
allocates on purpose, asserted to trip the gate).

### 3.6 The benchmark suite -- ADOPT lite-o1 Bench v2 (do NOT reinvent)

**RESOLVED (user, 2026-09-16), RESEARCH.md sections 3, 10, 11.** The
eight-dimension benchmark suite is COMPLETE. lite-o1 shipped it as **Bench v2**
-- the full-rigor blueprint (strong baselines + bootstrap CI + Mann-Whitney +
overhead-subtraction + a load-factor curve) with a **`Template.mjs` and a
`METHODOLOGY.md` written expressly for the siblings to copy**. lite-logn
**ADOPTS** it wholesale: port the harness, the child-process-per-cell
orchestrator, the honesty header (seed/node/arch/date), the vacuity gate (emit
the string `"n/a"`, never a numeric 0), the `traceHash` determinism, and the
hand-rolled zero-dep inline-SVG report renderer VERBATIM. Swap in ONLY the two
things that are genuinely O(log n)-specific:

1. dimension 1's witness FIT (log-linear `R^2` + slope vs `log2(n)`, section 3.4)
   in place of lite-o1's flatness check, and
2. the ordered FOILS -- sorted-array-insert for heaps, sorted-array-with-binary-
   search for ordered maps, naive re-sum/rebuild for Fenwick/SegmentTree, and the
   O(1)-but-UNORDERED `Map`/`Set` counter-foil (the log factor is the honest
   price of order).

There is NO "design the benchmark suite" session and NO reuse-vs-fork open
question. The dedicated benchmark session below is a **COPY-AND-WIRE** session
(port + per-member dimension kernels), not a rebuild. Anywhere an older plan said
"design/build the suite" or "reuse vs fork", it is wrong -- the suite exists.

### 3.7 The byte-identical invariant

Prior members stay BYTE-IDENTICAL when a new member lands: `git diff LogN.js`
shows only the header comment, the `VERSION` const, and a pure append. Bump the
prior members' `VERSION` test assertions and nothing else inside their class
bodies. The reviewer checks this on every diff before qa.

---

## 4. Session order

```
                D-01 NodePool direction
                D-03 spine reach
                          |
                          v
S0 (settle) --> BinaryHeap --> Fenwick --> SegmentTree --> SkipList --> Demo --> Benchmark-ADOPT --> Tier 2 ...
  v0.1.0 sets   v0.1.0        v0.2.0       v0.3.0          v0.4.0      (>=3-4    (>=3-4 members;    Treap/Scapegoat,
  the gates     D-02 witness               D-05 lazy?      needs        members)  copy + wire,      OrderStatTree,
                thresholds                                 D-01 bound             NOT a rebuild)    IndexedHeap,
                (family gate) D-04 arity                                                            SortedArray,
                                                                                                    MinMaxHeap, SplayTree
```

What blocks what:

- **BinaryHeap brings up the gates** (logWitness harness + torture + perf) and
  settles **D-02**, the witness `R^2` floor + slope band. Once recorded, that
  becomes the FAMILY gate every later member is measured against -- so BinaryHeap
  is load-bearing beyond its own release.
- **D-01 (NodePool) blocks SkipList and every Tier 2 pointer-based member**
  (Treap/Scapegoat, OrderStatTree, SplayTree). It does NOT block the
  array-embedded Tier 1 members (BinaryHeap/Fenwick/SegmentTree). Decide the
  DIRECTION in S0; bind it no later than the SkipList session.
- **Demo needs 3-4 members** so the witness comparison has range; the benchmark
  session likewise (its sweep needs range). Both are their own sessions.
- Tier 2 members are one-per-session and independent of each other; sequence them
  by usefulness, not dependency.

---

## 5. The briefs

===============================================================================
# S0 -- lite-logn (pre-release) -- settle the substrate, the gates, the spine
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: pre-0.1.0 (no publish; scaffolding + decisions only)
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: harness stub only; thresholds settled in BinaryHeap (D-02)
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [D-01, D-03, D-07]
blocks: [BinaryHeap]
---

# lite-logn -- stand up the repo and settle what outlives member 1

PURPOSE
  Nothing is built and LiteLogN is not a git repo. Before member 1, put the
  scaffolding in place and settle the three calls that would be expensive to
  reverse once a member depends on them: the NodePool direction, the spine
  reach, and the pack discipline. No published member ships from this session.

TASKS
  - `git init`. Create the section 3.1 tree; copy lite-o1's package.json and
    rename (section 3.2). Grep every devDep for `@zakksters` (the 404 scope).
  - Stub LogN.js (header + VERSION const, no member yet), LogN.d.ts, llms.txt,
    README skeleton (LiteSepforge spine), GUIDE skeleton (LiteO1/GUIDE.md
    shape), CHANGELOG, LICENSE (MIT (c) Zahary Shinikchiev -- NEVER "Karadjov").
  - Stub test/torture.mjs, test/witness.mjs, test/perf/PerfGate.test.mjs,
    test/Bench.test.mjs, test/types/tsconfig.json as empty-but-runnable
    harnesses the BinaryHeap session fills.
  - **D-01 (S1): decide the NodePool DIRECTION** and record it in
    decisions/0001-nodepool.md: re-export lite-o1 SlotPool, depend on lite-arena,
    or ship a separate general primitive. Lean: reconcile against SlotPool, do
    NOT fork. It only needs BINDING by SkipList v0.4.0, but the direction must be
    coherent now so the array-embedded members do not paint the substrate into a
    corner.
  - **D-03 (S2): draw the ordered-collection spine reach** in
    decisions/0002-spine.md: which of get/has/delete/min/successor/rank is a
    shared interface, and where each member honestly opts out (a heap has no
    successor; a Fenwick has no get). Offer where honest, force nowhere.
  - **D-07 (S3): pin the pack discipline.** files[] = the six shipped files;
    assert test/ benchmark/ decisions/ demo/ never ship, wired into the
    /release pack check.

ASSERTIONS
  - `git status` clean after the initial scaffold commit (USER commits).
  - `npm test`, `npm run torture`, `npm run witness`, `npm run test:perf` all
    run to a green no-op (empty harnesses, exit 0).
  - `npm pack --dry-run` lists exactly the six files[].
  - decisions/0001 and 0002 exist and state a resolution with a rationale.
  - Grep proves zero `@zakksters` and zero stray tool-call tags in new files.

HOT PATH
  None -- no member exists yet. The harnesses must themselves be alloc-free
  shells so BinaryHeap inherits a clean baseline.

NON-GOALS
  No member. No publish. No witness thresholds (that is BinaryHeap/D-02). No
  benchmark port (that is its own later session). No NodePool IMPLEMENTATION --
  only the direction on the record.

DONE WHEN
  repo initialized; scaffolding runs green empty; D-01 direction + D-03 spine +
  D-07 pack discipline recorded in ADRs
```

===============================================================================
# BinaryHeap -- lite-logn v0.1.0 -- the headline + the family gates
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: 0.1.0
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: SETTLE R^2 floor + slope band here (D-02) -- becomes the family gate
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [D-02, D-04]
depends_on: [S0]
blocks: [Fenwick, SegmentTree, SkipList, Demo, Benchmark]
---

# lite-logn -- BinaryHeap: array-embedded O(log n), and the witness it calibrates

PURPOSE
  The headline and the reference member. An array-embedded complete binary
  min-heap (RESEARCH.md section 7): sift-up/sift-down over a flat Float64Array,
  children at 2i+1 / 2i+2, no nodes, nothing allocated per op, peek O(1),
  push/pop O(log n) worst-case. The cleanest witness in the family -- so this is
  where the witness harness is brought up and its thresholds (D-02) are
  calibrated into the FAMILY gate every later member inherits.

DESIGN CALLS TO SETTLE (before code)
  - **D-04 ordering**: min vs max vs injected comparator. Lean: min-heap over a
    numeric key column first; comparator + d-ary (`DaryHeap`) are later presets.
  - **D-04 arity**: d-ary `arity` now or as a later BinaryHeap preset. Lean:
    later preset -- keep member 1's witness clean.
  - **D-04 capacity**: fixed-capacity fail-closed vs opt-in grow. Lean:
    fail-closed (law 4) -- a silent grow + amortized resize would break the
    worst-case bound the witness is about to prove.
  - **D-04 value contract**: numeric key column now; comparator over a key
    column is a later preset. Record it so pop's return type is decided.
  - **D-02 witness thresholds**: run the sweep, pick the `R^2` floor + slope band
    + steady-window policy empirically, record in decisions/0003-witness.md.

TASKS
  - Implement BinaryHeap in LogN.js (append-only; VERSION -> 0.1.0). typeof-guard
    keys FIRST; reject NaN/non-number with `[lite-logn]`; empty pop -> undefined,
    never a stale slot; full push -> throw, fail closed.
  - Fill test/witness.mjs: BinaryHeap push/pop vs the sorted-array-insert foil
    (O(n) shift). Report R^2, slope (ns/level), foil departure, MAX single-op.
  - Fill test/torture.mjs tiers T0/T1/T2/T5/T6/T7/T9 for the heap.
  - Fill test/perf/PerfGate.test.mjs: push/pop/peek zero-alloc + teeth.
  - test/BinaryHeap.test.js (contract + boundary + >=1e5 fuzz vs a sorted-array
    oracle, 0 divergences) + QaAudit coercion block.
  - LogN.d.ts + test/types/logn.test-d.ts; llms.txt, README member section,
    GUIDE member section, CHANGELOG 0.1.0, decisions/0003-witness.md.

ASSERTIONS
  - pop returns keys in nondecreasing order over the full fuzz corpus.
  - Witness: R^2 >= the recorded floor AND slope in band across 1e3..1e7; the
    sorted-array foil misses the floor (its curve leaves the line).
  - torture "ok": 0 B/op push/pop/peek; T9 controls (allocating loop; a heap with
    sift-down disabled on the adversarial sweep) each exit non-zero.
  - test:perf green; teeth case trips the gate.
  - Symbol/BigInt/{valueOf}/boxed-Number/NaN keys each throw typeof-first with a
    byte-identical no-op state.
  - `npm run verify` green; `npm pack --dry-run` = the six files.

HOT PATH
  push/pop are one root-to-leaf path of `<=` compares + swaps, zero allocation.
  Any comparator/d-ary support must NOT add a branch to the default numeric
  min-heap body -- presets are parallel code, measured separately.

NON-GOALS
  No comparator, no d-ary, no decrease-key (that is IndexedHeap, Tier 2). No
  node pool (array-embedded needs none). No benchmark suite yet.

DONE WHEN
  BinaryHeap shipped; witness thresholds recorded and passing; the four D-04
  calls recorded; all gates green with real R^2/slope/foil numbers
```

===============================================================================
# Fenwick -- lite-logn v0.2.0 -- the trick worth teaching
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: 0.2.0
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: inherit the D-02 family gate; TWO log lines (update + prefix)
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
depends_on: [BinaryHeap]
---

# lite-logn -- Fenwick (BIT): point-update AND prefix-sum both O(log n)

PURPOSE
  The member whose Big-O is most delightfully non-obvious (RESEARCH.md section
  8): BOTH point-update and prefix-query in O(log n) over a single flat array,
  using nothing but the lowest-set-bit walk (`i & -i`). Naturally zero-GC, no
  nodes. "How can update AND query both be logarithmic on a plain array?" is
  exactly the claim a reader should demand proof of -- and the witness answers
  with TWO straight log lines.

TASKS
  - Implement Fenwick in LogN.js (append-only; VERSION -> 0.2.0; prior member
    byte-identical). 1-based internally, `_t[0]` the unused identity sentinel
    (null is not zero here either). update/prefix walk by `i & -i`; rangeSum is
    two prefix queries. Bounds-check indices; typeof-guard delta FIRST.
  - Witness: BOTH update and prefix, each vs its naive foil (re-sum = O(n) query;
    prefix-array rebuild = O(n) update). The demo is the member holding both on
    the log line while each foil curves off on one.
  - torture tiers for both ops; perf gate for both; contract + boundary +
    fuzz-vs-naive-array-oracle; QaAudit coercion block.
  - llms.txt, README + GUIDE member sections, CHANGELOG 0.2.0, ADR if any call.

ASSERTIONS
  - rangeSum(lo,hi) === prefix(hi) - prefix(lo-1) over the fuzz corpus; prefix
    monotone under nonnegative update.
  - BOTH update and prefix pass the family witness gate; both naive foils miss
    the floor (each on its own axis).
  - torture "ok": 0 B/op update/prefix/rangeSum; prior member still 0 B/op; T9
    controls fail.
  - Out-of-range index throws; NaN/non-number delta throws typeof-first, no-op.
  - `npm run verify` green; pack = six files.

HOT PATH
  update/prefix are `<= log2(n)` typed-array reads/writes stepping by `i & -i`,
  zero allocation. No object, no closure per op.

NON-GOALS
  No 2D (Fenwick2D is a Tier 3 preset). No order-statistics-by-value member yet
  (that boundary is OrderStatTree, Tier 2). No SegmentTree generality.

DONE WHEN
  Fenwick shipped; two log lines proven; both foils leave their line; all gates
  green; BinaryHeap byte-identical
```

===============================================================================
# SegmentTree -- lite-logn v0.3.0 -- the range-query workhorse
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: 0.3.0
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: inherit the D-02 family gate (rangeQuery + pointUpdate)
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [D-05]
depends_on: [Fenwick]
---

# lite-logn -- SegmentTree: general associative range query + point update

PURPOSE
  More general than Fenwick (RESEARCH.md section 4): arbitrary associative fold
  (min/max/sum/gcd) range-query + point update over a flat, array-embedded tree,
  O(log n) worst-case. The range workhorse. The teaching contrast with Fenwick
  is "pay a little more, get any associative fold and true range queries".

DESIGN CALLS TO SETTLE (before code)
  - **D-05 lazy propagation**: ship lazy range-update now, or point-update +
    range-query first with lazy as a labeled follow-up? Lean: point-update first
    so the first witness is clean; lazy is a later addition.
  - **D-05 fold injection**: how is the associative fold chosen without a
    megamorphic call site or a per-op allocation? Lean: fold chosen at
    construction as a monomorphic function reference, warmed once; record the
    shape in an ADR so it does not deopt the hot path.

TASKS
  - Implement SegmentTree in LogN.js (append-only; VERSION -> 0.3.0; prior
    members byte-identical). Array-embedded; identity element per fold; bounds-
    checked ranges; typeof-guard values FIRST.
  - Witness: rangeQuery + pointUpdate vs the naive foils (O(n) scan for the
    query; whichever axis the foil loses).
  - torture / perf / contract / boundary / fuzz-vs-naive-oracle / QaAudit as
    standard. If lazy lands, its own witness line + oracle.
  - llms.txt, README + GUIDE sections, CHANGELOG 0.3.0, decisions/NNNN-segtree.md
    recording the D-05 calls.

ASSERTIONS
  - rangeQuery matches the naive O(n) fold over the fuzz corpus for every
    supported fold; pointUpdate then query is consistent.
  - Both ops pass the family witness gate; foils leave the line.
  - torture "ok": 0 B/op; the injected fold adds no per-op allocation (proven,
    not assumed); prior members still 0 B/op; T9 controls fail.
  - `npm run verify` green; pack = six files.

HOT PATH
  rangeQuery/pointUpdate are one root-to-leaf descent of monomorphic fold calls,
  zero allocation. The fold reference is resolved once at construction, never per
  op.

NON-GOALS
  No persistent/versioned variant (PersistentSegTree is Tier 4). No merge-sort-
  tree augmentation (Tier 4). Lazy propagation only if D-05 says now.

DONE WHEN
  SegmentTree shipped; fold injection proven alloc-free; range query oracle-
  clean; D-05 recorded; all gates green; prior members byte-identical
```

===============================================================================
# SkipList -- lite-logn v0.4.0 -- the node-pool showcase + randomized hero
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: 0.4.0
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: inherit the D-02 family gate; EXPECTED O(log n) -- MAX single-op printed
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [D-01 (bind)]
depends_on: [SegmentTree]
blocks: [Treap/Scapegoat and every Tier 2 pointer-based member]
---

# lite-logn -- SkipList: the ordered map, pointer-free, expected O(log n)

PURPOSE
  The ordered map/set (get/set/delete/successor/rangeIter) and the pointer-free
  NODE-POOL showcase: per-level `Uint32Array` `next` columns over the NodePool,
  no `new Node`, nothing allocated per insert. Expected O(log n) (randomized) --
  the family's randomized-honesty hero: deterministic seed, tail reported,
  adversarial input documented. This is the member that BINDS D-01, so the
  NodePool direction from S0 must become a real implementation here.

DESIGN CALLS TO SETTLE (before code)
  - **D-01 bind**: implement the NodePool per the S0 direction -- re-export
    lite-o1 SlotPool, depend on lite-arena, or the separate primitive. Reconcile,
    do NOT fork. This is the single most consequential cross-package call and it
    stops being deferrable here.
  - Level-generation PRNG: use the repo's Numerical Recipes LCG
    `seed = (seed*1664525 + 1013904223) >>> 0`, instance-local seed, never module
    state. Do NOT introduce a new PRNG.

TASKS
  - Implement NodePool substrate + SkipList in LogN.js (append-only; VERSION ->
    0.4.0; prior members byte-identical). NIL = 0, slot 0 unused. Fixed capacity,
    fail closed. typeof-guard keys FIRST; empty query -> undefined.
  - Witness: mixed insert+query trace vs a sorted-array foil (search O(log n) for
    both, but insert O(n) for the array). Print MAX single-op (the unlucky-seed
    tail) -- an expected member must never masquerade as worst-case.
  - Statistical test (RESEARCH.md section 6, lite-o1 RandomSet template): a
    DETERMINISTIC, non-flaky level-distribution assertion (fixed seed -> count
    bands + a chi-square bound with the CORRECT degrees of freedom). Never loosen
    it into vacuity. Determinism: fixed seed -> identical sequence; different seed
    diverges.
  - torture / perf / contract / boundary / fuzz-vs-sorted-array-oracle / QaAudit,
    plus re-entrancy (mutating from inside the iterator must not corrupt the walk).
  - llms.txt, README + GUIDE sections, CHANGELOG 0.4.0, decisions ADR for the
    bound NodePool + the randomized-honesty note.

ASSERTIONS
  - Ordered iteration is sorted; get/set/delete/successor match the sorted-array
    oracle over >=1e5 mixed ops, 0 divergences.
  - Witness passes the family gate on the mixed trace; the sorted-array foil
    leaves the line on insert; the MAX single-op bar is reported.
  - Level distribution matches expectation within the chi-square bound (correct
    df label); fixed seed reproduces exactly.
  - torture "ok": 0 B/op get/set/delete via the NodePool; conservation
    `activeSlots + freeListLength === capacity` after every soak cycle; prior
    members still 0 B/op; T9 controls fail.
  - `npm run verify` green; pack = six files.

HOT PATH
  Search descends express lanes reading `Uint32Array` `next` columns; insert
  allocates a slot from the free list (an index, not an object) -- zero heap
  allocation. Level generation is one LCG step, no array.

NON-GOALS
  No balanced BST (Treap/Scapegoat are Tier 2). No forking the allocator. No
  worst-case guarantee -- this member is expected O(log n) and says so loudly.

DONE WHEN
  SkipList shipped; NodePool bound (not forked); randomized honesty proven
  (deterministic seed, tail reported, distribution gated); all gates green; prior
  members byte-identical
```

===============================================================================
# Demo -- lite-logn (repo-only) -- the witness line vs the departing foil
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: repo-only (no publish; LogN.js byte-identical; no version bump)
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: the demo RENDERS the witness; the gate is unchanged
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak"]
depends_on: [SkipList]   # needs 3-4 members so the witness comparison has range
---

# lite-logn -- the five-file demo (as lite-lru / lite-o1)

PURPOSE
  A repo-only dev artifact, never shipped, modeled beat-for-beat on lite-lru's
  and lite-o1's demos (RESEARCH.md section 9). One shared seeded op-stream fed to
  every member side by side; each panel drawn STRICTLY from that member's live
  `dump()`/`inspect()` snapshot -- no shadow state. The headline stat is the
  O(log n) witness: each panel shows a live ns/op + log-linear fit, the member's
  point staying ON the straight line while a second lane runs its FOIL (the O(n)
  default) and visibly leaves it. Straight-log-line-vs-departing-foil is the
  demo's whole point.

TASKS
  - Five-file architecture: Visualize.mjs (headless engine, imports only LogN.js;
    Node-main prints a per-member ns/op + fit table), renderers.mjs (pure, one
    renderer per member, each declares its snapshot `fields` + a `model(snap)`
    the test deep-equals against `dump()`), serve.mjs (zero-dep http; computes
    the seeded op-stream + foil timings; serves statics), visuals.html (dark
    terminal-green; one canvas panel per member; controls: structure / workload /
    seed / n / play / step / speed), Demo.test.mjs (model==dump, renderer teeth,
    determinism, zero-alloc engine step, leak-free build/run/reset, fail-closed
    serve + fetch matrix).
  - Each panel draws the STRUCTURE from its snapshot: BinaryHeap tree levels +
    sift path; Fenwick/SegmentTree cells + the `i & -i` / range-fold touch path;
    SkipList express lanes + the descending search.
  - Render the honesty caveat: for randomized/amortized members the panel also
    shows the MAX single-op bar (section 5); a seed control lets the viewer watch
    a randomized member's tail move.
  - Load the demo-audit skill: no forced reflow / no per-frame allocation in the
    render loop (the frame killer the GC torture harness cannot see).

ASSERTIONS
  - Every renderer's `model(snap)` deep-equals the member's `dump()` (no shadow
    state); renderer teeth: a corrupted snapshot fails the model check.
  - Engine step is zero-alloc; build/run/reset leak-free.
  - Determinism: same seed -> same op-stream -> same frames.
  - `LogN.js` byte-identical (git diff empty); demo/ absent from pack.

HOT PATH
  The engine step must be alloc-free (it runs per frame). The witness readings
  are computed off the shipped `logWitness`, not a demo re-implementation.

NON-GOALS
  No build/insertion animation yet (a later session, as with lite-filter/
  lite-o1). No shipping any demo file. No LogN.js change.

DONE WHEN
  five-file demo runs the shared op-stream; every panel drawn from dump(); the
  witness line vs the departing foil is visible; MAX-single-op bar shown for
  randomized/amortized members; LogN.js untouched
```

===============================================================================
# Benchmark -- lite-logn (repo-only) -- ADOPT lite-o1 Bench v2 (copy + wire)
===============================================================================

```markdown
---
package: "@zakkster/lite-logn"
version_target: repo-only (no publish; LogN.js byte-identical; no version bump)
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0
leak_cycles: 4096
witness_gate: the benchmark's dimension 1 IS the witness fit (R^2 + slope)
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak"]
depends_on: [SkipList]   # needs 3-4 members so the sweep has range
---

# lite-logn -- port the completed eight-dimension suite, do NOT rebuild it

PURPOSE
  The benchmark suite is COMPLETE (section 3.6; RESEARCH.md sections 3, 10, 11).
  lite-o1 shipped it as Bench v2 with a Template.mjs + METHODOLOGY.md written
  expressly for the siblings to copy. This session PORTS that framework and
  WIRES in the lite-logn members. It is NOT a design session and there is NO
  reuse-vs-fork question -- that call is already resolved.

TASKS
  - Copy VERBATIM from lite-o1's Bench v2: Harness.mjs, the child-process-per-
    cell orchestrator, the honesty header (seed/node/arch/date), the vacuity gate
    (emit the string "n/a", never numeric 0), traceHash determinism, the
    hand-rolled zero-dep inline-SVG Report renderer, and Template.mjs +
    METHODOLOGY.md.
  - Swap in ONLY the two O(log n)-specific pieces:
      1. dimension 1 = the witness FIT (log-linear R^2 + slope vs log2(n),
         section 3.4) in place of lite-o1's flatness check;
      2. the ordered FOILS -- sorted-array-insert for heaps, sorted-array-binary-
         search for ordered maps, naive re-sum/rebuild for Fenwick/SegmentTree,
         and the O(1)-but-UNORDERED Map/Set counter-foil.
  - Wire each shipped member's kernels into Matrix.mjs + Dimensions.mjs across all
    eight dimensions (D1 witness fit; D2 amortized drift; D3 memory; D4 cache
    proxy, portable, no hardware counters; D5 bundle min+gzip + tree-shaking via
    esbuild; D6 GC/alloc-rate curve; D7 key-types x load-factors x insertion
    order incl. ADVERSARIAL; D8 workload micro-benches).
  - Update test/Bench.test.mjs: anti-vacuity + fixed-seed determinism gate; the
    per-member cell counts.
  - Publish the RESULTS into README/GUIDE (tables + the inline-SVG graphs).

ASSERTIONS
  - test/Bench.test.mjs green: every applicable cell is numeric, every
    inapplicable cell is the string "n/a" (never 0); fixed seed reproduces
    traceHash.
  - Dimension 1 reports R^2 + slope per member and the foil's departure.
  - The suite files are absent from `npm pack --dry-run` (repo-only).
  - `LogN.js` byte-identical (git diff empty).

HOT PATH
  N/A -- offline dev infra. The suite must not import anything but LogN.js from
  the package (zero runtime deps preserved).

NON-GOALS
  No new dimensions. No rebuilt harness. No LogN.js change. No published member.

DONE WHEN
  Bench v2 ported verbatim; witness fit + ordered foils wired; all members
  bench across eight dimensions; vacuity + determinism gate green; results in
  README/GUIDE; LogN.js untouched
```

### Queued -- Tier 2 (one full brief each at greenlight; NOT expanded here)

Each is its own session, one-per-session, sequenced by usefulness. Same
frontmatter budget as every brief above (gc_maxMajor:0, gc_maxPauseMs:4,
alloc_bytes_per_op:0, leak_cycles:4096, inherit the D-02 witness gate; peers =
lite-gc-profiler + lite-leak + lite-perf-gate, dev-only). Pointer-based members
depend on the D-01 NodePool being bound (SkipList).

- **Treap OR Scapegoat (v0.5.0)** -- the first balanced BST and the D-06 call:
  randomized-expected (Treap; seeded RNG + distribution story) vs amortized-
  deterministic (Scapegoat; no RNG, real O(n) rebuild spike). Ship one first,
  possibly both later as the honest "randomized vs deterministic" pair. A
  split/merge core a later OrderStatTree / IntervalTree can reuse. NodePool.
- **OrderStatTree (v0.6.0)** -- select(k) / rank(x) in O(log n). Either an
  augmented Treap/Scapegoat (subtree-size column) or a Fenwick-over-value-domain;
  STATE the boundary between the two rather than shipping both blindly.
- **IndexedHeap (v0.7.0)** -- BinaryHeap + a handle->position map so
  decreaseKey/remove are O(log n): what Dijkstra/A* actually need and a plain
  heap cannot do. Possibly Tier 1.5 given how often it is the real requirement.
- **SortedArray (v0.8.0)** -- the AMORTIZED member: search O(log n), insert O(n)
  worst-case stated up front; the witness MAX bar shows the rebuild spike. Best
  when reads dominate writes.
- **MinMaxHeap (v0.9.0)** -- double-ended PQ in ONE array-embedded heap
  (alternating min/max levels, Atkinson et al. 1986): both extremes in O(log n),
  no second structure. Naturally node-free; a clean second heap-family witness.
- **SplayTree (v0.8.0)** -- self-adjusting BST, amortized O(log n), the working-
  set specialist and the honest amortized-with-a-real-single-op-spike hero.
  Deterministic (no RNG). NodePool.

### Queued -- Tier 3 (presets + substrate; one line each, fold in when earned)

- **DaryHeap** -- a `BinaryHeap({arity:d})` PRESET, not a separate class.
- **Fenwick2D** -- the Fenwick trick in 2D, a flat-array PRESET of Fenwick.
- **NodePool** -- the shared pointer-free allocator; substrate, reconciled with
  lite-o1 SlotPool (D-01), not a headline member.
- **WeightBalanced (BB[alpha])** -- balance by subtree size, order-statistics
  free; a strong OrderStatTree substrate.
- **The mergeable-heap family** -- BinomialHeap (worst-case meld) -> PairingHeap
  (practical, delicate amortized decreaseKey) -> FibonacciHeap (textbook
  Dijkstra/Prim optimum, routed HERE from lite-o1 as amortized-log). Build in
  that worst-case -> practical -> optimal progression, each with the witness + its
  honest caveat, only when a real melding use case names it.
- **IntervalTree** -- augmented BST for overlap queries (O(log n + k)); a Treap-
  core specialization if it lands.

### Queued -- Tier 4 (exotic golden-niche reserve; build ONLY when a use case names it)

Each a dedicated future member, shipped with the witness AND its honest caveat
(the `+k`, the `log^2`, the O(w), or the amortized single-op spike):
PersistentSegTree (fully persistent, O(n log n) space), MergeSortTree (static,
O(log^2 n) query), WaveletTree (rank/select/quantile, O(log sigma)), LinkCutTree
(dynamic forests, amortized), EulerTourTree (dynamic connectivity, unrooted),
CartesianTree (RMQ-via-LCA, a lite-o1 SparseTable cross-link), XorTrie (max-XOR,
O(w) = O(log U), on the lite-loglogn boundary). These are the reserve, not the
near-term queue.

---

## 6. Cross-package boundaries (state them in the README, do not re-implement)

- **lite-o1** -- the O(1) sibling and the intended pair. lite-o1 holds the
  constant; lite-logn holds the logarithm. Any BOUNDED-INTEGER priority queue is
  O(1) and belongs there (Dial's bucket queue); lite-logn's heap is the GENERAL
  comparator PQ at O(log n). Cross-link heavily; keep the witnesses kin (flat
  line vs straight-log line).
- **NodePool / lite-o1 SlotPool / lite-arena** -- ONE free-list slot allocator
  across the suite (D-01). Re-export or depend; reconcile ownership before the
  first pointer-based member. Do NOT fork.
- **lite-scheduler `FastBitScheduler`** -- an O(1) 32-tier bucket queue for small
  INTEGER priorities. The README must send small-integer-priority users there,
  not to a heap.
- **lite-filter** owns approximate/probabilistic membership; **lite-logn** owns
  exact ordered structures. No overlap.
- **lite-lru** uses ordering internally for eviction but is a cache, not an
  ordered-collection library; cross-link only.

---

## 7. How to run it

In order. `status: planned -> shipped` after each `/release`. Per member:
**planner** (spec + atomic tasks + falsifiable assertions + the load-bearing
design calls, each with a recommendation) -> **settle the design calls WITH the
user** before any code -> **coder -> reviewer -> qa** + the torture / witness /
perf / bench gates. Reviewer REJECTED goes back to the coder, NOT forward (turn
limits, resume via SendMessage not a fresh Agent: coder 40, reviewer 15, qa 30).
Then YOU commit / publish / tag; then `/release <semver>` as a gate pass; then
sync the catalog card (`~/LiteCatalog/catalog/lite-logn.md` + `_index.md`, first
created on the 0.1.0 release). The assistant never commits, publishes, pushes, or
tags.

The gc + leak frontmatter budget is IDENTICAL on every brief -- `gc_maxMajor:0`,
`gc_maxPauseMs:4`, `alloc_bytes_per_op:0`, `leak_cycles:4096` -- because the
family has exactly one identity: zero allocation and a provable logarithm.
Neither number ever moves. The only per-brief variable is the witness slope band
(the per-level cost differs per member); the R^2 floor is the shared family gate
(D-02).

### If you only do a subset

1. **S0 first, regardless.** Everything leans on one repo, one torture command,
   one witness harness, and three settled calls (NodePool direction, spine reach,
   pack discipline). It publishes nothing, so it is cheap and unblocks all.
2. **BinaryHeap first among members.** It is the headline, it brings up the
   witness / torture / perf gates, and it CALIBRATES the witness thresholds (D-02)
   that become the family gate every later member inherits. Nothing else can be
   measured honestly until it lands.
3. **Fenwick second.** It is the trick worth teaching -- two straight log lines
   on a plain array from the `i & -i` walk -- and the most convincing single
   demonstration that the family's claim is real, not asserted.
4. **The NodePool decision (D-01) before SkipList, always.** SkipList is the
   first pointer-based member and it BINDS the allocator. Deciding the direction
   late means forking it, which is the one substrate failure the suite refuses.
5. **Demo and Benchmark after 3-4 members.** Both need range in the `n` sweep and
   in the member set. The benchmark is a COPY-AND-WIRE of lite-o1 Bench v2, not a
   build -- do not re-scope it as a design session.

### The habit this roadmap is built around

Measure the logarithm; do not assert it. The witness turns "trust me, it is
O(log n)" into a straight line you can see, and a foil that leaves it. Every gate
ships a control that must FAIL -- an O(n) foil that must miss the R^2 floor, an
allocating loop that must trip the alloc gate -- because a gate that cannot fail
is a green light over a hole. When the reviewer subagent reads a test, the
question is not "does this test the feature" -- it is "would this test fail if
the member were broken". The witness's MAX-single-op bar exists for the same
reason: it refuses to let an expected/amortized member masquerade as worst-case.
And the substrate is reconciled, never forked -- one allocator, one PRNG, one set
of gates, across a family whose only job is to make the logarithm honest.

---

## 8. H1 hardening -- v1.4.0 (final-sweep audit of 1.3.0, 2026-09-25)  [PLANNED]

Baseline at audit (1a38599): `npm test` 666/666, `test:perf` 71/71 alone (2/71 FAIL once under CPU
contention), torture `ok` exit 0 with alloc=0 B/op. Two parallel read-only audits covered (a)
allocation + gate honesty and (b) fail-closed + correctness + doc truth. The evidence is in
RESEARCH.md section 12. H1, H2 and H3 were re-run independently and reproduced.

**Fixes (F)**

| id | finding | task | falsifiable gate |
| --- | --- | --- | --- |
| F1 | H1 (H) Treap `clear()` (LogN.js:1751) on a `split()` view (`_view` :1935) resets the SHARED arena. `[l,r]=a.split(3); l.clear();` then adding keys 100..105 to `l` makes `r` read `102..105` with `r.get(4)===undefined`. No throw. Clearing the consumed original does the same. | Free only the nodes reachable from `this._root` (iterative, over a preallocated stack). | After `split(3)`, `l.clear()` + 6 adds to `l`: `r` walks exactly `3:30,4:40,5:50` and `r.size===3`. |
| F2 | H2 (H) PairingHeap `_freeForest` / `_forEach` / `_iterNode` (:4220/:4233/:4243) and FibonacciHeap (:4860/:4877/:4889) RECURSE on child depth. `push(i, n-i)` for n >= ~5051 makes `clear()`, `forEach` and the iterator throw an untagged RangeError (stack). FibonacciHeap does the same after a 20000-long push/popMin/decreaseKey chain. `clear()` is the recovery path. | Make all six walkers iterative over a preallocated capacity-sized Uint32Array stack. | `PairingHeap(1e6)` with descending pushes: `forEach` counts 1e6, `[...h].length===1e6`, and `clear()` then `push(0,1)` succeeds. The Fibonacci n=20000 chain likewise. |
| F3 | H3 (H) LinkCutTree `_pull` (:7878-7883): `let a;` + an if/else chain ending in `segGcd(...)` keeps `a` TAGGED, so every `_pull` boxes (~15 per op). Measured (sum, fractional, 8N scavenges): setValue 364 (~243 B/op), cut+link 524, `pathAggregate(u, v)` 24 fresh -> 897 warmed (~1.2 KB/op). Independently: setValue int 0 -> 0, frac 33 -> 268. | Store in each branch (`this._agg[x] = ...`) and drop the phi. The audit's probe patch measured 364 -> 0 and 897 -> 12 (the return box only). | The N1/N2 LCT lanes at 0 (the return-value lane at <= 1 box/op, documented). |
| F4 | H4 (H) The same tagged-merge-into-`segGcd` pattern in SegmentTree (:794/:799/:828), SegmentTree2D (:5429-5438, :5471-5482) and PersistentSegTree (:6249, :6328). SegmentTree2D query sum 389 (~259 B/op). SegmentTree 1D sum is 0 only when inlined; not inlined, update 366 / query 161. PST update sum 244. | Take `segGcd` out of the shared ternary / accumulator: a loop per kind, or a store per branch (update / query / build in all three). The probe patch for the 2D query measured 389 -> 24. | N1 frac/p31 + N3 no-inline lanes: at 0, or <= 1 box/op where the API returns a double. |
| F5 | H5 (H) The gates cannot see F3/F4/F7-F10: all 71 perf scenarios + torture feed `& 0xffff` Smis. There are no fractional, >= 2^31, warmed-polymorphic or no-inline lanes. The teeth are a fresh `[]` (the perf mustFail; torture's 32 B/op retained control), not a 16 B box. | Add N1-N6 below. | N1-N4 fail on 1.3.0 and pass after the fixes. |
| F6 | M1 (M) PersistentSegTree ctor (:6104): the undocumented 4th parameter `_seed` skips `build()`'s validation (`_build0` :6192). `new P(2,1,'sum',[NaN,Infinity])` queries NaN. `[-1.5,'7',{}]` is accepted. `new P(3,1,'gcd',[NaN,3,6])` HANGS (`segGcd` :686 never reaches 0). | Take `_seed` out of the public ctor and route `build` through a module-private function. | The gcd NaN case returns within 1 s (tagged throw, or seed ignored). The d.ts has no 4th parameter. |
| F7 | M2 (M) finite inputs produce NaN: `Fenwick(2)`: `set(0,1e308); set(1,1e308); set(1,0)` gives `at(1)=NaN`, sticky until `clear()`. SegmentTree / SegmentTree2D / PST sum of `[1e308,1e308,-1e308,-1e308]` gives NaN. LCT gives `Infinity` or `0` depending on the rooting. The docs say non-finite values fail closed. | Settle S1: bound sum-kind inputs at the door (`\|v\| <= Number.MAX_VALUE / length`), or disclose. | `Fenwick(2).set(0,1e308)` throws tagged with the snapshot unchanged. The 4-value sum build throws tagged. |
| F8 | M3 (M) `arena(capacity, kind, count)` (:3441 / :3893 / :4461) has no bound on `count`. `arena(8,'min',1e8)` gives a V8 FATAL OOM (process abort). `2**32` gives an untagged "Invalid array length". | Cap `count` (e.g. at `capacity`) and throw a tagged RangeError before allocating. | Both cases throw tagged in < 10 ms, in a subprocess, with no abort. |
| F9 | M4 + M5 (M) LinkCutTree: vertices start (and `clear()` back) at 0, not at the fold identity that llms.txt:885/906 claims, so `min` over values 5, unset, 7 gives 0 (null is not zero). `pathAggregate(u, v)` permanently re-roots at `u` (`findRoot(3)` 0 -> 2, and a later `cut(1)` severs a different edge). The docs call it a "MUTATING read" like `findRoot`, which only splays. | Settle S2 (identity init in the ctor + `clear`) and S3 (document the re-root, or restore the root). | `pathAggregate(2)===5` and `at(1)===Infinity` for min. A test asserts `findRoot(v)===u` after `pathAggregate(u,v)` (if documented). |
| F10 | M-alloc (M) further library boxes (8N scavenges, 16 B = 24 fresh): Treap/Scapegoat successor / predecessor / `_ceil` (:1670/:1687/:1926, :2276/:2293/:2453; `best` starts `undefined`): 207-232. `PST._query` (:6240, recursive double returns): min 201, sum 249. WaveletTree `_rank1` (:6950/:6902) passes a Uint32 word >= 2^31 to non-inlined `wtPopcount32`: 376 even with int input when not inlined. | Integer slot + `bs === 0 ? undefined : K[bs]` (SplayTree's pattern, :3274). Make `PST._query` iterative with a double accumulator. Use `wtPopcount32(words[k] \| 0)` (verified 376 -> 0). | N1 / N3 lanes: successor <= 1 box (the return), PST query <= 1, WT quantile at 0 (+ its return box). |
| F11 | M-API (M) no zero-box forms: `number\|undefined` returns (`keyOf`, `topKey`, `peek*Key`, `get`, `select`, `successor`) box even when inlined, as do WT `quantile` / `access` and Fenwick2D `rectSum` (16 B/call). Double ARGUMENTS to non-inlined mutators box (Scapegoat set 2 args, SegmentTree2D update, Fenwick2D set, MST countLE/rangeCount, WT rank/select, decreaseKey). | Add slot forms where a consumer calls at frame or render rate: `setFrom(buf, i)` (Fenwick, SegmentTree, 2D), `quantileInto(out, j, lo, hi, k)` / `accessInto`, `rectSumInto`, `getInto` / `keyOfInto`. Settle S6 on scope. | A slot-form lane at 0 per added method. The plain form stays as the documented one-box control. |
| F12 | M7 (M) perf-gate flake: drivers compute `(t * 2654435761) & 0xffff` and call `hot(n)` once per window. Under contention it FAILs 2/71 (including the detector's negative control). | Inputs from a Float64Array, `hot` in ~2k chunks after a long warm-up (the audit's stable driver). | N6. |
| F13 | L (L) docs + disclosure: README says 643 tests (actual 666). Lockfile version 0.1.0. The README zero-GC table covers 13 of 19 members and the witness paragraph stops at SortedArray. The LogN.js header describes the v0.4.0 roster. Undisclosed: Fenwick cancellation (after a 1e15 overwrite, 16.669 reads 16.624 until a full lap; no accumulating drift, 1.1e-12 over 1e7 overwrites), -0/+0 merged with the first sign winning (WaveletTree, maps), mutation during heap iteration (duplicates or an early stop), and worst single-op times (FibonacciHeap popMin 2.36 ms, PairingHeap 1.59 ms, LCT findRoot 1.26 ms, Scapegoat 783 us, Splay 647 us at n=131k). | Fix and disclose each (S4, S5). | Grep for "643" finds nothing. The lockfile root is 1.4.0. The table has 19 rows. |
| F14 | L1 (L) WaveletTree has no buffer-reusing rebuild: ~8 arrays per build (n=256 ~12 KB / 100 us; n=65536 13.6 ms). lite-hud M5 rebuilds from a ring snapshot. | Optional `rebuildFrom(values)` into the existing buffers (same n or smaller). | A rebuild lane at 0 B/op, with output identical to a fresh build. |

**New gates (N)**

| id | gate | fails on 1.3.0 |
| --- | --- | --- |
| N1 | Fractional + p31 (2^31+s) + n31 + p53 copies of every scenario, inputs from a Float64Array, `maxScavenges: 0` (a documented <= 1-box floor only for APIs that return a double). | st2 query sum, all LCT sum ops, PST update/query, Treap/Scapegoat order mixes, WT access/rank/select/quantile, heap peek/keyOf, map get, sgSet, MST, f2Set/rectSum, st2Update |
| N2 | Warmed-polymorphic lane: drive the gcd kind first, then min/max/sum, then measure. | LCT `pathAggregate(u,v)` 897 |
| N3 | A separate process with `--max-inlined-bytecode-size=0` (the cross-module consumer case), <= 1 box/op. | SegmentTree sum 366 / 161, WT quantile 376 |
| N4 | mustFail: exactly one 16 B HeapNumber per op (reads 24 fresh / 12 warmed) must FAIL at 0. It replaces the `[]` teeth. | passes today |
| N5 | p30 (2^30+s) lanes equal to the p31 lanes, as a 31-bit-Smi proxy for Chrome (Chrome 152: `%IsSmi(2**30)` false). | not run |
| N6 | Run the perf gate 3x under 6 CPU burners: 0 failures. | 2/71 fail once |

**Settle calls (maintainer)**, lean in brackets:
- S1 sum overflow (F7): [bound at the door. One compare, and overflow becomes impossible.]
- S2 LCT unset vertices (F9): [fold identity in the ctor + `clear`. An unset vertex must not read 0.]
- S3 LCT `pathAggregate` re-rooting (F9): [document it. Restoring costs an access and moves the
  witness slope.]
- S4 -0/+0 (F13): [normalize to +0 in WaveletTree `build` (cold); only disclose for the maps.]
- S5 heap iteration under mutation (F13): [a version stamp in the iterator (not a hot path);
  document `forEach`.]
- S6 slot-form scope (F11): [start with what lite-hud M5 calls: Fenwick/SegmentTree `setFrom`,
  WaveletTree `quantileInto` + `rebuildFrom`. Add others on demand.]

**Checked clean (no task):**
- d.ts vs runtime: all 19 classes, statics, getters, `Symbol.iterator`.
- ASCII, MIT author, no stray tags, `npm pack` 7 files, VERSION synced 1.3.0.
- Brute-force oracles, 0 mismatches: WaveletTree quantile / rank / select / rangeCount,
  MergeSortTree and CartesianTree min/max (216k checks incl. fractions, duplicates, +-0, 2^53,
  5e-324, +-1e308); both 2D variants; LCT (80k ops, 4 kinds); the 5 ordered maps (60k ops x 4
  capacities); every heap incl. changeKey / decreaseKey / remove.
- Every door rejects NaN / +-Infinity / BigInt / strings / fractional / null tagged, with
  byte-identical state after a rejection. Capacity exhaustion is tagged. PST version exhaustion is
  a tagged no-op. Stale heap handles are safe. meld rejects self / foreign / wrong-kind / consumed.
- 0 scavenges at 8N across int / frac / p30 / p31 / n31 / p53, fresh and warmed: Fenwick (incl.
  the 256-slot ring set + rangeSum), SegmentTree 1D inlined (all kinds), CartesianTree
  rangeMin/Index, BinaryHeap, Pairing/Fibonacci push/popMin, set on SkipList / Splay / SortedArray
  / Treap, Fenwick2D update/prefix, PST.at, LCT.at, WT rangeCount.

**Exit:** F1-F14 and N1-N6 green; N1-N4 FAIL when F3/F4 are reverted.

### 8.1 Independent reproduction (2026-09-25, second session, same 1a38599, Node 26.8.2, 12 cores)

Fresh probes, written independently of the audit's. Allocation lanes use the audit's method: count
minor GCs at 8N under `--max-semi-space-size=4`. Inputs come from a Float64Array. The driver makes
2048-op calls after a 200-call warm-up, and the accumulator is a function local written once per call
to a Float64Array. Calibration: one HeapNumber per op reads 24 (frac), matching the audit.

| id | reproduced? | this session's numbers (audit's in brackets) |
| --- | --- | --- |
| F1 | YES | After `split(3)`, `l.clear()` and 6 adds to `l`, `r.size === 6` and `r` walks `100..105`. `r.get(4) === undefined`. [audit: `r` reads `102..105`]. Which keys leak depends on slot reuse order. Same bug. |
| F2 | YES | PairingHeap with descending pushes throws an untagged stack RangeError from n = 4443 (iterator), 6346 (`forEach`) and 6836 (`clear`) [~5051]. The threshold depends on stack size. At n = 20000 all three throw, so `clear()` cannot recover the heap. FibonacciHeap after a 20000-round push/popMin/decreaseKey chain: `forEach`, the iterator and `clear` all throw. |
| F3 | YES | LCT `setValue` sum: int 0, frac 363 [364]. `pathAggregate(u, v)` frac: 1749 fresh, 25 after a gcd warm-up [24 fresh -> 897 warmed]. The fresh/warm polarity is REVERSED from the audit, so the phi boxes in whichever feedback state the driver lands in. Gate BOTH states (N1 fresh + N2 warmed). Store-per-branch patch on a scratch copy: 363 -> 12, 1749 -> 13, 25 -> 13. The residual ~12 is the one argument box (setValue) or return box (pathAggregate), i.e. <= 1 box/op. |
| F4 | YES | SegmentTree2D query sum frac 443 [389]. SegmentTree 1D inlined: update/query 0/0. With `--max-inlined-bytecode-size=0`: update 270 [366], query 221 [161]. PST update sum frac 244 [244]. |
| F5 | YES | 124 `& 0xffff` sites in torture.mjs and 50 in PerfGate.test.mjs. The teeth are a fresh `[]` per op (PerfGate.test.mjs:1739). |
| F6 | YES, worse | `new P(3,1,'gcd',[NaN,3,6])` hangs INSIDE THE CONSTRUCTOR (killed at 3 s, before any query). `[NaN, Infinity]` sum queries NaN. `[-1.5,'7',{}]` is accepted and queries NaN. `PersistentSegTree.length === 4`. |
| F7 | YES, exact | Fenwick `at(1) = NaN`. SegmentTree / 2D / PST sum `NaN`. LCT `pathAggregate(3) = Infinity`, `pathAggregate(0,3) = pathAggregate(3,0) = 0`. |
| F8 | YES | `arena(8,'min',1e8)` is a V8 FATAL OOM abort for all three mergeable heaps. `2**32` gives the untagged RangeError "Invalid array length". |
| F9 | YES, exact | min: `pathAggregate(2) === 0`, `at(1) === 0`. `findRoot(3)` goes 0 -> 2 after `pathAggregate(2, 3)`. |
| F10 | PARTLY (not every site probed) | Treap `successor` 156 on BOTH int and frac input [207-232]. The `best = undefined` phi boxes even for integer keys. WT `quantile` with inlining off, int input: 373 [376]. Patching all THREE `wtPopcount32` call sites with `\| 0` (LogN.js:6902/6950/6952): 373 -> 1. Scapegoat and `PST._query` were not re-probed. |
| F11 | CONSISTENT | Fenwick `set` with inlining off, frac: 25 (one argument box per call). WT `quantile` inlined, frac: 25 (the return box). |
| F12 | NOT REPRODUCED | `test:perf` passed 71/71 plain, 71/71 twice under 6 burners, and 71/71 under 12 burners (12 cores). The audit's 2/71 was a one-off. Keep N6 as hardening, but it is not a reproduced defect (S8). |
| F13 | YES, plus more | README says 643 tests (actual 666). Lockfile 0.1.0. The zero-GC table has 13/19 members. The LogN.js header describes the v0.4.0 roster. NEW: README Constants table says `VERSION` is `'1.1.1'` (README:270). The D3 memory table has 16/19 rows (no WT/CT/LCT). The D1 SVG has 7/24 bars. "What this is not" stops at Fenwick2D. |
| F14 | not probed | (a feature, not a defect) |
| baseline | YES | `npm test` 666/666 (315 s wall). `test:perf` 71/71. |

**What the reproduction changes in the plan:**
- F3/F4/N2: the warm-vs-fresh polarity is driver-dependent. N1 must run the fresh lane AND N2 the
  warmed-polymorphic lane, and each must be red on 1.3.0 independently.
- F3 exit: the gate for `setValue` / `pathAggregate` is `<= 1 box/op` (the argument or return box in
  a non-inlined call), not 0. It reaches 0 only through a slot form (S6/S7).
- **Witness-band risk (new):** F3/F4/F10 remove per-LEVEL boxes, so the per-level SLOPE of the
  LinkCutTree `pathAggregate`, PersistentSegTree `query` and SegmentTree2D lanes will FALL. LCT's band
  `[33.74, 78.74]` was calibrated on code that boxed at every `_pull`. Run the witness before and after
  each fix. Re-center a band ONLY by the decisions/0004 rule (median-of-15 x `[0.6, 1.4]`, warm), and
  record the move in that member's ADR. A band move that comes from a fix is expected. One that is not
  explained by a fix is a regression.
- F6: the hang is at construction, so the exit test is `new P(3,1,'gcd',[NaN,3,6])` in a subprocess
  with a 1 s timeout, not a query.

### 8.2 NEXT SESSION -- running H1 (v1.4.0)

**Settle first, before any code (maintainer calls, lean in brackets).** S1-S6 as listed above, plus:
- S7 cross-module double ARGUMENTS (F3 residual, F11): accept `<= 1 box/op` for a non-inlined call
  that takes or returns a double, and document it. [yes. 0 B/op then applies to integer-slot and
  `Into` / `setFrom` forms only. State it once in the README zero-GC notes.]
- S8 F12 did not reproduce: [keep the chunked Float64Array driver anyway (it is needed for N1 to be
  stable), and run N6 once at release as evidence, not per commit.]

**Order of work (gates red first, then fixes, then docs):**
1. **Harness, red on 1.3.0.** N4 teeth (exactly one HeapNumber per op) -> the chunked Float64Array
   driver (F12) -> N1 kinds (int / frac / p31 / n31 / p53) -> N2 warmed-polymorphic + fresh ->
   N3 no-inline subprocess -> N5 p30. Commit nothing yet. Record the RED list; it IS the exit
   criterion "N1-N4 fail on 1.3.0".
2. **Correctness Highs.** F1 (Treap reachable-set free) and F2 (six iterative walkers over a
   preallocated stack). Both are plain `npm test` failures today; add the tests first.
3. **Allocation Highs.** F3 (LCT `_pull` store-per-branch), F4 (SegmentTree / 2D / PST: one loop per
   kind or one store per branch, in update / query / build). Re-run the witness after each (8.1 risk).
4. **Mediums.** F10 (integer `best` slot, iterative `PST._query`, `wtPopcount32(x | 0)` at all 3
   sites), F6 (module-private seed path, no 4th ctor param), F8 (`count` cap), then F7 / F9 per the
   S1 / S2 / S3 outcome.
5. **API.** F11 / F14 at the S6 scope (lite-hud M5: Fenwick / SegmentTree `setFrom`, WaveletTree
   `quantileInto` + `rebuildFrom`), each with a 0-box lane.
6. **Docs + release.** F13 (all README drift in 8.1, the LogN.js header, lockfile), CHANGELOG 1.4.0,
   the ADR notes for any moved witness band. Then run `npm run verify`, then N6 once.

**Pipeline:** planner (turn sections 8 + 8.1 into atomic tasks and ASSERTIONS; no new design) ->
coder -> reviewer -> qa, per the section 7 turn limits. Reviewer REJECTED goes back to the coder.
Each fix is its own coder task with its red test first. The torture, witness and perf gates run after
every allocation fix, not only at the end.

**Blocks:** lite-hud M5 pins 1.4.0. The EulerTourTree session (section 9) depends on 1.4.0: it is
born under the N1-N6 gates and the S1 / S2 / S7 policies.

### 8.3 The 1.4.0 session brief (ACCEPTED 2026-09-25)

Every settle call is decided: S1-S8 go with their leans. The one exception is **S1 for Fenwick /
Fenwick2D `update`**, which the maintainer settled as the MAGNITUDE BUDGET (below). The brief merges
two planner passes (harness; fixes). Every code site in it was re-verified against 1a38599.

```markdown
---
package: "@zakkster/lite-logn"
version_target: 1.4.0
status: accepted
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0          # S7: <= 1 box/op only for a non-inlined call taking / returning a double
leak_cycles: 4096
witness_gate: floor 0.958 frozen; bands re-checked before / after every hot-body fix (8.1 risk)
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [S1..S8 settled]
depends_on: [1.3.0 @ 1a38599]
blocks: [lite-hud M5, EulerTourTree 1.5.0]
---

# lite-logn -- H1 hardening: gates that can see a box, then the fixes they catch

PURPOSE
  Make the gates able to fail on the defects the 1.3.0 audit found (a single HeapNumber per op,
  non-Smi inputs, non-inlined callers, recursion depth). Then fix F1-F14 under those gates.
  No new member, and no API removals except PersistentSegTree's undocumented 4th ctor parameter.

SETTLED CALLS (as implemented)
  S1  Sum overflow is bounded at the door, sum kind only:
      - Absolute writes. SegmentTree.update/build: |v| <= MAX_VALUE / length.
        SegmentTree2D.update/build: |v| <= MAX_VALUE / (rows*cols).
        PersistentSegTree.update/build: |v| <= MAX_VALUE / length (every version is a length-n array).
        LinkCutTree.setValue: |v| <= MAX_VALUE / capacity (a path has <= capacity vertices).
      - Fenwick / Fenwick2D update(i, delta) use the MAGNITUDE BUDGET. A scalar `_mag` is an upper
        bound on sum |element|. update adds |delta|; set adds |new - old|; build sets it to sum|v|;
        clear sets it to 0. The budget is MAX_VALUE/2 for Fenwick and MAX_VALUE/4 for Fenwick2D.
        That margin covers the prefix(hi) - prefix(lo-1) subtraction and the 4-term
        inclusion-exclusion, so no intermediate can reach Infinity. Hot path cost: one add and one
        compare. If a write would exceed the budget, a COLD exact path recomputes sum |element| in
        O(n) and resets `_mag`. It accepts the write if the true total fits, and otherwise throws
        [lite-logn] with the state unchanged (checked BEFORE the climb). Disclose that at a true
        magnitude near 1e308 the exact path can repeat under churn.
  S2  LCT vertices start (and clear() returns them) at the fold identity: min +Infinity,
      max -Infinity, sum 0, gcd 0. at(unset) returns that identity. That is documented, and it is
      a CHANGELOG "Changed" item.
  S3  LCT pathAggregate(u, v) leaves the tree rooted at u. Documented and tested; nothing is
      restored.
  S4  WaveletTree build normalizes -0 to +0 (cold). The ordered maps only disclose it.
  S5  Heap iterators (BinaryHeap, MinMaxHeap, BinomialHeap, PairingHeap, FibonacciHeap) are
      version-stamped. BinaryHeap / MinMaxHeap gain a `_version` field. That is one Smi increment
      per mutation (`(v + 1) | 0`, as SkipList / Treap already do), which touches the pop witness
      lanes (see W). forEach documents "no mutation from the callback".
  S6  Slot forms, lite-hud M5 scope only:
        Fenwick.setFrom(src: Float64Array, i) -> this                 element i := src[i]
        SegmentTree.setFrom(src: Float64Array, i) -> this             leaf i := src[i]
        WaveletTree.quantileInto(out: Float64Array, j, lo, hi, k) -> void   out[j] := quantile
        WaveletTree.rebuildFrom(values) -> this                        into the existing buffers
      rebuildFrom: values.length must be <= the constructed length, else a tagged throw. Build's
      sort / dedupe temporaries become instance scratch so a rebuild is 0 B/op. The scratch memory
      is disclosed in the bits / D3 notes.
  S7  <= 1 box/op is allowed only for a non-inlined call that takes or returns a double. It is
      documented once in the README zero-GC notes. Everything else is 0.
  S8  F12 was not reproduced. The chunked Float64Array driver is kept (N1 needs it), and N6 runs
      once at release as evidence.
  (harness) The ZERO budget is <= 2 scavenges at 8N, not a strict 0. Clean lanes were observed at
      0-1 (st2 query int 1, SegmentTree update int 1), and one box reads 12-24, so 2 is still
      separable by 6x. See G5 for the self-calibrated one-box budget.

AMENDMENTS (2026-09-26, from the stage-G review)
  S7k S7 is refined (maintainer). A NON-inlined public call may box once per double ARGUMENT and
      once per double RETURN, and no more: k = the number of non-Smi doubles that cross the
      boundary, declared per lane in the registry. The budget is floor((k + 0.5) * B1), which means
      half a box of tolerance, so box k+1 always fails. (The first wording, floor(1.5 * k * B1),
      let a k=2 lane carry a third box. That was corrected 2026-09-26 to match the maintainer's
      "no more".) k is counted PER SHARD: the doubles that actually cross in that shard's
      inlining state (e.g. successor crosses 1 in a normal shard and 2 in ni-). Lanes that read 0 on 1.3.0 in the normal shards are
      gated at ZERO, so a one-box regression on an inlined path fails. Documented once in the
      README zero-GC notes.
  F15 NEW (A2): BinaryHeap.pop / remove and MinMaxHeap.popMin / popMax pass the key double into
      their own non-inlined sift helper (`_siftDown(0, this._key[last])`, LogN.js:144;
      `_siftDownMin`, :2605). Isolated with no boundary doubles, it still reads one box (12) on p31
      under noinline. Fix in stage M: pass the SLOT and read the key inside the helper.
  F16 NEW: delete+set churn reads 24-25 on 1.3.0 for Treap and Scapegoat in a normal pinned shard.
      SkipList / SplayTree read 12-13 (the k=1 boundary box) and SortedArray reads 0. An earlier
      "all 5 maps" figure came from a probe that loaded the key twice. Root-cause and fix in
      stage M (the delete path's key phi / return).
  F3+ LCT findRoot (205) and cut/link (247) box with NO double at the boundary. Same `_pull` phi
      as F3, reached through splay / access, so A1 closes them. Verify it.

TASKS -- stage G (gates, red on 1.3.0; repo-only, no LogN.js edit)
  G1  test/perf/Kinds.mjs: makeInputs(kind). A Float64Array(4096) per kind: int = s,
      frac = s + 0.37, p31 = 2^31 + s, n31 = -(2^31) - s, p53 = 2^53 - s, p30 = 2^30 + s, where
      s = (i*2654435761 >>> 0) & 0xffff.
  G2  Kinds.mjs: chunked(hot). 200 chunks of 2048 ops as warm-up, in setup. The measured window is
      16N ops (N = 200k; lengthened from 8N in review so B1 >= 8 with a pinned semi-space) in 2048-op chunks. Per-op read results go into a FUNCTION-LOCAL
      accumulator, written once per chunk to a Float64Array sink. Never a closure-captured `let`
      (RESEARCH 12.4).
  G3  Kinds.mjs: teethOneBox (exactly one HeapNumber per op: a double stored into a PACKED_ELEMENTS
      array) and teethTwoBox (two per op).
  G4  Kinds.mjs: LANES = member x hot op x kind, enumerated from LogN.d.ts. Each lane is tagged
      `doubleIO` (the op takes or returns a double -> the S7 budget) or `zero`. gcd skips
      frac / n31. N2 twins run the gcd kind first, then min / max / sum, then measure.
  G5  test/perf/Kinds.test.mjs. Each shard first measures teethOneBox IN ITS OWN STATE (fresh or
      N2-warmed) and gets B1. Then:
        ZERO budget = 2, and the shard fails itself if B1 < 8 (a GC-blind shard);
        ONE budget  = floor(1.5 * B1);
        teethOneBox must FAIL ZERO, and teethTwoBox must FAIL ONE.
      Why self-calibrate: a fixed ONE budget of 32 lets a warmed two-box teeth (~24) PASS.
  G6  test/perf/Lanes.mjs: spawn the shards as child processes (parallel), plus one shard with
      --max-inlined-bytecode-size=0 (N3) and one with the p30 kinds (N5). Wall-clock budget
      <= 180 s.
  G7  package.json: test:perf:kinds and test:perf:noinline. Both go in `verify`.
  G8  PerfGate.test.mjs: replace the fresh-[] teeth (teethMustFailAlloc, ~:1728-1775) with
      teethOneBox. Swap the `(t * 2654435761) & 0xffff` driver for the G1 / G2 driver (F12).
  G9  torture.mjs: frac and p31 value fills on the LCT / SegmentTree / 2D / PST / Treap / WT lanes.
  G10 test/perf/Burners.mjs (N6): os.availableParallelism() burners, 3 runs of test:perf. Release
      only, not in verify.
  G-EXIT Run on 1.3.0 and record the RED list. Expected RED:
      - LCT setValue sum frac (363)
      - LCT pathAggregate(u, v) sum frac: fresh 1749 is RED. N2-warmed read 25, which is about one
        box (the S7 return floor), so it PASSES ONE. Record whichever states are red; at least one
        must be
      - SegmentTree2D query sum frac (443)
      - PST update sum frac (244)
      - Treap successor int + frac (156)
      - noinline: SegmentTree update frac (270) and query frac (221), WT quantile int (373)
      - plus whatever the full matrix adds (Scapegoat, PST query, heap peek / keyOf, maps get ...)
    Expected GREEN: the ROADMAP 8 "checked clean" list. This recorded list IS the exit criterion
    "N1-N4 fail on 1.3.0".

TASKS -- stage C (correctness Highs; red test first, then fix)
  C1  F1 Treap.clear (LogN.js:1750) calls `this._pool.clear()`. The shared pool is the bug. Free
      only the nodes reachable from this._root, with NO stack: rotate-to-vine (while the root has a
      left child, rotate right; else free the root and step right). Same code for the original
      and for views, so a consumed original frees nothing. Keep the `_seed = _seed0` reset per view.
      Test: after split(3), l.clear() then 6 adds to l, r walks exactly 3:30, 4:40, 5:50 with
      r.size === 3. Also clear the consumed original, then split again, then merge: no corruption.
      Disclose (do not fix) that split views start from the same `_seed`, so their priority
      streams are identical.
  C2  F2 PairingHeap _freeForest / _forEach / _iterNode (4220 / 4233 / 4243) and FibonacciHeap
      (4860 / 4877 / 4889): make them iterative.
        - _freeForest: destructive and stackless. Splice each child list into the sibling chain
          as you go.
        - _forEach / _iterNode: stackless, using the existing links. Pairing's `_parent` is a
          dual-role PREV pointer, so `C[p] === x` tells a parent from a previous sibling.
          Fibonacci has an explicit `_parent` plus circular lists.
      Stackless is REQUIRED for the iterator. A shared scratch stack would be clobbered by two live
      iterators, or by forEach re-entering from its own callback.
      BinomialHeap (3706 / 3717 / 3727) is out of scope: binomial depth <= log2(capacity) <= 31.
      Treap / Scapegoat recursion is expected-depth / height-bounded (already documented).
      Tests: PairingHeap(1e6) with descending pushes, then forEach counts 1e6, [...h].length ===
      1e6, and clear() then push(0, 1) works. The same for the Fibonacci 20000-round
      push / popMin / decreaseKey chain.

TASKS -- stage A (allocation Highs; witness run BEFORE and AFTER each)
  A1  F3 LCT _pull (7877-7883): store in each branch, no `let a` phi. Scratch-patch proof:
      363 -> 12, 1749 -> 13.
  A2  F4 tagged ternary into segGcd. Split per kind (one loop per kind, or a store per branch) at:
        SegmentTree   794, 799 (query), 828 (update), 906 (build)
        SegmentTree2D 5429, 5430, 5437, 5438 (query), 5471, 5478, 5482 (update), 5579, 5588 (build)
        PST           6202 (_build0), 6249 (_query), 6328 (_copy)

TASKS -- stage M (mediums)
  M1  F10: Treap successor / predecessor (1667 / 1684) and the Scapegoat twins, plus both
      classes' `_ceil`: use an integer slot `bs = 0`, then `return bs === 0 ? undefined : K[bs]`
      (the SplayTree :3274 pattern; the return box is allowed by S7). Make PST _query (6240)
      iterative with a double accumulator. `wtPopcount32(x | 0)` at ALL THREE sites
      (6902, 6950, 6952); scratch proof 373 -> 1.
  M2  F6: drop the public `_seed` parameter (6104 / 6149). PersistentSegTree.build validates
      first, then seeds through a module-private function. The d.ts already shows 3 params.
      Exit: `new P(3,1,'gcd',[NaN,3,6])` in a subprocess with a 1 s timeout seeds nothing (the
      4th argument is ignored), and PersistentSegTree.length === 3.
  M3  F8: arena(capacity, kind, count) at 3435 / 3884 / 4452. `count` must be an integer in
      [1, capacity], or a tagged RangeError is thrown BEFORE any allocation. Exit: 1e8 and 2**32
      throw tagged in < 10 ms, in a subprocess, with no abort.
  M4  F7 per S1, and F9 per S2 / S3.

TASKS -- stage P (API, S6 scope) and D (docs + release)
  P1  Fenwick.setFrom, SegmentTree.setFrom, WaveletTree.quantileInto: each gets a 0-box lane in
      the G matrix, with the plain form kept as the documented one-box control. S4 -0
      normalization in WT build.
  P2  F14 WaveletTree.rebuildFrom: a 0 B/op lane, and output identical to a fresh build on a
      fuzz corpus.
  P3  S5 version stamps on the 5 heap iterators, plus tests for mutation mid-iteration.
  D1  F13, all of it:
        - README: 643 -> actual count; Constants VERSION '1.1.1' -> '1.4.0'; zero-GC table 13 -> 19
          rows; witness paragraph through LCT; D3 16 -> 19 rows; D1 SVG 7 -> 24 bars (or drop the
          SVG); "What this is not" through LCT; S7 note; new disclosures (Fenwick cancellation,
          -0/+0, iteration under mutation, worst single-op times from ROADMAP 8 F13).
        - LogN.js header rewritten for the 19-member roster.
        - package-lock root version.
  D2  VERSION 1.4.0 at all sites (package.json, LogN.js, llms.txt, lockfile). CHANGELOG 1.4.0 with:
        Fixed: F1-F4, F6-F10.
        Added: setFrom / quantileInto / rebuildFrom, iterator stamps.
        Changed: LCT unset = identity; LCT pathAggregate re-root documented; PST arity 3; new
          tagged throws (sum bound, arena count, rebuildFrom length).
        Note: the byte-identical-prior-members invariant is SUSPENDED for the listed sites in this
          release.
      d.ts + test/types for every new method.

W  WITNESS (the 8.1 risk). Before stage A, record a median-of-15 warm run for every lane whose hot
   body changes:
     - LCT pathAggregate, PST query, SegmentTree2D update + query, WT quantile (A / M1);
     - Fenwick update + prefix, Fenwick2D update + rectSum (the S1 budget compare);
     - BinaryHeap pop, MinMaxHeap popMin, Binomial / Pairing / Fibonacci popMin (the S5 stamp).
   Re-run after the fix. If a slope leaves its band, re-center ONLY by decisions/0004 (median-of-15
   x [0.6, 1.4], warm), with a dated note in that member's ADR naming the fix that moved it.

PIPELINE
  planner (this brief is the plan; no new design) -> coder -> reviewer -> qa, by stage:
  G, then C, then A, then M, then P, then D. Turn limits: coder 40, reviewer 15, qa 30. Reviewer
  REJECTED goes back to the coder. torture + witness + test:perf + kinds + noinline run after
  every A / M1 / S1 change, not only at the end.

ASSERTIONS
  1. On 1.3.0: test:perf:kinds and test:perf:noinline are RED on exactly the G-EXIT list; teeth
     calibrate (B1 >= 8); teethTwoBox fails ONE in every shard, fresh and warmed.
  2. After A / M1: those lanes are GREEN (0, or ONE where doubleIO). Reverting A1 or A2 turns them
     RED again (the ROADMAP 8 exit).
  3. C1 / C2 / M2 / M3 / F7 / F9 tests as stated, and each is red before its fix.
  4. Every rejected op leaves byte-identical state (snapshot of all columns).
  5. `npm run verify` green; kinds + noinline <= 180 s; N6 3x under availableParallelism() burners
     at release: 0 failures.
  6. Witness: every lane ON the line with its (possibly re-centered, ADR-noted) band; every foil
     OFF.
  7. `npm pack --dry-run` = the same 6 files; ASCII-only; grep finds no "643" and no "1.1.1" in the
     README.

NON-GOALS
  EulerTourTree (1.5.0). Slot forms beyond S6. Fixing the shared Treap view seed (disclosed only).
  BinomialHeap recursion (bounded). Any new witness lane.

DONE WHEN
  F1-F14 closed, N1-N6 green, the G-EXIT red list recorded in the CHANGELOG / ADR notes, every
  moved band ADR-noted, 1.4.0 ready for the maintainer to commit / publish / tag.
```

### 8.4 RE-PRIORITIZED 2026-09-27 -- consumers first (maintainer: "prioritize the module; lite-pick
### and lite-hud are blocked; demo in a separate session")

Stage G (gates) and stage C (F1, F2) are done. The rest of H1 is split into two releases, so that
the two blocked consumers get a release as early as possible.

**1.4.0 = the consumer release.** It contains stages G and C, plus:
- lite-hud M5 path:
  - Fenwick: S1 magnitude budget, `setFrom`.
  - SegmentTree: F4 (all folds), the S1 sum bound, `setFrom`.
  - WaveletTree: F10 popcount `| 0` at all 3 sites, S4 -0 normalize, `quantileInto`, `rebuildFrom`.
  - Every one of these lanes must be GREEN in kinds / noinline / p30.
- lite-pick path:
  - BinaryHeap: F15 (the sift helper takes the slot, not the key double) and S5 iterator stamp.
  - NEW `Fenwick.search(target) -> index`. This is the weighted-sampling descent lite-pick's
    dynamic-weight WeightedRandom needs ("O(log n) update + sample", Pick.js:1288 / ADR 0012).
    Semantics: the smallest i with prefix(i) >= target. It returns `length` when target exceeds
    the total, and never an out-of-range index. Binary-lifting descent, O(log n), 0 B/op.
    Precondition, documented: every element >= 0. It returns a valid index even when that is
    violated. The target is typeof-guarded; NaN throws.
- The cheap same-pattern Highs, because they share the fix and the gate:
  - F3: the LCT `_pull` per-branch store.
  - F4: the same per-kind split in SegmentTree2D and PersistentSegTree.
- Docs: only what the release makes false. The README test count, VERSION sites, the S7k note, the
  new APIs, the CHANGELOG, and the moved witness bands.

**Gate policy for 1.4.0 (maintainer-delegated decision).** `verify` must be green, so every lane
still RED because its fix is deferred goes into ONE explicit DEFERRED list in test/perf/Kinds.mjs.
Each entry is keyed to its F-id. The gate prints the list on every run, and an entry that turns
GREEN fails the gate until it is removed, so the list can only shrink. torture's G9 uses the same
list. 1.4.1 must empty it.

**1.4.1 = the rest of H1:**
- F6 (PST seed), F7 (LCT / 2D / PST sum bounds), F8 (arena count), F9 (LCT identity + re-root docs).
- F10 for Treap / Scapegoat successor / predecessor / _ceil and PST._query.
- F15 for MinMaxHeap, and F16 (Treap / Scapegoat delete).
- S5 stamps on the other 4 heaps.
- The full F13 doc sweep, and N6 at release.

- CartesianTree.rangeMinIndex witness hardening (1/7 solo runs at R^2 0.9577; add work per sample).
- The Harness (h) drift self-test uses a timer-based injector that failed once during a
  back-to-back gate sequence. Make its injection deterministic.

**Demo:** its own later session, not part of H1.

### 8.5 1.4.1 -- close H1 (PLANNED 2026-09-28; 1.4.0 shipped at c25188b)

Goal: empty the DEFERRED list and close every remaining H1 finding. There is no new API except where a
finding requires one. Line numbers below are from c25188b; locate each site by grep.

**Process rules (cost control; learned from 1.4.0):**
- ONE coder run does all tasks, in the order below. Each task gets its red-first test.
- ONE reviewer pass, which also does the qa checks.
- A second coder round happens ONLY for a finding that is wrong behaviour, a crash / hang, an
  allocation on a hot path, or a false doc claim. Nits go to a list for later, not into another round.
- Witness: re-center a band only if a lane leaves it on 3 of 3 solo runs, by the decisions/0004 rule.
  One-off R^2 dips are handled by W1, not by re-centering.
- The main session runs the final gates and /release. No subagent runs witness loops.

**Tasks**

| id | finding | change | test / exit |
| --- | --- | --- | --- |
| T1 | F10 Treap / Scapegoat `successor` / `predecessor` / `_ceil` (Treap ~2341, Scapegoat ~2868) | integer slot `bs = 0`; `return bs === 0 ? undefined : K[bs]` (the SplayTree pattern) | their DEFERRED cells go GREEN, and are removed from DEFERRED |
| T2 | F16 Treap / Scapegoat `delete` (key phi / return) | find the phi (delete path, `_delete` / `_deleteMin` recursion); hold the key in a slot or restructure; no double flows through a tagged phi | the `delete` DEFERRED cells go GREEN, and are removed |
| T3 | F15 MinMaxHeap `popMin` / `popMax` / `build` pass `this._key[last]` into `_siftDownMin` / `_siftDownMax` (~3022, 3044, 3140; also `_siftUp` ~3008) | pass SLOTS and read keys inside, exactly as BinaryHeap does since 1.4.0 | the `ni-minmax` DEFERRED cells go GREEN; DEFERRED is EMPTY |
| T4 | S5 version stamps on MinMaxHeap / BinomialHeap / PairingHeap / FibonacciHeap iterators | `_version` Smi bumped on every mutation; the iterator throws tagged on a mismatch; forEach documents "no mutation" | a mutation mid-iteration throws, and a clean walk does not; the popMin witness lanes stay in band |
| T5 | F6 PersistentSegTree ctor `_seed` (4th param, ~6744) | remove it from the public ctor; `build` validates, then seeds via a module-private function | `new P(3,1,'gcd',[NaN,3,6])` in a subprocess with a 1 s timeout does NOT hang; `PersistentSegTree.length === 3` |
| T6 | F7 sum bounds on SegmentTree2D / PersistentSegTree / LinkCutTree | `\|v\| <= MAX_VALUE / (2 * cells)`: SegmentTree2D cells = rows*cols; PST cells = length; LCT cells = capacity (a path has <= capacity vertices). Apply at update / build / setValue | the 1e308 4-value repros throw tagged with the state unchanged; a sweep at the bound gives no Infinity |
| T7 | F8 `arena(capacity, kind, count)` (~3852, 4308, 4941) | `count` an integer in [1, capacity], else a tagged RangeError BEFORE any allocation | `arena(8,'min',1e8)` and `2**32` throw tagged in < 10 ms, in a subprocess, with no abort |
| T8 | F9 LinkCutTree unset vertices + re-root | vertices start (and `clear()` returns them) at the fold identity (min +Inf, max -Inf, sum / gcd 0); document that `pathAggregate(u, v)` leaves the tree rooted at u | min: `pathAggregate(2) === 5`, `at(1) === Infinity`; test `findRoot(v) === u` after `pathAggregate(u, v)` |
| T9 | F13 doc sweep | README zero-GC table 13 -> 19 rows; D3 memory table 16 -> 19; D1 SVG (redraw to 24 bars, or drop it); "What this is not" through LinkCutTree; LogN.js header rewritten for the 19-member roster; the disclosures (Fenwick cancellation, -0/+0 in the maps, worst single-op times); llms.txt: LCT "start at the fold identity" (true after T8), rebuildFrom "0 B/op for any length <= constructed" | grep checks: no stale counts; no claim the code does not meet |
| T10 | CartesianTree witness near-floor (R^2 0.9577 once in 9 runs) | more work per sample (iterations / sweep / fits), as SegmentTree.update got in 1.4.0; never lower the floor | 3 solo runs ON |
| W1 | settle call [lean: YES] -- whole-witness R^2 flake | a lane that misses ONLY the R^2 floor is re-measured ONCE; a slope-band miss or a foil failure is never retried; the retry is printed | a deliberately noisy scratch lane passes on the retry; a slope-band miss still fails |

**Exit:**
- `npm run verify` green twice in a row.
- DEFERRED is empty in Kinds.mjs AND in torture's G9_DEFERRED.
- RedDiff vs G-EXIT: every 1.3.0 red cell is GREEN.
- The CHANGELOG 1.4.1 entry lists each F-id closed.
- `/release 1.4.1`, then `/sync-card lite-logn`.

**Consumers:** lite-hud and lite-pick need nothing from 1.4.1. Everything they use is in 1.4.0. 1.4.1
changes behaviour only where a CHANGELOG "Changed" entry says so: LCT unset-vertex values (T8), the
PST ctor arity (T5), and new tagged throws (T6, T7).

**After 1.4.1:** EulerTourTree (section 9), then the demo session.

---

## 9. EulerTourTree -- v1.5.0 (the LinkCutTree sibling)  [PLANNED]

Research notes: RESEARCH.md section 13. Integration surface = the 16 files the 1.3.0 LinkCutTree commit
touched, plus the cross-member items at the end of this brief.

### 9.0 Session plan (written 2026-10-03, after 1.4.1 shipped at b45ac49)

**State going in.** H1 is closed. The DEFERRED lists are empty. verify is green twice. Committed at
7e78d09: the SegmentTree.update witness sweep is widened to 2^4..2^16 (the 1.4.1 release-gate flake;
decisions/0004 "Post-1.4.1"), plus a GUIDE band fix. The fix is test/doc-only and nothing in it
ships (GUIDE and test/ are not in `files[]`). Its CHANGELOG `[Unreleased]` entry folds into 1.5.0.

**What 1.4.x settled, so the brief's open references are now concrete:**
- D-ETT4 unset vertex = the fold identity (min +Inf, max -Inf, sum / gcd 0), the same as LCT
  since 1.4.1. The sum bound is `|v| <= MAX_VALUE / (2 * capacity)` at setValue. A component holds
  <= capacity vertices, and arc nodes carry the identity, so they add nothing to the sum.
- S7k box policy: the folds return a double (k=1 when not inlined); link / cut / connected / sizes
  are k=0. Use slot-form internals from day one (the `_dkey` / `_acc` pattern), so the kinds lanes
  are green on the first run and no DEFERRED entry is ever needed.
- Iterator stamps: N/A (ETT has no iterator, per D-ETT6).
- The cross-member line numbers in the brief (README 1066/1112, llms 391/882, GUIDE 1031) are
  stale. Locate them with `git grep -n "EulerTourTree"`.

**Settle calls.** D-ETT1..8 take their LEANS (treap + parent pointers, Henzinger-King, an
endpoint-addressed arc table with backward-shift delete, per-kind folds + a count column, the
complement fold for subtrees, the surface as listed, the subtreeAggregate witness, the float-guarded
capacity). **SETTLED 2026-10-03** (maintainer: "Go for 1.5.0"). Binding for every agent.

**Process (the 8.5 cost rules, unchanged):**
- **Run 1 -- coder A: the member + correctness.** EulerTourTree + ETT_MAX_CAPACITY appended to
  LogN.js, LogN.d.ts + test/types, test/EulerTourTree.test.mjs (contract, fuzz vs the BFS oracle,
  LCT cross-oracle, non-mutating-read snapshots, boundary doors, the 2^20 path, arc-table churn).
  Exit: npm test green; a scratch 0 B/op check on link / cut / connected / sizes.
- **Run 2 -- ONE reviewer pass** on run 1. Its focus: wrong results, recursion, hot-path allocation,
  fail-open doors, and tagged phis in the folds. A re-loop to coder A happens ONLY for wrong
  behaviour, a crash / hang, a hot-path allocation, or a false doc claim.
- **Run 3 -- coder B: gates + docs.** torture lanes + G9 kinds lanes, perf Kinds / noinline / p30
  lanes, bench Matrix / Dimensions cells (D7 `n/a`, D8 next to LCT), the witness lane with a
  PROVISIONAL band (the main session calibrates it), QaAudit (20 classes; the ETT no-path-fold
  assertion), decisions/0022, README / llms / GUIDE / CHANGELOG / package.json, and the LCT
  cross-member docs + the "LCT or ETT?" chooser. No witness loops in a subagent.
- **Main session:** calibrate the subtreeAggregate band (median of 15 warm post-torture fit runs
  x [0.6, 1.4], ONE background script), run verify twice green, revert-check the new gates, then
  `/release 1.5.0` and `/sync-card lite-logn`.

**Budget guard.** If run 1 is not green after one re-loop, STOP and report to the maintainer with
the failing assertion. Do not start a third coder round on your own.

**Witness note (from the 1.4.1 flake).** A fast lane needs dynamic range, not more iterations. Pick
the subtreeAggregate sweep so the log2(n) span is >= 8 levels from the start (cache-resident low
end), rather than patching it after a gate failure.

```markdown
---
package: "@zakkster/lite-logn"
version_target: 1.5.0
status: planned
gc_maxMajor: 0
gc_maxPauseMs: 4
alloc_bytes_per_op: 0          # <= 1 box/op only where S7 allows (double arg / return, non-inlined)
leak_cycles: 4096
witness_gate: shared R^2 floor 0.958 (frozen); own band = median-of-15 x [0.6, 1.4], warm post-torture
peers: ["@zakkster/lite-gc-profiler", "@zakkster/lite-leak", "@zakkster/lite-perf-gate"]
design_calls: [D-ETT1 .. D-ETT8]
depends_on: [v1.4.0 H1 (N1-N6 gates, S1 / S2 / S7 policies)]
blocks: []
---

# lite-logn -- EulerTourTree: dynamic connectivity + SUBTREE folds over an unrooted forest

PURPOSE
  The member LinkCutTree defers to (decisions/0021 D-LCT6). It keeps an UNROOTED forest over a FIXED
  vertex set [0, capacity) under link(u, v) / cut(u, v). It answers connected(u, v), whole-component
  folds, and SUBTREE folds ("v's side of edge (v, p)") in expected O(log n), with zero allocation.
  The trick worth teaching: store the tree's Euler tour (every edge walked both ways) as a balanced
  BST sequence. Linking and cutting trees then become splitting and concatenating sequences. A
  subtree becomes one contiguous tour segment, so a subtree fold is a range fold. LCT answers PATH
  folds, ETT answers SUBTREE folds. Together they are the dynamic-forest pair.

DESIGN CALLS TO SETTLE (before code; each with a lean)
  - D-ETT1 backing BST. Lean: a TREAP with parent pointers, not a splay. With a treap, connected /
    componentAggregate / subtreeAggregate / at are NON-MUTATING reads: they climb parent pointers to
    the root and read the range folds top-down. That avoids LCT's mutating-read class (F9 / S3). The
    cost is EXPECTED rather than amortized, which the family already discloses for SkipList / Treap.
    The seeded instance-local LCG is the Treap one. A splay would be amortized, but every read would
    splay (an unsplayed parent climb is unbounded under amortized analysis).
  - D-ETT2 tour representation. Lean: Henzinger-King. One VERTEX node per vertex, which carries the
    value, plus two ARC nodes per edge (u->v and v->u), which carry the identity. The tour is CYCLIC.
    Invariant: a vertex node follows one of its entering arcs, or is alone. A rotation preserves every
    fold, so "reroot" is just a rotation (split + concat). Node budget = V vertex slots + 2(V-1) arc
    slots, fixed at construction. Arc slots come from a fixed private free-list. Nothing grows.
  - D-ETT3 edge addressing. Lean: `cut(u, v)` and `hasEdge(u, v)` by endpoints, through a private
    open-addressed arc table: linear probing, BACKWARD-SHIFT delete (no tombstone buildup under churn),
    power-of-two size >= 4V, two Int32 key columns + one Uint32 slot column. The alternative is an
    edge handle returned by link: less work, but the stale-handle risk goes to the caller.
  - D-ETT4 folds. min / max / sum / gcd frozen at construction via small-int _k, plus an ALWAYS-ON
    vertex-count column (componentSize / subtreeSize for free). Per-kind code with no tagged phi
    (lesson 12.2.1): a store in each branch, or one loop per kind. Unset-vertex initial value and
    the sum bound follow the S2 / S1 outcomes from 1.4.0, the same rule as LCT.
  - D-ETT5 subtree semantics in an UNROOTED forest. subtreeAggregate(v, p) = the fold over v's side
    after removing edge (v, p). Throws if (v, p) is not an edge. Read-only: find the ranks of arc(p->v)
    and arc(v->p) by parent climbs. If p->v comes first, fold the open segment between them.
    Otherwise fold the COMPLEMENT as two range folds. That works for min / max / gcd, which have no
    inverse.
  - D-ETT6 surface. link(u, v) (throws on bad id / self / cycle; the cycle test is the read-only
    connected), cut(u, v) (throws on a non-edge), setValue(v, x), at(v), connected(u, v),
    componentAggregate(v), componentSize(v), subtreeAggregate(v, p), subtreeSize(v, p),
    hasEdge(u, v), clear(). Getters capacity / kind / edges. NO evert and NO path fold (LCT's job;
    the sibling asymmetry). NO forEach / iterator. [Lean NO on forEachInComponent; add on demand.]
  - D-ETT7 witness. Gated op = subtreeAggregate on the DEFAULT log2(n) axis. Workload: a random
    recursive tree over n vertices, uniform-random (v, parent) picks, with interleaved cut + relink
    churn so the treap shape stays random. EXPECTED member, so the witness DISCLOSES the MAX single
    link and cut (never gated). Foil: a DFS over an adjacency list, O(component), which must miss the
    floor.
  - D-ETT8 capacity. ETT_MAX_CAPACITY such that 3V-1 slots, the 4V-entry table and every typed-array
    length stay < 2^31. Use a FLOAT-product guard, never `| 0`. Record the ~188-236 B/vertex footprint (corrected at review: + _stk + pool + pow2 table rounding)
    (3 slots x 40 B + 48 B of table) in the D3 memory table.

TASKS
  - Append EulerTourTree + ETT_MAX_CAPACITY to LogN.js after LinkCutTree (append-only, VERSION ->
    1.5.0). The split / merge / rank / range-fold code is ITERATIVE over preallocated `_stk` scratch
    (lesson 12.2.5). Spines touched by split / merge are recorded and pulled bottom-up. There are no
    closures and no `number | undefined` on hot reads.
  - LogN.d.ts + test/types; test/EulerTourTree.test.mjs (contract + fuzz vs an adjacency+BFS oracle,
    4 kinds x int/frac, >= 80k ops, 0 mismatches); an EulerTourTree boundary suite (every door
    typeof-first, byte-identical state after each rejection); a CROSS-ORACLE test that feeds one
    link/cut stream to LinkCutTree and EulerTourTree and requires `connected` to agree at every step.
  - A deep-shape test: a 2^20-vertex PATH graph, then subtreeAggregate / componentAggregate / clear,
    with no RangeError (recursion is a capacity bug). An arc-table churn test: link/cut the same
    pairs 1e6 times, and probe lengths stay bounded.
  - torture lanes (build / churn / discard tracker + hot reads on a warmed forest), witness lane +
    band, perf-gate scenarios under N1-N5 kinds from day one, bench Matrix/Dimensions cells (D7
    insertion-order `n/a`; D8 a dynamic-connectivity trace next to LCT).
  - decisions/0022-eulertourtree.md; llms.txt; README (tagline, roster row, TOC, API section, witness
    row + details, D1 / D3 / D5 / D6 rows, zero-GC table row, "What this is not" bullet, test count);
    GUIDE chapter; CHANGELOG 1.5.0; package.json description + keywords (euler-tour-tree,
    dynamic-connectivity, subtree-aggregate).
  - Cross-member: LCT docs (README 1066/1112, llms 391/882, GUIDE 1031, 0021 D-LCT6, CHANGELOG
    note) change "a future EulerTourTree" to the shipped member, plus a two-line "LCT or ETT?"
    chooser (path fold / evert -> LCT; subtree or component fold, read-only connectivity -> ETT).
    QaAudit's LCT no-subtree assertion stays. Add the ETT no-path-fold assertion.

ASSERTIONS
  - Fuzz vs oracle: 0 mismatches on connected / componentAggregate / componentSize /
    subtreeAggregate / subtreeSize / hasEdge / edges across 4 kinds.
  - Cross-oracle: LCT.connected === ETT.connected at every step of an 80k link/cut stream.
  - Reads are non-mutating: a column snapshot is byte-identical before and after every read op.
  - link on connected endpoints, cut on a non-edge, and a bad / typeof-hostile id or value all
    throw [lite-logn] as byte-identical no-ops.
  - 2^20 path: no RangeError anywhere, including clear().
  - torture ok: 0 B/op on link / cut / setValue / connected / componentSize / subtreeSize;
    <= 1 box/op (S7) on the double-returning folds when not inlined; N1-N5 lanes green;
    N4 teeth trip.
  - Witness: subtreeAggregate R^2 >= 0.958 and slope in its band; the DFS foil misses the floor;
    MAX single link / cut printed.
  - npm run verify green; pack = the same files; d.ts == runtime surface (20 classes).

HOT PATH
  link = 2 rank climbs + <= 4 splits + <= 5 merges. cut = 2 rank climbs + 2 splits + 1 merge + 2 arc
  frees + 1 table delete. Reads = parent climbs + top-down range folds. All iterative, all over
  preallocated columns, zero allocation.

NON-GOALS
  No path folds or evert (LinkCutTree). No non-commutative folds. No edge weights (arc nodes carry
  the identity; edge values are a later preset). No general-graph dynamic connectivity (Holm-de
  Lichtenberg-Thorup levels over ETT forests: a possible future member that uses this as its
  substrate). No growth.

DONE WHEN
  EulerTourTree shipped at 1.5.0; D-ETT1..8 recorded in 0022; all gates green incl. N1-N6; LCT docs
  point at the shipped sibling; the README / llms / GUIDE / d.ts surface counts all read 20 members.
```

MIT (c) Zahary Shinikchiev
