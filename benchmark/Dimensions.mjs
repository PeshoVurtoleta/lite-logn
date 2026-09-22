/**
 * @zakkster/lite-logn -- the eight benchmark dimensions.
 *
 * Repo-only. Each Dk is a (member, opts) -> plain JSON-safe result object; the
 * orchestrator (Bench.mjs) runs one Dk per child process for clean GC/JIT state,
 * and Report.mjs renders the collected results.
 *
 * D1 is the O(log n) WITNESS, and it does NOT re-implement anything: it DELEGATES
 * to the SHIPPED test/witness.mjs -- the same frozen kernels, per-op sweeps, R^2
 * floor (0.958) and per-op slope bands the witness gate uses -- imports its
 * `fitLogLinear`, and reports { r2, slope, foilR2 } per op-row. The FOILS registry
 * below is that op-row -> foil table (7 gated rows + the SkipList counter-foil).
 * D2..D8 are hand-tuned per member the way lite-o1's Dimensions.mjs is.
 *
 * Every result carries a `_check` array: the numbers that MUST be strictly positive
 * for the reading to be non-vacuous (nsPerOp readings, throughputs, byte footprints,
 * element counts). Allocation-per-op and GC-pause figures are NOT in `_check` -- for
 * a zero-GC library 0 is the CORRECT answer, not a vacuous one. A cell that does not
 * apply carries the string "n/a" (Matrix.NA), never 0.
 *
 * This file is NEVER imported by LogN.js; it imports LogN.js the way a consumer does,
 * and test/witness.mjs (repo-only) for the frozen D1 kernels/bands.
 */

import { BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D, SortedArray, PersistentSegTree } from '../LogN.js';
import { MEMBERS as WITNESS_MEMBERS, fitLogLinear } from '../test/witness.mjs';
import {
    prng, median, warm, gcNow, percentile, collect, DEFAULT_SEED,
} from './Harness.mjs';
import {
    NA, SUBJECTS, OP_ROWS, baselineFor, counterFoilFor, supportsKeyType, supportsWorkload,
    CLEAR_WITNESS,
} from './Matrix.mjs';

/** Global sink: every timed op feeds it so V8 cannot dead-code-eliminate a batch. */
export let SINK = 0;
export function sink() { return SINK; }

/** The package root, for the D5 esbuild bundle (resolves ./LogN.js like a consumer). */
export const PKG_DIR = new URL('..', import.meta.url).pathname;

/** hrtime.bigint() as ns (offline lanes only; allocates a BigInt, off the hot body). */
function nowNs() { return Number(process.hrtime.bigint()); }

// ===========================================================================
// The FOILS registry: op-row -> foil, DELEGATED to the frozen witness registry.
// 7 gated op-rows (BinaryHeap.pop, Fenwick.update/prefix, SegmentTree.update/query,
// SkipList.get/set) + the SkipList counter-foil (a native Map: O(1) but ORDER-BLIND).
// The gated rows carry the SHIPPED kernels (run/foil), per-op sweeps and slope bands.
// ===========================================================================

/** op-row key ("Member.op") -> the frozen witness registry entry (kernel + sweep + band). */
export const FOILS = {};
for (const m of WITNESS_MEMBERS) FOILS[m.name + '.' + m.op] = m;
/** The SkipList counter-foil: measured live in D1 (a native Map, O(1) but order-blind). */
FOILS['SkipList.counter'] = {
    kind: 'counter-foil', member: 'SkipList', op: 'counter',
    foilName: 'Map (O(1) get/set, but no successor/predecessor/range)',
};

/** Sanity: the 7 gated op-rows the matrix declares are exactly the ones the witness ships. */
export function foilRowKeys() {
    return OP_ROWS.filter((k) => FOILS[k] && FOILS[k].kind !== 'counter-foil');
}

// ===========================================================================
// Steady-state alloc-free hot-op kernels, one per gated op-row. Each returns
// { obj, op }: `obj` is filled to a bounded steady state, `op` is a single
// O(log n) hot op that keeps the structure bounded (0 B/op after construction).
// ===========================================================================

function kBinaryHeapPop(n) {
    // A full heap of n ids; each op pops the extremum id and re-pushes it with a
    // fresh key -- the O(log n) sift-down + sift-up pair, size steady at n.
    const h = new BinaryHeap(n, 'min');
    const rng = prng(0x1234 ^ n);
    for (let k = 0; k < n; k++) h.push(k, rng());
    let t = 1;
    return {
        obj: h,
        // SINK is kept a 32-bit Smi (`| 0`): an unbounded `SINK += id` would grow past
        // the Smi range (2^31) and box a fresh HeapNumber PER OP -- transient garbage
        // that would masquerade as per-op allocation in D6. `| 0` keeps it alloc-free.
        op: () => { const id = h.pop(); t = (t * 1103515245 + 12345) & 0x7fffffff; h.push(id, t); SINK = (SINK + id) | 0; },
    };
}

function kFenwickUpdate(n) {
    // A seeded tree; each op climbs one full `i & -i` update walk at a walking index.
    const f = new Fenwick(n);
    const rng = prng(0x5151 ^ n);
    for (let i = 0; i < n; i++) f.update(i, rng() & 0xff);
    let i = 0;
    return { obj: f, op: () => { f.update(i, (i & 1) ? 1 : -1); i++; if (i >= n) i = 0; } };
}

function kFenwickPrefix(n) {
    // A seeded tree; each op descends one full `i & -i` prefix walk at a walking index.
    const f = new Fenwick(n);
    const rng = prng(0x7333 ^ n);
    for (let i = 0; i < n; i++) f.update(i, rng() & 0xff);
    let i = 0;
    return { obj: f, op: () => { SINK = (SINK + f.prefix(i)) | 0; i++; if (i >= n) i = 0; } };
}

function kSegUpdate(n) {
    // A seeded sum tree; each op sets a walking leaf and climbs to the root.
    const st = new SegmentTree(n, 'sum');
    const rng = prng(0x5151 ^ n);
    for (let i = 0; i < n; i++) st.update(i, (rng() & 0xffff));
    let i = 0;
    return { obj: st, op: () => { st.update(i, i & 0xffff); i++; if (i >= n) i = 0; } };
}

function kSegQuery(n) {
    // A seeded sum tree; each op folds a walking window [0, i] (the O(log n) fold).
    const st = new SegmentTree(n, 'sum');
    const rng = prng(0x7333 ^ n);
    for (let i = 0; i < n; i++) st.update(i, (rng() & 0xffff));
    let i = 1;
    return { obj: st, op: () => { SINK = (SINK + st.query(0, i)) | 0; i++; if (i >= n) i = 1; } };
}

function kSkipGet(n) {
    // A full ordered map of n keys; each op searches a random resident key. The index
    // is `rng() >>> 1` (drop the high bit) so it stays a 31-bit Smi: a raw uint32 >= 2^31
    // is a HeapNumber, and boxing one PER OP would masquerade as per-op allocation in D6.
    const sl = new SkipList(n, (0x51ED ^ n) >>> 0);
    for (let k = 0; k < n; k++) sl.set(k, k);
    const rng = prng(0x33A5 ^ n);
    return { obj: sl, op: () => { const v = sl.get((rng() >>> 1) % n); if (v !== undefined) SINK = (SINK + v) | 0; } };
}

function kSkipSet(n) {
    // A resident map of n keys with one free slot; each op inserts the integer key `n`
    // (just past the resident [0, n) range, the single free slot) then deletes it -- the
    // O(log n) insert + delete descent pair, size steady at n. An INTEGER (Smi) key is
    // used, not a fractional `+ 0.5` one: a non-integer double is a HeapNumber, and
    // boxing one per op would masquerade as per-op allocation in D6.
    const sl = new SkipList(n + 1, (0x71ED ^ n) >>> 0);
    for (let k = 0; k < n; k++) sl.set(k, k);
    let i = 0;
    return {
        obj: sl,
        op: () => { sl.set(n, i); sl.delete(n); i = (i + 1) | 0; },
    };
}

function kTreapGet(n) {
    // A full ordered map of n keys; each op searches a random resident key. The index
    // is `rng() >>> 1` (drop the high bit) so it stays a 31-bit Smi (a raw uint32 >= 2^31
    // is a HeapNumber, and boxing one per op would masquerade as per-op alloc in D6).
    const tr = new Treap(n, (0x51ED ^ n) >>> 0);
    for (let k = 0; k < n; k++) tr.set(k, k);
    const rng = prng(0x33A5 ^ n);
    return { obj: tr, op: () => { const v = tr.get((rng() >>> 1) % n); if (v !== undefined) SINK = (SINK + v) | 0; } };
}

function kTreapSet(n) {
    // A resident map of n keys with one free slot; each op inserts the integer key `n`
    // (the single free slot, just past the resident [0, n) range) then deletes it -- the
    // O(log n) recursive insert + delete pair, size steady at n. An INTEGER (Smi) key is
    // used, not a fractional one: a non-integer double is a HeapNumber that would
    // masquerade as per-op allocation in D6.
    const tr = new Treap(n + 1, (0x71ED ^ n) >>> 0);
    for (let k = 0; k < n; k++) tr.set(k, k);
    let i = 0;
    return { obj: tr, op: () => { tr.set(n, i); tr.delete(n); i = (i + 1) | 0; } };
}

function kScapegoatGet(n) {
    // A full ordered map of n keys; each op searches a random resident key. The index is
    // `rng() >>> 1` (drop the high bit) so it stays a 31-bit Smi (a raw uint32 >= 2^31 is a
    // HeapNumber, and boxing one per op would masquerade as per-op alloc in D6). Deterministic
    // worst-case O(log n) descent (no RNG in the tree).
    const sg = new Scapegoat(n);
    for (let k = 0; k < n; k++) sg.set(k, k);
    const rng = prng(0x33A5 ^ n);
    return { obj: sg, op: () => { const v = sg.get((rng() >>> 1) % n); if (v !== undefined) SINK = (SINK + v) | 0; } };
}

