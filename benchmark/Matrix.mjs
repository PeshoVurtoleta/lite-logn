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

/** The four shipped members, in build order. */
export const SUBJECTS = ['BinaryHeap', 'Fenwick', 'SegmentTree', 'SkipList'];

/** The seven gated D1 witness op-rows (member.op), in build order. */
export const OP_ROWS = [
    'BinaryHeap.pop',
    'Fenwick.update', 'Fenwick.prefix',
    'SegmentTree.update', 'SegmentTree.query',
    'SkipList.get', 'SkipList.set',
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
    if (workload === 'ordered') return member === 'SkipList';
    return false;
}

/**
 * Every (member, dimension, baseline) cell the orchestrator runs -- one child
 * process per cell (clean GC/JIT state). The matrix is exactly SUBJECTS x DIMENSIONS
 * (4 x 8 = 32 cells). The counter-foil is an EXTRA comparison carried INSIDE the D1
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
