/**
 * @zakkster/lite-logn -- benchmark applicability matrix (member x dimension x baseline).
 *
 * Repo-only. The matrix is the honesty spine of the suite: it declares, for every
 * (member, dimension) cell, WHICH baseline the member is measured against, and it
 * refuses to fake a number for a cell that does not apply. An unsupported cell
 * emits the STRING "n/a" -- NEVER 0 -- so a reader can never confuse "not
 * applicable" with "measured zero" (fail closed; null is not zero).
 *
 * The PRIMARY foil each member is measured against is the honest O(n) default a
 * working programmer reaches for BEFORE knowing the O(log n) trick -- the exact
 * foils test/witness.mjs fits and shows LEAVING the log line:
 *   - BinaryHeap  vs a sorted-array insert (O(n) shift per insert)
 *   - Fenwick     vs a prefix-array rebuild / naive re-sum (O(n) per op)
 *   - SegmentTree vs a whole-tree rebuild / linear scan-fold (O(n) per op)
 *   - SkipList    vs a sorted-array insert / linear scan (O(n) per op)
 *
 * SkipList additionally carries a COUNTER-FOIL: a native Map/Set, which is O(1)
 * (FLATTER than any log line) but CANNOT answer successor / predecessor / range --
 * the ORDER TAX made visible. It is a counterpoint, not a gated rival (never 0).
 */

/** Sentinel for a cell that does not apply. NEVER 0. */
export const NA = 'n/a';

/** The nine shipped members, in build order. */
export const SUBJECTS = ['BinaryHeap', 'Fenwick', 'SegmentTree', 'SkipList', 'Treap', 'Scapegoat', 'MinMaxHeap', 'SplayTree', 'BinomialHeap'];

/** The twelve gated D1 witness op-rows (member.op), in build order. */
export const OP_ROWS = [
    'BinaryHeap.pop',
    'Fenwick.update', 'Fenwick.prefix',
    'SegmentTree.update', 'SegmentTree.query',
    'SkipList.get', 'SkipList.set',
    'Treap.get',
    'Scapegoat.get',
    'MinMaxHeap.popMin',
    'SplayTree.get',
    'BinomialHeap.popMin',
];

/** The eight measurement dimensions. */
export const DIMENSIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

/** Human titles for the eight dimensions (used by the report + tables). */
export const DIMENSION_TITLES = {
    D1: 'O(log n) Witness fit (r2, slope ns/level, foil r2 -- per op, delegated to test/witness.mjs)',
    D2: 'Amortized cost over a long mixed trace',
    D3: 'Memory footprint + stability',
    D4: 'Cache behaviour (PROXY: dense-iter vs random-lookup + stride sweep)',
    D5: 'Bundle size + tree-shaking (esbuild min + gzip)',
    D6: 'GC pressure + allocation-rate curve (per op-row)',
    D7: 'Scalability across key types + load factors + insertion order (incl. adversarial)',
    D8: 'Workload micro-benchmarks',
};

/** The PRIMARY O(n) foil each member is measured against (the witness foil). */
export const BASELINE = {
    BinaryHeap: 'sorted-array-insert',
    Fenwick: 'prefix-array-rebuild/re-sum',
    SegmentTree: 'whole-tree-rebuild/scan-fold',
    SkipList: 'sorted-array-insert/linear-scan',
    Treap: 'linear-scan',
    Scapegoat: 'linear-scan',
    MinMaxHeap: 'linear-min-scan-and-splice',
    SplayTree: 'linear-scan',
    BinomialHeap: 'linear-min-scan-and-splice',
};

/**
 * The COUNTER-FOIL: an O(1)-but-UNORDERED rival that is FASTER per op than a log
 * line yet CANNOT answer the ordered queries the member exists for. Only SkipList
 * carries one (a native Map: O(1) get/set, but no successor / predecessor / range).
 * Every other member reads NA here -- its whole surface is ordered / positional, so
 * there is no "faster but order-blind" counterpart to show. NA is the STRING, never 0.
 */