function kScapegoatSet(n) {
    // A resident map of n keys with one free slot; each op inserts the integer key `n` (the
    // single free slot, just past the resident [0, n) range) then deletes it -- the amortized
    // O(log n) insert + delete pair, size steady at n. An INTEGER (Smi) key is used, not a
    // fractional one: a non-integer double is a HeapNumber that would masquerade as per-op alloc.
    const sg = new Scapegoat(n + 1);
    for (let k = 0; k < n; k++) sg.set(k, k);
    let i = 0;
    return { obj: sg, op: () => { sg.set(n, i); sg.delete(n); i = (i + 1) | 0; } };
}

function kSortedArrayGet(n) {
    // A full ordered map of n keys; each op searches a random resident key with the lower-bound
    // BINARY SEARCH over the contiguous sorted column. The index is `rng() >>> 1` (drop the high
    // bit) so it stays a 31-bit Smi (a raw uint32 >= 2^31 is a HeapNumber, and boxing one per op
    // would masquerade as per-op alloc in D6). Deterministic worst-case O(log n) (no RNG in the map).
    const sa = new SortedArray(n);
    for (let k = 0; k < n; k++) sa.set(k, k); // ascending -> each insert appends (O(1)); build is O(n)
    const rng = prng(0x5A17 ^ n);
    return { obj: sa, op: () => { const v = sa.get((rng() >>> 1) % n); if (v !== undefined) SINK = (SINK + v) | 0; } };
}

function kSortedArraySet(n) {
    // A resident map of n keys [1, n] with one free slot; each op inserts the new MINIMUM key 0 (a
    // full O(n) copyWithin shift UP) then deletes it (a full shift DOWN), size steady at n -- the
    // honest O(n) write the read-optimized member DISCLOSES, exercised in place (copyWithin, no temp,
    // no spread -> zero allocation). An INTEGER (Smi) key/value is used to avoid boxing a HeapNumber.
    const sa = new SortedArray(n + 1);
    for (let k = 1; k <= n; k++) sa.set(k, k);
    let i = 0;
    return { obj: sa, op: () => { sa.set(0, i); sa.delete(0); i = (i + 1) | 0; } };
}

/** A FIXED, bounded version arena for the fill-based dimensions (D3/D4/D6/D7): PersistentSegTree is
 *  index-addressed (its n leaves are its "elements", all live), so a modest fixed version headroom is
 *  enough to populate a non-empty tree without an n-sized arena. clear() rewinds it in place. */
const PST_BENCH_VC = 64;

function kPstQuery(n) {
    // A tree of n leaves plus PST_VERS path-copying versions; each op folds the widest window
    // [1, n-2] over a RANDOM existing version (version does not change the O(log n) descent cost).
    // The index is `rng() >>> 1` (drop the high bit) so it stays a 31-bit Smi. Deterministic
    // worst-case O(log n), read-only (0 B/op).
    const VERS = 16;
    const t = new PersistentSegTree(n, VERS, 'sum');
    let cur = 0;
    const seed = prng(0x9E37 ^ n);
    for (let v = 0; v < VERS; v++) cur = t.update(cur, (seed() >>> 1) % n, (seed() >>> 1) & 0xffff);
    const versions = t.versions;
    const rng = prng(0x5A17 ^ n);
    const lo = 1, hi = n - 2;
    return { obj: t, op: () => { const ver = (rng() >>> 1) % versions; SINK = (SINK + (t.query(ver, lo, hi) | 0)) | 0; } };
}

function kPstUpdate(n) {
    // The persistent path-copying update: branch off the head (or v0 every 4th) with a bump-allocated
    // O(log n) path, sharing off-path subtrees. The fixed version arena is recycled in place via
    // clear() before it fills (rewind the bump cursor + re-seed v0 in the SAME store, 0 B/op), so the
    // steady op runs forever without reallocating. An INTEGER (Smi) key/value avoids boxing.
    const VC = 512;
    const t = new PersistentSegTree(n, VC, 'sum');
    let cur = 0, i = 0;
    const rng = prng(0x1234 ^ n);
    return { obj: t, op: () => {
        if (t.versions > VC - 1) { t.clear(); cur = 0; }
        cur = t.update((i & 3) ? cur : 0, (rng() >>> 1) % n, i & 0xffff);
        i = (i + 1) | 0;
    } };
}

function kMinMaxHeapPopMin(n) {
    // A full min-max heap of n ids; each op pops the minimum id and re-pushes it with a
    // fresh key -- the O(log n) trickle-down + sift-up pair, size steady at n. SINK is
    // kept a 32-bit Smi (`| 0`) to avoid boxing a HeapNumber per op (D6 alloc hygiene).
    const h = new MinMaxHeap(n);
    const rng = prng(0x1234 ^ n);
    for (let k = 0; k < n; k++) h.push(k, rng());
    let t = 1;
    return {
        obj: h,
        op: () => { const id = h.popMin(); t = (t * 1103515245 + 12345) & 0x7fffffff; h.push(id, t); SINK = (SINK + id) | 0; },
    };
}

function kBinomialHeapPopMin(n) {
    // A full binomial heap of n ids; each op pops the extreme id and re-pushes it with a fresh
    // key -- the O(log n) child-reverse+remeld (popMin) + binary-carry (push) pair, size steady
    // at n. SINK is kept a 32-bit Smi (`| 0`) to avoid boxing a HeapNumber per op (D6 hygiene).
    const h = new BinomialHeap(n, 'min');
    const rng = prng(0x1234 ^ n);
    for (let k = 0; k < n; k++) h.push(k, rng());
    let t = 1;
    return {
        obj: h,
        op: () => { const id = h.popMin(); t = (t * 1103515245 + 12345) & 0x7fffffff; h.push(id, t); SINK = (SINK + id) | 0; },
    };
}

function kPairingHeapPopMin(n) {
    // A full pairing heap of n ids; each op pops the extreme id and re-pushes it with a fresh key
    // -- the amortized O(log n) two-pass-combine (popMin) + O(1) root-link (push) pair, size steady
    // at n. SINK is kept a 32-bit Smi (`| 0`) to avoid boxing a HeapNumber per op (D6 hygiene).
    const h = new PairingHeap(n, 'min');
    const rng = prng(0x1234 ^ n);
    for (let k = 0; k < n; k++) h.push(k, rng());
    let t = 1;
    return {
        obj: h,
        op: () => { const id = h.popMin(); t = (t * 1103515245 + 12345) & 0x7fffffff; h.push(id, t); SINK = (SINK + id) | 0; },
    };
}

function kFibonacciHeapPopMin(n) {
    // A full Fibonacci heap of n ids; each op pops the extreme id and re-pushes it with a fresh key
    // -- the amortized O(log n) degree-consolidation (popMin) + O(1) root-splice (push) pair, size
    // steady at n. SINK is kept a 32-bit Smi (`| 0`) to avoid boxing a HeapNumber per op (D6 hygiene).
    const h = new FibonacciHeap(n, 'min');
    const rng = prng(0x1234 ^ n);
    for (let k = 0; k < n; k++) h.push(k, rng());
    let t = 1;
    return {
        obj: h,
        op: () => { const id = h.popMin(); t = (t * 1103515245 + 12345) & 0x7fffffff; h.push(id, t); SINK = (SINK + id) | 0; },
    };
}

function kSplayGet(n) {
    // A full ordered map of n keys; each op searches a random resident key. A splay-get
    // RESTRUCTURES (moves the touched key to the root), so cost is AMORTIZED O(log n). The
    // index is `rng() >>> 1` (drop the high bit) so it stays a 31-bit Smi (a raw uint32 >= 2^31
    // is a HeapNumber, and boxing one per op would masquerade as per-op alloc in D6).
    const sp = new SplayTree(n);
    for (let k = 0; k < n; k++) sp.set(k, k);
    const rng = prng(0x33A5 ^ n);
    return { obj: sp, op: () => { const v = sp.get((rng() >>> 1) % n); if (v !== undefined) SINK = (SINK + v) | 0; } };
}

function kSplaySet(n) {
    // A resident map of n keys with one free slot; each op inserts the integer key `n` (the
    // single free slot, just past the resident [0, n) range) then deletes it -- the amortized
    // O(log n) splay-insert + splay-join pair, size steady at n. An INTEGER (Smi) key is used,
    // not a fractional one: a non-integer double is a HeapNumber that would masquerade as alloc.
    const sp = new SplayTree(n + 1);
    for (let k = 0; k < n; k++) sp.set(k, k);
    let i = 0;
    return { obj: sp, op: () => { sp.set(n, i); sp.delete(n); i = (i + 1) | 0; } };
}

/** The square grid side for a total-cell budget n (a 2D member; cells ~ side^2 <= n). */
function f2dSide(n) { return Math.max(2, Math.floor(Math.sqrt(n))); }

function kFenwick2DUpdate(n) {
    // A seeded side x side grid; each op climbs one full nested `i & -i` update walk at a walking
    // (r, c) coordinate -- the O(log^2 n) point-update, zero allocation after construction.
    const side = f2dSide(n);
    const f = new Fenwick2D(side, side);
    const rng = prng(0x5151 ^ n);
    for (let i = 0; i < side; i++) f.update(i, i, rng() & 0xff);
    let r = 0, c = 0;
    return {
        obj: f,
        op: () => { f.update(r, c, (r & 1) ? 1 : -1); c++; if (c >= side) { c = 0; r++; if (r >= side) r = 0; } },
    };
}

