/**
 * @zakkster/lite-logn -- the KIND-crossed allocation harness (stage G, v1.4.0).
 *
 * The 1.3.0 perf + torture gates fed every op a `& 0xffff` Smi, so no double ever
 * crossed a call and the boxing defects (F3 / F4 / F7-F11) were invisible. This
 * file is the gate that CAN see a box: it drives EVERY public hot op of ALL 19
 * members with inputs from a Float64Array of the non-Smi KINDS the audit named,
 * counts minor GCs (scavenges) over a long window under a PINNED new-space, and
 * compares against a per-shard SELF-CALIBRATED budget derived from a
 * one-HeapNumber-per-op teeth re-measured before AND after the lanes.
 *
 * REPO-ONLY dev infra: not in package.json files[]; LogN.js stays byte-identical
 * when this file changes. Imported by test/perf/Kinds.test.mjs (the node:test gate,
 * G5) and orchestrated across child processes by test/perf/Lanes.mjs (G6).
 *
 * The driver rules (RESEARCH.md 12.4, ROADMAP 8.1, reviewer probes):
 *   1. Inputs come from a Float64Array, never `(t * K) & 0xffff` recomputed per op.
 *   2. The hot loop runs in fixed 2048-op CHUNKS after a 200-chunk warm-up.
 *   3. The per-op accumulator is a FUNCTION LOCAL, written ONCE per chunk to a sink.
 *   4. GC entries arrive asynchronously: await a settle tick before reading.
 *   5. An ordered-map lane KEYS with the kind input (fill set(IN[i], i), query
 *      IN[k]), or the non-Smi key never crosses the compare (F10 blindness).
 *   6. The new-space is PINNED (--min-semi-space-size=4 == --max) so the one-box
 *      scale does not drift between the fresh process and the node:test import
 *      (the reviewer saw 24 -> 12), and the process is single-tier
 *      (--no-concurrent-recompilation) so a background recompile cannot flip a
 *      lane between 12 and 662 (the reviewer saw both for the same lane).
 */

import { PerformanceObserver, constants } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
    BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap,
    SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D,
    SortedArray, PersistentSegTree, MergeSortTree, WaveletTree, CartesianTree,
    LinkCutTree,
} from '../../LogN.js';

// --- constants (G2) ---------------------------------------------------------
export const CHUNK = 2048;          // ops per hot-loop call
export const WARM_CHUNKS = 200;     // 200 x 2048 warm-up ops (in setup, before measure)
export const N = 200000;            // the audit's N
export const WINDOW = 16;           // 16N measured ops (reviewer: long enough that B1 >= 8 holds)
export const MEAS_CHUNKS = Math.round((WINDOW * N) / CHUNK); // 16N ops in 2048-op chunks
const INLEN = 4096;
const INMASK = INLEN - 1;
const SINKLEN = 1024;
const SINKMASK = SINKLEN - 1;
const CAP = 4096;
const MASK = CAP - 1;
const KCAP = 8192;                  // ordered-map capacity headroom for distinct kind keys
const FLUSH_MS = 60;

const GC_MINOR = constants.NODE_PERFORMANCE_GC_MINOR; // === 1

// --- G1: makeInputs(kind) ---------------------------------------------------
// s = (i*2654435761 >>> 0) & 0xffff is a Smi hash, DISTINCT for i in [0, 4096)
// (an odd multiplier is a bijection mod 2^16). Each kind lifts it out of Smi range
// (or not) exactly as the audit specified.
export function makeInputs(kind) {
    const a = new Float64Array(INLEN);
    for (let i = 0; i < INLEN; i++) {
        const s = (i * 2654435761 >>> 0) & 0xffff;
        switch (kind) {
            case 'int': a[i] = s; break;
            case 'frac': a[i] = s + 0.37; break;
            case 'p31': a[i] = 2 ** 31 + s; break;
            case 'n31': a[i] = -(2 ** 31) - s; break;
            case 'p53': a[i] = 2 ** 53 - s; break;
            case 'p30': a[i] = 2 ** 30 + s; break;
            default: throw new Error('[Kinds] unknown kind: ' + String(kind));
        }
    }
    return a;
}

export const ALL_KINDS = ['int', 'frac', 'p31', 'n31', 'p53'];
export const GCD_KINDS = ['int', 'p31', 'p53'];      // gcd door rejects frac / negatives
export const P30_KINDS = ['p30'];

// --- async minor-GC counter (rule 4) ----------------------------------------
let _minor = 0;
const _obs = new PerformanceObserver((list) => {
    const es = list.getEntries();
    for (let i = 0; i < es.length; i++) {
        const d = es[i].detail;
        if (d && d.kind === GC_MINOR) _minor++;
    }
});
_obs.observe({ entryTypes: ['gc'] });
function minorNow() { return _minor; }
function flush() { return new Promise((r) => setTimeout(r, FLUSH_MS)); }

// --- G3: the teeth (they deliberately box) ----------------------------------
export function teethOneBoxState() { const box = [{}]; return { box }; }
export function teethOneBox(st, IN, base, sink, si) {
    const box = st.box;
    let acc = 0;
    for (let j = 0; j < CHUNK; j++) {
        const t = (base + j) | 0;
        box[0] = IN[t & INMASK];   // one HeapNumber box per op
        acc += box[0];
    }
    sink[si & SINKMASK] = acc;
}
export function teethTwoBoxState() { const box = [{}, {}]; return { box }; }
export function teethTwoBox(st, IN, base, sink, si) {
    const box = st.box;
    let acc = 0;
    for (let j = 0; j < CHUNK; j++) {
        const t = (base + j) | 0;
        box[0] = IN[t & INMASK];        // two HeapNumber boxes per op
        box[1] = IN[(t + 1) & INMASK];
        acc += box[0] + box[1];
    }
    sink[si & SINKMASK] = acc;
}

// --- G2: the chunked driver -------------------------------------------------
const _sink = new Float64Array(SINKLEN);
export async function measureRun(makeState, run, kind) {
    const st = makeState(kind);
    const IN = makeInputs(kind);
    let base = 0;
    for (let c = 0; c < WARM_CHUNKS; c++) {
        run(st, IN, base, _sink, c & SINKMASK);
        base = (base + CHUNK) | 0;
    }
    await flush();
    const lo = minorNow();
    for (let c = 0; c < MEAS_CHUNKS; c++) {
        run(st, IN, base, _sink, c & SINKMASK);
        base = (base + CHUNK) | 0;
    }
    await flush();
    const scav = minorNow() - lo;
    if (_sink[0] === Infinity && _sink[1] === -Infinity) throw new Error('unreachable');
    return scav;
}