export const COUNTER_FOIL = {
    BinaryHeap: NA,
    Fenwick: NA,
    SegmentTree: NA,
    SkipList: 'Map (O(1) get/set, but no successor/predecessor/range -- the order tax)',
    // Treap is also an ordered map with the SAME order tax vs a Map, but the counter-foil
    // is a one-time family illustration carried by SkipList (the family's ordered
    // representative); Treap reads NA here to avoid a redundant second Map comparison.
    Treap: NA,
    // Scapegoat is the family's DETERMINISTIC ordered map with the same Map order-tax, but the
    // counter-foil is the one-time family illustration carried by SkipList; Scapegoat reads NA.
    Scapegoat: NA,
    // MinMaxHeap is a DEPQ (double-ended priority queue), not an ordered map; there is no
    // "faster but order-blind" O(1) rival to a min-max heap (a Map cannot serve either extreme),
    // so it has no counter-foil -- NA (the string, never 0).
    MinMaxHeap: NA,
    // SplayTree is the family's SELF-ADJUSTING ordered map with the same Map order-tax, but the
    // counter-foil is the one-time family illustration carried by SkipList; SplayTree reads NA.
    SplayTree: NA,
    // BinomialHeap is a MERGEABLE priority queue, not an ordered map; there is no "faster but
    // order-blind" O(1) rival to a binomial heap (a Map serves neither the extreme nor meld),
    // so it has no counter-foil -- NA (the string, never 0).
    BinomialHeap: NA,
};

/**
 * The counter-foil name for a member, or NA when it has none.
 * @param {string} member
 * @returns {string}
 */
export function counterFoilFor(member) {
    if (!SUBJECTS.includes(member)) return NA;
    return COUNTER_FOIL[member];
}

/**
 * The fairness-audit rationale for EVERY member: the verdict on its PRIMARY foil.
 * Every lite-logn primary foil is FAIR-ALREADY -- the honest O(n) default a working
 * programmer reaches for before the log trick, not a strawman. SkipList additionally
 * names its COUNTER-FOIL (the order tax) in `counter`; the others read NA there.
 *
 *   verdict  'FAIR-ALREADY' (every member: the O(n) foil is the honest rival)
 *   counter  the COUNTER_FOIL name, or NA
 *   why      a one-line honest justification
 */
export const RATIONALE = {
    BinaryHeap: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a sorted array (bisect to find the slot, shift to keep order) is the O(n)-insert ' +
            'default a dev reaches for before the heap -- the honest rival that motivates O(log n) push/pop.',
    },
    Fenwick: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a plain array with an O(n) prefix rebuild (or a naive re-sum per query) is the honest ' +
            'default before the i & -i trick -- one of point-update OR prefix-sum is always O(n) there.',
    },
    SegmentTree: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a plain array with a linear scan-fold per query (or a whole-tree rebuild per update) is ' +
            'the honest O(n) default before the 2n tree -- the rival that motivates O(log n) range folds.',
    },
    SkipList: {
        verdict: 'FAIR-ALREADY',
        counter: 'Map (O(1) get/set, but no successor/predecessor/range -- the order tax)',
        why: 'a sorted array (O(n) shift per insert) is the honest ordered-map default; the COUNTER-FOIL ' +
            'is a native Map -- FASTER (O(1)) at get/set but ORDER-BLIND (no successor/predecessor/range), ' +
            'so the log tax buys exactly the ordered queries Map cannot answer.',
    },
    Treap: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a linear scan over a plain array (O(n) per lookup) is the honest default before the balanced ' +
            'BST; the treap buys O(log n) get/rank/select/successor. The Map order-tax counterpoint is ' +
            'carried once by SkipList (the family\'s ordered representative), so Treap does not repeat it.',
    },
    Scapegoat: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a linear scan over a plain array (O(n) per lookup) is the honest default before the balanced ' +
            'BST; the scapegoat buys WORST-case O(log n) get + amortized O(log n) set/delete + O(log n) ' +
            'rank/select. The Map order-tax counterpoint is carried once by SkipList, so Scapegoat does not repeat it.',
    },
    MinMaxHeap: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a linear min-scan-and-splice extract over an unordered array (O(n) per extract-min) is the ' +
            'honest DEPQ default before the min-max heap; the min-max heap buys WORST-case O(log n) push / ' +
            'popMin / popMax from ONE array-embedded heap. No Map order-tax counterpoint (a Map serves neither extreme).',
    },
    SplayTree: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a linear scan over a plain array (O(n) per lookup) is the honest default before the self-' +
            'adjusting BST; the splay tree buys AMORTIZED O(log n) get/set/delete AND moves hot keys near ' +
            'the root (faster-than-log on skewed access). The Map order-tax counterpoint is carried once by ' +
            'SkipList (the family\'s ordered representative), so SplayTree does not repeat it.',
    },
    BinomialHeap: {
        verdict: 'FAIR-ALREADY', counter: NA,
        why: 'a linear min-scan-and-splice extract over an unordered array (O(n) per extract-min) is the ' +
            'honest default before the heap; the binomial heap buys O(1)-amortized push, O(log n) popMin, ' +
            'AND O(log n) MELD of two heaps -- the mergeable op a single array-embedded heap cannot do ' +
            'without an O(n) rebuild. No Map order-tax counterpoint (a Map serves neither the extreme nor meld).',
    },
};