function kFenwick2DRectSum(n) {
    // A seeded side x side grid; each op folds a walking rectangle [0,0]..[i,i] (the O(log^2 n)
    // four-descent inclusion-exclusion). SINK stays a 32-bit Smi (`| 0`) so no HeapNumber is boxed.
    const side = f2dSide(n);
    const f = new Fenwick2D(side, side);
    const rng = prng(0x7333 ^ n);
    for (let i = 0; i < side; i++) f.update(i, i, rng() & 0xff);
    let i = 0;
    return { obj: f, op: () => { SINK = (SINK + (f.rectSum(0, 0, i, i) | 0)) | 0; i++; if (i >= side) i = 0; } };
}

function kSegTree2DUpdate(n) {
    // A seeded side x side grid (sum fold); each op writes an absolute bounded leaf at a walking
    // (r, c) and fixes the leaf row's col-tree then the whole row-tree -- the O(log^2 n) point
    // update, zero allocation after construction.
    const side = f2dSide(n);
    const st = new SegmentTree2D(side, side, 'sum');
    const rng = prng(0x5959 ^ n);
    for (let i = 0; i < side; i++) st.update(i, i, rng() & 0xff);
    let r = 0, c = 0, v = 0;
    return {
        obj: st,
        op: () => { st.update(r, c, v & 0xffff); v++; c++; if (c >= side) { c = 0; r++; if (r >= side) r = 0; } },
    };
}

function kSegTree2DQuery(n) {
    // A seeded side x side grid (sum fold); each op folds a walking rectangle [0,0]..[i,i] (the
    // O(log^2 n) outer-row x inner-col descent). SINK stays a 32-bit Smi (`| 0`), no HeapNumber.
    const side = f2dSide(n);
    const st = new SegmentTree2D(side, side, 'sum');
    const rng = prng(0x7a7a ^ n);
    for (let i = 0; i < side; i++) st.update(i, i, rng() & 0xff);
    let i = 0;
    return { obj: st, op: () => { SINK = (SINK + (st.query(0, 0, i, i) | 0)) | 0; i++; if (i >= side) i = 0; } };
}

/**
 * The steady alloc-free kernel for a gated op-row, or a throw for an unknown row.
 * @param {string} member
 * @param {string} op
 * @param {number} n
 * @returns {{obj:object, op:(i:number)=>void}}
 */
export function makeOpKernel(member, op, n) {
    const key = member + '.' + op;
    switch (key) {
        case 'BinaryHeap.pop': return kBinaryHeapPop(n);
        case 'Fenwick.update': return kFenwickUpdate(n);
        case 'Fenwick.prefix': return kFenwickPrefix(n);
        case 'SegmentTree.update': return kSegUpdate(n);
        case 'SegmentTree.query': return kSegQuery(n);
        case 'SkipList.get': return kSkipGet(n);
        case 'SkipList.set': return kSkipSet(n);
        case 'Treap.get': return kTreapGet(n);
        case 'Scapegoat.get': return kScapegoatGet(n);
        case 'MinMaxHeap.popMin': return kMinMaxHeapPopMin(n);
        case 'SplayTree.get': return kSplayGet(n);
        case 'BinomialHeap.popMin': return kBinomialHeapPopMin(n);
        case 'PairingHeap.popMin': return kPairingHeapPopMin(n);
        case 'FibonacciHeap.popMin': return kFibonacciHeapPopMin(n);
        case 'Fenwick2D.update': return kFenwick2DUpdate(n);
        case 'Fenwick2D.rectSum': return kFenwick2DRectSum(n);
        case 'SegmentTree2D.update': return kSegTree2DUpdate(n);
        case 'SegmentTree2D.query': return kSegTree2DQuery(n);
        case 'SortedArray.get': return kSortedArrayGet(n);
        case 'PersistentSegTree.query': return kPstQuery(n);
        default: throw new Error('[bench] unhandled op-row: ' + key);
    }
}

/** The member's representative steady op (its primary mutating op-row). Fail closed. */
export function makeSubject(member, n) {
    if (member === 'BinaryHeap') return kBinaryHeapPop(n);
    if (member === 'Fenwick') return kFenwickUpdate(n);
    if (member === 'SegmentTree') return kSegUpdate(n);
    if (member === 'SkipList') return kSkipSet(n);
    if (member === 'Treap') return kTreapSet(n);
    if (member === 'Scapegoat') return kScapegoatSet(n);
    if (member === 'MinMaxHeap') return kMinMaxHeapPopMin(n);
    if (member === 'SplayTree') return kSplaySet(n);
    if (member === 'BinomialHeap') return kBinomialHeapPopMin(n);
    if (member === 'PairingHeap') return kPairingHeapPopMin(n);
    if (member === 'FibonacciHeap') return kFibonacciHeapPopMin(n);
    if (member === 'Fenwick2D') return kFenwick2DUpdate(n);
    if (member === 'SegmentTree2D') return kSegTree2DUpdate(n);
    if (member === 'SortedArray') return kSortedArraySet(n);
    if (member === 'PersistentSegTree') return kPstUpdate(n);
    throw new Error('[bench] unhandled member: ' + member);
}

/** The member's gated op-row names (from OP_ROWS). */
function opsOf(member) {
    return OP_ROWS.filter((k) => k.slice(0, k.indexOf('.')) === member).map((k) => k.slice(k.indexOf('.') + 1));
}

// ===========================================================================
// D1 -- the O(log n) Witness fit (DELEGATED to test/witness.mjs). For each of the
// member's gated op-rows: run the SHIPPED kernel across its SHIPPED sweep, fit
// nsPerOp = intercept + slope*log2(n) with the SHIPPED fitLogLinear, and report
// { r2, slope, foilR2 } plus the on-line / off-line verdicts against the SHIPPED
// R^2 floor + per-op slope band. SkipList also surfaces its counter-foil (a native
// Map, O(1) but order-blind) and its DISCLOSED max single insert (expected O(log n)).
// ===========================================================================

/** Measure a native Map get (the counter-foil): O(1), FLATTER than any log line. */
function measureCounterFoil(n, seed) {
    const map = new Map();
    for (let k = 0; k < n; k++) map.set(k, k);
    const rng = prng((seed ^ 0x1234) >>> 0);
    let s = 0;
    const op = () => { const v = map.get(rng() % n); if (v !== undefined) s += v; };
    const ns = median(collect(op, 4000, 60));
    SINK += s;
    return {
        name: 'Map', getNsPerOp: ns, flat: true,
        cannotAnswer: ['successor', 'predecessor', 'rangeIter'],
    };
}

/** DISCLOSED max single insert over a shuffled build (the unlucky-tower tail). */
function measureMaxInsert(n) {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i++) keys[i] = i;
    const rnd = prng(0xF00D ^ n);
    for (let i = n - 1; i > 0; i--) { const j = rnd() % (i + 1); const t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    const sl = new SkipList(n, (0xC0DE ^ n) >>> 0);
    let mx = 0;
    for (let i = 0; i < n; i++) {
        const t0 = nowNs();
        sl.set(keys[i], i);
        const e = nowNs() - t0;
        if (e > mx) mx = e;
    }
    return mx > 0 ? mx : 1; // clamp positive for the vacuity gate (sub-tick -> 1 ns)
}

export function D1(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const points = opts.points ?? Infinity; // truncate every op-row sweep (fast in-process gate)
    // The O(n) foil is O(n^2) total; the fast in-process gate (test/Bench.test.mjs)
    // skips it (opts.foil === false) and verifies the foil leaves the line via the
    // full `npm run bench` + the witness gate instead. Default: compute the foil.
    const withFoil = opts.foil !== false;
    const rows = WITNESS_MEMBERS.filter((m) => m.name === member);
    if (rows.length === 0) throw new Error('[bench] no witness op-rows for ' + member);

    const check = [];
    const ops = [];
    for (const m of rows) {
        const sweep = points < m.sweep.length ? m.sweep.slice(0, Math.max(2, points)) : m.sweep;
        const foilSweep = points < m.foilSweep.length ? m.foilSweep.slice(0, Math.max(2, points)) : m.foilSweep;
        // The x-transform: prior lanes fit on log2(n); Fenwick2D fits on its (log2 n)^2 axis
        // (the frozen witness `xOf` hook). Default = Math.log2, so every prior member is unchanged.
        // Wired at BOTH fit sites (member + foil) so D1 never mis-fits the squared-log member.
        const xOf = m.xOf || Math.log2;

        const xs = [], ys = [];
        for (const n of sweep) { xs.push(xOf(n)); const y = m.run(n); ys.push(y); check.push(y); }
        const fit = fitLogLinear(xs, ys);

        let foilR2 = NA, foilSlope = NA, foilOff = NA;
        if (withFoil) {
            const fxs = [], fys = [];
            for (const n of foilSweep) { fxs.push(xOf(n)); const y = m.foil(n); fys.push(y); check.push(y); }
            const ffit = fitLogLinear(fxs, fys);
            foilR2 = ffit.r2; foilSlope = ffit.slope; foilOff = ffit.r2 < m.r2Floor;
        }

        const onLine = fit.r2 >= m.r2Floor && fit.slope >= m.slopeLo && fit.slope <= m.slopeHi;
        ops.push({
            op: m.op, foilName: m.foilName,
            r2: fit.r2, slope: fit.slope, intercept: fit.intercept,
            foilR2, foilSlope,
            r2Floor: m.r2Floor, slopeLo: m.slopeLo, slopeHi: m.slopeHi,
            onLine, foilOff,
        });
    }

    // SkipList carries the counter-foil (order tax) + the disclosed max single insert.
    let counterFoil = NA, maxSingleOp = NA;
    if (member === 'SkipList') {
        counterFoil = measureCounterFoil(opts.counterN ?? (1 << 14), opts.seed ?? DEFAULT_SEED);
        check.push(counterFoil.getNsPerOp);
        maxSingleOp = measureMaxInsert(opts.maxN ?? (1 << 14));
        check.push(maxSingleOp);
    }

    return {
        dim: 'D1', member, baseline: baselineFor(member, 'D1'), unit: 'ns/level',
        ops,               // [{op, r2, slope, foilR2, ...}] -- the gated witness rows
        counterFoil,       // {name, getNsPerOp, flat, cannotAnswer} for SkipList; NA otherwise
        maxSingleOp,       // ns, disclosed (expected O(log n)) for SkipList; NA otherwise
        _check: check,
    };
}

