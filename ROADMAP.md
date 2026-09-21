# lite-logn -- PRE-BUILD roadmap

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

MIT (c) Zahary Shinikchiev