/**
 * The baseline for a (member, dimension) cell, or NA when the dimension has no
 * meaningful head-to-head baseline. D5 (bundle size + tree-shaking) is intrinsic
 * to the library itself -- there is no built-in to compare a gzip size against --
 * so it is baseline NA by design, not by omission.
 * @param {string} member
 * @param {string} dim
 * @returns {string} a baseline name, or NA
 */
export function baselineFor(member, dim) {
    if (!SUBJECTS.includes(member)) return NA;
    if (!DIMENSIONS.includes(dim)) return NA;
    if (dim === 'D5') return NA;
    return BASELINE[member];
}

/**
 * Sub-cell key-type applicability for D7. The lite-logn members are numeric /
 * integer substrates: BinaryHeap keys + ids, Fenwick / SegmentTree indices, and
 * SkipList keys are all finite numbers. String and object keys are NOT applicable
 * and must read NA (the canonical place the "n/a, never 0" rule bites).
 * @param {string} member
 * @param {'int'|'string'|'object'} keyType
 * @returns {boolean} true iff the member natively supports that key type
 */
export function supportsKeyType(member, keyType) {
    if (!SUBJECTS.includes(member)) return false;
    return keyType === 'int'; // all four members are numeric/integer substrates
}

/**
 * D8 workload applicability per member. `churn` (insert/delete or update the same
 * keys) applies to every member; `ordered` (successor + range scan) is a SkipList
 * workload only. Inapplicable workloads read NA in the result, never 0.
 * @param {string} member
 * @param {'churn'|'ordered'} workload
 * @returns {boolean}
 */
export function supportsWorkload(member, workload) {
    if (!SUBJECTS.includes(member)) return false;
    if (workload === 'churn') return true;
    if (workload === 'ordered') return member === 'SkipList' || member === 'Treap' || member === 'Scapegoat' || member === 'SplayTree';
    return false;
}

/**
 * Every (member, dimension, baseline) cell the orchestrator runs -- one child
 * process per cell (clean GC/JIT state). The matrix is exactly SUBJECTS x DIMENSIONS
 * (9 x 8 = 72 cells). The counter-foil is an EXTRA comparison carried INSIDE the D1
 * cell (as counterFoil), NOT a new dimension and NOT a separate cell.
 * @returns {{member:string, dim:string, baseline:string, counterFoil:string}[]}
 */
export function cells() {
    const out = [];
    for (const member of SUBJECTS) {
        for (const dim of DIMENSIONS) {
            out.push({
                member, dim,
                baseline: baselineFor(member, dim),
                counterFoil: counterFoilFor(member),
            });
        }
    }
    return out;
}

// ===========================================================================
// Per-op honesty class (Bench v3, RE-WIRED to the O(log n) contract). The shared
// lite-o1 kit keys its OP_CLASS by member and paints ops worst-case/amortized-O(1);
// that is a DIFFERENT family's honesty. Here every gated hot op is O(log n), so the
// table is keyed by `member.op` and each entry states its REAL O(log n) class:
//   - worst-case : the op ALWAYS climbs/descends the full height of a deterministic
//                  structure (heap sift, Fenwick / SegmentTree i&-i walk).
//   - expected   : SkipList's randomized towers make its height a random variable, so
//                  its cost is O(log n) EXPECTED, never worst-case (an unlucky tall
//                  tower is a real MAX-single-insert tail, DISCLOSED, never gated).
// Painting any hot op O(1) is the overclaim this table exists to prevent (O(1) is
// this suite's SIBLING lite-o1's contract, not lite-logn's) -- so no value here may
// carry an "O(1)" token. peek()/topKey()/size/length are O(1) GETTERS, deliberately
// NOT in this table: they are not witness ops (they read a cached scalar, they do not
// climb the structure), so listing them would smuggle an "O(1)" into the honesty set.
// ===========================================================================

/** The O(log n) honesty class label for a worst-case (full-height) op. */
export const OLOGN_WORST = 'O(log n) worst-case';