// ===========================================================================
// D2 -- Amortized cost over a long mixed trace: cumulative ns/op at power-of-two
// checkpoints must stay flat (drift = last/first ~ 1.0). Fixed-capacity members
// never resize; the steady op keeps the structure bounded.
// ===========================================================================

export function D2(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const n = opts.n ?? 8192;
    const total = opts.total ?? (1 << 20); // ~1.05M mixed ops
    const built = makeSubject(member, n);
    const op = built.op;
    warm(op, Math.min(4096, total));

    const ckpts = [];
    for (let c = 1024; c < total; c *= 2) ckpts.push(c);
    ckpts.push(total);

    const points = [];
    let done = 0;
    const t0 = performance.now();
    for (const c of ckpts) {
        for (; done < c; done++) op(done);
        points.push({ ops: done, nsPerOp: ((performance.now() - t0) * 1e6) / done });
    }
    const first = points[0].nsPerOp;
    const last = points[points.length - 1].nsPerOp;
    const drift = first > 0 ? last / first : 0;

    return {
        dim: 'D2', member, baseline: baselineFor(member, 'D2'), unit: 'ns/op',
        points, drift,
        _check: points.map((p) => p.nsPerOp).concat([points[points.length - 1].ops]),
    };
}

// ===========================================================================
// D3 -- Memory footprint + stability: peak backing bytes, fill->delete->refill
// high-water, bytes/live vs theoretical min, and heap after clear().
// ===========================================================================

/** Exact backing-store byte footprint of a member instance (typed-array buffers). */
export function memberBytes(member, obj) {
    if (member === 'BinaryHeap') {
        return obj._key.buffer.byteLength + obj._id.buffer.byteLength + obj._pos.buffer.byteLength;
    }
    if (member === 'Fenwick') return obj._t.buffer.byteLength;
    if (member === 'SegmentTree') return obj._t.buffer.byteLength;
    if (member === 'SkipList') {
        return obj._key.buffer.byteLength + obj._val.buffer.byteLength +
            obj._next.buffer.byteLength + obj._update.buffer.byteLength +
            obj._pool._free.buffer.byteLength;
    }
    if (member === 'Treap') {
        return obj._key.buffer.byteLength + obj._value.buffer.byteLength +
            obj._left.buffer.byteLength + obj._right.buffer.byteLength +
            obj._prio.buffer.byteLength + obj._size.buffer.byteLength +
            obj._pool._free.buffer.byteLength;
    }
    if (member === 'Scapegoat') {
        return obj._key.buffer.byteLength + obj._value.buffer.byteLength +
            obj._left.buffer.byteLength + obj._right.buffer.byteLength +
            obj._size.buffer.byteLength + obj._pool._free.buffer.byteLength +
            obj._flat.buffer.byteLength + obj._stack.buffer.byteLength;
    }
    if (member === 'MinMaxHeap') return obj._key.buffer.byteLength + obj._id.buffer.byteLength;
    if (member === 'SplayTree') {
        return obj._key.buffer.byteLength + obj._value.buffer.byteLength +
            obj._left.buffer.byteLength + obj._right.buffer.byteLength +
            obj._pool._free.buffer.byteLength;
    }
    if (member === 'BinomialHeap') {
        return obj._key.buffer.byteLength + obj._id.buffer.byteLength +
            obj._parent.buffer.byteLength + obj._child.buffer.byteLength +
            obj._sibling.buffer.byteLength + obj._order.buffer.byteLength +
            obj._pool._free.buffer.byteLength;
    }
    if (member === 'PairingHeap') {
        return obj._key.buffer.byteLength + obj._id.buffer.byteLength +
            obj._parent.buffer.byteLength + obj._child.buffer.byteLength +
            obj._sibling.buffer.byteLength + obj._pos.buffer.byteLength +
            obj._owner.buffer.byteLength + obj._pool._free.buffer.byteLength;
    }
    if (member === 'FibonacciHeap') {
        return obj._key.buffer.byteLength + obj._id.buffer.byteLength +
            obj._left.buffer.byteLength + obj._right.buffer.byteLength +
            obj._child.buffer.byteLength + obj._parent.buffer.byteLength +
            obj._degree.buffer.byteLength + obj._mark.buffer.byteLength +
            obj._pos.buffer.byteLength + obj._owner.buffer.byteLength +
            obj._bucket.buffer.byteLength + obj._pool._free.buffer.byteLength;
    }
    if (member === 'Fenwick2D') return obj._t.buffer.byteLength;
    if (member === 'SegmentTree2D') return obj._t.buffer.byteLength;
    if (member === 'SortedArray') return obj._key.buffer.byteLength + obj._value.buffer.byteLength;
    if (member === 'PersistentSegTree') {
        return obj._val.buffer.byteLength + obj._left.buffer.byteLength +
            obj._right.buffer.byteLength + obj._roots.buffer.byteLength;
    }
    throw new Error('[bench] unhandled member: ' + member);
}

/** Theoretical minimum bytes per LIVE element for a member (the dense payload). */
export function theoreticalMinPerLive(member) {
    if (member === 'BinaryHeap') return 12; // key (Float64, 8) + id (Uint32, 4) per live entry
    if (member === 'Fenwick') return 8;     // one Float64 tree cell per element
    if (member === 'SegmentTree') return 16; // two Float64 cells (2n array) per element
    if (member === 'SkipList') return 16;    // key (Float64, 8) + val (Float64, 8) per live entry
    if (member === 'Treap') return 16;       // key (Float64, 8) + value (Float64, 8) per live entry
    if (member === 'Scapegoat') return 16;   // key (Float64, 8) + value (Float64, 8) per live entry
    if (member === 'MinMaxHeap') return 12;  // key (Float64, 8) + id (Uint32, 4) per live entry
    if (member === 'SplayTree') return 16;   // key (Float64, 8) + value (Float64, 8) per live entry
    if (member === 'BinomialHeap') return 12; // key (Float64, 8) + id (Uint32, 4) per live entry
    if (member === 'PairingHeap') return 12; // key (Float64, 8) + id (Uint32, 4) per live entry
    if (member === 'FibonacciHeap') return 12; // key (Float64, 8) + id (Uint32, 4) per live entry
    if (member === 'Fenwick2D') return 8;    // one Float64 tree cell per grid cell
    if (member === 'SegmentTree2D') return 32; // four Float64 tree cells (4RC array) per grid cell
    if (member === 'SortedArray') return 16; // key (Float64, 8) + value (Float64, 8) per live entry
    if (member === 'PersistentSegTree') return 32; // the v0 tree is ~2 nodes/element * 16 B (val 8 + 2 child ptrs 8)
    throw new Error('[bench] unhandled member: ' + member);
}

/** The member's live-element count (its `size`/`length` semantics). */
function liveCount(member, obj) {
    if (member === 'Fenwick' || member === 'SegmentTree') return obj.length; // all cells always live
    if (member === 'Fenwick2D') return obj.rows * obj.cols;                  // every grid cell is live
    if (member === 'SegmentTree2D') return obj.rows * obj.cols;              // every grid cell is live
    if (member === 'PersistentSegTree') return obj.length;                   // index-addressed: n leaves are the elements
    return obj.size;
}

function fillMember(member, obj, count) {
    if (member === 'BinaryHeap') { obj.clear(); for (let k = 0; k < count; k++) obj.push(k, k); return; }
    if (member === 'Fenwick') { obj.clear(); for (let i = 0; i < count; i++) obj.update(i, 1); return; }
    if (member === 'SegmentTree') { obj.clear(); for (let i = 0; i < count; i++) obj.update(i, i & 0xffff); return; }
    if (member === 'SkipList') { obj.clear(); for (let k = 0; k < count; k++) obj.set(k, k); return; }
    if (member === 'Treap') { obj.clear(); for (let k = 0; k < count; k++) obj.set(k, k); return; }
    if (member === 'Scapegoat') { obj.clear(); for (let k = 0; k < count; k++) obj.set(k, k); return; }
    if (member === 'MinMaxHeap') { obj.clear(); for (let k = 0; k < count; k++) obj.push(k, k); return; }
    if (member === 'SplayTree') { obj.clear(); for (let k = 0; k < count; k++) obj.set(k, k); return; }
    if (member === 'BinomialHeap') { obj.clear(); for (let k = 0; k < count; k++) obj.push(k, k); return; }
    if (member === 'PairingHeap') { obj.clear(); for (let k = 0; k < count; k++) obj.push(k, k); return; }
    if (member === 'FibonacciHeap') { obj.clear(); for (let k = 0; k < count; k++) obj.push(k, k); return; }
    if (member === 'Fenwick2D') { obj.clear(); const R = obj.rows, C = obj.cols; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) obj.update(r, c, 1); return; }
    if (member === 'SegmentTree2D') { obj.clear(); const R = obj.rows, C = obj.cols; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) obj.update(r, c, 1); return; }
    if (member === 'SortedArray') { obj.clear(); for (let k = 0; k < count; k++) obj.set(k, k); return; }
    if (member === 'PersistentSegTree') {
        // PST is index-addressed (n fixed leaves); "fill" = clear + a bounded chain of path-copying
        // updates that seed values (the version arena is fixed, so bound to its capacity). liveCount
        // is always obj.length, so the target `count` maps to how many leaves get a nonzero value.
        obj.clear();
        const L = obj.length, m = Math.min(count, obj.versionCapacity);
        let cur = 0;
        for (let k = 0; k < m; k++) cur = obj.update(cur, k % L, (k & 0xffff) + 1);
        return;
    }
    throw new Error('[bench] unhandled member: ' + member);
}