// ===========================================================================
// builders -- each fills a member with kind values / KEYS (F10 blindness fix)
// ===========================================================================
function orderedMapKeyed(Cls, kind, seed) {
    const v = makeInputs(kind);
    const t = seed !== undefined ? new Cls(KCAP, seed) : new Cls(KCAP);
    for (let i = 0; i < INLEN; i++) t.set(v[i], i);    // KEYS are the kind values
    return t;
}
function fillFenwick(kind) { const f = new Fenwick(CAP); const v = makeInputs(kind); for (let i = 0; i < CAP; i++) f.set(i, v[i & INMASK]); return f; }
function fillSeg(kind, fold) { const s = new SegmentTree(CAP, fold); const v = makeInputs(kind); for (let i = 0; i < CAP; i++) s.update(i, v[i & INMASK]); return s; }
function fillSeg2d(kind, fold) { const side = 64; const s = new SegmentTree2D(side, side, fold); const v = makeInputs(kind); for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) s.update(r, c, v[(r * side + c) & INMASK]); return { s, side }; }
function fillFen2d(kind) { const side = 64; const f = new Fenwick2D(side, side); const v = makeInputs(kind); for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) f.set(r, c, v[(r * side + c) & INMASK]); return { f, side }; }
function fillPst(kind, fold) { const v = makeInputs(kind); const seed = new Float64Array(CAP); for (let i = 0; i < CAP; i++) seed[i] = v[i & INMASK]; return PersistentSegTree.build(seed, 4096, fold); }
function fillHeap(Cls, kind, kd) { const h = new Cls(CAP, kd || 'min'); const v = makeInputs(kind); for (let i = 0; i < CAP; i++) h.push(i, v[i & INMASK]); return h; }
function fillMinMax(kind) { const h = new MinMaxHeap(CAP); const v = makeInputs(kind); for (let i = 0; i < CAP; i++) h.push(i, v[i & INMASK]); return h; }
function fillStaticSrc(kind) { const v = makeInputs(kind); const src = new Float64Array(CAP); for (let i = 0; i < CAP; i++) src[i] = v[i & INMASK]; return src; }
function fillLct(kind, fold) { const t = new LinkCutTree(CAP, fold); const v = makeInputs(kind); for (let i = 0; i < CAP; i++) t.setValue(i, v[i & INMASK]); for (let i = 1; i < CAP; i++) t.link(i, i - 1); return t; }
// N2: warm segGcd across gcd / min / max BEFORE building the sum instance.
function fillLctN2(kind, fold) {
    for (const wf of ['gcd', 'min', 'max', 'sum']) {
        const w = new LinkCutTree(256, wf);
        for (let i = 0; i < 256; i++) w.setValue(i, (i * 2654435761 >>> 0) & 0x7f);
        for (let i = 1; i < 256; i++) w.link(i, i - 1);
        let a = 0; for (let r = 0; r < 4000; r++) a += w.pathAggregate(r & 255, (r * 3 + 1) & 255);
        if (a === Infinity) throw new Error('unreachable');
    }
    return fillLct(kind, fold);
}

// ===========================================================================
// generic ordered-map runners (KEY with the kind input, query the kind input)
// ===========================================================================
const runMapGet = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.get(IN[k & INMASK]); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; };
const runMapHas = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (t.has(IN[k & INMASK])) a += 1; } sink[si & SINKMASK] = a; };
const runMapSet = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; t.set(IN[k & INMASK], k & INMASK); a += (k & INMASK); } sink[si & SINKMASK] = a; };
const runMapSucc = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.successor(IN[k & INMASK]); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; };
const runMapPred = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.predecessor(IN[k & INMASK]); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; };
const runMapRank = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.rank(IN[k & INMASK]); } sink[si & SINKMASK] = a; };
const runMapSelect = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.select(k & INMASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; };

// A map lane per op. Cls is the ordered-map class; seed set for SkipList.
// delete+set churn (F16): delete the kind key, re-insert it. One distinct kind double
// crosses per cycle (k=1); on 1.3.0 the delete path's key phi / return boxes extra, so
// this reads ~2 boxes and is RED (F16, a stage-M fix), not a clean k=1 boundary lane.
const runMapDelete = (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const key = IN[k & INMASK]; if (t.delete(key)) a += 1; t.set(key, k & INMASK); } sink[si & SINKMASK] = a; };
function mapLanes(name, Cls, group, ops, seed) {
    const mk = (k) => orderedMapKeyed(Cls, k, seed);
    const table = {
        get: runMapGet, has: runMapHas, set: runMapSet, successor: runMapSucc,
        predecessor: runMapPred, rank: runMapRank, select: runMapSelect, delete: runMapDelete,
    };
    // k = boundary doubles crossing (non-Smi kinds): a returned key adds one.
    const kOf = { get: 1, has: 1, set: 1, successor: 2, predecessor: 2, rank: 1, select: 1, delete: 1 };
    return ops.map((op) => ({ id: name + '.' + op, io: 'doubleIO', k: kOf[op], group, make: mk, run: table[op] }));
}