/** The O(log n) honesty class label for an EXPECTED (randomized-tower) op. */
export const OLOGN_EXPECTED = 'O(log n) expected';

/** The O(log n) honesty class label for an AMORTIZED (rebuild-absorbed) op -- Scapegoat's
 *  DETERMINISTIC set/delete pay for their hard worst-case height bound with an occasional
 *  subtree rebuild, so the per-op cost is O(log n) AMORTIZED, not per-op worst-case. This is
 *  a THIRD honesty class distinct from both worst-case and (randomized) expected. */
export const OLOGN_AMORTIZED = 'O(log n) amortized';

/**
 * The per-op honesty table, keyed `member.op`. Covers the 12 gated witness op-rows
 * (Matrix.OP_ROWS) PLUS the four non-gated-but-honest ops the family surface exposes
 * (BinaryHeap.push climbs the same sift as pop; SkipList.delete descends the same
 * randomized tower as get/set; Treap.set/delete rotate/rewire the same randomized
 * priority-heap height as get). SkipList's and Treap's ops all read EXPECTED, never
 * worst-case.
 */
export const OP_CLASS = Object.freeze({
    'BinaryHeap.push': OLOGN_WORST,   // sift-up the full height of the heap array
    'BinaryHeap.pop': OLOGN_WORST,    // sift-down the full height (the gated witness op)
    'Fenwick.update': OLOGN_WORST,    // climb the i & -i update walk to the root
    'Fenwick.prefix': OLOGN_WORST,    // descend the i & -i prefix walk to 0
    'SegmentTree.update': OLOGN_WORST, // climb leaf -> root
    'SegmentTree.query': OLOGN_WORST,  // fold the two boundary spines up the tree
    'SkipList.get': OLOGN_EXPECTED,   // randomized tower height -> EXPECTED, not worst-case
    'SkipList.set': OLOGN_EXPECTED,   // ditto (+ a DISCLOSED max-single-insert tail)
    'SkipList.delete': OLOGN_EXPECTED, // ditto
    'Treap.get': OLOGN_EXPECTED,      // randomized priority-heap height -> EXPECTED (the gated row)
    'Treap.set': OLOGN_EXPECTED,      // ditto (+ a DISCLOSED max-single-insert rotation-chain tail)
    'Treap.delete': OLOGN_EXPECTED,   // ditto
    'Scapegoat.get': OLOGN_WORST,     // DETERMINISTIC weight-balanced height -> WORST-case (the gated row)
    'Scapegoat.set': OLOGN_AMORTIZED, // an occasional subtree rebuild absorbs the imbalance -> AMORTIZED
    'Scapegoat.delete': OLOGN_AMORTIZED, // ditto (a global rebuild fires when the tree shrinks)
    'MinMaxHeap.push': OLOGN_WORST,   // sift-up the full height of the alternating heap array
    'MinMaxHeap.popMin': OLOGN_WORST, // trickle-down the full height from the root (the gated row)
    'MinMaxHeap.popMax': OLOGN_WORST, // trickle-down the full height from the max-of-{slot1,slot2}
    'SplayTree.get': OLOGN_AMORTIZED, // a read SPLAYS -> DETERMINISTIC amortized O(log n) (the gated row)
    'SplayTree.set': OLOGN_AMORTIZED, // splay + splice -> amortized (a cold deep splay is a DISCLOSED tail)
    'SplayTree.delete': OLOGN_AMORTIZED, // splay + join -> amortized (DETERMINISTIC, no RNG)
    'BinomialHeap.push': OLOGN_AMORTIZED, // a binary carry -> O(1) AMORTIZED (O(log n) worst; a full carry is the tail)
    'BinomialHeap.popMin': OLOGN_WORST,   // unlink extreme + child-reverse + remeld + root rescan (the gated row)
    'BinomialHeap.meld': OLOGN_WORST,     // relink two order-sorted root lists with a binary carry -> full-height worst
});

// ===========================================================================
// clear() invariance witness (Bench v3, RE-WIRED per Table B). ELEVATED to a
// first-class witness for EXACTLY the four SUBJECTS: each returns the structure to
// its pristine EMPTY invariant (heap/list size 0; index-addressed accumulators
// zeroed), retains its fixed backing store (zero-alloc), and stays reusable. The
// CLEAR_WITNESS set is EXACTLY SUBJECTS -- verified against LogN.js (BinaryHeap:239,
// Fenwick:571, SegmentTree:853, SkipList:1349 all expose clear()).
//
// EXCLUDED (named with a reason, never silently dropped -- the same discipline as the
// NA-never-0 rule): NodePool is the PRIVATE, unexported free-list SkipList owns; it
// HAS a clear() (LogN.js:1053) but is not a SUBJECT and its reset is transitively
// covered by SkipList (its sole owner). The read/traverse surface (peek/topKey/size/
// length/prefix/query/get/has + forEach/rangeIter) is not a reuse invariant at all.
// ===========================================================================