// ===========================================================================
// clear() invariance witness (Bench v3). A first-class, member-scoped witness for
// EXACTLY the four Matrix.CLEAR_WITNESS members (= SUBJECTS): clear() returns the
// structure to its pristine EMPTY invariant, retains its fixed backing store across
// many fill/clear cycles (zero-alloc), and leaves it reusable. This is the same
// retention contract the torture gate proves at 0 B/op; here it is surfaced as a
// named, rendered witness. The "content" measure is member-appropriate: the
// heap/list SIZE for the addressable members (must reach 0), and the residual
// accumulated total for the index-addressed members (Fenwick prefix / SegmentTree
// query over the full range -- both 0 once the backing array is cleared). Fail
// closed on an unhandled member.
// ===========================================================================

/**
 * The live-content scalar for a CLEAR_WITNESS member -- 0 iff cleared, > 0 iff filled.
 * BinaryHeap/SkipList expose `.size`; the index-addressed Fenwick/SegmentTree keep a
 * fixed length, so their "content" is the residual accumulated total (0 == cleared).
 */
function clearContent(member, obj) {
    if (member === 'BinaryHeap' || member === 'SkipList' || member === 'Treap' || member === 'Scapegoat' || member === 'MinMaxHeap' || member === 'SplayTree' || member === 'BinomialHeap' || member === 'PairingHeap' || member === 'FibonacciHeap' || member === 'SortedArray') return obj.size;
    if (member === 'Fenwick') return obj.prefix(obj.length - 1);      // sum of all cells
    if (member === 'SegmentTree') return obj.query(0, obj.length - 1); // fold of all cells
    if (member === 'Fenwick2D') return obj.prefix(obj.rows - 1, obj.cols - 1); // sum of the whole grid
    if (member === 'SegmentTree2D') return obj.query(0, 0, obj.rows - 1, obj.cols - 1); // fold of the whole grid
    if (member === 'PersistentSegTree') return obj.query(obj.versions - 1, 0, obj.length - 1); // fold of the HEAD version (0 once cleared to identity v0)
    throw new Error('[bench] clearWitness: unhandled member ' + member);
}

/** Refill a freshly-cleared CLEAR_WITNESS member to its steady state. Returns the fill. */
function clearWitnessRefill(member, obj, n) {
    if (member === 'BinaryHeap') { for (let k = 0; k < n; k++) obj.push(k, k); return n; }
    if (member === 'SkipList') { for (let k = 0; k < n; k++) obj.set(k, k); return n; }
    if (member === 'Treap') { for (let k = 0; k < n; k++) obj.set(k, k); return n; }
    if (member === 'Scapegoat') { for (let k = 0; k < n; k++) obj.set(k, k); return n; }
    if (member === 'MinMaxHeap') { for (let k = 0; k < n; k++) obj.push(k, k); return n; }
    if (member === 'SplayTree') { for (let k = 0; k < n; k++) obj.set(k, k); return n; }
    if (member === 'BinomialHeap') { for (let k = 0; k < n; k++) obj.push(k, k); return n; }
    if (member === 'PairingHeap') { for (let k = 0; k < n; k++) obj.push(k, k); return n; }
    if (member === 'FibonacciHeap') { for (let k = 0; k < n; k++) obj.push(k, k); return n; }
    if (member === 'Fenwick') { const L = obj.length; for (let i = 0; i < L; i++) obj.update(i, 1); return L; }
    if (member === 'SegmentTree') { const L = obj.length; for (let i = 0; i < L; i++) obj.update(i, (i & 0xffff) + 1); return L; }
    if (member === 'Fenwick2D') { const R = obj.rows, C = obj.cols; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) obj.update(r, c, 1); return R * C; }
    if (member === 'SegmentTree2D') { const R = obj.rows, C = obj.cols; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) obj.update(r, c, (r * C + c) & 0xffff); return R * C; }
    if (member === 'SortedArray') { for (let k = 0; k < n; k++) obj.set(k, k); return n; }
    if (member === 'PersistentSegTree') {
        const L = obj.length, m = Math.min(n, obj.versionCapacity);
        let cur = 0;
        for (let k = 0; k < m; k++) cur = obj.update(cur, k % L, (k & 0xffff) + 1);
        return m;
    }
    throw new Error('[bench] clearWitness: unhandled member ' + member);
}

/**
 * Run the clear() invariance witness for the four CLEAR_WITNESS members.
 * Returns per-member { sizeAfterClear, pristine, reusable, cycles, baseBytes,
 * finalBytes, bytesDelta, zeroAlloc }. Deterministic (no timing in the verdict).
 * @param {{n?:number, cycles?:number}} [opts]
 */
export function clearWitness(opts = {}) {
    const n = opts.n ?? 4096;
    const cycles = opts.cycles ?? 1000;
    const results = {};
    for (const member of CLEAR_WITNESS) {
        const { obj } = makeSubject(member, n);               // built + filled to steady state
        const baseBytes = memberBytes(member, obj);
        obj.clear();
        const sizeAfterClear = clearContent(member, obj);     // MUST be 0
        const refilled = clearWitnessRefill(member, obj, n);  // reuse after clear
        const sizeAfterRefill = clearContent(member, obj);    // MUST be > 0 (non-vacuous)
        let grew = false;
        for (let c = 0; c < cycles; c++) {
            obj.clear();
            clearWitnessRefill(member, obj, n);
            if (memberBytes(member, obj) !== baseBytes) grew = true; // backing store must not grow
        }
        obj.clear();
        const finalBytes = memberBytes(member, obj);
        results[member] = {
            member,
            sizeAfterClear,
            pristine: sizeAfterClear === 0,
            reusable: sizeAfterRefill > 0 && refilled > 0,
            refilledTo: sizeAfterRefill,
            cycles,
            baseBytes,
            finalBytes,
            bytesDelta: finalBytes - baseBytes,                // MUST be 0 (buffer retained)
            zeroAlloc: !grew && finalBytes === baseBytes,
        };
    }
    return { probe: 'clearWitness', members: CLEAR_WITNESS.slice(), results };
}

export function D3(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const n = opts.n ?? 65536;
    let obj;
    if (member === 'BinaryHeap') obj = new BinaryHeap(n, 'min');
    else if (member === 'Fenwick') obj = new Fenwick(n);
    else if (member === 'SegmentTree') obj = new SegmentTree(n, 'sum');
    else if (member === 'SkipList') obj = new SkipList(n);
    else if (member === 'Treap') obj = new Treap(n);
    else if (member === 'Scapegoat') obj = new Scapegoat(n);
    else if (member === 'MinMaxHeap') obj = new MinMaxHeap(n);
    else if (member === 'SplayTree') obj = new SplayTree(n);
    else if (member === 'BinomialHeap') obj = new BinomialHeap(n, 'min');
    else if (member === 'PairingHeap') obj = new PairingHeap(n, 'min');
    else if (member === 'FibonacciHeap') obj = new FibonacciHeap(n, 'min');
    else if (member === 'Fenwick2D') { const side = f2dSide(n); obj = new Fenwick2D(side, side); }
    else if (member === 'SegmentTree2D') { const side = f2dSide(n); obj = new SegmentTree2D(side, side, 'sum'); }
    else if (member === 'SortedArray') obj = new SortedArray(n);
    else if (member === 'PersistentSegTree') obj = new PersistentSegTree(n, PST_BENCH_VC, 'sum');
    else throw new Error('[bench] unhandled member: ' + member);

    gcNow();
    const heapBase = process.memoryUsage().heapUsed;

    const live = n; // fill to a full load (all four cap at n live elements/cells)
    fillMember(member, obj, live);
    gcNow();
    const heapFull = process.memoryUsage().heapUsed;
    const bytesFull = memberBytes(member, obj);
    const liveNow = Math.max(1, liveCount(member, obj));

    // fill -> delete-most -> refill high-water (fixed-capacity members reuse the SAME
    // backing store: the byte footprint is a constant by design, stated not implicit).
    fillMember(member, obj, Math.max(1, live >> 3)); // delete ~7/8
    fillMember(member, obj, live);                    // refill to full
    const bytesRefill = memberBytes(member, obj);
    const highWater = Math.max(bytesFull, bytesRefill);

    // After clear(): backing buffers are retained (fixed capacity) -- deliberate.
    obj.clear();
    gcNow();
    const heapAfterClear = process.memoryUsage().heapUsed;

    const bytesPerLive = bytesFull / liveNow;
    const theoMin = theoreticalMinPerLive(member);

    // Load-factor curve: bytes-per-live at each fill fraction of capacity. BinaryHeap
    // + SkipList shrink their live set (bytes-per-live RISES ~1/loadFactor over the
    // fixed backing store); Fenwick + SegmentTree are INDEX-ADDRESSED (every cell is
    // always live), so their curve is FLAT by design -- stated, not hidden.
    const indexAddressed = (member === 'Fenwick' || member === 'SegmentTree' || member === 'Fenwick2D' || member === 'SegmentTree2D' || member === 'PersistentSegTree');
    const loadFactorCurve = [];
    for (const lf of (opts.loadFactors ?? [0.25, 0.5, 0.75, 1.0])) {
        const target = Math.max(1, Math.round(live * lf));
        fillMember(member, obj, target);
        const b = memberBytes(member, obj);
        const lc = Math.max(1, liveCount(member, obj));
        const bpl = b / lc;
        loadFactorCurve.push({ loadFactor: lf, bytesPerLive: bpl, overheadRatio: bpl / theoMin });
    }
    obj.clear();

    return {
        dim: 'D3', member, baseline: baselineFor(member, 'D3'), unit: 'bytes',
        peakBackingBytes: bytesFull,
        highWaterBytes: highWater,
        bytesPerLive, theoreticalMinPerLive: theoMin,
        overheadRatio: bytesPerLive / theoMin,
        loadFactorCurve,
        indexAddressed,
        fixedCapacity: true,
        heapDeltaFullKB: Math.max(0, (heapFull - heapBase)) / 1024,
        heapAfterClearKB: Math.max(0, (heapAfterClear - heapBase)) / 1024,
        liveElements: liveNow,
        _check: [bytesFull, highWater, bytesPerLive, theoMin, liveNow]
            .concat(loadFactorCurve.map((p) => p.bytesPerLive)),
    };
}