// ===========================================================================
// the lane registry (G4): every member x its public hot ops x kinds
// io: an op that TAKES or RETURNS a double is 'doubleIO' (S7 <= 1-box floor);
// a pure integer-id / boolean / index op is 'zero' (must be 0).
// ===========================================================================
const RAW_LANES = [
    // ---- BinaryHeap (addressable min-heap; keys are doubles) ----
    { id: 'BinaryHeap.push/pop', io: 'doubleIO', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.pop(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.changeKey', io: 'doubleIO', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; h.changeKey(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.topKey', io: 'doubleIO', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.topKey(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.keyOf', io: 'doubleIO', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = h.keyOf(k & MASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.peek', io: 'zero', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peek(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.has', io: 'zero', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (h.has(k & MASK)) a += 1; } sink[si & SINKMASK] = a; } },
    { id: 'BinaryHeap.remove', io: 'doubleIO', group: 'binheap', make: (k) => fillHeap(BinaryHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = k & MASK; if (h.remove(id)) h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },

    // ---- Fenwick (values are doubles) ----
    { id: 'Fenwick.set', io: 'doubleIO', group: 'fenwick', make: fillFenwick,
      run: (f, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; f.set(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick.update', io: 'doubleIO', group: 'fenwick', make: fillFenwick,
      run: (f, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; f.update(k & MASK, (k & 1) ? IN[k & INMASK] : -IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick.prefix', io: 'doubleIO', group: 'fenwick', make: fillFenwick,
      run: (f, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.prefix(k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick.rangeSum', io: 'doubleIO', group: 'fenwick', make: fillFenwick,
      run: (f, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += f.rangeSum(lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick.at', io: 'doubleIO', group: 'fenwick', make: fillFenwick,
      run: (f, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.at(k & MASK); } sink[si & SINKMASK] = a; } },
    // F11 / S6: setFrom reads the value from a caller-owned Float64Array INSIDE -> no double crosses
    // the boundary -> ZERO in BOTH shards (the plain `set` stays the one-box control). The src buffer
    // is a fresh finite Float64Array (built once in make); i steps the range.
    { id: 'Fenwick.setFrom', io: 'zero', k: 0, group: 'fenwick', make: (k) => ({ f: fillFenwick(k), src: fillStaticSrc(k) }),
      run: (st, IN, base, sink, si) => { const f = st.f, src = st.src; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; f.setFrom(src, k & MASK); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    // lite-pick weighted-sampling descent: takes a double target (k=1 arg only where not inlined),
    // returns an INDEX (no return box). The targets are drawn UNIFORMLY in (0, total] (a precomputed
    // Float64Array of u*total), so the descent takes MANY subtracting steps -- the realistic sampling
    // case where the pre-fix `let rest = target` boxed ~7/op under noinline; the unbox-via-scratch fix
    // reads 0 (normal, inlined) / one arg box (ni-). Raw IN targets (tiny vs total) would take almost
    // no steps and give the lane no teeth. Targets are non-Smi (u fractional) for every kind.
    { id: 'Fenwick.search', io: 'doubleIO', k: 1, argKindless: true, group: 'fenwick',
      make: (k) => { const f = new Fenwick(CAP); const v = makeInputs(k); let total = 0; for (let i = 0; i < CAP; i++) { const w = v[i & INMASK] < 0 ? -v[i & INMASK] : v[i & INMASK]; f.set(i, w); total += w; } const targets = new Float64Array(INLEN); for (let i = 0; i < INLEN; i++) { const u = ((i * 2654435761 >>> 0) & 0xffff) / 65536; targets[i] = (u === 0 ? 0.5 : u) * total; } return { f, targets }; },
      run: (st, IN, base, sink, si) => { const f = st.f, tg = st.targets; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.search(tg[k & INMASK]); } sink[si & SINKMASK] = a; } },
    // searchFrom reads the target from a Float64Array INSIDE -> no double crosses -> ZERO in BOTH
    // shards (the 0-box slot sibling of search; the plain search stays the k=1 boundary control).
    { id: 'Fenwick.searchFrom', io: 'zero', k: 0, group: 'fenwick',
      make: (k) => { const f = new Fenwick(CAP); const v = makeInputs(k); let total = 0; for (let i = 0; i < CAP; i++) { const w = v[i & INMASK] < 0 ? -v[i & INMASK] : v[i & INMASK]; f.set(i, w); total += w; } const targets = new Float64Array(INLEN); for (let i = 0; i < INLEN; i++) { const u = ((i * 2654435761 >>> 0) & 0xffff) / 65536; targets[i] = (u === 0 ? 0.5 : u) * total; } return { f, targets }; },
      run: (st, IN, base, sink, si) => { const f = st.f, tg = st.targets; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.searchFrom(tg, k & INMASK); } sink[si & SINKMASK] = a; } },

    // ---- Fenwick2D ----
    { id: 'Fenwick2D.update', io: 'doubleIO', group: 'fenwick2d', make: fillFen2d,
      run: (st, IN, base, sink, si) => { const f = st.f, s = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & (s - 1), c = (k >> 6) & (s - 1); f.update(r, c, IN[k & INMASK]); a += r; } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick2D.set', io: 'doubleIO', group: 'fenwick2d', make: fillFen2d,
      run: (st, IN, base, sink, si) => { const f = st.f, s = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & (s - 1), c = (k >> 6) & (s - 1); f.set(r, c, IN[k & INMASK]); a += r; } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick2D.prefix', io: 'doubleIO', group: 'fenwick2d', make: fillFen2d,
      run: (st, IN, base, sink, si) => { const f = st.f, s = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.prefix(k & (s - 1), (k >> 6) & (s - 1)); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick2D.rectSum', io: 'doubleIO', group: 'fenwick2d', make: fillFen2d,
      run: (st, IN, base, sink, si) => { const f = st.f, s = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & 55, c = (k >> 6) & 55; a += f.rectSum(r, c, r + 8, c + 8); } sink[si & SINKMASK] = a; } },
    { id: 'Fenwick2D.at', io: 'doubleIO', group: 'fenwick2d', make: fillFen2d,
      run: (st, IN, base, sink, si) => { const f = st.f, s = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += f.at(k & (s - 1), (k >> 6) & (s - 1)); } sink[si & SINKMASK] = a; } },

    // ---- SegmentTree 1D (folds; sum/min/max cross all kinds, gcd skips frac/n31).
    // Runs in a NORMAL shard AND the noinline shard: the reviewer's --trace-turbo-
    // inlining shows update IS inlined into `run` yet still boxes frac (293), because
    // the boxing is the segGcd tagged-phi (F4), not an inline-budget artefact. ----
    { id: 'SegmentTree.update', io: 'doubleIO', group: 'seg', fold: 'sum', noinline: true, make: (k) => fillSeg(k, 'sum'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; s.update(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.query', io: 'doubleIO', group: 'seg', fold: 'sum', noinline: true, make: (k) => fillSeg(k, 'sum'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += s.query(lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.at', io: 'doubleIO', group: 'seg', fold: 'sum', make: (k) => fillSeg(k, 'sum'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += s.at(k & MASK); } sink[si & SINKMASK] = a; } },
    // F11 / S6: setFrom reads the leaf value from a Float64Array INSIDE -> ZERO in BOTH shards,
    // where the plain `update` boxes its double arg. Runs the noinline shard too (F4 lane).
    { id: 'SegmentTree.setFrom', io: 'zero', k: 0, group: 'seg', fold: 'sum', noinline: true, make: (k) => ({ s: fillSeg(k, 'sum'), src: fillStaticSrc(k) }),
      run: (st, IN, base, sink, si) => { const s = st.s, src = st.src; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; s.setFrom(src, k & MASK); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.update/min', io: 'doubleIO', group: 'seg', fold: 'min', make: (k) => fillSeg(k, 'min'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; s.update(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.query/min', io: 'doubleIO', group: 'seg', fold: 'min', make: (k) => fillSeg(k, 'min'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += s.query(lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.update/max', io: 'doubleIO', group: 'seg', fold: 'max', make: (k) => fillSeg(k, 'max'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; s.update(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree.query/gcd', io: 'doubleIO', group: 'seg', fold: 'gcd', make: (k) => fillSeg(k, 'gcd'),
      run: (s, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += s.query(lo, lo + 50); } sink[si & SINKMASK] = a; } },

    // ---- SegmentTree2D (folds) ----
    { id: 'SegmentTree2D.query', io: 'doubleIO', group: 'seg2d', fold: 'sum', make: (k) => fillSeg2d(k, 'sum'),
      run: (st, IN, base, sink, si) => { const s = st.s, sd = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & (sd - 1), c = (k >> 6) & (sd - 1); a += s.query(r, c, r + 8 < sd ? r + 8 : sd - 1, c + 8 < sd ? c + 8 : sd - 1); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree2D.update', io: 'doubleIO', group: 'seg2d', fold: 'sum', make: (k) => fillSeg2d(k, 'sum'),
      run: (st, IN, base, sink, si) => { const s = st.s, sd = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & (sd - 1), c = (k >> 6) & (sd - 1); s.update(r, c, IN[k & INMASK]); a += r; } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree2D.at', io: 'doubleIO', group: 'seg2d', fold: 'sum', make: (k) => fillSeg2d(k, 'sum'),
      run: (st, IN, base, sink, si) => { const s = st.s, sd = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += s.at(k & (sd - 1), (k >> 6) & (sd - 1)); } sink[si & SINKMASK] = a; } },
    { id: 'SegmentTree2D.query/min', io: 'doubleIO', group: 'seg2d', fold: 'min', make: (k) => fillSeg2d(k, 'min'),
      run: (st, IN, base, sink, si) => { const s = st.s, sd = st.side; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const r = k & (sd - 1), c = (k >> 6) & (sd - 1); a += s.query(r, c, r + 8 < sd ? r + 8 : sd - 1, c + 8 < sd ? c + 8 : sd - 1); } sink[si & SINKMASK] = a; } },

    // ---- PersistentSegTree ----
    { id: 'PST.update', io: 'doubleIO', group: 'pst', fold: 'sum', make: (k) => fillPst(k, 'sum'),
      run: (p, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (p.versions >= p.versionCapacity) p.clear(); a += p.update(p.versions - 1, k & MASK, IN[k & INMASK]); } sink[si & SINKMASK] = a; } },
    { id: 'PST.query', io: 'doubleIO', group: 'pst', fold: 'sum', make: (k) => fillPst(k, 'sum'),
      run: (p, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += p.query(0, lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'PST.at', io: 'doubleIO', group: 'pst', fold: 'sum', make: (k) => fillPst(k, 'sum'),
      run: (p, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += p.at(0, k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'PST.query/min', io: 'doubleIO', group: 'pst', fold: 'min', make: (k) => fillPst(k, 'min'),
      run: (p, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += p.query(0, lo, lo + 50); } sink[si & SINKMASK] = a; } },

    // ---- ordered maps: KEYED by the kind input (F10 blindness fix) ----
    ...mapLanes('Treap', Treap, 'treap', ['get', 'has', 'set', 'delete', 'successor', 'predecessor', 'rank', 'select']),
    ...mapLanes('Scapegoat', Scapegoat, 'scapegoat', ['get', 'has', 'set', 'delete', 'successor', 'predecessor', 'rank', 'select']),
    ...mapLanes('SkipList', SkipList, 'skiplist', ['get', 'set', 'delete', 'successor', 'predecessor'], 0x9E3779B9),
    ...mapLanes('SplayTree', SplayTree, 'splay', ['get', 'set', 'delete', 'successor', 'predecessor']),
    ...mapLanes('SortedArray', SortedArray, 'sortedarray', ['get', 'has', 'set', 'delete', 'successor', 'predecessor', 'rank', 'select']),
    // SortedArray extras: min / max (O(1) reads, return a double)
    { id: 'SortedArray.min', io: 'doubleIO', group: 'sortedarray', make: (k) => orderedMapKeyed(SortedArray, k),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = t.min(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'SortedArray.max', io: 'doubleIO', group: 'sortedarray', make: (k) => orderedMapKeyed(SortedArray, k),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = t.max(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    // keyAt returns the kind KEY double (k=1); valueAt returns the stored int (k=0).
    { id: 'SortedArray.keyAt', io: 'doubleIO', k: 1, group: 'sortedarray', make: (k) => orderedMapKeyed(SortedArray, k),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.keyAt(k & MASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'SortedArray.valueAt', io: 'zero', k: 0, group: 'sortedarray', make: (k) => orderedMapKeyed(SortedArray, k),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = t.valueAt(k & MASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },

    // ---- MinMaxHeap ----
    { id: 'MinMaxHeap.push/popMin', io: 'doubleIO', group: 'minmax', make: fillMinMax,
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'MinMaxHeap.popMax', io: 'doubleIO', group: 'minmax', make: fillMinMax,
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMax(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'MinMaxHeap.peekMinKey', io: 'doubleIO', group: 'minmax', make: fillMinMax,
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMinKey(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'MinMaxHeap.peekMaxKey', io: 'doubleIO', group: 'minmax', make: fillMinMax,
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMaxKey(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },

    // ---- BinomialHeap ----
    { id: 'BinomialHeap.push/popMin', io: 'doubleIO', group: 'binomial', make: (k) => fillHeap(BinomialHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'BinomialHeap.peekMinKey', io: 'doubleIO', group: 'binomial', make: (k) => fillHeap(BinomialHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMinKey(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'BinomialHeap.peekMin', io: 'zero', k: 0, group: 'binomial', make: (k) => fillHeap(BinomialHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMin(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    // meld churn (nit c): a donor is refreshed ALLOC-FREE (reset its own pool cursor
    // fields, as PerfGate binhMeldChurn does) with 8 kind keys, melded, then drained.
    // Only the push key is a double crossing the boundary -> B (k=1); meld itself carries
    // no double. Amortized over 8 pushes per meld.
    { id: 'BinomialHeap.meld', io: 'doubleIO', group: 'binomial', make: () => { const [acc, donor] = BinomialHeap.arena(4096, 'min', 2); return { acc, donor }; },
      run: (st, IN, base, sink, si) => { const acc = st.acc, donor = st.donor; let a = 0; for (let j = 0; j < (CHUNK >> 3); j++) { const x = (base + (j << 3)) | 0; donor._consumed = false; donor._head = 0; donor._min = 0; donor._n = 0; for (let q = 0; q < 8; q++) donor.push((x + q) & MASK, IN[(x + q) & INMASK]); acc.meld(donor); for (let q = 0; q < 8; q++) a += acc.popMin(); } sink[si & SINKMASK] = a; } },

    // ---- PairingHeap ----
    { id: 'PairingHeap.push/popMin', io: 'doubleIO', group: 'pairing', make: (k) => fillHeap(PairingHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    // decreaseKey: push a SMI anchor (1<<30, above all in-range kinds) so decreaseKey is
    // the ONLY double crossing (k=1). p31 / p53 / p30 exceed the Smi anchor (cannot be
    // decreased TO from a Smi), so this lane runs int / frac / n31 only.
    { id: 'PairingHeap.decreaseKey', io: 'doubleIO', k: 1, kinds: ['int', 'frac', 'n31'], group: 'pairing', make: (k) => { const h = new PairingHeap(CAP, 'min'); for (let i = 0; i < CAP; i++) h.push(i, 1 << 30); return h; },
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, 1 << 30); h.decreaseKey(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'PairingHeap.keyOf', io: 'doubleIO', group: 'pairing', make: (k) => fillHeap(PairingHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = h.keyOf(k & MASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'PairingHeap.remove', io: 'doubleIO', group: 'pairing', make: (k) => fillHeap(PairingHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = k & MASK; if (h.remove(id)) h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'PairingHeap.peekMin', io: 'zero', k: 0, group: 'pairing', make: (k) => fillHeap(PairingHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMin(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'PairingHeap.has', io: 'zero', k: 0, group: 'pairing', make: (k) => fillHeap(PairingHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (h.has(k & MASK)) a += 1; } sink[si & SINKMASK] = a; } },

    // ---- FibonacciHeap ----
    { id: 'FibonacciHeap.push/popMin', io: 'doubleIO', group: 'fib', make: (k) => fillHeap(FibonacciHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'FibonacciHeap.decreaseKey', io: 'doubleIO', k: 1, kinds: ['int', 'frac', 'n31'], group: 'fib', make: (k) => { const h = new FibonacciHeap(CAP, 'min'); for (let i = 0; i < CAP; i++) h.push(i, 1 << 30); return h; },
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = h.popMin(); h.push(id, 1 << 30); h.decreaseKey(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'FibonacciHeap.keyOf', io: 'doubleIO', group: 'fib', make: (k) => fillHeap(FibonacciHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = h.keyOf(k & MASK); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'FibonacciHeap.remove', io: 'doubleIO', group: 'fib', make: (k) => fillHeap(FibonacciHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const id = k & MASK; if (h.remove(id)) h.push(id, IN[k & INMASK]); a += id; } sink[si & SINKMASK] = a; } },
    { id: 'FibonacciHeap.peekMin', io: 'zero', k: 0, group: 'fib', make: (k) => fillHeap(FibonacciHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const v = h.peekMin(); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'FibonacciHeap.has', io: 'zero', k: 0, group: 'fib', make: (k) => fillHeap(FibonacciHeap, k),
      run: (h, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (h.has(k & MASK)) a += 1; } sink[si & SINKMASK] = a; } },

    // ---- MergeSortTree (static; big, NOT inlined even in a normal shard, so it boxes
    // its value ARGS at the boundary there too -> nk: the normal shard also uses the
    // k-budget, not ZERO. countLE takes 1 double value (k=1); rangeCount takes 2 (k=2). ----
    { id: 'MergeSortTree.countLE', io: 'doubleIO', k: 1, group: 'mst', make: (k) => MergeSortTree.build(fillStaticSrc(k)),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += t.countLE(lo, lo + 50, IN[k & INMASK]); } sink[si & SINKMASK] = a; } },
    { id: 'MergeSortTree.rangeCount', io: 'doubleIO', k: 2, group: 'mst', make: (k) => MergeSortTree.build(fillStaticSrc(k)),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; const va = IN[k & INMASK], vb = IN[(k + 1) & INMASK]; a += t.rangeCount(lo, lo + 50, va < vb ? va : vb, va < vb ? vb : va); } sink[si & SINKMASK] = a; } },

    // ---- WaveletTree (static) ----
    { id: 'WaveletTree.access', io: 'doubleIO', group: 'wt', noinline: true, make: (k) => WaveletTree.build(fillStaticSrc(k)),
      run: (w, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += w.access(k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'WaveletTree.rank', io: 'doubleIO', group: 'wt', make: (k) => WaveletTree.build(fillStaticSrc(k)),
      run: (w, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += w.rank(IN[k & INMASK], k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'WaveletTree.select', io: 'doubleIO', group: 'wt', make: (k) => WaveletTree.build(fillStaticSrc(k)),
      run: (w, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const v = w.select(IN[k & INMASK], 0); a += (v === undefined ? 0 : v); } sink[si & SINKMASK] = a; } },
    { id: 'WaveletTree.quantile', io: 'doubleIO', group: 'wt', noinline: true, make: (k) => WaveletTree.build(fillStaticSrc(k)),
      run: (w, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += w.quantile(lo, lo + 50, 3); } sink[si & SINKMASK] = a; } },
    // F11 / S6: quantileInto writes the k-th value straight into a Float64Array slot -> ZERO in
    // BOTH shards (the plain `quantile` return box is the control). Runs the noinline shard too.
    { id: 'WaveletTree.quantileInto', io: 'zero', k: 0, group: 'wt', noinline: true, make: (k) => ({ w: WaveletTree.build(fillStaticSrc(k)), out: new Float64Array(SINKLEN) }),
      run: (st, IN, base, sink, si) => { const w = st.w, out = st.out; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; w.quantileInto(out, j & SINKMASK, lo, lo + 50, 3); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    // F14 / S6: rebuildFrom reuses the constructed buffers + scratch -> ZERO B/op when the rebuild
    // length equals the constructed length (the ring-snapshot case). rebuild is O(n) per op, so this
    // lane uses a SMALL tree (n=64): the 0-alloc property is size-independent, and a 4096-wide tree
    // rebuilt 16N times would blow the 180 s wall budget. vals is a full-length (n=64) buffer.
    // The FIRST rebuildFrom lazily allocates the worst-case buffers + scratch (one-time); make() warms
    // that here so the MEASURED window is 0 B/op (a harmless first call, as the reviewer requires).
    { id: 'WaveletTree.rebuildFrom', io: 'zero', k: 0, group: 'wt', make: (k) => { const v = makeInputs(k); const s = new Float64Array(64); for (let i = 0; i < 64; i++) s[i] = v[i]; const w = WaveletTree.build(s); w.rebuildFrom(s); return { w, vals: s }; },
      run: (st, IN, base, sink, si) => { const w = st.w, vals = st.vals; let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; w.rebuildFrom(vals); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'WaveletTree.rangeCount', io: 'doubleIO', group: 'wt', make: (k) => WaveletTree.build(fillStaticSrc(k)),
      run: (w, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; const va = IN[k & INMASK], vb = IN[(k + 1) & INMASK]; a += w.rangeCount(lo, lo + 50, va < vb ? va : vb, va < vb ? vb : va); } sink[si & SINKMASK] = a; } },

    // ---- CartesianTree (static) ----
    { id: 'CartesianTree.rangeMin', io: 'doubleIO', group: 'cartesian', make: (k) => CartesianTree.build(fillStaticSrc(k), 'min'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += t.rangeMin(lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'CartesianTree.rangeMinIndex', io: 'zero', group: 'cartesian', make: (k) => CartesianTree.build(fillStaticSrc(k), 'min'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const lo = k & 2047; a += t.rangeMinIndex(lo, lo + 50); } sink[si & SINKMASK] = a; } },
    { id: 'CartesianTree.at', io: 'doubleIO', group: 'cartesian', make: (k) => CartesianTree.build(fillStaticSrc(k), 'min'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.at(k & MASK); } sink[si & SINKMASK] = a; } },

    // ---- LinkCutTree (F3) ----
    { id: 'LCT.setValue', io: 'doubleIO', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; t.setValue(k & MASK, IN[k & INMASK]); a += (k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'LCT.pathAggregate(v)', io: 'doubleIO', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.pathAggregate(k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'LCT.pathAggregate(u,v)', io: 'doubleIO', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.pathAggregate(k & MASK, (k * 3 + 7) & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'LCT.at', io: 'doubleIO', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.at(k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'LCT.findRoot', io: 'zero', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.findRoot(k & MASK); } sink[si & SINKMASK] = a; } },
    { id: 'LCT.cut/link', io: 'zero', group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; const x = 1 + (k & (MASK >> 1)); const p = x >> 1; t.evert(p); t.cut(x); t.link(x, p); a += x; } sink[si & SINKMASK] = a; } },
    // connected(u,v): no double at the boundary (k=0), but it splays (access -> _pull),
    // so it boxes the STORED kind values through the F3+ _pull phi -> RED (A1).
    { id: 'LCT.connected', io: 'zero', k: 0, group: 'lct', fold: 'sum', make: (k) => fillLct(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; if (t.connected(k & MASK, (k * 3 + 7) & MASK)) a += 1; } sink[si & SINKMASK] = a; } },
    // N2 warmed-polymorphic twin of pathAggregate(u,v).
    { id: 'LCT.pathAggregate(u,v)/n2', io: 'doubleIO', group: 'lct-n2', fold: 'sum', warm: 'n2', make: (k) => fillLctN2(k, 'sum'),
      run: (t, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const k = (base + j) | 0; a += t.pathAggregate(k & MASK, (k * 3 + 7) & MASK); } sink[si & SINKMASK] = a; } },
];

// v1.4.0 API lanes exist ONLY when the runtime has the method (they auto-skip when the gate is run
// against a pre-1.4.0 LogN.js, e.g. regenerating G-EXIT-1.3.0.md), so the registry stays runnable
// against either version. Membership is checked on the class prototype -- no instance needed.
const NEW_140 = new Set(['Fenwick.setFrom', 'Fenwick.search', 'Fenwick.searchFrom', 'SegmentTree.setFrom',
    'WaveletTree.quantileInto', 'WaveletTree.rebuildFrom']);
const HAS_140 = typeof Fenwick.prototype.setFrom === 'function' &&
    typeof Fenwick.prototype.search === 'function' &&
    typeof Fenwick.prototype.searchFrom === 'function' &&
    typeof SegmentTree.prototype.setFrom === 'function' &&
    typeof WaveletTree.prototype.quantileInto === 'function' &&
    typeof WaveletTree.prototype.rebuildFrom === 'function';
export const LANES = HAS_140 ? RAW_LANES : RAW_LANES.filter((l) => !NEW_140.has(l.id));

// The kinds a lane runs, honoring the gcd door (frac / n31 skipped), a lane-level
// `kinds` restriction (e.g. decreaseKey excludes p31 / p53 / p30), and the p30
// override (N5, a Chrome-Smi proxy).
export function kindsFor(lane, override) {
    if (override === 'p30') return (lane.kinds && lane.kinds.indexOf('p30') === -1) ? [] : P30_KINDS.slice();
    if (lane.kinds) return lane.kinds.slice();
    return lane.fold === 'gcd' ? GCD_KINDS.slice() : ALL_KINDS.slice();
}

// --- S7k budget (maintainer amendment 2026-09-26), k computed per (lane, KIND) ------
// A non-inlined public call may box once per double ARGUMENT and once per double RETURN,
// no more. k is NOT derived from the kind LABEL (blocker 1): it is the number of values
// that ACTUALLY cross the boundary as non-Smis for THIS kind. Each lane declares its
// signature SIG[id] = [da, ret]: da = count of double VALUE args, ret = the return's
// transform ('none' int/id/count/bool/index/void | 'idv' a stored value returned as-is |
// 'sum' | 'min' | 'max'). A per-kind rule then decides whether each crossing value is a
// Smi:
//   - an ARG or an 'idv' return is a raw kind value: Smi for int / p30, else non-Smi;
//   - a 'sum' return overflows the Smi range even on p30 (a range of ~2^30 values), and
//     stays a Smi only for int (a small window of <= 2^16 values);
//   - a 'min' return is the smallest input: p31 min = 2^31 and n31 min << -2^31 are
//     non-Smi, p30 min = 2^30 and int are Smi;
//   - a 'max' return is the largest input: n31 max = -2^31 and p30 max < 2^31 are Smi
//     (blocker 1), p31 / p53 / frac are non-Smi.
export const ZERO_BUDGET = 2;
const SIG = {
    'BinaryHeap.push/pop': [1, 'none'], 'BinaryHeap.changeKey': [1, 'none'], 'BinaryHeap.topKey': [0, 'min'],
    'BinaryHeap.keyOf': [0, 'idv'], 'BinaryHeap.peek': [0, 'none'], 'BinaryHeap.has': [0, 'none'], 'BinaryHeap.remove': [1, 'none'],
    'Fenwick.set': [1, 'none'], 'Fenwick.update': [1, 'none'], 'Fenwick.prefix': [0, 'sum'], 'Fenwick.rangeSum': [0, 'sum'], 'Fenwick.at': [0, 'idv'],
    // setFrom: value read from a buffer INSIDE -> no double crosses (da=0), returns `this` (none) -> ZERO.
    'Fenwick.setFrom': [0, 'none'], 'SegmentTree.setFrom': [0, 'none'],
    // search: one double target arg (da=1), returns an INDEX int (none). Boxes the arg once (k=1) since
    // it no longer inlines. searchFrom reads the target from a buffer INSIDE -> da=0 -> ZERO both shards.
    'Fenwick.search': [1, 'none'], 'Fenwick.searchFrom': [0, 'none'],
    // quantileInto / rebuildFrom: buffers + ints only (da=0), void / `this` return -> ZERO in both shards.
    'WaveletTree.quantileInto': [0, 'none'], 'WaveletTree.rebuildFrom': [0, 'none'],
    'Fenwick2D.update': [1, 'none'], 'Fenwick2D.set': [1, 'none'], 'Fenwick2D.prefix': [0, 'sum'], 'Fenwick2D.rectSum': [0, 'sum'], 'Fenwick2D.at': [0, 'idv'],
    'SegmentTree.update': [1, 'none'], 'SegmentTree.query': [0, 'sum'], 'SegmentTree.at': [0, 'idv'],
    'SegmentTree.update/min': [1, 'none'], 'SegmentTree.query/min': [0, 'min'], 'SegmentTree.update/max': [1, 'none'],
    'SegmentTree2D.query': [0, 'sum'], 'SegmentTree2D.update': [1, 'none'], 'SegmentTree2D.at': [0, 'idv'], 'SegmentTree2D.query/min': [0, 'min'],
    // gcd of the range is a Smi on every kind this lane runs (int / p31 / p53 / p30 -- verified
    // 2048/2048 by gcdcheck.mjs), so its true k=0; the steady 12 is an INTERNAL segGcd box (A1, F4).
    'SegmentTree.query/gcd': [0, 'none'],
    'PST.update': [1, 'none'], 'PST.query': [0, 'sum'], 'PST.at': [0, 'idv'], 'PST.query/min': [0, 'min'],
    'MinMaxHeap.push/popMin': [1, 'none'], 'MinMaxHeap.popMax': [1, 'none'], 'MinMaxHeap.peekMinKey': [0, 'min'], 'MinMaxHeap.peekMaxKey': [0, 'max'],
    'BinomialHeap.push/popMin': [1, 'none'], 'BinomialHeap.peekMinKey': [0, 'min'], 'BinomialHeap.peekMin': [0, 'none'], 'BinomialHeap.meld': [1, 'none'],
    'PairingHeap.push/popMin': [1, 'none'], 'PairingHeap.decreaseKey': [1, 'none'], 'PairingHeap.keyOf': [0, 'idv'], 'PairingHeap.remove': [1, 'none'], 'PairingHeap.peekMin': [0, 'none'], 'PairingHeap.has': [0, 'none'],
    'FibonacciHeap.push/popMin': [1, 'none'], 'FibonacciHeap.decreaseKey': [1, 'none'], 'FibonacciHeap.keyOf': [0, 'idv'], 'FibonacciHeap.remove': [1, 'none'], 'FibonacciHeap.peekMin': [0, 'none'], 'FibonacciHeap.has': [0, 'none'],
    'MergeSortTree.countLE': [1, 'none'], 'MergeSortTree.rangeCount': [2, 'none'],
    'WaveletTree.access': [0, 'idv'], 'WaveletTree.rank': [1, 'none'], 'WaveletTree.select': [1, 'none'], 'WaveletTree.quantile': [0, 'idv'], 'WaveletTree.rangeCount': [2, 'none'],
    'CartesianTree.rangeMin': [0, 'min'], 'CartesianTree.rangeMinIndex': [0, 'none'], 'CartesianTree.at': [0, 'idv'],
    'LCT.setValue': [1, 'none'], 'LCT.pathAggregate(v)': [0, 'sum'], 'LCT.pathAggregate(u,v)': [0, 'sum'], 'LCT.at': [0, 'idv'],
    'LCT.findRoot': [0, 'none'], 'LCT.cut/link': [0, 'none'], 'LCT.connected': [0, 'none'], 'LCT.pathAggregate(u,v)/n2': [0, 'sum'],
};
// map lanes (Treap / Scapegoat / SkipList / SplayTree / SortedArray) share a signature by op.
const MAP_SIG = { get: [1, 'none'], has: [1, 'none'], set: [1, 'none'], delete: [1, 'none'], successor: [1, 'idv'], predecessor: [1, 'idv'], rank: [1, 'none'], select: [0, 'idv'] };
function sigOf(lane) {
    if (SIG[lane.id]) return SIG[lane.id];
    const dot = lane.id.indexOf('.');
    const op = lane.id.slice(dot + 1);
    if (MAP_SIG[op]) return MAP_SIG[op];
    if (op === 'min') return [0, 'min'];
    if (op === 'max') return [0, 'max'];
    if (op === 'keyAt') return [0, 'idv'];
    if (op === 'valueAt') return [0, 'none'];
    throw new Error('[Kinds] no S7k signature for lane ' + lane.id);
}
function argNonSmi(kind) { return kind === 'frac' || kind === 'p31' || kind === 'n31' || kind === 'p53'; }
function retNonSmi(ret, kind) {
    switch (ret) {
        case 'none': return false;
        case 'idv': return argNonSmi(kind);
        case 'sum': return kind !== 'int';                                   // p30 sum overflows Smi
        case 'min': return kind === 'frac' || kind === 'p31' || kind === 'p53' || kind === 'n31';
        case 'max': return kind === 'frac' || kind === 'p31' || kind === 'p53'; // n31 max = -2^31 (Smi), p30 max < 2^31 (Smi)
        default: return false;
    }
}
// k for a specific (lane, kind, SHARD): the non-Smi doubles that ACTUALLY cross the
// boundary in that shard's inlining state (blocker 1). da value args + a non-Smi return.
// In a NORMAL (inlined-caller) shard, a value RETURN from a call that ALSO takes a double
// ARG is consumed inline and does NOT box -- so successor / predecessor (da=1, ret=value)
// cross 1 in normal but 2 under ni-. Verified against r4/audit.mjs (SkipList / SplayTree /
// SortedArray successor/predecessor: 12 normal / 24-25 ni-).
export function laneK(lane, kind, isNoinline) {
    const [da, ret] = sigOf(lane);
    // `argKindless`: the lane's double ARG does NOT track the kind -- it is ALWAYS non-Smi
    // (Fenwick.search feeds a sampling target u*total, fractional for every kind), so it crosses as
    // a box in the ni- shard regardless of `kind`.
    const argC = (lane.argKindless || argNonSmi(kind)) ? da : 0;
    let retC = retNonSmi(ret, kind) ? 1 : 0;
    if (!isNoinline && da >= 1 && (ret === 'idv' || ret === 'min' || ret === 'max')) retC = 0; // return elided when the caller inlines
    return argC + retC;
}
// S7k budget: k=0 is the ROADMAP ZERO (2), so even a box-every-other-op (reads ~6) or
// box-every-third-op (reads ~4) FAILS on a supposedly-clean path; k>=1 is
// floor((k + 0.5) * B1) so k boxes pass but box k+1 always fails (the corrected amendment;
// the old 1.5*k*B1 let a k=2 lane carry three boxes, and floor(0.5*B1)=6 let a half-box
// pass on a k=0 path). Every clean k=0 cell reads 0, so ZERO=2 costs nothing.
export function budgetK(k, B1) { return k === 0 ? ZERO_BUDGET : Math.floor((k + 0.5) * B1); }

// BOUNDARY (nit a): the DEFAULT normal-shard budget is ZERO. A lane earns the k-budget in
// the normal shard ONLY by appearing here (it boxes a legitimate boundary amount even in
// a normal process); everything else -- including any NEW lane -- is gated at ZERO, so a
// one-box regression on an inlined path fails loudly. A boundary-only (B) lane reads <= k
// and PASSES; a library-internal (A) defect that also lands here reads >> k and FAILS. In
// the ni- shard the boundary is never inlined away, so EVERY lane gets the k-budget.
// Membership is the set of lanes observed to box (> 0) in the 1.3.0 normal shards.
export const BOUNDARY = new Set([
    'BinaryHeap.topKey', 'BinaryHeap.keyOf',
    // Fenwick.search is NOT in BOUNDARY: the tiny stage-slot-and-delegate body inlines in a normal
    // process (reads 0, gated at ZERO), and its one target arg boxes only under ni- (k=1, argKindless,
    // handled by laneK for the ni- shard). searchFrom is 0 in both shards (reads the target inside).
    'Fenwick2D.set', 'Fenwick2D.rectSum',
    'SegmentTree.update', 'SegmentTree.query', 'SegmentTree.update/min', 'SegmentTree.query/min', 'SegmentTree.update/max',
    'SegmentTree2D.query', 'SegmentTree2D.update', 'SegmentTree2D.query/min',
    'PST.update', 'PST.query', 'PST.query/min',
    'Treap.set', 'Treap.delete', 'Treap.successor', 'Treap.predecessor', 'Treap.select',
    'Scapegoat.set', 'Scapegoat.delete', 'Scapegoat.successor', 'Scapegoat.predecessor', 'Scapegoat.select',
    'SkipList.delete', 'SkipList.successor', 'SkipList.predecessor',
    'SplayTree.delete', 'SplayTree.successor', 'SplayTree.predecessor',
    'SortedArray.successor', 'SortedArray.predecessor', 'SortedArray.select', 'SortedArray.min', 'SortedArray.max', 'SortedArray.keyAt',
    'MinMaxHeap.push/popMin', 'MinMaxHeap.popMax', 'MinMaxHeap.peekMinKey', 'MinMaxHeap.peekMaxKey',
    'BinomialHeap.push/popMin', 'BinomialHeap.peekMinKey', 'BinomialHeap.meld',
    'PairingHeap.decreaseKey', 'PairingHeap.keyOf', 'FibonacciHeap.keyOf',
    'MergeSortTree.countLE', 'MergeSortTree.rangeCount',
    'WaveletTree.access', 'WaveletTree.rank', 'WaveletTree.select', 'WaveletTree.quantile',
    // F3 CLOSED LCT.setValue and LCT.pathAggregate(v) to 0 in the normal shard (they no longer box a
    // boundary amount), so they LEAVE BOUNDARY and are gated at ZERO -- the stale-BOUNDARY check
    // (Kinds.test.mjs) forced this removal. pathAggregate(u, v) still carries its single S7 return box
    // (~13, within the k=1 budget), so it stays.
    'LCT.pathAggregate(u,v)', 'LCT.pathAggregate(u,v)/n2',
]);
// Removed (stage-G QA item 4): SegmentTree.query/gcd ([0,none]), LCT.findRoot / cut/link /
// connected ([0,none]) all have k=0 for EVERY kind and shard, so being in BOUNDARY changed
// no budget (k=0 -> ZERO either way) and the k>=1 stale check could never flag them. A
// BOUNDARY entry that is k=0 in every (kind, shard) is meaningless; staleZeroBoundary() below
// enumerates any such entry and Harness.test.mjs fails statically if one exists.

export function budgetFor(lane, kind, isNoinline, B1) {
    // Default-safe: in the NORMAL shard a lane not in BOUNDARY is gated at k=0 (budget
    // ZERO_BUDGET = 2), so a one-box regression on an inlined path fails and a new lane
    // cannot silently earn the looser budget. Otherwise the per-(lane,kind,shard) k.
    const k = (!isNoinline && !BOUNDARY.has(lane.id)) ? 0 : laneK(lane, kind, isNoinline);
    return budgetK(k, B1);
}

// --- DEFERRED (ROADMAP 8.4 gate policy) --------------------------------------
// The 1.4.0 consumer release fixes F3 / F4 / F10(WT popcount) / PST._query / F15(BinaryHeap) and
// ships the new APIs, but DEFERS the rest of H1 (F7 sum bounds, F10 Treap/Scapegoat succ/pred/_ceil,
// F15 MinMaxHeap, F16 delete) to 1.4.1. Each lane still RED ONLY because its fix is deferred goes
// here, keyed 'lane|kind|shard' -> its F-id. Semantics (enforced in Kinds.test.mjs):
//   - a DEFERRED cell that is RED   -> PASSES the gate, PRINTED as deferred on every run;
//   - a DEFERRED cell that is GREEN -> FAILS ("remove from DEFERRED") so the list only SHRINKS;
//   - a cell RED and NOT deferred   -> FAILS as usual.
// 1.4.1 must empty this map. torture's G9 keeps its OWN copy of the same policy + F-ids (a small
// `G9_DEFERRED` map keyed the same `id|kind` way; torture is a normal-tier process with only the
// Treap.successor lanes still red), so the two lists are mirrored, not imported. A shard id is the group name
// in the kinds run ('treap', 'minmax', ...) and 'ni-'+group in the noinline run.
// Only the non-Smi kinds box (int / p30 stay Smis -> green), so a deferred op is deferred exactly
// on frac / p31 / n31 / p53. `def(fid, shard, ...ids)` expands one op to its four kind cells.
const DEFERRED_KINDS = ['frac', 'p31', 'n31', 'p53'];
function def(fid, shard, ...ids) {
    const out = [];
    for (const id of ids) for (const k of DEFERRED_KINDS) out.push([id + '|' + k + '|' + shard, fid]);
    return out;
}
export const DEFERRED = new Map([
    // F10: Treap / Scapegoat successor / predecessor keep a `best = undefined` phi that boxes the
    // returned key (RED in the normal AND ni- shards). Fixed in 1.4.1 (integer slot + K[bs] return).
    ...def('F10', 'treap', 'Treap.successor', 'Treap.predecessor'),
    ...def('F10', 'scapegoat', 'Scapegoat.successor', 'Scapegoat.predecessor'),
    ...def('F10', 'ni-treap', 'Treap.successor', 'Treap.predecessor'),
    ...def('F10', 'ni-scapegoat', 'Scapegoat.successor', 'Scapegoat.predecessor'),
    // F16: Treap / Scapegoat delete's key phi / return boxes in the normal shard (green when not
    // inlined). Fixed in 1.4.1 (delete-path key slot).
    ...def('F16', 'treap', 'Treap.delete'),
    ...def('F16', 'scapegoat', 'Scapegoat.delete'),
    // F15: MinMaxHeap popMin / popMax pass the key double into their non-inlined sift helper (RED
    // only under ni-). Fixed in 1.4.1 (pass the slot, as BinaryHeap now does).
    ...def('F15', 'ni-minmax', 'MinMaxHeap.push/popMin', 'MinMaxHeap.popMax'),
]);

// The F-id a (lane, kind, shard) cell is deferred under, or undefined if not deferred.
export function deferralFor(id, kind, shard) {
    return DEFERRED.get(id + '|' + kind + '|' + shard);
}

// --- drift guard derived from the registry's max k (stage-G QA item 2) --------
// The end-of-shard teeth re-check admits a scale in [1-g, 1+g] x B1. Box k+1 must still
// FAIL the k budget at the WORST admitted (smallest) scale, for every k the registry
// declares. budgetK(k, B1) ~ (k+0.5)*B1 and a box reads ~B1, so at scale (1-g):
//     (k+1)*(1-g) > (k+0.5)   <=>   g < 0.5 / (k+1)
// The tightest bound is at kMax, so g < 0.5 / (kMax+1). Pick the largest 0.05 step
// STRICTLY below that bound: kMax=2 -> 0.15, kMax=3 -> 0.10 (auto-tightens). Also compute
// budgets from min(B1, B1late) (the conservative scale) so a downward drift never loosens.
export function driftGuardFor(kMax) {
    const bound = 0.5 / (kMax + 1);
    let g = Math.floor(bound / 0.05) * 0.05;
    if (g >= bound) g -= 0.05;               // strict inequality
    return Math.round(g * 100) / 100;        // kill float dust (0.15, not 0.150000002)
}
export function registryKMax() {
    let k = 0;
    for (const l of LANES) {
        for (const kind of ALL_KINDS.concat(P30_KINDS)) {
            k = Math.max(k, laneK(l, kind, false), laneK(l, kind, true));
        }
    }
    return k;
}
export const DRIFT_GUARD = driftGuardFor(registryKMax());

// A BOUNDARY entry whose k is 0 for EVERY kind (both shards) earns no looser budget and
// can never trip the k>=1 stale check -- it is a dead entry. Harness.test.mjs asserts this
// list is empty (a static stale check, complementing the runtime "reads ~0" one).
export function staleZeroBoundary() {
    const dead = [];
    for (const id of BOUNDARY) {
        const lane = LANES.find((l) => l.id === id);
        if (!lane) continue;                 // unknown-lane check lives elsewhere
        let kMax = 0;
        for (const kind of ALL_KINDS.concat(P30_KINDS)) {
            kMax = Math.max(kMax, laneK(lane, kind, false), laneK(lane, kind, true));
        }
        if (kMax === 0) dead.push(id);
    }
    return dead;
}

// --- shard registry (G6) ----------------------------------------------------
// Every measuring shard pins new-space (--min == --max semi-space) so the one-box
// scale does not drift, and runs single-tier (--no-concurrent-recompilation) so a
// background recompile cannot flip a lane's boxing between runs (reviewer: 12<->662).
const MEASURE_FLAGS = ['--max-semi-space-size=4', '--min-semi-space-size=4', '--no-concurrent-recompilation'];
const GROUPS = ['binheap', 'fenwick', 'fenwick2d', 'seg', 'seg2d', 'pst', 'treap',
    'scapegoat', 'skiplist', 'splay', 'sortedarray', 'minmax', 'binomial', 'pairing',
    'fib', 'mst', 'wt', 'cartesian', 'lct'];

const NOINLINE_FLAGS = MEASURE_FLAGS.concat(['--max-inlined-bytecode-size=0']);
export const SHARDS = {};
for (const g of GROUPS) SHARDS[g] = { groups: [g], flags: MEASURE_FLAGS.slice() };
SHARDS['lct-n2'] = { groups: ['lct-n2'], flags: MEASURE_FLAGS.slice() };
// N5: p30 runs the FULL lane set (every group) with kind p30.
SHARDS['p30'] = { groups: GROUPS.slice(), flags: MEASURE_FLAGS.slice(), kinds: 'p30' };
// N3: the non-inlined consumer runs the FULL matrix, but PARALLELIZED one child per
// member group (a single serial noinline process over all groups blows the 180 s
// wall budget). Reviewer: BinaryHeap push/pop reads 49 under noinline -- a real
// finding, so noinline is the full matrix, not a 3-lane subset.
for (const g of GROUPS.concat(['lct-n2'])) SHARDS['ni-' + g] = { groups: [g], flags: NOINLINE_FLAGS.slice() };

export const SHARDS_KINDS = GROUPS.concat(['lct-n2', 'p30']);
export const SHARDS_NOINLINE = GROUPS.concat(['lct-n2']).map((g) => 'ni-' + g);

// Select the lanes a shard runs.
export function lanesForShard(shardId) {
    const sh = SHARDS[shardId];
    if (!sh) throw new Error('[Kinds] unknown shard: ' + String(shardId));
    return LANES.filter((l) => sh.groups.indexOf(l.group) !== -1);
}

// The exact number of lane x kind cells a shard is expected to emit (G8 emptiness /
// count check in Lanes.mjs). Computed from the registry, not hard-coded.
export function expectedCells(shardId) {
    const sh = SHARDS[shardId];
    const override = sh.kinds;
    let n = 0;
    for (const l of lanesForShard(shardId)) n += kindsFor(l, override).length;
    return n;
}

// --- QA self-test injection hook (DEFAULT OFF) -------------------------------
// LOGN_INJECT=<absolute path to an ESM module>. Its default export is called ONCE,
// before any measurement, with the mutable registries, so test/perf/Harness.test.mjs
// can add scratch lanes / shards / BOUNDARY entries and prove the gate's teeth. No npm
// script sets it, and Lanes.mjs DELETES it from every child env, so the orchestrated
// kinds / noinline runs can never be injected. An injected process says so on stdout.
export const INJECTED = process.env.LOGN_INJECT || '';
if (INJECTED) {
    process.stdout.write('INJECT\t' + INJECTED + '\n');
    const m = await import(pathToFileURL(INJECTED).href);
    m.default({ LANES, BOUNDARY, SIG, SHARDS, MEASURE_FLAGS, NOINLINE_FLAGS, CHUNK, INMASK, SINKMASK, DEFERRED });
}