/** The members whose clear()+reuse cycle is an elevated first-class witness (= SUBJECTS). */
export const CLEAR_WITNESS = ['BinaryHeap', 'Fenwick', 'SegmentTree', 'SkipList', 'Treap', 'Scapegoat', 'MinMaxHeap', 'SplayTree', 'BinomialHeap'];

/**
 * Everything EXCLUDED from CLEAR_WITNESS, each with a short honest reason. Keys are
 * NOT SUBJECTS (unlike the in-set): NodePool is a private internal, and the getters/
 * traversals are ops, not members -- so the excluded set names WHY the witness is the
 * four SUBJECTS and nothing else, not a per-member membership list.
 */
export const CLEAR_WITNESS_EXCLUDED = Object.freeze({
    NodePool: 'private/unexported free-list (SkipList\'s slot allocator, LogN.js:1053); ' +
        'NOT in SUBJECTS -- its clear() is an internal reset transitively covered by SkipList, ' +
        'never a public reuse invariant',
    getters: 'peek/topKey/size/length/prefix/query/get/has are O(1) reads and forEach/rangeIter ' +
        'are O(n) traversals -- reads, not reuse invariants, so there is nothing to clear',
});

// ===========================================================================
// Claim-honesty classification (Bench v3, MEMBER-AGNOSTIC MACHINERY copied from the
// shared kit, RE-WIRED markers). THREE claim classes -- the doc gate keys off this:
//   - alloc : deterministically PROVEN by the torture gate (0 B/op under --expose-gc),
//             a deterministic assertion, so the wording KEEPS "proven".
//   - timing: EMPIRICALLY WITNESSED (the O(log n) straight-line fit AND every constant
//             claim are OBSERVED, not deduced), so the wording must read "witness" /
//             "empirical" / "we observe" -- NEVER "proven".
//   - cited : "proven" refers to CITED LITERATURE, not a measurement on this host, so
//             the wording KEEPS "proven" (it is a citation, not a claim this suite made).
// A blanket find-replace of "proven" is a BUG: each hit is classified FIRST.
// ===========================================================================

/** The three claim classes. Frozen so a typo is a reference error, not a silent miss. */
export const CLAIM_CLASS = Object.freeze({
    alloc: 'alloc',
    timing: 'timing',
    cited: 'cited',
});

/**
 * The signatures the doc gate uses to recognize a NON-timing "prove*" hit. A line
 * matching a CITED marker is class `cited`; else a line matching an ALLOC marker is
 * class `alloc`; a "prove*" hit matching NEITHER is class `timing` and MUST read
 * witness/empirical, never proven. Order matters: cited is checked before alloc.
 * Markers RE-WIRED for lite-logn: the alloc vocabulary is the family-generic 0-B/op
 * torture wording; the cited vocabulary is the skip-list literature (Pugh 1990) --
 * the only place a complexity fact is a CITATION rather than a host measurement.
 */
export const CLAIM_MARKERS = Object.freeze({
    cited: [/\bPugh\b/, /literature/i],
    alloc: [/0 ?B\/op/i, /zero-alloc/i, /byte-identical/i, /\btorture\b/i],
});

/**
 * Classify a single line/segment that contains a "prove*" hit into its CLAIM_CLASS.
 * Pure. A line with no alloc/cited marker is a TIMING claim (the default) -- so a
 * softened timing line re-hardened back to "proven" classifies as `timing` and the
 * doc gate FAILS it. Fail closed: a non-string is a timing claim (caught).
 * @param {string} line
 * @returns {'alloc'|'timing'|'cited'}
 */
export function classifyClaim(line) {
    const s = typeof line === 'string' ? line : '';
    for (const re of CLAIM_MARKERS.cited) if (re.test(s)) return CLAIM_CLASS.cited;
    for (const re of CLAIM_MARKERS.alloc) if (re.test(s)) return CLAIM_CLASS.alloc;
    return CLAIM_CLASS.timing;
}