// ===========================================================================
// D4 -- Cache behaviour (PROXY ONLY, labelled PROXY). Dense sequential iteration
// (forEach) vs random single-element lookup, plus a working-set stride sweep.
// NO native perf counters, NO perf-stat shell-out (portable proxy).
// ===========================================================================

function denseIterNsPerElem(member, obj, reps) {
    let acc = 0;
    // PersistentSegTree has no forEach (persistent nodes are shared/immutable, not a single timeline);
    // its dense-iteration analogue is a full O(n) sweep of the HEAD version via at(head, i).
    if (member === 'PersistentSegTree') {
        const head = obj.versions - 1, L = obj.length;
        const size0 = Math.max(1, L);
        for (let i = 0; i < L; i++) acc = (acc + (obj.at(head, i) | 0)) | 0; // warm
        const t0p = performance.now();
        for (let r = 0; r < reps; r++) for (let i = 0; i < L; i++) acc = (acc + (obj.at(head, i) | 0)) | 0;
        SINK += acc;
        const dtp = performance.now() - t0p;
        return dtp > 0 ? (dtp * 1e6) / (size0 * reps) : 1e-3;
    }
    const cb = (x) => { acc = (acc + (x | 0)) | 0; };
    obj.forEach(cb); // warm
    const size = Math.max(1, liveCount(member, obj));
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) obj.forEach(cb);
    SINK += acc;
    const dt = performance.now() - t0;
    const elems = size * reps;
    return dt > 0 ? (dt * 1e6) / elems : 1e-3;
}

/** A random single-element read for the dense-vs-random gap (member-specific). */
function randomLookupOp(member, obj, n, rng) {
    if (member === 'BinaryHeap') return () => { if (obj.has(rng() % n)) SINK++; };
    if (member === 'Fenwick') return () => { SINK += obj.prefix(rng() % n); };
    if (member === 'SegmentTree') return () => { const i = rng() % n; SINK += obj.query(i, i); };
    if (member === 'SkipList') return () => { const v = obj.get(rng() % n); if (v !== undefined) SINK += v; };
    if (member === 'Treap') return () => { const v = obj.get(rng() % n); if (v !== undefined) SINK += v; };
    if (member === 'Scapegoat') return () => { const v = obj.get(rng() % n); if (v !== undefined) SINK += v; };
    if (member === 'SplayTree') return () => { const v = obj.get(rng() % n); if (v !== undefined) SINK += v; };
    // MinMaxHeap is NOT addressable by key (a DEPQ, not a map); its only O(1) reads are the
    // two extremes. rng parity picks an end so the read is not constant-folded. PROXY-only.
    if (member === 'MinMaxHeap') return () => { const v = (rng() & 1) ? obj.peekMax() : obj.peekMin(); if (v !== undefined) SINK += v; };
    // BinomialHeap is NOT addressable by key (a mergeable PQ, not a map); its only O(1) read is
    // the cached extreme root. rng is consumed to keep the call shape uniform. PROXY-only.
    if (member === 'BinomialHeap') return () => { const v = obj.peekMin(); if (v !== undefined) SINK += (v + (rng() & 1)) | 0; };
    // PairingHeap IS addressable by id (has(id) is O(1) over the arena-wide reverse map). Probe a
    // random resident id -- the addressable random-read analogue. PROXY-only.
    if (member === 'PairingHeap') return () => { if (obj.has(rng() % n)) SINK++; };
    // FibonacciHeap IS addressable by id like PairingHeap: probe a random resident id. PROXY-only.
    if (member === 'FibonacciHeap') return () => { if (obj.has(rng() % n)) SINK++; };
    // Fenwick2D is index-addressed by (r, c): a random 2D prefix read is its addressable analogue.
    if (member === 'Fenwick2D') return () => { SINK += obj.prefix(rng() % obj.rows, rng() % obj.cols); };
    // SegmentTree2D is index-addressed by (r, c): a random 1x1 rectangle fold is its analogue.
    if (member === 'SegmentTree2D') return () => { const r = rng() % obj.rows, c = rng() % obj.cols; SINK += obj.query(r, c, r, c); };
    // SortedArray is key-addressed: a random resident-key get (its contiguous binary search) is the analogue.
    if (member === 'SortedArray') return () => { const v = obj.get(rng() % n); if (v !== undefined) SINK += v; };
    // PersistentSegTree is index-addressed: a random single-leaf read of the HEAD version (its O(log n)
    // point descent) is the analogue.
    if (member === 'PersistentSegTree') { const head = obj.versions - 1; return () => { SINK += obj.at(head, rng() % n) | 0; }; }
    throw new Error('[bench] unhandled member: ' + member);
}

