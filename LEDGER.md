# lite-logn -- the ledger

*Every design refused, every defect caught, every measurement trap, and the laws they produced,
for the O(log n) family (20 members, 1.0.0 -> 1.5.1, plus the a4a0d33 smi-lcg commit). Each entry
names the commit, sha8, ADR or file it rests on; nothing here comes from memory. Nothing here is
re-litigated without a new mechanism that clears every gate the original decision cleared.*

Numbering note: entries are numbered once, in section order (A #1-#16, B #17-#31, C #32-#40,
D #41-#47, E #48-#51, F #52-#59). #60 (end of D) was added after the first pass. A new entry takes the next free number (#61 on) and is placed at
the end of its section; existing numbers never move. Sources: `decisions/NNNN-*.md` = the 22 ADRs;
RESEARCH = `RESEARCH.md` (12.2 = "Lessons (new for the suite)", 14 = cache-conscious intake); ROADMAP =
`ROADMAP.md`; CHANGELOG = `CHANGELOG.md` by version; `.handoff/` is gitignored and resolves in the
maintainer's main checkout only. Commit ids are from `git log --oneline` on master: 1.4.0 = c25188b,
1.4.1 = b45ac49 / 7e78d09, 1.5.0 = b790137, 1.5.1 = 321de8b, harness fix = cd75c7f, smi-lcg = a4a0d33.
Finding ids (F1, S7, DM2 ...) are those of ROADMAP sections 8-10.

---

## The laws that fell out (read this first)

1. **Clean at the entry is not clean on the path.** A probe that inlines everything, feeds Smis, or
   is monomorphic reads 0 B/op while a consumer boxes per call. Gate the non-inlined build
   (`--max-inlined-bytecode-size=0`), fractional, >= 2^31 and 2^53 inputs, and count scavenges, never
   heap deltas. *(#17, #18, #19, #32, #33, #34, #38)*
2. **A hot value stays in a typed-array slot or a Smi; it never crosses a non-inlined boundary as a
   double, a uint32 >= 2^31, or `number | undefined`.** Per-branch stores beat a tagged phi; a mask
   to 30 bits beats `>>> 0`. *(#17, #18, #19, #20, #29, #30)*
3. **Fail closed at the door, before the first write, with a float guard.** `| 0` budget guards fail
   OPEN; a bad size is a tagged throw before allocation; a finite input must not fold to a sticky NaN;
   a rejected op leaves byte-identical state. *(#10, #24, #25, #26, #47)*
4. **Do not ship an op the layout cannot answer honestly; name the asymmetry and route it to a
   sibling member.** No min/max on a BIT, no order statistic on a merge-sort tree, no non-commutative
   fold on a 2n tree, no subtree fold on LCT. *(#11, #13, #14, #15)*
5. **Fixed capacity, no recursion, no lazy growth.** Recursion is a capacity bug, a lazy grow breaks
   the 0 B/op window, a stored fold function goes megamorphic. *(#5, #7, #9, #22)*
6. **Substrate is design-parity, not a dependency or a fork.** *(#2, #3)*
7. **A witness band moves only by its rule; a flake is fixed with more work per sample, never a lower
   floor.** Re-center on 3 of 3 solo misses, retry only an R^2-only miss, never retry a slope or foil
   miss. *(#4, #35, #36, #37)*
8. **A gate needs teeth, and a timing needs a clock that can see the effect.** A must-fail control per
   gate; coarse browser clocks, shared hosts and unmeasured lanes are stated as such, never as
   passes. *(#34, #38, #39, #40, #50, #55)*
9. **A doc, comment or example is a claim: gated, derived from the code, or removed -- and true on
   the platform it names.** "Always a Smi" is Node-only; a quick-start must run. *(#27, #29, #30, #31,
   #46, #59)*
10. **An expected value comes from an independent reference, and a review catches what the author's
    own test encodes.** *(#28, #29, #44, #46)*

---

## A. Designs refused / rejected

1. **No broad interface every member implements, and no empty surface either.**
   One interface forces throwing stubs (a heap's `successor`); no shared surface drops honest
   `size` / `clear` / iterate. The spine is the small set that is true on every member; asymmetries
   are named, not hidden.
   *Source: decisions/0002-spine.md.*

2. **No private pool fork, no runtime dependency on a sibling's pool, no per-member allocator.**
   A forked NodePool, a fourth pool "with a different contract", a runtime import of lite-o1's
   SlotPool (never shipped, and zero deps is law) and a separate allocator for Treap / Scapegoat were
   each refused as substrate drift (D-01). SkipList, Treap and Scapegoat match lite-o1's contract and
   invariant by design-parity, with no import.
   *Source: decisions/0001-nodepool.md, 0006-skiplist.md, 0007-treap.md, 0008-scapegoat.md.*

3. **GUIDE.md stays out of the tarball.**
   It is a repo-only decision guide (like lite-o1's); the README is the shipped doc. Keeps the
   tarball to six files.
   *Source: decisions/0003-pack.md.*

4. **No family-wide slope band, and no R^2-only gate.**
   One band (BinaryHeap's) false-fails any member whose honest per-level cost differs (Fenwick's
   single-cell touch is legitimately faster). R^2 alone accepts any straight line regardless of
   steepness, so a 3x per-level regression would pass. Keep both, per member.
   *Source: decisions/0004-witness-band.md.*

5. **No lazy propagation, no stored fold function, no arbitrary fold, no 2n layout for a
   non-commutative fold.**
   Lazy doubles state and puts a push-down in every point op. A per-instance fold function is a
   call site that goes megamorphic. An arbitrary fold cannot be proven commutative and the 2n layout
   is only correct for commutative folds; non-commutative ones route to a pow2 layout with ordered
   accumulators. The ctor-cached int kind keeps one monomorphic hot body. LinkCutTree refused a
   mirror-order aggregate for the same reason (admitted folds: min / max / sum / gcd).
   *Source: decisions/0005-segtree.md, 0021-linkcuttree.md (D-LCT3 / D-LCT4).*

6. **No low LCG bits for levels, no `Math.random`.**
   The low bits of a power-of-two LCG are periodic (the lowest alternates) and fail the chi-square
   gate; the high bits (`clz32`) are well mixed. `Math.random` is non-deterministic: one repo LCG,
   seeded, so every structure is reproducible.
   *Source: decisions/0006-skiplist.md.*

7. **No lazy grow, no on-demand arena, no per-call scratch.**
   A reallocation inside a measured window breaks the 0 B/op gate, so SkipList sizes its level
   columns to the capacity's real need up front, PersistentSegTree has a fixed arena that fails
   closed, Scapegoat uses ONE preallocated `_flat` + `_stack` instead of an array per rebuild,
   WaveletTree select climbs with local scalars.
   *Source: decisions/0006-skiplist.md, 0008-scapegoat.md, 0017-persistentsegtree.md, 0019-wavelettree.md.*

8. **No O(n) split / merge by copying; no red-black / AVL for their own sake.**
   Copying forfeits the O(log n) headline, so Treap shares its arena (consume-the-input documented)
   and Scapegoat ships no split / merge at all, naming the asymmetry. RB / AVL are pointer-heavier
   with a different honesty story; Treap (expected) and Scapegoat (amortized) cover the family.
   *Source: decisions/0007-treap.md, 0008-scapegoat.md, RESEARCH section 4 ("The boundary").*

9. **No recursion in a hot or recovery path; no bottom-up splay.**
   An iterative set / delete with a depth cap was also refused (a cap throws on a valid tall tree;
   the instance-local LCG makes the worst case unreachable). Splay is top-down (two scalar hands, no
   parent column, no native-stack overflow on a chain); Fibonacci cascade is a `while`; CartesianTree
   depth is iterative because a sorted input is an O(n)-deep chain.
   *Source: decisions/0007-treap.md, 0010-splaytree.md, 0013-fibonacciheap.md, 0020-cartesiantree.md.*

10. **No `| 0` on a budget or size guard.**
    `| 0` wraps a > 2^31 product to a small or negative int32 and passes (fail OPEN, a degenerate
    tree). Fenwick2D, PersistentSegTree and MergeSortTree guard with the exact float multiply, which
    fails closed.
    *Source: decisions/0014-fenwick2d.md (D-F2-2), 0017-persistentsegtree.md (D-PST3), 0018-mergesorttree.md (D-MST5).*

11. **Redundant surface stays off a member that is not its job.**
    MinMaxHeap: no `_pos` / changeKey (BinaryHeap owns addressability; ids stay opaque), no two
    paired heaps (needs a cross-heap index), no `kind` getter (both ends exist); interval heap
    deferred (D-M2). SplayTree: no size column / order statistics (Treap and Scapegoat own them), no
    non-splaying `get` (the amortized bound depends on read restructuring). LinkCutTree: no subtree
    aggregate (EulerTourTree's job), no strictly-rooted tree (evert is cheap with commutative folds).
    *Source: decisions/0009-minmaxheap.md, 0010-splaytree.md, 0021-linkcuttree.md (D-LCT1, D-LCT6).*

12. **Textbook shortcuts that cost bytes or correctness.**
    FibonacciHeap: packed mark bitset (no GC gain, mask/shift bytes on every cascade read), a
    `ceil(log2 cap)` degree bucket (undersizes the golden-ratio bound by ~44%: a silent
    out-of-bounds write), a per-node `_owner` retag on meld (O(|b|) kills the O(1) meld; union-find
    `_alias` instead). Fenwick2D: a fused single-pass build double-counts cells reachable by both a
    row-hop and a col-hop, so two separate 1D passes.
    *Source: decisions/0013-fibonacciheap.md (D-FH2..4), 0014-fenwick2d.md (D-F2-3).*

13. **Do not admit an op the layout cannot answer.**
    Fenwick2D min / max / gcd (a BIT has no inverse for min / max; routed to SegmentTree2D);
    MergeSortTree kth-smallest-in-range (routed to WaveletTree), a mutable variant, and fractional
    cascading (bridge pointers wreck the flat zero-GC layout); Fenwick2D keeps its own squared-log
    witness axis (`xOf`) rather than fitting O(log^2 n) against a linear-log axis.
    *Source: decisions/0014-fenwick2d.md (D-F2-4), 0018-mergesorttree.md (D-MST1, D-MST3, D-MST4).*

14. **Flat typed arrays over per-node objects; worst-case over a prettier expected bound.**
    WaveletTree is a wavelet MATRIX (not a per-node tree), a 128-bit block index (~1.25x total, not
    a per-word cumulative at 2x), with coordinate compression to `[0, sigma)`. MergeSortTree is one
    level-packed Float64Array. CartesianTree keeps binary lifting (worst-case O(log n) on sorted,
    reverse and all-equal input, O(n log n) space) over a linear-space four-Russians RMQ whose
    degenerate chain defeats the worst-case bound; a dynamic link-cut swap was deferred.
    *Source: decisions/0018-mergesorttree.md (D-MST2), 0019-wavelettree.md (D-WT2..4), 0020-cartesiantree.md.*

15. **The line stays at the logarithm; siblings own the rest.**
    Out of scope: O(1) structures (lite-o1), O(log log n) vEB / y-fast (a different package),
    comparison sorts (heapsort is a recipe), B-tree / LSM (block-oriented). The in-memory B+tree
    reconsideration (ROADMAP 11, C1) is PROPOSED, not decided; LSM stays out. EulerTourTree refused an
    edge handle returned by `link` (pushes the stale-handle risk to the caller) for an
    endpoint-addressed arc table. XorTrie (max-XOR, O(w) = O(log U)) sits in the research reserve
    "on the lite-loglogn boundary", not in the near-term queue.
    *Source: RESEARCH section 4 ("The boundary", Tier 4); ROADMAP section 11; decisions/0022-eulertourtree.md (D-ETT3).*

16. **Measured "don't" list.**
    Pointer trees (Treap, SkipList, Splay) for point lookups at large n (~19x worse than hashing at
    4e6), HAMTs for speed, filters in front of in-memory indexes, 8-ary and wider heaps. Speed
    numbers there are REPORTED from another host (260 MB L3) and enter no README / GUIDE / llms.txt.
    *Source: RESEARCH section 14.8; ROADMAP section 11.*

---

## B. Defects found and fixed

17. **A tagged phi is a box per iteration.**
    `let a;` assigned in an if/else chain where ONE branch calls a generic helper (`segGcd`) keeps `a`
    tagged in every kind's path, so the sum kind boxed at every tree level (LCT `_pull`, SegmentTree,
    2D, PST: hundreds of B/op from one line). Now one loop or one store per fold kind; the pure-double
    accumulator is never tainted. `PersistentSegTree._query` went iterative at the same time.
    *Source: RESEARCH 12.2.1; CHANGELOG 1.4.0 (F3, F4, F10); b45ac49 / c25188b.*

18. **A key double crossing a non-inlined helper boundary boxes once per call.**
    BinaryHeap `pop` / `remove` (F15), MinMaxHeap `popMin` / `popMax` / `build` (F15) and Treap /
    Scapegoat `delete` (F16) passed the moving key into a non-inlined helper or a recursive
    `_delete`. Now the helper gets the SLOT and reads the key inside (`_siftDownAt`,
    `_siftDownMinAt` / `_siftDownMaxAt`), or the key rides a `_dkey` Float64Array slot.
    *Source: CHANGELOG 1.4.0 (F15), 1.4.1 (F15, F16).*

19. **A Uint32 >= 2^31 is not a Smi, even from integer inputs.**
    WaveletTree's popcount helper boxed its word argument (fix: `wtPopcount32(word | 0)`). The same
    class returned in 1.5.0: EulerTourTree `_arcHash` returned `(h & mask) >>> 0`, a uint32 that boxes
    a HeapNumber per probe when not inlined; it now returns `h & 0x3FFFFFFF` (the table is <= 2^30
    slots, so `& mask` probes identically). Found at the 1.5.0 review, and again in the demo PRNG (DM2,
    #31). On Chrome (31-bit Smi) the ceiling is 2^30, hence 0x3FFFFFFF.
    *Source: CHANGELOG 1.4.0 (F10 WaveletTree); LogN.js `_arcHash` comment; decisions/0022-eulertourtree.md (REVIEW CORRECTION); ROADMAP DM2; b790137.*

20. **`best = undefined` phis and `number | undefined` returns always box.**
    Treap / Scapegoat `successor` / `predecessor` / `_ceil` boxed the returned key even on integer
    input. Now an integer slot `bs` holds the node index and the method returns
    `bs === 0 ? undefined : K[bs]` (the SplayTree pattern): 0 B/op on integer input, <= 1 return box on
    a fractional / large key. A per-frame consumer needs an integer-slot or `Into` form.
    *Source: RESEARCH 12.2.3; CHANGELOG 1.4.1 (F10).*

21. **A shared pool makes `clear()` destructive to every view.**
    Treap `clear()` on a `split()` / `merge()` view reset the SHARED node pool and corrupted its
    siblings (F1). Now it frees only the nodes reachable from its own root (stackless
    rotate-to-vine); O(own nodes), not O(capacity). Any split / view API scopes destructive operations
    to its own reachable set. Split views still share `_seed` (disclosed).
    *Source: RESEARCH 12.2.6; CHANGELOG 1.4.0 (F1).*

22. **Recursion is a capacity bug.**
    PairingHeap / FibonacciHeap `clear()`, `forEach` and the iterator recursed on child depth and
    threw an untagged stack RangeError from a few thousand nodes, so `clear()` could not even recover
    the heap (F2). All six walkers are now stackless over the existing links; mutation mid-walk is
    UNSUPPORTED (always terminates, never yields a freed id, may throw or skip). 1.4.1 added a
    version stamp to MinMaxHeap / Binomial / Pairing / Fibonacci so the throw is deterministic.
    *Source: RESEARCH 12.2.5; CHANGELOG 1.4.0 (F2), 1.4.1 (S5).*

23. **A private constructor parameter skipped validation and could hang.**
    `new PersistentSegTree(3, 1, 'gcd', [NaN, 3, 6])` hung inside the constructor (segGcd over a NaN
    leaf): the undocumented 4th `_seed` parameter bypassed `build`'s validation (F6). Removed; the
    public ctor is `(length, versionCapacity, kind)`, arity 3, and `build` validates first.
    *Source: CHANGELOG 1.4.1 (F6, Removed).*

24. **Finite in, NaN out.**
    A door check for finiteness is not enough for sum folds: 1e308 + 1e308 overflows to Infinity and
    a later subtraction gives a sticky NaN. Fenwick / Fenwick2D carry a magnitude budget (cold exact
    recompute on would-be overflow, throw with state unchanged); SegmentTree, SegmentTree2D, PST and
    LCT bound `|value| <= MAX_VALUE / (2 * cells)` at the door, written NaN-safe
    (`value > bound || value < -bound`). Non-sum kinds are unbounded.
    *Source: RESEARCH 12.2.7; CHANGELOG 1.4.0 (S1), 1.4.1 (F7).*

25. **An unbounded allocation-sizing input is a V8 fatal, not a RangeError.**
    `arena(8, 'min', 1e8)` and `arena(8, 'min', 2**32)` on Binomial / Pairing / FibonacciHeap hit a
    fatal OOM / "Invalid array length" (F8). `count` must now be an integer in `[1, capacity]`, a
    tagged RangeError BEFORE any allocation (< 10 ms, no abort).
    *Source: CHANGELOG 1.4.1 (F8).*

26. **Null is not zero: unset LinkCutTree vertices read the fold identity.**
    A fresh or cleared vertex read 0, so `min` over 5 / unset / 7 was 0. Now `min` +Infinity, `max`
    -Infinity, `sum` / `gcd` 0, and `at(unset)` returns the identity (F9 / S2). `pathAggregate(u, v)`
    everts `u` and leaves the tree rooted at `u`; documented and tested (restoring would cost an
    access and move the witness slope).
    *Source: CHANGELOG 1.4.1 (F9, S2, S3).*

27. **A README quick-start that cannot run.**
    The LinkCutTree example called `cut(2)` right after `pathAggregate(2, 3)`; the two-argument fold
    everts 2, so 2 was the root and `cut(2)` threw "no parent edge". Now shows `findRoot(3) === 2` and
    restores with `evert(0)`; tests pin the README sequence.
    *Source: CHANGELOG 1.5.1 (Fixed, Testing); 321de8b.*

28. **EulerTourTree `clear()` left stale arc-table keys.**
    A cleared-then-reused instance could probe-match a stale `_arcFrom` / `_arcTo` key. `clear()` now
    zeroes `_arcSlot`, `_arcFrom` and `_arcTo`, reseeds the LCG and refills the arc free-list, and a
    test asserts `clear()` after churn is byte-identical to a fresh instance (columns, arc table,
    pool, PRNG).
    *Source: decisions/0022-eulertourtree.md ("clear() (REVIEW CORRECTION)"); CHANGELOG 1.5.0 (Testing); b790137.*

29. **A footprint comment that did not add up.**
    The pre-build note said ~170 B/vertex for EulerTourTree. The review recomputed it from the column
    list: 3V-1 node slots x 44 B (~132 B/vertex) + `_stk` (~12) + arc free-list pool (~8) + the
    power-of-two >= 4V arc table at 12 B/entry (48-96): 188 B/vertex at a power-of-two V, 236 at
    V = 1025, 203 at V = 1e5. A size claim is derived from the layout, not remembered.
    *Source: decisions/0022-eulertourtree.md ("Footprint (REVIEW CORRECTION)"); ROADMAP section 9 (T-list); CHANGELOG 1.5.0.*

30. **`_lcgNext` was 36 bytes of bytecode, and its comments were false off Node.**
    36 B is over TurboFan's small-inline limit (<= 30) and Maglev's (<= 27), so it was charged to the
    caller's 920-byte budget (it was in fact inlined at every warm site in the Node driver). Reading
    `Math.imul` and the two constants from module consts gives 27 B with the SAME 32-bit sequence (no
    seeded shape moves). Four comments said the signed int32 state "always stays an unboxed Smi": true
    only with 32-bit Smis (Node); on pointer-compressed Chrome / Edge / Electron (31-bit Smi) about half
    of all states are HeapNumbers, a cost only where the call is not inlined. Reworded; that case is
    NOT measured.
    *Source: a4a0d33; .handoff/research/smi/FINDINGS.md (P1-P3, Verdict); CHANGELOG [Unreleased].*

31. **Docs shipped stale.**
    Published 1.1.0 `llms.txt` (a `files[]` member) omitted WaveletTree although version-stamped 1.1.0;
    SplayTree's documented iteration cost was `O(n log n)` when the non-splaying walk is
    `O(n * depth)` (a sorted-insert chain makes it O(n^2)); the README D5 table still showed the
    1.3.0 bundle; one test count read 762 vs 770. The demo audit (1.5.1) found DM1-DM7: an in-browser
    4-point fit showing negative slopes and R^2 0.12-0.74 (now a static band table from
    `demo/witness-data.mjs`, drift-tested against `test/witness.mjs`); a uint32 demo PRNG (BinaryHeap
    3 -> 0 scavenges per 1M steps, SkipList 5 -> 0); `toFixed` in the rAF loop; `fillStyle` per rect;
    a version trinity pinned to `'1.0.0'`; a header claiming 16 members; an `svg{display:block}` that
    overrode `[hidden]`.
    *Source: CHANGELOG 1.1.1, 0.14.0, 1.5.0, 1.5.1 (DM1-DM7); ROADMAP section 10.*

---

## C. Measurement and witness lessons

32. **"Clean when inlined" is not clean.**
    SegmentTree 1D read 0 B/op in a monomorphic probe and 244 B/op with inlining off. A cross-module
    consumer (lite-hud's `write()`, a large function) is the non-inlined case, so the gate runs with
    `--max-inlined-bytecode-size=0`.
    *Source: RESEARCH 12.2.2; CHANGELOG 1.4.0 (`test:perf:noinline`).*

33. **The gates were blind to the boxes.**
    All 71 perf scenarios and torture fed `& 0xffff` Smis; there were no fractional, >= 2^31, warmed
    polymorphic or no-inline lanes, and the teeth were a fresh `[]`, not a 16 B box. 1.4.0 added the
    Kinds / noinline lanes (int, fractional, 2^31+, 2^53), the S7k boundary-box budget, and teeth of
    exactly one HeapNumber per op.
    *Source: ROADMAP finding F5 / H5, N1-N6; CHANGELOG 1.4.0 (Testing).*

34. **A heap-delta-after-GC gate misses short-lived allocation.**
    The demo's 0-B/op gate was replaced by one that counts scavenges in a child process with a 1 MB
    semi-space; a one-allocation-per-step control fails it (120.6 B/op implied). The only exception
    is named (SegmentTree2D.query's return box, 0.65-0.85 B/step in the demo).
    *Source: CHANGELOG 1.5.1 (DM3).*

35. **Re-center a witness band only by its rule.**
    A band moves only if a lane leaves it on 3 of 3 solo runs, by the decisions/0004 rule:
    median of warm SOLO runs x [0.6, 1.4], every run's slope recorded. 1.4.0 re-centered four bands
    after box fixes made their ops cheaper (SegmentTree.update 3.83 -> 0.715 ns/level), each move
    EXPLAINED by a fix. One-off R^2 dips are handled by W1 (#37), not by re-centering.
    *Source: decisions/0004-witness-band.md (amendments 2026-09-27, 2026-09-28); ROADMAP 8.5 witness rule.*

36. **A bimodal lane cannot have a single-median band.**
    Fenwick2D.update, over 15 solo runs, sits in a HIGH mode (~3.3, about 3/4 of runs) and a LOW mode
    (~1.99, about 1/4): a V8 compile-mode split on the added S1 compare, both clean O(log^2 n) fits
    with R^2 > 0.99. A band floor inside the low mode would fail ~1 run in 8. Band for that lane only:
    [0.6 x low median, 1.4 x high median] = [1.19, 4.62]; R^2 floor and foil untouched. Revisit if the
    S1 compare is restructured.
    *Source: decisions/0004-witness-band.md (Amendment 2026-09-28).*

37. **A near-floor R^2 flake is fixed with more work per sample, never a lower floor.**
    W1: a lane that misses ONLY the R^2 floor (slope in band, foil off) is re-measured once; a slope
    or foil miss is never retried (decision = the pure `witnessVerdict`, unit-tested without a sweep).
    T10: CartesianTree.rangeMinIndex (OFF once in 7 at R^2 0.9577) got `CT_ITERS` 200k -> 1M,
    `CT_BATCH` 10 -> 20, `CT_FIT_RUNS` 7 -> 9, floor 0.958 and band unchanged. SegmentTree.update
    still flaked in the 1.4.1 release gate (median-of-9 fit 0.949, retry 0.944, slope 0.739 in band):
    its sweep widened from 2^10..2^16 to 2^4..2^16 (single-fit R^2 0.890-0.990 -> 0.974-0.995, slope
    0.62-0.74), for THAT lane only; floor, [0.43, 1.00] band and foil unchanged.
    *Source: decisions/0004-witness-band.md (1.4.1 amendment); CHANGELOG 1.5.0 (Fixed).*

38. **A coarse browser clock gives bogus slopes.**
    The browser timer quantum (~0.1 ms) made the demo's live fit unreadable and its "max" value one
    timer tick. Live ns/op is now whole ns averaged over >= 2 ms of accumulated steps, the fit is a
    gated static table, and the fake "max" is gone.
    *Source: CHANGELOG 1.5.1 (DM1).*

39. **Inlining and bytecode decisions are facts, not timings -- and a missing platform is a stated gap.**
    The smi audit ran on a PRELIMINARY host (load1 13.5-13.9 vs baseline 2.21, other busy node pids),
    so it reports bytecode length (36 B, variant 27 B, a 30-bit variant 43 B and shape-changing) and
    inlining-budget decisions only (verdict SAME, `_lcgNext` inlined at every warm site, but `link@TF`
    used 740 of 920 and dropped `_arcInsert` / `_merge` / `_reroot`). Whether TurboFan still lowers the
    context-slot `imul` is covered by the t2 logs; the speed A/B is PENDING (CHANGELOG says so).
    *Source: .handoff/research/smi/FINDINGS.md (P1-P3); CHANGELOG [Unreleased].*

40. **Published curves stay inside the gated window; beyond it is disclosed, not gated.**
    The witness fits SkipList `set` over the cache-resident 2^9..2^14 window so the fit sees the
    structural level count, not DRAM latency. The matching disclosure is an ungated random-access
    curve (1e5 -> 1e7). Also: `benchmark/Dimensions.mjs` builds heap priorities with the double-multiply
    LCG `t * 1103515245 + 12345 & 0x7fffffff`, which loses low bits past 2^53 (period ~10k, measured on
    lite-lru); the fix is `Math.imul` (ROADMAP 11, C6), not applied because it changes the input stream.
    *Source: RESEARCH 14.6, 14.7.*

---

## D. Test-gate lessons

41. **A harness test must not inherit the caller's terminal.**
    `test/perf/Harness.test.mjs` failed 18 of 44 when the parent set `FORCE_COLOR` (IDE runners, some
    terminals): child shards inherited it, the spec reporter wrapped glyphs in ANSI escapes, the
    verdict parser read every test as `undefined`. Children now run with `NO_COLOR=1` and no
    `FORCE_COLOR`, and the parser strips ANSI. Reproduced 26/44 with `FORCE_COLOR=1`, 44/44 after,
    with and without it. Test-only.
    *Source: cd75c7f; CHANGELOG [Unreleased] (Fixed).*

42. **Red first, and a shrink-only DEFERRED list.**
    1.4.0 shipped the new perf lanes with known-open cells in a shrink-only DEFERRED list (F6-F10,
    F15, F16, S5, F13), each closed by 1.4.1 with a red-first test; the map has been EMPTY since
    (`test/perf/Kinds.mjs`, torture `G9_DEFERRED`). A README sentence that still said "deferred to
    1.4.1" was caught as stale (#31).
    *Source: CHANGELOG 1.4.0 ("Deferred to 1.4.1"), 1.4.1 (Testing), 1.5.0 (Fixed).*

43. **A parity gate needs an independent reference, a must-fail control, and a fail-on-old check.**
    `test/LcgParity.test.mjs` (5 tests): Treap and SkipList state, priorities and levels against an
    independent reference LCG (7 seeds x 1e5 steps), EulerTourTree priorities (4096 vertices), a
    must-fail control, and a bytecode-length gate (<= 27) that fails on the 1.5.1 build at 36. The
    gate skips on any node but v26.8.2.
    *Source: CHANGELOG [Unreleased]; a4a0d33.*

44. **Fuzz against an oracle that shares nothing with the code.**
    EulerTourTree: contract + boundary + fuzz vs a BFS / adjacency oracle (4 kinds x int / frac,
    >= 80k ops), a LinkCutTree cross-oracle (`connected` agrees on an 80k link/cut stream), non-mutating
    read snapshots, a 2^20 path (no RangeError) and 1e6-op arc-table churn (max probe 18).
    *Source: CHANGELOG 1.5.0 (Testing).*

45. **Every rejected op is a byte-identical no-op; test it with a snapshot of every column.**
    The sum-bound sweep AT the bound stays finite, the 1e308 repros throw `[lite-logn]` and leave state
    unchanged, and `arena` and the PST ctor-NaN hang are tested in a SUBPROCESS (a fatal OOM or a hang
    cannot be asserted in-process).
    *Source: CHANGELOG 1.4.1 (F6, F7, F8, Testing); ROADMAP 8.5 test list.*

46. **A gate must not pin a value that moves.**
    The demo version-trinity test pinned `'1.0.0'` (DM5), failing 2 of 29; the demo gate now follows
    the live version and states its scope (16 of 20 members). The `npm run demo` count went 27/29 ->
    28/28. The witness-data table has its own drift test against `test/witness.mjs`.
    *Source: CHANGELOG 1.5.1 (DM1, DM5, Testing); ROADMAP DM5.*

47. **Door checks are written NaN-safe by construction.**
    `value > bound || value < -bound`, `!(x < bound)`, never `x >= bound`; a bad VALUE returns NaN
    and a wrong container TYPE throws on queries; a mutating method throws before the first write.
    *Source: CHANGELOG 1.4.1 (F7); RESEARCH 12.2.7.*

60. **A converting typed-array sink hides the contract it was meant to check.**
    The first `test/LcgParity.test.mjs` stored each observed `_seed` in an `Int32Array`, and ToInt32
    folded the value before the compare. A mutant that dropped `| 0` (the seed becomes a non-Smi
    double) passed all 5 tests; `>>> 0` was caught only by ETT's single end-of-run check. The observers
    now store into a `Float64Array`, and both mutants fail the Treap and SkipList lanes. An observer
    sink keeps the exact value the contract is about.
    *Source: a4a0d33; review r1 -> r2 diff `.handoff/overlay/smi-lcg-r1/head` vs
    `.handoff/overlay/smi-lcg-r2/head` (test/LcgParity.test.mjs).*

---

## E. Process lessons

48. **One coder and one reviewer; re-loop for a real defect.**
    The ROADMAP 8.5 process ran as one coder, one reviewer (REJECTED: 4 blockers), one fix round and
    a qa pass; the smi-lcg unit ran a research pass, one coder unit plus one fix round, two code
    reviews and a docs unit. REJECTED goes back to the coder, not forward.
    *Source: ROADMAP 8.5 summary; .handoff/NEXT.md ("Burst size").*

49. **Timed runs go through the quiet lock; a NOISY or BUSY host makes them PENDING.**
    `witness`, `test:perf`, `test:perf:kinds`, `test:perf:noinline` and the speed A/B are run with
    `run --strict`; exit 75 / 76 / 2 means no verdict and the step stays PENDING (never re-run
    until green). The CHANGELOG states "Speed A/B: not run (busy host), PENDING" rather than a ratio.
    *Source: .handoff/NEXT.md ("Next burst"); CHANGELOG [Unreleased].*

50. **Shared tooling is run from its home until it is released.**
    lite-utils scripts (`bytecode-budget.sh`, `inlining-budget-diff.sh`) are run from `../LiteUtils`,
    not vendored, until its 1.0.0 (maintainer ruling Q-S2, 2026-11-05); vendor them after. The
    LcgParity bytecode gate is a raw `node --print-bytecode` spawn for the same reason (see #57).
    *Source: .handoff/NEXT.md (Q-S2, Q-S3, FILLERS); .handoff/research/smi/FINDINGS.md.*

51. **The suite git guard is a fact of the workflow.**
    Claude and subagents leave changes in the working tree; the maintainer commits. The guard denies
    history-changing git inside the suite and scans the whole command text, so commit-message files
    are written with the Write tool then copied into place (`git apply` is likewise blocked: use `cp`).
    *Source: LiteLibrariesSuite/CLAUDE.md ("Git"); .handoff/NEXT.md ("Commit (maintainer)").*

---

## F. Open / known limits

52. **MergeSortTree witness band watch.**
    Re-center only on 3 of 3 solo misses by the decisions/0004 rule.
    *Source: .handoff/NEXT.md (FILLERS); decisions/0004-witness-band.md.*

53. **Demo GC soak counts its own forced-GC pauses against its 4 ms limit.**
    Flaky under load; the fix is to exclude them. The soak passes its 64 KB budget (~5 KB projected).
    *Source: .handoff/NEXT.md (FILLERS); CHANGELOG 1.5.1 (DM5).*

54. **No pointer-compressed (Chrome 31-bit Smi) lane on the host.**
    `process.config.variables.v8_enable_pointer_compression` = 0 on the host's Node v26.8.2, so the
    half-of-states-box claim is derived, not measured, and the non-inlined-`_lcgNext` cost on Chrome is
    unknown. Cold Ignition / Sparkplug and an exhausted caller budget are the only residual risk named.
    *Source: .handoff/research/smi/FINDINGS.md (Verdict); CHANGELOG [Unreleased] (Fixed).*

55. **The `_lcgNext` speed A/B is PENDING.**
    The 27 B body should keep TurboFan's NumberImul (one `madd` on arm64, seen in the t2 logs) but the
    median B/A against the A/A null has not run on a quiet host; the inlining diff (T3) and the
    `run --strict` witness / perf gates are queued for the next burst.
    *Source: .handoff/NEXT.md ("Next burst"); CHANGELOG [Unreleased].*

56. **EulerTourTree parity lane is partial.**
    LcgParity compares ETT priorities after build but not `ett._seed` step by step through `link`
    (reviewer nit, still a FILLER).
    *Source: .handoff/NEXT.md (FILLERS); CHANGELOG [Unreleased].*

57. **The LcgParity bytecode gate pins node v26.8.2 only (Q-S3 open).**
    It skips on any other node and needs a re-pin when the host node moves; Q-S2 said nothing is
    gated in lite-logn, so the maintainer decides keep or drop (the parity tests stay either way).
    *Source: .handoff/NEXT.md (Q-S3).*

58. **ROADMAP 11 (cache-conscious track) is gated on lite-signal 1.6.0.**
    Nothing in that section starts before it ships. Order C6 -> C4 -> C3 -> C2 -> C1; C1 `BPlusTree`
    reverses the RESEARCH section 4 B-tree exclusion for the in-memory case and needs the
    maintainer's ruling plus an ADR first. Every speed number in it is REPORTED from another host.
    *Source: ROADMAP section 11; RESEARCH sections 4, 14.*

59. **Known stale text and disclosed limits.**
    decisions/0022 (D-ETT3) still says the `_arcHash` mask is applied as `(h & _arcMask) >>> 0`;
    LogN.js now returns `h & 0x3FFFFFFF` (#19), so the ADR needs an amendment. Disclosed, not bugs:
    Fenwick near ~1e308 magnitude can repeat the O(n) cold recompute under churn; Treap split views
    share `_seed` (identical priority streams); mutation mid-walk on Pairing / Fibonacci is
    unsupported.
    *Source: decisions/0022-eulertourtree.md; LogN.js `_arcHash`; CHANGELOG 1.4.0 (S1, F1, F2).*