function seqLookupOp(member, obj, n) {
    let i = 0;
    if (member === 'BinaryHeap') return () => { if (obj.has(i)) SINK++; i++; if (i >= n) i = 0; };
    if (member === 'Fenwick') return () => { SINK += obj.prefix(i); i++; if (i >= n) i = 0; };
    if (member === 'SegmentTree') return () => { SINK += obj.query(i, i); i++; if (i >= n) i = 0; };
    if (member === 'SkipList') return () => { const v = obj.get(i); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    if (member === 'Treap') return () => { const v = obj.get(i); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    if (member === 'Scapegoat') return () => { const v = obj.get(i); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    if (member === 'SplayTree') return () => { const v = obj.get(i); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    // MinMaxHeap has no per-key read; the O(1) minimum read is its sequential analogue. PROXY-only.
    if (member === 'MinMaxHeap') return () => { const v = obj.peekMin(); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    // BinomialHeap: same -- the cached extreme root is the only O(1) read. PROXY-only.
    if (member === 'BinomialHeap') return () => { const v = obj.peekMin(); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    // PairingHeap IS addressable by id: sequential has(id) probe (its addressable read). PROXY-only.
    if (member === 'PairingHeap') return () => { if (obj.has(i)) SINK++; i++; if (i >= n) i = 0; };
    // FibonacciHeap IS addressable by id: sequential has(id) probe (its addressable read). PROXY-only.
    if (member === 'FibonacciHeap') return () => { if (obj.has(i)) SINK++; i++; if (i >= n) i = 0; };
    // Fenwick2D is index-addressed by (r, c): a sequential 2D prefix read (row-major) is its analogue.
    if (member === 'Fenwick2D') return () => { SINK += obj.prefix(i % obj.rows, i % obj.cols); i++; if (i >= n) i = 0; };
    // SegmentTree2D is index-addressed by (r, c): a sequential 1x1 rectangle fold (row-major) analogue.
    if (member === 'SegmentTree2D') return () => { const r = i % obj.rows, c = i % obj.cols; SINK += obj.query(r, c, r, c); i++; if (i >= n) i = 0; };
    // SortedArray is key-addressed: a sequential resident-key get (ascending scan of the search) analogue.
    if (member === 'SortedArray') return () => { const v = obj.get(i); if (v !== undefined) SINK += v; i++; if (i >= n) i = 0; };
    // PersistentSegTree is index-addressed: a sequential single-leaf read of the HEAD version (row-major).
    if (member === 'PersistentSegTree') { const head = obj.versions - 1; return () => { SINK += obj.at(head, i) | 0; i++; if (i >= n) i = 0; }; }
    throw new Error('[bench] unhandled member: ' + member);
}

/** Build a full instance of `n` live elements for the D4 iteration/lookup sweeps. */
function buildFull(member, n) {
    let obj;
    if (member === 'BinaryHeap') { obj = new BinaryHeap(n, 'min'); for (let k = 0; k < n; k++) obj.push(k, k); }
    else if (member === 'Fenwick') { obj = new Fenwick(n); for (let i = 0; i < n; i++) obj.update(i, 1); }
    else if (member === 'SegmentTree') { obj = new SegmentTree(n, 'sum'); for (let i = 0; i < n; i++) obj.update(i, i & 0xffff); }
    else if (member === 'SkipList') { obj = new SkipList(n); for (let k = 0; k < n; k++) obj.set(k, k); }
    else if (member === 'Treap') { obj = new Treap(n); for (let k = 0; k < n; k++) obj.set(k, k); }
    else if (member === 'Scapegoat') { obj = new Scapegoat(n); for (let k = 0; k < n; k++) obj.set(k, k); }
    else if (member === 'MinMaxHeap') { obj = new MinMaxHeap(n); for (let k = 0; k < n; k++) obj.push(k, k); }
    else if (member === 'SplayTree') {
        // A splay tree's shape depends on its insert/access history. A SORTED-COLD build
        // (ascending set, no intervening access) degenerates to a depth-n chain, and the
        // non-splaying forEach re-descends from the root per element -> O(n^2) traversal that
        // stalls the D4 dense-iter stride sweep at large n (~19 min at n=1e6). A real splay
        // tree has been ACCESSED and is shallow, so build in a deterministic shuffled order
        // (depth ~O(log n), forEach ~O(n log n)) -- representative of use, not the artificial
        // sorted-cold worst case. Cold setup: the order[] alloc is off every timed body.
        obj = new SplayTree(n);
        const order = new Uint32Array(n);
        for (let k = 0; k < n; k++) order[k] = k;
        const rng = prng(DEFAULT_SEED ^ 0x53504c59); // 'SPLY'
        for (let i = n - 1; i > 0; i--) { const j = rng() % (i + 1); const t = order[i]; order[i] = order[j]; order[j] = t; }
        for (let k = 0; k < n; k++) obj.set(order[k], order[k]);
    }
    else if (member === 'BinomialHeap') { obj = new BinomialHeap(n, 'min'); for (let k = 0; k < n; k++) obj.push(k, k); }
    else if (member === 'PairingHeap') { obj = new PairingHeap(n, 'min'); for (let k = 0; k < n; k++) obj.push(k, k); }
    else if (member === 'FibonacciHeap') { obj = new FibonacciHeap(n, 'min'); for (let k = 0; k < n; k++) obj.push(k, k); }
    else if (member === 'Fenwick2D') { const side = f2dSide(n); obj = new Fenwick2D(side, side); for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) obj.update(r, c, 1); }
    else if (member === 'SegmentTree2D') { const side = f2dSide(n); obj = new SegmentTree2D(side, side, 'sum'); for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) obj.update(r, c, 1); }
    else if (member === 'SortedArray') { obj = new SortedArray(n); for (let k = 0; k < n; k++) obj.set(k, k); } // ascending set appends O(1); build is O(n)
    else if (member === 'PersistentSegTree') {
        // n leaves + a bounded chain of path-copying versions (index-addressed: all n leaves live).
        obj = new PersistentSegTree(n, PST_BENCH_VC, 'sum');
        let cur = 0;
        for (let k = 0; k < PST_BENCH_VC; k++) cur = obj.update(cur, k % n, (k & 0xffff) + 1);
    }
    else throw new Error('[bench] unhandled member: ' + member);
    return obj;
}

export function D4(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const sizes = opts.sizes ?? [1e3, 1e4, 1e5, 1e6];
    const reps = opts.reps ?? 200;

    const strideSweep = [];
    for (const raw of sizes) {
        const s = raw | 0;
        const obj = buildFull(member, s);
        const r = Math.max(2, Math.round(reps / Math.max(1, s / 1e3)));
        strideSweep.push({ workingSet: s, nsPerElem: denseIterNsPerElem(member, obj, r) });
    }

    // Dense (sequential) vs random single-element lookup. Every member has a random
    // read (has / prefix / query / get), so the gap applies to all four (no NA here).
    const gapN = (opts.gapN ?? 1e5) | 0;
    const obj = buildFull(member, gapN);
    const rng = prng((opts.seed ?? DEFAULT_SEED) ^ 0x55555555);
    const batch = 5000, samples = 60;
    const denseNsPerOp = median(collect(seqLookupOp(member, obj, gapN), batch, samples));
    const randomNsPerOp = median(collect(randomLookupOp(member, obj, gapN, rng), batch, samples));
    const gap = denseNsPerOp > 0 ? randomNsPerOp / denseNsPerOp : NA;

    const check = strideSweep.map((p) => p.nsPerElem).concat([denseNsPerOp, randomNsPerOp]);

    return {
        dim: 'D4', member, baseline: baselineFor(member, 'D4'), unit: 'ns',
        proxy: true,
        strideSweep, denseNsPerOp, randomNsPerOp, gap,
        _check: check,
    };
}

// ===========================================================================
// D5 -- Bundle size + tree-shaking. esbuild (DEV-only dep) minify + node:zlib
// gzip: a single-member import vs the all-member import. Single must be << all.
// ===========================================================================

export async function D5(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const esbuild = await import('esbuild');
    const { gzipSync } = await import('node:zlib');

    async function bundle(exportsSrc) {
        const res = await esbuild.build({
            stdin: { contents: exportsSrc, resolveDir: PKG_DIR, loader: 'js' },
            bundle: true, minify: true, format: 'esm', write: false, treeShaking: true,
            legalComments: 'none',
        });
        const code = res.outputFiles[0].text;
        return { min: Buffer.byteLength(code), gzip: gzipSync(Buffer.from(code)).length };
    }

    const single = await bundle('export { ' + member + " } from './LogN.js';\n");
    const all = await bundle("export * from './LogN.js';\n");
    const ratio = all.gzip > 0 ? single.gzip / all.gzip : 1;

    return {
        dim: 'D5', member, baseline: NA, unit: 'bytes',
        single, all, ratio,
        underForty: ratio < 0.4, // falsifiable: single-member < 40% of all-member
        _check: [single.min, single.gzip, all.min, all.gzip],
    };
}

// ===========================================================================
// D6 -- GC pressure + allocation-rate CURVE over n = 1e3..1e6, PER OP-ROW. Extends
// the standing 0 B/op gate into a measured curve for each of the member's gated
// op-rows (7 kernels across the four members). Allocation bytes/op and GC pause are
// NOT in _check (0 is the correct answer for a zero-GC library); throughput + op
// counts are.
// ===========================================================================

async function withGcObserver(fn) {
    const { PerformanceObserver, constants } = await import('node:perf_hooks');
    let major = 0, minor = 0, totalMs = 0, maxMs = 0;
    const MAJOR = constants.NODE_PERFORMANCE_GC_MAJOR;
    const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            const kind = (e.detail && e.detail.kind) != null ? e.detail.kind : e.kind;
            if (kind === MAJOR) major++; else minor++;
            totalMs += e.duration;
            if (e.duration > maxMs) maxMs = e.duration;
        }
    });
    obs.observe({ entryTypes: ['gc'] });
    fn();
    await new Promise((r) => setTimeout(r, 30)); // GC entries arrive asynchronously
    obs.disconnect();
    return { major, minor, totalMs, maxMs };
}

export async function D6(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const sizes = opts.sizes ?? [1e3, 1e4, 1e5, 1e6];
    const ops = opts.ops ?? 1e6;
    const perOp = [];
    const check = [];
    let worstMajor = 0, worstPausePerM = 0, allZero = true;

    // Alloc rate is the MIN clean heapUsed delta over PASSES independent passes with NO
    // observer attached -- the min-over-batches asymmetry the witness uses. Heap-delta
    // accounting only ADDS to a truly-zero kernel's reading (young-gen sampling jitter),
    // never subtracts from a real allocator's, so a genuinely-0 kernel hits ~0 on its
    // best pass while an alloc-per-op regression stays positive on EVERY pass. The GC
    // stats (major/minor/pause) come from a SEPARATE observer pass, because the
    // PerformanceObserver itself buffers entry objects (~0.7 B/op) and would otherwise
    // be charged to the kernel. This is measurement QUALITY only, NOT a widened budget:
    // the precise 0 B/op proof stays node --expose-gc test/torture.mjs (lite-gc-profiler).
    const PASSES = opts.passes ?? 5;
    for (const opName of opsOf(member)) {
        const points = [];
        for (const raw of sizes) {
            const n = raw | 0;
            const built = makeOpKernel(member, opName, n);
            const op = built.op;
            warm(op, Math.min(1e5, ops));

            // Clean alloc-rate passes (no observer perturbing heapUsed).
            let minDelta = Infinity, bestElapsedMs = Infinity;
            for (let pass = 0; pass < PASSES; pass++) {
                gcNow();
                const heapBefore = process.memoryUsage().heapUsed;
                const t0 = performance.now();
                for (let i = 0; i < ops; i++) op(i);
                const elapsedMs = performance.now() - t0;
                const delta = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
                if (delta < minDelta) minDelta = delta;
                if (elapsedMs < bestElapsedMs) bestElapsedMs = elapsedMs;
            }

            // One observer pass for the GC-pause curve (its own alloc is not charged above).
            gcNow();
            const gc = await withGcObserver(() => { for (let i = 0; i < ops; i++) op(i); });
            const { major, minor, totalMs, maxMs } = gc;

            const rawBpo = minDelta / ops;
            const bytesPerOp = rawBpo < 1 ? 0 : Math.round(rawBpo); // sub-byte noise -> 0
            const opsPerMs = bestElapsedMs > 0 && isFinite(bestElapsedMs) ? ops / bestElapsedMs : Infinity;
            const pausePerMillion = (totalMs / ops) * 1e6;

            if (major > worstMajor) worstMajor = major;
            if (pausePerMillion > worstPausePerM) worstPausePerM = pausePerMillion;
            if (bytesPerOp !== 0) allZero = false;

            points.push({
                n, ops, bytesPerOp, opsPerMs,
                gcMajor: major, gcMinor: minor, gcPauseMs: totalMs, gcMaxMs: maxMs,
                pauseMsPerMillion: pausePerMillion,
            });
            check.push(opsPerMs, ops);
        }
        perOp.push({ op: opName, points, zeroAlloc: points.every((p) => p.bytesPerOp === 0) });
    }

    return {
        dim: 'D6', member, baseline: baselineFor(member, 'D6'), unit: 'B/op',
        perOp, maxMajor: worstMajor, maxPauseMsPerMillion: worstPausePerM,
        zeroAlloc: allZero,
        _check: check, // throughput + op counts (positive). Alloc + pause are ALLOWED 0.
    };
}

// ===========================================================================
// D7 -- Scalability across key types + load factors + insertion order. The
// lite-logn members are numeric substrates: string + object keys read NA (never 0).
// Insertion order (sorted / random / adversarial) is COMPARISON/ORDER-sensitive:
// applicable to BinaryHeap + SkipList, NA for the INDEX-ADDRESSED Fenwick +
// SegmentTree (positional, order-invariant) -- another honest n/a.
// ===========================================================================

/** Time building a fresh instance of n elements in a given key order. ns/op. */
function buildOrderNs(member, n, order) {
    const keys = new Float64Array(n);
    if (order === 'sorted') { for (let i = 0; i < n; i++) keys[i] = i; }
    else if (order === 'adversarial') { for (let i = 0; i < n; i++) keys[i] = n - 1 - i; } // reverse
    else { // random
        for (let i = 0; i < n; i++) keys[i] = i;
        const rnd = prng(0x2468 ^ n);
        for (let i = n - 1; i > 0; i--) { const j = rnd() % (i + 1); const t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    }
    const reps = Math.max(2, Math.round(4e6 / n));
    let elapsed = 0, count = 0;
    for (let r = 0; r < reps; r++) {
        if (member === 'BinaryHeap') {
            const h = new BinaryHeap(n, 'min');
            const t0 = performance.now();
            for (let i = 0; i < n; i++) h.push(i, keys[i]);
            elapsed += performance.now() - t0;
            SINK += h.size;
        } else if (member === 'Treap') {
            const tr = new Treap(n, 0x13 >>> 0);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) tr.set(keys[i], i);
            elapsed += performance.now() - t0;
            SINK += tr.size;
        } else if (member === 'Scapegoat') {
            const sg = new Scapegoat(n);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) sg.set(keys[i], i);
            elapsed += performance.now() - t0;
            SINK += sg.size;
        } else if (member === 'MinMaxHeap') {
            const mmh = new MinMaxHeap(n);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) mmh.push(i, keys[i]);
            elapsed += performance.now() - t0;
            SINK += mmh.size;
        } else if (member === 'SplayTree') {
            const sp = new SplayTree(n);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) sp.set(keys[i], i);
            elapsed += performance.now() - t0;
            SINK += sp.size;
        } else if (member === 'BinomialHeap') {
            const bh = new BinomialHeap(n, 'min');
            const t0 = performance.now();
            for (let i = 0; i < n; i++) bh.push(i, keys[i]);
            elapsed += performance.now() - t0;
            SINK += bh.size;
        } else if (member === 'PairingHeap') {
            const ph = new PairingHeap(n, 'min');
            const t0 = performance.now();
            for (let i = 0; i < n; i++) ph.push(i, keys[i]);
            elapsed += performance.now() - t0;
            SINK += ph.size;
        } else if (member === 'FibonacciHeap') {
            const fh = new FibonacciHeap(n, 'min');
            const t0 = performance.now();
            for (let i = 0; i < n; i++) fh.push(i, keys[i]);
            elapsed += performance.now() - t0;
            SINK += fh.size;
        } else { // SkipList
            const sl = new SkipList(n, 0x13 >>> 0);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) sl.set(keys[i], i);
            elapsed += performance.now() - t0;
            SINK += sl.size;
        }
        count += n;
    }
    return (elapsed * 1e6) / count;
}

function loadOpNs(member, n, fillFrac) {
    const built = makeSubject(member, Math.max(1, Math.round(n * fillFrac)));
    return median(collect(built.op, 4000, 60));
}

export function D7(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const n = opts.n ?? 65536;

    const intNs = median(collect(makeSubject(member, n).op, 4000, 60));
    const keyTypes = {
        int: supportsKeyType(member, 'int') ? intNs : NA,
        string: supportsKeyType(member, 'string') ? intNs : NA,
        object: supportsKeyType(member, 'object') ? intNs : NA,
    };

    const loadFactors = [];
    for (const lf of (opts.loadFactors ?? [0.3, 0.5, 0.7, 0.9])) {
        loadFactors.push({ loadFactor: lf, nsPerOp: loadOpNs(member, n, lf) });
    }
    const nearFullNs = loadOpNs(member, n, 0.99);

    // Insertion order: applicable only to the comparison/order-sensitive members.
    const orderSensitive = (member === 'BinaryHeap' || member === 'SkipList' || member === 'Treap' || member === 'Scapegoat' || member === 'MinMaxHeap' || member === 'SplayTree' || member === 'BinomialHeap' || member === 'PairingHeap' || member === 'FibonacciHeap');
    const on = opts.orderN ?? Math.min(n, 1 << 14);
    const insertionOrder = orderSensitive
        ? {
            sorted: buildOrderNs(member, on, 'sorted'),
            random: buildOrderNs(member, on, 'random'),
            adversarial: buildOrderNs(member, on, 'adversarial'),
        }
        : NA;

    const check = [intNs, nearFullNs].concat(loadFactors.map((l) => l.nsPerOp));
    if (typeof insertionOrder === 'object') {
        check.push(insertionOrder.sorted, insertionOrder.random, insertionOrder.adversarial);
    }

    return {
        dim: 'D7', member, baseline: baselineFor(member, 'D7'), unit: 'ns/op',
        keyTypes, loadFactors, nearFullNs, insertionOrder,
        orderSensitive, justResizedNs: NA, resizes: false,
        _check: check,
    };
}

// ===========================================================================
// D8 -- Workload micro-benchmarks: churn (insert/delete or update the same keys --
// all members) + ordered scan (successor + rangeIter -- SkipList only). Inapplicable
// workloads read NA (never 0).
// ===========================================================================

export function churnNs(member, n, seed) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    return median(collect(makeSubject(member, n).op, 4000, 60));
}

/** Ordered-scan workload (SkipList / Treap / Scapegoat / SplayTree): successor walk + bounded rangeIter scan. */
function orderedNs(member, n, seed) {
    const obj = member === 'Treap'
        ? new Treap(n, (seed ^ 0x1357) >>> 0)
        : member === 'Scapegoat'
            ? new Scapegoat(n)
            : member === 'SplayTree'
                ? new SplayTree(n)
                : new SkipList(n, (seed ^ 0x1357) >>> 0);
    for (let k = 0; k < n; k++) obj.set(k, k);
    let key = 0;
    const succ = () => { const s = obj.successor(key); if (s !== undefined) SINK += s; key++; if (key >= n - 1) key = 0; };
    const succNs = median(collect(succ, 4000, 60));

    // rangeIter: scan a bounded window; ns per YIELDED key (window keeps it O(window)).
    const W = Math.min(64, n);
    let lo = 0;
    const t0 = performance.now();
    const reps = 20000;
    let seen = 0;
    for (let r = 0; r < reps; r++) {
        for (const k of obj.rangeIter(lo, lo + W - 1)) { SINK += k; seen++; }
        lo++; if (lo + W >= n) lo = 0;
    }
    const scanNs = seen > 0 ? ((performance.now() - t0) * 1e6) / seen : 1e-3;
    return { successorNsPerOp: succNs, rangeScanNsPerKey: scanNs };
}

export function D8(member, opts = {}) {
    if (!SUBJECTS.includes(member)) throw new Error('[bench] unhandled member: ' + member);
    const n = opts.n ?? 65536;
    const seed = opts.seed ?? DEFAULT_SEED;

    const churn = { nsPerOp: churnNs(member, n, seed) };

    let ordered = NA;
    if (supportsWorkload(member, 'ordered')) ordered = orderedNs(member, n, seed);

    const check = [churn.nsPerOp];
    if (typeof ordered === 'object') check.push(ordered.successorNsPerOp, ordered.rangeScanNsPerKey);

    return {
        dim: 'D8', member, baseline: baselineFor(member, 'D8'), unit: 'ns/op',
        churn, ordered,
        _check: check,
    };
}

// ===========================================================================
// Fixed-seed workload TRACE hash (the determinism gate). Deterministic given the
// seed: two runs at the same seed produce byte-identical hashes. Timing plays no
// part -- this hashes the WORKLOAD (the op-argument stream), not its latency.
// ===========================================================================

const TRACE_UNIVERSE = 65536;

export function traceHash(member, seed = DEFAULT_SEED, length = 100000) {
    // All four members are numeric-key/index substrates -- mode 0 (uint32 keys over
    // TRACE_UNIVERSE). The dispatch is still EXPLICIT + fail-closed so a future 5th
    // member cannot silently inherit a trace universe.
    let mode;
    if (member === 'BinaryHeap' || member === 'Fenwick' ||
        member === 'SegmentTree' || member === 'SkipList' || member === 'Treap' ||
        member === 'Scapegoat' || member === 'MinMaxHeap' || member === 'SplayTree' ||
        member === 'BinomialHeap' || member === 'PairingHeap' || member === 'FibonacciHeap' ||
        member === 'Fenwick2D' || member === 'SegmentTree2D' || member === 'SortedArray' ||
        member === 'PersistentSegTree') mode = 0;
    else throw new Error('[bench] unhandled member: ' + member);

    const rng = prng(seed);
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < length; i++) {
        const r = rng();
        const x = mode === 0 ? r % TRACE_UNIVERSE : r;
        h = (h ^ (x | 0)) >>> 0;
        h = (Math.imul(h, 16777619)) >>> 0;
        h = (h ^ (r >>> 28)) >>> 0; // fold the op-selector too (trace SHAPE, not just values)
        h = (Math.imul(h, 16777619)) >>> 0;
    }
    return h >>> 0;
}

// ===========================================================================
// Vacuity gate: a dimension that returns an empty array or an impossible 0 (a
// non-positive nsPerOp / throughput / byte figure) must make the process fail.
// ===========================================================================

export function vacuityCheck(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('[bench] vacuous: null/non-object result');
    }
    const chk = result._check;
    if (!Array.isArray(chk) || chk.length === 0) {
        throw new Error('[bench] vacuous: ' + result.dim + '/' + result.member + ' returned no _check values');
    }
    for (const v of chk) {
        if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
            throw new Error('[bench] vacuous: ' + result.dim + '/' + result.member +
                ' impossible value ' + String(v));
        }
    }
    for (const key of ['points', 'strideSweep', 'loadFactors', 'loadFactorCurve', 'ops', 'perOp']) {
        if (Array.isArray(result[key]) && result[key].length === 0) {
            throw new Error('[bench] vacuous: ' + result.dim + '/' + result.member +
                ' empty array ' + key);
        }
    }
    return true;
}

/** Dispatch table: run one dimension by name (async, since D5/D6 are async). */
export async function runDimension(member, dim, opts = {}) {
    switch (dim) {
        case 'D1': return D1(member, opts);
        case 'D2': return D2(member, opts);
        case 'D3': return D3(member, opts);
        case 'D4': return D4(member, opts);
        case 'D5': return D5(member, opts);
        case 'D6': return D6(member, opts);
        case 'D7': return D7(member, opts);
        case 'D8': return D8(member, opts);
        default: throw new Error('[bench] unknown dimension ' + String(dim));
    }
}
